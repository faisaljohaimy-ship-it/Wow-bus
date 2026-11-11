/**
 * BILTIX Risk AI — view: Integrations & systems (js/views/integrations.js) — SEC-09. Owner: B-PLATFORM.
 *
 * Two groups of connectors on one honest screen:
 *   • Site & safety systems  — state.integrations (seed.js; mirrors in data ns 'integrations')
 *   • Enterprise connectors  — state.platform.connectors (platform-seed.js; data ns 'connectors')
 * Every status comes from status.js (Demo / Not connected / Live / Stale / Error / Offline) — never the stored
 * 'connected' value. Simulated figures carry a "Simulated scenario" tag. "Test connection" exists only for the
 * types a browser can genuinely test over HTTP (json / sheets / supabase / webhook) and reports exactly what the
 * real request returned; every other connector shows "Needs a backend" with the reason. A real test is recorded
 * on the record as `lastTest` (diagnostic only: it never turns a connector "live" — only the data source in
 * Settings can be live). The data source itself is managed in Settings (summary card here, #int-datasource,
 * deep link ?section=datasource).
 *
 * Live updates: `integrations:tick` patches simulated figures in place (no flash); a store change on one record
 * repaints that card (flash only when its status changed); filters re-render the grid without motion.
 * Strings: dictionary 'integrations' (js/i18n/integrations.js). Data reaches the DOM only via textContent / h().
 */

import { i18n } from '../core/i18n.js';
import dict from '../i18n/integrations.js';

i18n.register('integrations', dict);

const HISTORY_CAP = 24;
const RELATIVE_REFRESH_MS = 30_000;
const REAL_TYPES = ['json', 'sheets', 'supabase', 'webhook'];
const TYPE_LABEL = { json: 'JSON API', sheets: 'Google Sheets CSV', supabase: 'Supabase', webhook: 'Webhook' };
const STATUS_KEYS = ['demo', 'live', 'offline', 'stale', 'error', 'not_connected'];
const FIELD_TYPES = new Set(['text', 'url', 'password', 'number', 'select', 'textarea', 'email']);
const ICON_ALIAS = { document: 'dms', watch: 'wearable', users: 'hr', database: 'erp', chat: 'teams', sheet: 'sheets', sensor: 'iot', camera: 'cctv', shield: 'gosi' };
const CONNECTOR_ICON = { enterprise: 'erp', biltix: 'biltix', external: 'globe' };

/** Rolling eventsPerHour history per integration id (module scope, survives navigation). */
const history = new Map();
/** Presentation and filters, remembered for the session. */
let viewMode = 'cards';
let filterState = { group: 'all', status: 'all', q: '' };

const STYLE_ID = 'view-integrations-style';
const STYLE_TEXT = `
.view-integrations .intg-summary { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-2) var(--space-3); margin: 0; }
.view-integrations .intg-summary-item { display: inline-flex; align-items: center; gap: 8px; padding: 6px 10px 6px 8px; border-radius: var(--radius-md); background: var(--bg-1); border: 1px solid var(--line); }
.view-integrations .intg-summary-item dd { margin: 0; font-weight: 600; font-variant-numeric: tabular-nums; color: var(--ink-1); min-inline-size: 1.5ch; }
.view-integrations .intg-summary-item.is-zero dd { color: var(--ink-3); }
.view-integrations .intg-summary-label { font-size: var(--fs-sm); color: var(--ink-2); font-weight: 600; margin-inline-end: 4px; }
.view-integrations .intg-toolbar { display: flex; align-items: center; justify-content: space-between; gap: var(--space-2) var(--space-3); flex-wrap: wrap; }
.view-integrations .intg-count { font-size: var(--fs-sm); color: var(--ink-2); }
.view-integrations .intg-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 300px), 1fr)); gap: var(--gap); }
.view-integrations .intg-grid.is-list { grid-template-columns: minmax(0, 1fr); gap: var(--space-2); }
.view-integrations .int-card { min-inline-size: 0; }
.view-integrations .int-titles { flex: 1 1 auto; }
.view-integrations .int-name { overflow-wrap: anywhere; }
.view-integrations .int-desc { margin: 0; display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; overflow: hidden; }
.view-integrations .intg-sim { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.view-integrations .int-stats { grid-template-columns: repeat(2, minmax(0, 1fr)); row-gap: 10px; }
.view-integrations .int-stat-label, .view-integrations .int-stat-value { white-space: normal; overflow: visible; text-overflow: clip; overflow-wrap: anywhere; }
.view-integrations .int-stat-value { font-family: var(--font-sans); font-variant-numeric: tabular-nums; }
.view-integrations .intg-nodata { font-size: var(--fs-sm); color: var(--ink-3); padding: 10px 12px; border: 1px dashed var(--line-2); border-radius: var(--radius-md); display: flex; align-items: center; gap: 8px; }
.view-integrations .intg-test { font-size: var(--fs-xs); color: var(--ink-2); display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.view-integrations .intg-test.is-ok > svg { color: var(--good-text); }
.view-integrations .intg-test.is-fail > svg { color: var(--critical-text); }
.view-integrations .intg-test.is-opaque > svg { color: var(--warning-text); }
.view-integrations .intg-backend { display: inline-flex; align-items: center; gap: 6px; font-size: var(--fs-xs); color: var(--ink-3); min-block-size: 32px; }
.view-integrations .intg-actions { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.view-integrations .intg-grid.is-list .int-card { display: grid; grid-template-columns: minmax(220px, 1.3fr) minmax(0, 2fr) auto; align-items: center; gap: 10px 16px; padding-block: 12px; }
.view-integrations .intg-grid.is-list .int-desc, .view-integrations .intg-grid.is-list .int-meta { display: none; }
.view-integrations .intg-grid.is-list .int-stats { grid-template-columns: repeat(4, minmax(0, 1fr)); background: transparent; border: 0; padding: 0; }
.view-integrations .intg-grid.is-list .int-foot { margin: 0; justify-content: flex-end; }
.view-integrations .intg-grid.is-list .intg-test { grid-column: 1 / -1; }
@container main (max-width: 900px) {
  .view-integrations .intg-grid.is-list .int-card { grid-template-columns: minmax(0, 1fr); }
  .view-integrations .intg-grid.is-list .int-stats { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .view-integrations .intg-grid.is-list .int-foot { justify-content: flex-start; }
}
.view-integrations .intg-ds { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 220px), 1fr)); gap: var(--space-2); margin: 0; }
.view-integrations .intg-ds .intg-fact { display: flex; flex-direction: column; gap: 4px; padding: 10px 12px; border-radius: var(--radius-md); background: var(--bg-2); border: 1px solid var(--line); min-inline-size: 0; }
.view-integrations .intg-ds dt { font-size: var(--fs-xs); color: var(--ink-2); }
.view-integrations .intg-ds dd { margin: 0; color: var(--ink-1); font-size: var(--fs-sm); display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }
.view-integrations #int-datasource { scroll-margin-block-start: var(--space-4); }
@media (max-width: 959.98px) { .view-integrations #int-datasource { scroll-margin-block-start: calc(var(--appbar-h) + var(--space-4)); } }
.view-integrations .num { font-variant-numeric: tabular-nums; unicode-bidi: isolate; }
/* Phones: the status select takes its own row and its label sits above it. Segmented groups and the view-head
   status badge are handled by css/components.css. */
@container main (max-width: 640px) {
  .view-integrations .filter-bar-group.is-select { flex-basis: 100%; flex-wrap: wrap; }
}
.intg-modal .intg-kv { display: flex; flex-wrap: wrap; gap: 6px 18px; margin: 0; font-size: var(--fs-sm); }
.intg-modal .intg-kv div { display: inline-flex; gap: 6px; align-items: center; }
.intg-modal .intg-kv dt { color: var(--ink-3); }
.intg-modal .intg-kv dd { margin: 0; color: var(--ink-1); }
`;

/** Free text → the active numeral system; Latin alphanumeric tokens (WBGT, P6, 06:30 stays a time) keep ASCII digits. */
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
const arr = (v) => (Array.isArray(v) ? v : []);
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

/** Date + 24 h time in Riyadh time (the product's reference zone), numerals and calendar from fmt.locale(). */
function riyadhDateTime(fmt, iso) {
  const d = iso instanceof Date ? iso : new Date(iso);
  if (!Number.isFinite(d.getTime())) return '—';
  try {
    const loc = fmt.locale();
    const date = new Intl.DateTimeFormat(loc, { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Riyadh' }).format(d);
    const time = new Intl.DateTimeFormat(loc, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: 'Asia/Riyadh' }).format(d);
    return `${date}${/^ar/.test(loc) ? '،' : ','} ${time}`;
  } catch { return fmt.dateTime(d); }
}

function ensureStyle() {
  if (typeof document === 'undefined' || document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = STYLE_TEXT;
  document.head.appendChild(style);
}

function seedHistory(g) {
  const id = g && g.id;
  if (!id) return [];
  if (history.has(id)) return history.get(id);
  const base = Array.isArray(g.eventsHistory) ? g.eventsHistory.map(Number).filter(Number.isFinite) : [];
  const v = Number(g.eventsPerHour);
  const list = base.length ? base.slice(-HISTORY_CAP) : (Number.isFinite(v) && v > 0 ? Array.from({ length: 6 }, () => v) : []);
  history.set(id, list);
  return list;
}
function pushHistory(g) {
  const list = seedHistory(g);
  const v = Number(g && g.eventsPerHour);
  if (!Number.isFinite(v)) return list;
  list.push(v);
  while (list.length > HISTORY_CAP) list.shift();
  return list;
}

function isHttpsUrl(value) {
  try { return new URL(String(value || '').trim()).protocol === 'https:'; } catch { return false; }
}

export default {
  id: 'integrations',
  code: 'SEC-09',
  get title() { return i18n.has('core.nav.integrations.title') ? i18n.t('core.nav.integrations.title') : 'التكاملات والأنظمة'; },
  icon: 'plug',

  render(container, ctx) {
    const { store, bus, fmt, charts, components, router, psel } = ctx;
    const sources = ctx.sources || {};
    const art = ctx.art || null;
    const status = ctx.status || (typeof window !== 'undefined' && window.biltix && window.biltix.status) || null;
    const motion = ctx.motion || components.motion || null;
    const { h, card, badge, button, segmented, modal, toast, emptyState, svgIcon, glyph, formField, readForm, statusBadge, filterBar } = components;
    const t = (k, p) => i18n.t(k, p);
    const tn = (k, n, p) => i18n.tn(k, n, p);
    const en = () => i18n.lang() === 'en';
    const msgOf = (r) => String((en() ? (r && (r.messageEn || r.message)) : (r && (r.message || r.messageEn))) || '');
    const now = () => (typeof store.now === 'function' ? store.now() : new Date());
    const params = ctx.params || {};
    ensureStyle();

    const root = h('section', { class: 'view view-integrations' });
    container.appendChild(root);

    const cardRefs = new Map();      // key → { el, refs, item, status }
    let gridEl = null;
    let countEl = null;
    let summaryEl = null;
    let bannerEl = null;
    let dsCard = null;
    let fb = null;
    let openModal = null;
    let firstPaint = true;

    /* ───────────────────────── data ───────────────────────── */

    const integrations = () => arr(store.state && store.state.integrations).filter(Boolean);
    const connectors = () => arr(safe(() => psel.platform(store.state).connectors, null) || (store.state.platform && store.state.platform.connectors)).filter(Boolean);
    function items() {
      return [
        ...integrations().map((rec) => ({ key: `i:${rec.id}`, kind: 'integration', ns: 'integrations', group: 'site', rec })),
        ...connectors().map((rec) => ({ key: `c:${rec.id}`, kind: 'connector', ns: 'connectors', group: 'enterprise', rec })),
      ];
    }
    const statusOf = (item) => {
      const s = safe(() => status.connector(store.state, item.rec, now()), 'not_connected');
      return STATUS_KEYS.includes(s) ? s : 'not_connected';
    };
    const nameOf = (item) => String(i18n.L(item.rec, 'name', item.ns) || item.rec.name || item.rec.id);
    const vendorOf = (item) => {
      const raw = String(item.rec.vendor || '');
      if (!raw) return t('integrations.card.vendorUnknown');
      // Generic vendor words the shared term list does not cover yet ('مفتوح' = open standard).
      if (i18n.has(`integrations.vendors.${raw}`)) return t(`integrations.vendors.${raw}`);
      // Brand casing (BILTIX) for the seed's "Biltix …" vendor names.
      return String(i18n.term(raw) || raw).replace(/\bBiltix\b/g, 'BILTIX');
    };
    const descOf = (item) => digitsIn(fmt, brandCase(String(i18n.L(item.rec, 'description', item.ns) || '')));
    const brandCase = (s) => s.replace(/\bBiltix\b/g, 'BILTIX');
    const categoryOf = (item) => (item.kind === 'integration' ? i18n.label('integrationCategory', item.rec.category) : i18n.label('connectorLayer', item.rec.layer));
    const testTypeOf = (item) => (item.kind === 'integration' && REAL_TYPES.includes(item.rec.connectionType) ? item.rec.connectionType : null);
    function iconOf(item, size = 22) {
      const rec = item.rec;
      const candidates = item.kind === 'integration'
        ? [rec.icon, ICON_ALIAS[rec.icon], rec.id, 'plug']
        : [rec.id.startsWith('biltix') ? 'biltix' : null, rec.id === 'autodesk-aps' ? 'layers' : null, CONNECTOR_ICON[rec.layer], 'plug'];
      const has = art && typeof art.hasIcon === 'function' ? (n) => { try { return !!art.hasIcon(n); } catch { return false; } } : () => true;
      return svgIcon(candidates.filter(Boolean).find(has) || 'plug', size);
    }
    const relSafe = (iso) => {
      const ms = Date.parse(iso);
      if (!Number.isFinite(ms)) return '—';
      return fmt.relative(new Date(Math.min(ms, now().getTime())), now());
    };
    const msText = (n) => t('integrations.card.ms', { n: fmt.num(n) });

    function matches(item, st) {
      if (filterState.group !== 'all' && item.group !== filterState.group) return false;
      if (filterState.status !== 'all' && st !== filterState.status) return false;
      const q = String(filterState.q || '').trim().toLowerCase();
      if (q) {
        const hay = [nameOf(item), item.rec.name, vendorOf(item), item.rec.vendor, item.rec.id, categoryOf(item)].filter(Boolean).join(' ').toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    }

    /* ───────────────────────── head, banner, data source ───────────────────────── */

    function buildHead() {
      return h('div', { class: 'view-head' },
        h('div', { class: 'view-head-text' },
          h('span', { class: 'code-tag' }, 'SEC-09'),
          h('h1', { tabindex: '-1' }, t('integrations.title')),
          h('p', { class: 'view-lead' }, t('integrations.lead'))),
        h('div', { class: 'view-actions' }, statusBadge(safe(() => status.mode(store.state), 'demo') === 'demo' ? 'demo' : safe(() => status.source(store.state).status, 'not_connected'))));
    }
    function buildBanner() {
      const demo = safe(() => status.mode(store.state), 'demo') === 'demo';
      return h('div', { class: ['note', 'is-demo'], role: 'note', style: { '--tone': 'var(--brand)' } },
        h('span', { class: 'row gap-2', style: { alignItems: 'flex-start' } }, svgIcon('flask', 16), h('span', {}, demo ? t('integrations.bannerDemo') : t('integrations.bannerLive'))));
    }

    function buildDataSource() {
      const s = store.state.settings || {};
      const ds = isObj(s.dataSource) ? s.dataSource : {};
      const src = safe(() => status.source(store.state, now()), { status: 'demo' });
      const type = ['simulation', 'json', 'sheets', 'supabase'].includes(ds.type) ? ds.type : 'simulation';
      const hook = typeof s.alertWebhook === 'string' && s.alertWebhook.trim() ? s.alertWebhook.trim() : '';
      const go = (section) => (router && typeof router.navigate === 'function' ? router.navigate('settings', { section }) : (location.hash = `#/settings?section=${section}`));
      const el = card({
        id: 'int-datasource', code: 'INT-00', title: t('integrations.datasource.title'), subtitle: t('integrations.datasource.sub'),
        body: h('dl', { class: 'intg-ds' },
          h('div', { class: 'intg-fact' }, h('dt', {}, t('integrations.datasource.type')), h('dd', {}, statusBadge(src.status, { size: 'sm' }), h('span', {}, t(`integrations.datasource.types.${type}`)))),
          h('div', { class: 'intg-fact' }, h('dt', {}, t('integrations.datasource.lastTest')), h('dd', {}, src.lastSuccessAt ? h('span', { title: riyadhDateTime(fmt, src.lastSuccessAt) }, relSafe(src.lastSuccessAt)) : t('integrations.datasource.never'))),
          h('div', { class: 'intg-fact' }, h('dt', {}, t('integrations.datasource.webhook')), h('dd', {}, glyph(hook ? 'good' : 'neutral', 14), h('span', {}, hook ? t('integrations.datasource.webhookSet') : t('integrations.datasource.webhookNone'))))),
        footer: h('div', { class: 'intg-actions' },
          button(t('integrations.datasource.configure'), { variant: 'outline', size: 'sm', icon: 'settings', onClick: () => go('data') }),
          button(t('integrations.datasource.configureWebhook'), { variant: 'ghost', size: 'sm', icon: 'webhook', onClick: () => go('notifications') })),
      });
      el.tabIndex = -1;
      return el;
    }

    function buildSummary() {
      const list = items();
      const counts = Object.fromEntries(STATUS_KEYS.map((s) => [s, 0]));
      list.forEach((it) => { counts[statusOf(it)] += 1; });
      return h('dl', { class: 'intg-summary', 'aria-label': t('integrations.summaryAria') },
        h('span', { class: 'intg-summary-label', 'aria-hidden': 'true' }, `${t('integrations.summaryTitle')} · ${tn('integrations.total', list.length)}`),
        ...STATUS_KEYS.map((s) => h('div', { class: ['intg-summary-item', counts[s] ? null : 'is-zero'] },
          h('dt', {}, statusBadge(s, { size: 'sm' })),
          h('dd', {}, fmt.num(counts[s])))));
    }

    /* ───────────────────────── cards ───────────────────────── */

    function statCell(label, value) {
      return h('div', { class: 'int-stat' }, h('span', { class: 'int-stat-label' }, label), h('span', { class: 'int-stat-value' }, value));
    }
    function sparkFor(rec) {
      const values = seedHistory(rec);
      if (!values.length || !charts || typeof charts.sparkline !== 'function') return h('span', { class: 'muted' }, '—');
      try {
        if (typeof charts.radialTrend === 'function') {
          const rt = charts.radialTrend({ values, tone: 'accent', size: 'sm', label: t('integrations.card.historyAria', { count: fmt.num(values.length) }) });
          if (rt && rt.el instanceof Node) return rt.el;
        }
        const sp = charts.sparkline({ values, width: 110, height: 26, color: 'var(--ink-3)', accentLast: true });
        if (sp && sp.el instanceof Node) { sp.el.setAttribute('aria-label', t('integrations.card.historyAria', { count: fmt.num(values.length) })); sp.el.setAttribute('role', 'img'); sp.el.removeAttribute('aria-hidden'); return sp.el; }
      } catch { /* fall through */ }
      return h('span', { class: 'muted' }, '—');
    }

    function paintStats(entry) {
      const { refs, item } = entry;
      const rec = item.rec;
      const st = entry.status;
      if (st === 'not_connected') {
        refs.statsHost.replaceChildren(h('div', { class: 'intg-nodata' }, svgIcon('plug', 14), h('span', {}, t('integrations.card.noData'))));
        return;
      }
      const latency = Number(rec.latencyMs);
      const cells = [
        statCell(t('integrations.card.lastSync'), rec.lastSync ? h('span', { title: riyadhDateTime(fmt, rec.lastSync) }, relSafe(rec.lastSync)) : '—'),
        statCell(t('integrations.card.latency'), Number.isFinite(latency) && latency > 0 ? h('span', { class: 'num' }, msText(latency)) : '—'),
      ];
      if (item.kind === 'integration') {
        cells.push(statCell(t('integrations.card.events'), h('span', { class: 'num' }, fmt.num(Number(rec.eventsPerHour) || 0))));
        cells.push(statCell(t('integrations.card.history'), sparkFor(rec)));
      } else {
        cells.push(statCell(t('integrations.card.records'), h('span', { class: 'num' }, fmt.num(Number(rec.recordsPerDay) || 0))));
        cells.push(statCell(t('integrations.card.mode'), i18n.label('connectorMode', rec.mode)));
      }
      refs.statsHost.replaceChildren(...[
        rec.simulated === false ? null : h('div', { class: 'intg-sim' }, h('span', { class: 'sim-tag' }, svgIcon('flask', 11), t('integrations.card.simulated'))),
        h('div', { class: 'int-stats' }, ...cells),
      ].filter(Boolean));
    }

    function paintTest(entry) {
      const lt = entry.item.rec.lastTest;
      if (!isObj(lt) || !lt.at) { entry.refs.testHost.hidden = true; entry.refs.testHost.replaceChildren(); return; }
      const kind = lt.ok ? 'ok' : (lt.opaque ? 'opaque' : 'fail');
      entry.refs.testHost.hidden = false;
      entry.refs.testHost.className = ['intg-test', `is-${kind}`].join(' ');
      entry.refs.testHost.replaceChildren(...[
        glyph(kind === 'ok' ? 'good' : (kind === 'opaque' ? 'warning' : 'critical'), 12),
        h('span', {}, `${t('integrations.card.lastTest')}: ${t(`integrations.card.${kind === 'ok' ? 'testOk' : (kind === 'opaque' ? 'testOpaque' : 'testFail')}`)}`),
        h('span', { class: 'muted', title: riyadhDateTime(fmt, lt.at) }, `· ${relSafe(lt.at)}`),
        Number.isFinite(Number(lt.latencyMs)) && Number(lt.latencyMs) > 0 ? h('span', { class: 'muted num' }, `· ${msText(Number(lt.latencyMs))}`) : null,
      ].filter(Boolean));
    }

    function paintCard(entry, { full = false } = {}) {
      const { el, refs, item } = entry;
      const prev = entry.status;
      entry.status = statusOf(item);
      el.dataset.status = entry.status;
      if (full || prev !== entry.status) refs.statusHost.replaceChildren(statusBadge(entry.status, { size: 'sm' }));
      paintStats(entry);
      paintTest(entry);
      return prev !== undefined && prev !== entry.status;
    }

    function buildCard(item) {
      const rec = item.rec;
      const testType = testTypeOf(item);
      const refs = {
        statusHost: h('span', { class: 'int-status' }),
        statsHost: h('div', { class: 'stack gap-2' }),
        testHost: h('div', { class: 'intg-test', hidden: true }),
      };
      const backendTipId = `intg-tip-${String(rec.id).replace(/[^\w-]/g, '')}-${item.kind}`;
      const configured = isObj(rec.config) && Object.values(rec.config).some((v) => String(v || '').trim());
      const meta = h('div', { class: 'int-meta' },
        badge(categoryOf(item), 'neutral', { icon: svgIcon('grid', 12) }),
        testType ? badge(t('integrations.card.httpTest', { type: TYPE_LABEL[testType] }), 'brand', { icon: svgIcon('plug', 12) }) : badge(t('integrations.card.needsBackend'), 'neutral', { icon: svgIcon('lock', 12) }),
        configured ? badge(t('integrations.card.configured'), 'neutral', { icon: svgIcon('check', 12) }) : null);
      const actions = h('div', { class: 'intg-actions' },
        button(t('integrations.card.configure'), { variant: 'outline', size: 'sm', icon: svgIcon('settings', 15), onClick: (e) => openConfig(item, e.currentTarget) }));
      if (testType) actions.appendChild(button(t('integrations.card.test'), { variant: 'ghost', size: 'sm', icon: svgIcon('plug', 15), onClick: (e) => openConfig(item, e.currentTarget, { autoTest: true }) }));
      else actions.appendChild(h('span', { class: 'intg-backend', id: backendTipId, title: t('integrations.card.needsBackendTip') }, svgIcon('lock', 13), h('span', {}, t('integrations.card.needsBackend')), h('span', { class: 'sr-only' }, ` — ${t('integrations.card.needsBackendTip')}`)));
      const desc = descOf(item);
      const el = h('div', { class: 'int-card', role: 'listitem', 'data-key': item.key, 'aria-label': nameOf(item) },
        h('div', { class: 'int-head' },
          h('span', { class: 'int-icon', 'aria-hidden': 'true' }, iconOf(item, 22)),
          h('div', { class: 'int-titles' }, h('span', { class: 'int-name' }, nameOf(item)), h('span', { class: 'int-vendor' }, vendorOf(item))),
          refs.statusHost),
        desc ? h('p', { class: 'int-desc', title: desc }, desc) : null,
        meta,
        refs.statsHost,
        refs.testHost,
        h('div', { class: 'int-foot' }, actions));
      const entry = { el, refs, item, status: undefined };
      cardRefs.set(item.key, entry);
      paintCard(entry, { full: true });
      return el;
    }

    function renderGrid({ animate = false } = {}) {
      if (!gridEl) return;
      cardRefs.clear();
      gridEl.classList.toggle('is-list', viewMode === 'list');
      const list = items().filter((it) => matches(it, statusOf(it)));
      if (countEl) countEl.textContent = tn('integrations.shown', list.length);
      if (!list.length) {
        gridEl.replaceChildren(emptyState({ icon: svgIcon('filter', 28), title: t('integrations.empty.title'), text: t('integrations.empty.text'), action: fb ? { label: t('ui.filter.reset'), icon: 'refresh', onClick: () => fb.reset() } : null }));
        return;
      }
      const frag = document.createDocumentFragment();
      list.forEach((it) => frag.appendChild(buildCard(it)));
      gridEl.replaceChildren(frag);
      if (animate && motion && typeof motion.enter === 'function') motion.enter(Array.from(gridEl.children), { y: 8, stagger: 0.028 });
    }

    function refreshCards(keys = null) {
      const byKey = new Map(items().map((it) => [it.key, it]));
      for (const [key, entry] of cardRefs) {
        if (keys && !keys.includes(key)) continue;
        const it = byKey.get(key);
        if (!it) continue;
        entry.item = it;
        const changed = paintCard(entry);
        if (changed && motion && typeof motion.flash === 'function') motion.flash(entry.el);
      }
    }
    function refreshSummary() {
      if (!summaryEl || !summaryEl.isConnected) return;
      const next = buildSummary();
      summaryEl.replaceWith(next);
      summaryEl = next;
    }

    /* ───────────────────────── config / real test ───────────────────────── */

    function fieldKey(fields, test) { const f = fields.find((x) => x && test(x)); return f ? f.key : null; }

    function openConfig(item, returnFocus, { autoTest = false } = {}) {
      const fresh = items().find((it) => it.key === item.key) || item;
      const rec = fresh.rec;
      if (openModal) { try { openModal.close(); } catch { /* ignore */ } openModal = null; }
      const fields = arr(rec.configFields).filter((f) => f && f.key);
      const localized = arr(i18n.L(rec, 'configFields', fresh.ns));
      const config = isObj(rec.config) ? rec.config : {};
      const form = h('form', { class: 'form-grid', novalidate: true, onSubmit: (e) => e.preventDefault() });
      fields.forEach((f, i) => {
        const lf = isObj(localized[i]) ? localized[i] : {};
        const type = FIELD_TYPES.has(f.type) ? f.type : 'text';
        form.appendChild(formField({ label: lf.label || f.label || f.key, name: f.key, type, value: config[f.key] ?? '', placeholder: lf.placeholder ?? f.placeholder ?? '', hint: lf.hint || f.hint || '', options: f.options || [] }));
      });
      const testType = testTypeOf(fresh);
      const result = h('div', { class: 'stack', 'aria-live': 'polite' });
      const st = statusOf(fresh);
      const setResult = (tone, text, extra = null) => result.replaceChildren(h('div', { class: 'note', role: tone === 'critical' ? 'alert' : 'status', style: { '--tone': `var(--${tone === 'neutral' ? 'line-2' : tone})` } },
        h('span', { class: 'row gap-2', style: { alignItems: 'flex-start' } }, glyph(tone, 14), h('span', {}, text)),
        extra ? h('div', { class: 'text-xs muted', style: { marginBlockStart: '4px' } }, extra) : null));
      const body = h('div', { class: 'stack gap-4 intg-modal' },
        h('div', { class: 'row gap-3', style: { alignItems: 'flex-start' } },
          h('span', { class: 'int-icon', 'aria-hidden': 'true' }, iconOf(fresh, 22)),
          h('dl', { class: 'intg-kv' },
            h('div', {}, h('dt', {}, t('integrations.modal.vendor')), h('dd', {}, vendorOf(fresh))),
            h('div', {}, h('dt', {}, t('integrations.modal.category')), h('dd', {}, categoryOf(fresh))),
            h('div', {}, h('dt', {}, t('integrations.modal.status')), h('dd', {}, statusBadge(st, { size: 'sm' }))))),
        testType ? null : h('div', { class: 'note', style: { '--tone': 'var(--line-2)' } }, h('span', { class: 'row gap-2', style: { alignItems: 'flex-start' } }, svgIcon('lock', 14), h('span', {}, t('integrations.modal.backend')))),
        fields.length ? form : h('p', { class: 'text-sm muted', style: { margin: 0 } }, t('integrations.modal.noFields')),
        h('p', { class: 'text-xs muted', style: { margin: 0 } }, t('integrations.modal.storage')),
        testType ? h('p', { class: 'text-xs muted', style: { margin: 0 } }, t('integrations.modal.realTest')) : null,
        result);

      const update = (patch) => (fresh.kind === 'integration'
        ? (typeof store.updateIntegration === 'function' ? store.updateIntegration(rec.id, patch) : null)
        : (typeof store.updateConnector === 'function' ? store.updateConnector(rec.id, patch) : null));

      async function runTest(btn) {
        const values = readForm(form);
        const urlKey = fieldKey(fields, (x) => x.type === 'url') || fieldKey(fields, (x) => /url|endpoint|host/i.test(String(x.key)));
        const keyKey = fieldKey(fields, (x) => x.type === 'password') || fieldKey(fields, (x) => /key|token|secret/i.test(String(x.key)));
        const tableKey = fieldKey(fields, (x) => /table|sheet|collection/i.test(String(x.key)));
        const url = urlKey ? String(values[urlKey] || '').trim() : '';
        const urlOk = typeof sources.validateUrl === 'function' ? Boolean(safe(() => sources.validateUrl(url), null)) : isHttpsUrl(url);
        if (!urlOk) { setResult('warning', t('integrations.modal.urlMissing')); return false; }
        if (typeof sources.testConnection !== 'function') { setResult('warning', t('import.unavailable')); return false; }
        if (btn && btn.getAttribute('aria-busy') === 'true') return false;
        if (btn) { btn.setAttribute('aria-busy', 'true'); btn.setAttribute('aria-disabled', 'true'); }
        setResult('accent', t('integrations.modal.testing'));
        let r;
        try { r = await sources.testConnection({ type: testType, url, apiKey: keyKey ? String(values[keyKey] || '') : '', table: tableKey ? String(values[tableKey] || '') : '' }); } catch (err) { r = { ok: false, real: true, message: String(err && err.message || err), messageEn: String(err && err.message || err) }; }
        if (btn) { btn.removeAttribute('aria-busy'); btn.removeAttribute('aria-disabled'); }
        const ok = Boolean(r && r.ok);
        const latency = r && Number.isFinite(Number(r.latencyMs)) && Number(r.latencyMs) > 0 ? t('integrations.modal.latency', { ms: msText(Number(r.latencyMs)) }) : null;
        setResult(ok ? 'good' : (r && r.opaque ? 'warning' : 'critical'), msgOf(r) || t('integrations.card.testFail'), latency);
        if (r && r.real && !r.skipped) {
          update({ lastTest: { ok, opaque: Boolean(r.opaque), at: now().toISOString(), latencyMs: Number(r.latencyMs) || null, reason: r.reason || null, message: r.message || '', messageEn: r.messageEn || '' } });
        }
        return false;
      }
      function save() {
        const values = readForm(form);
        const clean = {};
        Object.keys(values).forEach((k) => { clean[k] = values[k] === null || values[k] === undefined ? '' : String(values[k]); });
        update({ config: clean });
        toast(t('integrations.modal.saved', { name: nameOf(fresh) }), { tone: 'good' });
      }
      const testBtn = testType ? button(t('integrations.modal.test'), { variant: 'outline', icon: svgIcon('plug', 16), onClick: () => { runTest(testBtn); } }) : null;
      openModal = modal({
        title: t('integrations.modal.title', { name: nameOf(fresh) }),
        subtitle: rec.api ? String(rec.api) : (testType ? TYPE_LABEL[testType] : ''),
        size: 'md',
        body,
        returnFocus: returnFocus || null,
        actions: [
          testBtn,
          { label: t('integrations.modal.close'), variant: 'ghost' },
          fields.length ? { label: t('integrations.modal.save'), variant: 'primary', onClick: () => { save(); } } : null,
        ].filter(Boolean),
        onClose: () => { openModal = null; },
      });
      openModal.open();
      if (autoTest && testBtn) requestAnimationFrame(() => runTest(testBtn));
    }

    /* ───────────────────────── build ───────────────────────── */

    function buildFilters() {
      const list = items();
      const counts = Object.fromEntries(STATUS_KEYS.map((s) => [s, 0]));
      list.forEach((it) => { counts[statusOf(it)] += 1; });
      fb = filterBar({
        label: t('integrations.filter.label'),
        value: { group: filterState.group, status: filterState.status, q: filterState.q },
        filters: [
          { id: 'group', type: 'segmented', label: t('integrations.filter.group'), options: [
            { value: 'all', label: t('integrations.groups.all') },
            { value: 'site', label: t('integrations.groups.site') },
            { value: 'enterprise', label: t('integrations.groups.enterprise') },
          ] },
          { id: 'status', type: 'select', label: t('integrations.filter.status'), allValue: 'all', options: STATUS_KEYS.map((s) => ({ value: s, label: `${safe(() => status.label(s), s)} (${fmt.num(counts[s])})` })) },
          { id: 'q', type: 'search', label: t('integrations.filter.search'), placeholder: t('integrations.filter.searchPlaceholder') },
        ],
        onChange: (v) => { filterState = { group: v.group || 'all', status: v.status || 'all', q: v.q || '' }; renderGrid(); },
      });
      return fb.el;
    }

    function build() {
      cardRefs.clear();
      bannerEl = buildBanner();
      dsCard = buildDataSource();
      summaryEl = buildSummary();
      countEl = h('span', { class: 'intg-count', 'aria-live': 'polite' });
      const modeSeg = segmented({
        options: [{ value: 'cards', label: t('integrations.view.cards'), icon: svgIcon('grid', 14) }, { value: 'list', label: t('integrations.view.list'), icon: glyph('table', 14) }],
        value: viewMode,
        ariaLabel: t('integrations.view.aria'),
        onChange: (v) => { viewMode = v === 'list' ? 'list' : 'cards'; if (gridEl) gridEl.classList.toggle('is-list', viewMode === 'list'); },
      });
      modeSeg.el.classList.add('seg-sm');
      gridEl = h('div', { class: 'intg-grid', role: 'list', 'aria-label': t('integrations.gridAria') });
      const head = buildHead();
      const filters = buildFilters();
      root.replaceChildren(
        head,
        bannerEl,
        dsCard,
        summaryEl,
        h('section', { class: 'view-section', 'aria-label': t('integrations.gridAria') },
          filters,
          h('div', { class: 'intg-toolbar' }, countEl, modeSeg.el),
          gridEl));
      renderGrid({ animate: firstPaint });
      if (firstPaint && motion && typeof motion.enter === 'function') motion.enter([bannerEl, dsCard, summaryEl, filters], { y: 6, stagger: 0.03 });
      firstPaint = false;
      revealSection();
    }

    /** ?section=datasource → scroll to the data-source summary once (the param is then dropped). */
    function revealSection() {
      if (params.section !== 'datasource' || !dsCard || !/[?&]section=/.test(location.hash || '')) return;
      requestAnimationFrame(() => {
        const smooth = motion && typeof motion.enabled === 'function' && motion.enabled();
        try { dsCard.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto', block: 'start' }); } catch { dsCard.scrollIntoView(); }
        try { dsCard.focus({ preventScroll: true }); } catch { /* ignore */ }
        if (motion && typeof motion.flash === 'function') motion.flash(dsCard);
        try { history.replaceState(history.state, '', router && typeof router.href === 'function' ? router.href('integrations') : '#/integrations'); } catch { /* ignore */ }
      });
    }

    function refreshTop() {
      if (bannerEl && bannerEl.isConnected) { const b = buildBanner(); bannerEl.replaceWith(b); bannerEl = b; }
      if (dsCard && dsCard.isConnected) { const d = buildDataSource(); dsCard.replaceWith(d); dsCard = d; }
      const headBadge = root.querySelector('.view-head .view-actions');
      if (headBadge) headBadge.replaceChildren(statusBadge(safe(() => status.mode(store.state), 'demo') === 'demo' ? 'demo' : safe(() => status.source(store.state).status, 'not_connected')));
    }

    let raf = 0;
    const schedule = () => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; build(); }); };

    const unsubs = [
      bus.on('integrations:tick', (payload) => {
        const list = payload && Array.isArray(payload.integrations) ? payload.integrations : integrations();
        list.forEach((g) => { if (g && g.id) pushHistory(g); });
        refreshCards(list.map((g) => `i:${g.id}`));
      }),
      bus.on('store:change', (payload) => {
        const path = payload && payload.path ? String(payload.path) : '*';
        if (path === '*') { schedule(); return; }
        if (path.startsWith('integrations')) { const id = path.split('.')[1]; refreshCards(id ? [`i:${id}`] : null); refreshSummary(); return; }
        if (path.startsWith('platform.connectors')) { const id = path.split('.')[2]; refreshCards(id ? [`c:${id}`] : null); refreshSummary(); }
      }),
      bus.on('settings:change', () => { refreshTop(); refreshCards(); refreshSummary(); }),
    ];
    const relTimer = setInterval(() => { if (!document.hidden) refreshCards(); }, RELATIVE_REFRESH_MS);
    const onNet = () => { refreshTop(); refreshCards(); refreshSummary(); };
    window.addEventListener('online', onNet);
    window.addEventListener('offline', onNet);

    build();

    return () => {
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      clearInterval(relTimer);
      window.removeEventListener('online', onNet);
      window.removeEventListener('offline', onNet);
      unsubs.forEach((u) => { try { if (typeof u === 'function') u(); } catch { /* ignore */ } });
      if (openModal) { try { openModal.close(); } catch { /* ignore */ } openModal = null; }
      cardRefs.clear();
      root.remove();
    };
  },
};
