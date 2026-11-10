/**
 * BILTIX Risk AI — HSE pillar · SEC-01 Safety overview (js/views/overview.js). Owner: B-HSE1.
 *
 * Reading order (one hierarchy):
 *   A. Head — page title, lead, honest data status (status.js), scope, "add safety risk".
 *   B. Four executive metrics — overdue risks (sel.overdueRisks: THE overdue definition shared with
 *      the reports), open critical risks, open incidents, near misses (30 days).
 *   C. Safety index (gauge + lagging indicators + open risks by tier) | risk radar (simulated sweep).
 *   D. Leading indicators — active permits, corrective-action closure, training compliance, inspections due.
 *   E. Analysis — 5×5 matrix (cell → matching register records) | incident trend | permits by status.
 *   F. Priority actions (ranked) | site performance table (row → site filter).
 *
 * Language: every string comes from the 'overview' (and shared 'risks') dictionaries; data text through
 * i18n.L / label / term; numbers and dates through fmt. Live updates patch in place (metric values
 * flash when they change, the sites table keeps its sort/page and flashes changed rows); motion.enter
 * runs on the first render only. Data reaches the DOM through textContent / h() only.
 */

import { i18n } from '../core/i18n.js';
import * as seedMod from '../data/seed.js';
import * as selectorsMod from '../core/selectors.js';
import dict from '../i18n/overview.js';
import risksDict from '../i18n/risks.js';

i18n.register('risks', risksDict);
i18n.register('overview', dict);

const DAY_MS = 86_400_000;
const SVG_NS = 'http://www.w3.org/2000/svg';
const CLOSED = 'مغلق';
/** Stored tier values (Arabic enum values — display goes through i18n.label('tier', …)). */
const TIERS = [
  { tier: 'حرج', tone: 'critical' },
  { tier: 'عالٍ', tone: 'serious' },
  { tier: 'متوسط', tone: 'warning' },
  { tier: 'منخفض', tone: 'good' },
];
const TONE_RANK = { critical: 0, serious: 1, warning: 2, good: 3, accent: 4, neutral: 5 };
const KIND_ICON = { risk: 'shield-alert', incident: 'incident', permit: 'permit', inspection: 'inspection', cert: 'training' };
const FALLBACK_CATEGORY_IDS = ['height', 'excavation', 'lifting', 'electrical', 'confined', 'hotwork', 'heat', 'chemical', 'traffic', 'scaffold', 'structural', 'ergonomic'];
const DEFAULT_WEIGHTS = { base: 100, criticalOpen: 2.5, highOpen: 1, overdueOpen: 0.5, lti90: 4, mtc90: 1.5, nearMiss30: 0.5, trainingPct: 0.1 };

const arr = (v) => (Array.isArray(v) ? v : []);
const categories = () => (Array.isArray(seedMod.CATEGORIES) && seedMod.CATEGORIES.length
  ? seedMod.CATEGORIES
  : FALLBACK_CATEGORY_IDS.map((id) => ({ id, icon: 'hazard' })));
const scoreTone = (score) => (score >= 85 ? 'good' : score >= 70 ? 'warning' : score >= 55 ? 'serious' : 'critical');

function parseMs(value) {
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'number') return value;
  if (typeof value !== 'string' || !value) return NaN;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  const d = m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date(value);
  return d.getTime();
}

function arrowSvg(direction) {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', '12');
  svg.setAttribute('height', '12');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2.4');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  const p = document.createElementNS(SVG_NS, 'path');
  p.setAttribute('d', direction === 'up' ? 'M12 19V5M5 12l7-7 7 7' : direction === 'down' ? 'M12 5v14M5 12l7 7 7-7' : 'M5 12h14');
  svg.appendChild(p);
  return svg;
}

export default {
  id: 'overview',
  code: 'SEC-01',
  get title() { return i18n.has('core.nav.overview.page') ? i18n.t('core.nav.overview.page') : i18n.t('overview.title'); },
  icon: 'grid',

  render(container, ctx) {
    const { store, bus, sel, fmt, charts, router, live, art } = ctx;
    const C = ctx.components || {};
    const { h } = C;
    const R = ctx.radar || {};
    const I = ctx.i18n || i18n;
    const t = (key, params) => I.t(key, params);
    const tn = (key, count, params) => I.tn(key, count, params);
    const L = (record, field, ns) => (record ? I.L(record, field, ns) : '');
    const label = (ns, value) => I.label(ns, value);
    const term = (s) => (typeof I.term === 'function' ? I.term(s) : s);
    const statusApi = ctx.status || null;
    const motion = ctx.motion || C.motion || null;

    /* ───────────── helpers ───────────── */
    const warned = new Set();
    const warn = (where, err) => {
      const key = `${where}:${err && err.message}`;
      if (warned.has(key)) return;
      warned.add(key);
      console.warn(`[overview] ${where}:`, err);
    };
    const safe = (fn, fallback, where = 'selector') => {
      try { const v = fn(); return v === undefined || v === null ? fallback : v; } catch (err) { warn(where, err); return fallback; }
    };
    const ico = (name, size = 16) => {
      let node = null;
      try { node = typeof C.svgIcon === 'function' ? C.svgIcon(name, size) : (art && art.icon ? art.icon(name, size) : null); } catch { node = null; }
      if (!(node instanceof Node)) node = C.glyph('neutral', size);
      node.setAttribute('aria-hidden', 'true');
      node.setAttribute('focusable', 'false');
      return node;
    };
    const tryEl = (fn, where) => {
      try { const r = fn(); const el = r instanceof Node ? r : r && r.el; return el instanceof Node ? el : null; } catch (err) { warn(`chart:${where}`, err); return null; }
    };
    /** A section that failed to build shows an error state with a retry instead of breaking the view. */
    const guard = (host, where, build) => {
      try { build(); } catch (err) {
        warn(where, err);
        host.replaceChildren(C.errorState({ title: t('overview.errors.sectionTitle'), text: t('overview.errors.sectionText'), retry: () => schedule() }));
      }
    };
    const state = () => store.state || {};
    const filters = () => ({ siteId: 'all', range: 30, search: '', ...(store.filters || (store.state && store.state.filters) || {}) });
    const siteById = (id) => arr(state().sites).find((s) => s && s.id === id) || null;
    const siteName = (id) => { const s = siteById(id); return s ? L(s, 'name', 'sites') : ''; };
    const now = () => (typeof store.now === 'function' ? store.now() : new Date());
    const tierLabel = (tier) => label('tier', tier);
    const tierBadge = (tier) => C.badge(tierLabel(tier), safe(() => sel.tierTone(tier), 'neutral', 'tierTone'));
    const categoryLabel = (id) => label('hseCategory', id) || '—';
    const periodText = (f) => tn('overview.period.days', Number(f.range) || 30);
    const scopeText = (f) => (f.siteId === 'all' ? t('overview.scope.all') : (siteName(f.siteId) || t('overview.scope.one')));
    const riyadh = (iso, opts) => {
      const d = fmt.toDate ? fmt.toDate(iso) : new Date(iso);
      if (!d || Number.isNaN(d.getTime())) return '—';
      try { return new Intl.DateTimeFormat(fmt.locale(), { timeZone: 'Asia/Riyadh', ...opts }).format(d); } catch { return fmt.time(d); }
    };
    const riyadhTime = (iso) => riyadh(iso, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
    const sourceStatus = () => {
      try {
        if (statusApi && typeof statusApi.source === 'function') return statusApi.source(state()).status || 'demo';
        if (statusApi && typeof statusApi.mode === 'function') return statusApi.mode(state());
      } catch (err) { warn('status', err); }
      return 'demo';
    };
    const statusLabel = (s) => { try { return statusApi ? statusApi.label(s) : t(`status.${s}`); } catch { return s; } };
    const statusDesc = (s) => { try { return statusApi ? statusApi.desc(s) : ''; } catch { return ''; } };
    const statusBadge = (s, opts = {}) => (typeof C.statusBadge === 'function' ? C.statusBadge(s, opts) : C.badge(statusLabel(s), 'accent'));

    /** Plain table twin (headers + rows; `numeric` marks end-aligned columns). */
    function simpleTable(caption, headers, rows, numeric = []) {
      const table = h('table', { class: 'chart-table' });
      table.appendChild(h('caption', {}, caption));
      table.appendChild(h('thead', {}, h('tr', {}, headers.map((text, i) => h('th', { scope: 'col', class: numeric[i] ? 'num' : null }, text)))));
      table.appendChild(h('tbody', {}, rows.length
        ? rows.map((r) => h('tr', {}, r.map((cell, i) => h('td', { class: numeric[i] ? 'num' : null }, cell))))
        : h('tr', {}, h('td', { colspan: String(headers.length), class: 'muted' }, t('overview.common.noData')))));
      return table;
    }
    /** Tone legend: icon + swatch + word (status is never colour-alone). */
    function toneLegend(items, cls) {
      return h('ul', { class: cls, role: 'list', 'aria-label': t('overview.common.legend') }, items.map((it) => h('li', { class: [`${cls}-item`, `tone-${it.tone}`] },
        C.glyph(it.tone, 12),
        h('span', { class: 'legend-key', style: { background: 'var(--tone)' } }),
        h('span', {}, it.count === undefined ? it.label : t('overview.common.legendCount', { label: it.label, count: fmt.num(it.count) })))));
    }

    /* ───────────── lifecycle registers ───────────── */
    const subs = [];
    const timers = [];
    let raf = 0;
    let destroyed = false;
    let sweep = null;
    let overlay = null;
    let lastChangeAt = Date.now();
    let sitesTable = null;
    let gaugeApi = null;
    let firstPaint = true;

    /* ═════════════ A. head ═════════════ */
    const root = h('section', { class: 'view view-overview' });
    const statusHost = h('span', { class: 'row gap-2' });
    const scopeBadge = C.badge('', 'neutral', { icon: ico('building', 14) });
    const head = h('div', { class: 'view-head' },
      h('div', { class: 'view-head-text' },
        h('span', { class: 'code-tag', translate: 'no' }, 'SEC-01'),
        h('h1', { tabindex: '-1' }, i18n.has('core.nav.overview.page') ? t('core.nav.overview.page') : t('overview.title')),
        h('p', { class: 'view-lead' }, t('overview.lead'))),
      h('div', { class: 'view-actions' },
        statusHost,
        scopeBadge,
        C.button(t('overview.actions.addRisk'), { variant: 'outline', size: 'sm', icon: ico('plus', 14), onClick: () => router.navigate('risks', { new: 1 }) })));
    root.appendChild(head);

    /* ═════════════ B. executive metrics ═════════════ */
    const metricGrid = h('div', { class: 'metric-grid', role: 'group', 'aria-label': t('overview.metrics.aria') });
    root.appendChild(metricGrid);

    /** Executive metric tile (.metric-tile markup from css/components.css); patched in place. */
    function metricTile({ id, icon, onClick }) {
      const labelEl = h('span', { class: 'metric-label' });
      const valueEl = h('span', { class: 't-metric' });
      const unitEl = h('span', { class: 'metric-unit' });
      const sparkEl = h('span', { class: 'metric-spark', 'aria-hidden': 'true' });
      const footEl = h('div', { class: 'metric-foot' });
      const el = h(onClick ? 'button' : 'div', { class: 'metric-tile', type: onClick ? 'button' : undefined, 'data-metric': id, onClick: onClick || undefined },
        h('div', { class: 'metric-head' }, labelEl, h('span', { class: 'metric-icon', 'aria-hidden': 'true' }, ico(icon, 16))),
        h('div', { class: 'metric-value' }, valueEl, unitEl),
        sparkEl,
        footEl);
      let last = null;
      return {
        el,
        set({ title, value, valueText, unit = '', tone = null, delta = null, goodWhen = 'down', helper = '', spark = null, aria = '' }) {
          labelEl.textContent = title;
          const text = valueText ?? (Number.isFinite(value) ? fmt.num(value) : '—');
          if (valueEl.textContent !== text) valueEl.textContent = text;
          unitEl.textContent = unit;
          unitEl.hidden = !unit;
          ['critical', 'serious', 'warning', 'good', 'accent', 'neutral', 'brand'].forEach((tn0) => el.classList.toggle(`tone-${tn0}`, tn0 === tone));
          sparkEl.replaceChildren(...(spark ? [spark] : []));
          sparkEl.hidden = !spark;
          const foot = [];
          if (Number.isFinite(delta)) {
            const d = safe(() => sel.describeDelta(delta, goodWhen), { direction: delta > 0 ? 'up' : delta < 0 ? 'down' : 'flat', good: true, neutral: delta === 0 }, 'describeDelta');
            const digits = Number.isInteger(delta) ? 0 : 2;
            const signed = String(fmt.signed(delta, digits)).replace(/[‎‏؜‪-‮⁦-⁩]/g, '');
            const cls = d.direction === 'flat' ? 'is-flat' : (d.neutral ? 'is-flat' : (d.good ? 'is-good' : 'is-bad'));
            foot.push(h('span', { class: ['delta', cls], 'data-direction': d.direction },
              arrowSvg(d.direction),
              h('span', { class: 'sr-only' }, t('ui.delta.sr')),
              h('bdi', { dir: 'ltr' }, signed),
              h('span', { class: 'sr-only' }, d.direction === 'flat' ? t('ui.delta.flat') : (d.good ? t('ui.delta.better') : t('ui.delta.worse')))));
          }
          if (helper) foot.push(h('span', { class: 'metric-helper' }, helper));
          footEl.replaceChildren(...foot);
          el.setAttribute('aria-label', aria || `${title}: ${text}${unit ? ` ${unit}` : ''}`);
          if (onClick) el.setAttribute('title', aria || title);
          if (last !== null && last !== text && motion && typeof motion.flash === 'function') motion.flash(el);
          last = text;
        },
      };
    }

    const metrics = {
      overdue: metricTile({ id: 'overdue', icon: 'clock', onClick: () => router.navigate('risks', { due: 'overdue' }) }),
      critical: metricTile({ id: 'critical', icon: 'shield-alert', onClick: () => router.navigate('risks', { tier: 'حرج' }) }),
      incidents: metricTile({ id: 'incidents', icon: 'incident', onClick: () => router.navigate('incidents', { status: 'open' }) }),
      nearMiss: metricTile({ id: 'nearMiss', icon: 'nearmiss', onClick: () => router.navigate('incidents', { type: 'nearmiss' }) }),
    };
    metricGrid.append(metrics.overdue.el, metrics.critical.el, metrics.incidents.el, metrics.nearMiss.el);

    /* ═════════════ C. safety index | radar ═════════════ */
    const gaugeHost = h('div', { style: { display: 'grid', placeItems: 'center' } });
    const deltaHost = h('div', { class: 'row wrap gap-2', style: { justifyContent: 'center' } });
    const factsHost = h('div', { class: 'hero-facts', style: { gridTemplateColumns: 'minmax(0, 1fr)' } });
    const tierHost = h('div', { class: 'stack gap-2' });
    const heroBody = h('div', { class: 'stack', style: { gap: '14px', blockSize: '100%' } }, gaugeHost, deltaHost, factsHost, h('div', { class: 'grow' }), tierHost);
    const infoBtn = C.button('', {
      variant: 'ghost', size: 'sm', icon: ico('info', 16), onClick: () => openFormulaModal(),
      attrs: { 'aria-label': t('overview.hero.formulaAria'), title: t('overview.hero.formulaAria') },
    });
    const heroCard = C.card({
      code: 'KPI-00', title: t('overview.hero.title'), subtitle: t('overview.hero.subtitle'),
      hero: true, actions: [infoBtn], body: heroBody,
    });
    heroCard.classList.add('is-fill');
    const heroBodyEl = heroCard.querySelector('.card-body');
    const heroView = heroCard.querySelector('.card-view-chart');
    if (heroBodyEl) Object.assign(heroBodyEl.style, { display: 'flex', flexDirection: 'column' });
    if (heroView) Object.assign(heroView.style, { flex: '1', display: 'flex', flexDirection: 'column' });

    const canvas = h('canvas', { class: 'radar-canvas', role: 'img', 'aria-label': t('overview.radar.title') });
    const radarStatus = h('span', { class: 'radar-status' });
    const frame = h('div', { class: 'radar-frame is-wide' }, canvas, radarStatus);
    const tip = h('div', { class: 'tooltip radar-tip', hidden: true, role: 'tooltip', style: { position: 'absolute', insetBlockStart: '0', insetInlineStart: '0', pointerEvents: 'none', zIndex: '2' } });
    const radarWrap = h('div', { style: { position: 'relative', maxInlineSize: '560px', marginInline: 'auto', inlineSize: '100%' } }, frame, tip);
    const radarLegendHost = h('div');
    const blipCount = h('span', { class: 't-helper' });
    const updatedText = h('span', {});
    const radarCard = C.card({
      code: 'RDR-01', title: t('overview.radar.title'), subtitle: t('overview.radar.subtitle', { n: fmt.num(12) }),
      body: h('div', { class: 'stack gap-3' }, radarWrap, h('div', { class: 'row between wrap gap-2' }, radarLegendHost, blipCount)),
      tableView: blipTable,
      footer: [
        h('span', { class: 'tele-updated' }, ico('clock', 13), updatedText),
        C.button(t('overview.radar.openFull'), { variant: 'outline', size: 'sm', icon: ico('external', 14), onClick: () => router.navigate('radar') }),
      ],
    });
    const row1 = h('div', { class: 'grid-12' }, heroCard, radarCard);
    root.appendChild(row1);

    /* ═════════════ D. leading indicators ═════════════ */
    const leadingRow = h('div', { class: 'kpi-row', role: 'list', 'aria-labelledby': 'ov-leading-title' });
    root.appendChild(h('section', { class: 'view-section', 'aria-labelledby': 'ov-leading-title' },
      h('div', { class: 'view-section-head' },
        h('div', { class: 'stack gap-1' },
          h('h2', { class: 't-section', id: 'ov-leading-title' }, t('overview.leading.title')),
          h('p', { class: 't-helper' }, t('overview.leading.subtitle')))),
      leadingRow));

    /* ═════════════ E. analysis ═════════════ */
    const matrixHost = h('div');
    const matrixLegendHost = h('div');
    const trendHost = h('div');
    const permitsHost = h('div');
    const permitsListHost = h('div');
    const matrixCard = C.card({
      code: 'RSK-5X5', title: t('overview.matrix.title'), subtitle: t('overview.matrix.subtitle'),
      body: h('div', { class: 'stack gap-3' }, matrixHost, matrixLegendHost), tableView: matrixTable,
    });
    const trendCard = C.card({
      code: 'INC-TRD', title: t('overview.trend.title'), subtitle: t('overview.trend.subtitle', { n: fmt.num(12) }),
      body: trendHost, tableView: trendTable,
    });
    const permitsCard = C.card({
      code: 'PTW-STS', title: t('overview.permits.title'), subtitle: t('overview.permits.subtitle'),
      body: h('div', { class: 'stack gap-3' }, permitsHost, permitsListHost), tableView: permitsTable,
    });
    const row3 = h('div', { class: 'grid-12' }, matrixCard, trendCard, permitsCard);
    root.appendChild(row3);

    /* ═════════════ F. priority actions | sites ═════════════ */
    const actionsHost = h('div');
    const actionsCount = h('span', { class: 't-helper' });
    const sitesHost = h('div');
    const actionsCard = C.card({
      code: 'ACT-NOW', title: t('overview.actions.title'), subtitle: t('overview.actions.subtitle'),
      body: actionsHost,
      footer: [actionsCount, C.button(t('overview.actions.openRegister'), { variant: 'ghost', size: 'sm', icon: ico('shield-alert', 14), onClick: () => router.navigate('risks') })],
    });
    const sitesCard = C.card({
      code: 'SITES', title: t('overview.sites.title'), subtitle: t('overview.sites.subtitle', { n: fmt.num(12) }),
      body: sitesHost,
    });
    const row4 = h('div', { class: 'grid-12' }, actionsCard, sitesCard);
    root.appendChild(row4);

    container.appendChild(root);

    /* ───────────── width-aware layout (inline grid-column wins over the viewport media rules) ───────────── */
    const span = (el, n) => { el.style.gridColumn = `span ${n}`; };
    let layoutMode = '';
    const applyLayout = (w) => {
      const mode = w >= 1100 ? 'wide' : w >= 720 ? 'mid' : 'narrow';
      if (mode === layoutMode) return;
      const changed = layoutMode !== '';
      layoutMode = mode;
      root.dataset.layout = mode;
      if (changed) schedule();
      if (mode === 'wide') {
        span(heroCard, 4); span(radarCard, 8);
        span(matrixCard, 4); span(trendCard, 4); span(permitsCard, 4);
        row3.append(matrixCard, trendCard, permitsCard);
        span(actionsCard, 12); span(sitesCard, 12);
      } else if (mode === 'mid') {
        span(heroCard, 5); span(radarCard, 7);
        span(matrixCard, 6); span(permitsCard, 6); span(trendCard, 12);
        row3.append(matrixCard, permitsCard, trendCard);
        span(actionsCard, 12); span(sitesCard, 12);
      } else {
        [heroCard, radarCard, matrixCard, trendCard, permitsCard, actionsCard, sitesCard].forEach((el) => span(el, 12));
        row3.append(matrixCard, trendCard, permitsCard);
      }
    };
    let layoutObserver = null;
    let lastLayoutWidth = -1;
    let layoutRaf = 0;
    if (typeof ResizeObserver === 'function') {
      // Width-only, deferred a frame: mutating layout inside the callback would re-enter the observer.
      layoutObserver = new ResizeObserver((entries) => {
        for (const e of entries) {
          const width = Math.round(e.contentRect.width);
          if (width === lastLayoutWidth || width === 0) continue;
          lastLayoutWidth = width;
          if (layoutRaf) cancelAnimationFrame(layoutRaf);
          layoutRaf = requestAnimationFrame(() => { layoutRaf = 0; if (!destroyed) applyLayout(width); });
        }
      });
      layoutObserver.observe(root);
    }
    applyLayout(root.getBoundingClientRect().width || 1200);

    /* ───────────── data helpers ───────────── */
    function openRisks(st, f) {
      return arr(st.risks).filter((r) => r && r.status !== CLOSED && (f.siteId === 'all' || r.siteId === f.siteId));
    }
    function tierCounts(st, f) {
      const counts = { critical: 0, serious: 0, warning: 0, good: 0 };
      openRisks(st, f).forEach((r) => {
        const tone = safe(() => sel.tierTone(sel.riskTier(sel.riskScore(r))), 'good', 'riskTier');
        if (tone in counts) counts[tone] += 1;
      });
      return counts;
    }
    const findRisk = (id) => arr(state().risks).find((r) => r && r.id === id) || null;
    function currentBlips() {
      const f = filters();
      let blips = null;
      if (live && typeof live.getBlips === 'function') blips = safe(() => live.getBlips(), null, 'live.getBlips');
      if (!Array.isArray(blips)) blips = safe(() => sel.radarBlips(state(), f), [], 'radarBlips');
      if (f.siteId && f.siteId !== 'all') blips = blips.filter((b) => b && (!b.siteId || b.siteId === f.siteId));
      return blips.filter(Boolean);
    }
    /** Blip text in the active language (register risks through their mirror; simulated detections carry labelEn). */
    function blipLabel(b) {
      if (!b) return '';
      if (b.transient) return I.lang() === 'en' ? (b.labelEn || b.code || '') : (b.label || '');
      const r = findRisk(b.id);
      return r ? (L(r, 'hazard', 'risks') || r.code) : (b.label || b.code || '');
    }
    function kpiHistory(st, f, current) {
      const base = now().getTime();
      const points = [];
      for (let i = 7; i >= 1; i -= 1) points.push(safe(() => sel.kpis(st, f, new Date(base - i * 7 * DAY_MS)), null, 'kpis.history'));
      points.push(current);
      return points;
    }
    const sparkOf = (hist, key) => tryEl(() => { const values = hist.map((p) => (p && Number.isFinite(p[key]) ? p[key] : 0)); return typeof charts.radialTrend === 'function' ? charts.radialTrend({ values, tone: 'brand', size: 'sm' }) : charts.sparkline({ values, width: 84, height: 26 }); }, 'radialTrend');
    const tierOfCell = (ri, ci) => safe(() => sel.riskTier((ri + 1) * (ci + 1)), 'منخفض', 'riskTier');
    const toneOfCell = (ri, ci) => safe(() => sel.tierTone(tierOfCell(ri, ci)), 'good', 'tierTone');
    const scaleLabel = (axis, n) => t('overview.matrix.axisItem', { n: fmt.num(n), label: t(`risks.scale.${axis}.${n}`) });

    /* ───────────── table twins ───────────── */
    function blipTable() {
      return simpleTable(t('overview.radar.tableCaption'),
        [t('overview.radar.cols.code'), t('overview.radar.cols.hazard'), t('overview.radar.cols.site'), t('overview.radar.cols.category'), t('overview.radar.cols.score'), t('overview.radar.cols.tier')],
        currentBlips().map((b) => [h('span', { class: 'code mono', dir: 'ltr', translate: 'no' }, String(b.code || '')), blipLabel(b), siteName(b.siteId) || '—', categoryLabel(b.categoryId), Number.isFinite(Number(b.score)) ? fmt.num(Number(b.score)) : '—', b.tier ? tierLabel(b.tier) : '—']),
        [false, false, false, false, true, false]);
    }
    function matrixTable() {
      const m = safe(() => sel.riskMatrix(state(), filters()), [], 'riskMatrix');
      const header = [t('overview.matrix.corner'), ...[1, 2, 3, 4, 5].map((n) => scaleLabel('likelihood', n))];
      const rows = [1, 2, 3, 4, 5].map((n, ri) => [scaleLabel('severity', n), ...[0, 1, 2, 3, 4].map((ci) => fmt.num(Number(m[ri] && m[ri][ci]) || 0))]);
      return simpleTable(t('overview.matrix.tableCaption', { n: fmt.num(5) }), header, rows, [false, true, true, true, true, true]);
    }
    function trendRows() { return safe(() => sel.incidentTrend(state(), 12, filters()), [], 'incidentTrend'); }
    const weekLabel = (w) => t('overview.trend.week', { n: fmt.num(Number(w.week) || 0) });
    function trendTable() {
      return simpleTable(t('overview.trend.tableCaption'), [t('overview.trend.cols.week'), t('overview.trend.incidents'), t('overview.trend.nearMisses')],
        trendRows().map((w) => [weekLabel(w), fmt.num(Number(w.incidents) || 0), fmt.num(Number(w.nearMisses) || 0)]), [false, true, true]);
    }
    function permitsTable() {
      const parts = safe(() => sel.permitsByStatus(state(), filters()), [], 'permitsByStatus');
      return simpleTable(t('overview.permits.title'), [t('overview.permits.cols.status'), t('overview.permits.cols.count')],
        parts.map((p) => [label('permitStatus', p.label), fmt.num(Number(p.value) || 0)]), [false, true]);
    }

    /* ───────────── renderers ───────────── */
    function renderHead(f) {
      const s = sourceStatus();
      statusHost.replaceChildren(statusBadge(s, { size: 'sm' }));
      scopeBadge.querySelector('.badge-text').textContent = t('overview.scope.badge', { scope: scopeText(f), period: periodText(f) });
    }

    function renderMetrics(k, st, f, hist) {
      const overdue = safe(() => sel.overdueRisks(st, f, now()), [], 'overdueRisks');
      const worst = overdue[0];
      metrics.overdue.set({
        title: t('overview.metrics.overdue'), value: overdue.length, tone: overdue.length ? (worst && worst.tone === 'critical' ? 'critical' : 'serious') : 'good',
        delta: k && k.deltas ? k.deltas.overdueRisks : null, goodWhen: 'down', spark: sparkOf(hist, 'overdueRisks'),
        helper: tn('overview.common.vsPrevious', Number(f.range) || 30),
        aria: t('overview.metrics.overdueAria', { count: fmt.num(overdue.length) }),
      });
      const critical = k ? k.criticalRisks : 0;
      metrics.critical.set({
        title: t('overview.metrics.critical'), value: critical, tone: critical ? 'critical' : 'good',
        delta: k && k.deltas ? k.deltas.criticalRisks : null, goodWhen: 'down', spark: sparkOf(hist, 'criticalRisks'),
        helper: t('overview.metrics.criticalHelper', { min: fmt.num(16), max: fmt.num(25) }),
        aria: t('overview.metrics.criticalAria', { count: fmt.num(critical) }),
      });
      const open = k ? k.openIncidents : 0;
      metrics.incidents.set({
        title: t('overview.metrics.incidents'), value: open, tone: open ? 'serious' : 'good',
        delta: k && k.deltas ? k.deltas.openIncidents : null, goodWhen: 'down', spark: sparkOf(hist, 'openIncidents'),
        helper: tn('overview.common.vsPrevious', Number(f.range) || 30),
        aria: t('overview.metrics.incidentsAria', { count: fmt.num(open) }),
      });
      const nm = k ? k.nearMisses30d : 0;
      metrics.nearMiss.set({
        title: t('overview.metrics.nearMiss', { days: fmt.num(30) }), value: nm, tone: null,
        delta: k && k.deltas ? k.deltas.nearMisses30d : null, goodWhen: 'none', spark: sparkOf(hist, 'nearMisses30d'),
        helper: t('overview.metrics.nearMissHelper'),
        aria: t('overview.metrics.nearMissAria', { count: fmt.num(nm), days: fmt.num(30) }),
      });
    }

    function renderHero(k, st, f) {
      const si = k && Number.isFinite(k.safetyIndex) ? k.safetyIndex : 0;
      if (gaugeApi && typeof gaugeApi.update === 'function') {
        try { gaugeApi.update({ value: si, max: 100, label: t('overview.hero.gaugeLabel'), sublabel: periodText(f) }); } catch (err) { warn('gauge.update', err); gaugeApi = null; }
      }
      if (!gaugeApi) {
        try { gaugeApi = charts.gauge({ value: si, max: 100, size: 188, label: t('overview.hero.gaugeLabel'), sublabel: periodText(f) }); } catch (err) { warn('gauge', err); gaugeApi = null; }
        gaugeHost.replaceChildren(gaugeApi && gaugeApi.el ? gaugeApi.el : h('p', { class: 't-metric is-hero' }, h('bdi', { dir: 'ltr' }, `${fmt.num(si)}/${fmt.num(100)}`)));
      }
      gaugeHost.setAttribute('aria-label', t('overview.hero.gaugeAria', { value: fmt.num(si), max: fmt.num(100) }));
      const d = k && k.deltas && Number.isFinite(k.deltas.safetyIndex) ? k.deltas.safetyIndex : 0;
      const dd = safe(() => sel.describeDelta(d, 'up'), { direction: 'flat', good: true }, 'describeDelta');
      deltaHost.replaceChildren(
        C.badge(t('overview.hero.deltaPoints', { delta: String(fmt.signed(d)).replace(/[‎‏؜]/g, '') }), dd.direction === 'flat' ? 'neutral' : (dd.good ? 'good' : 'critical'),
          { icon: dd.direction === 'up' ? 'arrow-up' : dd.direction === 'down' ? 'arrow-down' : null }),
        h('span', { class: 't-helper' }, tn('overview.common.vsPrevious', Number(f.range) || 30)));

      const fact = (text, value, unit) => h('div', { class: 'fact', style: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: '12px' } },
        h('span', { class: 'fact-label' }, text),
        h('span', { class: 'fact-value nowrap' }, h('bdi', {}, value), unit ? h('small', {}, ` ${unit}`) : null));
      const days = k ? k.daysSinceLTI : 0;
      factsHost.replaceChildren(
        fact(t('overview.hero.ltiFree'), fmt.num(days), tn('overview.hero.daysUnit', days)),
        fact(t('overview.hero.ltifr'), fmt.num(k ? k.ltifr : 0, { maximumFractionDigits: 2 }), t('overview.hero.ltifrUnit')),
        fact(t('overview.hero.trir'), fmt.num(k ? k.trir : 0, { maximumFractionDigits: 2 }), t('overview.hero.trirUnit', { k: fmt.num(200), full: fmt.num(200000) })));

      const counts = tierCounts(st, f);
      const total = Object.values(counts).reduce((a, b) => a + b, 0);
      const bar = tryEl(() => charts.segmentedBar({
        parts: TIERS.map((x) => ({ id: x.tone, label: tierLabel(x.tier), value: counts[x.tone], color: `var(--${x.tone})` })),
        tall: false, valueFormat: fmt.num, ariaLabel: t('overview.hero.tiersAria'),
      }), 'segmentedBar');
      tierHost.replaceChildren(
        h('div', { class: 'row between gap-2' },
          h('span', { class: 'radar-side-title' }, t('overview.hero.tiersTitle')),
          h('span', { class: 't-helper' }, tn('overview.common.risks', total))),
        bar || toneLegend(TIERS.map((x) => ({ tone: x.tone, label: tierLabel(x.tier), count: counts[x.tone] })), 'matrix-legend'));
    }

    const LEADING = [
      { key: 'activePermits', label: () => t('overview.leading.permits'), icon: 'permit', goodWhen: 'none', hint: () => t('overview.leading.permitsHint'), route: ['permits', {}] },
      { key: 'capaClosure', label: () => t('overview.leading.capa'), icon: 'check', unit: '%', goodWhen: 'up', hint: () => t('overview.leading.capaHint'), route: ['incidents', {}] },
      { key: 'trainingCompliance', label: () => t('overview.leading.training'), icon: 'training', unit: '%', goodWhen: 'up', hint: () => t('overview.leading.trainingHint'), route: ['training', {}] },
      { key: 'inspectionsDue', label: () => t('overview.leading.inspections'), icon: 'inspection', goodWhen: 'down', hint: () => t('overview.leading.inspectionsHint', { days: fmt.num(7) }), tone: (v) => (v > 0 ? 'warning' : null), route: ['inspections', {}] },
    ];
    function renderLeading(k, hist) {
      leadingRow.replaceChildren(...LEADING.map((x) => {
        const raw = k && Number.isFinite(k[x.key]) ? k[x.key] : null;
        const d = k && k.deltas && Number.isFinite(k.deltas[x.key]) ? k.deltas[x.key] : null;
        const tile = C.statTile({
          label: x.label(), value: raw === null ? null : (x.unit ? fmt.pct(raw) : raw), unit: '',
          delta: x.goodWhen === 'none' ? null : d, deltaGoodWhen: x.goodWhen === 'up' ? 'up' : 'down',
          spark: sparkOf(hist, x.key), icon: ico(x.icon, 18), tone: x.tone ? x.tone(raw) : null, hint: x.hint(),
          onClick: () => router.navigate(x.route[0], x.route[1]),
        });
        tile.setAttribute('role', 'listitem');
        return tile;
      }));
    }

    function renderMatrix(st, f) {
      const m = safe(() => sel.riskMatrix(st, f), Array.from({ length: 5 }, () => Array(5).fill(0)), 'riskMatrix');
      const chart = tryEl(() => charts.heatmap({
        rows: [1, 2, 3, 4, 5].map((n) => scaleLabel('severity', n)),
        cols: [1, 2, 3, 4, 5].map((n) => scaleLabel('likelihood', n)),
        cells: m,
        colorFor: (value, ri, ci) => `var(--${toneOfCell(Number(ri) || 0, Number(ci) || 0)})`,
        labelFor: (value) => (value ? fmt.num(value) : ''),
        onCellClick: (info) => {
          const ri = Number(info && info.ri) || 0;
          const ci = Number(info && info.ci) || 0;
          router.navigate('risks', { l: ci + 1, s: ri + 1 });
        },
        cellSize: 'auto', ariaLabel: t('overview.matrix.aria', { n: fmt.num(5) }), rowTitle: t('overview.matrix.rowTitle'), colTitle: t('overview.matrix.colTitle'),
      }), 'heatmap');
      matrixHost.replaceChildren(chart || C.emptyState({ title: t('overview.errors.chart') }));
      const counts = tierCounts(st, f);
      matrixLegendHost.replaceChildren(toneLegend(TIERS.map((x) => ({ tone: x.tone, label: tierLabel(x.tier), count: counts[x.tone] })), 'matrix-legend'));
    }

    function renderTrend() {
      const rows = trendRows();
      const total = rows.reduce((a, w) => a + (Number(w.incidents) || 0) + (Number(w.nearMisses) || 0), 0);
      if (!total) {
        trendHost.replaceChildren(C.emptyState({ icon: ico('check-circle', 28), title: t('overview.trend.emptyTitle'), text: t('overview.trend.emptyText') }));
        return;
      }
      const chart = tryEl(() => charts.lineChart({
        series: [
          { id: 'incidents', label: t('overview.trend.incidents'), color: 'var(--s1)', values: rows.map((w) => Number(w.incidents) || 0) },
          { id: 'nearMisses', label: t('overview.trend.nearMisses'), color: 'var(--s2)', values: rows.map((w) => Number(w.nearMisses) || 0) },
        ],
        labels: rows.map(weekLabel), height: 260, yFormat: fmt.num, ariaLabel: t('overview.trend.aria', { n: fmt.num(12) }), xLabel: t('overview.trend.cols.week'),
      }), 'lineChart');
      trendHost.replaceChildren(chart || C.emptyState({ title: t('overview.errors.chart') }));
    }

    function renderPermits(st, f) {
      const parts = safe(() => sel.permitsByStatus(st, f), [], 'permitsByStatus');
      const colored = parts.map((p, i) => ({ id: String(p.id || i), label: label('permitStatus', p.label), value: Number(p.value) || 0, color: safe(() => charts.paletteFor(i), `var(--s${(i % 8) + 1})`, 'paletteFor') }));
      const total = colored.reduce((a, p) => a + p.value, 0);
      if (!total) {
        permitsHost.replaceChildren(C.emptyState({ icon: ico('permit', 28), title: t('overview.permits.emptyTitle'), text: t('overview.permits.emptyText') }));
        permitsListHost.replaceChildren();
        return;
      }
      const chart = tryEl(() => charts.segmentedBar({ parts: colored, tall: true, valueFormat: fmt.num, ariaLabel: t('overview.permits.title') }), 'segmentedBar');
      permitsHost.replaceChildren(chart || h('span'));
      permitsListHost.replaceChildren(h('dl', { class: 'kv is-compact' },
        ...colored.map((p) => h('div', { class: 'kv-row' },
          h('dt', {}, h('span', { class: 'row gap-2' }, h('span', { class: 'legend-key', style: { '--key': p.color, background: p.color } }), p.label)),
          h('dd', { class: 'mono' }, h('bdi', {}, t('overview.permits.share', { count: fmt.num(p.value), pct: fmt.pct((p.value / total) * 100) })))))));
    }

    /* Priority actions: overdue risks (sel.overdueRisks — the shared definition) + the other urgent kinds. */
    function priorityItems(st, f) {
      const at = now();
      const todayStart = new Date(at.getFullYear(), at.getMonth(), at.getDate()).getTime();
      const items = [];
      for (const r of safe(() => sel.overdueRisks(st, f, at), [], 'overdueRisks')) {
        items.push({
          key: `risk:${r.id}`, kind: 'risk', tone: r.tone === 'critical' ? 'critical' : r.tone === 'serious' ? 'serious' : 'warning',
          due: r.dueDate, code: r.code, siteId: r.siteId, title: L(r, 'hazard', 'risks') || r.code,
          badge: tierLabel(r.tier), dueText: tn('overview.actions.overdueDays', r.daysOverdue), overdue: true,
          href: `#/risks?id=${encodeURIComponent(r.id)}`,
        });
      }
      const urgent = safe(() => sel.urgentActions(st, at, { siteId: f.siteId }), [], 'urgentActions');
      for (const a of urgent) {
        if (!a || a.kind === 'risk') continue;
        const dueMs = parseMs(a.due);
        if (a.kind === 'incident') {
          const inc = arr(st.incidents).find((x) => x && x.id === a.id);
          items.push({ key: `incident:${a.id}`, kind: 'incident', tone: a.tone, due: a.due, code: a.code, siteId: a.siteId,
            title: inc ? (L(inc, 'title', 'incidents') || a.code) : a.code,
            badge: inc ? label('incidentStatus', inc.status) : '', dueText: t('overview.actions.reportedOn', { date: fmt.date(a.due, { style: 'short' }) }),
            note: t('overview.actions.incidentNote', { severity: fmt.num(Number(inc && inc.severity) || 0), max: fmt.num(5) }), href: a.href });
        } else if (a.kind === 'permit') {
          const pm = arr(st.permits).find((x) => x && x.id === a.id);
          const expired = Number.isFinite(dueMs) && dueMs <= at.getTime();
          items.push({ key: `permit:${a.id}`, kind: 'permit', tone: a.tone, due: a.due, code: a.code, siteId: a.siteId,
            title: pm ? t('overview.actions.permitTitle', { type: label('permitType', pm.type), location: L(pm, 'location', 'permits') || '' }) : a.code,
            badge: expired ? t('overview.actions.permitExpired') : t('overview.actions.permitExpiring'),
            dueText: t('overview.actions.atTime', { time: riyadhTime(a.due) }), overdue: expired, href: a.href });
        } else if (a.kind === 'inspection') {
          const ins = arr(st.inspections).find((x) => x && x.id === a.id);
          items.push({ key: `inspection:${a.id}`, kind: 'inspection', tone: a.tone, due: a.due, code: a.code, siteId: a.siteId,
            title: ins ? t('overview.actions.inspectionTitle', { type: label('inspectionType', ins.type) }) : a.code,
            badge: label('inspectionStatus', 'متأخر'), dueText: t('overview.actions.dueOn', { date: fmt.date(a.due, { style: 'short' }) }),
            overdue: Number.isFinite(dueMs) && dueMs < todayStart, href: a.href });
        } else if (a.kind === 'cert') {
          const worker = arr(st.workers).find((x) => x && x.id === a.id);
          const course = arr(st.courses).find((x) => x && x.id === a.code);
          items.push({ key: `cert:${a.id}:${a.code}`, kind: 'cert', tone: a.tone, due: a.due, code: null, siteId: a.siteId,
            title: t('overview.actions.certTitle', { course: course ? (L(course, 'name', 'courses') || label('course', course.id)) : a.code, worker: worker ? (L(worker, 'name', 'workers') || '') : '' }),
            badge: t('overview.actions.certExpiring'), dueText: t('overview.actions.expiresOn', { date: fmt.date(a.due, { style: 'short' }) }), href: a.href });
        }
      }
      items.sort((a, b) => ((TONE_RANK[a.tone] ?? 9) - (TONE_RANK[b.tone] ?? 9)) || ((parseMs(a.due) || 0) - (parseMs(b.due) || 0)));
      return items;
    }

    function renderActions(st, f) {
      const all = priorityItems(st, f);
      const items = all.slice(0, 8);
      actionsCount.textContent = all.length ? tn('overview.actions.count', all.length) : t('overview.actions.none');
      if (!items.length) {
        actionsHost.replaceChildren(C.emptyState({ icon: ico('check-circle', 30), title: t('overview.actions.emptyTitle'), text: t('overview.actions.emptyText') }));
        return;
      }
      const twoUp = layoutMode !== 'narrow' && items.length > 3;
      const list = h('ol', { class: 'priority-list', 'aria-label': t('overview.actions.title'), style: twoUp ? { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 360px), 1fr))', columnGap: 'var(--space-6)' } : undefined }, items.map((a) => h('li', {
        class: ['priority-item', 'is-clickable', `tone-${a.tone || 'warning'}`, a.overdue ? 'is-overdue' : null], 'data-key': a.key,
        onClick: (e) => { if (e.target.closest('a')) return; if (a.href) location.hash = a.href.replace(/^#/, ''); },
      },
          h('span', { class: 'priority-rank', 'aria-hidden': 'true' }),
          h('span', { class: 'priority-main' },
            h('a', { class: 'priority-title', href: a.href || '#/overview', style: { color: 'inherit', textDecoration: 'none' } }, a.title),
            h('span', { class: 'priority-meta' },
              h('span', {}, ico(KIND_ICON[a.kind] || 'alert', 12), t(`overview.actions.kinds.${a.kind}`)),
              a.code ? h('span', { class: 'code mono', dir: 'ltr', translate: 'no' }, a.code) : null,
              a.siteId ? h('span', {}, siteName(a.siteId)) : null,
              a.note ? h('span', {}, a.note) : null)),
          h('span', { class: 'priority-side' },
            a.badge ? C.badge(a.badge, a.tone || 'warning') : null,
            h('span', { class: ['priority-due', a.overdue ? 'is-overdue' : null] }, a.dueText)))));
      actionsHost.replaceChildren(list);
    }

    function siteColumns() {
      return [
        { key: 'name', label: t('overview.sites.cols.site'), priority: 'high', sortValue: (r) => L(r.site, 'name', 'sites'),
          render: (r) => h('div', { class: 'stack gap-1', style: { minInlineSize: '120px' } }, h('span', { class: 'cell-title', style: { whiteSpace: 'normal' } }, L(r.site, 'name', 'sites')), h('span', { class: 'cell-sub code mono nowrap', dir: 'ltr', translate: 'no' }, String(r.site.code || ''))) },
        { key: 'city', label: t('overview.sites.cols.city'), priority: 'low', sortValue: (r) => L(r.site, 'city', 'sites'), render: (r) => L(r.site, 'city', 'sites') || '—' },
        { key: 'phase', label: t('overview.sites.cols.phase'), priority: 'low', sortValue: (r) => L(r.site, 'phase', 'sites'),
          render: (r) => h('span', { style: { display: 'inline-block', maxInlineSize: '170px', whiteSpace: 'normal' } }, L(r.site, 'phase', 'sites') || '—') },
        { key: 'workers', label: t('overview.sites.cols.workers'), priority: 'medium', align: 'end', sortValue: (r) => Number(r.site.workers) || 0, render: (r) => fmt.num(Number(r.site.workers) || 0) },
        { key: 'score', label: t('overview.sites.cols.score'), priority: 'high', width: 150, sortValue: (r) => r.score,
          render: (r) => h('div', { class: 'progress-row' }, C.progress({ value: r.score, max: 100, tone: scoreTone(r.score), label: t('overview.sites.scoreAria', { value: fmt.num(r.score) }) }), h('span', { class: 'progress-value' }, fmt.num(r.score))) },
        { key: 'trend', label: t('overview.sites.cols.trend'), priority: 'low', sortable: false, render: (r) => tryEl(() => charts.sparkline({ values: arr(r.trend), width: 80, height: 24 }), 'sparkline') || '—' },
        { key: 'openRisks', label: t('overview.sites.cols.risks'), priority: 'high', align: 'end', sortValue: (r) => r.openRisks,
          render: (r) => (r.criticalRisks > 0 ? h('span', { class: 'row gap-2', style: { justifyContent: 'flex-end' } }, C.badge(t('overview.sites.criticalBadge', { count: fmt.num(r.criticalRisks) }), 'critical'), fmt.num(r.openRisks)) : fmt.num(r.openRisks)) },
        { key: 'openIncidents', label: t('overview.sites.cols.incidents'), priority: 'medium', align: 'end', sortValue: (r) => r.openIncidents, render: (r) => fmt.num(r.openIncidents) },
      ];
    }

    function renderSites(st) {
      const rows = safe(() => sel.siteScores(st), [], 'siteScores').filter((r) => r && r.site).map((r) => ({ id: r.site.id, ...r }));
      if (!sitesTable) {
        sitesTable = C.dataTable({
          columns: siteColumns(), rows, rowKey: 'id', pageSize: 6, dense: true, caption: t('overview.sites.title'), stickyFirst: true,
          initialSort: { key: 'score', dir: 'asc' }, emptyText: t('overview.sites.empty'),
          rowLabel: (row) => L(row.site, 'name', 'sites'),
          onRowClick: (row) => {
            const previous = filters().siteId;
            store.setFilter('siteId', row.id);
            C.toast(t('overview.sites.filtered', { site: L(row.site, 'name', 'sites') }), { tone: 'accent', action: { label: t('overview.sites.undo'), onClick: () => store.setFilter('siteId', previous || 'all') } });
          },
        });
        sitesHost.replaceChildren(sitesTable.el);
      } else {
        sitesTable.update(rows, { preserve: true, flash: true });
      }
    }

    function renderRadarMeta(f) {
      const s = sourceStatus();
      radarStatus.dataset.status = s;
      radarStatus.title = statusDesc(s);
      radarStatus.replaceChildren(ico(s === 'demo' ? 'flask' : (s === 'live' ? 'check-circle' : 'alert-circle'), 12), h('span', {}, s === 'demo' ? t('overview.radar.simulated') : statusLabel(s)));
      const blips = currentBlips();
      const counts = { critical: 0, serious: 0, warning: 0, good: 0 };
      blips.forEach((b) => { if (b.tone in counts) counts[b.tone] += 1; });
      radarLegendHost.replaceChildren(toneLegend(TIERS.map((x) => ({ tone: x.tone, label: tierLabel(x.tier), count: counts[x.tone] })), 'radar-legend'));
      blipCount.textContent = t('overview.radar.count', { count: tn('overview.common.risks', blips.length), scope: scopeText(f) });
      canvas.setAttribute('aria-label', t('overview.radar.aria', { count: tn('overview.common.risks', blips.length), critical: fmt.num(counts.critical) }));
    }

    /* ───────────── radar hover tooltip ───────────── */
    function placeTip(pt) {
      const rect = radarWrap.getBoundingClientRect();
      const c = canvas.getBoundingClientRect();
      let x; let y;
      if (pt && Number.isFinite(pt.x) && Number.isFinite(pt.y)) { x = pt.x + (c.left - rect.left); y = pt.y + (c.top - rect.top); }
      else if (pt && Number.isFinite(pt.clientX) && Number.isFinite(pt.clientY)) { x = pt.clientX - rect.left; y = pt.clientY - rect.top; }
      else { x = rect.width / 2; y = 16; }
      const tw = tip.offsetWidth || 200;
      const th = tip.offsetHeight || 80;
      const rtl = I.dir() === 'rtl';
      const anchorStart = rtl ? rect.width - x : x;
      let start = anchorStart + 14;
      let top = y + 14;
      if (start + tw > rect.width - 4) start = Math.max(4, anchorStart - tw - 14);
      if (top + th > rect.height - 4) top = Math.max(4, y - th - 14);
      tip.style.insetInlineStart = `${Math.round(start)}px`;
      tip.style.insetBlockStart = `${Math.round(top)}px`;
    }
    function showTip(blip, pt) {
      if (!blip) { tip.hidden = true; return; }
      const row = (k, v) => h('div', { class: 'tooltip-row' }, h('span', {}, k), h('strong', {}, v));
      tip.replaceChildren(
        h('div', { class: 'tooltip-title' }, h('span', { class: 'blip-code code mono', dir: 'ltr', translate: 'no' }, String(blip.code || '')), ' ', blipLabel(blip)),
        h('div', { class: 'tooltip-rows' },
          row(t('overview.radar.cols.site'), siteName(blip.siteId) || '—'),
          row(t('overview.radar.cols.category'), categoryLabel(blip.categoryId)),
          Number.isFinite(Number(blip.score)) ? row(t('overview.radar.cols.score'), fmt.num(Number(blip.score))) : null),
        h('div', { class: 'row gap-2', style: { marginBlockStart: '6px' } },
          blip.tier ? tierBadge(blip.tier) : null,
          blip.transient ? C.badge(t('overview.radar.simulatedDetection'), 'accent') : h('span', { class: 'tooltip-kbd' }, t('overview.radar.clickHint'))));
      tip.hidden = false;
      placeTip(pt);
    }
    function onBlipClick(blip) {
      if (!blip) return;
      if (blip.transient) router.navigate('radar');
      else router.navigate('risks', { id: blip.id });
    }
    frame.addEventListener('pointerleave', () => { tip.hidden = true; });

    function startRadar() {
      if (typeof R.SweepRadar !== 'function') { warn('radar', new Error('SweepRadar unavailable')); return; }
      try {
        sweep = new R.SweepRadar(canvas, {
          rings: 4,
          sectors: 12,
          sectorLabels: categories().map((c) => (I.has(`risks.categoryShort.${c.id}`) ? t(`risks.categoryShort.${c.id}`) : categoryLabel(c.id))),
          sweepDegPerSec: 22,
          getBlips: currentBlips,
          onHover: showTip,
          onClick: onBlipClick,
          showLabels: true,
        });
        if (typeof sweep.start === 'function') sweep.start();
      } catch (err) { warn('radar.start', err); sweep = null; }
    }

    /* ───────────── formula modal ───────────── */
    function openFormulaModal() {
      const W = { ...DEFAULT_WEIGHTS, ...(selectorsMod.SAFETY_INDEX_WEIGHTS || {}) };
      const ltiBase = Number(selectorsMod.LTIFR_BASE_HOURS) || 1_000_000;
      const trirBase = Number(selectorsMod.TRIR_BASE_HOURS) || 200_000;
      const hoursDay = Number(selectorsMod.HOURS_PER_WORKER_DAY) || 9;
      const minus = (n) => `−${fmt.num(n, { maximumFractionDigits: 1 })}`;
      const pts = (n) => h('bdi', { dir: 'ltr' }, n);
      const body = h('div', { class: 'stack gap-3' },
        h('p', { class: 't-body' }, t('overview.formula.lead', { base: fmt.num(W.base), min: fmt.num(0), max: fmt.num(100) })),
        C.kv([
          [t('overview.formula.critical'), h('span', {}, pts(minus(W.criticalOpen)), ' ', t('overview.formula.perRisk'))],
          [t('overview.formula.high'), h('span', {}, pts(minus(W.highOpen)), ' ', t('overview.formula.perRisk'))],
          [t('overview.formula.overdue'), h('span', {}, pts(minus(W.overdueOpen)), ' ', t('overview.formula.perRisk'))],
          [t('overview.formula.lti', { days: fmt.num(90) }), h('span', {}, pts(minus(W.lti90)), ' ', t('overview.formula.perInjury'))],
          [t('overview.formula.mtc', { days: fmt.num(90) }), h('span', {}, pts(minus(W.mtc90)), ' ', t('overview.formula.perInjury'))],
          [t('overview.formula.nearMiss', { days: fmt.num(30) }), h('span', {}, pts(minus(W.nearMiss30)), ' ', t('overview.formula.perEvent'))],
          [t('overview.formula.training'), h('span', {}, pts(`+${fmt.num(W.trainingPct, { maximumFractionDigits: 1 })}`), ' ', t('overview.formula.perPoint', { pct: fmt.pct(1) }))],
        ]),
        h('div', { class: 'note' },
          h('p', {}, h('strong', { translate: 'no' }, 'LTIFR'), ' ', t('overview.formula.ltifr', { base: fmt.num(ltiBase) })),
          h('p', {}, h('strong', { translate: 'no' }, 'TRIR'), ' ', t('overview.formula.trir', { base: fmt.num(trirBase), hours: fmt.num(hoursDay) }))),
        h('p', { class: 't-helper' }, t('overview.formula.overdueDefinition')));
      overlay = C.modal({ title: t('overview.formula.title'), subtitle: t('overview.formula.subtitle'), body, actions: [{ label: t('core.common.ok'), variant: 'primary' }], size: 'md', onClose: () => { overlay = null; } });
      overlay.open();
    }

    /* ───────────── refresh orchestration ───────────── */
    function refresh() {
      if (destroyed) return;
      const st = state();
      const f = filters();
      const k = safe(() => sel.kpis(st, f), null, 'kpis');
      const hist = kpiHistory(st, f, k);
      guard(statusHost, 'head', () => renderHead(f));
      guard(metricGrid, 'metrics', () => renderMetrics(k, st, f, hist));
      guard(heroBody, 'hero', () => renderHero(k, st, f));
      guard(leadingRow, 'leading', () => renderLeading(k, hist));
      guard(matrixHost, 'matrix', () => renderMatrix(st, f));
      guard(trendHost, 'trend', () => renderTrend());
      guard(permitsHost, 'permits', () => renderPermits(st, f));
      guard(actionsHost, 'actions', () => renderActions(st, f));
      guard(sitesHost, 'sites', () => renderSites(st));
      guard(radarLegendHost, 'radarMeta', () => renderRadarMeta(f));
      if (firstPaint) {
        firstPaint = false;
        if (motion && typeof motion.enter === 'function') {
          motion.enter(Array.from(metricGrid.children), { y: 8 });
          motion.enter([heroCard, radarCard], { y: 10, delay: 0.06 });
          motion.enter(Array.from(leadingRow.children), { y: 6, delay: 0.1 });
          motion.enter([matrixCard, trendCard, permitsCard, actionsCard, sitesCard], { y: 10, delay: 0.14 });
        }
      }
    }
    function schedule() {
      if (destroyed || raf) return;
      raf = requestAnimationFrame(() => { raf = 0; refresh(); });
    }
    function tickClock() {
      if (document.hidden || destroyed) return;
      const text = t('overview.radar.updated', { time: fmt.relative(lastChangeAt) });
      if (updatedText.textContent !== text) updatedText.textContent = text;
    }
    const onVisibility = () => { if (!destroyed && !document.hidden) tickClock(); };
    document.addEventListener('visibilitychange', onVisibility);

    refresh();
    tickClock();
    startRadar();

    subs.push(bus.on('store:change', (p) => {
      lastChangeAt = Date.now();
      const path = String((p && p.path) || '*');
      if (/^(feed|sensors|integrations|platform)/.test(path)) return;
      schedule();
    }));
    subs.push(bus.on('filters:change', schedule));
    subs.push(bus.on('settings:change', schedule));
    timers.push(setInterval(tickClock, 1000));

    /* ───────────── cleanup ───────────── */
    return function cleanup() {
      destroyed = true;
      document.removeEventListener('visibilitychange', onVisibility);
      subs.splice(0).forEach((off) => { try { off(); } catch { /* ignore */ } });
      timers.splice(0).forEach((x) => { clearInterval(x); clearTimeout(x); });
      if (raf) { cancelAnimationFrame(raf); raf = 0; }
      if (layoutObserver) { try { layoutObserver.disconnect(); } catch { /* ignore */ } layoutObserver = null; }
      if (layoutRaf) { cancelAnimationFrame(layoutRaf); layoutRaf = 0; }
      if (sweep) {
        try { if (typeof sweep.destroy === 'function') sweep.destroy(); else if (typeof sweep.stop === 'function') sweep.stop(); } catch { /* ignore */ }
        try { if (R.radarLoop && typeof R.radarLoop.remove === 'function') R.radarLoop.remove(sweep); } catch { /* ignore */ }
        sweep = null;
      }
      if (gaugeApi && typeof gaugeApi.destroy === 'function') { try { gaugeApi.destroy(); } catch { /* ignore */ } }
      if (sitesTable && typeof sitesTable.destroy === 'function') { try { sitesTable.destroy(); } catch { /* ignore */ } }
      if (overlay) { try { overlay.close(); } catch { /* ignore */ } overlay = null; }
      try { if (charts && charts.tooltip && typeof charts.tooltip.hide === 'function') charts.tooltip.hide(); } catch { /* ignore */ }
      tip.hidden = true;
    };
  },
};
