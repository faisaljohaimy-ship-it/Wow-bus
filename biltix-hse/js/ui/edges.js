/**
 * Edge laser (css/components.css "Edges"): evenly spaced glowing comets travel round the whole
 * nickel-orange frame of every top-level card and tile, along the border's own rounded path, at one
 * steady speed, so the entire edge moves in a regular rhythm.
 *
 * Each host gets one decorative child, span.edge-run (aria-hidden, no text, pointer-events none,
 * absolutely positioned over the padding box, so layout never changes), holding K comets (<i>).
 * K follows the perimeter (one comet about every SPACING px, MIN_K..MAX_K). All comets share one
 * Web Animations transform animation path built from the host's measured size (sampled rounded
 * rectangle, constant speed), offset in phase by 1/K, so the browser runs them on the compositor:
 * nothing is restyled or repainted per frame.
 *
 * - Clockwise in English, counter-clockwise in Arabic (reading direction); neighbouring hosts are
 *   out of phase.
 * - Only hosts on screen animate (IntersectionObserver); others are paused.
 * - Rebuilt when a host changes size (ResizeObserver) or when a view re-renders the host's children.
 * - Hosts that clip their overflow at the padding box run the comets just inside the metal edge.
 * - Off under reduced motion (OS preference unless the setting forces motion on, or the setting itself),
 *   the Static background and forced colours. The CSS shows comets only on lit hosts
 *   (data-edge="lit", an attribute so views that rewrite className keep it).
 * Decoration only: no ARIA content, no focusable element, no layout change.
 */

const HOSTS = '.card:not(.is-plain), .tile, .metric-tile, .domain-card, .int-card, .connector-card, .kanban-card, .summary-strip';
const SPEED = 140;            // px per second along the edge
const SPACING = 210;          // px of edge per comet
const MIN_K = 3;
const MAX_K = 12;
const MIN_MS = 5000;          // shortest lap
const MAX_MS = 22000;         // longest lap
const ARC_STEPS = 6;          // samples per rounded corner

const state = new WeakMap();  // host -> { anims, w, h, rtl, k, phase, watched }
let io = null;
let ro = null;
let mo = null;
let enabled = false;
let seq = 0;
const pendingRebuild = new Set();
let rebuildQueued = false;

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

/** A host nested inside another host gets no comets (a card inside a card stays quiet). */
function isTopLevel(el) {
  const parent = el.parentElement;
  return !(parent && parent.closest(HOSTS));
}

function runOf(host) {
  for (const c of host.children) if (c.classList && c.classList.contains('edge-run')) return c;
  return null;
}

/** The decorative comet row: created once, kept as the host's last child, resized to k comets. */
function ensureRun(host, k) {
  let run = runOf(host);
  if (!run) {
    run = document.createElement('span');
    run.className = 'edge-run';
    run.setAttribute('aria-hidden', 'true');
    host.appendChild(run);
  }
  while (run.children.length < k) run.appendChild(document.createElement('i'));
  while (run.children.length > k) run.lastElementChild.remove();
  return run;
}

/**
 * Keyframes for a comet whose head (transform-origin 100% 50%) follows the centre line of the border
 * (or a line just inside it when the host clips at its padding box). Coordinates are relative to the
 * host's padding box, where each comet is laid out (inset-block-start 0, inset-inline-start 0, centred
 * vertically on y = 0 by its negative margin). The path is built in travel order (clockwise in LTR,
 * counter-clockwise in RTL). The comet is straight, so through a rounded corner, and for one comet
 * length after it, its tail is shortened (scaleX about the head) so it never sticks out of the curve.
 */
function buildKeyframes(host) {
  const cs = getComputedStyle(host);
  // The comet row is positioned against the host; an unpositioned host would send it to an ancestor.
  if (cs.position === 'static' || cs.display === 'contents' || cs.display === 'none') return null;
  const bw = parseFloat(cs.borderTopWidth) || 0;
  const wp = host.clientWidth;    // padding box
  const hp = host.clientHeight;
  if (wp < 40 || hp < 24) return null;
  const R = Math.max(0, parseFloat(cs.borderTopLeftRadius) || 0);
  const len = parseFloat(cs.getPropertyValue('--comet-len')) || 30;
  const rtl = cs.direction === 'rtl';
  const clipsInside = cs.overflowX === 'hidden' || cs.overflowY === 'hidden';
  const inset = clipsInside ? 1.25 : -bw / 2;   // path line, from the padding edge (negative = on the border)
  const x0 = inset;
  const y0 = inset;
  const x1 = wp - inset;
  const y1 = hp - inset;
  const r = Math.min(Math.max(0, R - bw - inset), (x1 - x0) / 2, (y1 - y0) / 2);
  const S_MIN = 0.25;             // tail kept through a corner (fraction of the comet)
  const ramp = len;               // distance after a corner over which the tail grows back
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
  const maxK = host.classList.contains('kanban-card') ? 3 : MAX_K;
  const k = Math.max(MIN_K, Math.min(maxK, Math.round(total / SPACING)));
  return { keyframes, k, duration: Math.round(Math.min(MAX_MS, Math.max(MIN_MS, (total / SPEED) * 1000))), w: wp, h: hp, rtl };
}

function cancelAll(s) {
  if (s && s.anims) for (const a of s.anims) a.cancel();
  if (s) s.anims = [];
}

function start(host) {
  if (!enabled || !host.isConnected || !isTopLevel(host)) return;
  let s = state.get(host);
  const built = buildKeyframes(host);
  if (!built) { cancelAll(s); host.removeAttribute('data-edge'); const stale = runOf(host); if (stale) stale.remove(); return; }
  if (!s) { s = { anims: [], w: 0, h: 0, rtl: false, k: 0, phase: ((seq++ * 0.618034) % 1) }; state.set(host, s); }
  const run = runOf(host);
  const same = s.anims.length && run && run.children.length === built.k && s.w === built.w && s.h === built.h && s.rtl === built.rtl && s.anims.every((a) => a.effect && a.effect.target && a.effect.target.parentElement === run);
  if (same) { for (const a of s.anims) if (a.playState !== 'running') a.play(); host.setAttribute('data-edge', 'lit'); return; }
  // Keep the rhythm through a rebuild: continue from the first comet's progress.
  const first = s.anims[0];
  const progress = first && first.effect && first.effect.getComputedTiming ? (first.effect.getComputedTiming().progress || 0) : s.phase;
  cancelAll(s);
  const row = ensureRun(host, built.k);
  try {
    let i = 0;
    for (const comet of row.children) {
      const a = comet.animate(built.keyframes, { duration: built.duration, iterations: Infinity, easing: 'linear' });
      a.currentTime = (((progress + i / built.k) % 1) * built.duration);
      s.anims.push(a);
      i++;
    }
  } catch { cancelAll(s); host.removeAttribute('data-edge'); return; }
  s.w = built.w; s.h = built.h; s.rtl = built.rtl; s.k = built.k;
  host.setAttribute('data-edge', 'lit');
}

function stop(host) {
  const s = state.get(host);
  if (s && s.anims) for (const a of s.anims) if (a.playState === 'running') a.pause();
}

function onIntersect(entries) {
  for (const e of entries) {
    if (e.isIntersecting) start(e.target);
    else stop(e.target);
  }
}

function onResize(entries) {
  for (const e of entries) {
    const host = e.target;
    const s = state.get(host);
    if (!s || !s.anims.length) continue;
    if (host.clientWidth !== s.w || host.clientHeight !== s.h) start(host);
  }
}

function watch(host) {
  if (state.has(host) && state.get(host).watched) return;
  const s = state.get(host) || { anims: [], w: 0, h: 0, rtl: false, k: 0, phase: ((seq++ * 0.618034) % 1) };
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
  const drop = (el) => { const s = state.get(el); if (!s) return; cancelAll(s); io.unobserve(el); ro.unobserve(el); state.delete(el); };
  if (node.matches(HOSTS)) drop(node);
  if (node.firstElementChild) for (const el of node.querySelectorAll(HOSTS)) drop(el);
}

/** A view cleared a lit host's children (its comet row went with them): rebuild after this task. */
function queueRebuild(host) {
  pendingRebuild.add(host);
  if (rebuildQueued) return;
  rebuildQueued = true;
  requestAnimationFrame(() => {
    rebuildQueued = false;
    const hosts = [...pendingRebuild];
    pendingRebuild.clear();
    for (const h of hosts) {
      const s = state.get(h);
      if (!s || !h.isConnected || runOf(h)) continue;
      cancelAll(s);
      s.w = 0;
      start(h);
    }
  });
}

function setEnabled(on) {
  if (on === enabled) return;
  enabled = on;
  for (const el of document.querySelectorAll(HOSTS)) {
    const s = state.get(el);
    if (!on) { if (s) { cancelAll(s); s.w = 0; } el.removeAttribute('data-edge'); const run = runOf(el); if (run) run.remove(); }
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
        if (r.attributeName === 'dir' && enabled) for (const el of document.querySelectorAll(HOSTS)) { const st = state.get(el); if (st && st.anims.length) start(el); }
        continue;
      }
      for (const n of r.removedNodes) {
        if (n.nodeType === 1 && n.classList.contains('edge-run')) { if (enabled && r.target.isConnected && state.has(r.target)) queueRebuild(r.target); continue; }
        if (!n.isConnected) forget(n);
      }
      for (const n of r.addedNodes) if (!(n.nodeType === 1 && n.classList.contains('edge-run'))) scan(n);
    }
  });
  mo.observe(document.body, { childList: true, subtree: true });
  mo.observe(root(), { attributes: true, attributeFilter: ['data-motion', 'data-bg', 'dir'] });
  const recheck = () => setEnabled(allowed());
  if (reducedMQ && reducedMQ.addEventListener) reducedMQ.addEventListener('change', recheck);
  if (forcedMQ && forcedMQ.addEventListener) forcedMQ.addEventListener('change', recheck);
}
