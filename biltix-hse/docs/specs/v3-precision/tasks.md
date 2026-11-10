# v3 Precision — tasks

Legend: [ ] todo · [~] in progress · [x] done · [!] blocked

## Phase 0 — Baseline
- [x] T0.1 Baseline screenshots (identical frozen clock/data) at 360–1440, dark/light — scratchpad/v3/baseline
- [x] T0.2 Lighthouse + axe + network inventory on baseline (commit abf26c2)
- [x] T0.3 Reproduce review observations (a)–(i) → baseline.md
- [x] T0.4 Disable per-push Vercel deploys for claude/** (vercel.json)

## Phase 1 — Foundations (parallel, see CONTRACT.md §9 ownership)
- [ ] T1.1 Tokens v3, typography, spacing, radii, elevation, motion tokens, density, breakpoints
- [ ] T1.2 Layered background with Static / Subtle / Cinematic modes
- [ ] T1.3 Self-hosted fonts; remove Google Fonts
- [ ] T1.4 i18n runtime, AR/EN switch, lang/dir, fmt locales, shell dictionary
- [ ] T1.5 Status taxonomy module + global Demo badge + honest shell claims
- [ ] T1.6 Collapsible activity panel; rail 232/72; content-first layout
- [ ] T1.7 Components: drawer tabs, filter bar, status badge, loading/empty/error/offline states
- [ ] T1.8 Motion vendor + motion helpers; router page transitions
- [ ] T1.9 Data model: likelihood/impact/residual/dataQuality; shared metric definitions; honest connector seeds
- [ ] T1.10 English data dictionaries for seed content; bilingual live-engine events

## Phase 2 — Core screens
- [ ] T2.1 Cockpit A–F
- [ ] T2.2 Settings (language, appearance, weights, thresholds, data mode/status, import preview)
- [ ] T2.3 Risk register + drawer lifecycle flow
- [ ] T2.4 Tasks (edit, assign, attachments, transitions) and alerts

## Phase 3 — All remaining modules bilingual + redesigned
- [ ] T3.1 Domains (contracts, bom, schedule, cost, roadmap)
- [ ] T3.2 HSE (overview, radar, risks, incidents, permits, inspections, training, compliance)
- [ ] T3.3 Reports (consistent metrics, narrative direction, PDF AR/EN), integrations, data quality, engine

## Phase 4 — Motion and explainer
- [~] T4.1 Remotion project biltix-explainer (AR/EN, 1080p + web, posters, VTT)
- [ ] T4.2 Embed explainer (lazy, user-initiated)

## Phase 5 — Verification
- [ ] T5.1 Functional browser tests (lifecycle, filters, deep links, import, exports)
- [ ] T5.2 Metric-calculation tests (node)
- [ ] T5.3 Lighthouse + axe after; widths matrix; WebKit if available
- [ ] T5.4 Before/after screenshots (identical data/filters); AR/EN × light/dark × phone/tablet/desktop
- [ ] T5.5 Ten-dimension visual review + acceptance table

## Phase 6 — Delivery
- [ ] T6.1 Docs: tokens, components, translations, inventory, AGENTS.md, CLAUDE.md
- [ ] T6.2 Preview deployment (manual), PR (stacked on #4), commit SHA, evidence links
