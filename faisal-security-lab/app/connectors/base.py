"""Connector contract + the hardened, bounded, no-shell subprocess runner."""
from __future__ import annotations

import os
import resource
import shutil
import signal
import subprocess
import threading
import time
from dataclasses import dataclass, field
from pathlib import Path

from ..config import Limits, get_config
from ..errors import ConfigError, TimeoutError_, ToolUnavailable


# ---------------------------------------------------------------------------
# Execution context + result objects
# ---------------------------------------------------------------------------
@dataclass
class EvidenceArtifact:
    name: str
    kind: str                      # raw|normalized|tool-meta|report
    text: str = ""                 # redaction happens in the evidence store
    content_type: str = "text/plain"


@dataclass
class RawFinding:
    rule_id: str
    title: str
    severity: str = "info"         # info|low|medium|high|critical
    confidence: str = "medium"     # low|medium|high
    location: dict = field(default_factory=dict)
    description: str = ""
    remediation: str = ""
    cve: str = ""
    cwe: str = ""
    cvss: dict = field(default_factory=dict)
    tags: list = field(default_factory=list)
    fingerprint: str = ""          # connector-stable id for dedup within a tool


@dataclass
class ConnectorResult:
    status: str                    # succeeded|succeeded_no_findings|failed|unsupported|partial
    findings: list = field(default_factory=list)       # list[RawFinding]
    evidence: list = field(default_factory=list)        # list[EvidenceArtifact]
    summary: dict = field(default_factory=dict)
    coverage: str = ""             # human note on what was / was not covered
    partial: bool = False


@dataclass
class ExecContext:
    params: dict
    asset: dict
    scope: dict
    workdir: Path
    input_dir: Path                # read-only inputs (cloned source, uploaded file)
    stop_event: threading.Event
    allow_private: bool = False
    limits: Limits = field(default_factory=lambda: get_config().limits)
    logs: list = field(default_factory=list)

    def log(self, msg: str) -> None:
        self.logs.append(msg)

    def cancelled(self) -> bool:
        return self.stop_event.is_set()


# ---------------------------------------------------------------------------
# The connector base class
# ---------------------------------------------------------------------------
class Connector:
    name: str = ""
    category: str = ""
    source: str = ""               # official upstream repo / source
    license: str = ""
    connector_type: str = "cli"    # cli|network|api|source
    binary: str | None = None      # resolved on PATH for cli connectors
    secret_refs: list = []
    egress: list = []              # external hosts this connector may contact

    # capabilities(): active=True means it sends traffic to / mutates the target
    # (so it is gated harder by policy); passive=True reads only.
    def capabilities(self) -> dict:
        return {"active": False, "passive": True, "needs_source": False,
                "needs_network": False}

    def validate_config(self, params: dict) -> dict:
        """Return normalized params or raise ConfigError. Default: passthrough."""
        return dict(params or {})

    def readiness(self) -> dict:
        """Report install + version + ready. Default resolves self.binary."""
        if self.connector_type in ("network", "api") and not self.binary:
            return {"installed": True, "available": True, "version": "stdlib",
                    "detail": "no external binary required"}
        if not self.binary:
            return {"installed": False, "available": False, "version": None,
                    "detail": "no binary configured"}
        path = shutil.which(self.binary)
        if not path:
            return {"installed": False, "available": False, "version": None,
                    "detail": f"'{self.binary}' not found on PATH"}
        version = self._probe_version(path)
        return {"installed": True, "available": True, "version": version,
                "path": path, "detail": "resolved on PATH"}

    def _probe_version(self, path: str) -> str | None:
        # Disable telemetry / online version-checks that otherwise block
        # `--version` for several seconds when stdout is captured (Semgrep).
        env = dict(os.environ)
        env.update({"SEMGREP_ENABLE_VERSION_CHECK": "0", "SEMGREP_SEND_METRICS": "off",
                    "NO_COLOR": "1", "DO_NOT_TRACK": "1", "PYTHONWARNINGS": "ignore"})
        fallback = None
        for flag in ("--version", "version", "-V"):
            try:
                out = subprocess.run([path, flag], capture_output=True, timeout=10,
                                     text=True, check=False, stdin=subprocess.DEVNULL, env=env)
            except (subprocess.SubprocessError, OSError):
                continue
            text = (out.stdout or out.stderr or "").strip().splitlines()
            line = text[0][:120] if text else None
            if out.returncode == 0 and line:
                return line
            if fallback is None and line:
                fallback = line
        return fallback or "unknown"

    def execute(self, ctx: ExecContext) -> ConnectorResult:  # pragma: no cover - abstract
        raise NotImplementedError

    def verified_ref(self, readiness: dict | None = None) -> str:
        # Pass an already-computed readiness to avoid probing the tool twice.
        r = readiness if readiness is not None else self.readiness()
        return f"{self.name}@{r.get('version')}|connector={self.__class__.__name__}"


# ---------------------------------------------------------------------------
# The bounded subprocess runner — the single place a tool is actually launched.
# ---------------------------------------------------------------------------
def _preexec(cpu_seconds: int, address_space_mb: int, output_bytes: int):
    def apply():
        # New process group so cancellation kills the whole tree.
        os.setsid()
        try:
            resource.setrlimit(resource.RLIMIT_CPU, (cpu_seconds, cpu_seconds + 5))
        except (ValueError, OSError):
            pass
        # RLIMIT_AS only when explicitly enabled (0 = off). Capping virtual
        # address space breaks Semgrep/OCaml, Node and the JVM; cgroup --memory
        # on the containerised worker is the supported memory bound.
        if address_space_mb and address_space_mb > 0:
            try:
                mem = address_space_mb * 1024 * 1024
                resource.setrlimit(resource.RLIMIT_AS, (mem, mem))
            except (ValueError, OSError):
                pass
        try:
            resource.setrlimit(resource.RLIMIT_NOFILE, (1024, 1024))
        except (ValueError, OSError):
            pass
        try:
            fsize = max(output_bytes * 4, 64 * 1024 * 1024)
            resource.setrlimit(resource.RLIMIT_FSIZE, (fsize, fsize))
        except (ValueError, OSError):
            pass
        try:
            resource.setrlimit(resource.RLIMIT_NPROC, (256, 256))
        except (ValueError, OSError):
            pass
    return apply


@dataclass
class ToolRun:
    returncode: int | None
    stdout: bytes
    stderr: bytes
    timed_out: bool
    cancelled: bool
    duration: float
    truncated: bool


def run_tool(argv: list[str], *, ctx: ExecContext | None = None, cwd: Path | None = None,
             timeout: int | None = None, extra_env: dict | None = None,
             input_bytes: bytes | None = None,
             max_output: int | None = None) -> ToolRun:
    """Run an external tool with no shell, bounded resources, hard timeout and
    cooperative cancellation. argv[0] is resolved on PATH but NEVER built from
    user/model/scan text — connectors pass a fixed program name + validated args.
    """
    if not argv:
        raise ConfigError("empty argv")
    program = shutil.which(argv[0])
    if not program:
        raise ToolUnavailable(f"'{argv[0]}' is not installed in this environment")
    argv = [program] + list(argv[1:])

    limits = (ctx.limits if ctx else get_config().limits)
    timeout = timeout or limits.job_timeout_seconds
    max_output = max_output or limits.max_output_bytes

    # Minimal, explicit environment. Never inherit secrets.
    base_env = {
        "PATH": os.environ.get("PATH", "/usr/local/bin:/usr/bin:/bin"),
        "HOME": str(cwd or (ctx.workdir if ctx else Path.cwd())),
        "LANG": "C.UTF-8", "LC_ALL": "C.UTF-8",
        "PYTHONIOENCODING": "utf-8", "PYTHONDONTWRITEBYTECODE": "1",
        "NO_COLOR": "1", "TERM": "dumb",
        # Proxy CA so tools that must fetch official data can verify TLS.
        "SSL_CERT_FILE": os.environ.get("SSL_CERT_FILE", ""),
        "CURL_CA_BUNDLE": os.environ.get("CURL_CA_BUNDLE", ""),
    }
    if os.environ.get("HTTPS_PROXY"):
        base_env["HTTPS_PROXY"] = os.environ["HTTPS_PROXY"]
        base_env["HTTP_PROXY"] = os.environ.get("HTTP_PROXY", os.environ["HTTPS_PROXY"])
    if extra_env:
        base_env.update(extra_env)

    start = time.monotonic()
    proc = subprocess.Popen(
        argv, cwd=str(cwd or (ctx.workdir if ctx else None)),
        stdin=subprocess.PIPE if input_bytes is not None else subprocess.DEVNULL,
        stdout=subprocess.PIPE, stderr=subprocess.PIPE,
        env=base_env, shell=False,
        preexec_fn=_preexec(limits.job_cpu_seconds, limits.job_address_space_mb, max_output),
    )

    timed_out = {"v": False}
    cancelled = {"v": False}
    done = threading.Event()

    def _killer():
        # Poll for hard timeout or cooperative cancel; kill the whole group.
        deadline = start + timeout
        while not done.wait(0.25):
            if ctx is not None and ctx.stop_event.is_set():
                cancelled["v"] = True
                _terminate(proc)
                return
            if time.monotonic() > deadline:
                timed_out["v"] = True
                _terminate(proc)
                return

    killer = threading.Thread(target=_killer, daemon=True)
    killer.start()
    try:
        out, err = proc.communicate(input=input_bytes)
    finally:
        done.set()
        killer.join(timeout=2)

    truncated = False
    if len(out) > max_output:
        out = out[:max_output]
        truncated = True
    if len(err) > max_output:
        err = err[:max_output]

    return ToolRun(returncode=proc.returncode, stdout=out, stderr=err,
                   timed_out=timed_out["v"], cancelled=cancelled["v"],
                   duration=time.monotonic() - start, truncated=truncated)


def _terminate(proc: subprocess.Popen) -> None:
    try:
        os.killpg(os.getpgid(proc.pid), signal.SIGTERM)
    except (ProcessLookupError, PermissionError, OSError):
        try:
            proc.terminate()
        except OSError:
            return
    try:
        proc.wait(timeout=5)
    except subprocess.TimeoutExpired:
        try:
            os.killpg(os.getpgid(proc.pid), signal.SIGKILL)
        except (ProcessLookupError, PermissionError, OSError):
            try:
                proc.kill()
            except OSError:
                pass
