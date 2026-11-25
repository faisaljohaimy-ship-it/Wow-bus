# BILTIX standalone repository — 2026-11-25

## Scope and source

The owner requested a separate repository and a new deployment URL. This local package takes only the
207 tracked files under `biltix-hse/` from the tested recovery commit
`8d1c645f6874988b2c15f9043fb0faae46ecd3bd` of `faisaljohaimy-ship-it/Wow-bus` and places them at the new
repository root. It does not copy the bus application, security lab, other projects, Git history,
credentials or old deployment settings. The original working tree is unchanged.

Runtime logic, media and vendor licences are preserved. The migration changes deployment documentation,
adapts the existing CI paths to the repository root, and generates a fresh build stamp. Existing specs
remain historical records when they mention the previous repository, project, URL or `biltix-hse/` wrapper.
This document and `AGENTS.md` define the standalone deployment layout.

## Deployment layout

| Setting | Standalone value |
| --- | --- |
| Root Directory | Repository root `.`; leave Vercel's default root field empty |
| Production branch | `main` |
| Build command | None |
| Framework | Static frontend with a Node.js function; no framework build |
| Frontend entry | `index.html` |
| Optional GPT function | `api/assistant.mjs` |
| Deployment exclusions | Root `.vercelignore`; development files remain in Git, runtime assets remain deployable |
| New repository / project / URL | Pending creation and verification; no existing project is repurposed |

Do not set Root Directory to `biltix-hse`: it does not exist in the standalone layout. Preserve
`docs/golive/plan.md`, `docs/golive/plan-ar.md`, media and licences. The video-authoring project is not a
runtime requirement and is not included.

The GPT assistant remains unavailable until the new server environment is configured and a real authorized
request succeeds. No key or access token is included. See [GPT assistant contract](gpt-assistant-2026-11-25.md).

## Acceptance and verification

1. Copy only tracked BILTIX files from the identified source and compare every runtime file with it.
2. Keep CI's pinned Actions, read-only permissions and corrected step-level `runner.temp` paths. Run all
   227 dependency-free tests and the generated-file checks from the repository root.
3. Keep the browser matrix at 48 cases: cockpit, airisks, engine, settings, fieldkit and spatial × Arabic /
   English × dark / light × 1440×900 / 390×844. Observe the actual CI result before calling browser QA passed.
4. Publish under a new repository and Vercel project only after reviewing the prepared package. Record the
   repository URL, deployed source SHA, deployment status, new public URL and observed build stamp.
5. Verify the new URL, assets and function behavior independently. Do not describe preparation or local
   unit-test success as a published site or a verified GPT connection.

## Local release evidence

| Check | Observed result |
| --- | --- |
| Source application copied | 207 tracked files; 15,433,149 bytes before standalone documentation changes |
| Publish sequence | `stamp-shell.mjs` → `stamp-build.mjs` → `sw-precache.mjs` completed |
| Fresh build stamp | `3.8.5+202611251721` |
| Generated checks | Both `stamp-shell.mjs --check` and `sw-precache.mjs --check` passed; 138 precache entries |
| Unit suite | 227 passed, 0 failed across 32 files, Node.js v24.22.3, 2949 ms |
| CI configuration | YAML and root-path checks passed; corrected step-level `runner.temp` paths retained |
| Browser QA | 48 cases configured; execution not observed in this preparation task |
| Remote repository, deployment, new URL and live GPT | Pending; no remote mutation or credential provisioning performed |

Only deployment documentation and the generated build stamp differ from the copied application. Root-level
CI and local-file ignore rules are added. The new remote repository, deployment and browser QA remain pending.

## Standalone configuration and access checkpoint

The standalone `vercel.json` explicitly sets `framework: null`, empty build/install commands and
`outputDirectory: "."`. The root deployment ignore file also excludes Git metadata, CI files and local
Vercel settings. Runtime code and media are preserved.

The first request to create `biltix-risk-ai-v2` in the owner's existing Vercel team returned
`403 forbidden: You don't have permission to create the project.` No project, deployment or URL was
created by that request, and no files or credentials were uploaded. The current connection needs access
to create projects in that team. GitHub repository creation also awaits a completed authenticated session.
The previously opened recovery PR in Wow-bus remains available as a separate reviewed source record.
