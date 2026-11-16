"""Durable job queue backed by SQLite.

Guarantees that matter for a scanner:
  * idempotency — an idempotency_key collapses duplicate submissions.
  * leases — a claimed job carries a lease that must be renewed; a worker that
    dies lets the lease expire.
  * crash safety — an expired lease on a job that was only *leased* (not started)
    returns to the queue; an expired lease on a *running* job becomes
    'undetermined' (we do NOT silently re-run an active scan).
  * per-asset serialization — at most one active scan per asset.
  * cooperative cancel + global stop.
"""
from __future__ import annotations

import datetime as dt
import json

from . import util
from .config import get_config
from .db import get_db
from .errors import ConflictError, NotFoundError, ValidationError

ACTIVE_STATES = ("queued", "leased", "running")


def enqueue(*, project_id: str, asset_id: str, scope_id: str, connector: str,
            params: dict, created_by: str, priority: int = 5,
            idempotency_key: str | None = None, max_attempts: int | None = None,
            campaign_id: str | None = None, depends_on: list | None = None) -> dict:
    db = get_db()
    cfg = get_config()
    if idempotency_key:
        existing = db.query_one("SELECT * FROM jobs WHERE idempotency_key=?", (idempotency_key,))
        if existing:
            return _hydrate(existing)
    jid = util.new_id("job")
    now = util.now_iso()
    try:
        db.execute(
            "INSERT INTO jobs(id,project_id,asset_id,scope_id,connector,params,state,phase,"
            "idempotency_key,priority,attempts,max_attempts,created_by,created_at,"
            "campaign_id,depends_on) "
            "VALUES(?,?,?,?,?,?,'queued','queued',?,?,0,?,?,?,?,?)",
            (jid, project_id, asset_id, scope_id, connector,
             json.dumps(params, ensure_ascii=False), idempotency_key, priority,
             max_attempts or cfg.limits.max_attempts, created_by, now,
             campaign_id, json.dumps(depends_on or [], ensure_ascii=False)))
    except Exception as e:
        if "idx_jobs_idem" in str(e):
            existing = db.query_one("SELECT * FROM jobs WHERE idempotency_key=?", (idempotency_key,))
            if existing:
                return _hydrate(existing)
        raise
    # Mint a time-limited, signed execution grant for this exact operation. The
    # worker verifies it before running (see app/permission.py). Issuing it here,
    # on the server enqueue path, is what the AI model cannot do for itself.
    from . import permission
    permission.issue_and_store(job_id=jid, project_id=project_id, asset_id=asset_id,
                               connector=connector, created_by=created_by)
    return get_job(jid)


def get_job(jid: str) -> dict:
    row = get_db().query_one("SELECT * FROM jobs WHERE id=?", (jid,))
    if not row:
        raise NotFoundError("job not found")
    return _hydrate(row)


def _hydrate(row: dict) -> dict:
    row = dict(row)
    for k in ("params", "result_summary"):
        try:
            row[k] = json.loads(row[k]) if row.get(k) else {}
        except (ValueError, TypeError):
            row[k] = {}
    try:
        row["depends_on"] = json.loads(row.get("depends_on") or "[]")
    except (ValueError, TypeError):
        row["depends_on"] = []
    if row.get("error"):
        try:
            row["error"] = json.loads(row["error"])
        except (ValueError, TypeError):
            pass
    return row


def list_jobs(project_id: str | None = None, *, state: str | None = None,
              limit: int = 200, offset: int = 0) -> list[dict]:
    db = get_db()
    sql = "SELECT * FROM jobs"
    clauses, args = [], []
    if project_id:
        clauses.append("project_id=?")
        args.append(project_id)
    if state:
        clauses.append("state=?")
        args.append(state)
    if clauses:
        sql += " WHERE " + " AND ".join(clauses)
    sql += " ORDER BY created_at DESC LIMIT ? OFFSET ?"
    args += [limit, offset]
    return [_hydrate(r) for r in db.query_all(sql, tuple(args))]


_TERMINAL_FAIL = ("failed", "blocked", "cancelled", "timed_out", "undetermined")


def _deps_state(c, depends_on: list) -> str:
    """'ready' (all deps succeeded), 'pending' (some still running), or 'failed'
    (a dep reached a terminal non-success state, so this task can never run)."""
    if not depends_on:
        return "ready"
    rows = c.execute(
        "SELECT id, state FROM jobs WHERE id IN (%s)" % ",".join("?" for _ in depends_on),
        tuple(depends_on)).fetchall()
    states = {r["id"]: r["state"] for r in rows}
    for dep in depends_on:
        st = states.get(dep)
        if st is None or st in _TERMINAL_FAIL:
            return "failed"
        if st != "succeeded":
            return "pending"
    return "ready"


def claim_next(worker_id: str, connectors: list[str] | None = None) -> dict | None:
    """Atomically lease the next eligible queued job. Respects per-asset
    serialization, task dependencies, campaign cancellation + concurrency caps,
    the per-connector circuit breaker, and the global stop switch."""
    from .policy import global_stop_engaged
    from . import circuit
    if global_stop_engaged():
        return None
    db = get_db()
    cfg = get_config()
    now = util.now()
    lease_until = (now + dt.timedelta(seconds=cfg.limits.lease_visibility_seconds))
    with db.tx() as c:
        conn_filter = ""
        args: list = []
        if connectors:
            placeholders = ",".join("?" for _ in connectors)
            conn_filter = f" AND j.connector IN ({placeholders})"
            args += list(connectors)
        candidates = c.execute(
            "SELECT j.* FROM jobs j WHERE j.state='queued'"
            + conn_filter +
            " AND NOT EXISTS (SELECT 1 FROM jobs k WHERE k.asset_id=j.asset_id "
            "   AND k.state IN ('leased','running') AND k.id<>j.id)"
            " ORDER BY j.priority ASC, j.created_at ASC LIMIT 50",
            tuple(args)).fetchall()
        chosen = None
        for row in candidates:
            # Circuit breaker: hold back a connector that keeps failing.
            if circuit.is_suspended(row["connector"]):
                continue
            # Campaign gating: cancelled campaigns run nothing; honour concurrency.
            cid = row["campaign_id"]
            if cid:
                camp = c.execute("SELECT status, caps FROM campaigns WHERE id=?", (cid,)).fetchone()
                if camp:
                    if camp["status"] == "cancelled":
                        continue
                    try:
                        max_conc = int(json.loads(camp["caps"] or "{}").get("max_concurrency", 0))
                    except (ValueError, TypeError):
                        max_conc = 0
                    if max_conc:
                        active = c.execute(
                            "SELECT COUNT(*) AS n FROM jobs WHERE campaign_id=? "
                            "AND state IN ('leased','running')", (cid,)).fetchone()["n"]
                        if active >= max_conc:
                            continue
            # Task dependencies.
            try:
                deps = json.loads(row["depends_on"] or "[]")
            except (ValueError, TypeError):
                deps = []
            ds = _deps_state(c, deps)
            if ds == "failed":
                c.execute("UPDATE jobs SET state='blocked', phase='blocked', finished_at=?, "
                          "error=? WHERE id=? AND state='queued'",
                          (util.now_iso(),
                           json.dumps({"code": "dependency_failed",
                                       "message": "a prerequisite task did not succeed"}),
                           row["id"]))
                continue
            if ds == "pending":
                continue
            chosen = row
            break
        if chosen is None:
            return None
        c.execute(
            "UPDATE jobs SET state='leased', lease_owner=?, lease_expires_at=?, "
            "attempts=attempts+1, started_at=COALESCE(started_at,?) WHERE id=? AND state='queued'",
            (worker_id, util.iso(lease_until), util.now_iso(), chosen["id"]))
    return get_job(chosen["id"])


def renew_lease(jid: str, worker_id: str) -> bool:
    cfg = get_config()
    lease_until = util.now() + dt.timedelta(seconds=cfg.limits.lease_visibility_seconds)
    cur = get_db().execute(
        "UPDATE jobs SET lease_expires_at=? WHERE id=? AND lease_owner=? AND state IN ('leased','running')",
        (util.iso(lease_until), jid, worker_id))
    return cur.rowcount > 0


def mark_running(jid: str, worker_id: str, phase: str = "running") -> None:
    get_db().execute(
        "UPDATE jobs SET state='running', phase=?, progress=0.1 WHERE id=? AND lease_owner=?",
        (phase, jid, worker_id))


def update_progress(jid: str, progress: float, phase: str | None = None) -> None:
    if phase:
        get_db().execute("UPDATE jobs SET progress=?, phase=? WHERE id=?",
                         (max(0.0, min(1.0, progress)), phase, jid))
    else:
        get_db().execute("UPDATE jobs SET progress=? WHERE id=?",
                         (max(0.0, min(1.0, progress)), jid))


def complete(jid: str, state: str, *, result_summary: dict | None = None,
             error: dict | None = None) -> dict:
    if state not in ("succeeded", "failed", "blocked", "cancelled", "timed_out", "undetermined"):
        raise ValidationError("invalid terminal state")
    get_db().execute(
        "UPDATE jobs SET state=?, phase=?, progress=?, finished_at=?, result_summary=?, error=? "
        "WHERE id=?",
        (state, state, 1.0 if state == "succeeded" else None and 1.0 or 1.0,
         util.now_iso(), json.dumps(result_summary or {}, ensure_ascii=False),
         json.dumps(error) if error else None, jid))
    # The execution grant is spent once the job reaches a terminal state.
    from . import permission
    permission.clear(jid)
    return get_job(jid)


def request_stop(jid: str) -> dict:
    # Stamp the request time once so the time from a cancel request to the job
    # reaching a terminal state can be measured honestly.
    get_db().execute("UPDATE jobs SET stop_requested=1, "
                     "stop_requested_at=COALESCE(stop_requested_at,?) WHERE id=? AND state IN "
                     "('queued','leased','running')", (util.now_iso(), jid))
    return get_job(jid)


def cancel_latency_seconds(job: dict) -> float | None:
    """Seconds from the cancel/stop request to the job finishing, or None when
    either timestamp is missing. Used to report a real cancel time."""
    req, fin = job.get("stop_requested_at"), job.get("finished_at")
    if not req or not fin:
        return None
    try:
        t0 = dt.datetime.fromisoformat(req)
        t1 = dt.datetime.fromisoformat(fin)
    except (ValueError, TypeError):
        return None
    return max(0.0, (t1 - t0).total_seconds())


def retry_eligible(job: dict) -> bool:
    return job.get("attempts", 0) < job.get("max_attempts", 1)


def reclaim_expired() -> dict:
    """Return expired-lease jobs to a safe state. Called by the worker loop."""
    db = get_db()
    now_iso = util.now_iso()
    requeued = undetermined = 0
    with db.tx() as c:
        # Leased-but-not-started with an expired lease: safe to requeue.
        rows = c.execute(
            "SELECT id, attempts, max_attempts FROM jobs WHERE state='leased' "
            "AND lease_expires_at IS NOT NULL AND lease_expires_at < ?", (now_iso,)).fetchall()
        for r in rows:
            if r["attempts"] < r["max_attempts"]:
                c.execute("UPDATE jobs SET state='queued', lease_owner=NULL, "
                          "lease_expires_at=NULL WHERE id=?", (r["id"],))
                requeued += 1
            else:
                c.execute("UPDATE jobs SET state='undetermined', phase='undetermined', "
                          "error=? WHERE id=?",
                          (json.dumps({"code": "lease_expired",
                                       "message": "worker lost before start; retries exhausted"}),
                           r["id"]))
                undetermined += 1
        # Running with an expired lease: execution status is UNDETERMINED. We do
        # NOT re-run an active scan automatically (per spec).
        rows = c.execute(
            "SELECT id FROM jobs WHERE state='running' AND lease_expires_at IS NOT NULL "
            "AND lease_expires_at < ?", (now_iso,)).fetchall()
        for r in rows:
            c.execute(
                "UPDATE jobs SET state='undetermined', phase='undetermined', finished_at=?, "
                "error=? WHERE id=?",
                (now_iso, json.dumps({"code": "execution_undetermined",
                 "message": "worker lease expired mid-run; prior execution status could not be "
                            "confirmed. A new scan requires explicit re-submission."}), r["id"]))
            undetermined += 1
    return {"requeued": requeued, "undetermined": undetermined}
