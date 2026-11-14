# Spec — Faisal Security Lab (Defensive AI Security Platform) — release `r1`

## Goal
A standalone, extensible platform for **authorized** security testing that unifies
appropriate security tools behind one execution contract, enforces an auditable
authorization model, and uses AI to triage evidence, rank risk, propose fixes and
verify them — producing results that can be re-verified.

## In scope (r1)
- Projects, assets (source/repo/web/api/host/container), authorization scopes.
- Policy engine enforced at API + worker; SSRF/destination validation.
- Durable job queue (idempotent, leased, crash-safe) + isolated scan workers.
- Connector contract + real connectors: Semgrep, Gitleaks, Bandit, pip-audit,
  OSV-Scanner, Trivy (impl), HTTP headers, TLS certificate, AI red-team (impl).
- Unified findings (dedup, work-priority, lifecycle), evidence store (redacted),
  reports (JSON/SARIF/HTML/MD, AR+EN).
- AI layer with structured-output safety + deterministic fallback.
- Bilingual operator console with server-side RBAC.
- Tests, failure-mode matrix, 10 acceptance gates, CI, deploy manifests, docs.

## Out of scope / excluded
Internet-wide scanning, DoS, mass credential attacks, data exfiltration,
persistence, detection evasion. OT/ICS testing. A production identity provider
(the platform ships its own server-side auth; it can be fronted by SSO later).

## Acceptance criteria (testable)
See `ACCEPTANCE.md` — 10 gates, each earned only on concrete evidence for this
build/version, with blockers declared and never counted as passing.

## Quality contract
1. A UI/config/installed tool does not prove a feature works — the path must run
   and its result be saved.
2. Separate verified-by-real-run from simulated, and AI inference from evidence.
3. Any completion percentage is computed from declared criteria that passed
   verification, with the denominator and blocked/deferred items shown.
