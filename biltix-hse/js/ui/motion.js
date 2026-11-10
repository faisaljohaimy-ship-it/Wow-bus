/**
 * BILTIX Risk AI — motion helpers (js/ui/motion.js). Owner: A-UI. Contract: CONTRACT.md §6, spec AC-14.
 *
 * Purposeful, restrained motion on top of the vendored Motion library (js/vendor/motion.js: Motion's
 * vanilla Web Animations `animate` + `stagger`, MIT). Everything here animates transform and opacity
 * only, runs once per user action (never replays on live data), and is skipped entirely when:
 *   - the OS asks for reduced motion (prefers-reduced-motion: reduce) — unless the user chose
 *     "full motion" in the app settings (html[data-motion="full"]);
 *   - the app settings ask for reduced motion: the shell mirrors settings.motion onto html[data-motion]
 *     ('reduce' | 'full', absent = follow the OS), which is what enabled() reads;
 *   - the document is hidden (nothing is visible; animations would only burn CPU);
 *   - the browser has no Web Animations API.
 * When skipped, every helper still leaves the element in its final state and resolves its promise, so
 * callers never branch on motion.
 *
 * Timing tokens (mirrors css/tokens.css): micro 160 ms, main 260 ms, slow 420 ms, stagger 32 ms,
 * ease-out cubic-bezier(.16,1,.3,1), ease-in-out cubic-bezier(.65,0,.35,1).
 *
 *   motion.enabled()                                  → boolean
 *   motion.enter(target, { y, x, scale, delay, stagger, duration, force })
 *                                                     → Promise; first appearance (opacity + translate/scale).
 *                                                       x is an INLINE offset (mirrored in RTL). An element
 *                                                       enters once; repeated calls are no-ops unless force.
 *   motion.exit(target, { y, x, scale, duration })    → Promise; fade/slide out (caller removes the node).
 *   motion.number(el, from, to, { format, duration }) → Promise; count-up for metric changes (tabular figures).
 *   motion.flash(el)                                  → Promise; 600 ms highlight of an updated node
 *                                                       (class .is-flash + opacity pulse).
 *   motion.drawer(el, open)                           → Promise; slide a drawer panel in/out from the inline-end
 *                                                       (bottom for .is-sheet).
 *   motion.page(root)                                 → Promise; route transition, opacity + translateY(6px), 220 ms.
 *   motion.timing                                     timing tokens (seconds / bezier arrays).
 *   motion.animate                                    the raw vendored animate (respect enabled() yourself).
 */
import { animate, stagger as motionStagger } from '../vendor/motion.js';
import { fmt } from '../core/fmt.js';
import { isRtl } from './i18n-bridge.js';

export const timing = Object.freeze({
  micro: 0.16,
  main: 0.26,
  page: 0.22,
  slow: 0.42,
  flash: 0.6,
  number: 0.6,
  stagger: 0.032,
  staggerCap: 12,                     // items after the 12th share the last delay (long lists stay snappy)
  ease: [0.16, 1, 0.3, 1],
  easeInOut: [0.65, 0, 0.35, 1],
});

const done = () => Promise.resolve();

/* ------------------------------------------------------------------ */
/* Gate                                                                 */
/* ------------------------------------------------------------------ */

function osReduced() {
  try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; }
}

/** False under reduced motion (OS or settings), while the document is hidden, or without WAAPI. */
export function enabled() {
  if (typeof document === 'undefined' || typeof window === 'undefined') return false;
  if (document.hidden) return false;
  if (typeof Element === 'undefined' || typeof Element.prototype.animate !== 'function') return false;
  const forced = document.documentElement.getAttribute('data-motion');
  if (forced === 'reduce' || forced === 'reduced') return false;
  if (forced === 'full') return true;
  return !osReduced();
}

/* ------------------------------------------------------------------ */
/* Helpers                                                              */
/* ------------------------------------------------------------------ */

function toElements(target) {
  if (!target) return [];
  if (typeof target === 'string') {
    try { return Array.from(document.querySelectorAll(target)); } catch { return []; }
  }
  if (target instanceof Element) return [target];
  if (typeof target === 'object' && target.el instanceof Element) return [target.el];
  if (typeof target.length === 'number') return Array.from(target).filter((n) => n instanceof Element);
  return [];
}

/** Remember the inline values we are about to animate so they can be restored afterwards. */
function snapshot(els, props) {
  return els.map((el) => ({ el, values: props.map((p) => [p, el.style.getPropertyValue(p), el.style.getPropertyPriority(p)]) }));
}
function restore(snap) {
  for (const { el, values } of snap) {
    for (const [p, v, prio] of values) {
      if (v) el.style.setProperty(p, v, prio); else el.style.removeProperty(p);
    }
  }
}

function settle(controls) {
  if (!controls) return done();
  const fin = controls.finished && typeof controls.finished.then === 'function' ? controls.finished : controls;
  return Promise.resolve(fin).then(() => undefined, () => undefined);
}

function run(els, keyframes, options) {
  try { return animate(els, keyframes, options); } catch { return null; }
}

function offset(x = 0, y = 0, scale = 1) {
  const parts = [];
  if (x || y) parts.push(`translate(${Math.round(x * 100) / 100}px, ${Math.round(y * 100) / 100}px)`);
  if (scale !== 1) parts.push(`scale(${scale})`);
  return parts.length ? parts.join(' ') : 'none';
}

const entered = new WeakSet();

/* ------------------------------------------------------------------ */
/* Public helpers                                                       */
/* ------------------------------------------------------------------ */

/**
 * First-appearance animation. Use on initial render only; live updates patch in place (use flash()).
 * @param {Element|Element[]|NodeList|string} target
 */
export function enter(target, { y = 8, x = 0, scale = 1, delay = 0, stagger = timing.stagger, duration = timing.main, force = false } = {}) {
  const els = toElements(target).filter((el) => force || !entered.has(el));
  els.forEach((el) => entered.add(el));
  if (!els.length || !enabled()) return done();
  const dx = isRtl() ? -x : x;
  const from = offset(dx, y, scale);
  const keyframes = from === 'none' ? { opacity: [0, 1] } : { opacity: [0, 1], transform: [from, 'none'] };
  const snap = snapshot(els, ['opacity', 'transform']);
  let delayOpt = delay;
  if (els.length > 1 && stagger > 0) {
    const s = motionStagger(stagger, { startDelay: delay });
    delayOpt = (i, total) => s(Math.min(i, timing.staggerCap), total);
  }
  const controls = run(els, keyframes, { duration, delay: delayOpt, ease: timing.ease });
  if (!controls) { restore(snap); return done(); }
  return settle(controls).then(() => restore(snap));
}

/** Exit animation; resolves when the element may be removed. */
export function exit(target, { y = 6, x = 0, scale = 1, duration = timing.micro } = {}) {
  const els = toElements(target);
  if (!els.length || !enabled()) return done();
  const dx = isRtl() ? -x : x;
  const to = offset(dx, y, scale);
  const keyframes = to === 'none' ? { opacity: [null, 0] } : { opacity: [null, 0], transform: [null, to] };
  return settle(run(els, keyframes, { duration, ease: timing.easeInOut }));
}

/* ---- number count-up (rAF; Motion's WAAPI build animates elements, not plain values) ---- */

const counters = new WeakMap();
const easeOutCubic = (p) => 1 - Math.pow(1 - p, 3);
const defaultFormat = (v) => fmt.num(v);

/**
 * Animate a metric's text from `from` to `to`. Text is written with textContent; the format callback
 * receives the rounded intermediate value (integers when both ends are integers).
 */
export function number(el, from, to, { format = defaultFormat, duration = timing.number } = {}) {
  if (!(el instanceof Element)) return done();
  const prev = counters.get(el);
  if (prev) prev.cancel();
  const end = Number(to);
  const fmtFn = typeof format === 'function' ? format : defaultFormat;
  const write = (v) => { try { el.textContent = String(fmtFn(v)); } catch { el.textContent = String(v); } };
  const start = Number(from);
  if (!Number.isFinite(end)) { write(to); return done(); }
  if (!Number.isFinite(start) || start === end || !enabled() || typeof requestAnimationFrame !== 'function') { write(end); return done(); }
  const integers = Number.isInteger(start) && Number.isInteger(end);
  const ms = Math.max(0, duration * 1000);
  const prevNumeric = el.style.getPropertyValue('font-variant-numeric');
  el.style.setProperty('font-variant-numeric', 'tabular-nums');
  return new Promise((resolve) => {
    let raf = 0;
    let t0 = 0;
    const finish = () => {
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      counters.delete(el);
      document.removeEventListener('visibilitychange', onHide);
      write(end);
      if (prevNumeric) el.style.setProperty('font-variant-numeric', prevNumeric); else el.style.removeProperty('font-variant-numeric');
      resolve();
    };
    const onHide = () => { if (document.hidden) finish(); };
    const step = (now) => {
      if (!t0) t0 = now;
      const p = ms ? Math.min(1, (now - t0) / ms) : 1;
      const v = start + (end - start) * easeOutCubic(p);
      write(integers ? Math.round(v) : Math.round(v * 10) / 10);
      if (p < 1) raf = requestAnimationFrame(step); else finish();
    };
    counters.set(el, { cancel: finish });
    document.addEventListener('visibilitychange', onHide);
    raf = requestAnimationFrame(step);
  });
}

/* ---- flash ---- */

const flashTimers = new WeakMap();

/** Highlight a node that just changed (row, tile, chip). CSS may style `.is-flash`. */
export function flash(el) {
  if (!(el instanceof Element)) return done();
  clearTimeout(flashTimers.get(el));
  el.classList.add('is-flash');
  const ms = timing.flash * 1000;
  const clear = () => { el.classList.remove('is-flash'); flashTimers.delete(el); };
  if (!enabled()) {
    flashTimers.set(el, setTimeout(clear, ms));
    return done();
  }
  const snap = snapshot([el], ['opacity']);
  return settle(run([el], { opacity: [0.45, 1] }, { duration: timing.flash, ease: timing.ease })).then(() => { restore(snap); clear(); });
}

/* ---- drawer ---- */

/**
 * Slide a drawer panel. The panel enters from the inline-end edge (left in RTL, right in LTR) or from
 * the bottom for `.is-sheet`. CSS transitions on the panel are suspended while Motion drives it and the
 * inline styles are removed afterwards, so the stylesheet stays the single source of the resting state.
 */
export function drawer(el, open) {
  if (!(el instanceof Element) || !enabled()) return done();
  const sheet = el.classList.contains('is-sheet');
  const off = sheet ? 'translateY(100%)' : `translateX(${isRtl() ? '-100%' : '100%'})`;
  const snap = snapshot([el], ['transform', 'opacity', 'transition']);
  el.style.setProperty('transition', 'none');
  const keyframes = open
    ? { transform: [off, 'none'] }
    : { transform: [null, off], opacity: [null, 0.6] };
  const controls = run([el], keyframes, open
    ? { duration: timing.main, ease: timing.ease }
    : { duration: 0.2, ease: timing.easeInOut });
  if (!controls) { restore(snap); return done(); }
  // Inline styles are always restored: after a close the caller removes the panel in the same microtask
  // chain (no frame is painted in between), and a re-opened panel starts from clean inline styles.
  return settle(controls).then(() => restore(snap));
}

/* ---- page ---- */

/** Route transition for a freshly mounted view root. */
export function page(root) {
  const els = toElements(root);
  if (!els.length || !enabled()) return done();
  const snap = snapshot(els, ['opacity', 'transform']);
  const controls = run(els, { opacity: [0, 1], transform: ['translateY(6px)', 'none'] }, { duration: timing.page, ease: timing.ease });
  if (!controls) { restore(snap); return done(); }
  return settle(controls).then(() => restore(snap));
}

export const motion = { enabled, enter, exit, number, flash, drawer, page, timing, animate };
export default motion;
