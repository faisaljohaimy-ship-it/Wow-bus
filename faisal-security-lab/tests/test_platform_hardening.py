"""Startup, storage and container hardening.

Covers the parts of a hosted deploy that fail quietly when they go wrong: the
temporary-storage fallback for an unusable data directory, the standalone
worker on a private database, the tool registry under concurrent start-up, and
the container entrypoint's decisions about which directory it may re-own.
"""
from __future__ import annotations

import os
import select
import shutil
import subprocess
import sys
import tempfile
import threading
import time
import unittest
from collections import Counter
from pathlib import Path
from unittest import mock

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
ENTRYPOINT = ROOT / "deploy" / "entrypoint.sh"

WORKER_EXIT_MESSAGE = ("[worker] data directory is not writable; a standalone worker needs "
                       "the same data directory as the API. Exiting.")


def unusable_dir() -> Path:
    """A directory path nobody can create, root included: it sits under a regular file."""
    blocker = Path(tempfile.mkdtemp(prefix="fsl-block-")).resolve() / "file"
    blocker.write_text("x")
    return blocker / "data"


def writable_dir() -> Path:
    return Path(tempfile.mkdtemp(prefix="fsl-good-")).resolve()


class TestStorageFallback(unittest.TestCase):
    def setUp(self):
        from app import config
        env = mock.patch.dict(os.environ)
        env.start()
        self.addCleanup(env.stop)
        for key in ("FSL_DATA_DIR", "FSL_DB_PATH", "FSL_EVIDENCE_DIR", "FSL_SECRET_KEY"):
            os.environ.pop(key, None)
        config.reset_fallback_dir_for_tests()
        self.addCleanup(config.reset_fallback_dir_for_tests)

    def test_fallback_directory_is_stable_within_a_process(self):
        from app.config import Config
        os.environ["FSL_DATA_DIR"] = str(unusable_dir())
        first = Config.from_env()
        second = Config.from_env()
        self.assertTrue(first.data_dir_fallback)
        self.assertTrue(first.data_dir.is_dir())
        self.assertEqual(second.data_dir, first.data_dir)
        self.assertEqual(second.db_path, first.db_path)
        self.assertEqual(second.evidence_dir, first.evidence_dir)
        # The session secret lives in the data directory, so it is stable too.
        self.assertEqual(second.secret_key, first.secret_key)

    def test_explicit_paths_are_honoured_when_only_the_data_dir_is_unusable(self):
        from app.config import Config
        good = writable_dir()
        bad = unusable_dir()
        os.environ.update({"FSL_DATA_DIR": str(bad),
                           "FSL_DB_PATH": str(good / "db" / "lab.db"),
                           "FSL_EVIDENCE_DIR": str(good / "ev")})
        cfg = Config.from_env()
        self.assertEqual(cfg.db_path, good / "db" / "lab.db")
        self.assertEqual(cfg.evidence_dir, good / "ev")
        self.assertTrue(cfg.evidence_dir.is_dir())
        # The data directory itself was substituted (it holds the session
        # secret, which is then lost on restart), so the flag is still set even
        # though the database and the evidence stay where the operator put them.
        self.assertNotEqual(cfg.data_dir, bad)
        self.assertTrue(cfg.data_dir.is_dir())
        self.assertTrue(cfg.data_dir_fallback)

    def test_only_the_unusable_database_location_is_substituted(self):
        from app.config import Config
        good = writable_dir()
        os.environ.update({"FSL_DATA_DIR": str(good),
                           "FSL_DB_PATH": str(unusable_dir() / "lab.db"),
                           "FSL_EVIDENCE_DIR": str(good / "ev")})
        cfg = Config.from_env()
        self.assertEqual(cfg.data_dir, good)
        self.assertEqual(cfg.evidence_dir, good / "ev")
        self.assertTrue(cfg.db_path.parent.is_dir())
        self.assertNotIn(good, cfg.db_path.parents)      # temporary storage, not the data dir
        self.assertTrue(cfg.data_dir_fallback)

    def test_only_the_unusable_evidence_location_is_substituted(self):
        from app.config import Config
        good = writable_dir()
        os.environ.update({"FSL_DATA_DIR": str(good),
                           "FSL_DB_PATH": str(good / "lab.db"),
                           "FSL_EVIDENCE_DIR": str(unusable_dir())})
        cfg = Config.from_env()
        self.assertEqual(cfg.data_dir, good)
        self.assertEqual(cfg.db_path, good / "lab.db")
        self.assertTrue(cfg.evidence_dir.is_dir())
        self.assertNotIn(good, cfg.evidence_dir.parents)
        self.assertTrue(cfg.data_dir_fallback)

    def test_flag_is_clear_when_every_location_is_usable(self):
        from app.config import Config
        good = writable_dir()
        elsewhere = writable_dir()
        os.environ.update({"FSL_DATA_DIR": str(good),
                           "FSL_DB_PATH": str(elsewhere / "lab.db"),
                           "FSL_EVIDENCE_DIR": str(elsewhere / "ev")})
        cfg = Config.from_env()
        self.assertEqual((cfg.data_dir, cfg.db_path, cfg.evidence_dir),
                         (good, elsewhere / "lab.db", elsewhere / "ev"))
        self.assertFalse(cfg.data_dir_fallback)


class TestStandaloneWorker(unittest.TestCase):
    def _env(self, data_dir: Path, tmp: Path) -> dict:
        env = {k: v for k, v in os.environ.items() if not k.startswith("FSL_")}
        # TMPDIR keeps any temporary storage the process creates inside `tmp`.
        env.update({"FSL_DATA_DIR": str(data_dir), "TMPDIR": str(tmp)})
        return env

    def test_exits_when_the_data_directory_is_unusable(self):
        tmp = Path(tempfile.mkdtemp(prefix="fsl-worker-"))
        try:
            proc = subprocess.run([sys.executable, "-m", "app.worker"], cwd=str(ROOT),
                                  env=self._env(unusable_dir(), tmp),
                                  capture_output=True, text=True, timeout=60)
        except subprocess.TimeoutExpired:
            self.fail("the worker kept running on temporary storage instead of exiting")
        self.assertNotEqual(proc.returncode, 0)
        self.assertIn(WORKER_EXIT_MESSAGE, proc.stderr)
        self.assertNotIn("polling queue", proc.stderr)
        # It stopped before creating a database in the temporary storage.
        self.assertEqual([p.name for p in tmp.rglob("*.db")], [])

    def test_starts_polling_when_the_data_directory_is_usable(self):
        tmp = Path(tempfile.mkdtemp(prefix="fsl-worker-"))
        data = writable_dir()
        proc = subprocess.Popen([sys.executable, "-m", "app.worker"], cwd=str(ROOT),
                                env=self._env(data, tmp), stdout=subprocess.DEVNULL,
                                stderr=subprocess.PIPE, bufsize=0)
        log = b""
        try:
            fd = proc.stderr.fileno()
            deadline = time.monotonic() + 60
            while b"polling queue" not in log and time.monotonic() < deadline:
                if select.select([fd], [], [], 1.0)[0]:
                    chunk = os.read(fd, 4096)
                    if not chunk:       # the process exited
                        break
                    log += chunk
        finally:
            proc.terminate()
            proc.wait(timeout=30)
            proc.stderr.close()
        self.assertIn(b"polling queue", log)
        self.assertTrue((data / "faisal-security-lab.db").exists())


def platform_without_tool_sync():
    """Fresh isolated platform whose tool registry has not been synced yet."""
    tmp = Path(tempfile.mkdtemp(prefix="fsl-harden-"))
    os.environ.update({"FSL_DATA_DIR": str(tmp), "FSL_DB_PATH": str(tmp / "test.db"),
                       "FSL_EVIDENCE_DIR": str(tmp / "evidence"),
                       "FSL_OWNER_EMAIL": "owner@test.local",
                       "FSL_OWNER_PASSWORD": "owner-password-123"})
    from app.config import Config, reset_config_for_tests
    from app.db import Database, reset_db_for_tests
    cfg = Config.from_env()
    reset_config_for_tests(cfg)
    reset_db_for_tests(Database(cfg.db_path))
    from app.bootstrap import init_platform
    init_platform(sync_tools=False)
    return cfg


def synthetic_connector(name: str, version: str = "syn-1"):
    from app.connectors.base import Connector

    class Syn(Connector):
        category = "test"
        connector_type = "network"

        def readiness(self):
            return {"installed": True, "available": True, "version": self.version,
                    "detail": "synthetic"}

    Syn.name = name
    conn = Syn()
    conn.version = version
    return conn


class TestRecordVerified(unittest.TestCase):
    def setUp(self):
        from app.connectors import registry
        platform_without_tool_sync()
        registry._build()
        self.conn = synthetic_connector("syn_verify")
        registry._REGISTRY[self.conn.name] = self.conn
        self.addCleanup(registry._REGISTRY.pop, self.conn.name, None)

    def test_before_the_first_sync_it_creates_a_verified_row_that_sync_keeps(self):
        from app import store
        from app.connectors import registry
        self.assertIsNone(store.get_tool_registry("syn_verify"))

        registry.record_verified("syn_verify")
        row = store.get_tool_registry("syn_verify")
        self.assertIsNotNone(row, "the verification was dropped: no tool_registry row")
        self.assertEqual(row["state"], "verified")
        self.assertEqual(row["last_verified_ref"], "syn_verify@syn-1|connector=Syn")
        self.assertTrue(row["last_verified_at"])
        self.assertEqual((row["category"], row["connector_type"], row["version"]),
                         ("test", "network", "syn-1"))

        states = {r["name"]: r["state"] for r in registry.sync_registry()}
        self.assertEqual(states["syn_verify"], "verified")
        row = store.get_tool_registry("syn_verify")
        self.assertEqual(row["state"], "verified")
        self.assertEqual(row["last_verified_ref"], "syn_verify@syn-1|connector=Syn")

        # A changed tool version no longer matches the verified reference.
        self.conn.version = "syn-2"
        registry.sync_registry()
        self.assertEqual(store.get_tool_registry("syn_verify")["state"], "stale")

    def test_a_job_finishing_during_the_sync_stays_verified(self):
        from app import store
        from app.connectors import registry
        real_upsert = store.upsert_tool_registry
        finisher: list[threading.Thread] = []

        def upsert_while_a_job_finishes(name, meta):
            # The sync has read "no row yet" for this connector and is about to
            # write it; a job for the same connector completes at that moment.
            if name == "syn_verify" and not finisher:
                t = threading.Thread(target=registry.record_verified, args=("syn_verify",))
                finisher.append(t)
                t.start()
                t.join(timeout=0.5)
            real_upsert(name, meta)

        with mock.patch.object(store, "upsert_tool_registry", upsert_while_a_job_finishes):
            registry.sync_registry()
            finisher[0].join(timeout=30)
        self.assertFalse(finisher[0].is_alive())
        self.assertEqual(store.get_tool_registry("syn_verify")["state"], "verified")


class TestRegistryBuild(unittest.TestCase):
    def test_sixteen_threads_build_each_connector_once(self):
        from app.connectors import registry
        from app.connectors.base import Connector
        built: Counter = Counter()
        count_lock = threading.Lock()

        def slow_class(name):
            class Slow(Connector):
                def __init__(self):
                    with count_lock:
                        built[name] += 1
                    time.sleep(0.02)    # hold the registry half-built for a moment
            Slow.name = name
            return Slow

        classes = [slow_class(f"slow_{i}") for i in range(6)]
        names = {c.name for c in classes}
        saved_classes, saved_registry = registry._CONNECTOR_CLASSES, dict(registry._REGISTRY)

        def restore():
            registry._CONNECTOR_CLASSES = saved_classes
            registry._REGISTRY.clear()
            registry._REGISTRY.update(saved_registry)

        self.addCleanup(restore)
        registry._CONNECTOR_CLASSES = classes
        registry._REGISTRY.clear()

        barrier = threading.Barrier(16)
        complete: list[bool] = []

        def build():
            barrier.wait()
            registry._build()
            complete.append(names <= set(registry._REGISTRY))

        threads = [threading.Thread(target=build) for _ in range(16)]
        for t in threads:
            t.start()
        for t in threads:
            t.join(timeout=30)
        self.assertEqual(dict(built), {n: 1 for n in names})
        # Every caller sees the whole registry as soon as its _build() returns.
        self.assertEqual(complete, [True] * 16)


def _canonicalises_missing_paths() -> bool:
    try:
        return subprocess.run(["realpath", "-m", "--", "/nonexistent/a/../b"],
                              capture_output=True, text=True,
                              timeout=30).stdout.strip() == "/nonexistent/b"
    except (OSError, subprocess.SubprocessError):
        return False


@unittest.skipUnless(shutil.which("sh") and _canonicalises_missing_paths(),
                     "needs sh and a realpath that supports -m (GNU coreutils)")
class TestEntrypointDryRun(unittest.TestCase):
    """The dry run prints the entrypoint's decisions and acts on none of them."""

    @classmethod
    def setUpClass(cls):
        # The script runs from an empty directory, so a relative FSL_DATA_DIR
        # can never point into the source tree.
        cls.cwd = tempfile.mkdtemp(prefix="fsl-entry-")

    def run_entrypoint(self, data_dir=None, dry_run=True):
        # A script without the dry-run switch would, as root, create and re-own
        # the very paths under test, so it is never started.
        self.assertIn("FSL_ENTRYPOINT_DRY_RUN", ENTRYPOINT.read_text(),
                      "entrypoint has no dry-run mode; refusing to execute it")
        env = {"PATH": os.environ.get("PATH", "/usr/local/bin:/usr/bin:/bin")}
        if dry_run:
            env["FSL_ENTRYPOINT_DRY_RUN"] = "1"
        if data_dir is not None:
            env["FSL_DATA_DIR"] = data_dir
        return subprocess.run(["sh", str(ENTRYPOINT), "sh", "-c", "echo command-was-run"],
                              cwd=self.cwd, env=env, capture_output=True, text=True, timeout=30)

    def decisions(self, data_dir=None) -> list[str]:
        target = os.path.join(self.cwd, "/data" if data_dir is None else data_dir)
        existed = os.path.lexists(target)
        proc = self.run_entrypoint(data_dir)
        self.assertEqual(proc.returncode, 0, proc.stderr)
        self.assertNotIn("command-was-run", proc.stdout)
        self.assertEqual(os.path.lexists(target), existed, "the dry run created the directory")
        self.stderr = proc.stderr
        return proc.stdout.splitlines()

    def assert_accepted(self, data_dir, expected=None):
        # realpath() only differs from the literal on a machine where part of
        # the path is a symlink.
        canonical = os.path.realpath(expected or data_dir)
        lines = self.decisions(data_dir)
        self.assertEqual(lines[0], f"data-dir: accept {canonical}")
        if os.geteuid() != 0:
            # Started as the service user: nothing to re-own, nothing to drop.
            self.assertEqual(lines[1:], ["chown: no", "drop: no"])
        else:
            self.assertEqual(lines[2], "drop: yes")
            if not os.path.exists(canonical):
                self.assertEqual(lines[1], "chown: yes")    # root would create it root-owned
        return lines

    def assert_refused(self, data_dir):
        lines = self.decisions(data_dir)
        self.assertEqual(lines[:2], [f"data-dir: refuse {data_dir}", "chown: no"])
        if os.geteuid() == 0:
            self.assertEqual(lines[2], "drop: yes")
            self.assertIn(f"'{data_dir}'", self.stderr)     # the refusal names the value
        else:
            self.assertEqual(lines[2], "drop: no")

    def test_default_is_data(self):
        self.assertEqual(self.decisions()[0], "data-dir: accept " + os.path.realpath("/data"))

    def test_dedicated_directories_are_accepted(self):
        for value in ("/data", "/var/lib/fsl", "/srv/fsl", "/mnt/disk", "/opt/fsl/data",
                      "/library", "/application/data"):
            with self.subTest(value=value):
                self.assert_accepted(value)

    def test_accepted_path_is_canonical(self):
        self.assert_accepted("/data/", expected="/data")
        self.assert_accepted("/srv/other/../fsl", expected="/srv/fsl")

    def test_relative_path_is_refused(self):
        self.assert_refused("data")
        self.assert_refused("./var/data")

    def test_root_and_system_trees_are_refused(self):
        for value in ("/", "/usr", "/usr/local/fsl", "/app", "/app/data", "/etc", "/etc/fsl",
                      "/bin", "/sbin", "/lib", "/lib64/fsl", "/home/fsl/data", "/root",
                      "/proc/1", "/sys", "/dev/shm", "/boot", "/run/fsl"):
            with self.subTest(value=value):
                self.assert_refused(value)

    def test_shared_top_level_directories_are_refused_exactly(self):
        for value in ("/var", "/tmp", "/opt", "/mnt", "/srv", "/media"):
            with self.subTest(value=value):
                self.assert_refused(value)

    def test_path_that_resolves_into_a_system_tree_is_refused(self):
        self.assert_refused("/data/../usr")
        self.assert_refused("//usr")
        link = Path(tempfile.mkdtemp(prefix="fsl-link-")) / "data"
        link.symlink_to("/usr/share")
        self.assert_refused(str(link))

    @unittest.skipUnless(os.geteuid() == 0, "ownership decisions only apply when started as root")
    def test_ownership_changes_only_when_the_owner_differs(self):
        owned = Path(tempfile.mkdtemp(prefix="fsl-owned-")).resolve()
        foreign = Path(tempfile.mkdtemp(prefix="fsl-foreign-")).resolve()
        os.chown(owned, 10001, 10001)
        os.chown(foreign, 4242, 4242)
        lines = self.decisions(str(owned))
        if not lines[0].startswith("data-dir: accept"):
            self.skipTest("the temporary directory is inside a system tree")
        self.assertEqual(lines, [f"data-dir: accept {owned}", "chown: no", "drop: yes"])
        self.assertEqual(self.decisions(str(foreign)),
                         [f"data-dir: accept {foreign}", "chown: yes", "drop: yes"])
        self.assertEqual(os.stat(foreign).st_uid, 4242)     # reported, not performed

    @unittest.skipIf(os.geteuid() == 0, "as root the real entrypoint would create and re-own /data")
    def test_non_root_start_runs_the_command_as_is(self):
        proc = self.run_entrypoint("/usr", dry_run=False)
        self.assertEqual((proc.returncode, proc.stdout, proc.stderr), (0, "command-was-run\n", ""))


if __name__ == "__main__":
    unittest.main(verbosity=2)
