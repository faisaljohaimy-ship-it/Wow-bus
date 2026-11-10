/**
 * Biltix HSE — DOM helpers & reusable UI components.
 *
 * Every piece of data reaches the DOM through textContent / createTextNode /
 * setAttribute. innerHTML is never used. All glyphs are built with
 * createElementNS so no string markup carries data.
 *
 * Exports follow docs/ARCHITECTURE.md §4 (components.js) plus the v3 additions of
 * docs/specs/v3-precision/CONTRACT.md §7: drawer tabs, statusBadge, filterBar, loadingState /
 * errorState / offlineState / skeleton, dataTable update(rows, { preserve }) + getState / setState.
 *
 * Language: every built-in string comes from t('ui.*') (dictionary js/i18n/ui.js). Direction is read
 * at build time (html[dir]): keyboard arrows follow the reading direction and directional glyphs
 * (chevrons, "move" arrows, pager) mirror in LTR. A language switch re-mounts the view, so nothing
 * here caches a translated string at module level.
 */
import { art } from './art.js';
import { sel } from '../core/selectors.js';
import { fmt } from '../core/fmt.js';
import { bus } from '../core/bus.js';
import { status as statusApi, STATUSES } from '../core/status.js';
import { t, tn, isRtl, locale } from './i18n-bridge.js';
import { motion } from './motion.js';

/* Re-exported so `import * as components` consumers (app.js) reach the motion helpers as components.motion. */
export { motion };

const SVG_NS = 'http://www.w3.org/2000/svg';
const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]):not([type="hidden"]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';
const TONES = ['neutral', 'good', 'warning', 'serious', 'critical', 'brand', 'accent'];

let uidCounter = 0;
const uid = (prefix = 'bx') => `${prefix}-${(++uidCounter).toString(36)}`;

/** Reduced motion: the settings override on <html data-motion> ('reduce' | 'full') wins over the OS query. */
export const reducedMotion = () => {
  try {
    const forced = document.documentElement.getAttribute('data-motion');
    if (forced === 'reduce' || forced === 'reduced') return true;
    if (forced === 'full') return false;
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch { return false; }
};

/** Arrow keys that move forward / backward in the reading direction. */
const inlineKeys = () => (isRtl() ? { next: 'ArrowLeft', prev: 'ArrowRight' } : { next: 'ArrowRight', prev: 'ArrowLeft' });

/* ------------------------------------------------------------------ */
/* h() — hyperscript                                                    */
/* ------------------------------------------------------------------ */

function appendChild(parent, child) {
  if (child === null || child === undefined || child === false || child === true) return;
  if (Array.isArray(child)) { child.forEach((c) => appendChild(parent, c)); return; }
  if (child instanceof Node) { parent.appendChild(child); return; }
  if (typeof child === 'object' && child.el instanceof Node) { parent.appendChild(child.el); return; }
  parent.appendChild(document.createTextNode(String(child)));
}

function applyClass(el, value) {
  if (!value) return;
  const list = Array.isArray(value) ? value : [value];
  list.flat(Infinity).filter(Boolean).forEach((entry) => {
    String(entry).split(/\s+/).filter(Boolean).forEach((c) => el.classList.add(c));
  });
}

export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  if (attrs && typeof attrs === 'object' && !(attrs instanceof Node) && !Array.isArray(attrs)) {
    for (const [key, value] of Object.entries(attrs)) {
      if (value === undefined || value === null) continue;
      if (key === 'class' || key === 'className') { applyClass(el, value); continue; }
      if (key === 'dataset' && typeof value === 'object') {
        for (const [dk, dv] of Object.entries(value)) if (dv !== undefined && dv !== null) el.dataset[dk] = String(dv);
        continue;
      }
      if (key === 'style') {
        if (typeof value === 'string') el.setAttribute('style', value);
        else for (const [sk, sv] of Object.entries(value)) {
          if (sv === undefined || sv === null) continue;
          if (sk.startsWith('--')) el.style.setProperty(sk, String(sv));
          else el.style[sk] = sv;
        }
        continue;
      }
      if (/^on[A-Za-z]/.test(key)) {
        // Only functions become handlers. String on* values are never written as
        // attributes, so data can never smuggle an inline handler into the DOM (C-8).
        if (typeof value === 'function') el.addEventListener(key.slice(2).toLowerCase(), value);
        continue;
      }
      if (key === 'text') { el.textContent = String(value); continue; }
      if (key === 'ref' && typeof value === 'function') { value(el); continue; }
      if (typeof value === 'boolean') {
        if (value) el.setAttribute(key, key === 'draggable' || key === 'contenteditable' ? 'true' : '');
        else if (key === 'draggable') el.setAttribute('draggable', 'false');
        continue;
      }
      if (key === 'value' && 'value' in el) { el.value = String(value); continue; }
      el.setAttribute(key, String(value));
    }
  } else {
    appendChild(el, attrs);
  }
  children.forEach((c) => appendChild(el, c));
  return el;
}

export function clear(el) { while (el && el.firstChild) el.removeChild(el.firstChild); return el; }

/* ------------------------------------------------------------------ */
/* Icons & glyphs                                                      */
/* ------------------------------------------------------------------ */

function svgEl(size, viewBox = '0 0 24 24') {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', viewBox);
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  return svg;
}
function path(d, extra = {}) {
  const p = document.createElementNS(SVG_NS, 'path');
  p.setAttribute('d', d);
  for (const [k, v] of Object.entries(extra)) p.setAttribute(k, String(v));
  return p;
}
function circle(cx, cy, r, extra = {}) {
  const c = document.createElementNS(SVG_NS, 'circle');
  c.setAttribute('cx', String(cx)); c.setAttribute('cy', String(cy)); c.setAttribute('r', String(r));
  for (const [k, v] of Object.entries(extra)) c.setAttribute(k, String(v));
  return c;
}

/** Static tone glyphs (status is never color-alone). */
const GLYPHS = {
  good: (s) => { const g = svgEl(s); g.append(circle(12, 12, 9), path('M8 12.5l2.6 2.6L16 9.6')); return g; },
  warning: (s) => { const g = svgEl(s); g.append(path('M12 3.5l9 16H3l9-16z'), path('M12 10v4'), path('M12 17.2h.01')); return g; },
  serious: (s) => { const g = svgEl(s); g.append(circle(12, 12, 9), path('M12 7.5v5.5'), path('M12 16.4h.01')); return g; },
  critical: (s) => { const g = svgEl(s); g.append(path('M8.2 3h7.6L21 8.2v7.6L15.8 21H8.2L3 15.8V8.2L8.2 3z'), path('M9.5 9.5l5 5M14.5 9.5l-5 5')); return g; },
  brand: (s) => { const g = svgEl(s); g.append(path('M12 3l9 9-9 9-9-9 9-9z')); return g; },
  accent: (s) => { const g = svgEl(s); g.append(circle(12, 12, 3.2, { fill: 'currentColor', stroke: 'none' }), circle(12, 12, 8.5, { opacity: '.55' })); return g; },
  neutral: (s) => { const g = svgEl(s); g.append(circle(12, 12, 8.5), path('M8 12h8')); return g; },
  close: (s) => { const g = svgEl(s); g.append(path('M6 6l12 12M18 6L6 18')); return g; },
  chevronDown: (s) => { const g = svgEl(s); g.append(path('M6 9l6 6 6-6')); return g; },
  chevronStart: (s) => { const g = svgEl(s); g.append(path('M9 6l6 6-6 6')); return g; },
  chevronEnd: (s) => { const g = svgEl(s); g.append(path('M15 6l-6 6 6 6')); return g; },
  sort: (s) => { const g = svgEl(s); g.append(path('M8 9l4-4 4 4M8 15l4 4 4-4')); return g; },
  sortAsc: (s) => { const g = svgEl(s); g.append(path('M8 10l4-4 4 4'), path('M12 6v13')); return g; },
  sortDesc: (s) => { const g = svgEl(s); g.append(path('M8 14l4 4 4-4'), path('M12 5v13')); return g; },
  move: (s) => { const g = svgEl(s); g.append(path('M19 12H5M12 5l-7 7 7 7')); return g; },   // forward in RTL (mirrored in LTR)
  grip: (s) => { const g = svgEl(s); g.append(circle(9, 6, 1.3, { fill: 'currentColor', stroke: 'none' }), circle(15, 6, 1.3, { fill: 'currentColor', stroke: 'none' }), circle(9, 12, 1.3, { fill: 'currentColor', stroke: 'none' }), circle(15, 12, 1.3, { fill: 'currentColor', stroke: 'none' }), circle(9, 18, 1.3, { fill: 'currentColor', stroke: 'none' }), circle(15, 18, 1.3, { fill: 'currentColor', stroke: 'none' })); return g; },
  empty: (s) => { const g = svgEl(s); g.append(path('M4 7h16v12H4z'), path('M4 11h16'), path('M9 7V4h6v3')); return g; },
  chart: (s) => { const g = svgEl(s); g.append(path('M4 19h16'), path('M7 16V10M12 16V6M17 16v-3')); return g; },
  table: (s) => { const g = svgEl(s); g.append(path('M4 5h16v14H4z'), path('M4 10h16M4 15h16M10 5v14')); return g; },
  clock: (s) => { const g = svgEl(s); g.append(circle(12, 12, 9), path('M12 7v5l3 2')); return g; },
};

/** Glyphs that point along the reading direction: drawn for RTL, mirrored in LTR. */
const DIRECTIONAL_GLYPHS = new Set(['chevronStart', 'chevronEnd', 'move']);

export function glyph(name, size = 16) {
  const make = GLYPHS[name] || GLYPHS.neutral;
  const svg = make(size);
  if (DIRECTIONAL_GLYPHS.has(name) && !isRtl()) {
    const g = document.createElementNS(SVG_NS, 'g');
    g.setAttribute('transform', 'matrix(-1 0 0 1 24 0)');
    while (svg.firstChild) g.appendChild(svg.firstChild);
    svg.appendChild(g);
    svg.setAttribute('data-mirrored', 'true');
  }
  return svg;
}

/** Delegates to art.icon(name); falls back to a local glyph so the UI never breaks. */
export function svgIcon(name, size = 18) {
  let node = null;
  try { node = art && typeof art.icon === 'function' ? art.icon(name, size) : null; } catch { node = null; }
  if (!(node instanceof Node)) node = glyph(GLYPHS[name] ? name : 'neutral', size);
  if (node.setAttribute) {
    node.setAttribute('width', String(size));
    node.setAttribute('height', String(size));
    if (!node.hasAttribute('aria-hidden')) node.setAttribute('aria-hidden', 'true');
    node.setAttribute('focusable', 'false');
    node.classList.add('icon');
  }
  return node;
}

function iconNode(icon, size = 18) {
  if (!icon) return null;
  if (icon instanceof Node) return icon;
  if (typeof icon === 'object' && icon.el instanceof Node) return icon.el;
  return svgIcon(String(icon), size);
}

const toneOf = (tone) => (TONES.includes(tone) ? tone : 'neutral');

/* ------------------------------------------------------------------ */
/* Badges, buttons, dots                                                */
/* ------------------------------------------------------------------ */

export function badge(text, tone = 'neutral', { icon = null } = {}) {
  const tn0 = toneOf(tone);
  const el = h('span', { class: ['badge', `tone-${tn0}`], 'data-tone': tn0 });
  const ic = icon ? iconNode(icon, 14) : glyph(tn0, 14);
  if (ic) { ic.classList.add('badge-icon'); el.appendChild(ic); }
  el.appendChild(h('span', { class: 'badge-text' }, String(text ?? '')));
  return el;
}

export function tierBadge(tier) {
  let tone = 'neutral';
  try { tone = sel.tierTone(tier) || 'neutral'; } catch { tone = 'neutral'; }
  return badge(tier, tone);
}

export function liveDot(tone = 'accent') {
  return h('span', { class: ['live-dot', `tone-${toneOf(tone)}`], 'aria-hidden': 'true' });
}

/* Fallback presentation when js/core/status.js is unavailable (same mapping as status.meta). */
const STATUS_FALLBACK = {
  demo: { tone: 'accent', icon: 'flask' },
  live: { tone: 'good', icon: 'check-circle' },
  offline: { tone: 'warning', icon: 'alert-circle' },
  stale: { tone: 'warning', icon: 'clock' },
  error: { tone: 'critical', icon: 'alert-octagon' },
  not_connected: { tone: 'neutral', icon: 'plug' },
};
const STATUS_KEYS = Array.isArray(STATUSES) && STATUSES.length ? STATUSES : Object.keys(STATUS_FALLBACK);

/**
 * Honest system-status badge (CONTRACT §5): icon + label, tone from status.meta(statusKey).
 * Unknown keys render as 'not_connected' (never as a success). The one-line description becomes the
 * tooltip and the accessible description.
 * @param {'demo'|'live'|'offline'|'stale'|'error'|'not_connected'} statusKey
 * @param {{label?:string, title?:string|false, size?:'sm'|'md'|'lg'}} [opts]
 */
export function statusBadge(statusKey, { label = null, title = null, size = 'md' } = {}) {
  const key = STATUS_KEYS.includes(statusKey) ? statusKey : 'not_connected';
  let meta = null;
  try { meta = statusApi && typeof statusApi.meta === 'function' ? statusApi.meta(key) : null; } catch { meta = null; }
  const fb = STATUS_FALLBACK[key] || STATUS_FALLBACK.not_connected;
  const tone = toneOf((meta && meta.tone) || fb.tone);
  const iconName = (meta && meta.icon) || fb.icon;
  let text = label;
  if (text === null || text === undefined || text === '') {
    try { text = statusApi && typeof statusApi.label === 'function' ? statusApi.label(key) : ''; } catch { text = ''; }
    if (!text || text === `status.${key}`) text = t(`ui.status.${key}`);
  }
  let desc = title;
  if (desc === null || desc === undefined) {
    try { desc = statusApi && typeof statusApi.desc === 'function' ? statusApi.desc(key) : ''; } catch { desc = ''; }
    if (desc === `status.${key}Desc`) desc = '';
  }
  // .status-badge owns its look per data-status (css/components.css); no generic .badge / tone classes,
  // so a status can never inherit a success colour by accident.
  const el = h('span', {
    class: ['status-badge', `is-${key}`, size === 'sm' ? 'is-sm' : (size === 'lg' ? 'is-lg' : null)],
    'data-status': key, 'data-tone': tone, title: desc || undefined,
  });
  const ic = svgIcon(iconName, 12);
  ic.classList.add('status-badge-icon');
  el.appendChild(ic);
  el.appendChild(h('span', { class: 'status-badge-label badge-text' }, String(text)));
  if (desc) el.appendChild(h('span', { class: 'sr-only' }, ` — ${desc}`));
  return el;
}

export function button(label, { variant = 'primary', icon = null, size = 'md', onClick = null, attrs = {} } = {}) {
  const variants = ['primary', 'ghost', 'outline', 'danger'];
  const v = variants.includes(variant) ? variant : 'primary';
  const classes = ['btn', `btn-${v}`];
  if (size === 'sm') classes.push('btn-sm');
  const hasLabel = label !== null && label !== undefined && String(label).trim() !== '';
  if (!hasLabel) classes.push('btn-icon');
  const a = { type: 'button', class: classes, ...(attrs || {}) };
  if (attrs && attrs.class) a.class = classes.concat(Array.isArray(attrs.class) ? attrs.class : String(attrs.class).split(/\s+/));
  if (attrs && attrs.ariaLabel) { a['aria-label'] = attrs.ariaLabel; delete a.ariaLabel; }
  if (!hasLabel && !a['aria-label'] && a.title) a['aria-label'] = a.title;
  if (typeof onClick === 'function') a.onClick = onClick;
  const btn = h('button', a);
  const ic = iconNode(icon, size === 'sm' ? 15 : 17);
  if (ic) { ic.classList.add('btn-ic'); btn.appendChild(ic); }
  if (hasLabel) btn.appendChild(h('span', { class: 'btn-label' }, String(label)));
  return btn;
}

/* ------------------------------------------------------------------ */
/* Segmented control & tabs                                            */
/* ------------------------------------------------------------------ */

export function segmented({ options = [], value = null, onChange = null, ariaLabel = '' } = {}) {
  const el = h('div', { class: 'seg', role: 'group', 'aria-label': ariaLabel || undefined });
  let current = value;
  const buttons = new Map();

  const paint = () => {
    for (const [val, btn] of buttons) {
      const pressed = String(val) === String(current);
      btn.setAttribute('aria-pressed', pressed ? 'true' : 'false');
      btn.classList.toggle('is-active', pressed);
      btn.tabIndex = pressed ? 0 : -1;
    }
    if (current === null || current === undefined) {
      const first = el.querySelector('button'); if (first) first.tabIndex = 0;
    }
  };

  const set = (val, fire = false) => {
    current = val;
    paint();
    if (fire && typeof onChange === 'function') onChange(val);
  };

  options.forEach((opt) => {
    const o = typeof opt === 'object' ? opt : { value: opt, label: String(opt) };
    const btn = h('button', {
      type: 'button', class: 'seg-btn', 'data-value': String(o.value),
      'aria-pressed': 'false',
      onClick: () => set(o.value, true),
    });
    const ic = iconNode(o.icon, 14); if (ic) btn.appendChild(ic);
    btn.appendChild(h('span', {}, String(o.label)));
    buttons.set(o.value, btn);
    el.appendChild(btn);
  });

  el.addEventListener('keydown', (e) => {
    const keys = ['ArrowRight', 'ArrowLeft', 'Home', 'End'];
    if (!keys.includes(e.key)) return;
    const list = Array.from(buttons.values());
    if (!list.length) return;
    let idx = list.findIndex((b) => b === document.activeElement);
    if (idx < 0) idx = 0;
    // Forward follows the reading direction (ArrowLeft in RTL, ArrowRight in LTR).
    const dirKeys = inlineKeys();
    if (e.key === dirKeys.next) idx = (idx + 1) % list.length;
    else if (e.key === dirKeys.prev) idx = (idx - 1 + list.length) % list.length;
    else if (e.key === 'Home') idx = 0;
    else idx = list.length - 1;
    e.preventDefault();
    list[idx].focus();
    set([...buttons.keys()][idx], true);
  });

  paint();
  return { el, set: (v) => set(v, false), get value() { return current; } };
}

export function tabs({ items = [], active = null } = {}) {
  const el = h('div', { class: 'tabs-wrap' });
  const list = h('div', { class: 'tabs', role: 'tablist' });
  const panels = h('div', { class: 'tabpanels' });
  el.append(list, panels);
  const map = new Map();
  let currentId = active ?? (items[0] && items[0].id);
  const rendered = new Set();

  items.forEach((item) => {
    const tabId = uid('tab'); const panelId = uid('panel');
    const tab = h('button', {
      type: 'button', class: 'tab', role: 'tab', id: tabId, 'aria-controls': panelId,
      'aria-selected': 'false', tabindex: '-1', 'data-id': String(item.id),
      onClick: () => show(item.id),
    });
    const ic = iconNode(item.icon, 15); if (ic) tab.appendChild(ic);
    tab.appendChild(h('span', {}, String(item.label)));
    const panel = h('div', { class: 'tabpanel', role: 'tabpanel', id: panelId, 'aria-labelledby': tabId, hidden: true, tabindex: '0' });
    map.set(item.id, { tab, panel, item });
    list.appendChild(tab); panels.appendChild(panel);
  });

  function show(id) {
    if (!map.has(id)) return;
    currentId = id;
    for (const [key, { tab, panel, item }] of map) {
      const on = key === id;
      tab.setAttribute('aria-selected', on ? 'true' : 'false');
      tab.tabIndex = on ? 0 : -1;
      tab.classList.toggle('is-active', on);
      panel.hidden = !on;
      if (on && !rendered.has(key) && typeof item.render === 'function') {
        rendered.add(key);
        appendChild(panel, item.render(panel));
      }
    }
  }

  list.addEventListener('keydown', (e) => {
    const keys = ['ArrowRight', 'ArrowLeft', 'Home', 'End'];
    if (!keys.includes(e.key)) return;
    const arr = Array.from(map.keys());
    let idx = arr.indexOf(currentId);
    const dirKeys = inlineKeys();
    if (e.key === dirKeys.next) idx = (idx + 1) % arr.length;
    else if (e.key === dirKeys.prev) idx = (idx - 1 + arr.length) % arr.length;
    else if (e.key === 'Home') idx = 0;
    else idx = arr.length - 1;
    e.preventDefault();
    show(arr[idx]);
    map.get(arr[idx]).tab.focus();
  });

  if (currentId !== null && currentId !== undefined) show(currentId);
  return { el, show, get active() { return currentId; } };
}

/* ------------------------------------------------------------------ */
/* Card & stat tile                                                    */
/* ------------------------------------------------------------------ */

function resolveBody(body, ...args) {
  if (typeof body === 'function') return body(...args);
  return body;
}

export function card({ code = '', title = '', subtitle = '', actions = [], body = null, footer = null, framed = true, hero = false, plain = false, tableView = null, id = null, className = '' } = {}) {
  const classes = ['card'];
  // plain → a card nested inside another card: `card is-plain` drops the frame and brackets.
  if (plain) classes.push('is-plain');
  else if (framed) classes.push('is-framed');
  if (hero) classes.push('is-hero');
  if (className) classes.push(className);
  const titleId = uid('card-title');
  const el = h('section', { class: classes, id: id || undefined, 'aria-labelledby': title ? titleId : undefined });

  const hasHead = code || title || subtitle || (actions && actions.length) || tableView;
  if (hasHead) {
    const head = h('header', { class: 'card-head' });
    const titles = h('div', { class: 'card-titles' });
    if (code) titles.appendChild(h('span', { class: 'card-code', 'aria-hidden': 'true', dir: 'ltr', translate: 'no' }, String(code)));
    const titleWrap = h('div', { class: 'card-title-wrap' });
    if (title) titleWrap.appendChild(h('h2', { class: 'card-title', id: titleId }, String(title)));
    if (subtitle) titleWrap.appendChild(h('p', { class: 'card-sub' }, String(subtitle)));
    titles.appendChild(titleWrap);
    head.appendChild(titles);
    const acts = h('div', { class: 'card-actions' });
    (actions || []).forEach((a) => appendChild(acts, a));
    head.appendChild(acts);
    el.appendChild(head);
  }

  const bodyEl = h('div', { class: 'card-body' });
  const chartHost = h('div', { class: 'card-view card-view-chart' });
  appendChild(chartHost, resolveBody(body, bodyEl));
  bodyEl.appendChild(chartHost);

  if (typeof tableView === 'function') {
    const tableHost = h('div', { class: 'card-view card-view-table table-wrap', hidden: true });
    let tableBuilt = false;
    const toggle = segmented({
      options: [{ value: 'chart', label: t('ui.view.chart'), icon: glyph('chart', 14) }, { value: 'table', label: t('ui.view.table'), icon: glyph('table', 14) }],
      value: 'chart',
      ariaLabel: t('ui.view.mode'),
      onChange: (v) => {
        const showTable = v === 'table';
        if (showTable && !tableBuilt) {
          tableBuilt = true;
          let tbl = null;
          try { tbl = tableView(); } catch { tbl = null; }
          if (tbl instanceof Node) { tbl.classList && tbl.classList.add('table', 'is-dense'); tableHost.appendChild(tbl); }
          else tableHost.appendChild(emptyState({ title: t('ui.view.noTable') }));
        }
        chartHost.hidden = showTable;
        tableHost.hidden = !showTable;
        el.classList.toggle('is-table-view', showTable);
      },
    });
    toggle.el.classList.add('seg-sm', 'card-view-toggle');
    const acts = el.querySelector('.card-actions');
    acts.insertBefore(toggle.el, acts.firstChild);
    bodyEl.appendChild(tableHost);
  }
  el.appendChild(bodyEl);

  if (footer !== null && footer !== undefined) {
    const foot = h('footer', { class: 'card-foot' });
    appendChild(foot, resolveBody(footer, foot));
    el.appendChild(foot);
  }
  return el;
}

function formatValue(value) {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'number') return Number.isFinite(value) ? fmt.num(value, { maximumFractionDigits: Number.isInteger(value) ? 0 : 1 }) : '—';
  const s = String(value).trim();
  return s === '' || /^(nan|undefined|null)$/i.test(s) ? '—' : s;
}

/* Unicode bidi controls Intl may emit around signed numbers (LRM, RLM, ALM, embeddings, isolates, BOM). */
const BIDI_MARKS_RE = /[\u200E\u200F\u061C\u202A-\u202E\u2066-\u2069\uFEFF]/g;
const PLACEHOLDER_RE = /^(nan|undefined|null|—|-|–)$/i;

/**
 * Parse a delta given as a number or as a formatted string (e.g. fmt.signed() output:
 * "\u200E+0.35", "\u061C−٢٫٥", "+3%") into a finite number. Returns NaN when it cannot.
 * Strips bidi marks, converts Arabic-Indic / Persian digits and the Arabic decimal
 * separator, accepts U+2212 / en dash as minus and ignores thousands separators and %.
 */
export function parseDelta(delta) {
  if (typeof delta === 'number') return Number.isFinite(delta) ? delta : NaN;
  if (delta === null || delta === undefined || typeof delta === 'boolean') return NaN;
  if (typeof fmt.parseSigned === 'function') {
    try { const n = fmt.parseSigned(delta); if (Number.isFinite(n)) return n; } catch { /* fall through to the local parser */ }
  }
  let s = String(delta).replace(BIDI_MARKS_RE, '').trim();
  if (!s) return NaN;
  s = s.replace(/[\u0660-\u0669]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[\u06F0-\u06F9]/g, (d) => String(d.charCodeAt(0) - 0x06F0))
    .replace(/\u066B/g, '.')
    .replace(/[\u066C,\s]/g, '')
    .replace(/[\u2212\u2013\u2012\u2011]/g, '-')
    .replace(/[%\u066A]/g, '');
  let neg = false;
  const paren = /^\((.*)\)$/.exec(s);
  if (paren) { neg = true; s = paren[1]; }
  if (/^[+-]/.test(s)) { neg = neg || s[0] === '-'; s = s.slice(1); }
  if (!/^(\d+\.?\d*|\.\d+)$/.test(s)) return NaN;
  const n = Number(s);
  return Number.isFinite(n) ? (neg ? -n : n) : NaN;
}

export function statTile({ label, value, unit = '', delta = null, deltaGoodWhen = 'down', spark = null, icon = null, tone = null, onClick = null, hint = '' } = {}) {
  const clickable = typeof onClick === 'function';
  const classes = ['tile'];
  if (tone) classes.push(`tone-${toneOf(tone)}`);
  if (clickable) classes.push('is-clickable');
  const el = h(clickable ? 'button' : 'div', {
    class: classes, type: clickable ? 'button' : undefined, 'data-tone': tone ? toneOf(tone) : undefined,
    onClick: clickable ? onClick : undefined, title: hint || undefined,
  });

  const top = h('div', { class: 'tile-top' });
  top.appendChild(h('span', { class: 'tile-label' }, String(label ?? '')));
  const ic = iconNode(icon, 18);
  if (ic) top.appendChild(h('span', { class: 'tile-icon', 'aria-hidden': 'true' }, ic));
  el.appendChild(top);

  const valueRow = h('div', { class: 'tile-value-row' });
  valueRow.appendChild(h('span', { class: 'tile-value' }, formatValue(value)));
  if (unit) valueRow.appendChild(h('span', { class: 'tile-unit' }, String(unit)));
  el.appendChild(valueRow);

  const bottom = h('div', { class: 'tile-bottom' });
  const deltaRaw = typeof delta === 'string' ? delta.replace(BIDI_MARKS_RE, '').trim() : delta;
  const deltaGiven = deltaRaw !== null && deltaRaw !== undefined && deltaRaw !== '' && !(typeof deltaRaw === 'string' && PLACEHOLDER_RE.test(deltaRaw)) && !(typeof deltaRaw === 'number' && !Number.isFinite(deltaRaw));
  if (deltaGiven) {
    // Numbers are formatted here; strings (already formatted by the caller, e.g. fmt.signed)
    // are shown verbatim but parsed with bidi marks stripped so tone/arrow are never inverted (V1).
    const parsed = parseDelta(delta);
    let text;
    let n = parsed;
    if (typeof delta === 'number') {
      const digits = Number.isInteger(delta) ? 0 : (Math.abs(delta) < 1 ? 2 : 1);
      n = Number(delta.toFixed(digits));
      text = fmt.signed(n, digits);
    } else {
      text = String(delta).trim();
    }
    const known = Number.isFinite(n);
    // A recognised number is shown without Intl's bidi marks (an ALM/RLM would flip the sign to the
    // wrong side) inside an LTR isolate, so "+0.35" / "−٢٫٥" always read sign-first.
    if (known) text = text.replace(BIDI_MARKS_RE, '').trim() || text;
    const isZero = known && n === 0;
    const isUp = known && n > 0;
    const isDown = known && n < 0;
    const goodWhen = deltaGoodWhen === 'up' ? 'up' : 'down';
    const good = !known || isZero ? null : (goodWhen === 'down' ? isDown : isUp);
    const d = h('span', {
      class: ['tile-delta', isZero || !known ? 'is-flat' : (isUp ? 'is-up' : 'is-down'), good === null ? null : (good ? 'is-good' : 'is-bad')],
      'data-direction': isZero || !known ? 'flat' : (isUp ? 'up' : 'down'),
    });
    const arrow = svgEl(12); arrow.classList.add('tile-delta-arrow');
    arrow.append(isZero || !known ? path('M5 12h14') : (isUp ? path('M12 19V5M5 12l7-7 7 7') : path('M12 5v14M5 12l7 7 7-7')));
    d.appendChild(arrow);
    d.appendChild(h('span', { class: 'sr-only' }, t('ui.delta.sr')));
    d.appendChild(h('bdi', { class: 'tile-delta-text', dir: known ? 'ltr' : undefined }, text));
    if (isZero) d.appendChild(h('span', { class: 'sr-only' }, t('ui.delta.flat')));
    else if (good !== null) d.appendChild(h('span', { class: 'sr-only' }, good ? t('ui.delta.better') : t('ui.delta.worse')));
    bottom.appendChild(d);
  }
  const sp = iconNode(spark);
  if (sp) bottom.appendChild(h('span', { class: 'tile-spark', 'aria-hidden': 'true' }, sp));
  if (bottom.childNodes.length) el.appendChild(bottom);
  if (hint) el.appendChild(h('span', { class: 'tile-hint' }, String(hint)));
  return el;
}

/* ------------------------------------------------------------------ */
/* Data table                                                          */
/* ------------------------------------------------------------------ */

const collators = new Map();
function collatorFor(loc) {
  let c = collators.get(loc);
  if (!c) {
    try { c = new Intl.Collator(loc, { numeric: true, sensitivity: 'base' }); } catch { c = new Intl.Collator(undefined, { numeric: true }); }
    collators.set(loc, c);
  }
  return c;
}
function compareValues(a, b, collator = collatorFor(locale())) {
  const an = a === null || a === undefined || a === '';
  const bn = b === null || b === undefined || b === '';
  if (an && bn) return 0; if (an) return 1; if (bn) return -1;
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  if (a instanceof Date && b instanceof Date) return a - b;
  const na = Number(a), nb = Number(b);
  if (!Number.isNaN(na) && !Number.isNaN(nb) && String(a).trim() !== '' && String(b).trim() !== '') return na - nb;
  return collator.compare(String(a), String(b));
}

const PRIORITIES = ['high', 'medium', 'low'];
const priorityOf = (col) => (col && PRIORITIES.includes(col.priority) ? col.priority : 'high');
const INTERACTIVE = 'button,a[href],input,select,textarea,[tabindex],[role="button"],[contenteditable]';

/**
 * Sortable, paged data table.
 *   columns[].priority  'high' (default) | 'medium' | 'low'  → data-priority on th/td so CSS can
 *                       hide low-priority columns in narrow containers (V2/V8).
 *   stickyFirst         default true → table.has-sticky-first (CSS pins the first column).
 *   maxHeight           number (px); with autoPageSize=true the page size is computed so that the
 *                       rows + pager fit inside it (measured after mount); without it, it is applied
 *                       as max-block-size on the wrapper.
 *   rowLabel(row)       optional accessible name for the row-open button (default: first cell text).
 * Rows are plain <tr>; when onRowClick is given the first cell content becomes a
 * <button class="row-open"> named "Open: <first cell text>" (RTL-8), the pointer click on the row stays.
 * Wrapper classes: is-paged (pageSize > 0), has-pager (more than one page), is-overflowing
 * (scrollWidth > clientWidth), is-scroll-start / is-scroll-end (horizontal scroll position).
 *
 * update(rows, opts) keeps the sort and the page (clamped) by default. opts:
 *   preserve: true   also keeps the wrapper scroll (both axes), the page's scroll position and the
 *                    keyboard focus (same row key + column) — use it for live / background updates;
 *   resetPage: true  back to page 1 (filter changes);
 *   flash: true      motion.flash() rows whose key is new or whose content changed (live updates).
 * getState() → { sortKey, sortDir, page, pageSize, scrollTop, scrollLeft }; setState(partial) restores it
 * (e.g. after a drawer closed or the view re-mounted).
 */
export function dataTable({ columns = [], rows = [], rowKey = 'id', onRowClick = null, pageSize = 12, emptyText = null, dense = false, caption = '', initialSort = null, stickyFirst = true, autoPageSize = false, maxHeight = null, rowLabel = null } = {}) {
  const wrap = h('div', { class: 'table-wrap' });
  const clickable = typeof onRowClick === 'function';
  const table = h('table', { class: ['table', dense ? 'is-dense' : null, stickyFirst !== false ? 'has-sticky-first' : null, clickable ? 'has-row-open' : null] });
  if (caption) table.appendChild(h('caption', { class: 'sr-only' }, String(caption)));
  const thead = h('thead'); const tbody = h('tbody');
  table.append(thead, tbody);
  wrap.appendChild(table);
  const emptyEl = emptyState({ icon: glyph('empty', 28), title: emptyText || t('ui.table.empty') });
  emptyEl.hidden = true;
  wrap.appendChild(emptyEl);
  const pager = h('nav', { class: 'pager', 'aria-label': t('ui.table.pagination'), hidden: true });
  wrap.appendChild(pager);
  const collator = collatorFor(locale());

  const maxH = typeof maxHeight === 'number' && Number.isFinite(maxHeight) && maxHeight > 0 ? maxHeight : null;
  const autoFit = !!autoPageSize && maxH !== null;
  if (maxH !== null && !autoFit) wrap.style.maxBlockSize = `${Math.round(maxH)}px`;
  if (autoFit) wrap.dataset.autoPage = 'true';

  let data = Array.isArray(rows) ? rows.slice() : [];
  let sortKey = initialSort ? initialSort.key : null;
  let sortDir = initialSort ? (initialSort.dir || 'asc') : 'asc';
  let page = 0;
  let size = Number.isFinite(Number(pageSize)) ? Math.max(0, Number(pageSize) | 0) : 12;
  if (autoFit) size = estimateRows(maxH, dense);
  const headCells = new Map();

  const headRow = h('tr');
  columns.forEach((col) => {
    const sortable = col.sortable !== false;
    const th = h('th', { scope: 'col', 'data-key': String(col.key), 'data-priority': priorityOf(col), style: col.width ? { inlineSize: typeof col.width === 'number' ? `${col.width}px` : col.width } : undefined, class: col.align ? `align-${col.align}` : null });
    if (sortable) {
      const btn = h('button', { type: 'button', class: 'sort-btn', onClick: () => toggleSort(col.key) }, h('span', {}, String(col.label ?? '')));
      const ic = glyph('sort', 14); ic.classList.add('sort-ic'); btn.appendChild(ic);
      th.appendChild(btn);
      th.setAttribute('aria-sort', 'none');
    } else th.appendChild(h('span', {}, String(col.label ?? '')));
    headCells.set(col.key, th);
    headRow.appendChild(th);
  });
  thead.appendChild(headRow);

  function sorted() {
    if (!sortKey) return data;
    const col = columns.find((c) => c.key === sortKey);
    const getter = col && typeof col.sortValue === 'function' ? col.sortValue : (r) => r[sortKey];
    const arr = data.slice().sort((a, b) => compareValues(getter(a), getter(b), collator));
    return sortDir === 'desc' ? arr.reverse() : arr;
  }

  function paintHead() {
    for (const [key, th] of headCells) {
      if (!th.hasAttribute('aria-sort')) continue;
      const active = key === sortKey;
      th.setAttribute('aria-sort', active ? (sortDir === 'desc' ? 'descending' : 'ascending') : 'none');
      th.classList.toggle('is-sorted', active);
      const old = th.querySelector('.sort-ic');
      const ic = glyph(active ? (sortDir === 'desc' ? 'sortDesc' : 'sortAsc') : 'sort', 14);
      ic.classList.add('sort-ic');
      if (old) old.replaceWith(ic);
    }
  }

  function renderCell(col, row) {
    const td = h('td', { class: col.align ? `align-${col.align}` : null, 'data-label': String(col.label ?? ''), 'data-priority': priorityOf(col) });
    let content;
    try { content = typeof col.render === 'function' ? col.render(row) : row[col.key]; } catch { content = '—'; }
    if (content === null || content === undefined || content === '') content = '—';
    if (typeof content === 'number') content = Number.isFinite(content) ? fmt.num(content, { maximumFractionDigits: Number.isInteger(content) ? 0 : 1 }) : '—';
    appendChild(td, content);
    if (col.mono) td.classList.add('mono');
    return td;
  }

  /** First cell → <button class="row-open"> that opens the row (keyboard path without role=button on <tr>). */
  function makeRowOpen(td, row, key) {
    let name = '';
    if (typeof rowLabel === 'function') { try { name = String(rowLabel(row) ?? ''); } catch { name = ''; } }
    const text = (name || td.textContent || '').replace(/\s+/g, ' ').trim() || key || '';
    const label = t('ui.table.open', { name: text });
    const open = (e) => { e.stopPropagation(); onRowClick(row, e); };
    if (!td.querySelector(INTERACTIVE)) {
      const btn = h('button', { type: 'button', class: 'row-open', 'aria-label': label, onClick: open });
      while (td.firstChild) btn.appendChild(td.firstChild);
      td.appendChild(btn);
    } else {
      // The cell already holds interactive content: add a dedicated opener beside it instead of nesting.
      td.appendChild(h('button', { type: 'button', class: 'row-open row-open-aux', 'aria-label': label, onClick: open }, glyph('chevronEnd', 14)));
    }
    td.classList.add('has-row-open');
  }

  function renderBody() {
    clear(tbody);
    const all = sorted();
    const total = all.length;
    const pages = size > 0 ? Math.max(1, Math.ceil(total / size)) : 1;
    if (page > pages - 1) page = pages - 1;
    if (page < 0) page = 0;
    const slice = size > 0 ? all.slice(page * size, page * size + size) : all;
    const frag = document.createDocumentFragment();
    slice.forEach((row) => {
      const key = row && row[rowKey] !== undefined ? String(row[rowKey]) : '';
      const tr = h('tr', { 'data-key': key || undefined, class: clickable ? 'is-clickable' : null });
      columns.forEach((col, ci) => {
        const td = renderCell(col, row);
        if (ci === 0 && clickable) makeRowOpen(td, row, key);
        tr.appendChild(td);
      });
      if (clickable) {
        // Pointer convenience only: buttons/links inside the row (incl. .row-open) handle themselves.
        tr.addEventListener('click', (e) => { if (e.target.closest(INTERACTIVE)) return; onRowClick(row, e); });
      }
      frag.appendChild(tr);
    });
    tbody.appendChild(frag);
    table.hidden = total === 0;
    emptyEl.hidden = total !== 0;
    wrap.classList.toggle('is-paged', size > 0);
    // Long lists without a pager keep a height cap (CSS .is-scroll); paged tables never do.
    wrap.classList.toggle('is-scroll', size === 0 && maxH === null && total > 14);
    wrap.classList.toggle('is-empty', total === 0);
    renderPager(total, pages);
    scheduleMeasure();
  }

  function renderPager(total, pages) {
    clear(pager);
    wrap.classList.toggle('has-pager', pages > 1);
    if (pages <= 1) { pager.hidden = true; return; }
    pager.hidden = false;
    const from = page * size + 1;
    const to = Math.min(total, (page + 1) * size);
    const prev = button('', { variant: 'ghost', size: 'sm', icon: glyph('chevronStart', 16), onClick: () => { page = Math.max(0, page - 1); renderBody(); }, attrs: { 'aria-label': t('ui.table.prev'), disabled: page === 0, class: 'pager-prev' } });
    const next = button('', { variant: 'ghost', size: 'sm', icon: glyph('chevronEnd', 16), onClick: () => { page = Math.min(pages - 1, page + 1); renderBody(); }, attrs: { 'aria-label': t('ui.table.next'), disabled: page >= pages - 1, class: 'pager-next' } });
    const info = h('span', { class: 'pager-info', 'aria-live': 'polite' }, t('ui.table.range', { from: fmt.num(from), to: fmt.num(to), total: fmt.num(total) }));
    const pageLabel = h('span', { class: 'pager-page' }, t('ui.table.page', { page: fmt.num(page + 1), pages: fmt.num(pages) }));
    pager.append(prev, info, pageLabel, next);
  }

  /* ---- state / preserve helpers ---- */
  const keyOf = (row) => (row && row[rowKey] !== undefined && row[rowKey] !== null ? String(row[rowKey]) : '');
  const signature = (row) => { try { return JSON.stringify(row); } catch { return String(Math.random()); } };
  /** Nearest scrolling ancestor (the page scroller on phones, main on desktop). */
  function scrollParent() {
    let n = wrap.parentElement;
    while (n && n !== document.body && n !== document.documentElement) {
      const cs = getComputedStyle(n);
      if (/(auto|scroll|overlay)/.test(cs.overflowY) && n.scrollHeight > n.clientHeight) return n;
      n = n.parentElement;
    }
    return document.scrollingElement || document.documentElement;
  }
  function captureFocus() {
    const active = document.activeElement;
    if (!active || !tbody.contains(active)) return null;
    const tr = active.closest('tr');
    const td = active.closest('td');
    return tr ? { key: tr.getAttribute('data-key'), col: td ? Array.from(tr.children).indexOf(td) : 0 } : null;
  }
  function restoreFocus(f) {
    if (!f || f.key === null) return;
    const esc = typeof CSS !== 'undefined' && typeof CSS.escape === 'function' ? CSS.escape(f.key) : f.key.replace(/["\\]/g, '\\$&');
    const tr = tbody.querySelector(`tr[data-key="${esc}"]`);
    if (!tr) return;
    const td = tr.children[f.col] || tr.children[0];
    const target = (td && td.querySelector(INTERACTIVE)) || tr.querySelector(INTERACTIVE);
    if (target) { try { target.focus({ preventScroll: true }); } catch { target.focus(); } }
  }
  function getState() {
    return { sortKey, sortDir, page, pageSize: size, scrollTop: wrap.scrollTop, scrollLeft: wrap.scrollLeft };
  }
  function setState(s = {}) {
    if (!s || typeof s !== 'object') return;
    if ('sortKey' in s) sortKey = s.sortKey || null;
    if (s.sortDir === 'asc' || s.sortDir === 'desc') sortDir = s.sortDir;
    if (Number.isFinite(Number(s.pageSize)) && s.pageSize !== null && !autoFit) size = Math.max(0, Number(s.pageSize) | 0);
    if (Number.isFinite(Number(s.page))) page = Math.max(0, Number(s.page) | 0);
    paintHead();
    renderBody();
    if (Number.isFinite(s.scrollTop)) wrap.scrollTop = s.scrollTop;
    if (Number.isFinite(s.scrollLeft)) wrap.scrollLeft = s.scrollLeft;
    updateScrollEdges();
  }
  function update(nextRows, { preserve = false, resetPage = false, flash = false } = {}) {
    const before = flash ? new Map(data.map((r) => [keyOf(r), signature(r)])) : null;
    let saved = null;
    if (preserve) {
      const sp = scrollParent();
      saved = { top: wrap.scrollTop, left: wrap.scrollLeft, sp, spTop: sp ? sp.scrollTop : 0, focus: captureFocus() };
    }
    data = Array.isArray(nextRows) ? nextRows.slice() : [];
    if (resetPage) page = 0;
    renderBody();
    if (saved) {
      wrap.scrollTop = saved.top;
      wrap.scrollLeft = saved.left;
      if (saved.sp && saved.sp.scrollTop !== saved.spTop) saved.sp.scrollTop = saved.spTop;
      restoreFocus(saved.focus);
      updateScrollEdges();
    }
    if (before) {
      tbody.querySelectorAll('tr[data-key]').forEach((tr) => {
        const k = tr.getAttribute('data-key');
        const row = data.find((r) => keyOf(r) === k);
        if (row && before.get(k) !== signature(row)) motion.flash(tr);
      });
    }
  }

  function toggleSort(key) {
    if (sortKey === key) sortDir = sortDir === 'asc' ? 'desc' : 'asc';
    else { sortKey = key; sortDir = 'asc'; }
    page = 0;
    paintHead(); renderBody();
  }

  /* ---- overflow affordance + auto page size (measured) ---- */
  let ro = null;
  let wasConnected = false;
  let measureRaf = 0;
  function updateScrollEdges() {
    const sl = Math.abs(wrap.scrollLeft);
    const max = wrap.scrollWidth - wrap.clientWidth;
    wrap.classList.toggle('is-scroll-start', sl <= 1);
    wrap.classList.toggle('is-scroll-end', max - sl <= 1);
  }
  function updateOverflow() {
    const over = wrap.scrollWidth > wrap.clientWidth + 1;
    wrap.classList.toggle('is-overflowing', over);
    updateScrollEdges();
  }
  function fitRows() {
    if (!autoFit || !wrap.isConnected || table.hidden) return;
    const firstRow = tbody.querySelector('tr');
    const rowH = (firstRow && firstRow.getBoundingClientRect().height) || (dense ? 31 : 41);
    const headH = thead.getBoundingClientRect().height || 37;
    const total = data.length;
    const pagerH = pager.hidden ? (total > size ? 41 : 0) : (pager.getBoundingClientRect().height || 41);
    let fit = Math.floor((maxH - headH - pagerH - 2) / Math.max(16, rowH));
    fit = Math.max(3, Math.min(500, fit));
    if (fit !== size) { size = fit; page = Math.min(page, Math.max(0, Math.ceil(total / size) - 1)); renderBody(); }
  }
  function measure() {
    measureRaf = 0;
    if (!wrap.isConnected) { if (wasConnected) destroy(); return; }
    wasConnected = true;
    updateOverflow();
    fitRows();
  }
  function scheduleMeasure() {
    if (measureRaf || typeof requestAnimationFrame !== 'function') return;
    measureRaf = requestAnimationFrame(measure);
  }
  if (typeof ResizeObserver === 'function') {
    ro = new ResizeObserver(() => scheduleMeasure());
    ro.observe(wrap);
    ro.observe(table);
  } else {
    window.addEventListener('resize', scheduleMeasure);
  }
  wrap.addEventListener('scroll', updateScrollEdges, { passive: true });
  function destroy() {
    if (ro) { ro.disconnect(); ro = null; }
    window.removeEventListener('resize', scheduleMeasure);
    if (measureRaf) { cancelAnimationFrame(measureRaf); measureRaf = 0; }
  }

  paintHead();
  renderBody();

  return {
    el: wrap,
    table,
    update,
    getState,
    setState,
    setSort(key, dir = 'asc') { sortKey = key; sortDir = dir === 'desc' ? 'desc' : 'asc'; page = 0; paintHead(); renderBody(); },
    setPage(p) { page = Math.max(0, p | 0); renderBody(); },
    setPageSize(n) { size = Math.max(0, Number(n) | 0); page = 0; renderBody(); },
    destroy,
    get rows() { return data; },
    get pageSize() { return size; },
  };
}

/** Rows that fit a given block size before the table is measured (header ≈ 37px, pager ≈ 41px). */
function estimateRows(maxH, dense) {
  const rowH = dense ? 31 : 41;
  return Math.max(3, Math.min(500, Math.floor((maxH - 37 - 41) / rowH)));
}

/* ------------------------------------------------------------------ */
/* Forms                                                               */
/* ------------------------------------------------------------------ */

export function formField({ label, name, type = 'text', value = '', options = [], required = false, hint = '', placeholder = '', min = null, max = null, step = null, rows = 3, disabled = false, autocomplete = 'off' } = {}) {
  const id = uid(`f-${String(name || 'field').replace(/[^\w-]/g, '')}`);
  const hintId = hint ? `${id}-hint` : null;
  const wrap = h('div', { class: ['field', `field-${type}`, required ? 'is-required' : null], 'data-name': name });
  const lab = h('label', { class: 'field-label', for: id }, String(label ?? ''));
  if (required) lab.appendChild(h('span', { class: 'field-req', 'aria-hidden': 'true' }, ' *'));
  wrap.appendChild(lab);

  let control;
  const common = { id, name, class: 'field-control', required: !!required, disabled: !!disabled, 'aria-describedby': hintId || undefined, 'aria-required': required ? 'true' : undefined };
  if (type === 'select') {
    control = h('select', common);
    if (placeholder) control.appendChild(h('option', { value: '', disabled: true, selected: value === '' || value === null || value === undefined }, String(placeholder)));
    (options || []).forEach((opt) => {
      const o = typeof opt === 'object' && opt !== null ? opt : { value: opt, label: String(opt) };
      const optEl = h('option', { value: String(o.value) }, String(o.label ?? o.value));
      if (String(o.value) === String(value)) optEl.selected = true;
      control.appendChild(optEl);
    });
  } else if (type === 'textarea') {
    control = h('textarea', { ...common, rows: String(rows), placeholder: placeholder || undefined });
    control.value = value === null || value === undefined ? '' : String(value);
  } else if (type === 'checkbox') {
    control = h('input', { ...common, type: 'checkbox' });
    control.checked = !!value;
    wrap.classList.add('is-inline');
  } else {
    control = h('input', { ...common, type, placeholder: placeholder || undefined, autocomplete, min: min ?? undefined, max: max ?? undefined, step: step ?? undefined, inputmode: type === 'number' ? 'decimal' : undefined, dir: ['url', 'password', 'email', 'number', 'datetime-local', 'date', 'time'].includes(type) ? 'ltr' : undefined });
    control.value = value === null || value === undefined ? '' : String(value);
  }
  wrap.appendChild(control);
  if (hint) wrap.appendChild(h('p', { class: 'field-hint', id: hintId }, String(hint)));
  return wrap;
}

export function readForm(formEl) {
  const out = {};
  if (!formEl) return out;
  const fd = new FormData(formEl);
  for (const [key, raw] of fd.entries()) {
    const control = formEl.elements.namedItem(key);
    const input = control instanceof RadioNodeList ? null : control;
    let val = raw;
    if (input && input.type === 'number') val = raw === '' ? null : Number(raw);
    if (key in out) { out[key] = Array.isArray(out[key]) ? [...out[key], val] : [out[key], val]; }
    else out[key] = val;
  }
  Array.from(formEl.querySelectorAll('input[type="checkbox"][name]')).forEach((cb) => {
    if (cb.value === 'on' || !cb.hasAttribute('value')) out[cb.name] = cb.checked;
  });
  return out;
}

/* ------------------------------------------------------------------ */
/* Empty state, progress, key/value                                    */
/* ------------------------------------------------------------------ */

export function emptyState({ icon = null, title = '', text = '', action = null } = {}) {
  const el = h('div', { class: 'empty', role: 'status' });
  const ic = iconNode(icon, 32) || glyph('empty', 32);
  el.appendChild(h('div', { class: 'empty-icon', 'aria-hidden': 'true' }, ic));
  if (title) el.appendChild(h('p', { class: 'empty-title' }, String(title)));
  if (text) el.appendChild(h('p', { class: 'empty-text' }, String(text)));
  if (action) {
    const node = action instanceof Node ? action : (typeof action === 'object' ? button(action.label, { variant: action.variant || 'outline', size: 'sm', icon: action.icon || null, onClick: action.onClick }) : null);
    if (node) el.appendChild(h('div', { class: 'empty-action' }, node));
  }
  return el;
}

/* ------------------------------------------------------------------ */
/* Data states: loading, error, offline, skeleton (spec AC-12)          */
/* ------------------------------------------------------------------ */

/**
 * Placeholder lines for content that is still loading (decorative: aria-hidden). CSS (.skeleton,
 * .skeleton-line) draws the shimmer and drops it under reduced motion.
 * @param {number} lines
 * @param {{widths?: string[], className?: string}} [opts]
 */
export function skeleton(lines = 3, { widths = null, className = '' } = {}) {
  const n = Math.max(1, Math.min(24, Number(lines) | 0 || 3));
  const el = h('div', { class: ['skeleton', className || null], 'aria-hidden': 'true' });
  for (let i = 0; i < n; i += 1) {
    const w = Array.isArray(widths) && widths[i] ? widths[i] : null;   // default widths come from CSS (nth-child)
    el.appendChild(h('span', { class: 'skeleton-line', style: w ? { inlineSize: w } : undefined }));
  }
  return el;
}

/* .state[.state-loading|.state-error|.state-offline] > .state-icon + .state-title + .state-text + .state-actions */
function stateShell(kind, { role, icon, title, text, live = null }) {
  const el = h('div', { class: ['state', `state-${kind}`], role, 'aria-live': live || undefined });
  if (icon) el.appendChild(h('div', { class: 'state-icon', 'aria-hidden': 'true' }, icon));
  if (title) el.appendChild(h('p', { class: 'state-title' }, String(title)));
  if (text) el.appendChild(h('p', { class: 'state-text' }, String(text)));
  return el;
}

/**
 * Loading state. With `onCancel` a cancel button is offered (long imports / network calls); the
 * callback runs once and the state then reads "Cancelled" until the caller replaces it.
 * @param {{title?:string, text?:string, lines?:number, onCancel?:Function, inline?:boolean}} [opts]
 */
export function loadingState({ title = null, text = null, lines = 0, onCancel = null, inline = false } = {}) {
  const spinner = h('span', { class: 'spinner' });
  const el = stateShell('loading', { role: 'status', icon: spinner, title: title || t('ui.state.loading'), text: text === null ? (inline ? '' : t('ui.state.loadingText')) : text, live: 'polite' });
  el.setAttribute('aria-busy', 'true');
  if (inline) el.classList.add('is-inline');
  if (lines > 0) el.appendChild(skeleton(lines));
  if (typeof onCancel === 'function') {
    const btn = button(t('ui.cancel'), {
      variant: 'ghost', size: 'sm', icon: glyph('close', 15),
      onClick: () => {
        btn.disabled = true;
        el.removeAttribute('aria-busy');
        el.classList.add('is-cancelled');
        const titleEl = el.querySelector('.state-title');
        if (titleEl) titleEl.textContent = t('ui.state.cancelled');
        try { onCancel(); } catch { /* the caller owns the cancellation */ }
      },
      attrs: { class: 'state-action' },
    });
    el.appendChild(h('div', { class: 'state-actions' }, btn));
  }
  return el;
}

/**
 * Error state with an optional retry. `retry` may return a promise: the button shows a busy state
 * until it settles (the caller then replaces the state). Messages never claim success.
 * @param {{title?:string, text?:string, retry?:Function, retryLabel?:string, detail?:string}} [opts]
 */
export function errorState({ title = null, text = null, retry = null, retryLabel = null, detail = null } = {}) {
  const el = stateShell('error', { role: 'alert', icon: glyph('critical', 28), title: title || t('ui.state.errorTitle'), text: text || t('ui.state.errorText') });
  if (detail) {
    el.appendChild(h('p', { class: 'state-detail mono', dir: 'auto' }, String(detail)));
  }
  if (typeof retry === 'function') {
    const label = retryLabel || t('ui.state.retry');
    const btn = button(label, {
      variant: 'outline', size: 'sm', icon: 'refresh',
      onClick: () => {
        let result;
        try { result = retry(); } catch { result = null; }
        if (result && typeof result.then === 'function') {
          btn.disabled = true;
          btn.setAttribute('aria-busy', 'true');
          const lab = btn.querySelector('.btn-label');
          if (lab) lab.textContent = t('ui.state.retrying');
          const restore = () => { btn.disabled = false; btn.removeAttribute('aria-busy'); if (lab) lab.textContent = label; };
          result.then(restore, restore);
        }
      },
      attrs: { class: 'state-action' },
    });
    el.appendChild(h('div', { class: 'state-actions' }, btn));
  }
  return el;
}

/**
 * Offline state for content that needs the network. Retries automatically once the browser reports
 * it is back online (when `retry` is given), and offers a manual retry.
 * @param {{title?:string, text?:string, retry?:Function}} [opts]
 */
export function offlineState({ title = null, text = null, retry = null } = {}) {
  const el = stateShell('offline', { role: 'status', icon: svgIcon('cloud-off', 28), title: title || t('ui.state.offlineTitle'), text: text || t('ui.state.offlineText'), live: 'polite' });
  if (typeof retry === 'function') {
    el.appendChild(h('div', { class: 'state-actions' }, button(t('ui.state.retry'), { variant: 'outline', size: 'sm', icon: 'refresh', onClick: () => { try { retry(); } catch { /* caller handles */ } }, attrs: { class: 'state-action' } })));
    const onOnline = () => {
      window.removeEventListener('online', onOnline);
      if (el.isConnected) { try { retry(); } catch { /* caller handles */ } }
    };
    window.addEventListener('online', onOnline);
  }
  return el;
}

/* ------------------------------------------------------------------ */
/* Filter bar (CONTRACT §7)                                            */
/* ------------------------------------------------------------------ */

const sameValue = (a, b) => {
  if (Array.isArray(a) || Array.isArray(b)) {
    const x = Array.isArray(a) ? a.map(String).sort() : [];
    const y = Array.isArray(b) ? b.map(String).sort() : [];
    return x.length === y.length && x.every((v, i) => v === y[i]);
  }
  return String(a ?? '') === String(b ?? '');
};

/**
 * One organised row of filters above the content it filters.
 *   filters: [{ id, type: 'chips'|'select'|'segmented'|'search', label, options: [{ value, label, count?, icon?, tone? }],
 *              defaultValue?, placeholder?, allOption? (select: prepend "All", default true), allValue? ('all'),
 *              allChip? (chips: leading "All" chip, default true), hideLabel? }]
 *   chips are multi-select (value = array, [] = all); select / segmented hold one value; search holds text.
 *   value: initial values { [id]: value }; onChange(values, { id, reset }); onReset().
 * Returns { el, set(values, { emit }), get(), reset(), activeCount() }. Shows the active-filter count
 * (polite live region) and a reset button that is enabled only while something is filtered.
 */
export function filterBar({ filters = [], value = {}, onChange = null, onReset = null, label = null, className = '' } = {}) {
  const defs = (Array.isArray(filters) ? filters : []).filter((f) => f && f.id !== undefined && f.id !== null);
  // Flat structure (css/components.css): .filter-bar > .filter-bar-group* + .filter-bar-search
  //   + .filter-bar-spacer + .filter-bar-count + .filter-bar-reset
  const el = h('div', { class: ['filter-bar', className || null], role: 'group', 'aria-label': label || t('ui.filter.label') });
  const spacer = h('span', { class: 'filter-bar-spacer', 'aria-hidden': 'true' });
  const countEl = h('span', { class: 'filter-bar-count', 'aria-live': 'polite' });
  const resetBtn = button(t('ui.filter.reset'), { variant: 'ghost', size: 'sm', icon: 'refresh', onClick: () => reset(), attrs: { class: 'filter-bar-reset', 'aria-label': t('ui.filter.resetAria') } });

  const state = {};
  const slots = new Map();
  const optionsOf = (f) => (Array.isArray(f.options) ? f.options : []).map((o) => (o && typeof o === 'object' ? o : { value: o, label: String(o) }));
  const defaultOf = (f) => {
    if (f.defaultValue !== undefined) return Array.isArray(f.defaultValue) ? f.defaultValue.slice() : f.defaultValue;
    if (f.type === 'chips') return [];
    if (f.type === 'search') return '';
    if (f.type === 'select') return f.allOption === false ? (optionsOf(f)[0] ? optionsOf(f)[0].value : '') : (f.allValue ?? 'all');
    const first = optionsOf(f)[0];
    return first ? first.value : '';
  };

  function emit(id, extra = {}) {
    paintMeta();
    if (typeof onChange === 'function') { try { onChange(get(), { id, ...extra }); } catch { /* views own their errors */ } }
  }

  defs.forEach((f) => {
    const id = String(f.id);
    const type = ['chips', 'select', 'segmented', 'search'].includes(f.type) ? f.type : 'select';
    const fieldId = uid(`flt-${id.replace(/[^\w-]/g, '')}`);
    const labelId = `${fieldId}-label`;
    const wrap = h('div', { class: type === 'search' ? ['filter-bar-search'] : ['filter-bar-group', 'filter-group', `is-${type}`], 'data-filter': id, 'data-type': type });
    const labelText = String(f.label ?? '');
    const showLabel = labelText && !f.hideLabel && type !== 'search';
    if (showLabel) wrap.appendChild(h(type === 'select' ? 'label' : 'span', { class: ['filter-bar-label', 'filter-label'], id: labelId, for: type === 'select' ? fieldId : undefined }, labelText));
    state[id] = value && value[id] !== undefined ? (Array.isArray(value[id]) ? value[id].slice() : value[id]) : defaultOf(f);
    let slot;

    if (type === 'chips') {
      const group = h('div', { class: 'chip-group', role: 'group', 'aria-labelledby': showLabel ? labelId : undefined, 'aria-label': showLabel ? undefined : labelText || undefined });
      const chips = new Map();
      const paint = () => {
        const sel0 = Array.isArray(state[id]) ? state[id].map(String) : [];
        for (const [v, b] of chips) {
          const on = v === '__all__' ? sel0.length === 0 : sel0.includes(v);
          b.setAttribute('aria-pressed', on ? 'true' : 'false');
          b.classList.toggle('is-active', on);
        }
      };
      const addChip = (v, text, extra = {}) => {
        const b = h('button', { type: 'button', class: ['chip', extra.tone ? `tone-${toneOf(extra.tone)}` : null], 'aria-pressed': 'false', 'data-value': v });
        const ic = iconNode(extra.icon, 14); if (ic) b.appendChild(ic);
        b.appendChild(h('span', { class: 'chip-label' }, String(text)));
        if (extra.count !== undefined && extra.count !== null) b.appendChild(h('span', { class: 'chip-count' }, typeof extra.count === 'number' ? fmt.num(extra.count) : String(extra.count)));
        b.addEventListener('click', () => {
          if (v === '__all__') state[id] = [];
          else {
            const cur = new Set((Array.isArray(state[id]) ? state[id] : []).map(String));
            if (cur.has(v)) cur.delete(v); else cur.add(v);
            const original = optionsOf(f).map((o) => o.value);
            state[id] = original.filter((ov) => cur.has(String(ov)));
          }
          paint();
          emit(id);
        });
        chips.set(v, b);
        group.appendChild(b);
      };
      if (f.allChip !== false) addChip('__all__', t('ui.filter.all'));
      optionsOf(f).forEach((o) => addChip(String(o.value), o.label ?? o.value, o));
      wrap.appendChild(group);
      slot = { paint };
    } else if (type === 'select') {
      const control = h('select', { id: fieldId, class: ['field-control', 'filter-select'], 'aria-label': showLabel ? undefined : labelText || undefined });
      const opts = optionsOf(f);
      if (f.allOption !== false) control.appendChild(h('option', { value: String(f.allValue ?? 'all') }, t('ui.filter.all')));
      opts.forEach((o) => control.appendChild(h('option', { value: String(o.value) }, String(o.label ?? o.value))));
      const paint = () => { control.value = String(state[id] ?? ''); };
      control.addEventListener('change', () => {
        const match = opts.find((o) => String(o.value) === control.value);
        state[id] = match ? match.value : control.value;
        emit(id);
      });
      wrap.appendChild(control);
      slot = { paint };
    } else if (type === 'segmented') {
      const seg = segmented({
        options: optionsOf(f).map((o) => ({ value: o.value, label: o.label ?? o.value, icon: o.icon })),
        value: state[id], ariaLabel: labelText,
        onChange: (v) => { state[id] = v; emit(id); },
      });
      seg.el.classList.add('seg-sm');
      if (showLabel) { seg.el.removeAttribute('aria-label'); seg.el.setAttribute('aria-labelledby', labelId); }
      wrap.appendChild(seg.el);
      slot = { paint: () => seg.set(state[id]) };
    } else {
      const input = h('input', { id: fieldId, type: 'search', class: ['field-control', 'filter-search-input'], 'aria-label': labelText || t('ui.filter.search'), placeholder: f.placeholder || labelText || t('ui.filter.search'), autocomplete: 'off', spellcheck: 'false', enterkeyhint: 'search' });
      let timer = 0;
      const commit = () => { clearTimeout(timer); timer = 0; if (state[id] !== input.value) { state[id] = input.value; emit(id); } };
      input.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(commit, 180); });
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); commit(); }
        else if (e.key === 'Escape' && input.value) { e.preventDefault(); e.stopPropagation(); input.value = ''; commit(); }
      });
      input.addEventListener('search', commit);
      wrap.appendChild(input);
      slot = { paint: () => { if (input.value !== String(state[id] ?? '')) input.value = String(state[id] ?? ''); } };
    }
    slot.def = f;
    slot.wrap = wrap;
    slots.set(id, slot);
    el.appendChild(wrap);
  });
  el.append(spacer, countEl, resetBtn);

  function activeCount() {
    let n = 0;
    for (const [id, slot] of slots) {
      const v = state[id];
      const d = defaultOf(slot.def);
      if (slot.def.type === 'chips' ? (Array.isArray(v) && v.length > 0 && !sameValue(v, d)) : !sameValue(typeof v === 'string' ? v.trim() : v, d)) n += 1;
    }
    return n;
  }
  function paintMeta() {
    const n = activeCount();
    countEl.textContent = n ? tn('ui.filter.active', n) : '';
    countEl.dataset.count = String(n);
    countEl.hidden = n === 0;
    resetBtn.disabled = n === 0;
    el.classList.toggle('has-active', n > 0);
    el.dataset.active = String(n);
    for (const [id, slot] of slots) {
      const d = defaultOf(slot.def);
      const v = state[id];
      slot.wrap.classList.toggle('is-active', slot.def.type === 'chips' ? Array.isArray(v) && v.length > 0 : !sameValue(v, d));
    }
  }
  function get() {
    const out = {};
    for (const id of slots.keys()) out[id] = Array.isArray(state[id]) ? state[id].slice() : state[id];
    return out;
  }
  function set(values = {}, { emit: fire = false } = {}) {
    if (!values || typeof values !== 'object') return api;
    for (const [id, slot] of slots) {
      if (values[id] === undefined) continue;
      state[id] = Array.isArray(values[id]) ? values[id].slice() : values[id];
      slot.paint();
    }
    paintMeta();
    if (fire && typeof onChange === 'function') { try { onChange(get(), { id: null }); } catch { /* noop */ } }
    return api;
  }
  function reset() {
    for (const [id, slot] of slots) { state[id] = defaultOf(slot.def); slot.paint(); }
    if (typeof onReset === 'function') { try { onReset(); } catch { /* noop */ } }
    emit(null, { reset: true });
    const first = el.querySelector('.filter-bar-group button, .filter-bar-group select, .filter-bar-search input');
    if (first && document.activeElement === resetBtn) { try { first.focus({ preventScroll: true }); } catch { first.focus(); } }
    return api;
  }

  for (const slot of slots.values()) slot.paint();
  paintMeta();
  const api = { el, set, get, reset, activeCount };
  return api;
}

export function progress({ value = 0, max = 100, tone = null, label = '' } = {}) {
  const v = Math.max(0, Math.min(max, Number(value) || 0));
  const pct = max > 0 ? (v / max) * 100 : 0;
  const el = h('div', {
    class: ['progress', tone ? `tone-${toneOf(tone)}` : null], role: 'progressbar',
    'aria-valuemin': '0', 'aria-valuemax': String(max), 'aria-valuenow': String(v),
    'aria-label': label || undefined, 'aria-valuetext': fmt.pct(pct, 0),
  });
  el.appendChild(h('div', { class: 'progress-bar', style: { inlineSize: `${pct.toFixed(1)}%` } }));
  el.update = (nv) => {
    const nn = Math.max(0, Math.min(max, Number(nv) || 0));
    const np = max > 0 ? (nn / max) * 100 : 0;
    el.setAttribute('aria-valuenow', String(nn));
    el.setAttribute('aria-valuetext', fmt.pct(np, 0));
    el.firstChild.style.inlineSize = `${np.toFixed(1)}%`;
  };
  return el;
}

export function kv(pairs = []) {
  const dl = h('dl', { class: 'kv' });
  (pairs || []).forEach((pair) => {
    if (!pair) return;
    const [label, value] = Array.isArray(pair) ? pair : [pair.label, pair.value];
    const row = h('div', { class: 'kv-row' });
    row.appendChild(h('dt', {}, String(label ?? '')));
    const dd = h('dd');
    appendChild(dd, value === null || value === undefined || value === '' ? '—' : value);
    row.appendChild(dd);
    dl.appendChild(row);
  });
  return dl;
}

/* ------------------------------------------------------------------ */
/* Overlays: focus trap, modal, drawer, menu                            */
/* ------------------------------------------------------------------ */

function overlayHost() {
  return document.getElementById('modals') || document.body;
}

function focusables(root) {
  // Roving-tabindex children (tabindex="-1": inactive tabs, chart marks) are not tab stops.
  return Array.from(root.querySelectorAll(FOCUSABLE)).filter((n) => ((!n.hasAttribute('hidden') && n.getClientRects().length > 0 && n.tabIndex >= 0) || n === document.activeElement));
}

/** Last active tab per drawer kind (CONTRACT §7: "remembers the last tab per kind"). In-memory only. */
const lastDrawerTab = new Map();

/**
 * Shared overlay behaviour: focus trap, Esc closes, backdrop click closes, focus restore (without
 * scrolling the page), inert shell. Drawers slide with motion.drawer() when motion is enabled and may
 * carry ARIA tabs (`tabs`), rendered lazily, with per-tab scroll memory while the drawer is open.
 */
function overlay({ kind, title, subtitle = '', body, actions = [], size = 'md', onClose = null, tabs = null, activeTab = null, tabsKind = null, returnFocus = null, className = '' }) {
  const isModal = kind === 'modal';
  const backdrop = h('div', { class: isModal ? 'modal-backdrop' : 'drawer-backdrop', role: 'presentation', 'data-size': size });
  const titleId = uid(`${kind}-title`);
  const dialog = h('dialog', { class: [kind, `is-${size}`, className || null], 'aria-labelledby': title ? titleId : undefined, 'aria-modal': 'true' });
  backdrop.appendChild(dialog);

  const head = h('header', { class: `${kind}-head` });
  const headText = h('div', { class: `${kind}-titles` });
  const titleEl = title ? h('h2', { class: `${kind}-title`, id: titleId }, String(title)) : null;
  const subEl = subtitle ? h('p', { class: `${kind}-sub` }, String(subtitle)) : null;
  if (titleEl) headText.appendChild(titleEl);
  if (subEl) headText.appendChild(subEl);
  head.appendChild(headText);
  const closeBtn = button('', { variant: 'ghost', size: 'sm', icon: glyph('close', 18), onClick: () => api.close('close'), attrs: { 'aria-label': t('ui.close'), class: `${kind}-close` } });
  head.appendChild(closeBtn);
  dialog.appendChild(head);

  const bodyEl = h('div', { class: `${kind}-body` });

  /* ---- tabs (drawer only) ---- */
  const tabItems = !isModal && Array.isArray(tabs) ? tabs.filter((tb) => tb && tb.id !== undefined && tb.id !== null) : [];
  const tabMap = new Map();
  let currentTab = null;
  const tabScroll = new Map();
  let tabList = null;
  if (tabItems.length) {
    dialog.classList.add('has-tabs');
    tabList = h('div', { class: 'drawer-tabs', role: 'tablist', 'aria-label': title ? String(title) : t('ui.drawer.tabs') });
    tabItems.forEach((item) => {
      const id = String(item.id);
      const tabId = uid('dtab');
      const panelId = uid('dpanel');
      const tab = h('button', {
        type: 'button', class: 'drawer-tab', role: 'tab', id: tabId, 'aria-controls': panelId,
        'aria-selected': 'false', tabindex: '-1', 'data-tab': id, onClick: () => setTab(id, { focus: false }),
      });
      const ic = iconNode(item.icon, 15); if (ic) tab.appendChild(ic);
      tab.appendChild(h('span', { class: 'drawer-tab-label' }, String(item.label ?? id)));
      if (item.count !== undefined && item.count !== null && item.count !== '') {
        tab.appendChild(h('span', { class: 'drawer-tab-count' }, typeof item.count === 'number' ? fmt.num(item.count) : String(item.count)));
      }
      const panel = h('div', { class: 'drawer-panel', role: 'tabpanel', id: panelId, 'aria-labelledby': tabId, hidden: true, tabindex: '0', 'data-tab': id });
      tabMap.set(id, { tab, panel, item, rendered: false });
      tabList.appendChild(tab);
    });
    tabList.addEventListener('keydown', (e) => {
      const keys = inlineKeys();
      if (![keys.next, keys.prev, 'Home', 'End'].includes(e.key)) return;
      const ids = Array.from(tabMap.keys());
      let idx = ids.indexOf(currentTab);
      if (e.key === keys.next) idx = (idx + 1) % ids.length;
      else if (e.key === keys.prev) idx = (idx - 1 + ids.length) % ids.length;
      else if (e.key === 'Home') idx = 0;
      else idx = ids.length - 1;
      e.preventDefault();
      setTab(ids[idx], { focus: true });
    });
    dialog.appendChild(tabList);
  }

  appendChild(bodyEl, resolveBody(body, bodyEl));
  tabMap.forEach(({ panel }) => bodyEl.appendChild(panel));
  dialog.appendChild(bodyEl);

  function renderPanel(id, force = false) {
    const slot = tabMap.get(id);
    if (!slot || (slot.rendered && !force)) return;
    slot.rendered = true;
    clear(slot.panel);
    let content = null;
    try { content = typeof slot.item.render === 'function' ? slot.item.render(slot.panel, api) : slot.item.body ?? null; } catch (err) {
      content = errorState({ text: err && err.message ? String(err.message) : undefined });
    }
    appendChild(slot.panel, content);
  }

  function setTab(id, { focus = false } = {}) {
    const key = id === null || id === undefined ? null : String(id);
    if (!tabMap.has(key)) return api;
    if (currentTab !== null && currentTab !== key) tabScroll.set(currentTab, bodyEl.scrollTop);
    const changed = currentTab !== key;
    currentTab = key;
    for (const [tid, slot] of tabMap) {
      const on = tid === key;
      slot.tab.setAttribute('aria-selected', on ? 'true' : 'false');
      slot.tab.tabIndex = on ? 0 : -1;
      slot.tab.classList.toggle('is-active', on);
      slot.panel.hidden = !on;
    }
    renderPanel(key);
    if (changed) bodyEl.scrollTop = tabScroll.get(key) || 0;
    if (tabsKind) lastDrawerTab.set(String(tabsKind), key);
    if (focus) tabMap.get(key).tab.focus();
    if (changed && typeof api.onTabChange === 'function') { try { api.onTabChange(key); } catch { /* never break the drawer */ } }
    return api;
  }

  let foot = null;
  if (actions && actions.length) {
    foot = h('footer', { class: `${kind}-foot` });
    actions.forEach((a) => {
      if (!a) return;
      if (a instanceof Node) { foot.appendChild(a); return; }
      const btn = button(a.label, {
        variant: a.variant || 'primary', icon: a.icon || null, size: a.size || 'md',
        onClick: (e) => {
          if (typeof a.onClick === 'function') {
            const result = a.onClick(api, e);
            if (result === false) return;
            if (result && typeof result.then === 'function') {
              btn.disabled = true; btn.setAttribute('aria-busy', 'true');
              result.then((r) => { if (r !== false && a.closes !== false) api.close('action'); }).catch(() => {}).finally(() => { btn.disabled = false; btn.removeAttribute('aria-busy'); });
              return;
            }
          }
          if (a.closes !== false) api.close('action');
        },
        attrs: a.attrs || {},
      });
      foot.appendChild(btn);
    });
    dialog.appendChild(foot);
  }

  let previouslyFocused = null;
  let isOpen = false;
  let closing = false;
  const inerted = [];

  function onKeydown(e) {
    if (e.key === 'Escape') { e.stopPropagation(); e.preventDefault(); api.close('escape'); return; }
    if (e.key !== 'Tab') return;
    const list = focusables(dialog);
    if (!list.length) { e.preventDefault(); dialog.focus(); return; }
    const first = list[0]; const last = list[list.length - 1];
    if (e.shiftKey && (document.activeElement === first || !dialog.contains(document.activeElement))) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }
  function onBackdropClick(e) { if (e.target === backdrop) api.close('backdrop'); }
  function onCancel(e) { e.preventDefault(); api.close('escape'); }

  const api = {
    el: dialog,
    backdrop,
    body: bodyEl,
    foot,
    isOpen: () => isOpen,
    open() {
      if (isOpen || closing) return api;
      isOpen = true;
      previouslyFocused = document.activeElement;
      overlayHost().appendChild(backdrop);
      // Dock the toast stack inside this dialog before the page goes inert (see dockToasts()).
      openDialogs.push(dialog);
      dialogApis.set(dialog, api);
      bindStrayEscape();
      dockToasts();
      Array.from(document.body.children).forEach((child) => {
        if (child === backdrop || child.contains(backdrop) || child.tagName === 'SCRIPT' || child.id === 'toasts') return;
        if (!child.inert) { child.inert = true; inerted.push(child); }
      });
      document.body.classList.add(`has-${kind}`);
      try { dialog.show(); } catch { dialog.setAttribute('open', ''); }
      dialog.tabIndex = -1;
      backdrop.addEventListener('keydown', onKeydown);
      backdrop.addEventListener('click', onBackdropClick);
      dialog.addEventListener('cancel', onCancel);
      // Drawers: Motion drives the panel (CSS transition suspended for the run); modals keep their CSS transition.
      if (!isModal) motion.drawer(dialog, true);
      requestAnimationFrame(() => {
        backdrop.classList.add('is-open');
        // Tabbed drawers land on the selected tab (announces "Overview, tab 1 of 4"); others on the first control.
        const selectedTab = currentTab !== null && tabMap.get(currentTab) ? tabMap.get(currentTab).tab : null;
        const list = focusables(dialog).filter((n) => !n.classList.contains(`${kind}-close`) && !n.classList.contains('drawer-panel') && !n.closest('.toast-stack'));
        const target = selectedTab || list[0] || closeBtn;
        try { target.focus({ preventScroll: true }); } catch { target.focus(); }
      });
      return api;
    },
    close(reason = 'close') {
      if (!isOpen || closing) return api;
      isOpen = false;
      closing = true;
      backdrop.removeEventListener('keydown', onKeydown);
      backdrop.removeEventListener('click', onBackdropClick);
      dialog.removeEventListener('cancel', onCancel);
      inerted.splice(0).forEach((n) => { n.inert = false; });
      const at = openDialogs.indexOf(dialog);
      if (at >= 0) openDialogs.splice(at, 1);
      dockToasts();
      document.body.classList.remove(`has-${kind}`);
      const animated = !isModal && motion.enabled();
      const slide = animated ? motion.drawer(dialog, false) : null;
      backdrop.classList.remove('is-open');
      backdrop.classList.add('is-closing');
      const finish = () => {
        closing = false;
        try { dialog.close(); } catch { dialog.removeAttribute('open'); }
        backdrop.remove();
        backdrop.classList.remove('is-closing');
        const back = returnFocus && returnFocus.isConnected ? returnFocus : previouslyFocused;
        if (back && typeof back.focus === 'function' && document.contains(back)) {
          try { back.focus({ preventScroll: true }); } catch { back.focus(); }
        }
        if (typeof onClose === 'function') onClose(reason);
      };
      if (slide) slide.then(finish);
      else if (reducedMotion()) finish();
      else setTimeout(finish, 200);
      return api;
    },
    setTitle(text) { if (titleEl) titleEl.textContent = String(text); },
    setSubtitle(text) { if (subEl) subEl.textContent = String(text); },
    setTab,
    /** Re-render one tab panel (or the active one) after its data changed; keeps the panel's scroll. */
    refreshTab(id = currentTab) {
      const key = id === null || id === undefined ? null : String(id);
      if (!tabMap.has(key)) return api;
      const keep = key === currentTab ? bodyEl.scrollTop : null;
      if (key === currentTab) { renderPanel(key, true); if (keep !== null) bodyEl.scrollTop = keep; } else tabMap.get(key).rendered = false;
      return api;
    },
    /** Update a tab's count chip (e.g. evidence items). */
    setTabCount(id, count) {
      const slot = tabMap.get(String(id));
      if (!slot) return api;
      let chip = slot.tab.querySelector('.drawer-tab-count');
      if (count === null || count === undefined || count === '') { if (chip) chip.remove(); return api; }
      if (!chip) { chip = h('span', { class: 'drawer-tab-count' }); slot.tab.appendChild(chip); }
      chip.textContent = typeof count === 'number' ? fmt.num(count) : String(count);
      return api;
    },
    panel(id) { const slot = tabMap.get(String(id)); return slot ? slot.panel : null; },
    get activeTab() { return currentTab; },
    onTabChange: null,
  };

  // Initial tab: explicit activeTab → remembered for this kind → first (after `api` exists: render(panel, api)).
  if (tabMap.size) {
    const remembered = tabsKind ? lastDrawerTab.get(String(tabsKind)) : null;
    const first = tabMap.keys().next().value;
    const initial = [activeTab, remembered, first].map((v) => (v === null || v === undefined ? null : String(v))).find((v) => v !== null && tabMap.has(v));
    setTab(initial);
  }
  return api;
}

export function modal({ title = '', subtitle = '', body = null, actions = [], size = 'md', onClose = null, returnFocus = null } = {}) {
  return overlay({ kind: 'modal', title, subtitle, body, actions, size: size === 'lg' ? 'lg' : (size === 'sm' ? 'sm' : 'md'), onClose, returnFocus });
}

/**
 * Side drawer (inline-end edge). CONTRACT §7:
 *   drawer({ title, subtitle, tabs: [{ id, label, render(panel, api), icon?, count? }], activeTab, actions,
 *            size: 'md'|'lg'|'xl', onClose(reason), returnFocus, kind, body, onTabChange })
 *   → { open, close, el, body, setTab(id), refreshTab(id), setTabCount(id, n), panel(id), activeTab, setTitle, setSubtitle }
 * `kind` (e.g. 'airisk') remembers the last tab across drawers of that kind; an explicit activeTab wins.
 * `body` (optional) renders above the tab panels. Focus returns to `returnFocus` (default: the element
 * focused before opening) without scrolling, so closing keeps the reader's place.
 */
export function drawer({ title = '', subtitle = '', body = null, tabs = null, activeTab = null, actions = [], size = 'md', onClose = null, returnFocus = null, kind = null, onTabChange = null, className = '' } = {}) {
  const api = overlay({ kind: 'drawer', title, subtitle, body, tabs, activeTab, tabsKind: kind, actions, size: ['lg', 'xl'].includes(size) ? size : 'md', onClose, returnFocus, className });
  if (typeof onTabChange === 'function') api.onTabChange = onTabChange;
  return api;
}

/** Lightweight anchored menu (used by kanban "نقل إلى" and available for views). */
export function menu(anchor, items = [], { ariaLabel = null } = {}) {
  if (!ariaLabel) ariaLabel = t('ui.menu.label');
  const existing = document.querySelector('.menu.is-open');
  if (existing && existing.__close) existing.__close();
  const el = h('div', { class: 'menu is-open', role: 'menu', 'aria-label': ariaLabel });
  const list = [];
  items.forEach((it) => {
    if (!it) return;
    if (it.separator) { el.appendChild(h('div', { class: 'menu-sep', role: 'separator' })); return; }
    const b = h('button', { type: 'button', class: ['menu-item', it.tone ? `tone-${toneOf(it.tone)}` : null], role: 'menuitem', tabindex: '-1', disabled: !!it.disabled,
      onClick: () => { close(); if (typeof it.onClick === 'function') it.onClick(); } });
    const ic = iconNode(it.icon, 15); if (ic) b.appendChild(ic);
    b.appendChild(h('span', {}, String(it.label)));
    el.appendChild(b); list.push(b);
  });
  const host = overlayHost();
  host.appendChild(el);
  const rect = anchor.getBoundingClientRect();
  el.style.position = 'fixed';
  el.style.insetBlockStart = `${Math.min(rect.bottom + 6, window.innerHeight - 8)}px`;
  // Align to the anchor's inline-start edge (RTL → right edge).
  const isRtl = (document.documentElement.dir || 'rtl') === 'rtl';
  if (isRtl) el.style.insetInlineStart = `${Math.max(8, window.innerWidth - rect.right)}px`;
  else el.style.insetInlineStart = `${Math.max(8, rect.left)}px`;
  anchor.setAttribute('aria-expanded', 'true');

  function onDoc(e) { if (!el.contains(e.target) && e.target !== anchor) close(); }
  function onKey(e) {
    if (e.key === 'Escape') { e.preventDefault(); close(); anchor.focus(); return; }
    const idx = list.indexOf(document.activeElement);
    if (e.key === 'ArrowDown') { e.preventDefault(); (list[(idx + 1) % list.length] || list[0]).focus(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); (list[(idx - 1 + list.length) % list.length] || list[0]).focus(); }
    else if (e.key === 'Tab') { close(); }
  }
  let closed = false;
  let armTimer = 0;
  let watchTimer = 0;
  const unsubs = [];
  function close() {
    if (closed) return;
    closed = true;
    clearTimeout(armTimer);
    clearInterval(watchTimer);
    unsubs.splice(0).forEach((un) => { try { un(); } catch { /* noop */ } });
    document.removeEventListener('pointerdown', onDoc, true);
    document.removeEventListener('keydown', onKey, true);
    window.removeEventListener('resize', close);
    anchor.setAttribute('aria-expanded', 'false');
    el.remove();
  }
  el.__close = close;
  armTimer = setTimeout(() => {
    if (closed) return;
    document.addEventListener('pointerdown', onDoc, true);
    document.addEventListener('keydown', onKey, true);
    window.addEventListener('resize', close);
  }, 0);
  // Never outlive the view that opened it: close on navigation and when the anchor leaves the DOM.
  unsubs.push(bus.on('route:change', close), bus.on('ui:route-leave', close));
  watchTimer = setInterval(() => { if (!anchor.isConnected || !el.isConnected) close(); }, 300);
  requestAnimationFrame(() => { const first = list.find((b) => !b.disabled); if (first) first.focus(); });
  return { el, close };
}

/* ------------------------------------------------------------------ */
/* Toasts                                                              */
/* ------------------------------------------------------------------ */

/** Open modals / drawers, oldest first (overlay() pushes on open and removes on close). */
const openDialogs = [];
/** Open dialog element → its overlay api (for the Escape fallback). */
const dialogApis = new WeakMap();
let strayEscapeBound = false;

/**
 * Escape fallback. An overlay listens for Escape on its backdrop, so a key pressed after focus has fallen to
 * <body> (the focused node was removed) never reaches it. Such a key closes the topmost open dialog.
 */
function bindStrayEscape() {
  if (strayEscapeBound) return;
  strayEscapeBound = true;
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || e.defaultPrevented) return;
    if (e.target !== document.body && e.target !== document.documentElement) return;
    const top = openDialogs[openDialogs.length - 1];
    const api = top ? dialogApis.get(top) : null;
    if (!api || !api.isOpen()) return;
    e.preventDefault();
    api.close('escape');
  });
}

/** A toast counts as already announced once it has been in the document this long (ms). */
const TOAST_ANNOUNCED_MS = 1000;

/**
 * Moving #toasts re-inserts its toasts, and a re-inserted role=alert / role=status node may be announced again.
 * So before a move, toasts that have been on screen for TOAST_ANNOUNCED_MS lose their live role (they stay
 * visible and their buttons keep working; app.js already does the same for alerts it announces itself).
 * A toast raised just before the move keeps its role and is announced at its new place: for example the
 * "saved" toast of a dialog action that also closes the dialog.
 */
function settleToastRoles(stack) {
  const now = Date.now();
  for (const n of stack.children) {
    if (n.__toastAt && now - n.__toastAt >= TOAST_ANNOUNCED_MS && n.hasAttribute('role')) n.removeAttribute('role');
  }
}

/**
 * While a modal or drawer is open the page behind it is inert, which would also take the toasts out of the
 * accessibility tree, and a floating stack would sit over the dialog's own controls (on a phone the drawer is
 * full width, so there is no free edge). The stack is therefore docked inside the topmost open dialog, in flow
 * between its body and its footer (css: dialog > .toast-stack.is-docked), and returns to its place in <body>
 * when the last dialog closes. The container moves with its toasts; see settleToastRoles() for their roles.
 */
function dockToasts() {
  const stack = document.getElementById('toasts');
  if (!stack) return;
  const top = openDialogs[openDialogs.length - 1] || null;
  if (top && top.isConnected) {
    const foot = Array.from(top.children).find((n) => n.classList && (n.classList.contains('drawer-foot') || n.classList.contains('modal-foot'))) || null;
    if (stack.parentElement !== top || stack.nextElementSibling !== foot) { settleToastRoles(stack); top.insertBefore(stack, foot); }
    stack.classList.add('is-docked');
    stack.inert = false;
    return;
  }
  stack.classList.remove('is-docked');
  if (stack.parentElement === document.body) return;
  settleToastRoles(stack);
  const modals = document.getElementById('modals');
  if (modals && modals.parentElement === document.body) document.body.insertBefore(stack, modals);
  else document.body.appendChild(stack);
}

/** Where focus was before it entered the toast stack (focus goes back there when a focused toast leaves). */
let toastFocusOrigin = null;

function canTakeFocus(n) {
  return !!n && n.isConnected && typeof n.focus === 'function' && !n.disabled && !n.closest('[inert]') && n.getClientRects().length > 0;
}

/**
 * A toast that holds focus is about to leave. Focus moves to the next toast (its action or close button), else
 * back to where it came from (when that is inside the topmost dialog, or anywhere if no dialog is open), else to
 * the topmost dialog itself. It never drops to <body>, so Tab and Escape keep working inside the dialog.
 */
function handOffToastFocus(el) {
  const sibs = el.parentElement ? Array.from(el.parentElement.children) : [];
  const alive = (n) => n !== el && n.classList.contains('toast') && !n.classList.contains('is-leaving');
  const at = sibs.indexOf(el);
  const next = sibs.slice(at + 1).find(alive) || sibs.slice(0, Math.max(0, at)).reverse().find(alive) || null;
  const top = openDialogs[openDialogs.length - 1] || null;
  const origin = toastFocusOrigin && !toastFocusOrigin.closest('.toast-stack') && (!top || top.contains(toastFocusOrigin)) ? toastFocusOrigin : null;
  const candidates = [[next && next.querySelector('.toast-action, .toast-close'), false], [origin, true], [top, true]];
  for (const [n, keepScroll] of candidates) {
    if (!canTakeFocus(n)) continue;
    try { n.focus({ preventScroll: keepScroll }); } catch { n.focus(); }
    if (document.activeElement === n) return;
  }
}

function toastStack() {
  let stack = document.getElementById('toasts');
  if (!stack) { stack = h('div', { id: 'toasts' }); document.body.appendChild(stack); }
  stack.classList.add('toast-stack');
  if (openDialogs.length && (!stack.classList.contains('is-docked') || stack.parentElement !== openDialogs[openDialogs.length - 1])) dockToasts();
  // Each toast carries its own role=status / role=alert; the container itself is not a
  // live region, so a toast is announced exactly once (RTL-18).
  if (stack.hasAttribute('aria-live')) stack.removeAttribute('aria-live');
  if (stack.getAttribute('role') === 'status' || stack.getAttribute('role') === 'alert' || stack.getAttribute('role') === 'log') stack.removeAttribute('role');
  return stack;
}

export function toast(message, { tone = 'neutral', timeout = 4500, action = null, title = '' } = {}) {
  const tone0 = toneOf(tone);
  const stack = toastStack();
  const el = h('div', { class: ['toast', `tone-${tone0}`], role: tone0 === 'critical' || tone0 === 'serious' ? 'alert' : 'status', 'data-tone': tone0 });
  const ic = glyph(tone0, 18); ic.classList.add('toast-icon');
  el.appendChild(ic);
  const text = h('div', { class: 'toast-text' });
  if (title) text.appendChild(h('strong', { class: 'toast-title' }, String(title)));
  text.appendChild(h('span', { class: 'toast-msg' }, String(message ?? '')));
  el.appendChild(text);
  let timer = null;
  let gone = false;
  const dismiss = () => {
    if (gone) return;
    gone = true;
    if (timer) { clearTimeout(timer); timer = null; }
    if (el.contains(document.activeElement)) handOffToastFocus(el);
    el.classList.add('is-leaving');
    el.inert = true; // a leaving toast takes no focus and drops out of the accessibility tree at once
    const done = () => el.remove();
    if (reducedMotion()) done(); else setTimeout(done, 220);
  };
  if (action && action.label) {
    el.appendChild(button(action.label, { variant: 'ghost', size: 'sm', onClick: () => { if (typeof action.onClick === 'function') action.onClick(); dismiss(); }, attrs: { class: 'toast-action' } }));
  }
  el.appendChild(button('', { variant: 'ghost', size: 'sm', icon: glyph('close', 16), onClick: dismiss, attrs: { 'aria-label': t('ui.closeToast'), class: 'toast-close' } }));
  const arm = () => { if (gone || !(timeout > 0)) return; if (timer) clearTimeout(timer); timer = setTimeout(dismiss, timeout); };
  el.addEventListener('pointerenter', () => { if (timer) { clearTimeout(timer); timer = null; } });
  el.addEventListener('pointerleave', arm);
  el.addEventListener('focusin', (e) => {
    if (timer) { clearTimeout(timer); timer = null; }
    const from = e.relatedTarget;
    if (!(from instanceof Element && from.closest('.toast-stack'))) toastFocusOrigin = from instanceof Element ? from : null;
  });
  el.addEventListener('focusout', arm);
  el.__toastAt = Date.now();
  stack.insertBefore(el, stack.firstChild);
  while (stack.children.length > 5) {
    const old = stack.lastChild;
    if (old.contains(document.activeElement)) handOffToastFocus(old);
    old.remove();
  }
  // Docked, the stack scrolls on its own: bring the newest toast (first) into view.
  if (stack.classList.contains('is-docked')) stack.scrollTop = 0;
  requestAnimationFrame(() => el.classList.add('is-in'));
  arm();
  return { el, dismiss };
}

/* ------------------------------------------------------------------ */
/* Kanban                                                              */
/* ------------------------------------------------------------------ */

const cssEscape = (v) => (typeof CSS !== 'undefined' && typeof CSS.escape === 'function' ? CSS.escape(String(v)) : String(v).replace(/["\\]/g, '\\$&'));

/** Accessible name for a card: explicit code/title fields, else code + title read from the rendered content. */
function kanbanCardName(item, card) {
  const parts = [];
  const pick = (v) => (v === null || v === undefined ? '' : String(v).replace(/\s+/g, ' ').trim());
  const code = pick(item.code);
  const title = pick(item.title || item.label || item.name);
  if (code) parts.push(code);
  if (title) parts.push(title);
  if (!parts.length) {
    const titleEl = card.querySelector('.kanban-card-title, h3, h4, strong');
    const codeEl = card.querySelector('.mono');
    const c = codeEl ? pick(codeEl.textContent) : '';
    const ttl = titleEl ? pick(titleEl.textContent) : '';
    if (c) parts.push(c);
    if (ttl) parts.push(ttl);
  }
  if (!parts.length) {
    const text = pick(Array.from(card.childNodes).filter((n) => !(n.classList && n.classList.contains('kanban-card-bar'))).map((n) => n.textContent || '').join(' '));
    if (text) parts.push(text.length > 90 ? `${text.slice(0, 88).trimEnd()}…` : text);
  }
  return parts.join(' — ') || t('ui.kanban.card', { id: pick(item.id) });
}

/**
 * Kanban board. columns:[{id,label,tone}], items:[{id,columnId,render,code?,title?}], onMove(id, toColumnId).
 * Options: headingLevel (2|3|4, default 2; auto-bumped to 3 when the board mounts inside a .card that has
 * its own h2), ariaLabel. Columns are role=group labelled by their heading; cards carry an accessible
 * name (code + title), aria-roledescription and shared sr-only keyboard instructions (RTL-7/17/27).
 * After a keyboard move the moved card is re-focused once the board re-renders. The scroller toggles
 * is-overflowing / is-scroll-start / is-scroll-end (V21).
 */
export function kanban({ columns = [], items = [], onMove = null, headingLevel = null, ariaLabel = null } = {}) {
  if (!ariaLabel) ariaLabel = t('ui.kanban.label');
  const hintId = uid('kanban-hint');
  const el = h('div', { class: 'kanban', role: 'group', 'aria-label': ariaLabel, 'aria-describedby': hintId, dataset: { columns: columns.length } });
  const hint = h('p', { class: 'sr-only', id: hintId }, isRtl() ? t('ui.kanban.hintRtl') : t('ui.kanban.hintLtr'));
  // The board is the scroll container: it must also contain the absolutely positioned sr-only texts
  // (hint, count labels), or their static position can widen the page in RTL.
  el.style.position = 'relative';
  const cols = new Map();
  let current = Array.isArray(items) ? items.slice() : [];
  let dragId = null;
  let pendingFocusId = null;
  let pendingFocusTimer = 0;
  const explicitLevel = [2, 3, 4, 5, 6].includes(Number(headingLevel)) ? Number(headingLevel) : null;
  let level = explicitLevel || 2;

  const move = (id, toColumnId, { viaKeyboard = false } = {}) => {
    const item = current.find((i) => String(i.id) === String(id));
    if (!item || String(item.columnId) === String(toColumnId)) return;
    if (viaKeyboard) {
      pendingFocusId = String(id);
      clearTimeout(pendingFocusTimer);
      pendingFocusTimer = setTimeout(() => { pendingFocusId = null; }, 2000);
    }
    if (typeof onMove === 'function') onMove(item.id, toColumnId);
  };

  columns.forEach((col) => {
    const titleId = uid('kanban-col');
    const colEl = h('section', { class: ['kanban-col', col.tone ? `tone-${toneOf(col.tone)}` : null], 'data-column': String(col.id), role: 'group', 'aria-labelledby': titleId });
    const head = h('header', { class: 'kanban-col-head' });
    if (col.tone) head.appendChild(liveDot(col.tone));
    const title = h(`h${level}`, { class: 'kanban-col-title', id: titleId }, String(col.label));
    head.appendChild(title);
    const countNum = h('span', { class: 'kanban-count-num' }, '0');
    const count = h('span', { class: 'kanban-count' }, h('span', { class: 'sr-only' }, t('ui.kanban.count')), countNum);
    head.appendChild(count);
    const cards = h('div', { class: 'kanban-cards', 'data-column': String(col.id) });
    colEl.append(head, cards);

    cards.addEventListener('dragover', (e) => { if (dragId === null) return; e.preventDefault(); e.dataTransfer.dropEffect = 'move'; colEl.classList.add('is-over'); });
    cards.addEventListener('dragleave', (e) => { if (!cards.contains(e.relatedTarget)) colEl.classList.remove('is-over'); });
    cards.addEventListener('drop', (e) => {
      e.preventDefault(); colEl.classList.remove('is-over');
      const id = dragId !== null ? dragId : e.dataTransfer.getData('text/plain');
      dragId = null;
      if (id) move(id, col.id);
    });
    cols.set(String(col.id), { colEl, cards, count, countNum, title, col });
    el.appendChild(colEl);
  });
  el.appendChild(hint);

  /** Heading level: explicit option wins; otherwise h2 at top level, h3 inside a card that already has an h2. */
  function applyHeadingLevel() {
    if (explicitLevel) return;
    const card = el.closest('.card');
    const want = card && card.querySelector('h2') ? 3 : 2;
    if (want === level) return;
    level = want;
    for (const slot of cols.values()) {
      const next = h(`h${level}`, { class: 'kanban-col-title', id: slot.title.id }, slot.title.textContent);
      slot.title.replaceWith(next);
      slot.title = next;
    }
  }

  function cardFor(item) {
    const card = h('article', { class: 'kanban-card', draggable: true, 'data-id': String(item.id), tabindex: '0', 'aria-roledescription': t('ui.kanban.cardRole'), 'aria-describedby': hintId });
    const bar = h('div', { class: 'kanban-card-bar' });
    const grip = glyph('grip', 14); grip.classList.add('kanban-grip');
    bar.appendChild(grip);
    const others = columns.filter((c) => String(c.id) !== String(item.columnId));
    const moveBtn = button('', { variant: 'ghost', size: 'sm', icon: glyph('move', 15), attrs: { 'aria-label': t('ui.kanban.moveTo'), 'aria-haspopup': 'menu', 'aria-expanded': 'false', class: 'kanban-move' },
      onClick: (e) => { e.stopPropagation(); menu(moveBtn, others.map((c) => ({ label: t('ui.kanban.moveToCol', { column: c.label }), tone: c.tone || null, onClick: () => move(item.id, c.id, { viaKeyboard: true }) })), { ariaLabel: t('ui.kanban.moveTo') }); } });
    bar.appendChild(moveBtn);
    card.appendChild(bar);
    let content = null;
    try { content = typeof item.render === 'function' ? item.render(item) : null; } catch { content = null; }
    appendChild(card, content);
    card.setAttribute('aria-label', kanbanCardName(item, card));
    card.addEventListener('dragstart', (e) => {
      dragId = String(item.id);
      e.dataTransfer.effectAllowed = 'move';
      try { e.dataTransfer.setData('text/plain', String(item.id)); } catch { /* some engines refuse */ }
      card.classList.add('is-dragging'); el.classList.add('is-dragging');
    });
    card.addEventListener('dragend', () => { dragId = null; card.classList.remove('is-dragging'); el.classList.remove('is-dragging'); el.querySelectorAll('.is-over').forEach((n) => n.classList.remove('is-over')); });
    card.addEventListener('keydown', (e) => {
      if (e.target !== card) return;
      const idx = columns.findIndex((c) => String(c.id) === String(item.columnId));
      // The next column lies in the reading direction (ArrowLeft in RTL, ArrowRight in LTR).
      const dirKeys = inlineKeys();
      if (e.key === dirKeys.next && idx < columns.length - 1) { e.preventDefault(); move(item.id, columns[idx + 1].id, { viaKeyboard: true }); }
      else if (e.key === dirKeys.prev && idx > 0) { e.preventDefault(); move(item.id, columns[idx - 1].id, { viaKeyboard: true }); }
      else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); moveBtn.click(); }
    });
    return card;
  }

  function render() {
    for (const { cards } of cols.values()) clear(cards);
    const counts = new Map();
    current.forEach((item) => {
      const slot = cols.get(String(item.columnId)) || cols.values().next().value;
      if (!slot) return;
      slot.cards.appendChild(cardFor(item));
      counts.set(slot, (counts.get(slot) || 0) + 1);
    });
    for (const slot of cols.values()) {
      const n = counts.get(slot) || 0;
      slot.countNum.textContent = fmt.num(n);
      slot.colEl.classList.toggle('is-empty', n === 0);
      if (n === 0) slot.cards.appendChild(h('p', { class: 'kanban-empty' }, t('ui.kanban.empty')));
    }
    if (pendingFocusId !== null) {
      const target = el.querySelector(`.kanban-card[data-id="${cssEscape(pendingFocusId)}"]`);
      if (target) {
        pendingFocusId = null;
        clearTimeout(pendingFocusTimer);
        try { target.focus({ preventScroll: false }); } catch { target.focus(); }
      }
    }
    scheduleOverflow();
  }

  /* ---- scroller affordance (V21) ---- */
  let ro = null;
  let raf = 0;
  let wasConnected = false;
  function updateOverflow() {
    raf = 0;
    if (!el.isConnected) { if (wasConnected) teardown(); return; }
    wasConnected = true;
    applyHeadingLevel();
    const over = el.scrollWidth > el.clientWidth + 1;
    el.classList.toggle('is-overflowing', over);
    const sl = Math.abs(el.scrollLeft);
    const max = el.scrollWidth - el.clientWidth;
    el.classList.toggle('is-scroll-start', sl <= 1);
    el.classList.toggle('is-scroll-end', max - sl <= 1);
  }
  function scheduleOverflow() {
    if (raf || typeof requestAnimationFrame !== 'function') return;
    raf = requestAnimationFrame(updateOverflow);
  }
  function teardown() {
    if (ro) { ro.disconnect(); ro = null; }
    window.removeEventListener('resize', scheduleOverflow);
    if (raf) { cancelAnimationFrame(raf); raf = 0; }
    clearTimeout(pendingFocusTimer);
  }
  if (typeof ResizeObserver === 'function') { ro = new ResizeObserver(() => scheduleOverflow()); ro.observe(el); }
  else window.addEventListener('resize', scheduleOverflow);
  el.addEventListener('scroll', scheduleOverflow, { passive: true });

  render();
  return {
    el,
    update(next) { current = Array.isArray(next) ? next.slice() : []; render(); },
    focusCard(id) { const c = el.querySelector(`.kanban-card[data-id="${cssEscape(String(id))}"]`); if (c) c.focus(); return !!c; },
    destroy: teardown,
  };
}

/* ------------------------------------------------------------------ */
/* Countdown                                                           */
/* ------------------------------------------------------------------ */

/* One shared 1 s ticker drives every countdown on the page; it idles while the tab is hidden (C-9). */
const tickers = new Set();
let tickerTimer = 0;
let tickerVisibilityBound = false;
function runTickers() {
  for (const fn of Array.from(tickers)) {
    try { fn(); } catch { /* a failing countdown never stops the others */ }
  }
}
function syncTicker() {
  const shouldRun = tickers.size > 0 && !(typeof document !== 'undefined' && document.hidden);
  if (shouldRun && !tickerTimer) tickerTimer = setInterval(runTickers, 1000);
  else if (!shouldRun && tickerTimer) { clearInterval(tickerTimer); tickerTimer = 0; }
}
function onTickerVisibility() {
  syncTicker();
  if (!document.hidden) runTickers(); // catch up immediately when the tab comes back
}
function addTicker(fn) {
  tickers.add(fn);
  if (!tickerVisibilityBound && typeof document !== 'undefined') {
    tickerVisibilityBound = true;
    document.addEventListener('visibilitychange', onTickerVisibility);
  }
  syncTicker();
}
function removeTicker(fn) {
  tickers.delete(fn);
  syncTicker();
}

export function countdown(targetIso, { onExpire = null, warnMinutes = 60, expiredText = null } = {}) {
  if (!expiredText) expiredText = t('ui.countdown.expired');
  const target = new Date(targetIso).getTime();
  const el = h('span', { class: 'countdown', role: 'timer', 'data-target': String(targetIso) });
  const ic = glyph('clock', 13); ic.classList.add('countdown-icon');
  const text = h('span', { class: 'countdown-text' });
  el.append(ic, text);
  let fired = false;
  let registered = false;
  let wasConnected = false;
  let detachedTicks = 0;
  const stop = () => { if (registered) { registered = false; removeTicker(tick); } };
  const tick = () => {
    // Auto-unregister once the element has been removed from the document (view navigated away without
    // stop()), or when it was never attached at all (built and discarded) after a short grace period.
    if (el.isConnected) { wasConnected = true; detachedTicks = 0; }
    else if (wasConnected || ++detachedTicks > 30) { stop(); return; }
    const remaining = target - Date.now();
    if (!Number.isFinite(target)) { text.textContent = '—'; stop(); return; }
    if (remaining <= 0) {
      el.classList.add('is-expired'); el.classList.remove('is-warning');
      text.textContent = expiredText;
      el.setAttribute('aria-label', t('ui.countdown.remaining', { time: expiredText }));
      stop();
      if (!fired) { fired = true; if (typeof onExpire === 'function') onExpire(); }
      return;
    }
    el.classList.toggle('is-warning', remaining < warnMinutes * 60 * 1000);
    const d = fmt.duration(remaining);
    text.textContent = d;
    el.setAttribute('aria-label', t('ui.countdown.remaining', { time: d }));
  };
  tick();
  if (!el.classList.contains('is-expired') && Number.isFinite(target)) { registered = true; addTicker(tick); }
  return { el, stop, tick };
}

/* ------------------------------------------------------------------ */
/* Namespace export (ctx.components)                                   */
/* ------------------------------------------------------------------ */

export const components = {
  h, clear, glyph, svgIcon, card, statTile, badge, tierBadge, button, segmented, tabs, dataTable,
  modal, drawer, menu, toast, kanban, formField, readForm, emptyState, progress, countdown, liveDot, kv, reducedMotion,
  parseDelta, statusBadge, filterBar, loadingState, errorState, offlineState, skeleton, motion,
};
export default components;
