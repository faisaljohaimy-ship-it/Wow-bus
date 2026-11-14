"""Append-only, redacted audit log.

Every security-relevant action (login, scope create/revoke, job enqueue, policy
denial, evidence export, tool state change, global stop) writes one row. Detail
is redacted before storage so secrets never land in the audit trail.
"""
from __future__ import annotations

import json

from . import util
from .db import get_db


def record(action: str, *, actor: str = "system", actor_role: str = "",
           project_id: str | None = None, target: str = "", outcome: str = "ok",
           detail: dict | None = None) -> str:
    db = get_db()
    aid = util.new_id("aud")
    safe_detail = util.redact_obj(detail or {})
    db.execute(
        "INSERT INTO audit(id,actor,actor_role,action,project_id,target,outcome,detail,created_at) "
        "VALUES(?,?,?,?,?,?,?,?,?)",
        (aid, actor, actor_role, action, project_id, target, outcome,
         json.dumps(safe_detail, ensure_ascii=False), util.now_iso()),
    )
    return aid


def query(project_id: str | None = None, limit: int = 200, offset: int = 0) -> list[dict]:
    db = get_db()
    if project_id:
        rows = db.query_all(
            "SELECT * FROM audit WHERE project_id=? ORDER BY created_at DESC LIMIT ? OFFSET ?",
            (project_id, limit, offset))
    else:
        rows = db.query_all(
            "SELECT * FROM audit ORDER BY created_at DESC LIMIT ? OFFSET ?", (limit, offset))
    for r in rows:
        try:
            r["detail"] = json.loads(r["detail"])
        except (ValueError, TypeError):
            r["detail"] = {}
    return rows
