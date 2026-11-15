# Plan — phased delivery of release scope `r1`

The release was built in five phases. Each phase ends with something that runs
and with evidence of the run; a first path that works does not mean the tool
catalog is covered.

- **Phase 1 — baseline.** Specification, plan and tasks; the data model, scopes
  and the tool registry. → `app/db.py`, `app/store.py`, `specs/`.
- **Phase 2 — one complete path.** Sign-in and roles → authorized asset → job →
  worker → one real tool → finding and evidence → report, with the main failure
  cases. → first with Bandit, then with Semgrep.
- **Phase 3 — the main categories.** Static analysis (Semgrep, Bandit), secrets
  (Gitleaks), dependencies (OSV-Scanner, pip-audit), network (HTTP headers,
  TLS), AI security (the provider probe and the input-safety evaluation set).
  → which connectors were run, and which were not, is recorded in
  [ACCEPTANCE.md](../ACCEPTANCE.md).
- **Phase 4 — remediation.** AI triage, remediation, validation and reporting;
  the loop fix → scan again → close. → gate 9.
- **Phase 5 — release acceptance.** Isolation, privileges, resume, cancel,
  limits; CI; deploy files; documentation. → the ten acceptance gates and the
  test suite (`make acceptance`, `make test`).

## Architecture decisions

- The server uses the Python standard library only, so it has no dependency to
  install or to keep patched. The security tools are separate programs, started
  through one subprocess runner without a shell.
- SQLite in WAL mode holds the state that the API and the workers share.
- The console is plain JavaScript under a strict Content-Security-Policy: event
  delegation, no inline handlers.
- Memory is limited by the container's memory limit, not by a per-process
  address-space limit (`RLIMIT_AS`), which breaks Semgrep. CPU time, wall-clock
  time, output size and process count are limited for every tool run.
