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
 * Motion: one opacity/transform entrance of the panel and an opacity fade of the highlight ring — compositor
 * only, nothing replays on live updates (content renders on step change only), off under reduced motion,
 * the Static setting, forced colours and print (hidden in print).
 * Honesty: every number comes from the seed; steps after the demo clock carry the "Projected" tag.
 */

import { components } from './components.js';
import { i18n } from '../core/i18n.js';
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
  background: var(--bg-1); color: var(--ink-1); box-shadow: var(--elev-3, 0 12px 40px rgba(0,0,0,.18)); }
.wt-panel[data-side="end"] { inset-inline-start: auto; inset-inline-end: 16px; }
.wt-head { display: flex; align-items: flex-start; gap: 8px; padding: 12px 14px 8px; border-block-end: 1px solid var(--line); }
.wt-head-text { display: grid; gap: 2px; min-inline-size: 0; flex: 1; }
.wt-kicker { font-size: var(--fs-xs); color: var(--brand-text); font-weight: 600; }
.wt-title { margin: 0; font-size: var(--fs-md, 16px); line-height: 1.35; outline: none; }
.wt-title:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; border-radius: 4px; }
.wt-x { flex: none; }
.wt-progress { display: flex; gap: 4px; padding: 0 14px 8px; margin: 0; list-style: none; }
.wt-progress li { flex: 1; block-size: 4px; border-radius: 2px; background: var(--line); }
.wt-progress li.is-done { background: color-mix(in srgb, var(--brand) 55%, var(--bg-1)); }
.wt-progress li.is-current { background: var(--brand); }
.wt-body { overflow: auto; padding: 10px 14px; display: grid; gap: 10px; font-size: var(--fs-sm); line-height: 1.55; }
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
.wt-launch { gap: 6px; }
@media (max-width: 640px) {
  .wt-panel, .wt-panel[data-side="end"] { inset-inline: 8px; inset-block-end: 8px; inline-size: auto; max-block-size: 46vh; }
  .wt-foot .wt-hint { display: none; }
  /* the drawer's launch button takes its own row under the title on phones (the title keeps its width) */
  .drawer-head:has(> .wt-launch) { flex-wrap: wrap; }
  .drawer-head:has(> .wt-launch) > .drawer-titles { flex: 1 1 0; min-inline-size: 0; }
  .drawer-head > .wt-launch { order: 3; flex-basis: 100%; justify-content: center; }
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
      nodes.push(h('p', {}, P('body', { time: sc.decisionTime || '—', date: sc.decisionDate ? fmt.date(sc.decisionDate) : '—' })));
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
        nodes.push(components.button(P('open360'), { variant: 'outline', size: 'sm', icon: 'eye', attrs: { 'data-wt-action': 'open360' }, onClick: () => { location.hash = `#/spatial?site=${encodeURIComponent(risk.projectId)}&zone=${encodeURIComponent(risk.zoneId)}&pano=${encodeURIComponent(pano)}`; } }));
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
function drawerRiskCode(el) { const c = el && el.querySelector('.drawer-sub .code'); return c ? c.textContent.trim() : ''; }

async function ensureScreen(stepId) {
  const a = active;
  if (!a) return;
  const risk = riskOf(a.ctx, a.riskId);
  if (!risk) return;
  if (stepId === 'site') {
    const want = `#/spatial?site=${encodeURIComponent(risk.projectId)}&zone=${encodeURIComponent(risk.zoneId)}`;
    if (routeId() !== 'spatial') location.hash = want;
    await waitFor(() => document.querySelector('.view-spatial .sp-plan'));
    return;
  }
  const tab = DRAWER_TAB[stepId] || null;
  if (routeId() !== 'airisks') {
    location.hash = '#/airisks?domain=bom';
    await waitFor(() => document.querySelector('.view-airisks'));
    await sleep(120);
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

function placeRing() {
  const a = active;
  if (!a) return;
  const el = a.target && a.target.isConnected ? a.target : null;
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
  // keep the panel off the drawer: the drawer sits at the inline end, the panel goes to the inline start
  const drawer = openDrawerEl();
  a.root.setAttribute('data-side', drawer ? 'start' : 'end');
}
function scheduleRing() {
  const a = active;
  if (!a || a.ringRaf) return;
  a.ringRaf = requestAnimationFrame(() => { if (active) { active.ringRaf = 0; placeRing(); } });
}

async function go(index) {
  const a = active;
  if (!a) return;
  const n = Math.max(0, Math.min(STEPS.length - 1, index));
  const seq = ++a.seq;
  a.step = n;
  const stepId = STEPS[n];
  paint(stepId, { loading: true });
  await ensureScreen(stepId);
  if (!active || active !== a || seq !== a.seq) return;
  const target = await waitFor(() => findTarget(stepId), 1500);
  if (!active || active !== a || seq !== a.seq) return;
  a.target = target;
  if (target) { try { target.scrollIntoView({ block: 'nearest', behavior: reduced() ? 'auto' : 'smooth' }); } catch { /* ignore */ } }
  paint(stepId, { loading: false });
  scheduleRing();
  setTimeout(scheduleRing, reduced() ? 0 : 360);
  try { a.title.focus({ preventScroll: true }); } catch { /* ignore */ }
}

function paint(stepId, { loading }) {
  const a = active;
  if (!a) return;
  const risk = riskOf(a.ctx, a.riskId);
  const n = STEPS.indexOf(stepId);
  a.kicker.textContent = `${t('title')} · ${t('step', { n: fmt.num(n + 1), total: fmt.num(STEPS.length) })}`;
  a.title.textContent = t(`steps.${stepId}.title`, { n: fmt.num(new Set(arr(risk && risk.evidenceChain).map((e) => e.sourceSystem)).size) });
  Array.from(a.progress.children).forEach((li, i) => { li.className = i < n ? 'is-done' : i === n ? 'is-current' : ''; });
  a.progress.setAttribute('aria-valuenow', String(n + 1));
  a.progress.setAttribute('aria-valuetext', t('step', { n: fmt.num(n + 1), total: fmt.num(STEPS.length) }));
  if (!loading || !a.body.childElementCount) a.body.replaceChildren(...(risk ? content(stepId, risk, a.ctx) : [h('p', {}, t('unavailable'))]), h('p', { class: 'wt-note' }, t('honest')));
  a.prev.disabled = n === 0;
  const last = n === STEPS.length - 1;
  a.next.querySelector('.btn-label') ? (a.next.querySelector('.btn-label').textContent = last ? t('finish') : t('next')) : (a.next.textContent = last ? t('finish') : t('next'));
  a.root.setAttribute('aria-busy', loading ? 'true' : 'false');
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
  const closeX = components.button('', { variant: 'ghost', size: 'sm', icon: 'close', onClick: () => stopWalkthrough('close'), attrs: { 'aria-label': t('close'), class: 'wt-x' } });
  const progress = h('ol', { class: 'wt-progress', role: 'progressbar', 'aria-label': t('progress'), 'aria-valuemin': '1', 'aria-valuemax': String(STEPS.length) }, ...STEPS.map(() => h('li', {})));
  const body = h('div', { class: 'wt-body', id: `${uid}-b` });
  const prev = components.button(t('prev'), { variant: 'outline', size: 'sm', onClick: () => go(active.step - 1) });
  const next = components.button(t('next'), { variant: 'primary', size: 'sm', onClick: () => { if (active.step >= STEPS.length - 1) stopWalkthrough('finish'); else go(active.step + 1); } });
  const root = h('section', { class: 'wt-panel', role: 'dialog', 'aria-modal': 'false', 'aria-labelledby': `${uid}-t`, 'aria-describedby': `${uid}-b`, 'data-side': 'end', dir: i18n.dir(), lang: i18n.lang() },
    h('div', { class: 'wt-head' }, h('div', { class: 'wt-head-text' }, kicker, title), closeX),
    progress, body,
    h('div', { class: 'wt-foot' }, h('span', { class: 'wt-hint' }, t('closeHint')), prev, next));
  const ring = h('div', { class: 'wt-ring', 'aria-hidden': 'true' });
  const animOn = !reduced();
  if (animOn) document.documentElement.classList.add('wt-anim');
  document.body.append(ring, root);
  // a drawer / modal makes the rest of the page inert while it is open; the tour panel stays usable
  const inertGuard = new MutationObserver(() => { if (root.inert) root.inert = false; if (root.hasAttribute('inert')) root.removeAttribute('inert'); });
  inertGuard.observe(root, { attributes: true, attributeFilter: ['inert'] });
  const onKey = (e) => {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); stopWalkthrough('escape'); }
  };
  root.addEventListener('keydown', onKey);
  const onMove = () => scheduleRing();
  window.addEventListener('resize', onMove);
  document.addEventListener('scroll', onMove, true);
  const onHash = () => { setTimeout(scheduleRing, 250); };
  window.addEventListener('hashchange', onHash);
  const opener = returnFocus || (document.activeElement && document.activeElement !== document.body ? document.activeElement : null);
  active = { ctx: ctx || {}, riskId: risk.id, step: 0, seq: 0, root, ring, kicker, title, progress, body, prev, next, target: null, ringRaf: 0, opener,
    cleanup: () => { inertGuard.disconnect(); window.removeEventListener('resize', onMove); document.removeEventListener('scroll', onMove, true); window.removeEventListener('hashchange', onHash); } };
  if (animOn && typeof root.animate === 'function') {
    try { root.animate([{ opacity: 0, transform: 'translateY(12px)' }, { opacity: 1, transform: 'none' }], { duration: 220, easing: 'cubic-bezier(.16,1,.3,1)' }); } catch { /* ignore */ }
  }
  go(step);
  return true;
}

/** Closes the walkthrough and returns focus to the control that opened it (or the page heading). */
export function stopWalkthrough(reason = 'close') {
  const a = active;
  if (!a) return;
  active = null;
  a.seq += 1;
  if (a.ringRaf) cancelAnimationFrame(a.ringRaf);
  a.cleanup();
  a.root.remove();
  a.ring.remove();
  document.documentElement.classList.remove('wt-anim');
  const back = a.opener && a.opener.isConnected && !a.opener.closest('[inert]') ? a.opener : (openDrawerEl() ? openDrawerEl().querySelector('.drawer-tab[aria-selected="true"]') : document.querySelector('main h1, h1'));
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
  btn = components.button(t('launch'), { variant: 'outline', size: 'sm', icon: 'play', onClick: (e) => startWalkthrough(ctx, { riskId: risk.id, step: 1, returnFocus: e.currentTarget }), attrs: { class: 'wt-launch', 'aria-label': t('launchAria') } });
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

export default { startWalkthrough, stopWalkthrough, isWalkthroughActive, installDrawerHook, attachTourButton, walkthroughAvailable, WORKED_RISK };
