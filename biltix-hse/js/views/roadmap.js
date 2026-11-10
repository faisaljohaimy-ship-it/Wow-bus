/**
 * BILTIX Risk AI — view: roadmap & detailed proposal (js/views/roadmap.js) — PLT-03. Owner: B-DOMAINS (v3 Precision).
 *
 * The proposal as a living page: v3 heading (proposal stage, local-only note, print export), four
 * summary metrics, the five-layer architecture (labelled "proposed — not connected"), scope of work,
 * assumptions and out-of-scope items, the milestone timeline M0–M4 (start months 0–4 exactly as the
 * proposal table; durations are not stated, so they read "to be agreed" and no bar length is invented),
 * the milestone table with user-entered payment percentages (validated inline, saved in
 * settings.platform.paymentPct, live total, green at exactly 100 %), and the integration principle
 * (read from client systems, write back risk flags / alerts / tasks only).
 *
 * Language: js/i18n/roadmap.js (namespace 'roadmap'); proposal content through
 * i18n.localize(roadmap, 'roadmap') (singleton key '_'), enums through i18n.label. Nothing translated is
 * cached at module level. Data reaches the DOM only through textContent / components.h.
 */

import { i18n } from '../core/i18n.js';
import dict from '../i18n/roadmap.js';

i18n.register('roadmap', dict);

const NS = 'roadmap';
const MILESTONE_IDS = ['M0', 'M1', 'M2', 'M3', 'M4'];
const STATUS_TONE = { 'منجز': 'good', 'جارٍ': 'accent', 'قادم': 'neutral' };
/** v2 additions: highlight hues that are NOT risk colours (red/amber/green mean risk state only). */
const V2_TONES = { connectors: 'var(--accent)', validation: 'var(--s7)', classification: 'var(--brand)' };
const LAYERS = [
  { key: 'l1', no: 1, nodes: [['layers', 'biltix'], ['integration', 'p6', 'connectors'], ['integration', 'aps', 'connectors'], ['integration', 'oracle', 'connectors'], ['plug', 'configurable', 'connectors'], ['globe', 'feeds']] },
  { key: 'l2', no: 2, v2: 'validation', nodes: [['list', 'schema'], ['copy', 'dedupe'], ['badge-check', 'complete'], ['sliders', 'consistency'], ['alert', 'quarantine']] },
  { key: 'l3', no: 3, nodes: [['erp', 'structured'], ['file-text', 'docs'], ['clock', 'versions'], ['shield-alert', 'audit']] },
  { key: 'l4', no: 4, nodes: [['file-text', 'contracts'], ['list', 'bom'], ['calendar', 'schedule'], ['helmet', 'site'], ['chart', 'cost']] },
  { key: 'l5', no: 5, nodes: [['filter', 'classification', 'classification'], ['bell', 'alerting'], ['refresh', 'writeback'], ['file-check', 'tasks'], ['radar', 'cockpit']] },
];
const READS = ['r1', 'r2', 'r3', 'r4', 'r5', 'r6'];
const WRITES = ['w1', 'w2', 'w3', 'w4'];

const V = '.view-roadmap';
const STYLE_ID = 'view-roadmap-style';
const STYLE_TEXT = `
${V} .dom-meta { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 16px; font-size: var(--fs-sm); color: var(--ink-3); }
${V} .dom-meta-item { display: inline-flex; align-items: center; gap: 6px; min-inline-size: 0; }
${V} .dom-meta-item > svg { flex: none; color: var(--ink-3); }
${V} .dom-row { display: grid; grid-template-columns: minmax(0, 1fr); gap: var(--gap); align-items: start; }
@container main (min-width: 761px) { ${V} .dom-row.is-1-1 { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
${V} .code { font-family: var(--font-mono); unicode-bidi: isolate; white-space: nowrap; }
${V} .layer-stack-item.is-v2 { border-color: color-mix(in srgb, var(--v2-tone) 55%, var(--line)); background: color-mix(in srgb, var(--v2-tone) 8%, var(--bg-2)); }
${V} .layer-stack-body { display: flex; flex-direction: column; gap: 8px; min-inline-size: 0; }
${V} .layer-stack-title { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
${V} .layer-stack-heading { margin: 0; font-size: var(--fs-md); font-weight: 600; color: var(--ink-1); }
${V} .arch-nodes { display: flex; flex-wrap: wrap; gap: 8px; }
${V} .arch-node { display: inline-flex; align-items: center; gap: 6px; padding: 5px 10px; border-radius: 8px; background: var(--bg-1); border: 1px solid var(--line); font-size: var(--fs-xs); color: var(--ink-2); min-inline-size: 0; }
${V} .arch-node > svg { flex: none; color: var(--ink-3); }
${V} .arch-node.is-v2 { border-color: color-mix(in srgb, var(--v2-tone) 60%, var(--line)); background: color-mix(in srgb, var(--v2-tone) 12%, var(--bg-1)); color: var(--ink-1); }
${V} .arch-node.is-v2 > svg { color: var(--v2-tone); }
${V} .v2-badge { display: inline-flex; align-items: center; gap: 5px; padding: 1px 8px; border-radius: var(--radius-pill); font-size: 11px; font-weight: 600; color: var(--ink-1); background: color-mix(in srgb, var(--v2-tone) 14%, var(--bg-1)); border: 1px solid color-mix(in srgb, var(--v2-tone) 45%, var(--line)); }
${V} .v2-legend { display: flex; flex-wrap: wrap; gap: 8px 14px; align-items: center; font-size: var(--fs-xs); color: var(--ink-2); }
${V} .v2-legend-item { display: inline-flex; align-items: center; gap: 6px; }
${V} .v2-key { inline-size: 10px; block-size: 10px; border-radius: 3px; background: var(--v2-tone); flex: none; }
${V} .arch-connector { display: flex; justify-content: center; color: var(--ink-3); block-size: 16px; align-items: center; }
${V} .check-list { margin: 0; padding: 0; list-style: none; display: grid; gap: 10px; }
${V} .check-list > li { display: grid; grid-template-columns: 20px minmax(0, 1fr); gap: 10px; align-items: start; font-size: var(--fs-sm); color: var(--ink-1); line-height: 1.6; }
${V} .check-list > li > svg { margin-block-start: 3px; color: var(--accent-text); }
${V} .check-list.is-assumptions > li > svg { color: var(--brand-text); }
${V} .check-list.is-out > li { color: var(--ink-2); }
${V} .check-list.is-out > li > svg { color: var(--ink-3); }
${V} .deliverables { margin: 0; padding-inline-start: 1.1em; font-size: var(--fs-xs); color: var(--ink-2); line-height: 1.55; display: grid; gap: 2px; }
${V} .principle-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--space-3); }
${V} .principle-col { padding: 12px 14px; border-radius: var(--radius-md); border: 1px solid var(--line); background: var(--bg-2); border-block-start: 3px solid var(--tone, var(--line-2)); }
${V} .principle-col h3 { margin: 0 0 8px; font-size: var(--fs-sm); display: flex; align-items: center; gap: 8px; }
${V} .principle-col ul { margin: 0; padding-inline-start: 1.1em; font-size: var(--fs-sm); color: var(--ink-2); line-height: 1.6; }
@container main (max-width: 720px) { ${V} .principle-grid { grid-template-columns: minmax(0, 1fr); } }
${V} .rm-marker { grid-column: calc(var(--start) + 1) / -1; grid-row: 1; align-self: center; display: flex; align-items: center; gap: 6px; min-inline-size: 0; margin-inline-start: 4px; padding-inline-end: 8px; block-size: 22px; font-size: 11px; color: var(--ink-2); border-block-end: 1px dashed var(--line-2); overflow: hidden; }
${V} .rm-marker.is-rev { grid-column: 1 / calc(var(--start) + 1); flex-direction: row-reverse; margin-inline: 0 -5px; padding-inline: 8px 0; border-block-end: 0; }
${V} .rm-diamond { flex: none; inline-size: 10px; block-size: 10px; transform: rotate(45deg); border-radius: 2px; background: var(--brand); box-shadow: 0 0 0 2px color-mix(in srgb, var(--brand) 25%, transparent); }
${V} .rm-label { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
${V} .rm-legend { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 16px; font-size: var(--fs-xs); color: var(--ink-2); }
${V} .rm-legend-item { display: inline-flex; align-items: center; gap: 6px; }
${V} .rm-legend-dash { inline-size: 18px; border-block-end: 1px dashed var(--ink-3); }
${V} .roadmap-month { font-size: 11px; }
${V} .roadmap-payment { display: inline-flex; align-items: center; gap: 6px; }
${V} .roadmap-payment input { inline-size: 76px; text-align: end; }
${V} .pay-cell { display: flex; flex-direction: column; align-items: flex-end; gap: 4px; }
${V} .pay-error { font-size: var(--fs-xs); color: var(--critical-text); display: inline-flex; align-items: center; gap: 4px; }
${V} .pay-error[hidden] { display: none; }
${V} .milestone-table td { vertical-align: top; }
${V} .milestone-table .stack > .code, ${V} .roadmap-row-label > .code { align-self: flex-start; }
${V} .tbd { display: inline-flex; align-items: center; gap: 6px; font-size: var(--fs-xs); color: var(--ink-2); white-space: nowrap; }
@container card (max-width: 640px) {
  ${V} .milestone-table thead { display: none; }
  ${V} .milestone-table.table, ${V} .milestone-table tbody, ${V} .milestone-table tr, ${V} .milestone-table td { display: block; inline-size: 100%; }
  ${V} .milestone-table tr { padding-block: 12px; border-block-end: 1px solid var(--line); }
  ${V} .milestone-table.table tr, ${V} .milestone-table.table td { height: auto; block-size: auto; min-block-size: 0; max-block-size: none; }
  ${V} .milestone-table.table td { padding: 4px 0; border: 0; text-align: start; overflow: visible; white-space: normal; }
  ${V} .milestone-table td[data-label]::before { content: attr(data-label); display: block; font-size: var(--fs-xs); color: var(--ink-3); margin-block-end: 2px; }
  ${V} .milestone-table .pay-cell { align-items: flex-start; }
}
@media print { ${V} .view-actions, ${V} .btn, ${V} .card-view-toggle { display: none !important; } ${V} .card { break-inside: avoid; } ${V} .roadmap-payment input { border: 0; background: transparent; } }
`;

const LATIN_NUM_TOKEN = /[A-Za-z][A-Za-z0-9._-]*\d[A-Za-z0-9._-]*|\d+[A-Za-z][A-Za-z0-9._-]*/g;
const safe = (fn, fallback) => { try { const v = fn(); return v === undefined ? fallback : v; } catch { return fallback; } };
const arr = (v) => (Array.isArray(v) ? v : []);
const num = (v, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);

function ensureStyle() {
  if (typeof document === 'undefined' || document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = STYLE_TEXT;
  document.head.appendChild(style);
}

export default {
  id: 'roadmap',
  code: 'PLT-03',
  get title() { return i18n.t('core.nav.roadmap.title'); },
  icon: 'calendar',

  render(container, ctx) {
    const { store, bus, fmt, components, router } = ctx;
    const psel = ctx.psel || null;
    const motion = ctx.motion || components.motion || null;
    const { h, card, badge, button, toast, emptyState, errorState, svgIcon, glyph, statusBadge } = components;

    const t = (k, p) => i18n.t(`${NS}.${k}`, p);
    const tn = (k, n, p) => i18n.tn(`${NS}.${k}`, n, p);
    const label = (ns, v) => i18n.label(ns, v);

    ensureStyle();
    const root = h('section', { class: 'view view-roadmap' });
    container.appendChild(root);

    let raf = 0;
    let built = false;
    let lastNumerals = safe(() => store.state.settings.numerals, 'latn');
    let lastPayJson = safe(() => JSON.stringify(store.state.settings.platform.paymentPct || null), 'null');
    let ownSave = null;

    /* ───────────────────────── helpers ───────────────────────── */

    function digitsIn(value) {
      const s = String(value ?? '');
      if (typeof fmt.digits !== 'function' || !/\d/.test(s)) return s;
      let out = ''; let last = 0; let m;
      LATIN_NUM_TOKEN.lastIndex = 0;
      while ((m = LATIN_NUM_TOKEN.exec(s))) { out += fmt.digits(s.slice(last, m.index)) + m[0]; last = m.index + m[0].length; }
      return out + fmt.digits(s.slice(last));
    }
    const codeSpan = (code, extra = null) => h('span', { class: ['code', 'mono', extra], dir: 'ltr', translate: 'no' }, String(code ?? ''));
    const pctSign = () => (typeof fmt.getNumerals === 'function' && fmt.getNumerals() === 'arab' ? '٪' : '%');
    const range100 = () => t('arch.range').replace(/\d+/g, (d) => fmt.num(Number(d)));
    const toBeAgreed = () => i18n.t('core.common.toBeAgreed');
    /** Parse a typed percentage (Western or Arabic-Indic digits); '' → null; anything else invalid → NaN. */
    function parsePct(raw) {
      const s = String(raw ?? '').trim();
      if (s === '') return null;
      const n = typeof fmt.parseSigned === 'function' ? fmt.parseSigned(s) : Number(s);
      return Number.isFinite(n) && n >= 0 && n <= 100 ? Math.round(n * 100) / 100 : NaN;
    }
    const totalTone = (total, any) => (!any ? 'neutral' : Math.abs(total - 100) < 1e-9 ? 'good' : total > 100 ? 'critical' : 'warning');
    function totalText(total, any) {
      if (!any) return t('milestones.totalNone');
      if (Math.abs(total - 100) < 1e-9) return t('milestones.totalOk', { total: fmt.pct(100) });
      if (total > 100) return t('milestones.totalOver', { total: fmt.pct(total, 1), max: fmt.pct(100) });
      return t('milestones.totalOff', { total: fmt.pct(total, 1), rest: fmt.pct(100 - total, 1) });
    }
    function totalHelper(total, any) {
      if (!any) return t('kpi.paymentHelperNone');
      if (Math.abs(total - 100) < 1e-9) return t('kpi.paymentHelperOk', { total: fmt.pct(100) });
      if (total > 100) return t('kpi.paymentHelperOver', { total: fmt.pct(100), over: fmt.pct(total - 100, 1) });
      return t('kpi.paymentHelperOff', { rest: fmt.pct(100 - total, 1), total: fmt.pct(100) });
    }
    function totalBadge(total, any) {
      const el = badge(totalText(total, any), totalTone(total, any));
      el.classList.add('payment-total');
      return el;
    }
    /** Repaint every total indicator in place (badge, total row, metric tile) without a rebuild. */
    function paintTotals(total, any) {
      const tone = totalTone(total, any);
      root.querySelectorAll('.payment-total').forEach((el) => el.replaceWith(totalBadge(total, any)));
      root.querySelectorAll('[data-pay-total]').forEach((el) => { el.textContent = any ? fmt.pct(total, 1) : '—'; });
      root.querySelectorAll('[data-pay-helper]').forEach((el) => { el.textContent = totalHelper(total, any); });
      const tile = root.querySelector('.metric-tile[data-key="payment"]');
      if (tile) { tile.className = tile.className.replace(/\btone-\w+/g, '').trim(); tile.classList.add(`tone-${tone}`); }
      const row = root.querySelector('.roadmap-total');
      if (row) { row.classList.toggle('is-ok', tone === 'good'); row.classList.toggle('is-off', tone !== 'good'); }
    }

    /* ───────────────────────── data ───────────────────────── */

    function collect() {
      const state = store.state;
      const plat = (psel && typeof psel.platform === 'function' ? safe(() => psel.platform(state), null) : null) || state.platform || {};
      const raw = plat.roadmap || null;
      if (!raw) return { state, roadmap: null, milestones: [] };
      const roadmap = i18n.localize(raw, 'roadmap', '_');
      const saved = (state.settings && state.settings.platform && state.settings.platform.paymentPct) || {};
      const milestones = arr(roadmap.milestones).map((m, i) => {
        const id = m.id || MILESTONE_IDS[i] || `M${i}`;
        const sv = saved[id];
        const pct = sv === null || sv === undefined || sv === '' ? (m.paymentPct == null ? null : num(m.paymentPct)) : num(sv);
        const duration = m.durationMonths == null || m.durationMonths === '' ? null : num(m.durationMonths, null);
        return { ...m, id, month: Math.max(0, num(m.month, i)), duration, pct, deliverables: arr(m.deliverables) };
      }).sort((a, b) => a.month - b.month);
      const span = Array.isArray(roadmap.monthsSpan) && roadmap.monthsSpan.length === 2 ? [num(roadmap.monthsSpan[0]), num(roadmap.monthsSpan[1])] : [0, Math.max(0, ...milestones.map((m) => m.month))];
      const anyPct = milestones.some((m) => m.pct !== null);
      const total = milestones.reduce((a, m) => a + (m.pct === null ? 0 : m.pct), 0);
      return { state, roadmap, milestones, span, anyPct, total, scope: arr(roadmap.scopeItems), assumptions: arr(roadmap.assumptions), outOfScope: arr(roadmap.outOfScope) };
    }

    /* ───────────────────────── sections ───────────────────────── */

    function buildHead(data) {
      const note = data.roadmap ? (data.roadmap.statusNote || '') : '';
      return h('header', { class: 'view-head' },
        h('div', { class: 'view-head-text' },
          h('span', { class: 'code-tag' }, 'PLT-03'),
          h('h1', { tabindex: '-1' }, t('title')),
          h('p', { class: 'view-lead' }, t('lead')),
          h('div', { class: 'dom-meta' },
            h('span', { class: 'dom-meta-item', title: note ? digitsIn(note) : undefined }, glyph('neutral', 14), h('span', {}, t('meta.stage'))),
            h('span', { class: 'dom-meta-item' }, svgIcon('lock', 14), h('span', {}, t('meta.local'))),
          ),
        ),
        h('div', { class: 'view-actions' },
          data.roadmap ? totalBadge(data.total, data.anyPct) : null,
          button(t('export'), { variant: 'primary', size: 'sm', icon: 'print', attrs: { 'aria-label': t('exportAria') }, onClick: () => { try { window.print(); } catch { toast(t('printFailed'), { tone: 'warning' }); } } }),
        ),
      );
    }

    function metricTile({ key, label: lbl, value, tone = null, icon = null, helper = '', helperAttr = null, valueAttr = null, foot = null }) {
      return h('div', { class: ['metric-tile', tone ? `tone-${tone}` : null], 'data-key': key },
        h('div', { class: 'metric-head' }, h('span', { class: 'metric-label' }, lbl), icon ? h('span', { class: 'metric-icon', 'aria-hidden': 'true' }, icon) : null),
        h('div', { class: 'metric-value' }, h('span', { class: 't-metric', ...(valueAttr || {}) }, String(value))),
        h('div', { class: 'metric-foot' }, foot, helper ? h('span', { class: 'metric-helper', ...(helperAttr || {}) }, helper) : null));
    }

    function buildKpis(data) {
      const ids = data.milestones.map((m) => m.id);
      return h('div', { class: 'metric-grid', role: 'group', 'aria-label': t('title') },
        metricTile({ key: 'milestones', label: t('kpi.milestones'), value: fmt.num(data.milestones.length), icon: svgIcon('file-check', 16), foot: ids.length ? h('span', { class: 'row gap-1 wrap' }, codeSpan(`${ids[0]}–${ids[ids.length - 1]}`)) : null, helper: t('kpi.milestonesHelper') }),
        metricTile({ key: 'span', label: t('kpi.span'), value: t('kpi.spanValue', { from: fmt.num(data.span[0]), to: fmt.num(data.span[1]) }), valueAttr: { dir: 'ltr' }, icon: svgIcon('calendar', 16), helper: t('kpi.spanHelper', { from: fmt.num(data.span[0]), to: fmt.num(data.span[1]) }) }),
        metricTile({ key: 'durations', label: t('kpi.durations'), value: toBeAgreed(), icon: svgIcon('clock', 16), helper: t('kpi.durationsHelper') }),
        metricTile({ key: 'payment', label: t('kpi.payment'), value: data.anyPct ? fmt.pct(data.total, 1) : '—', valueAttr: { 'data-pay-total': '' }, tone: totalTone(data.total, data.anyPct), icon: svgIcon('percent', 16), helper: totalHelper(data.total, data.anyPct), helperAttr: { 'data-pay-helper': '' } }),
      );
    }

    function buildArchitecture() {
      const diagram = h('div', { class: 'layer-stack', role: 'list', 'aria-label': t('arch.aria') });
      LAYERS.forEach((layer, i) => {
        const v2 = layer.v2 || null;
        const nodes = h('div', { class: 'arch-nodes' }, ...layer.nodes.map(([icon, key, v2key]) => {
          const tagName = v2key ? t(`arch.v2.${v2key}.name`) : null;
          return h('span', { class: ['arch-node', v2key ? 'is-v2' : null], style: v2key ? { '--v2-tone': V2_TONES[v2key] } : undefined, title: v2key ? t('arch.v2Title', { name: tagName }) : undefined },
            svgIcon(icon, 13), h('span', {}, digitsIn(t(`arch.layers.${layer.key}.nodes.${key}`))), v2key ? h('span', { class: 'sr-only' }, t('arch.v2Sr', { name: tagName })) : null);
        }));
        diagram.appendChild(h('div', { class: ['layer-stack-item', v2 ? 'is-v2' : null], role: 'listitem', 'data-layer': String(layer.no), style: v2 ? { '--v2-tone': V2_TONES[v2] } : undefined },
          h('span', { class: 'layer-stack-index', 'aria-hidden': 'true' }, fmt.num(layer.no)),
          h('div', { class: 'layer-stack-body' },
            h('div', { class: 'layer-stack-title' }, h('h3', { class: 'layer-stack-heading' }, t(`arch.layers.${layer.key}.title`)), v2 ? h('span', { class: 'v2-badge', style: { '--v2-tone': V2_TONES[v2] } }, svgIcon('sparkles', 12), h('span', {}, t('arch.v2Badge', { tone: t(`arch.v2.${v2}.tone`) }))) : null),
            h('p', {}, digitsIn(t(`arch.layers.${layer.key}.desc`, { range: range100() }))),
            nodes)));
        if (i < LAYERS.length - 1) diagram.appendChild(h('div', { class: 'arch-connector', 'aria-hidden': 'true' }, glyph('chevronDown', 16)));
      });
      const legend = h('div', { class: 'v2-legend', role: 'group', 'aria-label': t('arch.legendAria') },
        h('span', { class: 't-label' }, t('arch.legend')),
        ...Object.keys(V2_TONES).map((k) => h('span', { class: 'v2-legend-item', style: { '--v2-tone': V2_TONES[k] } }, h('span', { class: 'v2-key', 'aria-hidden': 'true' }), h('span', {}, `${t(`arch.v2.${k}.name`)} (${t(`arch.v2.${k}.tone`)})`))));
      return card({
        code: 'RM-01', title: t('arch.title'), subtitle: t('arch.sub'),
        actions: [statusBadge('not_connected', { size: 'sm', label: t('arch.proposed'), title: t('arch.proposedTitle') })],
        body: h('div', { class: 'stack gap-4' }, h('div', { class: 'note is-demo', style: { '--tone': 'var(--ink-3)' } }, t('arch.note')), legend, diagram),
      });
    }

    function checkList(items, { iconName, className, empty }) {
      if (!items.length) return emptyState({ title: empty });
      return h('ul', { class: ['check-list', className] }, ...items.map((item) => {
        const text = typeof item === 'string' ? item : (item && (item.text || item.title)) || '—';
        const done = item && typeof item === 'object' && item.done === true;
        return h('li', {}, glyph(iconName, 18), h('span', { class: 'row wrap gap-2', style: { alignItems: 'baseline' } }, h('span', {}, digitsIn(text)), done ? badge(t('scope.done'), 'good') : null));
      }));
    }

    function buildScopeCard(data) {
      return card({ code: 'RM-02', title: t('scope.title'), subtitle: tn('scope.sub', data.scope.length), body: checkList(data.scope, { iconName: 'brand', className: 'is-scope', empty: t('scope.empty') }) });
    }

    function buildAssumptionsCard(data) {
      return card({
        code: 'RM-03', title: t('assumptions.title'), subtitle: t('assumptions.sub'),
        body: h('div', { class: 'stack gap-4' },
          checkList(data.assumptions, { iconName: 'neutral', className: 'is-assumptions', empty: t('assumptions.empty') }),
          data.outOfScope.length ? h('div', { class: 'stack gap-2' }, h('h3', { class: 't-label' }, t('assumptions.out')), checkList(data.outOfScope, { iconName: 'neutral', className: 'is-out', empty: '' })) : null),
        footer: h('p', { class: 't-helper' }, t('assumptions.footer')),
      });
    }

    function durationText(m) {
      return m.duration === null ? toBeAgreed() : tn('timeline.durationMonths', m.duration);
    }

    /** Start-month timeline (a time axis: runs left → right in both languages). No bar length is invented. */
    function buildTimelineCard(data) {
      if (!data.milestones.length) return card({ code: 'RM-04', title: t('timeline.title'), body: emptyState({ title: t('timeline.empty') }) });
      const [from, to] = data.span;
      const cols = Math.max(1, to - from + 1);
      const gantt = h('div', { class: 'roadmap-gantt', role: 'table', 'aria-label': t('timeline.aria'), style: { '--months': String(cols) } });
      const monthsRow = h('div', { class: 'roadmap-months', role: 'row', dir: 'ltr' });
      for (let m = from; m <= to; m += 1) monthsRow.appendChild(h('span', { class: 'roadmap-month', role: 'columnheader' }, t('timeline.month', { n: fmt.num(m) })));
      gantt.appendChild(h('div', { class: 'roadmap-gantt-head' }, h('span', { role: 'columnheader' }, t('timeline.head')), monthsRow));
      data.milestones.forEach((m) => {
        const start = Math.min(cols - 1, Math.max(0, Math.floor(m.month) - from));
        const dur = m.duration === null ? toBeAgreed() : durationText(m);
        const marker = h('div', { class: ['rm-marker', start > 0 && start >= Math.ceil(cols / 2) ? 'is-rev' : null], style: { '--start': String(start) }, title: t('timeline.markerTitle', { name: m.name || m.id, n: fmt.num(m.month), duration: dur }) },
          h('span', { class: 'rm-diamond', 'aria-hidden': 'true' }), h('span', { class: 'rm-label', dir: 'auto' }, t('timeline.marker', { n: fmt.num(m.month), duration: dur })));
        gantt.appendChild(h('div', { class: 'roadmap-row', role: 'row' },
          h('div', { class: 'roadmap-row-label', role: 'rowheader' }, codeSpan(m.id), h('strong', {}, digitsIn(m.name || m.id))),
          h('div', { class: 'roadmap-row-track', role: 'cell', dir: 'ltr' }, marker)));
      });
      const statuses = [...new Set(data.milestones.map((m) => m.status || 'قادم'))];
      const legend = h('div', { class: 'rm-legend' },
        h('span', { class: 'rm-legend-item' }, h('span', { class: 'rm-diamond', 'aria-hidden': 'true' }), h('span', {}, t('timeline.legendStart'))),
        h('span', { class: 'rm-legend-item' }, h('span', { class: 'rm-legend-dash', 'aria-hidden': 'true' }), h('span', {}, t('timeline.legendTbd'))),
        h('span', { class: 'rm-legend-item' }, h('span', {}, t('timeline.status')), ...statuses.map((s) => badge(label('roadmapStatus', s), STATUS_TONE[s] || 'neutral'))));
      const statusNote = data.roadmap.statusNote ? h('p', { class: 't-helper' }, digitsIn(data.roadmap.statusNote)) : null;
      const durationNote = data.roadmap.durationNote ? h('p', { class: 't-helper' }, digitsIn(data.roadmap.durationNote)) : null;
      return card({
        code: 'RM-04', title: t('timeline.title'), subtitle: t('timeline.sub'),
        body: h('div', { class: 'stack gap-3' }, gantt, legend, statusNote, durationNote),
        tableView: () => {
          const tbl = h('table', { class: 'table is-dense' }, h('caption', { class: 'sr-only' }, t('timeline.caption')));
          tbl.appendChild(h('thead', {}, h('tr', {}, ...[t('timeline.colId'), t('timeline.colName'), t('timeline.colStart'), t('timeline.colDuration'), t('timeline.colStatus')].map((x) => h('th', { scope: 'col' }, x)))));
          tbl.appendChild(h('tbody', {}, ...data.milestones.map((m) => h('tr', {}, h('td', {}, codeSpan(m.id)), h('td', {}, digitsIn(m.name || '—')), h('td', {}, t('timeline.monthValue', { n: fmt.num(m.month) })), h('td', {}, m.duration === null ? toBeAgreed() : durationText(m)), h('td', {}, label('roadmapStatus', m.status) || '—')))));
          return tbl;
        },
      });
    }

    function buildMilestoneTable(data) {
      if (!data.milestones.length) return null;
      const inputs = new Map();
      const values = () => { let sum = 0; let any = false; for (const inp of inputs.values()) { const v = parsePct(inp.value); if (Number.isFinite(v)) { sum += v; any = true; } } return { sum: Math.round(sum * 100) / 100, any }; };
      const table = h('table', { class: 'table milestone-table' }, h('caption', { class: 'sr-only' }, t('milestones.caption')));
      table.appendChild(h('thead', {}, h('tr', {}, ...[[t('milestones.id'), null], [t('milestones.deliverables'), null], [t('milestones.start'), 'align-center'], [t('milestones.duration'), null], [t('milestones.status'), null], [t('milestones.payment'), 'align-end']].map(([lbl, cls]) => h('th', { scope: 'col', class: cls }, lbl)))));
      const tbody = h('tbody');
      data.milestones.forEach((m) => {
        const id = `pay-${m.id}`;
        const errId = `${id}-err`;
        const input = h('input', { type: 'text', id, class: 'field-control', inputmode: 'decimal', autocomplete: 'off', dir: 'ltr', 'aria-label': t('milestones.paymentAria', { id: m.id, name: digitsIn(m.name || '') }), 'aria-describedby': errId, placeholder: t('milestones.paymentPlaceholder') });
        input.value = m.pct === null ? '' : String(m.pct);
        const err = h('span', { class: 'pay-error', id: errId, hidden: true }, glyph('critical', 12), h('span', {}, t('milestones.invalid', { min: fmt.num(0), max: fmt.num(100) })));
        const validate = () => { const v = parsePct(input.value); const bad = Number.isNaN(v); input.setAttribute('aria-invalid', bad ? 'true' : 'false'); input.closest('.field-cell')?.classList.toggle('is-invalid', bad); err.hidden = !bad; return v; };
        input.addEventListener('input', () => { validate(); const { sum, any } = values(); paintTotals(sum, any); });
        input.addEventListener('change', () => {
          const v = validate();
          if (Number.isNaN(v)) return; // invalid input is never saved and never clamped silently
          const current = safe(() => store.state.settings.platform.paymentPct[m.id], null);
          if ((current === null || current === undefined ? null : Number(current)) === v) return; // nothing changed
          const next = { ...(safe(() => store.state.settings.platform.paymentPct, {}) || {}), [m.id]: v };
          ownSave = JSON.stringify(next);
          store.setSettings({ platform: { paymentPct: { [m.id]: v } } });
          lastPayJson = safe(() => JSON.stringify(store.state.settings.platform.paymentPct || null), lastPayJson);
          const { sum, any } = values();
          const totalStr = fmt.pct(sum, 1);
          if (v === null) toast(t('milestones.cleared', { id: m.id, total: totalStr }), { tone: 'neutral' });
          else toast(Math.abs(sum - 100) < 1e-9 ? t('milestones.savedAll', { total: fmt.pct(100) }) : t('milestones.savedOne', { id: m.id, total: totalStr }), { tone: Math.abs(sum - 100) < 1e-9 ? 'good' : 'neutral' });
        });
        inputs.set(m.id, input);
        tbody.appendChild(h('tr', { 'data-key': m.id },
          h('td', {}, h('div', { class: 'stack', style: { gap: '2px' } }, codeSpan(m.id), h('span', { class: 't-body', style: { fontWeight: 600, fontSize: 'var(--fs-sm)' } }, digitsIn(m.name || '—')))),
          h('td', { 'data-label': t('milestones.deliverables') }, m.deliverables.length ? h('ul', { class: 'deliverables' }, ...m.deliverables.map((d) => h('li', {}, digitsIn(typeof d === 'string' ? d : (d && (d.text || d.title)) || '—')))) : h('span', { class: 't-helper' }, '—')),
          h('td', { class: 'align-center', 'data-label': t('milestones.start') }, h('span', { class: 'nowrap' }, t('timeline.monthValue', { n: fmt.num(m.month) }))),
          h('td', { 'data-label': t('milestones.duration') }, m.duration === null ? h('span', { class: 'tbd', title: data.roadmap.durationNote ? digitsIn(data.roadmap.durationNote) : undefined }, glyph('neutral', 12), h('span', {}, toBeAgreed())) : h('span', {}, durationText(m))),
          h('td', { 'data-label': t('milestones.status') }, badge(label('roadmapStatus', m.status) || '—', STATUS_TONE[m.status] || 'neutral')),
          h('td', { class: 'align-end field-cell', 'data-label': t('milestones.payment') }, h('div', { class: 'pay-cell' }, h('span', { class: 'roadmap-payment' }, input, h('span', { class: 't-helper', 'aria-hidden': 'true' }, pctSign())), err)),
        ));
      });
      table.appendChild(tbody);
      const totalRow = h('div', { class: ['roadmap-total', totalTone(data.total, data.anyPct) === 'good' ? 'is-ok' : 'is-off'] },
        h('span', {}, t('milestones.total')),
        h('span', { class: 'row gap-2', style: { alignItems: 'center' } }, h('span', { class: 'mono', 'data-pay-total': '' }, data.anyPct ? fmt.pct(data.total, 1) : '—'), totalBadge(data.total, data.anyPct)));
      return card({
        code: 'RM-05', title: t('milestones.title'), subtitle: data.roadmap.paymentNote ? digitsIn(data.roadmap.paymentNote) : '',
        body: h('div', { class: 'stack gap-3' }, h('div', { class: 'table-wrap' }, table), totalRow),
        footer: h('p', { class: 't-helper' }, t('milestones.footer', { total: fmt.pct(100) })),
      });
    }

    function buildPrincipleCard() {
      return card({
        code: 'RM-06', title: t('principle.title'), subtitle: t('principle.sub'),
        body: h('div', { class: 'stack gap-3' },
          h('div', { class: 'note', style: { '--tone': 'var(--accent)' } }, h('strong', {}, t('principle.lead')), ' ', t('principle.leadText')),
          h('div', { class: 'principle-grid' },
            h('div', { class: 'principle-col', style: { '--tone': 'var(--brand)' } }, h('h3', {}, svgIcon('download', 15), h('span', {}, t('principle.reads'))), h('ul', {}, ...READS.map((k) => h('li', {}, t(`principle.readList.${k}`))))),
            h('div', { class: 'principle-col', style: { '--tone': 'var(--accent)' } }, h('h3', {}, svgIcon('upload', 15), h('span', {}, t('principle.writes'))), h('ul', {}, ...WRITES.map((k) => h('li', {}, digitsIn(t(`principle.writeList.${k}`, { range: range100() }))))))),
          h('div', { class: 'note is-demo', style: { '--tone': 'var(--brand)' } }, t('principle.demo'))),
        footer: h('div', { class: 'row between wrap gap-2', style: { inlineSize: '100%' } }, h('span', { class: 't-helper' }, t('principle.footer')), button(t('principle.integrations'), { variant: 'ghost', size: 'sm', icon: 'link', onClick: () => router.navigate('integrations') })),
      });
    }

    /* ───────────────────────── build ───────────────────────── */

    function compose() {
      const data = collect();
      const frag = document.createDocumentFragment();
      frag.append(buildHead(data));
      if (!data.roadmap) { frag.append(emptyState({ icon: svgIcon('calendar', 32), title: t('timeline.empty') })); return frag; }
      frag.append(
        buildKpis(data),
        buildArchitecture(),
        h('div', { class: 'dom-row is-1-1' }, buildScopeCard(data), buildAssumptionsCard(data)),
        buildTimelineCard(data),
        buildMilestoneTable(data),
        buildPrincipleCard(),
      );
      return frag;
    }

    function focusPath() {
      const a = document.activeElement;
      if (!a || a === root || !root.contains(a)) return null;
      const path = []; let n = a;
      while (n && n !== root) { const parent = n.parentElement; if (!parent) return null; path.unshift(Array.prototype.indexOf.call(parent.children, n)); n = parent; }
      return path;
    }
    function restoreFocus(path) {
      let n = root;
      for (const i of path) { n = n && n.children ? n.children[i] : null; if (!n) return; }
      if (n && typeof n.focus === 'function') { try { n.focus({ preventScroll: true }); } catch { /* ignore */ } }
    }

    function build() {
      raf = 0;
      const keep = built ? focusPath() : null;
      const scroller = root.closest('.main') || document.scrollingElement;
      const top = scroller ? scroller.scrollTop : 0;
      let frag;
      try { frag = compose(); } catch (err) {
        console.warn('[roadmap] render failed', err);
        frag = errorState({ title: i18n.t('contracts.dom.states.errorTitle'), text: i18n.t('contracts.dom.states.errorText'), retry: () => schedule() });
      }
      root.replaceChildren(frag);
      if (!built) {
        built = true;
        if (motion && typeof motion.enter === 'function') motion.enter(Array.from(root.children), { y: 8 });
        return;
      }
      if (scroller && scroller.scrollTop !== top) scroller.scrollTop = top;
      if (keep) restoreFocus(keep);
    }

    function schedule() { if (!raf) raf = requestAnimationFrame(build); }

    const unsubs = [
      // Only the roadmap entity (and a full reset) can change this page.
      bus.on('store:change', (payload) => { const path = payload && payload.path ? String(payload.path) : '*'; if (path === '*' || path === 'platform' || /^platform\.roadmap/.test(path)) schedule(); }),
      bus.on('settings:change', (payload) => {
        const s = (payload && payload.settings) || store.state.settings || {};
        const numerals = s.numerals || 'latn';
        const payJson = safe(() => JSON.stringify((s.platform && s.platform.paymentPct) || null), 'null');
        if (numerals !== lastNumerals) { lastNumerals = numerals; lastPayJson = payJson; schedule(); return; }
        // Payment edits made on this page are already painted in place; only outside changes rebuild.
        if (payJson !== lastPayJson) { lastPayJson = payJson; if (ownSave === null) schedule(); }
        ownSave = null;
      }),
    ];

    build();

    return () => {
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      unsubs.forEach((u) => { try { if (typeof u === 'function') u(); } catch { /* ignore */ } });
      root.remove();
    };
  },
};
