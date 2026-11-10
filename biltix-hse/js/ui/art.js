/**
 * BILTIX Risk AI — architectural SVG art & icon set (js/ui/art.js)
 *
 * Owner: A-UI (v3). Contract: docs/ARCHITECTURE.md §1/§2, docs/specs/v3-precision/CONTRACT.md §3/§3.1.
 *
 * Exports (also bundled on `art`):
 *   icon(name, size = 18, opts)   → <svg> 24×24 line glyph, stroke currentColor 1.75, round joins.
 *                                    Unknown names fall back to a neutral circle glyph. Never throws.
 *                                    opts: { label, class, mirror } — see "Direction" below.
 *   logoMark(size = 36)           → BILTIX mark: gold hexagon frame, isometric block (brand), accent shield notch.
 *                                    Drawn on a 32-unit grid without hairlines so it stays crisp at 24–40 px.
 *   logoLockup()                  → mark + localized product name ("بلتكس Risk AI" / "BILTIX Risk AI") + mono tag.
 *   emblem(size = 56)             → line-only BILTIX emblem (currentColor) for the background identity detail.
 *   backdrop()                    → CONTRACT §3.1 structure: <div class="bg-layers" aria-hidden="true"> with
 *                                    .bg-ambient, .bg-grid and .bg-mark (emblem + mono datum caption). All visuals
 *                                    come from CSS per html[data-bg] mode; the layers pause (class .is-paused)
 *                                    while the document is hidden.
 *   isoCube(size, tone)           → isometric cube with three shaded faces; tone → CSS variable.
 *   mashrabiyaTile(size)          → one eight-point-star lattice tile.
 *   sectorGlyph(categoryId)       → icon name for a hazard category id (seed.CATEGORIES icons).
 *
 * Rules honoured here:
 *   - Plain ES module, side-effect free on import (no DOM access until a function is called). The only
 *     import is the UI i18n bridge (logo label / product name).
 *   - Every node is built with createElementNS + setAttribute; innerHTML is never used.
 *   - No hard-coded colours: everything is `currentColor` or a `var(--token)` from css/tokens.css.
 *   - Direction: glyphs with a reading direction (chevron-/arrow-start|end, export/import, external link,
 *     list bullets, speaker, wind, feed, near-miss arrow, folder tab) are drawn for RTL and mirrored
 *     automatically when the document is LTR. Physical names (chevron-right, arrow-left…) and time-based
 *     glyphs (trend-up/down: time flows left→right in both languages) never mirror. opts.mirror forces it.
 *   - Vendor connectors use generic symbols (hash, bubble, servers, grid…), never a trademarked logo.
 */
import { t, isRtl } from './i18n-bridge.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const XLINK_NS = 'http://www.w3.org/1999/xlink';

let uidCounter = 0;
const uid = (prefix) => `${prefix}-${(++uidCounter).toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
const r2 = (n) => Math.round(n * 100) / 100;

/* ------------------------------------------------------------------ */
/* Element helpers                                                     */
/* ------------------------------------------------------------------ */

function el(tag, attrs = {}, ...children) {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === undefined || value === null || value === false) continue;
    if (key === 'style' && typeof value === 'object') {
      for (const [prop, val] of Object.entries(value)) {
        if (val === undefined || val === null) continue;
        if (prop.startsWith('--')) node.style.setProperty(prop, String(val));
        else node.style[prop] = String(val);
      }
      continue;
    }
    if (key === 'href') { node.setAttributeNS(XLINK_NS, 'xlink:href', String(value)); node.setAttribute('href', String(value)); continue; }
    node.setAttribute(key, String(value));
  }
  for (const child of children) if (child) node.appendChild(child);
  return node;
}

const pts = (arr) => arr.map(([x, y]) => `${r2(x)},${r2(y)}`).join(' ');

function sizeOf(size, fallback) {
  const n = Number(size);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/* ------------------------------------------------------------------ */
/* Geometry                                                            */
/* ------------------------------------------------------------------ */

const ISO_UX = Math.cos(Math.PI / 6); // 0.866
const ISO_UY = 0.5;

/**
 * Isometric box. `tx,ty` is the top-back vertex of the top face; `a` runs along the right axis,
 * `b` along the left axis, `c` is the vertical depth. Returns the three visible faces as point arrays.
 */
function isoFaces(tx, ty, a, b, c) {
  const T = [tx, ty];
  const A = [tx + a * ISO_UX, ty + a * ISO_UY];
  const F = [tx + a * ISO_UX - b * ISO_UX, ty + a * ISO_UY + b * ISO_UY];
  const B = [tx - b * ISO_UX, ty + b * ISO_UY];
  const down = (p) => [p[0], p[1] + c];
  return { top: [T, A, F, B], right: [A, F, down(F), down(A)], left: [B, F, down(F), down(B)] };
}

function hexagonPath(cx, cy, r) {
  const out = [];
  for (let i = 0; i < 6; i++) {
    const ang = -Math.PI / 2 + (i * Math.PI) / 3;
    out.push(`${r2(cx + r * Math.cos(ang))} ${r2(cy + r * Math.sin(ang))}`);
  }
  return `M${out.join('L')}z`;
}

function starPath(cx, cy, outer, inner, points) {
  let d = '';
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const ang = -Math.PI / 2 + (i * Math.PI) / points;
    d += `${i === 0 ? 'M' : 'L'}${r2(cx + r * Math.cos(ang))} ${r2(cy + r * Math.sin(ang))}`;
  }
  return `${d}z`;
}

/**
 * Appends a shaded isometric block to `parent`. Faces are filled with `fill` and then lit with
 * overlay layers: the top face gets a `light` overlay, the right face a faint one, the left face a
 * `shade` overlay — all via opacity so the base colour stays a single CSS variable.
 */
function appendIsoBlock(parent, tx, ty, a, b, c, { fill, light, shade, lightTop = 0.42, lightRight = 0.14, shadeLeft = 0.32, stroke = null, strokeWidth = 0.5 } = {}) {
  const f = isoFaces(tx, ty, a, b, c);
  const g = el('g', { class: 'iso-block' });
  const face = (points, extra = {}) => el('polygon', { points: pts(points), fill, 'stroke-linejoin': 'round', ...extra });
  g.appendChild(face(f.left));
  g.appendChild(face(f.right));
  g.appendChild(face(f.top));
  if (shade) g.appendChild(el('polygon', { points: pts(f.left), fill: shade, opacity: shadeLeft }));
  if (light) {
    g.appendChild(el('polygon', { points: pts(f.right), fill: light, opacity: lightRight }));
    g.appendChild(el('polygon', { points: pts(f.top), fill: light, opacity: lightTop }));
  }
  if (stroke) {
    g.appendChild(el('polygon', { points: pts(f.left), fill: 'none', stroke, 'stroke-width': strokeWidth, 'stroke-linejoin': 'round' }));
    g.appendChild(el('polygon', { points: pts(f.right), fill: 'none', stroke, 'stroke-width': strokeWidth, 'stroke-linejoin': 'round' }));
    g.appendChild(el('polygon', { points: pts(f.top), fill: 'none', stroke, 'stroke-width': strokeWidth, 'stroke-linejoin': 'round' }));
  }
  parent.appendChild(g);
  return g;
}

/** Eight-point star (two squares, one rotated 45°) as two path strings. */
function eightStarPaths(cx, cy, r) {
  const h = r2(r / Math.SQRT2);
  const square = `M${r2(cx - h)} ${r2(cy - h)}h${r2(2 * h)}v${r2(2 * h)}h${r2(-2 * h)}z`;
  const diamond = `M${r2(cx)} ${r2(cy - r)}L${r2(cx + r)} ${r2(cy)}L${r2(cx)} ${r2(cy + r)}L${r2(cx - r)} ${r2(cy)}z`;
  return [square, diamond];
}

/**
 * Appends the line-work of one 48×48 mashrabiya tile (star + cross lattice) to `parent`.
 * Tiles join seamlessly: the corner fragments complete the neighbouring stars.
 */
function appendLatticeTile(parent, size = 48) {
  const s = size / 48;
  const g = el('g', { fill: 'none', stroke: 'currentColor', 'stroke-width': r2(1 * s), 'stroke-linejoin': 'round', 'stroke-linecap': 'round', transform: s === 1 ? null : `scale(${r2(s)})` });
  const R = 13.4; const H = 9.5;
  eightStarPaths(24, 24, R).forEach((d) => g.appendChild(el('path', { d })));
  // connectors from the star tips to the tile edges
  g.appendChild(el('path', { d: `M24 0v${r2(24 - R)}M24 ${r2(24 + R)}V48M0 24h${r2(24 - R)}M${r2(24 + R)} 24H48` }));
  // corner fragments: quarter diamonds + quarter squares of the four neighbouring stars
  g.appendChild(el('path', { d: `M${R} 0L0 ${R}M${r2(48 - R)} 0L48 ${R}M0 ${r2(48 - R)}L${R} 48M48 ${r2(48 - R)}L${r2(48 - R)} 48` }));
  g.appendChild(el('path', { d: `M${H} 0v${H}H0M${r2(48 - H)} 0v${H}H48M0 ${r2(48 - H)}h${H}V48M48 ${r2(48 - H)}h${r2(-H)}V48` }));
  parent.appendChild(g);
  return g;
}

/* ------------------------------------------------------------------ */
/* Icon set — 24×24, stroke 1.75, round caps/joins                     */
/* ------------------------------------------------------------------ */

// Mini DSL: a string is a stroked <path d>; the helpers below produce other primitives.
const P = (d, o = {}) => ({ t: 'path', d, o });
const C = (cx, cy, r, o = {}) => ({ t: 'circle', cx, cy, r, o });
const D = (cx, cy, r) => ({ t: 'circle', cx, cy, r, o: { fill: 'currentColor', stroke: 'none' } });
const R = (x, y, w, h, rx = 1.5, o = {}) => ({ t: 'rect', x, y, w, h, rx, o });
const F = (d, opacity = 0.35) => P(d, { fill: 'currentColor', stroke: 'none', opacity });

// Shared fragments
const DOC = 'M14 3H7a1.5 1.5 0 0 0-1.5 1.5v15A1.5 1.5 0 0 0 7 21h10a1.5 1.5 0 0 0 1.5-1.5V8L14 3z';
const DOC_FOLD = 'M14 3v5h4.5';
const SHIELD = 'M12 3l7 3v5.4c0 4.5-3 8.3-7 9.6-4-1.3-7-5.1-7-9.6V6l7-3z';
const OCTAGON = 'M8.2 3h7.6L21 8.2v7.6L15.8 21H8.2L3 15.8V8.2L8.2 3z';
const TRAY = 'M4 17v2a1.5 1.5 0 0 0 1.5 1.5h13A1.5 1.5 0 0 0 20 19v-2';
const HEX24 = hexagonPath(12, 12, 9.5);
const CYLINDER_TOP = 'M4 6c0-1.7 3.6-3 8-3s8 1.3 8 3-3.6 3-8 3-8-1.3-8-3z';
const CLOUD = 'M7 19h10.5a4 4 0 0 0 .6-7.95A6.5 6.5 0 0 0 5.7 12.6 3.3 3.3 0 0 0 7 19z';
const TICKET = 'M4.5 6h15A1.5 1.5 0 0 1 21 7.5v2.3a2.4 2.4 0 0 0 0 4.4v2.3a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 16.5v-2.3a2.4 2.4 0 0 0 0-4.4V7.5A1.5 1.5 0 0 1 4.5 6z';
const BUBBLE = 'M4 5.5h12a1.5 1.5 0 0 1 1.5 1.5v6A1.5 1.5 0 0 1 16 14.5h-5l-4 3.5v-3.5H4A1.5 1.5 0 0 1 2.5 13V7A1.5 1.5 0 0 1 4 5.5z';
const BADGE = starPath(12, 12, 9.2, 7.6, 8);
const BURST = starPath(12, 12, 9.4, 6.4, 8);

const ICONS = {
  /* ---- navigation / views ---- */
  'grid': [R(4, 4, 6.5, 6.5, 1.6), R(13.5, 4, 6.5, 6.5, 1.6), R(4, 13.5, 6.5, 6.5, 1.6), R(13.5, 13.5, 6.5, 6.5, 1.6)],
  'radar': [C(12, 12, 9), C(12, 12, 4.6, { opacity: 0.55 }), 'M12 12l6.3-6.4', D(8.4, 14.6, 1.3)],
  'shield-alert': [SHIELD, 'M12 9v4', 'M12 16.3h.01'],
  'alert-triangle': ['M12 3.6l9 15.9H3l9-15.9z', 'M12 10v4', 'M12 17.2h.01'],
  'file-check': [DOC, DOC_FOLD, 'M9 14.6l2 2 4-4.4'],
  'clipboard': [R(5, 4.5, 14, 16.5, 2), 'M9 4.5V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v.5', 'M8.5 11h7M8.5 15h4.5'],
  'graduation': ['M2.5 9.5L12 5l9.5 4.5L12 14 2.5 9.5z', 'M6 11.6v4.4c0 1.6 2.7 3 6 3s6-1.4 6-3v-4.4', 'M21.5 9.5v5'],
  'badge-check': [BADGE, 'M8.8 12.3l2.2 2.2 4.4-4.7'],
  'plug': ['M9 3v4.5M15 3v4.5', 'M6 7.5h12v3.5a6 6 0 0 1-12 0V7.5z', 'M12 17v4'],
  'file-text': [DOC, DOC_FOLD, 'M9 13h6M9 17h4'],
  'sliders': ['M4 7h3M11 7h9', C(9, 7, 2), 'M4 12h9M17 12h3', C(15, 12, 2), 'M4 17h2M10 17h10', C(8, 17, 2)],

  /* ---- hazard categories (seed.CATEGORIES icons) ---- */
  'height': ['M20.5 20.5h-8V7.5h8', 'M7 4.5v14', 'M3.5 15L7 18.5l3.5-3.5'],
  'excavation': ['M2.5 7.5h5.5v9.5h8V7.5h5.5', 'M3 20.5h18', 'M10.5 12.5h3'],
  'crane': ['M7 21V8.5', 'M4 21h6', R(4.5, 4, 5, 4.5, 0.8), 'M9.5 6h11', 'M4.5 6h-2', 'M17.5 6v7a1.8 1.8 0 1 1-3.6 0'],
  'bolt': ['M13 2.5L5.5 13.5h6l-1 8L18.5 10.5h-6l.5-8z'],
  'confined': ['M3.5 8.5c0-2.2 3.8-4 8.5-4s8.5 1.8 8.5 4-3.8 4-8.5 4-8.5-1.8-8.5-4z', 'M3.5 8.5v7c0 2.2 3.8 4 8.5 4s8.5-1.8 8.5-4v-7', 'M12 11v5.5', 'M10 14.5l2 2 2-2'],
  'flame': ['M12 2.8c.5 2.6 2.4 4.1 3.9 6A7 7 0 0 1 18 13.5c0 3.6-2.7 6.5-6 6.5s-6-2.9-6-6.5c0-2 .9-3.7 2.2-5.2.5 1.5 1.3 2.3 2.4 2.9C11 8.8 11.2 5.8 12 2.8z', 'M12 13.2c-1.4 1.3-2.2 2.2-2.2 3.4a2.2 2.2 0 0 0 4.4 0c0-1.2-.8-2.1-2.2-3.4z'],
  'sun': [C(12, 12, 4), 'M12 2.5V5M12 19v2.5M2.5 12H5M19 12h2.5M5.3 5.3l1.8 1.8M16.9 16.9l1.8 1.8M5.3 18.7l1.8-1.8M16.9 7.1l1.8-1.8'],
  'flask': ['M9.5 3h5', 'M10 3v5.3L4.9 17.4A2 2 0 0 0 6.6 20.5h10.8a2 2 0 0 0 1.7-3.1L14 8.3V3', 'M7.3 14.5h9.4'],
  'truck': ['M3 7h10.5v9.5H3z', 'M13.5 10.5h4l3.5 3.5v2.5h-7.5', C(7, 18.5, 1.8), C(17, 18.5, 1.8)],
  'scaffold': ['M5 3v18M19 3v18', 'M5 7.5h14M5 13.5h14M5 19.5h14', 'M5 7.5l14 6'],
  'structure': ['M4 21V9l8-5 8 5v12', 'M2.5 21h19', 'M12.5 9.5l-2 3.5 2.5 2.5-1.5 3.5'],
  'body': [C(12, 4.8, 1.9), 'M12 6.7v6.3', 'M7.5 10.2l4.5 1.6 4.5-1.6', 'M12 13l-3.5 7.5M12 13l3.5 7.5'],

  /* ---- live feed types ---- */
  'sensor': [C(12, 13, 2), 'M12 15v6', 'M7.8 8.8a6 6 0 0 1 8.4 0', 'M5 6a10 10 0 0 1 14 0'],
  'permit': [TICKET, 'M9 8.5v1.4M9 11.3v1.4M9 14.1v1.4'],
  'incident': [BURST, 'M12 8.8v3.6', 'M12 15.6h.01'],
  'nearmiss': ['M21 18.5c-5 0-5-10-10-10H5.5', 'M8 6L5.5 8.5 8 11', D(9.5, 16.5, 1.6)],
  'inspection': [C(10.5, 10.5, 6.5), 'M15.3 15.3L21 21', 'M7.8 10.6l1.8 1.8 3.4-3.6'],
  'training': ['M12 6.5c-2-1.6-5-2.1-9-1.6v13.3c4-.5 7 0 9 1.6 2-1.6 5-2.1 9-1.6V4.9c-4-.5-7 0-9 1.6z', 'M12 6.5v13.3'],
  'integration': ['M12 2.5v7M12 14.5v7M2.5 12h7M14.5 12h7', C(12, 12, 2.5)],
  'ppe': ['M8 3.5L5 5l1 5.5V21h12V10.5L19 5l-3-1.5-1.5 2.3h-5L8 3.5z', 'M6 15.5h12'],
  'weather': [CLOUD, 'M15.5 5.5a3.5 3.5 0 0 1 5.9 2.3'],
  'alert': ['M6 19.5v-6a6 6 0 0 1 12 0v6', 'M4 19.5h16', 'M12 3v2M5.3 6.3l1.4 1.4M18.7 6.3l-1.4 1.4'],

  /* ---- UI chrome ---- */
  'search': [C(10.5, 10.5, 6.5), 'M15.3 15.3L21 21'],
  'bell': ['M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 2h-15l1.5-2z', 'M10 20.5a2 2 0 0 0 4 0', 'M12 3v2'],
  'moon': ['M20 14.6A8 8 0 1 1 9.4 4a6.3 6.3 0 0 0 10.6 10.6z'],
  'menu': ['M4 7h16M4 12h16M4 17h16'],
  'close': ['M6 6l12 12M18 6L6 18'],
  'chevron-down': ['M6 9l6 6 6-6'],
  'chevron-up': ['M6 15l6-6 6 6'],
  'chevron-start': ['M9 6l6 6-6 6'],
  'chevron-end': ['M15 6l-6 6 6 6'],
  'plus': ['M12 5v14M5 12h14'],
  'minus': ['M5 12h14'],
  'download': ['M12 4v11', 'M7.5 10.5l4.5 4.5 4.5-4.5', TRAY],
  'upload': ['M12 15V4', 'M7.5 8.5L12 4l4.5 4.5', TRAY],
  'print': ['M7 8V3.5h10V8', 'M3 16v-6a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v6h-4', 'M3 16h4', 'M7 13.5h10v7H7z', 'M17.5 11.5h.01'],
  'share': [C(6, 12, 2.5), C(18, 6, 2.5), C(18, 18, 2.5), 'M8.2 10.9l7.6-3.8M8.2 13.1l7.6 3.8'],
  'play': ['M7 4.5v15l12-7.5L7 4.5z'],
  'stop': [R(6, 6, 12, 12, 2)],
  'pause': ['M8 5v14M16 5v14'],
  'check': ['M5 12.5l4.5 4.5L19 7'],
  'info': [C(12, 12, 9), 'M12 11v5.5', 'M12 7.6h.01'],
  'external': ['M10 4H4v6', 'M4 4l9 9', 'M5 14v4.5A1.5 1.5 0 0 0 6.5 20h11a1.5 1.5 0 0 0 1.5-1.5v-11A1.5 1.5 0 0 0 17.5 6H13'],
  'filter': ['M3.5 5h17l-6.5 8v6l-4 2v-8L3.5 5z'],
  'table': [R(3.5, 5, 17, 14, 1.5), 'M3.5 10h17M3.5 14.5h17M10 5v14'],
  'chart': ['M4 19.5h16', 'M7 16v-5M12 16V6M17 16v-3'],
  'user': [C(12, 8, 3.5), 'M5 20a7 7 0 0 1 14 0'],
  'clock': [C(12, 12, 9), 'M12 7v5l3.2 2'],
  'calendar': [R(3.5, 5, 17, 16, 2), 'M3.5 10h17', 'M8 3v4M16 3v4'],
  'map-pin': ['M12 21.5s-7-6.3-7-11.5a7 7 0 0 1 14 0c0 5.2-7 11.5-7 11.5z', C(12, 10, 2.5)],
  'refresh': ['M19.5 12a7.5 7.5 0 1 1-2.2-5.3', 'M17.3 2.5v4.2h-4.2'],
  'link': ['M10 14a4 4 0 0 0 5.7.3l3-3a4 4 0 0 0-5.7-5.7l-1.5 1.5', 'M14 10a4 4 0 0 0-5.7-.3l-3 3a4 4 0 0 0 5.7 5.7l1.5-1.5'],
  'copy': [R(9, 9, 11.5, 11.5, 2), 'M5.5 15H4.5A1.5 1.5 0 0 1 3 13.5v-9A1.5 1.5 0 0 1 4.5 3h9A1.5 1.5 0 0 1 15 4.5v1'],
  'trash': ['M4 7h16', 'M9.5 7V4.5h5V7', 'M6.5 7l.8 12.3a1.5 1.5 0 0 0 1.5 1.4h6.4a1.5 1.5 0 0 0 1.5-1.4L17.5 7', 'M10 11v6M14 11v6'],
  'edit': ['M4 20h4.4L19.6 8.8a2.1 2.1 0 0 0-3-3L5.4 17 4 20z', 'M14.6 7.8l3 3'],
  'eye': ['M2.5 12s3.5-6.5 9.5-6.5 9.5 6.5 9.5 6.5-3.5 6.5-9.5 6.5S2.5 12 2.5 12z', C(12, 12, 3)],
  'check-circle': [C(12, 12, 9), 'M8 12.5l2.6 2.6L16 9.6'],
  'alert-circle': [C(12, 12, 9), 'M12 7.5v5.5', 'M12 16.4h.01'],
  'alert-octagon': [OCTAGON, 'M12 8v4.5', 'M12 16.2h.01'],
  'x-octagon': [OCTAGON, 'M9.5 9.5l5 5M14.5 9.5l-5 5'],

  /* ---- integrations (generic symbols, no trademarks) ---- */
  'biltix': [HEX24, 'M12 12V21.5M12 12L3.8 7.25M12 12l8.2-4.75'],
  'dms': ['M21 7a1.5 1.5 0 0 0-1.5-1.5H15l-2 2H4.5A1.5 1.5 0 0 0 3 9v9a1.5 1.5 0 0 0 1.5 1.5h15A1.5 1.5 0 0 0 21 18V7z', 'M8 13h8M11 16h5'],
  'iot': [R(7, 7, 10, 10, 1.5), R(10.2, 10.2, 3.6, 3.6, 0.6), 'M10 7V4M14 7V4M10 20v-3M14 20v-3M7 10H4M7 14H4M20 10h-3M20 14h-3'],
  'cctv': ['M3.5 9.6l12.5-4.6 1.9 5.2L5.4 14.8z', 'M15.6 8.4h.01', 'M6 14.8v5.7', 'M3.5 20.5h5'],
  'wearable': [R(7, 6.5, 10, 11, 2.5), 'M9.5 6.5V3h5v3.5M9.5 17.5V21h5v-3.5', 'M8.5 12h1.6l1-2 1.8 4 1-2h1.6'],
  'gate': ['M19.5 21V8', 'M17 21h5', 'M17.5 9h-14a1 1 0 0 0-1 1v1a1 1 0 0 0 1 1h14', 'M13.5 9v3M9.5 9v3M5.5 9v3'],
  'gosi': ['M3 12a9 9 0 0 1 18 0H3z', 'M12 2v1', 'M12 12v6.5a2 2 0 0 0 4 0', 'M7.5 12c0-4 2-7 4.5-9M16.5 12c0-4-2-7-4.5-9'],
  'hr': [C(9, 8, 3), 'M3.5 19.5a5.5 5.5 0 0 1 11 0', 'M16 5.5a3 3 0 0 1 0 5.8', 'M17.5 14.5a5 5 0 0 1 3 5'],
  'erp': [CYLINDER_TOP, 'M4 6v12c0 1.7 3.6 3 8 3s8-1.3 8-3V6', 'M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3'],
  'hash': ['M9.5 3L7.5 21M16.5 3l-2 18M3.5 9h17M3.5 15h17'],
  'teams': [BUBBLE, 'M18 9.5h1.5A1.5 1.5 0 0 1 21 11v5.5a1.5 1.5 0 0 1-1.5 1.5H19v2.5L16.5 18h-1'],
  'whatsapp': ['M12 3a8.5 8.5 0 0 1 7.3 12.9l1.2 4.6-4.7-1.2A8.5 8.5 0 1 1 12 3z', 'M8.5 12h.01M12 12h.01M15.5 12h.01'],
  'mail': [R(3, 5.5, 18, 13, 2), 'M3.5 7.2l8.5 6.3 8.5-6.3'],
  'sms': [R(6.5, 2.5, 11, 19, 2.5), 'M10.5 18.5h3', 'M9.5 8h5M9.5 11h3'],
  'webhook': [C(12, 6, 3), C(6, 18, 3), C(18, 18, 3), 'M12 9v3l-4.5 3.4M12 12l4.5 3.4'],
  'sheets': [R(4, 3.5, 16, 17, 2), 'M4 9h16M4 14.5h16M14 9v11.5'],
  'supabase': [R(3.5, 4, 17, 6, 1.5), R(3.5, 14, 17, 6, 1.5), 'M17 7h.01M17 17h.01', 'M12 10v4'],
  'powerbi': [R(3.5, 3.5, 17, 17, 2.5), 'M8 16.5v-4M12 16.5v-8.5M16 16.5v-6'],

  /* ---- misc ---- */
  'drag': [D(9, 6, 1.3), D(15, 6, 1.3), D(9, 12, 1.3), D(15, 12, 1.3), D(9, 18, 1.3), D(15, 18, 1.3)],
  'more': [D(5, 12, 1.5), D(12, 12, 1.5), D(19, 12, 1.5)],
  'more-vertical': [D(12, 5, 1.5), D(12, 12, 1.5), D(12, 19, 1.5)],
  'list': ['M3 6h13M3 12h13M3 18h13', D(20, 6, 1.2), D(20, 12, 1.2), D(20, 18, 1.2)],
  'kanban': [R(3, 4, 5, 16, 1.2), R(9.5, 4, 5, 10, 1.2), R(16, 4, 5, 13, 1.2)],
  'building': [R(5, 3, 14, 18, 1.5), 'M3 21h18', 'M9 7h2M13 7h2M9 11h2M13 11h2M9 15h2M13 15h2', 'M10.5 21v-3h3v3'],
  'helmet': ['M5 14.5a7 7 0 0 1 14 0', 'M2.5 14.5h19', 'M4 14.5v2.5a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-2.5', 'M12 7.5v3.5'],
  'first-aid': [R(3, 6.5, 18, 14, 2), 'M9 6.5V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v1.5', 'M12 10.5v6M9 13.5h6'],
  'fire-extinguisher': [R(9, 9.5, 6, 11.5, 2), 'M12 9.5V6.5', 'M9.5 4.5h5', 'M9.5 4.5C7 4.5 5.5 6.5 5.5 9', 'M4 9h3', 'M9 14h6'],
  'gas': [R(8, 6, 8, 15, 2.5), 'M12 6V3.5M10 3.5h4', 'M8 11h8', 'M8 15h8'],
  'noise': [D(19, 12, 1.6), 'M15 8.5a5 5 0 0 0 0 7', 'M11.5 5.5a9 9 0 0 0 0 13', 'M8 2.8a13 13 0 0 0 0 18.4'],
  'dust': [D(7, 9, 1.4), D(12, 6.5, 1.4), D(17, 9.5, 1.4), C(9.5, 14, 1.4), D(14.5, 13.5, 1.4), C(11.5, 18.5, 1.4), D(17.5, 17, 1.4), C(5.5, 17, 1.4)],
  'vibration': ['M2.5 12h2.5l2-5 3 10 3-10 3 10 2-5h3.5'],
  'wind': ['M21 8h-9.5a2.5 2.5 0 1 1 2.5-2.5', 'M21 12H7a3 3 0 1 0 3 3', 'M21 16h-8.5a2 2 0 1 0 2 2'],
  'oxygen': [C(10, 10.5, 6.5), C(18, 17.5, 3), 'M7 9.2a3.6 3.6 0 0 1 2.4-2.6'],
  'temperature': ['M10 14.2V5a2 2 0 0 1 4 0v9.2a3.5 3.5 0 1 1-4 0z', 'M12 9.5v5', D(12, 17.1, 1.6)],
  'speaker': ['M20 9.5v5h-3.5l-4.5 4v-13l4.5 4H20z', 'M8.5 9a4.5 4.5 0 0 0 0 6', 'M5.5 6.5a8 8 0 0 0 0 11'],
  'mic': [R(9, 3, 6, 11, 3), 'M5.5 11.5a6.5 6.5 0 0 0 13 0', 'M12 18v3M9 21h6'],
  'globe': [C(12, 12, 9), 'M3 12h18', 'M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18'],
  'lock': [R(5, 10.5, 14, 10.5, 2), 'M8 10.5V7.5a4 4 0 0 1 8 0v3', 'M12 15v2'],

  /* ---- extras used by the shell (command palette, settings) ---- */
  'theme': [C(12, 12, 9), 'M12 3v18', F('M12 3a9 9 0 0 0 0 18V3z', 0.35)],
  'feed': ['M19.5 4.5a15 15 0 0 0-15 15', 'M19.5 10.5a9 9 0 0 0-9 9', D(17.8, 17.8, 1.8)],
  'export': ['M14 5h4.5A1.5 1.5 0 0 1 20 6.5v11a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 6 17.5V13', 'M3 7.5h7', 'M6.5 4L3 7.5 6.5 11'],
  'import': ['M14 5h4.5A1.5 1.5 0 0 1 20 6.5v11a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 6 17.5V13', 'M3 7.5h7', 'M6.5 4l3.5 3.5-3.5 3.5'],
  'arrow-start': ['M5 12h14', 'M13 6l6 6-6 6'],
  'arrow-end': ['M19 12H5', 'M11 6l-6 6 6 6'],
  'arrow-up': ['M12 19V5', 'M6 11l6-6 6 6'],
  'arrow-down': ['M12 5v14', 'M6 13l6 6 6-6'],
  'trend-up': ['M21 17l-6-6-4 4-8-8', 'M8 7H3v5'],
  'trend-down': ['M21 7l-6 6-4-4-8 8', 'M8 17H3v-5'],
  'maximize': ['M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5'],
  'sort': ['M8 9l4-4 4 4M8 15l4 4 4-4'],
  'sort-asc': ['M8 10l4-4 4 4', 'M12 6v13'],
  'sort-desc': ['M8 14l4 4 4-4', 'M12 5v13'],
  'empty': ['M4 7h16v12H4z', 'M4 11h16', 'M9 7V4h6v3'],
  'star': [starPath(12, 12, 9.2, 4.3, 5)],
  'percent': ['M19 5L5 19', C(7, 7, 2.3), C(17, 17, 2.3)],
  'shield': [SHIELD],
  'shield-check': [SHIELD, 'M8.8 12.2l2.2 2.2 4.2-4.6'],
  'csv': [DOC, DOC_FOLD, 'M8.5 13h7M8.5 16.5h7M11.5 13v3.5'],
  'json': [DOC, DOC_FOLD, 'M10 12c-1.2 0-1.2 1-1.2 2s0 1-1 1 1 0 1 1 0 2 1.2 2M14 12c1.2 0 1.2 1 1.2 2s0 1 1 1-1 0-1 1 0 2-1.2 2'],
  'layers': ['M12 3.5l9 4.5-9 4.5-9-4.5 9-4.5z', 'M3 12.5l9 4.5 9-4.5', 'M3 17l9 4.5 9-4.5'],
  'package': ['M12 3.5l8.5 4.5v8L12 20.5 3.5 16V8L12 3.5z', 'M3.5 8L12 12.5 20.5 8', 'M12 12.5v8', 'M7.5 5.9l8.6 4.6'],
  'send': ['M21 12L3 3.5 7.5 20.5l4.6-5.6L21 12z', 'M12.1 14.9L3 3.5'],
  'trend': ['M21 17l-6-6-4 4-8-8', D(3, 7, 1.3)],
  'dot': [D(12, 12, 3.2)],
  'rect': [R(5, 8.5, 14, 7, 2)],
  'hazard': [D(12, 12, 2.2), C(12, 12, 5.5), C(12, 12, 9, { opacity: 0.45 })],
  'cloud-off': ['M7 19h10.5a4 4 0 0 0 1.8-.43', 'M20.9 15.2a4 4 0 0 0-2.8-4.15A6.5 6.5 0 0 0 9.4 6.4', 'M6.3 8.9a6.5 6.5 0 0 0-.6 3.7A3.3 3.3 0 0 0 7 19', 'M3 3l18 18'],
  'sparkles': ['M11 3.5l1.9 5.1 5.1 1.9-5.1 1.9L11 17.5l-1.9-5.1L4 10.5l5.1-1.9L11 3.5z', 'M18.5 14.5l.9 2.1 2.1.9-2.1.9-.9 2.1-.9-2.1-2.1-.9 2.1-.9.9-2.1z', 'M5.5 16.5l.6 1.4 1.4.6-1.4.6-.6 1.4-.6-1.4-1.4-.6 1.4-.6.6-1.4z'],
  'circle': [C(12, 12, 8.5), D(12, 12, 1.6)],
};

/** Synonyms → canonical names (category ids, tone names, legacy component glyph names, common vocabulary). */
const ALIASES = {
  'sunny': 'sun', 'x': 'close', 'risk': 'shield-alert', 'slack': 'hash', 'grip': 'drag',
  'settings': 'sliders', 'cog': 'sliders', 'gear': 'sliders', 'home': 'grid', 'dashboard': 'grid', 'overview': 'grid',
  'risks': 'shield-alert', 'incidents': 'alert-triangle', 'permits': 'file-check', 'inspections': 'clipboard',
  'compliance': 'badge-check', 'integrations': 'plug', 'reports': 'file-text', 'report': 'file-text', 'document': 'file-text', 'file': 'file-text',
  'warning': 'alert-triangle', 'good': 'check-circle', 'success': 'check-circle', 'serious': 'alert-circle',
  'critical': 'alert-octagon', 'danger': 'alert-octagon', 'error': 'x-octagon', 'neutral': 'circle', 'brand': 'biltix', 'accent': 'radar',
  'lifting': 'crane', 'electrical': 'bolt', 'hotwork': 'flame', 'heat': 'sun', 'chemical': 'flask', 'traffic': 'truck',
  'structural': 'structure', 'ergonomic': 'body', 'zap': 'bolt', 'lightning': 'bolt', 'fire': 'flame', 'thermometer': 'temperature',
  'folder': 'dms', 'users': 'hr', 'people': 'hr', 'database': 'erp', 'server': 'supabase', 'chat': 'teams', 'message': 'whatsapp',
  'phone': 'sms', 'envelope': 'mail', 'email': 'mail', 'rss': 'feed', 'book': 'training', 'pin': 'map-pin', 'location': 'map-pin',
  'camera': 'cctv', 'watch': 'wearable', 'cube': 'biltix', 'move': 'arrow-start', 'chevron-right': 'chevron-start', 'chevron-left': 'chevron-end',
  'arrow-right': 'arrow-start', 'arrow-left': 'arrow-end', 'ellipsis': 'more', 'dots': 'more', 'cross': 'close', 'tick': 'check', 'ok': 'check',
  'exclamation': 'alert-circle', 'help': 'info', 'question': 'info', 'cards': 'grid', 'graph': 'chart', 'bars': 'chart', 'trash-2': 'trash', 'delete': 'trash',
  'pencil': 'edit', 'view': 'eye', 'hide': 'eye', 'sync': 'refresh', 'reload': 'refresh', 'save': 'download', 'printer': 'print', 'cctv-ai': 'cctv',
  'biltix-pm': 'biltix', 'biltix-dms': 'dms', 'iot-gateway': 'iot', 'wearables': 'wearable', 'access-control': 'gate', 'weather-ncm': 'weather',
  'hrms': 'hr', 'erp-sap': 'erp', 'email-smtp': 'mail', 'sms-twilio': 'sms', 'webhooks': 'webhook', 'google-sheets': 'sheets', 'power-bi': 'powerbi',
  'sheet': 'sheets', 'thermo': 'temperature', 'worker': 'dot', 'vehicle': 'rect', 'hazards': 'hazard', 'box': 'package', 'paper-plane': 'send', 'braces': 'json',
  'sparkle': 'sparkles', 'ai': 'sparkles', 'magic': 'sparkles', 'roadmap': 'map-pin', 'milestone': 'badge-check',
  'offline': 'cloud-off', 'wifi-off': 'cloud-off', 'not-connected': 'plug', 'demo': 'flask', 'stale': 'clock',
};

/** Canonical glyphs drawn for RTL reading; mirrored when the document is LTR. */
const DIRECTIONAL = new Set(['chevron-start', 'chevron-end', 'arrow-start', 'arrow-end', 'export', 'import', 'external', 'list', 'speaker', 'wind', 'feed', 'nearmiss', 'dms']);
/** Requested names that denote a physical direction: never mirrored. */
const PHYSICAL = new Set(['chevron-right', 'chevron-left', 'arrow-right', 'arrow-left']);

function documentIsRtl() {
  try { return isRtl(); } catch { return true; }
}

const FALLBACK = ICONS.circle;

function normalizeName(name) {
  if (typeof name !== 'string') return '';
  return name.trim().replace(/([a-z0-9])([A-Z])/g, '$1-$2').replace(/[\s_]+/g, '-').toLowerCase();
}

function resolveName(name) {
  const key = normalizeName(name);
  if (!key) return null;
  if (ICONS[key]) return key;
  if (ALIASES[key] && ICONS[ALIASES[key]]) return ALIASES[key];
  return null;
}

function renderOp(svg, op) {
  if (typeof op === 'string') { svg.appendChild(el('path', { d: op })); return; }
  if (!op || typeof op !== 'object') return;
  const o = op.o || {};
  if (op.t === 'path') svg.appendChild(el('path', { d: op.d, ...o }));
  else if (op.t === 'circle') svg.appendChild(el('circle', { cx: op.cx, cy: op.cy, r: op.r, ...o }));
  else if (op.t === 'rect') svg.appendChild(el('rect', { x: op.x, y: op.y, width: op.w, height: op.h, rx: op.rx, ry: op.rx, ...o }));
}

/**
 * Inline 24×24 line icon.
 * @param {string} name   icon name (kebab-case; camelCase and a few synonyms are accepted)
 * @param {number} size   rendered width/height in px (default 18)
 * @param {string|{label?:string, class?:string}} [opts]  an accessible label makes the svg `role="img"`; otherwise it is aria-hidden
 * @returns {SVGSVGElement}
 */
export function icon(name, size = 18, opts = {}) {
  const key = resolveName(name);
  const def = key ? ICONS[key] : FALLBACK;
  const forced = opts && typeof opts === 'object' && typeof opts.mirror === 'boolean' ? opts.mirror : null;
  const mirror = forced !== null ? forced : (key !== null && DIRECTIONAL.has(key) && !PHYSICAL.has(normalizeName(name)) && !documentIsRtl());
  const px = sizeOf(size, 18);
  const label = typeof opts === 'string' ? opts : (opts && typeof opts.label === 'string' ? opts.label : '');
  const svg = el('svg', {
    xmlns: SVG_NS, viewBox: '0 0 24 24', width: px, height: px,
    fill: 'none', stroke: 'currentColor', 'stroke-width': '1.75', 'stroke-linecap': 'round', 'stroke-linejoin': 'round',
    focusable: 'false', 'data-icon': key || 'unknown',
  });
  svg.classList.add('icon', key ? `icon-${key}` : 'icon-unknown');
  if (opts && typeof opts === 'object' && typeof opts.class === 'string') opts.class.split(/\s+/).filter(Boolean).forEach((c) => svg.classList.add(c));
  if (label) {
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', label);
    const title = el('title'); title.textContent = label; svg.appendChild(title);
  } else {
    svg.setAttribute('aria-hidden', 'true');
  }
  if (mirror) {
    const g = el('g', { transform: 'matrix(-1 0 0 1 24 0)' });
    for (const op of def) renderOp(g, op);
    svg.appendChild(g);
    svg.setAttribute('data-mirrored', 'true');
  } else {
    for (const op of def) renderOp(svg, op);
  }
  return svg;
}

/** True when `name` resolves to a drawn glyph (not the fallback). */
export function hasIcon(name) { return resolveName(name) !== null; }

/** Canonical icon names (no aliases). */
export function iconNames() { return Object.keys(ICONS); }

/* ------------------------------------------------------------------ */
/* Logo mark & lockup                                                  */
/* ------------------------------------------------------------------ */

/* Mark geometry on a 32-unit grid: pointy-top hexagon (r 14.5) around an isometric block whose vertical
   edges sit on whole units (x 9 / 16 / 23), so the silhouette stays sharp at 24, 32 and 40 px. */
const MARK_HEX = 'M16 1.5L28.56 8.75V23.25L16 30.5L3.44 23.25V8.75Z';
const MARK_TOP = 'M16 7.5L23 11.5L16 15.5L9 11.5Z';
const MARK_LEFT = 'M9 11.5L16 15.5V24.5L9 20.5Z';
const MARK_RIGHT = 'M16 15.5L23 11.5V20.5L16 24.5Z';
/* Step: a lower wing cut into the right face reads as a stepped structure without hairlines. */
const MARK_STEP = 'M19.5 18.5L23 16.5V20.5L19.5 22.5Z';
const MARK_SHIELD = 'M0-4l3.4 1.4v2.4c0 2.3-1.4 4-3.4 4.7-2-.7-3.4-2.4-3.4-4.7v-2.4z';

/**
 * BILTIX mark: a gold hexagon frame (1.5 px at any size) around an isometric block in --brand (lit top,
 * shaded right face with a stepped wing) and an --accent shield notch on the lower-right corner (a logo
 * never mirrors).
 * No sub-pixel strokes, so it renders crisply from 24 px to 40 px (and scales up cleanly).
 */
export function logoMark(size = 36) {
  const px = sizeOf(size, 36);
  const label = t('ui.brand.logo');
  const svg = el('svg', { xmlns: SVG_NS, viewBox: '0 0 32 32', width: px, height: px, role: 'img', 'aria-label': label, focusable: 'false', 'shape-rendering': 'geometricPrecision' });
  svg.classList.add('logo-mark');
  const title = el('title'); title.textContent = t('ui.brand.name'); svg.appendChild(title);

  // frame: solid plate + gold hexagon (non-scaling stroke keeps 1.5 px at every size)
  const frame = el('g', { class: 'logo-mark-frame', style: { color: 'var(--gold)' } });
  frame.appendChild(el('path', { d: MARK_HEX, fill: 'var(--bg-1)' }));
  frame.appendChild(el('path', { d: MARK_HEX, fill: 'none', stroke: 'currentColor', 'stroke-width': '1.5', 'stroke-linejoin': 'round', 'vector-effect': 'non-scaling-stroke' }));
  svg.appendChild(frame);

  // block: three faces of one hue (brand) lit from the top
  const block = el('g', { class: 'logo-mark-blocks' });
  block.appendChild(el('path', { d: MARK_LEFT, fill: 'var(--brand)' }));
  block.appendChild(el('path', { d: MARK_RIGHT, fill: 'var(--brand)' }));
  block.appendChild(el('path', { d: MARK_RIGHT, fill: 'var(--bg-0)', 'fill-opacity': '0.38' }));
  block.appendChild(el('path', { d: MARK_TOP, fill: 'var(--brand)' }));
  block.appendChild(el('path', { d: MARK_TOP, fill: 'var(--brand-ink)', 'fill-opacity': '0.42' }));
  block.appendChild(el('path', { d: MARK_STEP, fill: 'var(--bg-0)', 'fill-opacity': '0.55' }));
  svg.appendChild(block);

  // shield notch: a page-coloured halo cuts the frame, the accent shield sits in the gap
  const notch = el('g', { class: 'logo-mark-notch', transform: 'translate(25.2 24.6)' });
  notch.appendChild(el('path', { d: MARK_SHIELD, fill: 'var(--bg-0)', stroke: 'var(--bg-0)', 'stroke-width': '2.6', 'stroke-linejoin': 'round' }));
  notch.appendChild(el('path', { d: MARK_SHIELD, fill: 'var(--accent)' }));
  svg.appendChild(notch);
  return svg;
}

/**
 * Line-only emblem (currentColor, 1 px non-scaling strokes): hexagon, isometric block edges and four
 * survey ticks. Used as the quiet identity detail of the page background (CSS sets colour/opacity).
 */
export function emblem(size = 56) {
  const px = sizeOf(size, 56);
  const svg = el('svg', { xmlns: SVG_NS, viewBox: '0 0 32 32', width: px, height: px, 'aria-hidden': 'true', focusable: 'false', fill: 'none', stroke: 'currentColor', 'stroke-width': '1', 'stroke-linejoin': 'round', 'stroke-linecap': 'round' });
  svg.classList.add('bg-emblem');
  const ns = { 'vector-effect': 'non-scaling-stroke' };
  svg.appendChild(el('path', { d: MARK_HEX, ...ns }));
  svg.appendChild(el('path', { d: 'M16 7.5L23 11.5L16 15.5L9 11.5Z M9 11.5V20.5L16 24.5L23 20.5V11.5 M16 15.5V24.5', ...ns }));
  svg.appendChild(el('path', { d: 'M16 0V-1.5 M16 32V33.5 M0 16H1.6 M32 16H30.4', ...ns, opacity: '0.7' }));
  return svg;
}

/**
 * Logo lockup: mark + localized product name + small Latin mono tag. Returns an inline-flex <span>.
 */
export function logoLockup({ size = 36 } = {}) {
  const wrap = document.createElement('span');
  wrap.className = 'logo-lockup';
  Object.assign(wrap.style, { display: 'inline-flex', alignItems: 'center', gap: '10px', color: 'var(--ink-1)', textDecoration: 'none', minInlineSize: '0' });
  wrap.appendChild(logoMark(size));

  const text = document.createElement('span');
  text.className = 'logo-lockup-text';
  Object.assign(text.style, { display: 'flex', flexDirection: 'column', lineHeight: '1.15', minInlineSize: '0' });

  const name = document.createElement('strong');
  name.className = 'logo-lockup-name';
  name.textContent = t('ui.brand.name');
  Object.assign(name.style, { fontWeight: '700', fontSize: 'var(--fs-lg)', letterSpacing: '-0.01em', whiteSpace: 'nowrap' });

  const mono = document.createElement('span');
  mono.className = 'logo-lockup-mono mono';
  mono.setAttribute('dir', 'ltr');
  mono.setAttribute('aria-hidden', 'true');
  mono.textContent = 'BILTIX · RISK AI';
  Object.assign(mono.style, { fontFamily: 'var(--font-mono)', fontSize: '10px', letterSpacing: '0.16em', color: 'var(--ink-3)', textAlign: 'start', whiteSpace: 'nowrap' });

  text.appendChild(name);
  text.appendChild(mono);
  wrap.appendChild(text);
  return wrap;
}

/* ------------------------------------------------------------------ */
/* Small architectural pieces                                          */
/* ------------------------------------------------------------------ */

const TONE_VARS = new Set(['brand', 'accent', 'gold', 'good', 'warning', 'serious', 'critical', 'ink-1', 'ink-2', 'ink-3', 'line', 'line-2', 's1', 's2', 's3', 's4', 's5', 's6', 's7', 's8']);

function toneToColor(tone, fallback = 'var(--brand)') {
  if (typeof tone !== 'string') return fallback;
  const t = tone.trim();
  if (/^var\(--[a-z0-9-]+\)$/i.test(t)) return t;
  if (t === 'currentColor') return t;
  if (t === 'ink') return 'var(--ink-2)';
  if (TONE_VARS.has(t)) return `var(--${t})`;
  return fallback;
}

/**
 * Isometric cube with three shaded faces. `tone` is a token name ('brand', 'accent', 'gold', a status
 * tone, 's1'…'s8', 'ink') or a literal `var(--x)` string.
 */
export function isoCube(size = 24, tone = 'brand') {
  const px = sizeOf(size, 24);
  const fill = toneToColor(tone);
  const svg = el('svg', { xmlns: SVG_NS, viewBox: '0 0 24 24', width: px, height: px, 'aria-hidden': 'true', focusable: 'false' });
  svg.classList.add('iso-cube');
  if (typeof tone === 'string' && /^[a-z0-9-]+$/i.test(tone.trim())) svg.dataset.tone = tone.trim();
  const g = el('g', { style: { color: 'var(--brand-ink)' } });
  appendIsoBlock(g, 12, 4, 8, 8, 8, { fill, light: 'currentColor', shade: 'var(--bg-0)', lightTop: 0.44, lightRight: 0.14, shadeLeft: 0.34 });
  g.appendChild(el('path', { d: 'M5.07 8L12 12l6.93-4M12 12v8', fill: 'none', stroke: 'currentColor', 'stroke-width': '0.5', 'stroke-opacity': '0.5', 'stroke-linejoin': 'round' }));
  svg.appendChild(g);
  return svg;
}

/**
 * One mashrabiya tile: an eight-point star with its cross lattice, drawn in currentColor so the
 * caller sets the colour (`color: var(--gold)` for ornament).
 */
export function mashrabiyaTile(size = 48) {
  const px = sizeOf(size, 48);
  const svg = el('svg', { xmlns: SVG_NS, viewBox: '0 0 48 48', width: px, height: px, 'aria-hidden': 'true', focusable: 'false' });
  svg.classList.add('mashrabiya-tile');
  appendLatticeTile(svg, 48);
  return svg;
}

/** Hazard category id → icon name (docs/ARCHITECTURE.md §3 CATEGORIES). */
const SECTOR_ICONS = {
  height: 'height', excavation: 'excavation', lifting: 'crane', electrical: 'bolt', confined: 'confined', hotwork: 'flame',
  heat: 'sun', chemical: 'flask', traffic: 'truck', scaffold: 'scaffold', structural: 'structure', ergonomic: 'body',
};

export function sectorGlyph(categoryId) {
  const key = typeof categoryId === 'string' ? categoryId.trim().toLowerCase() : '';
  return SECTOR_ICONS[key] || 'alert-triangle';
}

/** Convenience: the rendered icon for a hazard category id. */
export function sectorIcon(categoryId, size = 18, opts) { return icon(sectorGlyph(categoryId), size, opts); }

/* ------------------------------------------------------------------ */
/* Page backdrop                                                       */
/* ------------------------------------------------------------------ */

/** Live backdrops: paused (class .is-paused) while the document is hidden, so cinematic drift stops. */
const liveBackdrops = new Set();
let backdropVisibilityBound = false;
function syncBackdropVisibility() {
  for (const node of Array.from(liveBackdrops)) {
    if (!node.isConnected && node.dataset.mounted === 'true') { liveBackdrops.delete(node); continue; }
    if (node.isConnected) node.dataset.mounted = 'true';
    node.classList.toggle('is-paused', !!document.hidden);
  }
}

/**
 * Page background (CONTRACT §3 / §3.1). Returns
 *   <div class="bg-layers" aria-hidden="true">
 *     <div class="bg-ambient"></div>          two broad, very soft ambient lights (CSS)
 *     <div class="bg-grid"></div>             sparse engineering grid at 2–4 % (CSS)
 *     <div class="bg-mark">                   one small identity detail at the inline-end bottom
 *       <svg class="bg-emblem">…</svg><span class="bg-mark-caption">…</span>
 *     </div>
 *   </div>
 * Styling per html[data-bg="static"|"subtle"|"cinematic"] lives in css/ (A-STYLE). Nothing here moves:
 * the cinematic drift is a CSS transform animation; this function only adds .is-paused while hidden.
 * The caption is a drawing-datum flourish (Latin mono, dir=ltr), not a location claim.
 */
export function backdrop() {
  const root = document.createElement('div');
  root.className = 'bg-layers';
  root.setAttribute('aria-hidden', 'true');

  const ambient = document.createElement('div');
  ambient.className = 'bg-ambient';
  const grid = document.createElement('div');
  grid.className = 'bg-grid';

  const mark = document.createElement('div');
  mark.className = 'bg-mark';
  mark.appendChild(emblem(56));
  const caption = document.createElement('span');
  caption.className = 'bg-mark-caption mono';
  caption.setAttribute('dir', 'ltr');
  const l1 = document.createElement('span');
  l1.className = 'bg-mark-line';
  l1.textContent = 'BILTIX · RISK AI';
  const l2 = document.createElement('span');
  l2.className = 'bg-mark-line';
  l2.textContent = 'DATUM X 0.000 · Y 0.000';
  caption.append(l1, l2);
  mark.appendChild(caption);

  root.append(ambient, grid, mark);

  liveBackdrops.add(root);
  if (!backdropVisibilityBound && typeof document !== 'undefined') {
    backdropVisibilityBound = true;
    document.addEventListener('visibilitychange', syncBackdropVisibility);
  }
  if (document.hidden) root.classList.add('is-paused');
  return root;
}

/* ------------------------------------------------------------------ */
/* Bundle                                                              */
/* ------------------------------------------------------------------ */

export const art = { icon, logoMark, logoLockup, emblem, backdrop, isoCube, mashrabiyaTile, sectorGlyph, sectorIcon, hasIcon, iconNames };
export default art;
