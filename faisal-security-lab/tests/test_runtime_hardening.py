"""Run-time behaviour on a small container: the tool version probe, a clean
stop on SIGTERM, the worker count and a mistyped FSL_PUBLIC_VIEW."""
from __future__ import annotations

import os
import signal
import stat
import subprocess
import sys
import tempfile
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


if __name__ == "__main__":
    unittest.main(verbosity=2)
