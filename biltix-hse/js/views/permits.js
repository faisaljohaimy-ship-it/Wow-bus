/**
 * BILTIX Risk AI — HSE pillar — SEC-05 Permits to work (js/views/permits.js). Owner: B-HSE2 (v3 Precision).
 *
 *   • Four executive metrics (.metric-grid): active, awaiting approval, expiring within the hour, suspended
 *   • "Expiring within 60 minutes" priority list with live countdowns (only when there is something to act on)
 *   • Permit board card: type filter bar + components.kanban across PERMIT_STATUS; drag or "Move to" →
 *     store.updatePermit(id, { status }) with guards (closed is final, an expired permit cannot be activated)
 *   • Detail drawer with tabs (Overview / Hazards & controls / Gas test) and status actions
 *   • "New permit" modal with inline, translated validation → store.addPermit
 *
 * Bilingual (CONTRACT §4): every string from the 'permits' dictionary (js/i18n/permits.js); enum values via
 * i18n.label('permitType'|'permitStatus'); record text via i18n.L(…, 'permits'); people via i18n.term().
 * Times are shown in Asia/Riyadh (the sites' time zone, same as the app-bar clock). Live updates patch in
 * place (no entrance replay) and flash the changed card; motion.enter runs on first render only.
 */

import { i18n, t, tn } from '../core/i18n.js';
import dict from '../i18n/permits.js';
import * as SEED from '../data/seed.js';
import {
  h, clear, glyph, svgIcon, card, badge, button, modal, drawer, toast, kanban, countdown,
  formField, emptyState, kv, motion,
} from '../ui/components.js';

i18n.register('permits', dict);

/* ────────────────────────────── enums (stored values stay Arabic) ────────────────────────────── */

const list = (value, fallback) => (Array.isArray(value) && value.length ? value : fallback);
const PERMIT_TYPES = list(SEED.PERMIT_TYPES, ['أعمال ساخنة', 'أماكن مغلقة', 'العمل على ارتفاع', 'عزل كهربائي', 'حفريات', 'رفع ثقيل', 'أعمال ليلية']);
const PERMIT_STATUS = list(SEED.PERMIT_STATUS, ['مسودة', 'بانتظار الاعتماد', 'نشط', 'معلق', 'مغلق']);

const DRAFT = 'مسودة';
const PENDING = 'بانتظار الاعتماد';
const ACTIVE = 'نشط';
const SUSPENDED = 'معلق';
const CLOSED = 'مغلق';
const STATUS_KEY = { [DRAFT]: 'draft', [PENDING]: 'pending', [ACTIVE]: 'active', [SUSPENDED]: 'suspended', [CLOSED]: 'closed' };

/** Permit lifecycle tones (not risk states): pending needs attention, suspended is serious. */
const STATUS_TONE = { [DRAFT]: 'neutral', [PENDING]: 'warning', [ACTIVE]: 'accent', [SUSPENDED]: 'serious', [CLOSED]: 'neutral' };
const COLUMN_TONE = { [PENDING]: 'warning', [ACTIVE]: 'accent', [SUSPENDED]: 'serious' };
const TYPE_ICON = {
  'أعمال ساخنة': 'flame', 'أماكن مغلقة': 'confined', 'العمل على ارتفاع': 'height', 'عزل كهربائي': 'bolt',
  'حفريات': 'excavation', 'رفع ثقيل': 'crane', 'أعمال ليلية': 'clock',
};

/** Gas test limits (confined-space practice: O₂ 19.5–23.5 %, LEL < 10 %, H₂S < 10 ppm, CO < 35 ppm). */
const GAS = [
  { key: 'o2', label: 'O2', unit: '%', digits: 1, min: 0, max: 100, tone: (v) => (v < 19.5 || v > 23.5 ? 'critical' : 'good') },
  { key: 'lel', label: 'LEL', unit: '%', digits: 0, min: 0, max: 100, tone: (v) => (v >= 10 ? 'critical' : v > 0 ? 'warning' : 'good') },
  { key: 'h2s', label: 'H2S', unit: 'ppm', digits: 1, min: 0, max: 1000, tone: (v) => (v >= 10 ? 'critical' : v >= 5 ? 'warning' : 'good') },
  { key: 'co', label: 'CO', unit: 'ppm', digits: 0, min: 0, max: 5000, tone: (v) => (v >= 35 ? 'critical' : v >= 25 ? 'warning' : 'good') },
];
const GAS_TEXT = { good: 'permits.gas.ok', warning: 'permits.gas.warn', critical: 'permits.gas.alarm' };

const EXPIRING_MINUTES = 60;
const MINUTE = 60_000;
const HOUR = 3_600_000;
const MAX_HOURS = 12;
const WORKERS_MIN = 1;
const WORKERS_MAX = 500;

/* ────────────────────────────── Riyadh time (fixed UTC+3, no DST) ────────────────────────────── */

const TZ = 'Asia/Riyadh';
const TZ_OFFSET_MS = 3 * HOUR;
const zCache = new Map();
function zoned(fmt, value, opts) {
  const d = fmt.toDate(value);
  if (!d) return null;
  const loc = fmt.locale();
  const key = `${loc}|${JSON.stringify(opts)}`;
  if (!zCache.has(key)) { let f = null; try { f = new Intl.DateTimeFormat(loc, { ...opts, timeZone: TZ }); } catch { f = null; } zCache.set(key, f); }
  const f = zCache.get(key);
  try { return f ? f.format(d) : null; } catch { return null; }
}
const zTime = (fmt, v) => zoned(fmt, v, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }) || fmt.time(v);
const zDate = (fmt, v, style = 'medium') => zoned(fmt, v, style === 'short' ? { day: 'numeric', month: 'short' } : { day: 'numeric', month: 'long', year: 'numeric' }) || fmt.date(v, { style });
const zDateTime = (fmt, v) => (fmt.toDate(v) ? `${zDate(fmt, v)}${i18n.lang() === 'ar' ? '،' : ','} ${zTime(fmt, v)}` : '—');
const zDayKey = (v) => { const t0 = Date.parse(v); return Number.isFinite(t0) ? new Date(t0 + TZ_OFFSET_MS).toISOString().slice(0, 10) : ''; };
/** 'YYYY-MM-DDTHH:mm' in Riyadh time for a datetime-local input. */
const toRiyadhInput = (msValue) => new Date(msValue + TZ_OFFSET_MS).toISOString().slice(0, 16);
/** datetime-local value read as Riyadh time → ISO with +03:00, or null. */
function fromRiyadhInput(value) {
  const v = String(value || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(v)) return null;
  const iso = `${v}:00+03:00`;
  return Number.isFinite(Date.parse(iso)) ? iso : null;
}

/* ────────────────────────────── pure helpers ────────────────────────────── */

const ms = (iso) => { const v = Date.parse(iso); return Number.isFinite(v) ? v : NaN; };
const typeIcon = (type) => TYPE_ICON[type] || 'file-check';
const statusTone = (s) => STATUS_TONE[s] || 'neutral';
const typeLabel = (type) => i18n.label('permitType', type);
const statusLabel = (s) => i18n.label('permitStatus', s);
const lines = (value) => String(value || '').split(/\r?\n/).map((s) => s.trim()).filter(Boolean);

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

function touches(path, prefix) {
  if (!path || path === '*') return true;
  const p = String(path);
  return p === prefix || p.startsWith(`${prefix}.`);
}

/** Permit id from a store path such as 'permits.P3' (null when the path is broader). */
function idFromPath(path) {
  const m = /^permits\.([^.]+)/.exec(String(path || ''));
  return m ? m[1] : null;
}

/* ────────────────────────────── the view ────────────────────────────── */

export const permitsView = {
  id: 'permits',
  code: 'SEC-05',
  get title() { return t('core.nav.permits.title'); },
  icon: 'file-check',

  render(container, ctx) {
    const { store, bus, sel, fmt } = ctx;
    const subs = [];
    let alive = true;
    let activeDrawer = null;
    let activeModal = null;
    let typeFilter = [];

    const timers = { strip: new Set(), board: new Set(), drawer: new Set() };
    const track = (region, cd) => { if (cd) timers[region].add(cd); return cd; };
    const stopRegion = (region) => { timers[region].forEach((cd) => { try { cd.stop(); } catch { /* ignore */ } }); timers[region].clear(); };
    /** Countdown whose natural expiry refreshes the metrics and the expiring list (armed after construction). */
    const liveCountdown = (region, iso) => {
      let armed = false;
      const cd = track(region, countdown(iso, { onExpire: () => { if (armed) schedule(1); } }));
      armed = true;
      return cd;
    };

    const state = () => store.state;
    const now = () => (typeof store.now === 'function' ? store.now().getTime() : Date.now());
    const globalFilters = () => ({ ...(store.filters || state().filters || {}) });
    const findPermit = (id) => (state().permits || []).find((p) => p && p.id === id) || null;
    const siteOf = (siteId) => (state().sites || []).find((s) => s && s.id === siteId) || null;
    const siteName = (siteId) => { const s = siteOf(siteId); return s ? codeSafeDigits(fmt, i18n.L(s, 'name', 'sites')) : '—'; };
    const loc = (p) => codeSafeDigits(fmt, i18n.L(p, 'location', 'permits') || '—');
    const person = (v) => (v ? i18n.term(v) : '—');
    const inSite = (p, gf) => !gf.siteId || gf.siteId === 'all' || p.siteId === gf.siteId;

    function expiringSoon(st, gf, at) {
      if (typeof sel.permitsExpiringSoon === 'function') {
        try { return sel.permitsExpiringSoon(st, EXPIRING_MINUTES, gf, new Date(at)); } catch { /* local twin below */ }
      }
      const horizon = at + EXPIRING_MINUTES * MINUTE;
      return (st.permits || []).filter((p) => p && p.status === ACTIVE && inSite(p, gf) && ms(p.expiresAt) > at && ms(p.expiresAt) <= horizon)
        .sort((a, b) => ms(a.expiresAt) - ms(b.expiresAt));
    }
    const expiredActive = (st, gf, at) => (st.permits || []).filter((p) => p && p.status === ACTIVE && inSite(p, gf) && ms(p.expiresAt) <= at);

    /* ── page skeleton ── */
    const root = h('section', { class: 'view view-permits', 'aria-labelledby': 'permits-title' });
    root.appendChild(h('header', { class: 'view-head' },
      h('div', { class: 'view-head-text' },
        h('span', { class: 'code-tag' }, permitsView.code),
        h('h1', { id: 'permits-title', class: 't-page', tabindex: '-1' }, t('core.nav.permits.title')),
        h('p', { class: 'view-lead' }, t('permits.lead'))),
      h('div', { class: 'view-actions' },
        h('span', { class: 't-helper' }, t('permits.tz')),
        button(t('permits.newPermit'), { variant: 'primary', icon: 'file-check', onClick: () => openNewPermitModal() }))));

    const metricsHost = h('div', { class: 'metric-grid', role: 'group', 'aria-label': t('permits.metrics.label') });
    const expiringHost = h('div', { class: 'stack' });
    const filterHost = h('div');
    const boardHost = h('div', { class: 'stack gap-3' });
    const boardEmpty = emptyState({ icon: 'file-check', title: t('permits.board.emptyTitle'), text: t('permits.board.emptyText') });
    boardEmpty.hidden = true;
    boardHost.appendChild(boardEmpty);
    const boardCard = card({
      code: 'SEC-05.B', title: t('permits.board.title'), subtitle: t('permits.board.sub'),
      body: h('div', { class: 'stack gap-4' }, filterHost, boardHost),
    });
    root.append(metricsHost, expiringHost, boardCard);
    container.appendChild(root);

    /* ── metrics (built once, patched in place) ── */
    const tiles = {};
    function metricTile(key, { label, icon }) {
      const value = h('span', { class: 't-metric' }, '—');
      const helper = h('span', { class: 'metric-helper' }, '');
      const icn = h('span', { class: 'metric-icon', 'aria-hidden': 'true' }, svgIcon(icon, 16));
      const el = h('div', { class: 'metric-tile', 'data-metric': key },
        h('div', { class: 'metric-head' }, h('span', { class: 'metric-label' }, label), icn),
        h('div', { class: 'metric-value' }, value),
        h('div', { class: 'metric-foot' }, helper));
      tiles[key] = { el, value, helper, last: null, tone: null };
      return el;
    }
    metricsHost.append(
      metricTile('active', { label: t('permits.metrics.active'), icon: 'file-check' }),
      metricTile('pending', { label: t('permits.metrics.pending'), icon: 'clipboard' }),
      metricTile('expiring', { label: t('permits.metrics.expiring'), icon: 'clock' }),
      metricTile('suspended', { label: t('permits.metrics.suspended'), icon: 'alert-circle' }),
    );
    function setTile(key, { value, helper, tone }) {
      const tile = tiles[key];
      const text = fmt.num(value);
      const changed = tile.last !== null && tile.last !== text;
      tile.value.textContent = text;
      tile.helper.textContent = helper || '';
      if (tile.tone !== tone) {
        if (tile.tone) tile.el.classList.remove(`tone-${tile.tone}`);
        if (tone) tile.el.classList.add(`tone-${tone}`);
        tile.tone = tone;
      }
      if (changed) motion.flash(tile.el);
      tile.last = text;
    }

    function paintMetrics() {
      const st = state();
      const gf = globalFilters();
      const at = now();
      const all = sel.filteredPermits(st, gf);
      const count = (s) => all.filter((p) => p.status === s).length;
      const active = all.filter((p) => p.status === ACTIVE);
      const workers = active.reduce((n, p) => n + (Number(p.workers) || 0), 0);
      const soon = expiringSoon(st, gf, at);
      const expired = expiredActive(st, gf, at);
      setTile('active', { value: active.length, helper: tn('permits.metrics.activeHelper', workers), tone: null });
      setTile('pending', { value: count(PENDING), helper: tn('permits.metrics.pendingHelper', count(DRAFT)), tone: count(PENDING) ? 'warning' : null });
      const nextP = soon[0];
      const expHelper = [nextP ? t('permits.metrics.expiringHelperNext', { code: nextP.code, time: zTime(fmt, nextP.expiresAt) }) : t('permits.metrics.expiringHelperNone'), expired.length ? tn('permits.metrics.expiredActive', expired.length) : ''].filter(Boolean).join(' · ');
      setTile('expiring', { value: soon.length, helper: expHelper, tone: expired.length ? 'critical' : (soon.length ? 'warning' : 'good') });
      setTile('suspended', { value: count(SUSPENDED), helper: tn('permits.metrics.suspendedHelper', count(CLOSED)), tone: count(SUSPENDED) ? 'serious' : null });
    }

    /* ── expiring within the hour (priority list) ── */
    function paintExpiring() {
      stopRegion('strip');
      clear(expiringHost);
      const st = state();
      const gf = globalFilters();
      const at = now();
      const urgent = [...expiredActive(st, gf, at), ...expiringSoon(st, gf, at)];
      if (!urgent.length) {
        expiringHost.appendChild(h('p', { class: 'note tone-good row gap-2' }, glyph('good', 16), h('span', {}, t('permits.expiring.none'))));
        return;
      }
      const ol = h('ol', { class: 'priority-list' });
      urgent.forEach((p) => {
        const expired = ms(p.expiresAt) <= at;
        const tone = expired ? 'critical' : 'warning';
        const cd = liveCountdown('strip', p.expiresAt);
        const open = () => openDrawer(p.id);
        ol.appendChild(h('li', { class: ['priority-item', 'is-clickable', `tone-${tone}`, expired ? 'is-overdue' : null], 'data-id': p.id, onClick: open },
          h('span', { class: 'priority-rank', 'aria-hidden': 'true' }, svgIcon(typeIcon(p.type), 15)),
          h('div', { class: 'priority-main' },
            h('div', { class: 'priority-title row wrap gap-2' }, h('span', { class: 'code' }, p.code), h('span', {}, typeLabel(p.type))),
            h('div', { class: 'priority-meta' }, h('span', {}, siteName(p.siteId)), h('span', {}, loc(p)))),
          h('div', { class: 'priority-side' },
            badge(expired ? t('permits.expiring.expired') : t('permits.expiring.soon'), tone),
            h('span', { class: ['priority-due', expired ? 'is-overdue' : null] }, cd.el, ' ', h('span', { class: 'num' }, t('permits.expiring.until', { time: zTime(fmt, p.expiresAt) })))),
          h('div', { class: 'priority-action' }, button(t('permits.card.view'), { variant: 'ghost', size: 'sm', attrs: { 'aria-label': t('permits.expiring.open', { code: p.code }) }, onClick: (e) => { e.stopPropagation(); open(); } }))));
      });
      expiringHost.appendChild(card({
        code: 'SEC-05.A', title: t('permits.expiring.title', { minutes: fmt.num(EXPIRING_MINUTES) }), subtitle: t('permits.expiring.sub'),
        body: ol,
      }));
    }

    /* ── type filter bar (rebuilt only when the counts change) ── */
    /* One swipe row of type chips on phones (.chips.is-scroll), wrapped rows on wider screens. "All" clears. */
    const chipEls = new Map();
    const chipRow = h('div', { class: 'chip-group chips is-scroll', role: 'group', 'aria-label': t('permits.board.filterLabel') });
    const paintChipState = () => {
      for (const [v, b] of chipEls) {
        const on = v === '__all__' ? typeFilter.length === 0 : typeFilter.includes(v);
        b.setAttribute('aria-pressed', on ? 'true' : 'false');
        b.classList.toggle('is-active', on);
      }
    };
    const addChip = (value, label, iconName) => {
      const count = h('span', { class: 'chip-count num' }, '');
      const b = h('button', { type: 'button', class: 'chip', 'aria-pressed': 'false', 'data-value': value,
        onClick: () => {
          if (value === '__all__') typeFilter = [];
          else typeFilter = typeFilter.includes(value) ? typeFilter.filter((x) => x !== value) : PERMIT_TYPES.filter((x) => x === value || typeFilter.includes(x));
          paintChipState();
          schedule(2);
        } });
      if (iconName) b.appendChild(svgIcon(iconName, 14));
      b.appendChild(h('span', { class: 'chip-label' }, label));
      b.appendChild(count);
      b.countEl = count;
      chipEls.set(value, b);
      chipRow.appendChild(b);
    };
    addChip('__all__', t('core.common.all'), null);
    PERMIT_TYPES.forEach((tp) => addChip(tp, typeLabel(tp), typeIcon(tp)));
    filterHost.appendChild(chipRow);
    function paintFilter() {
      const all = sel.filteredPermits(state(), globalFilters());
      for (const [v, b] of chipEls) {
        const n = v === '__all__' ? all.length : all.filter((p) => p.type === v).length;
        b.countEl.textContent = fmt.num(n);
      }
      paintChipState();
    }

    /* ── permit card content ── */
    function gasChips(gas) {
      if (!gas || typeof gas !== 'object') return null;
      const row = h('div', { class: 'row wrap gap-1', role: 'list', 'aria-label': t('permits.gas.aria') });
      GAS.forEach((g) => {
        const v = Number(gas[g.key]);
        if (!Number.isFinite(v)) return;
        const tone = g.tone(v);
        const reading = g.unit === '%' ? fmt.pct(v, g.digits) : `${fmt.num(v, { maximumFractionDigits: g.digits })} ${g.unit}`;
        const b = badge(`${g.label} ${reading}`, tone);
        b.setAttribute('role', 'listitem');
        b.title = t(GAS_TEXT[tone]);
        b.appendChild(h('span', { class: 'sr-only' }, ` — ${t(GAS_TEXT[tone])}`));
        row.appendChild(b);
      });
      return row.childNodes.length ? row : null;
    }

    /** Permit window in Riyadh time: same-day ranges as one LTR numeric run ("06:00–18:00"). */
    function windowLabel(p) {
      if (!p.startsAt || !p.expiresAt) return '—';
      if (zDayKey(p.startsAt) === zDayKey(p.expiresAt)) {
        return h('span', { class: 'row gap-1 wrap' },
          h('span', {}, zDate(fmt, p.startsAt, 'short')),
          h('span', { 'aria-hidden': 'true' }, '·'),
          h('span', { class: 'num', dir: 'ltr' }, `${zTime(fmt, p.startsAt)}–${zTime(fmt, p.expiresAt)}`));
      }
      return h('span', { class: 'row gap-1 wrap' }, h('span', {}, t('permits.card.from', { start: zDateTime(fmt, p.startsAt) })), h('span', {}, t('permits.card.to', { end: zDateTime(fmt, p.expiresAt) })));
    }

    function permitCardContent(p) {
      const wrap = h('div', { class: 'stack gap-2' });
      wrap.appendChild(h('div', { class: 'row between gap-2' },
        badge(typeLabel(p.type), 'neutral', { icon: typeIcon(p.type) }),
        h('span', { class: 'code text-xs muted' }, p.code)));
      wrap.appendChild(h('p', { class: 'kanban-card-title' }, loc(p)));
      wrap.appendChild(h('div', { class: 'kanban-card-meta' },
        h('span', {}, siteName(p.siteId)),
        h('span', {}, person(p.requester)),
        h('span', { class: 'nowrap' }, tn('permits.card.workers', Number(p.workers) || 0))));
      const gas = gasChips(p.gasTest);
      if (gas) wrap.appendChild(gas);
      const foot = h('div', { class: 'kanban-card-foot' });
      if (p.status === ACTIVE) {
        const cd = liveCountdown('board', p.expiresAt);
        foot.appendChild(h('span', { class: 'row gap-1 text-xs muted' }, cd.el, h('span', { class: 'nowrap num' }, t('permits.card.until', { time: zTime(fmt, p.expiresAt) }))));
      } else if (p.status === CLOSED) {
        foot.appendChild(h('span', { class: 'text-xs muted nowrap' }, t('permits.card.closed', { when: fmt.relative(p.closedAt || p.updatedAt || p.expiresAt, now()) })));
      } else {
        foot.appendChild(h('span', { class: 'text-xs muted' }, windowLabel(p)));
      }
      foot.appendChild(button(t('permits.card.view'), { variant: 'ghost', size: 'sm', attrs: { 'aria-label': t('permits.card.viewAria', { code: p.code }) }, onClick: (e) => { e.stopPropagation(); openDrawer(p.id); } }));
      wrap.appendChild(foot);
      return wrap;
    }

    /* ── kanban board ── */
    let board = null;
    function boardItems() {
      const types = new Set(typeFilter);
      return sel.filteredPermits(state(), globalFilters())
        .filter((p) => !types.size || types.has(p.type))
        .sort((a, b) => (ms(a.expiresAt) || 0) - (ms(b.expiresAt) || 0))
        .map((p) => ({ id: p.id, columnId: p.status, code: p.code, title: `${typeLabel(p.type)} — ${loc(p)}`, render: () => permitCardContent(p) }));
    }

    function paintBoard(changedIds = []) {
      stopRegion('board');
      paintFilter();
      const items = boardItems();
      if (!board) {
        board = kanban({
          columns: PERMIT_STATUS.map((s) => ({ id: s, label: statusLabel(s), tone: COLUMN_TONE[s] || null })),
          items,
          onMove: (id, to) => movePermit(id, to),
          ariaLabel: t('permits.board.aria'),
        });
        boardHost.appendChild(board.el);
      } else {
        board.update(items);
        changedIds.forEach((id) => {
          const el = board.el.querySelector(`.kanban-card[data-id="${CSS.escape(String(id))}"]`);
          if (el) motion.flash(el);
        });
      }
      board.el.hidden = items.length === 0;
      boardEmpty.hidden = items.length !== 0;
    }

    function movePermit(id, toStatus) {
      const p = findPermit(id);
      if (!p || !PERMIT_STATUS.includes(toStatus) || p.status === toStatus) return false;
      if (p.status === CLOSED) { toast(t('permits.move.closedFinal', { code: p.code }), { tone: 'warning' }); return false; }
      if (toStatus === ACTIVE && ms(p.expiresAt) <= now()) { toast(t('permits.move.expired', { code: p.code }), { tone: 'warning' }); return false; }
      const updated = store.updatePermit(id, { status: toStatus });
      if (!updated) { toast(t('permits.move.failed', { code: p.code }), { tone: 'critical' }); return false; }
      const key = STATUS_KEY[toStatus] || 'draft';
      const tone = toStatus === ACTIVE ? 'good' : toStatus === SUSPENDED ? 'serious' : 'neutral';
      toast(t(`permits.move.done.${key}`, { code: p.code, status: statusLabel(toStatus) }), { tone });
      return true;
    }

    /* ── drawer ── */
    function section(title, ...children) {
      return h('section', { class: 'drawer-section' }, h('h3', { class: 'drawer-section-title' }, title), h('div', { class: 'stack gap-3' }, children));
    }

    function openDrawer(id) {
      const first = findPermit(id);
      if (!first) { toast(t('permits.move.notFound'), { tone: 'warning' }); return; }
      if (activeDrawer) { activeDrawer.close(); activeDrawer = null; }

      const approveBtn = button(t('permits.drawer.approve'), { variant: 'primary', icon: 'file-check', onClick: () => movePermit(id, ACTIVE) });
      const submitBtn = button(t('permits.drawer.submit'), { variant: 'outline', onClick: () => movePermit(id, PENDING) });
      const suspendBtn = button(t('permits.drawer.suspend'), { variant: 'outline', onClick: () => movePermit(id, SUSPENDED) });
      const closeBtn = button(t('permits.drawer.close'), { variant: 'danger', onClick: () => movePermit(id, CLOSED) });
      const actionBtns = [approveBtn, submitBtn, suspendBtn, closeBtn];

      const overview = () => {
        stopRegion('drawer');
        const p = findPermit(id);
        if (!p) return emptyState({ title: t('permits.drawer.deleted') });
        const at = now();
        const expired = ms(p.expiresAt) <= at;
        const badges = h('div', { class: 'row wrap gap-2' }, badge(statusLabel(p.status), statusTone(p.status)), badge(typeLabel(p.type), 'neutral', { icon: typeIcon(p.type) }));
        if (p.status === ACTIVE && expired) badges.appendChild(badge(t('permits.drawer.expiredBadge'), 'critical'));
        else if (p.status === ACTIVE && ms(p.expiresAt) - at <= EXPIRING_MINUTES * MINUTE) badges.appendChild(badge(t('permits.drawer.soonBadge'), 'warning'));
        const expiry = h('span', { class: 'row wrap gap-2' }, h('span', {}, zDateTime(fmt, p.expiresAt)));
        if (p.status === ACTIVE) expiry.appendChild(liveCountdown('drawer', p.expiresAt).el);
        return h('div', { class: 'stack gap-4' },
          section(t('permits.drawer.details'), badges, kv([
            [t('permits.drawer.site'), siteName(p.siteId)],
            [t('permits.drawer.location'), loc(p)],
            [t('permits.drawer.requester'), person(p.requester)],
            [t('permits.drawer.approver'), person(p.approver)],
            [t('permits.drawer.starts'), zDateTime(fmt, p.startsAt)],
            [t('permits.drawer.expires'), expiry],
            [t('permits.drawer.duration'), fmt.duration(Math.max(0, ms(p.expiresAt) - ms(p.startsAt)), { style: 'long' })],
            [t('permits.drawer.workers'), tn('permits.card.workers', Number(p.workers) || 0)],
            p.approvedAt ? [t('permits.drawer.approvedAt'), zDateTime(fmt, p.approvedAt)] : null,
            p.createdAt ? [t('permits.drawer.created'), fmt.relative(p.createdAt, at)] : null,
          ])),
          h('p', { class: 'note is-demo t-helper' }, t('permits.drawer.localNote')));
      };
      const controlsTab = () => {
        const p = findPermit(id);
        if (!p) return emptyState({ title: t('permits.drawer.deleted') });
        const hazards = Array.isArray(p.hazards) ? i18n.L(p, 'hazards', 'permits') : [];
        const controls = Array.isArray(p.controls) ? i18n.L(p, 'controls', 'permits') : [];
        return h('div', { class: 'stack gap-4' },
          section(`${t('permits.drawer.hazards')} (${fmt.num(hazards.length)})`, hazards.length
            ? h('ul', { class: 'controls-list' }, hazards.map((x) => h('li', { class: 'controls-item tone-warning' }, h('span', { class: 'controls-type' }, t('permits.drawer.hazard')), h('span', {}, codeSafeDigits(fmt, String(x))))))
            : h('p', { class: 'note' }, t('permits.drawer.noHazards'))),
          section(`${t('permits.drawer.controls')} (${fmt.num(controls.length)})`, controls.length
            ? h('ol', { class: 'controls-list' }, controls.map((x, i) => h('li', { class: 'controls-item tone-good' }, h('span', { class: 'controls-type num' }, fmt.num(i + 1)), h('span', {}, codeSafeDigits(fmt, typeof x === 'string' ? x : (x && x.text) || '—')))))
            : h('p', { class: 'note' }, t('permits.drawer.noControls'))));
      };
      const gasTab = () => {
        const p = findPermit(id);
        if (!p) return emptyState({ title: t('permits.drawer.deleted') });
        const chips = gasChips(p.gasTest);
        const limits = t('permits.gas.limits', { o2min: fmt.pct(19.5, 1), o2max: fmt.pct(23.5, 1), lel: fmt.pct(10), h2s: fmt.num(10), co: fmt.num(35) });
        return h('div', { class: 'stack gap-4' },
          section(t('permits.drawer.tabs.gas'), chips || h('p', { class: 'note' }, t('permits.gas.none'))),
          h('p', { class: 't-helper' }, limits));
      };

      const countOf = (p) => (Array.isArray(p.hazards) ? p.hazards.length : 0) + (Array.isArray(p.controls) ? p.controls.length : 0);
      const api = drawer({
        title: first.code, subtitle: `${typeLabel(first.type)} · ${siteName(first.siteId)}`, size: 'lg',
        tabs: [
          { id: 'overview', label: t('permits.drawer.tabs.overview'), render: overview },
          { id: 'controls', label: t('permits.drawer.tabs.controls'), count: countOf(first), render: controlsTab },
          { id: 'gas', label: t('permits.drawer.tabs.gas'), render: gasTab },
        ],
        kind: 'permit',
        actions: [...actionBtns, { label: t('permits.drawer.dismiss'), variant: 'ghost' }],
        onClose: () => { unsub(); stopRegion('drawer'); if (activeDrawer === api) activeDrawer = null; },
      });
      activeDrawer = api;

      const paintActions = () => {
        const p = findPermit(id);
        if (!p) { actionBtns.forEach((b) => { b.hidden = true; }); return; }
        approveBtn.hidden = !(p.status === DRAFT || p.status === PENDING || p.status === SUSPENDED);
        const lab = approveBtn.querySelector('.btn-label');
        if (lab) lab.textContent = p.status === SUSPENDED ? t('permits.drawer.resume') : t('permits.drawer.approve');
        submitBtn.hidden = p.status !== DRAFT;
        suspendBtn.hidden = p.status !== ACTIVE;
        closeBtn.hidden = p.status === CLOSED;
        api.setTabCount('controls', countOf(p));
        api.setSubtitle(`${typeLabel(p.type)} · ${siteName(p.siteId)}`);
      };
      paintActions();
      const unsub = bus.on('store:change', (payload) => {
        const path = payload && payload.path;
        if (!touches(path, 'permits')) return;
        const pid = idFromPath(path);
        if (pid && pid !== id) return;
        const focusedInside = api.el.contains(document.activeElement) ? document.activeElement : null;
        paintActions();
        api.refreshTab();
        if (focusedInside && !focusedInside.isConnected) {
          const fallback = api.el.querySelector('.drawer-foot button:not([hidden])') || api.el;
          try { fallback.focus({ preventScroll: true }); } catch { /* ignore */ }
        }
      });
      api.open();
    }

    /* ── new permit modal ── */
    function fieldOf(form, name) { return form.querySelector(`.field[data-name="${name}"]`); }
    function setError(form, name, message) {
      const wrap = fieldOf(form, name);
      if (!wrap) return;
      const control = wrap.querySelector('.field-control');
      let err = wrap.querySelector('.field-error');
      if (!message) {
        wrap.classList.remove('is-invalid');
        if (control) control.removeAttribute('aria-invalid');
        if (err) err.remove();
        if (control && control.dataset.describedby !== undefined) {
          if (control.dataset.describedby) control.setAttribute('aria-describedby', control.dataset.describedby); else control.removeAttribute('aria-describedby');
        }
        return;
      }
      if (!err) {
        err = h('p', { class: 'field-error', id: `${control ? control.id : name}-err` });
        wrap.appendChild(err);
      }
      clear(err);
      err.append(glyph('critical', 14), h('span', {}, message));
      wrap.classList.add('is-invalid');
      if (control) {
        if (control.dataset.describedby === undefined) control.dataset.describedby = control.getAttribute('aria-describedby') || '';
        control.setAttribute('aria-invalid', 'true');
        control.setAttribute('aria-describedby', [control.dataset.describedby, err.id].filter(Boolean).join(' '));
      }
    }

    function openNewPermitModal() {
      if (activeModal) { activeModal.close(); activeModal = null; }
      const st = state();
      const sites = (st.sites || []).map((s) => ({ value: s.id, label: `${i18n.L(s, 'name', 'sites')} (${s.code})` }));
      const gf = globalFilters();
      const defaultSite = gf.siteId && gf.siteId !== 'all' ? gf.siteId : (sites[0] ? sites[0].value : 'S1');
      const startMs = Math.ceil(now() / (15 * MINUTE)) * 15 * MINUTE;
      const endMs = startMs + 8 * HOUR;

      const summary = h('p', { class: 'form-error-summary is-full', role: 'alert', hidden: true });
      const form = h('form', { class: 'form-grid', 'aria-label': t('permits.form.aria'), novalidate: true });
      form.append(
        summary,
        h('h3', { class: 'form-section-title' }, t('permits.form.sectionWhat')),
        formField({ label: t('permits.form.type'), name: 'type', type: 'select', value: PERMIT_TYPES[0], options: PERMIT_TYPES.map((tp) => ({ value: tp, label: typeLabel(tp) })), required: true }),
        formField({ label: t('permits.form.status'), name: 'status', type: 'select', value: PENDING, options: [DRAFT, PENDING].map((s) => ({ value: s, label: statusLabel(s) })), hint: t('permits.form.statusHint') }),
        formField({ label: t('permits.form.site'), name: 'siteId', type: 'select', value: defaultSite, options: sites, required: true }),
        formField({ label: t('permits.form.location'), name: 'location', required: true, placeholder: t('permits.form.locationPh', { n: fmt.num(12) }) }),
        formField({ label: t('permits.form.requester'), name: 'requester', required: true, placeholder: t('permits.form.requesterPh') }),
        formField({ label: t('permits.form.approver'), name: 'approver', required: true, placeholder: t('permits.form.approverPh') }),
        h('h3', { class: 'form-section-title' }, t('permits.form.sectionWhen')),
        formField({ label: t('permits.form.start'), name: 'startsAt', type: 'datetime-local', value: toRiyadhInput(startMs), required: true, hint: t('permits.tz') }),
        formField({ label: t('permits.form.end'), name: 'expiresAt', type: 'datetime-local', value: toRiyadhInput(endMs), required: true, hint: t('permits.form.endHint', { hours: fmt.num(MAX_HOURS) }) }),
        formField({ label: t('permits.form.workers'), name: 'workers', type: 'number', value: 4, min: WORKERS_MIN, max: WORKERS_MAX, step: 1, required: true }),
        h('h3', { class: 'form-section-title' }, t('permits.form.sectionRisk')),
        formField({ label: t('permits.form.hazards'), name: 'hazards', type: 'textarea', rows: 3, required: true, placeholder: t('permits.form.hazardsPh'), hint: t('permits.form.lineHint') }),
        formField({ label: t('permits.form.controls'), name: 'controls', type: 'textarea', rows: 3, required: true, placeholder: t('permits.form.controlsPh'), hint: t('permits.form.lineHint') }),
        h('h3', { class: 'form-section-title' }, t('permits.form.sectionGas')),
        ...GAS.map((g) => formField({ label: t(`permits.form.${g.key}`), name: g.key, type: 'number', min: g.min, max: g.max, step: g.digits ? 0.1 : 1 })),
      );
      // Section titles and the summary span the whole grid.
      form.querySelectorAll('.form-section-title').forEach((n) => n.classList.add('is-full'));
      form.addEventListener('input', (e) => { const f = e.target && e.target.closest('.field'); if (f && f.classList.contains('is-invalid')) setError(form, f.dataset.name, ''); });

      const valueOf = (name) => { const c = form.elements.namedItem(name); return c && 'value' in c ? String(c.value).trim() : ''; };
      function validate() {
        const errors = {};
        ['type', 'siteId', 'location', 'requester', 'approver', 'startsAt', 'expiresAt', 'workers', 'hazards', 'controls'].forEach((n) => { if (!valueOf(n)) errors[n] = t('permits.form.errors.required'); });
        const startsAt = fromRiyadhInput(valueOf('startsAt'));
        const expiresAt = fromRiyadhInput(valueOf('expiresAt'));
        if (valueOf('startsAt') && !startsAt) errors.startsAt = t('permits.form.errors.date');
        if (valueOf('expiresAt') && !expiresAt) errors.expiresAt = t('permits.form.errors.date');
        if (startsAt && expiresAt && !errors.expiresAt) {
          if (ms(expiresAt) <= ms(startsAt)) errors.expiresAt = t('permits.form.errors.order');
          else if (ms(expiresAt) <= now()) errors.expiresAt = t('permits.form.errors.past');
          else if (ms(expiresAt) - ms(startsAt) > MAX_HOURS * HOUR) errors.expiresAt = t('permits.form.errors.long', { hours: fmt.num(MAX_HOURS) });
        }
        const w = Number(valueOf('workers'));
        if (valueOf('workers') && (!Number.isInteger(w) || w < WORKERS_MIN || w > WORKERS_MAX)) errors.workers = t('permits.form.errors.workers', { min: fmt.num(WORKERS_MIN), max: fmt.num(WORKERS_MAX) });
        if (valueOf('hazards') && !lines(valueOf('hazards')).length) errors.hazards = t('permits.form.errors.required');
        if (valueOf('controls') && !lines(valueOf('controls')).length) errors.controls = t('permits.form.errors.required');
        GAS.forEach((g) => {
          const raw = valueOf(g.key);
          if (!raw) return;
          const v = Number(raw);
          if (!Number.isFinite(v) || v < g.min || v > g.max) errors[g.key] = t('permits.form.errors.range', { min: fmt.num(g.min), max: fmt.num(g.max) });
        });
        return { errors, startsAt, expiresAt };
      }

      const submit = () => {
        const { errors, startsAt, expiresAt } = validate();
        const names = ['type', 'siteId', 'location', 'requester', 'approver', 'startsAt', 'expiresAt', 'workers', 'hazards', 'controls', ...GAS.map((g) => g.key)];
        names.forEach((n) => setError(form, n, errors[n] || ''));
        const bad = names.filter((n) => errors[n]);
        if (bad.length) {
          summary.textContent = t('permits.form.errors.summary');
          summary.hidden = false;
          const firstBad = form.elements.namedItem(bad[0]);
          if (firstBad && typeof firstBad.focus === 'function') firstBad.focus();
          return false;
        }
        summary.hidden = true;
        const gasEntries = GAS.map((g) => [g.key, valueOf(g.key)]).filter(([, v]) => v !== '' && Number.isFinite(Number(v)));
        const permit = store.addPermit({
          type: valueOf('type'), status: valueOf('status') || PENDING, siteId: valueOf('siteId'), location: valueOf('location'),
          requester: valueOf('requester'), approver: valueOf('approver'), startsAt, expiresAt,
          workers: Number(valueOf('workers')) || 1, hazards: lines(valueOf('hazards')), controls: lines(valueOf('controls')),
          gasTest: gasEntries.length ? Object.fromEntries(gasEntries.map(([k, v]) => [k, Number(v)])) : null,
        });
        if (!permit) { toast(t('permits.form.failed'), { tone: 'critical' }); return false; }
        toast(t('permits.form.saved', { code: permit.code, status: statusLabel(permit.status) }), { tone: 'good', title: t('permits.form.savedTitle'), action: { label: t('permits.form.view'), onClick: () => openDrawer(permit.id) } });
        if (typeFilter.length && !typeFilter.includes(permit.type)) typeFilter = [];
        return true;
      };
      form.addEventListener('submit', (e) => { e.preventDefault(); if (submit()) api.close('action'); });

      const api = modal({
        title: t('permits.form.title'), subtitle: t('permits.form.sub'), size: 'lg', body: form,
        actions: [{ label: t('permits.form.cancel'), variant: 'ghost' }, { label: t('permits.form.save'), variant: 'primary', onClick: () => submit() }],
        onClose: () => { if (activeModal === api) activeModal = null; },
      });
      activeModal = api;
      api.open();
    }

    /* ── repaint orchestration ── */
    let pending = 0; // 1 metrics + expiring, 2 board
    let pendingIds = new Set();
    let raf = 0;
    const schedule = (mask, ids = []) => {
      pending |= mask;
      ids.forEach((id) => pendingIds.add(id));
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        if (!alive) return;
        const m = pending; pending = 0;
        const changed = Array.from(pendingIds); pendingIds = new Set();
        try {
          if (m & 1) { paintMetrics(); paintExpiring(); }
          if (m & 2) paintBoard(changed);
        } catch (err) { console.warn('[biltix] permits: repaint failed', err); }
      });
    };

    paintMetrics(); paintExpiring(); paintBoard();
    motion.enter(metricsHost.children, { y: 8 });
    motion.enter([expiringHost, boardCard], { y: 10, delay: 0.08 });

    subs.push(bus.on('store:change', (p) => {
      const path = p && p.path;
      if (touches(path, 'permits') || touches(path, 'sites')) { const pid = idFromPath(path); schedule(3, pid ? [pid] : []); }
    }));
    subs.push(bus.on('filters:change', () => schedule(3)));
    subs.push(bus.on('settings:change', () => schedule(3)));

    /* minute refresh keeps "expiring soon" honest without store writes */
    const minuteTimer = setInterval(() => { if (alive && !document.hidden) schedule(1); }, 60_000);

    /* deep links: ?id=P3 opens the drawer, ?new=1 opens the modal */
    const params = (ctx && ctx.params) || {};
    if (params.new === '1' || params.new === 'true') {
      requestAnimationFrame(() => { if (!alive) return; openNewPermitModal(); try { history.replaceState(null, '', `#/${permitsView.id}`); } catch { /* ignore */ } });
    } else if (params.id) {
      requestAnimationFrame(() => { if (alive && findPermit(params.id)) openDrawer(params.id); });
    }

    return () => {
      alive = false;
      clearInterval(minuteTimer);
      if (raf) { cancelAnimationFrame(raf); raf = 0; }
      subs.splice(0).forEach((u) => { try { u(); } catch { /* ignore */ } });
      stopRegion('strip'); stopRegion('board'); stopRegion('drawer');
      if (board && typeof board.destroy === 'function') { try { board.destroy(); } catch { /* ignore */ } }
      if (activeDrawer) { try { activeDrawer.close(); } catch { /* ignore */ } activeDrawer = null; }
      if (activeModal) { try { activeModal.close(); } catch { /* ignore */ } activeModal = null; }
    };
  },
};

export default permitsView;
