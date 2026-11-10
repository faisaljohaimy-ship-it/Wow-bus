/**
 * Biltix HSE — SEC-01 نظرة عامة (js/views/overview.js)
 *
 * The command-center landing view. Four rows:
 *   1. Safety Index hero (gauge + LTI-free days / LTIFR / TRIR + formula hint)  |  live SweepRadar
 *   2. Eight KPI tiles with 8-week sparklines and deltas vs. the previous period
 *   3. 5×5 risk matrix (status tones by tier)  |  incidents trend  |  permits by status
 *   4. Sites performance table  |  urgent actions
 *
 * Contract: docs/ARCHITECTURE.md §4–§8. Everything that comes from data reaches the DOM
 * through textContent / components.h. Re-renders are coalesced into one animation frame
 * and only fire for paths that change what this view shows (feed / sensor / integration
 * ticks are ignored). The radar is created once and reads live blips on every frame.
 */

import * as seedMod from '../data/seed.js';
import * as selectorsMod from '../core/selectors.js';

const DAY_MS = 86_400_000;
const SVG_NS = 'http://www.w3.org/2000/svg';
const CLOSED = 'مغلق';

/* Contract enums (fallbacks keep the view alive while seed.js is being rebuilt). */
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
/** Short rim labels for the sweep radar sectors (full names live in the tooltip). */
const SHORT_CATEGORY = {
  height: 'ارتفاعات', excavation: 'حفريات', lifting: 'رفع', electrical: 'كهرباء', confined: 'أماكن مغلقة',
  hotwork: 'أعمال ساخنة', heat: 'إجهاد حراري', chemical: 'كيميائيات', traffic: 'مركبات', scaffold: 'سقالات',
  structural: 'إنشائي', ergonomic: 'مناولة',
};
const TIERS = [
  { tier: 'حرج', tone: 'critical' },
  { tier: 'عالٍ', tone: 'serious' },
  { tier: 'متوسط', tone: 'warning' },
  { tier: 'منخفض', tone: 'good' },
];
const LIKELIHOOD_LABELS = ['نادر', 'غير محتمل', 'محتمل', 'مرجّح', 'شبه مؤكد'];
const SEVERITY_LABELS = ['طفيف', 'بسيط', 'متوسط', 'جسيم', 'كارثي'];
const KIND_META = {
  risk: { label: 'مخاطرة', icon: 'risk' },
  incident: { label: 'حادث', icon: 'incident' },
  permit: { label: 'تصريح عمل', icon: 'permit' },
  inspection: { label: 'تفتيش', icon: 'inspection' },
  cert: { label: 'شهادة تدريب', icon: 'training' },
};
const TONE_LABEL = { critical: 'حرج', serious: 'عالٍ', warning: 'تنبيه', good: 'مستقر', neutral: 'عادي', accent: 'مباشر', brand: 'مباشر' };
const DEFAULT_WEIGHTS = { base: 100, criticalOpen: 2.5, highOpen: 1, overdueOpen: 0.5, lti90: 4, mtc90: 1.5, nearMiss30: 0.5, trainingPct: 0.1 };

/** Local glyphs used when art.js has no icon of that name (24×24 stroke paths; "c:" = circle). */
const ICONS = {
  info: ['c:12,12,9', 'M12 11v5', 'M12 8h.01'],
  plus: ['M12 5v14', 'M5 12h14'],
  external: ['M14 4h6v6', 'M20 4l-9 9', 'M19 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5'],
  clock: ['c:12,12,9', 'M12 7v5l3 2'],
  check: ['M5 12.5l4.5 4.5L19 7.5'],
  site: ['M4 20h16', 'M6 20V8l6-4 6 4v12', 'M10 20v-5h4v5'],
  risk: ['M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z', 'M12 8v5', 'M12 16h.01'],
  incident: ['M12 3.5l9 16H3l9-16z', 'M12 10v4', 'M12 17.2h.01'],
  nearmiss: ['c:12,12,9', 'M8 12h8', 'M12 8v8'],
  permit: ['M7 3h8l4 4v14H7z', 'M15 3v4h4', 'M10 13h5M10 17h5'],
  inspection: ['M9 4h6v3H9z', 'M6 6h12v15H6z', 'M9 13l2 2 4-4'],
  training: ['M3 9l9-4 9 4-9 4-9-4z', 'M7 11v5c0 1.5 2.5 3 5 3s5-1.5 5-3v-5', 'M21 9v6'],
  trend: ['M3 17l6-6 4 4 8-8', 'M14 7h7v7'],
  radar: ['c:12,12,9', 'c:12,12,5', 'M12 12l6-6', 'M12 3v2'],
  grid: ['M4 4h7v7H4z', 'M13 4h7v7h-7z', 'M4 13h7v7H4z', 'M13 13h7v7h-7z'],
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
const categories = () => (Array.isArray(seedMod.CATEGORIES) && seedMod.CATEGORIES.length ? seedMod.CATEGORIES : FALLBACK_CATEGORIES);
const categoryName = (id) => { const c = categories().find((x) => x.id === id); return c ? c.name : '—'; };
const scoreTone = (score) => (score >= 85 ? 'good' : score >= 70 ? 'warning' : score >= 55 ? 'serious' : 'critical');

function parseMs(value) {
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'number') return value;
  if (typeof value !== 'string' || !value) return NaN;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  const d = m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date(value);
  return d.getTime();
}

export default {
  id: 'overview',
  code: 'SEC-01',
  title: 'نظرة عامة',
  icon: 'grid',

  render(container, ctx) {
    const { store, bus, sel, fmt, charts, router, live, art } = ctx;
    const C = ctx.components || {};
    const { h } = C;
    const R = ctx.radar || {};

    /* ───────────── local helpers ───────────── */
    const warned = new Set();
    const warn = (where, err) => {
      const key = `${where}:${err && err.message}`;
      if (warned.has(key)) return;
      warned.add(key);
      console.warn(`[overview] ${where}:`, err);
    };
    const safe = (fn, fallback, where = 'selector') => {
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
    /** Build a chart; return its element or null (never throws into the view). */
    const tryEl = (fn, label) => {
      try {
        const r = fn();
        const el = r instanceof Node ? r : r && r.el;
        return el instanceof Node ? el : null;
      } catch (err) { warn(`chart:${label}`, err); return null; }
    };
    const chartOrEmpty = (fn, label) => tryEl(fn, label) || C.emptyState({ title: 'تعذر رسم المخطط', text: label });
    const state = () => store.state || {};
    const filters = () => ({ siteId: 'all', range: 30, search: '', ...(store.filters || (store.state && store.state.filters) || {}) });
    const siteById = (id) => arr(state().sites).find((s) => s.id === id) || null;
    const siteName = (id) => { const s = siteById(id); return s ? s.name : ''; };
    const now = () => (typeof store.now === 'function' ? store.now() : new Date());
    const periodLabel = (f) => `آخر ${fmt.num(f.range)} ${f.range <= 10 ? 'أيام' : 'يوماً'}`;
    const scopeLabel = (f) => (f.siteId === 'all' ? 'جميع المواقع' : siteName(f.siteId) || 'موقع محدد');
    const pairs = (count) => `${fmt.num(count)} مخاطرة`;
    /** Route digit runs inside selector-made labels ("أسبوع 36") through the numerals setting. */
    const digits = (s) => String(s ?? '').replace(/\d+(?:\.\d+)?/g, (m) => fmt.num(Number(m), { maximumFractionDigits: 2 }));
    /** Re-set a card subtitle (static copy carries numbers that must follow the numerals setting). */
    const setSub = (cardEl, text) => { const el = cardEl.querySelector('.card-sub'); if (el && el.textContent !== text) el.textContent = text; };

    /** Plain table twin builder (headers + rows; `numeric` marks mono/end-aligned columns). */
    function simpleTable(caption, headers, rows, numeric = []) {
      const table = h('table', { class: 'chart-table' });
      table.appendChild(h('caption', {}, caption));
      table.appendChild(h('thead', {}, h('tr', {}, headers.map((label, i) => h('th', { scope: 'col', class: numeric[i] ? 'num' : null }, label)))));
      table.appendChild(h('tbody', {}, rows.length
        ? rows.map((r) => h('tr', {}, r.map((cell, i) => h('td', { class: numeric[i] ? 'num' : null }, cell))))
        : h('tr', {}, h('td', { colspan: String(headers.length), class: 'muted' }, 'لا توجد بيانات'))));
      return table;
    }

    /** Tone legend: icon + swatch + label (status is never colour-alone). */
    function toneLegend(items, cls = 'tone-legend') {
      return h('ul', { class: cls, role: 'list', 'aria-label': 'دليل الألوان' }, items.map((it) => h('li', { class: [`${cls}-item`, `tone-${it.tone}`] },
        C.glyph(it.tone, 12),
        h('span', { class: 'legend-key' }),
        h('span', {}, it.count === undefined ? it.label : `${it.label} · ${fmt.num(it.count)}`))));
    }

    /** Make a card body stretch so hero content can distribute vertical space. */
    function fillBody(cardEl) {
      const body = cardEl.querySelector('.card-body');
      const view = cardEl.querySelector('.card-view-chart');
      if (body) { body.style.display = 'flex'; body.style.flexDirection = 'column'; }
      if (view) { view.style.flex = '1'; view.style.display = 'flex'; view.style.flexDirection = 'column'; }
    }

    /* ───────────── lifecycle registers ───────────── */
    const subs = [];
    const timers = [];
    let raf = 0;
    let destroyed = false;
    let sweep = null;
    let overlay = null;
    let lastChangeAt = Date.now();
    let sitesTable = null;

    /* ───────────── view head ───────────── */
    const root = h('section', { class: 'view view-overview' });
    const scopeBadge = h('span', { class: 'badge tone-neutral', 'data-tone': 'neutral' }, ico('building', 14), h('span', { class: 'badge-text' }, ''));
    root.appendChild(h('div', { class: 'view-head' },
      h('div', { class: 'view-head-text' },
        h('span', { class: 'code-tag' }, 'SEC-01'),
        h('h1', { tabindex: '-1' }, 'نظرة عامة'),
        h('p', { class: 'view-lead' }, 'صورة لحظية لأداء السلامة والصحة المهنية عبر مواقع بلتكس: مؤشر السلامة، معدلات الإصابات، رادار المخاطر الحي، والإجراءات التي تحتاج تدخلاً اليوم.')),
      h('div', { class: 'view-actions' },
        scopeBadge,
        C.button('إضافة مخاطرة', { variant: 'outline', size: 'sm', icon: ico('plus', 14), onClick: () => router.navigate('risks', { new: 1 }) }))));

    /* ───────────── row 1: hero + radar ───────────── */
    const gaugeHost = h('div', { style: { display: 'grid', placeItems: 'center' } });
    const deltaHost = h('div', { class: 'row wrap', style: { justifyContent: 'center' } });
    // Facts stack as label/value rows: the hero card is narrow (4 of 12 columns) but tall next to the radar.
    const factsHost = h('div', { class: 'hero-facts', style: { gridTemplateColumns: 'minmax(0, 1fr)' } });
    const tierHost = h('div', { class: 'stack gap-2' });
    const heroBody = h('div', { class: 'stack', style: { gap: '14px', blockSize: '100%' } }, gaugeHost, deltaHost, factsHost, h('div', { class: 'grow' }), tierHost);
    const infoBtn = C.button('', {
      variant: 'ghost', size: 'sm', icon: ico('info', 16), onClick: openFormulaModal,
      attrs: { 'aria-label': 'كيف يُحسب مؤشر السلامة؟', title: 'كيف يُحسب مؤشر السلامة؟' },
    });
    const heroCard = C.card({
      code: 'KPI-00', title: 'مؤشر السلامة', subtitle: 'مؤشر مركّب من المخاطر المفتوحة والحوادث الحديثة والامتثال التدريبي',
      hero: true, actions: [infoBtn], body: heroBody, className: 'col-span-4',
    });
    heroCard.classList.add('is-fill');
    fillBody(heroCard);

    const canvas = h('canvas', { class: 'radar-canvas', role: 'img', 'aria-label': 'رادار المخاطر الحي' });
    const frame = h('div', { class: 'radar-frame is-wide' },
      canvas,
      h('span', { class: 'radar-status' }, C.liveDot('accent'), 'مباشر'));
    const tip = h('div', { class: 'tooltip radar-tip', hidden: true, style: { position: 'absolute', insetBlockStart: '0', insetInlineStart: '0', pointerEvents: 'none', zIndex: '2' } });
    const radarWrap = h('div', { style: { position: 'relative', maxInlineSize: '560px', marginInline: 'auto', inlineSize: '100%' } }, frame, tip);
    const radarLegendHost = h('div');
    const blipCount = h('span', { class: 'text-sm ink-2' });
    const updatedText = h('span', {});
    const radarCard = C.card({
      code: 'RDR-01', title: 'رادار المخاطر الحي', subtitle: `${fmt.num(12)} قطاعاً بحسب فئة الخطر — المخاطر الأشد تقترب من المركز`,
      body: h('div', { class: 'stack gap-3' }, radarWrap, h('div', { class: 'row between wrap' }, radarLegendHost, blipCount)),
      tableView: blipTable,
      footer: [
        h('span', { class: 'tele-updated' }, ico('clock', 13), updatedText),
        C.button('فتح الرادار الكامل', { variant: 'outline', size: 'sm', icon: ico('external', 14), onClick: () => router.navigate('radar') }),
      ],
      className: 'col-span-8',
    });
    root.appendChild(h('div', { class: 'grid-12' }, heroCard, radarCard));

    /* ───────────── row 2: KPI tiles ───────────── */
    const kpiRow = h('div', { class: 'kpi-row', role: 'list', 'aria-label': 'مؤشرات الأداء الرئيسية' });
    root.appendChild(kpiRow);

    /* ───────────── row 3: matrix / trend / permits ───────────── */
    const matrixHost = h('div');
    const matrixLegendHost = h('div');
    const trendHost = h('div');
    const permitsHost = h('div');
    const permitsListHost = h('div');
    const matrixCard = C.card({
      code: 'RSK-5X5', title: 'مصفوفة المخاطر', subtitle: 'المخاطر المفتوحة حسب الاحتمالية والشدة — انقر خلية لفتح السجل',
      body: h('div', { class: 'stack gap-3' }, matrixHost, matrixLegendHost), tableView: matrixTable, className: 'col-span-4',
    });
    const trendCard = C.card({
      code: 'INC-TRD', title: 'اتجاه الحوادث', subtitle: `آخر ${fmt.num(12)} أسبوعاً — الحوادث مقابل الحوادث الوشيكة`,
      body: trendHost, tableView: trendTable, className: 'col-span-4',
    });
    const permitsCard = C.card({
      code: 'PTW-STS', title: 'تصاريح العمل حسب الحالة', subtitle: 'توزيع التصاريح ضمن النطاق المحدد',
      body: h('div', { class: 'stack gap-3' }, permitsHost, permitsListHost), tableView: permitsTable, className: 'col-span-4',
    });
    const row3 = h('div', { class: 'grid-12' }, matrixCard, trendCard, permitsCard);
    root.appendChild(row3);

    /* ───────────── row 4: sites + urgent ───────────── */
    const sitesHost = h('div');
    const urgentHost = h('div');
    const urgentCount = h('span', { class: 'text-sm ink-2' });
    const sitesCard = C.card({
      code: 'SITES', title: 'أداء المواقع', subtitle: `مؤشر السلامة لكل موقع مع اتجاه ${fmt.num(12)} أسبوعاً — انقر موقعاً لتصفية اللوحة عليه`,
      body: sitesHost, className: 'col-span-8',
    });
    const urgentCard = C.card({
      code: 'ACT-NOW', title: 'إجراءات عاجلة', subtitle: 'مخاطر متأخرة، حوادث عالية الخطورة، تصاريح تنتهي، تفتيشات متأخرة، شهادات تنتهي',
      body: urgentHost,
      footer: [urgentCount, C.button('سجل المخاطر', { variant: 'ghost', size: 'sm', icon: ico('risk', 14), onClick: () => router.navigate('risks') })],
      className: 'col-span-4',
    });
    root.appendChild(h('div', { class: 'grid-12' }, sitesCard, urgentCard));

    container.appendChild(root);

    /* ───────────── width-aware layout (rows 3–4) ─────────────
       With the live feed open the main column is ~840px at 1440px. Below 1100px three cards per
       row squeeze chart titles into four lines and hide the sites table's trailing columns, so the
       trend chart and the sites table take the full row and the urgent list goes two-up. */
    let narrowLayout = false;
    const setSpan = (el, n) => {
      ['col-span-4', 'col-span-6', 'col-span-8', 'col-span-12'].forEach((c) => el.classList.remove(c));
      el.classList.add(`col-span-${n}`);
    };
    const styleUrgentList = (list) => {
      if (!list) return;
      if (narrowLayout && root.getBoundingClientRect().width >= 640) {
        list.style.display = 'grid';
        list.style.gridTemplateColumns = 'repeat(2, minmax(0, 1fr))';
        list.style.alignItems = 'start';
      } else {
        list.style.display = '';
        list.style.gridTemplateColumns = '';
        list.style.alignItems = '';
      }
    };
    const applyLayout = (w) => {
      const narrow = w < 1100;
      if (narrow === narrowLayout && row3.dataset.layout) return;
      narrowLayout = narrow;
      row3.dataset.layout = narrow ? 'narrow' : 'wide';
      if (narrow) {
        setSpan(matrixCard, 6); setSpan(permitsCard, 6); setSpan(trendCard, 12);
        row3.append(matrixCard, permitsCard, trendCard);
        setSpan(sitesCard, 12); setSpan(urgentCard, 12);
      } else {
        setSpan(matrixCard, 4); setSpan(trendCard, 4); setSpan(permitsCard, 4);
        row3.append(matrixCard, trendCard, permitsCard);
        setSpan(sitesCard, 8); setSpan(urgentCard, 4);
      }
      styleUrgentList(urgentHost.querySelector('.urgent-list'));
    };
    // Width-only, deferred to the next frame: mutating layout inside the observer callback would
    // re-trigger it in the same frame ("ResizeObserver loop completed with undelivered notifications").
    let layoutObserver = null;
    let lastLayoutWidth = -1;
    let layoutRaf = 0;
    const onRootResize = (w) => {
      const width = Math.round(w);
      if (width === lastLayoutWidth || width === 0) return;
      lastLayoutWidth = width;
      if (layoutRaf) cancelAnimationFrame(layoutRaf);
      layoutRaf = requestAnimationFrame(() => { layoutRaf = 0; if (!destroyed) applyLayout(width); });
    };
    if (typeof ResizeObserver === 'function') {
      layoutObserver = new ResizeObserver((entries) => { for (const e of entries) onRootResize(e.contentRect.width); });
      layoutObserver.observe(root);
    } else {
      applyLayout(root.getBoundingClientRect().width || 1200);
    }

    /* ───────────── data helpers ───────────── */
    function openRisks(st, f) {
      return arr(st.risks).filter((r) => r && r.status !== CLOSED && (f.siteId === 'all' || r.siteId === f.siteId));
    }
    function tierCounts(st, f) {
      const counts = { critical: 0, serious: 0, warning: 0, good: 0 };
      openRisks(st, f).forEach((r) => {
        const tone = safe(() => sel.tierTone(sel.riskTier(sel.riskScore(r))), 'good', 'riskTier');
        if (tone in counts) counts[tone] += 1;
      });
      return counts;
    }
    function currentBlips() {
      const f = filters();
      let blips = null;
      if (live && typeof live.getBlips === 'function') blips = safe(() => live.getBlips(), null, 'live.getBlips');
      if (!Array.isArray(blips)) blips = safe(() => sel.radarBlips(state(), f), [], 'radarBlips');
      if (f.siteId && f.siteId !== 'all') blips = blips.filter((b) => b && (!b.siteId || b.siteId === f.siteId));
      return blips.filter(Boolean);
    }
    function kpiHistory(st, f, current) {
      const base = now().getTime();
      const points = [];
      for (let i = 7; i >= 1; i -= 1) {
        points.push(safe(() => sel.kpis(st, f, new Date(base - i * 7 * DAY_MS)), null, 'kpis.history'));
      }
      points.push(current);
      return points;
    }
    function cellArgs(args) {
      const a = args[0];
      if (a && typeof a === 'object' && !(a instanceof Event)) {
        return { value: a.value, ri: Number(a.ri ?? a.row ?? a.r ?? 0), ci: Number(a.ci ?? a.col ?? a.c ?? 0) };
      }
      return { value: a, ri: Number(args[1]) || 0, ci: Number(args[2]) || 0 };
    }
    const tierOfCell = (ri, ci) => safe(() => sel.riskTier((ri + 1) * (ci + 1)), 'منخفض', 'riskTier');
    const toneOfCell = (ri, ci) => safe(() => sel.tierTone(tierOfCell(ri, ci)), 'good', 'tierTone');

    /* ───────────── table twins ───────────── */
    function blipTable() {
      const blips = currentBlips();
      return simpleTable('المخاطر الظاهرة على الرادار', ['الكود', 'الخطر', 'الموقع', 'الفئة', 'الدرجة', 'المستوى'],
        blips.map((b) => [String(b.code || ''), String(b.label || ''), siteName(b.siteId) || '—', categoryName(b.categoryId), fmt.num(Number(b.score) || 0), String(b.tier || '')]),
        [true, false, false, false, true, false]);
    }
    function matrixTable() {
      const m = safe(() => sel.riskMatrix(state(), filters()), [], 'riskMatrix');
      const header = ['الشدة ↓ / الاحتمالية →', ...LIKELIHOOD_LABELS.map((l, i) => `${fmt.num(i + 1)} ${l}`)];
      const rows = SEVERITY_LABELS.map((l, ri) => [`${fmt.num(ri + 1)} ${l}`, ...LIKELIHOOD_LABELS.map((_, ci) => fmt.num(Number(m[ri] && m[ri][ci]) || 0))]);
      return simpleTable(`مصفوفة المخاطر ${fmt.num(5)}×${fmt.num(5)} — عدد المخاطر المفتوحة`, header, rows, [false, true, true, true, true, true]);
    }
    function trendTable() {
      const t = safe(() => sel.incidentTrend(state(), 12, filters()), [], 'incidentTrend');
      return simpleTable('اتجاه الحوادث الأسبوعي', ['الأسبوع', 'الحوادث', 'الحوادث الوشيكة'],
        t.map((w) => [digits(w.label || ''), fmt.num(Number(w.incidents) || 0), fmt.num(Number(w.nearMisses) || 0)]), [false, true, true]);
    }
    function permitsTable() {
      const parts = safe(() => sel.permitsByStatus(state(), filters()), [], 'permitsByStatus');
      return simpleTable('تصاريح العمل حسب الحالة', ['الحالة', 'العدد'], parts.map((p) => [String(p.label), fmt.num(Number(p.value) || 0)]), [false, true]);
    }

    /* ───────────── renderers ───────────── */
    function renderScope(f) {
      scopeBadge.querySelector('.badge-text').textContent = `${scopeLabel(f)} · ${periodLabel(f)}`;
    }

    function renderHero(k, st, f) {
      const si = k && Number.isFinite(k.safetyIndex) ? k.safetyIndex : 0;
      gaugeHost.replaceChildren(chartOrEmpty(() => charts.gauge({ value: si, max: 100, size: 200, label: 'مؤشر السلامة', sublabel: periodLabel(f) }), 'مؤشر السلامة'));

      const d = k && k.deltas && Number.isFinite(k.deltas.safetyIndex) ? k.deltas.safetyIndex : 0;
      const tone = d > 0 ? 'good' : d < 0 ? 'critical' : 'neutral';
      deltaHost.replaceChildren(
        C.badge(`${fmt.signed(d)} نقطة`, tone),
        h('span', { class: 'text-xs muted' }, 'مقارنة بالفترة السابقة'));

      const fact = (label, value, unit) => h('div', { class: 'fact', style: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: '12px' } },
        h('span', { class: 'fact-label' }, label),
        h('span', { class: 'fact-value nowrap' }, value, unit ? h('small', {}, unit) : null));
      factsHost.replaceChildren(
        fact('أيام بدون إصابة مضيعة للوقت', fmt.num(k ? k.daysSinceLTI : 0), 'يوم'),
        fact('LTIFR — الإصابات المضيعة للوقت', fmt.num(k ? k.ltifr : 0, { maximumFractionDigits: 2 }), '/مليون ساعة'),
        fact('TRIR — الإصابات المسجلة', fmt.num(k ? k.trir : 0, { maximumFractionDigits: 2 }), `/${fmt.num(200)} ألف ساعة`));

      const counts = tierCounts(st, f);
      const total = Object.values(counts).reduce((a, b) => a + b, 0);
      const bar = tryEl(() => charts.segmentedBar({
        parts: TIERS.map((t) => ({ id: t.tone, label: t.tier, value: counts[t.tone], color: `var(--${t.tone})` })),
        tall: false, valueFormat: fmt.num, ariaLabel: 'المخاطر المفتوحة حسب الدرجة',
      }), 'segmentedBar');
      tierHost.replaceChildren(
        h('div', { class: 'row between' },
          h('span', { class: 'radar-side-title' }, 'المخاطر المفتوحة حسب الدرجة'),
          h('span', { class: 'text-xs muted mono' }, pairs(total))),
        bar || toneLegend(TIERS.map((t) => ({ tone: t.tone, label: t.tier, count: counts[t.tone] }))));
    }

    /* Labels/hints are functions: their numbers follow the numerals setting on every refresh.
       Order is fixed (8 tiles → 4×2 on wide screens): incidents, near misses, permits, critical,
       CAPA %, training %, inspections due, TRIR. */
    const TILES = [
      { key: 'openIncidents', label: () => 'الحوادث المفتوحة', icon: 'incident', goodWhen: 'down', hint: () => 'حوادث لم تُغلق بعد ضمن النطاق', tone: (v) => (v > 0 ? 'serious' : null), route: { id: 'incidents' } },
      { key: 'nearMisses30d', label: () => `الحوادث الوشيكة (${fmt.num(30)} يوماً)`, icon: 'nearmiss', goodWhen: 'down', hint: () => `بلاغات الحوادث الوشيكة خلال آخر ${fmt.num(30)} يوماً`, route: { id: 'incidents' } },
      { key: 'activePermits', label: () => 'التصاريح النشطة', icon: 'permit', goodWhen: 'up', hint: () => 'تصاريح عمل سارية الآن', route: { id: 'permits' } },
      { key: 'criticalRisks', label: () => 'المخاطر الحرجة', icon: 'risk', goodWhen: 'down', hint: () => `مخاطر مفتوحة بدرجة ${fmt.num(16)} فأكثر`, tone: (v) => (v > 0 ? 'critical' : null), route: { id: 'risks', params: { tier: 'حرج' } } },
      { key: 'capaClosure', label: () => 'إغلاق الإجراءات التصحيحية', icon: 'check', unit: '%', goodWhen: 'up', hint: () => 'نسبة الإجراءات التصحيحية المنجزة', route: { id: 'incidents' } },
      { key: 'trainingCompliance', label: () => 'الامتثال التدريبي', icon: 'training', unit: '%', goodWhen: 'up', hint: () => 'شهادات سارية للدورات الإلزامية', route: { id: 'training' } },
      { key: 'inspectionsDue', label: () => 'تفتيشات مستحقة', icon: 'inspection', goodWhen: 'down', hint: () => `متأخرة أو مستحقة خلال ${fmt.num(7)} أيام`, tone: (v) => (v > 0 ? 'warning' : null), route: { id: 'inspections' } },
      { key: 'trir', label: () => 'معدل الحوادث المسجلة TRIR', icon: 'trend', goodWhen: 'down', digits: 2, hint: () => `الإصابات المسجلة لكل ${fmt.num(200)} ألف ساعة عمل`, route: { id: 'reports' } },
    ];

    function renderTiles(k, st, f) {
      const hist = kpiHistory(st, f, k);
      kpiRow.replaceChildren(...TILES.map((t) => {
        const raw = k && Number.isFinite(k[t.key]) ? k[t.key] : null;
        const value = raw === null ? null : (t.digits ? fmt.num(raw, { maximumFractionDigits: t.digits }) : raw);
        const d = k && k.deltas && Number.isFinite(k.deltas[t.key]) ? k.deltas[t.key] : null;
        // Always a number: the tile formats it (a pre-formatted fmt.signed string carries bidi marks → NaN → wrong arrow).
        const delta = d === null ? null : (t.digits ? Number(d.toFixed(t.digits)) : d);
        const values = hist.map((p) => (p && Number.isFinite(p[t.key]) ? p[t.key] : 0));
        const spark = tryEl(() => charts.sparkline({ values, width: 84, height: 26 }), 'sparkline');
        const tile = C.statTile({
          label: t.label(), value, unit: t.unit || '', delta, deltaGoodWhen: t.goodWhen, spark,
          icon: ico(t.icon, 18), tone: t.tone ? t.tone(raw) : null, hint: t.hint(),
          onClick: t.route ? () => router.navigate(t.route.id, t.route.params || {}) : null,
        });
        tile.setAttribute('role', 'listitem');
        return tile;
      }));
    }

    function renderMatrix(st, f) {
      const m = safe(() => sel.riskMatrix(st, f), Array.from({ length: 5 }, () => Array(5).fill(0)), 'riskMatrix');
      matrixHost.replaceChildren(chartOrEmpty(() => charts.heatmap({
        rows: SEVERITY_LABELS.map((l, i) => `${fmt.num(i + 1)} ${l}`),
        cols: LIKELIHOOD_LABELS.map((l, i) => `${fmt.num(i + 1)} ${l}`),
        cells: m,
        colorFor: (value, ri, ci) => `var(--${toneOfCell(Number(ri) || 0, Number(ci) || 0)})`,
        labelFor: (value) => (value ? fmt.num(value) : ''),
        onCellClick: (...args) => { const c = cellArgs(args); router.navigate('risks', { tier: tierOfCell(c.ri, c.ci) }); },
        cellSize: 'auto', ariaLabel: `مصفوفة المخاطر ${fmt.num(5)}×${fmt.num(5)}`, rowTitle: 'الشدة', colTitle: 'الاحتمالية',
      }), 'مصفوفة المخاطر'));
      const counts = tierCounts(st, f);
      matrixLegendHost.replaceChildren(toneLegend(TIERS.map((t) => ({ tone: t.tone, label: t.tier, count: counts[t.tone] })), 'matrix-legend'));
    }

    function renderTrend(st, f) {
      const t = safe(() => sel.incidentTrend(st, 12, f), [], 'incidentTrend');
      trendHost.replaceChildren(chartOrEmpty(() => charts.lineChart({
        series: [
          { id: 'incidents', label: 'الحوادث', color: 'var(--s1)', values: t.map((w) => Number(w.incidents) || 0) },
          { id: 'nearMisses', label: 'الحوادث الوشيكة', color: 'var(--s2)', values: t.map((w) => Number(w.nearMisses) || 0) },
        ],
        labels: t.map((w) => digits(w.label || '')), height: 220, yFormat: fmt.num, ariaLabel: 'اتجاه الحوادث الأسبوعي',
      }), 'اتجاه الحوادث'));
    }

    function renderPermits(st, f) {
      const parts = safe(() => sel.permitsByStatus(st, f), [], 'permitsByStatus');
      const colored = parts.map((p, i) => ({ id: String(p.id || i), label: String(p.label), value: Number(p.value) || 0, color: safe(() => charts.paletteFor(i), `var(--s${(i % 8) + 1})`, 'paletteFor') }));
      permitsHost.replaceChildren(chartOrEmpty(() => charts.segmentedBar({ parts: colored, tall: true, valueFormat: fmt.num, ariaLabel: 'تصاريح العمل حسب الحالة' }), 'تصاريح العمل'));
      const total = colored.reduce((a, p) => a + p.value, 0);
      permitsListHost.replaceChildren(h('dl', { class: 'kv is-compact' },
        ...colored.map((p) => h('div', { class: 'kv-row' },
          h('dt', {}, h('span', { class: 'row gap-2' }, h('span', { class: 'legend-key', style: { '--key': p.color } }), p.label)),
          h('dd', { class: 'mono' }, total ? `${fmt.num(p.value)} · ${fmt.pct((p.value / total) * 100)}` : fmt.num(p.value))))));
    }

    /* Column `priority` lets the table hide low/medium columns in narrow containers (dataTable
       container query); the first (name) column stays sticky. Site names wrap instead of truncating. */
    function siteColumns() {
      return [
        { key: 'name', label: 'الموقع', priority: 'high', sortValue: (r) => r.site.name, render: (r) => h('div', { class: 'stack gap-1', style: { minInlineSize: '120px' } }, h('strong', { style: { whiteSpace: 'normal' } }, r.site.name), h('span', { class: 'muted text-xs mono' }, String(r.site.code || ''))) },
        { key: 'city', label: 'المدينة', priority: 'low', sortValue: (r) => r.site.city, render: (r) => String(r.site.city || '') },
        { key: 'phase', label: 'المرحلة', priority: 'low', sortValue: (r) => r.site.phase, render: (r) => h('span', { style: { display: 'inline-block', maxInlineSize: '170px', verticalAlign: 'middle', whiteSpace: 'normal' }, title: String(r.site.phase || '') }, String(r.site.phase || '')) },
        { key: 'workers', label: 'العمال', priority: 'medium', align: 'end', sortValue: (r) => Number(r.site.workers) || 0, render: (r) => fmt.num(Number(r.site.workers) || 0) },
        { key: 'score', label: 'مؤشر السلامة', priority: 'high', width: 160, sortValue: (r) => r.score, render: (r) => h('div', { class: 'progress-row' }, C.progress({ value: r.score, max: 100, tone: scoreTone(r.score), label: `مؤشر السلامة ${fmt.num(r.score)}` }), h('span', { class: 'progress-value' }, fmt.num(r.score))) },
        { key: 'trend', label: 'الاتجاه', priority: 'low', sortable: false, render: (r) => tryEl(() => charts.sparkline({ values: arr(r.trend), width: 80, height: 24 }), 'sparkline') || '—' },
        { key: 'openRisks', label: 'مخاطر مفتوحة', priority: 'high', align: 'end', sortValue: (r) => r.openRisks, render: (r) => (r.criticalRisks > 0 ? h('span', { class: 'row gap-2', style: { justifyContent: 'flex-end' } }, C.badge(`${fmt.num(r.criticalRisks)} حرج`, 'critical'), fmt.num(r.openRisks)) : fmt.num(r.openRisks)) },
        { key: 'openIncidents', label: 'حوادث مفتوحة', priority: 'medium', align: 'end', sortValue: (r) => r.openIncidents, render: (r) => fmt.num(r.openIncidents) },
      ];
    }

    function renderSites(st) {
      const rows = safe(() => sel.siteScores(st), [], 'siteScores').filter((r) => r && r.site).map((r) => ({ id: r.site.id, ...r }));
      if (!sitesTable) {
        sitesTable = C.dataTable({
          columns: siteColumns(), rows, rowKey: 'id', pageSize: 6, dense: true, caption: 'أداء المواقع', stickyFirst: true,
          initialSort: { key: 'score', dir: 'asc' }, emptyText: 'لا توجد مواقع مسجلة',
          onRowClick: (row) => {
            const previous = filters().siteId;
            store.setFilter('siteId', row.id);
            C.toast(`تم تطبيق فلتر الموقع: ${row.site.name}`, { tone: 'accent', action: { label: 'تراجع', onClick: () => store.setFilter('siteId', previous || 'all') } });
          },
        });
        sitesHost.replaceChildren(sitesTable.el);
      } else {
        sitesTable.update(rows);
      }
    }

    function renderUrgent(st, f) {
      const all = safe(() => sel.urgentActions(st), [], 'urgentActions').filter((a) => a && (f.siteId === 'all' || !a.siteId || a.siteId === f.siteId));
      const items = all.slice(0, 8);
      const todayStart = new Date(now().getFullYear(), now().getMonth(), now().getDate()).getTime();
      urgentCount.textContent = all.length ? `${fmt.num(all.length)} إجراء بانتظار التدخل` : 'لا توجد إجراءات متأخرة';
      if (!items.length) {
        urgentHost.replaceChildren(C.emptyState({ icon: ico('check', 32), title: 'كل شيء ضمن المواعيد', text: 'لا توجد مخاطر متأخرة أو تصاريح على وشك الانتهاء أو تفتيشات متأخرة في هذا النطاق.' }));
        return;
      }
      const list = h('ul', { class: 'urgent-list', role: 'list' }, items.map((a) => {
        const meta = KIND_META[a.kind] || { label: 'إجراء', icon: 'alert' };
        const tone = a.tone || 'warning';
        const dueMs = parseMs(a.due);
        const overdue = Number.isFinite(dueMs) && dueMs < todayStart;
        return h('li', {}, h('a', { class: ['urgent-item', `tone-${tone}`, overdue ? 'is-overdue' : null], href: a.href || '#/overview' },
          h('span', { class: 'urgent-icon' }, ico(meta.icon, 15)),
          h('span', { class: 'urgent-text' },
            h('span', {}, String(a.text || '')),
            h('span', { class: 'urgent-sub' }, [meta.label, siteName(a.siteId)].filter(Boolean).join(' · '))),
          h('span', { class: 'urgent-due' },
            C.badge(TONE_LABEL[tone] || tone, tone),
            h('span', {}, Number.isFinite(dueMs) ? (overdue ? `منذ ${fmt.date(a.due, { style: 'short' })}` : fmt.date(a.due, { style: 'short' })) : '—'))));
      }));
      styleUrgentList(list);
      urgentHost.replaceChildren(list);
    }

    function renderRadarMeta(st, f) {
      const blips = currentBlips();
      const counts = { critical: 0, serious: 0, warning: 0, good: 0 };
      blips.forEach((b) => { if (b.tone in counts) counts[b.tone] += 1; });
      radarLegendHost.replaceChildren(toneLegend(TIERS.map((t) => ({ tone: t.tone, label: t.tier, count: counts[t.tone] })), 'radar-legend'));
      blipCount.textContent = `${pairs(blips.length)} مفتوحة على الرادار · ${scopeLabel(f)}`;
      canvas.setAttribute('aria-label', `رادار المخاطر الحي: ${pairs(blips.length)} مفتوحة، منها ${fmt.num(counts.critical)} حرجة`);
    }

    /* ───────────── radar hover tooltip ───────────── */
    function placeTip(pt) {
      // Radar hover info (§6 engine): {x, y} = {localX, localY} canvas-local CSS px; {clientX, clientY} viewport.
      const rect = radarWrap.getBoundingClientRect();
      const c = canvas.getBoundingClientRect();
      let x;
      let y;
      if (pt && Number.isFinite(pt.localX) && Number.isFinite(pt.localY)) {
        x = pt.localX + (c.left - rect.left);
        y = pt.localY + (c.top - rect.top);
      } else if (pt && Number.isFinite(pt.clientX) && Number.isFinite(pt.clientY)) {
        x = pt.clientX - rect.left;
        y = pt.clientY - rect.top;
      } else if (pt && Number.isFinite(pt.x) && Number.isFinite(pt.y)) {
        x = pt.x + (c.left - rect.left);
        y = pt.y + (c.top - rect.top);
      } else {
        x = rect.width / 2;
        y = 16;
      }
      const tw = tip.offsetWidth || 200;
      const th = tip.offsetHeight || 80;
      const rtl = getComputedStyle(document.documentElement).direction !== 'ltr';
      const anchorStart = rtl ? rect.width - x : x;
      let start = anchorStart + 14;
      let top = y + 14;
      if (start + tw > rect.width - 4) start = Math.max(4, anchorStart - tw - 14);
      if (top + th > rect.height - 4) top = Math.max(4, y - th - 14);
      tip.style.insetInlineStart = `${Math.round(start)}px`;
      tip.style.insetBlockStart = `${Math.round(top)}px`;
    }
    function showTip(blip, pt) {
      if (!blip) { tip.hidden = true; return; }
      const row = (label, value) => h('div', { class: 'tooltip-row' }, h('span', {}, label), h('strong', {}, value));
      const tierBadge = blip.tier ? C.tierBadge(blip.tier) : null;
      tip.replaceChildren(
        h('div', { class: 'tooltip-title' }, h('span', { class: 'blip-code' }, String(blip.code || '')), ' ', String(blip.label || '')),
        h('div', { class: 'tooltip-rows' },
          row('الموقع', siteName(blip.siteId) || '—'),
          row('الفئة', categoryName(blip.categoryId)),
          row('الدرجة', fmt.num(Number(blip.score) || 0))),
        h('div', { class: 'row gap-2', style: { marginBlockStart: '6px' } }, tierBadge, h('span', { class: 'tooltip-kbd' }, 'انقر للانتقال إلى السجل')));
      tip.hidden = false;
      placeTip(pt);
    }
    frame.addEventListener('pointerleave', () => { tip.hidden = true; });
    frame.addEventListener('click', () => { if (!tip.hidden) router.navigate('risks'); });

    /* ───────────── sweep radar ───────────── */
    function startRadar() {
      if (typeof R.SweepRadar !== 'function') { warn('radar', new Error('SweepRadar غير متاح')); return; }
      try {
        sweep = new R.SweepRadar(canvas, {
          rings: 4,
          sectors: 12,
          sectorLabels: categories().map((c) => SHORT_CATEGORY[c.id] || c.name),
          sweepDegPerSec: 22,
          getBlips: currentBlips,
          onHover: showTip,
          showLabels: true,
        });
        if (typeof sweep.setHoverHandler === 'function') sweep.setHoverHandler(showTip);
        if (typeof sweep.start === 'function') sweep.start(); // start() registers with the shared radarLoop
      } catch (err) { warn('radar.start', err); sweep = null; }
    }

    /* ───────────── formula modal ───────────── */
    function openFormulaModal() {
      const W = { ...DEFAULT_WEIGHTS, ...(selectorsMod.SAFETY_INDEX_WEIGHTS || {}) };
      const ltiBase = Number(selectorsMod.LTIFR_BASE_HOURS) || 1_000_000;
      const trirBase = Number(selectorsMod.TRIR_BASE_HOURS) || 200_000;
      const hoursDay = Number(selectorsMod.HOURS_PER_WORKER_DAY) || 9;
      const minus = (n) => `−${fmt.num(n, { maximumFractionDigits: 1 })}`;
      const body = h('div', { class: 'stack gap-3' },
        h('p', {}, `يبدأ المؤشر من ${fmt.num(W.base)} نقطة، وتُخصم منه أوزان ثابتة لكل عامل خطر مفتوح أو حدث حديث، ويُضاف إليه جزء من نسبة الامتثال التدريبي، ثم تُحصر النتيجة بين ${fmt.num(0)} و${fmt.num(100)}.`),
        C.kv([
          ['مخاطرة حرجة مفتوحة', `${minus(W.criticalOpen)} نقطة لكل مخاطرة`],
          ['مخاطرة عالية مفتوحة', `${minus(W.highOpen)} نقطة لكل مخاطرة`],
          ['مخاطرة تجاوزت موعد المعالجة', `${minus(W.overdueOpen)} نقطة لكل مخاطرة`],
          [`إصابة مضيعة للوقت (آخر ${fmt.num(90)} يوماً)`, `${minus(W.lti90)} نقطة لكل إصابة`],
          [`إصابة تطلبت علاجاً طبياً (آخر ${fmt.num(90)} يوماً)`, `${minus(W.mtc90)} نقطة لكل إصابة`],
          [`حادث وشيك (آخر ${fmt.num(30)} يوماً)`, `${minus(W.nearMiss30)} نقطة لكل حادث`],
          ['الامتثال التدريبي', `+${fmt.num(W.trainingPct, { maximumFractionDigits: 1 })} نقطة لكل ${fmt.pct(1)}`],
        ]),
        h('div', { class: 'note' },
          h('strong', {}, 'LTIFR'), ` = (الإصابات المضيعة للوقت × ${fmt.num(ltiBase)}) ÷ ساعات العمل · `,
          h('strong', {}, 'TRIR'), ` = (الإصابات المسجلة × ${fmt.num(trirBase)}) ÷ ساعات العمل، بافتراض ${fmt.num(hoursDay)} ساعات لكل عامل يومياً ضمن الفترة المحددة.`));
      overlay = C.modal({ title: 'كيف يُحسب مؤشر السلامة؟', subtitle: 'الصيغة المعتمدة في مركز القيادة', body, actions: [{ label: 'حسناً', variant: 'primary' }], size: 'md', onClose: () => { overlay = null; } });
      overlay.open();
    }

    /* ───────────── refresh orchestration ───────────── */
    function refresh() {
      if (destroyed) return;
      const st = state();
      const f = filters();
      const k = safe(() => sel.kpis(st, f), null, 'kpis');
      renderScope(f);
      // Static subtitles carry numbers → re-set so a numerals change is honoured everywhere.
      setSub(radarCard, `${fmt.num(12)} قطاعاً بحسب فئة الخطر — المخاطر الأشد تقترب من المركز`);
      setSub(trendCard, `آخر ${fmt.num(12)} أسبوعاً — الحوادث مقابل الحوادث الوشيكة`);
      setSub(sitesCard, `مؤشر السلامة لكل موقع مع اتجاه ${fmt.num(12)} أسبوعاً — انقر موقعاً لتصفية اللوحة عليه`);
      renderHero(k, st, f);
      renderTiles(k, st, f);
      renderMatrix(st, f);
      renderTrend(st, f);
      renderPermits(st, f);
      renderSites(st);
      renderUrgent(st, f);
      renderRadarMeta(st, f);
    }
    function schedule() {
      if (destroyed || raf) return;
      raf = requestAnimationFrame(() => { raf = 0; refresh(); });
    }
    function tickClock() {
      // Paused while the tab is hidden (no DOM writes nobody can see); resumes on visibilitychange.
      if (document.hidden) return;
      updatedText.textContent = `آخر تحديث ${fmt.relative(lastChangeAt)}`;
    }
    const onVisibility = () => { if (!destroyed && !document.hidden) tickClock(); };
    document.addEventListener('visibilitychange', onVisibility);

    refresh();
    tickClock();
    startRadar();

    subs.push(bus.on('store:change', (p) => {
      lastChangeAt = Date.now();
      const path = String((p && p.path) || '*');
      if (/^(feed|sensors|integrations|platform\.(?!aiRisks|tasks|alerts))/.test(path)) return;
      schedule();
    }));
    subs.push(bus.on('filters:change', schedule));
    subs.push(bus.on('settings:change', schedule));
    timers.push(setInterval(tickClock, 1000));

    /* ───────────── cleanup ───────────── */
    return function cleanup() {
      destroyed = true;
      document.removeEventListener('visibilitychange', onVisibility);
      subs.splice(0).forEach((off) => { try { off(); } catch { /* ignore */ } });
      timers.splice(0).forEach((t) => { clearInterval(t); clearTimeout(t); });
      if (raf) { cancelAnimationFrame(raf); raf = 0; }
      if (layoutObserver) { try { layoutObserver.disconnect(); } catch { /* ignore */ } layoutObserver = null; }
      if (layoutRaf) { cancelAnimationFrame(layoutRaf); layoutRaf = 0; }
      if (sweep) {
        try { if (typeof sweep.stop === 'function') sweep.stop(); } catch { /* ignore */ }
        try { if (R.radarLoop && typeof R.radarLoop.remove === 'function') R.radarLoop.remove(sweep); } catch { /* ignore */ }
        try { if (typeof sweep.destroy === 'function') sweep.destroy(); } catch { /* ignore */ }
        sweep = null;
      }
      if (overlay) { try { overlay.close(); } catch { /* ignore */ } overlay = null; }
      try { if (charts && charts.tooltip && typeof charts.tooltip.hide === 'function') charts.tooltip.hide(); } catch { /* ignore */ }
      tip.hidden = true;
    };
  },
};
