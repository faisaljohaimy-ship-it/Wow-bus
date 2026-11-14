"""One-call platform initialization: config, db schema, owner, catalog, tools."""
from __future__ import annotations

from . import auth, store
from .config import get_config
from .connectors import sync_registry
from .db import get_db


def init_platform() -> dict:
    cfg = get_config()
    get_db()  # creates schema
    boot = auth.bootstrap_owner()
    seeded = store.seed_catalog(cfg.seed_catalog_path)
    reg = sync_registry()
    return {
        "owner_bootstrap": boot,          # includes a generated password ONCE if created
        "catalog_seeded": seeded,
        "connectors": reg,
        "ai_available": cfg.ai.available,
    }
