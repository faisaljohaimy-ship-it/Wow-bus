"""The policy engine: the single chokepoint that decides whether a scan job is
allowed. It is evaluated TWICE — once when a job is enqueued (so an unauthorized
request is rejected even via direct API call) and again inside the worker right
before the tool runs (so a scope revoked after enqueue stops the job).

It never trusts the caller's claimed target: targets are re-derived from the
stored asset + validated params and matched against the stored scope.
"""
from __future__ import annotations

import datetime as dt
from dataclasses import dataclass

from . import scope as scope_mod
from .auth import Principal, rank
from .db import get_db
from .errors import PolicyDenied

GLOBAL_STOP_KEY = "global_stop"


@dataclass
class Decision:
    allow: bool
    reason: str = ""
    code: str = "ok"

    def raise_if_denied(self):
        if not self.allow:
            raise PolicyDenied(self.reason or "denied by policy", detail={"policy_code": self.code})
        return self


def global_stop_engaged() -> bool:
    return get_db().get_setting(GLOBAL_STOP_KEY, "0") == "1"


def set_global_stop(engaged: bool) -> None:
    db = get_db()
    db.set_setting(GLOBAL_STOP_KEY, "1" if engaged else "0")
    if engaged:
        db.execute("UPDATE jobs SET stop_requested=1 WHERE state IN ('queued','leased','running')")


def evaluate_job(*, principal: Principal | None, project: dict, asset: dict, scope: dict,
                 connector, params: dict, when: dt.datetime | None = None,
                 require_role: str = "analyst") -> Decision:
    """connector is a connector instance (has .name and .capabilities())."""
    when = when or dt.datetime.now(dt.timezone.utc)

    # 0. Global stop switch halts everything.
    if global_stop_engaged():
        return Decision(False, "global stop is engaged", "global_stop")

    # 1. Role (skip when principal is None → internal re-check path).
    if principal is not None:
        if rank(principal.project_role(project["id"])) < rank(require_role):
            return Decision(False, f"requires project role '{require_role}'", "role")

    # 2. Structural integrity: asset ∈ project, scope ∈ asset/project, scope active.
    if asset["project_id"] != project["id"]:
        return Decision(False, "asset does not belong to project", "project_isolation")
    if scope["project_id"] != project["id"] or scope["asset_id"] != asset["id"]:
        return Decision(False, "scope does not match asset/project", "scope_mismatch")
    if scope["status"] != "active":
        return Decision(False, "authorization scope is not active", "scope_inactive")

    # 3. Connector must be explicitly permitted by the scope.
    scan_types = scope.get("scan_types") or []
    if connector.name not in scan_types:
        return Decision(False,
                        f"connector '{connector.name}' is not in the authorized scan types",
                        "connector_not_authorized")

    # 4. Validity + run window.
    try:
        scope_mod.within_window(scope, when)
    except PolicyDenied as e:
        return Decision(False, e.message, "window")

    # 5. Environment gating: active connectors in prod need an explicit flag.
    caps = connector.capabilities()
    from .config import get_config
    if scope.get("environment") == "prod" and caps.get("active") and not get_config().allow_active_in_prod:
        return Decision(False,
                        "active scanning in production is disabled (set FSL_ALLOW_ACTIVE_IN_PROD)",
                        "prod_active_blocked")

    # 6. Targets derived from asset+params must be inside the scope.
    try:
        scope_mod.check_targets(scope, asset, params)
    except PolicyDenied as e:
        return Decision(False, e.message, "target_scope")

    return Decision(True, "authorized", "ok")
