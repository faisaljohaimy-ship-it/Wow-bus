"""The Agent Tool Gateway (spec §18): one enforced surface between the agent's
inference and the authority to execute a tool.

The AI layer — and the UI, and the chat — never call the queue, the policy
engine or a connector directly. They call these nine contracts, each of which
re-derives the real project/asset/scope/connector from stored ids, runs the
same server-side policy checks, and only then delegates to the durable queue and
the isolated worker. The model cannot widen scope, skip a check or forge a
grant: allow / budget / isolation decisions live here and in the policy engine,
not in anything the model emits.

Contracts: list_capabilities, validate_request, estimate_resources, start_job,
get_job_status, cancel_job, collect_evidence, normalize_findings, retest_finding.
These names are this platform's internal contract surface; they are not native
APIs of any individual tool.
"""
from __future__ import annotations

from . import audit, evidence, findings as F, policy, queue, store
from .connectors import get_connector
from .connectors.registry import snapshot as registry_snapshot
from .errors import ForbiddenError, NotFoundError, ValidationError

CONTRACTS = ("list_capabilities", "validate_request", "estimate_resources",
             "start_job", "get_job_status", "cancel_job", "collect_evidence",
             "normalize_findings", "retest_finding")


# ---------------------------------------------------------------------------
# 1. list_capabilities — what the agent is allowed to run, and whether it is ready
# ---------------------------------------------------------------------------
def list_capabilities(principal, *, project_id: str | None = None) -> dict:
    if project_id is not None:
        principal.require_project(project_id, "reader")
    reg = {r["name"]: r for r in registry_snapshot()}
    out = []
    for name in sorted(reg):
        conn = get_connector(name)
        if conn is None:
            continue
        row = reg[name]
        out.append({
            "connector": name,
            "category": conn.category,
            "capabilities": conn.capabilities(),
            "connector_type": conn.connector_type,
            "state": row.get("state", "catalog"),
            "ready": row.get("state") in ("ready", "verified"),
            "license": row.get("license", ""),
            "version": row.get("version", ""),
        })
    return {"capabilities": out, "contracts": list(CONTRACTS)}


# ---------------------------------------------------------------------------
# 2. validate_request — would this run be authorized, without enqueuing it
# ---------------------------------------------------------------------------
def _resolve(project_id, asset_id, scope_id, connector):
    project = store.get_project(project_id)
    asset = store.get_asset(asset_id)
    scope = store.get_scope(scope_id)
    conn = get_connector(connector or "")
    if conn is None:
        raise ValidationError(f"unknown connector '{connector}'")
    return project, asset, scope, conn


def validate_request(principal, *, project_id, asset_id, scope_id, connector, params) -> dict:
    principal.require_project(project_id, "analyst")
    project, asset, scope, conn = _resolve(project_id, asset_id, scope_id, connector)
    try:
        normalized = conn.validate_config(params or {})
    except ValidationError as e:
        return {"ok": False, "code": e.code, "reason": e.message}
    decision = policy.evaluate_job(principal=principal, project=project, asset=asset,
                                   scope=scope, connector=conn, params=normalized)
    return {"ok": bool(decision.allow), "code": decision.code,
            "reason": decision.reason, "normalized_params": normalized,
            "detail": decision.public_detail() if not decision.allow else {}}


# ---------------------------------------------------------------------------
# 3. estimate_resources — an honest, labelled estimate (never a fake number)
# ---------------------------------------------------------------------------
def estimate_resources(principal, *, project_id, asset_id, scope_id, connector, params) -> dict:
    principal.require_project(project_id, "analyst")
    _, asset, _, conn = _resolve(project_id, asset_id, scope_id, connector)
    from .config import get_config
    limits = get_config().limits
    caps = conn.capabilities()
    # A coarse wall-clock estimate from the connector kind. This is an estimate,
    # labelled as one; the hard bounds (cpu/timeout) are the enforced limits.
    base = {"source": 60, "network": 20, "api": 45, "cli": 60}.get(conn.connector_type, 45)
    return {
        "estimate": True,
        "est_wall_seconds": base,
        "max_wall_seconds": limits.job_timeout_seconds,
        "max_cpu_seconds": limits.job_cpu_seconds,
        "needs_network": bool(caps.get("needs_network")),
        "active": bool(caps.get("active")),
        "cost": {"model": "self-hosted compute", "license_fee": 0,
                 "ai_tokens_estimated": 0,
                 "note": "local compute only; no tool licence fee. Compute/storage "
                         "cost depends on the host and is not metered here."},
    }


# ---------------------------------------------------------------------------
# 4. start_job — enqueue after the enforced policy check (the one write path)
# ---------------------------------------------------------------------------
def start_job(principal, *, project_id, asset_id, scope_id, connector, params,
              priority: int = 5, idempotency_key: str | None = None) -> dict:
    principal.require_project(project_id, "analyst")
    project, asset, scope, conn = _resolve(project_id, asset_id, scope_id, connector)
    normalized = conn.validate_config(params or {})
    decision = policy.evaluate_job(principal=principal, project=project, asset=asset,
                                   scope=scope, connector=conn, params=normalized)
    if not decision.allow:
        audit.record("scan.denied", actor=principal.email, project_id=project_id,
                     target=conn.name, outcome="denied",
                     detail={"reason": decision.reason, "code": decision.code, **decision.detail})
        raise ForbiddenError(decision.reason, code="policy_denied",
                             detail=decision.public_detail())
    job = queue.enqueue(project_id=project_id, asset_id=asset["id"], scope_id=scope["id"],
                        connector=conn.name, params=normalized, created_by=principal.user_id,
                        priority=int(priority), idempotency_key=idempotency_key)
    audit.record("scan.enqueue", actor=principal.email, project_id=project_id, target=job["id"],
                 detail={"connector": conn.name, "asset": asset["id"]})
    return job


# ---------------------------------------------------------------------------
# 5/6. get_job_status / cancel_job
# ---------------------------------------------------------------------------
def get_job_status(principal, job_id: str) -> dict:
    job = queue.get_job(job_id)
    principal.require_project(job["project_id"], "reader")
    return {"job": job, "evidence": evidence.list_for_job(job["id"])}


def cancel_job(principal, job_id: str) -> dict:
    job = queue.get_job(job_id)
    principal.require_project(job["project_id"], "analyst")
    out = queue.request_stop(job["id"])
    audit.record("job.stop", actor=principal.email, project_id=job["project_id"], target=job["id"])
    return out


# ---------------------------------------------------------------------------
# 7/8. collect_evidence / normalize_findings
# ---------------------------------------------------------------------------
def collect_evidence(principal, job_id: str) -> dict:
    job = queue.get_job(job_id)
    principal.require_project(job["project_id"], "reader")
    return {"job_id": job_id, "evidence": evidence.list_for_job(job_id)}


def normalize_findings(principal, job_id: str) -> dict:
    job = queue.get_job(job_id)
    principal.require_project(job["project_id"], "reader")
    rows = [f for f in F.list_findings(job["project_id"]) if f.get("job_id") == job_id]
    return {"job_id": job_id, "findings": rows}


# ---------------------------------------------------------------------------
# 9. retest_finding — re-run the scan that produced a finding, on the current asset
# ---------------------------------------------------------------------------
def retest_finding(principal, finding_id: str, *, idempotency_key: str | None = None) -> dict:
    f = F.get_finding(finding_id)
    principal.require_project(f["project_id"], "analyst")
    origin = queue.get_job(f["job_id"])
    job = start_job(principal, project_id=f["project_id"], asset_id=origin["asset_id"],
                    scope_id=origin["scope_id"], connector=origin["connector"],
                    params=origin.get("params") or {}, idempotency_key=idempotency_key)
    audit.record("finding.retest", actor=principal.email, project_id=f["project_id"],
                 target=finding_id, detail={"retest_job": job["id"], "connector": origin["connector"]})
    return {"finding_id": finding_id, "job": job}


def retest_outcome(finding_id: str, retest_job_id: str) -> dict:
    """Whether the finding was seen again by the retest job. 'reappeared' means
    the same dedup_key was re-observed (so it is NOT fixed on the asset);
    'cleared' means the retest completed without re-observing it."""
    f = F.get_finding(finding_id)
    job = queue.get_job(retest_job_id)
    done = job["state"] in ("succeeded",)
    reappeared = f.get("job_id") == retest_job_id and job["state"] == "succeeded"
    result = {"finding_id": finding_id, "retest_job": retest_job_id,
              "retest_state": job["state"], "completed": done,
              "reappeared": bool(reappeared),
              "cleared": bool(done and not reappeared), "at": job.get("finished_at")}
    try:
        F.set_retest_result(finding_id, result)
    except Exception:
        pass
    return result
