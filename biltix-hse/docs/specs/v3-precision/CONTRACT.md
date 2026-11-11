# v3 Precision — Binding technical contract

Read `spec.md` first. This file fixes names, APIs and ownership so parallel engineers can work
without editing each other's files. The previous contract (`../../ARCHITECTURE.md`, Parts A and B)
stays valid unless this file overrides it.

## 1. Ground rules

- Static ES modules, no build step, no runtime npm. New runtime files: `js/core/i18n.js`,
  `js/core/status.js`, `js/ui/motion.js`, `js/vendor/motion.js` (vendored), `js/i18n/**`.
- Data and user input reach the DOM only through `textContent` / `h()`. No `innerHTML` with data.
- CSS logical properties only; every animation has a reduced-motion path; no hard-coded hex in JS.
- Own only your files (§9). If you need an API from another owner that is not there yet, code against
  this contract with `typeof` guards and keep working.
- Never console.error in normal operation; no console noise for missing translations.
- Verification per change: `node --check` on touched JS; QA harness
  `node /tmp/claude-0/-home-user-Wow-bus/dd6d5ceb-f590-5279-b090-3be1abebb8fa/scratchpad/qa/qa.mjs --port <n> --routes <ids> --viewport 1440x900,390x844 --theme dark,light --out <dir>`
  (append `&lang=en` support: the harness accepts `--lang en` once the shell implements `?lang=` / settings.lang).

## 2. Tokens v3 (css/tokens.css) — keep existing names, new values; add the new names

Dark (default): `--bg-0 #080F1B` app · `--bg-1 #111D2E` card · `--bg-2 #17263B` elevated/inputs/hover ·
`--bg-3 #1D2F48` pressed · `--line #26384F` · `--line-2 #33496A` · `--line-strong` (≥ 3:1 vs --bg-1, for
input/control boundaries) · `--ink-1 #F4F7FB` · `--ink-2 #B8C6D8` · `--ink-3 #93A3BA` ·
`--brand #2F6FED` (fills; white text on it 4.55:1) · `--brand-ink #FFFFFF` · `--brand-text #7FA6FF`
(links/text on dark) · `--accent #19C6E6` · `--accent-text #19C6E6` · `--gold #D4A017` (ornament only).
Light: `--bg-0 #F4F7FB` · `--bg-1 #FFFFFF` · `--bg-2 #F3F6FA` · `--bg-3 #E8EEF6` · `--line #DCE5EF` ·
`--line-2 #C5D2E1` · `--line-strong` (≥ 3:1 vs #FFFFFF) · `--ink-1 #132238` · `--ink-2 #3D4F69` ·
`--ink-3 #55647C` · `--brand #2F6FED` · `--brand-text #1F5AD6` · `--accent #0E93AC` · `--accent-text #0A7489`.
Status (both themes): `--good #0CA30C --warning #FAB219 --serious #EC835A --critical #D03B3B` for marks;
add `--good-text --warning-text --serious-text --critical-text` per theme with ≥ 4.5:1 on --bg-1
(compute; light ≈ #0A7A0A / #8A5A00 / #A4471F / #B42318). Status always ships with icon + label.
Series `--s1..--s8` unchanged (validated on both new surfaces).
Typography: `--font-ar "IBM Plex Sans Arabic"`, `--font-en "IBM Plex Sans"`, `--font-mono "IBM Plex Mono"`,
`--font-sans` resolves per `html[lang]` (ar: Arabic first; en: Latin first), `--font-mono-mixed`.
Scale: `--fs-xs 12px --fs-sm 13px --fs-md 15px (body) --fs-lg 17px --fs-xl 20px --fs-2xl 24px --fs-3xl 30px --fs-hero 44px`;
line-height body 1.65 (ar) / 1.55 (en), headings 1.3. Text roles: `.t-page .t-section .t-card .t-body .t-label .t-helper .t-metric`
(`.t-metric` = tabular-nums). Spacing `--space-1..8 = 4 8 12 16 20 24 32 40`. Radii `--radius-sm 6 --radius-md 10 --radius-lg 14 --radius-xl 20 --radius-pill`.
Elevation `--elev-1` (cards) `--elev-2` (popovers/drawers) `--elev-3` (dialogs).
Motion: `--dur-micro 160ms --dur-main 260ms --dur-slow 420ms --stagger 32ms --ease-out cubic-bezier(.16,1,.3,1) --ease-in-out cubic-bezier(.65,0,.35,1)`.
Density: `html[data-density="comfortable"|"compact"]`. Layout: `--appbar-h 64px --rail-w 232px --rail-w-collapsed 72px --panel-w 360px`, content max-inline-size 1600px, gaps 16–24px.
Breakpoints used: 360, 390, 430, 768, 1024, 1280, 1440, 1680 (+ container queries on `.card`).

## 3. Background (CSS + `art.backdrop()`), modes via `html[data-bg="static"|"subtle"|"cinematic"]`

Layer 1 base `--bg-0`; layer 2 two broad, very soft ambient radial lights near the app bar and the
cockpit hero; layer 3 sparse engineering grid or contour lines at 2–4% opacity; layer 4 one small
original BILTIX identity detail (mark + coordinates) in unused space (inline-end bottom).
`static`: no animation. `subtle` (default): no animation, slightly richer light. `cinematic`: ambient
light drifts (transform only, ≥ 60 s loop), paused when hidden and under reduced motion. Never put
moving elements over cards, charts or tables; cards are opaque. Glass only on app bar/rail with a
solid fallback (`@supports not (backdrop-filter…)` and `prefers-reduced-transparency`).

### 3.1 Background markup and fonts (shared names)

`art.backdrop()` (A-UI) returns `<div class="bg-layers" aria-hidden="true">` containing
`<div class="bg-ambient"></div><div class="bg-grid"></div><div class="bg-mark">…small BILTIX emblem SVG + mono caption…</div>`;
A-STYLE styles all three per mode. Self-hosted fonts (A-STYLE) live in `assets/fonts/` with these names:
`plex-arabic-{arabic|latin}-{400|500|600|700}.woff2`, `plex-sans-latin-{400|500|600}.woff2`,
`plex-mono-latin-{400|500}.woff2`; A-SHELL's pre-paint script injects one `<link rel="preload">` for the
active language's 400 weight (`plex-arabic-arabic-400.woff2` or `plex-sans-latin-400.woff2`). No Google Fonts.

## 4. i18n (js/core/i18n.js) — owner A-SHELL

```js
export const i18n = {
  lang(),            // 'ar' | 'en' (settings.lang, default 'ar')
  dir(),             // 'rtl' | 'ltr'
  locale(),          // 'ar-SA' | 'en-GB' (numerals applied by fmt via -u-nu-latn|arab)
  setLang(lang),     // store.setSettings({ lang }); html[lang][dir]; bus.emit('lang:change', { lang, dir })
  register(ns, dict),        // dict = { ar: {...}, en: {...} }, nested objects allowed; keys 'ns.path.to.key'
  t(key, params),            // interpolation '{name}'; fallback: ar value → key; never throws
  tn(key, count, params),    // plural object { zero, one, two, few, many, other } via Intl.PluralRules(lang); {count} preformatted with fmt.num
  has(key),
  label(enumNs, value),      // enum display: t(`enum.${enumNs}.${value}`) with fallback to value
  registerData(ns, map),     // map: { [recordId]: { field: 'English text' } }
  L(record, field, ns),      // data value in the active language. en → original value DEEP-MERGED with the translation
                             // mirror dataDict[ns][record.id][field] (strings replace, objects merge key-wise, arrays merge
                             // index-wise); else record[field + 'En']; else the original. ar → original.
  localize(record, ns),      // whole record deep-merged with its translation mirror (en) — convenient for views
  term(str),                 // free repeated strings (people, organisations, authorities, roles, places): en → dataDict.terms[str] ?? str
  missing(),                 // Set of missing keys (diagnostics only, no console output)
};
export const t = …, tn = …, L = …;   // bound named exports
```
- Each module registers its namespace at import time: `import dict from '../i18n/cockpit.js'; i18n.register('cockpit', dict);`.
- Dictionary files: `js/i18n/<ns>.js` → `export default { ar: {…}, en: {…} }`. Arabic values = current copy
  (moved, improved only when wrong); English = natural, professional product English (not literal).
- Data dictionaries (`js/i18n/data/<file>.js`) export `default { <ns>: { <recordId>: <mirror> }, terms: { 'arabic': 'English' } }`;
  a mirror has the same shape as the translatable part of the record (strings, objects key-wise, arrays index-wise).
  Singletons use the id `_`. Records created at runtime by the engines carry `titleEn`/`descriptionEn`/… fields instead.
  Namespaces = collection names: sites, risks, incidents, permits, inspections, courses, workers, isoClauses,
  legalRegister, integrations, sensors, company, projects, contracts, suppliers, commodities, boqItems,
  scheduleTasks, resources, approvals, subcontractors, costLines, changeOrders, currencies, labourIndex,
  aiRisks, tasks, alerts, pipelines, validationSources, validationRules, quarantine, connectors, auditLog, roadmap.
- Stored enum values stay Arabic (no data migration); display through `i18n.label(...)`.
  `js/i18n/enums.js` (owner A-DATA-EN) covers every enum in seed.js, platform-seed.js and store.js.
- `fmt` uses `i18n.locale()` + numerals setting; add `fmt.currency(n, { compact })` (SAR), localized
  `relative`, `duration` ("5h 12m" / "٥ س ١٢ د"), Hijri in both languages.
- Language switch: visible segmented control "ع | EN" in the app bar and in settings; `?lang=en|ar`
  URL parameter honoured on load (for tests and shared links). On `lang:change` the shell re-renders
  nav/tab bar/titles and the router re-mounts the current view (scroll restored).
- ctx passed to views gains `i18n, t, tn, L, status, motion`.

## 5. Status taxonomy (js/core/status.js) — owner A-SHELL

```js
export const STATUSES = ['demo', 'live', 'offline', 'stale', 'error', 'not_connected'];
export const status = {
  mode(state),                 // 'demo' when settings.dataSource.type === 'simulation', else 'live'
  source(state),               // { status, lastSuccessAt, lastErrorAt, lastError, staleAfterMs } for the configured data source
  connector(state, record),    // unconfigured record → 'not_connected' (either mode); demo mode: every other record → 'demo';
                               // live mode: only simulated === false or real === true marks a record as real, and a real
                               // record follows the configured data source's evidence (status.source): offline → 'offline',
                               // last attempt failed → 'error', success older than staleAfterMs (30 min unless the record
                               // sets its own) → 'stale', else 'live'; no source URL or no success yet → 'not_connected'.
                               // Every other record stays 'demo'. A record's own lastTest / lastSuccessAt / lastErrorAt are
                               // display-only diagnostics: they never make it 'live' or 'error'.
  pipeline(state, record),     // demo mode → 'demo' (runs are simulated; accuracy — precision / recall / calibration /
                               // drift — is not measured), otherwise 'not_connected' (no model service)
  meta(s),                     // { tone, icon, labelKey: `status.${s}`, descKey: `status.${s}Desc` }
  online(),                    // navigator.onLine
};
```
Rules: never show "connected", "متصل", "live", "training", accuracy as fact, or a success toast for an
operation that did not happen. Simulated operations say "محاكاة / Simulated". Shell: app-bar data
chip (Demo · local data) with a popover explaining local persistence; feed footer from `status`.
Engine: metrics labelled "قيم توضيحية / Illustrative values"; retrain/pause disabled with the reason
"requires a connected model service". Integrations "test connection" only reports success for a real
HTTP test (json/sheets/supabase/webhook); others show "Not connected — requires a backend".

## 6. Motion (js/ui/motion.js + js/vendor/motion.js) — owner A-UI

Vendored Motion (motion.dev, MIT) `animate` as one ESM file built by `tools/vendor-motion.mjs`
(esbuild from npm `motion@14.11.1`, output + LICENSE committed). API:
```js
export const motion = {
  enabled(),                                // false under prefers-reduced-motion or settings.motion==='reduce'
  enter(target, { y = 8, x = 0, scale = 1, delay = 0, stagger = 0.032, duration = 0.26 }),
  exit(target, opts) -> Promise,
  number(el, from, to, { format, duration = 0.6 }),   // metric changes, tabular
  flash(el),                                // highlight an updated row (outline/opacity, 600 ms)
  drawer(el, open) -> Promise,
  page(root),                               // route transition: opacity + translateY(6px), 220 ms
};
```
Transform/opacity only; never replay a whole dashboard on a live event (views patch in place and may
`flash` the changed node); pause when `document.hidden`; controls stay usable during transitions.

## 7. Components additions (js/ui/components.js, charts.js) — owner A-UI

- `drawer({ title, subtitle, tabs: [{ id, label, render }], activeTab, actions, size, onClose, returnFocus })`
  — ARIA tabs inside the drawer; `{ open, close, el, setTab(id) }`; remembers the last tab per `kind`.
- `statusBadge(statusKey, { label })` from `status.meta`; `filterBar({ filters, value, onChange, onReset })`
  → `{ el, set(values), get() }` (chips/select/segmented/search, active count, reset);
  `loadingState`, `errorState({ title, text, retry })`, `offlineState()`, `skeleton(lines)`;
  `dataTable.update(rows, { preserve: true })` keeps page, sort and scroll; `getState()/setState()`.
- All built-in strings via `t('ui.*')` (`js/i18n/ui.js`).
- charts: every built-in string via `t('charts.*')`; `heatmap({ … onCellClick })` passes
  `{ value, ri, ci, row, col }`; new `dumbbell({ items: [{ id, label, from, to }], max, … })` for
  inherent vs residual (no dual axis); axis/locale formatting via fmt; respect `dir` for categorical axes.
- radar canvas strings via `t('radar.*')`, mirrored labels for LTR.

## 8. Data model and shared metric definitions — owner A-DATA (selectors, seeds, engines, sources)

AI risks gain: `likelihood`, `impact` (1–5); `score = likelihood × impact × 4` (consistency enforced
in the seed); `residualLikelihood`, `residualImpact` (null = not assessed); `dataQuality { score, level: 'high'|'medium'|'low', issues: [] }`
derived from the validation of the risk's source system; `treatment { plan, evidence: [{ id, kind: 'link'|'note'|'file', title, url, addedAt, by, local: true }] }`.
Selectors (one definition, used by cockpit AND reports AND exports):
`psel.metrics(state, filters, now)` → `{ openRisks, criticalRisks, overdueMitigations, mitigationCompletion: { pct, closed, total }, deltas }`;
`psel.severityDistribution`, `psel.heatmapLI(state, filters, { residual })` → counts[impact-1][likelihood-1],
`psel.trend(state, filters, weeks = 12)` → `{ labels, openRisks: [], score: [] }`,
`psel.inherentVsResidual`, `psel.lifecycle(risk, state)` → 12 stages `{ key, state: 'done'|'current'|'pending'|'skipped', at, by }`
(source → validation → identification → analysis → evaluation → recommendation → human review →
assignment → escalation → treatment evidence → residual assessment → closure & audit),
`psel.nextAction(risk)`, `psel.registerRows(state, filters, extra)`.
HSE: `sel.overdueRisks(state, filters, now)` is the single overdue definition (overview + reports).
`sel.describeDelta(delta, goodWhen)` → `{ direction: 'up'|'down'|'flat', good: boolean }` for narratives
(text comes from dictionaries; tested in node).
Store additions: `updateAiRisk` patches for `likelihood/impact/residual*/treatment`, `addEvidence(riskId, ev)`,
`assessResidual(riskId, { likelihood, impact, justification })`, `closeAiRisk(riskId, { outcome })`
(requires residual assessment), `reopenAiRisk`, `editTask`, `assignTask`, `addTaskAttachment` — all audited.
Settings additions: `lang 'ar'`, `appearance { background: 'subtle', density: 'comfortable' }`, `calendar 'both'`,
`dataSource { …, lastSuccessAt, lastErrorAt, lastError }`, weights validation (5 non-negative, sum 1 ± 0.001).
Engines: every generated event carries `title/detail` (ar) and `titleEn/detailEn` (en), phrased as
simulation; no "connected/succeeded" claims. Sources: `importPreview(input)` → `{ rows, valid, errors: [{ row, field, message }] }` then `commitImport(rows)`.
Roadmap seed: months 0–4 exactly as the proposal table; no invented durations (`durationMonths: null`, label "to be agreed").

## 9. Ownership (waves)

Wave A (parallel):
- A-STYLE: `css/*.css`, `assets/fonts/**` (self-hosted woff2 + @font-face in tokens.css).
- A-SHELL: `js/core/i18n.js`, `js/core/status.js`, `js/core/fmt.js`, `js/core/router.js`,
  `js/core/bus.js`, `js/app.js`, `index.html`, `js/views/index.js`, `js/i18n/core.js`, `assets/manifest.webmanifest`, `vercel.json`.
- A-UI: `js/ui/*.js`, `js/ui/motion.js`, `js/vendor/**`, `tools/**`, `js/i18n/ui.js`, `js/i18n/charts.js`, `js/i18n/radar.js`.
- A-DATA: `js/data/*.js`, `js/core/store.js` (CRUD and the settings additions of §8 that the shell needs:
  `lang`, `appearance`, `calendar`, `motion`, `dataSource.last*`), `js/core/selectors.js`, `js/core/platform-selectors.js`
  + node tests in `biltix-hse/tests/` (run with plain `node`, no dependencies).
- A-DATA-EN: `js/i18n/enums.js`, `js/i18n/data/*.js` (English data dictionaries keyed by record id).
Wave B (parallel, after Wave A lands): one owner per view group, each also owning its dictionary
files `js/i18n/<view>.js`:
- B-COCKPIT: cockpit.js (+ explainer hero: js/ui/explainer-hero.js; media manifest js/data/explainer-media.js is generated by the explainer pipeline). B-REGISTER: airisks.js, tasks.js, alerts.js.
- B-PLATFORM: settings.js, integrations.js, dataquality.js, engine.js.
- B-DOMAINS: contracts.js, bom.js, schedule.js, cost.js, roadmap.js.
- B-HSE1: overview.js, radar.js, risks.js, incidents.js. B-HSE2: permits.js, inspections.js, training.js, compliance.js, reports.js.
- SPATIAL (v3.1, route `#/spatial`, SEC-12; the app has 23 routes): `js/views/spatial.js`, `js/ui/camfeed.js`,
  `js/data/spatial-seed.js`, `js/i18n/spatial.js`, the "Spatial" section at the end of `css/platform.css`,
  `docs/design/spatial.md`, `tests/spatial*.test.mjs`. Entry points owned elsewhere carry only a deep link
  (`router.href('spatial', { site, zone, risk })`): the AI-risk drawer, the HSE register drawer (risks.js), the radar.
  Feed events of `js/data/live.js` carry `zoneId` when their sentence names a zone (the view matches PPE on it).
Explainer: `biltix-explainer/**`, `assets/video/**` (video engineer).

## 10. Definition of done

- AR and EN both complete for the owned files (switch with `window.biltix.i18n.setLang('en')`).
- Zero console errors; no page-level horizontal scroll at 360/390/430/768/1024/1440; light/dark.
- Keyboard reachable, visible focus, labelled controls, ≥ 40 px touch targets on coarse pointers.
- No fabricated status (§5). No timestamps in the future.
- Screenshots read and judged against the ten quality dimensions (spec §5 and the user brief).
