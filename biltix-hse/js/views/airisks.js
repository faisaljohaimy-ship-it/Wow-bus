/**
 * BILTIX Risk AI — AI risk register page (js/views/airisks.js) — AIR-01. Owner: B-REGISTER.
 *
 *   Heading      code tag · title · lead · honest data status (status.js) · "Register risk" (risk form) · tasks link
 *   Summary      open / critical / past due / in treatment (psel definitions) — each cell filters the register
 *   Register     shared riskRegister (filter bar, sort, pagination, CSV export, deep links, URL-synced filters)
 *   Side         open risks by domain (filters the register) · input-data quality of open risks
 *   Drawer       shared openRiskDrawer; ?risk=ID (or code) opens it on load; closing returns focus to the row
 *
 * Global filters (project / period / search) come from the shell; the register adds its own. Live store
 * changes patch rows and summaries in place (no replayed entrance motion). Strings: t('airisks.*').
 */

import { components } from '../ui/components.js';
import { i18n, t, tn } from '../core/i18n.js';
import { status as statusApi } from '../core/status.js';
import { motion } from '../ui/motion.js';
import airisksDict from '../i18n/airisks.js';
import { riskRegister } from './shared/risk-register.js';
import { openRiskDrawer, envOf, ensureStyles, hashParams, patchHashParams, domainChip, domainLabel, DOMAINS } from './shared/risk-drawer.js';
import { openRiskForm } from './shared/risk-form.js';
import { installDrawerHook, startWalkthrough, walkthroughAvailable, WORKED_RISK } from '../ui/walkthrough.js';

i18n.register('airisks', airisksDict);

const { h, clear, glyph, svgIcon, card, button, statusBadge, emptyState } = components;

const STYLE_ID = 'view-airisks-style';
const STYLE_TEXT = `
.view-airisks { display: flex; flex-direction: column; gap: var(--space-5); }
.view-airisks .view-actions { align-items: center; }
.air-summary { grid-template-columns: repeat(4, minmax(0, 1fr)); }
@media (max-width: 899.98px) { .air-summary { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
.air-sum-cell { display: flex; flex-direction: column; align-items: flex-start; gap: 4px; padding: 14px 16px; min-block-size: 88px; background: var(--bg-1); box-shadow: 0 0 0 1px var(--line); border: 0; text-align: start; color: inherit; font: inherit; cursor: pointer; min-inline-size: 0; }
.air-sum-cell:hover { background: var(--bg-2); }
.air-sum-cell:focus-visible { outline: 2px solid var(--focus); outline-offset: -2px; }
.air-sum-cell[aria-pressed="true"] { background: color-mix(in srgb, var(--brand) 10%, var(--bg-1)); box-shadow: inset 0 0 0 1px var(--brand), 0 0 0 1px var(--line); }
.air-sum-label { display: inline-flex; align-items: center; gap: 6px; font-size: var(--fs-sm); color: var(--ink-2); font-weight: 500; }
.air-sum-label > svg { flex: none; }
.air-sum-label.tone-critical > svg { color: var(--critical-text); }
.air-sum-label.tone-warning > svg { color: var(--warning-text); }
.air-sum-label.tone-brand > svg { color: var(--brand-text); }
.air-sum-label.tone-neutral > svg { color: var(--ink-3); }
.air-sum-value { font-size: var(--fs-2xl); font-weight: 600; color: var(--ink-1); font-variant-numeric: tabular-nums; line-height: 1.15; }
.air-sum-hint { font-size: 12px; color: var(--ink-3); line-height: 1.4; }
.air-side { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--space-4); align-items: start; }
@media (max-width: 899.98px) { .air-side { grid-template-columns: minmax(0, 1fr); } }
.air-domain-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
.air-domain-btn { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; gap: 6px 12px; inline-size: 100%; min-block-size: 48px; padding: 8px 10px; border-radius: var(--radius-sm); border: 1px solid transparent; background: transparent; color: inherit; font: inherit; text-align: start; cursor: pointer; }
.air-domain-btn > .cat-chip { justify-self: start; }
.air-domain-btn:hover { background: var(--bg-2); border-color: var(--line); }
.air-domain-btn:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
.air-domain-btn[aria-pressed="true"] { border-color: var(--brand); background: color-mix(in srgb, var(--brand) 9%, var(--bg-1)); }
.air-domain-nums { display: inline-flex; align-items: baseline; gap: 8px; white-space: nowrap; font-size: 12px; color: var(--ink-3); }
.air-domain-nums strong { font-size: var(--fs-lg); color: var(--ink-1); font-variant-numeric: tabular-nums; }
.air-domain-bar { grid-column: 1 / -1; display: flex; block-size: 6px; border-radius: 999px; background: var(--bg-3); overflow: hidden; }
.air-domain-bar > span { display: block; block-size: 100%; }
.air-domain-bar > .is-red { background: var(--critical); }
.air-domain-bar > .is-rest { background: var(--line-strong); }
.air-dq-rows { display: flex; flex-direction: column; gap: 10px; }
.air-dq-row { display: grid; grid-template-columns: minmax(120px, 160px) minmax(0, 1fr) auto; align-items: center; gap: 10px; font-size: var(--fs-sm); }
.air-dq-track { block-size: 8px; border-radius: 999px; background: var(--bg-3); overflow: hidden; }
.air-dq-track > span { display: block; block-size: 100%; background: var(--accent); border-radius: inherit; }
.air-dq-row.is-low .air-dq-track > span, .air-dq-row.is-none .air-dq-track > span { background: var(--ink-3); }
.air-dq-num { font-variant-numeric: tabular-nums; color: var(--ink-1); font-weight: 600; white-space: nowrap; }
.air-dq-num small { font-weight: 400; color: var(--ink-3); margin-inline-start: 6px; }
@media (max-width: 479.98px) { .air-dq-row { grid-template-columns: minmax(0, 1fr) auto; } .air-dq-track { grid-column: 1 / -1; grid-row: 2; } }
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

export default {
  id: 'airisks',
  code: 'AIR-01',
  get title() { return t('airisks.title'); },
  icon: 'shield-alert',

  render(container, ctx = {}) {
    ensureStyle();
    const env = envOf(ctx);
    const { store, bus, psel, fmt } = env;
    const router = ctx.router || null;
    let alive = true;
    let raf = 0;
    let formApi = null;
    const unsubs = [];

    const stateOf = () => store.state || {};
    const globalFilters = () => store.filters || stateOf().filters || { siteId: 'all', range: 30, search: '' };
    const navigate = (id, params = {}) => { if (router && typeof router.navigate === 'function') router.navigate(id, params); };

    /* ── heading ── */
    const mode = statusApi.mode(stateOf());
    const registerBtn = button(t('airisks.register'), { variant: 'primary', icon: 'plus', onClick: () => openForm(registerBtn) });
    const head = h('header', { class: 'view-head' },
      h('div', { class: 'view-head-text' },
        h('span', { class: 'code-tag' }, 'AIR-01'),
        h('h1', { class: 't-page', tabindex: '-1' }, t('airisks.title')),
        h('p', { class: 'view-lead t-lead' }, t('airisks.lead'))),
      h('div', { class: 'view-actions' },
        statusBadge(mode),
        button(t('airisks.tasks'), { variant: 'ghost', icon: 'file-check', onClick: () => navigate('tasks') }),
        registerBtn));

    /* ── summary strip ── */
    const summary = h('div', { class: 'summary-strip air-summary', role: 'group', 'aria-label': t('airisks.summaryAria') });

    /* ── register ── */
    const register = riskRegister(ctx, { pageSize: 10, stateKey: 'register:airisks', code: 'AIR-01', id: 'air-register', onFilterChange: () => paintSide() });

    /* ── side summaries ── */
    const domainBody = h('div');
    const dqBody = h('div');
    const domainCard = card({ code: 'DST-01', title: t('airisks.domains.title'), subtitle: t('airisks.domains.sub'), body: domainBody });
    const dqCard = card({
      code: 'DST-02', title: t('airisks.dq.title'), subtitle: t('airisks.dq.sub'), body: dqBody,
      actions: [button(t('airisks.dq.openDq'), { variant: 'ghost', size: 'sm', icon: 'badge-check', onClick: () => navigate('dataquality') })],
    });
    const side = h('div', { class: 'air-side' }, domainCard, dqCard);

    const root = h('section', { class: 'view view-airisks' }, head, summary, register.el, side);
    container.appendChild(root);

    /* ── data (one definition: psel) ── */
    function scopeRows(extra = {}) {
      try { return arr(psel.registerRows(stateOf(), { ...globalFilters(), ...extra }, { now: store.now() })); } catch { return []; }
    }
    function counts() {
      const g = globalFilters();
      let m = null;
      try { m = psel.metrics(stateOf(), g, store.now()); } catch { m = null; }
      const open = scopeRows().filter((r) => r.status !== 'مغلق' && r.status !== 'مُتجاوز');
      return {
        open: m ? m.openRisks : open.length,
        critical: m ? m.criticalRisks : open.filter((r) => r.rating === 'red').length,
        overdue: open.filter((r) => r.overdue).length,
        treatment: open.filter((r) => r.status === 'قيد المعالجة').length,
        openRows: open,
      };
    }

    function sumCell({ icon, tone, label, value, hint, pressed, onClick }) {
      return h('button', { type: 'button', class: 'air-sum-cell', 'aria-pressed': pressed ? 'true' : 'false', onClick },
        h('span', { class: ['air-sum-label', `tone-${tone}`] }, tone === 'critical' || tone === 'warning' ? glyph(tone, 14) : svgIcon(icon, 14), h('span', {}, label)),
        h('span', { class: 'air-sum-value', dir: 'ltr' }, fmt.num(value)),
        h('span', { class: 'air-sum-hint' }, hint));
    }

    function applyFilter(f) {
      register.update({ domain: null, rating: null, status: null, owner: null, type: null, q: null, l: null, i: null, view: null, overdue: null, pipeline: null, ...f }, { scroll: true });
      paintSide();
    }

    function paintSummary(c) {
      const f = register.getFilters();
      const only = (k, v) => Object.keys(f).length === 1 && f[k] === v;
      clear(summary);
      summary.append(
        sumCell({ icon: 'shield-alert', tone: 'brand', label: t('airisks.sum.open'), value: c.open, hint: t('airisks.sum.openHint'), pressed: Object.keys(f).length === 0, onClick: () => applyFilter({}) }),
        sumCell({ icon: 'alert-octagon', tone: 'critical', label: t('airisks.sum.critical'), value: c.critical, hint: t('airisks.sum.criticalHint', { score: fmt.num(70) }), pressed: only('rating', 'red'), onClick: () => applyFilter({ rating: 'red' }) }),
        sumCell({ icon: 'clock', tone: 'warning', label: t('airisks.sum.overdue'), value: c.overdue, hint: t('airisks.sum.overdueHint'), pressed: only('overdue', true), onClick: () => applyFilter({ overdue: true }) }),
        sumCell({ icon: 'refresh', tone: 'neutral', label: t('airisks.sum.treatment'), value: c.treatment, hint: t('airisks.sum.treatmentHint'), pressed: only('status', 'قيد المعالجة'), onClick: () => applyFilter({ status: 'قيد المعالجة' }) }));
    }

    function paintDomains(c) {
      clear(domainBody);
      const open = c.openRows;
      if (!open.length) { domainBody.appendChild(emptyState({ icon: 'shield-check', title: t('airisks.domains.empty') })); return; }
      const f = register.getFilters();
      const max = Math.max(1, ...DOMAINS.map((d) => open.filter((r) => r.category === d).length));
      domainBody.appendChild(h('ul', { class: 'air-domain-list' }, DOMAINS.map((d) => {
        const list = open.filter((r) => r.category === d);
        const red = list.filter((r) => r.rating === 'red').length;
        const pressed = f.domain === d;
        return h('li', {}, h('button', {
          type: 'button', class: 'air-domain-btn', 'aria-pressed': pressed ? 'true' : 'false',
          'aria-label': t('airisks.domains.aria', { domain: domainLabel(d), count: fmt.num(list.length), red: fmt.num(red) }),
          onClick: () => { register.update({ domain: pressed ? null : d }, { scroll: true }); paintSide(); },
        },
        domainChip(d),
        h('span', { class: 'air-domain-nums' }, h('strong', { dir: 'ltr' }, fmt.num(list.length)), red ? h('span', {}, t('airisks.domains.red', { count: fmt.num(red) })) : null),
        h('span', { class: 'air-domain-bar', 'aria-hidden': 'true' },
          h('span', { class: 'is-red', style: { inlineSize: `${(red / max) * 100}%` } }),
          h('span', { class: 'is-rest', style: { inlineSize: `${((list.length - red) / max) * 100}%` } }))));
      })));
    }

    function paintDq(c) {
      clear(dqBody);
      const open = c.openRows;
      if (!open.length) { dqBody.appendChild(emptyState({ icon: 'badge-check', title: t('airisks.dq.empty') })); return; }
      const levels = ['high', 'medium', 'low', null];
      const rows = levels.map((lv) => ({ lv, n: open.filter((r) => (lv === null ? !r.dataQualityLevel : r.dataQualityLevel === lv)).length })).filter((x) => x.lv !== null || x.n > 0);
      dqBody.appendChild(h('div', { class: 'stack gap-3' },
        h('div', { class: 'air-dq-rows' }, rows.map(({ lv, n }) => {
          const pct = Math.round((n / open.length) * 100);
          return h('div', { class: ['air-dq-row', lv ? `is-${lv}` : 'is-none'] },
            components.h('span', {}, lv ? (i18n.label('dataQualityLevel', lv) || lv) : t('airisks.dq.none')),
            h('span', { class: 'air-dq-track', role: 'img', 'aria-label': `${lv ? i18n.label('dataQualityLevel', lv) : t('airisks.dq.none')}: ${fmt.pct(pct)}` }, h('span', { style: { inlineSize: `${pct}%` } })),
            h('span', { class: 'air-dq-num' }, h('span', { dir: 'ltr' }, fmt.num(n)), h('small', {}, t('airisks.dq.share', { pct: fmt.pct(pct) }))));
        })),
        h('p', { class: 'text-xs muted', style: { margin: 0 } }, t('airisks.dq.note'))));
    }

    function paintSide() {
      if (!alive) return;
      const c = counts();
      paintSummary(c);
      paintDomains(c);
      paintDq(c);
    }

    function schedule() {
      if (!alive || raf) return;
      raf = requestAnimationFrame(() => { raf = 0; paintSide(); });
    }

    function openForm(trigger) {
      formApi = openRiskForm(ctx, {
        returnFocus: trigger,
        onSaved: (risk) => {
          register.update({}, { resetPage: true });
          register.select(risk.id);
          openRiskDrawer(ctx, risk.id, { tab: 'overview', onClose: () => { register.select(null); refocus(risk.id); } });
        },
      });
    }

    function refocus(id) {
      const a = document.activeElement;
      if (!a || a === document.body || !a.isConnected) register.focusRow(id);
    }

    unsubs.push(bus.on('store:change', (payload) => {
      const path = payload && typeof payload.path === 'string' ? payload.path : '*';
      if (path !== '*' && !/^(platform\.(aiRisks|tasks)|platform$|sites|settings)/.test(path)) return;
      schedule();
    }));
    unsubs.push(bus.on('filters:change', schedule));

    paintSide();
    motion.enter([head, summary, register.el, side], { y: 6 });

    // The worked-example tour button on the AIR-1069 drawer, wherever the drawer opens (idempotent).
    installDrawerHook(ctx);

    // Deep link: ?risk=ID|CODE opens the drawer (also restores it after a reload); &tour=1 starts the walkthrough.
    const hp = hashParams();
    const wanted = hp.risk || (ctx.params && ctx.params.risk) || null;
    let openTimer = 0;
    if (hp.new === '1' || hp.new === 'true') {
      // ?new=1 (cockpit fallback, shared links): open the registration form once, then drop the param.
      openTimer = setTimeout(() => { if (!alive) return; patchHashParams({ new: null }); openForm(registerBtn); }, 0);
    } else if ((hp.tour === '1' || hp.tour === 'true') && walkthroughAvailable(stateOf(), (psel.riskById(stateOf(), wanted || WORKED_RISK) || {}).id)) {
      // ?tour=1 (or ?risk=AIR-1069&tour=1): the guided walkthrough of the worked example starts at the register (it
      // opens the drawer itself on its next step); without `risk` it is the worked example, the only record with a
      // tour. The tour param is dropped so a reload does not restart it.
      openTimer = setTimeout(() => {
        if (!alive) return;
        patchHashParams({ tour: null, risk: null });
        startWalkthrough(ctx, { riskId: (psel.riskById(stateOf(), wanted || WORKED_RISK) || {}).id, step: 0 });
      }, 0);
    } else if (wanted) {
      openTimer = setTimeout(() => {
        if (!alive) return;
        const api = openRiskDrawer(ctx, wanted, { onClose: () => { register.select(null); refocus(wanted); } });
        if (api) {
          const r = psel.riskById(stateOf(), wanted);
          if (r) register.select(r.id);
        }
      }, 0);
    }

    return () => {
      alive = false;
      clearTimeout(openTimer);
      if (raf) cancelAnimationFrame(raf);
      unsubs.splice(0).forEach((u) => { try { u(); } catch { /* ignore */ } });
      register.destroy();
      if (formApi && typeof formApi.isOpen === 'function' && formApi.isOpen()) { try { formApi.close('navigate'); } catch { /* ignore */ } }
    };
  },
};
