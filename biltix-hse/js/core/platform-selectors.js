/**
 * Biltix Risk AI — platform selectors (js/core/platform-selectors.js)
 *
 * Pure derived-data functions for the AI Risk Management Platform (Part B).
 * No DOM, no store mutation. Every function takes `state` (+ optional
 * `filters`, optional `now`) and returns plain data for the views.
 *
 * Contract: ARCHITECTURE.md §B2 (classification rules — defined ONCE here) and
 * §B4 (`psel`). Shapes consumed: `state.platform` (platform-seed.js),
 * `state.sites` (Part A seed), `state.settings.platform` (weights, thresholds)
 * and the global filters `{ siteId:'all'|id, range:7|30|90, search }`.
 *
 * Classification (B2):
 *   rating: red ≥ 70 · yellow 40–69 · green < 40
 *   category score = round(0.5 × max(open) + 0.5 × mean(open)), 0 when none
 *   consolidated   = Σ weight × category score (weights sum to 1)
 *
 * Everything is defensive: a missing `state.platform` yields empty structures
 * (never undefined, never NaN).
 */

import { fmt } from './fmt.js';
import { dataEn, personEn, enumEn } from '../data/vocab-en.js';
import {
  PLATFORM_CATEGORIES, RISK_TYPES, RATINGS, TASK_STATUS, STAKEHOLDER_ROLES, FLOW_STAGES,
  PIPELINE_META, DEFAULT_WEIGHTS, deriveDataQuality,
} from '../data/platform-seed.js';

const DAY_MS = 86_400_000;
const WEEKS = 12;

export const RATING_THRESHOLDS = Object.freeze({ red: 70, yellow: 40 });
export const DEFAULT_ALERT_THRESHOLD = 60;
export const DEFAULT_CRITICAL_THRESHOLD = 85;
export const CATEGORY_IDS = Object.freeze(PLATFORM_CATEGORIES.map((c) => c.id));

/** Status literals from the data contract (§B3). */
const RISK_CLOSED = 'مغلق';
const RISK_DISMISSED = 'مُتجاوز';
const RISK_ALERTED = 'تنبيه';
const RISK_TASKED = 'مهمة مُسندة';
const RISK_IN_PROGRESS = 'قيد المعالجة';
const TASK_CLOSED = 'مغلقة';
const TASK_OVERDUE = 'متأخرة';
const APPROVAL_LATE = 'متأخر';
const OBLIGATION_DONE = 'منجز';
const OBLIGATION_LATE = 'متأخر';

const MONTHS_AR = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];

const EMPTY_PLATFORM = Object.freeze({
  projects: [], contracts: [], suppliers: [], commodities: [], boqItems: [], scheduleTasks: [], monteCarlo: {},
  resources: [], approvals: [], subcontractors: [], weather: {}, costLines: [], changeOrders: [], currencies: [],
  labourIndex: [], aiRisks: [], tasks: [], alerts: [], pipelines: [], validation: { sources: [], rules: [], quarantine: [] },
  connectors: [], auditLog: [], roadmap: { scopeItems: [], assumptions: [], outOfScope: [], milestones: [], paymentNote: '' },
});

/* ────────────────────────────── primitives ────────────────────────────── */

function arr(v) {
  return Array.isArray(v) ? v : [];
}

function obj(v) {
  return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
}

function num(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function clamp(n, min, max) {
  return Math.min(max, Math.max(min, n));
}

function round(n, digits = 0) {
  const f = 10 ** digits;
  return Math.round((num(n) + Number.EPSILON) * f) / f;
}

function mean(values) {
  const list = values.filter((v) => Number.isFinite(v));
  return list.length ? list.reduce((a, b) => a + b, 0) / list.length : 0;
}

function max(values) {
  const list = values.filter((v) => Number.isFinite(v));
  return list.length ? Math.max(...list) : 0;
}

function sum(values) {
  return values.reduce((a, b) => a + num(b), 0);
}

function pct(part, total, digits = 0) {
  return total > 0 ? round((part / total) * 100, digits) : 0;
}

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

/** Whole calendar days from `a` to `b` (positive when b is later); 0 when either is invalid. */
function dayDiff(a, b) {
  const da = toDate(a);
  const db = toDate(b);
  if (!da || !db) return 0;
  return Math.round((startOfDay(db).getTime() - startOfDay(da).getTime()) / DAY_MS);
}

function resolveNow(filters, now) {
  return toDate(now) || toDate(filters && filters.now) || new Date();
}

function within(value, fromMs, toMs) {
  const v = ms(value);
  return Number.isFinite(v) && v >= fromMs && v <= toMs;
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

/** FNV-1a 32-bit hash → deterministic value in [-spread, +spread]. */
function jitter(key, spread = 2) {
  const s = String(key ?? '');
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return ((h % 20_001) / 20_000) * 2 * spread - spread;
}

function normalizeFilters(filters) {
  const f = filters && typeof filters === 'object' ? filters : {};
  const range = Number(f.range);
  const siteId = typeof f.siteId === 'string' && f.siteId ? f.siteId : (typeof f.projectId === 'string' && f.projectId ? f.projectId : 'all');
  return {
    ...f,
    siteId,
    range: Number.isFinite(range) && range > 0 ? Math.round(range) : 30,
    search: typeof f.search === 'string' ? f.search : '',
  };
}

function matchesProject(item, siteId) {
  return siteId === 'all' || !siteId || (item && (item.projectId === siteId || item.siteId === siteId));
}

function matchesEnum(value, filterValue) {
  return filterValue == null || filterValue === '' || filterValue === 'all' || value === filterValue;
}

/** Arabic day-count phrase: 1 يوم · 2 يومان · 3–10 أيام · 11+ يوماً. */
function daysLabel(n) {
  const v = Math.abs(Math.round(num(n)));
  const sign = num(n) < 0 ? '−' : '';
  if (v === 0) return '0 يوم';
  if (v === 1) return `${sign}يوم واحد`;
  if (v === 2) return `${sign}يومان`;
  if (v <= 10) return `${sign}${fmt.num(v)} أيام`;
  return `${sign}${fmt.num(v)} يوماً`;
}

function sarLabel(n) {
  const v = num(n);
  if (v === 0) return '0 ريال';
  return `${fmt.compact(v)} ريال`;
}

function monthLabel(ym) {
  const m = /^(\d{4})-(\d{2})/.exec(String(ym || ''));
  if (!m) return String(ym || '—');
  const mi = clamp(Number(m[2]) - 1, 0, 11);
  return `${MONTHS_AR[mi]} ${m[1]}`;
}

/* ────────────────────────────── accessors ────────────────────────────── */

function platform(state) {
  const p = state && state.platform;
  return p && typeof p === 'object' ? p : EMPTY_PLATFORM;
}

function settingsPlatform(state) {
  return obj(state && state.settings && state.settings.platform);
}

function thresholds(state) {
  const s = settingsPlatform(state);
  const alertThreshold = clamp(num(s.alertThreshold, DEFAULT_ALERT_THRESHOLD), 0, 100);
  const criticalThreshold = clamp(num(s.criticalThreshold, DEFAULT_CRITICAL_THRESHOLD), alertThreshold, 100);
  return { alertThreshold, criticalThreshold };
}

/** Weights from settings when valid (5 numeric ≥ 0 summing to ~1); else the defaults. Always normalised to sum 1. */
function weights(state) {
  const s = settingsPlatform(state);
  const w = obj(s.weights);
  const candidate = {};
  let ok = true;
  for (const id of CATEGORY_IDS) {
    const v = Number(w[id]);
    if (!Number.isFinite(v) || v < 0) { ok = false; break; }
    candidate[id] = v;
  }
  const total = ok ? sum(Object.values(candidate)) : 0;
  const base = ok && total > 0 && Math.abs(total - 1) <= 0.02 ? candidate : { ...DEFAULT_WEIGHTS };
  const t = sum(Object.values(base)) || 1;
  const out = {};
  for (const id of CATEGORY_IDS) out[id] = num(base[id]) / t;
  return out;
}

function siteNameOf(state, siteId) {
  const site = arr(state && state.sites).find((s) => s.id === siteId);
  return site ? site.name : '';
}

function siteById(state, id) {
  return arr(state && state.sites).find((s) => s.id === id) || null;
}

function projectById(state, id) {
  return arr(platform(state).projects).find((p) => p.id === id) || null;
}

/** Project row = Part A site (name, city, …) merged with Part B project (budget, EVM, …). */
function projectRows(state) {
  const sites = arr(state && state.sites);
  const projects = arr(platform(state).projects);
  const ids = sites.length ? sites.map((s) => s.id) : projects.map((p) => p.id);
  return ids.map((id) => {
    const site = sites.find((s) => s.id === id) || { id, name: id, code: id };
    const project = projects.find((p) => p.id === id) || {};
    return { ...site, ...project, id, site, project };
  });
}

function riskById(state, id) {
  return arr(platform(state).aiRisks).find((r) => r.id === id || r.code === id) || null;
}

function taskById(state, id) {
  return arr(platform(state).tasks).find((t) => t.id === id || t.code === id) || null;
}

function contractById(state, id) {
  return arr(platform(state).contracts).find((c) => c.id === id || c.code === id) || null;
}

function supplierById(state, id) {
  return arr(platform(state).suppliers).find((s) => s.id === id) || null;
}

function subcontractorById(state, id) {
  return arr(platform(state).subcontractors).find((s) => s.id === id) || null;
}

/* ────────────────────────────── classification (B2) ────────────────────────────── */

function rating(score) {
  const s = num(score);
  if (s >= RATING_THRESHOLDS.red) return 'red';
  if (s >= RATING_THRESHOLDS.yellow) return 'yellow';
  return 'green';
}

function ratingTone(r) {
  const row = RATINGS.find((x) => x.id === r);
  return row ? row.tone : 'neutral';
}

/**
 * Rating name ('أحمر' / 'أصفر' / 'أخضر').
 * Arabic display text — views must use i18n.label/t instead (e.g. i18n.label('rating', id)).
 */
function ratingLabel(r) {
  const row = RATINGS.find((x) => x.id === r);
  return row ? row.name : '—';
}

function ratingHint(r) {
  const row = RATINGS.find((x) => x.id === r);
  return row ? row.hint : '';
}

/**
 * Risk type name (Financial / Safety / Delay / Conflict → Arabic).
 * Arabic display text — views must use i18n.label/t instead (i18n.label('aiType', type)).
 */
function typeLabel(type) {
  const row = RISK_TYPES.find((x) => x.id === type);
  return row ? row.name : String(type || '—');
}

/**
 * Risk category (domain) name.
 * Arabic display text — views must use i18n.label/t instead (i18n.label('aiCategory', cat)).
 */
function categoryLabel(cat) {
  const row = PLATFORM_CATEGORIES.find((x) => x.id === cat);
  return row ? row.name : String(cat || '—');
}

function categoryIcon(cat) {
  const row = PLATFORM_CATEGORIES.find((x) => x.id === cat);
  return row ? row.icon : 'shield-alert';
}

function categoryOfPipeline(pipelineId) {
  const row = PLATFORM_CATEGORIES.find((x) => x.pipeline === pipelineId);
  return row ? row.id : null;
}

/**
 * Pipeline (engine) name — the Arabic `nameAr`.
 * Arabic display text — views must use i18n.label/t instead (i18n.label('pipeline', id)).
 */
function pipelineLabel(id) {
  const meta = PIPELINE_META[id];
  return meta ? meta.nameAr : String(id || '—');
}

function statusTone(status) {
  switch (status) {
    case RISK_ALERTED: return 'critical';
    case RISK_TASKED: return 'brand';
    case RISK_IN_PROGRESS: return 'warning';
    case RISK_CLOSED: return 'good';
    case RISK_DISMISSED: return 'neutral';
    default: return 'accent';
  }
}

function isOpenRisk(r) {
  return !!r && r.status !== RISK_CLOSED && r.status !== RISK_DISMISSED;
}

/** B2 category score over a list of (open) scores. */
function categoryScoreOf(scores) {
  const list = arr(scores).map((s) => num(s)).filter((s) => Number.isFinite(s));
  if (!list.length) return 0;
  return clamp(Math.round(0.5 * max(list) + 0.5 * mean(list)), 0, 100);
}

/* ────────────────────────────── filtered collections ────────────────────────────── */

/**
 * The ONE filtered AI-risk list every cockpit section, register, report and export derives from.
 * Global filters: siteId (project), range (closed/dismissed risks fade out after it), search. Optional
 * register filters (all no-ops when absent): category (alias `domain`), type, rating, status, pipeline,
 * owner, l / likelihood and i / impact (inherent position — or residual when `view: 'residual'`),
 * overdue (true → open risks past their due date).
 */
function filteredAiRisks(state, filters, now) {
  const f = normalizeFilters(filters);
  const at = resolveNow(filters, now);
  const fromMs = addDays(startOfDay(at), -(f.range - 1)).getTime();
  const toMs = endOfDay(at).getTime();
  const todayMs = startOfDay(at).getTime();
  const category = f.category != null && f.category !== '' ? f.category : f.domain;
  const residualView = f.view === 'residual' || f.residual === true || f.residual === 'true';
  const lWant = f.l != null && f.l !== '' && f.l !== 'all' ? num(f.l, NaN) : (f.likelihood != null && f.likelihood !== '' && f.likelihood !== 'all' ? num(f.likelihood, NaN) : NaN);
  const iWant = f.i != null && f.i !== '' && f.i !== 'all' ? num(f.i, NaN) : (f.impact != null && f.impact !== '' && f.impact !== 'all' ? num(f.impact, NaN) : NaN);
  return arr(platform(state).aiRisks).filter((r) => {
    if (!r || !matchesProject(r, f.siteId)) return false;
    if (!matchesEnum(r.category, category)) return false;
    if (f.owner && f.owner !== 'all' && r.owner !== f.owner) return false;
    if (Number.isFinite(lWant) && num(residualView ? r.residualLikelihood : r.likelihood, NaN) !== lWant) return false;
    if (Number.isFinite(iWant) && num(residualView ? r.residualImpact : r.impact, NaN) !== iWant) return false;
    if ((f.overdue === true || f.overdue === 'true' || f.overdue === '1') && !isAiRiskOverdue(r, todayMs)) return false;
    if (!matchesEnum(r.type, f.type)) return false;
    if (!matchesEnum(rating(r.score), f.rating)) return false;
    if (!matchesEnum(r.status, f.status)) return false;
    if (!matchesEnum(r.pipeline, f.pipeline)) return false;
    // Closed / dismissed risks fade out of the register after the selected range; open ones always show.
    if (!isOpenRisk(r) && !within(r.updatedAt || r.detectedAt, fromMs, toMs)) return false;
    // Bilingual search: the Arabic record plus its English mirror (empty until the English dictionaries
    // are loaded, which happens in every English session) — an English query finds English titles and owners.
    return matchesSearch(
      [r.code, r.title, r.owner, r.status, r.driverExplanation, typeLabel(r.type), categoryLabel(r.category),
        pipelineLabel(r.pipeline), siteNameOf(state, r.projectId), r.evidence && r.evidence.ref,
        r.titleEn, dataEn('aiRisks', r.id, 'title'), dataEn('aiRisks', r.id, 'driverExplanation'), personEn(r.owner),
        enumEn('aiRiskStatus', r.status, ''), enumEn('aiType', r.type, ''), enumEn('aiCategory', r.category, ''),
        enumEn('pipeline', r.pipeline, '')],
      f.search,
    );
  });
}

function openAiRisks(state, filters, now) {
  return filteredAiRisks(state, filters, now).filter(isOpenRisk);
}

/** Risks sorted by score desc (ties: newest first). */
function rankedOpenRisks(state, filters, now, limit = 10) {
  return openAiRisks(state, filters, now)
    .slice()
    .sort((a, b) => num(b.score) - num(a.score) || ms(b.detectedAt) - ms(a.detectedAt))
    .slice(0, limit > 0 ? limit : undefined);
}

/* ────────────────────────────── trends (12 weeks, deterministic) ────────────────────────────── */

/** End-of-day timestamps for the last 12 weeks; index 11 = now. */
function weekEnds(at) {
  const ends = [];
  for (let i = WEEKS - 1; i >= 0; i -= 1) ends.push(endOfDay(addDays(at, -7 * i)).getTime());
  return ends;
}

/** Risk was "open as of" `atMs`: detected by then and not yet closed/dismissed by then. */
function openAsOf(r, atMs) {
  const det = ms(r.detectedAt);
  if (!Number.isFinite(det) || det > atMs) return false;
  if (isOpenRisk(r)) return true;
  const upd = ms(r.closedAt || r.updatedAt || r.detectedAt);
  return Number.isFinite(upd) ? upd > atMs : false;
}

/**
 * 12-week category trend (deterministic pseudo-history). For every week the B2 formula is
 * applied to the risks open at that time; where the history is sparse (fewer risks than today)
 * the value is blended toward a smooth ramp to the current score, weighted by how complete
 * the week's history is, so the sparkline is never a flat zero line nor dominated by a single
 * early detection. The last point is always the current score.
 */
function categoryTrend(risks, currentScore, currentOpen, ends, seedKey) {
  const out = [];
  const last = ends.length - 1;
  for (let i = 0; i < ends.length; i += 1) {
    const open = risks.filter((r) => openAsOf(r, ends[i]));
    const real = open.length ? categoryScoreOf(open.map((r) => r.score)) : 0;
    const ramp = currentScore > 0 ? clamp(currentScore * (0.72 + 0.28 * (i / Math.max(last, 1))) + jitter(`${seedKey}:${i}`, 2.5), 0, 100) : 0;
    const frac = currentOpen > 0 ? clamp(open.length / currentOpen, 0, 1) : (open.length ? 1 : 0);
    out.push(clamp(Math.round(frac * real + (1 - frac) * ramp), 0, 100));
  }
  if (out.length) out[last] = currentScore;
  return out;
}

function categoryScores(state, filters, now) {
  const at = resolveNow(filters, now);
  const ends = weekEnds(at);
  const open = openAiRisks(state, filters, now);
  const all = filteredAiRisks(state, { ...normalizeFilters(filters), range: 3650 }, now); // closed ones needed for history
  return PLATFORM_CATEGORIES.map((c) => {
    const openCat = open.filter((r) => r.category === c.id);
    const score = categoryScoreOf(openCat.map((r) => r.score));
    const r = rating(score);
    return {
      category: c.id,
      label: c.name,
      icon: c.icon,
      pipeline: c.pipeline,
      score,
      rating: r,
      tone: ratingTone(r),
      open: openCat.length,
      red: openCat.filter((x) => rating(x.score) === 'red').length,
      yellow: openCat.filter((x) => rating(x.score) === 'yellow').length,
      green: openCat.filter((x) => rating(x.score) === 'green').length,
      trend: categoryTrend(all.filter((x) => x.category === c.id), score, openCat.length, ends, c.id),
    };
  });
}

function consolidatedScore(state, filters, now) {
  const f = normalizeFilters(filters);
  const w = weights(state);
  const cats = categoryScores(state, filters, now);
  const score = clamp(Math.round(sum(cats.map((c) => w[c.category] * c.score))), 0, 100);
  const trend = [];
  for (let i = 0; i < WEEKS; i += 1) trend.push(clamp(Math.round(sum(cats.map((c) => w[c.category] * num(c.trend[i])))), 0, 100));
  if (trend.length) trend[trend.length - 1] = score;
  const back = clamp(WEEKS - 1 - Math.max(1, Math.round(f.range / 7)), 0, WEEKS - 2);
  const previous = trend[back];
  const r = rating(score);
  return {
    score,
    rating: r,
    tone: ratingTone(r),
    label: ratingLabel(r),
    hint: ratingHint(r),
    delta: score - num(previous),
    previous: num(previous),
    trend,
    weights: w,
    categories: cats,
  };
}

function typeDistribution(state, filters, now) {
  const open = openAiRisks(state, filters, now);
  return RISK_TYPES.map((t) => ({ type: t.id, label: t.name, value: open.filter((r) => r.type === t.id).length }));
}

function ratingDistribution(state, filters, now) {
  const open = openAiRisks(state, filters, now);
  return RATINGS.map((r) => ({ rating: r.id, label: r.name, tone: r.tone, value: open.filter((x) => rating(x.score) === r.id).length }));
}

/** Per-project consolidated view for the cockpit table. */
function projectScores(state, filters, now) {
  const f = normalizeFilters(filters);
  return projectRows(state)
    .filter((p) => f.siteId === 'all' || p.id === f.siteId)
    .map((p) => {
      const pf = { ...f, siteId: p.id };
      const cons = consolidatedScore(state, pf, now);
      const open = openAiRisks(state, pf, now);
      const e = obj(p.evm);
      return {
        project: p,
        id: p.id,
        name: p.name,
        score: cons.score,
        rating: cons.rating,
        tone: cons.tone,
        delta: cons.delta,
        trend: cons.trend,
        open: open.length,
        red: open.filter((r) => rating(r.score) === 'red').length,
        yellow: open.filter((r) => rating(r.score) === 'yellow').length,
        cpi: num(e.CPI, 1),
        spi: num(e.SPI, 1),
        percentComplete: num(p.percentComplete),
        plannedPercent: num(p.plannedPercent),
        forecastFinish: p.forecastFinish || null,
        plannedFinish: p.plannedFinish || null,
        slipDays: dayDiff(p.plannedFinish, p.forecastFinish),
        nextMilestone: p.nextMilestone || null,
      };
    })
    .sort((a, b) => b.score - a.score);
}

function topProjectsByRed(state, filters, now, limit = 6) {
  return projectScores(state, { ...normalizeFilters(filters), siteId: 'all' }, now)
    .map((p) => ({ id: p.id, label: p.name, value: p.red, score: p.score }))
    .sort((a, b) => b.value - a.value || b.score - a.score)
    .slice(0, limit);
}

/* ────────────────────────────── alerts & tasks ────────────────────────────── */

function enrichAlert(state, a) {
  const risk = riskById(state, a.riskId);
  const r = risk ? rating(risk.score) : (a.severity === 'critical' ? 'red' : 'yellow');
  return { ...a, risk, riskCode: risk ? risk.code : a.riskId, score: risk ? risk.score : null, rating: r, tone: a.severity === 'critical' ? 'critical' : ratingTone(r), projectName: siteNameOf(state, a.projectId) };
}

function alertOrder(a, b) {
  if (!!a.acknowledged !== !!b.acknowledged) return a.acknowledged ? 1 : -1;
  return num(ms(b.sentAt)) - num(ms(a.sentAt));
}

function alertQueue(state, filters) {
  const f = normalizeFilters(filters);
  const list = arr(platform(state).alerts).filter((a) => a && matchesProject(a, f.siteId)).map((a) => enrichAlert(state, a)).sort(alertOrder);
  return {
    immediate: list.filter((a) => a.queue === 'immediate'),
    standard: list.filter((a) => a.queue !== 'immediate'),
    unacknowledged: list.filter((a) => !a.acknowledged).length,
    total: list.length,
  };
}

/** How many open risks would alert / escalate at the given thresholds (live preview for the sliders). */
function alertPreview(state, alertThreshold, criticalThreshold, filters, now) {
  const th = thresholds(state);
  const a = clamp(num(alertThreshold, th.alertThreshold), 0, 100);
  const c = clamp(num(criticalThreshold, th.criticalThreshold), 0, 100);
  const open = openAiRisks(state, filters, now);
  const immediate = open.filter((r) => num(r.score) >= c).length;
  const standard = open.filter((r) => num(r.score) > a && num(r.score) < c).length;
  return { alertThreshold: a, criticalThreshold: c, immediate, standard, total: immediate + standard, registerOnly: open.length - immediate - standard, open: open.length };
}

function alertsForRisk(state, riskId) {
  return arr(platform(state).alerts).filter((a) => a && a.riskId === riskId).sort((a, b) => num(ms(a.sentAt)) - num(ms(b.sentAt)));
}

function isTaskOverdue(t, at) {
  if (!t || t.status === TASK_CLOSED) return false;
  if (t.status === TASK_OVERDUE) return true;
  const due = toDate(t.dueDate);
  return !!due && endOfDay(due).getTime() < startOfDay(at).getTime();
}

function enrichTask(state, t, at) {
  const risk = riskById(state, t.riskId);
  const overdue = isTaskOverdue(t, at);
  const r = risk ? rating(risk.score) : 'green';
  return {
    ...t,
    risk,
    riskCode: risk ? risk.code : t.riskId,
    riskRating: r,
    riskTone: ratingTone(r),
    overdue,
    daysLeft: t.dueDate ? dayDiff(at, t.dueDate) : null,
    projectName: siteNameOf(state, t.projectId),
    writebackStatus: t.writeback && t.writeback.status ? t.writeback.status : 'pending',
  };
}

function tasksByStatus(state, filters, now) {
  const f = normalizeFilters(filters);
  const at = resolveNow(filters, now);
  const list = arr(platform(state).tasks).filter((t) => t && matchesProject(t, f.siteId)).map((t) => enrichTask(state, t, at));
  return TASK_STATUS.map((status) => ({
    status,
    tone: status === TASK_OVERDUE ? 'critical' : status === TASK_CLOSED ? 'good' : status === 'قيد التنفيذ' ? 'warning' : 'brand',
    items: list.filter((t) => t.status === status).sort((a, b) => num(ms(a.dueDate)) - num(ms(b.dueDate))),
  }));
}

function overdueTasks(state, filters, now) {
  const f = normalizeFilters(filters);
  const at = resolveNow(filters, now);
  return arr(platform(state).tasks)
    .filter((t) => t && matchesProject(t, f.siteId) && isTaskOverdue(t, at))
    .map((t) => enrichTask(state, t, at))
    .sort((a, b) => num(ms(a.dueDate)) - num(ms(b.dueDate)));
}

function taskKpis(state, filters, now) {
  const f = normalizeFilters(filters);
  const at = resolveNow(filters, now);
  const list = arr(platform(state).tasks).filter((t) => t && matchesProject(t, f.siteId));
  const open = list.filter((t) => t.status !== TASK_CLOSED);
  const overdue = list.filter((t) => isTaskOverdue(t, at));
  const monthStart = new Date(at.getFullYear(), at.getMonth(), 1).getTime();
  const closedThisMonth = list.filter((t) => t.status === TASK_CLOSED && Number.isFinite(ms(t.closedAt)) && ms(t.closedAt) >= monthStart);
  const closed = list.filter((t) => t.status === TASK_CLOSED && Number.isFinite(ms(t.closedAt)) && Number.isFinite(ms(t.createdAt)));
  const avgCloseDays = closed.length ? round(mean(closed.map((t) => (ms(t.closedAt) - ms(t.createdAt)) / DAY_MS)), 1) : 0;
  const accepted = list.filter((t) => t.source === 'ai-accepted').length;
  const edited = list.filter((t) => t.source === 'ai-edited').length;
  const manual = list.filter((t) => t.source === 'manual').length;
  const wb = { synced: 0, pending: 0, failed: 0 };
  for (const t of list) {
    const s = t.writeback && t.writeback.status;
    if (s in wb) wb[s] += 1;
  }
  return {
    total: list.length, open: open.length, overdue: overdue.length, closedThisMonth: closedThisMonth.length, avgCloseDays,
    accepted, edited, manual, acceptancePct: pct(accepted, accepted + edited), writeback: wb,
  };
}

/* ────────────────────────────── EVM & cost ────────────────────────────── */

/**
 * EVM status from CPI ('ضمن الميزانية' / 'تحذير' / 'تجاوز'); the value is also the key evmTone() reads.
 * Arabic display text — views must use i18n.label/t instead (t('cost.evm.status.*')).
 */
function evmStatus(CPI) {
  if (CPI >= 0.98) return 'ضمن الميزانية';
  if (CPI >= 0.93) return 'تحذير';
  return 'تجاوز';
}

function evmTone(status) {
  return status === 'ضمن الميزانية' ? 'good' : status === 'تحذير' ? 'warning' : 'critical';
}

function evmFromTotals(BAC, PV, EV, AC, percentComplete, plannedPercent) {
  const CPI = AC > 0 ? round(EV / AC, 2) : 1;
  const SPI = PV > 0 ? round(EV / PV, 2) : 1;
  const EAC = CPI > 0 ? Math.round(BAC / CPI) : BAC;
  const status = evmStatus(CPI);
  return {
    BAC, PV, EV, AC, CPI, SPI, EAC, ETC: EAC - AC, VAC: BAC - EAC, SV: EV - PV, CV: EV - AC,
    percentComplete: round(percentComplete, 1), plannedPercent: round(plannedPercent, 1),
    status, tone: evmTone(status),
  };
}

function evm(state, projectId) {
  const projects = arr(platform(state).projects);
  const pick = projectId && projectId !== 'all' ? projects.filter((p) => p.id === projectId) : projects;
  if (!pick.length) return evmFromTotals(0, 0, 0, 0, 0, 0);
  if (pick.length === 1) {
    const p = pick[0];
    const e = obj(p.evm);
    const BAC = num(e.BAC, num(p.budgetSAR));
    const PV = num(e.PV, BAC * num(p.plannedPercent) / 100);
    const EV = num(e.EV, BAC * num(p.percentComplete) / 100);
    const AC = num(e.AC, EV);
    return { projectId: p.id, ...evmFromTotals(BAC, PV, EV, AC, num(p.percentComplete), num(p.plannedPercent)) };
  }
  const BAC = sum(pick.map((p) => num(obj(p.evm).BAC, num(p.budgetSAR))));
  const PV = sum(pick.map((p) => num(obj(p.evm).PV)));
  const EV = sum(pick.map((p) => num(obj(p.evm).EV)));
  const AC = sum(pick.map((p) => num(obj(p.evm).AC)));
  return { projectId: 'all', ...evmFromTotals(BAC, PV, EV, AC, pct(EV, BAC, 1), pct(PV, BAC, 1)) };
}

/** Smoothstep S-curve for cumulative planned value along the project duration. */
function sCurve(x) {
  const t = clamp(x, 0, 1);
  return t * t * (3 - 2 * t);
}

function monthStart(date, offset) {
  return new Date(date.getFullYear(), date.getMonth() + offset, 1);
}

/**
 * 12 months (8 past incl. current, 4 ahead). `budget` = cumulative planned value (S-curve on BAC),
 * `actual` = cumulative actual cost up to the current month (null afterwards), `forecast` = actual
 * path then the EAC trajectory. All arrays have 12 entries; `nowIndex` marks the current month.
 * `months` holds Arabic month labels ("نوفمبر 26"): Arabic display text — views must use i18n.label/t instead
 * (format the month through fmt in the active language).
 */
function costForecast(state, projectId, now) {
  const at = resolveNow(null, now);
  const projects = arr(platform(state).projects);
  const pick = projectId && projectId !== 'all' ? projects.filter((p) => p.id === projectId) : projects;
  const past = 7;
  const months = [];
  for (let i = -past; i <= 4; i += 1) months.push(monthStart(at, i));
  const labels = months.map((m) => `${MONTHS_AR[m.getMonth()]} ${String(m.getFullYear()).slice(2)}`);
  const budget = new Array(months.length).fill(0);
  const actual = new Array(months.length).fill(0);
  const forecast = new Array(months.length).fill(0);
  const nowIndex = past;
  for (const p of pick) {
    const e = obj(p.evm);
    const BAC = num(e.BAC, num(p.budgetSAR));
    const AC = num(e.AC);
    const EAC = num(e.EAC, BAC);
    const start = ms(p.startDate);
    const finish = ms(p.plannedFinish);
    const span = Number.isFinite(start) && Number.isFinite(finish) && finish > start ? finish - start : 365 * DAY_MS;
    const nowX = Number.isFinite(start) ? (at.getTime() - start) / span : 0.5;
    const sNow = Math.max(sCurve(nowX), 0.0001);
    months.forEach((m, i) => {
      const x = Number.isFinite(start) ? (endOfDay(monthStart(at, i - past + 1)).getTime() - DAY_MS - start) / span : (i + 1) / months.length;
      const s = sCurve(x);
      budget[i] += BAC * s;
      if (i <= nowIndex) {
        const a = AC * Math.min(s / sNow, 1);
        actual[i] += a;
        forecast[i] += a;
      } else {
        const remaining = Math.max(1 - sNow, 0.0001);
        forecast[i] += AC + (EAC - AC) * clamp((s - sNow) / remaining, 0, 1);
      }
    });
  }
  return {
    projectId: pick.length === 1 ? pick[0].id : 'all',
    months: labels,
    budget: budget.map((v) => Math.round(v)),
    actual: actual.map((v, i) => (i <= nowIndex ? Math.round(v) : null)),
    forecast: forecast.map((v) => Math.round(v)),
    nowIndex,
    bac: Math.round(sum(pick.map((p) => num(obj(p.evm).BAC, num(p.budgetSAR))))),
    eac: Math.round(sum(pick.map((p) => num(obj(p.evm).EAC, num(p.budgetSAR))))),
  };
}

function varianceTone(v) {
  const a = Math.abs(num(v));
  if (num(v) <= 0) return 'good';
  if (a >= 10) return 'critical';
  if (a >= 5) return 'serious';
  if (a >= 2) return 'warning';
  return 'good';
}

function costLinesVariance(state, filters) {
  const f = normalizeFilters(filters);
  return arr(platform(state).costLines)
    .filter((c) => c && matchesProject(c, f.siteId) && matchesSearch([c.wbs, c.name, siteNameOf(state, c.projectId)], f.search))
    .map((c) => ({ ...c, projectName: siteNameOf(state, c.projectId), tone: varianceTone(c.variancePct), varianceSAR: num(c.forecast) - num(c.budget) }))
    .sort((a, b) => num(b.variancePct) - num(a.variancePct));
}

function changeOrderSummary(state, filters) {
  const f = normalizeFilters(filters);
  const list = arr(platform(state).changeOrders).filter((c) => c && matchesProject(c, f.siteId));
  const statuses = ['مقترح', 'قيد الاعتماد', 'معتمد', 'مرفوض'];
  const byStatus = statuses.map((s) => {
    const items = list.filter((c) => c.status === s);
    return { id: s, status: s, label: s, count: items.length, value: sum(items.map((c) => c.amountSAR)), tone: s === 'معتمد' ? 'good' : s === 'مرفوض' ? 'neutral' : s === 'قيد الاعتماد' ? 'warning' : 'serious' };
  });
  const pending = list.filter((c) => c.status === 'مقترح' || c.status === 'قيد الاعتماد');
  const projects = arr(platform(state).projects).filter((p) => f.siteId === 'all' || p.id === f.siteId);
  const contractValue = sum(projects.map((p) => p.contractValueSAR));
  return {
    items: list.slice().sort((a, b) => num(ms(b.submittedAt)) - num(ms(a.submittedAt))).map((c) => ({ ...c, projectName: siteNameOf(state, c.projectId) })),
    byStatus,
    total: sum(list.map((c) => c.amountSAR)),
    approved: sum(list.filter((c) => c.status === 'معتمد').map((c) => c.amountSAR)),
    pending: sum(pending.map((c) => c.amountSAR)),
    pendingCount: pending.length,
    creepPct: pct(sum(list.filter((c) => c.status !== 'مرفوض').map((c) => c.amountSAR)), contractValue, 1),
    impactDays: sum(list.filter((c) => c.status !== 'مرفوض').map((c) => c.impactDays)),
  };
}

/**
 * Hedging advice { label, tone } for a currency exposure. `tone` is language-neutral;
 * `label` is Arabic display text — views must use i18n.label/t instead (t('cost.currency.hedge.*')).
 */
function hedgingAdvice(c) {
  if (c.pegged) return { label: 'مربوط — لا تحوط', tone: 'good' };
  const move = Math.abs(num(c.change30dPct));
  const exp = num(c.exposureSAR);
  if (exp >= 100_000_000 && move >= 1) return { label: 'تحوط موصى به', tone: 'critical' };
  if (exp >= 20_000_000 || move >= 3) return { label: 'تحوط جزئي', tone: 'warning' };
  return { label: 'مراقبة', tone: 'neutral' };
}

function currencyTable(state) {
  return arr(platform(state).currencies).map((c) => {
    const forecastChangePct = num(c.rate) > 0 ? round(((num(c.forecast30d) - num(c.rate)) / num(c.rate)) * 100, 1) : 0;
    const impactSAR = Math.round(num(c.exposureSAR) * (forecastChangePct / 100));
    return { ...c, forecastChangePct, impactSAR, hedging: hedgingAdvice(c), tone: hedgingAdvice(c).tone };
  }).sort((a, b) => num(b.exposureSAR) - num(a.exposureSAR));
}

function labourIndexSummary(state) {
  return arr(platform(state).labourIndex).map((l) => {
    const s = arr(l.series);
    const change = l.change12mPct != null ? num(l.change12mPct) : (s.length > 1 && num(s[0]) > 0 ? round(((num(s[s.length - 1]) - num(s[0])) / num(s[0])) * 100, 1) : 0);
    return { ...l, change12mPct: change, last: s.length ? num(s[s.length - 1]) : 0, tone: change >= 10 ? 'critical' : change >= 6 ? 'warning' : 'good' };
  }).sort((a, b) => b.change12mPct - a.change12mPct);
}

/* ────────────────────────────── contracts ────────────────────────────── */

/**
 * Contract clause flag name (ambiguous, payment, liquidated-damages, … → Arabic).
 * Arabic display text — views must use i18n.label/t instead (i18n.label('clauseFlag', flag)).
 */
function flagLabel(flag) {
  const map = {
    ambiguous: 'بند غامض / غير قياسي', payment: 'شروط دفع غير مواتية', 'liquidated-damages': 'غرامات تأخير', 'insurance-missing': 'بند تأمين مفقود',
    'indemnity-missing': 'بند تعويض مفقود', 'warranty-missing': 'بند ضمان مفقود', obligation: 'التزام بموعد', 'force-majeure': 'قوة قاهرة',
  };
  return map[flag] || String(flag || '—');
}

function severityTone(sev) {
  return ratingTone(rating(sev));
}

function contractFlags(state, filters) {
  const f = normalizeFilters(filters);
  const out = [];
  for (const contract of arr(platform(state).contracts)) {
    if (!contract || !matchesProject(contract, f.siteId)) continue;
    for (const clause of arr(contract.clauses)) {
      if (!clause || !clause.flag) continue;
      if (!matchesSearch([contract.code, contract.title, contract.counterparty, clause.ref, clause.title, clause.excerpt, flagLabel(clause.flag)], f.search)) continue;
      out.push({ contract, clause, projectId: contract.projectId, projectName: siteNameOf(state, contract.projectId), flagLabel: flagLabel(clause.flag), severity: num(clause.severity), tone: severityTone(clause.severity), rating: rating(clause.severity) });
    }
  }
  return out.sort((a, b) => b.severity - a.severity);
}

function contractsSummary(state, filters, now) {
  const f = normalizeFilters(filters);
  const at = resolveNow(filters, now);
  const contracts = arr(platform(state).contracts).filter((c) => c && matchesProject(c, f.siteId));
  const flagged = contractFlags(state, filters);
  const horizon = addDays(startOfDay(at), 30).getTime();
  let obligations30 = 0;
  for (const c of contracts) for (const o of arr(c.obligations)) {
    if (o && o.status !== OBLIGATION_DONE && Number.isFinite(ms(o.due)) && ms(o.due) <= horizon) obligations30 += 1;
  }
  const subs = contracts.filter((c) => c.type === 'عقد من الباطن');
  const mains = contracts.filter((c) => c.type === 'عقد رئيسي');
  const concentration = mains.length ? round(mean(mains.map((c) => num(c.subcontractorSharePct))), 1) : 0;
  return {
    contracts: contracts.length,
    monitoredValue: sum(contracts.map((c) => c.valueSAR)),
    flaggedClauses: flagged.length,
    redClauses: flagged.filter((x) => x.rating === 'red').length,
    obligations30,
    subcontracts: subs.length,
    subcontractorSharePct: concentration,
    rows: contracts.map((c) => ({
      ...c,
      projectName: siteNameOf(state, c.projectId),
      flaggedCount: arr(c.clauses).filter((x) => x && x.flag).length,
      openClauses: arr(c.clauses).filter((x) => x && x.flag && x.status !== 'مُعالج').length,
      rating: rating(c.riskScore),
      tone: ratingTone(rating(c.riskScore)),
    })).sort((a, b) => num(b.riskScore) - num(a.riskScore)),
  };
}

function obligationTone(daysLeft, status) {
  if (status === OBLIGATION_DONE) return 'good';
  if (status === OBLIGATION_LATE || daysLeft < 0) return 'critical';
  if (daysLeft <= 7) return 'serious';
  if (daysLeft <= 30) return 'warning';
  return 'good';
}

function obligationsCalendar(state, days = 60, filters, now) {
  const f = normalizeFilters(filters);
  const at = resolveNow(filters, now);
  const horizon = endOfDay(addDays(at, num(days, 60))).getTime();
  const out = [];
  for (const contract of arr(platform(state).contracts)) {
    if (!contract || !matchesProject(contract, f.siteId)) continue;
    for (const o of arr(contract.obligations)) {
      if (!o) continue;
      const due = ms(o.due);
      const overdue = o.status === OBLIGATION_LATE || (o.status !== OBLIGATION_DONE && Number.isFinite(due) && due < startOfDay(at).getTime());
      if (o.status === OBLIGATION_DONE) continue;
      if (!overdue && !(Number.isFinite(due) && due <= horizon)) continue;
      const daysLeft = dayDiff(at, o.due);
      out.push({ contract, obligation: o, projectId: contract.projectId, projectName: siteNameOf(state, contract.projectId), daysLeft, overdue, tone: obligationTone(daysLeft, o.status) });
    }
  }
  return out.sort((a, b) => num(ms(a.obligation.due)) - num(ms(b.obligation.due)));
}

/* ────────────────────────────── suppliers, commodities, BoQ ────────────────────────────── */

function supplierTone(s) {
  const share = num(s.shareOfSpendPct);
  if (s.singleSource && share >= 10) return 'critical';
  if (s.singleSource || num(s.financialHealth) < 50) return 'serious';
  if (share >= 10 || num(s.creditRating === 'C')) return 'warning';
  return 'good';
}

function supplierConcentration(state) {
  const list = arr(platform(state).suppliers).slice().sort((a, b) => num(b.shareOfSpendPct) - num(a.shareOfSpendPct));
  let cumulative = 0;
  return list.map((s) => {
    cumulative += num(s.shareOfSpendPct);
    return { ...s, cumulativePct: round(cumulative, 1), tone: supplierTone(s), rating: rating(s.riskScore) };
  });
}

function commodityExposure(state) {
  return arr(platform(state).commodities).map((c) => {
    const s = arr(c.series);
    const last = s.length ? num(s[s.length - 1]) : 0;
    const yearAgo = s.length >= 13 ? num(s[s.length - 13]) : (s.length ? num(s[0]) : 0);
    const fc = arr(c.forecast);
    const forecastEnd = fc.length ? num(fc[fc.length - 1]) : last;
    const change12mPct = yearAgo > 0 ? round(((last - yearAgo) / yearAgo) * 100, 1) : 0;
    const forecastChangePct = last > 0 ? round(((forecastEnd - last) / last) * 100, 1) : 0;
    const impactSAR = Math.round(num(c.exposureSAR) * (forecastChangePct / 100));
    const tone = num(c.volatilityPct) >= 10 || forecastChangePct >= 5 ? 'critical' : num(c.volatilityPct) >= 5 || forecastChangePct >= 2 ? 'warning' : 'good';
    return { ...c, lastPrice: last, change12mPct, forecastChangePct, impactSAR, tone };
  }).sort((a, b) => num(b.exposureSAR) - num(a.exposureSAR));
}

function boqVariance(state, filters, minAbsPct = 5) {
  const f = normalizeFilters(filters);
  return arr(platform(state).boqItems)
    .filter((b) => b && matchesProject(b, f.siteId) && Math.abs(num(b.variancePct)) >= num(minAbsPct, 5))
    .filter((b) => matchesSearch([b.code, b.description, siteNameOf(state, b.projectId), (supplierById(state, b.supplierId) || {}).name], f.search))
    .map((b) => {
      const supplier = supplierById(state, b.supplierId);
      return { ...b, supplier, supplierName: supplier ? supplier.name : '—', projectName: siteNameOf(state, b.projectId), varianceQty: num(b.bimQty) - num(b.boqQty), varianceSAR: Math.round((num(b.bimQty) - num(b.boqQty)) * num(b.unitPrice)), tone: varianceTone(Math.abs(num(b.variancePct))) };
    })
    .sort((a, b) => Math.abs(num(b.variancePct)) - Math.abs(num(a.variancePct)));
}

function orderTone(daysToOrder) {
  if (daysToOrder < 0) return 'critical';
  if (daysToOrder <= 7) return 'serious';
  if (daysToOrder <= 21) return 'warning';
  return 'good';
}

function longLeadItems(state, days = 45, filters, now) {
  const f = normalizeFilters(filters);
  const at = resolveNow(filters, now);
  return arr(platform(state).boqItems)
    .filter((b) => b && matchesProject(b, f.siteId) && num(b.leadTimeDays) >= num(days, 45))
    .map((b) => {
      const supplier = supplierById(state, b.supplierId);
      const daysToOrder = dayDiff(at, b.orderBy);
      return { ...b, supplier, supplierName: supplier ? supplier.name : '—', projectName: siteNameOf(state, b.projectId), daysToOrder, daysToRequired: dayDiff(at, b.requiredBy), tone: orderTone(daysToOrder) };
    })
    .sort((a, b) => a.daysToOrder - b.daysToOrder);
}

/* ────────────────────────────── schedule ────────────────────────────── */

function criticalPathSlippage(state, filters) {
  const f = normalizeFilters(filters);
  return arr(platform(state).scheduleTasks)
    .filter((t) => t && t.critical && matchesProject(t, f.siteId))
    .filter((t) => matchesSearch([t.code, t.name, t.wbs, t.trade, siteNameOf(state, t.projectId), (subcontractorById(state, t.subcontractorId) || {}).name], f.search))
    .map((t) => {
      const sub = subcontractorById(state, t.subcontractorId);
      const exposure = round(num(t.delayProbability) * num(t.expectedDelayDays), 1);
      const prob = num(t.delayProbability);
      return {
        ...t, subcontractor: sub, subcontractorName: sub ? sub.name : '—', projectName: siteNameOf(state, t.projectId),
        slipDays: dayDiff(t.baselineFinish, t.finish), exposure,
        tone: prob >= 0.7 ? 'critical' : prob >= 0.5 ? 'serious' : prob >= 0.3 ? 'warning' : 'good',
      };
    })
    .sort((a, b) => b.exposure - a.exposure);
}

function monteCarlo(state, projectId) {
  const mcAll = obj(platform(state).monteCarlo);
  const ids = Object.keys(mcAll);
  if (!ids.length) return { projectId: projectId || 'all', p50: null, p80: null, p90: null, p50Days: 0, p80Days: 0, p90Days: 0, histogram: [], runs: 0, plannedFinish: null };
  if (projectId && projectId !== 'all' && mcAll[projectId]) {
    const m = mcAll[projectId];
    const hist = arr(m.histogram);
    return {
      projectId, ...m, histogram: hist,
      p50Days: m.p50Days != null ? num(m.p50Days) : dayDiff(m.plannedFinish, m.p50),
      p80Days: m.p80Days != null ? num(m.p80Days) : dayDiff(m.plannedFinish, m.p80),
      p90Days: m.p90Days != null ? num(m.p90Days) : dayDiff(m.plannedFinish, m.p90),
      expectedDays: round(sum(hist.map((h) => num(h.days) * num(h.prob))) / Math.max(sum(hist.map((h) => num(h.prob))), 0.0001), 1),
    };
  }
  // Portfolio view: latest P-dates across projects, histogram = mean probability per bin index (slip days = mean of bin days).
  const list = ids.map((id) => mcAll[id]).filter(Boolean);
  const bins = Math.max(...list.map((m) => arr(m.histogram).length));
  const histogram = [];
  for (let i = 0; i < bins; i += 1) {
    const rows = list.map((m) => arr(m.histogram)[i]).filter(Boolean);
    if (!rows.length) continue;
    histogram.push({ days: Math.round(mean(rows.map((r) => num(r.days)))), prob: round(sum(rows.map((r) => num(r.prob))) / list.length, 4) });
  }
  const latest = (key) => list.map((m) => m[key]).filter((v) => Number.isFinite(ms(v))).sort((a, b) => ms(b) - ms(a))[0] || null;
  const avgDays = (key) => Math.round(mean(list.map((m) => num(m[key]))));
  return {
    projectId: 'all', plannedFinish: latest('plannedFinish'), p50: latest('p50'), p80: latest('p80'), p90: latest('p90'),
    p50Days: avgDays('p50Days'), p80Days: avgDays('p80Days'), p90Days: avgDays('p90Days'), histogram, runs: sum(list.map((m) => m.runs)),
    expectedDays: round(sum(histogram.map((h) => num(h.days) * num(h.prob))) / Math.max(sum(histogram.map((h) => num(h.prob))), 0.0001), 1),
  };
}

function resourceUtilization(state, filters) {
  const f = normalizeFilters(filters);
  return arr(platform(state).resources)
    .filter((r) => r && matchesProject(r, f.siteId))
    .map((r) => {
      const u = num(r.utilizationPct);
      return { ...r, projectName: siteNameOf(state, r.projectId), overAllocated: u > 100, tone: u >= 140 ? 'critical' : u > 110 ? 'serious' : u > 100 ? 'warning' : 'good' };
    })
    .sort((a, b) => num(b.utilizationPct) - num(a.utilizationPct));
}

function approvalsAtRisk(state, filters) {
  const f = normalizeFilters(filters);
  return arr(platform(state).approvals)
    .filter((a) => a && matchesProject(a, f.siteId))
    .map((a) => {
      const ratio = num(a.statutoryDays) > 0 ? round(num(a.elapsedDays) / num(a.statutoryDays), 2) : 0;
      const late = a.status === APPROVAL_LATE || ratio >= 1;
      return { ...a, ratio, projectName: siteNameOf(state, a.projectId), atRisk: late || ratio >= 0.8, tone: late ? 'critical' : ratio >= 0.8 ? 'serious' : a.status === 'مطلوب استكمال' ? 'warning' : a.status === 'معتمد' ? 'good' : 'neutral', daysRemaining: Math.max(0, num(a.statutoryDays) - num(a.elapsedDays)) };
    })
    .filter((a) => a.atRisk)
    .sort((a, b) => b.ratio - a.ratio);
}

function approvalsTable(state, filters) {
  const f = normalizeFilters(filters);
  const atRisk = new Set(approvalsAtRisk(state, filters).map((a) => a.id));
  return arr(platform(state).approvals)
    .filter((a) => a && matchesProject(a, f.siteId))
    .map((a) => {
      const ratio = num(a.statutoryDays) > 0 ? round(num(a.elapsedDays) / num(a.statutoryDays), 2) : 0;
      return { ...a, ratio, projectName: siteNameOf(state, a.projectId), atRisk: atRisk.has(a.id), tone: a.status === APPROVAL_LATE || ratio >= 1 ? 'critical' : ratio >= 0.8 ? 'serious' : a.status === 'مطلوب استكمال' ? 'warning' : a.status === 'معتمد' ? 'good' : 'neutral' };
    })
    .sort((a, b) => b.ratio - a.ratio);
}

function subcontractorPerformance(state, filters) {
  const f = normalizeFilters(filters);
  return arr(platform(state).subcontractors)
    .filter((s) => s && matchesProject(s, f.siteId))
    .map((s) => {
      const gap = round(num(s.actualProgressPct) - num(s.plannedProgressPct), 1);
      const score = num(s.scorecard);
      return { ...s, gap, projectName: siteNameOf(state, s.projectId), tone: score < 55 || gap <= -10 ? 'critical' : score < 70 || gap <= -5 ? 'warning' : 'good' };
    })
    .sort((a, b) => a.gap - b.gap);
}

function weatherTone(delayRisk) {
  const r = num(delayRisk);
  return r >= 0.6 ? 'critical' : r >= 0.35 ? 'serious' : r >= 0.2 ? 'warning' : 'good';
}

function weatherDelayRisk(state, projectId, now) {
  const at = resolveNow(null, now);
  const all = obj(platform(state).weather);
  const ids = Object.keys(all);
  if (!ids.length) return { projectId: projectId || 'all', days: [], maxDelayRisk: 0, avgDelayRisk: 0, worstDay: null, weatherSensitiveTasks: 0, tone: 'good' };
  let id = projectId && projectId !== 'all' && all[projectId] ? projectId : null;
  if (!id) {
    // Portfolio: the project with the highest peak delay risk this week.
    id = ids.slice().sort((a, b) => max(arr(all[b].next7).map((d) => num(d.delayRisk))) - max(arr(all[a].next7).map((d) => num(d.delayRisk))))[0];
  }
  const days = arr(all[id].next7).map((d, i) => ({ ...d, index: i, tone: weatherTone(d.delayRisk), dayName: fmt.dayName(d.date) }));
  const maxDelayRisk = max(days.map((d) => num(d.delayRisk)));
  const worst = days.find((d) => num(d.delayRisk) === maxDelayRisk) || null;
  const sensitive = arr(platform(state).scheduleTasks).filter((t) => t && t.projectId === id && t.weatherSensitive && num(t.percentComplete) < 100 && (!Number.isFinite(ms(t.start)) || ms(t.start) <= addDays(at, 7).getTime()));
  return {
    projectId: id, projectName: siteNameOf(state, id), days, maxDelayRisk: round(maxDelayRisk, 2), avgDelayRisk: round(mean(days.map((d) => num(d.delayRisk))), 2),
    worstDay: worst, weatherSensitiveTasks: sensitive.length, criticalSensitiveTasks: sensitive.filter((t) => t.critical).length, tone: weatherTone(maxDelayRisk),
  };
}

/* ────────────────────────────── validation & engine ────────────────────────────── */

function validationSummary(state) {
  const v = obj(platform(state).validation);
  const sources = arr(v.sources);
  const recordsIn = sum(sources.map((s) => s.recordsIn));
  const rejected = sum(sources.map((s) => s.rejected));
  const deduplicated = sum(sources.map((s) => s.deduplicated));
  const passed = sum(sources.map((s) => (s.passed != null ? num(s.passed) : num(s.recordsIn) - num(s.rejected) - num(s.deduplicated))));
  const weighted = (key) => (recordsIn > 0 ? round(sum(sources.map((s) => num(s[key]) * num(s.recordsIn))) / recordsIn, 1) : 0);
  const quarantine = arr(v.quarantine);
  const rules = arr(v.rules);
  return {
    recordsIn, passed, rejected, deduplicated,
    passRatePct: pct(passed, recordsIn, 1),
    completenessPct: weighted('completenessPct'),
    consistencyPct: weighted('consistencyPct'),
    quarantineOpen: quarantine.filter((q) => q && q.status === 'معلّق').length,
    quarantineTotal: quarantine.length,
    rulesEnabled: rules.filter((r) => r && r.enabled).length,
    rulesTotal: rules.length,
    ruleHitsToday: sum(rules.filter((r) => r && r.enabled).map((r) => r.hitsToday)),
    lastBatch: sources.map((s) => s.lastBatch).filter((x) => Number.isFinite(ms(x))).sort((a, b) => ms(b) - ms(a))[0] || null,
    bySource: sources.map((s) => {
      const p = s.passed != null ? num(s.passed) : num(s.recordsIn) - num(s.rejected) - num(s.deduplicated);
      const rate = pct(p, num(s.recordsIn), 1);
      return { ...s, passed: p, passRatePct: rate, quarantineOpen: quarantine.filter((q) => q && q.sourceId === s.id && q.status === 'معلّق').length, tone: rate >= 98 ? 'good' : rate >= 95 ? 'warning' : 'critical' };
    }),
  };
}

function pipelineHealthOf(p) {
  if (!p) return { tone: 'neutral', label: '—' };
  if (p.status === 'degraded') return { tone: 'critical', label: 'متدهور' };
  if (p.status === 'training') return { tone: 'warning', label: 'قيد التدريب' };
  if (p.status === 'idle') return { tone: 'neutral', label: 'خامل' };
  if (num(p.driftScore) >= 0.3 || num(p.calibrationError) >= 0.08) return { tone: 'warning', label: 'انحراف ملحوظ' };
  return { tone: 'good', label: 'سليم' };
}

function pipelineHealth(state) {
  return arr(platform(state).pipelines).map((p) => {
    const h = pipelineHealthOf(p);
    const open = arr(platform(state).aiRisks).filter((r) => r && r.pipeline === p.id && isOpenRisk(r));
    return {
      ...p,
      health: h.tone, healthLabel: h.label, tone: h.tone,
      category: categoryOfPipeline(p.id),
      openRisks: open.length,
      redRisks: open.filter((r) => rating(r.score) === 'red').length,
      overridePct: pct(num(p.overridesLast30d), num(p.overridesLast30d) + Math.round(num(p.risksLast30d) * num(p.acceptanceRatePct) / 100)),
      // null when not measured (precision/recall are null in this version) — never a fabricated 0 or score.
      f1: Number.isFinite(p.precision) && Number.isFinite(p.recall) && p.precision + p.recall > 0 ? round((2 * p.precision * p.recall) / (p.precision + p.recall), 2) : null,
    };
  });
}

function pipelineById(state, id) {
  return pipelineHealth(state).find((p) => p.id === id) || null;
}

/** Live counters for the cockpit flow strip (one number per stage). */
function flowCounters(state, filters, now) {
  const v = validationSummary(state);
  const risks = filteredAiRisks(state, { ...normalizeFilters(filters), range: 3650 }, now);
  const open = risks.filter(isOpenRisk);
  const f = normalizeFilters(filters);
  const alerts = arr(platform(state).alerts).filter((a) => a && matchesProject(a, f.siteId));
  const tasks = arr(platform(state).tasks).filter((t) => t && matchesProject(t, f.siteId));
  return FLOW_STAGES.map((label, i) => {
    switch (i) {
      case 0: return { stage: i, label, value: v.recordsIn, hint: 'سجلات مُلتقطة اليوم' };
      case 1: return { stage: i, label, value: v.passRatePct, unit: '%', hint: 'نسبة اجتياز التحقق' };
      case 2: return { stage: i, label, value: v.passed, hint: 'سجلات في بحيرة البيانات' };
      case 3: return { stage: i, label, value: risks.length, hint: 'مخاطر مُقيَّمة' };
      case 4: return { stage: i, label, value: open.length, hint: 'مخاطر مفتوحة مُصنَّفة' };
      case 5: return { stage: i, label, value: alerts.length, hint: 'تنبيهات' };
      case 6: return { stage: i, label, value: tasks.filter((t) => t.status !== TASK_CLOSED).length, hint: 'مهام معالجة مفتوحة' };
      default: return { stage: i, label, value: risks.filter((r) => r.status === RISK_CLOSED).length, hint: 'مخاطر مغلقة' };
    }
  });
}

function connectorSummary(state) {
  const list = arr(platform(state).connectors);
  const count = (s) => list.filter((c) => c && c.status === s).length;
  return {
    total: list.length, connected: count('connected'), degraded: count('degraded'), disconnected: count('disconnected'), configurable: count('configurable'),
    recordsPerDay: sum(list.map((c) => c.recordsPerDay)),
    meanLatencyMs: Math.round(mean(list.filter((c) => c && c.status === 'connected').map((c) => num(c.latencyMs)))),
    writebackEnabled: list.filter((c) => c && c.mode === 'read+writeback').length,
    byLayer: ['enterprise', 'biltix', 'external'].map((layer) => ({ layer, label: layer === 'enterprise' ? 'أنظمة مؤسسية' : layer === 'biltix' ? 'وحدات بلتكس' : 'مصادر خارجية', items: list.filter((c) => c && c.layer === layer) })),
  };
}

function auditEntries(state, { action = null, limit = 50 } = {}) {
  return arr(platform(state).auditLog)
    .filter((a) => a && (!action || action === 'all' || a.action === action))
    .slice()
    .sort((a, b) => num(ms(b.at)) - num(ms(a.at)))
    .slice(0, limit > 0 ? limit : undefined);
}

function roadmapSummary(state) {
  const r = obj(platform(state).roadmap);
  const saved = obj(settingsPlatform(state).paymentPct);
  const milestones = arr(r.milestones).map((m) => {
    const p = saved[m.id];
    const paymentPct = Number.isFinite(Number(p)) && p !== null && p !== '' ? Number(p) : (m.paymentPct == null ? null : num(m.paymentPct));
    const known = m.durationMonths != null && Number.isFinite(Number(m.durationMonths));
    return { ...m, paymentPct, tone: m.status === 'منجز' ? 'good' : m.status === 'جارٍ' ? 'accent' : 'neutral', durationKnown: known, endMonth: known ? num(m.month) + num(m.durationMonths) : null };
  });
  const filled = milestones.filter((m) => m.paymentPct != null);
  const total = round(sum(filled.map((m) => m.paymentPct)), 1);
  return {
    ...r,
    milestones,
    paymentTotal: total,
    paymentComplete: filled.length === milestones.length && milestones.length > 0,
    paymentValid: filled.length === milestones.length && Math.abs(total - 100) < 0.01,
    // Durations are not in the proposal: totalMonths stays null ("to be agreed") unless every duration is known.
    totalMonths: r.totalMonths != null ? num(r.totalMonths) : (milestones.length && milestones.every((m) => m.durationKnown) ? Math.max(...milestones.map((m) => m.endMonth)) : null),
    monthsSpan: Array.isArray(r.monthsSpan) ? r.monthsSpan : (milestones.length ? [Math.min(...milestones.map((m) => num(m.month))), Math.max(...milestones.map((m) => num(m.month)))] : [0, 0]),
    durationsKnown: milestones.length > 0 && milestones.every((m) => m.durationKnown),
  };
}

/* ────────────────────────────── risk drawer helpers ────────────────────────────── */

const ROLE_ORDER = STAKEHOLDER_ROLES.map((r) => r.id);

function roleLabel(role) {
  const row = STAKEHOLDER_ROLES.find((r) => r.id === role);
  return row ? row.name : String(role || '—');
}

function yesNo(v) {
  return v ? 'نعم' : 'لا';
}

function roleRows(role, p) {
  const d = obj(p);
  switch (role) {
    case 'PM':
      return [['أثر الجدول الزمني', daysLabel(d.scheduleImpactDays)], ['أثر التكلفة', sarLabel(d.costImpactSAR)], ['على المسار الحرج', yesNo(d.criticalPath)]];
    case 'Legal':
      return [['البند المرجعي', d.clauseRef || '—'], ['التعرض المالي', sarLabel(d.exposureSAR)], ['احتمال النزاع', fmt.pct(round(num(d.disputeLikelihood) * 100))]];
    case 'Procurement':
      return [['المورد', d.supplier || '—'], ['زمن التوريد', daysLabel(d.leadTimeDays)], ['البدائل', arr(d.alternates).length ? arr(d.alternates).join('، ') : 'لا بدائل مؤهلة']];
    case 'Site':
      return [['الموقع', d.location || '—'], ['الخطر', d.hazard || '—'], ['الضوابط', arr(d.controls).length ? arr(d.controls).join('، ') : '—']];
    case 'Finance':
      return [['أثر الميزانية', sarLabel(d.budgetImpactSAR)], ['شهر التدفق النقدي', monthLabel(d.cashflowMonth)]];
    case 'PMO':
      return [['الاتجاه', d.trend || '—'], ['المؤشر', d.kpi || '—'], ['ترتيب المحفظة', d.portfolioRank != null ? `#${fmt.num(d.portfolioRank)}` : '—']];
    default:
      return Object.entries(d).map(([k, v]) => [k, Array.isArray(v) ? v.join('، ') : String(v)]);
  }
}

/** Response parameters per stakeholder role — only the roles listed on the risk, in canonical order. */
function responseParams(risk) {
  if (!risk) return [];
  const roles = arr(risk.stakeholders).filter((r) => ROLE_ORDER.includes(r));
  const params = obj(risk.responseParams);
  return ROLE_ORDER.filter((r) => roles.includes(r)).map((role) => ({ role, label: roleLabel(role), rows: roleRows(role, params[role]), raw: obj(params[role]) }));
}

/** Flow stepper index 0..7: مُلتقط → مُتحقق → في بحيرة البيانات → مُقيَّم → مُصنَّف → تنبيه → مهمة → مغلق. */
function riskFlowStage(risk, state) {
  if (!risk) return 0;
  if (risk.status === RISK_CLOSED) return 7;
  if (risk.taskId || risk.status === RISK_TASKED || risk.status === RISK_IN_PROGRESS) return 6;
  if (risk.status === RISK_ALERTED || risk.escalated) return 5;
  if (state && alertsForRisk(state, risk.id).length) return 5;
  if (risk.status === 'مكتشف' || risk.status === RISK_DISMISSED) return 4;
  return Number.isFinite(num(risk.score, NaN)) ? 3 : 2;
}

function flowStageLabel(i) {
  return FLOW_STAGES[clamp(Math.round(num(i)), 0, FLOW_STAGES.length - 1)];
}

/** Merged, time-sorted timeline: detection, history, overrides, task events (incl. write-back) and alerts. */
function riskTimeline(risk, state) {
  if (!risk) return [];
  const out = [];
  const history = arr(risk.history);
  if (risk.detectedAt && !history.some((h) => h && h.at === risk.detectedAt)) {
    out.push({ at: risk.detectedAt, kind: 'detected', by: pipelineLabel(risk.pipeline), text: `اكتشاف تلقائي — الدرجة ${fmt.num(num(risk.score))} (${ratingLabel(rating(risk.score))})`, textEn: `Automatic detection — score ${num(risk.score)}`, tone: ratingTone(rating(risk.score)) });
  }
  history.forEach((h, i) => {
    if (!h) return;
    // historyIndex lets views localise seed history through the aiRisks mirror (history[i].text); runtime entries carry textEn.
    // Runtime entries may also carry structured fields (store.js riskHistory): historyKind ('status' | 'dismiss' | 'reopen'
    // | 'reassess' | 'assign' | 'note'), statusFrom/statusTo (stored enum values), from/to, owner, due — so a view can word
    // them from its dictionaries ('status' alone is a plain status change; dismiss / reopen sentences also name the reason).
    const entry = { at: h.at, kind: i === 0 && h.at === risk.detectedAt ? 'detected' : 'history', by: h.by || '—', text: h.text || '', textEn: h.textEn || '', historyIndex: i, tone: i === 0 ? ratingTone(rating(risk.score)) : 'neutral' };
    if (typeof h.kind === 'string' && h.kind) entry.historyKind = h.kind;
    for (const k of ['statusFrom', 'statusTo', 'from', 'to', 'owner', 'due']) if (typeof h[k] === 'string' && h[k]) entry[k] = h[k];
    out.push(entry);
  });
  for (const o of arr(risk.overrides)) {
    if (!o) continue;
    out.push({ at: o.at, kind: 'override', by: o.by || '—', text: `تعديل التوصية: «${o.toAction || ''}» — السبب: ${o.reason || '—'}`, textEn: 'Recommendation overridden — reason recorded', fromAction: o.fromAction, toAction: o.toAction, reason: o.reason, tone: 'warning' });
  }
  if (state) {
    const tasks = arr(platform(state).tasks).filter((t) => t && (t.riskId === risk.id || t.id === risk.taskId));
    for (const t of tasks) {
      out.push({ at: t.createdAt, kind: 'task', by: t.owner || '—', text: `إنشاء مهمة ${t.code} — ${t.title}`, textEn: `Task ${t.code} created`, task: t, tone: 'brand' });
      const wb = obj(t.writeback);
      if (wb.at) {
        const label = wb.status === 'synced' ? 'الكتابة العكسية إلى BILTIX PM (محاكاة)' : wb.status === 'failed' ? 'فشلت الكتابة العكسية إلى BILTIX PM (محاكاة)' : 'الكتابة العكسية إلى BILTIX PM قيد الانتظار (محاكاة)';
        const labelEn = wb.status === 'synced' ? 'Write-back to BILTIX PM (simulated)' : wb.status === 'failed' ? 'Write-back to BILTIX PM failed (simulated)' : 'Write-back to BILTIX PM pending (simulated)';
        out.push({ at: wb.at, kind: 'writeback', by: 'النظام', text: `${label} (${t.code})`, textEn: `${labelEn} (${t.code})`, status: wb.status, simulated: true, tone: wb.status === 'synced' ? 'good' : wb.status === 'failed' ? 'critical' : 'warning' });
      }
      if (t.closedAt) out.push({ at: t.closedAt, kind: 'task-closed', by: t.owner || '—', text: `إغلاق المهمة ${t.code}${t.outcome ? ` — ${t.outcome}` : ''}`, textEn: `Task ${t.code} closed`, task: t, tone: 'good' });
    }
    for (const a of alertsForRisk(state, risk.id)) {
      out.push({ at: a.sentAt, kind: 'alert', by: 'النظام', text: `${a.queue === 'immediate' ? 'تصعيد فوري' : 'تنبيه قياسي'} عبر ${arr(a.channels).join('، ') || '—'}`, textEn: `${a.queue === 'immediate' ? 'Immediate escalation' : 'Standard alert'} via ${arr(a.channels).join(', ') || '—'}`, alert: a, tone: a.severity === 'critical' ? 'critical' : 'warning' });
      if (a.acknowledged && a.ackAt) out.push({ at: a.ackAt, kind: 'ack', by: a.ackBy || '—', text: 'تأكيد استلام التنبيه', textEn: 'Alert acknowledged', tone: 'good' });
    }
  }
  // De-duplicate identical (at, text) pairs that can arise when history already logs an event.
  const seen = new Set();
  return out
    .filter((e) => Number.isFinite(ms(e.at)))
    .filter((e) => {
      const key = `${e.at}|${e.text}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => ms(a.at) - ms(b.at));
}

/** Everything the risk drawer needs in one call. */
function riskDetail(state, id, now) {
  const risk = riskById(state, id);
  if (!risk) return null;
  const at = resolveNow(null, now);
  const task = risk.taskId ? taskById(state, risk.taskId) : arr(platform(state).tasks).find((t) => t && t.riskId === risk.id) || null;
  const r = rating(risk.score);
  return {
    risk,
    rating: r, tone: ratingTone(r), ratingLabel: ratingLabel(r), typeLabel: typeLabel(risk.type), categoryLabel: categoryLabel(risk.category),
    categoryIcon: categoryIcon(risk.category), pipelineLabel: pipelineLabel(risk.pipeline), pipeline: pipelineById(state, risk.pipeline),
    projectName: siteNameOf(state, risk.projectId), project: projectById(state, risk.projectId),
    stage: riskFlowStage(risk, state), stageLabel: flowStageLabel(riskFlowStage(risk, state)),
    task: task ? enrichTask(state, task, at) : null,
    alerts: alertsForRisk(state, risk.id).map((a) => enrichAlert(state, a)),
    responseParams: responseParams(risk),
    timeline: riskTimeline(risk, state),
    statusTone: statusTone(risk.status),
    overdue: isOpenRisk(risk) && !!risk.dueDate && dayDiff(at, risk.dueDate) < 0,
    daysToDue: risk.dueDate ? dayDiff(at, risk.dueDate) : null,
  };
}

/* ══════════════════ v3 — shared metric definitions (CONTRACT §8) ══════════════════
 * One definition per metric, used by the cockpit, the register, reports and exports. All derive from
 * filteredAiRisks(state, filters) so every filter changes metrics, charts and rows consistently.
 */

/** Severity = likelihood × impact × 4 (spec D5); legacy records without L/I fall back to their stored score. */
function severityOf(r) {
  const l = num(r && r.likelihood, NaN);
  const i = num(r && r.impact, NaN);
  return Number.isFinite(l) && Number.isFinite(i) && l >= 1 && i >= 1 ? l * i * 4 : num(r && r.score);
}

/** Residual severity (null = not assessed). */
function residualOf(r) {
  const l = num(r && r.residualLikelihood, NaN);
  const i = num(r && r.residualImpact, NaN);
  return Number.isFinite(l) && Number.isFinite(i) && l >= 1 && i >= 1 ? l * i * 4 : null;
}

/** An AI risk is overdue when it is open and its due date (calendar date) is before today. */
function isAiRiskOverdue(r, todayStartMs) {
  if (!isOpenRisk(r) || !r.dueDate) return false;
  const due = ms(r.dueDate);
  return Number.isFinite(due) && due < todayStartMs;
}

/** Register filters that narrow the risk list (anything but project / period / search). */
const RISK_LEVEL_FILTERS = ['category', 'domain', 'type', 'rating', 'status', 'pipeline', 'owner', 'l', 'i', 'likelihood', 'impact', 'overdue', 'search'];

function hasRiskLevelFilter(f) {
  return RISK_LEVEL_FILTERS.some((k) => f[k] != null && f[k] !== '' && f[k] !== 'all' && f[k] !== false);
}

/** Mitigation tasks in scope: tasks linked to a risk of the filtered list (all periods); unlinked manual tasks of the project when no risk-level filter is active. */
function tasksInScope(state, filters, now) {
  const f = normalizeFilters(filters);
  const risks = filteredAiRisks(state, { ...f, range: 3650 }, now);
  const ids = new Set(risks.map((r) => r.id));
  const riskFilters = hasRiskLevelFilter(f);
  return arr(platform(state).tasks).filter((t) => t && matchesProject(t, f.siteId) && (t.riskId ? ids.has(t.riskId) : !riskFilters));
}

/** Task state "as of" an instant: created by then, closed by then. */
function taskOpenAsOf(t, atMs) {
  const created = ms(t.createdAt);
  if (Number.isFinite(created) && created > atMs) return null; // did not exist yet
  const closed = ms(t.closedAt);
  return !(t.status === TASK_CLOSED && (!Number.isFinite(closed) || closed <= atMs));
}

function metricsAsOf(state, filters, at, isCurrent) {
  const atMs = endOfDay(at).getTime();
  const dayStart = startOfDay(at).getTime();
  const risks = filteredAiRisks(state, { ...normalizeFilters(filters), range: 3650 }, at);
  const open = isCurrent ? risks.filter(isOpenRisk) : risks.filter((r) => openAsOf(r, atMs));
  const critical = open.filter((r) => rating(severityOf(r)) === 'red');
  const tasks = tasksInScope(state, filters, at).filter((t) => taskOpenAsOf(t, atMs) !== null);
  const openTasks = tasks.filter((t) => taskOpenAsOf(t, atMs));
  const overdue = openTasks.filter((t) => {
    if (isCurrent && t.status === TASK_OVERDUE) return true;
    const due = ms(t.dueDate);
    return Number.isFinite(due) && due < dayStart;
  });
  const closed = tasks.length - openTasks.length;
  return {
    openRisks: open.length,
    criticalRisks: critical.length,
    overdueMitigations: overdue.length,
    mitigationCompletion: { pct: tasks.length ? Math.round((closed / tasks.length) * 100) : 0, closed, total: tasks.length },
    ids: { open: open.map((r) => r.id), critical: critical.map((r) => r.id), overdueTasks: overdue.map((t) => t.id) },
  };
}

/**
 * Executive metrics (cockpit row B, reports, exports):
 *   openRisks            open AI risks (not closed / dismissed) in the filtered list
 *   criticalRisks        open risks rated red (L×I×4 ≥ 70)
 *   overdueMitigations   open mitigation tasks in scope past their due date (or flagged متأخرة)
 *   mitigationCompletion { pct, closed, total } over the mitigation tasks in scope
 *   deltas / previous    the same metrics "as of" one period (filters.range days) earlier; deltas are
 *                        current − previous (completion in percentage points)
 */
function metrics(state, filters, now) {
  const f = normalizeFilters(filters);
  const at = resolveNow(filters, now);
  const current = metricsAsOf(state, f, at, true);
  const prevAt = addDays(at, -f.range);
  const previous = metricsAsOf(state, f, prevAt, false);
  return {
    openRisks: current.openRisks,
    criticalRisks: current.criticalRisks,
    overdueMitigations: current.overdueMitigations,
    mitigationCompletion: current.mitigationCompletion,
    deltas: {
      openRisks: current.openRisks - previous.openRisks,
      criticalRisks: current.criticalRisks - previous.criticalRisks,
      overdueMitigations: current.overdueMitigations - previous.overdueMitigations,
      mitigationCompletion: current.mitigationCompletion.pct - previous.mitigationCompletion.pct,
    },
    goodWhen: { openRisks: 'down', criticalRisks: 'down', overdueMitigations: 'down', mitigationCompletion: 'up' },
    previous: { openRisks: previous.openRisks, criticalRisks: previous.criticalRisks, overdueMitigations: previous.overdueMitigations, mitigationCompletion: previous.mitigationCompletion },
    ids: current.ids,
    period: { from: startOfDay(addDays(at, -(f.range - 1))).toISOString(), to: endOfDay(at).toISOString(), days: f.range, previousTo: endOfDay(prevAt).toISOString() },
  };
}

/** Open risks by rating band (red → green) with counts and shares. */
function severityDistribution(state, filters, now) {
  const open = openAiRisks(state, filters, now);
  const total = open.length;
  return ['red', 'yellow', 'green'].map((id) => {
    const value = open.filter((r) => rating(severityOf(r)) === id).length;
    return { rating: id, label: ratingLabel(id), tone: ratingTone(id), value, pct: total ? Math.round((value / total) * 100) : 0, total };
  });
}

/**
 * Likelihood × impact matrix of the OPEN risks in the filtered list: counts[impact-1][likelihood-1].
 * `{ residual: true }` places each risk at its residual position (only risks with a residual assessment).
 * Non-enumerable extras on the returned array: total, notAssessed (residual view), ids[impact-1][likelihood-1].
 */
function heatmapLI(state, filters, opts = {}) {
  const o = opts && typeof opts === 'object' && !(opts instanceof Date) ? opts : { now: opts };
  const residual = Boolean(o.residual);
  const open = openAiRisks(state, { ...normalizeFilters(filters), view: undefined, l: undefined, i: undefined, likelihood: undefined, impact: undefined }, o.now);
  const counts = Array.from({ length: 5 }, () => Array(5).fill(0));
  const ids = Array.from({ length: 5 }, () => Array.from({ length: 5 }, () => []));
  let notAssessed = 0;
  for (const r of open) {
    const l = num(residual ? r.residualLikelihood : r.likelihood, NaN);
    const i = num(residual ? r.residualImpact : r.impact, NaN);
    if (!(l >= 1 && l <= 5 && i >= 1 && i <= 5)) { if (residual) notAssessed += 1; continue; }
    counts[i - 1][l - 1] += 1;
    ids[i - 1][l - 1].push(r.id);
  }
  const total = counts.reduce((a, row) => a + row.reduce((b, c) => b + c, 0), 0);
  Object.defineProperties(counts, {
    total: { value: total, enumerable: false },
    notAssessed: { value: notAssessed, enumerable: false },
    ids: { value: ids, enumerable: false },
    residual: { value: residual, enumerable: false },
  });
  return counts;
}

/**
 * Weekly trend (oldest → newest; last point = now): open risks, critical risks and the consolidated score.
 * Open/critical counts are real "as of" counts from detection and closure dates; the score series is the
 * consolidated-score trend (same values as the cockpit gauge sparkline) when weeks = 12.
 */
function trend(state, filters, weeks = 12, now) {
  const n = clamp(Math.round(num(weeks, 12)), 2, 52);
  const at = resolveNow(filters, now);
  const f = normalizeFilters(filters);
  const risks = filteredAiRisks(state, { ...f, range: 3650 }, at);
  const labels = [];
  const openRisks = [];
  const critical = [];
  for (let k = n - 1; k >= 0; k -= 1) {
    const end = k === 0 ? at : endOfDay(addDays(at, -7 * k));
    const endMs = k === 0 ? endOfDay(at).getTime() : end.getTime();
    const open = k === 0 ? risks.filter(isOpenRisk) : risks.filter((r) => openAsOf(r, endMs));
    labels.push(`${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, '0')}-${String(end.getDate()).padStart(2, '0')}`);
    openRisks.push(open.length);
    critical.push(open.filter((r) => rating(severityOf(r)) === 'red').length);
  }
  let score;
  if (n === WEEKS) score = consolidatedScore(state, f, at).trend.slice();
  else {
    const w = weights(state);
    score = labels.map((_, idx) => {
      const k = n - 1 - idx;
      const endMs = endOfDay(addDays(at, -7 * k)).getTime();
      const open = risks.filter((r) => (k === 0 ? isOpenRisk(r) : openAsOf(r, endMs)));
      return clamp(Math.round(sum(PLATFORM_CATEGORIES.map((c) => w[c.id] * categoryScoreOf(open.filter((r) => r.category === c.id).map(severityOf))))), 0, 100);
    });
  }
  return { labels, openRisks, critical, score };
}

/** Inherent vs residual for risks WITH a residual assessment (open and recently closed), largest reduction first. */
function inherentVsResidual(state, filters, now) {
  return filteredAiRisks(state, filters, now)
    .filter((r) => residualOf(r) != null && r.status !== RISK_DISMISSED)
    .map((r) => {
      const from = severityOf(r);
      const to = residualOf(r);
      return {
        id: r.id, code: r.code, label: r.title, titleEn: r.titleEn || '', status: r.status, projectId: r.projectId,
        from, to, reduction: from - to,
        likelihood: r.likelihood, impact: r.impact, residualLikelihood: r.residualLikelihood, residualImpact: r.residualImpact,
        rating: rating(from), residualRating: rating(to), tone: ratingTone(rating(from)), residualTone: ratingTone(rating(to)),
        assessedAt: r.residualAssessment ? r.residualAssessment.at : null,
      };
    })
    .sort((a, b) => b.reduction - a.reduction || b.from - a.from || String(a.code).localeCompare(String(b.code)));
}

/** Live input-data quality of a risk (validation layer of its source system), same definition as the seed. */
function dataQuality(state, risk) {
  if (!risk) return null;
  const ev = risk.evidence || {};
  return deriveDataQuality(platform(state).validation, ev.sourceSystem, ev.kind);
}

export const LIFECYCLE_STAGES = Object.freeze([
  'source', 'validation', 'identification', 'analysis', 'evaluation', 'recommendation',
  'review', 'assignment', 'escalation', 'evidence', 'residual', 'closure',
]);

function historyAt(risk, re) {
  const h = arr(risk && risk.history).find((x) => x && re.test(String(x.text || '')));
  return h ? { at: h.at, by: h.by } : null;
}

/**
 * The 12-stage lifecycle of a risk (source → validation → identification → analysis → evaluation →
 * recommendation → human review → assignment → escalation → treatment evidence → residual assessment →
 * closure & audit). Each stage: { key, state: 'done'|'current'|'pending'|'skipped', at, by }. For an open
 * risk exactly one stage is 'current' (the first unfinished one); a dismissed risk skips 8–11.
 */
function lifecycle(risk, state) {
  if (!risk) return [];
  const p = state ? platform(state) : EMPTY_PLATFORM;
  const th = state ? thresholds(state) : { alertThreshold: DEFAULT_ALERT_THRESHOLD, criticalThreshold: DEFAULT_CRITICAL_THRESHOLD };
  const detected = risk.detectedAt || null;
  const engineBy = pipelineLabel(risk.pipeline);
  const sourceBy = (risk.evidence && risk.evidence.sourceSystem) || (risk.origin === 'manual' ? 'إدخال يدوي' : null);
  const tasks = arr(p.tasks).filter((t) => t && (t.riskId === risk.id || t.id === risk.taskId)).sort((a, b) => ms(a.createdAt) - ms(b.createdAt));
  const task = tasks[0] || null;
  const alerts = arr(p.alerts).filter((a) => a && a.riskId === risk.id).sort((a, b) => ms(a.sentAt) - ms(b.sentAt));
  const firstCritical = alerts.find((a) => a.severity === 'critical' || a.queue === 'immediate') || null;
  const dismissed = risk.status === RISK_DISMISSED;
  const closed = risk.status === RISK_CLOSED;
  const override = arr(risk.overrides)[0] || null;
  const accepted = historyAt(risk, /^قبول/);
  const reviewedAt = dismissed ? (override ? { at: override.at, by: override.by } : { at: risk.updatedAt, by: risk.owner }) : (accepted || (override ? { at: override.at, by: override.by } : (task ? { at: task.createdAt, by: task.owner } : null)));
  const evidence = arr(risk.treatment && risk.treatment.evidence);
  const lastEvidence = evidence.length ? evidence.slice().sort((a, b) => ms(b.addedAt) - ms(a.addedAt))[0] : null;
  const ra = risk.residualAssessment || null;
  const hasResidual = residualOf(risk) != null;
  const needsEscalation = severityOf(risk) >= th.criticalThreshold;
  const stages = {
    source: { done: true, at: detected, by: sourceBy },
    validation: { done: risk.origin !== 'manual', at: detected, by: risk.dataQuality && risk.dataQuality.sourceName ? risk.dataQuality.sourceName : null, skip: risk.origin === 'manual' },
    identification: { done: true, at: detected, by: risk.origin === 'manual' ? (arr(risk.history)[0] || {}).by || null : engineBy },
    analysis: { done: Number.isFinite(num(risk.likelihood, NaN)) && Number.isFinite(num(risk.impact, NaN)), at: detected, by: risk.origin === 'manual' ? (arr(risk.history)[0] || {}).by || null : engineBy },
    evaluation: { done: true, at: alerts[0] ? alerts[0].sentAt : detected, by: alerts[0] ? 'النظام' : engineBy },
    recommendation: { done: Boolean(risk.recommendation && risk.recommendation.action), at: detected, by: engineBy, skip: !(risk.recommendation && risk.recommendation.action) && risk.origin === 'manual' },
    review: { done: Boolean(reviewedAt) || closed, at: reviewedAt ? reviewedAt.at : null, by: reviewedAt ? reviewedAt.by : null },
    assignment: { done: Boolean(task) || (Boolean(risk.owner) && Boolean(risk.dueDate) && !['مكتشف', 'تنبيه'].includes(risk.status)), at: task ? task.createdAt : null, by: task ? task.owner : risk.owner || null, skip: dismissed },
    escalation: { done: Boolean(risk.escalated || firstCritical), at: firstCritical ? firstCritical.sentAt : null, by: firstCritical ? 'النظام' : null, skip: dismissed || (!needsEscalation && !risk.escalated && !firstCritical) },
    evidence: { done: evidence.length > 0, at: lastEvidence ? lastEvidence.addedAt : null, by: lastEvidence ? lastEvidence.by : null, skip: dismissed || (closed && !evidence.length) },
    residual: { done: hasResidual, at: ra ? ra.at : null, by: ra ? ra.by : null, skip: dismissed },
    closure: { done: closed || dismissed, at: closed ? (risk.closedAt || risk.updatedAt) : (dismissed ? risk.updatedAt : null), by: closed || dismissed ? (arr(risk.history).slice(-1)[0] || {}).by || null : null },
  };
  let currentSet = closed || dismissed;
  return LIFECYCLE_STAGES.map((key) => {
    const st = stages[key];
    let s;
    if (st.done) s = 'done';
    else if (st.skip) s = 'skipped';
    else if (!currentSet) { s = 'current'; currentSet = true; } else s = 'pending';
    return { key, state: s, at: s === 'done' ? st.at || null : null, by: s === 'done' ? st.by || null : null };
  });
}

/**
 * The single next action for a risk (cockpit priority list, drawer button). Keys:
 * none · reopen? (closed → 'none') · review · escalate · assign · start-treatment · follow-up-overdue ·
 * add-evidence · assess-residual · close. Labels are convenience copies; views may map `key` to dictionaries.
 */
const NEXT_ACTIONS = Object.freeze({
  none: { label: 'لا إجراء مطلوب', labelEn: 'No action needed', tone: 'neutral' },
  review: { label: 'مراجعة التوصية واتخاذ قرار', labelEn: 'Review the recommendation and decide', tone: 'warning' },
  escalate: { label: 'تصعيد فوري', labelEn: 'Escalate now', tone: 'critical' },
  assign: { label: 'تحديد المسؤول وتاريخ الاستحقاق', labelEn: 'Assign an owner and a due date', tone: 'warning' },
  'start-treatment': { label: 'بدء تنفيذ المعالجة', labelEn: 'Start the treatment', tone: 'accent' },
  'follow-up-overdue': { label: 'متابعة المعالجة المتأخرة', labelEn: 'Follow up the overdue treatment', tone: 'critical' },
  'add-evidence': { label: 'إرفاق دليل المعالجة', labelEn: 'Attach treatment evidence', tone: 'accent' },
  'assess-residual': { label: 'تقييم المخاطر المتبقية', labelEn: 'Assess the residual risk', tone: 'accent' },
  close: { label: 'إغلاق المخاطرة بالنتيجة', labelEn: 'Close the risk with its outcome', tone: 'good' },
});

function nextAction(risk, state, now) {
  const make = (key) => ({ key, ...NEXT_ACTIONS[key] });
  if (!risk || risk.status === RISK_CLOSED || risk.status === RISK_DISMISSED) return make('none');
  const at = resolveNow(null, now);
  const th = state ? thresholds(state) : { criticalThreshold: DEFAULT_CRITICAL_THRESHOLD };
  const tasks = state ? arr(platform(state).tasks).filter((t) => t && (t.riskId === risk.id || t.id === risk.taskId)) : [];
  const openTask = tasks.find((t) => t.status !== TASK_CLOSED) || null;
  if (severityOf(risk) >= th.criticalThreshold && !risk.escalated) return make('escalate');
  if ((risk.status === 'مكتشف' || risk.status === RISK_ALERTED) && !risk.taskId && !tasks.length) return make('review');
  if (!risk.owner || !risk.dueDate) return make('assign');
  const overdue = isAiRiskOverdue(risk, startOfDay(at).getTime()) || (openTask && isTaskOverdue(openTask, at));
  if (overdue) return make('follow-up-overdue');
  if (risk.status === RISK_TASKED && openTask && openTask.status === 'جديدة') return make('start-treatment');
  if (!arr(risk.treatment && risk.treatment.evidence).length) return make('add-evidence');
  if (residualOf(risk) == null) return make('assess-residual');
  return make('close');
}

/**
 * Register rows (cockpit section F, AI register, exports): the filtered list enriched with every column the
 * register shows. `extra`: { sort: 'score'|'due'|'detected'|'code'|'residual', dir: 'desc'|'asc', now }.
 */
function registerRows(state, filters, extra = {}) {
  const x = extra && typeof extra === 'object' ? extra : {};
  const at = resolveNow(filters, x.now);
  const todayMs = startOfDay(at).getTime();
  const rows = filteredAiRisks(state, filters, at).map((r) => {
    const score = severityOf(r);
    const res = residualOf(r);
    const rt = rating(score);
    const dq = r.dataQuality || null;
    return {
      id: r.id, code: r.code, title: r.title, titleEn: r.titleEn || '', projectId: r.projectId, projectName: siteNameOf(state, r.projectId),
      category: r.category, categoryLabel: categoryLabel(r.category), categoryIcon: categoryIcon(r.category), type: r.type, typeLabel: typeLabel(r.type),
      score, likelihood: r.likelihood, impact: r.impact, rating: rt, ratingLabel: ratingLabel(rt), tone: ratingTone(rt),
      residualLikelihood: r.residualLikelihood ?? null, residualImpact: r.residualImpact ?? null, residualScore: res,
      residualRating: res == null ? null : rating(res),
      confidence: r.confidence == null ? null : num(r.confidence), dataQualityLevel: dq ? dq.level : null, dataQualityScore: dq ? dq.score : null,
      owner: r.owner || null, dueDate: r.dueDate || null, daysToDue: r.dueDate ? dayDiff(at, r.dueDate) : null, overdue: isAiRiskOverdue(r, todayMs),
      status: r.status, statusTone: statusTone(r.status), pipeline: r.pipeline, origin: r.origin || 'engine', detectedAt: r.detectedAt, updatedAt: r.updatedAt,
      nextAction: nextAction(r, state, at), risk: r,
    };
  });
  const dir = x.dir === 'asc' ? 1 : -1;
  const key = x.sort || 'score';
  const val = (row) => {
    switch (key) {
      case 'due': return row.dueDate ? ms(row.dueDate) : Infinity * -dir;
      case 'detected': return ms(row.detectedAt) || 0;
      case 'code': return row.code;
      case 'residual': return row.residualScore == null ? -1 : row.residualScore;
      default: return row.score;
    }
  };
  return rows.sort((a, b) => {
    const va = val(a); const vb = val(b);
    const c = typeof va === 'string' ? va.localeCompare(vb) : (va === vb ? 0 : (va < vb ? -1 : 1));
    if (c) return c * dir;
    return (ms(a.dueDate) || Infinity) - (ms(b.dueDate) || Infinity) || String(a.code).localeCompare(String(b.code));
  });
}

/** Priority actions (cockpit row E): top open risks by score, then the earliest due date. */
function priorityActions(state, filters, limit = 6, now) {
  return registerRows(state, filters, { now })
    .filter((row) => isOpenRisk(row.risk))
    .sort((a, b) => b.score - a.score || (ms(a.dueDate) || Infinity) - (ms(b.dueDate) || Infinity) || String(a.code).localeCompare(String(b.code)))
    .slice(0, Math.max(0, limit));
}

/* ────────────────────────────── export ────────────────────────────── */

export const psel = {
  // classification (B2)
  rating, ratingTone, ratingLabel, ratingHint, typeLabel, categoryLabel, categoryIcon, pipelineLabel, statusTone, categoryScoreOf, isOpenRisk,
  // accessors
  platform, thresholds, weights, projectById, projectRows, riskById, taskById, contractById, supplierById, subcontractorById, pipelineById,
  // filtered collections & scores
  filteredAiRisks, openAiRisks, rankedOpenRisks, categoryScores, consolidatedScore, typeDistribution, ratingDistribution, projectScores, topProjectsByRed,
  // alerts & tasks
  alertQueue, alertPreview, alertsForRisk, tasksByStatus, overdueTasks, taskKpis,
  // EVM & cost
  evm, costForecast, costLinesVariance, changeOrderSummary, currencyTable, labourIndexSummary,
  // contracts
  contractFlags, contractsSummary, obligationsCalendar, flagLabel,
  // suppliers, commodities, BoQ
  supplierConcentration, commodityExposure, boqVariance, longLeadItems,
  // schedule
  criticalPathSlippage, monteCarlo, resourceUtilization, approvalsAtRisk, approvalsTable, subcontractorPerformance, weatherDelayRisk,
  // validation & engine
  validationSummary, pipelineHealth, flowCounters, connectorSummary, auditEntries, roadmapSummary,
  // risk drawer
  responseParams, riskFlowStage, flowStageLabel, riskTimeline, riskDetail,
  // v3 shared definitions (CONTRACT §8)
  metrics, severityDistribution, heatmapLI, trend, inherentVsResidual, lifecycle, nextAction, registerRows, priorityActions,
  dataQuality, severityOf, residualOf, isAiRiskOverdue, tasksInScope, LIFECYCLE_STAGES, NEXT_ACTIONS,
  // helpers exposed for tests/tooling
  dayDiff, daysLabel, sarLabel,
  FLOW_STAGES, ROLE_ORDER,
};

export default psel;
