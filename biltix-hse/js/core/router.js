/**
 * Biltix HSE — hash router & view lifecycle (js/core/router.js)
 *
 * Contract (ARCHITECTURE.md §4):
 *   router.register(view)            view = {id, title, icon, code:'SEC-01', render(container, ctx) => cleanupFn|void}
 *   router.start(defaultId='overview', {container, ctx})
 *   router.navigate(id, params={})   sets location.hash = '#/id?k=v'
 *   router.current()                 → {id, params}
 *
 * Hash format: '#/overview', '#/risks?id=R12&tier=حرج'. Unknown ids fall back to the
 * default view (URL replaced, no history entry). On every navigation the previous
 * view's cleanup runs, the container is emptied, the new view renders, `route:change`
 * is emitted, `document.title` becomes '<view title> — بلتكس HSE' and focus moves to
 * the view's <h1> (tabindex=-1) so screen readers announce the new section.
 *
 * `start()` accepts the <main> container and the shared `ctx` object
 * ({store, bus, sel, fmt, charts, radar, components, art, live, sources}) from app.js;
 * the router adds `router`, `params` and `view` to the ctx it hands to `render`.
 * Side-effect free on import (the hashchange listener is attached in start()).
 */

import { bus } from './bus.js';

const APP_NAME = 'بلتكس Risk AI';

/** @type {Map<string, object>} */
const registry = new Map();
/** @type {string[]} registration order = nav order */
const order = [];

let defaultId = 'overview';
let container = null;
let context = {};
let current = { id: null, params: {} };
let cleanup = null;
let started = false;
let onHashChange = null;

/* ────────────────────────────── hash helpers ────────────────────────────── */

function safeDecode(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/** '#/risks?id=R1' → {id:'risks', params:{id:'R1'}} */
export function parseHash(hash) {
  let raw = String(hash ?? '');
  if (raw.startsWith('#')) raw = raw.slice(1);
  if (raw.startsWith('/')) raw = raw.slice(1);
  const q = raw.indexOf('?');
  const id = safeDecode(q === -1 ? raw : raw.slice(0, q)).trim();
  const params = {};
  if (q !== -1) {
    try {
      for (const [key, value] of new URLSearchParams(raw.slice(q + 1))) params[key] = value;
    } catch {
      /* malformed query: ignore params */
    }
  }
  return { id, params };
}

/** ('risks', {id:'R1'}) → '#/risks?id=R1' (empty/null params are dropped) */
export function buildHash(id, params = {}) {
  const sp = new URLSearchParams();
  for (const [key, value] of Object.entries(params || {})) {
    if (value === undefined || value === null || value === '') continue;
    sp.set(key, String(value));
  }
  const qs = sp.toString();
  return `#/${encodeURIComponent(String(id))}${qs ? `?${qs}` : ''}`;
}

function sameParams(a, b) {
  const ka = Object.keys(a || {});
  const kb = Object.keys(b || {});
  if (ka.length !== kb.length) return false;
  return ka.every((k) => String(a[k]) === String(b[k]));
}

/* ────────────────────────────── DOM helpers ────────────────────────────── */

function resolveContainer() {
  if (container && container.isConnected !== false) return container;
  if (typeof document === 'undefined') return null;
  container = document.getElementById('main') || document.querySelector('main');
  return container;
}

function resetScroll(el) {
  try {
    el.scrollTop = 0;
  } catch { /* ignore */ }
  try {
    window.scrollTo({ top: 0, behavior: 'instant' });
  } catch {
    try { window.scrollTo(0, 0); } catch { /* ignore */ }
  }
}

function focusHeading(root) {
  if (!root) return;
  const heading = root.querySelector('h1') || root;
  if (!heading.hasAttribute('tabindex')) heading.setAttribute('tabindex', '-1');
  try {
    heading.focus({ preventScroll: true });
  } catch {
    try { heading.focus(); } catch { /* ignore */ }
  }
}

/** Inline error state when a view throws during render (built with DOM APIs only). */
function renderFailure(root, view, error) {
  const doc = root.ownerDocument;
  const section = doc.createElement('section');
  section.className = 'view view-error';
  section.setAttribute('role', 'alert');

  const head = doc.createElement('div');
  head.className = 'view-head';
  const code = doc.createElement('span');
  code.className = 'code-tag';
  code.textContent = view.code || 'SEC-00';
  const h1 = doc.createElement('h1');
  h1.textContent = view.title || 'القسم';
  const lead = doc.createElement('p');
  lead.className = 'view-lead';
  lead.textContent = 'تعذر عرض هذا القسم بسبب خطأ غير متوقع. يمكنك إعادة المحاولة أو العودة إلى قمرة القيادة.';
  head.append(code, h1, lead);

  const detail = doc.createElement('pre');
  detail.className = 'view-error__detail';
  detail.textContent = error && error.message ? String(error.message) : String(error);

  const actions = doc.createElement('div');
  actions.className = 'view-error__actions';
  const retry = doc.createElement('button');
  retry.type = 'button';
  retry.className = 'btn btn--primary';
  retry.textContent = 'إعادة المحاولة';
  retry.addEventListener('click', () => router.refresh());
  const home = doc.createElement('a');
  home.className = 'btn btn--ghost';
  home.href = buildHash(defaultId);
  home.textContent = 'العودة إلى قمرة القيادة';
  actions.append(retry, home);

  section.append(head, detail, actions);
  root.replaceChildren(section);
}

/* ────────────────────────────── lifecycle ────────────────────────────── */

function runCleanup() {
  if (typeof cleanup !== 'function') {
    cleanup = null;
    return;
  }
  const fn = cleanup;
  cleanup = null;
  try {
    fn();
  } catch (error) {
    console.error(`[biltix-hse] cleanup of view "${current.id}" failed:`, error);
  }
}

function mount(view, params) {
  const root = resolveContainer();
  if (!root || !view) return;
  const previousId = current.id;
  runCleanup();
  root.replaceChildren();
  root.setAttribute('data-view', view.id);
  current = { id: view.id, params: { ...params } };

  const ctx = { ...context, router, params: { ...params }, view };
  let result;
  try {
    result = view.render(root, ctx);
  } catch (error) {
    console.error(`[biltix-hse] view "${view.id}" failed to render:`, error);
    renderFailure(root, view, error);
    result = null;
  }
  cleanup = typeof result === 'function' ? result : null;

  if (typeof document !== 'undefined') {
    document.title = view.title ? `${view.title} — ${APP_NAME}` : APP_NAME;
  }
  resetScroll(root);
  bus.emit('route:change', { id: view.id, params: { ...params }, view, previousId });
  focusHeading(root);
}

function resolve() {
  if (typeof location === 'undefined') return;
  const { id, params } = parseHash(location.hash);
  if (id && registry.has(id)) {
    mount(registry.get(id), params);
    return;
  }
  const fallbackId = registry.has(defaultId) ? defaultId : order[0];
  if (!fallbackId) return;
  const target = buildHash(fallbackId);
  if (location.hash !== target) {
    try {
      history.replaceState(null, '', target);
    } catch {
      location.replace(target);
      return; // hashchange will fire and resolve again
    }
  }
  mount(registry.get(fallbackId), {});
}

/* ────────────────────────────── public API ────────────────────────────── */

export const router = {
  /**
   * Register a view module: {id, title, icon, code, render(container, ctx) => cleanup|void}.
   * Re-registering an id replaces the previous definition (order is kept).
   */
  register(view) {
    if (!view || typeof view.id !== 'string' || !view.id || typeof view.render !== 'function') {
      throw new TypeError('router.register: a view needs a string id and a render(container, ctx) function');
    }
    if (!registry.has(view.id)) order.push(view.id);
    registry.set(view.id, view);
    return view;
  },

  /** Register several views at once (nav order = array order). */
  registerAll(views) {
    for (const view of views || []) router.register(view);
    return router;
  },

  /** Provide/merge the shared ctx handed to every render. */
  setContext(ctx) {
    context = { ...context, ...(ctx || {}) };
    return router;
  },

  /** Provide the <main> element views render into. */
  setContainer(el) {
    container = el || null;
    return router;
  },

  /**
   * Start routing. Signature: start(defaultId='overview', {container, ctx}) or start({defaultId, container, ctx}).
   * Attaches the hashchange listener once and resolves the current hash immediately.
   */
  start(defaultViewId = 'overview', options = {}) {
    let opts = options || {};
    if (defaultViewId && typeof defaultViewId === 'object') {
      opts = defaultViewId;
      defaultViewId = opts.defaultId || 'overview';
    }
    defaultId = typeof defaultViewId === 'string' && defaultViewId ? defaultViewId : 'overview';
    if (opts.container) container = opts.container;
    if (opts.ctx) context = { ...context, ...opts.ctx };
    if (!resolveContainer()) return false;
    if (!started && typeof window !== 'undefined') {
      onHashChange = () => resolve();
      window.addEventListener('hashchange', onHashChange);
      started = true;
    }
    resolve();
    return true;
  },

  /** Detach the listener and tear down the current view. */
  stop() {
    if (started && typeof window !== 'undefined' && onHashChange) {
      window.removeEventListener('hashchange', onHashChange);
    }
    onHashChange = null;
    started = false;
    runCleanup();
    current = { id: null, params: {} };
  },

  /** Navigate by setting the hash ('#/id?k=v'). Same route → re-render in place. */
  navigate(id, params = {}) {
    const targetId = registry.has(id) ? id : (registry.has(defaultId) ? defaultId : order[0]);
    if (!targetId || typeof location === 'undefined') return;
    const hash = buildHash(targetId, params);
    if (location.hash === hash) {
      router.refresh();
      return;
    }
    location.hash = hash;
  },

  /** Re-run the current view's render (after settings/numerals change, retry, etc.). */
  refresh() {
    if (!current.id || !registry.has(current.id)) {
      resolve();
      return;
    }
    mount(registry.get(current.id), current.params);
  },

  /** @returns {{id: string|null, params: Record<string,string>}} */
  current() {
    return { id: current.id, params: { ...current.params } };
  },

  /** Hash string for links: router.href('risks', {id:'R1'}) → '#/risks?id=R1'. */
  href(id, params = {}) {
    return buildHash(id, params);
  },

  /** True when `id` is the mounted view (optionally with identical params). */
  isActive(id, params) {
    if (current.id !== id) return false;
    return params === undefined ? true : sameParams(current.params, params);
  },

  /** Registered views in nav order. */
  views() {
    return order.map((id) => registry.get(id)).filter(Boolean);
  },

  /** Look up a registered view by id. */
  get(id) {
    return registry.get(id) || null;
  },

  /** Default view id used for unknown routes. */
  defaultId() {
    return defaultId;
  },
};

export default router;
