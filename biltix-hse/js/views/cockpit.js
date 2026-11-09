/**
 * Biltix Risk AI — قمرة قيادة المخاطر (js/views/cockpit.js)
 *
 * View contract (ARCHITECTURE.md §8, B9.1): `default { id, code, title, icon, render }`.
 *
 *   Row 1  hero card — consolidated score gauge (tone from rating: higher = worse),
 *          delta vs previous period, 12-week trend sparkline, weights legend (→ settings)
 *          + five category tiles (contract / bom / schedule / site / cost) → domain views.
 *   Row 2  flow strip (.flow) — eight stages with live counters and a packet that advances
 *          one stage every 2.4 s (class toggling + CSS variable; static under reduced motion).
 *   Row 3  ranked open red risks (row click → #/airisks?risk=ID), alert queue with
 *          acknowledge buttons, pipeline health strip, data-quality mini card,
 *          type / rating distribution segmented bars.
 *   Row 4  projects table (consolidated project score, CPI/SPI, progress vs plan,
 *          red count, next milestone); row click focuses the project filter.
 *
 * Data reaches the DOM only through textContent (components.h). Every contract call
 * into psel / charts is guarded so a missing or throwing module degrades to a plain
 * DOM fallback instead of breaking the cockpit. Re-renders on store:change (except the
 * feed), filters:change and settings:change; the cleanup unsubscribes and clears timers.
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
const TYPE_META = {
  Financial: { label: 'مالي', icon: 'chart' },
  Safety: { label: 'سلامة', icon: 'helmet' },
  Delay: { label: 'تأخير', icon: 'clock' },
  Conflict: { label: 'نزاع', icon: 'file-text' },
};
const RATING_META = {
  red: { label: 'أحمر', tone: 'critical' },
  yellow: { label: 'أصفر', tone: 'warning' },
  green: { label: 'أخضر', tone: 'good' },
};
const RATING_ORDER = ['red', 'yellow', 'green'];
const TYPE_ORDER = ['Financial', 'Safety', 'Delay', 'Conflict'];
const OPEN_RISK_STATUSES = new Set(['مكتشف', 'تنبيه', 'مهمة مُسندة', 'قيد المعالجة']);
const PIPELINE_STATUS = {
  running: { label: 'يعمل', tone: 'good' },
  idle: { label: 'خامل', tone: 'neutral' },
  training: { label: 'قيد التدريب', tone: 'accent' },
  degraded: { label: 'متدهور', tone: 'warning' },
};
const EVM_TONE = { 'ضمن الميزانية': 'good', 'تحذير': 'warning', 'تجاوز': 'critical' };
const CHANNEL_LABEL = { email: 'البريد', slack: 'Slack', teams: 'Teams', whatsapp: 'واتساب' };

/** The eight stages of the proposal's end-to-end flow (B4 riskFlowStage order). */
const FLOW_STAGES = [
  { id: 'ingest', label: 'مُلتقط', icon: 'download' },
  { id: 'validate', label: 'مُتحقق', icon: 'badge-check' },
  { id: 'lake', label: 'في بحيرة البيانات', icon: 'database' },
  { id: 'score', label: 'مُقيَّم', icon: 'sliders' },
  { id: 'classify', label: 'مُصنَّف', icon: 'shield-alert' },
  { id: 'alert', label: 'تنبيه', icon: 'bell' },
  { id: 'task', label: 'مهمة', icon: 'file-check' },
  { id: 'closed', label: 'مغلق', icon: 'good' },
];

/* ------------------------------------------------------------------ */
/* Guards & small helpers                                               */
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
const isNum = (n) => typeof n === 'number' && Number.isFinite(n);
const num = (n, d = 0) => (isNum(n) ? n : d);

function startOfDay(date) { const x = new Date(date); x.setHours(0, 0, 0, 0); return x.getTime(); }
function isOverdue(iso, now) { const d = defaultFmt.toDate(iso); return !!d && d.getTime() < startOfDay(now); }
const isOpenRisk = (r) => r && OPEN_RISK_STATUSES.has(r.status);

/* ---- labels through psel with local fallbacks (B2 single definition lives in psel) ---- */

function ratingOf(psel, score) {
  return safe('psel.rating', () => psel.rating(score), score >= 70 ? 'red' : score >= 40 ? 'yellow' : 'green');
}
function ratingTone(psel, rating) {
  return safe('psel.ratingTone', () => psel.ratingTone(rating), (RATING_META[rating] || RATING_META.green).tone);
}
function ratingLabel(psel, rating) {
  return safe('psel.ratingLabel', () => psel.ratingLabel(rating), (RATING_META[rating] || RATING_META.green).label);
}
function ratingBadge(psel, rating, { lg = false } = {}) {
  const b = badge(ratingLabel(psel, rating), ratingTone(psel, rating));
  b.classList.add('rating', `is-${rating}`);
  if (lg) b.classList.add('is-lg');
  return b;
}
function typeLabel(psel, type) {
  return safe('psel.typeLabel', () => psel.typeLabel(type), (TYPE_META[type] || {}).label || String(type || '—'));
}
function typeChip(psel, type) {
  const meta = TYPE_META[type] || { icon: 'neutral' };
  return h('span', { class: ['type-chip', `is-${String(type || 'unknown').toLowerCase()}`], 'data-type': type || '' },
    svgIcon(meta.icon, 13), h('span', { class: 'type-chip-label' }, typeLabel(psel, type)));
}
function categoryLabel(psel, cat) {
  return safe('psel.categoryLabel', () => psel.categoryLabel(cat), (CATEGORY_META[cat] || {}).label || String(cat || '—'));
}
function categoryIcon(psel, cat) {
  return safe('psel.categoryIcon', () => psel.categoryIcon(cat), (CATEGORY_META[cat] || {}).icon || 'neutral');
}
function categoryCell(psel, cat) {
  return h('span', { class: 'row gap-1 cat-cell' }, svgIcon(categoryIcon(psel, cat), 14), h('span', {}, categoryLabel(psel, cat)));
}
function pipelineLabel(psel, id) {
  return safe('psel.pipelineLabel', () => psel.pipelineLabel(id), String(id || '—'));
}

function deltaChip(fmt, delta, { goodWhen = 'down', label = 'التغير مقارنة بالفترة السابقة' } = {}) {
  const n = Number(delta);
  if (!Number.isFinite(n)) return null;
  const up = n > 0;
  const zero = n === 0;
  const good = zero ? null : (goodWhen === 'down' ? !up : up);
  const text = fmt.signed(n, Number.isInteger(n) ? 0 : 1);
  const el = h('span', {
    class: ['tile-delta', zero ? 'is-flat' : (up ? 'is-up' : 'is-down'), good === null ? null : (good ? 'is-good' : 'is-bad')],
    'aria-label': `${label}: ${text}`,
  });
  el.appendChild(glyph(zero ? 'neutral' : (up ? 'sortAsc' : 'sortDesc'), 12));
  el.appendChild(h('span', {}, text));
  return el;
}

function viewHead({ code, title, lead, actions = [] }) {
  const text = h('div', { class: 'view-head-text' },
    h('span', { class: 'code-tag' }, code),
    h('h1', {}, title),
    lead ? h('p', { class: 'view-lead' }, lead) : null);
  return h('div', { class: 'view-head' }, text, actions.length ? h('div', { class: 'view-actions' }, actions) : null);
}

function sectionTitle(text) {
  return h('h3', { class: 'drawer-section-title' }, text);
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
    const psel = ctx.psel;
    const charts = ctx.charts;

    let alive = true;
    let raf = 0;
    const subs = [];
    let flowStage = 0;
    let flowTimer = null;
    let flowEl = null;
    let packetEl = null;

    const navigate = (id, params = {}) => { if (router && typeof router.navigate === 'function') router.navigate(id, params); };
    const nowDate = () => (typeof store.now === 'function' ? store.now() : new Date());
    const stateOf = () => store.state || store.get();
    const settings = () => (stateOf().settings || {});
    const isReduced = () => reducedMotion() || settings().reducedMotion === true;

    const root = h('section', { class: 'view view-cockpit', 'aria-labelledby': 'cockpit-title' });
    root.appendChild(viewHead({
      code: 'CPT-00',
      title: 'قمرة قيادة المخاطر',
      lead: 'رؤية موحدة لمخاطر المحفظة عبر خمسة مجالات — العقود، المواد والتوريد، الجدول الزمني، الموقع والسلامة، والتكلفة — مع تصنيف فوري بالذكاء الاصطناعي ومعالجة مُتتبعة حتى الإغلاق.',
      actions: [
        button('سجل المخاطر الذكي', { variant: 'outline', size: 'sm', icon: 'shield-alert', onClick: () => navigate('airisks') }),
        button('التنبيهات والتصعيد', { variant: 'ghost', size: 'sm', icon: 'bell', onClick: () => navigate('alerts') }),
      ],
    }));
    root.querySelector('h1').id = 'cockpit-title';
    const body = h('div', { class: 'stack gap-4 cockpit-body' });
    root.appendChild(body);
    container.appendChild(root);

    /* ---------------------------------------------------------------- */
    /* chart helpers (contract API through ctx.charts with DOM fallbacks) */
    /* ---------------------------------------------------------------- */

    function chartOr(key, make, fallback) {
      if (charts) {
        try {
          const c = make();
          if (c && (c instanceof Node || (c.el instanceof Node))) return c;
        } catch (err) { warnOnce(`charts.${key}`, err); }
      }
      return typeof fallback === 'function' ? fallback() : null;
    }
    const tableViewOf = (chart) => (chart && typeof chart.table === 'function' ? () => chart.table() : null);

    function fallbackGauge(score, tone, label) {
      return h('div', { class: ['gauge-fallback', 'stack', `tone-${tone}`] },
        h('span', { class: 'tile-value num' }, fmt.num(score)),
        h('span', { class: 'muted text-xs' }, label),
        progress({ value: score, max: 100, tone, label }));
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

      const allRisks = safe('psel.filteredAiRisks', () => psel.filteredAiRisks(state, filters), (platform.aiRisks || []).filter((r) => inSite(r.projectId)));
      const openRisks = safe('psel.openAiRisks', () => psel.openAiRisks(state, filters), allRisks.filter(isOpenRisk));
      const withRating = (r) => ({ ...r, rating: ratingOf(psel, num(r.score)) });
      const open = openRisks.map(withRating);
      const red = open.filter((r) => r.rating === 'red').sort((a, b) => num(b.score) - num(a.score));
      const yellow = open.filter((r) => r.rating === 'yellow').length;
      const green = open.filter((r) => r.rating === 'green').length;
      const closedRisks = allRisks.filter((r) => r.status === 'مغلق').length;

      const consolidated = safe('psel.consolidatedScore', () => psel.consolidatedScore(state, filters), null) || {
        score: 0, rating: 'green', delta: 0, trend: [], weights: (settings().platform || {}).weights || {},
      };
      if (!consolidated.rating) consolidated.rating = ratingOf(psel, num(consolidated.score));

      const categories = safe('psel.categoryScores', () => psel.categoryScores(state, filters), null) || CATEGORY_ORDER.map((category) => {
        const items = open.filter((r) => r.category === category);
        const scores = items.map((r) => num(r.score));
        const score = scores.length ? Math.round(0.5 * Math.max(...scores) + 0.5 * (scores.reduce((s, v) => s + v, 0) / scores.length)) : 0;
        return { category, label: categoryLabel(psel, category), score, rating: ratingOf(psel, score), open: items.length,
          red: items.filter((r) => r.rating === 'red').length, yellow: items.filter((r) => r.rating === 'yellow').length, green: items.filter((r) => r.rating === 'green').length, trend: [] };
      });

      const validation = safe('psel.validationSummary', () => psel.validationSummary(state), null) || (() => {
        const sources = (platform.validation && platform.validation.sources) || [];
        const sum = (k) => sources.reduce((s, x) => s + num(x[k]), 0);
        const recordsIn = sum('recordsIn'); const passed = sum('passed');
        return { recordsIn, passed, rejected: sum('rejected'), deduplicated: sum('deduplicated'), passRatePct: recordsIn ? Math.round((passed / recordsIn) * 100) : 0,
          completenessPct: sources.length ? Math.round(sum('completenessPct') / sources.length) : 0, consistencyPct: sources.length ? Math.round(sum('consistencyPct') / sources.length) : 0,
          quarantineOpen: ((platform.validation && platform.validation.quarantine) || []).filter((q) => q.status === 'معلّق').length, bySource: sources };
      })();

      const queue = safe('psel.alertQueue', () => psel.alertQueue(state), null) || (() => {
        const list = (platform.alerts || []).slice().sort((a, b) => Number(a.acknowledged) - Number(b.acknowledged) || Date.parse(b.sentAt) - Date.parse(a.sentAt));
        return { immediate: list.filter((a) => a.queue === 'immediate'), standard: list.filter((a) => a.queue !== 'immediate') };
      })();
      const immediate = (queue.immediate || []).filter((a) => inSite(a.projectId));
      const standard = (queue.standard || []).filter((a) => inSite(a.projectId));
      const unacked = immediate.concat(standard).filter((a) => !a.acknowledged);

      const tasks = (platform.tasks || []).filter((t) => inSite(t.projectId));
      const openTasks = tasks.filter((t) => t.status !== 'مغلقة');
      const overdueTasks = openTasks.filter((t) => t.status === 'متأخرة' || isOverdue(t.dueDate, now));
      const closedTasks = tasks.length - openTasks.length;

      const pipelines = safe('psel.pipelineHealth', () => psel.pipelineHealth(state), null) || (platform.pipelines || []);

      const typeDist = safe('psel.typeDistribution', () => psel.typeDistribution(state, filters), null) || TYPE_ORDER.map((type) => ({ type, label: typeLabel(psel, type), value: open.filter((r) => r.type === type).length }));
      const ratingDist = safe('psel.ratingDistribution', () => psel.ratingDistribution(state, filters), null) || RATING_ORDER.map((rating) => ({ rating, label: ratingLabel(psel, rating), value: open.filter((r) => r.rating === rating).length }));

      const projects = (platform.projects || []).filter((p) => inSite(p.id)).map((p) => {
        const evm = safe('psel.evm', () => psel.evm(state, p.id), null) || { ...(p.evm || {}), percentComplete: p.percentComplete, plannedPercent: p.plannedPercent, status: '—' };
        const cons = safe('psel.consolidatedScore(project)', () => psel.consolidatedScore(state, { ...filters, siteId: p.id }), null) || { score: 0, rating: 'green' };
        if (!cons.rating) cons.rating = ratingOf(psel, num(cons.score));
        const redCount = (platform.aiRisks || []).filter((r) => r.projectId === p.id && isOpenRisk(r) && ratingOf(psel, num(r.score)) === 'red').length;
        const today = startOfDay(now);
        const next = (platform.scheduleTasks || [])
          .filter((t) => t.projectId === p.id && t.critical && defaultFmt.toDate(t.finish) && defaultFmt.toDate(t.finish).getTime() >= today)
          .sort((a, b) => Date.parse(a.finish) - Date.parse(b.finish))[0] || null;
        return { ...p, name: projectName(p.id), evm, cons, redCount, next };
      });

      return { state, platform, filters, now, projectName, allRisks, open, red, yellow, green, closedRisks, consolidated, categories, validation, immediate, standard, unacked, openTasks, overdueTasks, closedTasks, pipelines, typeDist, ratingDist, projects };
    }

    /* ---------------------------------------------------------------- */
    /* Row 1 — hero + category tiles                                      */
    /* ---------------------------------------------------------------- */

    function heroCard(d) {
      const c = d.consolidated;
      const score = Math.round(num(c.score));
      const rating = c.rating || ratingOf(psel, score);
      const tone = ratingTone(psel, rating);
      const gauge = chartOr('gauge', () => charts.gauge({ value: score, max: 100, size: 196, label: 'الدرجة الموحدة', sublabel: ratingLabel(psel, rating) }), () => fallbackGauge(score, tone, 'الدرجة الموحدة'));
      const gaugeWrap = h('div', { class: ['cockpit-gauge', `tone-${tone}`], 'data-rating': rating, role: 'img', 'aria-label': `الدرجة الموحدة للمخاطر ${fmt.num(score)} من 100 — تصنيف ${ratingLabel(psel, rating)}` }, gauge);

      const trend = Array.isArray(c.trend) ? c.trend.filter(isNum) : [];
      const spark = trend.length >= 2 ? chartOr('sparkline', () => charts.sparkline({ values: trend, width: 150, height: 34, color: 'var(--ink-3)', accentLast: true }), () => null) : null;

      const facts = h('div', { class: 'hero-facts' },
        h('div', { class: 'fact' }, h('span', { class: 'fact-label' }, 'مخاطر مفتوحة'), h('span', { class: 'fact-value num' }, fmt.num(d.open.length))),
        h('div', { class: 'fact tone-critical' }, h('span', { class: 'fact-label' }, 'تصنيف أحمر'), h('span', { class: 'fact-value num' }, fmt.num(d.red.length))),
        h('div', { class: 'fact' }, h('span', { class: 'fact-label' }, 'تنبيهات بانتظار الإقرار'), h('span', { class: 'fact-value num' }, fmt.num(d.unacked.length))));

      const weights = c.weights && typeof c.weights === 'object' ? c.weights : {};
      const legend = h('div', { class: 'chip-group weights-legend', role: 'group', 'aria-label': 'أوزان المجالات في الدرجة الموحدة — انقر للتعديل' },
        CATEGORY_ORDER.filter((k) => weights[k] !== undefined).map((k) => h('button', {
          type: 'button', class: 'chip is-sm', title: 'تعديل الأوزان في الإعدادات', onClick: () => navigate('settings'),
        }, svgIcon(categoryIcon(psel, k), 12), h('span', {}, categoryLabel(psel, k)), h('span', { class: 'chip-count' }, fmt.pct(num(weights[k]) * 100)))));

      const side = h('div', { class: 'stack gap-3 grow' },
        h('div', { class: 'row wrap gap-2' }, ratingBadge(psel, rating, { lg: true }), deltaChip(fmt, c.delta, { goodWhen: 'down' }), h('span', { class: 'muted text-xs' }, 'مقارنة بالفترة السابقة')),
        spark ? h('div', { class: 'row gap-2 wrap' }, h('span', { class: 'tile-spark', 'aria-hidden': 'true' }, spark), h('span', { class: 'muted text-xs' }, 'اتجاه 12 أسبوعاً')) : null,
        facts,
        h('div', { class: 'stack gap-1' }, h('span', { class: 'muted text-xs' }, 'الأوزان: Σ وزن المجال × درجة المجال'), legend));

      return card({
        code: 'CPT-00', title: 'الدرجة الموحدة للمخاطر', subtitle: 'كلما ارتفعت الدرجة ازداد الخطر — أحمر ≥ 70، أصفر 40–69، أخضر < 40',
        hero: true, className: 'cockpit-hero col-span-4',
        body: h('div', { class: 'row gap-4 wrap cockpit-hero-row', style: { alignItems: 'flex-start' } }, gaugeWrap, side),
      });
    }

    function categoryTiles(d) {
      const grid = h('div', { class: 'kpi-row cat-tiles col-span-8', style: { gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }, role: 'list', 'aria-label': 'درجات مجالات المخاطر' });
      const byCat = new Map((d.categories || []).map((c) => [c.category, c]));
      CATEGORY_ORDER.forEach((category) => {
        const c = byCat.get(category) || { category, score: 0, rating: 'green', open: 0, red: 0, trend: [] };
        const score = Math.round(num(c.score));
        const rating = c.rating || ratingOf(psel, score);
        const tone = ratingTone(psel, rating);
        const meta = CATEGORY_META[category] || {};
        const trend = Array.isArray(c.trend) ? c.trend.filter(isNum) : [];
        const spark = trend.length >= 2 ? chartOr('sparkline', () => charts.sparkline({ values: trend, width: 72, height: 22, color: 'var(--ink-3)' }), () => null) : null;
        const tile = h('button', {
          type: 'button', class: ['tile', 'is-clickable', 'cat-tile', `tone-${tone}`], 'data-category': category, role: 'listitem',
          'aria-label': `${categoryLabel(psel, category)}: الدرجة ${fmt.num(score)} — ${ratingLabel(psel, rating)} — ${fmt.num(num(c.open))} مخاطر مفتوحة. فتح مجال ${categoryLabel(psel, category)}`,
          onClick: () => navigate(meta.view || 'cockpit'),
        },
        h('div', { class: 'tile-top' }, h('span', { class: 'tile-label' }, c.label || categoryLabel(psel, category)), h('span', { class: 'tile-icon', 'aria-hidden': 'true' }, svgIcon(categoryIcon(psel, category), 16))),
        h('div', { class: 'tile-value-row' }, h('span', { class: 'tile-value num' }, fmt.num(score)), ratingBadge(psel, rating)),
        h('div', { class: 'tile-bottom' },
          h('span', { class: 'text-xs muted' }, `مفتوحة ${fmt.num(num(c.open))} · أحمر ${fmt.num(num(c.red))}`),
          spark ? h('span', { class: 'tile-spark', 'aria-hidden': 'true' }, spark) : null));
        grid.appendChild(tile);
      });
      return grid;
    }

    /* ---------------------------------------------------------------- */
    /* Row 2 — flow strip                                                 */
    /* ---------------------------------------------------------------- */

    function flowCounters(d) {
      const v = d.validation;
      return [
        { value: fmt.compact(num(v.recordsIn)), sub: 'سجل وارد اليوم' },
        { value: fmt.pct(num(v.passRatePct)), sub: `رُفض ${fmt.num(num(v.rejected))} · مكرر ${fmt.num(num(v.deduplicated))}` },
        { value: fmt.compact(num(v.passed)), sub: 'سجل مُطبَّع ومُؤرشف' },
        { value: fmt.num(d.allRisks.length), sub: 'مخاطرة مُقيَّمة 0–100' },
        { value: fmt.num(d.open.length), sub: `أحمر ${fmt.num(d.red.length)} · أصفر ${fmt.num(d.yellow)} · أخضر ${fmt.num(d.green)}` },
        { value: fmt.num(d.unacked.length), sub: `فوري ${fmt.num(d.immediate.filter((a) => !a.acknowledged).length)} · قياسي ${fmt.num(d.standard.filter((a) => !a.acknowledged).length)}` },
        { value: fmt.num(d.openTasks.length), sub: `متأخرة ${fmt.num(d.overdueTasks.length)}` },
        { value: fmt.num(d.closedRisks), sub: `مهام مغلقة ${fmt.num(d.closedTasks)}` },
      ];
    }

    function buildFlow(d) {
      const reduced = isReduced();
      const counters = flowCounters(d);
      const flow = h('div', {
        class: ['flow', reduced ? 'is-static' : 'is-live'], role: 'list', 'aria-label': 'مسار معالجة المخاطر — ثماني مراحل من الالتقاط حتى الإغلاق',
        'data-stage': String(flowStage), 'data-stages': String(FLOW_STAGES.length), style: { '--flow-stage': String(flowStage), '--flow-count': String(FLOW_STAGES.length) },
      });
      const track = h('div', { class: 'flow-track', style: { position: 'relative' } });
      const line = h('div', { class: 'flow-line', 'aria-hidden': 'true' });
      const packet = h('span', { class: 'flow-packet', 'aria-hidden': 'true', hidden: reduced, style: { position: 'absolute', insetBlockStart: 'var(--flow-dot-center, 18px)', transition: reduced ? 'none' : 'inset-inline-start 640ms var(--ease)' } });
      const nodes = h('div', { class: 'flow-nodes', style: { display: 'grid', gridTemplateColumns: `repeat(${FLOW_STAGES.length}, minmax(0, 1fr))` } });
      FLOW_STAGES.forEach((stage, i) => {
        const counter = counters[i] || { value: '—', sub: '' };
        const node = h('div', { class: ['flow-node', `is-${stage.id}`], role: 'listitem', 'data-stage': String(i) },
          h('span', { class: 'flow-node-dot', 'aria-hidden': 'true' }, svgIcon(stage.icon, 16)),
          h('span', { class: 'flow-node-label' }, stage.label),
          h('span', { class: 'flow-node-value mono num' }, counter.value),
          counter.sub ? h('span', { class: 'flow-node-sub muted text-xs' }, counter.sub) : null);
        if (i === 1) node.appendChild(h('span', { class: 'flow-gate badge tone-accent', title: 'بوابة التحقق: لا يصل أي سجل إلى المحرك قبل اجتياز التحقق' }, glyph('accent', 11), h('span', { class: 'badge-text' }, 'بوابة التحقق')));
        nodes.appendChild(node);
      });
      track.append(line, nodes, packet);
      flow.appendChild(track);
      flowEl = flow;
      packetEl = packet;
      applyFlowStage();
      return flow;
    }

    function applyFlowStage() {
      if (!flowEl || !flowEl.isConnected) return;
      const n = FLOW_STAGES.length;
      flowEl.dataset.stage = String(flowStage);
      flowEl.style.setProperty('--flow-stage', String(flowStage));
      flowEl.querySelectorAll('.flow-node').forEach((node, i) => {
        node.classList.toggle('is-active', i === flowStage);
        node.classList.toggle('is-done', i < flowStage);
        node.classList.toggle('is-next', i === (flowStage + 1) % n);
        if (i === flowStage) node.setAttribute('aria-current', 'step'); else node.removeAttribute('aria-current');
      });
      if (packetEl) {
        packetEl.style.insetInlineStart = `calc(${(((flowStage + 0.5) / n) * 100).toFixed(3)}% - var(--flow-packet-half, 6px))`;
        packetEl.dataset.stage = String(flowStage);
        // retrigger the arrival pulse (class toggling only — CSS owns the keyframes)
        packetEl.classList.remove('is-arrive');
        void packetEl.offsetWidth;
        packetEl.classList.add('is-arrive');
      }
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
          h('span', { class: 'text-xs muted' }, isReduced() ? 'الحركة متوقفة وفق تفضيل تقليل الحركة' : 'الحزمة تتقدم مرحلة كل 2.4 ثانية')),
      });
    }

    /* ---------------------------------------------------------------- */
    /* Row 3 — red risks table, alert queue                               */
    /* ---------------------------------------------------------------- */

    function redRisksCard(d) {
      const table = dataTable({
        caption: 'المخاطر الحمراء المفتوحة مرتبة تنازلياً حسب الدرجة',
        rows: d.red, rowKey: 'id', pageSize: 8, dense: true, emptyText: 'لا توجد مخاطر حمراء مفتوحة ضمن عوامل التصفية الحالية',
        onRowClick: (row) => navigate('airisks', { risk: row.id }),
        columns: [
          { key: 'code', label: 'الرمز', width: 92, mono: true },
          { key: 'title', label: 'المخاطرة', render: (r) => h('span', { class: 'semibold' }, r.title) },
          { key: 'projectId', label: 'المشروع', render: (r) => d.projectName(r.projectId), sortValue: (r) => d.projectName(r.projectId) },
          { key: 'category', label: 'المجال', render: (r) => categoryCell(psel, r.category), sortValue: (r) => categoryLabel(psel, r.category) },
          { key: 'type', label: 'النوع', render: (r) => typeChip(psel, r.type), sortValue: (r) => typeLabel(psel, r.type) },
          { key: 'score', label: 'الدرجة', align: 'center', render: (r) => h('span', { class: 'mono num semibold' }, fmt.num(num(r.score))), sortValue: (r) => num(r.score) },
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

    function dueCell(iso, now) {
      const overdue = isOverdue(iso, now);
      return h('span', { class: ['row gap-1 due-cell', overdue ? 'is-overdue' : null], title: overdue ? 'متأخر عن موعد الاستحقاق' : undefined },
        glyph(overdue ? 'critical' : 'clock', 13), h('span', {}, fmt.date(iso, { style: 'short' })), overdue ? h('span', { class: 'sr-only' }, ' — متأخر') : null);
    }

    function alertItem(a, d) {
      const critical = a.severity === 'critical' || a.queue === 'immediate';
      const tone = critical ? 'critical' : 'warning';
      const channels = Array.isArray(a.channels) ? a.channels.map((c) => CHANNEL_LABEL[c] || c).join(' · ') : '';
      const ackable = !a.acknowledged && typeof store.ackAlert === 'function';
      const trailing = h('div', { class: 'urgent-due stack gap-1' },
        h('span', {}, fmt.relative(a.sentAt)),
        a.acknowledged
          ? badge('تم الإقرار', 'good')
          : (ackable
            ? button('إقرار', { variant: 'outline', size: 'sm', onClick: () => { try { store.ackAlert(a.id, USER); toast(`تم الإقرار بالتنبيه — ${a.title}`, { tone: 'good' }); } catch (err) { toast('تعذر الإقرار بالتنبيه', { tone: 'critical' }); warnOnce('store.ackAlert', err); } } })
            : badge('بانتظار الإقرار', 'warning')));
      return h('div', { class: ['urgent-item', `tone-${tone}`, a.acknowledged ? 'is-acked' : null], role: 'listitem' },
        h('span', { class: 'urgent-icon', 'aria-hidden': 'true' }, glyph(tone, 15)),
        h('div', { class: 'urgent-text' },
          h('span', { class: 'row gap-2 wrap' }, h('span', { class: 'semibold' }, a.title || 'تنبيه'), badge(critical ? 'تصعيد فوري' : 'قياسي', critical ? 'critical' : 'neutral')),
          h('span', { class: 'urgent-sub' }, [d.projectName(a.projectId), channels].filter(Boolean).join(' · '))),
        trailing);
    }

    function alertQueueCard(d) {
      const items = d.immediate.concat(d.standard).slice(0, 8);
      const list = items.length
        ? h('div', { class: 'urgent-list', role: 'list', 'aria-label': 'قائمة التنبيهات' }, items.map((a) => alertItem(a, d)))
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
      const grid = h('div', { class: 'kpi-row pipeline-strip', role: 'list', 'aria-label': 'صحة خطوط المعالجة الخمسة' });
      (d.pipelines || []).slice(0, 5).forEach((item) => {
        const p = item && item.pipeline ? item.pipeline : item;
        const status = PIPELINE_STATUS[p.status] || { label: String(p.status || '—'), tone: 'neutral' };
        const tone = item.tone || item.health || status.tone;
        const acceptance = num(p.acceptanceRatePct);
        const tile = h('button', {
          type: 'button', class: ['tile', 'is-clickable', 'pipeline-tile', `tone-${tone}`], role: 'listitem', onClick: () => navigate('engine'),
          'aria-label': `${p.nameAr || p.name}: ${status.label} — نسبة القبول ${fmt.pct(acceptance)} — ${fmt.num(num(p.runsToday))} تشغيلاً اليوم`,
        },
        h('div', { class: 'tile-top' }, h('span', { class: 'tile-label' }, p.nameAr || p.name || pipelineLabel(psel, p.id)), h('span', { class: 'row gap-1' }, liveDot(tone), badge(status.label, tone))),
        h('div', { class: 'tile-value-row' }, h('span', { class: 'tile-value num' }, fmt.pct(acceptance)), h('span', { class: 'tile-unit' }, 'نسبة القبول')),
        h('div', { class: 'tile-bottom' },
          h('span', { class: 'text-xs muted' }, `${fmt.num(num(p.runsToday))} تشغيلاً اليوم`),
          h('span', { class: 'text-xs muted' }, `آخر تشغيل ${fmt.relative(p.lastRun)}`)),
        h('span', { class: 'tile-hint mono' }, [p.version, isNum(p.avgLatencyMs) ? `${fmt.num(p.avgLatencyMs)} ms` : null].filter(Boolean).join(' · ')));
        grid.appendChild(tile);
      });
      return card({
        code: 'PLT-01', title: 'صحة خطوط المعالجة', subtitle: 'خمسة نماذج على طبقة تقييم وتفسير مشتركة — الحالة، آخر تشغيل، تشغيلات اليوم، ونسبة قبول التوصيات (الإنسان في الحلقة)',
        className: 'col-span-12',
        actions: [button('محرك الذكاء الاصطناعي', { variant: 'ghost', size: 'sm', icon: 'sliders', onClick: () => navigate('engine') })],
        body: grid,
      });
    }

    function dataQualityCard(d) {
      const v = d.validation;
      const pass = num(v.passRatePct);
      const tone = pass >= 97 ? 'good' : pass >= 90 ? 'warning' : 'critical';
      const meter = chartOr('meter', () => charts.meter({ value: pass, max: 100, label: 'نسبة اجتياز التحقق', thresholds: [{ upTo: 90, tone: 'critical' }, { upTo: 97, tone: 'warning' }, { upTo: 100, tone: 'good' }], height: 10 }), () => fallbackMeter(pass, 'نسبة اجتياز التحقق', tone));
      const quarantine = h('button', {
        type: 'button', class: ['tile', 'is-clickable', num(v.quarantineOpen) ? 'tone-warning' : 'tone-good'], onClick: () => navigate('dataquality'),
        'aria-label': `${fmt.num(num(v.quarantineOpen))} سجلاً في الحجر الصحي بانتظار المعالجة — فتح جودة البيانات`,
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
      const legend = h('div', { class: 'row wrap gap-2 dist-legend', role: 'list' }, parts.map((p) => h('span', { class: 'row gap-1 text-xs', role: 'listitem' },
        p.icon ? p.icon : h('span', { class: 'legend-key is-dot', 'aria-hidden': 'true', style: { background: p.color, inlineSize: '10px', blockSize: '10px', borderRadius: '50%', display: 'inline-block' } }),
        h('span', {}, p.label), h('span', { class: 'mono num muted' }, fmt.num(num(p.value))))));
      return card({ code, title, subtitle, className: 'col-span-4', body: h('div', { class: 'stack gap-3' }, seg, legend), tableView: tableViewOf(seg) });
    }

    function typeDistributionCard(d) {
      const palette = (i) => safe('charts.paletteFor', () => charts.paletteFor(i), `var(--s${(i % 8) + 1})`);
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
          { key: 'score', label: 'الدرجة الموحدة', render: (p) => h('span', { class: 'row gap-2' }, h('span', { class: 'mono num semibold' }, fmt.num(Math.round(num(p.cons.score)))), ratingBadge(psel, p.cons.rating)), sortValue: (p) => num(p.cons.score) },
          { key: 'cpi', label: 'CPI / SPI', align: 'center', render: (p) => h('span', { class: 'stack gap-1', style: { alignItems: 'center' } }, h('span', { class: 'mono num' }, `${ratio(p.evm.CPI)} / ${ratio(p.evm.SPI)}`), p.evm.status && EVM_TONE[p.evm.status] ? badge(p.evm.status, EVM_TONE[p.evm.status]) : null), sortValue: (p) => num(p.evm.CPI) },
          { key: 'percentComplete', label: 'الإنجاز مقابل الخطة', render: (p) => {
            const actual = num(p.evm.percentComplete, num(p.percentComplete)); const planned = num(p.evm.plannedPercent, num(p.plannedPercent));
            const gap = planned - actual; const tone = gap <= 2 ? 'good' : gap <= 10 ? 'warning' : 'critical';
            return h('span', { class: 'stack gap-1' }, progress({ value: actual, max: 100, tone, label: `الإنجاز ${fmt.pct(actual)} مقابل خطة ${fmt.pct(planned)}` }), h('span', { class: 'text-xs muted mono num' }, `${fmt.pct(actual)} / ${fmt.pct(planned)}`));
          }, sortValue: (p) => num(p.evm.percentComplete, num(p.percentComplete)) },
          { key: 'redCount', label: 'أحمر', align: 'center', render: (p) => (p.redCount ? badge(fmt.num(p.redCount), 'critical') : badge(fmt.num(0), 'good')), sortValue: (p) => p.redCount },
          { key: 'next', label: 'المعلم القادم', render: (p) => (p.next
            ? h('span', { class: 'stack gap-1' }, h('span', {}, p.next.name), h('span', { class: 'text-xs muted' }, `${p.next.code || ''} · ${fmt.date(p.next.finish, { style: 'short' })}`.trim()))
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
      const state = stateOf();
      if (!psel) {
        body.appendChild(emptyState({ icon: 'radar', title: 'وحدة محددات المنصة غير محمّلة', text: 'يتطلب هذا القسم platform-selectors.js (psel) ضمن سياق العرض.' }));
        return;
      }
      if (!state.platform || !Array.isArray(state.platform.aiRisks)) {
        body.appendChild(emptyState({ icon: 'radar', title: 'بيانات المنصة غير متاحة بعد', text: 'لم تُحمَّل بيانات منصة إدارة المخاطر (state.platform). أعد تحميل الصفحة بعد اكتمال التهيئة.' }));
        return;
      }
      const d = collect();
      body.appendChild(h('div', { class: 'grid-12 cockpit-row-1' }, heroCard(d), categoryTiles(d)));
      body.appendChild(flowCard(d));
      body.appendChild(h('div', { class: 'grid-12 cockpit-row-3' }, redRisksCard(d), alertQueueCard(d)));
      body.appendChild(h('div', { class: 'grid-12 cockpit-row-3b' }, pipelineStrip(d)));
      body.appendChild(h('div', { class: 'grid-12 cockpit-row-3c' }, dataQualityCard(d), typeDistributionCard(d), ratingDistributionCard(d)));
      body.appendChild(h('div', { class: 'grid-12 cockpit-row-4' }, projectsCard(d)));
    }

    function schedule() {
      if (!alive) return;
      if (raf) cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => { raf = 0; if (alive) paint(); });
    }

    subs.push(bus.on('store:change', (payload) => {
      const path = payload && typeof payload.path === 'string' ? payload.path : '*';
      if (path.startsWith('feed')) return; // the live feed does not change anything the cockpit shows
      schedule();
    }));
    subs.push(bus.on('filters:change', schedule));
    subs.push(bus.on('settings:change', () => { schedule(); startFlow(); }));

    paint();
    startFlow();

    return () => {
      alive = false;
      if (raf) cancelAnimationFrame(raf);
      stopFlow();
      document.removeEventListener('visibilitychange', onVisibility);
      subs.splice(0).forEach((unsub) => { try { unsub(); } catch { /* ignore */ } });
      flowEl = null; packetEl = null;
    };
  },
};
