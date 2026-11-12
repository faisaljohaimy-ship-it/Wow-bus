/**
 * BILTIX Risk AI — view: contract risk (js/views/contracts.js) — DOM-01. Owner: B-DOMAINS (v3 Precision).
 *
 * Contract-NLP domain of the risk cockpit: v3 heading (scope, freshness, source status), four
 * executive metrics, monitored contracts, flagged clauses, subcontractor concentration, the
 * obligations calendar, the open AI risks of the `contract` domain (shared risk drawer) and the
 * pipeline's KRI matrix. Scoped by the global project filter.
 *
 * Language: every string comes from js/i18n/contracts.js (namespace 'contracts', shared block
 * `contracts.dom.*`); data text through i18n.L / localize, enums through i18n.label, people and
 * organisations through i18n.term. Nothing translated is cached at module level (the router
 * re-mounts the view on 'lang:change').
 * Live updates rebuild the view in place: table sort/page, focus and scroll are kept, changed rows
 * and metrics flash; motion.enter() runs on the first render only.
 * Data reaches the DOM only through textContent / components.h.
 */

import { i18n } from '../core/i18n.js';
import dict from '../i18n/contracts.js';

i18n.register('contracts', dict);

const NS = 'contracts';
const DAY_MS = 86_400_000;
const OBLIGATION_WINDOW_DAYS = 60;
const OBLIGATION_KPI_DAYS = 30;
const OBLIGATIONS_DEFAULT = 6;
const CATEGORY = 'contract';
const PIPELINE_ID = 'contract-nlp';
const SOURCE_CONNECTORS = ['biltix-contracts'];
/** Stored owner value for legal referrals (Arabic data, mirrored in the English terms dictionary). */
const LEGAL_OWNER = 'أ. فيصل الحربي — المستشار القانوني';
const SUBCONTRACT_TYPE = 'عقد من الباطن';

const RATING_TONE = { red: 'critical', yellow: 'warning', green: 'good' };
const TYPE_ICON = { Financial: 'chart', Safety: 'helmet', Delay: 'calendar', Conflict: 'shield-alert' };
const CLAUSE_STATUS_TONE = { 'مفتوح': 'warning', 'قيد المراجعة القانونية': 'brand', 'مُعالج': 'good' };
const CONTRACT_STATUS_TONE = { 'ساري': 'good', 'قيد التفاوض': 'warning', 'منتهٍ': 'neutral' };
const RISK_STATUS_TONE = { 'مكتشف': 'neutral', 'تنبيه': 'warning', 'مهمة مُسندة': 'brand', 'قيد المعالجة': 'accent', 'مغلق': 'good', 'مُتجاوز': 'neutral' };
const CLOSED_RISK = new Set(['مغلق', 'مُتجاوز']);
const OPEN_TASK = new Set(['جديدة', 'قيد التنفيذ', 'متأخرة']);
const CLAUSE_RESOLVED = 'مُعالج';
const CLAUSE_REVIEW = 'قيد المراجعة القانونية';

const STYLE_ID = 'view-contracts-style';
const STYLE_TEXT = `
.view-contracts .dom-meta { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 16px; font-size: var(--fs-sm); color: var(--ink-3); }
.view-contracts .dom-meta-item { display: inline-flex; align-items: center; gap: 6px; min-inline-size: 0; }
.view-contracts .dom-meta-item > svg { flex: none; color: var(--ink-3); }
.view-contracts .dom-meta-item.is-source { display: block; line-height: 1.7; }
.view-contracts .dom-meta-item.is-source > svg { display: inline-block; vertical-align: -2px; margin-inline-end: 6px; }
.view-contracts .dom-meta-item.is-source > .status-badge { margin-inline-start: 6px; }
.view-contracts .dom-row { display: grid; grid-template-columns: minmax(0, 1fr); gap: var(--gap); align-items: start; }
@container main (min-width: 761px) {
  .view-contracts .dom-row.is-2-1 { grid-template-columns: minmax(0, 2fr) minmax(0, 1fr); }
  .view-contracts .dom-row.is-1-1 { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
.view-contracts .dom-stats { display: flex; flex-wrap: wrap; gap: 10px 28px; margin: 0 0 var(--space-4); }
.view-contracts .dom-stat { display: flex; flex-direction: column; gap: 2px; min-inline-size: 0; }
.view-contracts .dom-stat dt { font-size: var(--fs-xs); color: var(--ink-3); }
.view-contracts .dom-stat dd { margin: 0; font-size: var(--fs-lg); font-weight: 600; color: var(--ink-1); font-variant-numeric: tabular-nums; white-space: nowrap; }
.view-contracts .code { font-family: var(--font-mono); font-variant-numeric: tabular-nums; unicode-bidi: isolate; white-space: nowrap; }
.view-contracts .li-pos { font-family: var(--font-mono); font-size: 11px; color: var(--ink-3); unicode-bidi: isolate; }
.view-contracts .cell-stack { display: flex; flex-direction: column; gap: 3px; min-inline-size: 0; }
.view-contracts .cell-sub { font-size: var(--fs-xs); color: var(--ink-3); line-height: 1.45; }
.view-contracts .cell-stack > .cell-code { align-self: flex-start; font-size: var(--fs-xs); color: var(--ink-2); }
.view-contracts .cell-sub.row { display: flex; flex-wrap: wrap; align-items: center; gap: 2px 8px; }
.view-contracts .score-cell { display: inline-flex; align-items: center; gap: 8px; white-space: nowrap; }
.view-contracts .score-cell .t-num { font-weight: 600; font-variant-numeric: tabular-nums; }
.view-contracts .ob-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 280px), 1fr)); gap: 8px; }
.view-contracts .ob-grid .urgent-item { grid-template-columns: auto minmax(0, 1fr); align-items: start; }
.view-contracts .ob-due { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 8px; margin-block-start: 2px; font-size: var(--fs-xs); color: var(--ink-2); }
.view-contracts .is-overdue .ob-due > .mono { color: var(--critical-text); font-weight: 600; }
.view-contracts .link-btn { display: inline; padding: 0; border: 0; background: none; color: var(--ink-1); font: inherit; font-weight: 500; text-align: start; cursor: pointer; border-radius: 4px; min-block-size: 24px; }
.view-contracts .link-btn:hover { color: var(--link, var(--brand-text)); text-decoration: underline; }
.view-contracts .clause-item { display: flex; flex-direction: column; gap: 10px; }
.view-contracts .clause-item.is-focus { box-shadow: 0 0 0 2px var(--focus); }
.view-contracts .sev-row { display: grid; grid-template-columns: auto minmax(0, 1fr) auto auto; align-items: center; gap: 10px; }
.view-contracts .kri-wrap[hidden] { display: none; }
.view-contracts .chev { transition: transform var(--dur-micro) var(--ease-out); }
.view-contracts [aria-expanded="true"] .chev { transform: rotate(180deg); }
@media (prefers-reduced-motion: reduce) { .view-contracts .chev { transition: none; } }
@media (pointer: coarse) { .view-contracts .link-btn { min-block-size: 40px; min-inline-size: 40px; } }
`;

/** UI state that survives re-renders inside one visit (no strings, no persistence). */
let kriOpen = false;
let obligationsExpanded = false;
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
  id: 'contracts',
  code: 'DOM-01',
  get title() { return i18n.t('core.nav.contracts.title'); },
  icon: 'file-text',

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
    const root = h('section', { class: 'view view-contracts' });
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

    /** ASCII digits in free text → active numeral system; Latin alphanumeric tokens (P6, 2B) keep theirs. */
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
    const moneyFull = (n) => (Number.isFinite(Number(n)) ? fmt.currency(Number(n)) : '—');
    const nowDate = () => (typeof store.now === 'function' ? store.now() : new Date());
    const startOfToday = () => { const d = nowDate(); d.setHours(0, 0, 0, 0); return d; };
    const daysUntil = (iso) => { const d = fmt.toDate(iso); if (!d) return null; d.setHours(0, 0, 0, 0); return Math.round((d.getTime() - startOfToday().getTime()) / DAY_MS); };
    const isoPlusDays = (days) => { const d = startOfToday(); d.setDate(d.getDate() + days); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
    const siteOf = (state, id) => (state.sites || []).find((x) => x && x.id === id) || null;
    const siteName = (state, id) => { const s = siteOf(state, id); return digitsIn(s ? L(s, 'name', 'sites') : (id || '—')); };

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
      if (risk && Number.isFinite(Number(risk.likelihood)) && Number.isFinite(Number(risk.impact)) && risk.likelihood && risk.impact) {
        const p = { l: fmt.num(num(risk.likelihood)), i: fmt.num(num(risk.impact)) };
        cell.appendChild(h('span', { class: 'li-pos', dir: 'ltr', title: t('dom.liTitle', p), 'aria-label': t('dom.liTitle', p) }, t('dom.li', p)));
      }
      return cell;
    }
    function typeChip(type) {
      return h('span', { class: ['type-chip', type ? `is-${lower(type)}` : null], 'data-type': type || undefined }, svgIcon(TYPE_ICON[type] || 'file-text', 12), h('span', {}, label('aiType', type) || '—'));
    }
    const enumBadge = (ns, value, tones, fallback = 'neutral') => badge(label(ns, value) || '—', tones[value] || fallback);

    function makeChart(name, opts) {
      if (!charts || typeof charts[name] !== 'function') return null;
      try { const c = charts[name](opts); return c && c.el instanceof Node ? c : null; } catch (err) { console.warn(`[contracts] charts.${name}`, err); return null; }
    }
    function simpleTable(caption, headers, rows) {
      const tbl = h('table', { class: 'table is-dense' }, h('caption', { class: 'sr-only' }, caption));
      tbl.appendChild(h('thead', {}, h('tr', {}, ...headers.map((x) => h('th', { scope: 'col' }, x)))));
      tbl.appendChild(h('tbody', {}, ...rows.map((r) => h('tr', {}, ...r.map((c) => h('td', {}, c))))));
      return tbl;
    }

    /** Executive metric tile (.metric-tile): tone sets the accent bar + icon only; the number stays ink-1. */
    function metricTile({ key, label: lbl, value, scale = null, unit = '', tone = null, icon = null, foot = null, helper = '', spark = null, onClick = null, title = null }) {
      const clickable = typeof onClick === 'function';
      const el = h(clickable ? 'button' : 'div', { class: ['metric-tile', tone ? `tone-${tone}` : null, clickable ? 'is-clickable' : null], type: clickable ? 'button' : undefined, onClick: clickable ? onClick : undefined, title: title || undefined, 'data-key': key });
      el.appendChild(h('div', { class: 'metric-head' }, h('span', { class: 'metric-label' }, lbl), icon ? h('span', { class: 'metric-icon', 'aria-hidden': 'true' }, icon) : null));
      const metric = h('span', { class: 't-metric', dir: scale ? 'ltr' : undefined }, String(value ?? '—'), scale ? h('small', {}, scale) : null);
      el.appendChild(h('div', { class: 'metric-value' }, metric, unit ? h('span', { class: 'metric-unit' }, unit) : null));
      if (spark) el.appendChild(h('span', { class: 'metric-spark', 'aria-hidden': 'true' }, spark));
      el.appendChild(h('div', { class: 'metric-foot' }, foot, helper ? h('span', { class: 'metric-helper' }, helper) : null));
      const sig = `${value}|${scale || ''}|${tone || ''}`;
      if (built && tileVals.has(key) && tileVals.get(key) !== sig) pendingFlash.push(el);
      tileVals.set(key, sig);
      return el;
    }
    const scrollToSection = (id) => { const el = root.querySelector(`[data-section="${id}"]`); if (el) { el.scrollIntoView({ behavior: motion && motion.enabled && motion.enabled() ? 'smooth' : 'auto', block: 'start' }); const head = el.querySelector('.card-title'); if (head) { head.setAttribute('tabindex', '-1'); head.focus({ preventScroll: true }); } } };

    /** dataTable that keeps sort/page across rebuilds and flashes rows whose content changed. */
    function makeTable(key, opts, sigOf) {
      const tbl = dataTable(opts);
      const prev = tableStates.get(key);
      if (prev) tbl.setState(resetPages ? { ...prev, page: 0, scrollTop: 0 } : prev);
      tables.set(key, tbl);
      if (typeof sigOf === 'function') {
        const before = rowSigs.get(key);
        const now = new Map((opts.rows || []).map((r) => [String(r[opts.rowKey || 'id']), sigOf(r)]));
        if (built && before) {
          tbl.table.querySelectorAll('tbody tr[data-key]').forEach((tr) => { const k = tr.getAttribute('data-key'); if (before.get(k) !== now.get(k)) pendingFlash.push(tr); });
        }
        rowSigs.set(key, now);
      }
      return tbl;
    }
    const rowOpener = (e) => { const tr = e && e.target && e.target.closest ? e.target.closest('tr') : null; return (tr && tr.querySelector('.row-open')) || null; };

    /** Shared AI-risk drawer (B-REGISTER), loaded on demand; falls back to the register deep link. */
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
      if (!platform || !Array.isArray(platform.contracts)) return { state, filters, siteId, search, platform: null };
      const inScope = (item) => !siteId || item.projectId === siteId;

      const contractsAll = platform.contracts.filter((c) => c && inScope(c)).map((c) => i18n.localize(c, 'contracts'));
      const matches = (c) => !search || [c.code, c.title, c.counterparty, label('contractType', c.type)].some((f) => lower(f).includes(search));
      const contracts = contractsAll.filter(matches);

      const locById = new Map(contractsAll.map((c) => [c.id, c]));
      const rawById = new Map(platform.contracts.filter(Boolean).map((c) => [c.id, c]));
      const locClause = (c, cl) => ((locById.get(c.id) || {}).clauses || []).find((x) => x && x.id === cl.id) || cl;

      // One definition per metric: flagged clauses, the obligations calendar and the 30-day count come from psel.
      const flagsSel = psel && typeof psel.contractFlags === 'function' ? safe(() => psel.contractFlags(state, filters), null) : null;
      let flaggedClauses = Array.isArray(flagsSel)
        ? flagsSel.map((x) => ({ contract: locById.get(x.contract.id) || x.contract, clause: locClause(x.contract, x.clause) }))
        : contractsAll.flatMap((c) => (c.clauses || []).filter((cl) => cl && cl.flag).map((cl) => ({ contract: c, clause: cl })));
      flaggedClauses = flaggedClauses.filter((f) => f.clause && f.clause.status !== CLAUSE_RESOLVED).sort((a, b) => num(b.clause.severity) - num(a.clause.severity));

      const calSel = psel && typeof psel.obligationsCalendar === 'function' ? safe(() => psel.obligationsCalendar(state, OBLIGATION_WINDOW_DAYS, filters), null) : null;
      let obligations;
      if (Array.isArray(calSel)) {
        obligations = calSel.map((x) => {
          const raw = rawById.get(x.contract.id) || x.contract;
          const idx = (raw.obligations || []).indexOf(x.obligation);
          const loc = locById.get(x.contract.id) || x.contract;
          const o = idx >= 0 && loc.obligations && loc.obligations[idx] ? loc.obligations[idx] : x.obligation;
          return { ...o, _key: `${raw.id}-${idx}`, days: Number.isFinite(x.daysLeft) ? x.daysLeft : daysUntil(o.due), contract: loc, overdue: !!x.overdue };
        });
      } else {
        obligations = [];
        contractsAll.forEach((c) => (c.obligations || []).forEach((o, i) => {
          if (!o || o.status === 'منجز') return;
          const days = daysUntil(o.due);
          if (days === null || days > OBLIGATION_WINDOW_DAYS) return;
          obligations.push({ ...o, _key: `${c.id}-${i}`, days, contract: c, overdue: o.status === 'متأخر' || days < 0 });
        }));
      }
      obligations.sort((a, b) => num(a.days) - num(b.days));
      const overdue = obligations.filter((o) => o.overdue);
      const summary = psel && typeof psel.contractsSummary === 'function' ? safe(() => psel.contractsSummary(state, filters), null) : null;
      const obligations30 = summary && Number.isFinite(summary.obligations30) ? summary.obligations30 : obligations.filter((o) => o.days <= OBLIGATION_KPI_DAYS).length;

      const subs = contractsAll.filter((c) => c.type === SUBCONTRACT_TYPE && c.status !== 'منتهٍ');
      const base = subs.length ? subs : contractsAll.filter((c) => c.status !== 'منتهٍ');
      const totalValue = base.reduce((n, c) => n + num(c.valueSAR), 0);
      const byParty = new Map();
      base.forEach((c) => { const k = c.counterparty; const e = byParty.get(k) || { name: c.counterparty, value: 0, contracts: 0 }; e.value += num(c.valueSAR); e.contracts += 1; byParty.set(k, e); });
      const concentration = [...byParty.values()].map((p) => ({ id: p.name, label: digitsIn(p.name), valueSAR: p.value, value: totalValue ? Math.round((p.value / totalValue) * 1000) / 10 : 0, contracts: p.contracts })).sort((a, b) => b.value - a.value);
      const topShare = concentration.length ? concentration[0].value : 0;
      const hhi = concentration.reduce((n, p) => n + p.value * p.value, 0);

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

      // Freshness: the most recent change to this domain's risks in scope (never in the future).
      const nowMs = nowDate().getTime();
      const fresh = (platform.aiRisks || []).filter((r) => r && r.category === CATEGORY && inScope(r))
        .map((r) => fmt.toDate(r.updatedAt || r.detectedAt)).filter((d) => d && d.getTime() <= nowMs)
        .sort((a, b) => b - a)[0] || null;
      const connectors = SOURCE_CONNECTORS.map((id) => (platform.connectors || []).find((c) => c && c.id === id)).filter(Boolean);
      const pipeline = (platform.pipelines || []).find((p) => p && p.id === PIPELINE_ID) || null;

      return { state, filters, siteId, search, platform, contractsAll, contracts, flaggedClauses, obligations, obligations30, overdue, concentration, topShare, hhi, subsOnly: subs.length > 0, domainRisks, categoryScore, fresh, connectors, pipeline: pipeline ? i18n.localize(pipeline, 'pipelines') : null };
    }

    const scopeLabel = (data) => (data.siteId ? siteName(data.state, data.siteId) : i18n.t('core.filters.allProjects'));

    /* ───────────────────────── actions ───────────────────────── */

    function relatedRisks(platform, contract, clause = null) {
      const code = lower(contract.code);
      const ref = clause ? lower(clause.ref) : '';
      const hay = (r) => lower(`${r.evidence && r.evidence.ref} ${r.evidence && r.evidence.excerpt} ${r.title} ${r.driverExplanation}`);
      const list = (platform.aiRisks || []).filter((r) => r && r.category === CATEGORY && !CLOSED_RISK.has(r.status) && r.projectId === contract.projectId && hay(r).includes(code));
      if (clause && ref) {
        const exact = list.filter((r) => hay(r).includes(`§${ref}`));
        if (exact.length) return exact;
      }
      return list;
    }

    /** Create a legal-review task (audited store method); Arabic title from the stored data, English from the mirror when it is loaded. */
    function referToLegal(data, contract, clause = null) {
      if (typeof store.addTask !== 'function') { toast(t('dom.task.unavailable'), { tone: 'warning' }); return null; }
      const raw = (data.platform.contracts || []).find((c) => c && c.id === contract.id) || contract;
      const rawClause = clause ? (raw.clauses || []).find((c) => c && c.id === clause.id) || clause : null;
      const risk = relatedRisks(data.platform, raw, rawClause)[0] || null;
      const arP = { code: raw.code, ref: rawClause ? rawClause.ref : '', title: rawClause ? rawClause.title : raw.title, party: raw.counterparty };
      const enP = { code: raw.code, ref: rawClause ? rawClause.ref : '', title: rawClause ? clause.title : contract.title, party: contract.counterparty };
      const title = fill(rawClause ? dict.ar.task.titleClause : dict.ar.task.titleContract, arP);
      const titleEn = isEn() ? fill(rawClause ? dict.en.task.titleClause : dict.en.task.titleContract, enP) : fill(rawClause ? dict.en.task.titleClauseShort : dict.en.task.titleContractShort, enP);
      const dup = (data.platform.tasks || []).find((x) => x && OPEN_TASK.has(x.status) && ((rawClause && risk && x.riskId === risk.id) || x.title === title));
      if (dup) { toast(t('dom.task.duplicate', { code: dup.code || dup.id }), { tone: 'neutral', action: { label: t('dom.task.openTasks'), onClick: () => router.navigate('tasks') } }); return { task: dup, created: false }; }
      const owner = (risk && risk.owner) || LEGAL_OWNER;
      const description = rawClause
        ? [rawClause.explanation, rawClause.benchmark, rawClause.redline ? fill(dict.ar.task.redline, { text: rawClause.redline }) : ''].filter(Boolean).join(' · ')
        : fill(dict.ar.task.descContract, arP);
      const descriptionEn = rawClause
        ? (isEn() ? [clause.explanation, clause.benchmark, clause.redline ? fill(dict.en.task.redline, { text: clause.redline }) : ''].filter(Boolean).join(' · ') : titleEn)
        : (isEn() ? fill(dict.en.task.descContract, enP) : fill(dict.en.task.descContractShort, enP));
      let task = null;
      try {
        task = store.addTask({
          title, titleEn, description, descriptionEn,
          projectId: raw.projectId, riskId: risk ? risk.id : null, owner,
          dueDate: isoPlusDays(rawClause && num(rawClause.severity) >= 70 ? 3 : 7),
          status: 'جديدة', source: 'manual',
          origin: { view: 'contracts', contractId: raw.id, clauseId: rawClause ? rawClause.id : null },
        });
      } catch (err) { console.warn('[contracts] addTask', err); task = null; }
      if (!task) { toast(t('dom.task.failed'), { tone: 'critical' }); return null; }
      if (rawClause && rawClause.status !== CLAUSE_RESOLVED && typeof store.update === 'function') {
        store.update((state) => {
          const c = ((state.platform && state.platform.contracts) || []).find((x) => x && x.id === raw.id);
          const cl = c && (c.clauses || []).find((x) => x && x.id === rawClause.id);
          if (cl) cl.status = CLAUSE_REVIEW;
          return `platform.contracts.${raw.id}`;
        }, `platform.contracts.${raw.id}`);
      }
      const p = { ref: digitsIn(rawClause ? rawClause.ref : ''), code: raw.code, owner: term(owner), task: task.code || task.id, risk: risk ? risk.code : '' };
      const key = rawClause ? (risk ? 'task.createdClauseLinked' : 'task.createdClause') : (risk ? 'task.createdContractLinked' : 'task.createdContract');
      toast(`${t(key, p)} ${t('dom.task.writebackSim')}`, { tone: 'good', action: { label: t('dom.task.openTasks'), onClick: () => router.navigate('tasks') } });
      return { task, created: true };
    }

    /* ───────────────────────── drawer ───────────────────────── */

    function dueBadge(iso, status) {
      const days = daysUntil(iso);
      if (status === 'منجز') return badge(t('obligations.done'), 'good');
      if (status === 'متأخر' || (days !== null && days < 0)) return badge(days !== null && days < 0 ? tn('dom.lateDays', Math.abs(days)) : label('obligationStatus', 'متأخر'), 'critical');
      if (days === null) return badge(t('obligations.upcoming'), 'neutral');
      if (days === 0) return badge(t('dom.today'), 'critical');
      if (days === 1) return badge(t('dom.tomorrow'), 'serious');
      return badge(tn('dom.inDays', days), days <= 7 ? 'serious' : days <= 30 ? 'warning' : 'neutral');
    }
    function flagBadge(clause) {
      if (!clause || !clause.flag) return badge(t('flags.noFlag'), 'good');
      const r = ratingOf(clause.severity);
      const b = badge(label('clauseFlag', clause.flag), RATING_TONE[r]);
      b.title = t('flags.severityTitle', { hint: label('ratingHint', r), score: fmt.num(num(clause.severity)) });
      return b;
    }

    function clauseItem(data, contract, clause) {
      const r = ratingOf(clause.severity);
      const sev = num(clause.severity);
      const statusSlot = h('span', {}, enumBadge('clauseStatus', clause.status, CLAUSE_STATUS_TONE));
      const resolved = clause.status === CLAUSE_RESOLVED;
      const refer = button(t('flags.refer'), {
        variant: resolved ? 'ghost' : 'outline', size: 'sm', icon: 'file-check',
        attrs: { disabled: resolved || clause.status === CLAUSE_REVIEW, title: resolved ? t('flags.resolved') : t('flags.referTitle'), 'aria-label': t('flags.referAria', { ref: digitsIn(clause.ref), code: contract.code }) },
        onClick: () => {
          const res = referToLegal(data, contract, clause);
          if (res && res.created) { statusSlot.replaceChildren(enumBadge('clauseStatus', CLAUSE_REVIEW, CLAUSE_STATUS_TONE)); refer.disabled = true; refer.title = t('flags.referred'); }
        },
      });
      return h('article', { class: ['evidence', 'clause-item', `tone-${RATING_TONE[r]}`], 'data-clause': clause.id },
        h('div', { class: 'evidence-head' },
          h('span', { class: 'row gap-2 wrap', style: { alignItems: 'center' } }, h('span', { class: 'evidence-ref', dir: 'ltr' }, `§${digitsIn(clause.ref || '—')}`), h('strong', {}, digitsIn(clause.title || '—'))),
          h('span', { class: 'row gap-2 wrap', style: { alignItems: 'center' } }, flagBadge(clause), statusSlot),
        ),
        clause.excerpt ? h('blockquote', { class: 'evidence-excerpt' }, digitsIn(clause.excerpt)) : null,
        clause.flag ? h('div', { class: 'sev-row' },
          h('span', { class: 't-label' }, t('drawer.severity')),
          progress({ value: sev, max: 100, tone: RATING_TONE[r], label: t('drawer.severityAria', { ref: digitsIn(clause.ref) }) }),
          h('span', { class: 'mono' }, fmt.num(sev)),
          ratingBadge(sev),
        ) : null,
        clause.explanation ? h('p', { class: 't-body' }, h('strong', {}, t('drawer.explanation')), ' ', digitsIn(clause.explanation)) : null,
        clause.benchmark ? h('div', { class: 'note tone-accent' }, h('strong', {}, t('drawer.benchmark')), ' ', digitsIn(clause.benchmark)) : null,
        clause.redline ? h('div', { class: 'note tone-brand' }, h('strong', {}, t('drawer.redline')), ' ', digitsIn(clause.redline)) : null,
        clause.flag ? h('div', { class: 'row end gap-2' }, refer) : null,
      );
    }

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

    function openContract(data, contract, focusClauseId = null) {
      if (!contract) return;
      if (openDrawer) { try { openDrawer.close(); } catch { /* ignore */ } openDrawer = null; }
      const opener = document.activeElement && root.contains(document.activeElement) ? document.activeElement : null;
      const clauses = (contract.clauses || []).slice().sort((a, b) => num(b.severity) - num(a.severity));
      const flagged = clauses.filter((c) => c.flag);
      const related = relatedRisks(data.platform, contract);
      const obligations = (contract.obligations || []).slice().sort((a, b) => (fmt.toDate(a.due) || 0) - (fmt.toDate(b.due) || 0));
      const endsIn = daysUntil(contract.endsAt);
      const openLinked = (r) => { const back = opener; if (openDrawer) openDrawer.close(); openRisk(r, back); };

      openDrawer = drawer({
        title: digitsIn(contract.title),
        subtitle: t('drawer.subtitle', { code: `⁨${contract.code}⁩`, party: digitsIn(contract.counterparty) }),
        size: 'lg', kind: 'contract', activeTab: focusClauseId ? 'clauses' : 'overview', returnFocus: opener,
        tabs: [
          { id: 'overview', label: t('drawer.tabs.overview'), render: () => h('div', { class: 'stack gap-4' },
            h('div', { class: 'row between wrap gap-2' },
              h('div', { class: 'row gap-2 wrap' }, badge(label('contractType', contract.type) || '—', 'neutral'), enumBadge('contractStatus', contract.status, CONTRACT_STATUS_TONE)),
              h('span', { class: 'row gap-2', style: { alignItems: 'center' } }, h('span', { class: 't-label' }, t('drawer.riskScore')), scoreCell(contract.riskScore)),
            ),
            kv([
              [t('drawer.counterparty'), digitsIn(contract.counterparty)],
              [t('drawer.project'), siteName(data.state, contract.projectId)],
              [t('drawer.value'), moneyFull(contract.valueSAR)],
              [t('drawer.signed'), fmt.date(contract.signedAt)],
              [t('drawer.ends'), h('span', { class: 'row gap-2 wrap', style: { alignItems: 'center' } }, fmt.date(contract.endsAt), endsIn !== null && endsIn >= 0 && endsIn <= 90 && contract.status === 'ساري' ? badge(t('drawer.endsIn', { when: tn('dom.inDays', endsIn) }), endsIn <= 30 ? 'serious' : 'warning') : null)],
              [t('drawer.subShare'), fmt.pct(num(contract.subcontractorSharePct))],
              [t('drawer.flaggedLabel'), t('drawer.flaggedCount', { flagged: fmt.num(flagged.length), total: fmt.num(clauses.length) })],
            ]),
          ) },
          { id: 'clauses', label: t('drawer.tabs.clauses'), count: clauses.length, render: () => (clauses.length ? h('div', { class: 'stack gap-3' }, ...clauses.map((cl) => clauseItem(data, contract, cl))) : emptyState({ title: t('drawer.clausesEmpty') })) },
          { id: 'obligations', label: t('drawer.tabs.obligations'), count: obligations.length, render: () => (obligations.length
            ? h('ul', { class: 'urgent-list' }, ...obligations.map((o) => {
              const late = o.status === 'متأخر' || (daysUntil(o.due) ?? 1) < 0;
              return h('li', { class: ['urgent-item', late ? 'is-overdue tone-critical' : 'tone-neutral'] },
                h('span', { class: 'urgent-icon' }, glyph(late ? 'critical' : 'clock', 15)),
                h('div', { class: 'urgent-text' }, h('span', {}, digitsIn(o.text)), h('span', { class: 'urgent-sub' }, t('obligations.meta', { ref: `\u2066§${digitsIn(o.clauseRef || '—')}\u2069`, owner: o.owner ? term(o.owner) : '—' }))),
                h('div', { class: 'urgent-due' }, h('span', {}, fmt.date(o.due, { style: 'short' })), dueBadge(o.due, o.status)));
            }))
            : emptyState({ title: t('drawer.obligationsEmpty') })) },
          { id: 'risks', label: t('drawer.tabs.risks'), count: related.length, render: () => relatedList(related, openLinked) },
        ],
        actions: [
          { label: t('drawer.referContract'), variant: 'primary', icon: 'file-check', closes: false, onClick: () => { referToLegal(data, contract, null); return false; } },
          { label: t('drawer.close'), variant: 'ghost' },
        ],
        onClose: () => { openDrawer = null; },
      });
      openDrawer.open();
      if (focusClauseId) {
        requestAnimationFrame(() => {
          const node = openDrawer && openDrawer.el.querySelector(`[data-clause="${CSS.escape(String(focusClauseId))}"]`);
          if (node) { node.scrollIntoView({ block: 'center' }); node.classList.add('is-focus'); }
        });
      }
    }

    /* ───────────────────────── sections ───────────────────────── */

    function buildHead(data) {
      const conn = data.connectors && data.connectors[0];
      const st = conn && statusApi && typeof statusApi.connector === 'function' ? safe(() => statusApi.connector(data.state, conn), 'not_connected') : 'not_connected';
      const freshText = data.fresh ? t('dom.fresh', { time: fmt.relative(data.fresh, nowDate()) }) : t('dom.freshNone');
      return h('header', { class: 'view-head' },
        h('div', { class: 'view-head-text' },
          h('span', { class: 'code-tag' }, 'DOM-01'),
          h('h1', { tabindex: '-1' }, t('title')),
          h('p', { class: 'view-lead' }, t('lead')),
          h('div', { class: 'dom-meta' },
            h('span', { class: 'dom-meta-item' }, svgIcon('building', 14), h('span', {}, t('dom.scope', { scope: scopeLabel(data) }))),
            h('span', { class: 'dom-meta-item', title: data.fresh ? t('dom.freshTitle', { time: fmt.dateTime(data.fresh) }) : undefined }, glyph('clock', 14), h('span', {}, freshText)),
            h('span', { class: 'dom-meta-item is-source' }, svgIcon('plug', 14), h('span', {}, conn ? t('dom.source', { source: digitsIn(L(conn, 'name', 'connectors')) }) : t('dom.sourceMissing')), statusBadge(st, { size: 'sm' })),
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
      const redClauses = data.flaggedClauses.filter((f) => ratingOf(f.clause.severity) === 'red').length;
      const conc = data.topShare;
      const concTone = !data.concentration.length ? null : conc >= 40 ? 'critical' : conc >= 25 ? 'warning' : 'good';
      return h('div', { class: 'metric-grid', role: 'group', 'aria-label': t('title') },
        metricTile({ key: 'score', label: t('kpi.score'), value: fmt.num(num(cs.score)), scale: `/${fmt.num(100)}`, tone: RATING_TONE[r], icon: svgIcon('file-text', 16), spark: spark ? spark.el : null, foot: ratingBadge(cs.score), helper: t('dom.scoreHelper', { open: tn('dom.openRisks', num(cs.open)), red: tn('dom.redRisks', num(cs.red)) }), title: t('dom.scoreFormula') }),
        metricTile({ key: 'flagged', label: t('kpi.flagged'), value: fmt.num(data.flaggedClauses.length), tone: redClauses ? 'critical' : data.flaggedClauses.length ? 'warning' : 'good', icon: glyph(redClauses ? 'critical' : data.flaggedClauses.length ? 'warning' : 'good', 16), helper: tn('kpi.flaggedHelper', redClauses), onClick: () => scrollToSection('flags') }),
        metricTile({ key: 'obligations', label: t('kpi.obligations', { days: fmt.num(OBLIGATION_KPI_DAYS) }), value: fmt.num(data.obligations30), tone: data.overdue.length ? 'critical' : data.obligations30 ? 'warning' : 'good', icon: glyph(data.overdue.length ? 'critical' : 'clock', 16), helper: tn('kpi.overdue', data.overdue.length), onClick: () => scrollToSection('obligations') }),
        metricTile({ key: 'concentration', label: t('kpi.concentration'), value: data.concentration.length ? fmt.pct(conc, 1) : '—', tone: concTone, icon: svgIcon('truck', 16), helper: data.concentration.length ? t('kpi.concentrationHelper', { name: data.concentration[0].label }) : t('kpi.concentrationNone'), onClick: () => scrollToSection('concentration') }),
      );
    }

    function buildContractsCard(data) {
      const rows = data.contracts.map((c) => {
        const flagged = (c.clauses || []).filter((cl) => cl && cl.flag && cl.status !== CLAUSE_RESOLVED);
        return { ...c, _flagged: flagged.length, _maxSev: flagged.reduce((m, cl) => Math.max(m, num(cl.severity)), 0) };
      });
      const all = data.contractsAll;
      const active = all.filter((c) => c.status === 'ساري');
      const activeValue = active.reduce((n, c) => n + num(c.valueSAR), 0);
      const avgScore = active.length ? Math.round(active.reduce((n, c) => n + num(c.riskScore), 0) / active.length) : null;
      const stat = (lbl, value) => h('div', { class: 'dom-stat' }, h('dt', {}, lbl), h('dd', {}, value));
      const stats = h('dl', { class: 'dom-stats' },
        stat(t('list.stats.monitored'), fmt.num(all.length)),
        stat(t('list.stats.active'), fmt.num(active.length)),
        stat(t('list.stats.negotiating'), fmt.num(all.filter((c) => c.status === 'قيد التفاوض').length)),
        stat(t('list.stats.expired'), fmt.num(all.filter((c) => c.status === 'منتهٍ').length)),
        stat(t('list.stats.activeValue'), money(activeValue)),
        stat(t('list.stats.avgScore'), avgScore === null ? '—' : fmt.num(avgScore)),
      );
      const table = makeTable('contracts', {
        caption: t('list.caption'), pageSize: 6, rowKey: 'id', stickyFirst: true,
        emptyText: data.search ? t('list.emptySearch') : t('list.empty'),
        onRowClick: (r) => openContract(data, data.contractsAll.find((c) => c.id === r.id) || r),
        rowLabel: (r) => `${r.code} — ${r.title}`,
        initialSort: { key: 'riskScore', dir: 'desc' },
        columns: [
          { key: 'title', label: t('list.contract'), priority: 'high', sortValue: (r) => r.title, render: (r) => h('div', { class: 'cell-stack' }, codeSpan(r.code, 'cell-code'), h('span', { class: 'cell-title' }, ...withCodes(r.title)), h('span', { class: 'cell-sub' }, t('list.meta', { type: label('contractType', r.type) || '—', party: digitsIn(r.counterparty || '—'), site: siteName(data.state, r.projectId) }))) },
          { key: 'valueSAR', label: t('list.value'), align: 'end', priority: 'medium', sortValue: (r) => num(r.valueSAR), render: (r) => h('div', { class: 'cell-stack', style: { alignItems: 'flex-end' } }, h('span', { class: 'mono nowrap' }, money(r.valueSAR)), enumBadge('contractStatus', r.status, CONTRACT_STATUS_TONE)) },
          { key: '_flagged', label: t('list.flagged'), align: 'center', priority: 'medium', sortValue: (r) => r._flagged, render: (r) => badge(fmt.num(r._flagged), r._flagged ? RATING_TONE[ratingOf(r._maxSev)] : 'good') },
          { key: 'riskScore', label: t('list.score'), priority: 'high', sortValue: (r) => num(r.riskScore), render: (r) => scoreCell(r.riskScore) },
        ],
        rows,
      }, (r) => `${r.status}|${r.riskScore}|${r._flagged}|${r.valueSAR}`);
      return card({
        code: 'CT-01', title: t('list.title'),
        subtitle: t('list.sub', { count: tn('list.count', rows.length), scope: scopeLabel(data) }),
        body: h('div', {}, stats, table.el),
      });
    }

    function buildFlagsCard(data) {
      const rows = data.flaggedClauses.map((f) => ({ id: `${f.contract.id}-${f.clause.id}`, code: f.contract.code, ref: f.clause.ref, title: f.clause.title, flag: f.clause.flag, severity: num(f.clause.severity), status: f.clause.status, party: f.contract.counterparty, contract: f.contract, clause: f.clause }));
      const table = makeTable('flags', {
        caption: t('flags.caption'), pageSize: 6, dense: true, rowKey: 'id', stickyFirst: true,
        emptyText: t('flags.empty'),
        onRowClick: (r) => openContract(data, r.contract, r.clause.id),
        rowLabel: (r) => `${r.code} §${r.ref} — ${r.title}`,
        initialSort: { key: 'severity', dir: 'desc' },
        columns: [
          { key: 'code', label: t('flags.clause'), priority: 'high', sortValue: (r) => `${r.code} ${r.ref}`, render: (r) => h('div', { class: 'cell-stack' }, h('span', { class: 'row gap-2 wrap', style: { alignItems: 'center' } }, codeSpan(r.code), h('span', { class: 'mono', dir: 'ltr' }, `§${digitsIn(r.ref)}`)), h('span', { class: 'cell-title' }, digitsIn(r.title)), h('span', { class: 'cell-sub' }, digitsIn(r.party))) },
          { key: 'flag', label: t('flags.flag'), priority: 'medium', sortValue: (r) => label('clauseFlag', r.flag), render: (r) => flagBadge(r.clause) },
          { key: 'severity', label: t('flags.severity'), priority: 'high', sortValue: (r) => r.severity, render: (r) => scoreCell(r.severity) },
          { key: 'status', label: t('flags.status'), priority: 'low', sortValue: (r) => label('clauseStatus', r.status), render: (r) => enumBadge('clauseStatus', r.status, CLAUSE_STATUS_TONE) },
          { key: 'actions', label: t('flags.action'), sortable: false, priority: 'medium', render: (r) => button(t('flags.refer'), { variant: 'ghost', size: 'sm', attrs: { disabled: r.status === CLAUSE_REVIEW, 'aria-label': t('flags.referAria', { ref: digitsIn(r.ref), code: r.code }), title: r.status === CLAUSE_REVIEW ? t('flags.referred') : t('flags.referTitle') }, onClick: () => { referToLegal(data, r.contract, r.clause); } }) },
        ],
        rows,
      }, (r) => `${r.status}|${r.severity}`);
      const el = card({ code: 'CT-02', title: t('flags.title'), subtitle: t('flags.sub', { count: tn('flags.count', rows.length) }), body: table.el });
      el.dataset.section = 'flags';
      return el;
    }

    function buildConcentrationCard(data) {
      const items = data.concentration.slice(0, 8).map((p) => ({ id: p.id, label: p.label, value: p.value }));
      const chart = items.length ? makeChart('barChart', { items, horizontal: true, height: Math.max(180, items.length * 32 + 24), valueFormat: (v) => fmt.pct(v, 1), color: 'var(--s1)', showValues: true, maxBars: 8, ariaLabel: t('concentration.aria') }) : null;
      const fallback = () => simpleTable(t('concentration.caption'), [t('concentration.party'), t('concentration.share'), t('concentration.value'), t('concentration.contracts')], data.concentration.map((p) => [p.label, fmt.pct(p.value, 1), money(p.valueSAR), fmt.num(p.contracts)]));
      const top = data.concentration[0];
      const tone = data.topShare >= 40 ? 'critical' : data.topShare >= 25 ? 'warning' : 'good';
      const body = items.length
        ? h('div', { class: 'stack gap-3' },
          chart ? chart.el : fallback(),
          top ? h('div', { class: ['note', `tone-${tone}`] },
            h('p', {}, glyph(tone, 14), ' ', h('strong', {}, t('concentration.note', { name: top.label, share: fmt.pct(top.value, 1), base: data.subsOnly ? t('concentration.baseSubs') : t('concentration.baseAll') }))),
            h('p', {}, t(`concentration.${tone === 'critical' ? 'high' : tone === 'warning' ? 'medium' : 'low'}`)),
            h('p', { class: 't-helper' }, t('concentration.hhi', { value: fmt.num(Math.round(data.hhi)), max: fmt.num(10000) })),
          ) : null)
        : emptyState({ title: t('concentration.emptyTitle'), text: t('concentration.emptyText') });
      const el = card({ code: 'CT-03', title: t('concentration.title'), subtitle: data.subsOnly ? t('concentration.subSubs') : t('concentration.subAll'), body, tableView: items.length ? () => ((chart && typeof chart.table === 'function' && safe(() => chart.table(), null)) || fallback()) : null });
      el.dataset.section = 'concentration';
      return el;
    }

    function buildObligationsCard(data) {
      const shown = obligationsExpanded ? data.obligations : data.obligations.slice(0, OBLIGATIONS_DEFAULT);
      const list = shown.length
        ? h('ul', { class: 'urgent-list ob-grid', 'aria-label': t('obligations.aria') }, ...shown.map((o) => {
          const tone = o.overdue ? 'critical' : o.days <= 7 ? 'serious' : o.days <= 30 ? 'warning' : 'neutral';
          return h('li', { class: ['urgent-item', o.overdue ? 'is-overdue' : null, `tone-${tone}`] },
            h('span', { class: 'urgent-icon' }, glyph(o.overdue ? 'critical' : o.days <= 7 ? 'serious' : 'clock', 15)),
            h('div', { class: 'urgent-text' },
              h('button', { type: 'button', class: 'link-btn', 'aria-label': t('obligations.openAria', { code: o.contract.code, text: digitsIn(o.text) }), onClick: () => openContract(data, o.contract) }, digitsIn(o.text)),
              h('span', { class: 'urgent-sub row gap-2 wrap' }, codeSpan(o.contract.code), h('span', {}, t('obligations.meta', { ref: `\u2066§${digitsIn(o.clauseRef || '—')}\u2069`, owner: o.owner ? term(o.owner) : '—' }))),
              h('span', { class: 'ob-due' }, h('span', { class: 'mono' }, `${fmt.dayName(o.due)} ${fmt.date(o.due, { style: 'short' })}`), dueBadge(o.due, o.status))));
        }))
        : emptyState({ title: t('obligations.emptyTitle', { days: fmt.num(OBLIGATION_WINDOW_DAYS) }), text: t('obligations.emptyText') });
      const more = data.obligations.length > OBLIGATIONS_DEFAULT
        ? button(obligationsExpanded ? t('dom.showLess') : t('dom.showAll', { count: fmt.num(data.obligations.length) }), { variant: 'ghost', size: 'sm', icon: h('span', { class: 'chev' }, svgIcon('chevron-down', 15)), attrs: { 'aria-expanded': obligationsExpanded ? 'true' : 'false' }, onClick: () => { obligationsExpanded = !obligationsExpanded; schedule(); } })
        : null;
      const legend = h('div', { class: 'tone-legend' },
        h('span', { class: 'tone-legend-item tone-critical' }, glyph('critical', 12), h('span', {}, t('obligations.legend.overdue'))),
        h('span', { class: 'tone-legend-item tone-serious' }, glyph('serious', 12), h('span', {}, t('obligations.legend.week'))),
        h('span', { class: 'tone-legend-item tone-warning' }, glyph('warning', 12), h('span', {}, t('obligations.legend.month', { days: fmt.num(OBLIGATION_KPI_DAYS) }))),
        h('span', { class: 'tone-legend-item tone-neutral' }, glyph('clock', 12), h('span', {}, t('obligations.legend.later'))),
      );
      const el = card({
        code: 'CT-04', title: t('obligations.title', { days: fmt.num(OBLIGATION_WINDOW_DAYS) }),
        subtitle: t('obligations.sub', { count: tn('obligations.count', data.obligations.length), overdue: tn('obligations.overdue', data.overdue.length) }),
        actions: more ? [more] : [], body: list,
        footer: h('div', { class: 'row between wrap gap-2', style: { inlineSize: '100%' } }, legend, data.obligations.length > shown.length ? h('span', { class: 't-helper' }, t('dom.shownOf', { shown: fmt.num(shown.length), total: fmt.num(data.obligations.length) })) : null),
      });
      el.dataset.section = 'obligations';
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
        code: 'CT-05', title: t('dom.risks.title'),
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
      const bodyId = 'ct-kri-body';
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
        code: 'CT-06', title: t('dom.kri.title'),
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
        frag.append(buildHead({ ...data, connectors: [], fresh: null }), emptyState({ icon: svgIcon('file-text', 32), title: t('dom.states.noPlatformTitle'), text: t('dom.states.noPlatformText') }));
        return frag;
      }
      frag.append(
        buildHead(data),
        buildKpis(data),
        buildContractsCard(data),
        buildFlagsCard(data),
        h('div', { class: 'dom-row is-2-1' }, buildObligationsCard(data), buildConcentrationCard(data)),
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
        console.warn('[contracts] render failed', err);
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

    // Only the collections this view shows rebuild it (contracts, AI risks, alerts, site names, a full reset).
    const RELEVANT = /^(\*|sites|platform$|platform\.(contracts|aiRisks|alerts))/;
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

    // Deep link: #/contracts?contract=CT-2026-014 (code or id) [&clause=CT1-C1] opens the contract drawer.
    const want = ctx.params && (ctx.params.contract || ctx.params.id);
    if (want) {
      const data = collect();
      const c = data.platform ? data.contractsAll.find((x) => x.id === want || x.code === want) : null;
      if (c) openContract(data, c, ctx.params.clause || null);
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
