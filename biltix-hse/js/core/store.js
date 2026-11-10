/**
 * Biltix Risk AI — state store (js/core/store.js)
 *
 * Single live state object + localStorage persistence + CRUD + filters + settings.
 * Contract (ARCHITECTURE.md §4). Highlights:
 *
 *   • State shape: { ...seed, feed, settings, filters, meta:{version, savedAt, anchorDate, anchorNow} }
 *   • Persistence key 'biltix-hse:v1', debounced 2 s (max-wait 8 s under a steady stream of live
 *     updates; also flushed on pagehide / tab hidden), every storage access guarded
 *     (private mode / quota / disabled storage never throws; a quota overflow is surfaced
 *     once through bus 'alert' with tone 'warning'). Only MUTABLE data is written: settings,
 *     filters, meta, the last 30 feed events and, for every user-mutable collection, a
 *     delta against the seed (new items in full, changed fields of seed items, removed ids).
 *     Reference data (sites, courses, workers, ISO clauses, legal register, sensors,
 *     contracts, suppliers, …) is never persisted and is rebuilt from the seed on load.
 *     Feed-only changes do not trigger a write. Legacy full snapshots (and JSON imports)
 *     are still accepted and normalised on load.
 *   • Time re-anchoring: seed dates are authored against 2026-11-09 12:40 (Riyadh).
 *     Calendar dates ("YYYY-MM-DD") shift by whole days so weekdays/months stay coherent;
 *     instants ("…T hh:mm…") shift by the exact millisecond delta between the anchor
 *     instant and now, and every instant that must lie in the past (sync times, audit
 *     entries, detections, alerts, feed, active permit starts …) is clamped to now, so
 *     nothing timestamp-like is ever in the future after load.
 *   • Snapshots are normalised on load: numbers clamped, enums validated, theme/numerals
 *     coerced, filters checked against the seed, non-object items dropped, platform weights
 *     normalised to sum 1, alert codes backfilled (AL-####), legacy brand defaults migrated.
 *   • Prototype-pollution safe: deepMerge/setPath/patch helpers skip __proto__, constructor
 *     and prototype keys.
 *   • AI-risk state machine enforced here: accept/override only once and only on open
 *     risks (مكتشف/تنبيه), dismiss/escalate never on closed or dismissed risks, closed
 *     permits (مغلق) cannot be reopened — invalid transitions return null.
 *   • CRUD helpers generate ids/codes (R-1049, INC-2026-032, PTW-5543), stamp
 *     createdAt/updatedAt, push a feed event and emit `store:change`.
 *   • Part B (§B5): `state.platform` holds the AI Risk Platform entities from
 *     platform-seed.js (saved copy wins, every date re-anchored by the same day delta),
 *     `settings.platform` carries weights/thresholds/channels, and the platform methods
 *     (addAiRisk, acceptRecommendation, overrideRecommendation, escalateRisk, dismissAiRisk,
 *     addTask, updateTask, addAlert, ackAlert, updateValidation, updatePipeline,
 *     updateConnector, pushAudit, resolveQuarantine, retryWriteback) persist, emit
 *     `store:change`, append audit entries, generate AIR-#### / MT-#### / AL-#### codes and
 *     simulate the write-back to BILTIX PM (pending → synced after 1.5 s + feed event).
 *
 *   • v3 "Precision" (CONTRACT §8): settings gain `lang`, `appearance {background, density}`, `calendar`,
 *     `motion` and `dataSource.lastSuccessAt/lastErrorAt/lastError`; weights must be 5 non-negative numbers
 *     summing to 1 ± 0.001 and thresholds must satisfy critical ≥ alert + 5 — invalid values are REJECTED
 *     with a bilingual reason (validateWeights / validateThresholds / setWeights / setThresholds, bus
 *     'settings:invalid'), never silently reshaped. AI risks carry likelihood/impact (1–5) with the score
 *     derived as L × I × 4, residualLikelihood/residualImpact (+ residualAssessment), dataQuality and
 *     treatment { plan, taskId, evidence[] }. New audited CRUD returns { ok, … } | { ok:false, reason,
 *     message, messageEn, errors? }: addEvidence, removeEvidence, assessResidual, closeAiRisk (residual
 *     assessment + outcome required), reopenAiRisk, editTask, assignTask, addTaskAttachment,
 *     removeTaskAttachment, recordDataSourceResult; addAiRisk validates (no silent defaults for
 *     likelihood/impact/owner/due). Every feed event and audit entry the store writes is bilingual
 *     (title/detail + titleEn/detailEn, detail + detailEn); simulated operations say so.
 *
 * Side effects on import are limited to reading localStorage once to build `state`.
 */

import seed, { RISK_STATUS, CONTROL_TYPES, INCIDENT_TYPES, INCIDENT_STATUS, PERMIT_TYPES, PERMIT_STATUS, INSPECTION_STATUS, INSPECTION_TYPES, INTEGRATION_STATUS } from '../data/seed.js';
import { bus } from './bus.js';
import { sel } from './selectors.js';
import { enumEn, dataEn, siteEnById, personEn, latinOnly } from '../data/vocab-en.js';

/**
 * Part B — platform seed (ARCHITECTURE.md §B3/§B5). Loaded through an awaited dynamic
 * import so it behaves like a static import inside the module graph, yet a missing or
 * broken `platform-seed.js` degrades to empty collections instead of taking the whole
 * application down with it (the HSE pillar must keep booting on its own).
 */
let platformSeed = null;
/** v3 helper from platform-seed.js: input-data quality of a source system (one definition). */
let deriveDataQuality = null;
try {
  const mod = await import('../data/platform-seed.js');
  platformSeed = (mod && (mod.default || mod.platformSeed)) || null;
  if (!isPlainObject(platformSeed)) platformSeed = null;
  if (mod && typeof mod.deriveDataQuality === 'function') deriveDataQuality = mod.deriveDataQuality;
} catch (error) {
  console.warn('[biltix] platform-seed.js غير متاح بعد — تعمل المنصة بمجموعات فارغة.', error && error.message ? error.message : error);
}

export const STORAGE_KEY = 'biltix-hse:v1';
export const STATE_VERSION = 1;
/** Layout of the persisted payload: 'delta' (mutable data only) vs legacy full snapshots. */
export const PERSIST_FORMAT = 'delta';
export const SEED_ANCHOR_DATE = (seed && seed.meta && typeof seed.meta.anchorDate === 'string') ? seed.meta.anchorDate : '2026-11-09';
/** Instant the seed was authored at (Riyadh noon-ish) — instants are re-anchored from here. */
export const SEED_ANCHOR_NOW = (seed && seed.meta && typeof seed.meta.anchorNow === 'string') ? seed.meta.anchorNow : `${SEED_ANCHOR_DATE}T12:40:00+03:00`;
export const FEED_CAP = 200;
export const AUDIT_CAP = 500;
/** Feed events kept in localStorage (the live engines refill the rest). */
export const PERSIST_FEED_CAP = 30;
export const PERSIST_DEBOUNCE_MS = 2000;
/** Upper bound for a burst of changes (live engines mutate every few seconds): the write is never starved. */
export const PERSIST_MAX_WAIT_MS = 8000;
const WRITEBACK_MS = 1500;
const DAY_MS = 86_400_000;
/** Legacy brand defaults (pre-RTL-2); saved copies of these migrate to '' = "use theme tokens". */
const LEGACY_BRAND = { primary: '#2f6fed', accent: '#19c6e6' };
const HEX_RE = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;
const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;
const INSTANT_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;
const UNSAFE_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
const DATA_SOURCE_TYPES = ['simulation', 'json', 'sheets', 'supabase'];
export const MOTION_MODES = Object.freeze(['auto', 'reduce', 'full']);
/** v3 settings enums (CONTRACT §8). */
export const LANGS = Object.freeze(['ar', 'en']);
export const BACKGROUND_MODES = Object.freeze(['static', 'subtle', 'cinematic']);
export const DENSITY_MODES = Object.freeze(['comfortable', 'compact']);
export const CALENDAR_MODES = Object.freeze(['gregorian', 'hijri', 'both']);
/** Weights must sum to 1 within this tolerance (CONTRACT §8). */
export const WEIGHT_TOLERANCE = 0.001;
/** The critical threshold must sit at least this far above the alert threshold. */
export const THRESHOLD_GAP = 5;
const WEIGHT_KEYS = ['contract', 'bom', 'schedule', 'site', 'cost'];

export const DEFAULT_SETTINGS = deepFreeze({
  theme: 'dark',
  numerals: 'latn',
  // v3: interface language, appearance, calendar and motion (the shell's pre-paint script reads these).
  lang: 'ar',
  appearance: { background: 'subtle', density: 'comfortable' },
  calendar: 'both',
  motion: 'auto',
  // '' for primary/accent means "use the theme tokens" (css/tokens.css); a hex overrides both themes.
  brand: { primary: '', accent: '', companyName: 'بلتكس', logoUrl: '' },
  sound: false,
  feedPaused: false,
  // lastSuccessAt / lastErrorAt / lastError: outcome of the last REAL test or import (status.js → Live / Stale / Error).
  dataSource: { type: 'simulation', url: '', apiKey: '', table: '', lastSuccessAt: null, lastErrorAt: null, lastError: null },
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
export const AUDIT_ACTIONS = [
  'override', 'accept', 'escalate', 'writeback', 'model-update', 'validation', 'login', 'config', 'close',
  // v3 audited CRUD (risk lifecycle + tasks)
  'create', 'evidence', 'residual', 'reopen', 'assign', 'edit', 'attachment',
];
/**
 * Structured (language-neutral) fields an audit entry may carry next to detail/detailEn, so a view can word it
 * from its own dictionaries in either language: ids and Latin keys, booleans, stored enum values (from / to).
 */
const AUDIT_STRUCTURED = ['kind', 'ruleId', 'enabled', 'quarantineId', 'recordRef', 'decision', 'from', 'to', 'pipelineId', 'version'];
/** v3: optional task priority (Latin ids; displayed through dictionaries). */
export const TASK_PRIORITIES = ['high', 'medium', 'low'];
export const EVIDENCE_KINDS = ['link', 'note', 'file'];
export const PIPELINE_STATUS = ['running', 'idle', 'training', 'degraded'];
export const CONNECTOR_STATUS = ['connected', 'degraded', 'disconnected', 'configurable'];
export const ALERT_SEVERITIES = ['critical', 'routine'];
export const ALERT_QUEUES = ['immediate', 'standard'];
/** AI-risk state machine (§B3): accept/override only from these … */
export const AI_RISK_ASSIGNABLE = ['مكتشف', 'تنبيه'];
/** … and nothing moves out of these. */
export const AI_RISK_TERMINAL = ['مغلق', 'مُتجاوز'];
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

/**
 * Platform date-bearing fields re-anchored on load (§B5 list, exhaustively). A field holding a
 * calendar date ("YYYY-MM-DD") is shifted by whole days; one holding an instant ("…T hh:mm…")
 * by the exact ms delta — the value's own format decides (see `shiftValue`). Every instant
 * is clamped to "now" unless `futureOk` says it may legitimately lie in the future.
 */
const PLATFORM_DATE_FIELDS = {
  projects: { own: ['startDate', 'plannedFinish', 'forecastFinish'], nested: { nextMilestone: ['date'] } },
  contracts: { own: ['signedAt', 'endsAt'], children: { obligations: ['due'] } },
  boqItems: { own: ['requiredBy', 'orderBy'] },
  scheduleTasks: { own: ['start', 'finish', 'baselineFinish'] },
  approvals: { own: ['submittedAt'] },
  changeOrders: { own: ['submittedAt'] },
  aiRisks: {
    own: ['detectedAt', 'updatedAt', 'dueDate', 'closedAt', 'reopenedAt'],
    children: { history: ['at'], overrides: ['at'] },
    nested: { residualAssessment: ['at'] },
    deepChildren: { 'treatment.evidence': ['addedAt'] },
  },
  tasks: { own: ['dueDate', 'createdAt', 'closedAt', 'updatedAt'], nested: { writeback: ['at'] }, children: { attachments: ['addedAt'] } },
  alerts: { own: ['sentAt', 'ackAt'] },
  pipelines: { own: ['lastRun'] },
  connectors: { own: ['lastSync'] },
  auditLog: { own: ['at'] },
};

export const DEFAULT_FILTERS = deepFreeze({ siteId: 'all', range: 30, search: '' });

/** Part A collections the UI mutates (persisted as deltas against the seed; a legacy full copy overrides the seed). */
const MUTABLE_COLLECTIONS = ['risks', 'incidents', 'permits', 'inspections', 'integrations', 'feed'];
/** Part A collections persisted as deltas (feed is persisted separately, capped). */
const PERSIST_COLLECTIONS = ['risks', 'incidents', 'permits', 'inspections', 'integrations'];
/** Platform collections persisted as deltas. */
const PERSIST_PLATFORM_COLLECTIONS = ['aiRisks', 'tasks', 'alerts', 'auditLog', 'connectors', 'pipelines'];
/** platform.validation sub-collections persisted as deltas. */
const PERSIST_VALIDATION_KEYS = ['sources', 'rules', 'quarantine'];
/**
 * Real-test diagnostics on integration / connector records: `lastTest` { ok, opaque, at, latencyMs, reason,
 * message, messageEn } written by the Integrations "Test connection" action, and `lastSuccessAt` / `lastErrorAt`.
 * They are DIAGNOSTICS ONLY: persisting them never changes a record's `status`, `simulated` or `real` flag, and the
 * store never derives a "connected"/Live state from them (status.js is the only place that classifies). They are
 * real instants, so they are NOT re-anchored on load (only clamped so none lies in the future).
 */
const DIAGNOSTIC_FIELDS = ['lastTest', 'lastSuccessAt', 'lastErrorAt'];
/**
 * Fields whose changes are persisted for seed items of a collection (undefined = every field).
 * Jittered telemetry (latency, counters, histories) stays session-only; configuration, status
 * and real-test diagnostics survive reloads.
 */
const PERSIST_FIELDS = {
  integrations: ['config', 'status', 'lastSync', 'lastError', 'enabled', ...DIAGNOSTIC_FIELDS],
  connectors: ['config', 'status', 'lastSync', 'enabled', 'mode', ...DIAGNOSTIC_FIELDS],
  pipelines: ['status', 'version', 'lastRun', 'driftScore', 'calibrationError', 'enabled'],
  sources: ['enabled'],
  rules: ['enabled'],
};

/** Part A date-bearing fields re-anchored on load — one entry per collection (format-driven, see above). */
const DATE_FIELDS = {
  risks: { own: ['dueDate', 'createdAt', 'updatedAt', 'closedAt'], children: { history: ['at'] } },
  incidents: { own: ['date', 'createdAt', 'updatedAt', 'closedAt'], children: { actions: ['due', 'doneAt'] } },
  permits: {
    own: ['startsAt', 'expiresAt', 'createdAt', 'updatedAt', 'approvedAt', 'closedAt'],
    // expiry is a deadline; a draft / pending / suspended permit may start later.
    futureOk: (item, key) => key === 'expiresAt' || (key === 'startsAt' && !['نشط', 'مغلق'].includes(item && item.status)),
  },
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

/** Keys that must never be assigned from data (prototype pollution). */
function isUnsafeKey(key) {
  return UNSAFE_KEYS.has(key);
}

/** Recursive merge: plain objects merge key by key, arrays and scalars replace. Skips unsafe keys. */
function deepMerge(target, patch) {
  if (!isPlainObject(patch)) return patch;
  const out = isPlainObject(target) ? { ...target } : {};
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined || isUnsafeKey(key)) continue;
    out[key] = isPlainObject(value) && isPlainObject(out[key]) ? deepMerge(out[key], value) : (Array.isArray(value) ? value.slice() : value);
  }
  return out;
}

/** Object.assign that ignores unsafe keys and `undefined` values. */
function safeAssign(target, patch) {
  if (!isPlainObject(target) || !isPlainObject(patch)) return target;
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined || isUnsafeKey(key)) continue;
    target[key] = value;
  }
  return target;
}

/** Structural equality through JSON (good enough for plain data records). */
function sameJSON(a, b) {
  if (a === b) return true;
  try {
    return JSON.stringify(a) === JSON.stringify(b);
  } catch {
    return false;
  }
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

/** Offset suffix of an ISO instant ("+03:00", "Z") → minutes east of UTC; null when absent/invalid. */
function offsetMinutesOf(value) {
  const m = /(Z|[+-]\d{2}:\d{2})$/.exec(String(value));
  if (!m) return null;
  if (m[1] === 'Z') return 0;
  const sign = m[1][0] === '-' ? -1 : 1;
  return sign * (Number(m[1].slice(1, 3)) * 60 + Number(m[1].slice(4, 6)));
}

/** Format an epoch ms as "YYYY-MM-DDThh:mm:ss±hh:mm" in the given UTC offset (minutes). */
function isoAtOffset(epochMs, offsetMin) {
  const shifted = new Date(epochMs + offsetMin * 60_000);
  const sign = offsetMin < 0 ? '-' : '+';
  const abs = Math.abs(offsetMin);
  return `${shifted.getUTCFullYear()}-${pad(shifted.getUTCMonth() + 1, 2)}-${pad(shifted.getUTCDate(), 2)}`
    + `T${pad(shifted.getUTCHours(), 2)}:${pad(shifted.getUTCMinutes(), 2)}:${pad(shifted.getUTCSeconds(), 2)}`
    + `${sign}${pad(Math.floor(abs / 60), 2)}:${pad(abs % 60, 2)}`;
}

/**
 * Shift an ISO instant by `ms`, keeping its original UTC offset
 * ("2026-11-09T12:39:00+03:00" + 1 h → "2026-11-09T13:39:00+03:00").
 * Offset-less instants are treated as local time (the offset of the host).
 */
export function shiftInstant(value, ms) {
  if (typeof value !== 'string' || !INSTANT_RE.test(value) || !Number.isFinite(ms) || ms === 0) return value;
  const epoch = Date.parse(value);
  if (!Number.isFinite(epoch)) return value;
  const offset = offsetMinutesOf(value);
  if (offset === null) return localISO(new Date(epoch + ms));
  return isoAtOffset(epoch + ms, offset);
}

/** Clamp an ISO instant so it is never after `nowDate` (keeps its offset). */
export function clampInstant(value, nowDate) {
  if (typeof value !== 'string' || !INSTANT_RE.test(value)) return value;
  const epoch = Date.parse(value);
  const nowMs = nowDate.getTime();
  if (!Number.isFinite(epoch) || epoch <= nowMs) return value;
  const offset = offsetMinutesOf(value);
  return offset === null ? localISO(nowDate) : isoAtOffset(nowMs, offset);
}

/**
 * Re-anchor one date-bearing string: calendar dates move by `days`, instants by `ms`
 * (when `shift.instants` is on), and instants that must lie in the past are clamped to now.
 */
function shiftValue(value, shift, futureOk) {
  if (typeof value !== 'string') return value;
  if (DATE_ONLY_RE.test(value)) return shift.days ? shiftISO(value, shift.days) : value;
  if (!INSTANT_RE.test(value)) return value;
  let next = shift.instants && shift.ms ? shiftInstant(value, shift.ms) : value;
  if (!futureOk) next = clampInstant(next, shift.now);
  return next;
}

function shiftFields(obj, keys, shift, spec) {
  if (!isPlainObject(obj)) return;
  for (const key of keys) {
    if (typeof obj[key] !== 'string') continue;
    const futureOk = spec && typeof spec.futureOk === 'function' ? Boolean(spec.futureOk(obj, key)) : false;
    obj[key] = shiftValue(obj[key], shift, futureOk);
  }
}

/** Apply a {own, children, nested, futureOk} spec to every item of a collection. */
function shiftCollection(items, spec, shift) {
  if (!Array.isArray(items) || !spec) return;
  for (const item of items) {
    if (!isPlainObject(item)) continue;
    if (spec.own) shiftFields(item, spec.own, shift, spec);
    if (spec.children) {
      for (const [childKey, childFields] of Object.entries(spec.children)) {
        const children = item[childKey];
        if (Array.isArray(children)) children.forEach((child) => shiftFields(child, childFields, shift));
      }
    }
    if (spec.nested) {
      for (const [childKey, childFields] of Object.entries(spec.nested)) shiftFields(item[childKey], childFields, shift);
    }
    if (spec.deepChildren) {
      for (const [path, childFields] of Object.entries(spec.deepChildren)) {
        const list = getPath(item, path);
        if (Array.isArray(list)) list.forEach((child) => shiftFields(child, childFields, shift));
      }
    }
  }
}

/** Instant the snapshot was anchored at (meta.anchorNow → savedAt → seed anchor), as epoch ms. */
function anchorInstantOf(meta) {
  const candidates = [meta && meta.anchorNow, meta && meta.savedAt, SEED_ANCHOR_NOW];
  for (const c of candidates) {
    const t = typeof c === 'string' ? Date.parse(c) : NaN;
    if (Number.isFinite(t)) return t;
  }
  return Date.parse(SEED_ANCHOR_NOW);
}

/**
 * Re-anchor every date in `state` from `state.meta.anchorDate` / `anchorNow` to `nowDate`.
 * Calendar dates shift by whole days (weekday-preserving demo), instants by the exact ms delta
 * (`instants: true` forces it even on the same day — used for the seed; 'auto' = only when the
 * calendar day changed, so a same-day reload leaves saved instants untouched). Past-only
 * instants are always clamped to now. Returns the day delta applied.
 */
export function reanchor(state, nowDate = new Date(), { instants = 'auto' } = {}) {
  if (!isPlainObject(state)) return 0;
  const now = nowDate instanceof Date ? nowDate : new Date(nowDate);
  const today = todayISO(now);
  const meta = isPlainObject(state.meta) ? state.meta : (state.meta = {});
  const anchor = typeof meta.anchorDate === 'string' ? meta.anchorDate : SEED_ANCHOR_DATE;
  const days = daysBetween(anchor, today);
  const ms = now.getTime() - anchorInstantOf(meta);
  const shiftInstants = instants === true || (instants !== false && days !== 0);
  const shift = { days, ms, instants: shiftInstants, now };
  for (const [collection, spec] of Object.entries(DATE_FIELDS)) shiftCollection(state[collection], spec, shift);
  if (isPlainObject(state.platform)) reanchorPlatform(state.platform, shift);
  meta.anchorDate = today;
  meta.anchorNow = localISO(now);
  return days;
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

/**
 * Re-anchor every platform date (§B5 list). `shift` is the {days, ms, instants, now} object built
 * by `reanchor()`; a bare number is accepted for backwards compatibility (days only).
 */
export function reanchorPlatform(platform, shift) {
  if (!isPlainObject(platform)) return;
  const s = typeof shift === 'number' ? { days: shift, ms: 0, instants: false, now: new Date() } : shift;
  if (!s) return;
  for (const [collection, spec] of Object.entries(PLATFORM_DATE_FIELDS)) shiftCollection(platform[collection], spec, s);
  if (isPlainObject(platform.monteCarlo)) {
    for (const mc of Object.values(platform.monteCarlo)) shiftFields(mc, ['p50', 'p80', 'p90', 'plannedFinish'], s);
  }
  if (isPlainObject(platform.weather)) {
    for (const w of Object.values(platform.weather)) {
      if (isPlainObject(w) && Array.isArray(w.next7)) w.next7.forEach((d) => shiftFields(d, ['date'], s));
    }
  }
  const v = platform.validation;
  if (isPlainObject(v)) {
    if (Array.isArray(v.sources)) v.sources.forEach((src) => shiftFields(src, ['lastBatch'], s));
    if (Array.isArray(v.quarantine)) v.quarantine.forEach((q) => shiftFields(q, ['at', 'resolvedAt'], s));
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
/* ────────────────────────────── normalisation (snapshots / imports) ────────────────────────────── */

function bool(value, fallback = false) {
  if (typeof value === 'boolean') return value;
  return value == null ? fallback : Boolean(value);
}

/** '#RGB' / '#RRGGBB' kept as is; anything else (and a legacy default) becomes '' = theme tokens. */
function hexOrEmpty(value, legacy) {
  const v = typeof value === 'string' ? value.trim() : '';
  if (!HEX_RE.test(v)) return '';
  if (legacy && v.toLowerCase() === legacy) return '';
  return v;
}

function objectItems(list) {
  return Array.isArray(list) ? list.filter((x) => isPlainObject(x) && (typeof x.id === 'string' || typeof x.id === 'number')) : [];
}

function objectList(list) {
  return Array.isArray(list) ? list.filter(isPlainObject) : [];
}

function stringList(list) {
  return Array.isArray(list) ? list.map((s) => text(s)).filter(Boolean) : [];
}

const INTEGRATION_STATUS_IDS = Array.isArray(INTEGRATION_STATUS)
  ? INTEGRATION_STATUS.map((s) => (isPlainObject(s) ? s.id : s)).filter(Boolean)
  : CONNECTOR_STATUS;

/* ────────────────────────────── v3 validation (weights, thresholds, risk input) ────────────────────────────── */

/** Bilingual failure object the UI can show as is (or map `reason` to its own dictionary). */
function fail(reason, message, messageEn, extra = {}) {
  return { ok: false, reason, message, messageEn, ...extra };
}

/**
 * Weights rule (CONTRACT §8): exactly the five domains, each a finite number ≥ 0, summing to 1 ± 0.001.
 * Returns { ok:true, weights, sum } or { ok:false, reason, message, messageEn, sum, field }.
 */
export function validateWeights(input) {
  if (!isPlainObject(input)) return fail('weights-shape', 'يجب إدخال أوزان المجالات الخمسة.', 'Enter a weight for each of the five domains.', { sum: null });
  const weights = {};
  for (const key of WEIGHT_KEYS) {
    const raw = input[key];
    const n = typeof raw === 'string' && raw.trim() !== '' ? Number(raw) : (typeof raw === 'number' ? raw : NaN);
    if (!Number.isFinite(n)) return fail('weights-missing', 'كل وزن يجب أن يكون رقماً.', 'Every weight must be a number.', { field: key, sum: null });
    if (n < 0) return fail('weights-negative', 'لا يمكن أن يكون الوزن سالباً.', 'A weight cannot be negative.', { field: key, sum: null });
    weights[key] = n;
  }
  const extra = Object.keys(input).filter((k) => !WEIGHT_KEYS.includes(k) && !isUnsafeKey(k));
  if (extra.length) return fail('weights-unknown', 'توجد مفاتيح أوزان غير معروفة.', 'Unknown weight keys were supplied.', { field: extra[0], sum: null });
  const sum = Math.round(WEIGHT_KEYS.reduce((a, k) => a + weights[k], 0) * 1e6) / 1e6;
  if (Math.abs(sum - 1) > WEIGHT_TOLERANCE) {
    const pct = Math.round(sum * 1000) / 10;
    return fail('weights-sum', `مجموع الأوزان ${pct}% — يجب أن يساوي 100%.`, `The weights add up to ${pct}% — they must total 100%.`, { sum });
  }
  return { ok: true, weights, sum };
}

/**
 * Thresholds rule: integers 0–100, critical ≥ alert + 5 (CONTRACT §8 / AC-07).
 * Returns { ok:true, alertThreshold, criticalThreshold } or a bilingual failure.
 */
export function validateThresholds(input) {
  const src = isPlainObject(input) ? input : {};
  const a = Number(src.alertThreshold);
  const c = Number(src.criticalThreshold);
  if (!Number.isFinite(a) || !Number.isFinite(c)) return fail('thresholds-missing', 'أدخل عتبتي التنبيه والتصعيد كأرقام.', 'Enter both the alert and the critical threshold as numbers.');
  if (a < 0 || a > 100 || c < 0 || c > 100) return fail('thresholds-range', 'العتبات بين 0 و100.', 'Thresholds must be between 0 and 100.');
  const alertThreshold = Math.round(a);
  const criticalThreshold = Math.round(c);
  if (criticalThreshold < alertThreshold + THRESHOLD_GAP) {
    return fail('thresholds-gap', `يجب أن تكون عتبة التصعيد الفوري أعلى من عتبة التنبيه بـ ${THRESHOLD_GAP} نقاط على الأقل.`, `The critical threshold must be at least ${THRESHOLD_GAP} points above the alert threshold.`, { field: 'criticalThreshold' });
  }
  return { ok: true, alertThreshold, criticalThreshold };
}

/** Platform category weights → numbers in 0..1 summing to exactly 1 (fallback when unusable). */
export function normalizeWeights(input, fallback = DEFAULT_SETTINGS.platform.weights) {
  const base = isPlainObject(fallback) ? fallback : DEFAULT_SETTINGS.platform.weights;
  const keys = Object.keys(base);
  const raw = isPlainObject(input) ? input : {};
  const vals = keys.map((k) => clampNum(raw[k], 0, 1, NaN));
  keys.forEach((k, i) => { if (!Number.isFinite(vals[i])) vals[i] = clampNum(base[k], 0, 1, 0); });
  const sum = vals.reduce((a, b) => a + b, 0);
  if (!(sum > 0)) return { ...DEFAULT_SETTINGS.platform.weights };
  const out = {};
  keys.forEach((k, i) => { out[k] = Math.round((vals[i] / sum) * 10_000) / 10_000; });
  const drift = Math.round((1 - keys.reduce((a, k) => a + out[k], 0)) * 10_000) / 10_000;
  if (drift) out[keys[0]] = Math.round((out[keys[0]] + drift) * 10_000) / 10_000;
  return out;
}

/**
 * Coerce any settings-like object into the canonical shape: theme/numerals enums, brand hex
 * or '' (legacy '#2F6FED'/'#19C6E6' defaults migrate to ''), data-source enum, motion mode,
 * platform weights normalised to sum 1, thresholds clamped (critical ≥ alert) with `current`
 * values as the fallback for unparsable numbers.
 */
/** ISO instant that must not lie in the future (clock skew / imported files) → clamped; anything else → null. */
function pastInstantOrNull(value, nowDate = new Date()) {
  if (typeof value !== 'string' || !INSTANT_RE.test(value) || !Number.isFinite(Date.parse(value))) return null;
  return clampInstant(value, nowDate);
}

/** dataSource.lastError: a short string or { code, message, messageEn } (bilingual), else null. */
function sanitizeLastError(value) {
  if (typeof value === 'string') return value.trim().slice(0, 500) || null;
  if (isPlainObject(value)) {
    const out = {
      code: text(value.code).slice(0, 60) || null,
      message: text(value.message).slice(0, 500),
      messageEn: text(value.messageEn).slice(0, 500),
    };
    return out.message || out.messageEn || out.code ? out : null;
  }
  return null;
}

/** A well-formed ISO instant string (any offset), else null. Shape check only — clamping happens in finishLoad. */
function instantOrNull(value) {
  return typeof value === 'string' && INSTANT_RE.test(value) && Number.isFinite(Date.parse(value)) ? value : null;
}

/**
 * Integration / connector `lastTest` (diagnostic of the last REAL connection test): a plain object with a valid
 * `at` instant, else null. Unknown keys are dropped; strings are capped. Never carries or implies a status.
 */
function sanitizeLastTest(value) {
  if (!isPlainObject(value)) return null;
  const at = instantOrNull(value.at);
  if (!at) return null;
  const latency = Number(value.latencyMs);
  const out = {
    ok: value.ok === true,
    opaque: value.opaque === true,
    at,
    latencyMs: value.latencyMs != null && Number.isFinite(latency) && latency > 0 ? latency : null,
    reason: text(value.reason).slice(0, 60) || null,
    message: text(value.message).slice(0, 500),
    messageEn: text(value.messageEn).slice(0, 500),
  };
  const httpStatus = Number(value.status);
  if (value.status != null && Number.isInteger(httpStatus) && httpStatus >= 0 && httpStatus < 1000) out.status = httpStatus;
  if (typeof value.type === 'string' && /^[a-z]{2,20}$/.test(value.type)) out.type = value.type;
  return out;
}

/** Shape-normalise the diagnostics of one integration / connector record in place (present fields only). */
function normalizeDiagnostics(rec) {
  if (rec.lastSuccessAt !== undefined) rec.lastSuccessAt = instantOrNull(rec.lastSuccessAt);
  if (rec.lastErrorAt !== undefined) rec.lastErrorAt = instantOrNull(rec.lastErrorAt);
  if (rec.lastTest !== undefined) rec.lastTest = sanitizeLastTest(rec.lastTest);
}

/** Load pass: no diagnostic instant may lie after `nowDate` (clock skew, imported file). */
function clampDiagnostics(base, nowDate) {
  const lists = [base && base.integrations, base && isPlainObject(base.platform) ? base.platform.connectors : null];
  for (const list of lists) {
    for (const rec of objectItems(list)) {
      for (const key of ['lastSuccessAt', 'lastErrorAt']) if (typeof rec[key] === 'string') rec[key] = clampInstant(rec[key], nowDate);
      if (isPlainObject(rec.lastTest) && typeof rec.lastTest.at === 'string') rec.lastTest.at = clampInstant(rec.lastTest.at, nowDate);
    }
  }
}

export function sanitizeSettings(input, current = DEFAULT_SETTINGS) {
  const cur = isPlainObject(current) ? current : DEFAULT_SETTINGS;
  const merged = deepMerge(clone(DEFAULT_SETTINGS), isPlainObject(input) ? input : {});
  merged.theme = merged.theme === 'light' ? 'light' : 'dark';
  merged.numerals = merged.numerals === 'arab' ? 'arab' : 'latn';
  merged.lang = pickEnum(merged.lang, LANGS, 'ar');
  merged.calendar = pickEnum(merged.calendar, CALENDAR_MODES, 'both');
  merged.motion = pickEnum(merged.motion, MOTION_MODES, 'auto');
  const ap = isPlainObject(merged.appearance) ? merged.appearance : {};
  merged.appearance = {
    background: pickEnum(ap.background, BACKGROUND_MODES, DEFAULT_SETTINGS.appearance.background),
    density: pickEnum(ap.density, DENSITY_MODES, DEFAULT_SETTINGS.appearance.density),
  };
  const brand = deepMerge(clone(DEFAULT_SETTINGS.brand), isPlainObject(merged.brand) ? merged.brand : {});
  brand.primary = hexOrEmpty(brand.primary, LEGACY_BRAND.primary);
  brand.accent = hexOrEmpty(brand.accent, LEGACY_BRAND.accent);
  brand.companyName = text(brand.companyName).slice(0, 60) || DEFAULT_SETTINGS.brand.companyName;
  brand.logoUrl = typeof brand.logoUrl === 'string' ? brand.logoUrl.trim().slice(0, 2048) : '';
  merged.brand = brand;
  merged.sound = bool(merged.sound, false);
  merged.feedPaused = bool(merged.feedPaused, false);
  if (merged.railCollapsed !== undefined) merged.railCollapsed = bool(merged.railCollapsed);
  if (merged.reducedMotion !== undefined) merged.reducedMotion = bool(merged.reducedMotion);
  const ds = deepMerge(clone(DEFAULT_SETTINGS.dataSource), isPlainObject(merged.dataSource) ? merged.dataSource : {});
  ds.type = pickEnum(ds.type, DATA_SOURCE_TYPES, 'simulation');
  ds.url = text(ds.url);
  ds.apiKey = text(ds.apiKey);
  ds.table = text(ds.table);
  ds.lastSuccessAt = pastInstantOrNull(ds.lastSuccessAt);
  ds.lastErrorAt = pastInstantOrNull(ds.lastErrorAt);
  ds.lastError = sanitizeLastError(ds.lastError);
  merged.dataSource = ds;
  merged.alertWebhook = text(merged.alertWebhook);
  const curP = isPlainObject(cur.platform) ? cur.platform : DEFAULT_SETTINGS.platform;
  const p = deepMerge(clone(DEFAULT_SETTINGS.platform), isPlainObject(merged.platform) ? merged.platform : {});
  // Weights: a valid set (sum 1 ± 0.001) is kept exactly; a legacy set that is merely rounded (± 2 %) is
  // renormalised; anything else falls back to the current (then default) weights — never a silent reshape.
  const w = validateWeights(p.weights);
  if (w.ok) p.weights = { ...w.weights };
  else {
    const vals = isPlainObject(p.weights) ? WEIGHT_KEYS.map((k) => Number(p.weights[k])) : [];
    const sum = vals.reduce((a, b) => a + b, 0);
    const nearlyValid = vals.length === WEIGHT_KEYS.length && vals.every((n) => Number.isFinite(n) && n >= 0) && Math.abs(sum - 1) <= 0.02;
    const curW = validateWeights(curP.weights);
    p.weights = nearlyValid ? normalizeWeights(p.weights) : (curW.ok ? { ...curW.weights } : { ...DEFAULT_SETTINGS.platform.weights });
  }
  // Thresholds: integers 0–100 with critical ≥ alert + 5; a violating pair falls back to the current pair.
  const curAlert = clampNum(curP.alertThreshold, 0, 100, DEFAULT_SETTINGS.platform.alertThreshold);
  const curCritical = clampNum(curP.criticalThreshold, 0, 100, DEFAULT_SETTINGS.platform.criticalThreshold);
  p.alertThreshold = Math.round(clampNum(p.alertThreshold, 0, 100, curAlert));
  p.criticalThreshold = Math.round(clampNum(p.criticalThreshold, 0, 100, curCritical));
  if (!validateThresholds(p).ok) {
    const curPair = validateThresholds({ alertThreshold: curAlert, criticalThreshold: curCritical });
    if (curPair.ok) { p.alertThreshold = curPair.alertThreshold; p.criticalThreshold = curPair.criticalThreshold; } else {
      p.alertThreshold = Math.min(p.alertThreshold, 100 - THRESHOLD_GAP);
      p.criticalThreshold = Math.max(p.criticalThreshold, p.alertThreshold + THRESHOLD_GAP);
    }
  }
  const channels = {};
  for (const k of Object.keys(DEFAULT_SETTINGS.platform.channels)) {
    channels[k] = bool(isPlainObject(p.channels) ? p.channels[k] : undefined, DEFAULT_SETTINGS.platform.channels[k]);
  }
  p.channels = channels;
  const pay = {};
  for (const k of Object.keys(DEFAULT_SETTINGS.platform.paymentPct)) {
    const v = isPlainObject(p.paymentPct) ? p.paymentPct[k] : null;
    pay[k] = v == null || v === '' ? null : clampNum(v, 0, 100, null);
  }
  p.paymentPct = pay;
  p.writebackEnabled = p.writebackEnabled !== false;
  merged.platform = p;
  return merged;
}

/** Global filters: siteId must be 'all' or a known site, range 1..3650 days, search never persisted. */
export function sanitizeFilters(input, siteIds = []) {
  const f = isPlainObject(input) ? input : {};
  const out = { ...DEFAULT_FILTERS };
  for (const [key, value] of Object.entries(f)) {
    if (isUnsafeKey(key) || value === undefined) continue;
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' || value === null) out[key] = value;
  }
  const siteId = text(f.siteId) || 'all';
  out.siteId = siteId === 'all' || siteIds.includes(siteId) ? siteId : 'all';
  out.range = clampInt(f.range, 1, 3650, DEFAULT_FILTERS.range);
  out.search = '';
  return out;
}

/** Backfill AL-#### codes (chronological, continuing after the highest existing code). */
export function backfillAlertCodes(list) {
  if (!Array.isArray(list)) return list;
  const re = /^AL-(\d+)$/;
  let max = maxCaptured(list, re);
  const missing = list.filter((a) => isPlainObject(a) && !re.test(String(a.code || '')));
  if (!missing.length) return list;
  const idNum = (a) => Number(String(a.id || '').replace(/\D/g, '')) || 0;
  missing.sort((a, b) => ((Date.parse(a.sentAt) || 0) - (Date.parse(b.sentAt) || 0)) || (idNum(a) - idNum(b)));
  for (const a of missing) {
    max += 1;
    a.code = `AL-${pad(max, 4)}`;
  }
  return list;
}

/* ────────────────────────────── v3: likelihood × impact helpers ────────────────────────────── */

/** Integer 1–5 or null (not given / not assessed). */
function scale5(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n !== Math.round(n) || n < 1 || n > 5) return null;
  return n;
}

/** Severity (CONTRACT §8, spec D5): likelihood × impact × 4 → 0–100. */
export function scoreOf(likelihood, impact) {
  const l = scale5(likelihood);
  const i = scale5(impact);
  return l && i ? l * i * 4 : null;
}

/**
 * Legacy records (pre-v3 saved state) carry only a 0–100 score: the closest L×I×4 pair that keeps the same
 * rating AND the same alert decision at the default thresholds (> 60 alert, ≥ 85 immediate escalation) —
 * the rule the seed was authored with.
 */
export function liFromScore(score) {
  const s = clampNum(score, 0, 100, 50);
  const band = (v) => (v >= 85 ? 4 : v >= 70 ? 3 : v > 60 ? 2 : v >= 40 ? 1 : 0);
  let best = [3, 3];
  let bestD = Infinity;
  for (let i = 5; i >= 1; i -= 1) {
    for (let l = 5; l >= 1; l -= 1) {
      const v = l * i * 4;
      const d = Math.abs(v - s) + (band(v) === band(s) ? 0 : 1000);
      if (d < bestD) { bestD = d; best = [l, i]; }
    }
  }
  return best;
}

function normalizeEvidenceItem(e, i, riskId) {
  if (!isPlainObject(e)) return null;
  const title = text(e.title).slice(0, 300);
  if (!title) return null;
  const url = typeof e.url === 'string' && /^https?:\/\//i.test(e.url.trim()) ? e.url.trim().slice(0, 2048) : null;
  const out = {
    id: text(e.id) || `EV-${riskId || 'X'}-${i + 1}`,
    kind: pickEnum(e.kind, EVIDENCE_KINDS, 'note'),
    title,
    url,
    addedAt: typeof e.addedAt === 'string' ? e.addedAt : null,
    by: text(e.by) || null,
    local: e.local !== false,
  };
  for (const k of ['titleEn', 'note', 'ref', 'sourceSystem', 'fileName', 'mime']) if (typeof e[k] === 'string' && e[k].trim()) out[k] = e[k].trim().slice(0, k === 'note' ? 2000 : 300);
  if (Number.isFinite(Number(e.size)) && Number(e.size) >= 0) out.size = Math.round(Number(e.size));
  return out;
}

function normalizeTreatment(t, riskId) {
  const src = isPlainObject(t) ? t : {};
  const evidence = Array.isArray(src.evidence) ? src.evidence.map((e, i) => normalizeEvidenceItem(e, i, riskId)).filter(Boolean) : [];
  return { ...src, plan: typeof src.plan === 'string' && src.plan.trim() ? src.plan.trim() : null, taskId: src.taskId == null ? null : text(src.taskId), evidence };
}

/** Per-collection item normalisers (enums, clamped numbers, well-typed sub-structures). */
const ITEM_NORMALIZERS = {
  risks(r) {
    r.status = pickEnum(r.status, RISK_STATUS, 'مفتوح');
    r.likelihood = clampInt(r.likelihood, 1, 5, 3);
    r.severity = clampInt(r.severity, 1, 5, 3);
    r.residualLikelihood = clampInt(r.residualLikelihood, 1, 5, r.likelihood);
    r.residualSeverity = clampInt(r.residualSeverity, 1, 5, r.severity);
    r.controls = normalizeControls(r.controls);
    r.history = objectList(r.history);
  },
  incidents(i) {
    i.type = pickEnum(i.type, INCIDENT_TYPES, 'حادث وشيك');
    i.status = pickEnum(i.status, INCIDENT_STATUS, 'مفتوح');
    i.severity = clampInt(i.severity, 1, 5, 2);
    i.daysLost = clampInt(i.daysLost, 0, 10_000, 0);
    i.investigationStep = clampInt(i.investigationStep, 0, 4, 0);
    i.actions = objectList(i.actions);
  },
  permits(p) {
    p.type = pickEnum(p.type, PERMIT_TYPES, PERMIT_TYPES[0]);
    p.status = pickEnum(p.status, PERMIT_STATUS, 'مسودة');
    p.workers = clampInt(p.workers, 1, 10_000, 1);
    p.hazards = stringList(p.hazards);
    p.controls = Array.isArray(p.controls) ? p.controls.map((c) => (isPlainObject(c) ? text(c.text) : text(c))).filter(Boolean) : [];
    if (p.gasTest != null && !isPlainObject(p.gasTest)) p.gasTest = null;
  },
  inspections(x) {
    x.status = pickEnum(x.status, INSPECTION_STATUS, 'مجدول');
    if (x.type !== undefined) x.type = pickEnum(x.type, INSPECTION_TYPES, INSPECTION_TYPES[0]);
    x.score = x.score == null ? null : clampInt(x.score, 0, 100, null);
    if (x.checklistDone !== undefined) x.checklistDone = clampInt(x.checklistDone, 0, 100_000, 0);
    if (x.checklistTotal !== undefined) x.checklistTotal = clampInt(x.checklistTotal, 0, 100_000, 0);
    if (x.findings !== undefined) x.findings = objectList(x.findings);
  },
  integrations(g) {
    g.status = pickEnum(g.status, INTEGRATION_STATUS_IDS, 'configurable');
    if (g.config != null && !isPlainObject(g.config)) g.config = {};
    if (g.latencyMs !== undefined) g.latencyMs = clampNum(g.latencyMs, 0, 1e7, 0);
    if (g.eventsPerHour !== undefined) g.eventsPerHour = clampNum(g.eventsPerHour, 0, 1e9, 0);
    if (g.uptimePct !== undefined) g.uptimePct = clampNum(g.uptimePct, 0, 100, 0);
    normalizeDiagnostics(g);
  },
  aiRisks(r) {
    r.category = pickEnum(r.category, AI_CATEGORIES, 'site');
    r.type = pickEnum(r.type, AI_TYPES, CATEGORY_TYPE[r.category]);
    r.pipeline = pickEnum(r.pipeline, AI_PIPELINES, CATEGORY_PIPELINE[r.category]);
    r.status = pickEnum(r.status, AI_RISK_STATUS, 'مكتشف');
    // v3: likelihood/impact are authoritative; the score is always derived (legacy records get the closest pair).
    let l = scale5(r.likelihood);
    let im = scale5(r.impact);
    if (!l || !im) [l, im] = liFromScore(r.score);
    r.likelihood = l;
    r.impact = im;
    r.score = l * im * 4;
    r.residualLikelihood = scale5(r.residualLikelihood);
    r.residualImpact = scale5(r.residualImpact);
    if (!r.residualLikelihood || !r.residualImpact) { r.residualLikelihood = null; r.residualImpact = null; r.residualAssessment = null; }
    else if (!isPlainObject(r.residualAssessment)) r.residualAssessment = { at: null, by: null, justification: '' };
    r.treatment = normalizeTreatment(r.treatment, r.id);
    if (r.dataQuality != null && !isPlainObject(r.dataQuality)) r.dataQuality = null;
    // A manually registered risk has no model confidence (null); engine output keeps 0–1.
    r.confidence = r.confidence == null && r.origin === 'manual' ? null : clampNum(r.confidence, 0, 1, 0.8);
    r.history = objectList(r.history);
    r.overrides = objectList(r.overrides);
    r.stakeholders = stringList(r.stakeholders);
    r.escalated = Boolean(r.escalated);
    r.taskId = r.taskId == null ? null : text(r.taskId);
    if (!isPlainObject(r.recommendation)) r.recommendation = { action: '', rationale: '', effort: 'متوسط', impact: '', alternatives: [] };
    if (r.evidence != null && !isPlainObject(r.evidence)) r.evidence = null;
    if (!isPlainObject(r.responseParams)) r.responseParams = {};
  },
  tasks(t) {
    t.status = pickEnum(t.status, TASK_STATUS, 'جديدة');
    t.source = pickEnum(t.source, TASK_SOURCES, 'manual');
    t.riskId = t.riskId == null ? null : text(t.riskId);
    if (!isPlainObject(t.writeback)) t.writeback = { target: 'BILTIX PM', status: 'pending', at: null };
    t.writeback.status = pickEnum(t.writeback.status, ['pending', 'synced', 'failed'], 'pending');
    t.priority = t.priority == null ? null : pickEnum(t.priority, TASK_PRIORITIES, null);
    t.attachments = Array.isArray(t.attachments) ? t.attachments.map((a, i) => normalizeEvidenceItem(a, i, t.id)).filter(Boolean) : [];
  },
  alerts(a) {
    a.severity = pickEnum(a.severity, ALERT_SEVERITIES, 'routine');
    a.queue = pickEnum(a.queue, ALERT_QUEUES, a.severity === 'critical' ? 'immediate' : 'standard');
    a.acknowledged = Boolean(a.acknowledged);
    a.channels = stringList(a.channels);
    if (a.ackBy !== undefined && a.ackBy !== null) a.ackBy = text(a.ackBy) || null;
    if (typeof a.ackAt !== 'string') a.ackAt = null;
  },
  auditLog(e) {
    e.action = pickEnum(e.action, AUDIT_ACTIONS, 'config');
    e.actor = text(e.actor) || SYSTEM_ACTOR;
    e.target = text(e.target);
    e.detail = text(e.detail);
  },
  pipelines(p) {
    p.status = pickEnum(p.status, PIPELINE_STATUS, 'idle');
    // null = not measured (no test set / model service in this version): keep it null, never coerce to 0.
    for (const k of ['precision', 'recall', 'calibrationError', 'driftScore']) if (p[k] !== undefined) p[k] = p[k] === null ? null : clampNum(p[k], 0, 1, null);
    if (p.runsToday !== undefined) p.runsToday = clampInt(p.runsToday, 0, 1e6, 0);
    if (p.acceptanceRatePct !== undefined) p.acceptanceRatePct = clampNum(p.acceptanceRatePct, 0, 100, 0);
  },
  connectors(c) {
    c.status = pickEnum(c.status, CONNECTOR_STATUS, 'configurable');
    if (c.config != null && !isPlainObject(c.config)) c.config = {};
    if (c.latencyMs !== undefined) c.latencyMs = clampNum(c.latencyMs, 0, 1e7, 0);
    normalizeDiagnostics(c);
  },
  sources(s) {
    for (const k of ['completenessPct', 'consistencyPct']) if (s[k] !== undefined) s[k] = clampNum(s[k], 0, 100, 0);
    for (const k of ['recordsIn', 'rejected', 'deduplicated', 'passed']) if (s[k] !== undefined) s[k] = clampInt(s[k], 0, 1e9, 0);
    if (s.enabled !== undefined) s.enabled = Boolean(s.enabled);
  },
  rules(r) {
    if (r.enabled !== undefined) r.enabled = Boolean(r.enabled);
    if (r.hitsToday !== undefined) r.hitsToday = clampInt(r.hitsToday, 0, 1e9, 0);
  },
  quarantine(q) {
    q.status = pickEnum(q.status, QUARANTINE_STATUS, 'معلّق');
  },
  feed(ev) {
    ev.title = text(ev.title);
    ev.detail = text(ev.detail);
    if (ev.titleEn != null) ev.titleEn = text(ev.titleEn);
    if (ev.detailEn != null) ev.detailEn = text(ev.detailEn);
    ev.type = text(ev.type) || 'alert';
    ev.tone = text(ev.tone) || 'accent';
  },
};

/** Drop non-object / id-less / duplicate items and normalise each one (never throws). */
export function normalizeCollection(list, key) {
  const seen = new Set();
  const out = [];
  const fn = ITEM_NORMALIZERS[key];
  for (const item of objectItems(list)) {
    const id = String(item.id);
    if (seen.has(id)) continue;
    seen.add(id);
    if (fn) {
      try { fn(item); } catch { /* keep the item as is */ }
    }
    out.push(item);
  }
  return out;
}

/** Normalise every mutable part of a state object in place (settings, filters, collections). */
export function normalizeState(base, { settingsFallback = DEFAULT_SETTINGS } = {}) {
  if (!isPlainObject(base)) return base;
  base.settings = sanitizeSettings(base.settings, settingsFallback);
  base.filters = sanitizeFilters(base.filters, objectItems(base.sites).map((s) => String(s.id)));
  for (const key of MUTABLE_COLLECTIONS) base[key] = normalizeCollection(base[key], key);
  const p = isPlainObject(base.platform) ? base.platform : (base.platform = emptyPlatform());
  for (const key of PERSIST_PLATFORM_COLLECTIONS) p[key] = normalizeCollection(p[key], key);
  if (!isPlainObject(p.validation)) p.validation = emptyPlatform().validation;
  for (const key of PERSIST_VALIDATION_KEYS) p.validation[key] = normalizeCollection(p.validation[key], key);
  // v3: risks saved before input-data quality existed get it derived from their source system now.
  if (typeof deriveDataQuality === 'function') {
    for (const r of p.aiRisks) if (!isPlainObject(r.dataQuality)) r.dataQuality = deriveDataQuality(p.validation, r.evidence && r.evidence.sourceSystem, r.evidence && r.evidence.kind);
  }
  backfillAlertCodes(p.alerts);
  if (p.auditLog.length > AUDIT_CAP) p.auditLog.length = AUDIT_CAP;
  if (base.feed.length > FEED_CAP) base.feed.length = FEED_CAP;
  return base;
}

/* ────────────────────────────── delta persistence ────────────────────────────── */

/**
 * Baseline = the seed-derived collections as built at load (already re-anchored). Persistence
 * stores only the difference between the live state and this baseline, so reference data and
 * unchanged seed items never reach localStorage and the seed stays the source of truth.
 */
let baseline = null;

function indexById(list) {
  const map = new Map();
  for (const item of objectItems(list)) {
    const id = String(item.id);
    if (!map.has(id)) map.set(id, clone(item));
  }
  return map;
}

function captureBaseline(fresh) {
  baseline = { data: {}, platform: {}, validation: {} };
  for (const k of PERSIST_COLLECTIONS) baseline.data[k] = indexById(fresh[k]);
  const p = isPlainObject(fresh.platform) ? fresh.platform : {};
  for (const k of PERSIST_PLATFORM_COLLECTIONS) baseline.platform[k] = indexById(p[k]);
  const v = isPlainObject(p.validation) ? p.validation : {};
  for (const k of PERSIST_VALIDATION_KEYS) baseline.validation[k] = indexById(v[k]);
}

/**
 * Delta of `list` against a baseline index → {a: added items, p: {id: changed fields}, r: removed ids}
 * or null when nothing differs. `fields` limits which changes of seed items are recorded.
 */
export function diffCollection(list, base, fields) {
  const added = [];
  const patched = {};
  const seen = new Set();
  for (const item of objectItems(list)) {
    const id = String(item.id);
    if (seen.has(id)) continue;
    seen.add(id);
    const ref = base ? base.get(id) : undefined;
    if (!ref) {
      added.push(item);
      continue;
    }
    const keys = Array.isArray(fields) ? fields : Array.from(new Set([...Object.keys(ref), ...Object.keys(item)]));
    let patch = null;
    for (const key of keys) {
      if (isUnsafeKey(key) || key === 'id') continue;
      if (sameJSON(item[key], ref[key])) continue;
      if (!patch) patch = {};
      patch[key] = item[key] === undefined ? null : item[key];
    }
    if (patch) patched[id] = patch;
  }
  const removed = base ? Array.from(base.keys()).filter((id) => !seen.has(id)) : [];
  const out = {};
  if (added.length) out.a = added;
  if (Object.keys(patched).length) out.p = patched;
  if (removed.length) out.r = removed;
  return Object.keys(out).length ? out : null;
}

/** Apply a delta to a seed-derived list: removals, field patches, then added items in front. */
export function applyDelta(list, delta) {
  const base = objectItems(list);
  if (!isPlainObject(delta)) return base;
  const removed = new Set(Array.isArray(delta.r) ? delta.r.map(String) : []);
  const patches = isPlainObject(delta.p) ? delta.p : {};
  const kept = base.filter((item) => !removed.has(String(item.id)));
  for (const item of kept) {
    const patch = patches[String(item.id)];
    if (isPlainObject(patch)) safeAssign(item, patch);
  }
  const ids = new Set(kept.map((it) => String(it.id)));
  const added = objectItems(delta.a).filter((it) => !ids.has(String(it.id)));
  return [...added, ...kept];
}

/** The objects a delta carries (added items + patch objects) — re-anchored in place on load. */
function deltaCarriers(delta) {
  if (!isPlainObject(delta)) return [];
  const patches = isPlainObject(delta.p) ? Object.values(delta.p).filter(isPlainObject) : [];
  return [...objectItems(delta.a), ...patches];
}

function isDeltaSnapshot(snapshot) {
  return isPlainObject(snapshot) && isPlainObject(snapshot.meta) && snapshot.meta.format === PERSIST_FORMAT;
}

/** What gets written to localStorage (also exposed as store.persistPayload() for tests/diagnostics). */
export function buildPersistPayload(st, nowDate = new Date()) {
  const data = {};
  for (const k of PERSIST_COLLECTIONS) {
    const d = diffCollection(st[k], baseline && baseline.data[k], PERSIST_FIELDS[k]);
    if (d) data[k] = d;
  }
  const platformOut = {};
  const p = isPlainObject(st.platform) ? st.platform : {};
  for (const k of PERSIST_PLATFORM_COLLECTIONS) {
    const d = diffCollection(p[k], baseline && baseline.platform[k], PERSIST_FIELDS[k]);
    if (d) platformOut[k] = d;
  }
  const validation = {};
  const v = isPlainObject(p.validation) ? p.validation : {};
  for (const k of PERSIST_VALIDATION_KEYS) {
    const d = diffCollection(v[k], baseline && baseline.validation[k], PERSIST_FIELDS[k]);
    if (d) validation[k] = d;
  }
  if (Object.keys(validation).length) platformOut.validation = validation;
  const filters = {};
  for (const [k, val] of Object.entries(isPlainObject(st.filters) ? st.filters : {})) {
    if (k !== 'search' && !isUnsafeKey(k)) filters[k] = val;
  }
  const savedAt = localISO(nowDate);
  return {
    meta: {
      version: STATE_VERSION,
      format: PERSIST_FORMAT,
      savedAt,
      anchorDate: isPlainObject(st.meta) && typeof st.meta.anchorDate === 'string' ? st.meta.anchorDate : todayISO(nowDate),
      // instants are anchored at the save instant: everything in the state happened before it.
      anchorNow: savedAt,
    },
    settings: st.settings,
    filters,
    feed: objectItems(st.feed).slice(0, PERSIST_FEED_CAP),
    data,
    platform: platformOut,
  };
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

/**
 * Seed → state anchored at `nowDate` (calendar dates by whole days, instants by the exact ms
 * delta from the seed's authoring instant, past-only instants clamped). Exported for tests.
 */
export function buildFreshState(nowDate = new Date()) {
  const base = clone(seed);
  base.feed = [];
  base.platform = normalizePlatform(platformSeed);
  base.settings = clone(DEFAULT_SETTINGS);
  base.filters = { ...DEFAULT_FILTERS };
  base.meta = {
    version: STATE_VERSION,
    savedAt: null,
    anchorDate: SEED_ANCHOR_DATE,
    anchorNow: SEED_ANCHOR_NOW,
  };
  reanchor(base, nowDate, { instants: true });
  backfillAlertCodes(base.platform.alerts);
  normalizeState(base); // idempotent for a valid seed; keeps the baseline identical to a normalised load
  return base;
}

/** Final load pass shared by every path: normalise, cap, and clamp every past-only instant to now. */
function finishLoad(base, nowDate) {
  normalizeState(base);
  base.meta.version = STATE_VERSION;
  // A save made "later" than this load (clock moved back, imported file) never shows a future time.
  if (typeof base.meta.savedAt === 'string') base.meta.savedAt = clampInstant(base.meta.savedAt, nowDate);
  base.meta.anchorDate = todayISO(nowDate);
  reanchor(base, nowDate, { instants: false }); // day delta is 0 here → pure clamp pass
  clampDiagnostics(base, nowDate); // real-test diagnostics are never re-anchored, only kept in the past
  return base;
}

/**
 * Overlay a LEGACY full snapshot (or a JSON export of store.state) onto a fresh seed-derived
 * state: saved mutable collections win, reference data comes from the seed. Exported for tests.
 */
export function overlaySnapshot(base, snapshot, nowDate = new Date()) {
  const saved = clone(snapshot);
  if (!isPlainObject(saved.meta)) saved.meta = {};
  if (typeof saved.meta.anchorDate !== 'string') saved.meta.anchorDate = SEED_ANCHOR_DATE;
  reanchor(saved, nowDate);
  for (const key of MUTABLE_COLLECTIONS) {
    if (Array.isArray(saved[key])) base[key] = saved[key];
  }
  if (isPlainObject(saved.platform)) base.platform = mergePlatform(base.platform, saved.platform);
  if (isPlainObject(saved.settings)) base.settings = saved.settings;
  if (isPlainObject(saved.filters)) base.filters = saved.filters;
  base.meta.savedAt = typeof saved.meta.savedAt === 'string' ? saved.meta.savedAt : null;
  return finishLoad(base, nowDate);
}

/**
 * Restore a DELTA snapshot (the persisted format): re-anchor the carried objects from the save
 * instant to now, then apply removals / patches / additions over the fresh seed-derived state.
 * Exported for tests.
 */
export function restoreSnapshot(base, snapshot, nowDate = new Date()) {
  const snap = clone(snapshot);
  const meta = isPlainObject(snap.meta) ? snap.meta : {};
  const data = isPlainObject(snap.data) ? snap.data : {};
  const platformDelta = isPlainObject(snap.platform) ? snap.platform : {};
  const validationDelta = isPlainObject(platformDelta.validation) ? platformDelta.validation : {};

  // Carrier state: every object the delta carries, so reanchor() can shift their dates in place.
  const carrier = {
    meta: { anchorDate: typeof meta.anchorDate === 'string' ? meta.anchorDate : SEED_ANCHOR_DATE, anchorNow: meta.anchorNow || meta.savedAt },
    feed: objectItems(snap.feed),
    platform: { validation: {} },
  };
  for (const k of PERSIST_COLLECTIONS) carrier[k] = deltaCarriers(data[k]);
  for (const k of PERSIST_PLATFORM_COLLECTIONS) carrier.platform[k] = deltaCarriers(platformDelta[k]);
  for (const k of PERSIST_VALIDATION_KEYS) carrier.platform.validation[k] = deltaCarriers(validationDelta[k]);
  reanchor(carrier, nowDate);

  for (const k of PERSIST_COLLECTIONS) base[k] = applyDelta(base[k], data[k]);
  const p = base.platform;
  for (const k of PERSIST_PLATFORM_COLLECTIONS) p[k] = applyDelta(p[k], platformDelta[k]);
  if (!isPlainObject(p.validation)) p.validation = emptyPlatform().validation;
  for (const k of PERSIST_VALIDATION_KEYS) p.validation[k] = applyDelta(p.validation[k], validationDelta[k]);
  base.feed = carrier.feed.slice(0, FEED_CAP);
  if (isPlainObject(snap.settings)) base.settings = snap.settings;
  if (isPlainObject(snap.filters)) base.filters = { ...snap.filters, search: '' };
  base.meta.savedAt = typeof meta.savedAt === 'string' ? meta.savedAt : null;
  return finishLoad(base, nowDate);
}

/** Load a saved snapshot of either format over a fresh state. */
function loadSnapshot(base, snapshot, nowDate) {
  return isDeltaSnapshot(snapshot) ? restoreSnapshot(base, snapshot, nowDate) : overlaySnapshot(base, snapshot, nowDate);
}

function createInitialState() {
  const now = new Date();
  const fresh = buildFreshState(now);
  captureBaseline(fresh);
  const saved = readSaved();
  if (!saved) return finishLoad(fresh, now);
  try {
    return loadSnapshot(fresh, saved, now);
  } catch (error) {
    console.warn('[biltix] تعذر استعادة الحالة المحفوظة — تم البدء من البيانات الافتراضية.', error && error.message ? error.message : error);
    const again = buildFreshState(now);
    captureBaseline(again);
    return finishLoad(again, now);
  }
}

const state = createInitialState();

/* ────────────────────────────── persistence ────────────────────────────── */

let persistTimer = null;
let flushHookInstalled = false;
let dirtySince = 0;     // epoch ms of the first unsaved non-feed change (max-wait anchor)
let dirty = false;      // non-feed changes waiting to be written
let feedDirty = false;  // feed-only changes (ride along with the next write / pagehide)
let quotaReported = false;

function isQuotaError(error) {
  const name = error && error.name;
  const code = error && error.code;
  return name === 'QuotaExceededError' || name === 'NS_ERROR_DOM_QUOTA_REACHED' || code === 22 || code === 1014;
}

function persistNow() {
  if (persistTimer) {
    clearTimeout(persistTimer);
    persistTimer = null;
  }
  if (!storage) return false;
  try {
    const payload = buildPersistPayload(state, new Date());
    storage.setItem(STORAGE_KEY, JSON.stringify(payload));
    state.meta.savedAt = payload.meta.savedAt;
    dirty = false;
    feedDirty = false;
    return true;
  } catch (error) {
    if (isQuotaError(error) && !quotaReported) {
      quotaReported = true;
      bus.emit('alert', {
        severity: 'warning', tone: 'warning', source: 'storage',
        title: 'تعذر حفظ البيانات محلياً',
        detail: 'امتلأت مساحة التخزين المحلية في المتصفح؛ ستبقى التغييرات في هذه الجلسة فقط حتى يتوفر مكان.',
      });
    }
    return false;
  }
}

function installFlushHook() {
  if (flushHookInstalled || typeof window === 'undefined' || typeof window.addEventListener !== 'function') return;
  flushHookInstalled = true;
  const flushIfPending = () => { if (dirty || feedDirty || persistTimer) persistNow(); };
  window.addEventListener('pagehide', flushIfPending);
  // Mobile browsers may kill a backgrounded tab without pagehide: flush when it is hidden.
  if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flushIfPending(); });
  }
}

/** Debounced write (≥ 2 s). Feed-only changes never start the timer on their own. */
function schedulePersist(path = '*') {
  if (!storage) return;
  installFlushHook();
  if (path === 'feed') {
    feedDirty = true;
    return;
  }
  const now = Date.now();
  if (!dirty || !persistTimer) dirtySince = now;
  dirty = true;
  if (persistTimer) clearTimeout(persistTimer);
  // Trailing debounce (>= 2 s after the last change) capped by a max-wait so a steady stream of
  // live updates still reaches storage every PERSIST_MAX_WAIT_MS.
  const wait = Math.max(0, Math.min(PERSIST_DEBOUNCE_MS, PERSIST_MAX_WAIT_MS - (now - dirtySince)));
  persistTimer = setTimeout(persistNow, wait);
}

function changed(path) {
  schedulePersist(path);
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
  if (keys.length === 0 || keys.some(isUnsafeKey)) return false;
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
    if (value === undefined || key === 'id' || isUnsafeKey(key)) continue;
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
      doneAt: a.done ? (typeof a.doneAt === 'string' && a.doneAt ? a.doneAt : new Date(nowDate).toISOString()) : null,
      ...(typeof a.textEn === 'string' && a.textEn.trim() ? { textEn: a.textEn.trim() } : {}),
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
    if (value === undefined || k === 'id' || isUnsafeKey(k)) continue;
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

/**
 * Append an AI-risk history entry. `fields` adds structured, language-neutral data (kind, statusFrom/statusTo,
 * from/to, owner, due) so a view can word the entry from its dictionaries in either language.
 */
function riskHistory(risk, by, textValue, textEn, fields = null) {
  if (!Array.isArray(risk.history)) risk.history = [];
  const entry = { at: localISO(store.now()), by: text(by) || SYSTEM_ACTOR, text: textValue };
  if (textEn) entry.textEn = textEn;
  if (isPlainObject(fields)) {
    for (const [k, v] of Object.entries(fields)) {
      if (isUnsafeKey(k) || k in entry || v === undefined || v === null || v === '') continue;
      entry[k] = v;
    }
  }
  risk.history.push(entry);
}

/** The risk drawer's assignment note (risk.hist.assignedNote, Arabic wording) → owner + due date. */
const ASSIGN_NOTE_RE = /^إسناد المخاطرة إلى (.+) — الاستحقاق (\d{4}-\d{2}-\d{2})$/;

/**
 * English side of an `updateAiRisk` note: the caller's `noteEn` when it has no Arabic; the drawer's assignment
 * note rebuilt from its parts (owner via the people dictionary when loaded, else a neutral phrase — never the
 * Arabic name); otherwise a user-typed note is copied as typed (no machine translation).
 */
function noteHistoryEn(note, noteEn) {
  const given = latinOnly(noteEn);
  const m = ASSIGN_NOTE_RE.exec(note);
  if (m) {
    const owner = m[1].trim();
    return {
      textEn: given || `Risk assigned to ${personEn(owner, 'a new owner')} — due ${m[2]}`,
      fields: { kind: 'assign', owner, due: m[2] },
    };
  }
  return { textEn: given || note, fields: { kind: 'note' } };
}

/** " (was Open)" for an AI-risk status when its English label is loaded; '' otherwise (never an empty "(was )"). */
function wasStatusEn(prev) {
  const en = enumEn('aiRiskStatus', prev);
  return en ? ` (was ${en})` : '';
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

/** Simulated write-back to BILTIX PM: pending → synced after 1.5 s, with feed + audit entries. */
function scheduleWriteback(taskId) {
  const enabled = getPath(state, 'settings.platform.writebackEnabled') !== false;
  if (!enabled || typeof setTimeout !== 'function') return;
  const timer = setTimeout(() => {
    writebackTimers.delete(timer);
    const task = findPlatform('tasks', taskId);
    if (!task || !isPlainObject(task.writeback) || task.writeback.status !== 'pending') return;
    // Demo build: there is no BILTIX PM endpoint, so the write-back is SIMULATED and labelled as such
    // (CONTRACT §5 — never claim an operation that did not happen). `simulated: true` travels with it.
    task.writeback.status = 'synced';
    task.writeback.at = localISO(store.now());
    task.writeback.target = task.writeback.target || 'BILTIX PM';
    task.writeback.simulated = true;
    changed(`platform.tasks.${task.id}`);
    store.pushAudit({
      actor: SYSTEM_ACTOR, action: 'writeback', target: task.code,
      detail: `محاكاة الكتابة العكسية إلى ${task.writeback.target}: علم المخاطرة والدرجة ومهمة المعالجة ${task.code} (لم يُرسل شيء إلى نظام خارجي)`,
      detailEn: `Simulated write-back to BILTIX PM: risk flag, score and mitigation task ${task.code} (nothing was sent to an external system)`,
    });
    emitFeed({
      type: 'writeback', tone: 'accent', siteId: task.projectId, simulated: true,
      title: `محاكاة: كتابة عكسية إلى ${task.writeback.target} — ${task.code}`,
      titleEn: `Simulated: write-back to BILTIX PM — ${task.code}`,
      detail: [task.title, projectName(task.projectId)].filter(Boolean).join(' · '),
      detailEn: [task.titleEn || '', siteEnById(state.sites, task.projectId)].filter(Boolean).join(' · '),
      sourceId: 'biltix-pm', refId: task.id, code: task.code,
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
      ? { target: 'BILTIX PM', status: 'pending', at: null, ...obj.writeback }
      : { target: 'BILTIX PM', status: 'pending', at: null },
    priority: obj.priority == null || obj.priority === '' ? null : pickEnum(obj.priority, TASK_PRIORITIES, null),
    attachments: [],
    createdAt: localISO(now),
    closedAt: null,
    outcome: text(obj.outcome),
  };
  if (typeof obj.titleEn === 'string' && obj.titleEn.trim()) task.titleEn = obj.titleEn.trim();
  tasks.unshift(task);
  if (risk) {
    risk.taskId = task.id;
    if (!text(risk.owner)) risk.owner = task.owner;
    if (!risk.dueDate) risk.dueDate = task.dueDate;
    if (['مكتشف', 'تنبيه'].includes(risk.status)) risk.status = 'مهمة مُسندة';
    // v3: the linked task IS the treatment plan (treatment.taskId lets the UI localise it via the tasks namespace).
    risk.treatment = normalizeTreatment({ ...(isPlainObject(risk.treatment) ? risk.treatment : {}), plan: task.title, taskId: task.id }, risk.id);
    risk.updatedAt = localISO(now);
  }
  changed(`platform.tasks.${task.id}`);
  if (!silent) {
    emitFeed({
      type: 'task', tone: 'accent', siteId: task.projectId,
      title: `مهمة معالجة جديدة ${task.code}${risk ? ` — ${risk.code}` : ''}`,
      titleEn: `New mitigation task ${task.code}${risk ? ` — ${risk.code}` : ''}`,
      detail: [task.title, `المسؤول: ${task.owner}`].filter(Boolean).join(' · '),
      detailEn: [task.titleEn || '', `Owner: ${personEn(task.owner, 'assigned')}`].filter(Boolean).join(' · '),
      sourceId: 'biltix-pm', refId: task.id, code: task.code,
    });
  }
  if (task.writeback.status === 'pending') scheduleWriteback(task.id);
  return task;
}

/* ────────────────────────────── v3: AI-risk input validation ────────────────────────────── */

const ISO_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})/;

function validDateOnly(value) {
  const m = ISO_DATE_RE.exec(String(value || ''));
  if (!m) return null;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return d.getUTCMonth() === +m[2] - 1 ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

function fieldError(field, code, message, messageEn) {
  return { field, code, message, messageEn };
}

/** See store.validateAiRisk. Pure apart from reading the site list and the clock. */
export function validateAiRiskInput(obj = {}, { mode = 'manual', now } = {}) {
  const src = isPlainObject(obj) ? obj : {};
  const errors = [];
  const manual = mode !== 'engine';
  if (!text(src.title)) errors.push(fieldError('title', 'required', 'العنوان مطلوب.', 'A title is required.'));
  const projectId = text(src.projectId) || text(src.siteId);
  const sites = objectItems(state && state.sites).map((s) => String(s.id));
  if (!projectId) errors.push(fieldError('projectId', 'required', 'اختر المشروع.', 'Select a project.'));
  else if (sites.length && !sites.includes(projectId)) errors.push(fieldError('projectId', 'unknown', 'المشروع غير معروف.', 'Unknown project.'));
  if (!AI_CATEGORIES.includes(src.category)) errors.push(fieldError('category', 'required', 'اختر المجال.', 'Select a domain.'));
  if (manual && !AI_TYPES.includes(src.type)) errors.push(fieldError('type', 'required', 'اختر نوع المخاطرة.', 'Select a risk type.'));
  else if (!manual && src.type != null && !AI_TYPES.includes(src.type)) errors.push(fieldError('type', 'invalid', 'نوع المخاطرة غير صالح.', 'Invalid risk type.'));
  if (src.likelihood == null || src.likelihood === '') errors.push(fieldError('likelihood', 'required', 'الاحتمالية مطلوبة (1–5).', 'Likelihood is required (1–5).'));
  else if (!scale5(src.likelihood)) errors.push(fieldError('likelihood', 'range', 'الاحتمالية عدد صحيح من 1 إلى 5.', 'Likelihood must be a whole number from 1 to 5.'));
  if (src.impact == null || src.impact === '') errors.push(fieldError('impact', 'required', 'الأثر مطلوب (1–5).', 'Impact is required (1–5).'));
  else if (!scale5(src.impact)) errors.push(fieldError('impact', 'range', 'الأثر عدد صحيح من 1 إلى 5.', 'Impact must be a whole number from 1 to 5.'));
  if (manual && !text(src.owner)) errors.push(fieldError('owner', 'required', 'حدّد المسؤول عن المخاطرة.', 'Assign an owner.'));
  const due = src.dueDate == null || src.dueDate === '' ? null : validDateOnly(src.dueDate);
  if (manual && (src.dueDate == null || src.dueDate === '')) errors.push(fieldError('dueDate', 'required', 'حدّد تاريخ الاستحقاق.', 'Set a due date.'));
  else if (src.dueDate != null && src.dueDate !== '' && !due) errors.push(fieldError('dueDate', 'invalid', 'تاريخ الاستحقاق غير صالح.', 'Invalid due date.'));
  else if (manual && due && due < todayISO(now || store.now())) errors.push(fieldError('dueDate', 'past', 'تاريخ الاستحقاق في الماضي.', 'The due date is in the past.'));
  const link = isPlainObject(src.evidence) ? src.evidence.link : src.evidenceUrl;
  if (link != null && link !== '' && !/^https?:\/\/[^\s]+$/i.test(String(link).trim()) && !/^biltix:\/\//i.test(String(link))) {
    errors.push(fieldError('evidence', 'url', 'رابط الدليل يجب أن يبدأ بـ https:// أو http://.', 'The evidence link must start with https:// or http://.'));
  }
  return { ok: errors.length === 0, errors };
}

/** Evidence / attachment metadata check: link (http/https), note (text), file (name + size ≤ 25 MB; content never stored). */
const ATTACHMENT_MAX_BYTES = 25 * 1024 * 1024;
function validateAttachment(input) {
  const a = isPlainObject(input) ? input : {};
  const errors = [];
  const kind = EVIDENCE_KINDS.includes(a.kind) ? a.kind : null;
  if (!kind) errors.push(fieldError('kind', 'required', 'اختر نوع الدليل (رابط، ملاحظة، ملف).', 'Choose the evidence type (link, note, file).'));
  const title = text(a.title).slice(0, 300);
  if (!title) errors.push(fieldError('title', 'required', 'العنوان مطلوب.', 'A title is required.'));
  const item = { kind, title, url: null };
  if (kind === 'link') {
    const url = text(a.url);
    if (!/^https?:\/\/[^\s]+$/i.test(url)) errors.push(fieldError('url', 'url', 'الرابط يجب أن يبدأ بـ https:// أو http://.', 'The link must start with https:// or http://.'));
    else item.url = url.slice(0, 2048);
  }
  if (kind === 'note') {
    const note = text(a.note || a.text).slice(0, 2000);
    if (!note) errors.push(fieldError('note', 'required', 'اكتب نص الملاحظة.', 'Write the note.'));
    else item.note = note;
  }
  if (kind === 'file') {
    const fileName = text(a.fileName || a.name).slice(0, 255);
    const size = Number(a.size);
    if (!fileName) errors.push(fieldError('fileName', 'required', 'اختر ملفاً.', 'Choose a file.'));
    if (Number.isFinite(size) && size > ATTACHMENT_MAX_BYTES) errors.push(fieldError('size', 'too-large', 'حجم الملف يتجاوز 25 ميجابايت.', 'The file is larger than 25 MB.'));
    item.fileName = fileName;
    if (Number.isFinite(size) && size >= 0) item.size = Math.round(size);
    if (text(a.mime || a.type)) item.mime = text(a.mime || a.type).slice(0, 120);
  }
  if (text(a.titleEn)) item.titleEn = text(a.titleEn).slice(0, 300);
  if (errors.length) return fail('validation', 'تعذّر حفظ الدليل — راجع الحقول.', 'The evidence was not saved — check the fields.', { errors });
  return { ok: true, item };
}

/** Shared closing step (closeAiRisk and a task closure on an assessed risk). */
function closeRiskInternal(risk, { outcome, outcomeEn = '', actor, viaTask = null } = {}) {
  const now = localISO(store.now());
  risk.status = 'مغلق';
  risk.closedAt = now;
  risk.outcome = outcome;
  risk.outcomeEn = outcomeEn || null;
  if (viaTask) risk.closedByTask = viaTask.id;
  risk.updatedAt = now;
  for (const t of platformList('tasks')) {
    if (!t || t === viaTask || (t.riskId !== risk.id && t.id !== risk.taskId) || t.status === 'مغلقة') continue;
    t.status = 'مغلقة';
    t.closedAt = now;
    t.outcome = t.outcome || outcome;
    t.updatedAt = now;
    changed(`platform.tasks.${t.id}`);
  }
  const residual = risk.residualLikelihood * risk.residualImpact * 4;
  riskHistory(risk, actor, `إغلاق المخاطرة — النتيجة: ${outcome} (المتبقية ${residual} مقابل ${risk.score})`, `Risk closed — residual ${residual} vs inherent ${risk.score}; outcome recorded`);
  changed(`platform.aiRisks.${risk.id}`);
  if (!viaTask) {
    store.pushAudit({ actor, action: 'close', target: risk.code, detail: `إغلاق المخاطرة — النتيجة: ${outcome} (المتبقية ${residual}/${risk.score})`, detailEn: `Risk closed — residual ${residual}/${risk.score}; outcome recorded (feedback for model recalibration)` });
  }
  emitFeed({ type: 'ai', tone: 'good', siteId: risk.projectId, title: `إغلاق المخاطرة ${risk.code} بعد تقييم المخاطر المتبقية`, titleEn: `Risk ${risk.code} closed after its residual assessment`, detail: outcome, detailEn: outcomeEn || `Residual score ${residual} (inherent ${risk.score})`, sourceId: risk.pipeline, refId: risk.id, code: risk.code });
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
    const now = store.now();
    const fresh = buildFreshState(now);
    captureBaseline(fresh);
    finishLoad(fresh, now);
    for (const key of Object.keys(state)) delete state[key];
    Object.assign(state, fresh);
    dirty = false;
    feedDirty = false;
    bus.emit('store:change', { path: '*' });
    bus.emit('filters:change', { filters: state.filters });
    bus.emit('settings:change', { settings: state.settings });
    bus.emit('theme:change', { theme: state.settings.theme });
    return state;
  },

  /**
   * Replace the mutable part of the state from an exported JSON snapshot (settings view →
   * "استيراد JSON"); both a full export of store.state and the persisted delta format are
   * accepted and normalised. Returns true when the snapshot was accepted.
   */
  importState(snapshot) {
    if (!isPlainObject(snapshot)) return false;
    const hasData = isDeltaSnapshot(snapshot)
      || MUTABLE_COLLECTIONS.some((key) => Array.isArray(snapshot[key]))
      || isPlainObject(snapshot.settings) || isPlainObject(snapshot.platform);
    if (!hasData) return false;
    const now = store.now();
    clearWritebackTimers();
    let fresh;
    try {
      const base = buildFreshState(now);
      captureBaseline(base);
      fresh = loadSnapshot(base, snapshot, now);
    } catch (error) {
      console.warn('[biltix] تعذر استيراد الملف — بنية غير صالحة.', error && error.message ? error.message : error);
      return false;
    }
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

  /** The exact object that persistence writes (mutable deltas + settings + filters + last feed events). */
  persistPayload() {
    return buildPersistPayload(state, store.now());
  },

  /** True when there are unsaved changes (feed-only changes count only for `includeFeed`). */
  isDirty({ includeFeed = false } = {}) {
    return dirty || (includeFeed && feedDirty);
  },

  /* ── CRUD: risks ── */

  /** Add an HSE risk. `{ silent: true }` skips the per-risk feed event (bulk import emits one summary). */
  addRisk(obj = {}, { silent = false } = {}) {
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
    if (silent) return risk;
    const tier = sel.riskTier(sel.riskScore(risk));
    emitFeed({
      type: 'risk',
      tone: sel.tierTone(tier),
      siteId: risk.siteId,
      title: `تسجيل مخاطرة جديدة ${risk.code} — ${tier}`,
      titleEn: `New risk registered ${risk.code} — ${enumEn('tier', tier)}`,
      detail: risk.hazard || risk.activity,
      detailEn: risk.hazardEn || `${siteEnById(state.sites, risk.siteId)}`,
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
      // Structured from/to so any view can label the change in the active language (English enums load lazily,
      // so a pre-rendered English sentence written during an Arabic session could carry Arabic status names).
      risk.history.push({ at, by: text(by) || risk.owner || 'النظام', kind: 'status', statusFrom: prevStatus, statusTo: rest.status, text: `تغيير الحالة من «${prevStatus}» إلى «${rest.status}»` });
    }
    if (typeof note === 'string' && note.trim()) {
      // A user-typed note is shown as written in both languages (no machine translation).
      risk.history.push({ at, by: text(by) || risk.owner || 'النظام', text: note.trim(), textEn: note.trim() });
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
      titleEn: `${enumEn('incidentType', type, 'Incident')} — ${incident.code}`,
      detail: [incident.title, incident.location].filter(Boolean).join(' · '),
      detailEn: [incident.titleEn || '', siteEnById(state.sites, incident.siteId)].filter(Boolean).join(' · '),
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
      titleEn: `New permit to work ${permit.code} — ${enumEn('permitType', permit.type, 'permit')}`,
      detail: [siteName(permit.siteId), permit.location].filter(Boolean).join(' · '),
      detailEn: [siteEnById(state.sites, permit.siteId), permit.locationEn || ''].filter(Boolean).join(' · '),
      sourceId: 'biltix-hse',
      refId: permit.id,
    });
    return permit;
  },

  /** Patch a permit. A closed permit (مغلق) is final: any attempt to move it to another status returns null. */
  updatePermit(id, patch = {}) {
    const permit = findIn('permits', id);
    if (!permit || !isPlainObject(patch)) return null;
    const rest = { ...patch };
    if (rest.status !== undefined) rest.status = pickEnum(rest.status, PERMIT_STATUS, permit.status);
    if (permit.status === 'مغلق' && rest.status !== undefined && rest.status !== 'مغلق') return null;
    if (rest.status === 'مغلق' && permit.status !== 'مغلق' && !rest.closedAt) rest.closedAt = localISO(store.now());
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
    // v3 (CONTRACT §8): every generated event is bilingual; English copies are kept when given.
    if (typeof event.titleEn === 'string') ev.titleEn = event.titleEn.trim();
    if (typeof event.detailEn === 'string') ev.detailEn = event.detailEn.trim();
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
    // v3: invalid weights (sum ≠ 1 ± 0.001, negative, missing) or thresholds (critical < alert + 5) in a patch
    // are REJECTED, not reshaped: they are dropped from the patch, the current values stay, and
    // bus 'settings:invalid' { field, reason, message, messageEn } tells the UI why. (setWeights /
    // setThresholds return the same reason directly.)
    let input = patch;
    if (isPlainObject(patch.platform)) {
      const p = { ...patch.platform };
      if (p.weights !== undefined) {
        const w = validateWeights(p.weights);
        if (!w.ok) { delete p.weights; bus.emit('settings:invalid', { field: 'weights', ...w }); } else p.weights = w.weights;
      }
      if (p.alertThreshold !== undefined || p.criticalThreshold !== undefined) {
        const cur = state.settings.platform || {};
        const t = validateThresholds({
          alertThreshold: p.alertThreshold !== undefined ? p.alertThreshold : cur.alertThreshold,
          criticalThreshold: p.criticalThreshold !== undefined ? p.criticalThreshold : cur.criticalThreshold,
        });
        if (!t.ok) { delete p.alertThreshold; delete p.criticalThreshold; bus.emit('settings:invalid', { field: 'thresholds', ...t }); }
      }
      input = { ...patch, platform: p };
    }
    // Weights are replaced whole (never deep-merged key by key with stale values).
    const base = isPlainObject(input.platform) && input.platform.weights
      ? { ...state.settings, platform: { ...state.settings.platform, weights: {} } }
      : state.settings;
    // Unparsable numbers fall back to the CURRENT value (not the default); brand '' = theme tokens.
    const merged = sanitizeSettings(deepMerge(base, input), state.settings);
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
  /**
   * v3 input validation for a new AI risk (shared by the risk form and addAiRisk). No silent defaults:
   * likelihood and impact (integers 1–5) are always required; owner and due date are required for a
   * manually registered risk (`mode: 'manual'`, the default) and may be explicitly empty (unassigned)
   * only for an engine detection (`mode: 'engine'`). Returns { ok, errors:[{ field, code, message, messageEn }] }.
   */
  validateAiRisk(obj = {}, { mode = 'manual' } = {}) {
    return validateAiRiskInput(obj, { mode });
  },

  /**
   * Register an AI risk — an engine detection (`{ engine: true }` or `obj.simulated === true`) or a
   * manual entry (default). Validates first (see validateAiRisk): on failure NOTHING is stored and
   * `{ ok:false, reason:'validation', errors, message, messageEn }` is returned. On success returns the
   * stored risk: score = likelihood × impact × 4, input-data quality derived from the validation layer of
   * its source system, empty treatment, residual not assessed; thresholds applied (autoAlert); audited
   * ('create') for manual entries; bilingual feed event.
   */
  addAiRisk(obj = {}, { autoAlert = true, by = '', engine } = {}) {
    const src = isPlainObject(obj) ? obj : {};
    const isEngine = engine === true || (engine !== false && src.simulated === true);
    const check = validateAiRiskInput(src, { mode: isEngine ? 'engine' : 'manual' });
    if (!check.ok) {
      return { ok: false, reason: 'validation', errors: check.errors, message: 'تعذّر تسجيل المخاطرة — راجع الحقول المطلوبة.', messageEn: 'The risk was not registered — check the required fields.' };
    }
    const now = store.now();
    const list = platformList('aiRisks');
    const actor = text(by) || (isEngine ? AI_ENGINE_ACTOR : 'مدير المشروع');
    const category = src.category;
    const pipeline = pickEnum(src.pipeline, AI_PIPELINES, CATEGORY_PIPELINE[category]);
    const likelihood = scale5(src.likelihood);
    const impact = scale5(src.impact);
    const score = likelihood * impact * 4;
    const rec = isPlainObject(src.recommendation) ? src.recommendation : {};
    let evidence = isPlainObject(src.evidence) ? { ...src.evidence } : null;
    if (!evidence && (text(src.evidenceUrl) || text(src.source))) {
      // Manual form: "source" (system or document) + optional evidence link become the source evidence.
      evidence = { kind: 'link', ref: text(src.evidenceUrl) || text(src.source), excerpt: '', sourceSystem: text(src.source) || 'إدخال يدوي', link: text(src.evidenceUrl) || null };
    }
    if (evidence && evidence.link != null && !/^https?:\/\//i.test(String(evidence.link)) && !/^biltix:\/\//i.test(String(evidence.link))) delete evidence.link;
    const validation = platform().validation;
    const dataQuality = typeof deriveDataQuality === 'function'
      ? deriveDataQuality(validation, evidence && evidence.sourceSystem, evidence && evidence.kind)
      : null;
    const risk = {
      ...src,
      id: nextId(list, 'AIR'),
      code: text(src.code) || nextPlatformCode(list, 'AIR', 1000),
      projectId: text(src.projectId) || text(src.siteId),
      category,
      type: pickEnum(src.type, AI_TYPES, CATEGORY_TYPE[category]),
      likelihood,
      impact,
      score,
      residualLikelihood: null,
      residualImpact: null,
      residualAssessment: null,
      title: text(src.title),
      description: text(src.description),
      driverExplanation: text(src.driverExplanation),
      evidence,
      recommendation: {
        ...rec,
        action: text(rec.action), rationale: text(rec.rationale),
        effort: pickEnum(rec.effort, ['منخفض', 'متوسط', 'عالٍ'], 'متوسط'),
        impact: text(rec.impact), alternatives: Array.isArray(rec.alternatives) ? rec.alternatives.slice(0, 2) : [],
      },
      pipeline,
      origin: isEngine ? 'engine' : 'manual',
      modelVersion: isEngine ? (text(src.modelVersion) || null) : null,
      // Model confidence exists only for engine output; a human-registered risk has none (not 0, not a default).
      confidence: isEngine ? clampNum(src.confidence, 0, 1, null) : null,
      dataQuality,
      treatment: normalizeTreatment({ plan: null, evidence: [] }, null),
      detectedAt: typeof src.detectedAt === 'string' && src.detectedAt ? clampInstant(src.detectedAt, now) : localISO(now),
      updatedAt: localISO(now),
      status: pickEnum(src.status, ['مكتشف', 'تنبيه'], 'مكتشف'),
      owner: text(src.owner) || null,
      dueDate: typeof src.dueDate === 'string' && src.dueDate ? src.dueDate.slice(0, 10) : null,
      taskId: null,
      escalated: false,
      stakeholders: Array.isArray(src.stakeholders) && src.stakeholders.length ? src.stakeholders.map((s) => text(s)).filter(Boolean) : ['PM'],
      responseParams: isPlainObject(src.responseParams) ? src.responseParams : {},
      overrides: [],
      history: [{
        at: localISO(now), by: actor,
        text: isEngine
          ? `اكتشاف المخاطرة بواسطة ${pipelineLabel(pipeline)} — الدرجة ${score} (الاحتمالية ${likelihood} × الأثر ${impact} × 4)`
          : `تسجيل المخاطرة يدوياً — الدرجة ${score} (الاحتمالية ${likelihood} × الأثر ${impact} × 4)`,
        textEn: isEngine
          ? `Detected by ${enumEn('pipeline', pipeline)} — score ${score} (likelihood ${likelihood} × impact ${impact} × 4)`
          : `Registered manually — score ${score} (likelihood ${likelihood} × impact ${impact} × 4)`,
      }],
    };
    delete risk.siteId;
    if (risk.treatment) risk.treatment.taskId = null;
    list.unshift(risk);
    changed(`platform.aiRisks.${risk.id}`);
    if (!isEngine) {
      store.pushAudit({ actor, action: 'create', target: risk.code, detail: `تسجيل مخاطرة يدوياً — الدرجة ${score} (${likelihood}×${impact}×4)، المسؤول ${risk.owner || '—'}، الاستحقاق ${risk.dueDate || '—'}`, detailEn: `Risk registered manually — score ${score} (${likelihood}×${impact}×4), owner ${personEn(risk.owner, 'assigned')}, due ${risk.dueDate || '—'}` });
    }

    const rating = ratingOf(score);
    const titleEn = text(risk.titleEn) || latinOnly(risk.title);
    emitFeed({
      type: 'ai', tone: RATING_TONE[rating], siteId: risk.projectId, simulated: isEngine || undefined,
      title: isEngine
        ? `${pipelineLabel(pipeline)} (محاكاة): ${risk.title} — الدرجة ${score} (${RATING_LABEL[rating]})`
        : `تسجيل مخاطرة يدوياً ${risk.code}: ${risk.title} — الدرجة ${score} (${RATING_LABEL[rating]})`,
      titleEn: isEngine
        ? `${enumEn('pipeline', pipeline)} (simulated): ${titleEn || risk.code} — score ${score} (${enumEn('rating', rating)})`
        : `Risk registered manually ${risk.code}${titleEn ? `: ${titleEn}` : ''} — score ${score} (${enumEn('rating', rating)})`,
      detail: risk.driverExplanation || (risk.evidence && risk.evidence.excerpt) || projectName(risk.projectId),
      detailEn: text(risk.driverExplanationEn) || siteEnById(state.sites, risk.projectId),
      sourceId: pipeline, refId: risk.id, code: risk.code, score,
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
          titleEn: `${level === 'immediate' ? 'Immediate escalation' : 'Alert'}: ${risk.code}${titleEn ? ` — ${titleEn}` : ''}`,
          simulated: isEngine || undefined,
        });
      }
    }
    return risk;
  },

  /**
   * Patch an AI risk; `note`/`by` become a history entry (optional `noteEn`: the caller's English wording, kept only
   * when it has no Arabic); status validated against §B3. Every history entry written here carries `textEn`.
   */
  updateAiRisk(id, patch = {}) {
    const risk = findPlatform('aiRisks', id);
    if (!risk || !isPlainObject(patch)) return null;
    const { by, note, noteEn, ...rest } = patch;
    const prevStatus = risk.status;
    if (rest.status !== undefined) rest.status = pickEnum(rest.status, AI_RISK_STATUS, risk.status);
    // Terminal states are final: a closed / dismissed risk never changes status again (use reopenAiRisk).
    if (AI_RISK_TERMINAL.includes(prevStatus) && rest.status !== undefined && rest.status !== prevStatus) return null;
    // Closing goes through closeAiRisk (residual assessment + outcome required).
    if (rest.status === 'مغلق' && prevStatus !== 'مغلق') return null;
    // v3: the score is derived — likelihood/impact patches recompute it; a bare score patch is ignored.
    delete rest.score;
    for (const key of ['id', 'code', 'history', 'overrides', 'origin']) delete rest[key];
    if (rest.likelihood !== undefined || rest.impact !== undefined) {
      const l = rest.likelihood !== undefined ? scale5(rest.likelihood) : risk.likelihood;
      const im = rest.impact !== undefined ? scale5(rest.impact) : risk.impact;
      if (!l || !im) return null;
      if (l !== risk.likelihood || im !== risk.impact) {
        riskHistory(risk, by, `إعادة تقدير الشدة: ${risk.likelihood}×${risk.impact} ← ${l}×${im} (الدرجة ${l * im * 4})`,
          `Severity re-estimated: ${risk.likelihood}×${risk.impact} → ${l}×${im} (score ${l * im * 4})`,
          { kind: 'reassess', from: `${risk.likelihood}×${risk.impact}`, to: `${l}×${im}` });
      }
      rest.likelihood = l;
      rest.impact = im;
      rest.score = l * im * 4;
    }
    if (rest.residualLikelihood !== undefined || rest.residualImpact !== undefined) {
      const rl = rest.residualLikelihood !== undefined ? scale5(rest.residualLikelihood) : risk.residualLikelihood;
      const ri = rest.residualImpact !== undefined ? scale5(rest.residualImpact) : risk.residualImpact;
      if ((rl && !ri) || (!rl && ri)) return null;
      rest.residualLikelihood = rl || null;
      rest.residualImpact = ri || null;
      if (!rl) rest.residualAssessment = null;
    }
    if (rest.treatment !== undefined) rest.treatment = normalizeTreatment({ ...(isPlainObject(risk.treatment) ? risk.treatment : {}), ...(isPlainObject(rest.treatment) ? rest.treatment : {}) }, risk.id);
    if (rest.confidence !== undefined) rest.confidence = clampNum(rest.confidence, 0, 1, risk.confidence);
    if (rest.category !== undefined) rest.category = pickEnum(rest.category, AI_CATEGORIES, risk.category);
    if (rest.type !== undefined) rest.type = pickEnum(rest.type, AI_TYPES, risk.type);
    if (rest.status && rest.status !== prevStatus) {
      // English status names load lazily: the sentence names them only when both are available; statusFrom/statusTo
      // (stored enum values) let a view label the change in the active language either way.
      const fromEn = enumEn('aiRiskStatus', prevStatus);
      const toEn = enumEn('aiRiskStatus', rest.status);
      riskHistory(risk, by, `تغيير الحالة من «${prevStatus}» إلى «${rest.status}»`,
        fromEn && toEn ? `Status changed from ${fromEn} to ${toEn}` : 'Status changed',
        { kind: 'status', statusFrom: prevStatus, statusTo: rest.status });
    }
    if (typeof note === 'string' && note.trim()) {
      const n = noteHistoryEn(note.trim(), noteEn);
      riskHistory(risk, by, note.trim(), n.textEn, n.fields);
    }
    // treatment is replaced whole (already merged above) so deepMerge never concatenates arrays oddly.
    if (rest.treatment) { risk.treatment = rest.treatment; delete rest.treatment; }
    return patchPlatformItem('aiRisks', id, rest, { stamp: true });
  },

  /**
   * One-click acceptance of the engine's recommendation: creates the mitigation task
   * (source 'ai-accepted', write-back pending → synced), assigns the risk, logs 'accept'.
   * Returns the created task (task.riskId links back to the risk).
   */
  /**
   * Allowed transitions for an AI risk (state machine, §B3):
   *   accept / override → only from مكتشف|تنبيه and only once (no task linked yet);
   *   dismiss / escalate → never from مغلق|مُتجاوز.
   * @returns {{accept:boolean, override:boolean, dismiss:boolean, escalate:boolean, status:string|null}}
   */
  aiRiskTransitions(riskId) {
    const risk = typeof riskId === 'object' && riskId ? riskId : findPlatform('aiRisks', riskId);
    if (!risk) return { accept: false, override: false, dismiss: false, escalate: false, status: null };
    const linked = Boolean(risk.taskId) || platformList('tasks').some((t) => t && t.riskId === risk.id);
    const assignable = AI_RISK_ASSIGNABLE.includes(risk.status) && !linked;
    const open = !AI_RISK_TERMINAL.includes(risk.status);
    return { accept: assignable, override: assignable, dismiss: open, escalate: open, status: risk.status };
  },

  acceptRecommendation(riskId, { owner = '', dueDate = '', escalate = false, by = '' } = {}) {
    const risk = findPlatform('aiRisks', riskId);
    if (!risk || !store.aiRiskTransitions(risk).accept) return null;
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
    riskHistory(risk, actor, `قبول توصية المحرك وإنشاء مهمة المعالجة ${task.code} — المسؤول: ${task.owner}`, `Engine recommendation accepted; mitigation task ${task.code} created — owner: ${personEn(task.owner, 'assigned')}`);
    const pipe = findPlatform('pipelines', risk.pipeline);
    if (pipe && Number.isFinite(Number(pipe.acceptedLast30d))) pipe.acceptedLast30d = Number(pipe.acceptedLast30d) + 1;
    changed(`platform.aiRisks.${risk.id}`);
    store.pushAudit({ actor, action: 'accept', target: risk.code, detail: `قبول التوصية «${task.title}» → ${task.code} (${task.owner}، يستحق ${task.dueDate})`, detailEn: `Recommendation accepted → ${task.code} (${personEn(task.owner, 'assigned')}, due ${task.dueDate})` });
    emitFeed({
      type: 'task', tone: 'good', siteId: risk.projectId,
      title: `قبول توصية المحرك — ${risk.code} ← مهمة ${task.code}`,
      titleEn: `Engine recommendation accepted — ${risk.code} → task ${task.code}`,
      detail: `${task.title} · المسؤول: ${task.owner}`,
      detailEn: `Owner: ${personEn(task.owner, 'assigned')} · due ${task.dueDate}`,
      sourceId: 'biltix-pm', refId: task.id, code: task.code,
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
    if (!risk || !store.aiRiskTransitions(risk).override) return null;
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
    riskHistory(risk, actor, `تعديل توصية المحرك إلى «${toAction}» — السبب: ${why}`, `Engine recommendation overridden (task ${task.code}) — reason recorded`);
    const pipe = findPlatform('pipelines', risk.pipeline);
    if (pipe && Number.isFinite(Number(pipe.overridesLast30d))) pipe.overridesLast30d = Number(pipe.overridesLast30d) + 1;
    changed(`platform.aiRisks.${risk.id}`);
    store.pushAudit({ actor, action: 'override', target: risk.code, detail: `تجاوز التوصية: من «${fromAction || '—'}» إلى «${toAction}» — السبب: ${why} → ${task.code}`, detailEn: `Recommendation overridden → ${task.code}; the reason is recorded for model recalibration` });
    emitFeed({
      type: 'task', tone: 'warning', siteId: risk.projectId,
      title: `تعديل توصية المحرك — ${risk.code} ← مهمة ${task.code}`,
      titleEn: `Engine recommendation overridden — ${risk.code} → task ${task.code}`,
      detail: `${toAction} · السبب: ${why}`,
      detailEn: `Owner: ${personEn(task.owner, 'assigned')} · reason recorded`,
      sourceId: 'biltix-pm', refId: task.id, code: task.code,
    });
    if (escalate) store.escalateRisk(risk.id, undefined, actor);
    return task;
  },

  /** Immediate escalation: critical alert in the immediate queue + bus 'alert' + audit. Returns the alert. */
  escalateRisk(riskId, channels, by = '') {
    const risk = findPlatform('aiRisks', riskId);
    if (!risk || !store.aiRiskTransitions(risk).escalate) return null;
    const actor = text(by) || 'مدير المشروع';
    const list = normalizeChannels(channels);
    risk.escalated = true;
    if (['مكتشف'].includes(risk.status)) risk.status = 'تنبيه';
    risk.updatedAt = localISO(store.now());
    riskHistory(risk, actor, `تصعيد فوري عبر: ${list.join('، ') || 'القنوات الافتراضية'}`, `Immediate escalation via ${list.map((c) => enumEn('channel', c)).join(', ') || 'default channels'}`);
    changed(`platform.aiRisks.${risk.id}`);
    const alert = store.addAlert({
      riskId: risk.id, projectId: risk.projectId, severity: 'critical', queue: 'immediate', channels: list,
      title: `تصعيد فوري: ${risk.code} — ${risk.title}`,
      titleEn: `Immediate escalation: ${risk.code}${text(risk.titleEn) ? ` — ${text(risk.titleEn)}` : ''}`,
    });
    store.pushAudit({ actor, action: 'escalate', target: risk.code, detail: `تصعيد فوري (الدرجة ${risk.score}) عبر ${list.join('، ') || '—'}`, detailEn: `Immediate escalation (score ${risk.score}) via ${list.map((c) => enumEn('channel', c)).join(', ') || '—'}` });
    return alert;
  },

  /** Dismiss (مُتجاوز) with a mandatory reason; logged as an override for model recalibration. */
  dismissAiRisk(riskId, reason = '', by = '') {
    const risk = findPlatform('aiRisks', riskId);
    if (!risk || !store.aiRiskTransitions(risk).dismiss) return null;
    const actor = text(by) || 'مدير المشروع';
    const why = text(reason) || 'دون سبب مُسجَّل';
    const prev = risk.status;
    risk.status = 'مُتجاوز';
    risk.updatedAt = localISO(store.now());
    if (!Array.isArray(risk.overrides)) risk.overrides = [];
    risk.overrides.push({ at: localISO(store.now()), by: actor, fromAction: (risk.recommendation && text(risk.recommendation.action)) || '', toAction: 'تجاهل المخاطرة', reason: why });
    riskHistory(risk, actor, `تجاهل المخاطرة (كانت «${prev}») — السبب: ${why}`, `Risk dismissed${wasStatusEn(prev)} — reason recorded`, { kind: 'status', statusFrom: prev, statusTo: risk.status });
    const pipe = findPlatform('pipelines', risk.pipeline);
    if (pipe && Number.isFinite(Number(pipe.overridesLast30d))) pipe.overridesLast30d = Number(pipe.overridesLast30d) + 1;
    changed(`platform.aiRisks.${risk.id}`);
    store.pushAudit({ actor, action: 'override', target: risk.code, detail: `تجاهل المخاطرة — السبب: ${why}`, detailEn: 'Risk dismissed — reason recorded' });
    emitFeed({ type: 'ai', tone: 'neutral', siteId: risk.projectId, title: `تجاهل مخاطرة ${risk.code} بقرار بشري`, titleEn: `Risk ${risk.code} dismissed by a human decision`, detail: why, detailEn: 'Reason recorded in the risk history', sourceId: risk.pipeline, refId: risk.id, code: risk.code });
    return risk;
  },

  /* ── mitigation tasks ── */

  /** Manual (or programmatic) task; links to its risk when riskId is given. Returns the task. */
  addTask(obj = {}) {
    return createTask(obj, { silent: false });
  },

  /**
   * Patch a task. Closing it ('مغلقة') requires an outcome (patch.outcome or an existing one — otherwise
   * null is returned and nothing changes), stamps closedAt and logs audit 'close'. The linked risk is closed
   * only when it already carries a residual assessment (CONTRACT §8); otherwise it stays «قيد المعالجة» with
   * a history note asking for the residual assessment. Reopening a closed task reopens a risk it had closed.
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
    if (rest.priority !== undefined) rest.priority = rest.priority == null || rest.priority === '' ? null : pickEnum(rest.priority, TASK_PRIORITIES, task.priority || null);
    for (const key of ['id', 'code', 'attachments', 'createdAt']) delete rest[key];
    const closing = rest.status === 'مغلقة' && prevStatus !== 'مغلقة';
    const reopening = prevStatus === 'مغلقة' && rest.status && rest.status !== 'مغلقة';
    if (closing && !text(rest.outcome !== undefined ? rest.outcome : task.outcome)) return null;
    if (closing) rest.closedAt = now;
    if (reopening) rest.closedAt = null;
    rest.updatedAt = now;
    const updated = patchPlatformItem('tasks', id, rest);
    const risk = updated.riskId ? findPlatform('aiRisks', updated.riskId) : null;
    if (closing) {
      const outcome = updated.outcome;
      let riskClosed = false;
      if (risk && !AI_RISK_TERMINAL.includes(risk.status)) {
        if (risk.residualLikelihood && risk.residualImpact) {
          closeRiskInternal(risk, { outcome, actor, viaTask: updated });
          riskClosed = true;
        } else {
          risk.status = 'قيد المعالجة';
          risk.updatedAt = now;
          riskHistory(risk, actor, `إغلاق مهمة المعالجة ${updated.code} — النتيجة: ${outcome}. يلزم تقييم المخاطر المتبقية قبل إغلاق المخاطرة.`, `Mitigation task ${updated.code} closed. A residual assessment is required before the risk can be closed.`);
          changed(`platform.aiRisks.${risk.id}`);
        }
      }
      store.pushAudit({
        actor, action: 'close', target: updated.code,
        detail: `إغلاق ${updated.code}${riskClosed ? ` وإغلاق ${risk.code}` : ''} — النتيجة: ${outcome} (تغذية راجعة لإعادة معايرة النموذج)`,
        detailEn: `${updated.code} closed${riskClosed ? ` and ${risk.code} closed` : ''} — outcome recorded (feedback for model recalibration)`,
      });
      emitFeed({ type: 'task', tone: 'good', siteId: updated.projectId, title: `إغلاق مهمة المعالجة ${updated.code}${risk ? ` — ${risk.code}` : ''}`, titleEn: `Mitigation task ${updated.code} closed${risk ? ` — ${risk.code}` : ''}`, detail: outcome, detailEn: riskClosed ? 'Risk closed after its residual assessment' : (risk ? 'Risk stays in treatment until its residual assessment' : 'Outcome recorded'), sourceId: 'biltix-pm', refId: updated.id, code: updated.code });
    } else if (reopening && risk) {
      if (risk.status === 'مغلق' && risk.closedByTask === updated.id) {
        risk.status = 'قيد المعالجة';
        risk.closedAt = null;
        risk.reopenedAt = now;
        delete risk.closedByTask;
      }
      risk.updatedAt = now;
      riskHistory(risk, actor, `إعادة فتح مهمة المعالجة ${updated.code}`, `Mitigation task ${updated.code} reopened`);
      changed(`platform.aiRisks.${risk.id}`);
    } else if (rest.status && rest.status !== prevStatus) {
      if (risk && rest.status === 'قيد التنفيذ' && ['مهمة مُسندة', 'تنبيه', 'مكتشف'].includes(risk.status)) {
        risk.status = 'قيد المعالجة';
        risk.updatedAt = now;
        changed(`platform.aiRisks.${risk.id}`);
      }
      emitFeed({ type: 'task', tone: rest.status === 'متأخرة' ? 'serious' : 'accent', siteId: updated.projectId, title: `المهمة ${updated.code}: ${prevStatus} ← ${rest.status}`, titleEn: enumEn('taskStatus', prevStatus) && enumEn('taskStatus', rest.status) ? `Task ${updated.code}: ${enumEn('taskStatus', prevStatus)} → ${enumEn('taskStatus', rest.status)}` : `Task ${updated.code}: status changed`, statusFrom: prevStatus, statusTo: rest.status, detail: updated.title, detailEn: text(updated.titleEn), sourceId: 'biltix-pm', refId: updated.id, code: updated.code });
    }
    return updated;
  },

  /** Re-queue a failed/pending write-back (tasks kanban "إعادة المزامنة"). The retry is simulated in the demo. */
  retryWriteback(taskId) {
    const task = findPlatform('tasks', taskId);
    if (!task) return null;
    task.writeback = { target: 'BILTIX PM', ...(isPlainObject(task.writeback) ? task.writeback : {}), status: 'pending', at: null };
    changed(`platform.tasks.${task.id}`);
    emitFeed({ type: 'writeback', tone: 'accent', siteId: task.projectId, simulated: true, title: `محاكاة: إعادة محاولة الكتابة العكسية — ${task.code}`, titleEn: `Simulated: write-back retry — ${task.code}`, detail: task.title, detailEn: text(task.titleEn), sourceId: 'biltix-pm', refId: task.id, code: task.code });
    scheduleWriteback(task.id);
    return task;
  },

  /* ── alerts ── */

  /**
   * Add an alert (AL-#### code); critical ones emit bus 'alert' so the shell banner/toast show. Channels are
   * the configured routing; in the demo nothing is delivered to email/Slack/Teams/WhatsApp, and the feed says so.
   */
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
      sentAt: typeof obj.sentAt === 'string' && obj.sentAt ? clampInstant(obj.sentAt, store.now()) : localISO(store.now()),
      acknowledged: Boolean(obj.acknowledged),
      ackBy: text(obj.ackBy) || null,
      ackAt: typeof obj.ackAt === 'string' ? obj.ackAt : null,
      title: text(obj.title) || (risk ? `تنبيه: ${risk.code} — ${risk.title}` : 'تنبيه من منصة المخاطر'),
    };
    if (!text(alert.titleEn)) alert.titleEn = risk ? `Alert: ${risk.code}${text(risk.titleEn) ? ` — ${text(risk.titleEn)}` : ''}` : 'Risk platform alert';
    list.unshift(alert);
    changed(`platform.alerts.${alert.id}`);
    const detail = risk ? `${risk.driverExplanation || risk.title} · الدرجة ${risk.score}` : '';
    const detailEn = risk ? `Score ${risk.score} (${enumEn('rating', ratingOf(risk.score))})` : '';
    const chAr = alert.channels.length ? `القنوات المحددة: ${alert.channels.join('، ')} (محاكاة — لا إرسال فعلي)` : '';
    const chEn = alert.channels.length ? `Routing: ${alert.channels.map((c) => enumEn('channel', c)).join(', ')} (simulated — nothing delivered)` : '';
    emitFeed({
      type: 'alert', tone: severity === 'critical' ? 'critical' : 'warning', siteId: alert.projectId,
      title: alert.title, titleEn: alert.titleEn,
      detail: [detail, chAr].filter(Boolean).join(' · '),
      detailEn: [detailEn, chEn].filter(Boolean).join(' · '),
      sourceId: risk ? risk.pipeline : null, refId: alert.id, code: alert.code,
    });
    if (severity === 'critical') {
      bus.emit('alert', {
        severity: 'critical', tone: 'critical', title: alert.title, titleEn: alert.titleEn, detail: detail || alert.title, detailEn: detailEn || alert.titleEn,
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

  /* ══════════════════ v3 — audited risk lifecycle, tasks, scoring settings (CONTRACT §8) ══════════════════
   * Every method returns { ok:true, … } or { ok:false, reason, message, messageEn[, errors] } (bilingual,
   * shown as is by the UI), persists, emits store:change and appends an audit entry.
   */

  /** Replace the five domain weights (must sum to 1 ± 0.001). */
  setWeights(weights, { by = '' } = {}) {
    const v = validateWeights(weights);
    if (!v.ok) return v;
    const prev = { ...state.settings.platform.weights };
    store.setSettings({ platform: { weights: v.weights } });
    const fmtW = (w) => WEIGHT_KEYS.map((k) => `${k} ${Math.round(w[k] * 1000) / 10}%`).join(', ');
    store.pushAudit({ actor: text(by) || 'مدير المشروع', action: 'config', target: 'settings.platform.weights', detail: `تعديل أوزان المجالات: ${fmtW(prev)} ← ${fmtW(v.weights)}`, detailEn: `Domain weights changed: ${fmtW(prev)} → ${fmtW(v.weights)}` });
    return { ok: true, weights: { ...state.settings.platform.weights } };
  },

  /** Replace the alert / critical thresholds (integers 0–100, critical ≥ alert + 5). */
  setThresholds(input, { by = '' } = {}) {
    const v = validateThresholds(input);
    if (!v.ok) return v;
    const p = state.settings.platform;
    const prev = `${p.alertThreshold}/${p.criticalThreshold}`;
    store.setSettings({ platform: { alertThreshold: v.alertThreshold, criticalThreshold: v.criticalThreshold } });
    store.pushAudit({ actor: text(by) || 'مدير المشروع', action: 'config', target: 'settings.platform.thresholds', detail: `تعديل العتبات (تنبيه/تصعيد): ${prev} ← ${v.alertThreshold}/${v.criticalThreshold}`, detailEn: `Thresholds changed (alert/critical): ${prev} → ${v.alertThreshold}/${v.criticalThreshold}` });
    return { ok: true, alertThreshold: v.alertThreshold, criticalThreshold: v.criticalThreshold };
  },

  /**
   * Record the outcome of a REAL data-source test/import (sources.testConnection / importRisks) so status.js
   * can report Live / Stale / Error: ok → lastSuccessAt; failure → lastErrorAt + lastError {code,message,messageEn}.
   */
  recordDataSourceResult(result = {}) {
    const r = isPlainObject(result) ? result : {};
    const at = localISO(store.now());
    const ds = r.ok
      ? { lastSuccessAt: at }
      : { lastErrorAt: at, lastError: { code: text(r.code || r.reason) || 'error', message: text(r.message), messageEn: text(r.messageEn) } };
    store.setSettings({ dataSource: ds });
    return { ok: true, dataSource: { ...state.settings.dataSource } };
  },

  /** Attach evidence to a risk's treatment — metadata only, stored in this browser (local: true). */
  addEvidence(riskId, ev = {}, { by = '' } = {}) {
    const risk = findPlatform('aiRisks', riskId);
    if (!risk) return fail('not-found', 'المخاطرة غير موجودة.', 'Risk not found.');
    if (AI_RISK_TERMINAL.includes(risk.status)) return fail('risk-closed', 'لا يمكن إضافة أدلة إلى مخاطرة مغلقة أو متجاوزة — أعد فتحها أولاً.', 'Evidence cannot be added to a closed or dismissed risk — reopen it first.');
    const check = validateAttachment(ev);
    if (!check.ok) return check;
    const actor = text(by) || 'مدير المشروع';
    const treatment = normalizeTreatment(risk.treatment, risk.id);
    const item = { ...check.item, id: `EV-${risk.id}-${Date.now().toString(36)}${Math.floor(Math.random() * 1e3).toString(36)}`, addedAt: localISO(store.now()), by: actor, local: true };
    treatment.evidence.push(item);
    risk.treatment = treatment;
    risk.updatedAt = localISO(store.now());
    const kindAr = { link: 'رابط', note: 'ملاحظة', file: 'اسم ملف' }[item.kind] || item.kind;
    const kindEn = { link: 'link', note: 'note', file: 'file name' }[item.kind] || item.kind;
    riskHistory(risk, actor, `إضافة دليل معالجة (${kindAr}): ${item.title} — محفوظ على هذا الجهاز فقط`, `Treatment evidence added (${kindEn}): ${item.title} — stored on this device only`);
    changed(`platform.aiRisks.${risk.id}`);
    store.pushAudit({ actor, action: 'evidence', target: risk.code, detail: `إضافة دليل (${item.kind}): ${item.title}`, detailEn: `Evidence added (${item.kind}) to ${risk.code}` });
    return { ok: true, evidence: item, risk };
  },

  /** Remove evidence added in this browser (source-record evidence, local:false, cannot be removed here). */
  removeEvidence(riskId, evidenceId, { by = '' } = {}) {
    const risk = findPlatform('aiRisks', riskId);
    if (!risk) return fail('not-found', 'المخاطرة غير موجودة.', 'Risk not found.');
    const treatment = normalizeTreatment(risk.treatment, risk.id);
    const idx = treatment.evidence.findIndex((e) => e.id === evidenceId);
    if (idx === -1) return fail('evidence-not-found', 'الدليل غير موجود.', 'Evidence not found.');
    if (treatment.evidence[idx].local === false) return fail('source-evidence', 'هذا الدليل جزء من سجل النظام المصدر ولا يُحذف من هنا.', 'This evidence belongs to the source-system record and cannot be removed here.');
    if (AI_RISK_TERMINAL.includes(risk.status)) return fail('risk-closed', 'المخاطرة مغلقة — أعد فتحها لتعديل الأدلة.', 'The risk is closed — reopen it to change its evidence.');
    const [removed] = treatment.evidence.splice(idx, 1);
    const actor = text(by) || 'مدير المشروع';
    risk.treatment = treatment;
    risk.updatedAt = localISO(store.now());
    riskHistory(risk, actor, `حذف دليل معالجة: ${removed.title}`, 'Treatment evidence removed');
    changed(`platform.aiRisks.${risk.id}`);
    store.pushAudit({ actor, action: 'evidence', target: risk.code, detail: `حذف دليل: ${removed.title}`, detailEn: `Evidence removed from ${risk.code}` });
    return { ok: true, removed, risk };
  },

  /**
   * Residual assessment after mitigation: likelihood & impact 1–5 and a justification are required; the
   * residual score cannot exceed the inherent score; the risk must have a treatment (task, plan or evidence)
   * and must not be closed/dismissed. Required before closeAiRisk.
   */
  assessResidual(riskId, { likelihood, impact, justification, justificationEn, by = '' } = {}) {
    const risk = findPlatform('aiRisks', riskId);
    if (!risk) return fail('not-found', 'المخاطرة غير موجودة.', 'Risk not found.');
    if (AI_RISK_TERMINAL.includes(risk.status)) return fail('risk-closed', 'لا يمكن تقييم مخاطرة مغلقة أو متجاوزة — أعد فتحها أولاً.', 'A closed or dismissed risk cannot be assessed — reopen it first.');
    const errors = [];
    const l = scale5(likelihood);
    const im = scale5(impact);
    if (!l) errors.push(fieldError('likelihood', 'range', 'الاحتمالية المتبقية عدد صحيح من 1 إلى 5.', 'Residual likelihood must be a whole number from 1 to 5.'));
    if (!im) errors.push(fieldError('impact', 'range', 'الأثر المتبقي عدد صحيح من 1 إلى 5.', 'Residual impact must be a whole number from 1 to 5.'));
    const why = text(justification);
    if (why.length < 5) errors.push(fieldError('justification', 'required', 'اكتب مبرر التقييم (5 أحرف على الأقل).', 'Write a justification (at least 5 characters).'));
    if (errors.length) return fail('validation', 'تعذّر حفظ التقييم المتبقي — راجع الحقول.', 'The residual assessment was not saved — check the fields.', { errors });
    const inherent = risk.likelihood * risk.impact * 4;
    if (l * im * 4 > inherent) return fail('residual-above-inherent', `الدرجة المتبقية (${l * im * 4}) أعلى من الدرجة الأصلية (${inherent}) — أعد تقدير الشدة بدلاً من ذلك.`, `The residual score (${l * im * 4}) is above the inherent score (${inherent}) — re-assess the inherent severity instead.`);
    const treatment = normalizeTreatment(risk.treatment, risk.id);
    const hasTreatment = Boolean(risk.taskId || treatment.plan || treatment.evidence.length || platformList('tasks').some((t) => t && t.riskId === risk.id));
    if (!hasTreatment) return fail('treatment-required', 'لا توجد معالجة لهذه المخاطرة بعد — اقبل التوصية أو أنشئ مهمة أولاً.', 'This risk has no treatment yet — accept the recommendation or create a task first.');
    const actor = text(by) || 'مدير المشروع';
    const prev = risk.residualLikelihood && risk.residualImpact ? `${risk.residualLikelihood}×${risk.residualImpact}` : null;
    risk.residualLikelihood = l;
    risk.residualImpact = im;
    risk.residualAssessment = { at: localISO(store.now()), by: actor, justification: why, ...(text(justificationEn) ? { justificationEn: text(justificationEn) } : {}) };
    risk.updatedAt = localISO(store.now());
    riskHistory(risk, actor, `تقييم المخاطر المتبقية: ${l}×${im} (الدرجة ${l * im * 4} مقابل ${inherent})${prev ? ` — بدلاً من ${prev}` : ''} — ${why}`, `Residual assessment: ${l}×${im} (score ${l * im * 4} vs ${inherent})${prev ? ` — replaces ${prev}` : ''}`);
    changed(`platform.aiRisks.${risk.id}`);
    store.pushAudit({ actor, action: 'residual', target: risk.code, detail: `تقييم متبقٍ ${l}×${im} = ${l * im * 4} (الأصلي ${inherent}) — ${why}`, detailEn: `Residual ${l}×${im} = ${l * im * 4} (inherent ${inherent})` });
    return { ok: true, risk };
  },

  /** Close a risk with an outcome. Requires a residual assessment; closes its open mitigation tasks too. */
  closeAiRisk(riskId, { outcome, outcomeEn, by = '' } = {}) {
    const risk = findPlatform('aiRisks', riskId);
    if (!risk) return fail('not-found', 'المخاطرة غير موجودة.', 'Risk not found.');
    if (AI_RISK_TERMINAL.includes(risk.status)) return fail('already-closed', 'المخاطرة مغلقة أو متجاوزة بالفعل.', 'The risk is already closed or dismissed.');
    if (!risk.residualLikelihood || !risk.residualImpact) return fail('residual-required', 'يلزم تقييم المخاطر المتبقية قبل الإغلاق.', 'A residual assessment is required before closing.');
    const why = text(outcome);
    if (!why) return fail('outcome-required', 'اكتب نتيجة المعالجة قبل الإغلاق.', 'Write the treatment outcome before closing.');
    closeRiskInternal(risk, { outcome: why, outcomeEn: text(outcomeEn), actor: text(by) || 'مدير المشروع' });
    return { ok: true, risk };
  },

  /** Reopen a closed or dismissed risk (reason required). Linked closed tasks are reopened as well. */
  reopenAiRisk(riskId, { reason, by = '' } = {}) {
    const risk = findPlatform('aiRisks', riskId);
    if (!risk) return fail('not-found', 'المخاطرة غير موجودة.', 'Risk not found.');
    if (!AI_RISK_TERMINAL.includes(risk.status)) return fail('not-closed', 'المخاطرة مفتوحة بالفعل.', 'The risk is already open.');
    const why = text(reason);
    if (!why) return fail('reason-required', 'اكتب سبب إعادة الفتح.', 'Write the reason for reopening.');
    const actor = text(by) || 'مدير المشروع';
    const now = localISO(store.now());
    const prev = risk.status;
    const tasks = platformList('tasks').filter((t) => t && (t.riskId === risk.id || t.id === risk.taskId));
    for (const t of tasks) {
      if (t.status === 'مغلقة') { t.status = 'قيد التنفيذ'; t.closedAt = null; t.updatedAt = now; changed(`platform.tasks.${t.id}`); }
    }
    const level = alertLevelFor(risk.score);
    risk.status = tasks.length ? 'قيد المعالجة' : (level ? 'تنبيه' : 'مكتشف');
    risk.closedAt = null;
    risk.reopenedAt = now;
    delete risk.closedByTask;
    risk.updatedAt = now;
    riskHistory(risk, actor, `إعادة فتح المخاطرة (كانت «${prev}») — السبب: ${why}`, `Risk reopened${wasStatusEn(prev)} — reason recorded`, { kind: 'status', statusFrom: prev, statusTo: risk.status });
    changed(`platform.aiRisks.${risk.id}`);
    store.pushAudit({ actor, action: 'reopen', target: risk.code, detail: `إعادة فتح — السبب: ${why}`, detailEn: `Reopened${wasStatusEn(prev)}`, from: prev, to: risk.status });
    emitFeed({ type: 'ai', tone: 'warning', siteId: risk.projectId, title: `إعادة فتح المخاطرة ${risk.code}`, titleEn: `Risk ${risk.code} reopened`, detail: why, detailEn: 'Reason recorded in the risk history', sourceId: risk.pipeline, refId: risk.id, code: risk.code });
    return { ok: true, risk };
  },

  /** Edit a task's content (title, due date, priority, linked risk, description). Status → updateTask; owner → assignTask. */
  editTask(id, patch = {}, { by = '' } = {}) {
    const task = findPlatform('tasks', id);
    if (!task) return fail('not-found', 'المهمة غير موجودة.', 'Task not found.');
    if (task.status === 'مغلقة') return fail('task-closed', 'المهمة مغلقة — أعد فتحها لتعديلها.', 'The task is closed — reopen it to edit.');
    const src = isPlainObject(patch) ? patch : {};
    const errors = [];
    const next = {};
    if (src.title !== undefined) { if (!text(src.title)) errors.push(fieldError('title', 'required', 'عنوان المهمة مطلوب.', 'A task title is required.')); else next.title = text(src.title).slice(0, 300); }
    if (src.titleEn !== undefined) next.titleEn = text(src.titleEn).slice(0, 300);
    if (src.description !== undefined) next.description = text(src.description).slice(0, 4000);
    if (src.dueDate !== undefined) { const d = validDateOnly(src.dueDate); if (!d) errors.push(fieldError('dueDate', 'invalid', 'تاريخ الاستحقاق غير صالح.', 'Invalid due date.')); else next.dueDate = d; }
    if (src.priority !== undefined) {
      if (src.priority === null || src.priority === '') next.priority = null;
      else if (!TASK_PRIORITIES.includes(src.priority)) errors.push(fieldError('priority', 'invalid', 'الأولوية غير صالحة.', 'Invalid priority.'));
      else next.priority = src.priority;
    }
    if (src.riskId !== undefined) {
      if (src.riskId === null || src.riskId === '') next.riskId = null;
      else if (!findPlatform('aiRisks', src.riskId)) errors.push(fieldError('riskId', 'unknown', 'المخاطرة المرتبطة غير موجودة.', 'The linked risk does not exist.'));
      else next.riskId = src.riskId;
    }
    if (errors.length) return fail('validation', 'تعذّر حفظ التعديلات — راجع الحقول.', 'Changes were not saved — check the fields.', { errors });
    const changedKeys = Object.keys(next).filter((k) => !sameJSON(next[k], task[k]));
    if (!changedKeys.length) return { ok: true, task, changed: [] };
    const actor = text(by) || 'مدير المشروع';
    if (next.riskId !== undefined && next.riskId !== task.riskId) {
      const old = task.riskId ? findPlatform('aiRisks', task.riskId) : null;
      if (old && old.taskId === task.id) { old.taskId = null; if (old.treatment && old.treatment.taskId === task.id) old.treatment = normalizeTreatment({ ...old.treatment, taskId: null, plan: null }, old.id); changed(`platform.aiRisks.${old.id}`); }
      const nr = next.riskId ? findPlatform('aiRisks', next.riskId) : null;
      if (nr) { nr.taskId = task.id; nr.treatment = normalizeTreatment({ ...(nr.treatment || {}), taskId: task.id, plan: next.title || task.title }, nr.id); if (['مكتشف', 'تنبيه'].includes(nr.status)) nr.status = 'مهمة مُسندة'; changed(`platform.aiRisks.${nr.id}`); }
      if (nr) next.projectId = nr.projectId;
    }
    Object.assign(task, next, { updatedAt: localISO(store.now()) });
    const linked = task.riskId ? findPlatform('aiRisks', task.riskId) : null;
    if (linked && next.title && linked.treatment && linked.treatment.taskId === task.id) linked.treatment = normalizeTreatment({ ...linked.treatment, plan: task.title }, linked.id);
    changed(`platform.tasks.${task.id}`);
    store.pushAudit({ actor, action: 'edit', target: task.code, detail: `تعديل المهمة: ${changedKeys.join('، ')}`, detailEn: `Task edited: ${changedKeys.join(', ')}` });
    return { ok: true, task, changed: changedKeys };
  },

  /** (Re)assign a task to an owner. */
  assignTask(id, owner, { by = '' } = {}) {
    const task = findPlatform('tasks', id);
    if (!task) return fail('not-found', 'المهمة غير موجودة.', 'Task not found.');
    if (task.status === 'مغلقة') return fail('task-closed', 'المهمة مغلقة — أعد فتحها لإسنادها.', 'The task is closed — reopen it to reassign.');
    const who = text(owner).slice(0, 120);
    if (!who) return fail('owner-required', 'حدّد المسؤول.', 'Choose an owner.', { errors: [fieldError('owner', 'required', 'حدّد المسؤول.', 'Choose an owner.')] });
    if (who === task.owner) return { ok: true, task, changed: false };
    const actor = text(by) || 'مدير المشروع';
    const prev = task.owner;
    task.owner = who;
    task.updatedAt = localISO(store.now());
    const risk = task.riskId ? findPlatform('aiRisks', task.riskId) : null;
    if (risk && (!risk.owner || risk.owner === prev)) { risk.owner = who; riskHistory(risk, actor, `إسناد المهمة ${task.code} إلى ${who}`, `Task ${task.code} assigned to ${personEn(who, 'a new owner')}`); changed(`platform.aiRisks.${risk.id}`); }
    changed(`platform.tasks.${task.id}`);
    store.pushAudit({ actor, action: 'assign', target: task.code, detail: `إسناد المهمة من ${prev || '—'} إلى ${who}`, detailEn: `Task reassigned from ${personEn(prev, '—')} to ${personEn(who, 'a new owner')}` });
    emitFeed({ type: 'task', tone: 'accent', siteId: task.projectId, title: `إسناد المهمة ${task.code} إلى ${who}`, titleEn: `Task ${task.code} assigned to ${personEn(who, 'a new owner')}`, detail: task.title, detailEn: text(task.titleEn), sourceId: 'biltix-pm', refId: task.id, code: task.code });
    return { ok: true, task, changed: true };
  },

  /** Attach evidence to a task — metadata only, stored in this browser (local: true). */
  addTaskAttachment(id, att = {}, { by = '' } = {}) {
    const task = findPlatform('tasks', id);
    if (!task) return fail('not-found', 'المهمة غير موجودة.', 'Task not found.');
    const check = validateAttachment(att);
    if (!check.ok) return check;
    const actor = text(by) || 'مدير المشروع';
    const item = { ...check.item, id: `AT-${task.id}-${Date.now().toString(36)}${Math.floor(Math.random() * 1e3).toString(36)}`, addedAt: localISO(store.now()), by: actor, local: true };
    if (!Array.isArray(task.attachments)) task.attachments = [];
    task.attachments.push(item);
    task.updatedAt = localISO(store.now());
    changed(`platform.tasks.${task.id}`);
    store.pushAudit({ actor, action: 'attachment', target: task.code, detail: `إرفاق (${item.kind}): ${item.title} — محفوظ على هذا الجهاز فقط`, detailEn: `Attachment added (${item.kind}) to ${task.code} — stored on this device only` });
    return { ok: true, attachment: item, task };
  },

  /** Remove a task attachment added in this browser. */
  removeTaskAttachment(id, attachmentId, { by = '' } = {}) {
    const task = findPlatform('tasks', id);
    if (!task) return fail('not-found', 'المهمة غير موجودة.', 'Task not found.');
    const list = Array.isArray(task.attachments) ? task.attachments : [];
    const idx = list.findIndex((a) => a && a.id === attachmentId);
    if (idx === -1) return fail('attachment-not-found', 'المرفق غير موجود.', 'Attachment not found.');
    const [removed] = list.splice(idx, 1);
    task.updatedAt = localISO(store.now());
    changed(`platform.tasks.${task.id}`);
    store.pushAudit({ actor: text(by) || 'مدير المشروع', action: 'attachment', target: task.code, detail: `حذف مرفق: ${removed.title}`, detailEn: `Attachment removed from ${task.code}` });
    return { ok: true, removed, task };
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
    safeAssign(item, patch);
    changed('platform.validation.sources');
    return item;
  },

  updateValidationRule(id, patch = {}) {
    const v = platform().validation;
    const item = isPlainObject(v) && Array.isArray(v.rules) ? v.rules.find((r) => r && r.id === id) : null;
    if (!item || !isPlainObject(patch)) return null;
    safeAssign(item, patch);
    changed('platform.validation.rules');
    if (patch.enabled !== undefined) {
      const enabled = Boolean(patch.enabled);
      store.pushAudit({
        actor: 'مدير المشروع', action: 'config', target: item.name || item.id,
        // English rule name only when it is available now (dictionaries load lazily); `ruleId` lets a view resolve it later.
        targetEn: latinOnly(item.nameEn) || dataEn('validationRules', item.id, 'name') || latinOnly(item.name) || undefined,
        detail: enabled ? 'تفعيل قاعدة التحقق' : 'تعطيل قاعدة التحقق',
        detailEn: enabled ? 'Validation rule enabled' : 'Validation rule disabled',
        kind: 'rule-toggle', ruleId: text(item.id), enabled,
      });
    }
    return item;
  },

  /** Resolve a quarantined record: 'مُصحح' | 'مرفوض' (or back to 'معلّق'); logged as 'validation'. */
  resolveQuarantine(id, status, by = '') {
    const v = platform().validation;
    const item = isPlainObject(v) && Array.isArray(v.quarantine) ? v.quarantine.find((q) => q && q.id === id) : null;
    if (!item) return null;
    const next = pickEnum(status, QUARANTINE_STATUS, 'مُصحح');
    const prev = item.status;
    item.status = next;
    item.resolvedAt = next === 'معلّق' ? null : localISO(store.now());
    item.resolvedBy = next === 'معلّق' ? null : (text(by) || 'مسؤول جودة البيانات');
    changed('platform.validation.quarantine');
    const decision = next === 'مُصحح' ? 'corrected' : (next === 'مرفوض' ? 'rejected' : 'reheld');
    const verbEn = { corrected: 'Quarantined record corrected', rejected: 'Quarantined record rejected', reheld: 'Quarantined record put back on hold' }[decision];
    // The English reason exists only when the record carries one or the dictionaries are loaded (English session);
    // otherwise the sentence stays without it and `quarantineId` lets a view add the reason from its dictionary.
    const reasonEn = latinOnly(item.reasonEn) || dataEn('quarantine', item.id, 'reason') || latinOnly(item.reason);
    store.pushAudit({
      actor: item.resolvedBy || 'مسؤول جودة البيانات', action: 'validation', target: item.recordRef || item.id,
      detail: `${next === 'مُصحح' ? 'تصحيح' : next === 'مرفوض' ? 'رفض' : 'إعادة تعليق'} سجل محجور — ${item.reason || ''}`.trim(),
      detailEn: reasonEn ? `${verbEn} — ${reasonEn}` : verbEn,
      kind: 'quarantine', quarantineId: text(item.id), recordRef: text(item.recordRef), decision, from: text(prev), to: next,
    });
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
      // Pipeline statuses are Latin ids: enumEn falls back to the id itself when the dictionaries are not loaded.
      const version = latinOnly(text(rest.version));
      store.pushAudit({
        actor: text(patch.by) || 'مهندس النماذج', action: 'model-update', target: pipe.nameAr || pipe.name || id,
        targetEn: latinOnly(pipe.name) || dataEn('pipelines', id, 'name') || undefined,
        detail: `تغيير حالة المحرك: ${prevStatus} ← ${rest.status}${rest.version ? ` (الإصدار ${rest.version})` : ''}`,
        detailEn: `Engine state changed: ${enumEn('pipelineStatus', prevStatus, text(prevStatus))} → ${enumEn('pipelineStatus', rest.status, text(rest.status))}${version ? ` (version ${version})` : ''}`,
        kind: 'pipeline-status', pipelineId: text(id), from: text(prevStatus), to: text(rest.status), version: version || undefined,
      });
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

  /**
   * Prepend an audit entry {id, at, actor, action, target, detail}; capped at 500.
   * Bilingual: `detailEn` (callers build it from Latin-only data; user-typed text may be copied as typed) and
   * `targetEn` (kept only when it has no Arabic). Structured fields (AUDIT_STRUCTURED: kind, ruleId, enabled, quarantineId,
   * recordRef, decision, from, to, pipelineId, version) let a view word the entry from its dictionaries in either
   * language — English enum labels load lazily, so a sentence pre-rendered during an Arabic session can be thinner.
   */
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
    if (typeof entry.detailEn === 'string' && entry.detailEn.trim()) item.detailEn = entry.detailEn.trim();
    const targetEn = latinOnly(entry.targetEn);
    if (targetEn) item.targetEn = targetEn;
    for (const key of AUDIT_STRUCTURED) {
      const v = entry[key];
      if (typeof v === 'boolean' || (typeof v === 'number' && Number.isFinite(v))) item[key] = v;
      else if (typeof v === 'string' && v.trim()) item[key] = v.trim().slice(0, 200);
    }
    if (entry.simulated === true) item.simulated = true;
    list.unshift(item);
    if (list.length > AUDIT_CAP) list.length = AUDIT_CAP;
    changed('platform.auditLog');
    return item;
  },
};

export default store;
