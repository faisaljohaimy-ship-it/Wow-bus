"""Credential store (§19): secrets are stored by reference and resolved only
into a tool's environment by the worker. The value never appears in a job
record, the audit log, a finding, a report, or anything the model can see. A
connector that declares a credential_ref it cannot resolve is blocked, not run."""
from __future__ import annotations

import json
import unittest

from harness import fresh_platform, owner_principal, run_all_jobs

_SECRET = "s3cr3t-value-سر"       # includes non-ASCII to be thorough


def _register(conn):
    from app.connectors import registry
    registry._build()
    registry._REGISTRY[conn.name] = conn


def _secret_connector(name, refs):
    """A synthetic cli connector that runs `printenv` and reports — WITHOUT
    echoing the value — whether its secret reached the tool's environment."""
    from app.connectors.base import Connector, ConnectorResult, EvidenceArtifact, run_tool

    class Syn(Connector):
        pass
    Syn.name = name
    Syn.category = "test"
    Syn.connector_type = "cli"
    Syn.binary = "printenv"
    Syn.secret_refs = refs

    def caps(self):
        return {"active": False, "passive": True, "needs_source": False, "needs_network": False}

    def readiness(self):
        return {"installed": True, "available": True, "version": "1", "detail": "ok"}

    def execute(self, ctx):
        r = run_tool(["printenv"], ctx=ctx)
        saw = ("TEST_SECRET=" + _SECRET).encode("utf-8") in r.stdout
        # The evidence is a placeholder, never the captured environment.
        return ConnectorResult(status="succeeded_no_findings",
                               summary={"saw_secret": bool(saw)},
                               evidence=[EvidenceArtifact("env.txt", "raw", "(env capture withheld)")])

    Syn.capabilities = caps
    Syn.readiness = readiness
    Syn.execute = execute
    return Syn()


class Base(unittest.TestCase):
    def setUp(self):
        self.cfg, self.db, self.info = fresh_platform()
        self.owner, _ = owner_principal()

    def _scope(self, scan_types):
        from app import store
        p = store.create_project("sec", self.owner.user_id)
        a = store.create_asset(p["id"], "host", "example.test", created_by=self.owner.user_id)
        s = store.create_scope(p["id"], a["id"], proof="X", allowed_targets=["example.test"],
                               scan_types=scan_types, created_by=self.owner.user_id)
        return p, a, s


class TestSecretStore(Base):
    def test_put_describe_list_hide_the_value(self):
        from app import secretstore
        meta = secretstore.put_secret("svc.token", _SECRET, kind="api_credential", host="example.test")
        self.assertNotIn("value", meta)
        self.assertEqual(meta["kind"], "api_credential")
        self.assertEqual(meta["host"], "example.test")
        self.assertNotIn("value", secretstore.describe("svc.token"))
        listing = secretstore.list_refs()
        self.assertTrue(listing and all("value" not in r for r in listing))
        self.assertNotIn(_SECRET, json.dumps(listing, ensure_ascii=False))
        # Only resolve() returns the value.
        self.assertEqual(secretstore.resolve("svc.token"), _SECRET)

    def test_delete_and_unknown(self):
        from app import secretstore
        from app.errors import NotFoundError
        secretstore.put_secret("k", "v")
        secretstore.delete("k")
        self.assertIsNone(secretstore.resolve("k"))
        with self.assertRaises(NotFoundError):
            secretstore.delete("k")

    def test_bad_ref_or_kind_or_empty_rejected(self):
        from app import secretstore
        from app.errors import ValidationError
        with self.assertRaises(ValidationError):
            secretstore.put_secret("bad ref", "v")
        with self.assertRaises(ValidationError):
            secretstore.put_secret("ok", "v", kind="not-a-kind")
        with self.assertRaises(ValidationError):
            secretstore.put_secret("ok", "")

    def test_taxonomy_kinds(self):
        from app import secretstore
        self.assertEqual(secretstore.KINDS, {"api_credential", "activation_token",
                         "tls_cert", "license", "training_badge", "other"})


class TestSecretInjection(Base):
    def test_secret_reaches_the_tool_but_leaks_nowhere(self):
        from app import secretstore, queue
        from app.db import get_db
        secretstore.put_secret("test_key", _SECRET, kind="api_credential")
        _register(_secret_connector("syn_secret", [{"ref": "test_key", "env": "TEST_SECRET"}]))
        p, a, s = self._scope(["syn_secret"])
        j = queue.enqueue(project_id=p["id"], asset_id=a["id"], scope_id=s["id"],
                          connector="syn_secret", params={}, created_by=self.owner.user_id,
                          idempotency_key="sec-inj")
        run_all_jobs()
        job = queue.get_job(j["id"])
        self.assertEqual(job["state"], "succeeded")
        # The tool genuinely received the secret in its environment...
        self.assertTrue(job["result_summary"]["connector_summary"]["saw_secret"])
        # ...but the value is nowhere in the job record or the audit log.
        self.assertNotIn(_SECRET, json.dumps(job, ensure_ascii=False))
        audit_rows = get_db().query_all("SELECT action, detail FROM audit")
        self.assertNotIn(_SECRET, json.dumps(audit_rows, ensure_ascii=False))

    def test_missing_required_secret_blocks_the_job(self):
        from app import queue
        _register(_secret_connector("syn_secret2", [{"ref": "absent_key", "env": "X"}]))
        p, a, s = self._scope(["syn_secret2"])
        j = queue.enqueue(project_id=p["id"], asset_id=a["id"], scope_id=s["id"],
                          connector="syn_secret2", params={}, created_by=self.owner.user_id,
                          idempotency_key="sec-miss")
        run_all_jobs()
        job = queue.get_job(j["id"])
        self.assertEqual(job["state"], "blocked")
        self.assertEqual((job.get("error") or {}).get("code"), "secret_unavailable")


if __name__ == "__main__":
    unittest.main()
