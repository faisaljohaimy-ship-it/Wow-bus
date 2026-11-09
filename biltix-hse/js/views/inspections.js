/**
 * Biltix HSE — view SEC-06: التفتيش والتدقيق (js/views/inspections.js)
 *
 * Contract: docs/ARCHITECTURE.md §8.6. Owner: VIEWS-B.
 *
 *   • Summary strip (scheduled / completed / overdue / open findings / mean score)
 *   • Schedule table (components.dataTable) of recent and upcoming inspections within
 *     ±range days (global range, default ±30): code, type, site, inspector, date,
 *     status badge, score, checklist progress (components.progress)
 *   • Completion by site (charts.barChart) and findings open vs closed (charts.segmentedBar)
 *   • Upcoming audit cards
 *   • Detail drawer: findings list with close / reopen toggles → store.updateInspection,
 *     and «تسجيل كمنجز» which asks for a score in a modal →
 *     store.updateInspection(id, {status:'منجز', score, checklistDone})
 *
 * Re-renders on store:change (inspections.*), filters:change and settings:change and
 * returns a cleanup that unsubscribes and closes any open overlay.
 */

import * as SEED from '../data/seed.js';
import {
  h, clear, glyph, svgIcon, card, badge, button, segmented, dataTable, modal, drawer, toast,
  formField, readForm, emptyState, progress, kv,
} from '../ui/components.js';

/* ────────────────────────────── enums (contract §3, with fallbacks) ────────────────────────────── */

const list = (value, fallback) => (Array.isArray(value) && value.length ? value : fallback);

const INSPECTION_TYPES = list(SEED.INSPECTION_TYPES, ['جولة سلامة', 'تفتيش معدات', 'تدقيق داخلي', 'تفتيش سقالات', 'فحص رافعات', 'تفتيش كهرباء']);
const INSPECTION_STATUS = list(SEED.INSPECTION_STATUS, ['مجدول', 'منجز', 'متأخر']);

const SCHEDULED = 'مجدول';
const DONE = 'منجز';
const OVERDUE = 'متأخر';
const FINDING_OPEN = 'مفتوح';
const FINDING_CLOSED = 'مغلق';

const STATUS_TONE = { [SCHEDULED]: 'brand', [DONE]: 'good', [OVERDUE]: 'critical' };
const SEVERITY_TONE = { 'منخفض': 'good', 'متوسط': 'warning', 'عالٍ': 'serious' };
const TYPE_ICON = {
  'جولة سلامة': 'clipboard', 'تفتيش معدات': 'truck', 'تدقيق داخلي': 'file-check',
  'تفتيش سقالات': 'scaffold', 'فحص رافعات': 'crane', 'تفتيش كهرباء': 'bolt',
};

const DAY_MS = 86_400_000;
const UPCOMING_LIMIT = 6;

/* ────────────────────────────── pure helpers ────────────────────────────── */

const statusTone = (status) => STATUS_TONE[status] || 'neutral';
const severityTone = (sev) => SEVERITY_TONE[sev] || 'neutral';
const typeIcon = (type) => TYPE_ICON[type] || 'clipboard';

function scoreTone(score) {
  const n = Number(score);
  if (!Number.isFinite(n)) return null;
  if (n >= 85) return 'good';
  if (n >= 70) return 'warning';
  if (n >= 50) return 'serious';
  return 'critical';
}

function siteName(state, siteId) {
  const site = (state.sites || []).find((s) => s && s.id === siteId);
  return site ? site.name : '—';
}

function touches(path, prefix) {
  if (!path || path === '*') return true;
  const p = String(path);
  return p === prefix || p.startsWith(`${prefix}.`);
}

function parseDate(value) {
  if (!value) return NaN;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value));
  return m ? new Date(+m[1], +m[2] - 1, +m[3]).getTime() : Date.parse(value);
}

function startOfDay(ms) { const d = new Date(ms); d.setHours(0, 0, 0, 0); return d.getTime(); }

/** Whole days from today to `iso` (negative = past). */
function daysFromToday(iso, now = Date.now()) {
  const t = parseDate(iso);
  if (!Number.isFinite(t)) return NaN;
  return Math.round((startOfDay(t) - startOfDay(now)) / DAY_MS);
}

/** Arabic relative-day phrase with correct dual/plural agreement. */
function dayPhrase(n, fmt) {
  if (!Number.isFinite(n)) return '—';
  if (n === 0) return 'اليوم';
  if (n === 1) return 'غداً';
  if (n === -1) return 'أمس';
  const abs = Math.abs(n);
  const unit = abs === 2 ? 'يومين' : abs <= 10 ? `${fmt.num(abs)} أيام` : `${fmt.num(abs)} يوماً`;
  return n > 0 ? `خلال ${unit}` : `قبل ${unit}`;
}

function simpleTable(caption, headers, rows) {
  const table = h('table', { class: 'table is-dense' });
  table.appendChild(h('caption', { class: 'sr-only' }, caption));
  table.appendChild(h('thead', {}, h('tr', {}, headers.map((t) => h('th', { scope: 'col' }, t)))));
  table.appendChild(h('tbody', {}, rows.map((r) => h('tr', {}, r.map((c, i) => h('td', { class: i > 0 ? 'num align-end' : null }, c))))));
  return table;
}

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
    console.warn(`[biltix-hse] inspections: charts.${name} unavailable, showing table instead`, err);
  }
  return { el: h('div', { class: 'table-wrap' }, fallbackTable()), table: fallbackTable, native: false };
}

/* ────────────────────────────── the view ────────────────────────────── */

export const inspectionsView = {
  id: 'inspections',
  code: 'SEC-06',
  title: 'التفتيش والتدقيق',
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
    const globalFilters = () => ({ ...(store.filters || state().filters || {}) });
    const tableFilters = () => ({ ...globalFilters(), status: statusFilter === 'all' ? undefined : statusFilter, type: typeFilter === 'all' ? undefined : typeFilter });
    const findInspection = (id) => (state().inspections || []).find((i) => i && i.id === id) || null;

    /* ── skeleton ── */
    const root = h('section', { class: 'view view-inspections', 'aria-labelledby': 'inspections-title' });
    const typeSelect = h('select', { class: 'field-control', 'aria-label': 'تصفية حسب نوع التفتيش', onChange: () => { typeFilter = typeSelect.value; schedule(7); } },
      h('option', { value: 'all' }, 'جميع أنواع التفتيش'),
      INSPECTION_TYPES.map((t) => h('option', { value: t }, t)));
    root.appendChild(h('header', { class: 'view-head' },
      h('div', { class: 'view-head-text' },
        h('span', { class: 'code-tag' }, inspectionsView.code),
        h('h1', { id: 'inspections-title', tabindex: '-1' }, inspectionsView.title),
        h('p', { class: 'view-lead' }, 'جدول جولات السلامة والتفتيشات الفنية والتدقيقات الداخلية، مع نسب الإنجاز حسب الموقع، وملاحظات التفتيش المفتوحة والمغلقة، وتسجيل النتائج فور اكتمال الجولة.')),
      h('div', { class: 'view-actions' }, typeSelect)));

    const stripHost = h('div', { class: 'summary-strip', role: 'group', 'aria-label': 'ملخص التفتيش' });
    const gridHost = h('div', { class: 'grid-12' });
    const upcomingSection = h('section', { class: 'stack gap-3', 'aria-labelledby': 'upcoming-title' });
    root.append(stripHost, gridHost, upcomingSection);

    /* schedule table (built once, updated in place) */
    const statusSeg = segmented({
      ariaLabel: 'تصفية حسب حالة التفتيش',
      value: 'all',
      options: [{ value: 'all', label: 'الكل' }, ...INSPECTION_STATUS.map((s) => ({ value: s, label: s }))],
      onChange: (v) => { statusFilter = v; schedule(2); },
    });
    statusSeg.el.classList.add('seg-sm');

    const table = dataTable({
      caption: 'جدول التفتيش والتدقيق',
      pageSize: 10,
      dense: true,
      initialSort: { key: 'date', dir: 'asc' },
      emptyText: 'لا توجد تفتيشات ضمن النافذة الزمنية والموقع المحددين',
      onRowClick: (row) => openDrawer(row.id),
      columns: [
        { key: 'code', label: 'الرمز', mono: true, width: 92, render: (r) => h('span', { class: 'mono' }, r.code) },
        { key: 'type', label: 'النوع', render: (r) => h('span', { class: 'row gap-1' }, svgIcon(typeIcon(r.type), 14), r.type) },
        {
          key: 'siteId', label: 'الموقع', sortValue: (r) => siteName(state(), r.siteId),
          render: (r) => {
            const site = (state().sites || []).find((s) => s && s.id === r.siteId);
            return h('span', { class: 'stack gap-1', title: site ? site.name : '' },
              h('span', { class: 'truncate', style: { maxInlineSize: '14ch' } }, site ? site.name : '—'),
              site ? h('span', { class: 'mono text-xs muted' }, site.code) : null);
          },
        },
        { key: 'inspector', label: 'المفتش', render: (r) => h('span', { class: 'truncate', style: { maxInlineSize: '14ch', display: 'inline-block', verticalAlign: 'middle' }, title: r.inspector || '' }, r.inspector || '—') },
        {
          key: 'date', label: 'التاريخ', sortValue: (r) => parseDate(r.date),
          render: (r) => {
            const n = daysFromToday(r.date);
            return h('span', { class: 'stack gap-1' },
              h('span', { class: 'nowrap' }, fmt.date(r.date, { style: 'short' })),
              h('span', { class: ['text-xs', 'nowrap', r.status !== DONE && n < 0 ? 'is-overdue' : 'muted'] }, dayPhrase(n, fmt)));
          },
        },
        { key: 'status', label: 'الحالة', render: (r) => badge(r.status, statusTone(r.status)) },
        {
          key: 'score', label: 'الدرجة', align: 'end', sortValue: (r) => (r.score === null || r.score === undefined ? null : Number(r.score)),
          render: (r) => {
            if (r.score === null || r.score === undefined) return h('span', { class: 'muted' }, '—');
            const row = h('span', { class: 'progress-row', style: { minInlineSize: '88px' } });
            row.appendChild(progress({ value: Number(r.score), max: 100, tone: scoreTone(r.score), label: `الدرجة ${fmt.pct(Number(r.score))}` }));
            row.appendChild(h('span', { class: 'progress-value' }, fmt.pct(Number(r.score))));
            return row;
          },
        },
        {
          key: 'checklistDone', label: 'قائمة التحقق', sortValue: (r) => (Number(r.checklistTotal) ? (Number(r.checklistDone) || 0) / Number(r.checklistTotal) : 0),
          render: (r) => {
            const total = Number(r.checklistTotal) || 0; const done = Number(r.checklistDone) || 0;
            const row = h('span', { class: 'progress-row', style: { minInlineSize: '96px' } });
            row.appendChild(progress({ value: done, max: Math.max(total, 1), tone: total && done >= total ? 'good' : null, label: `بنود قائمة التحقق المنجزة ${fmt.num(done)} من ${fmt.num(total)}` }));
            row.appendChild(h('span', { class: 'progress-value' }, `${fmt.num(done)}/${fmt.num(total)}`));
            return row;
          },
        },
      ],
      rows: [],
    });
    const tableCount = h('span', { class: 'badge tone-neutral mono' }, '');
    const tableCard = card({
      code: 'SEC-06.A', title: 'جدول التفتيش', subtitle: 'الجولات المنجزة والمتأخرة والمجدولة ضمن النافذة الزمنية المحددة (± الفترة)',
      actions: [tableCount, statusSeg.el], body: table.el,
    });
    tableCard.querySelector('.card-body').classList.add('is-flush');
    const completionHost = h('div', { class: 'col-span-6' });
    const findingsHost = h('div', { class: 'col-span-6' });
    gridHost.append(h('div', { class: 'col-span-12' }, tableCard), completionHost, findingsHost);

    const upcomingHost = h('div', { class: 'cards-grid', role: 'list', 'aria-label': 'التدقيقات القادمة' });
    upcomingSection.append(
      h('div', { class: 'row gap-2' },
        h('span', { class: 'code-tag', 'aria-hidden': 'true' }, 'SEC-06.D'),
        h('h2', { id: 'upcoming-title', class: 'card-title' }, 'التدقيقات القادمة'),
        h('span', { class: 'text-xs muted' }, 'أقرب الجولات المجدولة في الموقع المحدد')),
      upcomingHost);

    container.appendChild(root);

    /* ── summary strip ── */
    function paintStrip() {
      clear(stripHost);
      const st = state();
      const gf = globalFilters();
      const rows = sel.filteredInspections(st, gf);
      const scheduled = rows.filter((r) => r.status === SCHEDULED).length;
      const done = rows.filter((r) => r.status === DONE);
      const overdue = rows.filter((r) => r.status === OVERDUE).length;
      const findings = sel.findingsSummary(st, gf);
      const scores = done.map((r) => Number(r.score)).filter(Number.isFinite);
      const mean = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null;

      const cell = (label, value, tone, small) => {
        const c = h('div', { class: ['summary-cell', tone ? `tone-${tone}` : null] });
        const lab = h('span', { class: 'summary-label' });
        if (tone) { const ic = glyph(tone, 14); ic.style.color = 'var(--tone-ink)'; lab.appendChild(ic); }
        lab.appendChild(h('span', {}, label));
        const val = h('span', { class: 'summary-value' }, value);
        if (small) val.appendChild(h('small', {}, small));
        c.append(lab, val);
        return c;
      };
      stripHost.append(
        cell('مجدولة', fmt.num(scheduled), 'brand'),
        cell('منجزة', fmt.num(done.length), 'good', `من ${fmt.num(rows.length)}`),
        cell('متأخرة', fmt.num(overdue), overdue ? 'critical' : 'neutral'),
        cell('ملاحظات مفتوحة', fmt.num(findings.open), findings.open ? 'serious' : 'good', `من ${fmt.num(findings.total)}`),
        cell('متوسط الدرجة', mean === null ? '—' : fmt.pct(mean), scoreTone(mean), scores.length ? `عبر ${fmt.num(scores.length)} تفتيشاً` : ''),
      );
    }

    /* ── schedule table ── */
    function paintTable() {
      const rows = sel.filteredInspections(state(), tableFilters()).slice();
      table.update(rows);
      tableCount.textContent = fmt.num(rows.length);
    }

    /* ── side charts ── */
    function paintCharts() {
      clear(completionHost); clear(findingsHost);
      const st = state();
      const gf = { ...globalFilters(), type: typeFilter === 'all' ? undefined : typeFilter };

      const completion = sel.inspectionCompletionBySite(st, gf).slice().sort((a, b) => b.value - a.value || b.total - a.total);
      const withData = completion.filter((c) => c.total > 0);
      const completionTable = () => simpleTable('نسبة إنجاز التفتيش حسب الموقع', ['الموقع', 'المنجز', 'الإجمالي', 'النسبة'], completion.map((c) => [c.label, fmt.num(c.done), fmt.num(c.total), fmt.pct(c.value)]));
      const completionChart = withData.length
        ? safeChart(charts, 'barChart', {
          items: withData.map((c) => ({ id: c.id, label: c.label, value: c.value })),
          horizontal: true, height: Math.max(160, 36 * withData.length + 24), valueFormat: (v) => fmt.pct(v), color: 'var(--s1)', showValues: true, maxBars: 6,
          ariaLabel: 'نسبة إنجاز التفتيش حسب الموقع',
        }, completionTable)
        : { el: emptyState({ title: 'لا توجد تفتيشات ضمن النافذة الزمنية', text: 'وسّع الفترة أو غيّر الموقع لعرض نسب الإنجاز.' }), table: completionTable };
      completionHost.appendChild(card({
        code: 'SEC-06.B', title: 'نسبة الإنجاز حسب الموقع', subtitle: 'التفتيشات المنجزة من إجمالي المجدولة في النافذة',
        body: completionChart.el, tableView: completionChart.table,
      }));

      const f = sel.findingsSummary(st, gf);
      const findingsTable = () => simpleTable('ملاحظات التفتيش', ['الحالة', 'العدد'], [['مفتوحة', fmt.num(f.open)], ['مغلقة', fmt.num(f.closed)]]);
      const findingsChart = f.total > 0
        ? safeChart(charts, 'segmentedBar', {
          parts: [
            { id: 'open', label: 'مفتوحة', value: f.open, color: 'var(--serious)' },
            { id: 'closed', label: 'مغلقة', value: f.closed, color: 'var(--good)' },
          ].filter((p) => p.value > 0),
          tall: true, valueFormat: (v) => fmt.num(v), ariaLabel: 'ملاحظات التفتيش المفتوحة مقابل المغلقة',
        }, findingsTable)
        : { el: emptyState({ title: 'لا توجد ملاحظات مسجلة', text: 'تظهر الملاحظات بعد إنجاز التفتيشات وتسجيل نتائجها.' }), table: findingsTable };
      const sevRow = h('div', { class: 'row wrap gap-2', 'aria-label': 'الملاحظات حسب الخطورة' });
      ['عالٍ', 'متوسط', 'منخفض'].forEach((sev) => { const n = f.bySeverity[sev] || 0; if (n) sevRow.appendChild(badge(`${sev}: ${fmt.num(n)}`, severityTone(sev))); });
      findingsHost.appendChild(card({
        code: 'SEC-06.C', title: 'ملاحظات التفتيش', subtitle: `${fmt.num(f.open)} مفتوحة من أصل ${fmt.num(f.total)} — نسبة الإغلاق ${fmt.pct(f.total ? Math.round((f.closed / f.total) * 100) : 0)}`,
        body: h('div', { class: 'stack gap-3' }, findingsChart.el, sevRow.childNodes.length ? sevRow : null), tableView: findingsChart.table,
      }));
    }

    /* ── upcoming audits ── */
    function paintUpcoming() {
      clear(upcomingHost);
      const st = state();
      const gf = { ...globalFilters(), type: typeFilter === 'all' ? undefined : typeFilter };
      const now = Date.now();
      const upcoming = sel.filteredInspections(st, gf)
        .filter((r) => r.status === SCHEDULED && daysFromToday(r.date, now) >= 0)
        .sort((a, b) => parseDate(a.date) - parseDate(b.date))
        .slice(0, UPCOMING_LIMIT);
      if (!upcoming.length) {
        upcomingHost.appendChild(emptyState({ icon: 'clipboard', title: 'لا توجد تدقيقات مجدولة قادمة', text: 'ضمن النافذة الزمنية والموقع المحددين.' }));
        return;
      }
      upcoming.forEach((ins) => {
        const n = daysFromToday(ins.date, now);
        const total = Number(ins.checklistTotal) || 0; const done = Number(ins.checklistDone) || 0;
        const titleId = `ins-${ins.id}-title`;
        const prog = h('div', { class: 'progress-row' });
        prog.appendChild(progress({ value: done, max: Math.max(total, 1), label: `بنود قائمة التحقق ${fmt.num(done)} من ${fmt.num(total)}` }));
        prog.appendChild(h('span', { class: 'progress-value' }, `${fmt.num(done)}/${fmt.num(total)}`));
        upcomingHost.appendChild(h('article', { class: 'card', role: 'listitem', 'aria-labelledby': titleId },
          h('div', { class: 'card-body stack gap-3' },
            h('div', { class: 'row between gap-2' }, badge(ins.type, 'neutral', { icon: typeIcon(ins.type) }), h('span', { class: 'mono text-xs muted' }, ins.code)),
            h('h3', { class: 'card-title', id: titleId }, siteName(st, ins.siteId)),
            h('div', { class: 'stack gap-1 text-sm ink-2' },
              h('span', {}, ins.inspector || '—'),
              h('span', { class: 'row gap-2' }, h('span', {}, fmt.date(ins.date, { style: 'long' })), badge(dayPhrase(n, fmt), n <= 2 ? 'warning' : 'brand'))),
            prog,
            h('div', { class: 'row end' }, button('عرض التفاصيل', { variant: 'outline', size: 'sm', onClick: () => openDrawer(ins.id) })))));
      });
    }

    /* ── drawer ── */
    function openDrawer(id) {
      const first = findInspection(id);
      if (!first) { toast('تعذر العثور على سجل التفتيش', { tone: 'warning' }); return; }
      if (activeDrawer) { activeDrawer.close(); activeDrawer = null; }

      const body = h('div', { class: 'stack' });
      const completeBtn = button('تسجيل كمنجز', { variant: 'primary', icon: 'clipboard', onClick: () => openCompleteModal(id) });
      let unsub = () => {};
      const api = drawer({
        title: `${first.code} — ${first.type}`, subtitle: `${siteName(state(), first.siteId)} · ${first.inspector || ''}`, size: 'lg', body,
        actions: [completeBtn, { label: 'إغلاق', variant: 'ghost' }],
        onClose: () => { unsub(); if (activeDrawer === api) activeDrawer = null; },
      });
      activeDrawer = api;

      const paint = () => {
        const ins = findInspection(id);
        clear(body);
        if (!ins) { body.appendChild(emptyState({ title: 'تم حذف هذا السجل' })); completeBtn.hidden = true; return; }
        const st = state();
        const n = daysFromToday(ins.date);
        const total = Number(ins.checklistTotal) || 0; const done = Number(ins.checklistDone) || 0;
        const findings = Array.isArray(ins.findings) ? ins.findings : [];
        const open = findings.filter((f) => f && f.status === FINDING_OPEN).length;
        completeBtn.hidden = ins.status === DONE;

        const badges = h('div', { class: 'row wrap gap-2' }, badge(ins.status, statusTone(ins.status)), badge(ins.type, 'neutral', { icon: typeIcon(ins.type) }));
        if (ins.status !== DONE) badges.appendChild(badge(dayPhrase(n, fmt), n < 0 ? 'critical' : n <= 2 ? 'warning' : 'brand'));

        const scoreRow = ins.score === null || ins.score === undefined
          ? h('span', { class: 'muted' }, 'لم تُسجل بعد')
          : (() => { const r = h('span', { class: 'progress-row' }); r.appendChild(progress({ value: Number(ins.score), max: 100, tone: scoreTone(ins.score), label: 'الدرجة' })); r.appendChild(h('span', { class: 'progress-value' }, fmt.pct(Number(ins.score)))); return r; })();
        const checklistRow = h('span', { class: 'progress-row' });
        checklistRow.appendChild(progress({ value: done, max: Math.max(total, 1), tone: total && done >= total ? 'good' : null, label: 'بنود قائمة التحقق' }));
        checklistRow.appendChild(h('span', { class: 'progress-value' }, `${fmt.num(done)}/${fmt.num(total)}`));

        body.appendChild(section('بيانات التفتيش', badges, kv([
          ['الموقع', siteName(st, ins.siteId)],
          ['المفتش', ins.inspector],
          ['التاريخ', `${fmt.date(ins.date, { style: 'long' })} — ${dayPhrase(n, fmt)}`],
          ['الدرجة', scoreRow],
          ['قائمة التحقق', checklistRow],
          ins.updatedAt ? ['آخر تحديث', fmt.relative(ins.updatedAt)] : null,
        ])));

        const ul = h('ul', { class: 'list-reset stack gap-2' });
        if (!findings.length) ul.appendChild(h('li', { class: 'note' }, ins.status === DONE ? 'أُنجز التفتيش دون ملاحظات.' : 'تُسجَّل الملاحظات بعد إنجاز التفتيش.'));
        findings.forEach((f) => {
          const isOpen = f.status === FINDING_OPEN;
          ul.appendChild(h('li', { class: ['controls-item', isOpen ? `tone-${severityTone(f.severity)}` : 'tone-good'] },
            h('span', { class: 'controls-type' }, f.severity || 'غير محدد'),
            h('div', { class: 'stack gap-1' },
              h('span', { class: ['text-sm', isOpen ? null : 'muted'] }, f.text || '—'),
              h('div', { class: 'row wrap gap-2' },
                badge(isOpen ? 'مفتوحة' : 'مغلقة', isOpen ? 'serious' : 'good'),
                button(isOpen ? 'إغلاق الملاحظة' : 'إعادة فتح', { variant: 'ghost', size: 'sm', onClick: () => toggleFinding(id, f.id) })))));
        });
        body.appendChild(section(`الملاحظات (${fmt.num(open)} مفتوحة من ${fmt.num(findings.length)})`, ul));

        if (ins.status !== DONE) {
          body.appendChild(section('الإنجاز', h('p', { class: 'note tone-brand' }, 'عند تسجيل التفتيش كمنجز يُطلب إدخال الدرجة النهائية وعدد بنود قائمة التحقق المنجزة، وتتحدث مؤشرات الإنجاز فوراً.')));
        }
      };

      paint();
      unsub = bus.on('store:change', (p) => { if (touches(p && p.path, 'inspections')) paint(); });
      api.open();
    }

    function section(title, ...children) {
      return h('section', { class: 'drawer-section' }, h('h3', { class: 'drawer-section-title' }, title), h('div', { class: 'stack gap-3' }, children));
    }

    function toggleFinding(inspectionId, findingId) {
      const ins = findInspection(inspectionId);
      if (!ins) return;
      const findings = (ins.findings || []).map((f) => (f && f.id === findingId ? { ...f, status: f.status === FINDING_OPEN ? FINDING_CLOSED : FINDING_OPEN } : f));
      store.updateInspection(inspectionId, { findings });
      const target = findings.find((f) => f && f.id === findingId);
      toast(target && target.status === FINDING_CLOSED ? 'تم إغلاق الملاحظة' : 'أُعيد فتح الملاحظة', { tone: target && target.status === FINDING_CLOSED ? 'good' : 'neutral', timeout: 2500 });
    }

    /* ── complete modal ── */
    function openCompleteModal(id) {
      const ins = findInspection(id);
      if (!ins) return;
      if (activeModal) { activeModal.close(); activeModal = null; }
      const total = Number(ins.checklistTotal) || 0;
      const openFindings = (ins.findings || []).filter((f) => f && f.status === FINDING_OPEN).length;

      const form = h('form', { class: 'form-grid', 'aria-label': 'نموذج تسجيل التفتيش كمنجز' });
      form.append(
        h('p', { class: 'note is-full' }, `${ins.code} — ${ins.type} · ${siteName(state(), ins.siteId)} · ${fmt.date(ins.date)}`),
        formField({ label: 'الدرجة النهائية (%)', name: 'score', type: 'number', min: 0, max: 100, step: 1, required: true, value: Number.isFinite(Number(ins.score)) ? Number(ins.score) : '', placeholder: '0 – 100', hint: 'نسبة الامتثال الإجمالية لبنود قائمة التحقق' }),
        formField({ label: 'البنود المنجزة من قائمة التحقق', name: 'checklistDone', type: 'number', min: 0, max: total || 100000, step: 1, required: true, value: total, hint: total ? `من أصل ${fmt.num(total)} بنداً` : '' }),
      );
      if (openFindings) form.appendChild(h('p', { class: 'note tone-warning is-full' }, `توجد ${fmt.num(openFindings)} ملاحظة مفتوحة؛ يمكن إنجاز التفتيش ومتابعة إغلاقها لاحقاً من سجل الملاحظات.`));

      const submit = () => {
        if (!form.reportValidity()) return false;
        const data = readForm(form);
        const score = Math.max(0, Math.min(100, Number(data.score)));
        const checklistDone = Math.max(0, Math.min(total || Number.MAX_SAFE_INTEGER, Number(data.checklistDone) || 0));
        if (!Number.isFinite(score)) { toast('أدخل درجة صحيحة بين 0 و100', { tone: 'warning' }); return false; }
        const updated = store.updateInspection(id, { status: DONE, score, checklistDone });
        if (!updated) { toast('تعذر حفظ النتيجة', { tone: 'critical' }); return false; }
        toast(`تم تسجيل ${ins.code} كمنجز بدرجة ${fmt.pct(score)}`, { tone: 'good', title: 'تم الحفظ' });
        return true;
      };
      form.addEventListener('submit', (e) => { e.preventDefault(); if (submit()) api.close('action'); });

      const api = modal({
        title: 'تسجيل التفتيش كمنجز', subtitle: 'تُحدَّث الحالة إلى «منجز» وتُحتسب الدرجة في نسب الإنجاز', size: 'md', body: form,
        actions: [{ label: 'إلغاء', variant: 'ghost' }, { label: 'حفظ النتيجة', variant: 'primary', onClick: () => submit() }],
        onClose: () => { if (activeModal === api) activeModal = null; },
      });
      activeModal = api;
      api.open();
    }

    /* ── repaint orchestration ── */
    let pending = 0; // 1 strip, 2 table, 4 charts + upcoming
    let raf = 0;
    const schedule = (mask) => {
      pending |= mask;
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        if (!alive) return;
        const m = pending; pending = 0;
        try {
          if (m & 1) paintStrip();
          if (m & 2) paintTable();
          if (m & 4) { paintCharts(); paintUpcoming(); }
        } catch (err) { console.error('[biltix-hse] inspections: repaint failed', err); }
      });
    };

    paintStrip(); paintTable(); paintCharts(); paintUpcoming();

    subs.push(bus.on('store:change', (p) => { const path = p && p.path; if (touches(path, 'inspections') || touches(path, 'sites')) schedule(7); }));
    subs.push(bus.on('filters:change', () => schedule(7)));
    subs.push(bus.on('settings:change', () => schedule(7)));
    subs.push(bus.on('theme:change', () => schedule(4)));

    /* deep link: ?id=N13 opens the drawer */
    const params = (ctx && ctx.params) || {};
    if (params.id) requestAnimationFrame(() => { if (alive && findInspection(params.id)) openDrawer(params.id); });

    return () => {
      alive = false;
      if (raf) { cancelAnimationFrame(raf); raf = 0; }
      subs.splice(0).forEach((u) => { try { u(); } catch { /* ignore */ } });
      if (activeDrawer) { try { activeDrawer.close(); } catch { /* ignore */ } activeDrawer = null; }
      if (activeModal) { try { activeModal.close(); } catch { /* ignore */ } activeModal = null; }
    };
  },
};

export default inspectionsView;
