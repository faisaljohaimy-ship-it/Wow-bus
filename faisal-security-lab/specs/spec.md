# Spec — Faisal Security Lab (Defensive AI Security Platform) — release `r1`

## Goal

A self-hosted, extensible platform for **authorized** security testing. It runs
suitable security tools behind one execution contract, enforces an authorization
model that leaves an audit trail, and uses AI to triage evidence, rank risk,
propose fixes and check them, with results that can be checked again.

## In scope (r1)

- Projects, assets (source, repo, web, api, host, container), authorization
  scopes.
- A policy check enforced at the API and at the worker; destination checks for
  network targets.
- A durable job queue (idempotent, leased, safe against a lost worker) and scan
  workers.
- A connector contract and connectors for Semgrep, Gitleaks, Bandit, pip-audit,
  OSV-Scanner, Trivy, HTTP headers, TLS certificate and an AI-provider probe.
  The Trivy connector and the AI-provider probe are implemented and were not
  run for this release; see [ACCEPTANCE.md](../ACCEPTANCE.md).
- One findings model (de-duplication, work priority, lifecycle), an evidence
  store with redaction, reports as JSON, SARIF, HTML and Markdown in Arabic and
  English.
- An AI layer with a fixed output schema and built-in rules as fallback.
- A console in Arabic and English with role checks on the server.
- Tests, a failure-mode matrix, ten acceptance gates, CI, deploy files,
  documentation.

## Out of scope / excluded

Internet-wide scanning, denial of service, mass credential attacks, data
exfiltration, persistence, detection evasion. Testing of OT/ICS equipment. An
external identity provider: the platform has its own sign-in.

## Acceptance criteria

[ACCEPTANCE.md](../ACCEPTANCE.md) lists ten gates. A gate counts only when its
check ran and left evidence for this version; what could not be run is named
and is not counted as passing.

## Quality contract

1. A screen, a setting or an installed tool does not show that a feature works.
   The path has to run and its result has to be saved.
2. Results of a real run are kept apart from simulated ones, and what the AI
   infers is kept apart from evidence.
3. A completion figure is computed from the declared criteria that passed, with
   the total and the items that were blocked or put off shown next to it.
