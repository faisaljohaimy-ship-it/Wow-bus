@AGENTS.md

## Claude Code specifics

- Cloud sessions: Chromium and Playwright are preinstalled; `tools/qa.mjs` runs as is.
  WebKit downloads may be blocked by the environment's network policy. Do not report
  Chromium device emulation as a WebKit or real iPhone result.
- `*.vercel.app` may be unreachable from the sandbox. Measure Lighthouse locally against
  `python3 -m http.server` and say where the numbers came from.
- When several agents work in parallel, give each a disjoint set of files (see the ownership
  table in `docs/specs/v3-precision/CONTRACT.md` §9) and integrate shared files yourself.
