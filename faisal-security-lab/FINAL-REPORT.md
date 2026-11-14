# Final report — Faisal Security Lab, release `r1`

## What changed
The uploaded `faisal-security-lab` (a Cloudflare Worker + Python runner, owner-gated
by trusted identity headers) was rebuilt as a **standalone defensive AI security
platform** (`faisal-security-lab/`). It preserves the FAISAL.AI identity, the
76-tool Arabic catalog, and the original runner's hardened posture (SSRF guards,
no-shell execution, bounded jobs, evidence redaction), and adds: a policy engine
enforced at API **and** worker, a durable/idempotent/crash-safe job queue,
server-side RBAC (no trusted identity headers), a uniform connector contract
driving real tools, a unified findings/evidence/report pipeline, an AI layer with
a hard structured-output safety contract, and a bilingual RTL/LTR operator console.

## What actually ran (verified by real execution)
- **Real tools installed and driven:** Semgrep 1.185.0, Bandit 1.9.4,
  Gitleaks 8.21.2, pip-audit 2.10.1 — each produced real findings on the authorized
  vulnerable sample (SAST, secrets, dependency CVEs). 2 stdlib network connectors
  (HTTP headers, TLS) implemented and unit-tested.
- **Full loop over HTTP:** login → project → asset → scope → scan → findings →
  evidence → report, through the standalone server with in-process workers.
- **Policy enforcement over the live API:** an out-of-scope connector returns
  HTTP 403 `policy_denied`; SSRF to a private address is blocked.
- **Tests:** 280 (`make test`) pass — RBAC/isolation, policy/scope/SSRF, queue
  idempotency + crash-safety, connectors (known vs clean), dedup/reopen,
  redaction, AI safety, reports — plus the 9-row failure-mode matrix.
- **Acceptance:** 10/10 gates (`make acceptance` → `evidence/acceptance-report.json`).
- **UI:** rendered and screenshotted in a real browser with zero console errors
  (`evidence/ui/*.png`), in Arabic (RTL) and English (LTR).

## Added after the first release cut
- **Start-up that cannot be broken from the hosting dashboard.** A short owner
  password or a mistyped owner email no longer stops the service: it starts,
  says what to change on the sign-in page, and (for a bad email) names the
  address that works. The port is bound before tools are probed. An unwritable
  data directory falls back to temporary storage and says so. The container
  entrypoint drops root, refuses system directories as a data directory, and
  re-owns a restored volume.
- **Sign-in protection** (`docs/OPERATIONS.md`, "Sign-in protection"). The
  client address is taken from a proxy only when the operator declares it
  (`FSL_CLIENT_IP_HEADER`, `FSL_TRUSTED_PROXY_HOPS`). Limits apply per client
  and per (account, client); there is deliberately no account-wide lock.
  Password checks run one at a time and turns go to the network that has had
  the fewest, so a flood of addresses cannot keep a first-time sign-in waiting.
  Anonymous audit rows are budgeted per client.
- **Optional public read-only view** (`FSL_PUBLIC_VIEW=1`, off by default). A
  visitor without a session can read one seeded demo project (the bundled
  vulnerable sample, scanned by the real tools) through a fixed list of GET
  routes. Everything a guest is sent passes one filter that drops evidence
  text, storage references, scope contact/proof and server paths. Every action
  still needs a sign-in.
- **Console theme.** Black page with red text, red cards with black text, mask
  icons inside a laser that keeps moving, and moving code on every card and at
  the top of the page; a motion switch and `prefers-reduced-motion` are honoured.

Each of these went through independent adversarial review, and the defects the
reviews confirmed were fixed and re-checked before merging.

## What tests proved
Authorization cannot be bypassed via the API (enqueue-time policy) or after
revocation (execution-time re-check). A lost worker yields `undetermined`, never a
silent re-run. Prompt-injection embedded in finding data cannot change the AI's
structured action, leak a canary, or launch a tool; the schema rejects any
off-contract field. Secrets/PII are redacted in evidence and reports. A fix that
reaches the asset is confirmed by a re-scan before the finding is closed.

## What remains / blockers (declared, not hidden)
- **trivy** — blocked: GitHub release asset 404s through the build egress proxy;
  connector implemented, binary absent. Dependency category covered by
  pip-audit (verified) and osv-scanner (where egress allows).
- **osv-scanner** — ready, but `api.osv.dev` egress is blocked in this build;
  live run is egress-blocked.
- **ai_redteam + live AI roles** — require a configured AI provider; verified only
  in deterministic fallback here.
- **Active web scanners (ZAP, Nuclei)** — not in r1; the catalog lists them as the
  coverage target. They are future connectors, to ship behind scope + policy with
  a reviewed template set, disabled until a scope authorizes them.
- OT/ICS, a production SSO front-end, and multi-ecosystem SBOM are out of r1 scope.
- **Not verified on the hosting platform itself.** The build environment cannot
  reach Render or Fly.io, so which header the platform delivers the visitor's
  address in, and whether the Blueprint applies new variables to an existing
  service, were checked only against their documentation. Settings in the
  console shows the address the service sees and where it came from.
- **A large distributed flood can still keep sign-in busy.** Fair turns need a
  fresh network for every attempt to keep a newcomer waiting; a flood from
  thousands of networks is a volumetric attack for the platform's edge, not for
  a 0.1-CPU instance.
- **Known limits of the guest filter** are listed in `docs/DEPLOY.md`: a server
  path glued to a word is cut only for directories two or more levels deep.

## How to re-verify
```bash
cd faisal-security-lab
make install-tools && make verify     # honest tool states
make test                             # 280 tests
make acceptance                       # 10 gates → evidence/acceptance-report.json
make serve                            # open the console at http://127.0.0.1:8787
```

Completion is reported as acceptance of the declared release scope with evidence,
**not** as a claim that the system is free of vulnerabilities.
