/**
 * BILTIX Risk AI — shared AI-risk register (js/views/shared/risk-register.js). Owner: B-REGISTER.
 * Used by airisks.js and cockpit.js (B-COCKPIT, section F).
 *
 *   riskRegister(ctx, { filters, pageSize = 10, onOpen, onFilterChange, urlSync = true, stateKey, title, subtitle, code })
 *     → { el, update(filters, { resetPage, scroll }), getFilters(), pselFilters(), rows(), focusRow(id), select(id),
 *         exportCsv(), refresh(), destroy() }
 *
 *   filters   register-level filters { domain, rating, status, owner, type, q, l, i, view: 'residual', overdue, pipeline }
 *             (project / period / global search always come from the global filters, store.filters).
 *             Deep links (?domain= ?rating= ?status= ?owner= ?type= ?q= ?l= ?i= ?view=residual ?overdue=1 ?pipeline=,
 *             legacy ?category=) are read from the current hash when urlSync is on; explicit `filters` win.
 *   onOpen    (riskId, { row, trigger, register }) — default: openRiskDrawer with focus returned to the row.
 *   onFilterChange (filters, { source }) — called when the reader changes a filter here (not on update()).
 *   urlSync   mirror register filters into the current hash (history.replaceState; history.state kept).
 *   stateKey  memory key for sort / page across re-mounts (language switch, refresh); default 'register:<route>'.
 *
 * Built on components.filterBar + dataTable (rows from psel.registerRows — the one shared definition).
 * Live store changes patch rows in place (sort, page, scroll and focus kept; changed rows flash). Filter
 * changes go back to page 1. Strings: t('risk.reg.*'). Data through i18n (L / label / term).
 */

import { components } from '../../ui/components.js';
import { i18n, t, tn } from '../../core/i18n.js';
import { fmt as defaultFmt } from '../../core/fmt.js';
import { motion } from '../../ui/motion.js';
import {
  openRiskDrawer, envOf, ensureStyles, codeSpan, withCodes, dataText, riskTitle, person, siteName, domainLabel, typeLabel, ratingLabel,
  statusLabel, ratingTone, domainChip, typeChip, statusChip, scoreGroup, dueCell, confidenceText, dqChip, exportCsv, patchHashParams, hashParams,
  todayISO, sourceLabel, DOMAINS, TYPES, RATINGS, RISK_STATUSES,
} from './risk-drawer.js';

const { h, clear, glyph, svgIcon, card, button, dataTable, filterBar, emptyState, errorState } = components;

export const REGISTER_KEYS = Object.freeze(['domain', 'rating', 'status', 'owner', 'type', 'q', 'l', 'i', 'view', 'overdue', 'pipeline']);
const PIPELINES = ['contract-nlp', 'bom-forecast', 'schedule-model', 'site-ai', 'cost-forecast'];
const memory = new Map();
const STYLE_ID = 'risk-register-style';
const STYLE_TEXT = `
.reg-card .card-body { display: flex; flex-direction: column; gap: var(--space-3); }
.reg-card .filter-bar { margin: 0; }
.reg-chips { display: flex; flex-wrap: wrap; gap: 6px 8px; align-items: center; }
.reg-chips:empty { display: none; }

.reg-card .table td { vertical-align: middle; }
.reg-card .table .code { font-size: var(--fs-sm); color: var(--ink-2); }
.reg-title { display: flex; flex-direction: column; gap: 3px; min-inline-size: 200px; max-inline-size: 420px; }
.reg-owner { display: inline-block; min-inline-size: 7em; }
.reg-title-main { font-weight: 500; color: var(--ink-1); line-height: 1.45; overflow-wrap: anywhere; }
.reg-title-sub { display: flex; flex-wrap: wrap; gap: 2px 8px; align-items: center; font-size: 12px; color: var(--ink-3); }
.reg-stack { display: inline-flex; flex-direction: column; align-items: flex-start; gap: 4px; }
.reg-mid, .reg-narrow { display: none; flex-wrap: wrap; gap: 4px 8px; align-items: center; margin-block-start: 2px; }
.reg-mid-status { display: none; }
.reg-mid .cat-chip, .reg-mid .type-chip { white-space: normal; max-inline-size: 100%; }
.reg-card .table td:nth-child(2), .reg-title { white-space: normal; }
@container card (max-width: 1060px) {
  .reg-card .table tr > :nth-child(5), .reg-card .table tr > :nth-child(6) { display: none; }
}
@container card (max-width: 960px) {
  .reg-card .table tr > :nth-child(3) { display: none; }
  .reg-card .reg-mid { display: flex; }
}
@container card (max-width: 760px) {
  .reg-card .table tr > :nth-child(8) { display: none; }
  .reg-card .reg-mid-status { display: inline-flex; }
}
@container card (max-width: 560px) {
  .reg-card .table tr > :nth-child(4), .reg-card .table tr > :nth-child(7) { display: none; }
  .reg-card .reg-narrow { display: flex; }
  .reg-title { min-inline-size: 0; }
  .reg-narrow .risk-li { display: none; }
}
.reg-card tr.is-selected > td { background: color-mix(in srgb, var(--brand) 9%, var(--bg-1)); }
.reg-conf { font-variant-numeric: tabular-nums; white-space: nowrap; color: var(--ink-2); }
.reg-conf.is-na { color: var(--ink-3); }
.reg-unassigned { color: var(--ink-3); font-style: normal; }
.reg-empty { padding-block: var(--space-4); }
`;

function ensureRegisterStyles() {
  ensureStyles();
  if (typeof document === 'undefined' || document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = STYLE_TEXT;
  document.head.appendChild(style);
}

const text = (v) => (typeof v === 'string' ? v.trim() : (v == null ? '' : String(v)));
const arr = (v) => (Array.isArray(v) ? v : []);

function routeId() {
  try { return ((location.hash || '').replace(/^#\/?/, '').split('?')[0]) || ''; } catch { return ''; }
}

/**
 * Normalise register filters from URL params or an object. `partial`: only keys present in the input are
 * returned (null = cleared). Unknown / invalid values are dropped (never guessed).
 */
export function parseRegisterFilters(input = {}, { partial = false } = {}) {
  const src = input && typeof input === 'object' ? { ...input } : {};
  if (src.category !== undefined && src.domain === undefined) src.domain = src.category;
  if (src.likelihood !== undefined && src.l === undefined) src.l = src.likelihood;
  if (src.impact !== undefined && src.i === undefined) src.i = src.impact;
  if (src.search !== undefined && src.q === undefined) src.q = src.search;
  if (src.residual !== undefined && src.view === undefined) src.view = String(src.residual) === 'true' || String(src.residual) === '1' ? 'residual' : null;
  const out = {};
  const put = (k, ok, v) => { if (src[k] === undefined && partial) return; out[k] = ok ? v : null; };
  const val = (k) => (src[k] === undefined || src[k] === null ? '' : String(src[k]).trim());
  put('domain', DOMAINS.includes(val('domain')), val('domain'));
  put('rating', RATINGS.includes(val('rating')), val('rating'));
  put('status', RISK_STATUSES.includes(val('status')), val('status'));
  put('type', TYPES.includes(val('type')), val('type'));
  put('pipeline', PIPELINES.includes(val('pipeline')), val('pipeline'));
  put('owner', val('owner') !== '' && val('owner') !== 'all', val('owner'));
  put('q', val('q') !== '', val('q'));
  const n15 = (k) => { const n = Number(val(k)); return Number.isInteger(n) && n >= 1 && n <= 5 ? n : null; };
  put('l', n15('l') !== null, n15('l'));
  put('i', n15('i') !== null, n15('i'));
  put('view', val('view') === 'residual', 'residual');
  put('overdue', ['1', 'true', 'yes'].includes(val('overdue').toLowerCase()), true);
  if (!partial) for (const k of REGISTER_KEYS) if (!(k in out)) out[k] = null;
  return out;
}

/** URL form of register filters (only set keys). */
function toParams(reg) {
  const p = {};
  for (const k of REGISTER_KEYS) p[k] = reg[k] === null || reg[k] === undefined ? null : (k === 'overdue' ? (reg[k] ? '1' : null) : reg[k]);
  return p;
}

export function riskRegister(ctx = {}, {
  filters = {}, pageSize = 10, onOpen = null, onFilterChange = null, urlSync = true, stateKey = null,
  title = null, subtitle = null, code = 'REG-01', id = null,
} = {}) {
  ensureRegisterStyles();
  const env = envOf(ctx);
  const store = env.store;
  const key = stateKey || `register:${routeId()}`;
  const fromUrl = urlSync ? parseRegisterFilters(hashParams()) : parseRegisterFilters({});
  const explicit = parseRegisterFilters(filters || {}, { partial: true });
  const reg = { ...fromUrl };
  for (const [k, v] of Object.entries(explicit)) if (v !== null && v !== undefined) reg[k] = v;

  let alive = true;
  let raf = 0;
  let pendingKind = null;
  let table = null;
  let bar = null;
  let selectedId = null;
  let lastRows = [];
  const unsubs = [];

  const stateOf = () => store.state || {};
  const globalFilters = () => store.filters || stateOf().filters || { siteId: 'all', range: 30, search: '' };

  function pselFilters() {
    const g = globalFilters();
    const search = [text(g.search), text(reg.q)].filter(Boolean).join(' ');
    return {
      siteId: g.siteId || 'all', range: g.range || 30, search,
      domain: reg.domain || undefined, rating: reg.rating || undefined, status: reg.status || undefined, owner: reg.owner || undefined,
      type: reg.type || undefined, pipeline: reg.pipeline || undefined, l: reg.l || undefined, i: reg.i || undefined,
      view: reg.view || undefined, overdue: reg.overdue ? true : undefined,
    };
  }
  function computeRows() {
    const state = stateOf();
    if (!state.platform || !Array.isArray(state.platform.aiRisks)) return null;
    try { return arr(env.psel.registerRows(state, pselFilters(), { now: store.now() })); } catch { return null; }
  }
  const activeRegisterFilters = () => REGISTER_KEYS.filter((k) => reg[k] !== null && reg[k] !== undefined && reg[k] !== false).length;

  /* ── filter bar ── */

  function ownerList() {
    const set = new Set();
    arr(stateOf().platform && stateOf().platform.aiRisks).forEach((r) => { if (r && text(r.owner)) set.add(text(r.owner)); });
    if (reg.owner) set.add(reg.owner);
    return Array.from(set).sort((a, b) => person(a).localeCompare(person(b), i18n.locale()));
  }
  function barValues() {
    return { domain: reg.domain || 'all', rating: reg.rating || 'all', status: reg.status || 'all', owner: reg.owner || 'all', type: reg.type || 'all', q: reg.q || '' };
  }
  function buildBar() {
    return filterBar({
      label: t('risk.reg.filterLabel'),
      className: 'reg-filter-bar',
      value: barValues(),
      filters: [
        { id: 'domain', type: 'select', label: t('risk.reg.fDomain'), options: DOMAINS.map((d) => ({ value: d, label: domainLabel(d) })) },
        { id: 'rating', type: 'segmented', label: t('risk.reg.fRating'), options: [{ value: 'all', label: t('ui.filter.all') }].concat(RATINGS.map((r) => ({ value: r, label: ratingLabel(r), icon: glyph(ratingTone(r), 14) }))) },
        { id: 'status', type: 'select', label: t('risk.reg.fStatus'), options: RISK_STATUSES.map((s) => ({ value: s, label: statusLabel(s) })) },
        { id: 'owner', type: 'select', label: t('risk.reg.fOwner'), options: ownerList().map((o) => ({ value: o, label: person(o) })) },
        { id: 'type', type: 'select', label: t('risk.reg.fType'), options: TYPES.map((x) => ({ value: x, label: typeLabel(x) })) },
        { id: 'q', type: 'search', label: t('risk.reg.fSearch'), placeholder: t('risk.reg.fSearchPh') },
      ],
      onChange: (values) => {
        reg.domain = values.domain && values.domain !== 'all' ? values.domain : null;
        reg.rating = values.rating && values.rating !== 'all' ? values.rating : null;
        reg.status = values.status && values.status !== 'all' ? values.status : null;
        reg.owner = values.owner && values.owner !== 'all' ? values.owner : null;
        reg.type = values.type && values.type !== 'all' ? values.type : null;
        reg.q = text(values.q) || null;
        changed('filter');
      },
      onReset: () => { for (const k of REGISTER_KEYS) reg[k] = null; },
    });
  }

  /* ── extra filter chips (matrix position, residual view, overdue, engine) ── */

  const chipsHost = h('div', { class: 'reg-chips', role: 'group', 'aria-label': t('risk.reg.filterLabel') });
  function paintChips() {
    clear(chipsHost);
    const chips = [];
    const num = (n) => defaultFmt.num(n);
    if (reg.l && reg.i) chips.push({ label: t('risk.reg.chipLI', { l: num(reg.l), i: num(reg.i) }), clear: { l: null, i: null } });
    else if (reg.l) chips.push({ label: t('risk.reg.chipL', { l: num(reg.l) }), clear: { l: null } });
    else if (reg.i) chips.push({ label: t('risk.reg.chipI', { i: num(reg.i) }), clear: { i: null } });
    if (reg.view === 'residual') chips.push({ label: t('risk.reg.chipResidual'), clear: { view: null } });
    if (reg.overdue) chips.push({ label: t('risk.reg.chipOverdue'), clear: { overdue: null } });
    if (reg.pipeline) chips.push({ label: t('risk.reg.chipPipeline', { name: i18n.label('pipeline', reg.pipeline) || reg.pipeline }), clear: { pipeline: null } });
    chips.forEach((c) => {
      chipsHost.appendChild(h('button', {
        type: 'button', class: 'reg-chip', 'aria-label': t('risk.reg.removeChip', { label: c.label }),
        onClick: () => { Object.assign(reg, c.clear); changed('chip'); const next = chipsHost.querySelector('.reg-chip') || (bar && bar.el.querySelector('select, input, button')); if (next) next.focus(); },
      }, h('span', {}, c.label), svgIcon('close', 12)));
    });
  }

  /* ── table ── */

  function titleCell(r) {
    const state = stateOf();
    return h('span', { class: 'reg-title' },
      h('span', { class: 'reg-title-main' }, ...withCodes(riskTitle(r.risk))),
      h('span', { class: 'reg-title-sub' }, h('span', {}, siteName(state, r.projectId)), r.origin === 'manual' ? h('span', {}, '· ', sourceLabel('إدخال يدوي')) : null),
      h('span', { class: 'reg-mid' }, domainChip(r.category), typeChip(r.type), h('span', { class: 'reg-mid-status' }, statusChip(r.status, env))),
      h('span', { class: 'reg-narrow' }, scoreGroup(r.score, r.likelihood, r.impact), dueCell(r.dueDate, r.overdue)));
  }
  function confCell(r) {
    const pct = confidenceText(r.confidence);
    return pct === null
      ? h('span', { class: 'reg-conf is-na', title: t('risk.reg.confNaTitle') }, t('risk.reg.confNa'))
      : h('span', { class: 'reg-conf num', dir: 'ltr' }, pct);
  }
  /** Owner name without the role suffix ("Name — Role"); the full value stays in the tooltip. */
  function ownerCell(r) {
    if (!r.owner) return h('span', { class: 'reg-unassigned' }, t('risk.common.unassigned'));
    const full = person(r.owner);
    const short = String(full).split(/\s+[—–-]\s+/)[0];
    const node = dataText(short, 'reg-owner');
    if (node instanceof Element) node.title = full; else return h('span', { class: 'reg-owner', title: full }, short);
    return node;
  }
  /*
   * Eight columns; related facts share a stacked cell (domain + type, owner + due) so the register fits a
   * 1440 px desktop without hiding confidence or data quality. Narrower cards drop columns in tiers (CSS
   * container queries on nth-child, below) and repeat what was dropped inside the title cell:
   *   ≤ 1060 px confidence + data quality · ≤ 860 px domain/type (shown under the title) ·
   *   ≤ 560 px score, owner/due, status (shown under the title).
   * All columns are declared priority 'high' so the generic dataTable tiers never hide the open button.
   */
  const columns = () => [
    { key: 'code', label: t('risk.reg.colCode'), priority: 'high', width: 96, render: (r) => codeSpan(r.code), sortValue: (r) => r.code },
    { key: 'title', label: t('risk.reg.colTitle'), priority: 'high', render: titleCell, sortValue: (r) => riskTitle(r.risk) },
    { key: 'domain', label: t('risk.reg.colDomainType'), priority: 'high', render: (r) => h('span', { class: 'reg-stack' }, domainChip(r.category), typeChip(r.type)), sortValue: (r) => `${domainLabel(r.category)} ${typeLabel(r.type)}` },
    { key: 'score', label: t('risk.reg.colScore'), priority: 'high', width: 128, render: (r) => scoreGroup(r.score, r.likelihood, r.impact), sortValue: (r) => r.score },
    { key: 'confidence', label: t('risk.reg.colConfidence'), priority: 'high', render: confCell, sortValue: (r) => (r.confidence == null ? -1 : r.confidence) },
    { key: 'dq', label: t('risk.reg.colDq'), priority: 'high', render: (r) => dqChip(r.dataQualityLevel, r.dataQualityScore), sortValue: (r) => (r.dataQualityScore == null ? -1 : r.dataQualityScore) },
    { key: 'due', label: t('risk.reg.colOwnerDue'), priority: 'high', render: (r) => h('span', { class: 'reg-stack' }, ownerCell(r), dueCell(r.dueDate, r.overdue)), sortValue: (r) => (r.dueDate ? Date.parse(`${r.dueDate}T00:00:00`) : null) },
    { key: 'status', label: t('risk.reg.colStatus'), priority: 'high', render: (r) => statusChip(r.status, env), sortValue: (r) => RISK_STATUSES.indexOf(r.status) },
  ];

  function buildTable(rows) {
    const saved = memory.get(key) || null;
    const tbl = dataTable({
      columns: columns(), rows, rowKey: 'id', pageSize, caption: t('risk.reg.caption'), stickyFirst: true,
      initialSort: saved && saved.sortKey ? { key: saved.sortKey, dir: saved.sortDir } : null,
      rowLabel: (r) => t('risk.reg.rowLabel', { code: r.code, title: riskTitle(r.risk) }),
      emptyText: t('risk.reg.emptyFiltered'),
      onRowClick: (row, e) => open(row, e),
    });
    if (saved && Number.isFinite(saved.page) && saved.page > 0) tbl.setState({ page: saved.page });
    return tbl;
  }

  function open(row, e) {
    const tr = e && e.target && e.target.closest ? e.target.closest('tr') : null;
    const trigger = tr ? tr.querySelector('.row-open') : null;
    if (typeof onOpen === 'function') { try { onOpen(row.id, { row, trigger, register: api }); } catch { /* the caller owns its errors */ } return; }
    select(row.id);
    openRiskDrawer(ctx, row.id, {
      returnFocus: trigger,
      onClose: () => {
        select(null);
        const a = document.activeElement;
        if (!a || a === document.body || !a.isConnected) focusRow(row.id);
      },
    });
  }

  function select(id) {
    selectedId = id || null;
    if (!table) return;
    table.el.querySelectorAll('tbody tr.is-selected').forEach((tr) => tr.classList.remove('is-selected'));
    if (selectedId) {
      const tr = table.el.querySelector(`tbody tr[data-key="${cssEscape(selectedId)}"]`);
      if (tr) tr.classList.add('is-selected');
    }
  }

  /** Focus the row's open button, paging to it when needed. */
  function focusRow(id) {
    if (!table || !id) return false;
    const find = () => table.el.querySelector(`tbody tr[data-key="${cssEscape(id)}"] .row-open`);
    let btn = find();
    if (!btn) {
      const st = table.getState();
      const idx = sortedIndex(id, st);
      if (idx >= 0 && st.pageSize > 0) { table.setPage(Math.floor(idx / st.pageSize)); btn = find(); }
    }
    if (btn) { try { btn.focus({ preventScroll: false }); } catch { btn.focus(); } return true; }
    return false;
  }
  function sortedIndex(id, st) {
    const cols = columns();
    const rows = lastRows.slice();
    if (st.sortKey) {
      const col = cols.find((c) => c.key === st.sortKey);
      const get = col && col.sortValue ? col.sortValue : (r) => r[st.sortKey];
      rows.sort((a, b) => { const va = get(a); const vb = get(b); if (va == null) return 1; if (vb == null) return -1; return typeof va === 'number' && typeof vb === 'number' ? va - vb : String(va).localeCompare(String(vb), i18n.locale()); });
      if (st.sortDir === 'desc') rows.reverse();
    }
    return rows.findIndex((r) => r.id === id);
  }

  /* ── card ── */

  const stateHost = h('div', { class: 'reg-state' });
  const tableHost = h('div', { class: 'reg-table' });
  const exportBtn = button(t('risk.reg.export'), { variant: 'outline', size: 'sm', icon: 'download', onClick: () => exportRows() });
  bar = buildBar();
  const el = card({
    id: id || undefined, code, title: title || t('risk.reg.title'), subtitle: subtitle || t('risk.reg.subtitle'),
    actions: [exportBtn], className: 'reg-card',
    body: h('div', { class: 'stack gap-3' }, bar.el, chipsHost, stateHost, tableHost),
  });
  const subEl = el.querySelector('.card-sub');
  const baseSubtitle = subtitle || t('risk.reg.subtitle');

  function paintCount(rows) {
    if (!subEl) return;
    const total = rows ? rows.length : 0;
    subEl.textContent = `${tn('risk.reg.count', total)} · ${baseSubtitle}`;
  }

  function paintState(rows) {
    clear(stateHost);
    if (rows === null) {
      tableHost.hidden = true;
      exportBtn.disabled = true;
      stateHost.appendChild(errorState({ title: t('risk.reg.noPlatform'), text: t('risk.reg.noPlatformText'), retry: () => { refreshRows({ resetPage: true }); }, retryLabel: t('risk.reg.retry') }));
      return;
    }
    exportBtn.disabled = rows.length === 0;
    tableHost.hidden = rows.length === 0;
    if (!rows.length) {
      const filtered = activeRegisterFilters() > 0;
      const empty = emptyState({
        icon: 'shield-check',
        title: filtered ? t('risk.reg.emptyFiltered') : t('risk.reg.empty'),
        text: filtered ? t('risk.reg.emptyFilteredText') : t('risk.reg.emptyText'),
        action: filtered ? { label: t('risk.reg.clearFilters'), icon: 'refresh', onClick: () => { for (const k of REGISTER_KEYS) reg[k] = null; changed('clear'); } } : null,
      });
      empty.classList.add('reg-empty');
      stateHost.appendChild(empty);
    }
  }

  function refreshRows({ resetPage = false, live = false } = {}) {
    const rows = computeRows();
    lastRows = rows || [];
    paintCount(rows);
    paintState(rows);
    if (rows === null) return;
    if (!table) { table = buildTable(rows); tableHost.appendChild(table.el); }
    else if (live) table.update(rows, { preserve: true, flash: true });
    else table.update(rows, { resetPage });
    select(selectedId);
  }

  function syncUrl() { if (urlSync) patchHashParams(toParams(reg)); }

  function changed(source) {
    paintChips();
    refreshRows({ resetPage: true });
    syncUrl();
    if (typeof onFilterChange === 'function') { try { onFilterChange(getFilters(), { source }); } catch { /* caller */ } }
  }

  function getFilters() {
    const out = {};
    for (const k of REGISTER_KEYS) if (reg[k] !== null && reg[k] !== undefined && reg[k] !== false) out[k] = reg[k];
    return out;
  }

  function update(next = {}, { resetPage = true, scroll = false } = {}) {
    const parsed = parseRegisterFilters(next || {}, { partial: true });
    Object.assign(reg, parsed);
    if (bar) bar.set(barValues());
    paintChips();
    refreshRows({ resetPage });
    syncUrl();
    if (scroll) {
      try { el.scrollIntoView({ block: 'start', behavior: motion.enabled() ? 'smooth' : 'auto' }); } catch { /* ignore */ }
    }
    return api;
  }

  function exportRows() {
    const state = stateOf();
    const rows = lastRows.map((r) => ({
      code: r.code, title: riskTitle(r.risk), project: siteName(state, r.projectId), domain: domainLabel(r.category), type: typeLabel(r.type),
      score: r.score, likelihood: r.likelihood, impact: r.impact, rating: ratingLabel(r.rating),
      residual: r.residualScore == null ? t('risk.csv.notAssessed') : r.residualScore,
      confidence: confidenceText(r.confidence) || t('risk.reg.confNa'),
      dq: r.dataQualityLevel ? (i18n.label('dataQualityLevel', r.dataQualityLevel) || r.dataQualityLevel) : t('risk.common.notValidated'),
      owner: r.owner ? person(r.owner) : t('risk.common.unassigned'), due: r.dueDate || '', overdue: r.overdue ? t('risk.common.yes') : t('risk.common.no'),
      status: statusLabel(r.status), next: r.nextAction ? t(`risk.next.${r.nextAction.key}.label`) : '',
    }));
    const cols = ['code', 'title', 'project', 'domain', 'type', 'score', 'likelihood', 'impact', 'rating', 'residual', 'confidence', 'dq', 'owner', 'due', 'overdue', 'status', 'next']
      .map((k) => ({ key: k, label: t(`risk.csv.${k}`) }));
    const ok = exportCsv(env, rows, cols, `biltix-risk-ai-register-${todayISO(env)}.csv`);
    components.toast(ok ? t('risk.reg.exported', { count: defaultFmt.num(rows.length) }) : t('risk.err.export'), { tone: ok ? 'good' : 'warning' });
    return ok;
  }

  function saveState() { if (table) { const s = table.getState(); memory.set(key, { sortKey: s.sortKey, sortDir: s.sortDir, page: s.page }); } }

  function schedule(kind) {
    if (!alive) return;
    pendingKind = pendingKind === 'filters' || kind === 'filters' ? 'filters' : 'live';
    if (raf) return;
    raf = requestAnimationFrame(() => {
      raf = 0;
      const k = pendingKind;
      pendingKind = null;
      if (!alive) return;
      refreshRows(k === 'filters' ? { resetPage: true } : { live: true });
    });
  }

  unsubs.push(env.bus.on('store:change', (payload) => {
    const path = payload && typeof payload.path === 'string' ? payload.path : '*';
    if (path !== '*' && !/^(platform\.(aiRisks|tasks|alerts)|platform$|sites|settings)/.test(path)) return;
    schedule('live');
  }));
  unsubs.push(env.bus.on('filters:change', () => schedule('filters')));
  unsubs.push(env.bus.on('ui:route-leave', saveState));

  paintChips();
  refreshRows();
  syncUrl();

  function destroy() {
    if (!alive) return;
    saveState();
    alive = false;
    if (raf) cancelAnimationFrame(raf);
    unsubs.splice(0).forEach((u) => { try { u(); } catch { /* ignore */ } });
    if (table && typeof table.destroy === 'function') table.destroy();
  }

  const api = {
    el,
    update,
    getFilters,
    pselFilters,
    rows: () => lastRows.slice(),
    focusRow,
    select,
    exportCsv: exportRows,
    refresh: () => refreshRows({ live: true }),
    destroy,
    get table() { return table; },
  };
  return api;
}

const cssEscape = (v) => (typeof CSS !== 'undefined' && typeof CSS.escape === 'function' ? CSS.escape(String(v)) : String(v).replace(/["\\]/g, '\\$&'));

export default riskRegister;
