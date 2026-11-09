/**
 * Biltix HSE — view SEC-04: الحوادث والحوادث الوشيكة (js/views/incidents.js)
 *
 * Contract: docs/ARCHITECTURE.md §8.4. Owner: VIEWS-B.
 *
 *   • KPI strip (open incidents, near-misses 30d, lost-time injuries, lost work days)
 *   • Incident vs near-miss trend (charts.lineChart, 2 series)
 *   • Root-cause Pareto — ranked bars, cumulative % appended as a muted direct label
 *     (no second axis, as the dataviz rules require)
 *   • Distribution by incident type (charts.segmentedBar)
 *   • Incident cards with severity / status badges and a 5-step investigation stepper,
 *     local type + status filters (site/range/search come from the global filter row)
 *   • Detail drawer: full record, vertical stepper, corrective-actions checklist
 *     (checkbox → store.updateIncident) and «الخطوة التالية» that advances the
 *     investigation step and keeps the status consistent
 *   • «إبلاغ عن حادث» modal (opens automatically with ?new=1) → store.addIncident
 *
 * Data reaches the DOM only through textContent / components.h. Every chart is wrapped
 * so a missing or failing charts module degrades to the table twin instead of throwing.
 * The view re-renders the affected regions on store:change (incidents.*), filters:change
 * and settings:change, and returns a cleanup that unsubscribes and closes overlays.
 */

import * as SEED from '../data/seed.js';
import {
  h, clear, svgIcon, card, statTile, badge, button, segmented, modal, drawer, toast,
  formField, readForm, emptyState, progress, kv,
} from '../ui/components.js';

/* ────────────────────────────── enums (contract §3, with fallbacks) ────────────────────────────── */

const list = (value, fallback) => (Array.isArray(value) && value.length ? value : fallback);

const INCIDENT_TYPES = list(SEED.INCIDENT_TYPES, ['إصابة مضيعة للوقت', 'إصابة تتطلب علاجاً طبياً', 'إسعافات أولية', 'حادث وشيك', 'تلف ممتلكات', 'حادث بيئي']);
const INCIDENT_STATUS = list(SEED.INCIDENT_STATUS, ['مفتوح', 'قيد التحقيق', 'إجراءات تصحيحية', 'مغلق']);
const ROOT_CAUSES = list(SEED.ROOT_CAUSES, ['غياب التدريب', 'إجراء عمل غير كافٍ', 'عطل معدات', 'ضعف الإشراف', 'عدم استخدام معدات الوقاية', 'ظروف بيئية', 'تصميم غير آمن', 'ضغط الجدول الزمني']);
const CATEGORIES = list(SEED.CATEGORIES, [{ id: 'height', name: 'العمل على ارتفاعات', icon: 'height' }]);

/** Investigation steps — index = incident.investigationStep (contract §3). */
const STEPS = ['جمع الأدلة', 'المقابلات', 'تحليل الأسباب (5 لماذا)', 'الإجراءات التصحيحية', 'الإغلاق'];
/** Status that is consistent with each investigation step. */
const STATUS_FOR_STEP = ['مفتوح', 'قيد التحقيق', 'قيد التحقيق', 'إجراءات تصحيحية', 'مغلق'];
const CLOSED = 'مغلق';
const LTI_TYPE = 'إصابة مضيعة للوقت';
const NEAR_MISS_TYPE = 'حادث وشيك';

const STATUS_TONE = { 'مفتوح': 'critical', 'قيد التحقيق': 'serious', 'إجراءات تصحيحية': 'warning', 'مغلق': 'good' };
const SEVERITY_LABEL = ['', 'طفيف', 'بسيط', 'متوسط', 'خطير', 'جسيم'];
const TYPE_ICON = {
  'إصابة مضيعة للوقت': 'body', 'إصابة تتطلب علاجاً طبياً': 'body', 'إسعافات أولية': 'body',
  'حادث وشيك': 'alert-triangle', 'تلف ممتلكات': 'structure', 'حادث بيئي': 'flask',
};

const DAY_MS = 86_400_000;
const SVG_NS = 'http://www.w3.org/2000/svg';
const LIST_PAGE = 12;

/* ────────────────────────────── pure helpers ────────────────────────────── */

const pad2 = (n) => String(n).padStart(2, '0');
const todayISO = (d = new Date()) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const nowHHMM = (d = new Date()) => `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;

function severityTone(severity) {
  const n = Number(severity) || 0;
  if (n >= 4) return 'critical';
  if (n === 3) return 'serious';
  if (n === 2) return 'warning';
  return 'good';
}

const statusTone = (status) => STATUS_TONE[status] || 'neutral';

function siteName(state, siteId) {
  const site = (state.sites || []).find((s) => s && s.id === siteId);
  return site ? site.name : '—';
}

const categoryOf = (id) => CATEGORIES.find((c) => c.id === id) || null;

/** True when a store:change path concerns the given collection (or everything). */
function touches(path, prefix) {
  if (!path || path === '*') return true;
  const p = String(path);
  return p === prefix || p.startsWith(`${prefix}.`);
}

/** Id of the focused element inside `root` (so a repaint can hand focus back to its twin). */
function focusedIdWithin(root) {
  const a = document.activeElement;
  return a && root && root.contains(a) && a.id ? a.id : null;
}

/**
 * After a drawer repaint, keep keyboard focus inside the dialog so Esc / Tab keep working:
 * the same control by id, else the first visible footer action, else the dialog itself.
 */
function restoreFocus(api, id) {
  if (!api || typeof api.isOpen !== 'function' || !api.isOpen()) return;
  const root = api.el;
  const a = document.activeElement;
  if (a && a !== document.body && root.contains(a) && !a.hidden && a.getClientRects().length) return;
  let target = null;
  if (id) { try { target = root.querySelector(`#${CSS.escape(id)}`); } catch { target = null; } }
  if (!target) target = root.querySelector('.drawer-foot button:not([hidden])') || root;
  try { target.focus({ preventScroll: true }); } catch { /* ignore */ }
}

function parseDate(value) {
  if (!value) return NaN;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value));
  return m ? new Date(+m[1], +m[2] - 1, +m[3]).getTime() : Date.parse(value);
}

function incidentInstant(inc) {
  const base = parseDate(inc && inc.date);
  if (!Number.isFinite(base)) return 0;
  const t = /^(\d{1,2}):(\d{2})/.exec(String(inc.time || ''));
  return base + (t ? (Number(t[1]) * 60 + Number(t[2])) * 60_000 : 0);
}

/** Weekly counts (oldest → newest) of `items` matching `pred`, bucketed by 7-day windows ending today. */
function weeklyCounts(items, weeks, pred, now = Date.now()) {
  const out = Array(weeks).fill(0);
  const end = new Date(now); end.setHours(23, 59, 59, 999);
  const endMs = end.getTime();
  for (const it of items) {
    if (!pred(it)) continue;
    const t = parseDate(it.date);
    if (!Number.isFinite(t) || t > endMs) continue;
    const idx = weeks - 1 - Math.floor((endMs - t) / (7 * DAY_MS));
    if (idx >= 0 && idx < weeks) out[idx] += 1;
  }
  return out;
}

function checkMark(size = 12) {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('width', String(size)); svg.setAttribute('height', String(size));
  svg.setAttribute('fill', 'none'); svg.setAttribute('stroke', 'currentColor'); svg.setAttribute('stroke-width', '3');
  svg.setAttribute('stroke-linecap', 'round'); svg.setAttribute('stroke-linejoin', 'round'); svg.setAttribute('aria-hidden', 'true');
  const p = document.createElementNS(SVG_NS, 'path'); p.setAttribute('d', 'M5 12.5l4.5 4.5L19 7');
  svg.appendChild(p);
  return svg;
}

/** 5-step investigation stepper (.stepper from components.css). */
function stepper(step, status, { small = false, vertical = false } = {}) {
  const current = Math.max(0, Math.min(STEPS.length - 1, Number(step) || 0));
  const closed = status === CLOSED;
  const ol = h('ol', { class: ['stepper', small ? 'is-sm' : null, vertical ? 'is-vertical' : null], role: 'list', 'aria-label': 'خطوات التحقيق' });
  STEPS.forEach((label, i) => {
    const done = closed || i < current;
    const isCurrent = !done && i === current;
    const li = h('li', { class: ['step', done ? 'is-done' : null, isCurrent ? 'is-current' : null], 'aria-current': isCurrent ? 'step' : undefined });
    const dot = h('span', { class: 'step-dot', 'aria-hidden': 'true' });
    if (done) dot.appendChild(checkMark(small ? 10 : 12));
    li.appendChild(dot);
    li.appendChild(h('span', { class: 'step-label' }, label));
    li.appendChild(h('span', { class: 'sr-only' }, done ? ' — منجزة' : (isCurrent ? ' — الخطوة الحالية' : ' — لاحقة')));
    ol.appendChild(li);
  });
  return ol;
}

/** Plain table used when the charts module is unavailable, and as a table twin. */
function simpleTable(caption, headers, rows) {
  const table = h('table', { class: 'table is-dense' });
  table.appendChild(h('caption', { class: 'sr-only' }, caption));
  table.appendChild(h('thead', {}, h('tr', {}, headers.map((t) => h('th', { scope: 'col' }, t)))));
  table.appendChild(h('tbody', {}, rows.map((r) => h('tr', {}, r.map((c, i) => h('td', { class: i > 0 ? 'num align-end' : null }, c))))));
  return table;
}

/** Create a chart defensively; on failure fall back to its table so the view never throws. */
function safeChart(charts, name, opts, fallbackTable) {
  try {
    const fn = charts && charts[name];
    if (typeof fn === 'function') {
      const chart = fn(opts);
      if (chart && chart.el instanceof Node) {
        const table = () => {
          try { const t = chart.table && chart.table(); if (t instanceof Node) return t; } catch { /* fall through */ }
          return fallbackTable();
        };
        return { el: chart.el, table, native: true };
      }
    }
  } catch (err) {
    console.warn(`[biltix-hse] incidents: charts.${name} unavailable, showing table instead`, err);
  }
  const host = h('div', { class: 'table-wrap' }, fallbackTable());
  return { el: host, table: fallbackTable, native: false };
}

function chipGroup({ options, value, onChange, ariaLabel, fmt }) {
  const el = h('div', { class: 'chip-group', role: 'group', 'aria-label': ariaLabel });
  const buttons = new Map();
  let current = value;
  const paint = () => { for (const [v, b] of buttons) b.setAttribute('aria-pressed', String(v) === String(current) ? 'true' : 'false'); };
  options.forEach((o) => {
    const count = h('span', { class: 'chip-count', hidden: true }, '');
    const b = h('button', { type: 'button', class: 'chip', 'aria-pressed': 'false', onClick: () => { if (String(current) === String(o.value)) return; current = o.value; paint(); onChange(o.value); } });
    if (o.icon) b.appendChild(svgIcon(o.icon, 14));
    b.appendChild(h('span', {}, o.label));
    b.appendChild(count);
    b.countEl = count;
    buttons.set(o.value, b);
    el.appendChild(b);
  });
  paint();
  return {
    el,
    setCounts(counts) {
      for (const [v, b] of buttons) {
        const n = counts[v];
        b.countEl.hidden = n === undefined || n === null;
        b.countEl.textContent = n === undefined || n === null ? '' : fmt.num(n);
      }
    },
  };
}

/* ────────────────────────────── the view ────────────────────────────── */

export const incidentsView = {
  id: 'incidents',
  code: 'SEC-04',
  title: 'الحوادث والحوادث الوشيكة',
  icon: 'alert-triangle',

  render(container, ctx) {
    const { store, bus, sel, fmt, charts } = ctx;
    const subs = [];
    let alive = true;
    let activeDrawer = null;
    let activeModal = null;

    /* local (view-only) filters */
    let typeFilter = 'all';
    let statusFilter = 'all';
    let showAll = false;

    const state = () => store.state;
    const globalFilters = () => ({ ...(store.filters || state().filters || {}) });
    const listFilters = () => ({ ...globalFilters(), type: typeFilter === 'all' ? undefined : typeFilter, status: statusFilter === 'all' ? undefined : statusFilter });
    const findIncident = (id) => (state().incidents || []).find((i) => i && i.id === id) || null;

    /* ── skeleton ── */
    const root = h('section', { class: 'view view-incidents', 'aria-labelledby': 'incidents-title' });

    const reportBtn = button('إبلاغ عن حادث', { variant: 'primary', icon: 'alert-triangle', onClick: () => openReportModal() });
    root.appendChild(h('header', { class: 'view-head' },
      h('div', { class: 'view-head-text' },
        h('span', { class: 'code-tag' }, incidentsView.code),
        h('h1', { id: 'incidents-title', tabindex: '-1' }, incidentsView.title),
        h('p', { class: 'view-lead' }, 'تسجيل الحوادث والحوادث الوشيكة ومتابعة التحقيق فيها حتى إغلاق الإجراءات التصحيحية، مع مؤشرات الفترة المحددة وتحليل الأسباب الجذرية.')),
      h('div', { class: 'view-actions' }, reportBtn)));

    const kpiHost = h('div', { class: 'kpi-row', 'aria-label': 'مؤشرات الحوادث' });
    const chartsHost = h('div', { class: 'grid-12' });
    const listSection = h('section', { class: 'stack gap-3', 'aria-labelledby': 'incidents-list-title' });
    root.append(kpiHost, chartsHost, listSection);

    /* list header: title + count + filters */
    const listCount = h('span', { class: 'badge tone-neutral mono' }, '');
    const typeChips = chipGroup({
      fmt,
      ariaLabel: 'تصفية حسب نوع الحادث',
      value: 'all',
      options: [{ value: 'all', label: 'جميع الأنواع' }, ...INCIDENT_TYPES.map((t) => ({ value: t, label: t, icon: TYPE_ICON[t] || null }))],
      onChange: (v) => { typeFilter = v; showAll = false; paintList(); },
    });
    const statusSeg = segmented({
      ariaLabel: 'تصفية حسب حالة الحادث',
      value: 'all',
      options: [{ value: 'all', label: 'كل الحالات' }, ...INCIDENT_STATUS.map((s) => ({ value: s, label: s }))],
      onChange: (v) => { statusFilter = v; showAll = false; paintList(); },
    });
    statusSeg.el.classList.add('seg-sm');
    const listHead = h('div', { class: 'stack gap-2' },
      h('div', { class: 'row wrap between gap-2' },
        h('div', { class: 'row gap-2' },
          h('span', { class: 'code-tag', 'aria-hidden': 'true' }, 'SEC-04.1'),
          h('h2', { id: 'incidents-list-title', class: 'card-title' }, 'سجل الحوادث'),
          listCount),
        statusSeg.el),
      typeChips.el);
    const cardsHost = h('div', { class: 'cards-grid', role: 'list', 'aria-label': 'بطاقات الحوادث' });
    const listFoot = h('div', { class: 'row end' });
    listSection.append(listHead, cardsHost, listFoot);

    container.appendChild(root);

    /* ── KPI strip ── */
    function paintKpis() {
      clear(kpiHost);
      const st = state();
      const gf = globalFilters();
      let k = null;
      try { k = sel.kpis(st, gf); } catch (err) { console.warn('[biltix-hse] incidents: sel.kpis failed', err); }
      const range = Number(gf.range) || 30;
      const now = Date.now();
      const inPeriod = sel.filteredIncidents(st, gf);
      const previous = sel.filteredIncidents(st, gf, new Date(now - range * DAY_MS));
      const daysLost = inPeriod.reduce((s, i) => s + (Number(i.daysLost) || 0), 0);
      const daysLostPrev = previous.reduce((s, i) => s + (Number(i.daysLost) || 0), 0);
      const siteItems = (st.incidents || []).filter((i) => i && (gf.siteId === 'all' || !gf.siteId || i.siteId === gf.siteId));

      const spark = (values) => {
        try { const s = charts && typeof charts.sparkline === 'function' ? charts.sparkline({ values, width: 96, height: 28 }) : null; return s && s.el instanceof Node ? s : null; } catch { return null; }
      };

      const open = k ? k.openIncidents : (st.incidents || []).filter((i) => i && i.status !== CLOSED).length;
      const tiles = [
        statTile({
          label: 'الحوادث المفتوحة', value: open, icon: 'alert-triangle',
          delta: k ? k.deltas.openIncidents : null, deltaGoodWhen: 'down',
          tone: open > 0 ? 'serious' : 'good', hint: 'حوادث لم تُغلق بعد في الموقع المحدد',
          onClick: () => { statusFilter = 'مفتوح'; typeFilter = 'all'; showAll = false; paintList(); listSection.scrollIntoView({ behavior: 'smooth', block: 'start' }); },
        }),
        statTile({
          label: 'الحوادث الوشيكة (30 يوماً)', value: k ? k.nearMisses30d : 0, icon: 'alert-triangle',
          delta: k ? k.deltas.nearMisses30d : null, deltaGoodWhen: 'up',
          spark: spark(weeklyCounts(siteItems, 12, (i) => i.type === NEAR_MISS_TYPE, now)),
          hint: 'ارتفاع الإبلاغ عن الحوادث الوشيكة مؤشر إيجابي على ثقافة السلامة',
        }),
        statTile({
          label: 'الإصابات المضيعة للوقت', value: k ? k.lti : inPeriod.filter((i) => i.type === LTI_TYPE).length, icon: 'body',
          delta: k ? k.deltas.lti : null, deltaGoodWhen: 'down',
          tone: (k ? k.lti : 0) > 0 ? 'critical' : null,
          spark: spark(weeklyCounts(siteItems, 12, (i) => i.type === LTI_TYPE, now)),
          hint: `خلال آخر ${fmt.num(range)} يوماً — LTIFR ${k ? fmt.num(k.ltifr, { maximumFractionDigits: 2 }) : '—'}`,
        }),
        statTile({
          label: 'أيام العمل المفقودة', value: daysLost, unit: 'يوم', icon: 'clock',
          delta: daysLost - daysLostPrev, deltaGoodWhen: 'down',
          hint: 'مجموع أيام الغياب الناتجة عن إصابات الفترة المحددة',
        }),
      ];
      tiles.forEach((t) => kpiHost.appendChild(t));
    }

    /* ── charts row ── */
    function paintCharts() {
      clear(chartsHost);
      const st = state();
      const gf = globalFilters();

      /* trend: incidents vs near-misses, 12 weeks */
      const trend = sel.incidentTrend(st, 12, gf);
      const trendTable = () => simpleTable('اتجاه الحوادث الأسبوعي', ['الأسبوع', 'الحوادث', 'الحوادث الوشيكة'], trend.map((b) => [b.label, fmt.num(b.incidents), fmt.num(b.nearMisses)]));
      const trendChart = safeChart(charts, 'lineChart', {
        series: [
          { id: 'incidents', label: 'الحوادث', color: 'var(--s1)', values: trend.map((b) => b.incidents) },
          { id: 'nearMisses', label: 'الحوادث الوشيكة', color: 'var(--s2)', values: trend.map((b) => b.nearMisses) },
        ],
        labels: trend.map((b) => b.label),
        height: 220,
        yFormat: (v) => fmt.num(v),
        ariaLabel: 'اتجاه الحوادث والحوادث الوشيكة خلال آخر 12 أسبوعاً',
      }, trendTable);
      const totalInc = trend.reduce((s, b) => s + b.incidents, 0);
      const totalNm = trend.reduce((s, b) => s + b.nearMisses, 0);
      /* inline-start column: trend above the type distribution; Pareto fills the other column */
      const mainCol = h('div', { class: 'col-span-7 stack gap-4' });
      mainCol.appendChild(card({
        code: 'SEC-04.A', title: 'اتجاه الحوادث', subtitle: `آخر 12 أسبوعاً — ${fmt.num(totalInc)} حادثاً و${fmt.num(totalNm)} حادثاً وشيكاً`,
        body: trendChart.el, tableView: trendChart.table,
      }));
      chartsHost.appendChild(mainCol);

      /* Pareto of root causes — ranked bars + cumulative % as a muted direct label */
      const pareto = sel.rootCausePareto(st, gf);
      const paretoTable = () => simpleTable('تحليل باريتو للأسباب الجذرية', ['السبب الجذري', 'العدد', 'النسبة', 'التراكمي'], pareto.map((p) => [p.label, fmt.num(p.value), fmt.pct(p.pct), fmt.pct(p.cumulativePct)]));
      chartsHost.appendChild(h('div', { class: 'col-span-5' }, card({
        code: 'SEC-04.B', title: 'تحليل باريتو للأسباب الجذرية', subtitle: 'الأسباب مرتبة تنازلياً مع النسبة التراكمية',
        body: paretoBody(pareto), tableView: paretoTable,
      })));

      /* distribution by type */
      const byType = sel.incidentsByType(st, gf);
      const parts = byType.map((t, i) => ({ id: t.id, label: t.label, value: t.value, color: paletteColor(i) })).filter((p) => p.value > 0);
      const typeTable = () => simpleTable('توزيع الحوادث حسب النوع', ['النوع', 'العدد'], byType.map((t) => [t.label, fmt.num(t.value)]));
      const total = byType.reduce((s, t) => s + t.value, 0);
      const typeChart = total > 0
        ? safeChart(charts, 'segmentedBar', { parts, tall: true, valueFormat: (v) => fmt.num(v), ariaLabel: 'توزيع الحوادث حسب النوع' }, typeTable)
        : { el: emptyState({ title: 'لا توجد حوادث في الفترة المحددة', text: 'وسّع الفترة الزمنية أو غيّر الموقع لعرض التوزيع.' }), table: typeTable };
      mainCol.appendChild(card({
        code: 'SEC-04.C', title: 'التوزيع حسب النوع', subtitle: `${fmt.num(total)} حادثاً في الفترة والموقع المحددين`,
        body: typeChart.el, tableView: typeChart.table,
      }));
    }

    function paletteColor(index) {
      try { if (charts && typeof charts.paletteFor === 'function') return charts.paletteFor(index); } catch { /* fall back */ }
      return `var(--s${(index % 8) + 1})`;
    }

    function paretoBody(items) {
      if (!items.length) return emptyState({ title: 'لا توجد أسباب جذرية مسجلة', text: 'يظهر التحليل عند وجود حوادث ذات سبب جذري محدد في الفترة المختارة.' });
      const max = Math.max(...items.map((i) => i.value), 1);
      const ol = h('ol', { class: 'list-reset stack gap-3', 'aria-label': 'الأسباب الجذرية مرتبة حسب التكرار' });
      let vital = true;
      items.forEach((it, idx) => {
        const strong = vital;
        if (it.cumulativePct >= 80) vital = false;
        const value = h('span', { class: 'mono text-xs nowrap' }, fmt.num(it.value));
        value.appendChild(h('span', { class: 'muted' }, ` · تراكمي ${fmt.pct(it.cumulativePct)}`));
        const bar = progress({ value: it.value, max, label: `${it.label}: ${fmt.num(it.value)} — تراكمي ${fmt.pct(it.cumulativePct)}` });
        bar.classList.add('is-lg');
        if (!strong) bar.classList.add('tone-neutral');
        ol.appendChild(h('li', { class: 'stack gap-1' },
          h('div', { class: 'row between gap-2' },
            h('span', { class: ['text-sm', 'truncate', strong ? 'semibold' : 'ink-2'] }, `${fmt.num(idx + 1)}. ${it.label}`),
            value),
          bar));
      });
      return h('div', { class: 'stack gap-3' }, ol,
        h('p', { class: 'chart-note' }, 'الأسباب البارزة (باللون الأساسي) تمثّل نحو 80% من الحوادث في الفترة المحددة وفق قاعدة باريتو؛ الباقي بلون محايد.'));
    }

    /* ── incident cards ── */
    function incidentCard(inc) {
      const st = state();
      const cat = categoryOf(inc.categoryId);
      const actions = Array.isArray(inc.actions) ? inc.actions : [];
      const done = actions.filter((a) => a && a.done).length;
      const titleId = `inc-${inc.id}-title`;
      const open = () => openDrawer(inc.id);

      const el = h('article', { class: 'card', role: 'listitem', 'aria-labelledby': titleId, 'data-id': inc.id });
      const body = h('div', { class: 'card-body stack gap-3' });

      body.appendChild(h('div', { class: 'row wrap gap-2' },
        h('span', { class: 'mono text-xs muted' }, inc.code),
        h('span', { class: 'grow' }),
        badge(`الشدة ${fmt.num(inc.severity)} — ${SEVERITY_LABEL[inc.severity] || ''}`.trim(), severityTone(inc.severity)),
        badge(inc.status, statusTone(inc.status))));

      const titleBtn = h('button', { type: 'button', class: 'card-title', id: titleId, style: { textAlign: 'start', color: 'inherit', font: 'inherit' }, onClick: open }, inc.title || '—');
      body.appendChild(h('h3', { class: 'card-title' }, titleBtn));

      body.appendChild(h('div', { class: 'row wrap gap-2 text-xs muted' },
        badge(inc.type, 'neutral', { icon: TYPE_ICON[inc.type] || 'alert-triangle' }),
        h('span', { class: 'row gap-1' }, cat ? svgIcon(cat.icon, 13) : null, cat ? cat.name : '—'),
        h('span', { class: 'nowrap' }, siteName(st, inc.siteId)),
        h('span', { class: 'nowrap mono' }, `${fmt.date(inc.date, { style: 'short' })} · ${fmt.time(inc.time || '')}`)));

      body.appendChild(stepper(inc.investigationStep, inc.status, { small: true }));

      const prog = h('div', { class: 'progress-row grow', title: 'إنجاز الإجراءات التصحيحية' });
      prog.appendChild(progress({ value: done, max: Math.max(actions.length, 1), tone: actions.length && done === actions.length ? 'good' : null, label: `الإجراءات التصحيحية: ${fmt.num(done)} من ${fmt.num(actions.length)}` }));
      prog.appendChild(h('span', { class: 'progress-value' }, actions.length ? `${fmt.num(done)}/${fmt.num(actions.length)}` : '—'));
      body.appendChild(h('div', { class: 'row between gap-3' }, prog, button('التفاصيل', { variant: 'outline', size: 'sm', onClick: open })));

      el.appendChild(body);
      return el;
    }

    function paintList() {
      const st = state();
      const gf = globalFilters();
      const rows = sel.filteredIncidents(st, listFilters()).slice().sort((a, b) => incidentInstant(b) - incidentInstant(a));

      /* counts per type under the current status filter */
      const forCounts = sel.filteredIncidents(st, { ...gf, status: statusFilter === 'all' ? undefined : statusFilter });
      const counts = { all: forCounts.length };
      INCIDENT_TYPES.forEach((t) => { counts[t] = forCounts.filter((i) => i.type === t).length; });
      typeChips.setCounts(counts);
      listCount.textContent = fmt.num(rows.length);

      clear(cardsHost); clear(listFoot);
      if (!rows.length) {
        cardsHost.appendChild(emptyState({
          icon: 'alert-triangle', title: 'لا توجد حوادث مطابقة',
          text: gf.search ? 'جرّب تعديل كلمة البحث أو توسيع الفترة الزمنية.' : 'لا توجد حوادث ضمن الفترة والموقع والمرشحات الحالية.',
          action: { label: 'إبلاغ عن حادث', icon: 'alert-triangle', onClick: () => openReportModal() },
        }));
        return;
      }
      const visible = showAll ? rows : rows.slice(0, LIST_PAGE);
      const frag = document.createDocumentFragment();
      visible.forEach((inc) => frag.appendChild(incidentCard(inc)));
      cardsHost.appendChild(frag);
      if (rows.length > LIST_PAGE) {
        listFoot.appendChild(button(showAll ? 'عرض أقل' : `عرض الكل (${fmt.num(rows.length)})`, { variant: 'ghost', size: 'sm', onClick: () => { showAll = !showAll; paintList(); } }));
      }
    }

    /* ── drawer ── */
    function openDrawer(id) {
      const first = findIncident(id);
      if (!first) { toast('تعذر العثور على الحادث المطلوب', { tone: 'warning' }); return; }
      if (activeDrawer) { activeDrawer.close(); activeDrawer = null; }

      const body = h('div', { class: 'stack' });
      const nextBtn = button('الخطوة التالية', { variant: 'primary', icon: 'alert-triangle', onClick: () => advanceStep(id) });
      let unsub = () => {};
      const api = drawer({
        title: first.code, subtitle: first.title, size: 'lg', body,
        actions: [nextBtn, { label: 'إغلاق', variant: 'ghost' }],
        onClose: () => { unsub(); if (activeDrawer === api) activeDrawer = null; },
      });
      activeDrawer = api;

      const paint = () => {
        const inc = findIncident(id);
        const focusId = focusedIdWithin(api.el);
        clear(body);
        if (!inc) { body.appendChild(emptyState({ title: 'تم حذف هذا الحادث' })); nextBtn.disabled = true; return; }
        const st = state();
        const cat = categoryOf(inc.categoryId);
        const actions = Array.isArray(inc.actions) ? inc.actions : [];
        const done = actions.filter((a) => a && a.done).length;
        const step = Math.max(0, Math.min(4, Number(inc.investigationStep) || 0));
        const closed = inc.status === CLOSED;
        api.setTitle(inc.code);

        nextBtn.disabled = closed;
        nextBtn.querySelector('.btn-label').textContent = closed ? 'التحقيق مغلق' : (step >= 4 ? 'إغلاق الحادث' : `الخطوة التالية: ${STEPS[step + 1]}`);

        /* summary */
        body.appendChild(section('الملخص',
          h('div', { class: 'row wrap gap-2' },
            badge(inc.type, 'neutral', { icon: TYPE_ICON[inc.type] || 'alert-triangle' }),
            badge(`الشدة ${fmt.num(inc.severity)} — ${SEVERITY_LABEL[inc.severity] || ''}`.trim(), severityTone(inc.severity)),
            badge(inc.status, statusTone(inc.status))),
          kv([
            ['الموقع', `${siteName(st, inc.siteId)} — ${inc.location || '—'}`],
            ['التاريخ والوقت', `${fmt.date(inc.date, { style: 'long' })}، ${fmt.time(inc.time || '')}`],
            ['الفئة', cat ? h('span', { class: 'row gap-1' }, svgIcon(cat.icon, 14), cat.name) : '—'],
            ['المبلّغ', inc.reporter],
            inc.bodyPart ? ['الجزء المصاب', inc.bodyPart] : null,
            ['أيام العمل المفقودة', fmt.num(Number(inc.daysLost) || 0)],
            ['السبب المباشر', inc.immediateCause],
            ['السبب الجذري', inc.rootCause ? badge(inc.rootCause, 'neutral') : '—'],
            inc.closedAt ? ['تاريخ الإغلاق', fmt.dateTime(inc.closedAt)] : null,
          ])));

        /* description */
        body.appendChild(section('وصف الحادث', h('p', { class: 'text-sm ink-2' }, inc.description || 'لا يوجد وصف مسجل.')));

        /* investigation path */
        const noteText = closed
          ? 'اكتمل التحقيق وأُغلق الحادث.'
          : (step >= 4 ? 'جميع الخطوات منجزة — يمكن إغلاق الحادث متى اكتملت الإجراءات التصحيحية.' : `الخطوة الحالية: ${STEPS[step]}. الانتقال للخطوة التالية يحدّث حالة الحادث تلقائياً إلى «${STATUS_FOR_STEP[step + 1]}».`);
        body.appendChild(section('مسار التحقيق', stepper(step, inc.status, { vertical: true }), h('p', { class: ['note', closed ? 'tone-good' : 'tone-brand'] }, noteText)));

        /* corrective actions checklist */
        const checklist = h('ul', { class: 'list-reset stack gap-2' });
        if (!actions.length) checklist.appendChild(h('li', { class: 'note' }, 'لا توجد إجراءات تصحيحية مسجلة لهذا الحادث.'));
        const todayMs = new Date(); todayMs.setHours(0, 0, 0, 0);
        actions.forEach((a) => {
          const cbId = `act-${inc.id}-${a.id}`;
          const cb = h('input', { type: 'checkbox', id: cbId, class: 'field-control', onChange: () => toggleAction(inc.id, a.id) });
          cb.checked = Boolean(a.done);
          const overdue = !a.done && Number.isFinite(parseDate(a.due)) && parseDate(a.due) < todayMs.getTime();
          const meta = h('div', { class: 'row wrap gap-2 text-xs muted' }, h('span', {}, a.owner || '—'), h('span', { class: 'mono' }, `الاستحقاق: ${fmt.date(a.due, { style: 'short' })}`));
          if (overdue) meta.appendChild(badge('متأخر', 'critical'));
          if (a.done) meta.appendChild(badge('منجز', 'good'));
          checklist.appendChild(h('li', { class: 'controls-item' },
            cb,
            h('div', { class: 'stack gap-1' },
              h('label', { for: cbId, class: ['text-sm', a.done ? 'muted' : null], style: a.done ? { textDecoration: 'line-through' } : undefined }, a.text),
              meta)));
        });
        const prog = h('div', { class: 'progress-row' });
        prog.appendChild(progress({ value: done, max: Math.max(actions.length, 1), tone: actions.length && done === actions.length ? 'good' : null, label: 'إنجاز الإجراءات التصحيحية' }));
        prog.appendChild(h('span', { class: 'progress-value' }, actions.length ? `${fmt.num(done)}/${fmt.num(actions.length)}` : '—'));
        body.appendChild(section(`الإجراءات التصحيحية (${fmt.num(done)} من ${fmt.num(actions.length)})`, prog, checklist));
        restoreFocus(api, focusId);
      };

      paint();
      unsub = bus.on('store:change', (p) => { if (touches(p && p.path, 'incidents')) paint(); });
      api.open();
    }

    function section(title, ...children) {
      return h('section', { class: 'drawer-section' }, h('h3', { class: 'drawer-section-title' }, title), h('div', { class: 'stack gap-3' }, children));
    }

    function toggleAction(incidentId, actionId) {
      const inc = findIncident(incidentId);
      if (!inc) return;
      const actions = (inc.actions || []).map((a) => (a && a.id === actionId ? { ...a, done: !a.done } : a));
      store.updateIncident(incidentId, { actions });
      const target = actions.find((a) => a && a.id === actionId);
      toast(target && target.done ? 'تم تعليم الإجراء كمنجز' : 'أُعيد فتح الإجراء', { tone: target && target.done ? 'good' : 'neutral', timeout: 2500 });
    }

    function advanceStep(id) {
      const inc = findIncident(id);
      if (!inc) return;
      if (inc.status === CLOSED) { toast('الحادث مغلق بالفعل', { tone: 'neutral' }); return; }
      const step = Math.max(0, Math.min(4, Number(inc.investigationStep) || 0));
      const next = Math.min(4, step + 1);
      const actions = Array.isArray(inc.actions) ? inc.actions : [];
      const pending = actions.filter((a) => a && !a.done).length;
      if (next === 4 && pending > 0) {
        toast(`لا يمكن إغلاق الحادث قبل إنجاز ${fmt.num(pending)} من الإجراءات التصحيحية`, { tone: 'warning', title: 'الإغلاق غير مكتمل' });
        return;
      }
      const patch = { investigationStep: next, status: STATUS_FOR_STEP[next] };
      store.updateIncident(id, patch);
      if (next === 4) toast(`تم إغلاق الحادث ${inc.code}`, { tone: 'good' });
      else toast(`انتقل التحقيق إلى «${STEPS[next]}» — الحالة: ${STATUS_FOR_STEP[next]}`, { tone: 'brand' });
    }

    /* ── report modal ── */
    function openReportModal() {
      if (activeModal) { activeModal.close(); activeModal = null; }
      const st = state();
      const sites = (st.sites || []).map((s) => ({ value: s.id, label: `${s.name} (${s.code})` }));
      const defaultSite = globalFilters().siteId && globalFilters().siteId !== 'all' ? globalFilters().siteId : (sites[0] ? sites[0].value : 'S1');
      const now = new Date();

      const form = h('form', { class: 'form-grid', novalidate: false, 'aria-label': 'نموذج الإبلاغ عن حادث' });
      form.append(
        h('h3', { class: 'form-section-title' }, 'بيانات الحادث'),
        formField({ label: 'عنوان الحادث', name: 'title', required: true, placeholder: 'وصف موجز لما حدث' }),
        formField({ label: 'نوع الحادث', name: 'type', type: 'select', value: NEAR_MISS_TYPE, options: INCIDENT_TYPES, required: true }),
        formField({ label: 'الشدة', name: 'severity', type: 'select', value: '2', required: true, options: [1, 2, 3, 4, 5].map((n) => ({ value: n, label: `${n} — ${SEVERITY_LABEL[n]}` })), hint: '1 طفيف … 5 جسيم' }),
        formField({ label: 'الموقع', name: 'siteId', type: 'select', value: defaultSite, options: sites, required: true }),
        formField({ label: 'المكان داخل الموقع', name: 'location', required: true, placeholder: 'مثال: المنطقة ب — الطابق 12' }),
        formField({ label: 'فئة الخطر', name: 'categoryId', type: 'select', value: CATEGORIES[0] ? CATEGORIES[0].id : 'height', options: CATEGORIES.map((c) => ({ value: c.id, label: c.name })), required: true }),
        formField({ label: 'التاريخ', name: 'date', type: 'date', value: todayISO(now), required: true, max: todayISO(now) }),
        formField({ label: 'الوقت', name: 'time', type: 'time', value: nowHHMM(now), required: true }),
        formField({ label: 'المبلّغ', name: 'reporter', required: true, placeholder: 'الاسم والصفة' }),
        formField({ label: 'الجزء المصاب (إن وجد)', name: 'bodyPart', placeholder: 'اتركه فارغاً إن لم توجد إصابة' }),
        formField({ label: 'أيام العمل المفقودة', name: 'daysLost', type: 'number', value: 0, min: 0, max: 365, step: 1 }),
        h('h3', { class: 'form-section-title' }, 'الأسباب والوصف'),
        formField({ label: 'السبب المباشر', name: 'immediateCause', required: true, placeholder: 'ما الذي أدى مباشرة إلى الحادث؟' }),
        formField({ label: 'السبب الجذري الأولي', name: 'rootCause', type: 'select', value: ROOT_CAUSES[0], options: ROOT_CAUSES, hint: 'يمكن تعديله بعد تحليل الأسباب (5 لماذا)' }),
        formField({ label: 'الوصف التفصيلي', name: 'description', type: 'textarea', rows: 4, placeholder: 'تسلسل الأحداث، الأشخاص المعنيون، الظروف المحيطة…' }),
      );

      const submit = () => {
        if (!form.reportValidity()) return false;
        const data = readForm(form);
        const incident = store.addIncident({
          title: data.title, type: data.type, severity: Number(data.severity) || 2, siteId: data.siteId, location: data.location,
          categoryId: data.categoryId, date: data.date, time: data.time, reporter: data.reporter, bodyPart: data.bodyPart || null,
          daysLost: Number(data.daysLost) || 0, immediateCause: data.immediateCause, rootCause: data.rootCause, description: data.description,
          status: 'مفتوح', investigationStep: 0, actions: [],
        });
        if (!incident) { toast('تعذر حفظ البلاغ', { tone: 'critical' }); return false; }
        toast(`تم تسجيل البلاغ ${incident.code} وفتح التحقيق`, { tone: 'good', title: 'تم الحفظ', action: { label: 'عرض', onClick: () => openDrawer(incident.id) } });
        statusFilter = 'all'; typeFilter = 'all'; showAll = false;
        return true;
      };
      form.addEventListener('submit', (e) => { e.preventDefault(); if (submit()) api.close('action'); });

      const api = modal({
        title: 'الإبلاغ عن حادث', subtitle: 'يُسجَّل البلاغ بحالة «مفتوح» وتبدأ خطوة جمع الأدلة فوراً', size: 'lg', body: form,
        actions: [{ label: 'إلغاء', variant: 'ghost' }, { label: 'حفظ البلاغ', variant: 'primary', onClick: () => submit() }],
        onClose: () => { if (activeModal === api) activeModal = null; },
      });
      activeModal = api;
      api.open();
    }

    /* ── repaint orchestration ── */
    let pending = 0; // bitmask: 1 kpis, 2 charts, 4 list
    let raf = 0;
    const schedule = (mask) => {
      pending |= mask;
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        if (!alive) return;
        const m = pending; pending = 0;
        try {
          if (m & 1) paintKpis();
          if (m & 2) paintCharts();
          if (m & 4) paintList();
        } catch (err) { console.error('[biltix-hse] incidents: repaint failed', err); }
      });
    };

    paintKpis(); paintCharts(); paintList();

    subs.push(bus.on('store:change', (p) => { const path = p && p.path; if (touches(path, 'incidents') || touches(path, 'sites')) schedule(7); }));
    subs.push(bus.on('filters:change', () => { showAll = false; schedule(7); }));
    subs.push(bus.on('settings:change', () => schedule(7)));
    subs.push(bus.on('theme:change', () => schedule(2)));

    /* deep links: ?new=1 opens the report modal, ?id=I3 opens the drawer */
    const params = (ctx && ctx.params) || {};
    if (params.new === '1' || params.new === 'true') {
      requestAnimationFrame(() => {
        if (!alive) return;
        openReportModal();
        try { history.replaceState(null, '', `#/${incidentsView.id}`); } catch { /* ignore */ }
      });
    } else if (params.id) {
      requestAnimationFrame(() => { if (alive && findIncident(params.id)) openDrawer(params.id); });
    }

    return () => {
      alive = false;
      if (raf) { cancelAnimationFrame(raf); raf = 0; }
      subs.splice(0).forEach((u) => { try { u(); } catch { /* ignore */ } });
      if (activeDrawer) { try { activeDrawer.close(); } catch { /* ignore */ } activeDrawer = null; }
      if (activeModal) { try { activeModal.close(); } catch { /* ignore */ } activeModal = null; }
    };
  },
};

export default incidentsView;
