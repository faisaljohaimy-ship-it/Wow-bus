# FAISAL.AI — Faisal Security Lab (Defensive AI Security Platform)

> **منصة دفاع واختبار أمني أخلاقي** — authorized, auditable security testing that
> unifies real security tools behind one execution contract and layers AI over
> re-verifiable evidence. Standalone, Python-standard-library core.

**PRIVATE DEFENSE SYSTEM.** This platform performs security testing **only against
assets you are authorized to test.** Authorization is enforced in code at both the
API and the worker — an out-of-scope request is rejected even when the API is
called directly. It deliberately **excludes** internet-wide scanning, denial of
service, mass credential attacks, data exfiltration, persistence and
detection-evasion.

This is the successor to the original `faisal-security-lab` (a Cloudflare Worker +
Python runner), rebuilt as a standalone service. It preserves the FAISAL.AI
identity, the 76-tool Arabic catalog, and the hardened defensive posture of the
original runner (SSRF guards, no-shell execution, bounded jobs, evidence
redaction), and adds a policy engine, a durable job queue, RBAC, an AI layer and a
bilingual operator console.

---

## What it does — the defensive loop

```
authorized asset → scope → scan plan → tool run (isolated) → evidence
      → normalized findings → risk ranking → reviewable fix → re-scan → report
```

Supported asset kinds: source/repos, web, API, host, container. Coverage extends
by adding connectors; the broad 76-tool catalog is the coverage target, and the
working connectors are a verified subset of it.

## Quick start

```bash
cd faisal-security-lab
make install-tools          # semgrep, gitleaks, osv-scanner, bandit, pip-audit (pinned)
make verify                 # sync + print honest tool states
make serve                  # API + UI + in-process worker → http://127.0.0.1:8787
```

On first boot an **owner** account is created from `FSL_OWNER_EMAIL`; if
`FSL_OWNER_PASSWORD` is unset a one-time password is printed to the console.
Open the UI, sign in, create a project, register an asset, grant an authorization
**scope**, then run scans from the Scan Center.

```bash
make test                   # 37 unit + integration tests (real tools where present)
make acceptance             # the 10 release-acceptance gates → evidence/acceptance-report.json
```

## Architecture (standalone, dependency-light)

| Layer | Module | Role |
|---|---|---|
| API + UI | `app/server.py`, `web/` | JSON API + bilingual console; server-side RBAC; security headers; rate limit |
| Identity | `app/auth.py` | PBKDF2 passwords, signed sessions, owner/admin/analyst/reader; **never trusts client identity headers** |
| Authorization | `app/scope.py`, `app/policy.py` | scope registry + policy engine evaluated at **enqueue and execution**; SSRF/destination validation |
| Queue | `app/queue.py` | durable, idempotent, leased, crash-safe (`undetermined` on lost worker), per-asset serialization, global stop |
| Worker | `app/worker.py` | leases a job, stages read-only input, re-checks policy, runs the connector under bounds, persists evidence + findings |
| Connectors | `app/connectors/` | uniform contract; no-shell subprocess; Semgrep, Gitleaks, Trivy, OSV-Scanner, Bandit, pip-audit, HTTP headers, TLS, AI red-team |
| Findings | `app/findings.py` | unified model, cross-tool dedup, work-priority, status lifecycle, reopen |
| Evidence | `app/evidence.py` | double-redaction, sha256, retention, restricted access |
| Reports | `app/reports.py` | JSON, SARIF 2.1.0, bilingual HTML/Markdown |
| AI | `app/ai/` | planner / triage / remediation / validation / reporting; structured-output contract; untrusted-input sanitizer; graceful degradation |

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md), [docs/OPERATIONS.md](docs/OPERATIONS.md),
[docs/SCOPE.md](docs/SCOPE.md).

## Tool coverage in this build (honest states)

| Connector | Category | State here | Evidence |
|---|---|---|---|
| semgrep `1.185.0` | SAST | **verified** | 5 findings on the sample |
| bandit `1.9.4` | SAST (python) | **verified** | 8–9 findings on the sample |
| gitleaks `8.21.2` | secrets | **verified** | 1 finding (fabricated `ghp_` token) |
| pip-audit `2.10.1` | dependencies | **verified** | 28 CVEs on pinned deps |
| http_headers | network/web | ready (stdlib) | needs a live authorized target |
| tls_certificate | network/crypto | ready (stdlib) | needs a live authorized target |
| osv-scanner `1.9.2` | dependencies/SBOM | **ready, egress-blocked** | `api.osv.dev` not reachable via the build proxy; pip-audit covers the category |
| trivy | deps/containers/SBOM | **blocked** | release asset returns 404 via the build proxy; connector implemented, binary absent |
| ai_redteam | AI model red-team | **blocked** | requires a configured AI provider (synthetic-canary probe battery) |

"Verified" is granted only after a real run on an authorized asset produced
evidence; it is tied to the tool version + connector + config and goes **stale**
if any of those change. The full 76-tool catalog is browsable in the console as
the coverage target; each entry links to its official upstream.

## Acceptance

`make acceptance` scores the declared release scope (`r1`) against 10 gates with
re-verifiable evidence (`evidence/acceptance-report.json`). This build scores
**10/10** on the gates below — a measure of acceptance completion for this scope,
**not** a claim that the system is free of vulnerabilities. See
[ACCEPTANCE.md](ACCEPTANCE.md).

## Security posture & limits

- No shell string is ever built from user, model or scan output; connectors pass
  fixed program names + validated argument lists.
- Scanned input is **never executed**; SAST/secret/dep tools analyze it statically.
- Network connectors resolve the destination, reject private/loopback addresses
  (unless an internal asset is explicitly authorized), pin the connection to a
  validated IP with correct SNI, and never auto-follow redirects.
- Memory is bounded on the **containerized worker** via a cgroup `--memory` limit
  (process `RLIMIT_AS` is off by default because it breaks modern engines);
  CPU, wall-clock, output size, file size and process count are always bounded.
- Secrets/PII are redacted before anything is shown, exported, logged, or sent to
  a model.

## Licensing / attribution

The platform code is the project's own. Each integrated tool keeps its upstream
license (Semgrep LGPL-2.1, Gitleaks MIT, Trivy/OSV-Scanner/pip-audit Apache-2.0,
Bandit Apache-2.0); tools are invoked as separate programs, not vendored.
`FAISAL.AI` is a display brand; `faisal.ai` is **not** an owned/live domain.
