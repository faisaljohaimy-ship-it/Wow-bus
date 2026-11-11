/**
 * BILTIX Risk AI — Risk cockpit (js/views/cockpit.js). Owner: B-COCKPIT.
 *
 * View contract (ARCHITECTURE.md §8): `default { id, code, title, icon, render(container, ctx) → cleanup }`.
 * Spec: docs/specs/v3-precision/spec.md AC-08; contract: CONTRACT.md §4–§8.
 *
 * Hierarchy (one reading order, top to bottom):
 *   0  explainer hero (js/ui/explainer-hero.js, media from js/data/explainer-media.js) — the first card: the
 *      "How the platform works" video (poster paints at once; src after load + idle, then muted autoplay unless
 *      reduced motion / settings.motion 'reduce' / Save-Data / collapsed / already watched this session), with
 *      custom controls, a seven-step progress rail and the chapters / transcript. Phones: full width, video first;
 *      laptops: one band (video on the inline-start side, chapters on the inline-end side, ≤ ~420 px tall).
 *      It never re-renders on live updates; its playback state survives a language switch (module state).
 *   A  heading — title, scope chips (project + period from the global filters, active cockpit filters),
 *      data freshness from status.js ("Data updated 2 hours ago · Demo data"), primary "Register risk"
 *      (shared/risk-form.js) and "How the platform works" (scrolls to the hero, expands it if minimised and
 *      plays it from the start with sound when the file has a voice — the click is the reader's gesture).
 *      Under it the cockpit filter bar (domain, rating, status, owner, search) — it scopes every section.
 *   B  four executive metrics (psel.metrics): open, critical, overdue mitigation, completion (n of N),
 *      deltas vs the previous period with the right good/bad direction, a ring gauge for the tile's headline ratio
 *      (open of the period's risks, red of open, overdue of open actions, closed of all actions) with the 12 weekly
 *      values as radial bars (charts.ringGauge), click → register lens.
 *   C  five domain cards (psel.categoryScores): a dial per card (ring = score / 100 in the rating colour, radial bars =
 *      the 12-week score trend, the score in the centre) + consolidated score and the weights link (#/settings?section=weights).
 *   D  analysis: severity distribution, likelihood × impact matrix (inherent / residual; a cell filters the
 *      register and scrolls to it), 12-week trend as small multiples (no dual axis), inherent vs residual dumbbell.
 *   E  priority actions (psel.priorityActions, psel.nextAction) with an open-details button.
 *   F  detailed register (psel.registerRows) with a lens (all / open / critical / overdue mitigation) and the
 *      matrix-cell chip; sorting, pagination, drill-down into the shared risk drawer.
 *
 * One filtered list: every section derives from the same psel filters (global project / period + the cockpit
 * filter bar). Search is applied here in the active language (code, title, owner, project — Arabic and English)
 * by narrowing state.platform.aiRisks before psel runs, so metrics, charts and rows always agree. The register
 * lens and the matrix cell narrow the register only (their counts are the psel ids of the metric / cell).
 * Filter state lives in the URL (history.replaceState) and is restored on mount, language switch and reload.
 *
 * Live updates (store:change on platform.aiRisks / tasks / alerts, settings, global filters) recompute and patch
 * in place: numbers count with motion.number, changed rows flash, nothing re-enters and the reader never moves.
 * Shared modules owned by B-REGISTER (risk-drawer, risk-form) are imported on demand with a guarded fallback
 * (navigate to #/airisks?risk=ID). All data reaches the DOM through textContent (components.h).
 */

import {
  h, clear, glyph, svgIcon, badge, button, card, segmented, dataTable, emptyState, errorState,
  filterBar, statusBadge, toast,
} from '../ui/components.js';
import { createExplainerHero } from '../ui/explainer-hero.js';
import { EXPLAINER } from '../data/explainer-media.js';
import { motion as motionLib } from '../ui/motion.js';
import { charts as chartsLib, gaugeRatio } from '../ui/charts.js';
import { fmt as fmtLib } from '../core/fmt.js';
import { store as storeLib } from '../core/store.js';
import { bus as busLib } from '../core/bus.js';
import { i18n } from '../core/i18n.js';
import { status as statusLib } from '../core/status.js';
import { psel as pselLib, RATING_THRESHOLDS } from '../core/platform-selectors.js';
import { parseHash, buildHash } from '../core/router.js';
import dict from '../i18n/cockpit.js';
import goliveDict from '../i18n/golive.js';
import { CAPABILITIES as GL_CAPABILITIES, GL_STATUSES, readiness as glReadiness } from '../data/golive.js';

i18n.register('cockpit', dict);
i18n.register('golive', goliveDict);

const VIEW_ID = 'cockpit';
const STYLE_ID = 'view-cockpit-style-v3';
const WEEKS = 12;
const PRIORITY_LIMIT = 6;
const RESIDUAL_LIMIT = 8;
const PAGE_SIZE = 10;
const LIVE_DEBOUNCE_MS = 220;
const FRESHNESS_TICK_MS = 30_000;

const CATEGORY_ORDER = ['contract', 'bom', 'schedule', 'site', 'cost'];
const CATEGORY_VIEW = { contract: 'contracts', bom: 'bom', schedule: 'schedule', site: 'overview', cost: 'cost' };
const CATEGORY_ICON = { contract: 'file-text', bom: 'package', schedule: 'calendar', site: 'helmet', cost: 'chart' };
const RATINGS = ['red', 'yellow', 'green'];
const RATING_TONE = { red: 'critical', yellow: 'warning', green: 'good' };
/** Stored AI-risk statuses (enum aiRiskStatus) — values stay Arabic, labels come from i18n.label. */
const RISK_STATUSES = ['مكتشف', 'تنبيه', 'مهمة مُسندة', 'قيد المعالجة', 'مغلق', 'مُتجاوز'];
const LENSES = ['all', 'open', 'critical', 'overdue'];
const LEVELS = [1, 2, 3, 4, 5];

const t = (key, params) => i18n.t(`cockpit.${key}`, params);
const tn = (key, count, params) => i18n.tn(`cockpit.${key}`, count, params);

/* ------------------------------------------------------------------ */
/* View-scoped layout (tokens only, logical properties, container queries on `main` / `card`) */
/* ------------------------------------------------------------------ */

const STYLE_TEXT = `
.view-cockpit { gap: var(--space-6); }
.view-cockpit .ck-head { display: flex; flex-wrap: wrap; align-items: flex-end; justify-content: space-between; gap: var(--space-3) var(--space-5); }
.view-cockpit .ck-head-main { display: flex; flex-direction: column; gap: var(--space-2); min-inline-size: 0; flex: 1 1 420px; }
.view-cockpit .ck-head .t-page { margin: 0; border-radius: 4px; }
.view-cockpit .ck-head .t-page:focus-visible { outline-offset: 6px; }
.view-cockpit .ck-meta { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 8px; margin: 0; padding: 0; list-style: none; }
.view-cockpit .ck-chip { display: inline-flex; align-items: center; gap: 6px; min-block-size: 28px; max-inline-size: 100%; padding: 2px 10px; border: 1px solid var(--line); border-radius: var(--radius-pill); background: var(--bg-1); font-size: var(--fs-xs); line-height: 1.3; color: var(--ink-3); }
.view-cockpit .ck-chip > svg { inline-size: 13px; block-size: 13px; flex: none; }
.view-cockpit .ck-chip b { font-weight: 600; color: var(--ink-1); overflow-wrap: anywhere; }
.view-cockpit .ck-chip.is-filter { border-color: color-mix(in srgb, var(--brand) 45%, var(--line)); color: var(--ink-2); padding-inline-end: 4px; }
.view-cockpit .ck-chip.is-filter .btn { min-block-size: 0; block-size: 22px; padding-inline: 8px; font-size: var(--fs-xs); }
.view-cockpit .ck-fresh { display: inline-flex; align-items: center; gap: 6px; font-size: var(--fs-xs); color: var(--ink-3); }
.view-cockpit .ck-fresh > svg { inline-size: 13px; block-size: 13px; }
.view-cockpit .ck-status { background: var(--bg-1); border-radius: var(--radius-pill); }
.view-cockpit .ck-actions { display: flex; flex-wrap: wrap; gap: var(--space-2); }
.view-cockpit .ck-filters { display: flex; flex-direction: column; gap: var(--space-2); }
.view-cockpit .ck-filters-note { margin: 0; }
.view-cockpit .ck-filters-toggle { display: none; align-self: flex-start; }
.view-cockpit .ck-filters-toggle .ck-toggle-count { font-variant-numeric: tabular-nums; }
.view-cockpit .ck-section { display: flex; flex-direction: column; gap: var(--space-3); min-inline-size: 0; }
.view-cockpit .ck-section-head { display: flex; flex-wrap: wrap; align-items: flex-end; justify-content: space-between; gap: var(--space-2) var(--space-4); }
.view-cockpit .ck-section-head > .ck-section-titles { display: flex; flex-direction: column; gap: 4px; min-inline-size: 0; flex: 1 1 360px; }
.view-cockpit .domain-grid { grid-template-columns: repeat(5, minmax(0, 1fr)); }
@container main (max-width: 1000px) {
  .view-cockpit .domain-grid { grid-template-columns: repeat(6, minmax(0, 1fr)); }
  .view-cockpit .domain-grid > .domain-card { grid-column: span 2; }
  .view-cockpit .domain-grid > .domain-card:nth-child(n + 4) { grid-column: span 3; }
}
@container main (max-width: 600px) {
  .view-cockpit .domain-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .view-cockpit .domain-grid > .domain-card, .view-cockpit .domain-grid > .domain-card:nth-child(n + 4) { grid-column: span 1; }
  .view-cockpit .domain-grid > .domain-card:last-child { grid-column: 1 / -1; }
}
@container main (max-width: 360px) {
  .view-cockpit .domain-grid { grid-template-columns: minmax(0, 1fr); }
}
.view-cockpit .ck-section-head .t-section, .view-cockpit .ck-section-head .t-helper { margin: 0; }
.view-cockpit .ck-section-head .t-helper { max-inline-size: 78ch; }
.view-cockpit .ck-cons { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 10px; }
.view-cockpit .ck-cons-label { font-size: var(--fs-sm); color: var(--ink-2); font-weight: 500; }
.view-cockpit .ck-cons-score { display: inline-flex; align-items: baseline; gap: 2px; direction: ltr; unicode-bidi: isolate; }
.view-cockpit .ck-cons-score .t-metric { font-size: var(--fs-2xl); }
.view-cockpit .ck-cons-scale { font-size: var(--fs-sm); color: var(--ink-3); }
.view-cockpit .metric-tile { align-content: start; }
.view-cockpit .metric-tile .metric-label { text-wrap: balance; }
.view-cockpit .ck-metric-unit { font-size: var(--fs-sm); font-weight: 500; color: var(--ink-3); }
.view-cockpit .domain-card.is-selected { border-color: color-mix(in srgb, var(--brand) 60%, var(--line)); box-shadow: var(--elev-1), 0 0 0 1px color-mix(in srgb, var(--brand) 40%, transparent); }
.view-cockpit .metric-tile .ck-metric-unit { font-size: var(--fs-xs); white-space: nowrap; }
.view-cockpit .metric-tile .metric-value { flex-wrap: wrap; row-gap: 2px; }
/* Gauge tiles: number, ratio caption and delta in the first column; the ring gauge (fixed box) at the inline end. */
.view-cockpit .metric-tile.has-gauge {
  grid-template-columns: minmax(0, 1fr) auto;
  grid-template-areas: "head head" "value gauge" "ratio gauge" "foot gauge";
  grid-template-rows: auto auto auto 1fr;
  align-items: start;
  row-gap: 6px;
}
.view-cockpit .metric-tile.has-gauge .metric-head { margin-block-end: 2px; }
.view-cockpit .metric-tile.has-gauge .metric-foot { align-self: end; margin-block-start: 2px; }
.view-cockpit .ck-gauge { grid-area: gauge; align-self: center; justify-self: end; display: block; line-height: 0; }
.view-cockpit .ck-ratio { grid-area: ratio; min-inline-size: 0; font-size: var(--fs-xs); line-height: 1.4; color: var(--ink-2); }
.view-cockpit .ck-ratio.is-empty { color: var(--ink-3); }
@container main (max-width: 560px) {
  .view-cockpit .metric-tile.has-gauge { grid-template-areas: "head head" "value gauge" "ratio ratio" "foot foot"; grid-template-rows: auto auto auto auto; align-items: center; }
  .view-cockpit .metric-tile.has-gauge .ring-gauge { --g-size: 64px; --g-ring: 40px; --g-stroke: 5px; --g-bar-in: 24px; --g-bar-len: 7px; --g-bar-w: 3px; --g-center: 11px; }
}
/* Domain dial: the visible score sits in the ring's centre (stacked in one grid cell; the gauge itself is aria-hidden). */
.view-cockpit .domain-card.has-gauge { container: ck-domain / inline-size; }
.view-cockpit .ck-domain-body { display: flex; flex-direction: column; align-items: center; gap: var(--space-3); min-inline-size: 0; }
.view-cockpit .ck-dial { display: grid; place-items: center; flex: none; }
.view-cockpit .ck-dial > * { grid-area: 1 / 1; }
.view-cockpit .ck-dial .domain-score.ck-dial-score { position: relative; z-index: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 1px; direction: ltr; }
.view-cockpit .ck-dial .ck-dial-score .t-metric { font-size: var(--fs-3xl); line-height: 1; }
.view-cockpit .ck-dial .ck-dial-score .domain-scale { font-size: 11px; line-height: 1; }
.view-cockpit .ck-domain-side { display: flex; flex-wrap: wrap; align-items: center; justify-content: center; gap: 6px 12px; inline-size: 100%; min-inline-size: 0; }
.view-cockpit .ck-domain-side .domain-meta { justify-content: center; }
@container ck-domain (min-width: 300px) {
  .view-cockpit .ck-domain-body { flex-direction: row; justify-content: flex-start; gap: var(--space-5); }
  .view-cockpit .ck-domain-side { flex-direction: column; align-items: flex-start; justify-content: center; inline-size: auto; flex: 1 1 auto; }
  .view-cockpit .ck-domain-side .domain-meta { justify-content: flex-start; }
}
.view-cockpit .domain-card .ck-sel-tag { font-size: 11px; font-weight: 600; color: var(--brand-text); }
.view-cockpit .domain-foot svg { inline-size: 14px; block-size: 14px; }
.view-cockpit .ck-analysis { display: grid; grid-template-columns: repeat(12, minmax(0, 1fr)); gap: var(--gap); align-items: stretch; }
.view-cockpit .ck-analysis > * { min-inline-size: 0; }
.view-cockpit .ck-sev { grid-column: span 4; }
.view-cockpit .ck-heat { grid-column: span 8; }
.view-cockpit .ck-trend { grid-column: span 6; }
.view-cockpit .ck-resid { grid-column: span 6; }
@container main (max-width: 1100px) { .view-cockpit .ck-trend, .view-cockpit .ck-resid { grid-column: span 12; } }
@container main (max-width: 860px) { .view-cockpit .ck-sev, .view-cockpit .ck-heat { grid-column: span 12; } }
@container main (max-width: 640px) {
  .view-cockpit { gap: var(--space-5); }
  .view-cockpit .ck-filters-toggle { display: inline-flex; }
  .view-cockpit .ck-filters.is-collapsed .filter-bar, .view-cockpit .ck-filters.is-collapsed .ck-filters-note { display: none; }
  .view-cockpit .ck-actions { inline-size: 100%; }
  .view-cockpit .ck-actions .btn { flex: 1 1 auto; }
}
.view-cockpit .ck-bands { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; }
.view-cockpit .ck-band { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 2px var(--space-3); align-items: center; padding-block: 10px; border-block-end: 1px solid var(--line); }
.view-cockpit .ck-band:last-child { border-block-end: 0; }
.view-cockpit .ck-band-main { display: flex; flex-direction: column; align-items: flex-start; gap: 4px; min-inline-size: 0; }
.view-cockpit .ck-band-hint { font-size: var(--fs-xs); color: var(--ink-3); }
.view-cockpit .ck-band-count { text-align: end; font-size: var(--fs-lg); font-weight: 600; font-variant-numeric: tabular-nums; color: var(--ink-1); line-height: 1.2; }
.view-cockpit .ck-band-share { display: block; font-size: var(--fs-xs); font-weight: 400; color: var(--ink-3); }
.view-cockpit .ck-sev-body { display: flex; flex-direction: column; gap: var(--space-3); }
.view-cockpit .ck-segbar { display: flex; gap: 2px; block-size: 28px; border-radius: 8px; overflow: hidden; background: var(--bg-2); }
.view-cockpit .ck-seg { flex: 1 1 0; min-inline-size: 6px; display: grid; place-items: center; font-size: var(--fs-xs); font-weight: 600; font-variant-numeric: tabular-nums; line-height: 1; }
.view-cockpit .ck-seg[hidden] { display: none; }
.view-cockpit .ck-seg.is-red { background: var(--critical); color: var(--ink-on-dark); }
.view-cockpit .ck-seg.is-yellow { background: var(--warning); color: var(--ink-on-light); }
.view-cockpit .ck-seg.is-green { background: var(--good); color: var(--ink-on-light); }
.view-cockpit .ck-heat-body { display: grid; grid-template-columns: minmax(0, 1fr) minmax(190px, 250px); gap: var(--space-5); align-items: start; }
@container card (max-width: 640px) { .view-cockpit .ck-heat-body { grid-template-columns: minmax(0, 1fr); } }
.view-cockpit .ck-matrix { display: grid; grid-template-columns: 18px auto repeat(5, minmax(40px, 1fr)); gap: 4px; max-inline-size: 480px; }
.view-cockpit .ck-mx-ytitle { grid-column: 1; grid-row: 1 / span 5; align-self: center; justify-self: center; writing-mode: vertical-rl; transform: rotate(180deg); font-size: var(--fs-xs); font-weight: 600; color: var(--ink-2); white-space: nowrap; }
.view-cockpit .ck-mx-rlabel { grid-column: 2; display: flex; align-items: center; justify-content: flex-end; gap: 6px; padding-inline-end: 4px; font-size: var(--fs-xs); color: var(--ink-2); white-space: nowrap; text-align: end; }
.view-cockpit .ck-mx-clabel { display: flex; flex-direction: column; align-items: center; gap: 1px; padding-block-start: 4px; font-size: var(--fs-xs); color: var(--ink-2); text-align: center; line-height: 1.25; }
.view-cockpit .ck-mx-lvl { font-family: var(--font-mono); font-weight: 600; color: var(--ink-1); font-variant-numeric: tabular-nums; }
.view-cockpit .ck-mx-name { color: var(--ink-3); font-size: 11px; }
.view-cockpit .ck-mx-xtitle { grid-column: 3 / -1; text-align: center; font-size: var(--fs-xs); font-weight: 600; color: var(--ink-2); padding-block-start: 2px; }
@container card (max-width: 520px) { .view-cockpit .ck-mx-rlabel .ck-mx-name, .view-cockpit .ck-mx-clabel .ck-mx-name { display: none; } }
.view-cockpit .ck-cell { --zone: var(--good); --zone-ink: var(--good-text); position: relative; display: grid; place-items: center; min-block-size: 44px; aspect-ratio: 5 / 4; padding: 0; border-radius: 6px; border: 1px solid color-mix(in srgb, var(--zone) 30%, var(--line)); background: color-mix(in srgb, var(--zone) 9%, var(--bg-1)); color: var(--ink-3); font: inherit; font-size: var(--fs-md); font-weight: 600; font-variant-numeric: tabular-nums; line-height: 1; cursor: default; }
.view-cockpit .ck-cell.zone-red { --zone: var(--critical); --zone-ink: var(--critical-text); }
.view-cockpit .ck-cell.zone-yellow { --zone: var(--warning); --zone-ink: var(--warning-text); }
.view-cockpit .ck-cell.has-risks { background: var(--zone); border-color: transparent; color: var(--ink-on-light); cursor: pointer; }
.view-cockpit .ck-cell.zone-red.has-risks { color: var(--ink-on-dark); }
.view-cockpit .ck-cell.has-risks:hover { filter: brightness(1.08); }
.view-cockpit .ck-cell:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; z-index: 1; }
.view-cockpit .ck-cell[aria-pressed="true"] { box-shadow: 0 0 0 2px var(--bg-1), 0 0 0 4px var(--ink-1); z-index: 1; }
.view-cockpit .ck-heat-side { display: flex; flex-direction: column; gap: var(--space-4); min-inline-size: 0; }
.view-cockpit .ck-legend { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; font-size: var(--fs-xs); color: var(--ink-2); }
.view-cockpit .ck-legend-item { --zone: var(--good); --zone-ink: var(--good-text); display: flex; align-items: center; gap: 8px; }
.view-cockpit .ck-legend-item.zone-red { --zone: var(--critical); --zone-ink: var(--critical-text); }
.view-cockpit .ck-legend-item.zone-yellow { --zone: var(--warning); --zone-ink: var(--warning-text); }
.view-cockpit .ck-legend-key { flex: none; inline-size: 14px; block-size: 14px; border-radius: 3px; background: var(--zone); }
.view-cockpit .ck-legend-item > svg { flex: none; inline-size: 13px; block-size: 13px; color: var(--zone-ink); }
.view-cockpit .ck-heat-note { margin: 0; font-size: var(--fs-xs); color: var(--ink-3); line-height: 1.5; }
.view-cockpit .ck-heat-total { margin: 0; font-size: var(--fs-sm); color: var(--ink-1); font-weight: 600; }
.view-cockpit .ck-multiples { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--space-5); }
@container card (max-width: 560px) { .view-cockpit .ck-multiples { grid-template-columns: minmax(0, 1fr); } }
.view-cockpit .ck-multiple { display: flex; flex-direction: column; gap: var(--space-2); min-inline-size: 0; }
.view-cockpit .ck-multiple-head { display: flex; flex-wrap: wrap; align-items: baseline; justify-content: space-between; gap: 2px var(--space-2); }
.view-cockpit .ck-multiple-title { font-size: var(--fs-sm); font-weight: 600; color: var(--ink-1); }
.view-cockpit .ck-multiple-value { font-size: var(--fs-xl); font-weight: 600; font-variant-numeric: tabular-nums; color: var(--ink-1); }
.view-cockpit .ck-multiple-change { font-size: var(--fs-xs); color: var(--ink-3); }
.view-cockpit .ck-resid-note { margin: var(--space-2) 0 0; font-size: var(--fs-xs); color: var(--ink-3); }
.view-cockpit .priority-item { padding-inline: var(--space-2); }
.view-cockpit .priority-title { display: block; }
.view-cockpit .ck-next { color: var(--ink-2); }
.view-cockpit .ck-next svg { color: var(--accent-text); }
.view-cockpit .priority-side { min-inline-size: 0; }
.view-cockpit .ck-reg-tools { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-2) var(--space-3); margin-block-end: var(--space-3); }
.view-cockpit .ck-reg-count { margin-inline-start: auto; font-size: var(--fs-xs); color: var(--ink-3); font-variant-numeric: tabular-nums; }
.view-cockpit .ck-cellchip { display: inline-flex; align-items: center; gap: 6px; min-block-size: 32px; padding: 2px 4px 2px 10px; padding-inline: 10px 4px; border: 1px solid color-mix(in srgb, var(--brand) 50%, var(--line)); border-radius: var(--radius-pill); background: color-mix(in srgb, var(--brand) 8%, var(--bg-1)); font-size: var(--fs-xs); color: var(--ink-1); }
.view-cockpit .ck-cellchip .btn { block-size: 26px; min-block-size: 0; }
.view-cockpit .ck-risk-cell { display: flex; flex-direction: column; gap: 3px; min-inline-size: 220px; max-inline-size: 460px; text-align: start; }
.view-cockpit .ck-risk-title { font-weight: 600; color: var(--ink-1); line-height: 1.4; }
.view-cockpit .ck-risk-sub { display: flex; flex-wrap: wrap; align-items: center; gap: 2px 8px; font-size: var(--fs-xs); color: var(--ink-3); font-weight: 400; }
.view-cockpit .ck-score-cell { display: inline-flex; align-items: center; gap: 8px; white-space: nowrap; }
.view-cockpit .ck-score-num { min-inline-size: 2.4ch; text-align: end; font-weight: 600; font-variant-numeric: tabular-nums; color: var(--ink-1); }
.view-cockpit .ck-li { font-family: var(--font-mono); font-size: 11px; color: var(--ink-3); direction: ltr; unicode-bidi: isolate; white-space: nowrap; }
.view-cockpit .ck-due { display: inline-flex; align-items: center; gap: 5px; white-space: nowrap; font-variant-numeric: tabular-nums; }
.view-cockpit .ck-due.is-overdue { color: var(--critical-text); font-weight: 600; }
.view-cockpit .ck-due > svg { flex: none; inline-size: 13px; block-size: 13px; }
.view-cockpit .ck-cat { display: inline-flex; align-items: center; gap: 6px; color: var(--ink-2); white-space: nowrap; }
.view-cockpit .ck-cat > svg { inline-size: 14px; block-size: 14px; color: var(--ink-3); flex: none; }
.view-cockpit .ck-muted { color: var(--ink-3); }
.view-cockpit .ck-risk-narrow { display: none; }
@container card (max-width: 980px) { .view-cockpit .ck-register .table [data-priority="low"] { display: none; } }
@container card (max-width: 520px) {
  .view-cockpit .ck-risk-cell { min-inline-size: 0; max-inline-size: none; }
  .view-cockpit .ck-register .ck-score-cell .ck-li { display: none; }
  .view-cockpit .ck-register th[data-key="title"] { inline-size: auto !important; }
  .view-cockpit .ck-register .ck-score-cell { flex-direction: column; align-items: flex-end; gap: 4px; }
  .view-cockpit .ck-risk-narrow { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 10px; margin-block-start: 2px; font-size: var(--fs-xs); color: var(--ink-2); font-weight: 400; }
  .view-cockpit .ck-risk-narrow.is-overdue { color: var(--critical-text); }
  .view-cockpit .ck-risk-narrow > svg { inline-size: 12px; block-size: 12px; flex: none; }
}
.view-cockpit .code { white-space: nowrap; }
.view-cockpit .ck-state-wrap[hidden], .view-cockpit [data-ck-host][hidden] { display: none !important; }
@media (pointer: coarse) {
  .view-cockpit .ck-chip.is-filter .btn, .view-cockpit .ck-cellchip .btn { block-size: 40px; }
  .view-cockpit .ck-cell { min-block-size: 44px; }
  .view-cockpit .seg-btn { min-inline-size: 40px; }
}
`;

function ensureStyle() {
  if (typeof document === 'undefined' || document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = STYLE_TEXT;
  document.head.appendChild(style);
}

/* ------------------------------------------------------------------ */
/* Pure helpers                                                         */
/* ------------------------------------------------------------------ */

const isNum = (n) => typeof n === 'number' && Number.isFinite(n);
const num = (n, d = 0) => (isNum(n) ? n : (n !== null && n !== '' && isNum(Number(n)) ? Number(n) : d));
const ms = (v) => { const x = v instanceof Date ? v.getTime() : Date.parse(String(v ?? '')); return Number.isFinite(x) ? x : NaN; };

/** Arabic-aware search normalisation (same folding as psel): tashkeel/tatweel, alef, taa marbuta, yaa. */
function norm(value) {
  return String(value ?? '').toLowerCase()
    .replace(/[\u064B-\u0652\u0640]/g, '')
    .replace(/[أإآٱ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Latin alphanumeric tokens (2B, P6, CT-2026-014) keep ASCII digits; free text follows the numerals setting. */
const LATIN_NUM_TOKEN = /[A-Za-z][A-Za-z0-9._-]*\d[A-Za-z0-9._-]*|\d+[A-Za-z][A-Za-z0-9._-]*/g;
function digitsIn(fmt, value) {
  const s = String(value ?? '');
  if (!fmt || typeof fmt.digits !== 'function' || !/\d/.test(s)) return s;
  let out = ''; let last = 0; let m;
  LATIN_NUM_TOKEN.lastIndex = 0;
  while ((m = LATIN_NUM_TOKEN.exec(s))) { out += fmt.digits(s.slice(last, m.index)) + m[0]; last = m.index + m[0].length; }
  return out + fmt.digits(s.slice(last));
}

const CODE_RE = /\b[A-Z]{1,5}-[A-Z0-9-]*\d[A-Z0-9-]*\b/g;
/** A code (AIR-1042, CT-2026-014) as an isolated LTR mono run that never breaks. */
function codeSpan(code) {
  return h('span', { class: ['code', 'mono', 'nowrap'], dir: 'ltr', translate: 'no' }, String(code ?? ''));
}
/** Text that mixes prose and Latin codes → text nodes + code spans. */
function withCodes(fmt, str) {
  const s = String(str ?? '');
  const out = [];
  let last = 0; let m;
  CODE_RE.lastIndex = 0;
  while ((m = CODE_RE.exec(s))) {
    if (m.index > last) out.push(digitsIn(fmt, s.slice(last, m.index)));
    out.push(codeSpan(m[0]));
    last = m.index + m[0].length;
  }
  if (last < s.length) out.push(digitsIn(fmt, s.slice(last)));
  return out.length ? out : [digitsIn(fmt, s)];
}

/** Signed number for an LTR isolate (delta pills): Intl's bidi marks would push the sign to the wrong side. */
const BIDI_MARKS = /[\u200E\u200F\u061C\u202A-\u202E\u2066-\u2069\uFEFF]/g;
const signedLtr = (fmt, n) => String(fmt.signed(n)).replace(BIDI_MARKS, '');

function setText(el, text) { if (el && el.textContent !== text) el.textContent = text; }
function setAttr(el, name, value) {
  if (!el) return;
  if (value === null || value === undefined || value === false) { if (el.hasAttribute(name)) el.removeAttribute(name); return; }
  const v = String(value);
  if (el.getAttribute(name) !== v) el.setAttribute(name, v);
}
function warnOnce(seen, key, err) {
  if (seen.has(key)) return;
  seen.add(key);
  try { console.warn(`[cockpit] ${key}:`, err && err.message ? err.message : err); } catch { /* noop */ }
}

/** Zone of a likelihood × impact cell from the B2 rating bands (score = L × I × 4). */
function zoneOf(l, i) {
  const score = l * i * 4;
  if (score >= RATING_THRESHOLDS.red) return 'red';
  if (score >= RATING_THRESHOLDS.yellow) return 'yellow';
  return 'green';
}

/* ------------------------------------------------------------------ */
/* URL state                                                            */
/* ------------------------------------------------------------------ */

const DEFAULT_UI = Object.freeze({ domain: 'all', rating: 'all', status: 'all', owner: 'all', q: '', lens: 'all', l: null, i: null, hm: 'inherent' });

function sanitizeUi(params = {}) {
  const p = params && typeof params === 'object' ? params : {};
  const pick = (v, allowed) => (allowed.includes(String(v)) ? String(v) : 'all');
  const lvl = (v) => { const n = Number(v); return Number.isInteger(n) && n >= 1 && n <= 5 ? n : null; };
  const l = lvl(p.l); const i = lvl(p.i);
  return {
    domain: pick(p.domain, CATEGORY_ORDER),
    rating: pick(p.rating, RATINGS),
    status: pick(p.status, RISK_STATUSES),
    owner: typeof p.owner === 'string' && p.owner.trim() && p.owner !== 'all' ? p.owner.slice(0, 160) : 'all',
    q: typeof p.q === 'string' ? p.q.slice(0, 120) : '',
    lens: LENSES.includes(String(p.lens)) ? String(p.lens) : 'all',
    l: l && i ? l : null,
    i: l && i ? i : null,
    hm: p.hm === 'residual' ? 'residual' : 'inherent',
  };
}

function uiToParams(ui, extra = {}) {
  const out = {};
  for (const key of ['domain', 'rating', 'status', 'owner', 'lens']) if (ui[key] && ui[key] !== 'all') out[key] = ui[key];
  if (ui.q && ui.q.trim()) out.q = ui.q.trim();
  if (ui.l && ui.i) { out.l = ui.l; out.i = ui.i; }
  if (ui.hm === 'residual') out.hm = 'residual';
  for (const [k, v] of Object.entries(extra)) if (v !== null && v !== undefined && v !== '') out[k] = v;
  return out;
}

/* ------------------------------------------------------------------ */
/* View                                                                 */
/* ------------------------------------------------------------------ */

export default {
  id: VIEW_ID,
  code: 'CPT-00',
  get title() { return i18n.t('cockpit.title'); },
  icon: 'radar',

  render(container, ctx = {}) {
    const store = ctx.store || storeLib;
    const bus = ctx.bus || busLib;
    const fmt = ctx.fmt || fmtLib;
    const charts = ctx.charts && typeof ctx.charts.sparkline === 'function' ? ctx.charts : chartsLib;
    const gaugeLib = typeof charts.ringGauge === 'function' && typeof charts.trendSentence === 'function' ? charts : chartsLib;
    const psel = ctx.psel && typeof ctx.psel.metrics === 'function' ? ctx.psel : pselLib;
    const status = ctx.status && typeof ctx.status.source === 'function' ? ctx.status : statusLib;
    const motion = ctx.motion && typeof ctx.motion.enter === 'function' ? ctx.motion : motionLib;
    const router = ctx.router || null;

    ensureStyle();

    let alive = true;
    const subs = [];
    const timers = new Set();
    const warned = new Set();
    const chartsToDestroy = [];
    let liveTimer = 0;
    let pendingLive = { live: false, filterChange: false };

    /* ---- params: the URL is the truth (router.refresh re-mounts with stale ctx.params after replaceState) ---- */
    const initialParams = (() => {
      try { const cur = parseHash(location.hash); if (cur.id === VIEW_ID) return cur.params; } catch { /* no location */ }
      return ctx.params || {};
    })();
    let ui = sanitizeUi(initialParams);
    const deepRisk = typeof initialParams.risk === 'string' && initialParams.risk ? initialParams.risk : null;

    const stateOf = () => store.state || (typeof store.get === 'function' ? store.get() : {});
    const nowDate = () => (typeof store.now === 'function' ? store.now() : new Date());
    const globalFilters = () => store.filters || (stateOf().filters) || { siteId: 'all', range: 30, search: '' };
    const navigate = (id, params = {}) => {
      if (router && typeof router.navigate === 'function') router.navigate(id, params);
      else { try { location.hash = buildHash(id, params); } catch { /* noop */ } }
    };
    const hrefOf = (id, params = {}) => (router && typeof router.href === 'function' ? router.href(id, params) : buildHash(id, params));

    function writeUrl() {
      try {
        const cur = parseHash(location.hash);
        if (cur.id !== VIEW_ID) return;
        // ?risk= belongs to the open risk drawer (shared/risk-drawer.js mirrors it while open): keep it.
        const next = buildHash(VIEW_ID, uiToParams(ui, { risk: cur.params && cur.params.risk ? cur.params.risk : null }));
        if (location.hash !== next) history.replaceState(history.state, '', next);
      } catch { /* sandboxed history */ }
    }

    /* ---------------------------------------------------------------- */
    /* Localised data helpers                                             */
    /* ---------------------------------------------------------------- */

    const label = (ns, value) => i18n.label(ns, value);
    const categoryLabel = (id) => label('aiCategory', id);
    const domainName = (id) => (i18n.has(`cockpit.domains.name.${id}`) ? t(`domains.name.${id}`) : categoryLabel(id));
    const ratingLabel = (r) => label('rating', r);
    const statusLabel = (s) => label('aiRiskStatus', s);
    const ownerName = (o) => (o ? digitsIn(fmt, i18n.term(o)) : '');
    const titleOf = (risk) => {
      if (!risk) return '';
      const v = i18n.L(risk, 'title', 'aiRisks');
      return typeof v === 'string' && v ? v : String(risk.title || risk.code || '');
    };
    const siteById = (id) => (stateOf().sites || []).find((s) => s.id === id) || null;
    const projectName = (id) => {
      const s = siteById(id);
      if (!s) return '';
      const v = i18n.L(s, 'name', 'sites');
      return digitsIn(fmt, typeof v === 'string' ? v : s.name);
    };
    const riskById = (id) => ((stateOf().platform || {}).aiRisks || []).find((r) => r.id === id || r.code === id) || null;
    const nextLabel = (next) => {
      if (!next) return '';
      const key = `cockpit.next.${next.key}`;
      if (i18n.has(key)) return i18n.t(key);
      return i18n.pick({ ar: next.label, en: next.labelEn || next.label });
    };

    function ratingBadge(r, { sm = false } = {}) {
      const rating = RATINGS.includes(r) ? r : 'green';
      return h('span', { class: ['rating', `is-${rating}`, sm ? 'is-sm' : null], 'data-rating': rating }, glyph(RATING_TONE[rating], 12), h('span', {}, ratingLabel(rating)));
    }
    function catChip(id) {
      return h('span', { class: 'ck-cat', 'data-category': id || '' }, svgIcon(CATEGORY_ICON[id] || 'layers', 14), h('span', {}, categoryLabel(id)));
    }
    function dueCell(row) {
      if (!row.dueDate) return h('span', { class: 'ck-muted' }, t('register.noDue'));
      const overdue = !!row.overdue;
      return h('span', { class: ['ck-due', overdue ? 'is-overdue' : null] },
        glyph(overdue ? 'critical' : 'clock', 13),
        h('span', {}, fmt.date(row.dueDate, { style: 'short' })),
        overdue ? h('span', { class: 'sr-only' }, ` — ${t('register.overdue')}`) : null);
    }

    /* ---------------------------------------------------------------- */
    /* Derivation — ONE filtered list                                     */
    /* ---------------------------------------------------------------- */

    /** Search haystack of a risk in both stored Arabic and the active language. */
    function haystack(state, r) {
      const site = (state.sites || []).find((s) => s.id === r.projectId);
      const parts = [r.code, r.title, titleOf(r), r.owner, r.owner ? i18n.term(r.owner) : '', site ? site.name : '', site ? i18n.L(site, 'name', 'sites') : '',
        site ? site.code : '', categoryLabel(r.category), statusLabel(r.status), label('aiType', r.type), r.evidence && r.evidence.ref];
      return norm(parts.filter((p) => typeof p === 'string' && p).join(' \u0001 '));
    }

    /** psel filters for the current scope (`withDomain: false` for the domain cards / consolidated score). */
    function pselFilters({ withDomain = true, searching = false } = {}) {
      const g = globalFilters();
      const f = { siteId: g.siteId || 'all', range: Number(g.range) || 30 };
      if (withDomain && ui.domain !== 'all') f.domain = ui.domain;
      if (ui.rating !== 'all') f.rating = ui.rating;
      if (ui.status !== 'all') f.status = ui.status;
      if (ui.owner !== 'all') f.owner = ui.owner;
      // The search runs here (bilingual) on the risk list itself; a blank search keeps psel's
      // "risk-level filter active" rule for unlinked tasks without filtering anything a second time.
      if (searching) f.search = ' ';
      return f;
    }

    function derive() {
      const state = stateOf();
      const platform = state && state.platform;
      if (!platform || !Array.isArray(platform.aiRisks)) return null;
      const now = nowDate();
      const g = globalFilters();
      const query = [g.search, ui.q].map((s) => norm(s)).filter(Boolean).join(' ');
      const terms = query ? query.split(' ').filter(Boolean) : [];
      const scoped = terms.length
        ? { ...state, platform: { ...platform, aiRisks: platform.aiRisks.filter((r) => { const hay = haystack(state, r); return terms.every((term) => hay.includes(term)); }) } }
        : state;
      const searching = terms.length > 0;
      const f = pselFilters({ searching });
      const fAll = pselFilters({ withDomain: false, searching });

      const metrics = psel.metrics(scoped, f, now);
      const categories = psel.categoryScores(scoped, fAll, now);
      const consolidated = psel.consolidatedScore(scoped, fAll, now);
      const severity = psel.severityDistribution(scoped, f, now);
      const heat = psel.heatmapLI(scoped, f, { residual: ui.hm === 'residual', now });
      const trend = psel.trend(scoped, f, WEEKS, now);
      const scoreSeries = ui.domain !== 'all'
        ? ((categories.find((c) => c.category === ui.domain) || {}).trend || [])
        : (consolidated.trend || trend.score || []);
      const residual = psel.inherentVsResidual(scoped, f, now);
      const priority = psel.priorityActions(scoped, f, PRIORITY_LIMIT, now);
      const all = psel.registerRows(scoped, f, { now });

      // Register lens (metric drill-downs) and matrix cell — counts equal the psel ids behind them.
      const openIds = new Set(metrics.ids.open);
      const criticalIds = new Set(metrics.ids.critical);
      const overdueTaskIds = new Set(metrics.ids.overdueTasks);
      const overdueRiskIds = new Set((platform.tasks || []).filter((tk) => overdueTaskIds.has(tk.id) && tk.riskId).map((tk) => tk.riskId));
      const lensSet = { open: openIds, critical: criticalIds, overdue: overdueRiskIds };
      const cellIds = ui.l && ui.i && heat.ids && heat.ids[ui.i - 1] ? new Set(heat.ids[ui.i - 1][ui.l - 1] || []) : null;
      const rows = all.filter((row) => (ui.lens === 'all' || (lensSet[ui.lens] && lensSet[ui.lens].has(row.id))) && (!cellIds || cellIds.has(row.id)));

      // Owners in scope (without the owner filter) for the filter options.
      const ownerScope = psel.filteredAiRisks(scoped, { siteId: f.siteId, range: 3650 }, now);
      const owners = [...new Set(ownerScope.map((r) => r.owner).filter(Boolean))];

      // Freshness: the last change to the risks or tasks the cockpit reads (never in the future).
      const nowMs = now.getTime();
      let lastAt = NaN;
      const consider = (v) => { const x = ms(v); if (Number.isFinite(x) && x <= nowMs && !(x <= lastAt)) lastAt = x; };
      platform.aiRisks.forEach((r) => { consider(r.updatedAt); consider(r.detectedAt); });
      (platform.tasks || []).forEach((tk) => { consider(tk.updatedAt); consider(tk.createdAt); consider(tk.closedAt); });

      return {
        state, scoped, now, filters: f, metrics, categories, consolidated, severity, heat, trend, scoreSeries,
        residual, priority, all, rows, owners, lastAt: Number.isFinite(lastAt) ? lastAt : null,
        lensCounts: { all: all.length, open: all.filter((r) => openIds.has(r.id)).length, critical: all.filter((r) => criticalIds.has(r.id)).length, overdue: all.filter((r) => overdueRiskIds.has(r.id)).length },
      };
    }

    /**
     * Weekly "as of" points per executive metric (sparklines): psel.metrics' own previous-period definition
     * evaluated 1…11 weeks back, so the series and the deltas share one definition. Decorative (aria-hidden),
     * so it is computed after the numbers have painted (idle callback) to keep filter changes responsive.
     */
    function weeklySeries(dd) {
      const series = { openRisks: [], criticalRisks: [], overdueMitigations: [], mitigationCompletion: [] };
      for (let k = WEEKS - 1; k >= 0; k -= 1) {
        const snap = k === 0 ? dd.metrics : psel.metrics(dd.scoped, { ...dd.filters, range: 7 * k }, dd.now).previous;
        series.openRisks.push(num(snap.openRisks));
        series.criticalRisks.push(num(snap.criticalRisks));
        series.overdueMitigations.push(num(snap.overdueMitigations));
        series.mitigationCompletion.push(num(snap.mitigationCompletion && snap.mitigationCompletion.pct));
      }
      return series;
    }
    let seriesHandle = 0;
    const idle = typeof requestIdleCallback === 'function' ? (fn) => requestIdleCallback(fn, { timeout: 400 }) : (fn) => setTimeout(fn, 60);
    const cancelIdle = typeof cancelIdleCallback === 'function' ? (id) => cancelIdleCallback(id) : (id) => clearTimeout(id);
    function scheduleSeries(dd) {
      if (seriesHandle) cancelIdle(seriesHandle);
      seriesHandle = idle(() => {
        seriesHandle = 0;
        if (!alive || d !== dd) return;
        try { metricsBlock.updateSeries(weeklySeries(dd)); } catch (err) { warnOnce(warned, 'weekly series', err); }
      });
    }

    /* ---------------------------------------------------------------- */
    /* Shared modules (B-REGISTER) — guarded on-demand imports              */
    /* ---------------------------------------------------------------- */

    let drawerMod = null;
    let formMod = null;
    async function loadShared(path) {
      try { return await import(path); } catch { return null; }
    }
    function pickFn(mod, name) {
      if (!mod) return null;
      if (typeof mod[name] === 'function') return mod[name];
      if (mod.default && typeof mod.default[name] === 'function') return mod.default[name];
      if (typeof mod.default === 'function') return mod.default;
      return null;
    }

    function readScroll() {
      const main = container && container.closest ? (container.closest('main') || container) : null;
      return { main: main ? main.scrollTop : 0, win: typeof window !== 'undefined' ? window.scrollY || 0 : 0, el: main };
    }

    /** Focus the control that opened a risk (or its re-rendered twin) without scrolling. */
    function restoreOrigin(idOrCode, origin) {
      if (!alive) return;
      const rec = riskById(idOrCode);
      const id = rec ? rec.id : idOrCode;
      const active = document.activeElement;
      if (active && active !== document.body && document.contains(active) && root.contains(active)) return;
      let target = origin && origin.isConnected ? origin : null;
      if (!target && id) {
        const esc = typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(id) : String(id).replace(/["\\]/g, '\\$&');
        const kind = origin && origin.getAttribute ? origin.getAttribute('data-ck-origin') : null;
        target = (kind === 'priority' ? root.querySelector(`[data-ck-open="${esc}"]`) : null)
          || root.querySelector(`.ck-register tr[data-key="${esc}"] .row-open`)
          || root.querySelector(`[data-ck-open="${esc}"]`);
      }
      if (target) { try { target.focus({ preventScroll: true }); } catch { target.focus(); } }
    }

    async function openRisk(id, origin = null) {
      if (!id || !alive) return;
      const scroll = readScroll();
      if (!drawerMod) drawerMod = await loadShared('./shared/risk-drawer.js');
      if (!alive) return;
      const open = pickFn(drawerMod, 'openRiskDrawer');
      if (typeof open !== 'function') {
        drawerMod = null;
        toast(t('toast.drawerFallback'), { tone: 'neutral' });
        navigate('airisks', { risk: id });
        return;
      }
      try {
        open(ctx, id, {
          returnFocus: origin && origin.isConnected ? origin : undefined,
          onClose: () => {
            if (!alive) return;
            requestAnimationFrame(() => {
              restoreOrigin(id, origin);
              const now = readScroll();
              if (now.el && Math.abs(now.el.scrollTop - scroll.main) > 2) now.el.scrollTop = scroll.main;
              if (Math.abs(now.win - scroll.win) > 2) { try { window.scrollTo({ top: scroll.win, behavior: 'instant' }); } catch { window.scrollTo(0, scroll.win); } }
            });
          },
        });
      } catch (err) {
        warnOnce(warned, 'openRiskDrawer', err);
        navigate('airisks', { risk: id });
      }
    }

    async function openForm(trigger) {
      if (!formMod) formMod = await loadShared('./shared/risk-form.js');
      if (!alive) return;
      const open = pickFn(formMod, 'openRiskForm');
      if (typeof open !== 'function') {
        formMod = null;
        toast(t('toast.formFallback'), { tone: 'neutral' });
        navigate('airisks', { new: '1' });
        return;
      }
      try {
        open(ctx, { returnFocus: trigger, onSaved: () => schedule({ live: true }) });
      } catch (err) {
        warnOnce(warned, 'openRiskForm', err);
        navigate('airisks', { new: '1' });
      }
    }

    /* ---------------------------------------------------------------- */
    /* Root                                                               */
    /* ---------------------------------------------------------------- */

    const root = h('section', { class: 'view view-cockpit', 'data-view': VIEW_ID });
    container.appendChild(root);

    /* ================================================================ */
    /* 0 — explainer hero (first card; independent of the risk data)      */
    /* ================================================================ */

    let hero = null;
    try {
      hero = createExplainerHero({
        manifest: EXPLAINER,
        uiLang: i18n.lang() === 'en' ? 'en' : 'ar',
        t: (key, params) => t(`hero.${key}`, params),
        digits: (s) => fmt.digits(s),
        num: (n) => fmt.num(n),
        settings: () => (stateOf() && stateOf().settings) || {},
        motion,
      });
      hero.el.id = `ck-hero-${Math.random().toString(36).slice(2, 7)}`;
      root.appendChild(hero.el);
    } catch (err) { hero = null; warnOnce(warned, 'explainer hero', err); }
    const destroyHero = () => { if (hero) { try { hero.destroy(); } catch { /* noop */ } } };

    const first = derive();
    if (!first) {
      root.appendChild(h('div', { class: 'ck-head' }, h('div', { class: 'ck-head-main' }, h('span', { class: 'code-tag' }, 'CPT-00'), h('h1', { class: 't-page' }, t('title')))));
      root.appendChild(errorState({ title: t('states.noDataTitle'), text: t('states.noDataText'), retry: () => { if (router && typeof router.refresh === 'function') router.refresh(); } }));
      return () => { alive = false; destroyHero(); };
    }
    let d = first;

    /* ================================================================ */
    /* A — heading                                                        */
    /* ================================================================ */

    const head = (() => {
      const projectChip = h('li', { class: 'ck-chip' }, svgIcon('building', 13), h('span', {}, `${t('head.project')}: `), h('b', {}));
      const periodChip = h('li', { class: 'ck-chip' }, svgIcon('calendar', 13), h('span', {}, `${t('head.period')}: `), h('b', {}));
      const filterText = h('span', {});
      const clearBtn = button(t('head.clearFilters'), { variant: 'ghost', size: 'sm', onClick: () => resetAll(), attrs: { 'aria-label': t('head.clearFiltersAria') } });
      const filterChip = h('li', { class: ['ck-chip', 'is-filter'], hidden: true }, svgIcon('filter', 13), filterText, clearBtn);
      const freshText = h('span', {});
      const fresh = h('li', { class: 'ck-fresh' }, svgIcon('clock', 13), freshText);
      const statusHost = h('li', { class: ['ck-fresh', 'ck-status'] });
      const meta = h('ul', { class: 'ck-meta', 'aria-label': t('head.scopeAria') }, projectChip, periodChip, filterChip, fresh, statusHost);
      const h1 = h('h1', { class: 't-page' }, t('title'));
      const formBtn = button(t('head.registerRisk'), { variant: 'primary', icon: 'plus', onClick: (e) => openForm(e.currentTarget), attrs: { title: t('head.registerRiskAria'), 'aria-haspopup': 'dialog' } });
      const videoBtn = button(t('head.explainer'), { variant: 'outline', icon: 'play', onClick: () => { if (hero) hero.playFromStart({ focus: true }); }, attrs: { title: t('head.explainerAria'), 'aria-controls': hero ? hero.el.id : undefined } });
      if (!hero) videoBtn.hidden = true;
      const el = h('header', { class: 'ck-head' },
        h('div', { class: 'ck-head-main' }, h('span', { class: 'code-tag', 'aria-hidden': 'true' }, 'CPT-00'), h1, meta),
        h('div', { class: 'ck-actions' }, formBtn, videoBtn));
      let lastStatus = null;

      function activeFilterCount() {
        return ['domain', 'rating', 'status', 'owner'].filter((k) => ui[k] !== 'all').length + (ui.q.trim() ? 1 : 0);
      }
      function update(dd) {
        const g = globalFilters();
        const site = g.siteId && g.siteId !== 'all' ? siteById(g.siteId) : null;
        setText(projectChip.querySelector('b'), site ? `${site.code} — ${projectName(site.id)}` : i18n.t('core.filters.allProjects'));
        setText(periodChip.querySelector('b'), t('head.periodValue', { days: i18n.tn('core.filters.days', Number(g.range) || 30) }));
        const n = activeFilterCount();
        filterChip.hidden = n === 0;
        setText(filterText, tn('head.filtersActive', n));
        setText(freshText, dd.lastAt ? t('head.updated', { time: fmt.relative(dd.lastAt, dd.now) }) : '');
        setAttr(fresh, 'title', dd.lastAt ? t('head.updatedTitle', { time: fmt.dateTime(dd.lastAt) }) : null);
        fresh.hidden = !dd.lastAt;
        const src = status.source(dd.state, dd.now);
        const key = src && src.status ? src.status : status.mode(dd.state);
        if (key !== lastStatus) {
          lastStatus = key;
          clear(statusHost);
          statusHost.appendChild(statusBadge(key, { size: 'sm', label: key === 'demo' ? t('head.demoData') : null }));
        }
      }
      function tick() { if (d) { setText(freshText, d.lastAt ? t('head.updated', { time: fmt.relative(d.lastAt, nowDate()) }) : ''); } }
      return { el, h1, update, tick };
    })();
    root.appendChild(head.el);

    /* ---- cockpit filter bar (scopes every section) ---- */

    const filters = (() => {
      const host = h('div', { class: 'ck-filter-host' });
      const toggle = button(t('filters.toggle'), {
        variant: 'outline', size: 'sm', icon: 'filter',
        onClick: () => setCollapsed(!wrap.classList.contains('is-collapsed')),
        attrs: { class: 'ck-filters-toggle', 'aria-expanded': 'false', title: t('filters.toggleAria') },
      });
      const toggleCount = h('span', { class: 'ck-toggle-count' });
      toggle.append(toggleCount);
      const note = h('p', { class: ['t-helper', 'ck-filters-note'] }, t('filters.note'));
      const regionId = `ck-filters-${Math.random().toString(36).slice(2, 8)}`;
      host.id = regionId;
      toggle.setAttribute('aria-controls', regionId);
      const wrap = h('div', { class: ['ck-filters', 'is-collapsed'] }, toggle, host, note);
      let bar = null;
      let ownerSig = '';

      function ownerOptions(list) {
        const collator = (() => { try { return new Intl.Collator(i18n.locale()); } catch { return null; } })();
        const opts = list.map((o) => ({ value: o, label: ownerName(o) }));
        opts.sort((a, b) => (collator ? collator.compare(a.label, b.label) : String(a.label).localeCompare(String(b.label))));
        if (ui.owner !== 'all' && !list.includes(ui.owner)) opts.unshift({ value: ui.owner, label: ownerName(ui.owner) });
        return opts;
      }
      function build(owners) {
        ownerSig = owners.slice().sort().join('\u0001');
        const next = filterBar({
          label: t('filters.label'),
          value: { domain: ui.domain, rating: ui.rating, status: ui.status, owner: ui.owner, q: ui.q },
          filters: [
            { id: 'domain', type: 'select', label: t('filters.domain'), options: CATEGORY_ORDER.map((c) => ({ value: c, label: categoryLabel(c) })) },
            { id: 'rating', type: 'select', label: t('filters.rating'), options: RATINGS.map((r) => ({ value: r, label: ratingLabel(r) })) },
            { id: 'status', type: 'select', label: t('filters.status'), options: RISK_STATUSES.map((s) => ({ value: s, label: statusLabel(s) })) },
            { id: 'owner', type: 'select', label: t('filters.owner'), options: ownerOptions(owners) },
            { id: 'q', type: 'search', label: t('filters.search'), placeholder: t('filters.searchPlaceholder') },
          ],
          onChange: (values) => {
            ui = sanitizeUi({ ...uiToParams(ui), domain: values.domain, rating: values.rating, status: values.status, owner: values.owner, q: values.q, l: ui.l, i: ui.i, lens: ui.lens, hm: ui.hm });
            writeUrl();
            refresh({ filterChange: true });
          },
        });
        if (bar) bar.el.replaceWith(next.el); else host.appendChild(next.el);
        bar = next;
      }
      function setCollapsed(collapsed) {
        wrap.classList.toggle('is-collapsed', collapsed);
        toggle.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
      }
      function update(dd) {
        const sig = dd.owners.slice().sort().join('\u0001');
        if (!bar || (sig !== ownerSig && !host.contains(document.activeElement))) build(dd.owners);
        if (bar) {
          // Only push values that differ (never overwrite a search the reader is still typing).
          const cur = bar.get();
          const want = { domain: ui.domain, rating: ui.rating, status: ui.status, owner: ui.owner, q: ui.q };
          if (Object.keys(want).some((k) => String(cur[k] ?? '') !== String(want[k] ?? ''))) bar.set(want);
        }
        const n = bar ? bar.activeCount() : 0;
        setText(toggleCount, n ? `· ${fmt.num(n)}` : '');
        if (n) setCollapsed(false);
      }
      return { el: wrap, update, reset: () => { if (bar) bar.set({ ...DEFAULT_UI }); } };
    })();
    root.appendChild(filters.el);

    /* ---- go-live readiness strip (static plan data, js/data/golive.js; links to #/golive; never animates) ---- */
    try {
      const r = glReadiness(GL_CAPABILITIES);
      const gt = (k, p) => i18n.t(`golive.strip.${k}`, p);
      const x = fmt.num(r.demoReady);
      const y = fmt.num(r.total);
      root.appendChild(h('a', { class: 'gl-strip', href: router && typeof router.href === 'function' ? router.href('golive') : '#/golive', 'aria-label': gt('aria', { x, y }) },
        h('span', { class: 'gl-strip-icon', 'aria-hidden': 'true' }, svgIcon('send', 16)),
        h('span', { class: 'gl-strip-text', 'aria-hidden': 'true' }, h('span', { class: 'gl-strip-label' }, `${gt('label')}:`), h('span', { class: 'gl-strip-value' }, gt('value', { x, y }))),
        h('span', { class: ['gl-bar', 'is-compact'], 'aria-hidden': 'true' }, ...GL_STATUSES.filter((s) => r.counts[s] > 0).map((s) => h('span', {
          class: ['gl-bar-seg', `is-${s}`], style: { flexGrow: String(r.counts[s]) }, title: gt('seg', { label: i18n.t(`golive.status.${s}`), n: fmt.num(r.counts[s]) }),
        }))),
        h('span', { class: 'gl-strip-cta', 'aria-hidden': 'true' }, gt('cta'))));
    } catch (err) { warnOnce(warned, 'go-live strip', err); }

    /* ================================================================ */
    /* B — executive metrics                                              */
    /* ================================================================ */

    const metricsBlock = (() => {
      const days = () => i18n.tn('core.filters.days', Number(globalFilters().range) || 30);
      const gaugeBarsTitle = (pct) => t('metrics.gauge.bars', {
        weeks: fmt.num(WEEKS), twelve: fmt.num(12),
        scale: pct ? t('metrics.gauge.scale100', { zero: fmt.num(0), hundred: fmt.pct(100) }) : t('metrics.gauge.scaleMax'),
      });
      const specs = [
        { key: 'openRisks', label: () => t('metrics.open'), icon: 'shield-alert', tone: 'brand', lens: 'open', action: () => t('metrics.actionOpen') },
        { key: 'criticalRisks', label: () => t('metrics.critical'), icon: 'alert-octagon', tone: 'critical', lens: 'critical', action: () => t('metrics.actionCritical') },
        { key: 'overdueMitigations', label: () => t('metrics.overdue'), icon: 'clock', tone: 'warning', lens: 'overdue', action: () => t('metrics.actionOverdue') },
        { key: 'mitigationCompletion', label: () => t('metrics.completion'), icon: 'check-circle', tone: 'good', pct: true, action: () => t('metrics.actionCompletion') },
      ];
      const heading = h('h2', { class: 'sr-only', id: `ck-metrics-${Math.random().toString(36).slice(2, 7)}` }, t('metrics.heading'));
      const grid = h('div', { class: 'metric-grid' });
      const el = h('section', { class: ['ck-section', 'ck-metrics'], 'aria-labelledby': heading.id }, heading, grid);
      const tiles = specs.map((spec) => {
        const valueEl = h('span', { class: 't-metric' });
        const unitEl = spec.key === 'criticalRisks' ? h('span', { class: 'ck-metric-unit' }, t('metrics.criticalUnit')) : null;
        // Ring = the tile's headline ratio (named in the tooltip and the caption under the number); radial bars =
        // the 12 weekly "as of" values of the same metric (they arrive on idle, see weeklySeries).
        const gauge = gaugeLib.ringGauge({
          size: 'md', tone: spec.tone, center: true, format: (p) => fmt.pct(p),
          title: `${t(`metrics.gauge.ring.${spec.key}`)} ${gaugeBarsTitle(spec.pct)}`,
        });
        const ratioEl = h('span', { class: 'ck-ratio' });
        const gaugeSr = h('span', { class: 'sr-only' });
        const arrowHost = h('span', { class: 'ck-delta-arrow', 'aria-hidden': 'true' });
        const deltaText = h('bdi', { dir: 'ltr' });
        const deltaSr = h('span', { class: 'sr-only' });
        const delta = h('span', { class: 'delta' }, arrowHost, deltaText, deltaSr);
        const helper = h('span', { class: 'metric-helper' });
        const actionSr = h('span', { class: 'sr-only' });
        const tile = h('button', {
          type: 'button', class: ['metric-tile', `tone-${spec.tone}`, 'is-clickable', 'has-gauge'], 'data-metric': spec.key,
          onClick: () => { if (spec.lens) showInRegister({ lens: spec.lens }); else navigate('tasks'); },
        },
        h('div', { class: 'metric-head' }, h('span', { class: 'metric-label' }, spec.label()), h('span', { class: 'metric-icon', 'aria-hidden': 'true' }, svgIcon(spec.icon, 16))),
        h('div', { class: 'metric-value' }, valueEl, unitEl),
        h('span', { class: 'ck-gauge' }, gauge.el),
        ratioEl,
        h('div', { class: 'metric-foot' }, delta, helper),
        gaugeSr, actionSr);
        chartsToDestroy.push(gauge);
        grid.appendChild(tile);
        return { spec, tile, valueEl, gauge, ratioEl, gaugeSr, delta, arrowHost, deltaText, deltaSr, helper, actionSr, value: null, dir: null, ratio: null, series: null };
      });

      /** The ring's ratio per tile, from the same psel numbers the tile shows (null = honest empty state). */
      function ratioOf(spec, dd) {
        const m = dd.metrics;
        const mc = m.mitigationCompletion || { closed: 0, total: 0, pct: 0 };
        switch (spec.key) {
          case 'openRisks': return gaugeRatio(m.openRisks, dd.all.length);                         // open of (open + closed/dismissed in the period)
          case 'criticalRisks': return gaugeRatio(m.criticalRisks, m.openRisks);                   // red of open
          case 'overdueMitigations': return gaugeRatio(m.overdueMitigations, num(mc.total) - num(mc.closed)); // overdue of open actions
          default: return gaugeRatio(mc.closed, mc.total);                                           // closed of all actions
        }
      }
      function srText(tile) {
        const r = tile.ratio;
        const ring = r && r.value !== null ? t('metrics.gauge.sr', { pct: fmt.pct(r.pct) }) : t('metrics.gauge.srEmpty');
        const trend = Array.isArray(tile.series) ? ` ${gaugeLib.trendSentence(tile.series, { format: (v) => (tile.spec.pct ? fmt.pct(v) : fmt.num(v)) })}` : '';
        setText(tile.gaugeSr, ` — ${ring}${trend}`);
      }

      const formatValue = (spec, v) => (spec.pct ? fmt.pct(v) : fmt.num(v));
      function update(dd, { live = false } = {}) {
        const m = dd.metrics;
        tiles.forEach((tile) => {
          const { spec } = tile;
          const value = spec.pct ? num(m.mitigationCompletion && m.mitigationCompletion.pct) : num(m[spec.key]);
          if (live && tile.value !== null && tile.value !== value) motion.number(tile.valueEl, tile.value, value, { format: (v) => formatValue(spec, v) });
          else setText(tile.valueEl, formatValue(spec, value));
          tile.value = value;
          const dv = num(m.deltas && m.deltas[spec.key]);
          const goodWhen = (m.goodWhen && m.goodWhen[spec.key]) || (spec.pct ? 'up' : 'down');
          const dir = dv > 0 ? 'up' : dv < 0 ? 'down' : 'flat';
          const good = dir === 'flat' ? null : (goodWhen === 'up' ? dv > 0 : dv < 0);
          tile.delta.className = ['delta', dir === 'flat' ? 'is-flat' : (good ? 'is-good' : 'is-bad')].join(' ');
          tile.delta.setAttribute('data-direction', dir);
          if (tile.dir !== dir) {
            clear(tile.arrowHost);
            tile.arrowHost.appendChild(svgIcon(dir === 'up' ? 'arrow-up' : dir === 'down' ? 'arrow-down' : 'minus', 12));
            tile.dir = dir;
          }
          setText(tile.deltaText, dir === 'flat' ? fmt.num(0) : signedLtr(fmt, dv));
          setText(tile.deltaSr, dir === 'flat' ? '' : ` (${good ? t('metrics.better') : t('metrics.worse')})`);
          setText(tile.helper, spec.pct ? t('metrics.vsPreviousPts', { days: days() }) : t('metrics.vsPrevious', { days: days() }));
          const ratio = ratioOf(spec, dd);
          tile.ratio = ratio;
          if (spec.pct) {
            setText(tile.ratioEl, ratio.value !== null ? t('metrics.completionUnit', { closed: fmt.num(ratio.part), total: fmt.num(ratio.whole) }) : t('metrics.completionNone'));
          } else {
            setText(tile.ratioEl, ratio.value !== null ? t(`metrics.gauge.ratio.${spec.key}`, { whole: fmt.num(ratio.whole) }) : t(`metrics.gauge.empty.${spec.key}`));
          }
          tile.ratioEl.classList.toggle('is-empty', ratio.value === null);
          tile.gauge.update({ value: ratio.value });
          srText(tile);
          setText(tile.actionSr, ` — ${spec.action()}`);
        });
      }
      function updateSeries(series) {
        tiles.forEach((tile) => {
          const values = Array.isArray(series[tile.spec.key]) ? series[tile.spec.key] : [];
          tile.series = values;
          tile.gauge.update({ bars: values, barMax: tile.spec.pct ? 100 : null });
          srText(tile);
        });
      }
      return { el, update, updateSeries, tiles };
    })();
    root.appendChild(metricsBlock.el);

    /* ================================================================ */
    /* C — five domains                                                   */
    /* ================================================================ */

    const domainsBlock = (() => {
      const titleId = `ck-domains-${Math.random().toString(36).slice(2, 7)}`;
      const consScore = h('span', { class: 't-metric' });
      const consBadgeHost = h('span', {});
      const consDelta = h('span', { class: 'delta' });
      const cons = h('div', { class: 'ck-cons', role: 'group' },
        h('span', { class: 'ck-cons-label' }, t('domains.consolidated')),
        h('span', { class: 'ck-cons-score' }, consScore, h('span', { class: 'ck-cons-scale' }, `/${fmt.num(100)}`)),
        consBadgeHost, consDelta,
        h('a', { class: ['btn', 'btn-ghost', 'btn-sm'], href: hrefOf('settings', { section: 'weights' }), 'aria-label': t('domains.weightsAria') }, svgIcon('sliders', 14), h('span', { class: 'btn-label' }, t('domains.weights'))));
      const grid = h('div', { class: 'domain-grid' });
      const el = h('section', { class: ['ck-section', 'ck-domains'], 'aria-labelledby': titleId },
        h('div', { class: 'ck-section-head' },
          h('div', { class: 'ck-section-titles' }, h('h2', { class: 't-section', id: titleId }, t('domains.heading')), h('p', { class: 't-helper' }, t('domains.sub'))),
          cons),
        grid);
      let consValue = null;
      let consRating = null;
      const cards = CATEGORY_ORDER.map((cat) => {
        const scoreEl = h('span', { class: 't-metric' });
        const badgeHost = h('span', { class: 'ck-rating-host' });
        const openEl = h('strong', {});
        const redEl = h('strong', {});
        // Dial: ring = score / 100 in the rating colour (the rating badge carries icon + word), radial bars = the
        // card's 12-week score trend on the same 0–100 scale. The visible score sits in the ring's centre.
        const gauge = gaugeLib.ringGauge({
          size: 'xl', tone: 'neutral', barMax: 100,
          title: t('domains.gauge.title', { max: fmt.num(100), zero: fmt.num(0), weeks: fmt.num(WEEKS), twelve: fmt.num(12) }),
        });
        const gaugeSr = h('span', { class: 'sr-only' });
        const selTag = h('span', { class: 'ck-sel-tag', hidden: true }, t('domains.selected'));
        const a = h('a', {
          class: ['domain-card', 'has-gauge'], href: hrefOf(CATEGORY_VIEW[cat]), 'data-category': cat,
        },
        h('div', { class: 'domain-head' }, h('span', { class: 'domain-icon', 'aria-hidden': 'true' }, svgIcon(CATEGORY_ICON[cat], 16)), h('span', { class: 'domain-name' }, domainName(cat))),
        h('div', { class: 'ck-domain-body' },
          h('div', { class: 'ck-dial' }, gauge.el, h('div', { class: ['domain-score', 'ck-dial-score'] }, scoreEl, h('span', { class: 'domain-scale' }, `/${fmt.num(100)}`))),
          h('div', { class: 'ck-domain-side' },
            badgeHost,
            h('div', { class: 'domain-meta' }, h('span', {}, `${t('domains.open')} `, openEl), h('span', {}, `${t('domains.red')} `, redEl), selTag))),
        h('div', { class: 'domain-foot' }, h('span', {}, t('domains.trend', { weeks: fmt.num(WEEKS) })), h('span', { class: 'row gap-1', style: { display: 'inline-flex', alignItems: 'center', gap: '4px' } }, t('domains.openPage'), glyph('chevronEnd', 14))),
        gaugeSr);
        chartsToDestroy.push(gauge);
        grid.appendChild(a);
        return { cat, a, scoreEl, badgeHost, openEl, redEl, gauge, gaugeSr, selTag, score: null, rating: null };
      });

      function update(dd, { live = false } = {}) {
        const byCat = new Map(dd.categories.map((c) => [c.category, c]));
        cards.forEach((c) => {
          const data = byCat.get(c.cat) || { score: 0, rating: 'green', open: 0, red: 0, trend: [] };
          const score = Math.round(num(data.score));
          if (live && c.score !== null && c.score !== score) motion.number(c.scoreEl, c.score, score, { format: (v) => fmt.num(v) });
          else setText(c.scoreEl, fmt.num(score));
          c.score = score;
          if (c.rating !== data.rating) {
            clear(c.badgeHost);
            c.badgeHost.appendChild(ratingBadge(data.rating, { sm: true }));
            c.a.setAttribute('data-rating', data.rating);
            c.rating = data.rating;
          }
          setText(c.openEl, fmt.num(num(data.open)));
          setText(c.redEl, fmt.num(num(data.red)));
          const trend = Array.isArray(data.trend) ? data.trend : [];
          c.gauge.update({ value: gaugeRatio(score, 100).value, tone: RATING_TONE[data.rating] || 'neutral', bars: trend, barMax: 100 });
          setText(c.gaugeSr, ` — ${gaugeLib.trendSentence(trend, { format: (v) => fmt.num(v) })}`);
          const selected = ui.domain === c.cat;
          c.a.classList.toggle('is-selected', selected);
          c.selTag.hidden = !selected;
          setAttr(c.a, 'title', t('domains.cardAria', { domain: domainName(c.cat), score: fmt.num(score), max: fmt.num(100), rating: ratingLabel(data.rating), open: fmt.num(num(data.open)), red: fmt.num(num(data.red)) }));
        });
        const cs = dd.consolidated;
        const score = Math.round(num(cs.score));
        if (live && consValue !== null && consValue !== score) motion.number(consScore, consValue, score, { format: (v) => fmt.num(v) });
        else setText(consScore, fmt.num(score));
        consValue = score;
        if (consRating !== cs.rating) { clear(consBadgeHost); consBadgeHost.appendChild(ratingBadge(cs.rating)); consRating = cs.rating; }
        const dv = num(cs.delta);
        const dir = dv > 0 ? 'up' : dv < 0 ? 'down' : 'flat';
        clear(consDelta);
        consDelta.className = ['delta', dir === 'flat' ? 'is-flat' : (dv > 0 ? 'is-bad' : 'is-good')].join(' ');
        consDelta.append(svgIcon(dir === 'up' ? 'arrow-up' : dir === 'down' ? 'arrow-down' : 'minus', 12), h('bdi', { dir: 'ltr' }, dir === 'flat' ? fmt.num(0) : signedLtr(fmt, dv)),
          h('span', { class: 'sr-only' }, dir === 'flat' ? t('metrics.deltaFlat') : ` — ${t(dir === 'up' ? 'metrics.deltaUp' : 'metrics.deltaDown', { value: fmt.num(Math.abs(dv)) })} (${dv > 0 ? t('metrics.worse') : t('metrics.better')})`));
        setAttr(cons, 'aria-label', t('domains.consolidatedAria', { score: fmt.num(score), max: fmt.num(100), rating: ratingLabel(cs.rating), delta: dir === 'flat' ? t('metrics.deltaFlat') : t(dir === 'up' ? 'metrics.deltaUp' : 'metrics.deltaDown', { value: fmt.num(Math.abs(dv)) }) }));
      }
      return { el, update, cards };
    })();
    root.appendChild(domainsBlock.el);

    /* ================================================================ */
    /* D — analysis                                                       */
    /* ================================================================ */

    const analysisTitleId = `ck-analysis-${Math.random().toString(36).slice(2, 7)}`;
    const analysisGrid = h('div', { class: 'ck-analysis' });
    const analysisEl = h('section', { class: ['ck-section', 'ck-analysis-section'], 'aria-labelledby': analysisTitleId },
      h('div', { class: 'ck-section-head' }, h('div', { class: 'ck-section-titles' }, h('h2', { class: 't-section', id: analysisTitleId }, t('analysis.heading')))),
      analysisGrid);
    root.appendChild(analysisEl);

    /* ---- D1 severity distribution ---- */
    const severityBlock = (() => {
      const thr = RATING_THRESHOLDS;
      // DOM segmented bar (one whole split into the three bands): text colours chosen per fill for 4.5:1.
      const bar = h('div', { class: 'ck-segbar', role: 'img' });
      const segs = RATINGS.map((r) => { const seg = h('span', { class: ['ck-seg', `is-${r}`] }); bar.appendChild(seg); return seg; });
      const rows = RATINGS.map((r) => {
        const count = h('span', {});
        const share = h('span', { class: 'ck-band-share' });
        const hint = r === 'red' ? t('analysis.severity.red', { min: fmt.num(thr.red) })
          : r === 'yellow' ? t('analysis.severity.yellow', { min: fmt.num(thr.yellow), max: fmt.num(thr.red - 1) })
            : t('analysis.severity.green', { max: fmt.num(thr.yellow) });
        const li = h('li', { class: 'ck-band', 'data-rating': r },
          h('div', { class: 'ck-band-main' }, ratingBadge(r), h('span', { class: 'ck-band-hint' }, hint)),
          h('div', { class: 'ck-band-count' }, count, share));
        return { r, li, count, share };
      });
      const list = h('ul', { class: 'ck-bands' }, rows.map((x) => x.li));
      const chartWrap = h('div', { 'data-ck-host': 'chart' }, bar);
      const empty = emptyState({ icon: 'shield-check', title: t('analysis.severity.empty'), text: t('analysis.severity.emptyText') });
      empty.hidden = true;
      const body = h('div', { class: 'ck-sev-body' }, chartWrap, list, empty);
      const el = card({
        title: t('analysis.severity.title'), subtitle: t('analysis.severity.sub', { k: fmt.num(4) }), className: 'ck-sev', body,
        tableView: () => {
          const table = h('table', { class: 'chart-table' });
          table.appendChild(h('caption', { class: 'sr-only' }, t('analysis.severity.aria')));
          table.appendChild(h('thead', {}, h('tr', {}, h('th', { scope: 'col' }, t('filters.rating')), h('th', { scope: 'col', class: 'num' }, t('metrics.open')), h('th', { scope: 'col', class: 'num' }, '%'))));
          table.appendChild(h('tbody', {}, (current || []).map((x) => h('tr', {}, h('th', { scope: 'row' }, ratingLabel(x.rating)), h('td', { class: 'num' }, fmt.num(num(x.value))), h('td', { class: 'num' }, fmt.pct(num(x.pct)))))));
          return table;
        },
      });
      let current = null;
      function update(dd) {
        current = dd.severity;
        const total = dd.severity.reduce((s, x) => s + num(x.value), 0);
        segs.forEach((seg, k) => {
          const x = dd.severity.find((sv) => sv.rating === RATINGS[k]) || { value: 0 };
          const share = total ? (num(x.value) / total) * 100 : 0;
          seg.style.flexGrow = String(num(x.value));
          seg.hidden = num(x.value) === 0;
          setText(seg, share >= 7 ? fmt.num(num(x.value)) : '');
          setAttr(seg, 'title', `${ratingLabel(RATINGS[k])}: ${fmt.num(num(x.value))} (${fmt.pct(Math.round(share))})`);
        });
        setAttr(bar, 'aria-label', `${t('analysis.severity.aria')}: ${dd.severity.map((x) => `${ratingLabel(x.rating)} ${fmt.num(num(x.value))}`).join(t('analysis.severity.sep'))}`);
        chartWrap.hidden = total === 0;
        empty.hidden = total !== 0;
        rows.forEach((row) => {
          const x = dd.severity.find((s) => s.rating === row.r) || { value: 0, pct: 0 };
          setText(row.count, fmt.num(num(x.value)));
          setText(row.share, t('analysis.severity.share', { pct: fmt.pct(num(x.pct)) }));
        });
      }
      return { el, update };
    })();
    analysisGrid.appendChild(severityBlock.el);

    /* ---- D2 likelihood × impact matrix ---- */
    const heatBlock = (() => {
      const lName = (n) => t(`analysis.heatmap.l${n}`);
      const iName = (n) => t(`analysis.heatmap.i${n}`);
      const zoneLabel = (z) => ratingLabel(z);
      const cells = new Map();
      const matrix = h('div', { class: 'ck-matrix', role: 'group' });
      matrix.appendChild(h('span', { class: 'ck-mx-ytitle', 'aria-hidden': 'true' }, `${t('analysis.heatmap.impact')} ↑`));
      const impacts = LEVELS.slice().reverse(); // 5 at the top
      impacts.forEach((imp, ri) => {
        const rl = h('span', { class: 'ck-mx-rlabel', 'aria-hidden': 'true', style: { gridRow: String(ri + 1) } }, h('span', { class: 'ck-mx-name' }, iName(imp)), h('span', { class: 'ck-mx-lvl' }, fmt.num(imp)));
        matrix.appendChild(rl);
        LEVELS.forEach((lik, ci) => {
          const zone = zoneOf(lik, imp);
          const btn = h('button', {
            type: 'button', class: ['ck-cell', `zone-${zone}`], tabindex: '-1', 'aria-pressed': 'false', 'data-l': String(lik), 'data-i': String(imp),
            style: { gridRow: String(ri + 1), gridColumn: String(ci + 3) },
            onClick: () => onCell(lik, imp),
          });
          cells.set(`${lik}:${imp}`, { btn, zone, l: lik, i: imp, count: -1 });
          matrix.appendChild(btn);
        });
      });
      LEVELS.forEach((lik, ci) => matrix.appendChild(h('span', { class: 'ck-mx-clabel', 'aria-hidden': 'true', style: { gridRow: '6', gridColumn: String(ci + 3) } }, h('span', { class: 'ck-mx-lvl' }, fmt.num(lik)), h('span', { class: 'ck-mx-name' }, lName(lik)))));
      matrix.appendChild(h('span', { class: 'ck-mx-xtitle', 'aria-hidden': 'true', style: { gridRow: '7' } }, `${t('analysis.heatmap.likelihood')} ›`));

      // roving tabindex: one tab stop, arrows move in the reading direction (columns follow `dir`)
      let focusKey = '3:3';
      matrix.addEventListener('keydown', (e) => {
        const keys = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End'];
        if (!keys.includes(e.key)) return;
        const cur = cells.get(focusKey);
        if (!cur) return;
        let { l, i } = cur;
        const rtl = i18n.dir() === 'rtl';
        if (e.key === 'ArrowUp') i = Math.min(5, i + 1);
        else if (e.key === 'ArrowDown') i = Math.max(1, i - 1);
        else if (e.key === 'ArrowRight') l = rtl ? Math.max(1, l - 1) : Math.min(5, l + 1);
        else if (e.key === 'ArrowLeft') l = rtl ? Math.min(5, l + 1) : Math.max(1, l - 1);
        else if (e.key === 'Home') l = 1;
        else l = 5;
        e.preventDefault();
        setFocusCell(`${l}:${i}`, true);
      });
      matrix.addEventListener('focusin', (e) => {
        const btn = e.target.closest('.ck-cell');
        if (btn) setFocusCell(`${btn.getAttribute('data-l')}:${btn.getAttribute('data-i')}`, false);
      });
      function setFocusCell(key, focus) {
        focusKey = key;
        for (const [k, c] of cells) c.btn.tabIndex = k === key ? 0 : -1;
        if (focus) { const c = cells.get(key); if (c) c.btn.focus(); }
      }
      setFocusCell(focusKey, false);

      const legend = h('ul', { class: 'ck-legend', 'aria-label': t('analysis.heatmap.legendAria') },
        [['red', t('analysis.heatmap.zoneRed', { min: fmt.num(RATING_THRESHOLDS.red) })],
          ['yellow', t('analysis.heatmap.zoneYellow', { min: fmt.num(RATING_THRESHOLDS.yellow), max: fmt.num(RATING_THRESHOLDS.red - 1) })],
          ['green', t('analysis.heatmap.zoneGreen', { max: fmt.num(RATING_THRESHOLDS.yellow) })]]
          .map(([z, text]) => h('li', { class: ['ck-legend-item', `zone-${z}`] }, h('span', { class: 'ck-legend-key', 'aria-hidden': 'true' }), glyph(RATING_TONE[z], 13), h('span', {}, text))));
      const totalEl = h('p', { class: 'ck-heat-total' });
      const noteEl = h('p', { class: 'ck-heat-note' });
      const selEl = h('div', { class: 'ck-heat-sel', hidden: true });
      const side = h('div', { class: 'ck-heat-side' }, totalEl, legend, noteEl, selEl);
      const matrixHost = h('div', { 'data-ck-host': 'matrix' }, matrix);
      const emptyResidual = emptyState({ icon: 'layers', title: t('analysis.heatmap.emptyResidual'), text: t('analysis.heatmap.emptyResidualText'),
        action: { label: t('analysis.heatmap.inherent'), onClick: () => setMode('inherent') } });
      emptyResidual.hidden = true;
      const body = h('div', { class: 'ck-heat-body' }, h('div', {}, matrixHost, emptyResidual), side);
      const mode = segmented({
        options: [{ value: 'inherent', label: t('analysis.heatmap.inherent') }, { value: 'residual', label: t('analysis.heatmap.residual') }],
        value: ui.hm, ariaLabel: t('analysis.heatmap.modeAria'), onChange: (v) => setMode(v),
      });
      mode.el.classList.add('seg-sm');
      let current = null;
      const el = card({
        title: t('analysis.heatmap.title'), subtitle: t('analysis.heatmap.sub'), className: 'ck-heat', actions: [mode.el], body,
        tableView: () => {
          const heat = current || [];
          const table = h('table', { class: 'chart-table' });
          table.appendChild(h('caption', { class: 'sr-only' }, t('analysis.heatmap.title')));
          table.appendChild(h('thead', {}, h('tr', {}, h('th', { scope: 'col' }, t('analysis.heatmap.tableCorner')), LEVELS.map((l) => h('th', { scope: 'col', class: 'num' }, `${fmt.num(l)} · ${lName(l)}`)))));
          table.appendChild(h('tbody', {}, impacts.map((imp) => h('tr', {}, h('th', { scope: 'row' }, `${fmt.num(imp)} · ${iName(imp)}`), LEVELS.map((l) => h('td', { class: 'num' }, fmt.num(num(heat[imp - 1] && heat[imp - 1][l - 1]))))))));
          return table;
        },
      });

      function setMode(v) {
        const next = v === 'residual' ? 'residual' : 'inherent';
        if (next === ui.hm) { mode.set(next); return; }
        ui = { ...ui, hm: next, l: null, i: null };
        mode.set(next);
        writeUrl();
        refresh({ filterChange: true });
      }
      function onCell(l, i) {
        const c = cells.get(`${l}:${i}`);
        if (!c || c.count <= 0) return;
        const same = ui.l === l && ui.i === i;
        if (same) { ui = { ...ui, l: null, i: null }; writeUrl(); refresh({ filterChange: true }); return; }
        showInRegister({ l, i });
      }
      function update(dd) {
        const heat = dd.heat;
        current = heat;
        const residual = ui.hm === 'residual';
        mode.set(ui.hm);
        const modeLabel = residual ? t('analysis.heatmap.residual') : t('analysis.heatmap.inherent');
        setAttr(matrix, 'aria-label', t('analysis.heatmap.gridAria', { mode: modeLabel }));
        for (const c of cells.values()) {
          const count = num(heat[c.i - 1] && heat[c.i - 1][c.l - 1]);
          c.count = count;
          setText(c.btn, count > 0 ? fmt.num(count) : '');
          c.btn.classList.toggle('has-risks', count > 0);
          const selected = ui.l === c.l && ui.i === c.i;
          c.btn.setAttribute('aria-pressed', selected ? 'true' : 'false');
          setAttr(c.btn, 'aria-disabled', count > 0 ? null : 'true');
          const aria = t('analysis.heatmap.cellAria', { count: tn('analysis.heatmap.risks', count), l: fmt.num(c.l), lName: lName(c.l), i: fmt.num(c.i), iName: iName(c.i), zone: zoneLabel(c.zone) });
          setAttr(c.btn, 'aria-label', `${aria}. ${count > 0 ? t('analysis.heatmap.cellOpen') : t('analysis.heatmap.cellEmpty')}`);
          setAttr(c.btn, 'title', count > 0 ? aria : null);
        }
        const total = num(heat.total);
        setText(totalEl, `${tn('analysis.heatmap.total', total)} · ${modeLabel}`);
        const showEmptyResidual = residual && total === 0;
        matrixHost.hidden = showEmptyResidual;
        emptyResidual.hidden = !showEmptyResidual;
        setText(noteEl, residual ? tn('analysis.heatmap.notAssessed', num(heat.notAssessed)) : t('analysis.heatmap.sub'));
        noteEl.hidden = !residual;
        clear(selEl);
        selEl.hidden = !(ui.l && ui.i);
        if (ui.l && ui.i) {
          const cellText = t(residual ? 'register.cellResidual' : 'register.cell', { l: fmt.num(ui.l), i: fmt.num(ui.i) });
          selEl.append(h('p', { class: 'ck-heat-note' }, t('analysis.heatmap.selected', { cell: cellText })),
            button(t('register.clearCell'), { variant: 'ghost', size: 'sm', icon: 'close', onClick: () => { ui = { ...ui, l: null, i: null }; writeUrl(); refresh({ filterChange: true }); }, attrs: { 'aria-label': t('register.clearCellAria', { cell: cellText }) } }));
        }
      }
      return { el, update };
    })();
    analysisGrid.appendChild(heatBlock.el);

    /* ---- D3 trend small multiples ---- */
    const trendBlock = (() => {
      const dateLabel = (iso) => fmt.date(iso, { style: 'short' });
      const openChart = charts.radarTrend({ series: [], labels: [], height: 220, ariaLabel: t('analysis.trend.openAria', { weeks: fmt.num(WEEKS) }), xLabel: t('analysis.trend.week') });
      const scoreChart = charts.radarTrend({ series: [], labels: [], height: 220, ariaLabel: t('analysis.trend.scoreAria', { weeks: fmt.num(WEEKS) }), xLabel: t('analysis.trend.week') });
      chartsToDestroy.push(openChart, scoreChart);
      const mk = (titleText) => {
        const value = h('span', { class: 'ck-multiple-value' });
        const change = h('span', { class: 'ck-multiple-change' });
        const titleEl = h('span', { class: 'ck-multiple-title' }, titleText);
        return { value, change, titleEl, head: h('div', { class: 'ck-multiple-head' }, h('div', { style: { display: 'flex', flexDirection: 'column', gap: '2px' } }, titleEl, change), value) };
      };
      const a = mk(t('analysis.trend.open'));
      const b = mk(t('analysis.trend.score', { min: fmt.num(0), max: fmt.num(100) }));
      const body = h('div', { class: 'ck-multiples' },
        h('div', { class: 'ck-multiple' }, a.head, openChart.el),
        h('div', { class: 'ck-multiple' }, b.head, scoreChart.el));
      let model = null;
      let lastSig = '';
      const el = card({
        title: t('analysis.trend.title', { weeks: fmt.num(WEEKS) }), subtitle: t('analysis.trend.sub'), className: 'ck-trend', body,
        tableView: () => {
          const m = model || { labels: [], open: [], score: [] };
          const table = h('table', { class: 'chart-table' });
          table.appendChild(h('caption', { class: 'sr-only' }, t('analysis.trend.title', { weeks: fmt.num(WEEKS) })));
          table.appendChild(h('thead', {}, h('tr', {}, h('th', { scope: 'col' }, t('analysis.trend.week')), h('th', { scope: 'col', class: 'num' }, t('analysis.trend.open')), h('th', { scope: 'col', class: 'num' }, m.scoreLabel || ''))));
          table.appendChild(h('tbody', {}, m.labels.map((lab, k) => h('tr', {}, h('th', { scope: 'row' }, dateLabel(lab)), h('td', { class: 'num' }, fmt.num(num(m.open[k]))), h('td', { class: 'num' }, fmt.num(num(m.score[k])))))));
          return table;
        },
      });
      function update(dd) {
        const labels = (dd.trend.labels || []).map(dateLabel);
        const open = (dd.trend.openRisks || []).map((v) => num(v));
        const score = (dd.scoreSeries || []).map((v) => num(v));
        const scoreLabel = ui.domain !== 'all' ? `${categoryLabel(ui.domain)} (${fmt.num(0)}–${fmt.num(100)})` : t('analysis.trend.score', { min: fmt.num(0), max: fmt.num(100) });
        setText(b.titleEl, scoreLabel);
        const sig = JSON.stringify([labels, open, score, scoreLabel]);
        if (sig === lastSig) return;
        lastSig = sig;
        openChart.update({ labels, series: [{ id: 'open', label: t('analysis.trend.open'), values: open, color: 'var(--s1)' }] });
        scoreChart.update({ labels, series: [{ id: 'score', label: scoreLabel, values: score, color: 'var(--s2)' }] });
        const last = (arr) => (arr.length ? arr[arr.length - 1] : 0);
        setText(a.value, fmt.num(last(open)));
        setText(b.value, fmt.num(last(score)));
        setText(a.change, t('analysis.trend.change', { value: fmt.signed(last(open) - (open[0] || 0)), weeks: fmt.num(WEEKS) }));
        setText(b.change, t('analysis.trend.change', { value: fmt.signed(last(score) - (score[0] || 0)), weeks: fmt.num(WEEKS) }));
        model = { labels: dd.trend.labels || [], open, score, scoreLabel };
      }
      return { el, update };
    })();
    analysisGrid.appendChild(trendBlock.el);

    /* ---- D4 inherent vs residual ---- */
    const residualBlock = (() => {
      const chart = charts.dumbbell({
        items: [], max: 100, valueFormat: (v) => fmt.num(v), ariaLabel: t('analysis.residual.aria'),
        fromLabel: t('analysis.residual.inherent'), toLabel: t('analysis.residual.residual'), rowHeight: 34,
        onItemClick: ({ item, event }) => { if (item && item.id) openRisk(item.id, event && event.target && event.target.closest ? event.target.closest('[data-i]') : null); },
      });
      chartsToDestroy.push(chart);
      const note = h('p', { class: 'ck-resid-note' });
      const chartHost = h('div', { 'data-ck-host': 'chart' }, chart.el, note);
      const empty = emptyState({ icon: 'layers', title: t('analysis.residual.empty'), text: t('analysis.residual.emptyText') });
      empty.hidden = true;
      let lastSig = '';
      const el = card({
        title: t('analysis.residual.title'), subtitle: t('analysis.residual.sub'), className: 'ck-resid', body: h('div', {}, chartHost, empty),
        tableView: () => chart.table(),
      });
      function update(dd) {
        const list = dd.residual || [];
        const shown = list.slice(0, RESIDUAL_LIMIT);
        // Phones: the label column cannot hold a title, so rows show the code and the title moves to the tooltip.
        const narrow = (el.clientWidth || 0) > 0 && el.clientWidth < 480;
        const sig = JSON.stringify([narrow, shown.map((x) => [x.id, x.from, x.to, x.code])]);
        chartHost.hidden = !list.length;
        empty.hidden = !!list.length;
        setText(note, t('analysis.residual.shown', { shown: fmt.num(shown.length), total: fmt.num(list.length) }));
        if (sig === lastSig) return;
        lastSig = sig;
        chart.update({
          showValues: !narrow,
          items: shown.map((x) => {
            const risk = riskById(x.id);
            const title = digitsIn(fmt, risk ? titleOf(risk) : x.label);
            return { id: x.id, label: narrow ? x.code : `${x.code} · ${title}`, meta: narrow ? title : '', from: num(x.from), to: x.to === null ? null : num(x.to) };
          }),
        });
      }
      return { el, update };
    })();
    analysisGrid.appendChild(residualBlock.el);

    /* ================================================================ */
    /* E — priority actions                                               */
    /* ================================================================ */

    const priorityBlock = (() => {
      const list = h('ol', { class: 'priority-list' });
      const empty = emptyState({ icon: 'check-circle', title: t('priority.empty'), text: t('priority.emptyText'),
        action: { label: t('head.clearFilters'), onClick: () => resetAll() } });
      empty.hidden = true;
      const el = card({
        title: t('priority.title'), subtitle: t('priority.sub'), className: 'ck-priority',
        actions: [h('a', { class: ['btn', 'btn-ghost', 'btn-sm'], href: hrefOf('airisks') }, svgIcon('shield-alert', 14), h('span', { class: 'btn-label' }, t('priority.viewAll')))],
        body: h('div', {}, list, empty),
      });
      const sigs = new Map();
      function item(row, dd) {
        const risk = row.risk;
        const title = titleOf(risk);
        const tone = RATING_TONE[row.rating] || 'neutral';
        const overdue = !!row.overdue;
        const owner = ownerName(row.owner);
        const openBtn = button(t('priority.open'), {
          variant: 'outline', size: 'sm', icon: glyph('chevronEnd', 14),
          onClick: (e) => openRisk(row.id, e.currentTarget),
          attrs: { 'aria-label': t('priority.openAria', { code: row.code, title }), 'data-ck-open': row.id, 'data-ck-origin': 'priority' },
        });
        const due = row.dueDate
          ? h('span', { class: ['priority-due', 'ck-due', overdue ? 'is-overdue' : null] }, glyph(overdue ? 'critical' : 'clock', 13),
            h('span', {}, overdue ? t('priority.overdue', { date: fmt.date(row.dueDate, { style: 'short' }) }) : t('priority.due', { date: fmt.date(row.dueDate, { style: 'short' }) })))
          : h('span', { class: 'priority-due ck-muted' }, t('priority.noDue'));
        return h('li', { class: ['priority-item', `tone-${tone}`, overdue ? 'is-overdue' : null], 'data-id': row.id },
          h('span', { class: 'priority-rank', 'aria-hidden': 'true' }),
          h('div', { class: 'priority-main' },
            h('span', { class: 'priority-title' }, ...withCodes(fmt, title)),
            h('div', { class: 'priority-meta' },
              h('span', {}, codeSpan(row.code)),
              row.projectId ? h('span', {}, svgIcon('building', 12), projectName(row.projectId)) : null,
              h('span', {}, svgIcon('user', 12), owner || t('priority.unassigned')),
              h('span', { class: 'ck-next' }, svgIcon('arrow-end', 12), t('priority.next', { action: nextLabel(row.nextAction) })))),
          h('div', { class: 'priority-side' }, h('span', { class: 'ck-score-cell' }, h('span', { class: 'ck-score-num' }, fmt.num(row.score)), ratingBadge(row.rating, { sm: true })), due),
          h('div', { class: 'priority-action' }, openBtn));
      }
      function signature(row) {
        return [row.id, row.score, row.rating, row.owner, row.dueDate, row.overdue, row.status, row.nextAction && row.nextAction.key].join('|');
      }
      function update(dd, { live = false } = {}) {
        const rows = dd.priority || [];
        const active = document.activeElement;
        const focusId = active && list.contains(active) ? (active.closest('[data-id]') || {}).getAttribute?.('data-id') : null;
        const nextSigs = new Map(rows.map((r) => [r.id, signature(r)]));
        const same = rows.length === sigs.size && rows.every((r, k) => sigs.get(r.id) === nextSigs.get(r.id) && list.children[k] && list.children[k].getAttribute('data-id') === r.id);
        if (!same) {
          const frag = document.createDocumentFragment();
          const changed = [];
          rows.forEach((row) => { const li = item(row, dd); if (live && sigs.get(row.id) !== nextSigs.get(row.id)) changed.push(li); frag.appendChild(li); });
          clear(list);
          list.appendChild(frag);
          sigs.clear();
          nextSigs.forEach((v, k) => sigs.set(k, v));
          changed.forEach((li) => motion.flash(li));
          if (focusId) {
            const esc = typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(focusId) : focusId;
            const btn = list.querySelector(`[data-id="${esc}"] .btn`);
            if (btn) { try { btn.focus({ preventScroll: true }); } catch { btn.focus(); } }
          }
        }
        list.hidden = rows.length === 0;
        empty.hidden = rows.length !== 0;
      }
      return { el, update };
    })();
    root.appendChild(priorityBlock.el);

    /* ================================================================ */
    /* F — detailed register                                              */
    /* ================================================================ */

    const registerBlock = (() => {
      const titleId = `ck-register-${Math.random().toString(36).slice(2, 7)}`;
      const lens = segmented({
        options: LENSES.map((v) => ({ value: v, label: t(`register.lens.${v}`) })),
        value: ui.lens, ariaLabel: t('register.lensAria'),
        onChange: (v) => { ui = { ...ui, lens: LENSES.includes(v) ? v : 'all' }; writeUrl(); refresh({ filterChange: true }); },
      });
      lens.el.classList.add('seg-sm');
      const chipHost = h('span', { class: 'ck-cellchip-host' });
      const countEl = h('span', { class: 'ck-reg-count', 'aria-live': 'polite' });
      const tools = h('div', { class: 'ck-reg-tools' }, lens.el, chipHost, countEl);
      /** Owner · due · status as one phrase (shown under the title on phones, where those columns are hidden). */
      const narrowLine = (row) => [row.owner ? ownerName(row.owner) : t('register.unassigned'),
        row.dueDate ? `${fmt.date(row.dueDate, { style: 'short' })}${row.overdue ? ` (${t('register.overdue')})` : ''}` : '',
        statusLabel(row.status)].filter(Boolean).join(' · ');
      const table = dataTable({
        caption: t('register.caption'), rows: [], rowKey: 'id', pageSize: PAGE_SIZE, dense: false, stickyFirst: true,
        emptyText: t('register.empty'),
        // Accessible name = every visible word of the cell in reading order (title, code, project, and the
        // owner / due / status line that phones show under the title).
        rowLabel: (row) => [titleOf(row.risk), row.code, row.projectId ? projectName(row.projectId) : '', narrowLine(row)]
          .map((x) => digitsIn(fmt, x)).filter(Boolean).join(' '),
        onRowClick: (row, e) => {
          const origin = e && e.currentTarget && e.currentTarget.classList && e.currentTarget.classList.contains('row-open')
            ? e.currentTarget : (e && e.currentTarget && e.currentTarget.querySelector ? e.currentTarget.querySelector('.row-open') : null);
          openRisk(row.id, origin);
        },
        columns: [
          { key: 'title', label: t('register.col.risk'), priority: 'high', width: '34%', sortValue: (row) => titleOf(row.risk),
            // Explicit spaces between the parts keep the visible text and the button's accessible name identical.
            render: (row) => h('span', { class: 'ck-risk-cell' },
              h('span', { class: 'ck-risk-title' }, ...withCodes(fmt, titleOf(row.risk))), ' ',
              h('span', { class: 'ck-risk-sub' }, codeSpan(row.code), row.projectId ? [' ', h('span', {}, projectName(row.projectId))] : null), ' ',
              // phones: the owner / due / status columns are hidden, so their values ride along under the title
              h('span', { class: ['ck-risk-narrow', row.overdue ? 'is-overdue' : null] }, row.overdue ? glyph('critical', 12) : null, narrowLine(row))) },
          { key: 'category', label: t('register.col.domain'), priority: 'low', sortValue: (row) => categoryLabel(row.category), render: (row) => catChip(row.category) },
          { key: 'score', label: t('register.col.severity'), priority: 'high', sortValue: (row) => num(row.score),
            render: (row) => h('span', { class: 'ck-score-cell' },
              h('span', { class: 'ck-score-num' }, fmt.num(row.score)), ratingBadge(row.rating, { sm: true }),
              isNum(num(row.likelihood, NaN)) && isNum(num(row.impact, NaN))
                ? h('span', { class: 'ck-li', title: t('register.liTitle', { l: fmt.num(row.likelihood), i: fmt.num(row.impact) }) }, t('register.li', { l: fmt.num(row.likelihood), i: fmt.num(row.impact) }),
                  h('span', { class: 'sr-only' }, ` (${t('register.liTitle', { l: fmt.num(row.likelihood), i: fmt.num(row.impact) })})`))
                : null) },
          { key: 'residual', label: t('register.col.residual'), priority: 'low', sortValue: (row) => (row.residualScore === null ? -1 : row.residualScore),
            render: (row) => (row.residualScore === null || row.residualScore === undefined
              ? h('span', { class: 'ck-muted' }, t('register.notAssessed'))
              : h('span', { class: 'ck-score-cell' }, h('span', { class: 'ck-score-num' }, fmt.num(row.residualScore)), ratingBadge(row.residualRating, { sm: true }))) },
          { key: 'owner', label: t('register.col.owner'), priority: 'medium', sortValue: (row) => ownerName(row.owner),
            render: (row) => (row.owner ? h('span', {}, ownerName(row.owner)) : h('span', { class: 'ck-muted' }, t('register.unassigned'))) },
          { key: 'dueDate', label: t('register.col.due'), priority: 'medium', sortValue: (row) => (row.dueDate ? ms(row.dueDate) : Infinity), render: (row) => dueCell(row) },
          { key: 'status', label: t('register.col.status'), priority: 'medium', sortValue: (row) => statusLabel(row.status), render: (row) => badge(statusLabel(row.status), row.statusTone || 'neutral') },
        ],
      });
      table.el.classList.add('ck-register-table');
      const el = card({
        title: t('register.title'), subtitle: t('register.sub'), className: 'ck-register', id: titleId,
        actions: [h('a', { class: ['btn', 'btn-ghost', 'btn-sm'], href: hrefOf('airisks') }, svgIcon('external', 14), h('span', { class: 'btn-label' }, t('register.openAll')))],
        body: h('div', {}, tools, table.el),
      });
      const titleEl = el.querySelector('.card-title');
      if (titleEl) titleEl.setAttribute('tabindex', '-1');
      let chipKey = '';

      function update(dd, { live = false, filterChange = false } = {}) {
        lens.set(ui.lens);
        const key = ui.l && ui.i ? `${ui.hm}:${ui.l}:${ui.i}` : '';
        if (key !== chipKey) {
          chipKey = key;
          clear(chipHost);
          if (key) {
            const cellText = t(ui.hm === 'residual' ? 'register.cellResidual' : 'register.cell', { l: fmt.num(ui.l), i: fmt.num(ui.i) });
            chipHost.appendChild(h('span', { class: 'ck-cellchip' }, svgIcon('grid', 13), h('span', {}, cellText),
              button('', { variant: 'ghost', size: 'sm', icon: 'close', onClick: () => { ui = { ...ui, l: null, i: null }; writeUrl(); refresh({ filterChange: true }); }, attrs: { 'aria-label': t('register.clearCellAria', { cell: cellText }), class: 'btn-icon' } })));
          }
        }
        const total = dd.all.length;
        setText(countEl, t('register.count', { shown: fmt.num(dd.rows.length), total: fmt.num(total) }));
        setAttr(countEl, 'aria-label', t('register.countAria', { shown: fmt.num(dd.rows.length), total: fmt.num(total) }));
        if (filterChange) table.update(dd.rows, { resetPage: true });
        else table.update(dd.rows, { preserve: true, flash: live });
      }
      return { el, update, titleEl, table };
    })();
    root.appendChild(registerBlock.el);

    /* ---------------------------------------------------------------- */
    /* Interactions                                                       */
    /* ---------------------------------------------------------------- */

    /** Narrow the register (lens or matrix cell), then bring it into view and announce it. */
    function showInRegister({ lens = null, l = null, i = null } = {}) {
      if (lens) ui = { ...ui, lens: LENSES.includes(lens) ? lens : 'all' };
      if (l && i) ui = { ...ui, l, i };
      writeUrl();
      refresh({ filterChange: true });
      const target = registerBlock.el;
      try { target.scrollIntoView({ behavior: motion.enabled() ? 'smooth' : 'auto', block: 'start' }); } catch { target.scrollIntoView(); }
      if (registerBlock.titleEl) { try { registerBlock.titleEl.focus({ preventScroll: true }); } catch { registerBlock.titleEl.focus(); } }
    }

    function resetAll() {
      ui = { ...DEFAULT_UI };
      filters.reset();
      writeUrl();
      refresh({ filterChange: true });
    }

    /* ---------------------------------------------------------------- */
    /* Refresh & live updates                                             */
    /* ---------------------------------------------------------------- */

    const blocks = [
      ['head', head], ['filters', filters], ['metrics', metricsBlock], ['domains', domainsBlock], ['severity', severityBlock],
      ['heatmap', heatBlock], ['trend', trendBlock], ['residual', residualBlock], ['priority', priorityBlock], ['register', registerBlock],
    ];

    function refresh(opts = {}) {
      if (!alive) return;
      let next = null;
      try { next = derive(); } catch (err) { warnOnce(warned, 'derive', err); }
      if (!next) return;
      d = next;
      for (const [name, block] of blocks) {
        try { block.update(next, opts); } catch (err) { warnOnce(warned, `update ${name}`, err); }
      }
      scheduleSeries(next);
    }

    function schedule({ live = false, filterChange = false } = {}) {
      if (!alive) return;
      pendingLive = { live: pendingLive.live || live, filterChange: pendingLive.filterChange || filterChange };
      if (liveTimer) return;
      liveTimer = setTimeout(() => {
        liveTimer = 0;
        const opts = pendingLive;
        pendingLive = { live: false, filterChange: false };
        refresh(opts);
      }, LIVE_DEBOUNCE_MS);
    }

    const RELEVANT = /^(\*|platform$|platform\.(aiRisks|tasks|alerts)|sites|settings)/;
    subs.push(bus.on('store:change', (payload) => {
      const path = payload && typeof payload.path === 'string' ? payload.path : '*';
      if (!RELEVANT.test(path)) return;
      schedule({ live: true });
    }));
    subs.push(bus.on('filters:change', () => schedule({ filterChange: true })));
    subs.push(bus.on('settings:change', () => schedule({ live: true })));
    subs.push(bus.on('status:change', () => schedule({})));

    const freshTimer = setInterval(() => { if (alive && !document.hidden) head.tick(); }, FRESHNESS_TICK_MS);
    timers.add(freshTimer);

    /* ---- first paint ---- */
    refresh({ initial: true });
    try {
      motion.enter(metricsBlock.tiles.map((x) => x.tile), { y: 8, stagger: 0.032 });
      motion.enter(domainsBlock.cards.map((x) => x.a), { y: 8, stagger: 0.032, delay: 0.06 });
      motion.enter([severityBlock.el, heatBlock.el, trendBlock.el, residualBlock.el, priorityBlock.el, registerBlock.el], { y: 6, stagger: 0.04, delay: 0.1 });
    } catch { /* motion never blocks the view */ }

    if (deepRisk) requestAnimationFrame(() => { if (alive) openRisk(deepRisk, null); });

    return () => {
      alive = false;
      destroyHero();
      if (liveTimer) clearTimeout(liveTimer);
      if (seriesHandle) cancelIdle(seriesHandle);
      timers.forEach((id) => clearInterval(id));
      timers.clear();
      subs.splice(0).forEach((off) => { try { off(); } catch { /* noop */ } });
      chartsToDestroy.splice(0).forEach((c) => { try { if (c && typeof c.destroy === 'function') c.destroy(); } catch { /* noop */ } });
      try { registerBlock.table.destroy(); } catch { /* noop */ }
    };
  },
};
