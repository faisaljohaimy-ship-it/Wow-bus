# Tasks of release scope `r1`

Each task names the files it produced and the check that covers it. "Covered
by" names tests in `tests/` and gates of [ACCEPTANCE.md](../ACCEPTANCE.md); run
`make test` and `make acceptance` for the current result. What was not run for
this release is listed in
[docs/RELEASE-NOTES.md](../docs/RELEASE-NOTES.md#not-verified-in-this-release).

| # | Task | Files | Covered by | Note |
|---|------|-------|------------|------|
| T1 | Core: configuration, database, models, sign-in and roles, audit, metrics | `app/config.py app/db.py app/auth.py app/audit.py app/metrics.py app/store.py` | `TestRBAC` | |
| T2 | Scopes and the policy check (at request and at start) | `app/scope.py app/policy.py` | `TestPolicy`, gate 3 | |
| T3 | Durable queue and worker | `app/queue.py app/worker.py` | `TestQueue`, gates 6–7 | |
| T4 | Connector contract and connectors | `app/connectors/*` | `TestConnectors`, gates 1–2 | Trivy was not run, and no OSV-Scanner scan completed |
| T5 | Findings, evidence, reports | `app/findings.py app/evidence.py app/reports.py` | `TestConnectors`, `TestRedaction`, `TestReports` | |
| T6 | AI layer and its input and output handling | `app/ai/*` | `TestAISafety`, gate 5 | with built-in rules only; no live provider |
| T7 | HTTP API and the console in two languages | `app/server.py web/*` | the tests that call the API over HTTP, `evidence/ui/*.png` | |
| T8 | Tests, failure modes, acceptance, CI, deploy files, documentation | `tests/* scripts/* deploy/* docs/*`, the CI workflow at the repository root | `make test`, `make acceptance` | |
| T9 | Start-up that tolerates mistyped owner settings; port bound before the tools are probed; storage fallback; entrypoint that drops root | `app/auth.py app/bootstrap.py app/config.py app/worker.py app/connectors/registry.py deploy/entrypoint.sh` | `tests/test_setup_robustness.py`, `tests/test_platform_hardening.py`, `tests/test_deploy_seams.py` | |
| T10 | Sign-in protection: client address from a declared proxy, limits per client with no account lock, fair turns for the password check, bounded audit rows | `app/server.py app/auth.py docs/OPERATIONS.md` | `tests/test_signin_hardening.py` | |
| T11 | Optional public read-only view with a seeded demo project and one filter for everything a guest is sent | `app/demo.py app/guest_view.py app/server.py` | `tests/test_public_view.py`, `tests/test_public_view_hardening.py` | |
| T12 | Console theme: black page, red cards, mask icons, moving code lines, guest mode | `web/* app/reports.py` | a browser run without console errors, `evidence/ui/*.png` | |

Not part of `r1`: active web scanners (ZAP, Nuclei) behind the scope and policy
check with a reviewed set of templates, scanning of container images, and a
scheduler.
