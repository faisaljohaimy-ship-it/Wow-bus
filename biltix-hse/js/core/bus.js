/**
 * BILTIX Risk AI — event bus (js/core/bus.js)
 *
 * Tiny synchronous pub/sub shared by every module. Contract (ARCHITECTURE.md §4):
 *
 *   bus.on(event, handler)   → unsubscribe()
 *   bus.once(event, handler) → unsubscribe()
 *   bus.off(event, handler)
 *   bus.emit(event, payload)
 *
 * Event names used across the app are plain strings and are the contract:
 *   theme:change, settings:change, store:change, filters:change, feed:event,
 *   alert, route:change, sensors:tick, integrations:tick,
 *   ui:route-leave {from, to, params}   — emitted by the router BEFORE the current view is torn
 *                                          down, so transient UI (menus, drawers, sheets) can close.
 *   lang:change {lang, dir}             — i18n.setLang() applied a new UI language (html[lang][dir]
 *                                          already updated); the shell re-renders its chrome and the
 *                                          router re-mounts the current view (params + scroll kept).
 *   status:change {online, mode}        — app.js: navigator online/offline or data mode changed.
 *   panel:change {open, pinned}         — app.js: the activity panel opened / closed / (un)pinned.
 *
 * Every handler runs inside its own try/catch so a failing listener can never
 * break the others or the emitter. Handlers are invoked in subscription order on
 * a snapshot of the listener set, so subscribing/unsubscribing during an emit is
 * safe. Side-effect free on import.
 */

/** @type {Map<string, Set<Function>>} */
const channels = new Map();

/** Resolve (or lazily create) the listener set for an event name. */
function channel(event) {
  let set = channels.get(event);
  if (!set) {
    set = new Set();
    channels.set(event, set);
  }
  return set;
}

/** Report a listener failure without letting it propagate. */
function reportListenerError(event, error) {
  try {
    console.error(`[biltix-hse] bus listener for "${event}" failed:`, error);
  } catch {
    /* console may be unavailable in exotic hosts; swallow */
  }
}

export const bus = {
  /**
   * Subscribe to an event.
   * @param {string} event
   * @param {(payload: any, event: string) => void} handler
   * @returns {() => void} unsubscribe function (idempotent)
   */
  on(event, handler) {
    if (typeof event !== 'string' || typeof handler !== 'function') {
      return () => {};
    }
    channel(event).add(handler);
    let active = true;
    return () => {
      if (!active) return;
      active = false;
      bus.off(event, handler);
    };
  },

  /**
   * Subscribe to the next emission only.
   * @param {string} event
   * @param {(payload: any, event: string) => void} handler
   * @returns {() => void} unsubscribe function
   */
  once(event, handler) {
    if (typeof event !== 'string' || typeof handler !== 'function') {
      return () => {};
    }
    const wrapper = (payload, name) => {
      bus.off(event, wrapper);
      handler(payload, name);
    };
    wrapper.original = handler;
    return bus.on(event, wrapper);
  },

  /**
   * Remove a handler (or every handler of the event when `handler` is omitted).
   * Also removes `once` wrappers registered for the same original handler.
   * @param {string} event
   * @param {Function} [handler]
   */
  off(event, handler) {
    const set = channels.get(event);
    if (!set) return;
    if (handler === undefined) {
      channels.delete(event);
      return;
    }
    set.delete(handler);
    for (const fn of set) {
      if (fn.original === handler) set.delete(fn);
    }
    if (set.size === 0) channels.delete(event);
  },

  /**
   * Emit an event to every subscriber. Each handler is isolated in try/catch.
   * @param {string} event
   * @param {any} [payload]
   * @returns {number} number of handlers invoked
   */
  emit(event, payload) {
    const set = channels.get(event);
    if (!set || set.size === 0) return 0;
    const snapshot = Array.from(set);
    for (const handler of snapshot) {
      try {
        handler(payload, event);
      } catch (error) {
        reportListenerError(event, error);
      }
    }
    return snapshot.length;
  },
};

export default bus;
