# Platform Upgrade — v4 Defensive Edition: Diagnosis & Execution Plan

> ملخص بالعربية: هذا سجل هندسي يربط كل بند في مصفوفة القبول 10/10 بحالته الحالية في الكود،
> والفجوة، والإصلاح، واختبار القبول، وهل يمكن تنفيذه في هذه البيئة أم يحتاج إجراءً خارجياً.
> يُحدَّث مع تقدم العمل. المصدر: `Security_Prompt_v3`/`v4` (النسخة الدفاعية).

This document is the requirements/traceability matrix mandated by the spec (§2, §16, §25). It maps
each requirement to its current state (evidence-backed), the gap, the fix, its acceptance test, and
whether it is buildable in this stdlib-only cloud container or is an external blocker.

**Scan date:** 2026-11-16 · **Suite:** 511 tests green · **Acceptance script:** 10/10 gates pass here
against real scanners (semgrep/bandit/gitleaks/pip-audit verified, osv ready, trivy blocked — binary absent).

## Honest headline

- **Real substrate exists:** no-shell bounded tool runner (setsid + rlimits + process-group kill +
  timeout/cancel), durable SQLite queue (idempotency keys, leases, per-asset serialization, crash-safe
  reclaim → `undetermined` not silent re-run), policy re-checked at enqueue **and** inside the worker,
  SSRF/loopback/link-local/cloud-metadata denied with IP-pinned + correct-SNI connections, schema-only
  AI with an injection-resistant sanitizer, deterministic fallbacks so base scans work with no model.
- **5 scanners genuinely run here:** semgrep, osv-scanner, gitleaks (+ bandit, pip-audit). Trivy has a
  complete adapter but its binary is absent in this container.
- **Two true external blockers:** (1) live production deploy + post-deploy verify — egress to
  render.com/onrender.com/fly.io is 403-blocked from this container, so the owner must deploy in the
  Render dashboard; (2) a full ZAP end-to-end run (ZAP is heavy / GUI-oriented). Everything else is
  buildable here.

## 10/10 acceptance axes (§26) — current standing

| # | Axis | Standing | What moves it |
|---|------|----------|---------------|
| 1 | Tool integration | 🟡 partial | add real connectors (Syft, testssl.sh, Schemathesis, Nuclei; install Trivy) + Agent Tool Gateway |
| 2 | Agent cycle (plan→auth→run→evidence) | 🟡 partial | implement the autonomy chain (§17/§23) + campaigns (v4) |
| 3 | Findings validity & coverage | 🟡 partial | coverage reporting, dedupe-keep-sources, suspected/confirmed/**conflict** ledger, "no results ≠ safe" |
| 4 | Scope & permissions | 🟡 partial | **enforce allowed_ports**, time-limited execution-permission token (v4) |
| 5 | Isolation & secrets | 🟡 partial | credential_ref secret store, egress-disable for local scans |
| 6 | Job reliability | 🟡 partial | **Cancelled**/Partial/Timed-out states, **measured** cancel |
| 7 | Fix & retest | 🟡 partial | `retest_finding` op + close-with-evidence remediation cycle |
| 8 | Licenses & cost | 🟡 partial | Tools & Licenses screen, enforced budget cap, cost view |
| 9 | UX & performance | 🟡 partial | agent run cards, results sort/search, light theme, perf tests |
| 10 | Deploy & rollback | ⛔ ext. blocked | rollback plan + post-deploy verify script (deploy itself = owner action in Render) |

## v4 deltas (on top of v3) — all additive, all buildable here except where noted

- **Campaigns with hard total caps**: a dependency-ordered test plan; a global cap on
  requests/concurrency/time/output **per asset and per campaign** (parallel tools cannot bypass it by
  splitting requests); campaign-cancel kills dependent + running tasks.
- **Conflicting-evidence ledger** + **evidence expiry**: keep both findings and their versions; mark
  "conflict needs verification" vs "fixed"; expire evidence when app version/config/rules change.
- **Independent verification / no self-certify**: orchestrator proposes, policy gate approves, worker
  executes, reviewer checks evidence, a version-verifier decides acceptance; allow/budget/isolation are
  server rules the model cannot change.
- **Time-limited signed execution-permission token** per job (user/project/asset/capability/budget/
  expiry), no reuse, agent cannot mint its own.
- **Reference benchmark lab** with a held-out eval set (no overfitting), measuring
  accuracy/coverage/false-alarms/unresolved/time, and version-over-version deltas ("not computable"
  when data is thin).
- **Scheduler + circuit breaker**: stop admitting jobs near caps; suspend a failing service, keep
  independent work going.
- **Deploy-target rule (§28)**: deploy only to the correct trusted project — never a different repo by
  name similarity or same-account ownership (→ our target is the Render service for this repo, not the
  unrelated Vercel project).

## Full gap inventory (by dimension)

Legend: state ✅ pass / 🟡 partial / ⬜ missing / ⛔ blocked · feasibility yes / partial / external_blocker.

### A — Tooling, connectors, and the Agent Tool Gateway (§3,4,5,17,18,19,23,24)

_The platform has a genuinely real, well-isolated connector substrate: eight connectors plus one AI probe battery run external tools (or stdlib network checks) through a single hardened, no-shell, resource-bounded runner (app/connectors/base.py run_tool: setsid/rlimits/process-group kill/timeout/cancel), gated twice by a real policy engine (enqueue + worker re-check) and persisted through a durable SQLite queue with leases, idempotency and per-asset serialization. Of the §4 mandatory tool list (ZAP, Nuclei, Semgrep CE, OSV-Scanner, Trivy, Gitleaks, Syft, testssl.sh, Schemathesis, Promptfoo, PyRIT) only 4 are wired with real adapters (Semgrep, OSV-Scanner, Gitleaks fully running here; Trivy adapter complete but binary absent/unverified in this container); 7 are only catalogued, not integrated — ZAP, Nuclei, Syft, testssl.sh, Schemathesis are absent, and Promptfoo/PyRIT exist only as a home-grown 4-probe substitute (app/ai/redteam.py). There is NO formal Agent Tool Gateway exposing the nine §18 contracts as a unified surface: the separation of model inference from execution authority is genuinely enforced (schema-only AI + server-side policy), and 7 of 9 contracts exist under scattered route/function names, but estimate_resources and retest_finding are missing and nothing drives the §23 chat→plan→real-tool-run→evidence chain (the planner only proposes; §17 autonomy is not implemented). §19 credential_ref and the License/Activation/API-credential/TLS-cert/training-badge taxonomy are entirely absent in code (secret_refs is a never-populated field); the tool registry is real with honest states + license metadata and correctly makes 'verified' require a real lab run, but its state vocabulary and per-tool metadata are thinner than §5 demands._

| P | State | Feasible | Eff | Ref | Requirement | Fix |
|---|---|---|---|---|---|---|
| P1 | ⬜ missing | partial | L | §4 | §4 ZAP (web DAST) connector that actually runs the tool | Add ZapConnector driving the ZAP Automation Framework / daemon API against a scope-authorized target, importing alerts via normalize_findings; its API key mu… |
| P1 | ⬜ missing | partial | L | §4 | §4 Nuclei (config/exposure) connector that actually runs the tool | Add NucleiConnector running a pinned nuclei with an offline, reviewed template set; record template version in the registry; block auto-fetch of templates fr… |
| P1 | 🟡 partial | yes | M | §18 | §18 Formal Agent Tool Gateway exposing the nine named contracts and separating inference from execution authority | Add app/gateway.py exposing all nine contracts over the existing queue/policy/evidence seams, implementing estimate_resources (from Limits + connector cost h… |
| P1 | 🟡 partial | yes | M | §19 | §19 credential_ref for secrets (model never sees the secret) + License/Activation-token/API-credential/TLS-cert/training-badge distinction | Add a credential store keyed by credential_ref with a typed credential_kind enum (license/activation_token/api_credential/tls_cert/training_badge) and a reso… |
| P1 | 🟡 partial | yes | L | §17 | §17/§23 Agent actually selects, runs, follows, analyzes and retests tools from the conversation on the same execution path | Add an agent-run endpoint that takes a plan, authorizes each step through the gateway/policy, enqueues jobs, streams job status + redacted evidence back as r… |
| P2 | ⬜ missing | partial | M | §4 | §4 Syft (SBOM) connector that actually runs the tool | Add SyftConnector producing a CycloneDX/SPDX SBOM artifact stored as evidence and linked to the asset's code version per §4/§10. |
| P2 | ⬜ missing | partial | M | §4 | §4 testssl.sh (TLS) connector that actually runs the tool | Add a low-impact TestsslConnector against scope-authorized hosts, OR explicitly document tls_certificate as the deliberate stdlib substitute and adjust the §… |
| P2 | ⬜ missing | yes | M | §4 | §4 Schemathesis (API schema testing) connector that actually runs the tool | Add SchemathesisConnector targeting a lab OpenAPI endpoint inside an isolated, restorable test DB; mark it active/needs_network so policy gates it. |
| P2 | ⬜ missing | partial | M | §4 | §4 Promptfoo (AI app testing) connector that actually runs the tool | Either wire the promptfoo CLI to run eval configs against a lab model (key via credential_ref), or keep ai_redteam and relabel the §4 declared set honestly. |
| P2 | ⬜ missing | partial | M | §4 | §4 PyRIT (AI red-team) connector that actually runs the tool | Integrate a PyRIT orchestrator run against a lab model with synthetic data, or document ai_redteam as the deliberate substitute and downscope the §4 claim. |
| P2 | 🟡 partial | partial | M | §4 | §4 Trivy wired with a real adapter that runs the tool | Install trivy via scripts/install-tools.sh and run it once on an authorized asset so worker._finalize→record_verified records a verified run. |
| P2 | 🟡 partial | yes | M | §5 | §5 Unified tool registry with honest readiness states and license metadata | Extend the registry with the missing states and per-tool fields (fingerprint, rules_version, input_schema, timeout/concurrency, rollback) and surface them in… |
| P2 | 🟡 partial | yes | M | §24 | §24 Deliverables: gateway code, connectors, I/O contracts, secret-ref management, queue linkage, agent-run UI, integration tests, add-tool docs | Deliver app/gateway.py + credential store + an agent-run console, add docs/CONNECTORS.md (add/update/revoke/verify-license/test-before-enable), and generate … |
| P2 | ✅ pass | yes | S | §4 | §4 Semgrep CE wired with a real adapter that runs the tool | Record the ruleset version/fingerprint in the tool_registry row (ties to §5 metadata); no adapter change needed. |
| P2 | ✅ pass | yes | S | §4 | §4 OSV-Scanner wired with a real adapter that runs the tool | Optional: map full CVSS vector to a precise bucket. |
| P2 | ✅ pass | yes | S | §4 | §4 Gitleaks wired with a real adapter that runs the tool | Add an optional history-scan mode guarded by scope for repo assets. |
| P2 | ✅ pass | yes | S | §5 | §5/§23 'agent-ready' requires install + version + health-check + a real lab run with evidence (not readiness alone) | Optionally require a stored evidence artifact before marking verified, to make the rule self-evidently complete. |

### B — Runtime: job queue, worker, sandbox isolation, scope & network enforcement, secrets (§6,7,8,9,19,27)

_The durable core is genuinely strong and test-backed: a SQLite-backed queue with idempotency keys (unique index + enqueue dedup), leases, per-asset serialization, and crash-safe reclaim that turns a dead running job into 'undetermined' rather than silently re-running it (queue.py, test_platform.py TestQueue, test_failure_modes test_5). Policy is re-checked at enqueue AND inside the worker before the tool runs, targets are re-derived from stored asset+params (never trusted from the caller), SSRF is blocked by IP-pinned connections with correct SNI (http_headers.py, tls_certificate.py) and private/loopback/link-local/cloud-metadata ranges are denied (scope.py, test_platform TestScopeNetwork). The subprocess runner is no-shell, bounded (RLIMIT_CPU/NOFILE/FSIZE/NPROC), new-session so kill reaches the whole tree, with per-job tempdir cleanup; container isolation (non-root, cap_drop ALL, mem_limit, pids_limit) lives in deploy/. However, several §7/§8/§9/§19/§27 requirements are partial or missing: (1) cancel terminates the process group but a cancelled CLI job is routed through the retry path and ends as 'failed' (not 'Cancelled'), and cancel time is never measured; (2) scope.allowed_ports is stored and shape-validated but NEVER enforced at policy or network layer; (3) egress is not actually disabled at the network layer for local scans (HTTPS_PROXY is injected into every tool env; no netns/no-network); (4) credential_ref (§19) is scaffold-only — a secret_refs column/attribute with no secret store, no resolution, and no injection path; (5) no §27 performance tests exist (accept<2s p95, status<5s p95, cancel<10s); (6) there is no distinct 'Partial' or 'Timed-out' terminal state. None are blockers for the lab demo, but items 1–5 stand between this and a defensible 10/10._

| P | State | Feasible | Eff | Ref | Requirement | Fix |
|---|---|---|---|---|---|---|
| P1 | ⬜ missing | partial | M | §7 | Egress disabled for local scans that do not need it | When a connector reports needs_network=False, run it with network disabled: drop HTTPS_PROXY/HTTP_PROXY from base_env and (where available) run under an isol… |
| P1 | ⬜ missing | yes | L | §19 | credential_ref secret handling: worker obtains the authorized secret when needed; the model/logs/reports never see it | Add a secrets store (0600 file or an encrypted DB table keyed by credential_ref), a resolve_credential(ref) used only inside the worker that injects values v… |
| P1 | ⬜ missing | yes | M | §27,§15 | §27 performance targets measured/tested: job accept <2s p95, status <5s p95, cancel <10s; no log loss on restart; no secret in visible output | Add a perf test module that records a documented scenario (hardware/load/job count) and asserts: time from POST /scans to job_id < 2s; time to a status chang… |
| P1 | 🟡 partial | yes | M | §9,§27,§15.6 | Cancel actually kills the subprocess + its children AND the job ends in the Cancelled state | In worker.process/_handle_retryable, check stop_requested (or ctx.stop_event / run.cancelled) BEFORE treating a ConnectorError as retryable; if a stop was re… |
| P1 | 🟡 partial | partial | M | §7 | Per-job sandbox: cpu/mem/time/storage limits, non-root, private per-job workspace with cleanup | Document that the container-isolated (compose) worker is the supported sandbox and gate active/heavy connectors off the in-process worker; or add per-job cgr… |
| P1 | 🟡 partial | yes | S | §7,§8 | Scope enforced at server+network layer: IPv4+IPv6, ports, redirects, DNS-rebinding, cloud-metadata block, out-of-scope rejection | Add an allowed_ports check in policy.evaluate_job / scope.check_targets: derive the port for each network target (from URL or params.port) and reject when al… |
| P2 | 🟡 partial | yes | M | §9 | Job state machine covers Queued/Running/Succeeded/Partial/Failed/Cancelled/Timed-out as distinct, observable states | Either add explicit terminal states 'partial' and 'timed_out' to the jobs.state enum + queue.complete() whitelist + metrics.py, or document the mapping. Mini… |
| P2 | ✅ pass | yes | S | §9,§27 | Idempotency keys + a mechanism that stops two workers executing the same job (no unintended double-execution) | Gate the requeue in _handle_retryable on connector.capabilities().get('active'): for active connectors, end as 'undetermined' with a message instead of auto-… |
| P2 | ✅ pass | yes | M | §9,§27 | Heartbeat, worker-reconnect vs re-run distinction, and state recovery after worker restart | Optional: add a workers/heartbeat row (worker_id, last_seen, current_job) updated on each renew, surfaced in metrics; and run reclaim_expired from a lightwei… |
| P2 | ✅ pass | yes | S | §9,§10 | Partial-failure classified clearly with completed evidence retained | Covered by the §9 job-state item (promote partial to a first-class state) — otherwise behaviour is correct. |
| P2 | ✅ pass | yes | S | §9,§27 | Global stop switch halts running jobs and prevents new jobs starting until resumed | No change needed beyond the cancel-state item. |

### C — Findings schema, evidence, remediation cycle, AI agent roles, reports (spec §10, §11, §14)

_The findings/evidence/AI/report stack is genuinely built and stdlib-only, with real strengths: schema-constrained AI (no free shell), a sanitizer that wraps all untrusted text and neutralizes injection, deterministic fallbacks so base scans work with no model, redaction applied at ingest/evidence/report boundaries, and HTML reports that escape every field. But against §10/§11/§14 it is incomplete in concrete, verifiable ways. The unified findings schema is missing three of the fourteen §10 fields as first-class, persisted columns (safe-verify-step, suggested-fix distinct from recommendation, retest-result); dedupe keeps an occurrence count but discards the set of contributing tools/jobs ("keeping sources" is lost); the remediation cycle has no assign step, no dedicated retest_finding operation (§18), and close does not require linked evidence. AI roles cover 5 of the 6 named in §11 (no EvidenceReviewer; Orchestrator is only a proposal planner with no budget-aware orchestration), and the declared AI cost/token budgets are never enforced. Reports omit CSV and PDF (§14 lists both), surface no coverage/limits or vuln-DB date and no "no findings != safe" statement, and their "executive summary" is only severity counts — the bilingual narrative from the reporting agent is a separate endpoint never merged into the downloadable formats. RTL and no-secret-leak across formats are correctly handled._

| P | State | Feasible | Eff | Ref | Requirement | Fix |
|---|---|---|---|---|---|---|
| P1 | ⬜ missing | yes | M | §10 | Show scanned vs not-scanned, exclusions/failures, vuln-DB date; never treat 'no results' as a safety guarantee | Aggregate job summaries (coverage, partial, failures, tool versions, advisory-DB timestamps) into build_report; add a 'Coverage & Limits' section to JSON/MD/… |
| P1 | ⬜ missing | yes | S | §14 | Reports support CSV (and all §14 formats) | Add reports.to_csv(project_id) using the stdlib csv module over the redacted _loc findings, and register 'csv' in REPORT_FORMATS with text/csv content type. |
| P1 | 🟡 partial | yes | M | §10 | Unified findings schema carries all 14 §10 fields as first-class persisted data | Add columns safe_verify_step, suggested_fix, retest_result (+ retest_job_id, retest_at) to findings; persist agents.remediation output when an operator accep… |
| P1 | 🟡 partial | yes | M | §10 | Dedupe aggregates duplicates while keeping their sources; repeated alert is not auto-counted as independent evidence | Add a finding_sources table (finding_id, connector, job_id, tool_version, first_seen, last_seen) and append a row per observation in ingest(); render the sou… |
| P1 | 🟡 partial | yes | L | §10 | Remediation cycle discover→verify→prioritise→assign→fix→retest→close-with-evidence; retest_finding wired | Add assignee fields + /api/findings/<id>/assign; add retest_finding that enqueues a targeted job for the finding's connector/asset and writes retest_result; … |
| P1 | 🟡 partial | yes | M | §11 | AI roles: Orchestrator, Triage, EvidenceReviewer, Remediation, Verification, Reporting | Add an evidence_reviewer(finding, evidence) agent returning {sufficient:bool, limits:str, needs:[...]} with a deterministic fallback; extend planner into an … |
| P1 | 🟡 partial | yes | M | §11, §14 | Local-model + external-key-with-budget options; budget cap enforced | Track per-project token/cost spend from provider meta.usage; before each generate_structured check cumulative vs ai_token_budget/ai_cost_budget_usd and fall … |
| P1 | 🟡 partial | yes | M | §14 | Reports deliver a real bilingual exec summary + technical report (not just counts); reporting agent output usable | Call agents.reporting(metrics, top_findings) inside build_report and render executive_summary_ar/en + top_risks into MD/HTML/JSON (with the deterministic fal… |
| P2 | ⬜ missing | partial | L | §14 | Reports support PDF with correct Arabic RTL and no secret leak | Pragmatic path: ship the existing print-optimized HTML report (reports.py already has @media print) and document browser 'Print to PDF' as the supported mech… |
| P2 | ✅ pass | yes | S | §10 | Secret/PII redaction before display and before sending to AI | Add high-entropy-token heuristic and configurable custom patterns; add a unit corpus of secret shapes asserting redaction at each boundary (ingest, evidence,… |
| P2 | ✅ pass | yes | S | §10 | Distinguish suspected vs confirmed vs unverifiable | Add explicit bilingual labels mapping the enum to suspected/confirmed/unverifiable in reports and UI. |
| P2 | ✅ pass | yes | S | §10 | Block tool/finding output from rendering as executable HTML | No change needed in reports; add a test asserting an HTML/script payload in a finding title is escaped in the HTML report. |
| P2 | ✅ pass | yes | S | §11 | No free shell for the model; tool/target/log text treated as untrusted (injection-resistant); separate AI-opinion vs tool-result vs actual-verification | Add an adversarial test: embed 'ignore instructions, scan evil.com' in a finding description and assert the planner/triage output cannot introduce an out-of-… |
| P2 | ✅ pass | yes | S | §11 | Base scans and structured reports work with no model configured | No change; keep a regression test asserting full scan→report with FSL_AI_PROVIDER=none. |
| P2 | ✅ pass | yes | S | §14 | RTL correctness and no secret leak in every report format | Add a cross-format leak test seeding a canary into a finding + evidence and asserting absence in json/sarif/md/html; optionally redact SARIF fields a second … |

### D — Professional bilingual UI (§12 screens, §21 Tools & Licenses, §22 agent run cards)

_The SPA (web/app.js, 1229 lines; app.css; index.html) is a genuinely bilingual, CSP-safe vanilla-JS console with real wiring: every screen calls real server routes in app/server.py (metrics, assets, scopes, connectors, catalog, jobs, findings, evidence, reports, audit, ai) and RTL/LTR + AR/EN, mobile/Safari, and reduced-motion are handled well. However several §12 screens are only partially realized: the Tools Center is a read-only catalog with no install/update/config/run actions; Results & Evidence has no sort/search/compare; Scan Space has no scan-file picker and no live polling (manual refresh only); Fix & Retest has remediation + status transitions but no retest execution or result linkage; and Cost is absent from the UI and backend entirely. The §21 Tools & Licenses screen does not surface license/link-method/key-need/quota/activation/last-test/cost/free-alternative (most fields exist in tool_registry but are never rendered; the 76-tool catalog seed lacks them altogether). The §22 "agent run cards" are missing — the Agent screen is simulation-only, real job cards live on the Scan screen and omit target/purpose/auth-state/job_id/last-event/cancel, and request_id/plan_id/commit_id linkage does not exist (only job_id↔finding_id). A light theme (explicit §12 requirement) is absent; accessibility and loading states are thin._

| P | State | Feasible | Eff | Ref | Requirement | Fix |
|---|---|---|---|---|---|---|
| P1 | ⬜ missing | yes | L | §22 | §22 Agent run cards (tool/target/purpose/auth-state/job_id/start/phase/last-event/cancel/result/evidence link) | Render real run cards in the Agent console (and/or enrich openJob) with tool, target, purpose, authorization state, visible job_id, start time, phase, last-e… |
| P1 | 🟡 partial | yes | L | §12 | Screen 3 — Tools center: install / update / health / config / run | web/app.js scrCatalog (~L505-519): add per-tool actions (sync/re-probe → POST /api/tools/sync or a new per-tool probe route, a config drawer backed by tool_r… |
| P1 | 🟡 partial | yes | M | §12 | Screen 5 — Results & evidence: sort / search / compare / verify | web/app.js scrFindings (~L573-582): add a search input and sortable headers (client-side over the fetched list) and a compare view (diff two jobs'/versions' … |
| P1 | 🟡 partial | yes | L | §12 | Screen 6 — Fix & retest: link issue → change → subsequent result | Add a 'Retest' action in openFinding that enqueues a scoped re-scan for the finding's asset/connector and records the new job_id + outcome on the finding; ad… |
| P1 | 🟡 partial | yes | L | §12 | Screen 8 — Reports & cost & activity log | Add a cost view (per-scan estimate + AI token/compute spend) to the Reports screen and a cost field to metrics.snapshot; add coverage/limits sections to app/… |
| P1 | 🟡 partial | yes | M | §21 | §21 'Tools & Licenses' screen: per-tool name/version/source/link-method/license/usage/key-need/quota/activation-state/last-test/cost/free-alternative | Add a Tools & Licenses table (or expand scrCatalog) rendering license, connector_type, secret_refs, cost, last_verified_at from /api/tools; add quota/activat… |
| P1 | 🟡 partial | yes | M | §22 | §22 Traceability linkage: request_id ↔ plan_id ↔ job_id ↔ finding_id ↔ commit_id | Persist plans with a plan_id and a request_id, stamp jobs with request_id/plan_id, and add commit_id to findings/remediation; show the chain in the run card … |
| P1 | 🟡 partial | yes | M | §12 | Dark default + light option | Add a light token set under :root[data-theme=light] (and optionally @media prefers-color-scheme:light) and a theme toggle in the sidebar next to the language… |
| P2 | 🟡 partial | yes | M | §12 | Screen 1 — Command center: asset/job/finding/coverage status | web/app.js scrDashboard (~L435-457): replace the `JSON.stringify(m.catalog_states)` dump with a proper coverage tile/bar (assets scanned vs total, last-scan … |
| P2 | 🟡 partial | yes | M | §12 | Screen 4 — Scan space: pick asset/tool/scan-file + follow live run | web/app.js scrScans (~L522-551): add a scan-profile/scan-file selector (connector params) and a lightweight poll (setInterval re-fetch of /api/projects/{pid}… |
| P2 | 🟡 partial | partial | M | §12 | Screen 7 — AI lab: tests of AI apps/agents and their results | Keep the screen; add result history for eval runs and wire the ai_redteam connector (or a Promptfoo/PyRIT adapter) so a configured provider produces real app… |
| P2 | 🟡 partial | yes | M | §12 | Accessibility | Make clickable rows keyboard-operable (role=button + tabindex=0 + Enter/Space, or a focusable cell button), add aria-current to the active nav button, and a … |
| P2 | 🟡 partial | yes | S | §12 | Loading / error / reduced-motion states; no demo numbers shown as live | Add lightweight per-screen loading placeholders (skeleton rows/spinner) in setMain/renderScreen before the await resolves; keep the existing error/retry and … |
| P2 | ✅ pass | yes | S | §12 | Screen 2 — Assets & scope management (what may be scanned and its bounds) | No change required; optionally add inline validation hints for allowed_targets format. |
| P2 | ✅ pass | yes | S | §12 | Arabic + English with RTL and LTR | No change required. |
| P2 | ✅ pass | yes | S | §12 | Mobile + Safari support | No change required; verify on a real iOS Safari as polish. |

### E — Acceptance tests, CI gates, release prep, deploy & post-deploy verify (spec §13,15,16,23,25,26,28,29,30)

_The platform has a genuinely strong, real (not mock) test and acceptance layer: the full suite is 511 tests, 2 skipped, exit 0 (I ran it: 227s), and `scripts/acceptance.py` passes 10/10 gates here against real scanners (bandit/semgrep/gitleaks/pip-audit verified, osv ready, trivy blocked). The CI workflow at the repo root (`.github/workflows/faisal-security-lab-ci.yml`) runs install-tools → `make test` → acceptance gates → verify, with a least-privilege read-only token that is itself tested (`TestWorkflowFile`). Of the §15 twelve acceptance tests, nine are covered by real tests; three are weak: cancel is not *measured* end-to-end (no timed real-job cancel+kill test despite the 10s target), the AI token/cost budget is defined but not enforced, and the mobile journey is manual screenshots only. The biggest release-readiness gaps are in §28/§29/§30: there is NO type-check gate (spec §29 mandates type checks), no CI gate that blocks release on confirmed critical/high self-scan findings, no documented previous-version id / rollback procedure anywhere in the repo, and no automated post-deploy verification script. Production deploy + post-deploy verify (§30/§29) is an external blocker in this container: egress to fly.io/render.com is 403-blocked and no deploy CLI is present, so no production URL can be reached or verified from here._

| P | State | Feasible | Eff | Ref | Requirement | Fix |
|---|---|---|---|---|---|---|
| P0 | ⛔ blocked | external_blocker | M | §30 | §30 + §29: deploy the tested build to the production project and actually VERIFY the live release (domain opens, sign-in, API+worker+tools ready, create job via agent, tool runs, cancel, no new errors) | Owner action: deploy via Render Blueprint (render.yaml) or `fly deploy`, then run the §29 7-step verification against the live URL and record production URL … |
| P1 | ⬜ missing | yes | M | §29 | §29: resolve confirmed critical/high security findings (and unverified critical alerts) before declaring the gate passed; do not bypass by disabling a test | Add a CI gate that runs bandit/semgrep/gitleaks against app/ (the platform's own code) with a committed baseline + expiring exceptions, failing on new confir… |
| P1 | ⬜ missing | yes | M | §29 | §29: an automated, repeatable post-deploy verification (smoke) pipeline for the 7 live checks | Add scripts/postdeploy_verify.py (stdlib urllib) taking BASE_URL+owner creds: assert /api/health, sign-in, /api/me roles, tool readiness via /api/tools, crea… |
| P1 | 🟡 partial | yes | M | §15 | §15 #6: cancel a real job, terminate its child processes, and MEASURE the cancel time (target ≤10s, §15/§27) | Add a test in tests/test_failure_modes.py: register a synthetic connector that execs a `sleep 120` tool via base.run_tool, enqueue+run it in a Worker thread,… |
| P1 | 🟡 partial | yes | M | §15 | §15 #11 / §14 / §27: enforce rate, resource AND budget limits (incl. AI token/cost budget, stop at budget) | Enforce ai_token_budget/ai_cost_budget_usd in app/ai/provider.py: accumulate tokens/cost per project (or process) in the db settings/metrics table, refuse ca… |
| P1 | 🟡 partial | yes | M | §26 | §26 acceptance matrix axes 1–9: current Pass/Partial/Fail with evidence | Add a gate/test for the agent loop (request→plan→job→evidence-backed analysis); enforce the AI budget (axis 8); add perf-assertion tests or clearly mark the … |
| P1 | 🟡 partial | yes | S | §26 | §26 axis 10 / §28: deploy the tested build AND provide a verified rollback plan | Add docs/DEPLOY.md 'Rollback' section: Fly = `fly releases` + `fly deploy --image <prev>` (or `fly releases rollback`); Render = redeploy previous deploy; Do… |
| P1 | 🟡 partial | yes | M | §29 | §29 CI gates must include build + TYPE checks + mandatory tests + integration/permission/isolation tests | Add `make typecheck` (mypy or pyright) and a CI step before `make test`; start non-blocking if needed then tighten. No build step required for stdlib; state … |
| P2 | 🟡 partial | partial | S | §15 | §15 #12 / §26 axis9: core journeys work in Arabic AND English AND on mobile | Either add a headless small-viewport render check (stdlib can't drive a browser, so this is screenshot-evidence-only and should be stated as such in ACCEPTAN… |
| P2 | 🟡 partial | yes | M | §28 | §28: database migrations must be reversible (rollback-compatible), with backup/plan before destructive change | Add a lightweight migration registry in app/db.py keyed by schema_version with forward steps and documented reverse steps; on start, back up the DB (VACUUM I… |
| P2 | 🟡 partial | yes | S | §16 | §16/§26: reported acceptance evidence (test counts) must be accurate and reviewable | Refresh ACCEPTANCE.md and RELEASE-NOTES.md to the current counts (511/2) from an actual run on the release commit, or generate the number from evidence/test-… |
| P2 | ✅ pass | yes | S | §15 | §15 acceptance tests #1,2,3,4,5,7,8,9,10 covered by real tests (install+import, asset→report journey, out-of-scope block API+network, cross-project block, no secret leak, worker-restart no dup, partial-result, discover→fix→retest, reject injected instructions) | Optionally add one owner-authenticated HTTP end-to-end test that POSTs a scan and reads back the report, to make #2 a single named journey. Otherwise no chan… |
| P2 | ✅ pass | yes | S | §28 | §28: pin tool/rule versions for the release; maintain a version/release log tied to commit | Optional: add SHA256 verification to install-tools.sh for the GitHub-release binaries; add a RELEASE log table (commit, image, prev-version, rollback) alongs… |

### F — Environment feasibility (tool install + runnability in this container and the production image)

_The base toolchain is strong: Python 3.13.18, Node 22.23.4/npx 10.9.9, Go 1.24.7, OpenJDK 21, openssl 3.0.13, git 2.43.0, 21G free disk and 15G RAM. Egress is proxy-gated: pypi.org, files.pythonhosted.org, registry.npmjs.org and proxy.golang.org all return 200, but github.com release-asset downloads return 404 and Render/Fly hosts fail the CONNECT tunnel with 403. Of the 11 spec §4 tools, the platform genuinely integrates and this container ships only 5 as ready (semgrep, osv-scanner, gitleaks via binaries; bandit/pip-audit are extra, not §4). Trivy has a real connector but is MISSING here (its github download is blocked at runtime; Dockerfile tolerates it with `|| true`). The remaining six §4 tools (ZAP, Nuclei, Syft, testssl.sh, Schemathesis, Promptfoo, PyRIT) are neither installed nor wired to any connector — the platform substitutes stdlib http_headers (passive web) and tls_certificate (TLS) for ZAP/testssl.sh, and has no SBOM, API-schema, or AI red-team-tool connector at all (the ai_redteam connector is a 4-probe stdlib stub, blocked without an AI provider). pip/npm/go-proxy reachability means most of the gaps are installable HERE; ZAP and live Render/Fly deploy are the only true external blockers._

| P | State | Feasible | Eff | Ref | Requirement | Fix |
|---|---|---|---|---|---|---|
| P1 | ⬜ missing | external_blocker | L | §4 | ZAP — dynamic web app scanning (passive default, scoped active) | Either build a real ZAP connector that drives a headless `zap.sh -daemon` (JRE is present) with a scoped scan policy, or explicitly document http_headers as … |
| P1 | ⬜ missing | partial | M | §4 | Nuclei — templated config/exposure scanning | Install via `go install github.com/projectdiscovery/nuclei/v3/cmd/nuclei@<pin>` (Go proxy allowlisted) and add a connector with a reviewed, version-pinned te… |
| P1 | ⬜ missing | partial | M | §4 | Syft — SBOM generation | `go install github.com/anchore/syft/cmd/syft@<pin>` via the Go proxy, add a connector that emits SBOM and links components to versions/findings. Alternativel… |
| P1 | ⬜ missing | yes | M | §4 | Schemathesis — API schema/property testing | `pip install schemathesis==<pin>` into the sectools venv (pypi reachable) and add a connector that runs against a lab OpenAPI spec, isolated from production … |
| P1 | ⬜ missing | yes | M | §4 | Promptfoo — AI app/agent evaluation | Install via `npx promptfoo@<pin>` or npm (registry reachable) and add a connector running a controlled eval set against the project's own AI endpoints with t… |
| P1 | ⬜ missing | yes | L | §4 | PyRIT — AI risk identification / red-teaming | After confirming the correct distribution, `pip install` into an isolated venv and add a connector driving controlled attacks against the project's AI with t… |
| P1 | 🟡 partial | partial | L | §4/§5 | Production image ships the full §4 tool set | Decide per tool: integrate (add install steps + connectors for nuclei/syft/schemathesis/promptfoo) or formally document the stdlib substitutes (http_headers,… |
| P1 | ⛔ blocked | external_blocker | S | §4 | Trivy — container/config/secret scanner connector | For local/CI use, vendor the pinned trivy binary or install via a reachable mirror; optionally add a go-install fallback (Go 1.24.7 + proxy.golang.org=200). … |
| P1 | ⛔ blocked | external_blocker | M | §30 | Container can reach Render/Fly for deploy + post-deploy verification (§30) | Perform deploy + verification from an environment with egress to Render/Fly (owner's CI or an allowlisted environment), or add those hosts to the environment… |
| P2 | ⬜ missing | external_blocker | S | §4 | testssl.sh — TLS configuration reporting | Document tls_certificate as the deliberate low-footprint substitute, OR vendor the testssl.sh script (bash + openssl 3.0.13 both present, so it would run) an… |
| P2 | ✅ pass | yes | S | §4 | Semgrep CE — code SAST connector, installed + runnable | No change needed; keep pin current. |
| P2 | ✅ pass | yes | S | §4 | OSV-Scanner — dependency/lockfile connector, installed + runnable | No change needed. |
| P2 | ✅ pass | yes | S | §4 | Gitleaks — secrets connector, installed + runnable | No change needed. |

## Execution phases (sequential; independent units parallelised within a phase; one integrator)

- **Phase 1 — Scope/permission & job-reliability hardening (backend):** enforce `allowed_ports` at policy
  + network layer; add `Cancelled`/`Partial`/`Timed-out` terminal states and route cancelled jobs
  correctly; measure cancel time; time-limited signed execution-permission token (v4 §19); egress-disable
  for local scans. + tests.
- **Phase 2 — Agent Tool Gateway & new real connectors:** formal gateway exposing the nine §18 contracts
  (incl. `estimate_resources`, `retest_finding`); credential_ref secret store + taxonomy; add Syft,
  testssl.sh, Schemathesis connectors (installable here) + install Trivy; Nuclei with a pinned offline
  template set. + tests.
- **Phase 3 — Findings/evidence/reports:** all 14 §10 fields first-class; dedupe-keep-sources;
  conflicting-evidence ledger + evidence expiry (v4); coverage + vuln-DB date + "no results ≠ safe"; CSV
  (and SARIF where representable); bilingual exec+technical report merged into downloads; EvidenceReviewer
  + version-verifier roles; enforced AI budget. + tests.
- **Phase 4 — Campaigns, scheduler, autonomy:** campaign model with dependency plan + hard total caps +
  campaign-cancel; resource-aware scheduler + circuit breaker; the chat→plan→run→evidence→retest autonomy
  chain (§17/§23). + tests.
- **Phase 5 — UI:** agent/campaign run cards (job_id/phase/cancel/evidence), Tools Center actions,
  Results sort/search/compare, Fix & Retest execution, Tools & Licenses screen, cost view, light theme,
  request_id/plan_id/job_id/finding_id/commit_id traceability, conflicting-results view.
- **Phase 6 — Acceptance, benchmark lab, release:** reference benchmark lab + held-out eval set +
  version-over-version metrics; measured cancel/perf tests; budget/rate/resource limit tests;
  campaign/permission acceptance tests; CI type-check gate; resolve confirmed critical/high self-scan
  findings; rollback plan + automated post-deploy verify script; refresh ACCEPTANCE.md + README; prepare
  the release; **deploy = owner action in Render** (document precisely).

Each phase ships as a tested, committed, pushed increment; the combined build is re-tested after each
integration (§25). External blockers (ZAP end-to-end, live Render deploy) are marked honestly, never faked.

## Progress log

- **Phase 1 — done.** `allowed_ports` enforced at the network layer; cancel→`cancelled` with a measured
  cancel time; over-limit→`timed_out`; time-limited signed execution-permission grant per job (v4 §19);
  egress withheld for local scans. +10 tests. (axes 4, 5, 6 advanced)
- **Phase 2 — done.** Agent Tool Gateway (`app/gateway.py`) exposing the nine §18 contracts
  (`list_capabilities`, `validate_request`, `estimate_resources`, `start_job`, `get_job_status`,
  `cancel_job`, `collect_evidence`, `normalize_findings`, `retest_finding`); every scan now goes through
  it. `credential_ref` secret store (`app/secretstore.py`) with the §19 kind taxonomy — the value reaches
  only a tool's environment, never a job record, the audit log, a report or the model; a connector whose
  required secret is unconfigured is blocked. New routes: scan estimate/validate, finding retest, gateway
  capabilities, owner-only secret set/list/delete. +12 tests. (axes 1, 2, 5, 7, 8 advanced)
  - Deferred, honestly: the additional scan-engine binaries (Syft, testssl.sh, Schemathesis, Nuclei,
    Trivy install) — the gateway + connector contract are ready for them; adding each connector with a
    verified install is tracked for a follow-up so readiness stays honest, not catalogued-as-done.
- **Phase 3 — done.** Conflicting-evidence ledger (`app/conflicts.py` + `finding_conflicts` table, v4
  §10): a reappearance after a fix, or a re-observation under a different tool/version, opens a conflict
  that stays `needs_verification` — never silently a fix; evidence expires on a context change and the
  prior human verdict is reset. Findings keep all contributing **sources** (dedupe-keep-sources) and gained
  the §10 first-class fields `context_ref`, `safe_verify_step`, `suggested_fix`, `retest_result`. Reports
  now state **coverage** (tools run vs available, assets scanned, open conflicts), carry a bilingual
  **"absence of findings is not safety"** note, and export **CSV** (BOM + formula-guarded + comma-safe) on
  top of JSON/SARIF/MD/HTML. New routes: project/finding conflicts, conflict resolve, retest outcome,
  report `?format=csv`. +7 tests. (axis 3 advanced; axis 7 retest result persisted)
- **Phase 4 — done.** Campaign engine (`app/campaigns.py` + `campaigns` table, v4 §20): a
  dependency-ordered plan of scan tasks with hard total caps — `max_tasks`, `max_concurrency` and
  `per_asset_max_tasks` — so parallel tools cannot exceed an asset's budget by splitting requests. Each
  task still goes through the gateway (policy-checked, grant-verified). `claim_next` is now
  dependency-aware: a task waits for its prerequisites, is blocked (`dependency_failed`) if one cannot
  succeed, and a cancelled campaign stops its running and pending tasks. Per-connector **circuit breaker**
  (`app/circuit.py`, §27): repeated real failures open the breaker and new jobs for that connector are
  held back for a cooldown while everything else keeps working; a success closes it. New routes: campaign
  create/list/get/cancel, circuit status. +7 tests. (axes 2, 4, 6 advanced)
  - The deterministic campaign orchestration + gateway are the enforced execution path (§18/§20). The AI
    planner proposes plans; turning a plan into a running campaign is operator-initiated by default, which
    keeps execution authority in the server, not in the model (v4 §11). A planner→campaign auto-bridge is
    the remaining thin layer.
