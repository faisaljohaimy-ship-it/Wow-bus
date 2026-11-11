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
 *   motion.page(root, { same })                       → Promise; route transition for a freshly mounted view:
 *                                                       each child of root rises 10 px and fades in (300 ms, after
 *                                                       a 60 ms hold that lets the outgoing afterimage thin out), and
 *                                                       the page header enters as a short stagger (code tag from
 *                                                       the inline-start, title, lead, scope-chip row, actions;
 *                                                       40 ms apart). `same` (same route, new params): a plain
 *                                                       quick fade, no stagger. Never on first paint, refresh or
 *                                                       language change (the router decides).
 *   motion.leave(el)                                  → Promise; outgoing-view afterimage: fade + recede (140 ms).
 *   motion.glide(el, from, to, { duration })          → Promise; FLIP move of an indicator between two transforms
 *                                                       (to = the resting inline transform already set by caller).
 *   motion.reveal(el, { rotate, scale, delay })       → Promise; one-time brand reveal (scale + rotate + fade).
 *   motion.timing                                     timing tokens (seconds / bezier arrays).
 *   motion.animate                                    the raw vendored animate (respect enabled() yourself).
 *
 * Shell timing (v3.3, css/tokens.css): page 300 ms (+60 ms hold), leave 140 ms, glide 320 ms, header stagger 40 ms,
 * rise 10 px, ease-glide cubic-bezier(.22,1,.36,1).
 */
import { animate, stagger as motionStagger } from '../vendor/motion.js';
import { fmt } from '../core/fmt.js';
import { isRtl } from './i18n-bridge.js';

export const timing = Object.freeze({
  micro: 0.16,
  main: 0.26,
  page: 0.3,
  leave: 0.14,
  pageDelay: 0.06,                    // incoming view waits for the outgoing afterimage to thin out
  glide: 0.32,
  slow: 0.42,
  flash: 0.6,
  number: 0.6,
  stagger: 0.032,
  staggerHead: 0.04,
  staggerCap: 12,                     // items after the 12th share the last delay (long lists stay snappy)
  rise: 10,                           // px: incoming view offset
  ease: [0.16, 1, 0.3, 1],
  easeInOut: [0.65, 0, 0.35, 1],
  easeGlide: [0.22, 1, 0.36, 1],
  easeIn: [0.4, 0, 1, 1],
  linear: [0, 0, 1, 1],
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
  el.setAttribute('data-motion-owned', '');            // css/components.css: dialog.drawer[data-motion-owned] { transition: none }
  const keyframes = open
    ? { transform: [off, 'none'] }
    : { transform: [null, off], opacity: [null, 0.6] };
  const controls = run([el], keyframes, open
    ? { duration: timing.main, ease: timing.ease }
    : { duration: 0.2, ease: timing.easeInOut });
  const release = () => { restore(snap); el.removeAttribute('data-motion-owned'); };
  if (!controls) { release(); return done(); }
  // Inline styles are always restored: after a close the caller removes the panel in the same microtask
  // chain (no frame is painted in between), and a re-opened panel starts from clean inline styles.
  return settle(controls).then(release);
}

/* ---- page ---- */

/** Animate one element with its own keyframes/options; inline opacity/transform are restored afterwards. */
function one(el, keyframes, options) {
  const snap = snapshot([el], ['opacity', 'transform']);
  const controls = run([el], keyframes, options);
  if (!controls) { restore(snap); return done(); }
  return settle(controls).then(() => restore(snap));
}

const visible = (el) => el instanceof Element && !el.hidden && el.getClientRects().length > 0;

/**
 * The page header of a freshly mounted view, as an ordered list of [element, kind] parts:
 * code tag, title, the rest of the title block row by row (lead, scope-chip row), then the action group(s).
 * Works for .view-head (views) and .ck-head (cockpit); anything else falls back to the first h1.
 */
function headerParts(view) {
  const h1 = view.querySelector('h1');
  if (!h1) return { head: null, parts: [] };
  const head = h1.closest('.view-head, .ck-head, header') || h1.parentElement;
  if (!head || !view.contains(head)) return { head: null, parts: [] };
  const parts = [];
  const code = head.querySelector('.code-tag');
  if (code) parts.push([code, 'code']);
  parts.push([h1, 'title']);
  const block = h1.parentElement;
  // Rows enter whole (a chip row or an action group is one part): fewer layers in the transition frame.
  const spread = (el, kind) => { parts.push([el, kind]); };
  if (block && block !== head) {
    for (const el of block.children) if (el !== h1 && el !== code && visible(el)) spread(el, 'line');
  }
  for (const el of head.children) {
    if (el === block || el === h1 || el === code || !visible(el) || el.contains(h1)) continue;
    spread(el, 'action');
  }
  return { head, parts: parts.filter(([el]) => visible(el)) };
}

/**
 * Route transition for a freshly mounted view (root = the <main> container; its children are animated, never
 * the scroller itself). Opacity + a 10 px rise for the view, and a short staggered entrance for its header.
 * Input is never blocked: nothing waits on these promises and no pointer-events are touched.
 */
export function page(root, { same = false } = {}) {
  const host = toElements(root)[0];
  if (!host || !enabled()) return done();
  const views = Array.from(host.children).filter((el) => !el.classList.contains('route-ghost'));
  if (!views.length) return done();
  if (same) {
    const snap = snapshot(views, ['opacity']);
    const c = run(views, { opacity: [0.55, 1] }, { duration: timing.main, ease: timing.ease });
    if (!c) { restore(snap); return done(); }
    return settle(c).then(() => restore(snap));
  }
  const rise = { opacity: [0, 1], transform: [`translateY(${timing.rise}px)`, 'none'] };
  const d0 = timing.pageDelay;
  const jobs = views.map((el, i) => one(el, rise, { duration: timing.page, ease: timing.ease, delay: d0 + Math.min(i, 3) * 0.04 }));
  const { head, parts } = headerParts(views[0]);
  if (head) {
    head.classList.add('is-entering');
    const inline = isRtl() ? 12 : -12;
    let line = 0;
    let action = 0;
    parts.slice(0, 24).forEach(([el, kind]) => {
      let keyframes;
      let delay;
      let duration = timing.slow;
      if (kind === 'code') {
        keyframes = { opacity: [0, 1], transform: [`translateX(${inline}px)`, 'none'] };
        delay = d0 + 0.02;
      } else if (kind === 'title') {
        keyframes = { opacity: [0, 1], transform: ['translateY(14px)', 'none'] };
        delay = d0 + 0.06;
        duration = 0.48;
      } else if (kind === 'line') {
        keyframes = { opacity: [0, 1], transform: ['translateY(8px)', 'none'] };
        delay = d0 + 0.12 + Math.min(line++, 6) * timing.staggerHead;
      } else {
        keyframes = { opacity: [0, 1], transform: ['translateY(6px) scale(0.97)', 'none'] };
        delay = d0 + 0.16 + Math.min(action++, 5) * timing.staggerHead;
        duration = timing.page;
      }
      jobs.push(one(el, keyframes, { duration, delay, ease: timing.ease }));
    });
    // The CSS rule sweep (.is-entering .code-tag::after) runs once; the class leaves with the last part.
    setTimeout(() => head.classList.remove('is-entering'), 900);
  }
  return Promise.all(jobs).then(() => undefined);
}

/** Outgoing-view afterimage: fade and recede slightly (depth). Resolves when the layer may be removed. */
export function leave(target, { duration = timing.leave } = {}) {
  const els = toElements(target);
  if (!els.length || !enabled()) return done();
  return settle(run(els, { opacity: [1, 0], transform: ['none', 'translateY(-6px) scale(0.98)'] }, { duration, ease: timing.linear }));
}

/**
 * FLIP glide for a single indicator: the caller has already written the resting transform (and size) inline;
 * this plays `from` → `to` on the compositor. A new glide replaces one still running on the same element.
 */
const glides = new WeakMap();
export function glide(el, from, to, { duration = timing.glide } = {}) {
  if (!(el instanceof Element) || !from || !to || from === to || !enabled()) return done();
  const prev = glides.get(el);
  if (prev) { try { prev.cancel(); } catch { /* finished */ } }
  let anim = null;
  try { anim = el.animate([{ transform: from }, { transform: to }], { duration: duration * 1000, easing: `cubic-bezier(${timing.easeGlide.join(',')})` }); } catch { return done(); }
  glides.set(el, anim);
  return anim.finished.then(() => { if (glides.get(el) === anim) glides.delete(el); }, () => undefined);
}

/** One-time reveal (brand mark at boot): scale + rotate + fade, rotation mirrored for RTL. */
export function reveal(target, { rotate = -70, scale = 0.6, delay = 0, duration = timing.slow * 1.6 } = {}) {
  const els = toElements(target);
  if (!els.length || !enabled()) return done();
  const r = isRtl() ? -rotate : rotate;
  return Promise.all(els.map((el) => one(el, { opacity: [0, 1], transform: [`rotate(${r}deg) scale(${scale})`, 'none'] }, { duration, delay, ease: timing.ease })));
}

export const motion = { enabled, enter, exit, number, flash, drawer, page, leave, glide, reveal, timing, animate };
export default motion;
