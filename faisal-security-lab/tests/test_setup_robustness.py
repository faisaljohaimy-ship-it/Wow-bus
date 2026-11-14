"""Startup must survive operator mistakes made in a hosting dashboard.

Regression tests for a real failed deploy: a hand-typed FSL_OWNER_PASSWORD
shorter than the minimum (and later a non-email FSL_OWNER_EMAIL) crashed the
server at boot. The service must instead start, refuse to create a weak owner,
and report a stable notice code that the sign-in page explains.
"""
from __future__ import annotations

import os
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))


def boot(env: dict):
    """Fresh isolated platform with the given owner/env overrides."""
    tmp = Path(tempfile.mkdtemp(prefix="fsl-setup-"))
    for key in ("FSL_OWNER_EMAIL", "FSL_OWNER_PASSWORD", "FSL_DB_PATH", "FSL_EVIDENCE_DIR",
                "FSL_AI_PROVIDER", "FSL_AI_API_KEY", "PORT"):
        os.environ.pop(key, None)
    os.environ["FSL_DATA_DIR"] = str(tmp)
    os.environ.update(env)
    from app.config import Config, reset_config_for_tests
    from app.db import Database, reset_db_for_tests
    cfg = Config.from_env()
    reset_config_for_tests(cfg)
    reset_db_for_tests(Database(cfg.db_path))
    from app.bootstrap import init_platform
    return cfg, init_platform(sync_tools=False)


class TestOwnerBootstrap(unittest.TestCase):
    def test_short_password_does_not_crash_and_creates_no_owner(self):
        from app import auth
        from app.errors import AuthError
        cfg, info = boot({"FSL_OWNER_EMAIL": "owner@test.local", "FSL_OWNER_PASSWORD": "abc12345"})
        self.assertIn("owner_password_too_short", info["setup_notices"])
        self.assertFalse(info["owner_bootstrap"]["created"])
        self.assertEqual(auth.list_users(), [])            # nobody can sign in
        with self.assertRaises(AuthError):
            auth.login("owner@test.local", "abc12345")

    def test_nine_characters_rejected_ten_accepted(self):
        from app import auth
        _, info = boot({"FSL_OWNER_EMAIL": "owner@test.local", "FSL_OWNER_PASSWORD": "a" * 9})
        self.assertIn("owner_password_too_short", info["setup_notices"])
        _, info = boot({"FSL_OWNER_EMAIL": "owner@test.local", "FSL_OWNER_PASSWORD": "a1b2c3d4e5"})
        self.assertEqual(info["setup_notices"], [])
        self.assertTrue(info["owner_bootstrap"]["created"])
        self.assertTrue(auth.login("owner@test.local", "a1b2c3d4e5")["token"])

    def test_invalid_email_falls_back_to_default(self):
        from app import auth
        # The operator typed something that is not an email into FSL_OWNER_EMAIL.
        _, info = boot({"FSL_OWNER_EMAIL": "MyNewPassword2026", "FSL_OWNER_PASSWORD": "long-enough-pass"})
        self.assertIn("owner_email_invalid", info["setup_notices"])
        self.assertEqual(info["owner_bootstrap"]["email"], auth.DEFAULT_OWNER_EMAIL)
        self.assertTrue(auth.login(auth.DEFAULT_OWNER_EMAIL, "long-enough-pass")["token"])

    def test_invalid_email_and_short_password_together(self):
        _, info = boot({"FSL_OWNER_EMAIL": "not-an-email", "FSL_OWNER_PASSWORD": "short"})
        self.assertEqual(sorted(info["setup_notices"]),
                         ["owner_email_invalid", "owner_password_too_short"])

    def test_surrounding_whitespace_is_stripped(self):
        from app import auth
        _, info = boot({"FSL_OWNER_EMAIL": "owner@test.local",
                        "FSL_OWNER_PASSWORD": "  spaced-password-1 \n"})
        self.assertEqual(info["setup_notices"], [])
        self.assertTrue(auth.login("owner@test.local", "spaced-password-1")["token"])

    def test_unset_password_generates_one_time_password(self):
        from app import auth
        _, info = boot({"FSL_OWNER_EMAIL": "owner@test.local"})
        self.assertIn("owner_password_generated", info["setup_notices"])
        pw = info["owner_bootstrap"]["password"]
        self.assertGreaterEqual(len(pw), auth.MIN_PASSWORD_LENGTH)
        self.assertTrue(auth.login("owner@test.local", pw)["token"])

    def test_existing_owner_is_left_alone(self):
        from app.bootstrap import init_platform
        _, first = boot({"FSL_OWNER_EMAIL": "owner@test.local", "FSL_OWNER_PASSWORD": "first-password-1"})
        self.assertTrue(first["owner_bootstrap"]["created"])
        again = init_platform(sync_tools=False)
        self.assertFalse(again["owner_bootstrap"]["created"])
        self.assertEqual(again["setup_notices"], [])

    def test_notices_are_exposed_as_codes_only(self):
        from app import bootstrap, server
        boot({"FSL_OWNER_EMAIL": "owner@test.local", "FSL_OWNER_PASSWORD": "tiny"})
        status, body = server.config_public(server.Req(None, {}, {}, {}))
        self.assertEqual(status, 200)
        self.assertEqual(body["setup_notices"], ["owner_password_too_short"])
        self.assertNotIn("tiny", str(body))
        self.assertTrue(bootstrap.describe_notice("owner_password_too_short"))


class TestDataDirFallback(unittest.TestCase):
    def test_unusable_data_dir_falls_back_instead_of_crashing(self):
        # A path under a regular file can never be created, whoever we run as.
        blocker = Path(tempfile.mkdtemp(prefix="fsl-block-")) / "file"
        blocker.write_text("x")
        cfg, info = boot({"FSL_DATA_DIR": str(blocker / "data")})
        self.assertTrue(cfg.data_dir_fallback)
        self.assertIn("data_dir_unwritable", info["setup_notices"])
        self.assertTrue(cfg.db_path.exists())
        self.assertTrue(str(cfg.db_path).startswith(str(cfg.data_dir)))


class TestLoginThrottle(unittest.TestCase):
    def setUp(self):
        from app import server
        server._LOGIN_FAILS.clear()

    def test_pair_limit_blocks_then_expires(self):
        from app import server
        now = 1_000_000.0
        for _ in range(server.LOGIN_LIMITS["pair"]):
            self.assertFalse(server.login_throttled("o@x.io", "1.2.3.4", now))
            server.login_record_failure("o@x.io", "1.2.3.4", now)
        self.assertTrue(server.login_throttled("o@x.io", "1.2.3.4", now))
        # Another client is not blocked by this client's failures.
        self.assertFalse(server.login_throttled("o@x.io", "5.6.7.8", now))
        # The window slides.
        self.assertFalse(server.login_throttled("o@x.io", "1.2.3.4",
                                                now + server.LOGIN_WINDOW_SECONDS + 1))

    def test_account_limit_holds_across_clients(self):
        from app import server
        now = 2_000_000.0
        for i in range(server.LOGIN_LIMITS["acct"]):
            server.login_record_failure("victim@x.io", f"10.0.{i // 250}.{i % 250}", now)
        self.assertTrue(server.login_throttled("victim@x.io", "172.16.0.9", now))
        self.assertFalse(server.login_throttled("other@x.io", "172.16.0.9", now))

    def test_success_clears_the_pair(self):
        from app import server
        now = 3_000_000.0
        for _ in range(server.LOGIN_LIMITS["pair"] - 1):
            server.login_record_failure("o@x.io", "1.2.3.4", now)
        server.login_record_success("o@x.io", "1.2.3.4")
        server.login_record_failure("o@x.io", "1.2.3.4", now)
        self.assertFalse(server.login_throttled("o@x.io", "1.2.3.4", now))

    def test_login_route_returns_429_after_repeated_failures(self):
        from app import server
        from app.errors import AuthError, RateLimitError
        boot({"FSL_OWNER_EMAIL": "owner@test.local", "FSL_OWNER_PASSWORD": "correct-horse-1"})
        req = server.Req(None, {}, {}, {"email": "owner@test.local", "password": "wrong"},
                         client_ip="9.9.9.9")
        for _ in range(server.LOGIN_LIMITS["pair"]):
            with self.assertRaises(AuthError):
                server.login(req)
        with self.assertRaises(RateLimitError):
            server.login(req)
        # Even the right password is refused while the window is active.
        ok = server.Req(None, {}, {}, {"email": "owner@test.local", "password": "correct-horse-1"},
                        client_ip="9.9.9.9")
        with self.assertRaises(RateLimitError):
            server.login(ok)


class TestRegistryProbe(unittest.TestCase):
    def test_verified_ref_reuses_given_readiness(self):
        from app.connectors.base import Connector

        class Probe(Connector):
            name = "probe"
            calls = 0

            def readiness(self):
                Probe.calls += 1
                return {"installed": True, "available": True, "version": "1.0"}

        c = Probe()
        r = c.readiness()
        self.assertEqual(c.verified_ref(r), "probe@1.0|connector=Probe")
        self.assertEqual(Probe.calls, 1)   # no second probe


if __name__ == "__main__":
    unittest.main(verbosity=2)
