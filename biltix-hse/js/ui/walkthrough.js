/**
 * BILTIX Risk AI — guided walkthrough of the worked example (js/ui/walkthrough.js).
 * «المثال التطبيقي: تأخر اعتماد مادة» / "Worked example: a delayed material approval".
 *
 * It walks the same screens as the film, over the seeded record AIR-1069 (platform-seed.js › AR69):
 *   1 register  #/airisks?domain=bom — the AIR-1069 row
 *   2 overview  drawer › Overview — severity / confidence / data quality, drivers, unknowns
 *   3 evidence  drawer › Evidence — the evidence chain (E1–E15, seven source systems)
 *   4 options   drawer › Treatment — R1–R3 with trade-offs
 *   5 decision  drawer › Treatment — the scenario's human decision (Projected)
 *   6 tasks     drawer › Treatment — MT-0229…MT-0234 (Projected; write-back simulated)
 *   7 closure   drawer › Treatment — closure criteria C1–C9 with empty evidence slots, monitors
 *   8 site      #/spatial?site=S1&zone=S1-Z2 — the lift zone and the 360° capture point
 *
 * API (also for the cockpit): startWalkthrough(ctx, { riskId, step, returnFocus }) · stopWalkthrough() ·
 * isWalkthroughActive() · installDrawerHook(ctx) (adds the launch button to the AIR-1069 drawer, wherever it
 * opens) · walkthroughAvailable(state, riskId).
 *
 * Accessibility: a non-modal dialog (role="dialog", aria-modal="false") with a labelled heading that takes focus
 * on each step; Back / Next / Close buttons; Esc closes and returns focus to the opener. The page is never made
 * inert by the tour; when a drawer makes the page inert, the tour panel keeps itself usable (inert guard).
 * Keyboard: while the risk drawer is open, Tab runs through the drawer and the panel as one cycle (the drawer's own
 * cycle would never reach the panel), and Esc closes the tour first — from the panel, from the drawer and from the
 * page — and leaves the drawer open. Any other dialog on top (the 360° viewer the last step opens, a shell drawer)
 * hides the panel and the ring until it closes, so the panel never covers it.
 * Leaving: the tour closes when the reader leaves what it explains — a navigation away from the step's screen
 * (a link, the tab bar, browser Back; bus 'ui:route-leave') or the explained drawer closed with its X / backdrop.
 * The tour's own moves (Next / Back, a language or numerals re-mount) happen while `busy` is set and never close it.
 * Language / numerals: on bus 'lang:change' and on a numerals change the panel is repainted at once (language,
 * direction, digits) and the step's screen is put back (the router re-mounts the view, and the risk drawer closes
 * with it).
 * Room: below 960 px the panel sits above the tab bar while no drawer covers it; from 641 px up the drawer the
 * tour explains leaves a 300 px column for the panel (they never overlap; below 900 px the drawer's launch button
 * takes its own row, as on phones); on a short screen (a phone on its side) the page leaves the same column on the
 * page steps — where it is too narrow for a column as well (up to 640 px wide, up to 480 px high) the panel keeps
 * the bottom edge, over the tab bar. On phones the page's target stays between the fixed app bar and the panel:
 * the panel gives up height for a tall target, down to about two lines of text (dock). After a change of the
 * screen size (a phone turned, a window resized) that room is measured again.
 * Motion: one opacity/transform entrance of the panel and an opacity fade of the highlight ring — compositor
 * only, nothing replays on live updates (content renders on step change only), off under reduced motion,
 * the Static setting, forced colours and print (hidden in print).
 * Honesty: every number comes from the seed; steps after the demo clock carry the "Projected" tag.
 */

import { components } from './components.js';
import { i18n } from '../core/i18n.js';
import { bus } from '../core/bus.js';
import { fmt } from '../core/fmt.js';
import { store as defaultStore } from '../core/store.js';
import dict from '../i18n/walkthrough.js';

i18n.register('walkthrough', dict);

const { h } = components;
export const WORKED_RISK = 'AR69';
const STEPS = ['register', 'overview', 'evidence', 'options', 'decision', 'tasks', 'closure', 'site'];
const DRAWER_TAB = { overview: 'overview', evidence: 'evidence', options: 'treatment', decision: 'treatment', tasks: 'treatment', closure: 'treatment' };
const TARGETS = {
  register: ['tr[data-key="{id}"]', '.view-airisks .table-wrap', '.view-airisks'],
  overview: ['[data-wt="overview"]', '#risk-ov-explain', '.drawer-panel[data-tab="overview"]'],
  evidence: ['[data-wt="evidence"]', '#risk-ev-source', '.drawer-panel[data-tab="evidence"]'],
  options: ['[data-wt="options"]', '#risk-tr-rec', '.drawer-panel[data-tab="treatment"]'],
  decision: ['[data-wt="decision"]', '[data-focus-key="open-override"]', '#risk-tr-rec'],
  tasks: ['[data-wt="tasks"]', '#risk-tr-tasks', '.drawer-panel[data-tab="treatment"]'],
  closure: ['[data-wt="closure"]', '#risk-tr-close', '#risk-tr-res', '.drawer-panel[data-tab="treatment"]'],
  site: ['.sp-plan', '.view-spatial'],
};
const STYLE_ID = 'wt-styles';

const t = (k, p) => i18n.t(`walkthrough.${k}`, p);
const isEn = () => i18n.lang() !== 'ar';
const pick = (ar, en) => (isEn() && en ? en : ar);
const arr = (v) => (Array.isArray(v) ? v : []);
const routeId = () => { try { return ((location.hash || '').replace(/^#\/?/, '').split('?')[0]) || ''; } catch { return ''; } };
/** The route a step lives on. */
const screenOf = (index) => (STEPS[index] === 'site' ? 'spatial' : 'airisks');
const hashQuery = () => { try { const q = (location.hash || '').indexOf('?'); return new URLSearchParams(q === -1 ? '' : location.hash.slice(q + 1)); } catch { return new URLSearchParams(); } };
const reduced = () => { try { return Boolean(components.reducedMotion()) || document.documentElement.getAttribute('data-bg') === 'static' || matchMedia('(forced-colors: active)').matches; } catch { return true; } };
const cssEscape = (v) => (typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(String(v)) : String(v).replace(/["\\]/g, '\\$&'));

let active = null;   // { ctx, riskId, step, root, ring, ... }
let hookInstalled = false;

/* ───────────────────────── data ───────────────────────── */

function stateOf(ctx) { const s = (ctx && ctx.store) || defaultStore; return (s && s.state) || {}; }
function nowOf(ctx) { const s = (ctx && ctx.store) || defaultStore; return s && typeof s.now === 'function' ? s.now() : new Date(); }
function riskOf(ctx, id) {
  const list = arr(stateOf(ctx).platform && stateOf(ctx).platform.aiRisks);
  return list.find((r) => r && (r.id === id || r.code === id)) || null;
}
/** True when the seed record carries the worked example (the tour needs its structured fields). */
export function walkthroughAvailable(state, riskId = WORKED_RISK) {
  const list = arr(state && state.platform && state.platform.aiRisks);
  const r = list.find((x) => x && (x.id === riskId || x.code === riskId));
  return Boolean(r && r.worked && arr(r.recommendationOptions).length);
}
const person = (name) => (name ? i18n.term(String(name)) : '—');
/**
 * Step 5's projected decision: `at` = the scenario's decision as an ISO instant in Riyadh time (the seed's zone; ''
 * when it has no clock time) and `ahead` = that instant is still after `now`. The clock time is printed only while
 * it is ahead: the record's instants move with the real clock (detection = now − 2 h 50) while the scenario keeps
 * its calendar day and "10:05", so later in the day that time is past — and earlier than the detection of step 1 —
 * next to the tag "Projected — not happened yet".
 */
export function projectedDecision(sc, now = new Date()) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String((sc && sc.decisionTime) || ''));
  const at = sc && sc.decisionDate && m ? `${sc.decisionDate}T${m[1].padStart(2, '0')}:${m[2]}:00+03:00` : '';
  return { at, ahead: Boolean(at) && Date.parse(at) > now.getTime() };
}
const sar = (n) => fmt.currency(n, { compact: true, digits: 1 });
function addDays(iso, n) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ''));
  if (!m) return null;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3] + n));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

/* ───────────────────────── styles (scoped, injected once) ───────────────────────── */

const STYLE_TEXT = `
.wt-panel { position: fixed; z-index: calc(var(--z-toast, 70) + 1); inset-block-end: 16px; inset-inline-start: 16px; inline-size: min(420px, calc(100vw - 32px));
  max-block-size: min(70vh, 640px); display: flex; flex-direction: column; border: 1px solid var(--line-strong); border-radius: var(--radius-lg, 14px);
  background: var(--bg-1); color: var(--ink-1); box-shadow: var(--elev-3, 0 12px 40px rgba(0,0,0,.18));
  /* no transitions on the box: dock() changes its height and measures it in the same breath (under reduced motion
     the app gives every transition .01 ms, which is still one frame of the old size) */
  transition: none; }
.wt-panel[data-side="end"] { inset-inline-start: auto; inset-inline-end: 16px; }
.wt-head { display: flex; align-items: flex-start; gap: 8px; padding: 12px 14px 8px; border-block-end: 1px solid var(--line); }
.wt-head-text { display: grid; gap: 2px; min-inline-size: 0; flex: 1; }
.wt-kicker { font-size: var(--fs-xs); color: var(--brand-text); font-weight: 600; }
.wt-title { margin: 0; font-size: var(--fs-md, 16px); line-height: 1.35; outline: none; }
.wt-title:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; border-radius: 4px; }
.wt-x { flex: none; }
.wt-progress { display: flex; gap: 4px; padding: 0 14px 8px; margin: 0; }
.wt-progress > span { flex: 1; block-size: 4px; border-radius: 2px; background: var(--line); }
.wt-progress > span.is-done { background: color-mix(in srgb, var(--brand) 55%, var(--bg-1)); }
.wt-progress > span.is-current { background: var(--brand); }
.wt-body { overflow: auto; padding: 10px 14px; display: grid; gap: 10px; font-size: var(--fs-sm); line-height: 1.55; }
.wt-body:focus-visible { outline: 2px solid var(--focus); outline-offset: -2px; }
.wt-body p { margin: 0; }
.wt-tags { display: flex; flex-wrap: wrap; gap: 6px; }
.wt-sub { margin: 0; font-size: var(--fs-xs); font-weight: 600; color: var(--ink-2); }
.wt-list { list-style: none; margin: 0; padding: 0; display: grid; gap: 6px; }
.wt-item { display: grid; gap: 2px; padding: 8px 10px; border: 1px solid var(--line); border-radius: var(--radius-sm, 8px); background: var(--bg-2); }
.wt-item-head { display: flex; flex-wrap: wrap; align-items: baseline; gap: 6px 8px; }
.wt-item-meta { font-size: var(--fs-xs); color: var(--ink-3); }
.wt-code { font-family: var(--font-mono); font-size: var(--fs-xs); color: var(--ink-2); unicode-bidi: isolate; white-space: nowrap; }
.wt-bar { display: grid; grid-template-columns: minmax(0, 1fr) 44px; gap: 8px; align-items: center; }
.wt-bar-track { display: block; grid-column: 1 / -1; block-size: 6px; border-radius: 3px; background: var(--line); overflow: hidden; }
.wt-bar-fill { display: block; block-size: 100%; inline-size: 100%; background: var(--brand); }
.wt-panel[dir="rtl"] .wt-bar-fill { transform-origin: 100% 50%; }
.wt-panel[dir="ltr"] .wt-bar-fill { transform-origin: 0 50%; }
.wt-num { font-variant-numeric: tabular-nums; unicode-bidi: isolate; text-align: end; }
.wt-note { font-size: var(--fs-xs); color: var(--ink-3); }
.wt-foot { display: flex; align-items: center; gap: 8px; padding: 10px 14px 12px; border-block-start: 1px solid var(--line); }
.wt-foot .wt-hint { margin-inline-end: auto; font-size: var(--fs-xs); color: var(--ink-3); }
.wt-ring { position: fixed; z-index: calc(var(--z-toast, 70) + 1); pointer-events: none; border-radius: 10px; inset-block-start: 0; inset-inline-start: 0;
  box-shadow: 0 0 0 3px var(--brand), 0 0 0 7px color-mix(in srgb, var(--brand) 22%, transparent); opacity: 0; }
.wt-ring.is-on { opacity: 1; }
.wt-anim .wt-ring { transition: opacity 180ms ease-out; }
.wt-panel[data-away], .wt-ring[data-away] { display: none; }
.wt-launch { gap: 6px; }
@media (max-width: 640px) {
  .wt-panel, .wt-panel[data-side="end"] { inset-inline: 8px; inset-block-end: 8px; inline-size: auto; max-block-size: 46vh; }
  .wt-foot .wt-hint { display: none; }
  /* the drawer's launch button takes its own row under the title on phones (the title keeps its width) */
  .drawer-head:has(> .wt-launch) { flex-wrap: wrap; }
  .drawer-head:has(> .wt-launch) > .drawer-titles { flex: 1 1 0; min-inline-size: 0; }
  .drawer-head > .wt-launch { order: 3; flex-basis: 100%; justify-content: center; }
}
/* A short phone screen: tighter panel edges, so more of the step text stays in view. */
@media (max-width: 640px) and (max-height: 700px) {
  .wt-head { padding: 8px 12px 6px; }
  .wt-progress { padding: 0 12px 6px; }
  .wt-body { padding: 6px 12px; }
  .wt-foot { padding: 6px 12px 8px; }
}
/* Below 960 px the tab bar is the page's navigation: while no drawer covers it (data-side="end") the panel sits above it. */
@media (max-width: 959.98px) {
  .wt-panel[data-side="end"] { inset-block-end: calc(var(--tabbar-h, 60px) + env(safe-area-inset-bottom, 0px) + 8px); }
}
/* Short and narrow (a small phone on its side): no room for the app bar, the target, the panel and the tab bar under
   each other, and none for a column beside the page — the panel keeps the bottom edge, over the tab bar. */
@media (max-width: 640px) and (max-height: 480px) {
  .wt-panel[data-side="end"] { inset-block-end: 8px; }
}
/* From 641 px up the drawer and the panel stand side by side: where the screen cannot hold both at full width
   (below 1204 px) the drawer the tour explains leaves a 300 px column and the panel takes it. */
@media (min-width: 641px) {
  html.wt-on dialog.drawer.risk-drawer { inline-size: min(760px, calc(100% - 300px)); }
  .wt-panel[data-side="start"] { inline-size: min(420px, max(276px, calc(100vw - 784px))); }
}
/* Below 900 px that column leaves the drawer less than 600 px: its launch button takes its own row under the title,
   as on phones (in one row with the button and the X the title was squeezed to a few words per line). */
@media (min-width: 641px) and (max-width: 899.98px) {
  html.wt-on .risk-drawer .drawer-head:has(> .wt-launch) { flex-wrap: wrap; }
  html.wt-on .risk-drawer .drawer-head:has(> .wt-launch) > .drawer-titles { flex: 1 1 0; min-inline-size: 0; }
  html.wt-on .risk-drawer .drawer-head > .wt-launch { order: 3; flex-basis: 100%; justify-content: center; }
}
/* A short screen (a phone on its side) has no room above a bottom panel: on the page steps the page leaves the same
   column, and the panel takes the height between the app bar and the tab bar. */
@media (max-height: 480px) and (min-width: 641px) {
  html.wt-on .main { padding-inline-end: 300px; }
  .wt-panel { max-block-size: calc(100vh - var(--appbar-h, 56px) - 24px); }
  .wt-panel[data-side="end"] { inline-size: 276px; max-block-size: calc(100vh - var(--appbar-h, 56px) - var(--tabbar-h, 60px) - env(safe-area-inset-bottom, 0px) - 24px); }
  .wt-foot .wt-hint { display: none; }
}
@media (forced-colors: active) { .wt-ring { box-shadow: none; outline: 3px solid Highlight; } .wt-bar-fill { background: Highlight; } }
@media print { .wt-panel, .wt-ring { display: none !important; } }
`;
function ensureStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const st = document.createElement('style');
  st.id = STYLE_ID;
  st.textContent = STYLE_TEXT;
  document.head.appendChild(st);
}

/* ───────────────────────── step content ───────────────────────── */

function tag(key, tone = 'neutral') { return components.badge(t(`tags.${key}`), tone); }
function code(str) { return h('span', { class: 'wt-code', dir: 'ltr', translate: 'no' }, String(str || '')); }
function num(str) { return h('span', { class: 'wt-num', dir: 'ltr' }, String(str)); }
function dataText(str) { const v = String(str ?? ''); return isEn() && /[\u0600-\u06FF]/.test(v) ? h('span', { lang: 'ar', dir: 'rtl' }, v) : h('span', {}, v); }

function content(stepId, risk, ctx) {
  const st = stateOf(ctx);
  const sc = risk.scenario || {};
  const P = (k, p) => t(`steps.${stepId}.${k}`, p);
  const nodes = [];
  switch (stepId) {
    case 'register': {
      const detected = risk.detectedAt ? fmt.time(risk.detectedAt) : '—';
      const sub = arr(st.platform && st.platform.submittals).find((s) => s && arr(risk.links && risk.links.submittals).includes(s.id));
      nodes.push(h('p', {}, P('body', { code: risk.code, time: detected, submittal: sub ? sub.code : 'MAR-S1-CW-014', score: fmt.num(risk.score), rating: i18n.label('rating', risk.score >= 70 ? 'red' : risk.score >= 40 ? 'yellow' : 'green') || '' })));
      nodes.push(h('p', { class: 'wt-note' }, P('point')));
      nodes.push(h('div', { class: 'wt-tags' }, tag('demo', 'accent')));
      break;
    }
    case 'overview': {
      const dq = risk.dataQuality || {};
      nodes.push(h('p', {}, P('body', { l: fmt.num(risk.likelihood), i: fmt.num(risk.impact), score: fmt.num(risk.score), conf: fmt.pct(Number(risk.confidence) * 100), dq: i18n.label('dataQualityLevel', dq.level) || dq.level || '—', dqScore: dq.score === null || dq.score === undefined ? '—' : fmt.num(dq.score) })));
      nodes.push(h('p', { class: 'wt-sub' }, P('drivers')));
      nodes.push(h('ul', { class: 'wt-list', role: 'list' }, arr(risk.drivers).map((d) => h('li', { class: 'wt-bar' },
        dataText(pick(d.label, d.labelEn)), num(fmt.pct(d.weight * 100)),
        h('span', { class: 'wt-bar-track', 'aria-hidden': 'true' }, h('span', { class: 'wt-bar-fill', style: `transform: scaleX(${Math.max(0, Math.min(1, d.weight))})` }))))));
      if (arr(risk.unknowns).length) {
        nodes.push(h('p', { class: 'wt-sub' }, P('unknowns')));
        nodes.push(h('ul', { class: 'wt-list', role: 'list' }, arr(risk.unknowns).map((u) => h('li', { class: 'wt-note' }, '— ', dataText(pick(u.text, u.textEn))))));
      }
      nodes.push(h('div', { class: 'wt-tags' }, tag('demo', 'accent'), tag('illustrative')));
      break;
    }
    case 'evidence': {
      const chain = arr(risk.evidenceChain);
      const systems = new Map();
      chain.forEach((e) => systems.set(e.sourceSystem, (systems.get(e.sourceSystem) || 0) + 1));
      nodes.push(h('p', {}, P('body', { count: fmt.num(chain.length) })));
      nodes.push(h('ul', { class: 'wt-list', role: 'list' }, Array.from(systems.entries()).map(([name, n]) => h('li', { class: 'wt-item' },
        h('div', { class: 'wt-item-head' }, dataText(i18n.label('sourceSystem', name) || name), components.statusBadge('demo', { size: 'sm', title: false })),
        h('span', { class: 'wt-item-meta' }, chain.filter((e) => e.sourceSystem === name).map((e) => `${t(`steps.evidence.roles.${e.role}`)} · ${e.ref}`).join(' — '), ' ', num(`(${fmt.num(n)})`))))));
      break;
    }
    case 'options': {
      nodes.push(h('p', {}, P('body')));
      nodes.push(h('ul', { class: 'wt-list', role: 'list' }, arr(risk.recommendationOptions).map((o) => h('li', { class: 'wt-item' },
        h('div', { class: 'wt-item-head' }, code(o.id), h('strong', {}, dataText(pick(o.title, o.titleEn))),
          o.recoversDays ? components.badge(P('recovers', { n: i18n.tn('walkthrough.days', o.recoversDays, { count: fmt.num(o.recoversDays) }) }), 'good') : components.badge(P('none'), 'neutral'),
          arr(o.requires).length ? components.badge(P('requires', { id: o.requires.join(', ') }), 'warning') : null),
        h('span', { class: 'wt-item-meta' }, dataText(pick(o.cost, o.costEn))),
        h('span', { class: 'wt-item-meta' }, '⚠ ', dataText(pick(o.introduces, o.introducesEn)))))));
      const c = risk.combined || {};
      const noAction = arr(risk.exposure && risk.exposure.scenarios).find((x) => x.key === 'no-action');
      if (c.finishSlipDays !== undefined && noAction) nodes.push(h('p', { class: 'wt-note' }, P('combined', { from: fmt.num(noAction.finishSlipDays), to: fmt.num(c.finishSlipDays), sarFrom: sar(noAction.sar), sarTo: sar(c.exposureSAR) })));
      nodes.push(h('div', { class: 'wt-tags' }, tag('demo', 'accent'), tag('derived')));
      break;
    }
    case 'decision': {
      const { at, ahead } = projectedDecision(sc, nowOf(ctx));   // the clock time only while it is still to come
      nodes.push(h('p', {}, P(ahead ? 'body' : 'bodyDay', { time: ahead ? fmt.time(at) : '', date: sc.decisionDate ? fmt.date(sc.decisionDate) : '—' })));
      const rows = [
        [P('by'), person(sc.decidedBy)],
        [P('accept'), code(arr(sc.accept).join(' + '))],
        [P('hedge'), code(arr(sc.hedge).join(' + '))],
        [P('escalate'), sc.escalateTo ? i18n.label('stakeholderRole', sc.escalateTo) || sc.escalateTo : '—'],
        [P('condition'), dataText(pick(sc.condition && sc.condition.text, sc.condition && sc.condition.textEn))],
      ];
      nodes.push(components.kv(rows));
      nodes.push(h('p', { class: 'wt-sub' }, P('reason')));
      nodes.push(h('blockquote', { class: 'wt-item', style: 'margin: 0' }, dataText(pick(sc.reason, sc.reasonEn))));
      nodes.push(h('p', { class: 'wt-note' }, P('tryIt')));
      nodes.push(h('div', { class: 'wt-tags' }, tag('projected', 'warning'), tag('demo', 'accent')));
      break;
    }
    case 'tasks': {
      nodes.push(h('p', {}, P('body')));
      const decided = new Set([...arr(sc.accept), ...arr(sc.hedge)]);
      const items = arr(risk.recommendationOptions).filter((o) => !decided.size || decided.has(o.id)).flatMap((o) => arr(o.tasks).map((tk) => ({ ...tk, option: o.id })));
      nodes.push(h('ul', { class: 'wt-list', role: 'list' }, items.map((tk) => {
        const due = addDays(sc.decisionDate, tk.dueOffset || 0);
        return h('li', { class: 'wt-item' },
          h('div', { class: 'wt-item-head' }, code(tk.key), code(tk.option), tk.gate ? components.badge(`${P('gate')}: ${pick(tk.gate.text, tk.gate.textEn)}`, 'warning', { icon: 'lock' }) : null),
          dataText(pick(tk.title, tk.titleEn)),
          h('span', { class: 'wt-item-meta' }, person(tk.owner), ' · ', due ? P('due', { date: fmt.date(due, { style: 'short' }) }) : ''));
      })));
      nodes.push(h('div', { class: 'wt-tags' }, tag('projected', 'warning'), tag('simulated', 'accent')));
      break;
    }
    case 'closure': {
      const cc = arr(risk.closureCriteria);
      nodes.push(h('p', {}, P('body', { n: fmt.num(cc.length) })));
      nodes.push(h('ul', { class: 'wt-list', role: 'list' }, cc.map((c) => h('li', { class: 'wt-item' },
        h('div', { class: 'wt-item-head' }, code(c.id), h('strong', {}, dataText(pick(c.text, c.textEn))), h('span', { class: 'wt-item-meta' }, num(fmt.date(c.plannedAt, { style: 'short' })))),
        h('span', { class: 'wt-item-meta' }, dataText(pick(c.evidence, c.evidenceEn))),
        h('span', { class: 'wt-item-meta' }, '▢ ', P('slot'))))));
      nodes.push(h('p', { class: 'wt-note' }, P('monitors', { n: fmt.num(arr(risk.monitors).length) })));
      if (sc.closureOutcome) {
        nodes.push(h('p', { class: 'wt-sub' }, P('outcome')));
        nodes.push(h('p', { class: 'wt-note' }, dataText(pick(sc.closureOutcome, sc.closureOutcomeEn))));
      }
      nodes.push(h('div', { class: 'wt-tags' }, tag('projected', 'warning'), tag('demo', 'accent')));
      break;
    }
    case 'site': {
      const site = arr(st.sites).find((s) => s && s.id === risk.projectId);
      const zi = site ? arr(site.zones).findIndex((z) => z.id === risk.zoneId) : -1;
      const zl = site && zi >= 0 ? (arr(i18n.L(site, 'zones', 'sites'))[zi] || site.zones[zi]) : null;
      nodes.push(h('p', {}, P('body', { zone: `${risk.zoneId} ${zl && zl.name ? `— ${zl.name}` : ''}`.trim(), code: risk.code })));
      const pano = arr(risk.links && risk.links.captures360)[0];
      if (pano) {
        nodes.push(components.button(P('open360'), { variant: 'outline', size: 'sm', icon: 'eye', attrs: { 'data-wt-action': 'open360' }, onClick: () => {
          // the viewer hides the panel while it is open (syncOverlays); the focus comes back to this button after it
          if (active) active.resume = '[data-wt-action="open360"]';
          location.hash = `#/spatial?site=${encodeURIComponent(risk.projectId)}&zone=${encodeURIComponent(risk.zoneId)}&pano=${encodeURIComponent(pano)}`;
        } }));
      }
      nodes.push(h('p', { class: 'wt-note' }, P('note')));
      nodes.push(h('div', { class: 'wt-tags' }, tag('simulated', 'accent'), tag('illustrative')));
      break;
    }
    default: break;
  }
  return nodes;
}

/* ───────────────────────── screen control ───────────────────────── */

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitFor(fn, timeout = 4000) {
  const t0 = Date.now();
  for (;;) {
    let v = null;
    try { v = fn(); } catch { v = null; }
    if (v) return v;
    if (Date.now() - t0 > timeout) return null;
    await sleep(60);
  }
}
const openDrawerEl = () => document.querySelector('dialog.risk-drawer[open]');
function arrived(dlg) { const r = dlg.getBoundingClientRect(); return r.width > 0 && r.left >= -1 && r.right <= window.innerWidth + 1; }
function unsettled() {
  const m = document.querySelector('main');
  return Boolean(document.querySelector('.drawer-backdrop.is-closing, .modal-backdrop.is-closing')) || Boolean(m && (m.getAttribute('aria-busy') === 'true' || !m.childElementCount));
}
function drawerRiskCode(el) { const c = el && el.querySelector('.drawer-sub .code'); return c ? c.textContent.trim() : ''; }

async function ensureScreen(stepId) {
  const a = active;
  if (!a) return;
  const risk = riskOf(a.ctx, a.riskId);
  if (!risk) return;
  // A view that is being re-mounted (language change) and a drawer that is sliding out (still [open]) are not the
  // screen yet: wait for both before deciding what this step needs.
  if (unsettled()) await waitFor(() => !unsettled(), 2000);
  if (stepId === 'site') {
    const want = `#/spatial?site=${encodeURIComponent(risk.projectId)}&zone=${encodeURIComponent(risk.zoneId)}`;
    if (routeId() !== 'spatial') location.hash = want;
    await waitFor(() => document.querySelector('.view-spatial .sp-plan'));
    // Leaving the register closes its drawer, which hands the focus back when its closing animation ends: wait
    // for that, so the step heading (focused at the end of go()) keeps the focus.
    await waitFor(() => !openDrawerEl(), 1500);
    return;
  }
  const tab = DRAWER_TAB[stepId] || null;
  if (routeId() !== 'airisks') {
    location.hash = '#/airisks?domain=bom';
    await waitFor(() => document.querySelector('.view-airisks'));
    await sleep(120);
    // The drawer of the page just left (the tour was launched from it on #/bom) is still sliding out, still [open]
    // and shows the same risk: it is not this step's drawer. Wait for it to go, then open the register's own.
    if (unsettled()) await waitFor(() => !unsettled(), 2000);
  }
  let d = openDrawerEl();
  if (!tab) {
    if (d) { const x = d.querySelector('.drawer-close'); if (x) x.click(); await waitFor(() => !openDrawerEl(), 1500); }
    if (hashQuery().get('domain') !== 'bom' && !document.querySelector(`tr[data-key="${cssEscape(risk.id)}"]`)) {
      location.hash = '#/airisks?domain=bom';
      await waitFor(() => document.querySelector(`tr[data-key="${cssEscape(risk.id)}"]`), 2500);
    }
    return;
  }
  if (!d || drawerRiskCode(d) !== risk.code) {
    try {
      const mod = await import('../views/shared/risk-drawer.js');
      const open = mod.openRiskDrawer || (mod.default && mod.default.openRiskDrawer) || mod.default;
      if (typeof open === 'function') open(a.ctx || {}, risk.id, { tab, returnFocus: null });
    } catch { /* drawer unavailable: the panel still explains the step */ }
    d = await waitFor(() => { const x = openDrawerEl(); return x && drawerRiskCode(x) === risk.code ? x : null; }, 3000);
  }
  if (d) {
    const tb = d.querySelector(`.drawer-tab[data-tab="${tab}"]`);
    if (tb && tb.getAttribute('aria-selected') !== 'true') tb.click();
    await sleep(40);
  }
}

function findTarget(stepId) {
  const a = active;
  const list = TARGETS[stepId] || [];
  const scope = DRAWER_TAB[stepId] ? openDrawerEl() || document : document;
  for (const sel0 of list) {
    const sel = sel0.replace('{id}', cssEscape(a ? a.riskId : ''));
    let el = null;
    try { el = scope.querySelector(sel); } catch { el = null; }
    if (el) {
      const sec = el.closest('section.risk-sec');
      const node = /^#risk-/.test(sel) && sec ? sec : el;
      if (node.getClientRects().length) return node;
    }
  }
  return null;
}

/** Keeps the panel off the drawer: the drawer sits at the inline end, the panel goes to the inline start. */
function setSide() { if (active) active.root.setAttribute('data-side', openDrawerEl() ? 'start' : 'end'); }

function placeRing() {
  const a = active;
  if (!a) return;
  setSide();
  // The view re-renders its rows (live data, language) and a drawer can close under the tour: look the target up
  // again when its node is gone, and drop the ring when the step's target is not on screen any more.
  if (a.target && !a.target.isConnected) a.target = a.busy ? null : findTarget(STEPS[a.step]);
  const el = a.target;
  if (!el) { a.ring.classList.remove('is-on'); return; }
  const r = el.getBoundingClientRect();
  if (!r.width || !r.height) { a.ring.classList.remove('is-on'); return; }
  const pad = 4;
  const x = Math.max(2, r.left - pad); const y = Math.max(2, r.top - pad);
  const w = Math.min(window.innerWidth - x - 2, r.width + pad * 2); const hh = Math.min(window.innerHeight - y - 2, r.height + pad * 2);
  a.ring.style.inlineSize = `${Math.max(0, w)}px`;
  a.ring.style.blockSize = `${Math.max(0, hh)}px`;
  // the ring is a fixed overlay: left/top in physical px through transform (direction-independent)
  a.ring.style.insetInlineStart = '0px';
  a.ring.style.transform = `translate(${document.dir === 'rtl' ? x - window.innerWidth + w : x}px, ${y}px)`;
  a.ring.classList.add('is-on');
}
/**
 * The panel lies over the bottom of the screen (on phones across its whole width). When the step's target is in
 * the panel's columns, the target's scroll container (the page, `main` or the drawer body) gets room at its end
 * and a matching scroll padding, so scrollIntoView stops the target clear of the panel and the reader can still
 * scroll the end of that container into view. Kept while the next step uses the same container (no jump of its
 * scroll position in between); undone when the container changes and when the tour ends.
 * A page target beside the panel (a short screen) still has the tab bar over the end of the page: the same room is
 * made for the bar alone.
 * Below 960 px the app bar is fixed over the start of the page: the page gets a scroll padding there too, so the
 * target stops below the bar. On a phone the target then has to fit between the bar and the panel: when it does
 * not, the panel gives up height (its text scrolls) — never below TEXT_MIN of text. A target that still does not
 * fit is shown from its start: dock() returns true and the caller scrolls it to the start instead of the nearest
 * edge.
 */
const FREE = 12;       // px kept free between the target and the bar / the panel (the ring is drawn 4–7 px outside it)
const TEXT_MIN = 60;   // px of step text the panel keeps when it gives up height for a tall target
function undock() {
  const a = active;
  const d = a && a.docked;
  if (!d) return;
  a.docked = null;
  d.el.style.paddingBlockEnd = d.pad;
  d.el.style.scrollPaddingBlockEnd = d.scrollPad;
  d.el.style.scrollPaddingBlockStart = d.scrollPadStart;
}
/** The box that scrolls `target` vertically: inside a dialog its body, on the page `main` (wide) or the document. */
function scrollerOf(target) {
  const dlg = target.closest('dialog[open]');
  for (let el = target.parentElement; el && el !== document.body && el !== document.documentElement; el = el.parentElement) {
    const oy = getComputedStyle(el).overflowY;
    if ((oy === 'auto' || oy === 'scroll') && el.scrollHeight > el.clientHeight + 1) return el;
    if (el === dlg) break;
  }
  if (!dlg) return document.documentElement;
  const body = dlg.querySelector('.drawer-body, .modal-body');
  return body && body.contains(target) ? body : null;
}
/** Where the app bar ends while it is fixed over the page (below 960 px); 0 when it is part of the layout. */
function barEnd() {
  const bar = document.getElementById('appbar');
  if (!bar || getComputedStyle(bar).position !== 'fixed') return 0;
  const r = bar.getBoundingClientRect();
  return r.height && r.top <= 0 ? Math.max(0, Math.round(r.bottom)) : 0;
}
/** The panel's box where it rests: its entrance moves it by up to 12 px during the first 220 ms of the tour. */
function panelBox() {
  const r = active.root.getBoundingClientRect();
  let dy = 0;
  try { const m = getComputedStyle(active.root).transform; if (m && m !== 'none') dy = new DOMMatrixReadOnly(m).m42 || 0; } catch { dy = 0; }
  return { top: r.top - dy, left: r.left, right: r.right, height: r.height };
}
function dock(target) {
  const a = active;
  if (!a) return false;
  let sc = null;      // the box that scrolls the target
  let room = 0;       // px kept free at its end
  let head = 0;       // px the fixed app bar takes at its start
  let tall = false;   // the target is taller than what stays in view
  a.root.style.maxBlockSize = '';   // the height given up for the last target or the last screen size
  if (target && target.isConnected) {
    let pr = panelBox();
    const tr = target.getBoundingClientRect();
    let end = 0;      // where the visible part of the scroller ends: at the panel, or beside it at the tab bar
    const under = Boolean(pr.height) && tr.right > pr.left + 1 && tr.left < pr.right - 1;   // not beside the panel
    if (under) { sc = scrollerOf(target); end = pr.top; }
    else if (!target.closest('dialog[open]')) {                             // beside it: only the tab bar is in the way
      const bar = document.getElementById('tabbar');
      const br = bar && bar.getClientRects().length ? bar.getBoundingClientRect() : null;
      if (br && br.height && br.top < window.innerHeight) { sc = scrollerOf(target); end = br.top; }
    }
    if (sc === document.documentElement) {
      head = barEnd();
      if (head && under && matchMedia('(max-width: 640px)').matches) {
        const lack = tr.height + 2 * FREE - (end - head);
        const least = Math.min(pr.height, pr.height - a.body.getBoundingClientRect().height + TEXT_MIN);
        if (lack > 0 && pr.height > least) {
          a.root.style.maxBlockSize = `${Math.max(least, Math.floor(pr.height - lack))}px`;
          pr = panelBox();
          end = pr.top;
        }
      }
      tall = head > 0 && tr.height > end - head - 2 * FREE;
    }
    if (sc) room = Math.max(0, Math.round(window.innerHeight - end + FREE));
  }
  if (a.docked && (a.docked.el !== sc || !room)) undock();
  if (!sc || !room) return false;
  if (!a.docked) a.docked = { el: sc, pad: sc.style.paddingBlockEnd, scrollPad: sc.style.scrollPaddingBlockEnd, scrollPadStart: sc.style.scrollPaddingBlockStart, own: parseFloat(getComputedStyle(sc).paddingBlockEnd) || 0 };
  sc.style.paddingBlockEnd = `${a.docked.own + room}px`;
  sc.style.scrollPaddingBlockEnd = `${room}px`;
  sc.style.scrollPaddingBlockStart = head ? `${head + FREE}px` : a.docked.scrollPadStart;
  return tall;
}
function scheduleRing() {
  const a = active;
  if (!a || a.ringRaf) return;
  a.ringRaf = requestAnimationFrame(() => { if (active) { active.ringRaf = 0; placeRing(); } });
}
/**
 * Places the step's target for the screen as it is now: room for it (dock), the target in view, the ring on it.
 * Runs when a step arrives and again when the screen size has changed — the room is measured for one layout, and a
 * phone turned on a drawer step kept the room (or the lack of it) of the other orientation. `scroll: false` leaves
 * the scroll position alone (a change of height only: the browser's own bars).
 */
function showTarget({ smooth = true, scroll = true } = {}) {
  const a = active;
  if (!a) return;
  if (a.target && !a.target.isConnected) a.target = findTarget(STEPS[a.step]);
  const target = a.target;
  setSide();
  const width = window.innerWidth;
  let tall = dock(target);
  // Chromium's phone layout can still be zoomed out after a turn (see onResize). The change dock() makes ends that
  // state, and its numbers were then taken from a layout that is gone: measure once more for the real one.
  if (window.innerWidth !== width) tall = dock(target);
  a.vw = window.innerWidth;
  if (target && scroll) { try { target.scrollIntoView({ block: tall ? 'start' : 'nearest', behavior: smooth && !reduced() ? 'smooth' : 'auto' }); } catch { /* ignore */ } }
  scheduleRing();
}

/** Shows step `index`. `focus: false` puts the step's screen back without moving the focus (language change). */
async function go(index, { focus = true } = {}) {
  const a = active;
  if (!a) return;
  const n = Math.max(0, Math.min(STEPS.length - 1, index));
  const seq = ++a.seq;
  a.step = n;
  a.busy = true;
  const stepId = STEPS[n];
  paint(stepId, { loading: true });
  await ensureScreen(stepId);
  if (!active || active !== a || seq !== a.seq) return;
  const target = await waitFor(() => findTarget(stepId), 1500);
  if (!active || active !== a || seq !== a.seq) return;
  // A drawer the tour has just opened is still sliding in: until it stops its boxes are off to the side, the target
  // looks "beside" the panel and no room is made for it (on a phone it then stays under the panel). Measure after.
  const dlg = target ? target.closest('dialog[open]') : null;
  if (dlg && !arrived(dlg)) {
    await waitFor(() => arrived(dlg), 800);
    if (!active || active !== a || seq !== a.seq) return;
  }
  a.busy = false;
  a.resume = null;
  // The reader went elsewhere while the step was on its way (a tap on the tab bar, Back): the tour does not stay
  // over another page.
  if (routeId() !== screenOf(n)) { stopWalkthrough('route'); return; }
  a.target = target;
  paint(stepId, { loading: false });   // first: the panel takes its height for this step, then the target is placed
  showTarget();
  setTimeout(scheduleRing, reduced() ? 0 : 360);
  if (focus) { try { a.title.focus({ preventScroll: true }); } catch { /* ignore */ } }
}

function setButtonText(btn, text) { const l = btn.querySelector('.btn-label'); if (l) l.textContent = text; else btn.textContent = text; }

function paint(stepId, { loading }) {
  const a = active;
  if (!a) return;
  const risk = riskOf(a.ctx, a.riskId);
  const n = STEPS.indexOf(stepId);
  a.kicker.textContent = `${t('title')} · ${t('step', { n: fmt.num(n + 1), total: fmt.num(STEPS.length) })}`;
  a.title.textContent = t(`steps.${stepId}.title`, { n: fmt.num(new Set(arr(risk && risk.evidenceChain).map((e) => e.sourceSystem)).size) });
  Array.from(a.progress.children).forEach((seg, i) => { seg.className = i < n ? 'is-done' : i === n ? 'is-current' : ''; });
  a.progress.setAttribute('aria-valuenow', String(n + 1));
  a.progress.setAttribute('aria-valuetext', t('step', { n: fmt.num(n + 1), total: fmt.num(STEPS.length) }));
  if (!loading || !a.body.childElementCount) {
    const held = a.body.contains(document.activeElement);   // a control of the step text (the 360° button) has the focus
    a.body.replaceChildren(...(risk ? content(stepId, risk, a.ctx) : [h('p', {}, t('unavailable'))]), h('p', { class: 'wt-note' }, t('honest')));
    if (held) { try { a.title.focus({ preventScroll: true }); } catch { /* ignore */ } }
  }
  a.prev.disabled = n === 0;
  setButtonText(a.next, n === STEPS.length - 1 ? t('finish') : t('next'));
  a.root.setAttribute('aria-busy', loading ? 'true' : 'false');
}

/** The panel's fixed labels, language and direction (set at start and again when the language changes). */
function paintChrome() {
  const a = active;
  if (!a) return;
  a.root.setAttribute('dir', i18n.dir());
  a.root.setAttribute('lang', i18n.lang());
  a.closeX.setAttribute('aria-label', t('close'));
  a.progress.setAttribute('aria-label', t('progress'));
  a.hint.textContent = t('closeHint');
  setButtonText(a.prev, t('prev'));
}

/* ───────────────────────── other overlays, keyboard ───────────────────────── */

/** The topmost open dialog when it is not the risk drawer the tour explains (the 360° viewer, a form, a shell drawer). */
function dialogOnTop() {
  const list = document.querySelectorAll('dialog[open]');
  const top = list.length ? list[list.length - 1] : null;
  return top && !top.classList.contains('risk-drawer') ? top : null;
}

/**
 * Runs when a dialog opens or closes. Another dialog on top: the panel and the ring step aside (hidden) until it
 * closes — the panel is drawn above every dialog and would cover it (on a phone: most of the 360° picture and all
 * of its controls). The explained drawer closed by the reader: the tour closes.
 */
function syncOverlays() {
  const a = active;
  if (!a) return;
  // The reader closed the drawer this step explains (its X, the backdrop): the tour closes with it. The tour's own
  // moves and a language / numerals re-mount close and reopen the drawer while `busy` is set.
  if (!a.busy && DRAWER_TAB[STEPS[a.step]] && !openDrawerEl()) { stopWalkthrough('drawer'); return; }
  const away = Boolean(dialogOnTop());
  if (away !== a.away) {
    a.away = away;
    a.root.toggleAttribute('data-away', away);
    a.ring.toggleAttribute('data-away', away);
    if (!away) {
      // Back from a dialog the panel's own button opened (the 360° viewer): the focus returns to that button. Else,
      // when the dialog handed the focus to nothing (a node hidden with the panel), the step heading takes it.
      const back = a.resume ? a.body.querySelector(a.resume) : null;
      a.resume = null;
      const lost = !document.activeElement || document.activeElement === document.body;
      const to = back || (lost ? a.title : null);
      if (to) { try { to.focus({ preventScroll: true }); } catch { /* ignore */ } }
      // the screen may have been turned while the panel was hidden: the room is measured for what it is now
      if (!a.busy && a.vw && a.vw !== window.innerWidth) showTarget({ smooth: false });
    }
  }
  scheduleRing();
}

/**
 * Tab between the open risk drawer and the panel. The drawer cycles Tab inside itself (components.js overlay), so
 * a focus that left the panel could not come back: here the two form one cycle — drawer … last → panel first …
 * last → drawer first, and the reverse with Shift+Tab.
 */
function bridgeTab(e) {
  const a = active;
  const drawer = openDrawerEl();
  if (!a || !drawer) return;
  const inPanel = components.focusables(a.root);
  const inDrawer = components.focusables(drawer);
  if (!inPanel.length || !inDrawer.length) return;
  const at = document.activeElement;
  let to = null;
  if (!e.shiftKey) {
    if (at === inDrawer[inDrawer.length - 1]) to = inPanel[0];
    else if (at === inPanel[inPanel.length - 1]) to = inDrawer[0];
  } else if (at === inDrawer[0] || at === drawer) to = inPanel[inPanel.length - 1];
  else if (at === inPanel[0] || at === a.title) to = inDrawer[inDrawer.length - 1];
  if (!to) return;
  e.preventDefault();
  e.stopPropagation();
  try { to.focus(); } catch { /* ignore */ }
}

/* ───────────────────────── public API ───────────────────────── */

/**
 * Starts (or restarts at `step`) the walkthrough. `ctx` is a view context (store, router, …) or {}.
 * Returns false when the worked example is not in this browser's data.
 */
export function startWalkthrough(ctx = {}, { riskId = WORKED_RISK, step = 0, returnFocus = null } = {}) {
  if (typeof document === 'undefined') return false;
  const risk = riskOf(ctx, riskId);
  if (!risk || !walkthroughAvailable(stateOf(ctx), risk.id)) {
    try { components.toast(t('unavailable'), { tone: 'warning' }); } catch { /* ignore */ }
    return false;
  }
  if (active) { active.ctx = ctx || active.ctx; go(step); return true; }
  ensureStyles();
  const uid = `wt-${Date.now().toString(36)}`;
  const kicker = h('span', { class: 'wt-kicker' });
  const title = h('h2', { class: 'wt-title', id: `${uid}-t`, tabindex: '-1' });
  // Labels, language and direction are written by paintChrome() (now and on every language change).
  const closeX = components.button('', { variant: 'ghost', size: 'sm', icon: 'close', onClick: () => stopWalkthrough('close'), attrs: { 'aria-label': t('close'), class: 'wt-x' } });
  const progress = h('div', { class: 'wt-progress', role: 'progressbar', 'aria-valuemin': '1', 'aria-valuemax': String(STEPS.length) }, ...STEPS.map(() => h('span', {})));
  // The step text scrolls when it is longer than the panel: focusable, so the keyboard can scroll it.
  const body = h('div', { class: 'wt-body', id: `${uid}-b`, tabindex: '0' });
  const prev = components.button(t('prev'), { variant: 'outline', size: 'sm', onClick: () => go(active.step - 1) });
  const next = components.button(t('next'), { variant: 'primary', size: 'sm', onClick: () => { if (active.step >= STEPS.length - 1) stopWalkthrough('finish'); else go(active.step + 1); } });
  const hint = h('span', { class: 'wt-hint' });
  const root = h('section', { class: 'wt-panel', role: 'dialog', 'aria-modal': 'false', 'aria-labelledby': `${uid}-t`, 'aria-describedby': `${uid}-b`, 'data-side': 'end' },
    h('div', { class: 'wt-head' }, h('div', { class: 'wt-head-text' }, kicker, title), closeX),
    progress, body,
    h('div', { class: 'wt-foot' }, hint, prev, next));
  const ring = h('div', { class: 'wt-ring', 'aria-hidden': 'true' });
  const animOn = !reduced();
  if (animOn) document.documentElement.classList.add('wt-anim');
  document.documentElement.classList.add('wt-on');   // the layout rules that make room for the panel (STYLE_TEXT)
  document.body.append(ring, root);
  // a drawer / modal makes the rest of the page inert while it is open; the tour panel stays usable
  const inertGuard = new MutationObserver(() => { if (root.inert) root.inert = false; if (root.hasAttribute('inert')) root.removeAttribute('inert'); });
  inertGuard.observe(root, { attributes: true, attributeFilter: ['inert'] });
  // Keyboard. Capture phase on the document: the open risk drawer handles Tab and Escape on its own backdrop and
  // stops them there, so the tour has to see the key first. Esc closes the tour (as the panel says) from the panel,
  // from the drawer it explains and from <body>; the drawer stays open and takes the next Esc itself.
  const onKeyCapture = (e) => {
    const a = active;
    if (!a || a.away || e.defaultPrevented || e.isComposing) return;
    if (e.key === 'Tab' && !e.altKey && !e.ctrlKey && !e.metaKey) { bridgeTab(e); return; }
    if (e.key !== 'Escape') return;
    const drawer = openDrawerEl();
    const tg = e.target;
    const here = root.contains(tg) || (drawer && (drawer.contains(tg) || tg === document.body || tg === document.documentElement));
    if (!here) return;
    e.preventDefault();
    e.stopPropagation();
    stopWalkthrough('escape');
  };
  // An Escape nothing else used (focus somewhere on the page, no menu / palette / field took it) closes the tour too.
  const onKeyLate = (e) => {
    if (e.key !== 'Escape' || e.defaultPrevented || e.isComposing || !active || active.away) return;
    e.preventDefault();
    stopWalkthrough('escape');
  };
  document.addEventListener('keydown', onKeyCapture, true);
  window.addEventListener('keydown', onKeyLate);
  const onMove = () => scheduleRing();
  // A new screen size (a phone turned, a window resized, the browser's own bars): the ring follows at once; when the
  // size has settled the target is placed again for the new layout (showTarget) — brought back into view only when
  // the width changed, so the browser's bars sliding in and out while the reader scrolls never move the page.
  // The visual viewport is watched as well. After a turn from landscape to portrait Chromium (seen in its phone
  // emulation) can keep the page zoomed out — a 545 px layout on a 390 px screen — until the layout changes again.
  // The placement is that change, and showTarget() measures again when the layout changed under it; a zoom that
  // ends later ends with a visual-viewport resize only, which places the target once more.
  let resizeTimer = 0;
  const onResize = () => {
    scheduleRing();
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => { const a = active; if (a && !a.busy && !a.away) showTarget({ smooth: false, scroll: a.vw !== window.innerWidth }); }, 160);
  };
  const visual = window.visualViewport || null;
  window.addEventListener('resize', onResize);
  if (visual) visual.addEventListener('resize', onResize);
  document.addEventListener('scroll', onMove, true);
  const onHash = () => { setTimeout(scheduleRing, 250); };
  window.addEventListener('hashchange', onHash);
  // Dialogs open and close in the overlay host: another dialog on top hides the panel, a closed drawer frees the ring.
  const overlayWatch = new MutationObserver(() => syncOverlays());
  overlayWatch.observe(document.getElementById('modals') || document.body, { childList: true });
  // Language or numerals: new labels, text, digits and direction at once. The router re-mounts the current view and
  // the risk drawer closes with it, so when the step lives on this route its screen is put back afterwards (drawer,
  // target, ring) without moving the focus; ensureScreen() waits for the re-mount and the closing drawer. `busy` is
  // set at once: the drawer that closes with the re-mount is not the reader closing it (syncOverlays).
  const repaint = () => {
    const a = active;
    if (!a) return;
    paintChrome();
    paint(STEPS[a.step], { loading: false });
    scheduleRing();
    if (routeId() !== screenOf(a.step)) return;
    const seq = ++a.seq;   // a step change still on its way is replaced by this one
    a.busy = true;
    setTimeout(() => { if (active === a && seq === a.seq) go(a.step, { focus: false }); }, 0);
  };
  const offLang = bus.on('lang:change', repaint);
  // The shell applies the new numerals to fmt before this runs (its listener is older), so the repaint has them.
  const numeralsOf = (st) => (st && st.numerals === 'arab' ? 'arab' : 'latn');
  let numerals = numeralsOf(stateOf(ctx).settings);
  const offSettings = bus.on('settings:change', (p) => {
    const next = numeralsOf((p && p.settings) || stateOf(active ? active.ctx : ctx).settings);
    if (next === numerals) return;
    numerals = next;
    repaint();
  });
  // The reader leaves the step's screen (a link, the tab bar, browser Back): the tour closes instead of staying on
  // its step over another page. The router emits this before it swaps the view; the tour's own moves are `busy`.
  const offRoute = bus.on('ui:route-leave', (p) => {
    const a = active;
    if (a && !a.busy && p && p.to && p.to !== screenOf(a.step)) stopWalkthrough('route');
  });
  const opener = returnFocus || (document.activeElement && document.activeElement !== document.body ? document.activeElement : null);
  active = { ctx: ctx || {}, riskId: risk.id, step: 0, seq: 0, root, ring, vw: 0, kicker, title, progress, body, prev, next, closeX, hint, target: null, ringRaf: 0, opener, docked: null, away: false, busy: false, resume: null,
    cleanup: () => {
      inertGuard.disconnect(); overlayWatch.disconnect(); offLang(); offSettings(); offRoute();
      document.removeEventListener('keydown', onKeyCapture, true); window.removeEventListener('keydown', onKeyLate);
      clearTimeout(resizeTimer);
      window.removeEventListener('resize', onResize); document.removeEventListener('scroll', onMove, true); window.removeEventListener('hashchange', onHash);
      if (visual) visual.removeEventListener('resize', onResize);
    } };
  paintChrome();
  syncOverlays();
  if (animOn && typeof root.animate === 'function') {
    try { root.animate([{ opacity: 0, transform: 'translateY(12px)' }, { opacity: 1, transform: 'none' }], { duration: 220, easing: 'cubic-bezier(.16,1,.3,1)' }); } catch { /* ignore */ }
  }
  go(step);
  return true;
}

/**
 * Closes the walkthrough and returns focus to the control that opened it (or the page heading). `reason` 'route'
 * (the reader navigated away): the router moves the focus to the new page's heading, so it is left alone here.
 */
export function stopWalkthrough(reason = 'close') {
  const a = active;
  if (!a) return;
  undock();
  active = null;
  a.seq += 1;
  if (a.ringRaf) cancelAnimationFrame(a.ringRaf);
  a.cleanup();
  const at = document.activeElement;
  const keepFocus = Boolean(at && at !== document.body && at !== document.documentElement && at.isConnected && !a.root.contains(at) && !at.closest('[inert]'));
  a.root.remove();
  a.ring.remove();
  document.documentElement.classList.remove('wt-anim', 'wt-on');
  if (reason === 'route') return reason;
  // Focus goes back to the opener; when that is gone, into the dialog that is open (the page behind it is inert:
  // the risk drawer's selected tab, the 360° viewer's close button), else to the page heading. A focus that is
  // already on a live control outside the panel (inside the drawer, on the page) stays where the reader put it.
  if (keepFocus) return reason;
  const dialogs = document.querySelectorAll('dialog[open]');
  const dlg = dialogs.length ? dialogs[dialogs.length - 1] : null;
  const back = a.opener && a.opener.isConnected && !a.opener.closest('[inert]') ? a.opener
    : (dlg ? dlg.querySelector('.drawer-tab[aria-selected="true"], .modal-close, .drawer-close, button:not([disabled])') : document.querySelector('main h1, h1'));
  if (back && typeof back.focus === 'function') { try { back.focus({ preventScroll: true }); } catch { /* ignore */ } }
  return reason;
}

export function isWalkthroughActive() { return Boolean(active); }

/** The tour's launch button for a drawer showing a worked-example risk (idempotent per drawer). */
export function attachTourButton(drawerEl, ctx = {}) {
  if (!drawerEl) return;
  const head = drawerEl.querySelector('.drawer-head');
  const codeTxt = drawerRiskCode(drawerEl);
  const risk = codeTxt ? riskOf(ctx, codeTxt) : null;
  const ok = Boolean(risk && walkthroughAvailable(stateOf(ctx), risk.id));
  let btn = head ? head.querySelector('.wt-launch') : null;
  if (!ok) { if (btn) btn.remove(); return; }
  if (btn || !head) return;
  ensureStyles();
  // Label in name (WCAG 2.5.3): named by its visible text; `launchAria` adds what the tour is about.
  btn = components.setLabelInName(components.button(t('launch'), { variant: 'outline', size: 'sm', icon: 'play', onClick: (e) => startWalkthrough(ctx, { riskId: risk.id, step: 1, returnFocus: e.currentTarget }), attrs: { class: 'wt-launch' } }), t('launchAria'));
  const x = head.querySelector('.drawer-close');
  head.insertBefore(btn, x || null);
}

/**
 * Watches the overlay host so the launch button appears on the AIR-1069 drawer wherever it is opened
 * (register, cockpit, alerts, tasks). Idempotent; cheap (one rAF-throttled check per DOM change of the host).
 */
export function installDrawerHook(ctx = {}) {
  if (hookInstalled || typeof document === 'undefined' || typeof MutationObserver !== 'function') return;
  hookInstalled = true;
  let raf = 0;
  const check = () => { raf = 0; const d = openDrawerEl(); if (d) attachTourButton(d, ctx); };
  const host = document.getElementById('modals') || document.body;
  new MutationObserver(() => { if (!raf) raf = requestAnimationFrame(check); }).observe(host, { childList: true, subtree: true, characterData: true });
  check();
}

export default { startWalkthrough, stopWalkthrough, isWalkthroughActive, installDrawerHook, attachTourButton, walkthroughAvailable, projectedDecision, WORKED_RISK };
