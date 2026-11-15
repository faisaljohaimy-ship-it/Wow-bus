"""The title a secret finding is stored with: the scanner's own sentence, in
full, with any secret value in it redacted."""
from __future__ import annotations

import json
import os
import sys
import unittest
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parent))
from harness import (fresh_platform, make_project_with_source_scope, owner_principal,  # noqa: E402
                     run_all_jobs)

# The descriptions Gitleaks 8.21.2 gives for three of its rules.
REAL_DESCRIPTIONS = {
    "github-pat": "Uncovered a GitHub Personal Access Token, potentially leading to "
                  "unauthorized repository access and sensitive content exposure.",
    "generic-api-key": "Detected a Generic API Key, potentially exposing access to various "
                       "services and sensitive operations.",
    "private-key": "Identified a Private Key, which may compromise cryptographic security "
                   "and sensitive data encryption.",
}
# Put together here so that no secret-shaped text stands in this file.
TOKEN = "ghp_" + "A1b2C3d4E5f6" * 3
PASSWORD = "-".join(("s3cr3t", "Hunter2", "x9"))


class TestGitleaksTitles(unittest.TestCase):
    def setUp(self):
        env = mock.patch.dict(os.environ)
        env.start()
        self.addCleanup(env.stop)
        fresh_platform()
        self.owner, _ = owner_principal()
        self.project, self.asset, self.scope = make_project_with_source_scope(self.owner,
                                                                             ["gitleaks"])

    def stored_titles(self, descriptions: dict) -> dict:
        """rule -> stored title, after a Gitleaks job run by the worker. The
        program is replaced by one that writes a report with these rules."""
        from app import findings, queue
        from app.connectors import gitleaks
        from app.connectors.base import ToolRun
        leaks = [{"RuleID": rule, "Description": text, "File": "app.py", "StartLine": line}
                 for line, (rule, text) in enumerate(descriptions.items(), 1)]

        def writes_the_report(argv, **_):
            Path(argv[argv.index("--report-path") + 1]).write_text(json.dumps(leaks))
            return ToolRun(0, b"", b"", False, False, 0.0, False)

        ready = {"installed": True, "available": True, "version": "8.21.2", "detail": "stand-in"}
        with mock.patch.object(gitleaks, "run_tool", writes_the_report), \
                mock.patch.object(gitleaks.GitleaksConnector, "readiness", lambda self: ready):
            job = queue.enqueue(project_id=self.project["id"], asset_id=self.asset["id"],
                                scope_id=self.scope["id"], connector="gitleaks", params={},
                                created_by=self.owner.user_id)
            run_all_jobs()
        self.assertEqual(queue.get_job(job["id"])["state"], "succeeded")
        return {row["rule_id"].removeprefix("gitleaks:"): row["title"]
                for row in findings.list_findings(self.project["id"])}

    def test_the_stored_title_is_the_rule_description_in_full(self):
        titles = self.stored_titles(REAL_DESCRIPTIONS)
        self.assertEqual(sorted(titles), sorted(REAL_DESCRIPTIONS))
        for rule, description in REAL_DESCRIPTIONS.items():
            with self.subTest(rule=rule):
                self.assertEqual(titles[rule], f"Potential secret — {description}")
                self.assertNotIn("redacted", titles[rule])

    def test_a_secret_value_in_a_title_is_still_redacted(self):
        titles = self.stored_titles({
            "with-a-token": f"Found the token {TOKEN} in a commit.",
            "with-a-password": f"Line reads password = {PASSWORD} here.",
        })
        self.assertEqual(titles["with-a-token"],
                         "Potential secret — Found the token «GITHUB-TOKEN» in a commit.")
        self.assertEqual(titles["with-a-password"],
                         "Potential secret — Line reads password=«redacted» here.")
        for title in titles.values():
            self.assertNotIn(TOKEN, title)
            self.assertNotIn(PASSWORD, title)


if __name__ == "__main__":
    unittest.main(verbosity=2)
