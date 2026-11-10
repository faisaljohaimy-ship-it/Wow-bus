/**
 * Biltix Risk AI — view: التنبيهات والتصعيد (js/views/alerts.js) — AIR-03
 *
 * Alerting & workflow layer: one alert queue card with a segmented switch between the
 * immediate-escalation queue (critical) and the standard queue, compact rows (title inline,
 * meta below, actions trailing), six rows per queue by default with «عرض الكل», acknowledged
 * alerts hidden behind a toggle, acknowledge actions (store.ackAlert); the alert / critical
 * threshold sliders (store.setSettings → settings.platform) with a live preview of how many
 * open AI risks would alert; the notification channel toggles with a test alert through
 * sources.postWebhook when settings.alertWebhook is set; and the write-back log derived
 * from platform.auditLog (action 'writeback').
 *
 * Deep links: `?queue=immediate|standard` selects the queue and scrolls to it.
 * Live updates (C-4): alerts / aiRisks / settings rebuild the view; tasks / auditLog only
 * swap the write-back card; validation / pipelines / connectors telemetry is ignored.
 *
 * DOM structures follow css/platform.css (ul.alert-queue > li.alert-queue-item, .channel-chip,
 * .range-field, .threshold-preview); Part A chrome (.switch, .note, .kpi-row) is reused.
 *
 * Contract: docs/ARCHITECTURE.md §4, §7 (sources.postWebhook), B2 (thresholds), B3
 * (alerts, auditLog, tasks), B4 (psel.alertQueue, openAiRisks), B5 (ackAlert, settings
 * defaults), B9.4. Data reaches the DOM only through textContent / components.h.
 */

const STYLE_ID = 'view-alerts-style';
const STYLE_TEXT = `/* grid rows align to the top: unlayered so it wins over the stretch default in css/base.css */
.view-alerts .grid-12 { align-items: start; }
.alert-queue.is-compact .alert-queue-item { grid-template-columns: minmax(0, 1fr) auto; gap: 4px 12px; padding: 8px 12px; align-items: start; }
.alert-queue.is-compact .alert-queue-title-row { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 8px; min-inline-size: 0; }
.alert-queue.is-compact .alert-queue-title { overflow-wrap: break-word; }
.alert-queue.is-compact .alert-queue-meta { gap: 4px 10px; align-items: center; }
.alert-queue.is-compact .alert-queue-channels { grid-column: auto; display: inline-flex; gap: 4px; }
.alert-queue.is-compact .alert-queue-actions { flex-wrap: nowrap; white-space: nowrap; align-items: center; gap: 4px; }
@media (max-width: 599.98px) { .alert-queue.is-compact .alert-queue-item { grid-template-columns: minmax(0, 1fr); } .alert-queue.is-compact .alert-queue-actions { justify-content: flex-start; flex-wrap: wrap; white-space: normal; } }
@layer views {
  .threshold-block { display: grid; gap: 6px; }
  .threshold-block > label { font-size: var(--fs-sm); font-weight: 500; color: var(--ink-1); display: flex; align-items: center; gap: 8px; }
  .threshold-scale { display: flex; justify-content: space-between; font-family: var(--font-mono); font-size: 10px; color: var(--ink-3); }
  .threshold-previews { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; }
  .threshold-preview .preview-label { display: inline-flex; align-items: center; gap: 6px; min-inline-size: 0; }
  .threshold-preview .preview-hint { font-size: 10.5px; color: var(--ink-3); display: block; }
  .channel-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding-block: 10px; border-block-end: 1px solid var(--line); }
  .channel-row:last-child { border-block-end: 0; }
  .channel-row-text { display: flex; flex-direction: column; gap: 1px; min-inline-size: 0; }
  .queue-switch-row { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 8px 12px; }
  .ack-toggle { display: inline-flex; align-items: center; gap: 8px; font-size: var(--fs-xs); color: var(--ink-2); }
  .view-alerts .code { font-family: var(--font-mono); font-variant-numeric: tabular-nums; unicode-bidi: isolate; }
  @media (max-width: 720px) { .threshold-previews { grid-template-columns: minmax(0, 1fr); } }
}`;

const DEFAULT_ALERT = 60;
const DEFAULT_CRITICAL = 85;
const MIN_GAP = 5;
const CHANNELS = [
  { key: 'email', label: 'البريد الإلكتروني', icon: 'mail', hint: 'رسالة لكل تنبيه مع رابط التفاصيل' },
  { key: 'slack', label: 'Slack', icon: 'slack', hint: 'قناة #risk-alerts مع أزرار القبول' },
  { key: 'teams', label: 'Microsoft Teams', icon: 'teams', hint: 'بطاقة تكيفية في قناة إدارة المشروع' },
  { key: 'whatsapp', label: 'واتساب للأعمال', icon: 'whatsapp', hint: 'للتصعيد الفوري فقط — قالب معتمد' },
];
const CHANNEL_BY_KEY = Object.fromEntries(CHANNELS.map((c) => [c.key, c]));
const RATING_LABEL = { red: 'أحمر', yellow: 'أصفر', green: 'أخضر' };
const RATING_TONE = { red: 'critical', yellow: 'warning', green: 'good' };
const CLOSED_STATUSES = new Set(['مغلق', 'مُتجاوز']);
const WB_STATUS = { synced: { label: 'متزامن', tone: 'good' }, pending: { label: 'قيد المزامنة', tone: 'warning' }, failed: { label: 'فشل', tone: 'critical' } };
const QUEUE_DEFAULT = 6;
const QUEUES = { immediate: { code: 'ALR-01', title: 'التصعيد الفوري', tone: 'critical', emptyTitle: 'لا توجد تصعيدات فورية' }, standard: { code: 'ALR-02', title: 'التنبيهات القياسية', tone: 'warning', emptyTitle: 'قائمة التنبيهات القياسية فارغة' } };
const CODE_RE = /\b[A-Z]{1,5}-[A-Z0-9-]*\d[A-Z0-9-]*\b/g;

/** Free text (seed titles, descriptions, rule names) → the active numeral system; Latin alphanumeric tokens (2B, P6, PN10) keep their ASCII digits (RTL-4). */
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
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

function ensureStyle() {
  if (typeof document === 'undefined' || document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = STYLE_TEXT;
  document.head.appendChild(style);
}

export default {
  id: 'alerts',
  code: 'AIR-03',
  title: 'التنبيهات والتصعيد',
  icon: 'bell',

  render(container, ctx) {
    const { store, bus, fmt, charts, components, psel, sources, router } = ctx;
    const { h, card, statTile, badge, dataTable, button, toast, emptyState, svgIcon, glyph, liveDot, segmented } = components;

    ensureStyle();
    const root = h('section', { class: 'view view-alerts' });
    container.appendChild(root);

    let raf = 0;
    let restoreFocusId = null;
    let testing = false;
    const params = ctx.params || {};
    const ui = { writeback: null, queueCard: null };
    /** Local UI state (survives rebuilds inside one visit). */
    const local = {
      queue: params.queue === 'standard' ? 'standard' : (params.queue === 'immediate' ? 'immediate' : null),
      showAcked: false,
      expanded: { immediate: false, standard: false },
    };
    let scrollToQueue = !!params.queue;

    /* ───────────────────────── helpers ───────────────────────── */

    const mono = (text, extra = []) => h('span', { class: ['mono', 'num', ...arr(extra)] }, String(text ?? '—'));
    const codeSpan = (code, extra = null) => h('span', { class: ['code', 'mono', 'nowrap', extra], dir: 'ltr' }, String(code ?? ''));
    const latin = (label) => { const s = String(label ?? ''); return /^[\x20-\x7E]+$/.test(s) ? h('span', { lang: 'en', dir: 'ltr' }, s) : s; };
    function withCodes(str) {
      const s = String(str ?? ''); const out = []; let last = 0; let m;
      CODE_RE.lastIndex = 0;
      while ((m = CODE_RE.exec(s))) { if (m.index > last) out.push(digitsIn(fmt, s.slice(last, m.index))); out.push(codeSpan(m[0])); last = m.index + m[0].length; }
      if (last < s.length) out.push(digitsIn(fmt, s.slice(last)));
      return out.length ? out : [digitsIn(fmt, s)];
    }
    const now = () => (typeof store.now === 'function' ? store.now() : new Date());

    function makeChart(name, opts) {
      if (!charts || typeof charts[name] !== 'function') return null;
      try { const c = charts[name](opts); return c && c.el instanceof Node ? c : null; } catch (err) { console.warn(`[alerts] charts.${name} failed`, err); return null; }
    }
    function ratingOf(score) {
      const r = safe(() => psel.rating(score), null);
      if (r) return r;
      return score >= 70 ? 'red' : (score >= 40 ? 'yellow' : 'green');
    }
    function ratingBadge(score) {
      const r = ratingOf(num(score));
      const el = badge(safe(() => psel.ratingLabel(r), RATING_LABEL[r]) || RATING_LABEL[r], safe(() => psel.ratingTone(r), RATING_TONE[r]) || RATING_TONE[r]);
      el.classList.add('rating', 'is-sm', `is-${r}`);
      return el;
    }
    function channelChip(key) {
      const c = CHANNEL_BY_KEY[key] || { label: String(key), icon: 'bell' };
      return h('span', { class: 'channel-chip', title: c.label }, svgIcon(c.icon, 11), h('span', {}, latin(c.label)));
    }
    function switchBtn({ id, on, label, onToggle }) {
      return h('button', { type: 'button', id, role: 'switch', class: ['switch', on ? 'is-on' : null], 'aria-checked': on ? 'true' : 'false', 'aria-label': label, title: label, onClick: () => onToggle(!on) });
    }
    function projectName(state, id) { const s = arr(state.sites).find((x) => x.id === id); return digitsIn(fmt, s ? s.name : (id || '—')); }
    const scoreAtLeast = (n) => `الدرجة ${fmt.num(n)} فأكثر`;

    /* ───────────────────────── store bridges ───────────────────────── */

    function ack(alert) {
      const by = 'مدير المشروع';
      if (typeof store.ackAlert === 'function') store.ackAlert(alert.id, by);
      else store.update((s) => { const a = arr(s.platform && s.platform.alerts).find((x) => x.id === alert.id); if (a) { a.acknowledged = true; a.ackBy = by; a.ackAt = now().toISOString(); } return `platform.alerts.${alert.id}`; });
    }
    function saveThresholds(alertThreshold, criticalThreshold) {
      store.setSettings({ platform: { alertThreshold, criticalThreshold } });
    }
    function saveChannel(key, on) {
      store.setSettings({ platform: { channels: { [key]: on } } });
    }

    /* ───────────────────────── data ───────────────────────── */

    function collect() {
      const state = store.state;
      const plat = safe(() => psel.platform(state), null) || state.platform || {};
      const filters = store.filters || { siteId: 'all', range: 30, search: '' };
      const siteId = filters.siteId || 'all';
      const range = num(filters.range, 30);
      const since = now().getTime() - range * 86_400_000;
      const settings = (state.settings && state.settings.platform) || {};
      const alertThreshold = clamp(num(settings.alertThreshold, DEFAULT_ALERT), 10, 95);
      const criticalThreshold = clamp(num(settings.criticalThreshold, DEFAULT_CRITICAL), alertThreshold + MIN_GAP, 100);
      const channels = { email: true, slack: true, teams: false, whatsapp: false, ...(settings.channels || {}) };
      const webhook = typeof state.settings.alertWebhook === 'string' ? state.settings.alertWebhook.trim() : '';

      const risksById = new Map(arr(plat.aiRisks).map((r) => [r.id, r]));
      let queue = safe(() => psel.alertQueue(state), null);
      if (!queue || !Array.isArray(queue.immediate)) {
        const all = arr(plat.alerts).slice().sort((a, b) => Number(a.acknowledged) - Number(b.acknowledged) || (Date.parse(b.sentAt) || 0) - (Date.parse(a.sentAt) || 0));
        queue = { immediate: all.filter((a) => a.queue === 'immediate'), standard: all.filter((a) => a.queue !== 'immediate') };
      }
      const visible = (a) => (siteId === 'all' || a.projectId === siteId) && (!a.acknowledged || (Date.parse(a.sentAt) || 0) >= since);
      const decorate = (a) => ({ ...a, risk: risksById.get(a.riskId) || null });
      const immediate = arr(queue.immediate).filter(visible).map(decorate);
      const standard = arr(queue.standard).filter(visible).map(decorate);
      const pending = immediate.concat(standard).filter((a) => !a.acknowledged);
      const last24 = arr(plat.alerts).filter((a) => (siteId === 'all' || a.projectId === siteId) && (Date.parse(a.sentAt) || 0) >= now().getTime() - 86_400_000).length;
      const ackDurations = arr(plat.alerts).filter((a) => a.acknowledged && a.ackAt && a.sentAt).map((a) => (Date.parse(a.ackAt) || 0) - (Date.parse(a.sentAt) || 0)).filter((d) => d > 0);
      const meanAckMs = ackDurations.length ? ackDurations.reduce((a, b) => a + b, 0) / ackDurations.length : null;

      let openRisks = safe(() => psel.openAiRisks(state, filters), null);
      if (!Array.isArray(openRisks)) openRisks = arr(plat.aiRisks).filter((r) => !CLOSED_STATUSES.has(r.status) && (siteId === 'all' || r.projectId === siteId));
      const scores = openRisks.map((r) => num(r.score));

      const tasks = arr(plat.tasks).filter((t) => siteId === 'all' || t.projectId === siteId);
      const wbCounts = tasks.reduce((acc, t) => { const s = t.writeback && t.writeback.status; if (s) acc[s] = (acc[s] || 0) + 1; return acc; }, {});
      const writebackLog = arr(plat.auditLog).filter((e) => e.action === 'writeback' && (Date.parse(e.at) || 0) >= since).sort((a, b) => (Date.parse(b.at) || 0) - (Date.parse(a.at) || 0));

      return { state, plat, siteId, range, alertThreshold, criticalThreshold, channels, webhook, immediate, standard, pending, last24, meanAckMs, openRisks, scores, tasks, wbCounts, writebackLog };
    }

    function previewCounts(scores, alertT, criticalT) {
      const immediate = scores.filter((s) => s >= criticalT).length;
      const standard = scores.filter((s) => s > alertT && s < criticalT).length;
      return { immediate, standard, register: scores.length - immediate - standard };
    }

    /* ───────────────────────── sections ───────────────────────── */

    function buildHead(data) {
      const pendingImmediate = data.immediate.filter((a) => !a.acknowledged);
      const actions = [];
      if (pendingImmediate.length) {
        actions.push(button(`تأكيد كل التصعيدات (${fmt.num(pendingImmediate.length)})`, { variant: 'outline', size: 'sm', icon: glyph('good', 14), onClick: () => { pendingImmediate.forEach(ack); toast(`تم تأكيد ${fmt.num(pendingImmediate.length)} تصعيداً فورياً`, { tone: 'good' }); } }));
      }
      actions.push(button('سجل المخاطر الذكي', { variant: 'ghost', size: 'sm', icon: 'shield-alert', onClick: () => router.navigate('airisks', { rating: 'red' }) }));
      return h('div', { class: 'view-head' },
        h('div', { class: 'view-head-text' },
          h('span', { class: 'code-tag' }, 'AIR-03'),
          h('h1', { tabindex: '-1' }, 'التنبيهات والتصعيد'),
          h('p', { class: 'view-lead' }, `ما يتجاوز عتبة التنبيه (${fmt.num(data.alertThreshold)}) يدخل قائمة التنبيهات القياسية، وما يبلغ عتبة الحرج (${fmt.num(data.criticalThreshold)}) يُصعَّد فوراً عبر القنوات المفعّلة ويُكتب عكسياً إلى تطبيق إدارة المشاريع.`),
        ),
        h('div', { class: 'view-actions' }, ...actions),
      );
    }

    function buildKpis(data) {
      const pendingImmediate = data.immediate.filter((a) => !a.acknowledged).length;
      return h('div', { class: 'kpi-row' },
        statTile({ label: 'تنبيهات غير مؤكدة', value: data.pending.length, icon: 'bell', tone: data.pending.length ? 'warning' : 'good', hint: 'تنتظر التأكيد من المالك' }),
        statTile({ label: 'تصعيد فوري معلّق', value: pendingImmediate, icon: 'alert', tone: pendingImmediate ? 'critical' : 'good', hint: scoreAtLeast(data.criticalThreshold) }),
        statTile({ label: `تنبيهات آخر ${fmt.num(24)} ساعة`, value: data.last24, icon: 'clock', hint: data.siteId === 'all' ? 'كل المشاريع' : projectName(data.state, data.siteId) }),
        statTile({ label: 'متوسط زمن التأكيد', value: data.meanAckMs ? fmt.duration(data.meanAckMs) : '—', icon: 'badge-check', tone: data.meanAckMs ? (data.meanAckMs <= 2 * 3_600_000 ? 'good' : (data.meanAckMs <= 8 * 3_600_000 ? 'warning' : 'serious')) : null, hint: 'من الإرسال حتى التأكيد' }),
      );
    }

    /** Compact row: li.alert-queue-item > .alert-queue-main(title row inline · meta below) + .alert-queue-actions (one line, trailing). */
    function alertItem(data, a, severityTone) {
      const risk = a.risk;
      const title = a.title || (risk && risk.title) || 'تنبيه';
      const main = h('div', { class: 'alert-queue-main' },
        h('div', { class: 'alert-queue-title-row' },
          badge(a.severity === 'critical' ? 'حرج' : 'قياسي', severityTone),
          h('span', { class: 'alert-queue-title' }, ...withCodes(title)),
          risk ? ratingBadge(risk.score) : null,
          risk ? h('span', { class: 'text-xs muted nowrap' }, 'الدرجة ', h('span', { class: 'mono num' }, fmt.num(num(risk.score)))) : null,
        ),
        h('div', { class: 'alert-queue-meta' },
          risk ? codeSpan(risk.code, 'text-xs') : null,
          h('span', {}, projectName(data.state, a.projectId)),
          h('span', { title: fmt.dateTime(a.sentAt) }, `أُرسل ${fmt.relative(a.sentAt)}`),
          arr(a.channels).length ? h('span', { class: 'alert-queue-channels', role: 'group', 'aria-label': 'القنوات' }, ...arr(a.channels).map(channelChip)) : null,
          a.acknowledged ? h('span', { class: 'row gap-1' }, glyph('good', 12), h('span', {}, `أكده ${a.ackBy || '—'}${a.ackAt ? ` ${fmt.relative(a.ackAt)}` : ''}`)) : null,
        ),
      );
      const actions = h('div', { class: 'alert-queue-actions' });
      if (!a.acknowledged) actions.appendChild(button('تأكيد الاستلام', { variant: severityTone === 'critical' ? 'primary' : 'outline', size: 'sm', icon: glyph('good', 14), onClick: () => { ack(a); toast(`تم تأكيد استلام التنبيه${risk ? ` ${risk.code}` : ''}`, { tone: 'good' }); } }));
      if (risk) actions.appendChild(button('التفاصيل', { variant: 'ghost', size: 'sm', icon: 'file-text', onClick: () => router.navigate('airisks', { risk: risk.id }) }));
      return h('li', { class: 'alert-queue-item', 'data-severity': a.severity === 'critical' ? 'critical' : 'routine', 'data-acked': a.acknowledged ? 'true' : 'false', 'data-id': String(a.id) }, main, actions);
    }

    /** One card, two queues: segmented switch فوري / قياسي, acknowledged hidden by default, six rows + «عرض الكل». */
    function buildQueueCard(data) {
      const pendingOf = (key) => data[key].filter((a) => !a.acknowledged).length;
      if (!local.queue) local.queue = pendingOf('immediate') || !pendingOf('standard') ? 'immediate' : 'standard';
      const key = local.queue;
      const meta = QUEUES[key];
      const all = data[key];
      const shownPool = local.showAcked ? all : all.filter((a) => !a.acknowledged);
      const limit = local.expanded[key] ? shownPool.length : QUEUE_DEFAULT;
      const items = shownPool.slice(0, limit);
      const ackedCount = all.length - all.filter((a) => !a.acknowledged).length;

      const seg = segmented({
        options: [
          { value: 'immediate', label: `فوري (${fmt.num(pendingOf('immediate'))})` },
          { value: 'standard', label: `قياسي (${fmt.num(pendingOf('standard'))})` },
        ],
        value: key, ariaLabel: 'اختيار قائمة التنبيهات',
        onChange: (v) => { if (v && v !== local.queue) { local.queue = v; schedule(); } },
      });
      const ackToggle = h('label', { class: 'ack-toggle', for: 'alerts-show-acked' },
        switchBtn({ id: 'alerts-show-acked', on: local.showAcked, label: local.showAcked ? 'إخفاء التنبيهات المؤكدة' : 'إظهار التنبيهات المؤكدة', onToggle: (next) => { local.showAcked = next; restoreFocusId = 'alerts-show-acked'; schedule(); } }),
        h('span', {}, `إظهار المؤكدة (${fmt.num(ackedCount)})`));
      const switchRow = h('div', { class: 'queue-switch-row' }, seg.el, ackToggle);

      const list = items.length
        ? h('ul', { class: 'alert-queue is-compact', id: `alerts-${key}`, 'aria-label': meta.title }, ...items.map((a) => alertItem(data, a, meta.tone)))
        : emptyState({ icon: glyph('good', 32), title: shownPool.length ? meta.emptyTitle : (all.length && !local.showAcked ? 'كل التنبيهات في هذه القائمة مؤكدة' : meta.emptyTitle), text: all.length && !local.showAcked && ackedCount ? 'فعّل «إظهار المؤكدة» لمراجعة التنبيهات المؤكدة ضمن النطاق الزمني.' : 'لا توجد تنبيهات بحاجة إلى إجراء في هذا النطاق.' });
      const more = shownPool.length > QUEUE_DEFAULT
        ? h('div', { class: 'row', style: { justifyContent: 'center' } }, button(local.expanded[key] ? 'عرض أقل' : `عرض الكل (${fmt.num(shownPool.length)})`, { variant: 'ghost', size: 'sm', icon: local.expanded[key] ? 'chevron-up' : 'chevron-down', onClick: () => { local.expanded[key] = !local.expanded[key]; restoreFocusId = 'alerts-queue-more'; schedule(); }, attrs: { id: 'alerts-queue-more' } }))
        : null;

      const pending = pendingOf(key);
      const subtitle = key === 'immediate' ? `حرج — ${scoreAtLeast(data.criticalThreshold)}؛ أُرسل عبر كل القنوات المفعّلة` : `الدرجة أكبر من ${fmt.num(data.alertThreshold)} — مهمة معالجة مُسندة مع مهلة`;
      const el = card({
        id: 'alerts-queue', code: meta.code, title: `قائمة التنبيهات — ${meta.title}`, subtitle,
        actions: [badge(pending ? `${fmt.num(pending)} بانتظار التأكيد` : 'لا شيء معلّق', pending ? meta.tone : 'good'), pending ? liveDot(meta.tone) : null],
        body: h('div', { class: 'stack gap-3' }, switchRow, list, more),
        footer: h('p', { class: 'text-xs muted' }, local.showAcked ? `تُعرض التنبيهات المؤكدة خلال آخر ${fmt.num(data.range)} يوماً مع المعلّقة.` : `تُعرض التنبيهات المعلّقة فقط — ${fmt.num(items.length)} من ${fmt.num(shownPool.length)}.`),
      });
      ui.queueCard = el;
      return el;
    }

    function buildThresholdsCard(data) {
      let alertT = data.alertThreshold;
      let criticalT = data.criticalThreshold;
      const counts = () => previewCounts(data.scores, alertT, criticalT);

      const previewValues = { immediate: h('span', { class: 'mono num' }), standard: h('span', { class: 'mono num' }), register: h('span', { class: 'mono num' }) };
      const previewHints = { immediate: h('span', { class: 'preview-hint' }), standard: h('span', { class: 'preview-hint' }), register: h('span', { class: 'preview-hint' }) };
      const segHost = h('div', { class: 'stack gap-1' });
      let segChart = null;

      const alertOut = h('output', { for: 'thr-alert', id: 'thr-alert-out', class: 'num' });
      const criticalOut = h('output', { for: 'thr-critical', id: 'thr-critical-out', class: 'num' });
      const alertInput = h('input', { type: 'range', id: 'thr-alert', min: '10', max: '95', step: '1', 'aria-describedby': 'thr-alert-hint', style: { accentColor: 'var(--warning)' } });
      const criticalInput = h('input', { type: 'range', id: 'thr-critical', min: '15', max: '100', step: '1', 'aria-describedby': 'thr-critical-hint', style: { accentColor: 'var(--critical)' } });
      alertInput.value = String(alertT); criticalInput.value = String(criticalT);

      function paint() {
        alertOut.textContent = fmt.num(alertT); criticalOut.textContent = fmt.num(criticalT);
        alertInput.setAttribute('aria-valuetext', `${fmt.num(alertT)} من ${fmt.num(100)}`); criticalInput.setAttribute('aria-valuetext', `${fmt.num(criticalT)} من ${fmt.num(100)}`);
        const c = counts();
        previewValues.immediate.textContent = fmt.num(c.immediate); previewValues.standard.textContent = fmt.num(c.standard); previewValues.register.textContent = fmt.num(c.register);
        previewHints.immediate.textContent = scoreAtLeast(criticalT); previewHints.standard.textContent = `الدرجة بين ${fmt.num(alertT)} و${fmt.num(criticalT)}`; previewHints.register.textContent = `الدرجة ${fmt.num(alertT)} فأقل`;
        const parts = [{ id: 'immediate', label: 'تصعيد فوري', value: c.immediate, color: 'var(--critical)' }, { id: 'standard', label: 'تنبيه قياسي', value: c.standard, color: 'var(--warning)' }, { id: 'register', label: 'سجل فقط', value: c.register, color: 'var(--good)' }].filter((p) => p.value > 0);
        if (segChart && typeof segChart.update === 'function') { try { segChart.update({ parts }); return; } catch { /* rebuild below */ } }
        segHost.replaceChildren();
        segChart = parts.length ? makeChart('segmentedBar', { parts, tall: false, valueFormat: (v) => fmt.num(v), ariaLabel: 'توزيع المخاطر المفتوحة على قوائم التنبيه' }) : null;
        if (segChart) segHost.appendChild(segChart.el);
      }
      alertInput.addEventListener('input', () => { alertT = clamp(num(alertInput.value, alertT), 10, 95); if (criticalT < alertT + MIN_GAP) { criticalT = clamp(alertT + MIN_GAP, 15, 100); criticalInput.value = String(criticalT); } paint(); });
      criticalInput.addEventListener('input', () => { criticalT = clamp(num(criticalInput.value, criticalT), 15, 100); if (criticalT < alertT + MIN_GAP) { criticalT = clamp(alertT + MIN_GAP, 15, 100); criticalInput.value = String(criticalT); } paint(); });
      const commit = (e) => { restoreFocusId = e && e.target ? e.target.id : null; saveThresholds(alertT, criticalT); toast(`تم حفظ العتبات: تنبيه أكبر من ${fmt.num(alertT)} · تصعيد من ${fmt.num(criticalT)} فأكثر`, { tone: 'good' }); };
      alertInput.addEventListener('change', commit); criticalInput.addEventListener('change', commit);
      paint();

      const scale = () => h('div', { class: 'threshold-scale', 'aria-hidden': 'true' }, h('span', {}, fmt.num(0)), h('span', {}, fmt.num(40)), h('span', {}, fmt.num(70)), h('span', {}, fmt.num(100)));
      const previewRow = (tone, label, valueEl, hintEl) => h('div', { class: ['threshold-preview', `tone-${tone}`] }, h('span', { class: 'preview-label' }, glyph(tone, 13), h('span', {}, h('span', {}, label), hintEl)), valueEl);

      const body = h('div', { class: 'stack gap-4' },
        h('div', { class: 'threshold-block' },
          h('label', { for: 'thr-alert' }, glyph('warning', 14), h('span', {}, 'عتبة التنبيه')),
          h('div', { class: 'range-field' }, alertInput, alertOut),
          scale(),
          h('span', { class: 'text-xs muted', id: 'thr-alert-hint' }, 'الدرجة التي تتجاوزها تنشئ تنبيهاً قياسياً وتُسند مهمة معالجة'),
        ),
        h('div', { class: 'threshold-block' },
          h('label', { for: 'thr-critical' }, glyph('critical', 14), h('span', {}, 'عتبة التصعيد الفوري')),
          h('div', { class: 'range-field' }, criticalInput, criticalOut),
          scale(),
          h('span', { class: 'text-xs muted', id: 'thr-critical-hint' }, `الدرجة التي تبلغها تُصعَّد فوراً عبر القنوات المفعّلة (أعلى من عتبة التنبيه بـ${fmt.num(MIN_GAP)} درجات على الأقل)`),
        ),
        h('div', { class: 'stack gap-2' },
          h('span', { class: 'text-sm semibold' }, `معاينة حية على ${fmt.num(data.openRisks.length)} مخاطرة مفتوحة`),
          h('div', { class: 'threshold-previews', role: 'group', 'aria-label': 'معاينة أثر العتبات' },
            previewRow('critical', 'تصعيد فوري', previewValues.immediate, previewHints.immediate),
            previewRow('warning', 'تنبيه قياسي', previewValues.standard, previewHints.standard),
            previewRow('good', 'سجل فقط', previewValues.register, previewHints.register),
          ),
          segHost,
        ),
      );
      const isDefault = data.alertThreshold === DEFAULT_ALERT && data.criticalThreshold === DEFAULT_CRITICAL;
      return card({
        code: 'ALR-03', title: 'عتبات التنبيه والتصعيد', subtitle: `تُطبَّق على الدرجة من ${fmt.num(0)} إلى ${fmt.num(100)} لكل مخاطرة جديدة أو مُحدَّثة`,
        className: 'col-span-6',
        actions: [button('استعادة الافتراضي', { variant: 'ghost', size: 'sm', icon: 'refresh', onClick: () => { saveThresholds(DEFAULT_ALERT, DEFAULT_CRITICAL); toast(`تمت استعادة العتبات الافتراضية (${fmt.num(DEFAULT_ALERT)} / ${fmt.num(DEFAULT_CRITICAL)})`, { tone: 'neutral' }); }, attrs: { disabled: isDefault } })],
        body,
        footer: h('p', { class: 'text-xs muted' }, `التقييم اللوني ثابت (أحمر من ${fmt.num(70)} فأكثر، أصفر من ${fmt.num(40)} إلى ${fmt.num(69)}، أخضر أقل من ${fmt.num(40)})؛ العتبات تحدد فقط ما يُنبَّه عليه ويُصعَّد.`),
      });
    }

    function buildChannelsCard(data) {
      const rows = CHANNELS.map((c) => h('div', { class: 'channel-row' },
        h('div', { class: 'row gap-3' },
          h('span', { class: 'tile-icon', 'aria-hidden': 'true', style: { color: data.channels[c.key] ? 'var(--brand)' : 'var(--ink-3)' } }, svgIcon(c.icon, 18)),
          h('div', { class: 'channel-row-text' }, h('span', { class: 'text-sm semibold' }, latin(c.label)), h('span', { class: 'text-xs muted' }, c.hint)),
        ),
        h('div', { class: 'row gap-2' },
          h('span', { class: 'text-xs muted' }, data.channels[c.key] ? 'مفعّلة' : 'معطّلة'),
          switchBtn({ id: `ch-${c.key}`, on: !!data.channels[c.key], label: `${data.channels[c.key] ? 'تعطيل' : 'تفعيل'} قناة ${c.label}`, onToggle: (next) => { restoreFocusId = `ch-${c.key}`; saveChannel(c.key, next); toast(next ? `تم تفعيل قناة ${c.label}` : `تم تعطيل قناة ${c.label}`, { tone: next ? 'good' : 'neutral' }); } }),
        ),
      ));
      const enabled = CHANNELS.filter((c) => data.channels[c.key]);

      let webhookBlock;
      if (data.webhook) {
        const testBtn = button(testing ? 'جارٍ الإرسال…' : 'إرسال تنبيه تجريبي', { variant: 'primary', size: 'sm', icon: 'bell', attrs: { disabled: testing || !enabled.length, 'aria-busy': testing ? 'true' : undefined }, onClick: async () => {
          if (testing) return;
          if (!sources || typeof sources.postWebhook !== 'function') { toast('وحدة المصادر غير متاحة حالياً', { tone: 'warning' }); return; }
          testing = true; testBtn.disabled = true; testBtn.setAttribute('aria-busy', 'true');
          const payload = { type: 'test', source: 'Biltix Risk AI', title: 'تنبيه تجريبي من منصة بلتكس لإدارة المخاطر', severity: 'routine', queue: 'standard', channels: enabled.map((c) => c.key), thresholds: { alert: data.alertThreshold, critical: data.criticalThreshold }, sentAt: now().toISOString() };
          try {
            const res = await sources.postWebhook(data.webhook, payload);
            if (res && res.ok) toast(res.message || `وصل التنبيه التجريبي إلى Webhook (HTTP ${fmt.num(num(res.status, 200))})`, { tone: 'good' });
            else toast(res && res.message ? String(res.message) : 'تعذر إرسال التنبيه التجريبي', { tone: 'warning' });
          } catch (err) { toast('تعذر الوصول إلى عنوان Webhook — تحقق من العنوان والشبكة', { tone: 'critical' }); console.warn('[alerts] test webhook failed', err); }
          finally { testing = false; schedule(); }
        } });
        webhookBlock = h('div', { class: 'stack gap-2' },
          h('div', { class: 'row between wrap' }, h('span', { class: 'text-sm semibold' }, latin('Webhook'), ' التنبيهات'), badge('مضبوط', 'good')),
          h('span', { class: 'mono text-xs ltr truncate', dir: 'ltr', lang: 'en', title: data.webhook, style: { display: 'block', color: 'var(--ink-2)' } }, data.webhook),
          h('div', { class: 'row wrap gap-2' }, testBtn, button('تعديل العنوان', { variant: 'ghost', size: 'sm', icon: 'sliders', onClick: () => router.navigate('integrations', { section: 'datasource' }) })),
          !enabled.length ? h('span', { class: 'text-xs muted' }, 'فعّل قناة واحدة على الأقل لإرسال اختبار.') : null,
        );
      } else {
        webhookBlock = h('div', { class: 'note', style: { '--tone': 'var(--warning)' } }, h('strong', {}, 'لم يُضبط عنوان ', latin('Webhook'), '. '), 'اضبط عنوان التنبيهات (n8n / Zapier / نظام داخلي) من صفحة التكاملات لتفعيل الإرسال التجريبي والتصعيد الخارجي. ', button('فتح التكاملات', { variant: 'ghost', size: 'sm', icon: 'link', onClick: () => router.navigate('integrations', { section: 'datasource' }) }));
      }

      return card({
        code: 'ALR-04', title: 'قنوات الإشعار', subtitle: 'القنوات التي يُرسل عبرها التصعيد الفوري والتنبيهات القياسية',
        className: 'col-span-6',
        actions: [badge(`${fmt.num(enabled.length)} / ${fmt.num(CHANNELS.length)} مفعّلة`, enabled.length ? 'brand' : 'warning')],
        body: h('div', { class: 'stack gap-4' }, h('div', { class: 'stack', style: { gap: '0' } }, ...rows), webhookBlock),
      });
    }

    /** Status of a write-back audit entry: the linked task's writeback state (target like "MT-0224 → Biltix PM"), else inferred from the wording. */
    function writebackStatusOf(data, e) {
      const target = String(e.target || '');
      const task = data.tasks.find((x) => (x.code && target.includes(x.code)) || (x.id && target === x.id));
      if (task && task.writeback && WB_STATUS[task.writeback.status]) return task.writeback.status;
      const text = `${target} ${e.detail || ''}`;
      if (/فشل|تعذر|خطأ|انتهاء مهلة/.test(text)) return 'failed';
      if (/قيد|سيعاد|بانتظار/.test(text)) return 'pending';
      if (/تمت|نجاح|مزامن|محدَّث|تحديث/.test(text)) return 'synced';
      return null;
    }

    function writebackChip(status) {
      const s = WB_STATUS[status] || { label: 'مُسجَّل', tone: 'brand' };
      return h('span', { class: 'writeback-chip', 'data-status': WB_STATUS[status] ? status : undefined }, glyph(s.tone, 11), h('span', {}, s.label));
    }

    function buildWritebackCard(data) {
      const chips = Object.entries(WB_STATUS).map(([k, s]) => badge(`${s.label}: ${fmt.num(num(data.wbCounts[k]))}`, data.wbCounts[k] ? s.tone : 'neutral'));
      const table = dataTable({
        dense: true, pageSize: 8, stickyFirst: true, emptyText: `لا توجد عمليات كتابة عكسية خلال آخر ${fmt.num(data.range)} يوماً`, caption: 'سجل الكتابة العكسية إلى Biltix PM',
        columns: [
          { key: 'at', label: 'الوقت', priority: 'high', render: (e) => h('span', { class: 'text-xs nowrap', title: fmt.dateTime(e.at) }, fmt.dateTime(e.at)), sortValue: (e) => Date.parse(e.at) || 0 },
          { key: 'actor', label: 'المنفّذ', priority: 'low', render: (e) => e.actor || 'النظام' },
          { key: 'target', label: 'الهدف', priority: 'high', render: (e) => h('span', { class: 'row gap-1 wrap' }, ...withCodes(e.target || '—')) },
          { key: 'detail', label: 'التفاصيل', priority: 'medium', sortable: false, render: (e) => h('span', { class: 'text-sm' }, ...withCodes(e.detail || '—')) },
          { key: 'status', label: 'الحالة', priority: 'high', sortable: false, render: (e) => writebackChip(writebackStatusOf(data, e)) },
        ],
        rows: data.writebackLog.map((e, i) => ({ id: e.id || `wb-${i}`, ...e })), initialSort: { key: 'at', dir: 'desc' },
      });
      const el = card({
        code: 'ALR-05', title: 'سجل الكتابة العكسية', subtitle: 'أعلام المخاطر والدرجات ومهام المعالجة المكتوبة إلى تطبيق إدارة المشاريع',
        body: h('div', { class: 'stack gap-3' }, h('div', { class: 'row wrap gap-2', role: 'group', 'aria-label': 'حالة مزامنة المهام' }, h('span', { class: 'text-xs muted' }, 'مهام المعالجة:'), ...chips), table.el),
        footer: h('div', { class: 'row between wrap' }, h('span', { class: 'text-xs muted' }, 'المنصة لا تكتب في أنظمة العميل سوى أعلام المخاطر والدرجات والتنبيهات ومهام المعالجة.'), button('مهام المعالجة', { variant: 'ghost', size: 'sm', icon: 'file-check', onClick: () => router.navigate('tasks') })),
      });
      ui.writeback = el;
      return el;
    }

    /* ───────────────────────── build ───────────────────────── */

    function build() {
      raf = 0;
      const data = collect();
      const frag = document.createDocumentFragment();
      frag.append(
        buildHead(data),
        buildKpis(data),
        buildQueueCard(data),
        h('div', { class: 'grid-12' }, buildThresholdsCard(data), buildChannelsCard(data)),
        buildWritebackCard(data),
      );
      root.replaceChildren(frag);
      if (restoreFocusId) {
        const el = root.querySelector(`#${CSS.escape(restoreFocusId)}`);
        restoreFocusId = null;
        if (el) { try { el.focus({ preventScroll: true }); } catch { /* ignore */ } }
      }
      if (scrollToQueue) {
        scrollToQueue = false;
        requestAnimationFrame(() => {
          if (ui.queueCard && ui.queueCard.isConnected) ui.queueCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
          try { if (/^#\/alerts\?/.test(location.hash || '')) history.replaceState(null, '', '#/alerts'); } catch { /* ignore */ }
        });
      }
    }

    /** Tasks / audit changes only affect the write-back card — swap it instead of rebuilding the page. */
    function refreshWriteback() {
      if (raf) return;
      if (!ui.writeback || !ui.writeback.isConnected) { schedule(); return; }
      const next = buildWritebackCard(collect());
      ui.writeback.replaceWith(next);
    }

    function schedule() {
      if (raf) return;
      raf = requestAnimationFrame(build);
    }

    const unsubs = [
      bus.on('store:change', (payload) => {
        const path = payload && payload.path ? String(payload.path) : '*';
        if (path === '*') { schedule(); return; }
        if (/^settings/.test(path)) return; // settings:change handles it (keeps slider focus)
        if (!/^(platform|sites)/.test(path)) return; // Part A collections and the live feed never change this view
        if (/^platform\.(validation|pipelines|connectors)/.test(path)) return; // telemetry not displayed here
        if (/^platform\.(tasks|auditLog)/.test(path)) { refreshWriteback(); return; }
        schedule(); // alerts, aiRisks, sites
      }),
      bus.on('filters:change', (payload) => { const key = payload && payload.key; if (!key || key === 'siteId' || key === 'range') schedule(); }),
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
