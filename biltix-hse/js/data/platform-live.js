/**
 * Biltix Risk AI — platform live simulation (js/data/platform-live.js) — ARCHITECTURE.md §B6
 *
 *   export const platformLive = { start({store, bus}), stop(), pause(), resume(), isRunning(), tick(kind) }
 *
 * Started by app.js right after `live.start`. Deterministic seeded RNG (mulberry32, its own
 * stream so it never disturbs Part A's live.js). Behaviour:
 *
 *   • Every 4–9 s one feed event of type 'ai' | 'validation' | 'connector' | 'writeback' | 'task'
 *     (Arabic, built from the real platform data: contract codes, clause refs, connector names,
 *     task codes, validation sources). Pushed through store.pushFeed → bus 'feed:event'.
 *   • Every ~3 min a new AI risk is detected (store.addAiRisk) with realistic content for a random
 *     category; the store applies the alert thresholds (alert queue, immediate escalation, bus
 *     'alert' for critical ones so the Part A banner shows it).
 *   • Every 30 s: pipelines' lastRun / runsToday / latency jitter + validation counters increase.
 *   • Every 60 s: overdue mitigation tasks are re-flagged 'متأخرة' (store.updateTask → feed event).
 *   • Respects settings.feedPaused (no feed events, no new detections; silent jitter continues)
 *     and document.hidden (every timer is suspended and re-armed on return). stop() clears all.
 *   • Detected risks are tagged `simulated: true` and capped (SIM_CAPS.aiRisks = 100): the oldest
 *     closed/dismissed — then the oldest untouched open — simulated risks (never ones with a task)
 *     are pruned together with their alerts, after each detection and on start(). Seed and
 *     user-created records are never pruned.
 *   • Event text: every number goes through fmt (Arabic-Indic numerals honoured), codes inside
 *     sentences use U+2011 so they never wrap, Arabic source names come first ("منصة بلتكس…")
 *     with the Latin name in `source`, and raw numbers / plain codes travel in the payload
 *     (value, unit, ms, days, count, pct, score, code, refId).
 *
 * Side-effect free on import. All DOM-free; the shell renders the events.
 */

import { fmt } from '../core/fmt.js';
import { enumEn, dataEn, dataAt, siteEnById, personEn, integrationEn, sourceSystemEn, unitEn, latinOnly } from './vocab-en.js';

const RNG_SEED = (20261109 ^ 0x5bd1e995) >>> 0;
const FEED_MIN_MS = 4000;
const FEED_MAX_MS = 9000;
const RISK_FIRST_MS = [95_000, 150_000];
const RISK_EVERY_MS = [150_000, 210_000];
const JITTER_MS = 30_000;
const OVERDUE_MS = 60_000;
const OVERDUE_PER_PASS = 2;

const OPEN_RISK = ['مكتشف', 'تنبيه', 'مهمة مُسندة', 'قيد المعالجة'];
const OPEN_TASK = ['جديدة', 'قيد التنفيذ', 'متأخرة'];

const CATEGORIES = ['contract', 'bom', 'schedule', 'site', 'cost'];
const PIPELINE_OF = { contract: 'contract-nlp', bom: 'bom-forecast', schedule: 'schedule-model', site: 'site-ai', cost: 'cost-forecast' };
const CATEGORY_OF = Object.fromEntries(Object.entries(PIPELINE_OF).map(([c, p]) => [p, c]));
const PIPELINE_LABEL = {
  'contract-nlp': 'محرك العقود NLP',
  'bom-forecast': 'محرك توقعات المواد',
  'schedule-model': 'نموذج الجدول الزمني',
  'site-ai': 'ذكاء الموقع والصور',
  'cost-forecast': 'محرك توقعات التكلفة',
};
const PIPELINE_UNIT = {
  'contract-nlp': 'بنداً تعاقدياً',
  'bom-forecast': 'بند توريد وسلسلة أسعار',
  'schedule-model': 'نشاطاً حرجاً (Monte Carlo {runs} تشغيل)',
  'site-ai': 'صورة وتقريراً يومياً',
  'cost-forecast': 'سطر تكلفة (EVM)',
};
const MONTE_CARLO_RUNS = 5000;
const RATING_LABEL = { red: 'أحمر', yellow: 'أصفر', green: 'أخضر' };
const RATING_TONE = { red: 'critical', yellow: 'warning', green: 'good' };

/** Biltix PM: Arabic name leads the sentence (RTL-5); the Latin name travels in `source`. */
const PM_NAME = 'منصة بلتكس لإدارة المشاريع';
const PM_SOURCE = 'Biltix PM';

/** Caps for engine-generated (simulated) records — see pruneSimulated(). */
export const SIM_CAPS = Object.freeze({ aiRisks: 100 });
const CLOSED_RISK = new Set(['مغلق', 'مُتجاوز']);
const FRESH_RISK = new Set(['مكتشف', 'تنبيه']);

/* ────────────────────────────── RNG & tiny helpers ────────────────────────────── */

function mulberry32(a) {
  let t = a >>> 0;
  return () => {
    t = (t + 0x6D2B79F5) >>> 0;
    let x = Math.imul(t ^ (t >>> 15), 1 | t);
    x ^= x + Math.imul(x ^ (x >>> 7), 61 | x);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

let rand = mulberry32(RNG_SEED);
const int = (min, max) => Math.floor(rand() * (max - min + 1)) + min;
const pick = (list) => (Array.isArray(list) && list.length ? list[Math.floor(rand() * list.length)] : null);
const chance = (p) => rand() < p;
const clamp = (n, min, max) => Math.min(max, Math.max(min, n));
const round1 = (n) => Math.round(n * 10) / 10;

/* numerals-aware text helpers (RTL-4 / RTL-5 / RTL-21 / RTL-23) */
const num = (n, digits = 0) => { try { return fmt.num(n, { maximumFractionDigits: digits }); } catch { return String(n); } };
const pct = (n, digits = 0) => { try { return fmt.pct(n, digits); } catch { return `${n}%`; } };
const arabNumerals = () => { try { return typeof fmt.getNumerals === 'function' && fmt.getNumerals() === 'arab'; } catch { return false; } };
const signedPct = (n, digits = 1) => { try { return `${fmt.signed(n, digits)}${arabNumerals() ? '٪' : '%'}`; } catch { return `${n >= 0 ? '+' : '−'}${Math.abs(n)}%`; } };
/** Non-breaking hyphen (U+2011) inside a code embedded in a sentence: "AIR‑1042" never wraps. */
const nbh = (code) => String(code ?? '').replace(/-/g, '‑');
const unitOf = (pipeId) => String(PIPELINE_UNIT[pipeId] || 'سجلاً').replace('{runs}', num(MONTE_CARLO_RUNS));
const parseMs = (v) => { const t = Date.parse(v || ''); return Number.isFinite(t) ? t : 0; };
const ARABIC_INDIC = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'];
/**
 * Final pass over an event sentence when the UI uses Arabic-Indic numerals: literal digits and
 * digits inside Arabic record titles / names follow the setting; identifiers (CT-2026-014,
 * B2070, H2S, v2.3.1, ISO dates) are left alone. No lookbehind (Safari < 16.4).
 */
function arDigits(text) {
  const s = String(text || '');
  if (!arabNumerals()) return s;
  return s
    .replace(/(^|[^A-Za-z0-9₂‑-])(\d+(?:[.,:/–]\d+)*)(%?)(?![A-Za-z0-9₂]|-\d)/g, (_, pre, run, p) => (
      pre
      + run.replace(/[0-9]/g, (d) => ARABIC_INDIC[d.charCodeAt(0) - 48]).replace(/([٠-٩])\.(?=[٠-٩])/g, '$1٫').replace(/,(?=[٠-٩]{3})/g, '٬')
      + (p ? '٪' : '')
    ))
    .replace(/([٠-٩])%/g, '$1٪');
}

function weightedPick(entries) {
  const total = entries.reduce((s, [, w]) => s + w, 0);
  let r = rand() * total;
  for (const [value, w] of entries) {
    r -= w;
    if (r <= 0) return value;
  }
  return entries[entries.length - 1][0];
}

function pad(n, w = 2) { return String(n).padStart(w, '0'); }

function localISO(date = new Date()) {
  const d = date;
  const off = -d.getTimezoneOffset();
  const sign = off >= 0 ? '+' : '-';
  const abs = Math.abs(off);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`;
}

function todayISO(date = new Date()) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function plusDays(days) {
  return todayISO(new Date(Date.now() + days * 86_400_000));
}

function sar(n) {
  const v = Number(n) || 0;
  if (Math.abs(v) >= 1e6) return `${round1(v / 1e6)} مليون ر.س`;
  if (Math.abs(v) >= 1e3) return `${Math.round(v / 1e3)} ألف ر.س`;
  return `${Math.round(v)} ر.س`;
}

function ratingOf(score) {
  return score >= 70 ? 'red' : score >= 40 ? 'yellow' : 'green';
}

/* ────────────────────────────── engine state ────────────────────────────── */

let S = null; // store
let B = null; // bus
let running = false;
let paused = false;
let suspended = false; // document.hidden
let feedTimer = null;
let riskTimer = null;
let jitterTimer = null;
let overdueTimer = null;
let visibilityHandler = null;
let ticks = 0;

const P = () => (S && S.state && S.state.platform && typeof S.state.platform === 'object' ? S.state.platform : {});
const arr = (key) => (Array.isArray(P()[key]) ? P()[key] : []);
const settings = () => (S && S.state && S.state.settings) || {};
const feedPaused = () => Boolean(settings().feedPaused);
const hidden = () => typeof document !== 'undefined' && document.hidden === true;
const active = () => running && !paused && !suspended;

function sites() {
  return (S && S.state && Array.isArray(S.state.sites)) ? S.state.sites : [];
}
function siteName(id) {
  const s = sites().find((x) => x && x.id === id);
  return s ? s.name : '';
}
function randomProjectId() {
  const list = arr('projects').length ? arr('projects') : sites();
  const p = pick(list);
  return (p && p.id) || 'S1';
}
function pipelineLabel(id) {
  const p = arr('pipelines').find((x) => x && x.id === id);
  return (p && (p.nameAr || p.name)) || PIPELINE_LABEL[id] || 'محرك المخاطر';
}

function emit(event) {
  if (!S || !event) return null;
  const ev = S.pushFeed({ ts: localISO(new Date()), ...event, title: arDigits(event.title), detail: arDigits(event.detail), titleEn: String(event.titleEn || ''), detailEn: String(event.detailEn || ''), simulated: true });
  if (ev && B) B.emit('feed:event', ev);
  return ev;
}

/* ────────────────────────────── feed event generators ────────────────────────────── */
/*
 * Every event is bilingual (title/detail + titleEn/detailEn, CONTRACT §8) and tagged `simulated: true`:
 * in this demo build the pipelines, connectors and write-backs are scenarios, so the copy never claims a
 * real connection or a confirmed delivery ("محاكاة" / "Simulated").
 */

const enN = (n, digits = 0) => { const v = Number(n); return Number.isFinite(v) ? v.toLocaleString('en-US', { maximumFractionDigits: digits }) : ''; };
const enPct = (n, digits = 0) => `${enN(n, digits)}%`;
const enSignedPct = (n, digits = 1) => `${n >= 0 ? '+' : '−'}${enN(Math.abs(n), digits)}%`;
const sarEn = (n) => { const v = Number(n) || 0; if (Math.abs(v) >= 1e6) return `SAR ${enN(v / 1e6, 1)}M`; if (Math.abs(v) >= 1e3) return `SAR ${enN(v / 1e3)}k`; return `SAR ${enN(v)}`; };
const PIPELINE_UNIT_EN = {
  'contract-nlp': 'contract clauses', 'bom-forecast': 'supply items and price series', 'schedule-model': `critical activities (Monte Carlo, ${enN(MONTE_CARLO_RUNS)} runs)`,
  'site-ai': 'photos and daily reports', 'cost-forecast': 'cost lines (EVM)',
};
const pipelineEn = (id) => enumEn('pipeline', id, 'Risk engine');
const projectEn = (id) => siteEnById(sites(), id);
const codeEn = (c) => nbh(c);

function aiEvent() {
  const pipes = arr('pipelines');
  const pipeId = pipes.length ? pick(pipes).id : pick(Object.keys(PIPELINE_LABEL));
  const label = pipelineLabel(pipeId);
  const cat = CATEGORY_OF[pipeId] || 'site';
  const risks = arr('aiRisks').filter((r) => r && r.category === cat && OPEN_RISK.includes(r.status));

  if (risks.length && chance(0.6)) {
    const r = pick(risks);
    const score = Number(r.score) || 0;
    // Severity is likelihood × impact × 4 and only changes through an explicit re-assessment, so a
    // simulated re-run refreshes the model confidence only — the score stays put (no silent threshold crossing).
    if (chance(0.5)) S.updateAiRisk(r.id, { confidence: clamp(Math.round(((Number(r.confidence) || 0.8) + (rand() - 0.5) * 0.04) * 100) / 100, 0.5, 0.99) });
    const rating = ratingOf(score);
    return {
      type: 'ai', tone: RATING_TONE[rating], siteId: r.projectId, sourceId: pipeId, refId: r.id,
      title: `${label} (محاكاة): إعادة تقييم ${nbh(r.code)} — الدرجة ${num(score)} (${RATING_LABEL[rating]}) دون تغيير`,
      titleEn: `${pipelineEn(pipeId)} (simulated): ${codeEn(r.code)} re-evaluated — score ${enN(score)} (${enumEn('rating', rating)}) unchanged`,
      detail: [r.title, siteName(r.projectId)].filter(Boolean).join(' · '),
      detailEn: [dataEn('aiRisks', r.id, 'title') || latinOnly(r.titleEn), projectEn(r.projectId)].filter(Boolean).join(' · '),
      code: r.code, score, rating, source: label,
    };
  }

  const n = int(18, 640);
  const ms = int(180, 2400);
  const overrides = int(3, 14);
  const variants = [
    { title: `${label} (محاكاة): اكتمال دورة تحليل — ${num(n)} ${unitOf(pipeId)} خلال ${num(ms)} م.ث`, titleEn: `${pipelineEn(pipeId)} (simulated): analysis cycle finished — ${enN(n)} ${PIPELINE_UNIT_EN[pipeId] || 'records'} in ${enN(ms)} ms`, count: n, ms },
    { title: `${label} (محاكاة): لا مخاطر جديدة فوق العتبة في الدورة الأخيرة (${num(n)} ${unitOf(pipeId)})`, titleEn: `${pipelineEn(pipeId)} (simulated): no new risk above the threshold in the last cycle (${enN(n)} ${PIPELINE_UNIT_EN[pipeId] || 'records'})`, count: n },
    { title: `${label} (محاكاة): ${num(overrides)} تجاوزاً بشرياً مسجلاً — إعادة المعايرة تتطلب خدمة نماذج متصلة`, titleEn: `${pipelineEn(pipeId)} (simulated): ${enN(overrides)} human overrides recorded — recalibration needs a connected model service`, count: overrides },
  ];
  const v = pick(variants);
  const version = (pipes.find((p) => p.id === pipeId) || {}).version || 'v2.3.1';
  return {
    type: 'ai', tone: 'accent', siteId: randomProjectId(), sourceId: pipeId,
    title: v.title, titleEn: v.titleEn,
    detail: `الإصدار ${version} · قيم توضيحية`, detailEn: `Version ${version} · illustrative values`,
    count: v.count, ms: v.ms, source: label,
  };
}

function validationEvent() {
  const v = P().validation || {};
  const sources = Array.isArray(v.sources) ? v.sources : [];
  const src = sources.length ? pick(sources) : null;
  const name = (src && src.name) || pick(['Oracle ERP', 'Primavera P6', 'Biltix — العقود', 'Autodesk APS']);
  const nameEn = (src && dataEn('validationSources', src.id, 'name')) || latinOnly(name) || sourceSystemEn(name);
  const batch = int(40, 900);
  const rejected = int(0, 6);
  const dedup = int(0, 5);
  const passed = Math.max(0, batch - rejected - dedup);
  let completeness = round1(97 + rand() * 2.5);
  let consistency = round1(96 + rand() * 3);
  if (src) {
    completeness = clamp(round1((Number(src.completenessPct) || 97) + (rand() - 0.5) * 0.6), 90, 99.9);
    consistency = clamp(round1((Number(src.consistencyPct) || 97) + (rand() - 0.5) * 0.6), 90, 99.9);
    S.updateValidationSource(src.id, {
      recordsIn: (Number(src.recordsIn) || 0) + batch,
      passed: (Number(src.passed) || 0) + passed,
      rejected: (Number(src.rejected) || 0) + rejected,
      deduplicated: (Number(src.deduplicated) || 0) + dedup,
      completenessPct: completeness,
      consistencyPct: consistency,
      lastBatch: localISO(new Date()),
    });
  }
  const variants = [
    [`طبقة التحقق (محاكاة): دفعة ${num(batch)} سجلاً من ${name} · رفض ${num(rejected)} · حذف ${num(dedup)} مكرراً · اكتمال ${pct(completeness, 1)}`,
      `Validation layer (simulated): batch of ${enN(batch)} records from ${nameEn} · ${enN(rejected)} rejected · ${enN(dedup)} duplicates removed · completeness ${enPct(completeness, 1)}`],
    rejected > 0
      ? [`طبقة التحقق (محاكاة): ${num(rejected)} سجلات لم تجتز فحص المخطط من ${name} — تحويلها إلى قائمة الحجر`, `Validation layer (simulated): ${enN(rejected)} records from ${nameEn} failed schema checks — moved to quarantine`]
      : [`طبقة التحقق (محاكاة): دفعة ${name} اجتازت فحوص المخطط والاكتمال (${num(batch)} سجلاً)`, `Validation layer (simulated): the ${nameEn} batch passed schema and completeness checks (${enN(batch)} records)`],
    [`طبقة التحقق (محاكاة): اتساق ${pct(consistency, 1)} لدفعة ${name}`, `Validation layer (simulated): consistency ${enPct(consistency, 1)} for the ${nameEn} batch`],
  ];
  const [title, titleEn] = pick(variants);
  return {
    type: 'validation', tone: rejected >= 4 ? 'warning' : 'accent', siteId: null, sourceId: src ? src.id : null,
    title, titleEn,
    detail: 'لا يصل أي سجل إلى المحرك قبل اجتياز التحقق · قيم توضيحية', detailEn: 'No record reaches the engine before passing validation · illustrative values',
    count: batch, rejected, deduplicated: dedup, pct: completeness, consistencyPct: consistency, source: name,
  };
}

/** Title (ar + en) + raw payload for a simulated connector sync event. */
function connectorTitle(c) {
  const id = String(c.id || '');
  const name = c.name || id;
  const nameEn = integrationEn(c);
  const n = int(24, 960);
  const t = (title, titleEn, extra = {}) => ({ title: `محاكاة: ${title}`, titleEn: `Simulated: ${titleEn}`, count: n, ...extra });
  if (id.startsWith('primavera')) return t(`${name}: مزامنة ${num(n)} نشاطاً · المسار الحرج محدّث`, `${nameEn}: ${enN(n)} activities synced · critical path refreshed`);
  if (id.startsWith('autodesk')) return t(`${name}: استخراج كميات من النموذج — ${num(n)} عنصراً`, `${nameEn}: model quantities extracted — ${enN(n)} elements`);
  if (id.startsWith('oracle-erp') || id.startsWith('sap')) return t(`${name}: ${num(n)} قيداً مالياً جديداً`, `${nameEn}: ${enN(n)} new financial entries`);
  if (id.includes('crm') || id.startsWith('hubspot') || id.startsWith('zoho')) { const k = int(3, 40); return t(`${name}: تحديث ${num(k)} سجلاً للعملاء والعقود`, `${nameEn}: ${enN(k)} customer and contract records updated`, { count: k }); }
  if (id === 'biltix-contracts') { const k = int(1, 9); return t(`${name}: ${num(k)} مستندات جديدة إلى محرك NLP`, `${nameEn}: ${enN(k)} new documents sent to the NLP engine`, { count: k }); }
  if (id === 'biltix-boq') return t(`${name}: تحديث ${num(n)} بنداً`, `${nameEn}: ${enN(n)} items updated`);
  if (id === 'biltix-schedule') return t(`${name}: ${num(n)} نشاطاً متزامناً مع P6`, `${nameEn}: ${enN(n)} activities aligned with P6`);
  if (id === 'biltix-site-reports') { const k = int(4, 28); return t(`${name}: ${num(k)} تقريراً يومياً إلى ذكاء الموقع`, `${nameEn}: ${enN(k)} daily reports sent to site intelligence`, { count: k }); }
  if (id === 'biltix-images') { const k = int(40, 420); return t(`${name}: ${num(k)} صورة موقع جديدة`, `${nameEn}: ${enN(k)} new site photos`, { count: k }); }
  if (id === 'biltix-cost') { const k = int(6, 60); return t(`${name}: تحديث ${num(k)} سطر ميزانية`, `${nameEn}: ${enN(k)} budget lines updated`, { count: k }); }
  if (id === 'feed-commodities') {
    const com = pick(arr('commodities')) || { name: 'حديد التسليح' };
    const change = round1((rand() - 0.45) * 4);
    const comEn = (com.id && dataEn('commodities', com.id, 'name')) || 'rebar';
    return { title: `محاكاة: مؤشرات السلع — سعر ${com.name} (${signedPct(change)})`, titleEn: `Simulated: commodity indices — ${comEn} price (${enSignedPct(change)})`, pct: change, subject: com.name };
  }
  if (id === 'feed-fx-sama') {
    const eur = round1(4.05 + rand() * 0.1);
    const cny = Number((0.51 + rand() * 0.02).toFixed(3));
    return { title: `محاكاة: أسعار الصرف (ساما) — EUR ${num(eur, 2)} · CNY ${num(cny, 3)} · USD ${num(3.75, 2)} (مثبّت)`, titleEn: `Simulated: exchange rates (SAMA) — EUR ${enN(eur, 2)} · CNY ${enN(cny, 3)} · USD 3.75 (pegged)`, value: eur, unit: 'ر.س/EUR', rates: { EUR: eur, CNY: cny, USD: 3.75 } };
  }
  if (id === 'feed-weather-ncm') {
    const wind = int(14, 48);
    const pid = randomProjectId();
    return { title: `محاكاة: المركز الوطني للأرصاد — توقعات 7 أيام · رياح ${num(wind)} كم/س في ${siteName(pid) || 'المواقع'}`, titleEn: `Simulated: National Center for Meteorology — 7-day forecast · wind ${enN(wind)} km/h at ${projectEn(pid) || 'the sites'}`, value: wind, unit: 'كم/س', days: 7 };
  }
  if (id === 'feed-gis') { const k = int(2, 9); return t(`طبقات GIS: تحديث ${num(k)} طبقات`, `GIS layers: ${enN(k)} layers updated`, { count: k }); }
  return t(`${name}: مزامنة ${num(n)} سجلاً`, `${nameEn}: ${enN(n)} records synced`);
}

function connectorEvent() {
  const list = arr('connectors').filter((c) => c && (c.status === 'connected' || c.status === 'degraded'));
  const c = pick(list) || { id: 'primavera-p6', name: 'Oracle Primavera P6 EPPM', status: 'connected' };
  const latency = clamp(Math.round((Number(c.latencyMs) || 240) * (0.85 + rand() * 0.3)), 60, 4000);
  if (list.length) {
    const patch = { lastSync: localISO(new Date()), latencyMs: latency };
    if (c.status === 'degraded' && chance(0.25)) patch.status = 'connected';
    S.updateConnector(c.id, patch);
  }
  if (c.status === 'degraded') {
    return {
      type: 'connector', tone: 'warning', siteId: null, sourceId: c.id,
      title: `محاكاة: ${c.name} — زمن استجابة مرتفع (${num(latency)} م.ث)`,
      titleEn: `Simulated: ${integrationEn(c)} — high latency (${enN(latency)} ms)`,
      detail: 'سيناريو تجريبي لموصل متدهور · قيمة توضيحية', detailEn: 'Demo scenario of a degraded connector · illustrative value',
      ms: latency, source: c.name,
    };
  }
  const { title, titleEn, ...payload } = connectorTitle(c);
  return {
    type: 'connector', tone: 'accent', siteId: null, sourceId: c.id, title, titleEn,
    detail: `${c.mode === 'read+writeback' ? 'قراءة + كتابة عكسية' : 'قراءة فقط'} · ${num(latency)} م.ث (قيمة توضيحية)`,
    detailEn: `${c.mode === 'read+writeback' ? 'Read + write-back' : 'Read only'} · ${enN(latency)} ms (illustrative)`,
    ms: latency, source: c.name, ...payload,
  };
}

function writebackEvent() {
  const synced = arr('tasks').filter((t) => t && t.writeback && t.writeback.status === 'synced');
  const t = pick(synced);
  if (!t) {
    return {
      type: 'writeback', tone: 'accent', siteId: null, sourceId: 'biltix-pm',
      title: `محاكاة: ${PM_NAME} — لا تغييرات معلّقة للكتابة العكسية`,
      titleEn: 'Simulated: BILTIX PM — no pending write-back changes',
      detail: 'الكتابة العكسية تقتصر على الأعلام والدرجات والتنبيهات ومهام المعالجة', detailEn: 'Write-back is limited to risk flags, scores, alerts and mitigation tasks',
      source: PM_SOURCE,
    };
  }
  const risk = arr('aiRisks').find((r) => r && r.id === t.riskId);
  return {
    type: 'writeback', tone: 'accent', siteId: t.projectId, sourceId: 'biltix-pm', refId: t.id,
    title: risk
      ? `محاكاة: ${PM_NAME} — علم المخاطرة ${nbh(risk.code)} ودرجتها (${num(risk.score)}) للمهمة ${nbh(t.code)}`
      : `محاكاة: ${PM_NAME} — الكتابة العكسية للمهمة ${nbh(t.code)}`,
    titleEn: risk
      ? `Simulated: BILTIX PM — risk flag ${codeEn(risk.code)} and score (${enN(risk.score)}) for task ${codeEn(t.code)}`
      : `Simulated: BILTIX PM — write-back for task ${codeEn(t.code)}`,
    detail: [t.title, siteName(t.projectId)].filter(Boolean).join(' · '),
    detailEn: [dataEn('tasks', t.id, 'title') || latinOnly(t.titleEn), projectEn(t.projectId)].filter(Boolean).join(' · '),
    source: PM_SOURCE, code: t.code, riskCode: risk ? risk.code : undefined, score: risk ? Number(risk.score) : undefined,
  };
}

function taskEvent() {
  const open = arr('tasks').filter((t) => t && OPEN_TASK.includes(t.status));
  const fresh = open.filter((t) => t.status === 'جديدة');
  if (fresh.length && chance(0.35)) {
    const t = pick(fresh);
    S.updateTask(t.id, { status: 'قيد التنفيذ', by: t.owner }); // the store emits the (bilingual) feed event
    return null;
  }
  const t = pick(open);
  if (!t) {
    return { type: 'task', tone: 'accent', siteId: null, sourceId: 'biltix-pm', title: 'مهام المعالجة: لا مهام مفتوحة', titleEn: 'Mitigation tasks: none open', detail: 'يُنشئ المحرك مهمة جديدة عند قبول أي توصية', detailEn: 'A new task is created whenever a recommendation is accepted' };
  }
  const notes = [
    ['تم التواصل مع المقاول من الباطن وتحديد موعد التنفيذ', 'subcontractor contacted and the work date set'],
    ['بانتظار اعتماد الإدارة القانونية على الصياغة البديلة', 'awaiting legal approval of the alternative wording'],
    ['أُرسل طلب الشراء البديل إلى المورد الثاني', 'alternative purchase request sent to the second supplier'],
    ['تم تحديث الجدول الزمني في Primavera P6', 'schedule updated in Primavera P6'],
    ['جولة تحقق ميدانية مجدولة صباح الغد', 'field verification walk scheduled for tomorrow morning'],
    ['رُفعت الأدلة والصور إلى سجل المهمة', 'evidence and photos uploaded to the task record'],
  ];
  const [note, noteEn] = pick(notes);
  return {
    type: 'task', tone: t.status === 'متأخرة' ? 'serious' : 'accent', siteId: t.projectId, sourceId: 'biltix-pm', refId: t.id,
    title: `محاكاة: ${t.owner || 'المسؤول'} أضاف تحديثاً على ${nbh(t.code)} — ${note}`,
    titleEn: `Simulated: ${personEn(t.owner, 'the owner')} updated ${codeEn(t.code)} — ${noteEn}`,
    detail: [t.title, `الحالة: ${t.status}`].filter(Boolean).join(' · '),
    detailEn: [dataEn('tasks', t.id, 'title') || latinOnly(t.titleEn), `Status: ${enumEn('taskStatus', t.status)}`].filter(Boolean).join(' · '),
    code: t.code, source: PM_SOURCE,
  };
}

const GENERATORS = [
  [aiEvent, 30],
  [connectorEvent, 25],
  [validationEvent, 20],
  [taskEvent, 15],
  [writebackEvent, 10],
];

function oneFeedEvent(kind) {
  const table = { ai: aiEvent, connector: connectorEvent, validation: validationEvent, task: taskEvent, writeback: writebackEvent };
  const gen = (kind && table[kind]) || weightedPick(GENERATORS);
  let event = null;
  try { event = gen(); } catch (error) { console.warn('[بلتكس Risk AI] تعذر توليد حدث البث:', error && error.message ? error.message : error); }
  return event ? emit(event) : null;
}

/* ────────────────────────────── AI risk detection (~3 min) ────────────────────────────── */

/** Likelihood × impact pairs per rating band (severity = L × I × 4; red ≥ 70, yellow 40–69, green < 40). */
const LI_BANDS = {
  red: [[4, 5], [5, 4], [5, 5]],
  yellow: [[4, 4], [3, 4], [4, 3], [3, 5], [5, 3], [2, 5], [5, 2]],
  green: [[3, 3], [2, 4], [4, 2], [2, 3], [3, 2], [2, 2], [1, 5], [5, 1], [1, 4], [1, 3]],
};

function liForBand() {
  const band = weightedPick([['red', 35], ['yellow', 40], ['green', 25]]);
  const [likelihood, impact] = pick(LI_BANDS[band]);
  return { likelihood, impact, score: likelihood * impact * 4 };
}

function contractContext(projectId) {
  const list = arr('contracts').filter((c) => c && c.projectId === projectId);
  const c = pick(list.length ? list : arr('contracts')) || { code: `CT-2026-0${int(10, 99)}`, title: 'عقد مقاولة رئيسي', counterparty: 'شركة الإنشاءات الحديثة', valueSAR: 48_000_000, clauses: [] };
  const clauses = Array.isArray(c.clauses) ? c.clauses : [];
  const idx = clauses.length ? Math.floor(rand() * clauses.length) : -1;
  const clause = idx >= 0 ? clauses[idx] : { ref: `${int(8, 20)}.${int(1, 6)}`, title: 'غرامات التأخير' };
  const clauseTitleEn = (c.id && idx >= 0 && dataAt('contracts', c.id, 'clauses', idx, 'title')) || 'delay damages';
  const counterpartyEn = (c.id && dataEn('contracts', c.id, 'counterparty')) || personEn(c.counterparty, 'the counterparty');
  return { c, clause, clauseTitleEn, counterpartyEn };
}

const DETECTORS = {
  contract(projectId, score) {
    const { c, clause, clauseTitleEn, counterpartyEn } = contractContext(projectId);
    const exposure = Math.round((Number(c.valueSAR) || 40_000_000) * (0.04 + rand() * 0.08));
    const k = clamp(score - int(28, 40), 10, 45);
    const k2 = clamp(score - int(30, 45), 8, 40);
    const k3 = clamp(score - int(20, 35), 10, 45);
    const other = `${int(20, 24)}.${int(1, 4)}`;
    const variants = [
      {
        title: `بند غرامات تأخير بلا سقف في ${c.code} §${clause.ref}`, titleEn: `Uncapped delay damages in ${c.code} §${clause.ref}`,
        type: 'Conflict',
        driver: `البند ${clause.ref} («${clause.title}») في ${c.code} لا يضع سقفاً لغرامات التأخير بينما المعيار السوقي 10% من قيمة العقد؛ التعرض المقدّر عند تأخر 45 يوماً يبلغ ${sar(exposure)} ويرتبط بنشاطين على المسار الحرج.`,
        driverEn: `Clause ${clause.ref} ("${clauseTitleEn}") of ${c.code} sets no cap on delay damages while the market benchmark is 10% of the contract value; the estimated exposure for a 45-day delay is ${sarEn(exposure)} and is tied to two critical-path activities.`,
        excerpt: 'يلتزم المقاول بدفع غرامة تأخير قدرها 0.5% من قيمة العقد عن كل أسبوع تأخير دون حد أقصى.', excerptEn: 'The contractor shall pay delay damages of 0.5% of the contract value for each week of delay, without a maximum.',
        action: `طلب تعديل البند ${clause.ref} بسقف 10% وربط الغرامات بالمسار الحرج فقط`, actionEn: `Request an amendment to clause ${clause.ref} with a 10% cap and damages tied to the critical path only`,
        rationale: 'تحويل التزام مفتوح إلى تعرض محدود يمكن تسعيره وتأمينه.', rationaleEn: 'Turns an open-ended liability into a bounded exposure that can be priced and insured.',
        impact: `خفض الدرجة إلى ~${k}`, impactEn: `Reduce the score to ~${k}`,
        alternatives: ['إدراج فترة سماح 14 يوماً قبل سريان الغرامة', 'الاتفاق على برنامج تعويضي زمني بدل الغرامة المالية'], alternativesEn: ['Add a 14-day grace period before damages apply', 'Agree a time-based recovery programme instead of financial damages'],
        stakeholders: ['PM', 'Legal', 'Finance'],
      },
      {
        title: `غياب شرط التأمين ضد مسؤولية الغير لدى ${c.counterparty}`, titleEn: `No third-party liability insurance clause for ${counterpartyEn}`,
        type: 'Financial',
        driver: `لا يتضمن ${c.code} بنداً يلزم ${c.counterparty} بتأمين مسؤولية الغير أو تأمين جميع أخطار المقاولين؛ أي حادث في الموقع ينقل التعرض (${sar(exposure)}) إلى المالك مباشرة.`,
        driverEn: `${c.code} has no clause requiring ${counterpartyEn} to carry third-party liability or contractors' all-risk insurance; any site accident moves the exposure (${sarEn(exposure)}) straight to the owner.`,
        excerpt: 'تنتهي التزامات الطرف الثاني عند تسليم الأعمال المنفذة وفق المواصفات.', excerptEn: "The second party's obligations end upon handover of the executed works per the specifications.",
        action: 'إضافة بند تأمين CAR وتأمين مسؤولية الغير بحد أدنى 10 ملايين ر.س قبل بدء الأعمال', actionEn: 'Add CAR and third-party liability insurance clauses with a minimum of SAR 10M before work starts',
        rationale: 'إغلاق فجوة تأمينية تُعد من أعلى مصادر النزاعات في عقود الإنشاء.', rationaleEn: 'Closes an insurance gap that is one of the most common sources of construction disputes.',
        impact: `خفض الدرجة إلى ~${k2}`, impactEn: `Reduce the score to ~${k2}`,
        alternatives: ['إدراج المقاول من الباطن تحت وثيقة المالك مقابل خصم'], alternativesEn: ["Endorse the subcontractor on the owner's policy against a deduction"],
        stakeholders: ['Legal', 'Procurement', 'Finance'],
      },
      {
        title: `تعارض في مدد الإشعار بين §${clause.ref} و§${other} في ${c.code}`, titleEn: `Conflicting notice periods between §${clause.ref} and §${other} in ${c.code}`,
        type: 'Conflict',
        driver: `يحدد البند ${clause.ref} مهلة إشعار 7 أيام بينما يشترط بند التحكيم 28 يوماً؛ الغموض يرفع احتمال النزاع عند أول مطالبة تمديد.`,
        driverEn: `Clause ${clause.ref} sets a 7-day notice period while the arbitration clause requires 28 days; the ambiguity raises the chance of a dispute at the first extension claim.`,
        excerpt: 'يُقدَّم الإشعار خلال سبعة أيام من وقوع الحدث… ولا تُقبل المطالبات بعد ثمانية وعشرين يوماً.', excerptEn: 'Notice shall be given within seven days of the event… and no claim is accepted after twenty-eight days.',
        action: 'توحيد مدد الإشعار في ملحق توضيحي يوقّعه الطرفان', actionEn: 'Align the notice periods in a clarification addendum signed by both parties',
        rationale: 'إزالة الغموض قبل أن يتحول إلى مطالبة.', rationaleEn: 'Removes the ambiguity before it turns into a claim.',
        impact: `خفض الدرجة إلى ~${k3}`, impactEn: `Reduce the score to ~${k3}`,
        alternatives: ['اعتماد المدة الأطول تفسيرياً عبر خطاب متبادل'], alternativesEn: ['Adopt the longer period by exchange of letters'],
        stakeholders: ['PM', 'Legal'],
      },
    ];
    const v = pick(variants);
    return {
      ...v, score, projectId, category: 'contract',
      evidence: { kind: 'clause', ref: `${c.code} §${clause.ref}`, excerpt: v.excerpt, excerptEn: v.excerptEn, sourceSystem: 'Biltix — العقود' },
      responseParams: {
        PM: { scheduleImpactDays: int(5, 40), costImpactSAR: exposure, criticalPath: chance(0.6) },
        Legal: { clauseRef: `§${clause.ref}`, exposureSAR: exposure, disputeLikelihood: round1(0.2 + rand() * 0.6) },
        Finance: { budgetImpactSAR: exposure, cashflowMonth: `${new Date().getFullYear()}-${pad(((new Date().getMonth() + int(1, 4)) % 12) + 1)}` },
        Procurement: { supplier: c.counterparty, leadTimeDays: int(20, 90), alternates: int(0, 3) },
      },
    };
  },

  bom(projectId, score) {
    const com = pick(arr('commodities')) || { name: 'حديد التسليح', volatilityPct: 14, exposureSAR: 6_500_000, unit: 'طن' };
    const comEn = (com.id && dataEn('commodities', com.id, 'name')) || 'rebar';
    const items = arr('boqItems').filter((b) => b && b.projectId === projectId);
    const boq = pick(items.length ? items : arr('boqItems')) || { code: `BOQ-${int(100, 999)}`, description: 'حديد تسليح قطر 16 مم', leadTimeDays: 45, variancePct: 8 };
    const boqEn = (boq.id && dataEn('boqItems', boq.id, 'description')) || boq.code;
    const supplier = pick(arr('suppliers')) || { name: 'مصنع الصلب الوطني', leadTimeDays: 60, singleSource: true };
    const supplierEn = (supplier.id && dataEn('suppliers', supplier.id, 'name')) || personEn(supplier.name, 'the supplier');
    const pctUp = int(4, 14);
    const site = siteName(projectId);
    const siteEn = projectEn(projectId);
    const lead = supplier.leadTimeDays || 60;
    const k = clamp(score - int(25, 40), 8, 40);
    const k2 = clamp(score - int(22, 38), 10, 42);
    const k3 = clamp(score - int(20, 35), 8, 38);
    const variance = Math.abs(boq.variancePct || int(6, 15));
    const boqQty = boq.boqQty || int(800, 3000);
    const bimQty = boq.bimQty || int(900, 3300);
    const unitAr = boq.unit || 'م³';
    const unitEnS = unitEn(unitAr) || unitAr;
    const variants = [
      {
        title: `ارتفاع متوقع في سعر ${com.name} بنسبة ${pctUp}% خلال 90 يوماً`, titleEn: `${comEn} price expected to rise ${pctUp}% within 90 days`,
        driver: `سلسلة الأسعار لـ24 شهراً تُظهر تقلباً ${com.volatilityPct || 12}% واتجاهاً صاعداً؛ التعرض غير المُغطّى للبند ${boq.code} في ${site} يبلغ ${sar(com.exposureSAR || 4_000_000)}.`,
        driverEn: `The 24-month price series shows ${com.volatilityPct || 12}% volatility and an upward trend; the unhedged exposure of item ${boq.code} at ${siteEn} is ${sarEn(com.exposureSAR || 4_000_000)}.`,
        action: `تثبيت سعر 60% من كمية ${com.name} عبر أمر شراء مبكر خلال 10 أيام`, actionEn: `Lock the price of 60% of the ${comEn} quantity with an early purchase order within 10 days`,
        rationale: 'تحويل تعرض سعري متقلب إلى التزام ثابت قبل موجة الارتفاع.', rationaleEn: 'Turns a volatile price exposure into a fixed commitment before the rise.',
        impact: `خفض الدرجة إلى ~${k}`, impactEn: `Reduce the score to ~${k}`,
        alternatives: ['عقد توريد بسقف سعري مع المورد البديل', 'إعادة جدولة الصبات لتأجيل 20% من الكمية'], alternativesEn: ['Price-capped supply contract with the alternate supplier', 'Re-sequence pours to defer 20% of the quantity'],
        kind: 'boq', ref: boq.code, excerpt: `${boq.description} — مهلة ${boq.leadTimeDays || 45} يوماً`, excerptEn: `${boqEn} — lead time ${boq.leadTimeDays || 45} days`, sourceSystem: 'مؤشرات السلع',
        stakeholders: ['Procurement', 'Finance', 'PM'],
      },
      {
        title: `مورد وحيد المصدر للبند ${boq.code}: ${supplier.name} بمهلة ${lead} يوماً`, titleEn: `Single-source supplier for item ${boq.code}: ${supplierEn}, ${lead}-day lead time`,
        driver: `${supplier.name} هو المصدر الوحيد لـ«${boq.description}» وتصنيفه الائتماني ${supplier.creditRating || 'B'}؛ أي تعثر يؤخر الطلب المطلوب بتاريخ ${boq.requiredBy || plusDays(35)} بما لا يقل عن ${int(20, 45)} يوماً.`,
        driverEn: `${supplierEn} is the only source of "${boqEn}" with credit rating ${supplier.creditRating || 'B'}; any default delays the order needed on ${boq.requiredBy || plusDays(35)} by at least ${int(20, 45)} days.`,
        action: `تأهيل مورد بديل وتقسيم الكمية 70/30 قبل تاريخ الطلب ${boq.orderBy || plusDays(12)}`, actionEn: `Qualify an alternate supplier and split the quantity 70/30 before the order date ${boq.orderBy || plusDays(12)}`,
        rationale: 'كسر الاعتماد على مصدر واحد في بند على المسار الحرج.', rationaleEn: 'Breaks the dependence on a single source for a critical-path item.',
        impact: `خفض الدرجة إلى ~${k2}`, impactEn: `Reduce the score to ~${k2}`,
        alternatives: ['اتفاقية مخزون احتياطي لدى المورد الحالي'], alternativesEn: ['Safety-stock agreement with the current supplier'],
        kind: 'supplier', ref: supplier.name, excerpt: `حصة الإنفاق ${supplier.shareOfSpendPct || 18}% · أداء التسليم ${supplier.deliveryPerformancePct || 82}%`, excerptEn: `Share of spend ${supplier.shareOfSpendPct || 18}% · delivery performance ${supplier.deliveryPerformancePct || 82}%`, sourceSystem: 'Oracle ERP',
        stakeholders: ['Procurement', 'PM'],
      },
      {
        title: `فرق كمية BoQ↔BIM بنسبة ${variance}% في البند ${boq.code}`, titleEn: `BoQ↔BIM quantity variance of ${variance}% on item ${boq.code}`,
        driver: `كمية جدول الكميات ${boqQty} ${unitAr} مقابل ${bimQty} ${unitAr} من النموذج (Autodesk APS)؛ الفرق يعني طلب شراء ناقصاً أو زائداً في ${site}.`,
        driverEn: `The BoQ quantity is ${enN(boqQty)} ${unitEnS} against ${enN(bimQty)} ${unitEnS} in the model (Autodesk APS); the gap means an under- or over-sized purchase order at ${siteEn}.`,
        action: 'مراجعة الكميات مع الاستشاري وتصحيح أمر الشراء قبل الإصدار', actionEn: 'Review the quantities with the consultant and correct the purchase order before issue',
        rationale: 'منع نقص المواد في الموقع أو هدر رأس المال العامل.', rationaleEn: 'Prevents material shortages on site or tied-up working capital.',
        impact: `خفض الدرجة إلى ~${k3}`, impactEn: `Reduce the score to ~${k3}`,
        alternatives: ['إصدار أمر الشراء على الكمية الأقل مع خيار زيادة'], alternativesEn: ['Issue the order for the lower quantity with an increase option'],
        kind: 'boq', ref: boq.code, excerpt: boq.description || 'بند جدول كميات', excerptEn: boqEn, sourceSystem: 'Autodesk APS',
        stakeholders: ['PM', 'Procurement'],
      },
    ];
    const v = pick(variants);
    return {
      ...v, type: 'Financial', score, projectId, category: 'bom',
      evidence: { kind: v.kind, ref: v.ref, excerpt: v.excerpt, excerptEn: v.excerptEn, sourceSystem: v.sourceSystem },
      responseParams: {
        Procurement: { supplier: supplier.name, leadTimeDays: lead, alternates: int(0, 2) },
        Finance: { budgetImpactSAR: Math.round((com.exposureSAR || 4_000_000) * pctUp / 100), cashflowMonth: plusDays(60).slice(0, 7) },
        PM: { scheduleImpactDays: int(5, 30), costImpactSAR: Math.round((com.exposureSAR || 4_000_000) * pctUp / 100), criticalPath: chance(0.5) },
      },
    };
  },

  schedule(projectId, score) {
    const tasks = arr('scheduleTasks').filter((t) => t && t.projectId === projectId);
    const t = pick(tasks.length ? tasks : arr('scheduleTasks')) || { code: `A${int(1000, 1990)}`, name: 'صب بلاطة الطابق 23', floatDays: 2, baselineFinish: plusDays(20) };
    const tEn = (t.id && dataEn('scheduleTasks', t.id, 'name')) || t.code;
    const approvals = arr('approvals').filter((a) => a && a.projectId === projectId);
    const ap = pick(approvals.length ? approvals : arr('approvals')) || { authority: 'الدفاع المدني', type: 'موافقة أنظمة الحريق', elapsedDays: 26, statutoryDays: 30 };
    const apAuthEn = (ap.id && dataEn('approvals', ap.id, 'authority')) || personEn(ap.authority, 'the authority');
    const apTypeEn = (ap.id && dataEn('approvals', ap.id, 'type')) || 'approval';
    const prob = int(55, 92);
    const days = int(6, 28);
    const site = siteName(projectId);
    const siteEn = projectEn(projectId);
    const k = clamp(score - int(25, 40), 8, 40);
    const k2 = clamp(score - int(20, 35), 10, 42);
    const k3 = clamp(score - int(20, 32), 8, 38);
    const wind = int(38, 60);
    const lifts = int(2, 5);
    const variants = [
      {
        title: `احتمال تأخير ${prob}% للنشاط الحرج ${t.code} — ${t.name}`, titleEn: `${prob}% delay probability for critical activity ${t.code} — ${tEn}`,
        driver: `نموذج الجدول (Monte Carlo 5,000 تشغيل) يقدّر تأخيراً متوقعاً ${days} يوماً للنشاط ${t.code} بطفو ${t.floatDays ?? 2} أيام فقط؛ المحركات: تأخر توريد المواد وأداء المقاول من الباطن.`,
        driverEn: `The schedule model (Monte Carlo, 5,000 runs) estimates an expected ${days}-day delay for activity ${t.code} with only ${t.floatDays ?? 2} days of float; drivers: late material deliveries and subcontractor performance.`,
        action: 'إضافة وردية مسائية للمقاول من الباطن وتقديم طلب المواد أسبوعين', actionEn: 'Add an evening shift for the subcontractor and bring the material order forward by two weeks',
        rationale: 'استعادة الطفو قبل أن ينتقل التأخير إلى الأنشطة اللاحقة.', rationaleEn: 'Recovers float before the delay passes to successor activities.',
        impact: `خفض الدرجة إلى ~${k}`, impactEn: `Reduce the score to ~${k}`,
        alternatives: ['تجزئة النشاط وتنفيذه بالتوازي', 'تحويل الموارد من نشاط غير حرج'], alternativesEn: ['Split the activity and run the parts in parallel', 'Move resources from a non-critical activity'],
        kind: 'task', ref: t.code, excerpt: `${t.name} — الانتهاء الأساسي ${t.baselineFinish || plusDays(20)}`, excerptEn: `${tEn} — baseline finish ${t.baselineFinish || plusDays(20)}`, sourceSystem: 'Primavera P6',
        stakeholders: ['PM', 'Site', 'PMO'],
      },
      {
        title: `موافقة ${ap.authority} (${ap.type}) تجاوزت 80% من المدة النظامية`, titleEn: `${apAuthEn} approval (${apTypeEn}) past 80% of the statutory period`,
        driver: `مضى ${ap.elapsedDays || 26} يوماً من أصل ${ap.statutoryDays || 30} على طلب ${ap.type} لدى ${ap.authority}؛ أي تأخير يوقف نشاطات ${site} المعتمدة على الموافقة.`,
        driverEn: `${ap.elapsedDays || 26} of ${ap.statutoryDays || 30} days have passed on the ${apTypeEn} request with ${apAuthEn}; any delay stops the ${siteEn} activities that depend on it.`,
        action: 'تصعيد الطلب عبر مدير العلاقات الحكومية وتجهيز المستندات التكميلية', actionEn: 'Escalate the request through the government-relations manager and prepare the supporting documents',
        rationale: 'تقليص زمن الانتظار قبل انقضاء المدة النظامية.', rationaleEn: 'Shortens the wait before the statutory period runs out.',
        impact: `خفض الدرجة إلى ~${k2}`, impactEn: `Reduce the score to ~${k2}`,
        alternatives: ['إعادة ترتيب الأنشطة غير المعتمدة على الموافقة'], alternativesEn: ['Re-sequence the activities that do not depend on the approval'],
        kind: 'approval', ref: `${ap.authority} — ${ap.type}`, excerpt: `${ap.elapsedDays || 26}/${ap.statutoryDays || 30} يوماً`, excerptEn: `${ap.elapsedDays || 26}/${ap.statutoryDays || 30} days`, sourceSystem: 'Biltix — تقارير الموقع',
        stakeholders: ['PM', 'Legal', 'PMO'],
      },
      {
        title: `عاصفة غبار متوقعة توقف أعمال الرفع في ${site || 'الموقع'} خلال 72 ساعة`, titleEn: `Forecast dust storm halts lifting at ${siteEn || 'the site'} within 72 hours`,
        driver: `توقعات المركز الوطني للأرصاد: رياح ${wind} كم/س وغبار عالٍ لمدة يومين؛ ${lifts} أنشطة رفع حرجة مجدولة في النافذة نفسها.`,
        driverEn: `National Center for Meteorology forecast: ${wind} km/h winds and heavy dust for two days; ${lifts} critical lifting activities are scheduled in the same window.`,
        action: 'إعادة جدولة أعمال الرفع إلى ما بعد النافذة وتثبيت الحمولات والرافعات', actionEn: 'Reschedule the lifts after the window and secure loads and cranes',
        rationale: 'منع تأخير قسري مع تقليل مخاطر السلامة.', rationaleEn: 'Avoids a forced delay while reducing the safety risk.',
        impact: `خفض الدرجة إلى ~${k3}`, impactEn: `Reduce the score to ~${k3}`,
        alternatives: ['تقديم أعمال داخلية غير حساسة للطقس'], alternativesEn: ['Bring forward indoor work that is not weather-sensitive'],
        kind: 'task', ref: t.code, excerpt: 'نشاط حساس للطقس على المسار الحرج', excerptEn: 'Weather-sensitive activity on the critical path', sourceSystem: 'المركز الوطني للأرصاد',
        stakeholders: ['PM', 'Site'],
      },
    ];
    const v = pick(variants);
    return {
      ...v, type: 'Delay', score, projectId, category: 'schedule',
      evidence: { kind: v.kind, ref: v.ref, excerpt: v.excerpt, excerptEn: v.excerptEn, sourceSystem: v.sourceSystem },
      responseParams: {
        PM: { scheduleImpactDays: days, costImpactSAR: days * int(60_000, 140_000), criticalPath: true },
        Site: { location: site, hazard: 'توقف/ازدحام أنشطة', controls: 'إعادة تسلسل الأعمال' },
        PMO: { trend: 'صاعد', kpi: 'SPI', portfolioRank: int(1, 6) },
        Legal: { clauseRef: '§8.4 تمديد المدة', exposureSAR: days * int(60_000, 140_000), disputeLikelihood: round1(0.1 + rand() * 0.4) },
      },
    };
  },

  site(projectId, score) {
    const ZONES = [
      ['المنطقة أ — الحافة الشرقية', 'Zone A — east edge'], ['المنطقة ب — بئر المصعد', 'Zone B — lift shaft'], ['المنطقة ج — المستوى 12', 'Zone C — level 12'],
      ['ساحة الرافعة البرجية', 'Tower-crane yard'], ['المستودع 3', 'Warehouse 3'],
    ];
    const [zone, zoneEnName] = pick(ZONES);
    const site = siteName(projectId);
    const siteEn = projectEn(projectId);
    const k = clamp(score - int(30, 45), 8, 35);
    const k2 = clamp(score - int(25, 40), 10, 40);
    const k3 = clamp(score - int(25, 38), 8, 36);
    const photos = int(40, 300);
    const cases = int(2, 6);
    const nm = int(3, 7);
    const lti = int(18, 42);
    const wbgt = round1(30 + rand() * 3);
    const heatCases = int(1, 4);
    const variants = [
      {
        title: `كشف صوري: عمال بدون حزام أمان على الحافة — ${zone}`, titleEn: `Image detection: workers without a harness at the edge — ${zoneEnName}`,
        driver: `حلّل ذكاء الموقع ${photos} صورة من تقارير اليوم ورصد ${cases} حالات عمل على الحافة دون تثبيت، مع تكرار النمط في 3 أيام من أصل 5 في ${site}.`,
        driverEn: `Site intelligence analysed ${photos} photos from today's reports and found ${cases} cases of edge work without tie-off, a pattern seen on 3 of the last 5 days at ${siteEn}.`,
        action: 'إيقاف العمل على الحافة فوراً وتركيب خطوط حياة ثم جلسة توعية قبل الاستئناف', actionEn: 'Stop edge work immediately, install lifelines and hold a briefing before restarting',
        rationale: 'السقوط من ارتفاع هو السبب الأول للوفيات في مواقع الإنشاء.', rationaleEn: 'Falls from height are the leading cause of fatalities on construction sites.',
        impact: `خفض الدرجة إلى ~${k}`, impactEn: `Reduce the score to ~${k}`,
        alternatives: ['حواجز حافة مؤقتة معتمدة بدل خطوط الحياة'], alternativesEn: ['Approved temporary edge barriers instead of lifelines'],
        kind: 'image', ref: `IMG-${int(10_000, 99_999)}`, excerpt: 'ثقة الكشف 0.91 · 4 أشخاص داخل منطقة الحافة', excerptEn: 'Detection confidence 0.91 · 4 people inside the edge zone', sourceSystem: 'Biltix — تقارير الموقع',
        hazard: 'السقوط من ارتفاع', controls: 'خطوط حياة + حواجز حافة',
      },
      {
        title: `نمط متكرر من الحوادث الوشيكة في ${zone} خلال 14 يوماً`, titleEn: `Recurring near-miss pattern in ${zoneEnName} over 14 days`,
        driver: `${nm} حوادث وشيكة من النوع نفسه (حركة معدات ثقيلة قرب العمال) في نطاق 30 م؛ النموذج التنبؤي يرفع احتمال إصابة مضيعة للوقت خلال 30 يوماً إلى ${lti}%.`,
        driverEn: `${nm} near misses of the same kind (heavy equipment moving close to workers) within 30 m; the predictive model raises the probability of a lost-time injury within 30 days to ${lti}%.`,
        action: 'فصل مسارات المشاة عن المعدات بحواجز صلبة وتعيين مراقب حركة', actionEn: 'Separate pedestrian routes from equipment with hard barriers and assign a traffic marshal',
        rationale: 'معالجة السبب المشترك بدل الاستجابة لكل حادث وشيك على حدة.', rationaleEn: 'Treats the common cause instead of reacting to each near miss separately.',
        impact: `خفض الدرجة إلى ~${k2}`, impactEn: `Reduce the score to ~${k2}`,
        alternatives: ['جدولة حركة المعدات خارج أوقات الذروة'], alternativesEn: ['Schedule equipment movements outside peak hours'],
        kind: 'inspection', ref: `INS-${int(900, 999)}`, excerpt: 'تكرار السبب الجذري: ضعف الإشراف', excerptEn: 'Recurring root cause: weak supervision', sourceSystem: 'Biltix — تقارير الموقع',
        hazard: 'المركبات وحركة المرور', controls: 'فصل مسارات + مراقب حركة',
      },
      {
        title: `قراءات WBGT فوق الحد ثلاثة أيام متتالية في ${site || 'الموقع'}`, titleEn: `WBGT above the limit for three consecutive days at ${siteEn || 'the site'}`,
        driver: `الحساسات سجلت WBGT ${wbgt}°م بين 11:00 و15:00 لثلاثة أيام، وتقارير الموقع تُظهر ${heatCases} حالات إجهاد حراري؛ جدول العمل/الراحة الحالي غير كافٍ.`,
        driverEn: `Sensors recorded WBGT ${wbgt}°C between 11:00 and 15:00 for three days and site reports show ${heatCases} heat-stress cases; the current work/rest schedule is not enough.`,
        action: 'تفعيل جدول 20/40 ونقل الأعمال الثقيلة إلى الفترة الصباحية حتى انخفاض الموجة', actionEn: 'Apply a 20/40 schedule and move heavy work to the morning until the heat wave eases',
        rationale: 'الامتثال لقرار حظر العمل تحت الشمس وتقليل إصابات الإجهاد الحراري.', rationaleEn: 'Complies with the midday work ban and reduces heat-stress injuries.',
        impact: `خفض الدرجة إلى ~${k3}`, impactEn: `Reduce the score to ~${k3}`,
        alternatives: ['محطات تبريد إضافية في كل منطقة'], alternativesEn: ['Extra cooling stations in every zone'],
        kind: 'sensor', ref: `WBGT-${int(1, 14)}`, excerpt: 'تجاوز الحد 30°م لمدة 4 ساعات/يوم', excerptEn: 'Above the 30°C limit for 4 hours a day', sourceSystem: 'بوابة الحساسات',
        hazard: 'الإجهاد الحراري', controls: 'جدول عمل/راحة + تبريد',
      },
    ];
    const v = pick(variants);
    return {
      ...v, type: 'Safety', score, projectId, category: 'site', stakeholders: ['Site', 'PM'],
      evidence: { kind: v.kind, ref: v.ref, excerpt: v.excerpt, excerptEn: v.excerptEn, sourceSystem: v.sourceSystem },
      responseParams: {
        Site: { location: zone, hazard: v.hazard, controls: v.controls },
        PM: { scheduleImpactDays: int(1, 6), costImpactSAR: int(40_000, 220_000), criticalPath: chance(0.3) },
      },
    };
  },

  cost(projectId, score) {
    const lines = arr('costLines').filter((l) => l && l.projectId === projectId);
    const line = pick(lines.length ? lines : arr('costLines')) || { wbs: '1.3.2', name: 'الأعمال الكهروميكانيكية', budget: 12_000_000, forecast: 13_400_000 };
    const lineEn = (line.id && dataEn('costLines', line.id, 'name')) || `WBS ${line.wbs}`;
    const cos = arr('changeOrders').filter((c) => c && c.projectId === projectId && (c.status === 'مقترح' || c.status === 'قيد الاعتماد'));
    const cur = pick(arr('currencies').filter((c) => c && c.code !== 'USD')) || { code: 'EUR', nameAr: 'اليورو', exposureSAR: 9_000_000, change30dPct: 2.4 };
    const cpi = round1(0.84 + rand() * 0.08);
    const over = Math.round((Number(line.forecast) || 13_000_000) - (Number(line.budget) || 12_000_000));
    const coTotal = cos.reduce((s, c) => s + (Number(c.amountSAR) || 0), 0) || int(900_000, 4_800_000);
    const coCount = cos.length || int(3, 7);
    const coShare = round1(1 + rand() * 4);
    const site = siteName(projectId);
    const siteEn = projectEn(projectId);
    const k = clamp(score - int(22, 36), 10, 42);
    const k2 = clamp(score - int(18, 32), 10, 44);
    const k3 = clamp(score - int(25, 40), 8, 38);
    const ch = cur.change30dPct || 2.4;
    const coRef = cos[0] ? cos[0].code : `CO-0${int(30, 59)}`;
    const variants = [
      {
        title: `CPI عند ${cpi} في حزمة ${line.wbs} — ${line.name}`, titleEn: `CPI at ${cpi} on package ${line.wbs} — ${lineEn}`,
        driver: `القيمة المكتسبة أقل من الفعلي بفارق ${sar(Math.abs(over))} مع التزامات غير مُدرجة في التوقع؛ EAC المحدّث يتجاوز الميزانية في ${site}.`,
        driverEn: `Earned value trails actual cost by ${sarEn(Math.abs(over))} with commitments missing from the forecast; the updated EAC exceeds the budget at ${siteEn}.`,
        action: 'تجميد الالتزامات الجديدة في الحزمة ومراجعة EAC مع مدير التكلفة خلال 5 أيام', actionEn: 'Freeze new commitments on the package and review the EAC with the cost manager within 5 days',
        rationale: 'إيقاف النزيف قبل أن ينعكس على VAC للمشروع كله.', rationaleEn: "Stops the overrun before it hits the whole project's VAC.",
        impact: `خفض الدرجة إلى ~${k}`, impactEn: `Reduce the score to ~${k}`,
        alternatives: ['إعادة تسعير الأعمال المتبقية مع المقاول من الباطن'], alternativesEn: ['Re-price the remaining work with the subcontractor'],
        kind: 'cost', ref: `WBS ${line.wbs}`, excerpt: `${line.name} — CPI ${cpi}`, excerptEn: `${lineEn} — CPI ${cpi}`, sourceSystem: 'Oracle ERP',
      },
      {
        title: `زحف أوامر التغيير: ${coCount} أوامر قيد الاعتماد بقيمة ${sar(coTotal)}`, titleEn: `Change-order creep: ${coCount} orders pending approval worth ${sarEn(coTotal)}`,
        driver: `أوامر التغيير المعلّقة تعادل ${coShare}% من قيمة العقد وتشترك في محرك واحد (تغييرات تصميمية متأخرة)؛ اعتمادها يرفع EAC ويؤخر الإغلاق المالي.`,
        driverEn: `Pending change orders equal ${coShare}% of the contract value and share one driver (late design changes); approving them raises the EAC and delays financial close.`,
        action: 'جلسة تحكم تغيير أسبوعية وربط كل أمر بأثره الزمني قبل الاعتماد', actionEn: 'Hold a weekly change-control board and tie every order to its time impact before approval',
        rationale: 'كبح الزحف عند مصدره بدل معالجته في نهاية المشروع.', rationaleEn: 'Curbs the creep at its source instead of at the end of the project.',
        impact: `خفض الدرجة إلى ~${k2}`, impactEn: `Reduce the score to ~${k2}`,
        alternatives: ['تجميع الأوامر الصغيرة في أمر واحد بسعر إجمالي'], alternativesEn: ['Bundle small orders into one lump-sum order'],
        kind: 'changeOrder', ref: coRef, excerpt: cos[0] ? cos[0].title : 'تعديلات تصميمية على الواجهات', excerptEn: (cos[0] && cos[0].id && dataEn('changeOrders', cos[0].id, 'title')) || 'Façade design changes', sourceSystem: 'Biltix — التكلفة',
      },
      {
        title: `تعرض ${cur.nameAr || cur.code} غير مُحوَّط بقيمة ${sar(cur.exposureSAR || 9_000_000)}`, titleEn: `Unhedged ${cur.code} exposure of ${sarEn(cur.exposureSAR || 9_000_000)}`,
        driver: `تغيّر سعر ${cur.code} بنسبة ${ch >= 0 ? '+' : ''}${ch}% خلال 30 يوماً وتوقع استمرار الاتجاه؛ دفعات التوريد المستحقة خلال 90 يوماً مقوّمة بـ${cur.code} دون تحوّط.`,
        driverEn: `${cur.code} moved ${ch >= 0 ? '+' : ''}${ch}% in 30 days and the trend is expected to continue; supply payments due within 90 days are in ${cur.code} with no hedge.`,
        action: 'عقد تحوّط آجل لـ60% من الدفعات المستحقة خلال 90 يوماً', actionEn: 'Forward hedge for 60% of the payments due within 90 days',
        rationale: 'تثبيت تكلفة التوريد المستورد ضمن الميزانية.', rationaleEn: 'Keeps the cost of imported supply within budget.',
        impact: `خفض الدرجة إلى ~${k3}`, impactEn: `Reduce the score to ~${k3}`,
        alternatives: ['تقديم الدفعات مبكراً مقابل خصم من المورد'], alternativesEn: ['Pay early against a supplier discount'],
        kind: 'cost', ref: `FX ${cur.code}`, excerpt: `سعر ${cur.rate || '—'} · التغير 30 يوماً ${ch}%`, excerptEn: `Rate ${cur.rate || '—'} · 30-day change ${ch}%`, sourceSystem: 'أسعار الصرف',
      },
    ];
    const v = pick(variants);
    return {
      ...v, type: 'Financial', score, projectId, category: 'cost', stakeholders: ['Finance', 'PM', 'PMO'],
      evidence: { kind: v.kind, ref: v.ref, excerpt: v.excerpt, excerptEn: v.excerptEn, sourceSystem: v.sourceSystem },
      responseParams: {
        Finance: { budgetImpactSAR: Math.abs(over) || coTotal, cashflowMonth: plusDays(45).slice(0, 7) },
        PM: { scheduleImpactDays: int(0, 12), costImpactSAR: Math.abs(over) || coTotal, criticalPath: chance(0.3) },
        PMO: { trend: 'صاعد', kpi: 'CPI', portfolioRank: int(1, 6) },
      },
    };
  },
};

/** Response SLA per rating (engine policy, stated — not a silent default): red 7 days, amber 14, green 28. */
const SLA_DAYS = { red: 7, yellow: 14, green: 28 };

function buildRisk(category = pick(CATEGORIES)) {
  const projectId = randomProjectId();
  const { likelihood, impact, score } = liForBand();
  const cat = CATEGORIES.includes(category) ? category : 'site';
  const draft = DETECTORS[cat](projectId, score);
  const pipeline = PIPELINE_OF[cat];
  const pipe = arr('pipelines').find((p) => p && p.id === pipeline);
  const effort = pick([['منخفض', 'Low'], ['متوسط', 'Medium'], ['عالٍ', 'High']]);
  const stakeholders = draft.stakeholders || ['PM'];
  return {
    projectId, category: cat, type: draft.type, likelihood, impact, title: draft.title, titleEn: draft.titleEn,
    driverExplanation: draft.driver, driverExplanationEn: draft.driverEn,
    evidence: draft.evidence,
    recommendation: {
      action: draft.action, actionEn: draft.actionEn, rationale: draft.rationale, rationaleEn: draft.rationaleEn,
      effort: effort[0], effortEn: effort[1], impact: draft.impact, impactEn: draft.impactEn,
      alternatives: draft.alternatives || [], alternativesEn: draft.alternativesEn || [],
    },
    pipeline, modelVersion: (pipe && pipe.version) || 'v2.3.1',
    confidence: round1(0.62 + rand() * 0.33),
    status: 'مكتشف',
    // Engine detections are unassigned until a human accepts them (owner null — never invented); the due date
    // follows the stated response SLA of the rating band.
    owner: null, dueDate: plusDays(SLA_DAYS[ratingOf(score)] || 14),
    stakeholders,
    responseParams: Object.fromEntries(Object.entries(draft.responseParams || {}).filter(([role]) => stakeholders.includes(role))),
    simulated: true,
  };
}

function detectRisk(category) {
  if (!S || typeof S.addAiRisk !== 'function') return null;
  try {
    const risk = S.addAiRisk(buildRisk(category), { engine: true });
    if (risk && risk.ok === false) {
      console.warn('[بلتكس Risk AI] رُفضت مخاطرة المحاكاة في التحقق:', (risk.errors || []).map((e) => e.field).join(', '));
      return null;
    }
    if (risk) pruneSimulated();
    return risk;
  } catch (error) {
    console.warn('[بلتكس Risk AI] تعذر توليد مخاطرة جديدة:', error && error.message ? error.message : error);
    return null;
  }
}

/* ────────────────────────────── simulated-record cap ────────────────────────────── */

/**
 * Keep at most SIM_CAPS.aiRisks engine-detected risks. Only risks tagged `simulated: true`
 * that carry no task are candidates: closed/dismissed ones go first (oldest detection first),
 * then untouched fresh ones (مكتشف/تنبيه with no overrides). Alerts that pointed at a pruned
 * risk are removed with it. Seed and user-created records are never pruned.
 * Returns { aiRisks, alerts } removed counts.
 */
function pruneSimulated() {
  const removed = { aiRisks: 0, alerts: 0 };
  if (!S || typeof S.update !== 'function') return removed;
  try {
    const all = arr('aiRisks').filter((r) => r && r.simulated === true);
    let excess = all.length - SIM_CAPS.aiRisks;
    if (excess <= 0) return removed;
    const candidates = all.filter((r) => !r.taskId).sort((a, b) => parseMs(a.detectedAt) - parseMs(b.detectedAt));
    const ids = new Set();
    for (const r of candidates) { if (excess <= 0) break; if (CLOSED_RISK.has(r.status)) { ids.add(r.id); excess -= 1; } }
    for (const r of candidates) {
      if (excess <= 0) break;
      if (!ids.has(r.id) && FRESH_RISK.has(r.status) && !(Array.isArray(r.overrides) && r.overrides.length)) { ids.add(r.id); excess -= 1; }
    }
    if (!ids.size) return removed;
    S.update((state) => {
      const p = state.platform && typeof state.platform === 'object' ? state.platform : {};
      const risks = Array.isArray(p.aiRisks) ? p.aiRisks : [];
      for (let i = risks.length - 1; i >= 0; i -= 1) if (risks[i] && ids.has(risks[i].id)) risks.splice(i, 1);
      const alerts = Array.isArray(p.alerts) ? p.alerts : [];
      for (let i = alerts.length - 1; i >= 0; i -= 1) if (alerts[i] && ids.has(alerts[i].riskId)) { alerts.splice(i, 1); removed.alerts += 1; }
      return 'platform.aiRisks';
    });
    removed.aiRisks = ids.size;
  } catch (error) {
    console.warn('[بلتكس Risk AI] تعذر تقليم السجلات المحاكاة:', error && error.message ? error.message : error);
  }
  return removed;
}

/* ────────────────────────────── 30 s jitter · 60 s overdue ────────────────────────────── */

function jitter() {
  if (!S) return;
  const pipes = arr('pipelines');
  if (pipes.length && typeof S.update === 'function') {
    S.update((state) => {
      const list = state.platform && Array.isArray(state.platform.pipelines) ? state.platform.pipelines : [];
      const now = localISO(new Date());
      for (const p of list) {
        if (!p) continue;
        if (p.status === 'running' || p.status === 'training') {
          if (chance(0.7)) { p.lastRun = now; p.runsToday = (Number(p.runsToday) || 0) + 1; }
          p.avgLatencyMs = clamp(Math.round((Number(p.avgLatencyMs) || 900) * (0.94 + rand() * 0.12)), 80, 20_000);
          if (typeof p.driftScore === 'number') p.driftScore = clamp(round1((p.driftScore + (rand() - 0.5) * 0.02) * 100) / 100, 0, 1);
        }
      }
      return 'platform.pipelines';
    });
  }
  const v = P().validation;
  if (v && Array.isArray(v.sources) && v.sources.length) {
    const sources = v.sources.map((src) => {
      if (!src || !chance(0.5)) return src;
      const batch = int(5, 60);
      const rejected = chance(0.3) ? int(1, 2) : 0;
      const dedup = chance(0.3) ? 1 : 0;
      return {
        ...src,
        recordsIn: (Number(src.recordsIn) || 0) + batch,
        passed: (Number(src.passed) || 0) + Math.max(0, batch - rejected - dedup),
        rejected: (Number(src.rejected) || 0) + rejected,
        deduplicated: (Number(src.deduplicated) || 0) + dedup,
        lastBatch: localISO(new Date()),
      };
    });
    S.updateValidation({ sources });
  }
}

function reflagOverdue() {
  if (!S || typeof S.updateTask !== 'function') return;
  const today = todayISO(new Date());
  const overdue = arr('tasks').filter((t) => t && (t.status === 'جديدة' || t.status === 'قيد التنفيذ') && typeof t.dueDate === 'string' && t.dueDate.slice(0, 10) < today);
  overdue.slice(0, OVERDUE_PER_PASS).forEach((t) => S.updateTask(t.id, { status: 'متأخرة', by: 'النظام' }));
}

/* ────────────────────────────── timers ────────────────────────────── */

function clearTimers() {
  if (feedTimer) clearTimeout(feedTimer);
  if (riskTimer) clearTimeout(riskTimer);
  if (jitterTimer) clearInterval(jitterTimer);
  if (overdueTimer) clearInterval(overdueTimer);
  feedTimer = riskTimer = jitterTimer = overdueTimer = null;
}

function armFeed(delay = int(FEED_MIN_MS, FEED_MAX_MS)) {
  if (feedTimer) clearTimeout(feedTimer);
  feedTimer = setTimeout(() => {
    feedTimer = null;
    if (!active()) return;
    if (!feedPaused()) { ticks += 1; oneFeedEvent(); }
    armFeed();
  }, delay);
}

function armRisk(delay) {
  if (riskTimer) clearTimeout(riskTimer);
  riskTimer = setTimeout(() => {
    riskTimer = null;
    if (!active()) return;
    if (!feedPaused()) detectRisk();
    armRisk(int(RISK_EVERY_MS[0], RISK_EVERY_MS[1]));
  }, delay);
}

function armTimers() {
  clearTimers();
  armFeed(int(2500, 5000));
  armRisk(int(RISK_FIRST_MS[0], RISK_FIRST_MS[1]));
  jitterTimer = setInterval(() => { if (active()) jitter(); }, JITTER_MS);
  overdueTimer = setInterval(() => { if (active() && !feedPaused()) reflagOverdue(); }, OVERDUE_MS);
}

function onVisibility() {
  if (!running) return;
  if (hidden()) {
    suspended = true;
    clearTimers();
  } else if (suspended) {
    suspended = false;
    if (!paused) armTimers();
  }
}

/* ────────────────────────────── public API ────────────────────────────── */

export const platformLive = {
  /** Idempotent. Needs the store; the bus is optional (events still reach store.feed). */
  start({ store, bus } = {}) {
    if (store) S = store;
    if (bus) B = bus;
    if (!S) return false;
    if (running) return true;
    running = true;
    paused = false;
    rand = mulberry32(RNG_SEED);
    suspended = hidden();
    pruneSimulated(); // a long-lived saved state may carry more simulated risks than the cap allows
    if (typeof document !== 'undefined' && !visibilityHandler) {
      visibilityHandler = onVisibility;
      document.addEventListener('visibilitychange', visibilityHandler);
    }
    if (!suspended) armTimers();
    return true;
  },

  stop() {
    running = false;
    paused = false;
    suspended = false;
    clearTimers();
    if (typeof document !== 'undefined' && visibilityHandler) {
      document.removeEventListener('visibilitychange', visibilityHandler);
      visibilityHandler = null;
    }
  },

  pause() {
    if (!running || paused) return;
    paused = true;
    clearTimers();
  },

  resume() {
    if (!running || !paused) return;
    paused = false;
    if (!hidden()) { suspended = false; armTimers(); }
  },

  isRunning() { return running; },
  isPaused() { return paused; },

  /** One simulation step now: a feed event of `kind` ('ai'|'validation'|'connector'|'writeback'|'task'), or 'risk' / 'jitter' / 'overdue'. */
  tick(kind) {
    if (!S) return null;
    if (kind === 'risk') return detectRisk();
    if (kind === 'jitter') { jitter(); return true; }
    if (kind === 'overdue') { reflagOverdue(); return true; }
    ticks += 1;
    return oneFeedEvent(kind);
  },

  /** Force a detection for a given category (demo hook / tests). */
  detectRisk,

  /** Prune simulated AI risks beyond SIM_CAPS.aiRisks; returns { aiRisks, alerts } removed counts. */
  pruneSimulated,
  SIM_CAPS,

  /** Diagnostics for the QA harness. */
  stats() { return { running, paused, suspended, ticks, seed: RNG_SEED }; },
};

export default platformLive;
