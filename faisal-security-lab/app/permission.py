"""Time-limited, signed execution-permission grants (v4 §19).

A grant is minted by the server the moment a job is enqueued — the only path
that holds the authorization context and the server signing key — and verified
again by the worker at execution time, independently of the request that created
it. It binds one operation (job + project + asset + connector) and carries an
expiry, so it cannot be reused for a *different* operation and cannot outlive its
window. Re-running the *same* job (a retry) reuses the same grant, which is the
same operation, not a different one.

The AI model never sees the signing key and cannot mint or widen a grant: it can
only ask the server to enqueue a job, and the server decides and signs. The grant
is a technical proof of the authorization already recorded in the platform's
scope; it does not create authorization that was not there.
"""
from __future__ import annotations

import base64
import datetime as _dt
import json
import os

from . import util
from .config import get_config
from .db import get_db
from .errors import PolicyDenied

_DEFAULT_TTL = 24 * 3600          # a day: time-limited, but long enough for a queued job
_SETTING = "grant:{}"


def _ttl() -> int:
    try:
        v = int(os.environ.get("FSL_GRANT_TTL_SECONDS", ""))
        return v if v > 0 else _DEFAULT_TTL
    except (TypeError, ValueError):
        return _DEFAULT_TTL


def _key() -> bytes:
    return get_config().secret_key


def _b64(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


def _unb64(text: str) -> bytes:
    return base64.urlsafe_b64decode(text + "=" * (-len(text) % 4))


def _bind(job_id, project_id, asset_id, connector) -> dict:
    return {"job_id": job_id, "project_id": project_id,
            "asset_id": asset_id, "connector": connector}


def mint(*, job_id, project_id, asset_id, connector, created_by,
         ttl: int | None = None) -> str:
    now = util.now()
    seconds = ttl if ttl is not None else _ttl()
    payload = {
        "jti": util.new_id("grant"),
        **_bind(job_id, project_id, asset_id, connector),
        "created_by": created_by,
        "iat": util.iso(now),
        "exp": util.iso(now + _dt.timedelta(seconds=seconds)),
    }
    body = _b64(json.dumps(payload, sort_keys=True, ensure_ascii=False).encode("utf-8"))
    sig = util.hmac_sha256_hex(_key(), body)
    return f"{body}.{sig}"


def issue_and_store(*, job_id, project_id, asset_id, connector, created_by,
                    ttl: int | None = None) -> str:
    token = mint(job_id=job_id, project_id=project_id, asset_id=asset_id,
                 connector=connector, created_by=created_by, ttl=ttl)
    get_db().set_setting(_SETTING.format(job_id), token)
    return token


def _decode(token: str) -> dict:
    body, _, sig = (token or "").partition(".")
    if not body or not sig:
        raise PolicyDenied("execution grant is malformed", code="exec_grant_invalid")
    if not util.constant_time_eq(sig, util.hmac_sha256_hex(_key(), body)):
        raise PolicyDenied("execution grant signature is invalid", code="exec_grant_invalid")
    try:
        payload = json.loads(_unb64(body).decode("utf-8"))
        if not isinstance(payload, dict):
            raise ValueError("not an object")
    except (ValueError, TypeError, json.JSONDecodeError):
        raise PolicyDenied("execution grant is malformed", code="exec_grant_invalid") from None
    return payload


def verify(token: str, *, job_id, project_id, asset_id, connector) -> dict:
    payload = _decode(token)
    exp = payload.get("exp") or ""
    if exp <= util.now_iso():                 # both are second-resolution UTC ISO strings
        raise PolicyDenied("execution grant has expired",
                           code="exec_grant_expired", detail={"exp": exp})
    for field, value in _bind(job_id, project_id, asset_id, connector).items():
        if payload.get(field) != value:
            raise PolicyDenied("execution grant does not match this operation",
                               code="exec_grant_mismatch", detail={"field": field})
    return payload


def verify_job(job: dict) -> dict:
    token = get_db().get_setting(_SETTING.format(job["id"]), "")
    if not token:
        raise PolicyDenied("no execution grant for this job", code="exec_grant_missing")
    return verify(token, job_id=job["id"], project_id=job["project_id"],
                  asset_id=job["asset_id"], connector=job["connector"])


def clear(job_id: str) -> None:
    try:
        get_db().delete_setting(_SETTING.format(job_id))
    except Exception:
        pass
