/**
 * Biltix Risk AI — hash router & view lifecycle (js/core/router.js)
 *
 * Contract (ARCHITECTURE.md §4):
 *   router.register(view)            view = {id, title, icon, code:'SEC-01', render(container, ctx) => cleanupFn|void}
 *                                    or a LAZY view {id, title, icon, code, load: () => import('…')} whose
 *                                    module ({default:{render}}) is imported on first navigation and cached.
 *   router.start(defaultId='overview', {container, ctx})
 *   router.navigate(id, params={})   sets location.hash = '#/id?k=v'
 *   router.current()                 → {id, params}
 *   router.preload(id)               → Promise (import a lazy view without mounting it)
 *
 * Hash format: '#/overview', '#/risks?id=R12&tier=حرج'. Unknown ids fall back to the
 * default view (URL replaced, no history entry). On every navigation the router emits
 * `ui:route-leave` {from, to, params} FIRST (menus / drawers / sheets close on it), then runs
 * the previous view's cleanup, empties the container, awaits the module when the view is lazy,
 * renders, emits `route:change` and sets `document.title` to '<view title> — بلتكس Risk AI'.
 *
 * Focus: the FIRST paint focuses <main> itself (tabindex -1, preventScroll) so the skip link
 * and page order stay intact and no ring shows on load; after a USER-initiated navigation
 * (hash change, router.navigate) focus moves to the view's <h1> so screen readers announce
 * the new section. router.refresh() (numerals change, retry) never steals focus.
 *
 * Navigations are token-guarded: when a lazy import is still pending and the hash changes
 * again, the stale mount is dropped. Side-effect free on import (the hashchange listener is
 * attached in start()).
 */

import { bus } from './bus.js';

const APP_NAME = 'بلتكس Risk AI';
const LOADING_DELAY_MS = 120;

/** @type {Map<string, object>} */
const registry = new Map();
/** @type {string[]} registration order = nav order */
const order = [];
/** @type {Map<string, Promise<object>>} pending/finished lazy imports */
const loads = new Map();

let defaultId = 'overview';
let container = null;
let context = {};
let current = { id: null, params: {} };
let cleanup = null;
let started = false;
let onHashChange = null;
let navToken = 0;
let firstMount = true;
let userNavigation = false;

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

function safeFocus(el) {
  if (!el || typeof el.focus !== 'function') return;
  try {
    el.focus({ preventScroll: true });
  } catch {
    try { el.focus(); } catch { /* ignore */ }
  }
}

/** First paint: the landmark itself (no ring, skip link order intact). */
function focusMain(root) {
  if (!root) return;
  if (!root.hasAttribute('tabindex')) root.setAttribute('tabindex', '-1');
  safeFocus(root);
}

/** User navigation: the section heading, so the new page is announced. */
function focusHeading(root) {
  if (!root) return;
  const heading = root.querySelector('h1') || root;
  if (!heading.hasAttribute('tabindex')) heading.setAttribute('tabindex', '-1');
  safeFocus(heading);
}

function applyFocus(root, mode) {
  if (mode === 'main') focusMain(root);
  else if (mode === 'heading') focusHeading(root);
}

/** Lightweight placeholder shown only when a lazy import takes longer than LOADING_DELAY_MS. */
function renderLoading(root, view) {
  const doc = root.ownerDocument;
  const section = doc.createElement('section');
  section.className = 'view view-loading';
  section.setAttribute('aria-busy', 'true');
  const head = doc.createElement('div');
  head.className = 'view-head';
  const code = doc.createElement('span');
  code.className = 'code-tag';
  code.textContent = view.code || '';
  const h1 = doc.createElement('h1');
  h1.textContent = view.title || '';
  const lead = doc.createElement('p');
  lead.className = 'view-lead';
  lead.textContent = 'جارٍ تحميل القسم…';
  head.append(code, h1, lead);
  section.append(head);
  root.replaceChildren(section);
}

/** Inline error state when a view throws during render / import (built with DOM APIs only). */
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
  retry.addEventListener('click', () => { loads.delete(view.id); router.refresh(); });
  const home = doc.createElement('a');
  home.className = 'btn btn--ghost';
  home.href = buildHash(defaultId);
  home.textContent = 'العودة إلى قمرة القيادة';
  actions.append(retry, home);

  section.append(head, detail, actions);
  root.replaceChildren(section);
}

/* ────────────────────────────── lazy modules ────────────────────────────── */

function isRenderable(candidate) {
  return Boolean(candidate) && typeof candidate === 'object' && typeof candidate.render === 'function';
}

function pickExport(mod, id) {
  if (!mod || typeof mod !== 'object') return null;
  for (const c of [mod.default, mod.view, mod[id]]) if (isRenderable(c)) return c;
  return null;
}

/**
 * Resolve a registered view to something with render(). Lazy entries import their module once
 * (cached promise); the resolved render / title / code / icon are attached to the entry so it
 * keeps working synchronously afterwards.
 */
function resolveView(view) {
  if (!view) return Promise.reject(new TypeError('router: unknown view'));
  if (typeof view.render === 'function') return Promise.resolve(view);
  if (typeof view.load !== 'function') return Promise.reject(new TypeError(`router: view "${view.id}" has neither render() nor load()`));
  let pending = loads.get(view.id);
  if (!pending) {
    pending = Promise.resolve()
      .then(() => view.load())
      .then((mod) => {
        // views/index.js loadView() resolves to the registered entry itself with render() attached:
        // wrapping it again would make render() call itself.
        if (mod === view && typeof view.render === 'function') {
          view.loaded = true;
          return view;
        }
        const impl = isRenderable(mod) ? mod : pickExport(mod, view.id);
        if (!impl) throw new Error(`الوحدة "${view.id}" لا تُصدّر عرضاً صالحاً {id, render}`);
        view.render = (root, ctx) => impl.render.call(impl, root, ctx);
        view.module = impl;
        view.loaded = true;
        if (!view.title && impl.title) view.title = impl.title;
        if (!view.code && impl.code) view.code = impl.code;
        if (!view.icon && impl.icon) view.icon = impl.icon;
        return view;
      })
      .catch((error) => {
        loads.delete(view.id); // allow a retry
        throw error;
      });
    loads.set(view.id, pending);
  }
  return pending;
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

async function mount(view, params) {
  const root = resolveContainer();
  if (!root || !view) return;
  const token = ++navToken;
  const previousId = current.id;
  const focusMode = firstMount ? 'main' : (userNavigation ? 'heading' : 'none');
  firstMount = false;
  userNavigation = false;

  bus.emit('ui:route-leave', { from: previousId, to: view.id, params: { ...params } });
  runCleanup();
  root.replaceChildren();
  root.setAttribute('data-view', view.id);
  current = { id: view.id, params: { ...params } };
  if (typeof document !== 'undefined') {
    document.title = view.title ? `${view.title} — ${APP_NAME}` : APP_NAME;
  }

  let resolved = null;
  let loadError = null;
  if (typeof view.render === 'function') {
    resolved = view;
  } else {
    root.setAttribute('aria-busy', 'true');
    const placeholder = setTimeout(() => { if (token === navToken) renderLoading(root, view); }, LOADING_DELAY_MS);
    try {
      resolved = await resolveView(view);
    } catch (error) {
      loadError = error;
    }
    clearTimeout(placeholder);
    root.removeAttribute('aria-busy');
    if (token !== navToken) return; // superseded by a newer navigation
    root.replaceChildren();
  }

  const ctx = { ...context, router, params: { ...params }, view: resolved || view };
  let result = null;
  if (loadError) {
    console.error(`[biltix-hse] view "${view.id}" failed to load:`, loadError);
    renderFailure(root, view, loadError);
  } else {
    try {
      result = resolved.render(root, ctx);
    } catch (error) {
      console.error(`[biltix-hse] view "${view.id}" failed to render:`, error);
      renderFailure(root, view, error);
      result = null;
    }
  }
  cleanup = typeof result === 'function' ? result : null;

  if (typeof document !== 'undefined') {
    const title = (resolved && resolved.title) || view.title;
    document.title = title ? `${title} — ${APP_NAME}` : APP_NAME;
  }
  resetScroll(root);
  bus.emit('route:change', { id: view.id, params: { ...params }, view: resolved || view, previousId });
  applyFocus(root, focusMode);
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
   * Register a view: {id, title, icon, code, render(container, ctx) => cleanup|void} or a lazy
   * {id, title, icon, code, load: () => import(...)}. Re-registering an id replaces the previous
   * definition (order is kept).
   */
  register(view) {
    const ok = view && typeof view.id === 'string' && view.id && (typeof view.render === 'function' || typeof view.load === 'function');
    if (!ok) {
      throw new TypeError('router.register: a view needs a string id and a render(container, ctx) or load() function');
    }
    if (!registry.has(view.id)) order.push(view.id);
    registry.set(view.id, view);
    loads.delete(view.id);
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
      onHashChange = () => { userNavigation = true; resolve(); };
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
    navToken += 1;
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
    userNavigation = true;
    location.hash = hash;
  },

  /** Re-run the current view's render (after settings/numerals change, retry, etc.). Never moves focus. */
  refresh() {
    userNavigation = false;
    if (!current.id || !registry.has(current.id)) {
      resolve();
      return;
    }
    mount(registry.get(current.id), current.params);
  },

  /** Import a lazy view ahead of time (hover/focus prefetch, idle warm-up). Resolves to the view. */
  preload(id) {
    const view = registry.get(id);
    if (!view) return Promise.resolve(null);
    return resolveView(view).catch(() => null);
  },

  /** True when the view's module is available synchronously. */
  isLoaded(id) {
    const view = registry.get(id);
    return Boolean(view && typeof view.render === 'function');
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

  /** Registered views (lazy entries or full modules) in nav order. */
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
