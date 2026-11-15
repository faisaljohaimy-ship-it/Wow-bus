"""The simulation, lab and teams endpoints: safe, deterministic, and open to the
public read-only view (they run only on built-in make-believe material)."""
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(__file__))   # so the sibling harness imports either way
from test_public_view import PublicViewCase


class TestAgentApi(PublicViewCase):
    PUBLIC = True

    def test_scenarios_are_public(self):
        st, body = self.get("/api/sim/scenarios")
        self.assertEqual(st, 200)
        self.assertEqual({s["id"] for s in body["scenarios"]}, {"corp", "range"})

    def test_sim_run_is_public_and_deterministic(self):
        st, a = self.get("/api/sim/run?scenario=corp&seed=4&detection=0.5")
        self.assertEqual(st, 200)
        self.assertIn(a["outcome"], ("red_win", "blue_hold"))
        self.assertTrue(a["timeline"])
        self.assertEqual(a["red"]["hosts_total"], len(a["hosts"]))
        _, b = self.get("/api/sim/run?scenario=corp&seed=4&detection=0.5")
        self.assertEqual(a, b)                      # same inputs → same run

    def test_sim_run_clamps_inputs_and_rejects_unknown(self):
        st, body = self.get("/api/sim/run?scenario=corp&detection=9&seed=-5&max_turns=999")
        self.assertEqual(st, 200)                   # out-of-range values are clamped, no crash
        st2, err = self.get("/api/sim/run?scenario=does-not-exist")
        self.assertEqual(st2, 404)
        self.assertIn("error", err)

    def test_lab_is_public_and_hides_answers(self):
        st, body = self.get("/api/lab/challenges")
        self.assertEqual(st, 200)
        self.assertTrue(body["challenges"])
        self.assertTrue(all("plaintext" not in c for c in body["challenges"]))
        _, solved = self.get("/api/lab/solve?id=enc-base64")
        self.assertTrue(solved["solved"])

    def test_teams_are_public(self):
        st, body = self.get("/api/teams")
        self.assertEqual(st, 200)
        self.assertEqual([t["key"] for t in body["teams"]], ["discovery", "red", "blue"])

    def test_team_summary_of_the_demo_project(self):
        self.seed_demo()
        st, body = self.get(f"/api/projects/{self.demo['pid']}/teams")
        self.assertEqual(st, 200)
        self.assertIn("summary", body)
        self.assertEqual(set(body["summary"]), {"discovery", "red", "blue"})


if __name__ == "__main__":
    unittest.main()
