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
"""
from __future__ import annotations

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
NOTICE_SAMPLE_MISSING = "demo_sample_missing"

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


def _ensure_scope(project_id: str, asset: dict, connectors: list[str], owner_id: str) -> dict:
    """One active lab scope limited to the sample directory and the demo
    connectors. Scopes are immutable, so a changed connector list revokes the
    old demo scope and issues a new one; scopes created by people are left alone."""
    targets = [asset["identifier"]]
    keep = None
    for scope in store.list_scopes(project_id, asset["id"]):
        if (scope["status"] != "active" or scope["created_by"] != owner_id
                or scope["proof"] != DEMO_PROOF):
            continue
        matches = (scope["environment"] == "lab" and scope["allowed_targets"] == targets
                   and scope["scan_types"] == connectors)
        if matches and keep is None:
            keep = scope
            continue
        store.revoke_scope(scope["id"])
        audit.record("scope.revoke", actor=DEMO_ACTOR, project_id=project_id,
                     target=scope["id"], detail={"reason": "superseded demo scope"})
    if keep is not None:
        return keep
    scope = store.create_scope(
        project_id, asset["id"], owner_contact=DEMO_ACTOR, proof=DEMO_PROOF,
        environment="lab", allowed_targets=targets, scan_types=connectors,
        created_by=owner_id)
    audit.record("scope.create", actor=DEMO_ACTOR, project_id=project_id, target=scope["id"],
                 detail={"environment": scope["environment"], "scan_types": scope["scan_types"],
                         "allowed_targets": scope["allowed_targets"]})
    return scope


def _enqueue_scans(project: dict, asset: dict, scope: dict, connectors: list[str],
                   owner_id: str) -> tuple[list[str], dict]:
    """Enqueue one scan per demo connector that is ready right now.

    The idempotency key is stable for a given scope, so a restart on a
    persistent database finds the earlier job instead of adding a duplicate."""
    db = get_db()
    enqueued: list[str] = []
    skipped: dict = {}
    for name in connectors:
        key = f"public-demo:{scope['id']}:{name}"
        if db.query_one("SELECT id FROM jobs WHERE idempotency_key=?", (key,)):
            skipped[name] = "already_enqueued"
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
                         detail={"reason": decision.reason, "code": decision.code})
            skipped[name] = f"policy:{decision.code}"
            continue
        job = queue.enqueue(project_id=project["id"], asset_id=asset["id"],
                            scope_id=scope["id"], connector=conn.name, params=params,
                            created_by=owner_id, priority=DEMO_PRIORITY,
                            idempotency_key=key)
        audit.record("scan.enqueue", actor=DEMO_ACTOR, project_id=project["id"],
                     target=job["id"], detail={"connector": conn.name, "asset": asset["id"]})
        enqueued.append(job["id"])
    return enqueued, skipped


def ensure_public_demo() -> dict:
    """Create (once) and return the public demo project. No-op unless
    FSL_PUBLIC_VIEW is on. Safe to call repeatedly and from a background thread.

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
        scope = _ensure_scope(project["id"], asset, connectors, owner_id)
        # Only now does the project become visible to guests.
        get_db().set_setting(PUBLIC_PROJECT_KEY, project["id"])
        enqueued, skipped = _enqueue_scans(project, asset, scope, connectors, owner_id)
    skipped.update(rejected)
    return {"enabled": True, "created": created, "project_id": project["id"],
            "asset_id": asset["id"], "scope_id": scope["id"], "connectors": connectors,
            "enqueued": enqueued, "skipped": skipped}
