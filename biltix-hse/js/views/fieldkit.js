/**
 * BILTIX Risk AI — Field kit (js/views/fieldkit.js) — FLD-01, route #/fieldkit. Guide: docs/offline.md.
 *
 *   FLD-02 Connectivity & sync   network (+ "simulate an outage"), offline copy, storage, outbox list with
 *                                "waiting to sync" chips, sync now / clear synced — honest: no server in the demo
 *   FLD-03 Scan                  BarcodeDetector + camera (explained first) or manual entry; ?code=BX1:… deep link;
 *                                the result opens the right record: zone → #/spatial?site&zone (+ report an
 *                                observation), crane → pre-use checklist, camera → #/spatial?camera, crate →
 *                                submittal / PO status and install verdict, permit → #/permits?id
 *   FLD-05 Field actions         acknowledge alerts, start tasks — through the outbox
 *   FLD-04 QR labels             generated client-side from the demo data, printable A4 sheet (css/field.css)
 *   FLD-06 What is needed on site devices, MDM, outdoor labels, server — not built
 *
 * Every action goes through js/core/offline.js act() (idempotency key per intent). Data reaches the DOM through
 * components.h / textContent. Strings: dictionary 'fieldkit'.
 *
 * Repaints: the page repaints on outbox, network, filter and live-data events (paintAll, one per frame). Those
 * never rebuild the open scan result or an open form — refreshResult() patches the live parts in place — and the
 * field-action lists are rebuilt only when their rows change, with the focus kept (docs/offline.md "Repaints").
 */
import { components } from '../ui/components.js';
import { i18n, t, tn, L } from '../core/i18n.js';
import dict from '../i18n/fieldkit.js';
import * as off from '../core/offline.js';
import { makePayload, parsePayload, qrSvg, scanSupport, startScan, QR_KINDS } from '../ui/qr.js';
import { SITE_PLANS, CAMERAS, inZone, zoneLinks } from '../data/spatial-seed.js';
import { CATEGORIES } from '../data/seed.js';
import { offlinePanel, dictList } from './shared/offline-panel.js';

i18n.register('fieldkit', dict);

const { h, clear, card, button, statusBadge, svgIcon, segmented, toast } = components;

/** Demo crates of the first façade batch (scenario: PO-S1-2026-0871 → submittal MAR-S1-CW-014 → BQ2 → AIR-1069). */
export const CRATES = Object.freeze([1, 2, 3, 4].map((n) => Object.freeze({
  id: `CR-0871-0${n}`, n, siteId: 'S1', zoneId: 'S1-Z4', units: 6,
  po: 'PO-S1-2026-0871', submittal: 'MAR-S1-CW-014', boqItemId: 'BQ2', riskCode: 'AIR-1069',
})));
const SAMPLE_CODES = ['BX1:Z:S1-Z2', 'BX1:E:S1-TC-2', 'BX1:M:CR-0871-01', 'BX1:P:PTW-5529'];
const KIND_ICON = { Z: 'map-pin', E: 'crane', M: 'package', P: 'permit' };
const OPEN_PERMIT = ['نشط', 'بانتظار الاعتماد', 'معلق'];
const CRANE_INSPECTION = 'فحص رافعات';
const DONE_INSPECTION = 'منجز';
const FIELD_ACTOR = 'عُدّة الميدان';

const arr = (v) => (Array.isArray(v) ? v : []);
const platformOf = (state) => (state && state.platform) || {};

/* ------------------------------------------------------------------ */
/* Label registry (from the seed data in the store)                   */
/* ------------------------------------------------------------------ */

function siteName(site) { return (site && (L(site, 'name', 'sites') || site.name)) || '—'; }
function zoneName(site, zoneId) {
  const zones = arr(site && site.zones);
  const i = zones.findIndex((z) => z.id === zoneId);
  if (i === -1) return zoneId || '—';
  const zl = arr(L(site, 'zones', 'sites'))[i];
  return (zl && zl.name) || zones[i].name || zoneId;
}

/**
 * Every label for one site (or all sites when siteId is falsy):
 * { payload, k, id, siteId, zoneId, title, sub, ref: { kind, …record ids } }.
 */
export function buildRegistry(state, siteId = null) {
  const out = [];
  const sites = arr(state && state.sites).filter((s) => s && (!siteId || s.id === siteId));
  for (const site of sites) {
    for (const z of arr(site.zones)) out.push({ payload: makePayload('Z', z.id), k: 'Z', id: z.id, siteId: site.id, zoneId: z.id, title: zoneName(site, z.id), sub: siteName(site), ref: { kind: 'zone' } });
    const plan = SITE_PLANS[site.id];
    for (const c of arr(plan && plan.cranes)) {
      const zone = arr(site.zones).find((z) => inZone(z, c.x, c.y));
      const id = `${site.id}-${c.id}`;
      out.push({ payload: makePayload('E', id), k: 'E', id, siteId: site.id, zoneId: zone ? zone.id : null, title: t(c.type === 'tower' ? 'fieldkit.equip.tower' : 'fieldkit.equip.mobile', { id: c.id }), sub: zone ? zoneName(site, zone.id) : siteName(site), ref: { kind: 'crane', craneId: c.id } });
    }
    for (const cam of CAMERAS.filter((c) => c.siteId === site.id)) {
      out.push({ payload: makePayload('E', cam.id), k: 'E', id: cam.id, siteId: site.id, zoneId: cam.zoneId, title: t('fieldkit.equip.camera', { id: cam.id }), sub: L(cam, 'purpose', 'cameras') || cam.purpose || '', ref: { kind: 'camera', cameraId: cam.id } });
    }
    for (const cr of CRATES.filter((c) => c.siteId === site.id)) {
      out.push({ payload: makePayload('M', cr.id), k: 'M', id: cr.id, siteId: site.id, zoneId: cr.zoneId, title: t('fieldkit.material.crate', { n: cr.n }), sub: t('fieldkit.material.crateSub', { units: cr.units, po: cr.po }), ref: { kind: 'crate', crate: cr } });
    }
    for (const p of arr(state.permits).filter((x) => x && x.siteId === site.id && OPEN_PERMIT.includes(x.status) && x.code)) {
      out.push({ payload: makePayload('P', p.code), k: 'P', id: p.code, siteId: site.id, zoneId: p.zoneId, title: `${p.code} · ${i18n.label('permitType', p.type)}`, sub: zoneName(site, p.zoneId), ref: { kind: 'permit', permitId: p.id } });
    }
  }
  return out;
}

/** Material status for a crate: the submittal and PO from the store when present, else the scenario facts. */
export function materialStatus(state, crate) {
  const p = platformOf(state);
  const sub = arr(p.submittals).find((s) => s && s.code === crate.submittal) || null;
  const boq = arr(p.boqItems).find((b) => b && b.id === crate.boqItemId) || null;
  const procurement = boq && boq.procurement ? boq.procurement : null;
  const risk = arr(p.aiRisks).find((r) => r && r.code === crate.riskCode) || null;
  const revs = sub ? arr(sub.revisions) : [];
  const last = revs.length ? revs[revs.length - 1] : null;
  const code = last && last.code ? String(last.code) : null;
  const approved = code === 'A' || code === 'B';
  return {
    fromStore: Boolean(sub),
    rev: sub ? (Number.isFinite(Number(sub.currentRev)) ? Number(sub.currentRev) : (last ? last.rev : 1)) : 1,
    code,
    approved,
    statusText: approved ? t('fieldkit.material.approved') : (code ? t('fieldkit.material.codeLabel', { code }) : t('fieldkit.material.underReview')),
    po: (procurement && procurement.poRef) || crate.po,
    poStatus: procurement && procurement.poStatus ? ((i18n.lang() === 'en' && procurement.poStatusEn) || procurement.poStatus) : t('fieldkit.material.poBlocked'),
    boq,
    risk,
  };
}

/* ------------------------------------------------------------------ */
/* Styles live in css/field.css (linked from index.html)               */
/* ------------------------------------------------------------------ */

export default {
  id: 'fieldkit',
  code: 'FLD-01',
  get title() { return t('fieldkit.title'); },
  icon: 'helmet',

  render(container, ctx = {}) {
    const { store, bus, fmt, router, sel, psel } = ctx;
    const params = ctx.params || {};
    const state = () => (store && store.state) || {};
    const now = () => (store && typeof store.now === 'function' ? store.now() : new Date());
    const navigate = (id, p = {}) => { if (router && typeof router.navigate === 'function') router.navigate(id, p); };
    const num = (n) => (fmt && typeof fmt.num === 'function' ? fmt.num(n) : String(n));
    const time = (iso) => { try { return fmt.time(iso); } catch { return ''; } };
    const box = () => off.outbox();
    const entryOf = (key) => { const b = box(); return b ? b.list().find((e) => e.key === key) || null : null; };
    let alive = true;
    let scanner = null;
    const unsubs = [];

    const chip = (status) => h('span', { class: 'fk-chip', 'data-state': status }, h('span', { class: 'fk-chip-dot', 'aria-hidden': 'true' }), t(`fieldkit.outbox.${status}`));

    /* ── heading ── */
    const head = h('header', { class: 'view-head' },
      h('div', { class: 'view-head-text' },
        h('span', { class: 'code-tag' }, 'FLD-01'),
        h('h1', { class: 't-page', tabindex: '-1' }, t('fieldkit.title')),
        h('p', { class: 'view-lead t-lead' }, t('fieldkit.lead'))),
      h('div', { class: 'view-actions' }, statusBadge('demo'), h('span', { class: 'fk-tag' }, t('fieldkit.demoTag'))));
    const scope = h('p', { class: 'fk-scope text-sm' }, svgIcon('info', 16), h('span', {}, t('fieldkit.scopeNote')));

    /* ── FLD-02 connectivity & outbox ── */
    const panel = offlinePanel(ctx, { compact: true });
    const simBtn = h('button', { type: 'button', class: 'fk-switch', 'aria-pressed': String(off.isSimulatedOffline()), onClick: () => { off.setSimulatedOffline(!off.isSimulatedOffline()); paintConn(); } },
      h('span', { class: 'fk-switch-track', 'aria-hidden': 'true' }, h('span', { class: 'fk-switch-thumb' })),
      h('span', {}, t('fieldkit.conn.simulate')));
    const outboxList = h('ol', { class: 'fk-outbox', 'aria-label': t('fieldkit.outbox.title') });
    const syncBtn = button(t('fieldkit.outbox.syncNow'), { variant: 'outline', size: 'sm', icon: 'refresh', onClick: async () => { await off.syncNow({ announce: true }); paintAll(); } });
    const clearSyncedBtn = button(t('fieldkit.outbox.clearSynced'), { variant: 'ghost', size: 'sm', icon: 'trash', onClick: async () => { const b = box(); if (b) await b.clearSynced(); paintOutbox(); } });
    const storageLine = h('p', { class: 'text-xs muted fk-m0' });
    const connCard = card({
      code: 'FLD-02', title: t('fieldkit.conn.title'), subtitle: t('fieldkit.conn.sub'), className: 'fk-conn',
      actions: [button(t('fieldkit.conn.settings'), { variant: 'ghost', size: 'sm', icon: 'settings', onClick: () => navigate('settings', { section: 'offline' }) })],
      body: h('div', { class: 'stack gap-4' },
        panel.el,
        h('div', { class: 'fk-sim' }, simBtn, h('p', { class: 'text-xs muted fk-m0' }, t('fieldkit.conn.simulateHint'))),
        h('div', { class: 'stack gap-2' },
          h('div', { class: 'fk-row-between' }, h('h3', { class: 'fk-h3' }, t('fieldkit.outbox.title')), h('div', { class: 'fk-actions' }, syncBtn, clearSyncedBtn)),
          outboxList, storageLine,
          h('p', { class: 'fk-note text-xs' }, t('fieldkit.outbox.demoNote')))),
    });

    function describe(e) {
      const p = e.payload || {};
      if (e.kind === 'risk.add') return `${p.zoneId || ''} · ${(p.risk && p.risk.hazard) || ''}`;
      if (e.kind === 'alert.ack') return p.code || p.alertId || '';
      if (e.kind === 'task.status') return `${p.code || p.taskId} → ${i18n.label('taskStatus', p.to)}`;
      if (e.kind === 'checklist.tick') return `${p.code || p.inspectionId} · ${dictList('equip.items')[p.item] || `#${p.item + 1}`}`;
      return '';
    }

    function paintOutbox() {
      if (!alive) return;
      const b = box();
      clear(outboxList);
      const items = b ? b.list().slice(-8).reverse() : [];
      if (!items.length) outboxList.appendChild(h('li', { class: 'fk-empty text-sm' }, t('fieldkit.outbox.empty')));
      for (const e of items) {
        outboxList.appendChild(h('li', { class: 'fk-ob-item', 'data-state': e.status },
          h('div', { class: 'fk-ob-main' },
            h('strong', { class: 'text-sm' }, t(`fieldkit.outbox.kinds.${e.kind}`)),
            h('span', { class: 'fk-ob-desc text-sm' }, describe(e)),
            e.error ? h('span', { class: 'fk-ob-err text-xs' }, e.error) : null,
            h('span', { class: 'fk-ob-key mono text-xs', dir: 'ltr', title: t('fieldkit.outbox.key') }, e.key)),
          h('div', { class: 'fk-ob-side' }, chip(e.status), h('span', { class: 'mono text-xs muted', dir: 'ltr' }, time(e.createdAt)))));
      }
      syncBtn.disabled = !b || !b.count() || !off.isOnline();
      clearSyncedBtn.disabled = !b || !b.list().some((e) => e.status === 'synced');
      storageLine.textContent = t('fieldkit.outbox.storage', { kind: t(`fieldkit.outbox.storageKinds.${b ? b.storageKind : 'memory'}`) });
    }
    function paintConn() { simBtn.setAttribute('aria-pressed', String(off.isSimulatedOffline())); panel.refresh(); paintOutbox(); }

    /* ── FLD-03 scan ── */
    const sup = scanSupport();
    const canCamera = sup.detector && sup.camera && sup.secure;
    const video = h('video', { class: 'fk-video', playsinline: '', muted: '', 'aria-label': t('fieldkit.scan.videoAria') });
    const viewfinder = h('div', { class: 'fk-viewfinder', hidden: true }, video, h('span', { class: 'fk-scanline', 'aria-hidden': 'true' }), h('span', { class: 'fk-vf-hint text-sm' }, t('fieldkit.scan.scanning')));
    const camMsg = h('p', { class: 'text-sm fk-m0 fk-cam-msg' }, canCamera ? t('fieldkit.scan.permission') : t('fieldkit.scan.unsupported'));
    const stopBtn = button(t('fieldkit.scan.stop'), { variant: 'ghost', size: 'sm', icon: 'stop', onClick: () => stopScan() });
    stopBtn.hidden = true;
    const startBtn = button(t('fieldkit.scan.start'), { variant: 'primary', icon: 'camera', onClick: () => beginScan() });
    startBtn.disabled = !canCamera;
    const input = h('input', { class: 'field-control mono fk-code-input', id: 'fkCode', name: 'code', type: 'text', dir: 'ltr', autocomplete: 'off', spellcheck: 'false', autocapitalize: 'characters', placeholder: 'BX1:Z:S1-Z2', enterkeyhint: 'go' });
    const errLine = h('p', { class: 'fk-err text-sm', role: 'status', 'aria-live': 'polite' });
    const manual = h('form', { class: 'fk-manual', onSubmit: (e) => { e.preventDefault(); openCode(input.value, { focus: true }); } },
      h('label', { class: 'fk-label-text text-sm', for: 'fkCode' }, t('fieldkit.scan.manual')),
      h('div', { class: 'fk-input-row' }, input, button(t('fieldkit.scan.open'), { variant: 'outline', icon: 'search', attrs: { type: 'submit' } })));
    const samples = h('div', { class: 'fk-samples' }, h('span', { class: 'text-xs muted' }, t('fieldkit.scan.samples')),
      ...SAMPLE_CODES.map((c) => h('button', { type: 'button', class: 'fk-sample mono', dir: 'ltr', onClick: () => { input.value = c; openCode(c, { focus: true }); } }, c)));
    const resultHost = h('div', { class: 'fk-result-host', 'aria-live': 'polite' });
    const scanCard = card({
      code: 'FLD-03', title: t('fieldkit.scan.title'), subtitle: t('fieldkit.scan.sub'), className: 'fk-scan',
      body: h('div', { class: 'stack gap-4' },
        h('div', { class: 'fk-cam' }, h('div', { class: 'fk-actions' }, startBtn, stopBtn), camMsg, viewfinder),
        manual, samples, errLine, resultHost),
    });

    async function beginScan() {
      if (scanner) return;
      errLine.textContent = '';
      viewfinder.hidden = false;
      startBtn.hidden = true;
      stopBtn.hidden = false;
      try {
        scanner = await startScan(video, (raw) => { scanner = null; endScanUi(); input.value = raw; openCode(raw, { focus: true }); });
        if (!alive) stopScan();
      } catch (err) {
        scanner = null;
        endScanUi();
        camMsg.textContent = err && err.name === 'NotSupportedError' ? t('fieldkit.scan.unsupported') : t('fieldkit.scan.denied');
      }
    }
    function endScanUi() { viewfinder.hidden = true; startBtn.hidden = false; stopBtn.hidden = true; }
    function stopScan() { if (scanner) { try { scanner.stop(); } catch { /* stopped */ } scanner = null; } endScanUi(); }

    let current = null;
    function openCode(raw, { focus = false } = {}) {
      const parsed = parsePayload(raw, { origin: typeof location !== 'undefined' ? location.origin : '' });
      if (!parsed.ok) {
        errLine.textContent = t(`fieldkit.scan.errors.${parsed.reason}`, { host: parsed.host || '' });
        return;
      }
      const label = buildRegistry(state()).find((l) => l.payload === parsed.payload);
      if (!label) { errLine.textContent = t('fieldkit.scan.errors.unknown', { code: parsed.payload }); return; }
      errLine.textContent = '';
      current = { label, formKey: null, sentKey: null, formOpen: false, live: null };
      paintResult({ enter: true });
      if (focus) requestAnimationFrame(() => { const tEl = resultHost.querySelector('.fk-result-title'); if (tEl) tEl.focus({ preventScroll: false }); });
    }

    function siteOf(id) { return arr(state().sites).find((s) => s.id === id) || null; }

    /**
     * Builds the result of the open code. Runs when the reader opens a code and when the observation form opens,
     * is cancelled or is sent — never for a background change: refreshResult() handles those in place, so an open
     * form keeps what was typed, the focus stays where it is and the live region announces only what changed.
     * `focus`: selector of the node that takes the focus afterwards; without it, a focus that was inside the result
     * goes to the result heading instead of dropping to <body>.
     */
    function paintResult({ enter = false, focus = null } = {}) {
      if (!alive) return;
      const held = resultHost.contains(document.activeElement);
      clear(resultHost);
      if (!current) return;
      current.live = null;
      const { label } = current;
      const site = siteOf(label.siteId);
      const box2 = h('section', { class: ['fk-result', enter ? 'is-entering' : null], 'aria-labelledby': 'fkResultTitle' },
        h('div', { class: 'fk-result-head' },
          h('span', { class: 'fk-kind', 'data-kind': label.k }, svgIcon(KIND_ICON[label.k] || 'hash', 14), t(`fieldkit.kinds.${QR_KINDS[label.k]}`)),
          h('span', { class: 'mono text-xs muted', dir: 'ltr' }, label.payload)),
        h('h3', { class: 'fk-result-title', id: 'fkResultTitle', tabindex: '-1' }, label.title),
        h('p', { class: 'text-sm muted fk-m0' }, [label.sub, site && label.ref.kind !== 'zone' ? siteName(site) : null].filter(Boolean).join(' · ')));
      const body = h('div', { class: 'stack gap-3' });
      box2.appendChild(body);
      // Each kind returns what follows the data afterwards: { update() } patches nodes in place; { sig() } names the
      // facts the block was built from, and the block is rebuilt only when that changes.
      let live = null;
      if (label.ref.kind === 'zone') live = zoneResult(body, label, site);
      else if (label.ref.kind === 'crane') live = craneResult(body, label, site);
      else if (label.ref.kind === 'camera') cameraResult(body, label);
      else if (label.ref.kind === 'crate') live = crateResult(body, label);
      else if (label.ref.kind === 'permit') live = permitResult(body, label);
      if (live && typeof live.sig === 'function') live.built = live.sig();
      current.live = live;
      resultHost.appendChild(box2);
      const to = (focus && resultHost.querySelector(focus)) || (held ? box2.querySelector('.fk-result-title') : null);
      if (to) { try { to.focus(); } catch { /* not focusable */ } }
    }

    /** A background change (outbox, network, live data, filters): update the open result without rebuilding it. */
    function refreshResult() {
      if (!alive || !current || !current.live) return;
      const live = current.live;
      if (typeof live.sig === 'function' && live.sig() !== live.built) { paintResult(); return; }
      if (typeof live.update === 'function') live.update();
    }
    const setText = (el, text) => { if (el.textContent !== text) el.textContent = text; };

    const facts = (pairs) => h('dl', { class: 'fk-facts fk-facts-inline' }, ...pairs.map(([k, v]) => h('div', { class: 'fk-fact' }, h('dt', {}, k), h('dd', {}, v))));

    function zoneResult(body, label, site) {
      const cells = [0, 1, 2].map(() => h('span', { dir: 'ltr' }));
      const paintCounts = () => {
        let links = null;
        try { links = zoneLinks(state(), label.siteId, label.zoneId, { sel, now: now() }); } catch { links = null; }
        const c = (links && links.counts) || {};
        [c.openRisks, c.permits, c.inspections].forEach((n, i) => setText(cells[i], num(n || 0)));
      };
      body.appendChild(facts([
        [t('fieldkit.zone.openRisks'), cells[0]],
        [t('fieldkit.zone.permits'), cells[1]],
        [t('fieldkit.zone.inspections'), cells[2]],
      ]));
      const acts = h('div', { class: 'fk-actions' },
        button(t('fieldkit.zone.openMap'), { variant: 'outline', size: 'sm', icon: 'map-pin', onClick: () => navigate('spatial', { site: label.siteId, zone: label.zoneId }) }));
      // One idempotency key per form: a second observation in the same zone is a new intent, not a repeat.
      if (!current.formOpen) acts.appendChild(button(t('fieldkit.zone.report'), { variant: 'primary', size: 'sm', icon: 'plus', attrs: { 'data-fk': 'report' }, onClick: () => { current.formOpen = true; current.formKey = off.randomKey('risk.add'); paintResult({ focus: '#fkHazard' }); } }));
      body.appendChild(acts);
      // The last observation sent from this result: its line follows the outbox (waiting to sync → saved).
      const sent = h('p', { class: 'fk-row text-sm' });
      let sentSig = null;
      const paintSent = () => {
        const e = current.sentKey && !current.formOpen ? entryOf(current.sentKey) : null;
        const sig = e ? `${e.status}|${e.error || ''}` : '';
        if (sig === sentSig) return;
        sentSig = sig;
        if (!e) { sent.remove(); return; }
        sent.replaceChildren(chip(e.status), h('span', {}, e.status === 'synced' ? t('fieldkit.form.saved') : (e.status === 'failed' ? (e.error || '') : t('fieldkit.form.queued'))));
        if (!sent.isConnected) body.appendChild(sent);
      };
      if (current.formOpen) body.appendChild(reportForm(label, site));
      const update = () => { paintCounts(); paintSent(); };
      update();
      return { update };
    }

    function reportForm(label, site) {
      const opt = (v, text) => h('option', { value: String(v) }, text);
      const lvl = (name, id) => h('select', { class: 'field-control', name, id, required: true }, opt('', t('fieldkit.form.choose')), ...[1, 2, 3, 4, 5].map((n) => opt(n, num(n))));
      const err = h('p', { class: 'fk-err text-sm', role: 'status', 'aria-live': 'polite' });
      const cur = current;
      let sending = false;
      const form = h('form', { class: 'fk-form', novalidate: true, onSubmit: async (e) => {
        e.preventDefault();
        if (sending) return;
        const fd = new FormData(form);
        const hazard = String(fd.get('hazard') || '').trim();
        const categoryId = String(fd.get('category') || '');
        const likelihood = Number(fd.get('likelihood'));
        const severity = Number(fd.get('severity'));
        if (!hazard || !categoryId || !likelihood || !severity) { err.textContent = t('fieldkit.form.required'); return; }
        sending = true;
        const key = cur.formKey;
        let res = null;
        try {
          res = await off.act('risk.add', { zoneId: label.zoneId, risk: { siteId: label.siteId, zoneId: label.zoneId, categoryId, hazard, activity: dict.ar.form.activity, activityEn: dict.en.form.activity, description: hazard, likelihood, severity } }, { key });
        } finally { sending = false; }
        if (!alive) return;
        cur.formOpen = false;
        cur.sentKey = key;
        cur.formKey = null;
        toast(res.duplicate ? t('fieldkit.outbox.duplicate') : t(res.queued ? 'fieldkit.form.queued' : 'fieldkit.form.saved'), { tone: res.queued ? 'warning' : 'good' });
        // The form leaves: the focus returns to the button that opened it (unless another code was opened meanwhile).
        if (cur === current) paintResult({ focus: '[data-fk="report"]' });
        paintAll();
      } },
      h('h4', { class: 'fk-h4' }, t('fieldkit.form.title', { zone: zoneName(site, label.zoneId) })),
      h('label', { class: 'fk-field' }, h('span', { class: 'text-sm' }, t('fieldkit.form.hazard')), h('input', { class: 'field-control', id: 'fkHazard', name: 'hazard', type: 'text', required: true, maxlength: '160', autocomplete: 'off' })),
      h('div', { class: 'fk-form-grid' },
        h('label', { class: 'fk-field' }, h('span', { class: 'text-sm' }, t('fieldkit.form.category')), h('select', { class: 'field-control', name: 'category', required: true }, opt('', t('fieldkit.form.choose')), ...CATEGORIES.map((c) => opt(c.id, i18n.label('hseCategory', c.id) || c.name)))),
        h('label', { class: 'fk-field' }, h('span', { class: 'text-sm' }, t('fieldkit.form.likelihood')), lvl('likelihood', 'fkLik')),
        h('label', { class: 'fk-field' }, h('span', { class: 'text-sm' }, t('fieldkit.form.severity')), lvl('severity', 'fkSev'))),
      err,
      h('div', { class: 'fk-actions' },
        button(t('fieldkit.form.submit'), { variant: 'primary', size: 'sm', icon: 'check', attrs: { type: 'submit' } }),
        button(t('fieldkit.form.cancel'), { variant: 'ghost', size: 'sm', onClick: () => { cur.formOpen = false; cur.formKey = null; if (cur === current) paintResult({ focus: '[data-fk="report"]' }); } })));
      return form;
    }

    function craneResult(body, label) {
      const find = () => arr(state().inspections).find((x) => x && x.siteId === label.siteId && x.zoneId === label.zoneId && x.type === CRANE_INSPECTION && x.status !== DONE_INSPECTION) || null;
      const sig = () => { const x = find(); return x ? String(x.id) : ''; };
      const insp = find();
      body.appendChild(h('div', { class: 'fk-actions' }, button(t('fieldkit.zone.openMap'), { variant: 'outline', size: 'sm', icon: 'map-pin', onClick: () => navigate('spatial', { site: label.siteId, zone: label.zoneId }) })));
      if (!insp) { body.appendChild(h('p', { class: 'text-sm muted fk-m0' }, t('fieldkit.equip.noChecklist'))); return { sig }; }
      const items = dictList('equip.items');
      const list = h('ul', { class: 'fk-check', 'aria-label': t('fieldkit.equip.checklist', { code: insp.code }) });
      const rows = items.map((text, i) => {
        const key = off.idemKey('checklist.tick', insp.id, i);
        // A ticked item is locked, not disabled: it stays in the tab order and keeps the focus, so the keyboard
        // (and a screen reader) stays on the item that was just ticked instead of falling to <body>.
        const locked = () => cb.getAttribute('aria-disabled') === 'true';
        const lock = () => { cb.checked = true; cb.setAttribute('aria-disabled', 'true'); };
        const cb = h('input', { type: 'checkbox', id: `fkChk${i}`, 'aria-label': t('fieldkit.equip.tickAria', { item: text }),
          onClick: (e) => { if (locked()) e.preventDefault(); },
          onChange: async () => { if (!cb.checked || locked()) return; lock(); await off.act('checklist.tick', { inspectionId: insp.id, code: insp.code, item: i }, { key }); paintAll(); } });
        const li = h('li', { class: 'fk-check-item' }, cb, h('label', { for: `fkChk${i}`, class: 'text-sm' }, text));
        let shown = '';
        let chipEl = null;
        list.appendChild(li);
        return () => {
          const b = box();
          const e = entryOf(key);
          if (e || (b && b.has(key))) lock();
          const status = e ? e.status : '';
          if (status === shown) return;
          shown = status;
          if (chipEl) chipEl.remove();
          chipEl = e ? chip(e.status) : null;
          if (chipEl) li.appendChild(chipEl);
        };
      });
      body.appendChild(h('div', { class: 'stack gap-2' }, h('h4', { class: 'fk-h4' }, t('fieldkit.equip.checklist', { code: insp.code })), list));
      const update = () => rows.forEach((paintRow) => paintRow());
      update();
      return { sig, update };
    }

    function cameraResult(body, label) {
      body.appendChild(h('p', { class: 'text-sm fk-m0' }, statusBadge('demo', { size: 'sm' }), ' ', t('fieldkit.equip.cameraNote')));
      body.appendChild(h('div', { class: 'fk-actions' }, button(t('fieldkit.zone.openMap'), { variant: 'outline', size: 'sm', icon: 'cctv', onClick: () => navigate('spatial', { site: label.siteId, camera: label.ref.cameraId }) })));
    }

    function crateResult(body, label) {
      const crate = label.ref.crate;
      const ms = materialStatus(state(), crate);
      const sig = () => { const m = materialStatus(state(), crate); return JSON.stringify([m.fromStore, m.approved, m.rev, m.statusText, m.po, m.poStatus, m.risk ? [m.risk.id, m.risk.code] : null]); };
      body.appendChild(h('p', { class: ['fk-verdict', ms.approved ? 'is-go' : 'is-hold'] }, svgIcon(ms.approved ? 'check-circle' : 'alert-octagon', 18), h('strong', {}, t(ms.approved ? 'fieldkit.material.verdictInstall' : 'fieldkit.material.verdictHold'))));
      body.appendChild(facts([
        [t('fieldkit.material.submittal'), h('span', {}, h('span', { class: 'mono', dir: 'ltr' }, crate.submittal), ' · ', t('fieldkit.material.submittalStatus', { rev: num(ms.rev), status: ms.statusText }))],
        [t('fieldkit.material.po'), h('span', {}, h('span', { class: 'mono', dir: 'ltr' }, ms.po), ' · ', ms.poStatus)],
        [t('fieldkit.material.linkedRisk'), h('span', { class: 'mono', dir: 'ltr' }, ms.risk ? ms.risk.code : crate.riskCode)],
      ]));
      if (!ms.fromStore) body.appendChild(h('p', { class: 'text-xs muted fk-m0' }, t('fieldkit.material.fallback')));
      const acts = h('div', { class: 'fk-actions' }, button(t('fieldkit.material.openBom'), { variant: 'outline', size: 'sm', icon: 'package', onClick: () => navigate('bom', { item: crate.boqItemId }) }));
      if (ms.risk) acts.appendChild(button(t('fieldkit.material.openRisk'), { variant: 'ghost', size: 'sm', icon: 'shield-alert', onClick: () => navigate('airisks', { risk: ms.risk.id }) }));
      body.appendChild(acts);
      return { sig };
    }

    function permitResult(body, label) {
      const find = () => arr(state().permits).find((x) => x && x.id === label.ref.permitId) || null;
      const isExpired = (x) => Boolean(x && x.expiresAt && Date.parse(x.expiresAt) < now().getTime());
      const sig = () => { const x = find(); return x ? JSON.stringify([x.status, x.startsAt, x.expiresAt, isExpired(x)]) : ''; };
      const p = find();
      if (!p) return { sig };
      const expired = isExpired(p);
      body.appendChild(facts([
        [t('fieldkit.permit.validity'), h('span', { dir: 'ltr', class: 'mono' }, `${time(p.startsAt)} – ${time(p.expiresAt)}`)],
        [t('fieldkit.kinds.permit'), h('span', {}, `${i18n.label('permitStatus', p.status)}${expired ? ` · ${t('fieldkit.permit.expired')}` : ''}`)],
      ]));
      body.appendChild(h('div', { class: 'fk-actions' }, button(t('fieldkit.permit.open'), { variant: 'outline', size: 'sm', icon: 'permit', onClick: () => navigate('permits', { id: p.id }) })));
      return { sig };
    }

    /* ── FLD-05 field actions ── */
    const quickBody = h('div', { class: 'fk-quick' });
    const quickCard = card({ code: 'FLD-05', title: t('fieldkit.quick.title'), subtitle: t('fieldkit.quick.sub'), body: quickBody, className: 'fk-quick-card' });
    function quickSite() { const f = (store && store.filters) || state().filters || {}; return f.siteId && f.siteId !== 'all' ? f.siteId : 'S1'; }
    let quickSig = null;
    function paintQuick() {
      if (!alive) return;
      const f = { siteId: quickSite(), range: 30, search: '' };
      let alerts = [];
      let tasks = [];
      try { const q = psel.alertQueue(state(), f); alerts = [...arr(q.immediate), ...arr(q.standard)].filter((a) => !a.acknowledged).slice(0, 3); } catch { alerts = []; }
      try { const col = arr(psel.tasksByStatus(state(), f, now())).find((c) => c.status === 'جديدة'); tasks = col ? arr(col.items).slice(0, 3) : []; } catch { tasks = []; }
      const rowsOf = (list, kind, dictNs, keyOf, labelKey, doneKey, actOf) => list.map((rec) => {
        const key = keyOf(rec);
        const e = entryOf(key);
        return { key, code: rec.code, title: L(rec, 'title', dictNs) || rec.title, status: e ? e.status : '', label: t(labelKey), done: t(doneKey), act: () => off.act(kind, actOf(rec), { key }) };
      });
      const groups = [
        { id: 'alerts', title: t('fieldkit.quick.alerts'), rows: rowsOf(alerts, 'alert.ack', 'alerts', (a) => off.idemKey('alert.ack', a.id), 'fieldkit.quick.ack', 'fieldkit.quick.acked', (a) => ({ alertId: a.id, code: a.code, by: FIELD_ACTOR })) },
        // The key is shown in the outbox list: a language-neutral token for the intent, not the (Arabic) status value.
        { id: 'tasks', title: t('fieldkit.quick.tasks'), rows: rowsOf(tasks, 'task.status', 'tasks', (task) => off.idemKey('task.status', task.id, 'start'), 'fieldkit.quick.start', 'fieldkit.quick.started', (task) => ({ taskId: task.id, code: task.code, from: task.status, to: 'قيد التنفيذ', by: FIELD_ACTOR })) },
      ];
      // Background repaints arrive every few seconds (live data, outbox, network). The lists are rebuilt only when
      // what they show changed, and a focus inside them survives the rebuild: on the same row (its button, or the
      // row itself once the button became a chip); when the row left the list, on the heading of its group — never
      // on the next row's button, where a second Enter would act on another record.
      const sig = JSON.stringify(groups.map((g) => g.rows.map((r) => [r.key, r.code, r.title, r.status])));
      if (sig === quickSig) return;
      quickSig = sig;
      const active = document.activeElement;
      const held = active && quickBody.contains(active) ? { key: (active.closest('[data-key]') || active).getAttribute('data-key'), group: (active.closest('[data-group]') || active).getAttribute('data-group') } : null;
      clear(quickBody);
      for (const g of groups) {
        quickBody.appendChild(h('h3', { class: 'fk-h3', tabindex: '-1', 'data-group': g.id }, g.title));
        quickBody.appendChild(g.rows.length ? h('ul', { class: 'fk-q', 'data-group': g.id }, ...g.rows.map((r) => h('li', { class: 'fk-q-item', tabindex: '-1', 'data-key': r.key },
          h('div', { class: 'fk-q-main' }, h('span', { class: 'mono text-xs', dir: 'ltr' }, r.code), h('span', { class: 'text-sm fk-q-title' }, r.title)),
          r.status ? (r.status === 'synced' ? h('span', { class: 'fk-chip', 'data-state': 'synced' }, r.done) : chip(r.status)) : button(r.label, { variant: 'outline', size: 'sm', onClick: async () => { await r.act(); paintAll(); } })))) : h('p', { class: 'text-sm muted fk-m0' }, t('fieldkit.quick.none')));
      }
      if (held) {
        const row = held.key ? Array.from(quickBody.querySelectorAll('[data-key]')).find((n) => n.getAttribute('data-key') === held.key) : null;
        const to = row ? (row.querySelector('button') || row) : (quickBody.querySelector(`h3[data-group="${held.group === 'tasks' ? 'tasks' : 'alerts'}"]`) || quickBody.querySelector('h3'));
        if (to) { try { to.focus({ preventScroll: true }); } catch { /* ignore */ } }
      }
    }

    /* ── FLD-04 labels ── */
    const sites = arr(state().sites);
    let labelSite = (params.site && sites.some((s) => s.id === params.site)) ? params.site : (sites.some((s) => s.id === 'S1') ? 'S1' : (sites[0] && sites[0].id));
    let labelType = 'all';
    const siteSelect = h('select', { class: 'field-control', id: 'fkSite', onChange: () => { labelSite = siteSelect.value; paintLabels(); } },
      ...sites.map((s) => h('option', { value: s.id, selected: s.id === labelSite }, `${s.code || s.id} · ${siteName(s)}`)));
    const typeSeg = segmented({
      options: [{ value: 'all', label: t('fieldkit.labels.all') }, ...Object.entries(QR_KINDS).map(([k, v]) => ({ value: k, label: t(`fieldkit.kinds.${v}`) }))],
      value: labelType, ariaLabel: t('fieldkit.labels.type'), onChange: (v) => { labelType = v; paintLabels(); },
    });
    const countLine = h('span', { class: 'text-sm muted' });
    const sheet = h('div', { class: 'fk-sheet', role: 'list' });
    const printBtn = button(t('fieldkit.labels.print'), { variant: 'outline', size: 'sm', icon: 'print', onClick: () => printLabels() });
    const labelsCard = card({
      code: 'FLD-04', title: t('fieldkit.labels.title'), subtitle: t('fieldkit.labels.sub'), className: 'fk-labels-card',
      actions: [printBtn],
      body: h('div', { class: 'stack gap-4' },
        h('div', { class: 'fk-label-controls' },
          h('label', { class: 'fk-field', for: 'fkSite' }, h('span', { class: 'text-sm' }, t('fieldkit.labels.site')), siteSelect),
          h('div', { class: 'fk-field' }, h('span', { class: 'text-sm' }, t('fieldkit.labels.type')), typeSeg.el || typeSeg), countLine),
        h('p', { class: 'text-xs muted fk-m0' }, t('fieldkit.labels.payloadNote')),
        sheet),
    });
    function paintLabels() {
      if (!alive) return;
      const list = buildRegistry(state(), labelSite).filter((l) => labelType === 'all' || l.k === labelType);
      countLine.textContent = tn('fieldkit.labels.count', list.length);
      const frag = document.createDocumentFragment();
      for (const l of list) {
        frag.appendChild(h('div', { class: 'fk-label', role: 'listitem', 'data-kind': l.k },
          h('div', { class: 'fk-label-top' }, h('span', { class: 'fk-kind', 'data-kind': l.k }, svgIcon(KIND_ICON[l.k] || 'hash', 12), t(`fieldkit.kinds.${QR_KINDS[l.k]}`)), h('span', { class: 'mono', dir: 'ltr' }, l.siteId)),
          h('div', { class: 'fk-qr' }, qrSvg(l.payload, { ecl: 'Q', label: t('fieldkit.labels.qrAria', { code: l.payload }) })),
          h('div', { class: 'fk-label-code mono', dir: 'ltr' }, l.payload),
          h('div', { class: 'fk-label-title' }, l.title),
          h('div', { class: 'fk-label-sub' }, l.sub),
          h('div', { class: 'fk-label-foot' }, t('fieldkit.labels.footer'))));
      }
      sheet.replaceChildren(frag);
      printBtn.disabled = !list.length;
    }
    function printLabels() {
      const body = document.body;
      const done = () => { body.classList.remove('fk-printing'); window.removeEventListener('afterprint', done); };
      body.classList.add('fk-printing');
      window.addEventListener('afterprint', done);
      try { window.print(); } finally { setTimeout(done, 1000); }
    }

    /* ── FLD-06 needs ── */
    const needsCard = card({ code: 'FLD-06', title: t('fieldkit.needs.title'), subtitle: t('fieldkit.needs.sub'),
      body: h('ul', { class: 'fk-list' }, ...dictList('needs.items').map((s) => h('li', { class: 'text-sm' }, s))) });

    const root = h('section', { class: 'view view-fieldkit' },
      head, scope,
      h('div', { class: 'fk-grid' }, h('div', { class: 'fk-col' }, scanCard, quickCard), h('div', { class: 'fk-col' }, connCard, needsCard)),
      labelsCard);
    container.appendChild(root);

    function paintAll() { paintConn(); paintQuick(); refreshResult(); }
    paintAll();
    // The app starts the offline layer at the end of boot; opened as the first route, the page starts it now
    // (idempotent) so the outbox and the field actions are usable without waiting for the live engines.
    off.initOffline({ store, bus, toast }).then(() => { if (alive) paintAll(); }).catch(() => { /* app.js reports it */ });
    paintLabels();
    if (params.code) { input.value = String(params.code); openCode(String(params.code)); }

    let raf = 0;
    const schedule = () => { if (!alive || raf) return; raf = requestAnimationFrame(() => { raf = 0; paintAll(); }); };
    unsubs.push(bus.on('field:outbox', schedule), bus.on('field:network', schedule));
    unsubs.push(bus.on('store:change', (payload) => {
      const path = payload && typeof payload.path === 'string' ? payload.path : '*';
      if (path === '*' || /^(platform\.(alerts|tasks|aiRisks)|inspections|risks|permits|platform$)/.test(path)) schedule();
    }));
    unsubs.push(bus.on('filters:change', schedule));

    return () => {
      alive = false;
      if (raf) cancelAnimationFrame(raf);
      stopScan();
      panel.destroy();
      unsubs.forEach((u) => { try { if (typeof u === 'function') u(); } catch { /* ignore */ } });
      document.body.classList.remove('fk-printing');
    };
  },
};
