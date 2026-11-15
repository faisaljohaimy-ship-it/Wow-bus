"""The public demo project behind the optional public read-only view.

When FSL_PUBLIC_VIEW=1 a visitor without a session may read exactly one
project. This module creates that project and fills it with real results by
scanning the bundled, intentionally vulnerable sample (samples/vulnerable-app),
which is the platform's own authorized lab target. Nothing outside that
directory is ever registered, authorized or scanned here.

`ensure_public_demo()` is idempotent: calling it again, or restarting on a
persistent database, reuses the same account, project, asset, scope and jobs.
It goes through the same chokepoints as an operator would: the scope is a real
authorization record, every scan passes `policy.evaluate_job` before it is
enqueued (and again in the worker before it runs), and each step is audited.

Two things do change between starts. A demo scan that ended without a result
(failed, blocked, cancelled, undetermined) is enqueued again, up to
DEMO_MAX_ATTEMPTS jobs per connector and scope. A scan that was running when
the process stopped is not in that group yet: it stays "running" until its
lease has expired and a worker has marked it undetermined, so the first start
after that is the one that enqueues it again. And the demo defers to an
operator: once somebody revokes the demo's authorization scope, no new scope is
issued and nothing is scanned until a person authorizes it again.
"""
from __future__ import annotations

import hashlib
import hmac
import threading
from pathlib import Path

from . import audit, auth, policy, queue, store
from .bootstrap import SETUP_NOTICES
from .config import get_config
from .connectors import get_connector
from .db import get_db

DEMO_PROJECT_NAME = "عرض توضيحي — Public demo"
DEMO_PROOF = "LAB-SELF-OWNED bundled sample"
DEMO_ASSET_LABEL = "Bundled vulnerable sample (authorized lab target)"
DEMO_ACTOR = "system:public-demo"
# Demo scans yield to anything an operator submits (lower number = sooner).
DEMO_PRIORITY = 9
PUBLIC_PROJECT_KEY = auth.PUBLIC_PROJECT_KEY
# Settings key: id of the authorization scope this module issued and manages.
PUBLIC_SCOPE_KEY = "public_scope_id"
NOTICE_SAMPLE_MISSING = "demo_sample_missing"

# Jobs per connector under one scope, the first run included.
DEMO_MAX_ATTEMPTS = 3
# A demo job in one of these states is waiting, in progress or done; every
# other state is an end without a result.
SETTLED_JOB_STATES = queue.ACTIVE_STATES + ("succeeded",)
SKIP_ALREADY_ENQUEUED = "already_enqueued"
SKIP_ATTEMPTS_EXHAUSTED = "attempts_exhausted"
SKIP_KEY_IN_USE = "key_in_use"
SKIP_SCOPE_REVOKED = "scope_revoked"

# Resolved relative to the package so it works from any working directory and
# inside the container image (deploy/Dockerfile.fly copies ./samples).
SAMPLE_DIR = Path(__file__).resolve().parent.parent / "samples" / "vulnerable-app"

_LOCK = threading.Lock()


def demo_connectors() -> tuple[list[str], dict]:
    """Configured demo connectors that are safe for a public demo.

    Only passive connectors that analyze staged source are accepted, so a
    mistyped or over-broad FSL_DEMO_CONNECTORS can never make the demo send
    traffic anywhere. Returns (accepted names, {rejected name: reason})."""
    accepted: list[str] = []
    rejected: dict = {}
    for name in get_config().demo_connectors:
        conn = get_connector(name)
        if conn is None:
            rejected[name] = "unknown_connector"
            continue
        caps = conn.capabilities()
        if caps.get("active") or not caps.get("needs_source"):
            rejected[name] = "not_a_passive_source_connector"
            continue
        accepted.append(conn.name)
    return accepted, rejected


def _set_notice(code: str, present: bool) -> None:
    if present and code not in SETUP_NOTICES:
        SETUP_NOTICES.append(code)
    elif not present and code in SETUP_NOTICES:
        SETUP_NOTICES.remove(code)


def _ensure_project(owner_id: str) -> tuple[dict, bool]:
    """The demo project is always one owned by the system account. A stored id
    that points anywhere else is ignored, never exposed."""
    db = get_db()
    pid = db.get_setting(PUBLIC_PROJECT_KEY, "")
    if pid:
        row = db.query_one("SELECT * FROM projects WHERE id=? AND owner_id=?", (pid, owner_id))
        if row:
            return row, False
    row = db.query_one(
        "SELECT * FROM projects WHERE owner_id=? AND name=? ORDER BY created_at LIMIT 1",
        (owner_id, DEMO_PROJECT_NAME))
    if row:
        return row, False
    project = store.create_project(DEMO_PROJECT_NAME, owner_id)
    audit.record("project.create", actor=DEMO_ACTOR, project_id=project["id"],
                 detail={"name": project["name"], "public_demo": True})
    return project, True


def _ensure_asset(project_id: str, sample: Path, owner_id: str) -> dict:
    identifier = str(sample)
    for asset in store.list_assets(project_id):
        if asset["kind"] == "source" and asset["identifier"] == identifier:
            return asset
    asset = store.create_asset(
        project_id, "source", identifier, label=DEMO_ASSET_LABEL,
        metadata={"local_path": identifier, "public_demo": True}, created_by=owner_id)
    audit.record("asset.create", actor=DEMO_ACTOR, project_id=project_id, target=asset["id"],
                 detail={"kind": asset["kind"], "public_demo": True})
    return asset


def _scope_revoked_by_operator(project_id: str) -> dict | None:
    """The scope this module manages, if somebody has revoked it.

    _ensure_scope records a scope under PUBLIC_SCOPE_KEY before it revokes the
    one it replaces, so the recorded scope is never one this code revoked."""
    db = get_db()
    sid = db.get_setting(PUBLIC_SCOPE_KEY, "")
    if not sid:
        return None
    return db.query_one("SELECT id FROM scopes WHERE id=? AND project_id=? AND status='revoked'",
                        (sid, project_id))


def _ensure_scope(project_id: str, asset: dict, connectors: list[str], owner_id: str) -> dict:
    """One active lab scope limited to the sample directory and the demo
    connectors. Scopes are immutable, so a changed connector list issues a new
    demo scope and revokes the old one. A demo scope on an earlier demo asset
    (the sample as an install at another path registered it) is revoked in the
    same way. Scopes created by people are left alone.

    The scope in force is recorded under PUBLIC_SCOPE_KEY before the superseded
    ones are revoked. In that order an interruption at any point leaves the
    record on an active scope, never on one revoked here."""
    targets = [asset["identifier"]]
    keep = None
    superseded = []
    for scope in store.list_scopes(project_id):
        if (scope["status"] != "active" or scope["created_by"] != owner_id
                or scope["proof"] != DEMO_PROOF):
            continue
        matches = (scope["asset_id"] == asset["id"] and scope["environment"] == "lab"
                   and scope["allowed_targets"] == targets
                   and scope["scan_types"] == connectors)
        if matches and keep is None:
            keep = scope
        else:
            superseded.append(scope)
    if keep is None:
        keep = store.create_scope(
            project_id, asset["id"], owner_contact=DEMO_ACTOR, proof=DEMO_PROOF,
            environment="lab", allowed_targets=targets, scan_types=connectors,
            created_by=owner_id)
        audit.record("scope.create", actor=DEMO_ACTOR, project_id=project_id, target=keep["id"],
                     detail={"environment": keep["environment"],
                             "scan_types": keep["scan_types"],
                             "allowed_targets": keep["allowed_targets"]})
    get_db().set_setting(PUBLIC_SCOPE_KEY, keep["id"])
    for scope in superseded:
        store.revoke_scope(scope["id"])
        audit.record("scope.revoke", actor=DEMO_ACTOR, project_id=project_id,
                     target=scope["id"], detail={"reason": "superseded demo scope"})
    return keep


def _job_keys(scope_id: str, connector: str) -> list[str]:
    """Idempotency keys of the demo jobs for one connector under one scope, in
    the order they are used: the first run, then the retries ":2", ":3".

    Each key ends in a keyed digest of its own text under the server's secret.
    The queue matches an idempotency key across all projects, and a guest can
    read the scope id and the connector names, so a key made of those alone
    could be taken by a job in another project before the demo uses it."""
    secret = get_config().secret_key
    first = f"public-demo:{scope_id}:{connector}"
    keys = []
    for n in range(1, DEMO_MAX_ATTEMPTS + 1):
        text = first if n == 1 else f"{first}:{n}"
        tag = hmac.new(secret, text.encode("utf-8"), hashlib.sha256).hexdigest()[:16]
        keys.append(f"{text}:{tag}")
    return keys


def _enqueue_scans(project: dict, asset: dict, scope: dict, connectors: list[str],
                   owner_id: str) -> tuple[list[str], dict]:
    """Enqueue one scan per demo connector that is ready right now.

    The idempotency keys are stable for a given scope, so a restart on a
    persistent database finds the earlier jobs instead of adding duplicates.
    A connector gets a new job only when its latest one ended without a result
    and fewer than DEMO_MAX_ATTEMPTS jobs exist for it under this scope.

    Only jobs of the demo project under this scope count. The queue matches
    an idempotency key across all projects, so a job of another project could
    hold one of them (a key that is in use can be read from the demo's job
    list): that job says nothing about the demo, and a key it holds is passed
    over."""
    db = get_db()
    enqueued: list[str] = []
    skipped: dict = {}
    for name in connectors:
        keys = _job_keys(scope["id"], name)
        marks = ",".join("?" for _ in keys)
        states = {row["idempotency_key"]: row["state"] for row in db.query_all(
            "SELECT idempotency_key, state FROM jobs WHERE project_id=? AND scope_id=? "
            f"AND idempotency_key IN ({marks})", (project["id"], scope["id"], *keys))}
        latest = max((i for i, key in enumerate(keys) if key in states), default=-1)
        if latest >= 0 and states[keys[latest]] in SETTLED_JOB_STATES:
            skipped[name] = SKIP_ALREADY_ENQUEUED
            continue
        if latest + 1 >= len(keys):
            skipped[name] = SKIP_ATTEMPTS_EXHAUSTED
            continue
        conn = get_connector(name)
        try:
            ready = bool(conn.readiness().get("available"))
            params = conn.validate_config({})
        except Exception:
            ready, params = False, {}
        if not ready:
            skipped[name] = "not_ready"
            continue
        # POLICY AT ENQUEUE (principal=None: there is no human requester; the
        # scope itself is the authorization). The worker re-checks before running.
        decision = policy.evaluate_job(principal=None, project=project, asset=asset,
                                       scope=scope, connector=conn, params=params)
        if not decision.allow:
            audit.record("scan.denied", actor=DEMO_ACTOR, project_id=project["id"],
                         target=name, outcome="denied",
                         detail={"reason": decision.reason, "code": decision.code,
                                 **decision.detail})
            skipped[name] = f"policy:{decision.code}"
            continue
        job = None
        for key in keys[latest + 1:]:
            held = queue.enqueue(project_id=project["id"], asset_id=asset["id"],
                                 scope_id=scope["id"], connector=conn.name, params=params,
                                 created_by=owner_id, priority=DEMO_PRIORITY,
                                 idempotency_key=key)
            # For a key that is already taken the queue returns the job that
            # holds it, whichever project that job belongs to.
            if held["project_id"] == project["id"] and held["scope_id"] == scope["id"]:
                job = held
                break
        if job is None:
            skipped[name] = SKIP_KEY_IN_USE
            continue
        audit.record("scan.enqueue", actor=DEMO_ACTOR, project_id=project["id"],
                     target=job["id"], detail={"connector": conn.name, "asset": asset["id"]})
        enqueued.append(job["id"])
    return enqueued, skipped


def ensure_public_demo(*, scans: bool = True) -> dict:
    """Create (once) and return the public demo project. No-op unless
    FSL_PUBLIC_VIEW is on. Safe to call repeatedly and from a background thread.

    With scans=False it stops once the project, its asset and its scope exist
    and the project is visible to guests: database writes only, no tool is
    asked whether it is ready and nothing is enqueued.

    The returned summary never contains credentials."""
    cfg = get_config()
    if not cfg.public_view:
        return {"enabled": False}
    sample = SAMPLE_DIR
    if not sample.is_dir():
        _set_notice(NOTICE_SAMPLE_MISSING, True)
        return {"enabled": True, "project_id": None, "notice": NOTICE_SAMPLE_MISSING}

    with _LOCK:
        _set_notice(NOTICE_SAMPLE_MISSING, False)
        owner_id = auth.ensure_system_user()
        project, created = _ensure_project(owner_id)
        asset = _ensure_asset(project["id"], sample, owner_id)
        connectors, rejected = demo_connectors()
        revoked = _scope_revoked_by_operator(project["id"])
        if revoked:
            # An operator withdrew the authorization. It is not issued again
            # and nothing is scanned; what the project already holds stays
            # readable.
            get_db().set_setting(PUBLIC_PROJECT_KEY, project["id"])
            return {"enabled": True, "created": created, "project_id": project["id"],
                    "asset_id": asset["id"], "scope_id": revoked["id"],
                    "connectors": connectors, "enqueued": [],
                    "skipped": {"*": SKIP_SCOPE_REVOKED}}
        scope = _ensure_scope(project["id"], asset, connectors, owner_id)
        # Only now does the project become visible to guests.
        get_db().set_setting(PUBLIC_PROJECT_KEY, project["id"])
        enqueued, skipped = ([], {})
        if scans:
            enqueued, skipped = _enqueue_scans(project, asset, scope, connectors, owner_id)
    skipped.update(rejected)
    return {"enabled": True, "created": created, "project_id": project["id"],
            "asset_id": asset["id"], "scope_id": scope["id"], "connectors": connectors,
            "enqueued": enqueued, "skipped": skipped}
