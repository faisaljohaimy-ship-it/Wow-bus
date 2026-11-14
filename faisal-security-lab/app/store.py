"""Data-access for projects, assets, authorization scopes, the raw tool catalog
and the connector tool-registry. Pure persistence; policy lives in policy.py."""
from __future__ import annotations

import json
from pathlib import Path

from . import util
from .db import get_db
from .errors import NotFoundError, ValidationError

ASSET_KINDS = {"repo", "web", "api", "container", "host", "source"}
ENVIRONMENTS = {"lab", "staging", "prod"}
CRITICALITY = {"low", "medium", "high", "critical"}


def _loads(s, default):
    try:
        return json.loads(s) if s else default
    except (ValueError, TypeError):
        return default


# ---------------------------------------------------------------------------
# Projects
# ---------------------------------------------------------------------------
def create_project(name: str, owner_id: str) -> dict:
    name = (name or "").strip()
    if not name:
        raise ValidationError("project name required")
    db = get_db()
    pid = util.new_id("prj")
    now = util.now_iso()
    with db.tx() as c:
        c.execute("INSERT INTO projects(id,name,owner_id,created_at) VALUES(?,?,?,?)",
                  (pid, name, owner_id, now))
        c.execute("INSERT INTO project_members(project_id,user_id,role,created_at) "
                  "VALUES(?,?,?,?)", (pid, owner_id, "admin", now))
    return get_project(pid)


def get_project(pid: str) -> dict:
    row = get_db().query_one("SELECT * FROM projects WHERE id=?", (pid,))
    if not row:
        raise NotFoundError("project not found")
    return row


def list_projects_for(user_id: str, global_role: str) -> list[dict]:
    db = get_db()
    if global_role in ("owner", "admin"):
        return db.query_all("SELECT * FROM projects ORDER BY created_at DESC")
    return db.query_all(
        "SELECT p.* FROM projects p JOIN project_members m ON m.project_id=p.id "
        "WHERE m.user_id=? ORDER BY p.created_at DESC", (user_id,))


def add_member(project_id: str, user_id: str, role: str) -> None:
    if role not in ("admin", "analyst", "reader"):
        raise ValidationError("invalid project role")
    get_db().execute(
        "INSERT INTO project_members(project_id,user_id,role,created_at) VALUES(?,?,?,?) "
        "ON CONFLICT(project_id,user_id) DO UPDATE SET role=excluded.role",
        (project_id, user_id, role, util.now_iso()))


# ---------------------------------------------------------------------------
# Assets
# ---------------------------------------------------------------------------
def create_asset(project_id: str, kind: str, identifier: str, *, label: str = "",
                 criticality: str = "medium", metadata: dict | None = None,
                 created_by: str = "") -> dict:
    if kind not in ASSET_KINDS:
        raise ValidationError(f"invalid asset kind; allowed: {sorted(ASSET_KINDS)}")
    identifier = (identifier or "").strip()
    if not identifier:
        raise ValidationError("asset identifier required")
    if criticality not in CRITICALITY:
        raise ValidationError("invalid criticality")
    get_project(project_id)
    db = get_db()
    aid = util.new_id("ast")
    db.execute(
        "INSERT INTO assets(id,project_id,kind,identifier,label,criticality,metadata,created_by,created_at) "
        "VALUES(?,?,?,?,?,?,?,?,?)",
        (aid, project_id, kind, identifier, label, criticality,
         json.dumps(metadata or {}), created_by, util.now_iso()))
    return get_asset(aid)


def get_asset(aid: str) -> dict:
    row = get_db().query_one("SELECT * FROM assets WHERE id=?", (aid,))
    if not row:
        raise NotFoundError("asset not found")
    row["metadata"] = _loads(row["metadata"], {})
    return row


def list_assets(project_id: str) -> list[dict]:
    rows = get_db().query_all(
        "SELECT * FROM assets WHERE project_id=? ORDER BY created_at DESC", (project_id,))
    for r in rows:
        r["metadata"] = _loads(r["metadata"], {})
    return rows


# ---------------------------------------------------------------------------
# Authorization scopes
# ---------------------------------------------------------------------------
def create_scope(project_id: str, asset_id: str, *, owner_contact: str = "",
                 proof: str = "", environment: str = "lab",
                 allowed_targets: list | None = None, denied_targets: list | None = None,
                 allowed_ports: list | None = None, scan_types: list | None = None,
                 valid_from: str | None = None, valid_until: str | None = None,
                 window: dict | None = None, rate_limits: dict | None = None,
                 created_by: str = "") -> dict:
    asset = get_asset(asset_id)
    if asset["project_id"] != project_id:
        raise ValidationError("asset does not belong to project")
    if environment not in ENVIRONMENTS:
        raise ValidationError("invalid environment")
    if not proof:
        raise ValidationError("authorization proof reference is required")
    db = get_db()
    sid = util.new_id("scp")
    db.execute(
        "INSERT INTO scopes(id,project_id,asset_id,owner_contact,proof,environment,"
        "allowed_targets,denied_targets,allowed_ports,scan_types,valid_from,valid_until,"
        "window,rate_limits,status,created_by,created_at) "
        "VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,'active',?,?)",
        (sid, project_id, asset_id, owner_contact, proof, environment,
         json.dumps(allowed_targets or []), json.dumps(denied_targets or []),
         json.dumps(allowed_ports or []), json.dumps(scan_types or []),
         valid_from, valid_until, json.dumps(window or {}),
         json.dumps(rate_limits or {}), created_by, util.now_iso()))
    return get_scope(sid)


def get_scope(sid: str) -> dict:
    row = get_db().query_one("SELECT * FROM scopes WHERE id=?", (sid,))
    if not row:
        raise NotFoundError("scope not found")
    for k in ("allowed_targets", "denied_targets", "allowed_ports", "scan_types"):
        row[k] = _loads(row[k], [])
    for k in ("window", "rate_limits"):
        row[k] = _loads(row[k], {})
    return row


def list_scopes(project_id: str, asset_id: str | None = None) -> list[dict]:
    db = get_db()
    if asset_id:
        rows = db.query_all(
            "SELECT * FROM scopes WHERE project_id=? AND asset_id=? ORDER BY created_at DESC",
            (project_id, asset_id))
    else:
        rows = db.query_all(
            "SELECT * FROM scopes WHERE project_id=? ORDER BY created_at DESC", (project_id,))
    for row in rows:
        for k in ("allowed_targets", "denied_targets", "allowed_ports", "scan_types"):
            row[k] = _loads(row[k], [])
        for k in ("window", "rate_limits"):
            row[k] = _loads(row[k], {})
    return rows


def revoke_scope(sid: str) -> dict:
    db = get_db()
    get_scope(sid)
    db.execute("UPDATE scopes SET status='revoked', revoked_at=? WHERE id=?",
               (util.now_iso(), sid))
    # Signal any in-flight jobs on this scope to stop.
    db.execute("UPDATE jobs SET stop_requested=1 WHERE scope_id=? AND state IN "
               "('queued','leased','running')", (sid,))
    return get_scope(sid)


# ---------------------------------------------------------------------------
# Raw catalog (broad coverage target) + connector tool-registry
# ---------------------------------------------------------------------------
def seed_catalog(seed_path: Path) -> int:
    """Load the preserved tool catalog (76 tools) into the catalog table.
    Idempotent — updates rows in place."""
    if not Path(seed_path).exists():
        return 0
    data = json.loads(Path(seed_path).read_text(encoding="utf-8"))
    db = get_db()
    n = 0
    now = util.now_iso()
    with db.tx() as c:
        for item in data:
            repo = item.get("repo", "").strip()
            if not repo:
                continue
            c.execute(
                "INSERT INTO catalog(repo,name,category,description,year,archived,"
                "integration_state,updated_at) VALUES(?,?,?,?,?,?,'cataloged',?) "
                "ON CONFLICT(repo) DO UPDATE SET name=excluded.name,category=excluded.category,"
                "description=excluded.description,year=excluded.year,archived=excluded.archived,"
                "updated_at=excluded.updated_at",
                (repo, item.get("name", repo), item.get("category", ""),
                 item.get("description", ""), item.get("year"),
                 1 if item.get("archived") else 0, now))
            n += 1
    return n


def mark_catalog_connector(repo: str) -> None:
    get_db().execute(
        "UPDATE catalog SET integration_state='connector_available', updated_at=? WHERE repo=?",
        (util.now_iso(), repo))


def list_catalog(category: str | None = None) -> list[dict]:
    db = get_db()
    if category:
        return db.query_all("SELECT * FROM catalog WHERE category=? ORDER BY name", (category,))
    return db.query_all("SELECT * FROM catalog ORDER BY category,name")


def catalog_categories() -> list[dict]:
    return get_db().query_all(
        "SELECT category, COUNT(*) n, SUM(archived) archived FROM catalog "
        "GROUP BY category ORDER BY n DESC")


def upsert_tool_registry(name: str, meta: dict) -> None:
    db = get_db()
    now = util.now_iso()
    db.execute(
        "INSERT INTO tool_registry(name,category,source,license,version,connector_type,"
        "platforms,requirements,permissions,egress,cost,secret_refs,state,readiness,"
        "last_verified_at,last_verified_ref,updated_at) "
        "VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) "
        "ON CONFLICT(name) DO UPDATE SET category=excluded.category,source=excluded.source,"
        "license=excluded.license,version=excluded.version,connector_type=excluded.connector_type,"
        "platforms=excluded.platforms,requirements=excluded.requirements,"
        "permissions=excluded.permissions,egress=excluded.egress,cost=excluded.cost,"
        "secret_refs=excluded.secret_refs,state=excluded.state,readiness=excluded.readiness,"
        "updated_at=excluded.updated_at",
        (name, meta.get("category", ""), meta.get("source", ""), meta.get("license", ""),
         meta.get("version", ""), meta.get("connector_type", "cli"),
         json.dumps(meta.get("platforms", [])), json.dumps(meta.get("requirements", {})),
         json.dumps(meta.get("permissions", [])), json.dumps(meta.get("egress", [])),
         meta.get("cost", "free"), json.dumps(meta.get("secret_refs", [])),
         meta.get("state", "catalog"), json.dumps(meta.get("readiness", {})),
         meta.get("last_verified_at"), meta.get("last_verified_ref", ""), now))


def set_tool_state(name: str, state: str, readiness: dict | None = None,
                   verified_ref: str | None = None) -> None:
    db = get_db()
    sets = ["state=?", "updated_at=?"]
    args: list = [state, util.now_iso()]
    if readiness is not None:
        sets.append("readiness=?")
        args.append(json.dumps(readiness))
    if state == "verified" and verified_ref is not None:
        sets.append("last_verified_at=?")
        args.append(util.now_iso())
        sets.append("last_verified_ref=?")
        args.append(verified_ref)
    args.append(name)
    db.execute(f"UPDATE tool_registry SET {','.join(sets)} WHERE name=?", tuple(args))


def get_tool_registry(name: str) -> dict | None:
    row = get_db().query_one("SELECT * FROM tool_registry WHERE name=?", (name,))
    if not row:
        return None
    for k in ("platforms", "permissions", "egress", "secret_refs"):
        row[k] = _loads(row[k], [])
    for k in ("requirements", "readiness"):
        row[k] = _loads(row[k], {})
    return row


def list_tool_registry() -> list[dict]:
    rows = get_db().query_all("SELECT * FROM tool_registry ORDER BY category,name")
    for row in rows:
        for k in ("platforms", "permissions", "egress", "secret_refs"):
            row[k] = _loads(row[k], [])
        for k in ("requirements", "readiness"):
            row[k] = _loads(row[k], {})
    return rows
