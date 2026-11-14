"""Environment-driven configuration. No secrets are ever hard-coded.

Every tunable comes from an environment variable with a safe default. Secret
material (the session signing key) is read from the environment or generated
once and persisted to a 0600 file inside the data directory — never committed.
"""
from __future__ import annotations

import os
import re
import secrets
import tempfile
import threading
from dataclasses import dataclass, field, asdict
from pathlib import Path


def _env(name: str, default: str) -> str:
    v = os.environ.get(name)
    return v if v is not None and v != "" else default


def _env_int(name: str, default: int) -> int:
    try:
        return int(os.environ.get(name, "") or default)
    except ValueError:
        return default


def _env_header_name(name: str) -> str:
    """An HTTP header name from the environment, or "" when unset or malformed."""
    value = os.environ.get(name, "").strip()
    return value if re.fullmatch(r"[A-Za-z0-9-]{1,64}", value) else ""


def _env_bool(name: str, default: bool) -> bool:
    v = os.environ.get(name)
    if v is None:
        return default
    return v.strip().lower() in ("1", "true", "yes", "on")


def _usable_dir(path: Path) -> bool:
    """True when the directory exists (or can be created) and is writable."""
    try:
        path.mkdir(parents=True, exist_ok=True)
        with tempfile.NamedTemporaryFile(dir=str(path)):
            pass
        return True
    except OSError:
        return False


# Temporary storage root used in place of a location that is not usable. It is
# created once per process so every Config.from_env() call resolves to the same
# directory (and therefore the same database and session secret).
_FALLBACK_DIR: Path | None = None
_FALLBACK_LOCK = threading.Lock()


def _fallback_dir() -> Path:
    global _FALLBACK_DIR
    with _FALLBACK_LOCK:
        if _FALLBACK_DIR is None:
            _FALLBACK_DIR = Path(tempfile.mkdtemp(prefix="fsl-data-")).resolve()
        return _FALLBACK_DIR


def reset_fallback_dir_for_tests() -> None:
    """Forget the cached temporary storage root; the next fallback makes a new one."""
    global _FALLBACK_DIR
    with _FALLBACK_LOCK:
        _FALLBACK_DIR = None


@dataclass(frozen=True)
class Limits:
    # Bounds applied to every job/connector run (defence in depth).
    job_timeout_seconds: int = 900
    job_cpu_seconds: int = 1200          # RLIMIT_CPU for the connector subprocess
    # Virtual address-space cap (RLIMIT_AS) in MB. 0 = DISABLED. Process-level
    # RLIMIT_AS breaks modern engines (Semgrep/OCaml, Node, JVM) because virtual
    # memory far exceeds resident memory, so the SUPPORTED memory-isolation path
    # is the containerised worker with a cgroup --memory limit (see deploy/).
    job_address_space_mb: int = 0
    max_output_bytes: int = 20 * 1024 * 1024
    max_evidence_bytes: int = 8 * 1024 * 1024
    max_request_bytes: int = 2 * 1024 * 1024
    max_upload_bytes: int = 50 * 1024 * 1024
    max_findings_per_job: int = 5000
    lease_visibility_seconds: int = 120  # a leased job must renew within this
    max_attempts: int = 3
    worker_concurrency: int = 2
    per_asset_concurrency: int = 1       # no overlapping scans on one asset
    network_connect_timeout: float = 6.0
    network_total_timeout: float = 25.0
    max_redirects: int = 0               # never auto-follow; verify each hop
    rate_limit_jobs_per_minute: int = 30
    ai_token_budget: int = 120_000
    ai_timeout_seconds: int = 60
    ai_cost_budget_usd: float = 2.0


@dataclass(frozen=True)
class AIConfig:
    provider: str = "none"               # none|openai-compatible|anthropic
    base_url: str = ""
    model: str = ""
    api_key_present: bool = False        # we never store the key on the object
    max_tokens: int = 4096
    temperature: float = 0.0

    @property
    def available(self) -> bool:
        return self.provider != "none" and self.api_key_present and bool(self.model)


@dataclass(frozen=True)
class Config:
    data_dir: Path
    db_path: Path
    evidence_dir: Path
    bind_host: str
    bind_port: int
    owner_email: str
    session_ttl_seconds: int
    secret_key: bytes
    environment: str                     # deployment hint: lab|staging|prod
    allow_active_in_prod: bool
    seed_catalog_path: Path
    limits: Limits = field(default_factory=Limits)
    ai: AIConfig = field(default_factory=AIConfig)
    # True when the data directory, the database location or the evidence
    # directory was not writable (for example a root-owned disk mounted for a
    # non-root process) and a location under temporary storage is
    # used instead. The service stays up and reports it rather than crashing.
    data_dir_fallback: bool = False
    # How the client address is taken from a reverse proxy. Both are off by
    # default, which means proxy headers are ignored and the socket peer is the
    # client. client_ip_header names a single header the proxy always
    # overwrites (for example CF-Connecting-IP); trusted_proxy_hops is the
    # number of proxies that each append one entry to X-Forwarded-For.
    client_ip_header: str = ""
    trusted_proxy_hops: int = 0

    @classmethod
    def from_env(cls) -> "Config":
        data_dir = Path(_env("FSL_DATA_DIR", str(Path(__file__).resolve().parent.parent / "var"))).resolve()
        data_dir_fallback = False
        if not _usable_dir(data_dir):
            data_dir = _fallback_dir()
            data_dir_fallback = True
        # Each location is checked on its own: an explicit FSL_EVIDENCE_DIR or
        # FSL_DB_PATH that is usable is kept even when the data directory is
        # not, and only an unusable one moves to temporary storage.
        evidence_dir = Path(_env("FSL_EVIDENCE_DIR", str(data_dir / "evidence"))).resolve()
        if not _usable_dir(evidence_dir):
            evidence_dir = _fallback_dir() / "evidence"
            evidence_dir.mkdir(parents=True, exist_ok=True)
            data_dir_fallback = True
        db_path = Path(_env("FSL_DB_PATH", str(data_dir / "faisal-security-lab.db"))).resolve()
        if not _usable_dir(db_path.parent):
            db_path = _fallback_dir() / "faisal-security-lab.db"
            data_dir_fallback = True
        try:
            evidence_dir.chmod(0o700)
        except OSError:
            pass

        secret_key = cls._load_or_create_secret(data_dir)

        limits = Limits(
            job_timeout_seconds=_env_int("FSL_JOB_TIMEOUT", Limits.job_timeout_seconds),
            job_cpu_seconds=_env_int("FSL_JOB_CPU_SECONDS", Limits.job_cpu_seconds),
            job_address_space_mb=_env_int("FSL_JOB_AS_MB", Limits.job_address_space_mb),
            worker_concurrency=_env_int("FSL_WORKER_CONCURRENCY", Limits.worker_concurrency),
        )

        ai_key = os.environ.get("FSL_AI_API_KEY", "")
        ai = AIConfig(
            provider=_env("FSL_AI_PROVIDER", "none"),
            base_url=_env("FSL_AI_BASE_URL", ""),
            model=_env("FSL_AI_MODEL", ""),
            api_key_present=bool(ai_key),
            max_tokens=_env_int("FSL_AI_MAX_TOKENS", 4096),
        )

        seed = Path(_env("FSL_SEED_CATALOG",
                         str(Path(__file__).resolve().parent.parent / "data" / "tool-catalog.seed.json")))

        return cls(
            data_dir=data_dir,
            db_path=db_path,
            evidence_dir=evidence_dir,
            bind_host=_env("FSL_BIND_HOST", "127.0.0.1"),
            # PaaS hosts (Render, Railway, Heroku, ...) inject $PORT and route to
            # it; honor that first so click-based deploys work with no config.
            bind_port=_env_int("PORT", _env_int("FSL_PORT", 8787)),
            owner_email=_env("FSL_OWNER_EMAIL", "owner@faisal-security-lab.local").strip().lower(),
            session_ttl_seconds=_env_int("FSL_SESSION_TTL", 60 * 60 * 12),
            secret_key=secret_key,
            environment=_env("FSL_ENVIRONMENT", "lab"),
            allow_active_in_prod=_env_bool("FSL_ALLOW_ACTIVE_IN_PROD", False),
            seed_catalog_path=seed,
            limits=limits,
            ai=ai,
            data_dir_fallback=data_dir_fallback,
            client_ip_header=_env_header_name("FSL_CLIENT_IP_HEADER"),
            trusted_proxy_hops=max(0, min(10, _env_int("FSL_TRUSTED_PROXY_HOPS", 0))),
        )

    @staticmethod
    def _load_or_create_secret(data_dir: Path) -> bytes:
        env_secret = os.environ.get("FSL_SECRET_KEY", "")
        if env_secret:
            return env_secret.encode("utf-8")
        key_file = data_dir / ".session-secret"
        if key_file.exists():
            return key_file.read_bytes()
        key = secrets.token_bytes(32)
        # 0600 so other users on the host cannot forge sessions.
        fd = os.open(str(key_file), os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
        with os.fdopen(fd, "wb") as fh:
            fh.write(key)
        return key

    def public_dict(self) -> dict:
        """Safe-to-expose view (never includes the secret key)."""
        d = {
            "version_data_dir": str(self.data_dir),
            "bind": f"{self.bind_host}:{self.bind_port}",
            "environment": self.environment,
            "allow_active_in_prod": self.allow_active_in_prod,
            "owner_email": self.owner_email,
            "ai": {"provider": self.ai.provider, "model": self.ai.model,
                   "available": self.ai.available},
            "limits": asdict(self.limits),
        }
        return d


_CONFIG: Config | None = None


def get_config() -> Config:
    global _CONFIG
    if _CONFIG is None:
        _CONFIG = Config.from_env()
    return _CONFIG


def reset_config_for_tests(cfg: Config) -> None:
    global _CONFIG
    _CONFIG = cfg
