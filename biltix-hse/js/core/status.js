/**
 * BILTIX Risk AI — system status taxonomy (js/core/status.js)
 *
 * Contract: docs/specs/v3-precision/CONTRACT.md §5. One definition of "what is real" used by the
 * shell, settings, integrations, engine and data-quality screens, so no screen can claim a live
 * connection that does not exist.
 *
 *   STATUSES = ['demo', 'live', 'offline', 'stale', 'error', 'not_connected']
 *   status.mode(state)              'demo' when settings.dataSource.type === 'simulation', else 'live'
 *   status.source(state, now?)      { status, type, lastSuccessAt, lastErrorAt, lastError, staleAfterMs }
 *   status.connector(state, record, now?)
 *        demo mode: unconfigured → 'not_connected', every other (simulated) record → 'demo'
 *        live mode: records with real evidence (lastSuccessAt / lastErrorAt written by a real HTTP test):
 *                   offline → 'offline', last attempt failed → 'error',
 *                   success older than staleAfterMs (30 min) → 'stale', else 'live';
 *                   simulated records stay 'demo'; unconfigured → 'not_connected'
 *   status.pipeline(state, record)  demo mode → 'demo' (runs are simulated; precision / recall / calibration /
 *                                   drift are NOT measured), otherwise 'not_connected' (no model service)
 *   status.meta(s)                  { status, tone, icon, labelKey: `status.${s}`, descKey: `status.${s}Desc` }
 *   status.online()                 navigator.onLine (true when unknown)
 *   status.summary(state, records)  { total, counts: { demo, live, … } } for a connector list
 *   status.label(s) / status.desc(s) translated strings (via i18n, dictionary js/i18n/core.js → ns 'status').
 *                                   desc() fills {minutes} (the stale window, "30 minutes" / "٣٠ دقيقة")
 *                                   with fmt.num, so the numerals setting applies; no digit is hard-coded.
 *
 * Rules (§5): never show "connected", "متصل", "live", "training", accuracy as fact, or a success toast
 * for an operation that did not happen. Simulated operations say "محاكاة / Simulated".
 * Pure functions; `state` defaults to window.biltix.store.state when omitted.
 */

import { i18n } from './i18n.js';
import { fmt } from './fmt.js';

export const STATUSES = Object.freeze(['demo', 'live', 'offline', 'stale', 'error', 'not_connected']);
export const STALE_AFTER_MS = 30 * 60 * 1000;

/** The stale window as words in the UI language and numerals ("30 minutes" · "٣٠ دقيقة"). */
function staleWindowText(ms = STALE_AFTER_MS) {
  const minutes = Math.max(1, Math.round(ms / 60000));
  return i18n.tn('status.minutes', minutes, { count: fmt.num(minutes) });
}

const META = Object.freeze({
  demo: { tone: 'accent', icon: 'flask' },
  live: { tone: 'good', icon: 'check-circle' },
  offline: { tone: 'warning', icon: 'alert-circle' },
  stale: { tone: 'warning', icon: 'clock' },
  error: { tone: 'critical', icon: 'alert-octagon' },
  not_connected: { tone: 'neutral', icon: 'plug' },
});

/** Seed / store values that mean "this connector was never set up". */
const UNCONFIGURED = new Set(['configurable', 'not_connected', 'not-connected', 'unconfigured', 'available']);

function defaultState() {
  try {
    const s = globalThis.biltix && globalThis.biltix.store && globalThis.biltix.store.state;
    return s && typeof s === 'object' ? s : {};
  } catch { return {}; }
}

function settingsOf(state) {
  const st = state && typeof state === 'object' ? state : defaultState();
  return st.settings && typeof st.settings === 'object' ? st.settings : {};
}

function time(value) {
  if (value === undefined || value === null || value === '') return NaN;
  const ms = value instanceof Date ? value.getTime() : Date.parse(String(value));
  return Number.isFinite(ms) ? ms : NaN;
}

function nowMs(now) {
  if (now instanceof Date) return now.getTime();
  if (typeof now === 'number' && Number.isFinite(now)) return now;
  return Date.now();
}

/** Live-mode classification from real evidence timestamps. */
function classifyEvidence({ lastSuccessAt, lastErrorAt }, now, staleAfterMs = STALE_AFTER_MS) {
  if (!status.online()) return 'offline';
  const ok = time(lastSuccessAt);
  const err = time(lastErrorAt);
  if (Number.isFinite(err) && (!Number.isFinite(ok) || err >= ok)) return 'error';
  if (!Number.isFinite(ok)) return 'not_connected';
  if (nowMs(now) - ok > staleAfterMs) return 'stale';
  return 'live';
}

export const status = {
  STATUSES,
  STALE_AFTER_MS,

  /** 'demo' while the configured data source is the built-in simulation, else 'live'. */
  mode(state) {
    const ds = settingsOf(state).dataSource;
    const type = ds && typeof ds === 'object' ? ds.type : undefined;
    return !type || type === 'simulation' ? 'demo' : 'live';
  },

  /**
   * Status of the configured data source.
   * demo → 'demo'; live → 'not_connected' (no URL or never tested), 'offline', 'error', 'stale', 'live'.
   */
  source(state, now) {
    const ds = (settingsOf(state).dataSource && typeof settingsOf(state).dataSource === 'object') ? settingsOf(state).dataSource : {};
    const base = {
      type: ds.type || 'simulation',
      lastSuccessAt: ds.lastSuccessAt || null,
      lastErrorAt: ds.lastErrorAt || null,
      lastError: ds.lastError || null,
      staleAfterMs: STALE_AFTER_MS,
    };
    if (status.mode(state) === 'demo') return { status: 'demo', ...base };
    if (!ds.url) return { status: 'not_connected', ...base };
    return { status: classifyEvidence(base, now, STALE_AFTER_MS), ...base };
  },

  /** Honest status for one connector / integration record. */
  connector(state, record, now) {
    if (!record || typeof record !== 'object') return 'not_connected';
    const raw = String(record.status || '').toLowerCase();
    const unconfigured = UNCONFIGURED.has(raw) || record.configured === false;
    if (unconfigured) return 'not_connected';
    const real = record.simulated === false || record.real === true
      || Boolean(record.lastSuccessAt) || Boolean(record.lastErrorAt);
    if (status.mode(state) === 'demo' || !real) return 'demo';
    return classifyEvidence({ lastSuccessAt: record.lastSuccessAt, lastErrorAt: record.lastErrorAt }, now, Number(record.staleAfterMs) || STALE_AFTER_MS);
  },

  /**
   * AI pipelines: 'demo' in demo mode (simulated runs; model accuracy is not measured), 'not_connected'
   * in live mode (this version has no connected model service).
   */
  pipeline(state) {
    return status.mode(state) === 'demo' ? 'demo' : 'not_connected';
  },

  /** Presentation metadata for a status key (unknown keys map to 'not_connected'). */
  meta(s) {
    const key = STATUSES.includes(s) ? s : 'not_connected';
    const m = META[key];
    return { status: key, tone: m.tone, icon: m.icon, labelKey: `status.${key}`, descKey: `status.${key}Desc` };
  },

  /** Translated short label ("Demo", "تجريبي"). */
  label(s) {
    return i18n.t(status.meta(s).labelKey);
  },

  /**
   * Translated one-sentence description. {minutes} is the stale window formatted with fmt.num
   * (numerals setting); `params` may override it, e.g. { minutes: … } for a connector's own window.
   */
  desc(s, params) {
    return i18n.t(status.meta(s).descKey, { minutes: staleWindowText(), ...(params || {}) });
  },

  /** navigator.onLine (true when the platform cannot tell). */
  online() {
    try { return typeof navigator === 'undefined' || navigator.onLine !== false; } catch { return true; }
  },

  /** Count connectors by status: { total, counts: { demo, live, offline, stale, error, not_connected } }. */
  summary(state, records, now) {
    const counts = Object.fromEntries(STATUSES.map((s) => [s, 0]));
    const list = Array.isArray(records) ? records.filter(Boolean) : [];
    for (const r of list) counts[status.connector(state, r, now)] += 1;
    return { total: list.length, counts };
  },
};

export default status;
