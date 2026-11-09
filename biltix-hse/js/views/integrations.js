/**
 * Biltix HSE — view: التكاملات والأنظمة (js/views/integrations.js) — SEC-09
 *
 * Summary strip, category filter chips, connector cards (status stripe, live dot,
 * relative last-sync, latency, rolling events-per-hour sparkline, إعداد / مزامنة الآن),
 * and the data-source panel (simulation / JSON API / Google Sheets CSV / Supabase)
 * with connection test, risk import, CSV template download and the alert webhook.
 *
 * Live updates: `integrations:tick` and `store:change` on `integrations.*` patch the
 * cards in place (no full re-render), a 30 s timer refreshes relative times. Rolling
 * eventsPerHour history is kept per connector id at module scope so it survives
 * navigation. Data reaches the DOM only via textContent / components.h.
 */

const HISTORY_CAP = 24;
const RELATIVE_REFRESH_MS = 30_000;
const SIMULATED_TEST_MIN_MS = 600;
const SIMULATED_TEST_MAX_MS = 900;

const STATUS_META = {
  connected:    { label: 'متصل',         tone: 'good',     rank: 0 },
  degraded:     { label: 'أداء متدهور',  tone: 'warning',  rank: 1 },
  disconnected: { label: 'غير متصل',     tone: 'critical', rank: 2 },
  configurable: { label: 'قابل للإعداد', tone: 'neutral',  rank: 3 },
};
const CATEGORY_LABEL = {
  core: 'الأنظمة الأساسية', sensors: 'الحساسات والرؤية', people: 'الأفراد والحضور',
  external: 'جهات خارجية', alerts: 'قنوات التنبيه', data: 'البيانات والتحليلات',
};
const SOURCE_TYPES = [
  { value: 'simulation', label: 'محاكاة حية' },
  { value: 'json', label: 'JSON API' },
  { value: 'sheets', label: 'Google Sheets CSV' },
  { value: 'supabase', label: 'Supabase' },
];
const SOURCE_HINT = {
  simulation: 'يعمل المركز حالياً على محرك المحاكاة الحية المدمج: بيانات واقعية متجددة دون الحاجة إلى أي اتصال خارجي.',
  json: 'نقطة نهاية تعيد مصفوفة JSON من المخاطر (أو كائناً يحتوي على المفتاح risks). يُرسل مفتاح API في ترويسة Authorization عند تعبئته.',
  sheets: 'انشر الورقة على الويب بصيغة CSV: ملف ← مشاركة ← نشر على الويب ← CSV، ثم الصق الرابط الناتج هنا. يجب أن يطابق صف العناوين قالب CSV.',
  supabase: 'عنوان المشروع (https://xxxx.supabase.co) ومفتاح anon واسم الجدول. تُقرأ البيانات عبر REST بصلاحيات المفتاح المدخل فقط.',
};
/** Connectors whose "اختبار الاتصال" goes to sources.testConnection; everything else is simulated. */
const REAL_TEST_TYPE = { 'google-sheets': 'sheets', supabase: 'supabase', webhooks: 'webhook', 'biltix-pm': 'json', 'biltix-dms': 'json' };
const FIELD_TYPES = new Set(['text', 'url', 'password', 'number', 'select', 'textarea', 'email']);

/** Rolling eventsPerHour history per connector id (module scope, survives navigation). */
const history = new Map();

const safe = (fn, fallback) => { try { const v = fn(); return v === undefined ? fallback : v; } catch { return fallback; } };
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const statusMeta = (status) => STATUS_META[status] || STATUS_META.configurable;

/** Seed a connector's history once: the seed's eventsHistory when present, else a flat baseline. */
function seedHistory(g) {
  const id = g && g.id;
  if (!id || history.has(id)) return history.get(id) || [];
  const base = Array.isArray(g.eventsHistory) ? g.eventsHistory.map(Number).filter(Number.isFinite) : [];
  const v = Number(g.eventsPerHour);
  const arr = base.length ? base.slice(-HISTORY_CAP) : (Number.isFinite(v) ? Array.from({ length: 6 }, () => v) : []);
  history.set(id, arr);
  return arr;
}

function pushHistory(id, value, g = null) {
  const v = Number(value);
  let arr = history.get(id);
  if (!arr) arr = seedHistory(g || { id, eventsPerHour: v });
  if (!Number.isFinite(v)) return arr;
  arr.push(v);
  while (arr.length > HISTORY_CAP) arr.shift();
  return arr;
}

function friendlyError(err) {
  const msg = err && err.message ? String(err.message) : String(err || '');
  if (/[؀-ۿ]/.test(msg)) return msg;                                   // already Arabic
  if (/Failed to fetch|NetworkError|network|ECONN|CORS/i.test(msg)) return 'تعذر الوصول إلى الخادم. تحقق من الرابط وإعدادات CORS واتصال الشبكة.';
  if (/abort|timeout|timed out/i.test(msg)) return 'انتهت مهلة الاتصال قبل وصول الرد. حاول مرة أخرى أو تحقق من استجابة الخادم.';
  if (/401|403|unauthori[sz]ed|forbidden/i.test(msg)) return 'رُفض الطلب: تحقق من مفتاح API والصلاحيات.';
  if (/404|not found/i.test(msg)) return 'المسار غير موجود (404). تحقق من العنوان أو اسم الجدول.';
  if (/JSON|parse|Unexpected token/i.test(msg)) return 'تعذر قراءة الرد: الصيغة ليست JSON أو CSV صالحاً.';
  if (/Invalid URL|URL/i.test(msg)) return 'الرابط غير صالح. يجب أن يبدأ بـ https://';
  return 'حدث خطأ غير متوقع أثناء الاتصال. حاول مرة أخرى لاحقاً.';
}

function isHttpUrl(value) {
  try { const u = new URL(String(value || '')); return u.protocol === 'https:' || u.protocol === 'http:'; } catch { return false; }
}

export default {
  id: 'integrations',
  code: 'SEC-09',
  title: 'التكاملات والأنظمة',
  icon: 'plug',

  render(container, ctx) {
    const { store, bus, sel, fmt, charts, components, sources, router, art } = ctx;
    const { h, card, badge, button, segmented, modal, toast, emptyState, liveDot, svgIcon, glyph, formField, readForm, kv } = components;

    /** Seed icon names → art.js names when they differ; resolved through art.hasIcon when available. */
    const ICON_ALIAS = { document: 'dms', watch: 'wearable', users: 'user', database: 'erp', chat: 'teams', sheet: 'sheets', sensor: 'sensor', camera: 'cctv' };
    function connectorIcon(g, size = 22) {
      const candidates = [g && g.icon, ICON_ALIAS[g && g.icon], g && g.id, 'plug'].filter(Boolean);
      const has = art && typeof art.hasIcon === 'function' ? (n) => { try { return !!art.hasIcon(n); } catch { return false; } } : () => true;
      const name = candidates.find(has) || 'plug';
      return svgIcon(name, size);
    }

    const root = h('section', { class: 'view view-integrations' });
    container.appendChild(root);

    let raf = 0;
    let lastNumerals = safe(() => store.state.settings.numerals, 'latn');
    let category = 'all';
    let openModal = null;
    const cardRefs = new Map();     // id → { el, refs }
    const summaryRefs = new Map();  // key → value node
    let chipGroup = null;
    let gridEl = null;
    let dsPanel = null;             // data-source panel handle { el, sync() }

    /* ───────────────────────── helpers ───────────────────────── */

    const mono = (text, extra = '') => h('span', { class: ['num', ...String(extra).split(/\s+/).filter(Boolean)], style: { fontFamily: 'var(--font-mono)' } }, String(text ?? ''));
    const list = () => (Array.isArray(store.state.integrations) ? store.state.integrations : []);
    const byId = (id) => list().find((g) => g && g.id === id) || null;

    function summary() {
      const s = safe(() => (typeof sel.integrationSummary === 'function' ? sel.integrationSummary(store.state) : null), null);
      if (s) return s;
      const l = list();
      const connected = l.filter((g) => g.status === 'connected');
      const lat = connected.map((g) => Number(g.latencyMs)).filter(Number.isFinite);
      return {
        total: l.length,
        connected: connected.length,
        degraded: l.filter((g) => g.status === 'degraded').length,
        disconnected: l.filter((g) => g.status === 'disconnected').length,
        configurable: l.filter((g) => g.status === 'configurable').length,
        eventsPerHour: connected.reduce((n, g) => n + (Number(g.eventsPerHour) || 0), 0),
        meanLatencyMs: lat.length ? Math.round(lat.reduce((a, b) => a + b, 0) / lat.length) : 0,
      };
    }

    function sparkFor(g) {
      const id = g.id;
      const values = history.has(id) ? history.get(id) : seedHistory(g);
      if (!values.length) return h('span', { class: 'text-xs muted' }, 'لا توجد قراءات بعد');
      if (charts && typeof charts.sparkline === 'function') {
        try {
          const sp = charts.sparkline({ values, width: 120, height: 28, color: 'var(--ink-3)', accentLast: true });
          if (sp && sp.el instanceof Node) { sp.el.setAttribute('aria-label', `سجل الأحداث بالساعة لآخر ${fmt.num(values.length)} قراءة`); return sp.el; }
        } catch (err) { console.warn('[integrations] charts.sparkline failed', err); }
      }
      return h('span', { class: 'text-xs muted' }, `آخر ${fmt.num(values.length)} قراءات`);
    }

    function setNote(host, tone, text, extra = null) {
      host.replaceChildren(h('div', { class: ['note', `tone-${tone}`], role: tone === 'critical' ? 'alert' : 'status' },
        h('span', { class: 'row gap-2' }, glyph(tone, 14), h('span', {}, text)),
        extra ? h('div', { class: 'text-xs muted', style: { marginBlockStart: '4px' } }, extra) : null));
    }

    function busy(btn, on) {
      if (!btn) return;
      btn.disabled = !!on;
      if (on) btn.setAttribute('aria-busy', 'true'); else btn.removeAttribute('aria-busy');
    }

    function urlFieldKey(g) {
      const fields = Array.isArray(g.configFields) ? g.configFields : [];
      const f = fields.find((x) => x && x.type === 'url') || fields.find((x) => x && /url|endpoint|host/i.test(String(x.key)));
      return f ? f.key : null;
    }
    function keyFieldKey(g) {
      const fields = Array.isArray(g.configFields) ? g.configFields : [];
      const f = fields.find((x) => x && x.type === 'password') || fields.find((x) => x && /key|token|secret/i.test(String(x.key)));
      return f ? f.key : null;
    }
    function tableFieldKey(g) {
      const fields = Array.isArray(g.configFields) ? g.configFields : [];
      const f = fields.find((x) => x && /table|sheet|collection/i.test(String(x.key)));
      return f ? f.key : null;
    }
    function testTypeFor(g) {
      const declared = g && (g.connectionType || g.type);
      if (typeof declared === 'string' && ['json', 'sheets', 'supabase', 'webhook'].includes(declared)) return declared;
      return REAL_TEST_TYPE[g && g.id] || null;
    }

    /* ───────────────────────── summary strip ───────────────────────── */

    function buildSummary() {
      const s = summary();
      summaryRefs.clear();
      const cell = (key, label, value, tone = null, icon = null) => {
        const v = h('span', { class: 'summary-value' }, value);
        summaryRefs.set(key, v);
        return h('div', { class: ['summary-cell', tone ? `tone-${tone}` : null], 'data-key': key },
          h('span', { class: 'summary-label' }, icon || (tone ? glyph(tone, 12) : null), h('span', {}, label)), v);
      };
      return h('div', { class: 'summary-strip', role: 'group', 'aria-label': 'ملخص حالة التكاملات' },
        cell('connected', 'متصل', fmt.num(s.connected), 'good'),
        cell('degraded', 'أداء متدهور', fmt.num(s.degraded), 'warning'),
        cell('disconnected', 'غير متصل', fmt.num(s.disconnected), 'critical'),
        cell('events', 'إجمالي الأحداث بالساعة', fmt.num(s.eventsPerHour), null, liveDot('accent')),
        cell('latency', 'متوسط زمن الاستجابة', `${fmt.num(s.meanLatencyMs)} م.ث`, null, glyph('clock', 12)),
      );
    }
    function updateSummary() {
      const s = summary();
      const set = (k, v) => { const n = summaryRefs.get(k); if (n && n.textContent !== v) n.textContent = v; };
      set('connected', fmt.num(s.connected)); set('degraded', fmt.num(s.degraded)); set('disconnected', fmt.num(s.disconnected));
      set('events', fmt.num(s.eventsPerHour)); set('latency', `${fmt.num(s.meanLatencyMs)} م.ث`);
      const head = root.querySelector('[data-role="connected-count"]');
      if (head) head.textContent = `${fmt.num(s.connected)} من ${fmt.num(s.total)} متصل`;
    }

    /* ───────────────────────── chips ───────────────────────── */

    function buildChips() {
      const l = list();
      const cats = ['all', ...Object.keys(CATEGORY_LABEL).filter((c) => l.some((g) => g.category === c))];
      l.forEach((g) => { if (g.category && !CATEGORY_LABEL[g.category] && !cats.includes(g.category)) cats.push(g.category); });
      const group = h('div', { class: 'chip-group', role: 'group', 'aria-label': 'تصفية حسب الفئة' });
      cats.forEach((c) => {
        const count = c === 'all' ? l.length : l.filter((g) => g.category === c).length;
        const chip = h('button', { type: 'button', class: ['chip', c === category ? 'is-active' : null], 'aria-pressed': c === category ? 'true' : 'false', 'data-category': c,
          onClick: () => { category = c; group.querySelectorAll('.chip').forEach((b) => { const on = b.dataset.category === c; b.classList.toggle('is-active', on); b.setAttribute('aria-pressed', on ? 'true' : 'false'); }); renderGrid(); } },
          h('span', {}, c === 'all' ? 'الكل' : (CATEGORY_LABEL[c] || c)), h('span', { class: 'chip-count' }, fmt.num(count)));
        group.appendChild(chip);
      });
      return group;
    }

    /* ───────────────────────── connector cards ───────────────────────── */

    function syncNow(g, btn) {
      busy(btn, true);
      delay(500 + Math.random() * 400).then(() => {
        const patch = { lastSync: new Date().toISOString() };
        if (g.status === 'disconnected') { patch.status = 'connected'; patch.latencyMs = Number(g.latencyMs) || 180; }
        store.updateIntegration(g.id, patch);
        toast(g.status === 'disconnected' ? `تمت إعادة الاتصال بـ «${g.name}» ومزامنته.` : `تمت مزامنة «${g.name}» الآن.`, { tone: 'good' });
      }).catch(() => toast(`تعذرت مزامنة «${g.name}». حاول مرة أخرى.`, { tone: 'critical' })).finally(() => busy(btn, false));
    }

    function buildCard(g) {
      const meta = statusMeta(g.status);
      const refs = {};
      refs.statusHost = h('span', { class: 'int-status' });
      refs.sync = h('span', { class: 'int-stat-value' });
      refs.latency = h('span', { class: 'int-stat-value' });
      refs.events = h('span', { class: 'int-stat-value' });
      refs.sparkHost = h('div', { class: 'int-spark', 'aria-hidden': 'true' });
      refs.footSync = h('span', { class: 'int-sync' });
      refs.actions = h('div', { class: 'row gap-2 wrap' });
      refs.meta = h('div', { class: 'int-meta' });
      refs.error = h('div', { class: 'stack', hidden: true });

      const el = h('article', { class: 'int-card', 'data-status': g.status || 'configurable', 'data-id': g.id, 'aria-label': g.name || g.id },
        h('div', { class: 'int-head' },
          h('span', { class: 'int-icon', 'aria-hidden': 'true' }, connectorIcon(g, 22)),
          h('div', { class: 'int-titles' }, h('span', { class: 'int-name' }, g.name || g.id), h('span', { class: 'int-vendor' }, g.vendor || '—')),
          refs.statusHost,
        ),
        g.description ? h('p', { class: 'int-desc' }, g.description) : null,
        refs.error,
        refs.meta,
        h('div', { class: 'int-stats' },
          h('div', { class: 'int-stat' }, h('span', { class: 'int-stat-label' }, 'آخر مزامنة'), refs.sync),
          h('div', { class: 'int-stat' }, h('span', { class: 'int-stat-label' }, 'زمن الاستجابة'), refs.latency),
          h('div', { class: 'int-stat' }, h('span', { class: 'int-stat-label' }, 'أحداث / ساعة'), refs.events),
        ),
        h('div', { class: 'row between gap-2' }, h('span', { class: 'text-xs muted' }, 'الأحداث بالساعة — آخر القراءات'), refs.sparkHost),
        h('div', { class: 'int-foot' }, refs.footSync, refs.actions),
      );
      const entry = { el, refs };
      cardRefs.set(g.id, entry);
      paintCard(g, entry, true);
      return el;
    }

    function paintCard(g, entry, full = false) {
      const { el, refs } = entry;
      const meta = statusMeta(g.status);
      const prevStatus = el.dataset.status;
      el.dataset.status = g.status || 'configurable';
      if (full || prevStatus !== el.dataset.status) {
        refs.statusHost.replaceChildren(liveDot(meta.tone), badge(meta.label, meta.tone));
        refs.actions.replaceChildren();
        const configure = button('إعداد', { variant: g.status === 'configurable' ? 'primary' : 'outline', size: 'sm', icon: svgIcon('settings', 15), onClick: () => openConfig(g.id) });
        refs.actions.appendChild(configure);
        if (g.status === 'connected' || g.status === 'degraded') {
          const syncBtn = button('مزامنة الآن', { variant: 'ghost', size: 'sm', icon: svgIcon('refresh', 15), onClick: () => syncNow(byId(g.id) || g, syncBtn) });
          refs.actions.appendChild(syncBtn);
        } else if (g.status === 'disconnected') {
          const reBtn = button('إعادة الاتصال', { variant: 'ghost', size: 'sm', icon: svgIcon('refresh', 15), onClick: () => syncNow(byId(g.id) || g, reBtn) });
          refs.actions.appendChild(reBtn);
        }
      }
      const hasSync = g.lastSync && g.status !== 'configurable';
      refs.sync.textContent = hasSync ? fmt.relative(g.lastSync) : '—';
      refs.sync.title = hasSync ? fmt.dateTime(g.lastSync) : '';
      refs.latency.textContent = g.status === 'configurable' || !Number.isFinite(Number(g.latencyMs)) ? '—' : `${fmt.num(g.latencyMs)} م.ث`;
      refs.events.textContent = g.status === 'configurable' ? '—' : fmt.num(g.eventsPerHour || 0);
      refs.footSync.replaceChildren(glyph('clock', 12), h('span', {}, hasSync ? `آخر مزامنة ${fmt.relative(g.lastSync)}` : 'لم تتم المزامنة بعد'));
      refs.sparkHost.replaceChildren(sparkFor(g));
      const uptime = Number(g.uptimePct);
      const realType = testTypeFor(g);
      refs.meta.replaceChildren(...[
        badge(CATEGORY_LABEL[g.category] || g.category || 'غير مصنف', 'neutral', { icon: svgIcon('grid', 12) }),
        Number.isFinite(uptime) ? badge(`توافر ${fmt.pct(uptime, uptime % 1 ? 1 : 0)}`, uptime >= 99 ? 'good' : uptime >= 95 ? 'warning' : 'critical') : null,
        realType ? badge({ json: 'JSON API', sheets: 'CSV', supabase: 'REST', webhook: 'Webhook' }[realType], 'brand', { icon: svgIcon('plug', 12) }) : null,
        mono(g.id, 'text-xs muted'),
      ].filter(Boolean));
      const showError = Boolean(g.lastError) && (g.status === 'degraded' || g.status === 'disconnected');
      refs.error.hidden = !showError;
      refs.error.replaceChildren(...(showError
        ? [h('div', { class: ['note', `tone-${meta.tone}`], role: 'status' }, h('span', { class: 'row gap-2' }, glyph(meta.tone, 14), h('span', {}, String(g.lastError))))]
        : []));
    }

    function renderGrid() {
      if (!gridEl) return;
      const l = list().filter((g) => g && (category === 'all' || g.category === category));
      cardRefs.clear();
      if (!l.length) {
        gridEl.replaceChildren(emptyState({ title: 'لا توجد تكاملات في هذه الفئة', text: 'اختر فئة أخرى أو «الكل».' }));
        return;
      }
      const frag = document.createDocumentFragment();
      l.forEach((g) => frag.appendChild(buildCard(g)));
      gridEl.replaceChildren(frag);
    }

    function refreshCards(ids = null) {
      for (const g of list()) {
        if (!g || (ids && !ids.includes(g.id))) continue;
        const entry = cardRefs.get(g.id);
        if (entry) paintCard(g, entry, false);
      }
      updateSummary();
    }

    function refreshRelative() {
      for (const g of list()) {
        const entry = cardRefs.get(g.id);
        if (!entry || !g.lastSync || g.status === 'configurable') continue;
        entry.refs.sync.textContent = fmt.relative(g.lastSync);
        entry.refs.footSync.replaceChildren(glyph('clock', 12), h('span', {}, `آخر مزامنة ${fmt.relative(g.lastSync)}`));
      }
    }

    /* ───────────────────────── config modal ───────────────────────── */

    function openConfig(id) {
      const g = byId(id);
      if (!g) return;
      if (openModal) { try { openModal.close(); } catch { /* ignore */ } openModal = null; }
      const fields = Array.isArray(g.configFields) ? g.configFields : [];
      const config = g.config && typeof g.config === 'object' ? g.config : {};
      const form = h('form', { class: 'form-grid', novalidate: true, onSubmit: (e) => e.preventDefault() });
      fields.forEach((f) => {
        if (!f || !f.key) return;
        const type = FIELD_TYPES.has(f.type) ? f.type : 'text';
        form.appendChild(formField({ label: f.label || f.key, name: f.key, type, value: config[f.key] ?? f.value ?? '', placeholder: f.placeholder || '', hint: f.hint || '', options: f.options || [], required: !!f.required }));
      });
      const result = h('div', { class: 'stack', 'aria-live': 'polite' });
      const meta = statusMeta(g.status);
      const realType = testTypeFor(g);
      const body = h('div', { class: 'stack gap-4' },
        h('div', { class: 'row gap-3' },
          h('span', { class: 'int-icon', 'aria-hidden': 'true' }, connectorIcon(g, 22)),
          kv([['المزوّد', g.vendor || '—'], ['الفئة', CATEGORY_LABEL[g.category] || g.category || '—'], ['الحالة', badge(meta.label, meta.tone)]]),
        ),
        fields.length ? form : h('div', { class: 'note' }, 'لا يتطلب هذا التكامل إعدادات إضافية؛ يمكنك اختبار الاتصال مباشرة.'),
        h('p', { class: 'text-xs muted' }, realType
          ? 'يُجرى اختبار الاتصال فعلياً عبر الشبكة باستخدام القيم المدخلة.'
          : 'يُجرى اختبار الاتصال عبر فحص محاكى لهذا النوع من الأنظمة (لا يُرسل أي بيانات خارج المتصفح).'),
        result,
      );

      async function runTest() {
        const values = readForm(form);
        const started = performance.now();
        setNote(result, 'accent', 'جارٍ اختبار الاتصال…');
        try {
          if (realType && sources && typeof sources.testConnection === 'function') {
            const urlKey = urlFieldKey(g); const keyKey = keyFieldKey(g); const tableKey = tableFieldKey(g);
            const url = urlKey ? String(values[urlKey] || '') : '';
            if (!isHttpUrl(url)) { setNote(result, 'warning', 'أدخل رابطاً صالحاً يبدأ بـ https:// قبل اختبار الاتصال.'); return; }
            const r = await sources.testConnection({ type: realType, url, apiKey: keyKey ? String(values[keyKey] || '') : '', table: tableKey ? String(values[tableKey] || '') : '' });
            const ok = !!(r && r.ok);
            const lat = r && Number.isFinite(Number(r.latencyMs)) ? Number(r.latencyMs) : Math.round(performance.now() - started);
            setNote(result, ok ? 'good' : 'critical', (r && r.message) || (ok ? 'تم الاتصال بنجاح.' : 'فشل الاتصال.'), `زمن الاستجابة ${fmt.num(lat)} م.ث`);
          } else {
            await delay(SIMULATED_TEST_MIN_MS + Math.random() * (SIMULATED_TEST_MAX_MS - SIMULATED_TEST_MIN_MS));
            const lat = Math.round(80 + Math.random() * 160);
            setNote(result, 'good', `تم التحقق من الاتصال بـ «${g.name}» بنجاح.`, `زمن الاستجابة ${fmt.num(lat)} م.ث · فحص محاكى`);
          }
        } catch (err) {
          setNote(result, 'critical', friendlyError(err));
        }
      }

      function save() {
        const values = readForm(form);
        const clean = {};
        Object.keys(values).forEach((k) => { clean[k] = values[k] === null || values[k] === undefined ? '' : String(values[k]); });
        store.updateIntegration(g.id, { config: clean });
        toast(`تم حفظ إعدادات «${g.name}».`, { tone: 'good' });
      }

      openModal = modal({
        title: `إعداد — ${g.name}`,
        subtitle: g.vendor ? `${g.vendor} · ${CATEGORY_LABEL[g.category] || g.category || ''}` : '',
        size: 'md',
        body,
        actions: [
          { label: 'اختبار الاتصال', variant: 'outline', closes: false, onClick: () => runTest().then(() => false) },
          { label: 'حفظ', variant: 'primary', onClick: () => { save(); } },
        ],
        onClose: () => { openModal = null; },
      });
      openModal.open();
    }

    /* ───────────────────────── data source panel ───────────────────────── */

    function buildDataSource() {
      const settings = store.state.settings || {};
      const ds = { type: 'simulation', url: '', apiKey: '', table: '', ...(settings.dataSource || {}) };
      if (!SOURCE_TYPES.some((t) => t.value === ds.type)) ds.type = 'simulation';

      const fUrl = formField({ label: 'الرابط (URL)', name: 'url', type: 'url', value: ds.url, placeholder: 'https://', hint: '' });
      const fKey = formField({ label: 'مفتاح API', name: 'apiKey', type: 'password', value: ds.apiKey, placeholder: '', hint: 'يُحفظ محلياً في هذا المتصفح فقط.' });
      const fTable = formField({ label: 'اسم الجدول', name: 'table', type: 'text', value: ds.table, placeholder: 'risks' });
      const hint = h('div', { class: 'note' }, SOURCE_HINT[ds.type]);
      const result = h('div', { class: 'stack', 'aria-live': 'polite' });
      const fields = h('div', { class: 'form-grid' }, fUrl, fKey, fTable);
      const form = h('form', { class: 'stack gap-3', novalidate: true, onSubmit: (e) => e.preventDefault() }, fields);

      const current = () => ({ type: ds.type, url: String(form.elements.url.value || '').trim(), apiKey: String(form.elements.apiKey.value || ''), table: String(form.elements.table.value || '').trim() });

      function paintFields(type) {
        const showUrl = type !== 'simulation';
        fUrl.hidden = !showUrl;
        fKey.hidden = !(type === 'json' || type === 'supabase');
        fTable.hidden = type !== 'supabase';
        fields.hidden = !showUrl;
        hint.textContent = SOURCE_HINT[type] || '';
        const urlInput = form.elements.url;
        if (urlInput) urlInput.placeholder = type === 'sheets' ? 'https://docs.google.com/spreadsheets/d/…/pub?output=csv' : type === 'supabase' ? 'https://xxxx.supabase.co' : 'https://api.example.com/hse/risks';
        testBtn.disabled = !showUrl;
        importBtn.disabled = !showUrl;
      }

      function persist(partial = {}) {
        const next = { ...current(), ...partial };
        ds.type = next.type;
        const prev = store.state.settings && store.state.settings.dataSource ? store.state.settings.dataSource : {};
        if (prev.type === next.type && prev.url === next.url && prev.apiKey === next.apiKey && prev.table === next.table) return;
        store.setSettings({ dataSource: next });
      }

      const seg = segmented({ options: SOURCE_TYPES, value: ds.type, ariaLabel: 'نوع مصدر البيانات', onChange: (v) => { ds.type = v; paintFields(v); persist({ type: v }); result.replaceChildren(); } });
      form.addEventListener('change', () => persist());

      async function runTest() {
        const cfg = current();
        if (cfg.type === 'simulation') { setNote(result, 'neutral', 'المحاكاة الحية لا تحتاج إلى اختبار اتصال.'); return; }
        if (!isHttpUrl(cfg.url)) { setNote(result, 'warning', 'أدخل رابطاً صالحاً يبدأ بـ https:// أولاً.'); return; }
        if (cfg.type === 'supabase' && !cfg.table) { setNote(result, 'warning', 'أدخل اسم الجدول لاختبار اتصال Supabase.'); return; }
        busy(testBtn, true);
        setNote(result, 'accent', 'جارٍ اختبار الاتصال…');
        try {
          if (!sources || typeof sources.testConnection !== 'function') throw new Error('مكوّن المصادر الخارجية غير متاح حالياً.');
          const r = await sources.testConnection(cfg);
          const ok = !!(r && r.ok);
          setNote(result, ok ? 'good' : 'critical', (r && r.message) || (ok ? 'تم الاتصال بنجاح.' : 'فشل الاتصال.'), r && Number.isFinite(Number(r.latencyMs)) ? `زمن الاستجابة ${fmt.num(r.latencyMs)} م.ث` : null);
        } catch (err) { setNote(result, 'critical', friendlyError(err)); } finally { busy(testBtn, false); }
      }

      async function runImport() {
        const cfg = current();
        if (cfg.type === 'simulation') { setNote(result, 'neutral', 'اختر مصدراً خارجياً (JSON API أو Google Sheets أو Supabase) لاستيراد المخاطر.'); return; }
        if (!isHttpUrl(cfg.url)) { setNote(result, 'warning', 'أدخل رابطاً صالحاً يبدأ بـ https:// أولاً.'); return; }
        busy(importBtn, true);
        setNote(result, 'accent', 'جارٍ جلب المخاطر من المصدر…');
        try {
          if (!sources || typeof sources.importRisks !== 'function') throw new Error('مكوّن المصادر الخارجية غير متاح حالياً.');
          const r = await sources.importRisks(cfg);
          const rows = r && Array.isArray(r.risks) ? r.risks : [];
          if (!rows.length) { setNote(result, 'warning', 'لم يُعثر على أي صفوف صالحة في المصدر. تحقق من صف العناوين مقارنة بقالب CSV.'); return; }
          let added = 0;
          rows.forEach((row) => { try { if (store.addRisk(row)) added += 1; } catch { /* skip bad row */ } });
          const n = fmt.num(added);
          setNote(result, 'good', `تم استيراد ${n} ${added === 1 ? 'مخاطرة' : added === 2 ? 'مخاطرتين' : added <= 10 ? 'مخاطر' : 'مخاطرة'} إلى سجل المخاطر.`, rows.length !== added ? `تم تجاهل ${fmt.num(rows.length - added)} صفاً غير صالح.` : null);
          toast(`تم استيراد ${n} ${added === 1 ? 'مخاطرة' : 'مخاطر'} من ${SOURCE_TYPES.find((t) => t.value === cfg.type)?.label || 'المصدر'}.`, { tone: 'good', action: router && typeof router.navigate === 'function' ? { label: 'فتح السجل', onClick: () => router.navigate('risks') } : null });
        } catch (err) { setNote(result, 'critical', friendlyError(err)); } finally { busy(importBtn, false); }
      }

      function downloadTemplate() {
        try {
          if (!sources || typeof sources.downloadTemplateCSV !== 'function') throw new Error('unavailable');
          sources.downloadTemplateCSV();
          toast('تم تنزيل قالب CSV لاستيراد المخاطر.', { tone: 'good' });
        } catch { toast('تعذر تنزيل القالب حالياً.', { tone: 'critical' }); }
      }

      const testBtn = button('اختبار الاتصال', { variant: 'outline', icon: svgIcon('plug', 16), onClick: () => { runTest(); } });
      const importBtn = button('استيراد المخاطر', { variant: 'primary', icon: svgIcon('download', 16), onClick: () => { runImport(); } });
      const templateBtn = button('تنزيل قالب CSV', { variant: 'ghost', icon: svgIcon('file-text', 16), onClick: downloadTemplate });

      /* Alert webhook */
      const fHook = formField({ label: 'رابط Webhook للتنبيهات', name: 'alertWebhook', type: 'url', value: settings.alertWebhook || '', placeholder: 'https://hooks.example.com/biltix-hse', hint: 'تُرسل التنبيهات الحرجة إلى هذا الرابط بطلب POST بصيغة JSON (يناسب n8n وZapier وMake وSlack Webhooks).' });
      const hookResult = h('div', { class: 'stack', 'aria-live': 'polite' });
      const hookInput = fHook.querySelector('input');
      hookInput.addEventListener('change', () => {
        const v = String(hookInput.value || '').trim();
        if (v && !isHttpUrl(v)) { setNote(hookResult, 'warning', 'الرابط غير صالح؛ لن يُحفظ حتى يبدأ بـ https://'); return; }
        if ((store.state.settings && store.state.settings.alertWebhook) !== v) store.setSettings({ alertWebhook: v });
        hookResult.replaceChildren();
      });
      async function sendTest() {
        const url = String(hookInput.value || '').trim();
        if (!isHttpUrl(url)) { setNote(hookResult, 'warning', 'أدخل رابط Webhook صالحاً يبدأ بـ https:// أولاً.'); return; }
        busy(hookBtn, true);
        setNote(hookResult, 'accent', 'جارٍ إرسال التنبيه التجريبي…');
        try {
          if (!sources || typeof sources.postWebhook !== 'function') throw new Error('مكوّن المصادر الخارجية غير متاح حالياً.');
          const payload = { type: 'test', severity: 'info', tone: 'accent', title: 'تنبيه تجريبي من بلتكس HSE', detail: 'هذه رسالة اختبار للتأكد من وصول تنبيهات مركز قيادة السلامة والصحة المهنية.', siteId: null, ts: new Date().toISOString(), source: 'biltix-hse' };
          const r = await sources.postWebhook(url, payload);
          const ok = !!(r && r.ok);
          setNote(hookResult, ok ? 'good' : 'critical', ok ? 'تم إرسال التنبيه التجريبي بنجاح.' : 'لم يقبل الخادم الطلب.', r && r.status ? `رمز الاستجابة ${fmt.num(r.status)}` : (r && r.message) || null);
        } catch (err) { setNote(hookResult, 'critical', friendlyError(err)); } finally { busy(hookBtn, false); }
      }
      const hookBtn = button('إرسال تنبيه تجريبي', { variant: 'outline', icon: svgIcon('bell', 16), onClick: () => { sendTest(); } });

      paintFields(ds.type);

      const body = h('div', { class: 'stack gap-4' },
        h('div', { class: 'stack gap-2' }, h('span', { class: 'form-section-title' }, 'نوع المصدر'), seg.el, hint),
        form,
        h('div', { class: 'row wrap gap-2' }, testBtn, importBtn, templateBtn, h('span', { class: 'text-xs muted grow text-end' }, 'تُحفظ الإعدادات تلقائياً')),
        result,
        h('hr', { class: 'divider' }),
        h('div', { class: 'stack gap-2' }, h('span', { class: 'form-section-title' }, 'قناة التنبيهات'), fHook, h('div', { class: 'row wrap gap-2' }, hookBtn), hookResult),
      );

      const el = card({ code: 'DATA-SRC', title: 'مصدر البيانات', subtitle: 'اختر من أين يقرأ المركز بيانات المخاطر، واختبر الاتصال واستورد السجلات', className: 'col-span-8', body });

      function sync() {
        const s = store.state.settings || {};
        const d = { type: 'simulation', url: '', apiKey: '', table: '', ...(s.dataSource || {}) };
        const active = document.activeElement;
        if (d.type !== ds.type) { ds.type = d.type; seg.set(d.type); paintFields(d.type); }
        [['url', d.url], ['apiKey', d.apiKey], ['table', d.table]].forEach(([k, v]) => { const inp = form.elements[k]; if (inp && inp !== active && inp.value !== (v || '')) inp.value = v || ''; });
        if (hookInput !== active && hookInput.value !== (s.alertWebhook || '')) hookInput.value = s.alertWebhook || '';
      }
      return { el, sync };
    }

    function buildTemplateGuide() {
      const cols = [
        ['code', 'رمز المخاطرة (اختياري، يُولَّد تلقائياً)'], ['siteId', 'معرّف الموقع S1…S6'], ['categoryId', 'فئة الخطر (height, electrical, …)'],
        ['hazard', 'وصف الخطر'], ['activity', 'النشاط'], ['likelihood', 'الاحتمالية 1–5'], ['severity', 'الشدة 1–5'],
        ['owner', 'المسؤول'], ['dueDate', 'تاريخ الاستحقاق YYYY-MM-DD'], ['status', 'الحالة (مفتوح، قيد المعالجة، …)'],
      ];
      const table = h('table', { class: 'table is-dense' }, h('caption', { class: 'sr-only' }, 'أعمدة قالب CSV'),
        h('thead', {}, h('tr', {}, h('th', { scope: 'col' }, 'العمود'), h('th', { scope: 'col' }, 'الوصف'))),
        h('tbody', {}, ...cols.map(([k, d]) => h('tr', {}, h('td', { class: 'mono' }, k), h('td', {}, d)))));
      const body = h('div', { class: 'stack gap-3' },
        h('p', { class: 'text-sm ink-2' }, 'يُطابق المستورد صف العناوين التالي حرفياً (بالإنجليزية) ثم يحوّل كل صف إلى مخاطرة في السجل مع احتساب الدرجة تلقائياً.'),
        h('div', { class: 'table-wrap' }, table),
        h('p', { class: 'text-xs muted' }, 'الحقول غير المعروفة تُتجاهل، والقيم الناقصة تُستكمل بالافتراضيات (الاحتمالية والشدة 3، الحالة «مفتوح»).'),
      );
      return card({ code: 'DATA-TPL', title: 'دليل قالب الاستيراد', subtitle: 'أعمدة CSV / JSON المدعومة', className: 'col-span-4', body });
    }

    /* ───────────────────────── build ───────────────────────── */

    function buildHead() {
      const s = summary();
      return h('div', { class: 'view-head' },
        h('div', { class: 'view-head-text' },
          h('span', { class: 'code-tag' }, 'SEC-09'),
          h('h1', { tabindex: '-1' }, 'التكاملات والأنظمة'),
          h('p', { class: 'view-lead' }, 'حالة الاتصال بأنظمة الموقع والجهات الخارجية وقنوات التنبيه في الزمن الحقيقي، مع إعداد مصدر البيانات الخارجي لاستيراد سجل المخاطر.'),
        ),
        h('div', { class: 'view-actions' },
          h('span', { class: 'row gap-2 text-sm ink-2' }, liveDot('accent'), h('span', { 'data-role': 'connected-count' }, `${fmt.num(s.connected)} من ${fmt.num(s.total)} متصل`)),
        ),
      );
    }

    function build() {
      raf = 0;
      cardRefs.clear();
      chipGroup = buildChips();
      gridEl = h('div', { class: 'cards-grid', role: 'list', 'aria-label': 'بطاقات التكاملات' });
      dsPanel = buildDataSource();
      const frag = document.createDocumentFragment();
      frag.append(
        buildHead(),
        buildSummary(),
        h('section', { class: 'stack gap-3', 'aria-labelledby': 'int-grid-title' },
          h('div', { class: 'row between wrap gap-3' },
            h('div', { class: 'card-titles' }, h('span', { class: 'card-code', 'aria-hidden': 'true' }, 'INT-01'), h('h2', { class: 'card-title', id: 'int-grid-title' }, 'الموصلات')),
            chipGroup,
          ),
          gridEl,
        ),
        h('div', { class: 'grid-12' }, dsPanel.el, buildTemplateGuide()),
      );
      root.replaceChildren(frag);
      renderGrid();
    }

    function schedule() { if (!raf) raf = requestAnimationFrame(build); }

    const unsubs = [
      bus.on('integrations:tick', (payload) => {
        const items = payload && Array.isArray(payload.integrations) ? payload.integrations : list();
        items.forEach((g) => { if (g && g.id) pushHistory(g.id, g.eventsPerHour, g); });
        refreshCards();
      }),
      bus.on('store:change', (payload) => {
        const path = payload && payload.path ? String(payload.path) : '*';
        if (path === '*') { schedule(); return; }
        if (path.startsWith('integrations')) {
          const id = path.split('.')[1];
          const g = id ? byId(id) : null;
          if (g && cardRefs.has(id)) refreshCards([id]); else if (!id || !cardRefs.has(id)) schedule(); else refreshCards();
          return;
        }
        if (path.startsWith('settings') && dsPanel) dsPanel.sync();
      }),
      bus.on('settings:change', (payload) => {
        const s = payload && payload.settings ? payload.settings : store.state.settings;
        const n = s ? s.numerals : lastNumerals;
        if (n !== lastNumerals) { lastNumerals = n; schedule(); return; }
        if (dsPanel) dsPanel.sync();
      }),
    ];
    const relTimer = setInterval(refreshRelative, RELATIVE_REFRESH_MS);

    build();

    return () => {
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      clearInterval(relTimer);
      unsubs.forEach((u) => { try { if (typeof u === 'function') u(); } catch { /* ignore */ } });
      if (openModal) { try { openModal.close(); } catch { /* ignore */ } openModal = null; }
      cardRefs.clear();
      summaryRefs.clear();
      root.remove();
    };
  },
};
