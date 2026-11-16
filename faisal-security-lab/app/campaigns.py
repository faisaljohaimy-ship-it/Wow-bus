"""Campaigns (v4 §20): a dependency-ordered plan of scan tasks with hard total
caps per campaign and per asset.

A campaign enqueues several scan jobs that run independently where they can and
wait for their prerequisites where they must. A total cap on tasks and on
concurrency — per campaign and per asset — stops a group of parallel tools from
exceeding an asset's budget by splitting requests between them. Every task still
goes through the gateway, so each one is policy-checked and grant-verified in its
own right. Cancelling a campaign stops its running tasks and prevents its pending
ones from starting.
"""
from __future__ import annotations

import json

from . import audit, gateway, queue, util
from .db import get_db
from .errors import NotFoundError, ValidationError

DEFAULT_CAPS = {"max_tasks": 50, "max_concurrency": 4, "per_asset_max_tasks": 20}
_CAP_CEILING = {"max_tasks": 200, "max_concurrency": 16, "per_asset_max_tasks": 50}
_FINAL = ("succeeded", "failed", "blocked", "cancelled", "timed_out", "undetermined")


def _norm_caps(caps) -> dict:
    out = dict(DEFAULT_CAPS)
    for k in DEFAULT_CAPS:
        v = (caps or {}).get(k)
        if isinstance(v, int) and not isinstance(v, bool) and v > 0:
            out[k] = min(v, _CAP_CEILING[k])
    return out


def _toposort(refs: dict) -> list[str]:
    """Order refs so a task comes after its dependencies. Raises on an unknown
    dependency or a cycle."""
    graph = {}
    for ref, t in refs.items():
        deps = t.get("depends_on") or []
        for d in deps:
            if d not in refs:
                raise ValidationError(f"task '{ref}' depends on unknown ref '{d}'")
        graph[ref] = list(deps)
    order, state = [], {}
    def visit(n):
        s = state.get(n, 0)
        if s == 1:
            raise ValidationError("dependency cycle in the campaign plan")
        if s == 2:
            return
        state[n] = 1
        for d in graph[n]:
            visit(d)
        state[n] = 2
        order.append(n)
    for ref in refs:
        visit(ref)
    return order


def create(principal, *, project_id: str, name: str, plan: list, caps=None) -> dict:
    """Create a campaign from a plan: a list of tasks, each
    {ref?, connector, asset_id, scope_id, params?, depends_on?:[ref,...]}.
    """
    principal.require_project(project_id, "analyst")
    caps = _norm_caps(caps)
    if not isinstance(plan, list) or not plan:
        raise ValidationError("a campaign plan must be a non-empty list of tasks")
    if len(plan) > caps["max_tasks"]:
        raise ValidationError(f"campaign has {len(plan)} tasks; the cap is {caps['max_tasks']}")
    refs: dict = {}
    per_asset: dict = {}
    for i, t in enumerate(plan):
        if not isinstance(t, dict):
            raise ValidationError("each task must be an object")
        ref = str(t.get("ref") or f"t{i}")
        if ref in refs:
            raise ValidationError(f"duplicate task ref '{ref}'")
        if not t.get("asset_id") or not t.get("scope_id") or not t.get("connector"):
            raise ValidationError(f"task '{ref}' needs asset_id, scope_id and connector")
        refs[ref] = t
        a = t["asset_id"]
        per_asset[a] = per_asset.get(a, 0) + 1
        if per_asset[a] > caps["per_asset_max_tasks"]:
            raise ValidationError(
                f"too many tasks for asset {a}; the per-asset cap is {caps['per_asset_max_tasks']}")
    order = _toposort(refs)

    cid = util.new_id("camp")
    now = util.now_iso()
    get_db().execute(
        "INSERT INTO campaigns(id,project_id,name,status,caps,plan,created_by,created_at) "
        "VALUES(?,?,?,'running',?,?,?,?)",
        (cid, project_id, (name or "")[:200], json.dumps(caps),
         json.dumps(plan, ensure_ascii=False), principal.user_id, now))

    ref_job: dict = {}
    try:
        for ref in order:
            t = refs[ref]
            deps = [ref_job[d] for d in (t.get("depends_on") or [])]
            job = gateway.start_job(principal, project_id=project_id, asset_id=t["asset_id"],
                                    scope_id=t["scope_id"], connector=t["connector"],
                                    params=t.get("params", {}), campaign_id=cid, depends_on=deps)
            ref_job[ref] = job["id"]
    except Exception:
        # A task was refused (policy, unknown connector, ...). Do not leave a
        # half-built campaign running: cancel it.
        _cancel(cid, reason="a task was refused while the campaign was being created")
        raise
    audit.record("campaign.create", actor=principal.email, project_id=project_id, target=cid,
                 detail={"tasks": len(order), "name": (name or "")[:80]})
    return get(cid)


def _hydrate(row: dict) -> dict:
    try:
        row["caps"] = json.loads(row.get("caps") or "{}")
    except (ValueError, TypeError):
        row["caps"] = {}
    try:
        row["plan"] = json.loads(row.get("plan") or "[]")
    except (ValueError, TypeError):
        row["plan"] = []
    return row


def get(cid: str) -> dict:
    row = get_db().query_one("SELECT * FROM campaigns WHERE id=?", (cid,))
    if not row:
        raise NotFoundError("campaign not found")
    row = _hydrate(row)
    row["progress"] = progress(cid)
    return row


def list_for_project(project_id: str) -> list[dict]:
    rows = get_db().query_all(
        "SELECT * FROM campaigns WHERE project_id=? ORDER BY created_at DESC LIMIT 200", (project_id,))
    out = []
    for r in rows:
        r = _hydrate(r)
        r["progress"] = progress(r["id"])
        out.append(r)
    return out


def progress(cid: str) -> dict:
    rows = get_db().query_all(
        "SELECT state, COUNT(*) AS n FROM jobs WHERE campaign_id=? GROUP BY state", (cid,))
    by = {r["state"]: r["n"] for r in rows}
    total = sum(by.values())
    finished = sum(by.get(s, 0) for s in _FINAL)
    return {"by_state": by, "total": total, "finished": finished, "active": total - finished}


def cancel(principal, cid: str) -> dict:
    c = get(cid)
    principal.require_project(c["project_id"], "analyst")
    return _cancel(cid, reason="operator cancelled the campaign", actor=principal.email)


def _cancel(cid: str, *, reason: str = "", actor: str = "system") -> dict:
    db = get_db()
    db.execute("UPDATE campaigns SET status='cancelled', finished_at=? WHERE id=? AND status='running'",
               (util.now_iso(), cid))
    for j in db.query_all("SELECT id, state FROM jobs WHERE campaign_id=?", (cid,)):
        if j["state"] == "queued":
            queue.complete(j["id"], "cancelled",
                           error={"code": "campaign_cancelled", "message": reason})
        elif j["state"] in ("leased", "running"):
            queue.request_stop(j["id"])
    audit.record("campaign.cancel", actor=actor, target=cid, detail={"reason": reason})
    return get(cid)
