/**
 * BILTIX Risk AI — view: Go-live readiness (js/views/golive.js) — PLT-04. Route #/golive.
 *
 * docs/golive/plan.md (v4) as a working page: the capability matrix (Built as demo / Ready to connect / Needs
 * client input / Planned), an accessible SVG architecture diagram (field app → API + SSO → integration hub →
 * event bus → data + audit + evidence → AI scoring with explanations → human in the loop → notifications; the
 * site edge sends events only), the integrations map with the material-approval chain first (each connector
 * opens the shared details drawer), the roadmap (phases P0–P6, milestones, the four field priorities Offline /
 * QR / plans / 360° with weeks, deliverables and exit criteria — all estimates), the on-the-ground needs, the
 * client checklist (ticks kept in this browser only, try/catch) with a progress ring, and deep links.
 *
 * Honest status: nothing here is connected; every duration is "(est.)"; roadmap items say "not built yet".
 * Data: js/data/golive.js. Copy: js/i18n/golive.js (namespace 'golive'). Data reaches the DOM only through
 * textContent / h(). Motion: the shell's stage reveal on cards only; nothing animates on updates.
 * Deep link: ?section=matrix|arch|map|roadmap|ground|checklist|links scrolls to that card once.
 */

import { i18n } from '../core/i18n.js';
import dict from '../i18n/golive.js';
import {
  CAPABILITIES, GL_STATUSES, CONNECTORS, PHASES, MILESTONES, PRIORITIES, GROUND, CHECKLIST, TIMELINE_WEEKS,
  CHECKLIST_STORAGE_KEY, ARCH_NODES, readiness, connectorClass, orderedConnectors, weekSpan, spanWeeks,
  checklistIds, sanitizeChecklist, checklistProgress, ringDash, archLayout,
} from '../data/golive.js';
import { openConnectorDetails, glPill, connText, digitsIn, effortText } from './shared/connector-details.js';
import { navMeta } from './index.js';

i18n.register('golive', dict);

const SVG_NS = 'http://www.w3.org/2000/svg';
const XHTML_NS = 'http://www.w3.org/1999/xhtml';
const SECTIONS = ['matrix', 'arch', 'map', 'roadmap', 'ground', 'checklist', 'links'];
const RELATED = ['integrations', 'roadmap', 'spatial', 'bom', 'schedule', 'airisks', 'tasks', 'alerts', 'engine', 'dataquality'];
const GROUND_ICON = { network: 'globe', power: 'bolt', devices: 'phone', cameras: 'cctv', hosting: 'lock' };
const PRIO_ICON = { offline: 'cloud-off', qr: 'grid', plans: 'layers', p360: 'cctv' };
const AXIS_WEEKS = [1, 5, 10, 15, 20, 25, 30, 35, 40];
const ARCH_NARROW_PX = 620;

/** Filter on the capability matrix, remembered for the session. */
let matrixFilter = 'all';

const safe = (fn, fallback) => { try { const v = fn(); return v === undefined ? fallback : v; } catch { return fallback; } };

function svg(tag, attrs = {}, ...children) {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) if (v !== undefined && v !== null && v !== false) el.setAttribute(k, String(v));
  children.flat().forEach((c) => { if (c instanceof Node) el.appendChild(c); else if (c !== null && c !== undefined) el.appendChild(document.createTextNode(String(c))); });
  return el;
}

function readTicks() {
  try {
    const raw = window.localStorage.getItem(CHECKLIST_STORAGE_KEY);
    return { ticks: sanitizeChecklist(raw || '{}'), ok: true };
  } catch { return { ticks: {}, ok: false }; }
}
function writeTicks(ticks) {
  try { window.localStorage.setItem(CHECKLIST_STORAGE_KEY, JSON.stringify(ticks)); return true; } catch { return false; }
}

export default {
  id: 'golive',
  code: 'PLT-04',
  get title() { return i18n.has('core.nav.golive.title') ? i18n.t('core.nav.golive.title') : 'الجاهزية للتشغيل'; },
  icon: 'send',

  render(container, ctx) {
    const { store, fmt, components, router } = ctx;
    const status = ctx.status || null;
    const { h, card, button, segmented, statusBadge, svgIcon, toast } = components;
    const t = (k, p) => i18n.t(`golive.${k}`, p);
    const tn = (k, n, p) => i18n.tn(`golive.${k}`, n, p);
    const D = (s) => digitsIn(fmt, s);
    const rtl = () => i18n.dir() === 'rtl';
    const params = ctx.params || {};
    const now = () => (typeof store.now === 'function' ? store.now() : new Date());
    const href = (id, p = {}) => (router && typeof router.href === 'function' ? router.href(id, p) : `#/${id}`);
    const viewTitle = (id) => safe(() => navMeta(id).title, id);
    const weeksText = (s, e, open = false) => (open ? t('roadmap.weeksOpen', { start: fmt.num(s) }) : t('roadmap.weeks', { start: fmt.num(s), end: fmt.num(e) }));

    const root = h('section', { class: 'view view-golive' });
    container.appendChild(root);
    const cleanups = [];

    /* ───────────────────────── head ───────────────────────── */

    function buildHead() {
      const lang = i18n.lang() === 'en' ? 'en' : 'ar';
      const docHref = lang === 'en' ? 'docs/golive/plan.md' : 'docs/golive/plan-ar.md';
      return h('header', { class: 'view-head' },
        h('div', { class: 'view-head-text' },
          h('span', { class: 'code-tag' }, 'PLT-04'),
          h('h1', { tabindex: '-1' }, t('title')),
          h('p', { class: 'view-lead' }, D(t('lead'))),
          h('ul', { class: 'gl-meta' },
            h('li', {}, svgIcon('file-text', 14), h('span', {}, D(t('metaPlan')))),
            h('li', {}, svgIcon('clock', 14), h('span', {}, t('metaEst'))),
            h('li', {}, svgIcon('map-pin', 14), h('span', {}, t('metaScope'))))),
        h('div', { class: 'view-actions' },
          statusBadge('demo', { size: 'sm' }),
          h('a', { class: 'btn btn-outline btn-sm gl-doc-link', href: docHref, target: '_blank', rel: 'noopener', 'aria-label': t('docsAria') }, svgIcon('external', 15), h('span', {}, t('docs')))));
    }

    function buildBanner() {
      return h('div', { class: ['note', 'is-demo', 'gl-banner'], role: 'note', style: { '--tone': 'var(--brand)' } },
        h('span', { class: 'row gap-2', style: { alignItems: 'flex-start' } }, svgIcon('flask', 16), h('span', {}, D(t('banner')))));
    }

    /* ───────────────────────── capability matrix ───────────────────────── */

    function summaryBar(r, { compact = false } = {}) {
      return h('div', { class: ['gl-bar', compact ? 'is-compact' : null], role: 'img', 'aria-label': `${t('matrix.summaryAria')}: ${GL_STATUSES.map((s) => `${t(`status.${s}`)} ${fmt.num(r.counts[s])}`).join('، ')}` },
        ...GL_STATUSES.filter((s) => r.counts[s] > 0).map((s) => h('span', { class: ['gl-bar-seg', `is-${s}`], style: { flexGrow: String(r.counts[s]) }, title: `${t(`status.${s}`)}: ${fmt.num(r.counts[s])}` })));
    }

    function buildMatrix() {
      const r = readiness(CAPABILITIES);
      const list = h('ol', { class: 'gl-caps', 'aria-label': t('matrix.title') });
      const countEl = h('span', { class: 'gl-count', 'aria-live': 'polite' });
      function paint() {
        const items = CAPABILITIES.map((c, i) => ({ c, n: i + 1 })).filter(({ c }) => matrixFilter === 'all' || c.status === matrixFilter);
        countEl.textContent = tn('matrix.shown', items.length);
        list.replaceChildren(...items.map(({ c, n }) => h('li', { class: ['gl-cap', `is-${c.status}`], value: String(n) },
          h('div', { class: 'gl-cap-head' },
            h('span', { class: 'gl-cap-no', 'aria-hidden': 'true' }, fmt.num(n)),
            h('h3', { class: 'gl-cap-name' }, D(t(`cap.${c.id}.name`))),
            glPill(h, c.status)),
          h('dl', { class: 'gl-cap-grid' },
            h('div', { class: 'gl-cap-cell' }, h('dt', {}, t('matrix.today')), h('dd', {}, D(t(`cap.${c.id}.today`)))),
            h('div', { class: 'gl-cap-cell is-needed' }, h('dt', {}, t('matrix.needed')), h('dd', {}, D(t(`cap.${c.id}.needed`))))),
          h('div', { class: 'gl-cap-foot' },
            h('span', { class: 'gl-tagline' }, h('span', { class: 'gl-k' }, `${t('matrix.owner')}:`), h('bdi', { class: 'gl-code' }, c.owner)),
            h('span', { class: 'gl-tagline' }, h('span', { class: 'gl-k' }, `${t('matrix.phase')}:`), h('bdi', { class: 'gl-code' }, c.phase)),
            c.route ? h('a', { class: 'gl-link', href: href(c.route) }, h('span', {}, t('arch.open', { view: viewTitle(c.route) })), svgIcon('chevron-end', 14)) : null))));
      }
      const seg = segmented({
        ariaLabel: t('matrix.filterAria'),
        value: matrixFilter,
        options: [{ value: 'all', label: `${t('matrix.all')} (${fmt.num(r.total)})` }, ...GL_STATUSES.map((s) => ({ value: s, label: `${t(`status.${s}`)} (${fmt.num(r.counts[s])})` }))],
        onChange: (v) => { matrixFilter = GL_STATUSES.includes(v) ? v : 'all'; paint(); },
      });
      seg.el.classList.add('seg-sm', 'gl-seg');
      paint();
      const legend = h('ul', { class: 'gl-legend' }, ...GL_STATUSES.map((s) => h('li', {}, glPill(h, s, { compact: true }), h('span', { class: 't-helper' }, t(`statusHint.${s}`)))));
      return card({
        id: 'gl-matrix', code: 'GL-01', title: t('matrix.title'), subtitle: D(t('matrix.sub')),
        body: h('div', { class: 'stack gap-3' }, summaryBar(r), legend, h('div', { class: 'gl-toolbar' }, seg.el, countEl), list,
          h('p', { class: 't-helper' }, t('owners'))),
      });
    }

    /* ───────────────────────── architecture ───────────────────────── */

    function archSvg(mode) {
      const L = archLayout(mode, rtl());
      const titleId = `gl-arch-t-${mode}`; const descId = `gl-arch-d-${mode}`;
      const markerId = `gl-arrow-${mode}`;
      const el = svg('svg', { class: ['gl-arch-svg', `is-${mode}`].join(' '), viewBox: `0 0 ${L.W} ${L.H}`, role: 'group', 'aria-labelledby': titleId, 'aria-describedby': descId, focusable: 'false' },
        svg('title', { id: titleId }, t('arch.svgTitle')),
        svg('desc', { id: descId }, t('arch.svgDesc')),
        svg('defs', {}, svg('marker', { id: markerId, viewBox: '0 0 10 10', refX: '6', refY: '5', markerWidth: '7', markerHeight: '7', orient: 'auto-start-reverse' },
          svg('path', { d: 'M0 0 L10 5 L0 10 z', class: 'gl-arch-head' }))));
      for (const l of L.links) {
        el.appendChild(svg('path', { d: l.d, class: ['gl-arch-link', l.label ? 'is-events' : null].filter(Boolean).join(' '), 'marker-end': `url(#${markerId})`, 'aria-hidden': 'true' }));
        if (l.label && mode === 'wide') {
          el.appendChild(svg('text', { x: l.lx, y: l.ly, class: 'gl-arch-label', 'text-anchor': 'start', direction: rtl() ? 'rtl' : 'ltr', 'aria-hidden': 'true' }, t('arch.events')));
        }
      }
      ARCH_NODES.forEach((n, i) => {
        const p = L.nodes[n.id];
        const fo = svg('foreignObject', { x: p.x, y: p.y, width: p.w, height: p.h });
        const div = document.createElementNS(XHTML_NS, 'div');
        div.setAttribute('class', `gl-arch-node is-${n.today}${n.site ? ' is-site' : ''}`);
        div.setAttribute('dir', i18n.dir());
        const name = document.createElementNS(XHTML_NS, 'span'); name.setAttribute('class', 'gl-arch-name'); name.textContent = `${fmt.num(i + 1)}. ${t(`arch.nodes.${n.id}.name`)}`;
        const sub = document.createElementNS(XHTML_NS, 'span'); sub.setAttribute('class', 'gl-arch-sub'); sub.textContent = D(t(`arch.nodes.${n.id}.sub`));
        const tag = document.createElementNS(XHTML_NS, 'span'); tag.setAttribute('class', 'gl-arch-tag'); tag.textContent = t(`arch.nodes.${n.id}.tag`);
        div.append(name, sub, tag);
        fo.appendChild(div);
        const rect = svg('rect', { x: p.x + 0.5, y: p.y + 0.5, width: p.w - 1, height: p.h - 1, rx: 12, class: `gl-arch-box is-${n.today}${n.site ? ' is-site' : ''}`, 'aria-hidden': 'true' });
        const group = n.route
          ? svg('a', { href: href(n.route), class: 'gl-arch-a', 'aria-label': `${t(`arch.nodes.${n.id}.name`)} — ${t(`arch.nodes.${n.id}.tag`)}. ${t('arch.open', { view: viewTitle(n.route) })}` }, rect, fo)
          : svg('g', { class: 'gl-arch-g', role: 'img', 'aria-label': `${t(`arch.nodes.${n.id}.name`)} — ${t(`arch.nodes.${n.id}.tag`)}` }, rect, fo);
        el.appendChild(group);
      });
      return el;
    }

    function buildArch() {
      const host = h('div', { class: 'gl-arch' });
      let mode = null;
      const paint = (width) => {
        const next = width > 0 && width < ARCH_NARROW_PX ? 'narrow' : 'wide';
        if (next === mode) return;
        mode = next;
        host.replaceChildren(archSvg(mode));
      };
      paint(safe(() => container.getBoundingClientRect().width, 1000));
      if (typeof ResizeObserver === 'function') {
        const ro = new ResizeObserver((entries) => { const w = entries[0] && entries[0].contentRect ? entries[0].contentRect.width : 0; if (w) paint(w); });
        ro.observe(host);
        cleanups.push(() => ro.disconnect());
      }
      const asText = h('details', { class: 'gl-arch-text' },
        h('summary', {}, t('arch.asText')),
        h('ol', {}, ...ARCH_NODES.map((n) => h('li', {},
          h('strong', {}, t(`arch.nodes.${n.id}.name`)), ' — ', D(t(`arch.nodes.${n.id}.sub`)), ' · ', h('em', {}, t(`arch.nodes.${n.id}.tag`)),
          n.route ? h('span', {}, ' · ', h('a', { href: href(n.route) }, viewTitle(n.route))) : null))));
      return card({ id: 'gl-arch', code: 'GL-02', title: t('arch.title'), subtitle: D(t('arch.sub')), body: h('div', { class: 'stack gap-3' }, host, asText) });
    }

    /* ───────────────────────── integrations map ───────────────────────── */

    const allRecords = () => [
      ...(Array.isArray(store.state && store.state.integrations) ? store.state.integrations : []).map((rec) => ({ rec, ns: 'integrations' })),
      ...(safe(() => store.state.platform.connectors, []) || []).map((rec) => ({ rec, ns: 'connectors' })),
    ].filter((x) => x.rec && x.rec.id);
    function recordsFor(entry) {
      const byId = new Map(allRecords().map((x) => [x.rec.id, x]));
      return entry.recIds.map((id) => byId.get(id)).filter(Boolean).map(({ rec, ns }) => ({
        id: rec.id,
        name: String(i18n.L(rec, 'name', ns) || rec.name || rec.id).replace(/\bBiltix\b/g, 'BILTIX'),
        status: safe(() => status.connector(store.state, rec, now()), 'not_connected') || 'not_connected',
      }));
    }
    function openDetails(entry, returnFocus) {
      openConnectorDetails(ctx, { entry, records: recordsFor(entry), returnFocus });
    }
    function connItem(entry, { step = false } = {}) {
      const recs = recordsFor(entry);
      const name = connText(entry.key, 'name');
      const st = recs.length ? recs[0].status : 'not_connected';
      const btn = button(t('map.details'), { variant: 'ghost', size: 'sm', icon: 'info', onClick: (e) => openDetails(entry, e.currentTarget), attrs: { 'aria-label': t('map.detailsAria', { name }) } });
      return h(step ? 'li' : 'li', { class: [step ? 'gl-step' : 'gl-conn', `is-${connectorClass(entry)}`] },
        step ? h('span', { class: 'gl-step-no' }, t('map.step', { n: fmt.num(entry.chain) })) : null,
        h('span', { class: 'gl-conn-name' }, D(name)),
        h('span', { class: 'gl-conn-meta' },
          h('span', {}, t(`dir.${entry.dir || 'none'}`)), h('span', { 'aria-hidden': 'true' }, '·'),
          h('span', { title: t('effort.scale') }, `${t('effort.label')} ${effortText(entry)}`)),
        h('span', { class: 'gl-conn-status' }, glPill(h, connectorClass(entry), { compact: true }), recs.length ? statusBadge(st, { size: 'sm' }) : h('span', { class: 'gl-missing' }, t('map.missing'))),
        h('span', { class: 'gl-conn-act' }, btn));
    }
    function buildMap() {
      const ordered = orderedConnectors(CONNECTORS);
      const chain = ordered.filter((c) => c.wave === 1);
      const group = (wave) => h('section', { class: 'gl-conn-group' },
        h('h3', { class: 'gl-sub-title' }, t(`map.wave${wave}`)),
        h('ul', { class: 'gl-conns' }, ...ordered.filter((c) => c.wave === wave).map((c) => connItem(c))));
      return card({
        id: 'gl-map', code: 'GL-03', title: t('map.title'), subtitle: D(t('map.sub')),
        body: h('div', { class: 'stack gap-4' },
          h('section', { class: 'gl-chain-wrap' },
            h('h3', { class: 'gl-sub-title' }, t('map.chainTitle')),
            h('p', { class: 't-helper' }, D(t('map.chainSub'))),
            h('ol', { class: 'gl-chain' }, ...chain.map((c) => connItem(c, { step: true })))),
          group(2), group(3),
          h('p', { class: 't-helper' }, D(t('effort.scale')))),
      });
    }

    /* ───────────────────────── roadmap ───────────────────────── */

    function bar(start, end, cls = '') {
      const s = weekSpan(start, end, TIMELINE_WEEKS);
      return h('span', { class: ['gl-gantt-bar', cls || null], style: { insetInlineStart: `${s.startPct}%`, inlineSize: `${s.widthPct}%` } });
    }
    function buildGantt() {
      const axis = h('div', { class: 'gl-gantt-row is-axis', 'aria-hidden': 'true' },
        h('span', { class: 'gl-gantt-label' }, t('roadmap.axis')),
        h('span', { class: 'gl-gantt-track' }, ...AXIS_WEEKS.map((w) => h('span', { class: 'gl-gantt-tick', style: { insetInlineStart: `${((w - 0.5) / TIMELINE_WEEKS) * 100}%` } }, fmt.num(w)))));
      const rows = PHASES.map((p) => {
        const label = t(`phase.${p.id}.name`);
        const weeks = weeksText(p.start, p.end, p.open);
        return h('li', { class: ['gl-gantt-row', p.field ? 'is-field' : null] },
          h('span', { class: 'gl-gantt-label' }, h('span', { class: 'gl-gantt-name' }, D(label)), h('span', { class: 'gl-gantt-weeks' }, `${weeks} (${t('roadmap.est')})`)),
          h('span', { class: 'gl-gantt-track', 'aria-hidden': 'true' }, bar(p.start, p.end, p.open ? 'is-open' : (p.field ? 'is-field' : ''))));
      });
      const ms = h('div', { class: 'gl-gantt-row is-ms' },
        h('span', { class: 'gl-gantt-label' }, t('roadmap.milestones')),
        h('span', { class: 'gl-gantt-track', 'aria-hidden': 'true' }, ...MILESTONES.map((m) => h('span', { class: 'gl-ms', style: { insetInlineStart: `${((m.week - 0.5) / TIMELINE_WEEKS) * 100}%` }, title: D(t(`ms.${m.id}`)) }, h('span', { class: 'gl-ms-dot' }), h('span', { class: 'gl-ms-id' }, m.id)))));
      const msList = h('ul', { class: 'gl-ms-list' }, ...MILESTONES.map((m) => h('li', {}, D(t(`ms.${m.id}`)))));
      return h('div', { class: 'gl-gantt' }, axis, h('ol', { class: 'gl-gantt-rows', 'aria-label': t('roadmap.ganttAria') }, ...rows), ms, msList);
    }
    function buildPriority(p) {
      const k = `prio.${p.key}`;
      return h('article', { class: 'gl-prio', 'aria-labelledby': `gl-prio-${p.key}` },
        h('header', { class: 'gl-prio-head' },
          h('span', { class: 'gl-prio-icon', 'aria-hidden': 'true' }, svgIcon(PRIO_ICON[p.key] || 'map-pin', 18)),
          h('div', { class: 'gl-prio-titles' },
            h('h3', { id: `gl-prio-${p.key}`, class: 'gl-prio-name' }, t(`${k}.name`)),
            h('span', { class: 'gl-prio-weeks' }, `${p.phase} · ${weeksText(p.start, p.end)} · ${tn('roadmap.duration', spanWeeks(p.start, p.end))} (${t('roadmap.est')})`)),
          h('span', { class: 'gl-concept' }, t('roadmap.notBuilt'))),
        h('div', { class: 'gl-prio-track', 'aria-hidden': 'true' }, ...p.steps.map((s) => bar(s.start, s.end, 'is-field'))),
        h('dl', { class: 'gl-prio-facts' },
          h('div', {}, h('dt', {}, t('roadmap.today')), h('dd', {}, D(t(`${k}.today`)))),
          h('div', {}, h('dt', {}, t('roadmap.target')), h('dd', {}, D(t(`${k}.target`)))),
          h('div', {}, h('dt', {}, t('roadmap.steps')), h('dd', {}, h('ul', { class: 'gl-steps' }, ...p.steps.map((s) => h('li', {}, D(t(`${k}.steps.${s.id}`)), h('span', { class: 'gl-step-weeks' }, ` · ${weeksText(s.start, s.end)}`)))))),
          h('div', {}, h('dt', {}, t('roadmap.exit')), h('dd', {}, D(t(`${k}.exit`)))),
          h('div', {}, h('dt', {}, t('roadmap.ground')), h('dd', {}, D(t(`${k}.ground`))))),
        p.route ? h('a', { class: 'gl-link', href: href(p.route) }, h('span', {}, t('roadmap.open', { view: viewTitle(p.route) })), svgIcon('chevron-end', 14)) : null);
    }
    function buildRoadmap() {
      return card({
        id: 'gl-roadmap', code: 'GL-04', title: t('roadmap.title'), subtitle: D(t('roadmap.sub')),
        body: h('div', { class: 'stack gap-4' }, buildGantt(),
          h('details', { class: 'gl-phase-details' }, h('summary', {}, `${t('roadmap.deliverables')} · ${t('roadmap.exit')}`),
            h('dl', { class: 'gl-phase-list' }, ...PHASES.map((p) => h('div', {},
              h('dt', {}, `${D(t(`phase.${p.id}.name`))} — ${weeksText(p.start, p.end, p.open)} (${t('roadmap.est')})`),
              h('dd', {}, h('strong', {}, `${t('roadmap.deliverables')}: `), D(t(`phase.${p.id}.deliverables`))),
              h('dd', {}, h('strong', {}, `${t('roadmap.exit')}: `), D(t(`phase.${p.id}.exit`))))))),
          h('div', { class: 'gl-prios' }, ...PRIORITIES.map(buildPriority))),
      });
    }

    /* ───────────────────────── on the ground ───────────────────────── */

    function buildGround() {
      return card({
        id: 'gl-ground', code: 'GL-05', title: t('ground.title'), subtitle: D(t('ground.sub')),
        body: h('div', { class: 'gl-ground' }, ...GROUND.map((g) => {
          const items = [];
          for (let i = 1; i <= 8 && i18n.has(`golive.ground.${g}.i${i}`); i += 1) items.push(h('li', {}, D(t(`ground.${g}.i${i}`))));
          return h('section', { class: 'gl-ground-item', 'aria-labelledby': `gl-ground-${g}` },
            h('h3', { id: `gl-ground-${g}`, class: 'gl-ground-name' }, h('span', { class: 'gl-prio-icon', 'aria-hidden': 'true' }, svgIcon(GROUND_ICON[g] || 'info', 16)), h('span', {}, t(`ground.${g}.name`))),
            h('ul', { class: 'gl-ground-list' }, ...items));
        })),
      });
    }

    /* ───────────────────────── client checklist ───────────────────────── */

    function buildChecklist() {
      const loaded = readTicks();
      let ticks = loaded.ticks;
      let storageOk = loaded.ok;
      const R = 30;
      const geo0 = ringDash(0, R);
      const arc = svg('circle', { cx: 36, cy: 36, r: R, class: 'gl-ring-arc', 'stroke-dasharray': geo0.circumference.toFixed(2), 'stroke-dashoffset': geo0.offset.toFixed(2), transform: 'rotate(-90 36 36)' });
      const pctText = svg('text', { x: 36, y: 41, 'text-anchor': 'middle', class: 'gl-ring-text' }, '');
      const ring = svg('svg', { class: 'gl-ring', viewBox: '0 0 72 72', role: 'img', focusable: 'false' }, svg('circle', { cx: 36, cy: 36, r: R, class: 'gl-ring-track' }), arc, pctText);
      const ringLabel = svg('title', {}, '');
      ring.insertBefore(ringLabel, ring.firstChild);
      const progressText = h('strong', { class: 'gl-progress-text' });
      const storageNote = h('p', { class: 't-helper gl-storage', role: 'status' });
      const groupCounts = new Map();
      const boxes = new Map();

      function paint() {
        const p = checklistProgress(ticks, CHECKLIST);
        const geo = ringDash(p.pct, R);
        arc.setAttribute('stroke-dashoffset', geo.offset.toFixed(2));
        pctText.textContent = fmt.pct(p.pct);
        const aria = t('checklist.ringAria', { done: fmt.num(p.done), total: fmt.num(p.total), pct: fmt.pct(p.pct) });
        ring.setAttribute('aria-label', aria);
        ringLabel.textContent = aria;
        progressText.textContent = t('checklist.progress', { done: fmt.num(p.done), total: fmt.num(p.total) });
        for (const [gid, el] of groupCounts) { const g = p.byGroup[gid] || { done: 0, total: 0 }; el.textContent = t('checklist.groupCount', { done: fmt.num(g.done), total: fmt.num(g.total) }); el.classList.toggle('is-done', g.total > 0 && g.done === g.total); }
        storageNote.textContent = storageOk ? t('checklist.local') : t('checklist.storageOff');
        storageNote.classList.toggle('is-warn', !storageOk);
      }
      const groups = CHECKLIST.map((g) => {
        const countEl = h('span', { class: 'gl-group-count' });
        groupCounts.set(g.id, countEl);
        return h('fieldset', { class: 'gl-group' },
          h('legend', {}, h('span', {}, t(`checklist.groups.${g.id}`)), countEl),
          ...g.items.map((id) => {
            const box = h('input', { type: 'checkbox', id: `gl-ck-${id}`, name: id, class: 'gl-check' });
            box.checked = ticks[id] === true;
            box.addEventListener('change', () => {
              const next = { ...ticks };
              if (box.checked) next[id] = true; else delete next[id];
              ticks = sanitizeChecklist(next, checklistIds(CHECKLIST));
              storageOk = writeTicks(ticks);
              paint();
            });
            boxes.set(id, box);
            return h('label', { class: 'gl-check-row', for: `gl-ck-${id}` }, box, h('span', {}, D(t(`checklist.items.${id}`))));
          }));
      });
      const resetBtn = button(t('checklist.reset'), {
        variant: 'ghost', size: 'sm', icon: 'refresh',
        onClick: () => {
          ticks = {};
          try { window.localStorage.removeItem(CHECKLIST_STORAGE_KEY); storageOk = true; } catch { storageOk = false; }
          for (const b of boxes.values()) b.checked = false;
          paint();
          toast(t('checklist.resetDone'), { tone: 'neutral' });
        },
      });
      paint();
      return card({
        id: 'gl-checklist', code: 'GL-06', title: t('checklist.title'), subtitle: t('checklist.sub'),
        body: h('div', { class: 'stack gap-3' },
          h('div', { class: 'gl-progress' }, ring, h('div', { class: 'gl-progress-main' }, progressText, storageNote), resetBtn),
          h('div', { class: 'gl-groups' }, ...groups)),
      });
    }

    /* ───────────────────────── related screens ───────────────────────── */

    function buildLinks() {
      return card({
        id: 'gl-links', code: 'GL-07', title: t('links.title'), subtitle: t('links.sub'),
        body: h('ul', { class: 'gl-links' }, ...RELATED.map((id) => {
          const m = safe(() => navMeta(id), { title: id, icon: 'grid', code: '' });
          return h('li', {}, h('a', { class: 'gl-linkcard', href: href(id) },
            h('span', { class: 'gl-prio-icon', 'aria-hidden': 'true' }, svgIcon(m.icon || 'grid', 16)),
            h('span', { class: 'gl-linkcard-text' }, h('span', { class: 'gl-linkcard-title' }, m.title), m.code ? h('bdi', { class: 'gl-code' }, m.code) : null)));
        })),
      });
    }

    /* ───────────────────────── build ───────────────────────── */

    root.replaceChildren(buildHead(), buildBanner(), buildMatrix(), buildArch(), buildMap(), buildRoadmap(), buildGround(), buildChecklist(), buildLinks());

    // ?section=… → scroll to that card once, then drop the parameter.
    if (SECTIONS.includes(params.section)) {
      requestAnimationFrame(() => {
        const target = root.querySelector(`#gl-${params.section}`);
        if (!target) return;
        const smooth = ctx.motion && typeof ctx.motion.enabled === 'function' && ctx.motion.enabled();
        try { target.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto', block: 'start' }); } catch { target.scrollIntoView(); }
        target.tabIndex = -1;
        try { target.focus({ preventScroll: true }); } catch { /* ignore */ }
        try { history.replaceState(history.state, '', href('golive')); } catch { /* ignore */ }
      });
    }

    return () => {
      cleanups.splice(0).forEach((fn) => { try { fn(); } catch { /* ignore */ } });
      root.remove();
    };
  },
};
