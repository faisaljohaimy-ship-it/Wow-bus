/**
 * BILTIX Risk AI — view: schedule risk (js/views/schedule.js) — DOM-03. Owner: B-DOMAINS (v3 Precision).
 *
 * Schedule-model domain: v3 heading (scope, freshness, source status), four executive metrics,
 * critical-path slippage, Monte Carlo finish dates (P50/P80/P90), resource utilisation, a 7-day weather
 * delay outlook (simulated), regulatory approvals with escalation, subcontractor performance, the open
 * AI risks of the `schedule` domain (shared risk drawer) and the pipeline's KRI matrix. Per-project
 * widgets show the default project (S1) while "All projects" is selected and say so.
 *
 * Language: js/i18n/schedule.js (namespace 'schedule', shared block `schedule.dom.*`); data through
 * i18n.L / localize, enums through i18n.label, organisations through i18n.term. Nothing translated is
 * cached at module level. Live updates rebuild in place (table state, focus, scroll kept; changes flash).
 * Counts come from psel (criticalPathSlippage, approvalsAtRisk, resourceUtilization, …) with fallbacks.
 */

import { i18n } from '../core/i18n.js';
import dict from '../i18n/schedule.js';

i18n.register('schedule', dict);

const NS = 'schedule';
const DAY_MS = 86_400_000;
const CATEGORY = 'schedule';
const PIPELINE_ID = 'schedule-model';
const SOURCE_CONNECTORS = ['biltix-schedule', 'primavera-p6', 'feed-weather-ncm'];
const FALLBACK_PROJECT = 'S1';
const APPROVAL_RISK_RATIO = 0.8;
const HIGH_DELAY_PROB = 0.5;
const SUBS_DEFAULT = 5;
/** Stored owner value when a project has no manager on record (Arabic data, mirrored in terms). */
const DEFAULT_OWNER = 'مدير المشروع';

const RATING_TONE = { red: 'critical', yellow: 'warning', green: 'good' };
const TYPE_ICON = { Financial: 'chart', Safety: 'helmet', Delay: 'calendar', Conflict: 'shield-alert' };
const RISK_STATUS_TONE = { 'مكتشف': 'neutral', 'تنبيه': 'warning', 'مهمة مُسندة': 'brand', 'قيد المعالجة': 'accent', 'مغلق': 'good', 'مُتجاوز': 'neutral' };
const APPROVAL_STATUS_TONE = { 'قيد المعالجة': 'brand', 'معتمد': 'good', 'متأخر': 'critical', 'مطلوب استكمال': 'warning' };
const DUST_TONE = { 'منخفض': 'good', 'متوسط': 'warning', 'عالٍ': 'critical' };
const CLOSED_RISK = new Set(['مغلق', 'مُتجاوز']);
const OPEN_TASK = new Set(['جديدة', 'قيد التنفيذ', 'متأخرة']);

const V = '.view-schedule';
const STYLE_ID = 'view-schedule-style';
const STYLE_TEXT = `
${V} .dom-meta { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 16px; font-size: var(--fs-sm); color: var(--ink-3); }
${V} .dom-meta-item { display: inline-flex; align-items: center; flex-wrap: wrap; gap: 6px; min-inline-size: 0; }
${V} .dom-meta-item > svg { flex: none; color: var(--ink-3); }
${V} .dom-meta-item.is-source { display: block; line-height: 1.7; }
${V} .dom-meta-item.is-source > svg { display: inline-block; vertical-align: -2px; margin-inline-end: 6px; }
${V} .dom-meta-item.is-source > .status-badge { margin-inline-start: 6px; }
${V} .dom-row { display: grid; grid-template-columns: minmax(0, 1fr); gap: var(--gap); align-items: start; }
@container main (min-width: 761px) {
  ${V} .dom-row.is-2-1 { grid-template-columns: minmax(0, 2fr) minmax(0, 1fr); }
  ${V} .dom-row.is-1-1 { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
${V} .dom-stats { display: flex; flex-wrap: wrap; gap: 10px 28px; margin: 0 0 var(--space-4); }
${V} .dom-stat { display: flex; flex-direction: column; gap: 2px; min-inline-size: 0; }
${V} .dom-stat dt { font-size: var(--fs-xs); color: var(--ink-3); }
${V} .dom-stat dd { margin: 0; font-size: var(--fs-lg); font-weight: 600; color: var(--ink-1); font-variant-numeric: tabular-nums; white-space: nowrap; }
${V} .code { font-family: var(--font-mono); font-variant-numeric: tabular-nums; unicode-bidi: isolate; white-space: nowrap; }
${V} .li-pos { font-family: var(--font-mono); font-size: 11px; color: var(--ink-3); unicode-bidi: isolate; }
${V} .cell-stack { display: flex; flex-direction: column; gap: 3px; min-inline-size: 0; }
${V} .cell-sub { font-size: var(--fs-xs); color: var(--ink-3); line-height: 1.45; }
${V} .cell-stack > .cell-code { align-self: flex-start; font-size: var(--fs-xs); color: var(--ink-2); }
${V} .cell-sub.row { display: flex; flex-wrap: wrap; align-items: center; gap: 2px 8px; }
${V} .score-cell { display: inline-flex; align-items: center; gap: 8px; white-space: nowrap; }
${V} .score-cell .t-num { font-weight: 600; font-variant-numeric: tabular-nums; }
${V} .prob-row { display: grid; grid-template-columns: minmax(70px, 1fr) auto; align-items: center; gap: 8px; min-inline-size: 120px; }
${V} .prob-row .progress-value { font-family: var(--font-mono-mixed); font-size: var(--fs-xs); color: var(--ink-2); min-inline-size: 3.2em; text-align: end; }
${V} .ws-icon { display: inline-flex; vertical-align: middle; margin-inline-start: 6px; color: var(--warning-text); }
${V} .urgent-item.is-compact { grid-template-columns: minmax(0, 1fr) auto; padding-block: 8px; }
${V} .urgent-item.is-compact > .urgent-icon { display: none; }
${V} .urgent-item.is-compact .urgent-due { align-items: flex-end; }
${V} .gap-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 240px), 1fr)); gap: 8px; }
${V} .weather-strip { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); gap: 10px; }
${V} .weather-day { display: flex; flex-direction: column; gap: 6px; }
${V} .weather-day .wrow { display: flex; justify-content: space-between; align-items: center; gap: 6px; font-size: var(--fs-sm); }
${V} .weather-day .wrow > :first-child { color: var(--ink-3); }
@container main (max-width: 1100px) { ${V} .weather-strip { grid-template-columns: repeat(4, minmax(0, 1fr)); } }
@container main (max-width: 560px) { ${V} .weather-strip { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
${V} .mc-timeline { position: relative; block-size: 66px; margin-block: 4px 2px; }
${V} .mc-track { position: absolute; inset-inline: 0; inset-block-start: 27px; block-size: 6px; border-radius: 3px; background: var(--bg-3); }
${V} .mc-fill { position: absolute; inset-block-start: 27px; block-size: 6px; border-radius: 3px; background: color-mix(in srgb, var(--warning) 55%, transparent); }
${V} .mc-mark { position: absolute; inset-block-start: 19px; transform: translateX(-50%); display: flex; flex-direction: column; align-items: center; gap: 3px; font-size: 11px; color: var(--ink-2); }
${V} .mc-dot { inline-size: 14px; block-size: 14px; border-radius: 50%; border: 2px solid var(--bg-1); background: var(--tone, var(--brand)); box-shadow: 0 0 0 1px var(--line); }
${V} .mc-label { white-space: nowrap; display: flex; flex-direction: column; align-items: center; line-height: 1.3; }
${V} .mc-label strong { color: var(--ink-1); font-family: var(--font-mono-mixed); }
${V} .mc-mark.is-planned { inset-block-start: 0; flex-direction: column-reverse; }
${V} .mc-mark.is-planned .mc-dot { inline-size: 2px; block-size: 36px; border-radius: 1px; border: 0; background: var(--ink-3); box-shadow: none; }
${V} .kri-wrap[hidden] { display: none; }
${V} .chev { transition: transform var(--dur-micro) var(--ease-out); }
${V} [aria-expanded="true"] .chev { transform: rotate(180deg); }
@media (prefers-reduced-motion: reduce) { ${V} .chev { transition: none; } }
`;

/** UI state that survives re-renders inside one visit (no strings). */
let kriOpen = false;
let subsExpanded = false;
let riskDrawerFailed = false;

const LATIN_NUM_TOKEN = /[A-Za-z][A-Za-z0-9._-]*\d[A-Za-z0-9._-]*|\d+[A-Za-z][A-Za-z0-9._-]*/g;
const CODE_RE = /\b[A-Z]{1,5}-[A-Z0-9-]*\d[A-Z0-9-]*\b/g;
const safe = (fn, fallback) => { try { const v = fn(); return v === undefined ? fallback : v; } catch { return fallback; } };
const lower = (v) => String(v ?? '').toLowerCase();
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const clamp01 = (v) => Math.max(0, Math.min(1, num(v)));
const fill = (tpl, params) => String(tpl ?? '').replace(/\{(\w+)\}/g, (m, k) => (params && params[k] !== undefined && params[k] !== null ? String(params[k]) : m));
const escapeRe = (x) => String(x).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const hasToken = (hay, needle) => new RegExp(`(^|[^A-Za-z0-9])${escapeRe(needle)}(?![A-Za-z0-9])`, 'i').test(hay);

function ensureStyle() {
  if (typeof document === 'undefined' || document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = STYLE_TEXT;
  document.head.appendChild(style);
}

export default {
  id: 'schedule',
  code: 'DOM-03',
  get title() { return i18n.t('core.nav.schedule.title'); },
  icon: 'calendar',

  render(container, ctx) {
    const { store, bus, fmt, charts, components, router } = ctx;
    const psel = ctx.psel || null;
    const statusApi = ctx.status || null;
    const motion = ctx.motion || components.motion || null;
    const { h, card, badge, dataTable, button, drawer, toast, emptyState, errorState, progress, svgIcon, glyph, kv, statusBadge } = components;

    const t = (k, p) => i18n.t(`${NS}.${k}`, p);
    const tn = (k, n, p) => i18n.tn(`${NS}.${k}`, n, p);
    const L = (rec, field, ns) => i18n.L(rec, field, ns);
    const term = (s) => (s ? i18n.term(String(s)) : s);
    const label = (ns, v) => i18n.label(ns, v);
    const isEn = () => i18n.lang() === 'en';
    const psf = (name, ...args) => (psel && typeof psel[name] === 'function' ? safe(() => psel[name](...args), null) : null);

    ensureStyle();
    const root = h('section', { class: 'view view-schedule' });
    container.appendChild(root);

    let raf = 0;
    let built = false;
    let resetPages = false;
    let openDrawer = null;
    let lastNumerals = safe(() => store.state.settings.numerals, 'latn');
    const tableStates = new Map();
    const tables = new Map();
    const rowSigs = new Map();
    const tileVals = new Map();
    let pendingFlash = [];

    /* ───────────────────────── primitives ───────────────────────── */

    function digitsIn(value) {
      const s = String(value ?? '');
      if (typeof fmt.digits !== 'function' || !/\d/.test(s)) return s;
      let out = ''; let last = 0; let m;
      LATIN_NUM_TOKEN.lastIndex = 0;
      while ((m = LATIN_NUM_TOKEN.exec(s))) { out += fmt.digits(s.slice(last, m.index)) + m[0]; last = m.index + m[0].length; }
      return out + fmt.digits(s.slice(last));
    }
    const codeSpan = (code, extra = null) => h('span', { class: ['code', 'mono', extra], dir: 'ltr', translate: 'no' }, String(code ?? '—'));
    function withCodes(str) {
      const s = String(str ?? ''); const out = []; let last = 0; let m;
      CODE_RE.lastIndex = 0;
      while ((m = CODE_RE.exec(s))) { if (m.index > last) out.push(digitsIn(s.slice(last, m.index))); out.push(codeSpan(m[0])); last = m.index + m[0].length; }
      if (last < s.length) out.push(digitsIn(s.slice(last)));
      return out.length ? out : [digitsIn(s)];
    }
    const nowDate = () => (typeof store.now === 'function' ? store.now() : new Date());
    const startOfToday = () => { const d = nowDate(); d.setHours(0, 0, 0, 0); return d; };
    const daysBetween = (a, b) => { const da = fmt.toDate(a); const db = fmt.toDate(b); if (!da || !db) return null; da.setHours(0, 0, 0, 0); db.setHours(0, 0, 0, 0); return Math.round((db.getTime() - da.getTime()) / DAY_MS); };
    const isoPlusDays = (days) => { const d = startOfToday(); d.setDate(d.getDate() + days); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
    const siteOf = (state, id) => (state.sites || []).find((x) => x && x.id === id) || null;
    const siteName = (state, id) => { const s = siteOf(state, id); return digitsIn(s ? L(s, 'name', 'sites') : (id || '—')); };
    const days = (n) => tn('dom.days', Math.abs(num(n)));

    function ratingOf(score) {
      const r = psf('rating', num(score));
      if (r && RATING_TONE[r]) return r;
      const s = num(score);
      return s >= 70 ? 'red' : s >= 40 ? 'yellow' : 'green';
    }
    function ratingBadge(score) {
      const r = ratingOf(score);
      const b = badge(i18n.t(`core.rating.${r}`), RATING_TONE[r]);
      b.classList.add('rating', `is-${r}`);
      b.dataset.rating = r;
      b.title = label('ratingHint', r);
      return b;
    }
    function scoreCell(score, risk = null) {
      const cell = h('span', { class: 'score-cell' }, h('span', { class: 't-num mono' }, fmt.num(num(score))), ratingBadge(score));
      if (risk && num(risk.likelihood) && num(risk.impact)) {
        const p = { l: fmt.num(num(risk.likelihood)), i: fmt.num(num(risk.impact)) };
        cell.appendChild(h('span', { class: 'li-pos', dir: 'ltr', title: t('dom.liTitle', p), 'aria-label': t('dom.liTitle', p) }, t('dom.li', p)));
      }
      return cell;
    }
    const typeChip = (type) => h('span', { class: ['type-chip', type ? `is-${lower(type)}` : null], 'data-type': type || undefined }, svgIcon(TYPE_ICON[type] || 'calendar', 12), h('span', {}, label('aiType', type) || '—'));
    const enumBadge = (ns, value, tones, fallback = 'neutral') => badge(label(ns, value) || '—', tones[value] || fallback);
    const probTone = (p) => (p >= 0.7 ? 'critical' : p >= HIGH_DELAY_PROB ? 'serious' : p >= 0.3 ? 'warning' : 'good');
    const riskTone = (p) => (p >= 0.6 ? 'critical' : p >= 0.3 ? 'warning' : 'good');
    const rainPct = (v) => { const n = num(v); return n > 0 && n < 1 && !Number.isInteger(n) ? Math.round(n * 100) : Math.round(n); };
    function probMeter(p, aria) {
      const pct = Math.round(clamp01(p) * 100);
      return h('div', { class: ['prob-row', `tone-${probTone(clamp01(p))}`] }, progress({ value: pct, max: 100, tone: probTone(clamp01(p)), label: aria }), h('span', { class: 'progress-value' }, fmt.pct(pct)));
    }
    function ratioMeter(elapsed, statutory, aria) {
      const e = num(elapsed); const s = Math.max(1, num(statutory));
      const ratio = e / s;
      const tone = ratio >= 1 ? 'critical' : ratio >= APPROVAL_RISK_RATIO ? 'warning' : 'good';
      return h('div', { class: 'cell-stack' }, progress({ value: Math.min(e, s), max: s, tone, label: aria }), h('span', { class: 'cell-sub nowrap' }, t('approvals.ratio', { elapsed: fmt.num(e), statutory: days(s) })));
    }
    const slipBadge = (slip) => (slip !== null && slip !== 0 ? badge(slip > 0 ? t('critical.slip', { days: days(slip) }) : t('critical.early', { days: days(slip) }), slip > 14 ? 'critical' : slip > 0 ? 'warning' : 'good') : badge(t('critical.onBaseline'), 'good'));

    function makeChart(name, opts) {
      if (!charts || typeof charts[name] !== 'function') return null;
      try { const c = charts[name](opts); return c && c.el instanceof Node ? c : null; } catch (err) { console.warn(`[schedule] charts.${name}`, err); return null; }
    }
    const chartTable = (chart, fallback) => () => ((chart && typeof chart.table === 'function' && safe(() => chart.table(), null)) || fallback());
    function simpleTable(caption, headers, rows) {
      const tbl = h('table', { class: 'table is-dense' }, h('caption', { class: 'sr-only' }, caption));
      tbl.appendChild(h('thead', {}, h('tr', {}, ...headers.map((x) => h('th', { scope: 'col' }, x)))));
      tbl.appendChild(h('tbody', {}, ...rows.map((r) => h('tr', {}, ...r.map((c) => h('td', {}, c))))));
      return tbl;
    }

    function metricTile({ key, label: lbl, value, scale = null, unit = '', tone = null, icon = null, foot = null, helper = '', spark = null, onClick = null, title = null }) {
      const clickable = typeof onClick === 'function';
      const el = h(clickable ? 'button' : 'div', { class: ['metric-tile', tone ? `tone-${tone}` : null, clickable ? 'is-clickable' : null], type: clickable ? 'button' : undefined, onClick: clickable ? onClick : undefined, title: title || undefined, 'data-key': key });
      el.appendChild(h('div', { class: 'metric-head' }, h('span', { class: 'metric-label' }, lbl), icon ? h('span', { class: 'metric-icon', 'aria-hidden': 'true' }, icon) : null));
      el.appendChild(h('div', { class: 'metric-value' }, h('span', { class: 't-metric', dir: scale ? 'ltr' : undefined }, String(value ?? '—'), scale ? h('small', {}, scale) : null), unit ? h('span', { class: 'metric-unit' }, unit) : null));
      if (spark) el.appendChild(h('span', { class: 'metric-spark', 'aria-hidden': 'true' }, spark));
      el.appendChild(h('div', { class: 'metric-foot' }, foot, helper ? h('span', { class: 'metric-helper' }, helper) : null));
      const sig = `${value}|${scale || ''}|${tone || ''}`;
      if (built && tileVals.has(key) && tileVals.get(key) !== sig) pendingFlash.push(el);
      tileVals.set(key, sig);
      return el;
    }
    const scrollToSection = (id) => { const el = root.querySelector(`[data-section="${id}"]`); if (el) { el.scrollIntoView({ behavior: motion && motion.enabled && motion.enabled() ? 'smooth' : 'auto', block: 'start' }); const head = el.querySelector('.card-title'); if (head) { head.setAttribute('tabindex', '-1'); head.focus({ preventScroll: true }); } } };

    function makeTable(key, opts, sigOf) {
      const tbl = dataTable(opts);
      const prev = tableStates.get(key);
      if (prev) tbl.setState(resetPages ? { ...prev, page: 0, scrollTop: 0 } : prev);
      tables.set(key, tbl);
      if (typeof sigOf === 'function') {
        const before = rowSigs.get(key);
        const now = new Map((opts.rows || []).map((r) => [String(r[opts.rowKey || 'id']), sigOf(r)]));
        if (built && before) tbl.table.querySelectorAll('tbody tr[data-key]').forEach((tr) => { const k = tr.getAttribute('data-key'); if (before.get(k) !== now.get(k)) pendingFlash.push(tr); });
        rowSigs.set(key, now);
      }
      return tbl;
    }
    const rowOpener = (e) => { const tr = e && e.target && e.target.closest ? e.target.closest('tr') : null; return (tr && tr.querySelector('.row-open')) || null; };

    async function openRisk(risk, returnFocus = null) {
      const id = risk && (risk.id || risk.code);
      if (!id) return;
      if (!riskDrawerFailed) {
        try {
          const mod = await import('./shared/risk-drawer.js');
          const fn = mod && (mod.openRiskDrawer || (mod.default && mod.default.openRiskDrawer));
          if (typeof fn === 'function') { fn(ctx, id, { returnFocus: returnFocus && returnFocus.isConnected ? returnFocus : null }); return; }
        } catch { riskDrawerFailed = true; }
      }
      router.navigate('airisks', { risk: id });
    }

    /* ───────────────────────── data ───────────────────────── */

    function collect() {
      const state = store.state;
      const filters = store.filters || { siteId: 'all', range: 30, search: '' };
      const siteId = filters.siteId && filters.siteId !== 'all' ? filters.siteId : null;
      const search = lower(filters.search).trim();
      const platform = psf('platform', state) || state.platform || null;
      if (!platform || !Array.isArray(platform.scheduleTasks)) return { state, filters, siteId, search, platform: null };
      const projectId = siteId || FALLBACK_PROJECT;
      const inScope = (item) => !siteId || item.projectId === siteId;

      const subById = new Map((platform.subcontractors || []).filter(Boolean).map((s) => [s.id, i18n.localize(s, 'subcontractors')]));
      const decorate = (task) => {
        const lt = i18n.localize(task, 'scheduleTasks');
        const p = clamp01(task.delayProbability);
        const exp = num(task.expectedDelayDays);
        return { ...lt, _p: p, _exp: exp, _weighted: Number.isFinite(task.exposure) ? task.exposure : Math.round(p * exp * 10) / 10, _slip: daysBetween(task.baselineFinish, task.finish), _sub: subById.get(task.subcontractorId) || null };
      };
      const tasksAll = platform.scheduleTasks.filter((x) => x && inScope(x)).map(decorate);
      const critSel = psf('criticalPathSlippage', state, filters);
      const critical = (Array.isArray(critSel) ? critSel.map(decorate) : tasksAll.filter((x) => x.critical && (!search || [x.code, x.name, x.wbs, x.trade].some((f) => lower(f).includes(search)))))
        .sort((a, b) => b._weighted - a._weighted || b._p - a._p);
      const criticalAll = tasksAll.filter((x) => x.critical);
      const highRisk = criticalAll.filter((x) => x._p >= HIGH_DELAY_PROB);
      const weightedDelay = Math.round(criticalAll.reduce((n, x) => n + x._p * x._exp, 0));
      const weatherSensitiveCount = criticalAll.filter((x) => x.weatherSensitive).length;

      const project = (platform.projects || []).find((p) => p && p.id === projectId) || null;
      let mc = psf('monteCarlo', state, projectId);
      if (!mc || !Array.isArray(mc.histogram) || !mc.histogram.length) mc = (platform.monteCarlo && platform.monteCarlo[projectId]) || null;
      let histogram = mc && Array.isArray(mc.histogram) ? mc.histogram.map((b) => ({ days: num(b.days), prob: num(b.prob) })) : [];
      if (histogram.reduce((m, b) => Math.max(m, b.prob), 0) > 1) histogram = histogram.map((b) => ({ ...b, prob: b.prob / 100 }));
      const onTimeProb = histogram.some((b) => b.days <= 0) ? histogram.filter((b) => b.days <= 0).reduce((n, b) => n + b.prob, 0) : null;

      const resSel = psf('resourceUtilization', state, filters);
      const resources = (Array.isArray(resSel) ? resSel : (platform.resources || []).filter((r) => r && inScope(r)))
        .map((r) => ({ ...i18n.localize(r, 'resources'), _util: num(r.utilizationPct), _gap: num(r.nextWeekGap) })).sort((a, b) => b._util - a._util);
      const overAllocated = resources.filter((r) => r._util > 100);

      const wSel = psf('weatherDelayRisk', state, projectId, nowDate());
      const weatherDays = wSel && Array.isArray(wSel.days) && wSel.projectId === projectId
        ? wSel.days.slice(0, 7).map((d) => ({ ...d, _risk: clamp01(d.delayRisk) }))
        : ((platform.weather && platform.weather[projectId] && platform.weather[projectId].next7) || []).slice(0, 7).map((d) => ({ ...d, _risk: clamp01(d.delayRisk) }));
      const weatherHighDays = weatherDays.filter((d) => d._risk >= 0.5).length;
      const weatherSensitive = tasksAll.filter((x) => x.critical && x.weatherSensitive && x.projectId === projectId).length;

      const apSel = psf('approvalsTable', state, filters);
      const matchesAp = (a) => !search || [a.authority, a.type, label('approvalStatus', a.status)].some((f) => lower(f).includes(search));
      const approvals = (Array.isArray(apSel) ? apSel : (platform.approvals || []).filter((a) => a && inScope(a)))
        .map((a) => ({ ...i18n.localize(a, 'approvals'), _ratio: num(a.elapsedDays) / Math.max(1, num(a.statutoryDays)) }))
        .filter(matchesAp)
        .sort((a, b) => (a.status === 'معتمد') - (b.status === 'معتمد') || b._ratio - a._ratio);
      const riskSel = psf('approvalsAtRisk', state, filters);
      const atRisk = Array.isArray(riskSel) ? riskSel.filter((a) => a.status !== 'معتمد') : approvals.filter((a) => a.status !== 'معتمد' && (a._ratio >= APPROVAL_RISK_RATIO || a.status === 'متأخر'));

      const subSel = psf('subcontractorPerformance', state, filters);
      const subcontractors = (Array.isArray(subSel) ? subSel : (platform.subcontractors || []).filter((s) => s && inScope(s)))
        .map((s) => ({ ...i18n.localize(s, 'subcontractors'), _gap: Math.round((num(s.actualProgressPct) - num(s.plannedProgressPct)) * 10) / 10 })).sort((a, b) => a._gap - b._gap);

      let openRisks = psf('openAiRisks', state, filters);
      if (!Array.isArray(openRisks)) openRisks = (platform.aiRisks || []).filter((r) => r && !CLOSED_RISK.has(r.status) && inScope(r));
      const domainRisks = openRisks.filter((r) => r && r.category === CATEGORY).sort((a, b) => num(b.score) - num(a.score));

      let categoryScore = null;
      const scores = psf('categoryScores', state, filters);
      if (Array.isArray(scores)) categoryScore = scores.find((s) => s && s.category === CATEGORY) || null;
      if (!categoryScore) {
        const vals = domainRisks.map((r) => num(r.score));
        const score = vals.length ? Math.round(0.5 * Math.max(...vals) + 0.5 * (vals.reduce((a, b) => a + b, 0) / vals.length)) : 0;
        categoryScore = { score, open: vals.length, red: vals.filter((v) => ratingOf(v) === 'red').length, trend: [] };
      }

      const nowMs = nowDate().getTime();
      const fresh = (platform.aiRisks || []).filter((r) => r && r.category === CATEGORY && inScope(r))
        .map((r) => fmt.toDate(r.updatedAt || r.detectedAt)).filter((d) => d && d.getTime() <= nowMs).sort((a, b) => b - a)[0] || null;
      const connectors = SOURCE_CONNECTORS.map((id) => (platform.connectors || []).find((c) => c && c.id === id)).filter(Boolean);
      const pipeline = (platform.pipelines || []).find((p) => p && p.id === PIPELINE_ID) || null;

      return { state, filters, siteId, search, platform, projectId, project, tasksAll, critical, criticalAll, highRisk, weightedDelay, weatherSensitiveCount, mc, histogram, onTimeProb, resources, overAllocated, weatherDays, weatherHighDays, weatherSensitive, approvals, atRisk, subcontractors, domainRisks, categoryScore, fresh, connectors, pipeline: pipeline ? i18n.localize(pipeline, 'pipelines') : null };
    }

    const scopeLabel = (data) => (data.siteId ? siteName(data.state, data.siteId) : i18n.t('core.filters.allProjects'));
    const projectSubtitle = (data, text) => t(data.siteId ? 'projectNote' : 'projectNoteDefault', { name: siteName(data.state, data.projectId), text });
    const projectCode = (data) => { const s = siteOf(data.state, data.projectId); return s && s.code ? s.code : data.projectId; };

    /* ───────────────────────── actions ───────────────────────── */

    function relatedRisks(platform, { projectId, kind, needles }) {
      const ns = needles.map(lower).filter(Boolean);
      const codeLike = (n) => /^[a-z]{1,4}\d/i.test(n);
      return (platform.aiRisks || []).filter((r) => r && r.category === CATEGORY && !CLOSED_RISK.has(r.status) && r.projectId === projectId && (!kind || !r.evidence || !r.evidence.kind || r.evidence.kind === kind)
        && ns.some((n) => { const hay = lower(`${r.evidence && r.evidence.ref} ${r.evidence && r.evidence.excerpt} ${r.title} ${r.driverExplanation}`); return codeLike(n) ? hasToken(hay, n) : hay.includes(n); }));
    }

    function addTaskSafely(payload) {
      if (typeof store.addTask !== 'function') { toast(t('dom.task.unavailable'), { tone: 'warning' }); return null; }
      let task = null;
      try { task = store.addTask(payload); } catch (err) { console.warn('[schedule] addTask', err); task = null; }
      if (!task) toast(t('dom.task.failed'), { tone: 'critical' });
      return task;
    }
    const duplicateOf = (data, risk, title) => (data.platform.tasks || []).find((x) => x && OPEN_TASK.has(x.status) && ((risk && x.riskId === risk.id) || x.title === title)) || null;
    const toastDuplicate = (dup) => toast(t('dom.task.duplicate', { code: dup.code || dup.id }), { tone: 'neutral', action: { label: t('dom.task.openTasks'), onClick: () => router.navigate('tasks') } });
    const toastCreated = (key, p) => toast(`${t(key, p)} ${t('dom.task.writebackSim')}`, { tone: 'good', action: { label: t('dom.task.openTasks'), onClick: () => router.navigate('tasks') } });

    function escalateApproval(data, approval) {
      const raw = (data.platform.approvals || []).find((a) => a && a.id === approval.id) || approval;
      const risk = relatedRisks(data.platform, { projectId: raw.projectId, kind: 'approval', needles: [raw.id, raw.type, raw.authority] })[0]
        || relatedRisks(data.platform, { projectId: raw.projectId, kind: null, needles: [raw.authority] })[0] || null;
      const title = fill(dict.ar.task.titleApproval, { authority: raw.authority, type: raw.type });
      const titleEn = isEn() ? fill(dict.en.task.titleApproval, { authority: approval.authority, type: approval.type }) : fill(dict.en.task.titleApprovalShort, { id: raw.id });
      const dup = duplicateOf(data, risk, title);
      if (dup) { toastDuplicate(dup); return dup; }
      const s = siteOf(data.state, raw.projectId);
      const owner = (risk && risk.owner) || (s && s.manager) || DEFAULT_OWNER;
      const p = { elapsed: num(raw.elapsedDays), statutory: num(raw.statutoryDays), date: raw.submittedAt || '—' };
      const task = addTaskSafely({ title, titleEn, description: fill(dict.ar.task.descApproval, p), descriptionEn: fill(dict.en.task.descApproval, p), projectId: raw.projectId, riskId: risk ? risk.id : null, owner, dueDate: isoPlusDays(raw.status === 'متأخر' ? 2 : 5), status: 'جديدة', source: 'manual', origin: { view: 'schedule', approvalId: raw.id } });
      if (!task) return null;
      if (typeof store.update === 'function') {
        store.update((state) => {
          const a = ((state.platform && state.platform.approvals) || []).find((x) => x && x.id === raw.id);
          if (a) { a.escalated = true; a.taskId = task.id; }
          return `platform.approvals.${raw.id}`;
        }, `platform.approvals.${raw.id}`);
      }
      toastCreated(risk ? 'task.createdApprovalLinked' : 'task.createdApproval', { authority: digitsIn(approval.authority), task: task.code || task.id, risk: risk ? risk.code : '' });
      return task;
    }

    function createTaskForActivity(data, act) {
      const raw = (data.platform.scheduleTasks || []).find((x) => x && x.id === act.id) || act;
      const risk = relatedRisks(data.platform, { projectId: raw.projectId, kind: 'task', needles: [raw.code, raw.name] })[0] || null;
      const title = fill(dict.ar.task.titleActivity, { code: raw.code, name: raw.name });
      const titleEn = isEn() ? fill(dict.en.task.titleActivity, { code: raw.code, name: act.name }) : fill(dict.en.task.titleActivityShort, { code: raw.code });
      const dup = duplicateOf(data, risk, title);
      if (dup) { toastDuplicate(dup); return dup; }
      const s = siteOf(data.state, raw.projectId);
      const owner = (risk && risk.owner) || (s && s.manager) || DEFAULT_OWNER;
      const p = { prob: `${Math.round(act._p * 100)}%`, days: act._exp, float: num(raw.floatDays) };
      const task = addTaskSafely({ title, titleEn, description: fill(dict.ar.task.descActivity, p), descriptionEn: fill(dict.en.task.descActivity, p), projectId: raw.projectId, riskId: risk ? risk.id : null, owner, dueDate: isoPlusDays(act._p >= 0.7 ? 3 : 7), status: 'جديدة', source: 'manual', origin: { view: 'schedule', taskCode: raw.code } });
      if (task) toastCreated(risk ? 'task.createdActivityLinked' : 'task.createdActivity', { task: task.code || task.id, risk: risk ? risk.code : '' });
      return task;
    }

    /* ───────────────────────── drawer ───────────────────────── */

    function relatedList(risks, onOpen) {
      if (!risks.length) return h('p', { class: 't-helper' }, t('dom.related.none'));
      return h('ul', { class: 'urgent-list' }, ...risks.map((r) => h('li', { class: ['urgent-item', `tone-${RATING_TONE[ratingOf(r.score)]}`] },
        h('span', { class: 'urgent-icon' }, svgIcon('shield-alert', 15)),
        h('div', { class: 'urgent-text' },
          h('span', { class: 'row gap-2 wrap', style: { alignItems: 'center' } }, codeSpan(r.code), h('span', {}, ...withCodes(L(r, 'title', 'aiRisks')))),
          h('span', { class: 'urgent-sub' }, t('dom.related.meta', { owner: r.owner ? term(r.owner) : t('dom.risks.unassigned'), status: label('aiRiskStatus', r.status) }))),
        h('div', { class: 'urgent-due' }, scoreCell(r.score), button(t('dom.related.open'), { variant: 'ghost', size: 'sm', attrs: { 'aria-label': t('dom.related.openAria', { code: r.code }) }, onClick: () => onOpen(r) })),
      )));
    }

    function openActivity(data, act) {
      if (!act) return;
      if (openDrawer) { try { openDrawer.close(); } catch { /* ignore */ } openDrawer = null; }
      const opener = document.activeElement && root.contains(document.activeElement) ? document.activeElement : null;
      const related = relatedRisks(data.platform, { projectId: act.projectId, kind: null, needles: [act.code, act.name] });
      const weather = data.weatherDays.length && act.weatherSensitive && act.projectId === data.projectId ? data.weatherDays : [];
      const openLinked = (r) => { const back = opener; if (openDrawer) openDrawer.close(); openRisk(r, back); };
      const fl = num(act.floatDays);
      openDrawer = drawer({
        title: digitsIn(act.name),
        subtitle: t('drawer.subtitle', { code: `⁨${act.code}⁩`, site: siteName(data.state, act.projectId) }),
        size: 'lg', kind: 'schedule-activity', returnFocus: opener,
        tabs: [
          { id: 'overview', label: t('drawer.tabs.overview'), render: () => h('div', { class: 'stack gap-4' },
            h('div', { class: 'row between wrap gap-2' },
              h('div', { class: 'row gap-2 wrap' }, act.critical ? badge(t('drawer.onPath'), 'critical') : badge(t('drawer.offPath'), 'neutral'), act.weatherSensitive ? badge(t('drawer.weatherSensitive'), 'warning', { icon: svgIcon('sun', 12) }) : null, act.trade ? badge(digitsIn(act.trade), 'neutral') : null),
              h('div', { class: 'row gap-2', style: { alignItems: 'center' } }, h('span', { class: 't-label' }, t('drawer.probability')), probMeter(act._p, t('critical.probAria', { code: act.code })))),
            kv([
              [t('drawer.project'), siteName(data.state, act.projectId)],
              [t('drawer.wbs'), codeSpan(act.wbs || '—')],
              [t('drawer.start'), fmt.date(act.start)],
              [t('drawer.finish'), h('span', { class: 'row gap-2 wrap', style: { alignItems: 'center' } }, fmt.date(act.finish), slipBadge(act._slip))],
              [t('drawer.baseline'), fmt.date(act.baselineFinish)],
              [t('drawer.float'), h('span', { class: fl <= 0 ? 'tone-critical' : null }, fl <= 0 ? t('drawer.noFloat', { days: days(fl) }) : days(fl))],
              [t('drawer.complete'), h('div', { class: 'prob-row' }, progress({ value: num(act.percentComplete), max: 100, tone: 'brand', label: t('drawer.completeAria') }), h('span', { class: 'progress-value' }, fmt.pct(num(act.percentComplete))))],
              [t('drawer.expected'), t('drawer.expectedValue', { days: days(act._exp), weighted: fmt.num(act._weighted, { maximumFractionDigits: 1 }) })],
              [t('drawer.sub'), act._sub ? h('span', { class: 'row gap-2 wrap', style: { alignItems: 'center' } }, digitsIn(act._sub.name), badge(t('drawer.subScore', { score: fmt.num(num(act._sub.scorecard)) }), num(act._sub.scorecard) >= 80 ? 'good' : num(act._sub.scorecard) >= 60 ? 'warning' : 'critical')) : '—'],
            ]),
          ) },
          { id: 'weather', label: t('drawer.tabs.weather'), render: () => (weather.length
            ? h('div', { class: 'stack gap-3' }, h('h3', { class: 't-label' }, t('drawer.weatherTitle', { days: fmt.num(7) })),
              h('div', { class: 'tone-legend' }, ...weather.map((d) => h('span', { class: ['tone-legend-item', `tone-${riskTone(d._risk)}`] }, glyph(riskTone(d._risk), 12), h('span', {}, t('drawer.weatherDay', { day: fmt.dayName(d.date), pct: fmt.pct(Math.round(d._risk * 100)) }))))),
              h('p', { class: 't-helper' }, t('weather.source')))
            : h('p', { class: 't-helper' }, t('drawer.weatherNone'))) },
          { id: 'risks', label: t('drawer.tabs.risks'), count: related.length, render: () => relatedList(related, openLinked) },
        ],
        actions: [
          { label: t('drawer.createTask'), variant: 'primary', icon: 'calendar', closes: false, onClick: () => { createTaskForActivity(data, act); return false; } },
          { label: t('drawer.close'), variant: 'ghost' },
        ],
        onClose: () => { openDrawer = null; },
      });
      openDrawer.open();
    }

    /* ───────────────────────── sections ───────────────────────── */

    function buildHead(data) {
      const conns = data.connectors || [];
      const statuses = [...new Set(conns.map((c) => (statusApi && typeof statusApi.connector === 'function' ? safe(() => statusApi.connector(data.state, c), 'not_connected') : 'not_connected')))];
      const freshText = data.fresh ? t('dom.fresh', { time: fmt.relative(data.fresh, nowDate()) }) : t('dom.freshNone');
      const names = conns.map((c) => digitsIn(L(c, 'name', 'connectors')));
      return h('header', { class: 'view-head' },
        h('div', { class: 'view-head-text' },
          h('span', { class: 'code-tag' }, 'DOM-03'),
          h('h1', { tabindex: '-1' }, t('title')),
          h('p', { class: 'view-lead' }, t('lead')),
          h('div', { class: 'dom-meta' },
            h('span', { class: 'dom-meta-item' }, svgIcon('building', 14), h('span', {}, t('dom.scope', { scope: scopeLabel(data) }))),
            h('span', { class: 'dom-meta-item', title: data.fresh ? t('dom.freshTitle', { time: fmt.dateTime(data.fresh) }) : undefined }, glyph('clock', 14), h('span', {}, freshText)),
            h('span', { class: 'dom-meta-item is-source' }, svgIcon('plug', 14), h('span', {}, names.length ? t('dom.source', { source: names.join(' · ') }) : t('dom.sourceMissing')), ...(statuses.length ? statuses : ['not_connected']).map((st) => statusBadge(st, { size: 'sm' }))),
          ),
        ),
        h('div', { class: 'view-actions' },
          button(t('dom.register'), { variant: 'outline', size: 'sm', icon: 'shield-alert', attrs: { 'aria-label': t('dom.registerAria') }, onClick: () => router.navigate('airisks', { domain: CATEGORY }) }),
        ),
      );
    }

    function buildKpis(data) {
      const cs = data.categoryScore;
      const r = ratingOf(cs.score);
      const spark = Array.isArray(cs.trend) && cs.trend.length > 1 ? makeChart('sparkline', { values: cs.trend, width: 96, height: 28, color: 'var(--ink-3)', accentLast: true }) : null;
      const planned = (data.mc && data.mc.plannedFinish) || (data.project ? data.project.plannedFinish : null);
      const p80Slip = data.mc && data.mc.p80 && planned ? daysBetween(planned, data.mc.p80) : null;
      const pct80 = fmt.pct(80);
      return h('div', { class: 'metric-grid', role: 'group', 'aria-label': t('title') },
        metricTile({ key: 'score', label: t('kpi.score'), value: fmt.num(num(cs.score)), scale: `/${fmt.num(100)}`, tone: RATING_TONE[r], icon: svgIcon('calendar', 16), spark: spark ? spark.el : null, foot: ratingBadge(cs.score), helper: t('dom.scoreHelper', { open: tn('dom.openRisks', num(cs.open)), red: tn('dom.redRisks', num(cs.red)) }), title: t('dom.scoreFormula') }),
        metricTile({ key: 'atRisk', label: t('kpi.atRisk'), value: fmt.num(data.highRisk.length), tone: data.highRisk.length ? 'critical' : 'good', icon: glyph(data.highRisk.length ? 'critical' : 'good', 16), helper: t('kpi.atRiskHelper', { pct: fmt.pct(HIGH_DELAY_PROB * 100), total: tn('activities', data.criticalAll.length) }), onClick: () => scrollToSection('critical') }),
        metricTile({ key: 'p80', label: t('kpi.p80', { project: projectCode(data) }), value: data.mc && data.mc.p80 ? fmt.date(data.mc.p80, { style: 'short' }) : '—', tone: p80Slip === null ? null : p80Slip > 30 ? 'critical' : p80Slip > 0 ? 'warning' : 'good', icon: svgIcon('calendar', 16), helper: !data.mc || !data.mc.p80 ? t('kpi.p80None') : p80Slip !== null && p80Slip > 0 ? t('kpi.p80Late', { days: days(p80Slip), pct: pct80 }) : t('kpi.p80OnTime', { pct: pct80 }), onClick: () => scrollToSection('mc') }),
        metricTile({ key: 'approvals', label: t('kpi.approvals'), value: fmt.num(data.atRisk.length), tone: data.atRisk.some((a) => a.status === 'متأخر') ? 'critical' : data.atRisk.length ? 'warning' : 'good', icon: glyph(data.atRisk.length ? 'warning' : 'good', 16), helper: t('kpi.approvalsHelper', { pct: fmt.pct(APPROVAL_RISK_RATIO * 100) }), onClick: () => scrollToSection('approvals') }),
      );
    }

    function buildCriticalCard(data) {
      const rows = data.critical;
      const stat = (lbl, value) => h('div', { class: 'dom-stat' }, h('dt', {}, lbl), h('dd', {}, value));
      const stats = h('dl', { class: 'dom-stats' },
        stat(t('critical.stats.critical'), fmt.num(data.criticalAll.length)),
        stat(t('critical.stats.atRisk', { pct: fmt.pct(HIGH_DELAY_PROB * 100) }), fmt.num(data.highRisk.length)),
        stat(t('critical.stats.weighted'), days(data.weightedDelay)),
        stat(t('critical.stats.weather'), fmt.num(data.weatherSensitiveCount)),
      );
      const table = makeTable('critical', {
        caption: t('critical.caption'), pageSize: 6, rowKey: 'id', stickyFirst: true,
        emptyText: data.search ? t('critical.emptySearch') : t('critical.empty'),
        onRowClick: (r) => openActivity(data, r),
        rowLabel: (r) => `${r.code} — ${r.name}`,
        initialSort: { key: '_weighted', dir: 'desc' },
        columns: [
          { key: 'name', label: t('critical.activity'), priority: 'high', sortValue: (r) => r.name, render: (r) => h('div', { class: 'cell-stack' },
            codeSpan(r.code, 'cell-code'),
            h('span', { class: 'cell-title' }, digitsIn(r.name), r.weatherSensitive ? h('span', { class: 'ws-icon', role: 'img', title: t('critical.weatherSensitive'), 'aria-label': t('critical.weatherSensitive') }, svgIcon('sun', 13)) : null),
            h('span', { class: 'cell-sub row gap-2 wrap', style: { alignItems: 'center' } }, codeSpan(r.wbs || '—'), h('span', {}, digitsIn(r.trade || '')), h('span', {}, siteName(data.state, r.projectId)), r._sub ? h('span', {}, digitsIn(r._sub.name)) : null)) },
          { key: 'finish', label: t('critical.finish'), priority: 'medium', sortValue: (r) => r._slip ?? 0, render: (r) => h('div', { class: 'cell-stack', style: { alignItems: 'flex-start' } }, h('span', { class: 'nowrap' }, fmt.date(r.finish, { style: 'short' })), slipBadge(r._slip)) },
          { key: '_p', label: t('critical.prob'), priority: 'high', sortValue: (r) => r._p, render: (r) => h('div', { class: 'cell-stack' }, probMeter(r._p, t('critical.probAria', { code: r.code })), h('span', { class: ['cell-sub', 'nowrap', num(r.floatDays) <= 0 ? 'is-overdue' : null] }, t('critical.float', { days: days(num(r.floatDays)) }))) },
          { key: '_exp', label: t('critical.expected'), align: 'end', priority: 'medium', sortValue: (r) => r._exp, render: (r) => h('div', { class: 'cell-stack', style: { alignItems: 'flex-end' } }, h('span', { class: 'nowrap' }, days(r._exp)), h('span', { class: 'cell-sub nowrap' }, t('critical.weighted', { value: fmt.num(r._weighted, { maximumFractionDigits: 1 }) }))) },
        ],
        rows,
      }, (r) => `${r._p}|${r._exp}|${r.finish}|${r.percentComplete}`);
      const el = card({ code: 'SCH-01', title: t('critical.title'), subtitle: t('critical.sub', { count: tn('activities', rows.length) }), body: h('div', {}, stats, table.el) });
      el.dataset.section = 'critical';
      return el;
    }

    function buildMonteCarloCard(data) {
      const mc = data.mc;
      if (!mc || !data.histogram.length) {
        const empty = card({ code: 'SCH-02', title: t('mc.title'), subtitle: projectSubtitle(data, t('mc.empty')), body: emptyState({ title: t('mc.empty') }) });
        empty.dataset.section = 'mc';
        return empty;
      }
      const items = data.histogram.map((b) => ({ id: String(b.days), label: fmt.signed(b.days), value: b.prob }));
      const chart = makeChart('barChart', { items, horizontal: false, sorted: false, height: 190, valueFormat: (v) => fmt.pct(v * 100, 1), color: 'var(--s1)', showValues: false, maxBars: Math.max(12, items.length), ariaLabel: t('mc.aria') });
      const fallback = () => simpleTable(t('mc.caption'), [t('mc.colDays'), t('mc.colProb')], data.histogram.map((b) => [fmt.signed(b.days), fmt.pct(b.prob * 100, 1)]));
      const planned = mc.plannedFinish || (data.project ? data.project.plannedFinish : null);
      const fact = (p, iso, pct) => {
        const slip = planned ? daysBetween(planned, iso) : null;
        const tone = slip === null ? null : slip > 30 ? 'critical' : slip > 0 ? 'warning' : 'good';
        return h('div', { class: ['fact', tone ? `tone-${tone}` : null] },
          h('span', { class: 'fact-label' }, t('mc.fact', { p, pct: fmt.pct(pct) })),
          h('span', { class: 'fact-value', style: { fontSize: 'var(--fs-lg)' } }, fmt.date(iso, { style: 'short' })),
          slip !== null ? h('span', { class: 'cell-sub', style: { color: 'var(--tone-ink)' } }, slip > 0 ? t('mc.after', { days: days(slip) }) : slip < 0 ? t('mc.before', { days: days(slip) }) : t('mc.onPlan')) : null);
      };
      // Finish-date timeline: a time axis, so it runs left → right in both languages (dir="ltr" on the track).
      const timeline = (() => {
        const points = [['P50', mc.p50, 'var(--good)'], ['P80', mc.p80, 'var(--warning)'], ['P90', mc.p90, 'var(--critical)']].map(([k, iso, tone]) => ({ k, d: fmt.toDate(iso), tone })).filter((x) => x.d);
        const plannedDate = planned ? fmt.toDate(planned) : null;
        if (points.length < 2) return null;
        const all = points.map((x) => x.d.getTime()).concat(plannedDate ? [plannedDate.getTime()] : []);
        const lo = Math.min(...all); const hi = Math.max(...all);
        const span = Math.max(DAY_MS, hi - lo);
        const start = lo - span * 0.1; const total = span * 1.2;
        const at = (ms) => `${(((ms - start) / total) * 100).toFixed(2)}%`;
        const first = points[0].d.getTime(); const last = points[points.length - 1].d.getTime();
        const aria = t('mc.timelineAria', { points: points.map((x) => `${x.k} ${fmt.date(x.d, { style: 'short' })}`).join(i18n.t('ui.sep')) }) + (plannedDate ? t('mc.timelinePlanned', { date: fmt.date(plannedDate, { style: 'short' }) }) : '');
        return h('div', { class: 'mc-timeline', dir: 'ltr', role: 'img', 'aria-label': aria },
          h('div', { class: 'mc-track' }),
          h('div', { class: 'mc-fill', style: { insetInlineStart: at(first), inlineSize: `${(((last - first) / total) * 100).toFixed(2)}%` } }),
          plannedDate ? h('div', { class: 'mc-mark is-planned', style: { insetInlineStart: at(plannedDate.getTime()) } }, h('span', { class: 'mc-dot' }), h('span', { class: 'mc-label' }, h('span', {}, t('mc.planned')))) : null,
          ...points.map((x) => h('div', { class: 'mc-mark', style: { insetInlineStart: at(x.d.getTime()), '--tone': x.tone } }, h('span', { class: 'mc-dot' }), h('span', { class: 'mc-label' }, h('strong', { lang: 'en' }, x.k), h('span', {}, fmt.date(x.d, { style: 'short' }))))));
      })();
      const body = h('div', { class: 'stack gap-3' },
        h('div', { class: 'hero-facts' }, fact('P50', mc.p50, 50), fact('P80', mc.p80, 80), fact('P90', mc.p90, 90)),
        timeline,
        chart ? chart.el : fallback(),
        h('div', { class: 'row between wrap gap-2' },
          h('span', { class: 't-helper' }, planned ? t('mc.axis', { date: fmt.date(planned, { style: 'short' }) }) : t('mc.axisNoDate')),
          data.onTimeProb !== null ? h('span', { class: `tone-${data.onTimeProb >= 0.5 ? 'good' : data.onTimeProb >= 0.25 ? 'warning' : 'critical'}`, style: { color: 'var(--tone-ink)', fontWeight: 600, fontSize: 'var(--fs-sm)' } }, t('mc.onTime', { pct: fmt.pct(Math.round(data.onTimeProb * 100)) })) : null),
      );
      const el = card({ code: 'SCH-02', title: t('mc.title'), subtitle: projectSubtitle(data, t('mc.runs', { runs: fmt.num(num(mc.runs) || 0) })), actions: [h('span', { class: 'sim-tag' }, i18n.t('core.common.illustrative'))], body, tableView: chartTable(chart, fallback) });
      el.dataset.section = 'mc';
      return el;
    }

    function buildResourcesCard(data) {
      const codeOf = (id) => { const s = siteOf(data.state, id); return s && s.code ? s.code : id; };
      const items = data.resources.slice(0, 12).map((r) => ({ id: r.id, label: data.siteId ? digitsIn(r.trade) : t('resources.tradeProject', { trade: digitsIn(r.trade), code: codeOf(r.projectId) }), value: r._util, color: r._util > 100 ? 'var(--critical)' : 'var(--s1)' }));
      const chart = items.length ? makeChart('barChart', { items, horizontal: true, height: Math.max(220, items.length * 30 + 24), valueFormat: (v) => fmt.pct(v), color: 'var(--s1)', showValues: true, maxBars: 12, ariaLabel: t('resources.aria') }) : null;
      const fallback = () => simpleTable(t('resources.caption'), [t('resources.trade'), t('resources.project'), t('resources.planned'), t('resources.available'), t('resources.util'), t('resources.gap')], data.resources.map((r) => [digitsIn(r.trade), siteName(data.state, r.projectId), fmt.num(num(r.planned)), fmt.num(num(r.available)), fmt.pct(r._util), fmt.signed(r._gap)]));
      const gaps = data.resources.filter((r) => r._gap < 0).sort((a, b) => a._gap - b._gap).slice(0, 4);
      const body = items.length ? h('div', { class: 'stack gap-3' },
        h('div', { class: 'tone-legend' },
          h('span', { class: 'tone-legend-item' }, h('span', { 'aria-hidden': 'true', style: { background: 'var(--s1)', inlineSize: '10px', blockSize: '10px', borderRadius: '2px', display: 'inline-block' } }), h('span', {}, t('resources.within'))),
          h('span', { class: 'tone-legend-item tone-critical' }, glyph('critical', 12), h('span', {}, t('resources.overLegend', { pct: fmt.pct(100) })))),
        chart ? chart.el : fallback(),
        gaps.length ? h('ul', { class: 'urgent-list gap-grid' }, ...gaps.map((r) => h('li', { class: 'urgent-item tone-warning' },
          h('span', { class: 'urgent-icon' }, glyph('warning', 15)),
          h('div', { class: 'urgent-text' }, h('span', {}, t('resources.gapLine', { trade: digitsIn(r.trade), count: tn('resources.workers', Math.abs(r._gap)) })), h('span', { class: 'urgent-sub' }, t('resources.gapMeta', { site: siteName(data.state, r.projectId), planned: fmt.num(num(r.planned)), available: fmt.num(num(r.available)) }))),
          h('div', { class: 'urgent-due' }, h('span', { class: 'mono' }, fmt.pct(r._util)))))) : h('p', { class: 't-helper' }, t('resources.noGaps')),
      ) : emptyState({ title: t('resources.empty') });
      return card({ code: 'SCH-03', title: t('resources.title'), subtitle: t('resources.sub', { count: tn('resources.trades', data.resources.length), over: tn('resources.over', data.overAllocated.length) }), body, tableView: items.length ? chartTable(chart, fallback) : null });
    }

    function buildWeatherCard(data) {
      const wd = data.weatherDays;
      const dayCard = (d) => {
        const tone = riskTone(d._risk);
        const pct = Math.round(d._risk * 100);
        return h('div', { class: ['fact', 'weather-day', `tone-${tone}`], role: 'listitem' },
          h('div', { class: 'row between gap-2' }, h('span', { class: 't-label', style: { color: 'var(--ink-1)', fontWeight: 600 } }, fmt.dayName(d.date)), h('span', { class: 'cell-sub' }, fmt.date(d.date, { style: 'short' }))),
          h('div', { class: 'wrow' }, h('span', {}, t('weather.temp')), h('span', { class: 'mono' }, t('weather.tempValue', { value: fmt.num(num(d.tempMax)) }))),
          h('div', { class: 'wrow' }, h('span', {}, t('weather.wind')), h('span', { class: 'mono' }, t('weather.windValue', { value: fmt.num(num(d.windKmh)) }))),
          h('div', { class: 'wrow' }, h('span', {}, t('weather.rain')), h('span', { class: 'mono' }, fmt.pct(rainPct(d.rainProb)))),
          h('div', { class: 'wrow' }, h('span', {}, t('weather.dust')), enumBadge('dustLevel', d.dustRisk, DUST_TONE)),
          h('div', { class: 'stack gap-1' }, h('span', { class: 'cell-sub' }, t('weather.delay')), h('div', { class: 'prob-row' }, progress({ value: pct, max: 100, tone, label: t('weather.delayAria', { day: fmt.dayName(d.date) }) }), h('span', { class: 'progress-value' }, fmt.pct(pct)))));
      };
      const fallback = () => simpleTable(t('weather.caption'), [t('weather.day'), t('weather.temp'), t('weather.wind'), t('weather.rain'), t('weather.dust'), t('weather.delay')], wd.map((d) => [`${fmt.dayName(d.date)} ${fmt.date(d.date, { style: 'short' })}`, t('weather.tempValue', { value: fmt.num(num(d.tempMax)) }), t('weather.windValue', { value: fmt.num(num(d.windKmh)) }), fmt.pct(rainPct(d.rainProb)), label('dustLevel', d.dustRisk) || '—', fmt.pct(Math.round(d._risk * 100))]));
      const sumTone = data.weatherHighDays ? (data.weatherHighDays >= 3 ? 'critical' : 'warning') : 'good';
      const body = wd.length
        ? h('div', { class: 'stack gap-3' },
          h('div', { class: 'weather-strip', role: 'list', 'aria-label': t('weather.aria') }, ...wd.map(dayCard)),
          h('div', { class: ['note', `tone-${sumTone}`, 'is-demo'] },
            h('p', {}, glyph(sumTone, 14), ' ', h('strong', {}, tn('weather.high', data.weatherHighDays)), ' · ', tn('weather.sensitive', data.weatherSensitive, { site: siteName(data.state, data.projectId) })),
            h('p', { class: 't-helper' }, t('weather.source'))))
        : emptyState({ title: t('weather.empty') });
      return card({ code: 'SCH-04', title: t('weather.title', { days: fmt.num(7) }), subtitle: projectSubtitle(data, t('weather.sub')), actions: [h('span', { class: 'sim-tag' }, i18n.t('core.common.simulated'))], body, tableView: wd.length ? fallback : null });
    }

    function approvalAction(data, r) {
      if (r.status === 'معتمد') return badge(t('approvals.approved'), 'good');
      if (r.escalated) return badge(t('approvals.escalated'), 'brand');
      return button(t('approvals.escalate'), { variant: r.status === 'متأخر' ? 'danger' : 'outline', size: 'sm', icon: 'bell', attrs: { title: t('approvals.escalateTitle'), 'aria-label': t('approvals.escalateAria', { authority: digitsIn(r.authority) }) }, onClick: () => { escalateApproval(data, r); } });
    }

    function buildApprovalsCard(data) {
      const rows = data.approvals;
      const table = makeTable('approvals', {
        caption: t('approvals.caption'), pageSize: 6, rowKey: 'id', stickyFirst: false,
        emptyText: data.search ? t('approvals.emptySearch') : t('approvals.empty'),
        initialSort: { key: '_ratio', dir: 'desc' },
        columns: [
          { key: 'authority', label: t('approvals.authority'), priority: 'high', sortValue: (r) => r.authority, render: (r) => h('div', { class: 'cell-stack' },
            h('span', { class: 'cell-title' }, digitsIn(r.authority)),
            h('span', { class: 't-body', style: { fontSize: 'var(--fs-sm)' } }, digitsIn(r.type)),
            h('span', { class: 'cell-sub' }, t('approvals.submitted', { site: siteName(data.state, r.projectId), date: fmt.date(r.submittedAt, { style: 'short' }) })),
            h('span', { class: 'row gap-2 wrap', style: { alignItems: 'center' } }, enumBadge('approvalStatus', r.status, APPROVAL_STATUS_TONE), approvalAction(data, r))) },
          { key: '_ratio', label: t('approvals.elapsed'), priority: 'high', sortValue: (r) => r._ratio, render: (r) => h('div', { class: 'cell-stack', style: { minInlineSize: '150px' } }, ratioMeter(r.elapsedDays, r.statutoryDays, t('approvals.elapsedAria', { authority: digitsIn(r.authority) })), h('span', { class: 'cell-sub row gap-1', style: { alignItems: 'center' } }, t('approvals.score'), ' ', scoreCell(r.riskScore))) },
        ],
        rows,
      }, (r) => `${r.status}|${r.elapsedDays}|${r.escalated ? 1 : 0}`);
      const el = card({ code: 'SCH-05', title: t('approvals.title'), subtitle: t('approvals.sub', { count: tn('approvals.count', rows.length), atRisk: fmt.num(data.atRisk.length), pct: fmt.pct(APPROVAL_RISK_RATIO * 100) }), body: table.el });
      el.dataset.section = 'approvals';
      return el;
    }

    function buildSubcontractorsCard(data) {
      const all = data.subcontractors;
      const rows = subsExpanded ? all : all.slice(0, SUBS_DEFAULT);
      const scoreTone = (v) => (v >= 80 ? 'good' : v >= 60 ? 'warning' : 'critical');
      const scoreWord = (v) => (v >= 80 ? t('subs.good') : v >= 60 ? t('subs.fair') : t('subs.poor'));
      const list = rows.length ? h('ul', { class: 'urgent-list', 'aria-label': t('subs.aria') }, ...rows.map((s) => {
        const sc = num(s.scorecard);
        const spark = makeChart('sparkline', { values: (s.trend || []).map(num), width: 64, height: 22, color: 'var(--ink-3)', accentLast: true });
        const gapTone = s._gap < -5 ? 'critical' : s._gap < 0 ? 'warning' : 'good';
        const planned = num(s.plannedProgressPct); const actual = num(s.actualProgressPct);
        const notices = num(s.openNotices);
        return h('li', { class: ['urgent-item', 'is-compact', `tone-${scoreTone(sc)}`] },
          h('div', { class: 'urgent-text', style: { gap: '4px' } },
            h('span', { class: 'row gap-2 wrap', style: { alignItems: 'center' } }, h('strong', {}, digitsIn(s.name)), badge(t('subs.score', { label: scoreWord(sc), score: fmt.num(sc) }), scoreTone(sc)), notices ? badge(tn('subs.notices', notices), 'warning') : null),
            h('span', { class: 'urgent-sub' }, t('subs.meta', { trade: digitsIn(s.trade || '—'), site: siteName(data.state, s.projectId) })),
            h('div', { class: 'prob-row' }, progress({ value: actual, max: 100, tone: gapTone, label: t('subs.progressAria', { name: digitsIn(s.name), actual: fmt.pct(actual), planned: fmt.pct(planned) }) }), h('span', { class: 'progress-value nowrap' }, t('subs.progress', { actual: fmt.pct(actual), planned: fmt.pct(planned) })))),
          h('div', { class: 'urgent-due' }, spark ? spark.el : null, badge(s._gap < 0 ? t('subs.behind', { pts: fmt.num(Math.abs(s._gap), { maximumFractionDigits: 1 }) }) : s._gap > 0 ? t('subs.ahead', { pts: fmt.num(s._gap, { maximumFractionDigits: 1 }) }) : t('subs.onPlan'), gapTone)));
      })) : emptyState({ title: t('subs.empty') });
      const fallback = () => simpleTable(t('subs.caption'), [t('subs.name'), t('subs.trade'), t('subs.project'), t('subs.planned'), t('subs.actual'), t('subs.gap'), t('subs.card'), t('subs.noticesCol')], all.map((s) => [digitsIn(s.name), digitsIn(s.trade || '—'), siteName(data.state, s.projectId), fmt.pct(num(s.plannedProgressPct)), fmt.pct(num(s.actualProgressPct)), fmt.signed(s._gap, 1), fmt.num(num(s.scorecard)), fmt.num(num(s.openNotices))]));
      const more = all.length > SUBS_DEFAULT ? button(subsExpanded ? t('dom.showLess') : t('dom.showAll', { count: fmt.num(all.length) }), { variant: 'ghost', size: 'sm', icon: h('span', { class: 'chev' }, svgIcon('chevron-down', 15)), attrs: { 'aria-expanded': subsExpanded ? 'true' : 'false' }, onClick: () => { subsExpanded = !subsExpanded; schedule(); } }) : null;
      return card({ code: 'SCH-06', title: t('subs.title'), subtitle: t('subs.sub', { count: tn('subs.count', all.length), weeks: fmt.num(8) }), actions: more ? [more] : [], body: list, tableView: all.length ? fallback : null, footer: all.length > rows.length ? h('span', { class: 't-helper' }, t('dom.shownOf', { shown: fmt.num(rows.length), total: fmt.num(all.length) })) : null });
    }

    function buildRisksCard(data) {
      const rows = data.domainRisks;
      const red = rows.filter((r) => ratingOf(r.score) === 'red').length;
      const table = makeTable('risks', {
        caption: t('dom.risks.caption', { domain: t('domain') }), pageSize: 6, rowKey: 'id', stickyFirst: true,
        emptyText: t('dom.risks.empty'),
        onRowClick: (r, e) => openRisk(r, rowOpener(e)),
        rowLabel: (r) => t('dom.risks.rowLabel', { code: r.code, title: L(r, 'title', 'aiRisks') }),
        initialSort: { key: 'score', dir: 'desc' },
        columns: [
          { key: 'title', label: t('dom.risks.risk'), priority: 'high', sortValue: (r) => L(r, 'title', 'aiRisks'), render: (r) => { const ev = r.evidence ? L(r, 'evidence', 'aiRisks') : null; return h('div', { class: 'cell-stack' }, codeSpan(r.code, 'cell-code'), h('span', { class: 'cell-title' }, ...withCodes(L(r, 'title', 'aiRisks'))), h('span', { class: 'cell-sub row gap-1 wrap' }, h('span', {}, siteName(data.state, r.projectId)), ev && ev.ref ? h('span', { 'aria-hidden': 'true' }, '·') : null, ev && ev.ref ? h('span', { class: 'mono', dir: 'ltr' }, digitsIn(ev.ref)) : null)); } },
          { key: 'score', label: t('dom.risks.score'), priority: 'high', sortValue: (r) => num(r.score), render: (r) => scoreCell(r.score, r) },
          { key: 'type', label: t('dom.risks.type'), priority: 'medium', sortValue: (r) => label('aiType', r.type), render: (r) => typeChip(r.type) },
          { key: 'owner', label: t('dom.risks.owner'), priority: 'low', sortValue: (r) => term(r.owner) || '', render: (r) => (r.owner ? h('span', {}, term(r.owner)) : h('span', { class: 't-helper' }, t('dom.risks.unassigned'))) },
          { key: 'status', label: t('dom.risks.status'), priority: 'medium', sortValue: (r) => label('aiRiskStatus', r.status), render: (r) => enumBadge('aiRiskStatus', r.status, RISK_STATUS_TONE) },
        ],
        rows,
      }, (r) => `${r.score}|${r.status}|${r.owner}|${r.updatedAt}`);
      return card({
        code: 'SCH-07', title: t('dom.risks.title'),
        subtitle: t('dom.risks.sub', { count: tn('dom.openRisks', rows.length), red: tn('dom.redRisks', red) }),
        actions: [button(t('dom.risks.viewAll'), { variant: 'ghost', size: 'sm', icon: 'shield-alert', onClick: () => router.navigate('airisks', { domain: CATEGORY }) })],
        body: table.el,
      });
    }

    function buildKriCard(data) {
      const p = data.pipeline;
      const kris = p && Array.isArray(p.kris) ? p.kris : [];
      const asText = (v) => digitsIn(Array.isArray(v) ? v.filter(Boolean).join(' · ') : String(v ?? '—'));
      const cols = [t('dom.kri.indicator'), t('dom.kri.technique'), t('dom.kri.inputs'), t('dom.kri.mitigation')];
      const bodyId = 'sch-kri-body';
      const wrap = h('div', { class: 'kri-wrap table-wrap', id: bodyId, hidden: !kriOpen },
        kris.length
          ? h('table', { class: 'kri-table table is-dense' },
            h('caption', { class: 'sr-only' }, t('dom.kri.caption')),
            h('thead', {}, h('tr', {}, ...cols.map((c) => h('th', { scope: 'col' }, c)))),
            h('tbody', {}, ...kris.map((k) => h('tr', {},
              h('td', { 'data-label': cols[0] }, asText(k.indicator)), h('td', { 'data-label': cols[1] }, asText(k.technique)),
              h('td', { 'data-label': cols[2] }, asText(k.inputs)), h('td', { 'data-label': cols[3] }, asText(k.mitigation))))))
          : emptyState({ title: t('dom.kri.emptyTitle'), text: t('dom.kri.emptyText') }));
      const toggle = button(kriOpen ? t('dom.kri.hide') : t('dom.kri.show'), { variant: 'ghost', size: 'sm', icon: h('span', { class: 'chev' }, svgIcon('chevron-down', 15)), attrs: { 'aria-expanded': kriOpen ? 'true' : 'false', 'aria-controls': bodyId } });
      toggle.addEventListener('click', () => {
        kriOpen = !kriOpen;
        wrap.hidden = !kriOpen;
        toggle.setAttribute('aria-expanded', kriOpen ? 'true' : 'false');
        const lbl = toggle.querySelector('.btn-label'); if (lbl) lbl.textContent = kriOpen ? t('dom.kri.hide') : t('dom.kri.show');
      });
      const pst = statusApi && typeof statusApi.pipeline === 'function' ? safe(() => statusApi.pipeline(data.state, p), 'demo') : 'demo';
      const el = card({
        code: 'SCH-08', title: t('dom.kri.title'),
        subtitle: p ? t('dom.kri.sub', { engine: L(p, 'nameAr', 'pipelines') || p.name, version: p.version || '', count: tn('dom.kri.count', kris.length) }) : label('pipeline', PIPELINE_ID),
        actions: [statusBadge(pst, { size: 'sm', title: t('dom.kri.illustrative') }), toggle, button(t('dom.kri.engine'), { variant: 'ghost', size: 'sm', icon: 'sliders', attrs: { 'aria-label': t('dom.kri.engineAria') }, onClick: () => router.navigate('engine', { pipeline: PIPELINE_ID }) })],
        body: wrap,
      });
      el.classList.add('kri-card');
      return el;
    }

    /* ───────────────────────── build ───────────────────────── */

    function compose() {
      const data = collect();
      const frag = document.createDocumentFragment();
      if (!data.platform) {
        frag.append(buildHead({ ...data, connectors: [], fresh: null }), emptyState({ icon: svgIcon('calendar', 32), title: t('dom.states.noPlatformTitle'), text: t('dom.states.noPlatformText') }));
        return frag;
      }
      frag.append(
        buildHead(data),
        buildKpis(data),
        buildCriticalCard(data),
        h('div', { class: 'dom-row is-1-1' }, buildMonteCarloCard(data), buildResourcesCard(data)),
        buildWeatherCard(data),
        h('div', { class: 'dom-row is-1-1' }, buildApprovalsCard(data), buildSubcontractorsCard(data)),
        buildRisksCard(data),
        buildKriCard(data),
      );
      return frag;
    }

    function focusPath() {
      const a = document.activeElement;
      if (!a || a === root || !root.contains(a)) return null;
      const path = []; let n = a;
      while (n && n !== root) { const parent = n.parentElement; if (!parent) return null; path.unshift(Array.prototype.indexOf.call(parent.children, n)); n = parent; }
      return path;
    }
    function restoreFocus(path) {
      let n = root;
      for (const i of path) { n = n && n.children ? n.children[i] : null; if (!n) return; }
      if (n && typeof n.focus === 'function') { try { n.focus({ preventScroll: true }); } catch { /* ignore */ } }
    }

    function build() {
      raf = 0;
      const keep = built ? focusPath() : null;
      const scroller = root.closest('.main') || document.scrollingElement;
      const top = scroller ? scroller.scrollTop : 0;
      for (const [key, tbl] of tables) tableStates.set(key, safe(() => tbl.getState(), null));
      tables.clear();
      pendingFlash = [];
      let frag;
      try { frag = compose(); } catch (err) {
        console.warn('[schedule] render failed', err);
        frag = errorState({ title: t('dom.states.errorTitle'), text: t('dom.states.errorText'), retry: () => schedule() });
      }
      root.replaceChildren(frag);
      resetPages = false;
      if (!built) {
        built = true;
        if (motion && typeof motion.enter === 'function') motion.enter(Array.from(root.children), { y: 8 });
        return;
      }
      if (scroller && scroller.scrollTop !== top) scroller.scrollTop = top;
      if (keep) restoreFocus(keep);
      if (motion && typeof motion.flash === 'function') pendingFlash.forEach((el) => motion.flash(el));
      pendingFlash = [];
    }

    function schedule() { if (!raf) raf = requestAnimationFrame(build); }

    const RELEVANT = /^(\*|sites|platform$|platform\.(scheduleTasks|monteCarlo|resources|weather|approvals|subcontractors|projects|aiRisks|alerts))/;
    const unsubs = [
      bus.on('store:change', (payload) => { const path = payload && payload.path ? String(payload.path) : '*'; if (RELEVANT.test(path)) schedule(); }),
      bus.on('filters:change', (payload) => { const key = payload && payload.key; if (!key || key === 'siteId' || key === 'range' || key === 'search') { resetPages = true; schedule(); } }),
      bus.on('settings:change', (payload) => {
        const s = (payload && payload.settings) || store.state.settings || {};
        const numerals = s.numerals || 'latn';
        if (numerals !== lastNumerals) { lastNumerals = numerals; schedule(); }
      }),
    ];

    build();

    // Deep link: #/schedule?task=A1020 (code or id) opens the activity drawer.
    const want = ctx.params && (ctx.params.task || ctx.params.id);
    if (want) {
      const data = collect();
      const act = data.platform ? data.tasksAll.find((x) => x.id === want || x.code === want) : null;
      if (act) openActivity(data, act);
    }

    // Deep link: ?risk=AIR-… (mirrored by the shared risk drawer while it is open) reopens that drawer.
    if (ctx.params && ctx.params.risk) openRisk({ id: String(ctx.params.risk) });

    return () => {
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      unsubs.forEach((u) => { try { if (typeof u === 'function') u(); } catch { /* ignore */ } });
      if (openDrawer) { try { openDrawer.close(); } catch { /* ignore */ } openDrawer = null; }
      root.remove();
    };
  },
};
