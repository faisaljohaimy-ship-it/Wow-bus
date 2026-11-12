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
| Site spatial view `#/spatial` (SEC-12): plan, zone links, simulated cameras, plan layers, 360° viewer | `docs/design/spatial.md` |
| Field kit `#/fieldkit` (FLD-01): service worker, outbox, QR labels and scanning (demo) | `docs/offline.md` |
| Go-live readiness `#/golive` (PLT-04): the technical plan the page is built from | `docs/golive/plan.md`, `docs/golive/plan-ar.md` |
| Translation runtime and dictionaries | `docs/i18n.md` |
| Older v1/v2 module contract (still accurate for data shapes and charts) | `docs/ARCHITECTURE.md` |

## Commands

```bash
python3 -m http.server 8080            # serve; open http://localhost:8080 (English by default; Arabic: ?lang=ar)
node tests/run.mjs                     # unit tests: scoring, metrics, lifecycle, import, report, time, settings
node --check js/path/to/file.js        # syntax check a module (there is no bundler to catch it)
node tools/qa.mjs --lang ar,en --theme dark,light --viewport 1440x900,390x844 --out ./qa-out
                                       # browser smoke test of all 25 routes (Playwright + Chromium)
node tools/vendor-motion.mjs           # re-vendor the Motion mini build into js/vendor/motion.js
node tools/stamp-shell.mjs             # re-stamp the pre-view headers in index.html from the dictionaries (--check to verify)
node tools/stamp-build.mjs             # stamp index.html before each publish (open pages then offer a reload)
node tools/sw-precache.mjs             # rewrite the PRECACHE list in sw.js from the files on disk (--check to verify)
```

Run `node tests/run.mjs` and the QA script on the routes you touched before you commit.
`tools/qa.mjs` exits 1 on console errors, failed requests, blank canvases, horizontal
overflow, or an empty `main`. The service worker is not registered on `localhost` or under automation
(opt in with `?sw=1`), so the QA script runs without it.

## Publishing (order matters)

`index.html` carries three generated things, and the tests check the first and the third:

1. `node tools/stamp-shell.mjs` — the page headers drawn before any module loads (the block between
   `/*@pre-begin*/` and `/*@pre-end*/`). Needed after a change to a view title or lead, a route code, or the
   route list. `tests/shell-pre.test.mjs` fails when it is stale.
2. `node tools/stamp-build.mjs` — a new `<meta name="biltix-build">`. Needed for **every** publish: the service
   worker registers as `sw.js?v=<stamp>` and names its caches after it, and it serves cached files first, so a
   publish without a new stamp leaves installed copies on the old files. Open pages also use the stamp to offer a
   reload.
3. `node tools/sw-precache.mjs` — the list of files the service worker caches. It holds file names only, so it
   does not depend on the stamp, but run it after steps 1–2 so the check runs on the final tree; needed after
   adding or removing a module, stylesheet, font, poster or 360° preview. `tests/field.test.mjs` fails when it
   is stale.
4. `node tests/run.mjs`, then commit. Do not edit `index.html` or `sw.js` between the stamp and the commit.

The version shown in the rail (`APP_VERSION` in `js/app.js`, `#railVersion` in `index.html`) is bumped by hand
before step 2; `stamp-build` reads it.

## Adding a route

Register it once in `js/views/index.js` (`NAV_META` and one `navGroups` list): the rail, the command palette and
the phone "More" sheet are built from that registry. Then add `core.nav.<id>` (title + short, ar + en) in
`js/i18n/core.js`, the id to the default list in `tools/qa.mjs`, a `SPEC` entry in `tools/stamp-shell.mjs` when
the page header is static text, and run the publish steps 1 and 3. `tests/integration.test.mjs` checks the
registry, the labels, the QA list, the route count above and the module preloads of the loader in `index.html`
(`BOOT` = the static graph of `js/app.js` plus the boot-time imports; `VIEW_MODS.cockpit` = the home view's own
graph).

## Rules that are easy to break

- **No build step, no npm runtime dependencies.** Vendored code lives in `js/vendor/` with its licence header
  (today: the Motion mini build, and `qrcode-generator` 2.0.4 for the field kit's labels — both MIT). Do not add another
  without asking.
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
- **Icons** are inline `svg.icon` and are drawn as glass by CSS (`css/components.css`, "Icon glass"); `js/ui/icon-fx.js`
  runs the melt → vanish → glass-return cycle as a wave (after a route change, then every 12 s). The cycle animates
  `translate` / `scale` / `opacity` / `filter` only — never `transform`, sizes or positions — and is off under reduced
  motion, forced colours and print. `html[data-iconfx="enter" | "off"]` turns the repeats or the whole cycle off. Charts,
  plans, QR codes and the logo are not `svg.icon`; keep it that way (`tests/icon-fx.test.mjs`).
- **Label in name.** A control with visible text is named by that text: use `components.setLabelInName(el, label)`
  (or `labelInName(visible, label)`) instead of an `aria-label` that says something else (WCAG 2.5.3).
- **First paint.** `index.html` is English and static (the default language); an Arabic session gets its shell
  labels from the inline script before `<main>`. Both must equal `js/i18n/core.js` (`tests/lang-default.test.mjs`).
  No static `<script type="module">` or `modulepreload`: the loader after `<main>` starts `js/app.js` once the first
  screen has painted. The home route must stay light: do not import a page dictionary into `js/views/cockpit.js`.
- **The cockpit film** tries to play with sound on every start unless the reader muted it; when the browser refuses,
  it plays muted and the reader's next activating gesture turns the sound on (`soundGestureCounts` in
  `js/ui/explainer-hero.js`, `tests/explainer-hero.test.mjs`). Keep that rule.
- **Brand.** Product name is "BILTIX Risk AI"; the PM system is "BILTIX PM". Do not copy competitors'
  logos, screenshots or text.

## Scope questions still open (do not expand without an answer)

Offline mode, QR workflows, CAD/BIM viewers and 360° capture are not confirmed in scope (Q1). Since v3.8 the app
carries **browser-only demos** of three of them — the field kit (offline copy + outbox, QR labels and scanning) and
a 360° viewer with one simulated capture point — each labelled as a demo, with no server, no installed labels and
no real capture. They show a proposed design; they are not an approved scope. A CAD/BIM viewer is not built (the
site plans are illustrative drawings). `#/golive` lists what a real go-live needs for each.
A real backend (auth, multi-user storage, connectors, signed webhooks) is not built.
The Remotion explainer in `../biltix-explainer/` needs a Remotion company licence if BILTIX
has more than three employees. See "Open questions" in `docs/specs/v3-precision/spec.md`.
