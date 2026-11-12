/**
 * BILTIX Risk AI — HSE pillar — SEC-08 ISO 45001 compliance (js/views/compliance.js). Owner: B-HSE2 (v3).
 *
 * Four executive metrics (overall score, clauses meeting the 85 % target, open documented gaps, legal
 * requirements compliant), the overall ring with the weakest clauses, a static spider of clauses 4–10
 * against the target, clause cards with ring meters and expandable sub-clause gap lists, the legal register
 * (dataTable → drawer) and document control (clause 7.5). Scores come from sel.isoScores / sel.isoOverall.
 *
 * Document control: the seed has no documents collection, so the register is derived deterministically
 * from a fixed catalogue of HSE documents mapped to the sub-clause that governs each (status follows that
 * sub-clause's score and open gaps). When `state.documents` exists it is used instead.
 *
 * Bilingual (CONTRACT §4): strings from 'compliance' (js/i18n/compliance.js); clause text via
 * i18n.localize(…, 'isoClauses'); legal text via i18n.L(…, 'legalRegister'); statuses via i18n.label.
 */

import { i18n, t, tn } from '../core/i18n.js';
import dict from '../i18n/compliance.js';

i18n.register('compliance', dict);

const TARGET = 85;
const WARN_FLOOR = 70;
const DAY_MS = 86_400_000;
/** Isolated so a number next to it never reorders inside Arabic text. */
const STANDARD = '\u2066ISO 45001:2018\u2069';
const LEGAL_TONE = { 'ممتثل': 'good', 'جزئي': 'warning', 'فجوة': 'critical' };
const LEGAL_ORDER = { 'فجوة': 0, 'جزئي': 1, 'ممتثل': 2 };
const DOC_TONE = { valid: 'good', review: 'warning', expired: 'critical' };
const DOC_CATALOGUE = [
  { code: 'POL-01', clause: '5.2' }, { code: 'MAN-01', clause: '4.4' }, { code: 'PRC-01', clause: '6.1' },
  { code: 'PRC-02', clause: '6.1' }, { code: 'PRC-03', clause: '5.4' }, { code: 'PRC-04', clause: '7.2' },
  { code: 'PRC-05', clause: '7.4' }, { code: 'PRC-06', clause: '7.5' }, { code: 'PRC-07', clause: '8.1' },
  { code: 'PRC-08', clause: '8.1' }, { code: 'PRC-09', clause: '8.1' }, { code: 'PLN-01', clause: '8.2' },
  { code: 'PRC-10', clause: '9.1' }, { code: 'PRC-11', clause: '9.2' }, { code: 'PRC-12', clause: '9.3' },
  { code: 'PRC-13', clause: '10.2' }, { code: 'PRC-14', clause: '10.3' }, { code: 'OBJ-01', clause: '6.2' },
];

const safe = (fn, fallback) => { try { const v = fn(); return v === undefined ? fallback : v; } catch { return fallback; } };
const mean = (xs) => { const l = xs.filter((v) => Number.isFinite(v)); return l.length ? l.reduce((a, b) => a + b, 0) / l.length : 0; };
const scoreTone = (score) => (score >= TARGET ? 'good' : score >= WARN_FLOOR ? 'warning' : 'critical');
const scoreLabel = (score) => t(`compliance.tone.${scoreTone(score)}`);
const toneVar = (tone) => `var(--${tone === 'neutral' ? 'ink-3' : tone})`;

/**
 * Uneven pairs (4+8, 5+7) collapse to "half + full" between 960 and 1279 px (css/base.css), which leaves a
 * half-empty row. In that range the pair is rebalanced from data-pair: 'half' → span 6, 'full' → span 12.
 */
const MID_MQ = '(min-width: 960px) and (max-width: 1279.98px)';
function applyPairs(root) {
  let mid = false;
  try { mid = window.matchMedia(MID_MQ).matches; } catch { mid = false; }
  root.querySelectorAll('[data-pair]').forEach((el) => { el.style.gridColumn = mid ? (el.dataset.pair === 'full' ? 'span 12' : 'span 6') : ''; });
}

/** Digits inside record text follow the numerals setting; codes (MH-14, R-1042, PM2.5, ISO 45001) stay Latin. */
const AR_DIGITS = '٠١٢٣٤٥٦٧٨٩';
function codeSafeDigits(fmt, text) {
  const s = String(text ?? '');
  if (!s || !fmt || typeof fmt.getNumerals !== 'function' || fmt.getNumerals() !== 'arab') return s;
  return s.replace(/\d+(?:[.,/:]\d+)*/g, (m, offset, whole) => {
    let prev = whole[offset - 1] || '';
    if (prev === '/' || prev === ':') prev = whole[offset - 2] || '';
    const next = whole[offset + m.length] || '';
    if (/[A-Za-z\-_#]/.test(prev) || /[A-Za-z]/.test(next) || /(ISO|SBC|UTC)\s?\+?$/i.test(whole.slice(Math.max(0, offset - 5), offset))) return m;
    return m.replace(/\d/g, (d) => AR_DIGITS[Number(d)]).replace(/\./g, '٫').replace(/,/g, '٬');
  });
}

export default {
  id: 'compliance',
  code: 'SEC-08',
  get title() { return t('core.nav.compliance.title'); },
  icon: 'badge-check',

  render(container, ctx) {
    const { store, bus, sel, fmt, charts, components, sources } = ctx;
    const { h, card, badge, dataTable, button, drawer, toast, emptyState, progress, svgIcon, glyph, kv, motion } = components;

    const root = h('section', { class: 'view view-compliance', 'aria-labelledby': 'compliance-title' });
    container.appendChild(root);

    let raf = 0;
    let openDrawerApi = null;
    let firstBuild = true;
    let lastNumerals = safe(() => store.state.settings.numerals, 'latn');
    const expanded = new Set();
    let clauseGridEl = null;
    let lastWidth = 0;

    /** Seven clause cards never leave an orphan: 3 + 4 on wide mains, auto-fill columns below. */
    function layoutClauseGrid(w) {
      const g = clauseGridEl;
      if (!g) return;
      const cards = Array.from(g.children);
      const n = cards.length;
      if (w >= 760 && n >= 5) {
        const r = n % 4;
        const headSpan = r === 3 ? 4 : r === 2 ? 6 : r === 1 ? 12 : 3;
        g.style.gridTemplateColumns = 'repeat(12, minmax(0, 1fr))';
        cards.forEach((c, i) => { c.style.gridColumn = `span ${i < r ? headSpan : 3}`; });
      } else {
        g.style.gridTemplateColumns = 'repeat(auto-fill, minmax(min(100%, 230px), 1fr))';
        cards.forEach((c) => { c.style.gridColumn = ''; });
      }
    }
    let layoutObserver = null;
    let layoutRaf = 0;
    if (typeof ResizeObserver === 'function') {
      layoutObserver = new ResizeObserver((entries) => {
        for (const e of entries) {
          const w = Math.round(e.contentRect.width);
          if (w === lastWidth || w === 0) continue;
          lastWidth = w;
          if (layoutRaf) cancelAnimationFrame(layoutRaf);
          layoutRaf = requestAnimationFrame(() => { layoutRaf = 0; layoutClauseGrid(w); });
        }
      });
      layoutObserver.observe(root);
    }

    /* ───────────────────────── helpers ───────────────────────── */

    /** Clause ids ("7", "7.5") follow the numerals setting. */
    const digits = (s) => String(s ?? '').replace(/\d+(?:\.\d+)?/g, (m) => fmt.num(Number(m), { maximumFractionDigits: 2 }));
    const pct = (v) => fmt.pct(v);
    const nowDate = () => (typeof store.now === 'function' ? store.now() : new Date());
    function makeChart(name, opts) {
      if (!charts || typeof charts[name] !== 'function') return null;
      try { const c = charts[name](opts); return c && c.el instanceof Node ? c : null; } catch { return null; }
    }
    const chartOr = (chart, fallback) => (chart ? chart.el : (fallback || emptyState({ title: t('compliance.chartFallback') })));
    const tableOf = (chart, fallbackFn) => () => {
      if (chart && typeof chart.table === 'function') { const tb = safe(() => chart.table(), null); if (tb instanceof Node) return tb; }
      return fallbackFn ? fallbackFn() : h('table');
    };
    function ringOr(score, size, label) {
      const tone = scoreTone(score);
      const ring = makeChart('ring', { value: score, max: 100, size, color: toneVar(tone), label });
      if (ring) return ring.el;
      return h('div', { class: 'stack gap-1', style: { inlineSize: `${size}px` } }, h('span', { class: 't-metric' }, pct(score)), progress({ value: score, max: 100, tone, label }));
    }
    const legalStatus = (s) => (s ? i18n.label('legalStatus', s) : '—');
    function metricTile({ label, value, unit = '', tone = null, icon, helper = '' }) {
      return h('div', { class: ['metric-tile', tone ? `tone-${tone}` : null] },
        h('div', { class: 'metric-head' }, h('span', { class: 'metric-label' }, label), h('span', { class: 'metric-icon', 'aria-hidden': 'true' }, typeof icon === 'string' ? svgIcon(icon, 16) : icon)),
        h('div', { class: 'metric-value' }, h('span', { class: 't-metric' }, value), unit ? h('span', { class: 'metric-unit' }, unit) : null),
        h('div', { class: 'metric-foot' }, helper ? h('span', { class: 'metric-helper' }, helper) : null));
    }

    /* ───────────────────────── data ───────────────────────── */

    function documentRegister(state, subById) {
      if (Array.isArray(state.documents) && state.documents.length) {
        return state.documents.map((d, i) => {
          const raw = String(d.status || '');
          const key = /سار|valid|current/i.test(raw) ? 'valid' : /منته|expired/i.test(raw) ? 'expired' : 'review';
          return { code: d.code || d.id || `DOC-${i + 1}`, title: i18n.L(d, 'title', 'documents') || d.name || '—', clause: d.clause || '', status: key, score: null, subTitle: '' };
        });
      }
      return DOC_CATALOGUE.map((d) => {
        const sub = subById.get(d.clause) || null;
        const score = sub ? Number(sub.score) || 0 : 0;
        const gaps = sub ? (Array.isArray(sub.gaps) ? sub.gaps.length : 0) : 0;
        let status = 'valid';
        if (!sub) status = 'review';
        else if (score < 65) status = 'expired';
        else if (score < TARGET || gaps > 0) status = 'review';
        return { ...d, title: t(`compliance.docs.titles.${d.code}`), status, score: sub ? score : null, subTitle: sub ? sub.title : '' };
      });
    }

    function collect() {
      const state = store.state;
      const now = nowDate();
      const raw = safe(() => sel.isoScores(state), []) || [];
      const clauses = raw.map((c) => {
        const loc = i18n.localize(c, 'isoClauses') || c;
        const subs = Array.isArray(c.subclauses) ? c.subclauses : [];
        const locSubs = Array.isArray(loc.subclauses) ? loc.subclauses : subs;
        return {
          id: c.id,
          title: codeSafeDigits(fmt, loc.title || c.title),
          score: Math.round(Number(c.score) || 0),
          gaps: Number.isFinite(c.gaps) ? c.gaps : subs.reduce((n, s) => n + (Array.isArray(s.gaps) ? s.gaps.length : 0), 0),
          subclauses: subs.map((s, i) => ({ ...s, title: codeSafeDigits(fmt, (locSubs[i] && locSubs[i].title) || s.title), gaps: ((locSubs[i] && Array.isArray(locSubs[i].gaps) ? locSubs[i].gaps : s.gaps) || []).map((g) => codeSafeDigits(fmt, g)) })),
        };
      });
      const overall = Math.round(safe(() => sel.isoOverall(state), null) ?? mean(clauses.map((c) => c.score)));
      const subById = new Map();
      clauses.forEach((c) => c.subclauses.forEach((s) => { if (s && s.id) subById.set(String(s.id), s); }));
      const allSubs = clauses.flatMap((c) => c.subclauses.map((s) => ({ ...s, clauseId: c.id, clauseTitle: c.title })));
      const openGaps = allSubs.reduce((n, s) => n + (Array.isArray(s.gaps) ? s.gaps.length : 0), 0);
      const subsWithGaps = allSubs.filter((s) => Array.isArray(s.gaps) && s.gaps.length).length;
      const legal = (Array.isArray(state.legalRegister) ? state.legalRegister : []).map((l) => {
        const next = l.nextReview ? fmt.toDate(l.nextReview) : null;
        const days = next ? Math.ceil((next.getTime() - now.getTime()) / DAY_MS) : null;
        return {
          ...l,
          titleL: codeSafeDigits(fmt, i18n.L(l, 'title', 'legalRegister') || '—'),
          authorityL: l.authority ? i18n.L(l, 'authority', 'legalRegister') : '',
          ownerL: l.owner ? i18n.term(l.owner) : '',
          tone: LEGAL_TONE[l.status] || 'neutral',
          daysToReview: days,
        };
      });
      const docs = documentRegister(state, subById);
      const docCounts = { valid: 0, review: 0, expired: 0 };
      docs.forEach((d) => { docCounts[d.status] = (docCounts[d.status] || 0) + 1; });
      return { state, now, clauses, overall, allSubs, openGaps, subsWithGaps, legal, docs, docCounts };
    }

    /* ───────────────────────── sections ───────────────────────── */

    function exportCsv(data) {
      const rows = data.allSubs.map((s) => ({ clause: s.clauseId, clauseTitle: s.clauseTitle, id: s.id, title: s.title, score: s.score, gaps: (s.gaps || []).join(' | ') }));
      const columns = ['clause', 'clauseTitle', 'id', 'title', 'score', 'gaps'].map((key) => ({ key, label: t(`compliance.csv.${key}`) }));
      try {
        if (!rows.length || !sources || typeof sources.exportCSV !== 'function') throw new Error('unavailable');
        sources.exportCSV(rows, columns, `biltix-risk-ai-iso45001-${data.now.toISOString().slice(0, 10)}.csv`);
        toast(tn('compliance.csv.done', rows.length), { tone: 'good' });
      } catch { toast(t('compliance.csv.failed'), { tone: 'critical' }); }
    }

    function buildHead(data) {
      return h('header', { class: 'view-head' },
        h('div', { class: 'view-head-text' },
          h('span', { class: 'code-tag' }, 'SEC-08'),
          h('h1', { id: 'compliance-title', class: 't-page', tabindex: '-1' }, t('core.nav.compliance.title')),
          h('p', { class: 'view-lead' }, t('compliance.lead', { standard: STANDARD, from: fmt.num(4), to: fmt.num(10), target: pct(TARGET) }))),
        h('div', { class: 'view-actions' },
          badge(scoreLabel(data.overall), scoreTone(data.overall)),
          button(t('compliance.export'), { variant: 'outline', size: 'sm', icon: svgIcon('download', 16), onClick: () => exportCsv(data) })));
    }

    function buildMetrics(data) {
      const above = data.clauses.filter((c) => c.score >= TARGET).length;
      const compliant = data.legal.filter((l) => l.status === 'ممتثل').length;
      const overdue = data.legal.filter((l) => Number.isFinite(l.daysToReview) && l.daysToReview < 0).length;
      const sign = fmt.getNumerals() === 'arab' ? '٪' : '%';
      return h('div', { class: 'metric-grid', role: 'group', 'aria-label': t('compliance.metrics.label') },
        metricTile({ label: t('compliance.metrics.overall'), value: fmt.num(data.overall), unit: sign, tone: scoreTone(data.overall), icon: 'badge-check', helper: t('compliance.metrics.overallHelper', { from: fmt.num(4), to: fmt.num(10), target: pct(TARGET) }) }),
        metricTile({ label: t('compliance.metrics.above'), value: fmt.num(above), tone: above === data.clauses.length ? 'good' : 'warning', icon: glyph('good', 16), helper: t('compliance.metrics.aboveHelper', { total: fmt.num(data.clauses.length) }) }),
        metricTile({ label: t('compliance.metrics.gaps'), value: fmt.num(data.openGaps), tone: data.openGaps ? 'serious' : 'good', icon: 'alert-circle', helper: tn('compliance.metrics.gapsHelper', data.subsWithGaps) }),
        metricTile({ label: t('compliance.metrics.legal'), value: fmt.num(compliant), tone: compliant === data.legal.length ? 'good' : 'warning', icon: 'file-check', helper: t('compliance.metrics.legalHelper', { total: fmt.num(data.legal.length), overdue: tn('compliance.metrics.legalOverdue', overdue) }) }));
    }

    function clausesTable(data) {
      const tb = h('table', { class: 'table is-dense' }, h('caption', { class: 'sr-only' }, t('compliance.table.caption')),
        h('thead', {}, h('tr', {}, ['clause', 'title', 'score', 'target', 'gaps', 'status'].map((k) => h('th', { scope: 'col' }, t(`compliance.table.${k}`))))));
      tb.appendChild(h('tbody', {}, data.clauses.map((c) => h('tr', {},
        h('td', { class: 'num' }, digits(c.id)), h('th', { scope: 'row' }, c.title), h('td', { class: 'num' }, pct(c.score)),
        h('td', { class: 'num' }, pct(TARGET)), h('td', { class: 'num' }, fmt.num(c.gaps)), h('td', {}, scoreLabel(c.score))))));
      return tb;
    }

    function buildHero(data) {
      const weakest = data.clauses.slice().sort((a, b) => a.score - b.score).slice(0, 3);
      const body = h('div', { class: 'stack gap-4' },
        h('div', { class: 'stack gap-2', style: { alignItems: 'center', textAlign: 'center' } },
          ringOr(data.overall, 160, t('compliance.hero.ringLabel')),
          h('span', { class: 't-helper' }, t('compliance.hero.caption')),
          badge(t('compliance.hero.target', { label: scoreLabel(data.overall), target: pct(TARGET) }), scoreTone(data.overall))),
        h('ul', { class: 'stack gap-3', style: { listStyle: 'none', padding: 0, margin: 0 } }, weakest.map((c) => h('li', { class: 'stack gap-1' },
          h('div', { class: 'row between gap-2' }, h('span', { class: 't-label' }, `${digits(c.id)} · ${c.title}`), h('span', { class: 'num semibold' }, pct(c.score))),
          progress({ value: c.score, max: 100, tone: scoreTone(c.score), label: t('compliance.cards.scoreAria', { id: digits(c.id) }) })))));
      return card({ code: 'ISO-01', title: t('compliance.hero.title'), subtitle: STANDARD, hero: true, className: 'col-span-4', body, tableView: () => clausesTable(data) });
    }

    function buildSpider(data) {
      const axes = data.clauses.map((c) => ({ id: String(c.id), label: `${digits(c.id)} — ${c.title}` }));
      const spider = axes.length ? makeChart('spider', {
        axes,
        series: [
          { id: 'score', label: t('compliance.spider.score'), color: 'var(--s1)', values: data.clauses.map((c) => c.score) },
          { id: 'target', label: t('compliance.spider.target', { target: pct(TARGET) }), color: 'var(--ink-3)', values: data.clauses.map(() => TARGET) },
        ],
        max: 100, size: 400, ariaLabel: t('compliance.spider.aria'),
      }) : null;
      const chips = h('div', { class: 'matrix-legend', role: 'list', 'aria-label': t('compliance.spider.chips') },
        ...data.clauses.map((c) => h('span', { class: ['matrix-legend-item', `tone-${scoreTone(c.score)}`], role: 'listitem' },
          glyph(scoreTone(c.score), 12), h('span', { class: 'num text-xs' }, digits(c.id)), h('span', { class: 'legend-label' }, c.title), h('span', { class: 'legend-value num' }, pct(c.score)))));
      const body = axes.length
        ? h('div', { class: 'stack gap-3' }, chartOr(spider, clausesTable(data)), chips)
        : emptyState({ title: t('compliance.spider.empty'), text: t('compliance.spider.emptyText') });
      return card({ code: 'ISO-02', title: t('compliance.spider.title'), subtitle: t('compliance.spider.sub', { from: fmt.num(4), to: fmt.num(10), standard: STANDARD }), className: 'col-span-8', body, tableView: tableOf(spider, () => clausesTable(data)) });
    }

    function subclauseList(clause) {
      const list = h('ul', { class: 'controls-list', 'aria-label': t('compliance.cards.subAria', { id: digits(clause.id) }) });
      clause.subclauses.forEach((s) => {
        const score = Math.round(Number(s.score) || 0);
        const tone = scoreTone(score);
        const gaps = Array.isArray(s.gaps) ? s.gaps : [];
        list.appendChild(h('li', { class: ['controls-item', `tone-${tone}`] },
          h('span', { class: 'controls-type num' }, digits(s.id)),
          h('div', { class: 'stack gap-2 grow' },
            h('div', { class: 'row between gap-2 wrap' }, h('span', { class: 'semibold' }, s.title || '—'), badge(pct(score), tone)),
            h('div', { class: 'progress-row' }, progress({ value: score, max: 100, tone, label: t('compliance.cards.scoreAria', { id: digits(s.id) }) }), h('span', { class: 'progress-value num' }, pct(score))),
            gaps.length
              ? h('div', { class: 'stack gap-1' },
                h('span', { class: 't-helper' }, t('compliance.cards.gapsList', { gaps: tn('compliance.gaps', gaps.length) })),
                h('ul', { class: 'stack gap-1 text-sm', style: { paddingInlineStart: '18px', listStyle: 'disc' } }, ...gaps.map((g) => h('li', {}, String(g)))))
              : h('span', { class: 'row gap-1 text-xs tone-good', style: { color: 'var(--tone-ink)' } }, glyph('good', 12), h('span', {}, t('compliance.cards.noGaps'))))));
      });
      return list;
    }

    function buildClauseCards(data) {
      const cards = data.clauses.map((c) => {
        const tone = scoreTone(c.score);
        const id = String(c.id);
        const panelId = `iso-sub-${id.replace(/[^\w-]/g, '')}`;
        const panel = h('div', { id: panelId, class: 'stack gap-2', hidden: !expanded.has(id) }, subclauseList(c));
        const label = (open) => (open ? t('compliance.cards.hide') : t('compliance.cards.show', { count: fmt.num(c.subclauses.length) }));
        const toggle = button(label(expanded.has(id)), {
          variant: 'ghost', size: 'sm', icon: glyph('chevronDown', 14),
          attrs: { 'aria-expanded': expanded.has(id) ? 'true' : 'false', 'aria-controls': panelId },
          onClick: () => {
            const open = !expanded.has(id);
            if (open) expanded.add(id); else expanded.delete(id);
            panel.hidden = !open;
            toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
            const lab = toggle.querySelector('.btn-label'); if (lab) lab.textContent = label(open);
          },
        });
        const diff = c.score - TARGET;
        const body = h('div', { class: 'stack gap-3' },
          h('div', { class: 'ring-row' },
            ringOr(c.score, 64, t('compliance.clause', { id: digits(c.id) })),
            h('div', { class: 'ring-text grow' },
              h('span', { class: 'row gap-2 wrap' }, badge(scoreLabel(c.score), tone)),
              h('span', { class: 't-helper' }, t('compliance.cards.meta', { subs: tn('compliance.subs', c.subclauses.length), gaps: tn('compliance.gaps', c.gaps), target: pct(TARGET) })))),
          h('div', { class: 'progress-row', title: t('compliance.cards.vsTarget') },
            progress({ value: c.score, max: 100, tone, label: t('compliance.cards.scoreAria', { id: digits(c.id) }) }),
            h('bdi', { class: 'progress-value num', dir: 'ltr' }, String(fmt.signedPct(diff)).replace(/[‎‏؜]/g, ''))),
          h('div', { class: 'row' }, toggle),
          panel);
        return card({ code: `ISO-${String(c.id).padStart(2, '0')}`, title: c.title, subtitle: t('compliance.clause', { id: digits(c.id) }), className: 'is-compact', body });
      });
      const grid = h('div', { class: 'cards-grid', style: { alignItems: 'start' } }, ...cards);
      clauseGridEl = grid;
      layoutClauseGrid(lastWidth || Math.round(root.getBoundingClientRect().width) || 1200);
      return h('section', { class: 'view-section', 'aria-labelledby': 'iso-clauses-title' },
        h('div', { class: 'view-section-head' },
          h('div', { class: 'card-titles' }, h('span', { class: 'card-code', 'aria-hidden': 'true' }, 'ISO-03'), h('h2', { class: 't-section', id: 'iso-clauses-title' }, t('compliance.cards.title'))),
          h('div', { class: 'matrix-legend' },
            h('span', { class: 'matrix-legend-item tone-good' }, glyph('good', 12), h('span', {}, t('compliance.cards.legendGood', { target: pct(TARGET) }))),
            h('span', { class: 'matrix-legend-item tone-warning' }, glyph('warning', 12), h('span', {}, t('compliance.cards.legendWarning', { low: pct(WARN_FLOOR), high: pct(TARGET - 1) }))),
            h('span', { class: 'matrix-legend-item tone-critical' }, glyph('critical', 12), h('span', {}, t('compliance.cards.legendCritical', { low: pct(WARN_FLOOR) }))))),
        cards.length ? grid : emptyState({ title: t('compliance.cards.empty') }));
    }

    function openLegal(r) {
      if (openDrawerApi) { try { openDrawerApi.close(); } catch { /* ignore */ } openDrawerApi = null; }
      const reqs = Array.isArray(r.requirements) ? i18n.L(r, 'requirements', 'legalRegister').map((q) => codeSafeDigits(fmt, q)) : [];
      const gap = r.gap ? codeSafeDigits(fmt, i18n.L(r, 'gap', 'legalRegister')) : '';
      const evidence = r.evidence ? codeSafeDigits(fmt, i18n.L(r, 'evidence', 'legalRegister')) : '';
      const overdue = Number.isFinite(r.daysToReview) && r.daysToReview < 0;
      const body = h('div', { class: 'stack gap-4' },
        h('div', { class: 'row gap-2 wrap' }, badge(legalStatus(r.status), r.tone), overdue ? badge(t('compliance.legal.reviewOverdue'), 'critical') : null),
        kv([
          [t('compliance.legal.authority'), r.authorityL || '—'],
          [t('compliance.legal.ref'), r.ref ? codeSafeDigits(fmt, i18n.L(r, 'ref', 'legalRegister')) : '—'],
          [t('compliance.legal.ownerLabel'), r.ownerL || '—'],
          [t('compliance.legal.lastReview'), r.lastReview ? fmt.date(r.lastReview) : '—'],
          [t('compliance.legal.nextReview'), r.nextReview ? fmt.date(r.nextReview) : '—'],
        ]),
        reqs.length ? h('section', { class: 'drawer-section' }, h('h3', { class: 'drawer-section-title' }, t('compliance.legal.requirements')),
          h('ol', { class: 'controls-list' }, ...reqs.map((q, i) => h('li', { class: 'controls-item' }, h('span', { class: 'controls-type num' }, fmt.num(i + 1)), h('span', {}, String(q)))))) : null,
        evidence ? h('section', { class: 'drawer-section' }, h('h3', { class: 'drawer-section-title' }, t('compliance.legal.evidence')), h('p', { class: 't-body is-secondary' }, String(evidence))) : null,
        gap ? h('div', { class: ['note', `tone-${r.tone}`] }, h('strong', {}, `${t('compliance.legal.gap')}: `), String(gap)) : h('div', { class: 'note tone-good' }, t('compliance.legal.noGap')));
      openDrawerApi = drawer({ title: r.titleL || t('compliance.legal.drawerFallback'), subtitle: r.authorityL || '', body, size: 'lg', kind: 'legal', onClose: () => { openDrawerApi = null; } });
      openDrawerApi.open();
    }

    function buildLegal(data) {
      const rel = (() => { try { return new Intl.RelativeTimeFormat(fmt.locale().replace(/-ca-gregory$/, ''), { numeric: 'auto' }); } catch { return null; } })();
      const table = dataTable({
        caption: t('compliance.legal.caption'), pageSize: 10, rowKey: 'id', emptyText: t('compliance.legal.empty'),
        initialSort: { key: 'status', dir: 'asc' },
        onRowClick: (r) => openLegal(r),
        rowLabel: (r) => t('compliance.legal.open', { title: r.titleL }),
        columns: [
          { key: 'title', label: t('compliance.legal.requirement'), priority: 'high', width: '56%', sortValue: (r) => r.titleL, render: (r) => h('div', { class: 'stack gap-1' },
            h('span', { class: 'cell-title', style: { whiteSpace: 'normal' } }, r.titleL),
            h('span', { class: 'cell-sub', style: { whiteSpace: 'normal' } }, [r.authorityL, r.ownerL ? t('compliance.legal.owner', { name: r.ownerL }) : null].filter(Boolean).join(' · '))) },
          { key: 'status', label: t('compliance.legal.status'), priority: 'high', render: (r) => badge(legalStatus(r.status), r.tone), sortValue: (r) => LEGAL_ORDER[r.status] ?? 3 },
          { key: 'lastReview', label: t('compliance.legal.lastReview'), priority: 'low', render: (r) => h('span', { class: 'nowrap' }, r.lastReview ? fmt.date(r.lastReview) : '—'), sortValue: (r) => (r.lastReview ? Date.parse(r.lastReview) : 0) },
          { key: 'nextReview', label: t('compliance.legal.nextReview'), priority: 'medium', sortValue: (r) => (r.nextReview ? Date.parse(r.nextReview) : 0), render: (r) => {
            if (!r.nextReview) return '—';
            const d = r.daysToReview;
            const overdue = Number.isFinite(d) && d < 0;
            const soon = Number.isFinite(d) && d >= 0 && d <= 30;
            let phrase = '';
            try { phrase = rel ? rel.format(d, 'day') : fmt.num(d); } catch { phrase = fmt.num(d); }
            return h('div', { class: 'stack gap-1' },
              h('span', { class: overdue ? 'nowrap tone-text-critical semibold' : 'nowrap' }, fmt.date(r.nextReview)),
              overdue ? badge(t('compliance.legal.overdue'), 'critical') : soon ? badge(phrase, 'warning') : null);
          } },
        ],
        rows: data.legal,
        stickyFirst: true,
      });
      const counts = ['ممتثل', 'جزئي', 'فجوة'].map((s) => ({ s, n: data.legal.filter((l) => l.status === s).length }));
      return card({
        code: 'ISO-04', title: t('compliance.legal.title'), subtitle: t('compliance.legal.sub'), className: 'col-span-8',
        body: table.el,
        footer: h('div', { class: 'matrix-legend' }, ...counts.map(({ s, n }) => h('span', { class: ['matrix-legend-item', `tone-${LEGAL_TONE[s]}`] }, glyph(LEGAL_TONE[s], 12), h('span', {}, legalStatus(s)), h('span', { class: 'legend-value num' }, fmt.num(n))))),
      });
    }

    function buildDocuments(data) {
      const facts = h('div', { class: 'hero-facts' }, ...['valid', 'review', 'expired'].map((k) => h('div', { class: ['fact', `tone-${DOC_TONE[k]}`] },
        h('span', { class: 'fact-label row gap-1' }, glyph(DOC_TONE[k], 12), h('span', {}, t(`compliance.docs.statusLong.${k}`))),
        h('span', { class: 'fact-value num' }, fmt.num(data.docCounts[k] || 0)))));
      const attention = data.docs.filter((d) => d.status !== 'valid').sort((a, b) => (a.status === 'expired' ? 0 : 1) - (b.status === 'expired' ? 0 : 1) || (a.score ?? 0) - (b.score ?? 0));
      const list = h('ul', { class: 'urgent-list', 'aria-label': t('compliance.docs.attentionAria') },
        ...attention.slice(0, 6).map((d) => h('li', { class: ['urgent-item', `tone-${DOC_TONE[d.status]}`] },
          h('span', { class: 'urgent-icon', 'aria-hidden': 'true' }, glyph(DOC_TONE[d.status], 14)),
          h('span', { class: 'urgent-text' }, h('span', {}, d.title), h('span', { class: 'urgent-sub' }, d.clause ? `${t('compliance.docs.governing', { clause: digits(d.clause) })}${d.subTitle ? ` — ${d.subTitle}` : ''}` : '—')),
          h('span', { class: 'urgent-due' }, h('span', { class: 'code' }, d.code), h('span', {}, d.status === 'expired' ? t('compliance.docs.reissue') : t('compliance.docs.review'))))));
      const total = data.docs.length;
      const validPct = total ? Math.round(((data.docCounts.valid || 0) / total) * 100) : 0;
      const body = h('div', { class: 'stack gap-4' },
        facts,
        h('div', { class: 'progress-row' }, progress({ value: validPct, max: 100, tone: scoreTone(validPct), label: t('compliance.docs.validShare') }), h('span', { class: 'progress-value num' }, pct(validPct))),
        attention.length ? h('div', { class: 'stack gap-2' }, h('span', { class: 't-helper' }, t('compliance.docs.attention')), list) : h('div', { class: 'note tone-good' }, t('compliance.docs.allValid')),
        h('p', { class: 't-helper' }, tn('compliance.docs.note', total)));
      const tableFn = () => {
        const tb = h('table', { class: 'table is-dense' }, h('thead', {}, h('tr', {}, ['code', 'doc', 'clause', 'state'].map((k) => h('th', { scope: 'col' }, t(`compliance.docs.${k}`))))));
        tb.appendChild(h('tbody', {}, data.docs.map((d) => h('tr', {}, h('td', {}, h('span', { class: 'code' }, d.code)), h('td', {}, d.title), h('td', { class: 'num' }, d.clause ? digits(d.clause) : '—'), h('td', {}, t(`compliance.docs.status.${d.status}`))))));
        return tb;
      };
      return card({ code: 'ISO-05', title: t('compliance.docs.title'), subtitle: t('compliance.docs.sub', { clause: digits('7.5') }), className: 'col-span-4', body, tableView: tableFn });
    }

    /* ───────────────────────── build ───────────────────────── */

    function build() {
      raf = 0;
      const scrollY = window.scrollY;
      const data = collect();
      const metrics = buildMetrics(data);
      const row1 = h('div', { class: 'grid-12', style: { alignItems: 'start' } }, buildHero(data), buildSpider(data));
      const clausesSec = buildClauseCards(data);
      const row2 = h('div', { class: 'grid-12', style: { alignItems: 'start' } }, buildLegal(data), buildDocuments(data));
      Array.from(row1.children).forEach((c) => { c.dataset.pair = 'half'; });
      Array.from(row2.children).forEach((c) => { c.dataset.pair = 'full'; });
      root.replaceChildren(buildHead(data), metrics, row1, clausesSec, row2);
      applyPairs(root);
      if (firstBuild) {
        firstBuild = false;
        motion.enter(metrics.children, { y: 8 });
        motion.enter([row1, clausesSec, row2], { y: 10, delay: 0.08 });
      } else if (Math.abs(window.scrollY - scrollY) > 1) window.scrollTo({ top: scrollY });
    }
    const schedule = () => { if (!raf) raf = requestAnimationFrame(build); };

    const RELEVANT = /^(\*|isoClauses|legalRegister|documents)(\.|$)/;
    const unsubs = [
      bus.on('store:change', (payload) => { const path = payload && payload.path ? String(payload.path) : '*'; if (RELEVANT.test(path)) schedule(); }),
      bus.on('settings:change', (payload) => {
        const n = payload && payload.settings ? payload.settings.numerals : safe(() => store.state.settings.numerals, lastNumerals);
        if (n !== lastNumerals) { lastNumerals = n; schedule(); }
      }),
    ];

    build();
    let midMq = null;
    const onMq = () => applyPairs(root);
    try { midMq = window.matchMedia(MID_MQ); midMq.addEventListener('change', onMq); } catch { midMq = null; }

    return () => {
      if (midMq) { try { midMq.removeEventListener('change', onMq); } catch { /* ignore */ } }
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      if (layoutObserver) { try { layoutObserver.disconnect(); } catch { /* ignore */ } layoutObserver = null; }
      if (layoutRaf) { cancelAnimationFrame(layoutRaf); layoutRaf = 0; }
      clauseGridEl = null;
      unsubs.forEach((u) => { try { if (typeof u === 'function') u(); } catch { /* ignore */ } });
      if (openDrawerApi) { try { openDrawerApi.close(); } catch { /* ignore */ } openDrawerApi = null; }
      root.remove();
    };
  },
};
