/**
 * Pointer spotlight (js/ui/spotlight.js, v3.6 motion pass).
 *
 * A soft light follows a mouse pointer over the card it hovers — only that card, only the top-level one (a card
 * inside a card lights its parent), and only on devices with a fine pointer that can hover. Touch, pen, reduced
 * motion (OS unless the setting forces motion on, or the setting itself), forced colours and print: nothing.
 *
 * Each lit host gets one decorative child on first hover, span.spot (aria-hidden, no text, pointer-events none,
 * absolutely positioned over the host's border box and clipped to its rounded corners). Its ::before is a fixed
 * 380 px radial light whose transform follows the pointer: pointermove only stores the coordinates; one
 * requestAnimationFrame per frame writes two custom properties on the spot itself (a leaf, so no subtree is
 * restyled) and the light moves on the compositor. The spot fades in and out with opacity (css "Spotlight").
 * Hosts are the same as the edge laser's (js/ui/edges.js); the lift on hover is CSS (:hover, fine pointers only).
 */
import { enabled as motionEnabled } from './motion.js';

const HOSTS = '.card:not(.is-plain), .tile, .metric-tile, .domain-card, .int-card, .connector-card, .kanban-card, .summary-strip';

let current = null;     // { host, spot }
let px = 0;
let py = 0;
let raf = 0;
let started = false;

const mq = (q) => { try { return window.matchMedia(q); } catch { return null; } };
const fineMQ = mq('(hover: hover) and (pointer: fine)');
const forcedMQ = mq('(forced-colors: active)');
const printMQ = mq('print');

function allowed() {
  return Boolean(fineMQ && fineMQ.matches) && !(forcedMQ && forcedMQ.matches) && !(printMQ && printMQ.matches) && motionEnabled();
}

/** The outermost host around a node (a nested card lights its parent); null outside any host. */
function hostOf(node) {
  if (!node || node.nodeType !== 1 || typeof node.closest !== 'function') return null;
  let host = node.closest(HOSTS);
  if (!host) return null;
  for (let up = host.parentElement && host.parentElement.closest(HOSTS); up; up = up.parentElement && up.parentElement.closest(HOSTS)) host = up;
  if (host.closest('.route-ghost')) return null;
  return host;
}

function spotOf(host) {
  for (const c of host.children) if (c.classList && c.classList.contains('spot')) return c;
  const spot = document.createElement('span');
  spot.className = 'spot';
  spot.setAttribute('aria-hidden', 'true');
  host.appendChild(spot);
  return spot;
}

function apply() {
  raf = 0;
  if (!current) return;
  const { host, spot } = current;
  if (!host.isConnected || !spot.isConnected) { current = null; return; }
  const r = host.getBoundingClientRect();
  const rtl = document.documentElement.getAttribute('dir') === 'rtl';
  const inline = rtl ? r.right - px : px - r.left;
  spot.style.setProperty('--si', `${Math.round(inline)}px`);
  spot.style.setProperty('--sy', `${Math.round(py - r.top)}px`);
}

function schedule() {
  if (!raf) raf = requestAnimationFrame(apply);
}

function light(host) {
  if (current && current.host === host) return;
  dim();
  if (!host || !allowed()) return;
  const spot = spotOf(host);
  current = { host, spot };
  apply();
  spot.setAttribute('data-on', '');
}

function dim() {
  if (!current) return;
  current.spot.removeAttribute('data-on');
  current = null;
}

function onOver(e) {
  if (e.pointerType && e.pointerType !== 'mouse') return;
  px = e.clientX;
  py = e.clientY;
  light(hostOf(e.target));
}

function onMove(e) {
  if (!current || (e.pointerType && e.pointerType !== 'mouse')) return;
  px = e.clientX;
  py = e.clientY;
  schedule();
}

function onOut(e) {
  if (!e.relatedTarget) dim();   // the pointer left the window
}

/** Start the spotlight. Safe to call more than once; does nothing on touch-only devices until a fine pointer appears. */
export function initSpotlight() {
  if (started || typeof document === 'undefined') return;
  started = true;
  document.addEventListener('pointerover', onOver, { passive: true });
  document.addEventListener('pointermove', onMove, { passive: true });
  document.addEventListener('pointerout', onOut, { passive: true });
  // Scrolling under a still pointer: keep the light under it.
  document.addEventListener('scroll', () => { if (current) schedule(); }, { passive: true, capture: true });
  const off = () => { if (!allowed()) dim(); };
  for (const m of [fineMQ, forcedMQ, printMQ, mq('(prefers-reduced-motion: reduce)')]) {
    if (m && typeof m.addEventListener === 'function') m.addEventListener('change', off);
  }
  try {
    new MutationObserver(off).observe(document.documentElement, { attributes: true, attributeFilter: ['data-motion'] });
  } catch { /* old engines */ }
}
