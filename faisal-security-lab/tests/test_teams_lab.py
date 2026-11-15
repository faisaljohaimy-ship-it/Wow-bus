"""Tests for the team model and the training lab's built-in challenges."""
import unittest

from app import lab, teams


class TestTeams(unittest.TestCase):
    def test_connector_classification(self):
        self.assertEqual(teams.team_for_connector("semgrep"), "discovery")
        self.assertEqual(teams.team_for_connector("ai_redteam"), "red")
        self.assertEqual(teams.team_for_connector("crypto_analysis"), "red")
        # unknown connectors default to discovery
        self.assertEqual(teams.team_for_connector("brand_new_tool"), "discovery")

    def test_meta_and_order(self):
        meta = teams.team_meta()
        self.assertEqual([t["key"] for t in meta], ["discovery", "red", "blue"])
        for t in meta:
            self.assertTrue(t["name_en"] and t["name_ar"])

    def test_summarize_by_team(self):
        findings = [
            {"connector": "semgrep", "severity": "high"},
            {"connector": "semgrep", "severity": "low"},
            {"connector": "ai_redteam", "severity": "critical"},
        ]
        summary = teams.summarize_by_team(findings)
        self.assertEqual(summary["discovery"]["count"], 2)
        self.assertEqual(summary["red"]["count"], 1)
        self.assertEqual(summary["discovery"]["by_severity"]["high"], 1)
        self.assertEqual(summary["blue"]["count"], 0)


class TestLab(unittest.TestCase):
    def test_every_challenge_is_solvable(self):
        report = lab.solve_all()
        unsolved = [r["id"] for r in report["results"] if not r["solved"]]
        self.assertEqual(unsolved, [], f"unsolved: {unsolved}")
        self.assertEqual(report["solved"], report["total"])
        self.assertGreater(report["points"], 0)

    def test_list_hides_answer_by_default(self):
        for row in lab.list_challenges():
            self.assertNotIn("plaintext", row)
            self.assertTrue(row["ciphertext"])
        self.assertTrue(all("plaintext" in r for r in lab.list_challenges(reveal=True)))

    def test_grade_attempt(self):
        # Reveal the known answer of the base64 challenge and grade it.
        answer = next(r["plaintext"] for r in lab.list_challenges(reveal=True)
                      if r["id"] == "enc-base64")
        self.assertTrue(lab.grade_attempt("enc-base64", answer)["correct"])
        self.assertFalse(lab.grade_attempt("enc-base64", "nonsense")["correct"])


if __name__ == "__main__":
    unittest.main()
