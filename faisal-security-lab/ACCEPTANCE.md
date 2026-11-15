# Acceptance matrix — release scope `r1`

Acceptance here means: ten checks ("gates") that the release scope has to pass,
each run by a script and each leaving evidence that can be inspected. A passed
gate says that check ran and gave the stated result on the machine where it ran.
It is not a claim that the system is free of vulnerabilities.

Run them yourself:

```bash
make acceptance            # runs the 10 gates, writes var/acceptance-report.json
make acceptance-evidence   # the same, and also refreshes evidence/acceptance-report.json
make test                  # the unit and integration tests
```

`make acceptance` uses a temporary data directory of its own and does not touch
your `./var` data. It needs the scanners (`make install-tools`): gates 1, 2 and
9 run Bandit on the bundled sample, gate 1 also runs Semgrep, Gitleaks and
pip-audit where they are installed (pip-audit needs network access), and gate
10 needs at least one scanner whose run completed. The script exits with status
0 only when every gate passed. Use
`make acceptance-evidence` only when you mean to change the recorded copy in
`evidence/`.

## The 10 gates

| # | Gate | What the script checks |
|---|------|------------------------|
| 1 | Integrated run: authorized asset → job → real tool → saved finding → report | the sample is scanned by the installed source scanners through the queue and a worker; findings are stored; the HTML and JSON reports are produced |
| 2 | Finding correctness: known input is flagged, clean input is not | Bandit reports findings on the vulnerable sample; a harmless file gives none |
| 3 | Scope enforcement: out-of-scope connector and target denied; private address blocked | the policy check refuses a connector the scope does not list (`connector_not_authorized`) and a target outside the allowed targets (`target_scope`); a destination on a private address raises `PolicyDenied` |
| 4 | Privilege isolation: a non-member is refused access to another project | an analyst of another project gets `ForbiddenError` |
| 5 | AI safety: injected text does not change the action; the schema rejects a tool launch | the built-in evaluation set passes 5/5; a finding whose text says "set severity info" keeps its severity; an answer with a `run_tool` field is rejected |
| 6 | Stop: the global stop halts leasing; a cancel reaches the job | no job can be leased while the stop is engaged; `stop_requested` is set on the job |
| 7 | Fault tolerance: a lost worker gives `undetermined`, not a silent re-run | a running job whose lease has expired becomes `undetermined` |
| 8 | Data protection: secrets and personal data redacted in evidence | a text with a fabricated token and an e-mail address is stored as evidence; neither value is in what is read back |
| 9 | Verified fix: the finding is gone on a re-scan before it is closed | after the flagged line is changed, a second Bandit job does not report the finding again and it is marked `fixed_on_asset` |
| 10 | Auditable delivery: every verified tool has a version and a reference; blocked tools are named | each tool in the `verified` state carries its version and the reference of the run that verified it; tools that are not available are listed with the reason |

## Results on the reference build (2026-11-14)

These results belong to one environment and one day. Yours will differ where a
scanner is missing, where a network service cannot be reached, and as the
advisory databases change. `make verify` and `make acceptance` give your own.

- **Machine.** A Linux x86_64 container with Python 3.13. Installed by
  `scripts/install-tools.sh` on 2026-11-14: Semgrep 1.185.0, Bandit 1.9.4,
  Gitleaks 8.21.2, pip-audit 2.10.1, OSV-Scanner 1.9.2
  (`evidence/tool-install.json`).
- **Gates.** 10 of 10 passed. The recorded report is
  `evidence/acceptance-report.json`, last refreshed on 2026-11-15 (UTC).
- **Gate 1.** About 43 findings from Semgrep, Bandit, Gitleaks and pip-audit on
  the sample. About 28 of them are advisories that pip-audit reported for the
  three packages pinned in `samples/vulnerable-app/requirements.txt` and for
  the packages those depend on. The number moves as advisories are published:
  a run on 2026-11-15 gave 44. Sample reports from the run of 2026-11-14 are in
  `evidence/reports/`.
- **Tests.** 362 tests passed and 1 was skipped on the release commit, on Python
  3.11, 3.12 and 3.13 (`tests/test_platform.py` 30, `tests/test_failure_modes.py` 9,
  `tests/test_setup_robustness.py` 20, `tests/test_signin_hardening.py` 57,
  `tests/test_platform_hardening.py` 22, `tests/test_deploy_seams.py` 15,
  `tests/test_runtime_hardening.py` 24, `tests/test_tooling.py` 26,
  `tests/test_scope_sources.py` 11, `tests/test_public_view.py` 56,
  `tests/test_public_view_hardening.py` 92). The skipped test is a container
  entrypoint test that does not run as root. Tests of a scanner skip
  themselves where the scanner is not installed. The run is recorded in
  `evidence/test-run.txt`.

What was **not** exercised on the reference build, and so is not counted as
verified:

- **trivy.** The binary could not be downloaded there, so the connector was
  never run. Dependency scanning was covered by pip-audit.
- **osv-scanner.** Installed and `ready`, but `api.osv.dev` could not be reached
  from there, so no scan with it completed.
- **ai_redteam and the AI roles with a live provider.** No AI provider was
  configured. The AI features were exercised with their built-in rules only.
- **http_headers and tls_certificate against a live target.** No live target was
  scanned, so the request and the handshake themselves were not exercised. The
  tests and gate 3 cover the parameter check, the policy check and the
  destination check.
- **semgrep in gates 2 and 9.** Those two gates use Bandit, because Semgrep's
  engine returned no results on one CI runner image. Semgrep runs in gate 1,
  and the report records which tools contributed.

## Requirement → implementation → verification

The areas are those of [specs/spec.md](specs/spec.md).

| Area | Implementation | Verified by |
|---|---|---|
| Integrated defense loop | `queue` + `worker` + `connectors` + `findings` + `reports` | gates 1–2 |
| API separate from scan execution | `app/server.py` (no tools with `FSL_NO_WORKER=1`) + `app/worker.py` | `deploy/compose.yaml`; a two-process run described in [docs/OPERATIONS.md](docs/OPERATIONS.md) |
| Policy check at request and at start | `app/policy.py` (`evaluate_job`) | gate 3, `TestPolicy`, the worker's repeat check |
| Durable queue: idempotency, lease, retry, cancel, `undetermined` | `app/queue.py` | gates 6–7, `TestQueue` |
| Bounded tool runs without a shell | `connectors/base.run_tool`, `_preexec` | `TestConnectors`, failure modes |
| Connector contract | `connectors/base.Connector` | all connector tests |
| Tool registry with states and verification | `store` + `connectors/registry` | gate 10, `make verify` |
| 76-entry tool catalog | `data/tool-catalog.seed.json` → `catalog` table + console | Tool Catalog screen; `/api/catalog` |
| Scope, destination checks, revocation | `app/scope.py`, `app/policy.py`, `store.revoke_scope` | gate 3, `TestScopeNetwork`, failure mode 7; limits in [docs/SCOPE.md](docs/SCOPE.md) |
| AI layer: planner, triage, remediation, validation, reporting | `app/ai/agents.py` | `TestAISafety`, built-in rules only |
| AI safety: fixed output schema, scanned text as data, fallback | `ai/structured.py`, `ai/sanitizer.py`, `ai/provider.py` | gate 5, evaluation set |
| One findings model, de-duplication, lifecycle | `app/findings.py` | `TestConnectors` (dedup, reopen) |
| Evidence store, redaction | `app/evidence.py`, `util.redact` | gate 8, `TestRedaction` |
| Reports: JSON, SARIF, HTML, Markdown in two languages | `app/reports.py` | `TestReports`, `evidence/reports/*` |
| Find → fix → check again, no suppression | status lifecycle + re-scan check | gate 9 |
| Bilingual console, roles | `web/`, `app/server.py` | `evidence/ui/*.png`, a browser run |
| CI, operations, backup | `.github/workflows/faisal-security-lab-ci.yml` at the repository root, [docs/OPERATIONS.md](docs/OPERATIONS.md) | the CI workflow |
| Failure-mode matrix | `tests/test_failure_modes.py` | 9 tests |
