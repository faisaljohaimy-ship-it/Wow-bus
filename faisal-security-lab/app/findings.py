"""Unified findings model: normalize connector output, dedup across tools and
re-runs, compute an actionable work priority, and manage the status lifecycle.

Work priority is computed SEPARATELY from CVSS/EPSS/KEV (which describe the
vulnerability in the abstract). Work priority reflects *this* asset: severity,
asset criticality, network exposure and evidence confidence.
"""
from __future__ import annotations

import json

from . import audit, util
from .db import get_db
from .errors import NotFoundError, ValidationError

SEVERITY_RANK = {"info": 0, "low": 1, "medium": 2, "high": 3, "critical": 4}
_SEV_BASE = {"info": 5, "low": 20, "medium": 45, "high": 70, "critical": 90}
_CRIT_MULT = {"low": 0.9, "medium": 1.0, "high": 1.1, "critical": 1.2}
_CONF_ADJ = {"low": -10, "medium": 0, "high": 5}

STATUSES = {"open", "false_positive", "risk_accepted", "fixed_in_branch",
            "fixed_on_asset", "reopened"}
VERIFICATION = {"needs_verification", "confirmed", "false_positive", "undetermined"}

# Allowed status transitions (plus reopen from any resolved state).
_TRANSITIONS = {
    "open": {"false_positive", "risk_accepted", "fixed_in_branch", "confirmed_noop"},
    "reopened": {"false_positive", "risk_accepted", "fixed_in_branch"},
    "fixed_in_branch": {"fixed_on_asset", "reopened", "open"},
    "fixed_on_asset": {"reopened"},
    "false_positive": {"open", "reopened"},
    "risk_accepted": {"open", "reopened"},
}


def dedup_key(project_id: str, raw) -> str:
    loc = raw.location or {}
    loc_sig = loc.get("file") or loc.get("url") or loc.get("host") or loc.get("package") or ""
    line = loc.get("line") or loc.get("version") or ""
    identity = raw.cve or raw.rule_id or raw.title
    return util.sha256_text(f"{project_id}|{identity}|{loc_sig}|{line}")


def work_priority(severity: str, criticality: str, exposure: bool, confidence: str) -> int:
    score = _SEV_BASE.get(severity, 5) * _CRIT_MULT.get(criticality, 1.0)
    score += _CONF_ADJ.get(confidence, 0)
    if exposure:
        score += 5
    return max(0, min(100, round(score)))


def ingest(job: dict, asset: dict, raw_findings: list, *, source_flag: str = "real",
           tool_version: str = "") -> dict:
    """Persist normalized findings, deduping within the project. Returns counts."""
    db = get_db()
    created = updated = reopened = 0
    exposure = asset.get("kind") in ("web", "api", "host")
    criticality = asset.get("criticality", "medium")
    now = util.now_iso()
    for raw in raw_findings:
        dk = dedup_key(job["project_id"], raw)
        wp = work_priority(raw.severity, criticality, exposure, raw.confidence)
        existing = db.query_one(
            "SELECT id,status FROM findings WHERE project_id=? AND dedup_key=?",
            (job["project_id"], dk))
        if existing:
            # Re-observed. If it was marked fixed, reopen it (it came back).
            new_status = existing["status"]
            reopen_flag = 0
            if existing["status"] in ("fixed_in_branch", "fixed_on_asset"):
                new_status = "reopened"
                reopen_flag = 1
                reopened += 1
            db.execute(
                "UPDATE findings SET occurrences=occurrences+1, job_id=?, tool_version=?, "
                "updated_at=?, status=?, reopened=?, work_priority=? WHERE id=?",
                (job["id"], tool_version, now, new_status, reopen_flag, wp, existing["id"]))
            updated += 1
            raw._finding_id = existing["id"]
        else:
            fid = util.new_id("fnd")
            db.execute(
                "INSERT INTO findings(id,project_id,asset_id,job_id,connector,tool_version,"
                "rule_id,title,location,severity,confidence,verification_status,status,"
                "work_priority,cve,cwe,cvss,epss,kev,remediation,description,dedup_key,"
                "occurrences,reopened,source_flag,created_at,updated_at) "
                "VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1,0,?,?,?)",
                (fid, job["project_id"], asset["id"], job["id"], job["connector"],
                 tool_version, raw.rule_id[:200], raw.title[:300],
                 json.dumps(raw.location, ensure_ascii=False), raw.severity, raw.confidence,
                 "needs_verification", "open", wp, raw.cve, raw.cwe,
                 json.dumps(raw.cvss or {}), "{}", "{}", raw.remediation[:2000],
                 util.redact(raw.description)[:4000], dk, source_flag, now, now))
            created += 1
            raw._finding_id = fid
    return {"created": created, "updated": updated, "reopened": reopened}


def get_finding(fid: str) -> dict:
    row = get_db().query_one("SELECT * FROM findings WHERE id=?", (fid,))
    if not row:
        raise NotFoundError("finding not found")
    for k in ("location", "cvss", "epss", "kev"):
        try:
            row[k] = json.loads(row[k])
        except (ValueError, TypeError):
            row[k] = {}
    return row


def list_findings(project_id: str, *, severity: str | None = None, status: str | None = None,
                  connector: str | None = None, limit: int = 500, offset: int = 0) -> list[dict]:
    sql = "SELECT * FROM findings WHERE project_id=?"
    args: list = [project_id]
    if severity:
        sql += " AND severity=?"
        args.append(severity)
    if status:
        sql += " AND status=?"
        args.append(status)
    if connector:
        sql += " AND connector=?"
        args.append(connector)
    sql += " ORDER BY work_priority DESC, created_at DESC LIMIT ? OFFSET ?"
    args += [limit, offset]
    rows = get_db().query_all(sql, tuple(args))
    for row in rows:
        for k in ("location", "cvss", "epss", "kev"):
            try:
                row[k] = json.loads(row[k])
            except (ValueError, TypeError):
                row[k] = {}
    return rows


def set_status(fid: str, status: str, *, actor: str = "system", actor_role: str = "",
               note: str = "") -> dict:
    if status not in STATUSES:
        raise ValidationError(f"invalid status; allowed: {sorted(STATUSES)}")
    f = get_finding(fid)
    db = get_db()
    reopened = 1 if status == "reopened" else f["reopened"]
    db.execute("UPDATE findings SET status=?, reopened=?, updated_at=? WHERE id=?",
               (status, reopened, util.now_iso(), fid))
    audit.record("finding.status_change", actor=actor, actor_role=actor_role,
                 project_id=f["project_id"], target=fid,
                 detail={"from": f["status"], "to": status, "note": note})
    return get_finding(fid)


def set_verification(fid: str, verification: str, *, actor: str = "system",
                     evidence_note: str = "") -> dict:
    if verification not in VERIFICATION:
        raise ValidationError(f"invalid verification; allowed: {sorted(VERIFICATION)}")
    f = get_finding(fid)
    get_db().execute("UPDATE findings SET verification_status=?, updated_at=? WHERE id=?",
                     (verification, util.now_iso(), fid))
    audit.record("finding.verification", actor=actor, project_id=f["project_id"],
                 target=fid, detail={"verification": verification, "note": evidence_note})
    return get_finding(fid)


def set_intel(fid: str, *, cvss: dict | None = None, epss: dict | None = None,
              kev: dict | None = None) -> dict:
    """Attach CVSS/EPSS/KEV with their source+date. Each payload must carry a
    'source' and 'date' so the number is auditable."""
    f = get_finding(fid)
    sets, args = [], []
    for col, payload in (("cvss", cvss), ("epss", epss), ("kev", kev)):
        if payload is not None:
            if "source" not in payload or "date" not in payload:
                raise ValidationError(f"{col} requires 'source' and 'date'")
            sets.append(f"{col}=?")
            args.append(json.dumps(payload))
    if not sets:
        return f
    sets.append("updated_at=?")
    args.append(util.now_iso())
    args.append(fid)
    get_db().execute(f"UPDATE findings SET {','.join(sets)} WHERE id=?", tuple(args))
    return get_finding(fid)
