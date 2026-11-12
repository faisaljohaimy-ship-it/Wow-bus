# v3 Precision — tasks

Legend: [ ] todo · [~] in progress or partly done · [x] done · [!] blocked

Status as of 2026-11-12, v3.8.2. `acceptance.md` holds the evidence for the acceptance criteria as measured at
v3.5.1 (`da1fbc3`); Lighthouse and axe have not been re-run since.

## Phase 0 — Baseline
- [x] T0.1 Baseline screenshots (identical frozen clock/data) at 360–1440, dark/light — scratchpad/v3/baseline
- [x] T0.2 Lighthouse + axe + network inventory on baseline (commit abf26c2)
- [x] T0.3 Reproduce review observations (a)–(i) → baseline.md
- [x] T0.4 Disable per-push Vercel deploys for claude/** (vercel.json)

## Phase 1 — Foundations (parallel, see CONTRACT.md §9 ownership)
- [x] T1.1 Tokens v3, typography, spacing, radii, elevation, motion tokens, density, breakpoints
- [x] T1.2 Layered background with Static / Subtle / Cinematic modes
- [x] T1.3 Self-hosted fonts; remove Google Fonts
- [x] T1.4 i18n runtime, AR/EN switch, lang/dir, fmt locales, shell dictionary
- [x] T1.5 Status taxonomy module + global Demo badge + honest shell claims
- [x] T1.6 Collapsible activity panel; rail 232/72; content-first layout
- [x] T1.7 Components: drawer tabs, filter bar, status badge, loading/empty/error/offline states
- [x] T1.8 Motion vendor + motion helpers; router page transitions
- [x] T1.9 Data model: likelihood/impact/residual/dataQuality; shared metric definitions; honest connector seeds
- [x] T1.10 English data dictionaries for seed content; bilingual live-engine events

## Phase 2 — Core screens
- [x] T2.1 Cockpit A–F
- [x] T2.2 Settings (language, appearance, weights, thresholds, data mode/status, import preview)
- [~] T2.3 Risk register + drawer lifecycle flow — lifecycle complete; whole-row click is broken (D1 in acceptance.md)
- [x] T2.4 Tasks (edit, assign, attachments, transitions) and alerts

## Phase 3 — All remaining modules bilingual + redesigned
- [x] T3.1 Domains (contracts, bom, schedule, cost, roadmap)
- [x] T3.2 HSE (overview, radar, risks, incidents, permits, inspections, training, compliance)
- [x] T3.3 Reports (consistent metrics, narrative direction, PDF AR/EN), integrations, data quality, engine

## Phase 4 — Motion and explainer
- [x] T4.1 Remotion project biltix-explainer (AR/EN, 1080p + web, posters, VTT); v3.1 recut; fix2 re-render (0 drop-out frames); v3.6 AI narration
- [x] T4.2 Embed explainer (v3.6: autoplaying hero at the top of the cockpit, spec D9; caption track off by default)

## Phase 5 — Verification
- [x] T5.1 Functional browser tests: lifecycle, filters, deep links, import and exports in development probes; QA matrix 552/552 in the final run, which found the row-click bug
- [x] T5.2 Metric-calculation tests (node): 104/104
- [~] T5.3 Lighthouse + axe after; widths matrix — done (desktop passes; mobile and axe fail AC-16/AC-17); [!] WebKit blocked by the network policy
- [~] T5.4 Before/after screenshots — both sets exist with the same frozen clock (baseline: 128, AR, dark/light, 360–1440; after: 552, AR/EN × light/dark × 6 widths); no side-by-side pairs were assembled
- [x] T5.5 Ten-dimension visual review + acceptance table (acceptance.md)

## Phase 6 — Delivery
- [x] T6.1 Docs: tokens, components, spatial, translations, inventory, acceptance, AGENTS.md, CLAUDE.md
- [~] T6.2 Deployment and PR — production deployed 10 times on the user's instruction (latest v3.5.0 af18f77);
      v3.5.1 refused by the Vercel Hobby daily limit (402), retry scheduled 2026-11-12 09:55 UTC; BILTIX
      authorization not recorded (Q3); PR state not recorded in this tree

## Phase 7 — Additions on user request after the first publish
- [x] T7.1 Light theme by default (3ce0c0f)
- [x] T7.2 Nickel-orange metal card edges with laser comets; whole-frame version (v3.1.1)
- [x] T7.3 Ring gauges with radial weekly bars; radial trends on stat tiles and integration cards
- [x] T7.4 New-version notice (build stamp + Reload toast, v3.1.0)
- [x] T7.5 Site spatial view (SEC-12) with honestly simulated cameras (v3.2.0, fixes in v3.3.0)
- [x] T7.6 Explainer recut (v3.1) and fix2 with the 2D projected camera (v3.5.1)
- [x] T7.7 Radar trend charts replace the remaining line charts (v3.3.0)
- [x] T7.8 Cinematic app bar, gliding indicators, depth route transitions (v3.4.0)
- [x] T7.9 Guide shapes (v3.5.0)
- [!] T7.10 Higgsfield camera stills — generated, download blocked; not integrated

## Phase 8 — Open fixes from the final verification (acceptance.md, "Defects")
Round 5 (v3.8 integration) landed code for D1–D7. They stay `[~]` until the integrated tree has been re-measured
in a browser (QA matrix, axe, Lighthouse mobile): the probes quoted in the commits were run on v3.7.0, before the
English default and before the other v3.8 additions.
- [~] T8.1 D1 Whole-row click in clickable tables — `interactiveWithin` stops at the row (unit-tested)
- [~] T8.2 D2 Mobile LCP / Performance — static pre-view header, scripts after the first paint, live engines after
      the first view (`tools/stamp-shell.mjs`, loader in `index.html`); not re-measured
- [~] T8.3 D3 axe serious/critical — label in name on shell and view controls (and the v3.8 controls), roadmap grid
      roles, unique pagers; axe not re-run
- [~] T8.4 D4 Rail plate re-placement after webfonts load on a language switch
- [~] T8.5 D5 Radar Arabic layer drift (`direction` on `g.rt-rim`, not the root svg)
- [~] T8.6 D6 Radar final-state flash before the entrance
- [~] T8.7 D7 Route afterimage offsets at 390 px
- [ ] T8.8 D8 App-bar activity count and avatar contrast
- [ ] T8.9 D9 Spatial: table header overflow on phones, zoom-fit over zone names, palette focus return
- [!] T8.10 Publish v3.5.1 (Vercel daily limit)

## Phase 9 — v3.8 additions (four parallel branches on v3.7.0, integrated on v3.7.2)
- [~] T9.1 Round 5: D1–D7 above, mobile first paint (pre-view + paint-first loader)
- [~] T9.2 Worked example: submittal MAR-S1-CW-014 → AIR-1069 seed, guided walkthrough (`?tour=1`), 360° viewer and
      plan layers on `#/spatial`
- [~] T9.3 Go-live readiness `#/golive` (PLT-04), connector details drawer, cockpit strip
- [~] T9.4 Field kit `#/fieldkit` (FLD-01): service worker, outbox, QR labels and scanning — demo, not in scope (Q1)
- [x] T9.5 Integration: one registry (25 routes), loader preloads = import graph, go-live "today" follows the demo,
      label in name on the new controls, service worker never stores another document as the shell, offline layer
      start order; `tests/integration.test.mjs`, `tests/sw.test.mjs` (node suite green)
- [~] T9.6 Browser verification of the integrated tree — done in headless Chromium: `tools/qa.mjs` on 25 routes ×
      en/ar × light × 1440x900 and 390x844 (dark on five routes), scripted flows for the walkthrough, the 360° viewer,
      the field kit form, the offline queue and its replay (service worker on localhost only), QR scan with a fake
      camera. Not done: axe, Lighthouse mobile, Safari / Firefox / real devices, a screen reader, the service worker
      on the published host
- [x] T9.7 Version bump to 3.8.0, stamps (`stamp-shell` → `stamp-build` → `sw-precache`), publish — published
      2026-11-11 on the user's instruction; BILTIX authorization (Q3) is still not recorded

## Phase 10 — Reviews after v3.8.0
- [x] T10.1 Independent review of v3.8.0 (two reviewers): four major defects, fixed in v3.8.1 — field kit form wiped
      by background repaints, tour not following a language switch, tour keyboard trap, 360° viewer under the tour
      panel
- [x] T10.2 Minor findings of that review, fixed in v3.8.2 (`74ec0c0`): tour step 5 time, the tour leaves with the
      reader (Back, links, the drawer's X) and keeps the tab bar free, one Esc closes one thing, outbox messages follow
      the language, form validation names the fields, 360° viewer says why a picture is missing and shows its markers
      on phones, field-action button names, copy gaps
- [x] T10.3 Second independent review (two reviewers, on `74ec0c0`): no blocker or major. Three minor regressions of
      T10.2 fixed in `e7be8a1` — drawer header at 641–899 px during the tour, a phone turned back to portrait, short
      phones
- [ ] T10.4 Minor findings of the second review still open (none is a regression): quick Next / Back / Next at tour
      steps 7–8 ends the tour or leaves the drawer over the plan; a typed field kit form is lost on a language switch
      when the page came from a `?code=` link and another record was opened; tour dates around midnight (step 1
      "today", step 5 in a browser behind Riyadh time); focus falls to `<body>` after the tour and then its drawer are
      closed, and after "Accept and create task"; a focused control under the phone tab bar on `#/fieldkit`; Arabic
      360° viewer messages drawn left-to-right; tour Next below the screen at 320x256
- [ ] T10.5 Independent check of `e7be8a1` (so far checked by its author, with the reviewers' scripts and its own)
