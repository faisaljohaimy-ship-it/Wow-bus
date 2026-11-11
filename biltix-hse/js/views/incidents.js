/**
 * BILTIX Risk AI — HSE pillar · SEC-04 Incidents & near misses (js/views/incidents.js). Owner: B-HSE1.
 *
 *   A. Head — title, lead, data status (status.js), "report an incident".
 *   B. Four metrics — open incidents, near misses (30 days), lost-time injuries, lost work days
 *      (selector KPIs; deltas vs the previous period of the same length).
 *   C. Analysis — weekly trend (incidents vs near misses), distribution by type, root-cause Pareto
 *      (ranked bars, cumulative % as a direct label — no second axis; vital few vs the rest in the legend).
 *   D. Incident log — filter bar (type chips, status, severity, search in Arabic and English) and cards
 *      with a five-step investigation stepper and corrective-action progress.
 *   E. Drawer (kind 'hse-incident') — Overview / Investigation / Corrective actions tabs; "next step"
 *      advances the investigation and keeps the status consistent; closing requires every action done.
 *   F. Report modal with inline validation (no future dates).
 *
 * Route params: ?new=1, ?id=I3, ?status=open|investigation|corrective|closed, ?type=lti|mtc|firstaid|nearmiss|property|environmental.
 * Stored values stay Arabic; display through i18n.label / L / term. DOM through textContent / h() only.
 */

import { i18n } from '../core/i18n.js';
import * as SEED from '../data/seed.js';
import dict from '../i18n/incidents.js';

i18n.register('incidents', dict);

const list = (value, fallback) => (Array.isArray(value) && value.length ? value : fallback);
const INCIDENT_TYPES = list(SEED.INCIDENT_TYPES, ['إصابة مضيعة للوقت', 'إصابة تتطلب علاجاً طبياً', 'إسعافات أولية', 'حادث وشيك', 'تلف ممتلكات', 'حادث بيئي']);
const INCIDENT_STATUS = list(SEED.INCIDENT_STATUS, ['مفتوح', 'قيد التحقيق', 'إجراءات تصحيحية', 'مغلق']);
const ROOT_CAUSES = list(SEED.ROOT_CAUSES, ['غياب التدريب', 'إجراء عمل غير كافٍ', 'عطل معدات', 'ضعف الإشراف', 'عدم استخدام معدات الوقاية', 'ظروف بيئية', 'تصميم غير آمن', 'ضغط الجدول الزمني']);
const CATEGORIES = list(SEED.CATEGORIES, [{ id: 'height', icon: 'height' }]);
/** URL ids ↔ stored values (stable, language-neutral deep links). */
const TYPE_IDS = ['lti', 'mtc', 'firstaid', 'nearmiss', 'property', 'environmental'];
const STATUS_IDS = ['open', 'investigation', 'corrective', 'closed'];
const STEP_COUNT = 5;
/** Status consistent with each investigation step (index = incident.investigationStep). */
const STATUS_FOR_STEP = ['مفتوح', 'قيد التحقيق', 'قيد التحقيق', 'إجراءات تصحيحية', 'مغلق'];
const CLOSED = 'مغلق';
const LTI_TYPE = 'إصابة مضيعة للوقت';
const NEAR_MISS_TYPE = 'حادث وشيك';
const STATUS_TONE = { 'مفتوح': 'critical', 'قيد التحقيق': 'serious', 'إجراءات تصحيحية': 'warning', 'مغلق': 'good' };
const TYPE_ICON = {
  'إصابة مضيعة للوقت': 'first-aid', 'إصابة تتطلب علاجاً طبياً': 'first-aid', 'إسعافات أولية': 'first-aid',
  'حادث وشيك': 'nearmiss', 'تلف ممتلكات': 'structure', 'حادث بيئي': 'flask',
};
const DAY_MS = 86_400_000;
const SVG_NS = 'http://www.w3.org/2000/svg';
const LIST_PAGE = 12;

const pad2 = (n) => String(n).padStart(2, '0');
/** Calendar date / clock time on the sites (Asia/Riyadh), whatever the browser's time zone. */
function riyadhParts(d) {
  try {
    const parts = new Intl.DateTimeFormat('en-GB-u-nu-latn', { timeZone: 'Asia/Riyadh', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(d);
    const get = (type) => (parts.find((p) => p.type === type) || {}).value || '';
    return { date: `${get('year')}-${get('month')}-${get('day')}`, time: `${get('hour')}:${get('minute')}` };
  } catch {
    return { date: `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`, time: `${pad2(d.getHours())}:${pad2(d.getMinutes())}` };
  }
}
const todayISO = (d) => riyadhParts(d).date;
const nowHHMM = (d) => riyadhParts(d).time;
function severityTone(severity) {
  const n = Number(severity) || 0;
  if (n >= 4) return 'critical';
  if (n === 3) return 'serious';
  if (n === 2) return 'warning';
  return 'good';
}
function parseDate(value) {
  if (!value) return NaN;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value));
  return m ? new Date(+m[1], +m[2] - 1, +m[3]).getTime() : Date.parse(value);
}
function incidentInstant(inc) {
  const base = parseDate(inc && inc.date);
  if (!Number.isFinite(base)) return 0;
  const tm = /^(\d{1,2}):(\d{2})/.exec(String(inc.time || ''));
  return base + (tm ? (Number(tm[1]) * 60 + Number(tm[2])) * 60_000 : 0);
}
function weeklyCounts(items, weeks, pred, now) {
  const out = Array(weeks).fill(0);
  const end = new Date(now); end.setHours(23, 59, 59, 999);
  const endMs = end.getTime();
  for (const it of items) {
    if (!pred(it)) continue;
    const ts = parseDate(it.date);
    if (!Number.isFinite(ts) || ts > endMs) continue;
    const idx = weeks - 1 - Math.floor((endMs - ts) / (7 * DAY_MS));
    if (idx >= 0 && idx < weeks) out[idx] += 1;
  }
  return out;
}
function touches(path, prefix) {
  if (!path || path === '*') return true;
  const p = String(path);
  return p === prefix || p.startsWith(`${prefix}.`);
}
function checkMark(size = 12) {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('width', String(size)); svg.setAttribute('height', String(size));
  svg.setAttribute('fill', 'none'); svg.setAttribute('stroke', 'currentColor'); svg.setAttribute('stroke-width', '3');
  svg.setAttribute('stroke-linecap', 'round'); svg.setAttribute('stroke-linejoin', 'round'); svg.setAttribute('aria-hidden', 'true');
  const p = document.createElementNS(SVG_NS, 'path'); p.setAttribute('d', 'M5 12.5l4.5 4.5L19 7');
  svg.appendChild(p);
  return svg;
}
function arrowSvg(direction) {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('width', '12'); svg.setAttribute('height', '12');
  svg.setAttribute('fill', 'none'); svg.setAttribute('stroke', 'currentColor'); svg.setAttribute('stroke-width', '2.4');
  svg.setAttribute('stroke-linecap', 'round'); svg.setAttribute('stroke-linejoin', 'round'); svg.setAttribute('aria-hidden', 'true');
  const p = document.createElementNS(SVG_NS, 'path');
  p.setAttribute('d', direction === 'up' ? 'M12 19V5M5 12l7-7 7 7' : direction === 'down' ? 'M12 5v14M5 12l7 7 7-7' : 'M5 12h14');
  svg.appendChild(p);
  return svg;
}
function norm(value) {
  return String(value ?? '').toLowerCase()
    .replace(/[ً-ْـ]/g, '')
    .replace(/[أإآٱ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي')
    .trim();
}

export const incidentsView = {
  id: 'incidents',
  code: 'SEC-04',
  get title() { return i18n.has('core.nav.incidents.title') ? i18n.t('core.nav.incidents.title') : i18n.t('incidents.title'); },
  icon: 'alert-triangle',

  render(container, ctx) {
    const { store, bus, sel, fmt, charts } = ctx;
    const C = ctx.components || {};
    const { h } = C;
    const I = ctx.i18n || i18n;
    const t = (key, p) => I.t(key, p);
    const tn = (key, count, p) => I.tn(key, count, p);
    const L = (record, field, ns) => (record ? I.L(record, field, ns) : '');
    const label = (ns, value) => I.label(ns, value);
    const term = (s) => (typeof I.term === 'function' ? I.term(s) : s);
    const statusApi = ctx.status || null;
    const motion = ctx.motion || C.motion || null;
    const params = (ctx && ctx.params) || {};

    const subs = [];
    let alive = true;
    let activeDrawer = null;
    let activeModal = null;
    let showAll = false;
    let firstPaint = true;
    const cardSignatures = new Map();

    const warned = new Set();
    const warn = (where, err) => {
      const key = `${where}:${err && err.message}`;
      if (warned.has(key)) return;
      warned.add(key);
      console.warn(`[incidents] ${where}:`, err);
    };
    const safe = (fn, fallback, where = 'call') => {
      try { const v = fn(); return v === undefined || v === null ? fallback : v; } catch (err) { warn(where, err); return fallback; }
    };
    const ico = (name, size = 16) => {
      let node = null;
      try { node = typeof C.svgIcon === 'function' ? C.svgIcon(name, size) : null; } catch { node = null; }
      if (!(node instanceof Node)) node = C.glyph('neutral', size);
      node.setAttribute('aria-hidden', 'true');
      return node;
    };
    const tryEl = (fn, where) => {
      try { const r = fn(); const el = r instanceof Node ? r : r && r.el; return el instanceof Node ? el : null; } catch (err) { warn(`chart:${where}`, err); return null; }
    };
    const guard = (host, where, build) => {
      try { build(); } catch (err) {
        warn(where, err);
        host.replaceChildren(C.errorState({ title: t('incidents.errors.sectionTitle'), text: t('incidents.errors.sectionText'), retry: () => schedule(7) }));
      }
    };
    const state = () => store.state || {};
    const globalFilters = () => ({ siteId: 'all', range: 30, search: '', ...(store.filters || state().filters || {}) });
    const findIncident = (id) => (state().incidents || []).find((i) => i && i.id === id) || null;
    const now = () => (typeof store.now === 'function' ? store.now() : new Date());
    const siteById = (id) => (state().sites || []).find((s) => s && s.id === id) || null;
    const siteName = (id) => { const s = siteById(id); return s ? L(s, 'name', 'sites') : '—'; };
    const categoryOf = (id) => CATEGORIES.find((c) => c.id === id) || null;
    const typeLabel = (v) => label('incidentType', v);
    const statusLabel = (v) => label('incidentStatus', v);
    const stepLabel = (i) => (typeof fmt.digits === 'function' ? fmt.digits(t(`incidents.steps.${i}`)) : t(`incidents.steps.${i}`));
    const severityText = (n) => t('incidents.severity.badge', { n: fmt.num(Number(n) || 0), label: t(`incidents.severity.${Math.max(1, Math.min(5, Number(n) || 1))}`) });
    const sourceStatus = () => {
      try { if (statusApi && typeof statusApi.source === 'function') return statusApi.source(state()).status || 'demo'; } catch (err) { warn('status', err); }
      return 'demo';
    };

    /* local (view-only) filters; stored enum values */
    const typeFromParam = TYPE_IDS.indexOf(String(params.type || '')) >= 0 ? INCIDENT_TYPES[TYPE_IDS.indexOf(String(params.type))] : (INCIDENT_TYPES.includes(params.type) ? params.type : null);
    const statusFromParam = STATUS_IDS.indexOf(String(params.status || '')) >= 0 ? INCIDENT_STATUS[STATUS_IDS.indexOf(String(params.status))] : (INCIDENT_STATUS.includes(params.status) ? params.status : 'all');
    const local = { types: typeFromParam ? [typeFromParam] : [], status: statusFromParam || 'all', severity: 'all', q: '' };

    function matches(inc, query) {
      const q = norm(query);
      if (!q) return true;
      const s = siteById(inc.siteId);
      const hay = norm([
        inc.code, inc.title, inc.location, inc.reporter, inc.type, inc.status, inc.rootCause,
        L(inc, 'title', 'incidents'), L(inc, 'location', 'incidents'), term(inc.reporter), typeLabel(inc.type), statusLabel(inc.status), label('rootCause', inc.rootCause),
        s && s.name, s && L(s, 'name', 'sites'), s && s.code,
      ].filter(Boolean).join(' \u0001 '));
      return q.split(/\s+/).filter(Boolean).every((x) => hay.includes(x));
    }
    function listRows({ ignoreType = false } = {}) {
      const g = globalFilters();
      return safe(() => sel.filteredIncidents(state(), { ...g, search: '', status: local.status === 'all' ? undefined : local.status }), [], 'filteredIncidents')
        .filter((i) => i && (ignoreType || !local.types.length || local.types.includes(i.type)))
        .filter((i) => local.severity === 'all' || (local.severity === 'high' ? Number(i.severity) >= 4 : Number(i.severity) === Number(local.severity)))
        .filter((i) => matches(i, g.search) && matches(i, local.q))
        .sort((a, b) => incidentInstant(b) - incidentInstant(a));
    }

    /* ═════════════ A. head ═════════════ */
    const root = h('section', { class: 'view view-incidents', 'aria-labelledby': 'incidents-title' });
    const statusHost = h('span', { class: 'row gap-2' });
    root.appendChild(h('header', { class: 'view-head' },
      h('div', { class: 'view-head-text' },
        h('span', { class: 'code-tag', translate: 'no' }, 'SEC-04'),
        h('h1', { id: 'incidents-title', tabindex: '-1' }, i18n.has('core.nav.incidents.title') ? t('core.nav.incidents.title') : t('incidents.title')),
        h('p', { class: 'view-lead' }, t('incidents.lead'))),
      h('div', { class: 'view-actions' },
        statusHost,
        C.button(t('incidents.actions.report'), { variant: 'primary', size: 'sm', icon: ico('incident', 15), onClick: () => openReportModal() }))));

    /* ═════════════ B. metrics ═════════════ */
    const metricGrid = h('div', { class: 'metric-grid', role: 'group', 'aria-label': t('incidents.metrics.aria') });
    function metricTile({ id, icon, onClick }) {
      const labelEl = h('span', { class: 'metric-label' });
      const valueEl = h('span', { class: 't-metric' });
      const unitEl = h('span', { class: 'metric-unit' });
      const sparkEl = h('span', { class: 'metric-spark', 'aria-hidden': 'true' });
      const footEl = h('div', { class: 'metric-foot' });
      const el = h(onClick ? 'button' : 'div', { class: 'metric-tile', type: onClick ? 'button' : undefined, 'data-metric': id, onClick: onClick || undefined },
        h('div', { class: 'metric-head' }, labelEl, h('span', { class: 'metric-icon', 'aria-hidden': 'true' }, ico(icon, 16))),
        h('div', { class: 'metric-value' }, valueEl, unitEl), sparkEl, footEl);
      let last = null;
      return {
        el,
        set({ title, value, unit = '', tone = null, delta = null, goodWhen = 'down', helper = '', spark = null, aria = '' }) {
          labelEl.textContent = title;
          const text = Number.isFinite(value) ? fmt.num(value) : '—';
          if (valueEl.textContent !== text) valueEl.textContent = text;
          unitEl.textContent = unit; unitEl.hidden = !unit;
          ['critical', 'serious', 'warning', 'good', 'accent', 'neutral'].forEach((x) => el.classList.toggle(`tone-${x}`, x === tone));
          sparkEl.replaceChildren(...(spark ? [spark] : [])); sparkEl.hidden = !spark;
          const foot = [];
          if (Number.isFinite(delta)) {
            const d = safe(() => sel.describeDelta(delta, goodWhen), { direction: delta > 0 ? 'up' : delta < 0 ? 'down' : 'flat', good: true, neutral: true }, 'describeDelta');
            const signed = String(fmt.signed(delta)).replace(/[‎‏؜‪-‮⁦-⁩]/g, '');
            const cls = d.direction === 'flat' || d.neutral ? 'is-flat' : (d.good ? 'is-good' : 'is-bad');
            foot.push(h('span', { class: ['delta', cls], 'data-direction': d.direction }, arrowSvg(d.direction),
              h('span', { class: 'sr-only' }, t('ui.delta.sr')), h('bdi', { dir: 'ltr' }, signed),
              h('span', { class: 'sr-only' }, d.direction === 'flat' ? t('ui.delta.flat') : (d.neutral ? '' : (d.good ? t('ui.delta.better') : t('ui.delta.worse'))))));
          }
          if (helper) foot.push(h('span', { class: 'metric-helper' }, helper));
          footEl.replaceChildren(...foot);
          el.setAttribute('aria-label', aria || `${title}: ${text}`);
          if (last !== null && last !== text && motion && typeof motion.flash === 'function') motion.flash(el);
          last = text;
        },
      };
    }
    const focusList = () => { try { listSection.scrollIntoView({ behavior: motion && motion.enabled && motion.enabled() ? 'smooth' : 'auto', block: 'start' }); } catch { /* ignore */ } };
    const metrics = {
      open: metricTile({ id: 'open', icon: 'incident', onClick: () => { setLocal({ status: 'مفتوح', types: [] }); focusList(); } }),
      nearMiss: metricTile({ id: 'nearMiss', icon: 'nearmiss', onClick: () => { setLocal({ types: [NEAR_MISS_TYPE], status: 'all' }); focusList(); } }),
      lti: metricTile({ id: 'lti', icon: 'first-aid', onClick: () => { setLocal({ types: [LTI_TYPE], status: 'all' }); focusList(); } }),
      days: metricTile({ id: 'days', icon: 'calendar' }),
    };
    metricGrid.append(metrics.open.el, metrics.nearMiss.el, metrics.lti.el, metrics.days.el);

    /* ═════════════ C. analysis ═════════════ */
    const trendHost = h('div');
    const typeHost = h('div');
    const paretoHost = h('div');
    const trendCard = C.card({ code: 'SEC-04.A', title: t('incidents.trend.title'), subtitle: '', body: trendHost, tableView: () => trendTable() });
    const typeCard = C.card({ code: 'SEC-04.C', title: t('incidents.types.title'), subtitle: '', body: typeHost, tableView: () => typeTable() });
    const paretoCard = C.card({ code: 'SEC-04.B', title: t('incidents.pareto.title'), subtitle: t('incidents.pareto.subtitle'), body: paretoHost, tableView: () => paretoTable() });
    const mainCol = h('div', { class: 'stack gap-4', style: { gridColumn: 'span 7', minInlineSize: '0' } }, trendCard, typeCard);
    const sideCol = h('div', { style: { gridColumn: 'span 5', minInlineSize: '0', display: 'grid' } }, paretoCard);
    const chartsRow = h('div', { class: 'grid-12' }, mainCol, sideCol);

    /* ═════════════ D. incident log ═════════════ */
    const listCount = h('span', { class: 'badge tone-neutral' }, h('span', { class: 'badge-text' }, ''));
    const bar = C.filterBar({
      label: t('incidents.filters.label'),
      filters: [
        { id: 'type', type: 'chips', label: t('incidents.filters.type'), options: INCIDENT_TYPES.map((x) => ({ value: x, label: typeLabel(x), icon: TYPE_ICON[x] || 'incident' })) },
        { id: 'status', type: 'select', label: t('incidents.filters.status'), options: INCIDENT_STATUS.map((x) => ({ value: x, label: statusLabel(x) })) },
        { id: 'severity', type: 'select', label: t('incidents.filters.severity'), options: [{ value: 'high', label: t('incidents.filters.severityHigh', { n: fmt.num(4) }) }, ...[5, 4, 3, 2, 1].map((n) => ({ value: String(n), label: severityText(n) }))] },
        { id: 'q', type: 'search', label: t('incidents.filters.search'), placeholder: t('incidents.filters.searchPlaceholder') },
      ],
      value: { type: local.types, status: local.status, severity: local.severity, q: '' },
      onChange: (v) => {
        local.types = Array.isArray(v.type) ? v.type : [];
        local.status = v.status || 'all';
        local.severity = v.severity || 'all';
        local.q = v.q || '';
        showAll = false;
        paintList();
      },
    });
    function setLocal(patch) {
      Object.assign(local, patch);
      showAll = false;
      bar.set({ type: local.types, status: local.status, severity: local.severity, q: local.q });
      paintList();
    }
    const cardsHost = h('div', { class: 'cards-grid', role: 'list', 'aria-label': t('incidents.list.aria') });
    const listFoot = h('div', { class: 'row end' });
    const listSection = h('section', { class: 'view-section', 'aria-labelledby': 'incidents-list-title' },
      h('div', { class: 'view-section-head' },
        h('div', { class: 'stack gap-1' },
          h('div', { class: 'row gap-2' }, h('h2', { class: 't-section', id: 'incidents-list-title' }, t('incidents.list.title')), listCount),
          h('p', { class: 't-helper' }, t('incidents.list.subtitle')))),
      bar.el, cardsHost, listFoot);

    root.append(metricGrid, chartsRow, listSection);
    container.appendChild(root);

    /* width-aware layout: analysis columns stack below 960 px of view width (inline style beats the media rules) */
    let layoutObserver = null;
    let lastW = -1;
    let layoutRaf = 0;
    const applyLayout = (w) => {
      const wide = w >= 960;
      mainCol.style.gridColumn = wide ? 'span 7' : 'span 12';
      sideCol.style.gridColumn = wide ? 'span 5' : 'span 12';
      // Narrow: the type chips take a full row and become one swipeable line instead of a tall block.
      const narrow = w < 700;
      const typeGroup = bar.el.querySelector('[data-filter="type"]');
      if (typeGroup) typeGroup.style.flex = narrow ? '1 1 100%' : '';
      const chips = typeGroup && typeGroup.querySelector('.chip-group');
      if (chips) { chips.classList.toggle('chips', narrow); chips.classList.toggle('is-scroll', narrow); chips.style.flexWrap = narrow ? 'nowrap' : ''; chips.style.minInlineSize = narrow ? '0' : ''; }
      if (typeGroup) typeGroup.style.minInlineSize = narrow ? '0' : '';
      bar.el.querySelectorAll('[data-filter]').forEach((g) => { if (g.dataset.type === 'select') g.style.flex = narrow ? '1 1 100%' : ''; });
      bar.el.querySelectorAll('select.field-control').forEach((sel0) => { sel0.style.minInlineSize = narrow ? '0' : ''; sel0.style.flex = narrow ? '1 1 auto' : ''; sel0.style.maxInlineSize = narrow ? 'none' : ''; });
    };
    if (typeof ResizeObserver === 'function') {
      layoutObserver = new ResizeObserver((entries) => {
        for (const e of entries) {
          const w = Math.round(e.contentRect.width);
          if (w === lastW || !w) continue;
          lastW = w;
          if (layoutRaf) cancelAnimationFrame(layoutRaf);
          layoutRaf = requestAnimationFrame(() => { layoutRaf = 0; if (alive) applyLayout(w); });
        }
      });
      layoutObserver.observe(root);
    }
    applyLayout(root.getBoundingClientRect().width || 1200);

    /* ───────────── tables ───────────── */
    function simpleTable(caption, headers, rows) {
      const table = h('table', { class: 'chart-table' });
      table.appendChild(h('caption', {}, caption));
      table.appendChild(h('thead', {}, h('tr', {}, headers.map((x, i) => h('th', { scope: 'col', class: i > 0 ? 'num' : null }, x)))));
      table.appendChild(h('tbody', {}, rows.length
        ? rows.map((r) => h('tr', {}, r.map((c, i) => h('td', { class: i > 0 ? 'num' : null }, c))))
        : h('tr', {}, h('td', { colspan: String(headers.length), class: 'muted' }, t('incidents.common.noData')))));
      return table;
    }
    const trendRows = () => safe(() => sel.incidentTrend(state(), 12, globalFilters()), [], 'incidentTrend');
    const weekLabel = (w) => t('incidents.trend.week', { n: fmt.num(Number(w.week) || 0) });
    const trendTable = () => simpleTable(t('incidents.trend.tableCaption'), [t('incidents.trend.weekCol'), t('incidents.trend.incidents'), t('incidents.trend.nearMisses')], trendRows().map((w) => [weekLabel(w), fmt.num(w.incidents), fmt.num(w.nearMisses)]));
    const typeRows = () => safe(() => sel.incidentsByType(state(), globalFilters()), [], 'incidentsByType');
    const typeTable = () => simpleTable(t('incidents.types.title'), [t('incidents.types.type'), t('incidents.types.count')], typeRows().map((x) => [typeLabel(x.label), fmt.num(x.value)]));
    const paretoRows = () => safe(() => sel.rootCausePareto(state(), globalFilters()), [], 'rootCausePareto');
    const paretoTable = () => simpleTable(t('incidents.pareto.title'), [t('incidents.pareto.cause'), t('incidents.pareto.count'), t('incidents.pareto.share'), t('incidents.pareto.cumulative')],
      paretoRows().map((p) => [label('rootCause', p.label), fmt.num(p.value), fmt.pct(p.pct), fmt.pct(p.cumulativePct)]));

    /* ───────────── painters ───────────── */
    function paintHead() {
      statusHost.replaceChildren(typeof C.statusBadge === 'function' ? C.statusBadge(sourceStatus(), { size: 'sm' }) : C.badge(sourceStatus(), 'accent'));
    }

    function paintKpis() {
      const st = state();
      const gf = globalFilters();
      const k = safe(() => sel.kpis(st, gf), null, 'kpis');
      const range = Number(gf.range) || 30;
      const at = now();
      const inPeriod = safe(() => sel.filteredIncidents(st, { ...gf, search: '' }), [], 'filteredIncidents');
      const previous = safe(() => sel.filteredIncidents(st, { ...gf, search: '' }, new Date(at.getTime() - range * DAY_MS)), [], 'filteredIncidents');
      const daysLost = inPeriod.reduce((s, i) => s + (Number(i.daysLost) || 0), 0);
      const daysLostPrev = previous.reduce((s, i) => s + (Number(i.daysLost) || 0), 0);
      const siteItems = (st.incidents || []).filter((i) => i && (gf.siteId === 'all' || !gf.siteId || i.siteId === gf.siteId));
      const spark = (values) => tryEl(() => (typeof charts.radialTrend === 'function' ? charts.radialTrend({ values, tone: 'serious', size: 'sm' }) : charts.sparkline({ values, width: 96, height: 28 })), 'radialTrend');
      const period = tn('incidents.period.days', range);
      const open = k ? k.openIncidents : 0;
      metrics.open.set({ title: t('incidents.metrics.open'), value: open, tone: open ? 'serious' : 'good', delta: k ? k.deltas.openIncidents : null, goodWhen: 'down',
        helper: tn('incidents.metrics.vsPrevious', range), aria: t('incidents.metrics.openAria', { count: fmt.num(open) }) });
      const nm = k ? k.nearMisses30d : 0;
      metrics.nearMiss.set({ title: t('incidents.metrics.nearMiss', { days: fmt.num(30) }), value: nm, delta: k ? k.deltas.nearMisses30d : null, goodWhen: 'none',
        spark: spark(weeklyCounts(siteItems, 12, (i) => i.type === NEAR_MISS_TYPE, at)), helper: t('incidents.metrics.nearMissHelper'),
        aria: t('incidents.metrics.nearMissAria', { count: fmt.num(nm), days: fmt.num(30) }) });
      const lti = k ? k.lti : inPeriod.filter((i) => i.type === LTI_TYPE).length;
      metrics.lti.set({ title: t('incidents.metrics.lti'), value: lti, tone: lti > 0 ? 'critical' : 'good', delta: k ? k.deltas.lti : null, goodWhen: 'down',
        spark: spark(weeklyCounts(siteItems, 12, (i) => i.type === LTI_TYPE, at)),
        helper: t('incidents.metrics.ltiHelper', { period, ltifr: k ? fmt.num(k.ltifr, { maximumFractionDigits: 2 }) : '—' }), aria: t('incidents.metrics.ltiAria', { count: fmt.num(lti), period }) });
      metrics.days.set({ title: t('incidents.metrics.days'), value: daysLost, unit: tn('incidents.metrics.daysUnit', daysLost), delta: daysLost - daysLostPrev, goodWhen: 'down',
        helper: t('incidents.metrics.daysHelper', { period }), aria: t('incidents.metrics.daysAria', { count: fmt.num(daysLost), period }) });
    }

    const paletteColor = (index) => safe(() => charts.paletteFor(index), `var(--s${(index % 8) + 1})`, 'paletteFor');

    function paintCharts() {
      /* trend */
      const trend = trendRows();
      const totalInc = trend.reduce((s, b) => s + (Number(b.incidents) || 0), 0);
      const totalNm = trend.reduce((s, b) => s + (Number(b.nearMisses) || 0), 0);
      const trendSub = trendCard.querySelector('.card-sub') || (() => { const p = h('p', { class: 'card-sub' }); const w = trendCard.querySelector('.card-title-wrap'); if (w) w.appendChild(p); return p; })();
      trendSub.textContent = t('incidents.trend.subtitle', { weeks: fmt.num(12), incidents: tn('incidents.common.incidents', totalInc), nearMisses: tn('incidents.common.nearMisses', totalNm) });
      if (!totalInc && !totalNm) {
        trendHost.replaceChildren(C.emptyState({ icon: ico('check-circle', 28), title: t('incidents.trend.emptyTitle'), text: t('incidents.trend.emptyText') }));
      } else {
        trendHost.replaceChildren(tryEl(() => charts.radarTrend({
          series: [
            { id: 'incidents', label: t('incidents.trend.incidents'), color: 'var(--s1)', values: trend.map((b) => Number(b.incidents) || 0) },
            { id: 'nearMisses', label: t('incidents.trend.nearMisses'), color: 'var(--s2)', values: trend.map((b) => Number(b.nearMisses) || 0) },
          ],
          labels: trend.map(weekLabel), height: 220, yFormat: (v) => fmt.num(v), xLabel: t('incidents.trend.weekCol'),
          ariaLabel: t('incidents.trend.aria', { weeks: fmt.num(12) }),
        }), 'radarTrend') || C.emptyState({ title: t('incidents.errors.chart') }));
      }

      /* distribution by type */
      const byType = typeRows();
      const total = byType.reduce((s, x) => s + (Number(x.value) || 0), 0);
      const typeSub = typeCard.querySelector('.card-sub') || (() => { const p = h('p', { class: 'card-sub' }); const w = typeCard.querySelector('.card-title-wrap'); if (w) w.appendChild(p); return p; })();
      typeSub.textContent = t('incidents.types.subtitle', { count: tn('incidents.common.incidents', total) });
      if (!total) {
        typeHost.replaceChildren(C.emptyState({ icon: ico('check-circle', 28), title: t('incidents.types.emptyTitle'), text: t('incidents.types.emptyText') }));
      } else {
        const parts = byType.map((x, i) => ({ id: x.id, label: typeLabel(x.label), value: Number(x.value) || 0, color: paletteColor(i) })).filter((p) => p.value > 0);
        typeHost.replaceChildren(tryEl(() => charts.segmentedBar({ parts, tall: true, valueFormat: (v) => fmt.num(v), ariaLabel: t('incidents.types.title') }), 'segmentedBar') || C.emptyState({ title: t('incidents.errors.chart') }));
      }

      /* Pareto — vital few (up to the 80 % cumulative mark) in the series colour, the rest neutral */
      const pareto = paretoRows();
      if (!pareto.length) {
        paretoHost.replaceChildren(C.emptyState({ icon: ico('check-circle', 28), title: t('incidents.pareto.emptyTitle'), text: t('incidents.pareto.emptyText') }));
        return;
      }
      let vital = true;
      const items = pareto.map((p, i) => {
        const strong = vital;
        if (p.cumulativePct >= 80) vital = false;
        return { id: `cause-${i}`, label: label('rootCause', p.label), value: p.value, color: strong ? 'var(--s1)' : 'var(--line-2)', meta: t('incidents.pareto.meta', { pct: fmt.pct(p.cumulativePct) }) };
      });
      const chart = tryEl(() => charts.barChart({ items, horizontal: true, sorted: false, height: Math.max(180, items.length * 34 + 24), valueFormat: (v) => fmt.num(v), showValues: true, maxBars: 12, ariaLabel: t('incidents.pareto.aria') }), 'barChart');
      const legend = h('ul', { class: 'legend', 'aria-label': t('incidents.common.legend') },
        h('li', { class: 'legend-item' }, h('span', { class: 'legend-key', style: { '--key': 'var(--s1)', background: 'var(--s1)' } }), h('span', { class: 'legend-label' }, t('incidents.pareto.vital', { pct: fmt.pct(80) }))),
        h('li', { class: 'legend-item' }, h('span', { class: 'legend-key', style: { '--key': 'var(--line-2)', background: 'var(--line-2)' } }), h('span', { class: 'legend-label' }, t('incidents.pareto.rest'))));
      paretoHost.replaceChildren(h('div', { class: 'stack gap-3' }, legend, chart || C.emptyState({ title: t('incidents.errors.chart') }), h('p', { class: 't-helper' }, t('incidents.pareto.note', { pct: fmt.pct(80) }))));
    }

    /* ───────────── stepper ───────────── */
    function stepper(step, status, { small = false, vertical = false } = {}) {
      const current = Math.max(0, Math.min(STEP_COUNT - 1, Number(step) || 0));
      const closed = status === CLOSED;
      const ol = h('ol', { class: ['stepper', small ? 'is-sm' : null, vertical ? 'is-vertical' : null], role: 'list', 'aria-label': t('incidents.steps.aria') });
      for (let i = 0; i < STEP_COUNT; i += 1) {
        const done = closed || i < current;
        const isCurrent = !done && i === current;
        const li = h('li', { class: ['step', done ? 'is-done' : null, isCurrent ? 'is-current' : null], 'aria-current': isCurrent ? 'step' : undefined });
        const dot = h('span', { class: 'step-dot', 'aria-hidden': 'true' });
        if (done) dot.appendChild(checkMark(small ? 10 : 12));
        li.appendChild(dot);
        li.appendChild(h('span', { class: 'step-label' }, stepLabel(i)));
        li.appendChild(h('span', { class: 'sr-only' }, done ? t('incidents.steps.srDone') : (isCurrent ? t('incidents.steps.srCurrent') : t('incidents.steps.srPending'))));
        ol.appendChild(li);
      }
      return ol;
    }

    /* ───────────── cards ───────────── */
    function incidentCard(inc) {
      const cat = categoryOf(inc.categoryId);
      const actions = Array.isArray(inc.actions) ? inc.actions : [];
      const done = actions.filter((a) => a && a.done).length;
      const titleId = `inc-${inc.id}-title`;
      const open = () => openDrawer(inc.id);
      const el = h('article', { class: 'card', role: 'listitem', 'aria-labelledby': titleId, 'data-id': inc.id });
      const body = h('div', { class: 'card-body stack gap-3' });
      body.appendChild(h('div', { class: 'row between gap-2' },
        h('span', { class: 'code mono nowrap t-helper', dir: 'ltr', translate: 'no' }, inc.code),
        C.badge(statusLabel(inc.status), STATUS_TONE[inc.status] || 'neutral')));
      body.appendChild(h('h3', { class: 'card-title' }, h('button', { type: 'button', id: titleId, style: { textAlign: 'start', color: 'inherit', font: 'inherit', background: 'none', border: '0', padding: '0', cursor: 'pointer' }, onClick: open }, L(inc, 'title', 'incidents') || '—')));
      body.appendChild(h('div', { class: 'row wrap gap-2' },
        C.badge(severityText(inc.severity), severityTone(inc.severity)),
        C.badge(typeLabel(inc.type), 'neutral', { icon: TYPE_ICON[inc.type] || 'incident' })));
      body.appendChild(h('div', { class: 'row wrap gap-2 t-helper' },
        cat ? h('span', { class: 'row gap-1' }, ico(cat.icon || 'hazard', 13), label('hseCategory', cat.id)) : null,
        h('span', {}, siteName(inc.siteId)),
        h('span', { class: 'nowrap' }, t('incidents.card.when', { date: fmt.date(inc.date, { style: 'short' }), time: fmt.time(inc.time || '') }))));
      body.appendChild(stepper(inc.investigationStep, inc.status, { small: true }));
      const prog = h('div', { class: 'progress-row grow', title: t('incidents.card.actionsTitle') });
      prog.appendChild(C.progress({ value: done, max: Math.max(actions.length, 1), tone: actions.length && done === actions.length ? 'good' : null, label: t('incidents.card.actionsAria', { done: fmt.num(done), total: fmt.num(actions.length) }) }));
      prog.appendChild(h('span', { class: 'progress-value' }, actions.length ? h('bdi', { dir: 'ltr' }, `${fmt.num(done)}/${fmt.num(actions.length)}`) : '—'));
      body.appendChild(h('div', { class: 'row between gap-3' }, prog, C.button(t('incidents.card.details'), { variant: 'outline', size: 'sm', onClick: open, attrs: { 'aria-label': t('incidents.card.detailsAria', { code: inc.code }) } })));
      el.appendChild(body);
      return el;
    }

    function paintList() {
      const rows = listRows();
      listCount.querySelector('.badge-text').textContent = tn('incidents.common.incidents', rows.length);
      const sigs = new Map(rows.map((r) => [r.id, `${r.status}|${r.investigationStep}|${(r.actions || []).filter((a) => a && a.done).length}|${r.title}`]));
      cardsHost.replaceChildren();
      listFoot.replaceChildren();
      if (!rows.length) {
        const g = globalFilters();
        const filtered = local.types.length || local.status !== 'all' || local.severity !== 'all' || local.q || g.search;
        cardsHost.appendChild(C.emptyState({
          icon: ico('check-circle', 30), title: filtered ? t('incidents.list.emptyFilteredTitle') : t('incidents.list.emptyTitle'),
          text: filtered ? t('incidents.list.emptyFilteredText') : t('incidents.list.emptyText'),
          action: filtered ? { label: t('incidents.list.resetFilters'), icon: 'refresh', onClick: () => bar.reset() } : { label: t('incidents.actions.report'), icon: 'incident', onClick: () => openReportModal() },
        }));
        cardSignatures.clear();
        return;
      }
      const visible = showAll ? rows : rows.slice(0, LIST_PAGE);
      const frag = document.createDocumentFragment();
      const changed = [];
      visible.forEach((inc) => {
        const card = incidentCard(inc);
        frag.appendChild(card);
        const prev = cardSignatures.get(inc.id);
        if (prev !== undefined && prev !== sigs.get(inc.id)) changed.push(card);
      });
      cardsHost.appendChild(frag);
      cardSignatures.clear();
      sigs.forEach((v, k) => cardSignatures.set(k, v));
      if (motion && typeof motion.flash === 'function') changed.forEach((c) => motion.flash(c));
      if (rows.length > LIST_PAGE) {
        listFoot.appendChild(C.button(showAll ? t('incidents.list.showLess') : t('incidents.list.showAll', { count: fmt.num(rows.length) }), { variant: 'ghost', size: 'sm', onClick: () => { showAll = !showAll; paintList(); } }));
      }
    }

    /* ───────────── drawer ───────────── */
    const section = (title, ...children) => h('section', { class: 'drawer-section' }, title ? h('h3', { class: 'drawer-section-title' }, title) : null, h('div', { class: 'stack gap-3' }, children));

    function overviewTab(inc) {
      const cat = categoryOf(inc.categoryId);
      return h('div', {},
        section(null,
          h('div', { class: 'row wrap gap-2' },
            C.badge(typeLabel(inc.type), 'neutral', { icon: TYPE_ICON[inc.type] || 'incident' }),
            C.badge(severityText(inc.severity), severityTone(inc.severity)),
            C.badge(statusLabel(inc.status), STATUS_TONE[inc.status] || 'neutral')),
          h('p', { class: 't-body' }, L(inc, 'description', 'incidents') || t('incidents.drawer.noDescription'))),
        section(t('incidents.drawer.facts'), C.kv([
          [t('incidents.drawer.site'), t('incidents.drawer.siteValue', { site: siteName(inc.siteId), location: L(inc, 'location', 'incidents') || '—' })],
          [t('incidents.drawer.when'), t('incidents.card.when', { date: fmt.date(inc.date, { style: 'long' }), time: fmt.time(inc.time || '') })],
          [t('incidents.drawer.category'), cat ? h('span', { class: 'row gap-1' }, ico(cat.icon || 'hazard', 14), label('hseCategory', cat.id)) : '—'],
          [t('incidents.drawer.reporter'), term(inc.reporter) || '—'],
          inc.bodyPart ? [t('incidents.drawer.bodyPart'), label('bodyPart', inc.bodyPart)] : null,
          [t('incidents.drawer.daysLost'), tn('incidents.metrics.daysCount', Number(inc.daysLost) || 0)],
          [t('incidents.drawer.immediate'), L(inc, 'immediateCause', 'incidents') || '—'],
          [t('incidents.drawer.root'), inc.rootCause ? C.badge(label('rootCause', inc.rootCause), 'neutral') : '—'],
          inc.closedAt ? [t('incidents.drawer.closedAt'), fmt.date(inc.closedAt)] : null,
        ])));
    }
    function investigationTab(inc) {
      const step = Math.max(0, Math.min(STEP_COUNT - 1, Number(inc.investigationStep) || 0));
      const closed = inc.status === CLOSED;
      const note = closed
        ? t('incidents.drawer.noteClosed')
        : (step >= STEP_COUNT - 1 ? t('incidents.drawer.noteReady') : t('incidents.drawer.noteStep', { step: stepLabel(step), status: statusLabel(STATUS_FOR_STEP[step + 1]) }));
      return section(t('incidents.drawer.path'), stepper(step, inc.status, { vertical: true }), h('p', { class: ['note', closed ? 'tone-good' : 'tone-brand'] }, note));
    }
    function actionsTab(inc) {
      const actions = Array.isArray(inc.actions) ? arrOf(L(inc, 'actions', 'incidents')) : [];
      const done = actions.filter((a) => a && a.done).length;
      const checklist = h('ul', { class: 'list-reset stack gap-2' });
      if (!actions.length) checklist.appendChild(h('li', { class: 'note' }, t('incidents.drawer.noActions')));
      const today = new Date(now()); today.setHours(0, 0, 0, 0);
      actions.forEach((a) => {
        const cbId = `act-${inc.id}-${a.id}`;
        const cb = h('input', { type: 'checkbox', id: cbId, class: 'field-control', 'data-focus-key': cbId, onChange: () => toggleAction(inc.id, a.id) });
        cb.checked = Boolean(a.done);
        const overdue = !a.done && Number.isFinite(parseDate(a.due)) && parseDate(a.due) < today.getTime();
        const meta = h('div', { class: 'row wrap gap-2 t-helper' }, h('span', {}, term(a.owner) || '—'), h('span', {}, t('incidents.drawer.actionDue', { date: fmt.date(a.due, { style: 'short' }) })));
        if (overdue) meta.appendChild(C.badge(t('incidents.drawer.actionOverdue'), 'critical'));
        if (a.done) meta.appendChild(C.badge(t('incidents.drawer.actionDone'), 'good'));
        checklist.appendChild(h('li', { class: 'controls-item' },
          cb,
          h('div', { class: 'stack gap-1' },
            h('label', { for: cbId, class: ['t-body', a.done ? 'muted' : null], style: a.done ? { textDecoration: 'line-through' } : undefined }, String(a.text || '')),
            meta)));
      });
      const prog = h('div', { class: 'progress-row' });
      prog.appendChild(C.progress({ value: done, max: Math.max(actions.length, 1), tone: actions.length && done === actions.length ? 'good' : null, label: t('incidents.card.actionsTitle') }));
      prog.appendChild(h('span', { class: 'progress-value' }, actions.length ? h('bdi', { dir: 'ltr' }, `${fmt.num(done)}/${fmt.num(actions.length)}`) : '—'));
      return section(t('incidents.drawer.actionsTitle', { done: fmt.num(done), total: fmt.num(actions.length) }), prog, checklist);
    }
    const arrOf = (v) => (Array.isArray(v) ? v : []);

    function openDrawer(id) {
      const first = findIncident(id);
      if (!first) { C.toast(t('incidents.toast.notFound'), { tone: 'warning' }); return; }
      if (activeDrawer) { try { activeDrawer.close(); } catch { /* ignore */ } activeDrawer = null; }
      const nextBtn = C.button(t('incidents.drawer.next'), { variant: 'primary', icon: ico('arrow-end', 15), onClick: () => advanceStep(id) });
      const closeBtn = C.button(t('core.common.close'), { variant: 'ghost', onClick: () => { if (api) api.close('action'); } });
      let unsub = () => {};
      const tabCount = (inc) => (Array.isArray(inc.actions) ? inc.actions.length : 0);
      const api = C.drawer({
        kind: 'hse-incident',
        title: first.code, subtitle: L(first, 'title', 'incidents'), size: 'lg',
        tabs: [
          { id: 'overview', label: t('incidents.drawer.tabs.overview'), icon: 'info', render: () => { const inc = findIncident(id); return inc ? overviewTab(inc) : C.emptyState({ title: t('incidents.toast.notFound') }); } },
          { id: 'investigation', label: t('incidents.drawer.tabs.investigation'), icon: 'search', render: () => { const inc = findIncident(id); return inc ? investigationTab(inc) : null; } },
          { id: 'actions', label: t('incidents.drawer.tabs.actions'), icon: 'check', count: tabCount(first), render: () => { const inc = findIncident(id); return inc ? actionsTab(inc) : null; } },
        ],
        actions: [nextBtn, closeBtn],
        onClose: () => {
          unsub();
          if (activeDrawer === api) activeDrawer = null;
          // The card that opened the drawer may have been re-rendered by a live update: focus its twin.
          const active = document.activeElement;
          if (!active || active === document.body) {
            const esc = typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(id) : id;
            const twin = cardsHost.querySelector(`[data-id="${esc}"] .card-title button`);
            if (twin) { try { twin.focus({ preventScroll: true }); } catch { twin.focus(); } }
          }
        },
      });
      activeDrawer = api;
      const paintFoot = () => {
        const inc = findIncident(id);
        if (!inc) { nextBtn.disabled = true; return; }
        const step = Math.max(0, Math.min(STEP_COUNT - 1, Number(inc.investigationStep) || 0));
        const closed = inc.status === CLOSED;
        nextBtn.disabled = closed;
        const lab = nextBtn.querySelector('.btn-label');
        if (lab) lab.textContent = closed ? t('incidents.drawer.closedBtn') : (step >= STEP_COUNT - 1 ? t('incidents.drawer.closeIncident') : t('incidents.drawer.nextTo', { step: stepLabel(step + 1) }));
        api.setTitle(inc.code);
        try { api.setSubtitle(L(inc, 'title', 'incidents')); } catch { /* ignore */ }
        if (typeof api.setTabCount === 'function') api.setTabCount('actions', tabCount(inc));
      };
      paintFoot();
      unsub = bus.on('store:change', (p) => {
        if (!touches(p && p.path, 'incidents')) return;
        const active = document.activeElement;
        const key = active && api.el.contains(active) ? active.getAttribute('data-focus-key') : null;
        paintFoot();
        ['overview', 'investigation', 'actions'].forEach((tab) => { try { api.refreshTab(tab); } catch { /* ignore */ } });
        if (key) { const target = api.el.querySelector(`[data-focus-key="${CSS.escape(key)}"]`); if (target) { try { target.focus({ preventScroll: true }); } catch { target.focus(); } } }
        else if (active && !api.el.contains(active) && document.activeElement === document.body) { try { nextBtn.focus({ preventScroll: true }); } catch { /* ignore */ } }
      });
      api.open();
    }

    function toggleAction(incidentId, actionId) {
      const inc = findIncident(incidentId);
      if (!inc) return;
      const actions = (inc.actions || []).map((a) => (a && a.id === actionId ? { ...a, done: !a.done } : a));
      const updated = store.updateIncident(incidentId, { actions });
      const target = actions.find((a) => a && a.id === actionId);
      if (!updated) { C.toast(t('incidents.toast.saveFailed'), { tone: 'warning' }); return; }
      C.toast(target && target.done ? t('incidents.toast.actionDone') : t('incidents.toast.actionReopened'), { tone: target && target.done ? 'good' : 'neutral', timeout: 2500 });
    }

    function advanceStep(id) {
      const inc = findIncident(id);
      if (!inc) return;
      if (inc.status === CLOSED) { C.toast(t('incidents.toast.alreadyClosed'), { tone: 'neutral' }); return; }
      const step = Math.max(0, Math.min(STEP_COUNT - 1, Number(inc.investigationStep) || 0));
      const next = Math.min(STEP_COUNT - 1, step + 1);
      const pending = (Array.isArray(inc.actions) ? inc.actions : []).filter((a) => a && !a.done).length;
      if (next === STEP_COUNT - 1 && pending > 0) {
        C.toast(tn('incidents.toast.pendingActions', pending), { tone: 'warning', title: t('incidents.toast.closeBlocked') });
        if (activeDrawer && typeof activeDrawer.setTab === 'function') activeDrawer.setTab('actions');
        return;
      }
      const updated = store.updateIncident(id, { investigationStep: next, status: STATUS_FOR_STEP[next] });
      if (!updated) { C.toast(t('incidents.toast.saveFailed'), { tone: 'warning' }); return; }
      if (next === STEP_COUNT - 1) C.toast(t('incidents.toast.closed', { code: inc.code }), { tone: 'good' });
      else C.toast(t('incidents.toast.advanced', { step: stepLabel(next), status: statusLabel(STATUS_FOR_STEP[next]) }), { tone: 'brand' });
    }

    /* ───────────── report modal ───────────── */
    function openReportModal() {
      if (activeModal) { try { activeModal.close(); } catch { /* ignore */ } activeModal = null; }
      const st = state();
      const sites = (st.sites || []).map((s) => ({ value: s.id, label: `${L(s, 'name', 'sites')} (${s.code})` }));
      const g = globalFilters();
      const defaultSite = g.siteId && g.siteId !== 'all' ? g.siteId : (sites[0] ? sites[0].value : 'S1');
      const at = now();
      const F = {
        title: C.formField({ label: t('incidents.form.title'), name: 'title', required: true, placeholder: t('incidents.form.titlePh') }),
        type: C.formField({ label: t('incidents.form.type'), name: 'type', type: 'select', value: NEAR_MISS_TYPE, options: INCIDENT_TYPES.map((x) => ({ value: x, label: typeLabel(x) })), required: true }),
        severity: C.formField({ label: t('incidents.form.severity'), name: 'severity', type: 'select', value: '2', required: true, options: [1, 2, 3, 4, 5].map((n) => ({ value: n, label: severityText(n) })), hint: t('incidents.form.severityHint', { min: fmt.num(1), max: fmt.num(5) }) }),
        siteId: C.formField({ label: t('incidents.form.site'), name: 'siteId', type: 'select', value: defaultSite, options: sites, required: true }),
        location: C.formField({ label: t('incidents.form.location'), name: 'location', required: true, placeholder: t('incidents.form.locationPh', { floor: fmt.num(12) }) }),
        categoryId: C.formField({ label: t('incidents.form.category'), name: 'categoryId', type: 'select', value: CATEGORIES[0] ? CATEGORIES[0].id : 'height', options: CATEGORIES.map((c) => ({ value: c.id, label: label('hseCategory', c.id) })), required: true }),
        date: C.formField({ label: t('incidents.form.date'), name: 'date', type: 'date', value: todayISO(at), required: true, max: todayISO(at) }),
        time: C.formField({ label: t('incidents.form.time'), name: 'time', type: 'time', value: nowHHMM(at), required: true }),
        reporter: C.formField({ label: t('incidents.form.reporter'), name: 'reporter', required: true, placeholder: t('incidents.form.reporterPh') }),
        bodyPart: C.formField({ label: t('incidents.form.bodyPart'), name: 'bodyPart', placeholder: t('incidents.form.bodyPartPh') }),
        daysLost: C.formField({ label: t('incidents.form.daysLost'), name: 'daysLost', type: 'number', value: 0, min: 0, max: 365, step: 1 }),
        immediateCause: C.formField({ label: t('incidents.form.immediate'), name: 'immediateCause', required: true, placeholder: t('incidents.form.immediatePh') }),
        rootCause: C.formField({ label: t('incidents.form.root'), name: 'rootCause', type: 'select', value: ROOT_CAUSES[0], options: ROOT_CAUSES.map((x) => ({ value: x, label: label('rootCause', x) })), hint: typeof fmt.digits === 'function' ? fmt.digits(t('incidents.form.rootHint')) : t('incidents.form.rootHint') }),
        description: C.formField({ label: t('incidents.form.description'), name: 'description', type: 'textarea', rows: 4, placeholder: t('incidents.form.descriptionPh') }),
      };
      F.title.classList.add('span-2'); F.description.classList.add('span-2');
      const summary = h('div', { class: 'form-error-summary span-2', role: 'alert', hidden: true });
      const form = h('form', { class: 'form-grid', novalidate: true, 'aria-label': t('incidents.form.aria') },
        summary,
        h('h3', { class: 'form-section-title span-2' }, t('incidents.form.sectionIncident')),
        F.title, F.type, F.severity, F.siteId, F.location, F.categoryId, F.date, F.time, F.reporter, F.bodyPart, F.daysLost,
        h('h3', { class: 'form-section-title span-2' }, t('incidents.form.sectionCauses')),
        F.immediateCause, F.rootCause, F.description,
        h('p', { class: 't-helper span-2' }, t('incidents.form.localNote')));

      const setError = (field, message) => {
        field.classList.add('is-invalid');
        const control = field.querySelector('.field-control');
        if (control) control.setAttribute('aria-invalid', 'true');
        const err = h('p', { class: 'field-error', id: `${control ? control.id : 'f'}-err` }, C.glyph('critical', 14), h('span', {}, message));
        field.appendChild(err);
        if (control) control.setAttribute('aria-describedby', [control.getAttribute('aria-describedby'), err.id].filter(Boolean).join(' '));
      };
      const clearErrors = () => {
        form.querySelectorAll('.field.is-invalid').forEach((x) => x.classList.remove('is-invalid'));
        form.querySelectorAll('.field-error').forEach((x) => x.remove());
        form.querySelectorAll('[aria-invalid]').forEach((x) => x.removeAttribute('aria-invalid'));
        summary.hidden = true;
      };
      const submit = () => {
        const data = C.readForm(form);
        clearErrors();
        const errors = [];
        const req = (k, msgKey) => { if (!String(data[k] || '').trim()) errors.push([F[k], t(msgKey)]); };
        req('title', 'incidents.form.errors.title');
        req('location', 'incidents.form.errors.location');
        req('reporter', 'incidents.form.errors.reporter');
        req('immediateCause', 'incidents.form.errors.immediate');
        const dMs = parseDate(String(data.date || ''));
        if (!Number.isFinite(dMs)) errors.push([F.date, t('incidents.form.errors.date')]);
        else if (dMs > parseDate(todayISO(now()))) errors.push([F.date, t('incidents.form.errors.future')]);
        if (!/^\d{1,2}:\d{2}$/.test(String(data.time || ''))) errors.push([F.time, t('incidents.form.errors.time')]);
        else if (Number.isFinite(dMs) && String(data.date) === todayISO(now()) && String(data.time) > nowHHMM(now())) errors.push([F.time, t('incidents.form.errors.futureTime')]);
        const days = Number(data.daysLost);
        if (data.daysLost !== null && data.daysLost !== '' && (!Number.isInteger(days) || days < 0 || days > 365)) errors.push([F.daysLost, t('incidents.form.errors.days', { min: fmt.num(0), max: fmt.num(365) })]);
        if (errors.length) {
          errors.forEach(([f, m]) => setError(f, m));
          summary.replaceChildren(C.glyph('critical', 18), h('span', {}, tn('incidents.form.errors.summary', errors.length)));
          summary.hidden = false;
          const firstCtl = errors[0][0].querySelector('.field-control');
          if (firstCtl) firstCtl.focus();
          return false;
        }
        const incident = store.addIncident({
          title: String(data.title).trim(), type: data.type, severity: Number(data.severity) || 2, siteId: data.siteId, location: String(data.location).trim(),
          categoryId: data.categoryId, date: data.date, time: data.time, reporter: String(data.reporter).trim(), bodyPart: String(data.bodyPart || '').trim() || null,
          daysLost: Number(data.daysLost) || 0, immediateCause: String(data.immediateCause).trim(), rootCause: data.rootCause, description: String(data.description || '').trim(),
          status: 'مفتوح', investigationStep: 0, actions: [],
        });
        if (!incident) { C.toast(t('incidents.toast.saveFailed'), { tone: 'critical' }); return false; }
        C.toast(t('incidents.toast.reported', { code: incident.code }), { tone: 'good', title: t('incidents.toast.reportedTitle'), action: { label: t('incidents.toast.view'), onClick: () => openDrawer(incident.id) } });
        local.types = []; local.status = 'all'; local.severity = 'all'; local.q = ''; showAll = false;
        bar.set({ type: [], status: 'all', severity: 'all', q: '' });
        return true;
      };
      form.addEventListener('submit', (e) => { e.preventDefault(); if (submit()) api.close('action'); });
      const api = C.modal({
        title: t('incidents.form.heading'), subtitle: t('incidents.form.subtitle'), size: 'lg', body: form,
        actions: [{ label: t('core.common.cancel'), variant: 'ghost' }, { label: t('incidents.form.save'), variant: 'primary', closes: false, onClick: () => { if (submit()) api.close('action'); return false; } }],
        onClose: () => { if (activeModal === api) activeModal = null; },
      });
      activeModal = api;
      api.open();
    }

    /* ───────────── repaint orchestration ───────────── */
    let pending = 0; // bitmask: 1 kpis, 2 charts, 4 list
    let raf = 0;
    function paintAll(mask) {
      if (mask & 1) { guard(statusHost, 'head', paintHead); guard(metricGrid, 'kpis', paintKpis); }
      if (mask & 2) { guard(trendHost, 'charts', paintCharts); }
      if (mask & 4) { guard(cardsHost, 'list', paintList); }
      if (firstPaint) {
        firstPaint = false;
        if (motion && typeof motion.enter === 'function') {
          motion.enter(Array.from(metricGrid.children), { y: 8 });
          motion.enter([trendCard, typeCard, paretoCard], { y: 10, delay: 0.06 });
          motion.enter(Array.from(cardsHost.children).slice(0, 12), { y: 8, delay: 0.12 });
        }
      }
    }
    function schedule(mask) {
      pending |= mask;
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        if (!alive) return;
        const m = pending; pending = 0;
        paintAll(m);
      });
    }

    paintAll(7);

    subs.push(bus.on('store:change', (p) => { const path = p && p.path; if (touches(path, 'incidents') || touches(path, 'sites') || touches(path, 'settings')) schedule(7); }));
    subs.push(bus.on('filters:change', () => { showAll = false; schedule(7); }));
    subs.push(bus.on('settings:change', () => schedule(7)));

    /* deep links: ?new=1 opens the report modal, ?id=I3 opens the drawer */
    if (params.new === '1' || params.new === 'true' || params.new === 1) {
      requestAnimationFrame(() => {
        if (!alive) return;
        openReportModal();
        try { history.replaceState(null, '', '#/incidents'); } catch { /* ignore */ }
      });
    } else if (params.id) {
      requestAnimationFrame(() => { if (!alive) return; if (findIncident(params.id)) openDrawer(params.id); else C.toast(t('incidents.toast.notFound'), { tone: 'warning' }); });
    }

    return () => {
      alive = false;
      if (raf) { cancelAnimationFrame(raf); raf = 0; }
      if (layoutRaf) { cancelAnimationFrame(layoutRaf); layoutRaf = 0; }
      if (layoutObserver) { try { layoutObserver.disconnect(); } catch { /* ignore */ } layoutObserver = null; }
      subs.splice(0).forEach((u) => { try { u(); } catch { /* ignore */ } });
      if (activeDrawer) { try { activeDrawer.close(); } catch { /* ignore */ } activeDrawer = null; }
      if (activeModal) { try { activeModal.close(); } catch { /* ignore */ } activeModal = null; }
    };
  },
};

export default incidentsView;
