"""Operational metrics derived from the database (no external dependency)."""
from __future__ import annotations

from .db import get_db


def snapshot(project_id: str | None = None) -> dict:
    db = get_db()
    where = "WHERE project_id=?" if project_id else ""
    args = (project_id,) if project_id else ()

    def count(sql, extra=()):
        row = db.query_one(sql, args + extra)
        return (row or {}).get("n", 0)

    jobs_by_state = {}
    rows = db.query_all(
        f"SELECT state, COUNT(*) n FROM jobs {where} GROUP BY state", args)
    for r in rows:
        jobs_by_state[r["state"]] = r["n"]

    findings_by_sev = {}
    rows = db.query_all(
        f"SELECT severity, COUNT(*) n FROM findings {where} GROUP BY severity", args)
    for r in rows:
        findings_by_sev[r["severity"]] = r["n"]

    findings_by_status = {}
    rows = db.query_all(
        f"SELECT status, COUNT(*) n FROM findings {where} GROUP BY status", args)
    for r in rows:
        findings_by_status[r["status"]] = r["n"]

    verified_fixes = count(
        f"SELECT COUNT(*) n FROM findings {where} "
        + ("AND" if where else "WHERE") + " status IN ('fixed_in_branch','fixed_on_asset')")

    tool_states = {}
    rows = db.query_all("SELECT state, COUNT(*) n FROM tool_registry GROUP BY state")
    for r in rows:
        tool_states[r["state"]] = r["n"]

    catalog_states = {}
    rows = db.query_all("SELECT integration_state, COUNT(*) n FROM catalog GROUP BY integration_state")
    for r in rows:
        catalog_states[r["integration_state"]] = r["n"]

    return {
        "jobs_by_state": jobs_by_state,
        "jobs_total": sum(jobs_by_state.values()),
        "findings_by_severity": findings_by_sev,
        "findings_by_status": findings_by_status,
        "findings_total": sum(findings_by_sev.values()),
        "verified_fixes": verified_fixes,
        "assets": count(f"SELECT COUNT(*) n FROM assets {where}"),
        "scopes_active": count(
            f"SELECT COUNT(*) n FROM scopes {where} "
            + ("AND" if where else "WHERE") + " status='active'"),
        "tool_states": tool_states,
        "catalog_states": catalog_states,
    }
