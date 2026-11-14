"""Explicit failure-mode matrix (spec section 14). Each test maps to one row and
asserts the required behaviour. Synthetic connectors simulate timeout / corrupt
output / provider failure without depending on flaky real conditions."""
from __future__ import annotations

import shutil
import unittest

from harness import fresh_platform, owner_principal, make_project_with_source_scope, run_all_jobs


def _register(conn):
    from app.connectors import registry
    registry._build()
    registry._REGISTRY[conn.name] = conn


class Base(unittest.TestCase):
    def setUp(self):
        self.cfg, self.db, self.info = fresh_platform()
        self.owner, _ = owner_principal()


# --- synthetic connectors ---
def _mk(name, behavior):
    from app.connectors.base import Connector, ConnectorResult, EvidenceArtifact
    from app.errors import TimeoutError_, ConnectorError

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
        if behavior == "timeout":
            raise TimeoutError_("synthetic timeout")
        if behavior == "corrupt":
            raise ConnectorError("synthetic corrupt output: invalid JSON")
        if behavior == "partial":
            return ConnectorResult(status="partial", findings=[], partial=True,
                                   evidence=[EvidenceArtifact("p.txt", "raw", "partial")],
                                   summary={"errors": 3}, coverage="partial coverage")
        return ConnectorResult(status="succeeded_no_findings")

    Syn.capabilities = caps
    Syn.readiness = readiness
    Syn.execute = execute
    return Syn()


class TestFailureModes(Base):
    def _scope_for(self, scan_types):
        from app import store
        p = store.create_project("fm", self.owner.user_id)
        a = store.create_asset(p["id"], "host", "example.test", created_by=self.owner.user_id)
        s = store.create_scope(p["id"], a["id"], proof="X", allowed_targets=["example.test"],
                               scan_types=scan_types, created_by=self.owner.user_id)
        return p, a, s

    def test_1_tool_missing_blocked(self):
        from app import queue
        if shutil.which("trivy"):
            self.skipTest("trivy installed")
        from app import store
        p, a, s = make_project_with_source_scope(self.owner, ["trivy"])
        j = queue.enqueue(project_id=p["id"], asset_id=a["id"], scope_id=s["id"],
                          connector="trivy", params={}, created_by=self.owner.user_id, idempotency_key="fm1")
        run_all_jobs()
        job = queue.get_job(j["id"])
        self.assertEqual(job["state"], "blocked")
        self.assertIn("tool", (job.get("error") or {}).get("code", "") + "unavailable")

    def test_2_missing_config_specific_reason(self):
        from app.connectors import get_connector
        from app.errors import ConfigError
        with self.assertRaises(ConfigError) as cm:
            get_connector("http_headers").validate_config({})  # no target
        self.assertIn("target", cm.exception.message)

    def test_3_timeout_bounded_retry_then_failed(self):
        from app import queue
        _register(_mk("syn_timeout", "timeout"))
        p, a, s = self._scope_for(["syn_timeout"])
        j = queue.enqueue(project_id=p["id"], asset_id=a["id"], scope_id=s["id"],
                          connector="syn_timeout", params={}, created_by=self.owner.user_id,
                          idempotency_key="fm3", max_attempts=2)
        run_all_jobs()
        job = queue.get_job(j["id"])
        self.assertEqual(job["state"], "failed")
        self.assertGreaterEqual(job["attempts"], 2)  # retried up to the bound
        self.assertEqual((job.get("error") or {}).get("code"), "timeout")

    def test_4_corrupt_output_rejected_not_counted_clean(self):
        from app import queue
        _register(_mk("syn_corrupt", "corrupt"))
        p, a, s = self._scope_for(["syn_corrupt"])
        j = queue.enqueue(project_id=p["id"], asset_id=a["id"], scope_id=s["id"],
                          connector="syn_corrupt", params={}, created_by=self.owner.user_id,
                          idempotency_key="fm4", max_attempts=1)
        run_all_jobs()
        self.assertEqual(queue.get_job(j["id"])["state"], "failed")

    def test_4b_partial_marked_partial(self):
        from app import queue
        _register(_mk("syn_partial", "partial"))
        p, a, s = self._scope_for(["syn_partial"])
        j = queue.enqueue(project_id=p["id"], asset_id=a["id"], scope_id=s["id"],
                          connector="syn_partial", params={}, created_by=self.owner.user_id,
                          idempotency_key="fm4b")
        run_all_jobs()
        job = queue.get_job(j["id"])
        self.assertEqual(job["state"], "succeeded")
        self.assertTrue(job["result_summary"].get("partial"))

    def test_5_worker_loss_undetermined(self):
        from app import queue
        from app.db import get_db
        p, a, s = make_project_with_source_scope(self.owner, ["semgrep"])
        j = queue.enqueue(project_id=p["id"], asset_id=a["id"], scope_id=s["id"],
                          connector="semgrep", params={}, created_by=self.owner.user_id, idempotency_key="fm5")
        c = queue.claim_next("w"); queue.mark_running(c["id"], "w")
        get_db().execute("UPDATE jobs SET lease_expires_at='2000-01-01T00:00:00+00:00' WHERE id=?", (j["id"],))
        queue.reclaim_expired()
        self.assertEqual(queue.get_job(j["id"])["state"], "undetermined")

    def test_6_ai_failure_scans_continue(self):
        # No provider configured → AI degrades, but a real scan still completes.
        from app import queue, findings
        if not shutil.which("bandit"):
            self.skipTest("bandit not installed")
        p, a, s = make_project_with_source_scope(self.owner, ["bandit"])
        from app.ai import agents
        self.assertTrue(agents.triage({"severity": "low", "confidence": "low"})["fallback"])
        queue.enqueue(project_id=p["id"], asset_id=a["id"], scope_id=s["id"],
                      connector="bandit", params={}, created_by=self.owner.user_id, idempotency_key="fm6")
        run_all_jobs()
        self.assertGreater(len(findings.list_findings(p["id"])), 0)

    def test_7_authorization_withdrawal_stops(self):
        from app import queue, store, policy
        from app.connectors import get_connector
        p, a, s = make_project_with_source_scope(self.owner, ["semgrep"])
        j = queue.enqueue(project_id=p["id"], asset_id=a["id"], scope_id=s["id"],
                          connector="semgrep", params={}, created_by=self.owner.user_id, idempotency_key="fm7")
        store.revoke_scope(s["id"])  # withdraw authorization + flags jobs stop_requested
        self.assertEqual(queue.get_job(j["id"])["stop_requested"], 1)
        # Worker re-check at execution denies it.
        d = policy.evaluate_job(principal=None, project=p, asset=a, scope=store.get_scope(s["id"]),
                                connector=get_connector("semgrep"), params={})
        self.assertFalse(d.allow)
        run_all_jobs()
        self.assertEqual(queue.get_job(j["id"])["state"], "blocked")

    def test_8_cross_project_denied(self):
        from app import auth, store
        from app.errors import ForbiddenError
        auth.create_user("x@fm.local", "password-xxxx-1", global_role="analyst")
        other = auth.principal_from_token(auth.login("x@fm.local", "password-xxxx-1")["token"])
        p = store.create_project("secret", self.owner.user_id)
        with self.assertRaises(ForbiddenError):
            other.require_project(p["id"], "reader")


if __name__ == "__main__":
    unittest.main(verbosity=2)
