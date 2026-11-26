"""Defensive hardening advisor (defensive-only, advisory):

  * a controls catalogue grouped by domain (your Wi-Fi/router, your USB &
    endpoints, your network & accounts) — bilingual, every control has a why
    and a how;
  * a self-assessment that scores posture (high=3/medium=2/low=1 weighting),
    lists the missing controls by priority, and never counts 'unknown' as done;
  * recommend_for_findings links real scan findings to the controls that would
    reduce them, so the analyzer's output ends in concrete defensive actions.

It scans nothing, runs no tool, and targets no third-party asset — the
protective counterpart to the attack demos.
"""
from __future__ import annotations

import unittest

import harness  # noqa: F401  (puts the repo root on sys.path)
from app import hardening


class TestCatalogue(unittest.TestCase):
    def test_domains_are_the_three_defensive_areas(self):
        keys = {d["key"] for d in hardening.domains()}
        self.assertEqual(keys, {"wifi", "usb_endpoint", "network"})
        for d in hardening.domains():
            self.assertGreater(d["controls"], 0)
            self.assertIn("ar", d["title"])
            self.assertIn("en", d["title"])

    def test_every_control_is_complete_and_bilingual(self):
        ids = set()
        for c in hardening.CONTROLS:
            self.assertNotIn(c["id"], ids, f"duplicate control id {c['id']}")
            ids.add(c["id"])
            self.assertIn(c["domain"], hardening.DOMAINS)
            self.assertIn(c["priority"], ("high", "medium", "low"))
            for field in ("title", "why", "how"):
                self.assertTrue(c[field].get("ar"), f"{c['id']} {field} ar")
                self.assertTrue(c[field].get("en"), f"{c['id']} {field} en")

    def test_checklist_filters_by_domain_and_sorts_high_first(self):
        wifi = hardening.checklist("wifi")
        self.assertTrue(wifi)
        self.assertTrue(all(c["domain"] == "wifi" for c in wifi))
        priorities = [c["priority"] for c in wifi]
        order = {"high": 0, "medium": 1, "low": 2}
        self.assertEqual(priorities, sorted(priorities, key=lambda p: order[p]))
        # No domain → the whole catalogue.
        self.assertEqual(len(hardening.checklist()), len(hardening.CONTROLS))

    def test_badusb_defence_is_present(self):
        # The defensive answer to the BadUSB demo: lock screen, no autorun, no
        # unknown drives, patch. These must exist as real controls.
        usb_ids = {c["id"] for c in hardening.checklist("usb_endpoint")}
        for need in ("usb.lock_screen", "usb.autorun_off", "usb.no_unknown", "usb.patch"):
            self.assertIn(need, usb_ids)

    def test_wifi_defence_covers_encryption_and_credentials(self):
        wifi_ids = {c["id"] for c in hardening.checklist("wifi")}
        for need in ("wifi.encryption", "wifi.passphrase", "wifi.admin_creds", "wifi.wps_off"):
            self.assertIn(need, wifi_ids)


class TestAssess(unittest.TestCase):
    def test_all_yes_is_a_perfect_strong_score(self):
        answers = {c["id"]: "yes" for c in hardening.CONTROLS}
        out = hardening.assess(answers)
        self.assertEqual(out["score"], 100)
        self.assertEqual(out["label"], "strong")
        self.assertEqual(out["counts"]["missing"], 0)
        self.assertEqual(out["counts"]["unknown"], 0)
        self.assertEqual(out["missing"], [])

    def test_all_no_is_a_zero_weak_score_with_every_control_missing(self):
        answers = {c["id"]: "no" for c in hardening.CONTROLS}
        out = hardening.assess(answers)
        self.assertEqual(out["score"], 0)
        self.assertEqual(out["label"], "weak")
        self.assertEqual(out["counts"]["missing"], len(hardening.CONTROLS))

    def test_unknown_is_not_counted_as_in_place(self):
        # No answers at all → everything unknown, score 0, nothing confirmed.
        out = hardening.assess({})
        self.assertEqual(out["score"], 0)
        self.assertEqual(out["counts"]["unknown"], len(hardening.CONTROLS))
        self.assertEqual(out["counts"]["in_place"], 0)
        self.assertEqual(out["missing"], [])          # unknown ≠ a confirmed gap
        self.assertEqual(len(out["unknown"]), len(hardening.CONTROLS))

    def test_high_priority_gaps_weigh_more_than_low(self):
        # Missing one high control costs more than missing one low control.
        high = next(c for c in hardening.CONTROLS if c["priority"] == "high")
        low = next(c for c in hardening.CONTROLS if c["priority"] == "low")
        base = {c["id"]: "yes" for c in hardening.CONTROLS}
        miss_high = dict(base); miss_high[high["id"]] = "no"
        miss_low = dict(base); miss_low[low["id"]] = "no"
        self.assertLess(hardening.assess(miss_high)["score"],
                        hardening.assess(miss_low)["score"])

    def test_missing_list_is_sorted_high_priority_first(self):
        out = hardening.assess({c["id"]: "no" for c in hardening.CONTROLS})
        order = {"high": 0, "medium": 1, "low": 2}
        pr = [c["priority"] for c in out["missing"]]
        self.assertEqual(pr, sorted(pr, key=lambda p: order[p]))

    def test_by_domain_breakdown_adds_up(self):
        out = hardening.assess({c["id"]: "yes" for c in hardening.checklist("wifi")})
        self.assertEqual(out["by_domain"]["wifi"]["in_place"],
                         out["by_domain"]["wifi"]["total"])
        # Untouched domains stay at zero in_place.
        self.assertEqual(out["by_domain"]["network"]["in_place"], 0)

    def test_junk_answers_are_treated_as_unknown(self):
        out = hardening.assess({c["id"]: "maybe" for c in hardening.CONTROLS})
        self.assertEqual(out["counts"]["unknown"], len(hardening.CONTROLS))
        self.assertEqual(out["score"], 0)

    def test_note_is_bilingual_and_advisory(self):
        out = hardening.assess({})
        self.assertIn("ar", out["note"])
        self.assertIn("en", out["note"])
        self.assertIn("advisory", out["note"]["en"].lower())


class TestRecommendForFindings(unittest.TestCase):
    def test_a_default_credentials_finding_recommends_the_credentials_control(self):
        findings = [{"connector": "http_headers", "rule_id": "default-admin",
                     "title": "Default credentials accepted on admin login",
                     "cwe": "CWE-521", "description": "admin/admin works",
                     "tags": ["credential", "auth"]}]
        rec = hardening.recommend_for_findings(findings)
        ids = {c["id"] for c in rec}
        self.assertTrue({"net.default_creds", "net.mfa"} & ids,
                        "a credentials finding should surface a credentials control")

    def test_cleartext_storage_finding_recommends_disk_encryption(self):
        findings = [{"connector": "bandit", "rule_id": "cleartext-storage",
                     "title": "Cleartext storage of sensitive data", "cwe": "CWE-312",
                     "description": "secrets written unencrypted to disk", "tags": []}]
        ids = {c["id"] for c in hardening.recommend_for_findings(findings)}
        self.assertIn("usb.disk_encryption", ids)

    def test_a_web_tls_or_header_finding_does_not_surface_wifi_controls(self):
        # Regression: a weak web-TLS cipher and a missing HTTP header have no
        # home-hardening counterpart, so they must NOT surface Wi-Fi/router
        # advice (WPA3, router admin password, WAN admin ...). Returning nothing
        # is the honest answer.
        tls = [{"connector": "tls_certificate", "rule_id": "weak-cipher",
                "title": "Weak TLS cipher suite", "cwe": "CWE-326",
                "description": "server offers an old SSL cipher", "tags": ["crypto"]}]
        hsts = [{"connector": "http_headers", "rule_id": "missing-hsts",
                 "title": "Missing Strict-Transport-Security header", "cwe": "CWE-319",
                 "description": "the server response lacks the HSTS header.", "tags": []}]
        wifi_ids = {c["id"] for c in hardening.checklist("wifi")}
        for finding in (tls, hsts):
            ids = {c["id"] for c in hardening.recommend_for_findings(finding)}
            self.assertEqual(ids & wifi_ids, set(),
                             f"no Wi-Fi control should be recommended for {finding[0]['rule_id']}")

    def test_substring_only_matches_do_not_recommend_anything(self):
        # Regression: whole-token matching — "report"/"export"/"important" must
        # not match the signal token "port"; a content-free finding yields none.
        noise = [{"connector": "reporter", "rule_id": "export-available",
                  "title": "Export report available", "description": "important note",
                  "tags": []}]
        self.assertEqual(hardening.recommend_for_findings(noise), [])

    def test_no_findings_recommends_nothing(self):
        self.assertEqual(hardening.recommend_for_findings([]), [])
        self.assertEqual(hardening.recommend_for_findings(None), [])

    def test_recommendations_are_deduped_and_capped(self):
        findings = [{"connector": "pip_audit", "title": "outdated dependency with a known CVE",
                     "description": "version is behind; update available", "tags": ["patch"]}
                    for _ in range(20)]
        rec = hardening.recommend_for_findings(findings, limit=3)
        self.assertLessEqual(len(rec), 3)
        self.assertEqual(len({c["id"] for c in rec}), len(rec))   # no duplicates
        self.assertTrue(any("patch" in c["tags"] for c in rec))

    def test_an_unmatched_finding_yields_no_noise(self):
        findings = [{"connector": "x", "title": "zzz", "description": "qqq", "tags": []}]
        self.assertEqual(hardening.recommend_for_findings(findings), [])


if __name__ == "__main__":
    unittest.main()
