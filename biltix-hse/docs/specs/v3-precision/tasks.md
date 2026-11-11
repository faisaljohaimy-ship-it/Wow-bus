# v3 Precision — tasks

Legend: [ ] todo · [~] in progress or partly done · [x] done · [!] blocked

Status as of 2026-11-11, tree `da1fbc3` (v3.5.1). Evidence for every acceptance criterion: `acceptance.md`.

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
- [ ] T8.1 D1 Whole-row click in clickable tables (`main[tabindex]` matches `INTERACTIVE`)
- [ ] T8.2 D2 Mobile LCP / Performance (static largest element or earlier first view paint)
- [ ] T8.3 D3 axe serious/critical: label-content-name-mismatch (shell controls, tiles), roadmap Gantt roles
- [ ] T8.4 D4 Rail plate re-placement after webfonts load on a language switch
- [ ] T8.5 D5 Radar Arabic layer drift (`direction` on `g.rt-rim`, not the root svg)
- [ ] T8.6 D6 Radar final-state flash before the entrance
- [ ] T8.7 D7 Route afterimage offsets at 390 px
- [ ] T8.8 D8 App-bar activity count and avatar contrast
- [ ] T8.9 D9 Spatial: table header overflow on phones, zoom-fit over zone names, palette focus return
- [!] T8.10 Publish v3.5.1 (Vercel daily limit)
