"""The directory a source scan reads is part of what a scope authorizes."""
from __future__ import annotations

import os
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

APP_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(APP_ROOT))

from app.errors import ForbiddenError, PolicyDenied  # noqa: E402


def boot():
    tmp = Path(tempfile.mkdtemp(prefix="fsl-scope-"))
    for key in ("FSL_PUBLIC_VIEW", "FSL_DB_PATH", "FSL_EVIDENCE_DIR", "FSL_NO_WORKER"):
        os.environ.pop(key, None)
    os.environ["FSL_DATA_DIR"] = str(tmp)
    os.environ.update({"FSL_OWNER_EMAIL": "owner@test.local",
                       "FSL_OWNER_PASSWORD": "correct-horse-battery"})
    from app.config import Config, reset_config_for_tests
    from app.db import Database, reset_db_for_tests
    cfg = Config.from_env()
    reset_config_for_tests(cfg)
    reset_db_for_tests(Database(cfg.db_path))
    from app.bootstrap import init_platform
    init_platform(sync_tools=False)
    return cfg


class ScopeCase(unittest.TestCase):
    def setUp(self):
        env = mock.patch.dict(os.environ)
        env.start()
        self.addCleanup(env.stop)
        boot()
        from app import auth, store
        self.token = auth.login("owner@test.local", "correct-horse-battery")["token"]
        self.owner = auth.principal_from_token(self.token)
        self.project = store.create_project("scope-sources", self.owner.user_id)
        self.pid = self.project["id"]
        # An authorized tree, a place beside it, and a link from inside to outside.
        self.root = Path(tempfile.mkdtemp(prefix="fsl-tree-")).resolve()
        self.code = self.root / "code"
        (self.code / "pkg").mkdir(parents=True)
        (self.code / "pkg" / "app.py").write_text("print('inside')\n")
        self.elsewhere = self.root / "elsewhere"
        self.elsewhere.mkdir()
        (self.elsewhere / "secret.py").write_text("PASSWORD = 'outside'\n")
        os.symlink(self.elsewhere, self.code / "link-out")

    def asset(self, identifier=None, kind="source", metadata=None):
        from app import store
        return store.create_asset(self.pid, kind, identifier or str(self.code),
                                  created_by=self.owner.user_id, metadata=metadata or {})

    def scope(self, asset, **fields):
        from app import store
        fields.setdefault("allowed_targets", [str(self.code)])
        fields.setdefault("scan_types", ["bandit"])
        return store.create_scope(self.pid, asset["id"], proof="LAB", created_by=self.owner.user_id,
                                  **fields)

    def request(self, asset, scope, params=None, connector="bandit"):
        """A scan request through the real route handler."""
        from app import server
        req = server.Req(self.owner, {"pid": self.pid}, {},
                         {"asset_id": asset["id"], "scope_id": scope["id"],
                          "connector": connector, "params": params or {}})
        return server.scan_enqueue(req)


class TestSourceDirectoryAtRequestTime(ScopeCase):
    def test_another_directory_is_refused(self):
        asset = self.asset()
        scope = self.scope(asset)
        for outside in (str(self.elsewhere), "/etc", str(self.root), "/",
                        str(self.code / ".." / "elsewhere"),          # dot-dot
                        str(self.code) + "/../elsewhere",
                        str(self.code / "link-out"),                   # a link that leads out
                        str(self.code) + "-old"):                      # a sibling with the same start
            with self.subTest(source_path=outside):
                with self.assertRaises(ForbiddenError) as denied:
                    self.request(asset, scope, {"source_path": outside})
                self.assertEqual(denied.exception.code, "policy_denied")
        from app import queue
        self.assertEqual(queue.list_jobs(self.pid), [])

    def test_the_authorized_directory_and_what_is_below_it_are_accepted(self):
        asset = self.asset()
        scope = self.scope(asset)
        for inside in (None, str(self.code), str(self.code) + "/", str(self.code / "pkg"),
                       str(self.code / "pkg" / ".." / "pkg")):
            with self.subTest(source_path=inside):
                params = {} if inside is None else {"source_path": inside}
                status, body = self.request(asset, scope, params)
                self.assertEqual(status, 201)
                self.assertEqual(body["job"]["state"], "queued")

    def test_a_source_path_that_is_not_text_is_refused(self):
        asset = self.asset()
        scope = self.scope(asset)
        for value in (["/etc"], {"p": "/etc"}, 7, True):
            with self.subTest(value=value):
                with self.assertRaises(ForbiddenError):
                    self.request(asset, scope, {"source_path": value})

    def test_the_assets_own_local_path_is_checked_too(self):
        # The asset names one place and carries another in its metadata; the
        # scope was granted for the place it names.
        asset = self.asset(metadata={"local_path": str(self.elsewhere)})
        scope = self.scope(asset)
        with self.assertRaises(ForbiddenError):
            self.request(asset, scope)
        # A local_path inside the scope is what it is for.
        asset = self.asset(identifier="my-service", metadata={"local_path": str(self.code / "pkg")})
        scope = self.scope(asset, allowed_targets=["my-service", str(self.code)])
        self.assertEqual(self.request(asset, scope)[0], 201)

    def test_an_excluded_directory_stays_excluded(self):
        asset = self.asset()
        scope = self.scope(asset, denied_targets=[str(self.code / "pkg")])
        with self.assertRaises(ForbiddenError):
            self.request(asset, scope, {"source_path": str(self.code / "pkg")})
        self.assertEqual(self.request(asset, scope, {"source_path": str(self.code)})[0], 201)

    def test_a_star_pattern_covers_the_directory_and_what_is_below(self):
        asset = self.asset()
        scope = self.scope(asset, allowed_targets=[str(self.code) + "/*", str(self.code)])
        self.assertEqual(self.request(asset, scope, {"source_path": str(self.code / "pkg")})[0], 201)
        with self.assertRaises(ForbiddenError):
            self.request(asset, scope, {"source_path": str(self.code / ".." / "elsewhere")})

    def test_a_host_or_url_in_the_allow_list_names_no_directory(self):
        from app import scope as scope_mod
        asset = self.asset()
        for pattern in ("example.org", "*.example.org", "https://example.org/app", "etc"):
            scope = {"allowed_targets": [pattern], "denied_targets": []}
            with self.subTest(pattern=pattern), self.assertRaises(PolicyDenied):
                scope_mod.check_source_dir(scope, asset, "/etc")


class TestScopeWithoutAllowedTargets(ScopeCase):
    def test_it_covers_the_assets_own_identifier_only(self):
        from app import scope as scope_mod
        asset = self.asset()
        scope = self.scope(asset, allowed_targets=[])
        # The asset itself can be scanned ...
        self.assertEqual(self.request(asset, scope)[0], 201)
        self.assertEqual(self.request(asset, scope, {"source_path": str(self.code / "pkg")})[0], 201)
        # ... another directory or another host cannot.
        with self.assertRaises(ForbiddenError):
            self.request(asset, scope, {"source_path": str(self.elsewhere)})
        web = self.asset(identifier="https://app.example.org", kind="web")
        empty = {"allowed_targets": [], "denied_targets": []}
        scope_mod.check_targets(empty, web, {})
        scope_mod.check_targets(empty, web, {"target": "https://app.example.org"})
        # Exactly the identifier: another address on the same host has to be
        # named in the allowed targets (the host name covers all of them).
        for other in ("https://app.example.org/login", "https://other.example.net",
                      "https://example.org", "10.0.0.5"):
            with self.subTest(target=other), self.assertRaises(PolicyDenied):
                scope_mod.check_targets(empty, web, {"target": other})


class TestSourceDirectoryInTheWorker(ScopeCase):
    def test_a_job_whose_directory_changed_after_the_request_is_blocked(self):
        from app import queue
        from app.db import get_db
        from app.worker import Worker
        asset = self.asset()
        scope = self.scope(asset)
        _status, body = self.request(asset, scope)
        jid = body["job"]["id"]
        # Someone with write access to the queue points the job elsewhere.
        import json
        get_db().execute("UPDATE jobs SET params=? WHERE id=?",
                         (json.dumps({"source_path": str(self.elsewhere)}), jid))
        copied = []
        with mock.patch.object(Worker, "_copy_bounded",
                               lambda self, src, dst: copied.append(str(src))):
            Worker(worker_id="t").run_once()
        job = queue.get_job(jid)
        self.assertEqual(job["state"], "blocked")
        self.assertEqual(copied, [])

    def test_staging_checks_the_resolved_directory_itself(self):
        from app.worker import Worker
        asset = self.asset()
        scope = self.scope(asset)
        staged = Path(tempfile.mkdtemp(prefix="fsl-stage-"))
        worker = Worker(worker_id="t")
        for outside in (str(self.elsewhere), str(self.code / "link-out")):
            with self.subTest(source_path=outside), self.assertRaises(PolicyDenied):
                worker._stage_source({"params": {"source_path": outside}}, asset, scope, staged)
        self.assertEqual(list(staged.iterdir()), [])
        worker._stage_source({"params": {}}, asset, scope, staged)
        self.assertTrue((staged / "pkg" / "app.py").is_file())
        # A link inside the tree is not followed while copying.
        self.assertFalse((staged / "link-out" / "secret.py").exists())


class TestInternalAssets(ScopeCase):
    def test_marking_an_asset_internal_takes_the_admin_role(self):
        from app import auth, server, store
        analyst = auth.create_user("analyst@test.local", "another-long-password")
        store.add_member(self.pid, analyst["id"], "analyst")
        principal = auth.principal_from_token(
            auth.login("analyst@test.local", "another-long-password")["token"])

        def create(who, metadata):
            return server.assets_create(server.Req(who, {"pid": self.pid}, {},
                                                   {"kind": "web", "identifier": "https://intranet.example",
                                                    "metadata": metadata}))

        self.assertEqual(create(principal, {})[0], 201)
        self.assertEqual(create(principal, {"internal": False})[0], 201)
        with self.assertRaises(ForbiddenError):
            create(principal, {"internal": True})
        self.assertEqual(create(self.owner, {"internal": True})[0], 201)
        from app.errors import ValidationError
        with self.assertRaises(ValidationError):
            create(principal, ["internal"])


if __name__ == "__main__":
    unittest.main(verbosity=2)
