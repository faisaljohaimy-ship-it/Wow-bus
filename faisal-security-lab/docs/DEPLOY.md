# Public deployment — getting a permanent link

The platform is a container that listens on one HTTP port and keeps its state in a
mounted volume. Deploy it anywhere with open outbound network. (The Claude cloud
sandbox used to build it has a restrictive egress allowlist that blocks Fly.io and
tunnel providers, so a public URL must be created from an environment with open
network — your machine or a cloud shell.)

## Option A — Fly.io (free-tier friendly)
```bash
cd faisal-security-lab
fly apps create <your-app-name>            # or: fly launch --no-deploy --copy-config
fly volumes create fsl_data --size 1 --region iad
fly secrets set FSL_OWNER_EMAIL=you@example.com FSL_OWNER_PASSWORD='<strong-password>'
# Optional — enable the real AI layer (any OpenAI-compatible provider):
# fly secrets set FSL_AI_PROVIDER=openai-compatible FSL_AI_BASE_URL=https://openrouter.ai/api/v1 \
#                 FSL_AI_MODEL=meta-llama/llama-3.3-70b-instruct:free FSL_AI_API_KEY='<your-key>'
fly deploy
```
→ opens at `https://<your-app-name>.fly.dev`

## Option B — Docker / Docker Compose (your VM or server)
```bash
cd faisal-security-lab
docker build -f deploy/Dockerfile.fly -t faisal-security-lab .
docker run -d -p 8080:8080 -v fsl_data:/data \
  -e FSL_OWNER_EMAIL=you@example.com -e FSL_OWNER_PASSWORD='<strong-password>' \
  faisal-security-lab
```
→ opens at `http://<your-host>:8080` (put it behind a TLS reverse proxy for production).
The split API + isolated-worker setup is in `deploy/compose.yaml`.

## Option C — Render / Railway
Point the service at this repo subdirectory `faisal-security-lab`, Dockerfile
`deploy/Dockerfile.fly`, port `8080`, add a persistent disk mounted at `/data`, and
set the same `FSL_OWNER_*` env vars.

## Option D — Render Blueprint (clicks only, no terminal)
Open `https://render.com/deploy?repo=https://github.com/faisaljohaimy-ship-it/Wow-bus`,
leave **Blueprint Path** empty (it defaults to `render.yaml` at the repo root), type
`FSL_OWNER_PASSWORD` (10+ characters) and press **Deploy Blueprint**. The free plan
has no persistent disk, so findings reset when the instance restarts or wakes from
sleep; the owner account is re-created from the environment on every start.

## First login
On first boot an owner account is created from `FSL_OWNER_EMAIL` and
`FSL_OWNER_PASSWORD` (**at least 10 characters**). There is **no email bridge** —
authentication is a server-side password + signed session, so there is no lock-out
like the original app's owner-verification gate. Repeated failed sign-ins are
throttled (HTTP 429) for a few minutes.

## If the values are wrong, the site still starts
A mistyped value never stops the service. It starts, logs one `[setup]` line per
problem, and the sign-in page explains what to change:

| Notice | Meaning | Fix |
|---|---|---|
| `owner_password_too_short` | `FSL_OWNER_PASSWORD` is under 10 characters; **no owner account exists** | set a longer value, redeploy |
| `owner_email_invalid` | `FSL_OWNER_EMAIL` is not an email | sign in with `owner@faisal-security-lab.local`, or fix the value |
| `owner_password_generated` | no password was set | read the one-time password in the service logs |
| `data_dir_unwritable` | the data directory cannot be written | data is temporary; fix the mount/ownership |
| `demo_sample_missing` | `FSL_PUBLIC_VIEW` is on but `samples/vulnerable-app` is not in the image | rebuild with `deploy/Dockerfile.fly` (it copies `samples/`) |

The single-image container starts as root only to make a host-mounted `/data`
writable (a Fly volume is root-owned), then drops to an unprivileged user.

## Optional: public read-only view
Off by default. Set `FSL_PUBLIC_VIEW=1` to let anyone who opens the site look
around **without signing in**. It is strictly read-only and limited to one demo
project:

- On start (after the port is bound, in the background) the platform creates the
  project **"عرض توضيحي — Public demo"**, registers the bundled
  `samples/vulnerable-app` as its only asset and grants a lab scope limited to
  that directory. This needs no tool and comes first, so a visitor can open the
  project while the next step is still running. Then the tool registry is synced
  (every tool is asked for its version, which takes many seconds on a small
  instance), and after that one scan per ready demo connector is enqueued.
  Defaults: `bandit`, `gitleaks`, `pip_audit`; override with
  `FSL_DEMO_CONNECTORS=a,b,c` (only passive source scanners are accepted). Until
  the scans have finished a visitor sees the project with few or no findings.
- A visitor with no session is a **guest**: below `reader`, no global role, reader
  of that one project. Guests can only call an explicit allowlist of GET routes
  (project, assets, scopes, jobs, findings, report, catalog, tools, connectors,
  AI status, and metrics for that project). Every POST, plus users, audit, the
  stop switch, the evidence route and platform-wide metrics, still returns 401/403.
- A request that carries a bad or expired token gets 401, never guest data.
- The project is owned by a system account that cannot sign in, and real projects
  are never visible to guests. While the view is on, every signed-in account is
  at least a `reader` of the demo project, so it does not disappear from the
  project list after sign-in; anything above reading it still needs membership.

### What a guest can and cannot read
A guest **can** read the demo project and its metrics, its assets and scopes
(what is authorized: targets, scan types, environment, dates, status), its jobs
(state, timing, result counts, error code and message), its findings (rule,
title, severity, file and line, description, remediation, status), the report as
JSON, SARIF, Markdown or HTML (`lang=ar` or `lang=en`; any other value is served
as Arabic), the tool catalog, the tool registry, the connector list and whether
the AI layer is configured.

A guest **cannot** read, on any route:

- **Evidence text.** A job or finding still lists its evidence records (id, kind,
  SHA-256, size, dates), but the `redacted_summary` and `storage_ref` fields are
  removed. Reading evidence needs a sign-in with the `analyst` role.
- **Server paths.** The sample is shown as `samples/vulnerable-app`, not by its
  absolute location: the application directory is cut out of every string and the
  data directory reads `data`. `local_path` and the tools' binary `path` are
  removed. The sample also reads `samples/vulnerable-app` when the database was
  filled by an install at another path. One limit: a directory directly below the
  root (`/app` and `/data` in the Docker image, both named in this repository) is
  only cut where a path starts, not when it is glued to a preceding word, because
  `/app/` and `/data/` are also the middle of unrelated paths and URLs.
- **The text of an unexpected exception.** A job that ended with the error code
  `worker_error`, and a request that failed with `internal` (HTTP 500), show that
  code and a fixed sentence; the exception text, which can name any file on the
  server, needs a sign-in. Errors the platform words itself (tool missing,
  timeout, policy, a tool's failed run, a refusal) keep their message.
- **A scope's owner contact and proof reference.** `owner_contact` and `proof`
  are removed from every scope.
- **An echo of the request.** A refusal does not repeat the project id a guest
  asked for.

This is applied in one place to every response a guest receives, errors and
report files included (`app/guest_view.py`). Signed-in users get the unreduced
responses.

**Everything else on the demo project is public.** If you add an asset or a scope
to it, visitors see the asset's identifier, label and metadata and the scope's
targets, scan types and dates. Keep real targets in a project of their own.

The connector list a guest sees comes from the stored tool registry (filled by
the sync at startup and by an admin's `POST /api/tools/sync`): no tool is probed
for a guest, so the list is empty for the first seconds after a start and is as
fresh as the last sync.

### Guest rate limits
Both are per API process, in fixed one-minute windows, and answer HTTP 429:

| Limit | Value | Message |
|---|---|---|
| per client address | 240 requests/minute | `rate limit exceeded; slow down or sign in` |
| all guests together | 1200 requests/minute | `the public view is busy; try again in a minute` |

Signed-in requests are never counted. The per-client table holds 4096 addresses;
when it is full the oldest entries are forgotten instead of new visitors being
refused, and the global limit bounds the total regardless of how many addresses
the requests come from.

### Demo scans across restarts
On an **ephemeral disk** (the free Render instance) every start begins with an
empty database: the demo project is created and scanned again each time. On a
**persistent disk** the same project, scope and results are reused:

- A demo scan that is queued, running or succeeded is left alone.
- A demo scan that ended without a result (`failed`, `blocked`, `cancelled`,
  `undetermined` — for example `pip_audit` had no network on first boot) is
  enqueued again on the next start, at most **3 jobs per connector** for one
  scope. After that the start log reports it as `attempts_exhausted`; run it by
  hand from the Scan Center once the cause is fixed.
- A scan that was **running when the process stopped** is not retried by a quick
  restart. It still counts as running until its lease runs out (120 seconds after
  the worker last renewed it); a worker then marks it `undetermined`, and the
  first start **after that** enqueues it again. Restart once more, or run the scan
  by hand, if the demo stays incomplete after a crash.
- Only jobs of the demo project count. The retry keys
  (`public-demo:<scope>:<connector>[:2|:3]`) are not secret, and idempotency keys
  are matched across all projects, so another project's job can hold one of them:
  the demo then uses its next key, and reports `key_in_use` when none is left.
- A connector whose tool is not ready is skipped (`not_ready`) and picked up on a
  later start; that does not use up an attempt.
- Changing `FSL_DEMO_CONNECTORS` issues a new scope for the new list and revokes
  the old one. The same happens when the application moves to another directory
  while the database stays: the sample is registered as a new asset at its new
  path, and the demo scope on the earlier asset is revoked.

### Stopping the demo scans
Revoke the demo project's scope as an admin (**Assets & Scopes → Revoke**, or
`POST /api/scopes/{id}/revoke`). The revocation sticks: later starts log
`[init] public demo: the authorization scope was revoked by an operator; not re-issuing`,
issue no new scope and enqueue nothing. The project and the findings it already
holds stay readable. To scan again, grant a new scope on the demo asset yourself
and run the scans from the Scan Center. Guests are not shown that scope's owner
contact or proof reference, but its targets, scan types and dates are public like
the rest of the project. (On an ephemeral disk the revocation is lost with the
database at the next restart; switch `FSL_PUBLIC_VIEW` off instead.)

Turning the variable off again removes guest access immediately on restart, and
signed-in non-members lose their reader access with it; the demo project itself
stays in the database for signed-in admins.

The demo is built for the single-image deploy (`deploy/Dockerfile.fly`), where the
sample and the scanners live next to the API. In the split `deploy/compose.yaml`
setup the API image carries neither, so the notice `demo_sample_missing` is shown
and no demo project is created.

## Enabling the AI layer later
Set `FSL_AI_PROVIDER` + `FSL_AI_BASE_URL` + `FSL_AI_MODEL` + `FSL_AI_API_KEY` (any
OpenAI-compatible or Anthropic endpoint; free tiers work) and restart. Without them
the AI layer runs in deterministic fallback — the platform stays fully functional.
