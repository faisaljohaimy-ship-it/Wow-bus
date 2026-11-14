# Plan — phased delivery

Each phase ends with a working deliverable and run evidence; a passing first path
does not mean the catalog is complete.

- **Phase 1 — baseline.** Inventory the source, write spec/plan/tasks, define the
  data model, scopes, and tool registry. → `app/db.py`, `app/store.py`, `specs/`.
- **Phase 2 — one complete path.** Auth+RBAC → authorized asset → job → worker →
  one real tool → finding + evidence → report, with core failure cases. → verified
  with Bandit, then Semgrep.
- **Phase 3 — core category coverage.** SAST (Semgrep, Bandit), secrets (Gitleaks),
  dependencies (OSV-Scanner / pip-audit), network (HTTP headers, TLS), AI security
  (red-team connector + AI-safety eval set). → verified subset recorded honestly.
- **Phase 4 — expansion & remediation.** Remaining catalog connectors, AI
  triage/remediation/validation/reporting, fix → re-verify loop. → gate 9.
- **Phase 5 — release acceptance.** Isolation, privilege, resume, cancel, limits;
  CI; deploy manifests; docs. → 10/10 gates, 37 tests, this repo.

## Architecture decisions
- Python standard library for the core → genuinely standalone, no framework risk;
  security tools are external programs invoked via a hardened subprocess runner.
- SQLite (WAL) for durable state shared by API + workers.
- Vanilla-JS SPA under a strict CSP (event delegation, no inline handlers).
- Memory isolation via container cgroup, not process `RLIMIT_AS` (which breaks
  Semgrep/OCaml); CPU/time/output/pids always bounded.
