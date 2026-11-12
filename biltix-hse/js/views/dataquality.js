/**
 * BILTIX Risk AI — view: Data quality & validation (js/views/dataquality.js) — PLT-02. Owner: B-PLATFORM.
 *
 * The data validation & cleansing layer: nothing reaches the AI engine before passing schema / de-duplication /
 * completeness / consistency checks. Honest framing (CONTRACT §5): the layer's figures are an illustrative,
 * simulated scenario (demo banner + "Illustrative values" tags); rule toggles and quarantine decisions are real
 * local state changes (store.updateValidationRule / store.resolveQuarantine) and are audited.
 *
 * Sections: head · demo banner · gate principle + 8-stage flow · six tiles · the three separate indicators of a
 * risk (severity vs model confidence vs input-data quality, with the live distribution of input-data quality over
 * the open risks) · quality by source (DQ-01) · rules (DQ-03) + pass rate (DQ-02) · quarantine queue (DQ-04).
 *
 * Live updates (C-4): validation counters patch tiles, the gate line, the source table (dataTable.update with
 * preserve + flash) and the chart in place; rule toggles swap the rules card; quarantine decisions swap the
 * quarantine card. First render only: motion.enter. Deep link `?section=sources|rules|quarantine|quality`.
 * Strings: dictionary 'dataquality' (js/i18n/dataquality.js). Data reaches the DOM only through textContent / h().
 */

import { i18n } from '../core/i18n.js';
import dict from '../i18n/dataquality.js';

i18n.register('dataquality', dict);

const STYLE_ID = 'view-dataquality-style';
const STYLE_TEXT = `
.view-dataquality .grid-12 { align-items: start; }
.view-dataquality .code { font-family: var(--font-mono); font-variant-numeric: tabular-nums; unicode-bidi: isolate; }
.view-dataquality .num { font-variant-numeric: tabular-nums; }
.view-dataquality .dq-anchor { scroll-margin-block-start: var(--space-4); }
@media (max-width: 959.98px) { .view-dataquality .dq-anchor { scroll-margin-block-start: calc(var(--appbar-h) + var(--space-4)); } }
.view-dataquality .dq-flow { display: flex; flex-direction: column; gap: var(--space-3); }
.view-dataquality .dq-trio { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: var(--space-3); margin: 0; padding: 0; list-style: none; }
@container card (max-width: 760px) { .view-dataquality .dq-trio { grid-template-columns: minmax(0, 1fr); } }
.view-dataquality .dq-trio > li { display: grid; grid-template-columns: 32px minmax(0, 1fr); gap: 10px; align-items: start; padding: 12px; border-radius: var(--radius-md); background: var(--bg-2); border: 1px solid var(--line); }
.view-dataquality .dq-trio-icon { inline-size: 32px; block-size: 32px; border-radius: 8px; display: grid; place-items: center; background: var(--bg-1); border: 1px solid var(--line); color: var(--brand-text); }
.view-dataquality .dq-trio-title { font-size: var(--fs-sm); font-weight: 600; color: var(--ink-1); margin: 0; }
.view-dataquality .dq-trio-text { font-size: var(--fs-xs); color: var(--ink-2); line-height: 1.6; margin: 0; }
.view-dataquality .dq-dist { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: var(--space-2); margin: 0; }
@container card (max-width: 620px) { .view-dataquality .dq-dist { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
.view-dataquality .dq-dist > div { display: flex; flex-direction: column; gap: 4px; padding: 10px 12px; border-radius: var(--radius-md); background: var(--bg-1); border: 1px solid var(--line); border-inline-start-width: 3px; min-inline-size: 0; }
.view-dataquality .dq-dist .is-high { border-inline-start-color: var(--good); }
.view-dataquality .dq-dist .is-medium { border-inline-start-color: var(--warning); }
.view-dataquality .dq-dist .is-low { border-inline-start-color: var(--critical); }
.view-dataquality .dq-dist .is-unknown { border-inline-start-color: var(--line-2); border-inline-start-style: dashed; }
.view-dataquality .dq-dist dt { font-size: var(--fs-xs); color: var(--ink-2); display: inline-flex; align-items: center; gap: 6px; }
.view-dataquality .dq-dist dd { margin: 0; font-size: var(--fs-lg); font-weight: 600; color: var(--ink-1); font-variant-numeric: tabular-nums; }
.view-dataquality .dq-switch { display: inline-flex; align-items: center; gap: 8px; justify-content: center; }
.view-dataquality .quarantine-actions .btn { min-block-size: 36px; }
@media (max-width: 599.98px) {
  .view-dataquality .chips.is-scroll { flex-wrap: nowrap; overflow-x: auto; scroll-snap-type: x proximity; -webkit-overflow-scrolling: touch; padding-block-end: 4px; scrollbar-width: thin; }
  .view-dataquality .chips.is-scroll > .chip { flex: none; scroll-snap-align: start; }
}
`;
const FLOW_STAGES = ['مُلتقط', 'مُتحقق', 'في بحيرة البيانات', 'مُقيَّم', 'مُصنَّف', 'تنبيه', 'مهمة', 'مغلق'];
const GATE_INDEX = 1;
const RULE_ICON = { schema: 'list', dedupe: 'copy', completeness: 'badge-check', consistency: 'sliders' };
const Q_TONE = { 'معلّق': 'warning', 'مُصحح': 'good', 'مرفوض': 'neutral' };
const Q_FILTERS = ['all', 'معلّق', 'مُصحح', 'مرفوض'];
const Q_PAGE = 6;
const SECTION_IDS = { sources: 'dq-sources', rules: 'dq-rules', quarantine: 'dq-quarantine', quality: 'dq-trio' };
const DQ_LEVELS = ['high', 'medium', 'low'];
const DQ_TONE = { high: 'good', medium: 'warning', low: 'critical', unknown: 'neutral' };

/** Free text → the active numeral system; Latin alphanumeric tokens (2B, P6, PN10) keep their ASCII digits. */
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
const num = (v, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);
const pctTone = (p, good = 97, warn = 92) => (p >= good ? 'good' : (p >= warn ? 'warning' : 'critical'));
const setText = (el, text) => { if (el && el.textContent !== text) el.textContent = text; };
const brand = (s) => String(s ?? '').replace(/\bBiltix\b/g, 'BILTIX');

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

export default {
  id: 'dataquality',
  code: 'PLT-02',
  get title() { return i18n.has('core.nav.dataquality.title') ? i18n.t('core.nav.dataquality.title') : 'جودة البيانات وطبقة التحقق'; },
  icon: 'badge-check',

  render(container, ctx) {
    const { store, bus, fmt, charts, components, psel, router } = ctx;
    const status = ctx.status || (typeof window !== 'undefined' && window.biltix && window.biltix.status) || null;
    const motion = ctx.motion || components.motion || null;
    const { h, card, statTile, badge, dataTable, button, toast, emptyState, svgIcon, glyph, statusBadge } = components;
    const t = (k, p) => i18n.t(k, p);
    const tn = (k, n, p) => i18n.tn(k, n, p);
    const now = () => (typeof store.now === 'function' ? store.now() : new Date());

    ensureStyle();
    const root = h('section', { class: 'view view-dataquality' });
    container.appendChild(root);

    let raf = 0;
    let firstPaint = true;
    let quarantineFilter = 'all';
    let quarantineLimit = Q_PAGE;
    let restoreFocusId = null;
    const params = ctx.params || {};
    let pendingSection = SECTION_IDS[params.section] && /[?&]section=/.test(location.hash || '') ? params.section : null;
    const live = { headBadge: null, lastBatch: null, gate: null, tiles: {}, sourcesTable: null, passChart: null, passCard: null, rulesCard: null, quarantineCard: null, dist: null };

    /* ───────────────────────── helpers ───────────────────────── */

    const pct = (v, d = 1) => fmt.pct(num(v), d);
    const relSafe = (iso) => { const ms = Date.parse(iso); if (!Number.isFinite(ms)) return '—'; return fmt.relative(new Date(Math.min(ms, now().getTime())), now()); };
    const sourceName = (s) => brand(i18n.L(s, 'name', 'validationSources') || s.name || s.id || '—');
    const ruleName = (r) => digitsIn(fmt, i18n.L(r, 'name', 'validationRules') || r.name || r.id || '—');
    const illustrative = () => h('span', { class: 'sim-tag' }, svgIcon('flask', 11), t('dataquality.illustrative'));

    function makeChart(name, opts) {
      if (!charts || typeof charts[name] !== 'function') return null;
      try { const c = charts[name](opts); return c && c.el instanceof Node ? c : null; } catch { return null; }
    }
    function simpleTable(headers, rows) {
      const table = h('table', { class: 'table is-dense' });
      table.appendChild(h('thead', {}, h('tr', {}, ...headers.map((x) => h('th', { scope: 'col' }, String(x))))));
      table.appendChild(h('tbody', {}, ...rows.map((r) => h('tr', {}, ...r.map((c) => h('td', {}, c instanceof Node ? c : String(c ?? '—')))))));
      return table;
    }
    function meter(value, { max = 100, label = '' } = {}) {
      const v = Math.max(0, Math.min(max, num(value)));
      if (typeof components.progress === 'function') return components.progress({ value: v, max, tone: pctTone(v), label });
      return h('span', { class: 'sr-only' }, label);
    }
    function switchBtn({ id, on, label, onToggle }) {
      return h('button', { type: 'button', id, role: 'switch', class: ['switch', on ? 'is-on' : null], 'aria-checked': on ? 'true' : 'false', 'aria-label': label, title: label, onClick: () => onToggle(!on) });
    }
    function patchTile(el, { value, hint, tone }) {
      if (!el || !el.isConnected) return;
      setText(el.querySelector('.tile-value'), value);
      if (hint !== undefined) { setText(el.querySelector('.tile-hint'), hint); if (el.title !== hint) el.title = hint; }
      if (tone !== undefined) {
        const current = Array.from(el.classList).find((c) => c.startsWith('tone-')) || null;
        const next = tone ? `tone-${tone}` : null;
        if (current !== next) { if (current) el.classList.remove(current); if (next) el.classList.add(next); if (next) el.dataset.tone = tone; else delete el.dataset.tone; }
      }
    }

    function setRuleEnabled(rule, enabled) {
      if (typeof store.updateValidationRule === 'function') { store.updateValidationRule(rule.id, { enabled }); return; }
      store.update((s) => { const r = arr(s.platform && s.platform.validation && s.platform.validation.rules).find((x) => x.id === rule.id); if (r) r.enabled = enabled; return 'platform.validation.rules'; });
    }
    function resolveQuarantine(id, st) {
      if (typeof store.resolveQuarantine === 'function') { store.resolveQuarantine(id, st); return; }
      store.update((s) => { const q = arr(s.platform && s.platform.validation && s.platform.validation.quarantine).find((x) => x.id === id); if (q) { q.status = st; q.resolvedAt = new Date().toISOString(); } return 'platform.validation.quarantine'; });
    }

    /* ───────────────────────── data ───────────────────────── */

    function collect() {
      const state = store.state;
      const plat = safe(() => psel.platform(state), null) || state.platform || {};
      const validation = plat.validation || {};
      const sourcesList = arr(validation.sources);
      const rules = arr(validation.rules);
      const quarantine = arr(validation.quarantine).slice().sort((a, b) => (Date.parse(b.at) || 0) - (Date.parse(a.at) || 0));
      let summary = safe(() => psel.validationSummary(state), null);
      if (!summary || !Number.isFinite(Number(summary.recordsIn))) {
        const recordsIn = sourcesList.reduce((a, s) => a + num(s.recordsIn), 0);
        const passed = sourcesList.reduce((a, s) => a + num(s.passed), 0);
        summary = { recordsIn, passed, rejected: sourcesList.reduce((a, s) => a + num(s.rejected), 0), deduplicated: sourcesList.reduce((a, s) => a + num(s.deduplicated), 0), passRatePct: recordsIn ? (passed / recordsIn) * 100 : 0, completenessPct: 0, consistencyPct: 0, quarantineOpen: quarantine.filter((q) => q.status === 'معلّق').length, bySource: sourcesList };
      }
      const bySource = (Array.isArray(summary.bySource) && summary.bySource.length ? summary.bySource : sourcesList).map((s) => ({ ...s, passRatePct: num(s.passRatePct, num(s.recordsIn) ? (num(s.passed) / num(s.recordsIn)) * 100 : 0) }));
      const byId = (id) => sourcesList.find((x) => x.id === id) || null;
      const reasons = Object.values(quarantine.filter((q) => q.status === 'معلّق').reduce((acc, q) => {
        const k = q.sourceId || 'unknown';
        const s = byId(q.sourceId);
        acc[k] = acc[k] || { id: k, label: s ? sourceName(s) : String(q.sourceId || '—'), value: 0 };
        acc[k].value += 1;
        return acc;
      }, {})).sort((a, b) => b.value - a.value);
      const enabledRules = rules.filter((r) => r.enabled !== false).length;
      const hitsToday = rules.reduce((a, r) => a + num(r.hitsToday), 0);
      const lastBatch = sourcesList.map((s) => Date.parse(s.lastBatch) || 0).reduce((a, b) => Math.max(a, b), 0);
      // Input-data quality of the open risks (one definition: the risk's own dataQuality from the validation layer).
      const open = arr(safe(() => psel.openAiRisks(state, store.filters, now()), []));
      const dist = { high: 0, medium: 0, low: 0, unknown: 0 };
      open.forEach((r) => { const lvl = r && r.dataQuality && r.dataQuality.level; dist[DQ_LEVELS.includes(lvl) ? lvl : 'unknown'] += 1; });
      return { state, validation, sourcesList, rules, quarantine, summary, bySource, byId, reasons, enabledRules, hitsToday, lastBatch: lastBatch ? new Date(lastBatch).toISOString() : null, dist, openCount: open.length };
    }

    const sourceRows = (data) => data.bySource.map((s) => ({ ...s, id: s.id || s.name, _name: sourceName(s) }));
    const passItems = (data) => data.bySource.slice().sort((a, b) => a.passRatePct - b.passRatePct).map((s) => ({ id: s.id || s.name, label: sourceName(s), value: Number(num(s.passRatePct).toFixed(1)) }));
    const gateSummary = (s) => t('dataquality.gateSummary', { in: fmt.num(num(s.recordsIn)), passed: fmt.num(num(s.passed)), rate: pct(s.passRatePct), rejected: fmt.num(num(s.rejected)), dedup: fmt.num(num(s.deduplicated)) });

    /* ───────────────────────── sections ───────────────────────── */

    function buildHead(data) {
      const s = data.summary;
      live.headBadge = badge(t('dataquality.passRate', { value: pct(s.passRatePct) }), pctTone(num(s.passRatePct)));
      live.lastBatch = h('span', { title: data.lastBatch ? riyadhDateTime(fmt, data.lastBatch) : '' }, data.lastBatch ? relSafe(data.lastBatch) : '—');
      const mode = safe(() => status.mode(store.state), 'demo');
      return h('div', { class: 'view-head' },
        h('div', { class: 'view-head-text' },
          h('span', { class: 'code-tag' }, 'PLT-02'),
          h('h1', { tabindex: '-1' }, t('dataquality.title')),
          h('p', { class: 'view-lead' }, t('dataquality.lead'))),
        h('div', { class: 'view-actions' },
          statusBadge(mode === 'demo' ? 'demo' : 'not_connected'),
          live.headBadge,
          h('span', { class: 'text-xs muted' }, t('dataquality.lastBatch', { time: '' }), live.lastBatch),
          button(t('dataquality.auditLog'), { variant: 'ghost', size: 'sm', icon: 'sliders', onClick: () => router.navigate('engine', { section: 'audit' }) })));
    }

    function buildBanner() {
      return h('div', { class: ['note', 'is-demo'], role: 'note', style: { '--tone': 'var(--brand)' } },
        h('span', { class: 'row gap-2', style: { alignItems: 'flex-start' } }, svgIcon('flask', 16), h('span', {}, t('dataquality.banner'))));
    }

    function buildPrinciple(data) {
      live.gate = h('span', { class: 'text-xs muted' }, gateSummary(data.summary));
      const gate = h('div', { class: 'validation-gate', role: 'note' },
        svgIcon('badge-check', 22),
        h('div', { class: 'stack', style: { gap: '2px' } },
          h('span', {}, h('strong', {}, t('dataquality.gateTitle')), ' ', t('dataquality.gateText')),
          live.gate));
      const stepper = h('ol', { class: ['stepper', 'is-sm', 'flow-gate'], 'aria-label': t('dataquality.flowAria') });
      FLOW_STAGES.forEach((stage, i) => {
        const dot = h('span', { class: 'step-dot', 'aria-hidden': 'true' });
        if (i < GATE_INDEX) dot.appendChild(glyph('good', 12));
        else if (i === GATE_INDEX) dot.appendChild(svgIcon('badge-check', 12));
        const li = h('li', { class: ['step', i < GATE_INDEX ? 'is-done' : null, i === GATE_INDEX ? 'is-current' : null], 'aria-current': i === GATE_INDEX ? 'step' : undefined }, dot, h('span', { class: 'step-label' }, i18n.label('flowStage', stage)));
        if (i === GATE_INDEX) li.appendChild(h('span', { class: 'pipeline-gate', style: { marginBlockStart: '4px' } }, svgIcon('badge-check', 12), h('span', {}, t('dataquality.gateLabel'))));
        stepper.appendChild(li);
      });
      return h('div', { class: 'dq-flow' }, gate, stepper);
    }

    function tileSpecs(data) {
      const s = data.summary;
      const qOpen = num(s.quarantineOpen);
      return {
        recordsIn: { label: t('dataquality.tiles.recordsIn'), value: num(s.recordsIn), icon: 'erp', hint: tn('dataquality.tiles.recordsInHint', data.sourcesList.length) },
        passed: { label: t('dataquality.tiles.passed'), value: num(s.passed), icon: 'badge-check', tone: pctTone(num(s.passRatePct)), hint: t('dataquality.tiles.passedHint', { rate: pct(s.passRatePct) }) },
        dedup: { label: t('dataquality.tiles.dedup'), value: num(s.deduplicated), icon: 'copy', hint: t('dataquality.tiles.dedupHint') },
        completeness: { label: t('dataquality.tiles.completeness'), value: pct(s.completenessPct), icon: 'list', tone: pctTone(num(s.completenessPct), 97, 93), hint: t('dataquality.tiles.completenessHint') },
        consistency: { label: t('dataquality.tiles.consistency'), value: pct(s.consistencyPct), icon: 'sliders', tone: pctTone(num(s.consistencyPct), 97, 93), hint: t('dataquality.tiles.consistencyHint') },
        quarantine: { label: t('dataquality.tiles.quarantine'), value: qOpen, icon: 'alert', tone: qOpen ? 'warning' : 'good', hint: qOpen ? t('dataquality.tiles.quarantineHint') : t('dataquality.tiles.quarantineNone'), onClick: () => { quarantineFilter = 'معلّق'; quarantineLimit = Q_PAGE; refreshQuarantine(); scrollToSection('quarantine'); } },
      };
    }
    function buildTiles(data) {
      live.tiles = {};
      const row = h('div', { class: 'kpi-row' });
      Object.entries(tileSpecs(data)).forEach(([key, spec]) => { const el = statTile(spec); live.tiles[key] = el; row.appendChild(el); });
      return row;
    }
    function patchTiles(data) {
      Object.entries(tileSpecs(data)).forEach(([key, spec]) => patchTile(live.tiles[key], { value: typeof spec.value === 'number' ? fmt.num(spec.value) : String(spec.value), hint: spec.hint, tone: spec.tone || null }));
    }

    function distBody(data) {
      const lvl = (key) => h('div', { class: `is-${key}` },
        h('dt', {}, glyph(DQ_TONE[key], 12), h('span', {}, key === 'unknown' ? t('dataquality.trio.unknown') : i18n.label('dataQualityLevel', key))),
        h('dd', {}, tn('dataquality.trio.risks', data.dist[key])));
      return h('dl', { class: 'dq-dist', 'aria-label': t('dataquality.trio.distributionAria') }, ...['high', 'medium', 'low', 'unknown'].map(lvl));
    }
    function buildTrio(data) {
      const item = (icon, title, text) => h('li', {}, h('span', { class: 'dq-trio-icon', 'aria-hidden': 'true' }, svgIcon(icon, 16)), h('div', { class: 'stack', style: { gap: '4px' } }, h('p', { class: 'dq-trio-title' }, title), h('p', { class: 'dq-trio-text' }, text)));
      live.dist = h('div', {}, distBody(data));
      return card({
        id: SECTION_IDS.quality, code: 'DQ-00', title: t('dataquality.trio.title'), subtitle: t('dataquality.trio.sub'), className: 'dq-anchor',
        body: h('div', { class: 'stack gap-4' },
          h('ul', { class: 'dq-trio' },
            item('alert', t('dataquality.trio.severity'), t('dataquality.trio.severityText', { k: fmt.num(4), min: fmt.num(4), max: fmt.num(100) })),
            item('sparkles', t('dataquality.trio.confidence'), t('dataquality.trio.confidenceText')),
            item('badge-check', t('dataquality.trio.quality'), t('dataquality.trio.qualityText'))),
          h('div', { class: 'stack gap-2' }, h('span', { class: 't-label' }, t('dataquality.trio.distribution')), live.dist)),
      });
    }

    function buildSourcesCard(data) {
      const table = dataTable({
        dense: true, pageSize: 0, stickyFirst: true, emptyText: t('dataquality.sources.empty'), caption: t('dataquality.sources.caption'),
        columns: [
          { key: '_name', label: t('dataquality.sources.source'), priority: 'high', render: (r) => h('span', { class: 'row gap-2', style: { alignItems: 'flex-start' } }, svgIcon('erp', 14), h('span', { style: { overflowWrap: 'anywhere' } }, r._name)) },
          { key: 'recordsIn', label: t('dataquality.sources.recordsIn'), align: 'end', priority: 'high', render: (r) => h('span', { class: 'num' }, fmt.num(num(r.recordsIn))) },
          { key: 'passed', label: t('dataquality.sources.passed'), align: 'end', priority: 'medium', render: (r) => h('span', { class: 'num' }, fmt.num(num(r.passed))) },
          { key: 'rejected', label: t('dataquality.sources.rejected'), align: 'end', priority: 'medium', render: (r) => h('span', { class: ['num', num(r.rejected) ? 'tone-warning' : null], style: num(r.rejected) ? { color: 'var(--warning-text)' } : undefined }, fmt.num(num(r.rejected))) },
          { key: 'deduplicated', label: t('dataquality.sources.deduplicated'), align: 'end', priority: 'low', render: (r) => h('span', { class: 'num' }, fmt.num(num(r.deduplicated))) },
          { key: 'completenessPct', label: t('dataquality.sources.completeness'), width: 140, priority: 'medium', render: (r) => h('div', { class: 'progress-row' }, meter(r.completenessPct, { label: t('dataquality.sources.meterAria', { metric: t('dataquality.sources.completeness'), source: r._name }) }), h('span', { class: 'progress-value num' }, pct(r.completenessPct))), sortValue: (r) => num(r.completenessPct) },
          { key: 'consistencyPct', label: t('dataquality.sources.consistency'), width: 140, priority: 'low', render: (r) => h('div', { class: 'progress-row' }, meter(r.consistencyPct, { label: t('dataquality.sources.meterAria', { metric: t('dataquality.sources.consistency'), source: r._name }) }), h('span', { class: 'progress-value num' }, pct(r.consistencyPct))), sortValue: (r) => num(r.consistencyPct) },
          { key: 'lastBatch', label: t('dataquality.sources.lastBatch'), priority: 'low', render: (r) => h('span', { class: 'text-xs nowrap', title: riyadhDateTime(fmt, r.lastBatch) }, relSafe(r.lastBatch)), sortValue: (r) => Date.parse(r.lastBatch) || 0 },
        ],
        rows: sourceRows(data), initialSort: { key: 'recordsIn', dir: 'desc' },
      });
      live.sourcesTable = table;
      return card({ id: SECTION_IDS.sources, code: 'DQ-01', title: t('dataquality.sources.title'), subtitle: t('dataquality.sources.sub'), className: 'dq-anchor', actions: [illustrative()], body: table.el });
    }

    function buildPassRateCard(data) {
      const items = passItems(data);
      const chart = items.length ? makeChart('barChart', { items, horizontal: true, height: Math.max(160, items.length * 30 + 40), valueFormat: (v) => fmt.pct(v, 1), color: 'var(--s1)', showValues: true, maxBars: 14, sorted: false, ariaLabel: t('dataquality.passChart.aria') }) : null;
      live.passChart = chart;
      const weakest = items[0];
      const el = card({
        code: 'DQ-02', title: t('dataquality.passChart.title'), subtitle: weakest ? t('dataquality.passChart.subWeakest', { name: weakest.label }) : t('dataquality.passChart.sub'),
        className: 'col-span-5',
        actions: [illustrative()],
        body: items.length ? (chart ? chart.el : emptyState({ title: t('dataquality.chartUnavailable'), text: t('dataquality.chartUnavailableText') })) : emptyState({ title: t('dataquality.passChart.empty') }),
        tableView: items.length ? () => (chart && typeof chart.table === 'function' ? safe(() => chart.table(), null) : null) || simpleTable([t('dataquality.passChart.colSource'), t('dataquality.passChart.colRate')], items.map((i) => [i.label, fmt.pct(i.value, 1)])) : null,
      });
      live.passCard = el;
      return el;
    }

    function buildRulesCard(data) {
      const table = dataTable({
        dense: true, pageSize: 0, stickyFirst: true, emptyText: t('dataquality.rules.empty'), caption: t('dataquality.rules.caption'),
        columns: [
          { key: 'name', label: t('dataquality.rules.rule'), priority: 'high', render: (r) => h('span', { class: 'semibold', title: i18n.has(`dataquality.rules.typeHint.${r.type}`) ? t(`dataquality.rules.typeHint.${r.type}`) : undefined, style: { opacity: r.enabled === false ? '.6' : '1' } }, ruleName(r)), sortValue: (r) => ruleName(r) },
          { key: 'type', label: t('dataquality.rules.type'), priority: 'low', render: (r) => badge(i18n.label('validationRuleType', r.type), 'neutral', { icon: RULE_ICON[r.type] || 'list' }) },
          { key: 'hitsToday', label: t('dataquality.rules.hits'), align: 'end', priority: 'medium', render: (r) => h('span', { class: 'num' }, fmt.num(num(r.hitsToday))), sortValue: (r) => num(r.hitsToday) },
          { key: 'enabled', label: t('dataquality.rules.enabled'), align: 'center', sortable: false, priority: 'high', render: (r) => {
            const on = r.enabled !== false;
            const name = ruleName(r);
            return h('span', { class: 'dq-switch' },
              switchBtn({ id: `rule-${r.id}`, on, label: on ? t('dataquality.rules.disable', { name }) : t('dataquality.rules.enable', { name }), onToggle: (next) => {
                restoreFocusId = `rule-${r.id}`;
                setRuleEnabled(r, next);
                toast(next ? t('dataquality.rules.enabledToast', { name }) : t('dataquality.rules.disabledToast', { name }), { tone: next ? 'good' : 'warning' });
              } }),
              h('span', { class: 'text-xs muted', 'aria-hidden': 'true' }, on ? t('dataquality.rules.yes') : t('dataquality.rules.no')));
          } },
        ],
        rows: data.rules, initialSort: { key: 'hitsToday', dir: 'desc' },
      });
      const el = card({
        id: SECTION_IDS.rules, code: 'DQ-03', title: t('dataquality.rules.title'), subtitle: tn('dataquality.rules.sub', data.hitsToday),
        className: ['col-span-7', 'dq-anchor'].join(' '),
        actions: [badge(t('dataquality.rules.enabledCount', { on: fmt.num(data.enabledRules), total: fmt.num(data.rules.length) }), data.enabledRules === data.rules.length ? 'good' : 'warning')],
        body: table.el,
      });
      live.rulesCard = el;
      return el;
    }

    function quarantineItem(data, q) {
      const ref = q.recordRef || q.id;
      const actions = h('div', { class: 'quarantine-actions' });
      if (q.status === 'معلّق') {
        actions.append(
          button(t('dataquality.quarantine.correct'), { variant: 'outline', size: 'sm', icon: glyph('good', 14), onClick: () => { restoreFocusId = SECTION_IDS.quarantine; resolveQuarantine(q.id, 'مُصحح'); toast(t('dataquality.quarantine.correctedToast', { ref }), { tone: 'good' }); }, attrs: { 'aria-label': t('dataquality.quarantine.correctAria', { ref }) } }),
          button(t('dataquality.quarantine.reject'), { variant: 'ghost', size: 'sm', icon: glyph('close', 14), onClick: () => { restoreFocusId = SECTION_IDS.quarantine; resolveQuarantine(q.id, 'مرفوض'); toast(t('dataquality.quarantine.rejectedToast', { ref }), { tone: 'neutral' }); }, attrs: { 'aria-label': t('dataquality.quarantine.rejectAria', { ref }) } }));
      } else {
        actions.appendChild(badge(i18n.label('quarantineStatus', q.status), Q_TONE[q.status] || 'neutral'));
      }
      const src = data.byId(q.sourceId);
      return h('li', { class: 'quarantine-item', 'data-status': q.status || 'معلّق' },
        h('div', { class: 'quarantine-main' },
          h('span', { class: 'row gap-2 wrap' }, h('span', { class: 'quarantine-ref code mono nowrap', dir: 'ltr' }, ref), q.status === 'معلّق' ? badge(i18n.label('quarantineStatus', 'معلّق'), 'warning') : null),
          h('span', { class: 'quarantine-reason' }, digitsIn(fmt, i18n.L(q, 'reason', 'quarantine') || q.reason || '—'))),
        actions,
        h('div', { class: 'quarantine-meta' },
          h('span', {}, svgIcon('erp', 11), ' ', src ? sourceName(src) : String(q.sourceId || '—')),
          h('span', { title: riyadhDateTime(fmt, q.at) }, t('dataquality.quarantine.quarantined', { time: relSafe(q.at) })),
          q.resolvedAt ? h('span', { title: riyadhDateTime(fmt, q.resolvedAt) }, t('dataquality.quarantine.resolved', { time: relSafe(q.resolvedAt) }), q.resolvedBy ? ` — ${i18n.term(q.resolvedBy)}` : '') : null));
    }

    function buildQuarantineCard(data) {
      const all = data.quarantine;
      const filtered = quarantineFilter === 'all' ? all : all.filter((q) => q.status === quarantineFilter);
      const counts = Object.fromEntries(Q_FILTERS.map((f) => [f, f === 'all' ? all.length : all.filter((q) => q.status === f).length]));
      const chips = h('div', { class: 'chip-group chips is-scroll', role: 'group', 'aria-label': t('dataquality.quarantine.filterAria') }, ...Q_FILTERS.map((f) => {
        const active = quarantineFilter === f;
        const tone = Q_TONE[f];
        return h('button', { type: 'button', class: ['chip', 'is-sm', tone ? `tone-${tone}` : null, active ? 'is-active' : null], 'aria-pressed': active ? 'true' : 'false', onClick: () => { quarantineFilter = f; quarantineLimit = Q_PAGE; refreshQuarantine(); } },
          tone ? glyph(tone, 12) : null, h('span', {}, f === 'all' ? t('dataquality.quarantine.all') : i18n.label('quarantineStatus', f)), h('span', { class: 'chip-count' }, fmt.num(counts[f])));
      }));
      const reasonsSeg = data.reasons.length ? makeChart('segmentedBar', { parts: data.reasons.slice(0, 8).map((r, i) => ({ id: r.id, label: r.label, value: r.value, color: safe(() => charts.paletteFor(i), `var(--s${i + 1})`) })), tall: false, valueFormat: (v) => fmt.num(v), ariaLabel: t('dataquality.quarantine.bySource') }) : null;
      const shown = filtered.slice(0, quarantineLimit);
      const list = shown.length
        ? h('ul', { class: 'quarantine-list', 'aria-label': t('dataquality.quarantine.listAria') }, ...shown.map((q) => quarantineItem(data, q)))
        : emptyState({ icon: glyph('good', 32), title: quarantineFilter === 'all' ? t('dataquality.quarantine.emptyAll') : t('dataquality.quarantine.emptyFiltered') });
      const more = filtered.length > shown.length
        ? h('div', { class: 'row', style: { justifyContent: 'center' } }, button(t('dataquality.quarantine.showAll', { count: fmt.num(filtered.length) }), { variant: 'ghost', size: 'sm', icon: 'chevron-down', onClick: () => { quarantineLimit = filtered.length; restoreFocusId = 'dq-quarantine-more'; refreshQuarantine(); }, attrs: { id: 'dq-quarantine-more' } }))
        : (filtered.length > Q_PAGE ? h('div', { class: 'row', style: { justifyContent: 'center' } }, button(t('dataquality.quarantine.showLess'), { variant: 'ghost', size: 'sm', icon: 'chevron-up', onClick: () => { quarantineLimit = Q_PAGE; refreshQuarantine(); } })) : null);
      const el = card({
        id: SECTION_IDS.quarantine, code: 'DQ-04', title: t('dataquality.quarantine.title'), subtitle: t('dataquality.quarantine.sub'), className: 'dq-anchor',
        actions: [badge(tn('dataquality.quarantine.pending', counts['معلّق']), counts['معلّق'] ? 'warning' : 'good')],
        body: h('div', { class: 'stack gap-3' },
          chips,
          reasonsSeg ? h('div', { class: 'stack gap-1' }, h('span', { class: 'text-xs muted' }, t('dataquality.quarantine.bySource')), reasonsSeg.el) : null,
          list,
          more),
        tableView: reasonsSeg ? () => (typeof reasonsSeg.table === 'function' ? safe(() => reasonsSeg.table(), null) : null) || simpleTable([t('dataquality.quarantine.colSource'), t('dataquality.quarantine.colPending')], data.reasons.map((r) => [r.label, fmt.num(r.value)])) : null,
        footer: h('p', { class: 'text-xs muted', style: { margin: 0 } }, t('dataquality.quarantine.footer')),
      });
      el.tabIndex = -1; // focus target after a decision removes the pressed button
      live.quarantineCard = el;
      return el;
    }

    /* ───────────────────────── targeted refreshes ───────────────────────── */

    function restoreFocus() {
      if (!restoreFocusId) return;
      const el = root.querySelector(`#${CSS.escape(restoreFocusId)}`);
      restoreFocusId = null;
      if (el) { try { el.focus({ preventScroll: true }); } catch { /* ignore */ } }
    }
    function scrollToSection(section) {
      requestAnimationFrame(() => {
        const el = root.querySelector(`#${SECTION_IDS[section]}`);
        if (!el) return;
        const smooth = motion && typeof motion.enabled === 'function' && motion.enabled();
        el.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto', block: 'start' });
      });
    }
    function patchCounters() {
      if (raf) return;
      if (!live.sourcesTable || !live.sourcesTable.el.isConnected) { schedule(); return; }
      const data = collect();
      const s = data.summary;
      const headTone = pctTone(num(s.passRatePct));
      const nextBadge = badge(t('dataquality.passRate', { value: pct(s.passRatePct) }), headTone);
      if (live.headBadge && (live.headBadge.textContent !== nextBadge.textContent || live.headBadge.dataset.tone !== headTone)) { live.headBadge.replaceWith(nextBadge); live.headBadge = nextBadge; }
      setText(live.lastBatch, data.lastBatch ? relSafe(data.lastBatch) : '—');
      setText(live.gate, gateSummary(s));
      patchTiles(data);
      live.sourcesTable.update(sourceRows(data), { preserve: true, flash: true });
      const items = passItems(data);
      if (live.passChart && typeof live.passChart.update === 'function') { try { live.passChart.update({ items }); } catch { /* keep */ } }
      if (live.passCard) { const sub = live.passCard.querySelector('.card-sub'); const weakest = items[0]; if (weakest) setText(sub, t('dataquality.passChart.subWeakest', { name: weakest.label })); }
    }
    function refreshRules() {
      if (raf) return;
      if (!live.rulesCard || !live.rulesCard.isConnected) { schedule(); return; }
      // buildRulesCard() re-points live.rulesCard at the card it builds, so keep the mounted card to replace.
      const mounted = live.rulesCard;
      const data = collect();
      mounted.replaceWith(buildRulesCard(data));
      patchTiles(data);
      restoreFocus();
    }
    function refreshQuarantine() {
      if (raf) return;
      if (!live.quarantineCard || !live.quarantineCard.isConnected) { schedule(); return; }
      // buildQuarantineCard() re-points live.quarantineCard at the card it builds, so keep the mounted card to replace.
      const mounted = live.quarantineCard;
      const data = collect();
      mounted.replaceWith(buildQuarantineCard(data));
      patchTiles(data);
      restoreFocus();
    }
    function refreshDist() {
      if (!live.dist || !live.dist.isConnected) return;
      live.dist.replaceChildren(distBody(collect()));
    }

    /* ───────────────────────── build ───────────────────────── */

    function build() {
      raf = 0;
      const data = collect();
      const sections = [
        buildBanner(),
        buildPrinciple(data),
        buildTiles(data),
        buildTrio(data),
        buildSourcesCard(data),
        h('div', { class: 'grid-12' }, buildRulesCard(data), buildPassRateCard(data)),
        buildQuarantineCard(data),
      ];
      root.replaceChildren(buildHead(data), ...sections);
      if (firstPaint && motion && typeof motion.enter === 'function') motion.enter(sections, { y: 8, stagger: 0.032 });
      firstPaint = false;
      restoreFocus();
      if (pendingSection) {
        const section = pendingSection; pendingSection = null;
        scrollToSection(section);
        try { history.replaceState(history.state, '', router && typeof router.href === 'function' ? router.href('dataquality') : '#/dataquality'); } catch { /* ignore */ }
      }
    }
    function schedule() { if (!raf) raf = requestAnimationFrame(build); }

    const unsubs = [
      bus.on('store:change', (payload) => {
        const path = payload && payload.path ? String(payload.path) : '*';
        if (path === '*') { schedule(); return; }
        if (/^settings/.test(path)) return;
        if (/^platform\.aiRisks/.test(path)) { refreshDist(); return; }
        if (!/^platform\.validation/.test(path)) return;
        if (/^platform\.validation\.rules/.test(path)) { refreshRules(); return; }
        if (/^platform\.validation\.quarantine/.test(path)) { refreshQuarantine(); return; }
        patchCounters();
      }),
      bus.on('filters:change', () => refreshDist()),
      bus.on('settings:change', () => schedule()),
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
