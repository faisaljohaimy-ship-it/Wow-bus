/**
 * BILTIX Risk AI — HSE pillar · SEC-12 Site spatial view (js/views/spatial.js). Design: docs/design/spatial.md.
 *
 *   A. Head — title, lead, honest status (Demo data · cameras simulated, not connected), site selector.
 *   B. Site plan (MAP-01) — an engineering-style SVG drawn from data (js/data/spatial-seed.js + the zones of
 *      js/data/seed.js): zones as keyboard buttons, building footprints with levels, cranes with slewing radius,
 *      gates, haul roads, sensors (placed inside their zone), cameras with view cones (buttons), north arrow,
 *      scale bar and title block. The drawing never mirrors in Arabic; only UI chrome follows direction.
 *      Zone codes, badges and names are placed so they cover no camera, building outline or plant
 *      (SP.layoutZoneLabels); a long name wraps or shortens on the plan and stays whole in the accessible
 *      name and the table. Selecting a zone frames it (one viewBox tween per user action; none under reduced
 *      motion). Nothing on the plan animates continuously.
 *   C. Zone panel (ZONE) — what is linked to the selected zone, from the shared selectors via zoneLinks():
 *      HSE risks, sensors, cameras, open permits, incidents and inspections of the period, each a deep link.
 *      The panel is NOT a live region: one sr-only polite region says a short summary only when the user
 *      selects a zone or opens a camera. Live data that arrives while focus is inside the panel marks it
 *      dirty (counts are patched in place) and the panel re-renders when focus leaves it.
 *   D. Cameras (CAM-01) — the site's simulated cameras; each opens the viewer (components.modal) with a
 *      procedural feed (js/ui/camfeed.js) that renders only while the viewer is open and on screen; the
 *      picture opens with a short lens-iris reveal (off under reduced motion and with the Static background).
 *   E. Zones and links (LIST) — the text alternative of the plan (same numbers, same selection); a table at
 *      every width, stacked into labelled cards on narrow containers.
 *
 * URL: #/spatial?site=S1&zone=S1-Z2&camera=CAM-S1-03 (&risk=R9 highlights a register risk). The URL is the
 * truth: site / zone changes push a history entry (back steps through them; the router re-mounts the view),
 * opening / closing the viewer replaces the entry. A same-route re-mount skips the entrance animation.
 * Live data (store:change, feed:event, filters:change) patches the panels in place; nothing replays.
 */

import { i18n } from '../core/i18n.js';
import dict from '../i18n/spatial.js';
import * as SP from '../data/spatial-seed.js';
import { createCamFeed, riyadhHour, lightPhase } from '../ui/camfeed.js';

i18n.register('spatial', dict);

const VIEW_ID = 'spatial';
const CODE = 'SEC-12';
const SVG_NS = 'http://www.w3.org/2000/svg';
const CLOSED = 'مغلق';
const COMPASS = ['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw'];
const TONE_RANK = { critical: 0, serious: 1, warning: 2, good: 3 };
const PPE_WINDOW_MS = 12 * 3_600_000;
const FULL_VIEW = Object.freeze({ x: 0, y: 0, w: SP.PLAN.width, h: SP.PLAN.height });
const FRAME_MIN_W = 470;          // closest framing: about 2.1× the whole-site view

/** Sets an attribute only when it changes (live repaints stay free of style invalidations). */
function setAttr(el, name, value) {
  const v = String(value);
  if (el.getAttribute(name) !== v) el.setAttribute(name, v);
}

/** Text width in plan units (1 unit = 1 px at the font size given), measured with the page's own fonts. */
let measureCtx = null;
function measureText(text, size, weight = 600, mono = false) {
  try {
    if (!measureCtx) measureCtx = document.createElement('canvas').getContext('2d');
    const fam = getComputedStyle(document.documentElement).getPropertyValue(mono ? '--font-mono' : '--font-sans').trim() || (mono ? 'monospace' : 'sans-serif');
    measureCtx.font = `${weight} ${size}px ${fam}`;
    const w = measureCtx.measureText(String(text || '')).width;
    if (w > 0) return w;
  } catch { /* fall through */ }
  return String(text || '').length * size * (mono ? 0.62 : 0.56);
}

/** Last time this view was torn down (a re-mount within a second is the same route: no entrance replay). */
let lastCleanupAt = 0;
let mountSeq = 0;

const arr = (v) => (Array.isArray(v) ? v : []);

function hashParams() {
  try {
    const raw = String(location.hash || '').replace(/^#\/?/, '');
    const q = raw.indexOf('?');
    const id = decodeURIComponent(q === -1 ? raw : raw.slice(0, q));
    const params = {};
    if (q !== -1) for (const [k, v] of new URLSearchParams(raw.slice(q + 1))) params[k] = v;
    return { id, params };
  } catch { return { id: '', params: {} }; }
}

function s(tag, attrs = {}, ...children) {
  // Arabic text in the (LTR) drawing gets an RTL base direction; start/end anchors are swapped so the label
  // keeps its physical place (the drawing never mirrors).
  if ((tag === 'text' || tag === 'tspan') && attrs && typeof attrs.text === 'string' && /[\u0600-\u06FF]/.test(attrs.text)) {
    const a = attrs['text-anchor'];
    attrs = { ...attrs, direction: 'rtl', 'text-anchor': a === 'start' ? 'end' : a === 'end' ? 'start' : (a || 'end') };
    if (!a) attrs['text-anchor'] = 'end';
  }
  const el = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') el.setAttribute('class', Array.isArray(v) ? v.filter(Boolean).join(' ') : String(v));
    else if (k === 'text') el.textContent = String(v);
    else el.setAttribute(k, String(v));
  }
  for (const c of children.flat()) if (c instanceof Node) el.appendChild(c);
  return el;
}

const r1 = (n) => Math.round(n * 10) / 10;

/** Up to two lines at word boundaries; the second line is shortened with an ellipsis when needed. */
function wrapName(text, max) {
  const str = String(text || '');
  if (str.length <= max) return [str];
  const cut = str.lastIndexOf(' ', max);
  const head = (cut > max * 0.4 ? str.slice(0, cut) : str.slice(0, max)).trim();
  let rest = str.slice(head.length).trim();
  if (rest.length > max) rest = `${rest.slice(0, max - 1).trim()}…`;
  return rest ? [head, rest] : [head];
}

export default {
  id: VIEW_ID,
  code: CODE,
  icon: 'map-pin',
  get title() { return i18n.has('core.nav.spatial.title') ? i18n.t('core.nav.spatial.title') : i18n.t('spatial.title'); },

  render(container, ctx) {
    const { store, bus, sel, fmt, router } = ctx;
    const C = ctx.components || {};
    const { h } = C;
    const I = ctx.i18n || i18n;
    const t = (key, p) => I.t(key, p);
    const tn = (key, count, p) => I.tn(key, count, p);
    const L = (record, field, ns) => (record ? I.L(record, field, ns) : '');
    const label = (ns, value) => I.label(ns, value);
    const isEn = () => I.lang() !== 'ar';
    const motion = ctx.motion || C.motion || null;
    const mount = ++mountSeq;
    const sameRouteRemount = Date.now() - lastCleanupAt < 1200;
    const uid = `sp${mount}`;

    /* ───────────── data accessors ───────────── */
    const state = () => store.state || {};
    const sites = () => arr(state().sites);
    const siteById = (id) => sites().find((x) => x && x.id === id) || null;
    const zonesOf = (site) => arr(site && site.zones);
    const zoneById = (site, id) => zonesOf(site).find((z) => z && z.id === id) || null;
    const zonesL = (site) => arr(site ? L(site, 'zones', 'sites') : []);
    const zoneName = (site, id) => { const i = zonesOf(site).findIndex((z) => z.id === id); const zl = zonesL(site)[i]; return (zl && zl.name) || (zonesOf(site)[i] && zonesOf(site)[i].name) || id; };
    const siteName = (site) => (site ? L(site, 'name', 'sites') || site.name : '—');
    const globalFilters = () => ({ siteId: 'all', range: 30, ...(store.filters || state().filters || {}) });
    const nowDate = () => (typeof store.now === 'function' ? store.now() : new Date());
    const safe = (fn, fallback) => { try { const v = fn(); return v === undefined || v === null ? fallback : v; } catch { return fallback; } };
    const toneOfRisk = (r) => safe(() => sel.tierTone(sel.riskTier(sel.riskScore(r))), 'warning');
    const tierOfRisk = (r) => safe(() => sel.riskTier(sel.riskScore(r)), '');
    const codeSpan = (code) => h('span', { class: 'code mono sp-code', dir: 'ltr', translate: 'no' }, String(code || ''));
    const ico = (name, size = 16) => { const n = C.svgIcon(name, size); n.setAttribute('aria-hidden', 'true'); return n; };
    const metres = (n) => t('spatial.units.m', { n: fmt.num(n) });
    const degrees = (n) => t('spatial.units.deg', { n: fmt.num(Math.round(n)) });
    const compass = (deg) => t(`spatial.compass.${COMPASS[Math.round((((deg % 360) + 360) % 360) / 45) % 8]}`);
    /** Data text that stayed Arabic in English mode carries lang="ar" (honest + QA). */
    const dataText = (str, cls = null) => { const v = String(str ?? ''); return isEn() && /[؀-ۿ]/.test(v) ? h('span', { class: cls, lang: 'ar', dir: 'rtl' }, v) : h('span', { class: cls }, v); };

    /* ───────────── selection (URL is the truth) ───────────── */
    const readParams = () => { const cur = hashParams(); return cur.id === VIEW_ID ? cur.params : (ctx.params || {}); };
    const params = readParams();
    const findHseRisk = (id) => arr(state().risks).find((r) => r && r.id === id) || null;
    const validSite = (id) => (id && siteById(id) && SP.planFor(id) ? id : null);
    const g0 = globalFilters();
    const paramRisk = params.risk ? findHseRisk(params.risk) : null;
    let siteId = validSite(params.site) || (paramRisk ? validSite(paramRisk.siteId) : null) || validSite(g0.siteId) || validSite('S1') || (sites()[0] && sites()[0].id);
    let zoneId = null;
    {
      const site = siteById(siteId);
      if (params.zone && zoneById(site, params.zone)) zoneId = params.zone;
      else if (paramRisk && paramRisk.siteId === siteId && zoneById(site, paramRisk.zoneId)) zoneId = paramRisk.zoneId;
    }
    let highlightRisk = paramRisk && paramRisk.siteId === siteId ? paramRisk.id : null;
    let pendingCamera = params.camera && SP.cameraById(params.camera) && SP.cameraById(params.camera).siteId === siteId ? params.camera : null;
    if (pendingCamera && !zoneId) zoneId = SP.cameraById(pendingCamera).zoneId;
    let openCameraId = null;

    function hashFor(extra = {}) {
      return router.href(VIEW_ID, SP.spatialParams({ site: siteId, zone: zoneId, camera: openCameraId, risk: highlightRisk, ...extra }));
    }
    function writeUrl(mode) {
      const hash = hashFor();
      if (location.hash === hash) return;
      try {
        if (mode === 'push') history.pushState(null, '', hash);
        else history.replaceState(history.state, '', hash);
      } catch { /* sandboxed: the selection still works, only the URL is stale */ }
    }

    /* ───────────── lifecycle registers ───────────── */
    const subs = [];
    const timers = [];
    let destroyed = false;
    let refreshRaf = 0;
    let viewer = null;          // { api, feed, cam, ppeHost, events, stillBadge, caption }
    let view = { ...FULL_VIEW }; // current plan viewBox
    let viewRaf = 0;            // framing tween (runs only while moving)
    let planRO = null;          // ResizeObserver for the touch-size hit areas

    /* ═════════════ A. head ═════════════ */
    const root = h('section', { class: 'view view-spatial' });
    const siteSelect = h('select', { class: 'field-control sp-site-select', id: `${uid}-site`, 'aria-describedby': `${uid}-site-hint` });
    const fillSites = () => {
      siteSelect.replaceChildren(...sites().filter((x) => SP.planFor(x.id)).map((x) => h('option', { value: x.id, selected: x.id === siteId ? '' : null }, `${siteName(x)} · ${x.code}`)));
      siteSelect.value = siteId;
    };
    fillSites();
    siteSelect.addEventListener('change', () => setSite(siteSelect.value, { push: true }));
    const head = h('div', { class: 'view-head' },
      h('div', { class: 'view-head-text' },
        h('span', { class: 'code-tag', translate: 'no' }, CODE),
        h('h1', { tabindex: '-1' }, i18n.has('core.nav.spatial.title') ? t('core.nav.spatial.title') : t('spatial.title')),
        h('p', { class: 'view-lead' }, t('spatial.lead'))),
      h('div', { class: 'view-actions sp-head-actions' },
        h('div', { class: 'row gap-2 wrap sp-head-status' },
          C.statusBadge('demo', { size: 'sm' }),
          C.statusBadge('not_connected', { label: t('spatial.head.camerasStatus'), title: t('spatial.head.camerasStatusDesc'), size: 'sm' })),
        h('div', { class: 'sp-site-field' },
          h('label', { class: 't-label', for: `${uid}-site` }, t('spatial.site.label')),
          siteSelect,
          h('span', { class: 'sr-only', id: `${uid}-site-hint` }, t('spatial.site.hint')))));
    root.appendChild(head);
    // the one live region of the view: written only when the user selects a zone or opens a camera
    const srLive = h('p', { class: 'sr-only', 'aria-live': 'polite', 'aria-atomic': 'true' });
    root.appendChild(srLive);

    /* ═════════════ B–E. body (rebuilt on site change) ═════════════ */
    const bodyHost = h('div', { class: 'sp-body' });
    root.appendChild(bodyHost);
    container.appendChild(root);

    let refs = null;   // per-site DOM references

    let linkMemo = null;   // per-repaint memo (a refresh paints the plan, the table and the panel from one pass)
    function links(zid) {
      if (linkMemo && linkMemo.has(zid)) return linkMemo.get(zid);
      const v = SP.zoneLinks(state(), siteId, zid, { sel });
      if (linkMemo) linkMemo.set(zid, v);
      return v;
    }

    /* ───────────── plan (SVG) ───────────── */
    function buildPlan(site, plan) {
      const { inner } = SP.PLAN;
      const X = (x) => r1(inner.x + x * inner.w);
      const Y = (y) => r1(inner.y + y * inner.h);
      const titleId = `${uid}-plan-title`;
      const descId = `${uid}-plan-desc`;
      const svg = s('svg', { class: 'sp-svg', viewBox: `0 0 ${SP.PLAN.width} ${SP.PLAN.height}`, role: 'group', 'aria-labelledby': titleId, 'aria-describedby': descId, focusable: 'false', direction: 'ltr' });
      svg.appendChild(s('title', { id: titleId, text: t('spatial.plan.aria', { site: siteName(site) }) }));
      svg.appendChild(s('desc', { id: descId, text: t('spatial.plan.desc', { zones: tn('spatial.n.zones', zonesOf(site).length, { count: fmt.num(zonesOf(site).length) }), cameras: tn('spatial.n.cameras', SP.camerasFor(siteId).length, { count: fmt.num(SP.camerasFor(siteId).length) }) }) }));
      const hatch = `${uid}-hatch`; const dots = `${uid}-dots`; const clip = `${uid}-clip`;
      svg.appendChild(s('defs', {},
        s('clipPath', { id: clip }, s('rect', { x: inner.x - 18, y: inner.y - 18, width: inner.w + 36, height: inner.h + 30 })),
        s('pattern', { id: hatch, width: 8, height: 8, patternUnits: 'userSpaceOnUse', patternTransform: 'rotate(45)' }, s('line', { x1: 0, y1: 0, x2: 0, y2: 8, class: 'sp-hatch-line' })),
        s('pattern', { id: dots, width: 10, height: 10, patternUnits: 'userSpaceOnUse' }, s('circle', { cx: 2, cy: 2, r: 0.9, class: 'sp-dot' }))));
      // paper + engineering grid
      const paper = s('g', { class: 'sp-paper', 'aria-hidden': 'true' });
      paper.appendChild(s('rect', { x: 0, y: 0, width: SP.PLAN.width, height: SP.PLAN.height, class: 'sp-paper-bg' }));
      for (let x = 0; x <= SP.PLAN.width; x += 25) paper.appendChild(s('line', { x1: x, y1: 0, x2: x, y2: SP.PLAN.height, class: x % 100 === 0 ? 'sp-grid-major' : 'sp-grid-minor' }));
      for (let y = 0; y <= SP.PLAN.height; y += 25) paper.appendChild(s('line', { x1: 0, y1: y, x2: SP.PLAN.width, y2: y, class: y % 100 === 0 ? 'sp-grid-major' : 'sp-grid-minor' }));
      svg.appendChild(paper);
      // public road outside the boundary (bottom)
      const ctxG = s('g', { class: 'sp-context', 'aria-hidden': 'true' });
      const roadY = inner.y + inner.h + 14;
      ctxG.appendChild(s('rect', { x: 0, y: roadY, width: SP.PLAN.width, height: 26, class: 'sp-public-road' }));
      ctxG.appendChild(s('line', { x1: 0, y1: roadY + 13, x2: SP.PLAN.width, y2: roadY + 13, class: 'sp-road-center' }));
      ctxG.appendChild(s('text', { x: inner.x + inner.w / 2, y: roadY + 17.5, class: 'sp-ctx-label', 'text-anchor': 'middle', text: t('spatial.plan.publicRoad') }));
      svg.appendChild(ctxG);

      // zones (interactive shapes)
      const zoneG = s('g', { class: 'sp-zones' });
      const zoneEls = new Map();
      zonesOf(site).forEach((z) => {
        const g = s('g', { class: 'sp-zone', role: 'button', tabindex: '0', 'data-zone': z.id, 'aria-pressed': z.id === zoneId ? 'true' : 'false' });
        g.appendChild(s('rect', { x: X(z.x) + 3, y: Y(z.y) + 3, width: r1(z.w * inner.w - 6), height: r1(z.h * inner.h - 6), rx: 6, class: 'sp-zone-shape' }));
        zoneG.appendChild(g);
        zoneEls.set(z.id, g);
      });
      svg.appendChild(zoneG);
      // boundary (hoarding)
      svg.appendChild(s('rect', { x: inner.x, y: inner.y, width: inner.w, height: inner.h, class: 'sp-boundary', 'aria-hidden': 'true' }));

      // features (decorative, never intercept the pointer)
      const feat = s('g', { class: 'sp-features', 'aria-hidden': 'true', 'clip-path': `url(#${clip})` });
      for (const road of arr(plan.roads)) {
        const pts = road.map(([x, y]) => `${X(x)},${Y(y)}`).join(' ');
        feat.appendChild(s('polyline', { points: pts, class: 'sp-road' }));
        feat.appendChild(s('polyline', { points: pts, class: 'sp-road-center' }));
      }
      for (const a of arr(plan.arrays)) {
        const [x, y, w, hh] = a.rect;
        const rows = Math.max(1, a.rows || 6);
        for (let i = 0; i < rows; i += 1) feat.appendChild(s('rect', { x: X(x), y: r1(Y(y) + (i * hh * inner.h) / rows + 2), width: r1(w * inner.w), height: r1(Math.max(3, (hh * inner.h) / rows - 6)), class: 'sp-array' }));
      }
      for (const p of arr(plan.pits)) {
        const [x, y, w, hh] = p.rect;
        const n = Math.max(1, p.benches || 3);
        for (let i = 0; i < n; i += 1) {
          const k = (i * 0.5) / n;
          feat.appendChild(s('rect', { x: r1(X(x + w * k * 0.5)), y: r1(Y(y + hh * k * 0.5)), width: r1(w * (1 - k) * inner.w), height: r1(hh * (1 - k) * inner.h), rx: 18 - i * 3, class: i === 0 ? 'sp-pit-rim' : 'sp-pit-bench' }));
        }
        feat.appendChild(s('text', { x: X(x + w / 2), y: Y(y + hh / 2) + 4, class: 'sp-feature-label', 'text-anchor': 'middle', text: t('spatial.plan.excavation') }));
      }
      for (const st of arr(plan.structures)) {
        const [x, y, w, hh] = st.rect;
        const cls = `sp-st sp-st-${st.type}`;
        feat.appendChild(s('rect', { x: X(x), y: Y(y), width: r1(w * inner.w), height: r1(hh * inner.h), rx: st.type === 'tank' ? Math.min(w * inner.w, hh * inner.h) / 2 : 2, class: cls, fill: st.type === 'stack' ? `url(#${dots})` : null }));
        if (st.type === 'container' || st.type === 'cabin') feat.appendChild(s('line', { x1: X(x), y1: Y(y + hh / 2), x2: X(x + w), y2: Y(y + hh / 2), class: 'sp-st-seam' }));
        if (st.label) feat.appendChild(s('text', { x: X(x + w / 2), y: Y(y + hh / 2) + 4, class: 'sp-feature-label', 'text-anchor': 'middle', text: isEn() ? (st.labelEn || st.label) : st.label }));
      }
      for (const fp of arr(plan.footprints)) {
        const pts = fp.poly.map(([x, y]) => `${X(x)},${Y(y)}`).join(' ');
        feat.appendChild(s('polygon', { points: pts, class: ['sp-footprint', fp.existing ? 'is-existing' : null], fill: `url(#${hatch})` }));
        feat.appendChild(s('polygon', { points: pts, class: 'sp-footprint-edge' }));
        const xs = fp.poly.map((p) => p[0]); const ys = fp.poly.map((p) => p[1]);
        const minX = Math.min(...xs); const maxX = Math.max(...xs); const minY = Math.min(...ys); const maxY = Math.max(...ys);
        if (fp.grid || !fp.existing) {
          const stepX = (maxX - minX) / Math.max(2, Math.round(((maxX - minX) * inner.w) / 46));
          const stepY = (maxY - minY) / Math.max(2, Math.round(((maxY - minY) * inner.h) / 46));
          for (let gx = minX + stepX; gx < maxX - 1e-6; gx += stepX) for (let gy = minY + stepY; gy < maxY - 1e-6; gy += stepY) feat.appendChild(s('rect', { x: X(gx) - 2, y: Y(gy) - 2, width: 4, height: 4, class: 'sp-column' }));
        }
        if (fp.core) feat.appendChild(s('polygon', { points: fp.core.map(([x, y]) => `${X(x)},${Y(y)}`).join(' '), class: 'sp-core' }));
        const name = isEn() ? (fp.labelEn || fp.label) : fp.label;
        const lv = fp.levels || {};
        const text = lv.total && lv.total > 1 && lv.done < lv.total
          ? t('spatial.plan.levels', { name, done: fmt.num(lv.done), total: fmt.num(lv.total) })
          : (lv.total > 1 ? t('spatial.plan.levelsAll', { name, levels: tn('spatial.n.levels', lv.total, { count: fmt.num(lv.total) }) }) : name);
        const cx = (minX + maxX) / 2; const cy = (minY + maxY) / 2;
        const plateW = Math.min((maxX - minX) * inner.w - 10, Math.max(70, text.length * 6.9 + 18));
        feat.appendChild(s('rect', { x: r1(X(cx) - plateW / 2), y: Y(cy) - 11, width: r1(plateW), height: 20, rx: 4, class: 'sp-label-plate' }));
        feat.appendChild(s('text', { x: X(cx), y: Y(cy) + 4, class: 'sp-footprint-label', 'text-anchor': 'middle', text }));
      }
      for (const mh of arr(plan.manholes)) {
        feat.appendChild(s('circle', { cx: X(mh.x), cy: Y(mh.y), r: 7, class: 'sp-manhole' }));
        feat.appendChild(s('text', { x: X(mh.x) + 11, y: Y(mh.y) + 4, class: 'sp-code-label', text: mh.code }));
      }
      for (const cr of arr(plan.cranes)) {
        const cx = X(cr.x); const cy = Y(cr.y); const rr = r1(cr.r * inner.w);
        feat.appendChild(s('circle', { cx, cy, r: rr, class: 'sp-crane-radius' }));
        const ang = Math.atan2(Y(0.5) - cy, X(0.5) - cx);
        feat.appendChild(s('line', { x1: r1(cx - Math.cos(ang) * rr * 0.3), y1: r1(cy - Math.sin(ang) * rr * 0.3), x2: r1(cx + Math.cos(ang) * rr), y2: r1(cy + Math.sin(ang) * rr), class: 'sp-crane-jib' }));
        feat.appendChild(s('rect', { x: cx - 6, y: cy - 6, width: 12, height: 12, class: 'sp-crane-mast' }));
        feat.appendChild(s('text', { x: cx + 10, y: cy + 18, class: 'sp-code-label', text: cr.id }));
      }
      for (const gt of arr(plan.gates)) {
        const gx = X(gt.x); const gy = Y(gt.y);
        const horiz = gt.side === 'n' || gt.side === 's';
        feat.appendChild(s('rect', { x: horiz ? gx - 20 : gx - 5, y: horiz ? gy - 5 : gy - 20, width: horiz ? 40 : 10, height: horiz ? 10 : 40, class: 'sp-gate' }));
        // labels sit outside the hoarding: along the west / east edge (rotated), in the road band for south gates
        const text = isEn() ? (gt.labelEn || gt.label) : gt.label;
        if (gt.side === 'w' || gt.side === 'e') {
          const lx = gt.side === 'w' ? gx - 12 : gx + 12;
          feat.appendChild(s('text', { x: lx, y: gy, transform: `rotate(${gt.side === 'w' ? -90 : 90} ${lx} ${gy})`, class: 'sp-gate-label', 'text-anchor': 'middle', text }));
        } else {
          feat.appendChild(s('text', { x: gx, y: gt.side === 's' ? gy + 28 : gy - 10, class: 'sp-gate-label', 'text-anchor': 'middle', text }));
        }
      }
      // sensors (placed inside their zone; the seed has no surveyed position)
      const sensorsAll = arr(state().sensors).filter((x) => x && x.siteId === siteId);
      sensorsAll.forEach((sn, i) => {
        const z = zoneById(site, sn.zoneId);
        if (!z) return;
        const p = SP.markerPoint(z, sn.id, i);
        feat.appendChild(s('rect', { x: X(p.x) - 5, y: Y(p.y) - 5, width: 10, height: 10, transform: `rotate(45 ${X(p.x)} ${Y(p.y)})`, class: 'sp-sensor' }));
      });
      svg.appendChild(feat);

      // zone labels + risk badges (not interactive; the zone button carries the accessible name). Placement is
      // computed by SP.layoutZoneLabels so codes, badges and names cover no camera, outline or plant.
      const labelG = s('g', { class: 'sp-zone-labels', 'aria-hidden': 'true' });
      const badgeEls = new Map();
      zonesOf(site).forEach((z) => {
        const badge = s('g', { class: 'sp-zone-badge' });
        badge.appendChild(s('circle', { r: SP.LABEL.badge.r, class: 'sp-badge-dot' }));
        const num = s('text', { y: 4.5, 'text-anchor': 'middle', class: 'sp-badge-num' });
        badge.appendChild(num);
        badgeEls.set(z.id, { g: badge, num });
      });
      const textG = s('g', {});
      labelG.appendChild(textG);
      badgeEls.forEach((b) => labelG.appendChild(b.g));
      const nameEls = new Map();
      function layoutLabels() {
        const sensors = arr(state().sensors);
        const names = zonesOf(site).map((z) => zoneName(site, z.id));
        const opts = { sensors, measure: measureText, isEn: isEn() };
        const lay = SP.layoutZoneLabels(site, names, { obstacles: SP.planObstacles(siteId, site, opts), obstaclesNarrow: SP.planObstacles(siteId, site, { ...opts, narrow: true }), measure: measureText });
        textG.replaceChildren();
        nameEls.clear();
        zonesOf(site).forEach((z) => {
          const L0 = lay.get(z.id);
          if (!L0) return;
          const short = z.id.split('-').pop();
          textG.appendChild(s('text', { x: r1(L0.code.x), y: r1(L0.code.y), class: 'sp-zone-code', text: short }));
          textG.appendChild(s('text', { x: r1(L0.codeNarrow.x), y: r1(L0.codeNarrow.y), class: 'sp-zone-code is-narrow', text: short }));
          const b = badgeEls.get(z.id);
          if (b) setAttr(b.g, 'transform', `translate(${r1(L0.badge.cx)} ${r1(L0.badge.cy)})`);
          if (L0.name) {
            const nm = L0.name;
            const rtl = /[\u0600-\u06FF]/.test(nm.full);
            const nameEl = s('text', { x: r1(nm.cx), y: r1(nm.baseline), class: ['sp-zone-name', nm.shortened ? 'is-short' : null], 'text-anchor': 'middle', direction: rtl ? 'rtl' : null, 'data-zone': z.id });
            nm.lines.forEach((ln, li) => nameEl.appendChild(s('tspan', { x: r1(nm.cx), dy: li ? SP.LABEL.name.line : 0, 'text-anchor': 'middle', text: ln })));
            textG.appendChild(nameEl);
            nameEls.set(z.id, nameEl);
          }
        });
      }
      layoutLabels();
      svg.appendChild(labelG);

      // cameras (interactive): view cone (decorative, no pointer), hit area (resized for touch, split between
      // close neighbours), glyph (scaled up on narrow plans) and code label
      // The group is not clipped (a clip would also cut the touch areas at the site edge): each view cone is a
      // polygon already clipped to the site margin.
      const camG = s('g', { class: 'sp-cams' });
      const camEls = new Map();
      const hitEls = new Map();
      SP.camerasFor(siteId).forEach((cam) => {
        const cx = X(cam.x); const cy = Y(cam.y);
        const R = r1((cam.range || 0.2) * inner.w);
        const a0 = ((cam.heading - cam.fov / 2) * Math.PI) / 180;
        const a1 = ((cam.heading + cam.fov / 2) * Math.PI) / 180;
        const arc = [[0, 0]];
        for (let k = 0; k <= 16; k += 1) { const a = a0 + ((a1 - a0) * k) / 16; arc.push([R * Math.sin(a), -R * Math.cos(a)]); }
        const cone = SP.clipToRect(arc, inner.x - 18 - cx, inner.y - 18 - cy, inner.x + inner.w + 18 - cx, inner.y + inner.h + 12 - cy);
        const g = s('g', { class: 'sp-cam', role: 'button', tabindex: '0', 'data-camera': cam.id, transform: `translate(${cx} ${cy})`, 'aria-label': camAria(cam, site) });
        g.appendChild(s('path', { d: polyPath(cone), class: 'sp-cam-cone' }));
        const hit = s('path', { class: 'sp-cam-hit', d: polyPath(SP.hitPolygons([{ id: cam.id, x: cx, y: cy }], 22).get(cam.id)) });
        g.appendChild(hit);
        hitEls.set(cam.id, { el: hit, x: cx, y: cy });
        const glyph = s('g', { class: 'sp-cam-glyph' });
        const body = s('g', { transform: `rotate(${cam.heading})` });
        body.appendChild(s('rect', { x: -7, y: -5, width: 14, height: 15, rx: 3, class: 'sp-cam-body' }));
        body.appendChild(s('rect', { x: -4, y: -10, width: 8, height: 6, rx: 1.5, class: 'sp-cam-lens' }));
        glyph.appendChild(body);
        g.appendChild(glyph);
        const lo = SP.camLabelOffset(cam);
        g.appendChild(s('text', { x: lo.dx, y: lo.dy, class: 'sp-cam-label', 'text-anchor': lo.anchor, text: cam.id }));
        camG.appendChild(g);
        camEls.set(cam.id, g);
      });
      svg.appendChild(camG);

      // north arrow + scale bar + title block (fixed drawing furniture, never mirrored)
      const furn = s('g', { class: 'sp-furniture', 'aria-hidden': 'true' });
      const nx = 948; const ny = 92;
      const north = s('g', { transform: `translate(${nx} ${ny}) rotate(${plan.trueNorthDeg || 0})` });
      north.appendChild(s('circle', { r: 30, class: 'sp-north-ring' }));
      north.appendChild(s('path', { d: 'M0 -26 L9 8 L0 2 L-9 8 Z', class: 'sp-north-arrow' }));
      north.appendChild(s('path', { d: 'M0 -26 L0 2 L-9 8 Z', class: 'sp-north-arrow-half' }));
      north.appendChild(s('text', { y: -36, 'text-anchor': 'middle', class: 'sp-north-label', text: t('spatial.plan.north') }));
      furn.appendChild(north);
      furn.appendChild(s('text', { x: nx, y: ny + 52, 'text-anchor': 'middle', class: 'sp-furn-small', text: t('spatial.plan.trueNorth') }));
      // scale bar: a round length near 18 % of the site width
      const metresPerUnit = (plan.widthM || 200) / inner.w;
      const target = (plan.widthM || 200) * 0.18;
      const pow = 10 ** Math.floor(Math.log10(target));
      const nice = [1, 2, 5, 10].map((k) => k * pow).reduce((best, v) => (Math.abs(v - target) < Math.abs(best - target) ? v : best), pow);
      const barW = nice / metresPerUnit;
      const sx = inner.x; const sy = SP.PLAN.height - 30;
      for (let i = 0; i < 4; i += 1) furn.appendChild(s('rect', { x: r1(sx + (i * barW) / 4), y: sy, width: r1(barW / 4), height: 8, class: i % 2 ? 'sp-scale-light' : 'sp-scale-dark' }));
      furn.appendChild(s('rect', { x: sx, y: sy, width: r1(barW), height: 8, class: 'sp-scale-frame' }));
      furn.appendChild(s('text', { x: sx, y: sy - 6, class: 'sp-furn-small', text: fmt.num(0) }));
      furn.appendChild(s('text', { x: r1(sx + barW / 2), y: sy - 6, 'text-anchor': 'middle', class: 'sp-furn-small', text: fmt.num(nice / 2) }));
      furn.appendChild(s('text', { x: r1(sx + barW), y: sy - 6, 'text-anchor': 'middle', class: 'sp-furn-small', text: metres(nice) }));
      // title block (bottom end)
      const tbW = 300; const tbX = inner.x + inner.w - tbW; const tbY = SP.PLAN.height - 46;
      furn.appendChild(s('rect', { x: tbX, y: tbY, width: tbW, height: 34, class: 'sp-titleblock' }));
      furn.appendChild(s('line', { x1: tbX + 92, y1: tbY, x2: tbX + 92, y2: tbY + 34, class: 'sp-titleblock-rule' }));
      furn.appendChild(s('text', { x: tbX + 46, y: tbY + 22, 'text-anchor': 'middle', class: 'sp-titleblock-code', text: site.code }));
      furn.appendChild(s('text', { x: tbX + 92 + (tbW - 92) / 2, y: tbY + 15, 'text-anchor': 'middle', class: 'sp-furn-small', text: t('spatial.plan.titleBlock') }));
      furn.appendChild(s('text', { x: tbX + 92 + (tbW - 92) / 2, y: tbY + 28, 'text-anchor': 'middle', class: 'sp-furn-small', text: t('spatial.plan.illustrative') }));
      svg.appendChild(furn);

      // interaction
      const activate = (target) => {
        const zEl = target.closest && target.closest('.sp-zone');
        const cEl = target.closest && target.closest('.sp-cam');
        if (cEl) { openViewer(cEl.getAttribute('data-camera'), { returnFocus: cEl }); return true; }
        if (zEl) { selectZone(zEl.getAttribute('data-zone'), { push: true, focusPanel: false, user: true }); return true; }
        return false;
      };
      svg.addEventListener('click', (e) => { activate(e.target); });
      svg.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        if (activate(e.target)) e.preventDefault();
      });
      return { svg, zoneEls, camEls, badgeEls, hitEls, nameEls, layoutLabels };
    }

    function polyPath(pts) {
      if (!pts || !pts.length) return '';
      return `M${pts.map((p) => `${r1(p[0])} ${r1(p[1])}`).join(' L')} Z`;
    }

    function camAria(cam, site) {
      return t('spatial.plan.cameraAria', { code: cam.id, purpose: L(cam, 'purpose', 'cameras'), zone: zoneName(site, cam.zoneId) });
    }

    /* ───────────── zone panel ───────────── */
    function countChip(key, n, extra = null) {
      return h('div', { class: 'sp-count', 'data-k': key },
        h('span', { class: 'sp-count-num t-metric', dir: 'ltr' }, fmt.num(n)),
        h('span', { class: 'sp-count-label' }, t(`spatial.counts.${key}`)),
        extra);
    }
    function sectionList(key, items, renderItem, emptyKey = 'spatial.zone.none') {
      const id = `${uid}-sec-${key}`;
      return h('section', { class: 'sp-sec', 'aria-labelledby': id },
        h('h4', { class: 'sp-sec-title', id }, ico(SECTION_ICON[key] || 'dot', 15), h('span', {}, t(`spatial.sections.${key}`)), h('span', { class: 'sp-sec-count', dir: 'ltr' }, fmt.num(items.length))),
        items.length
          ? h('ul', { class: 'sp-list', role: 'list' }, items.map((it) => h('li', { class: 'sp-item' }, renderItem(it))))
          : h('p', { class: 'sp-empty t-helper' }, t(emptyKey)));
    }
    const SECTION_ICON = { risks: 'shield-alert', sensors: 'sensor', cameras: 'cctv', permits: 'file-check', incidents: 'alert-triangle', inspections: 'clipboard' };

    function riskItem(r) {
      const tier = tierOfRisk(r);
      const overdue = safe(() => sel.isOverdueRisk(r, new Date(nowDate().getFullYear(), nowDate().getMonth(), nowDate().getDate()).getTime()), false);
      return h('a', { class: ['sp-link', r.id === highlightRisk ? 'is-highlight' : null], href: router.href('risks', { id: r.id }) },
        h('span', { class: 'sp-link-main' }, codeSpan(r.code), dataText(L(r, 'hazard', 'risks') || r.hazard || '', 'sp-link-text')),
        h('span', { class: 'sp-link-meta' },
          tier ? C.badge(label('tier', tier), toneOfRisk(r)) : null,
          r.status === CLOSED ? C.badge(label('riskStatus', r.status), 'neutral') : null,
          overdue ? C.badge(t('spatial.zone.overdue'), 'critical', { icon: 'clock' }) : null));
    }
    const sensorRefs = new Map();
    function sensorItem(sn) {
      const value = h('span', { class: 'sp-reading', dir: 'ltr' });
      sensorRefs.set(sn.id, { value, sn });
      paintSensor(sn.id);
      return h('a', { class: 'sp-link', href: router.href('radar', { site: siteId }) },
        h('span', { class: 'sp-link-main' }, codeSpan(sn.code), h('span', { class: 'sp-link-text' }, label('sensorKind', sn.kind) || sn.kind)),
        h('span', { class: 'sp-link-meta' }, value, C.badge(t('spatial.zone.simulatedReading'), 'accent', { icon: 'flask' })));
    }
    function paintSensor(id) {
      const ref = sensorRefs.get(id);
      if (!ref) return;
      const sn = arr(state().sensors).find((x) => x && x.id === id) || ref.sn;
      const v = Number(sn.value);
      const text = Number.isFinite(v) ? `${fmt.num(v, { maximumFractionDigits: Math.abs(v) < 10 ? 1 : 0 })} ${label('unit', sn.unit) || sn.unit || ''}`.trim() : '—';
      if (ref.value.textContent !== text) ref.value.textContent = text;
    }
    function cameraItem(cam) {
      return h('button', { type: 'button', class: 'sp-link is-button', onClick: (e) => openViewer(cam.id, { returnFocus: e.currentTarget }) },
        h('span', { class: 'sp-link-main' }, codeSpan(cam.id), h('span', { class: 'sp-link-text' }, L(cam, 'purpose', 'cameras'))),
        h('span', { class: 'sp-link-meta' }, C.statusBadge('demo', { label: t('spatial.viewer.simulated'), size: 'sm', title: false }), h('span', { class: 'sp-link-cta' }, t('spatial.cameras.open'))));
    }
    function permitItem(p) {
      return h('a', { class: 'sp-link', href: router.href('permits', { id: p.id }) },
        h('span', { class: 'sp-link-main' }, codeSpan(p.code), h('span', { class: 'sp-link-text' }, label('permitType', p.type) || p.type)),
        h('span', { class: 'sp-link-meta' }, C.badge(label('permitStatus', p.status) || p.status, p.status === 'نشط' ? 'good' : p.status === 'معلق' ? 'warning' : 'neutral')));
    }
    function incidentItem(i) {
      return h('a', { class: 'sp-link', href: router.href('incidents', { id: i.id }) },
        h('span', { class: 'sp-link-main' }, codeSpan(i.code), dataText(L(i, 'title', 'incidents') || i.title || '', 'sp-link-text')),
        h('span', { class: 'sp-link-meta' }, h('span', { class: 'sp-date' }, fmt.date(i.date, { style: 'short' })), C.badge(label('incidentType', i.type) || i.type, Number(i.severity) >= 4 ? 'serious' : 'neutral')));
    }
    function inspectionItem(n) {
      return h('a', { class: 'sp-link', href: router.href('inspections', { id: n.id }) },
        h('span', { class: 'sp-link-main' }, codeSpan(n.code), h('span', { class: 'sp-link-text' }, label('inspectionType', n.type) || n.type)),
        h('span', { class: 'sp-link-meta' }, h('span', { class: 'sp-date' }, fmt.date(n.date, { style: 'short' })), C.badge(label('inspectionStatus', n.status) || n.status, n.status === 'متأخر' ? 'critical' : n.status === 'منجز' ? 'good' : 'neutral')));
    }

    /** What the panel shows; when it changes the panel re-renders (or is marked dirty while focus is inside). */
    function panelSignature() {
      if (!zoneId) return `none|${zonesOf(siteById(siteId)).map((z) => Object.values(links(z.id).counts).join(',')).join(';')}`;
      const lk = links(zoneId);
      return `${zoneId}|${JSON.stringify(lk.counts)}|${arr(lk.risks).map((r) => `${r.id}${r.status}`).join()}|${arr(lk.permits).map((p) => `${p.id}${p.status}`).join()}|${arr(lk.incidents).map((i) => i.id).join()}|${arr(lk.inspections).map((n) => `${n.id}${n.status}`).join()}`;
    }
    /** Focus is inside the panel: patch the (non-focusable) counts in place; the lists follow on focusout. */
    function patchCounts() {
      if (!refs) return;
      const c = zoneId ? links(zoneId).counts : null;
      if (!c) return;
      refs.zoneBody.querySelectorAll('.sp-count[data-k]').forEach((el) => {
        const k = el.getAttribute('data-k');
        const num = el.querySelector('.sp-count-num');
        const v = fmt.num(c[k] || 0);
        if (num && num.textContent !== v) num.textContent = v;
      });
    }

    function renderZonePanel() {
      const site = siteById(siteId);
      const host = refs.zoneBody;
      sensorRefs.clear();
      refs.panelSig = panelSignature();
      refs.panelDirty = false;
      const range = globalFilters().range || 30;
      if (!zoneId || !zoneById(site, zoneId)) {
        refs.zoneTitle.textContent = t('spatial.zone.pickTitle');
        const totals = { risks: 0, sensors: 0, cameras: 0, permits: 0, incidents: 0, inspections: 0, overdueRisks: 0 };
        zonesOf(site).forEach((z) => { const c = links(z.id).counts; Object.keys(totals).forEach((k) => { totals[k] += c[k] || 0; }); });
        host.replaceChildren(
          h('p', { class: 'sp-zone-prompt' }, ico('map-pin', 18), h('span', {}, t('spatial.zone.pick'))),
          h('div', { class: 'sp-counts', role: 'list', 'aria-label': t('spatial.zone.siteTotals') },
            ...['risks', 'sensors', 'cameras', 'permits', 'incidents', 'inspections'].map((k) => { const el = countChip(k, totals[k]); el.setAttribute('role', 'listitem'); return el; })),
          h('p', { class: 't-helper sp-period' }, t('spatial.zone.period', { days: tn('spatial.n.days', range, { count: fmt.num(range) }) })));
        return;
      }
      const lk = links(zoneId);
      refs.zoneTitle.textContent = zoneName(site, zoneId);
      const counts = h('div', { class: 'sp-counts', role: 'list', 'aria-label': t('spatial.zone.countsAria') },
        ...[
          countChip('risks', lk.counts.risks, lk.counts.overdueRisks ? h('span', { class: 'sp-count-sub' }, t('spatial.zone.overdueN', { n: fmt.num(lk.counts.overdueRisks) })) : null),
          countChip('sensors', lk.counts.sensors),
          countChip('cameras', lk.counts.cameras),
          countChip('permits', lk.counts.permits),
          countChip('incidents', lk.counts.incidents),
          countChip('inspections', lk.counts.inspections),
        ].map((el) => { el.setAttribute('role', 'listitem'); return el; }));
      const riskRows = lk.risks.slice().sort((a, b) => (TONE_RANK[toneOfRisk(a)] ?? 9) - (TONE_RANK[toneOfRisk(b)] ?? 9) || String(a.code).localeCompare(String(b.code)));
      host.replaceChildren(
        h('div', { class: 'sp-zone-meta' }, codeSpan(zoneId), h('span', { class: 't-helper' }, siteName(site)),
          h('button', { type: 'button', class: 'btn btn-ghost btn-sm sp-clear', onClick: () => selectZone(null, { push: true, user: true, focusPanel: true }) }, t('spatial.zone.clear'))),
        counts,
        sectionList('risks', riskRows, riskItem),
        sectionList('sensors', lk.sensors, sensorItem),
        sectionList('cameras', lk.cameras, cameraItem),
        sectionList('permits', lk.permits, permitItem),
        sectionList('incidents', lk.incidents, incidentItem),
        sectionList('inspections', lk.inspections, inspectionItem),
        h('p', { class: 't-helper sp-period' }, t('spatial.zone.period', { days: tn('spatial.n.days', range, { count: fmt.num(range) }) })));
    }

    /* ───────────── cameras card ───────────── */
    function buildCameras(site) {
      const list = SP.camerasFor(siteId);
      return h('ul', { class: 'sp-cam-grid', role: 'list' }, list.map((cam) => h('li', { class: 'sp-cam-tile', 'data-camera': cam.id },
        h('div', { class: 'sp-cam-tile-head' },
          h('span', { class: 'sp-cam-ico' }, ico('cctv', 18)),
          codeSpan(cam.id),
          C.statusBadge('demo', { label: t('spatial.viewer.simulated'), size: 'sm', title: t('spatial.viewer.simulatedDesc') })),
        h('p', { class: 'sp-cam-purpose' }, L(cam, 'purpose', 'cameras')),
        h('button', { type: 'button', class: 'sp-cam-zone', onClick: () => selectZone(cam.zoneId, { push: true, focusPanel: true, user: true }) }, ico('map-pin', 14), h('span', {}, zoneName(site, cam.zoneId))),
        h('dl', { class: 'sp-cam-specs' },
          h('div', {}, h('dt', {}, t('spatial.specs.mount')), h('dd', { dir: 'ltr' }, metres(cam.mountHeight))),
          h('div', {}, h('dt', {}, t('spatial.specs.heading')), h('dd', {}, `${degrees(cam.heading)} ${compass(cam.heading)}`)),
          h('div', {}, h('dt', {}, t('spatial.specs.fov')), h('dd', { dir: 'ltr' }, degrees(cam.fov)))),
        C.button(t('spatial.cameras.open'), { variant: 'outline', size: 'sm', icon: 'play', onClick: (e) => openViewer(cam.id, { returnFocus: e.currentTarget }), attrs: { 'aria-label': t('spatial.cameras.openAria', { code: cam.id }) } }))));
    }

    /* ───────────── zones list (text alternative) ───────────── */
    // Number cells use .num-col (table-cell safe; the global .num is inline-block). Explicit table roles keep the
    // semantics when narrow containers stack each row into a labelled card (css: Spatial › zones table).
    const LIST_COLS = ['zone', 'risks', 'overdue', 'sensors', 'cameras', 'permits', 'incidents', 'inspections'];
    function buildList(site) {
      const table = h('table', { class: 'table is-dense sp-table', role: 'table' });
      table.appendChild(h('caption', { class: 'sr-only' }, t('spatial.list.caption', { site: siteName(site) })));
      table.appendChild(h('thead', { role: 'rowgroup' }, h('tr', { role: 'row' }, LIST_COLS.map((c, i) => h('th', { scope: 'col', role: 'columnheader', class: i ? 'num-col' : null }, t(`spatial.list.cols.${c}`))))));
      const tbody = h('tbody', { role: 'rowgroup' });
      table.appendChild(tbody);
      const wrap = h('div', { class: 'table-wrap sp-table-wrap' }, table);
      return { wrap, tbody };
    }
    let listSig = '';
    function paintList() {
      const site = siteById(siteId);
      const rows = zonesOf(site).map((z) => ({ z, c: links(z.id).counts }));
      const sig = `${zoneId}|${I.lang()}|${rows.map((r) => `${r.z.id}:${Object.values(r.c).join(',')}`).join(';')}`;
      if (sig === listSig) return;
      listSig = sig;
      const focused = document.activeElement && refs.listBody.contains(document.activeElement) ? document.activeElement.getAttribute('data-zone') : null;
      refs.listBody.replaceChildren(...rows.map(({ z, c }) => h('tr', { role: 'row', class: z.id === zoneId ? 'is-selected' : null, 'aria-current': z.id === zoneId ? 'true' : null },
        h('th', { scope: 'row', role: 'rowheader' }, h('button', { type: 'button', class: 'sp-row-btn', 'data-zone': z.id, 'aria-pressed': z.id === zoneId ? 'true' : 'false', onClick: () => selectZone(z.id, { push: true, focusPanel: true, user: true }) },
          codeSpan(z.id), h('span', {}, zoneName(site, z.id)))),
        ...[c.risks, c.overdueRisks, c.sensors, c.cameras, c.permits, c.incidents, c.inspections].map((n, i) => h('td', { role: 'cell', class: ['num-col', n ? null : 'is-zero'], 'data-label': t(`spatial.list.cols.${LIST_COLS[i + 1]}`) }, h('span', { class: 'sp-cell-num', dir: 'ltr' }, fmt.num(n)))))));
      if (focused) { const b = refs.listBody.querySelector(`[data-zone="${focused}"]`); if (b) b.focus({ preventScroll: true }); }
    }

    /* ───────────── plan badges + aria ───────────── */
    function paintPlan() {
      const site = siteById(siteId);
      zonesOf(site).forEach((z) => {
        const lk = links(z.id);
        const el = refs.plan.zoneEls.get(z.id);
        const b = refs.plan.badgeEls.get(z.id);
        const open = lk.counts.openRisks;
        const tone = SP.zoneTone(lk.openRisks, sel) || 'good';
        if (b) {
          setAttr(b.g, 'data-tone', tone);
          if (b.g.style.display !== (open ? '' : 'none')) b.g.style.display = open ? '' : 'none';
          const txt = fmt.num(open);
          if (b.num.textContent !== txt) b.num.textContent = txt;
        }
        const nameEl = refs.plan.nameEls.get(z.id);
        if (nameEl) nameEl.classList.toggle('is-selected', z.id === zoneId);
        if (el) {
          setAttr(el, 'aria-pressed', z.id === zoneId ? 'true' : 'false');
          el.classList.toggle('is-selected', z.id === zoneId);
          setAttr(el, 'data-tone', open ? tone : 'none');
          setAttr(el, 'aria-label', t('spatial.plan.zoneAria', {
            code: z.id, name: zoneName(site, z.id),
            risks: tn('spatial.n.openRisks', open, { count: fmt.num(open) }),
            sensors: tn('spatial.n.sensors', lk.counts.sensors, { count: fmt.num(lk.counts.sensors) }),
            cameras: tn('spatial.n.cameras', lk.counts.cameras, { count: fmt.num(lk.counts.cameras) }),
            permits: tn('spatial.n.permits', lk.counts.permits, { count: fmt.num(lk.counts.permits) }),
          }));
        }
      });
      refs.plan.camEls.forEach((el, id) => {
        el.classList.toggle('is-active', id === openCameraId);
        const cam = SP.cameraById(id);
        el.classList.toggle('in-zone', Boolean(cam && zoneId && cam.zoneId === zoneId));
      });
      refs.planFigure.classList.toggle('has-selection', Boolean(zoneId));
    }

    /* ───────────── build per site ───────────── */
    function buildSite({ animate = false } = {}) {
      closeViewer('site');
      stopView();
      if (planRO) { try { planRO.disconnect(); } catch { /* ignore */ } planRO = null; }
      const site = siteById(siteId);
      const plan = SP.planFor(siteId) || { footprints: [] };
      const planRefs = buildPlan(site, plan);
      const legend = h('ul', { class: 'sp-legend', role: 'list', 'aria-label': t('spatial.legend.aria') },
        ...[['zone', 'sp-lg-zone'], ['footprint', 'sp-lg-footprint'], ['crane', 'sp-lg-crane'], ['road', 'sp-lg-road'], ['sensor', 'sp-lg-sensor'], ['camera', 'sp-lg-camera'], ['risk', 'sp-lg-risk']]
          .map(([k, cls]) => h('li', { class: 'sp-legend-item' }, h('span', { class: ['sp-legend-key', cls], 'aria-hidden': 'true' }), h('span', {}, t(`spatial.legend.${k}`)))));
      const fitBtn = h('button', { type: 'button', class: 'btn btn-sm sp-fit', hidden: true, dir: I.dir(), onClick: () => fitSite() }, ico('maximize', 15), h('span', { class: 'btn-label' }, t('spatial.plan.fit')));
      // the drawing never mirrors: the button sits in its top end margin (by the north arrow) in both languages
      const planFigure = h('figure', { class: 'sp-plan' }, planRefs.svg, h('div', { class: 'sp-fit-dock', dir: 'ltr' }, fitBtn));
      const planCard = C.card({
        code: 'MAP-01', title: t('spatial.plan.title', { site: siteName(site) }), subtitle: t('spatial.plan.subtitle', { code: site.code, city: L(site, 'city', 'sites') || site.city }),
        body: h('div', { class: 'sp-plan-body' }, planFigure, legend, h('p', { class: 't-helper sp-plan-note' }, `${t('spatial.plan.note')} ${t('spatial.plan.camerasNote')}`)),
        className: 'sp-plan-card',
      });
      const zoneTitle = h('span', {});
      const zoneBody = h('div', { class: 'sp-zone-body' });
      const zoneCard = C.card({ code: 'ZONE', title: ' ', body: zoneBody, className: 'sp-zone-card' });
      const zt = zoneCard.querySelector('.card-title');
      if (zt) { zt.replaceChildren(zoneTitle); zt.setAttribute('tabindex', '-1'); }
      // live data that arrived while focus was inside the panel is applied once focus leaves it
      zoneBody.addEventListener('focusout', () => {
        if (!refs || !refs.panelDirty) return;
        setTimeout(() => { if (!destroyed && refs && refs.zoneBody === zoneBody && refs.panelDirty && !zoneBody.contains(document.activeElement)) renderZonePanel(); }, 0);
      });
      const camCard = C.card({ code: 'CAM-01', title: t('spatial.cameras.title'), subtitle: t('spatial.cameras.subtitle', { n: tn('spatial.n.cameras', SP.camerasFor(siteId).length, { count: fmt.num(SP.camerasFor(siteId).length) }) }), body: h('div', {}, h('p', { class: 'sp-honest-line' }, ico('flask', 16), h('span', {}, t('spatial.cameras.honest'))), buildCameras(site)), className: 'sp-cam-card' });
      const listParts = buildList(site);
      const listCard = C.card({ code: 'LIST', title: t('spatial.list.title'), subtitle: t('spatial.list.subtitle'), body: listParts.wrap, className: 'sp-list-card' });
      const grid = h('div', { class: 'sp-grid' }, planCard, zoneCard);
      bodyHost.replaceChildren(grid, camCard, listCard);
      refs = { plan: planRefs, planFigure, fitBtn, zoneBody, zoneTitle, zoneCard, listBody: listParts.tbody, panelSig: '', panelDirty: false, hitKey: '' };
      view = { ...FULL_VIEW };
      listSig = '';
      paintPlan();
      renderZonePanel();
      paintList();
      updateHits();
      // keyboard focus on a zone or camera outside the framed view: show the whole site so the focus ring is visible
      planRefs.svg.addEventListener('focusin', (e) => {
        if (isFull(view) || !refs || document.documentElement.getAttribute('data-input') === 'pointer') return;
        const t0 = e.target;
        const zEl = t0.closest && t0.closest('.sp-zone');
        const cEl = t0.closest && t0.closest('.sp-cam');
        const { inner } = SP.PLAN;
        let box = null;
        if (zEl) { const z = zoneById(siteById(siteId), zEl.getAttribute('data-zone')); if (z) box = { x0: inner.x + z.x * inner.w, y0: inner.y + z.y * inner.h, x1: inner.x + (z.x + z.w) * inner.w, y1: inner.y + (z.y + z.h) * inner.h }; }
        else if (cEl) { const c = SP.cameraById(cEl.getAttribute('data-camera')); if (c) { const p = SP.toPlan(c.x, c.y); box = { x0: p.x - 14, y0: p.y - 14, x1: p.x + 14, y1: p.y + 14 }; } }
        if (!box) return;
        const visW = Math.max(0, Math.min(box.x1, view.x + view.w) - Math.max(box.x0, view.x));
        const visH = Math.max(0, Math.min(box.y1, view.y + view.h) - Math.max(box.y0, view.y));
        const share = (visW * visH) / Math.max(1, (box.x1 - box.x0) * (box.y1 - box.y0));
        if (share < 0.6) moveView({ ...FULL_VIEW }, { animate: true });
      });
      if (typeof ResizeObserver === 'function') {
        let roRaf = 0;
        planRO = new ResizeObserver(() => { if (roRaf) return; roRaf = requestAnimationFrame(() => { roRaf = 0; if (!destroyed) updateHits(); }); });
        planRO.observe(planFigure);
      }
      // labels are measured with the page fonts: lay them out again once the fonts have loaded
      try {
        if (document.fonts && document.fonts.status !== 'loaded') {
          const planAtBuild = planRefs;
          document.fonts.ready.then(() => { if (!destroyed && refs && refs.plan === planAtBuild) { planAtBuild.layoutLabels(); paintPlan(); } });
        }
      } catch { /* ignore */ }
      if (animate && motion && typeof motion.enter === 'function') motion.enter([planCard, zoneCard, camCard, listCard], { y: 10 });
    }

    /* ───────────── camera hit areas (touch: at least 24 × 24 CSS px, split between close neighbours) ───────────── */
    function updateHits() {
      if (!refs || !refs.plan) return;
      const fig = refs.planFigure;
      const widthPx = fig.clientWidth || fig.getBoundingClientRect().width || 0;
      if (!widthPx) return;
      const scale = widthPx / view.w;                     // CSS px per plan unit
      let coarse = false;
      try { coarse = matchMedia('(pointer: coarse)').matches; } catch { /* ignore */ }
      const touch = coarse || widthPx < 640;
      // radius in CSS px: 13 → a 26 px target on touch / small plans; 11 → 22 px otherwise (never under 22 units)
      const r = Math.max(22, (touch ? 13 : 11) / scale);
      const key = `${Math.round(r)}`;
      if (key === refs.hitKey) return;
      refs.hitKey = key;
      const cams = Array.from(refs.plan.hitEls.entries()).map(([id, v]) => ({ id, x: v.x, y: v.y }));
      const polys = SP.hitPolygons(cams, r);
      refs.plan.hitEls.forEach((v, id) => setAttr(v.el, 'd', polyPath(polys.get(id))));
      fig.classList.toggle('is-touch', touch);
    }

    /* ───────────── framing: the plan frames the selected zone (one tween per user action) ───────────── */
    function framingLevel() {
      if (!motion || typeof motion.enabled !== 'function' || !motion.enabled()) return 0;
      const bg = document.documentElement.getAttribute('data-bg');
      return bg === 'cinematic' ? 2 : 1;
    }
    function frameFor(zid) {
      const site = siteById(siteId);
      const z = zoneById(site, zid);
      if (!z) return { ...FULL_VIEW };
      const { inner } = SP.PLAN;
      const zx = inner.x + z.x * inner.w; const zy = inner.y + z.y * inner.h;
      const zw = z.w * inner.w; const zh = z.h * inner.h;
      const ar = FULL_VIEW.w / FULL_VIEW.h;
      let w = Math.max(zw + Math.max(80, zw * 0.5), (zh + Math.max(70, zh * 0.5)) * ar, FRAME_MIN_W);
      if (w >= FULL_VIEW.w * 0.9) return { ...FULL_VIEW };
      const hh = w / ar;
      const x = Math.min(Math.max(0, zx + zw / 2 - w / 2), FULL_VIEW.w - w);
      const y = Math.min(Math.max(0, zy + zh / 2 - hh / 2), FULL_VIEW.h - hh);
      return { x, y, w, h: hh };
    }
    const isFull = (v) => Math.abs(v.w - FULL_VIEW.w) < 0.5 && Math.abs(v.x) < 0.5 && Math.abs(v.y) < 0.5;
    function writeView(v) {
      if (!refs) return;
      setAttr(refs.plan.svg, 'viewBox', `${r1(v.x)} ${r1(v.y)} ${r1(v.w)} ${r1(v.h)}`);
    }
    function stopView() { if (viewRaf) { cancelAnimationFrame(viewRaf); viewRaf = 0; } }
    function afterView() {
      if (!refs) return;
      const framed = !isFull(view);
      refs.planFigure.classList.toggle('is-framed', framed);
      refs.fitBtn.hidden = !framed;
      updateHits();
    }
    /** Moves the plan to `target`; animated only for a user action with motion on (≈ 0.5 s, then idle). */
    function moveView(target, { animate = false } = {}) {
      if (!refs) return;
      stopView();
      const lvl = framingLevel();
      const from = { ...view };
      const same = Math.abs(from.x - target.x) + Math.abs(from.y - target.y) + Math.abs(from.w - target.w) < 0.5;
      if (same) { afterView(); return; }
      if (!animate || !lvl) { view = { ...target }; writeView(view); afterView(); return; }
      const dur = lvl === 2 ? 640 : 480;
      const t0 = performance.now();
      const ease = (k) => (k < 0.5 ? 4 * k * k * k : 1 - ((-2 * k + 2) ** 3) / 2);   // ease-in-out (cubic)
      refs.planFigure.classList.add('is-moving');
      const step = (now) => {
        if (destroyed || !refs) { viewRaf = 0; return; }
        const k = Math.min(1, (now - t0) / dur);
        const e = ease(k);
        view = { x: from.x + (target.x - from.x) * e, y: from.y + (target.y - from.y) * e, w: from.w + (target.w - from.w) * e, h: from.h + (target.h - from.h) * e };
        writeView(view);
        if (k < 1) viewRaf = requestAnimationFrame(step);
        else { viewRaf = 0; view = { ...target }; writeView(view); refs.planFigure.classList.remove('is-moving'); afterView(); }
      };
      viewRaf = requestAnimationFrame(step);
    }
    /** Frames the selected zone when motion is on; under reduced motion the whole site stays in view. */
    function frameSelection({ animate = false } = {}) {
      const target = zoneId && framingLevel() ? frameFor(zoneId) : { ...FULL_VIEW };
      moveView(target, { animate });
    }
    function fitSite() {
      moveView({ ...FULL_VIEW }, { animate: true });
      const el = zoneId && refs ? refs.plan.zoneEls.get(zoneId) : null;
      if (el) try { el.focus({ preventScroll: true }); } catch { /* ignore */ }
    }

    /* ───────────── screen-reader summary (written only on user action) ───────────── */
    let liveTimer = 0;
    function announce(text) {
      clearTimeout(liveTimer);
      srLive.textContent = '';
      liveTimer = setTimeout(() => { if (!destroyed) srLive.textContent = text; }, 80);
    }
    function zoneSummary(zid) {
      const site = siteById(siteId);
      if (!zid) return t('spatial.announce.cleared', { site: siteName(site) });
      const lk = links(zid);
      return t('spatial.announce.zone', {
        code: zid, name: zoneName(site, zid),
        risks: tn('spatial.n.openRisks', lk.counts.openRisks, { count: fmt.num(lk.counts.openRisks) }),
        sensors: tn('spatial.n.sensors', lk.counts.sensors, { count: fmt.num(lk.counts.sensors) }),
        cameras: tn('spatial.n.cameras', lk.counts.cameras, { count: fmt.num(lk.counts.cameras) }),
        permits: tn('spatial.n.permits', lk.counts.permits, { count: fmt.num(lk.counts.permits) }),
      });
    }

    /* ───────────── selection actions ───────────── */
    function setSite(id, { push = false } = {}) {
      const next = validSite(id);
      if (!next || next === siteId) { siteSelect.value = siteId; return; }
      siteId = next;
      zoneId = null;
      highlightRisk = null;
      siteSelect.value = siteId;
      buildSite();
      writeUrl(push ? 'push' : 'replace');
      if (push) {
        const site = siteById(siteId);
        announce(t('spatial.announce.site', { site: siteName(site), zones: tn('spatial.n.zones', zonesOf(site).length, { count: fmt.num(zonesOf(site).length) }), cameras: tn('spatial.n.cameras', SP.camerasFor(siteId).length, { count: fmt.num(SP.camerasFor(siteId).length) }) }));
      }
    }
    /** `user`: a person chose this (click, key, table, camera tile) — frame the zone and say a short summary. */
    function selectZone(id, { push = false, focusPanel = false, user = false } = {}) {
      const site = siteById(siteId);
      const next = id && zoneById(site, id) ? id : null;
      if (next !== zoneId) {
        zoneId = next;
        if (highlightRisk) { const r = findHseRisk(highlightRisk); if (!r || r.zoneId !== zoneId) highlightRisk = null; }
        paintPlan();
        renderZonePanel();
        paintList();
        writeUrl(push ? 'push' : 'replace');
      }
      if (user) {
        frameSelection({ animate: true });
        announce(zoneSummary(zoneId));
      }
      if (focusPanel && refs && refs.zoneCard) {
        const title = refs.zoneCard.querySelector('.card-title');
        try { refs.zoneCard.scrollIntoView({ block: 'nearest', behavior: motion && motion.enabled && motion.enabled() ? 'smooth' : 'auto' }); } catch { /* ignore */ }
        if (title) try { title.focus({ preventScroll: true }); } catch { /* ignore */ }
      }
    }

    /* ───────────── camera viewer ───────────── */
    function eventsFor(cam) {
      const site = siteById(cam.siteId);
      // The Arabic sentence always carries the zone name; in English the mirror name is matched as well.
      const zi = zonesOf(site).findIndex((z) => z.id === cam.zoneId);
      const en = isEn() ? ((zonesL(site)[zi] && zonesL(site)[zi].name) || '') : '';
      return SP.ppeEventsFor(state(), cam, { zoneNameEn: en, sinceMs: Date.now() - PPE_WINDOW_MS, limit: 3 });
    }
    function ppeListNode(events) {
      if (!events.length) return h('p', { class: 'sp-empty t-helper' }, t('spatial.viewer.ppeNone', { hours: fmt.num(PPE_WINDOW_MS / 3_600_000) }));
      return h('ul', { class: 'sp-list', role: 'list' }, events.map((ev) => h('li', { class: 'sp-item' },
        h('div', { class: 'sp-ppe' },
          C.glyph(ev.tone === 'warning' ? 'warning' : 'serious', 14),
          h('div', { class: 'stack gap-1' },
            dataText(isEn() ? (ev.titleEn || ev.title) : ev.title, 'sp-ppe-title'),
            h('span', { class: 't-helper' }, `${t(`spatial.ppe.${ev.item}`)} · ${fmt.relative(ev.ts)}`)),
          C.statusBadge('demo', { label: t('spatial.viewer.simulatedEvent'), size: 'sm', title: false })))));
    }

    function openViewer(id, { returnFocus = null } = {}) {
      const cam = SP.cameraById(id);
      if (!cam || cam.siteId !== siteId || destroyed) return;
      if (viewer) closeViewer('swap');
      const site = siteById(siteId);
      const zoneChanged = cam.zoneId !== zoneId;
      if (zoneChanged) { zoneId = cam.zoneId; paintPlan(); renderZonePanel(); paintList(); frameSelection({ animate: false }); }
      openCameraId = cam.id;
      writeUrl(zoneChanged ? 'push' : 'replace');
      paintPlan();
      const plan = SP.planFor(siteId) || {};
      const fp = arr(plan.footprints).find((f) => f.zoneId === cam.zoneId) || arr(plan.footprints)[0] || null;
      const hour = riyadhHour(Date.now());
      const phase = lightPhase(hour);
      const captionId = `${uid}-cap-${cam.id}`;
      let showZoneAfterClose = false;
      const feedHost = h('div', { class: 'sp-feed' });
      const feedShell = h('div', { class: 'sp-feed-shell' }, feedHost);
      const captionText = h('span', {});
      const rateText = h('span', {});
      const stillBadge = h('span', { class: 'sp-still', hidden: true }, C.badge(t('spatial.viewer.still'), 'neutral', { icon: 'pause' }));
      // not a live region: the PPE list changes with the simulated feed, which must not interrupt a reader
      const ppeHost = h('div', { class: 'sp-ppe-host' });
      let events = eventsFor(cam);
      ppeHost.replaceChildren(ppeListNode(events));
      const zName = zoneName(site, cam.zoneId);
      const body = h('div', { class: 'sp-viewer' },
        h('div', { class: 'sp-viewer-status' },
          C.statusBadge('demo', { label: t('spatial.viewer.simulated'), title: t('spatial.viewer.simulatedDesc'), size: 'sm' }),
          C.statusBadge('not_connected', { label: t('spatial.viewer.notConnected'), title: t('spatial.viewer.notConnectedDesc'), size: 'sm' }),
          stillBadge),
        h('p', { class: 'sp-viewer-honest' }, ico('info', 16), h('span', {}, h('strong', {}, t('spatial.viewer.honest')), ' ', t('spatial.viewer.honestMore'))),
        h('figure', { class: 'sp-feed-figure', 'aria-labelledby': captionId },
          feedShell,
          h('figcaption', { class: 'sp-feed-caption t-helper', id: captionId }, captionText)),
        h('div', { class: 'sp-viewer-grid' },
          h('section', { class: 'sp-viewer-sec', 'aria-labelledby': `${captionId}-d` },
            h('h3', { class: 'sp-sec-title', id: `${captionId}-d` }, ico('cctv', 15), h('span', {}, t('spatial.viewer.details'))),
            C.kv([
              [t('spatial.specs.code'), codeSpan(cam.id)],
              [t('spatial.specs.zone'), h('span', {}, codeSpan(cam.zoneId), ' ', zName)],
              [t('spatial.specs.mount'), h('span', { dir: 'ltr' }, metres(cam.mountHeight))],
              [t('spatial.specs.heading'), `${degrees(cam.heading)} ${compass(cam.heading)}`],
              [t('spatial.specs.fov'), h('span', { dir: 'ltr' }, degrees(cam.fov))],
              [t('spatial.specs.lens'), h('span', { dir: 'ltr' }, t('spatial.units.mm', { n: fmt.num(cam.lensMm, { maximumFractionDigits: 1 }) }))],
              [t('spatial.specs.rate'), rateText],
              [t('spatial.specs.status'), C.statusBadge('not_connected', { label: t('spatial.viewer.notConnected'), size: 'sm', title: false })],
            ])),
          h('section', { class: 'sp-viewer-sec', 'aria-labelledby': `${captionId}-p` },
            h('h3', { class: 'sp-sec-title', id: `${captionId}-p` }, ico('helmet', 15), h('span', {}, t('spatial.viewer.ppeTitle'))),
            ppeHost,
            h('p', { class: 't-helper sp-ppe-note' }, t('spatial.viewer.ppeNote', { hours: fmt.num(PPE_WINDOW_MS / 3_600_000) })))));
      const api = C.modal({
        title: L(cam, 'purpose', 'cameras'),
        subtitle: `${cam.id} · ${zName} · ${siteName(site)}`,
        body,
        size: 'lg',
        returnFocus,
        actions: [
          { label: t('spatial.viewer.showZone'), variant: 'outline', icon: 'map-pin', onClick: () => { showZoneAfterClose = true; } },
          { label: t('spatial.viewer.close'), variant: 'primary' },
        ],
        onClose: (reason) => {
          if (viewer && viewer.api === api) teardownViewer();
          if (!destroyed && reason !== 'swap' && reason !== 'site' && reason !== 'route') {
            openCameraId = null; writeUrl('replace'); paintPlan();
            // runs after the dialog handed focus back, so the panel keeps it
            if (showZoneAfterClose) selectZone(cam.zoneId, { focusPanel: true, user: true });
          }
        },
      });
      api.el.classList.add('sp-viewer-dialog');
      api.open();
      const feed = createCamFeed(feedHost, {
        camera: cam,
        preset: cam.scene,
        kind: (plan && plan.kind) || 'urban',
        levels: fp ? fp.levels : null,
        rtlZone: !isEn(),
        rtlLabels: !isEn(),
        labels: {
          simulated: t('spatial.osd.simulated'),
          illustrative: t('spatial.osd.illustrative'),
          ppe: { helmet: t('spatial.osd.helmet'), vest: t('spatial.osd.vest'), harness: t('spatial.osd.harness'), glasses: t('spatial.osd.glasses') },
          ir: 'IR',
          zone: zName,
          timeZone: 'AST',
        },
        fps: 15,
        onMode: () => { if (viewer && viewer.feed === feed && viewer.caption) viewer.caption(); },
      });
      feed.setEvents(events);
      viewer = { api, feed, cam, ppeHost, events, stillBadge };
      const caption = () => {
        const st = feed.stats();
        const still = st.mode === 'still';
        const text = t(still ? 'spatial.viewer.captionStill' : 'spatial.viewer.caption', {
          zone: zName, time: fmt.time(new Date()), phase: t(`spatial.phase.${phase}`), n: fmt.num(viewer ? viewer.events.length : events.length),
        });
        if (captionText.textContent !== text) captionText.textContent = text;
        const rate = still ? t('spatial.specs.rateStill') : t(st.backend === 'main' ? 'spatial.specs.rateFallback' : 'spatial.specs.rateValue', { fps: tn('spatial.n.fps', st.fps, { count: fmt.num(st.fps) }) });
        if (rateText.textContent !== rate) rateText.textContent = rate;
        stillBadge.hidden = !still;
      };
      viewer.caption = caption;
      feed.start();
      caption();
      irisReveal(feedHost, feed);
      announce(t('spatial.announce.camera', { code: cam.id, zone: zName }));
    }

    /** Lens-iris reveal of the picture (one shot, ≈ 0.5 s): an eight-blade aperture opens while turning. Off under
     *  reduced motion and with the Static background; the Cinematic background adds a short focus pull. */
    function irisReveal(el, feed) {
      const lvl = framingLevel();
      if (!lvl || document.documentElement.getAttribute('data-bg') === 'static' || typeof el.animate !== 'function') return;
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height) return;
      const cx = r.width / 2; const cy = r.height / 2;
      const R = Math.hypot(cx, cy) * 1.1;
      const N = 8; const STEPS = 8;
      const poly = (rad, rot) => `polygon(${Array.from({ length: N }, (_, k) => { const a = rot + (k * 2 * Math.PI) / N; return `${(cx + rad * Math.cos(a)).toFixed(1)}px ${(cy + rad * Math.sin(a)).toFixed(1)}px`; }).join(', ')})`;
      const frames = Array.from({ length: STEPS + 1 }, (_, i) => { const k = i / STEPS; return { clipPath: poly(Math.max(1, R * k), (Math.PI / 3) * k) }; });
      // closed aperture until the first frame is drawn (worker start-up), then it opens; never waits > 0.9 s
      el.style.clipPath = frames[0].clipPath;
      el.classList.add('is-iris');
      let opened = false;
      const open = () => {
        if (opened) return;
        opened = true;
        if (destroyed || !el.isConnected) { el.style.clipPath = ''; el.classList.remove('is-iris'); return; }
        try {
          const anim = el.animate(frames, { duration: lvl === 2 ? 680 : 520, easing: 'cubic-bezier(.16,1,.3,1)' });
          el.style.clipPath = '';
          const done = () => el.classList.remove('is-iris');
          anim.finished.then(done, done);
          if (lvl === 2) {
            const frameEl = el.querySelector('.cf-frame');
            if (frameEl) frameEl.animate([{ filter: 'blur(5px) brightness(1.18)' }, { filter: 'blur(0) brightness(1)' }], { duration: 900, easing: 'cubic-bezier(.16,1,.3,1)' });
          }
        } catch { el.style.clipPath = ''; el.classList.remove('is-iris'); }
      };
      const wait = setTimeout(open, 900);
      timers.push(wait);
      Promise.resolve(feed && feed.ready).then(() => { clearTimeout(wait); requestAnimationFrame(open); });
    }
    function teardownViewer() {
      if (!viewer) return;
      try { viewer.feed.destroy(); } catch { /* ignore */ }
      viewer = null;
    }
    function closeViewer(reason) {
      if (!viewer) return;
      const { api } = viewer;
      teardownViewer();
      try { api.close(reason); } catch { /* ignore */ }
      if (reason === 'site' || reason === 'route') openCameraId = null;
    }

    /* ───────────── live updates (patched in place, throttled) ───────────── */
    function scheduleRefresh() {
      if (refreshRaf || destroyed) return;
      refreshRaf = requestAnimationFrame(() => {
        refreshRaf = 0;
        if (destroyed || !refs) return;
        linkMemo = new Map();
        try {
          paintPlan();
          paintList();
          // The panel signature is recorded only when the panel really re-renders (renderZonePanel). While focus
          // is inside the panel it is marked dirty instead: counts are patched in place now, the lists and links
          // follow on focusout, so the reader keeps their place and nothing stays stale.
          if (panelSignature() !== refs.panelSig) {
            if (refs.zoneBody.contains(document.activeElement)) { refs.panelDirty = true; patchCounts(); }
            else renderZonePanel();
          }
        } finally { linkMemo = null; }
      });
    }
    /** Sensor values tick every second in the simulation; only a change of which sensors sit where matters here. */
    let sensorPlaceSig = '';
    const sensorPlaces = () => arr(state().sensors).filter((x) => x && x.siteId === siteId).map((x) => `${x.id}:${x.zoneId}`).join();
    subs.push(bus.on('store:change', (p) => {
      const path = String((p && p.path) || '*');
      if (path === 'feed') { if (viewer) refreshEvents(); return; }
      if (/^sensors/.test(path)) { const sig = sensorPlaces(); if (sig === sensorPlaceSig) return; sensorPlaceSig = sig; }
      if (/^(risks|permits|incidents|inspections|sensors|sites|filters|\*)/.test(path)) scheduleRefresh();
    }));
    function refreshEvents() {
      if (!viewer) return;
      const next = eventsFor(viewer.cam);
      const sig = next.map((e) => e.id).join();
      if (sig === viewer.events.map((e) => e.id).join()) return;
      viewer.events = next;
      viewer.feed.setEvents(next);
      viewer.ppeHost.replaceChildren(ppeListNode(next));
      if (viewer.caption) viewer.caption();
    }
    subs.push(bus.on('filters:change', () => {
      if (destroyed) return;
      const f = globalFilters();
      if (f.siteId && f.siteId !== 'all' && validSite(f.siteId) && f.siteId !== siteId) { setSite(f.siteId, { push: false }); return; }
      listSig = '';
      if (refs) refs.panelSig = '';
      scheduleRefresh();
    }));
    subs.push(bus.on('settings:change', () => { if (viewer && viewer.caption) viewer.caption(); }));
    // sensor readings move every second in the simulation: refresh the few visible values every 5 s
    timers.push(setInterval(() => { if (!document.hidden && !destroyed) sensorRefs.forEach((_, id) => paintSensor(id)); }, 5000));

    /* ───────────── boot ───────────── */
    buildSite({ animate: !sameRouteRemount });
    sensorPlaceSig = sensorPlaces();
    // a deep link or back / forward with a zone: the plan starts framed on it (no tween: not a user action)
    if (zoneId) frameSelection({ animate: false });
    if (motion && typeof motion.enter === 'function' && !sameRouteRemount) motion.enter(head, { y: 6 });
    // keep the URL canonical (site always present) without adding an entry
    writeUrl('replace');
    if (pendingCamera) {
      const camId = pendingCamera;
      pendingCamera = null;
      requestAnimationFrame(() => { if (!destroyed) openViewer(camId, { returnFocus: refs && refs.plan.camEls.get(camId) }); });
    } else if (sameRouteRemount && zoneId && refs) {
      // back / forward inside the view: keep the reader on the selected zone instead of the heading
      requestAnimationFrame(() => { const el = refs && refs.plan.zoneEls.get(zoneId); if (el && !destroyed) try { el.focus({ preventScroll: true }); } catch { /* ignore */ } });
    }

    /* ───────────── cleanup ───────────── */
    return function cleanup() {
      destroyed = true;
      lastCleanupAt = Date.now();
      closeViewer('route');
      subs.splice(0).forEach((off) => { try { off(); } catch { /* ignore */ } });
      timers.splice(0).forEach((x) => { clearInterval(x); clearTimeout(x); });
      if (refreshRaf) { cancelAnimationFrame(refreshRaf); refreshRaf = 0; }
      stopView();
      clearTimeout(liveTimer);
      if (planRO) { try { planRO.disconnect(); } catch { /* ignore */ } planRO = null; }
      sensorRefs.clear();
      refs = null;
    };
  },
};
