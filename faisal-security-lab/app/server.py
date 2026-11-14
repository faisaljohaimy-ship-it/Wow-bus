"""Standalone HTTP API + static UI host (Python standard library only).

Run:  python3 -m app.server      (serves API + UI, starts an in-process worker)

Security posture:
  * Identity is verified server-side via signed session tokens; client-supplied
    identity headers are never trusted.
  * Every state-changing route re-derives the principal and checks RBAC +
    (for scans) the policy engine, so a direct API call cannot bypass the UI.
  * Response security headers, request-size caps, and a simple per-IP rate limit.
"""
from __future__ import annotations

import json
import re
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit, parse_qs

from . import audit, auth, evidence, findings as F, metrics, policy, queue, reports, store, util
from .ai import agents, evalset
from .bootstrap import init_platform
from .config import get_config
from .connectors import all_connectors, get_connector, sync_registry
from .errors import AppError, AuthError, ForbiddenError, ValidationError, NotFoundError

WEB_DIR = Path(__file__).resolve().parent.parent / "web"

_ROUTES: list = []
_RATE: dict = {}
_RATE_LOCK = threading.Lock()


def route(method: str, pattern: str, *, auth_required: bool = True, min_global: str | None = None):
    rx = re.compile("^" + pattern + "$")

    def deco(fn):
        _ROUTES.append((method, rx, fn, auth_required, min_global))
        return fn
    return deco


class Req:
    def __init__(self, principal, params, query, body, token=None):
        self.principal = principal
        self.params = params
        self.query = query
        self.body = body or {}
        self.token = token

    def q(self, key, default=None):
        v = self.query.get(key)
        return v[0] if isinstance(v, list) and v else default


# ===========================================================================
# Auth + identity
# ===========================================================================
@route("POST", r"/api/auth/login", auth_required=False)
def login(req: Req):
    out = auth.login(req.body.get("email", ""), req.body.get("password", ""))
    audit.record("auth.login", actor=out["user"]["email"], detail={"ok": True})
    return 200, out


@route("POST", r"/api/auth/logout")
def logout(req: Req):
    if req.token:
        auth.logout(req.token)   # invalidate the session server-side
    return 200, {"ok": True}


@route("GET", r"/api/me")
def me(req: Req):
    return 200, {"user": {"id": req.principal.user_id, "email": req.principal.email,
                          "global_role": req.principal.global_role}}


@route("GET", r"/api/health", auth_required=False)
def health(req: Req):
    return 200, {"ok": True, "platform": "faisal-security-lab", "time": util.now_iso()}


@route("GET", r"/api/config", auth_required=False)
def config_public(req: Req):
    cfg = get_config()
    return 200, {"environment": cfg.environment, "ai_available": cfg.ai.available,
                 "brand": "FAISAL.AI"}


# ===========================================================================
# Users (global admin)
# ===========================================================================
@route("GET", r"/api/users", min_global="admin")
def users_list(req: Req):
    return 200, {"users": auth.list_users()}


@route("POST", r"/api/users", min_global="admin")
def users_create(req: Req):
    u = auth.create_user(req.body.get("email", ""), req.body.get("password", ""),
                         display_name=req.body.get("display_name", ""),
                         global_role=req.body.get("global_role", "reader"))
    audit.record("user.create", actor=req.principal.email, actor_role=req.principal.global_role,
                 target=u["id"], detail={"role": u["global_role"]})
    return 201, {"user": u}


# ===========================================================================
# Projects / assets / scopes
# ===========================================================================
@route("GET", r"/api/projects")
def projects_list(req: Req):
    return 200, {"projects": store.list_projects_for(req.principal.user_id, req.principal.global_role)}


@route("POST", r"/api/projects")
def projects_create(req: Req):
    p = store.create_project(req.body.get("name", ""), req.principal.user_id)
    audit.record("project.create", actor=req.principal.email, project_id=p["id"],
                 detail={"name": p["name"]})
    return 201, {"project": p}


@route("GET", r"/api/projects/(?P<pid>[\w-]+)")
def project_get(req: Req):
    pid = req.params["pid"]
    req.principal.require_project(pid, "reader")
    return 200, {"project": store.get_project(pid),
                 "metrics": metrics.snapshot(pid)}


@route("POST", r"/api/projects/(?P<pid>[\w-]+)/members", min_global=None)
def project_add_member(req: Req):
    pid = req.params["pid"]
    req.principal.require_project(pid, "admin")
    store.add_member(pid, req.body["user_id"], req.body.get("role", "reader"))
    audit.record("project.add_member", actor=req.principal.email, project_id=pid,
                 detail={"user_id": req.body["user_id"], "role": req.body.get("role")})
    return 200, {"ok": True}


@route("GET", r"/api/projects/(?P<pid>[\w-]+)/assets")
def assets_list(req: Req):
    pid = req.params["pid"]
    req.principal.require_project(pid, "reader")
    return 200, {"assets": store.list_assets(pid)}


@route("POST", r"/api/projects/(?P<pid>[\w-]+)/assets")
def assets_create(req: Req):
    pid = req.params["pid"]
    req.principal.require_project(pid, "analyst")
    a = store.create_asset(pid, req.body.get("kind", ""), req.body.get("identifier", ""),
                           label=req.body.get("label", ""),
                           criticality=req.body.get("criticality", "medium"),
                           metadata=req.body.get("metadata", {}),
                           created_by=req.principal.user_id)
    audit.record("asset.create", actor=req.principal.email, project_id=pid, target=a["id"],
                 detail={"kind": a["kind"]})
    return 201, {"asset": a}


@route("GET", r"/api/projects/(?P<pid>[\w-]+)/scopes")
def scopes_list(req: Req):
    pid = req.params["pid"]
    req.principal.require_project(pid, "reader")
    return 200, {"scopes": store.list_scopes(pid, req.q("asset_id"))}


@route("POST", r"/api/projects/(?P<pid>[\w-]+)/scopes")
def scopes_create(req: Req):
    pid = req.params["pid"]
    req.principal.require_project(pid, "admin")  # only admins grant authorization
    b = req.body
    s = store.create_scope(pid, b["asset_id"], owner_contact=b.get("owner_contact", ""),
                           proof=b.get("proof", ""), environment=b.get("environment", "lab"),
                           allowed_targets=b.get("allowed_targets", []),
                           denied_targets=b.get("denied_targets", []),
                           allowed_ports=b.get("allowed_ports", []),
                           scan_types=b.get("scan_types", []),
                           valid_from=b.get("valid_from"), valid_until=b.get("valid_until"),
                           window=b.get("window", {}), rate_limits=b.get("rate_limits", {}),
                           created_by=req.principal.user_id)
    audit.record("scope.create", actor=req.principal.email, project_id=pid, target=s["id"],
                 detail={"environment": s["environment"], "scan_types": s["scan_types"],
                         "allowed_targets": s["allowed_targets"]})
    return 201, {"scope": s}


@route("POST", r"/api/scopes/(?P<sid>[\w-]+)/revoke")
def scope_revoke(req: Req):
    s = store.get_scope(req.params["sid"])
    req.principal.require_project(s["project_id"], "admin")
    out = store.revoke_scope(s["id"])
    audit.record("scope.revoke", actor=req.principal.email, project_id=s["project_id"],
                 target=s["id"])
    return 200, {"scope": out}


# ===========================================================================
# Catalog + tool registry + connectors
# ===========================================================================
@route("GET", r"/api/catalog")
def catalog(req: Req):
    return 200, {"categories": store.catalog_categories(),
                 "tools": store.list_catalog(req.q("category"))}


@route("GET", r"/api/tools")
def tools(req: Req):
    return 200, {"tools": store.list_tool_registry()}


@route("POST", r"/api/tools/sync", min_global="admin")
def tools_sync(req: Req):
    out = sync_registry()
    audit.record("tools.sync", actor=req.principal.email, detail={"count": len(out)})
    return 200, {"synced": out}


@route("GET", r"/api/connectors")
def connectors(req: Req):
    out = []
    for c in all_connectors():
        try:
            r = c.readiness()
        except Exception as e:
            r = {"available": False, "detail": str(e)}
        out.append({"name": c.name, "category": c.category, "source": c.source,
                    "license": c.license, "connector_type": c.connector_type,
                    "capabilities": c.capabilities(), "readiness": r})
    return 200, {"connectors": out}


# ===========================================================================
# Scans (jobs)
# ===========================================================================
@route("POST", r"/api/projects/(?P<pid>[\w-]+)/scans")
def scan_enqueue(req: Req):
    pid = req.params["pid"]
    req.principal.require_project(pid, "analyst")
    _rate_check(pid)
    b = req.body
    project = store.get_project(pid)
    asset = store.get_asset(b["asset_id"])
    scope = store.get_scope(b["scope_id"])
    conn = get_connector(b.get("connector", ""))
    if conn is None:
        raise ValidationError(f"unknown connector '{b.get('connector')}'")
    params = conn.validate_config(b.get("params", {}))
    # POLICY AT ENQUEUE — an out-of-scope request is rejected even here.
    decision = policy.evaluate_job(principal=req.principal, project=project, asset=asset,
                                   scope=scope, connector=conn, params=params)
    if not decision.allow:
        audit.record("scan.denied", actor=req.principal.email, project_id=pid,
                     target=b.get("connector"), outcome="denied",
                     detail={"reason": decision.reason, "code": decision.code})
        raise ForbiddenError(decision.reason, code="policy_denied",
                             detail={"policy_code": decision.code})
    job = queue.enqueue(project_id=pid, asset_id=asset["id"], scope_id=scope["id"],
                        connector=conn.name, params=params, created_by=req.principal.user_id,
                        priority=int(b.get("priority", 5)),
                        idempotency_key=b.get("idempotency_key"))
    audit.record("scan.enqueue", actor=req.principal.email, project_id=pid, target=job["id"],
                 detail={"connector": conn.name, "asset": asset["id"]})
    return 201, {"job": job}


@route("GET", r"/api/projects/(?P<pid>[\w-]+)/jobs")
def jobs_list(req: Req):
    pid = req.params["pid"]
    req.principal.require_project(pid, "reader")
    return 200, {"jobs": queue.list_jobs(pid, state=req.q("state"))}


@route("GET", r"/api/jobs/(?P<jid>[\w-]+)")
def job_get(req: Req):
    job = queue.get_job(req.params["jid"])
    req.principal.require_project(job["project_id"], "reader")
    return 200, {"job": job, "evidence": evidence.list_for_job(job["id"])}


@route("POST", r"/api/jobs/(?P<jid>[\w-]+)/stop")
def job_stop(req: Req):
    job = queue.get_job(req.params["jid"])
    req.principal.require_project(job["project_id"], "analyst")
    out = queue.request_stop(job["id"])
    audit.record("job.stop", actor=req.principal.email, project_id=job["project_id"], target=job["id"])
    return 200, {"job": out}


# ===========================================================================
# Findings
# ===========================================================================
@route("GET", r"/api/projects/(?P<pid>[\w-]+)/findings")
def findings_list(req: Req):
    pid = req.params["pid"]
    req.principal.require_project(pid, "reader")
    return 200, {"findings": F.list_findings(pid, severity=req.q("severity"),
                                             status=req.q("status"), connector=req.q("connector"))}


@route("GET", r"/api/findings/(?P<fid>[\w-]+)")
def finding_get(req: Req):
    f = F.get_finding(req.params["fid"])
    req.principal.require_project(f["project_id"], "reader")
    return 200, {"finding": f, "evidence": evidence.list_for_finding(f["id"])}


@route("POST", r"/api/findings/(?P<fid>[\w-]+)/status")
def finding_status(req: Req):
    f = F.get_finding(req.params["fid"])
    req.principal.require_project(f["project_id"], "analyst")
    out = F.set_status(f["id"], req.body.get("status", ""), actor=req.principal.email,
                       actor_role=req.principal.global_role, note=req.body.get("note", ""))
    return 200, {"finding": out}


@route("POST", r"/api/findings/(?P<fid>[\w-]+)/verification")
def finding_verify(req: Req):
    f = F.get_finding(req.params["fid"])
    req.principal.require_project(f["project_id"], "analyst")
    out = F.set_verification(f["id"], req.body.get("verification", ""), actor=req.principal.email,
                             evidence_note=req.body.get("note", ""))
    return 200, {"finding": out}


@route("POST", r"/api/findings/(?P<fid>[\w-]+)/triage")
def finding_triage(req: Req):
    f = F.get_finding(req.params["fid"])
    req.principal.require_project(f["project_id"], "analyst")
    return 200, {"triage": agents.triage(f)}


@route("POST", r"/api/findings/(?P<fid>[\w-]+)/remediation")
def finding_remediation(req: Req):
    f = F.get_finding(req.params["fid"])
    req.principal.require_project(f["project_id"], "analyst")
    return 200, {"remediation": agents.remediation(f)}


@route("POST", r"/api/findings/(?P<fid>[\w-]+)/validate")
def finding_validate(req: Req):
    f = F.get_finding(req.params["fid"])
    req.principal.require_project(f["project_id"], "analyst")
    # Deterministic signal: did the same dedup_key reappear in a newer job?
    reappeared = f["status"] == "reopened"
    return 200, {"validation": agents.validation(f, reappeared)}


# ===========================================================================
# Evidence
# ===========================================================================
@route("GET", r"/api/evidence/(?P<eid>[\w-]+)")
def evidence_read(req: Req):
    out = evidence.read_text(req.params["eid"])
    req.principal.require_project(out["meta"]["project_id"], "analyst")
    audit.record("evidence.read", actor=req.principal.email,
                 project_id=out["meta"]["project_id"], target=req.params["eid"])
    return 200, out


# ===========================================================================
# Reports
# ===========================================================================
@route("GET", r"/api/projects/(?P<pid>[\w-]+)/report")
def report(req: Req):
    pid = req.params["pid"]
    req.principal.require_project(pid, "reader")
    fmt = req.q("format", "json")
    lang = req.q("lang", "ar")
    if fmt == "sarif":
        return 200, ("application/json", reports.to_sarif(pid))
    if fmt == "md":
        return 200, ("text/markdown; charset=utf-8", reports.to_markdown(pid, lang))
    if fmt == "html":
        return 200, ("text/html; charset=utf-8", reports.to_html(pid, lang))
    return 200, json.loads(reports.to_json(pid))


# ===========================================================================
# AI
# ===========================================================================
@route("GET", r"/api/ai/status")
def ai_status(req: Req):
    cfg = get_config()
    return 200, {"available": cfg.ai.available, "provider": cfg.ai.provider,
                 "model": cfg.ai.model}


@route("GET", r"/api/ai/evalset")
def ai_evalset(req: Req):
    return 200, evalset.run()


@route("POST", r"/api/projects/(?P<pid>[\w-]+)/ai/plan")
def ai_plan(req: Req):
    pid = req.params["pid"]
    req.principal.require_project(pid, "analyst")
    assets = store.list_assets(pid)
    from .connectors import connector_names
    return 200, {"plan": agents.planner(assets, connector_names())}


@route("POST", r"/api/projects/(?P<pid>[\w-]+)/ai/report")
def ai_report(req: Req):
    pid = req.params["pid"]
    req.principal.require_project(pid, "reader")
    m = metrics.snapshot(pid)
    top = F.list_findings(pid, limit=15)
    return 200, {"report": agents.reporting(m, top)}


# ===========================================================================
# Audit + admin
# ===========================================================================
@route("GET", r"/api/audit")
def audit_list(req: Req):
    pid = req.q("project")
    if pid:
        req.principal.require_project(pid, "admin")
    else:
        req.principal.require_global("admin")
    return 200, {"audit": audit.query(pid, limit=int(req.q("limit", "200")))}


@route("GET", r"/api/admin/stop")
def admin_stop_get(req: Req):
    req.principal.require_global("admin")
    return 200, {"engaged": policy.global_stop_engaged()}


@route("POST", r"/api/admin/stop", min_global="admin")
def admin_stop_set(req: Req):
    engaged = bool(req.body.get("engaged", True))
    policy.set_global_stop(engaged)
    audit.record("admin.global_stop", actor=req.principal.email,
                 detail={"engaged": engaged}, outcome="ok")
    return 200, {"engaged": engaged}


@route("GET", r"/api/metrics")
def metrics_global(req: Req):
    pid = req.q("project")
    if pid:
        req.principal.require_project(pid, "reader")
    else:
        req.principal.require_global("reader")
    return 200, metrics.snapshot(pid)


# ===========================================================================
# HTTP handler
# ===========================================================================
def _rate_check(key: str, limit_per_min: int | None = None):
    limit = limit_per_min or get_config().limits.rate_limit_jobs_per_minute
    now = time.time()
    with _RATE_LOCK:
        bucket = _RATE.setdefault(key, [])
        bucket[:] = [t for t in bucket if now - t < 60]
        if len(bucket) >= limit:
            from .errors import RateLimitError
            raise RateLimitError("rate limit exceeded; slow down")
        bucket.append(now)


class Handler(BaseHTTPRequestHandler):
    server_version = "faisal-security-lab/2.0"
    protocol_version = "HTTP/1.1"

    def log_message(self, fmt, *args):  # quiet by default
        pass

    def _security_headers(self):
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("X-Frame-Options", "DENY")
        self.send_header("Referrer-Policy", "no-referrer")
        self.send_header("Content-Security-Policy",
                         "default-src 'self'; style-src 'self' 'unsafe-inline'; "
                         "script-src 'self'; connect-src 'self'; img-src 'self' data:; "
                         "base-uri 'none'; form-action 'self'; frame-ancestors 'none'")
        self.send_header("Cache-Control", "no-store")

    def _send_json(self, status, obj):
        if isinstance(obj, tuple):  # (content_type, raw_text)
            ctype, raw = obj
            data = raw.encode("utf-8")
        else:
            ctype = "application/json; charset=utf-8"
            data = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(data)))
        self._security_headers()
        self.end_headers()
        self.wfile.write(data)

    def _token(self):
        auth_h = self.headers.get("Authorization", "")
        if auth_h.startswith("Bearer "):
            return auth_h[7:].strip()
        return None

    def _read_body(self):
        length = int(self.headers.get("Content-Length", 0) or 0)
        if length <= 0:
            return {}
        if length > get_config().limits.max_request_bytes:
            raise ValidationError("request body too large")
        raw = self.rfile.read(length)
        if not raw:
            return {}
        try:
            return json.loads(raw.decode("utf-8"))
        except ValueError:
            raise ValidationError("invalid JSON body")

    def _dispatch(self, method):
        parsed = urlsplit(self.path)
        path = parsed.path
        query = parse_qs(parsed.query)

        # Static UI for non-/api GET.
        if method == "GET" and not path.startswith("/api/"):
            return self._serve_static(path)

        for m, rx, fn, auth_required, min_global in _ROUTES:
            if m != method:
                continue
            match = rx.match(path)
            if not match:
                continue
            try:
                body = self._read_body() if method in ("POST", "PUT", "PATCH") else {}
                principal = None
                tok = self._token()
                if auth_required or min_global:
                    principal = auth.principal_from_token(tok)
                    if min_global:
                        principal.require_global(min_global)
                req = Req(principal, match.groupdict(), query, body, token=tok)
                status, obj = fn(req)
                return self._send_json(status, obj)
            except AppError as e:
                return self._send_json(e.status, e.public())
            except Exception as e:  # unexpected
                return self._send_json(500, {"error": {"code": "internal", "message": str(e)[:200]}})
        return self._send_json(404, {"error": {"code": "not_found", "message": "no such route"}})

    def do_GET(self):
        self._dispatch("GET")

    def do_POST(self):
        self._dispatch("POST")

    def _serve_static(self, path):
        if path in ("/", ""):
            path = "/index.html"
        # Prevent traversal.
        rel = path.lstrip("/")
        target = (WEB_DIR / rel).resolve()
        if not str(target).startswith(str(WEB_DIR.resolve())) or not target.is_file():
            # SPA fallback to index.html
            target = WEB_DIR / "index.html"
            if not target.is_file():
                return self._send_json(404, {"error": {"code": "not_found", "message": "UI not built"}})
        ext = target.suffix.lower()
        ctype = {".html": "text/html; charset=utf-8", ".js": "application/javascript; charset=utf-8",
                 ".css": "text/css; charset=utf-8", ".json": "application/json",
                 ".svg": "image/svg+xml", ".png": "image/png", ".ico": "image/x-icon"}.get(ext, "text/plain")
        data = target.read_bytes()
        self.send_response(200)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(data)))
        self._security_headers()
        self.end_headers()
        self.wfile.write(data)


def build_server(host: str | None = None, port: int | None = None) -> ThreadingHTTPServer:
    cfg = get_config()
    srv = ThreadingHTTPServer((host or cfg.bind_host, port or cfg.bind_port), Handler)
    srv.daemon_threads = True
    return srv


def main():
    import os
    import sys
    cfg = get_config()
    info = init_platform()
    if info["owner_bootstrap"] and info["owner_bootstrap"].get("generated"):
        print(f"[init] owner created: {info['owner_bootstrap']['email']}", file=sys.stderr)
        print(f"[init] ONE-TIME owner password: {info['owner_bootstrap']['password']}", file=sys.stderr)
    print(f"[init] catalog={info['catalog_seeded']} connectors={len(info['connectors'])} "
          f"ai_available={info['ai_available']}", file=sys.stderr)

    # In-process worker(s) for standalone mode (disable with FSL_NO_WORKER=1 to
    # run workers as separate processes/containers).
    if os.environ.get("FSL_NO_WORKER", "") not in ("1", "true"):
        from .worker import Worker
        for i in range(max(1, cfg.limits.worker_concurrency)):
            w = Worker(worker_id=f"inproc-{i}")
            threading.Thread(target=w.run_forever, daemon=True).start()
        print(f"[init] started {cfg.limits.worker_concurrency} in-process worker(s)", file=sys.stderr)

    srv = build_server()
    print(f"[serve] http://{cfg.bind_host}:{cfg.bind_port}  (Ctrl-C to stop)", file=sys.stderr)
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        print("\n[serve] shutting down", file=sys.stderr)
        srv.shutdown()


if __name__ == "__main__":
    main()
