/**
 * Biltix HSE — view SEC-05: تصاريح العمل (js/views/permits.js)
 *
 * Contract: docs/ARCHITECTURE.md §8.5. Owner: VIEWS-B.
 *
 *   • Top strip: count per status + a live list of active permits expiring within
 *     60 minutes (components.countdown, warning/expired states)
 *   • Type filter chips (site / range / search come from the global filter row)
 *   • components.kanban across PERMIT_STATUS; permit cards carry type icon, mono code,
 *     site, location, requester, workers, a live countdown for active permits and gas
 *     test chips when a test exists. Drag or «نقل إلى» → store.updatePermit(id,{status})
 *   • Detail drawer with hazards / controls lists and actions اعتماد / تعليق / إغلاق
 *   • «تصريح جديد» modal → store.addPermit
 *
 * Every countdown started by the view is tracked and stopped on repaint and on cleanup.
 * Re-renders on store:change (permits.*), filters:change and settings:change.
 */

import * as SEED from '../data/seed.js';
import {
  h, clear, glyph, svgIcon, card, badge, button, modal, drawer, toast, kanban, countdown,
  formField, readForm, emptyState, kv,
} from '../ui/components.js';

/* ────────────────────────────── enums (contract §3, with fallbacks) ────────────────────────────── */

const list = (value, fallback) => (Array.isArray(value) && value.length ? value : fallback);

const PERMIT_TYPES = list(SEED.PERMIT_TYPES, ['أعمال ساخنة', 'أماكن مغلقة', 'العمل على ارتفاع', 'عزل كهربائي', 'حفريات', 'رفع ثقيل', 'أعمال ليلية']);
const PERMIT_STATUS = list(SEED.PERMIT_STATUS, ['مسودة', 'بانتظار الاعتماد', 'نشط', 'معلق', 'مغلق']);

const DRAFT = 'مسودة';
const PENDING = 'بانتظار الاعتماد';
const ACTIVE = 'نشط';
const SUSPENDED = 'معلق';
const CLOSED = 'مغلق';

/** Column / badge tones. Active permits are "live" (accent), suspended need attention. */
const STATUS_TONE = { [DRAFT]: 'neutral', [PENDING]: 'warning', [ACTIVE]: 'accent', [SUSPENDED]: 'serious', [CLOSED]: 'neutral' };
const COLUMN_TONE = { [PENDING]: 'warning', [ACTIVE]: 'accent', [SUSPENDED]: 'serious' };

/** Permit type → art icon (category icons are part of the contract; 'clock' has a local glyph). */
const TYPE_ICON = {
  'أعمال ساخنة': 'flame', 'أماكن مغلقة': 'confined', 'العمل على ارتفاع': 'height', 'عزل كهربائي': 'bolt',
  'حفريات': 'excavation', 'رفع ثقيل': 'crane', 'أعمال ليلية': 'clock',
};

/** Gas test thresholds (confined-space practice: O₂ 19.5–23.5 %, H₂S 10 ppm, CO 35 ppm). */
const GAS = [
  { key: 'o2', label: 'O₂', unit: '%', digits: 1, tone: (v) => (v < 19.5 || v > 23.5 ? 'critical' : 'good') },
  { key: 'lel', label: 'LEL', unit: '%', digits: 0, tone: (v) => (v >= 10 ? 'critical' : v > 0 ? 'warning' : 'good') },
  { key: 'h2s', label: 'H₂S', unit: 'ppm', digits: 1, tone: (v) => (v >= 10 ? 'critical' : v >= 5 ? 'warning' : 'good') },
  { key: 'co', label: 'CO', unit: 'ppm', digits: 0, tone: (v) => (v >= 35 ? 'critical' : v >= 25 ? 'warning' : 'good') },
];

const EXPIRING_MINUTES = 60;
const HOUR_MS = 3_600_000;

/* ────────────────────────────── pure helpers ────────────────────────────── */

const pad2 = (n) => String(n).padStart(2, '0');

function localISO(d) {
  const offset = -d.getTimezoneOffset();
  const sign = offset >= 0 ? '+' : '-';
  const abs = Math.abs(offset);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}${sign}${pad2(Math.floor(abs / 60))}:${pad2(abs % 60)}`;
}

function toDatetimeLocal(d) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

function fromDatetimeLocal(value) {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(String(value || ''));
  if (!m) return null;
  const d = new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], 0, 0);
  return Number.isNaN(d.getTime()) ? null : localISO(d);
}

function roundToQuarter(d) {
  const out = new Date(d.getTime());
  out.setSeconds(0, 0);
  out.setMinutes(Math.ceil(out.getMinutes() / 15) * 15);
  return out;
}

const statusTone = (status) => STATUS_TONE[status] || 'neutral';
const typeIcon = (type) => TYPE_ICON[type] || 'file-check';

function siteName(state, siteId) {
  const site = (state.sites || []).find((s) => s && s.id === siteId);
  return site ? site.name : '—';
}

function touches(path, prefix) {
  if (!path || path === '*') return true;
  const p = String(path);
  return p === prefix || p.startsWith(`${prefix}.`);
}

const ms = (iso) => { const t = Date.parse(iso); return Number.isFinite(t) ? t : NaN; };

function sameDay(a, b) {
  const da = new Date(a); const db = new Date(b);
  return da.getFullYear() === db.getFullYear() && da.getMonth() === db.getMonth() && da.getDate() === db.getDate();
}

/** Split a textarea into trimmed, non-empty lines. */
const lines = (value) => String(value || '').split(/\r?\n/).map((s) => s.trim()).filter(Boolean);

function chipGroup({ options, value, onChange, ariaLabel, fmt }) {
  const el = h('div', { class: 'chip-group', role: 'group', 'aria-label': ariaLabel });
  const buttons = new Map();
  let current = value;
  const paint = () => { for (const [v, b] of buttons) b.setAttribute('aria-pressed', String(v) === String(current) ? 'true' : 'false'); };
  options.forEach((o) => {
    const count = h('span', { class: 'chip-count', hidden: true }, '');
    const b = h('button', { type: 'button', class: 'chip', 'aria-pressed': 'false', onClick: () => { if (String(current) === String(o.value)) return; current = o.value; paint(); onChange(o.value); } });
    if (o.icon) b.appendChild(svgIcon(o.icon, 14));
    b.appendChild(h('span', {}, o.label));
    b.appendChild(count);
    b.countEl = count;
    buttons.set(o.value, b);
    el.appendChild(b);
  });
  paint();
  return {
    el,
    setCounts(counts) {
      for (const [v, b] of buttons) {
        const n = counts[v];
        b.countEl.hidden = n === undefined || n === null;
        b.countEl.textContent = n === undefined || n === null ? '' : fmt.num(n);
      }
    },
  };
}

/* ────────────────────────────── the view ────────────────────────────── */

export const permitsView = {
  id: 'permits',
  code: 'SEC-05',
  title: 'تصاريح العمل',
  icon: 'file-check',

  render(container, ctx) {
    const { store, bus, sel, fmt } = ctx;
    const subs = [];
    let alive = true;
    let activeDrawer = null;
    let activeModal = null;
    let typeFilter = 'all';

    /* countdown registries — one per region so repaints only stop what they replace */
    const timers = { strip: new Set(), board: new Set(), drawer: new Set() };
    const track = (region, cd) => { if (cd) timers[region].add(cd); return cd; };
    const stopRegion = (region) => { timers[region].forEach((cd) => { try { cd.stop(); } catch { /* ignore */ } }); timers[region].clear(); };
    /**
     * Countdown whose natural expiry refreshes the strip. The handler is armed only after
     * construction: countdown() ticks synchronously, so an already-expired permit would
     * otherwise fire onExpire during every repaint and loop the strip forever.
     */
    const liveCountdown = (region, iso) => {
      let armed = false;
      const cd = track(region, countdown(iso, { onExpire: () => { if (armed) schedule(1); } }));
      armed = true;
      return cd;
    };

    const state = () => store.state;
    const globalFilters = () => ({ ...(store.filters || state().filters || {}) });
    const boardFilters = () => ({ ...globalFilters(), type: typeFilter === 'all' ? undefined : typeFilter });
    const findPermit = (id) => (state().permits || []).find((p) => p && p.id === id) || null;

    /* ── skeleton ── */
    const root = h('section', { class: 'view view-permits', 'aria-labelledby': 'permits-title' });
    root.appendChild(h('header', { class: 'view-head' },
      h('div', { class: 'view-head-text' },
        h('span', { class: 'code-tag' }, permitsView.code),
        h('h1', { id: 'permits-title', tabindex: '-1' }, permitsView.title),
        h('p', { class: 'view-lead' }, 'لوحة تصاريح العمل الخطرة من المسودة حتى الإغلاق: اعتماد، تعليق، عدّ تنازلي حي لانتهاء الصلاحية، وقراءات فحص الغازات للأماكن المغلقة والأعمال الساخنة.')),
      h('div', { class: 'view-actions' }, button('تصريح جديد', { variant: 'primary', icon: 'file-check', onClick: () => openNewPermitModal() }))));

    /* six cells (five statuses + "expiring within the hour") must share one row on desktop */
    const stripHost = h('div', { class: 'summary-strip', role: 'group', 'aria-label': 'ملخص التصاريح حسب الحالة', style: { gridTemplateColumns: 'repeat(auto-fit, minmax(128px, 1fr))' } });
    const expiringHost = h('div', { class: 'stack' });
    const toolbar = h('div', { class: 'toolbar' });
    const boardHost = h('div', { class: 'stack' });
    root.append(stripHost, expiringHost, toolbar, boardHost);

    const typeChips = chipGroup({
      fmt,
      ariaLabel: 'تصفية حسب نوع التصريح',
      value: 'all',
      options: [{ value: 'all', label: 'جميع الأنواع' }, ...PERMIT_TYPES.map((t) => ({ value: t, label: t, icon: typeIcon(t) }))],
      onChange: (v) => { typeFilter = v; paintBoard(); },
    });
    toolbar.appendChild(typeChips.el);
    toolbar.appendChild(h('span', { class: 'toolbar-spacer' }));
    toolbar.appendChild(h('p', { class: 'text-xs muted' }, 'اسحب البطاقة إلى عمود آخر أو استخدم زر «نقل إلى» لتغيير الحالة'));

    container.appendChild(root);

    /* ── summary strip ── */
    function paintStrip() {
      stopRegion('strip');
      clear(stripHost); clear(expiringHost);
      const st = state();
      const gf = globalFilters();
      const byStatus = sel.permitsByStatus(st, gf);
      const expiring = sel.permitsExpiringSoon(st, EXPIRING_MINUTES, gf);
      const now = Date.now();
      const overdue = (st.permits || []).filter((p) => p && p.status === ACTIVE && (gf.siteId === 'all' || !gf.siteId || p.siteId === gf.siteId) && ms(p.expiresAt) <= now);

      byStatus.forEach((s) => {
        const tone = statusTone(s.label);
        const cell = h('div', { class: ['summary-cell', `tone-${tone}`] });
        const label = h('span', { class: 'summary-label' });
        const ic = glyph(tone, 14); ic.style.color = 'var(--tone-ink)';
        label.append(ic, h('span', {}, s.label));
        cell.append(label, h('span', { class: 'summary-value' }, fmt.num(s.value)));
        stripHost.appendChild(cell);
      });
      const soonCell = h('div', { class: ['summary-cell', expiring.length || overdue.length ? 'tone-warning' : 'tone-neutral'] });
      const soonLabel = h('span', { class: 'summary-label' });
      const soonIc = glyph(expiring.length || overdue.length ? 'warning' : 'neutral', 14); soonIc.style.color = 'var(--tone-ink)';
      soonLabel.append(soonIc, h('span', {}, 'تنتهي خلال ساعة'));
      const soonValue = h('span', { class: 'summary-value' }, fmt.num(expiring.length));
      if (overdue.length) soonValue.appendChild(h('small', {}, `+${fmt.num(overdue.length)} منتهية`));
      soonCell.append(soonLabel, soonValue);
      stripHost.appendChild(soonCell);

      /* expiring list */
      const urgent = [...overdue, ...expiring];
      if (!urgent.length) {
        expiringHost.appendChild(h('p', { class: 'note tone-good' }, 'لا توجد تصاريح نشطة تنتهي خلال الساعة القادمة.'));
        return;
      }
      const ul = h('ul', { class: 'urgent-list' });
      urgent.forEach((p) => {
        const expired = ms(p.expiresAt) <= now;
        const cd = liveCountdown('strip', p.expiresAt);
        const item = h('button', { type: 'button', class: ['urgent-item', expired ? 'tone-critical' : 'tone-warning', expired ? 'is-overdue' : null], onClick: () => openDrawer(p.id) },
          h('span', { class: 'urgent-icon', 'aria-hidden': 'true' }, svgIcon(typeIcon(p.type), 15)),
          h('span', { class: 'urgent-text' },
            h('span', { class: 'row wrap gap-2' }, h('span', { class: 'mono' }, p.code), h('span', {}, p.type), badge(expired ? 'منتهٍ وما زال نشطاً' : 'يقترب من الانتهاء', expired ? 'critical' : 'warning')),
            h('span', { class: 'urgent-sub' }, `${siteName(st, p.siteId)} · ${p.location || '—'}`)),
          h('span', { class: 'urgent-due' }, cd.el, h('span', {}, fmt.time(p.expiresAt))));
        ul.appendChild(h('li', {}, item));
      });
      expiringHost.appendChild(card({
        code: 'SEC-05.A', title: 'تنتهي خلال 60 دقيقة', subtitle: 'تصاريح نشطة تحتاج إلى تمديد أو إغلاق قبل انتهاء صلاحيتها',
        body: ul, framed: true,
      }));
    }

    /* ── permit card content (inside kanban card) ── */
    function gasChips(gas) {
      if (!gas || typeof gas !== 'object') return null;
      const row = h('div', { class: 'row wrap gap-1', 'aria-label': 'قراءات فحص الغازات' });
      GAS.forEach((g) => {
        const v = Number(gas[g.key]);
        if (!Number.isFinite(v)) return;
        row.appendChild(badge(`${g.label} ${fmt.num(v, { maximumFractionDigits: g.digits })}${g.unit === '%' ? '%' : ` ${g.unit}`}`, g.tone(v)));
      });
      return row.childNodes.length ? row : null;
    }

    function timeLabel(p) {
      const start = p.startsAt; const end = p.expiresAt;
      if (!start || !end) return '—';
      if (sameDay(start, end)) return `${fmt.date(start, { style: 'short' })} · ${fmt.time(start)}–${fmt.time(end)}`;
      return `${fmt.dateTime(start)} ← ${fmt.dateTime(end)}`;
    }

    function permitCardContent(p) {
      const st = state();
      const wrap = h('div', { class: 'stack gap-2' });
      wrap.appendChild(h('div', { class: 'row between gap-2' },
        badge(p.type, 'neutral', { icon: typeIcon(p.type) }),
        h('span', { class: 'mono text-xs muted nowrap' }, p.code)));
      wrap.appendChild(h('p', { class: 'kanban-card-title' }, p.location || '—'));
      wrap.appendChild(h('div', { class: 'kanban-card-meta' },
        h('span', {}, siteName(st, p.siteId)),
        h('span', {}, p.requester || '—'),
        h('span', { class: 'nowrap' }, `${fmt.num(Number(p.workers) || 0)} ${Number(p.workers) === 1 ? 'عامل' : 'عمال'}`)));
      const gas = gasChips(p.gasTest);
      if (gas) wrap.appendChild(gas);

      const foot = h('div', { class: 'kanban-card-foot' });
      if (p.status === ACTIVE) {
        const cd = liveCountdown('board', p.expiresAt);
        foot.appendChild(h('span', { class: 'row gap-1 text-xs muted' }, cd.el, h('span', { class: 'nowrap' }, `حتى ${fmt.time(p.expiresAt)}`)));
      } else if (p.status === CLOSED) {
        foot.appendChild(h('span', { class: 'text-xs muted nowrap' }, `أُغلق ${fmt.relative(p.updatedAt || p.expiresAt)}`));
      } else {
        foot.appendChild(h('span', { class: 'text-xs muted mono' }, timeLabel(p)));
      }
      foot.appendChild(button('عرض', { variant: 'ghost', size: 'sm', onClick: (e) => { e.stopPropagation(); openDrawer(p.id); } }));
      wrap.appendChild(foot);
      return wrap;
    }

    /* ── kanban board ── */
    let board = null;
    function boardItems() {
      const rows = sel.filteredPermits(state(), boardFilters()).slice().sort((a, b) => (ms(a.expiresAt) || 0) - (ms(b.expiresAt) || 0));
      return rows.map((p) => ({ id: p.id, columnId: p.status, render: () => permitCardContent(p) }));
    }

    function paintBoard() {
      stopRegion('board');
      const st = state();
      const gf = globalFilters();
      const all = sel.filteredPermits(st, gf);
      const counts = { all: all.length };
      PERMIT_TYPES.forEach((t) => { counts[t] = all.filter((p) => p.type === t).length; });
      typeChips.setCounts(counts);

      const items = boardItems();
      if (!board) {
        board = kanban({
          columns: PERMIT_STATUS.map((s) => ({ id: s, label: s, tone: COLUMN_TONE[s] || null })),
          items,
          onMove: (id, toColumnId) => movePermit(id, toColumnId),
        });
        boardHost.appendChild(board.el);
      } else {
        board.update(items);
      }
    }

    function movePermit(id, toStatus) {
      const p = findPermit(id);
      if (!p || !PERMIT_STATUS.includes(toStatus) || p.status === toStatus) return false;
      if (p.status === CLOSED) {
        toast(`التصريح ${p.code} مغلق ولا يمكن إعادة فتحه — أنشئ تصريحاً جديداً بدلاً من ذلك`, { tone: 'warning' });
        return false;
      }
      if (toStatus === ACTIVE && ms(p.expiresAt) <= Date.now()) {
        toast(`انتهت صلاحية ${p.code} — عدّل وقت الانتهاء قبل التفعيل`, { tone: 'warning' });
        return false;
      }
      store.updatePermit(id, { status: toStatus });
      const tone = toStatus === ACTIVE ? 'good' : toStatus === SUSPENDED ? 'serious' : toStatus === CLOSED ? 'neutral' : 'brand';
      const verb = toStatus === ACTIVE ? 'تم اعتماد وتفعيل' : toStatus === SUSPENDED ? 'تم تعليق' : toStatus === CLOSED ? 'تم إغلاق' : toStatus === PENDING ? 'أُرسل للاعتماد' : 'أُعيد إلى المسودة';
      toast(`${verb} التصريح ${p.code} — «${toStatus}»`, { tone });
      return true;
    }

    /* ── drawer ── */
    function openDrawer(id) {
      const first = findPermit(id);
      if (!first) { toast('تعذر العثور على التصريح المطلوب', { tone: 'warning' }); return; }
      if (activeDrawer) { activeDrawer.close(); activeDrawer = null; }

      const body = h('div', { class: 'stack' });
      const approveBtn = button('اعتماد', { variant: 'primary', icon: 'file-check', onClick: () => movePermit(id, ACTIVE) });
      const submitBtn = button('إرسال للاعتماد', { variant: 'outline', onClick: () => movePermit(id, PENDING) });
      const suspendBtn = button('تعليق', { variant: 'outline', onClick: () => movePermit(id, SUSPENDED) });
      const closeBtn = button('إغلاق التصريح', { variant: 'danger', onClick: () => movePermit(id, CLOSED) });
      let unsub = () => {};
      const api = drawer({
        title: first.code, subtitle: `${first.type} · ${siteName(state(), first.siteId)}`, size: 'lg', body,
        actions: [approveBtn, submitBtn, suspendBtn, closeBtn, { label: 'إغلاق', variant: 'ghost' }],
        onClose: () => { unsub(); stopRegion('drawer'); if (activeDrawer === api) activeDrawer = null; },
      });
      activeDrawer = api;

      const paint = () => {
        stopRegion('drawer');
        const p = findPermit(id);
        clear(body);
        if (!p) { body.appendChild(emptyState({ title: 'تم حذف هذا التصريح' })); [approveBtn, submitBtn, suspendBtn, closeBtn].forEach((b) => { b.hidden = true; }); return; }
        const st = state();
        const now = Date.now();
        const expired = ms(p.expiresAt) <= now;

        approveBtn.hidden = !(p.status === DRAFT || p.status === PENDING || p.status === SUSPENDED);
        approveBtn.querySelector('.btn-label').textContent = p.status === SUSPENDED ? 'استئناف التصريح' : 'اعتماد وتفعيل';
        submitBtn.hidden = p.status !== DRAFT;
        suspendBtn.hidden = p.status !== ACTIVE;
        closeBtn.hidden = p.status === CLOSED;

        const badges = h('div', { class: 'row wrap gap-2' }, badge(p.status, statusTone(p.status)), badge(p.type, 'neutral', { icon: typeIcon(p.type) }));
        if (p.status === ACTIVE && expired) badges.appendChild(badge('انتهت الصلاحية', 'critical'));
        else if (p.status === ACTIVE && ms(p.expiresAt) - now <= EXPIRING_MINUTES * 60_000) badges.appendChild(badge('يقترب من الانتهاء', 'warning'));

        const expiryCell = h('span', { class: 'row wrap gap-2' }, h('span', {}, fmt.dateTime(p.expiresAt)));
        if (p.status === ACTIVE) expiryCell.appendChild(liveCountdown('drawer', p.expiresAt).el);

        body.appendChild(section('بيانات التصريح', badges, kv([
          ['الموقع', siteName(st, p.siteId)],
          ['المكان', p.location],
          ['مقدّم الطلب', p.requester],
          ['المعتمِد', p.approver],
          ['يبدأ', fmt.dateTime(p.startsAt)],
          ['ينتهي', expiryCell],
          ['المدة', fmt.duration(Math.max(0, ms(p.expiresAt) - ms(p.startsAt)))],
          ['عدد العمال', fmt.num(Number(p.workers) || 0)],
          p.approvedAt ? ['تاريخ الاعتماد', fmt.dateTime(p.approvedAt)] : null,
          p.createdAt ? ['أُنشئ', fmt.relative(p.createdAt)] : null,
        ])));

        const gas = gasChips(p.gasTest);
        body.appendChild(section('فحص الغازات', gas || h('p', { class: 'note' }, 'لا يتطلب هذا التصريح فحص غازات، أو لم تُسجل قراءات بعد.')));

        const hazards = Array.isArray(p.hazards) ? p.hazards : [];
        body.appendChild(section(`المخاطر (${fmt.num(hazards.length)})`, hazards.length
          ? h('ul', { class: 'list-reset stack gap-2' }, hazards.map((t) => h('li', { class: 'controls-item tone-warning' }, h('span', { class: 'controls-type' }, 'خطر'), h('span', {}, t))))
          : h('p', { class: 'note' }, 'لم تُسجل مخاطر لهذا التصريح.')));

        const controls = Array.isArray(p.controls) ? p.controls : [];
        body.appendChild(section(`الضوابط والاحتياطات (${fmt.num(controls.length)})`, controls.length
          ? h('ol', { class: 'controls-list' }, controls.map((t, i) => h('li', { class: 'controls-item tone-good' }, h('span', { class: 'controls-type mono' }, fmt.num(i + 1)), h('span', {}, typeof t === 'string' ? t : (t && t.text) || '—'))))
          : h('p', { class: 'note' }, 'لم تُسجل ضوابط لهذا التصريح.')));
      };

      paint();
      unsub = bus.on('store:change', (p) => { if (touches(p && p.path, 'permits')) paint(); });
      api.open();
    }

    function section(title, ...children) {
      return h('section', { class: 'drawer-section' }, h('h3', { class: 'drawer-section-title' }, title), h('div', { class: 'stack gap-3' }, children));
    }

    /* ── new permit modal ── */
    function openNewPermitModal() {
      if (activeModal) { activeModal.close(); activeModal = null; }
      const st = state();
      const sites = (st.sites || []).map((s) => ({ value: s.id, label: `${s.name} (${s.code})` }));
      const gf = globalFilters();
      const defaultSite = gf.siteId && gf.siteId !== 'all' ? gf.siteId : (sites[0] ? sites[0].value : 'S1');
      const start = roundToQuarter(new Date());
      const end = new Date(start.getTime() + 8 * HOUR_MS);

      const form = h('form', { class: 'form-grid', 'aria-label': 'نموذج تصريح عمل جديد' });
      form.append(
        h('h3', { class: 'form-section-title' }, 'نوع التصريح ومكانه'),
        formField({ label: 'نوع التصريح', name: 'type', type: 'select', value: PERMIT_TYPES[0], options: PERMIT_TYPES, required: true }),
        formField({ label: 'الحالة الأولية', name: 'status', type: 'select', value: PENDING, options: [DRAFT, PENDING], hint: 'يُفعَّل التصريح من اللوحة بعد اعتماده' }),
        formField({ label: 'الموقع', name: 'siteId', type: 'select', value: defaultSite, options: sites, required: true }),
        formField({ label: 'المكان داخل الموقع', name: 'location', required: true, placeholder: 'مثال: المنطقة ج — المستوى 12' }),
        formField({ label: 'مقدّم الطلب', name: 'requester', required: true, placeholder: 'الاسم والصفة' }),
        formField({ label: 'المعتمِد', name: 'approver', required: true, placeholder: 'مهندس السلامة المسؤول' }),
        h('h3', { class: 'form-section-title' }, 'الفترة والطاقم'),
        formField({ label: 'بداية التصريح', name: 'startsAt', type: 'datetime-local', value: toDatetimeLocal(start), required: true }),
        formField({ label: 'انتهاء التصريح', name: 'expiresAt', type: 'datetime-local', value: toDatetimeLocal(end), required: true, hint: 'الحد الأقصى المعتاد 12 ساعة لكل وردية' }),
        formField({ label: 'عدد العمال', name: 'workers', type: 'number', value: 4, min: 1, max: 500, step: 1, required: true }),
        h('h3', { class: 'form-section-title' }, 'المخاطر والضوابط'),
        formField({ label: 'المخاطر المحددة', name: 'hazards', type: 'textarea', rows: 3, required: true, placeholder: 'خطر واحد في كل سطر', hint: 'سطر لكل خطر' }),
        formField({ label: 'الضوابط والاحتياطات', name: 'controls', type: 'textarea', rows: 3, required: true, placeholder: 'ضابط واحد في كل سطر', hint: 'سطر لكل ضابط' }),
        h('h3', { class: 'form-section-title' }, 'قراءات فحص الغازات (اختياري — للأماكن المغلقة والأعمال الساخنة)'),
        formField({ label: 'الأكسجين O₂ (%)', name: 'o2', type: 'number', min: 0, max: 100, step: 0.1, placeholder: '20.9' }),
        formField({ label: 'الغازات القابلة للاشتعال LEL (%)', name: 'lel', type: 'number', min: 0, max: 100, step: 1, placeholder: '0' }),
        formField({ label: 'كبريتيد الهيدروجين H₂S (ppm)', name: 'h2s', type: 'number', min: 0, max: 1000, step: 0.1, placeholder: '0' }),
        formField({ label: 'أول أكسيد الكربون CO (ppm)', name: 'co', type: 'number', min: 0, max: 5000, step: 1, placeholder: '0' }),
      );

      const submit = () => {
        if (!form.reportValidity()) return false;
        const data = readForm(form);
        const startsAt = fromDatetimeLocal(data.startsAt);
        const expiresAt = fromDatetimeLocal(data.expiresAt);
        if (!startsAt || !expiresAt) { toast('صيغة التاريخ غير صالحة', { tone: 'warning' }); return false; }
        if (ms(expiresAt) <= ms(startsAt)) { toast('يجب أن يكون وقت الانتهاء بعد وقت البداية', { tone: 'warning' }); return false; }
        const gasEntries = GAS.map((g) => [g.key, data[g.key]]).filter(([, v]) => v !== null && v !== undefined && v !== '' && Number.isFinite(Number(v)));
        const gasTest = gasEntries.length ? Object.fromEntries(gasEntries.map(([k, v]) => [k, Number(v)])) : null;
        const permit = store.addPermit({
          type: data.type, status: data.status, siteId: data.siteId, location: data.location, requester: data.requester, approver: data.approver,
          startsAt, expiresAt, workers: Number(data.workers) || 1, hazards: lines(data.hazards), controls: lines(data.controls), gasTest,
        });
        if (!permit) { toast('تعذر حفظ التصريح', { tone: 'critical' }); return false; }
        toast(`تم إنشاء التصريح ${permit.code} بحالة «${permit.status}»`, { tone: 'good', title: 'تم الحفظ', action: { label: 'عرض', onClick: () => openDrawer(permit.id) } });
        typeFilter = 'all';
        return true;
      };
      form.addEventListener('submit', (e) => { e.preventDefault(); if (submit()) api.close('action'); });

      const api = modal({
        title: 'تصريح عمل جديد', subtitle: 'يُسجَّل التصريح ويظهر في اللوحة فوراً', size: 'lg', body: form,
        actions: [{ label: 'إلغاء', variant: 'ghost' }, { label: 'حفظ التصريح', variant: 'primary', onClick: () => submit() }],
        onClose: () => { if (activeModal === api) activeModal = null; },
      });
      activeModal = api;
      api.open();
    }

    /* ── repaint orchestration ── */
    let pending = 0; // 1 strip, 2 board
    let raf = 0;
    const schedule = (mask) => {
      pending |= mask;
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        if (!alive) return;
        const m = pending; pending = 0;
        try {
          if (m & 1) paintStrip();
          if (m & 2) paintBoard();
        } catch (err) { console.error('[biltix-hse] permits: repaint failed', err); }
      });
    };

    paintStrip(); paintBoard();

    subs.push(bus.on('store:change', (p) => { const path = p && p.path; if (touches(path, 'permits') || touches(path, 'sites')) schedule(3); }));
    subs.push(bus.on('filters:change', () => schedule(3)));
    subs.push(bus.on('settings:change', () => schedule(3)));

    /* a minute-level refresh keeps the "expiring soon" strip honest even without store writes */
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
      if (activeDrawer) { try { activeDrawer.close(); } catch { /* ignore */ } activeDrawer = null; }
      if (activeModal) { try { activeModal.close(); } catch { /* ignore */ } activeModal = null; }
    };
  },
};

export default permitsView;
