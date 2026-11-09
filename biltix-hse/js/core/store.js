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
 *   • Part B (§B5): `state.platform` holds the AI Risk Platform entities from
 *     platform-seed.js (saved copy wins, every date re-anchored by the same day delta),
 *     `settings.platform` carries weights/thresholds/channels, and the platform methods
 *     (addAiRisk, acceptRecommendation, overrideRecommendation, escalateRisk, dismissAiRisk,
 *     addTask, updateTask, addAlert, ackAlert, updateValidation, updatePipeline,
 *     updateConnector, pushAudit, resolveQuarantine, retryWriteback) persist, emit
 *     `store:change`, append audit entries, generate AIR-#### / MT-#### / AL-#### codes and
 *     simulate the write-back to Biltix PM (pending → synced after 1.5 s + feed event).
 *
 * Side effects on import are limited to reading localStorage once to build `state`.
 */

import seed, { RISK_STATUS, CONTROL_TYPES, INCIDENT_TYPES, INCIDENT_STATUS, PERMIT_TYPES, PERMIT_STATUS } from '../data/seed.js';
import { bus } from './bus.js';
import { sel } from './selectors.js';

/**
 * Part B — platform seed (ARCHITECTURE.md §B3/§B5). Loaded through an awaited dynamic
 * import so it behaves like a static import inside the module graph, yet a missing or
 * broken `platform-seed.js` degrades to empty collections instead of taking the whole
 * application down with it (the HSE pillar must keep booting on its own).
 */
let platformSeed = null;
try {
  const mod = await import('../data/platform-seed.js');
  platformSeed = (mod && (mod.default || mod.platformSeed)) || null;
  if (!isPlainObject(platformSeed)) platformSeed = null;
} catch (error) {
  console.warn('[biltix] platform-seed.js غير متاح بعد — تعمل المنصة بمجموعات فارغة.', error && error.message ? error.message : error);
}

export const STORAGE_KEY = 'biltix-hse:v1';
export const STATE_VERSION = 1;
export const SEED_ANCHOR_DATE = '2026-11-09';
export const FEED_CAP = 200;
export const AUDIT_CAP = 500;
const PERSIST_DEBOUNCE_MS = 300;
const WRITEBACK_MS = 1500;
const DAY_MS = 86_400_000;

export const DEFAULT_SETTINGS = deepFreeze({
  theme: 'dark',
  numerals: 'latn',
  brand: { primary: '#2F6FED', accent: '#19C6E6', companyName: 'بلتكس', logoUrl: '' },
  sound: false,
  feedPaused: false,
  dataSource: { type: 'simulation', url: '', apiKey: '', table: '' },
  alertWebhook: '',
  // Part B (§B5): classification weights, alert thresholds, escalation channels, roadmap payment split.
  platform: {
    weights: { contract: 0.2, bom: 0.2, schedule: 0.25, site: 0.2, cost: 0.15 },
    alertThreshold: 60,
    criticalThreshold: 85,
    channels: { email: true, slack: true, teams: false, whatsapp: false },
    paymentPct: { M0: null, M1: null, M2: null, M3: null, M4: null },
    writebackEnabled: true,
  },
});

/* ── Part B enums (single definition for the store's validation; psel mirrors the labels) ── */
export const AI_CATEGORIES = ['contract', 'bom', 'schedule', 'site', 'cost'];
export const AI_TYPES = ['Financial', 'Safety', 'Delay', 'Conflict'];
export const AI_PIPELINES = ['contract-nlp', 'bom-forecast', 'schedule-model', 'site-ai', 'cost-forecast'];
export const AI_RISK_STATUS = ['مكتشف', 'تنبيه', 'مهمة مُسندة', 'قيد المعالجة', 'مغلق', 'مُتجاوز'];
export const TASK_STATUS = ['جديدة', 'قيد التنفيذ', 'متأخرة', 'مغلقة'];
export const TASK_SOURCES = ['ai-accepted', 'ai-edited', 'manual'];
export const QUARANTINE_STATUS = ['معلّق', 'مُصحح', 'مرفوض'];
export const AUDIT_ACTIONS = ['override', 'accept', 'escalate', 'writeback', 'model-update', 'validation', 'login', 'config', 'close'];
const CATEGORY_PIPELINE = { contract: 'contract-nlp', bom: 'bom-forecast', schedule: 'schedule-model', site: 'site-ai', cost: 'cost-forecast' };
const CATEGORY_TYPE = { contract: 'Conflict', bom: 'Financial', schedule: 'Delay', site: 'Safety', cost: 'Financial' };
const PIPELINE_LABEL = { 'contract-nlp': 'محرك العقود NLP', 'bom-forecast': 'محرك توقعات المواد', 'schedule-model': 'نموذج الجدول الزمني', 'site-ai': 'ذكاء الموقع والصور', 'cost-forecast': 'محرك توقعات التكلفة' };
const RATING_LABEL = { red: 'أحمر', yellow: 'أصفر', green: 'أخضر' };
const RATING_TONE = { red: 'critical', yellow: 'warning', green: 'good' };
const AI_ENGINE_ACTOR = 'محرك الذكاء الاصطناعي';
const SYSTEM_ACTOR = 'النظام';

/** Array collections of state.platform (§B3) — empty arrays when the seed is missing. */
const PLATFORM_COLLECTIONS = [
  'projects', 'contracts', 'suppliers', 'commodities', 'boqItems', 'scheduleTasks', 'resources', 'approvals',
  'subcontractors', 'costLines', 'changeOrders', 'currencies', 'labourIndex', 'aiRisks', 'tasks', 'alerts',
  'pipelines', 'connectors', 'auditLog',
];

/** Platform date fields shifted by `reanchorPlatform()` (§B5 list, exhaustively). */
const PLATFORM_DATE_FIELDS = {
  projects: { own: ['startDate', 'plannedFinish', 'forecastFinish'] },
  contracts: { own: ['signedAt', 'endsAt'], children: { obligations: ['due'] } },
  boqItems: { own: ['requiredBy', 'orderBy'] },
  scheduleTasks: { own: ['start', 'finish', 'baselineFinish'] },
  approvals: { own: ['submittedAt'] },
  changeOrders: { own: ['submittedAt'] },
  aiRisks: { own: ['detectedAt', 'updatedAt', 'dueDate'], children: { history: ['at'], overrides: ['at'] } },
  tasks: { own: ['dueDate', 'createdAt', 'closedAt'], nested: { writeback: ['at'] } },
  alerts: { own: ['sentAt', 'ackAt'] },
  pipelines: { own: ['lastRun'] },
  connectors: { own: ['lastSync'] },
  auditLog: { own: ['at'] },
};

export const DEFAULT_FILTERS = deepFreeze({ siteId: 'all', range: 30, search: '' });

/** Collections the UI mutates; a saved copy of these overrides the seed on load. */
const MUTABLE_COLLECTIONS = ['risks', 'incidents', 'permits', 'inspections', 'integrations', 'feed'];

/** Date-bearing fields shifted by `reanchor()` — one entry per collection. */
const DATE_FIELDS = {
  risks: { own: ['dueDate', 'createdAt', 'updatedAt', 'closedAt'], children: { history: ['at'] } },
  incidents: { own: ['date', 'createdAt', 'updatedAt', 'closedAt'], children: { actions: ['due', 'doneAt'] } },
  permits: { own: ['startsAt', 'expiresAt', 'createdAt', 'updatedAt', 'approvedAt', 'closedAt'] },
  inspections: { own: ['date', 'createdAt', 'updatedAt'] },
  workers: { own: ['joinedAt'], children: { certs: ['completedAt', 'expiresAt'] } },
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
    if (isPlainObject(state.platform)) reanchorPlatform(state.platform, delta);
  }
  meta.anchorDate = today;
  return delta;
}

/* ────────────────────────────── Part B: platform helpers ────────────────────────────── */

/** Empty platform skeleton — the store boots on this when platform-seed.js is absent. */
function emptyPlatform() {
  const out = {};
  for (const key of PLATFORM_COLLECTIONS) out[key] = [];
  out.monteCarlo = {};
  out.weather = {};
  out.validation = { sources: [], rules: [], quarantine: [] };
  out.roadmap = { scopeItems: [], assumptions: [], outOfScope: [], milestones: [], paymentNote: '' };
  return out;
}

/** Deep-clone `src` onto the empty skeleton so every collection/object exists with the right type. */
function normalizePlatform(src) {
  const out = emptyPlatform();
  if (!isPlainObject(src)) return out;
  const copy = clone(src);
  for (const [key, value] of Object.entries(copy)) {
    if (PLATFORM_COLLECTIONS.includes(key)) { if (Array.isArray(value)) out[key] = value; continue; }
    if (key === 'validation') {
      if (isPlainObject(value)) {
        out.validation = {
          ...value,
          sources: Array.isArray(value.sources) ? value.sources : [],
          rules: Array.isArray(value.rules) ? value.rules : [],
          quarantine: Array.isArray(value.quarantine) ? value.quarantine : [],
        };
      }
      continue;
    }
    if (key === 'roadmap') {
      if (isPlainObject(value)) {
        out.roadmap = {
          ...value,
          scopeItems: Array.isArray(value.scopeItems) ? value.scopeItems : [],
          assumptions: Array.isArray(value.assumptions) ? value.assumptions : [],
          outOfScope: Array.isArray(value.outOfScope) ? value.outOfScope : [],
          milestones: Array.isArray(value.milestones) ? value.milestones : [],
          paymentNote: text(value.paymentNote),
        };
      }
      continue;
    }
    if (key === 'monteCarlo' || key === 'weather') { if (isPlainObject(value)) out[key] = value; continue; }
    out[key] = value; // unknown extra keys pass through untouched
  }
  return out;
}

/** Shift every platform date (§B5 list) by `days`; tolerant of missing arrays/objects. */
export function reanchorPlatform(platform, days) {
  if (!isPlainObject(platform) || !days) return;
  for (const [collection, spec] of Object.entries(PLATFORM_DATE_FIELDS)) {
    const items = platform[collection];
    if (!Array.isArray(items)) continue;
    for (const item of items) {
      if (!isPlainObject(item)) continue;
      if (spec.own) shiftFields(item, spec.own, days);
      if (spec.children) {
        for (const [childKey, childFields] of Object.entries(spec.children)) {
          const children = item[childKey];
          if (Array.isArray(children)) children.forEach((child) => shiftFields(child, childFields, days));
        }
      }
      if (spec.nested) {
        for (const [childKey, childFields] of Object.entries(spec.nested)) shiftFields(item[childKey], childFields, days);
      }
    }
  }
  if (isPlainObject(platform.monteCarlo)) {
    for (const mc of Object.values(platform.monteCarlo)) shiftFields(mc, ['p50', 'p80', 'p90'], days);
  }
  if (isPlainObject(platform.weather)) {
    for (const w of Object.values(platform.weather)) {
      if (isPlainObject(w) && Array.isArray(w.next7)) w.next7.forEach((d) => shiftFields(d, ['date'], days));
    }
  }
  const v = platform.validation;
  if (isPlainObject(v)) {
    if (Array.isArray(v.sources)) v.sources.forEach((s) => shiftFields(s, ['lastBatch'], days));
    if (Array.isArray(v.quarantine)) v.quarantine.forEach((q) => shiftFields(q, ['at', 'resolvedAt'], days));
  }
}

/** Saved platform wins key by key (collections, keyed objects and the validation/roadmap blocks). */
function mergePlatform(base, saved) {
  if (!isPlainObject(saved)) return base;
  const out = { ...base };
  for (const [key, value] of Object.entries(saved)) {
    if (PLATFORM_COLLECTIONS.includes(key)) { if (Array.isArray(value)) out[key] = value; continue; }
    if (key === 'validation' || key === 'roadmap') {
      if (isPlainObject(value)) out[key] = normalizePlatform({ [key]: value })[key];
      continue;
    }
    if (key === 'monteCarlo' || key === 'weather') { if (isPlainObject(value)) out[key] = value; continue; }
    if (value !== undefined) out[key] = value;
  }
  return out;
}

function ratingOf(score) {
  const n = Number(score) || 0;
  return n >= 70 ? 'red' : n >= 40 ? 'yellow' : 'green';
}

function clampNum(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

/** Enabled channels from a boolean map, an array, or the settings default. */
function normalizeChannels(input) {
  const all = ['email', 'slack', 'teams', 'whatsapp'];
  if (Array.isArray(input)) return input.map((c) => text(c)).filter((c) => all.includes(c));
  if (isPlainObject(input)) return all.filter((c) => Boolean(input[c]));
  const fromSettings = getPath(state, 'settings.platform.channels');
  return isPlainObject(fromSettings) ? all.filter((c) => Boolean(fromSettings[c])) : ['email', 'slack'];
}

function nextPlatformCode(items, prefix, min = 0, width = 4) {
  const re = new RegExp(`^${prefix}-(\\d+)$`);
  return `${prefix}-${pad(Math.max(min, maxCaptured(items, re)) + 1, width)}`;
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
  base.platform = normalizePlatform(platformSeed);
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
  if (isPlainObject(saved.platform)) base.platform = mergePlatform(base.platform, saved.platform);
  if (Array.isArray(base.platform.auditLog) && base.platform.auditLog.length > AUDIT_CAP) base.platform.auditLog.length = AUDIT_CAP;
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

/* ────────────────────────────── Part B: platform internals ────────────────────────────── */

function platform() {
  if (!isPlainObject(state.platform)) state.platform = emptyPlatform();
  return state.platform;
}

function platformList(key) {
  const p = platform();
  if (!Array.isArray(p[key])) p[key] = [];
  return p[key];
}

function findPlatform(key, id) {
  return platformList(key).find((item) => item && item.id === id) || null;
}

function patchPlatformItem(key, id, patch, { stamp = false } = {}) {
  const item = findPlatform(key, id);
  if (!item || !isPlainObject(patch)) return null;
  for (const [k, value] of Object.entries(patch)) {
    if (value === undefined || k === 'id') continue;
    item[k] = isPlainObject(value) && isPlainObject(item[k]) ? deepMerge(item[k], value) : value;
  }
  if (stamp) item.updatedAt = localISO(store.now());
  changed(`platform.${key}.${id}`);
  return item;
}

function projectName(projectId) {
  return siteName(projectId);
}

function pipelineLabel(id) {
  const p = findPlatform('pipelines', id);
  return (p && (p.nameAr || p.name)) || PIPELINE_LABEL[id] || 'محرك المخاطر';
}

function riskHistory(risk, by, textValue) {
  if (!Array.isArray(risk.history)) risk.history = [];
  risk.history.push({ at: localISO(store.now()), by: text(by) || SYSTEM_ACTOR, text: textValue });
}

/** Thresholds (§B2): > alertThreshold → standard alert; ≥ criticalThreshold → immediate escalation. */
function alertLevelFor(score) {
  const s = isPlainObject(getPath(state, 'settings.platform')) ? state.settings.platform : DEFAULT_SETTINGS.platform;
  const alertAt = clampNum(s.alertThreshold, 0, 100, DEFAULT_SETTINGS.platform.alertThreshold);
  const criticalAt = clampNum(s.criticalThreshold, 0, 100, DEFAULT_SETTINGS.platform.criticalThreshold);
  const n = Number(score) || 0;
  if (n >= criticalAt) return 'immediate';
  if (n > alertAt) return 'standard';
  return null;
}

const writebackTimers = new Set();

/** Simulated write-back to Biltix PM: pending → synced after 1.5 s, with feed + audit entries. */
function scheduleWriteback(taskId) {
  const enabled = getPath(state, 'settings.platform.writebackEnabled') !== false;
  if (!enabled || typeof setTimeout !== 'function') return;
  const timer = setTimeout(() => {
    writebackTimers.delete(timer);
    const task = findPlatform('tasks', taskId);
    if (!task || !isPlainObject(task.writeback) || task.writeback.status !== 'pending') return;
    task.writeback.status = 'synced';
    task.writeback.at = localISO(store.now());
    task.writeback.target = task.writeback.target || 'Biltix PM';
    changed(`platform.tasks.${task.id}`);
    store.pushAudit({ actor: SYSTEM_ACTOR, action: 'writeback', target: task.code, detail: `تمت الكتابة العكسية إلى ${task.writeback.target}: علم المخاطرة والدرجة ومهمة المعالجة ${task.code}` });
    emitFeed({
      type: 'writeback', tone: 'good', siteId: task.projectId,
      title: `تمت الكتابة العكسية إلى ${task.writeback.target} — ${task.code}`,
      detail: [task.title, projectName(task.projectId)].filter(Boolean).join(' · '),
      sourceId: 'biltix-pm', refId: task.id,
    });
  }, WRITEBACK_MS);
  writebackTimers.add(timer);
}

function clearWritebackTimers() {
  for (const t of writebackTimers) clearTimeout(t);
  writebackTimers.clear();
}

/** Internal task factory shared by addTask / acceptRecommendation / overrideRecommendation. */
function createTask(obj = {}, { silent = false, by = '' } = {}) {
  const now = store.now();
  const tasks = platformList('tasks');
  const risk = obj.riskId ? findPlatform('aiRisks', obj.riskId) : null;
  const projectId = text(obj.projectId) || (risk && risk.projectId) || (state.sites && state.sites[0] ? state.sites[0].id : 'S1');
  const task = {
    ...obj,
    id: nextId(tasks, 'MT'),
    code: text(obj.code) || nextPlatformCode(tasks, 'MT', 0),
    riskId: risk ? risk.id : (obj.riskId == null ? null : text(obj.riskId)),
    projectId,
    title: text(obj.title) || (risk && risk.recommendation && text(risk.recommendation.action)) || (risk && risk.title) || 'مهمة معالجة',
    owner: text(obj.owner) || (risk && text(risk.owner)) || 'مدير المشروع',
    dueDate: typeof obj.dueDate === 'string' && obj.dueDate ? obj.dueDate : todayISO(addMs(now, 14 * DAY_MS)),
    status: pickEnum(obj.status, TASK_STATUS, 'جديدة'),
    source: pickEnum(obj.source, TASK_SOURCES, 'manual'),
    writeback: isPlainObject(obj.writeback)
      ? { target: 'Biltix PM', status: 'pending', at: null, ...obj.writeback }
      : { target: 'Biltix PM', status: 'pending', at: null },
    createdAt: localISO(now),
    closedAt: null,
    outcome: text(obj.outcome),
  };
  tasks.unshift(task);
  if (risk) {
    risk.taskId = task.id;
    if (!text(risk.owner)) risk.owner = task.owner;
    if (!risk.dueDate) risk.dueDate = task.dueDate;
    if (['مكتشف', 'تنبيه'].includes(risk.status)) risk.status = 'مهمة مُسندة';
    risk.updatedAt = localISO(now);
  }
  changed(`platform.tasks.${task.id}`);
  if (!silent) {
    emitFeed({
      type: 'task', tone: 'accent', siteId: task.projectId,
      title: `مهمة معالجة جديدة ${task.code}${risk ? ` — ${risk.code}` : ''}`,
      detail: [task.title, `المسؤول: ${task.owner}`].filter(Boolean).join(' · '),
      sourceId: 'biltix-pm', refId: task.id,
    });
  }
  if (task.writeback.status === 'pending') scheduleWriteback(task.id);
  return task;
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
    clearWritebackTimers();
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
    const hasData = MUTABLE_COLLECTIONS.some((key) => Array.isArray(snapshot[key])) || isPlainObject(snapshot.settings) || isPlainObject(snapshot.platform);
    if (!hasData) return false;
    const now = store.now();
    clearWritebackTimers();
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
    // Part B: keep the platform block complete and its thresholds sane (critical ≥ alert).
    const platform = deepMerge(clone(DEFAULT_SETTINGS.platform), merged.platform);
    platform.alertThreshold = Math.round(clampNum(platform.alertThreshold, 0, 100, DEFAULT_SETTINGS.platform.alertThreshold));
    platform.criticalThreshold = Math.round(clampNum(platform.criticalThreshold, platform.alertThreshold, 100, Math.max(platform.alertThreshold, DEFAULT_SETTINGS.platform.criticalThreshold)));
    platform.writebackEnabled = platform.writebackEnabled !== false;
    merged.platform = platform;
    state.settings = merged;
    changed('settings');
    bus.emit('settings:change', { settings: state.settings });
    if (merged.theme !== prevTheme) bus.emit('theme:change', { theme: merged.theme });
    return state.settings;
  },

  /* ══════════════════════════ Part B — AI Risk Platform (§B5) ══════════════════════════ */

  /** state.platform accessor — never undefined (empty collections when the seed is missing). */
  get platform() {
    return platform();
  },

  /** True when platform-seed.js loaded (used by the shell to hide platform-only chrome). */
  hasPlatformData() {
    return platformList('aiRisks').length > 0 || platformList('pipelines').length > 0;
  },

  /* ── AI risks ── */

  /**
   * Register a newly detected AI risk. Normalises every §B3 field, generates AIR-#### codes,
   * applies the alert thresholds (autoAlert) and pushes an 'ai' feed event. Returns the risk.
   */
  addAiRisk(obj = {}, { autoAlert = true, by = AI_ENGINE_ACTOR } = {}) {
    const now = store.now();
    const list = platformList('aiRisks');
    const category = pickEnum(obj.category, AI_CATEGORIES, 'site');
    const pipeline = pickEnum(obj.pipeline, AI_PIPELINES, CATEGORY_PIPELINE[category]);
    const score = Math.round(clampNum(obj.score, 0, 100, 50));
    const rec = isPlainObject(obj.recommendation) ? obj.recommendation : {};
    const risk = {
      ...obj,
      id: nextId(list, 'AIR'),
      code: text(obj.code) || nextPlatformCode(list, 'AIR', 1000),
      projectId: text(obj.projectId) || text(obj.siteId) || (state.sites && state.sites[0] ? state.sites[0].id : 'S1'),
      category,
      type: pickEnum(obj.type, AI_TYPES, CATEGORY_TYPE[category]),
      score,
      title: text(obj.title) || 'مخاطرة مكتشفة بواسطة المحرك',
      driverExplanation: text(obj.driverExplanation),
      evidence: isPlainObject(obj.evidence) ? { ...obj.evidence } : null,
      recommendation: {
        action: text(rec.action), rationale: text(rec.rationale),
        effort: pickEnum(rec.effort, ['منخفض', 'متوسط', 'عالٍ'], 'متوسط'),
        impact: text(rec.impact), alternatives: Array.isArray(rec.alternatives) ? rec.alternatives.slice(0, 2) : [],
      },
      pipeline,
      modelVersion: text(obj.modelVersion) || 'v2.3.1',
      confidence: clampNum(obj.confidence, 0, 1, 0.8),
      detectedAt: typeof obj.detectedAt === 'string' && obj.detectedAt ? obj.detectedAt : localISO(now),
      updatedAt: localISO(now),
      status: pickEnum(obj.status, AI_RISK_STATUS, 'مكتشف'),
      owner: text(obj.owner),
      dueDate: typeof obj.dueDate === 'string' && obj.dueDate ? obj.dueDate : todayISO(addMs(now, 14 * DAY_MS)),
      taskId: obj.taskId == null ? null : text(obj.taskId),
      escalated: Boolean(obj.escalated),
      stakeholders: Array.isArray(obj.stakeholders) ? obj.stakeholders.map((s) => text(s)).filter(Boolean) : ['PM'],
      responseParams: isPlainObject(obj.responseParams) ? obj.responseParams : {},
      overrides: Array.isArray(obj.overrides) ? obj.overrides : [],
      history: Array.isArray(obj.history) && obj.history.length
        ? obj.history
        : [{ at: localISO(now), by, text: `اكتشاف المخاطرة بواسطة ${pipelineLabel(pipeline)} — الدرجة ${score}` }],
    };
    delete risk.siteId;
    list.unshift(risk);
    changed(`platform.aiRisks.${risk.id}`);

    const rating = ratingOf(score);
    emitFeed({
      type: 'ai', tone: RATING_TONE[rating], siteId: risk.projectId,
      title: `${pipelineLabel(pipeline)}: ${risk.title} — الدرجة ${score} (${RATING_LABEL[rating]})`,
      detail: risk.driverExplanation || (risk.evidence && risk.evidence.excerpt) || projectName(risk.projectId),
      sourceId: pipeline, refId: risk.id,
    });

    if (autoAlert) {
      const level = alertLevelFor(score);
      if (level) {
        risk.status = risk.status === 'مكتشف' ? 'تنبيه' : risk.status;
        if (level === 'immediate') risk.escalated = true;
        store.addAlert({
          riskId: risk.id, projectId: risk.projectId,
          severity: level === 'immediate' ? 'critical' : 'routine',
          queue: level,
          title: `${level === 'immediate' ? 'تصعيد فوري' : 'تنبيه'}: ${risk.code} — ${risk.title}`,
        });
      }
    }
    return risk;
  },

  /** Patch an AI risk; `note`/`by` become a history entry; status validated against §B3. */
  updateAiRisk(id, patch = {}) {
    const risk = findPlatform('aiRisks', id);
    if (!risk || !isPlainObject(patch)) return null;
    const { by, note, ...rest } = patch;
    const prevStatus = risk.status;
    if (rest.status !== undefined) rest.status = pickEnum(rest.status, AI_RISK_STATUS, risk.status);
    if (rest.score !== undefined) rest.score = Math.round(clampNum(rest.score, 0, 100, risk.score));
    if (rest.confidence !== undefined) rest.confidence = clampNum(rest.confidence, 0, 1, risk.confidence);
    if (rest.category !== undefined) rest.category = pickEnum(rest.category, AI_CATEGORIES, risk.category);
    if (rest.type !== undefined) rest.type = pickEnum(rest.type, AI_TYPES, risk.type);
    if (rest.status && rest.status !== prevStatus) riskHistory(risk, by, `تغيير الحالة من «${prevStatus}» إلى «${rest.status}»`);
    if (typeof note === 'string' && note.trim()) riskHistory(risk, by, note.trim());
    return patchPlatformItem('aiRisks', id, rest, { stamp: true });
  },

  /**
   * One-click acceptance of the engine's recommendation: creates the mitigation task
   * (source 'ai-accepted', write-back pending → synced), assigns the risk, logs 'accept'.
   * Returns the created task (task.riskId links back to the risk).
   */
  acceptRecommendation(riskId, { owner = '', dueDate = '', escalate = false, by = '' } = {}) {
    const risk = findPlatform('aiRisks', riskId);
    if (!risk) return null;
    const actor = text(by) || text(owner) || 'مدير المشروع';
    const task = createTask({
      riskId: risk.id, projectId: risk.projectId,
      title: (risk.recommendation && text(risk.recommendation.action)) || risk.title,
      owner: text(owner) || risk.owner, dueDate, source: 'ai-accepted',
    }, { silent: true });
    risk.status = 'مهمة مُسندة';
    risk.owner = task.owner;
    risk.dueDate = task.dueDate;
    risk.taskId = task.id;
    risk.updatedAt = localISO(store.now());
    riskHistory(risk, actor, `قبول توصية المحرك وإنشاء مهمة المعالجة ${task.code} — المسؤول: ${task.owner}`);
    const pipe = findPlatform('pipelines', risk.pipeline);
    if (pipe && Number.isFinite(Number(pipe.acceptedLast30d))) pipe.acceptedLast30d = Number(pipe.acceptedLast30d) + 1;
    changed(`platform.aiRisks.${risk.id}`);
    store.pushAudit({ actor, action: 'accept', target: risk.code, detail: `قبول التوصية «${task.title}» → ${task.code} (${task.owner}، يستحق ${task.dueDate})` });
    emitFeed({
      type: 'task', tone: 'good', siteId: risk.projectId,
      title: `قبول توصية المحرك — ${risk.code} ← مهمة ${task.code}`,
      detail: `${task.title} · المسؤول: ${task.owner}`,
      sourceId: 'biltix-pm', refId: task.id,
    });
    if (escalate) store.escalateRisk(risk.id, undefined, actor);
    return task;
  },

  /**
   * Human-in-the-loop override: logs {fromAction → toAction, reason} on the risk, creates an
   * 'ai-edited' task, feeds the override back to the pipeline counters, logs 'override'.
   * Returns the created task.
   */
  overrideRecommendation(riskId, { action = '', reason = '', owner = '', dueDate = '', escalate = false, by = '' } = {}) {
    const risk = findPlatform('aiRisks', riskId);
    if (!risk) return null;
    const actor = text(by) || text(owner) || 'مدير المشروع';
    const fromAction = (risk.recommendation && text(risk.recommendation.action)) || '';
    const toAction = text(action) || fromAction || risk.title;
    const why = text(reason) || 'دون سبب مُسجَّل';
    if (!Array.isArray(risk.overrides)) risk.overrides = [];
    risk.overrides.push({ at: localISO(store.now()), by: actor, fromAction, toAction, reason: why });
    const task = createTask({
      riskId: risk.id, projectId: risk.projectId, title: toAction,
      owner: text(owner) || risk.owner, dueDate, source: 'ai-edited',
    }, { silent: true });
    risk.status = 'مهمة مُسندة';
    risk.owner = task.owner;
    risk.dueDate = task.dueDate;
    risk.taskId = task.id;
    risk.updatedAt = localISO(store.now());
    riskHistory(risk, actor, `تعديل توصية المحرك إلى «${toAction}» — السبب: ${why}`);
    const pipe = findPlatform('pipelines', risk.pipeline);
    if (pipe && Number.isFinite(Number(pipe.overridesLast30d))) pipe.overridesLast30d = Number(pipe.overridesLast30d) + 1;
    changed(`platform.aiRisks.${risk.id}`);
    store.pushAudit({ actor, action: 'override', target: risk.code, detail: `تجاوز التوصية: من «${fromAction || '—'}» إلى «${toAction}» — السبب: ${why} → ${task.code}` });
    emitFeed({
      type: 'task', tone: 'warning', siteId: risk.projectId,
      title: `تعديل توصية المحرك — ${risk.code} ← مهمة ${task.code}`,
      detail: `${toAction} · السبب: ${why}`,
      sourceId: 'biltix-pm', refId: task.id,
    });
    if (escalate) store.escalateRisk(risk.id, undefined, actor);
    return task;
  },

  /** Immediate escalation: critical alert in the immediate queue + bus 'alert' + audit. Returns the alert. */
  escalateRisk(riskId, channels, by = '') {
    const risk = findPlatform('aiRisks', riskId);
    if (!risk) return null;
    const actor = text(by) || 'مدير المشروع';
    const list = normalizeChannels(channels);
    risk.escalated = true;
    if (['مكتشف'].includes(risk.status)) risk.status = 'تنبيه';
    risk.updatedAt = localISO(store.now());
    riskHistory(risk, actor, `تصعيد فوري عبر: ${list.join('، ') || 'القنوات الافتراضية'}`);
    changed(`platform.aiRisks.${risk.id}`);
    const alert = store.addAlert({
      riskId: risk.id, projectId: risk.projectId, severity: 'critical', queue: 'immediate', channels: list,
      title: `تصعيد فوري: ${risk.code} — ${risk.title}`,
    });
    store.pushAudit({ actor, action: 'escalate', target: risk.code, detail: `تصعيد فوري (الدرجة ${risk.score}) عبر ${list.join('، ') || '—'}` });
    return alert;
  },

  /** Dismiss (مُتجاوز) with a mandatory reason; logged as an override for model recalibration. */
  dismissAiRisk(riskId, reason = '', by = '') {
    const risk = findPlatform('aiRisks', riskId);
    if (!risk) return null;
    const actor = text(by) || 'مدير المشروع';
    const why = text(reason) || 'دون سبب مُسجَّل';
    const prev = risk.status;
    risk.status = 'مُتجاوز';
    risk.updatedAt = localISO(store.now());
    if (!Array.isArray(risk.overrides)) risk.overrides = [];
    risk.overrides.push({ at: localISO(store.now()), by: actor, fromAction: (risk.recommendation && text(risk.recommendation.action)) || '', toAction: 'تجاهل المخاطرة', reason: why });
    riskHistory(risk, actor, `تجاهل المخاطرة (كانت «${prev}») — السبب: ${why}`);
    const pipe = findPlatform('pipelines', risk.pipeline);
    if (pipe && Number.isFinite(Number(pipe.overridesLast30d))) pipe.overridesLast30d = Number(pipe.overridesLast30d) + 1;
    changed(`platform.aiRisks.${risk.id}`);
    store.pushAudit({ actor, action: 'override', target: risk.code, detail: `تجاهل المخاطرة — السبب: ${why}` });
    emitFeed({ type: 'ai', tone: 'neutral', siteId: risk.projectId, title: `تجاهل مخاطرة ${risk.code} بقرار بشري`, detail: why, sourceId: risk.pipeline, refId: risk.id });
    return risk;
  },

  /* ── mitigation tasks ── */

  /** Manual (or programmatic) task; links to its risk when riskId is given. Returns the task. */
  addTask(obj = {}) {
    return createTask(obj, { silent: false });
  },

  /**
   * Patch a task. Closing it ('مغلقة') stamps closedAt, stores the outcome, closes the linked
   * risk (status 'مغلق' + history) and logs audit 'close' — the outcome feeds recalibration.
   */
  updateTask(id, patch = {}) {
    const task = findPlatform('tasks', id);
    if (!task || !isPlainObject(patch)) return null;
    const { by, ...rest } = patch;
    const actor = text(by) || task.owner || SYSTEM_ACTOR;
    const now = localISO(store.now());
    const prevStatus = task.status;
    if (rest.status !== undefined) rest.status = pickEnum(rest.status, TASK_STATUS, task.status);
    if (rest.source !== undefined) rest.source = pickEnum(rest.source, TASK_SOURCES, task.source);
    if (rest.outcome !== undefined) rest.outcome = text(rest.outcome);
    const closing = rest.status === 'مغلقة' && prevStatus !== 'مغلقة';
    const reopening = prevStatus === 'مغلقة' && rest.status && rest.status !== 'مغلقة';
    if (closing) rest.closedAt = now;
    if (reopening) rest.closedAt = null;
    const updated = patchPlatformItem('tasks', id, rest);
    const risk = updated.riskId ? findPlatform('aiRisks', updated.riskId) : null;
    if (closing) {
      const outcome = updated.outcome || 'أُغلقت المهمة';
      if (risk) {
        risk.status = 'مغلق';
        risk.updatedAt = now;
        riskHistory(risk, actor, `إغلاق مهمة المعالجة ${updated.code} — النتيجة: ${outcome}`);
        changed(`platform.aiRisks.${risk.id}`);
      }
      store.pushAudit({ actor, action: 'close', target: risk ? risk.code : updated.code, detail: `إغلاق ${updated.code}${risk ? ` وإغلاق ${risk.code}` : ''} — النتيجة: ${outcome} (تغذية راجعة لإعادة معايرة النموذج)` });
      emitFeed({ type: 'task', tone: 'good', siteId: updated.projectId, title: `إغلاق مهمة المعالجة ${updated.code}${risk ? ` — ${risk.code}` : ''}`, detail: outcome, sourceId: 'biltix-pm', refId: updated.id });
    } else if (reopening && risk) {
      risk.status = 'قيد المعالجة';
      risk.updatedAt = now;
      riskHistory(risk, actor, `إعادة فتح مهمة المعالجة ${updated.code}`);
      changed(`platform.aiRisks.${risk.id}`);
    } else if (rest.status && rest.status !== prevStatus) {
      if (risk && rest.status === 'قيد التنفيذ' && ['مهمة مُسندة', 'تنبيه', 'مكتشف'].includes(risk.status)) {
        risk.status = 'قيد المعالجة';
        risk.updatedAt = now;
        changed(`platform.aiRisks.${risk.id}`);
      }
      emitFeed({ type: 'task', tone: rest.status === 'متأخرة' ? 'serious' : 'accent', siteId: updated.projectId, title: `المهمة ${updated.code}: ${prevStatus} ← ${rest.status}`, detail: updated.title, sourceId: 'biltix-pm', refId: updated.id });
    }
    return updated;
  },

  /** Re-queue a failed/pending write-back (tasks kanban "إعادة المزامنة"). */
  retryWriteback(taskId) {
    const task = findPlatform('tasks', taskId);
    if (!task) return null;
    task.writeback = { target: 'Biltix PM', ...(isPlainObject(task.writeback) ? task.writeback : {}), status: 'pending', at: null };
    changed(`platform.tasks.${task.id}`);
    emitFeed({ type: 'writeback', tone: 'accent', siteId: task.projectId, title: `إعادة محاولة الكتابة العكسية — ${task.code}`, detail: task.title, sourceId: 'biltix-pm', refId: task.id });
    scheduleWriteback(task.id);
    return task;
  },

  /* ── alerts ── */

  /** Add an alert (AL-#### code); critical ones emit bus 'alert' so the shell banner/toast show. */
  addAlert(obj = {}) {
    const list = platformList('alerts');
    const risk = obj.riskId ? findPlatform('aiRisks', obj.riskId) : null;
    const severity = obj.severity === 'critical' ? 'critical' : 'routine';
    const alert = {
      ...obj,
      id: nextId(list, 'AL'),
      code: text(obj.code) || nextPlatformCode(list, 'AL', 0),
      riskId: risk ? risk.id : (obj.riskId == null ? null : text(obj.riskId)),
      projectId: text(obj.projectId) || (risk && risk.projectId) || null,
      severity,
      queue: obj.queue === 'immediate' || (obj.queue === undefined && severity === 'critical') ? 'immediate' : 'standard',
      channels: normalizeChannels(obj.channels),
      sentAt: typeof obj.sentAt === 'string' && obj.sentAt ? obj.sentAt : localISO(store.now()),
      acknowledged: Boolean(obj.acknowledged),
      ackBy: text(obj.ackBy) || null,
      ackAt: typeof obj.ackAt === 'string' ? obj.ackAt : null,
      title: text(obj.title) || (risk ? `تنبيه: ${risk.code} — ${risk.title}` : 'تنبيه من منصة المخاطر'),
    };
    list.unshift(alert);
    changed(`platform.alerts.${alert.id}`);
    const detail = risk ? `${risk.driverExplanation || risk.title} · الدرجة ${risk.score}` : '';
    emitFeed({
      type: 'alert', tone: severity === 'critical' ? 'critical' : 'warning', siteId: alert.projectId,
      title: alert.title, detail: `${detail}${alert.channels.length ? `${detail ? ' · ' : ''}القنوات: ${alert.channels.join('، ')}` : ''}`,
      sourceId: risk ? risk.pipeline : null, refId: alert.id,
    });
    if (severity === 'critical') {
      bus.emit('alert', {
        severity: 'critical', tone: 'critical', title: alert.title, detail: detail || alert.title,
        siteId: alert.projectId, riskId: alert.riskId, alertId: alert.id, source: 'platform', ts: alert.sentAt,
      });
    }
    return alert;
  },

  ackAlert(id, by = '') {
    const alert = findPlatform('alerts', id);
    if (!alert) return null;
    alert.acknowledged = true;
    alert.ackBy = text(by) || 'مدير المشروع';
    alert.ackAt = localISO(store.now());
    changed(`platform.alerts.${id}`);
    return alert;
  },

  /* ── validation layer, pipelines, connectors, audit ── */

  /** Deep-merge a patch into platform.validation (arrays replace; plain objects merge). */
  updateValidation(patch = {}) {
    if (!isPlainObject(patch)) return platform().validation;
    const p = platform();
    const current = isPlainObject(p.validation) ? p.validation : emptyPlatform().validation;
    p.validation = normalizePlatform({ validation: deepMerge(current, patch) }).validation;
    changed('platform.validation');
    return p.validation;
  },

  /** Convenience: patch one validation source / rule by id (counters, enabled toggles). */
  updateValidationSource(id, patch = {}) {
    const v = platform().validation;
    const item = isPlainObject(v) && Array.isArray(v.sources) ? v.sources.find((s) => s && s.id === id) : null;
    if (!item || !isPlainObject(patch)) return null;
    Object.assign(item, patch);
    changed('platform.validation.sources');
    return item;
  },

  updateValidationRule(id, patch = {}) {
    const v = platform().validation;
    const item = isPlainObject(v) && Array.isArray(v.rules) ? v.rules.find((r) => r && r.id === id) : null;
    if (!item || !isPlainObject(patch)) return null;
    Object.assign(item, patch);
    changed('platform.validation.rules');
    if (patch.enabled !== undefined) {
      store.pushAudit({ actor: 'مدير المشروع', action: 'config', target: item.name || item.id, detail: patch.enabled ? 'تفعيل قاعدة التحقق' : 'تعطيل قاعدة التحقق' });
    }
    return item;
  },

  /** Resolve a quarantined record: 'مُصحح' | 'مرفوض' (or back to 'معلّق'); logged as 'validation'. */
  resolveQuarantine(id, status, by = '') {
    const v = platform().validation;
    const item = isPlainObject(v) && Array.isArray(v.quarantine) ? v.quarantine.find((q) => q && q.id === id) : null;
    if (!item) return null;
    const next = pickEnum(status, QUARANTINE_STATUS, 'مُصحح');
    item.status = next;
    item.resolvedAt = next === 'معلّق' ? null : localISO(store.now());
    item.resolvedBy = next === 'معلّق' ? null : (text(by) || 'مسؤول جودة البيانات');
    changed('platform.validation.quarantine');
    store.pushAudit({ actor: item.resolvedBy || 'مسؤول جودة البيانات', action: 'validation', target: item.recordRef || item.id, detail: `${next === 'مُصحح' ? 'تصحيح' : next === 'مرفوض' ? 'رفض' : 'إعادة تعليق'} سجل محجور — ${item.reason || ''}`.trim() });
    return item;
  },

  updatePipeline(id, patch = {}) {
    const pipe = findPlatform('pipelines', id);
    if (!pipe || !isPlainObject(patch)) return null;
    const rest = { ...patch };
    if (rest.status !== undefined) rest.status = pickEnum(rest.status, ['running', 'idle', 'training', 'degraded'], pipe.status);
    const prevStatus = pipe.status;
    const updated = patchPlatformItem('pipelines', id, rest);
    if (rest.status && rest.status !== prevStatus) {
      store.pushAudit({ actor: text(patch.by) || 'مهندس النماذج', action: 'model-update', target: pipe.nameAr || pipe.name || id, detail: `تغيير حالة المحرك: ${prevStatus} ← ${rest.status}${rest.version ? ` (الإصدار ${rest.version})` : ''}` });
    }
    return updated;
  },

  updateConnector(id, patch = {}) {
    const conn = findPlatform('connectors', id);
    if (!conn || !isPlainObject(patch)) return null;
    const rest = { ...patch };
    if (rest.status !== undefined) rest.status = pickEnum(rest.status, ['connected', 'degraded', 'disconnected', 'configurable'], conn.status);
    return patchPlatformItem('connectors', id, rest);
  },

  /** Prepend an audit entry {id, at, actor, action, target, detail}; capped at 500. */
  pushAudit(entry = {}) {
    if (!isPlainObject(entry)) return null;
    const list = platformList('auditLog');
    const item = {
      id: text(entry.id) || `AUD-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e4).toString(36)}`,
      at: typeof entry.at === 'string' && entry.at ? entry.at : localISO(store.now()),
      actor: text(entry.actor) || SYSTEM_ACTOR,
      action: pickEnum(entry.action, AUDIT_ACTIONS, 'config'),
      target: text(entry.target),
      detail: text(entry.detail),
    };
    list.unshift(item);
    if (list.length > AUDIT_CAP) list.length = AUDIT_CAP;
    changed('platform.auditLog');
    return item;
  },
};

export default store;
