/**
 * Icon effect (js/ui/icon-fx.js, v3.8.3): melt → transparent vanish → glass return.
 *
 * Every UI icon is an inline `svg.icon` (js/ui/art.js; eight more are static in index.html). At rest an icon is
 * drawn as glass by CSS alone (css/components.css, "Icon glass"), so the look is there before this module loads
 * and when motion is off. This module only starts the cycle: it adds the class `ifx-run` to the icons inside the
 * window, with a delay that grows along the reading direction, so one wave crosses the screen. The cycle itself is
 * two CSS animations: `ifx-move` (translate, scale, opacity — smooth, compositor) and `ifx-paint` (filter and body
 * opacity in a few steps), so nothing is repainted between the steps.
 *
 * When a wave runs: shortly after boot, after every route change, and then every AMBIENT_MS while the page is
 * visible and the reader is not typing, pressing or scrolling. `html[data-iconfx]` = "cycle" (default), "enter"
 * (no ambient repeats) or "off" (resting glass only); `html[data-bg="static"]` also stops the ambient repeats.
 * Nothing runs under reduced motion (js/ui/motion.js `enabled()`), forced colours or print.
 *
 * A dense page (more than DENSE_FROM icons) starts fewer icons per wave, taking turns; and when a wave makes frames
 * slow, the next ones shrink and come less often (see watchFrames).
 *
 * Not touched: layout, hit areas, the accessibility tree. An icon inside a hovered, focused or pressed control is
 * never started, and CSS ends a running cycle at once when its control is hovered, focused or pressed.
 *
 * The melt uses four shared SVG filters (noise + a downward displacement + a vertical smear) that this module
 * injects once. Charts, gauges, the site plan, QR codes and the brand logo are not `svg.icon` and are not part of
 * this.
 */
import { enabled as motionEnabled } from './motion.js';

const RUN = 'ifx-run';
const LITE = 'ifx-lite';          // small icons: the same cycle without the SVG melt filters
const LITE_BELOW = 15;            // px of rendered width
export const CYCLE_MS = 2400;     // one icon: melt, vanish, glass return (must equal the CSS duration)
export const SPREAD_MS = 1100;    // the last icon of a wave starts this long after the first
const AMBIENT_MS = 12000;         // pause between ambient waves
const QUIET_MS = 4000;            // no ambient wave this soon after a key press, a pointer press or a scroll
const MAX_ICONS = 72;             // icons started by one wave (those inside the window)
const MAX_DENSE = 28;             // the same on a dense page (more than DENSE_FROM icons in the document)
const DENSE_FROM = 240;
const CONTROLS = 'a, button, [role="button"], [role="tab"], [role="menuitem"], [role="option"], summary, label, input, select, textarea';
const SVG_NS = 'http://www.w3.org/2000/svg';

let started = false;
let ambientTimer = 0;
let waveTimer = 0;
let lastInput = 0;
let waveCount = 0;
const waveOf = new WeakMap();     // icon → number of the wave that started its running cycle

const mq = (q) => { try { return window.matchMedia(q); } catch { return null; } };
const forcedMQ = mq('(forced-colors: active)');
const printMQ = mq('print');

/** "cycle" | "enter" | "off" — from html[data-iconfx]; a static background setting means no ambient repeats. */
export function mode() {
  const root = document.documentElement;
  const v = root.getAttribute('data-iconfx');
  if (v === 'off' || v === 'enter') return v;
  return root.getAttribute('data-bg') === 'static' ? 'enter' : 'cycle';
}

function allowed() {
  if (mode() === 'off') return false;
  if ((forcedMQ && forcedMQ.matches) || (printMQ && printMQ.matches)) return false;
  return motionEnabled();
}

/** Delay of an icon inside one wave: along the reading direction first, a little by height. Pure. */
export function waveDelay(cx, cy, vw, vh, rtl, spread = SPREAD_MS) {
  const x = Math.min(1, Math.max(0, vw > 0 ? cx / vw : 0));
  const y = Math.min(1, Math.max(0, vh > 0 ? cy / vh : 0));
  const along = rtl ? 1 - x : x;
  return Math.round((along * 0.8 + y * 0.2) * spread);
}

/** The four melt filters: columns of the icon sink by different amounts and smear downward. */
function injectFilters() {
  if (document.getElementById('ifx-defs')) return;
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('id', 'ifx-defs');
  svg.setAttribute('width', '0');
  svg.setAttribute('height', '0');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  svg.style.cssText = 'position:absolute;inline-size:0;block-size:0;overflow:hidden;pointer-events:none';
  const defs = document.createElementNS(SVG_NS, 'defs');
  const steps = [[1.6, 0.25], [3.4, 0.5], [5.4, 0.85], [7.6, 1.25]];   // [sink in px, vertical smear in px]
  steps.forEach(([sink, smear], i) => {
    const f = document.createElementNS(SVG_NS, 'filter');
    f.setAttribute('id', `ifx-m${i + 1}`);
    f.setAttribute('x', '-12%'); f.setAttribute('y', '-10%'); f.setAttribute('width', '124%'); f.setAttribute('height', '200%');
    f.setAttribute('color-interpolation-filters', 'sRGB');
    const noise = document.createElementNS(SVG_NS, 'feTurbulence');
    noise.setAttribute('type', 'fractalNoise'); noise.setAttribute('baseFrequency', '0.3 0.035');
    noise.setAttribute('numOctaves', '1'); noise.setAttribute('seed', '11'); noise.setAttribute('result', 'n');
    // Red = 0.5 (no sideways shift); green squeezed into 0…0.5 so every column moves down, never up.
    const map = document.createElementNS(SVG_NS, 'feColorMatrix');
    map.setAttribute('in', 'n'); map.setAttribute('type', 'matrix');
    map.setAttribute('values', '0 0 0 0 0.5  0 0.62 0 0 0  0 0 0 0 0  0 0 0 0 1'); map.setAttribute('result', 'm');
    const disp = document.createElementNS(SVG_NS, 'feDisplacementMap');
    disp.setAttribute('in', 'SourceGraphic'); disp.setAttribute('in2', 'm'); disp.setAttribute('scale', String(sink * 2));
    disp.setAttribute('xChannelSelector', 'R'); disp.setAttribute('yChannelSelector', 'G'); disp.setAttribute('result', 'd');
    const blur = document.createElementNS(SVG_NS, 'feGaussianBlur');
    blur.setAttribute('in', 'd'); blur.setAttribute('stdDeviation', `0 ${smear}`);
    f.append(noise, map, disp, blur);
    defs.appendChild(f);
  });
  svg.appendChild(defs);
  document.body.appendChild(svg);
}

/** At most `cap` items of `list`, evenly spread; `turn` shifts the start so repeated calls cover every item. Pure. */
export function thin(list, cap, turn = 0) {
  if (!(cap > 0) || list.length <= cap) return list.slice();
  const k = Math.ceil(list.length / cap);
  const from = ((turn % k) + k) % k;
  const out = [];
  for (let i = from; i < list.length; i += k) out.push(list[i]);
  return out;
}

function clear(el) {
  el.classList.remove(RUN, LITE);
  el.style.removeProperty('--ifx-delay');
  waveOf.delete(el);
}

/** Start one wave over the icons inside the window. Returns how many icons it started. */
export function wave() {
  if (!started || !allowed() || document.hidden) return 0;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const rtl = document.documentElement.getAttribute('dir') === 'rtl';
  const picked = [];
  const icons = document.querySelectorAll('svg.icon');
  for (let i = 0; i < icons.length; i += 1) {
    const el = icons[i];
    if (el.classList.contains(RUN)) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 6 || r.height < 6 || r.bottom <= 0 || r.top >= vh || r.right <= 0 || r.left >= vw) continue;
    if (el.closest('.route-ghost, [inert], [hidden]')) continue;
    const ctl = el.closest(CONTROLS);
    if (ctl && ctl.matches(':hover, :focus-visible, :active')) continue;
    picked.push([el, r]);
  }
  // More candidates than one wave takes: every k-th, starting one further each wave, so each icon gets its turn.
  const cap = Math.max(6, Math.round((icons.length > DENSE_FROM ? MAX_DENSE : MAX_ICONS) * quality));
  const chosen = thin(picked, cap, waveCount);
  waveCount += 1;
  const id = waveCount;
  // An icon that already runs another CSS animation (the bell's ring) keeps it.
  const run = chosen.filter(([el]) => { try { return getComputedStyle(el).animationName === 'none'; } catch { return false; } });
  for (const [el, r] of run) {
    el.style.setProperty('--ifx-delay', `${waveDelay(r.left + r.width / 2, r.top + r.height / 2, vw, vh, rtl)}ms`);
    if (r.width < LITE_BELOW) el.classList.add(LITE);
    el.classList.add(RUN);
    waveOf.set(el, id);
  }
  // Safety net: a cycle that never reported its end (node moved, rule overridden) is cleared anyway.
  // Only this wave's own cycles: a later wave may have started the same icon again.
  if (run.length) setTimeout(() => { for (const [el] of run) if (waveOf.get(el) === id) clear(el); }, SPREAD_MS + CYCLE_MS + 400);
  if (run.length) watchFrames();
  return run.length;
}

/**
 * Self-protection: frame times are sampled during a wave. When the median frame takes longer than SLOW_FRAME_MS the
 * next waves start half as many icons and the ambient pause doubles; after three slow waves the ambient repeats stop
 * for this page load (waves after a route change stay, at the reduced size).
 */
const SLOW_FRAME_MS = 34;
let quality = 1;                  // 1 → full, .5 → half the icons, …
let slowWaves = 0;
let watching = false;

/** Median of a list of numbers; 0 for an empty list. Pure. */
export function median(list) {
  if (!list.length) return 0;
  const a = list.slice().sort((x, y) => x - y);
  const m = a.length >> 1;
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
}

function watchFrames() {
  if (watching || typeof requestAnimationFrame !== 'function') return;
  watching = true;
  const deltas = [];
  const t0 = performance.now();
  let last = t0;
  const tick = (now) => {
    deltas.push(now - last);
    last = now;
    if (now - t0 < SPREAD_MS + CYCLE_MS && !document.hidden) { requestAnimationFrame(tick); return; }
    watching = false;
    if (document.hidden || deltas.length < 20) return;
    if (median(deltas) > SLOW_FRAME_MS) { slowWaves += 1; quality = Math.max(0.25, quality / 2); }
  };
  requestAnimationFrame(tick);
}

function scheduleWave(delay) {
  clearTimeout(waveTimer);
  waveTimer = setTimeout(wave, delay);
}

function ambient() {
  clearTimeout(ambientTimer);
  ambientTimer = setTimeout(() => {
    const quiet = Date.now() - lastInput >= QUIET_MS;
    if (mode() === 'cycle' && quiet && slowWaves < 3) wave();
    ambient();
  }, AMBIENT_MS / quality);
}

/** Start the effect. `bus` is the app bus: a wave follows every route change. Safe to call twice. */
export function initIconFx({ bus } = {}) {
  if (started || typeof document === 'undefined') return;
  started = true;
  injectFilters();
  const onEnd = (e) => { if (e.animationName === 'ifx-move' && e.target && e.target.classList) clear(e.target); };
  document.addEventListener('animationend', onEnd, true);
  document.addEventListener('animationcancel', onEnd, true);
  const mark = () => { lastInput = Date.now(); };
  document.addEventListener('pointerdown', mark, { capture: true, passive: true });
  document.addEventListener('keydown', mark, { capture: true, passive: true });
  document.addEventListener('scroll', mark, { capture: true, passive: true });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) scheduleWave(600); });
  if (bus && typeof bus.on === 'function') bus.on('route:change', () => scheduleWave(520));
  scheduleWave(500);
  ambient();
}

/** For captures and tests: stop every running cycle. */
export function stopIconFx() {
  document.querySelectorAll(`svg.icon.${RUN}`).forEach(clear);
}
