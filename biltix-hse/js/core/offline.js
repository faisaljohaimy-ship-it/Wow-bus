/**
 * BILTIX Risk AI — offline field layer (js/core/offline.js). Guide: docs/offline.md.
 *
 *   Outbox       createOutbox({ storage, apply }) — a FIFO queue of user actions (risk.add · alert.ack · task.status ·
 *                checklist.tick), each with an idempotency key. enqueue() refuses a key it has seen (pending, synced
 *                or applied before), replay() applies pending entries in order and records each applied key so a
 *                second replay never applies twice; a failed entry stays visible ("needs attention") and is retried
 *                by the next replay. Storage: IndexedDB → localStorage → memory (node tests use memoryStorage()).
 *   Demo truth   There is no server. "Sync" replays the queued actions into the local store of this browser and
 *                the UI says so. Actions taken on other pages save to this browser directly (no queue).
 *   Network      isOnline() = navigator.onLine and not the field kit's "simulate offline" switch.
 *   Service      registerServiceWorker(): sw.js?v=<build stamp> (meta biltix-build) after load + idle. Skipped
 *   worker       without serviceWorker / secure context, on file:, and on localhost or under automation unless
 *                opted in (?sw=1 or localStorage 'biltix-hse:sw' = 'on') — no service worker in tests.
 *   Indicator    initOffline() mounts one polite status pill in the app bar (#netIndicator → #/fieldkit), visible
 *                while offline or while actions wait.
 *   Start        initOffline({ store, bus, toast }) is idempotent and returns one promise. js/app.js calls it at the
 *                end of boot (after the first view and the live engines); the field kit calls it on mount, so a
 *                deep link to #/fieldkit does not wait for the boot tail. act() waits for it; when it is ready it
 *                emits 'field:outbox' once so panels mounted earlier (Settings → Offline) repaint.
 *
 * No innerHTML; text through textContent. Strings: dictionary 'fieldkit' (js/i18n/fieldkit.js).
 */
import { i18n, t, tn } from './i18n.js';
import fieldDict from '../i18n/fieldkit.js';

i18n.register('fieldkit', fieldDict);

export const OUTBOX_KINDS = Object.freeze(['risk.add', 'alert.ack', 'task.status', 'checklist.tick']);
export const OUTBOX_CAP = 200;
export const APPLIED_CAP = 500;
export const OUTBOX_LS_KEY = 'biltix-hse:outbox';
export const SW_OPT_KEY = 'biltix-hse:sw';
export const CACHE_PREFIX = 'biltix-';
const FIELD_ACTOR = 'عُدّة الميدان';

const clone = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));
const iso = (d) => (d instanceof Date ? d : new Date(d)).toISOString();

/* ------------------------------------------------------------------ */
/* Storage adapters                                                    */
/* ------------------------------------------------------------------ */

export function memoryStorage(initial = null) {
  let value = initial ? clone(initial) : null;
  return { kind: 'memory', async load() { return value ? clone(value) : null; }, async save(next) { value = clone(next); } };
}

export function localStorageAdapter(key = OUTBOX_LS_KEY) {
  return {
    kind: 'localStorage',
    async load() { try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : null; } catch { return null; } },
    async save(next) { localStorage.setItem(key, JSON.stringify(next)); },
  };
}

/** One record ('outbox') in an IndexedDB key/value store. Rejects when IndexedDB cannot open. */
export function idbStorage({ db = 'biltix-hse-field', store = 'kv', key = 'outbox' } = {}) {
  let opening = null;
  const open = () => opening || (opening = new Promise((resolve, reject) => {
    const req = indexedDB.open(db, 1);
    req.onupgradeneeded = () => { if (!req.result.objectStoreNames.contains(store)) req.result.createObjectStore(store); };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => { opening = null; reject(req.error || new Error('indexedDB open failed')); };
    req.onblocked = () => { opening = null; reject(new Error('indexedDB blocked')); };
  }));
  const run = (mode, fn) => open().then((conn) => new Promise((resolve, reject) => {
    const tx = conn.transaction(store, mode);
    const out = fn(tx.objectStore(store));
    tx.oncomplete = () => resolve(out && 'result' in out ? out.result : undefined);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('aborted'));
  }));
  return {
    kind: 'indexedDB',
    open,
    async load() { const v = await run('readonly', (s) => s.get(key)); return v ? clone(v) : null; },
    async save(next) { await run('readwrite', (s) => s.put(clone(next), key)); },
  };
}

/** IndexedDB when it opens, else localStorage, else memory. */
export async function pickStorage() {
  if (typeof indexedDB !== 'undefined') {
    const idb = idbStorage();
    try { await idb.open(); return idb; } catch { /* private mode / blocked: fall back */ }
  }
  try { localStorage.setItem(`${OUTBOX_LS_KEY}:probe`, '1'); localStorage.removeItem(`${OUTBOX_LS_KEY}:probe`); return localStorageAdapter(); } catch { /* no storage */ }
  return memoryStorage();
}

/* ------------------------------------------------------------------ */
/* Outbox                                                              */
/* ------------------------------------------------------------------ */

/** Deterministic key: the same intent (ack AL7, move MT-12 to "in progress") always gets the same key. */
export function idemKey(kind, ...parts) { return [kind, ...parts.map((p) => String(p))].join(':'); }

/** Random key for one-off creations (a risk form instance). */
export function randomKey(kind) {
  const c = typeof crypto !== 'undefined' ? crypto : null;
  const id = c && typeof c.randomUUID === 'function' ? c.randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  return `${kind}:${id}`;
}

function sanitizeData(saved) {
  const base = { v: 1, seq: 0, entries: [], applied: [] };
  if (!saved || typeof saved !== 'object' || saved.v !== 1) return base;
  const entries = (Array.isArray(saved.entries) ? saved.entries : []).filter((e) => e && typeof e.key === 'string' && OUTBOX_KINDS.includes(e.kind) && Number.isFinite(e.seq));
  const seq = Math.max(Number(saved.seq) || 0, ...entries.map((e) => e.seq));
  return { v: 1, seq, entries, applied: (Array.isArray(saved.applied) ? saved.applied : []).filter((k) => typeof k === 'string').slice(-APPLIED_CAP) };
}

export function createOutbox({ storage = memoryStorage(), now = () => new Date(), apply = null } = {}) {
  let data = sanitizeData(null);
  let loading = null;
  let replaying = null;
  const subs = new Set();
  const sorted = () => data.entries.slice().sort((a, b) => a.seq - b.seq);
  const persist = async () => { try { await storage.save(data); } catch { /* quota / private mode: the queue stays in memory */ } };
  const emit = () => subs.forEach((fn) => { try { fn(api); } catch { /* a subscriber's error is not the queue's */ } });

  const api = {
    get storageKind() { return storage.kind || 'memory'; },
    ready() {
      if (!loading) loading = Promise.resolve().then(() => storage.load()).then((saved) => { data = sanitizeData(saved); }).catch(() => { /* unreadable: start empty */ });
      return loading;
    },
    /** All entries, oldest first (copies). */
    list() { return clone(sorted()); },
    /** Entries not yet synced (pending or failed), oldest first. */
    pending() { return clone(sorted().filter((e) => e.status !== 'synced')); },
    count() { return data.entries.filter((e) => e.status !== 'synced').length; },
    failedCount() { return data.entries.filter((e) => e.status === 'failed').length; },
    has(key) { return data.entries.some((e) => e.key === key) || data.applied.includes(key); },
    async enqueue(kind, payload = {}, { key = '' } = {}) {
      await api.ready();
      if (!OUTBOX_KINDS.includes(kind)) throw new Error(`unknown outbox kind "${kind}"`);
      const k = key || randomKey(kind);
      const existing = data.entries.find((e) => e.key === k);
      if (existing || data.applied.includes(k)) return { entry: existing ? clone(existing) : null, duplicate: true };
      data.seq += 1;
      const entry = { key: k, kind, payload: clone(payload), seq: data.seq, createdAt: iso(now()), status: 'pending', attempts: 0, syncedAt: null, error: null };
      data.entries.push(entry);
      // Cap: drop the oldest synced entries first (pending ones are never dropped).
      while (data.entries.length > OUTBOX_CAP) {
        const i = sorted().findIndex((e) => e.status === 'synced');
        if (i === -1) break;
        const victim = sorted()[i];
        data.entries = data.entries.filter((e) => e !== victim);
      }
      await persist();
      emit();
      return { entry: clone(entry), duplicate: false };
    },
    /** Apply pending entries in order. Resolves to { applied, skipped, failed }. One replay at a time. */
    replay(applyFn = apply) {
      if (replaying) return replaying;
      replaying = (async () => {
        await api.ready();
        const res = { applied: 0, skipped: 0, failed: 0 };
        for (const e of sorted()) {
          if (e.status === 'synced') continue;
          e.attempts += 1;
          if (data.applied.includes(e.key)) { e.status = 'synced'; e.syncedAt = iso(now()); e.error = null; res.skipped += 1; continue; }
          try {
            if (typeof applyFn !== 'function') throw new Error('no apply handler');
            const out = await applyFn(clone(e));
            if (out && out.ok === false) throw Object.assign(new Error(out.message || out.reason || 'rejected'), { conflict: out.reason === 'conflict' });
            data.applied.push(e.key);
            e.status = 'synced';
            e.syncedAt = iso(now());
            e.error = null;
            res.applied += 1;
          } catch (err) {
            e.status = 'failed';
            e.error = String((err && err.message) || err).slice(0, 200);
            res.failed += 1;
          }
        }
        if (data.applied.length > APPLIED_CAP) data.applied = data.applied.slice(-APPLIED_CAP);
        await persist();
        emit();
        return res;
      })().finally(() => { replaying = null; });
      return replaying;
    },
    async clearSynced() { await api.ready(); data.entries = data.entries.filter((e) => e.status !== 'synced'); await persist(); emit(); },
    async clearAll() { await api.ready(); data = { v: 1, seq: data.seq, entries: [], applied: [] }; await persist(); emit(); },
    subscribe(fn) { subs.add(fn); return () => subs.delete(fn); },
  };
  return api;
}

/* ------------------------------------------------------------------ */
/* Field controller (browser)                                          */
/* ------------------------------------------------------------------ */

const field = { store: null, bus: null, toast: null, outbox: null, simulated: false, sw: { state: 'idle', reason: '', version: '' }, inited: false };

export function isOnline() {
  return !field.simulated && !(typeof navigator !== 'undefined' && navigator.onLine === false);
}
export function isSimulatedOffline() { return field.simulated; }
export function outbox() { return field.outbox; }
export function swInfo() { return { ...field.sw }; }

function emitNet() {
  if (field.bus) field.bus.emit('field:network', { online: isOnline(), simulated: field.simulated });
}

/** The demo's "simulate offline" switch (field kit). Going back online replays the queue. */
export function setSimulatedOffline(on) {
  field.simulated = Boolean(on);
  emitNet();
  paintIndicator();
  if (!field.simulated && isOnline()) syncNow({ announce: true });
}

const localized = (out) => (out && (i18n.lang() === 'en' ? (out.messageEn || out.message) : out.message)) || '';

/** The apply handler for `store`: one outbox entry → the local store (the demo's stand-in for the server). */
export function storeApplier(store) {
  return (entry) => applyEntry(store, entry);
}

function applyEntry(store, entry) {
  if (!store) throw new Error('store unavailable');
  const p = entry.payload || {};
  if (entry.kind === 'risk.add') {
    const risk = store.addRisk({ ...p.risk, source: 'عُدّة الميدان', sourceEn: 'Field kit' });
    return risk ? { ok: true, id: risk.id } : { ok: false, message: t('fieldkit.outbox.err.rejected') };
  }
  if (entry.kind === 'alert.ack') {
    const alert = store.ackAlert(p.alertId, p.by || FIELD_ACTOR);
    return alert ? { ok: true } : { ok: false, message: t('fieldkit.outbox.err.missing', { code: p.code || p.alertId }) };
  }
  if (entry.kind === 'task.status') {
    const tasks = (store.state && store.state.platform && store.state.platform.tasks) || [];
    const task = tasks.find((x) => x && x.id === p.taskId);
    if (!task) return { ok: false, message: t('fieldkit.outbox.err.missing', { code: p.code || p.taskId }) };
    if (task.status === p.to) return { ok: true };
    // Conflict: the task moved since the action was queued — overwrite nothing.
    if (p.from && task.status !== p.from) return { ok: false, reason: 'conflict', message: t('fieldkit.outbox.err.conflict', { code: task.code, status: i18n.label('taskStatus', task.status) }) };
    const out = store.updateTask(task.id, { status: p.to, by: p.by || FIELD_ACTOR });
    return out ? { ok: true } : { ok: false, message: localized(out) || t('fieldkit.outbox.err.rejected') };
  }
  if (entry.kind === 'checklist.tick') {
    const insp = ((store.state && store.state.inspections) || []).find((x) => x && x.id === p.inspectionId);
    if (!insp) return { ok: false, message: t('fieldkit.outbox.err.missing', { code: p.code || p.inspectionId }) };
    const total = Number(insp.checklistTotal) || 0;
    const done = Math.min(total || Infinity, (Number(insp.checklistDone) || 0) + 1);
    return store.updateInspection(insp.id, { checklistDone: done }) ? { ok: true } : { ok: false, message: t('fieldkit.outbox.err.rejected') };
  }
  return { ok: false, message: t('fieldkit.outbox.err.rejected') };
}

/**
 * Record a field action. Online: queued and replayed at once (applied to the local store). Offline: kept in the
 * outbox as "waiting to sync". Resolves to { duplicate, queued, entry }.
 */
export async function act(kind, payload, { key = '' } = {}) {
  // The app starts this layer after the first view (js/app.js boot); a field action taken in that window waits for it.
  if (!field.outbox && initPromise) await initPromise;
  if (!field.outbox) throw new Error('offline layer not initialised');
  const res = await field.outbox.enqueue(kind, payload, { key });
  if (res.duplicate) return { ...res, queued: false };
  if (isOnline()) {
    await field.outbox.replay();
    return { ...res, queued: false };
  }
  paintIndicator();
  return { ...res, queued: true };
}

export async function syncNow({ announce = false } = {}) {
  if (!field.outbox || !isOnline()) return { applied: 0, skipped: 0, failed: 0 };
  const waiting = field.outbox.count();
  const res = await field.outbox.replay();
  if (announce && waiting && field.toast) {
    const tone = res.failed ? 'warning' : 'good';
    field.toast(res.failed ? t('fieldkit.sync.partial', { applied: res.applied, failed: res.failed }) : tn('fieldkit.sync.done', res.applied + res.skipped), { tone, timeout: 6000 });
  }
  paintIndicator();
  return res;
}

/* ------------------------------------------------------------------ */
/* Service worker                                                      */
/* ------------------------------------------------------------------ */

export function buildStamp() {
  const m = typeof document !== 'undefined' ? document.querySelector('meta[name="biltix-build"]') : null;
  return (m && m.getAttribute('content')) || 'dev';
}

/** Why the service worker is not registered here ('' when it may be). */
export function swSkipReason() {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return 'unsupported';
  if (typeof location === 'undefined' || location.protocol === 'file:') return 'file';
  if (typeof window !== 'undefined' && window.isSecureContext === false) return 'insecure';
  let opt = '';
  try { opt = localStorage.getItem(SW_OPT_KEY) || ''; } catch { /* storage blocked */ }
  if (/[?&]sw=1\b/.test(`${location.search}&${location.hash}`)) {
    opt = 'on';
    try { localStorage.setItem(SW_OPT_KEY, 'on'); } catch { /* ignore */ }
  }
  if (opt === 'off') return 'disabled';
  const local = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
  if ((local || navigator.webdriver) && opt !== 'on') return local ? 'local' : 'automation';
  return '';
}

export async function registerServiceWorker() {
  const skip = swSkipReason();
  if (skip) { field.sw = { state: 'skipped', reason: skip, version: '' }; return null; }
  const version = buildStamp();
  field.sw = { state: 'registering', reason: '', version };
  try {
    const reg = await navigator.serviceWorker.register(`sw.js?v=${encodeURIComponent(version)}`, { scope: './', updateViaCache: 'none' });
    const sync = () => {
      const active = reg.active || null;
      field.sw.state = navigator.serviceWorker.controller && active ? 'ready' : (reg.installing || reg.waiting ? 'installing' : (active ? 'ready' : 'registering'));
      if (field.bus) field.bus.emit('field:sw', swInfo());
    };
    reg.addEventListener('updatefound', () => { const w = reg.installing; if (w) w.addEventListener('statechange', sync); sync(); });
    navigator.serviceWorker.addEventListener('controllerchange', sync);
    sync();
    return reg;
  } catch (err) {
    field.sw = { state: 'error', reason: String((err && err.message) || err).slice(0, 160), version };
    if (field.bus) field.bus.emit('field:sw', swInfo());
    return null;
  }
}

/** Offline copy: number of cached files in this build's caches. */
export async function cacheInfo() {
  if (typeof caches === 'undefined') return { supported: false, files: 0, names: [] };
  try {
    const names = (await caches.keys()).filter((n) => n.startsWith(CACHE_PREFIX));
    let files = 0;
    for (const n of names) files += (await (await caches.open(n)).keys()).length;
    return { supported: true, files, names };
  } catch { return { supported: false, files: 0, names: [] }; }
}

export async function storageInfo() {
  const s = typeof navigator !== 'undefined' ? navigator.storage : null;
  const out = { supported: Boolean(s && s.estimate), usage: null, quota: null, persisted: null, canPersist: Boolean(s && s.persist) };
  try { if (s && s.estimate) { const e = await s.estimate(); out.usage = e.usage ?? null; out.quota = e.quota ?? null; } } catch { /* unsupported */ }
  try { if (s && s.persisted) out.persisted = await s.persisted(); } catch { /* unsupported */ }
  return out;
}

export async function requestPersistence() {
  try { return Boolean(navigator.storage && navigator.storage.persist && await navigator.storage.persist()); } catch { return false; }
}

/** Delete this app's caches and unregister its service worker (rebuilt on the next load). */
export async function clearOfflineCache() {
  let removed = 0;
  try {
    if (typeof caches !== 'undefined') {
      for (const n of await caches.keys()) if (n.startsWith(CACHE_PREFIX) && await caches.delete(n)) removed += 1;
    }
    if (typeof navigator !== 'undefined' && navigator.serviceWorker) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((r) => r.unregister()));
    }
  } catch { /* partial: report what was removed */ }
  field.sw = { state: 'cleared', reason: '', version: '' };
  if (field.bus) field.bus.emit('field:sw', swInfo());
  return removed;
}

/* ------------------------------------------------------------------ */
/* App-bar indicator                                                   */
/* ------------------------------------------------------------------ */

const ind = { root: null, link: null, label: null, count: null, sr: null, lastSr: '' };

function mountIndicator() {
  if (ind.root || typeof document === 'undefined') return;
  const host = document.querySelector('.appbar-end');
  if (!host) return;
  const root = document.createElement('div');
  root.className = 'net-ind';
  root.id = 'netIndicator';
  const link = document.createElement('a');
  link.className = 'net-ind-link';
  link.href = '#/fieldkit';
  link.hidden = true;
  const dot = document.createElement('span');
  dot.className = 'net-ind-dot';
  dot.setAttribute('aria-hidden', 'true');
  const label = document.createElement('span');
  label.className = 'net-ind-label';
  const count = document.createElement('span');
  count.className = 'net-ind-count mono';
  count.hidden = true;
  link.append(dot, label, ' ', count);   // the space keeps "Offline" and the count two words in the link's text
  // Polite live text (one sentence per state change); the pill itself is a plain link.
  const sr = document.createElement('span');
  sr.className = 'sr-only';
  sr.setAttribute('role', 'status');
  sr.setAttribute('aria-live', 'polite');
  root.append(link, sr);
  const anchor = document.getElementById('dataStatus');
  host.insertBefore(root, anchor && anchor.parentNode === host ? anchor : host.firstChild);
  Object.assign(ind, { root, link, label, count, sr });
}

export function paintIndicator() {
  if (!ind.root) return;
  const online = isOnline();
  const waiting = field.outbox ? field.outbox.count() : 0;
  const failed = field.outbox ? field.outbox.failedCount() : 0;
  const show = !online || waiting > 0;
  ind.link.hidden = !show;
  ind.root.dataset.state = !online ? 'offline' : (failed ? 'attention' : (waiting ? 'waiting' : 'online'));
  const short = !online ? t(field.simulated ? 'fieldkit.net.offlineSimShort' : 'fieldkit.net.offlineShort') : (failed ? t('fieldkit.net.attentionShort') : t('fieldkit.net.waitingShort'));
  ind.label.textContent = short;
  ind.count.hidden = !waiting;
  ind.count.textContent = waiting ? String(waiting) : '';
  const sentence = !online ? t('fieldkit.net.offlineSentence') : (waiting ? tn('fieldkit.net.waitingSentence', waiting) : '');
  const full = [sentence, field.simulated ? t('fieldkit.net.simulatedNote') : ''].filter(Boolean).join(' ');
  if (show) {
    ind.link.title = full;
    // Label in name (WCAG 2.5.3): the name starts with what the pill shows (the state and, when there is one, the
    // count as a digit — the Arabic sentence spells small counts out), then says it in full and where the link leads.
    ind.link.setAttribute('aria-label', `${short}${waiting ? ` ${waiting} — ${tn('fieldkit.net.waitingSentence', waiting)}` : ''} — ${t('fieldkit.net.open')}`);
  }
  // Speak only when the state sentence changes (not on every repaint).
  const speak = !online ? full : '';
  if (speak !== ind.lastSr) { ind.lastSr = speak; ind.sr.textContent = speak; }
}

/* ------------------------------------------------------------------ */
/* Boot hook (js/app.js)                                               */
/* ------------------------------------------------------------------ */

let initPromise = null;

/**
 * Outbox, indicator, network listeners, service worker. Called by js/app.js at the end of boot and by the field
 * kit when it mounts first (a deep link): one initialisation, every caller gets the same promise, which resolves
 * to the outbox once it has loaded.
 */
export function initOffline(opts = {}) {
  if (!initPromise) initPromise = startOffline(opts);
  return initPromise;
}

/** Resolves when the outbox is usable (null when initOffline was never called). */
export function offlineReady() { return initPromise || Promise.resolve(null); }

async function startOffline({ store, bus, toast } = {}) {
  field.inited = true;
  Object.assign(field, { store: store || null, bus: bus || null, toast: typeof toast === 'function' ? toast : null });
  field.outbox = createOutbox({ storage: await pickStorage(), apply: storeApplier(field.store) });
  await field.outbox.ready();
  mountIndicator();
  // Known service-worker state before the deferred registration runs (a controlled page is already offline-ready).
  const skip = swSkipReason();
  const ctl = !skip && navigator.serviceWorker.controller;
  if (skip) field.sw = { state: 'skipped', reason: skip, version: '' };
  else if (ctl) field.sw = { state: 'ready', reason: '', version: new URL(ctl.scriptURL).searchParams.get('v') || '' };
  field.outbox.subscribe(() => { paintIndicator(); if (field.bus) field.bus.emit('field:outbox', { waiting: field.outbox.count() }); });
  if (typeof window !== 'undefined') {
    const onNet = () => { emitNet(); paintIndicator(); if (isOnline()) syncNow({ announce: true }); };
    window.addEventListener('online', onNet);
    window.addEventListener('offline', onNet);
  }
  if (bus) bus.on('lang:change', () => { ind.lastSr = ''; paintIndicator(); });
  paintIndicator();
  // Views mounted before this point (a deep link to #/fieldkit or Settings → Offline) repaint with the real outbox.
  if (field.bus) field.bus.emit('field:outbox', { waiting: field.outbox.count() });
  if (isOnline() && field.outbox.count()) syncNow({ announce: true });
  // Service worker after load and an idle moment: never competes with the first render or the LCP image.
  const later = () => registerServiceWorker();
  const idle = () => (typeof requestIdleCallback === 'function' ? requestIdleCallback(later, { timeout: 4000 }) : setTimeout(later, 1500));
  if (typeof document !== 'undefined' && document.readyState === 'complete') setTimeout(idle, 1500);
  else if (typeof window !== 'undefined') window.addEventListener('load', () => setTimeout(idle, 1500), { once: true });
  return field.outbox;
}

export default { createOutbox, storeApplier, memoryStorage, localStorageAdapter, idbStorage, idemKey, randomKey, initOffline, offlineReady, act, syncNow, isOnline, setSimulatedOffline, isSimulatedOffline, outbox, swInfo, swSkipReason, registerServiceWorker, cacheInfo, storageInfo, requestPersistence, clearOfflineCache, buildStamp, paintIndicator };
