"""Server-side credential store referenced by credential_ref (§19).

A secret is stored once, by an owner, under a reference. Only the worker's
connector-staging path calls resolve() to pass the actual value to a tool as an
environment variable. The value is NEVER returned by any API, written to the
audit log, shown in the UI, included in a report, or sent to the model. Every
other surface — describe(), list_refs(), the API, the audit log — sees only the
reference and safe metadata (kind, host).

Kinds mirror the §19 taxonomy so the platform never confuses one for another:
  api_credential   — a token/key to authenticate to a service or tool daemon
  activation_token — an official product activation code
  tls_cert         — a certificate (protects a connection; not a licence)
  license          — software/rules usage terms (text, not an access secret)
  training_badge   — proof of training; grants NO execution or access rights
  other
"""
from __future__ import annotations

import re

from . import util
from .db import get_db
from .errors import NotFoundError, ValidationError

KINDS = {"api_credential", "activation_token", "tls_cert", "license",
         "training_badge", "other"}

_REF_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$")


def _check_ref(ref: str) -> str:
    if not isinstance(ref, str) or not _REF_RE.match(ref):
        raise ValidationError("a secret ref is 1-64 chars of letters, digits, '.', '_', ':' or '-'")
    return ref


def put_secret(ref: str, value: str, *, kind: str = "api_credential", host: str = "",
               created_by: str = "") -> dict:
    """Store (or replace) a secret value under `ref`. Returns safe metadata only."""
    _check_ref(ref)
    if kind not in KINDS:
        raise ValidationError(f"kind must be one of {sorted(KINDS)}")
    if not isinstance(value, str) or value == "":
        raise ValidationError("secret value must be a non-empty string")
    now = util.now_iso()
    get_db().execute(
        "INSERT INTO secrets(ref,kind,host,value,created_by,created_at,updated_at) "
        "VALUES(?,?,?,?,?,?,?) ON CONFLICT(ref) DO UPDATE SET "
        "value=excluded.value, kind=excluded.kind, host=excluded.host, updated_at=excluded.updated_at",
        (ref, kind, host or "", value, created_by or "", now, now))
    return describe(ref)


def resolve(ref: str) -> str | None:
    """Return the actual secret value. Worker-only; never call from a request
    handler, a report, or anything the model can see."""
    row = get_db().query_one("SELECT value FROM secrets WHERE ref=?", (ref,))
    return row["value"] if row else None


def describe(ref: str) -> dict | None:
    """Safe metadata for one secret — never the value."""
    row = get_db().query_one(
        "SELECT ref,kind,host,created_by,created_at,updated_at FROM secrets WHERE ref=?", (ref,))
    if not row:
        return None
    row["configured"] = True
    return row


def list_refs() -> list[dict]:
    """Safe metadata for every secret — never any value."""
    rows = get_db().query_all(
        "SELECT ref,kind,host,created_by,created_at,updated_at FROM secrets ORDER BY ref")
    for r in rows:
        r["configured"] = True
    return rows


def delete(ref: str) -> None:
    cur = get_db().execute("DELETE FROM secrets WHERE ref=?", (ref,))
    if cur.rowcount == 0:
        raise NotFoundError("secret not found")


def resolve_for_connector(connector) -> tuple[dict, list[str]]:
    """Resolve a connector's declared secret_refs into {env_name: value} plus the
    list of refs that are declared but NOT configured. A connector declares
    secret_refs as a list of {"ref": "<ref>", "env": "<ENV_NAME>"}.
    """
    env: dict[str, str] = {}
    missing: list[str] = []
    for spec in getattr(connector, "secret_refs", None) or []:
        if not isinstance(spec, dict):
            continue
        ref, env_name = spec.get("ref"), spec.get("env")
        if not ref or not env_name:
            continue
        value = resolve(ref)
        if value is None:
            missing.append(ref)
        else:
            env[env_name] = value
    return env, missing
