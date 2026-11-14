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
| `owner_email_ignored` | `FSL_OWNER_EMAIL` is not an email and an owner account already exists; nothing was created or changed | sign in with the existing owner address, or fix the value |
| `owner_password_generated` | no password was set | read the one-time password in the service logs |
| `data_dir_unwritable` | the data directory (or an explicit `FSL_DB_PATH` / `FSL_EVIDENCE_DIR`) cannot be written | that location is temporary; fix the mount/ownership |

Only the location that cannot be written moves to temporary storage: an explicit
`FSL_DB_PATH` or `FSL_EVIDENCE_DIR` in a writable place is kept even when
`FSL_DATA_DIR` is not usable. A standalone worker (`python -m app.worker`, the
`deploy/compose.yaml` setup) does not fall back: it exits with an error, because a
worker on its own empty database would never see the API's jobs.

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
left untouched and named in one log line; the service then uses temporary storage
and reports `data_dir_unwritable`. The owner is changed only when the directory is
not already owned by uid 10001, so that happens on the first start with a new disk
and not on every boot.

## Client address behind a proxy
By default the server identifies a client by the socket peer address and ignores forwarding headers. Behind a platform proxy set FSL_CLIENT_IP_HEADER to the single-value header the platform sets (CF-Connecting-IP on Render, Fly-Client-IP on Fly.io), or set FSL_TRUSTED_PROXY_HOPS to the number of trusted proxies that append to X-Forwarded-For. A wrong value makes sign-in limits shared between visitors; a signed-in owner can see the detected address and its source in Settings.

`render.yaml` and `fly.toml` already set `FSL_CLIENT_IP_HEADER` for their platform.
The detected address and its source are also returned as `client` by `/api/me`;
[OPERATIONS.md](OPERATIONS.md) ("Sign-in protection") shows how to read it and
lists the sign-in limits.

## Enabling the AI layer later
Set `FSL_AI_PROVIDER` + `FSL_AI_BASE_URL` + `FSL_AI_MODEL` + `FSL_AI_API_KEY` (any
OpenAI-compatible or Anthropic endpoint; free tiers work) and restart. Without them
the AI layer runs in deterministic fallback — the platform stays fully functional.
