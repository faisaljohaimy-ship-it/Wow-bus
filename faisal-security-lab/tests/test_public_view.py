"""The optional PUBLIC READ-ONLY VIEW (FSL_PUBLIC_VIEW=1).

A visitor without a session may read exactly one designated demo project
through an explicit allowlist of GET routes. Everything else keeps requiring a
sign-in. These tests exercise the real HTTP layer (a server bound to 127.0.0.1
on an ephemeral port, driven with urllib) for every access decision, and the
demo seeding in app/demo.py directly.

Standard library only. Tool readiness is faked so the suite neither depends on
installed scanners nor runs them; one test at the end runs the real Bandit
against the bundled sample when it is installed.
"""
from __future__ import annotations

import contextlib
import dataclasses
import io
import json
import os
import re
import shutil
import sys
import tempfile
import threading
import unittest
import urllib.error
import urllib.request
from pathlib import Path
from unittest import mock

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
SAMPLE = ROOT / "samples" / "vulnerable-app"

OWNER_EMAIL = "owner@test.local"
OWNER_PASSWORD = "owner-password-123"
FAKE_READY = {"installed": True, "available": True, "version": "0.0-test",
              "detail": "faked by test_public_view"}
# Never route the loopback test traffic through an HTTP(S)_PROXY from the environment.
_OPENER = urllib.request.build_opener(urllib.request.ProxyHandler({}))
_ENV_KEYS = ("FSL_PUBLIC_VIEW", "FSL_DEMO_CONNECTORS", "FSL_DB_PATH", "FSL_EVIDENCE_DIR",
             "FSL_AI_PROVIDER", "FSL_AI_API_KEY", "PORT", "FSL_CLIENT_IP_HEADER",
             "FSL_TRUSTED_PROXY_HOPS", "FSL_PRIVDROP_FAILED")

# The complete guest allowlist. A route appearing here by accident, or going
# missing, must fail a test rather than slip through review.
GUEST_ALLOWLIST = {
    r"/api/me",
    r"/api/projects",
    r"/api/projects/(?P<pid>[\w-]+)",
    r"/api/projects/(?P<pid>[\w-]+)/assets",
    r"/api/projects/(?P<pid>[\w-]+)/scopes",
    r"/api/catalog",
    r"/api/tools",
    r"/api/connectors",
    r"/api/projects/(?P<pid>[\w-]+)/jobs",
    r"/api/jobs/(?P<jid>[\w-]+)",
    r"/api/projects/(?P<pid>[\w-]+)/findings",
    r"/api/findings/(?P<fid>[\w-]+)",
    r"/api/projects/(?P<pid>[\w-]+)/report",
    r"/api/ai/status",
    r"/api/metrics",
    r"/api/teams",
    r"/api/projects/(?P<pid>[\w-]+)/teams",
    r"/api/lab/challenges",
    r"/api/lab/solve",
    r"/api/lab/grade",
    r"/api/sim/scenarios",
    r"/api/sim/run",
}


def boot(public: bool, **env):
    """Fresh isolated platform; the public view is on only when asked."""
    tmp = Path(tempfile.mkdtemp(prefix="fsl-public-"))
    for key in _ENV_KEYS:
        os.environ.pop(key, None)
    os.environ["FSL_DATA_DIR"] = str(tmp)
    os.environ["FSL_OWNER_EMAIL"] = OWNER_EMAIL
    os.environ["FSL_OWNER_PASSWORD"] = OWNER_PASSWORD
    if public:
        os.environ["FSL_PUBLIC_VIEW"] = "1"
    os.environ.update(env)
    return reload_platform()


def reload_platform():
    """Rebuild config + database handle from the environment (a 'restart')."""
    from app.bootstrap import init_platform
    from app.config import Config, reset_config_for_tests
    from app.db import Database, reset_db_for_tests
    cfg = Config.from_env()
    reset_config_for_tests(cfg)
    reset_db_for_tests(Database(cfg.db_path))
    init_platform(sync_tools=False)
    return cfg


def _clean_env():
    # Other test modules build their config from the same process environment.
    for key in ("FSL_PUBLIC_VIEW", "FSL_DEMO_CONNECTORS", "FSL_CLIENT_IP_HEADER",
                "FSL_TRUSTED_PROXY_HOPS"):
        os.environ.pop(key, None)


def path_for(pattern: str, ids: dict) -> str:
    """Concrete URL path for a route regex, e.g. /api/jobs/(?P<jid>...) -> /api/jobs/job_1."""
    return re.sub(r"\(\?P<(\w+)>[^)]*\)", lambda m: ids[m.group(1)], pattern.strip("^$"))


class PublicViewCase(unittest.TestCase):
    PUBLIC = True
    ENV: dict = {}
    FAKE_TOOLS = True

    def setUp(self):
        from app import server
        from app.connectors.base import Connector
        self.addCleanup(_clean_env)
        self.cfg = boot(self.PUBLIC, **self.ENV)
        server._GUEST_HITS.clear()
        server._GUEST_GLOBAL[:] = [0.0, 0]
        server.reset_login_throttle_for_tests()
        if self.FAKE_TOOLS:
            patcher = mock.patch.object(Connector, "readiness", lambda self: dict(FAKE_READY))
            patcher.start()
            self.addCleanup(patcher.stop)
        # The real HTTP layer, loopback only, on a port chosen by the OS.
        self.srv = server.build_server("127.0.0.1", 0)
        self.assertEqual(self.srv.server_address[0], "127.0.0.1")
        self.base = f"http://127.0.0.1:{self.srv.server_address[1]}"
        threading.Thread(target=self.srv.serve_forever, daemon=True).start()
        self.addCleanup(self._stop_server)

    def _stop_server(self):
        self.srv.shutdown()
        self.srv.server_close()

    # --- helpers -----------------------------------------------------------
    def http(self, method, path, *, token=None, body=None, headers=None):
        hdrs = dict(headers or {})
        data = None
        if body is not None:
            data = json.dumps(body).encode("utf-8")
            hdrs["Content-Type"] = "application/json"
        if token is not None:
            hdrs["Authorization"] = f"Bearer {token}"
        req = urllib.request.Request(self.base + path, data=data, method=method, headers=hdrs)
        try:
            with _OPENER.open(req, timeout=30) as resp:
                status, raw, ctype = resp.status, resp.read(), resp.headers.get("Content-Type", "")
        except urllib.error.HTTPError as e:
            status, raw, ctype = e.code, e.read(), e.headers.get("Content-Type", "")
        if "application/json" in ctype and raw:
            return status, json.loads(raw.decode("utf-8"))
        return status, raw.decode("utf-8", "replace")

    def get(self, path, **kw):
        return self.http("GET", path, **kw)

    def owner_token(self):
        from app import auth
        return auth.login(OWNER_EMAIL, OWNER_PASSWORD)["token"]

    def owner_id(self):
        from app.db import get_db
        return get_db().query_one("SELECT id FROM users WHERE email=?", (OWNER_EMAIL,))["id"]

    def seed_demo(self):
        """Create the demo project and give it one finding and one evidence item."""
        from app import demo, evidence, findings, queue, store
        from app.connectors.base import EvidenceArtifact, RawFinding
        out = demo.ensure_public_demo()
        pid = out["project_id"]
        job = queue.list_jobs(pid)[0]
        asset = store.get_asset(out["asset_id"])
        raw = RawFinding(rule_id="demo:R1", title="Demo finding on the bundled sample",
                         severity="high", confidence="high",
                         location={"file": "app.py", "line": 24}, cwe="CWE-78")
        findings.ingest(job, asset, [raw])
        ev = evidence.store_artifact(pid, EvidenceArtifact(name="raw.txt", kind="raw",
                                                           text="demo evidence body"),
                                     job_id=job["id"])
        self.demo = {"pid": pid, "aid": out["asset_id"], "sid": out["scope_id"],
                     "jid": job["id"], "fid": raw._finding_id, "eid": ev["id"]}
        return self.demo

    def seed_private_project(self, name="TOP-SECRET-PROJECT"):
        """A real project owned by the owner, with data a guest must never see."""
        from app import evidence, findings, queue, store
        from app.connectors.base import EvidenceArtifact, RawFinding
        owner = self.owner_id()
        p = store.create_project(name, owner)
        a = store.create_asset(p["id"], "source", str(SAMPLE), created_by=owner,
                               metadata={"local_path": str(SAMPLE)})
        s = store.create_scope(p["id"], a["id"], proof="PRIVATE-PROOF",
                               allowed_targets=[str(SAMPLE)], scan_types=["bandit"],
                               created_by=owner)
        j = queue.enqueue(project_id=p["id"], asset_id=a["id"], scope_id=s["id"],
                          connector="bandit", params={}, created_by=owner,
                          idempotency_key=f"private-{p['id']}")
        raw = RawFinding(rule_id="private:R1", title="PRIVATE-FINDING-TITLE", severity="critical")
        findings.ingest(j, a, [raw])
        ev = evidence.store_artifact(p["id"], EvidenceArtifact(name="x.txt", kind="raw",
                                                               text="private evidence"),
                                     job_id=j["id"])
        return {"pid": p["id"], "aid": a["id"], "sid": s["id"], "jid": j["id"],
                "fid": raw._finding_id, "eid": ev["id"], "name": name}

    def table_counts(self):
        from app.db import get_db
        db = get_db()
        tables = ("users", "sessions", "projects", "project_members", "assets", "scopes",
                  "jobs", "findings", "evidence")
        return {t: db.query_one(f"SELECT COUNT(*) n FROM {t}")["n"] for t in tables}


# ---------------------------------------------------------------------------
# Off by default
# ---------------------------------------------------------------------------
class TestDisabledByDefault(PublicViewCase):
    PUBLIC = False

    def test_unauthenticated_projects_is_401(self):
        status, body = self.get("/api/projects")
        self.assertEqual(status, 401)
        self.assertEqual(body["error"]["code"], "unauthenticated")

    def test_config_reports_public_view_off(self):
        status, body = self.get("/api/config")
        self.assertEqual(status, 200)
        self.assertIs(body["public_view"], False)
        self.assertFalse(self.cfg.public_view)

    def test_every_protected_route_is_401_without_a_session(self):
        from app import server
        ids = {"pid": "prj_x", "jid": "job_x", "fid": "fnd_x", "sid": "scp_x", "eid": "evd_x"}
        checked = 0
        for method, rx, _fn, auth_required, min_global, _guest_ok in server._ROUTES:
            if not (auth_required or min_global):
                continue
            path = path_for(rx.pattern, ids)
            status, _ = self.http(method, path, body={} if method == "POST" else None)
            self.assertEqual(status, 401, f"{method} {path}")
            checked += 1
        self.assertGreaterEqual(checked, 35)

    def test_ensure_public_demo_creates_nothing(self):
        from app import auth, demo
        from app.db import get_db
        before = self.table_counts()
        self.assertEqual(demo.ensure_public_demo(), {"enabled": False})
        self.assertEqual(self.table_counts(), before)
        self.assertEqual(before["projects"], 0)
        self.assertEqual([u["email"] for u in auth.list_users()], [OWNER_EMAIL])
        self.assertEqual(get_db().get_setting(auth.PUBLIC_PROJECT_KEY, ""), "")

    def test_switching_the_flag_off_revokes_guest_access(self):
        # A demo project created while the view was on is not readable once off.
        from app import auth, demo
        from app.config import reset_config_for_tests
        reset_config_for_tests(dataclasses.replace(self.cfg, public_view=True))
        pid = demo.ensure_public_demo()["project_id"]
        self.assertEqual(self.get(f"/api/projects/{pid}")[0], 200)
        reset_config_for_tests(dataclasses.replace(self.cfg, public_view=False))
        self.assertEqual(auth.public_project_id(), "")
        self.assertEqual(auth.guest_principal().project_role(pid), "none")
        self.assertEqual(self.get(f"/api/projects/{pid}")[0], 401)
        self.assertEqual(self.get("/api/projects")[0], 401)
        self.assertEqual(self.get("/api/me")[0], 401)


# ---------------------------------------------------------------------------
# What a guest can read
# ---------------------------------------------------------------------------
class TestGuestReads(PublicViewCase):
    def setUp(self):
        super().setUp()
        self.seed_demo()

    def test_config_reports_public_view_on(self):
        status, body = self.get("/api/config")
        self.assertEqual(status, 200)
        self.assertIs(body["public_view"], True)

    def test_me_returns_the_guest_shape(self):
        status, body = self.get("/api/me")
        self.assertEqual(status, 200)
        self.assertEqual(body, {"user": {"id": "guest", "email": "guest",
                                         "global_role": "guest", "guest": True}})

    def test_projects_lists_only_the_demo_project(self):
        from app import demo
        private = self.seed_private_project()
        status, body = self.get("/api/projects")
        self.assertEqual(status, 200)
        self.assertEqual([p["id"] for p in body["projects"]], [self.demo["pid"]])
        self.assertEqual(body["projects"][0]["name"], demo.DEMO_PROJECT_NAME)
        self.assertEqual(body["projects"][0]["name"], "عرض توضيحي — Public demo")
        self.assertNotIn(private["name"], json.dumps(body, ensure_ascii=False))

    def test_guest_reads_the_demo_project_its_findings_and_report(self):
        d = self.demo
        status, body = self.get(f"/api/projects/{d['pid']}")
        self.assertEqual(status, 200)
        self.assertEqual(body["project"]["id"], d["pid"])
        self.assertEqual(body["metrics"]["findings_total"], 1)

        status, body = self.get(f"/api/projects/{d['pid']}/assets")
        self.assertEqual((status, [a["id"] for a in body["assets"]]), (200, [d["aid"]]))

        status, body = self.get(f"/api/projects/{d['pid']}/scopes")
        self.assertEqual((status, [s["id"] for s in body["scopes"]]), (200, [d["sid"]]))

        status, body = self.get(f"/api/projects/{d['pid']}/jobs")
        self.assertEqual(status, 200)
        self.assertEqual(len(body["jobs"]), 3)
        self.assertTrue(all(j["project_id"] == d["pid"] for j in body["jobs"]))

        status, body = self.get(f"/api/jobs/{d['jid']}")
        self.assertEqual((status, body["job"]["id"]), (200, d["jid"]))

        status, body = self.get(f"/api/projects/{d['pid']}/findings")
        self.assertEqual((status, [f["id"] for f in body["findings"]]), (200, [d["fid"]]))

        status, body = self.get(f"/api/findings/{d['fid']}")
        self.assertEqual((status, body["finding"]["severity"]), (200, "high"))

        status, body = self.get(f"/api/projects/{d['pid']}/report")
        self.assertEqual(status, 200)
        self.assertEqual(body["project"]["id"], d["pid"])
        self.assertEqual([f["id"] for f in body["findings"]], [d["fid"]])

        status, body = self.get(f"/api/projects/{d['pid']}/report?format=sarif")
        self.assertEqual((status, body["version"]), (200, "2.1.0"))
        status, text = self.get(f"/api/projects/{d['pid']}/report?format=md&lang=en")
        self.assertEqual(status, 200)
        self.assertIn("Demo finding on the bundled sample", text)
        status, text = self.get(f"/api/projects/{d['pid']}/report?format=html&lang=ar")
        self.assertEqual(status, 200)
        self.assertIn("<html", text.lower())

        status, body = self.get(f"/api/metrics?project={d['pid']}")
        self.assertEqual((status, body["findings_total"]), (200, 1))

    def test_guest_reads_the_reference_catalogs(self):
        status, body = self.get("/api/catalog")
        self.assertEqual(status, 200)
        self.assertIn("tools", body)
        status, body = self.get("/api/tools")
        self.assertEqual(status, 200)
        self.assertIn("tools", body)
        status, body = self.get("/api/ai/status")
        self.assertEqual(status, 200)
        self.assertIs(body["available"], False)
        # Connectors come from the stored tool registry: empty until the
        # startup sync has filled it.
        self.assertEqual(self.get("/api/connectors"), (200, {"connectors": []}))
        from app.connectors import sync_registry
        sync_registry()
        status, body = self.get("/api/connectors")
        self.assertEqual(status, 200)
        self.assertIn("bandit", [c["name"] for c in body["connectors"]])

    def test_head_is_served_like_get(self):
        self.assertEqual(self.http("HEAD", "/api/projects")[0], 200)
        self.assertEqual(self.http("HEAD", "/api/users")[0], 401)


class TestGuestBeforeDemoExists(PublicViewCase):
    def test_projects_is_an_empty_list_until_the_demo_exists(self):
        self.assertEqual(self.get("/api/projects"), (200, {"projects": []}))

    def test_a_real_project_is_not_listed_or_readable_meanwhile(self):
        private = self.seed_private_project()
        self.assertEqual(self.get("/api/projects"), (200, {"projects": []}))
        self.assertEqual(self.get(f"/api/projects/{private['pid']}")[0], 403)


# ---------------------------------------------------------------------------
# Confinement to the demo project
# ---------------------------------------------------------------------------
class TestGuestIsolation(PublicViewCase):
    def setUp(self):
        super().setUp()
        self.seed_demo()
        self.private = self.seed_private_project()

    def test_guest_cannot_read_another_project(self):
        p = self.private
        paths = [
            f"/api/projects/{p['pid']}",
            f"/api/projects/{p['pid']}/assets",
            f"/api/projects/{p['pid']}/scopes",
            f"/api/projects/{p['pid']}/jobs",
            f"/api/projects/{p['pid']}/findings",
            f"/api/projects/{p['pid']}/report",
            f"/api/projects/{p['pid']}/report?format=html",
            f"/api/projects/{p['pid']}/report?format=md",
            f"/api/projects/{p['pid']}/report?format=sarif",
            f"/api/jobs/{p['jid']}",
            f"/api/findings/{p['fid']}",
            f"/api/metrics?project={p['pid']}",
            # A second value must not be able to borrow the public project's access.
            f"/api/metrics?project={p['pid']}&project={self.demo['pid']}",
        ]
        for path in paths:
            status, body = self.get(path)
            self.assertIn(status, (403, 404), path)
            text = json.dumps(body, ensure_ascii=False)
            self.assertNotIn(p["name"], text, path)
            self.assertNotIn("PRIVATE-FINDING-TITLE", text, path)
            self.assertNotIn("PRIVATE-PROOF", text, path)

    def test_guest_cannot_list_another_project(self):
        status, body = self.get("/api/projects")
        self.assertEqual(status, 200)
        self.assertEqual([p["id"] for p in body["projects"]], [self.demo["pid"]])

    def test_unknown_ids_are_refused_not_served(self):
        for path in ("/api/projects/prj_does_not_exist", "/api/projects/prj_does_not_exist/findings",
                     "/api/jobs/job_does_not_exist", "/api/findings/fnd_does_not_exist",
                     "/api/metrics?project=prj_does_not_exist"):
            self.assertIn(self.get(path)[0], (403, 404), path)

    def test_demo_data_never_contains_the_other_projects_rows(self):
        d, p = self.demo, self.private
        for path in (f"/api/projects/{d['pid']}/findings", f"/api/projects/{d['pid']}/jobs",
                     f"/api/projects/{d['pid']}/assets", f"/api/projects/{d['pid']}/scopes",
                     f"/api/projects/{d['pid']}/report"):
            status, body = self.get(path)
            self.assertEqual(status, 200, path)
            text = json.dumps(body, ensure_ascii=False)
            for private_id in (p["pid"], p["aid"], p["sid"], p["jid"], p["fid"]):
                self.assertNotIn(private_id, text, path)

    def test_a_stored_id_pointing_at_a_real_project_is_never_exposed(self):
        # Even if the setting were wrong, only a project owned by the reserved
        # system account can be public.
        from app import auth, demo
        from app.db import get_db
        p = self.private
        get_db().set_setting(auth.PUBLIC_PROJECT_KEY, p["pid"])
        self.assertEqual(auth.public_project_id(), "")
        self.assertEqual(self.get("/api/projects"), (200, {"projects": []}))
        self.assertEqual(self.get(f"/api/projects/{p['pid']}")[0], 403)
        self.assertEqual(self.get(f"/api/projects/{p['pid']}/findings")[0], 403)
        # The next ensure points the setting back at the system-owned demo.
        self.assertEqual(demo.ensure_public_demo()["project_id"], self.demo["pid"])
        self.assertEqual(auth.public_project_id(), self.demo["pid"])


# ---------------------------------------------------------------------------
# Read-only: no action without a sign-in
# ---------------------------------------------------------------------------
class TestGuestCannotAct(PublicViewCase):
    def setUp(self):
        super().setUp()
        self.seed_demo()

    def test_every_post_route_is_refused(self):
        from app import policy, server, store
        from app import findings as F
        from app import queue
        d = self.demo
        ids = {"pid": d["pid"], "jid": d["jid"], "fid": d["fid"], "sid": d["sid"]}
        # A body that would make each handler succeed if it were ever reached.
        body = {"name": "guest-made", "email": "guest-made@test.local",
                "password": "long-enough-password-1", "global_role": "owner",
                "user_id": self.owner_id(), "role": "admin", "kind": "source",
                "identifier": str(SAMPLE), "asset_id": d["aid"], "scope_id": d["sid"],
                "proof": "guest", "connector": "bandit", "scan_types": ["bandit"],
                "status": "false_positive", "verification": "confirmed", "engaged": True}
        before = self.table_counts()
        posts = [(rx, auth_required, min_global)
                 for method, rx, _fn, auth_required, min_global, _g in server._ROUTES
                 if method == "POST"]
        self.assertGreaterEqual(len(posts), 18)
        for rx, _auth_required, _min_global in posts:
            path = path_for(rx.pattern, ids)
            status, out = self.http("POST", path, body=body)
            self.assertEqual(status, 401, f"POST {path}")
            self.assertEqual(out["error"]["code"], "unauthenticated", path)
        # Nothing changed.
        self.assertEqual(self.table_counts(), before)
        self.assertFalse(policy.global_stop_engaged())
        self.assertEqual(store.get_scope(d["sid"])["status"], "active")
        self.assertEqual(F.get_finding(d["fid"])["status"], "open")
        self.assertEqual(F.get_finding(d["fid"])["verification_status"], "needs_verification")
        self.assertEqual(queue.get_job(d["jid"])["stop_requested"], 0)

    def test_sign_in_only_reads_are_refused(self):
        d = self.demo
        for path in ("/api/users", "/api/audit", f"/api/audit?project={d['pid']}",
                     "/api/admin/stop", f"/api/evidence/{d['eid']}", "/api/ai/evalset"):
            status, body = self.get(path)
            self.assertEqual(status, 401, path)
            self.assertNotIn("demo evidence body", json.dumps(body), path)
        # Platform-wide metrics need a global role; a guest has none.
        for path in ("/api/metrics", "/api/metrics?project=", "/api/metrics?other=1"):
            status, body = self.get(path)
            self.assertEqual(status, 403, path)
            self.assertNotIn("jobs_total", body)

    def test_every_get_route_off_the_allowlist_is_401(self):
        from app import server
        d = self.demo
        ids = {"pid": d["pid"], "jid": d["jid"], "fid": d["fid"], "sid": d["sid"], "eid": d["eid"]}
        seen = 0
        for method, rx, _fn, auth_required, min_global, guest_ok in server._ROUTES:
            if method != "GET" or guest_ok or not (auth_required or min_global):
                continue
            path = path_for(rx.pattern, ids)
            self.assertEqual(self.get(path)[0], 401, path)
            seen += 1
        self.assertGreaterEqual(seen, 5)

    def test_the_allowlist_is_exactly_the_documented_one(self):
        from app import server
        marked = set()
        for method, rx, _fn, auth_required, min_global, guest_ok in server._ROUTES:
            if guest_ok:
                self.assertEqual(method, "GET", rx.pattern)
                self.assertTrue(auth_required)
                self.assertIsNone(min_global)
                marked.add(rx.pattern[1:-1])
        self.assertEqual(marked, GUEST_ALLOWLIST)

    def test_a_write_or_privileged_route_cannot_be_put_on_the_allowlist(self):
        from app import server
        n = len(server._ROUTES)
        with self.assertRaises(ValueError):
            server.route("POST", r"/api/x-test", guest_ok=True)
        with self.assertRaises(ValueError):
            server.route("GET", r"/api/x-test", min_global="admin", guest_ok=True)
        with self.assertRaises(ValueError):
            server.route("GET", r"/api/x-test", auth_required=False, guest_ok=True)
        self.assertEqual(len(server._ROUTES), n)

    def test_other_http_methods_do_nothing(self):
        from app import store
        d = self.demo
        for method in ("PUT", "PATCH", "DELETE"):
            status, _ = self.http(method, f"/api/projects/{d['pid']}", body={"name": "x"})
            self.assertGreaterEqual(status, 400, method)
        self.assertEqual(store.get_project(d["pid"])["name"], "عرض توضيحي — Public demo")


# ---------------------------------------------------------------------------
# Credentials are still checked when the public view is on
# ---------------------------------------------------------------------------
class TestCredentialsStillChecked(PublicViewCase):
    def setUp(self):
        super().setUp()
        self.seed_demo()

    def test_an_invalid_token_is_401_even_on_allowlisted_routes(self):
        d = self.demo
        for path in ("/api/projects", "/api/me", f"/api/projects/{d['pid']}",
                     f"/api/projects/{d['pid']}/findings", "/api/catalog"):
            status, body = self.get(path, token="not-a-real-session-token")
            self.assertEqual(status, 401, path)
            self.assertEqual(body["error"]["code"], "unauthenticated")

    def test_an_expired_token_is_401(self):
        from app.db import get_db
        token = self.owner_token()
        self.assertEqual(self.get("/api/projects", token=token)[0], 200)
        get_db().execute("UPDATE sessions SET expires_at='2000-01-01T00:00:00+00:00'")
        self.assertEqual(self.get("/api/projects", token=token)[0], 401)
        self.assertEqual(self.get("/api/me", token=token)[0], 401)

    def test_a_signed_out_token_is_401(self):
        token = self.owner_token()
        self.assertEqual(self.http("POST", "/api/auth/logout", token=token, body={})[0], 200)
        self.assertEqual(self.get("/api/projects", token=token)[0], 401)

    def test_any_other_authorization_header_is_401_not_guest(self):
        for value in ("Bearer ", "Bearer", "Basic Z3Vlc3Q6Z3Vlc3Q=", "guest", "Token abc"):
            status, _ = self.get("/api/projects", headers={"Authorization": value})
            self.assertEqual(status, 401, repr(value))

    def test_a_signed_in_owner_is_not_treated_as_a_guest(self):
        private = self.seed_private_project()
        token = self.owner_token()
        status, body = self.get("/api/me", token=token)
        self.assertEqual(status, 200)
        self.assertEqual(body["user"]["global_role"], "owner")
        self.assertNotIn("guest", body["user"])
        status, body = self.get("/api/projects", token=token)
        self.assertEqual({p["id"] for p in body["projects"]}, {self.demo["pid"], private["pid"]})
        self.assertEqual(self.get("/api/metrics", token=token)[0], 200)
        self.assertEqual(self.get("/api/users", token=token)[0], 200)

    def test_a_signed_in_non_member_reads_the_demo_but_nothing_else(self):
        # Signing in never shows less than an anonymous visitor gets: the demo
        # project stays readable. Everything beyond reading it is still decided
        # by membership (see test_public_view_hardening.TestSignedInUsersSeeTheDemo).
        from app import auth
        private = self.seed_private_project()
        auth.create_user("reader@test.local", "reader-password-1", global_role="reader")
        token = auth.login("reader@test.local", "reader-password-1")["token"]
        status, body = self.get("/api/projects", token=token)
        self.assertEqual((status, [p["id"] for p in body["projects"]]), (200, [self.demo["pid"]]))
        self.assertEqual(self.get(f"/api/projects/{self.demo['pid']}", token=token)[0], 200)
        self.assertEqual(self.get(f"/api/projects/{private['pid']}", token=token)[0], 403)
        self.assertEqual(self.http("POST", f"/api/projects/{self.demo['pid']}/scans", token=token,
                                   body={"asset_id": self.demo["aid"],
                                         "scope_id": self.demo["sid"],
                                         "connector": "bandit"})[0], 403)


# ---------------------------------------------------------------------------
# The guest principal itself
# ---------------------------------------------------------------------------
class TestGuestPrincipal(PublicViewCase):
    def test_guest_ranks_below_reader_and_fails_every_global_check(self):
        from app import auth
        from app.errors import ForbiddenError, ValidationError
        g = auth.guest_principal()
        self.assertEqual((g.user_id, g.email, g.global_role, g.guest),
                         ("guest", "guest", "guest", True))
        self.assertNotIn("guest", auth.ROLE_RANK)
        self.assertLess(auth.rank(g.global_role), auth.rank("reader"))
        for role in ("reader", "analyst", "admin", "owner", "guest", "none", ""):
            with self.assertRaises(ForbiddenError):
                g.require_global(role)
        # Nobody can be given the guest role as an account.
        with self.assertRaises(ValidationError):
            auth.create_user("g@test.local", "long-password-123", global_role="guest")

    def test_guest_is_a_reader_of_the_demo_project_only(self):
        from app import auth
        from app.errors import ForbiddenError
        demo_ids = self.seed_demo()
        private = self.seed_private_project()
        g = auth.guest_principal()
        self.assertEqual(g.project_role(demo_ids["pid"]), "reader")
        self.assertEqual(g.project_role(private["pid"]), "none")
        self.assertEqual(g.project_role("prj_missing"), "none")
        self.assertEqual(g.project_role(""), "none")
        g.require_project(demo_ids["pid"], "reader")
        for role in ("analyst", "admin", "owner", "none", "bogus", ""):
            with self.assertRaises(ForbiddenError):
                g.require_project(demo_ids["pid"], role)
        for role in ("reader", "none", ""):
            with self.assertRaises(ForbiddenError):
                g.require_project(private["pid"], role)

    def test_ordinary_principals_are_not_guests(self):
        from app import auth
        self.assertFalse(auth.principal_from_token(self.owner_token()).guest)


# ---------------------------------------------------------------------------
# Abuse limit
# ---------------------------------------------------------------------------
class TestGuestRateLimit(PublicViewCase):
    def test_per_client_window(self):
        from app import server
        from app.errors import RateLimitError
        self.assertEqual(server.GUEST_LIMIT_PER_MINUTE, 90)
        now = 1_000_000.0
        for _ in range(server.GUEST_LIMIT_PER_MINUTE):
            server.guest_rate_check("1.2.3.4", now)
        with self.assertRaises(RateLimitError):
            server.guest_rate_check("1.2.3.4", now + 1)
        server.guest_rate_check("5.6.7.8", now + 1)            # another client is unaffected
        server.guest_rate_check("1.2.3.4", now + server.GUEST_WINDOW_SECONDS)   # window rolls

    def test_client_table_is_bounded(self):
        from app import server
        now = 2_000_000.0
        with mock.patch.object(server, "GUEST_MAX_CLIENTS", 3):
            for i in range(3):
                server.guest_rate_check(f"10.0.0.{i}", now + i)
            self.assertEqual(len(server._GUEST_HITS), 3)
            # A full table never refuses a new client (see
            # test_public_view_hardening.TestGuestRateLimitTable); it stays bounded.
            for i in range(50):
                server.guest_rate_check(f"10.0.1.{i}", now + 3)
                self.assertLessEqual(len(server._GUEST_HITS), 3)
            server.guest_rate_check("10.0.0.99", now + 2 * server.GUEST_WINDOW_SECONDS)
            self.assertLessEqual(len(server._GUEST_HITS), 3)

    def test_http_429_for_guests_only(self):
        from app import server
        self.seed_demo()
        token = self.owner_token()
        with mock.patch.object(server, "GUEST_LIMIT_PER_MINUTE", 5):
            for _ in range(5):
                self.assertEqual(self.get("/api/projects")[0], 200)
            status, body = self.get("/api/projects")
            self.assertEqual(status, 429)
            self.assertEqual(body["error"]["code"], "rate_limited")
            self.assertEqual(self.get("/api/me")[0], 429)       # shared across guest routes
            # Signed-in traffic and public endpoints are not guest traffic.
            self.assertEqual(self.get("/api/projects", token=token)[0], 200)
            self.assertEqual(self.get("/api/health")[0], 200)
            self.assertEqual(self.get("/api/config")[0], 200)
            # No proxy is declared, so the connecting address is the client and
            # a forwarding header does not buy a fresh allowance.
            fwd = {"X-Forwarded-For": "203.0.113.7, 198.51.100.9"}
            self.assertEqual(self.get("/api/projects", headers=fwd)[0], 429)
            self.assertEqual(sorted(server._GUEST_HITS), ["127.0.0.1"])


class TestGuestRateLimitBehindAProxy(PublicViewCase):
    """The guest limit uses the same client key as the sign-in throttle."""
    ENV = {"FSL_CLIENT_IP_HEADER": "CF-Connecting-IP"}

    def test_guests_are_counted_by_the_address_the_proxy_reports(self):
        from app import server
        self.seed_demo()
        with mock.patch.object(server, "GUEST_LIMIT_PER_MINUTE", 3):
            first = {"CF-Connecting-IP": "203.0.113.7", "X-Forwarded-For": "198.51.100.200"}
            for _ in range(3):
                self.assertEqual(self.get("/api/projects", headers=first)[0], 200)
            self.assertEqual(self.get("/api/projects", headers=first)[0], 429)
            # Another visitor behind the same proxy is not affected.
            other = {"CF-Connecting-IP": "203.0.113.8"}
            self.assertEqual(self.get("/api/projects", headers=other)[0], 200)
            # Every address of one IPv6 /64 is one client.
            for host in ("1", "2", "3"):
                v6 = {"CF-Connecting-IP": f"2001:db8:5:6::{host}"}
                self.assertEqual(self.get("/api/projects", headers=v6)[0], 200)
            self.assertEqual(
                self.get("/api/projects", headers={"CF-Connecting-IP": "2001:db8:5:6::4"})[0], 429)
            self.assertEqual(sorted(server._GUEST_HITS),
                             ["2001:db8:5:6::/64", "203.0.113.7", "203.0.113.8"])


# ---------------------------------------------------------------------------
# Demo seeding (app/demo.py)
# ---------------------------------------------------------------------------
class TestDemoSeeding(PublicViewCase):
    def test_creates_the_demo_project_from_the_bundled_sample(self):
        from app import auth, demo, policy, queue, store
        from app.connectors import get_connector
        from app.db import get_db
        self.assertEqual(demo.SAMPLE_DIR, SAMPLE)
        out = demo.ensure_public_demo()
        self.assertTrue(out["enabled"] and out["created"])
        self.assertEqual(out["connectors"], ["bandit", "gitleaks", "pip_audit"])
        self.assertEqual(get_db().get_setting("public_project_id"), out["project_id"])
        self.assertEqual(auth.public_project_id(), out["project_id"])

        project = store.get_project(out["project_id"])
        self.assertEqual(project["name"], "عرض توضيحي — Public demo")
        system = get_db().query_one("SELECT * FROM users WHERE id=?", (project["owner_id"],))
        self.assertEqual((system["email"], system["active"]), (auth.SYSTEM_DEMO_EMAIL, 0))

        assets = store.list_assets(project["id"])
        self.assertEqual(len(assets), 1)
        self.assertEqual((assets[0]["kind"], assets[0]["identifier"]), ("source", str(SAMPLE)))
        self.assertEqual(assets[0]["metadata"]["local_path"], str(SAMPLE))

        scopes = store.list_scopes(project["id"])
        self.assertEqual(len(scopes), 1)
        scope = scopes[0]
        self.assertEqual(scope["proof"], "LAB-SELF-OWNED bundled sample")
        self.assertEqual(scope["environment"], "lab")
        self.assertEqual(scope["status"], "active")
        self.assertEqual(scope["allowed_targets"], [str(SAMPLE)])
        self.assertEqual(scope["scan_types"], ["bandit", "gitleaks", "pip_audit"])

        jobs = queue.list_jobs(project["id"])
        self.assertEqual(sorted(j["connector"] for j in jobs), ["bandit", "gitleaks", "pip_audit"])
        self.assertEqual(sorted(out["enqueued"]), sorted(j["id"] for j in jobs))
        for job in jobs:
            self.assertEqual(job["state"], "queued")
            self.assertEqual(job["scope_id"], scope["id"])
            self.assertEqual(job["asset_id"], assets[0]["id"])
            self.assertTrue(job["idempotency_key"].startswith("public-demo:"))
            # Each demo job is one the policy engine authorizes on its own.
            d = policy.evaluate_job(principal=None, project=project, asset=assets[0],
                                    scope=scope, connector=get_connector(job["connector"]),
                                    params=job["params"])
            self.assertTrue(d.allow, d.reason)

    def test_is_idempotent(self):
        from app import demo
        first = demo.ensure_public_demo()
        counts = self.table_counts()
        self.assertEqual((counts["projects"], counts["assets"], counts["scopes"], counts["jobs"]),
                         (1, 1, 1, 3))
        for _ in range(3):
            again = demo.ensure_public_demo()
            self.assertFalse(again["created"])
            self.assertEqual(again["enqueued"], [])
            for key in ("project_id", "asset_id", "scope_id", "connectors"):
                self.assertEqual(again[key], first[key])
        self.assertEqual(self.table_counts(), counts)

    def test_is_idempotent_across_a_restart_on_the_same_database(self):
        from app import demo
        first = demo.ensure_public_demo()
        counts = self.table_counts()
        reload_platform()                       # new config + new database handle, same file
        again = demo.ensure_public_demo()
        self.assertEqual(again["project_id"], first["project_id"])
        self.assertEqual(again["scope_id"], first["scope_id"])
        self.assertEqual(again["enqueued"], [])
        self.assertEqual(self.table_counts(), counts)

    def test_concurrent_calls_create_one_project(self):
        from app import demo
        results, errors = [], []

        def run():
            try:
                results.append(demo.ensure_public_demo()["project_id"])
            except Exception as e:      # pragma: no cover - failure path
                errors.append(e)

        threads = [threading.Thread(target=run) for _ in range(6)]
        for t in threads:
            t.start()
        for t in threads:
            t.join(60)
        self.assertEqual(errors, [])
        self.assertEqual(len(set(results)), 1)
        counts = self.table_counts()
        self.assertEqual((counts["projects"], counts["assets"], counts["scopes"], counts["jobs"]),
                         (1, 1, 1, 3))

    def test_only_ready_connectors_are_enqueued_and_the_rest_follow_later(self):
        from app import demo, queue
        from app.connectors.base import Connector

        def only_bandit(conn):
            ok = conn.name == "bandit"
            return {"installed": ok, "available": ok, "version": "t", "detail": "t"}

        with mock.patch.object(Connector, "readiness", only_bandit):
            out = demo.ensure_public_demo()
        self.assertEqual([j["connector"] for j in queue.list_jobs(out["project_id"])], ["bandit"])
        self.assertEqual(out["skipped"], {"gitleaks": "not_ready", "pip_audit": "not_ready"})
        # The scope still authorizes all demo connectors; once ready they are added once.
        later = demo.ensure_public_demo()
        self.assertEqual(later["skipped"], {"bandit": "already_enqueued"})
        self.assertEqual(sorted(j["connector"] for j in queue.list_jobs(out["project_id"])),
                         ["bandit", "gitleaks", "pip_audit"])

    def test_the_system_user_cannot_sign_in(self):
        from app import auth, demo, util
        from app.db import get_db
        from app.errors import AuthError, ValidationError
        out = demo.ensure_public_demo()
        self.assertNotIn("password", json.dumps(out).lower())
        db = get_db()
        row = db.query_one("SELECT * FROM users WHERE email=?", (auth.SYSTEM_DEMO_EMAIL,))
        self.assertEqual(row["active"], 0)
        self.assertTrue(row["password_hash"].startswith("pbkdf2_sha256$"))
        for guess in ("", "guest", "password", OWNER_PASSWORD, auth.SYSTEM_DEMO_EMAIL):
            with self.assertRaises(AuthError):
                auth.login(auth.SYSTEM_DEMO_EMAIL, guess)
            status, _ = self.http("POST", "/api/auth/login",
                                  body={"email": auth.SYSTEM_DEMO_EMAIL, "password": guess})
            self.assertIn(status, (401, 429))
        # Even a known password and a forged session row do not make it usable.
        db.execute("UPDATE users SET password_hash=? WHERE id=?",
                   (util.hash_password("known-password-123"), row["id"]))
        with self.assertRaises(AuthError):
            auth.login(auth.SYSTEM_DEMO_EMAIL, "known-password-123")
        db.execute("INSERT INTO sessions(token_hash,user_id,created_at,expires_at) VALUES(?,?,?,?)",
                   (util.sha256_text("forged"), row["id"], util.now_iso(),
                    "2999-01-01T00:00:00+00:00"))
        with self.assertRaises(AuthError):
            auth.principal_from_token("forged")
        self.assertEqual(self.get("/api/projects", token="forged")[0], 401)
        # The address is reserved: nobody can register it as a normal account.
        with self.assertRaises(ValidationError):
            auth.create_user(auth.SYSTEM_DEMO_EMAIL, "long-password-123")

    def test_an_active_system_account_fails_closed(self):
        # If the reserved account were ever made loginable (only possible by
        # editing the database), the project it owns stops being public and the
        # demo refuses to reuse it. No account is modified.
        from app import auth, demo, server
        from app.db import get_db
        from app.errors import ConflictError
        pid = demo.ensure_public_demo()["project_id"]
        self.assertEqual(self.get(f"/api/projects/{pid}")[0], 200)
        get_db().execute("UPDATE users SET active=1 WHERE email=?", (auth.SYSTEM_DEMO_EMAIL,))
        self.assertEqual(auth.public_project_id(), "")
        self.assertEqual(self.get("/api/projects"), (200, {"projects": []}))
        self.assertEqual(self.get(f"/api/projects/{pid}")[0], 403)
        with self.assertRaises(ConflictError):
            demo.ensure_public_demo()
        with contextlib.redirect_stderr(io.StringIO()) as err:
            self.assertIsNone(server.seed_public_demo())
        self.assertIn("public demo setup failed", err.getvalue())
        self.assertEqual(get_db().query_one("SELECT active FROM users WHERE email=?",
                                            (auth.SYSTEM_DEMO_EMAIL,))["active"], 1)

    def test_the_reserved_address_is_not_a_usable_owner_email(self):
        from app import auth
        from app.bootstrap import SETUP_NOTICES
        boot(True, FSL_OWNER_EMAIL=auth.SYSTEM_DEMO_EMAIL)
        self.assertIn("owner_email_invalid", SETUP_NOTICES)
        self.assertEqual([u["email"] for u in auth.list_users()], [auth.DEFAULT_OWNER_EMAIL])

    def test_global_stop_blocks_demo_scans(self):
        from app import demo, policy, queue
        policy.set_global_stop(True)
        out = demo.ensure_public_demo()
        self.assertEqual(out["enqueued"], [])
        self.assertEqual(set(out["skipped"].values()), {"policy:global_stop"})
        self.assertEqual(queue.list_jobs(out["project_id"]), [])
        policy.set_global_stop(False)
        self.assertEqual(len(demo.ensure_public_demo()["enqueued"]), 3)

    def test_changed_connector_list_reissues_the_scope(self):
        from app import demo, store
        from app.config import reset_config_for_tests
        first = demo.ensure_public_demo()
        reset_config_for_tests(dataclasses.replace(self.cfg, demo_connectors=("bandit",)))
        second = demo.ensure_public_demo()
        self.assertEqual(second["project_id"], first["project_id"])
        self.assertEqual(second["asset_id"], first["asset_id"])
        self.assertNotEqual(second["scope_id"], first["scope_id"])
        self.assertEqual(store.get_scope(first["scope_id"])["status"], "revoked")
        active = [s for s in store.list_scopes(first["project_id"]) if s["status"] == "active"]
        self.assertEqual([s["scan_types"] for s in active], [["bandit"]])

    def test_a_scope_added_by_a_person_is_left_alone(self):
        from app import demo, store
        out = demo.ensure_public_demo()
        mine = store.create_scope(out["project_id"], out["asset_id"], proof="OWNER-ADDED",
                                  allowed_targets=[str(SAMPLE)], scan_types=["semgrep"],
                                  created_by=self.owner_id())
        demo.ensure_public_demo()
        self.assertEqual(store.get_scope(mine["id"])["status"], "active")
        self.assertEqual(store.get_scope(out["scope_id"])["status"], "active")

    def test_missing_sample_records_a_notice_and_does_nothing_else(self):
        from app import bootstrap, demo
        before = self.table_counts()
        with mock.patch.object(demo, "SAMPLE_DIR", ROOT / "samples" / "no-such-sample"):
            out = demo.ensure_public_demo()
            self.assertEqual(out["notice"], "demo_sample_missing")
            self.assertIsNone(out["project_id"])
            self.assertIn("demo_sample_missing", bootstrap.SETUP_NOTICES)
            self.assertEqual(bootstrap.SETUP_NOTICES.count("demo_sample_missing"), 1)
            demo.ensure_public_demo()
            self.assertEqual(bootstrap.SETUP_NOTICES.count("demo_sample_missing"), 1)
            self.assertEqual(self.table_counts(), before)
            status, body = self.get("/api/config")
            self.assertIn("demo_sample_missing", body["setup_notices"])
            self.assertEqual(self.get("/api/projects"), (200, {"projects": []}))
        self.assertNotEqual(bootstrap.describe_notice("demo_sample_missing"), "demo_sample_missing")
        # Once the sample is back the notice clears.
        demo.ensure_public_demo()
        self.assertNotIn("demo_sample_missing", bootstrap.SETUP_NOTICES)

    def test_startup_hook_never_raises(self):
        from app import demo, server
        with contextlib.redirect_stderr(io.StringIO()) as err:
            with mock.patch.object(demo, "ensure_public_demo", side_effect=RuntimeError("boom")):
                self.assertIsNone(server.seed_public_demo())
            self.assertIn("RuntimeError: boom", err.getvalue())
            out = server.seed_public_demo()
        self.assertTrue(out["enabled"])
        self.assertEqual(len(out["enqueued"]), 3)
        self.assertNotIn("password", err.getvalue().lower())

    def _run_main(self, wait_for_seed: float):
        """Run server.main() with the socket and the seeding replaced by probes.
        Returns the ordered events: 'bind', then (step, ran_off_main_thread) for
        the early pass of the seeding ('publish') and the full one ('seed'),
        then 'serve'."""
        from app import server
        events: list = []
        seeded = threading.Event()
        main_thread = threading.current_thread()

        class FakeServer:
            def serve_forever(self):
                seeded.wait(wait_for_seed)
                events.append("serve")

        def fake_build(*_a, **_k):
            events.append("bind")
            return FakeServer()

        def fake_seed(scans=True):
            events.append(("seed" if scans else "publish",
                           threading.current_thread() is not main_thread))
            if scans:
                seeded.set()

        with mock.patch.object(server, "build_server", fake_build), \
                mock.patch.object(server, "seed_public_demo", fake_seed), \
                mock.patch.object(server, "sync_registry", lambda: []), \
                mock.patch.dict(os.environ, {"FSL_NO_WORKER": "1"}), \
                contextlib.redirect_stderr(io.StringIO()):
            server.main()
        return events

    def test_main_seeds_in_the_background_after_the_socket_is_bound(self):
        events = self._run_main(wait_for_seed=20)
        self.assertEqual(events, ["bind", ("publish", True), ("seed", True), "serve"])

    def test_main_does_not_seed_when_the_public_view_is_off(self):
        from app.config import reset_config_for_tests
        reset_config_for_tests(dataclasses.replace(self.cfg, public_view=False))
        before = self.table_counts()
        self.assertEqual(self._run_main(wait_for_seed=0.5), ["bind", "serve"])
        self.assertEqual(self.table_counts(), before)


class TestDemoConnectorOverride(PublicViewCase):
    ENV = {"FSL_DEMO_CONNECTORS": " Bandit , http_headers,nope,ai_redteam,bandit "}

    def test_only_passive_source_connectors_are_accepted(self):
        from app import demo, queue, store
        self.assertEqual(self.cfg.demo_connectors, ("bandit", "http_headers", "nope", "ai_redteam"))
        out = demo.ensure_public_demo()
        self.assertEqual(out["connectors"], ["bandit"])
        self.assertEqual(store.get_scope(out["scope_id"])["scan_types"], ["bandit"])
        self.assertEqual([j["connector"] for j in queue.list_jobs(out["project_id"])], ["bandit"])
        self.assertEqual(out["skipped"]["http_headers"], "not_a_passive_source_connector")
        self.assertEqual(out["skipped"]["ai_redteam"], "not_a_passive_source_connector")
        self.assertEqual(out["skipped"]["nope"], "unknown_connector")


class TestConfigFlag(unittest.TestCase):
    def setUp(self):
        self.addCleanup(_clean_env)

    def test_flag_values(self):
        for value, expected in (("1", True), ("true", True), ("yes", True), ("on", True),
                                ("0", False), ("false", False), ("", False), ("maybe", False)):
            self.assertIs(boot(False, FSL_PUBLIC_VIEW=value).public_view, expected, repr(value))
        self.assertIs(boot(False).public_view, False)

    def test_blank_connector_override_keeps_the_default(self):
        self.assertEqual(boot(True, FSL_DEMO_CONNECTORS=" , ").demo_connectors,
                         ("bandit", "gitleaks", "pip_audit"))
        self.assertEqual(boot(True).demo_connectors, ("bandit", "gitleaks", "pip_audit"))


# ---------------------------------------------------------------------------
# Real tool, real worker, bundled sample (skipped when Bandit is not installed)
# ---------------------------------------------------------------------------
class TestDemoRealScan(PublicViewCase):
    ENV = {"FSL_DEMO_CONNECTORS": "bandit"}
    FAKE_TOOLS = False

    def test_a_guest_sees_real_findings_from_the_bundled_sample(self):
        if not shutil.which("bandit"):
            self.skipTest("bandit not installed")
        from app import demo, queue
        from app.worker import Worker
        out = demo.ensure_public_demo()
        self.assertEqual(len(out["enqueued"]), 1)
        worker = Worker(worker_id="test-public-demo")
        for _ in range(5):
            if not worker.run_once():
                break
        job = queue.get_job(out["enqueued"][0])
        self.assertEqual(job["state"], "succeeded", job.get("error"))
        status, body = self.get(f"/api/projects/{out['project_id']}/findings")
        self.assertEqual(status, 200)
        self.assertGreater(len(body["findings"]), 0)
        self.assertTrue(all(f["connector"] == "bandit" for f in body["findings"]))
        status, body = self.get(f"/api/projects/{out['project_id']}/report")
        self.assertEqual(status, 200)
        self.assertEqual(len(body["findings"]), body["metrics"]["findings_total"])
        # A second ensure after the scan finished does not scan again.
        self.assertEqual(demo.ensure_public_demo()["enqueued"], [])


if __name__ == "__main__":
    unittest.main(verbosity=2)
