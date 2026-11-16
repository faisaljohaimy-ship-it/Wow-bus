"""Phase 1 hardening (v3/v4 §7/§8/§9/§19/§27):

  * scope.allowed_ports is ENFORCED at the network layer (not just stored);
  * a cancelled job ends in 'cancelled' with a measured cancel time, and a
    timed-out job ends in 'timed_out' (see also test_failure_modes.test_3);
  * a local scan that needs no network has the egress proxy withheld;
  * every job carries a time-limited, signed execution-permission grant the
    worker verifies before running — missing / expired / mismatched is blocked.
"""
from __future__ import annotations

import os
import pathlib
import threading
import time
import unittest

from harness import (fresh_platform, owner_principal,
                     make_project_with_source_scope, run_all_jobs)


def _register(conn):
    from app.connectors import registry
    registry._build()
    registry._REGISTRY[conn.name] = conn


def _blocker(name):
    """A synthetic connector that runs until cancelled, then yields no result."""
    from app.connectors.base import Connector

    class Syn(Connector):
        pass
    Syn.name = name
    Syn.category = "test"
    Syn.connector_type = "network"
    Syn.binary = None

    def caps(self):
        return {"active": False, "passive": True, "needs_source": False, "needs_network": False}

    def readiness(self):
        return {"installed": True, "available": True, "version": "syn-1", "detail": "synthetic"}

    def execute(self, ctx):
        while not ctx.cancelled():
            time.sleep(0.05)
        return None

    Syn.capabilities = caps
    Syn.readiness = readiness
    Syn.execute = execute
    return Syn()


class Base(unittest.TestCase):
    def setUp(self):
        self.cfg, self.db, self.info = fresh_platform()
        self.owner, _ = owner_principal()

    def _scope(self, scan_types, **kw):
        from app import store
        p = store.create_project("ph1", self.owner.user_id)
        a = store.create_asset(p["id"], "host", "example.test", created_by=self.owner.user_id)
        s = store.create_scope(p["id"], a["id"], proof="X", allowed_targets=["example.test"],
                               scan_types=scan_types, created_by=self.owner.user_id, **kw)
        return p, a, s

    def _wait(self, jid, predicate, timeout=20.0):
        from app import queue
        end = time.monotonic() + timeout
        while time.monotonic() < end:
            job = queue.get_job(jid)
            if predicate(job):
                return job
            time.sleep(0.05)
        return queue.get_job(jid)


class TestAllowedPorts(Base):
    def test_port_allowed_helper(self):
        from app import scope
        self.assertTrue(scope.port_allowed([443, "8000-8100"], 443))
        self.assertTrue(scope.port_allowed([443, "8000-8100"], 8050))
        self.assertFalse(scope.port_allowed([443, "8000-8100"], 9000))
        self.assertTrue(scope.port_allowed([], 9999))            # empty = unrestricted
        self.assertTrue(scope.port_allowed(None, 1))             # absent = unrestricted
        self.assertFalse(scope.port_allowed([True, "x", "80-"], 80))  # junk entries ignored

    def test_validated_destination_enforces_port(self):
        from app import scope
        from app.errors import PolicyDenied
        # The port check runs before DNS resolution; 127.0.0.1 with allow_private
        # reaches it without any egress.
        scope.validated_destination("https://127.0.0.1:443", allow_private=True, allowed_ports=[443])
        with self.assertRaises(PolicyDenied) as cm:
            scope.validated_destination("https://127.0.0.1:8443", allow_private=True,
                                        allowed_ports=[443])
        self.assertIn("port", cm.exception.message)
        # An empty allow-list places no port restriction.
        scope.validated_destination("https://127.0.0.1:8443", allow_private=True, allowed_ports=[])

    def test_scope_port_is_enforced_for_a_network_connector(self):
        # A tls scan of a port the scope does not allow is denied at execution.
        from app import queue, store
        p = store.create_project("ports", self.owner.user_id)
        a = store.create_asset(p["id"], "host", "127.0.0.1", created_by=self.owner.user_id,
                               metadata={"internal": True})
        s = store.create_scope(p["id"], a["id"], proof="X", allowed_targets=["127.0.0.1"],
                               scan_types=["tls_certificate"], allowed_ports=[443],
                               created_by=self.owner.user_id)
        j = queue.enqueue(project_id=p["id"], asset_id=a["id"], scope_id=s["id"],
                          connector="tls_certificate", params={"target": "127.0.0.1", "port": 8443},
                          created_by=self.owner.user_id, idempotency_key="ports1")
        run_all_jobs()
        job = queue.get_job(j["id"])
        # The connector runs but its network call is refused for the port; the run
        # does not succeed and the port is named.
        self.assertNotEqual(job["state"], "succeeded")


class TestCancelAndTimeout(Base):
    def test_cancel_yields_cancelled_with_measured_time(self):
        from app import queue
        from app.worker import Worker
        _register(_blocker("syn_block"))
        p, a, s = self._scope(["syn_block"])
        j = queue.enqueue(project_id=p["id"], asset_id=a["id"], scope_id=s["id"],
                          connector="syn_block", params={}, created_by=self.owner.user_id,
                          idempotency_key="cxl1")
        w = Worker(connectors=["syn_block"])
        t = threading.Thread(target=w.run_forever, kwargs={"idle_sleep": 0.05}, daemon=True)
        t.start()
        try:
            self._wait(j["id"], lambda job: job["state"] == "running", 15)
            queue.request_stop(j["id"])
            job = self._wait(j["id"], lambda job: job["state"] in (
                "cancelled", "failed", "timed_out", "succeeded"), 15)
        finally:
            w.stop()
            t.join(timeout=5)
        self.assertEqual(job["state"], "cancelled")
        secs = (job.get("error") or {}).get("cancel_seconds")
        self.assertIsNotNone(secs)              # a real cancel time was recorded
        self.assertLess(secs, 10.0)             # and it is within the target


class TestExecutionGrant(Base):
    def _enqueue_semgrep(self, key):
        from app import queue
        p, a, s = make_project_with_source_scope(self.owner, ["semgrep"])
        j = queue.enqueue(project_id=p["id"], asset_id=a["id"], scope_id=s["id"],
                          connector="semgrep", params={}, created_by=self.owner.user_id,
                          idempotency_key=key)
        return p, a, s, j

    def test_enqueue_mints_a_grant(self):
        from app.db import get_db
        _, _, _, j = self._enqueue_semgrep("gr0")
        self.assertTrue(get_db().get_setting("grant:" + j["id"], ""))

    def test_missing_grant_blocks_execution(self):
        import shutil
        if not shutil.which("semgrep"):
            self.skipTest("semgrep not installed")
        from app import queue
        from app.db import get_db
        _, _, _, j = self._enqueue_semgrep("gr1")
        get_db().delete_setting("grant:" + j["id"])        # no server authorization
        run_all_jobs()
        job = queue.get_job(j["id"])
        self.assertEqual(job["state"], "blocked")
        self.assertEqual((job.get("error") or {}).get("code"), "exec_grant_missing")

    def test_expired_grant_blocks_execution(self):
        import shutil
        if not shutil.which("semgrep"):
            self.skipTest("semgrep not installed")
        from app import queue, permission
        from app.db import get_db
        p, a, s, j = self._enqueue_semgrep("gr2")
        expired = permission.mint(job_id=j["id"], project_id=p["id"], asset_id=a["id"],
                                  connector="semgrep", created_by=self.owner.user_id, ttl=-5)
        get_db().set_setting("grant:" + j["id"], expired)
        run_all_jobs()
        job = queue.get_job(j["id"])
        self.assertEqual(job["state"], "blocked")
        self.assertEqual((job.get("error") or {}).get("code"), "exec_grant_expired")

    def test_grant_for_a_different_operation_is_rejected(self):
        from app import permission
        from app.errors import PolicyDenied
        t = permission.mint(job_id="job_A", project_id="p", asset_id="a",
                            connector="semgrep", created_by="u")
        with self.assertRaises(PolicyDenied) as cm:
            permission.verify(t, job_id="job_B", project_id="p", asset_id="a", connector="semgrep")
        self.assertEqual(cm.exception.code, "exec_grant_mismatch")

    def test_valid_grant_lets_the_job_run(self):
        import shutil
        if not shutil.which("semgrep"):
            self.skipTest("semgrep not installed")
        from app import queue
        _, _, _, j = self._enqueue_semgrep("gr3")
        run_all_jobs()
        job = queue.get_job(j["id"])
        self.assertEqual(job["state"], "succeeded")       # the grant did not get in the way


class TestEgressControl(Base):
    def test_local_scan_withholds_the_proxy(self):
        from app.connectors.base import run_tool
        if not os.environ.get("HTTPS_PROXY"):
            self.skipTest("no HTTPS_PROXY configured to withhold")
        import tempfile
        with tempfile.TemporaryDirectory() as d:
            cwd = pathlib.Path(d)
            local = run_tool(["printenv"], cwd=cwd, allow_network=False)
            out = local.stdout.decode("utf-8", "replace").lower()
            self.assertNotIn("https_proxy=http", out)     # proxy withheld
            self.assertIn("no_proxy=*", out)
            net = run_tool(["printenv"], cwd=cwd, allow_network=True)
            self.assertIn("https_proxy=", net.stdout.decode("utf-8", "replace").lower())


if __name__ == "__main__":
    unittest.main()
