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
 *
 * Stage (v3.6 motion pass) — what moves when a route mounts, and only then:
 *   motion.stageBegin({ fresh })                      shell, on ui:route-leave: a new mount starts. `fresh` = another route
 *                                                       (or the first one); false for a refresh / language change, which
 *                                                       stages nothing. Pending reveals of the old view are dropped.
 *   motion.stage(root, { fresh })                     shell, on route:change (after render). One flush in the next frame,
 *                                                       before the first paint: one layout read, then
 *                                                       · enter() calls made during render: on-screen elements enter,
 *                                                         elements below the fold go to the scroll reveal;
 *                                                       · top-level cards / tiles below the fold → scroll reveal;
 *                                                       · on screen: KPI figures count up (countIn), bar fills grow,
 *                                                         HTML segmented bars sweep, table rows stagger (≤ 12);
 *                                                         below the fold: the same, when they scroll in.
 *   motion.intro(el, { hold, play, release })         component draw-in (charts): only for components built during a
 *                                                       mount. hold() shows the start state until the observer says the
 *                                                       element is on screen → play() (returns its length in ms); off
 *                                                       screen → release() (final state) and play() when it scrolls in.
 *                                                       Returns a handle { state } or null (no intro: reduced motion,
 *                                                       built after the mount, e.g. by a live update).
 *   motion.countIn(textNode|el, { delay })           count a figure up from 0 to its current text; stops at once if
 *                                                       anything else rewrites the text (a live update wins).
 *   motion.flip(items, mutate, { key })               FLIP: measure, mutate the DOM, play moved items from their old box.
 *   parseFigure(text) / flipDeltas(a, b) / staggerDelays(n, step, cap)   pure helpers (unit-tested).
 * The scroll reveal uses an IntersectionObserver whose root is the page scroller (main on desktop, the document on
 * phones) with a positive bottom margin (12 %), so a card starts rising just before it comes into view; once per
 * element. Nothing is hidden by CSS: the start state exists only inside a running Web Animation (fill backwards),
 * so a script failure, print or reduced motion always shows the final state. Live store updates never stage.
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

/** False under reduced motion (OS or settings), while printing, while the document is hidden, or without WAAPI. */
export function enabled() {
  if (typeof document === 'undefined' || typeof window === 'undefined') return false;
  if (document.hidden) return false;
  if (typeof Element === 'undefined' || typeof Element.prototype.animate !== 'function') return false;
  const forced = document.documentElement.getAttribute('data-motion');
  if (forced === 'reduce' || forced === 'reduced') return false;
  try { if (window.matchMedia('print').matches) return false; } catch { /* old engines */ }
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
export function enter(target, opts = {}) {
  const force = Boolean(opts && opts.force);
  const els = toElements(target).filter((el) => force || !entered.has(el));
  els.forEach((el) => entered.add(el));
  if (!els.length || !enabled()) return done();
  // During a route mount the decision waits for the stage flush (next frame, before the first paint):
  // elements on screen enter now, elements below the fold are handed to the scroll reveal instead of
  // animating unseen.
  if (stageState.arming) {
    return new Promise((resolve) => { stageState.queue.push({ els, opts: opts || {}, resolve }); scheduleFlush(); });
  }
  return enterNow(els, opts || {});
}

function enterNow(els, { y = 8, x = 0, scale = 1, delay = 0, stagger = timing.stagger, duration = timing.main } = {}) {
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

/* ------------------------------------------------------------------ */
/* Stage: scroll reveal, component intros, count-up, grow, FLIP (v3.6)  */
/* ------------------------------------------------------------------ */

/** Stage timing (seconds): reveal rise, chart / fill growth, count-up, row stagger. Mirrors css/tokens.css. */
export const stageTiming = Object.freeze({
  reveal: 0.52,
  revealRise: 18,          // px
  revealScale: 0.985,
  revealStagger: 0.05,
  revealCap: 5,            // the 6th card of one batch shares the 5th one's delay
  grow: 0.7,
  growStagger: 0.03,
  growCap: 10,
  count: 0.85,
  rows: 0.34,
  rowStagger: 0.028,
  rowCap: 12,              // rows after the 12th are not animated at all
  marginPct: 12,           // positive bottom root margin of the reveal observer (% of the scroller height)
  holdMs: 1500,            // a held intro is released after this, whatever the observer says
});

/* Candidates for the scroll reveal: top-level surfaces in a view (a card inside a card moves with its parent). */
const REVEAL_HOSTS = '.card, .tile, .metric-tile, .domain-card, .int-card, .connector-card, .summary-strip, .report-section, .kanban-col';
/* KPI figures that count up where they first appear. */
const COUNT_TARGETS = '.metric-value .t-metric, .tile-value, .air-sum-value, .summary-value .num';
/* Bar fills (HTML) that grow from the inline-start, and segmented HTML bars that sweep as one. */
const GROW_TARGETS = '.progress-bar, .meter-fill, .feature-bar-fill, .air-dq-track > span, .risk-meter > span, .mc-fill';
const SWEEP_TARGETS = '.air-domain-bar, .alr-bar';
/* Tables whose first rows stagger in. */
const ROW_TABLES = 'table.table';

const stageState = {
  arming: false,            // a mount is under way: components built now may play an intro
  fresh: false,
  root: null,               // set by stage(): the mounted view's container
  queue: [],                // enter() requests made during the mount
  flushRaf: 0,
  flushTimer: 0,
  onMain: false,            // the view scrolls inside <main> (desktop) rather than the document (phones)
  io: { main: null, doc: null },
  pending: new Map(),       // element → record (reveal | grow | sweep | count | rows | intro)
  anims: new Set(),         // running stage animations (finished at print)
  counts: new Set(),        // running count-ups
  printBound: false,
};

const forcedQuery = () => { try { return window.matchMedia('(forced-colors: active)').matches; } catch { return false; } };
const printQuery = () => { try { return window.matchMedia('print').matches; } catch { return false; } };

/** Stage motion runs only where motion runs at all, never in forced colours or print. */
function stageOn() {
  return enabled() && typeof IntersectionObserver === 'function' && !forcedQuery() && !printQuery();
}

/* ---- pure helpers ---- */

/** Delays (s) for n items `step` apart; items past `cap` share the cap's delay. */
export function staggerDelays(n, step, cap = Infinity, start = 0) {
  const out = [];
  for (let i = 0; i < n; i += 1) out.push(Math.round((start + Math.min(i, cap) * step) * 1000) / 1000);
  return out;
}

/** FLIP deltas: { key → { dx, dy } } for keys present in both maps whose box moved more than `min` px. */
export function flipDeltas(before, after, { min = 1 } = {}) {
  const out = new Map();
  const get = (m, k) => (m instanceof Map ? m.get(k) : m[k]);
  const keys = after instanceof Map ? Array.from(after.keys()) : Object.keys(after || {});
  for (const k of keys) {
    const a = get(before, k);
    const b = get(after, k);
    if (!a || !b) continue;
    const dx = (a.left ?? a.x ?? 0) - (b.left ?? b.x ?? 0);
    const dy = (a.top ?? a.y ?? 0) - (b.top ?? b.y ?? 0);
    if (Math.abs(dx) > min || Math.abs(dy) > min) out.set(k, { dx: Math.round(dx * 100) / 100, dy: Math.round(dy * 100) / 100 });
  }
  return out;
}

const ARAB_DIGITS = '٠١٢٣٤٥٦٧٨٩';
const PERSIAN_DIGITS = '۰۱۲۳۴۵۶۷۸۹';
const DIGIT = '0-9٠-٩۰-۹';
const FIGURE_RE = new RegExp(`[${DIGIT}](?:[${DIGIT}]|[,٬.٫](?=[${DIGIT}]))*`, 'g');

/**
 * A displayed figure, split so it can be rendered at any intermediate value in the same notation:
 * digits (Latin, Arabic-Indic or Persian), grouping and decimal separators, prefix and suffix (units, %, signs,
 * bidi marks) kept verbatim. Returns null when the text holds no figure, more than one figure, or a figure that
 * is not a plain positive number (dates, ranges, codes).
 *   parseFigure('٤٥٪') → { value: 45, decimals: 0, render(12) === '١٢٪' }
 */
export function parseFigure(text) {
  const s = String(text ?? '');
  const matches = s.match(FIGURE_RE);
  if (!matches || matches.length !== 1) return null;
  const token = matches[0];
  const at = s.indexOf(token);
  const prefix = s.slice(0, at);
  const suffix = s.slice(at + token.length);
  // A figure glued to a code (R-12, SEC-01, v3), or followed by a date / time / range separator, is not a KPI.
  const lastCh = prefix.replace(/[\u200e\u200f\u061c\u2066-\u2069]+$/, '').slice(-1);
  if (/[A-Za-z\u0621-\u064A#_\-\u2212./:]/.test(lastCh)) return null;
  const firstCh = suffix.replace(/^[\u200e\u200f\u061c\u2066-\u2069]+/, '').charAt(0);
  if (/[/:\-\u2013]/.test(firstCh)) return null;
  const arab = /[٠-٩]/.test(token);
  const persian = /[۰-۹]/.test(token);
  const latin = token.replace(/[٠-٩]/g, (d) => String(ARAB_DIGITS.indexOf(d))).replace(/[۰-۹]/g, (d) => String(PERSIAN_DIGITS.indexOf(d)));
  const decSep = /[.٫]/.exec(latin);
  const groupSep = /[,٬]/.exec(latin);
  if (decSep && groupSep && latin.indexOf(groupSep[0]) > latin.indexOf(decSep[0])) return null;
  const parts = latin.split(/[.٫]/);
  if (parts.length > 2) return null;
  const intPart = parts[0].replace(/[,٬]/g, '');
  const fracPart = parts[1] || '';
  if (!/^\d+$/.test(intPart) || (fracPart && !/^\d+$/.test(fracPart))) return null;
  const value = Number(`${intPart}${fracPart ? `.${fracPart}` : ''}`);
  if (!Number.isFinite(value)) return null;
  const decimals = fracPart.length;
  const grouping = groupSep ? groupSep[0] : null;
  const decimalMark = decSep ? decSep[0] : (arab ? '٫' : '.');
  const digits = arab ? ARAB_DIGITS : (persian ? PERSIAN_DIGITS : null);
  function render(v) {
    const n = Math.max(0, Number(v) || 0);
    const fixed = n.toFixed(decimals);
    let [i, f] = fixed.split('.');
    if (grouping) i = i.replace(/\B(?=(\d{3})+(?!\d))/g, grouping);
    let out = f ? `${i}${decimalMark}${f}` : i;
    if (digits) out = out.replace(/\d/g, (d) => digits[Number(d)]);
    return `${prefix}${out}${suffix}`;
  }
  return { value, decimals, prefix, suffix, digits: arab ? 'arab' : (persian ? 'persian' : 'latn'), render };
}

/* ---- observers ---- */

function stageIO() {
  const key = stageState.onMain ? 'main' : 'doc';
  if (stageState.io[key]) return stageState.io[key];
  if (typeof IntersectionObserver !== 'function') return null;
  const root = stageState.onMain ? document.getElementById('main') : null;
  if (stageState.onMain && !root) return null;
  const io = new IntersectionObserver(onStageIntersect, { root, rootMargin: `0px 0px ${stageTiming.marginPct}% 0px`, threshold: 0 });
  stageState.io[key] = io;
  return io;
}

function watch(el, rec) {
  const io = stageIO();
  if (!io || !el || stageState.pending.has(el)) return false;
  rec.el = el;
  rec.io = io;
  stageState.pending.set(el, rec);
  io.observe(el);
  bindPrint();
  return true;
}

function unwatch(rec) {
  if (!rec) return;
  stageState.pending.delete(rec.el);
  try { rec.io.unobserve(rec.el); } catch { /* gone */ }
  if (rec.safety) { clearTimeout(rec.safety); rec.safety = 0; }
}

/** Track a stage animation so print can finish it; forget it when it ends (charts register their draw-ins too). */
export function track(anim) {
  if (!anim) return anim;
  stageState.anims.add(anim);
  const drop = () => stageState.anims.delete(anim);
  try { anim.finished.then(drop, drop); } catch { drop(); }
  return anim;
}

function play(el, keyframes, { duration, delay = 0, easing = timing.ease, fill = 'backwards' } = {}) {
  try {
    return track(el.animate(keyframes, { duration: Math.round(duration * 1000), delay: Math.round(delay * 1000), easing: Array.isArray(easing) ? `cubic-bezier(${easing.join(',')})` : easing, fill }));
  } catch { return null; }
}

/**
 * Print shows everything at rest: release held intros, complete count-ups, and finish every finite animation on the
 * page (stage reveals and draw-ins, view entrances, route transition, FLIP moves); idle loops are hidden by CSS.
 */
function settleForPrint() {
  for (const a of Array.from(stageState.anims)) { try { a.finish(); } catch { try { a.cancel(); } catch { /* noop */ } } }
  stageState.anims.clear();
  try {
    for (const a of document.getAnimations()) {
      const timing = a.effect && typeof a.effect.getTiming === 'function' ? a.effect.getTiming() : null;
      if (timing && timing.iterations !== Infinity && a.playState !== 'finished') { try { a.finish(); } catch { /* noop */ } }
    }
  } catch { /* old engines */ }
  for (const c of Array.from(stageState.counts)) c.finish();
  for (const rec of Array.from(stageState.pending.values())) {
    if (rec.kind === 'intro' && rec.state === 'held') releaseIntro(rec);
  }
}
function bindPrint() {
  if (stageState.printBound || typeof window === 'undefined') return;
  stageState.printBound = true;
  try { window.addEventListener('beforeprint', settleForPrint); } catch { /* noop */ }
  try { window.matchMedia('print').addEventListener('change', (e) => { if (e.matches) settleForPrint(); }); } catch { /* noop */ }
}

/** Bottom edge of the visible scroll area (viewport or <main>), in client coordinates. */
function foldLine() {
  if (stageState.onMain) {
    const m = document.getElementById('main');
    if (m) { const r = m.getBoundingClientRect(); return r.top + m.clientHeight; }
  }
  return window.innerHeight || document.documentElement.clientHeight || 0;
}

/* ---- the animations ---- */

function revealNow(els) {
  const t = stageTiming;
  const delays = staggerDelays(els.length, t.revealStagger, t.revealCap);
  els.forEach((el, i) => {
    play(el, [
      { opacity: 0, transform: `translateY(${t.revealRise}px) scale(${t.revealScale})` },
      { opacity: 1, transform: 'none' },
    ], { duration: t.reveal, delay: delays[i] });
  });
}

/** Grow bar fills from the inline-start edge (scaleX), staggered. */
function growNow(els, delay = 0) {
  const t = stageTiming;
  const origin = isRtl() ? 'right center' : 'left center';
  const delays = staggerDelays(els.length, t.growStagger, t.growCap, delay);
  els.forEach((el, i) => {
    const prev = el.style.transformOrigin;
    el.style.transformOrigin = origin;
    const a = play(el, [{ transform: 'scaleX(0)' }, { transform: 'scaleX(1)' }], { duration: t.grow, delay: delays[i] });
    const reset = () => { if (prev) el.style.transformOrigin = prev; else el.style.removeProperty('transform-origin'); };
    if (a) a.finished.then(reset, reset); else reset();
  });
}

/** Table rows: the first rowCap rows rise and fade in, 28 ms apart. */
function rowsNow(table, delay = 0) {
  const body = table.tBodies && table.tBodies[0];
  if (!body) return;
  const rows = Array.from(body.rows).slice(0, stageTiming.rowCap);
  const delays = staggerDelays(rows.length, stageTiming.rowStagger, Infinity, delay);
  rows.forEach((tr, i) => play(tr, [{ opacity: 0, transform: 'translateY(8px)' }, { opacity: 1, transform: 'none' }], { duration: stageTiming.rows, delay: delays[i] }));
}

/** The first text node of el (or el itself) that holds a figure. */
function figureNode(target) {
  if (!target) return null;
  if (target.nodeType === 3) return target;
  for (const n of target.childNodes) if (n.nodeType === 3 && /[0-9٠-٩۰-۹]/.test(n.data)) return n;
  return null;
}

/**
 * Count a figure up from 0 to the value it shows now, in its own notation. The host's inline size is held at the
 * final width while it counts (no layout shift); any other write to the text (a live update, motion.number) ends
 * the count at once and wins. One rAF loop drives every running count.
 */
const countLoop = { raf: 0, items: new Set() };
function countFrame(now) {
  countLoop.raf = 0;
  for (const c of Array.from(countLoop.items)) c.step(now);
  if (countLoop.items.size) countLoop.raf = requestAnimationFrame(countFrame);
}
export function countIn(target, { delay = 0, duration = stageTiming.count, width = null } = {}) {
  const node = figureNode(target);
  if (!node || !node.parentElement || !stageOn() || typeof requestAnimationFrame !== 'function') return done();
  const host = node.parentElement;
  if (host.closest('[aria-live], [role="status"], [role="alert"]')) return done();
  const finalText = node.data;
  const fig = parseFigure(finalText);
  if (!fig || !(fig.value > 0)) return done();
  const w = width !== null ? width : host.getBoundingClientRect().width;
  const prevMin = host.style.getPropertyValue('min-inline-size');
  const prevNum = host.style.getPropertyValue('font-variant-numeric');
  host.style.setProperty('min-inline-size', `${Math.ceil(w)}px`);
  host.style.setProperty('font-variant-numeric', 'tabular-nums');
  let written = fig.render(0);
  node.data = written;
  return new Promise((resolve) => {
    let t0 = 0;
    const ms = Math.max(1, duration * 1000);
    const wait = Math.max(0, delay * 1000);
    const item = {
      step(now) {
        if (!node.isConnected || node.data !== written) { item.end(false); return; }
        if (!t0) t0 = now + wait;
        if (now < t0) return;
        const p = Math.min(1, (now - t0) / ms);
        const v = fig.value * (1 - Math.pow(1 - p, 3));
        written = p >= 1 ? finalText : fig.render(fig.decimals ? v : Math.round(v));
        node.data = written;
        if (p >= 1) item.end(true);
      },
      finish() { if (node.isConnected && node.data === written) node.data = finalText; item.end(true); },
      end() {
        countLoop.items.delete(item);
        stageState.counts.delete(item);
        if (prevMin) host.style.setProperty('min-inline-size', prevMin); else host.style.removeProperty('min-inline-size');
        if (prevNum) host.style.setProperty('font-variant-numeric', prevNum); else host.style.removeProperty('font-variant-numeric');
        resolve();
      },
    };
    countLoop.items.add(item);
    stageState.counts.add(item);
    bindPrint();
    if (!countLoop.raf) countLoop.raf = requestAnimationFrame(countFrame);
  });
}

/* ---- component intros (charts) ---- */

function releaseIntro(rec) {
  if (rec.safety) { clearTimeout(rec.safety); rec.safety = 0; }
  rec.state = 'idle';
  try { rec.h.release && rec.h.release(); } catch { /* never break a chart */ }
}
function playIntro(rec) {
  if (rec.safety) { clearTimeout(rec.safety); rec.safety = 0; }
  rec.state = 'playing';
  rec.t0 = typeof performance !== 'undefined' ? performance.now() : Date.now();
  let ms = 0;
  try { ms = Number(rec.h.play && rec.h.play()) || 0; } catch { ms = 0; }
  setTimeout(() => { if (rec.state === 'playing') rec.state = 'done'; }, Math.max(0, ms) + 50);
}

/**
 * Register a component draw-in. Only components built while a route mounts get one (stage arming), so a chart
 * rebuilt by a live update never replays its entrance. Returns null when there is no intro.
 */
export function intro(el, handlers = {}) {
  if (!stageState.arming || !el || !stageOn()) return null;
  const rec = { kind: 'intro', h: handlers, state: 'held', t0: 0, safety: 0, get elapsed() { return this.state === 'playing' ? ((typeof performance !== 'undefined' ? performance.now() : Date.now()) - this.t0) : 0; } };
  if (!watch(el, rec)) return null;
  try { handlers.hold && handlers.hold(); } catch { /* noop */ }
  rec.safety = setTimeout(() => { if (rec.state === 'held') releaseIntro(rec); }, stageTiming.holdMs);
  return rec;
}

/* ---- the observer ---- */

function onStageIntersect(entries) {
  const on = stageOn();
  const reveals = [];
  for (const e of entries) {
    const rec = stageState.pending.get(e.target);
    if (!rec || !e.target.isConnected) continue;
    if (!e.isIntersecting) {
      if (rec.kind === 'intro' && rec.state === 'held') releaseIntro(rec);
      continue;
    }
    // Intersecting (with the margin). Is it already in view? Then a start state would flash: skip.
    const rb = e.rootBounds;
    const visibleBottom = rb ? rb.top + rb.height / (1 + stageTiming.marginPct / 100) : foldLine();
    const inView = e.boundingClientRect.top < visibleBottom - 24;
    if (rec.kind === 'intro') {
      if (rec.state === 'held' || (rec.state === 'idle' && !inView)) { unwatch(rec); if (on) playIntro(rec); else releaseIntro(rec); }
      else if (rec.state === 'idle') { unwatch(rec); rec.state = 'done'; }
      continue;
    }
    unwatch(rec);
    if (!on || inView) continue;
    if (rec.kind === 'reveal') reveals.push(e.target);
    else if (rec.kind === 'grow') growNow([e.target], 0.08);
    else if (rec.kind === 'sweep') growNow([e.target], 0.08);
    else if (rec.kind === 'rows') rowsNow(e.target, 0.1);
    else if (rec.kind === 'count') countIn(e.target, { delay: 0.12 });
  }
  if (!reveals.length) return;
  // One batch: group by parent so siblings stagger together, in document order.
  const groups = new Map();
  for (const el of reveals) {
    const k = el.parentElement;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(el);
  }
  for (const list of groups.values()) {
    list.sort((a, b) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1));
    revealNow(list);
  }
}

/* ---- mount lifecycle ---- */

function scheduleFlush() {
  if (stageState.flushRaf || typeof requestAnimationFrame !== 'function') return;
  stageState.flushRaf = requestAnimationFrame(flush);
  // A hidden tab never runs the frame: give up after a while (nothing animates, every promise resolves).
  clearTimeout(stageState.flushTimer);
  stageState.flushTimer = setTimeout(() => { if (stageState.flushRaf) { cancelAnimationFrame(stageState.flushRaf); stageState.flushRaf = 0; flush(); } }, 400);
}

/** Top-level matches of `selector` under root (not inside another match), outside dialogs and the route ghost. */
function topLevel(root, selector) {
  const out = [];
  for (const el of root.querySelectorAll(selector)) {
    const parent = el.parentElement && el.parentElement.closest(selector);
    if (parent && root.contains(parent)) continue;
    if (el.closest('dialog, .route-ghost, [hidden]')) continue;
    out.push(el);
  }
  return out;
}

function flush() {
  stageState.flushRaf = 0;
  clearTimeout(stageState.flushTimer);
  const queue = stageState.queue.splice(0);
  const root = stageState.root;
  const fresh = stageState.fresh;
  if (root) { stageState.root = null; stageState.arming = false; }
  const on = stageOn();
  if (!on) { queue.forEach((q) => q.resolve()); return; }

  /* read (one layout) */
  const fold = foldLine();
  const below = (r) => r.top >= fold - 1;
  const onScreen = (r) => r.bottom > 0 && r.top < fold && r.width > 0;
  const enterPlan = queue.map((q) => ({ q, rects: q.els.map((el) => el.getBoundingClientRect()) }));
  let hosts = [];
  let grows = [];
  let sweeps = [];
  let tables = [];
  let counts = [];
  if (root && fresh) {
    const read = (els) => els.map((el) => ({ el, r: el.getBoundingClientRect() }));
    hosts = read(topLevel(root, REVEAL_HOSTS));
    grows = read(Array.from(root.querySelectorAll(GROW_TARGETS)).filter((el) => !el.closest('dialog')));
    sweeps = read(Array.from(root.querySelectorAll(SWEEP_TARGETS)).filter((el) => !el.closest('dialog')));
    tables = read(Array.from(root.querySelectorAll(ROW_TABLES)).filter((el) => !el.closest('dialog, .chart-table') && el.tBodies && el.tBodies[0] && el.tBodies[0].rows.length));
    counts = read(Array.from(root.querySelectorAll(COUNT_TARGETS)).filter((el) => figureNode(el) && !el.closest('dialog, [aria-live]')));
  }

  /* write */
  for (const { q, rects } of enterPlan) {
    const now = [];
    q.els.forEach((el, i) => {
      if (rects[i] && rects[i].width > 0 && below(rects[i])) watch(el, { kind: 'reveal' });
      else now.push(el);
    });
    enterNow(now, q.opts).then(q.resolve, q.resolve);
  }
  for (const { el, r } of hosts) if (r.width > 0 && below(r)) watch(el, { kind: 'reveal' });
  const growNowList = [];
  for (const { el, r } of grows) {
    if (onScreen(r)) growNowList.push(el);
    else if (below(r)) watch(el, { kind: 'grow' });
  }
  if (growNowList.length) growNow(growNowList, 0.16);
  const sweepNowList = [];
  for (const { el, r } of sweeps) {
    if (onScreen(r)) sweepNowList.push(el);
    else if (below(r)) watch(el, { kind: 'sweep' });
  }
  if (sweepNowList.length) growNow(sweepNowList, 0.16);
  for (const { el, r } of tables) {
    if (onScreen(r)) rowsNow(el, 0.12);
    else if (below(r)) watch(el, { kind: 'rows' });
  }
  for (const { el, r } of counts) {
    if (onScreen(r)) countIn(el, { delay: 0.1, width: r.width });
    else if (below(r)) watch(el, { kind: 'count' });
  }
}

/** A mount starts (ui:route-leave). Drops everything still pending for the outgoing view. */
export function stageBegin({ fresh = true } = {}) {
  bindPrint();
  for (const rec of Array.from(stageState.pending.values())) {
    unwatch(rec);
    if (rec.kind === 'intro' && rec.state === 'held') releaseIntro(rec);
  }
  stageState.pending.clear();
  for (const c of Array.from(stageState.counts)) c.finish();
  stageState.queue.splice(0).forEach((q) => q.resolve());   // the outgoing view's requests: nothing to show
  stageState.root = null;
  stageState.fresh = Boolean(fresh);
  stageState.arming = Boolean(fresh) && stageOn();
  if (stageState.arming) {
    const m = typeof document !== 'undefined' ? document.getElementById('main') : null;
    let onMain = false;
    try { onMain = Boolean(m) && /(auto|scroll)/.test(getComputedStyle(m).overflowY); } catch { onMain = false; }
    stageState.onMain = onMain;
  }
}

/** The view has rendered (route:change): stage it in the next frame, before its first paint. */
export function stage(root, { fresh = true } = {}) {
  const host = toElements(root)[0];
  if (!host || !fresh || !stageState.arming) { stageState.arming = false; if (stageState.queue.length) scheduleFlush(); return; }
  stageState.root = host;
  stageState.fresh = true;
  scheduleFlush();
}

/* ---- FLIP ---- */

/**
 * FLIP for keyed items: measure, run `mutate()` (which may rebuild the items), then play every item whose box
 * moved from its old position (transform only, 300 ms). `items()` returns the current elements; `key(el)` their
 * identity. Boxes are measured in the content coordinates of `within` (its box plus its scroll offsets), so a
 * page or board scroll caused by the mutation (focus moving) is not mistaken for a move. `lift` scales the item
 * that moved farthest a little while it travels; `fadeNew` fades in items that were not there before.
 * Returns the mutate result.
 */
export function flip(items, mutate, { key = (el) => el.getAttribute('data-key') || el.getAttribute('data-id'), duration = 0.3, lift = false, max = 60, fadeNew = false, within = null } = {}) {
  const list = () => { try { return Array.from(typeof items === 'function' ? items() : items || []).slice(0, max); } catch { return []; } };
  if (!enabled() || forcedQuery()) return mutate();
  const frame = () => {
    if (!within || !within.isConnected) return { x: 0, y: 0 };
    const r = within.getBoundingClientRect();
    return { x: r.left - within.scrollLeft, y: r.top - within.scrollTop };
  };
  const box = (el, f) => { const r = el.getBoundingClientRect(); return { left: r.left - f.x, top: r.top - f.y }; };
  const before = new Map();
  const f0 = frame();
  for (const el of list()) { const k = key(el); if (k) before.set(k, box(el, f0)); }
  const result = mutate();
  if (!before.size) return result;
  const now = list();
  const after = new Map();
  const byKey = new Map();
  const fresh = [];
  const f1 = frame();
  for (const el of now) {
    const k = key(el);
    if (k && before.has(k)) { after.set(k, box(el, f1)); byKey.set(k, el); }
    else if (fadeNew) fresh.push(el);
  }
  fresh.slice(0, stageTiming.rowCap).forEach((el, i) => play(el, [{ opacity: 0 }, { opacity: 1 }], { duration: 0.22, delay: 0.06 + i * 0.015 }));
  const deltas = flipDeltas(before, after);
  let far = null;
  let farD = 0;
  for (const [k, d] of deltas) { const dist = Math.hypot(d.dx, d.dy); if (dist > farD) { farD = dist; far = k; } }
  for (const [k, d] of deltas) {
    const el = byKey.get(k);
    const big = lift && k === far && farD > 40;
    const from = `translate(${d.dx}px, ${d.dy}px)${big ? ' scale(1.03)' : ''}`;
    const frames = big
      ? [{ transform: from }, { transform: 'translate(0, 0) scale(1.03)', offset: 0.8 }, { transform: 'none' }]
      : [{ transform: from }, { transform: 'none' }];
    play(el, frames, { duration: big ? duration * 1.4 : duration, easing: timing.easeGlide });
  }
  return result;
}

export const motion = { enabled, enter, exit, number, flash, drawer, page, leave, glide, reveal, timing, animate, stage, stageBegin, intro, countIn, flip, stageTiming, parseFigure, flipDeltas, staggerDelays };
export default motion;
