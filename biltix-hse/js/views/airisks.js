/**
 * Biltix Risk AI — سجل المخاطر الذكي (js/views/airisks.js)
 *
 * View contract (ARCHITECTURE.md §8, B9.2): `default { id, code, title, icon, render }`.
 *
 *   Toolbar   category chips · type chips · rating segmented · status / pipeline / sort selects
 *   Table     code · title · project · category (icon+label) · type chip · score (mono) + rating
 *             badge · pipeline · confidence · detected (relative) · owner · status
 *   Side      type distribution (segmented bar) · top projects by red count (ranked bars)
 *   Drawer    the proposal's user flow for one AI risk — opened by row click or `?risk=ID`:
 *             header (.risk-drawer-head: code, chips, score ring) → flow stepper
 *             (psel.riskFlowStage) → (a) الدليل من المصدر (.evidence) → (b) تفسير المحرك
 *             (.explain: confidence meter, model version, feature importance) → (c) الإجراء
 *             الموصى به (.recommendation) with قبول / تعديل أو تجاوز / تصعيد فوري / تجاهل
 *             (modals → store.acceptRecommendation / overrideRecommendation / escalateRisk /
 *             dismissAiRisk) → (d) معاملات الاستجابة لأصحاب المصلحة (.response-params role tabs)
 *             → (e) السجل الزمني → (f) الكتابة العكسية إلى Biltix PM (.writeback-chip).
 *
 * Data reaches the DOM only through textContent (components.h). Contract calls into psel,
 * charts and the platform store methods are guarded: a missing module degrades to a local
 * fallback or a clear toast, never a broken view (psel is the single definition whenever it
 * is present; when ctx lacks it the module is imported lazily). The table instance is kept
 * alive and updated in place (sort and page survive live updates); the drawer refreshes in
 * place on store:change so write-back status flips live. The cleanup unsubscribes, clears
 * timers and closes the drawer.
 */

import { components } from '../ui/components.js';
import { fmt as defaultFmt } from '../core/fmt.js';
import { store as defaultStore } from '../core/store.js';
import { bus as defaultBus } from '../core/bus.js';

const { h, clear, glyph, svgIcon, card, badge, button, segmented, dataTable, modal, drawer, toast, formField, readForm, emptyState, progress, kv } = components;

const USER = 'م. فيصل الحربي';
const DAY_MS = 86_400_000;
const WRITEBACK_RESYNC_MS = 1500;

const CATEGORY_ORDER = ['contract', 'bom', 'schedule', 'site', 'cost'];
const CATEGORY_META = {
  contract: { label: 'العقود', icon: 'file-text' },
  bom: { label: 'المواد والتوريد', icon: 'list' },
  schedule: { label: 'الجدول الزمني', icon: 'calendar' },
  site: { label: 'الموقع والسلامة', icon: 'helmet' },
  cost: { label: 'التكلفة', icon: 'chart' },
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
const RISK_STATUSES = ['مكتشف', 'تنبيه', 'مهمة مُسندة', 'قيد المعالجة', 'مغلق', 'مُتجاوز'];
const STATUS_TONE = { 'مكتشف': 'neutral', 'تنبيه': 'warning', 'مهمة مُسندة': 'brand', 'قيد المعالجة': 'accent', 'مغلق': 'good', 'مُتجاوز': 'neutral' };
const OPEN_STATUSES = new Set(['مكتشف', 'تنبيه', 'مهمة مُسندة', 'قيد المعالجة']);
const PIPELINE_ORDER = ['contract-nlp', 'bom-forecast', 'schedule-model', 'site-ai', 'cost-forecast'];
const PIPELINE_FALLBACK = { 'contract-nlp': 'محرك العقود NLP', 'bom-forecast': 'محرك توقعات المواد', 'schedule-model': 'نموذج الجدول الزمني', 'site-ai': 'ذكاء الموقع والصور', 'cost-forecast': 'محرك توقعات التكلفة' };
const EFFORT_TONE = { 'منخفض': 'good', 'متوسط': 'warning', 'عالٍ': 'serious' };
const TASK_STATUS_TONE = { 'جديدة': 'brand', 'قيد التنفيذ': 'accent', 'متأخرة': 'critical', 'مغلقة': 'good' };
const WRITEBACK_META = {
  synced: { label: 'مُزامن مع Biltix PM', tone: 'good' },
  pending: { label: 'بانتظار المزامنة', tone: 'warning' },
  failed: { label: 'فشلت المزامنة', tone: 'critical' },
};
const SOURCE_LABEL = { 'ai-accepted': 'توصية مقبولة', 'ai-edited': 'توصية مُعدّلة', manual: 'يدوية' };
const EVIDENCE_KIND = { clause: 'بند تعاقدي', boq: 'بند كميات', task: 'نشاط جدول', inspection: 'تفتيش', cost: 'بند تكلفة', image: 'صورة موقع', sensor: 'قراءة حساس', supplier: 'مورد', approval: 'موافقة تنظيمية', changeOrder: 'أمر تغيير' };
const SOURCE_ICON = { 'Primavera P6': 'calendar', 'Autodesk APS': 'layers', 'Oracle ERP': 'erp', 'بوابة الحساسات': 'sensor', 'المركز الوطني للأرصاد': 'weather', 'مؤشرات السلع': 'trend', 'أسعار الصرف': 'globe' };
const ROLE_META = {
  PM: { label: 'مدير المشروع', icon: 'calendar' },
  Legal: { label: 'القانونية', icon: 'file-text' },
  Procurement: { label: 'المشتريات', icon: 'package' },
  Site: { label: 'الموقع', icon: 'helmet' },
  Finance: { label: 'المالية', icon: 'chart' },
  PMO: { label: 'مكتب إدارة المشاريع', icon: 'radar' },
};
const PARAM_LABEL = {
  scheduleImpactDays: 'أثر الجدول (أيام)', costImpactSAR: 'أثر التكلفة', criticalPath: 'على المسار الحرج',
  clauseRef: 'مرجع البند', exposureSAR: 'التعرض المالي', disputeLikelihood: 'احتمال النزاع',
  supplier: 'المورد', leadTimeDays: 'مدة التوريد (أيام)', alternates: 'البدائل',
  location: 'الموقع', hazard: 'الخطر', controls: 'الضوابط',
  budgetImpactSAR: 'أثر الميزانية', cashflowMonth: 'شهر التدفق النقدي',
  trend: 'الاتجاه', kpi: 'المؤشر', portfolioRank: 'الترتيب في المحفظة',
};
const FLOW_STAGES = ['مُلتقط', 'مُتحقق', 'في بحيرة البيانات', 'مُقيَّم', 'مُصنَّف', 'تنبيه', 'مهمة', 'مغلق'];
const TIMELINE_TONE = { override: 'warning', alert: 'critical', escalate: 'critical', writeback: 'accent', task: 'brand', 'task-closed': 'good', close: 'good', closed: 'good', accept: 'good', dismiss: 'neutral', history: 'brand', detected: 'accent', ack: 'good' };
const TIMELINE_KIND_LABEL = { override: 'تجاوز', alert: 'تنبيه', escalate: 'تصعيد', writeback: 'كتابة عكسية', task: 'مهمة', 'task-closed': 'إغلاق مهمة', close: 'إغلاق', closed: 'إغلاق', accept: 'قبول', dismiss: 'تجاهل', history: 'سجل', detected: 'اكتشاف', ack: 'إقرار' };
const CHANNELS = [['email', 'البريد الإلكتروني'], ['slack', 'Slack'], ['teams', 'Microsoft Teams'], ['whatsapp', 'واتساب للأعمال']];
const PM_NAME = 'Biltix PM';
const CODE_RE = /\b[A-Z]{1,5}-[A-Z0-9-]*\d[A-Z0-9-]*\b/g;
const STYLE_ID = 'view-airisks-style';
const STYLE_TEXT = `@layer views {
  .view-airisks .airisks-main, .view-airisks .airisks-side-row { align-items: start; }
  .view-airisks .code { font-family: var(--font-mono); font-variant-numeric: tabular-nums; unicode-bidi: isolate; }
  .view-airisks .chips.is-scroll { min-inline-size: 0; max-inline-size: 100%; }
  @media (max-width: 599.98px) {
    .view-airisks .chips.is-scroll { flex-wrap: nowrap; overflow-x: auto; scroll-snap-type: x proximity; -webkit-overflow-scrolling: touch; padding-block-end: 4px; scrollbar-width: thin; }
    .view-airisks .chips.is-scroll > .chip { flex: none; scroll-snap-align: start; }
  }
}`;
const SORTS = [
  { value: 'score-desc', label: 'الدرجة: الأعلى أولاً' },
  { value: 'score-asc', label: 'الدرجة: الأدنى أولاً' },
  { value: 'detected-desc', label: 'الأحدث اكتشافاً' },
  { value: 'confidence-desc', label: 'الثقة: الأعلى أولاً' },
  { value: 'due-asc', label: 'الاستحقاق: الأقرب أولاً' },
];
const DEFAULT_LOCAL = Object.freeze({ category: 'all', type: 'all', rating: 'all', status: 'all', pipeline: 'all', sort: 'score-desc' });

/* ------------------------------------------------------------------ */
/* Guards & helpers                                                     */
/* ------------------------------------------------------------------ */

const warned = new Set();
function warnOnce(key, err) {
  if (warned.has(key)) return;
  warned.add(key);
  console.warn(`[airisks] ${key} غير متاح — استخدام بديل محلي:`, err && err.message ? err.message : err);
}
function ensureStyle() {
  if (typeof document === 'undefined' || document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = STYLE_TEXT;
  document.head.appendChild(style);
}
/** Only http(s) URLs become links; anything else (javascript:, data:, relative junk) renders as plain text (C-5). */
function safeHttpUrl(value) {
  const raw = typeof value === 'string' ? value.trim() : '';
  if (!raw) return null;
  try { const u = new URL(raw); return u.protocol === 'http:' || u.protocol === 'https:' ? u.href : null; } catch { return null; }
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
function viaPsel(psel, key, fn, fallback) { return psel ? safe(`psel.${key}`, fn, fallback) : fallback; }
let pselLoad = null;
function loadPsel() {
  if (!pselLoad) pselLoad = import('../core/platform-selectors.js').then((m) => (m && (m.psel || m.default)) || null).catch(() => null);
  return pselLoad;
}
const isNum = (n) => typeof n === 'number' && Number.isFinite(n);
const num = (n, d = 0) => (isNum(n) ? n : d);
const text = (v) => (typeof v === 'string' ? v.trim() : (v == null ? '' : String(v)));
const pad2 = (n) => String(n).padStart(2, '0');

function startOfDay(date) { const x = new Date(date); x.setHours(0, 0, 0, 0); return x.getTime(); }
function isOverdue(iso, now) { const d = defaultFmt.toDate(iso); return !!d && d.getTime() < startOfDay(now); }
function isoDay(date) { return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`; }
function plusDays(date, days) { return isoDay(new Date(date.getTime() + days * DAY_MS)); }
function localISO(date) {
  const off = -date.getTimezoneOffset(); const sign = off >= 0 ? '+' : '-'; const abs = Math.abs(off);
  return `${isoDay(date)}T${pad2(date.getHours())}:${pad2(date.getMinutes())}:${pad2(date.getSeconds())}${sign}${pad2(Math.floor(abs / 60))}:${pad2(abs % 60)}`;
}

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
function pipelineLabel(psel, id) { return viaPsel(psel, 'pipelineLabel', () => psel.pipelineLabel(id), PIPELINE_FALLBACK[id] || String(id || '—')); }
const statusBadge = (status) => badge(status || '—', STATUS_TONE[status] || 'neutral');
const sourceBadge = (source) => h('span', { class: 'source-badge', 'data-source': source || '' }, SOURCE_LABEL[source] || source || '—');
/** Latin product / vendor names get lang="en" dir="ltr" (RTL-28). */
const latin = (label) => h('span', { lang: 'en', dir: 'ltr' }, String(label ?? ''));
/** A code such as AIR-0042 as an isolated LTR mono run that never breaks (RTL-5). */
const codeSpan = (code, extra = null) => h('span', { class: ['code', 'mono', 'nowrap', extra], dir: 'ltr' }, String(code ?? ''));
/** Split a title mixing Arabic prose and Latin codes into text + code spans. */
function withCodes(str) {
  const s = String(str ?? ''); const out = []; let last = 0; let m;
  CODE_RE.lastIndex = 0;
  while ((m = CODE_RE.exec(s))) { if (m.index > last) out.push(s.slice(last, m.index)); out.push(codeSpan(m[0])); last = m.index + m[0].length; }
  if (last < s.length) out.push(s.slice(last));
  return out.length ? out : [s];
}
/** Static chip — write-back changes are announced once through a toast, so no live region here (RTL-18). */
function writebackChip(wb) {
  const status = wb && wb.status ? String(wb.status) : '';
  const meta = WRITEBACK_META[status] || { label: status || 'بدون كتابة عكسية', tone: 'neutral' };
  return h('span', { class: 'writeback-chip', 'data-status': status }, glyph(meta.tone === 'neutral' ? 'neutral' : meta.tone, 11), status === 'synced' ? h('span', {}, 'مُزامن مع ', latin(PM_NAME)) : meta.label);
}

function viewHead({ code, title, lead, actions = [] }) {
  const textEl = h('div', { class: 'view-head-text' }, h('span', { class: 'code-tag' }, code), h('h1', {}, title), lead ? h('p', { class: 'view-lead' }, lead) : null);
  return h('div', { class: 'view-head' }, textEl, actions.length ? h('div', { class: 'view-actions' }, actions) : null);
}
function section(tag, title, ...children) {
  return h('section', { class: 'drawer-section' }, h('h3', { class: 'drawer-section-title is-platform' }, h('span', { class: 'mono', 'aria-hidden': 'true' }, tag), ...(Array.isArray(title) ? title : [title])), ...children);
}

/** Local formatter for stakeholder response parameters when psel.responseParams is absent. */
function formatParam(key, value) {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'boolean') return value ? 'نعم' : 'لا';
  if (Array.isArray(value)) return value.map((v) => text(v)).join(' · ') || '—';
  if (isNum(value)) {
    if (/SAR$/.test(key)) return `${defaultFmt.compact(value)} ر.س`;
    if (/Likelihood|Prob|Pct$/i.test(key)) return defaultFmt.pct(value <= 1 ? value * 100 : value);
    return defaultFmt.num(value, { maximumFractionDigits: 1 });
  }
  if (typeof value === 'object') return Object.entries(value).map(([k, v]) => `${PARAM_LABEL[k] || k}: ${formatParam(k, v)}`).join(' · ');
  return String(value);
}

/* ------------------------------------------------------------------ */
/* View                                                                 */
/* ------------------------------------------------------------------ */

export default {
  id: 'airisks',
  code: 'AIR-01',
  title: 'سجل المخاطر الذكي',
  icon: 'shield-alert',

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
    const timers = new Set();
    const local = { ...DEFAULT_LOCAL };
    let table = null;
    let drawerState = null; // { api, id }
    const ui = {};

    const navigate = (id, params = {}) => { if (router && typeof router.navigate === 'function') router.navigate(id, params); };
    const nowDate = () => (typeof store.now === 'function' ? store.now() : new Date());
    const stateOf = () => store.state || store.get();
    const settings = () => (stateOf().settings || {});
    const platformOf = () => (stateOf().platform || {});
    const projectName = (id) => { const s = (stateOf().sites || []).find((x) => x.id === id); return s ? s.name : String(id || '—'); };
    const findRisk = (id) => (platformOf().aiRisks || []).find((r) => r && r.id === id) || null;
    const taskOf = (risk) => {
      const tasks = platformOf().tasks || [];
      return (risk.taskId && tasks.find((t) => t.id === risk.taskId)) || tasks.find((t) => t.riskId === risk.id) || null;
    };
    const addTimer = (fn, ms) => { const id = setTimeout(() => { timers.delete(id); if (alive) fn(); }, ms); timers.add(id); return id; };
    const canStore = (name) => typeof store[name] === 'function';
    const overlays = new Set(); // open modals, closed on cleanup
    /** A sensible default due date: the risk's own when still ahead, else two weeks from today. */
    const defaultDue = (risk, now) => (risk.dueDate && (Date.parse(risk.dueDate) || 0) >= startOfDay(now) ? risk.dueDate : plusDays(now, 14));
    const scoreNum = (score, rating, { big = false } = {}) => h('span', { class: ['score-num', 'num', `is-${rating}`, big ? 'is-big' : null], 'data-rating': rating }, fmt.num(Math.round(num(score))));

    ensureStyle();
    if (!psel) loadPsel().then((p) => { if (p && alive && !psel) { psel = p; schedule(); } });

    /* ---------------- chart helpers ---------------- */

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
    function fallbackMeter(value, label, tone) {
      return h('div', { class: 'stack gap-1 meter-fallback' },
        h('div', { class: 'row between' }, h('span', { class: 'text-sm' }, label), h('span', { class: 'mono num semibold' }, fmt.pct(value))),
        progress({ value, max: 100, tone, label }));
    }
    function fallbackBars(items, valueFormat = fmt.num) {
      const max = Math.max(...items.map((i) => num(i.value)), 1);
      return h('div', { class: 'stack gap-2 bars-fallback' }, items.map((i) => h('div', { class: 'progress-row row gap-2' },
        h('span', { class: 'text-sm grow', style: { overflowWrap: 'anywhere' }, title: i.label }, i.label),
        progress({ value: (num(i.value) / max) * 100, max: 100, tone: i.tone || null, label: i.label }),
        h('span', { class: 'mono num text-xs' }, valueFormat(num(i.value))))));
    }

    /* ---------------- URL param (?risk=ID) ---------------- */

    function paramRisk() {
      try {
        const hash = location.hash || '';
        const q = hash.indexOf('?');
        if (q !== -1) { const v = new URLSearchParams(hash.slice(q + 1)).get('risk'); if (v) return v; }
      } catch { /* ignore */ }
      return (ctx.params && ctx.params.risk) || null;
    }
    function dropParam() {
      try {
        if (/^#\/airisks\?/.test(location.hash || '') && /[?&]risk=/.test(location.hash)) history.replaceState(null, '', '#/airisks');
      } catch { /* ignore */ }
    }

    /* ---------------- scaffold ---------------- */

    const root = h('section', { class: 'view view-airisks' });
    root.appendChild(viewHead({
      code: 'AIR-01',
      title: 'سجل المخاطر الذكي',
      lead: `كل مخاطرة يكتشفها محرك الذكاء الاصطناعي مع درجتها من ${fmt.num(0)} إلى ${fmt.num(100)} وتصنيفها (أحمر / أصفر / أخضر) ونوعها (مالي / سلامة / تأخير / نزاع). افتح أي صف لمراجعة الدليل من المصدر وتفسير المحرك ثم قبول التوصية أو تعديلها أو تصعيدها — كل قرار يُسجَّل ويُغذّي إعادة معايرة النماذج.`,
      actions: [
        button('قمرة القيادة', { variant: 'ghost', size: 'sm', icon: 'radar', onClick: () => navigate('cockpit') }),
        button('مهام المعالجة', { variant: 'outline', size: 'sm', icon: 'file-check', onClick: () => navigate('tasks') }),
      ],
    }));
    const body = h('div', { class: 'stack gap-4 airisks-body' });
    root.appendChild(body);
    container.appendChild(root);

    /* ---------------- toolbar ---------------- */

    function chipGroup(key, options, ariaLabel) {
      const group = h('div', { class: 'chip-group chips is-scroll', role: 'group', 'aria-label': ariaLabel, style: { overflowX: 'auto' } });
      options.forEach((o) => {
        group.appendChild(h('button', {
          type: 'button', class: ['chip', local[key] === o.value ? 'is-active' : null], 'aria-pressed': local[key] === o.value ? 'true' : 'false', 'data-key': key, 'data-value': o.value,
          onClick: () => { local[key] = o.value; syncToolbar(); refresh(); },
        }, o.icon ? svgIcon(o.icon, 14) : null, h('span', {}, o.label), h('span', { class: 'chip-count', 'data-count': `${key}:${o.value}` }, '0')));
      });
      return group;
    }
    function selectControl(key, options, ariaLabel) {
      const sel = h('select', { class: 'field-control airisks-select', 'aria-label': ariaLabel, 'data-key': key, style: { inlineSize: 'auto', minInlineSize: '168px', blockSize: '34px', flex: '0 1 auto' }, onChange: (e) => { local[key] = e.target.value; refresh(); } });
      options.forEach((o) => sel.appendChild(h('option', { value: o.value, selected: o.value === local[key] ? true : undefined }, o.label)));
      return sel;
    }

    const categoryChips = chipGroup('category', [{ value: 'all', label: 'كل المجالات' }].concat(CATEGORY_ORDER.map((c) => ({ value: c, label: categoryLabel(psel, c), icon: categoryIcon(psel, c) }))), 'تصفية حسب المجال');
    const typeChips = chipGroup('type', [{ value: 'all', label: 'كل الأنواع' }].concat(TYPE_ORDER.map((t) => ({ value: t, label: typeLabel(psel, t), icon: (TYPE_META[t] || {}).icon }))), 'تصفية حسب النوع');
    const ratingSeg = segmented({
      options: [{ value: 'all', label: 'الكل' }].concat(RATING_ORDER.map((r) => ({ value: r, label: ratingLabel(psel, r), icon: glyph(ratingTone(psel, r), 14) }))),
      value: local.rating, ariaLabel: 'تصفية حسب التصنيف',
      onChange: (v) => { local.rating = v; refresh(); },
    });
    const statusSelect = selectControl('status', [{ value: 'all', label: 'كل الحالات' }].concat(RISK_STATUSES.map((s) => ({ value: s, label: s }))), 'تصفية حسب الحالة');
    const pipelineSelect = selectControl('pipeline', [{ value: 'all', label: 'كل خطوط المعالجة' }].concat(PIPELINE_ORDER.map((p) => ({ value: p, label: pipelineLabel(psel, p) }))), 'تصفية حسب خط المعالجة');
    const sortSelect = selectControl('sort', SORTS, 'ترتيب النتائج');
    const summary = h('span', { class: 'text-sm muted airisks-summary', 'aria-live': 'polite' }, '');
    const resetBtn = button('إعادة الضبط', { variant: 'ghost', size: 'sm', onClick: () => { Object.assign(local, DEFAULT_LOCAL); syncToolbar(); refresh(); } });

    body.appendChild(h('div', { class: 'card is-flat airisks-toolbar', role: 'region', 'aria-label': 'عوامل تصفية السجل' },
      h('div', { class: 'card-body stack gap-3' },
        h('div', { class: 'toolbar' }, categoryChips),
        h('div', { class: 'toolbar' }, typeChips),
        h('div', { class: 'toolbar' },
          h('span', { class: 'filters-label' }, 'التصنيف'), ratingSeg.el,
          statusSelect, pipelineSelect,
          h('span', { class: 'filters-label' }, 'الترتيب'), sortSelect,
          h('span', { class: 'toolbar-spacer' }), summary, resetBtn))));

    function syncToolbar() {
      body.querySelectorAll('.chip[data-key]').forEach((chip) => {
        const on = local[chip.dataset.key] === chip.dataset.value;
        chip.classList.toggle('is-active', on);
        chip.setAttribute('aria-pressed', on ? 'true' : 'false');
      });
      ratingSeg.set(local.rating);
      statusSelect.value = local.status;
      pipelineSelect.value = local.pipeline;
      sortSelect.value = local.sort;
    }

    /* ---------------- data ---------------- */

    function fallbackFiltered(filters) {
      const siteId = filters.siteId || 'all';
      const q = text(filters.search).toLowerCase();
      return (platformOf().aiRisks || []).filter((r) => (siteId === 'all' || r.projectId === siteId)
        && (!q || [r.code, r.title, r.owner, r.driverExplanation].some((f) => String(f || '').toLowerCase().includes(q))));
    }
    function computeRows() {
      const state = stateOf();
      const filters = store.filters || state.filters || { siteId: 'all', range: 30, search: '' };
      const base = (viaPsel(psel, 'filteredAiRisks', () => psel.filteredAiRisks(state, filters), null) || fallbackFiltered(filters)).map((r) => ({ ...r, rating: ratingOf(psel, num(r.score)) }));
      const rows = base.filter((r) => (local.category === 'all' || r.category === local.category)
        && (local.type === 'all' || r.type === local.type)
        && (local.rating === 'all' || r.rating === local.rating)
        && (local.status === 'all' || r.status === local.status)
        && (local.pipeline === 'all' || r.pipeline === local.pipeline));
      const by = {
        'score-desc': (a, b) => num(b.score) - num(a.score),
        'score-asc': (a, b) => num(a.score) - num(b.score),
        'detected-desc': (a, b) => (Date.parse(b.detectedAt) || 0) - (Date.parse(a.detectedAt) || 0),
        'confidence-desc': (a, b) => num(b.confidence) - num(a.confidence),
        'due-asc': (a, b) => (Date.parse(a.dueDate) || Infinity) - (Date.parse(b.dueDate) || Infinity),
      };
      rows.sort(by[local.sort] || by['score-desc']);
      return { base, rows };
    }

    function updateCounts(base) {
      const counts = new Map();
      const bump = (k) => counts.set(k, (counts.get(k) || 0) + 1);
      base.forEach((r) => { bump('category:all'); bump(`category:${r.category}`); bump('type:all'); bump(`type:${r.type}`); });
      body.querySelectorAll('.chip-count[data-count]').forEach((el) => { el.textContent = fmt.num(counts.get(el.dataset.count) || 0); });
    }

    /* ---------------- table ---------------- */

    function dueCell(iso, now, done) {
      const overdue = !done && isOverdue(iso, now);
      return h('span', { class: ['row gap-1 due-cell', overdue ? 'is-overdue' : null], title: overdue ? 'متأخر عن موعد الاستحقاق' : undefined },
        glyph(overdue ? 'critical' : 'clock', 13), h('span', {}, fmt.date(iso, { style: 'short' })), overdue ? h('span', { class: 'sr-only' }, ' — متأخر') : null);
    }

    function buildTable(rows) {
      return dataTable({
        caption: 'سجل المخاطر المكتشفة بالذكاء الاصطناعي',
        rows, rowKey: 'id', pageSize: 10, dense: true, stickyFirst: true, emptyText: 'لا توجد مخاطر مطابقة لعوامل التصفية الحالية',
        onRowClick: (row) => openRisk(row.id),
        columns: [
          { key: 'title', label: 'المخاطرة', width: 260, priority: 'high', render: (r) => h('span', { class: 'stack gap-1', title: text(r.driverExplanation) || undefined, style: { minInlineSize: '220px' } }, h('span', { class: 'semibold' }, ...withCodes(r.title)), codeSpan(r.code, 'text-xs muted')), sortValue: (r) => r.title },
          { key: 'projectId', label: 'المشروع', priority: 'medium', render: (r) => h('span', { class: 'site-name', style: { display: 'inline-block', minInlineSize: '7em', overflowWrap: 'break-word' } }, projectName(r.projectId)), sortValue: (r) => projectName(r.projectId) },
          { key: 'category', label: 'المجال / النوع', priority: 'medium', render: (r) => h('span', { class: 'stack gap-1', style: { alignItems: 'flex-start' } }, categoryChip(psel, r.category), typeChip(psel, r.type)), sortValue: (r) => `${categoryLabel(psel, r.category)} ${typeLabel(psel, r.type)}` },
          { key: 'score', label: 'الدرجة والتصنيف', priority: 'high', render: (r) => h('span', { class: 'row gap-2 score-cell' }, scoreNum(r.score, r.rating), ratingBadge(psel, r.rating)), sortValue: (r) => num(r.score) },
          { key: 'pipeline', label: 'خط المعالجة / الثقة', priority: 'low', render: (r) => h('span', { class: 'stack gap-1' }, h('span', { class: 'text-xs' }, pipelineLabel(psel, r.pipeline)), h('span', { class: 'text-xs muted' }, 'ثقة ', h('span', { class: 'mono num' }, fmt.pct(num(r.confidence) * 100)))), sortValue: (r) => num(r.confidence) },
          { key: 'detectedAt', label: 'اكتُشف', priority: 'low', render: (r) => h('span', { title: fmt.dateTime(r.detectedAt), style: { whiteSpace: 'nowrap' } }, fmt.relative(r.detectedAt)), sortValue: (r) => Date.parse(r.detectedAt) || 0 },
          { key: 'owner', label: 'المالك', priority: 'low', render: (r) => r.owner || '—' },
          { key: 'status', label: 'الحالة', priority: 'medium', render: (r) => statusBadge(r.status), sortValue: (r) => RISK_STATUSES.indexOf(r.status) },
        ],
      });
    }

    function highlightRow() {
      if (!table) return;
      table.el.querySelectorAll('tbody tr.is-selected').forEach((tr) => tr.classList.remove('is-selected'));
      if (drawerState && drawerState.api && drawerState.api.isOpen()) {
        const tr = table.el.querySelector(`tbody tr[data-key="${CSS.escape(String(drawerState.id))}"]`);
        if (tr) tr.classList.add('is-selected');
      }
    }

    /* ---------------- side column ---------------- */

    function sideCards(rows) {
      const open = rows.filter((r) => OPEN_STATUSES.has(r.status));
      const palette = (i) => (charts && typeof charts.paletteFor === 'function' ? safe('charts.paletteFor', () => charts.paletteFor(i), `var(--s${(i % 8) + 1})`) : `var(--s${(i % 8) + 1})`);
      const typeParts = TYPE_ORDER.map((type, i) => ({ id: type, label: typeLabel(psel, type), value: open.filter((r) => r.type === type).length, color: palette(i) }));
      const typeTotal = typeParts.reduce((s, p) => s + p.value, 0);
      const typeSeg = typeTotal
        ? chartOr('segmentedBar', () => charts.segmentedBar({ parts: typeParts, tall: true, valueFormat: fmt.num, ariaLabel: 'توزيع المخاطر المفتوحة حسب النوع' }), () => fallbackBars(typeParts))
        : emptyState({ title: 'لا توجد مخاطر مفتوحة ضمن النتائج' });
      const typeLegend = h('div', { class: 'row wrap gap-2', role: 'list' }, typeParts.map((p) => h('span', { class: 'row gap-1 text-xs', role: 'listitem' }, typeChip(psel, p.id), h('span', { class: 'mono num muted' }, fmt.num(p.value)))));
      const typeCard = card({ code: 'DST-01', title: 'التوزيع حسب النوع', subtitle: 'المخاطر المفتوحة ضمن النتائج الحالية', className: 'col-span-6', body: h('div', { class: 'stack gap-3' }, typeSeg, typeLegend), tableView: tableViewOf(typeSeg) });

      const redByProject = new Map();
      open.filter((r) => r.rating === 'red').forEach((r) => redByProject.set(r.projectId, (redByProject.get(r.projectId) || 0) + 1));
      const items = Array.from(redByProject.entries()).map(([pid, value]) => ({ id: pid, label: projectName(pid), value })).sort((a, b) => b.value - a.value).slice(0, 6);
      const bars = items.length
        ? chartOr('barChart', () => charts.barChart({ items, horizontal: true, height: Math.max(120, 34 * items.length + 24), valueFormat: fmt.num, color: 'var(--critical)', showValues: true, maxBars: 6, ariaLabel: 'المشاريع الأعلى في عدد المخاطر الحمراء' }), () => fallbackBars(items.map((i) => ({ ...i, tone: 'critical' }))))
        : emptyState({ title: 'لا توجد مخاطر حمراء مفتوحة ضمن النتائج' });
      const projectsCard = card({ code: 'DST-03', title: 'أعلى المشاريع بالمخاطر الحمراء', subtitle: 'عدد المخاطر الحمراء المفتوحة لكل مشروع', className: 'col-span-6', body: bars, tableView: tableViewOf(bars) });
      return [typeCard, projectsCard];
    }

    /* ---------------- drawer: body sections ---------------- */

    function flowStepper(risk) {
      const fallbackStage = { 'مغلق': 7, 'مهمة مُسندة': 6, 'قيد المعالجة': 6, 'تنبيه': 5, 'مُتجاوز': 4, 'مكتشف': 4 }[risk.status];
      const stage = Math.max(0, Math.min(FLOW_STAGES.length - 1, num(viaPsel(psel, 'riskFlowStage', () => psel.riskFlowStage(risk, stateOf()), fallbackStage), 4)));
      return h('ol', { class: 'stepper is-sm risk-flow', 'aria-label': `مرحلة المخاطرة في مسار المعالجة: ${FLOW_STAGES[stage]}` }, FLOW_STAGES.map((label, i) => h('li', {
        class: ['step', i < stage ? 'is-done' : null, i === stage ? 'is-current' : null], 'aria-current': i === stage ? 'step' : undefined,
      }, h('span', { class: 'step-dot' }, i < stage ? glyph('good', 12) : null), h('span', { class: 'step-label' }, label))));
    }

    function headerBlock(risk, now) {
      const score = Math.round(num(risk.score));
      const rating = ratingOf(psel, score);
      const tone = ratingTone(psel, rating);
      const ring = chartOr('ring', () => charts.ring({ value: score, max: 100, size: 72, color: `var(--${tone})`, label: '', format: (v) => fmt.num(Math.round(v)) }), () => scoreNum(score, rating, { big: true }));
      const head = h('div', { class: 'risk-drawer-head' },
        h('div', { class: 'risk-drawer-titles' },
          h('span', { class: 'row gap-1 wrap text-xs muted' }, codeSpan(risk.code || risk.id), ' · ', h('span', {}, pipelineLabel(psel, risk.pipeline)), risk.modelVersion ? h('span', { class: 'mono', lang: 'en', dir: 'ltr' }, risk.modelVersion) : null),
          h('div', { class: 'risk-drawer-chips' }, ratingBadge(psel, rating), typeChip(psel, risk.type), categoryChip(psel, risk.category), statusBadge(risk.status), risk.escalated ? badge('مُصعَّد', 'critical', { icon: 'bell' }) : null)),
        h('div', { class: ['risk-drawer-score', `tone-${tone}`], role: 'img', 'aria-label': `الدرجة ${fmt.num(score)} من ${fmt.num(100)} — ${ratingLabel(psel, rating)}` }, ring, h('small', {}, `الدرجة من ${fmt.num(100)}`)));
      const details = kv([
        ['المشروع', projectName(risk.projectId)],
        ['ثقة النموذج', h('span', { class: 'mono num' }, fmt.pct(num(risk.confidence) * 100))],
        ['المالك', risk.owner || '—'],
        ['الاستحقاق', risk.dueDate ? dueCell(risk.dueDate, now, risk.status === 'مغلق') : '—'],
        ['اكتُشف', h('span', { title: fmt.relative(risk.detectedAt) }, fmt.dateTime(risk.detectedAt))],
        ['آخر تحديث', fmt.relative(risk.updatedAt)],
        ['أصحاب المصلحة', Array.isArray(risk.stakeholders) && risk.stakeholders.length ? risk.stakeholders.map((r) => (ROLE_META[r] || {}).label || r).join(' · ') : '—'],
      ]);
      details.classList.add('is-compact');
      return h('div', { class: 'drawer-section risk-head stack gap-3' }, head, flowStepper(risk), details);
    }

    function evidenceSection(risk) {
      const ev = risk.evidence || {};
      const sourceIcon = SOURCE_ICON[ev.sourceSystem] || (String(ev.sourceSystem || '').startsWith('Biltix') ? 'biltix' : 'external');
      return section('01', 'الدليل من المصدر', h('div', { class: 'evidence' },
        h('div', { class: 'evidence-head' },
          h('span', { class: 'evidence-ref mono', dir: 'ltr' }, ev.ref || '—'),
          h('span', { class: 'source-chip' }, svgIcon(sourceIcon, 12), ev.sourceSystem || 'النظام المصدر')),
        ev.excerpt ? h('blockquote', { class: 'evidence-excerpt' }, ev.excerpt) : h('p', { class: 'muted text-sm' }, 'لا يتوفر مقتطف نصي لهذا الدليل.'),
        h('div', { class: 'evidence-meta' },
          ev.kind ? h('span', { class: 'evidence-kind' }, `نوع الدليل: ${EVIDENCE_KIND[ev.kind] || ev.kind}`) : null,
          h('span', {}, 'قراءة فقط — لا تُعدَّل بيانات العميل الأصلية'),
          (() => { const url = safeHttpUrl(ev.link); if (url) return h('a', { href: url, target: '_blank', rel: 'noopener noreferrer' }, 'فتح في النظام المصدر'); return ev.link ? h('span', { class: 'mono text-xs muted', dir: 'ltr', title: 'مرجع غير قابل للفتح' }, String(ev.link)) : null; })())));
    }

    function explanationSection(risk, pipeline) {
      const conf = Math.round(num(risk.confidence) * 100);
      const confTone = conf >= 75 ? 'good' : conf >= 50 ? 'accent' : 'warning';
      const meter = chartOr('meter', () => charts.meter({ value: conf, max: 100, label: 'ثقة النموذج', thresholds: [{ upTo: 50, tone: 'warning' }, { upTo: 75, tone: 'accent' }, { upTo: 100, tone: 'good' }], height: 8 }), () => fallbackMeter(conf, 'ثقة النموذج', confTone));
      const features = (pipeline && Array.isArray(pipeline.featureImportance) ? pipeline.featureImportance : []).slice().sort((a, b) => num(b.weight) - num(a.weight)).slice(0, 5);
      const maxW = Math.max(...features.map((f) => num(f.weight)), 0.0001);
      const pctOf = (w) => (num(w) <= 1 ? num(w) * 100 : num(w));
      const bars = features.length
        ? h('div', { class: 'feature-bars', role: 'list', 'aria-label': `أهم العوامل في ${(pipeline && pipeline.nameAr) || pipelineLabel(psel, risk.pipeline)}` }, features.map((f) => h('div', { class: 'feature-bar', role: 'listitem' },
          h('span', { class: 'feature-bar-label', title: f.feature }, f.feature),
          h('span', { class: 'feature-bar-track', role: 'img', 'aria-label': `${f.feature}: ${fmt.pct(pctOf(f.weight))}` }, h('span', { class: 'feature-bar-fill', style: { inlineSize: `${((num(f.weight) / maxW) * 100).toFixed(1)}%` } })),
          h('span', { class: 'feature-bar-value' }, fmt.pct(pctOf(f.weight))))))
        : null;
      return section('02', 'تفسير المحرك', h('div', { class: 'explain' },
        h('p', { class: 'explain-text' }, risk.driverExplanation || 'لا يتوفر تفسير نصي من المحرك.'),
        meter,
        h('div', { class: 'explain-meta' },
          h('span', {}, 'خط المعالجة: ', h('span', { class: 'mono' }, (pipeline && pipeline.nameAr) || pipelineLabel(psel, risk.pipeline))),
          h('span', {}, 'إصدار النموذج: ', h('span', { class: 'mono', lang: 'en', dir: 'ltr' }, risk.modelVersion || (pipeline && pipeline.version) || '—')),
          pipeline && isNum(pipeline.precision) ? h('span', {}, 'الدقة: ', h('span', { class: 'mono' }, fmt.pct(pipeline.precision <= 1 ? pipeline.precision * 100 : pipeline.precision))) : null),
        bars ? h('span', { class: 'text-xs muted' }, 'أهمية العوامل في النموذج (أعلى خمسة)') : null,
        bars));
    }

    function recommendationSection(risk, task) {
      const rec = risk.recommendation || {};
      const closed = risk.status === 'مغلق' || risk.status === 'مُتجاوز';
      const hasTask = !!task;
      const decided = closed || hasTask;
      const alts = Array.isArray(rec.alternatives) ? rec.alternatives.filter(Boolean) : [];
      const lastOverride = Array.isArray(risk.overrides) && risk.overrides.length ? risk.overrides[risk.overrides.length - 1] : null;
      const decision = closed
        ? h('div', { class: 'recommendation-decision' }, glyph(risk.status === 'مُتجاوز' ? 'neutral' : 'good', 14), h('span', {}, risk.status === 'مُتجاوز' ? 'تم تجاهل هذه المخاطرة؛ القرار مسجل في سجل التدقيق.' : 'المخاطرة مغلقة؛ لا تتوفر إجراءات إضافية.'))
        : (hasTask ? h('div', { class: 'recommendation-decision' }, glyph('good', 14), h('span', {}, `أُنشئت مهمة المعالجة ${task.code || ''} من هذه التوصية (${SOURCE_LABEL[task.source] || task.source || ''}) — تابع تنفيذها في مهام المعالجة.`)) : null);
      const actions = h('div', { class: 'recommendation-actions' },
        button('قبول التوصية', { variant: 'primary', icon: 'check', onClick: () => acceptFlow(risk), attrs: { disabled: decided, title: hasTask ? 'أُنشئت مهمة من هذه التوصية بالفعل' : (closed ? 'المخاطرة مغلقة' : 'بنقرة واحدة: مهمة مُسندة وكتابة عكسية إلى Biltix PM') } }),
        button('تعديل / تجاوز', { variant: 'outline', icon: 'edit', onClick: () => overrideFlow(risk), attrs: { disabled: decided, title: hasTask ? 'أُنشئت مهمة من هذه التوصية بالفعل' : 'تجاوز بشري مُسجَّل بسببه' } }),
        button('تجاهل', { variant: 'ghost', icon: 'close', onClick: () => dismissFlow(risk), attrs: { disabled: closed } }),
        button('تصعيد فوري', { variant: 'danger', icon: 'bell', onClick: () => escalateFlow(risk), attrs: { disabled: closed || risk.escalated === true, title: risk.escalated ? 'تم التصعيد مسبقاً' : 'إضافة إلى قائمة التصعيد الفوري وإرسال عبر القنوات' } }));
      return section('03', 'الإجراء الموصى به', h('div', { class: ['recommendation', decided ? 'is-decided' : null] },
        h('div', { class: 'recommendation-head' },
          h('h4', {}, svgIcon('sparkle', 14), 'توصية المحرك'),
          h('div', { class: 'recommendation-chips' },
            rec.effort ? h('span', { class: ['recommendation-chip', `tone-${EFFORT_TONE[rec.effort] || 'neutral'}`] }, glyph(EFFORT_TONE[rec.effort] || 'neutral', 11), `الجهد: ${rec.effort}`) : null,
            rec.impact ? h('span', { class: 'recommendation-chip' }, svgIcon('trend-down', 11), `الأثر المتوقع: ${rec.impact}`) : null)),
        h('p', { class: 'recommendation-action' }, rec.action || 'لا توجد توصية مولّدة لهذه المخاطرة.'),
        rec.rationale ? h('p', { class: 'recommendation-rationale' }, rec.rationale) : null,
        alts.length ? h('span', { class: 'recommendation-alts-title' }, 'بدائل مقترحة') : null,
        alts.length ? h('ul', { class: 'recommendation-alts' }, alts.map((a) => h('li', {}, text(a)))) : null,
        lastOverride ? h('p', { class: 'note tone-warning text-xs' }, `آخر تجاوز بشري: «${text(lastOverride.toAction)}» — السبب: ${text(lastOverride.reason)} (${text(lastOverride.by) || USER}، ${fmt.relative(lastOverride.at)})`) : null,
        decision,
        actions));
    }

    function responseSection(risk) {
      const fallback = () => Object.entries(risk.responseParams || {})
        .filter(([role]) => !Array.isArray(risk.stakeholders) || risk.stakeholders.includes(role))
        .map(([role, obj]) => ({ role, label: (ROLE_META[role] || {}).label || role, rows: Object.entries(obj || {}).map(([k, v]) => [PARAM_LABEL[k] || k, formatParam(k, v)]) }));
      const params = viaPsel(psel, 'responseParams', () => psel.responseParams(risk), null) || fallback();
      const wrap = h('div', { class: 'response-params' }, h('p', { class: 'text-xs muted' }, 'كل جهة ترى نقاط البيانات التي تخصها: مدير المشروع، القانونية، المشتريات، الموقع، المالية، ومكتب إدارة المشاريع.'));
      if (!params.length) {
        wrap.appendChild(h('p', { class: 'response-params-empty' }, 'لا توجد معاملات استجابة لهذه المخاطرة.'));
        return section('04', 'معاملات الاستجابة لأصحاب المصلحة', wrap);
      }
      const tablist = h('div', { class: 'response-params-tabs', role: 'tablist', 'aria-label': 'أصحاب المصلحة' });
      const panel = h('div', { class: 'response-params-panel', role: 'tabpanel', tabindex: '0' });
      const tabsEls = [];
      const show = (idx) => {
        tabsEls.forEach((t, i) => { const on = i === idx; t.setAttribute('aria-selected', on ? 'true' : 'false'); t.tabIndex = on ? 0 : -1; t.classList.toggle('is-active', on); });
        const p = params[idx];
        clear(panel);
        panel.setAttribute('aria-label', `معاملات ${p.label || p.role}`);
        const dl = kv((p.rows || []).map(([label, value]) => [label, value instanceof Node || typeof value === 'string' ? value : formatParam(String(label), value)]));
        dl.classList.add('is-compact');
        panel.appendChild(dl);
      };
      params.forEach((p, i) => {
        const tab = h('button', { type: 'button', class: 'response-params-tab', role: 'tab', 'aria-selected': 'false', tabindex: '-1', 'data-role': p.role, onClick: () => show(i) },
          svgIcon((ROLE_META[p.role] || {}).icon || 'user', 13), h('span', {}, p.label || (ROLE_META[p.role] || {}).label || p.role), h('span', { class: 'mono' }, p.role));
        tabsEls.push(tab);
        tablist.appendChild(tab);
      });
      tablist.addEventListener('keydown', (e) => {
        const keys = ['ArrowRight', 'ArrowLeft', 'Home', 'End'];
        if (!keys.includes(e.key)) return;
        let idx = tabsEls.findIndex((t) => t.getAttribute('aria-selected') === 'true');
        if (e.key === 'ArrowLeft') idx = (idx + 1) % tabsEls.length; // RTL: forward in reading order
        else if (e.key === 'ArrowRight') idx = (idx - 1 + tabsEls.length) % tabsEls.length;
        else if (e.key === 'Home') idx = 0; else idx = tabsEls.length - 1;
        e.preventDefault(); show(idx); tabsEls[idx].focus();
      });
      show(0);
      wrap.append(tablist, panel);
      return section('04', 'معاملات الاستجابة لأصحاب المصلحة', wrap);
    }

    function fallbackTimeline(risk, task) {
      const items = [];
      if (risk.detectedAt) items.push({ at: risk.detectedAt, by: 'محرك الذكاء الاصطناعي', text: `اكتشاف المخاطرة عبر ${pipelineLabel(psel, risk.pipeline)} — الدرجة ${defaultFmt.num(num(risk.score))}`, kind: 'detected' });
      (risk.history || []).forEach((x) => items.push({ at: x.at, by: x.by, text: x.text, kind: 'history' }));
      (risk.overrides || []).forEach((o) => items.push({ at: o.at, by: o.by, text: `تجاوز التوصية: «${text(o.toAction)}» — السبب: ${text(o.reason)}`, kind: 'override' }));
      if (task) {
        items.push({ at: task.createdAt, by: task.owner, text: `إنشاء مهمة المعالجة ${task.code || ''} (${SOURCE_LABEL[task.source] || task.source || ''})`, kind: 'task' });
        if (task.writeback && task.writeback.at) items.push({ at: task.writeback.at, by: 'النظام', text: `الكتابة العكسية إلى ${task.writeback.target || 'Biltix PM'}: ${(WRITEBACK_META[task.writeback.status] || {}).label || task.writeback.status}`, kind: 'writeback' });
        if (task.closedAt) items.push({ at: task.closedAt, by: task.owner, text: `إغلاق المهمة${task.outcome ? ` — ${text(task.outcome)}` : ''}`, kind: 'close' });
      }
      (platformOf().alerts || []).filter((a) => a.riskId === risk.id).forEach((a) => items.push({ at: a.sentAt, by: 'محرك التنبيهات', text: a.title || 'تنبيه', kind: 'alert' }));
      return items.filter((i) => i.at).sort((a, b) => (Date.parse(a.at) || 0) - (Date.parse(b.at) || 0));
    }

    function timelineSection(risk, task) {
      const items = (viaPsel(psel, 'riskTimeline', () => psel.riskTimeline(risk, stateOf()), null) || fallbackTimeline(risk, task))
        .slice().sort((a, b) => (Date.parse(a.at || a.ts || a.date) || 0) - (Date.parse(b.at || b.ts || b.date) || 0)).reverse();
      if (!items.length) return section('05', 'السجل الزمني', emptyState({ title: 'لا توجد أحداث مسجلة بعد' }));
      return section('05', 'السجل الزمني', h('ol', { class: 'timeline', 'aria-label': 'السجل الزمني للمخاطرة — الأحدث أولاً' }, items.map((it) => {
        const kind = text(it.kind || it.type) || 'history';
        const tone = it.tone || TIMELINE_TONE[kind] || 'brand';
        const when = it.at || it.ts || it.date;
        return h('li', { class: ['timeline-item', `is-${kind}`], style: { '--tone': `var(--${tone === 'neutral' ? 'ink-3' : tone})` } },
          h('time', { class: 'timeline-time', datetime: text(when) }, fmt.dateTime(when)),
          h('p', { class: 'timeline-text' }, text(it.text || it.title || it.detail) || '—'),
          h('span', { class: 'timeline-by' }, [text(it.by || it.actor), TIMELINE_KIND_LABEL[kind] || text(it.label)].filter(Boolean).join(' · ')));
      })));
    }

    function writebackSection(risk, task, now) {
      const enabled = !(settings().platform && settings().platform.writebackEnabled === false);
      const children = [];
      if (!enabled) children.push(h('p', { class: 'note tone-warning text-xs' }, 'الكتابة العكسية معطّلة في الإعدادات — تُسجَّل الأعلام محلياً فقط.'));
      if (!task) {
        children.push(h('p', { class: 'note text-sm' }, 'لا توجد مهمة مرتبطة بعد. عند قبول التوصية أو تعديلها تُنشأ مهمة معالجة وتُكتب الأعلام والدرجة والمهمة عكسياً إلى ', latin(PM_NAME), ' — المنصة لا تعدّل بيانات العميل الأصلية.'));
        return section('06', ['الكتابة العكسية إلى ', latin(PM_NAME)], ...children);
      }
      const wb = task.writeback || {};
      const dl = kv([
        ['المهمة', codeSpan(task.code || task.id)],
        ['حالة المهمة', badge(task.status || '—', TASK_STATUS_TONE[task.status] || 'neutral')],
        ['المالك', task.owner || '—'],
        ['الاستحقاق', task.dueDate ? dueCell(task.dueDate, now, task.status === 'مغلقة') : '—'],
        ['المصدر', sourceBadge(task.source)],
        ['الهدف', latin(wb.target || PM_NAME)],
        ['حالة الكتابة العكسية', h('span', { class: 'row gap-2 wrap' }, writebackChip(wb), wb.at ? h('span', { class: 'text-xs muted', title: fmt.dateTime(wb.at) }, fmt.relative(wb.at)) : null)],
      ]);
      dl.classList.add('is-compact');
      children.push(dl);
      children.push(h('div', { class: 'row wrap gap-2' },
        button('فتح في مهام المعالجة', { variant: 'outline', size: 'sm', icon: 'file-check', onClick: () => { closeDrawer(); navigate('tasks'); } }),
        wb.status === 'failed' && (canStore('retryWriteback') || canStore('updateTask')) ? button('إعادة المزامنة', { variant: 'primary', size: 'sm', icon: 'refresh', onClick: () => resync(task) }) : null));
      return section('06', ['الكتابة العكسية إلى ', latin(PM_NAME)], ...children);
    }

    function buildDrawerBody(risk) {
      const now = nowDate();
      const task = taskOf(risk);
      const pipeline = (platformOf().pipelines || []).find((p) => p.id === risk.pipeline) || null;
      return h('div', { class: 'risk-drawer-body' },
        headerBlock(risk, now),
        evidenceSection(risk),
        explanationSection(risk, pipeline),
        recommendationSection(risk, task),
        responseSection(risk),
        timelineSection(risk, task),
        writebackSection(risk, task, now));
    }

    /* ---------------- drawer: open / refresh / close ---------------- */

    const subtitleOf = (risk) => `${risk.code || risk.id} · ${projectName(risk.projectId)} · ${categoryLabel(psel, risk.category)}`;

    function openRisk(id) {
      const risk = findRisk(id);
      if (!risk) { toast('لم يتم العثور على المخاطرة المطلوبة', { tone: 'warning' }); dropParam(); return; }
      if (drawerState && drawerState.api && drawerState.api.isOpen()) {
        drawerState.id = id;
        refreshDrawer({ force: true });
        return;
      }
      const api = drawer({
        title: risk.title, subtitle: subtitleOf(risk), size: 'lg',
        body: () => buildDrawerBody(risk),
        onClose: () => { if (drawerState && drawerState.api === api) { drawerState = null; dropParam(); highlightRow(); } },
      });
      api.el.classList.add('risk-drawer');
      drawerState = { api, id, signature: drawerSignature(risk) };
      api.open();
      highlightRow();
    }
    /** Cheap change signature so live ticks that do not touch this risk leave the drawer alone. */
    function drawerSignature(risk) {
      const task = taskOf(risk);
      const alerts = (platformOf().alerts || []).filter((a) => a.riskId === risk.id);
      return [risk.updatedAt, risk.status, risk.escalated, risk.owner, risk.dueDate, risk.taskId, (risk.overrides || []).length, (risk.history || []).length,
        task && task.status, task && task.updatedAt, task && task.writeback && task.writeback.status, task && task.writeback && task.writeback.at,
        alerts.length, alerts.filter((a) => a.acknowledged).length, fmt.getNumerals ? fmt.getNumerals() : ''].join('|');
    }
    function refreshDrawer({ force = false } = {}) {
      if (!drawerState || !drawerState.api || !drawerState.api.isOpen()) return;
      const { api, id } = drawerState;
      const risk = findRisk(id);
      if (!risk) { api.close('gone'); return; }
      const signature = drawerSignature(risk);
      if (!force && drawerState.signature === signature) return;
      drawerState.signature = signature;
      const scroll = api.body.scrollTop;
      clear(api.body);
      api.body.appendChild(buildDrawerBody(risk));
      api.setTitle(risk.title);
      const sub = api.el.querySelector('.drawer-sub');
      if (sub) sub.textContent = subtitleOf(risk);
      api.body.scrollTop = scroll;
      highlightRow();
    }
    function closeDrawer() { if (drawerState && drawerState.api) drawerState.api.close('action'); }

    /* ---------------- drawer: action flows ---------------- */

    function formModal({ title, subtitle, fields, note, submitLabel, variant = 'primary', onSubmit }) {
      const form = h('form', { class: 'stack gap-3 risk-form', novalidate: true }, note ? h('p', { class: 'note text-sm' }, note) : null, fields);
      const submit = () => {
        if (typeof form.reportValidity === 'function' && !form.reportValidity()) return false;
        let ok;
        try { ok = onSubmit(readForm(form)); } catch (err) {
          console.error('[airisks] فشل تنفيذ الإجراء:', err);
          toast('تعذر تنفيذ الإجراء — راجع سجل وحدة التحكم', { tone: 'critical' });
          return false;
        }
        return ok === false ? false : undefined;
      };
      let api = null;
      api = modal({ title, subtitle, body: form, size: 'md', onClose: () => overlays.delete(api), actions: [{ label: 'إلغاء', variant: 'ghost' }, { label: submitLabel, variant, onClick: submit }] });
      overlays.add(api);
      form.addEventListener('submit', (e) => { e.preventDefault(); if (submit() !== false) api.close('action'); });
      api.open();
      return api;
    }
    const defaultOwner = (risk) => risk.owner || (ROLE_META[(risk.stakeholders || [])[0]] || {}).label || 'مدير المشروع';
    const requireStore = (name) => { if (canStore(name)) return true; toast(`الإجراء غير متاح: وظيفة المتجر ${name} غير محمّلة`, { tone: 'critical' }); return false; };

    function acceptFlow(risk) {
      if (!requireStore('acceptRecommendation')) return;
      const now = nowDate();
      const rec = risk.recommendation || {};
      formModal({
        title: 'قبول التوصية', subtitle: `${risk.code} — ${text(rec.action) || risk.title}`,
        note: 'بنقرة واحدة: تُنشأ مهمة معالجة وتُسند إلى المالك، ثم يُكتب علم المخاطرة ودرجتها والمهمة عكسياً إلى Biltix PM.',
        fields: [
          formField({ label: 'المالك المسؤول', name: 'owner', type: 'text', value: defaultOwner(risk), required: true, placeholder: 'اسم المسؤول أو الدور' }),
          formField({ label: 'تاريخ الاستحقاق', name: 'dueDate', type: 'date', value: defaultDue(risk, now), required: true, min: isoDay(now) }),
          formField({ label: 'تصعيد فوري عبر القنوات المفعّلة', name: 'escalate', type: 'checkbox', value: ratingOf(psel, num(risk.score)) === 'red' && !risk.escalated }),
        ],
        submitLabel: 'قبول وإنشاء المهمة',
        onSubmit: (data) => {
          const owner = text(data.owner); if (!owner) { toast('أدخل اسم المالك المسؤول', { tone: 'warning' }); return false; }
          store.acceptRecommendation(risk.id, { owner, dueDate: text(data.dueDate) || plusDays(now, 14), escalate: !!data.escalate, by: USER });
          toast('تم قبول التوصية وإنشاء مهمة المعالجة — الكتابة العكسية إلى Biltix PM جارية', { tone: 'good', title: risk.code });
        },
      });
    }

    function overrideFlow(risk) {
      if (!requireStore('overrideRecommendation')) return;
      const now = nowDate();
      const rec = risk.recommendation || {};
      formModal({
        title: 'تعديل أو تجاوز التوصية', subtitle: `${risk.code} — ${risk.title}`,
        note: 'التجاوز البشري يُسجَّل مع سببه ويُغذّى إلى المحرك لإعادة المعايرة؛ تُنشأ مهمة بالإجراء المعدّل.',
        fields: [
          formField({ label: 'الإجراء المعدّل', name: 'action', type: 'textarea', value: text(rec.action), required: true, rows: 3 }),
          formField({ label: 'سبب التجاوز', name: 'reason', type: 'textarea', required: true, rows: 2, placeholder: 'لماذا تختلف عن توصية المحرك؟', hint: 'مطلوب — يُستخدم في إعادة معايرة النموذج.' }),
          formField({ label: 'المالك المسؤول', name: 'owner', type: 'text', value: defaultOwner(risk), required: true }),
          formField({ label: 'تاريخ الاستحقاق', name: 'dueDate', type: 'date', value: defaultDue(risk, now), required: true, min: isoDay(now) }),
          formField({ label: 'تصعيد فوري عبر القنوات المفعّلة', name: 'escalate', type: 'checkbox', value: false }),
        ],
        submitLabel: 'حفظ التجاوز وإنشاء المهمة',
        onSubmit: (data) => {
          const action = text(data.action); const reason = text(data.reason); const owner = text(data.owner);
          if (!action || !reason || !owner) { toast('أكمل الإجراء والسبب والمالك', { tone: 'warning' }); return false; }
          store.overrideRecommendation(risk.id, { action, reason, owner, dueDate: text(data.dueDate) || plusDays(now, 14), escalate: !!data.escalate, by: USER });
          toast('تم تسجيل التجاوز وإنشاء مهمة بالإجراء المعدّل', { tone: 'good', title: risk.code });
        },
      });
    }

    function escalateFlow(risk) {
      if (!requireStore('escalateRisk')) return;
      const configured = (settings().platform && settings().platform.channels) || { email: true, slack: true, teams: false, whatsapp: false };
      formModal({
        title: 'تصعيد فوري', subtitle: `${risk.code} — ${risk.title}`,
        note: 'يُضاف التنبيه إلى قائمة التصعيد الفوري ويُرسل عبر القنوات المختارة، ويُعلَّم على المخاطرة كتصعيد.',
        fields: CHANNELS.map(([key, label]) => formField({ label, name: `ch_${key}`, type: 'checkbox', value: !!configured[key] })),
        submitLabel: 'تصعيد الآن', variant: 'danger',
        onSubmit: (data) => {
          const channels = CHANNELS.map(([key]) => key).filter((key) => !!data[`ch_${key}`]);
          if (!channels.length) { toast('اختر قناة واحدة على الأقل', { tone: 'warning' }); return false; }
          store.escalateRisk(risk.id, channels, USER);
          toast(`تم التصعيد الفوري عبر ${channels.length === 1 ? 'قناة واحدة' : `${fmt.num(channels.length)} قنوات`}`, { tone: 'critical', title: risk.code });
        },
      });
    }

    function dismissFlow(risk) {
      if (!requireStore('dismissAiRisk')) return;
      formModal({
        title: 'تجاهل المخاطرة', subtitle: `${risk.code} — ${risk.title}`,
        note: 'تنتقل المخاطرة إلى الحالة «مُتجاوز» مع تسجيل السبب في سجل التدقيق؛ يمكن مراجعتها لاحقاً.',
        fields: [formField({ label: 'سبب التجاهل', name: 'reason', type: 'textarea', required: true, rows: 3, placeholder: 'مثال: الخطر مُعالج فعلياً في الموقع ولم تُحدَّث البيانات بعد' })],
        submitLabel: 'تأكيد التجاهل', variant: 'danger',
        onSubmit: (data) => {
          const reason = text(data.reason); if (!reason) { toast('أدخل سبب التجاهل', { tone: 'warning' }); return false; }
          store.dismissAiRisk(risk.id, reason, USER);
          toast('تم تجاهل المخاطرة وتسجيل القرار', { tone: 'neutral', title: risk.code });
        },
      });
    }

    function resync(task) {
      try {
        if (canStore('retryWriteback')) {
          store.retryWriteback(task.id);
          toast('بدأت إعادة مزامنة المهمة مع Biltix PM', { tone: 'accent', title: task.code });
          return;
        }
        if (!canStore('updateTask')) return;
        const wb = task.writeback || {};
        store.updateTask(task.id, { writeback: { ...wb, target: wb.target || 'Biltix PM', status: 'pending', at: localISO(nowDate()) } });
        toast('بدأت إعادة مزامنة المهمة مع Biltix PM', { tone: 'accent', title: task.code });
        addTimer(() => {
          try { store.updateTask(task.id, { writeback: { ...wb, target: wb.target || 'Biltix PM', status: 'synced', at: localISO(nowDate()) } }); toast('تمت الكتابة العكسية إلى Biltix PM', { tone: 'good', title: task.code }); } catch (err) { warnOnce('store.updateTask', err); }
        }, WRITEBACK_RESYNC_MS);
      } catch (err) {
        warnOnce('store.retryWriteback', err);
        toast('تعذر بدء إعادة المزامنة', { tone: 'critical' });
      }
    }

    /* ---------------- paint & refresh ---------------- */

    function summaryText(rows) {
      const by = (r) => rows.filter((x) => x.rating === r && OPEN_STATUSES.has(x.status)).length;
      return `${fmt.num(rows.length)} مخاطرة · أحمر ${fmt.num(by('red'))} · أصفر ${fmt.num(by('yellow'))} · أخضر ${fmt.num(by('green'))}`;
    }

    function paint() {
      body.querySelectorAll('.airisks-main').forEach((n) => n.remove());
      table = null;
      const state = stateOf();
      if (!state.platform || !Array.isArray(state.platform.aiRisks)) {
        body.appendChild(h('div', { class: 'airisks-main' }, emptyState({ icon: 'shield-alert', title: 'بيانات المنصة غير متاحة بعد', text: 'لم تُحمَّل بيانات منصة إدارة المخاطر (state.platform).' })));
        return;
      }
      const { base, rows } = computeRows();
      table = buildTable(rows);
      ui.tableCard = card({ code: 'AIR-01', title: 'المخاطر المكتشفة', subtitle: summaryText(rows), className: 'col-span-12 airisks-table-card', body: table.el });
      ui.side = h('div', { class: 'grid-12 airisks-side-row airisks-side' }, sideCards(rows));
      body.appendChild(h('div', { class: 'grid-12 airisks-main' }, ui.tableCard, h('div', { class: 'col-span-12' }, ui.side)));
      summary.textContent = summaryText(rows);
      updateCounts(base);
      highlightRow();
    }

    function refresh() {
      if (!alive) return;
      if (!table) { paint(); refreshDrawer(); return; }
      const { base, rows } = computeRows();
      table.update(rows);
      const sub = ui.tableCard && ui.tableCard.querySelector('.card-sub');
      if (sub) sub.textContent = summaryText(rows);
      summary.textContent = summaryText(rows);
      updateCounts(base);
      if (ui.side) { clear(ui.side); sideCards(rows).forEach((c) => ui.side.appendChild(c)); }
      highlightRow();
      refreshDrawer();
    }

    function schedule() {
      if (!alive) return;
      if (raf) cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => { raf = 0; if (alive) refresh(); });
    }

    subs.push(bus.on('store:change', (payload) => {
      const path = payload && typeof payload.path === 'string' ? payload.path : '*';
      // only platform entities, settings (numerals / thresholds) and site names feed this view;
      // Part A collections (feed, permits, sensors, …) change every few seconds and are ignored
      if (path !== '*' && !/^(platform|settings|sites)/.test(path)) return;
      if (/^platform\.(validation|pipelines|connectors|auditLog)/.test(path)) return;
      schedule();
    }));
    subs.push(bus.on('filters:change', schedule));
    subs.push(bus.on('settings:change', schedule));

    paint();
    const wanted = paramRisk();
    if (wanted) addTimer(() => openRisk(wanted), 0);

    return () => {
      alive = false;
      if (raf) cancelAnimationFrame(raf);
      timers.forEach((id) => clearTimeout(id));
      timers.clear();
      subs.splice(0).forEach((unsub) => { try { unsub(); } catch { /* ignore */ } });
      Array.from(overlays).forEach((o) => { try { o.close('navigate'); } catch { /* ignore */ } });
      overlays.clear();
      if (drawerState && drawerState.api) {
        const api = drawerState.api;
        drawerState = null;
        try { api.close('navigate'); } catch { /* ignore */ }
      }
    };
  },
};
