"""Connector registry + tool-registry synchronisation.

The in-memory registry maps a connector name to its implementation. `sync_registry`
runs each connector's live readiness check and records a truthful state in the
tool_registry table:

  catalog     — known but neither installed nor configured
  installed   — binary present
  ready       — installed and its readiness check passed
  blocked     — a required binary/egress/secret is missing (with reason)
  disabled    — turned off by an operator
  verified    — a real integration run has been recorded (set elsewhere, never here)
  stale       — previously verified, but version/connector/config changed since

Verification is deliberately NOT granted by readiness alone.
"""
from __future__ import annotations

from .. import store
from .. import util
from .base import Connector

# Connector classes are imported lazily to keep import cost low and avoid a
# hard failure if one module has an issue.
from .http_headers import HttpHeadersConnector
from .tls_certificate import TlsCertificateConnector
from .semgrep import SemgrepConnector
from .gitleaks import GitleaksConnector
from .bandit import BanditConnector
from .osv_scanner import OsvScannerConnector
from .pip_audit import PipAuditConnector
from .trivy import TrivyConnector

_CONNECTOR_CLASSES = [
    HttpHeadersConnector, TlsCertificateConnector, SemgrepConnector, GitleaksConnector,
    BanditConnector, OsvScannerConnector, PipAuditConnector, TrivyConnector,
]

_REGISTRY: dict[str, Connector] = {}


def _ensure_ai_connector():
    """The AI red-team connector lives in app.ai to avoid a circular import at
    module load; register it on demand."""
    try:
        from ..ai.redteam import AiRedTeamConnector
        if AiRedTeamConnector.name not in _REGISTRY:
            _REGISTRY[AiRedTeamConnector.name] = AiRedTeamConnector()
    except Exception:
        pass


def _build():
    if not _REGISTRY:
        for cls in _CONNECTOR_CLASSES:
            _REGISTRY[cls.name] = cls()
    _ensure_ai_connector()


def get_connector(name: str) -> Connector | None:
    _build()
    return _REGISTRY.get(name)


def connector_names() -> list[str]:
    _build()
    return sorted(_REGISTRY.keys())


def all_connectors() -> list[Connector]:
    _build()
    return list(_REGISTRY.values())


def _state_for(readiness: dict) -> str:
    if readiness.get("available") and readiness.get("installed"):
        return "ready"
    if readiness.get("installed"):
        return "installed"
    return "blocked"


def sync_registry() -> list[dict]:
    """Refresh every connector's state from live readiness. Preserves a prior
    'verified' only when the verified reference still matches (else 'stale')."""
    _build()
    out = []
    for name, conn in _REGISTRY.items():
        try:
            readiness = conn.readiness()
        except Exception as e:  # readiness must never crash the sync
            readiness = {"installed": False, "available": False, "version": None,
                         "detail": f"readiness error: {e}"}
        existing = store.get_tool_registry(name)
        state = _state_for(readiness)
        verified_ref = conn.verified_ref()
        if existing and existing.get("state") == "verified":
            if existing.get("last_verified_ref") == verified_ref and state == "ready":
                state = "verified"
            elif state == "ready":
                state = "stale"
        store.upsert_tool_registry(name, {
            "category": conn.category, "source": conn.source, "license": conn.license,
            "version": readiness.get("version") or "",
            "connector_type": conn.connector_type,
            "platforms": ["linux"],
            "requirements": {"binary": conn.binary} if conn.binary else {},
            "permissions": [], "egress": conn.egress,
            "secret_refs": list(getattr(conn, "secret_refs", []) or []),
            "state": state, "readiness": readiness,
            "last_verified_at": (existing or {}).get("last_verified_at"),
            "last_verified_ref": (existing or {}).get("last_verified_ref", ""),
        })
        # Link the connector back to its catalog entry when the repo matches.
        repo = _repo_from_source(conn.source)
        if repo:
            try:
                store.mark_catalog_connector(repo)
            except Exception:
                pass
        out.append({"name": name, "state": state, "version": readiness.get("version"),
                    "detail": readiness.get("detail")})
    return out


def record_verified(name: str) -> None:
    conn = get_connector(name)
    if conn:
        store.set_tool_state(name, "verified", readiness=conn.readiness(),
                             verified_ref=conn.verified_ref())


def _repo_from_source(source: str) -> str:
    if "github.com/" in source:
        tail = source.split("github.com/", 1)[1].strip("/")
        parts = tail.split("/")
        if len(parts) >= 2:
            return f"{parts[0]}/{parts[1]}"
    return ""
