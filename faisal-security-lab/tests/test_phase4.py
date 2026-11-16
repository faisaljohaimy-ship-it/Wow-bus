"""Phase 4 (v4 §20/§27): campaigns with hard caps and task dependencies, the
per-connector circuit breaker, and dependency-aware claiming."""
from __future__ import annotations

import unittest

from harness import fresh_platform, owner_principal, run_all_jobs


def _register(conn):
    from app.connectors import registry
    registry._build()
    registry._REGISTRY[conn.name] = conn


def _ok_connector(name):
    from app.connectors.base import Connector, ConnectorResult

    class Syn(Connector):
        pass
    Syn.name = name
    Syn.category = "test"
    Syn.connector_type = "network"
    Syn.binary = None

    def caps(self):
        return {"active": False, "passive": True, "needs_source": False, "needs_network": False}

    def readiness(self):
        return {"installed": True, "available": True, "version": "1", "detail": "ok"}

    def execute(self, ctx):
        return ConnectorResult(status="succeeded_no_findings")

    Syn.capabilities = caps
    Syn.readiness = readiness
    Syn.execute = execute
    return Syn()


class Base(unittest.TestCase):
    def setUp(self):
        self.cfg, self.db, self.info = fresh_platform()
        self.owner, _ = owner_principal()
        _register(_ok_connector("synok"))

    def _assets(self, n, connector="synok"):
        from app import store
        p = store.create_project("camp", self.owner.user_id)
        out = []
        for i in range(n):
            a = store.create_asset(p["id"], "host", f"h{i}.test", created_by=self.owner.user_id)
            s = store.create_scope(p["id"], a["id"], proof="X", allowed_targets=[f"h{i}.test"],
                                   scan_types=[connector], created_by=self.owner.user_id)
            out.append((a, s))
        return p, out


class TestCampaigns(Base):
    def test_create_enqueues_tasks_and_dependency_ordering(self):
        from app import campaigns, queue
        p, ass = self._assets(2)
        (a1, s1), (a2, s2) = ass
        c = campaigns.create(self.owner, project_id=p["id"], name="c1", plan=[
            {"ref": "a", "connector": "synok", "asset_id": a1["id"], "scope_id": s1["id"]},
            {"ref": "b", "connector": "synok", "asset_id": a2["id"], "scope_id": s2["id"],
             "depends_on": ["a"]},
        ])
        self.assertEqual(c["progress"]["total"], 2)
        # Task 'a' (no deps) is claimable; 'b' waits for 'a'.
        j1 = queue.claim_next("w1")
        self.assertIsNotNone(j1)
        self.assertEqual(j1["depends_on"], [])
        self.assertIsNone(queue.claim_next("w2"))      # 'b' is gated by its dependency
        queue.complete(j1["id"], "succeeded")
        j2 = queue.claim_next("w3")
        self.assertIsNotNone(j2)                        # now 'b' can run
        self.assertEqual(j2["depends_on"], [j1["id"]])

    def test_dependency_failure_blocks_the_dependent(self):
        from app import campaigns, queue
        p, ass = self._assets(2)
        (a1, s1), (a2, s2) = ass
        campaigns.create(self.owner, project_id=p["id"], name="c2", plan=[
            {"ref": "a", "connector": "synok", "asset_id": a1["id"], "scope_id": s1["id"]},
            {"ref": "b", "connector": "synok", "asset_id": a2["id"], "scope_id": s2["id"],
             "depends_on": ["a"]},
        ])
        j1 = queue.claim_next("w")
        queue.complete(j1["id"], "failed")              # the prerequisite fails
        self.assertIsNone(queue.claim_next("w"))        # 'b' is never run...
        # ...it is finalised as blocked with dependency_failed.
        jobs = queue.list_jobs(p["id"])
        b = [j for j in jobs if j["depends_on"]][0]
        self.assertEqual(b["state"], "blocked")
        self.assertEqual((b.get("error") or {}).get("code"), "dependency_failed")

    def test_caps_are_enforced(self):
        from app import campaigns
        from app.errors import ValidationError
        p, ass = self._assets(1)
        (a1, s1) = ass[0]
        plan = [{"ref": f"t{i}", "connector": "synok", "asset_id": a1["id"], "scope_id": s1["id"]}
                for i in range(3)]
        with self.assertRaises(ValidationError):
            campaigns.create(self.owner, project_id=p["id"], name="big", plan=plan,
                             caps={"max_tasks": 2})
        with self.assertRaises(ValidationError):
            campaigns.create(self.owner, project_id=p["id"], name="perasset", plan=plan,
                             caps={"per_asset_max_tasks": 2})

    def test_cycle_and_unknown_dep_rejected(self):
        from app import campaigns
        from app.errors import ValidationError
        p, ass = self._assets(1)
        (a1, s1) = ass[0]
        with self.assertRaises(ValidationError):
            campaigns.create(self.owner, project_id=p["id"], name="cyc", plan=[
                {"ref": "a", "connector": "synok", "asset_id": a1["id"], "scope_id": s1["id"],
                 "depends_on": ["b"]},
                {"ref": "b", "connector": "synok", "asset_id": a1["id"], "scope_id": s1["id"],
                 "depends_on": ["a"]}])
        with self.assertRaises(ValidationError):
            campaigns.create(self.owner, project_id=p["id"], name="unk", plan=[
                {"ref": "a", "connector": "synok", "asset_id": a1["id"], "scope_id": s1["id"],
                 "depends_on": ["ghost"]}])

    def test_cancel_stops_pending_tasks(self):
        from app import campaigns, queue
        p, ass = self._assets(2)
        (a1, s1), (a2, s2) = ass
        c = campaigns.create(self.owner, project_id=p["id"], name="c3", plan=[
            {"ref": "a", "connector": "synok", "asset_id": a1["id"], "scope_id": s1["id"]},
            {"ref": "b", "connector": "synok", "asset_id": a2["id"], "scope_id": s2["id"]},
        ])
        campaigns.cancel(self.owner, c["id"])
        self.assertEqual(campaigns.get(c["id"])["status"], "cancelled")
        for j in queue.list_jobs(p["id"]):
            self.assertEqual(j["state"], "cancelled")
        self.assertIsNone(queue.claim_next("w"))        # nothing runs for a cancelled campaign


class TestCircuitBreaker(Base):
    def test_opens_after_repeated_failures_and_closes_on_success(self):
        from app import circuit
        self.assertFalse(circuit.is_suspended("synok"))
        for _ in range(circuit.THRESHOLD):
            circuit.record_failure("synok")
        self.assertTrue(circuit.is_suspended("synok"))
        circuit.record_success("synok")
        self.assertFalse(circuit.is_suspended("synok"))

    def test_claim_skips_a_suspended_connector(self):
        from app import circuit, queue
        p, ass = self._assets(1)
        (a1, s1) = ass[0]
        j = queue.enqueue(project_id=p["id"], asset_id=a1["id"], scope_id=s1["id"],
                          connector="synok", params={}, created_by=self.owner.user_id,
                          idempotency_key="cb1")
        for _ in range(circuit.THRESHOLD):
            circuit.record_failure("synok")
        self.assertIsNone(queue.claim_next("w"))        # breaker open → not handed out
        circuit.record_success("synok")
        self.assertEqual(queue.claim_next("w")["id"], j["id"])


if __name__ == "__main__":
    unittest.main()
