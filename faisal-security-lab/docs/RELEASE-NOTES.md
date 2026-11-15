# Release notes — Faisal Security Lab 2.0.0 (release scope `r1`)

This file says what version 2.0.0 contains, how it was verified in terms you
can repeat, what was not verified, and its known limits. Passing the checks
below is not a claim that the system is free of vulnerabilities.

Two terms used below: the release scope `r1` is the list of features this
version says it contains ([specs/spec.md](../specs/spec.md)), and the reference
build is the machine the recorded results come from, a Linux x86_64 container
with Python 3.13 and the scanners installed.

## What the release contains

- **One service.** A JSON API and a web console in Arabic (right-to-left) and
  English, on the Python standard library, with SQLite as storage.
- **Authorization scopes and a policy check.** A scan needs a scope on its
  asset; the check runs when the scan is requested and again when the worker
  starts it. See [SCOPE.md](SCOPE.md).
- **A durable job queue.** Idempotency keys, leases, up to three attempts, one
  scan per asset at a time, cancel and a global stop. A job whose worker is lost
  while the tool runs becomes `undetermined`; it is not started again by
  itself.
- **Nine connectors.** Semgrep, Bandit, Gitleaks, pip-audit, OSV-Scanner and
  Trivy as separate programs started without a shell; an HTTP header check and
  a TLS certificate check on the standard library; a probe of the configured AI
  provider.
- **Findings, evidence, reports.** One findings model with de-duplication, a
  work priority and a status lifecycle; evidence stored after redaction with
  its SHA-256; reports as JSON, SARIF 2.1.0, HTML and Markdown in both
  languages.
- **An AI layer that is off by default.** Planner, triage, remediation,
  validation and reporting. Scanned text is passed to the model as data, the
  answer must match a fixed schema, and without a provider the same features
  use built-in rules.
- **Roles.** Owner, admin, analyst and reader, with membership per project.
- **Start-up that tolerates mistyped settings.** A short owner password or a
  malformed owner address does not stop the service: it starts and the sign-in
  page says what to change. The port is bound before the tools are probed. A
  data directory that cannot be written is replaced by temporary storage, with
  a notice. The container entrypoint drops root, refuses system directories as
  a data directory, and hands a restored volume to the service user.
- **Sign-in protection.** Limits per client and per account and client, no
  account-wide lock, one password check at a time with fair turns, and a
  bounded number of audit rows for failed sign-ins. The client address is taken
  from a proxy only when the operator declares the proxy. See
  [OPERATIONS.md](OPERATIONS.md) ("Sign-in protection").
- **Limits on what is accepted before the sender is known.** The request
  target is capped at 2 KB before it is parsed, the query string is parsed only
  for a known route, and a request body is read only after the caller is
  identified.
- **An optional public read-only view** (`FSL_PUBLIC_VIEW=1`, off by default).
  A visitor without a session can read one seeded demo project through a fixed
  list of GET routes. One filter removes evidence text, storage references, a
  scope's contact and proof, and server paths from everything a guest is sent.
  Guest requests are limited per client and in total, and two are worked on at
  once. See [DEPLOY.md](DEPLOY.md).
- **The console theme.** A black page with red cards, mask icons and moving
  code lines; a motion switch, and `prefers-reduced-motion` is honoured.
- **Deployment files.** A single image, a Compose file with the API and the
  worker in separate containers, `fly.toml`, and a Render Blueprint
  (`render.yaml` at the repository root).
- **A tool catalog.** 76 security projects with Arabic descriptions and a link
  to each project's repository, as a reference list. Six of them have a
  connector. The list does not say that every project in it is open source;
  see [THIRD-PARTY-NOTICES.md](../THIRD-PARTY-NOTICES.md).
- **Licence.** The platform is licensed under either Apache-2.0 or MIT, at
  your option. What the licences cover is listed in the
  [README](../README.md#licensing) and in `NOTICE`.

## How it was verified, and how to repeat it

Run these in `faisal-security-lab/`. The scanners must be installed for the
scanner tests and for the acceptance gates.

```bash
export FSL_OWNER_PASSWORD='choose-10-or-more-characters'
make serve                    # terminal 1: http://127.0.0.1:8787

sudo make install-tools       # terminal 2
make verify                   # the state of every connector on your machine
make test                     # the unit and integration tests
make acceptance               # the 10 gates → var/acceptance-report.json
```

- **Tests.** `make test` passed on Python 3.11, 3.12 and 3.13 with Semgrep,
  Bandit, Gitleaks, pip-audit and OSV-Scanner installed: 362 tests, 1 skipped
  (a container entrypoint test that is skipped when the suite runs as root).
  The suite covers roles and project isolation, the policy check and scopes,
  destination checks, queue idempotency and lost workers, connectors on known
  and clean input, de-duplication and reopening, redaction, the AI layer's
  input and output handling, reports, start-up with wrong settings, sign-in
  limits, the public view and its filter, and the deploy files.
- **Acceptance gates.** `make acceptance` passed 10 of 10. The gates and the
  recorded result are in [ACCEPTANCE.md](../ACCEPTANCE.md).
- **The whole loop in a browser.** The "First scan" steps of the
  [README](../README.md) were followed in Chromium against a server of this
  version: sign-in, project, asset, authorization, Bandit scan, nine findings,
  HTML report. The page reported no console error and made no request to
  another host. Screenshots of the console are in `evidence/ui/`.
- **The policy check over HTTP.** A scan request with a connector the scope
  does not list answers HTTP 403 `policy_denied`. The API example in
  [OPERATIONS.md](OPERATIONS.md) was run as written.
- **API and worker as two processes.** With `FSL_NO_WORKER=1 make serve` a
  requested scan stayed `queued`; after `make worker` was started on the same
  data directory it completed.
- **Load on a small host.** With the service limited to a tenth of a CPU and 20
  guest requests a second from six addresses, the health check answered in
  0.3 s at worst and an owner sign-in took 1.5 s. With 20 requests a second
  that each carried a very long address, the health check answered at once and
  an owner sign-in took 0.5 s. To repeat this, limit the service to a tenth of
  a CPU (for a container, `--cpus 0.1`) and send the traffic to your own
  instance.

## Not verified in this release

Each item says how you can check it yourself.

- **Trivy.** The connector was never run with a Trivy binary. Install Trivy,
  see that `make verify` lists `trivy` as `ready`, and run a scan with a scope
  that allows `trivy`.
- **OSV-Scanner against the live service.** No scan with it completed, because
  `api.osv.dev` was not reachable from the reference build. Scan a directory
  that has a lockfile with a scope that allows `osv_scanner`.
- **A live AI provider.** The AI features were run with their built-in rules
  only, and `ai_redteam` was never run. Configure a provider
  ([DEPLOY.md](DEPLOY.md), "Enabling the AI layer later"), use **AI triage** on
  a finding, and run `ai_redteam` with a scope that allows it.
- **The header and TLS checks against a live target.** The tests cover their
  parameter check, the policy check and the destination check. The request and
  the handshake themselves were not exercised. Request them through the API for
  a host you own ([OPERATIONS.md](OPERATIONS.md), "Requesting a scan through
  the API").
- **The hosting platforms.** Which header carries the visitor's address on
  Render and on Fly.io, and whether a Blueprint sync applies new variables to
  an existing Render service, were taken from the platforms' documentation.
  After deploying, sign in and open **Settings**: "Your address as the server
  sees it" must be your own public address.
- **Containers.** `make test` and `make acceptance` start no container. The
  test suite checks the deploy files and the decisions of the entrypoint
  script without one. After building an image, check that the service answers
  `/api/health`, that the server process runs as uid 10001
  (`docker top <container>`), and that a scan completes.
- **Other systems.** Only Linux x86_64 was used. The tool install script
  downloads Linux x86-64 binaries.

## Known limits

- **What the scope check does not cover** is listed in
  [SCOPE.md](SCOPE.md#known-limits): the proof is a declaration, `allowed_ports`
  and `rate_limits` are stored but not enforced, and a hard link inside a
  source directory is read like any other file.
- **pip-audit can run package build code.** It resolves the packages named in
  requirement files. Scan requirement files you trust, or run the worker in a
  container.
- **Redaction is pattern based.** It removes known shapes of keys, tokens,
  private keys, `password=` style pairs, e-mail addresses and card-like
  numbers. A secret in another shape stays.
- **Passwords and accounts.** There is no change-password screen and no screen
  to disable an account. [OPERATIONS.md](OPERATIONS.md) ("Owner password and
  setup notices") gives the way through the database.
- **The header and TLS checks cannot be started from the console**, because the
  Scan Center form sends no target. They are requested through the API.
- **A separate worker process runs one job at a time.**
  `FSL_WORKER_CONCURRENCY` applies only to the worker threads inside
  `make serve`.
- **Memory of a tool run is limited only in a container** that has a memory
  limit. CPU time, wall-clock time, output size, file size and process count
  are limited everywhere.
- **Evidence is not deleted automatically.** Each record carries a retention
  date, and nothing acts on it yet.
- **No total token or cost budget for the AI provider.** Each call has a
  timeout and a reply limit.
- **The install script does not compare checksums.** It downloads pinned
  versions over HTTPS from PyPI and from the projects' GitHub release pages.
- **A large distributed flood can still keep sign-in busy.** The fair turns
  hold as long as the flood does not bring a new network for every attempt.
  Traffic from thousands of networks is for the hosting platform's edge
  protection, not for a small instance.
- **Finished processes can stay in the process table of the container.** The
  server is the first process there and does not collect processes that
  outlive a tool run stopped on a timeout; they stay until the container
  restarts. An init process in the container (Docker's `--init` option) is the
  usual remedy; it was not tried with this image.
- **Limits of the guest filter** are listed in [DEPLOY.md](DEPLOY.md) ("What a
  guest can and cannot read"): a server path glued to a word is cut only for
  directories two or more levels deep.
- **Console language.** The console opens in Arabic and has an English switch.
  The catalog descriptions exist in Arabic only, the **Markdown** report button
  gives the Arabic report (the English one is available through the API with
  `lang=en`), and a few buttons are in English only.
- **Not in this release:** active web scanners (ZAP and Nuclei are catalog
  entries without a connector), scanning of container images, OT/ICS
  equipment, single sign-on, and a scheduler.
