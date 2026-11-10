/**
 * BILTIX Risk AI — view: AI engine & explainability (js/views/engine.js) — PLT-01. Owner: B-PLATFORM.
 *
 * Honest framing (CONTRACT §5): no model service is connected, so the five pipelines are an illustrative scenario.
 * The view says so (demo banner, status.pipeline() badge, "Illustrative values" tags on every metric), never shows
 * a running/training state as fact, and keeps Retrain / Pause DISABLED with the reason "requires a connected model
 * service" (no simulated retraining any more).
 *
 * Sections: head · banner · five-layer architecture map (ENG-00) · pipeline tabs with one expanded card (ENG-01:
 * scenario state, version, last run, runs, latency, precision / recall / ECE / drift meters, accept-vs-override,
 * feature importance and the KRI matrix folded, localized via the 'pipelines' data mirror) · how the score and the
 * explanation are produced (ENG-06, links to Settings → weights / thresholds) · severity vs model confidence vs
 * input-data quality (ENG-05) · audit log (ENG-07, localized actions, actors, targets and details).
 *
 * Live updates (C-4): the pipeline jitter patches the expanded card's meta and drift meter in place; validation
 * ticks only update the gate label; audit entries swap the audit card; structural changes rebuild. motion.enter on
 * the first render only. Deep links: ?pipeline=<id>, ?section=audit|pipelines|explain.
 * Strings: dictionary 'engine' (js/i18n/engine.js). Data reaches the DOM only through textContent / h().
 */

import { i18n } from '../core/i18n.js';
import dict from '../i18n/engine.js';

i18n.register('engine', dict);

const STYLE_ID = 'view-engine-style';
const STYLE_TEXT = `
  .view-engine .engine-meters { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: var(--space-3); }
  .view-engine .engine-meta { display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: var(--space-2); }
  .view-engine .engine-meta-cell { display: flex; flex-direction: column; gap: 2px; padding: 8px 10px; border-radius: 8px; background: var(--bg-2); border: 1px solid var(--line); min-inline-size: 0; }
  .view-engine .engine-meta-label { font-size: var(--fs-xs); color: var(--ink-2); }
  .view-engine .engine-meta-value { font-size: var(--fs-sm); font-variant-numeric: tabular-nums; color: var(--ink-1); overflow-wrap: anywhere; }
  .view-engine .engine-techniques { margin: 0; padding: 0; list-style: none; display: flex; flex-wrap: wrap; gap: 6px; }
  .view-engine .engine-techniques > li { display: inline-flex; align-items: center; gap: 6px; font-size: var(--fs-xs); color: var(--ink-2); padding: 3px 9px; border-radius: var(--radius-pill); background: var(--bg-2); border: 1px solid var(--line); }
  .view-engine .engine-techniques > li > svg { color: var(--accent-text); flex: none; }
  .view-engine .engine-fold > summary { cursor: pointer; font-size: var(--fs-sm); font-weight: 600; color: var(--ink-2); min-block-size: 40px; list-style: none; display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
  .view-engine .engine-fold > summary::-webkit-details-marker { display: none; }
  .view-engine .engine-fold > summary::before { content: ""; inline-size: 7px; block-size: 7px; border-inline-end: 2px solid currentColor; border-block-end: 2px solid currentColor; transform: rotate(-45deg); transition: transform var(--dur-micro) var(--ease-out); margin-inline-end: 2px; }
  :root[dir="rtl"] .view-engine .engine-fold > summary::before { transform: rotate(135deg); }
  .view-engine .engine-fold[open] > summary::before, :root[dir="rtl"] .view-engine .engine-fold[open] > summary::before { transform: rotate(45deg); }
  .view-engine .engine-fold > summary .muted { font-weight: 400; }
  .view-engine .pipe-tabs { display: flex; flex-wrap: wrap; gap: 6px; }
  .view-engine .pipe-tab { display: inline-flex; align-items: center; gap: 8px; min-block-size: 40px; padding: 8px 12px; border-radius: 10px; border: 1px solid var(--line); background: var(--bg-2); color: var(--ink-2); font: inherit; font-size: var(--fs-sm); cursor: pointer; min-inline-size: 0; text-align: start; transition: border-color var(--dur-micro) var(--ease-out), background var(--dur-micro) var(--ease-out); }
  .view-engine .pipe-tab:hover, .view-engine .pipe-tab:focus-visible { color: var(--ink-1); border-color: var(--line-2); }
  .view-engine .pipe-tab[aria-selected="true"] { color: var(--ink-1); background: color-mix(in srgb, var(--brand) 14%, var(--bg-1)); border-color: color-mix(in srgb, var(--brand) 55%, transparent); }
  .view-engine .pipe-tab > svg { flex: none; color: var(--ink-3); }
  .view-engine .pipe-tab[aria-selected="true"] > svg { color: var(--brand-text); }
  .view-engine .pipe-tab .mono { font-size: 11px; color: var(--ink-3); }
  .view-engine .pipeline-node.is-model { cursor: pointer; font: inherit; text-align: start; transition: border-color var(--dur-micro) var(--ease-out), background var(--dur-micro) var(--ease-out); }
  .view-engine .pipeline-node.is-model:hover, .view-engine .pipeline-node.is-model:focus-visible { background: var(--bg-3); }
  .view-engine .explain-steps { margin: 0; padding-inline-start: 0; list-style: none; counter-reset: xs; display: grid; gap: 14px 20px; grid-template-columns: repeat(auto-fit, minmax(min(100%, 240px), 1fr)); }
  .view-engine .explain-steps > li { display: grid; grid-template-columns: 28px minmax(0, 1fr); gap: 10px; align-items: start; counter-increment: xs; }
  .view-engine .explain-steps > li::before { content: counter(xs); display: grid; place-items: center; inline-size: 26px; block-size: 26px; border-radius: 50%; background: color-mix(in srgb, var(--brand) 16%, transparent); color: var(--brand-text); font-family: var(--font-mono); font-size: 12px; font-weight: 600; }
  :root[data-numerals="arab"] .view-engine .explain-steps > li::before { content: counter(xs, arabic-indic); }
  .view-engine .code { font-family: var(--font-mono); font-variant-numeric: tabular-nums; unicode-bidi: isolate; }
/* Status badges on the page plane sit on an opaque surface (the ambient background must not lower their contrast). */
.view-engine .view-actions .status-badge { background: linear-gradient(var(--tone-soft), var(--tone-soft)), var(--bg-1); }
  .view-engine .num { font-variant-numeric: tabular-nums; }
  .view-engine .eng-trio { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: var(--space-3); margin: 0; padding: 0; list-style: none; }
  .view-engine .eng-trio > li { display: grid; grid-template-columns: 32px minmax(0, 1fr); gap: 10px; align-items: start; padding: 12px; border-radius: var(--radius-md); background: var(--bg-2); border: 1px solid var(--line); }
  .view-engine .eng-trio-icon { inline-size: 32px; block-size: 32px; border-radius: 8px; display: grid; place-items: center; background: var(--bg-1); border: 1px solid var(--line); color: var(--brand-text); }
  .view-engine .eng-trio-title { font-size: var(--fs-sm); font-weight: 600; color: var(--ink-1); margin: 0; }
  .view-engine .eng-trio-text { font-size: var(--fs-xs); color: var(--ink-2); line-height: 1.6; margin: 0; }
  .view-engine .eng-panel-head { display: flex; align-items: flex-start; justify-content: space-between; gap: var(--space-3); flex-wrap: wrap; }
  .view-engine .eng-panel-title { display: flex; flex-direction: column; gap: 4px; min-inline-size: 0; flex: 1 1 320px; }
  .view-engine .eng-panel-title strong { font-size: var(--fs-md); color: var(--ink-1); }
  .view-engine .eng-panel-title p { margin: 0; font-size: var(--fs-sm); color: var(--ink-2); line-height: 1.6; }
  .view-engine .eng-state { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; font-size: var(--fs-xs); color: var(--ink-2); }
  .view-engine .eng-metrics-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; flex-wrap: wrap; }
  .view-engine .eng-disabled { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; inline-size: 100%; }
  .view-engine .eng-disabled-reason { font-size: var(--fs-xs); color: var(--ink-3); display: inline-flex; align-items: center; gap: 6px; flex: 1 1 220px; }
  .view-engine .eng-anchor { scroll-margin-block-start: var(--space-4); }
  @media (max-width: 959.98px) { .view-engine .eng-anchor { scroll-margin-block-start: calc(var(--appbar-h) + var(--space-4)); } }
  @container card (max-width: 760px) { .view-engine .eng-trio { grid-template-columns: minmax(0, 1fr); } }
  @media (max-width: 1279.98px) { .view-engine .engine-meters { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
  @media (max-width: 720px) { .view-engine .engine-meters { grid-template-columns: minmax(0, 1fr); } }
  @media (max-width: 599.98px) {
    .view-engine .chips.is-scroll, .view-engine .pipe-tabs { flex-wrap: nowrap; overflow-x: auto; scroll-snap-type: x proximity; -webkit-overflow-scrolling: touch; padding-block-end: 4px; scrollbar-width: thin; }
    .view-engine .chips.is-scroll > .chip, .view-engine .pipe-tab { flex: none; scroll-snap-align: start; }
  }
  @media (prefers-reduced-motion: reduce) { .view-engine .pipeline-node.is-model, .view-engine .pipe-tab, .view-engine .engine-fold > summary::before { transition: none; } }
`;

const PIPELINE_ICON = { 'contract-nlp': 'file-text', 'bom-forecast': 'list', 'schedule-model': 'calendar', 'site-ai': 'helmet', 'cost-forecast': 'chart' };
const ACTION_TONE = {
  override: 'warning', accept: 'good', escalate: 'critical', writeback: 'brand', 'model-update': 'accent', validation: 'neutral',
  login: 'neutral', config: 'neutral', close: 'good', create: 'neutral', evidence: 'accent', residual: 'accent', reopen: 'warning', assign: 'neutral', edit: 'neutral', attachment: 'neutral',
};
/** Five layers (§B1); node keys are dictionary keys, `[icon, key, latin]` — latin labels are product names kept as is. */
const LAYERS = [
  { id: 'l1', nodes: [['layers', 'biltix'], ['integration', null, 'Primavera P6 EPPM'], ['integration', null, 'Autodesk APS (BIM/CAD)'], ['integration', null, 'Oracle ERP / CRM'], ['globe', 'feeds']] },
  { id: 'l2', nodes: [['list', 'schema'], ['copy', 'dedupe'], ['badge-check', 'completeness'], ['sliders', 'consistency']], gate: true },
  { id: 'l3', nodes: [['erp', 'structured'], ['file-text', 'docs'], ['clock', 'versions'], ['shield-alert', 'audit']] },
  { id: 'l4', engine: true },
  { id: 'l5', nodes: [['filter', 'classify'], ['bell', 'alerting'], ['refresh', 'writeback'], ['file-check', 'tasks'], ['radar', 'cockpit']] },
];
const CODE_RE = /\b[A-Z]{1,5}-[A-Z0-9-]*\d[A-Z0-9-]*\b/g;
const AR_RE = /[؀-ۿ]/;

const LATIN_NUM_TOKEN = /[A-Za-z][A-Za-z0-9._-]*\d[A-Za-z0-9._-]*|\d+[A-Za-z][A-Za-z0-9._-]*/g;
function digitsIn(fmt, value) {
  const s = String(value ?? '');
  if (!fmt || typeof fmt.digits !== 'function' || !/\d/.test(s)) return s;
  let out = ''; let last = 0; let m;
  LATIN_NUM_TOKEN.lastIndex = 0;
  while ((m = LATIN_NUM_TOKEN.exec(s))) { out += fmt.digits(s.slice(last, m.index)) + m[0]; last = m.index + m[0].length; }
  return out + fmt.digits(s.slice(last));
}

const safe = (fn, fallback) => { try { const v = fn(); return v === undefined ? fallback : v; } catch { return fallback; } };
const arr = (v) => (Array.isArray(v) ? v : []);
const num = (v, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);
const asPct = (v) => { const n = num(v); return n <= 1 ? n * 100 : n; };
const setText = (el, text) => { if (el && el.textContent !== text) el.textContent = text; };
const brand = (s) => String(s ?? '').replace(/\bBiltix\b/g, 'BILTIX');

/** Date + 24 h time in Riyadh time (the product's reference zone), numerals and calendar from fmt.locale(). */
function riyadhDateTime(fmt, iso) {
  const d = iso instanceof Date ? iso : new Date(iso);
  if (!Number.isFinite(d.getTime())) return '—';
  try {
    const loc = fmt.locale();
    const date = new Intl.DateTimeFormat(loc, { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Riyadh' }).format(d);
    const time = new Intl.DateTimeFormat(loc, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: 'Asia/Riyadh' }).format(d);
    return `${date}${/^ar/.test(loc) ? '،' : ','} ${time}`;
  } catch { return fmt.dateTime(d); }
}

function ensureStyle() {
  if (typeof document === 'undefined' || document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = STYLE_TEXT;
  document.head.appendChild(style);
}

export default {
  id: 'engine',
  code: 'PLT-01',
  get title() { return i18n.has('core.nav.engine.title') ? i18n.t('core.nav.engine.title') : 'محرك الذكاء الاصطناعي والتفسير'; },
  icon: 'sliders',

  render(container, ctx) {
    const { store, bus, fmt, charts, components, psel, router } = ctx;
    const status = ctx.status || (typeof window !== 'undefined' && window.biltix && window.biltix.status) || null;
    const motion = ctx.motion || components.motion || null;
    const { h, card, badge, dataTable, button, emptyState, svgIcon, glyph, statusBadge } = components;
    const t = (k, p) => i18n.t(k, p);
    const tn = (k, n, p) => i18n.tn(k, n, p);
    const en = () => i18n.lang() === 'en';

    ensureStyle();
    const root = h('section', { class: 'view view-engine' });
    container.appendChild(root);

    let raf = 0;
    let firstPaint = true;
    let auditFilter = 'all';
    const openKri = new Set();
    const openFi = new Set();
    const params = ctx.params || {};
    const fromUrl = /[?&](section|pipeline)=/.test(location.hash || '');
    let activeId = params.pipeline && fromUrl ? String(params.pipeline) : null;
    let pendingScroll = fromUrl ? (params.pipeline ? 'pipelines' : ({ audit: 'audit', pipelines: 'pipelines', explain: 'explain' }[params.section] || null)) : null;
    let pendingFocusTab = false;
    const live = { signature: '', gate: null, tabs: new Map(), meta: null, drift: null, audit: null, pipelinesCard: null };

    /* ───────────────────────── helpers ───────────────────────── */

    const now = () => (typeof store.now === 'function' ? store.now() : new Date());
    const relSafe = (iso) => { const ms = Date.parse(iso); if (!Number.isFinite(ms)) return '—'; return fmt.relative(new Date(Math.min(ms, now().getTime())), now()); };
    const mono = (text) => h('span', { class: ['mono', 'num'] }, String(text ?? '—'));
    const codeSpan = (code) => h('span', { class: ['code', 'mono', 'nowrap'], dir: 'ltr' }, String(code ?? ''));
    function withCodes(str) {
      const s = brand(str); const out = []; let last = 0; let m;
      CODE_RE.lastIndex = 0;
      while ((m = CODE_RE.exec(s))) { if (m.index > last) out.push(digitsIn(fmt, s.slice(last, m.index))); out.push(codeSpan(m[0])); last = m.index + m[0].length; }
      if (last < s.length) out.push(digitsIn(fmt, s.slice(last)));
      return out.length ? out : [digitsIn(fmt, s)];
    }
    const illustrative = () => h('span', { class: 'sim-tag' }, svgIcon('flask', 11), t('engine.illustrative'));
    const pipeName = (p) => String((p && (i18n.L(p, 'nameAr', 'pipelines') || p.nameAr || p.name || p.id)) || '');
    const msText = (n) => t('engine.pipes.ms', { n: fmt.num(num(n)) });
    const pipeStatus = () => safe(() => status.pipeline(store.state), 'demo');

    function makeChart(name, opts) {
      if (!charts || typeof charts[name] !== 'function') return null;
      try { const c = charts[name](opts); return c && c.el instanceof Node ? c : null; } catch { return null; }
    }
    function simpleTable(headers, rows) {
      const table = h('table', { class: 'table is-dense' });
      table.appendChild(h('thead', {}, h('tr', {}, ...headers.map((x) => h('th', { scope: 'col' }, String(x))))));
      table.appendChild(h('tbody', {}, ...rows.map((r) => h('tr', {}, ...r.map((c) => h('td', {}, c instanceof Node ? c : String(c ?? '—')))))));
      return table;
    }
    /**
     * Illustrative metric meter (.meter chrome from charts.css): label + value, single neutral-brand fill. No
     * red / amber / green: these are scenario values, not measured model health (risk colours stay for risk states).
     */
    function meter({ value, max = 100, label, format }) {
      const valueEl = h('span', { class: 'meter-value num' });
      const head = h('div', { class: 'meter-head' }, h('span', {}, label), valueEl);
      const fill = h('div', { class: 'meter-fill', style: { background: 'var(--s1)' } });
      const el = h('div', { class: ['meter', 'tone-neutral'], role: 'meter', 'aria-valuemin': '0', 'aria-valuemax': String(max), 'aria-label': `${label} (${t('engine.illustrative')})` });
      el.append(head, h('div', { class: 'meter-track' }, fill));
      const set = (next) => {
        const v = Math.max(0, Math.min(max, num(next)));
        const valueText = format ? format(v) : fmt.num(v, { maximumFractionDigits: 1 });
        setText(valueEl, valueText);
        el.setAttribute('aria-valuenow', String(v)); el.setAttribute('aria-valuetext', valueText);
        const size = `${((v / max) * 100).toFixed(1)}%`;
        if (fill.style.inlineSize !== size) fill.style.inlineSize = size;
      };
      set(value);
      return { el, set };
    }
    function healthTone(p) {
      const tone = p && (p.healthTone || p.health || p.tone);
      if (['good', 'warning', 'serious', 'critical', 'neutral', 'accent'].includes(tone)) return tone;
      if (!p) return 'neutral';
      if (p.status === 'degraded') return 'warning';
      if (p.status === 'idle') return 'neutral';
      return 'good';
    }

    /* ── audit text in the active language (seed mirrors, *En fields, then known runtime patterns) ── */
    function auditTarget(e) {
      let s = i18n.L(e, 'target', 'auditLog') || e.target || '';
      if (en() && AR_RE.test(s)) {
        const plat = safe(() => psel.platform(store.state), {}) || {};
        const rule = arr(plat.validation && plat.validation.rules).find((r) => r && r.name === e.target);
        const pipe = arr(plat.pipelines).find((p) => p && (p.nameAr === e.target || p.name === e.target));
        const source = arr(plat.validation && plat.validation.sources).find((x) => x && x.name === e.target);
        if (rule) s = i18n.L(rule, 'name', 'validationRules');
        else if (pipe) s = pipeName(pipe);
        else if (source) s = i18n.L(source, 'name', 'validationSources');
        else s = i18n.term(s);
      }
      return brand(s || '—');
    }
    function auditDetail(e) {
      let s = i18n.L(e, 'detail', 'auditLog') || e.detail || '';
      if (!en() || !AR_RE.test(s)) return s || '—';
      const raw = String(e.detail || '');
      if (raw === 'تفعيل قاعدة التحقق') return t('engine.audit.runtime.ruleEnabled');
      if (raw === 'تعطيل قاعدة التحقق') return t('engine.audit.runtime.ruleDisabled');
      const q = /^(تصحيح|رفض|إعادة تعليق) سجل محجور — ?(.*)$/.exec(raw);
      if (q) {
        const plat = safe(() => psel.platform(store.state), {}) || {};
        const item = arr(plat.validation && plat.validation.quarantine).find((x) => x && (x.recordRef === e.target || x.id === e.target));
        const reason = item ? i18n.L(item, 'reason', 'quarantine') : q[2];
        const key = q[1] === 'تصحيح' ? 'corrected' : (q[1] === 'رفض' ? 'rejected' : 'reheld');
        return t(`engine.audit.runtime.${key}`, { reason });
      }
      const st = /^تغيير حالة المحرك: (\w+) ← (\w+)/.exec(raw);
      if (st) return t('engine.audit.runtime.engineState', { from: i18n.label('pipelineStatus', st[1]), to: i18n.label('pipelineStatus', st[2]) });
      return s;
    }

    /* ───────────────────────── data ───────────────────────── */

    function collectPipelines(state, plat) {
      let pipelines = safe(() => psel.pipelineHealth(state), null);
      if (!Array.isArray(pipelines) || !pipelines.length) pipelines = arr(plat.pipelines);
      return pipelines.map((p) => ({ ...p, _tone: healthTone(p) }));
    }
    const structuralSignature = (pipelines) => pipelines.map((p) => `${p.id}|${p.status}|${p.version}`).join(';');

    function collect() {
      const state = store.state;
      const plat = safe(() => psel.platform(state), null) || state.platform || {};
      const pipelines = collectPipelines(state, plat);
      const th = safe(() => psel.thresholds(state), null) || {};
      const sp = (state.settings && state.settings.platform) || {};
      const alertThreshold = num(th.alertThreshold, num(sp.alertThreshold, 60));
      const criticalThreshold = num(th.criticalThreshold, num(sp.criticalThreshold, 85));
      const range = num(store.filters && store.filters.range, 30);
      const since = now().getTime() - range * 86_400_000;
      const auditAll = arr(plat.auditLog).slice().sort((a, b) => (Date.parse(b.at) || 0) - (Date.parse(a.at) || 0));
      const audit = auditAll.filter((e) => (Date.parse(e.at) || 0) >= since);
      const actionCounts = audit.reduce((acc, e) => { acc[e.action] = (acc[e.action] || 0) + 1; return acc; }, {});
      const validation = safe(() => psel.validationSummary(state), null);
      return { state, plat, pipelines, alertThreshold, criticalThreshold, range, audit, auditAll, actionCounts, validation };
    }

    /* ───────────────────────── sections ───────────────────────── */

    function buildHead(data) {
      return h('div', { class: 'view-head' },
        h('div', { class: 'view-head-text' },
          h('span', { class: 'code-tag' }, 'PLT-01'),
          h('h1', { tabindex: '-1' }, t('engine.title')),
          h('p', { class: 'view-lead' }, t('engine.lead', { min: fmt.num(0), max: fmt.num(100) }))),
        h('div', { class: 'view-actions' },
          statusBadge(pipeStatus()),
          illustrative(),
          h('span', { class: 'text-sm muted' }, tn('engine.pipelinesCount', data.pipelines.length))));
    }
    function buildBanner() {
      return h('div', { class: ['note', 'is-demo'], role: 'note', style: { '--tone': 'var(--brand)' } },
        h('span', { class: 'row gap-2', style: { alignItems: 'flex-start' } }, svgIcon('flask', 16), h('span', {}, t('engine.banner'))));
    }

    function selectPipeline(id, { scroll = true } = {}) {
      activeId = String(id);
      pendingScroll = scroll ? 'pipelines' : null;
      schedule();
    }
    function scrollTo(target) {
      const id = { audit: 'engine-audit', pipelines: 'engine-pipelines', explain: 'engine-explain' }[target] || 'engine-pipelines';
      const el = root.querySelector(`#${id}`);
      if (!el) return;
      const smooth = motion && typeof motion.enabled === 'function' && motion.enabled();
      el.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto', block: 'start' });
      const focusEl = target === 'pipelines' ? el.querySelector('.pipe-tab[aria-selected="true"]') : el.querySelector('.card-title');
      if (focusEl) { if (!focusEl.hasAttribute('tabindex')) focusEl.setAttribute('tabindex', '-1'); try { focusEl.focus({ preventScroll: true }); } catch { /* ignore */ } }
    }

    const gateText = (validation) => (validation ? t('engine.map.gateValidation', { rate: fmt.pct(num(validation.passRatePct), 1) }) : t('engine.map.gateValidationPlain'));

    function buildMap(data) {
      const map = h('div', { class: 'pipeline-map', role: 'group', 'aria-label': t('engine.map.aria') });
      LAYERS.forEach((layer, i) => {
        const body = h('div', { class: 'pipeline-layer-body' });
        if (layer.engine) {
          data.pipelines.forEach((p) => {
            body.appendChild(h('button', { type: 'button', class: ['pipeline-node', 'is-model'], 'data-status': p.status || 'idle', onClick: () => selectPipeline(p.id) },
              svgIcon(PIPELINE_ICON[p.id] || 'sliders', 14),
              h('span', {}, pipeName(p)),
              h('span', { class: 'mono', dir: 'ltr' }, p.version || '—'),
              h('span', { class: 'sr-only' }, ` — ${t('engine.map.nodeAction')}`)));
          });
          if (!data.pipelines.length) body.appendChild(h('span', { class: 'pipeline-node' }, svgIcon('sliders', 14), h('span', {}, t('engine.map.none'))));
          body.appendChild(h('span', { class: 'pipeline-gate' }, svgIcon('sparkles', 12), h('span', {}, t('engine.map.gateEngine', { min: fmt.num(0), max: fmt.num(100) }))));
        } else {
          layer.nodes.forEach(([icon, key, latin]) => body.appendChild(h('span', { class: 'pipeline-node' }, svgIcon(icon, 14), key ? h('span', {}, t(`engine.map.nodes.${key}`)) : h('span', { dir: 'ltr' }, latin))));
          if (layer.gate) {
            live.gate = h('span', {}, gateText(data.validation));
            body.appendChild(h('span', { class: 'pipeline-gate' }, svgIcon('badge-check', 12), live.gate));
          }
        }
        map.appendChild(h('div', { class: ['pipeline-layer', layer.engine ? 'is-active' : null], 'data-layer': String(i + 1) },
          h('div', { class: 'pipeline-layer-head' },
            h('span', { class: 'pipeline-layer-index' }, t('engine.map.layer', { n: fmt.num(i + 1) })),
            h('h3', {}, t(`engine.map.layers.${layer.id}.title`)),
            h('p', {}, t(`engine.map.layers.${layer.id}.desc`, { min: fmt.num(0), max: fmt.num(100) }))),
          body));
        if (i < LAYERS.length - 1) map.appendChild(h('span', { class: 'pipeline-connector', 'aria-hidden': 'true' }));
      });
      return card({
        code: 'ENG-00', title: t('engine.map.title'), subtitle: t('engine.map.sub'),
        body: map,
        footer: h('p', { class: 'text-xs muted', style: { margin: 0 } }, t('engine.map.footer')),
      });
    }

    function featureBars(fi, p) {
      const max = fi.reduce((a, f) => Math.max(a, num(f.weight)), 0) || 1;
      return h('div', { class: 'feature-bars', role: 'list', 'aria-label': t('engine.pipes.fiAria', { name: pipeName(p) }) }, ...fi.map((f) => {
        const pct = asPct(f.weight);
        return h('div', { class: 'feature-bar', role: 'listitem' },
          h('span', { class: 'feature-bar-label', title: f.feature }, f.feature),
          h('div', { class: 'feature-bar-track', 'aria-hidden': 'true' }, h('div', { class: 'feature-bar-fill', style: { inlineSize: `${((num(f.weight) / max) * 100).toFixed(1)}%` } })),
          h('span', { class: 'feature-bar-value num' }, fmt.pct(pct, 0)));
      }));
    }

    function buildPipelinePanel(p) {
      const loc = i18n.localize(p, 'pipelines') || p;
      const name = pipeName(p);
      const precision = asPct(p.precision); const recall = asPct(p.recall);
      const calib = asPct(p.calibrationError); const drift = Math.max(0, Math.min(100, num(p.driftScore) * 100));
      const driftMeter = meter({ value: drift, label: t('engine.pipes.drift'), thresholds: [{ upTo: 20, tone: 'good' }, { upTo: 40, tone: 'warning' }, { upTo: 100, tone: 'critical' }], format: (v) => fmt.num(v / 100, { maximumFractionDigits: 2, minimumFractionDigits: 2 }) });
      live.drift = driftMeter;
      const meters = h('div', { class: 'engine-meters' },
        meter({ value: precision, label: t('engine.pipes.precision'), thresholds: [{ upTo: 74.99, tone: 'critical' }, { upTo: 84.99, tone: 'warning' }, { upTo: 100, tone: 'good' }], format: (v) => fmt.pct(v, 1) }).el,
        meter({ value: recall, label: t('engine.pipes.recall'), thresholds: [{ upTo: 74.99, tone: 'critical' }, { upTo: 84.99, tone: 'warning' }, { upTo: 100, tone: 'good' }], format: (v) => fmt.pct(v, 1) }).el,
        meter({ value: calib, max: 25, label: t('engine.pipes.ece'), thresholds: [{ upTo: 5, tone: 'good' }, { upTo: 10, tone: 'warning' }, { upTo: 25, tone: 'critical' }], format: (v) => fmt.pct(v, 1) }).el,
        driftMeter.el);
      live.meta = {
        lastRun: h('span', { title: riyadhDateTime(fmt, p.lastRun) }, relSafe(p.lastRun)),
        runs: mono(fmt.num(num(p.runsToday))),
        latency: mono(msText(p.avgLatencyMs)),
        risks: mono(fmt.num(num(p.risksLast30d))),
      };
      const meta = h('div', { class: 'engine-meta' },
        ...[
          [t('engine.pipes.version'), h('span', { class: 'mono', dir: 'ltr' }, p.version || '—')],
          [t('engine.pipes.lastRun'), live.meta.lastRun],
          [t('engine.pipes.runsToday'), live.meta.runs],
          [t('engine.pipes.latency'), live.meta.latency],
          [t('engine.pipes.risks30', { n: fmt.num(30) }), live.meta.risks],
        ].map(([label, value]) => h('div', { class: 'engine-meta-cell' }, h('span', { class: 'engine-meta-label' }, label), h('span', { class: 'engine-meta-value' }, value))));

      const fiLoc = arr(loc.featureImportance);
      const fi = arr(p.featureImportance).map((f, i) => ({ ...f, feature: digitsIn(fmt, (fiLoc[i] && fiLoc[i].feature) || f.feature) })).sort((a, b) => num(b.weight) - num(a.weight)).slice(0, 6);
      const fiChart = fi.length ? makeChart('barChart', { items: fi.map((f, i) => ({ id: `${p.id}-f${i}`, label: f.feature, value: Number(asPct(f.weight).toFixed(1)) })), horizontal: true, height: fi.length * 28 + 24, valueFormat: (v) => fmt.pct(v, 0), color: 'var(--s1)', showValues: true, maxBars: 6, ariaLabel: t('engine.pipes.fiAria', { name }) }) : null;
      const fiFold = h('details', { class: 'engine-fold', open: openFi.has(p.id), onToggle: (e) => { if (e.target.open) openFi.add(p.id); else openFi.delete(p.id); } },
        h('summary', {}, h('span', {}, t('engine.pipes.fi')), h('span', { class: 'text-xs muted' }, tn('engine.pipes.fiCount', fi.length)), illustrative()),
        h('div', { class: 'stack gap-2', style: { paddingBlockStart: '6px' } }, fiChart ? fiChart.el : (fi.length ? featureBars(fi, p) : emptyState({ title: t('engine.pipes.fiEmpty') }))));

      const acc = Math.max(0, Math.min(100, num(p.acceptanceRatePct)));
      const segParts = [{ id: 'accept', label: `${t('engine.pipes.accept')} · ${fmt.pct(acc, 0)}`, value: Number(acc.toFixed(1)), color: 'var(--s1)' }, { id: 'override', label: `${t('engine.pipes.override')} · ${fmt.pct(100 - acc, 0)}`, value: Number((100 - acc).toFixed(1)), color: 'var(--s2)' }];
      // Thin bar: values live in the legend (no text drawn on the coloured fill).
      const seg = makeChart('segmentedBar', { parts: segParts, tall: false, valueFormat: (v) => fmt.pct(v, 0), ariaLabel: t('engine.pipes.hitlAria', { name }) });

      const krisLoc = arr(loc.kris);
      const kris = arr(p.kris).map((k, i) => ({ ...k, ...(krisLoc[i] || {}) }));
      const kriTable = dataTable({ dense: true, pageSize: 0, stickyFirst: true, emptyText: t('engine.pipes.kriEmpty'), caption: t('engine.pipes.kriCaption', { name }), columns: [
        { key: 'indicator', label: t('engine.pipes.kriIndicator'), sortable: false, priority: 'high', render: (r) => h('span', { class: 'semibold' }, digitsIn(fmt, r.indicator || '—')) },
        { key: 'technique', label: t('engine.pipes.kriTechnique'), sortable: false, priority: 'medium', render: (r) => digitsIn(fmt, r.technique || '—') },
        { key: 'inputs', label: t('engine.pipes.kriInputs'), sortable: false, priority: 'low', render: (r) => digitsIn(fmt, Array.isArray(r.inputs) ? r.inputs.join(' · ') : (r.inputs || '—')) },
        { key: 'mitigation', label: t('engine.pipes.kriMitigation'), sortable: false, priority: 'medium', render: (r) => digitsIn(fmt, r.mitigation || '—') },
      ], rows: kris.map((k, i) => ({ id: `${p.id}-k${i}`, ...k })) });
      kriTable.table.classList.add('kri-table');
      const kriFold = h('details', { class: 'engine-fold', open: openKri.has(p.id), onToggle: (e) => { if (e.target.open) openKri.add(p.id); else openKri.delete(p.id); } },
        h('summary', {}, h('span', {}, t('engine.pipes.kri')), h('span', { class: 'text-xs muted' }, tn('engine.pipes.kriCount', kris.length))),
        kriTable.el);

      const techniques = arr(loc.techniques);
      const reasonId = `eng-disabled-${p.id}`;
      const actions = h('div', { class: 'eng-disabled' },
        button(t('engine.pipes.retrain'), { variant: 'outline', size: 'sm', icon: 'refresh', attrs: { disabled: true, 'aria-describedby': reasonId } }),
        button(t('engine.pipes.pause'), { variant: 'ghost', size: 'sm', icon: 'pause', attrs: { disabled: true, 'aria-describedby': reasonId } }),
        h('span', { class: 'eng-disabled-reason', id: reasonId }, svgIcon('lock', 13), h('span', {}, t('engine.pipes.disabledReason'))),
        button(t('engine.pipes.detected'), { variant: 'ghost', size: 'sm', icon: 'shield-alert', onClick: () => router.navigate('airisks', { pipeline: p.id }) }));

      return {
        panel: h('div', { class: 'stack gap-4', role: 'tabpanel', id: `pipe-${p.id}`, 'aria-labelledby': `pipe-tab-${p.id}`, tabindex: '0' },
          h('div', { class: 'eng-panel-head' },
            h('div', { class: 'eng-panel-title' },
              h('strong', {}, name),
              en() ? null : h('span', { class: 'text-xs muted', lang: 'en', dir: 'ltr' }, p.name || ''),
              loc.description ? h('p', {}, digitsIn(fmt, loc.description)) : null),
            h('div', { class: 'eng-state' },
              statusBadge(pipeStatus(), { size: 'sm' }),
              h('span', {}, `${t('engine.pipes.scenarioState')}: ${i18n.label('pipelineStatus', p.status)}`))),
          meta,
          techniques.length ? h('ul', { class: 'engine-techniques', 'aria-label': t('engine.pipes.techniques') }, ...techniques.map((x) => h('li', {}, svgIcon('sparkles', 12), h('span', {}, digitsIn(fmt, String(x)))))) : null,
          h('div', { class: 'stack gap-2' },
            h('div', { class: 'eng-metrics-head' }, h('span', { class: 'text-sm semibold' }, t('engine.pipes.metricsTitle')), illustrative()),
            meters,
            h('p', { class: 'text-xs muted', style: { margin: 0 } }, t('engine.pipes.metricsNote'))),
          h('div', { class: 'stack gap-2' },
            h('div', { class: 'row between wrap' }, h('span', { class: 'text-sm semibold' }, t('engine.pipes.hitl')), h('span', { class: 'text-xs muted' }, t('engine.pipes.hitlNote', { overrides: fmt.num(num(p.overridesLast30d)), risks: fmt.num(num(p.risksLast30d)), days: fmt.num(30) }))),
            seg ? seg.el : simpleTable([t('engine.pipes.accept'), t('engine.pipes.override')], [[fmt.pct(segParts[0].value, 0), fmt.pct(segParts[1].value, 0)]])),
          fiFold,
          kriFold),
        actions,
        tableView: fi.length ? () => simpleTable([t('engine.pipes.fiFeature'), t('engine.pipes.fiWeight')], fi.map((f) => [f.feature, fmt.pct(asPct(f.weight), 1)])) : null,
      };
    }

    function buildPipelines(data) {
      live.tabs = new Map(); live.meta = null; live.drift = null;
      if (!data.pipelines.length) return card({ id: 'engine-pipelines', code: 'ENG-01', title: t('engine.pipes.title'), className: 'eng-anchor', body: emptyState({ title: t('engine.pipes.emptyTitle'), text: t('engine.pipes.emptyText') }) });
      if (!activeId || !data.pipelines.some((p) => String(p.id) === activeId)) activeId = String(data.pipelines[0].id);
      const active = data.pipelines.find((p) => String(p.id) === activeId);
      const tabs = h('div', { class: 'pipe-tabs', role: 'tablist', 'aria-label': t('engine.pipes.tabsAria') });
      data.pipelines.forEach((p) => {
        const selected = String(p.id) === activeId;
        const tab = h('button', { type: 'button', role: 'tab', id: `pipe-tab-${p.id}`, class: 'pipe-tab', 'aria-selected': selected ? 'true' : 'false', 'aria-controls': `pipe-${p.id}`, tabindex: selected ? '0' : '-1', 'data-id': String(p.id), onClick: () => { if (String(p.id) !== activeId) selectPipeline(p.id, { scroll: false }); } },
          svgIcon(PIPELINE_ICON[p.id] || 'sliders', 14), h('span', {}, pipeName(p)), h('span', { class: 'mono', dir: 'ltr' }, p.version || ''));
        live.tabs.set(String(p.id), { tab });
        tabs.appendChild(tab);
      });
      tabs.addEventListener('keydown', (e) => {
        const rtl = i18n.dir() === 'rtl';
        const nextKey = rtl ? 'ArrowLeft' : 'ArrowRight';
        const prevKey = rtl ? 'ArrowRight' : 'ArrowLeft';
        if (![nextKey, prevKey, 'Home', 'End'].includes(e.key)) return;
        const ids = data.pipelines.map((p) => String(p.id));
        let idx = ids.indexOf(activeId);
        if (e.key === nextKey) idx = (idx + 1) % ids.length;
        else if (e.key === prevKey) idx = (idx - 1 + ids.length) % ids.length;
        else if (e.key === 'Home') idx = 0; else idx = ids.length - 1;
        e.preventDefault();
        activeId = ids[idx];
        pendingScroll = null; pendingFocusTab = true;
        schedule();
      });
      const built = buildPipelinePanel(active);
      const el = card({
        id: 'engine-pipelines', code: 'ENG-01', title: t('engine.pipes.title'), subtitle: t('engine.pipes.sub'), className: 'eng-anchor',
        actions: [statusBadge(pipeStatus(), { size: 'sm' })],
        body: h('div', { class: 'stack gap-4' }, tabs, built.panel),
        footer: built.actions,
        tableView: built.tableView,
      });
      live.pipelinesCard = el;
      return el;
    }

    /** Pipeline jitter: patch the expanded card's meta and drift meter in place; rebuild only on structural change. */
    function patchPipelines() {
      const state = store.state;
      const plat = safe(() => psel.platform(state), null) || state.platform || {};
      const pipelines = collectPipelines(state, plat);
      if (structuralSignature(pipelines) !== live.signature || !live.pipelinesCard || !live.pipelinesCard.isConnected) { schedule(); return; }
      const p = pipelines.find((x) => String(x.id) === activeId);
      if (p && live.meta) {
        setText(live.meta.lastRun, relSafe(p.lastRun)); live.meta.lastRun.title = riyadhDateTime(fmt, p.lastRun);
        setText(live.meta.runs, fmt.num(num(p.runsToday)));
        setText(live.meta.latency, msText(p.avgLatencyMs));
        setText(live.meta.risks, fmt.num(num(p.risksLast30d)));
        if (live.drift) live.drift.set(Math.max(0, Math.min(100, num(p.driftScore) * 100)));
      }
    }

    function ratingChip(text, rating, tone) {
      const b = badge(text, tone);
      b.classList.add('rating', `is-${rating}`);
      return b;
    }
    function goSettings(section) { if (router && typeof router.navigate === 'function') router.navigate('settings', { section }); }

    function buildExplainability(data) {
      const n = (x) => fmt.num(x);
      const p = { min: n(1), max: n(5), k: n(4), low: n(4), high: n(100), red: n(70), amberMin: n(40), amberMax: n(69), alert: n(data.alertThreshold), critical: n(data.criticalThreshold) };
      const steps = ['s1', 's2', 's3', 's4', 's5'].map((s) => [t(`engine.explain.steps.${s}.title`), t(`engine.explain.steps.${s}.text`, p)]);
      return card({
        id: 'engine-explain', code: 'ENG-06', title: t('engine.explain.title'), subtitle: t('engine.explain.sub'), className: 'eng-anchor',
        body: h('div', { class: 'stack gap-4' },
          h('ol', { class: 'explain-steps' }, ...steps.map(([title, text]) => h('li', {}, h('div', { class: 'stack', style: { gap: '2px' } }, h('span', { class: 'text-sm semibold' }, title), h('span', { class: 'text-xs ink-2', style: { lineHeight: '1.6' } }, text))))),
          h('div', { class: 'row wrap gap-2', role: 'group', 'aria-label': t('engine.explain.bandsAria') },
            ratingChip(t('engine.explain.red', { n: n(70) }), 'red', 'critical'),
            ratingChip(t('engine.explain.yellow', { min: n(40), max: n(69) }), 'yellow', 'warning'),
            ratingChip(t('engine.explain.green', { n: n(40) }), 'green', 'good')),
          h('div', { class: 'note', style: { '--tone': 'var(--brand)' } },
            h('div', { class: 'row between wrap gap-2' },
              h('span', {}, h('strong', {}, t('engine.explain.current')), ' ', t('engine.explain.currentText', { alert: n(data.alertThreshold), critical: n(data.criticalThreshold) })),
              h('span', { class: 'row wrap gap-2' },
                button(t('engine.explain.editThresholds'), { variant: 'outline', size: 'sm', icon: 'bell', onClick: () => goSettings('thresholds') }),
                button(t('engine.explain.editWeights'), { variant: 'ghost', size: 'sm', icon: 'sliders', onClick: () => goSettings('weights') }))))),
      });
    }

    function buildTrio() {
      const item = (icon, title, text) => h('li', {}, h('span', { class: 'eng-trio-icon', 'aria-hidden': 'true' }, svgIcon(icon, 16)), h('div', { class: 'stack', style: { gap: '4px' } }, h('p', { class: 'eng-trio-title' }, title), h('p', { class: 'eng-trio-text' }, text)));
      return card({
        code: 'ENG-05', title: t('engine.trio.title'), subtitle: t('engine.trio.sub'),
        body: h('ul', { class: 'eng-trio' },
          item('alert', t('engine.trio.severity'), t('engine.trio.severityText', { k: fmt.num(4) })),
          item('sparkles', t('engine.trio.confidence'), t('engine.trio.confidenceText')),
          item('badge-check', t('engine.trio.quality'), t('engine.trio.qualityText'))),
        footer: h('div', {}, button(t('engine.trio.openQuality'), { variant: 'ghost', size: 'sm', icon: 'badge-check', onClick: () => router.navigate('dataquality', { section: 'quality' }) })),
      });
    }

    function buildAudit(data) {
      const rows = auditFilter === 'all' ? data.audit : data.audit.filter((e) => e.action === auditFilter);
      const chips = h('div', { class: 'chip-group chips is-scroll', role: 'group', 'aria-label': t('engine.audit.filterAria') },
        h('button', { type: 'button', class: ['chip', 'is-sm', auditFilter === 'all' ? 'is-active' : null], 'aria-pressed': auditFilter === 'all' ? 'true' : 'false', onClick: () => { auditFilter = 'all'; refreshAudit(); } }, h('span', {}, t('engine.audit.all')), h('span', { class: 'chip-count' }, fmt.num(data.audit.length))),
        ...Object.keys(data.actionCounts).sort((a, b) => data.actionCounts[b] - data.actionCounts[a]).map((k) => {
          const tone = ACTION_TONE[k] || 'neutral';
          return h('button', { type: 'button', class: ['chip', 'is-sm', `tone-${tone}`, auditFilter === k ? 'is-active' : null], 'aria-pressed': auditFilter === k ? 'true' : 'false', onClick: () => { auditFilter = k; refreshAudit(); } }, glyph(tone, 12), h('span', {}, i18n.label('auditAction', k)), h('span', { class: 'chip-count' }, fmt.num(data.actionCounts[k])));
        }));
      const days = fmt.num(data.range);
      const table = dataTable({
        dense: true, pageSize: 8, stickyFirst: true, emptyText: t('engine.audit.empty', { days }), caption: t('engine.audit.caption'),
        columns: [
          { key: 'at', label: t('engine.audit.at'), priority: 'high', render: (e) => h('span', { class: 'text-xs nowrap', title: riyadhDateTime(fmt, e.at) }, riyadhDateTime(fmt, e.at)), sortValue: (e) => Date.parse(e.at) || 0 },
          { key: 'actor', label: t('engine.audit.actor'), priority: 'low', render: (e) => brand(i18n.term(e.actor || '') || '—') },
          { key: 'action', label: t('engine.audit.action'), priority: 'high', render: (e) => h('span', { class: 'row gap-1 wrap' }, badge(i18n.label('auditAction', e.action) || '—', ACTION_TONE[e.action] || 'neutral'), e.simulated ? h('span', { class: 'sim-tag' }, t('engine.audit.simulated')) : null) },
          { key: 'target', label: t('engine.audit.target'), priority: 'medium', render: (e) => h('span', { class: 'row gap-1 wrap' }, ...withCodes(auditTarget(e))) },
          { key: 'detail', label: t('engine.audit.detail'), priority: 'medium', sortable: false, render: (e) => h('span', { class: 'text-sm' }, ...withCodes(auditDetail(e))) },
        ],
        rows: rows.map((e, i) => ({ id: e.id || `a-${i}`, ...e })), initialSort: { key: 'at', dir: 'desc' },
      });
      const el = card({
        id: 'engine-audit', code: 'ENG-07', title: t('engine.audit.title'), subtitle: tn('engine.audit.sub', data.audit.length, { days }), className: 'eng-anchor',
        actions: [h('span', { class: 'text-sm muted' }, tn('engine.audit.total', data.auditAll.length))],
        body: h('div', { class: 'stack gap-3' }, chips, table.el),
      });
      live.audit = el;
      return el;
    }
    function refreshAudit() {
      if (raf) return;
      if (!live.audit || !live.audit.isConnected) { schedule(); return; }
      const next = buildAudit(collect());
      live.audit.replaceWith(next);
      live.audit = next;
    }

    /* ───────────────────────── build ───────────────────────── */

    function build() {
      raf = 0;
      const data = collect();
      live.signature = structuralSignature(data.pipelines);
      const sections = [buildBanner(), buildMap(data), buildPipelines(data), buildExplainability(data), buildTrio(), buildAudit(data)];
      root.replaceChildren(buildHead(data), ...sections);
      if (firstPaint && motion && typeof motion.enter === 'function') motion.enter(sections, { y: 8, stagger: 0.032 });
      firstPaint = false;
      if (pendingFocusTab) {
        pendingFocusTab = false;
        const ref = live.tabs.get(activeId);
        if (ref) { try { ref.tab.focus({ preventScroll: true }); } catch { /* ignore */ } }
      }
      if (pendingScroll) {
        const target = pendingScroll; pendingScroll = null;
        requestAnimationFrame(() => scrollTo(target));
        try { if (/^#\/engine\?/.test(location.hash || '')) history.replaceState(history.state, '', router && typeof router.href === 'function' ? router.href('engine') : '#/engine'); } catch { /* ignore */ }
      }
    }
    function schedule() { if (!raf) raf = requestAnimationFrame(build); }

    const unsubs = [
      bus.on('store:change', (payload) => {
        const path = payload && payload.path ? String(payload.path) : '*';
        if (path === '*') { schedule(); return; }
        if (/^settings/.test(path)) return;
        if (!/^platform\./.test(path)) return;
        if (/^platform\.pipelines/.test(path)) { if (!raf) patchPipelines(); return; }
        if (/^platform\.validation/.test(path)) { if (!raf && live.gate) setText(live.gate, gateText(safe(() => psel.validationSummary(store.state), null))); return; }
        if (/^platform\.auditLog/.test(path)) refreshAudit();
      }),
      bus.on('filters:change', (payload) => { const key = payload && payload.key; if (!key || key === 'range') schedule(); }),
      bus.on('settings:change', () => schedule()),
    ];

    build();

    return () => {
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      unsubs.forEach((u) => { try { if (typeof u === 'function') u(); } catch { /* ignore */ } });
      root.remove();
    };
  },
};
