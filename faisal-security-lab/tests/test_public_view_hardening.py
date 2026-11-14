"""Hardening of the PUBLIC READ-ONLY VIEW (FSL_PUBLIC_VIEW=1).

What a guest is sent (no evidence text, no server paths, a fixed report
language), what guest traffic may cost (no tool probes, two rate limits), how
the demo project behaves across restarts (retries, operator revocation,
startup order) and what a signed-in account sees of it.

Same approach as test_public_view.py, whose harness is reused: the real HTTP
layer on 127.0.0.1 with an ephemeral port, standard library only, tool
readiness faked.
"""
from __future__ import annotations

import contextlib
import dataclasses
import io
import json
import os
import threading
import unittest
import urllib.error
import urllib.parse
import urllib.request
from unittest import mock

import test_public_view as base

ROOT = base.ROOT
SAMPLE = base.SAMPLE
EVIDENCE_TEXT = "EVIDENCE-BODY-MARKER line one\nEVIDENCE-BODY-MARKER line two"
TOOL_DIR = "/opt/fsl-test-tools/bin"
REVOKED_LINE = ("[init] public demo: the authorization scope was revoked by an operator; "
                "not re-issuing")


def ready_with_path(conn):
    """Readiness as a resolved CLI tool reports it, binary path included."""
    return {"installed": True, "available": True, "version": "0.0-test",
            "path": f"{TOOL_DIR}/{conn.binary or conn.name}", "detail": "resolved on PATH"}


class HardeningCase(base.PublicViewCase):
    def raw_get(self, path, *, token=None):
        """(status, content type, body text) exactly as sent on the wire."""
        headers = {"Authorization": f"Bearer {token}"} if token else {}
        req = urllib.request.Request(self.base + path, headers=headers)
        try:
            with base._OPENER.open(req, timeout=30) as resp:
                status, headers, raw = resp.status, resp.headers, resp.read()
        except urllib.error.HTTPError as e:
            status, headers, raw = e.code, e.headers, e.read()
        return status, headers.get("Content-Type", ""), raw.decode("utf-8")

    def new_user(self, email, role="reader"):
        from app import auth
        password = "member-password-1"
        user = auth.create_user(email, password, global_role=role)
        return user["id"], auth.login(email, password)["token"]

    def set_job_state(self, job_id, state):
        from app import queue
        from app.db import get_db
        if state in queue.ACTIVE_STATES:
            get_db().execute("UPDATE jobs SET state=?, phase=? WHERE id=?", (state, state, job_id))
        else:
            queue.complete(job_id, state)

    def demo_jobs(self, pid, connector=None):
        """Demo jobs, oldest first."""
        from app import queue
        jobs = sorted(queue.list_jobs(pid), key=lambda j: (j["created_at"], j["idempotency_key"]))
        return [j for j in jobs if connector in (None, j["connector"])]


# ---------------------------------------------------------------------------
# The report language and format
# ---------------------------------------------------------------------------
class TestReportParameters(HardeningCase):
    def setUp(self):
        super().setUp()
        self.seed_demo()
        self.report = f"/api/projects/{self.demo['pid']}/report"

    def test_a_guest_cannot_inject_markup_through_lang(self):
        payloads = ['"><script>alert(1)</script>', "en\"onload=\"alert(1)", "<img src=x>",
                    "ar' dir='x", "EN", "en ", "fr", ""]
        for payload in payloads:
            query = urllib.parse.urlencode({"format": "html", "lang": payload})
            status, ctype, text = self.raw_get(f"{self.report}?{query}")
            self.assertEqual(status, 200, payload)
            self.assertIn("text/html", ctype)
            self.assertTrue(text.startswith('<!doctype html><html lang="ar" dir="rtl">'), payload)
            if payload:
                self.assertNotIn(payload, text)
            self.assertNotIn("<script", text.lower())
            self.assertNotIn("alert(1)", text)

    def test_the_two_supported_languages_still_work(self):
        _, _, text = self.raw_get(f"{self.report}?format=html&lang=en")
        self.assertTrue(text.startswith('<!doctype html><html lang="en" dir="ltr">'))
        self.assertIn("Defensive Security Report", text)
        _, _, text = self.raw_get(f"{self.report}?format=html&lang=ar")
        self.assertTrue(text.startswith('<!doctype html><html lang="ar" dir="rtl">'))
        _, _, text = self.raw_get(f"{self.report}?format=html")
        self.assertIn('<html lang="ar"', text)
        _, _, text = self.raw_get(f"{self.report}?format=md&lang=en")
        self.assertIn("# Defensive Security Report", text)
        query = urllib.parse.urlencode({"format": "md", "lang": "<b>x</b>"})
        _, _, text = self.raw_get(f"{self.report}?{query}")
        self.assertNotIn("<b>x</b>", text)

    def test_only_the_known_formats_are_served(self):
        for fmt, expected in (("json", "application/json"), ("sarif", "application/json"),
                              ("md", "text/markdown"), ("html", "text/html")):
            status, ctype, _ = self.raw_get(f"{self.report}?format={fmt}")
            self.assertEqual(status, 200, fmt)
            self.assertIn(expected, ctype, fmt)
        # Anything else is the JSON report, as before; the value is not echoed.
        for fmt in ("HTML", "pdf", "<script>x</script>", "../etc"):
            query = urllib.parse.urlencode({"format": fmt, "lang": "en"})
            status, ctype, text = self.raw_get(f"{self.report}?{query}")
            self.assertEqual(status, 200, fmt)
            self.assertIn("application/json", ctype, fmt)
            self.assertEqual(json.loads(text)["project"]["id"], self.demo["pid"])
            self.assertNotIn(fmt, text)

    def test_a_signed_in_caller_gets_the_same_treatment(self):
        token = self.owner_token()
        query = urllib.parse.urlencode({"format": "html", "lang": '"><script>alert(1)</script>'})
        status, _, text = self.raw_get(f"{self.report}?{query}", token=token)
        self.assertEqual(status, 200)
        self.assertIn('<html lang="ar" dir="rtl">', text)
        self.assertNotIn("<script", text.lower())


# ---------------------------------------------------------------------------
# What a guest may read
# ---------------------------------------------------------------------------
class TestGuestView(HardeningCase):
    """A demo project that holds everything a guest must not be sent."""
    FAKE_TOOLS = False

    def setUp(self):
        super().setUp()
        from app import demo, evidence, findings, queue, store
        from app.connectors import sync_registry
        from app.connectors.base import Connector, EvidenceArtifact, RawFinding
        patcher = mock.patch.object(Connector, "readiness", ready_with_path)
        patcher.start()
        self.addCleanup(patcher.stop)
        sync_registry()
        out = demo.ensure_public_demo()
        pid = out["project_id"]
        asset = store.get_asset(out["asset_id"])
        self.app_dir = str(ROOT)
        self.data_dir = str(self.cfg.data_dir)
        jobs = {j["connector"]: j for j in queue.list_jobs(pid)}
        # A finding that names server paths the way a scanner could report them.
        raw = RawFinding(rule_id="demo:R1", title="Demo finding on the bundled sample",
                         severity="high", confidence="high",
                         location={"file": str(SAMPLE / "app.py"), "line": 24}, cwe="CWE-78",
                         description=f"read from {SAMPLE}/app.py; cache in {self.data_dir}/cache",
                         remediation=f"edit {SAMPLE}/app.py")
        findings.ingest(jobs["bandit"], asset, [raw])
        artifact = EvidenceArtifact(name="raw.txt", kind="raw", text=EVIDENCE_TEXT)
        evidence.store_artifact(pid, artifact, job_id=jobs["bandit"]["id"],
                                finding_id=raw._finding_id)
        queue.complete(jobs["bandit"]["id"], "succeeded",
                       result_summary={"outcome": "succeeded", "coverage": f"scanned {SAMPLE}"})
        # A failed job whose error text carries both directories.
        queue.complete(jobs["gitleaks"]["id"], "failed", error={
            "code": "connector_error",
            "message": f"source path not found or not a directory: {SAMPLE}; "
                       f"evidence root {self.cfg.evidence_dir}"})
        self.pid, self.aid, self.sid = pid, out["asset_id"], out["scope_id"]
        self.jid, self.fid = jobs["bandit"]["id"], raw._finding_id
        self.forbidden = {
            "application directory": self.app_dir,
            "data directory": self.data_dir,
            "redacted_summary": "redacted_summary",
            "storage_ref": "storage_ref",
            "local_path": "local_path",
            "tool binary path": TOOL_DIR,
            "evidence text": "EVIDENCE-BODY-MARKER",
        }

    def crawl(self, token=None):
        """GET every guest-readable URL of the demo project: the list routes
        first, then each job and finding they name, and the report in every
        format. Returns {url: body text}, keyed by route pattern."""
        from app import server
        pid = self.pid
        project = f"/api/projects/{pid}"
        _, _, jobs_text = self.raw_get(f"{project}/jobs", token=token)
        _, _, findings_text = self.raw_get(f"{project}/findings", token=token)
        job_ids = [j["id"] for j in json.loads(jobs_text)["jobs"]]
        finding_ids = [f["id"] for f in json.loads(findings_text)["findings"]]
        self.assertEqual(len(job_ids), 3)
        self.assertEqual(finding_ids, [self.fid])
        reports = [f"{project}/report"]
        for fmt in server.REPORT_FORMATS:
            reports.append(f"{project}/report?format={fmt}")
            reports += [f"{project}/report?format={fmt}&lang={lang}"
                        for lang in server.REPORT_LANGS]
        urls = {
            r"/api/me": ["/api/me"],
            r"/api/projects": ["/api/projects"],
            r"/api/projects/(?P<pid>[\w-]+)": [project],
            r"/api/projects/(?P<pid>[\w-]+)/assets": [f"{project}/assets"],
            r"/api/projects/(?P<pid>[\w-]+)/scopes":
                [f"{project}/scopes", f"{project}/scopes?asset_id={self.aid}"],
            r"/api/catalog": ["/api/catalog", "/api/catalog?category=SAST"],
            r"/api/tools": ["/api/tools"],
            r"/api/connectors": ["/api/connectors"],
            r"/api/projects/(?P<pid>[\w-]+)/jobs":
                [f"{project}/jobs", f"{project}/jobs?state=failed"],
            r"/api/jobs/(?P<jid>[\w-]+)": [f"/api/jobs/{jid}" for jid in job_ids],
            r"/api/projects/(?P<pid>[\w-]+)/findings":
                [f"{project}/findings", f"{project}/findings?severity=high"],
            r"/api/findings/(?P<fid>[\w-]+)": [f"/api/findings/{fid}" for fid in finding_ids],
            r"/api/projects/(?P<pid>[\w-]+)/report": reports,
            r"/api/ai/status": ["/api/ai/status"],
            r"/api/metrics": [f"/api/metrics?project={pid}"],
        }
        guest_ok = {rx.pattern[1:-1] for _m, rx, _fn, _a, _g, ok in server._ROUTES if ok}
        self.assertEqual(set(urls), guest_ok, "every guest_ok route must be crawled here")
        bodies = {}
        for pattern, paths in urls.items():
            for path in paths:
                status, _ctype, text = self.raw_get(path, token=token)
                self.assertEqual(status, 200, path)
                self.assertTrue(text, path)
                bodies[path] = text
        return bodies

    def test_no_guest_response_carries_evidence_text_or_server_paths(self):
        bodies = self.crawl()
        self.assertGreaterEqual(len(bodies), 30)
        for path, text in bodies.items():
            for what, needle in self.forbidden.items():
                self.assertNotIn(needle, text, f"{what} in the guest response of {path}")

    def test_the_fixture_really_contains_what_the_guest_view_removes(self):
        # The same crawl with a session finds every item, so the test above
        # cannot pass just because the data was never there.
        everything = "\n".join(self.crawl(token=self.owner_token()).values())
        for what, needle in self.forbidden.items():
            self.assertIn(needle, everything, what)

    def test_guest_error_responses_go_through_the_same_view(self):
        from app import server

        def boom(_project_id):
            raise RuntimeError(f"{self.app_dir}/app: {self.data_dir}/x.db")

        with mock.patch.object(server.store, "list_assets", boom):
            status, _, text = self.raw_get(f"/api/projects/{self.pid}/assets")
            self.assertEqual(status, 500)
            self.assertNotIn(self.app_dir, text)
            self.assertNotIn(self.data_dir, text)
            self.assertEqual(json.loads(text)["error"]["message"], "app: data/x.db")
            # With a session the message is unchanged.
            _, _, text = self.raw_get(f"/api/projects/{self.pid}/assets", token=self.owner_token())
            self.assertIn(self.app_dir, text)

    def test_guest_job_detail_has_no_evidence_text_but_a_member_gets_the_summary(self):
        from app import store
        status, body = self.get(f"/api/jobs/{self.jid}")
        self.assertEqual(status, 200)
        self.assertEqual(body["job"]["id"], self.jid)
        self.assertEqual(len(body["evidence"]), 1)
        row = body["evidence"][0]
        # The record of the evidence stays; its text and location do not.
        self.assertEqual(set(row), {"id", "kind", "sha256", "bytes", "access_policy",
                                    "retention_until", "created_at", "finding_id"})
        self.assertNotIn("EVIDENCE-BODY-MARKER", json.dumps(body))
        status, body = self.get(f"/api/findings/{self.fid}")
        self.assertEqual(status, 200)
        self.assertEqual(set(body["evidence"][0]), {"id", "kind", "sha256", "bytes", "created_at"})
        self.assertNotIn("EVIDENCE-BODY-MARKER", json.dumps(body))

        # A signed-in member of the project is not a guest: nothing is removed.
        uid, token = self.new_user("member@test.local")
        store.add_member(self.pid, uid, "reader")
        status, body = self.get(f"/api/jobs/{self.jid}", token=token)
        self.assertEqual(status, 200)
        self.assertEqual(body["evidence"][0]["redacted_summary"], EVIDENCE_TEXT)
        self.assertTrue(body["evidence"][0]["storage_ref"].startswith(self.pid))
        status, body = self.get(f"/api/findings/{self.fid}", token=token)
        self.assertEqual(body["evidence"][0]["redacted_summary"], EVIDENCE_TEXT)
        status, body = self.get(f"/api/projects/{self.pid}/assets", token=token)
        self.assertEqual(body["assets"][0]["identifier"], str(SAMPLE))
        self.assertEqual(body["assets"][0]["metadata"]["local_path"], str(SAMPLE))

    def test_guest_sees_the_sample_as_a_relative_path(self):
        _, body = self.get(f"/api/projects/{self.pid}/assets")
        asset = body["assets"][0]
        self.assertEqual(asset["identifier"], "samples/vulnerable-app")
        self.assertEqual(asset["metadata"], {"public_demo": True})
        _, body = self.get(f"/api/projects/{self.pid}/scopes")
        self.assertEqual(body["scopes"][0]["allowed_targets"], ["samples/vulnerable-app"])
        _, body = self.get(f"/api/findings/{self.fid}")
        self.assertEqual(body["finding"]["location"]["file"], "samples/vulnerable-app/app.py")
        self.assertEqual(body["finding"]["description"],
                         "read from samples/vulnerable-app/app.py; cache in data/cache")
        _, body = self.get(f"/api/projects/{self.pid}/jobs?state=failed")
        self.assertEqual(body["jobs"][0]["error"]["message"],
                         "source path not found or not a directory: samples/vulnerable-app; "
                         "evidence root data/evidence")
        for fmt in ("md", "html"):
            _, _, text = self.raw_get(f"/api/projects/{self.pid}/report?format={fmt}&lang=en")
            self.assertIn("samples/vulnerable-app/app.py:24", text, fmt)
        _, body = self.get(f"/api/projects/{self.pid}/report?format=sarif")
        uri = body["runs"][0]["results"][0]["locations"][0]["physicalLocation"]["artifactLocation"]
        self.assertEqual(uri, {"uri": "samples/vulnerable-app/app.py"})

    def test_guest_tool_listings_have_no_binary_path(self):
        token = self.owner_token()
        for path, key in (("/api/tools", "tools"), ("/api/connectors", "connectors")):
            status, body = self.get(path)
            self.assertEqual(status, 200)
            self.assertGreater(len(body[key]), 5)
            for row in body[key]:
                self.assertNotIn("path", row["readiness"], row["name"])
                self.assertIn("available", row["readiness"], row["name"])
            _, body = self.get(path, token=token)
            self.assertTrue(any(row["readiness"].get("path", "").startswith(TOOL_DIR)
                                for row in body[key]), path)


class TestGuestViewFunction(unittest.TestCase):
    """app.guest_view.apply on its own (no server, fixed directories)."""

    def view(self, body, app_dir="/app", data_dir="/data"):
        from app import guest_view
        cfg = mock.Mock(data_dir=data_dir)
        with mock.patch.object(guest_view, "APP_DIR", app_dir), \
                mock.patch.object(guest_view, "get_config", lambda: cfg):
            return guest_view.apply(body)

    def test_keys_are_dropped_at_any_depth(self):
        body = {"job": {"id": "j", "path": "kept: not inside a readiness object"},
                "evidence": [{"id": "e", "redacted_summary": "text", "storage_ref": "p/j/x"}],
                "assets": [{"metadata": {"local_path": "/app/samples", "public_demo": True}}],
                "tools": [{"name": "t", "readiness": {"available": True, "path": "/usr/bin/t"}}],
                "nested": {"readiness": {"path": "/x", "more": {"path": "kept"}}}}
        before = json.dumps(body, sort_keys=True)
        self.assertEqual(self.view(body), {
            "job": {"id": "j", "path": "kept: not inside a readiness object"},
            "evidence": [{"id": "e"}],
            "assets": [{"metadata": {"public_demo": True}}],
            "tools": [{"name": "t", "readiness": {"available": True}}],
            "nested": {"readiness": {"more": {"path": "kept"}}}})
        self.assertEqual(json.dumps(body, sort_keys=True), before)    # the input is not modified

    def test_directories_are_removed_from_strings(self):
        cases = {
            "/app/samples/vulnerable-app": "samples/vulnerable-app",
            "/app": "",
            "not a directory: /app/samples/x": "not a directory: samples/x",
            "open '/data/evidence/a.txt' failed": "open 'data/evidence/a.txt' failed",
            "/data": "data",
            "stored under /data.": "stored under data.",
            "PATH=/usr/bin:/app/bin": "PATH=/usr/bin:bin",
            # Not the directory itself: longer names and URLs are left alone.
            "https://github.com/owner/app/tree": "https://github.com/owner/app/tree",
            "https://example.com/data/x": "https://example.com/data/x",
            "/apple/pie": "/apple/pie",
            "/app-old/x": "/app-old/x",
            "/database/x": "/database/x",
            "/srv/app/x": "/srv/app/x",
            "no path here": "no path here",
        }
        for given, expected in cases.items():
            self.assertEqual(self.view({"v": [given]}), {"v": [expected]}, given)

    def test_a_data_directory_inside_the_application_directory_reads_data(self):
        out = self.view({"a": "/srv/fsl/var/evidence/x", "b": "/srv/fsl/samples/y"},
                        app_dir="/srv/fsl", data_dir="/srv/fsl/var")
        self.assertEqual(out, {"a": "data/evidence/x", "b": "samples/y"})

    def test_report_text_gets_the_same_treatment_in_every_escaping(self):
        app_dir = '/o"dd/a&b'
        ctype, text = self.view(("text/html; charset=utf-8",
                                 "<code>/o&quot;dd/a&amp;b/samples/app.py:3</code>"),
                                app_dir=app_dir)
        self.assertEqual((ctype, text),
                         ("text/html; charset=utf-8", "<code>samples/app.py:3</code>"))
        sarif = json.dumps({"uri": f"{app_dir}/samples/app.py"})
        self.assertEqual(self.view(("application/json", sarif), app_dir=app_dir),
                         ("application/json", '{"uri": "samples/app.py"}'))
        self.assertEqual(self.view(("text/markdown; charset=utf-8", f"`{app_dir}/samples/app.py`"),
                                   app_dir=app_dir),
                         ("text/markdown; charset=utf-8", "`samples/app.py`"))

    def test_a_root_directory_is_never_used_as_a_prefix(self):
        self.assertEqual(self.view({"a": "/etc/x /app/y"}, app_dir="/", data_dir="/"),
                         {"a": "/etc/x /app/y"})

    def test_other_values_pass_through(self):
        body = {"n": 1, "f": 1.5, "t": True, "none": None, "list": [1, "a", None], "empty": {}}
        self.assertEqual(self.view(body), body)


# ---------------------------------------------------------------------------
# The guest connector listing
# ---------------------------------------------------------------------------
class TestGuestConnectorListing(HardeningCase):
    FAKE_TOOLS = False

    def setUp(self):
        super().setUp()
        from app.connectors.base import Connector
        self.probes = []

        def counted(conn):
            self.probes.append(conn.name)
            return ready_with_path(conn)

        patcher = mock.patch.object(Connector, "readiness", counted)
        patcher.start()
        self.addCleanup(patcher.stop)

    def test_empty_until_the_registry_has_been_synced(self):
        self.assertEqual(self.get("/api/connectors"), (200, {"connectors": []}))
        self.assertEqual(self.probes, [])

    def test_a_guest_never_triggers_a_tool_probe(self):
        from app import server
        from app.connectors import sync_registry
        sync_registry()
        self.assertGreater(len(self.probes), 5)       # the startup sync is what probes
        self.probes.clear()
        with mock.patch.object(server, "_connectors_live", wraps=server._connectors_live) as live:
            for _ in range(5):
                self.assertEqual(self.get("/api/connectors")[0], 200)
            self.assertEqual(live.call_count, 0)
            self.assertEqual(self.probes, [])
            # A signed-in caller still gets a live probe on every request.
            token = self.owner_token()
            for _ in range(2):
                self.assertEqual(self.get("/api/connectors", token=token)[0], 200)
            self.assertEqual(live.call_count, 2)
        self.assertGreater(len(self.probes), 5)
        for name in ("GUEST_CONNECTORS_TTL", "_CONNECTORS_CACHE", "_CONNECTORS_LOCK"):
            self.assertFalse(hasattr(server, name), name)

    def test_the_guest_listing_has_the_shape_of_the_live_one(self):
        from app import store
        from app.connectors import connector_names, sync_registry
        sync_registry()
        store.set_tool_state("bandit", "verified", verified_ref="bandit@test")
        _, live = self.get("/api/connectors", token=self.owner_token())
        _, guest = self.get("/api/connectors")
        live = {c["name"]: c for c in live["connectors"]}
        guest = {c["name"]: c for c in guest["connectors"]}
        self.assertEqual(sorted(guest), connector_names())
        self.assertEqual(set(guest), set(live))
        for name, entry in guest.items():
            self.assertEqual(set(entry), set(live[name]) | {"state"}, name)
            for key in ("category", "source", "license", "connector_type", "capabilities"):
                self.assertEqual(entry[key], live[name][key], f"{name}.{key}")
            self.assertIs(entry["readiness"]["available"], live[name]["readiness"]["available"])
            self.assertNotIn("path", entry["readiness"])
        self.assertEqual(guest["bandit"]["state"], "verified")
        self.assertEqual(guest["gitleaks"]["state"], "ready")

    def test_a_registry_row_without_a_connector_is_still_listed(self):
        from app import store
        store.upsert_tool_registry("retired_tool", {"category": "SAST", "state": "blocked",
                                                    "readiness": {"available": False}})
        _, body = self.get("/api/connectors")
        self.assertEqual(body["connectors"], [{
            "name": "retired_tool", "category": "SAST", "source": "", "license": "",
            "connector_type": "cli", "capabilities": {}, "readiness": {"available": False},
            "state": "blocked"}])


# ---------------------------------------------------------------------------
# The guest rate limit table and the global ceiling
# ---------------------------------------------------------------------------
class TestGuestRateLimitTable(HardeningCase):
    def test_limits(self):
        from app import server
        self.assertEqual(server.GUEST_LIMIT_PER_MINUTE, 240)
        self.assertEqual(server.GUEST_GLOBAL_LIMIT_PER_MINUTE, 1200)
        self.assertEqual(server.GUEST_WINDOW_SECONDS, 60)

    def test_a_full_table_still_admits_a_new_client(self):
        from app import server
        now = 3_000_000.0
        with mock.patch.object(server, "GUEST_MAX_CLIENTS", 3):
            for i in range(3):
                server.guest_rate_check(f"10.0.0.{i}", now + i)
            self.assertEqual(len(server._GUEST_HITS), 3)
            server.guest_rate_check("10.0.0.99", now + 3)             # not refused
            self.assertEqual(sorted(server._GUEST_HITS), ["10.0.0.1", "10.0.0.2", "10.0.0.99"])
            # The client that was forgotten is simply admitted again.
            server.guest_rate_check("10.0.0.0", now + 4)
            self.assertEqual(sorted(server._GUEST_HITS), ["10.0.0.0", "10.0.0.2", "10.0.0.99"])
            self.assertEqual(server._GUEST_HITS["10.0.0.0"], [now + 4, 1])

    def test_expired_entries_go_before_live_ones(self):
        from app import server
        now = 3_100_000.0
        with mock.patch.object(server, "GUEST_MAX_CLIENTS", 4):
            server.guest_rate_check("old-1", now)
            server.guest_rate_check("old-2", now + 1)
            server.guest_rate_check("live-1", now + 50)
            server.guest_rate_check("live-2", now + 55)
            server.guest_rate_check("new", now + 62)      # both "old" windows have expired
            self.assertEqual(sorted(server._GUEST_HITS), ["live-1", "live-2", "new"])

    def test_the_oldest_windows_are_evicted_in_a_batch(self):
        from app import server
        now = 3_200_000.0
        with mock.patch.object(server, "GUEST_MAX_CLIENTS", 16):
            # Inserted newest first: eviction goes by window start, not by insertion.
            for i in reversed(range(16)):
                server.guest_rate_check(f"c{i:02d}", now + i)
            server.guest_rate_check("new", now + 20)
            self.assertEqual(len(server._GUEST_HITS), 15)             # 16 - 16 // 8 + 1
            self.assertNotIn("c00", server._GUEST_HITS)
            self.assertNotIn("c01", server._GUEST_HITS)
            self.assertIn("c02", server._GUEST_HITS)
            self.assertIn("new", server._GUEST_HITS)
            for i in range(200):
                server.guest_rate_check(f"flood-{i}", now + 21)
                self.assertLessEqual(len(server._GUEST_HITS), 16)

    def test_a_known_client_keeps_its_count_while_the_table_is_full(self):
        from app import server
        from app.errors import RateLimitError
        now = 3_300_000.0
        with mock.patch.object(server, "GUEST_MAX_CLIENTS", 2), \
                mock.patch.object(server, "GUEST_LIMIT_PER_MINUTE", 3):
            server.guest_rate_check("a", now)
            server.guest_rate_check("b", now + 1)
            for _ in range(2):
                server.guest_rate_check("b", now + 2)
            with self.assertRaises(RateLimitError) as caught:
                server.guest_rate_check("b", now + 3)
            self.assertEqual(caught.exception.message, "rate limit exceeded; slow down or sign in")
            self.assertEqual(sorted(server._GUEST_HITS), ["a", "b"])

    def test_global_ceiling(self):
        from app import server
        from app.errors import RateLimitError
        now = 3_400_000.0
        with mock.patch.object(server, "GUEST_GLOBAL_LIMIT_PER_MINUTE", 5):
            for i in range(5):
                server.guest_rate_check(f"10.1.0.{i}", now + i)
            for client in ("10.1.0.0", "10.1.0.77"):                  # known and new alike
                with self.assertRaises(RateLimitError) as caught:
                    server.guest_rate_check(client, now + 6)
                self.assertEqual(caught.exception.message,
                                 "the public view is busy; try again in a minute")
                self.assertEqual(caught.exception.status, 429)
            self.assertNotIn("10.1.0.77", server._GUEST_HITS)
            # A fixed window: it opens again one minute after it started.
            with self.assertRaises(RateLimitError):
                server.guest_rate_check("10.1.0.77", now + server.GUEST_WINDOW_SECONDS - 1)
            server.guest_rate_check("10.1.0.77", now + server.GUEST_WINDOW_SECONDS)

    def test_refused_requests_do_not_use_up_the_global_ceiling(self):
        from app import server
        from app.errors import RateLimitError
        now = 3_500_000.0
        with mock.patch.object(server, "GUEST_GLOBAL_LIMIT_PER_MINUTE", 5), \
                mock.patch.object(server, "GUEST_LIMIT_PER_MINUTE", 2):
            for _ in range(2):
                server.guest_rate_check("greedy", now)
            for _ in range(50):
                with self.assertRaises(RateLimitError) as caught:
                    server.guest_rate_check("greedy", now + 1)
                self.assertIn("slow down", caught.exception.message)
            for client in ("b", "c", "d"):                            # 2 + 3 = the ceiling
                server.guest_rate_check(client, now + 2)
            with self.assertRaises(RateLimitError) as caught:
                server.guest_rate_check("e", now + 3)
            self.assertIn("busy", caught.exception.message)

    def test_http_429_at_the_global_ceiling_for_guests_only(self):
        from app import server
        self.seed_demo()
        token = self.owner_token()
        with mock.patch.object(server, "GUEST_GLOBAL_LIMIT_PER_MINUTE", 4):
            # Signed-in traffic is never counted, before or after.
            for _ in range(6):
                self.assertEqual(self.get("/api/projects", token=token)[0], 200)
            for _ in range(4):
                self.assertEqual(self.get("/api/projects")[0], 200)
            for path in ("/api/projects", "/api/me", f"/api/projects/{self.demo['pid']}/findings"):
                status, body = self.get(path)
                self.assertEqual(status, 429, path)
                self.assertEqual(body["error"]["code"], "rate_limited")
                self.assertEqual(body["error"]["message"],
                                 "the public view is busy; try again in a minute")
            for _ in range(6):
                self.assertEqual(self.get("/api/projects", token=token)[0], 200)
            self.assertEqual(self.get(f"/api/projects/{self.demo['pid']}", token=token)[0], 200)
            self.assertEqual(self.get("/api/health")[0], 200)
            self.assertEqual(self.get("/api/config")[0], 200)
            self.assertEqual(server._GUEST_GLOBAL[1], 4)


# ---------------------------------------------------------------------------
# A demo scan that ended without a result is run again
# ---------------------------------------------------------------------------
class TestDemoScanRetry(HardeningCase):
    def setUp(self):
        super().setUp()
        from app import demo
        self.first = demo.ensure_public_demo()
        self.pid = self.first["project_id"]
        self.jobs = {j["connector"]: j for j in self.demo_jobs(self.pid)}
        self.assertEqual(sorted(self.jobs), ["bandit", "gitleaks", "pip_audit"])

    def key(self, connector, generation=1):
        first = f"public-demo:{self.first['scope_id']}:{connector}"
        return first if generation == 1 else f"{first}:{generation}"

    def test_constants_match_the_queue(self):
        from app import demo, queue
        self.assertEqual(demo.DEMO_MAX_ATTEMPTS, 3)
        self.assertEqual(set(demo.SETTLED_JOB_STATES), {"queued", "leased", "running", "succeeded"})
        self.assertEqual(queue.ACTIVE_STATES, ("queued", "leased", "running"))
        self.assertEqual(self.jobs["bandit"]["idempotency_key"], self.key("bandit"))

    def test_a_job_without_a_result_leads_to_exactly_one_new_job(self):
        from app import demo, queue
        for connector, state in (("bandit", "failed"), ("gitleaks", "undetermined"),
                                 ("pip_audit", "blocked"), ("bandit", "cancelled")):
            with self.subTest(connector=connector, state=state):
                latest = self.demo_jobs(self.pid, connector)[-1]
                before = len(queue.list_jobs(self.pid))
                self.set_job_state(latest["id"], state)
                out = demo.ensure_public_demo()
                self.assertEqual(len(out["enqueued"]), 1)
                new = queue.get_job(out["enqueued"][0])
                self.assertEqual((new["connector"], new["state"]), (connector, "queued"))
                self.assertEqual(new["scope_id"], self.first["scope_id"])
                self.assertEqual(new["priority"], demo.DEMO_PRIORITY)
                self.assertNotEqual(new["id"], latest["id"])
                self.assertEqual(len(queue.list_jobs(self.pid)), before + 1)
                self.assertEqual(queue.get_job(latest["id"])["state"], state)   # history is kept
                others = {name for name in self.jobs if name != connector}
                self.assertEqual(out["skipped"], {name: "already_enqueued" for name in others})
                # The new job is waiting: another start adds nothing.
                again = demo.ensure_public_demo()
                self.assertEqual(again["enqueued"], [])
                self.assertEqual(again["skipped"][connector], "already_enqueued")
        keys = [j["idempotency_key"] for j in self.demo_jobs(self.pid, "bandit")]
        self.assertEqual(keys, [self.key("bandit"), self.key("bandit", 2), self.key("bandit", 3)])
        self.assertEqual([j["idempotency_key"] for j in self.demo_jobs(self.pid, "gitleaks")],
                         [self.key("gitleaks"), self.key("gitleaks", 2)])

    def test_a_succeeded_job_is_not_repeated(self):
        from app import demo, queue
        for job in self.jobs.values():
            queue.complete(job["id"], "succeeded")
        for _ in range(3):
            out = demo.ensure_public_demo()
            self.assertEqual(out["enqueued"], [])
            self.assertEqual(out["skipped"], {name: "already_enqueued" for name in self.jobs})
        self.assertEqual(len(queue.list_jobs(self.pid)), 3)

    def test_a_job_that_is_waiting_or_in_progress_is_not_duplicated(self):
        from app import demo, queue
        for state in ("queued", "leased", "running"):
            self.set_job_state(self.jobs["bandit"]["id"], state)
            out = demo.ensure_public_demo()
            self.assertEqual(out["enqueued"], [], state)
            self.assertEqual(out["skipped"]["bandit"], "already_enqueued", state)
        self.assertEqual(len(queue.list_jobs(self.pid)), 3)

    def test_after_three_jobs_nothing_more_is_enqueued(self):
        from app import demo, queue
        for attempt in (1, 2):
            self.set_job_state(self.demo_jobs(self.pid, "bandit")[-1]["id"], "failed")
            out = demo.ensure_public_demo()
            self.assertEqual(len(out["enqueued"]), 1, attempt)
        self.assertEqual(len(self.demo_jobs(self.pid, "bandit")), demo.DEMO_MAX_ATTEMPTS)
        self.set_job_state(self.demo_jobs(self.pid, "bandit")[-1]["id"], "failed")
        for _ in range(3):
            out = demo.ensure_public_demo()
            self.assertEqual(out["enqueued"], [])
            self.assertEqual(out["skipped"], {"bandit": "attempts_exhausted",
                                              "gitleaks": "already_enqueued",
                                              "pip_audit": "already_enqueued"})
        bandit = self.demo_jobs(self.pid, "bandit")
        self.assertEqual([j["state"] for j in bandit], ["failed"] * 3)
        self.assertEqual(len(queue.list_jobs(self.pid)), 5)

    def test_a_retry_that_succeeds_settles_the_connector(self):
        from app import demo, queue
        self.set_job_state(self.jobs["bandit"]["id"], "failed")
        retry = demo.ensure_public_demo()["enqueued"][0]
        queue.complete(retry, "succeeded")
        out = demo.ensure_public_demo()
        self.assertEqual(out["enqueued"], [])
        self.assertEqual(out["skipped"]["bandit"], "already_enqueued")
        self.assertEqual(len(self.demo_jobs(self.pid, "bandit")), 2)

    def test_a_retry_waits_until_the_tool_is_ready_and_costs_no_attempt(self):
        from app import demo
        from app.connectors.base import Connector
        self.set_job_state(self.jobs["bandit"]["id"], "failed")
        not_ready = {"installed": False, "available": False, "version": None, "detail": "t"}
        with mock.patch.object(Connector, "readiness", lambda self: dict(not_ready)):
            for _ in range(5):
                out = demo.ensure_public_demo()
                self.assertEqual(out["enqueued"], [])
                self.assertEqual(out["skipped"]["bandit"], "not_ready")
        self.assertEqual(len(self.demo_jobs(self.pid, "bandit")), 1)
        self.assertEqual(len(demo.ensure_public_demo()["enqueued"]), 1)

    def test_a_scan_interrupted_by_a_restart_is_run_again(self):
        # The worker was lost mid-scan: once its lease has expired the queue
        # marks the job undetermined, and the next start enqueues it again.
        from app import demo, queue
        from app.db import get_db
        job = queue.claim_next("worker-that-dies", ["bandit"])
        self.assertEqual(job["id"], self.jobs["bandit"]["id"])
        queue.mark_running(job["id"], "worker-that-dies")
        self.assertEqual(demo.ensure_public_demo()["enqueued"], [])      # still running
        get_db().execute("UPDATE jobs SET lease_expires_at='2000-01-01T00:00:00+00:00' WHERE id=?",
                         (job["id"],))
        self.assertEqual(queue.reclaim_expired(), {"requeued": 0, "undetermined": 1})
        base.reload_platform()                                           # the restart
        out = demo.ensure_public_demo()
        self.assertEqual(len(out["enqueued"]), 1)
        new = queue.get_job(out["enqueued"][0])
        self.assertEqual((new["connector"], new["idempotency_key"]),
                         ("bandit", self.key("bandit", 2)))

    def test_a_reissued_scope_starts_counting_again(self):
        from app import demo, queue
        from app.config import reset_config_for_tests
        for _ in range(3):
            self.set_job_state(self.demo_jobs(self.pid, "bandit")[-1]["id"], "failed")
            demo.ensure_public_demo()
        self.assertEqual(demo.ensure_public_demo()["skipped"]["bandit"], "attempts_exhausted")
        reset_config_for_tests(dataclasses.replace(self.cfg, demo_connectors=("bandit",)))
        out = demo.ensure_public_demo()
        self.assertNotEqual(out["scope_id"], self.first["scope_id"])
        self.assertEqual(len(out["enqueued"]), 1)
        new = queue.get_job(out["enqueued"][0])
        self.assertEqual(new["idempotency_key"], f"public-demo:{out['scope_id']}:bandit")


# ---------------------------------------------------------------------------
# A scope revoked by an operator is not issued again
# ---------------------------------------------------------------------------
class TestOperatorRevocationSticks(HardeningCase):
    def start(self):
        """One start of the demo seeding, as server.main runs it. Returns
        (summary, what was logged)."""
        from app import server
        with contextlib.redirect_stderr(io.StringIO()) as err:
            out = server.seed_public_demo()
        return out, err.getvalue()

    def scopes(self, pid):
        from app import store
        return {s["id"]: s["status"] for s in store.list_scopes(pid)}

    def test_the_managed_scope_is_recorded(self):
        from app import demo
        from app.db import get_db
        self.assertEqual(demo.PUBLIC_SCOPE_KEY, "public_scope_id")
        out, log = self.start()
        self.assertEqual(get_db().get_setting("public_scope_id"), out["scope_id"])
        self.assertNotIn("revoked", log)
        self.assertIn("3 scan(s) enqueued", log)

    def test_a_revocation_by_an_operator_sticks_across_starts(self):
        from app import queue
        from app.db import get_db
        d = self.seed_demo()
        token = self.owner_token()
        status, body = self.http("POST", f"/api/scopes/{d['sid']}/revoke", token=token, body={})
        self.assertEqual((status, body["scope"]["status"]), (200, "revoked"))
        jobs_before = sorted(j["id"] for j in queue.list_jobs(d["pid"]))
        counts = self.table_counts()

        for start in (1, 2):
            base.reload_platform()                      # a restart on the same database
            out, log = self.start()
            self.assertEqual(out["skipped"], {"*": "scope_revoked"}, start)
            self.assertEqual(out["enqueued"], [])
            self.assertIs(out["enabled"], True)
            self.assertEqual((out["project_id"], out["scope_id"]), (d["pid"], d["sid"]))
            self.assertEqual(log.count(REVOKED_LINE), 1, log)
            self.assertEqual(len(log.strip().splitlines()), 1, log)
            self.assertEqual(self.scopes(d["pid"]), {d["sid"]: "revoked"})
            self.assertEqual(sorted(j["id"] for j in queue.list_jobs(d["pid"])), jobs_before)
            self.assertEqual(self.table_counts(), counts)
            self.assertEqual(get_db().get_setting("public_scope_id"), d["sid"])

        # The project and what it already holds stay readable.
        status, body = self.get("/api/projects")
        self.assertEqual((status, [p["id"] for p in body["projects"]]), (200, [d["pid"]]))
        status, body = self.get(f"/api/projects/{d['pid']}/findings")
        self.assertEqual((status, [f["id"] for f in body["findings"]]), (200, [d["fid"]]))
        status, body = self.get(f"/api/projects/{d['pid']}/scopes")
        self.assertEqual((status, [s["status"] for s in body["scopes"]]), (200, ["revoked"]))
        self.assertEqual(self.get(f"/api/projects/{d['pid']}/report")[0], 200)

    def test_a_revoked_scope_is_not_replaced_when_the_connector_list_changes(self):
        from app import demo, store
        from app.config import reset_config_for_tests
        out = demo.ensure_public_demo()
        store.revoke_scope(out["scope_id"])
        reset_config_for_tests(dataclasses.replace(self.cfg, demo_connectors=("bandit",)))
        again = demo.ensure_public_demo()
        self.assertEqual(again["skipped"], {"*": "scope_revoked"})
        self.assertEqual(self.scopes(out["project_id"]), {out["scope_id"]: "revoked"})

    def test_a_changed_connector_list_still_supersedes_and_reissues(self):
        from app import demo, store
        from app.config import reset_config_for_tests
        from app.db import get_db
        first = demo.ensure_public_demo()
        reset_config_for_tests(dataclasses.replace(self.cfg, demo_connectors=("bandit",)))
        second, log = self.start()
        self.assertNotEqual(second["scope_id"], first["scope_id"])
        self.assertEqual(self.scopes(first["project_id"]),
                         {first["scope_id"]: "revoked", second["scope_id"]: "active"})
        self.assertEqual(store.get_scope(second["scope_id"])["scan_types"], ["bandit"])
        self.assertEqual(get_db().get_setting("public_scope_id"), second["scope_id"])
        self.assertEqual(len(second["enqueued"]), 1)
        self.assertNotIn("revoked", log)
        # The scope this code replaced is not mistaken for an operator's revocation.
        for _ in range(2):
            base.reload_platform()
            reset_config_for_tests(dataclasses.replace(self.cfg, demo_connectors=("bandit",)))
            third, log = self.start()
            self.assertEqual(third["scope_id"], second["scope_id"])
            self.assertEqual(third["skipped"], {"bandit": "already_enqueued"})
            self.assertNotIn("revoked", log)
        # Revoking the scope now in force sticks like any other.
        store.revoke_scope(second["scope_id"])
        fourth, log = self.start()
        self.assertEqual(fourth["skipped"], {"*": "scope_revoked"})
        self.assertIn(REVOKED_LINE, log)
        self.assertEqual(set(self.scopes(first["project_id"]).values()), {"revoked"})

    def test_an_interrupted_supersede_is_not_read_as_a_revocation(self):
        # The new scope is recorded before the old one is revoked, so stopping
        # in between leaves the record on an active scope.
        from app import demo, store
        from app.config import reset_config_for_tests
        from app.db import get_db
        first = demo.ensure_public_demo()
        reset_config_for_tests(dataclasses.replace(self.cfg, demo_connectors=("bandit",)))
        with mock.patch.object(store, "revoke_scope", side_effect=RuntimeError("stopped here")):
            with self.assertRaises(RuntimeError):
                demo.ensure_public_demo()
        recorded = get_db().get_setting("public_scope_id")
        self.assertNotEqual(recorded, first["scope_id"])
        self.assertEqual(store.get_scope(recorded)["status"], "active")
        out = demo.ensure_public_demo()
        self.assertEqual(out["scope_id"], recorded)
        self.assertNotIn("*", out["skipped"])
        self.assertEqual(self.scopes(first["project_id"]),
                         {first["scope_id"]: "revoked", recorded: "active"})

    def test_revoking_a_scope_a_person_added_changes_nothing_for_the_demo(self):
        from app import demo, store
        out = demo.ensure_public_demo()
        mine = store.create_scope(out["project_id"], out["asset_id"], proof="OWNER-ADDED",
                                  allowed_targets=[str(SAMPLE)], scan_types=["semgrep"],
                                  created_by=self.owner_id())
        store.revoke_scope(mine["id"])
        again = demo.ensure_public_demo()
        self.assertEqual(again["scope_id"], out["scope_id"])
        self.assertNotIn("*", again["skipped"])
        self.assertEqual(store.get_scope(out["scope_id"])["status"], "active")

    def test_a_recorded_scope_that_no_longer_exists_is_ignored(self):
        from app import demo
        from app.db import get_db
        get_db().set_setting("public_scope_id", "scp_does_not_exist")
        out = demo.ensure_public_demo()
        self.assertEqual(len(out["enqueued"]), 3)
        self.assertEqual(get_db().get_setting("public_scope_id"), out["scope_id"])


# ---------------------------------------------------------------------------
# Startup order
# ---------------------------------------------------------------------------
class TestStartupOrder(HardeningCase):
    def run_main(self, sync, wait=20.0):
        """Run server.main() with the socket, the registry sync and the demo
        seeding replaced by probes. Returns (ordered events, the thread that
        called main, what was logged); the sync and seed events carry the
        thread they ran in."""
        from app import server
        from app.config import get_config
        seeding_expected = get_config().public_view
        events: list = []
        done = threading.Event()
        main_thread = threading.current_thread()

        class FakeServer:
            def serve_forever(self):
                done.wait(wait)
                events.append("serve")

        def fake_build(*_a, **_k):
            events.append("bind")
            return FakeServer()

        def fake_sync():
            events.append(("sync", threading.current_thread()))
            try:
                return sync()
            finally:
                if not seeding_expected:
                    done.set()

        def fake_seed():
            events.append(("seed", threading.current_thread()))
            done.set()

        with mock.patch.object(server, "build_server", fake_build), \
                mock.patch.object(server, "seed_public_demo", fake_seed), \
                mock.patch.object(server, "sync_registry", fake_sync), \
                mock.patch.dict(os.environ, {"FSL_NO_WORKER": "1"}), \
                contextlib.redirect_stderr(io.StringIO()) as err:
            server.main()
        return events, main_thread, err.getvalue()

    def test_registry_sync_runs_before_the_demo_in_one_background_thread(self):
        events, main_thread, log = self.run_main(lambda: [])
        self.assertEqual([e if isinstance(e, str) else e[0] for e in events],
                         ["bind", "sync", "seed", "serve"])
        sync_thread, seed_thread = events[1][1], events[2][1]
        self.assertIs(sync_thread, seed_thread)
        self.assertIsNot(sync_thread, main_thread)
        self.assertIn("tool registry synced", log)

    def test_a_failing_registry_sync_does_not_stop_the_demo(self):
        def broken():
            raise RuntimeError("probe exploded")

        events, _main, log = self.run_main(broken)
        self.assertEqual([e if isinstance(e, str) else e[0] for e in events],
                         ["bind", "sync", "seed", "serve"])
        self.assertIn("tool registry sync failed: RuntimeError: probe exploded", log)

    def test_without_the_public_view_only_the_registry_is_synced(self):
        from app.config import reset_config_for_tests
        reset_config_for_tests(dataclasses.replace(self.cfg, public_view=False))
        events, main_thread, _log = self.run_main(lambda: [])
        self.assertEqual([e if isinstance(e, str) else e[0] for e in events],
                         ["bind", "sync", "serve"])
        self.assertIsNot(events[1][1], main_thread)

    def test_a_demo_scan_finishing_after_startup_keeps_its_verified_state(self):
        # The order above exists for this: the registry row is there when the
        # worker records the first successful demo scan.
        from app import demo, store
        from app.connectors import sync_registry
        from app.connectors.registry import record_verified
        record_verified("bandit")             # before the sync there is no row to update
        self.assertIsNone(store.get_tool_registry("bandit"))
        sync_registry()
        self.assertEqual(store.get_tool_registry("bandit")["state"], "ready")
        demo.ensure_public_demo()
        record_verified("bandit")
        row = store.get_tool_registry("bandit")
        self.assertEqual(row["state"], "verified")
        self.assertTrue(row["last_verified_ref"].startswith("bandit@"))


# ---------------------------------------------------------------------------
# Signed-in accounts see the demo project too
# ---------------------------------------------------------------------------
class TestSignedInUsersSeeTheDemo(HardeningCase):
    def setUp(self):
        super().setUp()
        self.seed_demo()
        self.private = self.seed_private_project()

    def test_a_non_member_reads_the_demo_at_reader_level(self):
        from app import auth
        d = self.demo
        for role in ("reader", "analyst"):
            _uid, token = self.new_user(f"{role}@test.local", role)
            principal = auth.principal_from_token(token)
            self.assertEqual(principal.project_role(d["pid"]), "reader")
            self.assertEqual(principal.project_role(self.private["pid"]), "none")
            status, body = self.get("/api/projects", token=token)
            self.assertEqual((status, [p["id"] for p in body["projects"]]), (200, [d["pid"]]))
            for path in (f"/api/projects/{d['pid']}", f"/api/projects/{d['pid']}/assets",
                         f"/api/projects/{d['pid']}/scopes", f"/api/projects/{d['pid']}/jobs",
                         f"/api/jobs/{d['jid']}", f"/api/projects/{d['pid']}/findings",
                         f"/api/findings/{d['fid']}", f"/api/projects/{d['pid']}/report",
                         f"/api/projects/{d['pid']}/report?format=html",
                         f"/api/metrics?project={d['pid']}"):
                self.assertEqual(self.get(path, token=token)[0], 200, f"{role} {path}")
            # A session is not a guest: the response is not reduced.
            _, body = self.get(f"/api/jobs/{d['jid']}", token=token)
            self.assertEqual(body["evidence"][0]["redacted_summary"], "demo evidence body")
            # Nothing else opens up.
            for path in (f"/api/projects/{self.private['pid']}",
                         f"/api/projects/{self.private['pid']}/findings",
                         f"/api/jobs/{self.private['jid']}", f"/api/evidence/{d['eid']}",
                         f"/api/audit?project={d['pid']}", "/api/users"):
                self.assertEqual(self.get(path, token=token)[0], 403, f"{role} {path}")

    def test_every_write_by_a_non_member_is_still_refused(self):
        from app import findings as F
        from app import policy, queue, server, store
        from app.db import get_db
        d = self.demo
        ids = {"pid": d["pid"], "jid": d["jid"], "fid": d["fid"], "sid": d["sid"]}
        body = {"user_id": self.owner_id(), "role": "admin", "kind": "source",
                "identifier": str(SAMPLE), "asset_id": d["aid"], "scope_id": d["sid"],
                "proof": "x", "connector": "bandit", "scan_types": ["bandit"],
                "status": "false_positive", "verification": "confirmed", "engaged": True,
                "email": "made@test.local", "password": "long-enough-password-1"}
        for role in ("reader", "analyst"):
            uid, token = self.new_user(f"{role}@test.local", role)
            before = self.table_counts()
            allowed = []
            for method, rx, _fn, _auth, min_global, _g in server._ROUTES:
                pattern = rx.pattern[1:-1]
                on_the_demo = "(?P<" in pattern
                if method != "POST" or not (on_the_demo or min_global):
                    continue
                path = base.path_for(rx.pattern, ids)
                status, _ = self.http("POST", path, token=token, body=body)
                if status != 403:
                    allowed.append((pattern, status))
            # The AI summary is the one POST a reader may call; it stores nothing.
            self.assertEqual(allowed, [(r"/api/projects/(?P<pid>[\w-]+)/ai/report", 200)], role)
            self.assertEqual(self.table_counts(), before)
            self.assertEqual(store.get_scope(d["sid"])["status"], "active")
            self.assertEqual(F.get_finding(d["fid"])["status"], "open")
            self.assertEqual(F.get_finding(d["fid"])["verification_status"], "needs_verification")
            self.assertEqual(queue.get_job(d["jid"])["stop_requested"], 0)
            self.assertFalse(policy.global_stop_engaged())
            self.assertEqual(len(store.list_assets(d["pid"])), 1)
            self.assertEqual(len(queue.list_jobs(d["pid"])), 3)
            row = get_db().query_one(
                "SELECT role FROM project_members WHERE project_id=? AND user_id=?",
                (d["pid"], uid))
            self.assertIsNone(row)

    def test_the_named_writes_are_refused_with_403(self):
        d = self.demo
        _uid, token = self.new_user("analyst@test.local", "analyst")
        writes = {
            f"/api/projects/{d['pid']}/assets": {"kind": "source", "identifier": str(SAMPLE)},
            f"/api/projects/{d['pid']}/scopes": {"asset_id": d["aid"], "proof": "x",
                                                 "scan_types": ["bandit"]},
            f"/api/projects/{d['pid']}/scans": {"asset_id": d["aid"], "scope_id": d["sid"],
                                                "connector": "bandit"},
            f"/api/findings/{d['fid']}/status": {"status": "false_positive"},
        }
        for path, body in writes.items():
            status, out = self.http("POST", path, token=token, body=body)
            self.assertEqual(status, 403, path)
            self.assertEqual(out["error"]["code"], "forbidden", path)
            self.assertEqual(out["error"]["detail"]["have"], "reader", path)

    def test_higher_roles_still_come_from_membership(self):
        from app import auth, store
        d = self.demo
        uid, token = self.new_user("member@test.local")
        asset = {"kind": "source", "identifier": str(SAMPLE)}
        self.assertEqual(self.http("POST", f"/api/projects/{d['pid']}/assets", token=token,
                                   body=asset)[0], 403)
        store.add_member(d["pid"], uid, "analyst")
        self.assertEqual(auth.principal_from_token(token).project_role(d["pid"]), "analyst")
        self.assertEqual(self.http("POST", f"/api/projects/{d['pid']}/assets", token=token,
                                   body=asset)[0], 201)
        store.add_member(d["pid"], uid, "reader")
        self.assertEqual(auth.principal_from_token(token).project_role(d["pid"]), "reader")
        self.assertEqual(self.http("POST", f"/api/projects/{d['pid']}/assets", token=token,
                                   body=asset)[0], 403)

    def test_the_demo_is_listed_once_for_members_and_admins(self):
        from app import store
        d = self.demo
        uid, token = self.new_user("member@test.local")
        store.add_member(d["pid"], uid, "reader")
        store.add_member(self.private["pid"], uid, "reader")
        _, body = self.get("/api/projects", token=token)
        self.assertEqual(sorted(p["id"] for p in body["projects"]),
                         sorted([d["pid"], self.private["pid"]]))
        _, body = self.get("/api/projects", token=self.owner_token())
        self.assertEqual(sorted(p["id"] for p in body["projects"]),
                         sorted([d["pid"], self.private["pid"]]))

    def test_with_the_public_view_off_the_project_is_invisible_again(self):
        from app import auth
        from app.config import reset_config_for_tests
        d = self.demo
        _uid, token = self.new_user("reader@test.local")
        self.assertEqual(self.get(f"/api/projects/{d['pid']}", token=token)[0], 200)
        reset_config_for_tests(dataclasses.replace(self.cfg, public_view=False))
        self.assertEqual(auth.principal_from_token(token).project_role(d["pid"]), "none")
        self.assertEqual(self.get("/api/projects", token=token), (200, {"projects": []}))
        for path in (f"/api/projects/{d['pid']}", f"/api/projects/{d['pid']}/findings",
                     f"/api/jobs/{d['jid']}", f"/api/findings/{d['fid']}",
                     f"/api/projects/{d['pid']}/report", f"/api/metrics?project={d['pid']}"):
            self.assertEqual(self.get(path, token=token)[0], 403, path)
        # An admin still sees it, as any other project.
        _, body = self.get("/api/projects", token=self.owner_token())
        self.assertIn(d["pid"], [p["id"] for p in body["projects"]])

    def test_a_project_that_is_not_the_public_one_gains_nothing(self):
        # Only a project owned by the reserved system account can be public.
        from app import auth
        from app.db import get_db
        _uid, token = self.new_user("reader@test.local")
        get_db().set_setting(auth.PUBLIC_PROJECT_KEY, self.private["pid"])
        self.assertEqual(auth.principal_from_token(token).project_role(self.private["pid"]), "none")
        self.assertEqual(self.get("/api/projects", token=token), (200, {"projects": []}))
        self.assertEqual(self.get(f"/api/projects/{self.private['pid']}", token=token)[0], 403)


class TestSignedInWithoutADemoProject(HardeningCase):
    def test_nothing_changes_while_the_public_project_does_not_exist(self):
        from app import auth
        private = self.seed_private_project()
        _uid, token = self.new_user("reader@test.local")
        principal = auth.principal_from_token(token)
        self.assertEqual(auth.public_project_id(), "")
        self.assertEqual(principal.project_role(private["pid"]), "none")
        self.assertEqual(principal.project_role(""), "none")
        self.assertEqual(self.get("/api/projects", token=token), (200, {"projects": []}))
        self.assertEqual(self.get(f"/api/projects/{private['pid']}", token=token)[0], 403)
        _, body = self.get("/api/projects", token=self.owner_token())
        self.assertEqual([p["id"] for p in body["projects"]], [private["pid"]])


if __name__ == "__main__":
    unittest.main(verbosity=2)
