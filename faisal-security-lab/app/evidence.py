"""Evidence store.

Evidence text is redacted a second time (connectors already redact secret
values) before it is written to disk, hashed (sha256) and recorded. Raw evidence
lives under the evidence directory (0700) with a restricted access policy and a
retention deadline. The database keeps only metadata + a redacted summary.
"""
from __future__ import annotations

import datetime as dt
from pathlib import Path

from . import util
from .config import get_config
from .db import get_db


def _evidence_root() -> Path:
    return get_config().evidence_dir


def store_artifact(project_id: str, artifact, *, job_id: str | None = None,
                   finding_id: str | None = None, retention_days: int = 90) -> dict:
    cfg = get_config()
    text = artifact.text or ""
    redacted = util.redact(text)
    if len(redacted.encode("utf-8")) > cfg.limits.max_evidence_bytes:
        redacted = util.clamp(redacted, cfg.limits.max_evidence_bytes)
    data = redacted.encode("utf-8")
    sha = util.sha256_hex(data)

    rel_dir = Path(project_id) / (job_id or "adhoc")
    abs_dir = _evidence_root() / rel_dir
    abs_dir.mkdir(parents=True, exist_ok=True)
    safe_name = "".join(c for c in artifact.name if c.isalnum() or c in "._-") or "evidence.txt"
    rel_path = rel_dir / f"{sha[:12]}-{safe_name}"
    (_evidence_root() / rel_path).write_bytes(data)

    eid = util.new_id("evd")
    retention_until = (util.now() + dt.timedelta(days=retention_days)).replace(microsecond=0).isoformat()
    summary = util.clamp(redacted, 600)
    get_db().execute(
        "INSERT INTO evidence(id,project_id,job_id,finding_id,kind,sha256,bytes,"
        "redacted_summary,storage_ref,access_policy,retention_until,created_at) "
        "VALUES(?,?,?,?,?,?,?,?,?,?,?,?)",
        (eid, project_id, job_id, finding_id, artifact.kind, sha, len(data),
         summary, str(rel_path), "restricted", retention_until, util.now_iso()))
    return {"id": eid, "sha256": sha, "bytes": len(data), "storage_ref": str(rel_path)}


def list_for_job(job_id: str) -> list[dict]:
    return get_db().query_all(
        "SELECT id,kind,sha256,bytes,redacted_summary,storage_ref,access_policy,"
        "retention_until,created_at,finding_id FROM evidence WHERE job_id=? ORDER BY created_at",
        (job_id,))


def list_for_finding(finding_id: str) -> list[dict]:
    return get_db().query_all(
        "SELECT id,kind,sha256,bytes,redacted_summary,storage_ref,created_at "
        "FROM evidence WHERE finding_id=? ORDER BY created_at", (finding_id,))


def read_text(evidence_id: str) -> dict:
    row = get_db().query_one("SELECT * FROM evidence WHERE id=?", (evidence_id,))
    if not row:
        from .errors import NotFoundError
        raise NotFoundError("evidence not found")
    path = _evidence_root() / row["storage_ref"]
    text = ""
    if path.exists():
        text = path.read_text(encoding="utf-8", errors="replace")
    # Already redacted at write time; redact again defensively on read.
    return {"meta": row, "text": util.redact(text)}
