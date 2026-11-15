# Tasks → status (release r1)

| # | Task | Files | Verify | Status |
|---|------|-------|--------|--------|
| T1 | Core: config, db, models, auth/RBAC, audit, metrics | `app/config.py app/db.py app/auth.py app/audit.py app/metrics.py app/store.py` | import + `TestRBAC` | ✅ verified |
| T2 | Scope registry + policy engine (enqueue + exec) | `app/scope.py app/policy.py` | `TestPolicy`, gate 3 | ✅ verified |
| T3 | Durable queue + isolated worker | `app/queue.py app/worker.py` | `TestQueue`, gates 6–7 | ✅ verified |
| T4 | Connector contract + real connectors | `app/connectors/*` | `TestConnectors`, acceptance | ✅ verified (subset; trivy/osv blocked) |
| T5 | Findings + evidence + reports | `app/findings.py app/evidence.py app/reports.py` | `TestConnectors/Redaction/Reports` | ✅ verified |
| T6 | AI layer + safety | `app/ai/*` | `TestAISafety`, gate 5 | ✅ verified (fallback; live provider unconfigured) |
| T7 | HTTP API + bilingual UI | `app/server.py web/*` | HTTP flow + `evidence/ui/*.png` | ✅ verified |
| T8 | Tests, failure modes, acceptance, CI, deploy, docs | `tests/* scripts/* deploy/* .github/* docs/*` | `make test`, `make acceptance` | ✅ verified (10/10, 313 tests) |
| T9 | Start-up that survives mistyped owner settings; fast bind; storage fallback; non-root entrypoint | `app/auth.py app/bootstrap.py app/config.py app/worker.py app/connectors/registry.py deploy/entrypoint.sh` | `tests/test_setup_robustness.py`, `tests/test_platform_hardening.py`, `tests/test_deploy_seams.py` | ✅ verified (tests + container runs) |
| T10 | Sign-in protection: client address from a declared proxy, per-client limits with no account lock, fair turns for the password check, bounded audit | `app/server.py app/auth.py docs/OPERATIONS.md` | `tests/test_signin_hardening.py` | ✅ verified (tests; flood runs at 0.1 CPU) |
| T11 | Optional public read-only view with a seeded demo project and a single guest filter | `app/demo.py app/guest_view.py app/server.py` | `tests/test_public_view.py`, `tests/test_public_view_hardening.py` | ✅ verified (tests + live loopback run) |
| T12 | Console theme: black page, red cards, mask icons with a moving laser, code tickers, guest mode | `web/* app/reports.py` | browser run with zero console errors, `evidence/ui/*.png` | ✅ verified (browser run) |

Resume point: all r1 tasks complete. Next expansion (not r1): active web connectors
(ZAP, Nuclei with a reviewed template set) behind scope+policy; OSV egress; a
configured AI provider to verify the live AI + `ai_redteam` path.
