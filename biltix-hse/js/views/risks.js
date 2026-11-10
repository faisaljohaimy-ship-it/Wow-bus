/**
 * BILTIX Risk AI — HSE pillar · SEC-03 Safety risk register (js/views/risks.js). Owner: B-HSE1.
 *
 *   A. Head — title, lead, data status (status.js), counts, "add safety risk".
 *   B. Four summary metrics for the scope (site filter) — open, critical, overdue (sel.overdueRisks, the
 *      shared definition) and high risks, all from the selectors.
 *   C. Register card — filter bar (tier chips, status, category, due window, search that matches the
 *      Arabic record and its English translation), optional matrix-cell chip, sortable table (compact
 *      columns when the card is narrow).
 *   D. Mini 5×5 matrix (cell → exact likelihood × severity filter) and top categories.
 *   E. Detail drawer (kind 'hse-risk') with Overview / Controls / History tabs, status change,
 *      edit, delete; add/edit modal with inline validation.
 *
 * Route params: ?new=1 (add), ?id=R12 (drawer), ?tier=<stored tier>, ?due=overdue|soon, ?l=1..5&s=1..5.
 * Stored values stay Arabic (enum values, the audit trail); display goes through i18n.label / L / term.
 * A text field the user edits is recorded in risk.localEdits so the edit — not the seed translation —
 * shows in both languages. Data reaches the DOM through textContent / h() only.
 */

import { i18n } from '../core/i18n.js';
import * as seedMod from '../data/seed.js';
import dict from '../i18n/risks.js';

i18n.register('risks', dict);

const DAY_MS = 86_400_000;
const CLOSED = 'مغلق';
/** Audit-trail actor for edits made in this demo (stored Arabic, displayed through the dictionary). */
const USER = 'مدير السلامة والصحة المهنية';
/** Edits are saved as history kind 'edit' (store.updateRisk); entries saved before that carry only this sentence. */
const NOTE_EDIT = 'تحديث بيانات المخاطرة من سجل المخاطر';
const HISTORY_CREATED = 'إنشاء سجل المخاطرة';
const STATUS_CHANGE_RE = /^تغيير الحالة من «(.+)» إلى «(.+)»$/;
const MANUAL_SOURCE = 'إدخال يدوي';

const FALLBACK_CATEGORIES = ['height', 'excavation', 'lifting', 'electrical', 'confined', 'hotwork', 'heat', 'chemical', 'traffic', 'scaffold', 'structural', 'ergonomic']
  .map((id) => ({ id, icon: 'hazard' }));
const FALLBACK_RISK_STATUS = ['مفتوح', 'قيد المعالجة', 'مُسيطر عليه', 'مغلق'];
const FALLBACK_CONTROL_TYPES = ['إلغاء', 'استبدال', 'ضوابط هندسية', 'ضوابط إدارية', 'معدات الوقاية الشخصية'];
const RISK_SOURCES = ['تقييم مخاطر', 'تفتيش', 'جولة سلامة', 'ملاحظة عامل', 'حادث وشيك', 'حادث', 'تدقيق', 'تفتيش كهرباء', 'تفتيش سقالات', 'بيانات الحساسات', 'تقرير مقاول'];
const TIERS = [
  { tier: 'حرج', tone: 'critical' },
  { tier: 'عالٍ', tone: 'serious' },
  { tier: 'متوسط', tone: 'warning' },
  { tier: 'منخفض', tone: 'good' },
];
const STATUS_TONE = { 'مفتوح': 'serious', 'قيد المعالجة': 'warning', 'مُسيطر عليه': 'good', 'مغلق': 'neutral' };
const TEXT_FIELDS = ['hazard', 'activity', 'description', 'legalRef'];

const arr = (v) => (Array.isArray(v) ? v : []);
const enumOf = (key, fallback) => (Array.isArray(seedMod[key]) && seedMod[key].length ? seedMod[key] : fallback);
const categories = () => enumOf('CATEGORIES', FALLBACK_CATEGORIES);
const riskStatuses = () => enumOf('RISK_STATUS', FALLBACK_RISK_STATUS);
const controlTypes = () => enumOf('CONTROL_TYPES', FALLBACK_CONTROL_TYPES);
const categoryById = (id) => categories().find((c) => c.id === id) || { id, icon: 'hazard' };

function parseMs(value) {
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'number') return value;
  if (typeof value !== 'string' || !value) return NaN;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  const d = m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date(value);
  return d.getTime();
}
function isoDate(date) {
  const p = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}`;
}
/** Search normalisation for Arabic and Latin text (tashkeel/tatweel stripped, alef/yaa/taa unified). */
function norm(value) {
  return String(value ?? '').toLowerCase()
    .replace(/[ً-ْـ]/g, '')
    .replace(/[أإآٱ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي')
    .trim();
}

export default {
  id: 'risks',
  code: 'SEC-03',
  get title() { return i18n.has('core.nav.risks.title') ? i18n.t('core.nav.risks.title') : i18n.t('risks.title'); },
  icon: 'shield-alert',

  render(container, ctx) {
    const { store, bus, sel, fmt, charts, router, art } = ctx;
    const C = ctx.components || {};
    const { h } = C;
    const params = ctx.params || {};
    const I = ctx.i18n || i18n;
    const t = (key, p) => I.t(key, p);
    const tn = (key, count, p) => I.tn(key, count, p);
    const L = (record, field, ns) => (record ? I.L(record, field, ns) : '');
    const label = (ns, value) => I.label(ns, value);
    const term = (s) => (typeof I.term === 'function' ? I.term(s) : s);
    const statusApi = ctx.status || null;
    const motion = ctx.motion || C.motion || null;

    /* ───────────── helpers ───────────── */
    const warned = new Set();
    const warn = (where, err) => {
      const key = `${where}:${err && err.message}`;
      if (warned.has(key)) return;
      warned.add(key);
      console.warn(`[risks] ${where}:`, err);
    };
    const safe = (fn, fallback, where = 'call') => {
      try { const v = fn(); return v === undefined || v === null ? fallback : v; } catch (err) { warn(where, err); return fallback; }
    };
    const ico = (name, size = 16) => {
      let node = null;
      try { node = typeof C.svgIcon === 'function' ? C.svgIcon(name, size) : (art && art.icon ? art.icon(name, size) : null); } catch { node = null; }
      if (!(node instanceof Node)) node = C.glyph('neutral', size);
      node.setAttribute('aria-hidden', 'true');
      node.setAttribute('focusable', 'false');
      return node;
    };
    const tryEl = (fn, where) => {
      try { const r = fn(); const el = r instanceof Node ? r : r && r.el; return el instanceof Node ? el : null; } catch (err) { warn(`chart:${where}`, err); return null; }
    };
    const guard = (host, where, build) => {
      try { build(); } catch (err) {
        warn(where, err);
        host.replaceChildren(C.errorState({ title: t('risks.errors.sectionTitle'), text: t('risks.errors.sectionText'), retry: () => schedule() }));
      }
    };
    const state = () => store.state || {};
    const globalFilters = () => ({ siteId: 'all', range: 30, search: '', ...(store.filters || (store.state && store.state.filters) || {}) });
    const sites = () => arr(state().sites);
    const siteById = (id) => sites().find((s) => s && s.id === id) || null;
    const siteName = (id) => { const s = siteById(id); return s ? L(s, 'name', 'sites') : '—'; };
    const now = () => (typeof store.now === 'function' ? store.now() : new Date());
    const todayStart = () => { const d = now(); return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime(); };
    const score = (r) => safe(() => sel.riskScore(r), (Number(r.likelihood) || 0) * (Number(r.severity) || 0), 'riskScore');
    const residual = (r) => safe(() => sel.residualScore(r), (Number(r.residualLikelihood ?? r.likelihood) || 0) * (Number(r.residualSeverity ?? r.severity) || 0), 'residualScore');
    const tierOf = (s) => safe(() => sel.riskTier(s), 'منخفض', 'riskTier');
    const toneOf = (tier) => safe(() => sel.tierTone(tier), 'good', 'tierTone');
    const tierLabel = (tier) => label('tier', tier);
    const tierBadge = (tier) => C.badge(tierLabel(tier), toneOf(tier));
    const statusBadgeFor = (s) => { const b = C.badge(label('riskStatus', s) || '—', STATUS_TONE[s] || 'neutral'); b.classList.add('nowrap'); return b; };
    const categoryLabel = (id) => label('hseCategory', id) || '—';
    const findRisk = (id) => arr(state().risks).find((r) => r && r.id === id) || null;
    const isOverdue = (r) => safe(() => sel.isOverdueRisk(r, todayStart()), (() => { const ms = parseMs(r.dueDate); return r.status !== CLOSED && Number.isFinite(ms) && ms < todayStart(); })(), 'isOverdueRisk');
    const daysOverdue = (r) => Math.max(1, Math.round((todayStart() - parseMs(r.dueDate)) / DAY_MS));
    /** A text field in the active language — unless the user edited it here (then their words show). */
    const text = (r, field) => (arr(r && r.localEdits).includes(field) ? (r[field] ?? '') : (L(r, field, 'risks') ?? ''));
    const ownerName = (v) => (v === USER ? t('risks.history.user') : term(v));
    /**
     * Source label in the active language. With `rec` (the risk whose source `v` is), an imported risk's English twin
     * (`sourceEn`, written by sources.js and cleared by store.updateRisk when the source changes) is used in English:
     * label('riskSource', …) only knows the enum values and would return the Arabic import label as is.
     */
    const sourceLabel = (v, rec = null) => {
      if (v === MANUAL_SOURCE) return t('risks.form.sourceManual');
      if (I.lang() !== 'ar' && rec && rec.source === v && typeof rec.sourceEn === 'string' && rec.sourceEn.trim()) return rec.sourceEn.trim();
      return label('riskSource', v);
    };
    const riyadh = (iso) => {
      const d = fmt.toDate ? fmt.toDate(iso) : new Date(iso);
      if (!d || Number.isNaN(d.getTime())) return '—';
      try {
        const date = fmt.date(d);
        const time = new Intl.DateTimeFormat(fmt.locale(), { timeZone: 'Asia/Riyadh', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(d);
        return t('risks.common.dateTime', { date, time });
      } catch { return fmt.dateTime(d); }
    };
    const whenText = (at) => (!at ? '—' : (String(at).length > 10 ? riyadh(at) : fmt.date(at)));
    const scaleText = (axis, n) => t('risks.scale.item', { n: fmt.num(n), label: t(`risks.scale.${axis}.${n}`) });
    const sourceStatus = () => {
      try { if (statusApi && typeof statusApi.source === 'function') return statusApi.source(state()).status || 'demo'; } catch (err) { warn('status', err); }
      return 'demo';
    };

    function simpleTable(caption, headers, rows, numeric = []) {
      const table = h('table', { class: 'chart-table' });
      table.appendChild(h('caption', {}, caption));
      table.appendChild(h('thead', {}, h('tr', {}, headers.map((x, i) => h('th', { scope: 'col', class: numeric[i] ? 'num' : null }, x)))));
      table.appendChild(h('tbody', {}, rows.length
        ? rows.map((r) => h('tr', {}, r.map((cell, i) => h('td', { class: numeric[i] ? 'num' : null }, cell))))
        : h('tr', {}, h('td', { colspan: String(headers.length), class: 'muted' }, t('risks.common.noData')))));
      return table;
    }
    function toneLegend(items) {
      return h('ul', { class: 'matrix-legend', role: 'list', 'aria-label': t('risks.common.legend') }, items.map((it) => h('li', { class: ['matrix-legend-item', `tone-${it.tone}`] },
        C.glyph(it.tone, 12), h('span', { class: 'legend-key', style: { background: 'var(--tone)' } }), h('span', {}, t('risks.common.legendCount', { label: it.label, count: fmt.num(it.count) })))));
    }

    /* ───────────── lifecycle registers ───────────── */
    const subs = [];
    const timers = [];
    let raf = 0;
    let destroyed = false;
    let drawerApi = null;
    let drawerRiskId = null;
    let modalApi = null;
    let confirmApi = null;
    let table = null;
    let firstPaint = true;

    /* view-local filters (stored enum values; labels are derived at render time) */
    const validTier = TIERS.some((x) => x.tier === params.tier) ? params.tier : null;
    const cellParam = (() => {
      const l = Number(params.l); const s = Number(params.s);
      return Number.isInteger(l) && Number.isInteger(s) && l >= 1 && l <= 5 && s >= 1 && s <= 5 ? { l, s } : null;
    })();
    const local = {
      tiers: validTier ? [validTier] : [],
      status: riskStatuses().includes(params.status) ? params.status : 'all',
      category: categories().some((c) => c.id === params.category) ? params.category : 'all',
      due: ['overdue', 'soon'].includes(params.due) ? params.due : 'all',
      q: '',
      cell: cellParam,
    };

    function matches(r, query) {
      const q = norm(query);
      if (!q) return true;
      const s = siteById(r.siteId);
      const hay = norm([
        r.code, r.hazard, r.activity, r.owner, r.description,
        text(r, 'hazard'), text(r, 'activity'), text(r, 'description'), ownerName(r.owner),
        s && s.name, s && L(s, 'name', 'sites'), s && s.code,
        categoryLabel(r.categoryId), label('riskStatus', r.status), r.status,
      ].filter(Boolean).join(' \u0001 '));
      return q.split(/\s+/).filter(Boolean).every((term0) => hay.includes(term0));
    }
    /** Register rows: selector scope (site, period, status, category) + tiers, due window, cell, search. */
    function filteredRows({ ignore = [] } = {}) {
      const g = globalFilters();
      const base = safe(() => sel.filteredRisks(state(), {
        ...g, search: '',
        status: ignore.includes('status') ? 'all' : local.status,
        categoryId: ignore.includes('category') ? 'all' : local.category,
      }), [], 'filteredRisks').filter(Boolean);
      const soonLimit = todayStart() + 8 * DAY_MS;
      return base.filter((r) => {
        if (!ignore.includes('tier') && local.tiers.length && !local.tiers.includes(tierOf(score(r)))) return false;
        if (!ignore.includes('due')) {
          if (local.due === 'overdue' && !isOverdue(r)) return false;
          if (local.due === 'soon') {
            const ms = parseMs(r.dueDate);
            if (r.status === CLOSED || isOverdue(r) || !Number.isFinite(ms) || ms >= soonLimit) return false;
          }
        }
        if (!ignore.includes('cell') && local.cell && (r.status === CLOSED || Number(r.likelihood) !== local.cell.l || Number(r.severity) !== local.cell.s)) return false;
        return matches(r, g.search) && matches(r, local.q);
      });
    }

    /* ═════════════ A. head ═════════════ */
    const root = h('section', { class: 'view view-risks' });
    const statusHost = h('span', { class: 'row gap-2' });
    const headCount = C.badge('', 'neutral', { icon: ico('shield-alert', 14) });
    root.appendChild(h('div', { class: 'view-head' },
      h('div', { class: 'view-head-text' },
        h('span', { class: 'code-tag', translate: 'no' }, 'SEC-03'),
        h('h1', { tabindex: '-1' }, i18n.has('core.nav.risks.title') ? t('core.nav.risks.title') : t('risks.title')),
        h('p', { class: 'view-lead' }, t('risks.lead'))),
      h('div', { class: 'view-actions' },
        statusHost,
        headCount,
        C.button(t('risks.actions.add'), { variant: 'primary', size: 'sm', icon: ico('plus', 14), onClick: () => openRiskModal(null) }))));

    /* ═════════════ B. summary metrics ═════════════ */
    const metricGrid = h('div', { class: 'metric-grid', role: 'group', 'aria-label': t('risks.metrics.aria') });
    root.appendChild(metricGrid);
    function metricTile({ id, icon, onClick }) {
      const labelEl = h('span', { class: 'metric-label' });
      const valueEl = h('span', { class: 't-metric' });
      const unitEl = h('span', { class: 'metric-unit' });
      const footEl = h('div', { class: 'metric-foot' });
      const el = h(onClick ? 'button' : 'div', { class: 'metric-tile', type: onClick ? 'button' : undefined, 'data-metric': id, onClick: onClick || undefined },
        h('div', { class: 'metric-head' }, labelEl, h('span', { class: 'metric-icon', 'aria-hidden': 'true' }, ico(icon, 16))),
        h('div', { class: 'metric-value' }, valueEl, unitEl),
        footEl);
      let last = null;
      return {
        el,
        set({ title, valueText, unit = '', tone = null, helper = '', aria = '' }) {
          labelEl.textContent = title;
          if (valueEl.textContent !== valueText) valueEl.textContent = valueText;
          unitEl.textContent = unit; unitEl.hidden = !unit;
          ['critical', 'serious', 'warning', 'good', 'accent', 'neutral'].forEach((x) => el.classList.toggle(`tone-${x}`, x === tone));
          footEl.replaceChildren(...(helper ? [h('span', { class: 'metric-helper' }, helper)] : []));
          el.setAttribute('aria-label', aria || `${title}: ${valueText}`);
          if (last !== null && last !== valueText && motion && typeof motion.flash === 'function') motion.flash(el);
          last = valueText;
        },
      };
    }
    const metrics = {
      open: metricTile({ id: 'open', icon: 'layers' }),
      critical: metricTile({ id: 'critical', icon: 'shield-alert', onClick: () => { applyLocal({ tiers: ['حرج'] }); } }),
      overdue: metricTile({ id: 'overdue', icon: 'clock', onClick: () => { applyLocal({ due: 'overdue' }); } }),
      high: metricTile({ id: 'high', icon: 'alert-triangle', onClick: () => { applyLocal({ tiers: ['عالٍ'] }); } }),
    };
    metricGrid.append(metrics.open.el, metrics.critical.el, metrics.overdue.el, metrics.high.el);

    /* ═════════════ C. register ═════════════ */
    const bar = C.filterBar({
      label: t('risks.filters.label'),
      filters: [
        { id: 'tier', type: 'chips', label: t('risks.filters.tier'), options: TIERS.map((x) => ({ value: x.tier, label: tierLabel(x.tier), tone: x.tone })) },
        { id: 'status', type: 'select', label: t('risks.filters.status'), options: riskStatuses().map((s) => ({ value: s, label: label('riskStatus', s) })) },
        { id: 'category', type: 'select', label: t('risks.filters.category'), options: categories().map((c) => ({ value: c.id, label: categoryLabel(c.id) })) },
        { id: 'due', type: 'segmented', label: t('risks.filters.due'), options: [{ value: 'all', label: t('risks.filters.dueAll') }, { value: 'overdue', label: t('risks.filters.dueOverdue') }, { value: 'soon', label: t('risks.filters.dueSoon', { days: fmt.num(7) }) }] },
        { id: 'q', type: 'search', label: t('risks.filters.search'), placeholder: t('risks.filters.searchPlaceholder') },
      ],
      value: { tier: local.tiers, status: local.status, category: local.category, due: local.due, q: '' },
      onChange: (v) => {
        local.tiers = Array.isArray(v.tier) ? v.tier : [];
        local.status = v.status || 'all';
        local.category = v.category || 'all';
        local.due = v.due || 'all';
        local.q = v.q || '';
        renderAll({ resetPage: true });
      },
      onReset: () => { local.cell = null; },
    });
    function applyLocal(patch) {
      Object.assign(local, patch);
      bar.set({ tier: local.tiers, status: local.status, category: local.category, due: local.due, q: local.q });
      renderAll({ resetPage: true });
      try { registerCard.scrollIntoView({ block: 'start', behavior: motion && motion.enabled && motion.enabled() ? 'smooth' : 'auto' }); } catch { /* ignore */ }
    }
    const cellHost = h('div', { class: 'row wrap gap-2' });
    const resultCount = h('p', { class: 't-helper', 'aria-live': 'polite' });
    const tableHost = h('div');
    const registerCard = C.card({
      code: 'REG-01', title: t('risks.register.title'), subtitle: t('risks.register.subtitle'),
      body: h('div', { class: 'stack gap-3' }, bar.el, h('div', { class: 'row between wrap gap-2' }, cellHost, resultCount), tableHost),
    });
    registerCard.style.gridColumn = 'span 12';

    /* ═════════════ D. side cards ═════════════ */
    const matrixHost = h('div');
    const matrixLegendHost = h('div');
    const matrixCard = C.card({
      code: 'RSK-5X5', title: t('risks.matrix.title'), subtitle: t('risks.matrix.subtitle'),
      body: h('div', { class: 'stack gap-3' }, matrixHost, matrixLegendHost), tableView: matrixTable, className: 'is-compact',
    });
    const catHost = h('div');
    const catCard = C.card({
      code: 'RSK-CAT', title: t('risks.categories.title'), subtitle: t('risks.categories.subtitle'),
      body: catHost, tableView: categoriesTable, className: 'is-compact',
    });
    const sideCol = h('div', { style: { gridColumn: 'span 12', display: 'grid', gap: 'var(--gap, var(--space-4))', alignItems: 'start', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 340px), 1fr))' } }, matrixCard, catCard);
    root.appendChild(h('div', { class: 'grid-12' }, registerCard, sideCol));
    container.appendChild(root);

    /* Register density follows the card width: all columns ≥ 1180 px of card, five columns ≥ 600 px,
       a two-column list on phones. The filter bar's chips and segmented groups take a full row when narrow. */
    const REGISTER_WIDE_FROM = 1180;
    const REGISTER_COMPACT_FROM = 600;
    const modeFor = (w) => (w >= REGISTER_WIDE_FROM ? 'wide' : w >= REGISTER_COMPACT_FROM ? 'compact' : 'phone');
    const fitBar = (w) => {
      const narrow = w < 700;
      // Narrow: every group takes its own row (label + control); selects shrink instead of forcing overflow.
      bar.el.querySelectorAll('[data-filter]').forEach((g) => { if (g.dataset.type !== 'search') g.style.flex = narrow ? '1 1 100%' : ''; });
      bar.el.querySelectorAll('select.field-control').forEach((sel0) => { sel0.style.minInlineSize = narrow ? '0' : ''; sel0.style.flex = narrow ? '1 1 auto' : ''; sel0.style.maxInlineSize = narrow ? 'none' : ''; });
      const chips = bar.el.querySelector('[data-filter="tier"] .chip-group');
      if (chips) chips.classList.toggle('chips', narrow);
    };
    let mode = (() => { const w = registerCard.getBoundingClientRect().width; return w > 0 ? modeFor(w) : 'wide'; })();
    fitBar(registerCard.getBoundingClientRect().width || 1200);
    let layoutObserver = null;
    let layoutRaf = 0;
    let lastRegisterWidth = -1;
    if (typeof ResizeObserver === 'function') {
      layoutObserver = new ResizeObserver((entries) => {
        for (const e of entries) {
          const w = Math.round(e.contentRect.width);
          if (w === lastRegisterWidth || w === 0) continue;
          lastRegisterWidth = w;
          if (layoutRaf) cancelAnimationFrame(layoutRaf);
          layoutRaf = requestAnimationFrame(() => {
            layoutRaf = 0;
            if (destroyed) return;
            fitBar(w);
            const next = modeFor(w);
            if (next === mode) return;
            const keep = table ? table.getState() : null;
            mode = next;
            table = null;
            renderTable({});
            if (keep && table) table.setState({ sortKey: keep.sortKey, sortDir: keep.sortDir, page: keep.page });
          });
        }
      });
      layoutObserver.observe(registerCard);
    }

    /* ───────────── table columns ───────────── */
    const scoreCell = (s) => h('span', { class: 'row gap-2 nowrap' }, h('strong', { class: 'mono' }, fmt.num(s)), tierBadge(tierOf(s)));
    function dueCell(r) {
      const ms = parseMs(r.dueDate);
      if (!Number.isFinite(ms)) return '—';
      const dateText = fmt.date(r.dueDate, { style: 'short' });
      if (r.status === CLOSED) return h('span', { class: 'cell-sub' }, dateText);
      if (isOverdue(r)) return h('span', { class: 'stack gap-1', style: { alignItems: 'flex-start' } }, C.badge(tn('risks.due.overdue', daysOverdue(r)), 'critical'), h('span', { class: 'cell-sub' }, dateText));
      const days = Math.round((ms - todayStart()) / DAY_MS);
      if (days <= 7) return h('span', { class: 'stack gap-1', style: { alignItems: 'flex-start' } }, C.badge(days === 0 ? t('risks.due.today') : tn('risks.due.inDays', days), 'warning'), h('span', { class: 'cell-sub' }, dateText));
      return h('span', { class: 'nowrap' }, dateText);
    }
    const codeCell = (r) => h('span', { class: 'code mono nowrap', dir: 'ltr', translate: 'no' }, String(r.code || ''));
    const columns = () => [
      { key: 'code', label: t('risks.cols.code'), priority: 'high', width: 92, sortValue: (r) => r.code, render: codeCell },
      { key: 'hazard', label: t('risks.cols.hazard'), priority: 'high', sortValue: (r) => text(r, 'hazard'),
        render: (r) => h('div', { class: 'stack gap-1', style: { minInlineSize: '200px', maxInlineSize: '280px' } },
          h('span', { class: 'cell-title', style: { whiteSpace: 'normal', lineHeight: '1.4' } }, text(r, 'hazard') || '—'),
          text(r, 'activity') ? h('span', { class: 'cell-sub', style: { whiteSpace: 'normal' } }, text(r, 'activity')) : null) },
      { key: 'siteId', label: t('risks.cols.site'), priority: 'high', sortValue: (r) => siteName(r.siteId),
        render: (r) => { const s = siteById(r.siteId); return h('div', { class: 'stack gap-1', style: { minInlineSize: '110px', maxInlineSize: '170px' } }, h('span', { style: { whiteSpace: 'normal', lineHeight: '1.35' } }, s ? L(s, 'name', 'sites') : '—'), s ? h('span', { class: 'cell-sub code mono nowrap', dir: 'ltr', translate: 'no' }, String(s.code || '')) : null); } },
      { key: 'categoryId', label: t('risks.cols.category'), priority: 'medium', sortValue: (r) => categoryLabel(r.categoryId),
        render: (r) => { const c = categoryById(r.categoryId); return h('span', { class: 'row gap-2', style: { minInlineSize: '120px', maxInlineSize: '170px' } }, ico(c.icon || 'hazard', 14), h('span', { style: { whiteSpace: 'normal', lineHeight: '1.35' } }, categoryLabel(c.id))); } },
      { key: 'likelihood', label: t('risks.cols.likelihood'), priority: 'medium', align: 'center', sortValue: (r) => Number(r.likelihood) || 0,
        render: (r) => h('span', { class: 'mono', title: t(`risks.scale.likelihood.${Number(r.likelihood) || 1}`) }, fmt.num(Number(r.likelihood) || 0)) },
      { key: 'severity', label: t('risks.cols.severity'), priority: 'medium', align: 'center', sortValue: (r) => Number(r.severity) || 0,
        render: (r) => h('span', { class: 'mono', title: t(`risks.scale.severity.${Number(r.severity) || 1}`) }, fmt.num(Number(r.severity) || 0)) },
      { key: 'score', label: t('risks.cols.score'), priority: 'high', sortValue: (r) => score(r), render: (r) => scoreCell(score(r)) },
      { key: 'residual', label: t('risks.cols.residual'), priority: 'low', sortValue: (r) => residual(r), render: (r) => scoreCell(residual(r)) },
      { key: 'owner', label: t('risks.cols.owner'), priority: 'low', sortValue: (r) => ownerName(r.owner), render: (r) => h('span', { style: { whiteSpace: 'normal' } }, ownerName(r.owner) || '—') },
      { key: 'dueDate', label: t('risks.cols.due'), priority: 'high', sortValue: (r) => parseMs(r.dueDate), render: dueCell },
      { key: 'status', label: t('risks.cols.status'), priority: 'high', sortValue: (r) => riskStatuses().indexOf(r.status), render: (r) => statusBadgeFor(r.status) },
    ];
    /* Compact register (narrow card, tablets with panels open, phones): five columns; site and category
       fold into the hazard cell, likelihood / severity / residual / owner stay in the drawer. */
    const compactColumns = () => {
      const all = columns();
      return [
        all[0],
        { key: 'hazard', label: t('risks.cols.hazard'), priority: 'high', sortValue: (r) => text(r, 'hazard'),
          render: (r) => {
            const s = siteById(r.siteId);
            return h('div', { class: 'stack gap-1', style: { minInlineSize: '150px', maxInlineSize: 'clamp(150px, 48cqi, 340px)' } },
              h('span', { class: 'cell-title', style: { whiteSpace: 'normal', lineHeight: '1.4' } }, text(r, 'hazard') || '—'),
              h('span', { class: 'cell-sub', style: { whiteSpace: 'normal' } }, s ? h('span', { class: 'code mono nowrap', dir: 'ltr', translate: 'no' }, String(s.code || '')) : null, s ? ' · ' : null, categoryLabel(r.categoryId)));
          } },
        all.find((c) => c.key === 'score'),
        { ...all.find((c) => c.key === 'dueDate'), priority: 'medium' },
        all.find((c) => c.key === 'status'),
      ];
    };
    /* Phone register: one readable block per risk (code · site, hazard, tier / status / due badges) + the score. */
    const phoneColumns = () => {
      const all = columns();
      return [
        { key: 'hazard', label: t('risks.cols.hazard'), priority: 'high', sortValue: (r) => text(r, 'hazard'),
          render: (r) => {
            const s = siteById(r.siteId);
            const ms = parseMs(r.dueDate);
            const days = Number.isFinite(ms) ? Math.round((ms - todayStart()) / DAY_MS) : null;
            const due = r.status === CLOSED || days === null ? null
              : isOverdue(r) ? C.badge(tn('risks.due.overdue', daysOverdue(r)), 'critical')
                : days <= 7 ? C.badge(days === 0 ? t('risks.due.today') : tn('risks.due.inDays', days), 'warning') : null;
            return h('div', { class: 'stack gap-1', style: { minInlineSize: '0', whiteSpace: 'normal' } },
              h('span', { class: 'cell-sub' }, h('span', { class: 'code mono nowrap', dir: 'ltr', translate: 'no' }, String(r.code || '')), s ? ' · ' : null, s ? h('span', { class: 'code mono nowrap', dir: 'ltr', translate: 'no' }, String(s.code || '')) : null, ' · ', categoryLabel(r.categoryId)),
              h('span', { class: 'cell-title', style: { whiteSpace: 'normal', lineHeight: '1.4' } }, text(r, 'hazard') || '—'),
              h('span', { class: 'row wrap gap-1', style: { marginBlockStart: '2px' } }, tierBadge(tierOf(score(r))), statusBadgeFor(r.status), due));
          } },
        { key: 'score', label: t('risks.cols.score'), priority: 'high', align: 'end', width: 64, sortValue: (r) => score(r), render: (r) => h('strong', { class: 'mono' }, fmt.num(score(r))) },
      ];
    };

    /* ───────────── table twins ───────────── */
    function matrixCounts() {
      return safe(() => sel.riskMatrix(state(), { ...globalFilters(), status: local.status, categoryId: local.category }), Array.from({ length: 5 }, () => Array(5).fill(0)), 'riskMatrix');
    }
    function matrixTable() {
      const m = matrixCounts();
      const header = [t('risks.matrix.corner'), ...[1, 2, 3, 4, 5].map((n) => scaleText('likelihood', n))];
      const rows = [1, 2, 3, 4, 5].map((n, ri) => [scaleText('severity', n), ...[0, 1, 2, 3, 4].map((ci) => fmt.num(Number(m[ri] && m[ri][ci]) || 0))]);
      return simpleTable(t('risks.matrix.tableCaption', { n: fmt.num(5) }), header, rows, [false, true, true, true, true, true]);
    }
    function categoryCounts() {
      const counts = new Map();
      filteredRows({ ignore: ['category'] }).filter((r) => r.status !== CLOSED).forEach((r) => counts.set(r.categoryId, (counts.get(r.categoryId) || 0) + 1));
      return categories().map((c) => ({ id: c.id, label: categoryLabel(c.id), value: counts.get(c.id) || 0 })).filter((c) => c.value > 0).sort((a, b) => b.value - a.value);
    }
    function categoriesTable() {
      return simpleTable(t('risks.categories.title'), [t('risks.cols.category'), t('risks.categories.count')], categoryCounts().map((c) => [c.label, fmt.num(c.value)]), [false, true]);
    }

    /* ───────────── renderers ───────────── */
    function renderHead() {
      const s = sourceStatus();
      statusHost.replaceChildren(typeof C.statusBadge === 'function' ? C.statusBadge(s, { size: 'sm' }) : C.badge(s, 'accent'));
      const all = arr(state().risks);
      const open = all.filter((r) => r && r.status !== CLOSED).length;
      headCount.querySelector('.badge-text').textContent = t('risks.head.count', { total: tn('risks.common.risks', all.length), open: fmt.num(open) });
    }

    function renderMetrics() {
      const g = globalFilters();
      // One definition per metric: kpis (open / critical / high) and overdueRisks come from the selectors.
      const k = safe(() => sel.kpis(state(), g), null, 'kpis');
      const overdue = safe(() => sel.overdueRisks(state(), g, now()), [], 'overdueRisks');
      const open = k ? k.openRisks : 0;
      const critical = k ? k.criticalRisks : 0;
      const high = k ? k.highRisks : 0;
      metrics.open.set({ title: t('risks.metrics.open'), valueText: fmt.num(open), helper: t('risks.metrics.openHelper'), aria: t('risks.metrics.openAria', { count: fmt.num(open) }) });
      metrics.critical.set({ title: t('risks.metrics.critical'), valueText: fmt.num(critical), tone: critical ? 'critical' : 'good', helper: t('risks.metrics.criticalHelper', { min: fmt.num(16), max: fmt.num(25) }), aria: t('risks.metrics.criticalAria', { count: fmt.num(critical) }) });
      metrics.overdue.set({ title: t('risks.metrics.overdue'), valueText: fmt.num(overdue.length), tone: overdue.length ? 'serious' : 'good', helper: t('risks.metrics.overdueHelper'), aria: t('risks.metrics.overdueAria', { count: fmt.num(overdue.length) }) });
      metrics.high.set({ title: t('risks.metrics.high'), valueText: fmt.num(high), tone: high ? 'serious' : 'good', helper: t('risks.metrics.highHelper', { min: fmt.num(10), max: fmt.num(15) }), aria: t('risks.metrics.highAria', { count: fmt.num(high) }) });
    }

    function renderCell() {
      if (!local.cell) { cellHost.replaceChildren(); return; }
      const { l, s } = local.cell;
      const text = t('risks.cell.chip', { l: fmt.num(l), s: fmt.num(s), score: fmt.num(l * s) });
      // The whole chip is the (≥ 40 px on touch) target that removes the cell filter.
      const chip = h('button', { type: 'button', class: 'chip is-active', 'aria-pressed': 'true', 'aria-label': `${text} — ${t('risks.cell.remove')}`, title: t('risks.cell.remove'),
        onClick: () => { local.cell = null; renderAll({ resetPage: true }); C.toast(t('risks.cell.cleared'), { tone: 'accent', timeout: 2500 }); } },
        ico('grid', 14),
        h('span', { class: 'chip-label' }, text),
        h('span', { class: 'chip-remove', 'aria-hidden': 'true' }, C.glyph('close', 12)));
      cellHost.replaceChildren(chip);
    }

    function renderTable({ resetPage = false, live = false } = {}) {
      const rows = filteredRows();
      const open = rows.filter((r) => r.status !== CLOSED).length;
      const overdue = rows.filter(isOverdue).length;
      resultCount.textContent = overdue
        ? t('risks.register.resultOverdue', { total: tn('risks.common.risks', rows.length), open: fmt.num(open), overdue: fmt.num(overdue) })
        : t('risks.register.result', { total: tn('risks.common.risks', rows.length), open: fmt.num(open) });
      const anyFilter = local.tiers.length || local.status !== 'all' || local.category !== 'all' || local.due !== 'all' || local.q || local.cell || globalFilters().search;
      if (!table) {
        table = C.dataTable({
          columns: mode === 'wide' ? columns() : mode === 'compact' ? compactColumns() : phoneColumns(), rows, rowKey: 'id', pageSize: 10, dense: true, caption: t('risks.register.title'), stickyFirst: true,
          initialSort: { key: 'score', dir: 'desc' }, emptyText: anyFilter ? t('risks.register.emptyFiltered') : t('risks.register.empty'),
          rowLabel: (r) => `${r.code} — ${text(r, 'hazard')}`,
          onRowClick: (row) => openDrawer(row.id),
        });
        tableHost.replaceChildren(table.el);
      } else {
        table.update(rows, live ? { preserve: true, flash: true } : { resetPage });
      }
    }

    function renderSide() {
      const m = matrixCounts();
      const chart = tryEl(() => charts.heatmap({
        rows: [1, 2, 3, 4, 5].map((n) => scaleText('severity', n)),
        cols: [1, 2, 3, 4, 5].map((n) => scaleText('likelihood', n)),
        cells: m,
        colorFor: (value, ri, ci) => `var(--${toneOf(tierOf(((Number(ri) || 0) + 1) * ((Number(ci) || 0) + 1)))})`,
        labelFor: (value) => (value ? fmt.num(value) : ''),
        onCellClick: (info) => {
          const ri = Number(info && info.ri) || 0;
          const ci = Number(info && info.ci) || 0;
          const next = { l: ci + 1, s: ri + 1 };
          const same = local.cell && local.cell.l === next.l && local.cell.s === next.s;
          local.cell = same ? null : next;
          renderAll({ resetPage: true });
          C.toast(same ? t('risks.cell.cleared') : t('risks.cell.applied', { l: fmt.num(next.l), s: fmt.num(next.s) }), { tone: 'accent', timeout: 2500 });
        },
        cellSize: 'auto', maxCell: 56, ariaLabel: t('risks.matrix.aria'), rowTitle: t('risks.matrix.rowTitle'), colTitle: t('risks.matrix.colTitle'),
      }), 'heatmap');
      matrixHost.replaceChildren(chart || C.emptyState({ title: t('risks.errors.chart') }));
      const counts = { critical: 0, serious: 0, warning: 0, good: 0 };
      filteredRows({ ignore: ['tier', 'cell'] }).filter((r) => r.status !== CLOSED).forEach((r) => { const x = toneOf(tierOf(score(r))); if (x in counts) counts[x] += 1; });
      matrixLegendHost.replaceChildren(toneLegend(TIERS.map((x) => ({ tone: x.tone, label: tierLabel(x.tier), count: counts[x.tone] }))));

      const items = categoryCounts();
      catHost.replaceChildren(items.length
        ? (tryEl(() => charts.barChart({ items, horizontal: true, height: Math.max(160, Math.min(items.length, 12) * 30 + 24), valueFormat: fmt.num, color: 'var(--s1)', showValues: true, maxBars: 12, ariaLabel: t('risks.categories.aria') }), 'barChart') || C.emptyState({ title: t('risks.errors.chart') }))
        : C.emptyState({ icon: ico('check-circle', 28), title: t('risks.categories.emptyTitle'), text: t('risks.categories.emptyText') }));
    }

    /* ───────────── drawer ───────────── */
    const section = (title, ...children) => h('section', { class: 'drawer-section' }, title ? h('h3', { class: 'drawer-section-title' }, title) : null, ...children);

    function controlsHierarchy(risk) {
      const controls = arr(text(risk, 'controls'));
      const byType = new Map();
      controls.forEach((c) => { if (!c) return; const type = c.type || controlTypes()[3]; if (!byType.has(type)) byType.set(type, []); byType.get(type).push(c); });
      return h('ol', { class: 'stepper is-vertical', role: 'list', 'aria-label': t('risks.drawer.hierarchy') }, controlTypes().map((type, idx) => {
        const items = byType.get(type) || [];
        const has = items.length > 0;
        return h('li', { class: ['step', has ? 'is-done' : null] },
          h('span', { class: 'step-dot', 'aria-hidden': 'true' }, has ? ico('check', 12) : null),
          h('div', { class: 'stack gap-1', style: { flex: '1', minInlineSize: '0' } },
            h('span', { class: 'step-label' }, h('strong', {}, label('controlType', type)), h('span', { class: 't-helper' }, ` — ${t(`risks.hierarchy.${idx}`)}`)),
            h('span', { class: 'sr-only' }, has ? t('risks.drawer.levelHas', { count: fmt.num(items.length) }) : t('risks.drawer.levelNone')),
            has
              ? h('ul', { class: 'controls-list', role: 'list' }, items.map((c, i) => h('li', { class: 'controls-item' }, h('span', { class: 'controls-type' }, fmt.num(i + 1)), h('span', {}, String(c.text || '')))))
              : h('span', { class: 't-helper' }, t('risks.drawer.levelNone'))));
      }));
    }

    function historyEntries(risk) {
      const list = arr(L(risk, 'history', 'risks'));
      const en = I.lang() !== 'ar';
      return list.filter(Boolean).map((ev, i) => {
        let body = String(ev.text || '');
        const own = arr(risk.history)[i] || ev;
        // A register edit is worded from its structure in both languages (older saves: the Arabic sentence only).
        if (own.kind === 'edit' || String(own.text || '') === NOTE_EDIT) body = t('risks.history.edited');
        else if (en) {
          const raw = String(own.text || '');
          const m = STATUS_CHANGE_RE.exec(raw);
          if (m && body === raw) body = t('risks.history.statusChanged', { from: label('riskStatus', m[1]), to: label('riskStatus', m[2]) });
          else if (raw === HISTORY_CREATED && body === raw) body = t('risks.history.created');
          else if (body === raw && ev.textEn) body = ev.textEn;
        }
        return { at: ev.at, by: ev.by, body, order: i };
      }).sort((a, b) => (parseMs(b.at) || 0) - (parseMs(a.at) || 0) || b.order - a.order);
    }

    function overviewTab(risk) {
      const s = score(risk);
      const tier = tierOf(s);
      const res = residual(risk);
      const rTier = tierOf(res);
      const cat = categoryById(risk.categoryId);
      const site = siteById(risk.siteId);
      const reduction = s > 0 ? Math.round(((s - res) / s) * 100) : 0;
      const zones = site ? arr(L(site, 'zones', 'sites')) : [];
      const zone = risk.zoneId ? zones.find((z) => z && z.id === risk.zoneId) : null;
      const barRow = (name, value, x) => h('div', { class: 'bar-pair-row' },
        h('span', {}, name),
        C.progress({ value, max: 25, tone: toneOf(x), label: t('risks.drawer.barAria', { name, value: fmt.num(value), max: fmt.num(25), tier: tierLabel(x) }) }),
        h('span', { class: 'progress-value' }, fmt.num(value)));
      const statusSeg = C.segmented({
        options: riskStatuses().map((x) => ({ value: x, label: label('riskStatus', x) })),
        value: risk.status, ariaLabel: t('risks.drawer.changeStatus'),
        onChange: (v) => {
          if (v === risk.status) return;
          const updated = store.updateRisk(risk.id, { status: v, by: USER });
          C.toast(updated ? t('risks.toast.status', { code: risk.code, status: label('riskStatus', v) }) : t('risks.toast.statusFailed'), { tone: updated ? (v === CLOSED ? 'good' : 'accent') : 'warning' });
        },
      });
      statusSeg.el.classList.add('is-block');
      statusSeg.el.dataset.focusKey = 'status';

      return h('div', {},
        section(null,
          h('div', { class: 'row wrap gap-2' },
            tierBadge(tier), statusBadgeFor(risk.status),
            C.badge(categoryLabel(cat.id), 'neutral', { icon: ico(cat.icon || 'hazard', 12) }),
            isOverdue(risk) ? C.badge(tn('risks.due.overdue', daysOverdue(risk)), 'critical') : null),
          text(risk, 'description') ? h('p', { class: 't-body', style: { marginBlockStart: '10px' } }, text(risk, 'description')) : null),
        section(t('risks.drawer.basics'), C.kv([
          [t('risks.drawer.site'), site ? h('span', {}, L(site, 'name', 'sites'), ' ', h('span', { class: 'code mono', dir: 'ltr', translate: 'no' }, `(${site.code})`)) : '—'],
          [t('risks.drawer.activity'), text(risk, 'activity') || '—'],
          [t('risks.drawer.zone'), zone ? (zone.name || risk.zoneId) : '—'],
          [t('risks.drawer.owner'), ownerName(risk.owner) || '—'],
          [t('risks.drawer.source'), sourceLabel(risk.source, risk) || '—'],
          [t('risks.drawer.due'), risk.dueDate ? fmt.date(risk.dueDate) : '—'],
          [t('risks.drawer.legal'), text(risk, 'legalRef') || '—'],
          [t('risks.drawer.created'), whenText(risk.createdAt)],
          [t('risks.drawer.updated'), whenText(risk.updatedAt)],
        ])),
        section(t('risks.drawer.scores'),
          h('div', { class: 'bar-pair' }, barRow(t('risks.drawer.inherent'), s, tier), barRow(t('risks.drawer.residual'), res, rTier)),
          h('p', { class: 't-helper', style: { marginBlockStart: '8px' } },
            h('bdi', {}, t('risks.drawer.formula', {
              l: fmt.num(Number(risk.likelihood) || 0), s: fmt.num(Number(risk.severity) || 0), score: fmt.num(s), tier: tierLabel(tier),
              rl: fmt.num(Number(risk.residualLikelihood ?? risk.likelihood) || 0), rs: fmt.num(Number(risk.residualSeverity ?? risk.severity) || 0), rscore: fmt.num(res), rtier: tierLabel(rTier),
            })),
            reduction > 0 ? ` ${t('risks.drawer.reduction', { pct: fmt.pct(reduction) })}` : '')),
        section(t('risks.drawer.changeStatus'), statusSeg.el, h('p', { class: 't-helper', style: { marginBlockStart: '8px' } }, t('risks.drawer.statusNote'))));
    }

    function historyTab(risk) {
      const entries = historyEntries(risk);
      if (!entries.length) return C.emptyState({ icon: ico('clock', 28), title: t('risks.drawer.historyEmpty'), text: t('risks.drawer.historyEmptyText') });
      return h('ol', { class: 'timeline', role: 'list' }, entries.map((ev) => h('li', { class: 'timeline-item' },
        h('time', { class: 'timeline-time', datetime: String(ev.at || '') }, whenText(ev.at)),
        h('p', { class: 'timeline-text' }, ev.body),
        ev.by ? h('p', { class: 'timeline-by' }, ownerName(ev.by)) : null)));
    }

    function openDrawer(id) {
      const risk = findRisk(id);
      if (!risk) { C.toast(t('risks.toast.notFound'), { tone: 'warning' }); return; }
      if (drawerApi) { const prev = drawerApi; drawerApi = null; try { prev.close(); } catch { /* ignore */ } }
      drawerRiskId = id;
      const tableState = table ? table.getState() : null;
      drawerApi = C.drawer({
        kind: 'hse-risk',
        title: `${risk.code} — ${text(risk, 'hazard')}`,
        subtitle: `${siteName(risk.siteId)} · ${categoryLabel(risk.categoryId)}`,
        size: 'lg',
        tabs: [
          { id: 'overview', label: t('risks.drawer.tabs.overview'), icon: 'info', render: () => { const r = findRisk(drawerRiskId); return r ? overviewTab(r) : C.emptyState({ title: t('risks.toast.notFound') }); } },
          { id: 'controls', label: t('risks.drawer.tabs.controls'), icon: 'layers', count: arr(risk.controls).length, render: () => { const r = findRisk(drawerRiskId); return r ? section(t('risks.drawer.hierarchy'), h('p', { class: 't-helper', style: { marginBlockEnd: '12px' } }, t('risks.drawer.hierarchyLead')), controlsHierarchy(r)) : null; } },
          { id: 'history', label: t('risks.drawer.tabs.history'), icon: 'clock', count: arr(risk.history).length, render: () => { const r = findRisk(drawerRiskId); return r ? historyTab(r) : null; } },
        ],
        actions: [
          { label: t('risks.actions.edit'), variant: 'outline', icon: ico('edit', 15), closes: false, onClick: () => { const r = findRisk(drawerRiskId); if (r) openRiskModal(r); return false; } },
          { label: t('risks.actions.delete'), variant: 'danger', icon: ico('trash', 15), closes: false, attrs: { class: 'is-soft' }, onClick: () => { const r = findRisk(drawerRiskId); if (r) confirmDelete(r); return false; } },
        ],
        onClose: (reason) => {
          drawerApi = null; drawerRiskId = null;
          // Closing keeps the reader's place: filters are untouched and the table's sort / page are restored.
          if (table && tableState) table.setState({ sortKey: tableState.sortKey, sortDir: tableState.sortDir, page: tableState.page });
          // A live update may have re-rendered the row that opened the drawer: hand focus back to its twin.
          const active = document.activeElement;
          if (reason !== 'navigate' && (!active || active === document.body) && table) {
            const esc = typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(id) : id;
            const twin = table.el.querySelector(`tr[data-key="${esc}"] .row-open`) || table.el.querySelector('.row-open');
            if (twin) { try { twin.focus({ preventScroll: true }); } catch { twin.focus(); } }
          }
        },
      });
      drawerApi.open();
    }
    function refreshDrawer() {
      if (!drawerApi || !drawerRiskId) return;
      const risk = findRisk(drawerRiskId);
      if (!risk) { const api = drawerApi; drawerApi = null; drawerRiskId = null; try { api.close(); } catch { /* ignore */ } return; }
      const active = document.activeElement;
      const focusKey = active && drawerApi.el.contains(active) && active.closest('[data-focus-key]') ? { key: active.closest('[data-focus-key]').dataset.focusKey, value: active.getAttribute('data-value') } : null;
      try { drawerApi.setTitle(`${risk.code} — ${text(risk, 'hazard')}`); } catch { /* ignore */ }
      try { drawerApi.setSubtitle(`${siteName(risk.siteId)} · ${categoryLabel(risk.categoryId)}`); } catch { /* ignore */ }
      if (typeof drawerApi.setTabCount === 'function') {
        drawerApi.setTabCount('controls', arr(risk.controls).length);
        drawerApi.setTabCount('history', arr(risk.history).length);
      }
      ['overview', 'controls', 'history'].forEach((id) => { try { drawerApi.refreshTab(id); } catch { /* ignore */ } });
      if (focusKey) {
        const scope = drawerApi.el.querySelector(`[data-focus-key="${focusKey.key}"]`);
        const target = scope && (focusKey.value !== null ? scope.querySelector(`[data-value="${CSS.escape(focusKey.value)}"]`) : scope.querySelector('button'));
        if (target) { try { target.focus({ preventScroll: true }); } catch { target.focus(); } }
      }
    }

    function confirmDelete(risk) {
      if (confirmApi) { try { confirmApi.close(); } catch { /* ignore */ } }
      confirmApi = C.modal({
        title: t('risks.delete.title'),
        subtitle: risk.code,
        size: 'sm',
        body: h('div', { class: 'stack gap-3' },
          h('p', { class: 't-body' }, t('risks.delete.text', { hazard: text(risk, 'hazard') || risk.code })),
          h('div', { class: 'note tone-critical' }, h('strong', {}, t('risks.delete.warnTitle')), ' ', t('risks.delete.warnText'))),
        actions: [
          { label: t('core.common.cancel'), variant: 'ghost' },
          { label: t('risks.delete.confirm'), variant: 'danger', icon: ico('trash', 15), onClick: () => {
            const ok = store.deleteRisk(risk.id);
            C.toast(ok ? t('risks.toast.deleted', { code: risk.code }) : t('risks.toast.deleteFailed'), { tone: ok ? 'neutral' : 'warning' });
            if (ok && drawerApi) { const api = drawerApi; drawerApi = null; drawerRiskId = null; try { api.close(); } catch { /* ignore */ } }
          } },
        ],
        onClose: () => { confirmApi = null; },
      });
      confirmApi.open();
    }

    /* ───────────── add / edit modal ───────────── */
    function openRiskModal(existing) {
      if (modalApi) { try { modalApi.close(); } catch { /* ignore */ } }
      const isEdit = Boolean(existing);
      const g = globalFilters();
      const defaults = {
        siteId: g.siteId !== 'all' && siteById(g.siteId) ? g.siteId : (sites()[0] ? sites()[0].id : 'S1'),
        categoryId: local.category !== 'all' ? local.category : 'height',
        hazard: '', activity: '', description: '', legalRef: '',
        likelihood: 3, severity: 3, residualLikelihood: 2, residualSeverity: 3,
        controls: [], owner: '', dueDate: isoDate(new Date(now().getTime() + 14 * DAY_MS)),
        status: riskStatuses()[0], source: 'تقييم مخاطر',
      };
      const r = { ...defaults, ...(existing || {}) };
      // What the form shows (and what "unchanged" means on save): the text in the active language.
      const shown = {};
      TEXT_FIELDS.forEach((f) => { shown[f] = isEdit ? text(existing, f) : ''; });
      const shownControls = isEdit ? arr(text(existing, 'controls')).map((c) => ({ type: c.type, text: String(c.text || '') })) : [];
      const shownOwner = isEdit ? ownerName(existing.owner) : '';
      const scale = (axis) => [1, 2, 3, 4, 5].map((n) => ({ value: n, label: scaleText(axis, n) }));
      const sourceOptions = RISK_SOURCES.map((s) => ({ value: s, label: sourceLabel(s) }));
      if (r.source && !RISK_SOURCES.includes(r.source)) sourceOptions.push({ value: r.source, label: sourceLabel(r.source, r) || r.source });
      const F = {
        hazard: C.formField({ label: t('risks.form.hazard'), name: 'hazard', value: shown.hazard, required: true, placeholder: t('risks.form.hazardPh') }),
        siteId: C.formField({ label: t('risks.form.site'), name: 'siteId', type: 'select', value: r.siteId, required: true, options: sites().map((s) => ({ value: s.id, label: `${s.code} — ${L(s, 'name', 'sites')}` })) }),
        categoryId: C.formField({ label: t('risks.form.category'), name: 'categoryId', type: 'select', value: r.categoryId, required: true, options: categories().map((c) => ({ value: c.id, label: categoryLabel(c.id) })) }),
        activity: C.formField({ label: t('risks.form.activity'), name: 'activity', value: shown.activity, placeholder: t('risks.form.activityPh', { floor: fmt.num(23) }) }),
        description: C.formField({ label: t('risks.form.description'), name: 'description', type: 'textarea', value: shown.description, rows: 3, placeholder: t('risks.form.descriptionPh') }),
        likelihood: C.formField({ label: t('risks.form.likelihood'), name: 'likelihood', type: 'select', value: r.likelihood, options: scale('likelihood'), required: true }),
        severity: C.formField({ label: t('risks.form.severity'), name: 'severity', type: 'select', value: r.severity, options: scale('severity'), required: true }),
        residualLikelihood: C.formField({ label: t('risks.form.residualLikelihood'), name: 'residualLikelihood', type: 'select', value: r.residualLikelihood, options: scale('likelihood'), hint: t('risks.form.afterControls') }),
        residualSeverity: C.formField({ label: t('risks.form.residualSeverity'), name: 'residualSeverity', type: 'select', value: r.residualSeverity, options: scale('severity'), hint: t('risks.form.afterControls') }),
        owner: C.formField({ label: t('risks.form.owner'), name: 'owner', value: shownOwner, required: true, placeholder: t('risks.form.ownerPh') }),
        dueDate: C.formField({ label: t('risks.form.due'), name: 'dueDate', type: 'date', value: r.dueDate, required: true }),
        status: C.formField({ label: t('risks.form.status'), name: 'status', type: 'select', value: r.status, options: riskStatuses().map((s) => ({ value: s, label: label('riskStatus', s) })) }),
        source: C.formField({ label: t('risks.form.source'), name: 'source', type: 'select', value: r.source, options: sourceOptions }),
        legalRef: C.formField({ label: t('risks.form.legal'), name: 'legalRef', value: shown.legalRef, placeholder: t('risks.form.legalPh', { article: fmt.num(12) }) }),
      };
      ['hazard', 'description'].forEach((k) => F[k].classList.add('span-2'));
      const subGrid = (cols, ...children) => h('div', { class: 'span-2', style: { display: 'grid', gridTemplateColumns: cols, gap: 'var(--space-3)' } }, ...children);
      const summary = h('div', { class: 'form-error-summary span-2', role: 'alert', hidden: true });

      /* live score preview */
      const preview = h('div', { class: 'note span-2', 'aria-live': 'polite' });
      const val = (f) => Number(F[f].querySelector('select').value) || 0;
      const updatePreview = () => {
        const sc = val('likelihood') * val('severity');
        const rsc = val('residualLikelihood') * val('residualSeverity');
        preview.replaceChildren(h('div', { class: 'row wrap gap-3' },
          h('span', { class: 'row gap-2' }, h('span', { class: 't-helper' }, t('risks.form.previewInherent')), h('strong', { class: 'mono' }, h('bdi', { dir: 'ltr' }, `${fmt.num(val('likelihood'))} × ${fmt.num(val('severity'))} = ${fmt.num(sc)}`)), tierBadge(tierOf(sc))),
          h('span', { class: 'row gap-2' }, h('span', { class: 't-helper' }, t('risks.form.previewResidual')), h('strong', { class: 'mono' }, h('bdi', { dir: 'ltr' }, `${fmt.num(val('residualLikelihood'))} × ${fmt.num(val('residualSeverity'))} = ${fmt.num(rsc)}`)), tierBadge(tierOf(rsc)))));
      };

      /* controls repeater */
      const ctlList = h('div', { class: 'stack gap-2', role: 'list', 'aria-label': t('risks.form.controls') });
      const addControlRow = (ctl = { type: controlTypes()[3], text: '' }) => {
        const typeSel = h('select', { class: 'field-control', 'aria-label': t('risks.form.controlType'), style: { maxInlineSize: '220px' } }, controlTypes().map((x) => h('option', { value: x }, label('controlType', x))));
        typeSel.value = controlTypes().includes(ctl.type) ? ctl.type : controlTypes()[3];
        const textIn = h('input', { class: 'field-control grow', type: 'text', 'aria-label': t('risks.form.controlText'), placeholder: t('risks.form.controlPh'), value: ctl.text || '' });
        const row = h('div', { class: 'row gap-2', role: 'listitem', 'data-ctl-row': '' }, typeSel, textIn);
        row.appendChild(C.button('', { variant: 'ghost', size: 'sm', icon: C.glyph('close', 14), onClick: () => row.remove(), attrs: { 'aria-label': t('risks.form.removeControl'), title: t('risks.form.removeControl') } }));
        ctlList.appendChild(row);
        return row;
      };
      shownControls.forEach((c) => addControlRow(c));
      if (!shownControls.length) addControlRow();
      const addCtlBtn = C.button(t('risks.form.addControl'), { variant: 'outline', size: 'sm', icon: ico('plus', 14), onClick: () => { const row = addControlRow(); row.querySelector('input').focus(); } });
      const controlsBlock = h('div', { class: 'span-2 stack gap-2' },
        h('div', { class: 'form-section-title' }, t('risks.form.controls')),
        h('p', { class: 't-helper' }, t('risks.form.controlsHint')),
        ctlList, h('div', {}, addCtlBtn));
      const readControls = () => Array.from(ctlList.querySelectorAll('[data-ctl-row]')).map((row) => ({
        type: row.querySelector('select').value, text: row.querySelector('input').value.trim(),
      })).filter((c) => c.text);

      const form = h('form', { class: 'form-grid', novalidate: true, onSubmit: (e) => { e.preventDefault(); submit(); } },
        summary,
        F.hazard,
        subGrid('repeat(auto-fit, minmax(180px, 1fr))', F.siteId, F.categoryId, F.activity),
        F.description,
        h('div', { class: 'form-section-title span-2' }, t('risks.form.assessment')),
        subGrid('repeat(auto-fit, minmax(min(100%, 200px), 1fr))', F.likelihood, F.severity, F.residualLikelihood, F.residualSeverity),
        preview,
        controlsBlock,
        h('div', { class: 'form-section-title span-2' }, t('risks.form.followUp')),
        subGrid('repeat(auto-fit, minmax(180px, 1fr))', F.owner, F.dueDate, F.status),
        subGrid('repeat(auto-fit, minmax(min(100%, 200px), 1fr))', F.source, F.legalRef));
      form.addEventListener('change', updatePreview);
      updatePreview();

      const setError = (field, message) => {
        field.classList.add('is-invalid');
        const control = field.querySelector('.field-control');
        if (control) control.setAttribute('aria-invalid', 'true');
        const err = h('p', { class: 'field-error', id: `${control ? control.id : 'f'}-err` }, C.glyph('critical', 14), h('span', {}, message));
        field.appendChild(err);
        if (control) control.setAttribute('aria-describedby', [control.getAttribute('aria-describedby'), err.id].filter(Boolean).join(' '));
      };
      const clearErrors = () => {
        form.querySelectorAll('.field.is-invalid').forEach((x) => x.classList.remove('is-invalid'));
        form.querySelectorAll('.field-error').forEach((x) => x.remove());
        form.querySelectorAll('[aria-invalid]').forEach((x) => x.removeAttribute('aria-invalid'));
        summary.hidden = true;
      };

      let api = null;
      function submit() {
        const data = C.readForm(form);
        clearErrors();
        const errors = [];
        if (!String(data.hazard || '').trim()) errors.push([F.hazard, t('risks.form.errors.hazard')]);
        if (!String(data.owner || '').trim()) errors.push([F.owner, t('risks.form.errors.owner')]);
        if (!String(data.dueDate || '').trim() || !Number.isFinite(parseMs(String(data.dueDate)))) errors.push([F.dueDate, t('risks.form.errors.due')]);
        const sc = (Number(data.likelihood) || 0) * (Number(data.severity) || 0);
        const rsc = (Number(data.residualLikelihood) || 0) * (Number(data.residualSeverity) || 0);
        if (rsc > sc) errors.push([F.residualSeverity, t('risks.form.errors.residual', { residual: fmt.num(rsc), inherent: fmt.num(sc) })]);
        if (errors.length) {
          errors.forEach(([f, m]) => setError(f, m));
          summary.replaceChildren(C.glyph('critical', 18), h('span', {}, tn('risks.form.errors.summary', errors.length)));
          summary.hidden = false;
          const first = errors[0][0].querySelector('.field-control');
          if (first) first.focus();
          return false;
        }
        const payload = {
          siteId: String(data.siteId || r.siteId), categoryId: String(data.categoryId || r.categoryId),
          likelihood: Number(data.likelihood) || 3, severity: Number(data.severity) || 3,
          residualLikelihood: Number(data.residualLikelihood) || Number(data.likelihood) || 3, residualSeverity: Number(data.residualSeverity) || Number(data.severity) || 3,
          dueDate: String(data.dueDate), status: String(data.status || r.status), source: String(data.source || r.source || MANUAL_SOURCE),
        };
        const edits = new Set(arr(existing && existing.localEdits));
        TEXT_FIELDS.forEach((f) => {
          const v = String(data[f] || '').trim();
          if (!isEdit) { payload[f] = v; if (v) edits.add(f); return; }
          if (v !== String(shown[f] || '').trim()) { payload[f] = v; edits.add(f); }
        });
        const ownerIn = String(data.owner).trim();
        if (!isEdit || ownerIn !== shownOwner) payload.owner = ownerIn;
        const controls = readControls();
        const sameControls = controls.length === shownControls.filter((c) => c.text.trim()).length
          && controls.every((c, i) => c.type === shownControls[i].type && c.text === shownControls[i].text.trim());
        if (!isEdit || !sameControls) { payload.controls = controls; if (controls.length) edits.add('controls'); }
        payload.localEdits = Array.from(edits);
        if (isEdit) {
          const updated = store.updateRisk(existing.id, { ...payload, by: USER, historyKind: 'edit' });
          C.toast(updated ? t('risks.toast.saved', { code: existing.code }) : t('risks.toast.saveFailed'), { tone: updated ? 'good' : 'warning' });
        } else {
          const created = store.addRisk(payload);
          C.toast(created ? t('risks.toast.added', { code: created.code }) : t('risks.toast.addFailed'), {
            tone: created ? 'good' : 'warning',
            action: created ? { label: t('core.common.open'), onClick: () => openDrawer(created.id) } : null,
          });
        }
        if (api) api.close('action');
        return true;
      }

      api = C.modal({
        title: isEdit ? t('risks.form.editTitle', { code: existing.code }) : t('risks.form.addTitle'),
        subtitle: isEdit ? text(existing, 'hazard') : t('risks.form.addSubtitle'),
        size: 'lg', body: form,
        actions: [
          { label: t('core.common.cancel'), variant: 'ghost' },
          { label: isEdit ? t('risks.form.save') : t('risks.form.create'), variant: 'primary', icon: ico(isEdit ? 'check' : 'plus', 15), closes: false, onClick: () => { submit(); return false; } },
        ],
        onClose: () => { if (modalApi === api) modalApi = null; },
      });
      modalApi = api;
      api.open();
    }

    /* ───────────── refresh orchestration ───────────── */
    function renderAll({ resetPage = false, live = false } = {}) {
      if (destroyed) return;
      guard(statusHost, 'head', renderHead);
      guard(metricGrid, 'metrics', renderMetrics);
      guard(cellHost, 'cell', renderCell);
      guard(tableHost, 'table', () => renderTable({ resetPage, live }));
      guard(matrixHost, 'side', renderSide);
      refreshDrawer();
      if (firstPaint) {
        firstPaint = false;
        if (motion && typeof motion.enter === 'function') {
          motion.enter(Array.from(metricGrid.children), { y: 8 });
          motion.enter([registerCard, matrixCard, catCard], { y: 10, delay: 0.08 });
        }
      }
    }
    let pendingLive = false;
    function schedule(live = false) {
      pendingLive = pendingLive || live;
      if (destroyed || raf) return;
      raf = requestAnimationFrame(() => { raf = 0; const l = pendingLive; pendingLive = false; renderAll({ live: l, resetPage: !l }); });
    }

    renderAll();

    subs.push(bus.on('store:change', (p) => {
      const path = String((p && p.path) || '*');
      if (!/^(risks|sites|\*|settings)/.test(path)) return;
      schedule(true);
    }));
    subs.push(bus.on('filters:change', () => schedule(false)));
    subs.push(bus.on('settings:change', () => schedule(true)));

    /* route params: ?new=1 → add modal, ?id=R12 → drawer (after the router has focused the heading) */
    timers.push(setTimeout(() => {
      if (destroyed) return;
      if (params.new === '1' || params.new === 'true' || params.new === 1) {
        openRiskModal(null);
        try { history.replaceState(null, '', '#/risks'); } catch { /* ignore */ }
      } else if (params.id) {
        if (findRisk(params.id)) openDrawer(params.id);
        else C.toast(t('risks.toast.notFound'), { tone: 'warning' });
      }
    }, 60));

    /* ───────────── cleanup ───────────── */
    return function cleanup() {
      destroyed = true;
      subs.splice(0).forEach((off) => { try { off(); } catch { /* ignore */ } });
      timers.splice(0).forEach((x) => { clearTimeout(x); clearInterval(x); });
      if (raf) { cancelAnimationFrame(raf); raf = 0; }
      if (layoutObserver) { try { layoutObserver.disconnect(); } catch { /* ignore */ } layoutObserver = null; }
      if (layoutRaf) { cancelAnimationFrame(layoutRaf); layoutRaf = 0; }
      [drawerApi, modalApi, confirmApi].forEach((api) => { if (api) { try { api.close(); } catch { /* ignore */ } } });
      drawerApi = null; modalApi = null; confirmApi = null; drawerRiskId = null;
      if (table && typeof table.destroy === 'function') { try { table.destroy(); } catch { /* ignore */ } }
      try { if (charts && charts.tooltip && typeof charts.tooltip.hide === 'function') charts.tooltip.hide(); } catch { /* ignore */ }
    };
  },
};
