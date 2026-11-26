# BILTIX deployment recovery — 2026-11-25

## Acceptance criteria

| ID | Required result | Evidence to record |
| --- | --- | --- |
| REC-01 | Restore the complete `biltix-hse/` application from source commit `ebc7af1e7f152f444edcdc497760dd7d8cecf498` onto the current `main` baseline, `843a70b36c48ba9f551ae6c1d319db21ae7f1552`. The candidate Git commit must contain the deployment root, its entry point, configuration, modules and media. | Candidate commit SHA, source-tree comparison and committed-file checks. |
| REC-02 | Preserve the existing baseline files outside `biltix-hse/`. The only planned change outside that folder is `.github/workflows/biltix-ci.yml`. Preserve any newer `main` changes before merging. | Diff against the current base, including a check for unrelated modifications or deletions. |
| REC-03 | Publish with a new `biltix-build` stamp. The generated shell and service-worker precache list must match the final source tree. | New stamp; successful `stamp-shell.mjs --check` and `sw-precache.mjs --check`. |
| REC-04 | Pass the existing dependency-free Node test suite on the candidate source. | Command, Node version, exit status and test result from `node tests/run.mjs`. |
| REC-05 | Verify the candidate commit in a browser in CI before merging: cockpit, risk register, engine, settings, field kit and spatial views × Arabic/English × dark/light × 1440×900/390×844, for 48 cases. Report failed requests, console errors, empty views or horizontal overflow, and check film asset loading. | CI run and candidate SHA, QA log and screenshots; distinguish existing defects from recovery regressions. |
| REC-06 | Confirm the intended Vercel project `biltix-risk-ai` deploys the final `main` commit from root `biltix-hse` and reaches `READY` for Production. Confirm the public app reports the new stamp and its required assets load. | Deployment URL, target, source SHA, status, published stamp and smoke-test results. |

The release-evidence table records completed local checks. Browser QA, the merge and the production deployment remain pending until their results are observed.

## Authorization and scope

The repository owner authorized this recovery release on 2026-11-25. The repair preserves repository protection settings and existing release checks.

The recovery restores the existing BILTIX application and its published media. It retains Root Directory `biltix-hse` and the static frontend. The first local commit, `5871e170afc6134a65c3d2032e79933584533148`, contains this restoration, a new build stamp and the initial CI check.

A follow-up local change adds the owner-protected GPT assistant described in [its acceptance specification](gpt-assistant-2026-11-25.md). That bounded Node function does not turn the existing simulated risk pipelines or enterprise connectors into real integrations. A successful source restoration is not evidence of configured GPT credentials or a successful model request.

## Reproduced failure and source

- The failed production source `843a70b36c48ba9f551ae6c1d319db21ae7f1552` does not contain `biltix-hse/`.
- Vercel was configured to build that folder and stopped with `The specified Root Directory "biltix-hse" does not exist.`
- The complete application exists on `claude/biltix-precision-v3` at `ebc7af1e7f152f444edcdc497760dd7d8cecf498` and has a recorded successful Vercel status.
- The application folder contains 197 source and asset files before the recovery changes. Its runtime media references stay inside `biltix-hse/assets/video/`; the separate `biltix-explainer/` authoring project is not required to serve them.

Source: [BILTIX application at the recovery commit](https://github.com/faisaljohaimy-ship-it/Wow-bus/tree/ebc7af1e7f152f444edcdc497760dd7d8cecf498/biltix-hse).

## Repair and verification order

1. Start from the latest `main` and restore only `biltix-hse/` from the identified source. Review the diff before committing.
2. Keep Vercel's deployment root `biltix-hse` and its existing static-site settings. Do not point this project at the unrelated application in the repository root.
3. From `biltix-hse`, run `node tools/stamp-shell.mjs`, `node tools/stamp-build.mjs`, then `node tools/sw-precache.mjs`.
4. Run the generated-file checks and `node tests/run.mjs`. Do not change the stamped files after verification without repeating the affected checks.
5. Commit the candidate and open its pull request. Check that the application files are present in that Git commit, not only in the working directory, and run the focused browser QA in CI. The local browser executable is unavailable, so the remote result must be observed before this recovery is merged.
6. Review the CI results and merge under the existing repository rules after the recovery checks pass. Verify the resulting production deployment and published assets against the final SHA.

The stamp tool has minute precision. Distinct releases must have distinct stamps so an installed service worker cannot keep a previous build under the same cache name.

## Permanent source check

`.github/workflows/biltix-ci.yml` runs for pull requests and pushes to `main`, without a path filter that could skip a deleted deployment root. It uses read-only repository permissions, checks required non-empty blobs in the checked-out commit, verifies generated shell/precache files and runs the existing Node suite.

Browser verification installs `playwright@1.62.1` as an isolated test tool under `RUNNER_TEMP`, with npm install scripts disabled, then installs Chromium's headless shell and system dependencies on the GitHub runner. `NODE_PATH` points the existing `tools/qa.mjs` harness at that temporary installation. No npm runtime dependency or lockfile is added to the application, and no application secrets are used. The 48-case QA matrix uses `--wait 3000`; its exit status fails the check when a tested view fails. The log and screenshots are uploaded for seven days even when the browser check fails. The job has a ten-minute limit and cancels an older run for the same ref.

Local QA could not start: Playwright 1.62.1 is installed, but the browser binary is absent; the Chromium wrapper points to a missing executable, and the official browser download returned HTTP 403. This is an environment limitation, not evidence that browser QA passed. The CI run is the remaining verification path for the candidate commit.

The workflow is a regression check. It is not described as a required merge check or a Vercel release gate unless the repository or deployment rules separately require it. This repair does not modify those rules.

## Release evidence

| Item | Observed result |
| --- | --- |
| Candidate / merged commit | Restoration committed locally as `5871e170afc6134a65c3d2032e79933584533148`. The GPT implementation is its child commit on the local `fix/restore-biltix-deployment` branch. No remote branch or merged commit observed. |
| Preserved baseline files | Compared with `843a70b36c48ba9f551ae6c1d319db21ae7f1552`: no tracked changes outside `biltix-hse/`, excluding the planned new `.github/workflows/biltix-ci.yml`. Recheck against the current base before merge. |
| Build stamp | Final local GPT candidate: `3.8.5+202611251556`. Initial restoration: `3.8.4+202611251532`. |
| Generated-file checks | `node tools/stamp-shell.mjs --check` and `node tools/sw-precache.mjs --check` both passed on the final local tree; precache contains 138 entries and excludes the API. |
| Node test suite | Final local suite: **227 passed, 0 failed**, 32 files, 3363 ms, Node.js `v24.22.3`. Includes 19 server tests, 8 client tests, one client-to-handler exchange and the authenticated/API cache bypass test. All upstream model responses in these tests are inert fixtures. CI pending. |
| Browser QA | Local browser unavailable; 48-case CI matrix configured. Result and run URL pending. |
| Production deployment and smoke tests | Pending |

## External publication blockers

The local implementation is separate from publication. An automated approval review rejected a Git push,
stating that public disclosure of the payload to the destination had not been explicitly authorized.
Subsequent checks confirmed that the origin is the owner's public `faisaljohaimy-ship-it/Wow-bus` repository
and that the restored files came from that same repository. A read-only remote lookup still did not find
`fix/restore-biltix-deployment`; no PR, merge or production success is claimed. The original `main` remained at
`843a70b36c48ba9f551ae6c1d319db21ae7f1552` when checked.

The connected Vercel account did not expose `biltix-risk-ai`, and its dashboard redirected to sign-in. No
deployment environment variables or credentials were changed. A publication approval and access to the
intended Vercel project remain prerequisites for completing release and live GPT verification. Existing
deployment protection and repository rules were not changed.

If a candidate deployment fails, retain the last known working deployment while correcting the candidate. A rollback target must be a verified working deployment; the baseline commit with the missing application root is not a working release.
