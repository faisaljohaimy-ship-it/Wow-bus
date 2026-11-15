# Architecture & trust boundaries

## Processes

Two deployable roles share one SQLite database (WAL):

- **API host** (`app.server`) — serves the JSON API and the static console,
  verifies identity, checks roles, and enqueues jobs after a policy check. With
  `FSL_NO_WORKER=1` it runs **no** security tools. Without it (the default of
  `make serve`) it also starts worker threads in its own process.
- **Scan worker** (`app.worker`) — leases jobs, copies the source to scan into a
  temporary directory, repeats the policy check, runs a connector under limits,
  and writes evidence and findings. It can run as a separate process or as a
  separate container with a memory limit and no capabilities
  (`deploy/Dockerfile.worker`, `deploy/compose.yaml`). A worker process runs one
  job at a time.

```
                 ┌────────────┐     enqueue (policy @ API)    ┌──────────┐
  operator ─────▶│  API + UI  │ ─────────────────────────────▶│  queue   │
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

The server speaks plain HTTP. TLS is the job of the reverse proxy or the hosting
platform in front of it.

## Trust boundaries

1. **Client ↔ API.** Identity is a server-side session: a password checked with
   PBKDF2 gives a random bearer token, of which the database keeps only the
   SHA-256. Client-supplied identity headers are ignored.
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
     drops `redacted_summary`, `storage_ref`, `local_path`, a scope's
     `owner_contact` and `proof`, and a readiness object's `path` wherever they
     appear, and in every string (JSON values, the SARIF report parsed as JSON,
     and the HTML/Markdown report text) cuts off the application directory and
     shows the data directory as `data`. A directory two or more levels deep is
     cut even when glued to a word, unless that word follows a slash (a longer
     path or a URL); one directly below the root (`/app`, `/data`) only where a
     path starts. The bundled sample reads `samples/vulnerable-app` under any
     directory, which covers a database filled by an install at another path.
     An error with the code `worker_error` or `internal` (the text of an
     exception caught by the worker or by a route, cut to a fixed length before
     it gets here) keeps the code and gets a fixed message. A guest therefore gets no
     evidence text and no server paths; signed-in principals bypass the view
     entirely. A guest's refusal carries no request-derived detail
     (`GuestPrincipal.require_project`), so the rewriting cannot be used to
     test a guessed directory. The report route accepts only `lang=ar|en` and
     its four known formats.
   - *What a guest may cost.* Guest requests are counted per client address
     (90/min) and across all guests (240/min, `FSL_GUEST_REQUESTS_PER_MINUTE`),
     both in fixed one-minute windows, in memory, and two guest requests are
     worked on at once (up to 16 more wait, at most 4 seconds). A full
     per-client table evicts its oldest entries instead of refusing new
     clients. The guest connector list is read from the `tool_registry` table,
     so anonymous traffic never runs a tool's version command.
   - *The demo across restarts* (`app/demo.py`). Startup runs three steps in
     one background thread: the demo project, asset and scope are written and
     published (database only, so visitors can read the project at once), the
     tool registry is synced, and then the demo scans are enqueued, so a tool's
     registry row exists before a demo scan can mark it verified. Demo jobs
     carry idempotency keys `public-demo:<scope>:<connector>[:2|:3]:<tag>`
     (the tag is a keyed digest under the server secret, so the keys cannot be
     guessed from what a guest reads): a job that
     is queued, leased, running or succeeded is final for that start (a scan
     interrupted by a restart stays `running` until its lease expires), any
     other end state gets the next key, at most three jobs per connector and
     scope. Only jobs of the demo project under that scope are counted; a key
     that a job of another project holds is passed over (`key_in_use` when none
     is left), because the queue matches idempotency keys across projects.
     The id of the scope the demo manages is kept in the `public_scope_id`
     setting and is written before a superseded scope is revoked; finding that
     scope revoked therefore means an operator did it, and the demo then issues
     no scope and enqueues nothing.
2. **API ↔ queue.** A job is only enqueued after `policy.evaluate_job` passes with
   the caller's principal. The policy engine is the single authorization chokepoint;
what it compares, and what it does not, is listed in [SCOPE.md](SCOPE.md).
3. **Queue ↔ worker.** The worker re-evaluates policy at execution time with no
   principal (internal path) so a scope revoked after enqueue stops the job. The
   worker also re-confirms the tool is actually available.
4. **Worker ↔ tool.** Tools run via `run_tool`: fixed program name, validated
   argument list, `shell=False`, new session/process-group, `RLIMIT_CPU`/
   `FSIZE`/`NOFILE`/`NPROC`, wall-clock timeout, output caps, minimal environment
   (no inherited secrets), cooperative cancel that kills the whole process group.
5. **Worker ↔ network.** `scope.validated_destination` resolves the host and
   rejects private, loopback and link-local addresses unless the asset is marked
   internal (`metadata.internal`). The header and TLS connectors connect to the
   address that was checked and do not follow redirects. A repository address
   is checked the same way before `git clone` starts; git then resolves the
   name again itself (see "Known limits" in [SCOPE.md](SCOPE.md)).
6. **Platform ↔ model.** The model receives untrusted content only inside a
   labelled data envelope and returns only schema-constrained JSON; an independent
   validator rejects off-contract output. Model text is never executed.

## Data model (SQLite)

`users, sessions, projects, project_members, assets, scopes, jobs, findings,
evidence, tool_registry, catalog, audit, settings, schedules, meta`. Routes
check the caller's role in the project (`Principal.project_role`) before they
read or write its rows. The `schedules` table is not used by this version;
scans are scheduled from outside (see [OPERATIONS.md](OPERATIONS.md)).

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

`dedup_key = sha256(project | cve or rule_id | location | line)` collapses
re-runs, and the same CVE at the same location reported by two tools, into one
finding. **Work priority** (0–100) is computed from the tool's severity, the
asset's criticality, the tool's confidence and whether the asset is a `web`,
`api` or `host` asset. The finding record also has fields for CVSS, EPSS and
KEV data; in this version only the Trivy connector fills CVSS, and nothing
fills EPSS or KEV.

## Crash safety

A leased-but-not-started job whose lease expires returns to the queue. A
**running** job whose lease expires becomes `undetermined` — the platform does not
silently re-run an active scan; a new scan requires explicit re-submission.
