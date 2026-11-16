"""Phase 3 (v3/v4 §10/§14): the conflicting-evidence ledger, dedupe-keep-sources,
evidence expiry on a tool/version change, and reports that state coverage, carry
a 'no findings != safe' note, and export CSV safely."""
from __future__ import annotations

import unittest

from harness import fresh_platform, owner_principal, make_project_with_source_scope


def _raw(title="SQL injection", rule="B608", sev="high", loc=None):
    from app.connectors.base import RawFinding
    return RawFinding(rule_id=rule, title=title, severity=sev, confidence="high",
                      location=loc or {"file": "app.py", "line": 10},
                      remediation="use parameterised queries")


class Base(unittest.TestCase):
    def setUp(self):
        self.cfg, self.db, self.info = fresh_platform()
        self.owner, _ = owner_principal()

    def _job(self, p, a, s, connector, key):
        from app import queue
        return queue.enqueue(project_id=p["id"], asset_id=a["id"], scope_id=s["id"],
                             connector=connector, params={}, created_by=self.owner.user_id,
                             idempotency_key=key)


class TestConflictLedger(Base):
    def test_dedupe_keeps_each_contributing_source(self):
        from app import findings as F
        p, a, s = make_project_with_source_scope(self.owner, ["semgrep", "bandit"])
        j1, j2 = self._job(p, a, s, "semgrep", "d1"), self._job(p, a, s, "bandit", "d2")
        F.ingest(j1, a, [_raw()], tool_version="1.0")
        r2 = _raw()
        F.ingest(j2, a, [r2], tool_version="2.0")       # same issue, different tool
        f = F.get_finding(r2._finding_id)
        self.assertEqual(f["occurrences"], 2)
        self.assertEqual({src["connector"] for src in f["sources"]}, {"semgrep", "bandit"})

    def test_reappeared_after_fix_opens_a_conflict(self):
        from app import findings as F, conflicts
        p, a, s = make_project_with_source_scope(self.owner, ["semgrep"])
        r = _raw()
        F.ingest(self._job(p, a, s, "semgrep", "r1"), a, [r], tool_version="1.0")
        fid = r._finding_id
        F.set_status(fid, "fixed_in_branch")
        r2 = _raw()
        F.ingest(self._job(p, a, s, "semgrep", "r2"), a, [r2], tool_version="1.0")
        self.assertEqual(F.get_finding(fid)["status"], "reopened")
        kinds = {c["kind"] for c in conflicts.list_for_finding(fid)}
        self.assertIn("reappeared_after_fix", kinds)
        self.assertGreaterEqual(conflicts.open_count(p["id"]), 1)

    def test_evidence_expires_when_the_tool_version_changes(self):
        from app import findings as F, conflicts
        p, a, s = make_project_with_source_scope(self.owner, ["semgrep"])
        r = _raw()
        F.ingest(self._job(p, a, s, "semgrep", "e1"), a, [r], tool_version="1.0")
        fid = r._finding_id
        F.set_verification(fid, "confirmed")
        r2 = _raw()
        F.ingest(self._job(p, a, s, "semgrep", "e2"), a, [r2], tool_version="2.0")
        # The prior human verdict no longer transfers; a fresh check is required.
        self.assertEqual(F.get_finding(fid)["verification_status"], "needs_verification")
        self.assertIn("evidence_expired", {c["kind"] for c in conflicts.list_for_finding(fid)})

    def test_conflict_can_be_resolved(self):
        from app import findings as F, conflicts
        p, a, s = make_project_with_source_scope(self.owner, ["semgrep"])
        r = _raw()
        F.ingest(self._job(p, a, s, "semgrep", "c1"), a, [r], tool_version="1.0")
        F.set_status(r._finding_id, "fixed_in_branch")
        F.ingest(self._job(p, a, s, "semgrep", "c2"), a, [_raw()], tool_version="1.0")
        cfl = conflicts.list_for_finding(r._finding_id)[0]
        conflicts.resolve(cfl["id"], note="checked manually")
        self.assertEqual(conflicts.get(cfl["id"])["status"], "resolved")


class TestReports(Base):
    def _seed(self):
        from app import findings as F
        p, a, s = make_project_with_source_scope(self.owner, ["semgrep"])
        F.ingest(self._job(p, a, s, "semgrep", "rp"), a,
                 [_raw(title="XSS, with a comma"), _raw(title="=danger()", rule="X2",
                  loc={"file": "b.py", "line": 3})], tool_version="1.0")
        return p

    def test_report_has_coverage_and_a_no_false_safety_note(self):
        from app import reports
        rep = reports.build_report(self._seed()["id"])
        self.assertIn("coverage", rep)
        self.assertGreaterEqual(rep["coverage"]["jobs_total"], 1)
        self.assertIn("ar", rep["safety_note"])
        self.assertIn("en", rep["safety_note"])

    def test_markdown_states_coverage_and_no_false_safe_in_both_languages(self):
        from app import reports
        pid = self._seed()["id"]
        self.assertIn("Absence of findings", reports.to_markdown(pid, "en"))
        self.assertIn("غياب النتائج",
                      reports.to_markdown(pid, "ar"))

    def test_csv_export_is_bom_prefixed_comma_safe_and_formula_guarded(self):
        from app import reports
        out = reports.to_csv(self._seed()["id"])
        self.assertTrue(out.startswith("﻿"))
        self.assertIn("XSS, with a comma", out)   # csv quotes the comma, value intact
        self.assertIn("'=danger()", out)           # leading = is neutralised


if __name__ == "__main__":
    unittest.main()
