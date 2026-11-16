"""Per-connector circuit breaker (v4 §27).

When a tool or an external service fails repeatedly, the breaker opens: new jobs
for that connector are held back for a cooldown so one broken dependency does not
starve the queue or burn resources, while every other connector keeps working. A
success closes it again. State lives in the settings table (shared by the API and
the worker).
"""
from __future__ import annotations

import datetime as dt
import json

from . import util
from .db import get_db

THRESHOLD = 3            # consecutive failures before the circuit opens
COOLDOWN_SECONDS = 300   # how long it stays open


def _key(connector: str) -> str:
    return f"circuit:{connector}"


def _state(connector: str) -> dict:
    raw = get_db().get_setting(_key(connector), "")
    if not raw:
        return {"fails": 0, "suspended_until": ""}
    try:
        d = json.loads(raw)
        return {"fails": int(d.get("fails", 0)), "suspended_until": d.get("suspended_until", "")}
    except (ValueError, TypeError):
        return {"fails": 0, "suspended_until": ""}


def record_failure(connector: str) -> None:
    s = _state(connector)
    s["fails"] += 1
    if s["fails"] >= THRESHOLD:
        s["suspended_until"] = util.iso(util.now() + dt.timedelta(seconds=COOLDOWN_SECONDS))
    get_db().set_setting(_key(connector), json.dumps(s))


def record_success(connector: str) -> None:
    get_db().set_setting(_key(connector), json.dumps({"fails": 0, "suspended_until": ""}))


def is_suspended(connector: str) -> bool:
    s = _state(connector)
    return bool(s["suspended_until"] and s["suspended_until"] > util.now_iso())


def status() -> list[dict]:
    rows = get_db().query_all("SELECT key, value FROM settings WHERE key LIKE 'circuit:%'")
    now = util.now_iso()
    out = []
    for r in rows:
        try:
            d = json.loads(r["value"])
        except (ValueError, TypeError):
            d = {}
        su = d.get("suspended_until", "")
        out.append({"connector": r["key"].split(":", 1)[1], "fails": d.get("fails", 0),
                    "suspended": bool(su and su > now), "suspended_until": su})
    return out
