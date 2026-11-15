"""Run-time behaviour on a small container: the tool version probe, a clean
stop on SIGTERM, the worker count and a mistyped FSL_PUBLIC_VIEW."""
from __future__ import annotations

import http.client
import json
import os
import signal
import socket
import stat
import subprocess
import sys
import tempfile
import threading
import time
import unittest
from pathlib import Path
from unittest import mock

APP_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(APP_ROOT))

_ENV_KEYS = ("FSL_OWNER_EMAIL", "FSL_OWNER_PASSWORD", "FSL_DB_PATH", "FSL_EVIDENCE_DIR",
             "FSL_PUBLIC_VIEW", "FSL_WORKER_CONCURRENCY", "FSL_CLIENT_IP_HEADER",
             "FSL_TRUSTED_PROXY_HOPS", "FSL_PRIVDROP_FAILED", "FSL_NO_WORKER", "PORT")


def boot(env: dict | None = None):
    tmp = Path(tempfile.mkdtemp(prefix="fsl-runtime-"))
    for key in _ENV_KEYS:
        os.environ.pop(key, None)
    os.environ["FSL_DATA_DIR"] = str(tmp)
    os.environ.update({"FSL_OWNER_EMAIL": "owner@test.local",
                       "FSL_OWNER_PASSWORD": "correct-horse-battery"})
    os.environ.update(env or {})
    from app.config import Config, reset_config_for_tests
    from app.db import Database, reset_db_for_tests
    cfg = Config.from_env()
    reset_config_for_tests(cfg)
    reset_db_for_tests(Database(cfg.db_path))
    from app.bootstrap import init_platform
    return cfg, init_platform(sync_tools=False)


class EnvCase(unittest.TestCase):
    def setUp(self):
        env = mock.patch.dict(os.environ)
        env.start()
        self.addCleanup(env.stop)


def fake_tool(directory: Path, name: str, body: str) -> str:
    path = directory / name
    path.write_text("#!/bin/sh\n" + body)
    path.chmod(path.stat().st_mode | stat.S_IXUSR)
    return str(path)


class TestVersionProbe(EnvCase):
    def setUp(self):
        super().setUp()
        self.dir = Path(tempfile.mkdtemp(prefix="fsl-probe-"))
        from app.connectors.base import Connector
        self.conn = Connector()

    def test_first_line_of_a_command_that_succeeds(self):
        tool = fake_tool(self.dir, "ok", 'echo "tool 1.2.3"; echo "second line"\n')
        self.assertEqual(self.conn._probe_version(tool), "tool 1.2.3")

    def test_the_spelling_that_works_is_found(self):
        tool = fake_tool(self.dir, "second", '[ "$1" = "version" ] && { echo "v9"; exit 0; }\n'
                                             'echo "unknown flag $1" >&2; exit 2\n')
        self.assertEqual(self.conn._probe_version(tool), "v9")

    def test_the_output_of_a_failed_command_is_not_a_version(self):
        tool = fake_tool(self.dir, "broken",
                         'echo "[ERROR]: Cannot create auto config when metrics are off."; exit 2\n')
        self.assertEqual(self.conn._probe_version(tool), "unknown")
        missing = fake_tool(self.dir, "noexec", "exec /nonexistent/interpreter\n")
        self.assertEqual(self.conn._probe_version(missing), "unknown")

    def test_a_command_that_does_not_answer_is_stopped_with_what_it_started(self):
        from app.connectors import base
        marker = self.dir / "calls"
        pidfile = self.dir / "child.pid"
        tool = fake_tool(self.dir, "slow", f'echo "$1" >> "{marker}"\n'
                                            f'sleep 60 &\necho $! > "{pidfile}"\nwait\n')
        started = time.monotonic()
        with mock.patch.object(base, "PROBE_TIMEOUT_SECONDS", 0.5):
            self.assertEqual(self.conn._probe_version(tool), "unknown")
        self.assertLess(time.monotonic() - started, 8)
        # Slow is not a wrong flag: the other spellings were not tried.
        self.assertEqual(marker.read_text().split(), ["--version"])
        # The process it started is gone too.
        child = int(pidfile.read_text())
        deadline = time.monotonic() + 5
        alive = True
        while alive and time.monotonic() < deadline:
            try:
                os.kill(child, 0)
                with open(f"/proc/{child}/stat") as fh:
                    alive = fh.read().split(")")[-1].split()[0] != "Z"
            except (ProcessLookupError, FileNotFoundError):
                alive = False
            time.sleep(0.05)
        self.assertFalse(alive, "the probe's child kept running")

    def test_the_timeout_fits_a_small_instance(self):
        from app.connectors import base
        self.assertGreaterEqual(base.PROBE_TIMEOUT_SECONDS, 30)


class TestPublicViewValue(EnvCase):
    def test_yes_and_no_values(self):
        from app.config import Config
        for value, on, odd in (("1", True, False), ("true", True, False), (" YES ", True, False),
                               ("on", True, False), ("١", True, False),
                               ("0", False, False), ("", False, False), ("off", False, False),
                               ("no", False, False), ("false", False, False),
                               ("enabled", False, True), ("2", False, True), ("٢", False, True)):
            with mock.patch.dict(os.environ, {"FSL_PUBLIC_VIEW": value}):
                cfg = Config.from_env()
                self.assertEqual((cfg.public_view, cfg.public_view_unrecognized), (on, odd), value)
        os.environ.pop("FSL_PUBLIC_VIEW", None)
        cfg = Config.from_env()
        self.assertEqual((cfg.public_view, cfg.public_view_unrecognized), (False, False))

    def test_a_value_that_is_not_understood_is_reported_where_the_owner_reads_it(self):
        from app import server
        from app.bootstrap import describe_notice
        cfg, info = boot({"FSL_PUBLIC_VIEW": "enabled"})
        self.assertFalse(cfg.public_view)
        self.assertIn("public_view_unrecognized", info["setup_notices"])
        status, body = server.config_public(server.Req(None, {}, {}, {}))
        self.assertEqual(status, 200)
        self.assertIn("public_view_unrecognized", body["setup_notices"])
        self.assertIs(body["public_view"], False)
        self.assertIn("FSL_PUBLIC_VIEW", describe_notice("public_view_unrecognized"))
        # The console has a text for it in both languages.
        js = (APP_ROOT / "web" / "app.js").read_text(encoding="utf-8")
        self.assertEqual(js.count("public_view_unrecognized:"), 2)
        _cfg, info = boot({"FSL_PUBLIC_VIEW": "1"})
        self.assertNotIn("public_view_unrecognized", info["setup_notices"])


class TestWorkerCount(EnvCase):
    def test_at_least_one_worker(self):
        from app.config import Config
        for value, expected in (("1", 1), ("3", 3), ("0", 1), ("-3", 1)):
            with mock.patch.dict(os.environ, {"FSL_WORKER_CONCURRENCY": value}):
                self.assertEqual(Config.from_env().limits.worker_concurrency, expected, value)


class TestStopSignal(unittest.TestCase):
    def test_sigterm_stops_the_server_promptly_and_cleanly(self):
        data = tempfile.mkdtemp(prefix="fsl-sigterm-")
        env = {k: v for k, v in os.environ.items() if not k.startswith("FSL_")}
        env.update({"FSL_DATA_DIR": data, "FSL_BIND_HOST": "127.0.0.1", "PORT": "0",
                    "FSL_OWNER_EMAIL": "owner@test.local",
                    "FSL_OWNER_PASSWORD": "correct-horse-battery", "FSL_NO_WORKER": "1",
                    "PYTHONUNBUFFERED": "1"})
        proc = subprocess.Popen([sys.executable, "-m", "app.server"], cwd=str(APP_ROOT), env=env,
                                stdout=subprocess.DEVNULL, stderr=subprocess.PIPE, text=True)
        try:
            lines = []
            deadline = time.monotonic() + 60
            while time.monotonic() < deadline:
                line = proc.stderr.readline()
                if not line:
                    break
                lines.append(line)
                if line.startswith("[serve] http://"):
                    break
            self.assertTrue(lines and lines[-1].startswith("[serve] http://"), "".join(lines))
            time.sleep(0.5)                       # serve_forever has been entered
            started = time.monotonic()
            proc.send_signal(signal.SIGTERM)
            code = proc.wait(timeout=15)
            self.assertEqual(code, 0)
            self.assertLess(time.monotonic() - started, 10)
            self.assertIn("stop signal received", proc.stderr.read())
        finally:
            if proc.poll() is None:
                proc.kill()
                proc.wait(10)
            proc.stderr.close()


class TestPublicViewDefaultsOnForTheServer(unittest.TestCase):
    """The running server opens the public read-only view by default, so the
    hosted site shows the interface with no sign-in screen. The config/library
    default stays off; only `app.server` main() flips it on, and FSL_PUBLIC_VIEW=0
    still turns it off."""

    @staticmethod
    def _free_port():
        import socket
        s = socket.socket()
        s.bind(("127.0.0.1", 0))
        port = s.getsockname()[1]
        s.close()
        return port

    def _config_of_a_fresh_server(self, public_env):
        port = self._free_port()
        data = tempfile.mkdtemp(prefix="fsl-pubdef-")
        env = {k: v for k, v in os.environ.items() if not k.startswith("FSL_")}
        env.update({"FSL_DATA_DIR": data, "FSL_BIND_HOST": "127.0.0.1", "FSL_PORT": str(port),
                    "FSL_OWNER_EMAIL": "owner@test.local",
                    "FSL_OWNER_PASSWORD": "correct-horse-battery", "FSL_NO_WORKER": "1",
                    "PYTHONUNBUFFERED": "1"})
        env.pop("PORT", None)
        if public_env is not None:
            env["FSL_PUBLIC_VIEW"] = public_env
        proc = subprocess.Popen([sys.executable, "-m", "app.server"], cwd=str(APP_ROOT), env=env,
                                stdout=subprocess.DEVNULL, stderr=subprocess.PIPE, text=True)
        try:
            ready, deadline = False, time.monotonic() + 60
            while time.monotonic() < deadline:
                line = proc.stderr.readline()
                if not line:
                    break
                if line.startswith("[serve] http://"):
                    ready = True
                    break
            self.assertTrue(ready, "server did not start")
            body = None
            for _ in range(20):                      # small accept window after bind
                try:
                    conn = http.client.HTTPConnection("127.0.0.1", port, timeout=10)
                    conn.request("GET", "/api/config")
                    body = json.loads(conn.getresponse().read())
                    conn.close()
                    break
                except OSError:
                    time.sleep(0.25)
            self.assertIsNotNone(body, "could not reach /api/config")
            return body
        finally:
            proc.send_signal(signal.SIGTERM)
            try:
                proc.wait(timeout=15)
            except subprocess.TimeoutExpired:
                proc.kill()
                proc.wait(10)
            proc.stderr.close()

    def test_defaults_on_when_unset(self):
        self.assertIs(self._config_of_a_fresh_server(None)["public_view"], True)

    def test_off_when_explicitly_disabled(self):
        self.assertIs(self._config_of_a_fresh_server("0")["public_view"], False)


# ---------------------------------------------------------------------------
# What is accepted before the sender is known, over real HTTP
# ---------------------------------------------------------------------------
class LiveCase(EnvCase):
    ENV: dict = {}

    def setUp(self):
        super().setUp()
        from app import server
        self.cfg, _info = boot(dict(self.ENV))
        server.reset_login_throttle_for_tests()
        server._GUEST_HITS.clear()
        server._GUEST_GLOBAL[:] = [0.0, 0]
        self.srv = server.build_server("127.0.0.1", 0)
        self.port = self.srv.server_address[1]
        threading.Thread(target=self.srv.serve_forever, daemon=True).start()
        self.addCleanup(self._stop)

    def _stop(self):
        self.srv.shutdown()
        self.srv.server_close()

    def call(self, method, path, *, token=None, body=None, raw_body=None, headers=()):
        conn = http.client.HTTPConnection("127.0.0.1", self.port, timeout=20)
        try:
            conn.putrequest(method, path)
            data = raw_body
            if body is not None:
                data = json.dumps(body).encode("utf-8")
            if data is not None:
                conn.putheader("Content-Type", "application/json")
                conn.putheader("Content-Length", str(len(data)))
            if token:
                conn.putheader("Authorization", f"Bearer {token}")
            for name, value in headers:
                conn.putheader(name, value)
            try:
                conn.endheaders(data)
            except (BrokenPipeError, ConnectionResetError):
                # The server refused the request and closed the socket before we
                # finished pushing the body (e.g. a large body from someone who
                # is not signed in is never read). http.client has already moved
                # the request to the "sent" state, and the response the server
                # wrote is still waiting on the connection, so read it below.
                pass
            resp = conn.getresponse()
            raw = resp.read()
            try:
                parsed = json.loads(raw.decode("utf-8"))
            except ValueError:
                parsed = raw.decode("utf-8", "replace")
            return resp.status, parsed, resp.getheader("Connection")
        finally:
            conn.close()

    def owner_token(self):
        from app import auth
        return auth.login("owner@test.local", "correct-horse-battery")["token"]


class TestRequestTarget(LiveCase):
    def test_a_long_request_target_is_refused_before_it_is_parsed(self):
        from app import server
        self.assertEqual(server.MAX_TARGET_BYTES, 2048)
        long_query = "a=1&" * 15000                    # 60 KB
        with mock.patch.object(server, "parse_qs", wraps=server.parse_qs) as parse, \
                mock.patch.object(server, "urlsplit", wraps=server.urlsplit) as split:
            for path in ("/api/health?" + long_query, "/?" + long_query,
                         "/api/projects?" + long_query, "/app.js?" + long_query,
                         "/api/" + "x" * 3000):
                status, body, _ = self.call("GET", path)
                self.assertEqual((status, body["error"]["code"]), (414, "uri_too_long"), path[:30])
            self.assertEqual((parse.call_count, split.call_count), (0, 0))
        # Exactly at the limit is served; one more is not.
        base = "/api/health?x="
        status, body, _ = self.call("GET", base + "y" * (server.MAX_TARGET_BYTES - len(base)))
        self.assertEqual((status, body["ok"]), (200, True))
        self.assertEqual(self.call("GET", base + "y" * (server.MAX_TARGET_BYTES - len(base) + 1))[0], 414)

    def test_too_many_parameters_are_refused(self):
        from app import server
        many = "&".join(f"k{i}=1" for i in range(server.MAX_QUERY_FIELDS + 1))
        status, body, _ = self.call("GET", "/api/health?" + many)
        self.assertEqual((status, body["error"]["code"]), (400, "validation_error"))
        few = "&".join(f"k{i}=1" for i in range(server.MAX_QUERY_FIELDS))
        self.assertEqual(self.call("GET", "/api/health?" + few)[0], 200)

    def test_the_query_is_not_parsed_for_a_static_file_or_an_unknown_route(self):
        from app import server
        with mock.patch.object(server, "parse_qs", wraps=server.parse_qs) as parse:
            self.assertEqual(self.call("GET", "/?a=1&b=2")[0], 200)
            self.assertEqual(self.call("GET", "/api/nope?a=1&b=2")[0], 404)
            self.assertEqual(parse.call_count, 0)
            self.assertEqual(self.call("GET", "/api/health?a=1")[0], 200)
            self.assertEqual(parse.call_count, 1)


class TestRequestBody(LiveCase):
    def test_a_body_is_not_read_from_someone_who_is_not_signed_in(self):
        from app import server
        big = b'{"x": "' + b"a" * (1024 * 1024) + b'"}'
        real_read = server.Handler._read_body
        with mock.patch.object(server.Handler, "_read_body", autospec=True,
                               side_effect=real_read) as read_body:
            status, body, connection = self.call("POST", "/api/projects", raw_body=big)
            self.assertEqual((status, body["error"]["code"]), (401, "unauthenticated"))
            self.assertEqual(connection, "close")       # the unread body must not become a request
            status, body, connection = self.call("POST", "/api/projects", raw_body=big,
                                                 token="not-a-session")
            self.assertEqual((status, connection), (401, "close"))
            # A small unwanted body is thrown away unparsed and the connection is kept.
            status, body, connection = self.call("POST", "/api/projects", raw_body=b'{"name": "x"}')
            self.assertEqual((status, connection), (401, None))
            self.assertEqual(read_body.call_count, 0)
        # The next request on a kept connection is read correctly.
        conn = http.client.HTTPConnection("127.0.0.1", self.port, timeout=20)
        try:
            conn.request("POST", "/api/projects", body=b'{"name": "GET /api/health HTTP/1.1"}',
                         headers={"Content-Type": "application/json"})
            first = conn.getresponse()
            first.read()
            conn.request("GET", "/api/health")
            second = conn.getresponse()
            self.assertEqual((first.status, second.status), (401, 200))
            self.assertTrue(json.loads(second.read())["ok"])
        finally:
            conn.close()
        # Signed in, the same body is read (and judged on its content).
        status, body, _ = self.call("POST", "/api/projects", raw_body=big, token=self.owner_token())
        self.assertEqual((status, body["error"]["code"]), (400, "validation_error"))

    def test_the_sign_in_route_takes_a_small_body_only(self):
        from app import server
        self.assertEqual(server.MAX_ANONYMOUS_BODY_BYTES, 16 * 1024)
        padded = {"email": "owner@test.local", "password": "correct-horse-battery",
                  "pad": "x" * (server.MAX_ANONYMOUS_BODY_BYTES + 1)}
        status, body, connection = self.call("POST", "/api/auth/login", body=padded)
        self.assertEqual((status, body["error"]["code"]), (400, "validation_error"))
        self.assertIn("too large", body["error"]["message"])
        # Far too large: not even read to be thrown away; the connection is closed.
        huge = dict(padded, pad="x" * (server.MAX_DISCARDED_BODY_BYTES + 1))
        status, body, connection = self.call("POST", "/api/auth/login", body=huge)
        self.assertEqual((status, connection), (400, "close"))
        # Neither attempt was counted as a sign-in attempt.
        self.assertEqual(server._LOGIN_ATTEMPTS, {})
        ok = {"email": "owner@test.local", "password": "correct-horse-battery"}
        status, body, _ = self.call("POST", "/api/auth/login", body=ok)
        self.assertEqual(status, 200)
        self.assertTrue(body["token"])

    def exchange(self, payload: bytes, wait: float = 3.0) -> bytes:
        """Send raw bytes on one connection and return everything that comes back."""
        sock = socket.create_connection(("127.0.0.1", self.port), timeout=10)
        try:
            sock.sendall(payload)
            sock.settimeout(wait)
            answer = b""
            try:
                while True:
                    chunk = sock.recv(65536)
                    if not chunk:
                        break
                    answer += chunk
            except socket.timeout:
                pass
            return answer
        finally:
            sock.close()

    def test_a_body_nobody_read_is_never_taken_for_the_next_request(self):
        smuggled = b"GET /api/config HTTP/1.1\r\nHost: x\r\n\r\n"
        cases = {
            "GET with a body": b"GET /api/health HTTP/1.1\r\nHost: x\r\nContent-Length: "
                               + str(len(smuggled)).encode() + b"\r\n\r\n" + smuggled,
            "static file with a body": b"GET / HTTP/1.1\r\nHost: x\r\nContent-Length: "
                                       + str(len(smuggled)).encode() + b"\r\n\r\n" + smuggled,
            "unknown route with a body": b"POST /api/nope HTTP/1.1\r\nHost: x\r\nContent-Length: "
                                         + str(len(smuggled)).encode() + b"\r\n\r\n" + smuggled,
            "chunked body": b"POST /api/auth/login HTTP/1.1\r\nHost: x\r\n"
                            b"Transfer-Encoding: chunked\r\n\r\n"
                            + hex(len(smuggled))[2:].encode() + b"\r\n" + smuggled + b"\r\n0\r\n\r\n",
            "chunked GET": b"GET /api/health HTTP/1.1\r\nHost: x\r\nTransfer-Encoding: chunked\r\n\r\n"
                           + hex(len(smuggled))[2:].encode() + b"\r\n" + smuggled + b"\r\n0\r\n\r\n",
        }
        for name, payload in cases.items():
            with self.subTest(case=name):
                answer = self.exchange(payload, wait=1.5)
                # One answer only: the bytes of the body were not served as a request.
                self.assertEqual(answer.count(b"HTTP/1.1 "), 1, answer[:300])
                self.assertNotIn(b'"min_password_length"', answer)
        # A chunked sign-in is refused, and the connection is closed after the answer.
        answer = self.exchange(cases["chunked body"], wait=1.5)
        self.assertTrue(answer.startswith(b"HTTP/1.1 400 "), answer[:60])
        self.assertIn(b"Connection: close", answer)
        # Two ordinary requests on one connection are both answered.
        two = (b"GET /api/health HTTP/1.1\r\nHost: x\r\n\r\n"
               b"GET /api/config HTTP/1.1\r\nHost: x\r\nConnection: close\r\n\r\n")
        answer = self.exchange(two)
        self.assertEqual(answer.count(b"HTTP/1.1 200 "), 2, answer[:300])
        self.assertIn(b'"min_password_length"', answer)

    def test_a_content_length_that_is_not_a_number_is_a_bad_request(self):
        status, body, _ = self.call("POST", "/api/auth/login",
                                    headers=[("Content-Length", "many")])
        self.assertEqual((status, body["error"]["code"]), (400, "validation_error"))


class TestGuestGatePlaces(LiveCase):
    ENV = {"FSL_PUBLIC_VIEW": "1"}

    def test_a_place_is_given_back_whatever_a_route_raises(self):
        from app import server
        gate = server._FairGate(2, 4)

        def explode(req):
            raise SystemExit(3)

        routes = [(m, rx, explode if rx.pattern.endswith("/api/projects$") else fn, a, g, ok)
                  for m, rx, fn, a, g, ok in server._ROUTES]
        with mock.patch.object(server, "_GUEST_WORK", gate), \
                mock.patch.object(server, "_ROUTES", routes), \
                mock.patch("sys.stderr"):
            for _ in range(4):
                with self.assertRaises((http.client.HTTPException, OSError)):
                    self.call("GET", "/api/projects")
        self.assertEqual((gate._free, gate.waiting()), (2, 0))

    def test_a_header_block_the_parser_gave_up_on_is_not_a_guest(self):
        token = self.owner_token()
        sock = socket.create_connection(("127.0.0.1", self.port), timeout=10)
        try:
            # A line without a colon in front of the credential: the standard
            # parser stops there and never sees the Authorization line.
            sock.sendall(b"GET /api/me HTTP/1.1\r\nHost: x\r\nthis is not a header\r\n"
                         + f"Authorization: Bearer {token}\r\n".encode() + b"Connection: close\r\n\r\n")
            sock.settimeout(3)
            answer = b""
            try:
                while b"\r\n\r\n" not in answer or not answer.rstrip().endswith(b"}"):
                    chunk = sock.recv(65536)
                    if not chunk:
                        break
                    answer += chunk
            except socket.timeout:
                pass
        finally:
            sock.close()
        self.assertTrue(answer.startswith(b"HTTP/1.1 401 "), answer[:80])
        self.assertNotIn(b'"guest"', answer)
        # A well-formed request without a credential is still a guest.
        status, body, _ = self.call("GET", "/api/me")
        self.assertEqual((status, body["user"].get("guest")), (200, True))

    def test_part_of_the_ceiling_is_kept_for_clients_that_asked_for_little(self):
        from app import server
        from app.errors import RateLimitError
        now = 7_000_000.0
        self.assertEqual((server.GUEST_OPEN_SHARE, server.GUEST_NEWCOMER_REQUESTS), (0.6, 12))
        with mock.patch.object(server, "GUEST_GLOBAL_LIMIT_PER_MINUTE", 100):
            # Three busy addresses use the open share of the ceiling (60 of 100).
            for i in range(60):
                server.guest_rate_check(f"10.9.0.{i % 3}", now)
            # They are held back from here on ...
            with self.assertRaises(RateLimitError) as busy:
                server.guest_rate_check("10.9.0.0", now + 1)
            self.assertIn("busy", busy.exception.message)
            # ... while someone who has just arrived is still served, up to
            # the point where they are no newcomer either.
            for _ in range(server.GUEST_NEWCOMER_REQUESTS):
                server.guest_rate_check("10.9.9.9", now + 2)
            with self.assertRaises(RateLimitError):
                server.guest_rate_check("10.9.9.9", now + 3)
            # The ceiling itself still holds for everyone.
            for i in range(100 - 60 - server.GUEST_NEWCOMER_REQUESTS):
                server.guest_rate_check(f"10.8.0.{i}", now + 4)
            with self.assertRaises(RateLimitError):
                server.guest_rate_check("10.7.0.1", now + 5)


class TestStoredValues(LiveCase):
    def setUp(self):
        super().setUp()
        from app import store
        self.token = self.owner_token()
        status, body, _ = self.call("POST", "/api/projects", token=self.token, body={"name": "p"})
        self.pid = body["project"]["id"]
        status, body, _ = self.call("POST", f"/api/projects/{self.pid}/assets", token=self.token,
                                    body={"kind": "source", "identifier": "/srv/code",
                                          "criticality": "low", "metadata": {}})
        self.aid = body["asset"]["id"]

    def scope(self, **fields):
        body = {"asset_id": self.aid, "proof": "x", "environment": "lab", "scan_types": ["bandit"]}
        body.update(fields)
        return self.call("POST", f"/api/projects/{self.pid}/scopes", token=self.token, body=body)

    def test_scope_fields_have_the_shape_the_policy_engine_reads(self):
        bad = ({"allowed_targets": "all"}, {"allowed_targets": [1, 2]}, {"denied_targets": {"a": 1}},
               {"allowed_targets": ["x" * 3000]}, {"allowed_ports": ["80", None]},
               {"allowed_ports": [True]}, {"window": [1, 2]}, {"window": {"start_hour_utc": 24}},
               {"window": {"end_hour_utc": "9"}}, {"rate_limits": "fast"},
               {"valid_until": "next week"}, {"valid_from": 20260101})
        for fields in bad:
            status, body, _ = self.scope(**fields)
            self.assertEqual((status, body["error"]["code"]), (400, "validation_error"), fields)
        status, body, _ = self.scope(allowed_targets=["/srv/code", "https://example.org"],
                                     denied_targets=[], allowed_ports=[443, "8000-8100"],
                                     window={"start_hour_utc": 22, "end_hour_utc": 4},
                                     rate_limits={"per_minute": 5},
                                     valid_from="2026-01-01T03:00:00+03:00",
                                     valid_until="2031-06-01T00:00:00Z")
        self.assertEqual(status, 201, body)
        scope = body["scope"]
        # Times are stored in UTC in the form the engine compares with.
        self.assertEqual(scope["valid_from"], "2026-01-01T00:00:00+00:00")
        self.assertEqual(scope["valid_until"], "2031-06-01T00:00:00+00:00")
        self.assertEqual(scope["allowed_ports"], [443, "8000-8100"])
        # Nothing given: the defaults, as before.
        status, body, _ = self.scope()
        self.assertEqual(status, 201)
        self.assertEqual((body["scope"]["allowed_targets"], body["scope"]["window"],
                          body["scope"]["valid_until"]), ([], {}, None))

    def test_an_idempotency_key_of_another_project_is_refused(self):
        from app import queue
        status, body, _ = self.scope(allowed_targets=["/srv/code"])
        sid = body["scope"]["id"]
        from app import store
        owner = store.get_project(self.pid)["owner_id"]
        elsewhere = store.create_project("another", owner)
        asset = store.create_asset(elsewhere["id"], "source", "/srv/other", created_by=owner)
        scope = store.create_scope(elsewhere["id"], asset["id"], proof="x",
                                   allowed_targets=["/srv/other"], scan_types=["bandit"],
                                   created_by=owner)
        other = queue.enqueue(project_id=elsewhere["id"], asset_id=asset["id"],
                              scope_id=scope["id"], connector="bandit", params={},
                              created_by=owner, idempotency_key="shared-key-1")
        before = len(queue.list_jobs(self.pid))
        status, body, _ = self.call("POST", f"/api/projects/{self.pid}/scans", token=self.token,
                                    body={"asset_id": self.aid, "scope_id": sid,
                                          "connector": "bandit", "idempotency_key": "shared-key-1"})
        self.assertEqual((status, body["error"]["code"]), (409, "conflict"))
        self.assertNotIn(other["id"], json.dumps(body))
        self.assertEqual(len(queue.list_jobs(self.pid)), before)

    def test_severity_and_confidence_are_stored_as_fixed_words(self):
        from app import findings, store
        from app.connectors.base import RawFinding
        from app import queue
        asset = store.get_asset(self.aid)
        _status, body, _ = self.scope(allowed_targets=["/srv/code"])
        job = queue.enqueue(project_id=self.pid, asset_id=self.aid, scope_id=body["scope"]["id"],
                            connector="bandit", params={}, created_by=store.get_project(self.pid)["owner_id"])
        raws = [RawFinding(rule_id="r1", title="a", severity="critical overlay", confidence="sure"),
                RawFinding(rule_id="r2", title="b", severity="high", confidence="high")]
        findings.ingest(job, asset, raws)
        stored = {f["rule_id"]: (f["severity"], f["confidence"])
                  for f in findings.list_findings(self.pid)}
        self.assertEqual(stored, {"r1": ("info", "low"), "r2": ("high", "high")})

    def test_connectors_without_a_registry_row_are_listed_as_checking(self):
        from app import store
        from app.connectors import connector_names
        status, body, _ = self.call("GET", "/api/connectors", token=self.token)
        self.assertEqual({c["state"] for c in body["connectors"]}, {"checking"})
        # The sync has reached one tool so far.
        store.upsert_tool_registry("bandit", {"category": "SAST", "state": "ready",
                                              "readiness": {"available": True, "version": "1.9.4"}})
        status, body, _ = self.call("GET", "/api/connectors", token=self.token)
        listed = {c["name"]: c for c in body["connectors"]}
        self.assertEqual(sorted(listed), connector_names())
        self.assertEqual(listed["bandit"]["state"], "ready")
        self.assertEqual({c["state"] for name, c in listed.items() if name != "bandit"},
                         {"checking"})


class TestProbeOutput(EnvCase):
    def test_output_that_is_not_text_does_not_break_the_probe(self):
        from app.connectors.base import Connector
        directory = Path(tempfile.mkdtemp(prefix="fsl-probe-"))
        tool = fake_tool(directory, "latin", "printf 'tool 1.0 \\351\\n'\n")
        version = Connector()._probe_version(tool)
        self.assertTrue(version.startswith("tool 1.0"), version)


if __name__ == "__main__":
    unittest.main(verbosity=2)
