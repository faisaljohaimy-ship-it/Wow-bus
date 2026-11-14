"""SQLite persistence layer (standard library only).

One database file holds projects, members, assets, authorization scopes, the
job queue, findings, evidence metadata, the tool registry, sessions, users and
an append-only audit log. WAL mode + busy_timeout keep the API host and the
worker process(es) able to share the file safely.
"""
from __future__ import annotations

import sqlite3
import threading
from contextlib import contextmanager
from pathlib import Path

SCHEMA_VERSION = 3

SCHEMA = """
CREATE TABLE IF NOT EXISTS meta (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS users (
    id            TEXT PRIMARY KEY,
    email         TEXT UNIQUE NOT NULL,
    display_name  TEXT NOT NULL DEFAULT '',
    password_hash TEXT NOT NULL,
    global_role   TEXT NOT NULL DEFAULT 'reader',   -- owner|admin|analyst|reader
    active        INTEGER NOT NULL DEFAULT 1,
    created_at    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY,
    user_id    TEXT NOT NULL,
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS projects (
    id         TEXT PRIMARY KEY,
    name       TEXT NOT NULL,
    owner_id   TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (owner_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS project_members (
    project_id TEXT NOT NULL,
    user_id    TEXT NOT NULL,
    role       TEXT NOT NULL DEFAULT 'reader',       -- admin|analyst|reader within project
    created_at TEXT NOT NULL,
    PRIMARY KEY (project_id, user_id),
    FOREIGN KEY (project_id) REFERENCES projects(id),
    FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS assets (
    id          TEXT PRIMARY KEY,
    project_id  TEXT NOT NULL,
    kind        TEXT NOT NULL,                        -- repo|web|api|container|host|source
    identifier  TEXT NOT NULL,                        -- url, repo path, image ref, hostname
    label       TEXT NOT NULL DEFAULT '',
    criticality TEXT NOT NULL DEFAULT 'medium',       -- low|medium|high|critical
    metadata    TEXT NOT NULL DEFAULT '{}',
    created_by  TEXT NOT NULL,
    created_at  TEXT NOT NULL,
    FOREIGN KEY (project_id) REFERENCES projects(id)
);

-- Authorization scope: the enforceable permission to test an asset.
CREATE TABLE IF NOT EXISTS scopes (
    id             TEXT PRIMARY KEY,
    project_id     TEXT NOT NULL,
    asset_id       TEXT NOT NULL,
    owner_contact  TEXT NOT NULL DEFAULT '',
    proof          TEXT NOT NULL DEFAULT '',          -- reference to authorization proof
    environment    TEXT NOT NULL DEFAULT 'lab',       -- lab|staging|prod
    allowed_targets TEXT NOT NULL DEFAULT '[]',       -- JSON: exact hosts/paths/repos allowed
    denied_targets  TEXT NOT NULL DEFAULT '[]',       -- JSON: explicit exclusions
    allowed_ports   TEXT NOT NULL DEFAULT '[]',       -- JSON ints
    scan_types      TEXT NOT NULL DEFAULT '[]',       -- JSON: connector names permitted
    valid_from     TEXT,
    valid_until    TEXT,
    window         TEXT NOT NULL DEFAULT '{}',        -- JSON: allowed run window of day
    rate_limits    TEXT NOT NULL DEFAULT '{}',        -- JSON: per-scope overrides
    status         TEXT NOT NULL DEFAULT 'active',    -- active|revoked
    created_by     TEXT NOT NULL,
    created_at     TEXT NOT NULL,
    revoked_at     TEXT,
    FOREIGN KEY (project_id) REFERENCES projects(id),
    FOREIGN KEY (asset_id) REFERENCES assets(id)
);

CREATE TABLE IF NOT EXISTS jobs (
    id               TEXT PRIMARY KEY,
    project_id       TEXT NOT NULL,
    asset_id         TEXT NOT NULL,
    scope_id         TEXT NOT NULL,
    connector        TEXT NOT NULL,
    params           TEXT NOT NULL DEFAULT '{}',
    state            TEXT NOT NULL DEFAULT 'queued',  -- queued|leased|running|succeeded|failed|blocked|cancelled|undetermined
    phase            TEXT NOT NULL DEFAULT 'queued',
    progress         REAL NOT NULL DEFAULT 0.0,
    idempotency_key  TEXT,
    priority         INTEGER NOT NULL DEFAULT 5,       -- lower = sooner
    attempts         INTEGER NOT NULL DEFAULT 0,
    max_attempts     INTEGER NOT NULL DEFAULT 3,
    lease_owner      TEXT,
    lease_expires_at TEXT,
    stop_requested   INTEGER NOT NULL DEFAULT 0,
    result_summary   TEXT NOT NULL DEFAULT '{}',
    error            TEXT,
    created_by       TEXT NOT NULL,
    created_at       TEXT NOT NULL,
    started_at       TEXT,
    finished_at      TEXT,
    FOREIGN KEY (project_id) REFERENCES projects(id),
    FOREIGN KEY (asset_id) REFERENCES assets(id),
    FOREIGN KEY (scope_id) REFERENCES scopes(id)
);
CREATE INDEX IF NOT EXISTS idx_jobs_state ON jobs(state, priority, created_at);
CREATE INDEX IF NOT EXISTS idx_jobs_project ON jobs(project_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_jobs_idem ON jobs(idempotency_key) WHERE idempotency_key IS NOT NULL;

CREATE TABLE IF NOT EXISTS findings (
    id                 TEXT PRIMARY KEY,
    project_id         TEXT NOT NULL,
    asset_id           TEXT NOT NULL,
    job_id             TEXT NOT NULL,
    connector          TEXT NOT NULL,
    tool_version       TEXT NOT NULL DEFAULT '',
    rule_id            TEXT NOT NULL DEFAULT '',
    title              TEXT NOT NULL,
    location           TEXT NOT NULL DEFAULT '{}',    -- JSON {file,line,url,package,...}
    severity           TEXT NOT NULL DEFAULT 'info',  -- info|low|medium|high|critical
    confidence         TEXT NOT NULL DEFAULT 'medium',
    verification_status TEXT NOT NULL DEFAULT 'needs_verification',
    status             TEXT NOT NULL DEFAULT 'open',  -- open|false_positive|risk_accepted|fixed_in_branch|fixed_on_asset|reopened
    work_priority      INTEGER NOT NULL DEFAULT 50,   -- 0..100 computed
    cve                TEXT NOT NULL DEFAULT '',
    cwe                TEXT NOT NULL DEFAULT '',
    cvss               TEXT NOT NULL DEFAULT '{}',    -- JSON {score,vector,source,date}
    epss               TEXT NOT NULL DEFAULT '{}',
    kev                TEXT NOT NULL DEFAULT '{}',
    remediation        TEXT NOT NULL DEFAULT '',
    description        TEXT NOT NULL DEFAULT '',
    dedup_key          TEXT NOT NULL,
    occurrences        INTEGER NOT NULL DEFAULT 1,
    reopened           INTEGER NOT NULL DEFAULT 0,
    source_flag        TEXT NOT NULL DEFAULT 'real',  -- real|simulated
    created_at         TEXT NOT NULL,
    updated_at         TEXT NOT NULL,
    FOREIGN KEY (project_id) REFERENCES projects(id),
    FOREIGN KEY (job_id) REFERENCES jobs(id)
);
CREATE INDEX IF NOT EXISTS idx_findings_project ON findings(project_id, severity);
CREATE UNIQUE INDEX IF NOT EXISTS idx_findings_dedup ON findings(project_id, dedup_key);

CREATE TABLE IF NOT EXISTS evidence (
    id             TEXT PRIMARY KEY,
    project_id     TEXT NOT NULL,
    job_id         TEXT,
    finding_id     TEXT,
    kind           TEXT NOT NULL,                     -- raw|normalized|report|tool-meta
    sha256         TEXT NOT NULL,
    bytes          INTEGER NOT NULL DEFAULT 0,
    redacted_summary TEXT NOT NULL DEFAULT '',
    storage_ref    TEXT NOT NULL DEFAULT '',          -- relative path under evidence dir
    access_policy  TEXT NOT NULL DEFAULT 'restricted',
    retention_until TEXT,
    created_at     TEXT NOT NULL,
    FOREIGN KEY (project_id) REFERENCES projects(id)
);
CREATE INDEX IF NOT EXISTS idx_evidence_job ON evidence(job_id);
CREATE INDEX IF NOT EXISTS idx_evidence_finding ON evidence(finding_id);

CREATE TABLE IF NOT EXISTS tool_registry (
    name          TEXT PRIMARY KEY,
    category      TEXT NOT NULL DEFAULT '',
    source        TEXT NOT NULL DEFAULT '',           -- upstream repo / official source
    license       TEXT NOT NULL DEFAULT '',
    version       TEXT NOT NULL DEFAULT '',
    connector_type TEXT NOT NULL DEFAULT 'cli',       -- cli|api|network|source
    platforms     TEXT NOT NULL DEFAULT '[]',
    requirements  TEXT NOT NULL DEFAULT '{}',
    permissions   TEXT NOT NULL DEFAULT '[]',
    egress        TEXT NOT NULL DEFAULT '[]',
    cost          TEXT NOT NULL DEFAULT 'free',
    secret_refs   TEXT NOT NULL DEFAULT '[]',
    state         TEXT NOT NULL DEFAULT 'catalog',    -- catalog|installed|configured|ready|verified|disabled|blocked|stale
    readiness     TEXT NOT NULL DEFAULT '{}',         -- JSON last readiness result
    last_verified_at TEXT,
    last_verified_ref TEXT NOT NULL DEFAULT '',       -- version+connector+config hash that was verified
    updated_at    TEXT NOT NULL
);

-- Raw catalog of security tools (the broad coverage target). Distinct from the
-- subset that has working connectors in tool_registry.
CREATE TABLE IF NOT EXISTS catalog (
    repo        TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    category    TEXT NOT NULL DEFAULT '',
    description TEXT NOT NULL DEFAULT '',
    year        INTEGER,
    archived    INTEGER NOT NULL DEFAULT 0,
    integration_state TEXT NOT NULL DEFAULT 'cataloged',  -- cataloged|connector_available|unsupported
    unsupported_reason TEXT NOT NULL DEFAULT '',
    updated_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS audit (
    id          TEXT PRIMARY KEY,
    actor       TEXT NOT NULL DEFAULT 'system',
    actor_role  TEXT NOT NULL DEFAULT '',
    action      TEXT NOT NULL,
    project_id  TEXT,
    target      TEXT NOT NULL DEFAULT '',
    outcome     TEXT NOT NULL DEFAULT 'ok',           -- ok|denied|error
    detail      TEXT NOT NULL DEFAULT '{}',           -- JSON, redacted
    created_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_audit_project ON audit(project_id, created_at);

CREATE TABLE IF NOT EXISTS settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS schedules (
    id          TEXT PRIMARY KEY,
    project_id  TEXT NOT NULL,
    asset_id    TEXT NOT NULL,
    scope_id    TEXT NOT NULL,
    connector   TEXT NOT NULL,
    params      TEXT NOT NULL DEFAULT '{}',
    cadence     TEXT NOT NULL DEFAULT 'daily',
    window      TEXT NOT NULL DEFAULT '{}',
    enabled     INTEGER NOT NULL DEFAULT 1,
    last_run_at TEXT,
    next_run_at TEXT,
    created_by  TEXT NOT NULL,
    created_at  TEXT NOT NULL
);
"""


class Database:
    def __init__(self, path: Path):
        self.path = Path(path)
        self._local = threading.local()
        self._init_lock = threading.Lock()
        self.init_schema()

    def _connect(self) -> sqlite3.Connection:
        conn = sqlite3.connect(str(self.path), timeout=30, isolation_level=None,
                               check_same_thread=False)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA journal_mode=WAL;")
        conn.execute("PRAGMA busy_timeout=30000;")
        conn.execute("PRAGMA foreign_keys=ON;")
        conn.execute("PRAGMA synchronous=NORMAL;")
        return conn

    @property
    def conn(self) -> sqlite3.Connection:
        c = getattr(self._local, "conn", None)
        if c is None:
            c = self._connect()
            self._local.conn = c
        return c

    def init_schema(self) -> None:
        with self._init_lock:
            c = self.conn
            c.executescript(SCHEMA)
            row = c.execute("SELECT value FROM meta WHERE key='schema_version'").fetchone()
            if row is None:
                c.execute("INSERT INTO meta(key,value) VALUES('schema_version',?)",
                          (str(SCHEMA_VERSION),))

    @contextmanager
    def tx(self):
        """A transaction. isolation_level=None means we drive BEGIN/COMMIT."""
        c = self.conn
        c.execute("BEGIN IMMEDIATE;")
        try:
            yield c
            c.execute("COMMIT;")
        except Exception:
            c.execute("ROLLBACK;")
            raise

    def execute(self, sql: str, params: tuple = ()):  # convenience
        return self.conn.execute(sql, params)

    def query_one(self, sql: str, params: tuple = ()):
        row = self.conn.execute(sql, params).fetchone()
        return dict(row) if row else None

    def query_all(self, sql: str, params: tuple = ()):
        return [dict(r) for r in self.conn.execute(sql, params).fetchall()]

    # --- settings helpers (used for global stop flag etc.) ---
    def get_setting(self, key: str, default: str = "") -> str:
        row = self.query_one("SELECT value FROM settings WHERE key=?", (key,))
        return row["value"] if row else default

    def set_setting(self, key: str, value: str) -> None:
        self.conn.execute(
            "INSERT INTO settings(key,value) VALUES(?,?) "
            "ON CONFLICT(key) DO UPDATE SET value=excluded.value", (key, value))


_DB: Database | None = None


def get_db(path: Path | None = None) -> Database:
    global _DB
    if _DB is None:
        if path is None:
            from .config import get_config
            path = get_config().db_path
        _DB = Database(path)
    return _DB


def reset_db_for_tests(db: Database) -> None:
    global _DB
    _DB = db
