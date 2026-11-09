/**
 * Biltix Risk AI — مهام المعالجة (js/views/tasks.js)
 *
 * View contract (ARCHITECTURE.md §8, B9.3): `default { id, code, title, icon, render }`.
 *
 *   KPI strip   مفتوحة · متأخرة · أُغلقت هذا الشهر · متوسط زمن الإغلاق · نسبة القبول مقابل التعديل
 *   Kanban      components.kanban across the task statuses (جديدة / قيد التنفيذ / متأخرة / مغلقة);
 *               cards show code, title, linked risk code + rating badge, owner, due (overdue tone),
 *               source badge (توصية مقبولة / مُعدّلة / يدوية) and the write-back chip
 *               (synced / pending / failed with «إعادة المزامنة»). onMove → store.updateTask;
 *               moving into «مغلقة» asks for the outcome first (feeds model recalibration).
 *   Drawer      task details, linked risk (→ #/airisks?risk=ID), write-back status, actions.
 *   Modal       «مهمة يدوية» → store.addTask (source 'manual').
 *
 * Global filters apply: project (site) and search always; the range limits closed tasks only,
 * open tasks are always listed. Data reaches the DOM only through textContent (components.h);
 * the kanban is kept alive and updated in place; cleanup unsubscribes and clears timers.
 */

import { components } from '../ui/components.js';
import { fmt as defaultFmt } from '../core/fmt.js';
import { store as defaultStore } from '../core/store.js';
import { bus as defaultBus } from '../core/bus.js';

const { h, clear, glyph, svgIcon, statTile, badge, button, kanban, modal, drawer, toast, formField, readForm, emptyState, kv } = components;

const USER = 'م. فيصل الحربي';
const DAY_MS = 86_400_000;
const WRITEBACK_RESYNC_MS = 1500;

const TASK_STATUSES = ['جديدة', 'قيد التنفيذ', 'متأخرة', 'مغلقة'];
const TASK_STATUS_TONE = { 'جديدة': 'brand', 'قيد التنفيذ': 'accent', 'متأخرة': 'critical', 'مغلقة': 'good' };
const SOURCE_META = {
  'ai-accepted': { label: 'توصية مقبولة', tone: 'accent' },
  'ai-edited': { label: 'توصية مُعدّلة', tone: 'warning' },
  manual: { label: 'يدوية', tone: 'neutral' },
};
const WRITEBACK_META = {
  synced: { label: 'مُزامن مع Biltix PM', tone: 'good' },
  pending: { label: 'بانتظار المزامنة', tone: 'warning' },
  failed: { label: 'فشلت المزامنة', tone: 'critical' },
};
const RATING_META = {
  red: { label: 'أحمر', tone: 'critical' },
  yellow: { label: 'أصفر', tone: 'warning' },
  green: { label: 'أخضر', tone: 'good' },
};
const TYPE_META = {
  Financial: { label: 'مالي', icon: 'chart' },
  Safety: { label: 'سلامة', icon: 'helmet' },
  Delay: { label: 'تأخير', icon: 'clock' },
  Conflict: { label: 'نزاع', icon: 'file-text' },
};

/* ------------------------------------------------------------------ */
/* Guards & helpers                                                     */
/* ------------------------------------------------------------------ */

const warned = new Set();
function warnOnce(key, err) {
  if (warned.has(key)) return;
  warned.add(key);
  console.warn(`[tasks] ${key} غير متاح — استخدام بديل محلي:`, err && err.message ? err.message : err);
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
function sameMonth(iso, date) { const d = defaultFmt.toDate(iso); return !!d && d.getFullYear() === date.getFullYear() && d.getMonth() === date.getMonth(); }
function monthsAgo(date, n) { return new Date(date.getFullYear(), date.getMonth() - n, 1); }

function ratingOf(psel, score) {
  return safe('psel.rating', () => psel.rating(score), score >= 70 ? 'red' : score >= 40 ? 'yellow' : 'green');
}
function ratingTone(psel, rating) {
  return safe('psel.ratingTone', () => psel.ratingTone(rating), (RATING_META[rating] || RATING_META.green).tone);
}
function ratingLabel(psel, rating) {
  return safe('psel.ratingLabel', () => psel.ratingLabel(rating), (RATING_META[rating] || RATING_META.green).label);
}
function ratingBadge(psel, rating) {
  const b = badge(ratingLabel(psel, rating), ratingTone(psel, rating));
  b.classList.add('rating', `is-${rating}`);
  return b;
}
function typeChip(psel, type) {
  const meta = TYPE_META[type] || { icon: 'neutral', label: String(type || '—') };
  const label = safe('psel.typeLabel', () => psel.typeLabel(type), meta.label);
  return h('span', { class: ['type-chip', `is-${String(type || 'unknown').toLowerCase()}`], 'data-type': type || '' }, svgIcon(meta.icon, 13), h('span', { class: 'type-chip-label' }, label));
}
const statusBadge = (status) => badge(status || '—', TASK_STATUS_TONE[status] || 'neutral');
const sourceBadge = (source) => { const m = SOURCE_META[source] || { label: source || '—', tone: 'neutral' }; return badge(m.label, m.tone); };

function viewHead({ code, title, lead, actions = [] }) {
  const textEl = h('div', { class: 'view-head-text' },
    h('span', { class: 'code-tag' }, code),
    h('h1', {}, title),
    lead ? h('p', { class: 'view-lead' }, lead) : null);
  return h('div', { class: 'view-head' }, textEl, actions.length ? h('div', { class: 'view-actions' }, actions) : null);
}
function section(title, ...children) {
  return h('section', { class: 'drawer-section' }, h('h3', { class: 'drawer-section-title' }, title), ...children);
}

/* ------------------------------------------------------------------ */
/* View                                                                 */
/* ------------------------------------------------------------------ */

export default {
  id: 'tasks',
  code: 'AIR-02',
  title: 'مهام المعالجة',
  icon: 'file-check',

  render(container, ctx = {}) {
    const store = ctx.store || defaultStore;
    const bus = ctx.bus || defaultBus;
    const fmt = ctx.fmt || defaultFmt;
    const router = ctx.router;
    const psel = ctx.psel;

    let alive = true;
    let raf = 0;
    const subs = [];
    const timers = new Set();
    let board = null;
    let drawerState = null; // { api, id }

    const navigate = (id, params = {}) => { if (router && typeof router.navigate === 'function') router.navigate(id, params); };
    const nowDate = () => (typeof store.now === 'function' ? store.now() : new Date());
    const stateOf = () => store.state || store.get();
    const settings = () => (stateOf().settings || {});
    const platformOf = () => (stateOf().platform || {});
    const sites = () => (stateOf().sites || []);
    const projectName = (id) => { const s = sites().find((x) => x.id === id); return s ? s.name : String(id || '—'); };
    const findTask = (id) => (platformOf().tasks || []).find((t) => t && t.id === id) || null;
    const riskOf = (task) => (task && task.riskId ? (platformOf().aiRisks || []).find((r) => r.id === task.riskId) || null : null);
    const addTimer = (fn, ms) => { const id = setTimeout(() => { timers.delete(id); if (alive) fn(); }, ms); timers.add(id); return id; };
    const canStore = (name) => typeof store[name] === 'function';
    const requireStore = (name) => { if (canStore(name)) return true; toast(`الإجراء غير متاح: وظيفة المتجر ${name} غير محمّلة`, { tone: 'critical' }); return false; };

    /* ---------------- scaffold ---------------- */

    const root = h('section', { class: 'view view-tasks' });
    root.appendChild(viewHead({
      code: 'AIR-02',
      title: 'مهام المعالجة',
      lead: 'كل مهمة تُولَّد من قبول توصية المحرك أو تعديلها (أو تُضاف يدوياً)، تُسند إلى مالك، وتُكتب عكسياً إلى Biltix PM. اسحب البطاقات بين الأعمدة أو استخدم زر النقل؛ إغلاق المهمة يتطلب تسجيل النتيجة لتغذية إعادة معايرة النماذج.',
      actions: [
        button('سجل المخاطر الذكي', { variant: 'ghost', size: 'sm', icon: 'shield-alert', onClick: () => navigate('airisks') }),
        button('مهمة يدوية', { variant: 'primary', size: 'sm', icon: 'file-check', onClick: () => manualTaskFlow() }),
      ],
    }));
    const kpiHost = h('div', { class: 'kpi-row tasks-kpis', role: 'region', 'aria-label': 'مؤشرات مهام المعالجة' });
    const boardHost = h('div', { class: 'tasks-board' });
    root.append(kpiHost, boardHost);
    container.appendChild(root);

    /* ---------------- data ---------------- */

    function visibleTasks() {
      const state = stateOf();
      const filters = store.filters || state.filters || { siteId: 'all', range: 30, search: '' };
      const now = nowDate();
      const siteId = filters.siteId || 'all';
      const q = text(filters.search).toLowerCase();
      const rangeMs = num(filters.range, 30) * DAY_MS;
      const risks = platformOf().aiRisks || [];
      return (platformOf().tasks || []).filter((t) => {
        if (!t) return false;
        if (siteId !== 'all' && t.projectId !== siteId) return false;
        if (t.status === 'مغلقة') {
          const closedAt = Date.parse(t.closedAt || t.updatedAt || t.createdAt);
          if (Number.isFinite(closedAt) && now.getTime() - closedAt > rangeMs) return false;
        }
        if (q) {
          const risk = t.riskId ? risks.find((r) => r.id === t.riskId) : null;
          const hay = [t.code, t.title, t.owner, risk && risk.code, risk && risk.title].map((x) => String(x || '').toLowerCase());
          if (!hay.some((x) => x.includes(q))) return false;
        }
        return true;
      });
    }

    function kpis(tasks, now) {
      const open = tasks.filter((t) => t.status !== 'مغلقة');
      const overdueFromPsel = safe('psel.overdueTasks', () => psel.overdueTasks(stateOf()), null);
      const overdue = open.filter((t) => t.status === 'متأخرة' || isOverdue(t.dueDate, now) || (Array.isArray(overdueFromPsel) && overdueFromPsel.some((o) => o && o.id === t.id)));
      const closed = (platformOf().tasks || []).filter((t) => t.status === 'مغلقة' && (!store.filters || store.filters.siteId === 'all' || t.projectId === store.filters.siteId));
      const closedThisMonth = closed.filter((t) => sameMonth(t.closedAt, now)).length;
      const closedLastMonth = closed.filter((t) => sameMonth(t.closedAt, monthsAgo(now, 1))).length;
      const durations = closed.map((t) => { const a = Date.parse(t.createdAt); const b = Date.parse(t.closedAt); return Number.isFinite(a) && Number.isFinite(b) && b >= a ? (b - a) / DAY_MS : null; }).filter((d) => d !== null);
      const avgClose = durations.length ? Math.round((durations.reduce((s, d) => s + d, 0) / durations.length) * 10) / 10 : null;
      const all = (platformOf().tasks || []);
      const accepted = all.filter((t) => t.source === 'ai-accepted').length;
      const edited = all.filter((t) => t.source === 'ai-edited').length;
      const manual = all.filter((t) => t.source === 'manual').length;
      const acceptance = accepted + edited ? Math.round((accepted / (accepted + edited)) * 100) : null;
      return { open, overdue, closedThisMonth, closedLastMonth, avgClose, accepted, edited, manual, acceptance };
    }

    function paintKpis(tasks, now) {
      clear(kpiHost);
      const k = kpis(tasks, now);
      const newCount = k.open.filter((t) => t.status === 'جديدة').length;
      const inProgress = k.open.filter((t) => t.status === 'قيد التنفيذ').length;
      kpiHost.append(
        statTile({ label: 'مهام مفتوحة', value: k.open.length, icon: 'file-check', tone: 'brand', hint: `${fmt.num(newCount)} جديدة · ${fmt.num(inProgress)} قيد التنفيذ` }),
        statTile({ label: 'متأخرة', value: k.overdue.length, icon: 'clock', tone: k.overdue.length ? 'critical' : 'good', hint: k.overdue.length ? 'تجاوزت تاريخ الاستحقاق دون إغلاق' : 'لا توجد مهام متأخرة' }),
        statTile({ label: 'أُغلقت هذا الشهر', value: k.closedThisMonth, icon: 'good', tone: 'good', delta: k.closedThisMonth - k.closedLastMonth, deltaGoodWhen: 'up', hint: 'مقارنة بالشهر الماضي' }),
        statTile({ label: 'متوسط زمن الإغلاق', value: k.avgClose, unit: 'يوم', icon: 'clock', hint: 'من إنشاء المهمة حتى إغلاقها' }),
        statTile({ label: 'القبول مقابل التعديل', value: k.acceptance, unit: '%', icon: 'sliders', tone: k.acceptance === null ? null : (k.acceptance >= 70 ? 'good' : 'warning'), hint: `${fmt.num(k.accepted)} مقبولة كما هي · ${fmt.num(k.edited)} مُعدّلة · ${fmt.num(k.manual)} يدوية` }),
      );
    }

    /* ---------------- cards ---------------- */

    function dueCell(iso, now, done) {
      const overdue = !done && isOverdue(iso, now);
      return h('span', { class: ['row gap-1 due-cell', overdue ? 'is-overdue' : null], title: overdue ? 'متأخر عن موعد الاستحقاق' : undefined },
        glyph(overdue ? 'critical' : 'clock', 12), h('span', {}, fmt.date(iso, { style: 'short' })), overdue ? h('span', { class: 'sr-only' }, ' — متأخر') : null);
    }

    function writebackChip(task, { withResync = true } = {}) {
      const wb = task.writeback || {};
      const meta = WRITEBACK_META[wb.status] || { label: wb.status ? String(wb.status) : 'بدون كتابة عكسية', tone: 'neutral' };
      return h('span', { class: 'row gap-1 wrap writeback-chip' },
        badge(meta.label, meta.tone),
        withResync && wb.status === 'failed' && canStore('updateTask') ? button('إعادة المزامنة', { variant: 'outline', size: 'sm', onClick: (e) => { e.stopPropagation(); resync(task); } }) : null);
    }

    function taskCard(task, now) {
      const risk = riskOf(task);
      const overdue = task.status !== 'مغلقة' && (task.status === 'متأخرة' || isOverdue(task.dueDate, now));
      const el = h('div', { class: ['task-card stack gap-2', overdue ? 'is-overdue' : null], 'data-task': task.id },
        h('div', { class: 'row between gap-2 wrap' },
          h('span', { class: 'mono text-xs muted' }, task.code || task.id),
          risk
            ? h('span', { class: 'row gap-1 task-risk-ref', title: risk.title }, h('span', { class: 'mono text-xs' }, risk.code), ratingBadge(psel, ratingOf(psel, num(risk.score))))
            : badge('بدون مخاطرة مرتبطة', 'neutral')),
        h('p', { class: 'kanban-card-title' }, task.title || '—'),
        h('div', { class: 'kanban-card-meta' },
          h('span', { title: 'المالك' }, svgIcon('user', 12), task.owner || '—'),
          h('span', { class: overdue ? 'is-overdue' : null, title: 'تاريخ الاستحقاق' }, dueCell(task.dueDate, now, task.status === 'مغلقة')),
          h('span', { title: 'المشروع' }, svgIcon('helmet', 12), projectName(task.projectId))),
        h('div', { class: 'kanban-card-foot' },
          h('span', { class: 'row gap-1 wrap' }, sourceBadge(task.source), writebackChip(task)),
          button('', { variant: 'ghost', size: 'sm', icon: glyph('chevronEnd', 15), onClick: (e) => { e.stopPropagation(); openTask(task.id); }, attrs: { 'aria-label': `تفاصيل المهمة ${task.code || ''}` } })));
      el.addEventListener('click', (e) => { if (e.target.closest('button,a,input,select')) return; openTask(task.id); });
      return el;
    }

    function boardItems(tasks, now) {
      return tasks.map((t) => ({ id: t.id, columnId: TASK_STATUSES.includes(t.status) ? t.status : 'جديدة', render: () => taskCard(t, now) }));
    }

    /* ---------------- store actions ---------------- */

    function setStatus(task, status, { silent = false } = {}) {
      if (!requireStore('updateTask')) return;
      try {
        store.updateTask(task.id, { status });
        if (!silent) toast(`نُقلت المهمة ${task.code || ''} إلى «${status}»`, { tone: TASK_STATUS_TONE[status] === 'critical' ? 'warning' : 'accent' });
      } catch (err) { warnOnce('store.updateTask', err); toast('تعذر تحديث حالة المهمة', { tone: 'critical' }); }
    }

    function closeFlow(task) {
      if (!requireStore('updateTask')) return;
      const form = h('form', { class: 'stack gap-3', novalidate: true },
        h('p', { class: 'note text-sm' }, 'سجّل نتيجة المعالجة: تُغلق المخاطرة المرتبطة وتُسجَّل النتيجة في سجل التدقيق لتغذية إعادة معايرة النموذج.'),
        formField({ label: 'نتيجة المعالجة', name: 'outcome', type: 'textarea', required: true, rows: 3, placeholder: 'مثال: تم تعديل البند تعاقدياً وخُفّضت الدرجة إلى 28' }));
      const submit = () => {
        if (!form.reportValidity()) return false;
        const outcome = text(readForm(form).outcome);
        if (!outcome) { toast('أدخل نتيجة المعالجة', { tone: 'warning' }); return false; }
        try {
          store.updateTask(task.id, { status: 'مغلقة', outcome });
          toast(`أُغلقت المهمة ${task.code || ''} وسُجّلت النتيجة`, { tone: 'good' });
        } catch (err) { warnOnce('store.updateTask', err); toast('تعذر إغلاق المهمة', { tone: 'critical' }); return false; }
        return undefined;
      };
      const api = modal({ title: 'إغلاق المهمة', subtitle: `${task.code || ''} — ${task.title || ''}`, body: form, actions: [{ label: 'إلغاء', variant: 'ghost' }, { label: 'إغلاق المهمة', variant: 'primary', onClick: submit }] });
      form.addEventListener('submit', (e) => { e.preventDefault(); if (submit() !== false) api.close('action'); });
      api.open();
    }

    function resync(task) {
      if (!canStore('updateTask')) return;
      const wb = task.writeback || {};
      try {
        store.updateTask(task.id, { writeback: { ...wb, target: wb.target || 'Biltix PM', status: 'pending', at: localISO(nowDate()) } });
        toast('بدأت إعادة مزامنة المهمة مع Biltix PM', { tone: 'accent', title: task.code });
        addTimer(() => {
          try {
            store.updateTask(task.id, { writeback: { ...wb, target: wb.target || 'Biltix PM', status: 'synced', at: localISO(nowDate()) } });
            toast('تمت الكتابة العكسية إلى Biltix PM', { tone: 'good', title: task.code });
          } catch (err) { warnOnce('store.updateTask', err); }
        }, WRITEBACK_RESYNC_MS);
      } catch (err) { warnOnce('store.updateTask', err); toast('تعذر بدء إعادة المزامنة', { tone: 'critical' }); }
    }

    function manualTaskFlow() {
      if (!requireStore('addTask')) return;
      const now = nowDate();
      const filters = store.filters || {};
      const defaultProject = filters.siteId && filters.siteId !== 'all' ? filters.siteId : (sites()[0] ? sites()[0].id : '');
      const openRisks = (platformOf().aiRisks || []).filter((r) => r && r.status !== 'مغلق' && r.status !== 'مُتجاوز')
        .slice().sort((a, b) => String(a.projectId).localeCompare(String(b.projectId)) || String(a.code).localeCompare(String(b.code)));
      const riskOptions = [{ value: '', label: 'بدون ربط بمخاطرة' }].concat(openRisks.map((r) => ({ value: r.id, label: `${r.code} — ${String(r.title || '').slice(0, 56)} (${projectName(r.projectId)})` })));
      const form = h('form', { class: 'stack gap-3', novalidate: true },
        formField({ label: 'عنوان المهمة', name: 'title', type: 'text', required: true, placeholder: 'مثال: مراجعة بند غرامات التأخير مع الاستشاري' }),
        formField({ label: 'المشروع', name: 'projectId', type: 'select', value: defaultProject, required: true, options: sites().map((s) => ({ value: s.id, label: s.name })) }),
        formField({ label: 'المخاطرة المرتبطة', name: 'riskId', type: 'select', value: '', options: riskOptions, hint: 'اختياري — ربط المهمة بمخاطرة يُظهرها في سجل المخاطر الذكي.' }),
        formField({ label: 'المالك المسؤول', name: 'owner', type: 'text', required: true, value: USER }),
        formField({ label: 'تاريخ الاستحقاق', name: 'dueDate', type: 'date', required: true, value: plusDays(now, 7), min: isoDay(now) }));
      const submit = () => {
        if (!form.reportValidity()) return false;
        const data = readForm(form);
        const title = text(data.title); const owner = text(data.owner);
        if (!title || !owner) { toast('أكمل عنوان المهمة والمالك', { tone: 'warning' }); return false; }
        try {
          const created = store.addTask({ title, projectId: text(data.projectId) || defaultProject, riskId: text(data.riskId) || null, owner, dueDate: text(data.dueDate) || plusDays(now, 7), status: 'جديدة', source: 'manual' });
          toast(`أُضيفت المهمة اليدوية ${created && created.code ? created.code : ''}`.trim(), { tone: 'good' });
        } catch (err) { warnOnce('store.addTask', err); toast('تعذر إضافة المهمة', { tone: 'critical' }); return false; }
        return undefined;
      };
      const api = modal({ title: 'مهمة معالجة يدوية', subtitle: 'تُضاف بمصدر «يدوية» وتظهر في عمود «جديدة»', body: form, actions: [{ label: 'إلغاء', variant: 'ghost' }, { label: 'إضافة المهمة', variant: 'primary', onClick: submit }] });
      form.addEventListener('submit', (e) => { e.preventDefault(); if (submit() !== false) api.close('action'); });
      api.open();
    }

    /* ---------------- drawer ---------------- */

    function buildTaskBody(task) {
      const now = nowDate();
      const risk = riskOf(task);
      const overdue = task.status !== 'مغلقة' && (task.status === 'متأخرة' || isOverdue(task.dueDate, now));
      const wb = task.writeback || {};
      const wbMeta = WRITEBACK_META[wb.status] || { label: wb.status ? String(wb.status) : 'بدون كتابة عكسية', tone: 'neutral' };
      const details = kv([
        ['الحالة', h('span', { class: 'row gap-1 wrap' }, statusBadge(task.status), overdue ? badge('متأخرة عن الاستحقاق', 'critical') : null)],
        ['المصدر', sourceBadge(task.source)],
        ['المالك', task.owner || '—'],
        ['الاستحقاق', task.dueDate ? dueCell(task.dueDate, now, task.status === 'مغلقة') : '—'],
        ['المشروع', projectName(task.projectId)],
        ['أُنشئت', fmt.dateTime(task.createdAt)],
        ['أُغلقت', task.closedAt ? fmt.dateTime(task.closedAt) : '—'],
        ['النتيجة', task.outcome ? h('span', {}, task.outcome) : '—'],
      ]);
      details.classList.add('is-compact');

      const riskBlock = risk
        ? h('div', { class: ['recommendation', `tone-${ratingTone(psel, ratingOf(psel, num(risk.score)))}`, 'stack', 'gap-2'] },
          h('div', { class: 'row wrap gap-2' }, h('span', { class: 'mono' }, risk.code), ratingBadge(psel, ratingOf(psel, num(risk.score))), typeChip(psel, risk.type), h('span', { class: 'mono num text-xs muted' }, `الدرجة ${fmt.num(num(risk.score))}`)),
          h('p', { class: 'semibold' }, risk.title),
          risk.recommendation && risk.recommendation.action ? h('p', { class: 'text-sm ink-2' }, risk.recommendation.action) : null,
          h('div', { class: 'row' }, button('فتح المخاطرة في السجل الذكي', { variant: 'outline', size: 'sm', icon: 'shield-alert', onClick: () => { closeDrawer(); navigate('airisks', { risk: risk.id }); } })))
        : h('p', { class: 'note text-sm' }, 'هذه مهمة يدوية غير مرتبطة بمخاطرة مكتشفة.');

      const wbBlock = h('div', { class: 'stack gap-2' },
        kv([['الهدف', wb.target || 'Biltix PM'], ['الحالة', h('span', { class: 'row gap-2 wrap' }, badge(wbMeta.label, wbMeta.tone), wb.at ? h('span', { class: 'text-xs muted' }, fmt.relative(wb.at)) : null)]]),
        wb.status === 'failed' && canStore('updateTask') ? h('div', { class: 'row' }, button('إعادة المزامنة', { variant: 'primary', size: 'sm', onClick: () => resync(task) })) : null,
        settings().platform && settings().platform.writebackEnabled === false ? h('p', { class: 'note tone-warning text-xs' }, 'الكتابة العكسية معطّلة في الإعدادات.') : null);

      const actions = h('div', { class: 'row wrap gap-2' });
      if (task.status !== 'مغلقة') {
        if (task.status !== 'قيد التنفيذ') actions.appendChild(button('بدء التنفيذ', { variant: 'outline', icon: 'sliders', onClick: () => setStatus(task, 'قيد التنفيذ') }));
        actions.appendChild(button('إغلاق المهمة وتسجيل النتيجة', { variant: 'primary', icon: 'good', onClick: () => closeFlow(task) }));
      } else {
        actions.appendChild(button('إعادة فتح المهمة', { variant: 'outline', onClick: () => setStatus(task, 'قيد التنفيذ') }));
      }

      return h('div', { class: 'task-drawer-body' },
        h('div', { class: 'drawer-section' }, details),
        section('المخاطرة المرتبطة', riskBlock),
        section('الكتابة العكسية إلى Biltix PM', wbBlock),
        section('الإجراءات', actions));
    }

    const subtitleOf = (task) => `${task.code || task.id} · ${projectName(task.projectId)}`;

    function openTask(id) {
      const task = findTask(id);
      if (!task) { toast('لم يتم العثور على المهمة', { tone: 'warning' }); return; }
      if (drawerState && drawerState.api && drawerState.api.isOpen()) { drawerState.id = id; refreshDrawer(); return; }
      const api = drawer({
        title: task.title || task.code, subtitle: subtitleOf(task), size: 'md',
        body: () => buildTaskBody(task),
        onClose: () => { if (drawerState && drawerState.api === api) drawerState = null; },
      });
      api.el.classList.add('task-drawer');
      drawerState = { api, id };
      api.open();
    }
    function refreshDrawer() {
      if (!drawerState || !drawerState.api || !drawerState.api.isOpen()) return;
      const { api, id } = drawerState;
      const task = findTask(id);
      if (!task) { api.close('gone'); return; }
      const scroll = api.body.scrollTop;
      clear(api.body);
      api.body.appendChild(buildTaskBody(task));
      api.setTitle(task.title || task.code);
      const sub = api.el.querySelector('.drawer-sub');
      if (sub) sub.textContent = subtitleOf(task);
      api.body.scrollTop = scroll;
    }
    function closeDrawer() { if (drawerState && drawerState.api) drawerState.api.close('action'); }

    /* ---------------- paint & refresh ---------------- */

    function paint() {
      clear(boardHost);
      board = null;
      const state = stateOf();
      if (!state.platform || !Array.isArray(state.platform.tasks)) {
        clear(kpiHost);
        boardHost.appendChild(emptyState({ icon: 'file-check', title: 'بيانات المنصة غير متاحة بعد', text: 'لم تُحمَّل بيانات منصة إدارة المخاطر (state.platform).' }));
        return;
      }
      const now = nowDate();
      const tasks = visibleTasks();
      paintKpis(tasks, now);
      board = kanban({
        columns: TASK_STATUSES.map((status) => ({ id: status, label: status, tone: TASK_STATUS_TONE[status] })),
        items: boardItems(tasks, now),
        onMove: (id, toColumnId) => {
          const task = findTask(id);
          if (!task || task.status === toColumnId) return;
          if (toColumnId === 'مغلقة') { closeFlow(task); return; }
          setStatus(task, toColumnId);
        },
      });
      boardHost.appendChild(board.el);
    }

    function refresh() {
      if (!alive) return;
      if (!board) { paint(); refreshDrawer(); return; }
      const now = nowDate();
      const tasks = visibleTasks();
      paintKpis(tasks, now);
      board.update(boardItems(tasks, now));
      refreshDrawer();
    }

    function schedule() {
      if (!alive) return;
      if (raf) cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => { raf = 0; if (alive) refresh(); });
    }

    subs.push(bus.on('store:change', (payload) => {
      const path = payload && typeof payload.path === 'string' ? payload.path : '*';
      if (path.startsWith('feed')) return;
      if (/validation|pipelines|connectors|quarantine/.test(path) && !/tasks|aiRisks/.test(path)) return;
      schedule();
    }));
    subs.push(bus.on('filters:change', schedule));
    subs.push(bus.on('settings:change', schedule));

    paint();

    return () => {
      alive = false;
      if (raf) cancelAnimationFrame(raf);
      timers.forEach((id) => clearTimeout(id));
      timers.clear();
      subs.splice(0).forEach((unsub) => { try { unsub(); } catch { /* ignore */ } });
      if (drawerState && drawerState.api) {
        const api = drawerState.api;
        drawerState = null;
        try { api.close('navigate'); } catch { /* ignore */ }
      }
    };
  },
};
