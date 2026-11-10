#!/usr/bin/env node
/**
 * BILTIX Risk AI explainer — data extraction (scripts/extract-data.mjs)
 *
 * Every number, chart and story fact in the video is read from the app's own
 * demo dataset and its pure selector modules, then frozen into src/data.json.
 * Nothing in the composition is typed by hand except copy (captions, labels)
 * and the English rendering of the story risk (see EN_STORY below), whose
 * numbers are interpolated from the Arabic source text and cross-checked.
 *
 *   node scripts/extract-data.mjs                 # default story risk
 *   node scripts/extract-data.mjs --risk AIR-1020 # explicit story risk
 *   BILTIX_APP_DIR=/path/to/biltix-hse node scripts/extract-data.mjs
 *
 * Inputs (read-only, pure ES modules — no DOM, no side effects on import):
 *   biltix-hse/js/data/platform-seed.js    Part B platform seed (AI risks, tasks, validation…)
 *   biltix-hse/js/data/seed.js             Part A seed (sites, HSE risk register)
 *   biltix-hse/js/core/platform-selectors.js  psel — scores, ratings, validation, timeline
 *   biltix-hse/js/core/selectors.js        sel — HSE likelihood × severity matrix + tiers
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const APP_DIR = resolve(process.env.BILTIX_APP_DIR || resolve(HERE, '../../biltix-hse'));
const OUT = resolve(HERE, '../src/data.json');
const mod = (p) => import(pathToFileURL(resolve(APP_DIR, p)).href);

const argRisk = (() => {
  const i = process.argv.indexOf('--risk');
  return i > -1 ? process.argv[i + 1] : null;
})();
const STORY_RISK_CODE = argRisk || 'AIR-1020';

const platformMod = await mod('js/data/platform-seed.js');
const seedMod = await mod('js/data/seed.js');
const { psel } = await mod('js/core/platform-selectors.js');
const { sel, TIERS } = await mod('js/core/selectors.js');

// The app's own English enum labels (js/i18n/enums.js), when present.
let EN_ENUM = {};
try {
  EN_ENUM = (await mod('js/i18n/enums.js')).default.en.enum || {};
} catch {
  console.warn('extract-data: js/i18n/enums.js not found — using built-in English labels');
}
const enLabel = (ns, key, fallback) => (EN_ENUM[ns] && EN_ENUM[ns][key]) || fallback;

const platformSeed = platformMod.default;
const seed = seedMod.default;
const { PLATFORM_ANCHOR_DATE, PLATFORM_CATEGORIES, PIPELINE_META } = platformMod;

/* ── fake app state (exactly the shape store.js hands to the selectors) ── */
const state = {
  sites: seed.sites,
  risks: seed.risks, // Part A register — only read by sel.riskMatrix
  platform: platformSeed,
  settings: { platform: { weights: { contract: 0.2, bom: 0.2, schedule: 0.25, site: 0.2, cost: 0.15 } } },
  filters: { siteId: 'all', range: 30, search: '' },
};
// Deterministic "now": the dataset's own anchor day at noon (Riyadh). The app
// re-projects dates to the real today at load; the video keeps the anchor.
const [ay, am, ad] = PLATFORM_ANCHOR_DATE.split('-').map(Number);
const NOW = new Date(ay, am - 1, ad, 12, 0, 0);

const fail = (msg) => {
  console.error(`extract-data: ${msg}`);
  process.exit(1);
};
const num = (re, text, label) => {
  const m = re.exec(String(text || ''));
  if (!m) fail(`could not parse ${label} from: ${text}`);
  return Number(m[1]);
};

/* ── English labels for enum-like values (copy, not data) ── */
const CATEGORY_EN = Object.fromEntries(
  Object.entries({ contract: 'Contracts', bom: 'Materials and procurement', schedule: 'Schedule', site: 'Site and safety', cost: 'Cost' }).map(([k, v]) => [k, enLabel('aiCategory', k, v)]),
);
const RATING_EN = Object.fromEntries(
  Object.entries({ red: ['Red', 'Critical — immediate action'], yellow: ['Yellow', 'High — monitor'], green: ['Green', 'Within tolerance'] }).map(([k, [l, h]]) => [
    k,
    { label: enLabel('rating', k, l), hint: enLabel('ratingHint', k, h) },
  ]),
);
const TIER_EN = { 'منخفض': 'Low', 'متوسط': 'Medium', 'عالٍ': 'High', 'حرج': 'Critical' };
// Validation-source names not covered by the app's sourceSystem enum.
const SOURCE_EN = {
  VS1: 'BILTIX — Contracts', VS2: 'BILTIX — BoQ / BoM', VS3: 'BILTIX — Schedule', VS4: 'BILTIX — Site reports',
  VS5: 'BILTIX — Cost and budget', VS6: 'BILTIX — Photos', VS7: 'Primavera P6 EPPM', VS8: 'Autodesk APS (BIM)',
  VS9: 'Oracle ERP', VS10: 'Commodity indices', VS11: 'Exchange rates (SAMA)', VS12: 'National Center for Meteorology',
  VS13: 'Sensor gateway (MQTT)',
};
const sourceEn = (s) => enLabel('sourceSystem', s.name, SOURCE_EN[s.id]) || fail(`no English name for validation source ${s.id} ${s.name}`);
const PERSON_EN = {
  'م. تركي المطيري': 'Eng. Turki Al-Mutairi',
  'م. ريم السبيعي': 'Eng. Reem Al-Subaie',
  'م. خالد العتيبي': 'Eng. Khalid Al-Otaibi',
  'م. سارة القحطاني': 'Eng. Sara Al-Qahtani',
  'النظام': 'System',
};
const STAKEHOLDER_EN = Object.fromEntries(
  Object.entries({ PM: 'Project manager', Legal: 'Legal', Procurement: 'Procurement', Site: 'Site', Finance: 'Finance', PMO: 'PMO' }).map(([k, v]) => [k, enLabel('stakeholderRole', k, v)]),
);
const ROLE_AR = { hse: 'مسؤول السلامة', pm: 'مدير المشروع' };
const ROLE_EN = { hse: 'HSE lead', pm: 'Project manager' };

/* ── 1. consolidated score, five categories, rating distribution ── */
const cons = psel.consolidatedScore(state, state.filters, NOW);
const categories = cons.categories.map((c) => ({
  id: c.category,
  labelAr: c.label,
  labelEn: CATEGORY_EN[c.category],
  score: c.score,
  rating: c.rating,
  weight: Math.round(cons.weights[c.category] * 100) / 100,
  open: c.open,
  red: c.red,
  yellow: c.yellow,
  green: c.green,
}));
const ratingDistribution = psel.ratingDistribution(state, state.filters, NOW).map((r) => ({
  rating: r.rating, labelAr: r.label, labelEn: RATING_EN[r.rating].label, value: r.value,
}));
const openRisks = psel.openAiRisks(state, state.filters, NOW);

/* ── 2. heatmap / severity ──
 * v3 data: every AI risk carries likelihood (1–5) and impact (1–5) and its
 * score is derived as likelihood × impact × 4 (platform-seed.js liScore). The
 * 5×5 heatmap is therefore counted directly from the OPEN AI risks (same
 * filter as the consolidated score), each cell coloured by the platform
 * rating of its derived score (red ≥ 70, yellow 40–69, green < 40).
 *
 * Fallback (older datasets whose aiRisks have only a 0–100 score): the AI
 * risks cannot honestly be placed on a likelihood × impact grid, so we emit
 * severityDistribution (score bands) and draw the HSE register's own
 * likelihood × severity matrix (sel.riskMatrix + TIERS) instead.
 */
const hasLI = openRisks.length > 0 && openRisks.every((r) => Number.isFinite(Number(r.likelihood)) && Number.isFinite(Number(r.impact)));
// Bands aligned with the B2 rating thresholds (green < 40 ≤ yellow < 70 ≤ red): one rating per band.
const BANDS = [[0, 19], [20, 39], [40, 54], [55, 69], [70, 84], [85, 100]];
const severityDistribution = BANDS.map(([lo, hi]) => ({
  band: `${lo}–${hi}`, lo, hi, rating: psel.rating(lo), value: openRisks.filter((r) => r.score >= lo && r.score <= hi).length,
}));
const RATING_TONE = { red: 'critical', yellow: 'warning', green: 'good' };
const heatmapCells = [];
let heatmap;
if (hasLI) {
  const scoreOf = platformMod.liScore || ((l, i) => l * i * 4);
  for (let i = 1; i <= 5; i += 1) {
    for (let l = 1; l <= 5; l += 1) {
      const cellScore = scoreOf(l, i);
      const rating = psel.rating(cellScore);
      heatmapCells.push({ likelihood: l, impact: i, count: openRisks.filter((r) => Number(r.likelihood) === l && Number(r.impact) === i).length, score: cellScore, rating, tone: RATING_TONE[rating] });
    }
  }
  const mismatch = openRisks.filter((r) => scoreOf(Number(r.likelihood), Number(r.impact)) !== r.score);
  if (mismatch.length) fail(`score ≠ likelihood × impact × 4 for ${mismatch.map((r) => r.code).join(', ')}`);
  heatmap = { source: 'ai-risks', total: heatmapCells.reduce((a, c) => a + c.count, 0), cells: heatmapCells };
} else {
  const matrix = sel.riskMatrix(state, { siteId: 'all', range: 3650, search: '' }, NOW); // counts[severity-1][likelihood-1]
  const tierOf = (score) => TIERS.find((t) => score >= t.min && score <= t.max) || TIERS[0];
  for (let i = 1; i <= 5; i += 1) {
    for (let l = 1; l <= 5; l += 1) {
      const t = tierOf(l * i);
      heatmapCells.push({ likelihood: l, impact: i, count: matrix[i - 1][l - 1], score: l * i, rating: null, tone: t.tone, tierAr: t.name, tierEn: TIER_EN[t.name] });
    }
  }
  heatmap = { source: 'hse-register', total: heatmapCells.reduce((a, c) => a + c.count, 0), cells: heatmapCells, tiers: TIERS.map((t) => ({ ...t, nameEn: TIER_EN[t.name] })) };
}
if (heatmap.source === 'ai-risks' && heatmap.total !== openRisks.length) fail('heatmap does not account for every open AI risk');

/* ── 3. validation summary ── */
const v = psel.validationSummary(state);
const validation = {
  sources: v.bySource.length,
  recordsIn: v.recordsIn,
  passed: v.passed,
  rejected: v.rejected,
  deduplicated: v.deduplicated,
  passRatePct: v.passRatePct,
  completenessPct: v.completenessPct,
  consistencyPct: v.consistencyPct,
  quarantineOpen: v.quarantineOpen,
  quarantineTotal: v.quarantineTotal,
  rulesEnabled: v.rulesEnabled,
  rulesTotal: v.rulesTotal,
  ruleHitsToday: v.ruleHitsToday,
  lastBatch: v.lastBatch,
  bySource: v.bySource
    .slice()
    .sort((a, b) => b.recordsIn - a.recordsIn)
    .map((s) => ({ id: s.id, nameAr: s.name, nameEn: sourceEn(s), recordsIn: s.recordsIn, passed: s.passed, passRatePct: s.passRatePct, tone: s.tone })),
};
if (validation.passed + validation.rejected + validation.deduplicated !== validation.recordsIn) fail('validation totals do not add up');

/* ── 4. the story risk ── */
const detail = psel.riskDetail(state, STORY_RISK_CODE, NOW);
if (!detail) fail(`risk ${STORY_RISK_CODE} not found`);
const risk = detail.risk;
if (detail.rating !== 'red') fail(`${STORY_RISK_CODE} is not red (score ${risk.score})`);
if (!psel.isOpenRisk(risk)) fail(`${STORY_RISK_CODE} is not open`);
const site = seed.sites.find((s) => s.id === risk.projectId);
const pipeline = platformSeed.pipelines.find((p) => p.id === risk.pipeline);
const alert = detail.alerts[0] || null;
const task = detail.task;
if (!task) fail(`${STORY_RISK_CODE} has no mitigation task`);

const ex = risk.evidence.excerpt;
const facts = {
  cumulativeMm: num(/التراكمية (\d+) مم/, ex, 'cumulative displacement'),
  weeklyMm: num(/معدل الأسبوع (\d+) مم/, ex, 'weekly displacement'),
  limitMm: num(/\(الحد (\d+)\)/, ex, 'displacement limit'),
  crackLengthM: num(/بطول ~(\d+) م/, ex, 'crack length'),
  crackDistanceM: num(/على بُعد (\d+) م من الحافة/, risk.driverExplanation, 'crack distance'),
  workers: num(/(\d+) عاملاً/, risk.driverExplanation, 'workers'),
  excavators: num(/و(\d+) حفارات/, risk.driverExplanation, 'excavators'),
  blasts: 2, // "بعد تفجيرين" (dual form) — asserted below
  evacuateM: num(/منطقة (\d+) م/, risk.recommendation.action, 'evacuation radius'),
  noBlastM: num(/ضمن (\d+) م/, risk.recommendation.action, 'no-blast radius'),
  stabiliseDays: num(/خلال (\d+) أيام/, risk.recommendation.action, 'stabilisation days'),
  targetScore: num(/~(\d+)/, risk.recommendation.impact, 'target score'),
  sensorRef: (/(IN-[\w-]+)/.exec(risk.evidence.ref) || [])[1],
  imageRef: (/(IMG-[\w-]+)/.exec(risk.evidence.ref) || [])[1],
};
if (!/تفجيرين/.test(risk.driverExplanation)) fail('blast count wording changed');
facts.rateRatio = Math.round((facts.weeklyMm / facts.limitMm) * 10) / 10;

const pm = risk.responseParams.PM || {};
const siteParams = risk.responseParams.Site || {};
const hseOwner = risk.owner; // OWNERS.hse.S5 in the seed
const enPerson = (n) => PERSON_EN[n] || n;

// Model drivers: the site-ai pipeline's published feature importances, each
// paired with the value this risk shows for it (from the risk's own text).
const driverValues = {
  'قراءات الحساسات مقابل الحدود': { ar: `${facts.weeklyMm} مم/أسبوع مقابل حد ${facts.limitMm}`, en: `${facts.weeklyMm} mm/wk vs ${facts.limitMm} limit`, key: 'sensor' },
  'شدة الخطر (ارتفاع، أحمال، انهيار)': { ar: 'انهيار منحدر', en: 'Slope collapse', key: 'severity' },
  'عدد العمال المعرضين': { ar: `${facts.workers} عاملاً و${facts.excavators} حفارات`, en: `${facts.workers} workers · ${facts.excavators} excavators`, key: 'exposure' },
  'الظروف الجوية المتوقعة': { ar: 'رياح وغبار متوقعان', en: 'Wind and dust forecast', key: 'weather' },
};
const DRIVER_EN = {
  'قراءات الحساسات مقابل الحدود': 'Sensor readings vs limits',
  'شدة الخطر (ارتفاع، أحمال، انهيار)': 'Hazard severity',
  'عدد العمال المعرضين': 'Workers exposed',
  'الظروف الجوية المتوقعة': 'Forecast weather',
};
const drivers = pipeline.featureImportance
  .filter((f) => driverValues[f.feature])
  .map((f) => ({ key: driverValues[f.feature].key, labelAr: f.feature.replace(/ \(.*\)$/, ''), labelEn: DRIVER_EN[f.feature], weight: f.weight, valueAr: driverValues[f.feature].ar, valueEn: driverValues[f.feature].en }))
  .sort((a, b) => b.weight - a.weight);

const controlsEn = {
  'إخلاء 25 م': `Evacuate ${facts.evacuateM} m zone`,
  'إيقاف التفجير ضمن 100 م': `No blasting within ${facts.noBlastM} m`,
  'تخفيف المنحدر ومسامير صخرية': 'Bench slope + rock bolts',
  'رصد يومي للميل': 'Daily inclinometer readings',
};
// A control counts as done only when the risk's own history says so
// ("إخلاء المنطقة وإيقاف التفجير" — evacuated and blasting stopped).
const historyText = (risk.history || []).map((h) => h.text).join(' | ');
const controlDone = (c) => (/^إخلاء/.test(c) && /إخلاء المنطقة/.test(historyText)) || (/^إيقاف التفجير/.test(c) && /إيقاف التفجير/.test(historyText));
const controls = (siteParams.controls || []).map((c) => ({ ar: c, en: controlsEn[c] || c, done: controlDone(c) }));
if (controls.some((c) => c.en === c.ar)) fail('a control is missing its English label');

// English rendering of the story risk. Numbers are interpolated from the
// Arabic source facts above so both languages always show identical values.
const EN_STORY = {
  'AIR-1020': {
    title: `North excavation slope unstable — ${facts.weeklyMm} mm/week`,
    titleShort: 'North excavation slope unstable',
    explanation: `Inclinometer ${facts.sensorRef} moved ${facts.weeklyMm} mm last week against a ${facts.limitMm} mm limit, accelerating after ${facts.blasts} blasts. Tension cracks ${facts.crackDistanceM} m from the crest; ${facts.workers} workers and ${facts.excavators} excavators below.`,
    evidenceExcerpt: `Cumulative ${facts.cumulativeMm} mm · weekly rate ${facts.weeklyMm} mm (limit ${facts.limitMm}) · moving toward the pit · photo 22: ~${facts.crackLengthM} m tension cracks behind the crest`,
    evidenceSource: 'Sensor gateway',
    recommendation: `Evacuate ${facts.evacuateM} m below the north face, stop blasting within ${facts.noBlastM} m, bench and rock-bolt the slope within ${facts.stabiliseDays} days.`,
    rationale: 'Accelerating displacement signals imminent failure; evacuation removes the exposure now, stabilisation treats the cause.',
    hazard: 'Slope collapse / geotechnical',
    location: 'Main excavation — package 2B, north face',
    taskTitle: `Evacuate ${facts.evacuateM} m below north face · stop blasting within ${facts.noBlastM} m · design slope stabilisation`,
  },
};
const en = EN_STORY[risk.code];
if (!en) fail(`no English rendering for ${risk.code}; add one to EN_STORY`);

const fmtTime = (iso) => iso.slice(11, 16);
const fmtDate = (iso) => iso.slice(0, 10);

// Audit trail = the risk's own merged timeline (detection, escalation, ack,
// acceptance, task creation, write-back) + audit-log rows targeting it.
const auditRows = platformSeed.auditLog
  .filter((a) => a.target === risk.code || a.target.startsWith(task.code))
  .map((a) => ({ at: a.at, by: a.actor, action: a.action, detail: a.detail }));
const TL_EN = {
  detected: () => `Detected — score ${risk.score} (Red), confidence ${Math.round(risk.confidence * 100)}%`,
  alert: () => `Immediate escalation · ${alert ? alert.channels.length : 0} channels`,
  ack: () => 'Alert acknowledged',
  accept: () => `Recommendation accepted · task ${task.code}`,
  task: () => `Task ${task.code} created`,
  writeback: () => `Written back to Biltix PM (${task.code})`,
  onsite: () => 'Geotechnical engineer on site',
};
const timeline = [];
for (const e of detail.timeline) {
  if (e.kind === 'detected') timeline.push({ at: e.at, kind: 'detected', byAr: e.by, byEn: 'Site AI', textAr: e.text, textEn: TL_EN.detected() });
  else if (e.kind === 'alert') timeline.push({ at: e.at, kind: 'alert', byAr: e.by, byEn: 'System', textAr: `تصعيد فوري عبر ${alert.channels.length} قنوات`, textEn: TL_EN.alert() });
  else if (e.kind === 'ack') timeline.push({ at: e.at, kind: 'ack', byAr: e.by, byEn: enPerson(e.by), textAr: e.text, textEn: TL_EN.ack() });
  else if (e.kind === 'history' && /قبول التوصية/.test(e.text)) timeline.push({ at: e.at, kind: 'accept', byAr: e.by, byEn: enPerson(e.by), textAr: `قبول التوصية · المهمة ${task.code}`, textEn: TL_EN.accept() });
  else if (e.kind === 'writeback') timeline.push({ at: e.at, kind: 'writeback', byAr: e.by, byEn: 'System', textAr: e.text, textEn: TL_EN.writeback(), status: e.status });
  else if (e.kind === 'history' && /الجيوتقني/.test(e.text)) timeline.push({ at: e.at, kind: 'onsite', byAr: e.by, byEn: enPerson(e.by), textAr: 'المهندس الجيوتقني في الموقع', textEn: TL_EN.onsite() });
}
timeline.forEach((t) => { t.date = fmtDate(t.at); t.time = fmtTime(t.at); });

const ackMinutes = alert && alert.ackAt ? Math.round((Date.parse(alert.ackAt) - Date.parse(alert.sentAt)) / 60000) : null;
const acceptEvent = timeline.find((t) => t.kind === 'accept');
const decisionMinutes = acceptEvent ? Math.round((Date.parse(acceptEvent.at) - Date.parse(risk.detectedAt)) / 60000) : null;

const story = {
  code: risk.code,
  id: risk.id,
  score: risk.score,
  rating: detail.rating,
  ratingLabelAr: detail.ratingLabel,
  ratingLabelEn: RATING_EN[detail.rating].label,
  hintAr: psel.ratingHint(detail.rating),
  hintEn: RATING_EN[detail.rating].hint,
  confidencePct: Math.round(risk.confidence * 100),
  likelihood: risk.likelihood ?? null,
  impact: risk.impact ?? null,
  category: risk.category,
  categoryAr: detail.categoryLabel,
  categoryEn: CATEGORY_EN[risk.category],
  typeAr: detail.typeLabel,
  typeEn: risk.type,
  site: { id: site.id, code: site.code },
  pipeline: { id: risk.pipeline, nameAr: PIPELINE_META[risk.pipeline].nameAr, nameEn: enLabel('pipeline', risk.pipeline, pipeline.name), version: risk.modelVersion, precision: pipeline.precision, recall: pipeline.recall },
  titleAr: risk.title,
  titleShortAr: risk.title.split(' — ')[0],
  titleEn: en.title,
  titleShortEn: en.titleShort,
  explanationAr: risk.driverExplanation,
  explanationEn: en.explanation,
  evidence: {
    kind: risk.evidence.kind,
    ref: risk.evidence.ref,
    sensorRef: facts.sensorRef,
    imageRef: facts.imageRef,
    sourceAr: risk.evidence.sourceSystem,
    sourceEn: enLabel('sourceSystem', risk.evidence.sourceSystem, en.evidenceSource),
    excerptAr: risk.evidence.excerpt,
    excerptEn: en.evidenceExcerpt,
  },
  facts,
  drivers,
  recommendation: {
    actionAr: risk.recommendation.action,
    actionEn: en.recommendation,
    effortAr: risk.recommendation.effort,
    effortEn: enLabel('effort', risk.recommendation.effort, risk.recommendation.effort),
    targetApprox: /~/.test(risk.recommendation.impact),
    rationaleAr: risk.recommendation.rationale,
    rationaleEn: en.rationale,
    impactAr: risk.recommendation.impact,
    targetScore: facts.targetScore,
  },
  hazardAr: siteParams.hazard,
  hazardEn: en.hazard,
  locationAr: siteParams.location,
  locationEn: en.location,
  controls,
  stakeholders: (risk.stakeholders || []).map((id) => ({ id, ar: (platformMod.STAKEHOLDER_ROLES.find((r) => r.id === id) || {}).name || id, en: STAKEHOLDER_EN[id] || id })),
  pmImpact: { scheduleDays: pm.scheduleImpactDays, costSAR: pm.costImpactSAR, criticalPath: !!pm.criticalPath },
  detectedAt: risk.detectedAt,
  alert: alert && {
    code: alert.code, severity: alert.severity, queue: alert.queue, channels: alert.channels.length,
    sentAt: alert.sentAt, ackAt: alert.ackAt, ackMinutes,
  },
  reviewer: {
    nameAr: hseOwner, nameEn: enPerson(hseOwner), roleAr: ROLE_AR.hse, roleEn: ROLE_EN.hse,
    decisionAt: acceptEvent && acceptEvent.at, decisionMinutes,
  },
  task: {
    code: task.code,
    titleAr: task.title,
    titleEn: en.taskTitle,
    ownerAr: task.owner,
    ownerEn: enPerson(task.owner),
    dueDate: task.dueDate,
    statusAr: task.status,
    statusEn: enLabel('taskStatus', task.status, task.status),
    source: task.source,
    createdAt: task.createdAt,
    writeback: task.writeback,
  },
  timeline,
  auditLog: auditRows,
  // The dataset stops at "task in progress" for this risk: closure is the
  // workflow's end state shown for illustration, flagged on screen.
  closure: { simulated: true, statusInDataset: risk.status, taskStatusInDataset: task.status, targetScore: facts.targetScore },
};

/* ── 5. platform flow counters (for the data-source beat) ── */
const flow = psel.flowCounters(state, state.filters, NOW).map((f) => ({ stage: f.stage, labelAr: f.label, value: f.value, unit: f.unit || '' }));

const out = {
  _meta: {
    generatedBy: 'scripts/extract-data.mjs',
    source: 'biltix-hse/js/data/platform-seed.js + seed.js via platform-selectors.js / selectors.js',
    anchorDate: PLATFORM_ANCHOR_DATE,
    now: NOW.toISOString(),
    filters: state.filters,
    weights: cons.weights,
    note: hasLI
      ? 'Demo data — بيانات توضيحية. Heatmap = open AI risks by likelihood × impact (score = L × I × 4).'
      : 'Demo data — بيانات توضيحية. aiRisks carry no likelihood/impact fields: severityDistribution is derived from scores; the 5×5 heatmap is the HSE register (likelihood × severity).',
  },
  product: { nameAr: platformSeed.product.name, nameEn: platformSeed.product.nameEn, brandShort: platformSeed.product.brandShort },
  consolidated: {
    score: cons.score, rating: cons.rating, labelAr: cons.label, labelEn: RATING_EN[cons.rating].label, hintAr: cons.hint, hintEn: RATING_EN[cons.rating].hint,
    delta: cons.delta, trend: cons.trend,
  },
  categories,
  ratingDistribution,
  openAiRisks: openRisks.length,
  totalAiRisks: platformSeed.aiRisks.length,
  severityDistribution,
  heatmap,
  validation,
  flow,
  story,
};

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, `${JSON.stringify(out, null, 2)}\n`);
console.log(`extract-data: wrote ${OUT}`);
console.log(`  consolidated ${cons.score} (${cons.rating}) · categories ${categories.map((c) => `${c.id}:${c.score}`).join(' ')}`);
console.log(`  ratings ${ratingDistribution.map((r) => `${r.rating}:${r.value}`).join(' ')} · open ${openRisks.length}/${platformSeed.aiRisks.length}`);
console.log(`  heatmap ${heatmap.source} total ${heatmap.total} · validation ${validation.recordsIn} in / ${validation.passed} passed (${validation.passRatePct}%)`);
console.log(`  story ${story.code} score ${story.score} · task ${story.task.code} · timeline ${timeline.length} events`);
