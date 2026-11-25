# BILTIX deployment storage cleanup — 2026-11-25

## Acceptance

Reduce the deployment payload without breaking the static app or optional GPT endpoint. Preserve every
runtime module, referenced asset, vendor licence and the two go-live plans linked by the UI. Remove a file
from source only when its lack of use is demonstrated. Do not infer that old means unused.

## Baseline and findings

Measured the tracked candidate `bcf18626fd539b2f3edf7d10c71ff66d3f917cc8`:

| Scope | Files | Bytes |
| --- | ---: | ---: |
| Whole repository | 383 | 18,446,282 |
| BILTIX application | 205 | 15,428,730 |
| Files safe to exclude from BILTIX deployment | 56 | 654,669 |
| Remaining BILTIX files before new configuration | 149 | 14,774,061 |

These are source-tree byte counts, not account storage or billed Vercel usage. The exclusions remove about
4.24% of this baseline input. New documentation is also excluded. Vercel's actual retained deployment
storage still needs verification after publishing.

The two 720p MP4s are referenced by `js/data/explainer-media.js`, contain different language tracks, and are
already H.264/AAC with fast-start placement. The 360 images, WebP posters, captions and all 13 fonts have
runtime references. No duplicate blob or demonstrably orphaned runtime module was found inside BILTIX.
The separate video-authoring project was never restored into this deployment. No application files were
deleted merely for being old, and unrelated repository projects were not touched.

## Implemented change

Added `.vercelignore` inside the configured Root Directory, `biltix-hse/`. It excludes development tests,
tools, agent instructions, the README and internal specifications/design documents from Vercel. Those
files remain in Git for maintenance and verification. It also excludes local configuration, test outputs
and archive copies should they be present in a future local deployment.

It intentionally retains:

- `index.html`, `sw.js`, `vercel.json`, `api/assistant.mjs`, all `js/`, `css/` and `assets/` files.
- `docs/golive/plan.md` and `docs/golive/plan-ar.md`, linked by `js/views/golive.js`.

No ZIP or additional gzip copy is committed alongside runtime files. Vercel performs transfer compression
on eligible responses; extra archive copies would not remove the original stored files. Removing files
from a new Git commit also does not erase their historic blobs. No Git history rewrite is part of this fix.

## Verification and remote cleanup

Check ignore semantics against every tracked runtime path and the complete service-worker precache list.
Verify the two plan links and GPT endpoint remain included, then run the established publish stamp/check
sequence. Browser QA and production status must be observed separately before claiming a successful release.

Observed locally: Git ignore semantics excluded the expected 56 baseline files and excluded none of the
149 required runtime paths, including the two plans and the GPT endpoint. Publish stamp
`3.8.5+202611251614`; shell/precache checks passed; 227 tests passed, zero failed, in 3196 ms.

Historical Vercel deployments cannot be classified or removed until the intended project is accessible.
The available connection lists `biz-pulse-ar` only; querying `biltix-risk-ai` returns `404 Project not found`.
No deployment of another project has been deleted. The team billing query returned `costs_not_found`, so
this audit does not assert an account storage total or a quota incident.

Once access is available, preserve the current production deployment and verified rollback candidates,
inspect aliases and retention state, then remove only confirmed obsolete deployments in the authorized
project. A deletion affects future retained storage, not previously recorded usage.

## Primary references

- [Vercel deployment exclusions](https://vercel.com/docs/deployments/vercel-ignore)
- [Root Directory support for Git deployments](https://vercel.com/changelog/january-2023)
