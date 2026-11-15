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


class TestSlashAtTheEndOfARelativeSourcePath(ScopeCase):
    """A source asset may be named by a relative path. A slash at its end, in
    the identifier or in the allowed target, names the same directory."""

    NAME = "samples/vulnerable-app"
    CASES = {
        "identifier with the slash, no allowed targets": (NAME + "/", []),
        "identifier and allowed target both with the slash": (NAME + "/", [NAME + "/"]),
        "identifier without the slash, allowed target with it": (NAME, [NAME + "/"]),
        "identifier with the slash, allowed target without it": (NAME + "/", [NAME]),
    }

    def test_the_directory_and_what_is_below_it_are_accepted(self):
        for label, (identifier, allowed) in self.CASES.items():
            with self.subTest(label):
                asset = self.asset(identifier=identifier)
                scope = self.scope(asset, allowed_targets=allowed)
                self.assertEqual(self.request(asset, scope)[0], 201)
                for inside in (self.NAME, self.NAME + "/", self.NAME + "/pkg"):
                    self.assertEqual(self.request(asset, scope, {"source_path": inside})[0], 201)

    def test_a_directory_outside_it_is_still_refused(self):
        from app import queue
        for label, (identifier, allowed) in self.CASES.items():
            asset = self.asset(identifier=identifier)
            scope = self.scope(asset, allowed_targets=allowed)
            for outside in ("/etc", "samples", "samples/other", self.NAME + "-old",
                            self.NAME + "/../other", str(self.elsewhere)):
                with self.subTest(label, source_path=outside):
                    with self.assertRaises(ForbiddenError) as denied:
                        self.request(asset, scope, {"source_path": outside})
                    self.assertEqual(denied.exception.code, "policy_denied")
        self.assertEqual(queue.list_jobs(self.pid), [])


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

    def test_a_blocked_job_is_recorded_with_what_was_refused(self):
        import json
        from app import audit
        from app.db import get_db
        from app.worker import Worker
        asset = self.asset()
        scope = self.scope(asset)
        jid = self.request(asset, scope)[1]["job"]["id"]
        get_db().execute("UPDATE jobs SET params=? WHERE id=?",
                         (json.dumps({"source_path": str(self.elsewhere)}), jid))
        Worker(worker_id="t").run_once()
        blocked = [row for row in audit.query(self.pid) if row["action"] == "job.blocked"]
        self.assertEqual(len(blocked), 1)
        self.assertEqual(blocked[0]["detail"],
                         {"reason": "source directory is outside the authorized scope",
                          "code": "target_scope", "target": str(self.elsewhere),
                          "allowed": [str(self.code)]})


class TestStagingReadsTheDirectoryThatWasChecked(ScopeCase):
    """The worker opens the checked directory once and reads it through that
    open directory, so a change made after the check cannot redirect it."""

    def setUp(self):
        super().setUp()
        from app.worker import Worker
        self.worker = Worker(worker_id="t")
        self.staged = Path(tempfile.mkdtemp(prefix="fsl-stage-"))
        self.asset_row = self.asset()
        self.scope_row = self.scope(self.asset_row)

    def stage(self, source_path=None):
        params = {} if source_path is None else {"source_path": str(source_path)}
        self.worker._stage_source({"params": params}, self.asset_row, self.scope_row, self.staged)

    def staged_files(self):
        return sorted(p.relative_to(self.staged).as_posix()
                      for p in self.staged.rglob("*") if not p.is_dir())

    def changed_after_the_check(self, change):
        """Run the real scope check, then change the tree before it is read."""
        from app import scope as scope_mod
        real_check = scope_mod.check_source_dir

        def check_then_change(scope, asset, directory):
            result = real_check(scope, asset, directory)
            change()
            return result
        return mock.patch.object(scope_mod, "check_source_dir", check_then_change)

    def link_code_to_elsewhere(self):
        self.code.rename(self.root / "code-moved")
        os.symlink(self.elsewhere, self.code)

    def test_a_link_put_in_place_of_the_directory_after_the_check_is_refused(self):
        with self.changed_after_the_check(self.link_code_to_elsewhere):
            with self.assertRaises(PolicyDenied):
                self.stage()
        self.assertEqual(list(self.staged.iterdir()), [])       # nothing from elsewhere

    def test_a_link_put_in_place_of_a_directory_above_it_is_refused(self):
        # The scan reads code/pkg. After the check "code" becomes a link to a
        # tree that has a pkg of its own.
        (self.elsewhere / "pkg").mkdir()
        (self.elsewhere / "pkg" / "secret.py").write_text("PASSWORD = 'outside'\n")
        with self.changed_after_the_check(self.link_code_to_elsewhere):
            with self.assertRaises(PolicyDenied):
                self.stage(self.code / "pkg")
        self.assertEqual(list(self.staged.iterdir()), [])

    def test_the_job_of_a_directory_swapped_before_it_is_read_ends_blocked(self):
        from app import queue
        from app.connectors import get_connector
        bandit = type(get_connector("bandit"))
        jid = self.request(self.asset_row, self.scope_row)[1]["job"]["id"]
        checks = []

        def swap_after_the_workers_own_check():
            checks.append("check")
            if len(checks) == 2:                # the first is the policy check
                self.link_code_to_elsewhere()
        ran = []
        ready = {"installed": True, "available": True, "version": "0", "detail": "stand-in"}
        with self.changed_after_the_check(swap_after_the_workers_own_check), \
                mock.patch.object(bandit, "readiness", lambda self: ready), \
                mock.patch.object(bandit, "execute", lambda self, ctx: ran.append(ctx)):
            self.worker.run_once()
        job = queue.get_job(jid)
        self.assertEqual(job["state"], "blocked")
        self.assertEqual(job["error"], {"code": "policy_denied",
                                        "message": "source directory changed after it was checked"})
        self.assertEqual((len(checks), ran), (2, []))       # no tool was started

    def test_another_directory_put_in_its_place_while_it_is_opened_is_refused(self):
        from app import worker as worker_mod
        real_open = worker_mod._open_real_dir

        def open_then_replace(real):
            fd = real_open(real)
            self.code.rename(self.root / "code-moved")
            self.elsewhere.rename(self.code)
            return fd
        with mock.patch.object(worker_mod, "_open_real_dir", open_then_replace):
            with self.assertRaises(PolicyDenied):
                self.stage()
        self.assertEqual(list(self.staged.iterdir()), [])

    def test_a_linked_file_and_a_linked_directory_are_not_copied(self):
        os.symlink(self.elsewhere / "secret.py", self.code / "pkg" / "linked-secret.py")
        os.symlink(self.code / "pkg" / "app.py", self.code / "linked-app.py")
        os.symlink(self.code / "pkg", self.code / "linked-pkg")
        self.stage()
        self.assertEqual(self.staged_files(), ["pkg/app.py"])
        for name in ("link-out", "linked-pkg"):                 # link-out is made by setUp
            self.assertFalse((self.staged / name).exists())

    def test_an_ordinary_tree_is_copied_with_the_same_layout(self):
        files = {"README.md": b"# sample\n", "pkg/app.py": b"print('inside')\n",
                 "pkg/sub/deep/mod.py": b"VALUE = 1\n", "pkg/data.bin": bytes(range(256)) * 40,
                 "pkg/empty.txt": b"", "has space/ملف.txt": "نص".encode("utf-8")}
        ignored = (".git/config", "node_modules/x/index.js", "pkg/__pycache__/app.pyc",
                   "pkg/sub/.venv/pyvenv.cfg", "build/out.js")
        for name, data in {**files, **{name: b"ignored" for name in ignored}}.items():
            path = self.code / name
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(data)
        (self.code / "empty-dir").mkdir()
        os.chmod(self.code / "README.md", 0o640)
        os.utime(self.code / "README.md", (1_600_000_000, 1_600_000_000))
        self.stage()
        self.assertEqual(self.staged_files(), sorted(files))
        for name, data in files.items():
            with self.subTest(file=name):
                self.assertEqual((self.staged / name).read_bytes(), data)
        self.assertTrue((self.staged / "empty-dir").is_dir())
        for name in (".git", "node_modules", "build", "pkg/__pycache__", "pkg/sub/.venv"):
            with self.subTest(ignored=name):
                self.assertFalse((self.staged / name).exists())
        copied = (self.staged / "README.md").stat()
        self.assertEqual((copied.st_mode & 0o777, int(copied.st_mtime)), (0o640, 1_600_000_000))
        # A directory below the authorized one is staged the same way.
        below = Path(tempfile.mkdtemp(prefix="fsl-stage-"))
        self.worker._stage_source({"params": {"source_path": str(self.code / "pkg" / "sub")}},
                                  self.asset_row, self.scope_row, below)
        self.assertEqual([p.relative_to(below).as_posix() for p in below.rglob("*.py")],
                         ["deep/mod.py"])

    def test_a_hard_linked_file_is_copied_like_any_other_file(self):
        # Package managers make hard links inside a tree; they are ordinary files.
        os.link(self.code / "pkg" / "app.py", self.code / "pkg" / "same.py")
        self.stage()
        self.assertEqual(self.staged_files(), ["pkg/app.py", "pkg/same.py"])

    def test_what_cannot_be_read_is_left_out(self):
        os.mkfifo(self.code / "pkg" / "pipe")                   # opening it must not wait
        locked = self.code / "pkg" / "locked.py"
        locked.write_text("x = 1\n")
        locked.chmod(0)
        self.stage()
        expected = ["pkg/app.py"]
        if os.access(locked, os.R_OK):                          # root reads it anyway
            expected.append("pkg/locked.py")
        self.assertEqual(self.staged_files(), expected)

    def test_the_size_limit_still_applies(self):
        from app import worker as worker_mod
        from app.errors import ConnectorError
        (self.code / "big.txt").write_text("x" * 64)
        with mock.patch.object(worker_mod, "_MAX_SOURCE_BYTES", 32):
            with self.assertRaises(ConnectorError) as stopped:
                self.stage()
        self.assertIn("size limit", stopped.exception.message)

    def test_a_missing_directory_or_a_file_is_reported_and_not_read(self):
        from app.errors import ConnectorError
        for not_a_directory in (self.code / "absent", self.code / "pkg" / "app.py"):
            with self.subTest(source_path=not_a_directory.name):
                with self.assertRaises(ConnectorError) as failed:
                    self.stage(not_a_directory)
                self.assertIn("not found or not a directory", failed.exception.message)
        self.assertEqual(list(self.staged.iterdir()), [])

    def test_a_directory_the_worker_may_not_open_is_reported_as_such(self):
        from app import worker as worker_mod
        from app.errors import ConnectorError
        denied = PermissionError(13, "Permission denied")
        with mock.patch.object(worker_mod, "_open_real_dir", side_effect=denied):
            with self.assertRaises(ConnectorError) as failed:
                self.stage()
        self.assertEqual(failed.exception.message, f"source directory cannot be read: {self.code}")
        self.assertEqual(list(self.staged.iterdir()), [])

    @unittest.skipIf(hasattr(os, "geteuid") and os.geteuid() == 0, "root may open any directory")
    def test_a_directory_without_read_permission_is_not_scanned_as_if_it_were_empty(self):
        from app.errors import ConnectorError
        self.code.chmod(0o300)                  # may be entered, may not be listed
        self.addCleanup(self.code.chmod, 0o700)
        with self.assertRaises(ConnectorError) as failed:
            self.stage()
        self.assertIn("cannot be read", failed.exception.message)
        # One level down the same thing is skipped, as before, and the rest is copied.
        self.code.chmod(0o700)
        (self.code / "closed").mkdir()
        (self.code / "closed" / "hidden.py").write_text("x = 1\n")
        (self.code / "closed").chmod(0o300)
        self.addCleanup((self.code / "closed").chmod, 0o700)
        self.stage()
        self.assertEqual(self.staged_files(), ["pkg/app.py"])


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
