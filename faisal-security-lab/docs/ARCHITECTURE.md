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
