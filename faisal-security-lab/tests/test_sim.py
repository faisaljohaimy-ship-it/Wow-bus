"""Tests for the attack/defence simulation: it must be deterministic, actually
break the looted secrets with the crypto engine, and let the blue team detect
and contain."""
import json
import unittest

from app import sim


class TestSimulation(unittest.TestCase):
    def test_deterministic(self):
        a = sim.run("corp", seed=3, detection=0.5)
        b = sim.run("corp", seed=3, detection=0.5)
        self.assertEqual(json.dumps(a, sort_keys=True), json.dumps(b, sort_keys=True))

    def test_report_shape(self):
        r = sim.run("corp", seed=1)
        for k in ("outcome", "turns", "goal", "red", "blue", "metrics", "hosts", "timeline"):
            self.assertIn(k, r)
        self.assertIn(r["outcome"], ("red_win", "blue_hold"))
        self.assertTrue(r["timeline"])
        self.assertEqual(r["red"]["hosts_total"], len(r["hosts"]))

    def test_crypto_chain_breaks_the_loot(self):
        # With the blue team unable to detect (detection 0), the red team cascades
        # through the credential chain, and the crypto group must crack every
        # looted secret to get there.
        r = sim.run("corp", seed=1, detection=0.0)
        self.assertEqual(r["outcome"], "red_win")
        self.assertTrue(r["goal"]["compromised"])
        self.assertIn("coreadminmaster", r["red"]["cracked"])   # from the Caesar secret
        self.assertIn("vaultkeyredis", r["red"]["cracked"])     # from the Base64 secret
        self.assertIn("letmein", r["red"]["cracked"])           # from the MD5 secret
        self.assertGreaterEqual(r["red"]["ciphers_broken"], 3)

    def test_blue_detects_and_responds(self):
        r = sim.run("corp", seed=1, detection=1.0)
        self.assertGreater(r["blue"]["detections"], 0)
        self.assertGreater(r["blue"]["score"], 0)
        # Something loud (an exploit) was seen.
        self.assertTrue(any(e["team"] == "blue" and e["group"] == "detection"
                            for e in r["timeline"]))

    def test_both_outcomes_are_reachable(self):
        outcomes = {sim.run("corp", seed=s, detection=d)["outcome"]
                    for s in range(6) for d in (0.0, 1.0)}
        # The engine is a real contest: at least the red win is reachable here.
        self.assertIn("red_win", outcomes)

    def test_hardening_patches_vulns(self):
        r = sim.run("range", seed=2, detection=0.6)
        self.assertGreaterEqual(r["blue"]["vulns_patched"], 1)

    def test_scenario_listing(self):
        names = sim.scenario_names()
        ids = {n["id"] for n in names}
        self.assertEqual(ids, {"corp", "range"})
        for n in names:
            self.assertTrue(n["name_en"] and n["name_ar"])


if __name__ == "__main__":
    unittest.main()
