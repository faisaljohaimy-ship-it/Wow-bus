/**
 * Biltix HSE — view: التدريب والكفاءات (js/views/training.js) — SEC-07
 *
 * Training matrix (workers × courses) as a heatmap, completion-by-course ranked bars,
 * certificates expiring within 60 days, status distribution, compliance by site and
 * the course catalogue. Everything is derived through `sel.*` so the view carries no
 * business rules of its own; it re-renders on store / filter / numerals changes.
 *
 * Contract: docs/ARCHITECTURE.md §4 (components, selectors), §5 (charts), §8.7.
 * Data reaches the DOM only through textContent / components.h.
 */

const EXPIRING_WINDOW_DAYS = 60;
const MATRIX_WORKER_CAP = 24;

/** Cell status → heatmap code (ordinal, so the heatmap receives numbers), colour, glyph, label. */
const STATUS = {
  valid:    { code: 3, label: 'سارية',        color: 'var(--seq-500)', glyph: '✓', tone: 'good' },
  expiring: { code: 2, label: 'تنتهي قريباً', color: 'var(--seq-300)', glyph: '!', tone: 'warning' },
  expired:  { code: 1, label: 'منتهية',       color: 'var(--critical)', glyph: '✕', tone: 'critical' },
  missing:  { code: 0, label: 'غير مكتملة',   color: 'var(--bg-3)',    glyph: '–', tone: 'neutral' },
};
const STATUS_BY_CODE = ['missing', 'expired', 'expiring', 'valid'];
const STATUS_ORDER = ['valid', 'expiring', 'expired', 'missing'];

const safe = (fn, fallback) => { try { const v = fn(); return v === undefined ? fallback : v; } catch { return fallback; } };

export default {
  id: 'training',
  code: 'SEC-07',
  title: 'التدريب والكفاءات',
  icon: 'graduation',

  render(container, ctx) {
    const { store, bus, sel, fmt, charts, components, sources, router } = ctx;
    const { h, card, statTile, badge, dataTable, button, drawer, toast, emptyState, progress, svgIcon, glyph, kv } = components;

    const root = h('section', { class: 'view view-training' });
    container.appendChild(root);

    let raf = 0;
    let lastNumerals = safe(() => store.state.settings.numerals, 'latn');
    let openDrawer = null;

    /* ───────────────────────── helpers ───────────────────────── */

    const mono = (text, extra = '') => h('span', { class: ['num', ...String(extra).split(/\s+/).filter(Boolean)], style: { fontFamily: 'var(--font-mono)' } }, String(text ?? ''));

    function makeChart(name, opts) {
      if (!charts || typeof charts[name] !== 'function') return null;
      try {
        const c = charts[name](opts);
        return c && c.el instanceof Node ? c : null;
      } catch (err) {
        console.warn(`[training] charts.${name} failed`, err);
        return null;
      }
    }

    function chartOr(chart, fallback) {
      if (chart) return chart.el;
      return fallback || emptyState({ title: 'الرسم غير متاح حالياً', text: 'استخدم عرض الجدول للاطلاع على البيانات.' });
    }

    function tableOf(chart, fallbackFn) {
      return () => {
        if (chart && typeof chart.table === 'function') {
          const t = safe(() => chart.table(), null);
          if (t instanceof Node) return t;
        }
        return fallbackFn ? fallbackFn() : h('table');
      };
    }

    function siteName(state, siteId) {
      if (!siteId || siteId === 'all') return 'جميع المواقع';
      const s = safe(() => sel.siteById(state, siteId), null) || (state.sites || []).find((x) => x.id === siteId);
      return s ? s.name : siteId;
    }

    function companyShort(name) { return name || '—'; }

    function daysLabel(days) {
      if (days <= 0) return 'اليوم';
      if (days === 1) return 'غداً';
      if (days === 2) return 'خلال يومين';
      if (days <= 10) return `خلال ${fmt.num(days)} أيام`;
      return `خلال ${fmt.num(days)} يوماً`;
    }

    function legendItem(statusKey, count) {
      const s = STATUS[statusKey];
      const key = h('span', { class: 'legend-key', style: { '--key': s.color, background: s.color, boxShadow: 'inset 0 0 0 1px var(--line-2)' } });
      const g = glyph(s.tone, 12);
      return h('span', { class: ['matrix-legend-item', `tone-${s.tone}`] },
        key,
        g,
        h('span', { class: 'legend-label' }, `${s.glyph} ${s.label}`),
        count !== undefined ? h('span', { class: 'legend-value' }, fmt.num(count)) : null,
      );
    }

    /* ───────────────────────── data ───────────────────────── */

    function collect() {
      const state = store.state;
      const filters = store.filters || { siteId: 'all', range: 30, search: '' };
      const siteId = filters.siteId || 'all';
      const full = safe(() => sel.trainingMatrix(state, siteId), null) || { workers: [], courses: [], cells: [], summary: { valid: 0, expiring: 0, expired: 0, missing: 0 } };
      const workers = Array.isArray(full.workers) ? full.workers : [];
      const courses = Array.isArray(full.courses) ? full.courses : [];
      const cells = Array.isArray(full.cells) ? full.cells : [];
      const summary = full.summary || STATUS_ORDER.reduce((acc, k) => {
        acc[k] = cells.reduce((n, row) => n + row.filter((s) => s === k).length, 0); return acc;
      }, {});

      const capped = siteId === 'all' && workers.length > MATRIX_WORKER_CAP;
      const shownWorkers = capped ? workers.slice(0, MATRIX_WORKER_CAP) : workers;
      const shownCells = capped ? cells.slice(0, MATRIX_WORKER_CAP) : cells;

      const completion = (safe(() => sel.trainingCompletionByCourse(state, filters), []) || [])
        .map((c) => ({ ...c, pct: Number(c.pct) || 0 }));
      const expiring = safe(() => sel.expiringCerts(state, EXPIRING_WINDOW_DAYS, filters), []) || [];
      const kpis = safe(() => sel.kpis(state, filters), null);

      const mandatoryIdx = courses.map((c, i) => (c && c.mandatory ? i : -1)).filter((i) => i >= 0);
      const withoutMandatory = cells.filter((row) => mandatoryIdx.some((i) => row[i] === 'missing' || row[i] === 'expired')).length;

      let compliance = kpis && Number.isFinite(kpis.trainingCompliance) ? kpis.trainingCompliance : null;
      if (compliance === null) {
        let total = 0; let ok = 0;
        for (const row of cells) for (const i of (mandatoryIdx.length ? mandatoryIdx : courses.map((_, idx) => idx))) { total += 1; if (row[i] === 'valid' || row[i] === 'expiring') ok += 1; }
        compliance = total ? Math.round((ok / total) * 100) : 100;
      }
      const complianceDelta = kpis && kpis.deltas && Number.isFinite(kpis.deltas.trainingCompliance) ? kpis.deltas.trainingCompliance : null;

      // Compliance by site (mandatory courses) — only meaningful when all sites are shown.
      const bySite = siteId === 'all'
        ? (state.sites || []).map((site) => {
          const m = safe(() => sel.trainingMatrix(state, site.id), null);
          if (!m) return { id: site.id, label: site.name, value: 0 };
          const idx = (m.courses || []).map((c, i) => (c && c.mandatory ? i : -1)).filter((i) => i >= 0);
          const use = idx.length ? idx : (m.courses || []).map((_, i) => i);
          let total = 0; let ok = 0;
          for (const row of (m.cells || [])) for (const i of use) { total += 1; if (row[i] === 'valid' || row[i] === 'expiring') ok += 1; }
          return { id: site.id, label: site.name, value: total ? Math.round((ok / total) * 100) : 0, workers: (m.workers || []).length };
        }).sort((a, b) => b.value - a.value)
        : [];

      return { state, filters, siteId, workers, courses, cells, summary, capped, shownWorkers, shownCells, completion, expiring, kpis, withoutMandatory, compliance, complianceDelta, bySite };
    }

    /* ───────────────────────── worker drawer ───────────────────────── */

    function openWorker(data, worker, focusCourseId = null) {
      if (!worker) return;
      if (openDrawer) { try { openDrawer.close(); } catch { /* ignore */ } openDrawer = null; }
      const now = store.now ? store.now() : new Date();
      const rows = data.courses.map((c) => {
        const certs = (worker.certs || []).filter((x) => x && x.courseId === c.id);
        const latest = certs.sort((a, b) => new Date(b.expiresAt) - new Date(a.expiresAt))[0] || null;
        let status = 'missing';
        if (latest) {
          const exp = new Date(latest.expiresAt).getTime();
          if (!Number.isFinite(exp) || exp <= now.getTime()) status = 'expired';
          else if (exp - now.getTime() <= 30 * 86_400_000) status = 'expiring';
          else status = 'valid';
        }
        return { id: c.id, course: c.name, mandatory: !!c.mandatory, status, completedAt: latest ? latest.completedAt : null, expiresAt: latest ? latest.expiresAt : null, focus: c.id === focusCourseId };
      });
      const table = dataTable({
        dense: true,
        pageSize: 0,
        rowKey: 'id',
        caption: `شهادات ${worker.name}`,
        columns: [
          { key: 'course', label: 'الدورة', render: (r) => h('span', { class: r.focus ? 'semibold' : null }, r.course) },
          { key: 'mandatory', label: 'النوع', render: (r) => badge(r.mandatory ? 'إلزامية' : 'اختيارية', r.mandatory ? 'brand' : 'neutral'), sortValue: (r) => (r.mandatory ? 0 : 1) },
          { key: 'status', label: 'الحالة', render: (r) => badge(STATUS[r.status].label, STATUS[r.status].tone), sortValue: (r) => STATUS[r.status].code },
          { key: 'completedAt', label: 'تاريخ الإكمال', render: (r) => (r.completedAt ? fmt.date(r.completedAt) : '—') },
          { key: 'expiresAt', label: 'تاريخ الانتهاء', render: (r) => (r.expiresAt ? fmt.date(r.expiresAt) : '—') },
        ],
        rows,
      });
      const counts = STATUS_ORDER.map((k) => [STATUS[k].label, fmt.num(rows.filter((r) => r.status === k).length)]);
      const body = h('div', { class: 'stack gap-4' },
        kv([
          ['الدور', worker.role || '—'],
          ['الشركة', companyShort(worker.company)],
          ['الموقع', siteName(data.state, worker.siteId)],
          ['الرقم', mono(worker.id)],
        ]),
        h('div', { class: 'matrix-legend' }, ...STATUS_ORDER.map((k) => legendItem(k, rows.filter((r) => r.status === k).length))),
        table.el,
        h('p', { class: 'text-xs muted' }, `تُعدّ الشهادة «تنتهي قريباً» عندما يتبقى على انتهائها ${fmt.num(30)} يوماً أو أقل. الإجمالي: ${counts.map(([l, v]) => `${l} ${v}`).join(' · ')}`),
      );
      openDrawer = drawer({ title: worker.name, subtitle: 'سجل الشهادات والتدريب', body, size: 'lg', onClose: () => { openDrawer = null; } });
      openDrawer.open();
    }

    /* ───────────────────────── sections ───────────────────────── */

    function buildHead(data) {
      const exportBtn = button('تصدير الشهادات المنتهية قريباً', {
        variant: 'outline', size: 'sm', icon: svgIcon('download', 16),
        onClick: () => {
          const rows = data.expiring.map((e) => ({
            worker: e.worker.name, role: e.worker.role, company: e.worker.company, site: siteName(data.state, e.siteId),
            course: e.course.name, expiresAt: e.expiresAt, daysLeft: e.daysLeft,
          }));
          const columns = [
            { key: 'worker', label: 'العامل' }, { key: 'role', label: 'الدور' }, { key: 'company', label: 'الشركة' }, { key: 'site', label: 'الموقع' },
            { key: 'course', label: 'الدورة' }, { key: 'expiresAt', label: 'تاريخ الانتهاء' }, { key: 'daysLeft', label: 'الأيام المتبقية' },
          ];
          if (!rows.length) { toast(`لا توجد شهادات تنتهي خلال ${fmt.num(EXPIRING_WINDOW_DAYS)} يوماً لتصديرها.`, { tone: 'neutral' }); return; }
          try {
            if (!sources || typeof sources.exportCSV !== 'function') throw new Error('export unavailable');
            sources.exportCSV(rows, columns, `biltix-hse-expiring-certs-${new Date().toISOString().slice(0, 10)}.csv`);
            toast(`تم تصدير ${fmt.num(rows.length)} شهادة بصيغة CSV.`, { tone: 'good' });
          } catch {
            toast('تعذر التصدير حالياً. حاول مرة أخرى لاحقاً.', { tone: 'critical' });
          }
        },
      });
      return h('div', { class: 'view-head' },
        h('div', { class: 'view-head-text' },
          h('span', { class: 'code-tag' }, 'SEC-07'),
          h('h1', { tabindex: '-1' }, 'التدريب والكفاءات'),
          h('p', { class: 'view-lead' }, `متابعة الشهادات والكفاءات لعمال ${siteName(data.state, data.siteId)}: مصفوفة التدريب، نسب الإكمال لكل دورة، والشهادات التي تقترب من الانتهاء خلال ${fmt.num(EXPIRING_WINDOW_DAYS)} يوماً.`),
        ),
        h('div', { class: 'view-actions' }, exportBtn),
      );
    }

    function buildKpis(data) {
      const c = data.compliance;
      const tone = c >= 90 ? 'good' : c >= 75 ? 'warning' : 'critical';
      return h('div', { class: 'kpi-row' },
        statTile({ label: 'الامتثال التدريبي', value: c, unit: '%', tone, icon: svgIcon('graduation', 18), delta: data.complianceDelta, deltaGoodWhen: 'up', hint: 'نسبة الشهادات الإلزامية السارية لجميع العمال ضمن النطاق المحدد' }),
        statTile({ label: `شهادات تنتهي خلال ${fmt.num(EXPIRING_WINDOW_DAYS)} يوماً`, value: data.expiring.length, tone: data.expiring.length ? 'warning' : 'good', icon: glyph('clock', 18), hint: 'شهادات سارية تنتهي صلاحيتها قريباً وتتطلب تجديداً', onClick: () => { const t = root.querySelector('[data-section="expiring"]'); if (t) t.scrollIntoView({ behavior: 'smooth', block: 'start' }); } }),
        statTile({ label: 'شهادات منتهية', value: data.summary.expired || 0, tone: (data.summary.expired || 0) ? 'critical' : 'good', icon: glyph('critical', 18), hint: 'شهادات تجاوزت تاريخ انتهائها ولم تُجدَّد بعد' }),
        statTile({ label: 'عمال بدون تدريب إلزامي', value: data.withoutMandatory, tone: data.withoutMandatory ? 'serious' : 'good', icon: svgIcon('body', 18), hint: 'عمال تنقصهم دورة إلزامية واحدة على الأقل أو شهادتها منتهية' }),
      );
    }

    function matrixTable(data) {
      const table = h('table', { class: 'table is-dense' });
      table.appendChild(h('caption', { class: 'sr-only' }, 'مصفوفة التدريب — حالة شهادة كل عامل في كل دورة'));
      const thead = h('thead');
      const hr = h('tr', {}, h('th', { scope: 'col' }, 'العامل'));
      data.courses.forEach((c) => hr.appendChild(h('th', { scope: 'col' }, c.name)));
      thead.appendChild(hr);
      const tbody = h('tbody');
      data.shownWorkers.forEach((w, ri) => {
        const tr = h('tr', {}, h('th', { scope: 'row' }, w.name));
        (data.shownCells[ri] || []).forEach((s) => {
          const st = STATUS[s] || STATUS.missing;
          tr.appendChild(h('td', { class: `tone-${st.tone}` }, `${st.glyph} ${st.label}`));
        });
        tbody.appendChild(tr);
      });
      table.append(thead, tbody);
      return table;
    }

    function buildMatrixCard(data) {
      const rows = data.shownWorkers.map((w) => w.name);
      const cols = data.courses.map((c) => c.name);
      const cells = data.shownCells.map((row) => row.map((s) => (STATUS[s] || STATUS.missing).code));
      // Short course codes for the column headers (the heatmap uses them when it supports `colCodes`;
      // full names stay in `cols` for tooltips / the table twin).
      const colCodes = data.courses.map((c) => String(c.code || c.id || ''));
      const heat = rows.length && cols.length ? makeChart('heatmap', {
        rows, cols, cells, colCodes,
        colorFor: (v) => STATUS[STATUS_BY_CODE[v] || 'missing'].color,
        labelFor: (v) => STATUS[STATUS_BY_CODE[v] || 'missing'].glyph,
        // charts.js may call onCellClick(value, ri, ci) per the contract or onCellClick({value, ri, ci, row, col}); accept both.
        onCellClick: (a, b, c) => {
          const info = a && typeof a === 'object' ? a : { value: a, ri: b, ci: c };
          const ri = Number(info.ri); const ci = Number(info.ci);
          if (!Number.isInteger(ri) || !data.shownWorkers[ri]) return;
          openWorker(data, data.shownWorkers[ri], Number.isInteger(ci) && data.courses[ci] ? data.courses[ci].id : null);
        },
        cellSize: 'auto',
        ariaLabel: 'مصفوفة التدريب: حالة شهادات العمال في كل دورة تدريبية',
        rowTitle: 'العامل',
        colTitle: 'الدورة التدريبية',
      }) : null;

      const legend = h('div', { class: 'matrix-legend', role: 'list', 'aria-label': 'مفتاح الألوان' },
        ...STATUS_ORDER.map((k) => legendItem(k, data.summary[k] || 0)));

      const subtitle = data.capped
        ? `يعرض أول ${fmt.num(MATRIX_WORKER_CAP)} عاملاً من أصل ${fmt.num(data.workers.length)} — اختر موقعاً من عوامل التصفية لعرض عماله كاملاً`
        : `${fmt.num(data.workers.length)} عامل × ${fmt.num(data.courses.length)} دورات — ${siteName(data.state, data.siteId)}`;

      const body = h('div', { class: 'stack gap-3' },
        legend,
        rows.length && cols.length
          ? chartOr(heat, h('div', { class: 'matrix-scroll' }, matrixTable(data)))
          : emptyState({ title: 'لا يوجد عمال ضمن هذا النطاق', text: 'غيّر الموقع من عوامل التصفية أو تحقق من بيانات العمال.' }),
        h('p', { class: 'text-xs muted' }, 'انقر على أي خلية لعرض سجل شهادات العامل كاملاً مع تواريخ الإكمال والانتهاء.'),
      );
      // Full width: 9 course columns need the whole row for legible headers.
      return card({ code: 'TRN-01', title: 'مصفوفة التدريب', subtitle, className: 'col-span-12', body, tableView: () => matrixTable(data) });
    }

    function buildCompletionCard(data) {
      const items = data.completion.slice().sort((a, b) => b.pct - a.pct).map((c) => ({ id: c.id, label: c.label, value: c.pct }));
      const chart = items.length ? makeChart('barChart', {
        items, horizontal: true, height: Math.max(220, items.length * 30 + 24), valueFormat: (v) => fmt.pct(v), color: 'var(--s1)', showValues: true, maxBars: 12,
        ariaLabel: 'نسبة الإكمال لكل دورة تدريبية، مرتبة تنازلياً',
      }) : null;
      const fallbackTable = () => {
        const t = h('table', { class: 'table is-dense' }, h('thead', {}, h('tr', {}, h('th', { scope: 'col' }, 'الدورة'), h('th', { scope: 'col' }, 'نسبة الإكمال'), h('th', { scope: 'col' }, 'الحاصلون عليها'))));
        const tb = h('tbody');
        data.completion.slice().sort((a, b) => b.pct - a.pct).forEach((c) => tb.appendChild(h('tr', {}, h('td', {}, c.label), h('td', { class: 'num' }, fmt.pct(c.pct)), h('td', { class: 'num' }, `${fmt.num(c.holders || 0)} / ${fmt.num(c.workers || 0)}`))));
        t.appendChild(tb);
        return t;
      };
      const body = items.length
        ? h('div', { class: 'stack gap-2' },
          chartOr(chart, fallbackTable()),
          h('p', { class: 'text-xs muted' }, 'النسبة = العمال الحاصلون على شهادة سارية (أو تنتهي قريباً) ÷ إجمالي عمال النطاق.'))
        : emptyState({ title: 'لا توجد دورات مسجلة' });
      return card({ code: 'TRN-02', title: 'نسبة الإكمال لكل دورة', subtitle: 'مرتبة من الأعلى إلى الأدنى', className: 'col-span-6', body, tableView: tableOf(chart, fallbackTable) });
    }

    function buildExpiringCard(data) {
      const rows = data.expiring.map((e) => ({
        id: `${e.worker.id}-${e.course.id}`,
        worker: e.worker,
        name: e.worker.name,
        role: e.worker.role || '',
        company: e.worker.company || '',
        site: siteName(data.state, e.siteId),
        course: e.course.name,
        mandatory: !!e.course.mandatory,
        expiresAt: e.expiresAt,
        daysLeft: e.daysLeft,
        tone: e.tone || 'warning',
      }));
      const table = dataTable({
        caption: `الشهادات التي تنتهي خلال ${fmt.num(EXPIRING_WINDOW_DAYS)} يوماً`,
        pageSize: 10,
        rowKey: 'id',
        stickyFirst: true,
        emptyText: `لا توجد شهادات تنتهي خلال ${fmt.num(EXPIRING_WINDOW_DAYS)} يوماً`,
        onRowClick: (r) => openWorker(data, r.worker, null),
        initialSort: { key: 'daysLeft', dir: 'asc' },
        columns: [
          { key: 'name', label: 'العامل', priority: 'high', width: '34%', render: (r) => h('div', { class: 'stack gap-1' }, h('span', { class: 'semibold' }, r.name), h('span', { class: 'text-xs muted' }, [r.role, r.company].filter(Boolean).join(' · '))) },
          { key: 'site', label: 'الموقع', priority: 'low', width: '18%', render: (r) => h('span', { class: 'text-sm', style: { whiteSpace: 'normal' } }, r.site) },
          { key: 'course', label: 'الدورة', priority: 'high', width: '24%', render: (r) => h('div', { class: 'stack gap-1' }, h('span', {}, r.course), r.mandatory ? badge('إلزامية', 'brand') : null) },
          { key: 'expiresAt', label: 'الانتهاء', priority: 'medium', render: (r) => h('span', { class: 'nowrap' }, fmt.date(r.expiresAt)), sortValue: (r) => new Date(r.expiresAt).getTime() },
          { key: 'daysLeft', label: 'المتبقي', priority: 'high', render: (r) => badge(daysLabel(r.daysLeft), r.tone), sortValue: (r) => r.daysLeft },
        ],
        rows,
      });
      const el = card({
        code: 'TRN-03', title: `شهادات تنتهي خلال ${fmt.num(EXPIRING_WINDOW_DAYS)} يوماً`,
        subtitle: rows.length ? `${fmt.num(rows.length)} شهادة تتطلب جدولة تجديد — الأقرب أولاً` : 'لا توجد شهادات تقترب من الانتهاء',
        className: 'col-span-12',
        body: table.el,
        footer: h('div', { class: 'matrix-legend' },
          h('span', { class: 'matrix-legend-item tone-critical' }, glyph('critical', 12), h('span', {}, 'أسبوع أو أقل')),
          h('span', { class: 'matrix-legend-item tone-serious' }, glyph('serious', 12), h('span', {}, 'حتى أسبوعين')),
          h('span', { class: 'matrix-legend-item tone-warning' }, glyph('warning', 12), h('span', {}, `حتى ${fmt.num(EXPIRING_WINDOW_DAYS)} يوماً`)),
        ),
      });
      el.dataset.section = 'expiring';
      return el;
    }

    function buildDistributionCard(data) {
      const total = STATUS_ORDER.reduce((n, k) => n + (data.summary[k] || 0), 0);
      const parts = STATUS_ORDER.map((k) => ({ id: k, label: STATUS[k].label, value: data.summary[k] || 0, color: STATUS[k].color }));
      const seg = total ? makeChart('segmentedBar', { parts, tall: true, valueFormat: (v) => fmt.num(v), ariaLabel: 'توزيع حالات الشهادات: سارية، تنتهي قريباً، منتهية، غير مكتملة' }) : null;
      const list = kv(STATUS_ORDER.map((k) => [
        `${STATUS[k].glyph} ${STATUS[k].label}`,
        h('span', { class: ['row', 'gap-2', `tone-${STATUS[k].tone}`] },
          glyph(STATUS[k].tone, 12),
          h('span', { class: 'num' }, `${fmt.num(data.summary[k] || 0)} (${fmt.pct(total ? ((data.summary[k] || 0) / total) * 100 : 0)})`)),
      ]));
      list.classList.add('is-compact');

      const siteItems = data.bySite.map((s) => ({ id: s.id, label: s.label, value: s.value }));
      const siteChart = siteItems.length ? makeChart('barChart', {
        items: siteItems, horizontal: true, height: Math.max(160, siteItems.length * 30 + 16), valueFormat: (v) => fmt.pct(v), color: 'var(--s1)', showValues: true, maxBars: 12,
        ariaLabel: 'الامتثال التدريبي الإلزامي حسب الموقع',
      }) : null;

      const body = h('div', { class: 'stack gap-4' },
        total ? chartOr(seg, list) : emptyState({ title: 'لا توجد شهادات ضمن النطاق' }),
        total && seg ? list : null,
        siteItems.length ? h('div', { class: 'stack gap-2' },
          h('h3', { class: 'card-title', style: { fontSize: 'var(--fs-md)' } }, 'الامتثال الإلزامي حسب الموقع'),
          chartOr(siteChart, kv(data.bySite.map((s) => [s.label, fmt.pct(s.value)]))),
        ) : null,
      );
      const tableFn = () => {
        const t = h('table', { class: 'table is-dense' }, h('thead', {}, h('tr', {}, h('th', { scope: 'col' }, 'الحالة'), h('th', { scope: 'col' }, 'العدد'), h('th', { scope: 'col' }, 'النسبة'))));
        const tb = h('tbody');
        STATUS_ORDER.forEach((k) => tb.appendChild(h('tr', {}, h('td', {}, STATUS[k].label), h('td', { class: 'num' }, fmt.num(data.summary[k] || 0)), h('td', { class: 'num' }, fmt.pct(total ? ((data.summary[k] || 0) / total) * 100 : 0)))));
        data.bySite.forEach((s) => tb.appendChild(h('tr', {}, h('td', {}, `امتثال ${s.label}`), h('td', { class: 'num' }, fmt.num(s.workers || 0)), h('td', { class: 'num' }, fmt.pct(s.value)))));
        t.appendChild(tb);
        return t;
      };
      return card({ code: 'TRN-04', title: 'توزيع حالات الشهادات', subtitle: `${fmt.num(total)} شهادة مطلوبة ضمن النطاق`, className: 'col-span-6', body, tableView: tableFn });
    }

    function buildCatalogue(data) {
      const completionById = new Map(data.completion.map((c) => [c.id, c]));
      const cards = data.courses.map((c) => {
        const comp = completionById.get(c.id) || { pct: 0, holders: 0, workers: data.workers.length };
        const pct = Number(comp.pct) || 0;
        const tone = pct >= 90 ? 'good' : pct >= 75 ? 'warning' : 'critical';
        const bar = progress({ value: pct, max: 100, tone, label: `نسبة إكمال ${c.name}` });
        // Catalogue entries are nested list cards → plain framing (only top-level cards carry the CAD frame).
        return h('article', { class: 'card is-compact is-flat is-plain', 'aria-label': c.name },
          h('div', { class: 'card-body stack gap-3' },
            h('div', { class: 'row between gap-2' },
              h('div', { class: 'row gap-2 grow' },
                h('span', { class: 'tile-icon', 'aria-hidden': 'true' }, svgIcon(c.icon || 'graduation', 16)),
                h('div', { class: 'stack gap-1 grow' },
                  h('span', { class: 'semibold' }, c.name),
                  mono(c.code || c.id, 'text-xs muted'),
                ),
              ),
              badge(c.mandatory ? 'إلزامية' : 'اختيارية', c.mandatory ? 'brand' : 'neutral'),
            ),
            c.description ? h('p', { class: 'text-sm ink-2', style: { lineHeight: '1.55' } }, c.description) : null,
            h('div', { class: 'row wrap gap-3 text-xs muted' },
              h('span', { class: 'row gap-1' }, glyph('clock', 12), h('span', {}, `${fmt.num(c.hours || 0)} ساعات تدريبية`)),
              h('span', {}, `الصلاحية ${fmt.num(c.validityMonths || 0)} شهراً`),
              c.provider ? h('span', {}, `المزوّد: ${c.provider}`) : null,
            ),
            h('div', { class: 'progress-row' }, bar, h('span', { class: 'progress-value' }, fmt.pct(pct))),
            h('p', { class: 'text-xs muted' }, `${fmt.num(comp.holders || 0)} من ${fmt.num(comp.workers || data.workers.length)} عاملاً يحملون شهادة سارية`),
          ),
        );
      });
      return h('section', { class: 'stack gap-3', 'aria-labelledby': 'trn-catalogue-title' },
        h('div', { class: 'row between wrap' },
          h('div', { class: 'card-titles' },
            h('span', { class: 'card-code', 'aria-hidden': 'true' }, 'TRN-05'),
            h('h2', { class: 'card-title', id: 'trn-catalogue-title' }, 'دليل الدورات التدريبية'),
          ),
          h('span', { class: 'text-sm muted' }, `${fmt.num(data.courses.length)} دورات — ${fmt.num(data.courses.filter((c) => c.mandatory).length)} منها إلزامية`),
        ),
        cards.length ? h('div', { class: 'cards-grid' }, ...cards) : emptyState({ title: 'لا توجد دورات في الدليل' }),
      );
    }

    /* ───────────────────────── build ───────────────────────── */

    function build() {
      raf = 0;
      const data = collect();
      const frag = document.createDocumentFragment();
      // Rows: full-width matrix → completion + distribution (6/6, aligned to start) → full-width expiring table.
      const pairRow = h('div', { class: 'grid-12', style: { alignItems: 'start' } }, buildCompletionCard(data), buildDistributionCard(data));
      frag.append(
        buildHead(data),
        buildKpis(data),
        h('div', { class: 'grid-12' }, buildMatrixCard(data)),
        pairRow,
        h('div', { class: 'grid-12' }, buildExpiringCard(data)),
        buildCatalogue(data),
      );
      root.replaceChildren(frag);
    }

    function schedule() {
      if (raf) return;
      raf = requestAnimationFrame(build);
    }

    const RELEVANT = /^(\*|workers|courses|sites|risks|incidents)/;
    const unsubs = [
      bus.on('store:change', (payload) => { const path = payload && payload.path ? String(payload.path) : '*'; if (RELEVANT.test(path)) schedule(); }),
      bus.on('filters:change', (payload) => { const key = payload && payload.key; if (!key || key === 'siteId' || key === 'range') schedule(); }),
      bus.on('settings:change', (payload) => {
        const n = payload && payload.settings ? payload.settings.numerals : safe(() => store.state.settings.numerals, lastNumerals);
        if (n !== lastNumerals) { lastNumerals = n; schedule(); }
      }),
    ];

    build();

    return () => {
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      unsubs.forEach((u) => { try { if (typeof u === 'function') u(); } catch { /* ignore */ } });
      if (openDrawer) { try { openDrawer.close(); } catch { /* ignore */ } openDrawer = null; }
      root.remove();
    };
  },
};
