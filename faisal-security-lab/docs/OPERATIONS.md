# Operations guide

## Run modes

**Standalone (dev / single host)**
```bash
make serve     # API + UI + in-process workers
```

**Split (production)**
```bash
# API host (no tools)
FSL_NO_WORKER=1 python3 -m app.server
# One or more isolated workers (with tools + cgroup memory limit)
docker compose -f deploy/compose.yaml up --build
```

## Tools: install, update, verify

```bash
make install-tools      # pinned versions into a venv + /usr/local/bin
make verify             # sync registry; print honest states
```

Updating a tool or its rules/config invalidates its `verified` state → it becomes
`stale` until a fresh real run re-verifies it. Test tool/ruleset updates before
rollout; the registry records version + last-verified reference per tool.

## Readiness checks

```bash
curl -s localhost:8787/api/health
curl -s -H "Authorization: Bearer $TOK" localhost:8787/api/connectors   # readiness per connector, from the last sync (?live=1 probes now)
curl -s -H "Authorization: Bearer $TOK" localhost:8787/api/tools         # registry states
```

## Scheduling scans

Scans run through the queue; schedule them with any external scheduler (cron,
CI, systemd timer) hitting `POST /api/projects/{id}/scans` within a valid scope
and run window. Per-asset serialization prevents overlapping scans on one asset.
Network scans should be scheduled inside the scope's allowed `window` and under
its rate limits.

## Global stop & cancel

- **Global stop:** `POST /api/admin/stop {"engaged":true}` (admin). Halts all
  leasing and flags running jobs to stop. `Settings → Global stop` in the UI.
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
  carries `Connection: close`.

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

`FSL_OWNER_EMAIL` and `FSL_OWNER_PASSWORD` only ever create an account; they
never rename one or change its password. So after a mistyped address is
corrected on a persistent disk there are two owners: the new one, and the one
at the default address, which keeps the password it was created with. No
notice reports the older account, and no screen or API can disable an account
yet. To retire it, stop the service and mark the account inactive in the
database:

```bash
python3 -m sqlite3 <data directory>/faisal-security-lab.db \
  "UPDATE users SET active=0 WHERE email='owner@faisal-security-lab.local'"
```

On a host without a persistent disk (the free Render plan) the database is
rebuilt at every start, so only the account for the current settings exists.

Startup problems are logged as `[setup]` lines and published as codes. The
sign-in page (`/api/config`) shows only the codes a visitor may need. Codes
about the host itself, currently `running_as_root` (the container could not
drop root privileges), appear in the logs and in `setup_notices` of `/api/me`
for owners and admins only. The table of codes and the ways to stop a
container from running as root (`--user 10001`, `FSL_REQUIRE_NONROOT=1`) are
in [DEPLOY.md](DEPLOY.md).

## Backup & restore

The entire state is the SQLite DB + the evidence directory (`FSL_DATA_DIR`).
Back up both together.

```bash
# backup
sqlite3 var/faisal-security-lab.db ".backup var/backup.db"
tar czf fsl-backup.tgz var/backup.db var/evidence
# restore (stop the service first)
tar xzf fsl-backup.tgz && mv var/backup.db var/faisal-security-lab.db
make verify    # re-sync tool states on the restored host
```

A restore drill: restore into a scratch `FSL_DATA_DIR`, start the API with
`FSL_NO_WORKER=1`, and confirm `/api/health`, login, and a project's findings load.

In the single-image container the service runs as uid 10001 and must own what it
writes. Files restored from a root shell (`docker exec`, `docker cp`,
`fly ssh console`) are root-owned; the entrypoint hands them to uid 10001 at the
next start. A container started with `--user 10001` cannot do that: run
`chown -R 10001:10001 <data directory>` on the host after restoring, or the
service fails at start with "attempt to write a readonly database".

## Resource & cost estimate (rough)

- API host: ~128 MB RAM, negligible CPU.
- Worker: 1–3 GB RAM per concurrent Semgrep/Trivy job (bound with `mem_limit`),
  1 vCPU per concurrent job. Default `FSL_WORKER_CONCURRENCY=2`.
- Storage: DB grows with findings/audit (KB per finding); redacted evidence is
  small. Raw evidence retention default 90 days.
- AI: off by default (deterministic fallback). When enabled, bounded by
  `ai_token_budget` / `ai_cost_budget_usd` / `ai_timeout_seconds`; the platform
  sends only redacted, minimal data.

## Secrets

Tool/API credentials are supplied via environment variables on the worker only,
never committed. The session signing key is auto-generated to
`var/.session-secret` (0600) or supplied via `FSL_SECRET_KEY`.
