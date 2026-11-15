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
Behind that proxy, set `FSL_TRUSTED_PROXY_HOPS=1` (one nginx or Caddy that adds the
client address to `X-Forwarded-For`) and publish the port to the proxy only
(`-p 127.0.0.1:8080:8080`); otherwise every visitor shares one sign-in allowance.
See "Client address behind a proxy" below.
The split API + isolated-worker setup is in `deploy/compose.yaml`.

## Option C — Render / Railway
Point the service at this repo subdirectory `faisal-security-lab`, Dockerfile
`deploy/Dockerfile.fly`, port `8080`, add a persistent disk mounted at `/data`, and
set the same `FSL_OWNER_*` env vars. A service created by hand does not get the
client-address setting that `render.yaml` carries: add `FSL_CLIENT_IP_HEADER` yourself
(`CF-Connecting-IP` on Render; on another host, the header its proxy sets), or every
visitor shares one sign-in allowance. See "Client address behind a proxy" below.

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
| `owner_email_ignored` | `FSL_OWNER_EMAIL` is not an email and an owner account at another address already exists; nothing was created or changed | sign in with that owner address, or fix the value |
| `owner_password_generated` | no password was set | read the one-time password in the service logs |
| `data_dir_unwritable` | the data directory (or an explicit `FSL_DB_PATH` / `FSL_EVIDENCE_DIR`) cannot be written | that location is temporary; fix the mount/ownership |
| `public_view_unrecognized` | `FSL_PUBLIC_VIEW` is set to something other than a yes or no value; the public view is off | set it to `1` (or `0`), redeploy |
| `demo_sample_missing` | `FSL_PUBLIC_VIEW` is on but `samples/vulnerable-app` is not in the image | rebuild with `deploy/Dockerfile.fly` (it copies `samples/`) |

Only the location that cannot be written moves to temporary storage: an explicit
`FSL_DB_PATH` or `FSL_EVIDENCE_DIR` in a writable place is kept even when
`FSL_DATA_DIR` is not usable. A standalone worker (`python -m app.worker`, the
`deploy/compose.yaml` setup) does not fall back: it exits with an error, because a
worker on its own empty database would never see the API's jobs. It does so whenever
any of the three locations is unusable, so give it a writable `FSL_DATA_DIR` even when
`FSL_DB_PATH` and `FSL_EVIDENCE_DIR` point somewhere else.

## Container user and data directory
The single-image container starts as root only to make a host-mounted data
directory writable (a Fly volume is root-owned), then drops to the unprivileged
user `fsl` (uid/gid 10001) before the server starts.

- **When the drop is not possible** (the host withholds the capability to change
  user, as `--cap-drop ALL` does) the entrypoint logs
  `could not drop privileges; continuing as the current user`, sets
  `FSL_PRIVDROP_FAILED=1`, and the server keeps running as the user the host
  started it with. When that user is root it reports the notice
  `running_as_root`: in the logs and, for a signed-in owner or admin, in
  `setup_notices` of `/api/me`. The sign-in page does not show it.
- **`FSL_REQUIRE_NONROOT=1`** turns that case into a hard stop: the container
  prints an error and exits with status 1 instead of running as root.
- **`--user 10001`** is the way to combine dropped capabilities with a non-root
  process, for example `docker run --user 10001 --cap-drop ALL ...`. The entrypoint
  then runs the command as-is. Root with every capability dropped is not a
  substitute: it cannot write a `/data` owned by uid 10001, so the service would
  use temporary storage. With `--user 10001` a mounted directory must already be
  writable by uid 10001, because nothing in the container can change its owner.

`FSL_DATA_DIR` (default `/data`) is created and handed to uid 10001 only when it is
a dedicated data directory: an absolute path that, after symlinks and `..` are
resolved, is not `/`, is not equal to or inside `/app`, `/usr`, `/etc`, `/bin`,
`/sbin`, `/lib`, `/lib32`, `/lib64`, `/libx32`, `/home`, `/root`, `/proc`, `/sys`,
`/dev`, `/boot` or `/run`, and is not exactly `/var`, `/tmp`, `/opt`, `/mnt`, `/srv`
or `/media` (a sub-directory such as `/var/lib/fsl` is fine). Any other value is
left untouched and named in one log line. The service still uses that directory if
uid 10001 can write to it; if not, it uses temporary storage and reports
`data_dir_unwritable`. An empty `FSL_DATA_DIR` means `/data`.

The owner is changed only when the directory, or anything in it, is not already
owned by uid 10001. That is the case on the first start with a new disk and after
files were put there from a root shell (a restored backup, `docker cp`), not on
every boot. With `--user 10001` nothing in the container can change an owner, so
files restored into the data directory must be given to uid 10001 by hand
(`chown -R 10001:10001 <data directory>` on the host).

## Client address behind a proxy
By default the server identifies a client by the socket peer address and ignores forwarding headers. Behind a platform proxy set FSL_CLIENT_IP_HEADER to the single-value header the platform sets (CF-Connecting-IP on Render, Fly-Client-IP on Fly.io), or set FSL_TRUSTED_PROXY_HOPS to the number of trusted proxies that append to X-Forwarded-For. A wrong value makes sign-in limits shared between visitors; a signed-in owner can see the detected address and its source in Settings.

`render.yaml` and `fly.toml` already set `FSL_CLIENT_IP_HEADER` for their platform.
A service that was created by hand, or before that line was added to the file, does
not have it: check that the variable is listed in the host's environment settings.
The service log says which source is in use (`[init] client address: ...`) and
prints one `[setup]` line if a setting was given but unusable, or if a request
arrives with a forwarding header while neither setting is set.
The detected address and its source are also returned as `client` by `/api/me`;
[OPERATIONS.md](OPERATIONS.md) ("Sign-in protection") shows how to read it and
lists the sign-in limits.

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
  `/app/` and `/data/` are also the middle of unrelated paths and URLs. A deeper
  directory (`/srv/fsl`) is cut when glued to a word as well; the price is that a
  relative path whose middle happens to equal that directory (`lib/srv/fsl/x`)
  is shown shortened. An earlier install's sample path with a space or a quote
  in it is cut when it is a whole value (an asset identifier, a scope target),
  not when it sits inside a sentence. A tool `version` that contains a path
  separator (the output of a failed version command) reads `unknown`.
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
Guests are limited in three ways, per API process. The first two count in fixed
one-minute windows; all three answer HTTP 429.

| Limit | Value | Message |
|---|---|---|
| per client (IPv4 address or IPv6 /64) | 90 requests/minute | `rate limit exceeded; slow down or sign in` |
| all guests together | 240 requests/minute | `the public view is busy; try again in a minute` |
| guest requests being worked on at once | 2, with up to 16 waiting for at most 4 seconds | `the public view is busy; try again in a minute` |

The numbers are sized for the smallest host (a tenth of a CPU), where the
heaviest guest route, the JSON report, costs about 15 ms of CPU, so about seven
requests a second use the whole instance. Measured there on this version with a
flood of 20 guest requests a second from six addresses: the health check answered
in 0.3 s at worst and an owner sign-in in 1.5 s (before the third limit existed,
both took over 20 s and timed out). On a larger host raise the ceiling with
`FSL_GUEST_REQUESTS_PER_MINUTE`.

The last 40% of the ceiling is kept for clients that have made fewer than 12
requests in the current minute, so a few busy addresses cannot use the whole
ceiling up and close the view for someone who has just arrived.

Among the guests that wait, the client that has asked for the least in the
current minute is served first, so one visitor opening a page is not held behind
an address that keeps asking. Signed-in requests are never counted and never
wait behind guests. A guest is counted under the same client address as a
sign-in, so the proxy settings below apply here too: behind an undeclared proxy
all visitors share the 90. The per-client table holds 4096 clients; when it is
full the oldest entries are forgotten instead of new visitors being refused, and
the global limit bounds the total regardless of how many addresses the requests
come from.

What these limits do not stop: every refused request still costs a few
milliseconds, so a flood of several dozen requests a second of any kind uses up
a tenth of a CPU. That is a volumetric attack and belongs to the platform's edge.

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
- Only jobs of the demo project count. Idempotency keys are matched across all
  projects, so the demo's keys (`public-demo:<scope>:<connector>[:2|:3]:<tag>`)
  end in a tag derived from the server's secret key: a key cannot be worked out
  and taken by a job in another project before the demo uses it. Should a key be
  held by another project's job all the same, the demo uses its next key and
  reports `key_in_use` when none is left. The tags change with the secret key, so
  after a changed `FSL_SECRET_KEY` on a kept database each demo scan runs once more.
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
