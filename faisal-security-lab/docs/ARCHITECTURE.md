# Architecture & trust boundaries

## Processes

Two deployable roles share one SQLite database (WAL):

- **API host** (`app.server`) — serves the JSON API and the static UI, verifies
  identity, enforces RBAC, and enqueues jobs after a policy check. It runs **no**
  security tools. In standalone/dev mode it also starts in-process worker threads;
  set `FSL_NO_WORKER=1` to disable that and run workers separately.
- **Scan worker** (`app.worker`) — leases jobs, stages read-only input, re-checks
  policy, runs a connector under bounded isolation, and writes evidence + findings.
  In production it runs as a separate, least-privilege container (see
  `deploy/Dockerfile.worker`).

```
                 ┌────────────┐     enqueue (policy @ API)    ┌──────────┐
  operator ─TLS─▶│  API + UI  │ ─────────────────────────────▶│  queue   │
                 │ (no tools) │                                │ (sqlite) │
                 └────────────┘                                └────┬─────┘
                                                      lease + policy │ re-check
                                                            ┌────────▼────────┐
                                                            │  scan worker    │
                                                            │  (tools, bounded)│
                                                            └────────┬────────┘
                                             evidence + findings     │
                                                            ┌────────▼────────┐
                                                            │ db + evidence   │
                                                            └─────────────────┘
```

## Trust boundaries

1. **Client ↔ API.** Identity is a server-side signed session (PBKDF2 password →
   bearer token, stored hashed). Client-supplied identity headers are ignored.
   Every route re-derives the principal and checks RBAC. Request bodies are size
   capped; responses carry a strict CSP and other security headers.
   *Optional public read-only view (`FSL_PUBLIC_VIEW=1`, off by default):* a
   request with **no** `Authorization` header may resolve a `GuestPrincipal`, but
   only on GET routes registered with `guest_ok=True` (`app/server.py`). The guest
   has no global role and is `reader` of exactly one project — the demo project
   owned by a reserved, non-loginable system account (`app/demo.py`) — so the same
   `require_project` checks that isolate tenants confine it. Any presented
   credential, valid or not, is validated as before. While the view is on, every
   signed-in account is also at least a `reader` of that project
   (`Principal.project_role`); higher roles stay membership-based.
   - *What a guest is sent.* `Handler._dispatch` passes every result and error
     of a guest request through `app/guest_view.py` after the handler returns —
     the only place this happens, so a new guest route is covered by default. It
     drops `redacted_summary`, `storage_ref`, `local_path` and a readiness
     object's `path` wherever they appear, and in every string (JSON values and
     the HTML/Markdown/SARIF report text) cuts off the application directory and
     shows the data directory as `data`. A guest therefore gets no evidence text
     and no server paths; signed-in principals bypass the view entirely. The
     report route accepts only `lang=ar|en` and its four known formats.
   - *What a guest may cost.* Guest requests are counted per client address
     (240/min) and across all guests (1200/min), both fixed one-minute windows,
     in memory; a full per-client table evicts its oldest entries instead of
     refusing new clients. The guest connector list is read from the
     `tool_registry` table, so anonymous traffic never runs a tool's version
     command.
   - *The demo across restarts* (`app/demo.py`). Startup runs the registry sync
     and then the demo seeding in one background thread, so a tool's registry
     row exists before a demo scan can mark it verified. Demo jobs carry
     idempotency keys `public-demo:<scope>:<connector>[:2|:3]`: a job that is
     queued, leased, running or succeeded is final for that start, any other
     end state gets the next key, at most three jobs per connector and scope.
     The id of the scope the demo manages is kept in the `public_scope_id`
     setting and is written before a superseded scope is revoked; finding that
     scope revoked therefore means an operator did it, and the demo then issues
     no scope and enqueues nothing.
2. **API ↔ queue.** A job is only enqueued after `policy.evaluate_job` passes with
   the caller's principal. The policy engine is the single authorization chokepoint.
3. **Queue ↔ worker.** The worker re-evaluates policy at execution time with no
   principal (internal path) so a scope revoked after enqueue stops the job. The
   worker also re-confirms the tool is actually available.
4. **Worker ↔ tool.** Tools run via `run_tool`: fixed program name, validated
   argument list, `shell=False`, new session/process-group, `RLIMIT_CPU`/
   `FSIZE`/`NOFILE`/`NPROC`, wall-clock timeout, output caps, minimal environment
   (no inherited secrets), cooperative cancel that kills the whole process group.
5. **Worker ↔ network.** `scope.validated_destination` resolves the host, rejects
   private/loopback/link-local addresses unless an internal asset is authorized,
   and never auto-follows redirects.
6. **Platform ↔ model.** The model receives untrusted content only inside a
   labelled data envelope and returns only schema-constrained JSON; an independent
   validator rejects off-contract output. Model text is never executed.

## Data model (SQLite)

`users, sessions, projects, project_members, assets, scopes, jobs, findings,
evidence, tool_registry, catalog, audit, settings, schedules`. Project isolation
is enforced in every query path via `Principal.project_role`.

## Connector contract

```python
class Connector:
    name; category; source; license; connector_type; binary
    capabilities() -> {active, passive, needs_source, needs_network}
    validate_config(params) -> params | raises ConfigError
    readiness() -> {installed, available, version, detail}
    execute(ctx) -> ConnectorResult(status, findings, evidence, summary, coverage, partial)
```

`status` distinguishes `succeeded`, `succeeded_no_findings`, `partial`,
`unsupported` (tool ran, asset not applicable) and `failed` (tool error) — these
are NOT conflated, so "no findings" is never confused with "failed".

## Findings & priority

`dedup_key = sha256(project | cve|rule_id | location | line)` collapses re-runs and
cross-tool duplicates while keeping provenance. **Work priority** (0–100) is
computed from severity × asset criticality + exposure + confidence, separately
from CVSS/EPSS/KEV (each of which carries its own source + date when attached).

## Crash safety

A leased-but-not-started job whose lease expires returns to the queue. A
**running** job whose lease expires becomes `undetermined` — the platform does not
silently re-run an active scan; a new scan requires explicit re-submission.
