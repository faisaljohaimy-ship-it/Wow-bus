"""Tests for the sim-plus upgrade: the three richer scenarios and the new
attack/defence techniques (phishing, privilege escalation, exfiltration,
honeypot deception, SIEM correlation) layered on top of the original engine.

Everything here must stay a deterministic, in-memory simulation, and every
addition is additive: the original report keys and the original two-scenario
listing are left exactly as they were (see test_sim.py and test_agent_api.py).
"""
import json
import re
import unittest

from app import sim

NEW_SCENARIOS = ("enterprise", "cloud", "ot")
ALL_SCENARIOS = ("corp", "range", "enterprise", "cloud", "ot")

# A MITRE ATT&CK-style tactic label, e.g. "TA0001 Initial Access".
_TACTIC_RE = re.compile(r"^TA\d{4} [A-Z][A-Za-z ]+$")

# Original report keys that must never disappear.
_TOP_KEYS = ("outcome", "turns", "goal", "red", "blue", "metrics", "hosts",
             "timeline", "scenario", "seed", "detection")
_RED_KEYS = ("score", "hosts_compromised", "hosts_total", "flags",
             "ciphers_broken", "cracked")
_BLUE_KEYS = ("score", "detections", "vulns_patched", "hosts_isolated",
              "first_detect_turn")


class TestSimPlusScenarios(unittest.TestCase):
    def test_new_scenarios_run_and_are_deterministic(self):
        for scen in NEW_SCENARIOS:
            for seed, det in ((7, 0.5), (0, 0.0), (3, 0.6)):
                a = sim.run(scen, seed=seed, detection=det)
                b = sim.run(scen, seed=seed, detection=det)
                self.assertEqual(json.dumps(a, sort_keys=True),
                                 json.dumps(b, sort_keys=True),
                                 f"{scen} seed={seed} det={det} not deterministic")
                self.assertIn(a["outcome"], ("red_win", "blue_hold"))
                self.assertTrue(a["timeline"])

    def test_new_scenarios_are_bigger(self):
        for scen in NEW_SCENARIOS:
            r = sim.run(scen, seed=1)
            n = r["red"]["hosts_total"]
            self.assertGreaterEqual(n, 8, f"{scen} too small")
            self.assertLessEqual(n, 14, f"{scen} too big")
            self.assertEqual(n, len(r["hosts"]))

    def test_original_report_keys_are_preserved(self):
        # Every scenario, old and new, still carries the full original shape.
        for scen in ALL_SCENARIOS:
            r = sim.run(scen, seed=2, detection=0.5)
            for k in _TOP_KEYS:
                self.assertIn(k, r, f"{scen} missing top key {k}")
            for k in _RED_KEYS:
                self.assertIn(k, r["red"], f"{scen} missing red.{k}")
            for k in _BLUE_KEYS:
                self.assertIn(k, r["blue"], f"{scen} missing blue.{k}")
            for k in ("first_compromise_turn", "first_detect_turn", "vulns_patched",
                      "hosts_isolated", "detections", "ciphers_broken"):
                self.assertIn(k, r["metrics"], f"{scen} missing metric {k}")
            for h in r["hosts"]:
                self.assertEqual(set(h), {"hid", "name", "zone", "value",
                                          "discovered", "compromised", "isolated"})


class TestSimPlusAdditiveKeys(unittest.TestCase):
    def test_additive_keys_present_and_well_formed(self):
        for scen in ALL_SCENARIOS:
            r = sim.run(scen, seed=4, detection=0.3)
            # narrative: non-empty ordered list of strings
            self.assertIsInstance(r["narrative"], list)
            self.assertTrue(r["narrative"])
            self.assertTrue(all(isinstance(s, str) and s for s in r["narrative"]))
            # recommendations: non-empty list of strings
            self.assertIsInstance(r["recommendations"], list)
            self.assertTrue(r["recommendations"])
            self.assertTrue(all(isinstance(s, str) and s for s in r["recommendations"]))
            # techniques: sorted list of MITRE tactic labels
            self.assertIsInstance(r["techniques"], list)
            self.assertEqual(r["techniques"], sorted(r["techniques"]))
            self.assertTrue(all(_TACTIC_RE.match(t) for t in r["techniques"]),
                            f"{scen} techniques malformed: {r['techniques']}")
            # red.exfiltrated: a non-negative integer
            self.assertIsInstance(r["red"]["exfiltrated"], int)
            self.assertGreaterEqual(r["red"]["exfiltrated"], 0)

    def test_every_event_carries_a_tactic_field(self):
        for scen in ALL_SCENARIOS:
            r = sim.run(scen, seed=1, detection=1.0)
            for e in r["timeline"]:
                self.assertIn("tactic", e)
                self.assertIsInstance(e["tactic"], str)

    def test_mitre_tactics_appear_on_red_events(self):
        # A full enterprise kill chain uses initial access, discovery, credential
        # access, privilege escalation, lateral movement and exfiltration.
        r = sim.run("enterprise", seed=0, detection=0.0)
        self.assertEqual(r["outcome"], "red_win")
        red_tactics = {e["tactic"] for e in r["timeline"]
                       if e["team"] == "red" and e["tactic"]}
        for label in ("TA0007 Discovery", "TA0001 Initial Access",
                      "TA0006 Credential Access", "TA0004 Privilege Escalation",
                      "TA0008 Lateral Movement", "TA0010 Exfiltration"):
            self.assertIn(label, red_tactics)
            self.assertIn(label, r["techniques"])


class TestSimPlusTechniques(unittest.TestCase):
    def test_phishing_is_the_initial_access(self):
        # Enterprise has no exposed service; the first foothold is a phishing lure.
        r = sim.run("enterprise", seed=0, detection=0.0)
        self.assertGreaterEqual(r["metrics"]["phish"], 1)
        phish = [e for e in r["timeline"]
                 if e["group"] == "phish" and e["result"] == "success"]
        self.assertTrue(phish)
        self.assertEqual(phish[0]["tactic"], "TA0001 Initial Access")

    def test_privilege_escalation_unlocks_the_server_tier(self):
        r = sim.run("ot", seed=3, detection=0.0)
        self.assertEqual(r["outcome"], "red_win")
        self.assertGreaterEqual(r["metrics"]["privesc"], 1)
        esc = [e for e in r["timeline"]
               if e["group"] == "privesc" and e["result"] == "success"]
        self.assertTrue(esc)
        self.assertEqual(esc[0]["tactic"], "TA0004 Privilege Escalation")

    def test_exfiltration_is_counted(self):
        r = sim.run("enterprise", seed=0, detection=0.0)
        self.assertGreater(r["red"]["exfiltrated"], 0)
        self.assertEqual(r["red"]["exfiltrated"], r["metrics"]["exfiltrated_bytes"])
        exfil = [e for e in r["timeline"] if e["group"] == "exfil"]
        self.assertTrue(exfil)
        self.assertEqual(exfil[0]["tactic"], "TA0010 Exfiltration")
        # Cloud's whole point is pulling a large blob out of object storage.
        c = sim.run("cloud", seed=1, detection=0.0)
        self.assertEqual(c["outcome"], "red_win")
        self.assertGreater(c["red"]["exfiltrated"], 0)

    def test_honeypot_raises_a_detection_when_touched(self):
        # Cloud's decoy bucket is internet-facing, so recon touches it on turn 1
        # for every seed and the deception trips a high-confidence alert.
        for seed in range(5):
            r = sim.run("cloud", seed=seed, detection=0.5)
            self.assertGreaterEqual(r["metrics"]["honeypot_trips"], 1,
                                    f"cloud seed={seed} decoy never tripped")
            trip = [e for e in r["timeline"]
                    if e["group"] == "deception" and e["result"] == "success"]
            self.assertTrue(trip)
            self.assertEqual(trip[0]["tactic"], "Deceive")
            self.assertGreater(r["blue"]["detections"], 0)
            # the decoy that tripped is quarantined
            target = trip[0]["target"]
            host = next(h for h in r["hosts"] if h["hid"] == target)
            self.assertTrue(host["isolated"])

    def test_siem_correlation_auto_isolates(self):
        # Once enough alerts pile up, SIEM correlation cuts a host off by itself.
        r = sim.run("enterprise", seed=0, detection=0.6)
        self.assertGreaterEqual(r["metrics"]["siem_isolations"], 1)
        corr = [e for e in r["timeline"]
                if e["group"] == "correlation" and e["result"] == "success"]
        self.assertTrue(corr)
        self.assertEqual(corr[0]["tactic"], "Correlate")


class TestSimPlusCatalogAndCompat(unittest.TestCase):
    def test_scenario_names_still_only_the_original_two(self):
        # Backward compatible: the public listing is unchanged.
        ids = {n["id"] for n in sim.scenario_names()}
        self.assertEqual(ids, {"corp", "range"})

    def test_scenario_catalog_lists_all_five(self):
        cat = sim.scenario_catalog()
        ids = {n["id"] for n in cat}
        self.assertEqual(ids, set(ALL_SCENARIOS))
        for n in cat:
            self.assertTrue(n["name_en"] and n["name_ar"])
            self.assertTrue(n["about_en"] and n["about_ar"])

    def test_every_catalog_scenario_runs(self):
        for n in sim.scenario_catalog():
            r = sim.run(n["id"], seed=1)
            self.assertNotIn("error", r)
            self.assertIn(r["outcome"], ("red_win", "blue_hold"))

    def test_original_scenarios_untouched_by_new_features(self):
        # corp and range use none of the new mechanics, so their new counters
        # stay at zero and their exfiltration is nothing.
        for scen in ("corp", "range"):
            r = sim.run(scen, seed=1, detection=1.0)
            self.assertEqual(r["red"]["exfiltrated"], 0)
            self.assertEqual(r["metrics"]["honeypot_trips"], 0)
            self.assertEqual(r["metrics"]["siem_isolations"], 0)
            self.assertEqual(r["metrics"]["phish"], 0)
            self.assertEqual(r["metrics"]["privesc"], 0)
            # recon is still tagged Discovery
            recon = [e for e in r["timeline"] if e["group"] == "recon"]
            self.assertTrue(recon)
            self.assertTrue(all(e["tactic"] == "TA0007 Discovery" for e in recon))


if __name__ == "__main__":
    unittest.main()
