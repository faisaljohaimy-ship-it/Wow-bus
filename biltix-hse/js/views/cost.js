/**
 * BILTIX Risk AI — view: cost risk (js/views/cost.js) — DOM-04. Owner: B-DOMAINS (v3 Precision).
 *
 * Cost domain: v3 heading (scope, freshness, source status, CSV export), a scope filter bar (portfolio
 * or one project while the global filter is "All projects"), four executive metrics, the earned-value
 * strip (CPI / SPI / EAC / ETC / VAC with formulas), cost trend, commodity inflation impact, currency
 * exposure with hedging advice, change-order creep, labour wage index, cost-line variance, the open AI
 * risks of the `cost` domain (shared risk drawer) and the cost-forecast KRI matrix.
 *
 * Language: js/i18n/cost.js (namespace 'cost', shared block `cost.dom.*`); data through i18n.L / localize,
 * enums through i18n.label, organisations through i18n.term. Nothing translated is cached at module
 * level. Metrics come from psel (evm, costForecast, changeOrderSummary, currencyTable,
 * labourIndexSummary, costLinesVariance, commodityExposure) with local fallbacks.
 */

import { i18n } from '../core/i18n.js';
import dict from '../i18n/cost.js';

i18n.register('cost', dict);

const NS = 'cost';
const CATEGORY = 'cost';
const PIPELINE_ID = 'cost-forecast';
const SOURCE_CONNECTORS = ['biltix-cost', 'oracle-erp', 'feed-fx-sama', 'feed-commodities'];
const CO_STATUS = ['مقترح', 'قيد الاعتماد', 'معتمد', 'مرفوض'];
const CO_TONE = { 'مقترح': 'neutral', 'قيد الاعتماد': 'warning', 'معتمد': 'brand', 'مرفوض': 'neutral' };
const LABOUR_DEFAULT = 6;

const RATING_TONE = { red: 'critical', yellow: 'warning', green: 'good' };
const TYPE_ICON = { Financial: 'chart', Safety: 'helmet', Delay: 'clock', Conflict: 'file-text' };
const RISK_STATUS_TONE = { 'مكتشف': 'neutral', 'تنبيه': 'warning', 'مهمة مُسندة': 'brand', 'قيد المعالجة': 'accent', 'مغلق': 'good', 'مُتجاوز': 'neutral' };
const CLOSED_RISK = new Set(['مغلق', 'مُتجاوز']);

const V = '.view-cost';
const STYLE_ID = 'view-cost-style';
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
  ${V} .dom-row.is-3-2 { grid-template-columns: minmax(0, 3fr) minmax(0, 2fr); }
}
${V} .code { font-family: var(--font-mono); font-variant-numeric: tabular-nums; unicode-bidi: isolate; white-space: nowrap; }
${V} .li-pos { font-family: var(--font-mono); font-size: 11px; color: var(--ink-3); unicode-bidi: isolate; }
${V} .cell-stack { display: flex; flex-direction: column; gap: 3px; min-inline-size: 0; }
${V} .cell-sub { font-size: var(--fs-xs); color: var(--ink-3); line-height: 1.45; }
${V} .cell-stack > .cell-code { align-self: flex-start; font-size: var(--fs-xs); color: var(--ink-2); }
${V} .cell-sub.row { display: flex; flex-wrap: wrap; align-items: center; gap: 2px 8px; }
${V} .score-cell { display: inline-flex; align-items: center; gap: 8px; white-space: nowrap; }
${V} .score-cell .t-num { font-weight: 600; font-variant-numeric: tabular-nums; }
${V} .wrap-2 { overflow-wrap: break-word; }
${V} .scope-bar { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 16px; }
${V} .scope-bar .filter-bar { flex: 1 1 320px; }
${V} .evm-strip { grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); }
${V} .evm-formula { font-family: var(--font-mono); font-size: 11px; color: var(--ink-3); white-space: nowrap; }
${V} .hero-facts.evm-facts { grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); }
${V} .fact-label { display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px 6px; }
${V} .fact-label .mono { font-weight: 600; color: var(--ink-1); }
${V} .summary-strip { margin-block-end: var(--space-4); }
${V} .summary-cell .badge { align-self: flex-start; }
${V} .bar-pair-row { grid-template-columns: minmax(6rem, max-content) minmax(48px, 1fr) 3.5em; }
${V} .labour-row { display: grid; grid-template-columns: minmax(0, 1fr) auto auto; align-items: center; gap: 12px; padding-block: 8px; border-block-end: 1px solid var(--line); }
${V} .labour-row:last-child { border-block-end: 0; }
${V} .commodity-list .urgent-item { grid-template-columns: minmax(0, 1fr) auto; }
${V} .link-btn { display: inline; padding: 0; border: 0; background: none; color: var(--ink-1); font: inherit; font-weight: 600; text-align: start; cursor: pointer; border-radius: 4px; min-block-size: 24px; }
${V} .link-btn:hover { color: var(--link, var(--brand-text)); text-decoration: underline; }
${V} .kri-wrap[hidden] { display: none; }
${V} .chev { transition: transform var(--dur-micro) var(--ease-out); }
${V} [aria-expanded="true"] .chev { transform: rotate(180deg); }
@media (prefers-reduced-motion: reduce) { ${V} .chev { transition: none; } }
@media (pointer: coarse) { ${V} .link-btn { min-block-size: 40px; min-inline-size: 40px; } }
`;

/** UI state that survives re-renders inside one visit (no strings). */
let localProject = 'portfolio';
let labourExpanded = false;
let kriOpen = false;
let riskDrawerFailed = false;

const LATIN_NUM_TOKEN = /[A-Za-z][A-Za-z0-9._-]*\d[A-Za-z0-9._-]*|\d+[A-Za-z][A-Za-z0-9._-]*/g;
const CODE_RE = /\b[A-Z]{1,5}-[A-Z0-9-]*\d[A-Z0-9-]*\b/g;
const safe = (fn, fallback) => { try { const v = fn(); return v === undefined ? fallback : v; } catch { return fallback; } };
const lower = (v) => String(v ?? '').toLowerCase();
const arr = (v) => (Array.isArray(v) ? v : []);
const num = (v, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);

function ensureStyle() {
  if (typeof document === 'undefined' || document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = STYLE_TEXT;
  document.head.appendChild(style);
}

export default {
  id: 'cost',
  code: 'DOM-04',
  get title() { return i18n.t('core.nav.cost.title'); },
  icon: 'chart',

  render(container, ctx) {
    const { store, bus, fmt, charts, components, sources, router } = ctx;
    const psel = ctx.psel || null;
    const statusApi = ctx.status || null;
    const motion = ctx.motion || components.motion || null;
    const { h, card, badge, dataTable, button, toast, emptyState, errorState, progress, svgIcon, glyph, statusBadge, filterBar } = components;

    const t = (k, p) => i18n.t(`${NS}.${k}`, p);
    const tn = (k, n, p) => i18n.tn(`${NS}.${k}`, n, p);
    const L = (rec, field, ns) => i18n.L(rec, field, ns);
    const term = (s) => (s ? i18n.term(String(s)) : s);
    const label = (ns, v) => i18n.label(ns, v);
    const psf = (name, ...args) => (psel && typeof psel[name] === 'function' ? safe(() => psel[name](...args), null) : null);

    ensureStyle();
    const root = h('section', { class: 'view view-cost' });
    container.appendChild(root);

    let raf = 0;
    let built = false;
    let resetPages = false;
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
    const money = (v) => (Number.isFinite(Number(v)) ? fmt.currency(Number(v), { compact: true }) : '—');
    const moneyFull = (v) => (Number.isFinite(Number(v)) ? fmt.currency(Number(v)) : '—');
    const signedMoney = (v) => (Number.isFinite(Number(v)) ? fmt.currency(Number(v), { compact: true }) : '—');
    const ratio = (v) => (Number.isFinite(Number(v)) ? fmt.num(Number(v), { maximumFractionDigits: 2, minimumFractionDigits: 2 }) : '—');
    const nowDate = () => (typeof store.now === 'function' ? store.now() : new Date());
    const siteOf = (state, id) => (state.sites || []).find((x) => x && x.id === id) || null;
    const siteName = (state, id) => { const s = siteOf(state, id); return digitsIn(s ? L(s, 'name', 'sites') : (id || '—')); };
    const projectCode = (state, id) => { const s = siteOf(state, id); return s && s.code ? s.code : String(id); };
    const scopeName = (data) => (data.scopeId === 'portfolio' ? t('portfolio') : siteName(data.state, data.scopeId));
    let monthFmt = null;
    const monthLabel = (d) => { try { if (!monthFmt) monthFmt = new Intl.DateTimeFormat(fmt.locale(), { month: 'short', year: '2-digit' }); return monthFmt.format(d); } catch { return fmt.date(d, { style: 'short' }); } };

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
    const typeChip = (type) => h('span', { class: ['type-chip', type ? `is-${lower(type)}` : null], 'data-type': type || undefined }, svgIcon(TYPE_ICON[type] || 'chart', 12), h('span', {}, label('aiType', type) || '—'));
    const enumBadge = (ns, value, tones, fallback = 'neutral') => badge(label(ns, value) || '—', tones[value] || fallback);

    const indexTone = (v) => (!Number.isFinite(v) ? 'neutral' : v >= 1 ? 'good' : v >= 0.9 ? 'warning' : 'critical');
    const cpiLabel = (v) => t(`evm.status.${!Number.isFinite(v) ? 'na' : v >= 1 ? 'within' : v >= 0.9 ? 'pressure' : 'over'}`);
    const spiLabel = (v) => t(`evm.status.${!Number.isFinite(v) ? 'na' : v >= 1 ? 'onTrack' : v >= 0.9 ? 'slight' : 'late'}`);
    const eacTone = (eac, bac) => { if (!Number.isFinite(eac) || !bac) return 'neutral'; const r = eac / bac; return r <= 1 ? 'good' : r <= 1.05 ? 'warning' : 'critical'; };
    const eacLabel = (eac, bac) => { if (!Number.isFinite(eac) || !bac) return t('evm.status.na'); const r = eac / bac; return t(`evm.status.${r <= 1 ? 'eacOk' : r <= 1.05 ? 'eacWarn' : 'eacOver'}`); };
    const varianceTone = (v) => (!Number.isFinite(v) ? 'neutral' : v <= 0 ? 'good' : v <= 5 ? 'warning' : v <= 10 ? 'serious' : 'critical');
    const changeTone = (pct, { badAbove = 2, warnAbove = 0.5 } = {}) => (!Number.isFinite(pct) ? 'neutral' : pct > badAbove ? 'critical' : pct > warnAbove ? 'warning' : 'good');
    function hedge(c) {
      if (c.pegged || c.code === 'USD') return { label: t('currency.hedge.pegged'), tone: 'good' };
      const tone = c.hedging && c.hedging.tone ? c.hedging.tone : (Math.abs(num(c.change30dPct)) >= 3 ? 'critical' : Math.abs(num(c.change30dPct)) >= 1.5 ? 'warning' : 'neutral');
      return { label: t(`currency.hedge.${tone === 'critical' ? 'recommended' : tone === 'warning' ? 'partial' : 'monitor'}`), tone: tone === 'critical' ? 'serious' : tone };
    }

    function makeChart(name, opts) {
      if (!charts || typeof charts[name] !== 'function') return null;
      try { const c = charts[name](opts); return c && c.el instanceof Node ? c : null; } catch (err) { console.warn(`[cost] charts.${name}`, err); return null; }
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

    function evmLocal(plat, ids) {
      const parts = arr(plat.projects).filter((p) => ids.includes(p.id) && p.evm);
      if (!parts.length) return null;
      const sum = (k) => parts.reduce((a, p) => a + num(p.evm[k]), 0);
      const BAC = sum('BAC'); const PV = sum('PV'); const EV = sum('EV'); const AC = sum('AC');
      const CPI = AC ? EV / AC : NaN; const SPI = PV ? EV / PV : NaN; const EAC = Number.isFinite(CPI) && CPI ? BAC / CPI : NaN;
      return { BAC, PV, EV, AC, CPI, SPI, EAC, ETC: EAC - AC, VAC: BAC - EAC, SV: EV - PV, CV: EV - AC, percentComplete: BAC ? (EV / BAC) * 100 : 0, plannedPercent: BAC ? (PV / BAC) * 100 : 0 };
    }

    function collect() {
      const state = store.state;
      const filters = store.filters || { siteId: 'all', range: 30, search: '' };
      const plat = psf('platform', state) || state.platform || null;
      if (!plat || !Array.isArray(plat.projects)) return { state, filters, plat: null, scopeAll: true, scopeId: 'portfolio' };
      const siteId = filters.siteId || 'all';
      const projects = arr(plat.projects);
      const projectIds = projects.map((p) => p.id);
      const scopeAll = siteId === 'all';
      const scopeId = scopeAll ? (localProject === 'portfolio' || !projectIds.includes(localProject) ? 'portfolio' : localProject) : siteId;
      const ids = scopeId === 'portfolio' ? projectIds : [scopeId];
      const selId = scopeId === 'portfolio' ? 'all' : scopeId;
      const scopedFilters = { ...filters, siteId: selId };
      const inScope = (pid) => ids.includes(pid);

      let evm = psf('evm', state, selId);
      if (!evm || !Number.isFinite(Number(evm.BAC)) || !num(evm.BAC)) evm = evmLocal(plat, ids);

      let forecast = psf('costForecast', state, selId, nowDate());
      if (forecast && Array.isArray(forecast.budget) && forecast.budget.length) {
        const n = forecast.budget.length;
        const nowIdx = Number.isInteger(forecast.nowIndex) ? forecast.nowIndex : 7;
        const base = nowDate();
        forecast = { ...forecast, labels: Array.from({ length: n }, (_, i) => monthLabel(new Date(base.getFullYear(), base.getMonth() + (i - nowIdx), 1))) };
      } else forecast = null;

      const commodities = arr(psf('commodityExposure', state) || plat.commodities).map((c) => {
        const series = arr(c.series); const fc = arr(c.forecast);
        const last = num(c.lastPrice, num(series[series.length - 1])); const fcLast = num(fc[fc.length - 1], last);
        const impactPct = num(c.forecastChangePct, last ? ((fcLast / last) - 1) * 100 : 0);
        return { ...i18n.localize(c, 'commodities'), impactPct, impactSAR: num(c.impactSAR, num(c.exposureSAR) * (impactPct / 100)), fcMonths: fc.length };
      }).sort((a, b) => Math.abs(b.impactSAR) - Math.abs(a.impactSAR));

      const currencies = arr(psf('currencyTable', state) || plat.currencies).map((c) => ({ ...c, advice: hedge(c) })).sort((a, b) => num(b.exposureSAR) - num(a.exposureSAR));

      const coSum = psf('changeOrderSummary', state, scopedFilters);
      const changeOrders = arr(coSum ? coSum.items : arr(plat.changeOrders).filter((c) => inScope(c.projectId))).map((c) => i18n.localize(c, 'changeOrders'));
      const coByStatus = CO_STATUS.map((s, i) => {
        const items = changeOrders.filter((c) => c.status === s);
        return { id: s, status: s, label: label('changeOrderStatus', s), count: items.length, amount: items.reduce((a, c) => a + num(c.amountSAR), 0), color: safe(() => charts.paletteFor(i), `var(--s${i + 1})`) };
      });
      const contractValue = projects.filter((p) => inScope(p.id)).reduce((a, p) => a + num(p.contractValueSAR, num(p.budgetSAR)), 0);
      const creepPct = coSum && Number.isFinite(coSum.creepPct) ? coSum.creepPct : (contractValue ? (changeOrders.filter((c) => c.status !== 'مرفوض').reduce((a, c) => a + num(c.amountSAR), 0) / contractValue) * 100 : 0);
      const pendingAmount = coSum ? num(coSum.pending) : changeOrders.filter((c) => c.status === 'مقترح' || c.status === 'قيد الاعتماد').reduce((a, c) => a + num(c.amountSAR), 0);
      const pendingCount = coSum ? num(coSum.pendingCount) : changeOrders.filter((c) => c.status === 'مقترح' || c.status === 'قيد الاعتماد').length;
      const impactDays = coSum ? num(coSum.impactDays) : changeOrders.filter((c) => c.status !== 'مرفوض').reduce((a, c) => a + num(c.impactDays), 0);

      const labour = arr(psf('labourIndexSummary', state) || plat.labourIndex).map((l) => ({ ...i18n.localize(l, 'labourIndex'), change12mPct: num(l.change12mPct) })).sort((a, b) => b.change12mPct - a.change12mPct);
      const linesSel = psf('costLinesVariance', state, scopedFilters);
      const costLines = arr(linesSel || arr(plat.costLines).filter((l) => inScope(l.projectId)))
        .map((l) => ({ ...i18n.localize(l, 'costLines'), variancePct: num(l.variancePct, l.budget ? ((num(l.forecast) - num(l.budget)) / num(l.budget)) * 100 : 0) }))
        .sort((a, b) => b.variancePct - a.variancePct);

      let aiRisks = psf('openAiRisks', state, filters);
      if (!Array.isArray(aiRisks)) aiRisks = arr(plat.aiRisks).filter((r) => !CLOSED_RISK.has(r.status));
      aiRisks = aiRisks.filter((r) => r && r.category === CATEGORY && inScope(r.projectId)).sort((a, b) => num(b.score) - num(a.score));

      let categoryScore = null;
      const scores = psf('categoryScores', state, scopedFilters);
      if (Array.isArray(scores)) categoryScore = scores.find((s) => s && s.category === CATEGORY) || null;
      if (!categoryScore) {
        const vals = aiRisks.map((r) => num(r.score));
        const score = vals.length ? Math.round(0.5 * Math.max(...vals) + 0.5 * (vals.reduce((a, b) => a + b, 0) / vals.length)) : 0;
        categoryScore = { score, open: vals.length, red: vals.filter((v) => ratingOf(v) === 'red').length, trend: [] };
      }

      const nowMs = nowDate().getTime();
      const fresh = arr(plat.aiRisks).filter((r) => r && r.category === CATEGORY && inScope(r.projectId))
        .map((r) => fmt.toDate(r.updatedAt || r.detectedAt)).filter((d) => d && d.getTime() <= nowMs).sort((a, b) => b - a)[0] || null;
      const connectors = SOURCE_CONNECTORS.map((id) => arr(plat.connectors).find((c) => c && c.id === id)).filter(Boolean);
      const pipeline = arr(plat.pipelines).find((p) => p.id === PIPELINE_ID) || null;

      return { state, filters, plat, siteId, scopeAll, scopeId, ids, projects, evm, forecast, commodities, currencies, changeOrders, coByStatus, contractValue, creepPct, pendingAmount, pendingCount, impactDays, labour, costLines, aiRisks, categoryScore, fresh, connectors, pipeline: pipeline ? i18n.localize(pipeline, 'pipelines') : null };
    }

    /* ───────────────────────── sections ───────────────────────── */

    function exportLines(data) {
      if (!sources || typeof sources.exportCSV !== 'function') { toast(t('exportFailed'), { tone: 'warning' }); return; }
      try {
        sources.exportCSV(data.costLines, [
          { key: 'wbs', label: t('exportHead.wbs') }, { key: 'name', label: t('exportHead.name') },
          { key: 'projectId', label: t('exportHead.project'), format: (v) => projectCode(data.state, v) },
          { key: 'budget', label: t('exportHead.budget') }, { key: 'actual', label: t('exportHead.actual') },
          { key: 'committed', label: t('exportHead.committed') }, { key: 'forecast', label: t('exportHead.forecast') },
          { key: 'variancePct', label: t('exportHead.variance') },
        ], `biltix-risk-ai-cost-lines-${data.scopeId === 'portfolio' ? 'portfolio' : projectCode(data.state, data.scopeId)}-${i18n.lang()}.csv`);
        toast(t('exported', { count: fmt.num(data.costLines.length) }), { tone: 'good' });
      } catch { toast(t('exportFailed'), { tone: 'warning' }); }
    }

    function buildHead(data) {
      const conns = data.connectors || [];
      const statuses = [...new Set(conns.map((c) => (statusApi && typeof statusApi.connector === 'function' ? safe(() => statusApi.connector(data.state, c), 'not_connected') : 'not_connected')))];
      const freshText = data.fresh ? t('dom.fresh', { time: fmt.relative(data.fresh, nowDate()) }) : t('dom.freshNone');
      const names = conns.map((c) => digitsIn(L(c, 'name', 'connectors')));
      return h('header', { class: 'view-head' },
        h('div', { class: 'view-head-text' },
          h('span', { class: 'code-tag' }, 'DOM-04'),
          h('h1', { tabindex: '-1' }, t('title')),
          h('p', { class: 'view-lead' }, t('lead')),
          h('div', { class: 'dom-meta' },
            h('span', { class: 'dom-meta-item' }, svgIcon('building', 14), h('span', {}, t('dom.scope', { scope: data.plat ? scopeName(data) : i18n.t('core.filters.allProjects') }))),
            h('span', { class: 'dom-meta-item', title: data.fresh ? t('dom.freshTitle', { time: fmt.dateTime(data.fresh) }) : undefined }, glyph('clock', 14), h('span', {}, freshText)),
            h('span', { class: 'dom-meta-item is-source' }, svgIcon('plug', 14), h('span', {}, names.length ? t('dom.source', { source: names.join(' · ') }) : t('dom.sourceMissing')), ...(statuses.length ? statuses : ['not_connected']).map((st) => statusBadge(st, { size: 'sm' }))),
          ),
        ),
        h('div', { class: 'view-actions' },
          data.plat && sources && typeof sources.exportCSV === 'function' ? button(t('export'), { variant: 'outline', size: 'sm', icon: 'download', attrs: { 'aria-label': t('exportAria') }, onClick: () => exportLines(data) }) : null,
          button(t('dom.register'), { variant: 'ghost', size: 'sm', icon: 'shield-alert', attrs: { 'aria-label': t('dom.registerAria') }, onClick: () => router.navigate('airisks', { domain: CATEGORY }) }),
        ),
      );
    }

    function buildScopeBar(data) {
      if (!data.scopeAll) return null;
      const bar = filterBar({
        label: t('scope.aria'),
        filters: [{ id: 'project', type: 'select', label: t('scope.label'), allOption: false, options: [{ value: 'portfolio', label: t('scope.portfolio') }, ...data.projects.map((p) => ({ value: p.id, label: `${projectCode(data.state, p.id)} — ${siteName(data.state, p.id)}` }))] }],
        value: { project: data.scopeId },
        onChange: (v) => { localProject = v.project || 'portfolio'; resetPages = true; schedule(); },
        onReset: () => { localProject = 'portfolio'; },
      });
      return h('div', { class: 'scope-bar' }, bar.el, h('span', { class: 't-helper' }, data.scopeId === 'portfolio' ? tn('scope.projects', data.projects.length) : t('scope.follows')));
    }

    function buildKpis(data) {
      const cs = data.categoryScore;
      const r = ratingOf(cs.score);
      const spark = Array.isArray(cs.trend) && cs.trend.length > 1 ? makeChart('sparkline', { values: cs.trend, width: 96, height: 28, color: 'var(--ink-3)', accentLast: true }) : null;
      const e = data.evm;
      const cpi = e ? Number(e.CPI) : NaN;
      const creepTone = data.creepPct > 5 ? 'critical' : data.creepPct > 2.5 ? 'warning' : 'good';
      return h('div', { class: 'metric-grid', role: 'group', 'aria-label': t('title') },
        metricTile({ key: 'score', label: t('kpi.score'), value: fmt.num(num(cs.score)), scale: `/${fmt.num(100)}`, tone: RATING_TONE[r], icon: svgIcon('chart', 16), spark: spark ? spark.el : null, foot: ratingBadge(cs.score), helper: t('dom.scoreHelper', { open: tn('dom.openRisks', num(cs.open)), red: tn('dom.redRisks', num(cs.red)) }), title: t('dom.scoreFormula') }),
        metricTile({ key: 'cpi', label: t('kpi.cpi'), value: ratio(cpi), tone: indexTone(cpi), icon: glyph(indexTone(cpi), 16), foot: badge(cpiLabel(cpi), indexTone(cpi)), helper: 'CPI = EV / AC', onClick: () => scrollToSection('evm') }),
        metricTile({ key: 'eac', label: t('kpi.eac'), value: e ? money(e.EAC) : '—', tone: e ? eacTone(Number(e.EAC), Number(e.BAC)) : null, icon: svgIcon('trend-up', 16), helper: e ? t('kpi.eacHelper', { bac: money(e.BAC), vac: signedMoney(e.VAC) }) : '', onClick: () => scrollToSection('evm') }),
        metricTile({ key: 'creep', label: t('kpi.creep'), value: fmt.pct(data.creepPct, 1), tone: creepTone, icon: glyph(creepTone, 16), helper: t('kpi.creepHelper', { count: tn('orders', data.changeOrders.length) }), onClick: () => scrollToSection('co') }),
      );
    }

    function evmCell({ code, name, value, tone, status, formula, hint }) {
      return h('div', { class: ['evm-cell', `tone-${tone}`], 'data-tone': tone, 'data-metric': code },
        h('span', { class: 'evm-label' }, h('abbr', { class: 'mono evm-abbr', title: name, lang: 'en' }, code), h('span', {}, name)),
        h('span', { class: 'evm-value mono' }, value),
        h('span', { class: 'evm-status' }, badge(status, tone)),
        h('span', { class: 'evm-formula', dir: 'ltr', title: t('evm.formula') }, formula),
        hint ? h('span', { class: 'evm-hint' }, hint) : null);
    }

    function buildEvmCard(data) {
      const e = data.evm;
      if (!e) { const c = card({ code: 'CST-01', title: t('evm.title'), body: emptyState({ title: t('evm.emptyTitle'), text: t('evm.emptyText') }) }); c.dataset.section = 'evm'; return c; }
      const CPI = Number(e.CPI); const SPI = Number(e.SPI); const EAC = Number(e.EAC); const BAC = Number(e.BAC); const VAC = Number(e.VAC);
      const one = fmt.num(1);
      const strip = h('div', { class: 'evm-strip', role: 'group', 'aria-label': t('evm.aria') },
        evmCell({ code: 'CPI', name: t('evm.cpi'), value: ratio(CPI), tone: indexTone(CPI), status: cpiLabel(CPI), formula: 'CPI = EV / AC', hint: t('evm.cpiHint', { one }) }),
        evmCell({ code: 'SPI', name: t('evm.spi'), value: ratio(SPI), tone: indexTone(SPI), status: spiLabel(SPI), formula: 'SPI = EV / PV', hint: t('evm.spiHint', { one }) }),
        evmCell({ code: 'EAC', name: t('evm.eac'), value: money(EAC), tone: eacTone(EAC, BAC), status: eacLabel(EAC, BAC), formula: 'EAC = BAC / CPI', hint: t('evm.eacHint', { value: money(BAC) }) }),
        evmCell({ code: 'ETC', name: t('evm.etc'), value: money(e.ETC), tone: 'brand', status: t('evm.status.remaining'), formula: 'ETC = EAC − AC', hint: t('evm.etcHint', { value: money(e.AC) }) }),
        evmCell({ code: 'VAC', name: t('evm.vac'), value: signedMoney(VAC), tone: Number.isFinite(VAC) ? (VAC >= 0 ? 'good' : 'critical') : 'neutral', status: t(`evm.status.${!Number.isFinite(VAC) ? 'na' : VAC >= 0 ? 'saving' : 'deficit'}`), formula: 'VAC = BAC − EAC', hint: VAC < 0 ? t('evm.vacNeg') : t('evm.vacPos') }),
      );
      const facts = h('div', { class: 'hero-facts evm-facts' }, ...[
        ['BAC', t('evm.bac'), e.BAC, 'neutral'], ['PV', t('evm.pv'), e.PV, 'neutral'], ['EV', t('evm.ev'), e.EV, 'neutral'], ['AC', t('evm.ac'), e.AC, 'neutral'],
        ['SV', t('evm.sv'), e.SV, num(e.SV) >= 0 ? 'good' : 'warning'], ['CV', t('evm.cv'), e.CV, num(e.CV) >= 0 ? 'good' : 'critical'],
      ].map(([code, name, value, tone]) => h('div', { class: ['fact', `tone-${tone}`], title: moneyFull(value) },
        h('span', { class: 'fact-label' }, h('span', { class: 'mono', lang: 'en' }, code), h('span', {}, name)),
        h('span', { class: 'fact-value row gap-1', style: { alignItems: 'center' } }, tone === 'neutral' ? null : glyph(tone, 13), h('span', {}, signedMoney(value))))));
      const pc = Math.max(0, Math.min(100, num(e.percentComplete)));
      const pp = Math.max(0, Math.min(100, num(e.plannedPercent)));
      const pair = h('div', { class: 'bar-pair', role: 'group', 'aria-label': t('evm.progressAria') },
        h('div', { class: 'bar-pair-row' }, h('span', {}, t('evm.actual')), progress({ value: pc, tone: pc >= pp ? 'good' : 'warning', label: t('evm.actual') }), h('span', { class: 'progress-value' }, fmt.pct(pc))),
        h('div', { class: 'bar-pair-row' }, h('span', {}, t('evm.planned')), progress({ value: pp, tone: 'brand', label: t('evm.planned') }), h('span', { class: 'progress-value' }, fmt.pct(pp))));
      const statusTone = indexTone(CPI);
      const el = card({
        code: 'CST-01', title: t('evm.title'), subtitle: t('evm.sub', { scope: scopeName(data) }), hero: true,
        actions: [badge(cpiLabel(CPI), statusTone)],
        body: h('div', { class: 'stack gap-4' }, strip, facts, pair),
        footer: h('p', { class: 't-helper' }, t('evm.note')),
      });
      el.dataset.section = 'evm';
      return el;
    }

    function buildTrendCard(data) {
      const f = data.forecast;
      const chart = f ? makeChart('lineChart', {
        series: [
          { id: 'budget', label: t('trend.budget'), color: 'var(--s1)', values: arr(f.budget).map((v) => num(v)) },
          { id: 'actual', label: t('trend.actual'), color: 'var(--s2)', values: arr(f.actual).map((v) => (v === null || v === undefined ? null : num(v))) },
          { id: 'forecast', label: t('trend.forecast'), color: 'var(--s3)', values: arr(f.forecast).map((v) => num(v)) },
        ],
        labels: f.labels, height: 240, yFormat: (v) => fmt.compact(v), ariaLabel: t('trend.aria'),
      }) : null;
      const fallback = () => simpleTable(t('trend.caption'), [t('trend.month'), t('trend.budget'), t('trend.actual'), t('trend.forecast')], arr(f && f.labels).map((m, i) => [m, money(arr(f.budget)[i]), arr(f.actual)[i] == null ? '—' : money(arr(f.actual)[i]), money(arr(f.forecast)[i])]));
      return card({ code: 'CST-02', title: t('trend.title'), subtitle: t('trend.sub'), body: f ? (chart ? chart.el : fallback()) : emptyState({ title: t('trend.empty') }), tableView: f ? chartTable(chart, fallback) : null });
    }

    function buildCommodityCard(data) {
      const items = data.commodities.slice(0, 6);
      if (!items.length) return card({ code: 'CST-03', title: t('commodity.title'), body: emptyState({ title: t('commodity.empty') }) });
      const months = tn('commodity.months', items[0].fcMonths || 6);
      const totalImpact = items.reduce((a, c) => a + num(c.impactSAR), 0);
      const totalExp = data.commodities.reduce((a, c) => a + num(c.exposureSAR), 0);
      const list = h('ul', { class: 'urgent-list commodity-list', 'aria-label': t('commodity.aria') }, ...items.map((c) => {
        const tone = changeTone(c.impactPct, { badAbove: 4, warnAbove: 1 });
        return h('li', { class: ['urgent-item', `tone-${tone}`] },
          h('div', { class: 'urgent-text' },
            h('button', { type: 'button', class: 'link-btn', 'aria-label': t('commodity.openAria', { name: digitsIn(c.name) }), onClick: () => router.navigate('bom', { commodity: c.id }) }, digitsIn(c.name)),
            h('span', { class: 'urgent-sub' }, t('commodity.meta', { exposure: money(c.exposureSAR), vol: fmt.pct(num(c.volatilityPct), 1) }))),
          h('div', { class: 'urgent-due' }, badge(fmt.signedPct(num(c.impactPct), 1), tone), h('span', {}, t('commodity.impact', { value: signedMoney(c.impactSAR) }))));
      }));
      return card({
        code: 'CST-03', title: t('commodity.title'), subtitle: t('commodity.sub', { months }),
        body: list,
        footer: badge(t('commodity.total', { value: signedMoney(totalImpact) }), changeTone(totalExp ? (totalImpact / totalExp) * 100 : 0, { badAbove: 4, warnAbove: 1 })),
      });
    }

    function buildCurrencyCard(data) {
      const rows = data.currencies;
      const days30 = fmt.num(30);
      const table = makeTable('currencies', {
        dense: true, pageSize: 0, rowKey: 'code', stickyFirst: true, emptyText: t('currency.empty'), caption: t('currency.caption'),
        initialSort: { key: 'exposureSAR', dir: 'desc' },
        columns: [
          { key: 'code', label: t('currency.currency'), priority: 'high', render: (r) => h('span', { class: 'row gap-2', style: { alignItems: 'center' } }, codeSpan(r.code), h('span', { class: 'cell-sub', style: { margin: 0 } }, label('currency', r.code) || L(r, 'nameAr', 'currencies'))) },
          { key: 'rate', label: t('currency.rate'), align: 'end', priority: 'medium', render: (r) => h('span', { class: 'mono' }, fmt.num(num(r.rate), { maximumFractionDigits: 4, minimumFractionDigits: 2 })) },
          { key: 'change30dPct', label: t('currency.change', { days: days30 }), align: 'end', priority: 'high', sortValue: (r) => num(r.change30dPct), render: (r) => { const tone = changeTone(Math.abs(num(r.change30dPct)), { badAbove: 3, warnAbove: 1.5 }); return h('span', { class: ['mono', `tone-${tone}`], style: { color: 'var(--tone-ink)' } }, fmt.signedPct(num(r.change30dPct), 1)); } },
          { key: 'exposureSAR', label: t('currency.exposure'), align: 'end', priority: 'high', sortValue: (r) => num(r.exposureSAR), render: (r) => h('span', { class: 'mono nowrap' }, money(r.exposureSAR)) },
          { key: 'forecast30d', label: t('currency.forecast', { days: days30 }), align: 'end', priority: 'low', render: (r) => h('span', { class: 'mono' }, fmt.num(num(r.forecast30d), { maximumFractionDigits: 4, minimumFractionDigits: 2 })) },
          { key: 'advice', label: t('currency.advice'), sortable: false, priority: 'medium', render: (r) => badge(r.advice.label, r.advice.tone) },
        ],
        rows,
      }, (r) => `${r.rate}|${r.exposureSAR}|${r.change30dPct}`);
      const total = rows.reduce((a, c) => a + num(c.exposureSAR), 0);
      return card({ code: 'CST-04', title: t('currency.title'), subtitle: t('currency.sub'), actions: [h('span', { class: 't-helper' }, t('currency.total', { value: money(total) }))], body: table.el });
    }

    function buildChangeOrdersCard(data) {
      const parts = data.coByStatus.filter((p) => p.amount > 0).map((p) => ({ id: p.id, label: p.label, value: p.amount, color: p.color }));
      const seg = parts.length ? makeChart('segmentedBar', { parts, tall: true, valueFormat: (v) => money(v), ariaLabel: t('co.splitAria') }) : null;
      const creepTone = data.creepPct > 5 ? 'critical' : data.creepPct > 2.5 ? 'warning' : 'good';
      const strip = h('div', { class: 'summary-strip' },
        h('div', { class: 'summary-cell' }, h('span', { class: 'summary-label' }, t('co.creep')), h('span', { class: 'summary-value mono' }, fmt.pct(data.creepPct, 1)), badge(t(creepTone === 'critical' ? 'co.creepOver' : creepTone === 'warning' ? 'co.creepNear' : 'co.creepOk'), creepTone)),
        h('div', { class: 'summary-cell' }, h('span', { class: 'summary-label' }, t('co.pending')), h('span', { class: 'summary-value mono' }, money(data.pendingAmount)), h('span', { class: 'cell-sub' }, tn('orders', data.pendingCount))),
        h('div', { class: 'summary-cell' }, h('span', { class: 'summary-label' }, t('co.total')), h('span', { class: 'summary-value mono' }, fmt.num(data.changeOrders.length)), h('span', { class: 'cell-sub' }, t('co.impact', { days: tn('dom.days', data.impactDays) }))),
      );
      const table = makeTable('co', {
        dense: true, pageSize: 5, rowKey: 'id', stickyFirst: true, emptyText: t('co.empty'), caption: t('co.caption'),
        initialSort: { key: 'amountSAR', dir: 'desc' },
        columns: [
          { key: 'title', label: t('co.order'), priority: 'high', sortValue: (r) => r.title, render: (r) => h('span', { class: 'cell-stack wrap-2' }, codeSpan(r.code, 'cell-code'), h('span', { class: 'cell-title' }, ...withCodes(r.title || '—')), h('span', { class: 'cell-sub' }, t('co.meta', { project: data.scopeId === 'portfolio' ? `${projectCode(data.state, r.projectId)} · ` : '', days: tn('dom.days', num(r.impactDays)), when: fmt.relative(r.submittedAt, nowDate()), driver: r.driver ? ` · ${digitsIn(r.driver)}` : '' }))) },
          { key: 'amountSAR', label: t('co.value'), align: 'end', priority: 'high', sortValue: (r) => num(r.amountSAR), render: (r) => h('span', { class: 'cell-stack', style: { alignItems: 'flex-end' } }, h('span', { class: 'mono nowrap' }, money(r.amountSAR)), enumBadge('changeOrderStatus', r.status, CO_TONE)) },
        ],
        rows: data.changeOrders,
      }, (r) => `${r.status}|${r.amountSAR}`);
      const el = card({
        code: 'CST-05', title: t('co.title'), subtitle: t('co.sub'),
        body: h('div', { class: 'stack gap-4' }, strip, seg ? h('div', { class: 'stack gap-1' }, h('span', { class: 't-label' }, t('co.split')), seg.el) : null, table.el),
        tableView: parts.length ? chartTable(null, () => simpleTable(t('co.caption'), [t('co.status'), t('co.count'), t('co.amount')], data.coByStatus.map((p) => [p.label, fmt.num(p.count), money(p.amount)]))) : null,
      });
      el.dataset.section = 'co';
      return el;
    }

    function buildLabourCard(data) {
      if (!data.labour.length) return card({ code: 'CST-06', title: t('labour.title'), body: emptyState({ title: t('labour.empty') }) });
      const months = tn('commodity.months', 12);
      const shown = labourExpanded ? data.labour : data.labour.slice(0, LABOUR_DEFAULT);
      const rows = shown.map((l) => {
        const spark = makeChart('sparkline', { values: arr(l.series).map((v) => num(v)), width: 96, height: 26, color: 'var(--ink-3)', accentLast: true });
        const tone = changeTone(num(l.change12mPct), { badAbove: 6, warnAbove: 3 });
        return h('div', { class: 'labour-row' },
          h('div', { class: 'cell-stack wrap-2' }, h('span', { class: 'cell-title' }, digitsIn(l.trade || '—')), h('span', { class: 'cell-sub', style: { margin: 0 } }, digitsIn(l.region || '—'))),
          spark ? h('span', { class: 'spark', 'aria-hidden': 'true' }, spark.el) : h('span'),
          badge(fmt.signedPct(num(l.change12mPct), 1), tone));
      });
      const more = data.labour.length > LABOUR_DEFAULT ? button(labourExpanded ? t('dom.showLess') : t('dom.showAll', { count: fmt.num(data.labour.length) }), { variant: 'ghost', size: 'sm', icon: h('span', { class: 'chev' }, svgIcon('chevron-down', 15)), attrs: { 'aria-expanded': labourExpanded ? 'true' : 'false' }, onClick: () => { labourExpanded = !labourExpanded; schedule(); } }) : null;
      return card({
        code: 'CST-06', title: t('labour.title'), subtitle: t('labour.sub', { months }),
        body: h('div', {}, ...rows),
        tableView: () => simpleTable(t('labour.caption'), [t('labour.trade'), t('labour.region'), t('labour.change', { months })], data.labour.map((l) => [digitsIn(l.trade), digitsIn(l.region), fmt.signedPct(num(l.change12mPct), 1)])),
        footer: h('div', { class: 'row between wrap gap-2', style: { inlineSize: '100%' } }, h('p', { class: 't-helper' }, data.labour.length > shown.length ? `${t('dom.shownOf', { shown: fmt.num(shown.length), total: fmt.num(data.labour.length) })} ${t('labour.footer')}` : t('labour.footer')), more),
      });
    }

    function buildCostLinesCard(data) {
      const over = data.costLines.filter((l) => l.variancePct > 5).length;
      const table = makeTable('lines', {
        dense: true, pageSize: 6, rowKey: 'id', stickyFirst: true, emptyText: t('lines.empty'), caption: t('lines.caption'),
        initialSort: { key: 'variancePct', dir: 'desc' },
        columns: [
          { key: 'name', label: t('lines.name'), priority: 'high', sortValue: (r) => r.name, render: (r) => h('span', { class: 'cell-stack wrap-2' }, codeSpan(r.wbs ?? '—', 'cell-code'), h('span', { class: 'cell-title' }, digitsIn(r.name || '—')), data.scopeId === 'portfolio' ? h('span', { class: 'cell-sub' }, projectCode(data.state, r.projectId)) : null) },
          { key: 'budget', label: t('lines.budget'), align: 'end', priority: 'medium', sortValue: (r) => num(r.budget), render: (r) => h('span', { class: 'mono nowrap' }, money(r.budget)) },
          { key: 'actual', label: t('lines.actual'), align: 'end', priority: 'low', sortValue: (r) => num(r.actual), render: (r) => h('span', { class: 'mono nowrap' }, money(r.actual)) },
          { key: 'committed', label: t('lines.committed'), align: 'end', priority: 'low', sortValue: (r) => num(r.committed), render: (r) => h('span', { class: 'mono nowrap' }, money(r.committed)) },
          { key: 'forecast', label: t('lines.forecast'), align: 'end', priority: 'medium', sortValue: (r) => num(r.forecast), render: (r) => h('span', { class: 'mono nowrap' }, money(r.forecast)) },
          { key: 'variancePct', label: t('lines.variance'), align: 'end', priority: 'high', sortValue: (r) => r.variancePct, render: (r) => { const tone = varianceTone(r.variancePct); return h('span', { class: 'row gap-2', style: { justifyContent: 'flex-end', alignItems: 'center', flexWrap: 'nowrap' } }, badge(t(`lines.tone.${tone === 'neutral' ? 'good' : tone}`), tone), h('span', { class: 'mono' }, fmt.signedPct(r.variancePct, 1))); } },
        ],
        rows: data.costLines,
      }, (r) => `${r.forecast}|${r.actual}|${r.variancePct}`);
      return card({ code: 'CST-07', title: t('lines.title'), subtitle: t('lines.sub'), actions: [badge(tn('lines.over', over), over ? 'warning' : 'good')], body: table.el });
    }

    function buildRisksCard(data) {
      const rows = data.aiRisks;
      const red = rows.filter((r) => ratingOf(r.score) === 'red').length;
      const table = makeTable('risks', {
        caption: t('dom.risks.caption', { domain: t('domain') }), pageSize: 6, rowKey: 'id', stickyFirst: true,
        emptyText: t('dom.risks.empty'),
        onRowClick: (r, e) => openRisk(r, rowOpener(e)),
        rowLabel: (r) => t('dom.risks.rowLabel', { code: r.code, title: L(r, 'title', 'aiRisks') }),
        initialSort: { key: 'score', dir: 'desc' },
        columns: [
          { key: 'title', label: t('dom.risks.risk'), priority: 'high', sortValue: (r) => L(r, 'title', 'aiRisks'), render: (r) => { const ev = r.evidence ? L(r, 'evidence', 'aiRisks') : null; return h('div', { class: 'cell-stack' }, codeSpan(r.code, 'cell-code'), h('span', { class: 'cell-title' }, ...withCodes(L(r, 'title', 'aiRisks'))), h('span', { class: 'cell-sub row' }, h('span', {}, siteName(data.state, r.projectId)), ev && ev.ref ? h('span', { 'aria-hidden': 'true' }, '·') : null, ev && ev.ref ? h('span', { class: 'mono', dir: 'ltr' }, digitsIn(ev.ref)) : null)); } },
          { key: 'score', label: t('dom.risks.score'), priority: 'high', sortValue: (r) => num(r.score), render: (r) => scoreCell(r.score, r) },
          { key: 'type', label: t('dom.risks.type'), priority: 'medium', sortValue: (r) => label('aiType', r.type), render: (r) => typeChip(r.type) },
          { key: 'owner', label: t('dom.risks.owner'), priority: 'low', sortValue: (r) => term(r.owner) || '', render: (r) => (r.owner ? h('span', {}, term(r.owner)) : h('span', { class: 't-helper' }, t('dom.risks.unassigned'))) },
          { key: 'status', label: t('dom.risks.status'), priority: 'medium', sortValue: (r) => label('aiRiskStatus', r.status), render: (r) => enumBadge('aiRiskStatus', r.status, RISK_STATUS_TONE) },
        ],
        rows,
      }, (r) => `${r.score}|${r.status}|${r.owner}|${r.updatedAt}`);
      return card({
        code: 'CST-08', title: t('dom.risks.title'),
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
      const bodyId = 'cst-kri-body';
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
        code: 'CST-09', title: t('dom.kri.title'),
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
      if (!data.plat) {
        frag.append(buildHead({ ...data, connectors: [], fresh: null }), emptyState({ icon: svgIcon('chart', 32), title: t('dom.states.noPlatformTitle'), text: t('dom.states.noPlatformText') }));
        return frag;
      }
      frag.append(
        buildHead(data),
        ...[buildScopeBar(data)].filter(Boolean),
        buildKpis(data),
        buildEvmCard(data),
        h('div', { class: 'dom-row is-3-2' }, buildTrendCard(data), buildCommodityCard(data)),
        buildCurrencyCard(data),
        h('div', { class: 'dom-row is-3-2' }, buildChangeOrdersCard(data), buildLabourCard(data)),
        buildCostLinesCard(data),
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
        console.warn('[cost] render failed', err);
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

    const RELEVANT = /^(\*|sites|platform$|platform\.(projects|commodities|currencies|changeOrders|labourIndex|costLines|aiRisks|alerts))/;
    const unsubs = [
      bus.on('store:change', (payload) => { const path = payload && payload.path ? String(payload.path) : '*'; if (RELEVANT.test(path)) schedule(); }),
      bus.on('filters:change', (payload) => { const key = payload && payload.key; if (!key || key === 'siteId' || key === 'range' || key === 'search') { resetPages = true; schedule(); } }),
      bus.on('settings:change', (payload) => {
        const s = (payload && payload.settings) || store.state.settings || {};
        const numerals = s.numerals || 'latn';
        if (numerals !== lastNumerals) { lastNumerals = numerals; schedule(); }
      }),
    ];

    // Deep link: #/cost?project=S2 selects a project while the global filter is "All projects".
    if (ctx.params && ctx.params.project) localProject = String(ctx.params.project);
    build();

    // Deep link: ?risk=AIR-… (mirrored by the shared risk drawer while it is open) reopens that drawer.
    if (ctx.params && ctx.params.risk) openRisk({ id: String(ctx.params.risk) });

    return () => {
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      unsubs.forEach((u) => { try { if (typeof u === 'function') u(); } catch { /* ignore */ } });
      root.remove();
    };
  },
};
