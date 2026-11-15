"""What the API answers when it refuses a scan or an asset, over real HTTP.

A refusal is a 403 that says what was refused and what the authorization
allows. A path that cannot be a path is refused the same way, not answered
with a server error. The same facts go to the audit record.
"""
from __future__ import annotations

import http.client
import json
import os
import sys
import tempfile
import threading
import unittest
from pathlib import Path
from unittest import mock

APP_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(APP_ROOT))

OWNER = ("owner@test.local", "correct-horse-battery")


class ApiCase(unittest.TestCase):
    def setUp(self):
        env = mock.patch.dict(os.environ)
        env.start()
        self.addCleanup(env.stop)
        for key in ("FSL_PUBLIC_VIEW", "FSL_DB_PATH", "FSL_EVIDENCE_DIR", "FSL_CLIENT_IP_HEADER",
                    "FSL_TRUSTED_PROXY_HOPS", "PORT"):
            os.environ.pop(key, None)
        os.environ.update({"FSL_DATA_DIR": tempfile.mkdtemp(prefix="fsl-refusal-"),
                           "FSL_OWNER_EMAIL": OWNER[0], "FSL_OWNER_PASSWORD": OWNER[1],
                           "FSL_NO_WORKER": "1"})
        from app.config import Config, reset_config_for_tests
        from app.db import Database, reset_db_for_tests
        cfg = Config.from_env()
        reset_config_for_tests(cfg)
        reset_db_for_tests(Database(cfg.db_path))
        from app import auth, server
        from app.bootstrap import init_platform
        init_platform(sync_tools=False)
        server.reset_login_throttle_for_tests()
        server._RATE.clear()
        # The real HTTP layer, on this machine only, on a port the system picks.
        self.srv = server.build_server("127.0.0.1", 0)
        self.port = self.srv.server_address[1]
        threading.Thread(target=self.srv.serve_forever, daemon=True).start()
        self.addCleanup(self.srv.server_close)
        self.addCleanup(self.srv.shutdown)
        self.token = auth.login(*OWNER)["token"]
        self.pid = self.post("/api/projects", {"name": "refusals"}, expect=201)["project"]["id"]
        # An authorized tree and a place beside it.
        self.root = Path(tempfile.mkdtemp(prefix="fsl-tree-")).resolve()
        self.code = self.root / "code"
        (self.code / "pkg").mkdir(parents=True)
        (self.code / "pkg" / "app.py").write_text("print('inside')\n")
        self.elsewhere = self.root / "elsewhere"
        self.elsewhere.mkdir()

    def call(self, method, path, body=None, raw_body=None):
        """(status, parsed JSON body). The body has to be JSON whatever the status."""
        conn = http.client.HTTPConnection("127.0.0.1", self.port, timeout=20)
        try:
            data = raw_body if body is None else json.dumps(body).encode("utf-8")
            headers = {"Authorization": f"Bearer {self.token}"}
            if data is not None:
                headers["Content-Type"] = "application/json"
            conn.request(method, path, body=data, headers=headers)
            resp = conn.getresponse()
            return resp.status, json.loads(resp.read().decode("utf-8"))
        finally:
            conn.close()

    def post(self, path, body, *, expect):
        status, out = self.call("POST", path, body)
        self.assertEqual(status, expect, out)
        return out

    def asset(self, identifier=None, **fields):
        body = {"kind": "source", "identifier": identifier or str(self.code), **fields}
        return self.post(f"/api/projects/{self.pid}/assets", body, expect=201)["asset"]

    def scope(self, asset, **fields):
        body = {"asset_id": asset["id"], "proof": "LAB", "scan_types": ["bandit"],
                "allowed_targets": [str(self.code)], **fields}
        return self.post(f"/api/projects/{self.pid}/scopes", body, expect=201)["scope"]

    def scan(self, asset, scope, params=None, connector="bandit"):
        return self.call("POST", f"/api/projects/{self.pid}/scans",
                         {"asset_id": asset["id"], "scope_id": scope["id"],
                          "connector": connector, "params": params or {}})

    def refused(self, asset, scope, params=None, connector="bandit") -> dict:
        """The error of a scan request that has to be refused by policy."""
        status, out = self.scan(asset, scope, params, connector)
        self.assertEqual(status, 403, out)
        self.assertEqual(out["error"]["code"], "policy_denied")
        return out["error"]

    def jobs(self):
        return self.call("GET", f"/api/projects/{self.pid}/jobs")[1]["jobs"]

    def audit(self, action):
        rows = self.call("GET", f"/api/audit?project={self.pid}")[1]["audit"]
        return [row for row in rows if row["action"] == action]


class TestAPathThatCannotBeAPath(ApiCase):
    """A NUL byte in a directory name used to end in a server error."""

    INVALID = "source directory is not a valid path"

    def test_a_nul_byte_in_source_path_is_a_refusal(self):
        asset = self.asset()
        scope = self.scope(asset)
        for path in (str(self.code) + "\x00/etc", "\x00", "/etc\x00" + str(self.code)):
            with self.subTest(source_path=path):
                error = self.refused(asset, scope, {"source_path": path})
                self.assertEqual(error["message"], self.INVALID)
                self.assertEqual(error["detail"], {"policy_code": "target_scope", "target": path,
                                                   "allowed": [str(self.code)]})
        self.assertEqual(self.jobs(), [])
        self.assertEqual(len(self.audit("scan.denied")), 3)

    def test_a_nul_byte_in_the_assets_local_path_is_a_refusal(self):
        asset = self.asset(metadata={"local_path": str(self.code) + "\x00x"})
        error = self.refused(asset, self.scope(asset))
        self.assertEqual(error["message"], self.INVALID)
        self.assertEqual(error["detail"]["policy_code"], "target_scope")
        self.assertEqual(self.jobs(), [])

    def test_a_nul_byte_in_the_identifier_is_a_refusal(self):
        asset = self.asset(identifier=str(self.code) + "\x00x")
        self.assertIn("\x00", asset["identifier"])
        for allowed in ([], [str(self.code)], [asset["identifier"]]):
            with self.subTest(allowed_targets=allowed):
                error = self.refused(asset, self.scope(asset, allowed_targets=allowed))
                self.assertEqual(error["detail"]["policy_code"], "target_scope")
        self.assertEqual(self.jobs(), [])

    def test_text_that_is_not_valid_unicode_is_a_refusal(self):
        asset = self.asset()
        scope = self.scope(asset)
        # A lone surrogate, as a JSON escape. It cannot be written to a file
        # system name, to the database or to the answer.
        for escaped in (r"\ud800", str(self.code) + r"/\udcff"):
            with self.subTest(source_path=escaped):
                raw = json.dumps({"asset_id": asset["id"], "scope_id": scope["id"],
                                  "connector": "bandit", "params": {"source_path": "@"}})
                status, out = self.call("POST", f"/api/projects/{self.pid}/scans",
                                        raw_body=raw.replace("@", escaped).encode("ascii"))
                self.assertEqual(status, 403, out)
                self.assertEqual(out["error"]["message"], self.INVALID)
                self.assertEqual(out["error"]["detail"]["allowed"], [str(self.code)])
        self.assertEqual(self.jobs(), [])
        self.assertEqual(len(self.audit("scan.denied")), 2)

    def test_an_allowed_target_that_cannot_be_a_path_allows_nothing(self):
        asset = self.asset()
        only_bad = self.scope(asset, allowed_targets=["/srv/x\x00y"])
        self.assertEqual(self.refused(asset, only_bad)["detail"]["policy_code"], "target_scope")
        # It does not get in the way of an entry that is a path.
        for allowed in (["/srv/x\x00y", str(self.code)], [str(self.code), "/srv/x\x00y"]):
            with self.subTest(allowed_targets=allowed):
                status, out = self.scan(asset, self.scope(asset, allowed_targets=allowed))
                self.assertEqual(status, 201, out)

    def test_an_excluded_target_that_cannot_be_a_path_stops_the_scan(self):
        asset = self.asset()
        scope = self.scope(asset, denied_targets=["/srv/x\x00y"])
        error = self.refused(asset, scope)
        self.assertEqual(error["message"], "an excluded target of the scope is not a valid path")
        self.assertEqual(self.jobs(), [])

    def test_an_address_that_cannot_be_read_is_a_refusal(self):
        asset = self.asset()
        error = self.refused(asset, self.scope(asset), {"target": "http://["})
        self.assertEqual(error["message"], "target is not a valid address")
        self.assertEqual(error["detail"], {"policy_code": "target_scope", "target": "http://[",
                                           "allowed": [str(self.code)]})

    def test_any_other_path_error_in_the_check_is_a_refusal_too(self):
        from app import scope as scope_mod
        asset = self.asset()
        scope = self.scope(asset)
        for error in (ValueError("embedded null byte"), OSError(36, "File name too long")):
            with self.subTest(error=type(error).__name__):
                with mock.patch.object(scope_mod, "check_targets", side_effect=error):
                    refusal = self.refused(asset, scope)
                self.assertEqual(refusal["message"], "target is not a valid address or path")
                self.assertEqual(refusal["detail"], {"policy_code": "target_scope", "target": "",
                                                     "allowed": [str(self.code)]})
        self.assertEqual(self.jobs(), [])


class TestARefusalSaysWhatToChange(ApiCase):
    OUTSIDE = "target is outside the authorized scope"
    NOT_LISTED = "connector 'semgrep' is not in the authorized scan types"

    def test_a_wrong_allowed_target_is_named_together_with_the_refused_target(self):
        asset = self.asset()
        for allowed in (["/etc"], [str(self.root)], ["/etc", "example.org"]):
            with self.subTest(allowed_targets=allowed):
                error = self.refused(asset, self.scope(asset, allowed_targets=allowed))
                self.assertEqual(error, {"code": "policy_denied", "message": self.OUTSIDE,
                                         "detail": {"policy_code": "target_scope",
                                                    "target": str(self.code), "allowed": allowed}})
        # The form that covers a directory and what is below it is accepted.
        status, out = self.scan(asset, self.scope(asset, allowed_targets=[str(self.root) + "/*"]))
        self.assertEqual(status, 201, out)

    def test_without_allowed_targets_the_assets_identifier_is_what_is_allowed(self):
        asset = self.asset()
        scope = self.scope(asset, allowed_targets=[])
        error = self.refused(asset, scope, {"source_path": str(self.elsewhere)})
        self.assertEqual(error["message"], "source directory is outside the authorized scope")
        self.assertEqual(error["detail"], {"policy_code": "target_scope",
                                           "target": str(self.elsewhere),
                                           "allowed": [str(self.code)]})

    def test_an_excluded_directory_is_named(self):
        asset = self.asset()
        scope = self.scope(asset, denied_targets=[str(self.code / "pkg")])
        error = self.refused(asset, scope, {"source_path": str(self.code / "pkg")})
        self.assertEqual(error["message"], "target is explicitly excluded by scope")
        self.assertEqual(error["detail"], {"policy_code": "target_scope",
                                           "target": str(self.code / "pkg"),
                                           "allowed": [str(self.code)]})

    def test_a_source_path_that_is_not_text_is_named_as_text(self):
        asset = self.asset()
        error = self.refused(asset, self.scope(asset), {"source_path": ["/etc"]})
        self.assertEqual(error["message"], "source_path must be a directory path")
        self.assertEqual(error["detail"], {"policy_code": "target_scope", "target": "['/etc']",
                                           "allowed": [str(self.code)]})

    def test_a_connector_outside_the_scan_types_is_named_with_the_scan_types(self):
        asset = self.asset()
        scope = self.scope(asset, scan_types=["bandit", "gitleaks"])
        error = self.refused(asset, scope, connector="semgrep")
        self.assertEqual(error["message"], self.NOT_LISTED)
        self.assertEqual(error["detail"], {"policy_code": "connector_not_authorized",
                                           "connector": "semgrep",
                                           "allowed": ["bandit", "gitleaks"]})
        empty = self.scope(asset, scan_types=[])
        self.assertEqual(self.refused(asset, empty)["detail"],
                         {"policy_code": "connector_not_authorized", "connector": "bandit",
                          "allowed": []})

    def test_other_refusals_keep_their_message_and_carry_the_code_only(self):
        asset = self.asset()
        expired = self.scope(asset, valid_until="2001-01-01T00:00:00Z")
        self.assertEqual(self.refused(asset, expired),
                         {"code": "policy_denied", "message": "authorization window has expired",
                          "detail": {"policy_code": "window"}})
        revoked = self.scope(asset)
        self.post(f"/api/scopes/{revoked['id']}/revoke", {}, expect=200)
        self.assertEqual(self.refused(asset, revoked),
                         {"code": "policy_denied", "message": "authorization scope is not active",
                          "detail": {"policy_code": "scope_inactive"}})

    def test_the_audit_record_carries_the_same_facts(self):
        asset = self.asset()
        self.refused(asset, self.scope(asset, allowed_targets=["/etc"]))
        self.refused(asset, self.scope(asset), connector="semgrep")
        by_code = {row["detail"]["code"]: row for row in self.audit("scan.denied")}
        self.assertEqual(by_code["target_scope"]["detail"],
                         {"reason": self.OUTSIDE, "code": "target_scope",
                          "target": str(self.code), "allowed": ["/etc"]})
        self.assertEqual(by_code["connector_not_authorized"]["detail"],
                         {"reason": self.NOT_LISTED,
                          "code": "connector_not_authorized", "connector": "semgrep",
                          "allowed": ["bandit"]})
        for row in by_code.values():
            self.assertEqual((row["outcome"], row["actor"]), ("denied", OWNER[0]))

    def test_secrets_in_what_is_named_are_redacted_and_long_text_is_cut(self):
        asset = self.asset()
        # Put together here so that no secret-shaped text stands in this file.
        token, password = "-".join(("tok", "9f8e7d6c", "5b4a")), "-".join(("hunter2", "hunter2"))
        address = "https://files.example.org/repo?token=" + token
        scope = self.scope(asset, allowed_targets=[str(self.code),
                                                   "https://ci.example.org/?password=" + password])
        error = self.refused(asset, scope, {"target": address})
        self.assertEqual(error["message"], self.OUTSIDE)
        shown = json.dumps(error) + json.dumps(self.audit("scan.denied"))
        for secret in (token, password):
            self.assertNotIn(secret, shown)
        self.assertEqual(error["detail"]["target"],
                         "https://files.example.org/repo?token=«redacted»")
        self.assertEqual(error["detail"]["allowed"],
                         [str(self.code), "https://ci.example.org/?password=«redacted»"])
        long_path = "/srv/" + "a" * 5000
        error = self.refused(asset, scope, {"source_path": long_path})
        self.assertLess(len(error["detail"]["target"]), 600)
        self.assertTrue(error["detail"]["target"].startswith("/srv/aaaa"))


class TestAssetMetadata(ApiCase):
    def create(self, **fields):
        body = {"kind": "source", "identifier": "/srv/null-meta", "criticality": "medium", **fields}
        return self.call("POST", f"/api/projects/{self.pid}/assets", body)

    def test_null_means_no_metadata(self):
        for fields in ({"metadata": None}, {}, {"metadata": {}}):
            with self.subTest(fields=fields):
                status, out = self.create(**fields)
                self.assertEqual(status, 201, out)
                self.assertEqual(out["asset"]["metadata"], {})

    def test_another_shape_is_still_refused(self):
        for value in (["internal"], "internal", 7, True, False, 0, ""):
            with self.subTest(metadata=value):
                status, out = self.create(metadata=value)
                self.assertEqual(status, 400, out)
                self.assertEqual(out["error"]["message"], "metadata must be an object")


if __name__ == "__main__":
    unittest.main(verbosity=2)
