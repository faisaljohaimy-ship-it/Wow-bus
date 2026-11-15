"""Scan worker.

Leases a job, stages read-only input, RE-CHECKS POLICY at execution time,
runs the connector under bounded isolation with lease renewal + cooperative
cancel, then persists evidence and normalized findings. Runnable in-process
(threads) or as a separate process (`python -m app.worker`) for stronger
isolation from the API host.
"""
from __future__ import annotations

import os
import shutil
import stat
import tempfile
import threading
import time
from pathlib import Path

from . import audit, evidence, findings as findings_mod, queue, scope as scope_mod, store, util
from .config import get_config
from .connectors import get_connector
from .connectors.base import ExecContext, run_tool
from .errors import AppError, PolicyDenied, ToolUnavailable, TimeoutError_, ConnectorError
from .policy import evaluate_job

# Directories we never copy into a scan sandbox (bound size, avoid noise).
_IGNORE = {".git", "node_modules", ".venv", "venv", "__pycache__", ".mypy_cache",
           ".pytest_cache", "dist", "build", ".next", ".terraform"}
_MAX_SOURCE_BYTES = 200 * 1024 * 1024


def _open_real_dir(real: str) -> int:
    """Open the directory at `real`, an absolute real path that has passed the
    scope check, and return a descriptor to read it by. Raises OSError.

    The path is walked from the root one name at a time and no symbolic link
    is followed at any step. A link put in place of the directory, or of a
    directory above it, after the check makes the open fail, so the directory
    that is read is the one at the path that was checked.
    """
    # O_PATH (Linux) only passes through a directory; it needs no permission
    # to list it, as walking a path does not.
    step = os.O_DIRECTORY | os.O_NOFOLLOW | getattr(os, "O_PATH", os.O_RDONLY)
    fd = os.open(os.sep, step)
    try:
        for name in Path(real).parts[1:]:
            below = os.open(name, step, dir_fd=fd)
            os.close(fd)
            fd = below
        return os.open(".", os.O_RDONLY | os.O_DIRECTORY, dir_fd=fd)
    finally:
        os.close(fd)


def _is_dir_at(fd: int, real: str) -> bool:
    """True when the open directory `fd` is the directory that stands at the
    path `real` now (and that path is not a symbolic link)."""
    try:
        return os.path.samestat(os.fstat(fd), os.lstat(real))
    except OSError:
        return False


def _changed_since_check(real: str) -> PolicyDenied:
    return PolicyDenied("source directory changed after it was checked", detail={"target": real})


def _copy_open_file(fd: int, info: os.stat_result, target: Path) -> None:
    """Write the contents of the open regular file `fd` to `target` and give
    the copy the file's permission bits and times."""
    with open(fd, "rb", closefd=False) as source, open(target, "wb") as out:
        shutil.copyfileobj(source, out)
    os.chmod(target, stat.S_IMODE(info.st_mode))
    os.utime(target, ns=(info.st_atime_ns, info.st_mtime_ns))


class Worker:
    def __init__(self, worker_id: str | None = None, connectors: list[str] | None = None):
        self.worker_id = worker_id or f"worker-{os.getpid()}-{util.token()[:6]}"
        self.connectors = connectors
        self._stop = threading.Event()

    def stop(self):
        self._stop.set()

    def run_forever(self, idle_sleep: float = 1.0):
        while not self._stop.is_set():
            try:
                queue.reclaim_expired()
                did = self.run_once()
            except Exception as e:  # never let the loop die
                audit.record("worker.loop_error", actor=self.worker_id, outcome="error",
                             detail={"error": str(e)})
                did = False
            if not did:
                self._stop.wait(idle_sleep)

    def run_once(self) -> bool:
        job = queue.claim_next(self.worker_id, self.connectors)
        if not job:
            return False
        self.process(job)
        return True

    # ------------------------------------------------------------------
    def process(self, job: dict) -> None:
        jid = job["id"]
        try:
            project = store.get_project(job["project_id"])
            asset = store.get_asset(job["asset_id"])
            scope = store.get_scope(job["scope_id"])
            connector = get_connector(job["connector"])
            if connector is None:
                queue.complete(jid, "blocked",
                               error={"code": "unknown_connector",
                                      "message": f"no connector '{job['connector']}'"})
                return

            # 1. RE-CHECK POLICY AT EXECUTION TIME (scope may have been revoked).
            decision = evaluate_job(principal=None, project=project, asset=asset, scope=scope,
                                    connector=connector, params=job["params"])
            if not decision.allow:
                queue.complete(jid, "blocked",
                               error={"code": decision.code, "message": decision.reason})
                audit.record("job.blocked", actor=self.worker_id, project_id=project["id"],
                             target=jid, outcome="denied",
                             detail={"reason": decision.reason, "code": decision.code,
                                     **decision.detail})
                return

            # 2. Readiness: the tool must actually be available.
            readiness = connector.readiness()
            if not readiness.get("available"):
                queue.complete(jid, "blocked",
                               error={"code": "tool_unavailable",
                                      "message": readiness.get("detail", "tool not ready")})
                return

            queue.mark_running(jid, self.worker_id, phase="preparing")

            with tempfile.TemporaryDirectory(prefix="fsl-job-") as tmp:
                workdir = Path(tmp) / "work"
                input_dir = Path(tmp) / "input"
                workdir.mkdir()
                input_dir.mkdir()
                try:
                    os.chmod(workdir, 0o700)
                    os.chmod(input_dir, 0o700)
                except OSError:
                    pass

                caps = connector.capabilities()
                if caps.get("needs_source"):
                    self._stage_source(job, asset, scope, input_dir)

                ctx = ExecContext(
                    params=connector.validate_config(job["params"]),
                    asset=asset, scope=scope, workdir=workdir, input_dir=input_dir,
                    stop_event=threading.Event(),
                    allow_private=bool(asset.get("metadata", {}).get("internal")),
                    limits=get_config().limits)

                queue.update_progress(jid, 0.25, phase="running")
                result = self._run_with_supervision(jid, connector, ctx)

            # 3. Persist evidence + findings.
            self._finalize(jid, job, asset, connector, readiness, result)

        except PolicyDenied as e:
            queue.complete(jid, "blocked", error={"code": e.code, "message": e.message})
        except ToolUnavailable as e:
            queue.complete(jid, "blocked", error={"code": e.code, "message": e.message})
        except (TimeoutError_, ConnectorError) as e:
            self._handle_retryable(jid, job, e)
        except AppError as e:
            queue.complete(jid, "failed", error={"code": e.code, "message": e.message})
        except Exception as e:  # unexpected
            queue.complete(jid, "failed", error={"code": "worker_error", "message": str(e)[:500]})
            audit.record("job.error", actor=self.worker_id, project_id=job["project_id"],
                         target=jid, outcome="error", detail={"error": str(e)[:500]})

    # ------------------------------------------------------------------
    def _run_with_supervision(self, jid: str, connector, ctx: ExecContext):
        """Run connector.execute in a thread; renew lease + watch for stop/global
        stop; enforce an overall wall-clock backstop."""
        result_box: dict = {}
        error_box: dict = {}

        def _target():
            try:
                result_box["r"] = connector.execute(ctx)
            except Exception as e:  # propagated to caller
                error_box["e"] = e

        th = threading.Thread(target=_target, daemon=True)
        th.start()
        limits = get_config().limits
        deadline = time.monotonic() + limits.job_timeout_seconds + 30
        renew_every = max(5, limits.lease_visibility_seconds // 3)
        last_renew = 0.0
        from .db import get_db
        while th.is_alive():
            th.join(timeout=1.0)
            now = time.monotonic()
            if now - last_renew > renew_every:
                if not queue.renew_lease(jid, self.worker_id):
                    ctx.stop_event.set()  # we lost the lease; abort
                last_renew = now
            # Cooperative cancel: stop_requested or global stop.
            row = get_db().query_one("SELECT stop_requested FROM jobs WHERE id=?", (jid,))
            if row and row.get("stop_requested"):
                ctx.stop_event.set()
            from .policy import global_stop_engaged
            if global_stop_engaged():
                ctx.stop_event.set()
            if now > deadline:
                ctx.stop_event.set()
        th.join(timeout=5)
        if "e" in error_box:
            raise error_box["e"]
        return result_box.get("r")

    # ------------------------------------------------------------------
    def _finalize(self, jid, job, asset, connector, readiness, result):
        from .db import get_db
        if result is None:
            # Cancelled before producing output.
            row = get_db().query_one(
                "SELECT stop_requested FROM jobs WHERE id=?", (jid,))
            state = "cancelled" if (row and row.get("stop_requested")) else "failed"
            queue.complete(jid, state, error={"code": state, "message": "no result produced"})
            return

        tool_version = readiness.get("version") or ""
        # Evidence first (so a finding can reference the job's evidence).
        for art in result.evidence:
            try:
                evidence.store_artifact(job["project_id"], art, job_id=jid)
            except Exception:
                pass

        counts = {"created": 0, "updated": 0, "reopened": 0}
        if result.findings:
            counts = findings_mod.ingest(job, asset, result.findings, tool_version=tool_version)

        outcome = result.status
        summary = {"outcome": outcome, "tool_version": tool_version,
                   "counts": counts, "coverage": result.coverage,
                   "connector_summary": result.summary, "partial": result.partial}
        # unsupported / no-findings still complete successfully (the run itself worked).
        state = "succeeded"
        if outcome == "failed":
            state = "failed"
        queue.complete(jid, state, result_summary=summary)

        # Mark the tool verified the first time a real run on an authorized asset
        # completes with evidence (version+connector+config captured).
        if state == "succeeded" and outcome in ("succeeded", "succeeded_no_findings", "partial"):
            try:
                from .connectors.registry import record_verified
                record_verified(connector.name)
            except Exception:
                pass

        audit.record("job.completed", actor=self.worker_id, project_id=job["project_id"],
                     target=jid, detail={"outcome": outcome, "counts": counts,
                                          "connector": connector.name})

    def _handle_retryable(self, jid, job, err):
        j = queue.get_job(jid)
        if queue.retry_eligible(j):
            # Return to the queue for another attempt (lease cleared).
            import json as _json
            from .db import get_db
            get_db().execute(
                "UPDATE jobs SET state='queued', phase='queued', lease_owner=NULL, "
                "lease_expires_at=NULL, error=? WHERE id=?",
                (_json.dumps({"code": err.code, "message": err.message,
                              "transient": True}), jid))
            audit.record("job.retry", actor=self.worker_id, project_id=job["project_id"],
                         target=jid, detail={"code": err.code, "attempt": j["attempts"]})
        else:
            queue.complete(jid, "failed", error={"code": err.code, "message": err.message})

    # ------------------------------------------------------------------
    def _stage_source(self, job, asset, scope, input_dir: Path):
        """Stage read-only source into input_dir. Supports a local path (lab) or
        a shallow git clone of a scope-authorized URL."""
        params = job["params"]
        src = scope_mod.local_source_for(asset, params)
        if not src:
            ident = asset.get("identifier", "")
            if asset.get("kind") in ("repo", "source") and ident:
                self._git_clone(ident, scope, asset, input_dir)
                return
            raise ConnectorError("no source available to scan "
                                 "(set asset.metadata.local_path or params.source_path)")
        # The policy check has already compared this directory with the scope.
        # It is compared once more here, and the real path that passed is the
        # one that is opened and read.
        real = scope_mod.check_source_dir(scope, asset, src)
        try:
            top = _open_real_dir(real)
        except OSError as e:
            if os.path.realpath(real) != real:
                # A symbolic link now stands where the checked directory, or
                # a directory above it, was.
                raise _changed_since_check(real) from None
            if isinstance(e, PermissionError):
                # Said plainly: a scan of nothing would read as a clean result.
                raise ConnectorError(f"source directory cannot be read: {src}") from None
            raise ConnectorError(f"source path not found or not a directory: {src}") from None
        try:
            if not _is_dir_at(top, real):
                raise _changed_since_check(real)
            self._copy_bounded(top, input_dir)
        finally:
            os.close(top)

    def _copy_bounded(self, top: int, dst: Path):
        """Copy the tree under the open directory `top` into dst.

        The walk goes from descriptor to descriptor, never back through a
        path, so once the directory is open nothing put in its place can be
        read. Symbolic links are not followed, to a directory or to a file.
        Only regular files are copied; what cannot be read is left out.
        """
        total = 0
        for root, dirs, files, dirfd in os.fwalk(".", dir_fd=top, follow_symlinks=False):
            dirs[:] = [d for d in dirs if d not in _IGNORE]
            (dst / root).mkdir(parents=True, exist_ok=True)
            for f in files:
                try:
                    fd = os.open(f, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK, dir_fd=dirfd)
                except OSError:
                    continue            # a symbolic link, or not readable
                try:
                    info = os.fstat(fd)
                    if not stat.S_ISREG(info.st_mode):
                        continue        # a pipe, a socket, a device
                    total += info.st_size
                    if total > _MAX_SOURCE_BYTES:
                        raise ConnectorError("source exceeds the staging size limit")
                    _copy_open_file(fd, info, dst / root / f)
                except OSError:
                    continue
                finally:
                    os.close(fd)

    def _git_clone(self, url: str, scope, asset, input_dir: Path):
        # Clone is a network fetch; confirm the host is not internal unless allowed.
        scope_mod.validated_destination(url, allow_private=bool(asset.get("metadata", {}).get("internal")))
        run = run_tool(["git", "clone", "--depth", "1", "--no-tags", "--single-branch",
                        "--", url, str(input_dir / "repo")],
                       cwd=input_dir, timeout=180)
        if run.returncode != 0:
            raise ConnectorError("git clone failed",
                                 detail={"stderr": run.stderr.decode("utf-8", "replace")[:300]})


def main():  # `python -m app.worker`
    import sys
    from .config import discard_fallback_dir, get_config
    from .db import get_db
    if get_config().data_dir_fallback:
        # Temporary storage is private to this process: its database is empty
        # and no API ever writes jobs to it, so polling it can never do work.
        print("[worker] data directory is not writable; a standalone worker needs "
              "the same data directory as the API. Exiting.", file=sys.stderr)
        # Loading the configuration created that temporary storage. A worker
        # that is restarted until its volume is fixed must not leave one
        # behind per attempt.
        discard_fallback_dir()
        sys.exit(1)
    get_db()
    w = Worker()
    print(f"[worker] {w.worker_id} started; polling queue. Ctrl-C to stop.", file=sys.stderr)
    try:
        w.run_forever()
    except KeyboardInterrupt:
        w.stop()
        print("[worker] stopped", file=sys.stderr)


if __name__ == "__main__":
    main()
