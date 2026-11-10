/**
 * Biltix Risk AI — view: مخاطر الجدول الزمني (js/views/schedule.js) — DOM-03
 *
 * Schedule-model domain of the Risk Cockpit: critical-path slippage, Monte Carlo
 * finish-date distribution (P50/P80/P90), resource utilisation, 7-day weather delay
 * risk, regulatory approvals with escalation, subcontractor performance, the open AI
 * risks of the `schedule` category and the pipeline's KRI matrix. Scoped by the
 * global project filter; per-project widgets fall back to S1 when "all" is selected
 * and say so in their subtitle.
 *
 * Contract: docs/ARCHITECTURE.md Part A §4–§5, Part B §B2–B4, §B8 class names
 * (.rating, .type-chip, .kri-table, .evidence) and §B9 item 7. Data reaches the DOM
 * only through textContent / components.h; all dependencies arrive through `ctx`.
 */

const DAY_MS = 86_400_000;
const CATEGORY = 'schedule';
const PIPELINE_ID = 'schedule-model';
const FALLBACK_PROJECT = 'S1';
const APPROVAL_RISK_RATIO = 0.8;
const HIGH_DELAY_PROB = 0.5;

const RATING_META = {
  red: { label: 'أحمر', tone: 'critical', hint: 'حرج — تدخل فوري' },
  yellow: { label: 'أصفر', tone: 'warning', hint: 'مرتفع — مراقبة' },
  green: { label: 'أخضر', tone: 'good', hint: 'ضمن حدود التحمل' },
};
const TYPE_META = {
  Financial: { label: 'مالي', icon: 'chart' },
  Safety: { label: 'سلامة', icon: 'helmet' },
  Delay: { label: 'تأخير', icon: 'calendar' },
  Conflict: { label: 'نزاع', icon: 'shield-alert' },
};
const RISK_STATUS_TONE = { 'مكتشف': 'neutral', 'تنبيه': 'warning', 'مهمة مُسندة': 'brand', 'قيد المعالجة': 'accent', 'مغلق': 'good', 'مُتجاوز': 'neutral' };
const APPROVAL_STATUS_TONE = { 'قيد المعالجة': 'brand', 'معتمد': 'good', 'متأخر': 'critical', 'مطلوب استكمال': 'warning' };
const DUST_TONE = { 'منخفض': 'good', 'متوسط': 'warning', 'عالٍ': 'critical' };
const CLOSED_RISK = new Set(['مغلق', 'مُتجاوز']);
const OPEN_TASK = new Set(['جديدة', 'قيد التنفيذ', 'متأخرة']);

const STYLE_ID = 'view-schedule-style';
const STYLE_TEXT = `/* grid rows align to the top: unlayered so it wins over the stretch default in css/base.css */
.view-schedule .grid-12 { align-items: start; }
/* compact subcontractor rows (SCH-06): no icon tile, score and gap trail the title */
.view-schedule .urgent-item.is-compact { grid-template-columns: minmax(0, 1fr) auto; gap: 2px 10px; padding-block: 8px; }
.view-schedule .urgent-item.is-compact > .urgent-icon { display: none; }
.view-schedule .urgent-item.is-compact .urgent-due { align-items: flex-end; }
@layer views {
  .view-schedule .code { font-family: var(--font-mono); font-variant-numeric: tabular-nums; unicode-bidi: isolate; }
  .view-schedule .weather-strip { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); gap: 10px; }
  .mc-timeline { position: relative; block-size: 64px; margin-block: 4px 2px; }
  .mc-timeline-track { position: absolute; inset-inline: 0; inset-block-start: 26px; block-size: 6px; border-radius: 3px; background: var(--bg-3); }
  .mc-timeline-fill { position: absolute; inset-block-start: 26px; block-size: 6px; border-radius: 3px; background: color-mix(in srgb, var(--warning) 55%, transparent); }
  .mc-mark { position: absolute; inset-block-start: 18px; transform: translateX(50%); display: flex; flex-direction: column; align-items: center; gap: 3px; font-size: 10.5px; color: var(--ink-2); }
  .mc-mark-dot { inline-size: 14px; block-size: 14px; border-radius: 50%; border: 2px solid var(--bg-1); background: var(--tone, var(--brand)); box-shadow: 0 0 0 1px var(--line); }
  .mc-mark-label { white-space: nowrap; display: flex; flex-direction: column; align-items: center; line-height: 1.3; }
  .mc-mark-label strong { color: var(--ink-1); font-family: var(--font-mono-mixed); }
  .mc-mark.is-planned { inset-block-start: 0; }
  .mc-mark.is-planned .mc-mark-dot { inline-size: 2px; block-size: 34px; border-radius: 1px; border: 0; background: var(--ink-3); box-shadow: none; }
  @media (max-width: 1279.98px) { .view-schedule .weather-strip { grid-template-columns: repeat(4, minmax(0, 1fr)); } }
  @media (max-width: 599.98px) { .view-schedule .weather-strip { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
}`;
const CODE_RE = /\b[A-Z]{1,5}-[A-Z0-9-]*\d[A-Z0-9-]*\b/g;
const SUBS_DEFAULT = 5;

/** Free text (seed titles, descriptions, rule names) → the active numeral system; Latin alphanumeric tokens (2B, P6, PN10) keep their ASCII digits (RTL-4). */
const LATIN_NUM_TOKEN = /[A-Za-z][A-Za-z0-9._-]*\d[A-Za-z0-9._-]*|\d+[A-Za-z][A-Za-z0-9._-]*/g;
function digitsIn(fmt, value) {
  const s = String(value ?? '');
  if (!fmt || typeof fmt.digits !== 'function' || !/\d/.test(s)) return s;
  let out = ''; let last = 0; let m;
  LATIN_NUM_TOKEN.lastIndex = 0;
  while ((m = LATIN_NUM_TOKEN.exec(s))) { out += fmt.digits(s.slice(last, m.index)) + m[0]; last = m.index + m[0].length; }
  return out + fmt.digits(s.slice(last));
}

const safe = (fn, fallback) => { try { const v = fn(); return v === undefined ? fallback : v; } catch { return fallback; } };
const lower = (v) => String(v ?? '').toLowerCase();
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const clamp01 = (v) => Math.max(0, Math.min(1, num(v)));
/** Codes inside plain strings (drawer subtitles, toasts): bidi-isolated with non-breaking hyphens (RTL-5). */
const codeText = (code) => `\u2068${String(code ?? '').replace(/-/g, '\u2011')}\u2069`;

function ensureStyle() {
  if (typeof document === 'undefined' || document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = STYLE_TEXT;
  document.head.appendChild(style);
}

/** UI state that survives re-renders inside one visit (module-level, no persistence). */
let kriOpen = false;
let subsExpanded = false;

export default {
  id: 'schedule',
  code: 'DOM-03',
  title: 'مخاطر الجدول الزمني',
  icon: 'calendar',

  render(container, ctx) {
    const { store, bus, fmt, charts, components, router } = ctx;
    const psel = ctx.psel || null;
    const { h, card, statTile, badge, dataTable, button, drawer, toast, emptyState, progress, svgIcon, glyph, kv } = components;

    ensureStyle();
    const root = h('section', { class: 'view view-schedule' });
    container.appendChild(root);

    let raf = 0;
    let lastData = null;
    let openDrawer = null;
    let lastNumerals = safe(() => store.state.settings.numerals, 'latn');
    let lastPlatformSettings = safe(() => JSON.stringify(store.state.settings.platform || null), 'null');

    /* ───────────────────────── primitives ───────────────────────── */

    const mono = (text, extra = null) => h('span', { class: ['mono', ...String(extra || '').split(/\s+/).filter(Boolean)], style: { fontFamily: 'var(--font-mono)', fontVariantNumeric: 'tabular-nums' } }, String(text ?? '—'));
    /** A code such as A1020 / AP-03 as an isolated LTR mono run that never breaks (RTL-5). */
    const codeSpan = (code, extra = null) => h('span', { class: ['code', 'mono', 'nowrap', ...String(extra || '').split(/\s+/).filter(Boolean)], dir: 'ltr' }, String(code ?? '—'));
    function withCodes(str) {
      const t = String(str ?? ''); const out = []; let last = 0; let m;
      CODE_RE.lastIndex = 0;
      while ((m = CODE_RE.exec(t))) { if (m.index > last) out.push(digitsIn(fmt, t.slice(last, m.index))); out.push(codeSpan(m[0])); last = m.index + m[0].length; }
      if (last < t.length) out.push(digitsIn(fmt, t.slice(last)));
      return out.length ? out : [digitsIn(fmt, t)];
    }
    const startOfToday = () => { const d = store.now ? store.now() : new Date(); d.setHours(0, 0, 0, 0); return d; };
    const daysUntil = (iso) => { const d = fmt.toDate(iso); if (!d) return null; d.setHours(0, 0, 0, 0); return Math.round((d.getTime() - startOfToday().getTime()) / DAY_MS); };
    const daysBetween = (a, b) => { const da = fmt.toDate(a); const db = fmt.toDate(b); if (!da || !db) return null; da.setHours(0, 0, 0, 0); db.setHours(0, 0, 0, 0); return Math.round((db.getTime() - da.getTime()) / DAY_MS); };
    const isoPlusDays = (days) => { const d = startOfToday(); d.setDate(d.getDate() + days); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
    const daysWord = (n) => { const a = Math.abs(n); return a === 1 ? 'يوم واحد' : a === 2 ? 'يومان' : a <= 10 ? `${fmt.num(a)} أيام` : `${fmt.num(a)} يوماً`; };

    function ratingOf(score) {
      const s = num(score);
      const r = psel && typeof psel.rating === 'function' ? safe(() => psel.rating(s), null) : null;
      if (r && RATING_META[r]) return r;
      return s >= 70 ? 'red' : s >= 40 ? 'yellow' : 'green';
    }
    function ratingTone(rating) {
      const t = psel && typeof psel.ratingTone === 'function' ? safe(() => psel.ratingTone(rating), null) : null;
      return t || RATING_META[rating].tone;
    }
    function ratingLabel(rating) {
      const l = psel && typeof psel.ratingLabel === 'function' ? safe(() => psel.ratingLabel(rating), null) : null;
      return l || RATING_META[rating].label;
    }
    function ratingBadge(score, { large = false } = {}) {
      const r = ratingOf(score);
      const b = badge(ratingLabel(r), ratingTone(r));
      b.classList.add('rating', `is-${r}`);
      if (large) b.classList.add('is-lg');
      b.title = RATING_META[r].hint;
      b.dataset.rating = r;
      return b;
    }
    function scoreCell(score, opts) {
      return h('span', { class: 'row gap-2 nowrap', style: { alignItems: 'center' } }, mono(fmt.num(num(score)), 'semibold'), ratingBadge(score, opts));
    }
    function typeChip(type) {
      const meta = TYPE_META[type] || { label: String(type || '—'), icon: 'calendar' };
      const label = psel && typeof psel.typeLabel === 'function' ? (safe(() => psel.typeLabel(type), null) || meta.label) : meta.label;
      const chip = badge(label, 'neutral', { icon: svgIcon(meta.icon, 14) });
      chip.classList.add('type-chip', `is-${lower(type) || 'unknown'}`);
      chip.dataset.type = String(type || '');
      return chip;
    }
    function statusBadge(status, map, fallback = 'neutral') { return badge(status || '—', map[status] || fallback); }
    const probTone = (p) => (p >= 0.7 ? 'critical' : p >= HIGH_DELAY_PROB ? 'serious' : p >= 0.3 ? 'warning' : 'good');
    const riskTone = (p) => (p >= 0.6 ? 'critical' : p >= 0.3 ? 'warning' : 'good');
    const rainPct = (v) => { const n = num(v); return n > 0 && n < 1 && !Number.isInteger(n) ? Math.round(n * 100) : Math.round(n); };
    const escapeRe = (x) => String(x).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    /** Whole-token match for codes/ids (so AP1 never matches AP10). */
    const hasToken = (hay, needle) => new RegExp(`(^|[^A-Za-z0-9])${escapeRe(needle)}(?![A-Za-z0-9])`, 'i').test(hay);

    /** Probability meter: charts.meter when available, components.progress otherwise — always with a visible % label. */
    function probMeter(p, label) {
      const pct = Math.round(clamp01(p) * 100);
      const tone = probTone(clamp01(p));
      let el = null;
      if (charts && typeof charts.meter === 'function') {
        // Head hidden: the % value is rendered once, by this cell, so the meter stays one line tall inside tables.
        const m = safe(() => charts.meter({ value: pct, max: 100, label: '', hideValue: true, thresholds: [{ upTo: 29, tone: 'good' }, { upTo: 49, tone: 'warning' }, { upTo: 69, tone: 'serious' }, { upTo: 100, tone: 'critical' }], height: 8 }), null);
        if (m && m.el instanceof Node) {
          el = m.el;
          el.classList.add('grow');
          const track = el.querySelector('[role="meter"]'); if (track) track.setAttribute('aria-label', label);
        }
      }
      if (!el) el = progress({ value: pct, max: 100, tone, label });
      return h('div', { class: ['progress-row', `tone-${tone}`], style: { minInlineSize: '120px' } }, el, h('span', { class: 'progress-value' }, fmt.pct(pct)));
    }
    function ratioMeter(elapsed, statutory, label) {
      const e = num(elapsed); const s = Math.max(1, num(statutory));
      const ratio = e / s;
      const tone = ratio >= 1 ? 'critical' : ratio >= APPROVAL_RISK_RATIO ? 'warning' : 'good';
      return h('div', { class: ['progress-row', `tone-${tone}`], style: { minInlineSize: '140px' } }, progress({ value: Math.min(e, s), max: s, tone, label }), h('span', { class: 'progress-value nowrap', style: { minInlineSize: '7em' } }, h('span', { class: 'num' }, fmt.num(e)), ' من ', h('span', { class: 'num' }, fmt.num(s)), ' يوماً'));
    }

    function makeChart(name, opts) {
      if (!charts || typeof charts[name] !== 'function') return null;
      try { const c = charts[name](opts); return c && c.el instanceof Node ? c : null; } catch (err) { console.warn(`[schedule] charts.${name} failed`, err); return null; }
    }
    function tableOf(chart, fallbackFn) {
      return () => {
        if (chart && typeof chart.table === 'function') { const t = safe(() => chart.table(), null); if (t instanceof Node) return t; }
        return fallbackFn ? fallbackFn() : h('table');
      };
    }
    function simpleTable(caption, headers, rows) {
      const t = h('table', { class: 'table is-dense' }, h('caption', { class: 'sr-only' }, caption));
      t.appendChild(h('thead', {}, h('tr', {}, ...headers.map((x) => h('th', { scope: 'col' }, x)))));
      const tb = h('tbody');
      rows.forEach((r) => tb.appendChild(h('tr', {}, ...r.map((c, i) => h('td', { class: i > 0 && typeof c === 'string' && /^[\d٠-٩+−-]/.test(c) ? 'num' : null }, c)))));
      t.appendChild(tb);
      return t;
    }
    function site(state, id) { return (state.sites || []).find((x) => x.id === id) || null; }
    function siteName(state, id) { const s = site(state, id); return digitsIn(fmt, s ? s.name : (id || '—')); }

    /* ───────────────────────── data ───────────────────────── */

    function collect() {
      const state = store.state;
      const filters = store.filters || { siteId: 'all', range: 30, search: '' };
      const siteId = filters.siteId && filters.siteId !== 'all' ? filters.siteId : null;
      const search = lower(filters.search).trim();
      const platform = (psel && typeof psel.platform === 'function' ? safe(() => psel.platform(state), null) : null) || state.platform || null;
      if (!platform) return { state, filters, siteId, search, platform: null };

      const projectId = siteId || FALLBACK_PROJECT;
      const inScope = (item) => !siteId || item.projectId === siteId;
      const matches = (...fields) => !search || fields.some((f) => lower(f).includes(search));

      const subById = new Map((platform.subcontractors || []).filter(Boolean).map((s) => [s.id, s]));
      const decorate = (t) => {
        const p = clamp01(t.delayProbability);
        const exp = num(t.expectedDelayDays);
        return { ...t, _p: p, _exp: exp, _weighted: Math.round(p * exp * 10) / 10, _slip: daysBetween(t.baselineFinish, t.finish), _sub: subById.get(t.subcontractorId) || null };
      };
      const tasksAll = (platform.scheduleTasks || []).filter((t) => t && inScope(t)).map(decorate);
      let critical = psel && typeof psel.criticalPathSlippage === 'function' ? safe(() => psel.criticalPathSlippage(state, filters), null) : null;
      if (!Array.isArray(critical) || !critical.every((t) => t && t.code && t.delayProbability !== undefined)) critical = tasksAll.filter((t) => t.critical);
      else critical = critical.filter((t) => inScope(t)).map(decorate);
      critical = critical.filter((t) => matches(t.code, t.name, t.wbs, t.trade, t._sub && t._sub.name)).sort((a, b) => b._weighted - a._weighted || b._p - a._p);
      const highRisk = tasksAll.filter((t) => t.critical && t._p >= HIGH_DELAY_PROB);
      const weightedDelay = Math.round(tasksAll.filter((t) => t.critical).reduce((n, t) => n + t._p * t._exp, 0));

      const project = (platform.projects || []).find((p) => p && p.id === projectId) || null;
      let mc = psel && typeof psel.monteCarlo === 'function' ? safe(() => psel.monteCarlo(state, projectId), null) : null;
      if (!mc || !Array.isArray(mc.histogram)) mc = (platform.monteCarlo && platform.monteCarlo[projectId]) || null;
      let histogram = mc && Array.isArray(mc.histogram) ? mc.histogram.map((b) => ({ days: num(b.days), prob: num(b.prob) })) : [];
      const maxProb = histogram.reduce((m, b) => Math.max(m, b.prob), 0);
      if (maxProb > 1) histogram = histogram.map((b) => ({ ...b, prob: b.prob / 100 }));
      const onTimeProb = histogram.length && histogram.some((b) => b.days <= 0) ? histogram.filter((b) => b.days <= 0).reduce((n, b) => n + b.prob, 0) : null;

      const resources = (platform.resources || []).filter((r) => r && inScope(r)).map((r) => ({ ...r, _util: num(r.utilizationPct), _gap: num(r.nextWeekGap) })).sort((a, b) => b._util - a._util);
      const overAllocated = resources.filter((r) => r._util > 100);

      const weatherAll = platform.weather && platform.weather[projectId] ? platform.weather[projectId] : null;
      const weatherDays = weatherAll && Array.isArray(weatherAll.next7) ? weatherAll.next7.slice(0, 7).map((d) => ({ ...d, _risk: clamp01(d.delayRisk) })) : [];
      const weatherHighDays = weatherDays.filter((d) => d._risk >= 0.5).length;
      const weatherSensitive = tasksAll.filter((t) => t.critical && t.weatherSensitive && (!siteId || t.projectId === projectId)).length;

      let approvals = (platform.approvals || []).filter((a) => a && inScope(a)).map((a) => ({ ...a, _ratio: num(a.elapsedDays) / Math.max(1, num(a.statutoryDays)) }));
      approvals = approvals.filter((a) => matches(a.authority, a.type)).sort((a, b) => (b.status === 'معتمد' ? -1 : 1) - (a.status === 'معتمد' ? -1 : 1) || b._ratio - a._ratio);
      let atRisk = psel && typeof psel.approvalsAtRisk === 'function' ? safe(() => psel.approvalsAtRisk(state), null) : null;
      if (!Array.isArray(atRisk)) atRisk = approvals.filter((a) => a.status !== 'معتمد' && (a._ratio >= APPROVAL_RISK_RATIO || a.status === 'متأخر'));
      else atRisk = atRisk.filter((a) => a && inScope(a) && a.status !== 'معتمد');

      const subcontractors = (platform.subcontractors || []).filter((s) => s && inScope(s)).map((s) => ({ ...s, _gap: Math.round((num(s.actualProgressPct) - num(s.plannedProgressPct)) * 10) / 10 })).sort((a, b) => a._gap - b._gap);

      let openRisks = psel && typeof psel.openAiRisks === 'function' ? safe(() => psel.openAiRisks(state, filters), null) : null;
      if (!Array.isArray(openRisks)) openRisks = (platform.aiRisks || []).filter((r) => r && !CLOSED_RISK.has(r.status) && inScope(r));
      const domainRisks = openRisks.filter((r) => r && r.category === CATEGORY).sort((a, b) => num(b.score) - num(a.score));

      let categoryScore = null;
      const scores = psel && typeof psel.categoryScores === 'function' ? safe(() => psel.categoryScores(state, filters), null) : null;
      if (Array.isArray(scores)) categoryScore = scores.find((s) => s && s.category === CATEGORY) || null;
      if (!categoryScore) {
        const vals = domainRisks.map((r) => num(r.score));
        const score = vals.length ? Math.round(0.5 * Math.max(...vals) + 0.5 * (vals.reduce((a, b) => a + b, 0) / vals.length)) : 0;
        categoryScore = { category: CATEGORY, score, rating: ratingOf(score), open: vals.length, red: vals.filter((v) => v >= 70).length, trend: [] };
      }

      const pipeline = (platform.pipelines || []).find((p) => p && p.id === PIPELINE_ID) || null;

      return {
        state, filters, siteId, search, platform, projectId, project,
        tasksAll, critical, highRisk, weightedDelay,
        mc, histogram, onTimeProb,
        resources, overAllocated,
        weatherDays, weatherHighDays, weatherSensitive,
        approvals, atRisk, subcontractors,
        domainRisks, categoryScore, pipeline,
      };
    }

    /* ───────────────────────── actions ───────────────────────── */

    function relatedRisks(platform, { projectId, kind, needles }) {
      const ns = needles.map(lower).filter(Boolean);
      const codeLike = (n) => /^[a-z]{1,4}\d/i.test(n);
      return (platform.aiRisks || []).filter((r) => r && r.category === CATEGORY && !CLOSED_RISK.has(r.status) && r.projectId === projectId && (!kind || !r.evidence || !r.evidence.kind || r.evidence.kind === kind)
        && ns.some((n) => { const hay = lower(`${r.evidence && r.evidence.ref} ${r.evidence && r.evidence.excerpt} ${r.title} ${r.driverExplanation}`); return codeLike(n) ? hasToken(hay, n) : hay.includes(n); }));
    }

    function addTaskSafely(payload) {
      if (typeof store.addTask !== 'function') { toast('إنشاء المهام غير متاح حالياً — وحدة مهام المنصة لم تُحمَّل بعد.', { tone: 'warning' }); return null; }
      try { return store.addTask(payload); } catch (err) { console.warn('[schedule] addTask failed', err); toast('تعذر إنشاء المهمة. حاول مرة أخرى.', { tone: 'critical' }); return null; }
    }

    function escalateApproval(data, approval) {
      const risk = relatedRisks(data.platform, { projectId: approval.projectId, kind: 'approval', needles: [approval.id, approval.type, approval.authority] })[0]
        || relatedRisks(data.platform, { projectId: approval.projectId, kind: null, needles: [approval.authority] })[0] || null;
      const title = `تصعيد موافقة تنظيمية — ${approval.authority}: ${approval.type}`;
      const dup = (data.platform.tasks || []).find((t) => t && OPEN_TASK.has(t.status) && ((risk && t.riskId === risk.id) || t.title === title));
      if (dup) { toast(`توجد مهمة تصعيد مفتوحة بالفعل (${dup.code || dup.id}).`, { tone: 'neutral', action: { label: 'فتح المهام', onClick: () => router.navigate('tasks') } }); return dup; }
      const s = site(data.state, approval.projectId);
      const task = addTaskSafely({
        title,
        projectId: approval.projectId,
        riskId: risk ? risk.id : null,
        owner: (s && s.manager) || 'مدير المشروع',
        dueDate: isoPlusDays(approval.status === 'متأخر' ? 2 : 5),
        status: 'جديدة',
        source: 'manual',
        description: `${fmt.num(num(approval.elapsedDays))} يوماً منقضية من ${fmt.num(num(approval.statutoryDays))} يوماً نظامية · الحالة: ${approval.status} · قُدِّم في ${fmt.date(approval.submittedAt)}`,
        origin: { view: 'schedule', approvalId: approval.id },
      });
      if (!task) return null;
      if (typeof store.update === 'function') {
        store.update((state) => {
          const p = state.platform; if (!p) return 'platform';
          const a = (p.approvals || []).find((x) => x && x.id === approval.id);
          if (a) { a.escalated = true; a.taskId = task.id; }
          return `platform.approvals.${approval.id}`;
        });
      }
      const code = task.code || task.id;
      toast(`تم تصعيد موافقة ${approval.authority} — المهمة ${code}${risk ? ` · مرتبطة بالمخاطرة ${risk.code}` : ''}.`, { tone: 'good', action: { label: 'فتح المهام', onClick: () => router.navigate('tasks') } });
      return task;
    }

    function createTaskForActivity(data, t) {
      const risk = relatedRisks(data.platform, { projectId: t.projectId, kind: 'task', needles: [t.code, t.name] })[0] || null;
      const title = `معالجة انزلاق النشاط الحرج ${t.code} — ${t.name}`;
      const dup = (data.platform.tasks || []).find((x) => x && OPEN_TASK.has(x.status) && ((risk && x.riskId === risk.id) || x.title === title));
      if (dup) { toast(`توجد مهمة مفتوحة بالفعل (${dup.code || dup.id}) لهذا النشاط.`, { tone: 'neutral', action: { label: 'فتح المهام', onClick: () => router.navigate('tasks') } }); return dup; }
      const s = site(data.state, t.projectId);
      const task = addTaskSafely({
        title,
        projectId: t.projectId,
        riskId: risk ? risk.id : null,
        owner: (s && s.manager) || 'مدير المشروع',
        dueDate: isoPlusDays(t._p >= 0.7 ? 3 : 7),
        status: 'جديدة',
        source: 'manual',
        description: `احتمال التأخير ${fmt.pct(Math.round(t._p * 100))} · التأخير المتوقع ${daysWord(t._exp)} · الفائض ${fmt.num(num(t.floatDays))} يوم${t._sub ? ` · المقاول: ${t._sub.name}` : ''}`,
        origin: { view: 'schedule', taskCode: t.code },
      });
      if (task) toast(`أُنشئت مهمة المعالجة ${task.code || task.id}${risk ? ` — مرتبطة بالمخاطرة ${risk.code}` : ''}.`, { tone: 'good', action: { label: 'فتح المهام', onClick: () => router.navigate('tasks') } });
      return task;
    }

    /* ───────────────────────── drawer ───────────────────────── */

    function openActivity(data, t) {
      if (!t) return;
      if (openDrawer) { try { openDrawer.close(); } catch { /* ignore */ } openDrawer = null; }
      const related = relatedRisks(data.platform, { projectId: t.projectId, kind: null, needles: [t.code, t.name] });
      const weather = data.weatherDays.length && t.weatherSensitive && t.projectId === data.projectId ? data.weatherDays : [];
      const slip = t._slip;
      const body = h('div', { class: 'stack gap-4' },
        h('section', { class: 'drawer-section' },
          h('div', { class: 'row between wrap gap-2', style: { marginBlockEnd: '10px' } },
            h('div', { class: 'row gap-2 wrap', style: { alignItems: 'center' } }, t.critical ? badge('على المسار الحرج', 'critical') : badge('خارج المسار الحرج', 'neutral'), t.weatherSensitive ? badge('حساس للطقس', 'warning', { icon: svgIcon('sun', 12) }) : null, badge(t.trade || '—', 'neutral')),
            h('div', { class: 'row gap-2', style: { alignItems: 'center' } }, h('span', { class: 'text-xs muted' }, 'احتمال التأخير'), probMeter(t._p, `احتمال تأخير ${t.code}`)),
          ),
          kv([
            ['المشروع', siteName(data.state, t.projectId)],
            ['حزمة العمل (WBS)', codeSpan(t.wbs || '—')],
            ['البداية', fmt.date(t.start)],
            ['النهاية المتوقعة', h('span', { class: 'row gap-2 wrap', style: { alignItems: 'center' } }, fmt.date(t.finish), slip !== null && slip !== 0 ? badge(slip > 0 ? `انزلاق ${daysWord(slip)}` : `مبكر ${daysWord(slip)}`, slip > 0 ? (slip > 14 ? 'critical' : 'warning') : 'good') : badge('مطابق لخط الأساس', 'good'))],
            ['نهاية خط الأساس', fmt.date(t.baselineFinish)],
            ['الفائض (Float)', h('span', { class: num(t.floatDays) <= 0 ? 'tone-critical' : null }, `${fmt.num(num(t.floatDays))} يوم${num(t.floatDays) <= 0 ? ' — لا هامش' : ''}`)],
            ['نسبة الإنجاز', h('div', { class: 'progress-row' }, progress({ value: num(t.percentComplete), max: 100, tone: 'brand', label: 'نسبة الإنجاز' }), h('span', { class: 'progress-value' }, fmt.pct(num(t.percentComplete))))],
            ['التأخير المتوقع', `${daysWord(t._exp)} (مرجّح: ${fmt.num(t._weighted, { maximumFractionDigits: 1 })} يوم)`],
            ['مقاول الباطن', t._sub ? h('span', { class: 'row gap-2 wrap', style: { alignItems: 'center' } }, t._sub.name, badge(`بطاقة الأداء ${fmt.num(num(t._sub.scorecard))}`, num(t._sub.scorecard) >= 80 ? 'good' : num(t._sub.scorecard) >= 60 ? 'warning' : 'critical')) : '—'],
          ]),
        ),
        weather.length ? h('section', { class: 'drawer-section' },
          h('h3', { class: 'drawer-section-title' }, `أثر الطقس خلال ${fmt.num(7)} أيام`),
          h('div', { class: 'tone-legend' }, ...weather.map((d) => h('span', { class: ['tone-legend-item', `tone-${riskTone(d._risk)}`] }, glyph(riskTone(d._risk), 12), h('span', {}, `${fmt.dayName(d.date)} ${fmt.pct(Math.round(d._risk * 100))}`)))),
        ) : null,
        h('section', { class: 'drawer-section' },
          h('h3', { class: 'drawer-section-title' }, `المخاطر الذكية المرتبطة (${fmt.num(related.length)})`),
          related.length
            ? h('ul', { class: 'urgent-list' }, ...related.map((r) => h('li', { class: 'urgent-item' },
              h('span', { class: 'urgent-icon' }, svgIcon('shield-alert', 15)),
              h('div', { class: 'urgent-text' }, h('span', { class: 'row gap-2 wrap', style: { alignItems: 'center' } }, codeSpan(r.code), h('span', {}, ...withCodes(r.title))), h('span', { class: 'urgent-sub' }, `${r.owner || 'بدون مالك'} · ${r.status}`)),
              h('div', { class: 'urgent-due' }, scoreCell(r.score), button('فتح', { variant: 'ghost', size: 'sm', onClick: () => { if (openDrawer) openDrawer.close(); router.navigate('airisks', { risk: r.id }); } })),
            )))
            : h('p', { class: 'text-sm muted' }, 'لم يرصد المحرك مخاطر مفتوحة مرتبطة بهذا النشاط.'),
        ),
      );
      openDrawer = drawer({
        title: digitsIn(fmt, t.name),
        subtitle: `${codeText(t.code)} · ${siteName(data.state, t.projectId)}`,
        body, size: 'lg',
        actions: [
          { label: 'إنشاء مهمة معالجة', variant: 'primary', icon: svgIcon('calendar', 16), closes: false, onClick: () => { createTaskForActivity(data, t); return false; } },
          { label: 'إغلاق', variant: 'ghost' },
        ],
        onClose: () => { openDrawer = null; },
      });
      openDrawer.open();
    }

    /* ───────────────────────── sections ───────────────────────── */

    function scopeLabel(data) { return data.siteId ? siteName(data.state, data.siteId) : 'جميع المشاريع'; }
    function projectSubtitle(data, text) {
      const name = siteName(data.state, data.projectId);
      return data.siteId ? `${name} — ${text}` : `${name} (المشروع الافتراضي عند اختيار «جميع المشاريع») — ${text}`;
    }

    function buildHead(data) {
      const cs = data.categoryScore;
      const pill = cs ? h('div', { class: 'row gap-2', style: { alignItems: 'center' }, title: `درجة مجال الجدول الزمني = ${fmt.num(0.5, { maximumFractionDigits: 1 })} × أعلى درجة مفتوحة + ${fmt.num(0.5, { maximumFractionDigits: 1 })} × متوسط الدرجات المفتوحة` },
        h('span', { class: 'text-xs muted' }, 'درجة المجال'), mono(fmt.num(num(cs.score)), 'text-lg semibold'), ratingBadge(cs.score)) : null;
      return h('div', { class: 'view-head' },
        h('div', { class: 'view-head-text' },
          h('span', { class: 'code-tag' }, 'DOM-03'),
          h('h1', { tabindex: '-1' }, 'مخاطر الجدول الزمني'),
          h('p', { class: 'view-lead' }, `نموذج الجدول الزمني (Schedule Model) لـ${scopeLabel(data)}: احتمالات تأخير الأنشطة الحرجة، محاكاة مونت كارلو لتاريخ الإنجاز، استغلال الموارد، أثر الطقس، الموافقات التنظيمية وأداء مقاولي الباطن — بالتكامل مع Primavera P6.`),
        ),
        h('div', { class: 'view-actions' },
          pill,
          button('سجل المخاطر الذكي', { variant: 'outline', size: 'sm', icon: svgIcon('shield-alert', 15), onClick: () => router.navigate('airisks', { category: CATEGORY }) }),
        ),
      );
    }

    function buildKpis(data) {
      const cs = data.categoryScore;
      const spark = cs && Array.isArray(cs.trend) && cs.trend.length > 1 ? makeChart('sparkline', { values: cs.trend, width: 96, height: 28, color: 'var(--ink-3)', accentLast: true }) : null;
      const p80 = data.mc && data.mc.p80 ? fmt.date(data.mc.p80, { style: 'short' }) : '—';
      const plannedFinish = (data.mc && data.mc.plannedFinish) || (data.project ? data.project.plannedFinish : null);
      const p80Slip = data.mc && plannedFinish ? daysBetween(plannedFinish, data.mc.p80) : null;
      const criticalCount = data.tasksAll.filter((t) => t.critical).length;
      return h('div', { class: 'kpi-row' },
        statTile({ label: 'درجة مجال الجدول الزمني', value: num(cs.score), unit: `/ ${fmt.num(100)}`, tone: ratingTone(ratingOf(cs.score)), icon: svgIcon('calendar', 18), spark, hint: `${fmt.num(cs.open || 0)} مخاطر مفتوحة · ${fmt.num(cs.red || 0)} حمراء — ${RATING_META[ratingOf(cs.score)].hint}` }),
        statTile({ label: 'أنشطة حرجة معرّضة للتأخير', value: data.highRisk.length, tone: data.highRisk.length ? 'critical' : 'good', icon: glyph(data.highRisk.length ? 'critical' : 'good', 18), hint: `احتمال تأخير ${fmt.pct(HIGH_DELAY_PROB * 100)} فأكثر من أصل ${fmt.num(criticalCount)} نشاطاً حرجاً`, onClick: () => { const t = root.querySelector('[data-section="critical"]'); if (t) t.scrollIntoView({ behavior: 'smooth', block: 'start' }); } }),
        statTile({ label: 'التأخير المرجّح على المسار الحرج', value: data.weightedDelay, unit: 'يوم', tone: data.weightedDelay > 30 ? 'critical' : data.weightedDelay > 10 ? 'warning' : 'good', icon: glyph('clock', 18), hint: `مجموع (احتمال التأخير × الأيام المتوقعة) للأنشطة الحرجة — ${data.siteId ? siteName(data.state, data.siteId) : 'عبر المشاريع الستة مجتمعة'}` }),
        statTile({ label: `تاريخ الإنجاز P80 — ${site(data.state, data.projectId) ? site(data.state, data.projectId).code : data.projectId}`, value: p80, tone: p80Slip === null ? null : p80Slip > 30 ? 'critical' : p80Slip > 0 ? 'warning' : 'good', icon: svgIcon('calendar', 18), hint: p80Slip === null ? `بثقة ${fmt.pct(80)} وفق محاكاة مونت كارلو` : p80Slip > 0 ? `يتجاوز الموعد المخطط بـ${daysWord(p80Slip)} (بثقة ${fmt.pct(80)})` : `ضمن الموعد المخطط بثقة ${fmt.pct(80)}` }),
        statTile({ label: 'موافقات تنظيمية معرّضة للخطر', value: data.atRisk.length, tone: data.atRisk.some((a) => a.status === 'متأخر') ? 'critical' : data.atRisk.length ? 'warning' : 'good', icon: glyph(data.atRisk.length ? 'warning' : 'good', 18), hint: `تجاوزت ${fmt.pct(APPROVAL_RISK_RATIO * 100)} من المدة النظامية أو متأخرة`, onClick: () => { const t = root.querySelector('[data-section="approvals"]'); if (t) t.scrollIntoView({ behavior: 'smooth', block: 'start' }); } }),
        statTile({ label: 'موارد فوق التخصيص', value: data.overAllocated.length, tone: data.overAllocated.length ? 'serious' : 'good', icon: svgIcon('body', 18), hint: data.overAllocated.length ? data.overAllocated.slice(0, 3).map((r) => `${r.trade} ${fmt.pct(r._util)}`).join(' · ') : 'جميع الحرف ضمن الطاقة المتاحة' }),
      );
    }

    function buildCriticalCard(data) {
      const rows = data.critical;
      const table = dataTable({
        caption: 'انزلاق المسار الحرج — الأنشطة الحرجة مرتبة حسب التأخير المرجّح',
        pageSize: 6, rowKey: 'id', stickyFirst: true,
        emptyText: data.search ? 'لا توجد أنشطة مطابقة للبحث' : 'لا توجد أنشطة حرجة ضمن هذا النطاق',
        onRowClick: (r) => openActivity(data, r),
        initialSort: { key: '_weighted', dir: 'desc' },
        columns: [
          { key: 'code', label: 'الرمز', width: 96, priority: 'high', render: (r) => codeSpan(r.code) },
          { key: 'name', label: 'النشاط', priority: 'high', render: (r) => h('div', { class: 'stack gap-1' },
            h('span', { class: 'semibold' }, digitsIn(fmt, r.name), r.weatherSensitive ? h('span', { title: 'حساس للطقس', role: 'img', 'aria-label': 'حساس للطقس', style: { display: 'inline-flex', verticalAlign: 'middle', marginInlineStart: '6px', color: 'var(--warning)' } }, svgIcon('sun', 13)) : null),
            h('span', { class: 'text-xs muted row gap-2 wrap', style: { alignItems: 'center' } }, codeSpan(r.wbs || '—'), h('span', {}, r.trade || ''), h('span', {}, siteName(data.state, r.projectId)), r._sub ? h('span', {}, r._sub.name) : null)) },
          { key: 'finish', label: 'النهاية مقابل خط الأساس', priority: 'medium', render: (r) => h('div', { class: 'stack gap-1' }, h('span', { class: 'nowrap' }, fmt.date(r.finish, { style: 'short' })), r._slip !== null && r._slip !== 0 ? badge(r._slip > 0 ? `انزلاق ${daysWord(r._slip)}` : `مبكر ${daysWord(r._slip)}`, r._slip > 14 ? 'critical' : r._slip > 0 ? 'warning' : 'good') : badge('مطابق', 'good')), sortValue: (r) => r._slip ?? 0 },
          { key: '_p', label: 'احتمال التأخير / الفائض', priority: 'high', render: (r) => h('div', { class: 'stack gap-1' }, probMeter(r._p, `احتمال تأخير ${r.code}`), h('span', { class: ['text-xs', 'nowrap', num(r.floatDays) <= 0 ? 'is-overdue semibold' : 'muted'] }, 'الفائض ', h('span', { class: 'num' }, fmt.num(num(r.floatDays))), ' يوماً')), sortValue: (r) => r._p },
          { key: '_exp', label: 'التأخير المتوقع', align: 'end', priority: 'medium', render: (r) => h('div', { class: 'stack gap-1', style: { alignItems: 'flex-end' } }, h('span', { class: 'nowrap' }, h('span', { class: 'mono num' }, fmt.num(r._exp)), ' يوماً'), h('span', { class: 'text-xs muted nowrap' }, 'مرجّح ', h('span', { class: 'num' }, fmt.num(r._weighted, { maximumFractionDigits: 1 })))), sortValue: (r) => r._exp },
        ],
        rows,
      });
      const el = card({
        code: 'SCH-01', title: 'انزلاق المسار الحرج', className: 'col-span-12',
        subtitle: `${fmt.num(rows.length)} نشاطاً حرجاً — مرتبة حسب (احتمال التأخير × الأيام المتوقعة) · السطر الثاني: WBS · الحرفة · المشروع · مقاول الباطن`,
        body: table.el,
      });
      el.dataset.section = 'critical';
      return el;
    }

    function buildMonteCarloCard(data) {
      const mc = data.mc;
      if (!mc) return card({ code: 'SCH-02', title: 'محاكاة مونت كارلو لتاريخ الإنجاز', className: 'col-span-6', subtitle: projectSubtitle(data, 'لا توجد نتائج محاكاة'), body: emptyState({ title: 'لا تتوفر نتائج محاكاة لهذا المشروع' }) });
      const items = data.histogram.map((b) => ({ id: String(b.days), label: fmt.signed(b.days), value: b.prob }));
      const chart = items.length ? makeChart('barChart', {
        items, horizontal: false, sorted: false, height: 200, valueFormat: (v) => fmt.pct(v * 100, 1), color: 'var(--s1)', showValues: false, maxBars: Math.max(12, items.length),
        ariaLabel: 'توزيع احتمالات أيام التأخير عن الموعد المخطط وفق محاكاة مونت كارلو',
      }) : null;
      const fallback = () => simpleTable('توزيع مونت كارلو', ['الانحراف عن الموعد (يوم)', 'الاحتمال'], data.histogram.map((b) => [fmt.signed(b.days), fmt.pct(b.prob * 100, 1)]));
      const planned = (mc && mc.plannedFinish) || (data.project ? data.project.plannedFinish : null);
      const fact = (label, iso, pct) => {
        const slip = planned ? daysBetween(planned, iso) : null;
        const tone = slip === null ? null : slip > 30 ? 'critical' : slip > 0 ? 'warning' : 'good';
        return h('div', { class: ['fact', tone ? `tone-${tone}` : null] },
          h('span', { class: 'fact-label' }, `${label} · ثقة ${fmt.pct(pct)}`),
          h('span', { class: 'fact-value', style: { fontSize: 'var(--fs-lg)' } }, fmt.date(iso, { style: 'short' })),
          slip !== null ? h('span', { class: ['text-xs', `tone-${tone}`], style: { color: 'var(--tone-ink)' } }, slip > 0 ? `${daysWord(slip)} بعد المخطط` : slip < 0 ? `${daysWord(slip)} قبل المخطط` : 'في الموعد المخطط') : null,
        );
      };
      /** Finish-date timeline: planned finish as a marker line, P50 / P80 / P90 as dots along a scaled track. */
      const timeline = (() => {
        const points = [['P50', mc.p50, 'var(--good)'], ['P80', mc.p80, 'var(--warning)'], ['P90', mc.p90, 'var(--critical)']].map(([k, iso, tone]) => ({ k, d: fmt.toDate(iso), tone })).filter((x) => x.d);
        const plannedDate = planned ? fmt.toDate(planned) : null;
        if (points.length < 2) return null;
        const all = points.map((x) => x.d.getTime()).concat(plannedDate ? [plannedDate.getTime()] : []);
        const lo = Math.min(...all); const hi = Math.max(...all);
        const span = Math.max(DAY_MS, hi - lo);
        const start = lo - span * 0.08; const total = span * 1.16;
        const at = (t) => `${(((t - start) / total) * 100).toFixed(2)}%`;
        const first = points[0].d.getTime(); const last = points[points.length - 1].d.getTime();
        const el = h('div', { class: 'mc-timeline', role: 'img', 'aria-label': `خط زمني لتاريخ الإنجاز: ${points.map((x) => `${x.k} ${fmt.date(x.d, { style: 'short' })}`).join('، ')}${plannedDate ? ` — المخطط ${fmt.date(plannedDate, { style: 'short' })}` : ''}` },
          h('div', { class: 'mc-timeline-track' }),
          h('div', { class: 'mc-timeline-fill', style: { insetInlineStart: at(first), inlineSize: `${(((last - first) / total) * 100).toFixed(2)}%` } }),
          plannedDate ? h('div', { class: 'mc-mark is-planned', style: { insetInlineStart: at(plannedDate.getTime()) } }, h('span', { class: 'mc-mark-dot' }), h('span', { class: 'mc-mark-label' }, h('span', {}, 'المخطط'), h('strong', {}, fmt.date(plannedDate, { style: 'short' })))) : null,
          ...points.map((x) => h('div', { class: 'mc-mark', style: { insetInlineStart: at(x.d.getTime()), '--tone': x.tone } }, h('span', { class: 'mc-mark-dot' }), h('span', { class: 'mc-mark-label' }, h('strong', { lang: 'en', dir: 'ltr' }, x.k), h('span', {}, fmt.date(x.d, { style: 'short' }))))),
        );
        return el;
      })();
      const body = h('div', { class: 'stack gap-3' },
        h('div', { class: 'hero-facts' }, fact('P50', mc.p50, 50), fact('P80', mc.p80, 80), fact('P90', mc.p90, 90)),
        timeline,
        chart ? chart.el : fallback(),
        h('div', { class: 'row between wrap gap-2 text-xs muted' },
          h('span', {}, `المحور الأفقي: الانحراف بالأيام عن الموعد المخطط${planned ? ` (${fmt.date(planned, { style: 'short' })})` : ''}؛ العمودي: الاحتمال`),
          data.onTimeProb !== null ? h('span', { class: `tone-${data.onTimeProb >= 0.5 ? 'good' : data.onTimeProb >= 0.25 ? 'warning' : 'critical'}`, style: { color: 'var(--tone-ink)', fontWeight: 600 } }, `احتمال الالتزام بالموعد: ${fmt.pct(Math.round(data.onTimeProb * 100))}`) : null,
        ),
      );
      return card({
        code: 'SCH-02', title: 'محاكاة مونت كارلو لتاريخ الإنجاز', className: 'col-span-6',
        subtitle: projectSubtitle(data, `${fmt.num(num(mc.runs) || 5000)} محاكاة`),
        body, tableView: tableOf(chart, fallback),
      });
    }

    function buildResourcesCard(data) {
      const items = data.resources.slice(0, 12).map((r) => ({ id: r.id, label: data.siteId ? r.trade : `${r.trade} — ${site(data.state, r.projectId) ? site(data.state, r.projectId).code : r.projectId}`, value: r._util, color: r._util > 100 ? 'var(--critical)' : 'var(--s1)' }));
      const chart = items.length ? makeChart('barChart', {
        items, horizontal: true, height: Math.max(220, items.length * 30 + 24), valueFormat: (v) => fmt.pct(v), color: 'var(--s1)', showValues: true, maxBars: 12,
        ariaLabel: 'نسبة استغلال الموارد حسب الحرفة، مرتبة تنازلياً؛ الأحمر يدل على تجاوز التخصيص',
      }) : null;
      const fallback = () => simpleTable('استغلال الموارد', ['الحرفة', 'المشروع', 'المخطط', 'المتاح', 'الاستغلال', 'فجوة الأسبوع القادم'], data.resources.map((r) => [r.trade, siteName(data.state, r.projectId), fmt.num(num(r.planned)), fmt.num(num(r.available)), fmt.pct(r._util), fmt.signed(r._gap)]));
      const gaps = data.resources.filter((r) => r._gap < 0).sort((a, b) => a._gap - b._gap).slice(0, 5);
      const body = h('div', { class: 'stack gap-3' },
        h('div', { class: 'tone-legend' },
          h('span', { class: 'tone-legend-item' }, h('span', { class: 'legend-key', style: { background: 'var(--s1)', inlineSize: '10px', blockSize: '10px', borderRadius: '2px', display: 'inline-block' } }), h('span', {}, 'ضمن الطاقة المتاحة')),
          h('span', { class: 'tone-legend-item tone-critical' }, glyph('critical', 12), h('span', {}, `فوق التخصيص (أكثر من ${fmt.pct(100)})`)),
        ),
        chart ? chart.el : fallback(),
        gaps.length ? h('ul', { class: 'urgent-list', style: gaps.length > 2 ? { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '8px' } : undefined }, ...gaps.map((r) => h('li', { class: 'urgent-item tone-warning' },
          h('span', { class: 'urgent-icon' }, glyph('warning', 15)),
          h('div', { class: 'urgent-text' }, h('span', {}, `${r.trade} — نقص ${fmt.num(Math.abs(r._gap))} ${Math.abs(r._gap) === 1 ? 'عامل' : Math.abs(r._gap) === 2 ? 'عاملين' : Math.abs(r._gap) <= 10 ? 'عمال' : 'عاملاً'} الأسبوع القادم`), h('span', { class: 'urgent-sub' }, `${siteName(data.state, r.projectId)} · مخطط ${fmt.num(num(r.planned))} / متاح ${fmt.num(num(r.available))}`)),
          h('div', { class: 'urgent-due' }, mono(fmt.pct(r._util), 'num')),
        ))) : h('p', { class: 'text-xs muted' }, 'لا توجد فجوات موارد متوقعة الأسبوع القادم.'),
      );
      return card({
        code: 'SCH-03', title: 'استغلال الموارد حسب الحرفة', className: 'col-span-6',
        subtitle: `${fmt.num(data.resources.length)} حرفة — ${fmt.num(data.overAllocated.length)} فوق التخصيص`,
        body: items.length ? body : emptyState({ title: 'لا توجد بيانات موارد ضمن النطاق' }), tableView: tableOf(chart, fallback),
      });
    }

    function buildWeatherCard(data) {
      const days = data.weatherDays;
      const dayCard = (d) => {
        const tone = riskTone(d._risk);
        const pct = Math.round(d._risk * 100);
        return h('div', { class: ['fact', `tone-${tone}`], role: 'listitem', style: { gap: '6px' } },
          h('div', { class: 'row between gap-2' }, h('span', { class: 'semibold text-sm' }, fmt.dayName(d.date)), h('span', { class: 'text-xs muted' }, fmt.date(d.date, { style: 'short' }))),
          h('div', { class: 'row between gap-2 text-sm' }, h('span', { class: 'muted' }, 'الحرارة'), mono(`${fmt.num(num(d.tempMax))}°`)),
          h('div', { class: 'row between gap-2 text-sm' }, h('span', { class: 'muted' }, 'الرياح'), mono(`${fmt.num(num(d.windKmh))} كم/س`)),
          h('div', { class: 'row between gap-2 text-sm' }, h('span', { class: 'muted' }, 'الأمطار'), mono(fmt.pct(rainPct(d.rainProb)))),
          h('div', { class: 'row between gap-2 text-sm', style: { alignItems: 'center' } }, h('span', { class: 'muted' }, 'الغبار'), statusBadge(d.dustRisk, DUST_TONE)),
          h('div', { class: 'stack gap-1', style: { marginBlockStart: '4px' } },
            h('span', { class: 'text-xs muted' }, 'خطر التأخير'),
            h('div', { class: 'progress-row' }, progress({ value: pct, max: 100, tone, label: `خطر التأخير يوم ${fmt.dayName(d.date)}` }), h('span', { class: 'progress-value' }, fmt.pct(pct))),
          ),
        );
      };
      const fallback = () => simpleTable(`توقعات الطقس ${fmt.num(7)} أيام`, ['اليوم', 'الحرارة', 'الرياح', 'الأمطار', 'الغبار', 'خطر التأخير'], days.map((d) => [`${fmt.dayName(d.date)} ${fmt.date(d.date, { style: 'short' })}`, `${fmt.num(num(d.tempMax))}°`, `${fmt.num(num(d.windKmh))} كم/س`, fmt.pct(rainPct(d.rainProb)), d.dustRisk || '—', fmt.pct(Math.round(d._risk * 100))]));
      const body = days.length
        ? h('div', { class: 'stack gap-3' },
          h('div', { class: 'weather-strip', role: 'list', 'aria-label': 'توقعات الطقس للأيام السبعة القادمة', style: { display: 'grid', gap: '10px' } }, ...days.map(dayCard)),
          h('div', { class: ['note', `tone-${data.weatherHighDays ? (data.weatherHighDays >= 3 ? 'critical' : 'warning') : 'good'}`] },
            glyph(data.weatherHighDays ? (data.weatherHighDays >= 3 ? 'critical' : 'warning') : 'good', 14), ' ',
            h('strong', {}, data.weatherHighDays ? `${fmt.num(data.weatherHighDays)} ${data.weatherHighDays === 1 ? 'يوم' : data.weatherHighDays === 2 ? 'يومان' : 'أيام'} بخطر تأخير مرتفع` : 'لا توجد أيام بخطر تأخير مرتفع'),
            ` · ${fmt.num(data.weatherSensitive)} نشاطاً حرجاً حساساً للطقس في ${siteName(data.state, data.projectId)}. المصدر: المركز الوطني للأرصاد.`),
        )
        : emptyState({ title: 'لا تتوفر توقعات طقس لهذا المشروع' });
      return card({
        code: 'SCH-04', title: `خطر التأخير بسبب الطقس — ${fmt.num(7)} أيام`, className: 'col-span-12',
        subtitle: projectSubtitle(data, `${fmt.num(7)} أيام: الحرارة القصوى، الرياح، الغبار، احتمال الأمطار وخطر التأخير اليومي`),
        body, tableView: fallback,
      });
    }

    /** Escalate button (or its outcome) for one approval — kept inside the first cell so it is never hidden with the low-priority columns. */
    function approvalAction(r) {
      const data = lastData;
      if (r.status === 'معتمد') return badge('معتمدة', 'good');
      if (r.escalated) return badge('تم التصعيد', 'brand');
      return button('تصعيد', { variant: r.status === 'متأخر' ? 'danger' : 'outline', size: 'sm', icon: svgIcon('bell', 13), attrs: { title: 'إنشاء مهمة تصعيد وإسنادها لمدير المشروع' }, onClick: () => { escalateApproval(data, r); } });
    }

    function buildApprovalsCard(data) {
      lastData = data;
      const rows = data.approvals;
      const table = dataTable({
        caption: 'الموافقات التنظيمية — المدة المنقضية مقابل المدة النظامية',
        pageSize: 6, rowKey: 'id', stickyFirst: true,
        emptyText: data.search ? 'لا توجد موافقات مطابقة للبحث' : 'لا توجد موافقات ضمن هذا النطاق',
        initialSort: { key: '_ratio', dir: 'desc' },
        columns: [
          { key: 'authority', label: 'الجهة ونوع الموافقة', priority: 'high', render: (r) => h('div', { class: 'stack gap-1' },
            h('span', { class: 'semibold' }, r.authority),
            h('span', { class: 'text-sm' }, digitsIn(fmt, r.type)),
            h('span', { class: 'text-xs muted' }, `${siteName(data.state, r.projectId)} · قُدِّمت ${fmt.date(r.submittedAt, { style: 'short' })}`),
            h('span', { class: 'row gap-2 wrap', style: { alignItems: 'center' } }, statusBadge(r.status, APPROVAL_STATUS_TONE), approvalAction(r))) },
          { key: '_ratio', label: 'المنقضي / النظامي', priority: 'high', render: (r) => h('div', { class: 'stack gap-1' }, ratioMeter(r.elapsedDays, r.statutoryDays, `المدة المنقضية لموافقة ${r.authority}`), h('span', { class: 'text-xs muted row gap-1', style: { alignItems: 'center' } }, 'الدرجة ', scoreCell(r.riskScore))), sortValue: (r) => r._ratio },
        ],
        rows,
      });
      const el = card({
        code: 'SCH-05', title: 'الموافقات التنظيمية', className: 'col-span-7',
        subtitle: `${fmt.num(rows.length)} موافقة — ${fmt.num(data.atRisk.length)} معرّضة للخطر (${fmt.pct(APPROVAL_RISK_RATIO * 100)} فأكثر من المدة النظامية أو متأخرة)`,
        body: table.el,
      });
      el.dataset.section = 'approvals';
      return el;
    }

    function buildSubcontractorsCard(data) {
      const all = data.subcontractors;
      const rows = subsExpanded ? all : all.slice(0, SUBS_DEFAULT);
      const scoreTone = (v) => (v >= 80 ? 'good' : v >= 60 ? 'warning' : 'critical');
      const scoreLabel = (v) => (v >= 80 ? 'جيد' : v >= 60 ? 'مقبول' : 'ضعيف');
      // Two-up so the card stays level with the approvals table; four rows by default, «عرض الكل» for the rest.
      const list = rows.length ? h('ul', { class: ['urgent-list', 'subs-list'], 'aria-label': 'أداء مقاولي الباطن' }, ...rows.map((s) => {
        const sc = num(s.scorecard);
        const spark = makeChart('sparkline', { values: (s.trend || []).map(num), width: 72, height: 24, color: 'var(--ink-3)', accentLast: true });
        const gapTone = s._gap < -5 ? 'critical' : s._gap < 0 ? 'warning' : 'good';
        const planned = num(s.plannedProgressPct); const actual = num(s.actualProgressPct);
        return h('li', { class: ['urgent-item', 'is-compact', `tone-${scoreTone(sc)}`] },
          h('span', { class: 'urgent-icon' }, glyph(scoreTone(sc), 15)),
          h('div', { class: 'urgent-text', style: { gap: '4px' } },
            h('span', { class: 'row gap-2 wrap', style: { alignItems: 'center' } }, h('span', { class: 'semibold' }, s.name), badge(`${scoreLabel(sc)} · ${fmt.num(sc)}`, scoreTone(sc)), num(s.openNotices) ? badge(`${fmt.num(num(s.openNotices))} إشعارات مفتوحة`, 'warning') : null),
            h('span', { class: 'urgent-sub' }, `${s.trade || '—'} · ${siteName(data.state, s.projectId)}`),
            h('div', { class: 'row gap-2', style: { alignItems: 'center' } },
              h('div', { class: 'grow', style: { minInlineSize: '60px' } }, progress({ value: actual, max: 100, tone: gapTone, label: `التقدم الفعلي ${s.name}: ${fmt.pct(actual)} مقابل مخطط ${fmt.pct(planned)}` })),
              h('span', { class: 'text-xs muted nowrap' }, 'فعلي ', h('span', { class: 'num' }, fmt.pct(actual)), ' · مخطط ', h('span', { class: 'num' }, fmt.pct(planned)))),
          ),
          h('div', { class: 'urgent-due' }, spark ? spark.el : null, badge(s._gap < 0 ? `متأخر ${fmt.num(Math.abs(s._gap), { maximumFractionDigits: 1 })} نقطة` : s._gap > 0 ? `متقدم ${fmt.num(s._gap, { maximumFractionDigits: 1 })} نقطة` : 'مطابق للمخطط', gapTone)),
        );
      })) : emptyState({ title: 'لا يوجد مقاولو باطن ضمن النطاق' });
      const fallback = () => simpleTable('أداء مقاولي الباطن', ['المقاول', 'الحرفة', 'المشروع', 'المخطط', 'الفعلي', 'الفجوة', 'بطاقة الأداء', 'إشعارات مفتوحة'], all.map((s) => [s.name, s.trade || '—', siteName(data.state, s.projectId), fmt.pct(num(s.plannedProgressPct)), fmt.pct(num(s.actualProgressPct)), `${fmt.signed(s._gap, 1)}`, fmt.num(num(s.scorecard)), fmt.num(num(s.openNotices))]));
      return card({
        code: 'SCH-06', title: 'أداء مقاولي الباطن', className: 'col-span-5',
        subtitle: `${fmt.num(all.length)} مقاولاً — الأكثر تأخراً عن المخطط أولاً · الخط الصغير: اتجاه آخر ${fmt.num(8)} أسابيع`,
        actions: all.length > SUBS_DEFAULT ? [button(subsExpanded ? 'عرض أقل' : `عرض الكل (${fmt.num(all.length)})`, { variant: 'ghost', size: 'sm', icon: subsExpanded ? 'chevron-up' : 'chevron-down', onClick: () => { subsExpanded = !subsExpanded; schedule(); } })] : [],
        body: list, tableView: fallback,
      });
    }

    function buildRisksCard(data) {
      const rows = data.domainRisks;
      const red = rows.filter((r) => ratingOf(r.score) === 'red').length;
      const table = dataTable({
        caption: 'المخاطر المكتشفة في مجال الجدول الزمني',
        pageSize: 6, rowKey: 'id', stickyFirst: true,
        emptyText: 'لا توجد مخاطر مفتوحة في هذا المجال ضمن النطاق',
        onRowClick: (r) => router.navigate('airisks', { risk: r.id }),
        initialSort: { key: 'score', dir: 'desc' },
        columns: [
          { key: 'code', label: 'الرمز', width: 110, priority: 'high', render: (r) => codeSpan(r.code) },
          { key: 'title', label: 'المخاطرة', priority: 'high', render: (r) => h('div', { class: 'stack gap-1' }, h('span', { class: 'semibold' }, ...withCodes(r.title)), h('span', { class: 'text-xs muted row gap-1 wrap' }, h('span', {}, siteName(data.state, r.projectId)), r.evidence && r.evidence.ref ? ' · ' : null, r.evidence && r.evidence.ref ? h('span', { class: 'mono', dir: 'ltr' }, r.evidence.ref) : null)) },
          { key: 'score', label: 'الدرجة والتصنيف', priority: 'high', render: (r) => scoreCell(r.score), sortValue: (r) => num(r.score) },
          { key: 'type', label: 'النوع', priority: 'medium', render: (r) => typeChip(r.type) },
          { key: 'owner', label: 'المالك', priority: 'low', render: (r) => r.owner || h('span', { class: 'muted' }, 'غير مُسند') },
          { key: 'status', label: 'الحالة', priority: 'medium', render: (r) => statusBadge(r.status, RISK_STATUS_TONE) },
        ],
        rows,
      });
      return card({
        code: 'SCH-07', title: 'المخاطر المكتشفة في هذا المجال', className: 'col-span-12',
        subtitle: `${fmt.num(rows.length)} مخاطر مفتوحة من نموذج الجدول الزمني · ${fmt.num(red)} بتصنيف أحمر — انقر لفتح المخاطرة في السجل الذكي`,
        actions: [button('السجل الذكي', { variant: 'ghost', size: 'sm', icon: svgIcon('shield-alert', 14), onClick: () => router.navigate('airisks', { category: CATEGORY }) })],
        body: table.el,
      });
    }

    function buildKriCard(data) {
      const pipeline = data.pipeline;
      const kris = pipeline && Array.isArray(pipeline.kris) ? pipeline.kris : [];
      const asText = (v) => (Array.isArray(v) ? v.filter(Boolean).join(' · ') : String(v ?? '—'));
      const table = h('table', { class: 'kri-table table is-dense' },
        h('caption', { class: 'sr-only' }, 'مصفوفة مؤشرات المخاطر الرئيسية لنموذج الجدول الزمني: المؤشر، التقنية، المدخلات، إجراء المعالجة'),
        h('thead', {}, h('tr', {}, h('th', { scope: 'col' }, 'المؤشر'), h('th', { scope: 'col' }, 'تقنية الذكاء الاصطناعي'), h('th', { scope: 'col' }, 'مدخلات البيانات'), h('th', { scope: 'col' }, 'إجراء المعالجة'))),
        h('tbody', {}, ...kris.map((k) => h('tr', {},
          h('td', { 'data-label': 'المؤشر', style: { fontWeight: 600 } }, asText(k.indicator)),
          h('td', { 'data-label': 'تقنية الذكاء الاصطناعي' }, asText(k.technique)),
          h('td', { 'data-label': 'مدخلات البيانات' }, asText(k.inputs)),
          h('td', { 'data-label': 'إجراء المعالجة' }, asText(k.mitigation)),
        ))),
      );
      const bodyWrap = h('div', { class: 'table-wrap' }, kris.length ? table : emptyState({ title: 'مصفوفة المؤشرات غير متاحة', text: 'لم تُحمَّل بيانات خط أنابيب نموذج الجدول الزمني بعد.' }));
      const toggle = button(kriOpen ? 'طيّ' : 'عرض', { variant: 'ghost', size: 'sm', icon: glyph('chevronDown', 14), attrs: { 'aria-expanded': kriOpen ? 'true' : 'false', 'aria-controls': 'sch-kri-body' } });
      const el = card({
        code: 'SCH-08', title: 'مصفوفة مؤشرات المخاطر والمعالجة', className: 'col-span-12',
        subtitle: pipeline ? `${pipeline.nameAr || pipeline.name} · ${pipeline.version || ''} · ${fmt.num(kris.length)} مؤشرات رئيسية (KRIs) من المقترح` : 'نموذج الجدول الزمني',
        actions: [toggle], body: bodyWrap,
      });
      el.classList.add('kri-card');
      const bodyEl = el.querySelector('.card-body');
      if (bodyEl) { bodyEl.id = 'sch-kri-body'; bodyEl.hidden = !kriOpen; }
      const ic = toggle.querySelector('svg');
      if (ic && !kriOpen) ic.style.transform = 'rotate(180deg)';
      toggle.addEventListener('click', () => {
        kriOpen = !kriOpen;
        if (bodyEl) bodyEl.hidden = !kriOpen;
        toggle.setAttribute('aria-expanded', kriOpen ? 'true' : 'false');
        const lbl = toggle.querySelector('.btn-label'); if (lbl) lbl.textContent = kriOpen ? 'طيّ' : 'عرض';
        if (ic) ic.style.transform = kriOpen ? '' : 'rotate(180deg)';
      });
      return el;
    }

    /* ───────────────────────── build ───────────────────────── */

    function build() {
      raf = 0;
      const data = collect();
      const frag = document.createDocumentFragment();
      if (!data.platform) {
        frag.append(
          buildHead({ ...data, categoryScore: null }),
          emptyState({ icon: svgIcon('calendar', 32), title: 'بيانات المنصة غير متاحة بعد', text: 'لم تُحمَّل بيانات منصة إدارة المخاطر (state.platform). أعد تحميل الصفحة بعد اكتمال التهيئة.' }),
        );
        root.replaceChildren(frag);
        return;
      }
      frag.append(
        buildHead(data),
        buildKpis(data),
        h('div', { class: 'grid-12' }, buildCriticalCard(data)),
        h('div', { class: 'grid-12' }, buildMonteCarloCard(data), buildResourcesCard(data)),
        h('div', { class: 'grid-12' }, buildWeatherCard(data)),
        h('div', { class: 'grid-12' }, buildApprovalsCard(data), buildSubcontractorsCard(data)),
        h('div', { class: 'grid-12' }, buildRisksCard(data)),
        h('div', { class: 'grid-12' }, buildKriCard(data)),
      );
      root.replaceChildren(frag);
    }

    function schedule() { if (!raf) raf = requestAnimationFrame(build); }

    // Only the entities this view displays rebuild it (own data, AI risks, alerts, site names, full reset); tasks are read at action time only (C-4).
    const RELEVANT = /^(\*|sites|platform$|platform\.(scheduleTasks|monteCarlo|resources|weather|approvals|subcontractors|projects|aiRisks|alerts))/;
    const unsubs = [
      bus.on('store:change', (payload) => { const path = payload && payload.path ? String(payload.path) : '*'; if (RELEVANT.test(path)) schedule(); }),
      bus.on('filters:change', (payload) => { const key = payload && payload.key; if (!key || key === 'siteId' || key === 'range' || key === 'search') schedule(); }),
      bus.on('settings:change', (payload) => {
        const s = (payload && payload.settings) || store.state.settings || {};
        const numerals = s.numerals || 'latn';
        const platformJson = safe(() => JSON.stringify(s.platform || null), 'null');
        if (numerals !== lastNumerals || platformJson !== lastPlatformSettings) { lastNumerals = numerals; lastPlatformSettings = platformJson; schedule(); }
      }),
    ];

    build();

    // Deep link: #/schedule?task=A1020 (code or id) opens the activity drawer.
    const want = ctx.params && (ctx.params.task || ctx.params.id);
    if (want) {
      const data = collect();
      const t = data.platform ? data.tasksAll.find((x) => x.id === want || x.code === want) : null;
      if (t) openActivity(data, t);
    }

    return () => {
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      unsubs.forEach((u) => { try { if (typeof u === 'function') u(); } catch { /* ignore */ } });
      if (openDrawer) { try { openDrawer.close(); } catch { /* ignore */ } openDrawer = null; }
      root.remove();
    };
  },
};
