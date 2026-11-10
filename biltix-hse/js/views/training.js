/**
 * BILTIX Risk AI — HSE pillar — SEC-07 Training & competence (js/views/training.js). Owner: B-HSE2 (v3).
 *
 * Four executive metrics (compliance with its delta, expiring within 60 days, expired, workers missing a
 * mandatory course), the workers × courses training matrix (heatmap, cell → worker drawer), completion per
 * course, status distribution + mandatory compliance by project, certificates expiring within 60 days
 * (dataTable) and the course catalogue. Every figure comes from sel.* (trainingMatrix,
 * trainingCompletionByCourse, expiringCerts, kpis) — the view holds no business rule of its own.
 *
 * Bilingual (CONTRACT §4): strings from 'training' (js/i18n/training.js); course / worker / site text via
 * i18n.L(…, 'courses' | 'workers' | 'sites'). Live data changes rebuild in place without replaying the
 * entrance motion (motion.enter runs on the first render only). Deep link: #/training?worker=W1.
 */

import { i18n, t, tn } from '../core/i18n.js';
import dict from '../i18n/training.js';

i18n.register('training', dict);

const EXPIRING_WINDOW_DAYS = 60;
const SOON_DAYS = 30;          // sel.CERT_EXPIRING_DAYS
const MATRIX_WORKER_CAP = 24;

/** Cell status → ordinal heatmap code, colour, glyph, tone. Labels come from the dictionary. */
const STATUS = {
  valid:    { code: 3, color: 'var(--seq-500)', glyph: '•', tone: 'good' },
  expiring: { code: 2, color: 'var(--seq-300)', glyph: '!', tone: 'warning' },
  expired:  { code: 1, color: 'var(--critical)', glyph: '×', tone: 'critical' },
  missing:  { code: 0, color: 'var(--bg-3)', glyph: '–', tone: 'neutral' },
};
const STATUS_BY_CODE = ['missing', 'expired', 'expiring', 'valid'];
const STATUS_ORDER = ['valid', 'expiring', 'expired', 'missing'];
const INTERNAL_PROVIDERS = new Set(['بلتكس (تدريب داخلي)', 'BILTIX (in-house training)', 'بلتكس HSE', 'BILTIX HSE', 'بلتكس', 'BILTIX']);

const safe = (fn, fallback) => { try { const v = fn(); return v === undefined ? fallback : v; } catch { return fallback; } };
const statusLabel = (key) => t(`training.status.${key}`);

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

export default {
  id: 'training',
  code: 'SEC-07',
  get title() { return t('core.nav.training.title'); },
  icon: 'graduation',

  render(container, ctx) {
    const { store, bus, sel, fmt, charts, components, sources } = ctx;
    const { h, card, badge, dataTable, button, drawer, toast, emptyState, progress, svgIcon, glyph, kv, motion } = components;

    const root = h('section', { class: 'view view-training', 'aria-labelledby': 'training-title' });
    container.appendChild(root);

    let raf = 0;
    let openDrawerApi = null;
    let firstBuild = true;
    let lastNumerals = safe(() => store.state.settings.numerals, 'latn');

    /* ───────────────────────── helpers ───────────────────────── */

    const nowDate = () => (typeof store.now === 'function' ? store.now() : new Date());
    const courseName = (c) => (c ? i18n.L(c, 'name', 'courses') : '—');
    const workerName = (w) => (w ? i18n.L(w, 'name', 'workers') : '—');
    const workerRole = (w) => (w && w.role ? i18n.L(w, 'role', 'workers') : '');
    const workerCompany = (w) => (w && w.company ? i18n.L(w, 'company', 'workers') : '');
    const providerName = (c) => {
      if (!c || !c.provider) return '';
      if (INTERNAL_PROVIDERS.has(String(c.provider).trim())) return t('training.catalogue.internal');
      return i18n.L(c, 'provider', 'courses');
    };
    function scopeName(state, siteId) {
      if (!siteId || siteId === 'all') return t('training.allSites');
      const s = safe(() => sel.siteById(state, siteId), null) || (state.sites || []).find((x) => x.id === siteId);
      return s ? codeSafeDigits(fmt, i18n.L(s, 'name', 'sites')) : siteId;
    }
    function siteName(state, siteId) {
      const s = (state.sites || []).find((x) => x.id === siteId);
      return s ? codeSafeDigits(fmt, i18n.L(s, 'name', 'sites')) : '—';
    }
    function makeChart(name, opts) {
      if (!charts || typeof charts[name] !== 'function') return null;
      try { const c = charts[name](opts); return c && c.el instanceof Node ? c : null; } catch { return null; }
    }
    const chartOr = (chart, fallback) => (chart ? chart.el : (fallback || emptyState({ title: t('training.chartFallback') })));
    const tableOf = (chart, fallbackFn) => () => {
      if (chart && typeof chart.table === 'function') { const tb = safe(() => chart.table(), null); if (tb instanceof Node) return tb; }
      return fallbackFn ? fallbackFn() : h('table');
    };
    /** Relative day phrase ("in 12 days" / "خلال 12 يوماً") in the UI language. */
    const rtf = (() => { try { return new Intl.RelativeTimeFormat(fmt.locale().replace(/-ca-gregory$/, ''), { numeric: 'auto' }); } catch { return null; } })();
    const daysLabel = (days) => { try { return rtf ? rtf.format(Math.max(0, days), 'day') : fmt.num(days); } catch { return fmt.num(days); } };
    function simpleTable(caption, headers, rows) {
      const tb = h('table', { class: 'table is-dense' }, h('caption', { class: 'sr-only' }, caption),
        h('thead', {}, h('tr', {}, headers.map((x, i) => h('th', { scope: 'col', class: i > 0 ? 'align-end' : null }, x)))));
      tb.appendChild(h('tbody', {}, rows.map((r) => h('tr', {}, r.map((c, i) => (i === 0 ? h('th', { scope: 'row' }, c) : h('td', { class: 'num align-end' }, c)))))));
      return tb;
    }
    function legendItem(key, count) {
      const s = STATUS[key];
      return h('span', { class: ['matrix-legend-item', `tone-${s.tone}`], role: 'listitem' },
        h('span', { class: 'legend-key', style: { '--key': s.color, background: s.color, boxShadow: 'inset 0 0 0 1px var(--line-2)' } }),
        glyph(s.tone, 12),
        h('span', { class: 'legend-label' }, `${s.glyph} ${statusLabel(key)}`),
        count !== undefined ? h('span', { class: 'legend-value num' }, fmt.num(count)) : null);
    }
    function deltaChip(delta, goodWhen) {
      const n = Number(delta);
      if (!Number.isFinite(n)) return null;
      const d = sel.describeDelta(n, goodWhen);
      const cls = d.direction === 'flat' ? 'is-flat' : (d.good ? 'is-good' : 'is-bad');
      const arrow = d.direction === 'up' ? 'M12 19V5M5 12l7-7 7 7' : d.direction === 'down' ? 'M12 5v14M5 12l7 7 7-7' : 'M5 12h14';
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('fill', 'none'); svg.setAttribute('stroke', 'currentColor'); svg.setAttribute('stroke-width', '2'); svg.setAttribute('aria-hidden', 'true');
      const p = document.createElementNS('http://www.w3.org/2000/svg', 'path'); p.setAttribute('d', arrow); svg.appendChild(p);
      const word = d.direction === 'flat' ? t('training.metrics.flat') : (d.good ? t('training.metrics.better') : t('training.metrics.worse'));
      return h('span', { class: ['delta', cls], 'data-delta': String(n), 'data-direction': d.direction, 'data-good': String(d.good) },
        svg, h('bdi', { dir: 'ltr' }, String(fmt.signedPct(n)).replace(/[‎‏؜⁦-⁩]/g, '')),
        h('span', { class: 'sr-only' }, ` ${word}`));
    }
    function metricTile({ label, value, unit = '', tone = null, icon, helper = '', delta = null, title = '', onClick = null }) {
      const tag = onClick ? 'button' : 'div';
      return h(tag, { class: ['metric-tile', tone ? `tone-${tone}` : null, onClick ? 'is-clickable' : null], type: onClick ? 'button' : undefined, title: title || undefined, onClick: onClick || undefined },
        h('div', { class: 'metric-head' }, h('span', { class: 'metric-label' }, label), h('span', { class: 'metric-icon', 'aria-hidden': 'true' }, typeof icon === 'string' ? svgIcon(icon, 16) : icon)),
        h('div', { class: 'metric-value' }, h('span', { class: 't-metric' }, value), unit ? h('span', { class: 'metric-unit' }, unit) : null),
        h('div', { class: 'metric-foot' }, delta, helper ? h('span', { class: 'metric-helper' }, helper) : null));
    }

    /* ───────────────────────── data ───────────────────────── */

    function collect() {
      const state = store.state;
      const filters = store.filters || { siteId: 'all', range: 30, search: '' };
      const siteId = filters.siteId || 'all';
      const at = nowDate();
      const full = safe(() => sel.trainingMatrix(state, siteId, at), null) || { workers: [], courses: [], cells: [], summary: { valid: 0, expiring: 0, expired: 0, missing: 0 } };
      const workers = Array.isArray(full.workers) ? full.workers : [];
      const courses = Array.isArray(full.courses) ? full.courses : [];
      const cells = Array.isArray(full.cells) ? full.cells : [];
      const summary = full.summary || { valid: 0, expiring: 0, expired: 0, missing: 0 };
      const capped = siteId === 'all' && workers.length > MATRIX_WORKER_CAP;
      const shownWorkers = capped ? workers.slice(0, MATRIX_WORKER_CAP) : workers;
      const shownCells = capped ? cells.slice(0, MATRIX_WORKER_CAP) : cells;
      const completion = (safe(() => sel.trainingCompletionByCourse(state, filters, at), []) || []).map((c) => ({ ...c, pct: Number(c.pct) || 0 }));
      const expiring = safe(() => sel.expiringCerts(state, EXPIRING_WINDOW_DAYS, filters, at), []) || [];
      const expiringSoon = expiring.filter((e) => e.daysLeft <= SOON_DAYS).length;
      const kpis = safe(() => sel.kpis(state, filters, at), null);
      const mandatoryIdx = courses.map((c, i) => (c && c.mandatory ? i : -1)).filter((i) => i >= 0);
      const withoutMandatory = cells.filter((row) => mandatoryIdx.some((i) => row[i] === 'missing' || row[i] === 'expired')).length;
      const compliance = kpis && Number.isFinite(kpis.trainingCompliance) ? kpis.trainingCompliance : null;
      const complianceDelta = kpis && kpis.deltas && Number.isFinite(kpis.deltas.trainingCompliance) ? kpis.deltas.trainingCompliance : null;
      const bySite = siteId === 'all'
        ? (state.sites || []).map((site) => {
          const k = safe(() => sel.kpis(state, { siteId: site.id, range: filters.range || 30 }, at), null);
          const m = safe(() => sel.trainingMatrix(state, site.id, at), null);
          return { id: site.id, label: codeSafeDigits(fmt, i18n.L(site, 'name', 'sites')), value: k ? k.trainingCompliance : 0, workers: m ? m.workers.length : 0 };
        }).sort((a, b) => b.value - a.value)
        : [];
      return { state, filters, siteId, at, workers, courses, cells, summary, capped, shownWorkers, shownCells, completion, expiring, expiringSoon, kpis, withoutMandatory, compliance, complianceDelta, bySite, range: Number(filters.range) || 30 };
    }

    /* ───────────────────────── worker drawer ───────────────────────── */

    function openWorker(data, worker, focusCourseId = null) {
      if (!worker) return;
      if (openDrawerApi) { try { openDrawerApi.close(); } catch { /* ignore */ } openDrawerApi = null; }
      const matrixRow = data.workers.indexOf(worker);
      const rowCells = matrixRow >= 0 ? data.cells[matrixRow] : null;
      const rows = data.courses.map((c, ci) => {
        const certs = (worker.certs || []).filter((x) => x && x.courseId === c.id).sort((a, b) => new Date(b.expiresAt) - new Date(a.expiresAt));
        const latest = certs[0] || null;
        const status = rowCells && rowCells[ci] ? rowCells[ci] : (latest ? 'valid' : 'missing');
        return { id: c.id, course: courseName(c), mandatory: !!c.mandatory, status, completedAt: latest ? latest.completedAt : null, expiresAt: latest ? latest.expiresAt : null, focus: c.id === focusCourseId };
      });
      const table = dataTable({
        dense: true, pageSize: 0, rowKey: 'id', caption: t('training.drawer.caption', { name: workerName(worker) }),
        columns: [
          { key: 'course', label: t('training.drawer.course'), render: (r) => h('span', { class: r.focus ? 'semibold' : null }, r.course) },
          { key: 'mandatory', label: t('training.drawer.kind'), render: (r) => badge(r.mandatory ? t('training.expiring.mandatory') : t('training.expiring.optional'), r.mandatory ? 'brand' : 'neutral'), sortValue: (r) => (r.mandatory ? 0 : 1) },
          { key: 'status', label: t('training.drawer.status'), render: (r) => badge(statusLabel(r.status), STATUS[r.status].tone), sortValue: (r) => STATUS[r.status].code },
          { key: 'completedAt', label: t('training.drawer.completed'), render: (r) => h('span', { class: 'nowrap' }, r.completedAt ? fmt.date(r.completedAt) : '—') },
          { key: 'expiresAt', label: t('training.drawer.expires'), render: (r) => h('span', { class: 'nowrap' }, r.expiresAt ? fmt.date(r.expiresAt) : '—') },
        ],
        rows,
      });
      const body = h('div', { class: 'stack gap-4' },
        kv([
          [t('training.drawer.role'), workerRole(worker) || '—'],
          [t('training.drawer.company'), workerCompany(worker) || '—'],
          [t('training.drawer.site'), siteName(data.state, worker.siteId)],
          [t('training.drawer.id'), h('span', { class: 'code' }, worker.badge || worker.id)],
        ]),
        h('div', { class: 'matrix-legend', role: 'list', 'aria-label': t('training.matrix.legend') }, ...STATUS_ORDER.map((k) => legendItem(k, rows.filter((r) => r.status === k).length))),
        table.el,
        h('p', { class: 't-helper' }, t('training.drawer.note', { days: fmt.num(SOON_DAYS) })));
      openDrawerApi = drawer({ title: workerName(worker), subtitle: t('training.drawer.sub'), body, size: 'lg', kind: 'worker', onClose: () => { openDrawerApi = null; } });
      openDrawerApi.open();
    }

    /* ───────────────────────── sections ───────────────────────── */

    function exportExpiring(data) {
      const rows = data.expiring.map((e) => ({
        worker: workerName(e.worker), role: workerRole(e.worker), company: workerCompany(e.worker), site: siteName(data.state, e.siteId),
        course: courseName(e.course), expiresAt: e.expiresAt, daysLeft: e.daysLeft,
      }));
      const columns = ['worker', 'role', 'company', 'site', 'course', 'expiresAt', 'daysLeft'].map((key) => ({ key, label: t(`training.csv.${key}`) }));
      if (!rows.length) { toast(t('training.csv.none', { days: fmt.num(EXPIRING_WINDOW_DAYS) }), { tone: 'neutral' }); return; }
      try {
        if (!sources || typeof sources.exportCSV !== 'function') throw new Error('export unavailable');
        sources.exportCSV(rows, columns, `biltix-risk-ai-expiring-certificates-${data.at.toISOString().slice(0, 10)}.csv`);
        toast(tn('training.csv.done', rows.length), { tone: 'good' });
      } catch {
        toast(t('training.csv.failed'), { tone: 'critical' });
      }
    }

    function buildHead(data) {
      return h('header', { class: 'view-head' },
        h('div', { class: 'view-head-text' },
          h('span', { class: 'code-tag' }, 'SEC-07'),
          h('h1', { id: 'training-title', class: 't-page', tabindex: '-1' }, t('core.nav.training.title')),
          h('p', { class: 'view-lead' }, t('training.lead', { scope: scopeName(data.state, data.siteId), days: fmt.num(EXPIRING_WINDOW_DAYS) }))),
        h('div', { class: 'view-actions' }, button(t('training.export'), { variant: 'outline', size: 'sm', icon: svgIcon('download', 16), onClick: () => exportExpiring(data) })));
    }

    function buildKpis(data) {
      const c = data.compliance;
      const tone = c === null ? null : c >= 90 ? 'good' : c >= 75 ? 'warning' : 'critical';
      const pctSign = fmt.getNumerals() === 'arab' ? '٪' : '%';
      return h('div', { class: 'metric-grid', role: 'group', 'aria-label': t('training.metrics.label') },
        metricTile({ label: t('training.metrics.compliance'), value: c === null ? '—' : fmt.num(c), unit: c === null ? '' : pctSign, tone, icon: 'graduation', title: t('training.metrics.complianceHint'), delta: deltaChip(data.complianceDelta, 'up'), helper: t('training.metrics.complianceHelper', { days: tn('training.metrics.days', data.range) }) }),
        metricTile({ label: t('training.metrics.expiring', { days: fmt.num(EXPIRING_WINDOW_DAYS) }), value: fmt.num(data.expiring.length), tone: data.expiring.length ? 'warning' : 'good', icon: glyph('clock', 16), helper: tn('training.metrics.expiringHelper', data.expiringSoon, { days: fmt.num(SOON_DAYS) }), onClick: () => { const el = root.querySelector('[data-section="expiring"]'); if (el) el.scrollIntoView({ behavior: motion.enabled() ? 'smooth' : 'auto', block: 'start' }); } }),
        metricTile({ label: t('training.metrics.expired'), value: fmt.num(data.summary.expired || 0), tone: (data.summary.expired || 0) ? 'critical' : 'good', icon: glyph('critical', 16), helper: t('training.metrics.expiredHelper') }),
        metricTile({ label: t('training.metrics.missing'), value: fmt.num(data.withoutMandatory), tone: data.withoutMandatory ? 'serious' : 'good', icon: 'body', helper: tn('training.metrics.missingHelper', data.workers.length) }));
    }

    function matrixTable(data) {
      const tb = h('table', { class: 'table is-dense' }, h('caption', { class: 'sr-only' }, t('training.matrix.caption')));
      const hr = h('tr', {}, h('th', { scope: 'col' }, t('training.matrix.worker')));
      data.courses.forEach((c) => hr.appendChild(h('th', { scope: 'col' }, courseName(c))));
      tb.appendChild(h('thead', {}, hr));
      const tbody = h('tbody');
      data.shownWorkers.forEach((w, ri) => {
        const tr = h('tr', {}, h('th', { scope: 'row' }, workerName(w)));
        (data.shownCells[ri] || []).forEach((s) => { const st = STATUS[s] || STATUS.missing; tr.appendChild(h('td', { class: `tone-${st.tone}` }, `${st.glyph} ${statusLabel(s in STATUS ? s : 'missing')}`)); });
        tbody.appendChild(tr);
      });
      tb.appendChild(tbody);
      return tb;
    }

    function buildMatrixCard(data) {
      const rows = data.shownWorkers.map(workerName);
      const cols = data.courses.map(courseName);
      const cells = data.shownCells.map((row) => row.map((s) => (STATUS[s] || STATUS.missing).code));
      const heat = rows.length && cols.length ? makeChart('heatmap', {
        rows, cols, cells,
        colorFor: (v) => STATUS[STATUS_BY_CODE[v] || 'missing'].color,
        labelFor: (v) => STATUS[STATUS_BY_CODE[v] || 'missing'].glyph,
        onCellClick: (info) => {
          const ri = Number(info && info.ri); const ci = Number(info && info.ci);
          if (!Number.isInteger(ri) || !data.shownWorkers[ri]) return;
          openWorker(data, data.shownWorkers[ri], Number.isInteger(ci) && data.courses[ci] ? data.courses[ci].id : null);
        },
        cellSize: 'auto', maxCell: 38, ariaLabel: t('training.matrix.aria'), rowTitle: t('training.matrix.rowTitle'), colTitle: t('training.matrix.colTitle'),
      }) : null;
      const subtitle = data.capped
        ? t('training.matrix.subCapped', { shown: fmt.num(MATRIX_WORKER_CAP), total: fmt.num(data.workers.length) })
        : t('training.matrix.subAll', { workers: tn('training.matrix.workers', data.workers.length), courses: tn('training.matrix.courses', data.courses.length), scope: scopeName(data.state, data.siteId) });
      const body = h('div', { class: 'stack gap-3' },
        h('div', { class: 'matrix-legend', role: 'list', 'aria-label': t('training.matrix.legend') }, ...STATUS_ORDER.map((k) => legendItem(k, data.summary[k] || 0))),
        rows.length && cols.length
          ? chartOr(heat, h('div', { class: 'table-wrap' }, matrixTable(data)))
          : emptyState({ title: t('training.matrix.emptyTitle'), text: t('training.matrix.emptyText') }),
        rows.length ? h('p', { class: 't-helper' }, t('training.matrix.hint')) : null);
      return card({ code: 'TRN-01', title: t('training.matrix.title'), subtitle, className: 'col-span-12', body, tableView: () => matrixTable(data) });
    }

    function buildCompletionCard(data) {
      const sorted = data.completion.slice().sort((a, b) => b.pct - a.pct);
      const label = (c) => courseName((data.courses.find((x) => x.id === c.id)) || { id: c.id, name: c.label });
      const items = sorted.map((c) => ({ id: c.id, label: label(c), value: c.pct }));
      const chart = items.length ? makeChart('barChart', {
        items, horizontal: true, height: Math.max(220, items.length * 30 + 24), valueFormat: (v) => fmt.pct(v), color: 'var(--s1)', showValues: true, maxBars: 12, ariaLabel: t('training.completion.aria'),
      }) : null;
      const fallbackTable = () => simpleTable(t('training.completion.caption'), [t('training.completion.course'), t('training.completion.pct'), t('training.completion.holders')],
        sorted.map((c) => [label(c), fmt.pct(c.pct), h('span', { dir: 'ltr' }, `${fmt.num(c.holders || 0)} / ${fmt.num(c.workers || 0)}`)]));
      const body = items.length
        ? h('div', { class: 'stack gap-2' }, chartOr(chart, fallbackTable()), h('p', { class: 't-helper' }, t('training.completion.note')))
        : emptyState({ title: t('training.completion.empty') });
      return card({ code: 'TRN-02', title: t('training.completion.title'), subtitle: t('training.completion.sub'), className: 'col-span-6', body, tableView: tableOf(chart, fallbackTable) });
    }

    function buildDistributionCard(data) {
      const total = STATUS_ORDER.reduce((n, k) => n + (data.summary[k] || 0), 0);
      const share = (k) => fmt.pct(total ? ((data.summary[k] || 0) / total) * 100 : 0);
      const parts = STATUS_ORDER.map((k) => ({ id: k, label: statusLabel(k), value: data.summary[k] || 0, color: STATUS[k].color }));
      const seg = total ? makeChart('segmentedBar', { parts, tall: true, valueFormat: (v) => fmt.num(v), ariaLabel: t('training.distribution.aria') }) : null;
      const listEl = kv(STATUS_ORDER.map((k) => [
        `${STATUS[k].glyph} ${statusLabel(k)}`,
        h('span', { class: ['row', 'gap-2', `tone-${STATUS[k].tone}`] }, glyph(STATUS[k].tone, 12), h('span', { class: 'num' }, `${fmt.num(data.summary[k] || 0)} (${share(k)})`)),
      ]));
      listEl.classList.add('is-compact');
      const siteItems = data.bySite.map((s) => ({ id: s.id, label: s.label.split(/\s+[—–]\s+/)[0], value: s.value }));
      const siteChart = siteItems.length ? makeChart('barChart', {
        items: siteItems, horizontal: true, height: Math.max(160, siteItems.length * 30 + 16), valueFormat: (v) => fmt.pct(v), color: 'var(--s1)', showValues: true, maxBars: 12, ariaLabel: t('training.distribution.bySiteAria'),
      }) : null;
      const body = h('div', { class: 'stack gap-4' },
        total ? chartOr(seg, listEl) : emptyState({ title: t('training.distribution.empty') }),
        total && seg ? listEl : null,
        siteItems.length ? h('div', { class: 'stack gap-2' }, h('h3', { class: 't-label' }, t('training.distribution.bySite')), chartOr(siteChart, kv(data.bySite.map((s) => [s.label, fmt.pct(s.value)])))) : null);
      const tableFn = () => simpleTable(t('training.distribution.caption'), [t('training.distribution.status'), t('training.distribution.count'), t('training.distribution.share')], [
        ...STATUS_ORDER.map((k) => [statusLabel(k), fmt.num(data.summary[k] || 0), share(k)]),
        ...data.bySite.map((s) => [t('training.distribution.siteRow', { site: s.label }), fmt.num(s.workers || 0), fmt.pct(s.value)]),
      ]);
      return card({ code: 'TRN-04', title: t('training.distribution.title'), subtitle: tn('training.distribution.sub', total), className: 'col-span-6', body, tableView: tableFn });
    }

    function buildExpiringCard(data) {
      const rows = data.expiring.map((e) => ({
        id: `${e.worker.id}-${e.course.id}`, worker: e.worker, name: workerName(e.worker), role: workerRole(e.worker), company: workerCompany(e.worker),
        site: siteName(data.state, e.siteId), course: courseName(e.course), mandatory: !!e.course.mandatory, expiresAt: e.expiresAt, daysLeft: e.daysLeft, tone: e.tone || 'warning',
      }));
      const table = dataTable({
        caption: t('training.expiring.caption', { days: fmt.num(EXPIRING_WINDOW_DAYS) }), pageSize: 10, rowKey: 'id', stickyFirst: true,
        emptyText: t('training.expiring.empty', { days: fmt.num(EXPIRING_WINDOW_DAYS) }),
        onRowClick: (r) => openWorker(data, r.worker, null),
        rowLabel: (r) => t('training.expiring.open', { name: r.name }),
        initialSort: { key: 'daysLeft', dir: 'asc' },
        columns: [
          { key: 'name', label: t('training.expiring.worker'), priority: 'high', width: '32%', render: (r) => h('div', { class: 'stack gap-1' }, h('span', { class: 'cell-title' }, r.name), h('span', { class: 'cell-sub' }, [r.role, r.company].filter(Boolean).join(' · '))) },
          { key: 'site', label: t('training.expiring.site'), priority: 'low', width: '18%', render: (r) => h('span', { style: { whiteSpace: 'normal' } }, r.site) },
          { key: 'course', label: t('training.expiring.course'), priority: 'high', width: '24%', render: (r) => h('div', { class: 'stack gap-1' }, h('span', {}, r.course), r.mandatory ? badge(t('training.expiring.mandatory'), 'brand') : null) },
          { key: 'expiresAt', label: t('training.expiring.expires'), priority: 'medium', render: (r) => h('span', { class: 'nowrap' }, fmt.date(r.expiresAt)), sortValue: (r) => new Date(r.expiresAt).getTime() },
          { key: 'daysLeft', label: t('training.expiring.left'), priority: 'high', render: (r) => badge(daysLabel(r.daysLeft), r.tone), sortValue: (r) => r.daysLeft },
        ],
        rows,
      });
      const el = card({
        code: 'TRN-03', title: t('training.expiring.title', { days: fmt.num(EXPIRING_WINDOW_DAYS) }), subtitle: tn('training.expiring.sub', rows.length), className: 'col-span-12',
        body: table.el,
        footer: h('div', { class: 'matrix-legend' },
          h('span', { class: 'matrix-legend-item tone-critical' }, glyph('critical', 12), h('span', {}, t('training.expiring.week'))),
          h('span', { class: 'matrix-legend-item tone-serious' }, glyph('serious', 12), h('span', {}, t('training.expiring.twoWeeks'))),
          h('span', { class: 'matrix-legend-item tone-warning' }, glyph('warning', 12), h('span', {}, t('training.expiring.window', { days: fmt.num(EXPIRING_WINDOW_DAYS) })))),
      });
      el.dataset.section = 'expiring';
      el.style.scrollMarginBlockStart = '96px';
      return el;
    }

    function buildCatalogue(data) {
      const completionById = new Map(data.completion.map((c) => [c.id, c]));
      const cards = data.courses.map((c) => {
        const comp = completionById.get(c.id) || { pct: 0, holders: 0, workers: data.workers.length };
        const pct = Number(comp.pct) || 0;
        const tone = pct >= 90 ? 'good' : pct >= 75 ? 'warning' : 'critical';
        const name = courseName(c);
        const titleId = `trn-course-${c.id}`;
        const provider = providerName(c);
        return h('article', { class: 'card is-compact is-flat is-plain', role: 'listitem', 'aria-labelledby': titleId },
          h('div', { class: 'card-body stack gap-3' },
            h('div', { class: 'row between gap-2' },
              h('div', { class: 'row gap-2 grow' },
                h('span', { class: 'metric-icon', 'aria-hidden': 'true' }, svgIcon(c.icon || 'graduation', 16)),
                h('div', { class: 'stack gap-1 grow' }, h('h3', { class: 't-card', id: titleId, style: { fontSize: 'var(--fs-md)' } }, name), h('span', { class: 'code text-xs muted' }, c.code || c.id))),
              badge(c.mandatory ? t('training.expiring.mandatory') : t('training.expiring.optional'), c.mandatory ? 'brand' : 'neutral')),
            c.description ? h('p', { class: 't-helper', style: { lineHeight: '1.55' } }, i18n.L(c, 'description', 'courses')) : null,
            h('div', { class: 'row wrap gap-3 t-helper' },
              h('span', { class: 'row gap-1' }, glyph('clock', 12), h('span', {}, tn('training.catalogue.hours', Number(c.hours) || 0))),
              h('span', {}, tn('training.catalogue.validity', Number(c.validityMonths) || 0)),
              provider ? h('span', {}, t('training.catalogue.provider', { name: provider })) : null),
            h('div', { class: 'progress-row' }, progress({ value: pct, max: 100, tone, label: t('training.catalogue.progressAria', { name }) }), h('span', { class: 'progress-value num' }, fmt.pct(pct))),
            h('p', { class: 't-helper' }, t('training.catalogue.holders', { holders: fmt.num(comp.holders || 0), workers: fmt.num(comp.workers || data.workers.length) }))));
      });
      const mandatory = data.courses.filter((c) => c.mandatory).length;
      return h('section', { class: 'view-section', 'aria-labelledby': 'trn-catalogue-title' },
        h('div', { class: 'view-section-head' },
          h('div', { class: 'card-titles' },
            h('span', { class: 'card-code', 'aria-hidden': 'true' }, 'TRN-05'),
            h('div', { class: 'card-title-wrap' },
              h('h2', { class: 't-section', id: 'trn-catalogue-title' }, t('training.catalogue.title')),
              h('p', { class: 'card-sub' }, t('training.catalogue.sub', { courses: tn('training.matrix.courses', data.courses.length), mandatory: tn('training.catalogue.mandatoryCount', mandatory) }))))),
        cards.length ? h('div', { class: 'cards-grid', role: 'list' }, ...cards) : emptyState({ title: t('training.catalogue.empty') }));
    }

    /* ───────────────────────── build ───────────────────────── */

    let lastData = null;
    function build() {
      raf = 0;
      const scrollY = typeof window !== 'undefined' ? window.scrollY : 0;
      const data = collect();
      lastData = data;
      const kpis = buildKpis(data);
      const matrixRow = h('div', { class: 'grid-12' }, buildMatrixCard(data));
      const pairRow = h('div', { class: 'grid-12', style: { alignItems: 'start' } }, buildCompletionCard(data), buildDistributionCard(data));
      const expRow = h('div', { class: 'grid-12' }, buildExpiringCard(data));
      const catalogue = buildCatalogue(data);
      root.replaceChildren(buildHead(data), kpis, matrixRow, pairRow, expRow, catalogue);
      if (firstBuild) {
        firstBuild = false;
        motion.enter(kpis.children, { y: 8 });
        motion.enter([matrixRow, pairRow, expRow, catalogue], { y: 10, delay: 0.08 });
      } else if (typeof window !== 'undefined' && Math.abs(window.scrollY - scrollY) > 1) {
        window.scrollTo({ top: scrollY });
      }
    }
    const schedule = () => { if (!raf) raf = requestAnimationFrame(build); };

    const RELEVANT = /^(\*|workers|courses|sites)(\.|$)/;
    const unsubs = [
      bus.on('store:change', (payload) => { const path = payload && payload.path ? String(payload.path) : '*'; if (RELEVANT.test(path)) schedule(); }),
      bus.on('filters:change', (payload) => { const key = payload && payload.key; if (!key || key === 'siteId' || key === 'range') schedule(); }),
      bus.on('settings:change', (payload) => {
        const n = payload && payload.settings ? payload.settings.numerals : safe(() => store.state.settings.numerals, lastNumerals);
        if (n !== lastNumerals) { lastNumerals = n; schedule(); }
      }),
    ];

    build();

    const params = (ctx && ctx.params) || {};
    if (params.worker) {
      requestAnimationFrame(() => {
        const w = lastData && lastData.workers.find((x) => x.id === params.worker);
        if (w) openWorker(lastData, w, null);
      });
    }

    return () => {
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      unsubs.forEach((u) => { try { if (typeof u === 'function') u(); } catch { /* ignore */ } });
      if (openDrawerApi) { try { openDrawerApi.close(); } catch { /* ignore */ } openDrawerApi = null; }
      root.remove();
    };
  },
};
