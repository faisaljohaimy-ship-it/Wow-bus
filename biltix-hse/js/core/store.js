/**
 * Biltix HSE — state store (js/core/store.js)
 *
 * Single live state object + localStorage persistence + CRUD + filters + settings.
 * Contract (ARCHITECTURE.md §4). Highlights:
 *
 *   • State shape: { ...seed, feed, settings, filters, meta:{version, savedAt, anchorDate} }
 *   • Persistence key 'biltix-hse:v1', debounced 300 ms, every storage access guarded
 *     (private mode / quota / disabled storage never throws).
 *   • Time re-anchoring: seed dates are authored against 2026-11-09. On every load the
 *     whole dataset is shifted by the number of days between the stored anchor and
 *     today, preserving clock time and UTC offsets, so the demo always looks current.
 *   • Saved state (same version) wins for the collections the app mutates; reference
 *     data (sites, courses, workers, ISO clauses, legal register, sensors, company)
 *     always comes from the current seed so deployments never show stale reference data.
 *   • CRUD helpers generate ids/codes (R-1049, INC-2026-032, PTW-5543), stamp
 *     createdAt/updatedAt, push a feed event and emit `store:change`.
 *
 * Side effects on import are limited to reading localStorage once to build `state`.
 */

import seed, { RISK_STATUS, CONTROL_TYPES, INCIDENT_TYPES, INCIDENT_STATUS, PERMIT_TYPES, PERMIT_STATUS } from '../data/seed.js';
import { bus } from './bus.js';
import { sel } from './selectors.js';

export const STORAGE_KEY = 'biltix-hse:v1';
export const STATE_VERSION = 1;
export const SEED_ANCHOR_DATE = '2026-11-09';
export const FEED_CAP = 200;
const PERSIST_DEBOUNCE_MS = 300;
const DAY_MS = 86_400_000;

export const DEFAULT_SETTINGS = deepFreeze({
  theme: 'dark',
  numerals: 'latn',
  brand: { primary: '#2F6FED', accent: '#19C6E6', companyName: 'بلتكس', logoUrl: '' },
  sound: false,
  feedPaused: false,
  dataSource: { type: 'simulation', url: '', apiKey: '', table: '' },
  alertWebhook: '',
});

export const DEFAULT_FILTERS = deepFreeze({ siteId: 'all', range: 30, search: '' });

/** Collections the UI mutates; a saved copy of these overrides the seed on load. */
const MUTABLE_COLLECTIONS = ['risks', 'incidents', 'permits', 'inspections', 'integrations', 'feed'];

/** Date-bearing fields shifted by `reanchor()` — one entry per collection. */
const DATE_FIELDS = {
  risks: { own: ['dueDate', 'createdAt', 'updatedAt', 'closedAt'], children: { history: ['at'] } },
  incidents: { own: ['date', 'createdAt', 'updatedAt', 'closedAt'], children: { actions: ['due', 'doneAt'] } },
  permits: { own: ['startsAt', 'expiresAt', 'createdAt', 'updatedAt', 'approvedAt'] },
  inspections: { own: ['date', 'createdAt', 'updatedAt'] },
  workers: { children: { certs: ['completedAt', 'expiresAt'] } },
  integrations: { own: ['lastSync'] },
  legalRegister: { own: ['lastReview', 'nextReview'] },
  feed: { own: ['ts'] },
};

/* ────────────────────────────── generic helpers ────────────────────────────── */

function deepFreeze(obj) {
  for (const value of Object.values(obj)) {
    if (value && typeof value === 'object' && !Object.isFrozen(value)) deepFreeze(value);
  }
  return Object.freeze(obj);
}

function isPlainObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v) && !(v instanceof Date);
}

function clone(value) {
  try {
    return structuredClone(value);
  } catch {
    return JSON.parse(JSON.stringify(value));
  }
}

/** Recursive merge: plain objects merge key by key, arrays and scalars replace. */
function deepMerge(target, patch) {
  if (!isPlainObject(patch)) return patch;
  const out = isPlainObject(target) ? { ...target } : {};
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) continue;
    out[key] = isPlainObject(value) && isPlainObject(out[key]) ? deepMerge(out[key], value) : (Array.isArray(value) ? value.slice() : value);
  }
  return out;
}

function pad(n, width) {
  return String(n).padStart(width, '0');
}

function clampInt(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

function text(value, fallback = '') {
  return typeof value === 'string' ? value.trim() : (value == null ? fallback : String(value));
}

function pickEnum(value, list, fallback) {
  return Array.isArray(list) && list.includes(value) ? value : fallback;
}

/** Local-time ISO string with explicit offset: "2026-11-09T14:20:05+03:00". */
export function localISO(date = new Date()) {
  const d = date instanceof Date ? date : new Date(date);
  const offsetMin = -d.getTimezoneOffset();
  const sign = offsetMin >= 0 ? '+' : '-';
  const abs = Math.abs(offsetMin);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1, 2)}-${pad(d.getDate(), 2)}`
    + `T${pad(d.getHours(), 2)}:${pad(d.getMinutes(), 2)}:${pad(d.getSeconds(), 2)}`
    + `${sign}${pad(Math.floor(abs / 60), 2)}:${pad(abs % 60, 2)}`;
}

/** Local calendar date "YYYY-MM-DD". */
export function todayISO(date = new Date()) {
  const d = date instanceof Date ? date : new Date(date);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1, 2)}-${pad(d.getDate(), 2)}`;
}

function addMs(date, ms) {
  return new Date(date.getTime() + ms);
}

/** Whole days from ISO calendar date `a` to `b` (both "YYYY-MM-DD…"). */
function daysBetween(a, b) {
  const pa = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(a));
  const pb = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(b));
  if (!pa || !pb) return 0;
  const ua = Date.UTC(+pa[1], +pa[2] - 1, +pa[3]);
  const ub = Date.UTC(+pb[1], +pb[2] - 1, +pb[3]);
  return Math.round((ub - ua) / DAY_MS);
}

/**
 * Shift the calendar part of an ISO string by `days`, preserving the time-of-day and
 * the offset suffix verbatim ("2026-11-09T06:00:00+03:00" → "2026-11-16T06:00:00+03:00").
 */
export function shiftISO(value, days) {
  if (typeof value !== 'string' || days === 0) return value;
  const m = /^(\d{4})-(\d{2})-(\d{2})(.*)$/s.exec(value);
  if (!m) return value;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3] + days));
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1, 2)}-${pad(d.getUTCDate(), 2)}${m[4]}`;
}

function shiftFields(obj, keys, days) {
  if (!isPlainObject(obj)) return;
  for (const key of keys) {
    if (typeof obj[key] === 'string') obj[key] = shiftISO(obj[key], days);
  }
}

/**
 * Re-anchor every date in `state` from `state.meta.anchorDate` (default 2026-11-09)
 * to the calendar day of `nowDate`. Returns the day delta applied.
 */
export function reanchor(state, nowDate = new Date()) {
  if (!isPlainObject(state)) return 0;
  const today = todayISO(nowDate);
  const meta = isPlainObject(state.meta) ? state.meta : (state.meta = {});
  const anchor = typeof meta.anchorDate === 'string' ? meta.anchorDate : SEED_ANCHOR_DATE;
  const delta = daysBetween(anchor, today);
  if (delta !== 0) {
    for (const [collection, spec] of Object.entries(DATE_FIELDS)) {
      const items = state[collection];
      if (!Array.isArray(items)) continue;
      for (const item of items) {
        if (spec.own) shiftFields(item, spec.own, delta);
        if (spec.children) {
          for (const [childKey, childFields] of Object.entries(spec.children)) {
            const children = item && item[childKey];
            if (Array.isArray(children)) children.forEach((child) => shiftFields(child, childFields, delta));
          }
        }
      }
    }
  }
  meta.anchorDate = today;
  return delta;
}

/** Feed items re-anchored into the future read oddly ("خلال 3 ساعات"); clamp them to now. */
function clampFutureFeed(feed, nowDate) {
  if (!Array.isArray(feed)) return;
  const nowMs = nowDate.getTime();
  const nowIso = localISO(nowDate);
  for (const item of feed) {
    const t = Date.parse(item && item.ts);
    if (Number.isFinite(t) && t > nowMs) item.ts = nowIso;
  }
}

/* ────────────────────────────── storage adapter ────────────────────────────── */

function resolveStorage() {
  try {
    const s = globalThis.localStorage;
    if (!s) return null;
    const probe = `${STORAGE_KEY}:probe`;
    s.setItem(probe, '1');
    s.removeItem(probe);
    return s;
  } catch {
    return null;
  }
}

const storage = resolveStorage();

function readSaved() {
  if (!storage) return null;
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!isPlainObject(parsed) || !isPlainObject(parsed.meta) || parsed.meta.version !== STATE_VERSION) return null;
    return parsed;
  } catch {
    return null;
  }
}

/* ────────────────────────────── state construction ────────────────────────────── */

function buildFreshState(nowDate) {
  const base = clone(seed);
  base.feed = [];
  base.settings = clone(DEFAULT_SETTINGS);
  base.filters = { ...DEFAULT_FILTERS };
  base.meta = {
    version: STATE_VERSION,
    savedAt: null,
    anchorDate: isPlainObject(seed.meta) && typeof seed.meta.anchorDate === 'string' ? seed.meta.anchorDate : SEED_ANCHOR_DATE,
  };
  reanchor(base, nowDate);
  return base;
}

/** Overlay a saved/imported snapshot onto a fresh seed-derived state (in place). */
function overlaySnapshot(base, snapshot, nowDate) {
  const saved = clone(snapshot);
  if (!isPlainObject(saved.meta)) saved.meta = {};
  if (typeof saved.meta.anchorDate !== 'string') saved.meta.anchorDate = SEED_ANCHOR_DATE;
  reanchor(saved, nowDate);
  for (const key of MUTABLE_COLLECTIONS) {
    if (Array.isArray(saved[key])) base[key] = saved[key];
  }
  if (Array.isArray(base.feed) && base.feed.length > FEED_CAP) base.feed.length = FEED_CAP;
  clampFutureFeed(base.feed, nowDate);
  if (isPlainObject(saved.settings)) base.settings = deepMerge(clone(DEFAULT_SETTINGS), saved.settings);
  if (isPlainObject(saved.filters)) base.filters = { ...DEFAULT_FILTERS, ...saved.filters, search: '' };
  base.meta.savedAt = typeof saved.meta.savedAt === 'string' ? saved.meta.savedAt : null;
  base.meta.anchorDate = todayISO(nowDate);
  return base;
}

function createInitialState() {
  const now = new Date();
  const fresh = buildFreshState(now);
  const saved = readSaved();
  return saved ? overlaySnapshot(fresh, saved, now) : fresh;
}

const state = createInitialState();

/* ────────────────────────────── persistence ────────────────────────────── */

let persistTimer = null;
let flushHookInstalled = false;

function persistNow() {
  if (persistTimer) {
    clearTimeout(persistTimer);
    persistTimer = null;
  }
  if (!storage) return false;
  try {
    state.meta.savedAt = localISO(new Date());
    storage.setItem(STORAGE_KEY, JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}

function installFlushHook() {
  if (flushHookInstalled || typeof window === 'undefined' || typeof window.addEventListener !== 'function') return;
  flushHookInstalled = true;
  window.addEventListener('pagehide', () => { if (persistTimer) persistNow(); });
}

function schedulePersist() {
  if (!storage) return;
  installFlushHook();
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(persistNow, PERSIST_DEBOUNCE_MS);
}

function changed(path) {
  schedulePersist();
  bus.emit('store:change', { path });
}

/* ────────────────────────────── path access ────────────────────────────── */

function splitPath(path) {
  return typeof path === 'string' && path.length ? path.split('.') : [];
}

function getPath(obj, path) {
  let node = obj;
  for (const key of splitPath(path)) {
    if (node == null) return undefined;
    node = node[key];
  }
  return node;
}

function setPath(obj, path, value) {
  const keys = splitPath(path);
  if (keys.length === 0) return false;
  let node = obj;
  for (let i = 0; i < keys.length - 1; i += 1) {
    const key = keys[i];
    if (!isPlainObject(node[key]) && !Array.isArray(node[key])) node[key] = {};
    node = node[key];
  }
  node[keys[keys.length - 1]] = value;
  return true;
}

/* ────────────────────────────── id / code generation ────────────────────────────── */

function maxCaptured(items, regex) {
  let max = 0;
  for (const item of items || []) {
    const m = regex.exec(String(item && item.code || ''));
    if (m) max = Math.max(max, Number(m[1]) || 0);
  }
  return max;
}

function nextId(items, prefix) {
  const re = new RegExp(`^${prefix}(\\d+)$`);
  let max = 0;
  const ids = new Set();
  for (const item of items || []) {
    if (!item) continue;
    ids.add(item.id);
    const m = re.exec(String(item.id || ''));
    if (m) max = Math.max(max, Number(m[1]) || 0);
  }
  let candidate = `${prefix}${max + 1}`;
  while (ids.has(candidate)) candidate = `${prefix}${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;
  return candidate;
}

let feedCounter = 0;
function nextFeedId() {
  feedCounter = (feedCounter + 1) % 1_000_000;
  return `F-${Date.now().toString(36)}-${feedCounter.toString(36)}`;
}

function siteName(siteId) {
  const site = (state.sites || []).find((s) => s.id === siteId);
  return site ? site.name : '';
}

function findIn(collection, id) {
  return (state[collection] || []).find((item) => item && item.id === id) || null;
}

function patchItem(collection, id, patch, { stamp = true } = {}) {
  const item = findIn(collection, id);
  if (!item || !isPlainObject(patch)) return null;
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined || key === 'id') continue;
    item[key] = isPlainObject(value) && isPlainObject(item[key]) ? deepMerge(item[key], value) : value;
  }
  if (stamp) item.updatedAt = localISO(store.now());
  changed(`${collection}.${id}`);
  return item;
}

function severityTone(severity) {
  if (severity >= 4) return 'critical';
  if (severity === 3) return 'serious';
  return 'warning';
}

function emitFeed(event) {
  const ev = store.pushFeed(event);
  if (ev) bus.emit('feed:event', ev);
  return ev;
}

function normalizeControls(list) {
  if (!Array.isArray(list)) return [];
  // Default control type = administrative controls (4th rung of the hierarchy of controls).
  const defaultType = Array.isArray(CONTROL_TYPES) && CONTROL_TYPES[3] ? CONTROL_TYPES[3] : 'ضوابط إدارية';
  return list
    .map((c) => {
      if (typeof c === 'string') return { type: defaultType, text: c.trim() };
      if (!isPlainObject(c)) return null;
      return { type: pickEnum(c.type, CONTROL_TYPES, defaultType), text: text(c.text) };
    })
    .filter((c) => c && c.text);
}

function normalizeActions(list, nowDate) {
  if (!Array.isArray(list)) return [];
  return list
    .map((a, i) => (isPlainObject(a) ? {
      id: text(a.id) || `A${i + 1}`,
      text: text(a.text),
      owner: text(a.owner),
      due: typeof a.due === 'string' && a.due ? a.due : todayISO(addMs(nowDate, 14 * DAY_MS)),
      done: Boolean(a.done),
    } : null))
    .filter((a) => a && a.text);
}

/* ────────────────────────────── the store ────────────────────────────── */

export const store = {
  /** Live state object (read-only by convention — mutate through the API). */
  state,

  /** Current instant. Single place to read the clock so the UI can be reasoned about. */
  now() {
    return new Date();
  },

  /** Read a dotted path, e.g. store.get('settings.theme'). No path → whole state. */
  get(path) {
    return path ? getPath(state, path) : state;
  },

  /** Write a dotted path; emits store:change {path} and persists. */
  set(path, value) {
    if (!setPath(state, path, value)) return false;
    changed(path);
    return true;
  },

  /**
   * Batch mutation: fn(state) mutates in place. Emits a single store:change.
   * fn may return a string to be used as the change path.
   */
  update(fn, path = '*') {
    if (typeof fn !== 'function') return;
    const result = fn(state);
    changed(typeof result === 'string' && result ? result : path);
  },

  /** subscribe(fn) → unsub; fn(state, {path}). */
  subscribe(fn) {
    if (typeof fn !== 'function') return () => {};
    return bus.on('store:change', (payload) => fn(state, payload || { path: '*' }));
  },

  /** Back to seed + default settings; clears localStorage; keeps the same state object identity. */
  reset() {
    if (persistTimer) {
      clearTimeout(persistTimer);
      persistTimer = null;
    }
    if (storage) {
      try { storage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
    }
    const fresh = buildFreshState(store.now());
    for (const key of Object.keys(state)) delete state[key];
    Object.assign(state, fresh);
    bus.emit('store:change', { path: '*' });
    bus.emit('filters:change', { filters: state.filters });
    bus.emit('settings:change', { settings: state.settings });
    bus.emit('theme:change', { theme: state.settings.theme });
    return state;
  },

  /**
   * Replace the mutable part of the state from an exported JSON snapshot
   * (settings view → "استيراد JSON"). Returns true when the snapshot was accepted.
   */
  importState(snapshot) {
    if (!isPlainObject(snapshot)) return false;
    const hasData = MUTABLE_COLLECTIONS.some((key) => Array.isArray(snapshot[key])) || isPlainObject(snapshot.settings);
    if (!hasData) return false;
    const now = store.now();
    const fresh = overlaySnapshot(buildFreshState(now), snapshot, now);
    for (const key of Object.keys(state)) delete state[key];
    Object.assign(state, fresh);
    changed('*');
    bus.emit('filters:change', { filters: state.filters });
    bus.emit('settings:change', { settings: state.settings });
    bus.emit('theme:change', { theme: state.settings.theme });
    return true;
  },

  /** Write pending changes to localStorage immediately. */
  flush() {
    return persistNow();
  },

  /* ── CRUD: risks ── */

  addRisk(obj = {}) {
    const now = store.now();
    const likelihood = clampInt(obj.likelihood, 1, 5, 3);
    const severity = clampInt(obj.severity, 1, 5, 3);
    const owner = text(obj.owner);
    const risk = {
      ...obj,
      id: nextId(state.risks, 'R'),
      code: text(obj.code) || `R-${Math.max(1000, maxCaptured(state.risks, /^R-(\d+)$/)) + 1}`,
      siteId: text(obj.siteId) || (state.sites && state.sites[0] ? state.sites[0].id : 'S1'),
      categoryId: text(obj.categoryId) || 'height',
      hazard: text(obj.hazard),
      activity: text(obj.activity),
      description: text(obj.description),
      likelihood,
      severity,
      residualLikelihood: clampInt(obj.residualLikelihood, 1, 5, likelihood),
      residualSeverity: clampInt(obj.residualSeverity, 1, 5, severity),
      controls: normalizeControls(obj.controls),
      owner,
      dueDate: typeof obj.dueDate === 'string' && obj.dueDate ? obj.dueDate : todayISO(addMs(now, 14 * DAY_MS)),
      status: pickEnum(obj.status, RISK_STATUS, 'مفتوح'),
      source: text(obj.source) || 'إدخال يدوي',
      legalRef: text(obj.legalRef),
      createdAt: localISO(now),
      updatedAt: localISO(now),
      history: Array.isArray(obj.history) && obj.history.length
        ? obj.history
        : [{ at: localISO(now), by: owner || 'النظام', text: 'إنشاء سجل المخاطرة' }],
    };
    if (!Array.isArray(state.risks)) state.risks = [];
    state.risks.unshift(risk);
    changed(`risks.${risk.id}`);
    const tier = sel.riskTier(sel.riskScore(risk));
    emitFeed({
      type: 'risk',
      tone: sel.tierTone(tier),
      siteId: risk.siteId,
      title: `تسجيل مخاطرة جديدة ${risk.code} — ${tier}`,
      detail: risk.hazard || risk.activity,
      sourceId: 'biltix-hse',
      refId: risk.id,
    });
    return risk;
  },

  updateRisk(id, patch = {}) {
    const risk = findIn('risks', id);
    if (!risk || !isPlainObject(patch)) return null;
    const { by, note, ...rest } = patch;
    const prevStatus = risk.status;
    if (rest.status !== undefined) rest.status = pickEnum(rest.status, RISK_STATUS, risk.status);
    for (const key of ['likelihood', 'severity', 'residualLikelihood', 'residualSeverity']) {
      if (rest[key] !== undefined) rest[key] = clampInt(rest[key], 1, 5, risk[key]);
    }
    if (rest.controls !== undefined) rest.controls = normalizeControls(rest.controls);
    const at = localISO(store.now());
    if (!Array.isArray(risk.history)) risk.history = [];
    if (rest.status && rest.status !== prevStatus) {
      risk.history.push({ at, by: text(by) || risk.owner || 'النظام', text: `تغيير الحالة من «${prevStatus}» إلى «${rest.status}»` });
    }
    if (typeof note === 'string' && note.trim()) {
      risk.history.push({ at, by: text(by) || risk.owner || 'النظام', text: note.trim() });
    }
    return patchItem('risks', id, rest);
  },

  deleteRisk(id) {
    const index = (state.risks || []).findIndex((r) => r && r.id === id);
    if (index === -1) return false;
    state.risks.splice(index, 1);
    changed(`risks.${id}`);
    return true;
  },

  /* ── CRUD: incidents ── */

  addIncident(obj = {}) {
    const now = store.now();
    const year = now.getFullYear();
    const severity = clampInt(obj.severity, 1, 5, 2);
    const type = pickEnum(obj.type, INCIDENT_TYPES, 'حادث وشيك');
    const incident = {
      ...obj,
      id: nextId(state.incidents, 'I'),
      code: text(obj.code) || `INC-${year}-${pad(maxCaptured(state.incidents, /^INC-\d{4}-(\d+)$/) + 1, 3)}`,
      siteId: text(obj.siteId) || (state.sites && state.sites[0] ? state.sites[0].id : 'S1'),
      type,
      severity,
      date: typeof obj.date === 'string' && obj.date ? obj.date : todayISO(now),
      time: typeof obj.time === 'string' && obj.time ? obj.time : `${pad(now.getHours(), 2)}:${pad(now.getMinutes(), 2)}`,
      title: text(obj.title),
      description: text(obj.description),
      location: text(obj.location),
      bodyPart: obj.bodyPart == null || obj.bodyPart === '' ? null : text(obj.bodyPart),
      rootCause: text(obj.rootCause),
      immediateCause: text(obj.immediateCause),
      status: pickEnum(obj.status, INCIDENT_STATUS, 'مفتوح'),
      daysLost: clampInt(obj.daysLost, 0, 10_000, 0),
      reporter: text(obj.reporter),
      categoryId: text(obj.categoryId) || 'height',
      investigationStep: clampInt(obj.investigationStep, 0, 4, 0),
      actions: normalizeActions(obj.actions, now),
      createdAt: localISO(now),
      updatedAt: localISO(now),
    };
    if (!Array.isArray(state.incidents)) state.incidents = [];
    state.incidents.unshift(incident);
    changed(`incidents.${incident.id}`);
    const nearMiss = type === 'حادث وشيك';
    emitFeed({
      type: nearMiss ? 'nearmiss' : 'incident',
      tone: nearMiss ? 'warning' : severityTone(severity),
      siteId: incident.siteId,
      title: `${type} — ${incident.code}`,
      detail: [incident.title, incident.location].filter(Boolean).join(' · '),
      sourceId: 'biltix-hse',
      refId: incident.id,
    });
    return incident;
  },

  updateIncident(id, patch = {}) {
    const incident = findIn('incidents', id);
    if (!incident || !isPlainObject(patch)) return null;
    const rest = { ...patch };
    if (rest.status !== undefined) rest.status = pickEnum(rest.status, INCIDENT_STATUS, incident.status);
    if (rest.type !== undefined) rest.type = pickEnum(rest.type, INCIDENT_TYPES, incident.type);
    if (rest.severity !== undefined) rest.severity = clampInt(rest.severity, 1, 5, incident.severity);
    if (rest.investigationStep !== undefined) rest.investigationStep = clampInt(rest.investigationStep, 0, 4, incident.investigationStep);
    if (rest.daysLost !== undefined) rest.daysLost = clampInt(rest.daysLost, 0, 10_000, incident.daysLost);
    if (rest.actions !== undefined) rest.actions = normalizeActions(rest.actions, store.now());
    if (rest.status === 'مغلق' && incident.status !== 'مغلق') rest.closedAt = localISO(store.now());
    return patchItem('incidents', id, rest);
  },

  /* ── CRUD: permits ── */

  addPermit(obj = {}) {
    const now = store.now();
    const startsAt = typeof obj.startsAt === 'string' && obj.startsAt ? obj.startsAt : localISO(now);
    const startMs = Date.parse(startsAt);
    const defaultExpiry = localISO(addMs(Number.isFinite(startMs) ? new Date(startMs) : now, 12 * 3_600_000));
    const permit = {
      ...obj,
      id: nextId(state.permits, 'P'),
      code: text(obj.code) || `PTW-${pad(Math.max(5000, maxCaptured(state.permits, /^PTW-(\d+)$/)) + 1, 4)}`,
      siteId: text(obj.siteId) || (state.sites && state.sites[0] ? state.sites[0].id : 'S1'),
      type: pickEnum(obj.type, PERMIT_TYPES, PERMIT_TYPES && PERMIT_TYPES[0] ? PERMIT_TYPES[0] : 'أعمال ساخنة'),
      status: pickEnum(obj.status, PERMIT_STATUS, 'مسودة'),
      requester: text(obj.requester),
      approver: text(obj.approver),
      startsAt,
      expiresAt: typeof obj.expiresAt === 'string' && obj.expiresAt ? obj.expiresAt : defaultExpiry,
      location: text(obj.location),
      hazards: Array.isArray(obj.hazards) ? obj.hazards.map((h) => text(h)).filter(Boolean) : [],
      controls: Array.isArray(obj.controls) ? obj.controls.map((c) => (isPlainObject(c) ? text(c.text) : text(c))).filter(Boolean) : [],
      workers: clampInt(obj.workers, 1, 10_000, 1),
      gasTest: isPlainObject(obj.gasTest) ? { ...obj.gasTest } : null,
      createdAt: localISO(now),
      updatedAt: localISO(now),
    };
    if (!Array.isArray(state.permits)) state.permits = [];
    state.permits.unshift(permit);
    changed(`permits.${permit.id}`);
    emitFeed({
      type: 'permit',
      tone: 'accent',
      siteId: permit.siteId,
      title: `تصريح عمل جديد ${permit.code} — ${permit.type}`,
      detail: [siteName(permit.siteId), permit.location].filter(Boolean).join(' · '),
      sourceId: 'biltix-hse',
      refId: permit.id,
    });
    return permit;
  },

  updatePermit(id, patch = {}) {
    const permit = findIn('permits', id);
    if (!permit || !isPlainObject(patch)) return null;
    const rest = { ...patch };
    if (rest.status !== undefined) rest.status = pickEnum(rest.status, PERMIT_STATUS, permit.status);
    if (rest.type !== undefined) rest.type = pickEnum(rest.type, PERMIT_TYPES, permit.type);
    if (rest.workers !== undefined) rest.workers = clampInt(rest.workers, 1, 10_000, permit.workers);
    if (rest.status === 'نشط' && permit.status !== 'نشط' && !permit.approvedAt) rest.approvedAt = localISO(store.now());
    return patchItem('permits', id, rest);
  },

  /* ── CRUD: inspections & integrations ── */

  updateInspection(id, patch = {}) {
    const inspection = findIn('inspections', id);
    if (!inspection || !isPlainObject(patch)) return null;
    const rest = { ...patch };
    if (rest.score !== undefined && rest.score !== null) rest.score = clampInt(rest.score, 0, 100, inspection.score);
    if (rest.checklistDone !== undefined) rest.checklistDone = clampInt(rest.checklistDone, 0, 100_000, inspection.checklistDone);
    return patchItem('inspections', id, rest);
  },

  updateIntegration(id, patch = {}) {
    return patchItem('integrations', id, patch, { stamp: false });
  },

  /* ── feed ── */

  /** Prepend a feed event (normalised), cap at 200, emit store:change. Returns the stored event. */
  pushFeed(event) {
    if (!isPlainObject(event)) return null;
    const ev = {
      ...event,
      id: text(event.id) || nextFeedId(),
      ts: typeof event.ts === 'string' && event.ts ? event.ts : localISO(store.now()),
      type: text(event.type) || 'alert',
      tone: text(event.tone) || 'accent',
      siteId: event.siteId == null ? null : event.siteId,
      title: text(event.title),
      detail: text(event.detail),
      sourceId: event.sourceId == null ? null : event.sourceId,
    };
    if (!Array.isArray(state.feed)) state.feed = [];
    state.feed.unshift(ev);
    if (state.feed.length > FEED_CAP) state.feed.length = FEED_CAP;
    changed('feed');
    return ev;
  },

  /* ── filters ── */

  get filters() {
    return state.filters;
  },

  /** Set a global filter (siteId | range | search | any view-specific key); emits filters:change. */
  setFilter(key, value) {
    if (typeof key !== 'string' || !key) return state.filters;
    if (!isPlainObject(state.filters)) state.filters = { ...DEFAULT_FILTERS };
    let next = value;
    if (key === 'range') next = clampInt(value, 1, 3650, DEFAULT_FILTERS.range);
    if (key === 'search') next = typeof value === 'string' ? value : '';
    if (key === 'siteId') next = text(value) || 'all';
    if (state.filters[key] === next) return state.filters;
    state.filters[key] = next;
    schedulePersist();
    bus.emit('filters:change', { filters: state.filters, key, value: next });
    return state.filters;
  },

  /* ── settings ── */

  /** Deep-merge a settings patch; emits settings:change (+ theme:change when the theme changed). */
  setSettings(patch) {
    if (!isPlainObject(patch)) return state.settings;
    const prevTheme = state.settings.theme;
    const merged = deepMerge(state.settings, patch);
    merged.theme = merged.theme === 'light' ? 'light' : 'dark';
    merged.numerals = merged.numerals === 'arab' ? 'arab' : 'latn';
    merged.brand = deepMerge(clone(DEFAULT_SETTINGS.brand), merged.brand);
    merged.dataSource = deepMerge(clone(DEFAULT_SETTINGS.dataSource), merged.dataSource);
    state.settings = merged;
    changed('settings');
    bus.emit('settings:change', { settings: state.settings });
    if (merged.theme !== prevTheme) bus.emit('theme:change', { theme: merged.theme });
    return state.settings;
  },
};

export default store;
