/**
 * BILTIX Risk AI — mitigation tasks (js/views/tasks.js) — AIR-02. Owner: B-REGISTER.
 *
 *   Heading    code tag · title · lead · honest data status · Board / List toggle (?view=list) · New task
 *   Summary    open · overdue · closed this month · average time to close · acceptance (psel.taskKpis)
 *   Filters    owner · priority · source · search (+ a removable "risk AIR-…" chip from ?risk=)
 *   Board      kanban by status (New / In progress / Overdue / Closed) with guarded transitions:
 *              → Closed asks for the outcome (store.updateTask refuses a close without one);
 *              → Overdue only once the due date has passed; Closed → back reopens the task.
 *   List       dataTable (code, task, risk, owner, due, priority, status, source, write-back, attachments)
 *   Drawer     details · status actions · edit (title, due, priority, linked risk — store.editTask) ·
 *              assign (store.assignTask) · attachments (link / note / file metadata, this device only —
 *              store.addTaskAttachment / removeTaskAttachment) · write-back state labelled simulated in demo
 *              (store.retryWriteback) · linked risk → shared risk drawer
 *   Deep links ?id=TASK (or code) opens the drawer · ?new=1 (&risk=ID) opens the new-task form.
 *
 * Global filters: project and search always; the period limits closed tasks only. Live changes patch the
 * board / list and the open drawer in place. Strings: t('tasks.*') + shared t('risk.*').
 */

import { components } from '../ui/components.js';
import { i18n, t, tn } from '../core/i18n.js';
import { status as statusApi } from '../core/status.js';
import { motion } from '../ui/motion.js';
import tasksDict from '../i18n/tasks.js';
import {
  openRiskDrawer, envOf, ensureStyles, ACTOR, codeSpan, withCodes, dataText, numRun, riskTitle, person, siteName, taskTitle, taskStatusLabel,
  ratingBadge, ratingOf, dueCell, writebackChip, ownerField, ownerValue, readValues, showErrors, clearErrors, fieldErrors, failText,
  hashParams, patchHashParams, todayISO, safeHttpUrl, TERMINAL, errParams, prose,
} from './shared/risk-drawer.js';

i18n.register('tasks', tasksDict);

const { h, clear, glyph, svgIcon, button, segmented, kanban, dataTable, filterBar, modal, drawer, toast, formField, emptyState, errorState, kv, badge, statusBadge } = components;

const STATUSES = ['جديدة', 'قيد التنفيذ', 'متأخرة', 'مغلقة'];
const NEW = 'جديدة';
const PROGRESS = 'قيد التنفيذ';
const OVERDUE = 'متأخرة';
const CLOSED = 'مغلقة';
const STATUS_TONE = { [NEW]: 'brand', [PROGRESS]: 'accent', [OVERDUE]: 'critical', [CLOSED]: 'good' };
const PRIORITIES = ['high', 'medium', 'low'];
const PRIORITY_TONE = { high: 'serious', medium: 'warning', low: 'neutral' };
const SOURCES = ['ai-accepted', 'ai-edited', 'manual'];
const EVIDENCE_ICON = { link: 'link', note: 'pencil', file: 'folder' };
const DAY_MS = 86_400_000;
const memory = { view: null, filters: null };

const STYLE_ID = 'view-tasks-style';
const STYLE_TEXT = `
.view-tasks { display: flex; flex-direction: column; gap: var(--space-5); }
.view-tasks .view-actions { align-items: center; }
.tsk-summary { grid-template-columns: repeat(5, minmax(0, 1fr)); }
@media (max-width: 1099.98px) { .tsk-summary { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
@media (max-width: 599.98px) { .tsk-summary { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
.tsk-summary .summary-value { display: flex; align-items: baseline; gap: 6px; }
.tsk-summary .summary-cell .t-helper { font-size: 12px; color: var(--ink-3); line-height: 1.4; }
.tsk-summary .summary-label > svg { flex: none; }
.tsk-summary .tone-critical > svg { color: var(--critical-text); }
.tsk-summary .tone-good > svg { color: var(--good-text); }
.tsk-summary .tone-brand > svg { color: var(--brand-text); }
.tsk-bar-row { display: flex; flex-direction: column; gap: var(--space-2); }
.tsk-chips { display: flex; flex-wrap: wrap; gap: 6px; }
.tsk-chips:empty { display: none; }
.tsk-card { display: flex; flex-direction: column; gap: 8px; min-inline-size: 0; }
.tsk-card-top { display: flex; align-items: center; justify-content: space-between; gap: 6px; flex-wrap: wrap; }
.tsk-card .kanban-card-title { margin: 0; font-size: var(--fs-sm); font-weight: 500; color: var(--ink-1); line-height: 1.5; overflow-wrap: anywhere; }
.tsk-card-risk { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; font-size: 12px; color: var(--ink-3); }
.tsk-card-meta { display: flex; flex-wrap: wrap; gap: 4px 10px; align-items: center; font-size: 12px; color: var(--ink-2); }
.tsk-card-meta > span { display: inline-flex; align-items: center; gap: 4px; }
.tsk-card-meta svg { color: var(--ink-3); }
.tsk-card-foot { display: flex; align-items: center; justify-content: space-between; gap: 6px; flex-wrap: wrap; }
.tsk-prio { display: inline-flex; align-items: center; gap: 4px; font-size: 11px; font-weight: 500; padding: 0 7px; min-block-size: 20px; border-radius: 4px; border: 1px solid var(--line-2); color: var(--ink-2); background: var(--bg-2); }
.tsk-prio.is-high { color: var(--serious-text); border-color: color-mix(in srgb, var(--serious) 45%, var(--line)); }
.tsk-prio.is-medium { color: var(--warning-text); border-color: color-mix(in srgb, var(--warning) 45%, var(--line)); }
.tsk-list .table td { vertical-align: middle; }
.tsk-title { display: flex; flex-direction: column; gap: 2px; min-inline-size: 200px; max-inline-size: 440px; }
.tsk-title-main { font-weight: 500; color: var(--ink-1); line-height: 1.45; overflow-wrap: anywhere; }
.tsk-title-sub { font-size: 12px; color: var(--ink-3); }
.tsk-drawer .drawer-body { display: flex; flex-direction: column; gap: var(--space-5); }
.tsk-drawer .tsk-status-row { display: flex; flex-wrap: wrap; gap: 6px 8px; align-items: center; }
.tsk-drawer .evidence-list { margin: 0; padding: 0; }
.tsk-guard { font-size: 12px; color: var(--ink-3); display: flex; gap: 6px; align-items: flex-start; margin: 0; }
.tsk-guard > svg { flex: none; margin-block-start: 2px; }
`;

function ensureStyle() {
  ensureStyles();
  if (typeof document === 'undefined' || document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = STYLE_TEXT;
  document.head.appendChild(style);
}

const arr = (v) => (Array.isArray(v) ? v : []);
const text = (v) => (typeof v === 'string' ? v.trim() : (v == null ? '' : String(v)));
const cssEscape = (v) => (typeof CSS !== 'undefined' && typeof CSS.escape === 'function' ? CSS.escape(String(v)) : String(v).replace(/["\\]/g, '\\$&'));
function dateMs(v) { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(v || '')); return m ? new Date(+m[1], +m[2] - 1, +m[3]).getTime() : NaN; }

export default {
  id: 'tasks',
  code: 'AIR-02',
  get title() { return t('tasks.title'); },
  icon: 'file-check',

  render(container, ctx = {}) {
    ensureStyle();
    const env = envOf(ctx);
    const { store, bus, psel, fmt } = env;
    const router = ctx.router || null;
    let alive = true;
    let raf = 0;
    const unsubs = [];
    const overlays = new Set();
    let board = null;
    let table = null;
    let drawerState = null; // { api, id, forms: Map }

    const stateOf = () => store.state || {};
    const platform = () => stateOf().platform || {};
    const globalFilters = () => store.filters || stateOf().filters || { siteId: 'all', range: 30, search: '' };
    const now = () => store.now();
    const today0 = () => { const d = now(); return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime(); };
    const findTask = (id) => arr(platform().tasks).find((x) => x && (x.id === id || x.code === id)) || null;
    const riskOf = (task) => (task && task.riskId ? arr(platform().aiRisks).find((r) => r && r.id === task.riskId) || null : null);
    const isOverdue = (task) => task.status !== CLOSED && (task.status === OVERDUE || (task.dueDate && dateMs(task.dueDate) < today0()));
    const navigate = (id, params = {}) => { if (router && typeof router.navigate === 'function') router.navigate(id, params); };
    const demo = () => statusApi.mode(stateOf()) === 'demo';

    /* ── local state (view + filters survive a language re-mount through the URL / memory) ── */
    const hp = hashParams();
    const params = { ...(ctx.params || {}), ...hp };
    const local = {
      view: params.view === 'list' || params.view === 'board' ? params.view : (memory.view || 'board'),
      owner: params.owner || (memory.filters && memory.filters.owner) || 'all',
      priority: params.priority || (memory.filters && memory.filters.priority) || 'all',
      source: params.source || (memory.filters && memory.filters.source) || 'all',
      q: params.q || (memory.filters && memory.filters.q) || '',
      risk: params.risk && params.new !== '1' ? params.risk : null,
    };

    /* ── data ── */
    function allInScope() {
      const g = globalFilters();
      let groups = [];
      try { groups = arr(psel.tasksByStatus(stateOf(), g, now())); } catch { groups = []; }
      const range = Number(g.range) > 0 ? Number(g.range) : 30;
      const since = now().getTime() - range * DAY_MS;
      return groups.flatMap((gr) => arr(gr.items)).filter((x) => x.status !== CLOSED || (Date.parse(x.closedAt || x.updatedAt || x.createdAt) || 0) >= since);
    }
    function visibleTasks() {
      const g = globalFilters();
      const q = [text(g.search), text(local.q)].filter(Boolean).join(' ').toLowerCase();
      return allInScope().filter((x) => {
        if (local.owner !== 'all' && x.owner !== local.owner) return false;
        if (local.priority !== 'all' && (local.priority === 'none' ? !!x.priority : x.priority !== local.priority)) return false;
        if (local.source !== 'all' && x.source !== local.source) return false;
        if (local.risk && x.riskId !== local.risk && x.riskCode !== local.risk) return false;
        if (q) {
          const risk = x.risk || null;
          const hay = [x.code, x.title, taskTitle(x, risk), person(x.owner), x.owner, risk && risk.code, risk && riskTitle(risk)].map((v) => String(v || '').toLowerCase()).join(' ');
          if (!q.split(/\s+/).every((term) => hay.includes(term))) return false;
        }
        return true;
      });
    }
    const activeFilterCount = () => ['owner', 'priority', 'source'].filter((k) => local[k] !== 'all').length + (local.q ? 1 : 0) + (local.risk ? 1 : 0);

    /* ── heading ── */
    const viewSeg = segmented({
      options: [{ value: 'board', label: t('tasks.board'), icon: 'kanban' }, { value: 'list', label: t('tasks.list'), icon: 'list' }],
      value: local.view, ariaLabel: t('tasks.viewLabel'),
      onChange: (v) => { local.view = v; memory.view = v; patchHashParams({ view: v === 'list' ? 'list' : null }); paintBody({ rebuild: true }); },
    });
    viewSeg.el.classList.add('seg-sm');
    const newBtn = button(t('tasks.newTask'), { variant: 'primary', icon: 'plus', onClick: () => newTaskFlow({ trigger: newBtn }) });
    const head = h('header', { class: 'view-head' },
      h('div', { class: 'view-head-text' },
        h('span', { class: 'code-tag' }, 'AIR-02'),
        h('h1', { class: 't-page', tabindex: '-1' }, t('tasks.title')),
        h('p', { class: 'view-lead t-lead' }, t('tasks.lead'))),
      h('div', { class: 'view-actions' },
        statusBadge(statusApi.mode(stateOf())),
        button(t('tasks.register'), { variant: 'ghost', icon: 'shield-alert', onClick: () => navigate('airisks') }),
        viewSeg.el, newBtn));

    /* ── summary ── */
    const summary = h('div', { class: 'summary-strip tsk-summary', role: 'group', 'aria-label': t('tasks.summaryAria') });
    function cell(icon, tone, label, value, hint) {
      return h('div', { class: 'summary-cell' },
        h('span', { class: ['summary-label', `tone-${tone}`] }, tone === 'critical' || tone === 'good' ? glyph(tone, 14) : svgIcon(icon, 14), h('span', {}, label)),
        h('span', { class: 'summary-value' }, value),
        h('span', { class: 't-helper' }, hint));
    }
    function paintSummary() {
      clear(summary);
      let k = null;
      try { k = psel.taskKpis(stateOf(), globalFilters(), now()); } catch { k = null; }
      if (!k) return;
      const scope = allInScope();
      const nNew = scope.filter((x) => x.status === NEW).length;
      const nProg = scope.filter((x) => x.status === PROGRESS).length;
      const aiTotal = k.accepted + k.edited;
      summary.append(
        cell('file-check', 'brand', t('tasks.kpi.open'), numRun(fmt.num(k.open)), t('tasks.kpi.openHint', { new: fmt.num(nNew), progress: fmt.num(nProg) })),
        cell('clock', k.overdue ? 'critical' : 'good', t('tasks.kpi.overdue'), numRun(fmt.num(k.overdue)), k.overdue ? t('tasks.kpi.overdueHint') : t('tasks.kpi.overdueNone')),
        cell('check-circle', 'good', t('tasks.kpi.closed'), numRun(fmt.num(k.closedThisMonth)), t('tasks.kpi.closedHint')),
        cell('clock', 'neutral', t('tasks.kpi.avg'), k.avgCloseDays ? h('span', {}, t('tasks.kpi.avgValue', { days: fmt.num(k.avgCloseDays, { maximumFractionDigits: 1 }) })) : '—', k.avgCloseDays ? t('tasks.kpi.avgHint') : t('tasks.kpi.avgNone')),
        cell('sliders', 'neutral', t('tasks.kpi.acceptance'), aiTotal ? numRun(fmt.pct(k.acceptancePct)) : '—', aiTotal ? t('tasks.kpi.acceptanceHint', { accepted: fmt.num(k.accepted), edited: fmt.num(k.edited), manual: fmt.num(k.manual) }) : t('tasks.kpi.acceptanceNone')));
    }

    /* ── filters ── */
    function ownerList() {
      const set = new Set(allInScope().map((x) => text(x.owner)).filter(Boolean));
      if (local.owner !== 'all') set.add(local.owner);
      return Array.from(set).sort((a, b) => person(a).localeCompare(person(b), i18n.locale()));
    }
    const bar = filterBar({
      label: t('tasks.filters.label'),
      className: 'tsk-filter-bar',
      value: { owner: local.owner, priority: local.priority, source: local.source, q: local.q },
      filters: [
        { id: 'owner', type: 'select', label: t('tasks.filters.owner'), options: ownerList().map((o) => ({ value: o, label: person(o) })) },
        { id: 'priority', type: 'select', label: t('tasks.filters.priority'), options: PRIORITIES.map((p) => ({ value: p, label: t(`tasks.priority.${p}`) })).concat([{ value: 'none', label: t('tasks.priority.none') }]) },
        { id: 'source', type: 'select', label: t('tasks.filters.source'), options: SOURCES.map((s) => ({ value: s, label: i18n.label('taskSource', s) || s })) },
        { id: 'q', type: 'search', label: t('tasks.filters.search'), placeholder: t('tasks.filters.searchPh') },
      ],
      onChange: (v) => {
        local.owner = v.owner || 'all'; local.priority = v.priority || 'all'; local.source = v.source || 'all'; local.q = text(v.q);
        memory.filters = { owner: local.owner, priority: local.priority, source: local.source, q: local.q };
        patchHashParams({ owner: local.owner, priority: local.priority, source: local.source, q: local.q || null });
        paintBody({ resetPage: true });
      },
      onReset: () => { local.risk = null; patchHashParams({ risk: null }); },
    });
    const chips = h('div', { class: 'tsk-chips' });
    function paintChips() {
      clear(chips);
      if (!local.risk) return;
      const r = arr(platform().aiRisks).find((x) => x && (x.id === local.risk || x.code === local.risk));
      const code = r ? r.code : local.risk;
      chips.appendChild(h('button', { type: 'button', class: 'reg-chip', 'aria-label': t('tasks.filters.removeRisk', { code }), onClick: () => { local.risk = null; patchHashParams({ risk: null }); paintChips(); paintBody({ resetPage: true }); bar.el.querySelector('select')?.focus(); } },
        h('span', {}, t('tasks.filters.risk', { code })), svgIcon('close', 12)));
    }
    const filtersCard = h('div', { class: 'tsk-bar-row' }, bar.el, chips);

    /* ── body (board or list) ── */
    const bodyHost = h('div', { class: 'tsk-body' });
    const root = h('section', { class: 'view view-tasks' }, head, summary, filtersCard, bodyHost);
    container.appendChild(root);

    function priorityChip(p) {
      if (!PRIORITIES.includes(p)) return null;
      return h('span', { class: ['tsk-prio', `is-${p}`] }, glyph(PRIORITY_TONE[p] === 'neutral' ? 'neutral' : PRIORITY_TONE[p], 11), h('span', {}, t(`tasks.priority.${p}`)));
    }
    function statusChip(s) { return badge(taskStatusLabel(s), STATUS_TONE[s] || 'neutral'); }
    function riskRef(task) {
      const risk = task.risk || riskOf(task);
      if (!risk) return h('span', { class: 'risk-muted' }, t('tasks.noRisk'));
      return h('span', { class: 'tsk-card-risk' }, codeSpan(risk.code), ratingBadge(ratingOf(risk.score, env), { sm: true }));
    }

    function taskCard(task) {
      const risk = task.risk || riskOf(task);
      const overdue = isOverdue(task);
      const el = h('div', { class: 'tsk-card' },
        h('div', { class: 'tsk-card-top' }, codeSpan(task.code || task.id, 'text-xs'), priorityChip(task.priority)),
        h('p', { class: 'kanban-card-title' }, ...withCodes(taskTitle(task, risk))),
        riskRef(task),
        h('div', { class: 'tsk-card-meta' },
          h('span', {}, svgIcon('user', 12), dataText(person(task.owner))),
          dueCell(task.dueDate, overdue),
          arr(task.attachments).length ? h('span', {}, svgIcon('folder', 12), tn('tasks.attachmentsCount', arr(task.attachments).length)) : null),
        h('div', { class: 'tsk-card-foot' },
          writebackChip(task, env),
          button('', { variant: 'ghost', size: 'sm', icon: 'chevron-end', onClick: (e) => { e.stopPropagation(); openTask(task.id, { trigger: e.currentTarget }); }, attrs: { 'aria-label': t('tasks.details', { code: task.code || task.id }) } })));
      el.addEventListener('click', (e) => { if (e.target.closest('button,a,input,select')) return; openTask(task.id, { trigger: el.closest('.kanban-card') }); });
      return el;
    }
    const boardItems = (tasks) => tasks.map((x) => ({ id: x.id, code: x.code, title: taskTitle(x, x.risk), columnId: STATUSES.includes(x.status) ? x.status : NEW, render: () => taskCard(x) }));

    function listColumns() {
      return [
        { key: 'code', label: t('tasks.col.code'), priority: 'high', width: 100, render: (x) => codeSpan(x.code || x.id), sortValue: (x) => x.code },
        { key: 'title', label: t('tasks.col.title'), priority: 'high', render: (x) => h('span', { class: 'tsk-title' }, h('span', { class: 'tsk-title-main' }, ...withCodes(taskTitle(x, x.risk))), h('span', { class: 'tsk-title-sub' }, siteName(stateOf(), x.projectId))), sortValue: (x) => taskTitle(x, x.risk) },
        { key: 'risk', label: t('tasks.col.risk'), priority: 'medium', render: riskRef, sortValue: (x) => x.riskCode || '' },
        { key: 'owner', label: t('tasks.col.owner'), priority: 'medium', render: (x) => dataText(person(x.owner)), sortValue: (x) => person(x.owner) },
        { key: 'due', label: t('tasks.col.due'), priority: 'high', render: (x) => dueCell(x.dueDate, isOverdue(x)), sortValue: (x) => dateMs(x.dueDate) || null },
        { key: 'priority', label: t('tasks.col.priority'), priority: 'low', render: (x) => priorityChip(x.priority) || h('span', { class: 'risk-muted', title: t('tasks.priority.none') }, '—'), sortValue: (x) => (x.priority ? PRIORITIES.indexOf(x.priority) : 9) },
        { key: 'status', label: t('tasks.col.status'), priority: 'high', render: (x) => statusChip(x.status), sortValue: (x) => STATUSES.indexOf(x.status) },
        { key: 'source', label: t('tasks.col.source'), priority: 'low', render: (x) => h('span', { class: 'source-badge', 'data-source': x.source || '' }, i18n.label('taskSource', x.source) || x.source || '—'), sortValue: (x) => x.source },
        { key: 'writeback', label: t('tasks.col.writeback'), priority: 'low', render: (x) => writebackChip(x, env), sortValue: (x) => (x.writeback && x.writeback.status) || '' },
      ];
    }

    function emptyBlock(rowsTotal) {
      if (rowsTotal) return null;
      const filtered = activeFilterCount() > 0;
      return emptyState({
        icon: 'file-check', title: filtered ? t('tasks.emptyFiltered') : t('tasks.empty'), text: filtered ? t('tasks.emptyFilteredText') : t('tasks.emptyText'),
        action: filtered ? { label: t('tasks.clearFilters'), icon: 'refresh', onClick: () => { local.risk = null; patchHashParams({ risk: null }); paintChips(); bar.reset(); } } : { label: t('tasks.newTask'), icon: 'plus', onClick: () => newTaskFlow({}) },
      });
    }

    let lastSig = '';
    function paintBody({ rebuild = false, resetPage = false, live = false } = {}) {
      if (!alive) return;
      const p = platform();
      if (!Array.isArray(p.tasks)) {
        clear(bodyHost); board = null; table = null;
        bodyHost.appendChild(errorState({ title: t('tasks.noPlatform'), text: t('tasks.noPlatformText'), retry: () => paintBody({ rebuild: true }), retryLabel: t('tasks.retry') }));
        return;
      }
      const tasks = visibleTasks();
      const sig = `${local.view}|${tasks.length ? 1 : 0}`;
      if (rebuild || sig !== lastSig || (!board && !table)) {
        lastSig = sig;
        clear(bodyHost);
        board = null;
        if (table) { table.destroy(); table = null; }
        const empty = emptyBlock(tasks.length);
        if (empty) { bodyHost.appendChild(h('div', { class: 'card' }, h('div', { class: 'card-body' }, empty))); return; }
        if (local.view === 'list') {
          table = dataTable({ columns: listColumns(), rows: tasks, rowKey: 'id', pageSize: 12, caption: t('tasks.caption'), rowLabel: (x) => `${x.code} — ${taskTitle(x, x.risk)}`, onRowClick: (row, e) => openTask(row.id, { trigger: e && e.target && e.target.closest ? e.target.closest('tr')?.querySelector('.row-open') : null }) });
          bodyHost.appendChild(components.card({ code: 'TSK-02', title: t('tasks.list'), subtitle: tn('tasks.count', tasks.length), className: 'tsk-list', body: table.el }));
        } else {
          board = kanban({
            ariaLabel: t('tasks.boardAria'),
            columns: STATUSES.map((s) => ({ id: s, label: taskStatusLabel(s), tone: STATUS_TONE[s] })),
            items: boardItems(tasks),
            onMove: (id, to) => moveTask(id, to),
          });
          bodyHost.appendChild(board.el);
        }
        return;
      }
      if (table) {
        table.update(tasks, live ? { preserve: true, flash: true } : { resetPage });
        const sub = bodyHost.querySelector('.card-sub');
        if (sub) sub.textContent = tn('tasks.count', tasks.length);
      } else if (board) board.update(boardItems(tasks));
    }

    /* ── transitions with guards ── */
    function moveTask(id, to, { from = 'board' } = {}) {
      const task = findTask(id);
      if (!task || task.status === to) return;
      if (to === CLOSED) { closeFlow(task, { via: from }); return; }
      if (to === OVERDUE && !(task.dueDate && dateMs(task.dueDate) < today0())) {
        toast(t('tasks.guard.overdueFuture', { due: fmt.date(task.dueDate) }), { tone: 'warning', title: task.code });
        return;
      }
      if (task.status === CLOSED) { reopenFlow(task, { to }); return; }
      const res = store.updateTask(task.id, { status: to, by: ACTOR });
      if (!res) { toast(t('tasks.toast.failed'), { tone: 'warning', title: task.code }); return; }
      toast(t('tasks.toast.moved', { code: task.code, status: taskStatusLabel(to) }), { tone: 'neutral', title: task.code });
    }

    function openModal(opts) {
      let api = null;
      api = modal({ ...opts, onClose: (r) => { overlays.delete(api); if (opts.onClose) opts.onClose(r); } });
      overlays.add(api);
      api.open();
      return api;
    }

    function closeConsequence(task) {
      const risk = riskOf(task);
      if (!risk || TERMINAL.includes(risk.status)) return null;
      const assessed = risk.residualLikelihood && risk.residualImpact;
      return h('p', { class: 'tsk-guard' }, glyph('neutral', 12), assessed ? t('tasks.guard.riskWillClose', { code: risk.code }) : t('tasks.guard.riskResidual', { code: risk.code }));
    }

    function closeFlow(task) {
      const form = h('form', { class: 'stack gap-3', novalidate: true },
        h('p', { class: 'text-sm', style: { margin: 0, color: 'var(--ink-2)' } }, t('tasks.form.closeIntro')),
        formField({ label: t('tasks.form.outcome'), name: 'outcome', type: 'textarea', rows: 3, required: true, placeholder: t('tasks.form.outcomePh') }),
        closeConsequence(task));
      const submit = () => {
        clearErrors(form);
        const outcome = text(readValues(form).outcome);
        if (!outcome) { showErrors(form, [{ field: 'outcome', message: t('tasks.guard.closeNeedsOutcome') }]); return false; }
        const res = store.updateTask(task.id, { status: CLOSED, outcome, by: ACTOR });
        if (!res) { showErrors(form, [], { summary: t('tasks.toast.failed') }); return false; }
        toast(t('tasks.toast.closed', { code: task.code }), { tone: 'good', title: task.code });
        return undefined;
      };
      const api = openModal({ title: t('tasks.form.closeTitle'), subtitle: `${task.code} — ${taskTitle(task, riskOf(task))}`, body: form, actions: [{ label: t('risk.common.cancel'), variant: 'ghost' }, { label: t('tasks.form.closeSubmit'), variant: 'primary', icon: 'check', onClick: submit }] });
      form.addEventListener('submit', (e) => { e.preventDefault(); if (submit() !== false) api.close('action'); });
    }

    function reopenFlow(task, { to = PROGRESS } = {}) {
      const res = store.updateTask(task.id, { status: to === CLOSED ? PROGRESS : to, by: ACTOR });
      if (!res) { toast(t('tasks.toast.failed'), { tone: 'warning', title: task.code }); return; }
      toast(t('tasks.toast.reopened', { code: task.code }), { tone: 'warning', title: task.code });
    }

    /* ── new task ── */
    function newTaskFlow({ trigger = null, riskId = null } = {}) {
      const state = stateOf();
      const g = globalFilters();
      const preRisk = riskId ? arr(platform().aiRisks).find((r) => r && (r.id === riskId || r.code === riskId)) : null;
      const projectDefault = preRisk ? preRisk.projectId : (g.siteId && g.siteId !== 'all' ? g.siteId : '');
      const openRisks = arr(platform().aiRisks).filter((r) => r && !TERMINAL.includes(r.status)).slice().sort((a, b) => String(a.code).localeCompare(String(b.code)));
      const form = h('form', { class: 'stack gap-3', novalidate: true },
        h('div', { class: 'risk-form-grid' },
          h('div', { class: 'is-full' }, formField({ label: t('tasks.form.title'), name: 'title', type: 'text', required: true, placeholder: t('tasks.form.titlePh') })),
          formField({ label: t('tasks.form.project'), name: 'projectId', type: 'select', required: true, value: projectDefault, placeholder: t('tasks.form.projectPh'), options: arr(state.sites).map((s) => ({ value: s.id, label: siteName(state, s.id) })) }),
          formField({ label: t('tasks.form.risk'), name: 'riskId', type: 'select', value: preRisk ? preRisk.id : '', hint: t('tasks.form.riskHint'), options: [{ value: '', label: t('tasks.form.riskNone') }].concat(openRisks.map((r) => ({ value: r.id, label: `${r.code} — ${riskTitle(r).slice(0, 60)}` }))) }),
          ownerField(state, { value: preRisk && preRisk.owner ? preRisk.owner : '' }),
          formField({ label: t('risk.form.due'), name: 'dueDate', type: 'date', required: true, min: todayISO(env) }),
          formField({ label: t('tasks.form.priority'), name: 'priority', type: 'select', value: '', options: [{ value: '', label: t('tasks.priority.none') }].concat(PRIORITIES.map((p) => ({ value: p, label: t(`tasks.priority.${p}`) }))) }),
          h('div', { class: 'is-full' }, formField({ label: t('tasks.form.description'), name: 'description', type: 'textarea', rows: 2 }))));
      const submit = () => {
        clearErrors(form);
        const v = readValues(form);
        const errors = [];
        if (!text(v.title)) errors.push({ field: 'title', message: t('tasks.form.titleRequired') });
        if (!text(v.projectId)) errors.push({ field: 'projectId', message: t('tasks.form.projectRequired') });
        const owner = ownerValue(v);
        if (!owner) errors.push({ field: 'owner', message: t('risk.err.field.owner.required', errParams()) });
        const due = text(v.dueDate);
        if (!due) errors.push({ field: 'dueDate', message: t('risk.err.field.dueDate.required', errParams()) });
        else if (due < todayISO(env)) errors.push({ field: 'dueDate', message: t('risk.err.field.dueDate.past', errParams()) });
        if (errors.length) { showErrors(form, errors, { summary: t('tasks.form.summary') }); return false; }
        let created = null;
        try { created = store.addTask({ title: text(v.title), projectId: text(v.projectId), riskId: text(v.riskId) || null, owner, dueDate: due, priority: v.priority || null, description: text(v.description), status: NEW, source: 'manual' }); } catch { created = null; }
        if (!created || created.ok === false) { showErrors(form, [], { summary: t('tasks.toast.failed') }); return false; }
        toast(t('tasks.toast.created', { code: created.code }), { tone: 'good', title: created.code });
        return undefined;
      };
      const api = openModal({ title: t('tasks.form.newTitle'), subtitle: t('tasks.form.newSub'), body: form, size: 'lg', returnFocus: trigger, actions: [{ label: t('risk.common.cancel'), variant: 'ghost' }, { label: t('tasks.form.submitNew'), variant: 'primary', icon: 'plus', onClick: submit }] });
      form.addEventListener('submit', (e) => { e.preventDefault(); if (submit() !== false) api.close('action'); });
    }

    /* ── drawer ── */
    function openTask(id, { trigger = null } = {}) {
      const task = findTask(id);
      if (!task) { toast(t('tasks.notFound'), { tone: 'warning' }); patchHashParams({ id: null }); return; }
      if (drawerState && drawerState.api.isOpen()) { drawerState.id = task.id; drawerState.forms.clear(); refreshDrawer(true); patchHashParams({ id: task.code || task.id }); return; }
      const st = { id: task.id, forms: new Map(), sig: '', api: null };
      st.api = drawer({
        title: prose(taskTitle(task, riskOf(task))), subtitle: ' ', size: 'lg', className: 'tsk-drawer', returnFocus: trigger,
        body: () => h('div', { class: 'tsk-drawer-body stack gap-5' }),
        onClose: (reason) => {
          if (drawerState === st) drawerState = null;
          if (['close', 'escape', 'backdrop', 'action'].includes(reason)) patchHashParams({ id: null });
        },
      });
      st.api.el.addEventListener('input', (e) => remember(st, e.target));
      st.api.el.addEventListener('change', (e) => remember(st, e.target));
      drawerState = st;
      refreshDrawer(true);
      st.api.open();
      patchHashParams({ id: task.code || task.id });
    }
    function remember(st, el) {
      const f = el && el.closest && el.closest('[data-form]');
      if (!f || !el.name) return;
      const entry = st.forms.get(f.dataset.form) || { values: {} };
      if (el.type === 'radio') { if (el.checked) entry.values[el.name] = el.value; } else if (el.type === 'file') entry.file = el.files && el.files[0] ? el.files[0] : null;
      else if (el.type === 'checkbox') entry.values[el.name] = el.checked; else entry.values[el.name] = el.value;
      st.forms.set(f.dataset.form, entry);
    }
    function drawerSig(task) {
      const risk = riskOf(task);
      return [task.updatedAt, task.status, task.owner, task.dueDate, task.priority, task.title, arr(task.attachments).length, task.writeback && task.writeback.status, task.writeback && task.writeback.at, risk && risk.status, risk && risk.updatedAt].join('|');
    }
    function refreshDrawer(force = false) {
      const st = drawerState;
      if (!st) return;
      const task = findTask(st.id);
      if (!task) { st.api.close('gone'); return; }
      const sig = drawerSig(task);
      if (!force && sig === st.sig) return;
      st.sig = sig;
      const a = document.activeElement;
      const focusInfo = a && st.api.el.contains(a) ? (a.closest('[data-form]') && a.name ? { form: a.closest('[data-form]').dataset.form, name: a.name } : (a.dataset && a.dataset.focusKey ? { key: a.dataset.focusKey } : null)) : null;
      const scroll = st.api.body.scrollTop;
      st.api.setTitle(prose(taskTitle(task, riskOf(task))));
      const sub = st.api.el.querySelector('.drawer-sub');
      if (sub) { clear(sub); sub.append(codeSpan(task.code || task.id), ' · ', siteName(stateOf(), task.projectId)); }
      const bodyEl = st.api.body.firstElementChild || st.api.body;
      clear(bodyEl);
      bodyEl.appendChild(drawerContent(st, task));
      st.api.body.scrollTop = scroll;
      if (focusInfo) {
        const target = focusInfo.form
          ? st.api.el.querySelector(`[data-form="${cssEscape(focusInfo.form)}"] [name="${cssEscape(focusInfo.name)}"]`)
          : st.api.el.querySelector(`[data-focus-key="${cssEscape(focusInfo.key)}"]`);
        if (target) { try { target.focus({ preventScroll: true }); } catch { target.focus(); } }
      }
    }

    function section(title, sub, actions, ...children) {
      return h('section', { class: 'risk-sec' },
        h('div', { class: 'risk-sec-head' }, h('div', {}, h('h3', { class: 'risk-sec-title t-card' }, title), sub ? h('p', { class: 'risk-sec-sub' }, sub) : null), actions || null),
        ...children);
    }

    function inline(st, id, { title, intro, body, submitLabel, icon, onSubmit }) {
      const saved = (st.forms.get(id) || {}).values || {};
      const form = h('form', { class: 'risk-inline-form', 'data-form': id, novalidate: true, 'aria-label': title },
        h('p', { class: 'form-title' }, title), intro ? h('p', { class: 'form-intro' }, intro) : null, body,
        h('div', { class: 'form-actions' }, button(submitLabel, { variant: 'primary', icon, attrs: { type: 'submit' } }), button(t('risk.common.cancel'), { variant: 'ghost', onClick: () => { st.forms.delete(id); refreshDrawer(true); focusKey(`open-${id}`); } })));
      for (const [name, value] of Object.entries(saved)) {
        form.querySelectorAll(`[name="${cssEscape(name)}"]`).forEach((c) => {
          if (c.type === 'radio') c.checked = String(c.value) === String(value); else if (c.type === 'checkbox') c.checked = !!value; else if (c.type !== 'file') c.value = value;
        });
      }
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        clearErrors(form);
        let res;
        try { res = onSubmit(readValues(form)); } catch { res = { ok: false, message: t('tasks.toast.failed') }; }
        if (res && res.ok === false) { showErrors(form, res.errors || [], { summary: res.message || null }); return; }
        st.forms.delete(id);
        refreshDrawer(true);
        focusKey(`open-${id}`);
      });
      return form;
    }
    function focusKey(key) {
      requestAnimationFrame(() => { const el = drawerState && drawerState.api.el.querySelector(`[data-focus-key="${cssEscape(key)}"]`); if (el) { try { el.focus({ preventScroll: true }); } catch { el.focus(); } } });
    }
    function openInline(st, id) {
      st.forms.set(id, st.forms.get(id) || { values: {} });
      refreshDrawer(true);
      requestAnimationFrame(() => {
        const f = st.api.el.querySelector(`[data-form="${cssEscape(id)}"]`);
        if (!f) return;
        try { f.scrollIntoView({ block: 'nearest', behavior: motion.enabled() ? 'smooth' : 'auto' }); } catch { /* ignore */ }
        const first = f.querySelector('input:not([type="hidden"]), select, textarea');
        if (first) { try { first.focus({ preventScroll: true }); } catch { first.focus(); } }
      });
    }

    function drawerContent(st, task) {
      const risk = riskOf(task);
      const closed = task.status === CLOSED;
      const overdue = isOverdue(task);
      const wrap = h('div', { class: 'stack gap-5' });

      /* status + actions */
      const actions = [];
      if (!closed) {
        if (task.status !== PROGRESS) actions.push(button(t('tasks.action.start'), { variant: 'outline', icon: 'play', onClick: () => moveTask(task.id, PROGRESS, { from: 'drawer' }) }));
        if (task.status !== OVERDUE && task.dueDate && dateMs(task.dueDate) < today0()) actions.push(button(t('tasks.action.markOverdue'), { variant: 'outline', icon: 'clock', onClick: () => moveTask(task.id, OVERDUE, { from: 'drawer' }) }));
        if (!st.forms.has('close')) actions.push(button(t('tasks.action.close'), { variant: 'primary', icon: 'check', onClick: () => openInline(st, 'close'), attrs: { 'data-focus-key': 'open-close' } }));
      } else if (!st.forms.has('reopen')) actions.push(button(t('tasks.action.reopen'), { variant: 'outline', icon: 'refresh', onClick: () => moveTask(task.id, PROGRESS, { from: 'drawer' }), attrs: { 'data-focus-key': 'open-reopen' } }));
      wrap.appendChild(section(t('tasks.drawer.status'), null, null,
        h('div', { class: 'tsk-status-row' }, statusChip(task.status), overdue ? badge(t('risk.common.overdue'), 'critical', { icon: 'clock' }) : null, priorityChip(task.priority), h('span', { class: 'source-badge', 'data-source': task.source || '' }, i18n.label('taskSource', task.source) || task.source)),
        h('div', { class: 'risk-actions' }, ...actions),
        st.forms.has('close') && !closed ? inline(st, 'close', {
          title: t('tasks.form.closeTitle'), intro: t('tasks.form.closeIntro'), submitLabel: t('tasks.form.closeSubmit'), icon: 'check',
          body: h('div', { class: 'stack gap-2' }, formField({ label: t('tasks.form.outcome'), name: 'outcome', type: 'textarea', rows: 3, required: true, placeholder: t('tasks.form.outcomePh') }), closeConsequence(task)),
          onSubmit: (v) => {
            if (!text(v.outcome)) return { ok: false, errors: [{ field: 'outcome', message: t('tasks.guard.closeNeedsOutcome') }] };
            const res = store.updateTask(task.id, { status: CLOSED, outcome: text(v.outcome), by: ACTOR });
            if (!res) return { ok: false, message: t('tasks.toast.failed') };
            toast(t('tasks.toast.closed', { code: task.code }), { tone: 'good', title: task.code });
            return { ok: true };
          },
        }) : null));

      /* details + edit + assign */
      const details = kv([
        [t('tasks.drawer.project'), siteName(stateOf(), task.projectId)],
        [t('tasks.drawer.owner'), dataText(person(task.owner))],
        [t('tasks.drawer.due'), dueCell(task.dueDate, overdue, { short: false })],
        [t('tasks.drawer.priority'), priorityChip(task.priority) || t('tasks.priority.none')],
        [t('tasks.drawer.created'), fmt.dateTime(task.createdAt)],
        [t('tasks.drawer.closed'), task.closedAt ? fmt.dateTime(task.closedAt) : '—'],
        [t('tasks.drawer.outcome'), task.outcome ? h('span', {}, ...withCodes(i18n.lang() === 'en' ? (text(i18n.L(task, 'outcome', 'tasks')) || task.outcome) : task.outcome)) : '—'],
        text(task.description) ? [t('tasks.drawer.description'), h('span', {}, ...withCodes(task.description))] : null,
      ]);
      details.classList.add('is-compact');
      const detailActions = closed ? null : h('div', { class: 'risk-actions' },
        !st.forms.has('edit') ? button(t('tasks.drawer.edit'), { variant: 'outline', size: 'sm', icon: 'edit', onClick: () => openInline(st, 'edit'), attrs: { 'data-focus-key': 'open-edit' } }) : null,
        !st.forms.has('assign') ? button(t('tasks.drawer.assign'), { variant: 'outline', size: 'sm', icon: 'user', onClick: () => openInline(st, 'assign'), attrs: { 'data-focus-key': 'open-assign' } }) : null);
      const openRisks = arr(platform().aiRisks).filter((r) => r && (!TERMINAL.includes(r.status) || r.id === task.riskId)).slice().sort((a, b) => String(a.code).localeCompare(String(b.code)));
      wrap.appendChild(section(t('tasks.drawer.details'), null, detailActions,
        details,
        closed ? h('p', { class: 'tsk-guard' }, glyph('neutral', 12), t('tasks.guard.closedEdit')) : null,
        st.forms.has('edit') && !closed ? inline(st, 'edit', {
          title: t('tasks.form.editTitle'), submitLabel: t('tasks.form.editSubmit'), icon: 'check',
          body: h('div', { class: 'risk-form-grid' },
            h('div', { class: 'is-full' }, formField({ label: t('tasks.form.title'), name: 'title', type: 'text', required: true, value: task.title })),
            formField({ label: t('risk.form.due'), name: 'dueDate', type: 'date', required: true, value: task.dueDate || '' }),
            formField({ label: t('tasks.form.priority'), name: 'priority', type: 'select', value: task.priority || '', options: [{ value: '', label: t('tasks.priority.none') }].concat(PRIORITIES.map((p) => ({ value: p, label: t(`tasks.priority.${p}`) }))) }),
            h('div', { class: 'is-full' }, formField({ label: t('tasks.form.risk'), name: 'riskId', type: 'select', value: task.riskId || '', options: [{ value: '', label: t('tasks.form.riskNone') }].concat(openRisks.map((r) => ({ value: r.id, label: `${r.code} — ${riskTitle(r).slice(0, 60)}` }))) }))),
          onSubmit: (v) => {
            const patch = { title: text(v.title), dueDate: text(v.dueDate), priority: v.priority || null, riskId: v.riskId || null };
            const errors = [];
            if (!patch.title) errors.push({ field: 'title', message: t('tasks.form.titleRequired') });
            if (!patch.dueDate) errors.push({ field: 'dueDate', message: t('risk.err.field.dueDate.required', errParams()) });
            if (errors.length) return { ok: false, errors };
            if (typeof store.editTask !== 'function') return { ok: false, message: t('risk.err.unavailable') };
            const res = store.editTask(task.id, patch, { by: ACTOR });
            if (!res || res.ok === false) return { ok: false, message: failText(res), errors: fieldErrors(res && res.errors) };
            toast(res.changed && res.changed.length ? t('tasks.toast.edited', { code: task.code }) : t('tasks.toast.noChange'), { tone: res.changed && res.changed.length ? 'good' : 'neutral', title: task.code });
            return { ok: true };
          },
        }) : null,
        st.forms.has('assign') && !closed ? inline(st, 'assign', {
          title: t('tasks.form.assignTitle'), submitLabel: t('tasks.form.assignSubmit'), icon: 'user',
          body: h('div', { class: 'risk-form-grid' }, ownerField(stateOf(), { value: task.owner || '' })),
          onSubmit: (v) => {
            const owner = ownerValue(v);
            if (!owner) return { ok: false, errors: [{ field: 'owner', message: t('risk.err.field.owner.required', errParams()) }] };
            if (typeof store.assignTask !== 'function') return { ok: false, message: t('risk.err.unavailable') };
            const res = store.assignTask(task.id, owner, { by: ACTOR });
            if (!res || res.ok === false) return { ok: false, message: failText(res), errors: fieldErrors(res && res.errors) };
            toast(res.changed ? t('tasks.toast.assigned', { code: task.code, owner: person(owner) }) : t('tasks.toast.noChange'), { tone: res.changed ? 'good' : 'neutral', title: task.code });
            return { ok: true };
          },
        }) : null));

      /* linked risk */
      wrap.appendChild(section(t('tasks.drawer.risk'), null,
        risk ? button(t('tasks.drawer.openRisk'), { variant: 'outline', size: 'sm', icon: 'shield-alert', onClick: () => { const rid = risk.id; st.api.close('navigate'); patchHashParams({ id: null }); setTimeout(() => openRiskDrawer(ctx, rid, { urlParam: false }), 220); } }) : null,
        risk
          ? h('div', { class: 'risk-list-item' }, h('div', { class: 'risk-list-main' },
            h('span', { class: 'risk-list-title' }, codeSpan(risk.code), ' ', ...withCodes(riskTitle(risk))),
            h('span', { class: 'risk-list-meta' }, ratingBadge(ratingOf(risk.score, env), { sm: true }), numRun(`${fmt.num(Number(risk.score))}/${fmt.num(100)}`), badge(i18n.label('aiRiskStatus', risk.status) || risk.status, 'neutral'))))
          : h('p', { class: 'text-sm risk-muted', style: { margin: 0 } }, t('tasks.drawer.noRisk'))));

      /* attachments */
      const atts = arr(task.attachments).slice().sort((a, b) => (Date.parse(b.addedAt) || 0) - (Date.parse(a.addedAt) || 0));
      wrap.appendChild(section(t('tasks.drawer.attachments'), t('tasks.drawer.attachmentsSub'),
        !st.forms.has('att') ? button(t('tasks.drawer.addAttachment'), { variant: 'outline', size: 'sm', icon: 'plus', onClick: () => openInline(st, 'att'), attrs: { 'data-focus-key': 'open-att' } }) : null,
        atts.length ? h('ul', { class: 'evidence-list' }, atts.map((a) => attItem(task, a))) : h('p', { class: 'text-sm risk-muted', style: { margin: 0 } }, t('tasks.drawer.noAttachments')),
        st.forms.has('att') ? attForm(st, task) : null));

      /* write-back */
      const wb = task.writeback || {};
      const enabled = !((stateOf().settings || {}).platform && stateOf().settings.platform.writebackEnabled === false);
      const wbKv = kv([
        [t('tasks.drawer.target'), 'BILTIX PM'],
        [t('tasks.drawer.wbState'), writebackChip(task, env)],
        [t('tasks.drawer.wbAt'), wb.at ? h('span', { title: fmt.dateTime(wb.at) }, fmt.relative(wb.at)) : '—'],
      ]);
      wbKv.classList.add('is-compact');
      wrap.appendChild(section(t('tasks.drawer.writeback'), null,
        wb.status === 'failed' && typeof store.retryWriteback === 'function' ? button(t('tasks.drawer.retry'), { variant: 'outline', size: 'sm', icon: 'refresh', onClick: () => { store.retryWriteback(task.id); toast(t('tasks.toast.retry', { code: task.code }), { tone: 'neutral', title: task.code }); } }) : null,
        wbKv,
        demo() ? h('p', { class: 'note text-sm is-demo', style: { '--tone': 'var(--accent)', margin: 0 } }, t('tasks.drawer.writebackDemo')) : null,
        !enabled ? h('p', { class: 'tsk-guard' }, glyph('warning', 12), t('tasks.drawer.writebackOff')) : null));
      return wrap;
    }

    function attItem(task, a) {
      const url = a.kind === 'link' ? safeHttpUrl(a.url) : null;
      const title = i18n.lang() === 'en' ? (text(a.titleEn) || text(a.title)) : text(a.title);
      return h('li', { class: 'evidence-item', 'data-kind': a.kind || 'note' },
        h('span', { class: 'evidence-icon', 'aria-hidden': 'true' }, svgIcon(EVIDENCE_ICON[a.kind] || 'file-text', 16)),
        h('span', { class: 'evidence-body' },
          url ? h('a', { class: 'evidence-title', href: url, target: '_blank', rel: 'noopener noreferrer' }, title || url) : h('span', { class: 'evidence-title' }, ...withCodes(title || '—')),
          a.kind === 'note' && a.note ? h('span', { class: 'text-sm', style: { color: 'var(--ink-2)' } }, ...withCodes(a.note)) : null,
          h('span', { class: 'evidence-meta' }, h('span', {}, i18n.label('evidenceKind', a.kind) || a.kind), a.by ? h('span', {}, dataText(person(a.by))) : null, a.addedAt ? h('span', {}, fmt.date(a.addedAt)) : null, a.fileName ? h('span', { dir: 'auto' }, a.fileName) : null)),
        h('span', { class: 'evidence-local', title: t('risk.ev.localTitle') }, t('risk.ev.local')),
        h('span', { class: 'evidence-actions' }, button('', { variant: 'ghost', size: 'sm', icon: 'trash', attrs: { 'aria-label': t('risk.ev.remove', { title }), title: t('risk.ev.removeShort') }, onClick: () => {
          const res = typeof store.removeTaskAttachment === 'function' ? store.removeTaskAttachment(task.id, a.id, { by: ACTOR }) : null;
          if (res && res.ok) toast(t('tasks.toast.removed'), { tone: 'neutral', title: task.code }); else toast(failText(res), { tone: 'warning', title: task.code });
        } })));
    }

    function attForm(st, task) {
      const saved = (st.forms.get('att') || {}).values || {};
      const kindSaved = saved.kind || 'link';
      const kindField = h('fieldset', { class: 'field risk-checks', 'data-name': 'kind' }, h('legend', {}, t('risk.ev.formKind')),
        ...['link', 'note', 'file'].map((k) => h('label', { class: 'risk-check' }, h('input', { type: 'radio', name: 'kind', value: k, checked: k === kindSaved ? true : undefined }), h('span', {}, i18n.label('evidenceKind', k) || k))));
      const body = h('div', { class: 'risk-form-grid' },
        h('div', { class: 'is-full' }, kindField),
        h('div', { class: 'is-full' }, formField({ label: t('risk.ev.formTitle'), name: 'title', type: 'text', required: true, placeholder: t('risk.ev.formTitlePh') })),
        h('div', { class: 'is-full', 'data-kind-slot': 'link' }, formField({ label: t('risk.ev.formUrl'), name: 'url', type: 'url', placeholder: 'https://', hint: t('risk.ev.formUrlHint') })),
        h('div', { class: 'is-full', 'data-kind-slot': 'note' }, formField({ label: t('risk.ev.formNote'), name: 'note', type: 'textarea', rows: 3 })),
        h('div', { class: 'is-full', 'data-kind-slot': 'file' }, h('div', { class: 'field', 'data-name': 'fileName' }, h('label', { class: 'field-label', for: 'tsk-att-file' }, t('risk.ev.formFile')), h('input', { type: 'file', id: 'tsk-att-file', name: 'file', class: 'risk-file-input' }), h('p', { class: 'field-hint' }, t('risk.ev.formFileHint')))));
      const sync = (k) => body.querySelectorAll('[data-kind-slot]').forEach((n) => { n.hidden = n.dataset.kindSlot !== k; });
      kindField.addEventListener('change', (e) => { if (e.target.name === 'kind') sync(e.target.value); });
      sync(kindSaved);
      return inline(st, 'att', {
        title: t('tasks.form.attTitle'), intro: t('tasks.form.attIntro'), body, submitLabel: t('tasks.form.attSubmit'), icon: 'plus',
        onSubmit: (v) => {
          if (typeof store.addTaskAttachment !== 'function') return { ok: false, message: t('risk.err.unavailable') };
          const kind = v.kind || 'link';
          const payload = { kind, title: text(v.title) };
          if (kind === 'link') payload.url = text(v.url);
          if (kind === 'note') payload.note = text(v.note);
          if (kind === 'file') { const f = v.file || (st.forms.get('att') || {}).file; if (f) { payload.fileName = f.name; payload.size = f.size; payload.mime = f.type; } }
          const res = store.addTaskAttachment(task.id, payload, { by: ACTOR });
          if (!res || res.ok === false) return { ok: false, message: failText(res), errors: fieldErrors(res && res.errors, { size: 'fileName' }) };
          toast(t('tasks.toast.attached'), { tone: 'good', title: task.code });
          return { ok: true };
        },
      });
    }

    /* ── live updates ── */
    function schedule() {
      if (!alive || raf) return;
      raf = requestAnimationFrame(() => { raf = 0; if (!alive) return; paintSummary(); paintBody({ live: true }); refreshDrawer(); });
    }
    unsubs.push(bus.on('store:change', (payload) => {
      const path = payload && typeof payload.path === 'string' ? payload.path : '*';
      if (path !== '*' && !/^(platform\.(tasks|aiRisks)|platform$|sites|settings)/.test(path)) return;
      schedule();
    }));
    unsubs.push(bus.on('filters:change', () => { if (!alive) return; paintSummary(); paintBody({ resetPage: true }); }));
    unsubs.push(bus.on('ui:route-leave', () => { if (drawerState) { try { drawerState.api.close('navigate'); } catch { /* ignore */ } } }));

    paintChips();
    paintSummary();
    paintBody({ rebuild: true });
    motion.enter([head, summary, filtersCard, bodyHost], { y: 6 });

    // Deep links: ?id=TASK opens the drawer; ?new=1 (&risk=ID) opens the new-task form.
    const timer = setTimeout(() => {
      if (!alive) return;
      if (params.new === '1' || params.new === 'true') {
        patchHashParams({ new: null, risk: null });
        newTaskFlow({ riskId: params.risk || null });
      } else if (params.id || params.task) openTask(params.id || params.task);
    }, 0);

    return () => {
      alive = false;
      clearTimeout(timer);
      if (raf) cancelAnimationFrame(raf);
      unsubs.splice(0).forEach((u) => { try { u(); } catch { /* ignore */ } });
      Array.from(overlays).forEach((o) => { try { o.close('navigate'); } catch { /* ignore */ } });
      overlays.clear();
      if (table) table.destroy();
      if (board && typeof board.destroy === 'function') board.destroy();
      if (drawerState) { const api = drawerState.api; drawerState = null; try { api.close('navigate'); } catch { /* ignore */ } }
    };
  },
};
