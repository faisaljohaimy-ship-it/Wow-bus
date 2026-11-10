/**
 * Biltix Risk AI — selectors (js/core/selectors.js)
 *
 * Pure derived-data functions. No DOM, no store mutation, no formatting: every
 * function takes `state` (+ optional `filters`) and returns plain data for the
 * views and charts. Time-dependent selectors accept an optional `now` (Date or
 * ISO string) so they are deterministic in tests; the default is the wall clock.
 *
 * Contract: ARCHITECTURE.md §4 (`sel`). Risk tiering is defined ONCE here:
 *   score = likelihood × severity (1..25)
 *   1–4 منخفض (good) · 5–9 متوسط (warning) · 10–15 عالٍ (serious) · 16–25 حرج (critical)
 */

import { CATEGORIES, INCIDENT_TYPES, PERMIT_STATUS } from '../data/seed.js';

const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;
const MINUTE_MS = 60_000;

/** Enum literals from the data contract (§3). */
const CLOSED = 'مغلق';
const LTI_TYPE = 'إصابة مضيعة للوقت';
const MTC_TYPE = 'إصابة تتطلب علاجاً طبياً';
const NEAR_MISS_TYPE = 'حادث وشيك';
const PERMIT_ACTIVE = 'نشط';
const INSPECTION_SCHEDULED = 'مجدول';
const INSPECTION_DONE = 'منجز';
const INSPECTION_OVERDUE = 'متأخر';
const FINDING_OPEN = 'مفتوح';

/** Working-hours assumptions for frequency rates. */
export const HOURS_PER_WORKER_DAY = 9;          // one site shift
export const LTIFR_BASE_HOURS = 1_000_000;      // LTIFR = LTI × 1,000,000 / hours worked
export const TRIR_BASE_HOURS = 200_000;         // TRIR  = recordable × 200,000 / hours worked (OSHA basis)
export const CERT_EXPIRING_DAYS = 30;           // a certificate is "expiring" inside this window
export const PERMIT_EXPIRING_MINUTES = 60;      // a permit is "expiring" inside this window
export const INSPECTION_DUE_DAYS = 7;           // scheduled inspections due inside this window

/**
 * Safety Index (0..100). Documented in the UI tooltip:
 *
 *   SI = 100
 *        − 2.5 × open critical risks (حرج)
 *        − 1.0 × open high risks (عالٍ)
 *        − 0.5 × open risks past their due date
 *        − 4.0 × lost-time injuries in the last 90 days
 *        − 1.5 × medical-treatment injuries in the last 90 days
 *        − 0.5 × near-misses in the last 30 days
 *        + 0.1 × training compliance %
 *   clamped to 0..100 and rounded.
 */
export const SAFETY_INDEX_WEIGHTS = Object.freeze({
  base: 100,
  criticalOpen: 2.5,
  highOpen: 1.0,
  overdueOpen: 0.5,
  lti90: 4.0,
  mtc90: 1.5,
  nearMiss30: 0.5,
  trainingPct: 0.1,
});

export const TIERS = Object.freeze([
  Object.freeze({ name: 'منخفض', min: 1, max: 4, tone: 'good' }),
  Object.freeze({ name: 'متوسط', min: 5, max: 9, tone: 'warning' }),
  Object.freeze({ name: 'عالٍ', min: 10, max: 15, tone: 'serious' }),
  Object.freeze({ name: 'حرج', min: 16, max: 25, tone: 'critical' }),
]);

const TONE_RANK = Object.freeze({ critical: 0, serious: 1, warning: 2, good: 3, accent: 4, brand: 4, neutral: 5 });

const INCIDENT_TYPE_IDS = ['lti', 'mtc', 'firstaid', 'nearmiss', 'property', 'environmental'];
const PERMIT_STATUS_IDS = ['draft', 'pending', 'active', 'suspended', 'closed'];

/* ────────────────────────────── primitives ────────────────────────────── */

function toDate(value) {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value === 'number') {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  if (typeof value !== 'string' || !value) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  const d = m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function ms(value) {
  const d = toDate(value);
  return d ? d.getTime() : NaN;
}

function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function endOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999);
}

function addDays(date, days) {
  const d = new Date(date.getTime());
  d.setDate(d.getDate() + days);
  return d;
}

/** Whole calendar days from `a` to `b` (positive when b is later). */
function dayDiff(a, b) {
  const da = toDate(a);
  const db = toDate(b);
  if (!da || !db) return 0;
  return Math.round((startOfDay(db).getTime() - startOfDay(da).getTime()) / DAY_MS);
}

function resolveNow(filters, now) {
  return toDate(now) || toDate(filters && filters.now) || new Date();
}

function clamp(n, min, max) {
  return Math.min(max, Math.max(min, n));
}

function round(n, digits = 0) {
  const f = 10 ** digits;
  return Math.round((n + Number.EPSILON) * f) / f;
}

function pct(part, total) {
  return total > 0 ? Math.round((part / total) * 100) : 0;
}

function mean(values) {
  const list = values.filter((v) => Number.isFinite(v));
  return list.length ? list.reduce((a, b) => a + b, 0) / list.length : 0;
}

function arr(value) {
  return Array.isArray(value) ? value : [];
}

/** Arabic-aware search normalisation (strip tashkeel/tatweel, unify alef/taa marbuta/yaa). */
function norm(value) {
  return String(value ?? '')
    .toLowerCase()
    .replace(/[ً-ْـ]/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .trim();
}

function matchesSearch(fields, query) {
  const q = norm(query);
  if (!q) return true;
  const terms = q.split(/\s+/).filter(Boolean);
  const haystack = norm(fields.filter((f) => f != null && f !== '').join(' \u0001 '));
  return terms.every((t) => haystack.includes(t));
}

/** FNV-1a 32-bit hash → deterministic jitter in [-spread, +spread] degrees. */
function jitterFor(id, spread = 10) {
  const s = String(id ?? '');
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return ((h % 20_001) / 20_000) * 2 * spread - spread;
}

/** ISO-8601 week number (weeks start Monday). */
function isoWeek(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d - yearStart) / DAY_MS) + 1) / 7);
}

function mondayOf(date) {
  const d = startOfDay(date);
  const shift = (d.getDay() + 6) % 7; // Monday = 0
  return addDays(d, -shift);
}

function normalizeFilters(filters) {
  const f = filters && typeof filters === 'object' ? filters : {};
  const range = Number(f.range);
  return {
    ...f,
    siteId: typeof f.siteId === 'string' && f.siteId ? f.siteId : 'all',
    range: Number.isFinite(range) && range > 0 ? Math.round(range) : 30,
    search: typeof f.search === 'string' ? f.search : '',
  };
}

function matchesSite(item, siteId) {
  return siteId === 'all' || !siteId || (item && item.siteId === siteId);
}

function matchesEnum(value, filterValue) {
  return !filterValue || filterValue === 'all' || value === filterValue;
}

function sitesFor(state, siteId) {
  const sites = arr(state.sites);
  return siteId === 'all' || !siteId ? sites : sites.filter((s) => s.id === siteId);
}

function siteNameOf(state, siteId) {
  const site = arr(state.sites).find((s) => s.id === siteId);
  return site ? site.name : '';
}

function categoryOf(categoryId) {
  return arr(CATEGORIES).find((c) => c.id === categoryId) || null;
}

function categoryIndex(categoryId) {
  const i = arr(CATEGORIES).findIndex((c) => c.id === categoryId);
  return i === -1 ? 0 : i;
}

/** Period helpers: current period = `range` calendar days ending on `now` (inclusive). */
function period(now, range) {
  const to = endOfDay(now);
  const from = addDays(startOfDay(now), -(range - 1));
  return { from, to, fromMs: from.getTime(), toMs: to.getTime(), days: range };
}

function within(value, fromMs, toMs) {
  const t = ms(value);
  return Number.isFinite(t) && t >= fromMs && t <= toMs;
}

/* ────────────────────────────── risk scoring ────────────────────────────── */

function riskScore(r) {
  if (!r) return 0;
  const l = clamp(Number(r.likelihood) || 0, 0, 5);
  const s = clamp(Number(r.severity) || 0, 0, 5);
  return l * s;
}

function residualScore(r) {
  if (!r) return 0;
  const l = clamp(Number(r.residualLikelihood ?? r.likelihood) || 0, 0, 5);
  const s = clamp(Number(r.residualSeverity ?? r.severity) || 0, 0, 5);
  return l * s;
}

function riskTier(score) {
  const n = Number(score) || 0;
  for (const tier of TIERS) if (n <= tier.max) return tier.name;
  return TIERS[TIERS.length - 1].name;
}

function tierTone(tier) {
  const found = TIERS.find((t) => t.name === tier);
  return found ? found.tone : 'good';
}

function isOpenRisk(r) {
  return r && r.status !== CLOSED;
}

/* ────────────────────────────── filtered collections ────────────────────────────── */

function filteredRisks(state, filters, now) {
  const f = normalizeFilters(filters);
  const at = resolveNow(filters, now);
  const p = period(at, f.range);
  return arr(state.risks).filter((r) => {
    if (!r || !matchesSite(r, f.siteId)) return false;
    if (!matchesEnum(r.categoryId, f.categoryId)) return false;
    if (!matchesEnum(r.status, f.status)) return false;
    if (!matchesEnum(riskTier(riskScore(r)), f.tier)) return false;
    // Closed risks fade out of the register after the selected range; open ones always show.
    if (r.status === CLOSED && !within(r.updatedAt || r.createdAt, p.fromMs, p.toMs)) return false;
    const cat = categoryOf(r.categoryId);
    return matchesSearch(
      [r.code, r.hazard, r.activity, r.owner, r.description, r.status, siteNameOf(state, r.siteId), cat && cat.name],
      f.search,
    );
  });
}

function filteredIncidents(state, filters, now) {
  const f = normalizeFilters(filters);
  const at = resolveNow(filters, now);
  const p = period(at, f.range);
  return arr(state.incidents).filter((i) => {
    if (!i || !matchesSite(i, f.siteId)) return false;
    if (!matchesEnum(i.type, f.type)) return false;
    if (!matchesEnum(i.status, f.status)) return false;
    if (!within(i.date, p.fromMs, p.toMs)) return false;
    return matchesSearch(
      [i.code, i.title, i.location, i.reporter, i.type, i.status, i.rootCause, siteNameOf(state, i.siteId)],
      f.search,
    );
  });
}

function filteredPermits(state, filters, now) {
  const f = normalizeFilters(filters);
  const at = resolveNow(filters, now);
  const p = period(at, f.range);
  return arr(state.permits).filter((pm) => {
    if (!pm || !matchesSite(pm, f.siteId)) return false;
    if (!matchesEnum(pm.type, f.type)) return false;
    if (!matchesEnum(pm.status, f.status)) return false;
    // Closed permits are kept for the selected range only; live ones always show.
    if (pm.status === CLOSED && !within(pm.expiresAt, p.fromMs, p.toMs)) return false;
    return matchesSearch(
      [pm.code, pm.type, pm.location, pm.requester, pm.approver, pm.status, siteNameOf(state, pm.siteId)],
      f.search,
    );
  });
}

function filteredInspections(state, filters, now) {
  const f = normalizeFilters(filters);
  const at = resolveNow(filters, now);
  const fromMs = addDays(startOfDay(at), -f.range).getTime();
  const toMs = endOfDay(addDays(at, f.range)).getTime();
  return arr(state.inspections).filter((ins) => {
    if (!ins || !matchesSite(ins, f.siteId)) return false;
    if (!matchesEnum(ins.type, f.type)) return false;
    if (!matchesEnum(ins.status, f.status)) return false;
    // Overdue inspections never fall out of view; others follow ±range around today.
    if (ins.status !== INSPECTION_OVERDUE && !within(ins.date, fromMs, toMs)) return false;
    return matchesSearch([ins.code, ins.type, ins.inspector, ins.status, siteNameOf(state, ins.siteId)], f.search);
  });
}

/* ────────────────────────────── training helpers ────────────────────────────── */

function workersFor(state, siteId) {
  return arr(state.workers).filter((w) => matchesSite(w, siteId));
}

/** Latest certificate a worker holds for a course, or null. */
function latestCert(worker, courseId) {
  let best = null;
  for (const cert of arr(worker && worker.certs)) {
    if (!cert || cert.courseId !== courseId) continue;
    if (!best || ms(cert.expiresAt) > ms(best.expiresAt)) best = cert;
  }
  return best;
}

/** 'valid' | 'expiring' | 'expired' | 'missing' as of `at`. */
function certStatus(cert, at) {
  if (!cert) return 'missing';
  const exp = ms(cert.expiresAt);
  const done = ms(cert.completedAt);
  const t = at.getTime();
  if (Number.isFinite(done) && done > t) return 'missing';     // not yet completed at that time
  if (!Number.isFinite(exp) || exp <= t) return 'expired';
  if (exp - t <= CERT_EXPIRING_DAYS * DAY_MS) return 'expiring';
  return 'valid';
}

function trainingComplianceAt(state, siteId, at) {
  const workers = workersFor(state, siteId);
  const mandatory = arr(state.courses).filter((c) => c && c.mandatory);
  const courses = mandatory.length ? mandatory : arr(state.courses);
  let total = 0;
  let ok = 0;
  for (const w of workers) {
    for (const c of courses) {
      total += 1;
      const s = certStatus(latestCert(w, c.id), at);
      if (s === 'valid' || s === 'expiring') ok += 1;
    }
  }
  return total ? (ok / total) * 100 : 100;
}

/* ────────────────────────────── metrics snapshot ────────────────────────────── */

/**
 * Compute every KPI "as of" `at`, treating only records dated on/before `at` as existing.
 * `isCurrent` switches stock metrics (active permits, open items) to use live status
 * instead of the time-window approximation used for past snapshots.
 */
function metricsAt(state, f, at, isCurrent) {
  const W = SAFETY_INDEX_WEIGHTS;
  const atEndMs = endOfDay(at).getTime();
  const atMs = at.getTime();
  const todayStartMs = startOfDay(at).getTime();
  const p = period(at, f.range);
  const p90 = period(at, 90);
  const p30 = period(at, 30);
  const sites = sitesFor(state, f.siteId);
  const workersCount = sites.reduce((sum, s) => sum + (Number(s.workers) || 0), 0)
    || workersFor(state, f.siteId).length;
  const hoursWorked = workersCount * HOURS_PER_WORKER_DAY * f.range;

  /* incidents */
  const incidents = arr(state.incidents).filter((i) => i && matchesSite(i, f.siteId) && ms(i.date) <= atEndMs);
  const inPeriod = incidents.filter((i) => within(i.date, p.fromMs, p.toMs));
  const lti = inPeriod.filter((i) => i.type === LTI_TYPE).length;
  const mtc = inPeriod.filter((i) => i.type === MTC_TYPE).length;
  const recordable = lti + mtc;
  const lti90 = incidents.filter((i) => i.type === LTI_TYPE && within(i.date, p90.fromMs, p90.toMs)).length;
  const mtc90 = incidents.filter((i) => i.type === MTC_TYPE && within(i.date, p90.fromMs, p90.toMs)).length;
  const nearMisses30d = incidents.filter((i) => i.type === NEAR_MISS_TYPE && within(i.date, p30.fromMs, p30.toMs)).length;
  const openIncidents = incidents.filter((i) => i.status !== CLOSED || (!isCurrent && ms(i.closedAt) > atMs)).length;

  let daysSinceLTI;
  const ltiDates = incidents.filter((i) => i.type === LTI_TYPE).map((i) => ms(i.date)).filter(Number.isFinite);
  if (ltiDates.length) {
    daysSinceLTI = Math.max(0, dayDiff(new Date(Math.max(...ltiDates)), at));
  } else {
    const all = incidents.map((i) => ms(i.date)).filter(Number.isFinite);
    daysSinceLTI = all.length ? Math.max(0, dayDiff(new Date(Math.min(...all)), at)) : 0;
  }

  /* corrective actions (CAPA) */
  let actionsTotal = 0;
  let actionsDone = 0;
  for (const i of incidents) {
    for (const a of arr(i.actions)) {
      if (!a) continue;
      actionsTotal += 1;
      const done = Boolean(a.done) && (isCurrent || !a.doneAt || ms(a.doneAt) <= atMs);
      if (done) actionsDone += 1;
    }
  }
  const capaClosure = actionsTotal ? Math.round((actionsDone / actionsTotal) * 100) : 100;

  /* risks */
  const risks = arr(state.risks).filter((r) => r && matchesSite(r, f.siteId) && (!r.createdAt || ms(r.createdAt) <= atEndMs));
  const openRisks = risks.filter(isOpenRisk);
  let criticalRisks = 0;
  let highRisks = 0;
  let overdueRisks = 0;
  for (const r of openRisks) {
    const tier = riskTier(riskScore(r));
    if (tier === 'حرج') criticalRisks += 1;
    else if (tier === 'عالٍ') highRisks += 1;
    if (Number.isFinite(ms(r.dueDate)) && ms(r.dueDate) < todayStartMs) overdueRisks += 1;
  }

  /* permits */
  const permits = arr(state.permits).filter((pm) => pm && matchesSite(pm, f.siteId));
  const activePermits = isCurrent
    ? permits.filter((pm) => pm.status === PERMIT_ACTIVE).length
    : permits.filter((pm) => ms(pm.startsAt) <= atMs && ms(pm.expiresAt) > atMs).length;

  /* inspections */
  const dueHorizonMs = endOfDay(addDays(at, INSPECTION_DUE_DAYS)).getTime();
  const inspections = arr(state.inspections).filter((ins) => ins && matchesSite(ins, f.siteId));
  const inspectionsDue = inspections.filter((ins) => {
    const t = ms(ins.date);
    if (isCurrent) {
      return ins.status === INSPECTION_OVERDUE
        || (ins.status === INSPECTION_SCHEDULED && t <= dueHorizonMs)
        || (ins.status !== INSPECTION_DONE && t < todayStartMs);
    }
    return (t >= todayStartMs && t <= dueHorizonMs) || (t < todayStartMs && ins.status === INSPECTION_OVERDUE);
  }).length;

  /* training */
  const trainingCompliance = Math.round(trainingComplianceAt(state, f.siteId, at));

  /* safety index */
  const raw = W.base
    - W.criticalOpen * criticalRisks
    - W.highOpen * highRisks
    - W.overdueOpen * overdueRisks
    - W.lti90 * lti90
    - W.mtc90 * mtc90
    - W.nearMiss30 * nearMisses30d
    + W.trainingPct * trainingCompliance;
  const safetyIndex = Math.round(clamp(raw, 0, 100));

  return {
    safetyIndex,
    ltifr: hoursWorked > 0 ? round((lti * LTIFR_BASE_HOURS) / hoursWorked, 2) : 0,
    trir: hoursWorked > 0 ? round((recordable * TRIR_BASE_HOURS) / hoursWorked, 2) : 0,
    daysSinceLTI,
    openIncidents,
    nearMisses30d,
    activePermits,
    criticalRisks,
    highRisks,
    overdueRisks,
    openRisks: openRisks.length,
    capaClosure,
    trainingCompliance,
    inspectionsDue,
    incidentsInPeriod: inPeriod.length,
    lti,
    recordable,
    lti90,
    mtc90,
    hoursWorked,
    workersCount,
    actionsTotal,
    actionsDone,
  };
}

const DELTA_KEYS = [
  'safetyIndex', 'ltifr', 'trir', 'daysSinceLTI', 'openIncidents', 'nearMisses30d', 'activePermits',
  'criticalRisks', 'highRisks', 'overdueRisks', 'openRisks', 'capaClosure', 'trainingCompliance',
  'inspectionsDue', 'incidentsInPeriod', 'lti', 'recordable',
];

/**
 * KPI bundle for the current period plus signed deltas against the previous period
 * of the same length (positive = increase; tiles decide which direction is good).
 */
function kpis(state, filters, now) {
  const f = normalizeFilters(filters);
  const at = resolveNow(filters, now);
  const current = metricsAt(state, f, at, true);
  const previous = metricsAt(state, f, addDays(at, -f.range), false);
  const deltas = {};
  for (const key of DELTA_KEYS) {
    const digits = key === 'ltifr' || key === 'trir' ? 2 : 0;
    deltas[key] = round((current[key] ?? 0) - (previous[key] ?? 0), digits);
  }
  const p = period(at, f.range);
  return {
    ...current,
    deltas,
    previous,
    period: { from: p.from.toISOString(), to: p.to.toISOString(), days: f.range },
  };
}

/* ────────────────────────────── matrices, trends, breakdowns ────────────────────────────── */

/** counts[severity-1][likelihood-1] over open risks matching the filters. */
function riskMatrix(state, filters, now) {
  const counts = Array.from({ length: 5 }, () => Array(5).fill(0));
  for (const r of filteredRisks(state, filters, now)) {
    if (!isOpenRisk(r)) continue;
    const s = clamp(Math.round(Number(r.severity) || 0), 1, 5);
    const l = clamp(Math.round(Number(r.likelihood) || 0), 1, 5);
    counts[s - 1][l - 1] += 1;
  }
  return counts;
}

/** Last `weeks` ISO weeks (oldest → newest) with incident vs near-miss counts. */
function incidentTrend(state, weeks = 12, filters, now) {
  const f = normalizeFilters(filters);
  const at = resolveNow(filters, now);
  const n = clamp(Math.round(Number(weeks) || 12), 1, 104);
  const thisMonday = mondayOf(at);
  const firstMonday = addDays(thisMonday, -7 * (n - 1));
  const firstMs = firstMonday.getTime();
  const buckets = Array.from({ length: n }, (_, i) => {
    const start = addDays(firstMonday, 7 * i);
    return {
      label: `أسبوع ${isoWeek(start)}`,
      week: isoWeek(start),
      start: `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}-${String(start.getDate()).padStart(2, '0')}`,
      incidents: 0,
      nearMisses: 0,
    };
  });
  for (const i of arr(state.incidents)) {
    if (!i || !matchesSite(i, f.siteId)) continue;
    const t = ms(i.date);
    if (!Number.isFinite(t) || t < firstMs) continue;
    const idx = Math.floor((startOfDay(new Date(t)).getTime() - firstMs) / (7 * DAY_MS));
    if (idx < 0 || idx >= n) continue;
    if (i.type === NEAR_MISS_TYPE) buckets[idx].nearMisses += 1;
    else buckets[idx].incidents += 1;
  }
  return buckets;
}

function incidentsByType(state, filters, now) {
  const list = filteredIncidents(state, filters, now);
  return arr(INCIDENT_TYPES).map((label, i) => ({
    id: INCIDENT_TYPE_IDS[i] || `type-${i}`,
    label,
    value: list.filter((inc) => inc.type === label).length,
  }));
}

function rootCausePareto(state, filters, now) {
  const counts = new Map();
  for (const i of filteredIncidents(state, filters, now)) {
    const cause = typeof i.rootCause === 'string' ? i.rootCause.trim() : '';
    if (!cause) continue;
    counts.set(cause, (counts.get(cause) || 0) + 1);
  }
  const total = Array.from(counts.values()).reduce((a, b) => a + b, 0);
  let running = 0;
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'ar'))
    .map(([label, value]) => {
      running += value;
      return { label, value, pct: pct(value, total), cumulativePct: total ? Math.round((running / total) * 100) : 0 };
    });
}

function permitsByStatus(state, filters, now) {
  const list = filteredPermits(state, filters, now);
  return arr(PERMIT_STATUS).map((label, i) => ({
    id: PERMIT_STATUS_IDS[i] || `status-${i}`,
    label,
    value: list.filter((pm) => pm.status === label).length,
  }));
}

/** Per-site safety index, 12-week trend and open counts. */
function siteScores(state, now) {
  const at = resolveNow(null, now);
  return arr(state.sites).map((site) => {
    const f = normalizeFilters({ siteId: site.id, range: 30 });
    const current = metricsAt(state, f, at, true);
    const trend = [];
    for (let w = 11; w >= 0; w -= 1) {
      const point = w === 0 ? current : metricsAt(state, f, addDays(at, -7 * w), false);
      trend.push(point.safetyIndex);
    }
    // Blend the computed per-site index with the site's audited safety score: the per-site
    // formula saturates near 100 for small sites, the blend keeps sites comparable.
    const audited = Number(site.safetyScore);
    const blend = (v) => (Number.isFinite(v) && Number.isFinite(audited)) ? Math.round(0.5 * v + 0.5 * audited) : (Number.isFinite(v) ? v : (audited || 0));
    const score = blend(current.safetyIndex);
    for (let i = 0; i < trend.length; i += 1) trend[i] = blend(trend[i]);
    return {
      site,
      score,
      trend,
      openRisks: current.openRisks,
      openIncidents: current.openIncidents,
      criticalRisks: current.criticalRisks,
      activePermits: current.activePermits,
      ltifr: current.ltifr,
      trainingCompliance: current.trainingCompliance,
    };
  });
}

/* ────────────────────────────── training ────────────────────────────── */

function trainingMatrix(state, siteId = 'all', now) {
  const at = resolveNow(null, now);
  const workers = workersFor(state, siteId);
  const courses = arr(state.courses);
  const summary = { valid: 0, expiring: 0, expired: 0, missing: 0 };
  const cells = workers.map((w) => courses.map((c) => {
    const status = certStatus(latestCert(w, c.id), at);
    summary[status] += 1;
    return status;
  }));
  return { workers, courses, cells, summary };
}

function trainingCompletionByCourse(state, filters, now) {
  const f = normalizeFilters(filters);
  const at = resolveNow(filters, now);
  const workers = workersFor(state, f.siteId);
  return arr(state.courses).map((c) => {
    let ok = 0;
    for (const w of workers) {
      const s = certStatus(latestCert(w, c.id), at);
      if (s === 'valid' || s === 'expiring') ok += 1;
    }
    return { id: c.id, label: c.name, pct: pct(ok, workers.length), mandatory: Boolean(c.mandatory), holders: ok, workers: workers.length };
  });
}

function certTone(daysLeft) {
  if (daysLeft <= 0) return 'critical';
  if (daysLeft <= 7) return 'critical';
  if (daysLeft <= 14) return 'serious';
  return 'warning';
}

/** Certificates expiring within `days` (not yet expired), soonest first. */
function expiringCerts(state, days = 60, filters, now) {
  const f = normalizeFilters(filters);
  const at = resolveNow(filters, now);
  const horizon = at.getTime() + Math.max(1, Number(days) || 60) * DAY_MS;
  const courses = new Map(arr(state.courses).map((c) => [c.id, c]));
  const out = [];
  for (const w of workersFor(state, f.siteId)) {
    for (const c of courses.values()) {
      const cert = latestCert(w, c.id);
      if (!cert) continue;
      const exp = ms(cert.expiresAt);
      if (!Number.isFinite(exp) || exp <= at.getTime() || exp > horizon) continue;
      const daysLeft = Math.max(0, dayDiff(at, new Date(exp)));
      out.push({ worker: w, course: c, expiresAt: cert.expiresAt, completedAt: cert.completedAt, daysLeft, tone: certTone(daysLeft), siteId: w.siteId });
    }
  }
  return out.sort((a, b) => ms(a.expiresAt) - ms(b.expiresAt) || String(a.worker.name).localeCompare(String(b.worker.name), 'ar'));
}

/* ────────────────────────────── ISO 45001 ────────────────────────────── */

function isoScores(state) {
  return arr(state.isoClauses).map((clause) => {
    const subs = arr(clause.subclauses);
    return {
      id: clause.id,
      title: clause.title,
      score: Math.round(mean(subs.map((s) => Number(s.score)))),
      gaps: subs.reduce((sum, s) => sum + arr(s.gaps).length, 0),
      subclauses: subs,
    };
  });
}

function isoOverall(state) {
  return Math.round(mean(isoScores(state).map((c) => c.score)));
}

/* ────────────────────────────── radar feeds ────────────────────────────── */

/**
 * Sweep-radar blips for open risks.
 * angle = category sector (30° each) centre + deterministic jitter (±10°) from the id hash
 * r     = 0.12 + 0.82 × (1 − score/25)  → critical risks sit near the centre
 */
function radarBlips(state, filters, now) {
  return filteredRisks(state, filters, now)
    .filter(isOpenRisk)
    .map((r) => {
      const score = riskScore(r);
      const tier = riskTier(score);
      const base = categoryIndex(r.categoryId) * 30 + 15;
      const angle = ((base + jitterFor(r.id)) % 360 + 360) % 360;
      return {
        id: r.id,
        code: r.code,
        label: r.hazard || r.activity || r.code,
        angle: round(angle, 2),
        r: round(0.12 + 0.82 * (1 - clamp(score, 0, 25) / 25), 4),
        tier,
        tone: tierTone(tier),
        score,
        siteId: r.siteId,
        categoryId: r.categoryId,
        status: r.status,
      };
    })
    .sort((a, b) => b.score - a.score);
}

/**
 * Fixed sensor-radar schema: every site shows the same six axes in the same order so the
 * polygons are comparable across sites. A site's sensors are matched to an axis by `kind`;
 * an axis without a sensor is returned with `missing: true` and `value: null` (the radar
 * draws a gap / "—"). Sensor kinds outside the schema (e.g. الاهتزاز) are appended after it.
 */
export const SENSOR_AXES = Object.freeze([
  { key: 'wind', label: 'الرياح', unit: 'كم/س', max: 80, threshold: 38, match: ['الرياح', 'wind'] },
  { key: 'noise', label: 'الضوضاء', unit: 'dB(A)', max: 110, threshold: 85, match: ['الضوضاء', 'noise'] },
  { key: 'pm25', label: 'الغبار PM2.5', unit: 'µg/m³', max: 150, threshold: 75, match: ['PM2.5', 'PM10', 'الغبار', 'dust'] },
  { key: 'gas', label: 'الغازات (H2S/CO)', unit: 'ppm', max: 50, threshold: 25, match: ['H2S', 'CO', 'غاز', 'gas'] },
  { key: 'heat', label: 'الحرارة/WBGT', unit: '°م', max: 40, threshold: 30, match: ['WBGT', 'الحرار', 'heat'] },
  { key: 'oxygen', label: 'الأكسجين O₂', unit: '%', max: 25, threshold: 23.5, match: ['الأكسجين', 'O₂', 'O2', 'oxygen'] },
].map((a) => Object.freeze(a)));

function axisKeyFor(sensor) {
  const kind = String((sensor && sensor.kind) || '');
  const code = String((sensor && sensor.code) || '');
  for (const axis of SENSOR_AXES) {
    if (axis.match.some((needle) => kind.includes(needle) || code.toUpperCase().includes(`-${needle.toUpperCase()}-`))) return axis.key;
  }
  return null;
}

function axisFromSensor(s, key) {
  const schema = SENSOR_AXES.find((a) => a.key === key) || null;
  const max = Number(s.max) || (schema ? schema.max : 1);
  const value = Number.isFinite(Number(s.value)) ? Number(s.value) : 0;
  const threshold = Number(s.threshold) || (schema ? schema.threshold : max);
  return {
    id: s.id,
    key: key || 'other',
    label: schema ? schema.label : s.kind,
    kind: s.kind,
    code: s.code ?? null,
    unit: s.unit || (schema ? schema.unit : ''),
    min: Number(s.min) || 0,
    max,
    threshold,
    lowThreshold: Number.isFinite(Number(s.lowThreshold)) ? Number(s.lowThreshold) : null,
    value,
    pct: Math.round(clamp((value / max) * 100, 0, 100)),
    over: value > threshold,
    missing: false,
    siteId: s.siteId,
    zoneId: s.zoneId ?? null,
  };
}

function missingAxis(schema, siteId) {
  return {
    id: `${siteId}:axis:${schema.key}`,
    key: schema.key,
    label: schema.label,
    kind: null,
    code: null,
    unit: schema.unit,
    min: 0,
    max: schema.max,
    threshold: schema.threshold,
    lowThreshold: null,
    value: null,
    pct: null,
    over: false,
    missing: true,
    siteId,
    zoneId: null,
  };
}

/**
 * Sensor axes for the SensorRadar — fixed six-axis schema per site (see SENSOR_AXES), missing
 * axes marked `missing: true` with `value: null`. 'all' (or an unknown site) falls back to the
 * first site that has sensors, as before. Return shape stays compatible with
 * live.getSensorValues() (same order, same ids) and the radar view.
 */
function sensorAxes(state, siteId = 'all') {
  const sensors = arr(state.sensors).filter((s) => s && s.id != null);
  const knownSite = siteId && siteId !== 'all' && arr(state.sites).some((s) => s && s.id === siteId);
  let target = knownSite ? siteId : null;
  if (!target) {
    const first = sensors.find((s) => s.siteId);
    target = first ? first.siteId : (arr(state.sites)[0] ? arr(state.sites)[0].id : siteId);
  }
  const list = sensors.filter((s) => s.siteId === target);
  const used = new Set();
  const out = SENSOR_AXES.map((schema) => {
    const sensor = list.find((s) => !used.has(s.id) && axisKeyFor(s) === schema.key);
    if (!sensor) return missingAxis(schema, target);
    used.add(sensor.id);
    return axisFromSensor(sensor, schema.key);
  });
  for (const s of list) if (!used.has(s.id)) out.push(axisFromSensor(s, null));
  return out;
}

/* ────────────────────────────── urgent actions ────────────────────────────── */

function urgentActions(state, now, { limit = Infinity, siteId = 'all' } = {}) {
  const at = resolveNow(null, now);
  const atMs = at.getTime();
  const todayStartMs = startOfDay(at).getTime();
  const out = [];

  for (const r of arr(state.risks)) {
    if (!isOpenRisk(r) || !matchesSite(r, siteId)) continue;
    const due = ms(r.dueDate);
    if (!Number.isFinite(due) || due >= todayStartMs) continue;
    const tier = riskTier(riskScore(r));
    out.push({
      kind: 'risk', id: r.id, code: r.code, siteId: r.siteId,
      text: `مخاطرة ${r.code} تجاوزت موعد المعالجة — ${r.hazard || r.activity}`,
      due: r.dueDate,
      tone: tier === 'حرج' ? 'critical' : 'serious',
      href: `#/risks?id=${encodeURIComponent(r.id)}`,
    });
  }

  for (const i of arr(state.incidents)) {
    if (!i || i.status === CLOSED || !matchesSite(i, siteId)) continue;
    if ((Number(i.severity) || 0) < 4) continue;
    out.push({
      kind: 'incident', id: i.id, code: i.code, siteId: i.siteId,
      text: `حادث ${i.code} عالي الخطورة ما زال «${i.status}» — ${i.title}`,
      due: i.date,
      tone: 'critical',
      href: `#/incidents?id=${encodeURIComponent(i.id)}`,
    });
  }

  const permitHorizon = atMs + PERMIT_EXPIRING_MINUTES * MINUTE_MS;
  for (const pm of arr(state.permits)) {
    if (!pm || pm.status !== PERMIT_ACTIVE || !matchesSite(pm, siteId)) continue;
    const exp = ms(pm.expiresAt);
    if (!Number.isFinite(exp) || exp > permitHorizon) continue;
    const expired = exp <= atMs;
    out.push({
      kind: 'permit', id: pm.id, code: pm.code, siteId: pm.siteId,
      text: expired
        ? `تصريح ${pm.code} (${pm.type}) انتهت صلاحيته وما زال نشطاً — ${pm.location}`
        : `تصريح ${pm.code} (${pm.type}) يقترب من الانتهاء — ${pm.location}`,
      due: pm.expiresAt,
      tone: expired ? 'critical' : 'warning',
      href: `#/permits?id=${encodeURIComponent(pm.id)}`,
    });
  }

  for (const ins of arr(state.inspections)) {
    if (!ins || !matchesSite(ins, siteId)) continue;
    const t = ms(ins.date);
    const overdue = ins.status === INSPECTION_OVERDUE || (ins.status === INSPECTION_SCHEDULED && Number.isFinite(t) && t < todayStartMs);
    if (!overdue) continue;
    out.push({
      kind: 'inspection', id: ins.id, code: ins.code, siteId: ins.siteId,
      text: `${ins.type} ${ins.code} متأخر عن موعده — ${siteNameOf(state, ins.siteId)}`,
      due: ins.date,
      tone: 'serious',
      href: `#/inspections?id=${encodeURIComponent(ins.id)}`,
    });
  }

  for (const item of expiringCerts(state, 14, { siteId }, at)) {
    out.push({
      kind: 'cert', id: item.worker.id, code: item.course.id, siteId: item.worker.siteId,
      text: `شهادة «${item.course.name}» للعامل ${item.worker.name} تنتهي قريباً`,
      due: item.expiresAt,
      tone: item.tone === 'critical' ? 'serious' : 'warning',
      href: `#/training?worker=${encodeURIComponent(item.worker.id)}`,
    });
  }

  out.sort((a, b) => {
    const rank = (TONE_RANK[a.tone] ?? 9) - (TONE_RANK[b.tone] ?? 9);
    if (rank !== 0) return rank;
    return (ms(a.due) || 0) - (ms(b.due) || 0);
  });
  return Number.isFinite(limit) ? out.slice(0, Math.max(0, limit)) : out;
}

/* ────────────────────────────── convenience selectors ────────────────────────────── */

function siteById(state, id) {
  return arr(state.sites).find((s) => s.id === id) || null;
}

function categoryById(id) {
  return categoryOf(id);
}

function permitsExpiringSoon(state, minutes = PERMIT_EXPIRING_MINUTES, filters, now) {
  const f = normalizeFilters(filters);
  const at = resolveNow(filters, now);
  const horizon = at.getTime() + Math.max(1, Number(minutes) || PERMIT_EXPIRING_MINUTES) * MINUTE_MS;
  return arr(state.permits)
    .filter((pm) => pm && pm.status === PERMIT_ACTIVE && matchesSite(pm, f.siteId))
    .filter((pm) => {
      const exp = ms(pm.expiresAt);
      return Number.isFinite(exp) && exp > at.getTime() && exp <= horizon;
    })
    .sort((a, b) => ms(a.expiresAt) - ms(b.expiresAt));
}

function integrationSummary(state) {
  const list = arr(state.integrations);
  const by = (status) => list.filter((g) => g && g.status === status).length;
  const connected = list.filter((g) => g && g.status === 'connected');
  return {
    total: list.length,
    connected: connected.length,
    degraded: by('degraded'),
    disconnected: by('disconnected'),
    configurable: by('configurable'),
    eventsPerHour: connected.reduce((sum, g) => sum + (Number(g.eventsPerHour) || 0), 0),
    meanLatencyMs: Math.round(mean(connected.map((g) => Number(g.latencyMs)))),
  };
}

function inspectionCompletionBySite(state, filters, now) {
  const list = filteredInspections(state, filters, now);
  return arr(state.sites).map((site) => {
    const mine = list.filter((ins) => ins.siteId === site.id);
    const done = mine.filter((ins) => ins.status === INSPECTION_DONE).length;
    return { id: site.id, label: site.name, value: pct(done, mine.length), done, total: mine.length };
  });
}

function findingsSummary(state, filters, now) {
  let open = 0;
  let closed = 0;
  const bySeverity = {};
  for (const ins of filteredInspections(state, filters, now)) {
    for (const fnd of arr(ins.findings)) {
      if (!fnd) continue;
      if (fnd.status === FINDING_OPEN) open += 1; else closed += 1;
      const sev = fnd.severity || 'غير محدد';
      bySeverity[sev] = (bySeverity[sev] || 0) + 1;
    }
  }
  return { open, closed, total: open + closed, bySeverity };
}

/** Feed statistics for the radar telemetry strip ("التنبيهات آخر ساعة"). */
function feedStats(state, hours = 1, now) {
  const at = resolveNow(null, now);
  const fromMs = at.getTime() - Math.max(0.01, Number(hours) || 1) * HOUR_MS;
  const recent = arr(state.feed).filter((ev) => ev && ms(ev.ts) >= fromMs);
  const byTone = {};
  const byType = {};
  for (const ev of recent) {
    byTone[ev.tone] = (byTone[ev.tone] || 0) + 1;
    byType[ev.type] = (byType[ev.type] || 0) + 1;
  }
  return {
    total: recent.length,
    alerts: recent.filter((ev) => ev.tone === 'critical' || ev.tone === 'serious').length,
    byTone,
    byType,
  };
}

/** Risk counts per hazard category (ranked), over filtered open risks. */
function risksByCategory(state, filters, now) {
  const counts = new Map();
  for (const r of filteredRisks(state, filters, now)) {
    if (!isOpenRisk(r)) continue;
    counts.set(r.categoryId, (counts.get(r.categoryId) || 0) + 1);
  }
  return arr(CATEGORIES)
    .map((c) => ({ id: c.id, label: c.name, icon: c.icon, value: counts.get(c.id) || 0 }))
    .filter((c) => c.value > 0)
    .sort((a, b) => b.value - a.value);
}

export const sel = {
  // scoring
  riskScore,
  residualScore,
  riskTier,
  tierTone,
  // filtered collections
  filteredRisks,
  filteredIncidents,
  filteredPermits,
  filteredInspections,
  // KPIs and breakdowns
  kpis,
  riskMatrix,
  incidentTrend,
  incidentsByType,
  rootCausePareto,
  permitsByStatus,
  siteScores,
  // training
  trainingMatrix,
  trainingCompletionByCourse,
  expiringCerts,
  // compliance
  isoScores,
  isoOverall,
  // radars
  radarBlips,
  sensorAxes,
  // actions
  urgentActions,
  // convenience
  siteById,
  categoryById,
  permitsExpiringSoon,
  integrationSummary,
  inspectionCompletionBySite,
  findingsSummary,
  feedStats,
  risksByCategory,
  // helpers exposed for tests/tooling
  isoWeek,
  dayDiff,
};

export default sel;
