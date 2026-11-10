/**
 * Edge laser (css/components.css "Edges"): a short glowing comet travels round the nickel-orange edge of
 * every top-level card and tile, along the border's own rounded path, at a constant speed.
 *
 * The comet is the host's ::after. Its motion is a Web Animations transform animation built from the
 * host's measured size (sampled rounded-rectangle path, constant speed), so the browser runs it on the
 * compositor: nothing is restyled or repainted per frame. Measured on the cockpit at 1440 px: the
 * offset-path version cost ~150 ms of main thread per second; this one stays at the idle baseline.
 *
 * - Clockwise in English, counter-clockwise in Arabic (reading direction); neighbours out of phase.
 * - Only hosts on screen animate (IntersectionObserver); others are paused.
 * - Rebuilt when a host changes size (ResizeObserver).
 * - Off under reduced motion (OS preference unless the setting forces motion on, or the setting itself),
 *   the Static background and forced colours. The CSS hides the comet unless the host is lit (data-edge="lit"),
 *   so without this module (or with it off) there is simply no comet.
 * The lit state is the data-edge="lit" attribute (not a class), so views that rewrite className keep it.
 * Decoration only: no ARIA, no focusable element, no layout change.
 */

const HOSTS = '.card:not(.is-plain), .tile, .metric-tile, .domain-card, .int-card, .connector-card';
const SPEED = 150;            // px per second along the edge
const MIN_MS = 5000;          // shortest lap
const MAX_MS = 16000;         // longest lap
const ARC_STEPS = 6;          // samples per rounded corner

const state = new WeakMap();  // host -> { anim, w, h, visible }
let io = null;
let ro = null;
let mo = null;
let enabled = false;
let seq = 0;

const root = () => document.documentElement;
const reducedMQ = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null;
const forcedMQ = typeof matchMedia === 'function' ? matchMedia('(forced-colors: active)') : null;

function allowed() {
  const r = root();
  const motion = r.getAttribute('data-motion') || '';
  if (motion === 'reduce' || motion === 'reduced') return false;
  if (motion !== 'full' && reducedMQ && reducedMQ.matches) return false;
  if (r.getAttribute('data-bg') === 'static') return false;
  if (forcedMQ && forcedMQ.matches) return false;
  return typeof Element !== 'undefined' && typeof Element.prototype.animate === 'function';
}

/** A host nested inside another host gets no comet (a card inside a card stays quiet). */
function isTopLevel(el) {
  const parent = el.parentElement;
  return !(parent && parent.closest(HOSTS));
}

/**
 * Keyframes for a comet whose head (transform-origin 100% 50%) follows the centre line of the border.
 * Coordinates are relative to the host's padding box, where the ::after is laid out
 * (inset-block-start 0, inset-inline-start 0, centred vertically on y = 0 by its negative margin).
 * The path is built in travel order (clockwise in LTR, counter-clockwise in RTL). The comet is straight,
 * so through a rounded corner, and for one comet length after it, its tail is shortened (scaleX about the
 * head) so it never sticks out of the curve: the light seems to wrap round the corner.
 */
function buildKeyframes(host) {
  const cs = getComputedStyle(host);
  const bw = parseFloat(cs.borderTopWidth) || 0;
  const wp = host.clientWidth;    // padding box
  const hp = host.clientHeight;
  if (wp < 40 || hp < 24) return null;
  const R = Math.max(0, parseFloat(cs.borderTopLeftRadius) || 0);
  const after = getComputedStyle(host, '::after');
  const len = parseFloat(after.width) || 34;
  const rtl = cs.direction === 'rtl';
  const x0 = -bw / 2;
  const y0 = -bw / 2;
  const x1 = wp + bw / 2;
  const y1 = hp + bw / 2;
  const r = Math.min(Math.max(0, R - bw / 2), (x1 - x0) / 2, (y1 - y0) / 2);
  const S_MIN = 0.25;             // tail kept through a corner (fraction of the comet)
  const ramp = len;               // distance after a corner over which the tail grows back
  // Items in travel order. Lines: from (ax, ay) to (bx, by), heading phi. Arcs: centre, angles a0 -> a1.
  const items = rtl ? [
    { line: [x1 - r, y0, x0 + r, y0], phi: 180 },
    { arc: [x0 + r, y0 + r, 270, 180] },
    { line: [x0, y0 + r, x0, y1 - r], phi: 90 },
    { arc: [x0 + r, y1 - r, 180, 90] },
    { line: [x0 + r, y1, x1 - r, y1], phi: 0 },
    { arc: [x1 - r, y1 - r, 90, 0] },
    { line: [x1, y1 - r, x1, y0 + r], phi: -90 },
    { arc: [x1 - r, y0 + r, 0, -90] },
  ] : [
    { line: [x0 + r, y0, x1 - r, y0], phi: 0 },
    { arc: [x1 - r, y0 + r, -90, 0] },
    { line: [x1, y0 + r, x1, y1 - r], phi: 90 },
    { arc: [x1 - r, y1 - r, 0, 90] },
    { line: [x1 - r, y1, x0 + r, y1], phi: 180 },
    { arc: [x0 + r, y1 - r, 90, 180] },
    { line: [x0, y1 - r, x0, y0 + r], phi: 270 },
    { arc: [x0 + r, y0 + r, 180, 270] },
  ];
  const turn = rtl ? -90 : 90;    // heading = arc angle + turn
  const pts = [];                 // [x, y, phi, scale]
  for (const it of items) {
    if (it.line) {
      const [ax, ay, bx, by] = it.line;
      const L = Math.hypot(bx - ax, by - ay);
      pts.push([ax, ay, it.phi, S_MIN]);
      if (L > ramp) {
        const f = ramp / L;
        pts.push([ax + (bx - ax) * f, ay + (by - ay) * f, it.phi, 1]);
        pts.push([bx, by, it.phi, 1]);
      } else if (L > 0.01) {
        pts.push([bx, by, it.phi, S_MIN + (1 - S_MIN) * (L / ramp)]);
      }
    } else if (r > 0.01) {
      const [cx, cy, a0, a1] = it.arc;
      for (let i = 1; i <= ARC_STEPS; i++) {
        const ang = a0 + ((a1 - a0) * i) / ARC_STEPS;
        const rad = (ang * Math.PI) / 180;
        pts.push([cx + r * Math.cos(rad), cy + r * Math.sin(rad), ang + turn, S_MIN]);
      }
    }
  }
  const dist = [0];
  for (let i = 1; i < pts.length; i++) dist.push(dist[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  const total = dist[dist.length - 1] + Math.hypot(pts[0][0] - pts[pts.length - 1][0], pts[0][1] - pts[pts.length - 1][1]);
  if (!(total > 0)) return null;
  // The head starts at its laid-out position: x = len (LTR) or x = wp (RTL), y = 0.
  const hx = rtl ? wp : len;
  const frames = pts.map((p, i) => ({ x: p[0], y: p[1], phi: p[2], s: p[3], at: dist[i] / total }));
  frames.push({ x: pts[0][0], y: pts[0][1], phi: pts[0][2] + (rtl ? -360 : 360), s: pts[0][3], at: 1 });
  const keyframes = frames.map((f) => ({
    offset: Math.min(1, Math.max(0, f.at)),
    transform: `translate(${(f.x - hx).toFixed(2)}px, ${f.y.toFixed(2)}px) rotate(${f.phi.toFixed(2)}deg) scaleX(${f.s.toFixed(3)})`,
  }));
  keyframes[0].offset = 0;
  keyframes[keyframes.length - 1].offset = 1;
  return { keyframes, duration: Math.round(Math.min(MAX_MS, Math.max(MIN_MS, (total / SPEED) * 1000))), w: wp, h: hp, rtl };
}

function start(host) {
  if (!enabled || !isTopLevel(host)) return;
  let s = state.get(host);
  const built = buildKeyframes(host);
  if (!built) { if (s && s.anim) { s.anim.cancel(); s.anim = null; } host.removeAttribute('data-edge'); return; }
  if (!s) { s = { anim: null, w: 0, h: 0, rtl: false, phase: ((seq++ * 0.618034) % 1) }; state.set(host, s); }
  if (s.anim && s.w === built.w && s.h === built.h && s.rtl === built.rtl) { if (s.anim.playState !== 'running') s.anim.play(); host.setAttribute('data-edge', 'lit'); return; }
  const progress = s.anim && s.anim.effect && s.anim.effect.getComputedTiming ? (s.anim.effect.getComputedTiming().progress || 0) : s.phase;
  if (s.anim) s.anim.cancel();
  try {
    s.anim = host.animate(built.keyframes, { duration: built.duration, iterations: Infinity, easing: 'linear', pseudoElement: '::after' });
    s.anim.currentTime = progress * built.duration;
  } catch { s.anim = null; host.removeAttribute('data-edge'); return; }
  s.w = built.w; s.h = built.h; s.rtl = built.rtl;
  host.setAttribute('data-edge', 'lit');
}

function stop(host) {
  const s = state.get(host);
  if (s && s.anim && s.anim.playState === 'running') s.anim.pause();
}

function onIntersect(entries) {
  for (const e of entries) {
    const s = state.get(e.target) || null;
    if (e.isIntersecting) start(e.target);
    else if (s) stop(e.target);
  }
}

function onResize(entries) {
  for (const e of entries) {
    const host = e.target;
    const s = state.get(host);
    if (!s || !s.anim) continue;
    if (host.clientWidth !== s.w || host.clientHeight !== s.h) start(host);
  }
}

function watch(host) {
  if (state.has(host) && state.get(host).watched) return;
  const s = state.get(host) || { anim: null, w: 0, h: 0, rtl: false, phase: ((seq++ * 0.618034) % 1) };
  s.watched = true;
  state.set(host, s);
  io.observe(host);
  ro.observe(host);
}

function scan(node) {
  if (!node || node.nodeType !== 1) return;
  if (node.matches(HOSTS)) watch(node);
  if (node.firstElementChild) for (const el of node.querySelectorAll(HOSTS)) watch(el);
}

function forget(node) {
  if (!node || node.nodeType !== 1) return;
  const drop = (el) => { const s = state.get(el); if (!s) return; if (s.anim) s.anim.cancel(); io.unobserve(el); ro.unobserve(el); state.delete(el); };
  if (node.matches(HOSTS)) drop(node);
  if (node.firstElementChild) for (const el of node.querySelectorAll(HOSTS)) drop(el);
}

function setEnabled(on) {
  if (on === enabled) return;
  enabled = on;
  for (const el of document.querySelectorAll(HOSTS)) {
    const s = state.get(el);
    if (!on) { if (s && s.anim) { s.anim.cancel(); s.anim = null; s.w = 0; } el.removeAttribute('data-edge'); }
  }
  if (on) {
    // Re-observe so IntersectionObserver reports the current visibility again.
    for (const el of document.querySelectorAll(HOSTS)) { if (state.has(el)) { io.unobserve(el); io.observe(el); } }
  }
}

/** Start the edge laser. Safe to call more than once. */
export function initEdges() {
  if (io || typeof IntersectionObserver !== 'function' || typeof ResizeObserver !== 'function' || typeof MutationObserver !== 'function') return;
  io = new IntersectionObserver(onIntersect, { rootMargin: '48px' });
  ro = new ResizeObserver(onResize);
  enabled = allowed();
  scan(document.body);
  mo = new MutationObserver((records) => {
    for (const r of records) {
      if (r.type === 'attributes') {
        setEnabled(allowed());
        // Direction changed (language switch): rebuild running comets so they turn the other way.
        if (r.attributeName === 'dir' && enabled) for (const el of document.querySelectorAll(HOSTS)) { const st = state.get(el); if (st && st.anim) start(el); }
        continue;
      }
      for (const n of r.removedNodes) if (!n.isConnected) forget(n);
      for (const n of r.addedNodes) scan(n);
    }
  });
  mo.observe(document.body, { childList: true, subtree: true });
  mo.observe(root(), { attributes: true, attributeFilter: ['data-motion', 'data-bg', 'dir'] });
  const recheck = () => setEnabled(allowed());
  if (reducedMQ && reducedMQ.addEventListener) reducedMQ.addEventListener('change', recheck);
  if (forcedMQ && forcedMQ.addEventListener) forcedMQ.addEventListener('change', recheck);
}
