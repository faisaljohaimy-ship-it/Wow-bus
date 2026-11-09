/**
 * Biltix HSE — SEC-02 الرادار الحي (js/views/radar.js)
 *
 * The live radar room: a strip of six telemetry chips refreshed every second, then four
 * continuously animated Canvas radars (SweepRadar, SensorRadar, SitePlanRadar,
 * ComplianceRadar) inside `.radar-grid`. Each card carries a mono telemetry strip
 * (`.radar-telemetry`), a tone legend and a "last update" relative time.
 *
 * Site-sensitive radars (sensors, site plan) follow the global site filter; 'all' → S1.
 * Radars are created in render() and stopped + destroyed in the cleanup function; the
 * shared loop's FPS is shown as a discreet mono chip in the view head.
 *
 * Contract: docs/ARCHITECTURE.md §6 (radar engine), §7 (live), §8.2 (this view).
 */

import * as seedMod from '../data/seed.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const CLOSED = 'مغلق';
const ISO_TARGET = 85;
const SWEEP_DEG_PER_SEC = 22;

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
const CHIPS = [
  { id: 'sensors', label: 'الحساسات النشطة', icon: 'sensor', unit: 'حسّاس' },
  { id: 'alerts', label: 'التنبيهات آخر ساعة', icon: 'alert', unit: 'تنبيه' },
  { id: 'people', label: 'الأشخاص في الموقع', icon: 'users', unit: 'شخص' },
  { id: 'vehicles', label: 'المعدات المتحركة', icon: 'truck', unit: 'معدّة' },
  { id: 'wind', label: 'سرعة الرياح', icon: 'wind', unit: 'كم/س' },
  { id: 'wbgt', label: 'WBGT', title: 'مؤشر الإجهاد الحراري (درجة حرارة الكرة الرطبة)', icon: 'thermo', unit: '°م' },
];

const ICONS = {
  gauge: ['M4 15a8 8 0 0 1 16 0', 'M12 15l4-5', 'c:12,15,1.2'],
  pause: ['M8 5v14', 'M16 5v14'],
  play: ['M7 4l13 8-13 8z'],
  clock: ['c:12,12,9', 'M12 7v5l3 2'],
  sensor: ['c:12,12,2.2', 'M8.5 8.5a5 5 0 0 0 0 7', 'M15.5 8.5a5 5 0 0 1 0 7', 'M5.6 5.6a9 9 0 0 0 0 12.8', 'M18.4 5.6a9 9 0 0 1 0 12.8'],
  alert: ['M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z', 'M10 20a2 2 0 0 0 4 0'],
  users: ['c:9,8,3.5', 'M3 20a6 6 0 0 1 12 0', 'c:17,9,2.5', 'M15.5 20a5 5 0 0 1 5.5-5'],
  truck: ['M3 7h11v9H3z', 'M14 10h4l3 3v3h-7z', 'c:7,18,1.8', 'c:17,18,1.8'],
  wind: ['M3 8h11a3 3 0 1 0-3-3', 'M3 12h16a3 3 0 1 1-3 3', 'M3 16h8a2 2 0 1 1-2 2'],
  thermo: ['M10 14.5V5a2 2 0 0 1 4 0v9.5a3.5 3.5 0 1 1-4 0z', 'M12 10v7'],
  radar: ['c:12,12,9', 'c:12,12,5', 'M12 12l6-6', 'M12 3v2'],
  site: ['M4 20h16', 'M6 20V8l6-4 6 4v12', 'M10 20v-5h4v5'],
  map: ['M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2z', 'M9 4v14', 'M15 6v14'],
  shield: ['M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z', 'M9 12l2 2 4-4'],
  check: ['M5 12.5l4.5 4.5L19 7.5'],
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
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : null);

export default {
  id: 'radar',
  code: 'SEC-02',
  title: 'الرادار الحي',
  icon: 'radar',

  render(container, ctx) {
    const { store, bus, sel, fmt, router, live, art } = ctx;
    const C = ctx.components || {};
    const { h } = C;
    const R = ctx.radar || {};
    const loop = R.radarLoop || null;

    /* ───────────── helpers ───────────── */
    const warned = new Set();
    const warn = (where, err) => {
      const key = `${where}:${err && err.message}`;
      if (warned.has(key)) return;
      warned.add(key);
      console.warn(`[radar-view] ${where}:`, err);
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
    const state = () => store.state || {};
    const filters = () => ({ siteId: 'all', range: 30, search: '', ...(store.filters || (store.state && store.state.filters) || {}) });
    const sites = () => arr(state().sites);
    const siteById = (id) => sites().find((s) => s.id === id) || null;
    const siteName = (id) => { const s = siteById(id); return s ? s.name : ''; };
    /** Site the sensor/site-plan radars follow: the global filter, or S1 (first site) for 'all'. */
    const siteFor = () => {
      const f = filters();
      if (f.siteId && f.siteId !== 'all' && siteById(f.siteId)) return f.siteId;
      return siteById('S1') ? 'S1' : (sites()[0] ? sites()[0].id : 'S1');
    };
    const fmtValue = (v) => (v === null ? '—' : fmt.num(v, { maximumFractionDigits: Math.abs(v) < 10 ? 1 : 0 }));

    function simpleTable(caption, headers, rows, numeric = []) {
      const table = h('table', { class: 'chart-table' });
      table.appendChild(h('caption', {}, caption));
      table.appendChild(h('thead', {}, h('tr', {}, headers.map((label, i) => h('th', { scope: 'col', class: numeric[i] ? 'num' : null }, label)))));
      table.appendChild(h('tbody', {}, rows.length
        ? rows.map((r) => h('tr', {}, r.map((cell, i) => h('td', { class: numeric[i] ? 'num' : null }, cell))))
        : h('tr', {}, h('td', { colspan: String(headers.length), class: 'muted' }, 'لا توجد بيانات'))));
      return table;
    }
    function toneLegend(items) {
      return h('ul', { class: 'radar-legend', role: 'list', 'aria-label': 'دليل الألوان' }, items.map((it) => h('li', { class: ['radar-legend-item', `tone-${it.tone}`] },
        C.glyph(it.tone, 12), h('span', { class: 'legend-key' }), h('span', {}, it.label))));
    }

    /* Telemetry strips: rebuilt only when the row set changes; otherwise text nodes are patched. */
    const teleRefs = new WeakMap();
    function setTelemetry(ul, rows) {
      const signature = rows.map((r) => r.key).join('|');
      let refs = teleRefs.get(ul);
      if (!refs || refs.signature !== signature) {
        refs = { signature, rows: new Map() };
        ul.replaceChildren(...rows.map((r) => {
          const text = document.createTextNode('');
          const unit = h('span', { class: 'tele-unit' });
          const value = h('span', { class: 'tele-value' }, text, unit);
          const li = h('li', { class: 'tele-row' }, h('span', { class: 'tele-label', title: r.label }, r.label), value);
          refs.rows.set(r.key, { li, text, unit });
          return li;
        }));
        teleRefs.set(ul, refs);
      }
      rows.forEach((r) => {
        const ref = refs.rows.get(r.key);
        if (!ref) return;
        const v = String(r.value);
        if (ref.text.data !== v) ref.text.data = v;
        const u = r.unit ? ` ${r.unit}` : '';
        if (ref.unit.textContent !== u) ref.unit.textContent = u;
        ref.li.classList.toggle('is-alert', r.state === 'alert');
        ref.li.classList.toggle('is-warn', r.state === 'warn');
      });
    }
    const setText = (node, value) => { const v = String(value); if (node.textContent !== v) node.textContent = v; };
    const setDotTone = (dot, tone) => {
      const want = `tone-${tone}`;
      if (dot.classList.contains(want)) return;
      Array.from(dot.classList).filter((c) => c.startsWith('tone-')).forEach((c) => dot.classList.remove(c));
      dot.classList.add(want);
    };

    /* ───────────── lifecycle registers ───────────── */
    const subs = [];
    const timers = [];
    let destroyed = false;
    let paused = false;
    let lastChangeAt = Date.now();
    let lastSensorAt = Date.now();
    let followedSite = siteFor();
    const radars = { sweep: null, sensor: null, plan: null, compliance: null };
    let currentAxes = [];
    let isoCache = { at: 0, clauses: [] };

    const makeRadar = (Cls, canvas, opts, label) => {
      if (typeof Cls !== 'function') { warn(`radar:${label}`, new Error(`${label} غير متاح في radar.js`)); return null; }
      try {
        const r = new Cls(canvas, opts);
        if (typeof r.start === 'function') r.start();
        return r;
      } catch (err) { warn(`radar:${label}`, err); return null; }
    };
    const killRadar = (r) => {
      if (!r) return;
      try { if (typeof r.stop === 'function') r.stop(); } catch { /* ignore */ }
      try { if (loop && typeof loop.remove === 'function') loop.remove(r); } catch { /* ignore */ }
      try { if (typeof r.destroy === 'function') r.destroy(); } catch { /* ignore */ }
    };
    const replaceCanvas = (card) => {
      const fresh = card.canvas.cloneNode(false);
      card.canvas.replaceWith(fresh);
      card.canvas = fresh;
      return fresh;
    };

    /* ───────────── live data accessors (all guarded) ───────────── */
    function currentBlips() {
      const f = filters();
      let blips = null;
      if (live && typeof live.getBlips === 'function') blips = safe(() => live.getBlips(), null, 'live.getBlips');
      if (!Array.isArray(blips)) blips = safe(() => sel.radarBlips(state(), f), [], 'radarBlips');
      if (f.siteId && f.siteId !== 'all') blips = blips.filter((b) => b && (!b.siteId || b.siteId === f.siteId));
      return blips.filter(Boolean);
    }
    /** Axes for a site; only sensors that truly belong to it (selector may fall back to another site). */
    function axesFor(siteId) {
      const axes = safe(() => sel.sensorAxes(state(), siteId), [], 'sensorAxes');
      return axes.length ? axes : [];
    }
    /** Live sensor values aligned with `axes` (live engine → store values → axis defaults). */
    function valuesFor(siteId, axes) {
      let vals = null;
      if (live && typeof live.getSensorValues === 'function') vals = safe(() => live.getSensorValues(siteId), null, 'live.getSensorValues');
      const sensors = arr(state().sensors);
      return axes.map((a, i) => {
        if (Array.isArray(vals) && Number.isFinite(vals[i])) return vals[i];
        const s = sensors.find((x) => x && x.id === a.id);
        return s && Number.isFinite(Number(s.value)) ? Number(s.value) : (Number(a.value) || 0);
      });
    }
    function pingsFor(siteId) {
      if (!live || typeof live.getPings !== 'function') return [];
      const p = safe(() => live.getPings(siteId), [], 'live.getPings');
      return Array.isArray(p) ? p : [];
    }
    function hazardsFor(siteId) {
      if (live && typeof live.getHazards === 'function') {
        const hz = safe(() => live.getHazards(siteId), null, 'live.getHazards');
        if (Array.isArray(hz)) return hz;
      }
      const site = siteById(siteId);
      const zones = arr(site && site.zones);
      return arr(state().risks)
        .filter((r) => r && r.siteId === siteId && r.status !== CLOSED && r.zoneId)
        .map((r) => {
          const z = zones.find((x) => x.id === r.zoneId);
          if (!z) return null;
          const tone = safe(() => sel.tierTone(sel.riskTier(sel.riskScore(r))), 'warning', 'riskTier');
          return { x: z.x + z.w / 2, y: z.y + z.h / 2, tone, label: r.hazard || r.code };
        })
        .filter(Boolean);
    }
    function isoClauses() {
      const t = Date.now();
      if (t - isoCache.at > 1000) isoCache = { at: t, clauses: safe(() => sel.isoScores(state()), [], 'isoScores') };
      return isoCache.clauses;
    }
    const isoOverall = () => {
      const c = isoClauses();
      return c.length ? Math.round(c.reduce((a, x) => a + (Number(x.score) || 0), 0) / c.length) : 0;
    };

    /* ───────────── view head ───────────── */
    const root = h('section', { class: 'view view-radar' });
    const fpsText = h('span', {}, 'FPS —');
    const fpsChip = h('span', { class: 'chip is-sm mono', title: 'الإطارات في الثانية لحلقة الرسم المشتركة', 'aria-label': 'معدل الإطارات' }, ico('gauge', 14), fpsText);
    const siteBadge = C.badge('', 'brand', { icon: ico('building', 14) });
    const pauseBtn = C.button('إيقاف الحركة مؤقتًا', {
      variant: 'outline', size: 'sm', icon: ico('pause', 14),
      attrs: { 'aria-pressed': 'false', title: 'إيقاف حركة الرادارات مؤقتًا (تبقى البيانات حية)' },
      onClick: () => setPaused(!paused),
    });
    root.appendChild(h('div', { class: 'view-head' },
      h('div', { class: 'view-head-text' },
        h('span', { class: 'code-tag' }, 'SEC-02'),
        h('h1', { tabindex: '-1' }, 'الرادار الحي'),
        h('p', { class: 'view-lead' }, 'أربعة رادارات تعمل على مدار الساعة: مسح المخاطر المفتوحة حسب الفئة، قراءات الحساسات اللحظية، حركة العمال والمعدات على مخطط الموقع، ودرجات الامتثال لمعيار ISO 45001.')),
      h('div', { class: 'view-actions' }, siteBadge, fpsChip, pauseBtn)));

    /* ───────────── live chips strip ───────────── */
    const chipRefs = new Map();
    const strip = h('div', { class: 'live-strip', role: 'list', 'aria-label': 'القياسات الحية' }, CHIPS.map((c) => {
      const value = h('span', {}, '—');
      const unit = h('span', { class: 'live-chip-unit' }, c.unit);
      const dot = C.liveDot('accent');
      const el = h('div', { class: 'live-chip', role: 'listitem', 'data-chip': c.id, title: c.title || c.label },
        ico(c.icon, 18),
        h('div', { class: 'live-chip-text' },
          h('span', { class: 'live-chip-label' }, c.label),
          h('span', { class: 'live-chip-value' }, value, unit)),
        dot);
      chipRefs.set(c.id, { el, value, unit, dot });
      return el;
    }));
    root.appendChild(strip);
    // Six chips in one row when the strip is wide enough, otherwise balanced 3+3 / 2+2+2 (never 5+1).
    const fitStrip = (w) => { strip.style.gridTemplateColumns = w >= 900 ? 'repeat(6, minmax(0, 1fr))' : w >= 520 ? 'repeat(3, minmax(0, 1fr))' : 'repeat(2, minmax(0, 1fr))'; };
    let stripObserver = null;
    if (typeof ResizeObserver === 'function') {
      stripObserver = new ResizeObserver((entries) => { for (const e of entries) fitStrip(e.contentRect.width); });
      stripObserver.observe(strip);
    } else {
      fitStrip(strip.getBoundingClientRect().width || 900);
    }

    /* ───────────── radar cards ───────────── */
    function radarCard({ code, title, subtitle, caption, wide, large, landscape, legend, tableView, sideTitle, actions = [] }) {
      const canvas = h('canvas', { class: 'radar-canvas', role: 'img', 'aria-label': title });
      const captionEl = h('span', { class: 'radar-caption' }, caption);
      // The site plan is a 30°-sheared parallelogram → 4:3 frame (`.is-landscape`); the dials stay square.
      const frame = h('div', { class: ['radar-frame', landscape ? 'is-landscape' : 'is-wide', large ? 'is-hero' : null] },
        canvas, h('span', { class: 'radar-status' }, C.liveDot('accent'), 'مباشر'), captionEl);
      const tip = h('div', { class: 'tooltip radar-tip', hidden: true, style: { position: 'absolute', insetBlockStart: '0', insetInlineStart: '0', pointerEvents: 'none', zIndex: '2' } });
      const wrap = h('div', { style: { position: 'relative', inlineSize: '100%', maxInlineSize: large ? '720px' : '560px', marginInline: 'auto' } }, frame, tip);
      const tele = h('ul', { class: 'radar-telemetry', role: 'list' });
      const updatedText = h('span', {});
      const side = h('div', { class: 'radar-side' },
        h('span', { class: 'radar-side-title' }, sideTitle),
        tele,
        toneLegend(legend),
        h('span', { class: 'tele-updated' }, ico('clock', 13), updatedText));
      const body = h('div', { class: ['radar-layout', wide ? null : 'is-stacked'] }, wrap, side);
      const card = C.card({ code, title, subtitle, body, tableView, actions, className: wide ? 'is-wide' : '' });
      return { card, canvas, frame, tip, wrap, tele, updatedText, captionEl };
    }

    const sweepCard = radarCard({
      code: 'RDR-01', title: 'رادار المخاطر', subtitle: 'المخاطر المفتوحة موزعة على 12 قطاعًا بحسب فئة الخطر — الأشد تقترب من المركز',
      caption: `SWEEP · ${SWEEP_DEG_PER_SEC}°/s · 12 SECTORS`, wide: true, large: true, sideTitle: 'القياسات',
      legend: TIERS.map((t) => ({ tone: t.tone, label: t.tier })),
      tableView: () => simpleTable('المخاطر الظاهرة على الرادار', ['الكود', 'الخطر', 'الموقع', 'الفئة', 'الدرجة', 'المستوى'],
        currentBlips().map((b) => [String(b.code || ''), String(b.label || ''), siteName(b.siteId) || '—', categoryName(b.categoryId), fmt.num(Number(b.score) || 0), String(b.tier || '')]),
        [true, false, false, false, true, false]),
    });
    const sensorSiteBadge = C.badge('', 'neutral', { icon: ico('building', 12) });
    const sensorCard = radarCard({
      code: 'RDR-02', title: 'رادار الحساسات', subtitle: 'قراءات لحظية من بوابة الحساسات (غازات، ضوضاء، حرارة، غبار، رياح) مقابل حدود الإنذار',
      caption: 'SENSOR', wide: false, sideTitle: 'القراءات الحية', actions: [sensorSiteBadge],
      legend: [{ tone: 'accent', label: 'القراءة الحية' }, { tone: 'warning', label: 'قريب من الحد' }, { tone: 'critical', label: 'تجاوز حد الإنذار' }],
      tableView: () => {
        const axes = currentAxes;
        const vals = valuesFor(followedSite, axes);
        return simpleTable('قراءات الحساسات', ['الحسّاس', 'القراءة', 'حد الإنذار', 'الحد الأقصى'],
          axes.map((a, i) => [`${a.label}${a.unit ? ` (${a.unit})` : ''}`, fmtValue(num(vals[i])), fmtValue(num(a.threshold)), fmtValue(num(a.max))]), [false, true, true, true]);
      },
    });
    const planSiteBadge = C.badge('', 'neutral', { icon: ico('building', 12) });
    const planCard = radarCard({
      code: 'RDR-03', title: 'رادار مخطط الموقع', subtitle: 'مناطق الموقع بمنظور أيزومتري مع حركة العمال والمعدات ونبضات مواضع الخطر',
      caption: 'PLAN', wide: false, landscape: true, sideTitle: 'الحركة على الموقع', actions: [planSiteBadge],
      legend: [{ tone: 'neutral', label: 'عامل' }, { tone: 'accent', label: 'مركبة / رافعة' }, { tone: 'critical', label: 'خطر حرج' }, { tone: 'serious', label: 'خطر عالٍ' }, { tone: 'warning', label: 'خطر متوسط' }],
      tableView: () => {
        const site = siteById(followedSite);
        const hazards = hazardsFor(followedSite);
        const zones = arr(site && site.zones);
        return simpleTable('مناطق الموقع', ['المنطقة', 'الرمز', 'نقاط الخطر'],
          zones.map((z) => [String(z.name), String(z.id), fmt.num(hazards.filter((hz) => hz.x >= z.x && hz.x <= z.x + z.w && hz.y >= z.y && hz.y <= z.y + z.h).length)]), [false, true, true]);
      },
    });
    const complianceCard = radarCard({
      code: 'RDR-04', title: 'رادار الامتثال ISO 45001', subtitle: `درجات بنود المعيار من 4 إلى 10 مقابل حلقة المستهدف ${fmt.pct(ISO_TARGET)} — الفجوات مظللة`,
      caption: 'ISO 45001 · CLAUSES 4–10', wide: true, large: true, sideTitle: 'درجات البنود',
      legend: [{ tone: 'accent', label: 'درجة البند' }, { tone: 'neutral', label: `المستهدف ${fmt.pct(ISO_TARGET)}` }, { tone: 'warning', label: 'فجوة دون المستهدف' }],
      tableView: () => simpleTable('درجات بنود ISO 45001', ['البند', 'الدرجة', 'الفجوات', 'الحالة'],
        isoClauses().map((c) => [`${c.id} — ${c.title}`, fmt.pct(Number(c.score) || 0), fmt.num(Number(c.gaps) || 0), (Number(c.score) || 0) >= ISO_TARGET ? 'ضمن المستهدف' : 'دون المستهدف']), [false, true, true, false]),
    });

    root.appendChild(h('div', { class: 'radar-grid' }, sweepCard.card, sensorCard.card, planCard.card, complianceCard.card));
    container.appendChild(root);

    /* ───────────── sweep hover tooltip ───────────── */
    function placeTip(card, pt) {
      // Radar hover info (§6 engine): {x, y} = {localX, localY} canvas-local CSS px; {clientX, clientY} viewport.
      const rect = card.wrap.getBoundingClientRect();
      const c = card.canvas.getBoundingClientRect();
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
      const tw = card.tip.offsetWidth || 200;
      const th = card.tip.offsetHeight || 80;
      const rtl = getComputedStyle(document.documentElement).direction !== 'ltr';
      const anchorStart = rtl ? rect.width - x : x;
      let start = anchorStart + 14;
      let top = y + 14;
      if (start + tw > rect.width - 4) start = Math.max(4, anchorStart - tw - 14);
      if (top + th > rect.height - 4) top = Math.max(4, y - th - 14);
      card.tip.style.insetInlineStart = `${Math.round(start)}px`;
      card.tip.style.insetBlockStart = `${Math.round(top)}px`;
    }
    function showBlipTip(blip, pt) {
      const { tip } = sweepCard;
      if (!blip) { tip.hidden = true; return; }
      const row = (label, value) => h('div', { class: 'tooltip-row' }, h('span', {}, label), h('strong', {}, value));
      tip.replaceChildren(
        h('div', { class: 'tooltip-title' }, h('span', { class: 'blip-code' }, String(blip.code || '')), ' ', String(blip.label || '')),
        h('div', { class: 'tooltip-rows' },
          row('الموقع', siteName(blip.siteId) || '—'),
          row('الفئة', categoryName(blip.categoryId)),
          row('الدرجة', fmt.num(Number(blip.score) || 0)),
          blip.status ? row('الحالة', String(blip.status)) : null),
        h('div', { class: 'row gap-2', style: { marginBlockStart: '6px' } }, blip.tier ? C.tierBadge(blip.tier) : null, h('span', { class: 'tooltip-kbd' }, 'انقر لفتح السجل')));
      tip.hidden = false;
      placeTip(sweepCard, pt);
    }
    sweepCard.frame.addEventListener('pointerleave', () => { sweepCard.tip.hidden = true; });
    sweepCard.frame.addEventListener('click', () => { if (!sweepCard.tip.hidden) router.navigate('risks'); });

    /* ───────────── radar construction ───────────── */
    function buildSweep() {
      radars.sweep = makeRadar(R.SweepRadar, sweepCard.canvas, {
        rings: 4,
        sectors: 12,
        sectorLabels: categories().map((c) => SHORT_CATEGORY[c.id] || c.name),
        sweepDegPerSec: SWEEP_DEG_PER_SEC,
        getBlips: currentBlips,
        onHover: showBlipTip,
        showLabels: true,
      }, 'SweepRadar');
      if (radars.sweep && typeof radars.sweep.setHoverHandler === 'function') {
        try { radars.sweep.setHoverHandler(showBlipTip); } catch (err) { warn('setHoverHandler', err); }
      }
    }
    function buildSiteRadars() {
      killRadar(radars.sensor);
      killRadar(radars.plan);
      replaceCanvas(sensorCard);
      replaceCanvas(planCard);
      followedSite = siteFor();
      const site = siteById(followedSite);
      currentAxes = axesFor(followedSite);
      const sensorSite = currentAxes[0] && currentAxes[0].siteId ? currentAxes[0].siteId : followedSite;
      const sensorSiteObj = siteById(sensorSite) || site;
      radars.sensor = makeRadar(R.SensorRadar, sensorCard.canvas, {
        axes: currentAxes.map((a) => ({ id: a.id, label: a.label, unit: a.unit, max: a.max, threshold: a.threshold })),
        getValues: () => valuesFor(sensorSite, currentAxes),
        rotateDegPerSec: 4,
      }, 'SensorRadar');
      radars.plan = makeRadar(R.SitePlanRadar, planCard.canvas, {
        zones: arr(site && site.zones),
        getPings: () => pingsFor(followedSite),
        getHazards: () => hazardsFor(followedSite),
      }, 'SitePlanRadar');
      sensorCard.captionEl.textContent = `SENSOR · ${(sensorSiteObj && sensorSiteObj.code) || followedSite}`;
      planCard.captionEl.textContent = `PLAN · ${(site && site.code) || followedSite}`;
      sensorCard.canvas.setAttribute('aria-label', `رادار الحساسات — ${sensorSiteObj ? sensorSiteObj.name : ''}`);
      planCard.canvas.setAttribute('aria-label', `رادار مخطط الموقع — ${site ? site.name : ''}`);
      sensorSiteBadge.querySelector('.badge-text').textContent = sensorSiteObj ? sensorSiteObj.name : '—';
      planSiteBadge.querySelector('.badge-text').textContent = site ? site.name : '—';
    }
    function buildCompliance() {
      const clauses = isoClauses();
      radars.compliance = makeRadar(R.ComplianceRadar, complianceCard.canvas, {
        axes: clauses.map((c) => ({ id: String(c.id), label: `${c.id} ${c.title}` })),
        getValues: () => isoClauses().map((c) => Number(c.score) || 0),
        target: ISO_TARGET,
      }, 'ComplianceRadar');
    }
    function setPaused(next) {
      paused = Boolean(next);
      try {
        if (loop) { if (paused && typeof loop.pause === 'function') loop.pause(); if (!paused && typeof loop.resume === 'function') loop.resume(); }
      } catch (err) { warn('radarLoop.pause', err); }
      [sweepCard, sensorCard, planCard, complianceCard].forEach((c) => c.frame.classList.toggle('is-paused', paused));
      pauseBtn.setAttribute('aria-pressed', paused ? 'true' : 'false');
      const label = pauseBtn.querySelector('.btn-label');
      if (label) label.textContent = paused ? 'استئناف الحركة' : 'إيقاف الحركة مؤقتًا';
      const oldIcon = pauseBtn.querySelector('.btn-ic');
      if (oldIcon) { const fresh = ico(paused ? 'play' : 'pause', 14); fresh.classList.add('btn-ic'); oldIcon.replaceWith(fresh); }
    }

    /* ───────────── per-second tick ───────────── */
    function tick() {
      if (destroyed) return;
      const st = state();
      const f = filters();
      const scopeSites = f.siteId === 'all' ? sites() : sites().filter((s) => s.id === f.siteId);
      const scopeIds = new Set(scopeSites.map((s) => s.id));
      const sensors = arr(st.sensors).filter((s) => s && scopeIds.has(s.siteId));

      /* live sensor values by sensor id (aligned per site with sel.sensorAxes) */
      const liveById = new Map();
      scopeSites.forEach((s) => {
        const axes = axesFor(s.id).filter((a) => a.siteId === s.id);
        if (!axes.length) return;
        const vals = valuesFor(s.id, axes);
        axes.forEach((a, i) => liveById.set(a.id, vals[i]));
      });
      const liveValue = (s) => { const v = liveById.get(s.id); return Number.isFinite(v) ? v : (Number(s.value) || 0); };
      const overThreshold = sensors.filter((s) => liveValue(s) > (Number(s.threshold) || Infinity));
      const nearThreshold = sensors.filter((s) => { const t = Number(s.threshold) || Infinity; const v = liveValue(s); return v <= t && v > t * 0.8; });

      /* chips */
      const alerts = safe(() => sel.feedStats(st, 1), null, 'feedStats');
      const alertCount = alerts && Number.isFinite(alerts.alerts) ? alerts.alerts
        : arr(st.feed).filter((ev) => ev && (ev.tone === 'critical' || ev.tone === 'serious') && Date.now() - Date.parse(ev.ts) <= 3_600_000).length;
      const people = scopeSites.reduce((sum, s) => sum + (Number(s.workers) || 0), 0);
      let vehicles = null;
      if (live && typeof live.getPings === 'function') {
        vehicles = scopeSites.reduce((sum, s) => sum + pingsFor(s.id).filter((p) => p && p.kind && p.kind !== 'worker').length, 0);
      }
      const pick = (needle) => sensors.find((s) => String(s.kind || '').includes(needle) && s.siteId === followedSite) || sensors.find((s) => String(s.kind || '').includes(needle)) || null;
      const wind = pick('الرياح');
      const wbgt = pick('WBGT');
      const sensorState = (s) => (s ? (liveValue(s) > (Number(s.threshold) || Infinity) ? 'critical' : liveValue(s) > (Number(s.threshold) || Infinity) * 0.8 ? 'warning' : 'good') : 'neutral');

      const chip = (id, value, unit, tone) => {
        const ref = chipRefs.get(id);
        if (!ref) return;
        setText(ref.value, value);
        if (unit !== undefined) setText(ref.unit, unit);
        setDotTone(ref.dot, tone);
      };
      chip('sensors', fmt.num(sensors.length), undefined, overThreshold.length ? 'critical' : nearThreshold.length ? 'warning' : 'good');
      chip('alerts', fmt.num(alertCount), undefined, alertCount > 0 ? 'warning' : 'good');
      chip('people', fmt.num(people), undefined, 'accent');
      chip('vehicles', vehicles === null ? '—' : fmt.num(vehicles), undefined, vehicles === null ? 'neutral' : 'accent');
      chip('wind', wind ? fmtValue(liveValue(wind)) : '—', wind && wind.unit ? wind.unit : 'كم/س', sensorState(wind));
      chip('wbgt', wbgt ? fmtValue(liveValue(wbgt)) : '—', wbgt && wbgt.unit ? wbgt.unit : '°م', sensorState(wbgt));

      /* sweep telemetry */
      const blips = currentBlips();
      const byTone = { critical: 0, serious: 0, warning: 0, good: 0 };
      blips.forEach((b) => { if (b.tone in byTone) byTone[b.tone] += 1; });
      setTelemetry(sweepCard.tele, [
        { key: 'total', label: 'المخاطر على الرادار', value: fmt.num(blips.length) },
        ...TIERS.map((t) => ({ key: t.tone, label: t.tier, value: fmt.num(byTone[t.tone]), state: t.tone === 'critical' && byTone.critical ? 'alert' : undefined })),
        { key: 'sweep', label: 'سرعة المسح', value: fmt.num(SWEEP_DEG_PER_SEC), unit: '°/ث' },
        { key: 'scope', label: 'النطاق', value: f.siteId === 'all' ? 'جميع المواقع' : (siteName(f.siteId) || '—') },
      ]);
      sweepCard.canvas.setAttribute('aria-label', `رادار المخاطر: ${fmt.num(blips.length)} مخاطرة مفتوحة، منها ${fmt.num(byTone.critical)} حرجة`);

      /* sensor telemetry */
      const sensorSite = currentAxes[0] && currentAxes[0].siteId ? currentAxes[0].siteId : followedSite;
      const vals = valuesFor(sensorSite, currentAxes);
      setTelemetry(sensorCard.tele, currentAxes.length ? currentAxes.map((a, i) => {
        const v = Number.isFinite(vals[i]) ? vals[i] : 0;
        const t = Number(a.threshold) || Infinity;
        return { key: a.id, label: a.label, value: fmtValue(v), unit: a.unit || '', state: v > t ? 'alert' : v > t * 0.8 ? 'warn' : undefined };
      }) : [{ key: 'none', label: 'لا توجد حساسات مرتبطة بهذا الموقع', value: '—' }]);

      /* site plan telemetry */
      const pings = pingsFor(followedSite);
      const hazards = hazardsFor(followedSite);
      const site = siteById(followedSite);
      const kinds = { worker: 0, vehicle: 0, crane: 0 };
      pings.forEach((p) => { if (p && p.kind in kinds) kinds[p.kind] += 1; });
      const hasLivePings = live && typeof live.getPings === 'function';
      setTelemetry(planCard.tele, [
        { key: 'workers', label: 'العمال', value: hasLivePings ? fmt.num(kinds.worker) : '—' },
        { key: 'vehicles', label: 'المركبات', value: hasLivePings ? fmt.num(kinds.vehicle) : '—' },
        { key: 'cranes', label: 'الرافعات', value: hasLivePings ? fmt.num(kinds.crane) : '—' },
        { key: 'hazards', label: 'نقاط الخطر', value: fmt.num(hazards.length), state: hazards.some((hz) => hz && hz.tone === 'critical') ? 'alert' : hazards.length ? 'warn' : undefined },
        { key: 'zones', label: 'المناطق', value: fmt.num(arr(site && site.zones).length) },
      ]);

      /* compliance telemetry */
      const clauses = isoClauses();
      setTelemetry(complianceCard.tele, [
        { key: 'overall', label: 'الإجمالي', value: fmt.pct(isoOverall()), state: isoOverall() < ISO_TARGET ? 'warn' : undefined },
        { key: 'target', label: 'المستهدف', value: fmt.pct(ISO_TARGET) },
        ...clauses.map((c) => ({ key: `c${c.id}`, label: `${c.id} ${c.title}`, value: fmt.pct(Number(c.score) || 0), state: (Number(c.score) || 0) < ISO_TARGET ? 'warn' : undefined })),
      ]);

      /* relative times + fps */
      const rel = (ms) => `آخر تحديث ${fmt.relative(ms)}`;
      setText(sweepCard.updatedText, rel(lastChangeAt));
      setText(sensorCard.updatedText, rel(lastSensorAt));
      setText(planCard.updatedText, rel(lastSensorAt));
      setText(complianceCard.updatedText, rel(lastChangeAt));
      let fps = null;
      if (loop && typeof loop.fps === 'function') fps = safe(() => Number(loop.fps()), null, 'radarLoop.fps');
      setText(fpsText, Number.isFinite(fps) ? `FPS ${fmt.num(Math.round(fps))}` : 'FPS —');
      setText(siteBadge.querySelector('.badge-text'), f.siteId === 'all' ? 'جميع المواقع — الرادارات الموقعية تتبع برج الواجهة المالية' : `الموقع: ${siteName(f.siteId) || f.siteId}`);
    }

    /* ───────────── boot ───────────── */
    buildSweep();
    buildSiteRadars();
    buildCompliance();
    tick();
    timers.push(setInterval(tick, 1000));

    subs.push(bus.on('store:change', (p) => {
      const path = String((p && p.path) || '*');
      if (/^sensors/.test(path)) lastSensorAt = Date.now();
      else lastChangeAt = Date.now();
    }));
    subs.push(bus.on('sensors:tick', () => { lastSensorAt = Date.now(); }));
    subs.push(bus.on('filters:change', () => {
      if (destroyed) return;
      if (siteFor() !== followedSite) buildSiteRadars();
      tick();
    }));
    subs.push(bus.on('settings:change', () => { if (!destroyed) tick(); }));

    /* ───────────── cleanup ───────────── */
    return function cleanup() {
      destroyed = true;
      subs.splice(0).forEach((off) => { try { off(); } catch { /* ignore */ } });
      timers.splice(0).forEach((t) => { clearInterval(t); clearTimeout(t); });
      Object.keys(radars).forEach((k) => { killRadar(radars[k]); radars[k] = null; });
      if (stripObserver) { try { stripObserver.disconnect(); } catch { /* ignore */ } stripObserver = null; }
      if (paused) { try { if (loop && typeof loop.resume === 'function') loop.resume(); } catch { /* ignore */ } }
      sweepCard.tip.hidden = true;
    };
  },
};
