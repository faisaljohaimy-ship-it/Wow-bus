"""The Agent Tool Gateway (spec §18): the nine contracts enforce policy and
delegate to the real queue/worker/findings, and retest_finding re-runs the scan
that produced a finding and reports whether it came back."""
from __future__ import annotations

import shutil
import unittest

from harness import (fresh_platform, owner_principal,
                     make_project_with_source_scope, run_all_jobs)


class Base(unittest.TestCase):
    def setUp(self):
        self.cfg, self.db, self.info = fresh_platform()
        self.owner, _ = owner_principal()


class TestGatewayContracts(Base):
    def test_list_capabilities_names_the_contracts(self):
        from app import gateway
        out = gateway.list_capabilities(self.owner)
        self.assertEqual(set(out["contracts"]), set(gateway.CONTRACTS))
        names = {c["connector"] for c in out["capabilities"]}
        self.assertIn("semgrep", names)
        for c in out["capabilities"]:
            self.assertIn("capabilities", c)
            self.assertIn("state", c)

    def test_validate_request_allows_in_scope_and_denies_out_of_scope(self):
        from app import gateway
        p, a, s = make_project_with_source_scope(self.owner, ["semgrep"])
        ok = gateway.validate_request(self.owner, project_id=p["id"], asset_id=a["id"],
                                      scope_id=s["id"], connector="semgrep", params={})
        self.assertTrue(ok["ok"])
        # A connector the scope does not list is refused without enqueuing.
        bad = gateway.validate_request(self.owner, project_id=p["id"], asset_id=a["id"],
                                       scope_id=s["id"], connector="gitleaks", params={})
        self.assertFalse(bad["ok"])
        self.assertEqual(bad["code"], "connector_not_authorized")

    def test_estimate_resources_is_labelled_an_estimate(self):
        from app import gateway
        p, a, s = make_project_with_source_scope(self.owner, ["semgrep"])
        est = gateway.estimate_resources(self.owner, project_id=p["id"], asset_id=a["id"],
                                         scope_id=s["id"], connector="semgrep", params={})
        self.assertTrue(est["estimate"])
        self.assertGreater(est["max_cpu_seconds"], 0)
        self.assertEqual(est["cost"]["license_fee"], 0)

    def test_start_job_enqueues_and_denied_raises(self):
        from app import gateway, queue
        from app.errors import ForbiddenError
        p, a, s = make_project_with_source_scope(self.owner, ["semgrep"])
        job = gateway.start_job(self.owner, project_id=p["id"], asset_id=a["id"],
                                scope_id=s["id"], connector="semgrep", params={},
                                idempotency_key="gw-start")
        self.assertEqual(queue.get_job(job["id"])["connector"], "semgrep")
        with self.assertRaises(ForbiddenError):
            gateway.start_job(self.owner, project_id=p["id"], asset_id=a["id"],
                              scope_id=s["id"], connector="gitleaks", params={})

    def test_status_evidence_and_findings_for_a_real_run(self):
        from app import gateway
        if not shutil.which("semgrep"):
            self.skipTest("semgrep not installed")
        p, a, s = make_project_with_source_scope(self.owner, ["semgrep"])
        job = gateway.start_job(self.owner, project_id=p["id"], asset_id=a["id"],
                                scope_id=s["id"], connector="semgrep", params={},
                                idempotency_key="gw-run")
        run_all_jobs()
        st = gateway.get_job_status(self.owner, job["id"])
        # The gateway drove a real run to a terminal state (not blocked by policy
        # or the grant); the contracts return their shapes either way.
        self.assertNotEqual(st["job"]["state"], "blocked")
        self.assertIn(st["job"]["state"], ("succeeded", "failed", "timed_out"))
        self.assertIn("evidence", gateway.collect_evidence(self.owner, job["id"]))
        self.assertIsInstance(gateway.normalize_findings(self.owner, job["id"])["findings"], list)

    def test_retest_finding_reruns_and_reports_reappearance(self):
        from app import gateway
        if not shutil.which("bandit"):
            self.skipTest("bandit not installed")
        p, a, s = make_project_with_source_scope(self.owner, ["bandit"])
        job = gateway.start_job(self.owner, project_id=p["id"], asset_id=a["id"],
                                scope_id=s["id"], connector="bandit", params={},
                                idempotency_key="gw-bandit")
        run_all_jobs()
        found = gateway.normalize_findings(self.owner, job["id"])["findings"]
        self.assertTrue(found, "bandit should flag the vulnerable sample")
        fid = found[0]["id"]
        rt = gateway.retest_finding(self.owner, fid, idempotency_key="gw-retest")
        self.assertNotEqual(rt["job"]["id"], job["id"])
        run_all_jobs()
        outcome = gateway.retest_outcome(fid, rt["job"]["id"])
        self.assertTrue(outcome["completed"])
        # The source is unchanged, so the finding comes back (not cleared).
        self.assertTrue(outcome["reappeared"])
        self.assertFalse(outcome["cleared"])


if __name__ == "__main__":
    unittest.main()
