# FAISAL.AI — Faisal Security Lab (Defensive AI Security Platform)

> **منصة دفاع واختبار أمني أخلاقي** — authorized, auditable security testing that
> runs real security tools behind one execution contract and adds an AI layer
> over evidence that can be checked again. Self-hosted; the server needs only the
> Python standard library.

**For systems you own or are authorized to test.** A scan needs an authorization
scope, and the scope is enforced in code at both the API and the worker, not in
the console: a request sent straight to the API meets the same checks. The
platform deliberately **excludes** internet-wide scanning, denial of service,
mass credential attacks, data exfiltration, persistence and detection-evasion.

It is one service: a JSON API, a bilingual (Arabic and English) web console, a
job queue in SQLite and scan workers that start the scanners as separate
programs. Findings from all scanners go into one list with redacted evidence,
and reports come out as JSON, SARIF, HTML and Markdown.

## Responsible use | الاستخدام المسؤول

Use it only on systems you own or have written permission to test. Scanning
other people's systems can be illegal; you are responsible for what you scan.
The software comes without warranty (see [LICENSE-APACHE](LICENSE-APACHE) and
[LICENSE-MIT](LICENSE-MIT)).

Guard rails in the code:

- No scan runs without an authorization scope. A scope belongs to one asset,
  names the connectors allowed on it, and can be revoked.
- The scope is checked when a scan is requested and again when the worker starts
  it, so a scope revoked in between stops the scan.
- A network target that resolves to a private, loopback or link-local address is
  refused unless the asset is explicitly marked internal, which takes the admin
  role in the project.
- A source scan reads only a directory inside the scope: the directory is
  compared with the allowed targets as a real path, when the scan is requested
  and again before the worker copies it.
- The header check sends one request and does not follow redirects.
- The platform records the authorization you declare (the "Authorization proof"
  field is free text). It cannot verify it.

It does not do internet-wide scanning, denial of service, password attacks,
exploitation, persistence or evasion. The tool catalog in the console is a
reference list of 76 projects; only the connectors in the
[table below](#connectors) are ever run.

Read ["Known limits"](docs/SCOPE.md#known-limits) in the scope guide before you
give other people an account: it says what the scope check does not cover.

**بالعربية:** استخدم المنصة فقط على الأنظمة التي تملكها أو التي لديك إذن مكتوب
بفحصها. فحص أنظمة الآخرين دون إذن قد يكون مخالفًا للقانون، وأنت المسؤول عمّا
تفحصه. لا يعمل أي فحص دون تفويض مسجَّل (نطاق)، ويُراجَع التفويض عند طلب الفحص
ومرة أخرى قبل تشغيل الأداة. المنصة تسجّل التفويض الذي تصرّح به ولا تستطيع
التحقق من صحته. لا تنفّذ المنصة فحصًا عشوائيًا للإنترنت ولا هجمات حجب الخدمة ولا
تخمين كلمات المرور ولا الاستغلال ولا التخفّي. البرنامج مقدَّم دون أي ضمان.

### What leaves your machine

The server contacts nothing on its own: it has no telemetry and no update
check, and the console loads no script, font or style from another host.
Network traffic happens only as part of these actions:

- **pip-audit** uses pip to resolve the packages named in the requirement files
  it finds (`requirements.txt`, `requirements.in`, `requirements-dev.txt`) and
  asks PyPI (`pypi.org`) about known vulnerabilities, so package names and
  versions go there and packages can be downloaded from there.
- **OSV-Scanner** sends the package names and versions it finds in lockfiles
  and manifests to `api.osv.dev`.
- **Trivy**, if you install it, downloads its vulnerability database.
- **Semgrep** runs with the rules bundled in `data/semgrep-rules` and with its
  version check switched off. If you set `FSL_SEMGREP_CONFIG` to a registry
  pack, your Semgrep downloads those rules from the Semgrep registry, and
  Semgrep's own usage-metrics setting applies to that run.
- **http_headers** makes one `GET /` request to the target (User-Agent
  `faisal-security-lab/2.0`); **tls_certificate** makes one TLS handshake with
  it. Both look the host name up in DNS first.
- An asset whose identifier is an `http(s)` repository address is cloned with
  `git clone --depth 1`.
- A configured **AI provider** (`FSL_AI_PROVIDER`, off by default) receives data
  only when someone uses an AI action (**AI triage**, **Remediation** or
  **Validate** on a finding, the proposed scan plan, the AI executive summary)
  or runs `ai_redteam`. It is sent finding text (title, rule, description,
  location, remediation), asset ids and kinds, project counts, and for
  `ai_redteam` four fixed test prompts. Finding text passes through the
  redaction patterns first.
- `make install-tools` downloads the scanners from PyPI and from their GitHub
  release pages.

## Requirements

- Linux x86_64. Other systems are not tested, and the tool install script
  downloads Linux x86-64 binaries only.
- Python 3.11 or newer (the test suite passes on 3.11, 3.12 and 3.13; CI and the
  container images use 3.13). No Python package is needed: the server uses the
  standard library only.
- `make`, `bash`, `curl`, `tar` and `git`.

The console, the API and the two standard-library connectors (`http_headers`,
`tls_certificate`) work with no tool installed. The scanners are installed by
`make install-tools`. It needs network access and, by default, root, because it
writes to `/usr/local/bin` and `/opt/sectools-venv`. Without root, name two
directories of your own and put the first on `PATH`:

```bash
bash scripts/install-tools.sh "$HOME/.local/bin" "$HOME/sectools-venv"
export PATH="$HOME/.local/bin:$PATH"
```

The script creates a Python virtual environment, so the `venv` module must be
present (package `python3-venv` on Debian and Ubuntu). It stops with a message
when it cannot write to its directories.

## Quick start

```bash
cd faisal-security-lab
export FSL_OWNER_PASSWORD='choose-10-or-more-characters'
make serve          # API + console + in-process workers → http://127.0.0.1:8787
```

Open the address and sign in as `owner@faisal-security-lab.local` with that
password. The console opens in Arabic; the `🌐 EN` button on the sign-in page
switches to English.

In a second terminal, optional:

```bash
sudo make install-tools     # Semgrep, Bandit, pip-audit, Gitleaks, OSV-Scanner (pinned versions)
make verify                 # prints the state of every connector
```

If you leave `FSL_OWNER_PASSWORD` unset, the first `make serve` prints the owner
address and a generated password, shown once, in a line that starts with
`[init]`. It is not a one-time password: it stays the owner's password. This
version has no change-password screen; to replace the password, add another
owner under **Settings → Users** and retire the first account as described in
[docs/OPERATIONS.md](docs/OPERATIONS.md#owner-password-and-setup-notices).

Cannot sign in? Stop the server, run `make clean` (this deletes `./var`, which
holds all local data) and start again.

```bash
make test           # unit and integration tests; tests of a scanner are skipped where it is not installed
make acceptance     # the 10 acceptance gates → var/acceptance-report.json
```

The settings are environment variables; [`.env.example`](.env.example) lists
them. The platform does not read a `.env` file by itself.

### First scan

This scans the bundled sample `samples/vulnerable-app` with Bandit, so it needs
`make install-tools` first. The labels are those of the English console.

1. In the sidebar, open the **Project** drop-down and choose **+ New project**.
   Type a name and press **Create**.
2. Open **Assets & Scopes**. Under **Add asset** leave **Kind** on `source`, put
   the full path of the sample into **Identifier** (run
   `echo "$PWD/samples/vulnerable-app"` in `faisal-security-lab/` to get it) and
   press **Create**.
3. In the asset's row press **+ Add authorization**. Type `LAB-SELF-OWNED` into
   **Authorization proof**, the same full path into **Allowed targets**, tick
   `bandit` under **Allowed scan types** and press **Create**. The form is not
   sent while no scan type is ticked. The scope appears in the **Scope** table
   as `active`.
4. Open **Scan Center**. Under **Run scan** choose `bandit` in **Connector** and
   press **Run scan**. Press **↻ Refresh** until the job reads `succeeded`; it
   takes a few seconds.
5. Open **Findings & Evidence**. The sample gives about nine findings in
   `app.py`; click a row for the details and the evidence.
6. Open **Reports**, press **HTML (EN)**, then **Open** or **Download**.

A connector that the scope does not list is refused with
`connector 'semgrep' is not in the authorized scan types [policy_denied]`. A
scanner that is not installed is listed as `(blocked)` in **Connector**, and its
job ends as `blocked`.

`samples/vulnerable-app`, `tests/` and `scripts/acceptance.py` contain
credential-shaped strings. They are fabricated on purpose, so that the secret
scanner has something to find; secret scanners run on this repository will flag
them.

### Optional public read-only view

`FSL_PUBLIC_VIEW=1` lets visitors **read** one seeded demo project (the bundled
`samples/vulnerable-app`, scanned by the installed tools) without signing in. It
is off by default and read-only; guests are not sent evidence text or server
paths. See [docs/DEPLOY.md](docs/DEPLOY.md#optional-public-read-only-view).

## What it does — the defensive loop

```
authorized asset → scope → scan plan → tool run (bounded) → evidence
      → normalized findings → risk ranking → reviewable fix → re-scan → report
```

An asset is registered with one of the kinds `source`, `repo`, `web`, `api`,
`host` or `container`. What can be scanned depends on the connectors. This
version scans source directories and repositories (static analysis, secrets,
dependencies) and has one header check, one TLS certificate check and one
AI-provider probe. No connector pulls or scans a container image.

## Connectors

| Connector | What it does | What you will see |
|---|---|---|
| `semgrep` (Semgrep 1.185.0) | static analysis with the six bundled Python rules | ready after `make install-tools` |
| `bandit` (Bandit 1.9.4) | static analysis of Python source | ready after `make install-tools` |
| `gitleaks` (Gitleaks 8.21.2) | secrets in files | ready after `make install-tools` |
| `pip_audit` (pip-audit 2.10.1) | known vulnerabilities in Python requirement files | ready after `make install-tools`; a run needs network access to `pypi.org` |
| `osv_scanner` (OSV-Scanner 1.9.2) | known vulnerabilities in lockfiles and manifests | ready after `make install-tools`; a run needs network access to `api.osv.dev` |
| `trivy` | vulnerabilities, secrets and misconfiguration in a source tree | optional; `make install-tools` tries to download Trivy 0.58.1, otherwise install Trivy yourself and put it on `PATH`. `blocked` until then |
| `http_headers` | one request; reports missing security headers | ready with no tool installed; run it through the API, see below |
| `tls_certificate` | one TLS handshake; certificate dates and protocol | ready with no tool installed; run it through the API, see below |
| `ai_redteam` | four fixed prompt-injection probes sent to the configured AI provider | `installed`, and not runnable, until an AI provider is configured |

`http_headers` and `tls_certificate` need a `target` parameter, which the Scan
Center form does not send in this version. Request them through the API
([docs/OPERATIONS.md](docs/OPERATIONS.md#requesting-a-scan-through-the-api)).

A connector is `ready` when its tool is found on `PATH`, and `blocked` when it
is not. It becomes `verified` after a scan with it has completed on this
installation, and `stale` when the tool's version changes after that.
`installed` means the connector is present but something it needs is missing.
`make verify` prints the states of your installation; the dashboard shows them
too.

The **Tool Catalog** screen lists 76 open-source security projects with Arabic
descriptions and a link to each project. It is a reference list. Six entries
have a connector here; the others, among them tools with offensive uses, are
listed only and cannot be run from this platform.

## Architecture

| Layer | Module | Role |
|---|---|---|
| API + console | `app/server.py`, `web/` | JSON API and bilingual console; role checks on the server; security headers; rate limits |
| Identity | `app/auth.py` | PBKDF2 passwords; random session tokens, of which only a hash is stored; roles owner/admin/analyst/reader; identity headers sent by a client are ignored |
| Authorization | `app/scope.py`, `app/policy.py` | scopes and the policy check that runs when a scan is requested and when it starts; destination checks for network targets |
| Queue | `app/queue.py` | durable jobs in SQLite, idempotency keys, leases, one scan per asset at a time, global stop; a lost worker gives `undetermined`, not a silent re-run |
| Worker | `app/worker.py` | leases a job, copies the source into a temporary directory, repeats the policy check, runs the connector under limits, stores evidence and findings |
| Connectors | `app/connectors/` | one contract for all tools; tools are started without a shell |
| Findings | `app/findings.py` | one model for all tools, de-duplication, work priority, status lifecycle, reopen |
| Evidence | `app/evidence.py` | redaction before storage, SHA-256, restricted access |
| Reports | `app/reports.py` | JSON, SARIF 2.1.0, HTML and Markdown in Arabic and English |
| AI | `app/ai/` | planner, triage, remediation, validation, reporting; fixed output schema; scanned text is passed as data; built-in rules when no provider is configured |

More: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md),
[docs/SCOPE.md](docs/SCOPE.md), [docs/OPERATIONS.md](docs/OPERATIONS.md),
[docs/DEPLOY.md](docs/DEPLOY.md), [docs/RELEASE-NOTES.md](docs/RELEASE-NOTES.md).

## Acceptance

`make acceptance` runs ten gates against the declared release scope (`r1`) on
your machine and writes the result to `var/acceptance-report.json`. A passed
gate means that check ran and produced the stated evidence. It is **not** a
claim that the system is free of vulnerabilities. The gates, and the result
recorded on the reference build, are in [ACCEPTANCE.md](ACCEPTANCE.md).

## Security posture and limits

- No shell command is built from user input, model output or scan output:
  connectors pass a fixed program name and a list of arguments.
- The platform never executes scanned files. One exception to know: pip-audit
  resolves the packages named in a requirement file, which can run their build
  code. Scan only requirement files you trust, or run the worker in a container
  ([docs/OPERATIONS.md](docs/OPERATIONS.md#run-modes)).
- `http_headers` and `tls_certificate` resolve the destination, refuse private
  and loopback addresses unless the asset is marked internal, connect to the
  address they checked, and do not follow redirects.
- Every tool run has limits on CPU time, wall-clock time, output size, file size
  and process count. Memory is limited only when the worker runs in a container
  with a memory limit; the per-process limit `FSL_JOB_AS_MB` is off by default
  because it breaks Semgrep.
- Known secret and personal-data patterns (access keys, tokens, private keys,
  `password=` style pairs, e-mail addresses, card-like numbers) are redacted in
  stored evidence, in finding descriptions, in reports, in audit entries and in
  text sent to a model. Redaction is pattern based and cannot catch everything,
  and a finding's title is shown in the console as the tool reported it.
- Known limits of this release are listed in
  [docs/RELEASE-NOTES.md](docs/RELEASE-NOTES.md#known-limits).

To report a vulnerability in the platform itself, follow
[SECURITY.md](../SECURITY.md). To contribute, see
[CONTRIBUTING.md](../CONTRIBUTING.md).

## Licensing

The platform is licensed under either of the Apache License, Version 2.0 ([LICENSE-APACHE](LICENSE-APACHE)) or the MIT License ([LICENSE-MIT](LICENSE-MIT)), at your option.
See also [NOTICE](NOTICE) and [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md).
The licences cover this directory only.

Unless you say otherwise in writing, a contribution you submit for inclusion in
the platform is licensed in the same way, under both licences, with no
additional terms.

The scanners are separate programs under their own licences (Semgrep LGPL-2.1,
Gitleaks MIT, Bandit, pip-audit, OSV-Scanner and Trivy Apache-2.0). They are not
included in this repository: the install script downloads them, and the platform
starts them as separate processes.

The name FAISAL.AI and the mask logo identify the original project and are not
licensed for use by forks: a fork or a hosted copy must use another name and
logo. `FAISAL.AI` is a display brand; `faisal.ai` is **not** an owned/live
domain.
