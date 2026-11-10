/**
 * BILTIX Risk AI — HSE pillar — SEC-06 Inspections & audits (js/views/inspections.js). Owner: B-HSE2 (v3).
 *
 *   • Four executive metrics: due or overdue (sel.kpis.inspectionsDue — the same definition the overview and
 *     the reports use; the "overdue" part uses the urgent-actions rule), completed in window, open findings,
 *     mean score
 *   • Filter bar (status segmented + type select) directly above the schedule table (components.dataTable,
 *     updated in place: { resetPage } on filter changes, { preserve, flash } on live data changes)
 *   • Completion by project (ranked bars) and findings (segmented bar + facts), upcoming audits
 *   • Detail drawer (Overview / Findings tabs) with finding close / reopen → store.updateInspection, and
 *     "Record as completed" modal with inline, translated validation
 *
 * Bilingual (CONTRACT §4): strings from 'inspections' (js/i18n/inspections.js); enums via i18n.label; finding
 * text via i18n.L(…, 'inspections'); inspectors via i18n.term(). Dates are calendar dates (no zone shift);
 * "today" is the Riyadh calendar day.
 */

import { i18n, t, tn } from '../core/i18n.js';
import dict from '../i18n/inspections.js';
import * as SEED from '../data/seed.js';
import {
  h, clear, glyph, svgIcon, card, badge, button, dataTable, modal, drawer, toast,
  formField, emptyState, progress, kv, filterBar, motion,
} from '../ui/components.js';

i18n.register('inspections', dict);

/* ────────────────────────────── enums ────────────────────────────── */

const list = (value, fallback) => (Array.isArray(value) && value.length ? value : fallback);
const INSPECTION_TYPES = list(SEED.INSPECTION_TYPES, ['جولة سلامة', 'تفتيش معدات', 'تدقيق داخلي', 'تفتيش سقالات', 'فحص رافعات', 'تفتيش كهرباء']);
const INSPECTION_STATUS = list(SEED.INSPECTION_STATUS, ['مجدول', 'منجز', 'متأخر']);
const SCHEDULED = 'مجدول';
const DONE = 'منجز';
const OVERDUE = 'متأخر';
const FINDING_OPEN = 'مفتوح';
const FINDING_CLOSED = 'مغلق';
const SEVERITIES = ['عالٍ', 'متوسط', 'منخفض'];

const STATUS_TONE = { [SCHEDULED]: 'brand', [DONE]: 'good', [OVERDUE]: 'critical' };
const SEVERITY_TONE = { 'منخفض': 'good', 'متوسط': 'warning', 'عالٍ': 'serious' };
const TYPE_ICON = {
  'جولة سلامة': 'clipboard', 'تفتيش معدات': 'truck', 'تدقيق داخلي': 'file-check',
  'تفتيش سقالات': 'scaffold', 'فحص رافعات': 'crane', 'تفتيش كهرباء': 'bolt',
};

const DAY_MS = 86_400_000;
const DUE_DAYS = 7;          // sel.INSPECTION_DUE_DAYS
const UPCOMING_LIMIT = 6;
const TZ_OFFSET_MS = 3 * 3_600_000; // Asia/Riyadh, fixed UTC+3

/* ────────────────────────────── helpers ────────────────────────────── */

const statusTone = (s) => STATUS_TONE[s] || 'neutral';
const severityTone = (s) => SEVERITY_TONE[s] || 'neutral';
const typeIcon = (type) => TYPE_ICON[type] || 'clipboard';
const typeLabel = (type) => i18n.label('inspectionType', type);
const statusLabel = (s) => i18n.label('inspectionStatus', s);
const severityLabel = (s) => (s ? i18n.label('findingSeverity', s) : t('inspections.drawer.unspecified'));
const findingStatusLabel = (s) => i18n.label('findingStatus', s);

function scoreTone(score) {
  const n = Number(score);
  if (!Number.isFinite(n)) return null;
  if (n >= 85) return 'good';
  if (n >= 70) return 'warning';
  if (n >= 50) return 'serious';
  return 'critical';
}

function touches(path, prefix) {
  if (!path || path === '*') return true;
  const p = String(path);
  return p === prefix || p.startsWith(`${prefix}.`);
}
const idFromPath = (path) => { const m = /^inspections\.([^.]+)/.exec(String(path || '')); return m ? m[1] : null; };

/** Calendar key 'YYYY-MM-DD' of a date-only string, or of an instant in Riyadh time. */
function dayKey(value) {
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const ms = value instanceof Date ? value.getTime() : Date.parse(value);
  return Number.isFinite(ms) ? new Date(ms + TZ_OFFSET_MS).toISOString().slice(0, 10) : '';
}
const keyMs = (key) => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key); return m ? Date.UTC(+m[1], +m[2] - 1, +m[3]) : NaN; };
/** Whole calendar days from today (Riyadh) to `date` (negative = past). */
function daysFromToday(date, nowMs) {
  const a = keyMs(dayKey(date)); const b = keyMs(dayKey(new Date(nowMs)));
  return Number.isFinite(a) && Number.isFinite(b) ? Math.round((a - b) / DAY_MS) : NaN;
}
const rtfCache = new Map();
/** "today" / "in 3 days" / "2 days ago" in the UI language (numerals follow fmt). */
function dayPhrase(n, fmt) {
  if (!Number.isFinite(n)) return '—';
  const loc = fmt.locale().replace(/-ca-gregory$/, '');
  if (!rtfCache.has(loc)) { let f = null; try { f = new Intl.RelativeTimeFormat(loc, { numeric: 'auto' }); } catch { f = null; } rtfCache.set(loc, f); }
  const f = rtfCache.get(loc);
  try { return f ? f.format(n, 'day') : String(n); } catch { return String(n); }
}
/** Digits inside record text follow the numerals setting; codes (MH-14, R-1042, PM2.5, ISO 45001) stay Latin. */
const AR_DIGITS = '٠١٢٣٤٥٦٧٨٩';
function codeSafeDigits(fmt, text) {
  const s = String(text ?? '');
  if (!s || !fmt || typeof fmt.getNumerals !== 'function' || fmt.getNumerals() !== 'arab') return s;
  return s.replace(/\d+(?:[.,/:]\d+)*/g, (m, offset, whole) => {
    let prev = whole[offset - 1] || '';
    if (prev === '/' || prev === ':') prev = whole[offset - 2] || '';
    const next = whole[offset + m.length] || '';
    if (/[A-Za-z\-_#]/.test(prev) || /[A-Za-z]/.test(next) || /(ISO|SBC|UTC)\s?\+?$/i.test(whole.slice(Math.max(0, offset - 5), offset))) return m;
    return m.replace(/\d/g, (d) => AR_DIGITS[Number(d)]).replace(/\./g, '٫').replace(/,/g, '٬');
  });
}
const isOverdueIns = (ins, todayKey) => ins.status === OVERDUE || (ins.status === SCHEDULED && dayKey(ins.date) < todayKey);

function simpleTable(caption, headers, rows) {
  const table = h('table', { class: 'table is-dense' });
  table.appendChild(h('caption', { class: 'sr-only' }, caption));
  table.appendChild(h('thead', {}, h('tr', {}, headers.map((x, i) => h('th', { scope: 'col', class: i > 0 ? 'align-end' : null }, x)))));
  table.appendChild(h('tbody', {}, rows.map((r) => h('tr', {}, r.map((c, i) => h('td', { class: i > 0 ? 'num align-end' : null }, c))))));
  return table;
}

function safeChart(charts, name, opts, fallbackTable) {
  try {
    const fn = charts && charts[name];
    if (typeof fn === 'function') {
      const chart = fn(opts);
      if (chart && chart.el instanceof Node) {
        return { el: chart.el, table: () => { try { const tb = chart.table && chart.table(); if (tb instanceof Node) return tb; } catch { /* fall through */ } return fallbackTable(); } };
      }
    }
  } catch { /* fall back to the table */ }
  return { el: h('div', { class: 'table-wrap' }, fallbackTable()), table: fallbackTable };
}

/* ────────────────────────────── the view ────────────────────────────── */

export const inspectionsView = {
  id: 'inspections',
  code: 'SEC-06',
  get title() { return t('core.nav.inspections.title'); },
  icon: 'clipboard',

  render(container, ctx) {
    const { store, bus, sel, fmt, charts } = ctx;
    const subs = [];
    let alive = true;
    let activeDrawer = null;
    let activeModal = null;
    let statusFilter = 'all';
    let typeFilter = 'all';

    const state = () => store.state;
    const nowMs = () => (typeof store.now === 'function' ? store.now().getTime() : Date.now());
    const globalFilters = () => ({ ...(store.filters || state().filters || {}) });
    const rangeDays = () => Number(globalFilters().range) || 30;
    const typed = () => ({ ...globalFilters(), type: typeFilter === 'all' ? undefined : typeFilter });
    const tableFilters = () => ({ ...typed(), status: statusFilter === 'all' ? undefined : statusFilter });
    const findInspection = (id) => (state().inspections || []).find((i) => i && i.id === id) || null;
    const siteOf = (id) => (state().sites || []).find((s) => s && s.id === id) || null;
    const siteName = (id) => { const s = siteOf(id); return s ? codeSafeDigits(fmt, i18n.L(s, 'name', 'sites')) : '—'; };
    const shortSite = (name) => String(name || '').split(/\s+[—–]\s+/)[0];
    const person = (v) => (v ? i18n.term(v) : '—');
    const findingsOf = (ins) => {
      const raw = Array.isArray(ins.findings) ? ins.findings : [];
      const loc = i18n.L(ins, 'findings', 'inspections');
      return raw.map((f, i) => ({ ...f, text: codeSafeDigits(fmt, (Array.isArray(loc) && loc[i] && loc[i].text) || (f && f.text) || '—') }));
    };

    /* ── page skeleton ── */
    const root = h('section', { class: 'view view-inspections', 'aria-labelledby': 'inspections-title' });
    root.appendChild(h('header', { class: 'view-head' },
      h('div', { class: 'view-head-text' },
        h('span', { class: 'code-tag' }, inspectionsView.code),
        h('h1', { id: 'inspections-title', class: 't-page', tabindex: '-1' }, t('core.nav.inspections.title')),
        h('p', { class: 'view-lead' }, t('inspections.lead')))));

    const metricsHost = h('div', { class: 'metric-grid', role: 'group', 'aria-label': t('inspections.metrics.label') });
    const completionHost = h('div', { class: 'col-span-6' });
    const findingsHost = h('div', { class: 'col-span-6' });
    const upcomingHost = h('div', { class: 'cards-grid', role: 'list', 'aria-label': t('inspections.upcoming.aria') });

    /* filter bar directly above the table it filters */
    const filters = filterBar({
      label: t('inspections.filters.label'),
      className: 'is-plain',
      filters: [
        { id: 'status', type: 'segmented', label: t('inspections.filters.status'), options: [{ value: 'all', label: t('core.common.all') }, ...INSPECTION_STATUS.map((s) => ({ value: s, label: statusLabel(s) }))], defaultValue: 'all' },
        { id: 'type', type: 'select', label: t('inspections.filters.type'), options: INSPECTION_TYPES.map((tp) => ({ value: tp, label: typeLabel(tp) })) },
      ],
      value: { status: statusFilter, type: typeFilter },
      onChange: (v) => {
        const typeChanged = v.type !== typeFilter;
        statusFilter = v.status || 'all';
        typeFilter = v.type || 'all';
        schedule(typeChanged ? 15 : 2, { resetPage: true });
      },
    });

    const table = dataTable({
      caption: t('inspections.table.caption'),
      pageSize: 10,
      dense: true,
      initialSort: { key: 'date', dir: 'asc' },
      emptyText: t('inspections.table.empty'),
      onRowClick: (row) => openDrawer(row.id),
      rowLabel: (row) => t('inspections.table.open', { code: row.code }),
      stickyFirst: true,
      columns: [
        { key: 'code', label: t('inspections.table.code'), priority: 'high', width: 96, render: (r) => h('span', { class: 'code' }, r.code) },
        { key: 'type', label: t('inspections.table.type'), priority: 'medium', sortValue: (r) => typeLabel(r.type), render: (r) => h('span', { class: 'row gap-1', style: { minInlineSize: '12ch' } }, svgIcon(typeIcon(r.type), 14), typeLabel(r.type)) },
        {
          key: 'siteId', label: t('inspections.table.site'), priority: 'high', sortValue: (r) => siteName(r.siteId),
          render: (r) => {
            const site = siteOf(r.siteId);
            return h('span', { class: 'stack gap-1', style: { minInlineSize: '12ch', maxInlineSize: '22ch' } },
              h('span', { class: 'cell-title', style: { whiteSpace: 'normal', lineHeight: '1.35' } }, site ? siteName(site.id) : '—'),
              site ? h('span', { class: 'code cell-sub' }, site.code) : null);
          },
        },
        { key: 'inspector', label: t('inspections.table.inspector'), priority: 'low', sortValue: (r) => person(r.inspector), render: (r) => h('span', { style: { whiteSpace: 'normal', display: 'inline-block', maxInlineSize: '18ch' } }, person(r.inspector)) },
        {
          key: 'date', label: t('inspections.table.date'), priority: 'high', sortValue: (r) => keyMs(dayKey(r.date)),
          render: (r) => {
            const n = daysFromToday(r.date, nowMs());
            const late = r.status !== DONE && n < 0;
            return h('span', { class: 'stack gap-1' },
              h('span', { class: 'nowrap' }, fmt.date(r.date, { style: 'short' })),
              h('span', { class: ['cell-sub', 'nowrap', late ? 'tone-text-critical' : null] }, dayPhrase(n, fmt)));
          },
        },
        { key: 'status', label: t('inspections.table.status'), priority: 'high', sortValue: (r) => statusLabel(r.status), render: (r) => badge(statusLabel(r.status), statusTone(r.status)) },
        {
          key: 'score', label: t('inspections.table.score'), priority: 'medium', align: 'end', sortValue: (r) => (r.score === null || r.score === undefined ? null : Number(r.score)),
          render: (r) => {
            if (r.score === null || r.score === undefined) return h('span', { class: 'muted' }, '—');
            return h('span', { class: 'progress-row', style: { minInlineSize: '96px' } },
              progress({ value: Number(r.score), max: 100, tone: scoreTone(r.score), label: t('inspections.table.scoreAria', { value: fmt.pct(Number(r.score)) }) }),
              h('span', { class: 'progress-value num' }, fmt.pct(Number(r.score))));
          },
        },
        {
          key: 'checklistDone', label: t('inspections.table.checklist'), priority: 'low', sortValue: (r) => (Number(r.checklistTotal) ? (Number(r.checklistDone) || 0) / Number(r.checklistTotal) : 0),
          render: (r) => {
            const total = Number(r.checklistTotal) || 0; const done = Number(r.checklistDone) || 0;
            return h('span', { class: 'progress-row', style: { minInlineSize: '104px' } },
              progress({ value: done, max: Math.max(total, 1), tone: total && done >= total ? 'good' : null, label: t('inspections.table.checklistAria', { done: fmt.num(done), total: fmt.num(total) }) }),
              h('span', { class: 'progress-value num', dir: 'ltr' }, `${fmt.num(done)}/${fmt.num(total)}`));
          },
        },
      ],
      rows: [],
    });
    /* Narrow cards: each filter group takes a full row and the status segments may scroll (no overlap). */
    const tableCardHost = h('div', { style: { minInlineSize: '0' } }, filters.el);
    let filterRo = null;
    if (typeof ResizeObserver === 'function') {
      // Width-only, applied a frame later and only when the mode flips, so it never re-enters the observer loop.
      let narrowMode = null;
      let roRaf = 0;
      filterRo = new ResizeObserver((entries) => {
        const w = entries[0] ? Math.round(entries[0].contentRect.width) : 0;
        if (!w) return;
        const narrow = w < 560;
        if (narrow === narrowMode) return;
        narrowMode = narrow;
        if (roRaf) cancelAnimationFrame(roRaf);
        roRaf = requestAnimationFrame(() => {
          roRaf = 0;
          filters.el.querySelectorAll('.filter-bar-group').forEach((g) => { g.style.flex = narrow ? '1 1 100%' : ''; });
          const seg = filters.el.querySelector('.seg');
          if (seg) { seg.style.overflowX = narrow ? 'auto' : ''; seg.style.maxInlineSize = narrow ? '100%' : ''; }
        });
      });
      filterRo.observe(tableCardHost);
    }
    const tableCount = h('span', { class: 'badge tone-neutral' }, '');
    const tableSub = h('p', { class: 'card-sub' }, '');
    const tableCard = card({
      code: 'SEC-06.A', title: t('inspections.table.title'), subtitle: ' ', actions: [tableCount],
      body: h('div', { class: 'stack gap-3' }, tableCardHost, table.el),
    });
    const sub = tableCard.querySelector('.card-sub');
    if (sub) sub.replaceWith(tableSub);

    const upcomingSection = h('section', { class: 'view-section', 'aria-labelledby': 'ins-upcoming-title' },
      h('div', { class: 'view-section-head' },
        h('div', { class: 'card-titles' },
          h('span', { class: 'card-code', 'aria-hidden': 'true' }, 'SEC-06.D'),
          h('div', { class: 'card-title-wrap' },
            h('h2', { class: 't-section', id: 'ins-upcoming-title' }, t('inspections.upcoming.title')),
            h('p', { class: 'card-sub' }, t('inspections.upcoming.sub'))))),
      upcomingHost);

    const grid = h('div', { class: 'grid-12', style: { alignItems: 'start' } }, completionHost, findingsHost);
    root.append(metricsHost, tableCard, grid, upcomingSection);
    container.appendChild(root);

    /* ── metrics (patched in place) ── */
    const tiles = {};
    function metricTile(key, label, icon) {
      const value = h('span', { class: 't-metric' }, '—');
      const unit = h('span', { class: 'metric-unit' }, '');
      const helper = h('span', { class: 'metric-helper' }, '');
      const el = h('div', { class: 'metric-tile', 'data-metric': key },
        h('div', { class: 'metric-head' }, h('span', { class: 'metric-label' }, label), h('span', { class: 'metric-icon', 'aria-hidden': 'true' }, svgIcon(icon, 16))),
        h('div', { class: 'metric-value' }, value, unit),
        h('div', { class: 'metric-foot' }, helper));
      tiles[key] = { el, value, unit, helper, last: null, tone: null };
      return el;
    }
    metricsHost.append(
      metricTile('due', t('inspections.metrics.due'), 'clock'),
      metricTile('done', t('inspections.metrics.done'), 'check-circle'),
      metricTile('findings', t('inspections.metrics.findings'), 'alert-circle'),
      metricTile('score', t('inspections.metrics.score'), 'clipboard'),
    );
    function setTile(key, { text, unit = '', helper = '', tone = null }) {
      const tile = tiles[key];
      const changed = tile.last !== null && tile.last !== text;
      tile.value.textContent = text;
      tile.unit.textContent = unit;
      tile.helper.textContent = helper;
      if (tile.tone !== tone) { if (tile.tone) tile.el.classList.remove(`tone-${tile.tone}`); if (tone) tile.el.classList.add(`tone-${tone}`); tile.tone = tone; }
      if (changed) motion.flash(tile.el);
      tile.last = text;
    }

    function paintMetrics() {
      const st = state();
      const gf = globalFilters();
      const at = nowMs();
      const todayKey = dayKey(new Date(at));
      const kpis = (() => { try { return sel.kpis(st, gf, new Date(at)); } catch { return null; } })();
      // Overdue = the urgent-actions rule (same list the overview and the reports' recommendations use).
      const overdue = (() => {
        try { return sel.urgentActions(st, new Date(at), { siteId: gf.siteId || 'all' }).filter((u) => u.kind === 'inspection').length; } catch { /* local twin */ }
        return (st.inspections || []).filter((ins) => ins && (!gf.siteId || gf.siteId === 'all' || ins.siteId === gf.siteId) && isOverdueIns(ins, todayKey)).length;
      })();
      const due = kpis && Number.isFinite(kpis.inspectionsDue) ? kpis.inspectionsDue : overdue;
      setTile('due', { text: fmt.num(due), helper: tn('inspections.metrics.dueHelper', overdue, { days: fmt.num(DUE_DAYS) }), tone: overdue ? 'critical' : (due ? 'warning' : 'good') });

      const rows = sel.filteredInspections(st, gf);
      const done = rows.filter((r) => r.status === DONE);
      setTile('done', { text: fmt.num(done.length), helper: t('inspections.metrics.doneHelper', { total: fmt.num(rows.length), range: fmt.num(rangeDays()) }), tone: null });

      const f = sel.findingsSummary(st, gf);
      const closurePct = f.total ? Math.round((f.closed / f.total) * 100) : 100;
      setTile('findings', { text: fmt.num(f.open), helper: t('inspections.metrics.findingsHelper', { pct: fmt.pct(closurePct), total: fmt.num(f.total) }), tone: f.open ? 'serious' : 'good' });

      const scores = done.map((r) => Number(r.score)).filter(Number.isFinite);
      const mean = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null;
      setTile('score', { text: mean === null ? '—' : fmt.num(mean), unit: mean === null ? '' : (fmt.getNumerals() === 'arab' ? '٪' : '%'), helper: tn('inspections.metrics.scoreHelper', scores.length), tone: scoreTone(mean) });
    }

    /* ── schedule table ── */
    function paintTable(opts = {}) {
      const rows = sel.filteredInspections(state(), tableFilters()).slice();
      table.update(rows, opts.resetPage ? { resetPage: true } : { preserve: true, flash: Boolean(opts.flash) });
      tableCount.textContent = tn('inspections.table.count', rows.length);
      tableSub.textContent = t('inspections.table.sub', { range: fmt.num(rangeDays()) });
    }

    /* ── completion + findings ── */
    function paintCharts() {
      clear(completionHost); clear(findingsHost);
      const st = state();
      const gf = typed();
      const completion = sel.inspectionCompletionBySite(st, gf).map((c) => ({ ...c, name: siteName(c.id) }))
        .sort((a, b) => b.value - a.value || b.total - a.total);
      const withData = completion.filter((c) => c.total > 0);
      const completionTable = () => simpleTable(t('inspections.completion.caption'),
        [t('inspections.completion.site'), t('inspections.completion.done'), t('inspections.completion.total'), t('inspections.completion.pct')],
        completion.map((c) => [c.name, fmt.num(c.done), fmt.num(c.total), fmt.pct(c.value)]));
      const completionChart = withData.length
        ? safeChart(charts, 'barChart', {
          items: withData.map((c) => ({ id: c.id, label: shortSite(c.name), value: c.value })),
          horizontal: true, height: Math.min(236, Math.max(160, 32 * withData.length + 24)), valueFormat: (v) => fmt.pct(v), color: 'var(--s1)', showValues: true, maxBars: 6,
          ariaLabel: t('inspections.completion.aria'),
        }, completionTable)
        : { el: emptyState({ title: t('inspections.completion.emptyTitle'), text: t('inspections.completion.emptyText') }), table: completionTable };
      completionHost.appendChild(card({ code: 'SEC-06.B', title: t('inspections.completion.title'), subtitle: t('inspections.completion.sub'), body: completionChart.el, tableView: completionChart.table }));

      const f = sel.findingsSummary(st, gf);
      const openBySeverity = {};
      for (const ins of sel.filteredInspections(st, gf)) for (const fd of (ins.findings || [])) if (fd && fd.status === FINDING_OPEN) openBySeverity[fd.severity] = (openBySeverity[fd.severity] || 0) + 1;
      const findingsTable = () => simpleTable(t('inspections.findings.caption'), [t('inspections.findings.status'), t('inspections.findings.count')], [[t('inspections.findings.open'), fmt.num(f.open)], [t('inspections.findings.closed'), fmt.num(f.closed)]]);
      const findingsChart = f.total > 0
        ? safeChart(charts, 'segmentedBar', {
          parts: [
            { id: 'open', label: t('inspections.findings.open'), value: f.open, color: 'var(--serious)' },
            { id: 'closed', label: t('inspections.findings.closed'), value: f.closed, color: 'var(--good)' },
          ].filter((p) => p.value > 0),
          tall: true, valueFormat: (v) => fmt.num(v), ariaLabel: t('inspections.findings.aria'),
        }, findingsTable)
        : { el: emptyState({ title: t('inspections.findings.emptyTitle'), text: t('inspections.findings.emptyText') }), table: findingsTable };
      const closurePct = f.total ? Math.round((f.closed / f.total) * 100) : 0;
      const fact = (label, value, tone) => h('div', { class: ['fact', tone ? `tone-${tone}` : null] }, h('span', { class: 'fact-label' }, label), h('span', { class: 'fact-value num' }, value));
      const sevRow = h('div', { class: 'stack gap-2' },
        h('span', { class: 't-label' }, t('inspections.findings.bySeverity')),
        h('div', { class: 'row wrap gap-2' }, SEVERITIES.filter((s) => openBySeverity[s]).map((s) => badge(`${severityLabel(s)} · ${fmt.num(openBySeverity[s])}`, severityTone(s)))));
      findingsHost.appendChild(card({
        code: 'SEC-06.C', title: t('inspections.findings.title'), subtitle: t('inspections.findings.sub', { open: fmt.num(f.open), total: fmt.num(f.total) }),
        body: h('div', { class: 'stack gap-4' }, findingsChart.el,
          f.total ? h('div', { class: 'hero-facts' },
            fact(t('inspections.findings.open'), fmt.num(f.open), f.open ? 'serious' : 'good'),
            fact(t('inspections.findings.closed'), fmt.num(f.closed), 'good'),
            fact(t('inspections.findings.closure'), fmt.pct(closurePct), closurePct >= 85 ? 'good' : closurePct >= 60 ? 'warning' : 'serious')) : null,
          Object.keys(openBySeverity).length ? sevRow : null),
        tableView: findingsChart.table,
      }));
    }

    /* ── upcoming audits ── */
    function paintUpcoming() {
      clear(upcomingHost);
      const at = nowMs();
      const upcoming = sel.filteredInspections(state(), typed())
        .filter((r) => r.status === SCHEDULED && daysFromToday(r.date, at) >= 0)
        .sort((a, b) => keyMs(dayKey(a.date)) - keyMs(dayKey(b.date)))
        .slice(0, UPCOMING_LIMIT);
      if (!upcoming.length) {
        upcomingHost.appendChild(emptyState({ icon: 'clipboard', title: t('inspections.upcoming.emptyTitle'), text: t('inspections.upcoming.emptyText') }));
        return;
      }
      upcoming.forEach((ins) => {
        const n = daysFromToday(ins.date, at);
        const total = Number(ins.checklistTotal) || 0; const done = Number(ins.checklistDone) || 0;
        const titleId = `ins-${ins.id}-title`;
        upcomingHost.appendChild(h('article', { class: 'card is-plain', role: 'listitem', 'aria-labelledby': titleId },
          h('div', { class: 'card-body stack gap-3' },
            h('div', { class: 'row between gap-2' }, badge(typeLabel(ins.type), 'neutral', { icon: typeIcon(ins.type) }), h('span', { class: 'code text-xs muted' }, ins.code)),
            h('h3', { class: 't-card', id: titleId }, siteName(ins.siteId)),
            h('div', { class: 'stack gap-1 t-helper' },
              h('span', {}, person(ins.inspector)),
              h('span', { class: 'row wrap gap-2' }, h('span', {}, fmt.date(ins.date, { style: 'long' })), badge(dayPhrase(n, fmt), n <= 2 ? 'warning' : 'brand'))),
            h('div', { class: 'progress-row' },
              progress({ value: done, max: Math.max(total, 1), label: t('inspections.table.checklistAria', { done: fmt.num(done), total: fmt.num(total) }) }),
              h('span', { class: 'progress-value num', dir: 'ltr' }, `${fmt.num(done)}/${fmt.num(total)}`)),
            h('div', { class: 'row end' }, button(t('inspections.upcoming.details'), { variant: 'outline', size: 'sm', attrs: { 'aria-label': t('inspections.upcoming.detailsAria', { code: ins.code }) }, onClick: () => openDrawer(ins.id) })))));
      });
    }

    /* ── drawer ── */
    function section(title, ...children) {
      return h('section', { class: 'drawer-section' }, h('h3', { class: 'drawer-section-title' }, title), h('div', { class: 'stack gap-3' }, children));
    }

    function openDrawer(id) {
      const first = findInspection(id);
      if (!first) { toast(t('inspections.drawer.notFound'), { tone: 'warning' }); return; }
      if (activeDrawer) { activeDrawer.close(); activeDrawer = null; }
      const completeBtn = button(t('inspections.drawer.complete'), { variant: 'primary', icon: 'clipboard', onClick: () => openCompleteModal(id) });

      const overview = () => {
        const ins = findInspection(id);
        if (!ins) return emptyState({ title: t('inspections.drawer.deleted') });
        const at = nowMs();
        const n = daysFromToday(ins.date, at);
        const total = Number(ins.checklistTotal) || 0; const done = Number(ins.checklistDone) || 0;
        const badges = h('div', { class: 'row wrap gap-2' }, badge(statusLabel(ins.status), statusTone(ins.status)), badge(typeLabel(ins.type), 'neutral', { icon: typeIcon(ins.type) }));
        if (ins.status !== DONE) badges.appendChild(badge(dayPhrase(n, fmt), n < 0 ? 'critical' : n <= 2 ? 'warning' : 'brand'));
        const scoreRow = ins.score === null || ins.score === undefined
          ? h('span', { class: 'muted' }, t('inspections.drawer.noScore'))
          : h('span', { class: 'progress-row' }, progress({ value: Number(ins.score), max: 100, tone: scoreTone(ins.score), label: t('inspections.drawer.score') }), h('span', { class: 'progress-value num' }, fmt.pct(Number(ins.score))));
        const checklistRow = h('span', { class: 'progress-row' },
          progress({ value: done, max: Math.max(total, 1), tone: total && done >= total ? 'good' : null, label: t('inspections.drawer.checklist') }),
          h('span', { class: 'progress-value num', dir: 'ltr' }, `${fmt.num(done)}/${fmt.num(total)}`));
        return h('div', { class: 'stack gap-4' },
          section(t('inspections.drawer.details'), badges, kv([
            [t('inspections.drawer.site'), siteName(ins.siteId)],
            [t('inspections.drawer.inspector'), person(ins.inspector)],
            [t('inspections.drawer.date'), `${fmt.date(ins.date, { style: 'long' })} — ${dayPhrase(n, fmt)}`],
            [t('inspections.drawer.score'), scoreRow],
            [t('inspections.drawer.checklist'), checklistRow],
            ins.updatedAt ? [t('inspections.drawer.updated'), fmt.relative(ins.updatedAt, at)] : null,
          ])),
          ins.status !== DONE ? h('p', { class: 'note tone-brand' }, t('inspections.drawer.completeNote')) : null,
          h('p', { class: 'note is-demo t-helper' }, t('inspections.drawer.localNote')));
      };
      const findingsTab = () => {
        const ins = findInspection(id);
        if (!ins) return emptyState({ title: t('inspections.drawer.deleted') });
        const findings = findingsOf(ins);
        const open = findings.filter((f) => f.status === FINDING_OPEN).length;
        const ul = h('ul', { class: 'controls-list' });
        if (!findings.length) ul.appendChild(h('li', { class: 'note' }, ins.status === DONE ? t('inspections.drawer.noFindingsDone') : t('inspections.drawer.noFindingsYet')));
        findings.forEach((f) => {
          const isOpen = f.status === FINDING_OPEN;
          ul.appendChild(h('li', { class: ['controls-item', isOpen ? `tone-${severityTone(f.severity)}` : 'tone-good'] },
            h('span', { class: 'controls-type' }, severityLabel(f.severity)),
            h('div', { class: 'stack gap-2' },
              h('span', { class: isOpen ? null : 'muted' }, f.text),
              h('div', { class: 'row wrap gap-2' },
                badge(findingStatusLabel(f.status), isOpen ? 'serious' : 'good'),
                button(isOpen ? t('inspections.drawer.closeFinding') : t('inspections.drawer.reopen'), { variant: 'ghost', size: 'sm', attrs: { id: `fnd-${ins.id}-${f.id}` }, onClick: () => toggleFinding(id, f.id) })))));
        });
        return section(t('inspections.drawer.findingsTitle', { open: fmt.num(open), total: fmt.num(findings.length) }), ul);
      };
      const openCount = (ins) => (ins.findings || []).filter((f) => f && f.status === FINDING_OPEN).length;

      const api = drawer({
        title: `${first.code} — ${typeLabel(first.type)}`, subtitle: `${siteName(first.siteId)} · ${person(first.inspector)}`, size: 'lg',
        kind: 'inspection',
        tabs: [
          { id: 'overview', label: t('inspections.drawer.tabs.overview'), render: overview },
          { id: 'findings', label: t('inspections.drawer.tabs.findings'), count: openCount(first), render: findingsTab },
        ],
        actions: [completeBtn, { label: t('inspections.drawer.dismiss'), variant: 'ghost' }],
        onClose: () => { unsub(); if (activeDrawer === api) activeDrawer = null; },
      });
      activeDrawer = api;
      const paintActions = () => { const ins = findInspection(id); completeBtn.hidden = !ins || ins.status === DONE; if (ins) api.setTabCount('findings', openCount(ins)); };
      paintActions();
      const unsub = bus.on('store:change', (p) => {
        const path = p && p.path;
        if (!touches(path, 'inspections')) return;
        const pid = idFromPath(path);
        if (pid && pid !== id) return;
        const focusId = api.el.contains(document.activeElement) && document.activeElement.id ? document.activeElement.id : null;
        paintActions();
        api.refreshTab();
        const back = focusId ? api.el.querySelector(`#${CSS.escape(focusId)}`) : null;
        if (back) { try { back.focus({ preventScroll: true }); } catch { /* ignore */ } }
        else if (!api.el.contains(document.activeElement)) { const fb = api.el.querySelector('.drawer-tab[aria-selected="true"]') || api.el; try { fb.focus({ preventScroll: true }); } catch { /* ignore */ } }
      });
      api.open();
    }

    function toggleFinding(inspectionId, findingId) {
      const ins = findInspection(inspectionId);
      if (!ins) return;
      const findings = (ins.findings || []).map((f) => (f && f.id === findingId ? { ...f, status: f.status === FINDING_OPEN ? FINDING_CLOSED : FINDING_OPEN } : f));
      const updated = store.updateInspection(inspectionId, { findings });
      if (!updated) return;
      const target = findings.find((f) => f && f.id === findingId);
      const closed = target && target.status === FINDING_CLOSED;
      toast(closed ? t('inspections.drawer.closedToast') : t('inspections.drawer.reopenedToast'), { tone: closed ? 'good' : 'neutral', timeout: 2500 });
    }

    /* ── complete modal (inline validation) ── */
    function setError(form, name, message) {
      const wrap = form.querySelector(`.field[data-name="${name}"]`);
      if (!wrap) return;
      const control = wrap.querySelector('.field-control');
      let err = wrap.querySelector('.field-error');
      if (control && control.dataset.describedby === undefined) control.dataset.describedby = control.getAttribute('aria-describedby') || '';
      if (!message) {
        wrap.classList.remove('is-invalid');
        if (err) err.remove();
        if (control) { control.removeAttribute('aria-invalid'); if (control.dataset.describedby) control.setAttribute('aria-describedby', control.dataset.describedby); else control.removeAttribute('aria-describedby'); }
        return;
      }
      if (!err) { err = h('p', { class: 'field-error', id: `${control ? control.id : name}-err` }); wrap.appendChild(err); }
      clear(err); err.append(glyph('critical', 14), h('span', {}, message));
      wrap.classList.add('is-invalid');
      if (control) { control.setAttribute('aria-invalid', 'true'); control.setAttribute('aria-describedby', [control.dataset.describedby, err.id].filter(Boolean).join(' ')); }
    }

    function openCompleteModal(id) {
      const ins = findInspection(id);
      if (!ins) return;
      if (activeModal) { activeModal.close(); activeModal = null; }
      const total = Number(ins.checklistTotal) || 0;
      const maxDone = total || 100000;
      const openFindings = (ins.findings || []).filter((f) => f && f.status === FINDING_OPEN).length;
      const summary = h('p', { class: 'form-error-summary is-full', role: 'alert', hidden: true });
      const form = h('form', { class: 'form-grid', 'aria-label': t('inspections.complete.aria'), novalidate: true });
      form.append(
        summary,
        h('p', { class: 'note is-full' }, h('span', { class: 'code' }, ins.code), ` — ${typeLabel(ins.type)} · ${siteName(ins.siteId)} · ${fmt.date(ins.date)}`),
        formField({ label: t('inspections.complete.score'), name: 'score', type: 'number', min: 0, max: 100, step: 1, required: true, value: Number.isFinite(Number(ins.score)) && ins.score !== null ? Number(ins.score) : '', placeholder: `${fmt.num(0)} – ${fmt.num(100)}`, hint: t('inspections.complete.scoreHint') }),
        formField({ label: t('inspections.complete.done'), name: 'checklistDone', type: 'number', min: 0, max: maxDone, step: 1, required: true, value: total, hint: total ? t('inspections.complete.doneHint', { total: fmt.num(total) }) : '' }),
      );
      if (openFindings) form.appendChild(h('p', { class: 'note tone-warning is-full' }, tn('inspections.complete.openFindings', openFindings)));
      form.addEventListener('input', (e) => { const f = e.target && e.target.closest('.field'); if (f && f.classList.contains('is-invalid')) setError(form, f.dataset.name, ''); });

      const submit = () => {
        const raw = (n) => String((form.elements.namedItem(n) || {}).value || '').trim();
        const errors = {};
        const score = Number(raw('score'));
        const done = Number(raw('checklistDone'));
        if (!raw('score')) errors.score = t('inspections.complete.errors.required');
        else if (!Number.isInteger(score) || score < 0 || score > 100) errors.score = t('inspections.complete.errors.range', { min: fmt.num(0), max: fmt.num(100) });
        if (!raw('checklistDone')) errors.checklistDone = t('inspections.complete.errors.required');
        else if (!Number.isInteger(done) || done < 0 || done > maxDone) errors.checklistDone = t('inspections.complete.errors.range', { min: fmt.num(0), max: fmt.num(maxDone) });
        ['score', 'checklistDone'].forEach((n) => setError(form, n, errors[n] || ''));
        const bad = Object.keys(errors);
        if (bad.length) {
          summary.textContent = t('inspections.complete.errors.summary');
          summary.hidden = false;
          const c = form.elements.namedItem(bad[0]); if (c && c.focus) c.focus();
          return false;
        }
        const updated = store.updateInspection(id, { status: DONE, score, checklistDone: done });
        if (!updated) { toast(t('inspections.complete.failed'), { tone: 'critical' }); return false; }
        toast(t('inspections.complete.saved', { code: ins.code, score: fmt.pct(score) }), { tone: 'good', title: t('inspections.complete.savedTitle') });
        return true;
      };
      form.addEventListener('submit', (e) => { e.preventDefault(); if (submit()) api.close('action'); });
      const api = modal({
        title: t('inspections.complete.title'), subtitle: t('inspections.complete.sub', { status: statusLabel(DONE) }), size: 'md', body: form,
        actions: [{ label: t('inspections.complete.cancel'), variant: 'ghost' }, { label: t('inspections.complete.save'), variant: 'primary', onClick: () => submit() }],
        onClose: () => { if (activeModal === api) activeModal = null; },
      });
      activeModal = api;
      api.open();
    }

    /* ── repaint orchestration ── */
    let pending = 0; // 1 metrics, 2 table, 4 charts, 8 upcoming
    let pendingOpts = {};
    let raf = 0;
    const schedule = (mask, opts = {}) => {
      pending |= mask;
      pendingOpts = { ...pendingOpts, ...opts };
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        if (!alive) return;
        const m = pending; pending = 0;
        const o = pendingOpts; pendingOpts = {};
        try {
          if (m & 1) paintMetrics();
          if (m & 2) paintTable(o);
          if (m & 4) paintCharts();
          if (m & 8) paintUpcoming();
        } catch (err) { console.warn('[biltix] inspections: repaint failed', err); }
      });
    };

    paintMetrics(); paintTable({ resetPage: true }); paintCharts(); paintUpcoming();
    motion.enter(metricsHost.children, { y: 8 });
    motion.enter([tableCard, grid, upcomingSection], { y: 10, delay: 0.08 });

    subs.push(bus.on('store:change', (p) => { const path = p && p.path; if (touches(path, 'inspections') || touches(path, 'sites')) schedule(15, { flash: true }); }));
    subs.push(bus.on('filters:change', () => schedule(15, { resetPage: true })));
    subs.push(bus.on('settings:change', () => schedule(15)));
    subs.push(bus.on('theme:change', () => schedule(4)));

    const params = (ctx && ctx.params) || {};
    if (params.id) requestAnimationFrame(() => { if (alive && findInspection(params.id)) openDrawer(params.id); });

    return () => {
      alive = false;
      if (filterRo) { try { filterRo.disconnect(); } catch { /* ignore */ } filterRo = null; }
      if (raf) { cancelAnimationFrame(raf); raf = 0; }
      subs.splice(0).forEach((u) => { try { u(); } catch { /* ignore */ } });
      if (activeDrawer) { try { activeDrawer.close(); } catch { /* ignore */ } activeDrawer = null; }
      if (activeModal) { try { activeModal.close(); } catch { /* ignore */ } activeModal = null; }
    };
  },
};

export default inspectionsView;
