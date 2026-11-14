"""One-call platform initialization: config, db schema, owner, catalog, tools.

Initialization never raises on operator misconfiguration (a short owner
password, a malformed owner email, an unwritable data directory). Problems are
collected as stable notice codes in SETUP_NOTICES, logged in one line each, and
shown on the sign-in page so a hosted deploy stays up and explains itself.
"""
from __future__ import annotations

import sys

from . import auth, store
from .config import get_config
from .connectors import sync_registry
from .db import get_db

# Codes describing setup problems found at startup (no secrets, safe to expose).
SETUP_NOTICES: list[str] = []

_NOTICE_LOG = {
    "owner_email_invalid":
        "FSL_OWNER_EMAIL is not a valid email; using the default "
        f"'{auth.DEFAULT_OWNER_EMAIL}' as the owner sign-in.",
    "owner_password_too_short":
        f"FSL_OWNER_PASSWORD is shorter than {auth.MIN_PASSWORD_LENGTH} characters; "
        "NO owner account was created. Set a longer value and redeploy.",
    "owner_password_generated":
        "FSL_OWNER_PASSWORD is not set; a one-time owner password was generated "
        "(printed once below).",
    "owner_bootstrap_failed":
        "owner account bootstrap failed unexpectedly; see the error above.",
    "data_dir_unwritable":
        "the data directory is not writable; using temporary storage "
        "(data is lost on restart).",
}


def describe_notice(code: str) -> str:
    return _NOTICE_LOG.get(code, code)


def init_platform(sync_tools: bool = True) -> dict:
    cfg = get_config()
    get_db()  # creates schema
    notices: list[str] = []
    if cfg.data_dir_fallback:
        notices.append("data_dir_unwritable")

    try:
        boot = auth.bootstrap_owner()
    except Exception as e:  # never let owner setup take the service down
        print(f"[setup] owner bootstrap error: {type(e).__name__}: {e}", file=sys.stderr)
        boot = {"email": cfg.owner_email, "created": False, "generated": False,
                "password": None, "notices": ["owner_bootstrap_failed"]}
    notices += [n for n in boot.get("notices", []) if n not in notices]

    seeded = store.seed_catalog(cfg.seed_catalog_path)
    # Tool probing is slow on small instances; the server defers it until after
    # the port is bound (sync_tools=False) so health checks pass quickly.
    reg = sync_registry() if sync_tools else []

    SETUP_NOTICES[:] = notices
    return {
        "owner_bootstrap": boot,          # includes a generated password ONCE if created
        "catalog_seeded": seeded,
        "connectors": reg,
        "ai_available": cfg.ai.available,
        "setup_notices": notices,
    }
