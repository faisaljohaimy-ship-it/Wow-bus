/**
 * BILTIX Risk AI — HSE pillar · SEC-02 Risk radar (js/views/radar.js). Owner: B-HSE1.
 *
 *   A. Head — title, lead, data status (status.js), the site the site radars follow, pause motion.
 *   B. Site telemetry — six chips refreshed every second, marked "Simulated" (the live engine is an
 *      in-browser simulation in every mode: no sensor gateway is connected).
 *   C. Four canvas radars: risk sweep (register risks + simulated detections; click a blip to open the
 *      risk), sensor dial (six fixed axes; a site without a sensor shows "—", never a fabricated 0),
 *      isometric site plan (simulated workers / vehicles, register hazards), ISO 45001 clause scores.
 *      Every radar card carries a mono telemetry strip, a tone legend and "updated" relative time.
 *
 * Language: view strings from the 'radarView' dictionary (js/i18n/radar-view.js) and the shared 'risks'
 * vocabulary; canvas chrome from A-UI's 'radar' dictionary; every label handed to a canvas (sector
 * names, sensor axes and units, zone names, hazard labels, clause titles) is localised here.
 * Telemetry is patched in place each second (no replay); motion.enter runs on the first render only.
 */

import { i18n } from '../core/i18n.js';
import * as seedMod from '../data/seed.js';
import dict from '../i18n/radar-view.js';
import risksDict from '../i18n/risks.js';

i18n.register('risks', risksDict);
i18n.register('radarView', dict);

const CLOSED = 'مغلق';
const ISO_TARGET = 85;
const SWEEP_DEG_PER_SEC = 22;
const FALLBACK_CATEGORY_IDS = ['height', 'excavation', 'lifting', 'electrical', 'confined', 'hotwork', 'heat', 'chemical', 'traffic', 'scaffold', 'structural', 'ergonomic'];
const TIERS = [
  { tier: 'حرج', tone: 'critical' },
  { tier: 'عالٍ', tone: 'serious' },
  { tier: 'متوسط', tone: 'warning' },
  { tier: 'منخفض', tone: 'good' },
];
const CHIPS = [
  { id: 'sensors', icon: 'sensor' },
  { id: 'alerts', icon: 'bell' },
  { id: 'people', icon: 'helmet' },
  { id: 'vehicles', icon: 'truck' },
  { id: 'wind', icon: 'wind' },
  { id: 'wbgt', icon: 'temperature' },
];

const arr = (v) => (Array.isArray(v) ? v : []);
const categories = () => (Array.isArray(seedMod.CATEGORIES) && seedMod.CATEGORIES.length ? seedMod.CATEGORIES : FALLBACK_CATEGORY_IDS.map((id) => ({ id })));
const num = (v) => (v === null || v === undefined || v === '' ? null : (Number.isFinite(Number(v)) ? Number(v) : null));

export default {
  id: 'radar',
  code: 'SEC-02',
  get title() { return i18n.has('core.nav.radar.title') ? i18n.t('core.nav.radar.title') : i18n.t('radarView.title'); },
  icon: 'radar',

  render(container, ctx) {
    const { store, bus, sel, fmt, router, live, art } = ctx;
    const C = ctx.components || {};
    const { h } = C;
    const R = ctx.radar || {};
    const loop = R.radarLoop || null;
    const I = ctx.i18n || i18n;
    const t = (key, p) => I.t(key, p);
    const tn = (key, count, p) => I.tn(key, count, p);
    const L = (record, field, ns) => (record ? I.L(record, field, ns) : '');
    const label = (ns, value) => I.label(ns, value);
    const statusApi = ctx.status || null;
    const motion = ctx.motion || C.motion || null;

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
      try { node = typeof C.svgIcon === 'function' ? C.svgIcon(name, size) : (art && art.icon ? art.icon(name, size) : null); } catch { node = null; }
      if (!(node instanceof Node)) node = C.glyph('neutral', size);
      node.setAttribute('aria-hidden', 'true');
      return node;
    };
    const state = () => store.state || {};
    const filters = () => ({ siteId: 'all', range: 30, search: '', ...(store.filters || (store.state && store.state.filters) || {}) });
    const sites = () => arr(state().sites);
    const siteById = (id) => sites().find((s) => s && s.id === id) || null;
    const siteName = (id) => { const s = siteById(id); return s ? L(s, 'name', 'sites') : ''; };
    const findRisk = (id) => arr(state().risks).find((r) => r && r.id === id) || null;
    const tierLabel = (tier) => label('tier', tier);
    const categoryLabel = (id) => label('hseCategory', id) || '—';
    const unitLabel = (u) => (u ? label('unit', u) : '');
    const isEn = () => I.lang() !== 'ar';
    /** Site the sensor/site-plan radars follow: the global filter, else a ?site= deep link (e.g. from the site
     *  spatial view), else the first site for 'all'. */
    const paramSite = ctx.params && ctx.params.site ? String(ctx.params.site) : null;
    const siteFor = () => {
      const f = filters();
      if (f.siteId && f.siteId !== 'all' && siteById(f.siteId)) return f.siteId;
      if (paramSite && siteById(paramSite)) return paramSite;
      return siteById('S1') ? 'S1' : (sites()[0] ? sites()[0].id : 'S1');
    };
    const fmtValue = (v) => (v === null || !Number.isFinite(v) ? '—' : fmt.num(v, { maximumFractionDigits: Math.abs(v) < 10 ? 1 : 0 }));
    const axisLabel = (a) => (a && a.key && I.has(`radarView.axes.${a.key}`) ? t(`radarView.axes.${a.key}`) : label('sensorKind', a && (a.kind || a.label)) || (a && a.label) || '');
    const clauseTitle = (c) => L(c, 'title', 'isoClauses') || c.title || '';
    const sourceStatus = () => {
      try { if (statusApi && typeof statusApi.source === 'function') return statusApi.source(state()).status || 'demo'; } catch (err) { warn('status', err); }
      return 'demo';
    };
    const statusText = (s) => { try { return statusApi ? statusApi.label(s) : s; } catch { return s; } };
    const statusDesc = (s) => { try { return statusApi ? statusApi.desc(s) : ''; } catch { return ''; } };

    function simpleTable(caption, headers, rows, numeric = []) {
      const table = h('table', { class: 'chart-table' });
      table.appendChild(h('caption', {}, caption));
      table.appendChild(h('thead', {}, h('tr', {}, headers.map((x, i) => h('th', { scope: 'col', class: numeric[i] ? 'num' : null }, x)))));
      table.appendChild(h('tbody', {}, rows.length
        ? rows.map((r) => h('tr', {}, r.map((cell, i) => h('td', { class: numeric[i] ? 'num' : null }, cell))))
        : h('tr', {}, h('td', { colspan: String(headers.length), class: 'muted' }, t('radarView.common.noData')))));
      return table;
    }
    function toneLegend(items) {
      return h('ul', { class: 'radar-legend', role: 'list', 'aria-label': t('radarView.common.legend') }, items.map((it) => h('li', { class: ['radar-legend-item', `tone-${it.tone}`] },
        C.glyph(it.tone, 12), h('span', { class: 'legend-key' }), h('span', {}, it.label))));
    }
    /** Status text inside a radar frame: simulated sources say "Simulated", the data source says its status. */
    function paintFrameStatus(el, kind) {
      const s = kind === 'simulated' ? 'demo' : sourceStatus();
      const text = kind === 'simulated' || s === 'demo' ? (kind === 'simulated' ? t('radarView.status.simulated') : statusText('demo')) : statusText(s);
      el.dataset.status = s;
      el.title = kind === 'simulated' ? t('radarView.status.simulatedDesc') : statusDesc(s);
      el.replaceChildren(ico(s === 'demo' ? 'flask' : (s === 'live' ? 'check-circle' : 'alert-circle'), 12), h('span', {}, text));
    }

    /* Phones: telemetry labels wrap instead of ellipsising; the full text stays in the title attribute. */
    const phoneMq = typeof window.matchMedia === 'function' ? window.matchMedia('(max-width: 640px)') : null;
    const WRAP_LABEL = { whiteSpace: 'normal', overflow: 'visible', textOverflow: 'clip', overflowWrap: 'anywhere' };
    const UNWRAP_LABEL = { whiteSpace: '', overflow: '', textOverflow: '', overflowWrap: '' };
    const paintTeleLabel = (el) => Object.assign(el.style, phoneMq && phoneMq.matches ? WRAP_LABEL : UNWRAP_LABEL);

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
          const value = h('bdi', { class: 'tele-value' }, text, unit);
          const lab = h('span', { class: 'tele-label', title: r.title || r.label }, r.code ? h('span', { class: 'code mono', dir: 'ltr', translate: 'no' }, r.code) : null, r.code ? ' ' : null, r.label);
          paintTeleLabel(lab);
          const li = h('li', { class: 'tele-row' }, lab, value);
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
        // Explicit direction (dir=auto on an initially empty <bdi> is not re-resolved reliably): Arabic words → rtl.
        const want = /[\u0600-\u06FF]/.test(v + u) ? 'rtl' : 'ltr';
        if (ref.li.querySelector('.tele-value').getAttribute('dir') !== want) ref.li.querySelector('.tele-value').setAttribute('dir', want);
        ref.li.classList.toggle('is-alert', r.state === 'alert');
        ref.li.classList.toggle('is-warn', r.state === 'warn');
        ref.li.classList.toggle('is-missing', r.state === 'missing');
      });
    }
    const setText = (node, value) => { const v = String(value); if (node.textContent !== v) node.textContent = v; };

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

    const makeRadar = (Cls, canvas, opts, name) => {
      if (typeof Cls !== 'function') { warn(`radar:${name}`, new Error(`${name} unavailable`)); return null; }
      try { const r = new Cls(canvas, opts); if (typeof r.start === 'function') r.start(); return r; } catch (err) { warn(`radar:${name}`, err); return null; }
    };
    const killRadar = (r) => {
      if (!r) return;
      try { if (typeof r.destroy === 'function') r.destroy(); else if (typeof r.stop === 'function') r.stop(); } catch { /* ignore */ }
      try { if (loop && typeof loop.remove === 'function') loop.remove(r); } catch { /* ignore */ }
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
    function blipLabel(b) {
      if (!b) return '';
      if (b.transient) return isEn() ? (b.labelEn || b.code || '') : (b.label || '');
      const r = findRisk(b.id);
      return r ? (L(r, 'hazard', 'risks') || r.code) : (b.label || b.code || '');
    }
    const axesFor = (siteId) => safe(() => sel.sensorAxes(state(), siteId), [], 'sensorAxes');
    /** Live values aligned with `axes`; a missing sensor stays null (shown as "—", never 0). */
    function valuesFor(siteId, axes) {
      let vals = null;
      if (live && typeof live.getSensorValues === 'function') vals = safe(() => live.getSensorValues(siteId), null, 'live.getSensorValues');
      const sensors = arr(state().sensors);
      return axes.map((a, i) => {
        if (!a || a.missing) return null;
        if (Array.isArray(vals) && Number.isFinite(vals[i])) return vals[i];
        const s = sensors.find((x) => x && x.id === a.id);
        return s && Number.isFinite(Number(s.value)) ? Number(s.value) : num(a.value);
      });
    }
    const pingsFor = (siteId) => (live && typeof live.getPings === 'function' ? arr(safe(() => live.getPings(siteId), [], 'live.getPings')) : []);
    function hazardsFor(siteId) {
      let list = null;
      if (live && typeof live.getHazards === 'function') list = safe(() => live.getHazards(siteId), null, 'live.getHazards');
      if (!Array.isArray(list)) {
        const site = siteById(siteId);
        const zones = arr(site && site.zones);
        list = arr(state().risks)
          .filter((r) => r && r.siteId === siteId && r.status !== CLOSED && r.zoneId)
          .map((r) => {
            const z = zones.find((x) => x.id === r.zoneId);
            if (!z) return null;
            const tone = safe(() => sel.tierTone(sel.riskTier(sel.riskScore(r))), 'warning', 'riskTier');
            return { id: r.id, code: r.code, x: z.x + z.w / 2, y: z.y + z.h / 2, tone, zoneId: r.zoneId, kind: 'risk' };
          })
          .filter(Boolean);
      }
      // Localise the label drawn on the plan: register risks through their mirror, simulated readings via labelEn.
      return list.map((hz) => {
        if (!hz) return hz;
        if (hz.kind === 'risk' || findRisk(hz.id)) {
          const r = findRisk(hz.id);
          return { ...hz, label: r ? `${r.code} — ${L(r, 'hazard', 'risks')}` : (hz.label || hz.code) };
        }
        return { ...hz, label: isEn() ? (hz.labelEn || hz.code || '') : (hz.label || '') };
      });
    }
    function isoClauses() {
      const now = Date.now();
      if (now - isoCache.at > 1000) isoCache = { at: now, clauses: safe(() => sel.isoScores(state()), [], 'isoScores') };
      return isoCache.clauses;
    }
    const isoOverall = () => safe(() => sel.isoOverall(state()), (() => { const c = isoClauses(); return c.length ? Math.round(c.reduce((a, x) => a + (Number(x.score) || 0), 0) / c.length) : 0; })(), 'isoOverall');

    /* ═════════════ A. head ═════════════ */
    const root = h('section', { class: 'view view-radar' });
    const statusHost = h('span', { class: 'row gap-2' });
    const siteBadge = C.badge('', 'neutral', { icon: ico('building', 14) });
    const pauseBtn = C.button(t('radarView.pause.pause'), {
      variant: 'outline', size: 'sm', icon: ico('pause', 14),
      attrs: { 'aria-pressed': 'false', title: t('radarView.pause.title') },
      onClick: () => setPaused(!paused),
    });
    root.appendChild(h('div', { class: 'view-head' },
      h('div', { class: 'view-head-text' },
        h('span', { class: 'code-tag', translate: 'no' }, 'SEC-02'),
        h('h1', { tabindex: '-1' }, i18n.has('core.nav.radar.title') ? t('core.nav.radar.title') : t('radarView.title')),
        h('p', { class: 'view-lead' }, t('radarView.lead'))),
      h('div', { class: 'view-actions' }, statusHost, siteBadge, pauseBtn)));

    /* ═════════════ B. telemetry chips ═════════════ */
    const chipRefs = new Map();
    const strip = h('div', { class: 'live-strip', role: 'list', 'aria-labelledby': 'rdr-tele-title' }, CHIPS.map((c) => {
      const value = h('span', {}, '—');
      const unit = h('span', { class: 'live-chip-unit' });
      const stateEl = h('span', { class: 'tone-glyph', style: { marginInlineStart: 'auto', display: 'inline-flex' } });
      const stateSr = h('span', { class: 'sr-only' });
      const el = h('div', { class: 'live-chip', role: 'listitem', 'data-chip': c.id, title: t(`radarView.chips.${c.id}Title`) },
        ico(c.icon, 18),
        h('div', { class: 'live-chip-text' },
          h('span', { class: 'live-chip-label' }, t(`radarView.chips.${c.id}`)),
          h('bdi', { class: 'live-chip-value', style: { whiteSpace: 'nowrap' } }, value, unit)),
        stateEl, stateSr);
      chipRefs.set(c.id, { el, value, unit, stateEl, stateSr, tone: null });
      return el;
    }));
    root.appendChild(h('section', { class: 'view-section', 'aria-labelledby': 'rdr-tele-title' },
      h('div', { class: 'view-section-head' },
        h('div', { class: 'stack gap-1' },
          h('div', { class: 'row gap-2 wrap' },
            h('h2', { class: 't-section', id: 'rdr-tele-title' }, t('radarView.telemetry.title')),
            typeof C.statusBadge === 'function' ? C.statusBadge('demo', { label: t('radarView.status.simulated'), title: t('radarView.status.simulatedDesc'), size: 'sm' }) : null),
          h('p', { class: 't-helper' }, t('radarView.telemetry.subtitle')))),
      strip));
    // Six chips in one row when wide enough, otherwise balanced 3 + 3 / 2 + 2 + 2 (never 5 + 1).
    const fitStrip = (w) => { strip.style.gridTemplateColumns = w >= 1080 ? 'repeat(6, minmax(0, 1fr))' : w >= 520 ? 'repeat(3, minmax(0, 1fr))' : 'repeat(2, minmax(0, 1fr))'; };
    let stripObserver = null;
    let lastStripWidth = -1;
    let stripRaf = 0;
    if (typeof ResizeObserver === 'function') {
      stripObserver = new ResizeObserver((entries) => {
        for (const e of entries) {
          const w = Math.round(e.contentRect.width);
          if (w === lastStripWidth || w === 0) continue;
          lastStripWidth = w;
          if (stripRaf) cancelAnimationFrame(stripRaf);
          stripRaf = requestAnimationFrame(() => { stripRaf = 0; if (!destroyed) fitStrip(w); });
        }
      });
      stripObserver.observe(strip);
    }
    fitStrip(strip.getBoundingClientRect().width || 900);

    /* ═════════════ C. radar cards ═════════════ */
    function radarCard({ code, title, subtitle, caption, wide, large, landscape, legend, tableView, sideTitle, sideBadges = [], statusKind }) {
      const canvas = h('canvas', { class: 'radar-canvas', role: 'img', 'aria-label': title });
      const captionEl = h('span', { class: 'radar-caption', hidden: !caption, translate: 'no' }, caption || '');
      const statusEl = h('span', { class: 'radar-status' });
      const frame = h('div', { class: ['radar-frame', landscape ? 'is-landscape' : 'is-wide', large ? 'is-hero' : null] }, canvas, statusEl, captionEl);
      const tip = h('div', { class: 'tooltip radar-tip', hidden: true, role: 'tooltip', style: { position: 'absolute', insetBlockStart: '0', insetInlineStart: '0', pointerEvents: 'none', zIndex: '2' } });
      const wrap = h('div', { style: { position: 'relative', inlineSize: '100%', maxInlineSize: large ? '720px' : '560px', marginInline: 'auto' } }, frame, tip);
      const tele = h('ul', { class: 'radar-telemetry', role: 'list', 'aria-label': sideTitle });
      const updatedText = h('span', {});
      const side = h('div', { class: 'radar-side' },
        h('div', { class: 'row between wrap gap-2' }, h('span', { class: 'radar-side-title' }, sideTitle), ...sideBadges),
        tele,
        toneLegend(legend),
        h('span', { class: 'tele-updated' }, ico('clock', 13), updatedText));
      const body = h('div', { class: ['radar-layout', wide ? null : 'is-stacked'] }, wrap, side);
      const card = C.card({ code, title, subtitle, body, tableView, className: wide ? 'is-wide' : '' });
      return { card, canvas, frame, tip, wrap, tele, updatedText, captionEl, statusEl, statusKind };
    }

    const sweepCard = radarCard({
      code: 'RDR-01', title: t('radarView.sweep.title'), subtitle: t('radarView.sweep.subtitle', { n: fmt.num(12) }),
      wide: true, large: true, sideTitle: t('radarView.sweep.side'), statusKind: 'simulated',
      legend: TIERS.map((x) => ({ tone: x.tone, label: tierLabel(x.tier) })),
      tableView: () => simpleTable(t('radarView.sweep.tableCaption'),
        [t('radarView.cols.code'), t('radarView.cols.hazard'), t('radarView.cols.site'), t('radarView.cols.category'), t('radarView.cols.score'), t('radarView.cols.tier')],
        currentBlips().map((b) => [h('span', { class: 'code mono', dir: 'ltr', translate: 'no' }, String(b.code || '')), blipLabel(b), siteName(b.siteId) || '—', categoryLabel(b.categoryId), Number.isFinite(Number(b.score)) ? fmt.num(Number(b.score)) : '—', b.tier ? tierLabel(b.tier) : '—']),
        [false, false, false, false, true, false]),
    });
    const sensorSiteBadge = C.badge('', 'neutral', { icon: ico('building', 12) });
    const sensorCard = radarCard({
      code: 'RDR-02', title: t('radarView.sensors.title'), subtitle: t('radarView.sensors.subtitle'),
      wide: false, sideTitle: t('radarView.sensors.side'), sideBadges: [sensorSiteBadge], statusKind: 'simulated',
      legend: [{ tone: 'accent', label: t('radarView.sensors.legendReading') }, { tone: 'warning', label: t('radarView.sensors.legendNear') }, { tone: 'critical', label: t('radarView.sensors.legendOver') }],
      tableView: () => {
        const vals = valuesFor(followedSite, currentAxes);
        return simpleTable(t('radarView.sensors.tableCaption'), [t('radarView.sensors.colSensor'), t('radarView.sensors.colReading'), t('radarView.sensors.colThreshold'), t('radarView.sensors.colMax')],
          currentAxes.map((a, i) => [t('radarView.sensors.axisWithUnit', { axis: axisLabel(a), unit: unitLabel(a.unit) }), a.missing ? t('radarView.sensors.noSensor') : fmtValue(num(vals[i])), fmtValue(num(a.threshold)), fmtValue(num(a.max))]), [false, true, true, true]);
      },
    });
    const planSiteBadge = C.badge('', 'neutral', { icon: ico('building', 12) });
    const planCard = radarCard({
      code: 'RDR-03', title: t('radarView.plan.title'), subtitle: t('radarView.plan.subtitle'),
      caption: 'PLAN', wide: false, landscape: true, sideTitle: t('radarView.plan.side'), sideBadges: [planSiteBadge], statusKind: 'simulated',
      legend: [{ tone: 'neutral', label: t('radarView.plan.legendWorker') }, { tone: 'accent', label: t('radarView.plan.legendVehicle') }, { tone: 'critical', label: t('radarView.plan.legendCritical') }, { tone: 'serious', label: t('radarView.plan.legendHigh') }, { tone: 'warning', label: t('radarView.plan.legendMedium') }],
      tableView: () => {
        const site = siteById(followedSite);
        const hazards = hazardsFor(followedSite);
        const zones = arr(site && L(site, 'zones', 'sites'));
        return simpleTable(t('radarView.plan.tableCaption'), [t('radarView.plan.colZone'), t('radarView.plan.colCode'), t('radarView.plan.colHazards')],
          zones.map((z) => [h('a', { href: router.href('spatial', { site: followedSite, zone: z.id }), title: t('radar.spatial.zoneOnMap', { zone: z.id }) }, String(z.name || '')), h('span', { class: 'code mono', dir: 'ltr', translate: 'no' }, String(z.id)), fmt.num(hazards.filter((hz) => hz && (hz.zoneId === z.id || (hz.x >= z.x && hz.x <= z.x + z.w && hz.y >= z.y && hz.y <= z.y + z.h))).length)]), [false, false, true]);
      },
    });
    const complianceCard = radarCard({
      code: 'RDR-04', title: t('radarView.iso.title'), subtitle: t('radarView.iso.subtitle', { from: '4', to: '10', target: fmt.pct(ISO_TARGET) }),
      wide: true, large: true, sideTitle: t('radarView.iso.side'), statusKind: 'source',
      legend: [{ tone: 'accent', label: t('radarView.iso.legendScore') }, { tone: 'neutral', label: t('radarView.iso.legendTarget', { target: fmt.pct(ISO_TARGET) }) }, { tone: 'warning', label: t('radarView.iso.legendGap') }],
      tableView: () => simpleTable(t('radarView.iso.tableCaption'), [t('radarView.iso.colClause'), t('radarView.iso.colScore'), t('radarView.iso.colGaps'), t('radarView.iso.colState')],
        isoClauses().map((c) => [h('span', {}, h('span', { class: 'code mono', dir: 'ltr', translate: 'no' }, String(c.id)), ` — ${clauseTitle(c)}`), fmt.pct(Number(c.score) || 0), fmt.num(Number(c.gaps) || 0), (Number(c.score) || 0) >= ISO_TARGET ? t('radarView.iso.onTarget') : t('radarView.iso.belowTarget')]), [false, true, true, false]),
    });

    /* "Show on site map": deep links into the site spatial view (#/spatial?site=…), kept on the followed site */
    const mapLink = (key) => h('a', { class: 'btn btn-outline btn-sm radar-map-link', href: router.href('spatial', { site: siteFor() }) }, ico('map-pin', 14), h('span', { class: 'btn-label' }, t(`radar.spatial.${key}`)));
    const planMapLink = mapLink('showOnMap');
    const sensorMapLink = mapLink('sensorsOnMap');
    planCard.card.querySelector('.radar-side').appendChild(planMapLink);
    sensorCard.card.querySelector('.radar-side').appendChild(sensorMapLink);
    function paintMapLinks(planSite, sensorSite) {
      const name = (id) => siteName(id) || id;
      planMapLink.setAttribute('href', router.href('spatial', { site: planSite }));
      planMapLink.setAttribute('aria-label', t('radar.spatial.showOnMapAria', { site: name(planSite) }));
      sensorMapLink.setAttribute('href', router.href('spatial', { site: sensorSite }));
      sensorMapLink.setAttribute('aria-label', t('radar.spatial.sensorsOnMapAria', { site: name(sensorSite) }));
    }

    const cards = [sweepCard, sensorCard, planCard, complianceCard];
    root.appendChild(h('div', { class: 'radar-grid' }, ...cards.map((c) => c.card)));
    container.appendChild(root);
    cards.forEach((c) => paintFrameStatus(c.statusEl, c.statusKind));
    statusHost.replaceChildren(typeof C.statusBadge === 'function' ? C.statusBadge(sourceStatus(), { size: 'sm' }) : C.badge(statusText(sourceStatus()), 'accent'));

    /* ───────────── sweep hover tooltip + click ───────────── */
    function placeTip(card, pt) {
      const rect = card.wrap.getBoundingClientRect();
      const c = card.canvas.getBoundingClientRect();
      let x; let y;
      if (pt && Number.isFinite(pt.x) && Number.isFinite(pt.y)) { x = pt.x + (c.left - rect.left); y = pt.y + (c.top - rect.top); }
      else if (pt && Number.isFinite(pt.clientX) && Number.isFinite(pt.clientY)) { x = pt.clientX - rect.left; y = pt.clientY - rect.top; }
      else { x = rect.width / 2; y = 16; }
      const tw = card.tip.offsetWidth || 200;
      const th = card.tip.offsetHeight || 80;
      const anchorStart = I.dir() === 'rtl' ? rect.width - x : x;
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
      const row = (k, v) => h('div', { class: 'tooltip-row' }, h('span', {}, k), h('strong', {}, v));
      tip.replaceChildren(
        h('div', { class: 'tooltip-title' }, h('span', { class: 'blip-code code mono', dir: 'ltr', translate: 'no' }, String(blip.code || '')), ' ', blipLabel(blip)),
        h('div', { class: 'tooltip-rows' },
          row(t('radarView.cols.site'), siteName(blip.siteId) || '—'),
          row(t('radarView.cols.category'), categoryLabel(blip.categoryId)),
          Number.isFinite(Number(blip.score)) ? row(t('radarView.cols.score'), fmt.num(Number(blip.score))) : null,
          blip.status ? row(t('radarView.cols.status'), label('riskStatus', blip.status)) : null),
        h('div', { class: 'row gap-2', style: { marginBlockStart: '6px' } },
          blip.tier ? C.badge(tierLabel(blip.tier), safe(() => sel.tierTone(blip.tier), 'neutral', 'tierTone')) : null,
          blip.transient ? C.badge(t('radarView.sweep.simulatedDetection'), 'accent') : h('span', { class: 'tooltip-kbd' }, t('radarView.sweep.clickHint'))));
      tip.hidden = false;
      placeTip(sweepCard, pt);
    }
    const onBlipClick = (blip) => { if (blip && !blip.transient && findRisk(blip.id)) router.navigate('risks', { id: blip.id }); };
    sweepCard.frame.addEventListener('pointerleave', () => { sweepCard.tip.hidden = true; });

    /* ───────────── radar construction ───────────── */
    function buildSweep() {
      radars.sweep = makeRadar(R.SweepRadar, sweepCard.canvas, {
        rings: 4,
        sectors: 12,
        sectorLabels: categories().map((c) => (I.has(`risks.categoryShort.${c.id}`) ? t(`risks.categoryShort.${c.id}`) : categoryLabel(c.id))),
        sweepDegPerSec: SWEEP_DEG_PER_SEC,
        getBlips: currentBlips,
        onHover: showBlipTip,
        onClick: onBlipClick,
        showLabels: true,
      }, 'SweepRadar');
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
        axes: currentAxes.map((a) => ({ id: a.id, label: axisLabel(a), unit: unitLabel(a.unit), max: a.max, threshold: a.threshold })),
        getValues: () => valuesFor(sensorSite, currentAxes),
        rotateDegPerSec: 4,
        emptyText: t('radarView.sensors.empty'),
      }, 'SensorRadar');
      radars.plan = makeRadar(R.SitePlanRadar, planCard.canvas, {
        zones: arr(site && L(site, 'zones', 'sites')).map((z) => ({ id: z.id, name: z.name, x: z.x, y: z.y, w: z.w, h: z.h })),
        getPings: () => pingsFor(followedSite),
        getHazards: () => hazardsFor(followedSite),
      }, 'SitePlanRadar');
      planCard.captionEl.textContent = `PLAN · ${(site && site.code) || followedSite}`;
      sensorCard.canvas.setAttribute('aria-label', t('radarView.sensors.aria', { site: sensorSiteObj ? L(sensorSiteObj, 'name', 'sites') : '—' }));
      planCard.canvas.setAttribute('aria-label', t('radarView.plan.aria', { site: site ? L(site, 'name', 'sites') : '—' }));
      sensorSiteBadge.querySelector('.badge-text').textContent = sensorSiteObj ? L(sensorSiteObj, 'name', 'sites') : '—';
      planSiteBadge.querySelector('.badge-text').textContent = site ? L(site, 'name', 'sites') : '—';
      paintMapLinks(followedSite, sensorSiteObj ? sensorSiteObj.id : followedSite);
    }
    function buildCompliance() {
      const clauses = isoClauses();
      radars.compliance = makeRadar(R.ComplianceRadar, complianceCard.canvas, {
        axes: clauses.map((c) => ({ id: String(c.id), label: `${c.id} ${clauseTitle(c)}` })),
        getValues: () => isoClauses().map((c) => Number(c.score) || 0),
        target: ISO_TARGET,
      }, 'ComplianceRadar');
      complianceCard.canvas.setAttribute('aria-label', t('radarView.iso.aria', { overall: fmt.pct(isoOverall()), target: fmt.pct(ISO_TARGET) }));
    }
    function setPaused(next) {
      paused = Boolean(next);
      try {
        if (loop) { if (paused && typeof loop.pause === 'function') loop.pause(); if (!paused && typeof loop.resume === 'function') loop.resume(); }
      } catch (err) { warn('radarLoop.pause', err); }
      cards.forEach((c) => c.frame.classList.toggle('is-paused', paused));
      pauseBtn.setAttribute('aria-pressed', paused ? 'true' : 'false');
      const lab = pauseBtn.querySelector('.btn-label');
      if (lab) lab.textContent = paused ? t('radarView.pause.resume') : t('radarView.pause.pause');
      const oldIcon = pauseBtn.querySelector('.btn-ic');
      if (oldIcon) { const fresh = ico(paused ? 'play' : 'pause', 14); fresh.classList.add('btn-ic'); oldIcon.replaceWith(fresh); }
    }

    /* ───────────── per-second tick (paused while the tab is hidden) ───────────── */
    function chipTone(ref, tone) {
      if (ref.tone === tone) return;
      ref.tone = tone;
      ref.stateEl.className = `tone-glyph tone-${tone}`;
      ref.stateEl.style.color = tone === 'neutral' || tone === 'accent' ? 'var(--ink-3)' : `var(--${tone}-text)`;
      ref.stateEl.replaceChildren(C.glyph(tone, 14));
      ref.stateSr.textContent = ` — ${t(`radarView.chipState.${tone}`)}`;
    }
    function tick() {
      if (destroyed || document.hidden) return;
      const st = state();
      const f = filters();
      const scopeSites = f.siteId === 'all' ? sites() : sites().filter((s) => s.id === f.siteId);
      const scopeIds = new Set(scopeSites.map((s) => s.id));
      const sensors = arr(st.sensors).filter((s) => s && scopeIds.has(s.siteId));

      /* chips: wind / heat follow the followed site's fixed axes (same numbers as the sensor dial) */
      const axes = currentAxes.length ? currentAxes : axesFor(followedSite);
      const vals = valuesFor(followedSite, axes);
      const axisReading = (key) => {
        const i = axes.findIndex((a) => a && a.key === key);
        if (i < 0 || axes[i].missing) return null;
        const v = vals[i];
        const thr = Number(axes[i].threshold) || Infinity;
        return { value: v, unit: unitLabel(axes[i].unit), tone: !Number.isFinite(v) ? 'neutral' : (v > thr ? 'critical' : v > thr * 0.8 ? 'warning' : 'good') };
      };
      const alerts = safe(() => sel.feedStats(st, 1), null, 'feedStats');
      const alertCount = alerts && Number.isFinite(alerts.alerts) ? alerts.alerts : 0;
      const people = scopeSites.reduce((sum, s) => sum + (Number(s.workers) || 0), 0);
      const vehicles = live && typeof live.getPings === 'function'
        ? scopeSites.reduce((sum, s) => sum + pingsFor(s.id).filter((p) => p && p.kind && p.kind !== 'worker').length, 0)
        : null;
      let over = 0; let near = 0;
      axes.forEach((a, i) => { if (!a || a.missing || !Number.isFinite(vals[i])) return; const thr = Number(a.threshold) || Infinity; if (vals[i] > thr) over += 1; else if (vals[i] > thr * 0.8) near += 1; });
      const chip = (id, value, unit, tone) => {
        const ref = chipRefs.get(id);
        if (!ref) return;
        setText(ref.value, value);
        setText(ref.unit, unit ? ` ${unit}` : '');
        const want = /[\u0600-\u06FF]/.test(`${value}${unit || ''}`) ? 'rtl' : 'ltr';
        const valueEl = ref.value.parentElement;
        if (valueEl && valueEl.getAttribute('dir') !== want) valueEl.setAttribute('dir', want);
        chipTone(ref, tone);
      };
      chip('sensors', fmt.num(sensors.length), '', over ? 'critical' : near ? 'warning' : 'good');
      chip('alerts', fmt.num(alertCount), '', alertCount > 0 ? 'warning' : 'good');
      chip('people', fmt.num(people), '', 'neutral');
      chip('vehicles', vehicles === null ? '—' : fmt.num(vehicles), '', 'neutral');
      const wind = axisReading('wind');
      const heat = axisReading('heat');
      chip('wind', wind ? fmtValue(wind.value) : '—', wind ? wind.unit : '', wind ? wind.tone : 'neutral');
      chip('wbgt', heat ? fmtValue(heat.value) : '—', heat ? heat.unit : '', heat ? heat.tone : 'neutral');

      /* sweep telemetry */
      const blips = currentBlips();
      const byTone = { critical: 0, serious: 0, warning: 0, good: 0 };
      let transients = 0;
      blips.forEach((b) => { if (b.transient) transients += 1; else if (b.tone in byTone) byTone[b.tone] += 1; });
      setTelemetry(sweepCard.tele, [
        { key: 'total', label: t('radarView.sweep.total'), value: fmt.num(blips.length - transients) },
        ...TIERS.map((x) => ({ key: x.tone, label: tierLabel(x.tier), value: fmt.num(byTone[x.tone]), state: x.tone === 'critical' && byTone.critical ? 'alert' : undefined })),
        { key: 'detections', label: t('radarView.sweep.detections'), value: fmt.num(transients) },
        { key: 'sweep', label: t('radarView.sweep.speed'), value: fmt.num(SWEEP_DEG_PER_SEC), unit: t('radarView.sweep.speedUnit') },
        { key: 'scope', label: t('radarView.sweep.scope'), value: f.siteId === 'all' ? t('radarView.common.allSites') : (siteName(f.siteId) || '—') },
      ]);
      sweepCard.canvas.setAttribute('aria-label', t('radarView.sweep.aria', { count: tn('radarView.common.risks', blips.length - transients), critical: fmt.num(byTone.critical) }));

      /* sensor telemetry */
      setTelemetry(sensorCard.tele, axes.length ? axes.map((a, i) => {
        if (!a || a.missing) return { key: a ? a.key || a.id : `x${i}`, label: axisLabel(a), value: t('radarView.sensors.noSensor'), state: 'missing' };
        const v = Number.isFinite(vals[i]) ? vals[i] : null;
        const thr = Number(a.threshold) || Infinity;
        return { key: a.key || a.id, label: axisLabel(a), value: fmtValue(v), unit: unitLabel(a.unit), state: v !== null && v > thr ? 'alert' : v !== null && v > thr * 0.8 ? 'warn' : undefined };
      }) : [{ key: 'none', label: t('radarView.sensors.empty'), value: '—' }]);

      /* site plan telemetry */
      const pings = pingsFor(followedSite);
      const hazards = hazardsFor(followedSite);
      const site = siteById(followedSite);
      const kinds = { worker: 0, vehicle: 0, crane: 0 };
      pings.forEach((p) => { if (p && p.kind in kinds) kinds[p.kind] += 1; });
      const hasLivePings = live && typeof live.getPings === 'function';
      setTelemetry(planCard.tele, [
        { key: 'workers', label: t('radarView.plan.workers'), value: hasLivePings ? fmt.num(kinds.worker) : '—' },
        { key: 'vehicles', label: t('radarView.plan.vehicles'), value: hasLivePings ? fmt.num(kinds.vehicle) : '—' },
        { key: 'cranes', label: t('radarView.plan.cranes'), value: hasLivePings ? fmt.num(kinds.crane) : '—' },
        { key: 'hazards', label: t('radarView.plan.hazards'), value: fmt.num(hazards.length), state: hazards.some((hz) => hz && hz.tone === 'critical') ? 'alert' : hazards.length ? 'warn' : undefined },
        { key: 'zones', label: t('radarView.plan.zones'), value: fmt.num(arr(site && site.zones).length) },
      ]);

      /* compliance telemetry (clause numbers are codes: Latin, never localised) */
      const overall = isoOverall();
      setTelemetry(complianceCard.tele, [
        { key: 'overall', label: t('radarView.iso.overall'), value: fmt.pct(overall), state: overall < ISO_TARGET ? 'warn' : undefined },
        { key: 'target', label: t('radarView.iso.target'), value: fmt.pct(ISO_TARGET) },
        ...isoClauses().map((c) => ({ key: `c${c.id}`, code: String(c.id), label: clauseTitle(c), title: `${c.id} ${clauseTitle(c)}`, value: fmt.pct(Number(c.score) || 0), state: (Number(c.score) || 0) < ISO_TARGET ? 'warn' : undefined })),
      ]);

      /* relative times + scope */
      const rel = (ms) => t('radarView.common.updated', { time: fmt.relative(ms) });
      setText(sweepCard.updatedText, rel(lastChangeAt));
      setText(sensorCard.updatedText, rel(lastSensorAt));
      setText(planCard.updatedText, rel(lastSensorAt));
      setText(complianceCard.updatedText, rel(lastChangeAt));
      setText(siteBadge.querySelector('.badge-text'), f.siteId === 'all'
        ? t('radarView.head.followAll', { site: siteName(followedSite) || '—' })
        : t('radarView.head.followOne', { site: siteName(f.siteId) || '—' }));
    }

    /* ───────────── boot ───────────── */
    buildSweep();
    buildSiteRadars();
    buildCompliance();
    tick();
    if (motion && typeof motion.enter === 'function') {
      motion.enter(Array.from(strip.children), { y: 6 });
      motion.enter(cards.map((c) => c.card), { y: 10, delay: 0.06 });
    }
    timers.push(setInterval(tick, 1000));
    const onVisibility = () => { if (!destroyed && !document.hidden) tick(); };
    document.addEventListener('visibilitychange', onVisibility);
    const onPhoneChange = () => { root.querySelectorAll('.tele-label').forEach(paintTeleLabel); };
    if (phoneMq && typeof phoneMq.addEventListener === 'function') phoneMq.addEventListener('change', onPhoneChange);

    subs.push(bus.on('store:change', (p) => {
      const path = String((p && p.path) || '*');
      if (/^sensors/.test(path)) lastSensorAt = Date.now();
      else if (!/^(feed|platform)/.test(path)) lastChangeAt = Date.now();
    }));
    subs.push(bus.on('sensors:tick', () => { lastSensorAt = Date.now(); }));
    subs.push(bus.on('filters:change', () => {
      if (destroyed) return;
      if (siteFor() !== followedSite) buildSiteRadars();
      tick();
    }));
    subs.push(bus.on('settings:change', () => {
      if (destroyed) return;
      cards.forEach((c) => { teleRefs.delete(c.tele); paintFrameStatus(c.statusEl, c.statusKind); });
      statusHost.replaceChildren(typeof C.statusBadge === 'function' ? C.statusBadge(sourceStatus(), { size: 'sm' }) : C.badge(statusText(sourceStatus()), 'accent'));
      tick();
    }));

    /* ───────────── cleanup ───────────── */
    return function cleanup() {
      destroyed = true;
      document.removeEventListener('visibilitychange', onVisibility);
      if (phoneMq && typeof phoneMq.removeEventListener === 'function') phoneMq.removeEventListener('change', onPhoneChange);
      subs.splice(0).forEach((off) => { try { off(); } catch { /* ignore */ } });
      timers.splice(0).forEach((x) => { clearInterval(x); clearTimeout(x); });
      Object.keys(radars).forEach((k) => { killRadar(radars[k]); radars[k] = null; });
      if (stripObserver) { try { stripObserver.disconnect(); } catch { /* ignore */ } stripObserver = null; }
      if (stripRaf) { cancelAnimationFrame(stripRaf); stripRaf = 0; }
      if (paused) { try { if (loop && typeof loop.resume === 'function') loop.resume(); } catch { /* ignore */ } }
      sweepCard.tip.hidden = true;
    };
  },
};
