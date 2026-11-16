/**
 * Biltix HSE — live simulation engine (js/data/live.js)
 *
 * Contract: docs/ARCHITECTURE.md §7. The engine is the only producer of "live" data:
 *
 *   • every 2.5–7 s   → one FeedEvent (store.pushFeed + bus 'feed:event'), built from
 *                        phrase templates filled with real entity names (sites, zones,
 *                        permit codes, sensor kinds, integrations, workers, courses)
 *   • every 1 s       → sensors drift toward sinusoidal targets (+ noise) → bus 'sensors:tick'
 *   • ≈ every 90 s    → one sensor crosses its threshold for 20–40 s → bus 'alert'
 *                        (severity 'critical') + a critical feed event + a transient radar blip
 *   • every 1 s       → permits: 'نشط' and ≤ 60 min to expiry → one warning per permit;
 *                        past expiry → status 'مغلق' once + a replacement active permit of the
 *                        same type/site (4–10 h) so the board never runs dry
 *   • every 10–20 s   → integrations jitter (lastSync, latencyMs, eventsPerHour) via
 *                        store.updateIntegration; a 'degraded' connector recovers after ≈ 2 min;
 *                        bus 'integrations:tick'
 *   • ≈ every 4 min   → a near-miss incident via store.addIncident (the store emits its feed event)
 *
 * Simulated records (replacement permits, near-miss incidents) are tagged `simulated: true`
 * and capped (SIM_CAPS: last 50 simulated closed permits, last 100 simulated incidents); the
 * oldest closed — then the oldest untouched open — simulated records are pruned when a cap is
 * exceeded, on start() and after every insertion. Seed and user-created records are never pruned.
 *
 * Numerals: every number in generated event text goes through fmt (so the Arabic-Indic setting is
 * honoured), literal digits in hand-written copy are localised at fill time, codes embedded in
 * sentences use U+2011 so they never break across lines, and the raw numbers / plain codes travel
 * in the event payload (value, unit, ms, minutes, days, code, refId) for consumers that re-format.
 *
 * Sensors with a `lowThreshold` (O₂) also simulate deficiency excursions below it; `isOver`
 * and the alert text report the direction ('low' | 'high').
 *
 * Determinism: every random choice comes from a mulberry32 generator seeded with 20261109.
 * Wall-clock timing still varies, but the sequence of choices is reproducible.
 *
 * Rules honoured here: plain ES module, no dependencies, no DOM reads or writes (the only
 * browser API touched is `document.hidden` / `visibilitychange`, guarded, to pause the
 * schedulers in background tabs), every timer is tracked and cleared on stop()/pause(),
 * every scheduled callback is isolated in try/catch so the engine can never throw into
 * the host. `settings.feedPaused` suppresses feed events only — sensors keep moving and
 * safety alerts (bus 'alert') still fire.
 *
 * Note on sensors: live values are written in place to `store.state.sensors[i].value`
 * (no store:change, to avoid a re-render storm every second) so `sel.sensorAxes()` stays
 * truthful; consumers that need a tick signal listen to 'sensors:tick'.
 */

import { sel } from '../core/selectors.js';
import { fmt } from '../core/fmt.js';
import { CATEGORIES } from './seed.js';

export const LIVE_SEED = 20261109;

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;

/** Every timing constant in one place (ms). */
export const TIMING = Object.freeze({
  firstFeed: 1800,
  feedMin: 2500,
  feedMax: 7000,
  sensor: 1000,
  permit: 1000,
  integrationMin: 10 * SECOND,
  integrationMax: 20 * SECOND,
  excursionEvery: 90 * SECOND,
  excursionJitter: 25 * SECOND,
  excursionMin: 20 * SECOND,
  excursionMax: 40 * SECOND,
  nearMissEvery: 4 * MINUTE,
  nearMissJitter: 60 * SECOND,
  degradedRecovery: 2 * MINUTE,
  degradedRecoveryJitter: 30 * SECOND,
  degradeEvery: 7 * MINUTE,
  degradeJitter: 2 * MINUTE,
  transientBlipTtl: 20 * SECOND,
  permitWarnWindow: 60 * MINUTE,
  replacementMinHours: 4,
  replacementMaxHours: 10,
  pingMaxStep: 2 * SECOND,
});

/** Caps for engine-generated (simulated) records — see pruneSimulated(). */
export const SIM_CAPS = Object.freeze({
  closedPermits: 50,
  incidents: 100,
});

const PERMIT_ACTIVE = 'نشط';
const PERMIT_CLOSED = 'مغلق';
const RISK_CLOSED = 'مغلق';
const NEAR_MISS_TYPE = 'حادث وشيك';
const HIGH_TIERS = new Set(['عالٍ', 'حرج']);
const TONES = new Set(['neutral', 'good', 'warning', 'serious', 'critical', 'brand', 'accent']);
const FEED_TYPES = new Set(['sensor', 'permit', 'incident', 'nearmiss', 'inspection', 'training', 'integration', 'ppe', 'weather', 'alert']);

/* ────────────────────────────── deterministic randomness ────────────────────────────── */

function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6D2B79F5) >>> 0;
    let x = a;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

let rng = mulberry32(LIVE_SEED);
const rand = () => rng();
const randBetween = (a, b) => a + (b - a) * rand();
const randInt = (a, b) => Math.floor(randBetween(a, b + 1));
const chance = (p) => rand() < p;
const pick = (list) => (Array.isArray(list) && list.length ? list[Math.floor(rand() * list.length)] : undefined);

function weightedPick(list, weightOf) {
  if (!Array.isArray(list) || !list.length) return undefined;
  const weights = list.map((item) => Math.max(0, Number(weightOf(item)) || 0));
  const total = weights.reduce((a, b) => a + b, 0);
  if (total <= 0) return pick(list);
  let roll = rand() * total;
  for (let i = 0; i < list.length; i += 1) {
    roll -= weights[i];
    if (roll <= 0) return list[i];
  }
  return list[list.length - 1];
}

/** FNV-1a 32-bit hash for stable per-id placement. */
function hash32(str) {
  const s = String(str ?? '');
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/** Deterministic unit float in [0,1) derived from a string and a salt. */
function unitHash(str, salt = 0) {
  return (hash32(`${str}|${salt}`) % 100_000) / 100_000;
}

/* ────────────────────────────── small helpers ────────────────────────────── */

const clamp = (n, min, max) => Math.min(max, Math.max(min, n));
const arr = (v) => (Array.isArray(v) ? v : []);
const num = (v, fallback) => (Number.isFinite(Number(v)) ? Number(v) : fallback);
const round = (n, digits = 1) => {
  const f = 10 ** digits;
  return Math.round((n + Number.EPSILON) * f) / f;
};
const pad2 = (n) => String(n).padStart(2, '0');

/** Local-time ISO string with explicit offset, matching store.localISO(). */
function localISO(ms = Date.now()) {
  const d = new Date(ms);
  const offsetMin = -d.getTimezoneOffset();
  const sign = offsetMin >= 0 ? '+' : '-';
  const abs = Math.abs(offsetMin);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
    + `T${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`
    + `${sign}${pad2(Math.floor(abs / 60))}:${pad2(abs % 60)}`;
}

function safeNum(v, digits = 1) {
  try { return fmt.num(v, { maximumFractionDigits: digits }); } catch { return String(round(v, digits)); }
}
const n0 = (v) => safeNum(v, 0);
const n1 = (v) => safeNum(v, 1);
function safeTime(iso) {
  try { return fmt.time(iso); } catch { return ''; }
}

/** Non-breaking hyphen (U+2011) inside a code embedded in a sentence: "PTW‑5521" never wraps. */
const nbh = (code) => String(code ?? '').replace(/-/g, '‑');

const ARABIC_INDIC = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'];
function arabNumerals() {
  try { return typeof fmt.getNumerals === 'function' && fmt.getNumerals() === 'arab'; } catch { return false; }
}
/**
 * Localise literal ASCII digits inside hand-written Arabic copy when the UI uses Arabic-Indic
 * numerals ("خلال 48 ساعة" → "خلال ٤٨ ساعة"). Digits glued to Latin letters (H2S, PM2.5, N95)
 * or hyphenated codes are identifiers and stay as they are. No lookbehind (Safari < 16.4).
 */
function arDigits(text) {
  const s = String(text || '');
  if (!arabNumerals()) return s;
  return s
    .replace(/(^|[^A-Za-z0-9₂‑-])(\d+(?:[.,:/–]\d+)*)(%?)(?![A-Za-z0-9₂]|-\d)/g, (_, pre, run, pct) => (
      pre
      + run.replace(/[0-9]/g, (d) => ARABIC_INDIC[d.charCodeAt(0) - 48]).replace(/(\d|[٠-٩])\.(?=[٠-٩])/g, '$1٫').replace(/,(?=[٠-٩]{3})/g, '٬')
      + (pct ? '٪' : '')
    ))
    .replace(/([٠-٩])%/g, '$1٪');
}

/** Optional raw fields copied verbatim from a partial event into the stored FeedEvent. */
const EXTRA_FIELDS = ['code', 'value', 'unit', 'threshold', 'ms', 'minutes', 'hours', 'days', 'pct', 'count', 'direction', 'source'];

function warn(context, error) {
  try { console.warn(`[biltix-hse] live engine (${context}):`, error); } catch { /* no console */ }
}

/* ────────────────────────────── engine state ────────────────────────────── */

const E = {
  store: null,
  bus: null,
  started: false,
  paused: false,          // explicit pause()
  hidden: false,          // document.hidden pause
  startedAt: 0,
  timers: new Map(),      // task name → timeout id
  feedCounter: 0,
  // sensors
  sensors: new Map(),     // sensor id → model
  lastSensorTick: 0,
  // transient radar detections
  transients: [],
  // permits
  permitWarned: new Map(), // permit id → expiresAt it was warned for
  pendingReplacements: [],
  nextExpiryAt: 0,         // catch-up closures are spaced 8–15 s apart so the feed stays readable
  // integrations
  integrations: new Map(), // id → { baseLatency, baseEvents, history, degradedSince, recoverAfter }
  nextDegradeAt: 0,
  // site-plan agents
  pings: new Map(),       // siteId → { agents, lastAt }
  onVisibility: null,
};

const state = () => (E.store && E.store.state) || {};
const settings = () => state().settings || {};
const feedPaused = () => Boolean(settings().feedPaused);
const sites = () => arr(state().sites);
const siteById = (id) => sites().find((s) => s && s.id === id) || null;
const zonesOf = (site) => (site && Array.isArray(site.zones) && site.zones.length
  ? site.zones
  : [{ id: `${site ? site.id : 'S'}-Z1`, name: 'الموقع', x: 0, y: 0, w: 1, h: 1 }]);
const zoneName = (siteId, zoneId) => {
  const z = zonesOf(siteById(siteId)).find((zz) => zz.id === zoneId);
  return z ? z.name : '';
};
const integrationById = (id) => arr(state().integrations).find((g) => g && g.id === id) || null;

/** Resolve the site a per-site radar should show: explicit id, else the sensor fallback (S1). */
function resolveSite(siteId) {
  const direct = siteId && siteId !== 'all' ? siteById(siteId) : null;
  if (direct) return direct;
  const axes = safeSensorAxes(siteId);
  const fromSensors = axes.length ? siteById(axes[0].siteId) : null;
  return fromSensors || sites()[0] || null;
}

function safeSensorAxes(siteId) {
  try { return arr(sel.sensorAxes(state(), siteId || 'all')); } catch (err) { warn('sensorAxes', err); return []; }
}

/* ────────────────────────────── scheduler ────────────────────────────── */

function clearTask(name) {
  const id = E.timers.get(name);
  if (id !== undefined) {
    clearTimeout(id);
    E.timers.delete(name);
  }
}

function clearAllTasks() {
  for (const id of E.timers.values()) clearTimeout(id);
  E.timers.clear();
}

const schedulersActive = () => E.started && !E.paused && !E.hidden;

/** Arm `task.run` after `delay` ms, then re-arm it with task.delay() forever. */
function arm(task, delay) {
  clearTask(task.name);
  if (!schedulersActive()) return;
  const id = setTimeout(() => {
    E.timers.delete(task.name);
    try {
      task.run(Date.now());
    } catch (err) {
      warn(task.name, err);
    }
    arm(task, task.delay());
  }, Math.max(0, delay));
  E.timers.set(task.name, id);
}

const TASKS = [
  { name: 'feed', first: () => TIMING.firstFeed, delay: () => randBetween(TIMING.feedMin, TIMING.feedMax), run: (now) => feedStep(now) },
  { name: 'sensors', first: () => TIMING.sensor, delay: () => TIMING.sensor, run: (now) => sensorStep(now) },
  { name: 'permits', first: () => 600, delay: () => TIMING.permit, run: (now) => permitStep(now) },
  { name: 'integrations', first: () => randBetween(4 * SECOND, 8 * SECOND), delay: () => randBetween(TIMING.integrationMin, TIMING.integrationMax), run: (now) => integrationStep(now) },
  { name: 'excursion', first: () => randBetween(35 * SECOND, 70 * SECOND), delay: () => TIMING.excursionEvery + randBetween(-TIMING.excursionJitter, TIMING.excursionJitter), run: (now) => startExcursion(now) },
  { name: 'nearmiss', first: () => TIMING.nearMissEvery + randBetween(-TIMING.nearMissJitter, TIMING.nearMissJitter), delay: () => TIMING.nearMissEvery + randBetween(-TIMING.nearMissJitter, TIMING.nearMissJitter), run: (now) => nearMissStep(now) },
];

function armAll({ fresh }) {
  clearAllTasks();
  if (!schedulersActive()) return;
  for (const task of TASKS) arm(task, fresh ? task.first() : Math.min(task.first(), task.delay()));
}

/* ────────────────────────────── visibility ────────────────────────────── */

function attachVisibility() {
  if (typeof document === 'undefined' || typeof document.addEventListener !== 'function') return;
  if (E.onVisibility) return;
  E.onVisibility = () => {
    if (document.hidden) {
      E.hidden = true;
      clearAllTasks();
    } else if (E.hidden) {
      E.hidden = false;
      resyncClocks(Date.now());
      armAll({ fresh: false });
    }
  };
  document.addEventListener('visibilitychange', E.onVisibility);
  if (document.hidden) {
    E.hidden = true;
    clearAllTasks();
  }
}

function detachVisibility() {
  if (E.onVisibility && typeof document !== 'undefined' && typeof document.removeEventListener === 'function') {
    document.removeEventListener('visibilitychange', E.onVisibility);
  }
  E.onVisibility = null;
}

/** After a pause the agents and sensors must not "catch up" with a jump. */
function resyncClocks(now) {
  E.lastSensorTick = now;
  for (const m of E.sensors.values()) m.prev = m.value;
  for (const p of E.pings.values()) p.lastAt = now;
}

/* ────────────────────────────── feed emission ────────────────────────────── */

function nextFeedId() {
  E.feedCounter += 1;
  return `LV-${Date.now().toString(36)}-${E.feedCounter.toString(36)}-${Math.floor(rand() * 1296).toString(36)}`;
}

/** Normalise + push + broadcast one feed event. Returns the stored event or null. */
function emitFeed(partial, { force = false } = {}) {
  if (!E.store || typeof E.store.pushFeed !== 'function') return null;
  if (!force && feedPaused()) return null;
  const type = FEED_TYPES.has(partial.type) ? partial.type : 'alert';
  const tone = TONES.has(partial.tone) ? partial.tone : 'accent';
  let sourceId = partial.sourceId == null ? null : String(partial.sourceId);
  if (sourceId && arr(state().integrations).length && !integrationById(sourceId)) sourceId = null;
  const event = {
    id: nextFeedId(),
    ts: localISO(Date.now()),
    type,
    tone,
    siteId: partial.siteId == null ? null : partial.siteId,
    // Final pass over the sentence: literal digits and digits inside Arabic entity names follow
    // the numerals setting; identifiers (PTW‑5521, H2S, B2070, 2026-11-20) are left alone.
    title: arDigits(String(partial.title || '').trim()),
    detail: arDigits(String(partial.detail || '').trim()),
    sourceId,
  };
  if (partial.refId != null) event.refId = partial.refId;
  if (partial.kind) event.kind = partial.kind;
  for (const key of EXTRA_FIELDS) if (partial[key] !== undefined && partial[key] !== null && partial[key] !== '') event[key] = partial[key];
  const stored = E.store.pushFeed(event);
  if (stored && E.bus && typeof E.bus.emit === 'function') E.bus.emit('feed:event', stored);
  return stored || null;
}

function emitBus(name, payload) {
  if (E.bus && typeof E.bus.emit === 'function') {
    try { E.bus.emit(name, payload); } catch (err) { warn(`bus:${name}`, err); }
  }
}

/* ────────────────────────────── phrase library ────────────────────────────── */

const FALLBACK_WORKERS = ['أحمد بن سعد', 'محمد إقبال', 'رامي حسن', 'عبدالرحمن يوسف', 'ديبك شارما', 'شهاب الدين', 'ناصر العمري', 'خالد المالكي', 'فيصل الغامدي', 'سلمان الحربي', 'رفيق الإسلام', 'طارق عبدالله'];
const FALLBACK_COURSES = ['التوعية بالسلامة في الموقع', 'العمل على ارتفاعات', 'الأماكن المغلقة', 'تصاريح العمل', 'الإسعافات الأولية', 'مكافحة الحريق', 'الإجهاد الحراري', 'قيادة المعدات الثقيلة', 'الإشارة والربط (Rigging)', 'قيادة دفاعية'];
const TOOLBOX_TOPICS = ['العمل الآمن على ارتفاعات', 'الوقاية من الإجهاد الحراري', 'إشارات الرافعات وحبال التوجيه', 'عزل الطاقة وقفلها (LOTO)', 'الدخول إلى الأماكن المغلقة', 'المناولة اليدوية الآمنة', 'السلامة المرورية داخل الموقع', 'الحماية من السقوط', 'التعامل مع المواد الكيميائية'];
const INSPECTION_TYPES_FALLBACK = ['جولة سلامة', 'تفتيش معدات', 'تدقيق داخلي', 'تفتيش سقالات', 'فحص رافعات', 'تفتيش كهرباء'];
const SOURCES = Object.freeze({
  pm: 'biltix-pm', dms: 'biltix-dms', iot: 'iot-gateway', cctv: 'cctv-ai', wear: 'wearables',
  access: 'access-control', weather: 'weather-ncm', hrms: 'hrms',
});

/**
 * Template: { type, tone, sourceId, title, detail, weight?, requires?(ctx) }.
 * Placeholders `{key}` are resolved from the per-event context (see buildContext()).
 */
const TEMPLATES = [
  // ── sensors (IoT gateway)
  { type: 'sensor', tone: 'accent', sourceId: SOURCES.iot, weight: 3, title: 'قراءة {sensor} مستقرة عند {value} {unit}', detail: 'ضمن الحد المسموح ({threshold} {unit}) — {zone}', requires: (c) => c.sensorRatio < 0.7 },
  { type: 'sensor', tone: 'warning', sourceId: SOURCES.iot, weight: 3, title: 'ارتفاع تدريجي في {sensor} إلى {value} {unit}', detail: 'ما زالت دون عتبة التنبيه ({threshold} {unit}) — {zone}؛ المراقبة مستمرة', requires: (c) => c.sensorRatio >= 0.7 },
  { type: 'sensor', tone: 'good', sourceId: SOURCES.iot, weight: 1, title: 'معايرة دورية لحسّاس {sensor} — {zone}', detail: 'اكتملت المعايرة الآلية عبر بوابة الحساسات؛ انحراف القراءة أقل من 2%' },
  { type: 'sensor', tone: 'accent', sourceId: SOURCES.iot, weight: 1, title: 'استعادة الاتصال بحسّاس {sensor} — {zone}', detail: 'انقطاع قصير في بث MQTT لمدة {n} ثانية ثم عودة الإرسال طبيعيًا' },
  { type: 'sensor', tone: 'warning', sourceId: SOURCES.iot, weight: 1, title: 'بطارية حسّاس {sensor} منخفضة ({pct}%)', detail: 'يُنصح باستبدال البطارية خلال 48 ساعة — {zone}' },
  // ── permits (Biltix PM)
  { type: 'permit', tone: 'good', sourceId: SOURCES.pm, weight: 2, title: 'اعتماد تصريح {permitPending} — {permitPendingType}', detail: '{permitPendingLocation} · اعتمده {permitPendingApprover}', requires: (c) => Boolean(c.permitPending) },
  { type: 'permit', tone: 'accent', sourceId: SOURCES.pm, weight: 3, title: 'تسجيل دخول {workersCount} عمال بموجب التصريح {permit}', detail: '{permitType} — {permitLocation}' },
  { type: 'permit', tone: 'good', sourceId: SOURCES.pm, weight: 2, title: 'اختبار غازات جديد للتصريح {permit}', detail: 'O₂ {o2}% · LEL 0% · H2S {h2s} ppm · CO {co} ppm — القيم ضمن الحدود المقبولة', requires: (c) => c.permitHasGas },
  { type: 'permit', tone: 'accent', sourceId: SOURCES.pm, weight: 1, title: 'طلب تمديد التصريح {permit} لمدة {hours} ساعات', detail: 'بانتظار موافقة {approver} — {permitLocation}' },
  { type: 'permit', tone: 'good', sourceId: SOURCES.pm, weight: 1, title: 'إقفال مراقبة الحريق للتصريح {permit}', detail: 'انتهت فترة المراقبة (60 دقيقة) دون ملاحظات — {permitLocation}', requires: (c) => c.permitType === 'أعمال ساخنة' },
  { type: 'permit', tone: 'accent', sourceId: SOURCES.pm, weight: 1, title: 'جولة تحقق ميدانية على التصريح {permit}', detail: 'تطابق الضوابط المكتوبة مع الواقع الميداني — {permitLocation}' },
  // ── incidents (field app / wearables)
  { type: 'incident', tone: 'warning', sourceId: SOURCES.pm, weight: 2, title: 'بلاغ إسعافات أولية — {zone}', detail: 'جرح سطحي أثناء المناولة؛ عولج في عيادة الموقع وعاد العامل إلى عمله بمهام خفيفة' },
  { type: 'incident', tone: 'warning', sourceId: SOURCES.pm, weight: 1, title: 'بلاغ تلف ممتلكات بسيط — {zone}', detail: 'اصطدام منخفض السرعة بحاجز خرساني دون إصابات؛ فتح سجل تحقيق' },
  { type: 'incident', tone: 'accent', sourceId: SOURCES.pm, weight: 2, title: 'تحديث تحقيق الحادث {incident}', detail: 'إضافة محضر مقابلة ومرفقات مصورة — {incidentTitle}', requires: (c) => Boolean(c.incident) },
  { type: 'incident', tone: 'good', sourceId: SOURCES.pm, weight: 1, title: 'إغلاق إجراء تصحيحي للحادث {incident}', detail: 'تم التحقق ميدانيًا من تنفيذ الإجراء — {incidentTitle}', requires: (c) => Boolean(c.incident) },
  // ── near-miss observations
  { type: 'nearmiss', tone: 'warning', sourceId: SOURCES.pm, weight: 2, title: 'بلاغ حادث وشيك عبر تطبيق بلتكس — {zone}', detail: 'سقوط أداة يدوية من ارتفاع {n} م دون إصابات؛ البلاغ بانتظار التصنيف' },
  { type: 'nearmiss', tone: 'good', sourceId: SOURCES.pm, weight: 2, title: 'ملاحظة سلامة إيجابية — {zone}', detail: 'أوقف العامل {worker} العمل عند رصد سقالة دون بطاقة فحص سارية' },
  { type: 'nearmiss', tone: 'warning', sourceId: SOURCES.wear, weight: 1, title: 'حادث وشيك: مركبة تقترب من ممر المشاة — {zone}', detail: 'تفعيل تنبيه الاقتراب في جهاز السائق؛ لا إصابات' },
  { type: 'nearmiss', tone: 'warning', sourceId: SOURCES.pm, weight: 1, title: 'ملاحظة: مواد مخزنة قرب حافة البلاطة — {zone}', detail: 'إزالة المواد فورًا وتثبيت لوحات تحذير؛ إبلاغ مشرف المنطقة' },
  // ── inspections
  { type: 'inspection', tone: 'good', sourceId: SOURCES.pm, weight: 3, title: 'اعتماد {inspectionType} — {site}', detail: 'المفتش {inspector} · اكتمال قائمة التحقق ({checklist} بندًا)' },
  { type: 'inspection', tone: 'accent', sourceId: SOURCES.pm, weight: 2, title: 'بدء {inspectionType} — {zone}', detail: 'المفتش {inspector} · قائمة تحقق من {checklist} بندًا' },
  { type: 'inspection', tone: 'accent', sourceId: SOURCES.dms, weight: 2, title: 'رفع تقرير {inspectionType} إلى Biltix DMS', detail: 'المستند {doc} · {site} · نسخة معتمدة إلكترونيًا' },
  { type: 'inspection', tone: 'good', sourceId: SOURCES.pm, weight: 1, title: 'إغلاق ملاحظة تفتيش — {zone}', detail: 'تم التحقق من تنفيذ الإجراء التصحيحي ميدانيًا وإرفاق صورة قبل/بعد' },
  { type: 'inspection', tone: 'warning', sourceId: SOURCES.pm, weight: 1, title: 'تذكير: {inspectionType} مستحق غدًا — {site}', detail: 'المفتش {inspector} · يُرجى تجهيز سجلات المعدات' },
  // ── training (HRMS)
  { type: 'training', tone: 'good', sourceId: SOURCES.hrms, weight: 3, title: 'إتمام دورة «{course}» — {worker}', detail: 'شهادة سارية 12 شهرًا · {site}' },
  { type: 'training', tone: 'warning', sourceId: SOURCES.hrms, weight: 2, title: 'تذكير بانتهاء شهادة «{course}»', detail: 'العامل {worker} — تنتهي خلال {days} يومًا · {site}' },
  { type: 'training', tone: 'accent', sourceId: SOURCES.hrms, weight: 1, title: 'تسجيل {n} عمال في دورة «{course}»', detail: 'جلسة صباحية في مركز التدريب — {site}' },
  { type: 'training', tone: 'accent', sourceId: SOURCES.pm, weight: 2, title: 'اجتماع صندوق الأدوات (Toolbox Talk) — {zone}', detail: 'موضوع اليوم: {topic} · حضور {n2} عاملًا' },
  // ── integrations
  { type: 'integration', tone: 'good', weight: 3, title: 'مزامنة ناجحة مع {integration}', detail: 'معالجة {n2} حدثًا خلال آخر 10 دقائق · زمن الاستجابة {latency} مللي ثانية' },
  { type: 'integration', tone: 'accent', weight: 1, title: 'تجديد رموز الوصول لـ {integration}', detail: 'تم تجديد الرمز تلقائيًا؛ الاتصال مستقر' },
  { type: 'integration', tone: 'warning', weight: 1, title: 'تأخر طفيف في مزامنة {integration}', detail: 'زمن الاستجابة {latencyHigh} مللي ثانية — ضمن حدود اتفاقية مستوى الخدمة' },
  // ── PPE (smart cameras)
  { type: 'ppe', tone: 'serious', sourceId: SOURCES.cctv, weight: 2, title: 'كاميرا ذكية: رصد عامل بدون خوذة — {zone}', detail: 'إشعار فوري للمشرف المناوب وتوثيق اللقطة' },
  { type: 'ppe', tone: 'good', sourceId: SOURCES.cctv, weight: 3, title: 'كاميرا ذكية: التحقق من ارتداء أحزمة الأمان — {zone}', detail: 'العمال على المنصة ({n}) مربوطون بنقاط التثبيت المعتمدة' },
  { type: 'ppe', tone: 'warning', sourceId: SOURCES.cctv, weight: 2, title: 'كاميرا ذكية: سترة عاكسة مفقودة قرب طريق المعدات — {zone}', detail: 'تنبيه صوتي عبر السماعة الميدانية وتصحيح فوري' },
  { type: 'ppe', tone: 'good', sourceId: SOURCES.cctv, weight: 3, title: 'كاميرا ذكية: التزام كامل بمعدات الوقاية — {zone}', detail: 'فحص {n2} عاملًا خلال آخر 15 دقيقة دون مخالفات' },
  { type: 'ppe', tone: 'warning', sourceId: SOURCES.cctv, weight: 1, title: 'نظارات واقية غير مستخدمة أثناء القطع — {zone}', detail: 'إيقاف العمل مؤقتًا حتى تصحيح الوضع وإعادة التوجيه' },
  // ── weather (NCM)
  { type: 'weather', tone: 'accent', sourceId: SOURCES.weather, weight: 3, title: 'تحديث الأرصاد — {site}', detail: 'الحرارة {temp}° · الرطوبة {humidity}% · WBGT {wbgt}° · رياح {wind} كم/س' },
  { type: 'weather', tone: 'warning', sourceId: SOURCES.weather, weight: 2, title: 'تنبيه رياح: {windHigh} كم/س — {site}', detail: 'إيقاف عمليات الرفع بالرافعات البرجية عند تجاوز 38 كم/س وتأمين الأحمال المعلقة' },
  { type: 'weather', tone: 'warning', sourceId: SOURCES.weather, weight: 1, title: 'تنبيه إجهاد حراري — WBGT {wbgtHigh}°', detail: 'تفعيل جدول الراحة 15 دقيقة كل ساعة وتوفير مياه باردة — {site}' },
  { type: 'weather', tone: 'warning', sourceId: SOURCES.weather, weight: 1, title: 'تنبيه غبار — انخفاض مدى الرؤية قرب {site}', detail: 'توصية بإيقاف حركة المعدات الثقيلة حتى تحسّن الرؤية وارتداء كمامات N95' },
  // ── alerts (access control / wearables)
  { type: 'alert', tone: 'warning', sourceId: SOURCES.wear, weight: 2, title: 'جهاز قابل للارتداء: نبض مرتفع للعامل {worker}', detail: 'توجيه إلى منطقة الراحة المكيفة — {zone}' },
  { type: 'alert', tone: 'serious', sourceId: SOURCES.access, weight: 1, title: 'بوابة الدخول: محاولة دخول بشهادة منتهية', detail: 'رُفض الدخول وتم إشعار المشرف — {site}' },
  { type: 'alert', tone: 'accent', sourceId: SOURCES.access, weight: 3, title: 'عدد العاملين داخل الموقع: {headcount}', detail: 'تحديث بوابات الحضور — {site}' },
  { type: 'alert', tone: 'good', sourceId: SOURCES.wear, weight: 1, title: 'زر الطوارئ: اختبار دوري ناجح — {zone}', detail: 'زمن استجابة غرفة التحكم {n} ثانية' },
  { type: 'alert', tone: 'accent', sourceId: SOURCES.wear, weight: 1, title: 'رصد سقوط محتمل — تم التحقق: إنذار كاذب', detail: 'العامل {worker} بخير؛ الجهاز اهتز أثناء النزول من السلم — {zone}' },
];

/** Relative frequency of each feed type. */
const TYPE_WEIGHTS = Object.freeze({
  sensor: 16, ppe: 14, permit: 13, inspection: 12, integration: 9, training: 9, alert: 8, weather: 7, nearmiss: 7, incident: 5,
});

/** Seed-provided phrases (`seed.feedTemplates`) normalised into the same shape, when present. */
function seedTemplates() {
  const list = arr(state().feedTemplates);
  const out = [];
  for (const t of list) {
    if (!t) continue;
    if (typeof t === 'string') {
      out.push({ type: 'alert', tone: 'accent', title: t, detail: '', weight: 1, fromSeed: true });
      continue;
    }
    if (typeof t !== 'object') continue;
    const title = t.title || t.text || t.phrase || t.template;
    if (typeof title !== 'string' || !title.trim()) continue;
    out.push({
      type: FEED_TYPES.has(t.type) ? t.type : 'alert',
      tone: TONES.has(t.tone) ? t.tone : 'accent',
      sourceId: t.sourceId || t.source || undefined,
      title,
      detail: typeof t.detail === 'string' ? t.detail : '',
      weight: num(t.weight, 1),
      fromSeed: true,
    });
  }
  return out;
}

let templateCache = { key: null, byType: null };

function templatesByType() {
  const seedList = seedTemplates();
  const key = seedList.length;
  if (templateCache.byType && templateCache.key === key) return templateCache.byType;
  const byType = new Map();
  for (const t of [...TEMPLATES, ...seedList]) {
    if (!byType.has(t.type)) byType.set(t.type, []);
    byType.get(t.type).push(t);
  }
  templateCache = { key, byType };
  return byType;
}

/**
 * Replace `{key}` / `{{key}}` placeholders; unknown keys become empty strings. Feed copy is
 * digit-localised later in emitFeed(); record content (incident descriptions) keeps Latin
 * digits like the seed.
 */
function fill(text, ctx) {
  return String(text || '')
    .replace(/\{\{?\s*([\w.]+)\s*\}?\}/g, (_, key) => {
      const v = ctx[key];
      return v == null ? '' : String(v);
    })
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+(،)/g, '$1')
    .replace(/(^|\s)[—·]\s*$/g, '')
    .trim();
}

/** Placeholder → raw payload field, so consumers get the number behind the formatted text. */
const PAYLOAD_KEYS = Object.freeze({
  value: 'value', latency: 'ms', latencyHigh: 'ms', days: 'days', minutes: 'minutes', hours: 'hours', pct: 'pct',
  n: 'count', n2: 'count', workersCount: 'count', headcount: 'count', checklist: 'count',
});
function payloadFor(templateText, ctx) {
  const raw = ctx.raw && ctx.raw.numbers ? ctx.raw.numbers : {};
  const out = {};
  const re = /\{\{?\s*([\w.]+)\s*\}?\}/g;
  let m;
  while ((m = re.exec(String(templateText || ''))) !== null) {
    const field = PAYLOAD_KEYS[m[1]];
    if (field && out[field] === undefined && Number.isFinite(raw[m[1]])) out[field] = raw[m[1]];
  }
  if (out.value !== undefined && ctx.unit) out.unit = ctx.unit;
  // Explicit raw fields set by the seed-template resolver win over placeholder inference.
  for (const [k, v] of Object.entries(ctx.payload || {})) if (v !== undefined && v !== null && v !== '') out[k] = v;
  return out;
}

/* ────────────────────────────── event context ────────────────────────────── */

function workersOf(siteId) {
  const list = arr(state().workers).filter((w) => w && (!siteId || w.siteId === siteId));
  return list.length ? list : arr(state().workers);
}

function workerName(siteId) {
  const w = pick(workersOf(siteId));
  return (w && w.name) || pick(FALLBACK_WORKERS);
}

function courseName() {
  const c = pick(arr(state().courses));
  return (c && c.name) || pick(FALLBACK_COURSES);
}

function openIncidentOf(siteId) {
  const list = arr(state().incidents).filter((i) => i && i.status !== 'مغلق' && (!siteId || i.siteId === siteId));
  return pick(list.length ? list : arr(state().incidents).filter((i) => i && i.status !== 'مغلق')) || null;
}

function inspectionOf(siteId) {
  const all = arr(state().inspections);
  const mine = all.filter((i) => i && i.siteId === siteId);
  const upcoming = mine.filter((i) => i.status === 'مجدول');
  return pick(upcoming.length ? upcoming : (mine.length ? mine : all)) || null;
}

function permitOf(siteId, status) {
  const all = arr(state().permits).filter((p) => p && p.status === status);
  const mine = all.filter((p) => p.siteId === siteId);
  return pick(mine.length ? mine : all) || null;
}

function sensorModelOf(siteId) {
  const models = Array.from(E.sensors.values());
  const mine = models.filter((m) => m.siteId === siteId);
  return pick(mine.length ? mine : models) || null;
}

function connectedIntegration() {
  const list = arr(state().integrations).filter((g) => g && (g.status === 'connected' || g.status === 'degraded'));
  return pick(list.length ? list : arr(state().integrations)) || null;
}

function inspectionWithStatus(siteId, status) {
  const all = arr(state().inspections).filter((i) => i && i.status === status);
  const mine = all.filter((i) => i.siteId === siteId);
  return pick(mine.length ? mine : all) || null;
}

function expiringPermitOf(siteId, now) {
  try {
    const list = arr(sel.permitsExpiringSoon(state(), TIMING.permitWarnWindow / MINUTE, { siteId: 'all' }, now));
    const mine = list.filter((p) => p.siteId === siteId);
    return pick(mine.length ? mine : list) || null;
  } catch { return null; }
}

function buildContext() {
  const now = Date.now();
  const site = weightedPick(sites(), (s) => Math.max(50, num(s.workers, 200))) || null;
  const siteId = site ? site.id : null;
  const zone = pick(zonesOf(site)) || null;
  const permit = permitOf(siteId, PERMIT_ACTIVE) || pick(arr(state().permits)) || null;
  const pending = permitOf(siteId, 'بانتظار الاعتماد');
  const sensor = sensorModelOf(siteId);
  const integration = connectedIntegration();
  const inspection = inspectionOf(siteId);
  const incident = openIncidentOf(siteId);
  const displayValue = sensor ? displayValueOf(sensor, now) : 0;
  const sensorRatio = sensor ? (sensor.inverted ? (sensor.threshold / Math.max(displayValue, 0.001)) : (displayValue / Math.max(sensor.threshold, 0.001))) : 0;
  const latency = integration ? Math.max(20, num(integration.latencyMs, 120)) : randInt(80, 400);
  const temp = randInt(27, 41);
  const wind = randInt(6, 28);
  const wbgt = randInt(24, 30);
  const numbers = {
    value: sensor ? round(displayValue, 2) : round(randBetween(10, 40), 1),
    latency,
    latencyHigh: Math.round(latency * randBetween(2.2, 3.4)),
    workersCount: permit ? num(permit.workers, 3) : randInt(2, 8),
    checklist: inspection ? num(inspection.checklistTotal, 40) : randInt(30, 60),
    n: randInt(2, 9),
    n2: randInt(12, 64),
    pct: randInt(8, 19),
    days: randInt(5, 28),
    hours: randInt(2, 4),
    minutes: randInt(10, 55),
    headcount: Math.round(num(site && site.workers, 300) * randBetween(0.78, 0.97)),
  };
  return {
    // raw entities (used by the seed-template resolver)
    raw: {
      site,
      zone,
      sensor,
      permit,
      pending,
      closedPermit: permitOf(siteId, PERMIT_CLOSED),
      suspendedPermit: permitOf(siteId, 'معلق'),
      expiringPermit: expiringPermitOf(siteId, now),
      inspection,
      inspectionDone: inspectionWithStatus(siteId, 'منجز'),
      inspectionScheduled: inspectionWithStatus(siteId, 'مجدول'),
      inspectionOverdue: inspectionWithStatus(siteId, 'متأخر'),
      incident,
      incidentHigh: pick(arr(state().incidents).filter((i) => i && i.status !== 'مغلق' && num(i.severity, 0) >= 4)) || null,
      integration,
      integrationDegraded: pick(arr(state().integrations).filter((g) => g && g.status === 'degraded')) || null,
      displayValue,
      numbers,
      now,
    },
    // generic placeholders shared by seed templates: {code} {value} {unit}
    code: '',
    rawCode: '',
    refId: null,
    payload: {},
    unit: '',
    siteId,
    site: site ? site.name : '',
    siteCode: site ? site.code : '',
    zone: zone ? zone.name : '',
    zoneId: zone ? zone.id : '',
    permit: permit ? nbh(permit.code) : '',
    permitCode: permit ? permit.code : '',
    permitId: permit ? permit.id : null,
    permitType: permit ? permit.type : '',
    permitLocation: permit ? permit.location : '',
    permitHasGas: Boolean(permit && permit.gasTest),
    approver: permit ? permit.approver : (site ? site.hseLead || site.manager : ''),
    requester: permit ? permit.requester : '',
    workersCount: n0(numbers.workersCount),
    permitPending: pending ? nbh(pending.code) : '',
    permitPendingCode: pending ? pending.code : '',
    permitPendingId: pending ? pending.id : null,
    permitPendingType: pending ? pending.type : '',
    permitPendingLocation: pending ? pending.location : '',
    permitPendingApprover: pending ? pending.approver : '',
    sensor: sensor ? sensor.kind : 'الغبار PM2.5',
    sensorId: sensor ? sensor.id : '',
    value: sensor ? n1(displayValue) : n1(numbers.value),
    unit: sensor ? sensor.unit : '',
    threshold: sensor ? n1(sensor.threshold) : '',
    sensorRatio,
    integration: integration ? integration.name : 'منصة بلتكس لإدارة المشاريع',
    integrationId: integration ? integration.id : SOURCES.pm,
    latency: n0(numbers.latency),
    latencyHigh: n0(numbers.latencyHigh),
    worker: workerName(siteId),
    course: courseName(),
    inspection: inspection ? nbh(inspection.code) : '',
    inspectionCode: inspection ? inspection.code : '',
    inspectionId: inspection ? inspection.id : null,
    inspectionType: inspection ? inspection.type : pick(INSPECTION_TYPES_FALLBACK),
    inspector: inspection ? inspection.inspector : (site ? site.hseLead || site.manager : ''),
    checklist: n0(numbers.checklist),
    incident: incident ? nbh(incident.code) : '',
    incidentCode: incident ? incident.code : '',
    incidentId: incident ? incident.id : null,
    incidentTitle: incident ? incident.title : '',
    n: n0(numbers.n),
    n2: n0(numbers.n2),
    pct: n0(numbers.pct),
    days: n0(numbers.days),
    hours: n0(numbers.hours),
    minutes: n0(numbers.minutes),
    headcount: n0(numbers.headcount),
    temp: n0(temp),
    humidity: n0(randInt(18, 62)),
    wind: n0(wind),
    windHigh: n0(randInt(39, 52)),
    wbgt: n0(wbgt),
    wbgtHigh: n1(randBetween(30.5, 33.5)),
    o2: n1(randBetween(20.6, 20.9)),
    h2s: n0(randInt(0, 2)),
    co: n0(randInt(0, 3)),
    topic: pick(TOOLBOX_TOPICS),
    doc: nbh(`DMS-${randInt(10_000, 99_999)}`),
  };
}

/** Raw-number helper for seed-template contexts: formatted text + raw payload in one go. */
function setValue(ctx, raw, unit, digits = 0) {
  ctx.value = digits ? n1(raw) : n0(raw);
  ctx.unit = unit;
  if (!ctx.payload) ctx.payload = {};
  ctx.payload.value = raw;
  if (unit) ctx.payload.unit = unit;
  return ctx;
}
/** Code helper for seed-template contexts: U+2011 in the sentence, plain code + id in the payload. */
function setCode(ctx, entity) {
  ctx.code = nbh(entity.code);
  ctx.rawCode = String(entity.code || '');
  ctx.refId = entity.id ?? null;
  return ctx;
}

/* ────────────────────────────── seed-template resolver ────────────────────────────── */

/** Sensor-kind tokens a phrase may mention; a template naming one must match the sensor kind. */
const KIND_TOKENS = [
  [/WBGT|الإجهاد الحراري/, /WBGT|حرار/],
  [/الرياح|رياح/, /رياح/],
  [/H2S/, /H2S/],
  [/\bCO\b|أكسيد الكربون/, /\bCO\b|أكسيد/],
  [/PM2\.5|الغبار|غبار/, /PM|غبار/],
  [/الضوضاء|ضوضاء/, /ضوضاء/],
  [/الاهتزاز|اهتزاز/, /اهتزاز/],
  [/O₂|O2|الأكسجين/, /O₂|O2|أكسجين/],
];

function kindCompatible(phrase, kind) {
  for (const [mention, matcher] of KIND_TOKENS) {
    if (mention.test(phrase) && !matcher.test(String(kind || ''))) return false;
  }
  return true;
}

/**
 * Seed phrases (`seed.feedTemplates`) describe real situations with generic `{code}`,
 * `{value}` and `{unit}` placeholders. Resolve them against actual entities and skip
 * phrases that would contradict the current state (an "expired permit" that is not
 * expired, a "degraded connector" when none is, a WBGT phrase for a wind sensor…).
 * Returns an augmented context or null to skip.
 */
function seedContext(t, base) {
  const raw = base.raw || {};
  const phrase = `${t.title} ${t.detail}`;
  const ctx = { ...base, payload: { ...(base.payload || {}) } };
  // State-changing "critical" phrases are produced by the engine itself with real data.
  if (t.tone === 'critical') return null;
  switch (t.type) {
    case 'sensor': {
      const m = raw.sensor;
      if (!m || !kindCompatible(phrase, m.kind)) return null;
      if (t.tone === 'warning' && base.sensorRatio < 0.7) return null;
      if (/عودة|الطبيعي/.test(phrase) && base.sensorRatio > 0.6) return null;
      ctx.code = m.kind; ctx.rawCode = m.code || m.id; ctx.refId = m.id;
      setValue(ctx, round(raw.displayValue, 2), m.unit, 1);
      if (m.zoneId) ctx.zone = zoneName(m.siteId, m.zoneId) || ctx.zone;
      break;
    }
    case 'permit': {
      let p = raw.permit;
      if (/اعتماد/.test(phrase)) p = raw.pending;
      else if (/الانتهاء|انتهاء/.test(phrase)) {
        p = raw.expiringPermit;
        if (!p) return null;
        const minutes = Math.max(1, Math.round((Date.parse(p.expiresAt) - raw.now) / MINUTE));
        setValue(ctx, minutes, 'دقيقة');
        ctx.payload.minutes = minutes;
      } else if (/إغلاق|أُغلق|اكتمال العمل/.test(phrase)) p = raw.closedPermit;
      else if (/تعليق|معلق/.test(phrase)) p = raw.suspendedPermit;
      if (!p) return null;
      if (/O₂|غازات/.test(phrase)) {
        if (!p.gasTest && !/قبل الدخول/.test(phrase)) return null;
        setValue(ctx, round(randBetween(20.6, 20.9), 1), '%', 1);
      }
      setCode(ctx, p); ctx.siteId = p.siteId;
      ctx.site = (siteById(p.siteId) || {}).name || ctx.site;
      ctx.zone = p.location || zoneName(p.siteId, p.zoneId) || ctx.zone;
      break;
    }
    case 'incident': {
      const i = /تصعيد|عالي الخطورة/.test(phrase) ? raw.incidentHigh : raw.incident;
      if (!i) return null;
      setCode(ctx, i); ctx.siteId = i.siteId;
      ctx.site = (siteById(i.siteId) || {}).name || ctx.site;
      ctx.zone = i.location || zoneName(i.siteId, i.zoneId) || ctx.zone;
      break;
    }
    case 'inspection': {
      let ins = raw.inspection;
      if (/متأخر/.test(phrase)) ins = raw.inspectionOverdue;
      else if (/بدء|قائمة تحقق/.test(phrase)) { ins = raw.inspectionScheduled; if (ins) setValue(ctx, num(ins.checklistTotal, 40), 'بندًا'); }
      else if (/اعتماد|الدرجة|ملاحظة/.test(phrase)) { ins = raw.inspectionDone; if (ins) setValue(ctx, num(ins.score, 85), '%'); }
      if (!ins) return null;
      setCode(ctx, ins); ctx.siteId = ins.siteId;
      ctx.site = (siteById(ins.siteId) || {}).name || ctx.site;
      ctx.zone = zoneName(ins.siteId, ins.zoneId) || ctx.zone;
      break;
    }
    case 'training': {
      if (/تنتهي خلال/.test(phrase)) { const d = randInt(7, 45); setValue(ctx, d, 'يومًا'); ctx.payload.days = d; }
      else if (/شهادة/.test(phrase)) setValue(ctx, randInt(14, 80), '');
      else setValue(ctx, randInt(6, 24), '');
      break;
    }
    case 'integration': {
      const g = /تدهور|متدهور/.test(phrase) ? raw.integrationDegraded : raw.integration;
      if (!g) return null;
      if (/استعادة/.test(phrase) && g.status !== 'connected') return null;
      ctx.code = g.name; ctx.rawCode = g.id; ctx.siteId = null;
      if (/الاستجابة/.test(phrase)) { const ms = Math.max(20, num(g.latencyMs, 120)); setValue(ctx, ms, 'مللي ثانية'); ctx.payload.ms = ms; }
      else setValue(ctx, randInt(12, 180), '');
      ctx.sourceId = g.id;
      break;
    }
    case 'ppe': {
      setValue(ctx, randInt(93, 99), '%');
      break;
    }
    case 'weather': {
      if (/رياح/.test(phrase)) setValue(ctx, randInt(39, 55), 'كم/س');
      else if (/الحرارة|حرارة/.test(phrase)) setValue(ctx, randInt(42, 47), '°م');
      else if (/الرؤية|غبار/.test(phrase)) setValue(ctx, round(randBetween(1.2, 3.5), 1), 'كم', 1);
      break;
    }
    case 'alert': {
      if (/تجاوز الحد/.test(phrase)) setValue(ctx, randInt(22, 40), '');
      const ap = `AP-${randInt(1, 4)}`;
      ctx.code = nbh(ap); ctx.rawCode = ap;
      break;
    }
    default:
      break;
  }
  return ctx;
}

/** Compose one random feed event from the library and push it. */
function feedStep() {
  if (feedPaused()) return null;
  return emitRandomFeed();
}

function emitRandomFeed() {
  const byType = templatesByType();
  const types = Array.from(byType.keys());
  if (!types.length) return null;
  const base = buildContext();
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const type = weightedPick(types, (t) => TYPE_WEIGHTS[t] || 2);
    const candidates = arr(byType.get(type)).filter((t) => {
      try { return typeof t.requires === 'function' ? Boolean(t.requires(base)) : true; } catch { return false; }
    });
    if (!candidates.length) continue;
    const template = weightedPick(candidates, (t) => num(t.weight, 1));
    const ctx = template.fromSeed ? seedContext(template, base) : base;
    if (!ctx) continue;
    const title = fill(template.title, ctx);
    if (!title) continue;
    let sourceId = ctx.sourceId || template.sourceId;
    if (type === 'integration' && !sourceId) sourceId = ctx.integrationId;
    const text = `${template.title} ${template.detail}`;
    // Plain code + entity id of the record the phrase talks about (the sentence carries the U+2011 form).
    let code = ctx.rawCode || '';
    let refId = ctx.refId || null;
    if (!code) {
      if (/\{permitPending\}/.test(text)) { code = ctx.permitPendingCode; refId = ctx.permitPendingId; }
      else if (/\{permit\}/.test(text)) { code = ctx.permitCode; refId = ctx.permitId; }
      else if (/\{incident\}/.test(text)) { code = ctx.incidentCode; refId = ctx.incidentId; }
      else if (/\{inspection\}/.test(text)) { code = ctx.inspectionCode; refId = ctx.inspectionId; }
      else if (/\{sensor\}|\{value\}/.test(text) && ctx.sensorId) { refId = ctx.sensorId; }
    }
    return emitFeed({
      type,
      tone: template.tone,
      siteId: ctx.siteId,
      title,
      detail: fill(template.detail, ctx),
      sourceId: sourceId || null,
      code: code || undefined,
      refId: refId || undefined,
      ...payloadFor(text, ctx),
    });
  }
  return null;
}

/* ────────────────────────────── sensors ────────────────────────────── */

function categoryForSensor(kind) {
  const k = String(kind || '');
  if (/H2S|CO\b|أكسيد|O₂|O2|أكسجين/i.test(k)) return 'confined';
  if (/WBGT|حرار/i.test(k)) return 'heat';
  if (/رياح|wind/i.test(k)) return 'lifting';
  if (/ضوضاء|اهتزاز|noise|vibration/i.test(k)) return 'ergonomic';
  return 'chemical';
}

function buildSensorModel(s) {
  const min = num(s.min, 0);
  const rawMax = num(s.max, NaN);
  const value0 = num(s.value, NaN);
  const max = Number.isFinite(rawMax) ? rawMax : Math.max(1, (Number.isFinite(value0) ? value0 : 1) * 2);
  const threshold = clamp(num(s.threshold, max), min, max);
  const base = clamp(Number.isFinite(value0) ? value0 : (min + max) / 2, min, max);
  const inverted = base > threshold; // a sensor whose baseline sits above its threshold: lower is worse
  const lowThreshold = Number.isFinite(Number(s.lowThreshold)) ? clamp(Number(s.lowThreshold), min, threshold) : null;
  const span = Math.max(Math.abs(threshold - base), (max - min) * 0.05);
  // A sensor with a lower alarm limit (O₂ deficiency) may dip a little below the seed `min`
  // during a deficiency excursion; `floor` is the hard lower bound of the simulation.
  const floor = lowThreshold != null && !inverted ? Math.min(min, lowThreshold - Math.max((threshold - lowThreshold) * 0.12, 0.2)) : min;
  return {
    id: s.id,
    code: String(s.code || s.id),
    location: String(s.location || ''),
    siteId: s.siteId,
    zoneId: s.zoneId ?? null,
    kind: String(s.kind || s.id),
    unit: String(s.unit || ''),
    min,
    max,
    floor,
    threshold,
    lowThreshold,
    low: false,
    base,
    inverted,
    span,
    amp: span * randBetween(0.28, 0.42),
    period: randBetween(45, 140) * SECOND,
    phase: randBetween(0, Math.PI * 2),
    noise: span * 0.06,
    value: base,
    prev: base,
    target: base,
    excursion: null, // { endsAt, peak, alerted, startedAt }
    over: false,
    categoryId: categoryForSensor(s.kind),
  };
}

function syncSensorModels() {
  const list = arr(state().sensors);
  const seen = new Set();
  for (const s of list) {
    if (!s || s.id == null) continue;
    seen.add(s.id);
    if (!E.sensors.has(s.id)) E.sensors.set(s.id, buildSensorModel(s));
  }
  for (const id of Array.from(E.sensors.keys())) if (!seen.has(id)) E.sensors.delete(id);
}

function normalTarget(m, now) {
  const t = (now - E.startedAt) / SECOND;
  const wave = Math.sin((2 * Math.PI * t) / (m.period / SECOND) + m.phase);
  let target = m.base + m.amp * wave + m.noise * (rand() * 2 - 1);
  if (m.inverted) target = clamp(target, m.threshold + m.span * 0.12, m.max);
  else target = clamp(target, m.lowThreshold != null ? m.lowThreshold + m.span * 0.1 : m.min, m.threshold - m.span * 0.1);
  return target;
}

/** Below the lower alarm limit (O₂ deficiency) counts as an excursion too. */
function isLow(m, value) {
  return m.lowThreshold != null && !m.inverted && value < m.lowThreshold;
}

function isOver(m, value) {
  if (m.inverted) return value < m.threshold;
  return value > m.threshold || isLow(m, value);
}

function hasHighRoom(m) {
  return m.inverted ? m.threshold - m.min > m.span * 0.3 : m.max - m.threshold > m.span * 0.3;
}
function hasLowRoom(m) {
  return m.lowThreshold != null && !m.inverted && m.lowThreshold - m.floor > 0;
}

function sensorSnapshot(m) {
  const value = round(m.value, m.max - m.min > 50 ? 0 : (m.max - m.min > 5 ? 1 : 2));
  return {
    id: m.id,
    code: m.code,
    location: m.location,
    siteId: m.siteId,
    zoneId: m.zoneId,
    kind: m.kind,
    unit: m.unit,
    value,
    min: m.min,
    max: m.max,
    threshold: m.threshold,
    lowThreshold: m.lowThreshold,
    pct: Math.round(clamp(((value - m.min) / Math.max(m.max - m.min, 0.001)) * 100, 0, 100)),
    over: m.over,
    low: m.low === true,
    direction: m.over ? (m.low ? 'low' : 'high') : null,
    excursion: Boolean(m.excursion),
    categoryId: m.categoryId,
  };
}

/** Advance every sensor one step; handles excursion lifecycle + alerts. */
function sensorStep(now = Date.now()) {
  if (!E.store) return [];
  syncSensorModels();
  const dt = clamp((now - (E.lastSensorTick || now - TIMING.sensor)) / SECOND, 0.2, 3);
  E.lastSensorTick = now;
  const stateSensors = arr(state().sensors);
  const snapshots = [];
  for (const m of E.sensors.values()) {
    m.prev = m.value;
    let tau = 3.2;
    if (m.excursion) {
      if (now >= m.excursion.endsAt) {
        m.excursion = null;
        m.target = normalTarget(m, now);
      } else {
        m.target = m.excursion.peak + m.noise * (rand() * 2 - 1);
        tau = 1.6;
      }
    } else {
      m.target = normalTarget(m, now);
    }
    const k = 1 - Math.exp(-dt / tau);
    m.value = clamp(m.value + (m.target - m.value) * k, m.floor ?? m.min, m.max);
    const wasOver = m.over;
    m.over = isOver(m, m.value);
    m.low = m.over && isLow(m, m.value);
    if (m.over && !wasOver && m.excursion && !m.excursion.alerted) {
      m.excursion.alerted = true;
      raiseSensorAlert(m, now);
    } else if (!m.over && wasOver && m.recovering) {
      m.recovering = false;
      const low = m.lastDirection === 'low';
      const limit = low ? m.lowThreshold : m.threshold;
      emitFeed({
        type: 'sensor',
        tone: 'good',
        siteId: m.siteId,
        title: `عودة قراءة ${m.kind} إلى المعدل الطبيعي — ${zoneName(m.siteId, m.zoneId) || 'الموقع'}`,
        detail: `القراءة الحالية ${n1(m.value)} ${m.unit} (${low ? 'الحد الأدنى' : 'الحد'} ${n1(limit)} ${m.unit}) · رفع الإجراءات الاحترازية`,
        sourceId: SOURCES.iot,
        refId: m.id,
        code: m.code,
        value: round(m.value, 2),
        unit: m.unit,
        threshold: limit,
        direction: low ? 'low' : 'high',
      });
    }
    if (m.over && m.excursion && m.excursion.alerted) m.recovering = true;
    // Keep the shared state truthful for selectors (no store:change: this runs every second).
    const raw = stateSensors.find((s) => s && s.id === m.id);
    if (raw) raw.value = round(m.value, 2);
    snapshots.push(sensorSnapshot(m));
  }
  emitBus('sensors:tick', { sensors: snapshots, ts: localISO(now) });
  return snapshots;
}

function raiseSensorAlert(m, now) {
  const zone = zoneName(m.siteId, m.zoneId);
  const site = siteById(m.siteId);
  const where = [m.location || zone, site && site.name].filter(Boolean).join(' · ');
  const low = m.inverted || m.low === true;
  const limit = m.low === true && m.lowThreshold != null ? m.lowThreshold : m.threshold;
  m.lastDirection = low ? 'low' : 'high';
  const direction = low ? 'انخفضت دون الحد الأدنى' : 'تجاوزت الحد المسموح';
  const title = `قراءة ${m.kind} ${direction} (${n1(limit)} ${m.unit})`;
  const detail = `القيمة الحالية ${n1(m.value)} ${m.unit} — ${where || 'الموقع'} · حسّاس ${nbh(m.code)} · إخلاء احترازي للمنطقة والتحقق الميداني`;
  emitBus('alert', {
    severity: 'critical',
    tone: 'critical',
    kind: 'sensor',
    title,
    detail,
    siteId: m.siteId,
    zoneId: m.zoneId,
    sensorId: m.id,
    code: m.code,
    value: round(m.value, 2),
    threshold: limit,
    lowThreshold: m.lowThreshold,
    direction: low ? 'low' : 'high',
    unit: m.unit,
    ts: localISO(now),
  });
  emitFeed({
    type: 'sensor',
    tone: 'critical',
    siteId: m.siteId,
    title: `${title} — ${zone || (site ? site.name : '')}`,
    detail,
    sourceId: SOURCES.iot,
    refId: m.id,
    code: m.code,
    value: round(m.value, 2),
    unit: m.unit,
    threshold: limit,
    direction: low ? 'low' : 'high',
  });
  addTransient({
    id: `det-${m.id}-${now.toString(36)}`,
    code: m.id,
    label: `${m.kind} — ${zone || (site ? site.name : '')}`,
    categoryId: m.categoryId,
    tone: 'critical',
    r: randBetween(0.16, 0.3),
    siteId: m.siteId,
  }, now);
}

/** Start a threshold excursion on a random sensor with headroom (≈ every 90 s). */
function excursionPeak(m, low) {
  if (low) return clamp(m.lowThreshold - (m.lowThreshold - m.floor) * randBetween(0.4, 0.9), m.floor, m.max);
  if (m.inverted) return clamp(m.threshold - (m.threshold - m.min) * randBetween(0.25, 0.6), m.min, m.max);
  return clamp(m.threshold + (m.max - m.threshold) * randBetween(0.3, 0.8), m.min, m.max);
}

/**
 * Start a threshold excursion on a random sensor with headroom (≈ every 90 s). A sensor with a
 * lower alarm limit (O₂) dips below it — a deficiency — in ~60 % of its excursions.
 */
function startExcursion(now = Date.now()) {
  syncSensorModels();
  const candidates = Array.from(E.sensors.values()).filter((m) => !m.excursion && (hasHighRoom(m) || hasLowRoom(m)));
  const m = pick(candidates);
  if (!m) return null;
  const duration = randBetween(TIMING.excursionMin, TIMING.excursionMax);
  const low = hasLowRoom(m) && (!hasHighRoom(m) || chance(0.6));
  m.excursion = { startedAt: now, endsAt: now + duration, peak: excursionPeak(m, low), alerted: false, low };
  return m.id;
}

/** Interpolate between the last two ticks so 60 fps consumers see smooth motion. */
function displayValueOf(m, now) {
  const f = clamp((now - E.lastSensorTick) / TIMING.sensor, 0, 1);
  return m.prev + (m.value - m.prev) * f;
}

/* ────────────────────────────── transient radar detections ────────────────────────────── */

function sectorAngle(categoryId) {
  const idx = Math.max(0, arr(CATEGORIES).findIndex((c) => c.id === categoryId));
  return idx * 30 + 15;
}

function addTransient(blip, now = Date.now()) {
  const ttl = TIMING.transientBlipTtl;
  E.transients.push({
    id: blip.id,
    code: blip.code,
    label: blip.label,
    angle: round(((sectorAngle(blip.categoryId) + randBetween(-11, 11)) % 360 + 360) % 360, 2),
    r: round(clamp(blip.r, 0.1, 0.94), 4),
    tier: blip.tone === 'critical' ? 'حرج' : (blip.tone === 'serious' ? 'عالٍ' : 'متوسط'),
    tone: blip.tone,
    siteId: blip.siteId,
    categoryId: blip.categoryId,
    transient: true,
    bornAt: now,
    until: now + ttl,
  });
  if (E.transients.length > 24) E.transients.splice(0, E.transients.length - 24);
}

function pruneTransients(now) {
  E.transients = E.transients.filter((t) => t.until > now);
}

/* ────────────────────────────── permits ────────────────────────────── */

function permitStep(now = Date.now()) {
  if (!E.store) return;
  const list = arr(state().permits);
  const expired = [];
  const activeIds = new Set();
  for (const p of list) {
    if (!p || p.status !== PERMIT_ACTIVE) continue;
    activeIds.add(p.id);
    const exp = Date.parse(p.expiresAt);
    if (!Number.isFinite(exp)) continue;
    if (exp <= now) {
      expired.push({ p, exp });
    } else if (exp - now <= TIMING.permitWarnWindow && E.permitWarned.get(p.id) !== p.expiresAt && !feedPaused()) {
      const minutes = Math.max(1, Math.round((exp - now) / MINUTE));
      E.permitWarned.set(p.id, p.expiresAt);
      emitFeed({
        type: 'permit',
        tone: 'warning',
        siteId: p.siteId,
        title: `تصريح ${nbh(p.code)} يقترب من الانتهاء خلال ${n0(minutes)} دقيقة`,
        detail: `${p.type} — ${p.location || ''} · ينتهي ${safeTime(p.expiresAt)} · يلزم الإقفال أو التمديد قبل الموعد`,
        sourceId: SOURCES.pm,
        refId: p.id,
        code: p.code,
        minutes,
        value: minutes,
        unit: 'دقيقة',
      });
    }
  }
  for (const id of Array.from(E.permitWarned.keys())) if (!activeIds.has(id)) E.permitWarned.delete(id);

  // Several permits may have lapsed at once (e.g. hours before the dashboard was opened):
  // close the oldest first and space the closures out so the feed stays readable.
  if (expired.length && now >= E.nextExpiryAt) {
    expired.sort((a, b) => a.exp - b.exp);
    const { p } = expired[0];
    closeExpiredPermit(p, now);
    E.nextExpiryAt = now + (expired.length > 1 ? randBetween(8 * SECOND, 15 * SECOND) : 0);
  }
  if (!feedPaused() && E.pendingReplacements.length) issueReplacement(E.pendingReplacements.shift(), Date.now());
}

function closeExpiredPermit(p, now) {
  const snapshot = { ...p, hazards: arr(p.hazards).slice(), controls: arr(p.controls).slice(), gasTest: p.gasTest ? { ...p.gasTest } : null };
  if (typeof E.store.updatePermit === 'function') {
    E.store.updatePermit(p.id, { status: PERMIT_CLOSED, closedAt: localISO(now), closeReason: 'انتهاء الصلاحية — إغلاق تلقائي' });
  }
  E.permitWarned.delete(p.id);
  if (feedPaused()) E.pendingReplacements.push(snapshot);
  else issueReplacement(snapshot, now);
}

function issueReplacement(p, now) {
  if (!p || typeof E.store.addPermit !== 'function') return null;
  const hours = randBetween(TIMING.replacementMinHours, TIMING.replacementMaxHours);
  const expiresMs = now + hours * HOUR;
  const gasTest = p.gasTest
    ? { o2: round(randBetween(20.6, 20.9), 1), lel: 0, h2s: randInt(0, 2), co: randInt(0, 3) }
    : null;
  let created = null;
  try {
    created = E.store.addPermit({
      siteId: p.siteId,
      zoneId: p.zoneId,
      type: p.type,
      status: PERMIT_ACTIVE,
      requester: p.requester,
      approver: p.approver,
      startsAt: localISO(now),
      expiresAt: localISO(expiresMs),
      approvedAt: localISO(now),
      location: p.location,
      hazards: arr(p.hazards),
      controls: arr(p.controls),
      workers: num(p.workers, 3),
      gasTest,
      replaces: p.code,
      simulated: true,
      source: 'المحاكاة الحية — تصريح بديل',
    });
  } catch (err) {
    warn('addPermit', err);
  }
  if (!created) return null;
  emitFeed({
    type: 'permit',
    tone: 'accent',
    siteId: p.siteId,
    title: `انتهاء صلاحية التصريح ${nbh(p.code)} — إغلاق تلقائي`,
    detail: `تم إصدار تصريح جديد ${nbh(created.code)} (${p.type}) بديلاً عنه حتى ${safeTime(created.expiresAt)} · ${p.location || ''}`,
    sourceId: SOURCES.pm,
    refId: created.id,
    code: created.code,
    hours: round(hours, 1),
  });
  pruneSimulated('permits');
  return created;
}

/* ────────────────────────────── integrations ────────────────────────────── */

function integrationModel(g, now) {
  let m = E.integrations.get(g.id);
  if (!m) {
    const degradedNow = g.status === 'degraded';
    m = {
      // a connector seeded as degraded carries inflated latency; estimate its healthy baseline
      baseLatency: clamp(degradedNow ? Math.round(num(g.latencyMs, 600) / 4) : num(g.latencyMs, 120), 20, 4000),
      baseEvents: Math.max(0, degradedNow ? Math.round(num(g.eventsPerHour, 60) * 1.6) : num(g.eventsPerHour, 60)),
      history: arr(g.eventsHistory).filter((v) => Number.isFinite(Number(v))).map(Number).slice(-24),
      degradedSince: g.status === 'degraded' ? now : null,
      recoverAfter: TIMING.degradedRecovery + randBetween(-TIMING.degradedRecoveryJitter, TIMING.degradedRecoveryJitter),
    };
    E.integrations.set(g.id, m);
  }
  return m;
}

function integrationStep(now = Date.now()) {
  if (!E.store || typeof E.store.updateIntegration !== 'function') return;
  const list = arr(state().integrations).filter((g) => g && g.id);
  if (!list.length) return;
  const live = list.filter((g) => g.status === 'connected' || g.status === 'degraded');
  const degraded = live.filter((g) => g.status === 'degraded');
  const connected = live.filter((g) => g.status === 'connected');
  const sample = new Set(degraded);
  const shuffled = connected.slice();
  for (let i = shuffled.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  for (const g of shuffled.slice(0, randInt(3, 5))) sample.add(g);

  for (const g of sample) {
    const m = integrationModel(g, now);
    let latency;
    let events;
    if (g.status === 'degraded') {
      latency = clamp(Math.round(m.baseLatency * randBetween(2.6, 5.5)), 200, 9000);
      events = Math.round(m.baseEvents * randBetween(0.25, 0.55));
    } else {
      latency = clamp(Math.round(m.baseLatency * randBetween(0.82, 1.22)), 20, 4000);
      events = Math.max(0, Math.round(m.baseEvents * randBetween(0.88, 1.12)));
    }
    m.history.push(events);
    if (m.history.length > 24) m.history.splice(0, m.history.length - 24);
    E.store.updateIntegration(g.id, {
      lastSync: localISO(now),
      latencyMs: latency,
      eventsPerHour: events,
      eventsHistory: m.history.slice(),
    });
  }

  // Recovery of degraded connectors (~2 min after first seen degraded).
  for (const g of degraded) {
    const m = integrationModel(g, now);
    if (m.degradedSince == null) m.degradedSince = now;
    if (now - m.degradedSince >= m.recoverAfter) {
      m.degradedSince = null;
      m.recoverAfter = TIMING.degradedRecovery + randBetween(-TIMING.degradedRecoveryJitter, TIMING.degradedRecoveryJitter);
      const latency = Math.round(m.baseLatency * randBetween(0.9, 1.1));
      E.store.updateIntegration(g.id, { status: 'connected', latencyMs: latency, eventsPerHour: Math.round(m.baseEvents), lastSync: localISO(now), lastError: null });
      emitFeed({
        type: 'integration',
        tone: 'good',
        siteId: null,
        title: `استعادة الاتصال الكامل مع ${g.name}`,
        detail: `عاد زمن الاستجابة إلى ${n0(latency)} مللي ثانية بعد فترة تدهور استمرت نحو دقيقتين · اكتملت إعادة مزامنة الأحداث المتأخرة`,
        sourceId: g.id,
        ms: latency,
        value: latency,
        unit: 'مللي ثانية',
      });
    }
  }

  // Occasionally degrade a connected connector so the board stays lively (it recovers in ~2 min).
  if (!E.nextDegradeAt) E.nextDegradeAt = now + TIMING.degradeEvery + randBetween(-TIMING.degradeJitter, TIMING.degradeJitter);
  if (now >= E.nextDegradeAt) {
    E.nextDegradeAt = now + TIMING.degradeEvery + randBetween(-TIMING.degradeJitter, TIMING.degradeJitter);
    const currentlyDegraded = arr(state().integrations).filter((g) => g && g.status === 'degraded').length;
    const victim = pick(connected.filter((g) => g.category !== 'core'));
    if (victim && currentlyDegraded < 2) {
      const m = integrationModel(victim, now);
      m.degradedSince = now;
      const latency = clamp(Math.round(m.baseLatency * randBetween(3, 5)), 300, 9000);
      E.store.updateIntegration(victim.id, { status: 'degraded', latencyMs: latency, lastSync: localISO(now), lastError: 'مهلة الاستجابة تجاوزت الحد المسموح' });
      emitFeed({
        type: 'integration',
        tone: 'warning',
        siteId: null,
        title: `تدهور أداء ${victim.name}`,
        detail: `ارتفاع زمن الاستجابة إلى ${n0(latency)} مللي ثانية — إعادة المحاولة تلقائيًا كل 30 ثانية`,
        sourceId: victim.id,
        ms: latency,
        value: latency,
        unit: 'مللي ثانية',
      });
    }
  }

  emitBus('integrations:tick', { integrations: arr(state().integrations), ts: localISO(now) });
}

/* ────────────────────────────── near-miss generator ────────────────────────────── */

const NEAR_MISS_SCENARIOS = [
  { categoryId: 'height', severity: 3, title: 'سقوط مطرقة من الطابق {floor} قرب ممر العمال', description: 'انزلقت مطرقة من حزام عامل أثناء العمل على المنصة في {zone} وسقطت على بعد نحو متر من عاملين يمران أسفل المنطقة. لم تُسجّل إصابات، ولم تكن منطقة السقوط محاطة بحواجز.', location: '{zone} — الطابق {floor}', immediateCause: 'أدوات يدوية غير مربوطة بحبال تثبيت وغياب منطقة محظورة أسفل العمل', rootCause: 'إجراء عمل غير كافٍ', action: 'إلزام جميع العاملين على ارتفاع بحبال ربط الأدوات وتحديد مناطق محظورة أسفل مناطق العمل' },
  { categoryId: 'lifting', severity: 4, title: 'تأرجح حمولة الرافعة فوق مسار المشاة', description: 'أثناء رفع رزمة حديد تسليح بوزن {weight} طن في {zone} انحرفت الحمولة بفعل هبة رياح ومرت فوق مسار المشاة المؤقت دون تفعيل منطقة الحظر. توقف المشغل فور إشارة المُشير.', location: '{zone}', immediateCause: 'عدم إغلاق مسار المشاة أثناء الرفع وعدم استخدام حبال التوجيه', rootCause: 'ضعف الإشراف', action: 'إغلاق مسارات المشاة أسفل مسار الرفع وتفعيل حبال التوجيه في كل عملية رفع' },
  { categoryId: 'traffic', severity: 4, title: 'شاحنة ترجع للخلف قرب عامل في النقطة العمياء', description: 'لم يلاحظ سائق شاحنة خلاطة عاملًا يقف خلف المركبة في {zone}. توقفت الشاحنة على بعد أقل من متر بعد صراخ منظم الحركة. كان جرس الرجوع للخلف يعمل لكن بصوت منخفض.', location: '{zone} — طريق المعدات', immediateCause: 'وقوف العامل في النطاق الخلفي للمركبة دون منظم حركة مخصص', rootCause: 'غياب التدريب', action: 'فصل حركة المشاة عن المعدات بحواجز وتعيين منظمي حركة لكل منطقة تفريغ' },
  { categoryId: 'electrical', severity: 3, title: 'كابل تمديد مكشوف العزل في منطقة رطبة', description: 'رُصد كابل كهربائي مؤقت بعزل متآكل يمر عبر تجمع مياه في {zone} ومتصل بلوحة توزيع مؤقتة. فُصل التيار فورًا دون وقوع إصابة.', location: '{zone}', immediateCause: 'تمديد مؤقت متضرر لم يُفحص في الجولة اليومية', rootCause: 'عطل معدات', action: 'فحص أسبوعي موثق لجميع التمديدات المؤقتة ورفعها عن الأرض على حوامل معزولة' },
  { categoryId: 'excavation', severity: 4, title: 'انهيار جزئي لجانب خندق بعد خروج العمال', description: 'انهار جزء من الجانب الجنوبي للخندق في {zone} بطول نحو {n} أمتار بعد دقائق من خروج الفريق للاستراحة. لم يكن الجزء المنهار مدعومًا بصناديق الخنادق.', location: '{zone} — الخندق T-{n}', immediateCause: 'امتداد الحفر خارج نطاق الدعامات بعد هطول أمطار خفيفة', rootCause: 'إجراء عمل غير كافٍ', action: 'إعادة تقييم الخندق من الشخص المختص بعد كل تغير جوي ومنع الدخول خارج الجزء المدعوم' },
  { categoryId: 'confined', severity: 4, title: 'ارتفاع قراءة الغاز أثناء العمل داخل غرفة تفتيش', description: 'أطلق جهاز قياس الغازات إنذارًا عند 9 ppm من H2S داخل غرفة التفتيش في {zone}. خرج العاملان خلال 40 ثانية وفق خطة الإنقاذ، وتم رفع التهوية القسرية.', location: '{zone}', immediateCause: 'انخفاض كفاءة مروحة التهوية القسرية بسبب انسداد خرطوم الهواء', rootCause: 'عطل معدات', action: 'فحص مروحة التهوية وخرطومها قبل كل دخول وتسجيل معدل التهوية في التصريح' },
  { categoryId: 'hotwork', severity: 3, title: 'شرر لحام يصل إلى مواد قابلة للاشتعال', description: 'أثناء أعمال اللحام في {zone} تطاير شرر إلى كيس حماية بلاستيكي على بعد ثلاثة أمتار وبدأ بالاحتراق البطيء. أطفأه مراقب الحريق فورًا بطفاية البودرة.', location: '{zone}', immediateCause: 'عدم إزالة المواد القابلة للاشتعال من نطاق 11 مترًا', rootCause: 'إجراء عمل غير كافٍ', action: 'قائمة تحقق إلزامية قبل بدء الأعمال الساخنة تشمل تنظيف نطاق 11 مترًا' },
  { categoryId: 'scaffold', severity: 3, title: 'عامل يصعد سقالة دون بطاقة فحص سارية', description: 'رُصد عامل يعمل على المستوى الثالث لسقالة في {zone} تحمل بطاقة حمراء بعد تعديل تمّ عليها صباحًا دون إعادة فحص. أُنزل العامل وأُغلقت السقالة.', location: '{zone}', immediateCause: 'تجاهل بطاقة السقالة الحمراء', rootCause: 'غياب التدريب', action: 'جلسة توعية ببطاقات Scafftag وتثبيت أقفال على مداخل السقالات غير المعتمدة' },
  { categoryId: 'heat', severity: 3, title: 'أعراض إجهاد حراري لعامل في فترة الظهيرة', description: 'شعر عامل في {zone} بدوار وتشنجات عند الساعة 13:40 مع WBGT {wbgt}°. نُقل إلى منطقة الراحة المكيفة وتعافى دون الحاجة إلى علاج طبي.', location: '{zone}', immediateCause: 'العمل تحت الشمس مع استهلاك غير كافٍ للمياه', rootCause: 'ظروف بيئية', action: 'تطبيق جدول العمل/الراحة بحسب WBGT وتوزيع عبوات الأملاح الفموية' },
  { categoryId: 'chemical', severity: 2, title: 'انسكاب محدود لمادة مذيبة دون حاوية احتواء', description: 'انقلبت عبوة مذيب سعة 20 لترًا في {zone} أثناء نقلها يدويًا وتسرب نحو 5 لترات. احتُوي الانسكاب بمواد ماصة خلال دقائق ولم يتعرض أحد للأبخرة.', location: '{zone} — منطقة تخزين المواد', immediateCause: 'نقل العبوة يدويًا دون عربة وعدم وجود حاوية احتواء ثانوية', rootCause: 'إجراء عمل غير كافٍ', action: 'توفير حاويات احتواء ثانوية وعربات نقل مخصصة للمواد الكيميائية' },
  { categoryId: 'structural', severity: 4, title: 'تشوه في دعامة شدّات مؤقتة قبل الصب', description: 'لاحظ مشرف النجارة انبعاج دعامة معدنية في منظومة الشدات في {zone} قبل ساعة من الصب المجدول. أُوقف الصب وأُعيد تدعيم المنطقة.', location: '{zone}', immediateCause: 'تحميل مواد على الشدات فوق الحد المصمم', rootCause: 'تصميم غير آمن', action: 'تفتيش مهندس الشدات قبل كل صب ولوحات تحديد حدود التحميل على المنصات' },
  { categoryId: 'ergonomic', severity: 2, title: 'انزلاق لوح ثقيل أثناء المناولة اليدوية', description: 'انزلق لوح جبس بوزن {weightKg} كجم من أيدي عاملين في {zone} وسقط على بعد سنتيمترات من قدم أحدهما. لم تُستخدم عربة النقل المتوفرة.', location: '{zone}', immediateCause: 'مناولة يدوية لحمل ثقيل في ممر ضيق', rootCause: 'ضغط الجدول الزمني', action: 'تخطيط مسارات نقل المواد واستخدام العربات والرافعات اليدوية للأحمال فوق 25 كجم' },
];

function nearMissStep(now = Date.now()) {
  if (!E.store || typeof E.store.addIncident !== 'function') return null;
  if (feedPaused()) return null; // the store would emit a feed event; defer until the feed resumes
  const site = weightedPick(sites(), (s) => Math.max(50, num(s.workers, 200)));
  if (!site) return null;
  const zone = pick(zonesOf(site));
  const scenario = pick(NEAR_MISS_SCENARIOS);
  // Record content keeps Latin digits like the seed (the UI formats numbers at render time).
  const ctx = {
    zone: zone ? zone.name : site.name,
    site: site.name,
    floor: String(randInt(3, 24)),
    weight: String(round(randBetween(2.5, 7.5), 1)),
    weightKg: String(randInt(28, 45)),
    n: String(randInt(3, 9)),
    wbgt: String(round(randBetween(30, 33), 1)),
  };
  const reporter = pick(['مشرف المنطقة', 'منظم الحركة', 'مراقب السلامة', 'مشرف الوردية']) + ' — ' + workerName(site.id);
  const owner = site.hseLead || site.manager || 'مسؤول السلامة';
  const dueMs = now + randInt(3, 14) * 24 * HOUR;
  const due = `${new Date(dueMs).getFullYear()}-${pad2(new Date(dueMs).getMonth() + 1)}-${pad2(new Date(dueMs).getDate())}`;
  let incident = null;
  try {
    incident = E.store.addIncident({
      siteId: site.id,
      zoneId: zone ? zone.id : undefined,
      type: NEAR_MISS_TYPE,
      severity: scenario.severity,
      title: fill(scenario.title, ctx),
      description: fill(scenario.description, ctx),
      location: fill(scenario.location, ctx),
      bodyPart: null,
      immediateCause: fill(scenario.immediateCause, ctx),
      rootCause: scenario.rootCause,
      status: 'مفتوح',
      daysLost: 0,
      reporter,
      categoryId: scenario.categoryId,
      investigationStep: 0,
      actions: [{ text: fill(scenario.action, ctx), owner, due, done: false }],
      source: 'بلاغ ميداني — المحاكاة الحية',
      simulated: true,
    });
  } catch (err) {
    warn('addIncident', err);
  }
  if (incident) {
    pruneSimulated('incidents');
    addTransient({
      id: `det-${incident.id}-${now.toString(36)}`,
      code: incident.code,
      label: incident.title,
      categoryId: scenario.categoryId,
      tone: scenario.severity >= 4 ? 'serious' : 'warning',
      r: randBetween(0.42, 0.62),
      siteId: site.id,
    }, now);
  }
  return incident;
}

/* ────────────────────────────── site-plan agents (pings) ────────────────────────────── */

const YARD_RE = /ساحة|طريق|بوابة|مناورة|تخزين|نقل|شحن|معسكر/;
const CRANE_RE = /رافعة|برج|هيكل|حقل|مستودع|حفر|مبنى|نواة/;
const OFFICE_RE = /مكاتب|بوابة|معسكر/;

function zoneArea(z) { return Math.max(0.0001, num(z.w, 0) * num(z.h, 0)); }

function randomPointIn(z, margin = 0.03) {
  const mx = Math.min(margin, num(z.w, 0) / 3);
  const my = Math.min(margin, num(z.h, 0) / 3);
  return {
    x: clamp(num(z.x, 0) + mx + rand() * Math.max(0, num(z.w, 0) - 2 * mx), 0, 1),
    y: clamp(num(z.y, 0) + my + rand() * Math.max(0, num(z.h, 0) - 2 * my), 0, 1),
  };
}

/** Point + heading along a rectangle perimeter (clockwise), inset slightly inside the edge. */
function perimeterPoint(z, p, dir) {
  const inset = 0.015;
  const x0 = num(z.x, 0) + inset; const y0 = num(z.y, 0) + inset;
  const w = Math.max(0.02, num(z.w, 0) - 2 * inset); const hgt = Math.max(0.02, num(z.h, 0) - 2 * inset);
  const per = 2 * (w + hgt);
  let s = ((p % per) + per) % per;
  let x; let y; let heading;
  if (s < w) { x = x0 + s; y = y0; heading = 0; }
  else if (s < w + hgt) { s -= w; x = x0 + w; y = y0 + s; heading = Math.PI / 2; }
  else if (s < 2 * w + hgt) { s -= w + hgt; x = x0 + w - s; y = y0 + hgt; heading = Math.PI; }
  else { s -= 2 * w + hgt; x = x0; y = y0 + hgt - s; heading = -Math.PI / 2; }
  if (dir < 0) heading += Math.PI;
  return { x: clamp(x, 0, 1), y: clamp(y, 0, 1), angle: heading, per };
}

function buildAgents(site) {
  const zones = zonesOf(site);
  const agents = [];
  const workerCount = clamp(Math.round(num(site.workers, 240) / 40), 6, 36);
  const workZones = zones.filter((z) => !OFFICE_RE.test(String(z.name)));
  const yardZones = zones.filter((z) => YARD_RE.test(String(z.name)));
  const craneZones = zones.filter((z) => CRANE_RE.test(String(z.name)) && !OFFICE_RE.test(String(z.name)));
  for (let i = 0; i < workerCount; i += 1) {
    const zone = weightedPick(workZones.length ? workZones : zones, (z) => zoneArea(z) * (OFFICE_RE.test(String(z.name)) ? 0.3 : 1));
    const pos = randomPointIn(zone);
    const target = randomPointIn(zone);
    agents.push({ id: `${site.id}-W${i + 1}`, kind: 'worker', zone, x: pos.x, y: pos.y, tx: target.x, ty: target.y, speed: randBetween(0.014, 0.034), idleUntil: 0, angle: 0, vx: 0, vy: 0 });
  }
  const vehicleCount = randInt(3, 5);
  for (let i = 0; i < vehicleCount; i += 1) {
    const zone = pick(yardZones.length ? yardZones : zones);
    const start = perimeterPoint(zone, 0, 1);
    agents.push({ id: `${site.id}-V${i + 1}`, kind: 'vehicle', zone, p: rand() * start.per, dir: chance(0.5) ? 1 : -1, speed: randBetween(0.05, 0.09), x: start.x, y: start.y, angle: 0, vx: 0, vy: 0, pauseUntil: 0 });
  }
  const craneCount = randInt(1, 2);
  for (let i = 0; i < craneCount; i += 1) {
    const zone = pick(craneZones.length ? craneZones : zones.slice().sort((a, b) => zoneArea(b) - zoneArea(a)).slice(0, 2));
    const cx = num(zone.x, 0) + num(zone.w, 1) * randBetween(0.35, 0.65);
    const cy = num(zone.y, 0) + num(zone.h, 1) * randBetween(0.35, 0.65);
    agents.push({ id: `${site.id}-C${i + 1}`, kind: 'crane', zone, x: clamp(cx, 0, 1), y: clamp(cy, 0, 1), angle: rand() * Math.PI * 2, spin: randBetween(0.12, 0.28) * (chance(0.5) ? 1 : -1), vx: 0, vy: 0, turnAt: 0 });
  }
  return agents;
}

function advanceAgents(entry, now, zones) {
  const dt = clamp((now - entry.lastAt) / SECOND, 0, TIMING.pingMaxStep / SECOND);
  entry.lastAt = now;
  if (dt <= 0) return;
  for (const a of entry.agents) {
    if (a.kind === 'worker') {
      if (now < a.idleUntil) { a.vx = 0; a.vy = 0; continue; }
      const dx = a.tx - a.x; const dy = a.ty - a.y;
      const dist = Math.hypot(dx, dy);
      if (dist < 0.006) {
        a.idleUntil = now + randBetween(0, 4) * SECOND;
        if (chance(0.08) && zones.length > 1) a.zone = pick(zones.filter((z) => z !== a.zone)) || a.zone;
        const t = randomPointIn(a.zone);
        a.tx = t.x; a.ty = t.y;
        a.vx = 0; a.vy = 0;
        continue;
      }
      const step = Math.min(dist, a.speed * dt);
      a.vx = (dx / dist) * a.speed; a.vy = (dy / dist) * a.speed;
      a.x = clamp(a.x + (dx / dist) * step, 0, 1);
      a.y = clamp(a.y + (dy / dist) * step, 0, 1);
      a.angle = Math.atan2(dy, dx);
    } else if (a.kind === 'vehicle') {
      if (now < a.pauseUntil) { a.vx = 0; a.vy = 0; continue; }
      if (chance(0.004)) { a.pauseUntil = now + randBetween(2, 6) * SECOND; continue; }
      if (chance(0.002)) a.dir = -a.dir;
      a.p += a.dir * a.speed * dt;
      const pt = perimeterPoint(a.zone, a.p, a.dir);
      a.vx = (pt.x - a.x) / Math.max(dt, 0.001); a.vy = (pt.y - a.y) / Math.max(dt, 0.001);
      a.x = pt.x; a.y = pt.y; a.angle = pt.angle;
    } else if (a.kind === 'crane') {
      if (now >= a.turnAt) { a.spin = randBetween(0.1, 0.3) * (chance(0.5) ? 1 : -1); a.turnAt = now + randBetween(6, 16) * SECOND; }
      a.angle = (a.angle + a.spin * dt) % (Math.PI * 2);
      a.vx = 0; a.vy = 0;
    }
  }
}

/* ────────────────────────────── public getters ────────────────────────────── */

function getBlips() {
  if (!E.store) return [];
  const now = Date.now();
  pruneTransients(now);
  let base = [];
  try { base = arr(sel.radarBlips(state(), E.store.filters || state().filters)); } catch (err) { warn('radarBlips', err); }
  const filters = E.store.filters || state().filters || {};
  const siteFilter = filters.siteId && filters.siteId !== 'all' ? filters.siteId : null;
  const transients = E.transients
    .filter((t) => !siteFilter || t.siteId === siteFilter)
    .map((t) => ({ ...t, age: clamp((now - t.bornAt) / TIMING.transientBlipTtl, 0, 1) }));
  return base.concat(transients);
}

function getPings(siteId) {
  if (!E.store) return [];
  const site = resolveSite(siteId);
  if (!site) return [];
  const now = Date.now();
  let entry = E.pings.get(site.id);
  if (!entry) {
    entry = { agents: buildAgents(site), lastAt: now };
    E.pings.set(site.id, entry);
  }
  advanceAgents(entry, now, zonesOf(site));
  return entry.agents.map((a) => ({
    id: a.id,
    x: round(a.x, 4),
    y: round(a.y, 4),
    kind: a.kind,
    angle: round(a.angle, 3),
    vx: round(a.vx, 4),
    vy: round(a.vy, 4),
    zoneId: a.zone ? a.zone.id : null,
  }));
}

function getSensorValues(siteId) {
  if (!E.store) return [];
  syncSensorModels();
  const now = Date.now();
  return safeSensorAxes(siteId).map((axis) => {
    const m = E.sensors.get(axis.id);
    if (!m) return num(axis.value, 0);
    return round(displayValueOf(m, now), 3);
  });
}

function getHazards(siteId) {
  if (!E.store) return [];
  const site = resolveSite(siteId);
  if (!site) return [];
  const zones = zonesOf(site);
  const placeIn = (zone, key) => {
    const u = 0.15 + 0.7 * unitHash(key, 1);
    const v = 0.15 + 0.7 * unitHash(key, 2);
    return { x: round(clamp(num(zone.x, 0) + num(zone.w, 1) * u, 0, 1), 4), y: round(clamp(num(zone.y, 0) + num(zone.h, 1) * v, 0, 1), 4) };
  };
  const zoneFor = (zoneId, key) => zones.find((z) => z.id === zoneId) || zones[hash32(key) % zones.length];
  const out = [];
  for (const r of arr(state().risks)) {
    if (!r || r.siteId !== site.id || r.status === RISK_CLOSED) continue;
    let tier; let tone;
    try { tier = sel.riskTier(sel.riskScore(r)); tone = sel.tierTone(tier); } catch { continue; }
    if (!HIGH_TIERS.has(tier)) continue;
    const zone = zoneFor(r.zoneId, r.id);
    out.push({ id: r.id, code: r.code, ...placeIn(zone, r.id), tone, tier, label: `${r.code} — ${r.hazard || r.activity || ''}`, zoneId: zone.id, kind: 'risk' });
  }
  for (const m of E.sensors.values()) {
    if (m.siteId !== site.id || !m.over) continue;
    const zone = zoneFor(m.zoneId, m.id);
    out.push({ id: `sensor-${m.id}`, code: m.id, ...placeIn(zone, m.id), tone: 'critical', tier: 'حرج', label: `${m.kind}: ${n1(m.value)} ${m.unit}`, zoneId: zone.id, kind: 'sensor' });
  }
  out.sort((a, b) => (a.tone === 'critical' ? 0 : 1) - (b.tone === 'critical' ? 0 : 1));
  return out.slice(0, 16);
}

/* ────────────────────────────── simulated-record caps ────────────────────────────── */

const parseMs = (v) => { const t = Date.parse(v || ''); return Number.isFinite(t) ? t : 0; };
const isSimulated = (r) => Boolean(r && r.simulated === true);
/** A simulated incident nobody has worked on (no investigation progress, no closed actions, never patched). */
function untouchedIncident(i) {
  if (num(i.investigationStep, 0) > 0) return false;
  if (arr(i.actions).some((a) => a && a.done)) return false;
  return !i.updatedAt || !i.createdAt || i.updatedAt === i.createdAt;
}

/**
 * Drop the oldest engine-generated records once a cap is exceeded (SIM_CAPS). Only records
 * tagged `simulated: true` are ever considered: seed and user-created records are never pruned.
 * Permits: simulated closed permits beyond the cap (oldest expiry first).
 * Incidents: simulated closed incidents first, then untouched open ones, oldest first.
 * Returns { permits, incidents } removed counts.
 */
function pruneSimulated(which = 'all') {
  const removed = { permits: 0, incidents: 0 };
  if (!E.store || typeof E.store.update !== 'function') return removed;
  const dropFrom = (collection, ids) => {
    if (!ids.size) return;
    E.store.update((s) => {
      const list = Array.isArray(s[collection]) ? s[collection] : [];
      for (let i = list.length - 1; i >= 0; i -= 1) if (list[i] && ids.has(list[i].id)) list.splice(i, 1);
      return collection;
    });
  };
  try {
    if (which === 'all' || which === 'permits') {
      const closed = arr(state().permits)
        .filter((p) => isSimulated(p) && p.status === PERMIT_CLOSED)
        .sort((a, b) => parseMs(a.closedAt || a.expiresAt) - parseMs(b.closedAt || b.expiresAt));
      const excess = closed.length - SIM_CAPS.closedPermits;
      if (excess > 0) {
        const ids = new Set(closed.slice(0, excess).map((p) => p.id));
        dropFrom('permits', ids);
        removed.permits = ids.size;
      }
    }
    if (which === 'all' || which === 'incidents') {
      const sim = arr(state().incidents).filter(isSimulated).sort((a, b) => parseMs(a.createdAt || a.date) - parseMs(b.createdAt || b.date));
      let excess = sim.length - SIM_CAPS.incidents;
      if (excess > 0) {
        const ids = new Set();
        for (const i of sim) { if (excess <= 0) break; if (i.status === 'مغلق') { ids.add(i.id); excess -= 1; } }
        for (const i of sim) { if (excess <= 0) break; if (!ids.has(i.id) && untouchedIncident(i)) { ids.add(i.id); excess -= 1; } }
        dropFrom('incidents', ids);
        removed.incidents = ids.size;
      }
    }
  } catch (err) {
    warn('pruneSimulated', err);
  }
  return removed;
}

/* ────────────────────────────── lifecycle ────────────────────────────── */

function start({ store, bus } = {}) {
  if (!store || typeof store !== 'object') return false;
  if (E.started && E.store === store) {
    if (E.paused) resume();
    return true;
  }
  if (E.started) stop();
  rng = mulberry32(LIVE_SEED);
  E.store = store;
  E.bus = bus || store.bus || null;
  E.started = true;
  E.paused = false;
  E.hidden = false;
  E.startedAt = Date.now();
  E.lastSensorTick = E.startedAt;
  E.feedCounter = 0;
  E.transients = [];
  E.permitWarned.clear();
  E.pendingReplacements = [];
  E.nextExpiryAt = 0;
  E.integrations.clear();
  E.sensors.clear();
  E.pings.clear();
  E.nextDegradeAt = 0;
  templateCache = { key: null, byType: null };
  syncSensorModels();
  for (const g of arr(state().integrations)) if (g && g.id) integrationModel(g, E.startedAt);
  pruneSimulated('all'); // a long-lived saved state may carry more simulated records than the caps allow
  attachVisibility();
  armAll({ fresh: true });
  return true;
}

function stop() {
  clearAllTasks();
  detachVisibility();
  E.started = false;
  E.paused = false;
  E.hidden = false;
  E.pendingReplacements = [];
  E.transients = [];
  return true;
}

function pause() {
  if (!E.started || E.paused) return false;
  E.paused = true;
  clearAllTasks();
  return true;
}

function resume() {
  if (!E.started || !E.paused) return false;
  E.paused = false;
  resyncClocks(Date.now());
  armAll({ fresh: false });
  return true;
}

function isRunning() {
  return E.started && !E.paused && !E.hidden;
}

/** One full simulation step (sensors, permits, integrations, one feed event). */
function tick() {
  if (!E.store) return null;
  const now = Date.now();
  let event = null;
  try { sensorStep(now); } catch (err) { warn('tick:sensors', err); }
  try { permitStep(now); } catch (err) { warn('tick:permits', err); }
  try { integrationStep(now); } catch (err) { warn('tick:integrations', err); }
  try { event = feedPaused() ? null : emitRandomFeed(); } catch (err) { warn('tick:feed', err); }
  return event;
}

export const live = {
  start,
  stop,
  pause,
  resume,
  isRunning,
  tick,
  getBlips,
  getPings,
  getSensorValues,
  getHazards,
  // extras (not in the contract; harmless for consumers that want them)
  isPaused: () => E.paused,
  getSensors: () => Array.from(E.sensors.values()).map(sensorSnapshot),
  /** Add one simulated near-miss right now (QA / demo button). Returns the incident or null. */
  triggerNearMiss: () => nearMissStep(Date.now()),
  /** Force an excursion now; `direction` 'low' picks a deficiency dip when the sensor has a lowThreshold. */
  triggerExcursion: (sensorId, direction) => {
    syncSensorModels();
    const m = sensorId ? E.sensors.get(sensorId) : null;
    if (m) { m.excursion = null; }
    if (m) {
      const now = Date.now();
      const low = direction === 'low' ? hasLowRoom(m) : (direction === 'high' ? false : hasLowRoom(m) && !hasHighRoom(m));
      m.excursion = { startedAt: now, endsAt: now + TIMING.excursionMin, peak: excursionPeak(m, low), alerted: false, low };
      return m.id;
    }
    return startExcursion(Date.now());
  },
  /** Prune simulated records beyond SIM_CAPS ('permits' | 'incidents' | 'all'); returns removed counts. */
  pruneSimulated,
  SIM_CAPS,
  TIMING,
};

export default live;
