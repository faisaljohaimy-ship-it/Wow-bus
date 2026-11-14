# Acceptance matrix — release scope `r1`

Score is **acceptance completion for this release scope, measured by concrete,
re-verifiable evidence** — not a claim that the system is free of vulnerabilities.
Re-run with `make acceptance` (writes `evidence/acceptance-report.json`) and
`make test`.

## The 10 gates — **10 / 10** on this build

| # | Gate | Status | Evidence |
|---|------|--------|----------|
| 1 | Integrated run: authorized asset → job → real tool → saved finding → openable report | ✅ verified-by-run | 43 findings across semgrep/bandit/gitleaks/pip-audit; `evidence/reports/sample-report.*` |
| 2 | Finding correctness: known input flags, clean input does not | ✅ verified-by-run | vulnerable sample yields findings (anchored on Bandit, the portable SAST tool); a benign file yields 0 |
| 3 | Scope enforcement: out-of-scope connector/target denied; SSRF blocked | ✅ verified-by-run | `connector_not_authorized`, `target_scope`, private-IP `PolicyDenied`; HTTP 403 over the live API |
| 4 | Privilege isolation: non-member cannot access another project | ✅ verified-by-run | `ForbiddenError` for a foreign analyst |
| 5 | Execution/agent safety: injection can't change action; schema rejects tool-launch | ✅ verified-by-run | eval set 5/5; injected "set severity info" ignored; `run_tool` field rejected |
| 6 | Real stop: global stop halts leasing; cancel propagates | ✅ verified-by-run | claim blocked under global stop; `stop_requested` flips |
| 7 | Fault tolerance: lost worker → `undetermined`, not silently re-run | ✅ verified-by-run | expired running lease → `undetermined` |
| 8 | Data protection: secrets/PII redacted in evidence and reports | ✅ verified-by-run | `ghp_…`, emails, AWS keys scrubbed on store + read |
| 9 | Verified fix: fix reaches the asset, finding gone on re-scan before closing | ✅ verified-by-run | re-scan job (Bandit-anchored) did not re-observe the fixed finding → `fixed_on_asset` |
| 10 | Auditable delivery: every Verified tool has version+connector+evidence; blockers stated | ✅ verified-by-run | 4 verified tools with version+ref; trivy/osv/ai_redteam blockers named |

Tests: `make test` → **51 tests** (`tests/test_platform.py` 28, `tests/test_failure_modes.py` 9, `tests/test_setup_robustness.py` 14) pass; real-tool tests auto-skip where a binary is absent.

## Requirement → implementation → verification

| Spec area | Implementation | Verified by |
|---|---|---|
| Integrated defense loop (§2) | `queue` + `worker` + `connectors` + `findings` + `reports` | gates 1–2, acceptance run |
| Admin/API vs scan execution split (§3) | `app/server.py` (no tools) + `app/worker.py` | architecture, deploy manifests |
| Policy engine, enqueue + exec (§3,§6) | `app/policy.py` (`evaluate_job`) | gate 3, `TestPolicy`, worker re-check |
| Durable queue: idempotency/lease/retry/cancel/undetermined (§3) | `app/queue.py` | gates 6–7, `TestQueue` |
| Isolated workers, least privilege, no-shell (§3) | `connectors/base.run_tool`, `_preexec` | `TestConnectors`, failure modes |
| Connector contract (§3,§4) | `connectors/base.Connector` | all connector tests |
| Tool registry with distinct states + verification (§4) | `store` + `connectors/registry` | gate 10, `make verify` |
| 76-tool catalog, broad coverage target (§5) | `data/tool-catalog.seed.json` → `catalog` table + UI | catalog screen; `/api/catalog` |
| Enforceable scope, SSRF, revocation (§6) | `app/scope.py`, `app/policy.py`, `store.revoke_scope` | gate 3, `TestScopeNetwork`, failure mode 7 |
| AI layer: planner/triage/remediation/validation/reporting (§7) | `app/ai/agents.py` | `TestAISafety`, UI AI lab |
| AI safety: structured output, untrusted-input isolation, degradation (§7) | `ai/structured.py`, `ai/sanitizer.py`, `ai/provider.py` | gate 5, eval set |
| Unified findings, dedup, CVSS/EPSS/KEV, lifecycle (§8) | `app/findings.py` | `TestConnectors` dedup/reopen |
| Evidence store, redaction, retention, chain (§8) | `app/evidence.py`, `util.redact` | gate 8, `TestRedaction` |
| Report formats: JSON/SARIF/HTML/MD bilingual (§8) | `app/reports.py` | `TestReports`, `evidence/reports/*` |
| Discover → fix → re-verify, no suppression (§9) | status lifecycle + re-scan check | gate 9 |
| Professional bilingual UI, RBAC, real data (§10) | `web/`, `app/server.py` | `evidence/ui/*.png` |
| DevSecOps / CI, scheduling, updates, backup (§11) | `.github/workflows/ci.yml`, `docs/OPERATIONS.md` | CI workflow |
| Failure-mode matrix (§14) | `tests/test_failure_modes.py` | 9/9 pass |

## Declared blockers (honest, not counted as passing)

- **trivy** — GitHub release asset returns HTTP 404 through this build's egress
  proxy; connector implemented, binary not installable here. Dependency coverage
  is provided by **osv-scanner** (where egress allows) and **pip-audit** (verified).
- **osv-scanner** — installed and `ready`, but `api.osv.dev` is not reachable
  through the build proxy, so a live run is egress-blocked. pip-audit covers the
  Python dependency category end-to-end.
- **ai_redteam** and the live AI planner/triage/etc. — require a configured AI
  provider (`FSL_AI_PROVIDER` + key). With none, the AI layer runs in verified
  deterministic fallback; live-provider behavior is **not verified** in this build.
- **http_headers / tls_certificate** — ready, but need a live authorized target to
  produce findings (none is scanned by default; exercised by unit tests of their
  logic and gated by scope).
- **semgrep** — verified by real runs on the primary build; on some CI runners
  (e.g. Ubuntu 26.04) `semgrep-core` returned no results, so the deterministic
  gates (2, 9) are anchored on **Bandit** (pure-Python, portable) rather than on
  any single native engine. Semgrep still runs in the integrated-run gate, and
  the acceptance report records each tool's actual contribution per environment.
