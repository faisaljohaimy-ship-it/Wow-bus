/**
 * BILTIX Risk AI — alerts & escalation (js/views/alerts.js) — AIR-03. Owner: B-REGISTER.
 *
 *   Heading     code tag · title · lead (honest: routing is recorded, nothing is delivered in the demo) ·
 *               data status · "Acknowledge pending escalations" · register link
 *   Summary     unacknowledged · pending immediate · last 24 h · mean time to acknowledge
 *   Queue       immediate / standard switch (?queue=), acknowledged toggle, 6 rows + "show all";
 *               acknowledge (store.ackAlert) · open the risk in the shared drawer
 *   Thresholds  read-only summary + live preview (psel.alertPreview) → editor in #/settings?section=thresholds
 *   Channels    routing toggles (settings.platform.channels) with honest status (Not connected: no delivery
 *               service); webhook "Not connected" until set, then a REAL test POST (sources.postWebhook) whose
 *               actual result is shown (2xx = delivered, opaque = unconfirmed, failure = error); set-up links go to
 *               #/settings?section=notifications
 *   Write-back  audit log (action 'writeback') labelled simulated
 *
 * Live updates patch the sections in place (the queue keeps focus and expansion). Strings: t('alerts.*').
 */

import { components } from '../ui/components.js';
import { i18n, t, tn } from '../core/i18n.js';
import { status as statusApi } from '../core/status.js';
import { motion } from '../ui/motion.js';
import alertsDict from '../i18n/alerts.js';
import {
  openRiskDrawer, envOf, ensureStyles, ACTOR, codeSpan, withCodes, dataText, numRun, person, siteName, alertTitle, ratingBadge, ratingOf,
  channelChip, hashParams, patchHashParams, writebackChip, CHANNELS,
} from './shared/risk-drawer.js';

i18n.register('alerts', alertsDict);

const { h, clear, glyph, svgIcon, card, button, segmented, dataTable, toast, emptyState, kv, badge, statusBadge } = components;

const QUEUE_DEFAULT = 6;
const CHANNEL_ICON = { email: 'mail', slack: 'hash', teams: 'teams', whatsapp: 'whatsapp' };
const memory = { queue: null, showAcked: false, webhook: null };

const STYLE_ID = 'view-alerts-style';
const STYLE_TEXT = `
.view-alerts { display: flex; flex-direction: column; gap: var(--space-5); }
.view-alerts .view-actions { align-items: center; }
.alr-summary { grid-template-columns: repeat(4, minmax(0, 1fr)); }
@media (max-width: 899.98px) { .alr-summary { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
.alr-summary .summary-label > svg { flex: none; }
.alr-summary .tone-critical > svg { color: var(--critical-text); }
.alr-summary .tone-warning > svg { color: var(--warning-text); }
.alr-summary .tone-good > svg { color: var(--good-text); }
.alr-summary .t-helper { font-size: 12px; color: var(--ink-3); line-height: 1.4; }
.alr-switch-row { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 8px 12px; }
.alr-toggle { display: inline-flex; align-items: center; gap: 8px; min-block-size: 40px; font-size: var(--fs-sm); color: var(--ink-2); cursor: pointer; }
.alr-toggle input { inline-size: 18px; block-size: 18px; accent-color: var(--brand); }
.alr-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
.alr-item { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 8px 14px; align-items: center; padding: 12px 14px; border-radius: var(--radius-md); border: 1px solid var(--line); border-inline-start: 3px solid var(--warning); background: var(--bg-1); }
.alr-item[data-severity="critical"] { border-inline-start-color: var(--critical); }
.alr-item[data-acked="true"] { border-inline-start-color: var(--line-2); }
.alr-item[data-acked="true"] .alr-title { color: var(--ink-2); }
.alr-main { display: flex; flex-direction: column; gap: 6px; min-inline-size: 0; }
.alr-title-row { display: flex; flex-wrap: wrap; gap: 6px 10px; align-items: center; }
.alr-title { font-size: var(--fs-sm); font-weight: 600; color: var(--ink-1); line-height: 1.5; overflow-wrap: anywhere; }
.alr-meta { display: flex; flex-wrap: wrap; gap: 4px 12px; align-items: center; font-size: 12px; color: var(--ink-3); }
.alr-meta > span { display: inline-flex; align-items: center; gap: 4px; }
.alr-channels { display: inline-flex; flex-wrap: wrap; gap: 4px; align-items: center; }
.alr-actions { display: flex; flex-wrap: wrap; gap: 6px; justify-content: flex-end; }
@media (max-width: 599.98px) { .alr-item { grid-template-columns: minmax(0, 1fr); } .alr-actions { justify-content: flex-start; } }
.alr-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--space-4); align-items: start; }
@media (max-width: 1023.98px) { .alr-grid { grid-template-columns: minmax(0, 1fr); } }
.alr-thr { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
.alr-thr-cell { display: flex; flex-direction: column; gap: 2px; padding: 12px 14px; border-radius: var(--radius-sm); border: 1px solid var(--line); background: var(--bg-1); }
.alr-thr-cell .k { display: inline-flex; align-items: center; gap: 6px; font-size: var(--fs-sm); color: var(--ink-2); font-weight: 500; }
.alr-thr-cell .v { font-size: var(--fs-2xl); font-weight: 600; color: var(--ink-1); font-variant-numeric: tabular-nums; line-height: 1.2; }
.alr-thr-cell .hint { font-size: 12px; color: var(--ink-3); }
.alr-prev { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; }
@media (max-width: 479.98px) { .alr-prev { grid-template-columns: minmax(0, 1fr); } .alr-thr { grid-template-columns: minmax(0, 1fr); } }
.alr-prev-cell { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 10px 12px; border-radius: var(--radius-sm); background: var(--bg-2); border: 1px solid var(--line); font-size: var(--fs-sm); color: var(--ink-2); }
.alr-prev-cell .lbl { display: inline-flex; align-items: center; gap: 6px; }
.alr-prev-cell .lbl > svg { flex: none; }
.alr-prev-cell.is-critical .lbl > svg { color: var(--critical-text); }
.alr-prev-cell.is-warning .lbl > svg { color: var(--warning-text); }
.alr-prev-cell.is-good .lbl > svg { color: var(--good-text); }
.alr-prev-cell strong { font-variant-numeric: tabular-nums; color: var(--ink-1); font-size: var(--fs-lg); }
.alr-bar { display: flex; block-size: 10px; border-radius: 999px; overflow: hidden; background: var(--bg-3); }
.alr-bar > span { display: block; block-size: 100%; }
.alr-bar > .is-critical { background: var(--critical); }
.alr-bar > .is-warning { background: var(--warning); }
.alr-bar > .is-good { background: var(--good); }
.alr-ch-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; }
.alr-ch { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; gap: 10px 12px; align-items: center; padding-block: 10px; border-block-end: 1px solid var(--line); }
.alr-ch:last-child { border-block-end: 0; }
.alr-ch-icon { display: grid; place-items: center; inline-size: 36px; block-size: 36px; border-radius: var(--radius-sm); background: var(--bg-2); border: 1px solid var(--line); color: var(--ink-2); }
.alr-ch-text { display: flex; flex-direction: column; gap: 3px; min-inline-size: 0; }
.alr-ch-name { font-size: var(--fs-sm); font-weight: 600; color: var(--ink-1); display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
.alr-ch-desc { font-size: 12px; color: var(--ink-3); line-height: 1.45; }
.alr-ch-url { font-family: var(--font-mono); font-size: 12px; color: var(--ink-2); overflow-wrap: anywhere; }
.alr-ch .switch { flex: none; }
@media (max-width: 479.98px) { .alr-ch { grid-template-columns: auto minmax(0, 1fr); } .alr-ch > :last-child { grid-column: 1 / -1; justify-self: start; } }
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
const isHttp = (v) => /^https?:\/\/\S+$/i.test(text(v));
const cssEscape = (v) => (typeof CSS !== 'undefined' && typeof CSS.escape === 'function' ? CSS.escape(String(v)) : String(v).replace(/["\\]/g, '\\$&'));

export default {
  id: 'alerts',
  code: 'AIR-03',
  get title() { return t('alerts.title'); },
  icon: 'bell',

  render(container, ctx = {}) {
    ensureStyle();
    const env = envOf(ctx);
    const { store, bus, psel, fmt, sources } = env;
    const router = ctx.router || null;
    let alive = true;
    let raf = 0;
    let testing = false;
    const unsubs = [];
    const params = { ...(ctx.params || {}), ...hashParams() };
    const local = {
      queue: params.queue === 'immediate' || params.queue === 'standard' ? params.queue : memory.queue,
      showAcked: memory.showAcked,
      expanded: { immediate: false, standard: false },
    };
    let scrollToQueue = !!params.queue;

    const stateOf = () => store.state || {};
    const settings = () => stateOf().settings || {};
    const globalFilters = () => store.filters || stateOf().filters || { siteId: 'all', range: 30, search: '' };
    const now = () => store.now();
    const navigate = (id, p = {}) => { if (router && typeof router.navigate === 'function') router.navigate(id, p); };

    /* ── data (psel definitions) ── */
    function collect() {
      const state = stateOf();
      const g = globalFilters();
      const range = Number(g.range) > 0 ? Number(g.range) : 30;
      const since = now().getTime() - range * 86_400_000;
      let q = null;
      try { q = psel.alertQueue(state, g); } catch { q = null; }
      const visible = (a) => !a.acknowledged || (Date.parse(a.sentAt) || 0) >= since;
      const immediate = arr(q && q.immediate).filter(visible);
      const standard = arr(q && q.standard).filter(visible);
      const all = arr(q && q.immediate).concat(arr(q && q.standard));
      const pending = all.filter((a) => !a.acknowledged);
      const last24 = all.filter((a) => (Date.parse(a.sentAt) || 0) >= now().getTime() - 86_400_000).length;
      const ackMs = all.filter((a) => a.acknowledged && a.ackAt && a.sentAt).map((a) => (Date.parse(a.ackAt) || 0) - (Date.parse(a.sentAt) || 0)).filter((d) => d > 0);
      let th = { alertThreshold: 60, criticalThreshold: 85 };
      try { th = psel.thresholds(state); } catch { /* defaults */ }
      let preview = null;
      try { preview = psel.alertPreview(state, th.alertThreshold, th.criticalThreshold, g, now()); } catch { preview = null; }
      return { state, range, immediate, standard, pending, last24, meanAck: ackMs.length ? ackMs.reduce((s, d) => s + d, 0) / ackMs.length : null, th, preview };
    }

    /* ── heading ── */
    const ackAllHost = h('span');
    const head = h('header', { class: 'view-head' },
      h('div', { class: 'view-head-text' },
        h('span', { class: 'code-tag' }, 'AIR-03'),
        h('h1', { class: 't-page', tabindex: '-1' }, t('alerts.title')),
        h('p', { class: 'view-lead t-lead' }, t('alerts.lead'))),
      h('div', { class: 'view-actions' },
        statusBadge(statusApi.mode(stateOf())),
        ackAllHost,
        button(t('alerts.register'), { variant: 'ghost', icon: 'shield-alert', onClick: () => navigate('airisks') })));

    function paintHeadActions(data) {
      clear(ackAllHost);
      const pendingImmediate = data.immediate.filter((a) => !a.acknowledged);
      if (!pendingImmediate.length) return;
      ackAllHost.appendChild(button(tn('alerts.ackAll', pendingImmediate.length), { variant: 'outline', icon: 'check-circle', onClick: () => {
        let n = 0;
        pendingImmediate.forEach((a) => { if (typeof store.ackAlert === 'function' && store.ackAlert(a.id, ACTOR)) n += 1; });
        toast(n ? tn('alerts.toast.ackedAll', n) : t('alerts.toast.failed'), { tone: n ? 'good' : 'warning' });
      } }));
    }

    /* ── summary ── */
    const summary = h('div', { class: 'summary-strip alr-summary', role: 'group', 'aria-label': t('alerts.summaryAria') });
    function paintSummary(data) {
      clear(summary);
      const pi = data.immediate.filter((a) => !a.acknowledged).length;
      const cell = (icon, tone, label, value, hint) => h('div', { class: 'summary-cell' },
        h('span', { class: ['summary-label', `tone-${tone}`] }, ['critical', 'warning', 'good'].includes(tone) ? glyph(tone, 14) : svgIcon(icon, 14), h('span', {}, label)),
        h('span', { class: 'summary-value' }, value), h('span', { class: 't-helper' }, hint));
      summary.append(
        cell('bell', data.pending.length ? 'warning' : 'good', t('alerts.kpi.pending'), numRun(fmt.num(data.pending.length)), t('alerts.kpi.pendingHint')),
        cell('alert-octagon', pi ? 'critical' : 'good', t('alerts.kpi.immediate'), numRun(fmt.num(pi)), t('alerts.kpi.immediateHint', { score: fmt.num(data.th.criticalThreshold) })),
        cell('clock', 'neutral', t('alerts.kpi.last24', { h: fmt.num(24) }), numRun(fmt.num(data.last24)), t('alerts.kpi.last24Hint')),
        cell('badge-check', 'neutral', t('alerts.kpi.ack'), data.meanAck ? h('span', {}, fmt.duration(data.meanAck)) : '—', data.meanAck ? t('alerts.kpi.ackHint') : t('alerts.kpi.ackNone')));
    }

    /* ── queue ── */
    const queueHost = h('div');
    function alertItem(a, data) {
      const risk = a.risk || null;
      const critical = a.severity === 'critical';
      const main = h('div', { class: 'alr-main' },
        h('div', { class: 'alr-title-row' },
          badge(i18n.label('alertSeverity', a.severity) || a.severity, critical ? 'critical' : 'warning'),
          h('span', { class: 'alr-title' }, ...withCodes(alertTitle(a)))),
        h('div', { class: 'alr-meta' },
          codeSpan(a.code || a.id),
          risk ? h('span', {}, codeSpan(risk.code), ratingBadge(ratingOf(risk.score, env), { sm: true }), numRun(`${fmt.num(Number(risk.score))}/${fmt.num(100)}`)) : h('span', {}, t('alerts.queue.noRisk')),
          h('span', {}, siteName(data.state, a.projectId)),
          h('span', { title: fmt.dateTime(a.sentAt) }, t('alerts.queue.sent', { when: fmt.relative(a.sentAt) })),
          arr(a.channels).length ? h('span', { class: 'alr-channels', role: 'group', 'aria-label': t('alerts.queue.routing') }, ...arr(a.channels).map(channelChip), h('span', { class: 'sim-tag' }, t('alerts.queue.simulated'))) : null,
          a.acknowledged ? h('span', {}, glyph('good', 12), dataText(t('alerts.queue.acked', { by: person(a.ackBy), when: a.ackAt ? fmt.relative(a.ackAt) : '' }))) : null));
      const actions = h('div', { class: 'alr-actions' },
        !a.acknowledged ? button(t('alerts.queue.ack'), { variant: critical ? 'primary' : 'outline', size: 'sm', icon: 'check', attrs: { 'data-focus-key': `ack-${a.id}` }, onClick: () => ack(a) }) : null,
        risk ? button(t('alerts.queue.open'), { variant: 'ghost', size: 'sm', icon: 'shield-alert', attrs: { 'data-focus-key': `open-${a.id}` }, onClick: (e) => openRiskDrawer(ctx, risk.id, { returnFocus: e.currentTarget, urlParam: false }) }) : null);
      return h('li', { class: 'alr-item', 'data-severity': critical ? 'critical' : 'routine', 'data-acked': a.acknowledged ? 'true' : 'false', 'data-id': a.id }, main, actions);
    }

    function ack(a) {
      if (typeof store.ackAlert !== 'function') { toast(t('alerts.toast.failed'), { tone: 'warning' }); return; }
      const res = store.ackAlert(a.id, ACTOR);
      if (!res) { toast(t('alerts.toast.failed'), { tone: 'warning' }); return; }
      toast(t('alerts.toast.acked', { code: a.code || a.id }), { tone: 'good' });
      // focus moves to the next actionable control in the list (the acknowledged row loses its button)
      requestAnimationFrame(() => {
        const next = queueHost.querySelector('.alr-item[data-acked="false"] button') || queueHost.querySelector('.seg-btn[aria-pressed="true"]');
        if (next) { try { next.focus({ preventScroll: true }); } catch { next.focus(); } }
      });
    }

    function paintQueue(data) {
      const pendingOf = (k) => data[k].filter((a) => !a.acknowledged).length;
      if (!local.queue) local.queue = pendingOf('immediate') || !pendingOf('standard') ? 'immediate' : 'standard';
      const k = local.queue;
      const all = data[k];
      const pool = local.showAcked ? all : all.filter((a) => !a.acknowledged);
      const items = local.expanded[k] ? pool : pool.slice(0, QUEUE_DEFAULT);
      const acked = all.length - pendingOf(k);
      const focusKey = document.activeElement && queueHost.contains(document.activeElement) ? (document.activeElement.dataset.focusKey || document.activeElement.id || null) : null;

      const seg = segmented({
        options: [
          { value: 'immediate', label: `${t('alerts.queue.immediate')} (${fmt.num(pendingOf('immediate'))})`, icon: glyph('critical', 14) },
          { value: 'standard', label: `${t('alerts.queue.standard')} (${fmt.num(pendingOf('standard'))})`, icon: glyph('warning', 14) },
        ],
        value: k, ariaLabel: t('alerts.queue.chooser'),
        onChange: (v) => { local.queue = v; memory.queue = v; patchHashParams({ queue: null }); paint(); },
      });
      seg.el.classList.add('seg-sm');
      seg.el.querySelectorAll('button').forEach((b) => { b.dataset.focusKey = `q-${b.dataset.value}`; });
      const toggle = h('label', { class: 'alr-toggle' },
        h('input', { type: 'checkbox', id: 'alr-show-acked', checked: local.showAcked ? true : undefined, 'data-focus-key': 'show-acked', onChange: (e) => { local.showAcked = e.target.checked; memory.showAcked = local.showAcked; paint(); } }),
        h('span', {}, t('alerts.queue.showAcked', { count: fmt.num(acked) })));
      const list = items.length
        ? h('ul', { class: 'alr-list', 'aria-label': `${t('alerts.queue.title')} — ${t(`alerts.queue.${k}`)}` }, items.map((a) => alertItem(a, data)))
        : emptyState({ icon: glyph('good', 32), title: all.length && !local.showAcked ? t('alerts.queue.allAcked') : t(k === 'immediate' ? 'alerts.queue.emptyImmediate' : 'alerts.queue.emptyStandard'), text: all.length && !local.showAcked ? t('alerts.queue.allAckedText') : t('alerts.queue.emptyText') });
      const more = pool.length > QUEUE_DEFAULT ? h('div', { class: 'row', style: { justifyContent: 'center' } },
        button(local.expanded[k] ? t('alerts.queue.showLess') : t('alerts.queue.showAll', { count: fmt.num(pool.length) }), { variant: 'ghost', size: 'sm', icon: local.expanded[k] ? 'chevron-up' : 'chevron-down', attrs: { 'data-focus-key': 'more' }, onClick: () => { local.expanded[k] = !local.expanded[k]; paint(); } })) : null;
      const pending = pendingOf(k);
      const el = card({
        id: 'alerts-queue', code: k === 'immediate' ? 'ALR-01' : 'ALR-02', title: t('alerts.queue.title'),
        subtitle: k === 'immediate' ? t('alerts.queue.immediateSub', { score: fmt.num(data.th.criticalThreshold) }) : t('alerts.queue.standardSub', { alert: fmt.num(data.th.alertThreshold), critical: fmt.num(data.th.criticalThreshold) }),
        actions: [badge(tn('alerts.queue.pending', pending), pending ? (k === 'immediate' ? 'critical' : 'warning') : 'good')],
        body: h('div', { class: 'stack gap-3' }, h('div', { class: 'alr-switch-row' }, seg.el, toggle), list, more),
        footer: h('p', { class: 'text-xs muted', style: { margin: 0 } }, local.showAcked ? t('alerts.queue.footAll', { days: fmt.num(data.range) }) : t('alerts.queue.footPending', { shown: fmt.num(items.length), total: fmt.num(pool.length) })),
      });
      clear(queueHost);
      queueHost.appendChild(el);
      if (focusKey) {
        const target = queueHost.querySelector(`[data-focus-key="${cssEscape(focusKey)}"]`);
        if (target) { try { target.focus({ preventScroll: true }); } catch { target.focus(); } }
      }
    }

    /* ── thresholds (read-only; editor in Settings) ── */
    const thrHost = h('div');
    function paintThresholds(data) {
      const p = data.preview || { immediate: 0, standard: 0, registerOnly: 0, open: 0 };
      const total = Math.max(1, p.open);
      const prevCell = (tone, label, n) => h('div', { class: ['alr-prev-cell', `is-${tone}`] }, h('span', { class: 'lbl' }, glyph(tone, 13), h('span', {}, label)), h('strong', { dir: 'ltr' }, fmt.num(n)));
      const body = h('div', { class: 'stack gap-4' },
        h('div', { class: 'alr-thr' },
          h('div', { class: 'alr-thr-cell' }, h('span', { class: 'k' }, glyph('warning', 14), t('alerts.thr.alert')), h('span', { class: 'v', dir: 'ltr' }, fmt.num(data.th.alertThreshold)), h('span', { class: 'hint' }, t('alerts.thr.alertHint'))),
          h('div', { class: 'alr-thr-cell' }, h('span', { class: 'k' }, glyph('critical', 14), t('alerts.thr.critical')), h('span', { class: 'v', dir: 'ltr' }, fmt.num(data.th.criticalThreshold)), h('span', { class: 'hint' }, t('alerts.thr.criticalHint')))),
        h('div', { class: 'stack gap-2' },
          h('span', { class: 't-label' }, t('alerts.thr.preview', { count: fmt.num(p.open) })),
          h('div', { class: 'alr-prev' }, prevCell('critical', t('alerts.thr.immediate'), p.immediate), prevCell('warning', t('alerts.thr.standard'), p.standard), prevCell('good', t('alerts.thr.registerOnly'), p.registerOnly)),
          h('div', { class: 'alr-bar', role: 'img', 'aria-label': t('alerts.thr.barAria', { immediate: fmt.num(p.immediate), standard: fmt.num(p.standard), register: fmt.num(p.registerOnly) }) },
            h('span', { class: 'is-critical', style: { inlineSize: `${(p.immediate / total) * 100}%` } }),
            h('span', { class: 'is-warning', style: { inlineSize: `${(p.standard / total) * 100}%` } }),
            h('span', { class: 'is-good', style: { inlineSize: `${(p.registerOnly / total) * 100}%` } }))),
        h('p', { class: 'text-xs muted', style: { margin: 0 } }, t('alerts.thr.bands', { red: fmt.num(70), amber: fmt.num(40), amberMax: fmt.num(69) })));
      clear(thrHost);
      thrHost.appendChild(card({
        id: 'alerts-thresholds', code: 'ALR-03', title: t('alerts.thr.title'), subtitle: t('alerts.thr.sub', { min: fmt.num(0), max: fmt.num(100) }), body,
        actions: [button(t('alerts.thr.edit'), { variant: 'outline', size: 'sm', icon: 'sliders', onClick: () => navigate('settings', { section: 'thresholds' }) })],
      }));
    }

    /* ── channels ── */
    const chHost = h('div');
    function paintChannels() {
      const s = settings();
      const routing = { email: true, slack: true, teams: false, whatsapp: false, ...((s.platform && s.platform.channels) || {}) };
      const focusKey = document.activeElement && chHost.contains(document.activeElement) ? document.activeElement.dataset.focusKey : null;
      const rows = CHANNELS.map((c) => {
        const name = i18n.label('channel', c) || c;
        const on = !!routing[c];
        return h('li', { class: 'alr-ch' },
          h('span', { class: 'alr-ch-icon', 'aria-hidden': 'true' }, svgIcon(CHANNEL_ICON[c] || 'bell', 18)),
          h('span', { class: 'alr-ch-text' },
            h('span', { class: 'alr-ch-name' }, h('span', {}, name), statusBadge('not_connected', { size: 'sm' })),
            h('span', { class: 'alr-ch-desc' }, `${on ? t('alerts.ch.routing') : t('alerts.ch.routingOff')} · ${t('alerts.ch.noDelivery')}`)),
          h('button', {
            type: 'button', role: 'switch', class: ['switch', on ? 'is-on' : null], 'aria-checked': on ? 'true' : 'false', 'data-focus-key': `ch-${c}`,
            'aria-label': t('alerts.ch.toggle', { state: on ? t('alerts.ch.disable') : t('alerts.ch.enable'), name }),
            onClick: () => { store.setSettings({ platform: { channels: { [c]: !on } } }); toast(t('alerts.ch.changed', { name }), { tone: 'neutral' }); },
          }));
      });
      const url = text(s.alertWebhook);
      const last = memory.webhook && memory.webhook.url === url ? memory.webhook : null;
      let wbStatus;
      if (!isHttp(url)) wbStatus = statusBadge('not_connected', { size: 'sm' });
      else if (!last) wbStatus = badge(t('alerts.ch.configuredLabel'), 'neutral', { icon: 'plug' });
      else if (last.ok && !last.opaque) wbStatus = statusBadge('live', { size: 'sm', label: t('alerts.ch.okLabel') });
      else if (last.opaque) wbStatus = badge(t('alerts.ch.opaqueLabel'), 'warning', { icon: 'alert-circle' });
      else wbStatus = statusBadge('error', { size: 'sm' });
      const testBtn = isHttp(url) ? button(testing ? t('alerts.ch.testing') : t('alerts.ch.test'), { variant: 'outline', size: 'sm', icon: 'send', attrs: { disabled: testing, 'aria-busy': testing ? 'true' : undefined, 'data-focus-key': 'test' }, onClick: () => sendTest(url) })
        : button(t('alerts.ch.configure'), { variant: 'outline', size: 'sm', icon: 'sliders', onClick: () => navigate('settings', { section: 'notifications' }) });
      const webhookDesc = !isHttp(url) ? t('alerts.ch.webhookNone')
        : (!last ? t('alerts.ch.webhookConfigured')
          : `${last.ok && !last.opaque ? t('alerts.ch.testOk', { status: fmt.num(last.status || 200) }) : (last.opaque ? t('alerts.ch.testOpaque') : t('alerts.ch.testFail', { message: last.message }))} · ${t('alerts.ch.lastTest', { when: fmt.relative(last.at) })}`);
      rows.push(h('li', { class: 'alr-ch' },
        h('span', { class: 'alr-ch-icon', 'aria-hidden': 'true' }, svgIcon('webhook', 18)),
        h('span', { class: 'alr-ch-text' },
          h('span', { class: 'alr-ch-name' }, h('span', {}, t('alerts.ch.webhook')), wbStatus),
          isHttp(url) ? h('span', { class: 'alr-ch-url', dir: 'ltr', lang: 'en' }, url) : null,
          h('span', { class: 'alr-ch-desc', role: 'status' }, webhookDesc)),
        testBtn));
      clear(chHost);
      chHost.appendChild(card({
        id: 'alerts-channels', code: 'ALR-04', title: t('alerts.ch.title'), subtitle: t('alerts.ch.sub'), body: h('ul', { class: 'alr-ch-list' }, rows),
        actions: [button(t('alerts.ch.settings'), { variant: 'ghost', size: 'sm', icon: 'sliders', attrs: { 'data-focus-key': 'ch-settings' }, onClick: () => navigate('settings', { section: 'notifications' }) })],
      }));
      if (focusKey) { const tg = chHost.querySelector(`[data-focus-key="${cssEscape(focusKey)}"]`); if (tg) tg.focus({ preventScroll: true }); }
    }

    async function sendTest(url) {
      if (testing || !sources || typeof sources.postWebhook !== 'function') return;
      testing = true;
      paintChannels();
      const s = settings();
      const routing = (s.platform && s.platform.channels) || {};
      let res;
      try {
        res = await sources.postWebhook(url, { type: 'test', source: 'BILTIX Risk AI', title: t('alerts.ch.payloadTitle'), severity: 'routine', queue: 'standard', channels: CHANNELS.filter((c) => routing[c]), sentAt: now().toISOString(), simulated: false });
      } catch { res = { ok: false, message: '', messageEn: '' }; }
      testing = false;
      const message = i18n.lang() === 'en' ? (res.messageEn || res.message || '') : (res.message || res.messageEn || '');
      memory.webhook = { url, ok: !!res.ok, opaque: !!res.opaque, status: res.status, message, at: new Date(now()).toISOString() };
      if (!alive) return;
      paintChannels();
      if (res.ok && !res.opaque) toast(t('alerts.ch.testOk', { status: fmt.num(res.status || 200) }), { tone: 'good' });
      else if (res.opaque) toast(t('alerts.ch.testOpaque'), { tone: 'warning' });
      else toast(t('alerts.ch.testFail', { message }), { tone: 'critical' });
    }

    /* ── write-back log (simulated) ── */
    const wbHost = h('div');
    let wbTable = null;
    function wbRows(data) {
      const since = now().getTime() - data.range * 86_400_000;
      return arr(data.state.platform && data.state.platform.auditLog).filter((e) => e && e.action === 'writeback' && (Date.parse(e.at) || 0) >= since)
        .sort((a, b) => (Date.parse(b.at) || 0) - (Date.parse(a.at) || 0))
        .map((e, i) => ({ ...e, id: e.id || `wb-${i}` }));
    }
    function wbTaskOf(data, e) {
      const target = String(e.target || '');
      return arr(data.state.platform && data.state.platform.tasks).find((x) => x && x.code && target.includes(x.code)) || null;
    }
    function paintWriteback(data, { live = false } = {}) {
      const rows = wbRows(data);
      const cols = [
        { key: 'at', label: t('alerts.wb.colAt'), priority: 'high', render: (e) => h('span', { class: 'text-xs nowrap', title: fmt.dateTime(e.at) }, fmt.dateTime(e.at)), sortValue: (e) => Date.parse(e.at) || 0 },
        { key: 'target', label: t('alerts.wb.colTarget'), priority: 'high', render: (e) => h('span', { class: 'row gap-1 wrap' }, ...withCodes(text(i18n.L(e, 'target', 'auditLog')) || e.target || '—')) },
        { key: 'detail', label: t('alerts.wb.colDetail'), priority: 'medium', sortable: false, render: (e) => h('span', { class: 'text-sm' }, ...withCodes(text(i18n.L(e, 'detail', 'auditLog')) || '—')) },
        { key: 'state', label: t('alerts.wb.colState'), priority: 'high', sortable: false, render: (e) => { const task = wbTaskOf(data, e); return task ? writebackChip(task, env) : h('span', { class: 'sim-tag' }, t('risk.common.simulated')); } },
      ];
      if (wbTable && live) { wbTable.update(rows, { preserve: true }); return; }
      if (wbTable) wbTable.destroy();
      wbTable = dataTable({ columns: cols, rows, rowKey: 'id', pageSize: 8, caption: t('alerts.wb.caption'), emptyText: t('alerts.wb.empty', { days: fmt.num(data.range) }), initialSort: { key: 'at', dir: 'desc' } });
      const tasks = arr(data.state.platform && data.state.platform.tasks);
      const counts = { synced: 0, pending: 0, failed: 0 };
      tasks.forEach((x) => { const st = x && x.writeback && x.writeback.status; if (st in counts) counts[st] += 1; });
      clear(wbHost);
      wbHost.appendChild(card({
        id: 'alerts-writeback', code: 'ALR-05', title: t('alerts.wb.title'), subtitle: t('alerts.wb.sub'),
        actions: [button(t('alerts.wb.openTasks'), { variant: 'ghost', size: 'sm', icon: 'file-check', onClick: () => navigate('tasks') })],
        body: h('div', { class: 'stack gap-3' },
          h('div', { class: 'row wrap gap-2', role: 'group', 'aria-label': t('alerts.wb.tasksLabel') }, h('span', { class: 'text-xs muted' }, t('alerts.wb.tasksLabel')),
            ...['synced', 'pending', 'failed'].map((k) => badge(`${i18n.label('writeback', k) || k}: ${fmt.num(counts[k])}`, counts[k] ? (k === 'failed' ? 'critical' : k === 'pending' ? 'warning' : 'good') : 'neutral'))),
          wbTable.el),
      }));
    }

    /* ── assemble ── */
    const grid = h('div', { class: 'alr-grid' }, thrHost, chHost);
    const root = h('section', { class: 'view view-alerts' }, head, summary, queueHost, grid, wbHost);
    container.appendChild(root);

    function paint({ live = false } = {}) {
      if (!alive) return;
      const data = collect();
      paintHeadActions(data);
      paintSummary(data);
      paintQueue(data);
      paintThresholds(data);
      paintChannels();
      paintWriteback(data, { live });
    }
    function schedule() {
      if (!alive || raf) return;
      raf = requestAnimationFrame(() => { raf = 0; paint({ live: true }); });
    }

    unsubs.push(bus.on('store:change', (payload) => {
      const path = payload && typeof payload.path === 'string' ? payload.path : '*';
      if (path !== '*' && !/^(platform\.(alerts|aiRisks|tasks|auditLog)|platform$|sites|settings)/.test(path)) return;
      schedule();
    }));
    unsubs.push(bus.on('filters:change', schedule));

    paint();
    motion.enter([head, summary, queueHost, grid, wbHost], { y: 6 });
    if (scrollToQueue) {
      scrollToQueue = false;
      requestAnimationFrame(() => {
        const q = queueHost.firstElementChild;
        if (q) { try { q.scrollIntoView({ block: 'start', behavior: motion.enabled() ? 'smooth' : 'auto' }); } catch { /* ignore */ } }
        patchHashParams({ queue: null });
      });
    }

    return () => {
      alive = false;
      if (raf) cancelAnimationFrame(raf);
      unsubs.splice(0).forEach((u) => { try { u(); } catch { /* ignore */ } });
      if (wbTable) wbTable.destroy();
    };
  },
};
