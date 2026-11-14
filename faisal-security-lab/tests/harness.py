"""Shared test harness: a fresh, isolated platform per test."""
from __future__ import annotations

import os
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
SAMPLE = ROOT / "samples" / "vulnerable-app"


def fresh_platform():
    """Create an isolated config+db in a temp dir and bootstrap it."""
    tmp = Path(tempfile.mkdtemp(prefix="fsl-test-"))
    os.environ["FSL_DATA_DIR"] = str(tmp)
    os.environ["FSL_DB_PATH"] = str(tmp / "test.db")
    os.environ["FSL_EVIDENCE_DIR"] = str(tmp / "evidence")
    os.environ["FSL_OWNER_EMAIL"] = "owner@test.local"
    os.environ["FSL_OWNER_PASSWORD"] = "owner-password-123"
    os.environ.pop("FSL_AI_PROVIDER", None)
    os.environ.pop("FSL_AI_API_KEY", None)

    from app.config import Config, reset_config_for_tests
    from app.db import Database, reset_db_for_tests
    cfg = Config.from_env()
    reset_config_for_tests(cfg)
    db = Database(cfg.db_path)
    reset_db_for_tests(db)

    from app.bootstrap import init_platform
    info = init_platform()
    return cfg, db, info


def owner_principal():
    from app import auth
    from app.config import get_config
    out = auth.login(get_config().owner_email, "owner-password-123")
    return auth.principal_from_token(out["token"]), out


def make_project_with_source_scope(principal, scan_types):
    from app import store
    p = store.create_project("T", principal.user_id)
    a = store.create_asset(p["id"], "source", str(SAMPLE), created_by=principal.user_id,
                           metadata={"local_path": str(SAMPLE)}, criticality="high")
    s = store.create_scope(p["id"], a["id"], proof="LAB-SELF-OWNED",
                           allowed_targets=[str(SAMPLE)], scan_types=scan_types,
                           created_by=principal.user_id)
    return p, a, s


def run_all_jobs(limit=30):
    from app.worker import Worker
    w = Worker(worker_id="test")
    n = 0
    while w.run_once() and n < limit:
        n += 1
    return n
