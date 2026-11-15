"""Sign-in hardening.

Covers how the server identifies a client behind proxies, the sign-in attempt
throttle (atomic admission, no account-wide lock, bounded memory and bounded
audit volume), the password and email checks, and the owner / setup-notice
plumbing around them.
"""
from __future__ import annotations

import hashlib
import http.client
import io
import json
import os
import sys
import tempfile
import threading
import time
import types
import unittest
from http.server import ThreadingHTTPServer
from pathlib import Path
from unittest import mock

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

OWNER = "owner@test.local"
PASSWORD = "correct-horse-1"

_ENV_KEYS = ("FSL_OWNER_EMAIL", "FSL_OWNER_PASSWORD", "FSL_DB_PATH", "FSL_EVIDENCE_DIR",
             "FSL_AI_PROVIDER", "FSL_AI_API_KEY", "PORT", "FSL_CLIENT_IP_HEADER",
             "FSL_TRUSTED_PROXY_HOPS", "FSL_PRIVDROP_FAILED", "FSL_NO_WORKER")


def boot(env: dict | None = None, data_dir: Path | None = None):
    """Fresh isolated platform with an owner; pass data_dir to restart on an
    existing database instead."""
    tmp = data_dir or Path(tempfile.mkdtemp(prefix="fsl-signin-"))
    for key in _ENV_KEYS:
        os.environ.pop(key, None)
    os.environ["FSL_DATA_DIR"] = str(tmp)
    os.environ.update({"FSL_OWNER_EMAIL": OWNER, "FSL_OWNER_PASSWORD": PASSWORD})
    os.environ.update(env or {})
    from app.config import Config, reset_config_for_tests
    from app.db import Database, reset_db_for_tests
    cfg = Config.from_env()
    reset_config_for_tests(cfg)
    reset_db_for_tests(Database(cfg.db_path))
    from app.bootstrap import init_platform
    return cfg, init_platform(sync_tools=False)


def login_req(email=OWNER, password="wrong-password", ip="9.9.9.9"):
    from app import server
    return server.Req(None, {}, {}, {"email": email, "password": password}, client_ip=ip)


def attempt_counts(email, ip):
    """Entries currently held under the three throttle keys of (email, client)."""
    from app import server
    keys = server._login_keys(email, server.client_key(ip))
    return {kind: len(server._LOGIN_ATTEMPTS.get(key, [])) for kind, key in keys.items()}


def anonymous_rows():
    from app import audit
    return [r for r in audit.query(limit=1000) if r["actor"] == "anonymous"]


def header_lines(*pairs):
    msg = http.client.HTTPMessage()
    for name, value in pairs:
        msg.add_header(name, value)
    return msg


class LiveServer:
    """The real request handler on a loopback ephemeral port."""

    def __init__(self):
        from app import server
        self.httpd = ThreadingHTTPServer(("127.0.0.1", 0), server.Handler)
        self.httpd.daemon_threads = True
        self.port = self.httpd.server_address[1]
        self.thread = threading.Thread(target=self.httpd.serve_forever, daemon=True)
        self.thread.start()

    def close(self):
        self.httpd.shutdown()
        self.httpd.server_close()
        self.thread.join(5)

    def request(self, method, path, body=None, headers=(), token=None):
        """headers is a sequence of (name, value); a repeated name is sent as
        separate header lines."""
        conn = http.client.HTTPConnection("127.0.0.1", self.port, timeout=15)
        try:
            conn.putrequest(method, path)
            data = None
            if body is not None:
                data = json.dumps(body).encode("utf-8")
                conn.putheader("Content-Type", "application/json")
                conn.putheader("Content-Length", str(len(data)))
            if token:
                conn.putheader("Authorization", f"Bearer {token}")
            for name, value in headers:
                conn.putheader(name, value)
            conn.endheaders(data)
            resp = conn.getresponse()
            return resp.status, json.loads(resp.read().decode("utf-8"))
        finally:
            conn.close()


class SignInCase(unittest.TestCase):
    def setUp(self):
        from app import server
        env = mock.patch.dict(os.environ)
        env.start()
        self.addCleanup(env.stop)
        server.reset_login_throttle_for_tests()
        self.addCleanup(server.reset_login_throttle_for_tests)
        # The undeclared-proxy log line is printed once per process; tests that
        # are not about it start with it already spent.
        reported = mock.patch.object(server, "_PROXY_HEADERS_REPORTED", True)
        reported.start()
        self.addCleanup(reported.stop)

    def live_server(self) -> LiveServer:
        srv = LiveServer()
        self.addCleanup(srv.close)
        return srv

    def owner_token(self) -> str:
        from app import auth
        return auth.login(OWNER, PASSWORD)["token"]


# ---------------------------------------------------------------------------
# Client address
# ---------------------------------------------------------------------------
class TestClientAddress(SignInCase):
    def test_proxy_settings_default_to_off_and_are_validated(self):
        from app.config import Config
        cfg, _ = boot()
        self.assertEqual((cfg.client_ip_header, cfg.trusted_proxy_hops), ("", 0))
        cfg, _ = boot({"FSL_CLIENT_IP_HEADER": " CF-Connecting-IP ", "FSL_TRUSTED_PROXY_HOPS": "2"})
        self.assertEqual((cfg.client_ip_header, cfg.trusted_proxy_hops), ("CF-Connecting-IP", 2))
        for bad in ("X Forwarded For", "X-Real-IP:", "X_Real_IP", "x" * 65, "héader"):
            os.environ["FSL_CLIENT_IP_HEADER"] = bad
            self.assertEqual(Config.from_env().client_ip_header, "", bad)
        for raw, want in (("-3", 0), ("0", 0), ("1", 1), ("10", 10), ("99", 10), ("abc", 0), ("", 0)):
            os.environ["FSL_TRUSTED_PROXY_HOPS"] = raw
            self.assertEqual(Config.from_env().trusted_proxy_hops, want, raw)

    def test_default_uses_the_peer_and_ignores_every_proxy_header(self):
        from app import server
        boot()
        h = header_lines(("X-Forwarded-For", "198.51.100.4"), ("CF-Connecting-IP", "198.51.100.5"))
        self.assertEqual(server.resolve_client(h, "192.0.2.10"), ("192.0.2.10", "peer"))
        # An IPv4 peer seen through a dual-stack socket is the same client.
        self.assertEqual(server.resolve_client(header_lines(), "::ffff:192.0.2.10"),
                         ("192.0.2.10", "peer"))

    def test_rotating_forwarded_for_does_not_evade_the_pair_limit(self):
        from app import server
        boot()
        srv = self.live_server()
        body = {"email": OWNER, "password": "wrong-password"}
        for i in range(server.LOGIN_LIMITS["pair"]):
            status, _ = srv.request("POST", "/api/auth/login", body,
                                    headers=[("X-Forwarded-For", f"198.51.100.{i + 1}")])
            self.assertEqual(status, 401)
        status, out = srv.request("POST", "/api/auth/login", body,
                                  headers=[("X-Forwarded-For", "203.0.113.200")])
        self.assertEqual(status, 429)
        self.assertEqual(out["error"]["code"], "rate_limited")
        wait = out["error"]["detail"]["retry_after_seconds"]
        self.assertTrue(0 < wait <= server.LOGIN_WINDOW_SECONDS, wait)
        # Every attempt was attributed to the socket peer, not to the header.
        self.assertEqual(attempt_counts(OWNER, "127.0.0.1")["pair"], server.LOGIN_LIMITS["pair"])

    def test_me_shows_how_the_client_was_identified(self):
        boot()
        srv = self.live_server()
        token = self.owner_token()
        status, out = srv.request("GET", "/api/me", token=token)
        self.assertEqual(status, 200)
        self.assertEqual(out["client"], {"address": "127.0.0.1", "source": "peer",
                                         "proxy_headers_ignored": False})
        for name in ("X-Forwarded-For", "Forwarded", "CF-Connecting-IP", "True-Client-IP",
                     "Fly-Client-IP"):
            value = "for=198.51.100.4" if name == "Forwarded" else "198.51.100.4"
            _, out = srv.request("GET", "/api/me", token=token, headers=[(name, value)])
            self.assertEqual(out["client"], {"address": "127.0.0.1", "source": "peer",
                                             "proxy_headers_ignored": True}, name)

    def test_header_mode_accepts_one_valid_value_only(self):
        boot({"FSL_CLIENT_IP_HEADER": "CF-Connecting-IP"})
        srv = self.live_server()
        token = self.owner_token()

        def client(*headers):
            status, out = srv.request("GET", "/api/me", token=token, headers=headers)
            self.assertEqual(status, 200)
            return out["client"]

        self.assertEqual(client(("CF-Connecting-IP", " 203.0.113.7 ")),
                         {"address": "203.0.113.7", "source": "header",
                          "proxy_headers_ignored": False})
        self.assertEqual(client(("cf-connecting-ip", "::ffff:203.0.113.7"))["address"],
                         "203.0.113.7")
        self.assertEqual(client(("CF-Connecting-IP", "2001:DB8::0:1"))["address"], "2001:db8::1")
        peer = {"address": "127.0.0.1", "source": "peer", "proxy_headers_ignored": True}
        self.assertEqual(client(("CF-Connecting-IP", "not-an-address")), peer)
        self.assertEqual(client(("CF-Connecting-IP", "203.0.113.7, 198.51.100.1")), peer)
        self.assertEqual(client(("CF-Connecting-IP", "203.0.113.7"),
                                ("CF-Connecting-IP", "198.51.100.1")), peer)
        # The configured header is the only one consulted.
        self.assertEqual(client(("X-Forwarded-For", "203.0.113.7")), peer)
        self.assertEqual(client(), {"address": "127.0.0.1", "source": "peer",
                                    "proxy_headers_ignored": False})

    def test_hop_mode_counts_from_the_right_across_header_lines(self):
        boot({"FSL_TRUSTED_PROXY_HOPS": "2"})
        srv = self.live_server()
        token = self.owner_token()

        def client(*headers):
            return srv.request("GET", "/api/me", token=token, headers=headers)[1]["client"]

        # Two lines join to: 6.6.6.6, 203.0.113.9, 10.0.0.1 - the wanted entry
        # is on the first line and the count runs across both.
        self.assertEqual(client(("X-Forwarded-For", "6.6.6.6 , 203.0.113.9"),
                                ("X-Forwarded-For", "10.0.0.1")),
                         {"address": "203.0.113.9", "source": "forwarded",
                          "proxy_headers_ignored": False})
        self.assertEqual(client(("X-Forwarded-For", "6.6.6.6"),
                                ("X-Forwarded-For", "198.51.100.4, 203.0.113.9"),
                                ("X-Forwarded-For", "10.0.0.1"))["address"], "203.0.113.9")
        self.assertEqual(client(("X-Forwarded-For", "203.0.113.9,,10.0.0.1,"))["address"],
                         "203.0.113.9")
        peer = {"address": "127.0.0.1", "source": "peer", "proxy_headers_ignored": True}
        self.assertEqual(client(("X-Forwarded-For", "10.0.0.1")), peer)            # too few hops
        self.assertEqual(client(("X-Forwarded-For", "unknown, 10.0.0.1")), peer)   # not an address

    def test_hop_mode_with_one_hop_takes_the_last_entry(self):
        from app import server
        boot({"FSL_TRUSTED_PROXY_HOPS": "1"})
        h = header_lines(("X-Forwarded-For", "6.6.6.6, 203.0.113.9"))
        self.assertEqual(server.resolve_client(h, "10.0.0.1"), ("203.0.113.9", "forwarded"))

    def test_header_mode_falls_through_to_hop_mode(self):
        from app import server
        boot({"FSL_CLIENT_IP_HEADER": "Fly-Client-IP", "FSL_TRUSTED_PROXY_HOPS": "1"})
        h = header_lines(("X-Forwarded-For", "203.0.113.9"))
        self.assertEqual(server.resolve_client(h, "10.0.0.1"), ("203.0.113.9", "forwarded"))
        h = header_lines(("Fly-Client-IP", "198.51.100.7"), ("X-Forwarded-For", "203.0.113.9"))
        self.assertEqual(server.resolve_client(h, "10.0.0.1"), ("198.51.100.7", "header"))

    def test_ipv6_zone_never_reaches_the_address(self):
        from app import audit, server, util
        from app.errors import AuthError
        zone = "<img src=x onerror=alert(1)>" + "Z" * 3000
        boot({"FSL_CLIENT_IP_HEADER": "CF-Connecting-IP"})
        h = header_lines(("CF-Connecting-IP", f"2001:DB8:9:9::1%{zone}"))
        self.assertEqual(server.resolve_client(h, "10.0.0.1"), ("2001:db8:9:9::1", "header"))
        h = header_lines(("CF-Connecting-IP", "::ffff:203.0.113.7%eth0"))
        self.assertEqual(server.resolve_client(h, "10.0.0.1"), ("203.0.113.7", "header"))
        # A link-local peer legitimately carries a zone; it is dropped as well.
        self.assertEqual(server.resolve_client(header_lines(), "fe80::1%eth0"),
                         ("fe80::1", "peer"))
        # What is written to the audit log is the bounded canonical form.
        req = login_req(ip=server.resolve_client(
            header_lines(("CF-Connecting-IP", f"2001:db8:9:9::1%{zone}")), "10.0.0.1")[0])
        with mock.patch.object(util, "verify_password", return_value=False):
            with self.assertRaises(AuthError):
                server.login(req)
        self.assertEqual([r["detail"]["client"] for r in audit.query(limit=10)
                          if r["action"] == "auth.login_failed"], ["2001:db8:9:9::1"])
        boot({"FSL_TRUSTED_PROXY_HOPS": "1"})
        h = header_lines(("X-Forwarded-For", f"6.6.6.6, 2001:db8:9:9::1%{zone}"))
        self.assertEqual(server.resolve_client(h, "10.0.0.1"), ("2001:db8:9:9::1", "forwarded"))

    def test_start_up_log_states_where_the_client_address_comes_from(self):
        from app import server

        def report(env):
            cfg, _ = boot(env)
            return server.client_address_report(cfg, os.environ)

        lines = report({})
        self.assertEqual(len(lines), 1)
        self.assertIn("[init] client address: the connecting address", lines[0])
        self.assertIn("proxy headers are ignored", lines[0])
        self.assertIn("FSL_CLIENT_IP_HEADER", lines[0])
        self.assertEqual(report({"FSL_CLIENT_IP_HEADER": "CF-Connecting-IP"}),
                         ["[init] client address: the CF-Connecting-IP header, "
                          "else the connecting address"])
        self.assertEqual(report({"FSL_TRUSTED_PROXY_HOPS": "1"}),
                         ["[init] client address: X-Forwarded-For behind 1 trusted proxy, "
                          "else the connecting address"])
        self.assertEqual(report({"FSL_CLIENT_IP_HEADER": "Fly-Client-IP",
                                 "FSL_TRUSTED_PROXY_HOPS": "02"}),
                         ["[init] client address: the Fly-Client-IP header, then "
                          "X-Forwarded-For behind 2 trusted proxies, else the connecting address"])
        # A setting that was given but cannot be used is named, not dropped silently.
        lines = report({"FSL_CLIENT_IP_HEADER": "CF_Connecting_IP"})
        self.assertIn("the connecting address; proxy headers are ignored", lines[0])
        self.assertEqual(len(lines), 2)
        self.assertIn("[setup] FSL_CLIENT_IP_HEADER is not a header name", lines[1])
        for raw, used in (("one", 0), ("99", 10), ("-1", 0)):
            lines = report({"FSL_TRUSTED_PROXY_HOPS": raw})
            self.assertEqual(len(lines), 2, raw)
            self.assertIn("[setup] FSL_TRUSTED_PROXY_HOPS is not a whole number from 0 to 10; "
                          f"using {used}.", lines[1])

    def test_server_start_prints_the_client_address_mode(self):
        from app import server
        boot({"FSL_CLIENT_IP_HEADER": "CF-Connecting-IP"})

        class StoppedServer:
            def serve_forever(self):
                raise KeyboardInterrupt

            def shutdown(self):
                pass

        class NoThread:
            def __init__(self, *args, **kwargs):
                pass

            def start(self):
                pass

        info = {"setup_notices": [], "owner_bootstrap": {}, "catalog_seeded": 0,
                "ai_available": False}
        log = io.StringIO()
        with mock.patch.object(server, "connector_names", return_value=[]), \
                mock.patch.object(server, "threading", types.SimpleNamespace(Thread=NoThread)), \
                mock.patch.object(server, "build_server", return_value=StoppedServer()), \
                mock.patch.object(server, "init_platform", return_value=info), \
                mock.patch("sys.stderr", log):
            server.main()
        self.assertIn("[init] client address: the CF-Connecting-IP header, "
                      "else the connecting address\n", log.getvalue())

    def test_undeclared_proxy_is_logged_once(self):
        from app import server
        marker = "a request carried a forwarding header"

        def log_of_two_forwarded_requests(env):
            boot(env)
            srv = self.live_server()
            log = io.StringIO()
            with mock.patch.object(server, "_PROXY_HEADERS_REPORTED", False), \
                    mock.patch("sys.stderr", log):
                for address in ("198.51.100.4", "198.51.100.5"):
                    status, _ = srv.request("GET", "/api/health",
                                            headers=[("X-Forwarded-For", address)])
                    self.assertEqual(status, 200)
                status, _ = srv.request("GET", "/api/health")
                self.assertEqual(status, 200)
            return log.getvalue()

        log = log_of_two_forwarded_requests({})
        self.assertEqual(log.count(marker), 1, log)
        self.assertTrue(log.startswith("[setup] "), log)
        self.assertIn("FSL_CLIENT_IP_HEADER", log)
        self.assertIn("FSL_TRUSTED_PROXY_HOPS", log)
        self.assertNotIn("198.51.100", log)      # nothing a client sent is echoed

    def test_proxy_setting_that_does_not_match_the_requests_is_logged_once(self):
        from app import server
        marker = "but not a usable value where"

        def log_of_requests(env, headers):
            boot(env)
            srv = self.live_server()
            log = io.StringIO()
            with mock.patch.object(server, "_PROXY_HEADERS_REPORTED", False), \
                    mock.patch("sys.stderr", log):
                for _ in range(3):
                    status, _ = srv.request("GET", "/api/health", headers=headers)
                    self.assertEqual(status, 200)
            return log.getvalue()

        # The named header never arrives, another forwarding header does.
        for env in ({"FSL_CLIENT_IP_HEADER": "X-Real-IP"}, {"FSL_TRUSTED_PROXY_HOPS": "3"}):
            with self.subTest(env=env):
                log = log_of_requests(env, [("X-Forwarded-For", "198.51.100.4")])
                self.assertEqual(log.count(marker), 1, log)
                self.assertTrue(log.startswith("[setup] "), log)
                self.assertNotIn("198.51.100", log)
        # A setting that matches what arrives logs nothing, with or without
        # other forwarding headers beside it.
        self.assertEqual(log_of_requests(
            {"FSL_CLIENT_IP_HEADER": "CF-Connecting-IP"},
            [("CF-Connecting-IP", "198.51.100.4"), ("X-Forwarded-For", "198.51.100.4, 10.0.0.1")]),
            "")
        # A request with no forwarding header at all (a local probe) is not a sign of anything.
        self.assertEqual(log_of_requests({"FSL_CLIENT_IP_HEADER": "CF-Connecting-IP"}, []), "")

    def test_client_key_is_the_ipv4_address_or_the_ipv6_slash_64(self):
        from app import server
        self.assertEqual(server.client_key("203.0.113.7"), "203.0.113.7")
        self.assertEqual(server.client_key("::ffff:203.0.113.7"), "203.0.113.7")
        self.assertEqual(server.client_key("2001:db8:1:2::5"), "2001:db8:1:2::/64")
        self.assertEqual(server.client_key("2001:db8:1:2:aaaa:bbbb:cccc:dddd"), "2001:db8:1:2::/64")
        self.assertNotEqual(server.client_key("2001:db8:1:3::5"), server.client_key("2001:db8:1:2::5"))

    def test_client_network_is_the_ipv4_address_or_the_ipv6_slash_48(self):
        from app import server
        self.assertEqual(server.client_network("203.0.113.7"), "203.0.113.7")
        self.assertEqual(server.client_network("::ffff:203.0.113.7"), "203.0.113.7")
        self.assertEqual(server.client_network("2001:db8:1:2::5"), "2001:db8:1::/48")
        self.assertEqual(server.client_network("2001:db8:1:ffff:a:b:c:d"), "2001:db8:1::/48")
        self.assertNotEqual(server.client_network("2001:db8:2::5"),
                            server.client_network("2001:db8:1::5"))
        self.assertEqual(server.client_network("not an address"), "not an address")

    def test_ipv6_clients_in_one_slash_64_share_the_limit(self):
        from app import server, util
        from app.errors import AuthError, RateLimitError
        boot()
        with mock.patch.object(util, "verify_password", return_value=False):
            for i in range(server.LOGIN_LIMITS["pair"]):
                with self.assertRaises(AuthError):
                    server.login(login_req(ip=f"2001:db8:1:2::{i + 1:x}"))
            with self.assertRaises(RateLimitError):
                server.login(login_req(ip="2001:db8:1:2:ffff:ffff:ffff:ffff"))
            with self.assertRaises(AuthError):                   # a different /64
                server.login(login_req(ip="2001:db8:1:3::1"))


# ---------------------------------------------------------------------------
# Throttle
# ---------------------------------------------------------------------------
class TestThrottle(SignInCase):
    def test_parallel_burst_cannot_exceed_the_pair_limit(self):
        from app import server, util
        from app.errors import AuthError, RateLimitError
        boot()
        verifications = []

        def slow_verify(password, encoded):
            verifications.append(password)
            time.sleep(0.05)        # keep every request inside the check at once
            return False

        outcomes = []
        gate = threading.Barrier(40)

        def attempt():
            req = login_req()
            gate.wait()
            try:
                server.login(req)
                outcomes.append("ok")
            except RateLimitError:
                outcomes.append("limited")
            except AuthError:
                outcomes.append("denied")

        with mock.patch.object(util, "verify_password", slow_verify):
            threads = [threading.Thread(target=attempt) for _ in range(40)]
            for t in threads:
                t.start()
            for t in threads:
                t.join(30)
        limit = server.LOGIN_LIMITS["pair"]
        # One client has one attempt in progress at a time, so most of the
        # burst is turned away before it is even counted; whatever does get
        # through stays within the pair limit.
        self.assertTrue(1 <= len(verifications) <= limit, len(verifications))
        self.assertEqual(sorted(set(outcomes)), ["denied", "limited"])
        self.assertEqual(outcomes.count("denied"), len(verifications))
        self.assertEqual(outcomes.count("limited"), 40 - len(verifications))
        self.assertEqual(attempt_counts(OWNER, "9.9.9.9")["pair"], len(verifications))

    def test_parallel_admissions_reserve_exactly_the_pair_limit(self):
        from app import server
        from app.errors import RateLimitError
        admitted, refused = [], []
        gate = threading.Barrier(40)

        def admit():
            gate.wait()
            try:
                admitted.append(server.login_admit("o@x.io", "192.0.2.1"))
            except RateLimitError:
                refused.append(1)

        threads = [threading.Thread(target=admit) for _ in range(40)]
        for t in threads:
            t.start()
        for t in threads:
            t.join(30)
        limit = server.LOGIN_LIMITS["pair"]
        self.assertEqual((len(admitted), len(refused)), (limit, 40 - limit))
        self.assertEqual(attempt_counts("o@x.io", "192.0.2.1"),
                         {"pair": limit, "acct": limit, "ip": limit})

    def test_password_checks_never_run_side_by_side(self):
        from app import server, util
        from app.errors import AuthError
        boot()
        self.assertEqual(server.LOGIN_VERIFY_SLOTS, 1)
        state = {"inside": 0, "peak": 0, "calls": 0}
        state_lock = threading.Lock()

        def slow_verify(password, encoded):
            with state_lock:
                state["inside"] += 1
                state["calls"] += 1
                state["peak"] = max(state["peak"], state["inside"])
            time.sleep(0.03)
            with state_lock:
                state["inside"] -= 1
            return False

        clients = 12
        outcomes = []
        gate = threading.Barrier(clients)

        def attempt(i):
            # Distinct clients and accounts: nothing but the verification
            # capacity stands between these requests and the hash.
            req = login_req(email=f"user{i}@test.local", ip=f"198.51.100.{i + 1}")
            gate.wait()
            try:
                server.login(req)
                outcomes.append("ok")
            except AuthError:
                outcomes.append("denied")
            except Exception as e:      # reported below
                outcomes.append(type(e).__name__)

        with mock.patch.object(util, "verify_password", slow_verify):
            threads = [threading.Thread(target=attempt, args=(i,)) for i in range(clients)]
            for t in threads:
                t.start()
            for t in threads:
                t.join(30)
        self.assertEqual(outcomes, ["denied"] * clients)
        self.assertEqual(state["calls"], clients)
        self.assertEqual(state["peak"], server.LOGIN_VERIFY_SLOTS)
        self.assertEqual(server._LOGIN_IN_PROGRESS, set())

    def test_no_turn_in_time_is_a_429_that_counts_nothing(self):
        from app import server, util
        from app.errors import AuthError, RateLimitError
        boot()
        entered, finish = threading.Event(), threading.Event()

        def stuck_verify(password, encoded):
            entered.set()
            finish.wait(30)
            return False

        first = []

        def occupy():
            try:
                server.login(login_req(ip="198.51.100.1"))
            except AuthError:
                first.append("denied")

        with mock.patch.object(util, "verify_password", stuck_verify), \
                mock.patch.object(server, "LOGIN_VERIFY_WAIT_SECONDS", 0.2):
            holder = threading.Thread(target=occupy)
            holder.start()
            self.assertTrue(entered.wait(30))
            started = time.monotonic()
            with self.assertRaises(RateLimitError) as busy:
                # The right password, from another client, while the only
                # slot is taken for longer than the wait.
                server.login(login_req(password=PASSWORD, ip="203.0.113.50"))
            waited = time.monotonic() - started
            # Nothing of the refused attempt is left behind.
            self.assertEqual(attempt_counts(OWNER, "203.0.113.50"),
                             {"pair": 0, "acct": 1, "ip": 0})      # acct: the first attempt
            self.assertEqual(server._LOGIN_IN_PROGRESS, {"198.51.100.1"})
            finish.set()
            holder.join(30)
        self.assertEqual(busy.exception.status, 429)
        self.assertEqual(busy.exception.detail, {"retry_after_seconds": 0.2})
        self.assertIn("busy", busy.exception.message)
        self.assertTrue(0.15 <= waited < 5, waited)
        self.assertEqual(first, ["denied"])
        self.assertEqual(server._LOGIN_IN_PROGRESS, set())
        # Only the first attempt's failure was audited; the busy refusal was not.
        self.assertEqual([(r["action"], r["detail"]["client"]) for r in anonymous_rows()],
                         [("auth.login_failed", "198.51.100.1")])
        # The slot is free again and the refused client lost none of its allowance.
        self.assertEqual(server.login(login_req(password=PASSWORD, ip="203.0.113.50"))[0], 200)
        self.assertEqual(server.LOGIN_VERIFY_WAIT_SECONDS, 10)
        self.assertEqual(server._login_busy().detail, {"retry_after_seconds": 10})

    def test_second_attempt_from_a_network_in_progress_waits_then_is_refused_uncounted(self):
        from app import server, util
        from app.errors import AuthError, RateLimitError
        boot()
        entered, finish = threading.Event(), threading.Event()
        calls = []

        def stuck_verify(password, encoded):
            calls.append(password)
            entered.set()
            finish.wait(30)
            return False

        first = []

        def occupy():
            try:
                server.login(login_req(ip="2001:db8:1:2::1"))
            except AuthError:
                first.append("denied")

        with mock.patch.object(util, "verify_password", stuck_verify), \
                mock.patch.object(server, "LOGIN_SAME_NETWORK_WAIT_SECONDS", 0.2):
            holder = threading.Thread(target=occupy)
            holder.start()
            self.assertTrue(entered.wait(30))
            started = time.monotonic()
            # Same network (another /64 of the same /48), another account: it
            # waits for the first attempt, which does not finish in time.
            with self.assertRaises(RateLimitError) as busy:
                server.login(login_req(email="other@test.local", ip="2001:db8:1:99::2"))
            waited = time.monotonic() - started
            self.assertTrue(0.15 <= waited < 5, waited)
            self.assertEqual(server._LOGIN_QUEUED, {})
            self.assertEqual(attempt_counts("other@test.local", "2001:db8:1:99::2"),
                             {"pair": 0, "acct": 0, "ip": 0})
            self.assertEqual(attempt_counts("other@test.local", "2001:db8:1:2::2"),
                             {"pair": 0, "acct": 0, "ip": 1})      # ip: the first attempt
            finish.set()
            holder.join(30)
        self.assertEqual(busy.exception.status, 429)
        self.assertIn("busy", busy.exception.message)
        self.assertTrue(busy.exception.detail["retry_after_seconds"] > 0)
        self.assertEqual((first, len(calls)), (["denied"], 1))
        self.assertEqual(len(anonymous_rows()), 1)                  # the first attempt only
        # Once the first attempt is over the network may try again.
        self.assertEqual(server._LOGIN_IN_PROGRESS, set())
        with mock.patch.object(util, "verify_password", return_value=False):
            with self.assertRaises(AuthError):
                server.login(login_req(email="other@test.local", ip="2001:db8:1:2::2"))

    def test_double_tap_from_one_address_signs_in_twice(self):
        from app import server, util
        boot()
        real_verify = util.verify_password
        entered, finish = threading.Event(), threading.Event()
        calls = []

        def held_verify(password, encoded):
            calls.append(password)
            if len(calls) == 1:
                entered.set()
                finish.wait(30)
            return real_verify(password, encoded)

        results = []

        def sign_in():
            results.append(server.login(login_req(password=PASSWORD, ip="203.0.113.9"))[0])

        with mock.patch.object(util, "verify_password", held_verify):
            first = threading.Thread(target=sign_in)
            first.start()
            self.assertTrue(entered.wait(30))
            second = threading.Thread(target=sign_in)
            second.start()
            # The second request is parked behind the first, not refused.
            deadline = time.monotonic() + 10
            while not server._LOGIN_QUEUED and time.monotonic() < deadline:
                time.sleep(0.01)
            self.assertEqual({k: len(v) for k, v in server._LOGIN_QUEUED.items()},
                             {"203.0.113.9": 1})
            finish.set()
            first.join(30)
            second.join(30)
        self.assertEqual(results, [200, 200])
        self.assertEqual((server._LOGIN_IN_PROGRESS, server._LOGIN_QUEUED), (set(), {}))

    def test_only_a_few_attempts_from_one_network_may_wait(self):
        from app import server, util
        from app.errors import AuthError, RateLimitError
        boot()
        entered, finish = threading.Event(), threading.Event()

        def stuck_verify(password, encoded):
            entered.set()
            finish.wait(30)
            return False

        outcomes = []

        def attempt():
            try:
                server.login(login_req(ip="203.0.113.9"))
            except AuthError:
                outcomes.append("denied")
            except RateLimitError:
                outcomes.append("busy")

        with mock.patch.object(util, "verify_password", stuck_verify):
            threads = [threading.Thread(target=attempt)]
            threads[0].start()
            self.assertTrue(entered.wait(30))
            for _ in range(server.LOGIN_SAME_NETWORK_WAITERS):
                threads.append(threading.Thread(target=attempt))
                threads[-1].start()
            deadline = time.monotonic() + 10
            while (len(server._LOGIN_QUEUED.get("203.0.113.9", ()))
                   < server.LOGIN_SAME_NETWORK_WAITERS and time.monotonic() < deadline):
                time.sleep(0.01)
            started = time.monotonic()
            # One more than may wait: refused at once, nothing counted.
            with self.assertRaises(RateLimitError):
                server.login(login_req(ip="203.0.113.9"))
            self.assertLess(time.monotonic() - started, 1)
            finish.set()
            for t in threads:
                t.join(30)
        self.assertEqual(sorted(outcomes), ["denied"] * (1 + server.LOGIN_SAME_NETWORK_WAITERS))
        self.assertEqual((server._LOGIN_IN_PROGRESS, server._LOGIN_QUEUED), (set(), {}))

    def test_gate_serves_fewest_turns_first_then_earliest(self):
        from app import server
        gate = server._FairGate(1, 8)
        self.assertTrue(gate.acquire(0, 0.1))            # the slot is taken
        order, threads = [], []

        def wait_for_turn(name, rank):
            if gate.acquire(rank, 30):
                order.append(name)
                gate.release()

        for name, rank in (("had-5", 5), ("had-2-first", 2), ("had-0", 0), ("had-2-second", 2)):
            t = threading.Thread(target=wait_for_turn, args=(name, rank))
            t.start()
            threads.append(t)
            deadline = time.monotonic() + 10
            while gate.waiting() < len(threads) and time.monotonic() < deadline:
                time.sleep(0.005)
        gate.release()
        for t in threads:
            t.join(30)
        self.assertEqual(order, ["had-0", "had-2-first", "had-2-second", "had-5"])
        self.assertEqual(gate.waiting(), 0)
        self.assertTrue(gate.acquire(9, 0.1))            # free again afterwards

    def test_full_line_gives_way_only_to_a_client_with_fewer_turns(self):
        from app import server
        gate = server._FairGate(1, 2)
        self.assertTrue(gate.acquire(0, 0.1))
        results, threads = {}, []

        def wait_for_turn(name, rank):
            results[name] = gate.acquire(rank, 30)
            if results[name]:
                gate.release()

        for name, rank in (("had-3", 3), ("had-7", 7)):
            t = threading.Thread(target=wait_for_turn, args=(name, rank))
            t.start()
            threads.append(t)
            deadline = time.monotonic() + 10
            while gate.waiting() < len(threads) and time.monotonic() < deadline:
                time.sleep(0.005)
        # As many turns as the worst waiter, arriving later: refused at once.
        started = time.monotonic()
        self.assertFalse(gate.acquire(7, 30))
        self.assertLess(time.monotonic() - started, 1)
        self.assertEqual(gate.waiting(), 2)
        # Fewer turns: takes the place of the waiter that has had the most.
        newcomer = threading.Thread(target=wait_for_turn, args=("had-0", 0))
        newcomer.start()
        threads[1].join(30)
        self.assertIs(results["had-7"], False)
        self.assertEqual(gate.waiting(), 2)
        gate.release()
        newcomer.join(30)
        threads[0].join(30)
        self.assertEqual((results["had-0"], results["had-3"]), (True, True))
        self.assertEqual(gate.waiting(), 0)

    def test_gate_wait_times_out_and_leaves_the_line(self):
        from app import server
        gate = server._FairGate(1, 8)
        self.assertTrue(gate.acquire(0, 0.1))
        started = time.monotonic()
        self.assertFalse(gate.acquire(0, 0.2))
        self.assertTrue(0.15 <= time.monotonic() - started < 5)
        self.assertEqual(gate.waiting(), 0)
        gate.release()
        self.assertTrue(gate.acquire(0, 0.1))

    def test_first_time_client_goes_ahead_of_clients_that_keep_trying(self):
        from app import server, util
        from app.errors import AuthError
        boot()
        real_verify = util.verify_password
        entered, finish = threading.Event(), threading.Event()
        order = []
        state = {"held": False}

        def recording_verify(password, encoded):
            if not state["held"]:
                state["held"] = True
                entered.set()
                finish.wait(30)
                return False
            order.append(password)
            return real_verify(password, encoded)

        # Six addresses have each had two turns already.
        with mock.patch.object(util, "verify_password", return_value=False):
            for i in range(6):
                for _ in range(2):
                    with self.assertRaises(AuthError):
                        server.login(login_req(email=f"u{i}@test.local", ip=f"198.51.100.{i + 1}"))
        self.assertEqual(server._login_turns("198.51.100.1"), 2)
        owner_result = []

        def flooder(i):
            try:
                server.login(login_req(email=f"u{i}@test.local", password=f"guess-{i}",
                                       ip=f"198.51.100.{i + 1}"))
            except AuthError:
                pass

        def owner():
            owner_result.append(server.login(login_req(password=PASSWORD, ip="203.0.113.50"))[0])

        with mock.patch.object(util, "verify_password", recording_verify):
            holder = threading.Thread(target=flooder, args=(0,))
            holder.start()
            self.assertTrue(entered.wait(30))
            threads = []
            for i in range(1, 6):
                threads.append(threading.Thread(target=flooder, args=(i,)))
                threads[-1].start()
                deadline = time.monotonic() + 10
                while server._LOGIN_VERIFY.waiting() < i and time.monotonic() < deadline:
                    time.sleep(0.005)
            # The owner arrives last, from an address that has had no turn.
            threads.append(threading.Thread(target=owner))
            threads[-1].start()
            deadline = time.monotonic() + 10
            while server._LOGIN_VERIFY.waiting() < 6 and time.monotonic() < deadline:
                time.sleep(0.005)
            finish.set()
            holder.join(30)
            for t in threads:
                t.join(30)
        self.assertEqual(owner_result, [200])
        self.assertEqual(order[0], PASSWORD, order)
        self.assertEqual(len(order), 6)
        # A correct password clears the network's turns; failures stay counted.
        self.assertEqual(server._login_turns("203.0.113.50"), 0)
        self.assertEqual(server._login_turns("198.51.100.2"), 3)

    def test_turn_history_is_bounded(self):
        from app import server
        now = 1_000_000.0
        for i in range(server._LOGIN_TURNS_KEEP + 50):
            server._login_turn_taken("198.51.100.1", now + i * 0.001)
        self.assertEqual(server._login_turns("198.51.100.1", now + 1), server._LOGIN_TURNS_KEEP)
        with mock.patch.object(server, "_LOGIN_MAX_KEYS", 50):
            server._login_turn_taken("198.51.100.1", now + 2)
            for i in range(200):
                server._login_turn_taken(f"203.0.113.{i}", now + 3)
            self.assertLessEqual(len(server._LOGIN_TURNS), 50)
            # The network with the long history outlives the one-off ones.
            self.assertGreater(server._login_turns("198.51.100.1", now + 4), 0)
        # Old turns stop counting once the window has passed.
        self.assertEqual(
            server._login_turns("198.51.100.1", now + 10 + server.LOGIN_WINDOW_SECONDS), 0)

    def test_busy_refusals_are_logged_once_per_window(self):
        from app import server
        log = io.StringIO()
        with mock.patch("sys.stderr", log):
            for _ in range(5):
                self.assertEqual(server._login_turned_away().status, 429)
        self.assertEqual(log.getvalue().count("[signin] "), 1, log.getvalue())

    def test_server_listens_with_a_deep_backlog(self):
        from app import server
        self.assertGreaterEqual(server.Server.request_queue_size, 128)
        self.assertTrue(server.Server.daemon_threads)

    def test_no_account_wide_lockout(self):
        from app import server, util
        from app.errors import AuthError, RateLimitError
        boot()
        # Guesses against the owner from many distinct clients.
        with mock.patch.object(util, "verify_password", return_value=False):
            for i in range(server.LOGIN_ACCOUNT_PRESSURE + 10):
                with self.assertRaises(AuthError):
                    server.login(login_req(ip=f"198.51.100.{i + 1}"))
        self.assertGreaterEqual(attempt_counts(OWNER, "203.0.113.50")["acct"],
                                server.LOGIN_ACCOUNT_PRESSURE)
        # The owner, on a client that has not failed, still signs in.
        status, out = server.login(login_req(password=PASSWORD, ip="203.0.113.50"))
        self.assertEqual(status, 200)
        self.assertTrue(out["token"])
        # Under pressure a fresh client gets exactly the reduced allowance.
        for _ in range(server.LOGIN_PAIR_LIMIT_UNDER_PRESSURE):
            with self.assertRaises(AuthError):
                server.login(login_req(ip="203.0.113.60"))
        with self.assertRaises(RateLimitError) as denied:
            server.login(login_req(ip="203.0.113.60"))
        self.assertEqual(denied.exception.status, 429)
        wait = denied.exception.detail["retry_after_seconds"]
        self.assertTrue(0 < wait <= server.LOGIN_WINDOW_SECONDS, wait)
        self.assertIn("wait", denied.exception.message)
        # That client is now held even with the right password; another is not.
        with self.assertRaises(RateLimitError):
            server.login(login_req(password=PASSWORD, ip="203.0.113.60"))
        self.assertEqual(server.login(login_req(password=PASSWORD, ip="203.0.113.70"))[0], 200)

    def test_account_history_is_bounded_and_still_signals_pressure(self):
        from app import server
        from app.errors import RateLimitError
        now = 1_000_000.0
        for i in range(500):
            server.login_admit("victim@x.io", f"10.{i // 250}.0.{i % 250}", now + i / 100)
        held = attempt_counts("victim@x.io", "192.0.2.9")["acct"]
        self.assertLessEqual(held, server._LOGIN_ACCOUNT_KEEP)
        self.assertGreaterEqual(held, server.LOGIN_ACCOUNT_PRESSURE)
        for _ in range(server.LOGIN_PAIR_LIMIT_UNDER_PRESSURE):
            server.login_admit("victim@x.io", "192.0.2.9", now + 6)
        with self.assertRaises(RateLimitError):
            server.login_admit("victim@x.io", "192.0.2.9", now + 6)

    def test_unknown_and_known_accounts_are_throttled_alike(self):
        from app import server, util
        from app.errors import AuthError, RateLimitError
        boot()
        with mock.patch.object(util, "verify_password", return_value=False):
            for email, ip in ((OWNER, "192.0.2.1"), ("nobody@test.local", "192.0.2.2")):
                for _ in range(server.LOGIN_LIMITS["pair"]):
                    with self.assertRaises(AuthError):
                        server.login(login_req(email=email, ip=ip))
                with self.assertRaises(RateLimitError):
                    server.login(login_req(email=email, ip=ip))
                limit = server.LOGIN_LIMITS["pair"]
                self.assertEqual(attempt_counts(email, ip),
                                 {"pair": limit, "acct": limit, "ip": limit})

    def test_client_limit_spans_accounts(self):
        from app import server
        from app.errors import RateLimitError
        now = 1_000_000.0
        for i in range(server.LOGIN_LIMITS["ip"]):
            server.login_admit(f"user{i}@x.io", "192.0.2.1", now)
        with self.assertRaises(RateLimitError):
            server.login_admit("fresh@x.io", "192.0.2.1", now)
        server.login_admit("fresh@x.io", "192.0.2.2", now)

    def test_denial_records_nothing_and_reports_when_to_retry(self):
        from app import server
        from app.errors import RateLimitError
        now = 1_000_000.0
        for i in range(server.LOGIN_LIMITS["pair"]):
            server.login_admit("o@x.io", "192.0.2.1", now + i)
        before = attempt_counts("o@x.io", "192.0.2.1")
        with self.assertRaises(RateLimitError) as denied:
            server.login_admit("o@x.io", "192.0.2.1", now + 100)
        self.assertEqual(attempt_counts("o@x.io", "192.0.2.1"), before)
        # The oldest entry (at `now`) frees a slot when it leaves the window.
        self.assertEqual(denied.exception.detail["retry_after_seconds"],
                         server.LOGIN_WINDOW_SECONDS - 100)
        server.login_admit("o@x.io", "192.0.2.1", now + server.LOGIN_WINDOW_SECONDS)

    def test_success_releases_the_reservation_and_clears_the_pair(self):
        from app import server, util
        from app.errors import AuthError
        boot()
        with mock.patch.object(util, "verify_password", return_value=False):
            for _ in range(server.LOGIN_LIMITS["pair"] - 1):
                with self.assertRaises(AuthError):
                    server.login(login_req())
        self.assertEqual(attempt_counts(OWNER, "9.9.9.9"), {"pair": 7, "acct": 7, "ip": 7})
        self.assertEqual(server.login(login_req(password=PASSWORD))[0], 200)
        # The failures stay on the account and client; the pair starts over.
        self.assertEqual(attempt_counts(OWNER, "9.9.9.9"), {"pair": 0, "acct": 7, "ip": 7})

    def test_unexpected_error_releases_the_reservation(self):
        from app import auth, server
        boot()
        with mock.patch.object(auth, "login", side_effect=RuntimeError("database unavailable")):
            with self.assertRaises(RuntimeError):
                server.login(login_req())
        self.assertEqual(attempt_counts(OWNER, "9.9.9.9"), {"pair": 0, "acct": 0, "ip": 0})
        self.assertEqual(server._LOGIN_ATTEMPTS, {})
        self.assertEqual(anonymous_rows(), [])
        # Neither the client's turn nor the verification slot is left taken.
        self.assertEqual(server._LOGIN_IN_PROGRESS, set())
        self.assertEqual(server.login(login_req(password=PASSWORD))[0], 200)

    def test_eviction_keeps_a_locked_pair_locked(self):
        from app import server
        from app.errors import RateLimitError
        now = 1_000_000.0
        cap = 60
        with mock.patch.object(server, "_LOGIN_MAX_KEYS", cap):
            for _ in range(server.LOGIN_LIMITS["pair"]):
                server.login_admit("victim@x.io", "192.0.2.1", now)
            largest = 0
            for i in range(400):
                server.login_admit(f"junk{i}@x.io", f"10.1.{i // 250}.{i % 250}", now + 1 + i / 1000)
                largest = max(largest, len(server._LOGIN_ATTEMPTS))
            # Each admission adds at most three keys on top of the cap.
            self.assertLessEqual(largest, cap + 3)
            self.assertGreaterEqual(len(server._LOGIN_ATTEMPTS), (cap * 9) // 10)
            # Among equally small keys the least recently used went first.
            self.assertEqual(attempt_counts("junk0@x.io", "10.1.0.0")["pair"], 0)
            self.assertEqual(attempt_counts("junk399@x.io", "10.1.1.149")["pair"], 1)
            with self.assertRaises(RateLimitError):
                server.login_admit("victim@x.io", "192.0.2.1", now + 2)
            self.assertEqual(attempt_counts("victim@x.io", "192.0.2.1")["pair"],
                             server.LOGIN_LIMITS["pair"])

    def test_eviction_drops_expired_keys_first(self):
        from app import server
        now = 1_000_000.0
        cap = 30
        with mock.patch.object(server, "_LOGIN_MAX_KEYS", cap):
            for i in range(11):                                  # 33 single-entry keys
                server.login_admit(f"old{i}@x.io", f"10.2.0.{i}", now)
            self.assertEqual(len(server._LOGIN_ATTEMPTS), 33)
            later = now + server.LOGIN_WINDOW_SECONDS + 1
            server.login_admit("new@x.io", "10.3.0.1", later)
            self.assertEqual(len(server._LOGIN_ATTEMPTS), 3)
            self.assertEqual(attempt_counts("new@x.io", "10.3.0.1"),
                             {"pair": 1, "acct": 1, "ip": 1})


# ---------------------------------------------------------------------------
# Audit volume
# ---------------------------------------------------------------------------
class TestAuditBudget(SignInCase):
    def test_throttled_requests_do_not_grow_the_audit_log(self):
        from app import server, util
        from app.errors import AuthError, RateLimitError
        boot()
        with mock.patch.object(util, "verify_password", return_value=False):
            for _ in range(server.LOGIN_LIMITS["pair"]):
                with self.assertRaises(AuthError):
                    server.login(login_req())
        for _ in range(200):
            with self.assertRaises(RateLimitError):
                server.login(login_req())
        rows = anonymous_rows()
        self.assertLessEqual(len(rows), 6)
        actions = sorted(r["action"] for r in rows)
        self.assertEqual(actions, ["auth.login_failed"] * 5 + ["auth.login_throttled"])
        account = hashlib.sha256(OWNER.encode("utf-8")).hexdigest()[:12]
        for row in rows:
            self.assertEqual(row["detail"], {"account": account, "client": "9.9.9.9"})
            self.assertEqual(row["outcome"], "denied")
        self.assertNotIn(OWNER, json.dumps(rows))

    def test_budget_is_shared_by_every_address_of_one_ipv6_network(self):
        from app import server, util
        from app.errors import AuthError, RateLimitError
        boot()
        outcomes = []
        with mock.patch.object(util, "verify_password", return_value=False):
            # One host moving through its own /64, a new address and a new
            # account for every request.
            for i in range(1, 256):
                try:
                    server.login(login_req(email=f"user{i}@test.local", ip=f"2001:db8:1:2::{i:x}"))
                except AuthError:
                    outcomes.append("failed")
                except RateLimitError:
                    outcomes.append("throttled")
        limit = server.LOGIN_LIMITS["ip"]
        self.assertEqual(outcomes, ["failed"] * limit + ["throttled"] * (255 - limit))
        actions = sorted(r["action"] for r in anonymous_rows())
        self.assertEqual(actions, ["auth.login_failed"] * 5 + ["auth.login_throttled"])

    def test_budget_is_per_client_and_renews_with_the_window(self):
        from app import server
        now = 1_000_000.0
        spent = [server._login_audit_allowed("192.0.2.1", "failed", now) for _ in range(8)]
        self.assertEqual(spent, [True] * 5 + [False] * 3)
        self.assertEqual([server._login_audit_allowed("192.0.2.1", "throttled", now)
                          for _ in range(3)], [True, False, False])
        self.assertTrue(server._login_audit_allowed("192.0.2.2", "failed", now))
        self.assertFalse(server._login_audit_allowed("192.0.2.1", "failed",
                                                     now + server.LOGIN_WINDOW_SECONDS - 1))
        self.assertTrue(server._login_audit_allowed("192.0.2.1", "failed",
                                                    now + server.LOGIN_WINDOW_SECONDS))

    def test_account_tag_ignores_case_and_padding(self):
        from app import server, util
        from app.errors import AuthError
        boot()
        with mock.patch.object(util, "verify_password", return_value=False):
            with self.assertRaises(AuthError):
                server.login(login_req(email="  Owner@Test.Local "))
        account = hashlib.sha256(OWNER.encode("utf-8")).hexdigest()[:12]
        self.assertEqual([r["detail"]["account"] for r in anonymous_rows()], [account])

    def test_successful_sign_in_is_still_audited(self):
        from app import audit, server
        boot()
        self.assertEqual(server.login(login_req(password=PASSWORD))[0], 200)
        rows = [r for r in audit.query(limit=50) if r["action"] == "auth.login"]
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["actor"], OWNER)


# ---------------------------------------------------------------------------
# Password and email checks
# ---------------------------------------------------------------------------
class TestCredentials(SignInCase):
    def test_valid_email_matches_the_browser_email_field(self):
        from app import auth
        accepted = [
            "owner@faisal-security-lab.local",
            "a.b+c@example.co",
            "A@b",
            "x!#$%&'*+/=?^_`{|}~-y@example.com",
            "a@" + "b" * 63 + ".com",
            "a" * 249 + "@b.co",                 # 254 characters
        ]
        rejected = [
            "faisal@gmail,com",
            "Faisal@2026!",
            "P@ss@word1",
            "x@y..com",
            "josé@example.com",
            "فيصل@example.com",
            "a@exämple.com",
            "a b@example.com",
            " a@b.co",
            "a@b.co ",
            "a@b.co\n",
            "a@b\t.co",
            "MyNewPassword2026",
            "@example.com",
            "x@",
            "x@.com",
            "x@y.com.",
            "x@-y.com",
            "x@y-.com",
            "a@" + "b" * 64 + ".com",
            "a" * 250 + "@b.co",                 # 255 characters
            "",
            None,
        ]
        for email in accepted:
            self.assertTrue(auth.valid_email(email), email)
        for email in rejected:
            self.assertFalse(auth.valid_email(email), repr(email))

    def test_padded_owner_password_signs_in_as_typed_or_stripped(self):
        from app import auth
        from app.errors import AuthError
        typed = "  spaced-password-1 \n"
        boot({"FSL_OWNER_PASSWORD": typed})
        self.assertTrue(auth.login(OWNER, typed)["token"])
        self.assertTrue(auth.login(OWNER, "spaced-password-1")["token"])
        self.assertTrue(auth.login(OWNER, "spaced-password-1 ")["token"])
        with self.assertRaises(AuthError):
            auth.login(OWNER, " spaced-password-2 ")

    def test_deliberate_surrounding_spaces_remain_part_of_a_password(self):
        from app import auth
        from app.errors import AuthError
        boot()
        auth.create_user("u@test.local", " padded-secret-1 ")
        self.assertTrue(auth.login("u@test.local", " padded-secret-1 ")["token"])
        with self.assertRaises(AuthError):
            auth.login("u@test.local", "padded-secret-1")

    def test_unknown_email_performs_exactly_one_password_verification(self):
        from app import auth, util
        from app.db import get_db
        from app.errors import AuthError
        boot()
        auth.create_user("gone@test.local", "disabled-pass-1")
        get_db().execute("UPDATE users SET active=0 WHERE email=?", ("gone@test.local",))
        for email in ("nobody@test.local", "gone@test.local", OWNER):
            with mock.patch.object(util, "verify_password", wraps=util.verify_password) as verify:
                with self.assertRaises(AuthError):
                    auth.login(email, "wrong-password")
            self.assertEqual(verify.call_count, 1, email)

    def test_padded_guess_costs_the_same_for_unknown_and_known_accounts(self):
        from app import auth, util
        from app.errors import AuthError
        boot()
        counts = []
        for email in ("nobody@test.local", OWNER):
            with mock.patch.object(util, "verify_password", wraps=util.verify_password) as verify:
                with self.assertRaises(AuthError):
                    auth.login(email, " wrong-password ")
            counts.append(verify.call_count)
        self.assertEqual(counts, [2, 2])


# ---------------------------------------------------------------------------
# Owner bootstrap and setup notices
# ---------------------------------------------------------------------------
class TestOwnerAndNotices(SignInCase):
    def test_invalid_owner_email_leaves_an_existing_owner_alone(self):
        from app import auth, bootstrap
        from app.errors import AuthError
        cfg, first = boot()
        self.assertTrue(first["owner_bootstrap"]["created"])
        _, again = boot({"FSL_OWNER_EMAIL": "MyNewPassword2026",
                         "FSL_OWNER_PASSWORD": "another-pass-99"}, data_dir=cfg.data_dir)
        self.assertEqual(again["setup_notices"], ["owner_email_ignored"])
        self.assertFalse(again["owner_bootstrap"]["created"])
        self.assertEqual([u["email"] for u in auth.list_users()], [OWNER])
        with self.assertRaises(AuthError):
            auth.login(auth.DEFAULT_OWNER_EMAIL, "another-pass-99")
        self.assertTrue(auth.login(OWNER, PASSWORD)["token"])
        self.assertIn("existing owner accounts are unchanged",
                      bootstrap.describe_notice("owner_email_ignored"))

    def test_invalid_owner_email_names_the_default_owner_on_every_start(self):
        from app import auth, bootstrap
        env = {"FSL_OWNER_EMAIL": "owner@example,com"}
        cfg, first = boot(env)
        self.assertEqual(first["setup_notices"], ["owner_email_invalid"])
        self.assertTrue(first["owner_bootstrap"]["created"])
        # The owner the fallback created must not turn the notice into
        # owner_email_ignored on later starts: that one names no address.
        for _ in range(2):
            _, again = boot(env, data_dir=cfg.data_dir)
            self.assertEqual(again["setup_notices"], ["owner_email_invalid"])
            self.assertEqual(bootstrap.SETUP_NOTICES, ["owner_email_invalid"])
            self.assertEqual(bootstrap.ADMIN_NOTICES, ["owner_email_invalid"])
            self.assertFalse(again["owner_bootstrap"]["created"])
            self.assertEqual(again["owner_bootstrap"]["email"], auth.DEFAULT_OWNER_EMAIL)
        self.assertEqual([u["email"] for u in auth.list_users()], [auth.DEFAULT_OWNER_EMAIL])
        self.assertTrue(auth.login(auth.DEFAULT_OWNER_EMAIL, PASSWORD)["token"])
        self.assertIn(auth.DEFAULT_OWNER_EMAIL, bootstrap.describe_notice("owner_email_invalid"))

    def test_invalid_owner_email_is_ignored_beside_a_real_and_a_default_owner(self):
        from app import auth
        # Mistyped first (default owner created), corrected later (real owner
        # created), then mistyped again: nothing more is created.
        cfg, _ = boot({"FSL_OWNER_EMAIL": "owner@example,com"})
        boot({"FSL_OWNER_EMAIL": "owner@example.com"}, data_dir=cfg.data_dir)
        _, again = boot({"FSL_OWNER_EMAIL": "owner@example,com"}, data_dir=cfg.data_dir)
        self.assertEqual(again["setup_notices"], ["owner_email_ignored"])
        self.assertIsNone(again["owner_bootstrap"]["email"])
        self.assertEqual(sorted(u["email"] for u in auth.list_users()),
                         ["owner@example.com", auth.DEFAULT_OWNER_EMAIL])

    def test_invalid_owner_email_falls_back_when_no_active_owner_exists(self):
        from app import auth
        from app.db import get_db
        cfg, _ = boot()
        get_db().execute("UPDATE users SET active=0 WHERE email=?", (OWNER,))
        _, again = boot({"FSL_OWNER_EMAIL": "not-an-email"}, data_dir=cfg.data_dir)
        self.assertEqual(again["setup_notices"], ["owner_email_invalid"])
        self.assertTrue(again["owner_bootstrap"]["created"])
        self.assertTrue(auth.login(auth.DEFAULT_OWNER_EMAIL, PASSWORD)["token"])

    def test_me_returns_client_info_and_notices_for_admins_only(self):
        from app import auth, server
        boot({"FSL_OWNER_EMAIL": "not-an-email"})
        auth.create_user("admin@test.local", "admin-pass-123", global_role="admin")
        auth.create_user("reader@test.local", "reader-pass-123", global_role="reader")

        def me(email, password):
            principal = auth.principal_from_token(auth.login(email, password)["token"])
            status, body = server.me(server.Req(principal, {}, {}, {}, client_ip="203.0.113.7",
                                                client_source="header",
                                                proxy_headers_ignored=False))
            self.assertEqual(status, 200)
            self.assertEqual(body["client"], {"address": "203.0.113.7", "source": "header",
                                              "proxy_headers_ignored": False})
            self.assertEqual(body["user"]["email"], email)
            return body

        self.assertEqual(me(auth.DEFAULT_OWNER_EMAIL, PASSWORD)["setup_notices"],
                         ["owner_email_invalid"])
        self.assertEqual(me("admin@test.local", "admin-pass-123")["setup_notices"],
                         ["owner_email_invalid"])
        self.assertNotIn("setup_notices", me("reader@test.local", "reader-pass-123"))

    def test_private_notice_is_absent_from_the_public_config(self):
        from app import auth, bootstrap, server
        with mock.patch("os.geteuid", return_value=0):
            _, info = boot({"FSL_PRIVDROP_FAILED": "1", "FSL_OWNER_EMAIL": "not-an-email"})
        self.assertEqual(sorted(info["setup_notices"]), ["owner_email_invalid", "running_as_root"])
        self.assertEqual(sorted(bootstrap.ADMIN_NOTICES), ["owner_email_invalid", "running_as_root"])
        self.assertEqual(bootstrap.SETUP_NOTICES, ["owner_email_invalid"])
        status, public = server.config_public(server.Req(None, {}, {}, {}))
        self.assertEqual(status, 200)
        self.assertEqual(public["setup_notices"], ["owner_email_invalid"])
        self.assertNotIn("root", json.dumps(public))
        owner = auth.principal_from_token(
            auth.login(auth.DEFAULT_OWNER_EMAIL, PASSWORD)["token"])
        _, body = server.me(server.Req(owner, {}, {}, {}))
        self.assertIn("running_as_root", body["setup_notices"])
        self.assertIn("running as root", bootstrap.describe_notice("running_as_root"))

    def test_root_is_only_reported_when_the_privilege_drop_failed(self):
        with mock.patch("os.geteuid", return_value=0):
            _, info = boot()
        self.assertEqual(info["setup_notices"], [])
        with mock.patch("os.geteuid", return_value=10001):
            _, info = boot({"FSL_PRIVDROP_FAILED": "1"})
        self.assertEqual(info["setup_notices"], [])


# ---------------------------------------------------------------------------
# Startup order
# ---------------------------------------------------------------------------
class TestStartup(SignInCase):
    def test_connector_registry_is_built_before_any_thread_starts(self):
        from app import server
        boot()
        events = []

        class RecordingThread:
            def __init__(self, *args, **kwargs):
                pass

            def start(self):
                events.append("thread")

        class StoppedServer:
            def serve_forever(self):
                raise KeyboardInterrupt

            def shutdown(self):
                pass

        info = {"setup_notices": [], "owner_bootstrap": {}, "catalog_seeded": 0,
                "ai_available": False}
        with mock.patch.object(server, "connector_names",
                               side_effect=lambda: events.append("registry") or []), \
                mock.patch.object(server, "threading", types.SimpleNamespace(Thread=RecordingThread)), \
                mock.patch.object(server, "build_server", return_value=StoppedServer()), \
                mock.patch.object(server, "init_platform", return_value=info), \
                mock.patch("sys.stderr", io.StringIO()):
            server.main()
        self.assertEqual(events[0], "registry")
        self.assertGreaterEqual(events.count("thread"), 2)      # worker(s) + tool sync


if __name__ == "__main__":
    unittest.main(verbosity=2)
