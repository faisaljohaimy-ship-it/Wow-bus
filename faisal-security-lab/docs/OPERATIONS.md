# Operations guide

Commands are run in `faisal-security-lab/`. Examples use the local address
`http://127.0.0.1:8787`; put your own in its place.

## Run modes

**One process (local use, a single small host)**
```bash
make serve     # API + console + worker threads in the same process
```
The number of worker threads is `FSL_WORKER_CONCURRENCY` (default 2).

**API and workers as separate processes.** The API then runs no scan tool
(`FSL_NO_WORKER=1`) and one or more worker processes run the tools. API and
workers must use the same data directory. There are two ways to do it; use one
of them, not both.

*In containers.* The worker gets a memory limit, a process limit and no kernel
capabilities, which is the setup to prefer when the scanned input is not yours:
```bash
docker compose -f deploy/compose.yaml up --build -d
```
The API is then at `http://127.0.0.1:8787`. The owner password, what the worker
container can read and how to add workers are described in
[DEPLOY.md](DEPLOY.md) ("Docker Compose: API and worker in separate
containers").

*Without containers, on one host.* Two terminals:
```bash
FSL_NO_WORKER=1 make serve      # terminal 1: API and console, no worker
make worker                     # terminal 2: one worker
```
Both use `./var` unless `FSL_DATA_DIR` is set; if you set it, set the same value
in both terminals. Start `make worker` again in further terminals for more
workers. Nothing limits the memory of the tools in this mode.

A worker process runs one job at a time; `FSL_WORKER_CONCURRENCY` applies only
to the worker threads of `make serve`. While no worker is running, a requested
scan stays `queued`.

## Tools: install, update, verify

```bash
make install-tools      # pinned versions into /opt/sectools-venv and /usr/local/bin (needs root)
make verify             # prints the state of every connector and stores it
```

Without root, give the script two directories of your own and put the first on
`PATH`: `bash scripts/install-tools.sh "$HOME/.local/bin" "$HOME/sectools-venv"`.
The script exits with an error when it cannot write to its directories.

Run `make verify` after installing or updating a tool, so that the console shows
the new state. A tool that was `verified` and now reports another version
becomes `stale` until a scan with the new version has completed. Try a tool or
rule update on a test project before you rely on it.

## Getting a token

Apart from the health check, `/api/config` and the sign-in itself, API calls
need a session token (the optional public view opens some read-only routes
without one). Sign in to get a token:

```bash
curl -s -X POST http://127.0.0.1:8787/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"owner@faisal-security-lab.local","password":"<your-password>"}'
```

The answer is JSON:

```json
{"token": "<43 characters>", "expires_at": "2026-11-15T22:59:16+00:00",
 "user": {"id": "usr_…", "email": "owner@faisal-security-lab.local",
          "global_role": "owner", "display_name": "Owner"}}
```

Keep the token in a shell variable and send it as a bearer token. This line
signs in and stores it in `TOK`, which the examples below use:

```bash
TOK=$(curl -s -X POST http://127.0.0.1:8787/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"owner@faisal-security-lab.local","password":"<your-password>"}' \
  | python3 -c 'import json,sys; print(json.load(sys.stdin)["token"])')
```

A token is valid for `FSL_SESSION_TTL` seconds (12 hours by default) or until
`POST /api/auth/logout` is called with it. A wrong address or password gives
HTTP 401 `{"error": {"code": "unauthenticated", "message": "invalid credentials", "detail": {}}}`;
too many attempts give HTTP 429 (see "Sign-in protection"). The password is part
of the command, so it lands in your shell history; clear it there if that
matters on your machine.

## Readiness checks

```bash
curl -s http://127.0.0.1:8787/api/health
curl -s -H "Authorization: Bearer $TOK" http://127.0.0.1:8787/api/connectors   # readiness per connector, from the last sync (?live=1 probes now)
curl -s -H "Authorization: Bearer $TOK" http://127.0.0.1:8787/api/tools         # stored state, version and licence per tool
```

## Requesting a scan through the API

A scan request names an asset, a scope on that asset and a connector the scope
allows. Requesting a scan needs the `analyst` role in the project; granting a
scope needs the project's `admin` role (an owner has both everywhere). This
example creates a project, an asset and a scope for the bundled sample and runs
Bandit; `SAMPLE` must be the full path of `samples/vulnerable-app`.

```bash
B=http://127.0.0.1:8787
AUTH="Authorization: Bearer $TOK"
JSON='Content-Type: application/json'
SAMPLE="$PWD/samples/vulnerable-app"
getid() { python3 -c "import json,sys; print(json.load(sys.stdin)['$1']['id'])"; }

PID=$(curl -s -X POST $B/api/projects -H "$AUTH" -H "$JSON" \
  -d '{"name":"API example"}' | getid project)
AID=$(curl -s -X POST $B/api/projects/$PID/assets -H "$AUTH" -H "$JSON" \
  -d "{\"kind\":\"source\",\"identifier\":\"$SAMPLE\"}" | getid asset)
SID=$(curl -s -X POST $B/api/projects/$PID/scopes -H "$AUTH" -H "$JSON" \
  -d "{\"asset_id\":\"$AID\",\"proof\":\"LAB-SELF-OWNED\",\"allowed_targets\":[\"$SAMPLE\"],\"scan_types\":[\"bandit\"]}" | getid scope)

# the scan request itself
JID=$(curl -s -X POST $B/api/projects/$PID/scans -H "$AUTH" -H "$JSON" \
  -d "{\"asset_id\":\"$AID\",\"scope_id\":\"$SID\",\"connector\":\"bandit\"}" | getid job)

# repeat until "state" is no longer queued, leased or running (a few seconds)
curl -s -H "$AUTH" $B/api/jobs/$JID

# then read the findings and a report (var/ is not tracked by git)
curl -s -H "$AUTH" $B/api/projects/$PID/findings
mkdir -p var
curl -s -H "$AUTH" "$B/api/projects/$PID/report?format=html&lang=en" -o var/report.html
```

The scan request answers HTTP 201 with the job, `{"job": {"id": "job_…",
"state": "queued", …}}`. A job ends in one of the states `succeeded`, `failed`,
`blocked` (refused by the policy check at start, or the tool is not installed),
`cancelled` or `undetermined` (the worker was lost while the tool ran). A
request the scope does not allow is refused with HTTP 403:

```json
{"error": {"code": "policy_denied",
           "message": "connector 'semgrep' is not in the authorized scan types",
           "detail": {"policy_code": "connector_not_authorized"}}}
```

Fields of the scan request:

| Field | Meaning |
|---|---|
| `asset_id`, `scope_id`, `connector` | required; ids of existing objects are listed by `GET /api/projects`, `GET /api/projects/{id}/assets` and `GET /api/projects/{id}/scopes`, connector names by `GET /api/connectors` |
| `params` | connector parameters. `http_headers` needs `{"target": "https://host/"}`; `tls_certificate` needs `{"target": "host"}` and takes an optional `"port"` (443 by default). The source scanners need none |
| `priority` | a whole number, 5 by default; lower numbers are started first |
| `idempotency_key` | optional text; a second request with a key that was used before returns the first job and starts nothing |

A request for one of the two network connectors has this form. Register the
host as an asset first (kind `web`, `api` or `host`) and grant a scope that
lists the connector and has the host in its allowed targets. Use it for a host
you own:

```bash
curl -s -X POST $B/api/projects/$PID/scans -H "$AUTH" -H "$JSON" \
  -d '{"asset_id":"ast_…","scope_id":"scp_…","connector":"http_headers","params":{"target":"https://www.example.org/"}}'
```

Without `params.target` the answer is HTTP 400
`http_headers requires a 'target' URL`.

Report formats are `json`, `sarif`, `md` and `html`; `lang` is `ar` or `en`. A
project accepts at most 30 scan requests a minute (HTTP 429 beyond that). What
the scope check compares, and what it does not, is listed in
[SCOPE.md](SCOPE.md).

## Scheduling scans

The platform has no scheduler of its own. Call the scan request above from cron,
a CI job or a systemd timer, with a scope that is valid at that time: a scope
can carry validity dates and an hour-of-day `window`, and a request outside
them is refused. Only one scan runs on an asset at a time; a second one waits
in the queue.

## Global stop & cancel

- **Global stop:** `POST /api/admin/stop {"engaged":true}` (admin). No new
  job is started and running jobs are told to stop. In the console:
  **Settings → Global stop**.
- **Cancel one job:** `POST /api/jobs/{id}/stop`. The worker kills the tool's
  process group cooperatively.

## Sign-in protection

Sign-in attempts are counted per client address in a sliding 10-minute window.
The counters live in memory in the API process and start empty after a restart.

| What is counted | Limit per 10 minutes | Effect when reached |
|---|---|---|
| one client address on one account | 8 attempts | that client gets HTTP 429 for that account |
| one client address, all accounts | 60 attempts | that client gets HTTP 429 |
| one account, all clients | 30 failed attempts | each client's allowance on that account drops from 8 to 3 |

A 429 response says how long to wait (`error.detail.retry_after_seconds`). A
successful sign-in is not counted and resets that client's count for the account.
Unknown and known emails are treated identically.

Password checks are slow on purpose, so they run one at a time, and an attempt
waits at most 10 seconds for its turn. Turns are not given out in order of
arrival. The next one goes to the waiting network (an IPv4 address or an IPv6
/48) that has had the fewest turns in the last 10 minutes, earliest first among
equals, so someone signing in for the first time goes ahead of addresses that
keep trying. A correct password clears a network's count. At most 32 attempts
wait; when the line is full, a newcomer with fewer turns takes the place of the
waiter with the most, and any other newcomer is refused.

A network has one sign-in in progress at a time. A second one (a double tap on
Sign in, two people behind one address) waits up to 3 seconds for the first; at
most two wait. An attempt that gets no turn receives HTTP 429 "sign-in is busy".
It is not counted as an attempt and not written to the audit log; the service
log gets one `[signin]` line per 10 minutes while this is happening. This keeps a
burst of sign-ins from using all the CPU of a small instance and starving the
health check, and keeps a flood of addresses from holding a genuine sign-in back.
What it cannot stop is a flood that brings a fresh network for every attempt
(thousands of them): that is a volumetric attack and belongs to the platform's
edge protection.

**There is no account-wide lock, on purpose.** With a single owner account, a
lock that triggers on failures from anyone would let anybody who knows the
owner's email keep the owner out indefinitely by failing on purpose. Instead,
heavy guessing against an account only lowers what each address may try (3 per
10 minutes), and a client that has not failed can always attempt to sign in.
The trade-off: an attacker with many addresses gets a few guesses per address
rather than being stopped outright. Guessing stays bounded per address and by
the cost of each password check, so a long random owner password remains the
real defence.

An IPv6 client is counted by its /64 network, not its single address.

### What is accepted before the sender is known

A request costs CPU before the service knows who sent it, so that part is kept
small and fixed:

- the request target (path and query string together) may be at most 2048
  bytes; a longer one gets HTTP 414 before it is parsed, static files and the
  health check included;
- a query string may carry at most 32 parameters (HTTP 400 beyond that), and it
  is parsed only when the path matches a route;
- a request body is read only after the caller has been identified. Without a
  session, only the sign-in route takes a body, of at most 16 KB. An unwanted
  body of up to 64 KB is read and thrown away unparsed; beyond that the answer
  carries `Connection: close`;
- a body that nobody read is never left on the connection, whatever the method
  or the route (a `GET` with a body, a static file, an unknown route), because
  it would be taken for the next request. A body sent without a length
  (`Transfer-Encoding: chunked`) is not accepted: the request is refused where
  a body is expected, and the connection is closed after the answer either way.

What remains is the cost of answering at all (about 2.5 ms of CPU for the
smallest request on a tenth of a CPU, so several dozen requests a second of any
kind use the whole instance). That is a volumetric attack and belongs to the
platform's edge.

### Which address is "the client"

By default the client is whoever opened the TCP connection, and headers such as
`X-Forwarded-For` are ignored, because any client can send them. Behind a
hosting platform's proxy that is the wrong answer: every visitor then appears
to come from the proxy and shares one allowance, so eight wrong passwords from
anywhere block sign-in for everyone for ten minutes. Tell the service what is
in front of it with **one** of these:

| Setting | Use when | Example |
|---|---|---|
| `FSL_CLIENT_IP_HEADER` | the proxy sets a header holding exactly the client address and overwrites whatever the client sent | `CF-Connecting-IP` (Cloudflare, which fronts Render), `Fly-Client-IP` (Fly.io) |
| `FSL_TRUSTED_PROXY_HOPS` | each proxy appends the address it received from to `X-Forwarded-For`; the value is how many proxies you run (0–10) | `1` for a single nginx or Caddy in front |

A request that lacks the named header, repeats it, or carries something that is
not an IP address falls back to the connection address. With hops set to N the
N-th entry from the right of `X-Forwarded-For` is used; entries further left
are supplied by the client and never trusted.

Only set these when the service **cannot be reached except through that
proxy**. If it can be reached directly, a client can forge the header and
choose its own address for every attempt.

The bundled `render.yaml` and `fly.toml` set `FSL_CLIENT_IP_HEADER` to their
platform's header. Any other host starts with the default until you set one.
At start the service log states the source in use (`[init] client address: ...`),
and a `[setup]` line follows if a setting was given but could not be used. With
neither setting, the first request that carries a forwarding header is logged
once as a `[setup]` line: a proxy is probably in front and not declared.

To check the setting, sign in and open `/api/me`:

```bash
curl -s -H "Authorization: Bearer $TOK" https://<your-site>/api/me
# "client": {"address": "203.0.113.7", "source": "header", "proxy_headers_ignored": false}
```

`address` should be your own public address. `source` is `header`, `forwarded`
or `peer`. `"source": "peer"` together with `"proxy_headers_ignored": true`
means a proxy is passing an address along and the service is not configured to
use it.

### What reaches the audit log

Successful sign-ins are always recorded (`auth.login`). Failed and refused ones
come from anonymous callers, so they are capped per client address and
10-minute window: at most five `auth.login_failed` rows and one
`auth.login_throttled` row (written at the first refusal). Their detail is
`{"account": "<hash>", "client": "<address>"}`; the audit log never stores email
addresses, so the account is the first 12 hex characters of the SHA-256 of the
lower-cased email. To see whether a row is about a particular account:

```bash
printf %s 'owner@example.com' | sha256sum | cut -c1-12
```

### Owner password and setup notices

Spaces or line breaks around `FSL_OWNER_PASSWORD` are removed when the owner
account is created, and sign-in accepts the password typed with or without
them. If `FSL_OWNER_EMAIL` is not a valid email and an active owner at another
address already exists, the value is ignored and no account is created or
changed (`owner_email_ignored`). Otherwise the default owner address is used,
and `owner_email_invalid` names it at every start for as long as the value
stays wrong.

A password generated at the first start is shown once, in the service log, in
a line that starts with `[init]`. It is not a one-time password: it stays the
owner's password. This version has no change-password screen or API. To replace
a password, add another owner under **Settings → Users** (or `POST /api/users`)
and retire the old account as shown below.

`FSL_OWNER_EMAIL` and `FSL_OWNER_PASSWORD` only ever create an account; they
never rename one or change its password. So after a mistyped address is
corrected on a persistent disk there are two owners: the new one, and the one
at the default address, which keeps the password it was created with. No
notice reports the older account, and no screen or API can disable an account
yet. To retire it, stop the service and mark the account inactive in the
database:

```bash
python3 -c "import sqlite3, sys; c = sqlite3.connect(sys.argv[1]); c.execute('UPDATE users SET active=0 WHERE email=?', (sys.argv[2],)); c.commit()" \
  <data directory>/faisal-security-lab.db owner@faisal-security-lab.local
```

An inactive account cannot sign in, and its open sessions stop working.

On a host without a persistent disk (the free Render plan) the database is
rebuilt at every start, so only the account for the current settings exists.

### Locked out on a local install

If nobody can sign in on a local install (the password was lost, or the owner
account was created before you chose a password), there are two ways back in.

- *Start over.* Stop the server, run `make clean` (it deletes `./var`: the
  database and the evidence) and start again with `FSL_OWNER_PASSWORD`
  exported.
- *Keep the data.* Stop the server and start it once with a second owner
  address and a password of at least 10 characters:
  `FSL_OWNER_EMAIL=you@example.com FSL_OWNER_PASSWORD='<new-password>' make serve`.
  This creates a second owner account. Sign in with it, then retire the first
  account with the command above. Keep `FSL_OWNER_EMAIL` at the new address
  from then on.

Startup problems are logged as `[setup]` lines and published as codes. The
sign-in page (`/api/config`) shows only the codes a visitor may need. Codes
about the host itself, currently `running_as_root` (the container could not
drop root privileges), appear in the logs and in `setup_notices` of `/api/me`
for owners and admins only. The table of codes and the ways to stop a
container from running as root (`--user 10001`, `FSL_REQUIRE_NONROOT=1`) are
in [DEPLOY.md](DEPLOY.md).

## Backup & restore

The state is the SQLite database and the evidence directory, both in the data
directory (`FSL_DATA_DIR`, `./var` for a local run). Back up both together. The
database is in WAL mode, so do not copy its file while the service runs; take a
consistent copy with one of these:

```bash
# with the sqlite3 command-line program, if it is installed
sqlite3 var/faisal-security-lab.db ".backup var/backup.db"

# or with Python alone (any supported version)
python3 -c "import sqlite3; s = sqlite3.connect('var/faisal-security-lab.db'); d = sqlite3.connect('var/backup.db'); s.backup(d); d.close(); s.close()"
```

`python3 -m sqlite3` exists from Python 3.12 and accepts SQL only, not
`.backup`; there the equivalent is
`python3 -m sqlite3 var/faisal-security-lab.db "VACUUM INTO 'var/backup.db'"`.

```bash
# pack the copy and the evidence
tar czf fsl-backup.tgz var/backup.db var/evidence

# restore: stop the service first
tar xzf fsl-backup.tgz
rm -f var/faisal-security-lab.db-wal var/faisal-security-lab.db-shm
mv var/backup.db var/faisal-security-lab.db
make verify    # stores the tool states of the restored host
```

The two `rm`-ed files belong to the database that is being replaced; left in
place they would be applied to the restored one. Open sessions are rows of the
database, so they keep working after a restore until they expire. The file
`var/.session-secret` is not in the archive: on a new host a new one is
generated, which only makes the scans of the public demo run once more. A
backup holds finding text and password hashes; store it like the data directory
itself.

A restore drill: restore into a scratch `FSL_DATA_DIR`, start the API with
`FSL_NO_WORKER=1`, and confirm that `/api/health` answers, that you can sign in
and that a project's findings load.

In the single-image container the service runs as uid 10001 and must own what it
writes. Files restored from a root shell (`docker exec`, `docker cp`,
`fly ssh console`) are root-owned; the entrypoint hands them to uid 10001 at the
next start. A container started with `--user 10001` cannot do that: run
`chown -R 10001:10001 <data directory>` on the host after restoring, or the
service fails at start with "attempt to write a readonly database".

## Resource estimate (rough)

These are planning figures, not measurements of your workload.

- API: about 128 MB of memory and little CPU.
- Worker: 1 to 3 GB of memory for each Semgrep or Trivy job that runs at the
  same time (`deploy/compose.yaml` limits the worker container to 3 GB), and
  one CPU per job.
- Storage: the database grows with findings and audit rows, a few KB per
  finding. Evidence is stored redacted and is small. Each evidence record
  carries a retention date 90 days ahead; this version does not delete
  evidence when that date passes.
- AI: off by default. With a provider set, each call has a 60-second timeout
  and a reply limit of `FSL_AI_MAX_TOKENS` tokens. There is no total token or
  cost budget in this version; watch the usage at your provider.

## Secrets

The owner password and an AI key are given as environment variables and are
never written to the repository. Passwords are stored as PBKDF2 hashes, and of
a session token only the SHA-256 is stored. A secret key is generated into
`<data directory>/.session-secret` (mode 0600) unless `FSL_SECRET_KEY` supplies
it; this version uses it only to derive the job keys of the public demo's
scans. The scan tools are started with a minimal environment and do not receive
these variables.
