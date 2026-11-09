/**
 * Biltix HSE — SEC-03 سجل المخاطر (js/views/risks.js)
 *
 * The risk register: toolbar (category chips with icons, status + tier selects, add
 * button), a sortable dense data table, a detail drawer (hierarchy of controls as a
 * stepped list, inherent vs. residual bars, history timeline, status change / edit /
 * delete), an add/edit modal built from components.formField, and a side column with a
 * mini 5×5 matrix and ranked category bars.
 *
 * Global filters (site / range / search) apply through sel.filteredRisks together with
 * the view-local category / status / tier filters (the selector understands those keys).
 * Route params: ?new=1 opens the add modal, ?tier=X preselects the tier filter,
 * ?id=R12 opens the detail drawer.
 *
 * Contract: docs/ARCHITECTURE.md §3 (risk schema), §4 (store.addRisk/updateRisk/deleteRisk,
 * components), §5 (charts.heatmap / barChart), §8.3.
 */

import * as seedMod from '../data/seed.js';

const DAY_MS = 86_400_000;
const SVG_NS = 'http://www.w3.org/2000/svg';
const CLOSED = 'مغلق';
const USER = 'مدير السلامة والصحة المهنية';

const FALLBACK_CATEGORIES = [
  { id: 'height', name: 'العمل على ارتفاعات', icon: 'height' },
  { id: 'excavation', name: 'الحفريات والخنادق', icon: 'excavation' },
  { id: 'lifting', name: 'الرافعات وعمليات الرفع', icon: 'crane' },
  { id: 'electrical', name: 'الكهرباء', icon: 'bolt' },
  { id: 'confined', name: 'الأماكن المغلقة', icon: 'confined' },
  { id: 'hotwork', name: 'الأعمال الساخنة', icon: 'flame' },
  { id: 'heat', name: 'الإجهاد الحراري', icon: 'sun' },
  { id: 'chemical', name: 'المواد الكيميائية والغبار', icon: 'flask' },
  { id: 'traffic', name: 'المركبات وحركة المرور', icon: 'truck' },
  { id: 'scaffold', name: 'السقالات والأعمال المؤقتة', icon: 'scaffold' },
  { id: 'structural', name: 'الانهيارات الإنشائية', icon: 'structure' },
  { id: 'ergonomic', name: 'المناولة اليدوية والإرجونوميكس', icon: 'body' },
];
const FALLBACK_RISK_STATUS = ['مفتوح', 'قيد المعالجة', 'مُسيطر عليه', 'مغلق'];
const FALLBACK_CONTROL_TYPES = ['إلغاء', 'استبدال', 'ضوابط هندسية', 'ضوابط إدارية', 'معدات الوقاية الشخصية'];
const TIERS = [
  { tier: 'حرج', tone: 'critical' },
  { tier: 'عالٍ', tone: 'serious' },
  { tier: 'متوسط', tone: 'warning' },
  { tier: 'منخفض', tone: 'good' },
];
const STATUS_TONE = { 'مفتوح': 'serious', 'قيد المعالجة': 'warning', 'مُسيطر عليه': 'good', 'مغلق': 'neutral' };
const LIKELIHOOD_LABELS = ['نادر', 'غير محتمل', 'محتمل', 'مرجّح', 'شبه مؤكد'];
const SEVERITY_LABELS = ['طفيف', 'بسيط', 'متوسط', 'جسيم', 'كارثي'];
const HIERARCHY_HINT = {
  'إلغاء': 'إزالة الخطر من المصدر نهائيًا',
  'استبدال': 'استبدال الخطر بعملية أو مادة أقل خطورة',
  'ضوابط هندسية': 'عزل الأشخاص عن الخطر بوسائل مادية',
  'ضوابط إدارية': 'تغيير طريقة العمل: إجراءات، تدريب، إشراف، تصاريح',
  'معدات الوقاية الشخصية': 'خط الدفاع الأخير لحماية العامل',
};

const ICONS = {
  plus: ['M12 5v14', 'M5 12h14'],
  pencil: ['M4 20h4L18.5 9.5a2.1 2.1 0 0 0-3-3L5 17v3z', 'M13.5 6.5l3 3'],
  trash: ['M4 7h16', 'M10 11v6', 'M14 11v6', 'M6 7l1 13h10l1-13', 'M9 7V4h6v3'],
  check: ['M5 12.5l4.5 4.5L19 7.5'],
  close: ['M6 6l12 12', 'M18 6L6 18'],
  clock: ['c:12,12,9', 'M12 7v5l3 2'],
  warning: ['M12 3.5l9 16H3l9-16z', 'M12 10v4', 'M12 17.2h.01'],
  filter: ['M4 5h16l-6 7v6l-4 2v-8z'],
  layers: ['M12 3l9 5-9 5-9-5 9-5z', 'M3 13l9 5 9-5'],
  'shield-alert': ['M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z', 'M12 8v5', 'M12 16h.01'],
  site: ['M4 20h16', 'M6 20V8l6-4 6 4v12', 'M10 20v-5h4v5'],
  user: ['c:12,8,4', 'M4 21a8 8 0 0 1 16 0'],
  calendar: ['M4 6h16v14H4z', 'M4 10h16', 'M8 3v4', 'M16 3v4'],
  history: ['M3 12a9 9 0 1 0 3-6.7', 'M3 4v5h5', 'M12 8v4l3 2'],
  height: ['M12 3v18', 'M8 7l4-4 4 4', 'M8 17l4 4 4-4'],
  excavation: ['M3 20h18', 'M5 20l4-9h6l4 9', 'M12 11V4'],
  crane: ['M4 21h16', 'M7 21V5h12', 'M7 9h9', 'M16 5v6', 'M16 11l-2 2h4z'],
  bolt: ['M13 2L4 14h7l-1 8 9-12h-7z'],
  confined: ['M4 4h16v16H4z', 'M9 12h6', 'M12 9v6'],
  flame: ['M12 3c2 4 6 6 6 11a6 6 0 0 1-12 0c0-3 2-5 3-6 0 2 1 3 2 3 0-3 1-6 1-8z'],
  sun: ['c:12,12,4', 'M12 2v2', 'M12 20v2', 'M4.9 4.9l1.4 1.4', 'M17.7 17.7l1.4 1.4', 'M2 12h2', 'M20 12h2', 'M4.9 19.1l1.4-1.4', 'M17.7 6.3l1.4-1.4'],
  flask: ['M9 3h6', 'M10 3v6L4 20h16l-6-11V3'],
  truck: ['M3 7h11v9H3z', 'M14 10h4l3 3v3h-7z', 'c:7,18,1.8', 'c:17,18,1.8'],
  scaffold: ['M5 3v18', 'M19 3v18', 'M5 8h14', 'M5 14h14', 'M5 8l14 6', 'M19 8L5 14'],
  structure: ['M4 21h16', 'M6 21V9l6-5 6 5v12', 'M9 21v-6h6v6'],
  body: ['c:12,5,2', 'M12 7v6', 'M8 10h8', 'M12 13l-3 7', 'M12 13l3 7'],
};

function localIcon(name, size) {
  const spec = ICONS[name];
  if (!spec) return null;
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  spec.forEach((d) => {
    if (d.startsWith('c:')) {
      const [cx, cy, r] = d.slice(2).split(',').map(Number);
      const c = document.createElementNS(SVG_NS, 'circle');
      c.setAttribute('cx', String(cx)); c.setAttribute('cy', String(cy)); c.setAttribute('r', String(r));
      svg.appendChild(c);
    } else {
      const p = document.createElementNS(SVG_NS, 'path');
      p.setAttribute('d', d);
      svg.appendChild(p);
    }
  });
  return svg;
}

const arr = (v) => (Array.isArray(v) ? v : []);
const enumOf = (key, fallback) => (Array.isArray(seedMod[key]) && seedMod[key].length ? seedMod[key] : fallback);
const categories = () => enumOf('CATEGORIES', FALLBACK_CATEGORIES);
const riskStatuses = () => enumOf('RISK_STATUS', FALLBACK_RISK_STATUS);
const controlTypes = () => enumOf('CONTROL_TYPES', FALLBACK_CONTROL_TYPES);
const categoryById = (id) => categories().find((c) => c.id === id) || { id, name: '—', icon: 'layers' };

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
function dayWord(n) {
  if (n === 1) return 'يوم';
  if (n === 2) return 'يومين';
  if (n <= 10) return 'أيام';
  return 'يومًا';
}

export default {
  id: 'risks',
  code: 'SEC-03',
  title: 'سجل المخاطر',
  icon: 'shield-alert',

  render(container, ctx) {
    const { store, bus, sel, fmt, charts, router, art } = ctx;
    const C = ctx.components || {};
    const { h } = C;
    const params = ctx.params || {};

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
      try { node = art && typeof art.icon === 'function' ? art.icon(name, size) : null; } catch { node = null; }
      if (!(node instanceof Node)) node = localIcon(name, size) || C.glyph('neutral', size);
      node.setAttribute('width', String(size));
      node.setAttribute('height', String(size));
      node.setAttribute('aria-hidden', 'true');
      node.setAttribute('focusable', 'false');
      node.classList.add('icon');
      return node;
    };
    const tryEl = (fn, label) => {
      try { const r = fn(); const el = r instanceof Node ? r : r && r.el; return el instanceof Node ? el : null; } catch (err) { warn(`chart:${label}`, err); return null; }
    };
    const chartOrEmpty = (fn, label) => tryEl(fn, label) || C.emptyState({ title: 'تعذر رسم المخطط', text: label });
    const state = () => store.state || {};
    const globalFilters = () => ({ siteId: 'all', range: 30, search: '', ...(store.filters || (store.state && store.state.filters) || {}) });
    const sites = () => arr(state().sites);
    const siteById = (id) => sites().find((s) => s.id === id) || null;
    const siteName = (id) => { const s = siteById(id); return s ? s.name : '—'; };
    const now = () => (typeof store.now === 'function' ? store.now() : new Date());
    const todayStart = () => { const d = now(); return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime(); };
    const score = (r) => safe(() => sel.riskScore(r), (Number(r.likelihood) || 0) * (Number(r.severity) || 0), 'riskScore');
    const residual = (r) => safe(() => (typeof sel.residualScore === 'function' ? sel.residualScore(r) : undefined),
      (Number(r.residualLikelihood ?? r.likelihood) || 0) * (Number(r.residualSeverity ?? r.severity) || 0), 'residualScore');
    const tierOf = (s) => safe(() => sel.riskTier(s), 'منخفض', 'riskTier');
    const toneOf = (tier) => safe(() => sel.tierTone(tier), 'good', 'tierTone');
    const findRisk = (id) => arr(state().risks).find((r) => r && r.id === id) || null;
    const isOverdue = (r) => { const ms = parseMs(r.dueDate); return r.status !== CLOSED && Number.isFinite(ms) && ms < todayStart(); };

    function simpleTable(caption, headers, rows, numeric = []) {
      const table = h('table', { class: 'chart-table' });
      table.appendChild(h('caption', {}, caption));
      table.appendChild(h('thead', {}, h('tr', {}, headers.map((label, i) => h('th', { scope: 'col', class: numeric[i] ? 'num' : null }, label)))));
      table.appendChild(h('tbody', {}, rows.length
        ? rows.map((r) => h('tr', {}, r.map((cell, i) => h('td', { class: numeric[i] ? 'num' : null }, cell))))
        : h('tr', {}, h('td', { colspan: String(headers.length), class: 'muted' }, 'لا توجد بيانات'))));
      return table;
    }
    function toneLegend(items, cls = 'matrix-legend') {
      return h('ul', { class: cls, role: 'list', 'aria-label': 'دليل الألوان' }, items.map((it) => h('li', { class: [`${cls}-item`, `tone-${it.tone}`] },
        C.glyph(it.tone, 12), h('span', { class: 'legend-key' }), h('span', {}, it.count === undefined ? it.label : `${it.label} · ${fmt.num(it.count)}`))));
    }
    function cellArgs(args) {
      const a = args[0];
      if (a && typeof a === 'object' && !(a instanceof Event)) {
        return { value: a.value, ri: Number(a.ri ?? a.row ?? a.r ?? 0), ci: Number(a.ci ?? a.col ?? a.c ?? 0) };
      }
      return { value: a, ri: Number(args[1]) || 0, ci: Number(args[2]) || 0 };
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

    /* view-local filters */
    const validTier = TIERS.some((t) => t.tier === params.tier) ? params.tier : 'all';
    const local = { categoryId: 'all', status: 'all', tier: validTier };
    const effectiveFilters = (overrides = {}) => ({ ...globalFilters(), categoryId: local.categoryId, status: local.status, tier: local.tier, ...overrides });
    const filteredRows = (overrides) => safe(() => sel.filteredRisks(state(), effectiveFilters(overrides)), [], 'filteredRisks').filter(Boolean);

    /* ───────────── view head ───────────── */
    const root = h('section', { class: 'view view-risks' });
    const headCount = C.badge('', 'neutral', { icon: ico('shield-alert', 14) });
    root.appendChild(h('div', { class: 'view-head' },
      h('div', { class: 'view-head-text' },
        h('span', { class: 'code-tag' }, 'SEC-03'),
        h('h1', { tabindex: '-1' }, 'سجل المخاطر'),
        h('p', { class: 'view-lead' }, 'تقييم المخاطر المهنية لكل موقع: الاحتمالية × الشدة، هرمية الضوابط، الدرجة المتبقية بعد المعالجة، والمالك المسؤول وموعد الاستحقاق. يُحفظ كل تعديل محليًا فورًا.')),
      h('div', { class: 'view-actions' },
        headCount,
        C.button('إضافة مخاطرة', { variant: 'primary', size: 'sm', icon: ico('plus', 14), onClick: () => openRiskModal(null) }))));

    /* ───────────── toolbar ───────────── */
    const chipGroup = h('div', { class: 'chip-group', role: 'group', 'aria-label': 'تصفية حسب فئة الخطر' });
    const statusSelect = h('select', { class: 'field-control', 'aria-label': 'تصفية حسب الحالة', onChange: (e) => { local.status = e.target.value; schedule(); } },
      h('option', { value: 'all' }, 'كل الحالات'), ...riskStatuses().map((s) => h('option', { value: s }, s)));
    const tierSelect = h('select', { class: 'field-control', 'aria-label': 'تصفية حسب الدرجة', onChange: (e) => { local.tier = e.target.value; schedule(); } },
      h('option', { value: 'all' }, 'كل الدرجات'), ...TIERS.map((t) => h('option', { value: t.tier }, t.tier)));
    tierSelect.value = local.tier;
    const resultCount = h('span', { class: 'text-sm ink-2 nowrap' });
    const clearBtn = C.button('مسح المرشّحات', { variant: 'ghost', size: 'sm', icon: ico('close', 14), onClick: () => { local.categoryId = 'all'; local.status = 'all'; local.tier = 'all'; statusSelect.value = 'all'; tierSelect.value = 'all'; schedule(); } });
    const toolbar = h('div', { class: 'stack gap-3' },
      chipGroup,
      h('div', { class: 'toolbar' },
        h('div', { class: 'row gap-2' }, h('span', { class: 'filters-label' }, 'الحالة'), statusSelect),
        h('div', { class: 'row gap-2' }, h('span', { class: 'filters-label' }, 'الدرجة'), tierSelect),
        clearBtn,
        h('div', { class: 'toolbar-spacer' }),
        resultCount));

    /* ───────────── table ───────────── */
    const tableHost = h('div');
    const registerCard = C.card({
      code: 'REG-01', title: 'السجل', subtitle: 'انقر صفًا لعرض التفاصيل وهرمية الضوابط والسجل الزمني',
      body: h('div', { class: 'stack gap-3' }, toolbar, tableHost), className: 'col-span-8',
    });

    /* ───────────── side column ───────────── */
    const matrixHost = h('div');
    const matrixLegendHost = h('div');
    const matrixCard = C.card({
      code: 'RSK-5X5', title: 'المصفوفة المصغّرة', subtitle: 'انقر خلية لتصفية السجل على درجتها',
      body: h('div', { class: 'stack gap-3' }, matrixHost, matrixLegendHost), tableView: matrixTable, className: 'is-compact',
    });
    const catHost = h('div');
    const catCard = C.card({
      code: 'RSK-CAT', title: 'أعلى الفئات', subtitle: 'عدد المخاطر المفتوحة لكل فئة خطر',
      body: catHost, tableView: categoriesTable, className: 'is-compact',
    });
    root.appendChild(h('div', { class: 'grid-12' }, registerCard, h('div', { class: 'col-span-4 stack gap-4' }, matrixCard, catCard)));
    container.appendChild(root);

    /* ───────────── table columns ───────────── */
    const scoreCell = (s) => h('span', { class: 'row gap-2 nowrap' }, h('strong', { class: 'mono' }, fmt.num(s)), C.tierBadge(tierOf(s)));
    function dueCell(r) {
      const ms = parseMs(r.dueDate);
      if (!Number.isFinite(ms)) return '—';
      const dateText = fmt.date(r.dueDate, { style: 'short' });
      if (r.status === CLOSED) return h('span', { class: 'muted mono text-xs' }, dateText);
      const days = Math.round((todayStart() - ms) / DAY_MS);
      if (days > 0) return h('span', { class: 'stack gap-1' }, C.badge(`متأخر ${fmt.num(days)} ${dayWord(days)}`, 'critical'), h('span', { class: 'mono text-xs muted' }, dateText));
      if (days >= -7) return h('span', { class: 'stack gap-1' }, C.badge(days === 0 ? 'يستحق اليوم' : `خلال ${fmt.num(-days)} ${dayWord(-days)}`, 'warning'), h('span', { class: 'mono text-xs muted' }, dateText));
      return h('span', { class: 'mono text-xs' }, dateText);
    }
    const columns = [
      { key: 'code', label: 'الكود', mono: true, width: 88, sortValue: (r) => r.code, render: (r) => String(r.code || '') },
      { key: 'hazard', label: 'الخطر', sortValue: (r) => r.hazard, render: (r) => h('div', { class: 'stack gap-1', style: { minInlineSize: '200px', maxInlineSize: '300px' } }, h('strong', { class: 'truncate', title: String(r.hazard || '') }, String(r.hazard || '')), r.activity ? h('span', { class: 'muted text-xs truncate', title: String(r.activity) }, String(r.activity)) : null) },
      { key: 'siteId', label: 'الموقع', sortValue: (r) => siteName(r.siteId), render: (r) => { const s = siteById(r.siteId); return h('div', { class: 'stack gap-1', style: { maxInlineSize: '160px' } }, h('span', { class: 'truncate', title: s ? s.name : '' }, s ? s.name : '—'), s ? h('span', { class: 'muted text-xs mono' }, String(s.code || '')) : null); } },
      { key: 'categoryId', label: 'الفئة', sortValue: (r) => categoryById(r.categoryId).name, render: (r) => { const c = categoryById(r.categoryId); return h('span', { class: 'row gap-2 nowrap', title: c.name }, ico(c.icon, 14), h('span', { class: 'truncate', style: { maxInlineSize: '140px' } }, c.name)); } },
      { key: 'likelihood', label: 'الاحتمالية', align: 'center', sortValue: (r) => Number(r.likelihood) || 0, render: (r) => h('span', { class: 'mono', title: LIKELIHOOD_LABELS[(Number(r.likelihood) || 1) - 1] || '' }, fmt.num(Number(r.likelihood) || 0)) },
      { key: 'severity', label: 'الشدة', align: 'center', sortValue: (r) => Number(r.severity) || 0, render: (r) => h('span', { class: 'mono', title: SEVERITY_LABELS[(Number(r.severity) || 1) - 1] || '' }, fmt.num(Number(r.severity) || 0)) },
      { key: 'score', label: 'الدرجة', sortValue: (r) => score(r), render: (r) => scoreCell(score(r)) },
      { key: 'residual', label: 'المتبقية', sortValue: (r) => residual(r), render: (r) => scoreCell(residual(r)) },
      { key: 'owner', label: 'المالك', sortValue: (r) => r.owner, render: (r) => h('span', { class: 'nowrap' }, String(r.owner || '—')) },
      { key: 'dueDate', label: 'الاستحقاق', sortValue: (r) => parseMs(r.dueDate), render: dueCell },
      { key: 'status', label: 'الحالة', sortValue: (r) => riskStatuses().indexOf(r.status), render: (r) => C.badge(String(r.status || '—'), STATUS_TONE[r.status] || 'neutral') },
    ];

    /* ───────────── table twins ───────────── */
    function matrixTable() {
      const m = safe(() => sel.riskMatrix(state(), effectiveFilters({ tier: 'all' })), [], 'riskMatrix');
      const header = ['الشدة ↓ / الاحتمالية →', ...LIKELIHOOD_LABELS.map((l, i) => `${fmt.num(i + 1)} ${l}`)];
      const rows = SEVERITY_LABELS.map((l, ri) => [`${fmt.num(ri + 1)} ${l}`, ...LIKELIHOOD_LABELS.map((_, ci) => fmt.num(Number(m[ri] && m[ri][ci]) || 0))]);
      return simpleTable('مصفوفة المخاطر 5×5 — المخاطر المفتوحة', header, rows, [false, true, true, true, true, true]);
    }
    function categoryCounts() {
      const viaSel = typeof sel.risksByCategory === 'function' ? safe(() => sel.risksByCategory(state(), effectiveFilters({ categoryId: 'all' })), null, 'risksByCategory') : null;
      if (Array.isArray(viaSel)) return viaSel.map((c) => ({ id: c.id, label: c.label, value: Number(c.value) || 0 }));
      const counts = new Map();
      filteredRows({ categoryId: 'all' }).filter((r) => r.status !== CLOSED).forEach((r) => counts.set(r.categoryId, (counts.get(r.categoryId) || 0) + 1));
      return categories().map((c) => ({ id: c.id, label: c.name, value: counts.get(c.id) || 0 })).filter((c) => c.value > 0).sort((a, b) => b.value - a.value);
    }
    function categoriesTable() {
      return simpleTable('المخاطر المفتوحة حسب الفئة', ['الفئة', 'العدد'], categoryCounts().map((c) => [c.label, fmt.num(c.value)]), [false, true]);
    }

    /* ───────────── renderers ───────────── */
    function renderChips() {
      const base = filteredRows({ categoryId: 'all' });
      const counts = new Map();
      base.forEach((r) => counts.set(r.categoryId, (counts.get(r.categoryId) || 0) + 1));
      const chip = (id, label, icon, count) => {
        const active = local.categoryId === id;
        const btn = h('button', { type: 'button', class: ['chip', 'is-sm', active ? 'is-active' : null], 'aria-pressed': active ? 'true' : 'false', title: label,
          onClick: () => { local.categoryId = active ? 'all' : id; schedule(); } });
        if (icon) btn.appendChild(ico(icon, 14));
        btn.appendChild(h('span', {}, label));
        btn.appendChild(h('span', { class: 'chip-count' }, fmt.num(count)));
        return btn;
      };
      chipGroup.replaceChildren(
        chip('all', 'كل الفئات', 'filter', base.length),
        ...categories().filter((c) => (counts.get(c.id) || 0) > 0 || local.categoryId === c.id).map((c) => chip(c.id, c.name, c.icon, counts.get(c.id) || 0)));
    }

    function renderTable() {
      const rows = filteredRows();
      const open = rows.filter((r) => r.status !== CLOSED).length;
      const overdue = rows.filter(isOverdue).length;
      resultCount.textContent = `${fmt.num(rows.length)} مخاطرة · ${fmt.num(open)} مفتوحة${overdue ? ` · ${fmt.num(overdue)} متأخرة` : ''}`;
      clearBtn.hidden = local.categoryId === 'all' && local.status === 'all' && local.tier === 'all';
      if (!table) {
        table = C.dataTable({
          columns, rows, rowKey: 'id', pageSize: 10, dense: true, caption: 'سجل المخاطر',
          initialSort: { key: 'score', dir: 'desc' }, emptyText: 'لا توجد مخاطر مطابقة للمرشّحات الحالية',
          onRowClick: (row) => openDrawer(row.id),
        });
        tableHost.replaceChildren(table.el);
      } else {
        table.update(rows);
      }
      const all = arr(state().risks);
      headCount.querySelector('.badge-text').textContent = `${fmt.num(all.length)} مخاطرة في السجل · ${fmt.num(all.filter((r) => r && r.status !== CLOSED).length)} مفتوحة`;
    }

    function renderSide() {
      const m = safe(() => sel.riskMatrix(state(), effectiveFilters({ tier: 'all' })), Array.from({ length: 5 }, () => Array(5).fill(0)), 'riskMatrix');
      matrixHost.replaceChildren(chartOrEmpty(() => charts.heatmap({
        rows: SEVERITY_LABELS.map((l, i) => `${fmt.num(i + 1)} ${l}`),
        cols: LIKELIHOOD_LABELS.map((l, i) => `${fmt.num(i + 1)} ${l}`),
        cells: m,
        colorFor: (value, ri, ci) => `var(--${toneOf(tierOf(((Number(ri) || 0) + 1) * ((Number(ci) || 0) + 1)))})`,
        labelFor: (value) => (value ? fmt.num(value) : ''),
        onCellClick: (...args) => {
          const c = cellArgs(args);
          const tier = tierOf((c.ri + 1) * (c.ci + 1));
          local.tier = local.tier === tier ? 'all' : tier;
          tierSelect.value = local.tier;
          schedule();
          C.toast(local.tier === 'all' ? 'تمت إزالة تصفية الدرجة' : `تمت تصفية السجل على الدرجة «${tier}»`, { tone: 'accent', timeout: 2500 });
        },
        cellSize: 'auto', ariaLabel: 'مصفوفة المخاطر المصغّرة', rowTitle: 'الشدة', colTitle: 'الاحتمالية',
      }), 'المصفوفة المصغّرة'));
      const counts = { critical: 0, serious: 0, warning: 0, good: 0 };
      filteredRows({ tier: 'all' }).filter((r) => r.status !== CLOSED).forEach((r) => { const t = toneOf(tierOf(score(r))); if (t in counts) counts[t] += 1; });
      matrixLegendHost.replaceChildren(toneLegend(TIERS.map((t) => ({ tone: t.tone, label: t.tier, count: counts[t.tone] }))));

      const items = categoryCounts();
      catHost.replaceChildren(items.length
        ? chartOrEmpty(() => charts.barChart({ items, horizontal: true, height: Math.max(160, Math.min(items.length, 8) * 34 + 24), valueFormat: fmt.num, color: 'var(--s1)', showValues: true, maxBars: 8, ariaLabel: 'المخاطر المفتوحة حسب الفئة' }), 'أعلى الفئات')
        : C.emptyState({ title: 'لا توجد مخاطر مفتوحة', text: 'لا تنطبق المرشّحات الحالية على أي مخاطرة مفتوحة.' }));
    }

    /* ───────────── drawer ───────────── */
    const section = (title, ...children) => h('section', { class: 'drawer-section' }, title ? h('h3', { class: 'drawer-section-title' }, title) : null, ...children);

    function controlsHierarchy(risk) {
      const byType = new Map();
      arr(risk.controls).forEach((c) => { if (!c) return; const t = c.type || controlTypes()[3]; if (!byType.has(t)) byType.set(t, []); byType.get(t).push(c); });
      return h('ol', { class: 'stepper is-vertical', role: 'list', 'aria-label': 'هرمية الضوابط' }, controlTypes().map((type) => {
        const items = byType.get(type) || [];
        const has = items.length > 0;
        return h('li', { class: ['step', has ? 'is-done' : null] },
          h('span', { class: 'step-dot' }, has ? ico('check', 12) : null),
          h('div', { class: 'stack gap-1', style: { flex: '1', minInlineSize: '0' } },
            h('span', { class: 'step-label' }, h('strong', {}, type), h('span', { class: 'muted' }, ` — ${HIERARCHY_HINT[type] || ''}`)),
            has
              ? h('ul', { class: 'controls-list', role: 'list' }, items.map((c, i) => h('li', { class: 'controls-item' }, h('span', { class: 'controls-type' }, fmt.num(i + 1)), h('span', {}, String(c.text || '')))))
              : h('span', { class: 'text-xs muted' }, 'لا توجد ضوابط من هذا المستوى')));
      }));
    }

    function drawerBody(risk) {
      const s = score(risk);
      const tier = tierOf(s);
      const res = residual(risk);
      const rTier = tierOf(res);
      const cat = categoryById(risk.categoryId);
      const site = siteById(risk.siteId);
      const reduction = s > 0 ? Math.round(((s - res) / s) * 100) : 0;
      const history = arr(risk.history).filter(Boolean).slice().sort((a, b) => (parseMs(b.at) || 0) - (parseMs(a.at) || 0));
      const barRow = (label, value, t) => h('div', { class: 'bar-pair-row' },
        h('span', {}, label),
        C.progress({ value, max: 25, tone: toneOf(t), label: `${label}: ${fmt.num(value)} من ${fmt.num(25)}` }),
        h('span', { class: 'progress-value' }, `${fmt.num(value)} · ${t}`));
      const statusSeg = C.segmented({
        options: riskStatuses().map((st) => ({ value: st, label: st })),
        value: risk.status, ariaLabel: 'تغيير حالة المخاطرة',
        onChange: (v) => {
          if (v === risk.status) return;
          store.updateRisk(risk.id, { status: v, by: USER });
          C.toast(`تم تغيير حالة ${risk.code} إلى «${v}»`, { tone: v === CLOSED ? 'good' : 'accent' });
        },
      });
      statusSeg.el.classList.add('is-block');

      return h('div', {},
        section(null,
          h('div', { class: 'row wrap gap-2' },
            C.tierBadge(tier), C.badge(String(risk.status || ''), STATUS_TONE[risk.status] || 'neutral'),
            C.badge(cat.name, 'neutral', { icon: ico(cat.icon, 12) }),
            isOverdue(risk) ? C.badge(`متأخرة ${fmt.num(Math.round((todayStart() - parseMs(risk.dueDate)) / DAY_MS))} ${dayWord(Math.round((todayStart() - parseMs(risk.dueDate)) / DAY_MS))}`, 'critical') : null),
          risk.description ? h('p', { class: 'ink-2', style: { marginBlockStart: '10px', lineHeight: '1.65' } }, String(risk.description)) : null),
        section('البيانات الأساسية', C.kv([
          ['الموقع', site ? `${site.name} (${site.code})` : '—'],
          ['النشاط', risk.activity || '—'],
          ['المنطقة', risk.zoneId && site ? ((arr(site.zones).find((z) => z.id === risk.zoneId) || {}).name || risk.zoneId) : '—'],
          ['المالك', risk.owner || '—'],
          ['المصدر', risk.source || '—'],
          ['تاريخ الاستحقاق', risk.dueDate ? fmt.date(risk.dueDate) : '—'],
          ['المرجع النظامي', risk.legalRef || '—'],
          ['تاريخ التسجيل', risk.createdAt ? fmt.date(risk.createdAt) : '—'],
          ['آخر تحديث', risk.updatedAt ? fmt.dateTime(risk.updatedAt) : '—'],
        ])),
        section('الدرجة الكامنة مقابل المتبقية',
          h('div', { class: 'bar-pair' }, barRow('الكامنة', s, tier), barRow('المتبقية', res, rTier)),
          h('p', { class: 'text-xs muted', style: { marginBlockStart: '8px' } },
            `الاحتمالية ${fmt.num(Number(risk.likelihood) || 0)} × الشدة ${fmt.num(Number(risk.severity) || 0)} = ${fmt.num(s)} → بعد الضوابط ${fmt.num(Number(risk.residualLikelihood ?? risk.likelihood) || 0)} × ${fmt.num(Number(risk.residualSeverity ?? risk.severity) || 0)} = ${fmt.num(res)}${reduction > 0 ? ` (خفض بنسبة ${fmt.pct(reduction)})` : ''}`)),
        section('هرمية الضوابط', controlsHierarchy(risk)),
        section('تغيير الحالة', statusSeg.el, h('p', { class: 'text-xs muted', style: { marginBlockStart: '8px' } }, 'يُسجَّل كل تغيير في السجل الزمني مع اسم المستخدم والتاريخ.')),
        section('السجل الزمني', history.length
          ? h('ol', { class: 'timeline', role: 'list' }, history.map((ev) => h('li', { class: 'timeline-item' },
            h('time', { class: 'timeline-time', datetime: String(ev.at || '') }, ev.at ? (String(ev.at).length > 10 ? fmt.dateTime(ev.at) : fmt.date(ev.at)) : '—'),
            h('p', { class: 'timeline-text' }, String(ev.text || '')),
            ev.by ? h('p', { class: 'timeline-by' }, String(ev.by)) : null)))
          : h('p', { class: 'text-sm muted' }, 'لا توجد أحداث مسجلة بعد.')));
    }

    function openDrawer(id) {
      const risk = findRisk(id);
      if (!risk) { C.toast('لم يتم العثور على المخاطرة المطلوبة', { tone: 'warning' }); return; }
      if (drawerApi) { const prev = drawerApi; drawerApi = null; try { prev.close(); } catch { /* ignore */ } }
      drawerRiskId = id;
      drawerApi = C.drawer({
        title: `${risk.code} — ${risk.hazard}`,
        subtitle: `${siteName(risk.siteId)} · ${categoryById(risk.categoryId).name}`,
        size: 'lg',
        body: () => drawerBody(risk),
        actions: [
          { label: 'تعديل', variant: 'outline', icon: ico('pencil', 15), closes: false, onClick: () => { const r = findRisk(drawerRiskId); if (r) openRiskModal(r); return false; } },
          { label: 'حذف', variant: 'danger', icon: ico('trash', 15), closes: false, attrs: { class: 'is-soft' }, onClick: () => { const r = findRisk(drawerRiskId); if (r) confirmDelete(r); return false; } },
        ],
        onClose: () => { drawerApi = null; drawerRiskId = null; },
      });
      drawerApi.open();
    }
    function refreshDrawer() {
      if (!drawerApi || !drawerRiskId) return;
      const risk = findRisk(drawerRiskId);
      if (!risk) { const api = drawerApi; drawerApi = null; drawerRiskId = null; try { api.close(); } catch { /* ignore */ } return; }
      try { drawerApi.setTitle(`${risk.code} — ${risk.hazard}`); } catch { /* ignore */ }
      drawerApi.body.replaceChildren(drawerBody(risk));
    }

    function confirmDelete(risk) {
      if (confirmApi) { try { confirmApi.close(); } catch { /* ignore */ } }
      confirmApi = C.modal({
        title: 'حذف المخاطرة',
        subtitle: risk.code,
        size: 'sm',
        body: h('div', { class: 'stack gap-3' },
          h('p', {}, `سيتم حذف المخاطرة «${risk.hazard}» نهائيًا من السجل مع ضوابطها وسجلها الزمني.`),
          h('div', { class: 'note tone-critical' }, h('strong', {}, 'تنبيه: '), 'لا يمكن التراجع عن هذا الإجراء. إن كانت المخاطرة قد عولجت فالأنسب إغلاقها بدل حذفها للحفاظ على الأثر التدقيقي.')),
        actions: [
          { label: 'إلغاء', variant: 'ghost' },
          { label: 'حذف نهائي', variant: 'danger', icon: ico('trash', 15), onClick: () => {
            const ok = store.deleteRisk(risk.id);
            C.toast(ok ? `تم حذف المخاطرة ${risk.code}` : 'تعذر حذف المخاطرة', { tone: ok ? 'neutral' : 'warning' });
            if (drawerApi) { const api = drawerApi; drawerApi = null; drawerRiskId = null; try { api.close(); } catch { /* ignore */ } }
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
        categoryId: local.categoryId !== 'all' ? local.categoryId : 'height',
        hazard: '', activity: '', description: '',
        likelihood: 3, severity: 3, residualLikelihood: 2, residualSeverity: 3,
        controls: [], owner: '', dueDate: isoDate(new Date(now().getTime() + 14 * DAY_MS)),
        status: riskStatuses()[0], source: 'تقييم مخاطر', legalRef: '',
      };
      const r = { ...defaults, ...(existing || {}) };
      const scale = (labels) => [1, 2, 3, 4, 5].map((n) => ({ value: n, label: `${fmt.num(n)} — ${labels[n - 1]}` }));
      const F = {
        siteId: C.formField({ label: 'الموقع', name: 'siteId', type: 'select', value: r.siteId, required: true, options: sites().map((s) => ({ value: s.id, label: `${s.code} — ${s.name}` })) }),
        categoryId: C.formField({ label: 'فئة الخطر', name: 'categoryId', type: 'select', value: r.categoryId, required: true, options: categories().map((c) => ({ value: c.id, label: c.name })) }),
        hazard: C.formField({ label: 'الخطر', name: 'hazard', type: 'text', value: r.hazard, required: true, placeholder: 'مثال: سقوط من حافة البلاطة غير المحمية' }),
        activity: C.formField({ label: 'النشاط / موقع العمل', name: 'activity', type: 'text', value: r.activity, placeholder: 'مثال: صب الخرسانة — الطابق 23' }),
        description: C.formField({ label: 'الوصف', name: 'description', type: 'textarea', value: r.description, rows: 3, placeholder: 'وصف الظروف والأشخاص المعرضين وسبب التقييم' }),
        likelihood: C.formField({ label: 'الاحتمالية (الكامنة)', name: 'likelihood', type: 'select', value: r.likelihood, options: scale(LIKELIHOOD_LABELS), required: true }),
        severity: C.formField({ label: 'الشدة (الكامنة)', name: 'severity', type: 'select', value: r.severity, options: scale(SEVERITY_LABELS), required: true }),
        residualLikelihood: C.formField({ label: 'الاحتمالية (المتبقية)', name: 'residualLikelihood', type: 'select', value: r.residualLikelihood, options: scale(LIKELIHOOD_LABELS), hint: 'بعد تطبيق الضوابط' }),
        residualSeverity: C.formField({ label: 'الشدة (المتبقية)', name: 'residualSeverity', type: 'select', value: r.residualSeverity, options: scale(SEVERITY_LABELS), hint: 'بعد تطبيق الضوابط' }),
        owner: C.formField({ label: 'المالك المسؤول', name: 'owner', type: 'text', value: r.owner, required: true, placeholder: 'مثال: م. سارة القحطاني' }),
        dueDate: C.formField({ label: 'تاريخ الاستحقاق', name: 'dueDate', type: 'date', value: r.dueDate, required: true }),
        status: C.formField({ label: 'الحالة', name: 'status', type: 'select', value: r.status, options: riskStatuses().map((s) => ({ value: s, label: s })) }),
        source: C.formField({ label: 'المصدر', name: 'source', type: 'text', value: r.source, placeholder: 'تفتيش، جولة سلامة، تحليل حادث، بلاغ عامل…' }),
        legalRef: C.formField({ label: 'المرجع النظامي', name: 'legalRef', type: 'text', value: r.legalRef, placeholder: 'مثال: لائحة السلامة والصحة المهنية — المادة 12' }),
      };
      ['hazard', 'description', 'legalRef'].forEach((k) => F[k].classList.add('span-2'));

      /* live score preview */
      const preview = h('div', { class: 'note span-2', 'aria-live': 'polite' });
      const updatePreview = () => {
        const L = Number(F.likelihood.querySelector('select').value) || 0;
        const S = Number(F.severity.querySelector('select').value) || 0;
        const rl = Number(F.residualLikelihood.querySelector('select').value) || 0;
        const rs = Number(F.residualSeverity.querySelector('select').value) || 0;
        const sc = L * S; const rsc = rl * rs;
        preview.replaceChildren(
          h('div', { class: 'row wrap gap-3' },
            h('span', { class: 'row gap-2' }, h('span', { class: 'muted' }, 'الدرجة الكامنة:'), h('strong', { class: 'mono' }, `${fmt.num(L)} × ${fmt.num(S)} = ${fmt.num(sc)}`), C.tierBadge(tierOf(sc))),
            h('span', { class: 'row gap-2' }, h('span', { class: 'muted' }, 'المتبقية:'), h('strong', { class: 'mono' }, `${fmt.num(rl)} × ${fmt.num(rs)} = ${fmt.num(rsc)}`), C.tierBadge(tierOf(rsc)))),
          rsc > sc ? h('p', { class: 'text-xs', style: { marginBlockStart: '6px', color: 'var(--tone-ink)' } }, 'تنبيه: الدرجة المتبقية أعلى من الكامنة — راجع تقدير الضوابط.') : null);
      };

      /* controls repeater */
      const ctlList = h('div', { class: 'stack gap-2', role: 'list', 'aria-label': 'الضوابط' });
      const addControlRow = (ctl = { type: controlTypes()[3], text: '' }) => {
        const typeSel = h('select', { class: 'field-control', 'aria-label': 'مستوى الضابط', style: { maxInlineSize: '200px' } }, controlTypes().map((t) => h('option', { value: t }, t)));
        typeSel.value = controlTypes().includes(ctl.type) ? ctl.type : controlTypes()[3];
        const textIn = h('input', { class: 'field-control grow', type: 'text', 'aria-label': 'وصف الضابط', placeholder: 'وصف الضابط المطبق أو المقترح', value: ctl.text || '' });
        const row = h('div', { class: 'row gap-2', role: 'listitem', 'data-ctl-row': '' }, typeSel, textIn);
        row.appendChild(C.button('', { variant: 'ghost', size: 'sm', icon: ico('close', 14), onClick: () => row.remove(), attrs: { 'aria-label': 'إزالة الضابط' } }));
        ctlList.appendChild(row);
        return row;
      };
      arr(r.controls).forEach((c) => addControlRow(c));
      if (!arr(r.controls).length) addControlRow();
      const addCtlBtn = C.button('إضافة ضابط', { variant: 'outline', size: 'sm', icon: ico('plus', 14), onClick: () => { const row = addControlRow(); row.querySelector('input').focus(); } });
      const controlsBlock = h('div', { class: 'span-2 stack gap-2' },
        h('div', { class: 'form-section-title' }, 'هرمية الضوابط'),
        h('p', { class: 'text-xs muted' }, 'رتّب الضوابط من الأقوى إلى الأضعف: إلغاء، استبدال، هندسية، إدارية، ثم معدات الوقاية الشخصية.'),
        ctlList, h('div', {}, addCtlBtn));
      const readControls = () => Array.from(ctlList.querySelectorAll('[data-ctl-row]')).map((row) => ({
        type: row.querySelector('select').value, text: row.querySelector('input').value.trim(),
      })).filter((c) => c.text);

      const form = h('form', { class: 'form-grid', novalidate: true, onSubmit: (e) => { e.preventDefault(); submit(); } },
        F.siteId, F.categoryId, F.hazard, F.activity, F.description,
        h('div', { class: 'form-section-title span-2' }, 'التقييم'),
        F.likelihood, F.severity, F.residualLikelihood, F.residualSeverity, preview,
        controlsBlock,
        h('div', { class: 'form-section-title span-2' }, 'المتابعة'),
        F.owner, F.dueDate, F.status, F.source, F.legalRef);
      form.addEventListener('change', updatePreview);
      updatePreview();

      let api = null;
      function submit() {
        const data = C.readForm(form);
        form.querySelectorAll('.field.is-invalid').forEach((x) => x.classList.remove('is-invalid'));
        const invalid = [];
        if (!String(data.hazard || '').trim()) invalid.push(F.hazard);
        if (!String(data.owner || '').trim()) invalid.push(F.owner);
        if (!String(data.dueDate || '').trim()) invalid.push(F.dueDate);
        if (invalid.length) {
          invalid.forEach((f) => f.classList.add('is-invalid'));
          const first = invalid[0].querySelector('.field-control');
          if (first) first.focus();
          C.toast('يرجى تعبئة الحقول المطلوبة: الخطر، المالك، وتاريخ الاستحقاق', { tone: 'warning' });
          return false;
        }
        const payload = {
          siteId: String(data.siteId || r.siteId), categoryId: String(data.categoryId || r.categoryId),
          hazard: String(data.hazard).trim(), activity: String(data.activity || '').trim(), description: String(data.description || '').trim(),
          likelihood: Number(data.likelihood) || 3, severity: Number(data.severity) || 3,
          residualLikelihood: Number(data.residualLikelihood) || Number(data.likelihood) || 3, residualSeverity: Number(data.residualSeverity) || Number(data.severity) || 3,
          controls: readControls(), owner: String(data.owner).trim(), dueDate: String(data.dueDate),
          status: String(data.status || r.status), source: String(data.source || '').trim() || 'إدخال يدوي', legalRef: String(data.legalRef || '').trim(),
        };
        if (isEdit) {
          const updated = store.updateRisk(existing.id, { ...payload, by: USER, note: 'تحديث بيانات المخاطرة من سجل المخاطر' });
          C.toast(updated ? `تم حفظ التعديلات على ${existing.code}` : 'تعذر حفظ التعديلات', { tone: updated ? 'good' : 'warning' });
        } else {
          const created = store.addRisk(payload);
          C.toast(created ? `تمت إضافة المخاطرة ${created.code} إلى السجل` : 'تعذر إضافة المخاطرة', {
            tone: created ? 'good' : 'warning',
            action: created ? { label: 'فتح', onClick: () => openDrawer(created.id) } : null,
          });
        }
        if (api) api.close('action');
        return true;
      }

      api = C.modal({
        title: isEdit ? `تعديل المخاطرة ${existing.code}` : 'إضافة مخاطرة جديدة',
        subtitle: isEdit ? String(existing.hazard || '') : 'تُحفظ المخاطرة محليًا وتظهر فورًا في السجل والرادار',
        size: 'lg', body: form,
        actions: [
          { label: 'إلغاء', variant: 'ghost' },
          { label: isEdit ? 'حفظ التعديلات' : 'إضافة المخاطرة', variant: 'primary', icon: ico(isEdit ? 'check' : 'plus', 15), closes: false, onClick: () => submit() },
        ],
        onClose: () => { if (modalApi === api) modalApi = null; },
      });
      modalApi = api;
      api.open();
    }

    /* ───────────── refresh orchestration ───────────── */
    function refresh() {
      if (destroyed) return;
      renderChips();
      renderTable();
      renderSide();
      refreshDrawer();
    }
    function schedule() {
      if (destroyed || raf) return;
      raf = requestAnimationFrame(() => { raf = 0; refresh(); });
    }

    refresh();

    subs.push(bus.on('store:change', (p) => {
      const path = String((p && p.path) || '*');
      if (!/^(risks|\*|settings)/.test(path)) return;
      schedule();
    }));
    subs.push(bus.on('filters:change', schedule));
    subs.push(bus.on('settings:change', schedule));

    /* route params: ?new=1 → add modal, ?id=R12 → drawer (after the router has focused the heading) */
    timers.push(setTimeout(() => {
      if (destroyed) return;
      if (params.new === '1' || params.new === 'true') {
        openRiskModal(null);
        try { history.replaceState(null, '', router.href ? router.href('risks', local.tier !== 'all' ? { tier: local.tier } : {}) : '#/risks'); } catch { /* ignore */ }
      } else if (params.id && findRisk(params.id)) {
        openDrawer(params.id);
      }
    }, 60));

    /* ───────────── cleanup ───────────── */
    return function cleanup() {
      destroyed = true;
      subs.splice(0).forEach((off) => { try { off(); } catch { /* ignore */ } });
      timers.splice(0).forEach((t) => { clearTimeout(t); clearInterval(t); });
      if (raf) { cancelAnimationFrame(raf); raf = 0; }
      [drawerApi, modalApi, confirmApi].forEach((api) => { if (api) { try { api.close(); } catch { /* ignore */ } } });
      drawerApi = null; modalApi = null; confirmApi = null; drawerRiskId = null;
      try { if (charts && charts.tooltip && typeof charts.tooltip.hide === 'function') charts.tooltip.hide(); } catch { /* ignore */ }
    };
  },
};
