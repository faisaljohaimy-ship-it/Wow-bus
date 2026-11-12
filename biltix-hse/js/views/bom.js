/**
 * BILTIX Risk AI — view: materials & supply risk (js/views/bom.js) — DOM-02. Owner: B-DOMAINS (v3 Precision).
 *
 * BoM-forecasting domain: v3 heading (scope, freshness, source status), four executive metrics,
 * commodity price + forecast (portfolio level, illustrative), exposure by commodity, supplier
 * concentration with single sources, long-lead items, BoQ↔BIM quantity differences, the open AI
 * risks of the `bom` domain (shared risk drawer) and the pipeline's KRI matrix.
 *
 * Language: js/i18n/bom.js (namespace 'bom', shared block `bom.dom.*`); data through i18n.L /
 * localize, enums through i18n.label, organisations through i18n.term. Nothing translated is cached at
 * module level. Live updates rebuild in place (table state, focus and scroll kept; changed rows flash).
 * Counts come from psel (boqVariance, longLeadItems, supplierConcentration) with local fallbacks.
 */

import { i18n } from '../core/i18n.js';
import dict from '../i18n/bom.js';

i18n.register('bom', dict);

const NS = 'bom';
const DAY_MS = 86_400_000;
const CATEGORY = 'bom';
const PIPELINE_ID = 'bom-forecast';
const SOURCE_CONNECTORS = ['biltix-boq', 'autodesk-aps', 'feed-commodities'];
const LONG_LEAD_DAYS = 45;
const VARIANCE_WARN = 5;
const VARIANCE_CRIT = 15;
const LONG_LEAD_DEFAULT = 5;
const WATCH_DEFAULT = 4;
/** Stored owner value for procurement tasks (Arabic data, mirrored in the English terms dictionary). */
const PROCUREMENT_OWNER = 'م. بدر القرني — مدير المشتريات';

const RATING_TONE = { red: 'critical', yellow: 'warning', green: 'good' };
const TYPE_ICON = { Financial: 'chart', Safety: 'helmet', Delay: 'calendar', Conflict: 'shield-alert' };
const RISK_STATUS_TONE = { 'مكتشف': 'neutral', 'تنبيه': 'warning', 'مهمة مُسندة': 'brand', 'قيد المعالجة': 'accent', 'مغلق': 'good', 'مُتجاوز': 'neutral' };
const SPEC_TONE = { 'مطابق': 'good', 'غير مطابق': 'critical', 'قيد المراجعة': 'warning' };
const TREND_META = { 'صاعد': { tone: 'serious', glyph: 'serious' }, 'هابط': { tone: 'good', glyph: 'good' }, 'مستقر': { tone: 'neutral', glyph: 'neutral' } };
const CREDIT_TONE = { A: 'good', B: 'warning', C: 'critical' };
const CLOSED_RISK = new Set(['مغلق', 'مُتجاوز']);
const OPEN_TASK = new Set(['جديدة', 'قيد التنفيذ', 'متأخرة']);

const V = '.view-bom';
const STYLE_ID = 'view-bom-style';
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
${V} .link-btn { display: inline; padding: 0; border: 0; background: none; color: var(--ink-1); font: inherit; font-weight: 500; text-align: start; cursor: pointer; border-radius: 4px; min-block-size: 24px; }
${V} .link-btn:hover { color: var(--link, var(--brand-text)); text-decoration: underline; }
${V} .link-btn[aria-pressed="true"] { color: var(--brand-text); font-weight: 600; }
${V} .urgent-item.is-compact { grid-template-columns: minmax(0, 1fr) auto; padding-block: 8px; }
${V} .urgent-item.is-compact > .urgent-icon { display: none; }
${V} .urgent-item.is-selected { border-color: color-mix(in srgb, var(--brand) 50%, var(--line)); background: color-mix(in srgb, var(--brand) 9%, var(--bg-2)); }
${V} .urgent-sub { display: flex; flex-wrap: wrap; align-items: center; gap: 2px 10px; }
${V} .pick-row { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 8px 12px; }
${V} .pick-row .field-control { inline-size: auto; min-inline-size: 12rem; max-inline-size: 100%; }
${V} .hero-facts { grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); }
${V} .fact-sub { font-size: var(--fs-xs); color: var(--ink-3); }
${V} .qty-pair { display: flex; flex-direction: column; align-items: flex-end; gap: 2px; white-space: nowrap; }
${V} .qty-pair .t-helper { font-size: var(--fs-xs); }
${V} .boq-desc { overflow-wrap: break-word; }
${V} .kri-wrap[hidden] { display: none; }
${V} .chev { transition: transform var(--dur-micro) var(--ease-out); }
${V} [aria-expanded="true"] .chev { transform: rotate(180deg); }
@media (prefers-reduced-motion: reduce) { ${V} .chev { transition: none; } }
@media (pointer: coarse) { ${V} .link-btn { min-block-size: 40px; min-inline-size: 40px; } }
`;

/** UI state that survives re-renders inside one visit (no strings). */
let selectedCommodityId = null;
let kriOpen = false;
let longLeadExpanded = false;
let watchExpanded = false;
let riskDrawerFailed = false;

const LATIN_NUM_TOKEN = /[A-Za-z][A-Za-z0-9._-]*\d[A-Za-z0-9._-]*|\d+[A-Za-z][A-Za-z0-9._-]*/g;
const CODE_RE = /\b[A-Z]{1,5}-[A-Z0-9-]*\d[A-Z0-9-]*\b/g;
const safe = (fn, fallback) => { try { const v = fn(); return v === undefined ? fallback : v; } catch { return fallback; } };
const lower = (v) => String(v ?? '').toLowerCase();
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const fill = (tpl, params) => String(tpl ?? '').replace(/\{(\w+)\}/g, (m, k) => (params && params[k] !== undefined && params[k] !== null ? String(params[k]) : m));

function ensureStyle() {
  if (typeof document === 'undefined' || document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = STYLE_TEXT;
  document.head.appendChild(style);
}

export default {
  id: 'bom',
  code: 'DOM-02',
  get title() { return i18n.t('core.nav.bom.title'); },
  icon: 'list',

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

    ensureStyle();
    const root = h('section', { class: 'view view-bom' });
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
    const money = (n) => (Number.isFinite(Number(n)) ? fmt.currency(Number(n), { compact: true }) : '—');
    const moneyFull = (n, digits = 0) => (Number.isFinite(Number(n)) ? fmt.currency(Number(n), { digits }) : '—');
    const nowDate = () => (typeof store.now === 'function' ? store.now() : new Date());
    const startOfToday = () => { const d = nowDate(); d.setHours(0, 0, 0, 0); return d; };
    const daysUntil = (iso) => { const d = fmt.toDate(iso); if (!d) return null; d.setHours(0, 0, 0, 0); return Math.round((d.getTime() - startOfToday().getTime()) / DAY_MS); };
    const isoPlusDays = (days) => { const d = startOfToday(); d.setDate(d.getDate() + days); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
    const siteOf = (state, id) => (state.sites || []).find((x) => x && x.id === id) || null;
    const siteName = (state, id) => { const s = siteOf(state, id); return digitsIn(s ? L(s, 'name', 'sites') : (id || '—')); };
    const unitLabel = (u) => (u ? (label('unit', u) || term(u)) : '');
    let monthFmt = null;
    function monthLabel(ym) {
      const m = /^(\d{4})-(\d{2})/.exec(String(ym || ''));
      if (!m) return digitsIn(ym);
      try { if (!monthFmt) monthFmt = new Intl.DateTimeFormat(fmt.locale(), { month: 'short', year: '2-digit' }); return monthFmt.format(new Date(Number(m[1]), Number(m[2]) - 1, 1)); } catch { return digitsIn(ym); }
    }

    function ratingOf(score) {
      const r = psel && typeof psel.rating === 'function' ? safe(() => psel.rating(num(score)), null) : null;
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
    const typeChip = (type) => h('span', { class: ['type-chip', type ? `is-${lower(type)}` : null], 'data-type': type || undefined }, svgIcon(TYPE_ICON[type] || 'list', 12), h('span', {}, label('aiType', type) || '—'));
    const enumBadge = (ns, value, tones, fallback = 'neutral') => badge(label(ns, value) || '—', tones[value] || fallback);
    const trendBadge = (trend) => { const m = TREND_META[trend] || TREND_META['مستقر']; return badge(label('trend', trend || 'مستقر'), m.tone, { icon: glyph(m.glyph, 12) }); };
    const varianceTone = (pct) => { const a = Math.abs(num(pct)); return a >= VARIANCE_CRIT ? 'critical' : a >= VARIANCE_WARN ? 'warning' : 'good'; };
    function varianceBadge(pct) {
      const tone = varianceTone(pct);
      const b = badge(fmt.signedPct(num(pct), 1), tone);
      b.title = tone === 'good' ? t('variance.within', { pct: fmt.pct(VARIANCE_WARN) }) : tone === 'warning' ? t('variance.review') : t('variance.major');
      return b;
    }
    function dueBadge(days) {
      if (days === null || days === undefined) return badge('—', 'neutral');
      if (days < 0) return badge(tn('dom.lateDays', Math.abs(days)), 'critical');
      if (days === 0) return badge(t('dom.today'), 'critical');
      return badge(tn('dom.inDays', days), days <= 14 ? 'warning' : 'neutral');
    }

    function makeChart(name, opts) {
      if (!charts || typeof charts[name] !== 'function') return null;
      try { const c = charts[name](opts); return c && c.el instanceof Node ? c : null; } catch (err) { console.warn(`[bom] charts.${name}`, err); return null; }
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
      const platform = (psel && typeof psel.platform === 'function' ? safe(() => psel.platform(state), null) : null) || state.platform || null;
      if (!platform || !Array.isArray(platform.boqItems)) return { state, filters, siteId, search, platform: null };
      const inScope = (item) => !siteId || item.projectId === siteId;

      const commodities = (platform.commodities || []).filter(Boolean).map((c) => i18n.localize(c, 'commodities'));
      if (!selectedCommodityId || !commodities.some((c) => c.id === selectedCommodityId)) {
        const top = commodities.slice().sort((a, b) => num(b.exposureSAR) - num(a.exposureSAR))[0];
        selectedCommodityId = top ? top.id : null;
      }
      const commodity = commodities.find((c) => c.id === selectedCommodityId) || null;
      const totalExposure = commodities.reduce((n, c) => n + num(c.exposureSAR), 0);

      const supplierById = new Map((platform.suppliers || []).filter(Boolean).map((s) => [s.id, i18n.localize(s, 'suppliers')]));
      const boqAll = (platform.boqItems || []).filter((b) => b && inScope(b)).map((b) => ({ ...i18n.localize(b, 'boqItems'), supplier: supplierById.get(b.supplierId) || null }));
      const matches = (b) => !search || [b.code, b.description, b.supplier && b.supplier.name, label('specCompliance', b.specCompliance)].some((f) => lower(f).includes(search));
      const boqItems = boqAll.filter(matches);

      const scopedIds = new Set(boqAll.map((b) => b.supplierId).filter(Boolean));
      let concentration = psel && typeof psel.supplierConcentration === 'function' ? safe(() => psel.supplierConcentration(state), null) : null;
      if (!Array.isArray(concentration)) concentration = (platform.suppliers || []).filter(Boolean).slice().sort((a, b) => num(b.shareOfSpendPct) - num(a.shareOfSpendPct));
      concentration = concentration.map((s) => ({ ...s, ...(supplierById.get(s.id) || {}) }));
      const suppliersNarrowed = !!siteId && concentration.some((s) => scopedIds.has(s.id));
      if (suppliersNarrowed) concentration = concentration.filter((s) => scopedIds.has(s.id));
      const singleSource = concentration.filter((s) => s.singleSource);

      const varSel = psel && typeof psel.boqVariance === 'function' ? safe(() => psel.boqVariance(state, filters, VARIANCE_WARN), null) : null;
      const varianceCount = Array.isArray(varSel) ? varSel.length : boqItems.filter((b) => Math.abs(num(b.variancePct)) >= VARIANCE_WARN).length;
      const varianceCrit = boqItems.filter((b) => Math.abs(num(b.variancePct)) >= VARIANCE_CRIT).length;

      const llSel = psel && typeof psel.longLeadItems === 'function' ? safe(() => psel.longLeadItems(state, LONG_LEAD_DAYS, filters), null) : null;
      const locBoq = new Map(boqAll.map((b) => [b.id, b]));
      let longLead = Array.isArray(llSel)
        ? llSel.map((b) => ({ ...(locBoq.get(b.id) || b), days: Number.isFinite(b.daysToOrder) ? b.daysToOrder : daysUntil(b.orderBy) }))
        : boqAll.filter((b) => num(b.leadTimeDays) >= LONG_LEAD_DAYS).map((b) => ({ ...b, days: daysUntil(b.orderBy) }));
      longLead = longLead.sort((a, b) => (a.days ?? 9999) - (b.days ?? 9999));

      const nonCompliant = boqAll.filter((b) => b.specCompliance === 'غير مطابق').length;
      const underReview = boqAll.filter((b) => b.specCompliance === 'قيد المراجعة').length;

      let openRisks = psel && typeof psel.openAiRisks === 'function' ? safe(() => psel.openAiRisks(state, filters), null) : null;
      if (!Array.isArray(openRisks)) openRisks = (platform.aiRisks || []).filter((r) => r && !CLOSED_RISK.has(r.status) && inScope(r));
      const domainRisks = openRisks.filter((r) => r && r.category === CATEGORY).sort((a, b) => num(b.score) - num(a.score));

      let categoryScore = null;
      const scores = psel && typeof psel.categoryScores === 'function' ? safe(() => psel.categoryScores(state, filters), null) : null;
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

      return { state, filters, siteId, search, platform, commodities, commodity, totalExposure, supplierById, concentration, suppliersNarrowed, singleSource, boqAll, boqItems, varianceCount, varianceCrit, longLead, nonCompliant, underReview, domainRisks, categoryScore, fresh, connectors, pipeline: pipeline ? i18n.localize(pipeline, 'pipelines') : null };
    }

    const scopeLabel = (data) => (data.siteId ? siteName(data.state, data.siteId) : i18n.t('core.filters.allProjects'));

    /* ───────────────────────── actions ───────────────────────── */

    function relatedRisks(platform, item) {
      const code = lower(item.code);
      return (platform.aiRisks || []).filter((r) => r && r.category === CATEGORY && !CLOSED_RISK.has(r.status) && r.projectId === item.projectId
        && lower(`${r.evidence && r.evidence.ref} ${r.evidence && r.evidence.excerpt} ${r.title} ${r.driverExplanation}`).includes(code));
    }

    function createProcurementTask(data, item) {
      if (typeof store.addTask !== 'function') { toast(t('dom.task.unavailable'), { tone: 'warning' }); return null; }
      const raw = (data.platform.boqItems || []).find((b) => b && b.id === item.id) || item;
      const rawSupplier = (data.platform.suppliers || []).find((s) => s && s.id === raw.supplierId) || null;
      const risk = relatedRisks(data.platform, raw)[0] || null;
      const title = fill(dict.ar.task.title, { code: raw.code, description: raw.description });
      const titleEn = isEn() ? fill(dict.en.task.title, { code: raw.code, description: item.description }) : fill(dict.en.task.titleShort, { code: raw.code });
      const dup = (data.platform.tasks || []).find((x) => x && OPEN_TASK.has(x.status) && ((risk && x.riskId === risk.id) || x.title === title));
      if (dup) { toast(t('dom.task.duplicate', { code: dup.code || dup.id }), { tone: 'neutral', action: { label: t('dom.task.openTasks'), onClick: () => router.navigate('tasks') } }); return dup; }
      const variance = `${num(raw.variancePct) > 0 ? '+' : ''}${num(raw.variancePct)}%`;
      const description = fill(dict.ar.task.description, { variance, lead: num(raw.leadTimeDays), compliance: raw.specCompliance || '—', supplier: rawSupplier ? fill(dict.ar.task.supplier, { name: rawSupplier.name }) : '' });
      const descriptionEn = isEn()
        ? fill(dict.en.task.description, { variance, lead: num(raw.leadTimeDays), compliance: label('specCompliance', raw.specCompliance) || '—', supplier: item.supplier ? fill(dict.en.task.supplier, { name: item.supplier.name }) : '' })
        : fill(dict.en.task.descriptionShort, { variance, lead: num(raw.leadTimeDays) });
      const owner = (risk && risk.owner) || PROCUREMENT_OWNER;
      const overdue = (daysUntil(raw.orderBy) ?? 1) < 0;
      let task = null;
      try {
        task = store.addTask({ title, titleEn, description, descriptionEn, projectId: raw.projectId, riskId: risk ? risk.id : null, owner, dueDate: isoPlusDays(overdue ? 2 : 7), status: 'جديدة', source: 'manual', origin: { view: 'bom', boqItemId: raw.id } });
      } catch (err) { console.warn('[bom] addTask', err); task = null; }
      if (!task) { toast(t('dom.task.failed'), { tone: 'critical' }); return null; }
      const p = { task: task.code || task.id, owner: term(owner), risk: risk ? risk.code : '' };
      toast(`${t(risk ? 'task.createdLinked' : 'task.created', p)} ${t('dom.task.writebackSim')}`, { tone: 'good', action: { label: t('dom.task.openTasks'), onClick: () => router.navigate('tasks') } });
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

    function supplierBlock(s) {
      if (!s) return h('p', { class: 't-helper' }, t('drawer.noSupplier'));
      const healthTone = num(s.financialHealth) >= 70 ? 'good' : num(s.financialHealth) >= 50 ? 'warning' : 'critical';
      const delTone = num(s.deliveryPerformancePct) >= 90 ? 'good' : num(s.deliveryPerformancePct) >= 75 ? 'warning' : 'critical';
      return h('div', { class: 'stack gap-3' },
        h('div', { class: 'row between wrap gap-2' },
          h('div', { class: 'cell-stack' }, h('span', { class: 't-card' }, digitsIn(s.name)), h('span', { class: 'cell-sub' }, t('suppliers.watchMeta', { category: s.category || '—', country: s.country || '—' }))),
          h('div', { class: 'row gap-2 wrap' }, s.singleSource ? badge(t('suppliers.single'), 'critical') : badge(t('suppliers.multi'), 'good'), badge(t('suppliers.creditBadge', { rating: s.creditRating || '—' }), CREDIT_TONE[s.creditRating] || 'neutral')),
        ),
        h('div', { class: 'bar-pair' },
          h('div', { class: 'bar-pair-row' }, h('span', {}, t('drawer.health')), progress({ value: num(s.financialHealth), max: 100, tone: healthTone, label: t('drawer.healthAria') }), h('span', { class: 'progress-value' }, fmt.num(num(s.financialHealth)))),
          h('div', { class: 'bar-pair-row' }, h('span', {}, t('drawer.delivery')), progress({ value: num(s.deliveryPerformancePct), max: 100, tone: delTone, label: t('drawer.deliveryAria') }), h('span', { class: 'progress-value' }, fmt.pct(num(s.deliveryPerformancePct)))),
          h('div', { class: 'bar-pair-row' }, h('span', {}, t('drawer.share')), progress({ value: num(s.shareOfSpendPct), max: 100, tone: 'brand', label: t('drawer.shareAria') }), h('span', { class: 'progress-value' }, fmt.pct(num(s.shareOfSpendPct), 1))),
        ),
      );
    }

    function openItem(data, item) {
      if (!item) return;
      if (openDrawer) { try { openDrawer.close(); } catch { /* ignore */ } openDrawer = null; }
      const opener = document.activeElement && root.contains(document.activeElement) ? document.activeElement : null;
      const s = item.supplier;
      const qtyDiff = num(item.bimQty) - num(item.boqQty);
      const costImpact = Math.abs(qtyDiff) * num(item.unitPrice);
      const related = relatedRisks(data.platform, item);
      const vTone = varianceTone(item.variancePct);
      const unit = unitLabel(item.unit);
      const lead = num(item.leadTimeDays);
      const openLinked = (r) => { const back = opener; if (openDrawer) openDrawer.close(); openRisk(r, back); };
      openDrawer = drawer({
        title: digitsIn(item.description),
        subtitle: t('drawer.subtitle', { code: `⁨${item.code}⁩`, site: siteName(data.state, item.projectId) }),
        size: 'lg', kind: 'boq', returnFocus: opener,
        tabs: [
          { id: 'overview', label: t('drawer.tabs.overview'), render: () => h('div', { class: 'stack gap-4' },
            h('div', { class: 'row between wrap gap-2' },
              h('div', { class: 'row gap-2 wrap' }, enumBadge('specCompliance', item.specCompliance, SPEC_TONE), varianceBadge(item.variancePct)),
              h('span', { class: 'row gap-2', style: { alignItems: 'center' } }, h('span', { class: 't-label' }, t('drawer.riskScore')), scoreCell(item.riskScore))),
            kv([
              [t('drawer.project'), siteName(data.state, item.projectId)],
              [t('drawer.unit'), unit || '—'],
              [t('drawer.boqQty'), h('span', { class: 'mono' }, fmt.num(num(item.boqQty), { maximumFractionDigits: 1 }))],
              [t('drawer.bimQty'), h('span', { class: 'mono' }, fmt.num(num(item.bimQty), { maximumFractionDigits: 1 }))],
              [t('drawer.diff'), h('span', { class: ['row', 'gap-2', `tone-${vTone}`], style: { alignItems: 'center' } }, h('span', { class: 'mono', dir: 'ltr' }, `${fmt.signed(qtyDiff, 1)} ${unit}`.trim()), varianceBadge(item.variancePct))],
              [t('drawer.unitPrice'), moneyFull(item.unitPrice, 2)],
              [t('drawer.impact'), moneyFull(Math.round(costImpact))],
              [t('drawer.lead'), lead >= LONG_LEAD_DAYS ? t('drawer.longLead', { days: tn('dom.days', lead) }) : tn('dom.days', lead)],
              [t('drawer.orderBy'), h('span', { class: 'row gap-2 wrap', style: { alignItems: 'center' } }, fmt.date(item.orderBy), dueBadge(daysUntil(item.orderBy)))],
              [t('drawer.requiredBy'), fmt.date(item.requiredBy)],
            ]),
          ) },
          { id: 'supplier', label: t('drawer.tabs.supplier'), render: () => supplierBlock(s) },
          { id: 'risks', label: t('drawer.tabs.risks'), count: related.length, render: () => relatedList(related, openLinked) },
        ],
        actions: [
          { label: t('drawer.createTask'), variant: 'primary', icon: 'list', closes: false, onClick: () => { createProcurementTask(data, item); return false; } },
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
          h('span', { class: 'code-tag' }, 'DOM-02'),
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
      const overdueLong = data.longLead.filter((b) => b.days !== null && b.days < 0).length;
      return h('div', { class: 'metric-grid', role: 'group', 'aria-label': t('title') },
        metricTile({ key: 'score', label: t('kpi.score'), value: fmt.num(num(cs.score)), scale: `/${fmt.num(100)}`, tone: RATING_TONE[r], icon: svgIcon('list', 16), spark: spark ? spark.el : null, foot: ratingBadge(cs.score), helper: t('dom.scoreHelper', { open: tn('dom.openRisks', num(cs.open)), red: tn('dom.redRisks', num(cs.red)) }), title: t('dom.scoreFormula') }),
        metricTile({ key: 'single', label: t('kpi.single'), value: fmt.num(data.singleSource.length), tone: data.singleSource.length ? 'critical' : 'good', icon: glyph(data.singleSource.length ? 'critical' : 'good', 16), helper: data.singleSource.length ? tn('kpi.singleSome', data.singleSource.length) : t('kpi.singleNone'), onClick: () => scrollToSection('suppliers') }),
        metricTile({ key: 'variance', label: t('kpi.variance', { pct: fmt.pct(VARIANCE_WARN) }), value: fmt.num(data.varianceCount), tone: data.varianceCrit ? 'critical' : data.varianceCount ? 'warning' : 'good', icon: glyph(data.varianceCrit ? 'critical' : 'warning', 16), helper: t('kpi.varianceHelper', { total: tn('items', data.boqAll.length) }), onClick: () => scrollToSection('variance') }),
        metricTile({ key: 'longLead', label: t('kpi.longLead'), value: fmt.num(data.longLead.length), tone: overdueLong ? 'critical' : data.longLead.length ? 'warning' : 'good', icon: glyph(overdueLong ? 'critical' : 'clock', 16), helper: tn('kpi.longLeadOverdue', overdueLong), onClick: () => scrollToSection('longLead') }),
      );
    }

    function buildCommodityCard(data) {
      const c = data.commodity;
      if (!c) return card({ code: 'BOM-01', title: t('commodity.title'), body: emptyState({ title: t('commodity.empty') }) });
      const series = Array.isArray(c.series) ? c.series.map(num) : [];
      const forecast = Array.isArray(c.forecast) ? c.forecast.map(num) : [];
      const months = Array.isArray(c.months) ? c.months : [];
      const fMonths = Array.isArray(c.forecastMonths) ? c.forecastMonths : [];
      const labels = months.concat(fMonths).map(monthLabel);
      while (labels.length < series.length + forecast.length) labels.push('');
      const actualValues = series.concat(new Array(forecast.length).fill(null));
      const forecastValues = new Array(Math.max(0, series.length - 1)).fill(null).concat(series.length ? [series[series.length - 1]] : []).concat(forecast);
      const unit = unitLabel(c.unit);
      const mActual = tn('commodity.months', series.length);
      const mForecast = tn('commodity.months', forecast.length);
      const chart = series.length ? makeChart('lineChart', {
        series: [{ id: 'actual', label: t('commodity.actual'), color: 'var(--s1)', values: actualValues }, { id: 'forecast', label: t('commodity.forecast'), color: 'var(--s2)', values: forecastValues }],
        labels, height: 240, yFormat: (v) => fmt.num(v, { maximumFractionDigits: 1 }), ariaLabel: t('commodity.aria', { name: c.name, unit, actual: mActual, forecast: mForecast }),
      }) : null;
      const fallback = () => simpleTable(t('commodity.caption', { name: c.name }), [t('commodity.month'), t('commodity.actual'), t('commodity.forecast')], labels.map((l, i) => [l, actualValues[i] === null ? '—' : fmt.num(actualValues[i], { maximumFractionDigits: 1 }), forecastValues[i] == null ? '—' : fmt.num(forecastValues[i], { maximumFractionDigits: 1 })]));
      const last = series.length ? series[series.length - 1] : 0;
      const first = series.length ? series[0] : 0;
      const end = forecast.length ? forecast[forecast.length - 1] : last;
      const change = first ? ((last - first) / first) * 100 : 0;
      const outlook = last ? ((end - last) / last) * 100 : 0;
      const vol = num(c.volatilityPct);
      const volTone = vol >= 20 ? 'critical' : vol >= 10 ? 'warning' : 'good';
      const fact = (lbl, value, sub = null, tone = null) => h('div', { class: ['fact', tone ? `tone-${tone}` : null] }, h('span', { class: 'fact-label' }, lbl), h('span', { class: 'fact-value' }, value), sub ? h('span', { class: 'fact-sub' }, sub) : null);
      const select = h('select', { class: 'field-control', 'aria-label': t('commodity.pick'), onChange: (e) => { selectedCommodityId = e.target.value; schedule(); } },
        ...data.commodities.map((x) => h('option', { value: x.id, selected: x.id === c.id }, digitsIn(x.name))));
      const body = h('div', { class: 'stack gap-3' },
        h('div', { class: 'pick-row' }, h('label', { class: 't-label' }, t('commodity.pick'), ' ', select), h('span', { class: 'sim-tag', title: t('commodity.note') }, i18n.t('core.common.illustrative'))),
        chart ? chart.el : fallback(),
        h('div', { class: 'hero-facts' },
          fact(t('commodity.lastPrice'), h('span', {}, h('span', { class: 'mono' }, fmt.num(last, { maximumFractionDigits: 1 })), h('small', {}, t('commodity.perUnit', { unit }))), t('commodity.change', { pct: fmt.signedPct(change, 1), months: mActual })),
          fact(t('commodity.volatility'), h('span', { class: 'mono' }, fmt.pct(vol, 1)), t(volTone === 'critical' ? 'commodity.volHigh' : volTone === 'warning' ? 'commodity.volMid' : 'commodity.volLow'), volTone),
          fact(t('commodity.exposure'), money(c.exposureSAR), t('commodity.exposureShare', { pct: fmt.pct(data.totalExposure ? (num(c.exposureSAR) / data.totalExposure) * 100 : 0) })),
          fact(t('commodity.outlook', { months: mForecast }), h('span', { class: 'row gap-2', style: { alignItems: 'center' } }, h('span', { class: 'mono' }, fmt.signedPct(outlook, 1)), trendBadge(c.trend)), t('commodity.outlookTo', { price: fmt.num(end, { maximumFractionDigits: 1 }), unit })),
        ),
        h('p', { class: 't-helper' }, t('commodity.note')),
      );
      const el = card({ code: 'BOM-01', title: t('commodity.title'), subtitle: t('commodity.sub', { name: c.name, actual: mActual, forecast: mForecast }), body, tableView: chartTable(chart, fallback) });
      el.dataset.section = 'commodity';
      return el;
    }

    function buildExposureCard(data) {
      const rows = data.commodities.slice().sort((a, b) => num(b.exposureSAR) - num(a.exposureSAR));
      const list = h('ul', { class: 'urgent-list', 'aria-label': t('exposure.aria') }, ...rows.map((c) => {
        const spark = makeChart('sparkline', { values: (c.series || []).map(num), width: 80, height: 24, color: 'var(--ink-3)', accentLast: true });
        const active = c.id === selectedCommodityId;
        const tone = (TREND_META[c.trend] || TREND_META['مستقر']).tone;
        return h('li', { class: ['urgent-item', 'is-compact', `tone-${tone}`, active ? 'is-selected' : null] },
          h('div', { class: 'urgent-text' },
            h('span', { class: 'row gap-2 wrap', style: { alignItems: 'center' } },
              h('button', { type: 'button', class: 'link-btn', 'aria-pressed': active ? 'true' : 'false', 'aria-label': t('exposure.selectAria', { name: c.name }), onClick: () => { selectedCommodityId = c.id; schedule(); } }, digitsIn(c.name)),
              trendBadge(c.trend)),
            h('span', { class: 'urgent-sub' }, t('exposure.meta', { vol: fmt.pct(num(c.volatilityPct), 1), exp: money(c.exposureSAR) }))),
          h('div', { class: 'urgent-due' }, spark ? spark.el : null));
      }));
      const fallback = () => simpleTable(t('exposure.caption'), [t('exposure.name'), t('exposure.trend'), t('exposure.vol'), t('exposure.exp')], rows.map((c) => [digitsIn(c.name), label('trend', c.trend) || '—', fmt.pct(num(c.volatilityPct), 1), money(c.exposureSAR)]));
      return card({ code: 'BOM-02', title: t('exposure.title'), subtitle: t('exposure.sub', { total: money(data.totalExposure) }), body: rows.length ? list : emptyState({ title: t('exposure.empty') }), tableView: rows.length ? fallback : null });
    }

    function buildSuppliersCard(data) {
      const items = data.concentration.slice(0, 8).map((s) => ({ id: s.id, label: digitsIn(s.name), value: num(s.shareOfSpendPct) }));
      const chart = items.length ? makeChart('barChart', { items, horizontal: true, height: Math.max(200, items.length * 30 + 24), valueFormat: (v) => fmt.pct(v, 1), color: 'var(--s1)', showValues: true, maxBars: 8, ariaLabel: t('suppliers.aria') }) : null;
      const fallback = () => simpleTable(t('suppliers.caption'), [t('suppliers.supplier'), t('suppliers.share'), t('suppliers.source'), t('suppliers.credit'), t('suppliers.lead')], data.concentration.map((s) => [digitsIn(s.name), fmt.pct(num(s.shareOfSpendPct), 1), s.singleSource ? t('suppliers.single') : t('suppliers.multi'), s.creditRating || '—', tn('dom.days', num(s.leadTimeDays))]));
      const watchAll = data.concentration.filter((s) => s.singleSource || s.creditRating === 'C' || num(s.financialHealth) < 50);
      const watch = watchExpanded ? watchAll : watchAll.slice(0, WATCH_DEFAULT);
      const body = h('div', { class: 'stack gap-3' },
        chart ? chart.el : fallback(),
        watchAll.length ? h('div', { class: 'stack gap-2' },
          h('h3', { class: 't-label' }, t('suppliers.watchTitle')),
          h('ul', { class: 'urgent-list' }, ...watch.map((s) => h('li', { class: ['urgent-item', s.singleSource ? 'tone-critical' : 'tone-warning'] },
            h('span', { class: 'urgent-icon' }, glyph(s.singleSource ? 'critical' : 'warning', 15)),
            h('div', { class: 'urgent-text' },
              h('span', { class: 'row gap-2 wrap', style: { alignItems: 'center' } }, h('strong', {}, digitsIn(s.name)), s.singleSource ? badge(t('suppliers.single'), 'critical') : null, badge(t('suppliers.creditBadge', { rating: s.creditRating || '—' }), CREDIT_TONE[s.creditRating] || 'neutral')),
              h('span', { class: 'urgent-sub' }, h('span', {}, t('suppliers.watchMeta', { category: s.category || '—', country: s.country || '—' })), h('span', {}, t('suppliers.health', { value: fmt.num(num(s.financialHealth)) })), h('span', {}, t('suppliers.onTime', { value: fmt.pct(num(s.deliveryPerformancePct)) })))),
            h('div', { class: 'urgent-due' }, h('span', { class: 'mono' }, fmt.pct(num(s.shareOfSpendPct), 1)), h('span', {}, t('suppliers.leadDays', { days: tn('dom.days', num(s.leadTimeDays)) })))))),
          watchAll.length > WATCH_DEFAULT ? h('div', { class: 'row between wrap gap-2' },
            h('span', { class: 't-helper' }, watch.length < watchAll.length ? t('dom.shownOf', { shown: fmt.num(watch.length), total: fmt.num(watchAll.length) }) : ''),
            button(watchExpanded ? t('dom.showLess') : t('dom.showAll', { count: fmt.num(watchAll.length) }), { variant: 'ghost', size: 'sm', icon: h('span', { class: 'chev' }, svgIcon('chevron-down', 15)), attrs: { 'aria-expanded': watchExpanded ? 'true' : 'false' }, onClick: () => { watchExpanded = !watchExpanded; schedule(); } })) : null,
        ) : h('p', { class: 't-helper' }, t('suppliers.watchNone')),
      );
      const el = card({ code: 'BOM-03', title: t('suppliers.title'), subtitle: data.suppliersNarrowed ? t('suppliers.subScoped', { scope: scopeLabel(data), count: tn('suppliersCount', data.concentration.length) }) : t('suppliers.subAll', { count: tn('suppliersCount', data.concentration.length) }), body, tableView: items.length ? chartTable(chart, fallback) : null });
      el.dataset.section = 'suppliers';
      return el;
    }

    function buildLongLeadCard(data) {
      const rows = longLeadExpanded ? data.longLead : data.longLead.slice(0, LONG_LEAD_DEFAULT);
      const list = rows.length ? h('ul', { class: 'urgent-list', 'aria-label': t('longLead.aria') }, ...rows.map((b) => {
        const overdue = b.days !== null && b.days < 0;
        const soon = b.days !== null && b.days >= 0 && b.days <= 14;
        return h('li', { class: ['urgent-item', overdue ? 'is-overdue' : null, overdue ? 'tone-critical' : soon ? 'tone-warning' : 'tone-neutral'] },
          h('span', { class: 'urgent-icon' }, glyph(overdue ? 'critical' : soon ? 'warning' : 'clock', 15)),
          h('div', { class: 'urgent-text' },
            h('span', { class: 'row gap-2 wrap', style: { alignItems: 'baseline' } }, codeSpan(b.code), components.setLabelInName(h('button', { type: 'button', class: 'link-btn', onClick: () => openItem(data, b) }, digitsIn(b.description)), t('longLead.openAria', { code: b.code }))),
            h('span', { class: 'urgent-sub' }, h('span', {}, b.supplier ? digitsIn(b.supplier.name) : t('longLead.noSupplier')), b.supplier && b.supplier.singleSource ? badge(t('suppliers.single'), 'critical') : null, h('span', {}, t('longLead.meta', { lead: tn('dom.days', num(b.leadTimeDays)), date: fmt.date(b.orderBy, { style: 'short' }) })))),
          h('div', { class: 'urgent-due' }, dueBadge(b.days)));
      })) : emptyState({ title: t('longLead.emptyTitle'), text: t('longLead.emptyText', { days: fmt.num(LONG_LEAD_DAYS) }) });
      const more = data.longLead.length > LONG_LEAD_DEFAULT ? button(longLeadExpanded ? t('dom.showLess') : t('dom.showAll', { count: fmt.num(data.longLead.length) }), { variant: 'ghost', size: 'sm', icon: h('span', { class: 'chev' }, svgIcon('chevron-down', 15)), attrs: { 'aria-expanded': longLeadExpanded ? 'true' : 'false' }, onClick: () => { longLeadExpanded = !longLeadExpanded; schedule(); } }) : null;
      const el = card({ code: 'BOM-04', title: t('longLead.title'), subtitle: t('longLead.sub', { count: tn('items', data.longLead.length), days: fmt.num(LONG_LEAD_DAYS) }), actions: more ? [more] : [], body: list, footer: data.longLead.length > rows.length ? h('span', { class: 't-helper' }, t('dom.shownOf', { shown: fmt.num(rows.length), total: fmt.num(data.longLead.length) })) : null });
      el.dataset.section = 'longLead';
      return el;
    }

    function buildVarianceCard(data) {
      const rows = data.boqItems.map((b) => ({ ...b, _absVar: Math.abs(num(b.variancePct)) }));
      const stat = (lbl, value) => h('div', { class: 'dom-stat' }, h('dt', {}, lbl), h('dd', {}, value));
      const stats = h('dl', { class: 'dom-stats' },
        stat(t('variance.stats.items'), fmt.num(data.boqAll.length)),
        stat(t('variance.stats.flagged', { pct: fmt.pct(VARIANCE_WARN) }), fmt.num(data.varianceCount)),
        stat(t('variance.stats.critical', { pct: fmt.pct(VARIANCE_CRIT) }), fmt.num(data.varianceCrit)),
        stat(t('variance.stats.nonCompliant'), fmt.num(data.nonCompliant)),
        stat(t('variance.stats.review'), fmt.num(data.underReview)),
      );
      const table = makeTable('variance', {
        caption: t('variance.caption'), pageSize: 8, rowKey: 'id', stickyFirst: true,
        emptyText: data.search ? t('variance.emptySearch') : t('variance.empty'),
        onRowClick: (r) => openItem(data, r),
        rowLabel: (r) => `${r.code} — ${r.description}`,
        initialSort: { key: '_absVar', dir: 'desc' },
        columns: [
          { key: 'description', label: t('variance.description'), priority: 'high', sortValue: (r) => r.description, render: (r) => h('div', { class: 'cell-stack boq-desc' }, codeSpan(r.code, 'cell-code'), h('span', { class: 'cell-title' }, digitsIn(r.description)), h('span', { class: 'cell-sub row gap-1 wrap', style: { alignItems: 'center' } }, h('span', {}, siteName(data.state, r.projectId)), h('span', {}, t('variance.unit', { unit: unitLabel(r.unit) || '—' })), r.supplier ? h('span', {}, `· ${digitsIn(r.supplier.name)}`) : null, r.supplier && r.supplier.singleSource ? badge(t('suppliers.single'), 'critical') : null)) },
          { key: 'boqQty', label: t('variance.qty'), align: 'end', priority: 'medium', sortValue: (r) => num(r.boqQty), render: (r) => h('div', { class: 'qty-pair' }, h('span', {}, h('span', { class: 't-helper' }, 'BoQ '), h('span', { class: 'mono' }, fmt.num(num(r.boqQty), { maximumFractionDigits: 1 }))), h('span', {}, h('span', { class: 't-helper' }, 'BIM '), h('span', { class: 'mono' }, fmt.num(num(r.bimQty), { maximumFractionDigits: 1 })))) },
          { key: '_absVar', label: t('variance.diff'), priority: 'high', sortValue: (r) => r._absVar, render: (r) => h('div', { class: 'cell-stack', style: { alignItems: 'flex-start' } }, varianceBadge(r.variancePct), enumBadge('specCompliance', r.specCompliance, SPEC_TONE)) },
          { key: 'orderBy', label: t('variance.orderBy'), priority: 'low', sortValue: (r) => (fmt.toDate(r.orderBy) || new Date(0)).getTime(), render: (r) => h('div', { class: 'cell-stack', style: { alignItems: 'flex-start' } }, h('span', { class: 'nowrap' }, fmt.date(r.orderBy, { style: 'short' })), dueBadge(daysUntil(r.orderBy)), h('span', { class: 'cell-sub nowrap' }, t('variance.leadDays', { days: tn('dom.days', num(r.leadTimeDays)) }))) },
        ],
        rows,
      }, (r) => `${r.variancePct}|${r.specCompliance}|${r.orderBy}|${r.bimQty}`);
      const el = card({
        code: 'BOM-05', title: t('variance.title'),
        subtitle: t('variance.sub', { count: tn('items', rows.length), flagged: fmt.num(data.varianceCount), pct: fmt.pct(VARIANCE_WARN) }),
        body: h('div', {}, stats, table.el),
        footer: h('div', { class: 'tone-legend' },
          h('span', { class: 'tone-legend-item tone-good' }, glyph('good', 12), h('span', {}, t('variance.legendOk', { pct: fmt.pct(VARIANCE_WARN) }))),
          h('span', { class: 'tone-legend-item tone-warning' }, glyph('warning', 12), h('span', {}, t('variance.legendReview', { a: fmt.pct(VARIANCE_WARN), b: fmt.pct(VARIANCE_CRIT) }))),
          h('span', { class: 'tone-legend-item tone-critical' }, glyph('critical', 12), h('span', {}, t('variance.legendMajor', { pct: fmt.pct(VARIANCE_CRIT) })))),
      });
      el.dataset.section = 'variance';
      return el;
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
        code: 'BOM-06', title: t('dom.risks.title'),
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
      const bodyId = 'bom-kri-body';
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
        code: 'BOM-07', title: t('dom.kri.title'),
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
        frag.append(buildHead({ ...data, connectors: [], fresh: null }), emptyState({ icon: svgIcon('list', 32), title: t('dom.states.noPlatformTitle'), text: t('dom.states.noPlatformText') }));
        return frag;
      }
      frag.append(
        buildHead(data),
        buildKpis(data),
        h('div', { class: 'dom-row is-2-1' }, buildCommodityCard(data), buildExposureCard(data)),
        h('div', { class: 'dom-row is-1-1' }, buildSuppliersCard(data), buildLongLeadCard(data)),
        buildVarianceCard(data),
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
        console.warn('[bom] render failed', err);
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

    const RELEVANT = /^(\*|sites|platform$|platform\.(boqItems|suppliers|commodities|aiRisks|alerts))/;
    const unsubs = [
      bus.on('store:change', (payload) => { const path = payload && payload.path ? String(payload.path) : '*'; if (RELEVANT.test(path)) schedule(); }),
      bus.on('filters:change', (payload) => { const key = payload && payload.key; if (!key || key === 'siteId' || key === 'range' || key === 'search') { resetPages = true; schedule(); } }),
      bus.on('settings:change', (payload) => {
        const s = (payload && payload.settings) || store.state.settings || {};
        const numerals = s.numerals || 'latn';
        if (numerals !== lastNumerals) { lastNumerals = numerals; schedule(); }
      }),
    ];

    // Deep links: #/bom?commodity=CM1 preselects a commodity; #/bom?item=BQ-… opens a BoQ item.
    if (ctx.params && ctx.params.commodity) selectedCommodityId = String(ctx.params.commodity);
    build();
    const wantItem = ctx.params && (ctx.params.item || ctx.params.id);
    if (wantItem) {
      const data = collect();
      const item = data.platform ? data.boqAll.find((b) => b.id === wantItem || b.code === wantItem) : null;
      if (item) openItem(data, item);
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
