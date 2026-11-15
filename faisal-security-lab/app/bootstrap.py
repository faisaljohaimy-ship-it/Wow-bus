"""One-call platform initialization: config, db schema, owner, catalog, tools.

Initialization never raises on operator misconfiguration (a short owner
password, a malformed owner email, an unwritable data directory). Problems are
collected as stable notice codes and logged in one line each, so a hosted
deploy stays up and explains itself. SETUP_NOTICES holds the codes the sign-in
page may show to anyone; ADMIN_NOTICES holds all of them, including the ones in
PRIVATE_NOTICE_CODES that only a signed-in owner or admin gets to see.
"""
from __future__ import annotations

import os
import sys

from . import auth, store
from .config import get_config
from .connectors import sync_registry
from .db import get_db

# Codes describing setup problems found at startup (no secrets).
SETUP_NOTICES: list[str] = []     # public: served by the unauthenticated /api/config
ADMIN_NOTICES: list[str] = []     # every code: served to owners and admins by /api/me
# Codes that describe the host rather than something a visitor has to work
# around; they would only help someone probing the service.
PRIVATE_NOTICE_CODES = frozenset({"running_as_root"})

_NOTICE_LOG = {
    "owner_email_invalid":
        "FSL_OWNER_EMAIL is not a valid email; using the default "
        f"'{auth.DEFAULT_OWNER_EMAIL}' as the owner sign-in.",
    "owner_email_ignored":
        "FSL_OWNER_EMAIL is not a valid email and was ignored; existing owner "
        "accounts are unchanged.",
    "owner_password_too_short":
        f"FSL_OWNER_PASSWORD is shorter than {auth.MIN_PASSWORD_LENGTH} characters; "
        "NO owner account was created. Set a longer value and redeploy.",
    "owner_password_generated":
        "FSL_OWNER_PASSWORD is not set; an owner password was generated. It is "
        "shown once, in the start-up log, and stays the owner's password.",
    "owner_bootstrap_failed":
        "owner account bootstrap failed unexpectedly; see the error above.",
    "data_dir_unwritable":
        "the data directory, or the location set in FSL_DB_PATH or "
        "FSL_EVIDENCE_DIR, is not writable; temporary storage is used in its "
        "place (what is kept there is lost on restart).",
    "running_as_root":
        "the container could not drop root privileges; the service and its scan "
        "tools are running as root.",
    "public_view_unrecognized":
        "FSL_PUBLIC_VIEW is set to a value that is not understood, so the public "
        "view is off; use 1 to turn it on or 0 to turn it off.",
    # Recorded by app/demo.py after startup (not by init_platform).
    "demo_sample_missing":
        "FSL_PUBLIC_VIEW is on but the bundled samples/vulnerable-app directory "
        "is missing, so no public demo project was created.",
}


def describe_notice(code: str) -> str:
    return _NOTICE_LOG.get(code, code)


def init_platform(sync_tools: bool = True, *, create_owner: bool = True) -> dict:
    """Prepare the database, the owner account, the catalog and the tool registry.

    create_owner=False leaves the accounts alone. It is for commands that only
    inspect the installation (scripts/verify.py): a generated owner password is
    shown once, by the caller that created the account, so a command that does
    not show it must not be the one that creates the account.
    """
    cfg = get_config()
    get_db()  # creates schema
    notices: list[str] = []
    if cfg.data_dir_fallback:
        notices.append("data_dir_unwritable")
    if cfg.public_view_unrecognized:
        notices.append("public_view_unrecognized")
    # The container entrypoint sets FSL_PRIVDROP_FAILED=1 when it had to keep
    # running as root; a deliberate root run outside the container is not flagged.
    if (os.environ.get("FSL_PRIVDROP_FAILED") == "1"
            and hasattr(os, "geteuid") and os.geteuid() == 0):
        notices.append("running_as_root")

    if create_owner:
        try:
            boot = auth.bootstrap_owner()
        except Exception as e:  # never let owner setup take the service down
            print(f"[setup] owner bootstrap error: {type(e).__name__}: {e}", file=sys.stderr)
            boot = {"email": cfg.owner_email, "created": False, "generated": False,
                    "password": None, "notices": ["owner_bootstrap_failed"]}
    else:
        boot = {"email": None, "created": False, "generated": False,
                "password": None, "notices": [], "skipped": True}
    notices += [n for n in boot.get("notices", []) if n not in notices]

    seeded = store.seed_catalog(cfg.seed_catalog_path)
    # Tool probing is slow on small instances; the server defers it until after
    # the port is bound (sync_tools=False) so health checks pass quickly.
    reg = sync_registry() if sync_tools else []

    ADMIN_NOTICES[:] = notices
    SETUP_NOTICES[:] = [n for n in notices if n not in PRIVATE_NOTICE_CODES]
    return {
        "owner_bootstrap": boot,          # a generated password is in it only on the call that made it
        "catalog_seeded": seeded,
        "connectors": reg,
        "ai_available": cfg.ai.available,
        "setup_notices": notices,
    }
