/**
 * Biltix Risk AI — قمرة قيادة المخاطر (js/views/cockpit.js)
 *
 * View contract (ARCHITECTURE.md §8, B9.1): `default { id, code, title, icon, render }`.
 *
 *   Row 1  hero card — consolidated score gauge (tone from rating: higher = worse),
 *          delta vs previous period, 12-week trend sparkline, weights legend (→ settings)
 *          + five category tiles (.cat-tile: contract / bom / schedule / site / cost) → domain views.
 *   Row 2  flow strip (ol.flow, B8) — eight stages with live counters; the packet travels the
 *          stage line (CSS keyframes, `--flow-travel` measured here) while the current stage
 *          class advances every 2.4 s; static under reduced motion.
 *   Row 3  ranked open red risks (row click → #/airisks?risk=ID), alert queue with
 *          acknowledge buttons, pipeline health strip (.pipe-strip), data-quality mini card,
 *          type / rating distribution segmented bars.
 *   Row 4  projects table (consolidated project score, CPI/SPI, progress vs plan,
 *          red count, next milestone); row click focuses the project filter.
 *
 * Data reaches the DOM only through textContent (components.h). Every contract call into
 * psel / charts is guarded: a missing or throwing module degrades to a local fallback that
 * mirrors the B2 rules instead of breaking the cockpit (psel stays the single definition
 * whenever it is present; when ctx lacks it the module is imported lazily). Re-renders on
 * store:change (except the feed), filters:change and settings:change; the cleanup
 * unsubscribes, clears timers and disconnects observers.
 */

import { components, reducedMotion } from '../ui/components.js';
import { fmt as defaultFmt } from '../core/fmt.js';
import { store as defaultStore } from '../core/store.js';
import { bus as defaultBus } from '../core/bus.js';

const { h, clear, glyph, svgIcon, card, badge, button, dataTable, emptyState, progress, kv, liveDot, toast } = components;

const USER = 'م. فيصل الحربي';
const FLOW_INTERVAL_MS = 2400;

const CATEGORY_ORDER = ['contract', 'bom', 'schedule', 'site', 'cost'];
const CATEGORY_META = {
  contract: { label: 'العقود', icon: 'file-text', view: 'contracts' },
  bom: { label: 'المواد والتوريد', icon: 'list', view: 'bom' },
  schedule: { label: 'الجدول الزمني', icon: 'calendar', view: 'schedule' },
  site: { label: 'الموقع والسلامة', icon: 'helmet', view: 'overview' },
  cost: { label: 'التكلفة', icon: 'chart', view: 'cost' },
};
const TYPE_ORDER = ['Financial', 'Safety', 'Delay', 'Conflict'];
const TYPE_META = {
  Financial: { label: 'مالي', icon: 'chart' },
  Safety: { label: 'سلامة', icon: 'helmet' },
  Delay: { label: 'تأخير', icon: 'clock' },
  Conflict: { label: 'نزاع', icon: 'file-text' },
};
const RATING_ORDER = ['red', 'yellow', 'green'];
const RATING_META = {
  red: { label: 'أحمر', tone: 'critical' },
  yellow: { label: 'أصفر', tone: 'warning' },
  green: { label: 'أخضر', tone: 'good' },
};
const OPEN_RISK_STATUSES = new Set(['مكتشف', 'تنبيه', 'مهمة مُسندة', 'قيد المعالجة']);
const PIPELINE_STATUS = {
  running: { label: 'يعمل', tone: 'good' },
  idle: { label: 'خامل', tone: 'neutral' },
  training: { label: 'قيد التدريب', tone: 'accent' },
  degraded: { label: 'متدهور', tone: 'warning' },
};
const EVM_TONE = { 'ضمن الميزانية': 'good', 'تحذير': 'warning', 'تجاوز': 'critical' };
const CHANNEL_LABEL = { email: 'البريد', slack: 'Slack', teams: 'Teams', whatsapp: 'واتساب' };
const CHANNEL_ICON = { email: 'mail', slack: 'send', teams: 'teams', whatsapp: 'whatsapp' };

/** The eight stages of the proposal's end-to-end flow (B4 riskFlowStage order). */
const FLOW_STAGES = [
  { id: 'ingest', label: 'مُلتقط', icon: 'download' },
  { id: 'validate', label: 'مُتحقق', icon: 'badge-check', gate: true },
  { id: 'lake', label: 'في بحيرة البيانات', icon: 'layers' },
  { id: 'score', label: 'مُقيَّم', icon: 'sliders' },
  { id: 'classify', label: 'مُصنَّف', icon: 'shield-alert' },
  { id: 'alert', label: 'تنبيه', icon: 'bell' },
  { id: 'task', label: 'مهمة', icon: 'file-check' },
  { id: 'closed', label: 'مغلق', icon: 'check-circle' },
];

/* ------------------------------------------------------------------ */
/* Guards & helpers                                                     */
/* ------------------------------------------------------------------ */

const warned = new Set();
function warnOnce(key, err) {
  if (warned.has(key)) return;
  warned.add(key);
  console.warn(`[cockpit] ${key} غير متاح — استخدام بديل محلي:`, err && err.message ? err.message : err);
}
function safe(key, fn, fallback) {
  try {
    const v = fn();
    return v === undefined || v === null ? fallback : v;
  } catch (err) {
    warnOnce(key, err);
    return fallback;
  }
}
/** Call a psel function when psel is present, else use the local fallback silently. */
function viaPsel(psel, key, fn, fallback) {
  return psel ? safe(`psel.${key}`, fn, fallback) : fallback;
}
let pselLoad = null;
function loadPsel() {
  if (!pselLoad) pselLoad = import('../core/platform-selectors.js').then((m) => (m && (m.psel || m.default)) || null).catch(() => null);
  return pselLoad;
}
const isNum = (n) => typeof n === 'number' && Number.isFinite(n);
const num = (n, d = 0) => (isNum(n) ? n : d);

function startOfDay(date) { const x = new Date(date); x.setHours(0, 0, 0, 0); return x.getTime(); }
function isOverdue(iso, now) { const d = defaultFmt.toDate(iso); return !!d && d.getTime() < startOfDay(now); }
const isOpenRisk = (r) => r && OPEN_RISK_STATUSES.has(r.status);

/* ---- labels through psel with local fallbacks (B2 single definition lives in psel) ---- */

const localRating = (score) => (score >= 70 ? 'red' : score >= 40 ? 'yellow' : 'green');
function ratingOf(psel, score) { return viaPsel(psel, 'rating', () => psel.rating(score), localRating(score)); }
function ratingTone(psel, rating) { return viaPsel(psel, 'ratingTone', () => psel.ratingTone(rating), (RATING_META[rating] || RATING_META.green).tone); }
function ratingLabel(psel, rating) { return viaPsel(psel, 'ratingLabel', () => psel.ratingLabel(rating), (RATING_META[rating] || RATING_META.green).label); }
function ratingBadge(psel, rating, { sm = false } = {}) {
  return h('span', { class: ['rating', `is-${rating}`, sm ? 'is-sm' : null], 'data-rating': rating }, glyph(ratingTone(psel, rating), 12), h('span', {}, ratingLabel(psel, rating)));
}
function typeLabel(psel, type) { return viaPsel(psel, 'typeLabel', () => psel.typeLabel(type), (TYPE_META[type] || {}).label || String(type || '—')); }
function typeChip(psel, type) {
  const meta = TYPE_META[type] || { icon: 'alert-circle' };
  return h('span', { class: ['type-chip', `is-${String(type || 'unknown').toLowerCase()}`], 'data-type': type || '' }, svgIcon(meta.icon, 12), h('span', {}, typeLabel(psel, type)));
}
function categoryLabel(psel, cat) { return viaPsel(psel, 'categoryLabel', () => psel.categoryLabel(cat), (CATEGORY_META[cat] || {}).label || String(cat || '—')); }
function categoryIcon(psel, cat) { return viaPsel(psel, 'categoryIcon', () => psel.categoryIcon(cat), (CATEGORY_META[cat] || {}).icon || 'layers'); }
function categoryChip(psel, cat) { return h('span', { class: 'cat-chip', 'data-category': cat || '' }, svgIcon(categoryIcon(psel, cat), 13), h('span', {}, categoryLabel(psel, cat))); }
function pipelineLabel(psel, id) { return viaPsel(psel, 'pipelineLabel', () => psel.pipelineLabel(id), String(id || '—')); }

function viewHead({ code, title, lead, actions = [] }) {
  const text = h('div', { class: 'view-head-text' }, h('span', { class: 'code-tag' }, code), h('h1', {}, title), lead ? h('p', { class: 'view-lead' }, lead) : null);
  return h('div', { class: 'view-head' }, text, actions.length ? h('div', { class: 'view-actions' }, actions) : null);
}

/* ------------------------------------------------------------------ */
/* View                                                                 */
/* ------------------------------------------------------------------ */

export default {
  id: 'cockpit',
  code: 'CPT-00',
  title: 'قمرة قيادة المخاطر',
  icon: 'radar',

  render(container, ctx = {}) {
    const store = ctx.store || defaultStore;
    const bus = ctx.bus || defaultBus;
    const fmt = ctx.fmt || defaultFmt;
    const router = ctx.router;
    const charts = ctx.charts;
    let psel = ctx.psel || null;

    let alive = true;
    let raf = 0;
    const subs = [];
    let flowStage = 0;
    let flowTimer = null;
    let flowEl = null;
    let flowObserver = null;

    const navigate = (id, params = {}) => { if (router && typeof router.navigate === 'function') router.navigate(id, params); };
    const nowDate = () => (typeof store.now === 'function' ? store.now() : new Date());
    const stateOf = () => store.state || store.get();
    const settings = () => (stateOf().settings || {});
    const isReduced = () => reducedMotion() || settings().reducedMotion === true || settings().motion === 'reduce';
    const scoreNum = (score, rating) => h('span', { class: ['score-num', 'num', `is-${rating}`], 'data-rating': rating }, fmt.num(Math.round(num(score))));

    if (!psel) loadPsel().then((p) => { if (p && alive && !psel) { psel = p; schedule(); } });

    const root = h('section', { class: 'view view-cockpit' });
    root.appendChild(viewHead({
      code: 'CPT-00',
      title: 'قمرة قيادة المخاطر',
      lead: 'رؤية موحدة لمخاطر المحفظة عبر خمسة مجالات — العقود، المواد والتوريد، الجدول الزمني، الموقع والسلامة، والتكلفة — مع تصنيف فوري بالذكاء الاصطناعي ومعالجة مُتتبعة حتى الإغلاق.',
      actions: [
        button('سجل المخاطر الذكي', { variant: 'outline', size: 'sm', icon: 'shield-alert', onClick: () => navigate('airisks') }),
        button('التنبيهات والتصعيد', { variant: 'ghost', size: 'sm', icon: 'bell', onClick: () => navigate('alerts') }),
      ],
    }));
    const body = h('div', { class: 'stack gap-4 cockpit-body' });
    root.appendChild(body);
    container.appendChild(root);

    /* ---------------------------------------------------------------- */
    /* chart helpers (contract API through ctx.charts with DOM fallbacks) */
    /* ---------------------------------------------------------------- */

    function chartOr(key, make, fallback) {
      if (charts && typeof charts[key] === 'function') {
        try {
          const c = make();
          if (c && (c instanceof Node || (c.el instanceof Node))) return c;
        } catch (err) { warnOnce(`charts.${key}`, err); }
      } else warnOnce(`charts.${key}`, new Error('الدالة غير موجودة'));
      return typeof fallback === 'function' ? fallback() : null;
    }
    const tableViewOf = (chart) => (chart && typeof chart.table === 'function' ? () => chart.table() : null);

    /**
     * charts.gauge colours itself with Safety-Index semantics (higher = better). The consolidated
     * risk score is the inverse (higher = worse), so recolour the arc/track from the rating tone
     * and hide the gauge's own tone chip — the rating badge beside the gauge carries icon + label.
     */
    function invertGaugeTone(gauge, tone, ariaLabel) {
      const el = gauge && gauge.el instanceof Node ? gauge.el : gauge;
      if (!(el instanceof Element)) return;
      try {
        const color = `var(--${tone})`;
        const arc = el.querySelector('.gauge-arc'); const track = el.querySelector('.gauge-track'); const chip = el.querySelector('.gauge-chip'); const svg = el.querySelector('svg');
        if (arc) arc.style.stroke = color;
        if (track) track.style.stroke = `color-mix(in srgb, ${color} 22%, var(--bg-2))`;
        if (chip) chip.style.display = 'none';
        if (svg) svg.setAttribute('aria-label', ariaLabel);
      } catch (err) { warnOnce('gauge.invert', err); }
    }

    function fallbackGauge(score, rating, label) {
      return h('div', { class: 'stack gap-1 gauge-fallback', style: { alignItems: 'center' } },
        scoreNum(score, rating), h('span', { class: 'muted text-xs' }, label), progress({ value: score, max: 100, tone: ratingTone(psel, rating), label }));
    }
    function fallbackSegments(parts, valueFormat = fmt.num) {
      const total = parts.reduce((s, p) => s + num(p.value), 0) || 1;
      return h('div', { class: 'stack gap-2 segbar-fallback' }, parts.map((p) => h('div', { class: 'progress-row row gap-2' },
        h('span', { class: 'text-sm grow' }, p.label),
        progress({ value: (num(p.value) / total) * 100, max: 100, tone: p.tone || null, label: p.label }),
        h('span', { class: 'mono num text-xs' }, valueFormat(num(p.value))))));
    }
    function fallbackMeter(value, label, tone) {
      return h('div', { class: 'stack gap-1 meter-fallback' },
        h('div', { class: 'row between' }, h('span', { class: 'text-sm' }, label), h('span', { class: 'mono num semibold' }, fmt.pct(value))),
        progress({ value, max: 100, tone, label }));
    }

    /* ---------------------------------------------------------------- */
    /* data                                                               */
    /* ---------------------------------------------------------------- */

    function collect() {
      const state = stateOf();
      const platform = state.platform;
      const filters = store.filters || state.filters || { siteId: 'all', range: 30, search: '' };
      const now = nowDate();
      const siteId = filters.siteId || 'all';
      const inSite = (pid) => siteId === 'all' || !siteId || pid === siteId;
      const sites = state.sites || [];
      const projectName = (id) => { const s = sites.find((x) => x.id === id); return s ? s.name : String(id || '—'); };

      const allRisks = viaPsel(psel, 'filteredAiRisks', () => psel.filteredAiRisks(state, filters), null) || (platform.aiRisks || []).filter((r) => inSite(r.projectId));
      const openRisks = viaPsel(psel, 'openAiRisks', () => psel.openAiRisks(state, filters), null) || allRisks.filter(isOpenRisk);
      const open = openRisks.map((r) => ({ ...r, rating: ratingOf(psel, num(r.score)) }));
      const red = open.filter((r) => r.rating === 'red').sort((a, b) => num(b.score) - num(a.score));
      const yellow = open.filter((r) => r.rating === 'yellow').length;
      const green = open.filter((r) => r.rating === 'green').length;
      const closedRisks = allRisks.filter((r) => r.status === 'مغلق').length;

      const consolidated = viaPsel(psel, 'consolidatedScore', () => psel.consolidatedScore(state, filters), null) || (() => {
        const weights = (settings().platform || {}).weights || { contract: 0.2, bom: 0.2, schedule: 0.25, site: 0.2, cost: 0.15 };
        const catScore = (category) => { const s = open.filter((r) => r.category === category).map((r) => num(r.score)); return s.length ? Math.round(0.5 * Math.max(...s) + 0.5 * (s.reduce((a, b) => a + b, 0) / s.length)) : 0; };
        const score = Math.round(CATEGORY_ORDER.reduce((sum, c) => sum + num(weights[c]) * catScore(c), 0));
        return { score, rating: ratingOf(psel, score), delta: 0, trend: [], weights };
      })();
      if (!consolidated.rating) consolidated.rating = ratingOf(psel, num(consolidated.score));

      const categories = viaPsel(psel, 'categoryScores', () => psel.categoryScores(state, filters), null) || CATEGORY_ORDER.map((category) => {
        const items = open.filter((r) => r.category === category);
        const scores = items.map((r) => num(r.score));
        const score = scores.length ? Math.round(0.5 * Math.max(...scores) + 0.5 * (scores.reduce((s, v) => s + v, 0) / scores.length)) : 0;
        return { category, label: categoryLabel(psel, category), score, rating: ratingOf(psel, score), open: items.length,
          red: items.filter((r) => r.rating === 'red').length, yellow: items.filter((r) => r.rating === 'yellow').length, green: items.filter((r) => r.rating === 'green').length, trend: [] };
      });

      const validation = viaPsel(psel, 'validationSummary', () => psel.validationSummary(state), null) || (() => {
        const sources = (platform.validation && platform.validation.sources) || [];
        const sum = (k) => sources.reduce((s, x) => s + num(x[k]), 0);
        const recordsIn = sum('recordsIn'); const passed = sum('passed');
        return { recordsIn, passed, rejected: sum('rejected'), deduplicated: sum('deduplicated'), passRatePct: recordsIn ? Math.round((passed / recordsIn) * 100) : 0,
          completenessPct: sources.length ? Math.round(sum('completenessPct') / sources.length) : 0, consistencyPct: sources.length ? Math.round(sum('consistencyPct') / sources.length) : 0,
          quarantineOpen: ((platform.validation && platform.validation.quarantine) || []).filter((q) => q.status === 'معلّق').length, bySource: sources };
      })();

      const queue = viaPsel(psel, 'alertQueue', () => psel.alertQueue(state), null) || (() => {
        const list = (platform.alerts || []).slice().sort((a, b) => Number(!!a.acknowledged) - Number(!!b.acknowledged) || (Date.parse(b.sentAt) || 0) - (Date.parse(a.sentAt) || 0));
        return { immediate: list.filter((a) => a.queue === 'immediate'), standard: list.filter((a) => a.queue !== 'immediate') };
      })();
      const immediate = (queue.immediate || []).filter((a) => inSite(a.projectId));
      const standard = (queue.standard || []).filter((a) => inSite(a.projectId));
      const unacked = immediate.concat(standard).filter((a) => !a.acknowledged);

      const tasks = (platform.tasks || []).filter((t) => inSite(t.projectId));
      const openTasks = tasks.filter((t) => t.status !== 'مغلقة');
      const overdueTasks = openTasks.filter((t) => t.status === 'متأخرة' || isOverdue(t.dueDate, now));
      const closedTasks = tasks.length - openTasks.length;

      const pipelines = viaPsel(psel, 'pipelineHealth', () => psel.pipelineHealth(state), null) || (platform.pipelines || []);

      const typeDist = viaPsel(psel, 'typeDistribution', () => psel.typeDistribution(state, filters), null) || TYPE_ORDER.map((type) => ({ type, label: typeLabel(psel, type), value: open.filter((r) => r.type === type).length }));
      const ratingDist = viaPsel(psel, 'ratingDistribution', () => psel.ratingDistribution(state, filters), null) || RATING_ORDER.map((rating) => ({ rating, label: ratingLabel(psel, rating), value: open.filter((r) => r.rating === rating).length }));

      const today = startOfDay(now);
      const projects = (platform.projects || []).filter((p) => inSite(p.id)).map((p) => {
        const evm = viaPsel(psel, 'evm', () => psel.evm(state, p.id), null) || { ...(p.evm || {}), percentComplete: p.percentComplete, plannedPercent: p.plannedPercent, status: null };
        const cons = viaPsel(psel, 'consolidatedScore', () => psel.consolidatedScore(state, { ...filters, siteId: p.id }), null) || (() => {
          const weights = consolidated.weights || {};
          const mine = (platform.aiRisks || []).filter((r) => r.projectId === p.id && isOpenRisk(r));
          const catScore = (c) => { const s = mine.filter((r) => r.category === c).map((r) => num(r.score)); return s.length ? Math.round(0.5 * Math.max(...s) + 0.5 * (s.reduce((a, b) => a + b, 0) / s.length)) : 0; };
          const score = Math.round(CATEGORY_ORDER.reduce((sum, c) => sum + num(weights[c]) * catScore(c), 0));
          return { score, rating: ratingOf(psel, score) };
        })();
        if (!cons.rating) cons.rating = ratingOf(psel, num(cons.score));
        const redCount = (platform.aiRisks || []).filter((r) => r.projectId === p.id && isOpenRisk(r) && ratingOf(psel, num(r.score)) === 'red').length;
        const next = (platform.scheduleTasks || [])
          .filter((t) => t.projectId === p.id && t.critical && (Date.parse(t.finish) || 0) >= today)
          .sort((a, b) => Date.parse(a.finish) - Date.parse(b.finish))[0] || null;
        return { ...p, name: projectName(p.id), evm, cons, redCount, next };
      });

      return { state, platform, filters, now, projectName, allRisks, open, red, yellow, green, closedRisks, consolidated, categories, validation, immediate, standard, unacked, openTasks, overdueTasks, closedTasks, pipelines, typeDist, ratingDist, projects };
    }

    /* ---------------------------------------------------------------- */
    /* Row 1 — hero + category tiles                                      */
    /* ---------------------------------------------------------------- */

    function deltaChip(delta) {
      const n = Number(delta);
      if (!Number.isFinite(n)) return null;
      const up = n > 0; const zero = n === 0;
      const tone = zero ? 'neutral' : (up ? 'critical' : 'good'); // higher consolidated score = worse
      return h('span', { class: ['score-hero-delta', zero ? 'is-flat' : (up ? 'is-up' : 'is-down'), `tone-${tone}`], 'aria-label': `التغير مقارنة بالفترة السابقة: ${fmt.signed(n)}` },
        svgIcon(zero ? 'minus' : (up ? 'trend-up' : 'trend-down'), 14), h('span', { class: 'mono num' }, fmt.signed(n, Number.isInteger(n) ? 0 : 1)), h('span', { class: 'muted' }, 'مقارنة بالفترة السابقة'));
    }

    function heroCard(d) {
      const c = d.consolidated;
      const score = Math.round(num(c.score));
      const rating = c.rating || ratingOf(psel, score);
      const tone = ratingTone(psel, rating);
      const gauge = chartOr('gauge', () => charts.gauge({ value: score, max: 100, size: 196, label: 'الدرجة الموحدة من 100', sublabel: '' }), () => fallbackGauge(score, rating, 'الدرجة الموحدة'));
      invertGaugeTone(gauge, tone, `الدرجة الموحدة للمخاطر ${fmt.num(score)} من 100 — تصنيف ${ratingLabel(psel, rating)}`);
      const gaugeWrap = h('div', { class: ['score-hero-gauge', `tone-${tone}`], 'data-rating': rating }, gauge);
      const trend = Array.isArray(c.trend) ? c.trend.filter(isNum) : [];
      const spark = trend.length >= 2 ? chartOr('sparkline', () => charts.sparkline({ values: trend, width: 160, height: 34, color: 'var(--ink-3)', accentLast: true }), () => null) : null;
      const weights = c.weights && typeof c.weights === 'object' ? c.weights : {};

      const hero = h('div', { class: 'score-hero' },
        gaugeWrap,
        h('div', { class: 'row gap-2 wrap', style: { justifyContent: 'center' } }, ratingBadge(psel, rating), deltaChip(c.delta)),
        h('span', { class: 'score-hero-label' }, 'الدرجة الموحدة = Σ وزن المجال × درجة المجال · كلما ارتفعت ازداد الخطر'),
        spark ? h('div', { class: 'row gap-2 wrap', style: { justifyContent: 'center' } }, h('span', { class: 'tile-spark', 'aria-hidden': 'true' }, spark), h('span', { class: 'muted text-xs' }, 'اتجاه 12 أسبوعاً')) : null,
        h('div', { class: 'hero-facts', style: { inlineSize: '100%' } },
          h('div', { class: 'fact' }, h('span', { class: 'fact-label' }, 'مخاطر مفتوحة'), h('span', { class: 'fact-value num' }, fmt.num(d.open.length))),
          h('div', { class: 'fact' }, h('span', { class: 'fact-label' }, 'تصنيف أحمر'), h('span', { class: 'fact-value num' }, fmt.num(d.red.length))),
          h('div', { class: 'fact' }, h('span', { class: 'fact-label' }, 'تنبيهات بانتظار الإقرار'), h('span', { class: 'fact-value num' }, fmt.num(d.unacked.length)))),
        h('div', { class: 'weights-legend', role: 'group', 'aria-label': 'أوزان المجالات في الدرجة الموحدة — انقر للتعديل في الإعدادات' },
          CATEGORY_ORDER.filter((k) => weights[k] !== undefined).map((k) => h('button', { type: 'button', title: 'تعديل الأوزان في الإعدادات', onClick: () => navigate('settings') },
            h('span', {}, categoryLabel(psel, k)), ' ', h('span', { class: 'mono num' }, fmt.pct(num(weights[k]) * 100))))));

      return card({ code: 'CPT-00', title: 'الدرجة الموحدة للمخاطر', subtitle: 'أحمر ≥ 70 تدخل فوري · أصفر 40–69 مراقبة · أخضر < 40 ضمن حدود التحمل', hero: true, className: 'cockpit-hero col-span-4', body: hero });
    }

    function categoryTiles(d) {
      const grid = h('div', { class: 'cat-tiles', role: 'list', 'aria-label': 'درجات مجالات المخاطر الخمسة' });
      const byCat = new Map((d.categories || []).map((c) => [c.category, c]));
      CATEGORY_ORDER.forEach((category) => {
        const c = byCat.get(category) || { category, score: 0, rating: 'green', open: 0, red: 0, trend: [] };
        const score = Math.round(num(c.score));
        const rating = c.rating || ratingOf(psel, score);
        const meta = CATEGORY_META[category] || {};
        const trend = Array.isArray(c.trend) ? c.trend.filter(isNum) : [];
        const spark = trend.length >= 2 ? chartOr('sparkline', () => charts.sparkline({ values: trend, width: 96, height: 24, color: 'var(--ink-3)' }), () => null) : null;
        grid.appendChild(h('button', {
          type: 'button', class: 'cat-tile', 'data-rating': rating, 'data-category': category, role: 'listitem',
          'aria-label': `${categoryLabel(psel, category)}: الدرجة ${fmt.num(score)} — ${ratingLabel(psel, rating)} — ${fmt.num(num(c.open))} مخاطر مفتوحة منها ${fmt.num(num(c.red))} حمراء. فتح مجال ${categoryLabel(psel, category)}`,
          onClick: () => navigate(meta.view || 'cockpit'),
        },
        h('div', { class: 'cat-tile-head' }, h('span', { class: 'cat-tile-icon', 'aria-hidden': 'true' }, svgIcon(categoryIcon(psel, category), 16)), h('span', { class: 'cat-tile-label' }, c.label || categoryLabel(psel, category))),
        h('div', { class: 'cat-tile-score' }, scoreNum(score, rating), ratingBadge(psel, rating)),
        h('div', { class: 'cat-tile-meta' }, h('span', {}, 'مفتوحة ', h('strong', {}, fmt.num(num(c.open)))), h('span', {}, 'أحمر ', h('strong', {}, fmt.num(num(c.red))))),
        spark ? h('div', { class: 'cat-tile-spark', 'aria-hidden': 'true' }, spark) : null));
      });
      return grid;
    }

    /* ---------------------------------------------------------------- */
    /* Row 2 — flow strip                                                 */
    /* ---------------------------------------------------------------- */

    function flowCounters(d) {
      const v = d.validation;
      const immediateUnacked = d.immediate.filter((a) => !a.acknowledged).length;
      return [
        { value: fmt.compact(num(v.recordsIn)), sub: 'سجل وارد اليوم' },
        { value: fmt.pct(num(v.passRatePct)), sub: `رُفض ${fmt.num(num(v.rejected))} · مكرر ${fmt.num(num(v.deduplicated))}` },
        { value: fmt.compact(num(v.passed)), sub: 'سجل مُطبَّع ومُؤرشف' },
        { value: fmt.num(d.allRisks.length), sub: 'مخاطرة مُقيَّمة 0–100' },
        { value: fmt.num(d.open.length), sub: `أحمر ${fmt.num(d.red.length)} · أصفر ${fmt.num(d.yellow)} · أخضر ${fmt.num(d.green)}` },
        { value: fmt.num(d.unacked.length), sub: `فوري ${fmt.num(immediateUnacked)} · قياسي ${fmt.num(d.unacked.length - immediateUnacked)}`, alert: d.unacked.length > 0, critical: immediateUnacked > 0 },
        { value: fmt.num(d.openTasks.length), sub: `متأخرة ${fmt.num(d.overdueTasks.length)}` },
        { value: fmt.num(d.closedRisks), sub: `مهام مغلقة ${fmt.num(d.closedTasks)}` },
      ];
    }

    function buildFlow(d) {
      const reduced = isReduced();
      const counters = flowCounters(d);
      const flow = h('ol', { class: ['flow', reduced ? 'is-static' : 'is-live'], 'aria-label': 'مسار معالجة المخاطر — ثماني مراحل من الالتقاط حتى الإغلاق', 'data-stage': String(flowStage), style: { '--flow-stage': String(flowStage) } });
      FLOW_STAGES.forEach((stage, i) => {
        const counter = counters[i] || { value: '—', sub: '' };
        flow.appendChild(h('li', { class: ['flow-node', `is-${stage.id}`, stage.gate ? 'is-gate' : null, counter.critical ? 'is-critical' : (counter.alert ? 'is-alert' : null)], 'data-stage': String(i), title: stage.gate ? 'بوابة التحقق: لا يصل أي سجل إلى المحرك قبل اجتياز التحقق' : undefined },
          h('span', { class: 'flow-dot', 'aria-hidden': 'true' }, svgIcon(stage.icon, 12)),
          h('span', { class: 'flow-label' }, stage.label),
          h('span', { class: 'flow-count mono num' }, counter.value),
          counter.sub ? h('span', { class: 'flow-sub' }, counter.sub) : null));
      });
      if (!reduced) flow.appendChild(h('span', { class: 'flow-packet', 'aria-hidden': 'true' }));
      flowEl = flow;
      measureFlow();
      applyFlowStage();
      return flow;
    }

    /** The CSS packet travels `--flow-travel` (node 0 → node 7 = 87.5% of the strip); measure it here. */
    function measureFlow() {
      if (flowObserver) { flowObserver.disconnect(); flowObserver = null; }
      const setTravel = () => {
        if (!flowEl || !flowEl.isConnected) return;
        const w = flowEl.clientWidth;
        if (w > 0) flowEl.style.setProperty('--flow-travel', `${Math.max(0, Math.round(w * 0.875) - 8)}px`);
      };
      if (typeof ResizeObserver !== 'undefined') {
        flowObserver = new ResizeObserver(() => setTravel());
        flowObserver.observe(flowEl);
      }
      requestAnimationFrame(setTravel);
    }

    function applyFlowStage() {
      if (!flowEl || !flowEl.isConnected) return;
      flowEl.dataset.stage = String(flowStage);
      flowEl.style.setProperty('--flow-stage', String(flowStage));
      flowEl.querySelectorAll('.flow-node').forEach((node, i) => {
        node.classList.toggle('is-current', i === flowStage);
        node.classList.toggle('is-done', i < flowStage);
        if (i === flowStage) node.setAttribute('aria-current', 'step'); else node.removeAttribute('aria-current');
      });
    }
    function flowTick() {
      if (!alive) return;
      flowStage = (flowStage + 1) % FLOW_STAGES.length;
      applyFlowStage();
    }
    function startFlow() {
      stopFlow();
      if (isReduced() || document.hidden) return;
      flowTimer = setInterval(flowTick, FLOW_INTERVAL_MS);
    }
    function stopFlow() { if (flowTimer) { clearInterval(flowTimer); flowTimer = null; } }
    const onVisibility = () => { if (document.hidden) stopFlow(); else startFlow(); };
    document.addEventListener('visibilitychange', onVisibility);

    function flowCard(d) {
      return card({
        code: 'FLW-01', title: 'مسار المعالجة من الالتقاط حتى الإغلاق', subtitle: 'أنظمة العميل ← طبقة التحقق ← بحيرة البيانات ← محرك الذكاء الاصطناعي ← التصنيف ← التنبيه ← المهمة ← الإغلاق',
        className: 'cockpit-flow-card',
        body: buildFlow(d),
        footer: h('div', { class: 'row wrap gap-2 between' },
          h('span', { class: 'row gap-2 text-xs muted' }, liveDot('accent'), 'المنصة تقرأ من أنظمة العميل ولا تكتب إليها سوى أعلام المخاطر والدرجات والتنبيهات ومهام المعالجة.'),
          h('span', { class: 'text-xs muted' }, isReduced() ? 'الحركة متوقفة وفق تفضيل تقليل الحركة' : 'المرحلة النشطة تتقدم كل 2.4 ثانية')),
      });
    }

    /* ---------------------------------------------------------------- */
    /* Row 3 — red risks table, alert queue                               */
    /* ---------------------------------------------------------------- */

    function dueCell(iso, now) {
      const overdue = isOverdue(iso, now);
      return h('span', { class: ['row gap-1 due-cell', overdue ? 'is-overdue' : null], title: overdue ? 'متأخر عن موعد الاستحقاق' : undefined },
        glyph(overdue ? 'critical' : 'clock', 13), h('span', {}, fmt.date(iso, { style: 'short' })), overdue ? h('span', { class: 'sr-only' }, ' — متأخر') : null);
    }

    function redRisksCard(d) {
      const table = dataTable({
        caption: 'المخاطر الحمراء المفتوحة مرتبة تنازلياً حسب الدرجة',
        rows: d.red, rowKey: 'id', pageSize: 8, dense: true, emptyText: 'لا توجد مخاطر حمراء مفتوحة ضمن عوامل التصفية الحالية',
        onRowClick: (row) => navigate('airisks', { risk: row.id }),
        columns: [
          { key: 'code', label: 'الرمز', width: 96, mono: true },
          { key: 'title', label: 'المخاطرة', render: (r) => h('span', { class: 'semibold' }, r.title) },
          { key: 'projectId', label: 'المشروع', render: (r) => d.projectName(r.projectId), sortValue: (r) => d.projectName(r.projectId) },
          { key: 'category', label: 'المجال', render: (r) => categoryChip(psel, r.category), sortValue: (r) => categoryLabel(psel, r.category) },
          { key: 'type', label: 'النوع', render: (r) => typeChip(psel, r.type), sortValue: (r) => typeLabel(psel, r.type) },
          { key: 'score', label: 'الدرجة', align: 'center', render: (r) => scoreNum(r.score, r.rating), sortValue: (r) => num(r.score) },
          { key: 'rating', label: 'التصنيف', render: (r) => ratingBadge(psel, r.rating), sortValue: (r) => RATING_ORDER.indexOf(r.rating) },
          { key: 'owner', label: 'المالك' },
          { key: 'dueDate', label: 'الاستحقاق', render: (r) => dueCell(r.dueDate, d.now), sortValue: (r) => Date.parse(r.dueDate) || 0 },
        ],
      });
      table.setSort('score', 'desc');
      return card({
        code: 'AIR-RED', title: 'المخاطر الحمراء المفتوحة', subtitle: `${fmt.num(d.red.length)} مخاطرة تتطلب تدخلاً فورياً — انقر صفاً لفتح الدليل والتوصية`,
        className: 'col-span-8',
        actions: [button('السجل الكامل', { variant: 'ghost', size: 'sm', icon: 'shield-alert', onClick: () => navigate('airisks') })],
        body: table.el,
      });
    }

    function alertItem(a, d) {
      const critical = a.severity === 'critical' || a.queue === 'immediate';
      const ackable = !a.acknowledged && typeof store.ackAlert === 'function';
      const channels = Array.isArray(a.channels) ? a.channels : [];
      return h('li', { class: 'alert-queue-item', 'data-severity': critical ? 'critical' : 'routine', 'data-acked': a.acknowledged ? 'true' : 'false' },
        h('div', { class: 'alert-queue-main' },
          h('span', { class: 'row gap-2 wrap' }, h('span', { class: 'alert-queue-title' }, a.title || 'تنبيه'), badge(critical ? 'تصعيد فوري' : 'قياسي', critical ? 'critical' : 'neutral')),
          h('span', { class: 'alert-queue-meta' }, h('span', {}, d.projectName(a.projectId)), h('span', { title: fmt.dateTime(a.sentAt) }, fmt.relative(a.sentAt)),
            a.acknowledged ? h('span', {}, `أقرّه ${a.ackBy || '—'}${a.ackAt ? ` ${fmt.relative(a.ackAt)}` : ''}`) : null)),
        h('div', { class: 'alert-queue-actions' },
          a.acknowledged
            ? badge('تم الإقرار', 'good')
            : (ackable
              ? button('إقرار', { variant: 'outline', size: 'sm', onClick: () => { try { store.ackAlert(a.id, USER); toast(`تم الإقرار بالتنبيه — ${a.title || ''}`, { tone: 'good' }); } catch (err) { warnOnce('store.ackAlert', err); toast('تعذر الإقرار بالتنبيه', { tone: 'critical' }); } } })
              : badge('بانتظار الإقرار', 'warning'))),
        channels.length ? h('div', { class: 'alert-queue-channels', 'aria-label': 'قنوات الإرسال' }, channels.map((c) => h('span', { class: 'channel-chip' }, svgIcon(CHANNEL_ICON[c] || 'send', 11), CHANNEL_LABEL[c] || String(c)))) : null);
    }

    function alertQueueCard(d) {
      const items = d.immediate.concat(d.standard).slice(0, 8);
      const list = items.length
        ? h('ul', { class: 'alert-queue', 'aria-label': 'قائمة التنبيهات — التصعيد الفوري أولاً' }, items.map((a) => alertItem(a, d)))
        : emptyState({ icon: 'bell', title: 'لا توجد تنبيهات', text: 'تظهر هنا التنبيهات عندما تتجاوز درجة مخاطرة عتبة التنبيه.' });
      return card({
        code: 'AIR-03', title: 'قائمة التنبيهات', subtitle: `${fmt.num(d.immediate.filter((a) => !a.acknowledged).length)} تصعيد فوري · ${fmt.num(d.standard.filter((a) => !a.acknowledged).length)} قياسي بانتظار الإقرار`,
        className: 'col-span-4',
        actions: [button('عرض الكل', { variant: 'ghost', size: 'sm', onClick: () => navigate('alerts') })],
        body: list,
      });
    }

    /* ---------------------------------------------------------------- */
    /* Row 3b — pipeline health strip, data quality, distributions        */
    /* ---------------------------------------------------------------- */

    function pipelineStrip(d) {
      const list = (d.pipelines || []).slice(0, 5);
      const strip = list.length
        ? h('div', { class: 'pipe-strip', role: 'list', 'aria-label': 'صحة خطوط المعالجة الخمسة' })
        : emptyState({ icon: 'sliders', title: 'لا توجد خطوط معالجة مسجلة', text: 'تظهر هنا حالة النماذج الخمسة بعد تحميل بيانات المنصة.' });
      list.forEach((item) => {
        const p = item && item.pipeline ? item.pipeline : item;
        const status = PIPELINE_STATUS[p.status] || { label: String(p.status || '—'), tone: 'neutral' };
        const tone = item.tone || item.health || status.tone;
        const name = p.nameAr || p.name || pipelineLabel(psel, p.id);
        strip.appendChild(h('button', {
          type: 'button', class: ['pipe-mini', `tone-${tone}`], role: 'listitem', 'data-status': p.status || '', onClick: () => navigate('engine'),
          'aria-label': `${name}: ${status.label} — نسبة القبول ${fmt.pct(num(p.acceptanceRatePct))} — ${fmt.num(num(p.runsToday))} تشغيلاً اليوم — آخر تشغيل ${fmt.relative(p.lastRun)}. فتح محرك الذكاء الاصطناعي`,
        },
        h('div', { class: 'pipe-mini-head' }, liveDot(tone), h('span', { class: 'grow truncate' }, name), badge(status.label, tone)),
        h('div', { class: 'pipe-mini-meta' }, 'نسبة القبول ', h('span', { class: 'mono num' }, fmt.pct(num(p.acceptanceRatePct))), ' · تشغيلات اليوم ', h('span', { class: 'mono num' }, fmt.num(num(p.runsToday)))),
        h('div', { class: 'pipe-mini-meta' }, 'آخر تشغيل ', h('span', { class: 'mono' }, fmt.relative(p.lastRun)), isNum(p.avgLatencyMs) ? h('span', {}, ' · ', h('span', { class: 'mono num' }, `${fmt.num(p.avgLatencyMs)} ms`)) : null, p.version ? h('span', {}, ' · ', h('span', { class: 'mono' }, p.version)) : null)));
      });
      return card({
        code: 'PLT-01', title: 'صحة خطوط المعالجة', subtitle: 'خمسة نماذج على طبقة تقييم وتفسير مشتركة — الحالة، آخر تشغيل، تشغيلات اليوم، ونسبة قبول التوصيات (الإنسان في الحلقة)',
        className: 'cockpit-pipelines',
        actions: [button('محرك الذكاء الاصطناعي', { variant: 'ghost', size: 'sm', icon: 'sliders', onClick: () => navigate('engine') })],
        body: strip,
      });
    }

    function dataQualityCard(d) {
      const v = d.validation;
      const pass = num(v.passRatePct);
      const tone = pass >= 97 ? 'good' : pass >= 90 ? 'warning' : 'critical';
      const meter = chartOr('meter', () => charts.meter({ value: pass, max: 100, label: 'نسبة اجتياز التحقق', thresholds: [{ upTo: 90, tone: 'critical' }, { upTo: 97, tone: 'warning' }, { upTo: 100, tone: 'good' }], height: 10 }), () => fallbackMeter(pass, 'نسبة اجتياز التحقق', tone));
      const quarantine = h('button', {
        type: 'button', class: ['tile', 'is-clickable', num(v.quarantineOpen) ? 'tone-warning' : 'tone-good'], onClick: () => navigate('dataquality'),
        'aria-label': `${fmt.num(num(v.quarantineOpen))} سجلاً في الحجر بانتظار المعالجة — فتح جودة البيانات`,
      },
      h('div', { class: 'tile-top' }, h('span', { class: 'tile-label' }, 'سجلات في الحجر'), h('span', { class: 'tile-icon', 'aria-hidden': 'true' }, svgIcon('badge-check', 16))),
      h('div', { class: 'tile-value-row' }, h('span', { class: 'tile-value num' }, fmt.num(num(v.quarantineOpen))), h('span', { class: 'tile-unit' }, 'معلّق')));
      return card({
        code: 'PLT-02', title: 'جودة البيانات والتحقق', subtitle: 'لا يصل أي سجل إلى المحرك قبل اجتياز التحقق',
        className: 'col-span-4',
        actions: [button('التفاصيل', { variant: 'ghost', size: 'sm', onClick: () => navigate('dataquality') })],
        body: h('div', { class: 'stack gap-3' },
          meter,
          kv([
            ['السجلات الواردة اليوم', h('span', { class: 'mono num' }, fmt.num(num(v.recordsIn)))],
            ['الاكتمال', h('span', { class: 'mono num' }, fmt.pct(num(v.completenessPct)))],
            ['الاتساق', h('span', { class: 'mono num' }, fmt.pct(num(v.consistencyPct)))],
            ['مكررات أُزيلت', h('span', { class: 'mono num' }, fmt.num(num(v.deduplicated)))],
          ]),
          quarantine),
      });
    }

    function distributionCard({ code, title, subtitle, parts, ariaLabel }) {
      const total = parts.reduce((s, p) => s + num(p.value), 0);
      const seg = total > 0
        ? chartOr('segmentedBar', () => charts.segmentedBar({ parts: parts.map((p) => ({ id: p.id, label: p.label, value: num(p.value), color: p.color })), tall: true, valueFormat: fmt.num, ariaLabel }), () => fallbackSegments(parts))
        : emptyState({ title: 'لا توجد مخاطر مفتوحة ضمن عوامل التصفية' });
      const legend = h('div', { class: 'row wrap gap-2 dist-legend', role: 'list' }, parts.map((p) => h('span', { class: 'row gap-1 text-xs', role: 'listitem' }, p.icon, h('span', { class: 'mono num muted' }, fmt.num(num(p.value))))));
      return card({ code, title, subtitle, className: 'col-span-4', body: h('div', { class: 'stack gap-3' }, seg, legend), tableView: tableViewOf(seg) });
    }

    function typeDistributionCard(d) {
      const palette = (i) => (charts && typeof charts.paletteFor === 'function' ? safe('charts.paletteFor', () => charts.paletteFor(i), `var(--s${(i % 8) + 1})`) : `var(--s${(i % 8) + 1})`);
      const parts = TYPE_ORDER.map((type, i) => {
        const found = (d.typeDist || []).find((x) => x.type === type) || { value: 0 };
        return { id: type, label: typeLabel(psel, type), value: num(found.value), color: palette(i), icon: typeChip(psel, type) };
      });
      return distributionCard({ code: 'DST-01', title: 'توزيع المخاطر حسب النوع', subtitle: 'مالي · سلامة · تأخير · نزاع — المخاطر المفتوحة', parts, ariaLabel: 'توزيع المخاطر المفتوحة حسب النوع' });
    }

    function ratingDistributionCard(d) {
      const parts = RATING_ORDER.map((rating) => {
        const found = (d.ratingDist || []).find((x) => x.rating === rating) || { value: 0 };
        return { id: rating, label: ratingLabel(psel, rating), value: num(found.value), color: `var(--${ratingTone(psel, rating)})`, tone: ratingTone(psel, rating), icon: ratingBadge(psel, rating) };
      });
      return distributionCard({ code: 'DST-02', title: 'توزيع المخاطر حسب التصنيف', subtitle: 'أحمر (تدخل فوري) · أصفر (مراقبة) · أخضر (ضمن حدود التحمل)', parts, ariaLabel: 'توزيع المخاطر المفتوحة حسب التصنيف' });
    }

    /* ---------------------------------------------------------------- */
    /* Row 4 — projects table                                             */
    /* ---------------------------------------------------------------- */

    function projectsCard(d) {
      const ratio = (x) => (isNum(x) ? fmt.num(x, { maximumFractionDigits: 2, minimumFractionDigits: 2 }) : '—');
      const table = dataTable({
        caption: 'المشاريع — الدرجة الموحدة ومؤشرات القيمة المكتسبة',
        rows: d.projects, rowKey: 'id', pageSize: 6, dense: true, emptyText: 'لا توجد مشاريع ضمن عوامل التصفية',
        onRowClick: (p) => { try { store.setFilter('siteId', p.id); toast(`تم تركيز المحفظة على مشروع ${p.name}`, { tone: 'accent', action: { label: 'إلغاء', onClick: () => store.setFilter('siteId', 'all') } }); } catch (err) { warnOnce('store.setFilter', err); } },
        columns: [
          { key: 'name', label: 'المشروع', render: (p) => h('span', { class: 'stack gap-1' }, h('span', { class: 'semibold' }, p.name), h('span', { class: 'text-xs muted mono' }, String(p.code || p.id))) },
          { key: 'score', label: 'الدرجة الموحدة', render: (p) => h('span', { class: 'row gap-2' }, scoreNum(p.cons.score, p.cons.rating), ratingBadge(psel, p.cons.rating)), sortValue: (p) => num(p.cons.score) },
          { key: 'cpi', label: 'CPI / SPI', align: 'center', render: (p) => h('span', { class: 'stack gap-1', style: { alignItems: 'center' } }, h('span', { class: 'mono num' }, `${ratio(p.evm.CPI)} / ${ratio(p.evm.SPI)}`), p.evm.status && EVM_TONE[p.evm.status] ? badge(p.evm.status, EVM_TONE[p.evm.status]) : null), sortValue: (p) => num(p.evm.CPI) },
          { key: 'percentComplete', label: 'الإنجاز مقابل الخطة', render: (p) => {
            const actual = num(p.evm.percentComplete, num(p.percentComplete)); const planned = num(p.evm.plannedPercent, num(p.plannedPercent));
            const gap = planned - actual; const tone = gap <= 2 ? 'good' : gap <= 10 ? 'warning' : 'critical';
            return h('span', { class: 'stack gap-1' }, progress({ value: actual, max: 100, tone, label: `الإنجاز ${fmt.pct(actual)} مقابل خطة ${fmt.pct(planned)}` }), h('span', { class: 'text-xs muted mono num' }, `${fmt.pct(actual)} / ${fmt.pct(planned)}`));
          }, sortValue: (p) => num(p.evm.percentComplete, num(p.percentComplete)) },
          { key: 'redCount', label: 'أحمر', align: 'center', render: (p) => (p.redCount ? badge(fmt.num(p.redCount), 'critical') : badge(fmt.num(0), 'good')), sortValue: (p) => p.redCount },
          { key: 'next', label: 'المعلم القادم', render: (p) => (p.next
            ? h('span', { class: 'stack gap-1' }, h('span', {}, p.next.name), h('span', { class: 'text-xs muted' }, `${p.next.code ? `${p.next.code} · ` : ''}${fmt.date(p.next.finish, { style: 'short' })}`))
            : h('span', { class: 'stack gap-1' }, h('span', {}, 'الإنجاز المخطط'), h('span', { class: 'text-xs muted' }, fmt.date(p.plannedFinish, { style: 'short' })))), sortValue: (p) => Date.parse(p.next ? p.next.finish : p.plannedFinish) || 0 },
        ],
      });
      table.setSort('score', 'desc');
      return card({
        code: 'PRJ-01', title: 'المشاريع', subtitle: 'الدرجة الموحدة لكل مشروع مع مؤشري الأداء CPI/SPI والإنجاز مقابل الخطة — انقر صفاً لتركيز المحفظة على المشروع',
        className: 'col-span-12', body: table.el,
      });
    }

    /* ---------------------------------------------------------------- */
    /* paint                                                              */
    /* ---------------------------------------------------------------- */

    function paint() {
      clear(body);
      if (flowObserver) { flowObserver.disconnect(); flowObserver = null; }
      flowEl = null;
      const state = stateOf();
      if (!state.platform || !Array.isArray(state.platform.aiRisks)) {
        body.appendChild(emptyState({ icon: 'radar', title: 'بيانات المنصة غير متاحة بعد', text: 'لم تُحمَّل بيانات منصة إدارة المخاطر (state.platform). أعد تحميل الصفحة بعد اكتمال التهيئة.' }));
        return;
      }
      const d = collect();
      // Row 1: hero (4 cols) beside the five category tiles with the five pipeline mini cards under them (8 cols)
      body.appendChild(h('div', { class: 'grid-12 cockpit-row-1' }, heroCard(d), h('div', { class: 'col-span-8 stack gap-4 cockpit-row-1-side', style: { justifyContent: 'space-between' } }, categoryTiles(d), pipelineStrip(d))));
      body.appendChild(flowCard(d));
      body.appendChild(h('div', { class: 'grid-12 cockpit-row-3' }, redRisksCard(d), alertQueueCard(d)));
      body.appendChild(h('div', { class: 'grid-12 cockpit-row-3c' }, dataQualityCard(d), typeDistributionCard(d), ratingDistributionCard(d)));
      body.appendChild(h('div', { class: 'grid-12 cockpit-row-4' }, projectsCard(d)));
      // the packet element is recreated on paint (its CSS animation restarts) — restart the stage clock with it
      flowStage = 0;
      applyFlowStage();
      startFlow();
    }

    function schedule() {
      if (!alive) return;
      if (raf) cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => { raf = 0; if (alive) paint(); });
    }

    subs.push(bus.on('store:change', (payload) => {
      const path = payload && typeof payload.path === 'string' ? payload.path : '*';
      if (path.startsWith('feed')) return; // the live feed changes nothing the cockpit shows
      schedule();
    }));
    subs.push(bus.on('filters:change', schedule));
    subs.push(bus.on('settings:change', schedule));

    paint();

    return () => {
      alive = false;
      if (raf) cancelAnimationFrame(raf);
      stopFlow();
      if (flowObserver) { flowObserver.disconnect(); flowObserver = null; }
      document.removeEventListener('visibilitychange', onVisibility);
      subs.splice(0).forEach((unsub) => { try { unsub(); } catch { /* ignore */ } });
      flowEl = null;
    };
  },
};
