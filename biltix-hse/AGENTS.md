# BILTIX Risk AI — notes for coding agents (Claude Code, Codex, others)

Read this file first. It is short on purpose and points to the documents that bind you.

## What this is

A static, build-free web app (plain ES modules, CSS custom properties, Canvas 2D + SVG).
It is a **demo**: all data is a seeded local simulation. Nothing in this folder talks to a
real BILTIX, Primavera P6, Autodesk APS, Oracle or sensor system. The UI must say so.

- Deployment root: this folder (`biltix-hse/`). Vercel project `biltix-risk-ai`, no build command.
- Production deploys come from `main` only. Branches matching `claude/**` do not auto-deploy
  (`vercel.json` → `git.deploymentEnabled`); previews are created by hand at milestones.
- Never deploy to production, buy services, or call a preview a production release
  without explicit authorization from BILTIX.

## Binding documents (read before editing)

| Topic | File |
|---|---|
| Current scope, decisions, acceptance criteria | `docs/specs/v3-precision/spec.md` |
| Module contract: tokens, i18n API, status, motion, components, data model, file ownership | `docs/specs/v3-precision/CONTRACT.md` |
| Task list and status | `docs/specs/v3-precision/tasks.md` |
| Baseline measurements before v3 | `docs/specs/v3-precision/baseline.md` |
| Design tokens (both themes, contrast) | `docs/design/tokens.md` |
| Component guidance | `docs/design/components.md` |
| Translation runtime and dictionaries | `docs/i18n.md` |
| Older v1/v2 module contract (still accurate for data shapes and charts) | `docs/ARCHITECTURE.md` |

## Commands

```bash
python3 -m http.server 8080            # serve; open http://localhost:8080 (English: ?lang=en)
node tests/run.mjs                     # unit tests: scoring, metrics, lifecycle, import, report, time, settings
node --check js/path/to/file.js        # syntax check a module (there is no bundler to catch it)
node tools/qa.mjs --lang ar,en --theme dark,light --viewport 1440x900,390x844 --out ./qa-out
                                       # browser smoke test of all 22 routes (Playwright + Chromium)
node tools/vendor-motion.mjs           # re-vendor the Motion mini build into js/vendor/motion.js
node tools/stamp-build.mjs             # stamp index.html before each publish (open pages then offer a reload)
```

Run `node tests/run.mjs` and the QA script on the routes you touched before you commit.
`tools/qa.mjs` exits 1 on console errors, failed requests, blank canvases, horizontal
overflow, or an empty `main`.

## Rules that are easy to break

- **No build step, no npm runtime dependencies.** Vendored code lives in `js/vendor/` with its licence header.
- **Bilingual.** Every user-visible string goes through `t()` / `tn()` / `L()` from `js/core/i18n.js`.
  UI strings live in `js/i18n/<namespace>.js` (`{ ar, en }`); seed-data English mirrors live in
  `js/i18n/data/*.js`, keyed by record id; enum values in `js/i18n/enums.js`.
  `lang`/`dir` on `<html>` follow the setting; numerals are an independent setting.
  Keep a number and its unit in one LTR run.
- **Logical CSS only** (`margin-inline-start`, `inset-inline-end`, `text-align: start`). No `left/right` outside canvas math.
- **DOM safety.** Data and user input reach the DOM through `textContent` or attribute setters.
  `innerHTML` is only for static literals with no data in them.
- **Honest status.** Use the taxonomy in `js/core/status.js` (`demo`, `live`, `offline`, `stale`,
  `error`, `not_connected`). Do not show fabricated connectivity, model accuracy, training
  activity or successful operations. Simulated events carry `simulated: true` and say so in the copy.
- **Do not fill missing critical risk inputs with defaults.** Leave them empty and show the data-quality state.
- **One definition per metric.** Counts such as overdue, critical or completion come from
  `js/core/selectors.js` (`sel.*`, `psel.*`). Do not recompute them in a view.
- **localStorage** holds this browser's demo state and preferences only. It is not a
  multi-user database and never holds secrets. Real credentials belong server-side.
- **Motion.** Use `js/ui/motion.js` (micro 120–200 ms, main 220–320 ms, stagger 25–40 ms) and
  respect `prefers-reduced-motion` and the Static / Subtle / Cinematic setting.
- **Brand.** Product name is "BILTIX Risk AI"; the PM system is "BILTIX PM". Do not copy competitors'
  logos, screenshots or text.

## Scope questions still open (do not expand without an answer)

Offline mode, QR workflows, CAD/BIM viewers and 360° capture are not confirmed in scope.
A real backend (auth, multi-user storage, connectors, signed webhooks) is not built.
The Remotion explainer in `../biltix-explainer/` needs a Remotion company licence if BILTIX
has more than three employees. See "Open questions" in `docs/specs/v3-precision/spec.md`.
