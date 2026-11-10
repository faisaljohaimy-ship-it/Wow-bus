/**
 * Biltix HSE — SVG charts (js/ui/charts.js)
 *
 * Plain ES module. Implements docs/ARCHITECTURE.md §5 plus v3 CONTRACT §7:
 *   lineChart, barChart, groupedBars, heatmap, segmentedBar, dumbbell (v3), sparkline,
 *   meter, gauge, ring, spider, tooltip (singleton), paletteFor.
 *
 * Every chart returns `{ el, update(data), table(), destroy() }` where `el` is a
 * `<div class="chart">` wrapping an `<svg>`; `update` re-renders in place and
 * `table()` builds the `<table class="chart-table">` twin for the card toggle.
 * Sparkline / meter / ring / gauge return `{ el, update, destroy }`.
 *
 * Language (v3): every built-in string (roles, legend label, table headers, tooltip
 * labels, "no data", tone names) comes from t('charts.*') (js/i18n/charts.js); numbers
 * go through fmt (locale + numerals aware). Categorical axes follow the document
 * direction (first category at the inline-start), time axes always run left→right.
 * Charts redraw on bus 'theme:change' and 'lang:change'. heatmap onCellClick receives
 * { value, ri, ci, row, col, event }.
 *
 * Rules in force (ARCHITECTURE.md §10 + the dataviz skill):
 *   - All data reaches the DOM through textContent / setAttribute, never innerHTML.
 *   - Colours are CSS custom properties ('var(--s1)' …); text uses ink tokens only.
 *   - Hairline solid grid (var(--line)); bars ≤ 24px with 4px rounded data-ends
 *     square at the baseline; 2px lines with round joins; ≥ 8px end markers with a
 *     2px surface ring; 2px surface gaps between touching fills.
 *   - Legend for ≥ 2 series (none for one); selective direct labels (endpoint / max).
 *   - Hover AND keyboard focus show the same tooltip; marks carry a localized value-first
 *     aria-label and use a roving tabindex (one tab stop per chart, arrows / Home / End
 *     move between marks); lines use a crosshair listing every series.
 *   - Responsive via ResizeObserver (debounced 60ms) → viewBox sized to the
 *     container width; heights fixed per call. RTL: the y-axis sits on the
 *     inline-start (right) side while the x-axis still flows left→right in time.
 *   - Reduced motion: tweens are skipped when the user prefers reduced motion or
 *     <html data-motion="reduce"> is set.
 *   - ResizeObservers disconnect on destroy() and whenever the element is found
 *     detached on the next resize / theme change (no MutationObserver needed).
 *
 * Side-effect free on import: the tooltip element and bus subscriptions are
 * created lazily on first use.
 */
import { fmt } from '../core/fmt.js';
import { bus } from '../core/bus.js';
import { t } from './i18n-bridge.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const TAU = Math.PI * 2;

/* Built-in chrome strings come from the 'charts' dictionary (js/i18n/charts.js) at render time, so a
   language switch (router re-mount or the lang:change re-render below) never shows stale text. */
const T = new Proxy({}, {
  get(_, key) {
    if (key === 'tones') return { good: t('charts.tones.good'), warning: t('charts.tones.warning'), serious: t('charts.tones.serious'), critical: t('charts.tones.critical') };
    return typeof key === 'string' ? t(`charts.${key}`) : undefined;
  },
});
const sep = () => t('charts.sep');

/* ------------------------------------------------------------------------- */
/* Small utilities                                                            */
/* ------------------------------------------------------------------------- */

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const num = (v, fallback = 0) => (isNum(v) ? v : (isNum(Number(v)) && v !== null && v !== '' ? Number(v) : fallback));
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const r2 = (v) => Math.round(v * 100) / 100;
const str = (v) => (v === null || v === undefined ? '' : String(v));
const arr = (v) => (Array.isArray(v) ? v : []);

let uidCounter = 0;
const uid = (prefix = 'ch') => `${prefix}-${(++uidCounter).toString(36)}`;

/** Create an SVG element with attributes (values coerced to strings). */
function svgEl(tag, attrs = {}, parent = null) {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') { el.setAttribute('class', Array.isArray(v) ? v.filter(Boolean).join(' ') : String(v)); continue; }
    if (k === 'style' && typeof v === 'object') {
      for (const [sk, sv] of Object.entries(v)) {
        if (sv === undefined || sv === null) continue;
        if (sk.startsWith('--')) el.style.setProperty(sk, String(sv)); else el.style[sk] = String(sv);
      }
      continue;
    }
    if (k === 'text') { el.textContent = String(v); continue; }
    el.setAttribute(k, String(v));
  }
  if (parent) parent.appendChild(el);
  return el;
}

/** Create an HTML element with class list, attributes and text. */
function htmlEl(tag, { class: cls, text, attrs = {}, style = {} } = {}, parent = null) {
  const el = document.createElement(tag);
  if (cls) el.className = Array.isArray(cls) ? cls.filter(Boolean).join(' ') : String(cls);
  if (text !== undefined && text !== null) el.textContent = String(text);
  for (const [k, v] of Object.entries(attrs)) if (v !== undefined && v !== null && v !== false) el.setAttribute(k, String(v));
  for (const [k, v] of Object.entries(style)) {
    if (v === undefined || v === null) continue;
    if (k.startsWith('--')) el.style.setProperty(k, String(v)); else el.style[k] = String(v);
  }
  if (parent) parent.appendChild(el);
  return el;
}

function clear(el) { while (el && el.firstChild) el.removeChild(el.firstChild); return el; }

/** Whether the element renders right-to-left (default for this app). */
function isRTL(el) {
  try {
    const node = el && el.isConnected ? el : document.documentElement;
    return getComputedStyle(node).direction !== 'ltr';
  } catch { return true; }
}

/** Reduced-motion preference, honouring the settings override on <html data-motion>. */
export function prefersReducedMotion() {
  try {
    const forced = document.documentElement.getAttribute('data-motion');
    if (forced === 'reduce') return true;
    if (forced === 'full') return false;
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch { return false; }
}

/** Ease-out cubic for value tweens. */
const easeOut = (t) => 1 - Math.pow(1 - t, 3);

/**
 * Tween a number over `ms`, calling onFrame(value) each frame; returns a cancel fn.
 * Jumps straight to the end under reduced motion.
 */
function tween(from, to, ms, onFrame) {
  if (prefersReducedMotion() || !isNum(from) || !isNum(to) || from === to || ms <= 0) {
    onFrame(to);
    return () => {};
  }
  let raf = 0;
  const start = performance.now();
  const step = (now) => {
    const t = clamp((now - start) / ms, 0, 1);
    onFrame(from + (to - from) * easeOut(t));
    if (t < 1) raf = requestAnimationFrame(step);
  };
  raf = requestAnimationFrame(step);
  return () => cancelAnimationFrame(raf);
}

/* ------------------------------------------------------------------------- */
/* Text measurement (canvas) — used to fit labels before drawing them        */
/* ------------------------------------------------------------------------- */

let measureCtx = null;
let fontCache = { sans: '', mono: '', at: 0, lang: '' };

/** App font stacks; --font-sans resolves per html[lang] (Arabic-first / Latin-first), so the cache is per language. */
function fontFamilies() {
  const now = Date.now();
  let lang = '';
  try { lang = document.documentElement.getAttribute('lang') || ''; } catch { lang = ''; }
  if (fontCache.sans && fontCache.lang === lang && now - fontCache.at < 2000) return fontCache;
  let sans = '';
  let mono = '';
  try {
    const cs = getComputedStyle(document.documentElement);
    sans = cs.getPropertyValue('--font-sans').trim();
    mono = (cs.getPropertyValue('--font-mono-mixed') || cs.getPropertyValue('--font-mono')).trim();
  } catch { /* fall through */ }
  fontCache = {
    sans: sans || '"IBM Plex Sans Arabic", system-ui, sans-serif',
    mono: mono || '"IBM Plex Mono", ui-monospace, monospace',
    at: now,
    lang,
  };
  return fontCache;
}

/** Approximate rendered width of `text` at `px` using the app fonts. */
function measure(text, px = 12, { mono = false, weight = 400 } = {}) {
  const s = str(text);
  if (!s) return 0;
  try {
    if (!measureCtx) measureCtx = document.createElement('canvas').getContext('2d');
    const fam = fontFamilies();
    measureCtx.font = `${weight} ${px}px ${mono ? fam.mono : fam.sans}`;
    return measureCtx.measureText(s).width;
  } catch {
    return s.length * px * 0.58;
  }
}

/** Shorten a label with an ellipsis until it fits `maxW` (measured). */
function fitText(text, maxW, px = 12, opts = {}) {
  const s = str(text);
  if (measure(s, px, opts) <= maxW) return s;
  let lo = 0;
  let hi = s.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (measure(`${s.slice(0, mid).trimEnd()}…`, px, opts) <= maxW) lo = mid; else hi = mid - 1;
  }
  return lo <= 0 ? '' : `${s.slice(0, lo).trimEnd()}…`;
}

/* ------------------------------------------------------------------------- */
/* Colour resolution — decides the ink used on top of a fill                 */
/* ------------------------------------------------------------------------- */

const colorCache = new Map();
let probeEl = null;

function parseColor(s) {
  const v = str(s).trim();
  let m = /^#([0-9a-f]{3,4})$/i.exec(v);
  if (m) {
    const h = m[1];
    return [parseInt(h[0] + h[0], 16), parseInt(h[1] + h[1], 16), parseInt(h[2] + h[2], 16)];
  }
  m = /^#([0-9a-f]{6})(?:[0-9a-f]{2})?$/i.exec(v);
  if (m) return [parseInt(m[1].slice(0, 2), 16), parseInt(m[1].slice(2, 4), 16), parseInt(m[1].slice(4, 6), 16)];
  m = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/i.exec(v);
  if (m) return [Number(m[1]), Number(m[2]), Number(m[3])];
  return null;
}

/**
 * Resolve any CSS colour expression ('var(--s1)', '#hex', 'rgb()', 'color-mix(…)')
 * to [r,g,b]. Cached per theme. Returns null when it cannot be resolved.
 */
function resolveColor(css) {
  const key = `${document.documentElement.getAttribute('data-theme') || ''}|${css}`;
  if (colorCache.has(key)) return colorCache.get(key);
  let rgb = parseColor(css);
  let value = str(css).trim();
  let depth = 0;
  while (!rgb && depth < 5) {
    const m = /^var\(\s*(--[\w-]+)\s*(?:,\s*([^)]+))?\)$/.exec(value);
    if (!m) break;
    let resolved = '';
    try { resolved = getComputedStyle(document.documentElement).getPropertyValue(m[1]).trim(); } catch { resolved = ''; }
    value = resolved || str(m[2]).trim();
    rgb = parseColor(value);
    depth += 1;
  }
  if (!rgb && value && document.body) {
    try {
      if (!probeEl) {
        probeEl = document.createElement('span');
        probeEl.setAttribute('aria-hidden', 'true');
        probeEl.style.cssText = 'position:fixed;inset-block-start:-9999px;inline-size:1px;block-size:1px;pointer-events:none;opacity:0';
      }
      document.body.appendChild(probeEl);
      probeEl.style.color = '';
      probeEl.style.color = value;
      rgb = parseColor(getComputedStyle(probeEl).color);
      probeEl.remove();
    } catch { rgb = null; }
  }
  colorCache.set(key, rgb);
  return rgb;
}

/** WCAG relative luminance of an [r,g,b] triple. */
function luminance(rgb) {
  const lin = rgb.map((c) => {
    const v = clamp(c / 255, 0, 1);
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
}

/**
 * Ink for a label inside a fill (segmented bar values, heatmap cells): the better of --ink-on-light /
 * --ink-on-dark against the fill, or `plate: true` when neither reaches 4.5:1 (the label then sits on an
 * opaque .cell-plate). Fills never change luminance on hover / focus / active (css/charts.css), so the
 * ratio computed here holds in every state.
 */
function insideInk(cssColor) {
  const bg = resolveColor(cssColor);
  if (!bg) return { cls: 'is-on-dark', plate: true };
  const lb = luminance(bg);
  const ratio = (a, b) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
  const darkInk = resolveColor('var(--ink-on-light)');
  const lightInk = resolveColor('var(--ink-on-dark)');
  const cDark = darkInk ? ratio(luminance(darkInk), lb) : 0;
  const cLight = lightInk ? ratio(luminance(lightInk), lb) : 0;
  return { cls: cDark >= cLight ? 'is-on-light' : 'is-on-dark', plate: Math.max(cDark, cLight) < 4.5 };
}


/* ------------------------------------------------------------------------- */
/* Palette                                                                    */
/* ------------------------------------------------------------------------- */

const PALETTE_SIZE = 8;

/**
 * Categorical colour for a 0-based series index, fixed order, never cycled.
 * Throws past the eighth series: fold extra series into "أخرى" or facet instead.
 */
export function paletteFor(index) {
  const i = Number(index);
  if (!Number.isInteger(i) || i < 0 || i >= PALETTE_SIZE) {
    throw new RangeError(`paletteFor: index ${String(index)} is outside the fixed categorical palette (0..${PALETTE_SIZE - 1})`);
  }
  return `var(--s${i + 1})`;
}

/** Colour for a series object: explicit colour, else the fixed palette slot. */
function seriesColor(series, index) {
  return str(series && series.color).trim() || paletteFor(index);
}

/* ------------------------------------------------------------------------- */
/* Scales & ticks                                                             */
/* ------------------------------------------------------------------------- */

function niceStep(raw) {
  if (!(raw > 0)) return 1;
  const pow = Math.pow(10, Math.floor(Math.log10(raw)));
  const f = raw / pow;
  const m = f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10;
  return m * pow;
}

/** Linear y scale from 0 (or below) to a nice maximum with ~`count` ticks. */
function niceScale(values, count = 4) {
  const finite = values.filter(isNum);
  let min = Math.min(0, ...finite);
  let max = Math.max(0, ...finite);
  if (!finite.length) { min = 0; max = 1; }
  if (max === min) max = min + (min === 0 ? 1 : Math.abs(min) * 0.5);
  const step = niceStep((max - min) / Math.max(1, count));
  const lo = Math.floor(min / step) * step;
  const hi = Math.ceil(max / step) * step;
  const ticks = [];
  for (let v = lo; v <= hi + step / 1e6 && ticks.length < 50; v += step) ticks.push(r2(v));
  const decimals = step >= 1 ? 0 : step >= 0.1 ? 1 : 2;
  return { min: lo, max: hi, step, ticks, decimals };
}

/** Formatter for tick values: respects a custom yFormat, adds decimals for fmt.num. */
function tickFormatter(format, decimals) {
  if (typeof format === 'function' && format !== fmt.num) return (v) => str(format(v));
  return (v) => fmt.num(v, { maximumFractionDigits: decimals });
}

/* ------------------------------------------------------------------------- */
/* Responsive container                                                       */
/* ------------------------------------------------------------------------- */

const FALLBACK_WIDTH = 600;

/**
 * Watch the chart container's inline size. `onWidth(w)` fires (debounced 60ms)
 * when the width changes; the observer disconnects itself once the element has
 * left the document. Returns a disposer.
 */
function observeWidth(el, onWidth, current = () => -1) {
  let timer = 0;
  let disposed = false;
  const fire = (w) => {
    if (disposed) return;
    if (!el.isConnected) { dispose(); return; }
    const width = Math.round(w || el.clientWidth || 0);
    if (width > 0 && width !== current()) onWidth(width);
  };
  let ro = null;
  let onResize = null;
  if (typeof ResizeObserver === 'function') {
    ro = new ResizeObserver((entries) => {
      clearTimeout(timer);
      const w = entries && entries[0] ? entries[0].contentRect.width : 0;
      timer = setTimeout(() => fire(w), 60);
    });
    ro.observe(el);
  } else {
    onResize = () => { clearTimeout(timer); timer = setTimeout(() => fire(0), 60); };
    window.addEventListener('resize', onResize);
  }
  function dispose() {
    if (disposed) return;
    disposed = true;
    clearTimeout(timer);
    if (ro) ro.disconnect();
    if (onResize) window.removeEventListener('resize', onResize);
  }
  return dispose;
}

/** Current usable width of a container (fallback when detached / hidden). */
function widthOf(el) {
  const w = el && el.clientWidth;
  return w && w > 40 ? w : FALLBACK_WIDTH;
}

/**
 * Shared chart shell: <div class="chart"> + <svg> + legend host. Wires resize +
 * theme re-render and exposes destroy().
 */
function chartShell({ className = '', ariaLabel = '', role = 'group', render }) {
  const el = htmlEl('div', { class: ['chart', className] });
  const svg = svgEl('svg', { xmlns: SVG_NS, role, 'aria-label': ariaLabel || null, 'aria-roledescription': t('charts.roles.chart') }, el);
  const legendHost = htmlEl('div', { class: 'chart-legend-host' }, el);
  let destroyed = false;
  let width = 0;
  let offTheme = null;
  let offLang = null;
  let dispose = null;

  const shell = {
    el, svg, legendHost,
    get width() { return width || widthOf(el); },
    redraw: () => draw(0),
    destroy,
    onRendered: null,   // set by bindMarks: re-applies the roving tabindex after every render
  };
  function draw(w) {
    if (destroyed) return;
    width = w || width || widthOf(el);
    try { render(width); } catch (err) { console.error('[biltix-hse] chart render failed:', err); }
    if (typeof shell.onRendered === 'function') { try { shell.onRendered(); } catch { /* never break a render */ } }
  }
  function destroy() {
    if (destroyed) return;
    destroyed = true;
    if (dispose) dispose();
    if (offTheme) offTheme();
    if (offLang) offLang();
    tooltip.hideIfOwner(el);
  }
  dispose = observeWidth(el, draw, () => width);
  const redrawLater = () => {
    if (!el.isConnected) { destroy(); return; }
    requestAnimationFrame(() => draw(0));
  };
  offTheme = bus.on('theme:change', redrawLater);
  // A chart that survives a language switch (shell-level, or a view that patches instead of re-mounting)
  // redraws: direction, fonts and built-in strings all depend on the language.
  offLang = bus.on('lang:change', () => {
    if (!el.isConnected) { destroy(); return; }
    svg.setAttribute('aria-roledescription', t(`charts.roles.${shell.role || 'chart'}`));
    requestAnimationFrame(() => draw(0));
  });
  return shell;
}

/** Size the svg: viewBox follows the measured width, height is fixed per call. */
function setViewBox(svg, w, h) {
  svg.setAttribute('viewBox', `0 0 ${Math.max(1, Math.round(w))} ${Math.max(1, Math.round(h))}`);
  svg.setAttribute('width', '100%');
  svg.setAttribute('height', String(Math.round(h)));
  svg.style.blockSize = `${Math.round(h)}px`;
}

/* ------------------------------------------------------------------------- */
/* Tooltip singleton                                                          */
/* ------------------------------------------------------------------------- */

let tipEl = null;
let tipOwner = null;
let tipListeners = false;
let tipAnchor = null;      // element the tooltip is anchored to (keyboard focus), else null
let tipContent = null;     // last payload shown for the anchor (re-anchoring after scroll)
let focusShownAt = 0;      // performance.now() of the last focus-triggered show
const FOCUS_SCROLL_GRACE_MS = 250;

/** Scrolling hides pointer tooltips; a focus-anchored tooltip survives the scroll that focus itself caused. */
function onAnyScroll() {
  if (!tipEl || tipEl.hidden) return;
  if (tipAnchor) {
    if (performance.now() - focusShownAt < FOCUS_SCROLL_GRACE_MS) { tooltip.showAt(tipAnchor, tipContent, { keepStamp: true }); return; }
    if (!tipAnchor.isConnected) { tooltip.hide(); return; }
  }
  tooltip.hide();
}
function onScrollEnd() {
  if (!tipEl || tipEl.hidden || !tipAnchor || !tipAnchor.isConnected) return;
  tooltip.showAt(tipAnchor, tipContent, { keepStamp: true });
}

function ensureTooltip() {
  if (tipEl && tipEl.isConnected) return tipEl;
  tipEl = document.getElementById('tooltip');
  if (!tipEl) {
    tipEl = htmlEl('div', { class: 'tooltip', attrs: { id: 'tooltip', role: 'tooltip', hidden: '' } });
    document.body.appendChild(tipEl);
  }
  tipEl.classList.add('tooltip');
  if (!tipEl.hasAttribute('role')) tipEl.setAttribute('role', 'tooltip');
  if (!tipListeners) {
    tipListeners = true;
    window.addEventListener('scroll', onAnyScroll, { capture: true, passive: true });
    if ('onscrollend' in window) window.addEventListener('scrollend', onScrollEnd, { capture: true, passive: true });
    window.addEventListener('keydown', (e) => { if (e.key === 'Escape') tooltip.hide(); });
    window.addEventListener('blur', () => tooltip.hide());
  }
  return tipEl;
}

export const tooltip = {
  /**
   * Show the tooltip near viewport point (x, y).
   * @param {number} x viewport x
   * @param {number} y viewport y
   * @param {{title?:string, rows?:Array<{label?:string, value:string|number, color?:string, kind?:'line'|'rect'|'dot'}>, note?:string, owner?:Element}} content
   */
  show(x, y, { title = '', rows = [], note = '', owner = null } = {}) {
    const tip = ensureTooltip();
    clear(tip);
    if (title) htmlEl('div', { class: 'tooltip-title', text: title }, tip);
    if (rows && rows.length) {
      const list = htmlEl('ul', { class: 'tooltip-rows' }, tip);
      for (const row of rows) {
        if (!row) continue;
        const li = htmlEl('li', { class: 'tooltip-row' }, list);
        if (row.color) {
          htmlEl('i', { class: ['tooltip-swatch', row.kind === 'line' ? 'is-line' : null], style: { '--key': row.color }, attrs: { 'aria-hidden': 'true' } }, li);
        }
        htmlEl('strong', { class: 'tooltip-value', text: str(row.value) }, li);
        if (row.label !== undefined && row.label !== null && str(row.label) !== '') htmlEl('span', { class: 'tooltip-label', text: row.label }, li);
      }
    }
    if (note) htmlEl('div', { class: 'tooltip-note', text: note }, tip);
    tipOwner = owner;
    if (!tooltip._anchoring) { tipAnchor = null; tipContent = null; }   // pointer-driven show: no anchor
    tip.hidden = false;
    tip.style.visibility = 'hidden';
    const rect = tip.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const gap = 14;
    const rtl = isRTL(tip);
    // Prefer the inline-start side of the pointer (left in RTL), flip when clipped.
    let left = rtl ? x - gap - rect.width : x + gap;
    if (left < 8) left = x + gap;
    if (left + rect.width > vw - 8) left = Math.max(8, x - gap - rect.width);
    let top = y + gap;
    if (top + rect.height > vh - 8) top = Math.max(8, y - gap - rect.height);
    tip.style.insetBlockStart = `${Math.round(top)}px`;
    tip.style.insetInlineStart = `${Math.round(rtl ? vw - left - rect.width : left)}px`;
    tip.style.visibility = '';
  },

  /** Hide the tooltip. */
  hide() {
    if (!tipEl) return;
    tipEl.hidden = true;
    tipOwner = null;
    tipAnchor = null;
    tipContent = null;
  },

  /** Hide only when the given chart element owns the current tooltip. */
  hideIfOwner(owner) {
    if (tipOwner && (tipOwner === owner || (owner && owner.contains && owner.contains(tipOwner)))) tooltip.hide();
  },

  /**
   * Show the tooltip anchored to a DOM/SVG element (keyboard focus). The tooltip then ignores
   * the scroll that focusing an off-screen mark triggers (~250 ms) and re-anchors on scrollend.
   */
  showAt(target, content, { keepStamp = false } = {}) {
    let r;
    try { r = target.getBoundingClientRect(); } catch { r = null; }
    if (!r) return;
    tooltip._anchoring = true;
    try { tooltip.show(r.left + r.width / 2, r.top, content); } finally { tooltip._anchoring = false; }
    tipAnchor = target;
    tipContent = content;
    if (!keepStamp) focusShownAt = performance.now();
  },
  _anchoring: false,
};

/* ------------------------------------------------------------------------- */
/* Mark interaction: hover + focus → tooltip, dim siblings                    */
/* ------------------------------------------------------------------------- */

/**
 * Wire tooltips for every descendant carrying `data-i`. `content(i)` returns the
 * tooltip payload. Hover follows the pointer; focus anchors to the mark.
 */
function bindMarks(shell, content, { onActivate = null, grid = false } = {}) {
  const { el, svg } = shell;
  let active = null;
  const markFor = (target) => {
    const node = target && target.closest ? target.closest('[data-i]') : null;
    return node && svg.contains(node) ? node : null;
  };

  /* Roving tabindex: exactly one mark per chart is in the tab order (RTL-9). Arrow keys,
     Home and End move between marks; the chart remembers the last mark across re-renders. */
  let rovingKey = null;
  const marksOf = () => Array.from(svg.querySelectorAll('.mark[data-i]'));
  const keyOf = (node) => `${node.getAttribute('data-i')}|${node.getAttribute('data-j') || ''}`;
  const setRoving = (node, marks = marksOf()) => {
    rovingKey = keyOf(node);
    marks.forEach((m) => m.setAttribute('tabindex', m === node ? '0' : '-1'));
  };
  shell.onRendered = () => {
    const marks = marksOf();
    if (!marks.length) return;
    const keep = marks.find((m) => keyOf(m) === rovingKey) || marks[0];
    setRoving(keep, marks);
  };
  svg.addEventListener('keydown', (e) => {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(e.key)) return;
    const node = markFor(e.target);
    if (!node || !node.classList.contains('mark')) return;
    const marks = marksOf();
    const idx = marks.indexOf(node);
    if (idx < 0) return;
    const rtl = isRTL(el);
    const inlineNext = rtl ? 'ArrowLeft' : 'ArrowRight';   // categories flow with the inline direction
    const inlinePrev = rtl ? 'ArrowRight' : 'ArrowLeft';
    let target = null;
    if (grid) {
      // 2-D matrix: data-i = row, data-j = column
      const ri = Number(node.getAttribute('data-i'));
      const ci = Number(node.getAttribute('data-j'));
      const at = (r, c) => marks.find((m) => Number(m.getAttribute('data-i')) === r && Number(m.getAttribute('data-j')) === c) || null;
      const rowMarks = marks.filter((m) => Number(m.getAttribute('data-i')) === ri);
      if (e.key === 'ArrowUp') target = at(ri - 1, ci);
      else if (e.key === 'ArrowDown') target = at(ri + 1, ci);
      else if (e.key === inlineNext) target = at(ri, ci + 1);
      else if (e.key === inlinePrev) target = at(ri, ci - 1);
      else if (e.key === 'Home') target = rowMarks[0] || null;
      else target = rowMarks[rowMarks.length - 1] || null;
    } else if (e.key === 'ArrowDown' || e.key === inlineNext) target = marks[Math.min(marks.length - 1, idx + 1)];
    else if (e.key === 'ArrowUp' || e.key === inlinePrev) target = marks[Math.max(0, idx - 1)];
    else target = e.key === 'Home' ? marks[0] : marks[marks.length - 1];
    e.preventDefault();
    if (target && target !== node) { setRoving(target, marks); target.focus(); }
  });
  const setActive = (node) => {
    if (active && active !== node) active.classList.remove('is-active');
    active = node;
    if (node) { node.classList.add('is-active'); el.classList.add('has-active'); } else el.classList.remove('has-active');
  };
  const payload = (node) => {
    const i = Number(node.getAttribute('data-i'));
    const j = node.hasAttribute('data-j') ? Number(node.getAttribute('data-j')) : undefined;
    const c = content(i, j, node);
    return c ? { ...c, owner: el } : null;
  };
  svg.addEventListener('pointermove', (e) => {
    const node = markFor(e.target);
    if (!node) { setActive(null); tooltip.hideIfOwner(el); return; }
    const mark = svg.querySelector(`.mark[data-i="${node.getAttribute('data-i')}"]${node.hasAttribute('data-j') ? `[data-j="${node.getAttribute('data-j')}"]` : ''}`) || node;
    setActive(mark);
    const c = payload(node);
    if (c) tooltip.show(e.clientX, e.clientY, c);
  });
  svg.addEventListener('pointerleave', () => { setActive(null); tooltip.hideIfOwner(el); });
  svg.addEventListener('focusin', (e) => {
    const node = markFor(e.target);
    if (!node) return;
    if (node.classList.contains('mark')) setRoving(node);
    setActive(node);
    const c = payload(node);
    if (c) tooltip.showAt(node, c);
  });
  svg.addEventListener('focusout', () => { setActive(null); tooltip.hideIfOwner(el); });
  if (typeof onActivate === 'function') {
    svg.addEventListener('click', (e) => { const node = markFor(e.target); if (node) onActivate(node, e); });
    svg.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      const node = markFor(e.target);
      if (!node) return;
      e.preventDefault();
      onActivate(node, e);
    });
  }
}

/* ------------------------------------------------------------------------- */
/* Legend & table twins                                                       */
/* ------------------------------------------------------------------------- */

/**
 * Legend for ≥ 2 entries (returns null for fewer). `kind` picks the key shape.
 * Static: identity only, never numbers (the tooltip and table carry values).
 */
function buildLegend(host, entries, { kind = 'rect' } = {}) {
  clear(host);
  if (!entries || entries.length < 2) { host.hidden = true; return null; }
  host.hidden = false;
  const ul = htmlEl('ul', { class: 'legend', attrs: { 'aria-label': t('charts.legend') } }, host);
  for (const e of entries) {
    const li = htmlEl('li', { class: 'legend-item' }, ul);
    const k = e.kind || kind;
    const style = { '--key': e.color };
    // ring: hollow key (dumbbell "from" marker) drawn inline so it does not depend on a stylesheet rule
    if (k === 'ring') Object.assign(style, { background: 'transparent', border: `2px solid ${e.color}`, borderRadius: '50%', boxSizing: 'border-box' });
    htmlEl('span', { class: ['legend-key', k === 'line' ? 'is-line' : (k === 'dot' || k === 'ring') ? 'is-dot' : null, k === 'ring' ? 'is-ring' : null], style, attrs: { 'aria-hidden': 'true' } }, li);
    htmlEl('span', { class: 'legend-label', text: e.label }, li);
  }
  return ul;
}

/**
 * Build an accessible <table class="chart-table"> twin.
 * columns: [{label, numeric}], rows: [[cell, …]] (first cell is the row header),
 * footer: optional [cell, …].
 */
function buildTable({ caption = '', columns = [], rows = [], footer = null }) {
  const table = htmlEl('table', { class: 'chart-table' });
  if (caption) htmlEl('caption', { text: caption }, table);
  const thead = htmlEl('thead', {}, table);
  const hr = htmlEl('tr', {}, thead);
  columns.forEach((c) => htmlEl('th', { class: c.numeric ? 'num' : null, text: c.label, attrs: { scope: 'col' } }, hr));
  const tbody = htmlEl('tbody', {}, table);
  if (!rows.length) {
    const tr = htmlEl('tr', {}, tbody);
    htmlEl('td', { text: T.noData, attrs: { colspan: String(Math.max(1, columns.length)) } }, tr);
  }
  rows.forEach((cells) => {
    const tr = htmlEl('tr', {}, tbody);
    cells.forEach((cell, ci) => {
      const col = columns[ci] || {};
      const node = ci === 0
        ? htmlEl('th', { attrs: { scope: 'row' } }, tr)
        : htmlEl('td', { class: col.numeric ? 'num' : null }, tr);
      if (cell instanceof Node) node.appendChild(cell); else node.textContent = str(cell);
    });
  });
  if (footer && footer.length) {
    const tfoot = htmlEl('tfoot', {}, table);
    const tr = htmlEl('tr', {}, tfoot);
    footer.forEach((cell, ci) => htmlEl('td', { class: (columns[ci] || {}).numeric ? 'num' : null, text: str(cell) }, tr));
  }
  return table;
}

/** Table cell with a colour key beside a label (series identity in tables). */
function keyedCell(label, color) {
  const frag = document.createDocumentFragment();
  htmlEl('span', { class: 'legend-key', style: { '--key': color }, attrs: { 'aria-hidden': 'true' } }, frag);
  frag.appendChild(document.createTextNode(str(label)));
  return frag;
}

/** Share of total as "٤٦٪" / "46%" (0 total → "—"). */
function shareOf(value, total) {
  if (!(total > 0)) return '—';
  return fmt.pct((value / total) * 100, value / total < 0.1 && value > 0 ? 1 : 0);
}

/** Anchors in physical terms, independent of the document direction. */
function anchors(rtl) {
  return { left: rtl ? 'end' : 'start', right: rtl ? 'start' : 'end', middle: 'middle' };
}

/** Pick evenly spaced label indices that fit without collisions (always keeps the last). */
function thinIndices(n, slotW, maxLabelW) {
  if (n <= 0) return [];
  const every = Math.max(1, Math.ceil((maxLabelW + 10) / Math.max(1, slotW)));
  const out = [];
  for (let i = n - 1; i >= 0; i -= every) out.push(i);
  return out.reverse();
}

/* ------------------------------------------------------------------------- */
/* Line chart                                                                 */
/* ------------------------------------------------------------------------- */

/**
 * Multi-series line chart. Y-axis on the inline-start side, x flowing left→right.
 * @param {{series:Array<{id?:string,label:string,color?:string,values:number[]}>, labels:string[], height?:number, yFormat?:Function, area?:boolean, ariaLabel?:string, xLabel?:string}} opts
 */
export function lineChart(opts = {}) {
  const o = {
    series: [], labels: [], height: 220, yFormat: fmt.num, area: false, ariaLabel: '', xLabel: T.period,
    ...opts,
  };
  let geom = null; // { xs, ys[][], top, bottom, left, right, W, H }
  let hoverLayer = null;
  let rovingIndex = 0; // the one x-column in the tab order (RTL-9)

  const shell = chartShell({ className: 'chart-line', ariaLabel: o.ariaLabel, render });
  const { svg, el } = shell;
  svg.setAttribute('aria-roledescription', t('charts.roles.line'));
  shell.role = 'line';

  function seriesList() {
    return arr(o.series).map((s, i) => ({ ...s, label: str(s.label), values: arr(s.values).map((v) => (isNum(v) ? v : null)), color: seriesColor(s, i) }));
  }

  function render(W) {
    clear(svg);
    geom = null;
    hoverLayer = null;
    const H = num(o.height, 220);
    const series = seriesList();
    const labels = arr(o.labels).map(str);
    const n = Math.max(labels.length, ...series.map((s) => s.values.length), 0);
    setViewBox(svg, W, H);
    const rtl = isRTL(el);
    const A = anchors(rtl);
    if (!n || !series.length) {
      svgEl('text', { x: W / 2, y: H / 2, 'text-anchor': 'middle', class: 'label is-muted', text: T.noData }, svg);
      buildLegend(shell.legendHost, []);
      return;
    }
    const all = series.flatMap((s) => s.values).filter(isNum);
    const scale = niceScale(all, 4);
    const fmtTick = tickFormatter(o.yFormat, scale.decimals);
    const tickLabels = scale.ticks.map(fmtTick);
    const yAxisW = Math.ceil(Math.max(...tickLabels.map((t) => measure(t, 11, { mono: true })))) + 10;
    const top = 16;
    const bottom = 26;
    const plotH = Math.max(40, H - top - bottom);
    const left = rtl ? 8 : yAxisW;
    const right = rtl ? W - yAxisW : W - 8;
    const plotW = Math.max(10, right - left);
    const y = (v) => top + plotH - ((v - scale.min) / (scale.max - scale.min || 1)) * plotH;
    const x = (i) => (n === 1 ? left + plotW / 2 : left + (i / (n - 1)) * plotW);
    const axisX = rtl ? right + 6 : left - 6;

    // Grid + y ticks
    const grid = svgEl('g', { class: 'grid', 'aria-hidden': 'true' }, svg);
    scale.ticks.forEach((t, k) => {
      const yy = Math.round(y(t)) + 0.5;
      svgEl('line', { x1: left, x2: right, y1: yy, y2: yy, class: t === 0 ? 'axis-line' : 'grid-line' }, grid);
      svgEl('text', { x: axisX, y: yy + 4, 'text-anchor': rtl ? A.left : A.right, class: 'axis-tick num', text: tickLabels[k] }, grid);
    });
    if (!scale.ticks.includes(0)) {
      const yy = Math.round(top + plotH) + 0.5;
      svgEl('line', { x1: left, x2: right, y1: yy, y2: yy, class: 'axis-line' }, grid);
    }
    // X labels (thinned to fit)
    const maxLabelW = Math.max(...labels.map((l) => measure(l, 11)), 0);
    const slotW = n > 1 ? plotW / (n - 1) : plotW;
    const show = new Set(thinIndices(n, slotW, maxLabelW));
    const xg = svgEl('g', { class: 'axis axis-x', 'aria-hidden': 'true' }, svg);
    labels.forEach((l, i) => {
      if (!show.has(i)) return;
      const w = measure(l, 11);
      const cx = clamp(x(i), w / 2 + 2, W - w / 2 - 2);
      svgEl('text', { x: cx, y: H - 8, 'text-anchor': 'middle', class: 'axis-tick', text: l }, xg);
    });

    // Series
    const xs = Array.from({ length: n }, (_, i) => x(i));
    const ys = series.map((s) => Array.from({ length: n }, (_, i) => (isNum(s.values[i]) ? y(s.values[i]) : null)));
    const baseY = y(Math.max(scale.min, 0));
    const sg = svgEl('g', { class: 'series-layer' }, svg);
    series.forEach((s, si) => {
      let d = '';
      let area = '';
      let open = false;
      let segStart = -1;
      for (let i = 0; i < n; i += 1) {
        const yy = ys[si][i];
        if (yy === null) {
          if (open) { area += ` L${r2(xs[i - 1])},${r2(baseY)} Z`; open = false; }
          continue;
        }
        if (!open) { d += `M${r2(xs[i])},${r2(yy)}`; area += `M${r2(xs[i])},${r2(baseY)} L${r2(xs[i])},${r2(yy)}`; open = true; segStart = i; }
        else { d += ` L${r2(xs[i])},${r2(yy)}`; area += ` L${r2(xs[i])},${r2(yy)}`; }
        if (i === n - 1 && open) { area += ` L${r2(xs[i])},${r2(baseY)} Z`; }
        if (segStart === i && (i === n - 1 || ys[si][i + 1] === null)) {
          // isolated point: draw a marker so it is visible
          svgEl('circle', { cx: xs[i], cy: yy, r: 4, class: 'marker', style: { fill: s.color } }, sg);
        }
      }
      if (o.area && area) svgEl('path', { d: area, class: 'area', style: { fill: s.color } }, sg);
      if (d) svgEl('path', { d, class: 'line series', style: { stroke: s.color } }, sg);
      // End marker (≥ 8px with 2px surface ring)
      let last = n - 1;
      while (last >= 0 && ys[si][last] === null) last -= 1;
      if (last >= 0) svgEl('circle', { cx: xs[last], cy: ys[si][last], r: 4.5, class: 'marker', style: { fill: s.color } }, sg);
    });

    // Selective direct labels: endpoint per series (≤ 4 series), + max for one series
    const labelsLayer = svgEl('g', { class: 'direct-labels', 'aria-hidden': 'true' }, svg);
    const placed = [];
    const inward = rtl ? -1 : 1;                 // away from the y-axis, into the plot
    const tryLabel = (px, py, text, strong) => {
      const w = measure(text, 11, { mono: true, weight: 500 });
      let ly = py - 10;
      if (ly < 10) ly = py + 16;
      // keep the label clear of the tick column on the inline-start side
      const lo = rtl ? w / 2 + 2 : left + w / 2 + 8;
      const hi = rtl ? right - w / 2 - 8 : W - w / 2 - 2;
      let lx = px + inward * (w / 2 + 10);
      if (lx < lo || lx > hi) lx = clamp(px, lo, hi);
      const collides = placed.some((p) => Math.abs(p.x - lx) < (p.w + w) / 2 + 4 && Math.abs(p.y - ly) < 12);
      if (collides) return;
      placed.push({ x: lx, y: ly, w });
      svgEl('text', { x: lx, y: ly, 'text-anchor': 'middle', class: ['value-label', strong ? 'is-strong' : null], text }, labelsLayer);
    };
    if (series.length <= 4) {
      series.forEach((s, si) => {
        let last = n - 1;
        while (last >= 0 && ys[si][last] === null) last -= 1;
        if (last >= 0) tryLabel(xs[last], ys[si][last], fmtTick(s.values[last]), true);
      });
    }
    if (series.length === 1) {
      const vals = series[0].values;
      let mi = -1;
      vals.forEach((v, i) => { if (isNum(v) && (mi < 0 || v > vals[mi])) mi = i; });
      if (mi >= 0 && mi !== n - 1) tryLabel(xs[mi], ys[0][mi], fmtTick(vals[mi]), false);
    }

    // Keyboard-focusable columns (one per x) → same crosshair + tooltip as hover
    const hits = svgEl('g', { class: 'hit-layer' }, svg);
    for (let i = 0; i < n; i += 1) {
      const x0 = i === 0 ? left : (xs[i - 1] + xs[i]) / 2;
      const x1 = i === n - 1 ? right : (xs[i] + xs[i + 1]) / 2;
      const desc = series.map((s) => `${fmtTick(s.values[i])} ${s.label}`).join(sep());
      svgEl('rect', {
        x: x0, y: top, width: Math.max(1, x1 - x0), height: plotH, class: 'hit-area', 'data-i': i,
        tabindex: i === Math.min(rovingIndex, n - 1) ? 0 : -1, role: 'img', 'aria-label': `${labels[i] || ''}: ${desc}`,
      }, hits);
    }
    hoverLayer = svgEl('g', { class: 'hover-layer', 'aria-hidden': 'true' }, svg);
    geom = { xs, ys, top, plotH, left, right, W, H, series, labels, fmtTick, baseY: top + plotH };
    buildLegend(shell.legendHost, series.map((s) => ({ label: s.label, color: s.color })), { kind: 'line' });
  }

  function showIndex(i, clientX, clientY, anchorNode) {
    if (!geom || !hoverLayer) return;
    clear(hoverLayer);
    const { xs, ys, top, baseY, series, labels, fmtTick } = geom;
    const xx = Math.round(xs[i]) + 0.5;
    svgEl('line', { x1: xx, x2: xx, y1: top, y2: baseY, class: 'crosshair' }, hoverLayer);
    series.forEach((s, si) => {
      if (ys[si][i] === null) return;
      svgEl('circle', { cx: xs[i], cy: ys[si][i], r: 4.5, class: 'crosshair-dot', style: { stroke: s.color } }, hoverLayer);
    });
    const rows = series.map((s) => ({ value: fmtTick(s.values[i]), label: s.label, color: s.color, kind: 'line' }));
    const content = { title: labels[i] || '', rows, owner: el };
    if (anchorNode) tooltip.showAt(anchorNode, content); else tooltip.show(clientX, clientY, content);
  }
  function hideHover() { if (hoverLayer) clear(hoverLayer); tooltip.hideIfOwner(el); }
  function nearestIndex(clientX) {
    if (!geom) return -1;
    const rect = svg.getBoundingClientRect();
    const px = ((clientX - rect.left) / Math.max(1, rect.width)) * geom.W;
    let best = 0;
    let bestD = Infinity;
    geom.xs.forEach((x, i) => { const d = Math.abs(x - px); if (d < bestD) { bestD = d; best = i; } });
    return best;
  }
  svg.addEventListener('pointermove', (e) => { const i = nearestIndex(e.clientX); if (i >= 0) showIndex(i, e.clientX, e.clientY); });
  svg.addEventListener('pointerleave', hideHover);
  svg.addEventListener('focusin', (e) => {
    const node = e.target && e.target.closest ? e.target.closest('[data-i]') : null;
    if (!node) return;
    rovingIndex = Number(node.getAttribute('data-i')) || 0;
    svg.querySelectorAll('.hit-area[data-i]').forEach((r) => r.setAttribute('tabindex', r === node ? '0' : '-1'));
    showIndex(rovingIndex, 0, 0, node);
  });
  svg.addEventListener('focusout', hideHover);
  svg.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight' && e.key !== 'Home' && e.key !== 'End') return;
    const node = e.target && e.target.closest ? e.target.closest('[data-i]') : null;
    if (!node || !geom) return;
    const n = geom.xs.length;
    let i = Number(node.getAttribute('data-i'));
    if (e.key === 'ArrowRight') i = Math.min(n - 1, i + 1);      // time flows left→right
    else if (e.key === 'ArrowLeft') i = Math.max(0, i - 1);
    else i = e.key === 'Home' ? 0 : n - 1;
    const next = svg.querySelector(`.hit-area[data-i="${i}"]`);
    if (next) { e.preventDefault(); next.focus(); }
  });

  shell.redraw();
  return {
    el,
    update(data = {}) { Object.assign(o, data || {}); shell.redraw(); },
    table() {
      const series = seriesList();
      const labels = arr(o.labels).map(str);
      const scale = niceScale(series.flatMap((s) => s.values).filter(isNum), 4);
      const f = tickFormatter(o.yFormat, scale.decimals);
      return buildTable({
        caption: o.ariaLabel,
        columns: [{ label: o.xLabel || T.period }, ...series.map((s) => ({ label: s.label, numeric: true }))],
        rows: labels.map((l, i) => [l, ...series.map((s) => f(s.values[i]))]),
      });
    },
    destroy: shell.destroy,
  };
}

/* ------------------------------------------------------------------------- */
/* Bar geometry helpers                                                       */
/* ------------------------------------------------------------------------- */

/** Horizontal bar path: square at the baseline x0, 4px rounded data-end. dir = -1 grows leftwards. */
function hBarPath(x0, y0, len, h, dir) {
  const L = Math.max(0, len);
  const r = Math.min(4, L / 2, h / 2);
  const xe = x0 + dir * L;
  if (L <= 0) return '';
  if (dir < 0) {
    return `M${r2(x0)},${r2(y0)} H${r2(xe + r)} Q${r2(xe)},${r2(y0)} ${r2(xe)},${r2(y0 + r)} V${r2(y0 + h - r)} Q${r2(xe)},${r2(y0 + h)} ${r2(xe + r)},${r2(y0 + h)} H${r2(x0)} Z`;
  }
  return `M${r2(x0)},${r2(y0)} H${r2(xe - r)} Q${r2(xe)},${r2(y0)} ${r2(xe)},${r2(y0 + r)} V${r2(y0 + h - r)} Q${r2(xe)},${r2(y0 + h)} ${r2(xe - r)},${r2(y0 + h)} H${r2(x0)} Z`;
}

/** Vertical column path: square at baseline y0 (bottom), 4px rounded cap. */
function vBarPath(x, y0, w, len) {
  const L = Math.max(0, len);
  const r = Math.min(4, w / 2, L / 2);
  const yt = y0 - L;
  if (L <= 0) return '';
  return `M${r2(x)},${r2(y0)} V${r2(yt + r)} Q${r2(x)},${r2(yt)} ${r2(x + r)},${r2(yt)} H${r2(x + w - r)} Q${r2(x + w)},${r2(yt)} ${r2(x + w)},${r2(yt + r)} V${r2(y0)} Z`;
}

/* ------------------------------------------------------------------------- */
/* Bar chart (ranked, one hue)                                                */
/* ------------------------------------------------------------------------- */

/**
 * Ranked bars — horizontal by default, one hue. Items beyond `maxBars` fold into "أخرى".
 * Optional `item.meta` prints as a muted note after the value (e.g. Pareto cumulative %).
 * @param {{items:Array<{id?:string,label:string,value:number,color?:string,meta?:string}>, horizontal?:boolean, height?:number, valueFormat?:Function, color?:string, showValues?:boolean, maxBars?:number, ariaLabel?:string, sorted?:boolean}} opts
 */
export function barChart(opts = {}) {
  const o = {
    items: [], horizontal: true, height: undefined, valueFormat: fmt.num, color: 'var(--s1)', showValues: true, maxBars: 12, ariaLabel: '', sorted: true,
    ...opts,
  };
  let view = [];
  const shell = chartShell({ className: 'chart-bars', ariaLabel: o.ariaLabel, render });
  const { svg, el } = shell;
  svg.setAttribute('aria-roledescription', t('charts.roles.bars'));
  shell.role = 'bars';

  function prepare() {
    const items = arr(o.items).map((it, i) => ({ id: str(it.id) || `item-${i}`, label: str(it.label), value: num(it.value), color: str(it.color).trim() || o.color, meta: str(it.meta) }));
    const ranked = o.sorted ? items.slice().sort((a, b) => b.value - a.value) : items;
    const max = Math.max(1, num(o.maxBars, 12));
    if (ranked.length <= max) return ranked;
    const head = ranked.slice(0, max - 1);
    const rest = ranked.slice(max - 1);
    head.push({ id: 'other', label: t('charts.other', { count: fmt.num(rest.length) }), value: rest.reduce((a, b) => a + b.value, 0), color: 'var(--ink-3)', meta: '', folded: rest });
    return head;
  }
  const f = (v) => str(o.valueFormat(v));

  function render(W) {
    clear(svg);
    view = prepare();
    const n = view.length;
    const rtl = isRTL(el);
    const A = anchors(rtl);
    if (!n) {
      const H = num(o.height, 120);
      setViewBox(svg, W, H);
      svgEl('text', { x: W / 2, y: H / 2, 'text-anchor': 'middle', class: 'label is-muted', text: T.noData }, svg);
      return;
    }
    const scale = niceScale(view.map((d) => d.value), 4);
    const maxV = scale.max || 1;
    if (o.horizontal) renderHorizontal(W, n, scale, maxV, rtl, A); else renderVertical(W, n, scale, maxV, rtl, A);
  }

  function renderHorizontal(W, n, scale, maxV, rtl, A) {
    const rowH = isNum(o.height) ? Math.max(14, (o.height - 12 - (o.showValues ? 4 : 22)) / n) : 32;
    const top = 6;
    const bottom = o.showValues ? 6 : 22;
    const H = isNum(o.height) ? o.height : Math.round(top + bottom + rowH * n);
    setViewBox(svg, W, H);
    const labelMaxW = Math.min(W * 0.38, Math.max(...view.map((d) => measure(d.label, 12)), 0) + 6);
    const labelColW = Math.ceil(labelMaxW) + 10;
    const valueW = o.showValues ? Math.ceil(Math.max(...view.map((d) => measure(f(d.value) + (d.meta ? `  ${d.meta}` : ''), 11, { mono: true, weight: 500 })), 0)) + 10 : 6;
    const x0 = rtl ? W - labelColW : labelColW;           // baseline at the inline-start side
    const plotW = Math.max(10, W - labelColW - valueW - 4);
    const dir = rtl ? -1 : 1;
    const thick = Math.min(24, Math.max(6, rowH * 0.68));
    const grid = svgEl('g', { class: 'grid', 'aria-hidden': 'true' }, svg);
    if (!o.showValues) {
      const fmtTick = tickFormatter(o.valueFormat, scale.decimals);
      scale.ticks.forEach((t) => {
        if (t < 0) return;
        const xx = Math.round(x0 + dir * (t / maxV) * plotW) + 0.5;
        svgEl('line', { x1: xx, x2: xx, y1: top, y2: H - bottom, class: t === 0 ? 'axis-line' : 'grid-line' }, grid);
        svgEl('text', { x: xx, y: H - 6, 'text-anchor': 'middle', class: 'axis-tick num', text: fmtTick(t) }, grid);
      });
    } else {
      const xx = Math.round(x0) + 0.5;
      svgEl('line', { x1: xx, x2: xx, y1: top, y2: H - bottom, class: 'axis-line' }, grid);
    }
    const marks = svgEl('g', { class: 'marks' }, svg);
    view.forEach((d, i) => {
      const yRow = top + i * rowH;
      const yBar = yRow + (rowH - thick) / 2;
      const len = (Math.max(0, d.value) / maxV) * plotW;
      const g = svgEl('g', { class: 'bar-row' }, marks);
      svgEl('rect', { x: 0, y: yRow, width: W, height: rowH, class: 'hit-area', 'data-i': i }, g);
      const labelText = fitText(d.label, labelMaxW, 12);
      svgEl('text', { x: rtl ? W - 2 : 2, y: yRow + rowH / 2 + 4, 'text-anchor': rtl ? A.right : A.left, class: 'bar-label', text: labelText }, g);
      const aria = `${f(d.value)} — ${d.label}${d.meta ? `${sep()}${d.meta}` : ''}`;
      if (len >= 1) {
        svgEl('path', { d: hBarPath(x0, yBar, len, thick, dir), class: 'bar mark', 'data-i': i, tabindex: -1, role: 'img', 'aria-label': aria, style: { fill: d.color } }, g);
      } else {
        // zero: a 2px stub so the mark stays visible, honest and focusable
        svgEl('rect', { x: rtl ? x0 - 2 : x0, y: yBar, width: 2, height: thick, class: 'bar mark is-muted', 'data-i': i, tabindex: -1, role: 'img', 'aria-label': aria, style: { fill: 'var(--line-2)' } }, g);
      }
      if (o.showValues) {
        const tx = x0 + dir * (len + 6);
        const t = svgEl('text', { x: tx, y: yBar + thick / 2 + 4, 'text-anchor': rtl ? A.right : A.left, class: 'bar-value', text: f(d.value) }, g);
        if (d.meta) {
          const sep = svgEl('tspan', { class: 'cum-label', text: `  ${d.meta}` }, t);
          sep.setAttribute('dx', '0');
        }
      }
    });
  }

  function renderVertical(W, n, scale, maxV, rtl, A) {
    const H = isNum(o.height) ? o.height : 220;
    setViewBox(svg, W, H);
    const fmtTick = tickFormatter(o.valueFormat, scale.decimals);
    const tickLabels = scale.ticks.map(fmtTick);
    const yAxisW = o.showValues ? 8 : Math.ceil(Math.max(...tickLabels.map((t) => measure(t, 11, { mono: true })))) + 10;
    const top = 18;
    const bottom = 26;
    const plotH = Math.max(30, H - top - bottom);
    const left = rtl ? 8 : yAxisW;
    const right = rtl ? W - yAxisW : W - 8;
    const plotW = Math.max(10, right - left);
    const y0 = top + plotH;
    const slot = plotW / n;
    const barW = Math.min(24, Math.max(4, slot * 0.6));
    const grid = svgEl('g', { class: 'grid', 'aria-hidden': 'true' }, svg);
    if (!o.showValues) {
      scale.ticks.forEach((t, k) => {
        if (t < 0) return;
        const yy = Math.round(y0 - (t / maxV) * plotH) + 0.5;
        svgEl('line', { x1: left, x2: right, y1: yy, y2: yy, class: t === 0 ? 'axis-line' : 'grid-line' }, grid);
        svgEl('text', { x: rtl ? right + 6 : left - 6, y: yy + 4, 'text-anchor': rtl ? A.left : A.right, class: 'axis-tick num', text: tickLabels[k] }, grid);
      });
    } else {
      svgEl('line', { x1: left, x2: right, y1: Math.round(y0) + 0.5, y2: Math.round(y0) + 0.5, class: 'axis-line' }, grid);
    }
    // categories flow with the inline direction (first item at inline-start)
    const cx = (i) => (rtl ? right - slot * (i + 0.5) : left + slot * (i + 0.5));
    const marks = svgEl('g', { class: 'marks' }, svg);
    const maxLabelW = Math.max(...view.map((d) => measure(d.label, 11)), 0);
    const show = new Set(thinIndices(n, slot, Math.min(maxLabelW, slot * 1.6)));
    view.forEach((d, i) => {
      const x = cx(i);
      const len = (Math.max(0, d.value) / maxV) * plotH;
      const g = svgEl('g', { class: 'bar-col' }, marks);
      svgEl('rect', { x: x - slot / 2, y: top, width: slot, height: plotH + bottom, class: 'hit-area', 'data-i': i }, g);
      const aria = `${f(d.value)} — ${d.label}`;
      if (len >= 1) svgEl('path', { d: vBarPath(x - barW / 2, y0, barW, len), class: 'bar mark', 'data-i': i, tabindex: -1, role: 'img', 'aria-label': aria, style: { fill: d.color } }, g);
      else svgEl('rect', { x: x - barW / 2, y: y0 - 2, width: barW, height: 2, class: 'bar mark is-muted', 'data-i': i, tabindex: -1, role: 'img', 'aria-label': aria, style: { fill: 'var(--line-2)' } }, g);
      if (o.showValues) svgEl('text', { x, y: y0 - len - 6, 'text-anchor': 'middle', class: 'bar-value', text: f(d.value) }, g);
      if (show.has(i)) svgEl('text', { x, y: H - 8, 'text-anchor': 'middle', class: 'axis-tick', text: fitText(d.label, slot * 1.6, 11) }, g);
    });
  }

  bindMarks(shell, (i) => {
    const d = view[i];
    if (!d) return null;
    const rows = [{ value: f(d.value), label: T.value, color: d.color }];
    if (d.meta) rows.push({ value: d.meta, label: '' });
    if (d.folded) d.folded.slice(0, 6).forEach((x) => rows.push({ value: f(x.value), label: x.label }));
    return { title: d.label, rows };
  });

  shell.redraw();
  return {
    el,
    update(data = {}) { Object.assign(o, data || {}); shell.redraw(); },
    table() {
      const items = prepare();
      const total = items.reduce((a, b) => a + b.value, 0);
      return buildTable({
        caption: o.ariaLabel,
        columns: [{ label: T.item }, { label: T.value, numeric: true }, { label: T.share, numeric: true }],
        rows: items.map((d) => [d.label, f(d.value), shareOf(d.value, total)]),
        footer: [T.total, f(total), total > 0 ? fmt.pct(100) : '—'],
      });
    },
    destroy: shell.destroy,
  };
}

/* ------------------------------------------------------------------------- */
/* Grouped bars                                                               */
/* ------------------------------------------------------------------------- */

/**
 * Grouped columns: one slot per group, one ≤ 24px column per series with a 2px surface gap.
 * @param {{groups:string[], series:Array<{id?:string,label:string,color?:string,values:number[]}>, height?:number, valueFormat?:Function, ariaLabel?:string, groupLabel?:string}} opts
 */
export function groupedBars(opts = {}) {
  const o = { groups: [], series: [], height: 220, valueFormat: fmt.num, ariaLabel: '', groupLabel: T.group, ...opts };
  let series = [];
  let groups = [];
  const shell = chartShell({ className: 'chart-grouped', ariaLabel: o.ariaLabel, render });
  const { svg, el } = shell;
  svg.setAttribute('aria-roledescription', t('charts.roles.grouped'));
  shell.role = 'grouped';
  const f = (v) => str(o.valueFormat(v));

  function prepare() {
    groups = arr(o.groups).map(str);
    series = arr(o.series).map((s, i) => ({ ...s, label: str(s.label), color: seriesColor(s, i), values: groups.map((_, gi) => num(arr(s.values)[gi], 0)) }));
  }

  function render(W) {
    clear(svg);
    prepare();
    const H = num(o.height, 220);
    setViewBox(svg, W, H);
    const rtl = isRTL(el);
    const A = anchors(rtl);
    const n = groups.length;
    const s = series.length;
    if (!n || !s) {
      svgEl('text', { x: W / 2, y: H / 2, 'text-anchor': 'middle', class: 'label is-muted', text: T.noData }, svg);
      buildLegend(shell.legendHost, []);
      return;
    }
    const scale = niceScale(series.flatMap((x) => x.values), 4);
    const maxV = scale.max || 1;
    const fmtTick = tickFormatter(o.valueFormat, scale.decimals);
    const tickLabels = scale.ticks.map(fmtTick);
    const yAxisW = Math.ceil(Math.max(...tickLabels.map((t) => measure(t, 11, { mono: true })))) + 10;
    const top = 18;
    const bottom = 26;
    const plotH = Math.max(30, H - top - bottom);
    const left = rtl ? 8 : yAxisW;
    const right = rtl ? W - yAxisW : W - 8;
    const plotW = Math.max(10, right - left);
    const y0 = top + plotH;
    const slot = plotW / n;
    const gap = 2;
    const barW = Math.min(24, Math.max(3, (slot * 0.78 - gap * (s - 1)) / s));
    const clusterW = barW * s + gap * (s - 1);
    const grid = svgEl('g', { class: 'grid', 'aria-hidden': 'true' }, svg);
    scale.ticks.forEach((t, k) => {
      if (t < 0) return;
      const yy = Math.round(y0 - (t / maxV) * plotH) + 0.5;
      svgEl('line', { x1: left, x2: right, y1: yy, y2: yy, class: t === 0 ? 'axis-line' : 'grid-line' }, grid);
      svgEl('text', { x: rtl ? right + 6 : left - 6, y: yy + 4, 'text-anchor': rtl ? A.left : A.right, class: 'axis-tick num', text: tickLabels[k] }, grid);
    });
    const cx = (gi) => (rtl ? right - slot * (gi + 0.5) : left + slot * (gi + 0.5));
    const maxLabelW = Math.max(...groups.map((g) => measure(g, 11)), 0);
    const show = new Set(thinIndices(n, slot, Math.min(maxLabelW, slot * 1.5)));
    const marks = svgEl('g', { class: 'marks' }, svg);
    // Direct label: only the overall maximum
    let best = { v: -Infinity, gi: -1, si: -1 };
    series.forEach((sr, si) => sr.values.forEach((v, gi) => { if (v > best.v) best = { v, gi, si }; }));
    groups.forEach((g, gi) => {
      const center = cx(gi);
      const grp = svgEl('g', { class: 'bar-group' }, marks);
      svgEl('rect', { x: center - slot / 2, y: top, width: slot, height: plotH + bottom, class: 'hit-area', 'data-i': gi }, grp);
      const start = center - clusterW / 2;
      series.forEach((sr, si) => {
        // series order follows the inline direction inside the cluster
        const k = rtl ? s - 1 - si : si;
        const x = start + k * (barW + gap);
        const v = sr.values[gi];
        const len = (Math.max(0, v) / maxV) * plotH;
        const aria = `${f(v)} ${sr.label} — ${g}`;
        if (len >= 1) svgEl('path', { d: vBarPath(x, y0, barW, len), class: 'bar mark', 'data-i': gi, 'data-j': si, tabindex: -1, role: 'img', 'aria-label': aria, style: { fill: sr.color } }, grp);
        else svgEl('rect', { x, y: y0 - 2, width: barW, height: 2, class: 'bar mark is-muted', 'data-i': gi, 'data-j': si, tabindex: -1, role: 'img', 'aria-label': aria, style: { fill: 'var(--line-2)' } }, grp);
        if (gi === best.gi && si === best.si && len >= 1) svgEl('text', { x: x + barW / 2, y: y0 - len - 6, 'text-anchor': 'middle', class: 'value-label is-strong', text: f(v) }, grp);
      });
      if (show.has(gi)) svgEl('text', { x: center, y: H - 8, 'text-anchor': 'middle', class: 'axis-tick', text: fitText(g, slot * 1.5, 11) }, grp);
    });
    buildLegend(shell.legendHost, series.map((sr) => ({ label: sr.label, color: sr.color })), { kind: 'rect' });
  }

  bindMarks(shell, (gi, si) => {
    const g = groups[gi];
    if (g === undefined) return null;
    const rows = series.map((sr, k) => ({ value: f(sr.values[gi]), label: sr.label, color: sr.color, kind: 'rect' }));
    if (isNum(si) && rows[si]) rows.unshift(rows.splice(si, 1)[0]);
    return { title: g, rows };
  });

  shell.redraw();
  return {
    el,
    update(data = {}) { Object.assign(o, data || {}); shell.redraw(); },
    table() {
      prepare();
      return buildTable({
        caption: o.ariaLabel,
        columns: [{ label: o.groupLabel || T.group }, ...series.map((s) => ({ label: s.label, numeric: true }))],
        rows: groups.map((g, gi) => [g, ...series.map((s) => f(s.values[gi]))]),
      });
    },
    destroy: shell.destroy,
  };
}

/* ------------------------------------------------------------------------- */
/* Heatmap / matrix                                                           */
/* ------------------------------------------------------------------------- */

/**
 * Matrix of rounded cells (4px gap). Row headers on the inline-start side, column
 * headers on top; columns flow with the inline direction. Cells are focusable and
 * carry a value-first aria-label; onCellClick({value, ri, ci, row, col}).
 * @param {{rows:string[], cols:string[], cells:number[][], colorFor:(v:number,ri:number,ci:number)=>string, labelFor?:(v:number,ri:number,ci:number)=>string, onCellClick?:Function, cellSize?:number|'auto', ariaLabel?:string, rowTitle?:string, colTitle?:string, maxCell?:number}} opts
 */
export function heatmap(opts = {}) {
  const o = {
    rows: [], cols: [], cells: [], colorFor: null, labelFor: null, onCellClick: null, cellSize: 'auto',
    ariaLabel: '', rowTitle: '', colTitle: '', maxCell: 72, minCell: 26,
    ...opts,
  };
  let model = null;
  const shell = chartShell({ className: 'chart-heatmap', ariaLabel: o.ariaLabel, render });
  const { svg, el } = shell;
  svg.setAttribute('aria-roledescription', t('charts.roles.matrix'));
  shell.role = 'matrix';

  const rowsOf = () => arr(o.rows).map(str);
  const colsOf = () => arr(o.cols).map(str);
  const valueAt = (ri, ci) => { const row = arr(o.cells)[ri]; const v = row ? row[ci] : null; return isNum(v) ? v : (v === null || v === undefined ? null : num(v, null)); };
  const labelOf = (v, ri, ci) => (typeof o.labelFor === 'function' ? str(o.labelFor(v, ri, ci)) : (v === null ? '' : fmt.num(v)));
  const colorOf = (v, ri, ci) => {
    let c = '';
    try { c = typeof o.colorFor === 'function' ? str(o.colorFor(v, ri, ci)).trim() : ''; } catch { c = ''; }
    return c;
  };

  function render(W) {
    clear(svg);
    const rows = rowsOf();
    const cols = colsOf();
    const R = rows.length;
    const C = cols.length;
    const rtl = isRTL(el);
    const A = anchors(rtl);
    if (!R || !C) {
      setViewBox(svg, W, 120);
      svgEl('text', { x: W / 2, y: 60, 'text-anchor': 'middle', class: 'label is-muted', text: T.noData }, svg);
      return;
    }
    const gap = 4;
    const rowHeadW = Math.ceil(Math.min(W * 0.3, Math.max(...rows.map((r) => measure(r, 12)), 0))) + 10;
    const rowTitleW = o.rowTitle ? 18 : 0;
    const colTitleH = o.colTitle ? 18 : 0;
    const availW = Math.max(40, W - rowHeadW - rowTitleW - gap * (C - 1) - 2);
    let cell;
    if (isNum(o.cellSize)) cell = o.cellSize;
    else cell = clamp(Math.floor(availW / C), num(o.minCell, 26), num(o.maxCell, 72));
    // Column headers: horizontal when every label fits its column; otherwise rotated 45° (never "التو…") — V7.
    const headPx = 11;
    const colLabelWs = cols.map((c) => measure(c, headPx));
    const rotateHeads = o.rotateHeaders === true || (o.rotateHeaders !== false && colLabelWs.some((lw) => lw > cell + gap - 2));
    const colHeadH = rotateHeads ? clamp(Math.ceil(Math.max(...colLabelWs, 0) * Math.SQRT1_2) + 16, 48, 96) : 20;
    const gridW = C * cell + gap * (C - 1);
    const gridH = R * cell + gap * (R - 1);
    const naturalW = rowHeadW + rowTitleW + gridW + 2;
    const H = colTitleH + colHeadH + gridH + 4;
    const totalW = Math.max(W, naturalW);
    setViewBox(svg, totalW, H);
    if (naturalW > W) {
      svg.style.inlineSize = `${naturalW}px`;
      svg.style.minInlineSize = `${naturalW}px`;
      el.style.overflowX = 'auto';
    } else {
      svg.style.inlineSize = '';
      svg.style.minInlineSize = '';
      el.style.overflowX = '';
    }
    el.classList.toggle('is-overflowing', naturalW > W);   // the matrix scrolls sideways (CSS may show an edge cue)
    // Grid origin: inline-start side after the row headers
    const gx0 = rtl ? totalW - rowTitleW - rowHeadW - gridW : rowTitleW + rowHeadW;
    const gy0 = colTitleH + colHeadH;
    const cellX = (ci) => (rtl ? gx0 + gridW - (ci + 1) * cell - ci * gap : gx0 + ci * (cell + gap));
    const cellY = (ri) => gy0 + ri * (cell + gap);

    const heads = svgEl('g', { class: 'axis matrix-heads', 'aria-hidden': 'true' }, svg);
    if (o.colTitle) svgEl('text', { x: gx0 + gridW / 2, y: 12, 'text-anchor': 'middle', class: 'axis-title', text: o.colTitle }, heads);
    if (!rotateHeads) {
      cols.forEach((c, ci) => svgEl('text', { x: cellX(ci) + cell / 2, y: gy0 - 7, 'text-anchor': 'middle', class: 'axis-tick', text: fitText(c, cell + gap - 2, headPx) }, heads));
    } else {
      // Anchor at the bottom-centre of each column; the label rises at 45° toward the row-header side
      // (text-anchor end: the text body extends from the anchor, so rotate −45° in RTL, +45° in LTR).
      const budget = (colHeadH - 12) / Math.SQRT1_2;
      cols.forEach((c, ci) => {
        const ax = cellX(ci) + cell / 2;
        const ay = gy0 - 8;
        const room = (rtl ? totalW - ax : ax) - 4;                 // keep the label inside the svg on the header side
        const text = fitText(c, Math.max(24, Math.min(budget, room / Math.SQRT1_2)), headPx);
        svgEl('text', { x: r2(ax), y: r2(ay), 'text-anchor': 'end', class: 'axis-tick is-rotated', transform: `rotate(${rtl ? -45 : 45} ${r2(ax)} ${r2(ay)})`, text }, heads);
      });
    }
    const headX = rtl ? totalW - rowTitleW - 4 : rowTitleW + 4;
    rows.forEach((r, ri) => svgEl('text', { x: headX, y: cellY(ri) + cell / 2 + 4, 'text-anchor': rtl ? A.right : A.left, class: 'label', text: fitText(r, rowHeadW - 10, 12) }, heads));
    if (o.rowTitle) {
      const tx = rtl ? totalW - 7 : 7;
      const ty = gy0 + gridH / 2;
      svgEl('text', { x: tx, y: ty, 'text-anchor': 'middle', class: 'axis-title', transform: `rotate(${rtl ? 90 : -90} ${tx} ${ty})`, text: o.rowTitle }, heads);
    }

    const cellsG = svgEl('g', { class: 'matrix' }, svg);
    const clickable = typeof o.onCellClick === 'function';
    const rowTitle = o.rowTitle || T.row;
    const colTitle = o.colTitle || T.col;
    for (let ri = 0; ri < R; ri += 1) {
      for (let ci = 0; ci < C; ci += 1) {
        const v = valueAt(ri, ci);
        const color = colorOf(v, ri, ci);
        const label = labelOf(v, ri, ci);
        const x = cellX(ci);
        const y = cellY(ri);
        const empty = !color || v === 0 || v === null;
        const rect = svgEl('rect', {
          x, y, width: cell, height: cell, rx: Math.min(6, cell / 4), class: ['cell', 'mark', empty ? 'is-empty' : null],
          'data-i': ri, 'data-j': ci, tabindex: -1, role: clickable ? 'button' : 'img',
          'aria-label': t('charts.cellAria', { value: label || fmt.num(v === null ? 0 : v), rowTitle, row: rows[ri], colTitle, col: cols[ci] }),
          style: { fill: color || 'var(--bg-2)', stroke: color ? 'none' : 'var(--line)', strokeWidth: color ? '0' : '1' },
        }, cellsG);
        if (clickable) rect.style.cursor = 'pointer';
        const lw = label ? measure(label, 12, { weight: 600 }) : 0;
        if (label && lw <= cell - 8 && cell >= 22) {
          // Same rule as the segmented bar: the better of the two inks for this fill, or an opaque plate
          // when neither reaches 4.5:1 (white on a mid green was 3.2:1 with the old luminance threshold).
          const ink = empty ? null : insideInk(color);
          if (ink && ink.plate) {
            const pw = Math.min(cell - 4, lw + 10);
            svgEl('rect', { x: r2(x + cell / 2 - pw / 2), y: r2(y + cell / 2 - 9), width: r2(pw), height: 18, rx: 4, class: 'cell-plate' }, cellsG);
          }
          svgEl('text', {
            x: x + cell / 2, y: y + cell / 2 + 4, 'text-anchor': 'middle',
            class: ['cell-label', empty ? 'is-empty' : (ink.plate ? 'is-on-plate' : ink.cls)], text: label,
          }, cellsG);
        }
      }
    }
    model = { rows, cols, rowTitle, colTitle };
  }

  bindMarks(shell, (ri, ci) => {
    if (!model) return null;
    const v = valueAt(ri, ci);
    return {
      title: t('charts.cellTitle', { rowTitle: model.rowTitle, row: model.rows[ri], colTitle: model.colTitle, col: model.cols[ci] }),
      rows: [{ value: labelOf(v, ri, ci) || fmt.num(v === null ? 0 : v), label: T.value, color: colorOf(v, ri, ci) || undefined }],
    };
  }, {
    grid: true,
    onActivate: (node, event) => {
      if (typeof o.onCellClick !== 'function' || !model) return;
      const ri = Number(node.getAttribute('data-i'));
      const ci = Number(node.getAttribute('data-j'));
      o.onCellClick({ value: valueAt(ri, ci), ri, ci, row: model.rows[ri], col: model.cols[ci], event });
    },
  });

  shell.redraw();
  return {
    el,
    update(data = {}) { Object.assign(o, data || {}); shell.redraw(); },
    table() {
      const rows = rowsOf();
      const cols = colsOf();
      return buildTable({
        caption: o.ariaLabel,
        columns: [{ label: t('charts.corner', { row: o.rowTitle || T.row, col: o.colTitle || T.col }) }, ...cols.map((c) => ({ label: c, numeric: true }))],
        rows: rows.map((r, ri) => [r, ...cols.map((_, ci) => { const v = valueAt(ri, ci); return labelOf(v, ri, ci) || fmt.num(v === null ? 0 : v); })]),
      });
    },
    destroy: shell.destroy,
  };
}

/* ------------------------------------------------------------------------- */
/* Segmented bar (one whole split into parts — replaces donuts)              */
/* ------------------------------------------------------------------------- */

/**
 * Tall (28px) blocks with 4px corners and 2px surface gaps, values printed inside at
 * the leading edge where they fit; thin (10px) variant prints nothing. Legend of names only.
 * @param {{parts:Array<{id?:string,label:string,value:number,color?:string}>, tall?:boolean, valueFormat?:Function, ariaLabel?:string, showShare?:boolean}} opts
 */
export function segmentedBar(opts = {}) {
  const o = { parts: [], tall: true, valueFormat: fmt.num, ariaLabel: '', showShare: false, ...opts };
  let parts = [];
  let total = 0;
  const shell = chartShell({ className: 'chart-segbar', ariaLabel: o.ariaLabel, render });
  const { svg, el } = shell;
  svg.setAttribute('aria-roledescription', t('charts.roles.segbar'));
  shell.role = 'segbar';
  const f = (v) => str(o.valueFormat(v));

  function prepare() {
    parts = arr(o.parts).map((p, i) => ({ id: str(p.id) || `part-${i}`, label: str(p.label), value: Math.max(0, num(p.value)), color: str(p.color).trim() || paletteFor(Math.min(i, PALETTE_SIZE - 1)) }));
    total = parts.reduce((a, b) => a + b.value, 0);
  }

  function render(W) {
    clear(svg);
    prepare();
    const h = o.tall ? 28 : 10;
    const H = h;
    setViewBox(svg, W, H);
    const rtl = isRTL(el);
    const A = anchors(rtl);
    const gap = 2;
    const visible = parts.filter((p) => p.value > 0);
    if (!visible.length || total <= 0) {
      svgEl('rect', { x: 0, y: 0, width: W, height: h, rx: o.tall ? 4 : h / 2, class: 'segbar-empty', style: { fill: 'var(--bg-3)' } }, svg);
      buildLegend(shell.legendHost, parts.map((p) => ({ label: p.label, color: p.color })));
      return;
    }
    const usable = W - gap * (visible.length - 1);
    let clipId = null;
    if (!o.tall) {
      clipId = uid('segclip');
      const defs = svgEl('defs', {}, svg);
      const cp = svgEl('clipPath', { id: clipId }, defs);
      svgEl('rect', { x: 0, y: 0, width: W, height: h, rx: h / 2 }, cp);
    }
    const g = svgEl('g', { class: 'segbar-parts', 'clip-path': clipId ? `url(#${clipId})` : null }, svg);
    let cursor = rtl ? W : 0;   // blocks flow with the inline direction
    visible.forEach((p) => {
      const idx = parts.indexOf(p);
      const w = Math.max(1, (p.value / total) * usable);
      const x = rtl ? cursor - w : cursor;
      cursor = rtl ? x - gap : x + w + gap;
      const share = shareOf(p.value, total);
      const aria = `${f(p.value)} ${p.label}${sep()}${share}`;
      svgEl('rect', { x: r2(x), y: 0, width: r2(w), height: h, rx: o.tall ? 4 : 0, class: 'segbar-part mark', 'data-i': idx, tabindex: -1, role: 'img', 'aria-label': aria, style: { fill: p.color } }, g);
      if (o.tall) {
        const text = o.showShare ? share : f(p.value);
        const tw = measure(text, 12, { weight: 600, mono: true });
        if (tw + 14 <= w) {
          const ink = insideInk(p.color);
          if (ink.plate) {
            // Mid-tone fills give < 4.5:1 with either ink: label sits on an opaque surface plate.
            const pw = tw + 10;
            const px = rtl ? x + w - 4 - pw : x + 4;
            svgEl('rect', { x: r2(px), y: r2(h / 2 - 9), width: r2(pw), height: 18, rx: 4, class: 'cell-plate' }, g);
            svgEl('text', { x: rtl ? px + pw - 5 : px + 5, y: h / 2 + 4, 'text-anchor': rtl ? A.right : A.left, class: ['cell-label', 'num', 'is-on-plate'], text }, g);
          } else {
            svgEl('text', { x: rtl ? x + w - 7 : x + 7, y: h / 2 + 4, 'text-anchor': rtl ? A.right : A.left, class: ['cell-label', 'num', ink.cls], text }, g);
          }
        }
      }
    });
    buildLegend(shell.legendHost, parts.map((p) => ({ label: p.label, color: p.color })));
  }

  bindMarks(shell, (i) => {
    const p = parts[i];
    if (!p) return null;
    return { title: p.label, rows: [{ value: f(p.value), label: T.value, color: p.color }, { value: shareOf(p.value, total), label: T.share }] };
  });

  shell.redraw();
  return {
    el,
    update(data = {}) { Object.assign(o, data || {}); shell.redraw(); },
    table() {
      prepare();
      return buildTable({
        caption: o.ariaLabel,
        columns: [{ label: T.part }, { label: T.value, numeric: true }, { label: T.share, numeric: true }],
        rows: parts.map((p) => [keyedCell(p.label, p.color), f(p.value), shareOf(p.value, total)]),
        footer: [T.total, f(total), total > 0 ? fmt.pct(100) : '—'],
      });
    },
    destroy: shell.destroy,
  };
}

/* ------------------------------------------------------------------------- */
/* Dumbbell (before → after per item: inherent vs residual)                   */
/* ------------------------------------------------------------------------- */

/**
 * One row per item on ONE shared value axis (no dual axis): a hollow ring for `from` (inherent), a filled
 * dot for `to` (residual) and a connector between them — one hue, two shades + two shapes, so the pair is
 * never colour-alone. `to: null` means "not assessed" (ring only, labelled as such — never drawn as 0).
 * Rows keep the given order (set `sorted: true` to rank by `from`). Labels sit on the inline-start side
 * and the value axis grows toward the inline-end, like the horizontal bar chart.
 * @param {{items:Array<{id?:string,label:string,from:number,to:number|null,meta?:string}>, max?:number,
 *          valueFormat?:Function, ariaLabel?:string, fromLabel?:string, toLabel?:string, fromColor?:string,
 *          toColor?:string, rowHeight?:number, showValues?:boolean, sorted?:boolean, onItemClick?:Function}} opts
 * onItemClick({ item, index, event }) fires on click / Enter / Space on a row.
 */
export function dumbbell(opts = {}) {
  const o = {
    items: [], max: null, valueFormat: fmt.num, ariaLabel: '', fromLabel: '', toLabel: '',
    fromColor: '', toColor: 'var(--s1)', rowHeight: 34, showValues: true, sorted: false, onItemClick: null,
    ...opts,
  };
  let view = [];
  const shell = chartShell({ className: 'chart-dumbbell', ariaLabel: o.ariaLabel, render });
  const { svg, el } = shell;
  svg.setAttribute('aria-roledescription', t('charts.roles.dumbbell'));
  shell.role = 'dumbbell';
  const value = (v) => (isNum(v) ? v : (v === null || v === undefined || v === '' ? null : num(v, null)));
  const f = (v) => (isNum(v) ? str(o.valueFormat(v)) : t('charts.dumbbell.notAssessed'));
  const fromLabel = () => str(o.fromLabel) || t('charts.dumbbell.from');
  const toLabel = () => str(o.toLabel) || t('charts.dumbbell.to');
  const toColor = () => str(o.toColor).trim() || 'var(--s1)';
  // the same hue, one step toward the muted ink: distinct from `to` in both themes and still ≥ 3:1 on the card
  const fromColor = () => str(o.fromColor).trim() || `color-mix(in srgb, ${toColor()} 62%, var(--ink-3))`;
  const change = (d) => (isNum(d.from) && isNum(d.to) ? fmt.signed(d.to - d.from) : '');

  function prepare() {
    const items = arr(o.items).map((it, i) => ({ id: str(it && it.id) || `item-${i}`, label: str(it && it.label), from: value(it && it.from), to: value(it && it.to), meta: str(it && it.meta), src: it }));
    return o.sorted ? items.slice().sort((a, b) => (b.from ?? -Infinity) - (a.from ?? -Infinity)) : items;
  }

  function render(W) {
    clear(svg);
    view = prepare();
    const n = view.length;
    const rtl = isRTL(el);
    const A = anchors(rtl);
    if (!n) {
      setViewBox(svg, W, 120);
      svgEl('text', { x: W / 2, y: 60, 'text-anchor': 'middle', class: 'label is-muted', text: T.noData }, svg);
      buildLegend(shell.legendHost, []);
      return;
    }
    const all = view.flatMap((d) => [d.from, d.to]).filter(isNum);
    const scale = isNum(num(o.max, NaN)) && num(o.max) > 0
      ? (() => { const sc = niceScale([0, num(o.max)], 4); return { ...sc, max: num(o.max), ticks: sc.ticks.filter((v) => v <= num(o.max)) }; })()
      : niceScale(all, 4);
    const maxV = scale.max || 1;
    const rowH = Math.max(26, num(o.rowHeight, 34));
    const top = 4;
    const axisH = 24;
    const H = Math.round(top + rowH * n + axisH);
    setViewBox(svg, W, H);
    const labelMaxW = Math.min(W * 0.36, Math.max(...view.map((d) => measure(d.label, 12)), 0) + 6);
    const labelColW = Math.ceil(labelMaxW) + 12;
    const valueText = (d) => (isNum(d.to) ? `${f(d.to)}${change(d) ? `  ${change(d)}` : ''}` : f(d.to));
    const valueW = o.showValues ? Math.ceil(Math.max(...view.map((d) => measure(valueText(d), 11, { mono: true, weight: 500 })), 0)) + 14 : 8;
    const plotW = Math.max(40, W - labelColW - valueW - 12);
    const dir = rtl ? -1 : 1;
    const x0 = rtl ? W - labelColW - 6 : labelColW + 6;      // value 0 at the inline-start edge of the plot
    const xOf = (v) => x0 + dir * (clamp(v, 0, maxV) / maxV) * plotW;
    const baseY = top + rowH * n;

    const fmtTick = tickFormatter(o.valueFormat, scale.decimals);
    const grid = svgEl('g', { class: 'grid', 'aria-hidden': 'true' }, svg);
    scale.ticks.forEach((tk) => {
      if (tk < 0 || tk > maxV) return;
      const xx = Math.round(xOf(tk)) + 0.5;
      svgEl('line', { x1: xx, x2: xx, y1: top, y2: baseY, class: tk === 0 ? 'axis-line' : 'grid-line' }, grid);
      svgEl('text', { x: xx, y: H - 7, 'text-anchor': 'middle', class: 'axis-tick num', text: fmtTick(tk) }, grid);
    });

    const marks = svgEl('g', { class: 'marks' }, svg);
    const cFrom = fromColor();
    const cTo = toColor();
    const clickable = typeof o.onItemClick === 'function';
    view.forEach((d, i) => {
      const cy = top + i * rowH + rowH / 2;
      const details = t('charts.dumbbell.rowAria', { label: d.label, fromLabel: fromLabel(), from: f(d.from), toLabel: toLabel(), to: f(d.to) })
        + (change(d) ? `${sep()}${t('charts.dumbbell.change')} ${change(d)}` : '');
      // WCAG 2.5.3 (label in name): when values are drawn, the accessible name starts with the visible text in the same order.
      const aria = o.showValues ? `${d.label} ${f(d.to)}${change(d) ? ` ${change(d)}` : ''}${sep()}${details}` : details;
      const g = svgEl('g', { class: ['mark', 'dumbbell-row', isNum(d.to) ? null : 'is-unassessed'], 'data-i': i, tabindex: -1, role: clickable ? 'button' : 'img', 'aria-label': aria }, marks);
      svgEl('rect', { x: 0, y: cy - rowH / 2, width: W, height: rowH, class: 'hit-area' }, g);
      svgEl('text', { x: rtl ? W - 2 : 2, y: cy + 4, 'text-anchor': rtl ? A.right : A.left, class: 'bar-label', text: fitText(d.label, labelMaxW, 12) }, g);
      const xf = isNum(d.from) ? xOf(d.from) : null;
      const xt = isNum(d.to) ? xOf(d.to) : null;
      if (xf !== null && xt !== null && Math.abs(xt - xf) > 1) {
        svgEl('line', { x1: r2(xf), x2: r2(xt), y1: cy, y2: cy, class: 'dumbbell-link', 'stroke-width': 3, 'stroke-linecap': 'round', style: { stroke: `color-mix(in srgb, ${cTo} 38%, var(--bg-2))` } }, g);
      }
      if (xf !== null) svgEl('circle', { cx: r2(xf), cy, r: 5, class: 'dumbbell-from', 'stroke-width': 2, style: { fill: 'var(--bg-1)', stroke: cFrom } }, g);
      if (xt !== null) svgEl('circle', { cx: r2(xt), cy, r: 5.5, class: 'marker dumbbell-to', style: { fill: cTo } }, g);
      if (o.showValues) {
        const vx = rtl ? valueW - 6 : W - valueW + 6;
        const txt = svgEl('text', { x: vx, y: cy + 4, 'text-anchor': rtl ? A.right : A.left, class: ['bar-value', isNum(d.to) ? null : 'is-muted'], text: isNum(d.to) ? f(d.to) : f(null) }, g);
        if (change(d)) svgEl('tspan', { class: 'cum-label', text: `  ${change(d)}` }, txt);
      }
    });
    buildLegend(shell.legendHost, [
      { label: fromLabel(), color: cFrom, kind: 'ring' },
      { label: toLabel(), color: cTo, kind: 'dot' },
    ]);
  }

  bindMarks(shell, (i) => {
    const d = view[i];
    if (!d) return null;
    const rows = [
      { value: f(d.from), label: fromLabel(), color: fromColor() },
      { value: f(d.to), label: toLabel(), color: isNum(d.to) ? toColor() : undefined },
    ];
    if (change(d)) rows.push({ value: change(d), label: t('charts.dumbbell.change') });
    if (d.meta) rows.push({ value: d.meta, label: '' });
    return { title: d.label, rows };
  }, {
    onActivate: (node, event) => {
      if (typeof o.onItemClick !== 'function') return;
      const i = Number(node.getAttribute('data-i'));
      const d = view[i];
      if (d) o.onItemClick({ item: d.src, index: i, event });
    },
  });

  shell.redraw();
  return {
    el,
    update(data = {}) { Object.assign(o, data || {}); shell.redraw(); },
    table() {
      const items = prepare();
      return buildTable({
        caption: o.ariaLabel,
        columns: [{ label: T.item }, { label: fromLabel(), numeric: true }, { label: toLabel(), numeric: true }, { label: t('charts.dumbbell.change'), numeric: true }],
        rows: items.map((d) => [d.label, f(d.from), f(d.to), change(d) || '—']),
      });
    },
    destroy: shell.destroy,
  };
}

/* ------------------------------------------------------------------------- */
/* Sparkline                                                                  */
/* ------------------------------------------------------------------------- */

/**
 * Decorative 12-point style sparkline (1.5px line, accent dot on the last point).
 * Returns { el, update(values), destroy }.
 */
export function sparkline(opts = {}) {
  const o = { values: [], width: 96, height: 28, color: 'var(--ink-3)', accentLast: true, ...opts };
  const el = htmlEl('span', { class: 'spark', attrs: { 'aria-hidden': 'true' } });
  const svg = svgEl('svg', { xmlns: SVG_NS, focusable: 'false' }, el);

  function render() {
    clear(svg);
    const W = num(o.width, 96);
    const H = num(o.height, 28);
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svg.setAttribute('width', String(W));
    svg.setAttribute('height', String(H));
    el.style.color = str(o.color) || 'var(--ink-3)';
    const vals = arr(o.values).map((v) => (isNum(v) ? v : null));
    const finite = vals.filter(isNum);
    if (finite.length < 1) return;
    const n = vals.length;
    const min = Math.min(...finite);
    const max = Math.max(...finite);
    const pad = 3;
    const y = (v) => (max === min ? H / 2 : pad + (H - 2 * pad) * (1 - (v - min) / (max - min)));
    const x = (i) => (n === 1 ? W / 2 : pad + (i / (n - 1)) * (W - 2 * pad));
    let d = '';
    let open = false;
    vals.forEach((v, i) => {
      if (v === null) { open = false; return; }
      d += `${open ? ' L' : ' M'}${r2(x(i))},${r2(y(v))}`;
      open = true;
    });
    svgEl('path', { d: d.trim(), class: 'spark-line' }, svg);
    if (o.accentLast) {
      let last = n - 1;
      while (last >= 0 && vals[last] === null) last -= 1;
      if (last >= 0) svgEl('circle', { cx: x(last), cy: y(vals[last]), r: 2.5, class: 'spark-dot' }, svg);
    }
  }
  render();
  return {
    el,
    update(data) { if (Array.isArray(data)) o.values = data; else Object.assign(o, data || {}); render(); },
    destroy() { clear(svg); },
  };
}

/* ------------------------------------------------------------------------- */
/* Status tone helpers (gauge / meter)                                        */
/* ------------------------------------------------------------------------- */

const TONES = ['good', 'warning', 'serious', 'critical'];
const toneVar = (tone) => `var(--${TONES.includes(tone) ? tone : 'brand'})`;

/** Safety-index tone: ≥85 good, ≥70 warning, ≥50 serious, else critical (as % of max). */
function indexTone(value, max = 100) {
  const pct = max > 0 ? (value / max) * 100 : 0;
  if (pct >= 85) return 'good';
  if (pct >= 70) return 'warning';
  if (pct >= 50) return 'serious';
  return 'critical';
}

/** Tone from a thresholds list [{upTo, tone}] (first threshold the value does not exceed). */
function thresholdTone(value, thresholds) {
  const list = arr(thresholds).filter((t) => t && isNum(num(t.upTo, NaN))).slice().sort((a, b) => num(a.upTo) - num(b.upTo));
  if (!list.length) return null;
  for (const t of list) if (value <= num(t.upTo)) return str(t.tone) || null;
  return str(list[list.length - 1].tone) || null;
}

/** Static tone glyph (24-grid, stroke currentColor) — status is never colour-alone. */
function toneGlyph(tone, size = 12) {
  const g = svgEl('g', { class: 'tone-glyph', transform: `scale(${size / 24})`, fill: 'none', stroke: 'currentColor', 'stroke-width': 2.4, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' });
  const add = (tag, attrs) => svgEl(tag, attrs, g);
  switch (tone) {
    case 'good': add('circle', { cx: 12, cy: 12, r: 9 }); add('path', { d: 'M8 12.5l2.6 2.6L16 9.6' }); break;
    case 'warning': add('path', { d: 'M12 3.5l9 16H3l9-16z' }); add('path', { d: 'M12 10v4' }); add('path', { d: 'M12 17.2h.01' }); break;
    case 'serious': add('circle', { cx: 12, cy: 12, r: 9 }); add('path', { d: 'M12 7.5v5.5' }); add('path', { d: 'M12 16.4h.01' }); break;
    case 'critical': add('path', { d: 'M8.2 3h7.6L21 8.2v7.6L15.8 21H8.2L3 15.8V8.2L8.2 3z' }); add('path', { d: 'M9.5 9.5l5 5M14.5 9.5l-5 5' }); break;
    default: add('circle', { cx: 12, cy: 12, r: 8.5 }); add('path', { d: 'M8 12h8' });
  }
  return g;
}

/* ------------------------------------------------------------------------- */
/* Meter                                                                      */
/* ------------------------------------------------------------------------- */

/**
 * Linear meter with a same-ramp track (lighter step of the fill's own hue).
 * thresholds: [{upTo, tone}] pick the fill tone; markers show each boundary.
 * Returns { el, update(valueOr{value,max,…}), destroy }.
 */
export function meter(opts = {}) {
  const o = { value: 0, max: 100, label: '', thresholds: [], height: 10, format: null, ...opts };
  const el = htmlEl('div', { class: 'meter' });
  const head = htmlEl('div', { class: 'meter-head' }, el);
  const labelEl = htmlEl('span', { class: 'meter-label' }, head);
  const valueEl = htmlEl('span', { class: 'meter-value' }, head);
  const track = htmlEl('div', { class: 'meter-track', attrs: { role: 'meter', 'aria-valuemin': '0' } }, el);
  const fill = htmlEl('div', { class: 'meter-fill' }, track);
  const marks = [];

  function text(v, max) {
    if (typeof o.format === 'function') return str(o.format(v, max));
    return max === 100 ? fmt.pct(v) : t('charts.of', { value: fmt.num(v, { maximumFractionDigits: 1 }), max: fmt.num(max) });
  }
  function render() {
    const max = Math.max(num(o.max, 100), 0.000001);
    const v = clamp(num(o.value), 0, max);
    const tone = thresholdTone(v, o.thresholds);
    const color = tone ? toneVar(tone) : 'var(--brand)';
    labelEl.textContent = str(o.label);
    head.hidden = !o.label && o.hideValue === true;
    valueEl.textContent = text(v, max);
    track.style.blockSize = `${num(o.height, 10)}px`;
    track.style.background = `color-mix(in srgb, ${color} 22%, var(--bg-2))`;
    track.setAttribute('aria-valuemax', String(max));
    track.setAttribute('aria-valuenow', String(v));
    track.setAttribute('aria-valuetext', `${text(v, max)}${tone ? ` — ${T.tones[tone] || tone}` : ''}`);
    if (o.label) track.setAttribute('aria-label', str(o.label)); else track.removeAttribute('aria-label');
    fill.style.setProperty('--tone', color);
    fill.style.inlineSize = `${(v / max) * 100}%`;
    marks.forEach((m) => m.remove());
    marks.length = 0;
    arr(o.thresholds).forEach((t) => {
      const up = num(t && t.upTo, NaN);
      if (!isNum(up) || up <= 0 || up >= max) return;
      const m = htmlEl('span', { class: 'meter-threshold', attrs: { 'aria-hidden': 'true' }, style: { insetInlineStart: `${(up / max) * 100}%` } }, track);
      marks.push(m);
    });
  }
  render();
  return {
    el,
    update(data) { if (isNum(data)) o.value = data; else Object.assign(o, data || {}); render(); },
    destroy() {},
  };
}

/* ------------------------------------------------------------------------- */
/* Gauge (hero, 270° arc)                                                     */
/* ------------------------------------------------------------------------- */

/**
 * Hero gauge for the Safety Index: 270° arc with a same-ramp track, tone by thresholds
 * (≥85 good, ≥70 warning, ≥50 serious, else critical), hero number (.gauge-value) with an
 * icon+label chip beneath it, 600ms value tween (skipped under reduced motion).
 * Returns { el, update(valueOr{value,max,label,sublabel}), destroy }.
 */
export function gauge(opts = {}) {
  const o = { value: 0, max: 100, size: 180, label: '', sublabel: '', ...opts };
  const el = htmlEl('div', { class: ['chart', 'gauge', 'chart-gauge'] });
  const svg = svgEl('svg', { xmlns: SVG_NS, class: 'gauge-svg', role: 'img' }, el);
  const labelEl = htmlEl('div', { class: 'gauge-label' }, el);
  const subEl = htmlEl('div', { class: 'gauge-sublabel' }, el);
  let shown = null;        // value currently displayed (tween source)
  let cancelTween = () => {};
  let nodes = null;

  function build() {
    clear(svg);
    const size = Math.max(96, num(o.size, 180));
    const stroke = Math.max(10, Math.round(size * 0.075));
    const cx = size / 2;
    const cy = size / 2;
    const r = size / 2 - stroke / 2 - 8;
    const H = Math.round(cy + r * Math.SQRT1_2 + stroke / 2 + 6);
    svg.setAttribute('viewBox', `0 0 ${size} ${H}`);
    svg.setAttribute('width', String(size));
    svg.setAttribute('height', String(H));
    svg.style.maxInlineSize = `${size}px`;
    svg.style.blockSize = 'auto';
    const polar = (deg, rad = r) => [cx + rad * Math.sin((deg * Math.PI) / 180), cy - rad * Math.cos((deg * Math.PI) / 180)];
    const [sx, sy] = polar(-135);
    const [ex, ey] = polar(135);
    const d = `M${r2(sx)},${r2(sy)} A${r2(r)},${r2(r)} 0 1 1 ${r2(ex)},${r2(ey)}`;
    const track = svgEl('path', { d, class: 'gauge-track', 'stroke-width': stroke, pathLength: 1 }, svg);
    const arc = svgEl('path', { d, class: 'gauge-arc', 'stroke-width': stroke, pathLength: 1, 'stroke-dasharray': '0 1' }, svg);
    arc.style.transition = 'none';
    // threshold ticks on the outer rim (50 / 70 / 85 %)
    const ticks = svgEl('g', { class: 'gauge-ticks', 'aria-hidden': 'true' }, svg);
    [50, 70, 85].forEach((p) => {
      const a = -135 + (p / 100) * 270;
      const [x1, y1] = polar(a, r + stroke / 2 + 2);
      const [x2, y2] = polar(a, r + stroke / 2 + 6);
      svgEl('line', { x1: r2(x1), y1: r2(y1), x2: r2(x2), y2: r2(y2), class: 'gauge-tick', 'stroke-width': 1.5 }, ticks);
    });
    const hero = svgEl('text', { x: cx, y: cy + 8, 'text-anchor': 'middle', class: 'gauge-value' }, svg);
    if (size < 170) hero.style.fontSize = `${Math.round(clamp(size * 0.27, 22, 48))}px`;
    const chip = svgEl('g', { class: 'gauge-chip' }, svg);
    const chipBg = svgEl('rect', { height: 22, rx: 11, y: cy + 22, 'stroke-width': 1 }, chip);
    const chipIcon = svgEl('g', {}, chip);
    const chipText = svgEl('text', { y: cy + 37, class: 'label is-strong', style: { fontSize: '12px' } }, chip);
    nodes = { track, arc, hero, chip, chipBg, chipIcon, chipText, cx, cy, size };
  }

  function paintTone(tone, max, value) {
    const color = toneVar(tone);
    nodes.track.style.stroke = `color-mix(in srgb, ${color} 22%, var(--bg-2))`;
    nodes.arc.style.stroke = color;
    const label = T.tones[tone] || tone;
    nodes.chipText.textContent = label;
    const rtl = isRTL(el);
    const tw = measure(label, 12, { weight: 600 });
    const w = Math.round(tw + 34);
    const x0 = nodes.cx - w / 2;
    nodes.chipBg.setAttribute('x', String(x0));
    nodes.chipBg.setAttribute('width', String(w));
    nodes.chipBg.style.fill = `color-mix(in srgb, ${color} 16%, transparent)`;
    nodes.chipBg.style.stroke = `color-mix(in srgb, ${color} 45%, transparent)`;
    clear(nodes.chipIcon);
    nodes.chipIcon.appendChild(toneGlyph(tone, 12));
    const iconX = rtl ? x0 + w - 10 - 12 : x0 + 10;
    nodes.chipIcon.setAttribute('transform', `translate(${iconX} ${nodes.cy + 27})`);
    nodes.chipIcon.style.color = color;
    nodes.chipText.setAttribute('x', String(rtl ? x0 + w - 28 : x0 + 28));
    nodes.chipText.setAttribute('text-anchor', rtl ? 'start' : 'start');
    nodes.chipText.style.direction = rtl ? 'rtl' : 'ltr';
    svg.setAttribute('aria-label', `${o.label ? `${o.label}: ` : ''}${t('charts.of', { value: fmt.num(value), max: fmt.num(max) })} — ${label}`);
  }

  function paintValue(v, max) {
    nodes.hero.textContent = fmt.num(Math.round(v));
    nodes.arc.setAttribute('stroke-dasharray', `${clamp(v / max, 0, 1).toFixed(4)} 1`);
  }

  function render(animate) {
    const max = Math.max(num(o.max, 100), 0.000001);
    const target = clamp(num(o.value), 0, max);
    labelEl.textContent = str(o.label);
    labelEl.hidden = !o.label;
    subEl.textContent = str(o.sublabel);
    subEl.hidden = !o.sublabel;
    paintTone(indexTone(target, max), max, target);
    cancelTween();
    const from = isNum(shown) ? shown : 0;
    if (!animate) { shown = target; paintValue(target, max); return; }
    cancelTween = tween(from, target, 600, (v) => { shown = v; paintValue(v, max); });
  }

  build();
  render(true);
  const offTheme = bus.on('theme:change', () => { if (!el.isConnected) { offTheme(); offLang(); return; } requestAnimationFrame(() => render(false)); });
  const offLang = bus.on('lang:change', () => { if (!el.isConnected) { offTheme(); offLang(); return; } requestAnimationFrame(() => render(false)); });
  return {
    el,
    update(data) {
      if (isNum(data)) o.value = data; else Object.assign(o, data || {});
      if (data && typeof data === 'object' && 'size' in data) build();
      render(true);
    },
    destroy() { cancelTween(); offTheme(); offLang(); },
  };
}

/* ------------------------------------------------------------------------- */
/* Ring                                                                       */
/* ------------------------------------------------------------------------- */

/**
 * Small ring meter (ISO clause scores). Same-ramp track, value in the centre.
 * Returns { el, update(valueOr{value,max,color,label}), destroy }.
 */
export function ring(opts = {}) {
  const o = { value: 0, max: 100, size: 72, color: 'var(--s1)', label: '', format: null, ...opts };
  const el = htmlEl('div', { class: 'ring' });
  const svg = svgEl('svg', { xmlns: SVG_NS, role: 'img' }, el);
  const labelEl = htmlEl('span', { class: 'ring-label' }, el);
  let arc = null;
  let valueText = null;
  let cancelTween = () => {};
  let shown = null;

  function build() {
    clear(svg);
    const size = Math.max(32, num(o.size, 72));
    const stroke = Math.max(4, Math.round(size * 0.085));
    const r = (size - stroke) / 2 - 1;
    const c = size / 2;
    svg.setAttribute('viewBox', `0 0 ${size} ${size}`);
    svg.setAttribute('width', String(size));
    svg.setAttribute('height', String(size));
    el.style.inlineSize = `${size}px`;
    svgEl('circle', { cx: c, cy: c, r, class: 'ring-track', 'stroke-width': stroke }, svg);
    arc = svgEl('circle', { cx: c, cy: c, r, class: 'ring-arc', 'stroke-width': stroke, pathLength: 1, 'stroke-dasharray': '0 1', transform: `rotate(-90 ${c} ${c})` }, svg);
    arc.style.transition = 'none';
    valueText = svgEl('text', { x: c, y: c + size * 0.085, 'text-anchor': 'middle', class: 'ring-value', style: { fontSize: `${Math.round(clamp(size * 0.24, 10, 28))}px` } }, svg);
  }
  function text(v, max) {
    if (typeof o.format === 'function') return str(o.format(v, max));
    return max === 100 ? fmt.pct(v) : fmt.num(v, { maximumFractionDigits: 1 });
  }
  function render(animate) {
    const max = Math.max(num(o.max, 100), 0.000001);
    const target = clamp(num(o.value), 0, max);
    const color = str(o.color).trim() || 'var(--s1)';
    svg.querySelector('.ring-track').style.stroke = `color-mix(in srgb, ${color} 22%, var(--bg-2))`;
    arc.style.stroke = color;
    labelEl.textContent = str(o.label);
    labelEl.hidden = !o.label;
    svg.setAttribute('aria-label', `${o.label ? `${o.label}: ` : ''}${text(target, max)}`);
    cancelTween();
    const paint = (v) => { shown = v; arc.setAttribute('stroke-dasharray', `${clamp(v / max, 0, 1).toFixed(4)} 1`); valueText.textContent = text(Math.round(v), max); };
    if (!animate) { paint(target); return; }
    cancelTween = tween(isNum(shown) ? shown : 0, target, 600, paint);
  }
  build();
  render(true);
  return {
    el,
    update(data) {
      if (isNum(data)) o.value = data; else Object.assign(o, data || {});
      if (data && typeof data === 'object' && 'size' in data) build();
      render(true);
    },
    destroy() { cancelTween(); },
  };
}

/* ------------------------------------------------------------------------- */
/* Spider (static radar)                                                      */
/* ------------------------------------------------------------------------- */

/**
 * Static spider chart: filled polygons, hairline rings, axis labels. Optional `target`
 * draws a solid hairline reference polygon. Legend for ≥ 2 series.
 * @param {{axes:Array<{id?:string,label:string}>, series:Array<{id?:string,label:string,color?:string,values:number[]}>, max?:number, size?:number, ariaLabel?:string, target?:number, rings?:number}} opts
 */
export function spider(opts = {}) {
  const o = { axes: [], series: [], max: 100, size: 260, ariaLabel: '', target: null, rings: 4, ...opts };
  const shell = chartShell({ className: 'chart-spider', ariaLabel: o.ariaLabel, role: 'img', render });
  const { svg, el } = shell;
  svg.setAttribute('aria-roledescription', t('charts.roles.spider'));
  shell.role = 'spider';

  const axesOf = () => arr(o.axes).map((a) => (typeof a === 'string' ? { id: a, label: a } : { id: str(a && a.id), label: str(a && a.label) }));
  const seriesOf = (n) => arr(o.series).map((s, i) => ({ ...s, label: str(s.label), color: seriesColor(s, i), values: Array.from({ length: n }, (_, k) => clamp(num(arr(s.values)[k], 0), 0, Math.max(num(o.max, 100), 0.000001))) }));

  function render(W) {
    clear(svg);
    const axes = axesOf();
    const n = axes.length;
    const size = Math.max(120, num(o.size, 260));
    const max = Math.max(num(o.max, 100), 0.000001);
    svg.setAttribute('viewBox', `0 0 ${size} ${size}`);
    svg.setAttribute('width', '100%');
    svg.style.maxInlineSize = `${size}px`;
    svg.style.marginInline = 'auto';
    svg.style.blockSize = 'auto';
    if (n < 3) {
      svgEl('text', { x: size / 2, y: size / 2, 'text-anchor': 'middle', class: 'label is-muted', text: T.noData }, svg);
      buildLegend(shell.legendHost, []);
      return;
    }
    const rtl = isRTL(el);
    const A = anchors(rtl);
    const labelPx = 11;
    const longest = Math.max(...axes.map((a) => measure(a.label, labelPx)), 0);
    const margin = clamp(longest * 0.55 + 14, 28, size * 0.22);
    const cx = size / 2;
    const cy = size / 2;
    const R = size / 2 - margin;
    const angle = (k) => (k / n) * TAU - Math.PI / 2;
    const pt = (k, rad) => [cx + rad * Math.cos(angle(k)), cy + rad * Math.sin(angle(k))];
    const poly = (rad) => Array.from({ length: n }, (_, k) => pt(k, rad).map(r2).join(',')).join(' ');
    const grid = svgEl('g', { class: 'spider-grid-layer', 'aria-hidden': 'true' }, svg);
    const rings = Math.max(1, Math.round(num(o.rings, 4)));
    for (let k = 1; k <= rings; k += 1) svgEl('polygon', { points: poly((R * k) / rings), class: 'spider-grid' }, grid);
    axes.forEach((_, k) => { const [x, y] = pt(k, R); svgEl('line', { x1: cx, y1: cy, x2: r2(x), y2: r2(y), class: 'spider-axis' }, grid); });
    if (isNum(o.target)) svgEl('polygon', { points: poly((clamp(o.target, 0, max) / max) * R), class: 'spider-target' }, grid);
    const series = seriesOf(n);
    const sg = svgEl('g', { class: 'spider-series' }, svg);
    series.forEach((s) => {
      const points = s.values.map((v, k) => pt(k, (v / max) * R).map(r2).join(',')).join(' ');
      svgEl('polygon', { points, class: 'spider-area', style: { fill: s.color, stroke: s.color } }, sg);
    });
    if (series.length <= 2) {
      series.forEach((s) => s.values.forEach((v, k) => { const [x, y] = pt(k, (v / max) * R); svgEl('circle', { cx: r2(x), cy: r2(y), r: 3.5, class: 'marker', style: { fill: s.color } }, sg); }));
    }
    const labels = svgEl('g', { class: 'spider-labels', 'aria-hidden': 'true' }, svg);
    axes.forEach((a, k) => {
      const [x, y] = pt(k, R + 12);
      const c = Math.cos(angle(k));
      const anchor = Math.abs(c) < 0.2 ? 'middle' : (c > 0 ? A.left : A.right);
      const dy = Math.sin(angle(k)) > 0.2 ? 10 : Math.sin(angle(k)) < -0.2 ? -2 : 4;
      svgEl('text', { x: r2(x), y: r2(y + dy), 'text-anchor': anchor, class: 'spider-label', text: fitText(a.label, margin * 1.9, labelPx) }, labels);
    });
    buildLegend(shell.legendHost, series.map((s) => ({ label: s.label, color: s.color })), { kind: 'dot' });
    svg.setAttribute('aria-label', o.ariaLabel || series.map((s) => `${s.label}: ${s.values.map((v, k) => `${fmt.num(v)} ${axes[k].label}`).join(sep())}`).join(' — '));
  }

  shell.redraw();
  return {
    el,
    update(data = {}) { Object.assign(o, data || {}); shell.redraw(); },
    table() {
      const axes = axesOf();
      const series = seriesOf(axes.length);
      return buildTable({
        caption: o.ariaLabel,
        columns: [{ label: T.axis }, ...series.map((s) => ({ label: s.label, numeric: true }))],
        rows: axes.map((a, k) => [a.label, ...series.map((s) => fmt.num(s.values[k], { maximumFractionDigits: 1 }))]),
      });
    },
    destroy: shell.destroy,
  };
}

/* ------------------------------------------------------------------------- */
/* Public surface                                                             */
/* ------------------------------------------------------------------------- */

export const charts = {
  lineChart, barChart, groupedBars, heatmap, segmentedBar, dumbbell, sparkline, meter, gauge, ring, spider,
  tooltip, paletteFor, prefersReducedMotion,
};

export default charts;
