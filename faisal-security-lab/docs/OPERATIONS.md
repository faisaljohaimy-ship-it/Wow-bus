# Operations guide

## Run modes

**Standalone (dev / single host)**
```bash
make serve     # API + UI + in-process workers
```

**Split (production)**
```bash
# API host (no tools)
FSL_NO_WORKER=1 python3 -m app.server
# One or more isolated workers (with tools + cgroup memory limit)
docker compose -f deploy/compose.yaml up --build
```

## Tools: install, update, verify

```bash
make install-tools      # pinned versions into a venv + /usr/local/bin
make verify             # sync registry; print honest states
```

Updating a tool or its rules/config invalidates its `verified` state → it becomes
`stale` until a fresh real run re-verifies it. Test tool/ruleset updates before
rollout; the registry records version + last-verified reference per tool.

## Readiness checks

```bash
curl -s localhost:8787/api/health
curl -s -H "Authorization: Bearer $TOK" localhost:8787/api/connectors   # readiness per connector
curl -s -H "Authorization: Bearer $TOK" localhost:8787/api/tools         # registry states
```

## Scheduling scans

Scans run through the queue; schedule them with any external scheduler (cron,
CI, systemd timer) hitting `POST /api/projects/{id}/scans` within a valid scope
and run window. Per-asset serialization prevents overlapping scans on one asset.
Network scans should be scheduled inside the scope's allowed `window` and under
its rate limits.

## Global stop & cancel

- **Global stop:** `POST /api/admin/stop {"engaged":true}` (admin). Halts all
  leasing and flags running jobs to stop. `Settings → Global stop` in the UI.
- **Cancel one job:** `POST /api/jobs/{id}/stop`. The worker kills the tool's
  process group cooperatively.

## Backup & restore

The entire state is the SQLite DB + the evidence directory (`FSL_DATA_DIR`).
Back up both together.

```bash
# backup
sqlite3 var/faisal-security-lab.db ".backup var/backup.db"
tar czf fsl-backup.tgz var/backup.db var/evidence
# restore (stop the service first)
tar xzf fsl-backup.tgz && mv var/backup.db var/faisal-security-lab.db
make verify    # re-sync tool states on the restored host
```

A restore drill: restore into a scratch `FSL_DATA_DIR`, start the API with
`FSL_NO_WORKER=1`, and confirm `/api/health`, login, and a project's findings load.

## Resource & cost estimate (rough)

- API host: ~128 MB RAM, negligible CPU.
- Worker: 1–3 GB RAM per concurrent Semgrep/Trivy job (bound with `mem_limit`),
  1 vCPU per concurrent job. Default `FSL_WORKER_CONCURRENCY=2`.
- Storage: DB grows with findings/audit (KB per finding); redacted evidence is
  small. Raw evidence retention default 90 days.
- AI: off by default (deterministic fallback). When enabled, bounded by
  `ai_token_budget` / `ai_cost_budget_usd` / `ai_timeout_seconds`; the platform
  sends only redacted, minimal data.

## Secrets

Tool/API credentials are supplied via environment variables on the worker only,
never committed. The session signing key is auto-generated to
`var/.session-secret` (0600) or supplied via `FSL_SECRET_KEY`.
