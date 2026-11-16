"""Conflicting-evidence ledger (v4 §10).

When a new observation or an independent review disagrees with a prior one, the
platform keeps BOTH — with their versions — and records a conflict that stays
'needs_verification' until a proper, authorized check resolves it. A conflict is
never silently treated as fixed, and a stale result from a different
tool/rules/app version never closes an issue on its own.
"""
from __future__ import annotations

import json

from . import audit, util
from .db import get_db
from .errors import NotFoundError, ValidationError

KINDS = {"evidence_expired", "reappeared_after_fix",
         "verification_disagreement", "tool_disagreement"}


def record(finding_id: str, kind: str, *, project_id: str, prior=None, current=None,
           detail: str = "") -> dict:
    if kind not in KINDS:
        raise ValidationError(f"conflict kind must be one of {sorted(KINDS)}")
    cid = util.new_id("cfl")
    now = util.now_iso()
    get_db().execute(
        "INSERT INTO finding_conflicts(id,project_id,finding_id,kind,status,prior,current,detail,created_at) "
        "VALUES(?,?,?,?,'needs_verification',?,?,?,?)",
        (cid, project_id, finding_id, kind,
         json.dumps(prior or {}, ensure_ascii=False),
         json.dumps(current or {}, ensure_ascii=False),
         util.redact(detail)[:500], now))
    audit.record("finding.conflict", project_id=project_id, target=finding_id,
                 detail={"conflict": cid, "kind": kind})
    return get(cid)


def _hydrate(row: dict) -> dict:
    for k in ("prior", "current"):
        try:
            row[k] = json.loads(row[k]) if row.get(k) else {}
        except (ValueError, TypeError):
            row[k] = {}
    return row


def get(cid: str) -> dict:
    row = get_db().query_one("SELECT * FROM finding_conflicts WHERE id=?", (cid,))
    if not row:
        raise NotFoundError("conflict not found")
    return _hydrate(row)


def list_for_finding(finding_id: str) -> list[dict]:
    return [_hydrate(r) for r in get_db().query_all(
        "SELECT * FROM finding_conflicts WHERE finding_id=? ORDER BY created_at DESC", (finding_id,))]


def list_for_project(project_id: str, *, status: str | None = None) -> list[dict]:
    sql = "SELECT * FROM finding_conflicts WHERE project_id=?"
    args: list = [project_id]
    if status:
        sql += " AND status=?"
        args.append(status)
    sql += " ORDER BY created_at DESC LIMIT 1000"
    return [_hydrate(r) for r in get_db().query_all(sql, tuple(args))]


def open_count(project_id: str) -> int:
    row = get_db().query_one(
        "SELECT COUNT(*) AS n FROM finding_conflicts WHERE project_id=? AND status='needs_verification'",
        (project_id,))
    return int(row["n"]) if row else 0


def resolve(cid: str, *, actor: str = "system", note: str = "") -> dict:
    c = get(cid)
    get_db().execute("UPDATE finding_conflicts SET status='resolved', resolved_at=? WHERE id=?",
                     (util.now_iso(), cid))
    audit.record("finding.conflict_resolved", actor=actor, project_id=c["project_id"],
                 target=c["finding_id"], detail={"conflict": cid, "note": note})
    return get(cid)
