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

The single-image container starts as root only to make a host-mounted `/data`
writable (a Fly volume is root-owned), then drops to an unprivileged user.

## Enabling the AI layer later
Set `FSL_AI_PROVIDER` + `FSL_AI_BASE_URL` + `FSL_AI_MODEL` + `FSL_AI_API_KEY` (any
OpenAI-compatible or Anthropic endpoint; free tiers work) and restart. Without them
the AI layer runs in deterministic fallback — the platform stays fully functional.
