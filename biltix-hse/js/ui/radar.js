/**
 * Biltix HSE — Canvas radar engine (js/ui/radar.js)
 *
 * Owner: RADAR. Implements docs/ARCHITECTURE.md §6.
 *
 *   radarLoop        ONE shared requestAnimationFrame loop for every radar on the page.
 *                    Pauses on document.hidden, honours prefers-reduced-motion and
 *                    <html data-motion="reduce"> (sets radar.reduced = true → no sweep or
 *                    rotation, only a slow breathing pulse), throttles to ~30 fps when reduced.
 *   RadarBase        Canvas lifecycle shared by every radar: start / stop / destroy / setData /
 *                    resize / setHoverHandler. Sizes the canvas to its parent via ResizeObserver
 *                    with dpr = min(devicePixelRatio, 2); reads colours from CSS custom properties
 *                    on start() and again on bus 'theme:change' / 'settings:change' (plus a shared
 *                    MutationObserver on <html> as a safety net); hit-tests hover targets within
 *                    14 px on pointermove and calls onHover(item | null, info).
 *   SweepRadar       Rotating sweep over hazard sectors with tone-coloured blips that ping.
 *   SensorRadar      Live sensor polygon vs. threshold polygon on a slowly rotating dial.
 *   SitePlanRadar    Isometric (sheared) site plan with workers, vehicles, cranes, hazards and
 *                    a scanning line.
 *   ComplianceRadar  ISO 45001 clause scores vs. a target ring, gaps as warning wedges.
 *
 * Plain ES module; imports ../core/bus.js and the UI i18n bridge. No colour is hard-coded here:
 * everything is read from --bg-*, --line*, --ink-*, --accent, --gold, --good, --warning,
 * --serious, --critical (and --font-sans / --font-mono-mixed for canvas text — both resolve per
 * html[lang], so Arabic-first or Latin-first stacks follow the language). Side-effect free on
 * import: global listeners are attached only while at least one radar is running.
 *
 * Language (v3): canvas strings come from t('radar.*') at draw time; ctx.direction follows html[dir];
 * the site plan mirrors its chrome in LTR (zone names at the inline-start corner, legend at the
 * bottom inline-start, compass at the top inline-end). A change of html[lang|dir] invalidates the
 * palette (fonts, direction) through the shared MutationObserver.
 *
 * Hover info object passed to onHover(item, info):
 *   { x, y }               the hovered item's centre in canvas CSS pixels (== localX/localY),
 *                          i.e. relative to the canvas/.radar-frame — for a tooltip positioned
 *                          inside the frame
 *   { clientX, clientY }   the same point in viewport coordinates — for a position:fixed
 *                          tooltip such as charts.tooltip.show(clientX, clientY, …)
 *   { pointerX, pointerY } the pointer's own client coordinates
 *   { canvas }             the canvas element
 * When the pointer leaves every target the handler receives (null, info|null).
 */

import { bus } from '../core/bus.js';
import { t } from './i18n-bridge.js';

/* ------------------------------------------------------------------ */
/* Constants & small math helpers                                      */
/* ------------------------------------------------------------------ */

const TAU = Math.PI * 2;
const DEG = Math.PI / 180;
const HIT_RADIUS = 14;
const MAX_DPR = 2;
const REDUCED_FPS = 30;
const MAX_DT = 0.1; // seconds; longer gaps (tab throttling) are clamped so nothing jumps

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const norm360 = (d) => ((d % 360) + 360) % 360;
/** Frame-rate independent smoothing factor equivalent to `k` per frame at 60 fps. */
const easeK = (k, dt) => 1 - Math.pow(1 - k, Math.max(0, dt) * 60);
const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
const easeOutBack = (t) => {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  const x = t - 1;
  return 1 + c3 * x * x * x + c1 * x * x;
};
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
function num(v, fallback = 0) {
  const n = typeof v === 'string' ? parseFloat(v) : v;
  return isNum(n) ? n : fallback;
}
/** Polar → canvas point. 0° = up (north), degrees increase clockwise. */
function polar(cx, cy, deg, r) {
  const a = deg * DEG;
  return [cx + Math.sin(a) * r, cy - Math.cos(a) * r];
}
/** True when angle `a` lies on the clockwise arc from `prev` to `cur` (all in degrees). */
function passedAngle(prev, cur, a) {
  const span = norm360(cur - prev);
  if (span <= 0 || span >= 180) return false;
  return norm360(a - prev) <= span;
}
/** Deterministic 0..1 hash of a string (phase offsets that survive re-polls). */
function hash01(str) {
  let h = 2166136261;
  const s = String(str);
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 10007) / 10007;
}
function sameItem(a, b) {
  if (a === b) return true;
  if (!a || !b) return false;
  return a.id != null && a.id === b.id && (a.kind ?? null) === (b.kind ?? null);
}

/* ------------------------------------------------------------------ */
/* Colour utilities (parse once, derive alpha variants per frame)      */
/* ------------------------------------------------------------------ */

const colorCache = new Map();
let probeCtx = null;
function probeContext() {
  if (probeCtx === null) {
    try {
      const c = document.createElement('canvas');
      c.width = c.height = 1;
      probeCtx = c.getContext('2d', { willReadFrequently: true }) || false;
    } catch {
      probeCtx = false;
    }
  }
  return probeCtx || null;
}

/**
 * Parse any CSS colour the browser understands into [r, g, b, a].
 * Hex and rgb()/rgba() are parsed directly; everything else (named colours,
 * hsl(), color-mix(), system colours) is normalised by painting one pixel.
 */
function parseColor(input) {
  const key = String(input ?? '').trim();
  if (!key) return null;
  if (colorCache.has(key)) return colorCache.get(key);
  let out = null;
  let m;
  if ((m = /^#([0-9a-f]{3,8})$/i.exec(key))) {
    const h = m[1];
    if (h.length === 3 || h.length === 4) {
      out = [
        parseInt(h[0] + h[0], 16), parseInt(h[1] + h[1], 16), parseInt(h[2] + h[2], 16),
        h.length === 4 ? parseInt(h[3] + h[3], 16) / 255 : 1,
      ];
    } else if (h.length === 6 || h.length === 8) {
      out = [
        parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16),
        h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1,
      ];
    }
  } else if ((m = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:\s*[,/]\s*([\d.]+%?))?\s*\)$/i.exec(key))) {
    const a = m[4] == null ? 1 : m[4].endsWith('%') ? parseFloat(m[4]) / 100 : parseFloat(m[4]);
    out = [+m[1], +m[2], +m[3], clamp(a, 0, 1)];
  } else {
    const ctx = probeContext();
    if (ctx) {
      ctx.fillStyle = '#010203';
      ctx.fillStyle = key;
      if (ctx.fillStyle !== '#010203') {
        ctx.clearRect(0, 0, 1, 1);
        ctx.fillRect(0, 0, 1, 1);
        const d = ctx.getImageData(0, 0, 1, 1).data;
        out = [d[0], d[1], d[2], d[3] / 255];
      }
    }
  }
  colorCache.set(key, out);
  return out;
}

/** `color` with its alpha multiplied by `alpha` (0..1), as an rgba() string. */
function rgba(color, alpha = 1) {
  const c = parseColor(color);
  if (!c) return color;
  const a = clamp(alpha * c[3], 0, 1);
  return `rgba(${c[0]},${c[1]},${c[2]},${a.toFixed(3)})`;
}

/** Linear mix of two colours (t = 0 → a, t = 1 → b). */
function mixColor(a, b, t) {
  const ca = parseColor(a);
  const cb = parseColor(b);
  if (!ca || !cb) return t < 0.5 ? a : b;
  const k = clamp(t, 0, 1);
  return `rgba(${Math.round(ca[0] + (cb[0] - ca[0]) * k)},${Math.round(ca[1] + (cb[1] - ca[1]) * k)},${Math.round(ca[2] + (cb[2] - ca[2]) * k)},${(ca[3] + (cb[3] - ca[3]) * k).toFixed(3)})`;
}

/* ------------------------------------------------------------------ */
/* Palette: CSS custom properties → one shared, lazily refreshed object */
/* ------------------------------------------------------------------ */

const TOKEN_MAP = {
  bg0: '--bg-0', bg1: '--bg-1', bg2: '--bg-2', bg3: '--bg-3',
  line: '--line', line2: '--line-2',
  ink1: '--ink-1', ink2: '--ink-2', ink3: '--ink-3',
  brand: '--brand', accent: '--accent', gold: '--gold',
  good: '--good', warning: '--warning', serious: '--serious', critical: '--critical',
};
const TONE_ORDER = { good: 0, warning: 1, serious: 2, critical: 3 };

let paletteVersion = 0;
let paletteCache = null;
let paletteCacheVersion = -1;

/** Mark the shared palette stale (next readPalette() re-reads computed styles). */
export function invalidatePalette() {
  paletteVersion++;
}

/**
 * Read every colour token the radars use from the document's computed style.
 * Cached until invalidatePalette() is called. Never contains a hard-coded colour:
 * when a token is missing the document's own computed colour/background is used.
 */
export function readPalette(force = false) {
  if (!force && paletteCache && paletteCacheVersion === paletteVersion) return paletteCache;
  const root = document.documentElement;
  const cs = getComputedStyle(root);
  const inkFallback = cs.color || 'CanvasText';
  const bgFallback = cs.backgroundColor && cs.backgroundColor !== 'rgba(0, 0, 0, 0)' ? cs.backgroundColor : 'Canvas';
  const p = {};
  for (const [key, prop] of Object.entries(TOKEN_MAP)) {
    const v = cs.getPropertyValue(prop).trim();
    p[key] = v || (key.startsWith('bg') ? bgFallback : inkFallback);
  }
  p.fontSans = cs.getPropertyValue('--font-sans').trim() || cs.fontFamily || 'system-ui, sans-serif';
  // Canvas mono text mixes Latin codes with Arabic digits/units: prefer the mixed stack (RTL-15).
  const monoMixed = cs.getPropertyValue('--font-mono-mixed').trim();
  const mono = cs.getPropertyValue('--font-mono').trim();
  p.fontMono = monoMixed || (mono ? `${mono}, "IBM Plex Sans Arabic"` : 'ui-monospace, "IBM Plex Sans Arabic", monospace');
  p.theme = root.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
  p.light = p.theme === 'light';
  p.numerals = root.getAttribute('data-numerals') === 'arab' ? 'arab' : 'latn';
  // Direction / language drive canvas text direction and the mirrored placement of labels (v3, LTR).
  p.rtl = (root.getAttribute('dir') || (String(root.getAttribute('lang') || 'ar').startsWith('en') ? 'ltr' : 'rtl')) !== 'ltr';
  p.lang = String(root.getAttribute('lang') || 'ar').startsWith('en') ? 'en' : 'ar';
  p.tone = (name) => (name && Object.prototype.hasOwnProperty.call(TONE_ORDER, name) ? p[name] : p.accent);
  paletteCache = p;
  paletteCacheVersion = paletteVersion;
  return p;
}

/* ------------------------------------------------------------------ */
/* Text helpers (Arabic-aware truncation, wrapping, numerals)          */
/* ------------------------------------------------------------------ */

const ARABIC_DIGITS = '٠١٢٣٤٥٦٧٨٩';
function localizeDigits(str, numerals) {
  const s = String(str);
  if (numerals !== 'arab') return s;
  return s.replace(/[0-9]/g, (d) => ARABIC_DIGITS[d.charCodeAt(0) - 48]).replace(/\./g, '٫');
}
/** Compact numeric formatting for canvas value labels (0, 1.2, 12.5, 128). */
function fmtValue(v, numerals) {
  if (!isNum(v)) return '—';
  const abs = Math.abs(v);
  let s;
  if (abs >= 100) s = v.toFixed(0);
  else if (abs >= 10) s = v.toFixed(1);
  else s = v.toFixed(abs === Math.round(abs) ? 0 : 1);
  s = s.replace(/\.0$/, '');
  return localizeDigits(s, numerals);
}
/** Value + unit; a percent sign hugs the number (RTL bidi would otherwise float it away). */
function fmtValueUnit(v, unit, numerals) {
  const n = fmtValue(v, numerals);
  const u = unit == null ? '' : String(unit).trim();
  if (!u) return n;
  if (u === '%' || u === '٪') return n + (numerals === 'arab' ? '٪' : '%');
  return `${n} ${u}`;
}
function fitText(ctx, text, maxWidth) {
  const s = String(text ?? '').trim();
  if (!s || !(maxWidth > 0)) return '';
  if (ctx.measureText(s).width <= maxWidth) return s;
  const ell = '…';
  let lo = 0;
  let hi = s.length;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (ctx.measureText(s.slice(0, mid).trimEnd() + ell).width <= maxWidth) lo = mid;
    else hi = mid - 1;
  }
  return lo === 0 ? ell : s.slice(0, lo).trimEnd() + ell;
}
function wrapText(ctx, text, maxWidth, maxLines = 2) {
  const words = String(text ?? '').trim().split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const lines = [];
  let cur = '';
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    const probe = cur ? `${cur} ${w}` : w;
    if (!cur || ctx.measureText(probe).width <= maxWidth) {
      cur = probe;
      continue;
    }
    lines.push(cur);
    cur = w;
    if (lines.length === maxLines - 1) {
      cur = words.slice(i).join(' ');
      break;
    }
  }
  lines.push(cur);
  return lines.map((l) => fitText(ctx, l, maxWidth));
}
/**
 * Wrap `text` into at most `maxLines` lines that ALL fit `maxWidth` without truncation.
 * Returns null when it cannot (the caller then drops the label instead of showing "…").
 */
function wrapNoEllipsis(ctx, text, maxWidth, maxLines = 2) {
  const words = String(text ?? '').trim().split(/\s+/).filter(Boolean);
  if (!words.length || !(maxWidth > 0)) return null;
  const lines = [];
  let cur = '';
  for (const w of words) {
    if (ctx.measureText(w).width > maxWidth) return null;
    const probe = cur ? `${cur} ${w}` : w;
    if (ctx.measureText(probe).width <= maxWidth) { cur = probe; continue; }
    lines.push(cur);
    cur = w;
    if (lines.length >= maxLines) return null;
  }
  if (cur) lines.push(cur);
  return lines.length <= maxLines ? lines : null;
}

/** Coarse occupancy grid for label placement (one byte per 6×6 px cell). */
class Occupancy {
  constructor(w, h, cell = 6) {
    this.cell = cell;
    this.w = w;
    this.h = h;
    this.cols = Math.max(1, Math.ceil(w / cell));
    this.rows = Math.max(1, Math.ceil(h / cell));
    this.bits = new Uint8Array(this.cols * this.rows);
  }
  reset(w, h) {
    if (w !== this.w || h !== this.h) {
      this.w = w; this.h = h;
      this.cols = Math.max(1, Math.ceil(w / this.cell));
      this.rows = Math.max(1, Math.ceil(h / this.cell));
      this.bits = new Uint8Array(this.cols * this.rows);
    } else this.bits.fill(0);
    return this;
  }
  _range(x, y, w, h) {
    return [
      clamp(Math.floor(x / this.cell), 0, this.cols - 1), clamp(Math.floor(y / this.cell), 0, this.rows - 1),
      clamp(Math.ceil((x + w) / this.cell) - 1, 0, this.cols - 1), clamp(Math.ceil((y + h) / this.cell) - 1, 0, this.rows - 1),
    ];
  }
  /** True when the rectangle lies inside the canvas and overlaps nothing taken so far. */
  free(x, y, w, h) {
    if (x < 0 || y < 0 || x + w > this.w || y + h > this.h) return false;
    const [c0, r0, c1, r1] = this._range(x, y, w, h);
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) if (this.bits[r * this.cols + c]) return false;
    return true;
  }
  take(x, y, w, h) {
    const [c0, r0, c1, r1] = this._range(x, y, w, h);
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) this.bits[r * this.cols + c] = 1;
  }
}

/** Hazard pill text: the hazard label only — a leading "CODE — " prefix is dropped (the code is in the tooltip). */
function hazardLabelText(hz) {
  const direct = hz && (hz.hazard || hz.title);
  if (direct) return String(direct).trim();
  const raw = String((hz && hz.label) || '').trim();
  const m = /^[A-Za-z][A-Za-z0-9]*(?:[-‑][A-Za-z0-9]+)*\s*[—–-]\s*(.+)$/.exec(raw);
  return (m ? m[1] : raw).trim();
}

/** Offsets (dx, dy, weighted distance) around a hazard dot, nearest first: the fallback search for a free pill spot. */
const PILL_LATTICE = (() => {
  const out = [];
  for (let dy = -120; dy <= 120; dy += 6) for (let dx = -170; dx <= 170; dx += 6) out.push([dx, dy, Math.hypot(dx * 0.7, dy)]);
  return out.sort((a, b) => a[2] - b[2]);
})();

/** Rounded-rectangle path (used for label pills). */
function roundRect(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.lineTo(x + w - rr, y);
  ctx.arcTo(x + w, y, x + w, y + rr, rr);
  ctx.lineTo(x + w, y + h - rr);
  ctx.arcTo(x + w, y + h, x + w - rr, y + h, rr);
  ctx.lineTo(x + rr, y + h);
  ctx.arcTo(x, y + h, x, y + h - rr, rr);
  ctx.lineTo(x, y + rr);
  ctx.arcTo(x, y, x + rr, y, rr);
  ctx.closePath();
}

/* ------------------------------------------------------------------ */
/* Shared drawing primitives (visual DNA common to every radar)        */
/* ------------------------------------------------------------------ */

/** Small isometric cube emblem (gold edges, accent-tinted faces) — the Biltix mark. */
function drawIsoCube(ctx, cx, cy, s, p) {
  const hx = s * 0.866;
  const hy = s * 0.5;
  ctx.fillStyle = rgba(p.accent, p.light ? 0.08 : 0.12);
  ctx.beginPath();
  ctx.arc(cx, cy, s * 2.2, 0, TAU);
  ctx.fill();
  const face = (pts, tint) => {
    ctx.beginPath();
    for (let i = 0; i < pts.length; i++) {
      const [x, y] = pts[i];
      if (i === 0) ctx.moveTo(cx + x, cy + y);
      else ctx.lineTo(cx + x, cy + y);
    }
    ctx.closePath();
    ctx.fillStyle = p.bg1;
    ctx.fill();
    ctx.fillStyle = tint;
    ctx.fill();
    ctx.lineWidth = 1;
    ctx.strokeStyle = rgba(p.gold, 0.9);
    ctx.stroke();
  };
  face([[-hx, -hy], [0, 0], [0, s], [-hx, hy]], rgba(p.accent, 0.16));
  face([[hx, -hy], [0, 0], [0, s], [hx, hy]], rgba(p.accent, 0.08));
  face([[0, -s], [hx, -hy], [0, 0], [-hx, -hy]], rgba(p.accent, 0.32));
}

/** CAD corner brackets, drawn only when the canvas is not inside a .radar-frame (which draws its own). */
function drawCornerTicks(ctx, w, h, p) {
  const inset = 10;
  const len = 10;
  ctx.strokeStyle = rgba(p.line2, 0.95);
  ctx.lineWidth = 1;
  ctx.beginPath();
  const corners = [
    [inset, inset, 1, 1], [w - inset, inset, -1, 1],
    [inset, h - inset, 1, -1], [w - inset, h - inset, -1, -1],
  ];
  for (const [x, y, sx, sy] of corners) {
    ctx.moveTo(x + sx * len, y + 0.5 * sy);
    ctx.lineTo(x + 0.5 * sx, y + 0.5 * sy);
    ctx.lineTo(x + 0.5 * sx, y + sy * len);
  }
  ctx.stroke();
}

/** Concentric hairline rings; the outer one is slightly stronger. */
function drawRings(ctx, cx, cy, R, fractions, p) {
  ctx.lineWidth = 1;
  for (let i = 0; i < fractions.length; i++) {
    const f = fractions[i];
    ctx.beginPath();
    ctx.arc(cx, cy, R * f, 0, TAU);
    ctx.strokeStyle = f >= 0.999 ? p.line2 : rgba(p.line, 0.95);
    ctx.stroke();
  }
}

/** Fills a fading wedge whose leading edge is at angle 0 of the current transform. */
function fillFadingWedge(ctx, R, spanDeg, color, alphaMax, cache, key) {
  const span = spanDeg * DEG;
  if (typeof ctx.createConicGradient === 'function') {
    let g = cache[key];
    if (!g) {
      g = ctx.createConicGradient(-span, 0, 0);
      const f = span / TAU;
      g.addColorStop(0, rgba(color, 0));
      g.addColorStop(f * 0.45, rgba(color, alphaMax * 0.12));
      g.addColorStop(f * 0.82, rgba(color, alphaMax * 0.48));
      g.addColorStop(f, rgba(color, alphaMax));
      g.addColorStop(Math.min(1, f + 0.0004), rgba(color, 0));
      g.addColorStop(1, rgba(color, 0));
      cache[key] = g;
    }
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, R, -span, 0.0006);
    ctx.closePath();
    ctx.fill();
    return;
  }
  // Fallback: stepped slices for engines without conic gradients.
  const slices = 28;
  for (let i = 0; i < slices; i++) {
    const a0 = -span + (span * i) / slices;
    const a1 = -span + (span * (i + 1)) / slices + 0.002;
    const k = (i + 1) / slices;
    ctx.fillStyle = rgba(color, alphaMax * k * k);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, R, a0, a1);
    ctx.closePath();
    ctx.fill();
  }
}

/** Upright multi-line label block anchored on a polar tip; returns the lines drawn. */
function drawTipLabel(ctx, ax, ay, hx, vy, lines, lineH, styles) {
  const align = hx > 0.3 ? 'left' : hx < -0.3 ? 'right' : 'center';
  const x = ax + (align === 'center' ? 0 : hx * 3);
  const blockH = lines.length * lineH;
  const top = ay - blockH / 2 + vy * (blockH / 2);
  ctx.textAlign = align;
  ctx.textBaseline = 'top';
  for (let i = 0; i < lines.length; i++) {
    const st = styles[Math.min(i, styles.length - 1)];
    ctx.font = st.font;
    ctx.fillStyle = st.color;
    ctx.fillText(lines[i], x, top + i * lineH);
  }
  return { align, x, top, blockH };
}

/* ------------------------------------------------------------------ */
/* radarLoop — the single shared animation loop                        */
/* ------------------------------------------------------------------ */

const loop = {
  radars: new Set(),
  owners: new WeakMap(), // canvas → radar (IntersectionObserver lookups)
  raf: 0,
  running: false,
  paused: false,
  hidden: typeof document !== 'undefined' && document.hidden,
  last: 0,
  fps: 0,
  reduced: false,
  reducedAccum: 0,
  attached: false,
  mq: null,
  mo: null,
  io: null,
};

function computeReduced() {
  const attr = document.documentElement.getAttribute('data-motion');
  if (attr === 'reduce' || attr === 'reduced') return true;
  if (attr === 'full') return false;
  return !!(loop.mq && loop.mq.matches);
}
function applyReduced(force = false) {
  const r = computeReduced();
  if (r === loop.reduced && !force) return;
  loop.reduced = r;
  for (const radar of loop.radars) {
    if (radar.reduced !== r) {
      radar.reduced = r;
      if (typeof radar.onReducedChange === 'function') {
        try { radar.onReducedChange(r); } catch (err) { reportError('onReducedChange', err); }
      }
    }
  }
}
function reportError(where, err) {
  try { console.error(`[biltix-hse] radar ${where} failed:`, err); } catch { /* noop */ }
}
function shouldRun() {
  return loop.radars.size > 0 && !loop.paused && !loop.hidden;
}
function schedule() {
  if (loop.raf || !shouldRun()) return;
  loop.running = true;
  loop.raf = requestAnimationFrame(tick);
}
function tick(ts) {
  loop.raf = 0;
  if (!shouldRun()) {
    loop.running = false;
    loop.last = 0;
    return;
  }
  let dt = loop.last ? (ts - loop.last) / 1000 : 1 / 60;
  loop.last = ts;
  if (dt > MAX_DT) dt = MAX_DT;
  // Reduced motion: slow breathing only → ~30 fps is plenty, halves the work.
  if (loop.reduced) {
    loop.reducedAccum += dt;
    if (loop.reducedAccum < 1 / REDUCED_FPS - 0.002) {
      schedule();
      return;
    }
    dt = loop.reducedAccum;
    loop.reducedAccum = 0;
  }
  if (dt > 0) {
    const inst = 1 / dt;
    loop.fps = loop.fps ? loop.fps + (inst - loop.fps) * 0.08 : inst;
  }
  for (const radar of loop.radars) {
    try {
      radar._frame(ts, dt);
    } catch (err) {
      reportError('frame', err);
    }
  }
  schedule();
}
function onVisibility() {
  loop.hidden = document.hidden;
  if (loop.hidden) {
    if (loop.raf) cancelAnimationFrame(loop.raf);
    loop.raf = 0;
    loop.running = false;
  } else {
    loop.last = 0;
    schedule();
  }
}
function onRootMutation() {
  invalidatePalette();
  applyReduced();
  for (const radar of loop.radars) {
    if (typeof radar.refreshPalette === 'function') radar.refreshPalette();
  }
}
function onIntersect(entries) {
  for (const e of entries) {
    const radar = loop.owners.get(e.target);
    if (radar) radar.inView = e.isIntersecting;
  }
}
function attachGlobals() {
  if (loop.attached || typeof document === 'undefined') return;
  loop.attached = true;
  loop.hidden = document.hidden;
  try {
    loop.mq = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
    if (loop.mq) {
      if (loop.mq.addEventListener) loop.mq.addEventListener('change', applyReducedEvent);
      else if (loop.mq.addListener) loop.mq.addListener(applyReducedEvent);
    }
  } catch { loop.mq = null; }
  document.addEventListener('visibilitychange', onVisibility);
  try {
    loop.mo = new MutationObserver(onRootMutation);
    loop.mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'data-motion', 'data-numerals', 'style', 'lang', 'dir'] });
  } catch { loop.mo = null; }
  try {
    loop.io = 'IntersectionObserver' in window ? new IntersectionObserver(onIntersect, { threshold: 0 }) : null;
  } catch { loop.io = null; }
  applyReduced(true);
}
function applyReducedEvent() { applyReduced(); }
function detachGlobals() {
  if (!loop.attached) return;
  loop.attached = false;
  if (loop.mq) {
    if (loop.mq.removeEventListener) loop.mq.removeEventListener('change', applyReducedEvent);
    else if (loop.mq.removeListener) loop.mq.removeListener(applyReducedEvent);
  }
  loop.mq = null;
  document.removeEventListener('visibilitychange', onVisibility);
  if (loop.mo) loop.mo.disconnect();
  loop.mo = null;
  if (loop.io) loop.io.disconnect();
  loop.io = null;
  if (loop.raf) cancelAnimationFrame(loop.raf);
  loop.raf = 0;
  loop.running = false;
  loop.last = 0;
  loop.fps = 0;
}

export const radarLoop = {
  /** Register a radar (anything with `_frame(ts, dt)`); starts the loop when needed. */
  add(radar) {
    if (!radar || typeof radar._frame !== 'function') return radarLoop;
    attachGlobals();
    loop.radars.add(radar);
    radar.reduced = loop.reduced;
    if (loop.io && radar.canvas) {
      loop.owners.set(radar.canvas, radar);
      loop.io.observe(radar.canvas);
    }
    schedule();
    return radarLoop;
  },
  remove(radar) {
    if (!radar) return radarLoop;
    loop.radars.delete(radar);
    if (loop.io && radar.canvas) {
      loop.io.unobserve(radar.canvas);
      loop.owners.delete(radar.canvas);
    }
    if (loop.radars.size === 0) detachGlobals();
    return radarLoop;
  },
  /** Freeze every radar (the current frame stays on screen). */
  pause() {
    loop.paused = true;
    if (loop.raf) cancelAnimationFrame(loop.raf);
    loop.raf = 0;
    loop.running = false;
    loop.last = 0;
    return radarLoop;
  },
  resume() {
    loop.paused = false;
    loop.last = 0;
    schedule();
    return radarLoop;
  },
  /** Smoothed frames per second (0 while idle). */
  fps() {
    return loop.running ? Math.round(loop.fps) : 0;
  },
  /** True while frames are actually being produced. */
  isActive() {
    return loop.running && shouldRun();
  },
  isPaused() {
    return loop.paused;
  },
  isReduced() {
    if (!loop.attached) {
      try { return computeReduced() || !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches && document.documentElement.getAttribute('data-motion') !== 'full'); } catch { return false; }
    }
    return loop.reduced;
  },
  count() {
    return loop.radars.size;
  },
};

/* ------------------------------------------------------------------ */
/* RadarBase                                                           */
/* ------------------------------------------------------------------ */

export class RadarBase {
  static defaults = {
    aspect: 0,          // >0 forces height = width / aspect; 0 follows the parent box
    fallbackSize: 320,  // used only when the parent has no measurable size yet
    ariaLabel: '',
    onHover: null,      // (item|null, info|null) => void
    onClick: null,      // (item, info) => void
    hitRadius: HIT_RADIUS,
  };

  /**
   * @param {HTMLCanvasElement} canvas
   * @param {object} opts  see each subclass' `defaults`
   */
  constructor(canvas, opts = {}) {
    if (!canvas || typeof canvas.getContext !== 'function') {
      throw new TypeError('[biltix-hse] radar: a <canvas> element is required');
    }
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.opts = { ...RadarBase.defaults, ...(this.constructor.defaults || {}), ...opts };
    this.width = 0;
    this.height = 0;
    this.dpr = 1;
    this.palette = null;
    this.reduced = false;
    this.running = false;
    this.destroyed = false;
    this.inView = true;
    this.time = 0;
    this.frames = 0;
    this.data = null;
    this.hover = null;
    this._hoverFn = typeof this.opts.onHover === 'function' ? this.opts.onHover : null;
    this._clickFn = typeof this.opts.onClick === 'function' ? this.opts.onClick : null;
    this._pointer = null;
    this._targets = [];
    this._ro = null;
    this._resizeRaf = 0;
    this._unsubs = [];
    this._cursor = '';
    this._dprCheck = 0;
    this._onPointerMove = this._onPointerMove.bind(this);
    this._onPointerLeave = this._onPointerLeave.bind(this);
    this._onPointerDown = this._onPointerDown.bind(this);
    this._onThemeEvent = this._onThemeEvent.bind(this);
    this._onWindowResize = this._onWindowResize.bind(this);
  }

  /* ---- lifecycle -------------------------------------------------- */

  start() {
    if (this.destroyed || this.running) return this;
    this.running = true;
    this.palette = readPalette();
    this.reduced = radarLoop.isReduced();
    this._attachDom();
    this._unsubs.push(bus.on('theme:change', this._onThemeEvent));
    this._unsubs.push(bus.on('settings:change', this._onThemeEvent));
    this.resize();
    radarLoop.add(this);
    this.render(0); // paint synchronously so the canvas is never blank before the first RAF
    return this;
  }

  stop() {
    if (!this.running) return this;
    this.running = false;
    radarLoop.remove(this);
    this._detachDom();
    for (const un of this._unsubs) {
      try { un(); } catch { /* noop */ }
    }
    this._unsubs.length = 0;
    return this;
  }

  destroy() {
    this.stop();
    if (!this.destroyed) {
      this.destroyed = true;
      try {
        if (this.ctx && this.width && this.height) {
          this.ctx.setTransform(1, 0, 0, 1, 0, 0);
          this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        }
      } catch { /* noop */ }
      this._targets.length = 0;
      this._pointer = null;
      this.hover = null;
      this._hoverFn = null;
      this._clickFn = null;
      this.data = null;
    }
    return this;
  }

  /** Replace the static dataset (used when no getter is configured, or as the latest snapshot). */
  setData(data) {
    this.data = data;
    this._lastPoll = -1;
    this.onData(data);
    if (this.running && !radarLoop.isActive()) this.render(0);
    return this;
  }

  /** Merge option changes at runtime (e.g. new zones, a different sweep speed). */
  setOptions(patch = {}) {
    Object.assign(this.opts, patch);
    if ('onHover' in patch) this._hoverFn = typeof patch.onHover === 'function' ? patch.onHover : null;
    if ('onClick' in patch) this._clickFn = typeof patch.onClick === 'function' ? patch.onClick : null;
    this._lastPoll = -1;
    this.onOptions(patch);
    if (this.running && !radarLoop.isActive()) this.render(0);
    return this;
  }

  setHoverHandler(fn) {
    this._hoverFn = typeof fn === 'function' ? fn : null;
    return this;
  }

  setClickHandler(fn) {
    this._clickFn = typeof fn === 'function' ? fn : null;
    return this;
  }

  /** Measure the parent box and resize the backing store (dpr-aware). */
  resize() {
    if (this.destroyed) return this;
    const canvas = this.canvas;
    const parent = canvas.parentElement;
    let w = 0;
    let h = 0;
    if (parent) {
      const rect = parent.getBoundingClientRect();
      const cs = getComputedStyle(parent);
      w = rect.width - num(parseFloat(cs.paddingLeft)) - num(parseFloat(cs.paddingRight)) - num(parseFloat(cs.borderLeftWidth)) - num(parseFloat(cs.borderRightWidth));
      h = rect.height - num(parseFloat(cs.paddingTop)) - num(parseFloat(cs.paddingBottom)) - num(parseFloat(cs.borderTopWidth)) - num(parseFloat(cs.borderBottomWidth));
    }
    if (!(w > 0)) w = canvas.clientWidth || this.opts.fallbackSize;
    if (this.opts.aspect > 0) h = w / this.opts.aspect;
    else if (!(h > 0)) h = canvas.clientHeight || w;
    w = Math.max(1, Math.round(w));
    h = Math.max(1, Math.round(h));
    const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
    if (w === this.width && h === this.height && dpr === this.dpr) return this;
    this.width = w;
    this.height = h;
    this.dpr = dpr;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    this.onResize(w, h);
    if (this.running && !radarLoop.isActive()) this.render(0);
    return this;
  }

  /** Re-read CSS custom properties (called on theme/settings change). */
  refreshPalette() {
    if (this.destroyed) return this;
    this.palette = readPalette();
    this.onPalette(this.palette);
    if (this.running && !radarLoop.isActive()) this.render(0);
    return this;
  }

  /* ---- hooks for subclasses -------------------------------------- */

  /** @abstract draw(ctx, timeSeconds, dtSeconds) */
  draw() {}
  onResize() {}
  onPalette() {}
  onData() {}
  onOptions() {}
  onReducedChange() {}

  /** Register a hover/click target for this frame (canvas CSS px). */
  addHit(x, y, data, r = this.opts.hitRadius) {
    this._targets.push({ x, y, r, data });
  }

  /* ---- internals -------------------------------------------------- */

  _frame(ts, dt) {
    if (!this.running || this.destroyed) return;
    this.time += dt;
    if (++this._dprCheck >= 60) {
      this._dprCheck = 0;
      if (Math.min(window.devicePixelRatio || 1, MAX_DPR) !== this.dpr) this.resize();
    }
    if (!this.inView && this.frames > 0) return; // off-screen: keep time, skip painting
    this.render(dt);
  }

  render(dt = 0) {
    const ctx = this.ctx;
    const w = this.width;
    const h = this.height;
    if (!ctx || w < 2 || h < 2) return;
    if (!this.palette) this.palette = readPalette();
    this._targets.length = 0;
    ctx.save();
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    ctx.direction = this.palette.rtl === false ? 'ltr' : 'rtl';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.globalAlpha = 1;
    ctx.shadowBlur = 0;
    try {
      this.draw(ctx, this.time, dt);
    } finally {
      ctx.restore();
    }
    this.frames++;
    if (this._pointer) this._updateHover();
  }

  _attachDom() {
    const c = this.canvas;
    if (this.opts.ariaLabel && !c.hasAttribute('aria-label')) c.setAttribute('aria-label', this.opts.ariaLabel);
    if (!c.hasAttribute('role')) c.setAttribute('role', 'img');
    c.addEventListener('pointermove', this._onPointerMove, { passive: true });
    c.addEventListener('pointerdown', this._onPointerDown, { passive: true });
    c.addEventListener('pointerleave', this._onPointerLeave, { passive: true });
    c.addEventListener('pointercancel', this._onPointerLeave, { passive: true });
    if ('ResizeObserver' in window) {
      this._ro = new ResizeObserver(() => {
        // Defer to the next frame so a resize never re-enters the observer's own delivery.
        if (this._resizeRaf) return;
        this._resizeRaf = requestAnimationFrame(() => {
          this._resizeRaf = 0;
          this.resize();
        });
      });
      this._ro.observe(c.parentElement || c);
    } else {
      window.addEventListener('resize', this._onWindowResize);
    }
  }

  _detachDom() {
    const c = this.canvas;
    c.removeEventListener('pointermove', this._onPointerMove);
    c.removeEventListener('pointerdown', this._onPointerDown);
    c.removeEventListener('pointerleave', this._onPointerLeave);
    c.removeEventListener('pointercancel', this._onPointerLeave);
    if (this._ro) this._ro.disconnect();
    this._ro = null;
    if (this._resizeRaf) cancelAnimationFrame(this._resizeRaf);
    this._resizeRaf = 0;
    window.removeEventListener('resize', this._onWindowResize);
    if (this._cursor) {
      c.style.cursor = '';
      this._cursor = '';
    }
  }

  _onWindowResize() {
    this.resize();
  }

  _onThemeEvent() {
    invalidatePalette();
    // The theme attribute may be applied by another listener of the same event; read after it.
    queueMicrotask(() => this.refreshPalette());
  }

  _onPointerMove(e) {
    const rect = this.canvas.getBoundingClientRect();
    this._pointer = { x: e.clientX - rect.left, y: e.clientY - rect.top, clientX: e.clientX, clientY: e.clientY };
    this._updateHover();
  }

  _onPointerLeave() {
    this._pointer = null;
    this._updateHover();
  }

  _onPointerDown(e) {
    if (!this._clickFn) return;
    const rect = this.canvas.getBoundingClientRect();
    const pt = { x: e.clientX - rect.left, y: e.clientY - rect.top, clientX: e.clientX, clientY: e.clientY };
    const t = this._nearestTarget(pt);
    if (t) {
      try { this._clickFn(t.data, this._hoverInfo(t, pt)); } catch (err) { reportError('onClick', err); }
    }
  }

  _nearestTarget(pt) {
    let best = null;
    let bestD = Infinity;
    for (const t of this._targets) {
      const d = Math.hypot(t.x - pt.x, t.y - pt.y);
      if (d <= t.r && d < bestD) {
        best = t;
        bestD = d;
      }
    }
    return best;
  }

  _hoverInfo(target, pt) {
    const rect = this.canvas.getBoundingClientRect();
    const lx = target ? target.x : pt ? pt.x : 0;
    const ly = target ? target.y : pt ? pt.y : 0;
    return {
      x: lx,
      y: ly,
      localX: lx,
      localY: ly,
      clientX: rect.left + lx,
      clientY: rect.top + ly,
      pointerX: pt ? pt.clientX : rect.left + lx,
      pointerY: pt ? pt.clientY : rect.top + ly,
      canvas: this.canvas,
    };
  }

  _updateHover() {
    const pt = this._pointer;
    const t = pt ? this._nearestTarget(pt) : null;
    const data = t ? t.data : null;
    const cursor = data ? 'pointer' : '';
    if (cursor !== this._cursor) {
      this._cursor = cursor;
      this.canvas.style.cursor = cursor;
    }
    if (sameItem(data, this.hover)) {
      this.hover = data; // keep the freshest object for the same item
      return;
    }
    this.hover = data;
    // Targets flagged `silent` (e.g. zone name reveal) only change the internal hover state.
    const pub = data && data.silent ? null : data;
    if (this._hoverFn && !sameItem(pub, this._hoverPublic || null)) {
      this._hoverPublic = pub;
      try { this._hoverFn(pub, pt && pub ? this._hoverInfo(t, pt) : (pt ? this._hoverInfo(null, pt) : null)); } catch (err) { reportError('onHover', err); }
    }
  }
}

/* ------------------------------------------------------------------ */
/* SweepRadar                                                          */
/* ------------------------------------------------------------------ */

const BLIP_SIZE = { good: 3.4, warning: 3.9, serious: 4.5, critical: 5.2 };

export class SweepRadar extends RadarBase {
  static defaults = {
    rings: 4,
    sectors: 12,
    sectorLabels: [],
    sweepDegPerSec: 22,
    getBlips: null,        // () => Blip[]  {id, code, label, angle, r, tone, size?, kind?}
    showLabels: true,
    pollMs: 250,
    sweepSpan: 70,         // degrees of the bright wedge
    afterglowSpan: 150,    // degrees of the long, faint trail
    startAngle: 0,
    degreeTicks: true,
    cornerTicks: true,
    emblem: true,
  };

  constructor(canvas, opts) {
    super(canvas, opts);
    this._states = new Map(); // id → per-blip animation state
    this._pings = [];
    this._sweep = norm360(num(this.opts.startAngle));
    this._lastPoll = -1;
    this._geo = null;
    this._labels = null;
    this._grads = {};
  }

  onResize() { this._geo = null; this._labels = null; }
  onPalette() { this._grads = {}; this._labels = null; }
  onOptions() { this._geo = null; this._labels = null; this._grads = {}; }

  /** Current sweep angle in degrees (0 = north, clockwise). */
  get sweepAngle() { return this._sweep; }

  _layout() {
    const w = this.width;
    const h = this.height;
    const o = this.opts;
    const minSide = Math.min(w, h);
    const labelPx = minSide >= 460 ? 11 : minSide >= 340 ? 10 : 9;
    const hasLabels = Array.isArray(o.sectorLabels) && o.sectorLabels.some(Boolean);
    const showLabels = !!o.showLabels && hasLabels && minSide >= 260;
    const margin = showLabels ? 12 + labelPx + 9 : 12;
    const R = Math.max(12, minSide / 2 - margin);
    this._geo = { R, labelR: R + 9 + labelPx / 2, labelPx, showLabels, minSide, cx: w / 2, cy: h / 2 };
    return this._geo;
  }

  _poll(t) {
    const o = this.opts;
    let list = null;
    try {
      if (typeof o.getBlips === 'function') list = o.getBlips();
      else if (Array.isArray(this.data)) list = this.data;
      else if (this.data && Array.isArray(this.data.blips)) list = this.data.blips;
    } catch (err) {
      reportError('getBlips', err);
    }
    if (!Array.isArray(list)) list = [];
    const seen = new Set();
    for (let i = 0; i < list.length; i++) {
      const b = list[i];
      if (!b) continue;
      const id = b.id ?? b.code ?? `#${i}`;
      seen.add(id);
      let st = this._states.get(id);
      if (!st) {
        st = { id, x: NaN, y: NaN, bornAt: t, litAt: -Infinity, goneAt: 0, phase: hash01(id) * TAU };
        this._states.set(id, st);
      }
      st.goneAt = 0;
      st.blip = b;
      st.angle = norm360(num(b.angle));
      st.r = clamp(num(b.r, 0.5), 0, 1);
      st.tone = b.tone;
      st.hollow = b.kind === 'detection' || b.hollow === true;
      st.size = clamp(num(b.size, 1), 0.6, 1.8);
    }
    for (const st of this._states.values()) {
      if (!seen.has(st.id) && !st.goneAt) st.goneAt = t;
    }
  }

  _detect(prev, cur, t, R, cx, cy) {
    for (const st of this._states.values()) {
      if (st.goneAt) continue;
      if (passedAngle(prev, cur, st.angle)) {
        st.litAt = t;
        const [x, y] = polar(cx, cy, st.angle, st.r * R);
        const big = st.tone === 'critical' || st.tone === 'serious';
        this._pings.push({ x, y, t0: t, tone: st.tone, big, r0: (BLIP_SIZE[st.tone] || 4) * st.size });
        if (st.tone === 'critical') this._pings.push({ x, y, t0: t + 0.22, tone: st.tone, big, r0: (BLIP_SIZE[st.tone] || 4) * st.size });
      }
    }
    if (this._pings.length > 80) this._pings.splice(0, this._pings.length - 80);
  }

  draw(ctx, t, dt) {
    const p = this.palette;
    const o = this.opts;
    const w = this.width;
    const h = this.height;
    const g = this._geo || this._layout();
    const { R, cx, cy } = g;
    const sectors = Math.max(1, o.sectors | 0);
    const rings = Math.max(1, o.rings | 0);
    const inner = clamp(R * 0.07, 9, 16);
    const step = 360 / sectors;

    if (this._lastPoll < 0 || t - this._lastPoll >= o.pollMs / 1000) {
      this._lastPoll = t;
      this._poll(t);
    }

    /* plate: faint disc + alternating sector fills */
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, TAU);
    ctx.fillStyle = rgba(p.ink1, p.light ? 0.012 : 0.016);
    ctx.fill();
    ctx.fillStyle = rgba(p.ink1, p.light ? 0.022 : 0.028);
    for (let i = 0; i < sectors; i += 2) {
      const a0 = (i * step - 90) * DEG;
      const a1 = ((i + 1) * step - 90) * DEG;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, R, a0, a1);
      ctx.closePath();
      ctx.fill();
    }

    /* rings */
    const fr = [];
    for (let i = 1; i <= rings; i++) fr.push(i / rings);
    drawRings(ctx, cx, cy, R, fr, p);

    /* spokes */
    ctx.lineWidth = 1;
    ctx.strokeStyle = rgba(p.line, 0.95);
    ctx.beginPath();
    for (let i = 0; i < sectors; i++) {
      const [x0, y0] = polar(cx, cy, i * step, inner + 4);
      const [x1, y1] = polar(cx, cy, i * step, R);
      ctx.moveTo(x0, y0);
      ctx.lineTo(x1, y1);
    }
    ctx.stroke();

    /* rim degree ticks */
    if (o.degreeTicks) {
      ctx.strokeStyle = rgba(p.line2, 0.95);
      ctx.beginPath();
      for (let d = 0; d < 360; d += 10) {
        const cardinal = d % 90 === 0;
        const major = d % 30 === 0;
        const len = cardinal ? 7 : major ? 4.5 : 2.5;
        const [x0, y0] = polar(cx, cy, d, R - len);
        const [x1, y1] = polar(cx, cy, d, R - 0.5);
        ctx.moveTo(x0, y0);
        ctx.lineTo(x1, y1);
      }
      ctx.stroke();
      // cardinal carets just outside the rim
      ctx.fillStyle = rgba(p.ink3, 0.9);
      for (let d = 0; d < 360; d += 90) {
        const [x, y] = polar(cx, cy, d, R + 3.5);
        ctx.beginPath();
        ctx.arc(x, y, 1.3, 0, TAU);
        ctx.fill();
      }
    }

    /* rim labels (tangential, upright on both halves) */
    if (g.showLabels) this._drawRimLabels(ctx, g, sectors, step);

    /* sweep */
    if (!this.reduced) {
      const prev = this._sweep;
      this._sweep = norm360(prev + num(o.sweepDegPerSec, 22) * dt);
      if (dt > 0) this._detect(prev, this._sweep, t, R, cx, cy);
      const lead = this._sweep * DEG - Math.PI / 2;
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(lead);
      fillFadingWedge(ctx, R, num(o.afterglowSpan, 150), p.accent, p.light ? 0.07 : 0.1, this._grads, 'after');
      fillFadingWedge(ctx, R, num(o.sweepSpan, 70), p.accent, p.light ? 0.26 : 0.4, this._grads, 'sweep');
      ctx.shadowColor = rgba(p.accent, 0.9);
      ctx.shadowBlur = 10;
      ctx.strokeStyle = rgba(p.accent, 0.95);
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(inner * 0.6, 0);
      ctx.lineTo(R, 0);
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.fillStyle = p.accent;
      ctx.beginPath();
      ctx.arc(R, 0, 2.2, 0, TAU);
      ctx.fill();
      ctx.restore();
    }

    /* pings */
    if (this._pings.length) {
      const keep = [];
      for (const pg of this._pings) {
        const age = t - pg.t0;
        const life = pg.big ? 1.5 : 1.15;
        if (age > life) continue;
        keep.push(pg);
        if (age < 0) continue;
        const k = clamp(age / life, 0, 1);
        const r = pg.r0 + easeOutCubic(k) * (pg.big ? 30 : 20);
        ctx.strokeStyle = rgba(p.tone(pg.tone), (1 - k) * 0.7);
        ctx.lineWidth = 1.6 * (1 - k) + 0.4;
        ctx.beginPath();
        ctx.arc(pg.x, pg.y, r, 0, TAU);
        ctx.stroke();
      }
      this._pings = keep;
    }

    /* blips (drawn low→high tone so critical sits on top) */
    const states = Array.from(this._states.values());
    states.sort((a, b) => (TONE_ORDER[a.tone] ?? -1) - (TONE_ORDER[b.tone] ?? -1));
    const k = easeK(0.18, dt);
    for (const st of states) {
      const [tx, ty] = polar(cx, cy, st.angle, st.r * R);
      if (Number.isNaN(st.x)) { st.x = tx; st.y = ty; } else { st.x += (tx - st.x) * k; st.y += (ty - st.y) * k; }
      let alpha = 1;
      let scale = 1;
      if (st.goneAt) {
        const f = (t - st.goneAt) / 0.4;
        if (f >= 1) { this._states.delete(st.id); continue; }
        alpha = 1 - f;
        scale = 1 - 0.4 * f;
      } else {
        const f = clamp((t - st.bornAt) / 0.55, 0, 1);
        scale = f < 1 ? Math.max(0.01, easeOutBack(f)) : 1;
      }
      if (this.reduced) alpha *= 0.85 + 0.15 * Math.sin((t * TAU) / 3 + st.phase);
      const color = p.tone(st.tone);
      const size = (BLIP_SIZE[st.tone] || 4) * st.size * scale;
      const lit = this.reduced ? 0 : clamp(1 - (t - st.litAt) / 2.8, 0, 1);
      const hovered = this.hover && sameItem(this.hover, st.blip);

      ctx.globalAlpha = alpha;
      ctx.shadowColor = rgba(color, 0.55 + 0.4 * lit);
      ctx.shadowBlur = 6 + 12 * lit + (hovered ? 6 : 0);
      ctx.beginPath();
      ctx.arc(st.x, st.y, size + lit * 0.8, 0, TAU);
      if (st.hollow) {
        ctx.fillStyle = p.bg1;
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = color;
        ctx.stroke();
      } else {
        ctx.fillStyle = color;
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.lineWidth = 2;
        ctx.strokeStyle = p.bg1;
        ctx.beginPath();
        ctx.arc(st.x, st.y, size + lit * 0.8 + 1, 0, TAU);
        ctx.stroke();
      }
      if (lit > 0) {
        ctx.strokeStyle = rgba(color, 0.5 * lit);
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(st.x, st.y, size + 4 + (1 - lit) * 3, 0, TAU);
        ctx.stroke();
      }
      if (hovered) {
        ctx.strokeStyle = rgba(p.ink1, 0.9);
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(st.x, st.y, size + 6, 0, TAU);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      if (!st.goneAt) this.addHit(st.x, st.y, st.blip, Math.max(o.hitRadius, size + 4));
    }

    /* center emblem */
    if (o.emblem) drawIsoCube(ctx, cx, cy, clamp(R * 0.045, 6, 11), p);
    else {
      ctx.fillStyle = p.accent;
      ctx.beginPath();
      ctx.arc(cx, cy, 2.5, 0, TAU);
      ctx.fill();
    }

    /* corner ticks (only when no .radar-frame draws them) */
    const parent = this.canvas.parentElement;
    if (o.cornerTicks && !(parent && parent.classList && parent.classList.contains('radar-frame'))) drawCornerTicks(ctx, w, h, p);
  }

  _drawRimLabels(ctx, g, sectors, step) {
    const p = this.palette;
    const labels = this.opts.sectorLabels || [];
    const font = `500 ${g.labelPx}px ${p.fontSans}`;
    ctx.font = font;
    const key = `${g.R}|${font}|${labels.join('|')}`;
    if (!this._labels || this._labels.key !== key) {
      const chord = (TAU * g.labelR) / sectors - 10;
      const items = [];
      for (let i = 0; i < sectors; i++) {
        const raw = labels[i];
        if (!raw) continue;
        const deg = norm360(i * step + step / 2);
        // Lower half (glyph tops would point down after the tangential rotation) → rotate a further 180° so
        // every label reads upright (V28).
        items.push({ deg, text: fitText(ctx, raw, chord), flip: Math.cos(deg * DEG) < -1e-6 });
      }
      this._labels = { key, items };
    }
    ctx.fillStyle = p.ink3;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const it of this._labels.items) {
      const [x, y] = polar(g.cx, g.cy, it.deg, g.labelR);
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(it.deg * DEG + (it.flip ? Math.PI : 0));
      ctx.fillText(it.text, 0, 0);
      ctx.restore();
    }
  }
}

/* ------------------------------------------------------------------ */
/* Shared layout for upright-labelled spiders (Sensor & Compliance)    */
/* ------------------------------------------------------------------ */

function spiderLayout(radar, lineCount) {
  const w = radar.width;
  const h = radar.height;
  const minSide = Math.min(w, h);
  const fontPx = minSide >= 420 ? 11 : 10;
  const lineH = fontPx + 3;
  const labelW = clamp(Math.round(minSide * 0.2), 56, 104);
  const sidePad = labelW + 16;
  const topPad = lineCount * lineH + 14;
  const R = Math.max(30, Math.min(w / 2 - sidePad, h / 2 - topPad));
  return { cx: w / 2, cy: h / 2, R, fontPx, lineH, labelW, minSide };
}

/* ------------------------------------------------------------------ */
/* SensorRadar                                                         */
/* ------------------------------------------------------------------ */

export class SensorRadar extends RadarBase {
  static defaults = {
    axes: [],              // [{id, label, unit, max, threshold}]
    getValues: null,       // () => number[] (same order as axes)
    rotateDegPerSec: 4,
    pollMs: 120,
    ease: 0.08,            // per-frame lerp toward targets (60 fps equivalent)
    showValues: true,
    showThreshold: true,
    formatValue: null,     // (value, axis) => string
    emptyText: null,       // default: t('radar.noSensors') at draw time
  };

  constructor(canvas, opts) {
    super(canvas, opts);
    this._cur = [];
    this._target = [];
    this._rot = 0;
    this._lastPoll = -1;
    this._geo = null;
    this._labelCache = null;
  }

  onResize() { this._geo = null; this._labelCache = null; }
  onPalette() { this._labelCache = null; }
  onOptions() { this._geo = null; this._labelCache = null; }
  onData() { this._labelCache = null; }

  get values() { return this._cur.slice(); }

  _axes() {
    const fromData = this.data && Array.isArray(this.data.axes) ? this.data.axes : null;
    const list = fromData || this.opts.axes;
    return Array.isArray(list) ? list : [];
  }

  _poll() {
    const o = this.opts;
    let vals = null;
    try {
      if (typeof o.getValues === 'function') vals = o.getValues();
      else if (Array.isArray(this.data)) vals = this.data;
      else if (this.data && Array.isArray(this.data.values)) vals = this.data.values;
    } catch (err) {
      reportError('getValues', err);
    }
    if (!Array.isArray(vals)) vals = [];
    const axes = this._axes();
    // null / undefined / non-numeric → null: the axis is drawn with a gap and a "—" value (V12).
    const toVal = (x) => (x === null || x === undefined || x === '' ? null : (isNum(num(x, NaN)) ? num(x) : null));
    for (let i = 0; i < axes.length; i++) {
      const raw = vals[i];
      const v = raw && typeof raw === 'object' ? toVal(raw.value) : toVal(raw);
      this._target[i] = v;
      if (v === null) this._cur[i] = null;
      else if (!isNum(this._cur[i])) this._cur[i] = 0;
    }
    this._target.length = axes.length;
    this._cur.length = axes.length;
  }

  draw(ctx, t, dt) {
    const p = this.palette;
    const o = this.opts;
    const axes = this._axes();
    const n = axes.length;
    const g = this._geo || (this._geo = spiderLayout(this, o.showValues ? 3 : 2));
    const { cx, cy, R } = g;

    if (this._lastPoll < 0 || t - this._lastPoll >= o.pollMs / 1000) {
      this._lastPoll = t;
      this._poll();
    }
    if (!this.reduced) this._rot = norm360(this._rot + num(o.rotateDegPerSec, 4) * dt);
    const k = easeK(clamp(num(o.ease, 0.08), 0.01, 1), dt || 1 / 60);
    for (let i = 0; i < n; i++) {
      const tg = this._target[i];
      if (tg === null || tg === undefined) { this._cur[i] = null; continue; }
      if (!isNum(this._cur[i])) this._cur[i] = 0;
      this._cur[i] += (tg - this._cur[i]) * k;
    }

    /* plate */
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, TAU);
    ctx.fillStyle = rgba(p.ink1, p.light ? 0.012 : 0.016);
    ctx.fill();
    drawRings(ctx, cx, cy, R, [0.25, 0.5, 0.75, 1], p);

    if (!n) {
      ctx.font = `500 ${g.fontPx + 1}px ${p.fontSans}`;
      ctx.fillStyle = p.ink3;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(o.emptyText || t('radar.noSensors'), cx, cy);
      return;
    }

    const stepDeg = 360 / n;
    const pts = [];
    const thr = [];
    const over = [];
    for (let i = 0; i < n; i++) {
      const ax = axes[i] || {};
      const max = Math.max(1e-9, num(ax.max, 100));
      const has = isNum(this._cur[i]);
      const vn = has ? clamp(this._cur[i] / max, 0, 1.06) : 0;
      const tn = isNum(ax.threshold) ? clamp(ax.threshold / max, 0, 1) : null;
      const deg = norm360(this._rot + i * stepDeg);
      pts.push({ deg, vn, has, pt: has ? polar(cx, cy, deg, vn * R) : null, tip: polar(cx, cy, deg, R) });
      thr.push(tn === null ? null : polar(cx, cy, deg, tn * R));
      over.push(has && tn !== null && this._cur[i] > ax.threshold);
    }

    /* spokes (a missing sensor's spoke is drawn faint and detached from the centre) */
    ctx.lineWidth = 1;
    ctx.strokeStyle = rgba(p.line, 0.95);
    ctx.beginPath();
    for (const q of pts) {
      if (!q.has) continue;
      ctx.moveTo(cx, cy);
      ctx.lineTo(q.tip[0], q.tip[1]);
    }
    ctx.stroke();
    if (pts.some((q) => !q.has)) {
      ctx.strokeStyle = rgba(p.line2, 0.6);
      ctx.beginPath();
      for (const q of pts) {
        if (q.has) continue;
        const [sx, sy] = polar(cx, cy, q.deg, R * 0.22);
        ctx.moveTo(sx, sy);
        ctx.lineTo(q.tip[0], q.tip[1]);
      }
      ctx.stroke();
    }
    // over-threshold spoke segments
    for (let i = 0; i < n; i++) {
      if (!over[i] || !thr[i]) continue;
      ctx.strokeStyle = rgba(p.critical, 0.35);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(thr[i][0], thr[i][1]);
      ctx.lineTo(pts[i].tip[0], pts[i].tip[1]);
      ctx.stroke();
    }

    /* threshold polygon: solid warning hairline + small ticks */
    if (o.showThreshold && thr.some(Boolean)) {
      ctx.lineWidth = 1;
      ctx.strokeStyle = rgba(p.warning, 0.9);
      ctx.beginPath();
      let started = false;
      for (let i = 0; i < n; i++) {
        const q = thr[i] || pts[i].tip;
        if (!started) { ctx.moveTo(q[0], q[1]); started = true; } else ctx.lineTo(q[0], q[1]);
      }
      ctx.closePath();
      ctx.stroke();
      ctx.fillStyle = rgba(p.warning, 0.9);
      for (let i = 0; i < n; i++) {
        if (!thr[i]) continue;
        ctx.beginPath();
        ctx.arc(thr[i][0], thr[i][1], 1.6, 0, TAU);
        ctx.fill();
      }
    }

    /* value polygon — stroked only between neighbouring live axes, so a missing sensor leaves a gap */
    const live = pts.filter((q) => q.has);
    if (live.length >= 2) {
      const complete = live.length === n;
      ctx.beginPath();
      for (let i = 0; i < live.length; i++) {
        const q = live[i].pt;
        if (i === 0) ctx.moveTo(q[0], q[1]);
        else ctx.lineTo(q[0], q[1]);
      }
      ctx.closePath();
      ctx.fillStyle = rgba(p.accent, complete ? 0.18 : 0.1);
      ctx.fill();
      ctx.shadowColor = rgba(p.accent, p.light ? 0.25 : 0.45);
      ctx.shadowBlur = 12;
      ctx.lineWidth = 2;
      ctx.strokeStyle = p.accent;
      if (complete) ctx.stroke();
      else {
        ctx.beginPath();
        let open = false;
        for (let i = 0; i < n; i++) {
          const q = pts[i];
          const nx = pts[(i + 1) % n];
          if (!q.has) { open = false; continue; }
          if (!open) { ctx.moveTo(q.pt[0], q.pt[1]); open = true; }
          if (nx.has && (i < n - 1 || n > 2)) ctx.lineTo(nx.pt[0], nx.pt[1]); else open = false;
        }
        ctx.stroke();
      }
      ctx.shadowBlur = 0;
    }

    /* vertex dots + alarm flashes */
    for (let i = 0; i < n; i++) {
      if (!pts[i].has) continue;
      const [x, y] = pts[i].pt;
      const isOver = over[i];
      const color = isOver ? p.critical : p.accent;
      if (isOver) {
        const pulse = this.reduced ? 0.5 : 0.5 + 0.5 * Math.sin(t * TAU * 1.1 + i * 1.3);
        ctx.strokeStyle = rgba(p.critical, 0.18 + 0.32 * pulse);
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(x, y, 7 + 4 * pulse, 0, TAU);
        ctx.stroke();
        ctx.fillStyle = rgba(p.critical, 0.08 + 0.1 * pulse);
        ctx.beginPath();
        ctx.arc(x, y, 12 + 3 * pulse, 0, TAU);
        ctx.fill();
      }
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(x, y, 3.2, 0, TAU);
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = p.bg1;
      ctx.beginPath();
      ctx.arc(x, y, 4.2, 0, TAU);
      ctx.stroke();
      this.addHit(x, y, { ...axes[i], kind: 'sensor', index: i, value: this._cur[i], over: isOver }, o.hitRadius);
    }

    /* labels at tips (upright, wrapped) */
    this._drawLabels(ctx, g, axes, pts, over);

    /* center */
    ctx.fillStyle = rgba(p.accent, p.light ? 0.08 : 0.14);
    ctx.beginPath();
    ctx.arc(cx, cy, 9, 0, TAU);
    ctx.fill();
    ctx.fillStyle = p.ink3;
    ctx.beginPath();
    ctx.arc(cx, cy, 2, 0, TAU);
    ctx.fill();
  }

  _drawLabels(ctx, g, axes, pts, over) {
    const p = this.palette;
    const o = this.opts;
    const labelFont = `500 ${g.fontPx}px ${p.fontSans}`;
    const valueFont = `500 ${g.fontPx}px ${p.fontMono}`;
    const key = `${g.R}|${labelFont}|${axes.map((a) => a && a.label).join('|')}`;
    if (!this._labelCache || this._labelCache.key !== key) {
      ctx.font = labelFont;
      this._labelCache = { key, lines: axes.map((a) => wrapText(ctx, (a && a.label) || '', g.labelW, 2)) };
    }
    for (let i = 0; i < axes.length; i++) {
      const ax = axes[i] || {};
      const deg = pts[i].deg;
      const [tx, ty] = polar(g.cx, g.cy, deg, g.R + 12);
      const hx = Math.sin(deg * DEG);
      const vy = -Math.cos(deg * DEG);
      const lines = this._labelCache.lines[i].slice();
      const styles = lines.map(() => ({ font: labelFont, color: p.ink2 }));
      if (o.showValues) {
        const v = this._cur[i];
        const missing = !isNum(v);
        const text = missing ? '—' : (typeof o.formatValue === 'function' ? String(o.formatValue(v, ax)) : fmtValueUnit(v, ax.unit, p.numerals));
        lines.push(text);
        styles.push({ font: valueFont, color: missing ? p.ink3 : (over[i] ? mixColor(p.critical, p.ink1, p.light ? 0.15 : 0.3) : p.ink1) });
      }
      drawTipLabel(ctx, tx, ty, hx, vy, lines, g.lineH, styles);
    }
  }
}

/* ------------------------------------------------------------------ */
/* SitePlanRadar                                                       */
/* ------------------------------------------------------------------ */

const HAZARD_PERIOD = { critical: 1.1, serious: 1.5, warning: 1.9, good: 2.6 };
/** Localized names of moving things on the site plan (resolved at draw time). */
const kindLabel = (kind) => t(`radar.kinds.${kind}`);

export class SitePlanRadar extends RadarBase {
  static defaults = {
    zones: [],             // [{id, name, x, y, w, h}] normalised 0..1
    getPings: null,        // () => [{id?, x, y, kind:'worker'|'vehicle'|'crane', angle?}]
    getHazards: null,      // () => [{id?, x, y, tone, label}]
    pollMs: 250,
    scanSeconds: 6,
    shearDeg: 30,
    showGrid: true,
    showLegend: true,
    showCompass: true,
    showHazardLabels: true,   // true → pills for critical (and hovered) hazards only; 'all' → every hazard; false → hover only
    gridDivisions: 10,
    zoneLabelMinPx: 90,       // zone names are printed only when the projected zone is at least this wide
  };

  constructor(canvas, opts) {
    super(canvas, opts);
    this._pings = [];
    this._hazards = [];
    this._lastPoll = -1;
    this._lastPingPoll = -1;
    this._geo = null;
    this._zoneLabels = null;
    this._pillCache = new Map();
    this._pillPlace = null;
    this._occ = null;
  }

  onResize() { this._geo = null; this._zoneLabels = null; this._pillCache.clear(); }
  onPalette() { this._zoneLabels = null; this._pillCache.clear(); }
  onOptions() { this._geo = null; this._zoneLabels = null; this._pillCache.clear(); }
  onData() { this._zoneLabels = null; }

  _zones() {
    const fromData = this.data && Array.isArray(this.data.zones) ? this.data.zones : null;
    const list = fromData || this.opts.zones;
    return Array.isArray(list) ? list : [];
  }

  _layout() {
    const w = this.width;
    const h = this.height;
    const m = 18;
    const depth = clamp(Math.round(Math.min(w, h) * 0.022), 6, 12);
    const tan = Math.tan(clamp(num(this.opts.shearDeg, 30), 5, 60) * DEG);
    const reserve = (this.opts.showLegend ? 24 : 0) + (this.opts.showCompass ? 24 : 0);
    const availW = w - 2 * m;
    const availH = Math.max(40, h - 2 * m - depth - reserve);
    let f = 0.78;
    let W = Math.min(availW / (1 + f * tan), availH / f);
    const slack = availH - W * f;
    if (slack > 60) {
      f = clamp(f + ((slack - 60) / availH) * 0.5, 0.78, 0.9);
      W = Math.min(availW / (1 + f * tan), availH / f);
    }
    const Hp = W * f;
    const S = Hp * tan;
    const ox = (w - (W + S)) / 2;
    const oy = (h - Hp - depth) / 2 + (this.opts.showCompass && !this.opts.showLegend ? 10 : 0);
    this._geo = { W, Hp, S, ox, oy, depth, m, f, tan };
    return this._geo;
  }

  /** Normalised plan coordinates → canvas point (sheared parallelogram). */
  project(u, v) {
    const g = this._geo || this._layout();
    return [g.ox + u * g.W + (1 - v) * g.S, g.oy + v * g.Hp];
  }

  _poll(t) {
    const o = this.opts;
    let hz = null;
    try {
      if (typeof o.getHazards === 'function') hz = o.getHazards();
      else if (this.data && Array.isArray(this.data.hazards)) hz = this.data.hazards;
    } catch (err) {
      reportError('getHazards', err);
    }
    this._hazards = Array.isArray(hz) ? hz.filter(Boolean) : [];
    this._lastPoll = t;
  }

  _pollPings() {
    const o = this.opts;
    let pg = null;
    try {
      if (typeof o.getPings === 'function') pg = o.getPings();
      else if (this.data && Array.isArray(this.data.pings)) pg = this.data.pings;
    } catch (err) {
      reportError('getPings', err);
    }
    this._pings = Array.isArray(pg) ? pg.filter(Boolean) : [];
  }

  _planPath(ctx) {
    const a = this.project(0, 0);
    const b = this.project(1, 0);
    const c = this.project(1, 1);
    const d = this.project(0, 1);
    ctx.beginPath();
    ctx.moveTo(a[0], a[1]);
    ctx.lineTo(b[0], b[1]);
    ctx.lineTo(c[0], c[1]);
    ctx.lineTo(d[0], d[1]);
    ctx.closePath();
  }

  _quad(ctx, x, y, w, h) {
    const a = this.project(x, y);
    const b = this.project(x + w, y);
    const c = this.project(x + w, y + h);
    const d = this.project(x, y + h);
    ctx.beginPath();
    ctx.moveTo(a[0], a[1]);
    ctx.lineTo(b[0], b[1]);
    ctx.lineTo(c[0], c[1]);
    ctx.lineTo(d[0], d[1]);
    ctx.closePath();
  }

  draw(ctx, t) {
    const p = this.palette;
    const o = this.opts;
    const w = this.width;
    const h = this.height;
    const g = this._geo || this._layout();
    const zones = this._zones();

    if (this._lastPoll < 0 || t - this._lastPoll >= o.pollMs / 1000) this._poll(t);
    this._pollPings();

    /* slab sides (extrusion) */
    const d = g.depth;
    const P00 = this.project(0, 0);
    const P01 = this.project(0, 1);
    const P11 = this.project(1, 1);
    ctx.beginPath();
    ctx.moveTo(P01[0], P01[1]);
    ctx.lineTo(P11[0], P11[1]);
    ctx.lineTo(P11[0], P11[1] + d);
    ctx.lineTo(P01[0], P01[1] + d);
    ctx.closePath();
    ctx.fillStyle = p.light ? rgba(p.line2, 0.55) : rgba(p.bg3, 1);
    ctx.fill();
    ctx.strokeStyle = p.line2;
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(P00[0], P00[1]);
    ctx.lineTo(P01[0], P01[1]);
    ctx.lineTo(P01[0], P01[1] + d);
    ctx.lineTo(P00[0], P00[1] + d);
    ctx.closePath();
    ctx.fillStyle = p.light ? rgba(p.line2, 0.35) : rgba(p.bg2, 1);
    ctx.fill();
    ctx.stroke();

    /* plan top */
    this._planPath(ctx);
    ctx.fillStyle = p.bg2;
    ctx.fill();
    ctx.fillStyle = rgba(p.accent, p.light ? 0.03 : 0.045);
    ctx.fill();

    /* blueprint grid (clipped to the plan) */
    if (o.showGrid) {
      ctx.save();
      this._planPath(ctx);
      ctx.clip();
      const N = clamp(o.gridDivisions | 0, 2, 40);
      ctx.strokeStyle = rgba(p.line, p.light ? 0.9 : 0.75);
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let i = 1; i < N; i++) {
        const f = i / N;
        const a = this.project(f, 0);
        const b = this.project(f, 1);
        ctx.moveTo(a[0], a[1]);
        ctx.lineTo(b[0], b[1]);
        const c = this.project(0, f);
        const e = this.project(1, f);
        ctx.moveTo(c[0], c[1]);
        ctx.lineTo(e[0], e[1]);
      }
      ctx.stroke();
      ctx.restore();
    }

    /* zones — names only where the projected zone is wide enough (≥ zoneLabelMinPx) and the text fits
       on one or two lines without truncation; everything else is revealed on hover (RTL-16 / V11). */
    const zoneFont = `500 ${g.W >= 300 ? 10.5 : 9.5}px ${p.fontSans}`;
    const zoneLineH = g.W >= 300 ? 13 : 12;
    const codeFont = `500 9px ${p.fontMono}`;
    const occ = (this._occ || (this._occ = new Occupancy(w, h))).reset(w, h);
    // Reserve the fixed chrome: compass (top inline-end), legend strip (bottom inline-start) and the DOM chips
    // that overlay the frame (status top-inline-start, caption bottom-inline-end). RTL: compass top-left,
    // legend bottom-right, status top-right, caption bottom-left; LTR mirrors every one of them.
    const rtl = p.rtl !== false;
    const mx = (x, width) => (rtl ? x : w - x - width);   // mirror a box's x for LTR
    if (o.showCompass) occ.take(mx(g.m - 2, 30), g.m - 2, 30, 40);
    if (o.showLegend) occ.take(mx(Math.max(0, w - g.m - 250), 250), h - g.m - 16, 250, 20);
    occ.take(mx(Math.max(0, w - 170), 170), 0, 170, 26);
    occ.take(mx(0, 190), h - 24, 190, 24);
    const minZonePx = num(o.zoneLabelMinPx, 90);
    const zkey = `${g.W}|${zoneFont}|${minZonePx}|${zones.map((z) => z && (z.id + z.name + z.w + z.h)).join('|')}`;
    if (!this._zoneLabels || this._zoneLabels.key !== zkey) {
      ctx.font = zoneFont;
      this._zoneLabels = {
        key: zkey,
        items: zones.map((z, i) => {
          const zw = clamp(num(z.w), 0, 1) * g.W;
          const zh = clamp(num(z.h), 0, 1) * g.Hp;
          const name = String(z.name || z.id || '').trim();
          const maxW = zw - 16;
          let lines = null;
          if (name && zw >= minZonePx && zh > 22) {
            if (ctx.measureText(name).width <= maxW) lines = [name];
            else if (zh >= zoneLineH * 2 + 10) lines = wrapNoEllipsis(ctx, name, maxW, 2);
          }
          const width = lines ? Math.max(...lines.map((l) => ctx.measureText(l).width)) : 0;
          return { name, lines, width, code: localizeDigits(String(i + 1).padStart(2, '0'), p.numerals) };
        }),
      };
    }
    const hoveredZone = this.hover && this.hover.kind === 'zone' ? this.hover : null;
    for (let i = 0; i < zones.length; i++) {
      const z = zones[i];
      if (!z) continue;
      const zx = clamp(num(z.x), 0, 1);
      const zy = clamp(num(z.y), 0, 1);
      const zw = clamp(num(z.w), 0, 1 - zx);
      const zh = clamp(num(z.h), 0, 1 - zy);
      const isHover = hoveredZone && String(hoveredZone.id) === String(z.id ?? i);
      this._quad(ctx, zx, zy, zw, zh);
      ctx.fillStyle = rgba(p.ink1, isHover ? 0.09 : i % 2 ? 0.02 : 0.045);
      ctx.fill();
      ctx.strokeStyle = isHover ? rgba(p.accent, 0.8) : rgba(p.line2, 0.95);
      ctx.lineWidth = 1;
      ctx.stroke();
      const lbl = this._zoneLabels.items[i];
      const zwPx = zw * g.W;
      const zhPx = zh * g.Hp;
      if (lbl && lbl.lines && zwPx > 40 && zhPx > 22) {
        // zone name: inline-start corner of the zone's top edge (right in RTL, left in LTR), if the spot is free
        const vTop = zy + Math.min(0.03, zh * 0.2);
        if (rtl) {
          const [rx, ry] = this.project(zx + zw, vTop);
          const bx = rx - 8 - lbl.width;
          const by = ry + 3;
          const bh = lbl.lines.length * zoneLineH;
          if (occ.free(bx - 2, by - 1, lbl.width + 4, bh + 2)) {
            occ.take(bx - 2, by - 1, lbl.width + 4, bh + 2);
            ctx.font = zoneFont;
            ctx.fillStyle = p.ink2;
            ctx.textAlign = 'right';
            ctx.textBaseline = 'top';
            for (let li = 0; li < lbl.lines.length; li++) ctx.fillText(lbl.lines[li], rx - 8, by + li * zoneLineH);
          }
        } else {
          const [lx0, ly0] = this.project(zx, vTop);
          const bx = lx0 + 8;
          const by = ly0 + 3;
          const bh = lbl.lines.length * zoneLineH;
          if (occ.free(bx - 2, by - 1, lbl.width + 4, bh + 2)) {
            occ.take(bx - 2, by - 1, lbl.width + 4, bh + 2);
            ctx.font = zoneFont;
            ctx.fillStyle = p.ink2;
            ctx.textAlign = 'left';
            ctx.textBaseline = 'top';
            for (let li = 0; li < lbl.lines.length; li++) ctx.fillText(lbl.lines[li], bx, by + li * zoneLineH);
          }
        }
      }
      if (lbl && zwPx > 28 && zhPx > 16) {
        // zone number: bottom inline-end corner in mono (keeps small zones identifiable without a name)
        ctx.font = codeFont;
        ctx.fillStyle = p.ink3;
        ctx.textBaseline = 'bottom';
        if (rtl) {
          const [lx, ly] = this.project(zx, zy + zh);
          ctx.textAlign = 'left';
          ctx.fillText(lbl.code, lx + 6, ly - 4);
          occ.take(lx + 4, ly - 16, 18, 14);
        } else {
          const [rx, ry] = this.project(zx + zw, zy + zh);
          ctx.textAlign = 'right';
          ctx.fillText(lbl.code, rx - 6, ry - 4);
          occ.take(rx - 22, ry - 16, 18, 14);
        }
      }
      // hover target at the zone centre (silent: highlights the zone and reveals its name, never forwarded to onHover)
      if (lbl && lbl.name) {
        const [zcx, zcy] = this.project(zx + zw / 2, zy + zh / 2);
        this.addHit(zcx, zcy, { kind: 'zone', id: z.id ?? i, name: lbl.name, index: i, silent: true }, clamp(Math.min(zwPx, zhPx) / 2, 10, 48));
      }
    }
    // plan outline on top of zones
    this._planPath(ctx);
    ctx.strokeStyle = p.line2;
    ctx.lineWidth = 1;
    ctx.stroke();

    /* scan line (top → bottom every scanSeconds) */
    let scanV = -1;
    if (!this.reduced) {
      const period = Math.max(1, num(o.scanSeconds, 6));
      scanV = (t % period) / period;
      ctx.save();
      this._planPath(ctx);
      ctx.clip();
      const bandTop = this.project(0.5, Math.max(0, scanV - 0.16))[1];
      const bandBot = this.project(0.5, scanV)[1];
      if (bandBot - bandTop > 1) {
        const grad = ctx.createLinearGradient(0, bandTop, 0, bandBot);
        grad.addColorStop(0, rgba(p.accent, 0));
        grad.addColorStop(1, rgba(p.accent, p.light ? 0.14 : 0.2));
        ctx.fillStyle = grad;
        ctx.fillRect(0, bandTop, w, bandBot - bandTop);
      }
      const a = this.project(0, scanV);
      const b = this.project(1, scanV);
      ctx.shadowColor = rgba(p.accent, 0.8);
      ctx.shadowBlur = 8;
      ctx.strokeStyle = rgba(p.accent, 0.9);
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(a[0], a[1]);
      ctx.lineTo(b[0], b[1]);
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.restore();
    }

    /* pings */
    for (let i = 0; i < this._pings.length; i++) {
      const pg = this._pings[i];
      const u = clamp(num(pg.x), 0, 1);
      const v = clamp(num(pg.y), 0, 1);
      const [x, y] = this.project(u, v);
      const near = scanV >= 0 && Math.abs(v - scanV) < 0.05;
      const kind = pg.kind || 'worker';
      if (kind === 'crane') {
        const L = 0.13;
        const ang = isNum(pg.angle) ? pg.angle : this.reduced ? i * 70 : t * 20 + i * 70;
        // swept circle
        ctx.strokeStyle = rgba(p.line2, 0.8);
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (let s = 0; s <= 40; s++) {
          const a = (s / 40) * TAU;
          const [qx, qy] = this.project(u + Math.sin(a) * L, v - Math.cos(a) * L);
          if (s === 0) ctx.moveTo(qx, qy);
          else ctx.lineTo(qx, qy);
        }
        ctx.stroke();
        // boom + counter-jib
        const [bx, by] = this.project(u + Math.sin(ang * DEG) * L, v - Math.cos(ang * DEG) * L);
        const [jx, jy] = this.project(u - Math.sin(ang * DEG) * L * 0.32, v + Math.cos(ang * DEG) * L * 0.32);
        ctx.strokeStyle = p.ink1;
        ctx.lineWidth = 1.8;
        ctx.beginPath();
        ctx.moveTo(jx, jy);
        ctx.lineTo(bx, by);
        ctx.stroke();
        ctx.fillStyle = p.accent;
        ctx.beginPath();
        ctx.arc(bx, by, 2.2, 0, TAU);
        ctx.fill();
        ctx.fillStyle = p.ink1;
        ctx.beginPath();
        ctx.arc(x, y, 3.2, 0, TAU);
        ctx.fill();
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = p.bg1;
        ctx.beginPath();
        ctx.arc(x, y, 4, 0, TAU);
        ctx.stroke();
        this.addHit(x, y, { ...pg, kind, index: i, label: pg.label || kindLabel('crane') }, o.hitRadius);
      } else if (kind === 'vehicle') {
        const hu = 0.022;
        const hv = 0.03;
        this._quad(ctx, u - hu, v - hv, hu * 2, hv * 2);
        ctx.fillStyle = near ? mixColor(p.ink2, p.accent, 0.5) : p.ink2;
        ctx.fill();
        ctx.lineWidth = 1.2;
        ctx.strokeStyle = p.bg1;
        ctx.stroke();
        this.addHit(x, y, { ...pg, kind, index: i, label: pg.label || kindLabel('vehicle') }, o.hitRadius);
      } else {
        if (near) {
          ctx.shadowColor = rgba(p.accent, 0.9);
          ctx.shadowBlur = 8;
        }
        ctx.fillStyle = p.accent;
        ctx.beginPath();
        ctx.arc(x, y, near ? 3 : 2.5, 0, TAU);
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.lineWidth = 1.2;
        ctx.strokeStyle = p.bg1;
        ctx.beginPath();
        ctx.arc(x, y, (near ? 3 : 2.5) + 0.6, 0, TAU);
        ctx.stroke();
      }
    }

    /* hazards */
    const hoveredHazard = this.hover && this.hover.kind === 'hazard' ? this.hover : null;
    const hazardPts = [];
    for (let i = 0; i < this._hazards.length; i++) {
      const hz = this._hazards[i];
      const u = clamp(num(hz.x), 0, 1);
      const v = clamp(num(hz.y), 0, 1);
      const [x, y] = this.project(u, v);
      const color = p.tone(hz.tone);
      const period = HAZARD_PERIOD[hz.tone] || 1.9;
      const phase = hash01(hz.id ?? hz.label ?? i);
      if (this.reduced) {
        const br = 0.3 + 0.15 * Math.sin((t * TAU) / 3 + phase * TAU);
        ctx.strokeStyle = rgba(color, br);
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(x, y, 11, 0, TAU);
        ctx.stroke();
      } else {
        for (let rI = 0; rI < 2; rI++) {
          const k = ((t / period + phase + rI * 0.5) % 1 + 1) % 1;
          ctx.strokeStyle = rgba(color, (1 - k) * 0.65);
          ctx.lineWidth = 1.8 * (1 - k) + 0.4;
          ctx.beginPath();
          ctx.arc(x, y, 5 + easeOutCubic(k) * 20, 0, TAU);
          ctx.stroke();
        }
      }
      ctx.shadowColor = rgba(color, 0.7);
      ctx.shadowBlur = 8;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(x, y, 4.2, 0, TAU);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.lineWidth = 2;
      ctx.strokeStyle = p.bg1;
      ctx.beginPath();
      ctx.arc(x, y, 5.2, 0, TAU);
      ctx.stroke();
      occ.take(x - 7, y - 7, 14, 14);
      const data = { ...hz, kind: 'hazard', index: i };
      this.addHit(x, y, data, o.hitRadius);
      hazardPts.push({ hz, x, y, color, data });
    }

    /* hazard pills: critical (and the hovered) hazards only, label text without the code, placed on the
       occupancy grid with a short leader line when displaced; dropped (hover reveals) when nothing fits. */
    if (o.showHazardLabels !== false && hazardPts.length) {
      const pillFont = `500 10px ${p.fontSans}`;
      const lineH = 13;
      const maxPillW = Math.min(150, w * 0.32);
      ctx.font = pillFont;
      const wanted = hazardPts.filter(({ hz, data }) => {
        const isHover = hoveredHazard && sameItem(hoveredHazard, data);
        return isHover || o.showHazardLabels === 'all' || hz.tone === 'critical';
      });
      wanted.sort((a, b) => ((hoveredHazard && sameItem(hoveredHazard, b.data)) ? 1 : 0) - ((hoveredHazard && sameItem(hoveredHazard, a.data)) ? 1 : 0));
      // Placement only changes with the layout, the hover target or the hazard set (never with the moving
      // pings), so the result — including "nothing fits" — is memoised and the search runs once per change.
      const placeKey = [w, h, g.W, this._zoneLabels.key, hoveredHazard ? hoveredHazard.index : '-',
        wanted.map((hp) => `${hp.data.index}:${Math.round(hp.x)},${Math.round(hp.y)}:${hazardLabelText(hp.hz)}`).join(';')].join('|');
      if (!this._pillPlace || this._pillPlace.key !== placeKey) this._pillPlace = { key: placeKey, map: new Map() };
      const memo = this._pillPlace.map;
      for (const hp of wanted) {
        const text = hazardLabelText(hp.hz);
        if (!text) continue;
        let pill = this._pillCache.get(text);
        if (!pill) {
          let lines = ctx.measureText(text).width <= maxPillW - 14 ? [text] : wrapNoEllipsis(ctx, text, maxPillW - 14, 2);
          if (!lines) lines = null;
          pill = lines ? { lines, w: Math.max(...lines.map((l) => ctx.measureText(l).width)) + 14, h: lines.length * lineH + 6 } : null;
          this._pillCache.set(text, pill);
        }
        if (!pill) continue;
        const { x, y, color } = hp;
        const pw = pill.w;
        const ph = pill.h;
        const toLeft = x > w / 2;
        // candidate anchors: beside the dot first, then above/below, then displaced rings (leader line)
        const cands = [
          [toLeft ? x - 11 - pw : x + 11, y - ph / 2, false],
          [toLeft ? x + 11 : x - 11 - pw, y - ph / 2, false],
          [x - pw / 2, y - 13 - ph, false],
          [x - pw / 2, y + 13, false],
        ];
        // Displaced rings, nearest first (a short leader line joins the pill to its dot). The outer rings
        // keep a crowded plan labelled instead of silently dropping a critical hazard's pill.
        for (const d of [26, 40, 56, 76, 98]) {
          for (let a = 0; a < 12; a++) {
            const ang = (a / 12) * TAU + Math.PI / 12;
            cands.push([x + Math.cos(ang) * d - pw / 2, y + Math.sin(ang) * d - ph / 2, true]);
          }
        }
        const memoKey = hp.data.index;
        let placed;
        if (memo.has(memoKey)) {
          placed = memo.get(memoKey);
          if (placed && !occ.free(placed.px - 2, placed.py - 2, pw + 4, ph + 4)) placed = undefined;
        }
        if (placed === undefined) {
          placed = null;
          for (const [cx0, cy0, displaced] of cands) {
            // Pull a candidate that pokes out of the canvas back inside; the occupancy test below still
            // rejects it when that lands on the dot, a zone name or another pill.
            const px = clamp(cx0, 3, Math.max(3, w - pw - 3));
            const py = clamp(cy0, 3, Math.max(3, h - ph - 3));
            if (occ.free(px - 2, py - 2, pw + 4, ph + 4)) { placed = { px, py, displaced }; break; }
          }
          if (!placed) {
            // Crowded plan: scan the lattice around the dot for the nearest free spot (leader line drawn).
            for (const [dx, dy] of PILL_LATTICE) {
              const px = clamp(x + dx - pw / 2, 3, Math.max(3, w - pw - 3));
              const py = clamp(y + dy - ph / 2, 3, Math.max(3, h - ph - 3));
              if (occ.free(px - 2, py - 2, pw + 4, ph + 4)) { placed = { px, py, displaced: true }; break; }
            }
          }
          memo.set(memoKey, placed);
        }
        if (!placed) continue;
        occ.take(placed.px - 2, placed.py - 2, pw + 4, ph + 4);
        const { px, py } = placed;
        if (placed.displaced) {
          // leader: from the dot's edge to the nearest point on the pill boundary
          const cxp = clamp(x, px, px + pw);
          const cyp = clamp(y, py, py + ph);
          const dx = cxp - x;
          const dy = cyp - y;
          const dist = Math.hypot(dx, dy) || 1;
          if (dist > 9) {
            ctx.strokeStyle = rgba(color, 0.75);
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(x + (dx / dist) * 6.5, y + (dy / dist) * 6.5);
            ctx.lineTo(cxp, cyp);
            ctx.stroke();
          }
        }
        roundRect(ctx, px, py, pw, ph, 5);
        ctx.fillStyle = rgba(p.bg1, 0.92);
        ctx.fill();
        ctx.lineWidth = 1;
        ctx.strokeStyle = rgba(color, 0.75);
        ctx.stroke();
        ctx.font = pillFont;
        ctx.fillStyle = p.ink1;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        for (let li = 0; li < pill.lines.length; li++) ctx.fillText(pill.lines[li], px + pw / 2, py + 3 + lineH / 2 + li * lineH + 0.5);
      }
    }

    /* hovered zone: reveal its name as a pill at the zone centre (small zones have no printed name) */
    if (hoveredZone && hoveredZone.name) {
      const z = zones[hoveredZone.index] || {};
      const zx = clamp(num(z.x), 0, 1);
      const zy = clamp(num(z.y), 0, 1);
      const zw = clamp(num(z.w), 0, 1 - zx);
      const zh = clamp(num(z.h), 0, 1 - zy);
      const [zcx, zcy] = this.project(zx + zw / 2, zy + zh / 2);
      ctx.font = zoneFont;
      const lines = ctx.measureText(hoveredZone.name).width <= w * 0.5 ? [hoveredZone.name] : (wrapNoEllipsis(ctx, hoveredZone.name, w * 0.5, 2) || [fitText(ctx, hoveredZone.name, w * 0.5)]);
      const pw = Math.max(...lines.map((l) => ctx.measureText(l).width)) + 16;
      const ph = lines.length * zoneLineH + 8;
      const px = clamp(zcx - pw / 2, 2, w - pw - 2);
      const py = clamp(zcy - ph / 2, 2, h - ph - 2);
      roundRect(ctx, px, py, pw, ph, 5);
      ctx.fillStyle = rgba(p.bg1, 0.94);
      ctx.fill();
      ctx.lineWidth = 1;
      ctx.strokeStyle = rgba(p.accent, 0.7);
      ctx.stroke();
      ctx.fillStyle = p.ink1;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      for (let li = 0; li < lines.length; li++) ctx.fillText(lines[li], px + pw / 2, py + 4 + zoneLineH / 2 + li * zoneLineH);
    }

    /* compass (top inline-end: the .radar-status chip lives top-inline-start — top-right in RTL, top-left in LTR) */
    if (o.showCompass) {
      const cxp = rtl ? g.m + 12 : w - g.m - 12;
      const cyp = g.m + 12;
      ctx.strokeStyle = rgba(p.line2, 0.95);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(cxp, cyp, 10, 0, TAU);
      ctx.stroke();
      ctx.fillStyle = p.accent;
      ctx.beginPath();
      ctx.moveTo(cxp, cyp - 8);
      ctx.lineTo(cxp + 3, cyp + 1);
      ctx.lineTo(cxp, cyp - 1);
      ctx.lineTo(cxp - 3, cyp + 1);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = p.ink3;
      ctx.beginPath();
      ctx.moveTo(cxp, cyp + 8);
      ctx.lineTo(cxp + 3, cyp - 1);
      ctx.lineTo(cxp, cyp + 1);
      ctx.lineTo(cxp - 3, cyp - 1);
      ctx.closePath();
      ctx.fill();
      ctx.font = `600 9px ${p.fontSans}`;
      ctx.fillStyle = p.ink3;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText(t('radar.north'), cxp, cyp + 13);
    }

    /* legend (bottom inline-start; .radar-caption lives bottom-inline-end). RTL: drawn from the right edge
       leftwards; LTR: the same strip mirrored — drawn from the left edge rightwards (icon, then label). */
    if (o.showLegend && !rtl) {
      ctx.font = `500 10px ${p.fontSans}`;
      ctx.textBaseline = 'middle';
      const y = h - g.m - 6;
      let x = g.m + 2;
      for (const it of [
        { label: kindLabel('worker'), icon: 'dot' },
        { label: kindLabel('vehicle'), icon: 'rect' },
        { label: kindLabel('crane'), icon: 'crane' },
        { label: kindLabel('hazard'), icon: 'hazard' },
      ]) {
        if (it.icon === 'dot') {
          ctx.fillStyle = p.accent;
          ctx.beginPath();
          ctx.arc(x + 5, y, 2.6, 0, TAU);
          ctx.fill();
        } else if (it.icon === 'rect') {
          ctx.fillStyle = p.ink2;
          roundRect(ctx, x, y - 3, 10, 6, 1.5);
          ctx.fill();
        } else if (it.icon === 'crane') {
          ctx.strokeStyle = p.ink1;
          ctx.lineWidth = 1.6;
          ctx.beginPath();
          ctx.moveTo(x + 1, y + 3);
          ctx.lineTo(x + 10, y - 3);
          ctx.stroke();
          ctx.fillStyle = p.ink1;
          ctx.beginPath();
          ctx.arc(x + 6, y + 0.5, 2.2, 0, TAU);
          ctx.fill();
        } else {
          ctx.strokeStyle = rgba(p.critical, 0.8);
          ctx.lineWidth = 1.2;
          ctx.beginPath();
          ctx.arc(x + 5, y, 4.5, 0, TAU);
          ctx.stroke();
          ctx.fillStyle = p.critical;
          ctx.beginPath();
          ctx.arc(x + 5, y, 2.2, 0, TAU);
          ctx.fill();
        }
        x += 15;
        ctx.fillStyle = p.ink3;
        ctx.textAlign = 'left';
        ctx.fillText(it.label, x, y);
        x += ctx.measureText(it.label).width + 16;
      }
    }
    if (o.showLegend && rtl) {
      ctx.font = `500 10px ${p.fontSans}`;
      ctx.textBaseline = 'middle';
      const y = h - g.m - 6;
      let x = w - g.m - 2;
      const items = [
        { label: kindLabel('worker'), icon: 'dot' },
        { label: kindLabel('vehicle'), icon: 'rect' },
        { label: kindLabel('crane'), icon: 'crane' },
        { label: kindLabel('hazard'), icon: 'hazard' },
      ];
      for (const it of items) {
        // icon (right), then label (left of it)
        if (it.icon === 'dot') {
          ctx.fillStyle = p.accent;
          ctx.beginPath();
          ctx.arc(x - 5, y, 2.6, 0, TAU);
          ctx.fill();
        } else if (it.icon === 'rect') {
          ctx.fillStyle = p.ink2;
          roundRect(ctx, x - 10, y - 3, 10, 6, 1.5);
          ctx.fill();
        } else if (it.icon === 'crane') {
          ctx.strokeStyle = p.ink1;
          ctx.lineWidth = 1.6;
          ctx.beginPath();
          ctx.moveTo(x - 10, y + 3);
          ctx.lineTo(x - 1, y - 3);
          ctx.stroke();
          ctx.fillStyle = p.ink1;
          ctx.beginPath();
          ctx.arc(x - 6, y + 0.5, 2.2, 0, TAU);
          ctx.fill();
        } else {
          ctx.strokeStyle = rgba(p.critical, 0.8);
          ctx.lineWidth = 1.2;
          ctx.beginPath();
          ctx.arc(x - 5, y, 4.5, 0, TAU);
          ctx.stroke();
          ctx.fillStyle = p.critical;
          ctx.beginPath();
          ctx.arc(x - 5, y, 2.2, 0, TAU);
          ctx.fill();
        }
        x -= 15;
        ctx.fillStyle = p.ink3;
        ctx.textAlign = 'right';
        ctx.fillText(it.label, x, y);
        x -= ctx.measureText(it.label).width + 16;
      }
    }
  }
}

/* ------------------------------------------------------------------ */
/* ComplianceRadar                                                     */
/* ------------------------------------------------------------------ */

export class ComplianceRadar extends RadarBase {
  static defaults = {
    axes: [],             // [{id, label}]
    getValues: null,      // () => number[] (0..max)
    target: 85,
    max: 100,
    rotateDegPerSec: 2,
    pollMs: 500,
    ease: 0.06,
    showScores: true,
    targetLabel: null,    // default: t('radar.target') at draw time
  };

  constructor(canvas, opts) {
    super(canvas, opts);
    this._cur = [];
    this._target = [];
    this._rot = 0;
    this._lastPoll = -1;
    this._geo = null;
    this._labelCache = null;
  }

  onResize() { this._geo = null; this._labelCache = null; }
  onPalette() { this._labelCache = null; }
  onOptions() { this._geo = null; this._labelCache = null; }
  onData() { this._labelCache = null; }

  get values() { return this._cur.slice(); }

  _axes() {
    const fromData = this.data && Array.isArray(this.data.axes) ? this.data.axes : null;
    const list = fromData || this.opts.axes;
    return Array.isArray(list) ? list : [];
  }

  _poll() {
    const o = this.opts;
    let vals = null;
    try {
      if (typeof o.getValues === 'function') vals = o.getValues();
      else if (Array.isArray(this.data)) vals = this.data;
      else if (this.data && Array.isArray(this.data.values)) vals = this.data.values;
    } catch (err) {
      reportError('getValues', err);
    }
    if (!Array.isArray(vals)) vals = [];
    const axes = this._axes();
    for (let i = 0; i < axes.length; i++) {
      const raw = vals[i];
      const v = raw && typeof raw === 'object' ? num(raw.value ?? raw.score) : num(raw);
      this._target[i] = v;
      if (!isNum(this._cur[i])) this._cur[i] = 0;
    }
    this._target.length = axes.length;
    this._cur.length = axes.length;
  }

  draw(ctx, t, dt) {
    const p = this.palette;
    const o = this.opts;
    const axes = this._axes();
    const n = axes.length;
    const g = this._geo || (this._geo = spiderLayout(this, 2));
    const { cx, cy, R } = g;
    const max = Math.max(1e-9, num(o.max, 100));
    const target = clamp(num(o.target, 85), 0, max);
    const tn = target / max;

    if (this._lastPoll < 0 || t - this._lastPoll >= o.pollMs / 1000) {
      this._lastPoll = t;
      this._poll();
    }
    if (!this.reduced) this._rot = norm360(this._rot + num(o.rotateDegPerSec, 2) * dt);
    const k = easeK(clamp(num(o.ease, 0.06), 0.01, 1), dt || 1 / 60);
    for (let i = 0; i < n; i++) this._cur[i] += (this._target[i] - this._cur[i]) * k;

    /* plate + rings (20% steps) */
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, TAU);
    ctx.fillStyle = rgba(p.ink1, p.light ? 0.012 : 0.016);
    ctx.fill();
    drawRings(ctx, cx, cy, R, [0.2, 0.4, 0.6, 0.8, 1], p);

    if (!n) {
      ctx.font = `500 ${g.fontPx + 1}px ${p.fontSans}`;
      ctx.fillStyle = p.ink3;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(t('radar.noItems'), cx, cy);
      return;
    }

    const stepDeg = 360 / n;
    const pts = [];
    for (let i = 0; i < n; i++) {
      const deg = norm360(this._rot + i * stepDeg);
      const vn = clamp(this._cur[i] / max, 0, 1);
      pts.push({ deg, vn, pt: polar(cx, cy, deg, vn * R), tip: polar(cx, cy, deg, R) });
    }

    /* spokes */
    ctx.lineWidth = 1;
    ctx.strokeStyle = rgba(p.line, 0.95);
    ctx.beginPath();
    for (const q of pts) {
      ctx.moveTo(cx, cy);
      ctx.lineTo(q.tip[0], q.tip[1]);
    }
    ctx.stroke();

    /* gap wedges (below target) */
    const half = Math.min(10, stepDeg * 0.42) * DEG;
    for (let i = 0; i < n; i++) {
      const q = pts[i];
      if (q.vn >= tn) continue;
      const a = q.deg * DEG - Math.PI / 2;
      ctx.beginPath();
      ctx.arc(cx, cy, tn * R, a - half, a + half);
      ctx.arc(cx, cy, Math.max(q.vn * R, 1), a + half, a - half, true);
      ctx.closePath();
      ctx.fillStyle = rgba(p.warning, p.light ? 0.2 : 0.16);
      ctx.fill();
      const [gx, gy] = polar(cx, cy, q.deg, tn * R);
      ctx.strokeStyle = rgba(p.warning, 0.9);
      ctx.lineWidth = 1.25;
      ctx.beginPath();
      ctx.moveTo(q.pt[0], q.pt[1]);
      ctx.lineTo(gx, gy);
      ctx.stroke();
    }

    /* target ring (gold hairline) + label */
    ctx.lineWidth = 1;
    ctx.strokeStyle = rgba(p.gold, 0.95);
    ctx.beginPath();
    ctx.arc(cx, cy, tn * R, 0, TAU);
    ctx.stroke();

    /* score polygon */
    if (n >= 2) {
      ctx.beginPath();
      for (let i = 0; i < n; i++) {
        const q = pts[i].pt;
        if (i === 0) ctx.moveTo(q[0], q[1]);
        else ctx.lineTo(q[0], q[1]);
      }
      ctx.closePath();
      ctx.fillStyle = rgba(p.accent, 0.18);
      ctx.fill();
      ctx.shadowColor = rgba(p.accent, p.light ? 0.25 : 0.45);
      ctx.shadowBlur = 12;
      ctx.lineWidth = 2;
      ctx.strokeStyle = p.accent;
      ctx.stroke();
      ctx.shadowBlur = 0;
    }

    /* target label pill: rides the target ring midway between two axes (never over a score) */
    {
      const text = `${o.targetLabel || t('radar.target')} ${localizeDigits(String(Math.round(target)), p.numerals)}`;
      ctx.font = `500 9.5px ${p.fontMono}`;
      const tw = ctx.measureText(text).width;
      const pw = tw + 12;
      const ph = 15;
      const [lx, ly] = polar(cx, cy, norm360(this._rot + stepDeg / 2), tn * R);
      const px = lx - pw / 2;
      const py = ly - ph / 2;
      roundRect(ctx, px, py, pw, ph, 4);
      ctx.fillStyle = rgba(p.bg1, 0.92);
      ctx.fill();
      ctx.strokeStyle = rgba(p.gold, 0.8);
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.fillStyle = p.gold;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(text, lx, py + ph / 2 + 0.5);
    }

    /* vertex dots + score labels at tips */
    for (let i = 0; i < n; i++) {
      const q = pts[i];
      const [x, y] = q.pt;
      const v = this._cur[i];
      const tone = v >= target ? 'good' : v >= target - 15 ? 'warning' : 'serious';
      ctx.fillStyle = p[tone];
      ctx.beginPath();
      ctx.arc(x, y, 3.4, 0, TAU);
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = p.bg1;
      ctx.beginPath();
      ctx.arc(x, y, 4.4, 0, TAU);
      ctx.stroke();
      if (o.showScores) {
        const label = fmtValue(Math.round(v), p.numerals);
        ctx.font = `500 ${g.fontPx}px ${p.fontMono}`;
        const tw = ctx.measureText(label).width;
        const pw = tw + 8;
        const ph = g.fontPx + 4;
        // sit just inside the tip, along the axis, so it never collides with the outer label
        const [lx, ly] = polar(cx, cy, q.deg, Math.max(q.vn * R - 13, 14));
        roundRect(ctx, lx - pw / 2, ly - ph / 2, pw, ph, 3);
        ctx.fillStyle = rgba(p.bg1, 0.88);
        ctx.fill();
        ctx.fillStyle = p.ink1;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(label, lx, ly + 0.5);
      }
      this.addHit(x, y, { ...axes[i], kind: 'clause', index: i, value: v, target, tone }, o.hitRadius);
    }

    /* axis labels (upright, wrapped) */
    const labelFont = `500 ${g.fontPx}px ${p.fontSans}`;
    const key = `${R}|${labelFont}|${axes.map((a) => a && a.label).join('|')}`;
    if (!this._labelCache || this._labelCache.key !== key) {
      ctx.font = labelFont;
      this._labelCache = { key, lines: axes.map((a) => wrapText(ctx, (a && a.label) || '', g.labelW, 2)) };
    }
    for (let i = 0; i < n; i++) {
      const deg = pts[i].deg;
      const [tx, ty] = polar(cx, cy, deg, R + 12);
      const hx = Math.sin(deg * DEG);
      const vy = -Math.cos(deg * DEG);
      const lines = this._labelCache.lines[i];
      drawTipLabel(ctx, tx, ty, hx, vy, lines, g.lineH, [{ font: labelFont, color: p.ink2 }]);
    }

    /* center */
    ctx.fillStyle = rgba(p.accent, p.light ? 0.08 : 0.14);
    ctx.beginPath();
    ctx.arc(cx, cy, 9, 0, TAU);
    ctx.fill();
    ctx.fillStyle = p.ink3;
    ctx.beginPath();
    ctx.arc(cx, cy, 2, 0, TAU);
    ctx.fill();
  }
}

/* ------------------------------------------------------------------ */
/* Public bundle                                                       */
/* ------------------------------------------------------------------ */

export const radar = { radarLoop, RadarBase, SweepRadar, SensorRadar, SitePlanRadar, ComplianceRadar, readPalette, invalidatePalette };
export default radar;
