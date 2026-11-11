# BILTIX Risk AI — v3 "Precision" — Specification

Status: in implementation on branch `claude/biltix-precision-v3` (stacked on PR #4).
Owner of this spec: the v3 implementation team. Companion files: `CONTRACT.md` (binding technical
contract for implementers), `tasks.md` (task list and status), `acceptance.md` (evidence table,
filled during verification), `baseline.md` (measured "before" state).

## 1. Context (verified)

- Repository: `faisaljohaimy-ship-it/Wow-bus`. The product lives in `biltix-hse/` — a static site
  (plain ES modules, no build step, no npm dependencies at runtime). The repository root
  `package.json` belongs to an unrelated TanStack app and is not used by BILTIX.
- Hosting: Vercel project `biltix-risk-ai`, root directory `biltix-hse`, Git-connected, production
  branch `main`. The current production deployment is commit `abf26c2`.
- No backend, no authentication, no server-side storage exists today. State lives in the browser
  (`localStorage`), seeded with demonstration data. This is a single-user demo, and v3 must say so.
- No `AGENTS.md`, `CLAUDE.md` or Spec Kit (`.specify/`) existed; v3 adds `AGENTS.md`/`CLAUDE.md`
  and keeps specs in `biltix-hse/docs/specs/`.

## 2. Goals

1. A coherent, original BILTIX "Precision" visual language (tokens, layered background, typography,
   components) applied to every screen, light and dark designed independently.
2. Two equally complete product experiences: Arabic (RTL) and English (LTR), switchable at runtime,
   persisted, with correct `lang`/`dir`, localized dates, numbers, currency and percentages, and an
   independent numeral preference.
3. A redesigned Risk Cockpit with a clear hierarchy (heading → four executive metrics → five domains
   → risk analysis → priority actions → register) and a complete risk-detail drawer flow
   (Overview / Evidence / Treatment / History) covering the full risk lifecycle.
4. Honest system state: an explicit status taxonomy (Demo, Live, Offline, Stale, Error, Not
   connected); no fabricated connectivity, model accuracy, training activity or successful operations.
5. Fix every reproduced issue from the 2026-11-10 public UI review (see `baseline.md`).
6. Purposeful motion (Motion library, vanilla API) and an optional Remotion explainer (AR + EN).
7. Measured performance and accessibility (Lighthouse targets, WCAG AA), verified on the widths
   360, 390, 430, 768, 1024, 1440 in Chromium (WebKit only if it can be installed here).

## 3. Non-goals

- No framework migration (no React/Vue/build step in `biltix-hse`). Remotion lives in its own
  project `biltix-explainer/` and only its exported video files are embedded.
- No backend, authentication, multi-user storage or real third-party integrations in this phase.
  Server-side concerns (secrets, authorization, signed webhooks, SSRF protection) are documented as
  "Not connected — requires a backend" instead of being simulated.
- No production deployment. Only preview deployments of the v3 branch. Production needs explicit
  authorization from BILTIX.
- No purchases or paid services. No invented commercial terms (payment percentages stay user-entered;
  durations not stated in the proposal are shown as "to be agreed").
- Offline-first, QR, CAD/BIM viewing and 360 capture workflows are NOT in the approved scope until
  BILTIX confirms them (open question Q1). An architecture diagram mentioning Autodesk APS does not
  make it a working integration; it is labelled "Not connected".

## 4. Decisions

| # | Decision | Reason |
|---|----------|--------|
| D1 | Keep static ES modules; add `js/core/i18n.js`, `js/core/status.js`, `js/ui/motion.js` | Improve, don't rebuild |
| D2 | Self-host fonts (IBM Plex Sans Arabic, IBM Plex Sans, IBM Plex Mono; woff2; only used weights) | Performance (no render-blocking third-party CSS) and offline PDFs |
| D3 | Motion (motion.dev, MIT) vanilla `animate` vendored as one ESM file `js/vendor/motion.js`, built by `tools/vendor-motion.mjs` | User requirement; no runtime build; small |
| D4 | Namespaced dictionaries per module: `js/i18n/<namespace>.js` exporting `{ ar, en }`; data content translations in `js/i18n/data/*.js` keyed by record id | Structured, parallel-editable, reviewable |
| D5 | AI-risk severity = likelihood × impact × 4 (0–100), stored with `likelihood`/`impact` (1–5); residual uses `residualLikelihood`/`residualImpact`; model confidence and input-data quality are separate fields | Geometrically accurate heatmap; distinguishes severity, confidence, data quality |
| D6 | Status taxonomy in one module (`status.js`) used by shell, settings, integrations, engine, data quality | One definition, no contradictory claims |
| D7 | Activity feed becomes a collapsible panel (closed by default below 1680 px) | Content width |
| D8 | Preview deployments only, created manually at milestones; automatic deploys disabled for `claude/**` (vercel.json) | Free-plan deployment limit was exhausted by per-push deploys |
| D9 | Remotion explainer with burned-in captions + WebVTT. v3.6 (BILTIX request, 2026-11-11): shown at the top of the cockpit and autoplayed **muted** after load + idle (not under reduced motion, Save-Data, when minimised or after one viewing per tab session); sound only after a gesture; an AI voice is always disclosed | No autoplay audio; accessibility; honest labelling of synthetic voices |

## 5. Acceptance criteria (summary — evidence goes to acceptance.md)

AC-01 Language switch AR/EN visible in the app bar and settings; persisted; `html[lang][dir]` correct; every
      navigation item, heading, form, validation message, chart label, tooltip, toast, report section,
      settings label and aria-label is translated (no Arabic text in EN mode except data names the
      translation set does not cover, which must be listed).
AC-02 Numerals preference independent from language; dates, currency (SAR), percentages localized.
AC-03 Status taxonomy visible: global Demo badge in demo mode; no "connected/live" claims for simulated
      sources; connectors show Demo / Not connected / Live / Stale / Error / Offline per rules.
AC-04 No timestamp in the future anywhere (frozen-clock and real-clock checks).
AC-05 Product name is "BILTIX Risk AI / بلتكس Risk AI" everywhere; HSE appears only as the pillar name.
AC-06 Reports: one definition per metric; overdue counts identical across sections; narrative direction
      matches the sign of the delta (tested).
AC-07 Settings: weights editor (5 domains, must sum to 100%, inline validation) and thresholds editor
      (critical ≥ alert + 5) actually change cockpit scores; links from the cockpit land on these controls.
AC-08 Cockpit hierarchy A–F implemented; filters update metrics, charts and register consistently;
      heatmap cell opens the matching records; drawer close preserves filters and scroll position.
AC-09 Risk drawer with Overview / Evidence / Treatment / History; full lifecycle actions; each risk shows
      source, evidence, explanation, score, owner, due date, treatment, status, history; severity,
      model confidence and input-data quality shown separately.
AC-10 Tasks: create, edit, assign, attach evidence (local, labelled), status transitions with guards.
AC-11 Import: JSON/CSV preview with per-row validation errors before commit; exports verified.
AC-12 Loading, empty, error, retry, cancellation and offline states exist where data can be missing.
AC-13 Visual: no overlapping essential content, no clipped primary labels, no page-level horizontal
      scroll at 360/390/430/768/1024/1440, light/dark × AR/EN.
AC-14 Motion: 120–200 ms micro, 220–320 ms main, 25–40 ms stagger; transform/opacity only; no replay on
      live updates; paused when hidden; reduced-motion and explicit setting respected.
AC-15 Background: Static / Subtle / Cinematic modes; data always on stable opaque surfaces.
AC-16 Performance (lab, documented conditions): LCP ≤ 2.5 s, CLS ≤ 0.1, TBT budget as INP proxy,
      Lighthouse Performance ≥ 90 and Accessibility ≥ 95 on cockpit, settings, register (mobile and
      desktop presets). Field INP cannot be measured here and is reported as not measured.
AC-17 Accessibility: WCAG AA contrast, keyboard paths, visible focus, labelled controls, accessible
      dialogs/drawers, ≥ 40 px touch targets on coarse pointers; axe: 0 serious/critical.
AC-18 Explainer: AR and EN videos, captions (burned-in + WebVTT), poster, lazy loading, user-initiated
      playback with controls; 1080p and web exports present.
AC-19 Docs: design tokens, component guidance, translation guide, functional inventory (Complete /
      Partial / Demo / Not connected / Broken), AGENTS.md + CLAUDE.md handoff notes.

## 6. Open questions for BILTIX (do not block implementation)

Q1 Are Offline, QR, CAD/BIM and 360 workflows in the approved scope?
Q2 Remotion requires a paid company license for companies with more than 3 employees
   (https://www.remotion.dev/license). Confirm licensing before using the explainer commercially.
Q3 Authorization to deploy v3 to production after review of the preview.
Q4 Backend choice for multi-user storage, authentication and server-side integrations (none exists).
