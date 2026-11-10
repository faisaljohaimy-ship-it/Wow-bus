/**
 * Biltix Risk AI — view: محرك الذكاء الاصطناعي والتفسير (js/views/engine.js) — PLT-01
 *
 * The AI Risk Engine: a DOM-built map of the five architecture layers (.pipeline-map,
 * structure from css/platform.css) with the five model nodes, a compact five-tab strip
 * (one expanded pipeline at a time: status, version, last run, runs today, latency,
 * precision / recall / calibration / drift meters, acceptance-vs-override segmented bar,
 * feature-importance ranked bars and the KRI matrix both collapsed by default, retrain /
 * pause via store.updatePipeline — which itself appends the 'model-update' audit entry),
 * an explainability note and the audit log.
 *
 * Live updates (C-4): the 30 s pipeline jitter (lastRun / runsToday / latency / drift)
 * patches the strip and the expanded card in place; validation ticks only update the gate
 * label; audit entries swap the audit card; structural changes (status / version / count)
 * rebuild. connectors / tasks / alerts / aiRisks are not displayed here and are ignored.
 *
 * Fallback styles for the structures this view introduces (tab strip, meter grid, meta
 * cells, collapsible sections, explain steps) live in a `@layer views` block, so the
 * unlayered css/platform.css (PLATFORM-CORE) always takes precedence.
 *
 * Contract: docs/ARCHITECTURE.md §4, §5, B1 (layers), B2 (thresholds), B3 (pipelines,
 * auditLog), B4 (psel.pipelineHealth), B5 (updatePipeline), B8, B9.9.
 * Data reaches the DOM only through textContent / components.h. No cross-view imports.
 */

const STYLE_ID = 'view-engine-style';
const STYLE_TEXT = `@layer views {
  .engine-meters { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: var(--space-3); }
  .engine-meta { display: grid; grid-template-columns: repeat(auto-fit, minmax(110px, 1fr)); gap: var(--space-2); }
  .engine-meta-cell { display: flex; flex-direction: column; gap: 2px; padding: 8px 10px; border-radius: 8px; background: var(--bg-2); border: 1px solid var(--line); min-inline-size: 0; }
  .engine-meta-label { font-size: 11px; color: var(--ink-3); }
  .engine-meta-value { font-family: var(--font-mono-mixed); font-size: var(--fs-sm); font-variant-numeric: tabular-nums; color: var(--ink-1); }
  .engine-techniques { margin: 0; padding: 0; list-style: none; display: flex; flex-wrap: wrap; gap: 6px; }
  .engine-techniques > li { display: inline-flex; align-items: center; gap: 6px; font-size: var(--fs-xs); color: var(--ink-2); padding: 3px 9px; border-radius: var(--radius-pill); background: var(--bg-2); border: 1px solid var(--line); }
  .engine-techniques > li > svg { color: var(--accent); flex: none; }
  .engine-fold > summary { cursor: pointer; font-size: var(--fs-sm); font-weight: 600; color: var(--ink-2); padding-block: 6px; list-style: none; display: flex; align-items: center; gap: 8px; }
  .engine-fold > summary::-webkit-details-marker { display: none; }
  .engine-fold > summary::before { content: ""; inline-size: 7px; block-size: 7px; border-inline-end: 2px solid currentColor; border-block-end: 2px solid currentColor; transform: rotate(-45deg); transition: transform var(--dur-1) var(--ease); margin-inline-end: 2px; }
  .engine-fold[open] > summary::before { transform: rotate(45deg); }
  .engine-fold > summary .muted { font-weight: 400; }
  .pipe-tabs { display: flex; flex-wrap: wrap; gap: 6px; }
  .pipe-tab { display: inline-flex; align-items: center; gap: 8px; padding: 8px 12px; border-radius: 10px; border: 1px solid var(--line); background: var(--bg-2); color: var(--ink-2); font: inherit; font-size: var(--fs-sm); cursor: pointer; min-inline-size: 0; text-align: start; transition: border-color var(--dur-1) var(--ease), background var(--dur-1) var(--ease); }
  .pipe-tab:hover, .pipe-tab:focus-visible { color: var(--ink-1); border-color: var(--line-2); }
  .pipe-tab[aria-selected="true"] { color: var(--ink-1); background: color-mix(in srgb, var(--brand) 14%, var(--bg-1)); border-color: color-mix(in srgb, var(--brand) 55%, transparent); }
  .pipe-tab > svg { flex: none; color: var(--ink-3); }
  .pipe-tab[aria-selected="true"] > svg { color: var(--brand); }
  .pipe-tab .mono { font-size: 10.5px; color: var(--ink-3); }
  .pipeline-node.is-model { cursor: pointer; font: inherit; text-align: start; transition: border-color var(--dur-1) var(--ease), background var(--dur-1) var(--ease); }
  .pipeline-node.is-model:hover, .pipeline-node.is-model:focus-visible { background: var(--bg-3); }
  .explain-steps { margin: 0; padding-inline-start: 0; list-style: none; counter-reset: xs; display: grid; gap: 14px 20px; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); }
  .explain-steps > li { display: grid; grid-template-columns: 28px minmax(0, 1fr); gap: 10px; align-items: start; counter-increment: xs; }
  .explain-steps > li::before { content: counter(xs); display: grid; place-items: center; inline-size: 26px; block-size: 26px; border-radius: 50%; background: color-mix(in srgb, var(--brand) 16%, transparent); color: var(--brand); font-family: var(--font-mono); font-size: 12px; font-weight: 600; }
  :root[data-numerals="arab"] .explain-steps > li::before { content: counter(xs, arabic-indic); }
  .view-engine .code { font-family: var(--font-mono); font-variant-numeric: tabular-nums; unicode-bidi: isolate; }
  @media (max-width: 1279.98px) { .engine-meters { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
  @media (max-width: 720px) { .engine-meters { grid-template-columns: minmax(0, 1fr); } }
  @media (max-width: 599.98px) {
    .view-engine .chips.is-scroll, .view-engine .pipe-tabs { flex-wrap: nowrap; overflow-x: auto; scroll-snap-type: x proximity; -webkit-overflow-scrolling: touch; padding-block-end: 4px; scrollbar-width: thin; }
    .view-engine .chips.is-scroll > .chip, .view-engine .pipe-tab { flex: none; scroll-snap-align: start; }
  }
  @media (prefers-reduced-motion: reduce) { .pipeline-node.is-model, .pipe-tab, .engine-fold > summary::before { transition: none; } }
}`;

const STATUS = {
  running: { label: 'يعمل', tone: 'good' },
  idle: { label: 'متوقف مؤقتاً', tone: 'neutral' },
  training: { label: 'قيد التدريب', tone: 'accent' },
  degraded: { label: 'متدهور', tone: 'warning' },
};
const PIPELINE_ICON = { 'contract-nlp': 'file-text', 'bom-forecast': 'list', 'schedule-model': 'calendar', 'site-ai': 'helmet', 'cost-forecast': 'chart' };
const ACTION = {
  override: { label: 'تجاوز', tone: 'warning' }, accept: { label: 'قبول', tone: 'good' }, escalate: { label: 'تصعيد', tone: 'critical' },
  writeback: { label: 'كتابة عكسية', tone: 'brand' }, 'model-update': { label: 'تحديث النموذج', tone: 'accent' }, validation: { label: 'تحقق', tone: 'neutral' },
  login: { label: 'تسجيل دخول', tone: 'neutral' }, config: { label: 'إعدادات', tone: 'neutral' }, close: { label: 'إغلاق', tone: 'good' },
};
/** Five layers from §B1 — the engine layer (4) renders the live pipeline nodes instead of static ones. `{range}` is replaced with the localised 0–100 range. */
const LAYERS = [
  { no: '1', title: 'طبقة التكامل', desc: 'موصلات REST/SDK وWebhooks تقرأ من وحدات بلتكس والأنظمة المؤسسية والتغذيات الخارجية.', nodes: [['layers', 'Biltix — العقود، BoM/BoQ، الجدول، تقارير الموقع، التكلفة، الصور'], ['integration', 'Primavera P6 EPPM'], ['integration', 'Autodesk APS (BIM/CAD)'], ['integration', 'Oracle ERP / CRM'], ['globe', 'السلع · أسعار الصرف · الأرصاد · GIS']] },
  { no: '2', title: 'التحقق والتنظيف', desc: 'فحص المخطط، إزالة التكرار، الاكتمال والاتساق — لا يصل سجل إلى المحرك قبل اجتيازها.', nodes: [['list', 'مخطط البيانات'], ['copy', 'إزالة التكرار'], ['badge-check', 'الاكتمال'], ['sliders', 'الاتساق']] },
  { no: '3', title: 'بحيرة بيانات المخاطر', desc: 'بيانات مهيكلة وغير مهيكلة، مُوحَّدة ومُصدَّرة (versioned) وقابلة للتدقيق.', nodes: [['erp', 'سجلات مهيكلة'], ['file-text', 'مستندات وصور'], ['clock', 'إصدارات زمنية'], ['shield-alert', 'مسار تدقيق كامل']] },
  { no: '4', title: 'محرك المخاطر بخمسة خطوط', desc: 'خمسة نماذج على طبقة تسجيل وتفسير مشتركة: درجة {range} + تفسير بلغة واضحة.', engine: true },
  { no: '5', title: 'التصنيف والتنبيه → قمرة القيادة', desc: 'النوع (مالي/سلامة/تأخير/نزاع) والتقييم (أحمر/أصفر/أخضر)، ثم قائمة التنبيهات، الكتابة العكسية، ومهام المعالجة.', nodes: [['filter', 'منطق التصنيف الخلفي'], ['bell', 'التنبيه والتصعيد'], ['refresh', 'الكتابة العكسية إلى Biltix PM'], ['file-check', 'مهام المعالجة'], ['radar', 'قمرة القيادة']] },
];
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
const asPct = (v) => { const n = num(v); return n <= 1 ? n * 100 : n; };
const setText = (el, text) => { if (el && el.textContent !== text) el.textContent = text; };

/** Pending simulated retrain timers (module-level so a re-render never double-schedules). */
const retrainTimers = new Map();

function ensureStyle() {
  if (typeof document === 'undefined' || document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = STYLE_TEXT;
  document.head.appendChild(style);
}

function bumpVersion(v) {
  const m = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(String(v || ''));
  if (!m) return v || 'v2.3.2';
  return `v${m[1]}.${m[2]}.${Number(m[3]) + 1}`;
}

export default {
  id: 'engine',
  code: 'PLT-01',
  title: 'محرك الذكاء الاصطناعي والتفسير',
  icon: 'sliders',

  render(container, ctx) {
    const { store, bus, fmt, charts, components, psel, router } = ctx;
    const { h, card, badge, dataTable, button, toast, emptyState, svgIcon, glyph, liveDot } = components;

    ensureStyle();
    const root = h('section', { class: 'view view-engine' });
    container.appendChild(root);

    let raf = 0;
    let auditFilter = 'all';
    const openKri = new Set();
    const openFi = new Set();
    const params = ctx.params || {};
    let activeId = params.pipeline ? String(params.pipeline) : null;
    let pendingScroll = params.pipeline ? 'pipelines' : (params.section === 'audit' ? 'audit' : null);
    /** Live references patched in place on telemetry ticks (C-4). */
    const live = { signature: '', gate: null, tabs: new Map(), meta: null, drift: null, audit: null, pipelinesCard: null };

    /* ───────────────────────── helpers ───────────────────────── */

    const mono = (text, extra = []) => h('span', { class: ['mono', 'num', ...arr(extra)] }, String(text ?? '—'));
    const latin = (label) => { const s = String(label ?? ''); return /^[\x20-\x7E]+$/.test(s) ? h('span', { lang: 'en', dir: 'ltr' }, s) : s; };
    const codeSpan = (code, extra = null) => h('span', { class: ['code', 'mono', 'nowrap', extra], dir: 'ltr' }, String(code ?? ''));
    function withCodes(str) {
      const s = String(str ?? ''); const out = []; let last = 0; let m;
      CODE_RE.lastIndex = 0;
      while ((m = CODE_RE.exec(s))) { if (m.index > last) out.push(digitsIn(fmt, s.slice(last, m.index))); out.push(codeSpan(m[0])); last = m.index + m[0].length; }
      if (last < s.length) out.push(digitsIn(fmt, s.slice(last)));
      return out.length ? out : [digitsIn(fmt, s)];
    }
    const range100 = () => `من ${fmt.num(0)} إلى ${fmt.num(100)}`;
    const statusOf = (p) => STATUS[p && p.status] || { label: p && p.status ? String(p.status) : '—', tone: 'neutral' };
    const now = () => (typeof store.now === 'function' ? store.now() : new Date());
    const latencyText = (p) => `${fmt.num(num(p.avgLatencyMs))} م.ث`;

    function makeChart(name, opts) {
      if (!charts || typeof charts[name] !== 'function') return null;
      try { const c = charts[name](opts); return c && c.el instanceof Node ? c : null; } catch (err) { console.warn(`[engine] charts.${name} failed`, err); return null; }
    }
    function simpleTable(headers, rows) {
      const table = h('table', { class: 'table is-dense' });
      table.appendChild(h('thead', {}, h('tr', {}, ...headers.map((t) => h('th', { scope: 'col' }, String(t))))));
      table.appendChild(h('tbody', {}, ...rows.map((r) => h('tr', {}, ...r.map((c) => h('td', {}, c instanceof Node ? c : String(c ?? '—')))))));
      return table;
    }

    /** Threshold meter on the shared `.meter` chrome (charts.css): label + tone glyph + value head, single-hue fill. Returns refs so live ticks can patch it. */
    function meter({ value, max = 100, label, thresholds, format }) {
      const toneOf = (v) => (thresholds.find((t) => v <= t.upTo) || thresholds[thresholds.length - 1]).tone;
      const valueEl = h('span', { class: 'meter-value num' });
      const glyphHost = h('span', { class: 'row gap-1' });
      const head = h('div', { class: 'meter-head' }, h('span', {}, label), glyphHost);
      const fill = h('div', { class: 'meter-fill', style: { background: 'var(--tone)' } });
      const el = h('div', { class: ['meter'], role: 'meter', 'aria-valuemin': '0', 'aria-valuemax': String(max), 'aria-label': label });
      el.append(head, h('div', { class: 'meter-track' }, fill));
      let tone = null;
      const set = (next) => {
        const v = Math.max(0, Math.min(max, num(next)));
        const t = toneOf(v);
        const valueText = format ? format(v) : fmt.num(v, { maximumFractionDigits: 1 });
        if (t !== tone) { if (tone) el.classList.remove(`tone-${tone}`); el.classList.add(`tone-${t}`); glyphHost.replaceChildren(glyph(t, 12), valueEl); tone = t; }
        setText(valueEl, valueText);
        el.setAttribute('aria-valuenow', String(v)); el.setAttribute('aria-valuetext', valueText);
        const size = `${((v / max) * 100).toFixed(1)}%`;
        if (fill.style.inlineSize !== size) fill.style.inlineSize = size;
      };
      set(value);
      return { el, set };
    }

    function healthTone(p) {
      const t = p && (p.healthTone || p.health || p.tone);
      if (['good', 'warning', 'serious', 'critical', 'neutral', 'accent'].includes(t)) return t;
      if (!p) return 'neutral';
      if (p.status === 'degraded') return 'warning';
      if (p.status === 'idle') return 'neutral';
      if (num(p.driftScore) > 0.4 || asPct(p.precision) < 75) return 'warning';
      return 'good';
    }

    /* ───────────────────────── store bridges ───────────────────────── */

    function updatePipeline(id, patch) {
      if (typeof store.updatePipeline === 'function') return store.updatePipeline(id, patch);
      store.update((s) => { const p = arr(s.platform && s.platform.pipelines).find((x) => x.id === id); if (p) Object.assign(p, patch); return `platform.pipelines.${id}`; });
      return null;
    }

    function retrain(p) {
      if (retrainTimers.has(p.id)) return;
      updatePipeline(p.id, { status: 'training', lastRun: now().toISOString() });
      toast(`بدأت إعادة تدريب «${p.nameAr || p.name}» بالبيانات المعتمدة من طبقة التحقق — تستغرق المحاكاة نحو ${fmt.num(10)} ثوانٍ`, { tone: 'accent' });
      const timer = setTimeout(() => {
        retrainTimers.delete(p.id);
        const nextVersion = bumpVersion(p.version);
        try {
          updatePipeline(p.id, { status: 'running', version: nextVersion, lastRun: now().toISOString(), driftScore: Math.max(0.02, num(p.driftScore) * 0.35), calibrationError: Math.max(0.01, num(p.calibrationError) * 0.7) });
          toast(`اكتملت إعادة تدريب «${p.nameAr || p.name}» — الإصدار ${nextVersion}؛ انخفض الانجراف وخطأ المعايرة`, { tone: 'good' });
        } catch { /* store gone */ }
      }, 10_000);
      retrainTimers.set(p.id, timer);
    }
    function togglePause(p) {
      const pausing = p.status !== 'idle';
      updatePipeline(p.id, { status: pausing ? 'idle' : 'running', lastRun: pausing ? p.lastRun : now().toISOString() });
      toast(pausing ? `تم إيقاف «${p.nameAr || p.name}» مؤقتاً — لن تُسجَّل مخاطر جديدة منه` : `تم استئناف «${p.nameAr || p.name}»`, { tone: pausing ? 'warning' : 'good' });
    }

    /* ───────────────────────── data ───────────────────────── */

    function collectPipelines(state, plat) {
      let pipelines = safe(() => psel.pipelineHealth(state), null);
      if (!Array.isArray(pipelines) || !pipelines.length) pipelines = arr(plat.pipelines);
      return pipelines.map((p) => ({ ...p, _tone: healthTone(p) }));
    }
    const structuralSignature = (pipelines) => pipelines.map((p) => `${p.id}|${p.status}|${p.version}|${retrainTimers.has(p.id) ? 't' : ''}`).join(';');

    function collect() {
      const state = store.state;
      const plat = safe(() => psel.platform(state), null) || state.platform || {};
      const pipelines = collectPipelines(state, plat);
      const settings = (state.settings && state.settings.platform) || {};
      const alertThreshold = num(settings.alertThreshold, 60);
      const criticalThreshold = num(settings.criticalThreshold, 85);
      const range = num(store.filters && store.filters.range, 30);
      const since = now().getTime() - range * 86_400_000;
      const auditAll = arr(plat.auditLog).slice().sort((a, b) => (Date.parse(b.at) || 0) - (Date.parse(a.at) || 0));
      const audit = auditAll.filter((e) => (Date.parse(e.at) || 0) >= since);
      const actionCounts = audit.reduce((acc, e) => { acc[e.action] = (acc[e.action] || 0) + 1; return acc; }, {});
      const totals = {
        runsToday: pipelines.reduce((a, p) => a + num(p.runsToday), 0),
        running: pipelines.filter((p) => p.status === 'running').length,
        meanLatency: pipelines.length ? pipelines.reduce((a, p) => a + num(p.avgLatencyMs), 0) / pipelines.length : 0,
      };
      const validation = safe(() => psel.validationSummary(state), null);
      return { state, plat, pipelines, alertThreshold, criticalThreshold, range, audit, auditAll, actionCounts, totals, validation };
    }

    /* ───────────────────────── sections ───────────────────────── */

    function buildHead(data) {
      const t = data.totals;
      live.headRuns = h('span', { class: 'num' }, fmt.num(t.runsToday));
      live.headLatency = h('span', { class: 'num' }, fmt.num(t.meanLatency));
      return h('div', { class: 'view-head' },
        h('div', { class: 'view-head-text' },
          h('span', { class: 'code-tag' }, 'PLT-01'),
          h('h1', { tabindex: '-1' }, 'محرك الذكاء الاصطناعي والتفسير'),
          h('p', { class: 'view-lead' }, `خمسة خطوط نمذجة على طبقة تسجيل وتفسير مشتركة: كل مخاطرة تحصل على درجة ${range100()}، نوع، تقييم لوني، وتفسير بلغة واضحة يسمي البند أو السطر أو النشاط الذي أثارها — مع الإنسان في الحلقة لكل قرار.`),
        ),
        h('div', { class: 'view-actions' },
          badge(`${fmt.num(t.running)} / ${fmt.num(data.pipelines.length)} خطوط تعمل`, data.pipelines.length && t.running === data.pipelines.length ? 'good' : 'warning'),
          h('span', { class: 'text-sm muted' }, live.headRuns, ' تشغيلة اليوم · زمن استجابة ', live.headLatency, ' مللي ثانية'),
        ),
      );
    }

    function selectPipeline(id, { scroll = true } = {}) {
      activeId = String(id);
      pendingScroll = scroll ? 'pipelines' : null;
      schedule();
    }
    function scrollTo(target) {
      const el = target === 'audit' ? root.querySelector('#engine-audit') : root.querySelector('#engine-pipelines');
      if (!el) return;
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      const focusEl = target === 'audit' ? el.querySelector('.card-title') : el.querySelector('.pipe-tab[aria-selected="true"]');
      if (focusEl) { if (!focusEl.hasAttribute('tabindex')) focusEl.setAttribute('tabindex', '-1'); try { focusEl.focus({ preventScroll: true }); } catch { /* ignore */ } }
    }

    /** .pipeline-map > .pipeline-layer[data-layer] > .pipeline-layer-head + .pipeline-layer-body > .pipeline-node* (css/platform.css) */
    function buildMap(data) {
      const map = h('div', { class: 'pipeline-map', role: 'group', 'aria-label': 'معمارية المنصة: خمس طبقات من التكامل إلى قمرة القيادة' });
      LAYERS.forEach((layer, i) => {
        const body = h('div', { class: 'pipeline-layer-body' });
        if (layer.engine) {
          data.pipelines.forEach((p) => {
            const st = statusOf(p);
            body.appendChild(h('button', { type: 'button', class: ['pipeline-node', 'is-model'], 'data-status': p.status || 'idle', 'aria-label': `${p.nameAr || p.name}: ${st.label} — عرض تفاصيل الخط`, onClick: () => selectPipeline(p.id) },
              svgIcon(PIPELINE_ICON[p.id] || 'sliders', 14),
              h('span', {}, p.nameAr || p.name || p.id),
              h('span', { class: 'mono', lang: 'en', dir: 'ltr' }, p.version || '—'),
              h('span', { class: 'sr-only' }, st.label),
            ));
          });
          if (!data.pipelines.length) body.appendChild(h('span', { class: 'pipeline-node' }, svgIcon('sliders', 14), h('span', {}, 'لا توجد خطوط مسجلة')));
          body.appendChild(h('span', { class: 'pipeline-gate' }, svgIcon('sparkles', 12), h('span', {}, `طبقة التسجيل والتفسير المشتركة — درجة ${range100()} · معايرة · أهم المحركات`)));
        } else {
          layer.nodes.forEach(([icon, label]) => body.appendChild(h('span', { class: 'pipeline-node' }, svgIcon(icon, 14), h('span', {}, latin(label)))));
          if (i === 1) {
            live.gate = h('span', {}, gateText(data.validation));
            body.appendChild(h('span', { class: 'pipeline-gate' }, svgIcon('badge-check', 12), live.gate));
          }
        }
        map.appendChild(h('div', { class: ['pipeline-layer', layer.engine ? 'is-active' : null], 'data-layer': layer.no },
          h('div', { class: 'pipeline-layer-head' }, h('span', { class: 'pipeline-layer-index', lang: 'en', dir: 'ltr' }, `LAYER 0${layer.no}`), h('h3', {}, layer.title), h('p', {}, layer.desc.replace('{range}', range100()))),
          body,
        ));
        if (i < LAYERS.length - 1) map.appendChild(h('span', { class: 'pipeline-connector', 'aria-hidden': 'true' }));
      });
      return card({
        code: 'ENG-00', title: 'خريطة خطوط المعالجة', subtitle: 'من موصلات التكامل إلى قمرة القيادة — انقر على أي خط لعرض بطاقته',
        body: map,
        footer: h('p', { class: 'text-xs muted' }, 'المنصة تقرأ من أنظمة العميل فقط؛ ما يُكتب عكسياً هو أعلام المخاطر والدرجات والتنبيهات ومهام المعالجة.'),
      });
    }
    const gateText = (validation) => (validation ? `بوابة التحقق · معدل الاجتياز ${fmt.pct(num(validation.passRatePct), 1)}` : 'بوابة التحقق');

    /** Feature-importance fallback with the .feature-bars structure from css/platform.css. */
    function featureBars(fi) {
      const max = fi.reduce((a, f) => Math.max(a, num(f.weight)), 0) || 1;
      return h('div', { class: 'feature-bars', role: 'list', 'aria-label': 'أهمية الميزات' }, ...fi.map((f) => {
        const pct = asPct(f.weight);
        return h('div', { class: 'feature-bar', role: 'listitem' },
          h('span', { class: 'feature-bar-label', title: f.feature }, f.feature),
          h('div', { class: 'feature-bar-track', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': String(Math.round(pct)), 'aria-label': f.feature }, h('div', { class: 'feature-bar-fill', style: { inlineSize: `${((num(f.weight) / max) * 100).toFixed(1)}%` } })),
          h('span', { class: 'feature-bar-value num' }, fmt.pct(pct, 0)),
        );
      }));
    }

    /** The expanded pipeline panel (one at a time). Feature importance and the KRI matrix are folded by default. */
    function buildPipelinePanel(p) {
      const st = statusOf(p);
      const precision = asPct(p.precision); const recall = asPct(p.recall);
      const calib = asPct(p.calibrationError); const drift = Math.max(0, Math.min(100, num(p.driftScore) * 100));
      const driftMeter = meter({ value: drift, label: 'انجراف البيانات', thresholds: [{ upTo: 20, tone: 'good' }, { upTo: 40, tone: 'warning' }, { upTo: 100, tone: 'critical' }], format: (v) => fmt.num(v / 100, { maximumFractionDigits: 2, minimumFractionDigits: 2 }) });
      live.drift = driftMeter;
      const meters = h('div', { class: 'engine-meters' },
        meter({ value: precision, label: 'الدقة (Precision)', thresholds: [{ upTo: 74.99, tone: 'critical' }, { upTo: 84.99, tone: 'warning' }, { upTo: 100, tone: 'good' }], format: (v) => fmt.pct(v, 1) }).el,
        meter({ value: recall, label: 'الاستدعاء (Recall)', thresholds: [{ upTo: 74.99, tone: 'critical' }, { upTo: 84.99, tone: 'warning' }, { upTo: 100, tone: 'good' }], format: (v) => fmt.pct(v, 1) }).el,
        meter({ value: calib, max: 25, label: 'خطأ المعايرة (ECE)', thresholds: [{ upTo: 5, tone: 'good' }, { upTo: 10, tone: 'warning' }, { upTo: 25, tone: 'critical' }], format: (v) => fmt.pct(v, 1) }).el,
        driftMeter.el,
      );
      live.meta = {
        lastRun: h('span', { title: fmt.dateTime(p.lastRun) }, fmt.relative(p.lastRun)),
        runs: mono(fmt.num(num(p.runsToday))),
        latency: mono(latencyText(p)),
        risks: mono(fmt.num(num(p.risksLast30d))),
      };
      const meta = h('div', { class: 'engine-meta' },
        ...[
          ['الإصدار', h('span', { class: 'mono', lang: 'en', dir: 'ltr' }, p.version || '—')],
          ['آخر تشغيل', live.meta.lastRun],
          ['تشغيلات اليوم', live.meta.runs],
          ['زمن الاستجابة', live.meta.latency],
          [`مخاطر ${fmt.num(30)} يوماً`, live.meta.risks],
        ].map(([label, value]) => h('div', { class: 'engine-meta-cell' }, h('span', { class: 'engine-meta-label' }, label), h('span', { class: 'engine-meta-value' }, value))),
      );

      const fi = arr(p.featureImportance).slice().sort((a, b) => num(b.weight) - num(a.weight)).slice(0, 6);
      const fiChart = fi.length ? makeChart('barChart', { items: fi.map((f, i) => ({ id: `${p.id}-f${i}`, label: f.feature, value: Number(asPct(f.weight).toFixed(1)) })), horizontal: true, height: fi.length * 28 + 24, valueFormat: (v) => fmt.pct(v, 0), color: 'var(--s1)', showValues: true, maxBars: 6, ariaLabel: `أهمية الميزات — ${p.nameAr || p.name}` }) : null;
      const fiFold = h('details', { class: 'engine-fold', open: openFi.has(p.id), onToggle: (e) => { if (e.target.open) openFi.add(p.id); else openFi.delete(p.id); } },
        h('summary', {}, h('span', {}, 'أهمية الميزات (محركات الدرجة)'), h('span', { class: 'text-xs muted' }, fi.length ? `أعلى ${fmt.num(fi.length)} ميزات` : 'غير متاحة')),
        h('div', { class: 'stack gap-2', style: { paddingBlockStart: '6px' } }, fiChart ? fiChart.el : (fi.length ? featureBars(fi) : emptyState({ title: 'لا تتوفر أهمية الميزات' }))));

      const acc = Math.max(0, Math.min(100, num(p.acceptanceRatePct)));
      const segParts = [{ id: 'accept', label: 'قبول التوصية', value: Number(acc.toFixed(1)), color: 'var(--s1)' }, { id: 'override', label: 'تعديل أو تجاوز', value: Number((100 - acc).toFixed(1)), color: 'var(--s2)' }];
      const seg = makeChart('segmentedBar', { parts: segParts, tall: true, valueFormat: (v) => fmt.pct(v, 0), ariaLabel: `القبول مقابل التجاوز — ${p.nameAr || p.name}` });
      const segFallback = h('div', { class: 'segbar' }, h('div', { class: 'segbar-track' }, ...segParts.map((s) => h('div', { class: 'segbar-part', style: { flex: `${s.value} 1 0`, '--part': s.color }, title: `${s.label}: ${fmt.pct(s.value, 0)}` }, h('span', { class: 'segbar-label' }, fmt.pct(s.value, 0))))), h('div', { class: 'legend' }, ...segParts.map((s) => h('span', { class: 'legend-item' }, h('span', { class: 'legend-key', style: { background: s.color } }), h('span', { class: 'legend-label' }, s.label)))));

      const kris = arr(p.kris);
      const kriTable = dataTable({ dense: true, pageSize: 0, stickyFirst: true, emptyText: 'لا تتوفر مصفوفة مؤشرات لهذا الخط', caption: `مصفوفة مؤشرات المخاطر — ${p.nameAr || p.name}`, columns: [
        { key: 'indicator', label: 'المؤشر', sortable: false, priority: 'high', render: (r) => h('span', { class: 'semibold' }, r.indicator || '—') },
        { key: 'technique', label: 'التقنية', sortable: false, priority: 'medium', render: (r) => r.technique || '—' },
        { key: 'inputs', label: 'المدخلات', sortable: false, priority: 'low', render: (r) => (Array.isArray(r.inputs) ? r.inputs.join(' · ') : (r.inputs || '—')) },
        { key: 'mitigation', label: 'المعالجة', sortable: false, priority: 'medium', render: (r) => r.mitigation || '—' },
      ], rows: kris.map((k, i) => ({ id: `${p.id}-k${i}`, ...k })) });
      kriTable.table.classList.add('kri-table');
      const kriFold = h('details', { class: 'engine-fold', open: openKri.has(p.id), onToggle: (e) => { if (e.target.open) openKri.add(p.id); else openKri.delete(p.id); } }, h('summary', {}, h('span', {}, 'مصفوفة مؤشرات المخاطر (KRI)'), h('span', { class: 'text-xs muted' }, `${fmt.num(kris.length)} مؤشرات`)), kriTable.el);

      const isTraining = p.status === 'training' || retrainTimers.has(p.id);
      const actions = h('div', { class: 'row wrap gap-2', style: { inlineSize: '100%' } },
        button(isTraining ? 'جارٍ التدريب…' : 'إعادة تدريب', { variant: 'outline', size: 'sm', icon: 'refresh', onClick: () => retrain(p), attrs: { disabled: isTraining, 'aria-busy': isTraining ? 'true' : undefined } }),
        button(p.status === 'idle' ? 'استئناف' : 'إيقاف مؤقت', { variant: p.status === 'idle' ? 'primary' : 'ghost', size: 'sm', icon: p.status === 'idle' ? 'play' : 'pause', onClick: () => togglePause(p), attrs: { disabled: isTraining } }),
        h('span', { class: 'toolbar-spacer' }),
        button('المخاطر المكتشفة', { variant: 'ghost', size: 'sm', icon: 'shield-alert', onClick: () => router.navigate('airisks', { pipeline: p.id }) }),
      );

      return {
        panel: h('div', { class: 'stack gap-4', role: 'tabpanel', id: `pipe-${p.id}`, 'aria-labelledby': `pipe-tab-${p.id}`, tabindex: '0' },
          h('div', { class: 'row between wrap gap-2' },
            h('div', { class: 'stack gap-1', style: { minInlineSize: 0 } }, h('span', { class: 'text-sm semibold' }, p.nameAr || p.name || p.id), h('span', { class: 'text-xs muted' }, latin(p.name || ''), p.description ? ` — ${digitsIn(fmt, p.description)}` : '')),
            h('div', { class: 'row gap-2' }, badge(st.label, st.tone), liveDot(p._tone))),
          meta,
          arr(p.techniques).length ? h('ul', { class: 'engine-techniques', 'aria-label': 'التقنيات' }, ...arr(p.techniques).map((t) => h('li', {}, svgIcon('sparkles', 12), h('span', {}, String(t))))) : null,
          meters,
          h('div', { class: 'stack gap-2' }, h('div', { class: 'row between wrap' }, h('span', { class: 'text-sm semibold' }, 'الإنسان في الحلقة: القبول مقابل التجاوز'), h('span', { class: 'text-xs muted' }, `${fmt.num(num(p.overridesLast30d))} تجاوزاً من ${fmt.num(num(p.risksLast30d))} مخاطرة خلال ${fmt.num(30)} يوماً`)), seg ? seg.el : segFallback),
          fiFold,
          kriFold,
        ),
        actions,
        tableView: fi.length ? () => simpleTable(['الميزة', 'الوزن'], fi.map((f) => [f.feature, fmt.pct(asPct(f.weight), 1)])) : null,
      };
    }

    /** Five-tab strip + one expanded pipeline (V13). */
    function buildPipelines(data) {
      live.tabs = new Map(); live.meta = null; live.drift = null;
      if (!data.pipelines.length) return card({ id: 'engine-pipelines', code: 'ENG-01', title: 'خطوط المعالجة', body: emptyState({ title: 'لا توجد خطوط نمذجة مسجلة', text: 'تأكد من تحميل بيانات المنصة.' }) });
      if (!activeId || !data.pipelines.some((p) => String(p.id) === activeId)) activeId = String(data.pipelines[0].id);
      const active = data.pipelines.find((p) => String(p.id) === activeId);
      const tabs = h('div', { class: 'pipe-tabs', role: 'tablist', 'aria-label': 'خطوط المعالجة الخمسة' });
      data.pipelines.forEach((p) => {
        const st = statusOf(p);
        const selected = String(p.id) === activeId;
        const tab = h('button', { type: 'button', role: 'tab', id: `pipe-tab-${p.id}`, class: 'pipe-tab', 'aria-selected': selected ? 'true' : 'false', 'aria-controls': `pipe-${p.id}`, tabindex: selected ? '0' : '-1', 'data-id': String(p.id), onClick: () => { if (String(p.id) !== activeId) selectPipeline(p.id, { scroll: false }); } },
          svgIcon(PIPELINE_ICON[p.id] || 'sliders', 14), h('span', {}, p.nameAr || p.name || p.id), liveDot(p._tone), h('span', { class: 'mono', lang: 'en', dir: 'ltr' }, p.version || ''), h('span', { class: 'sr-only' }, st.label));
        live.tabs.set(String(p.id), { tab });
        tabs.appendChild(tab);
      });
      tabs.addEventListener('keydown', (e) => {
        const keys = ['ArrowRight', 'ArrowLeft', 'Home', 'End'];
        if (!keys.includes(e.key)) return;
        const ids = data.pipelines.map((p) => String(p.id));
        let idx = ids.indexOf(activeId);
        if (e.key === 'ArrowLeft') idx = (idx + 1) % ids.length; // RTL: forward in reading order
        else if (e.key === 'ArrowRight') idx = (idx - 1 + ids.length) % ids.length;
        else if (e.key === 'Home') idx = 0; else idx = ids.length - 1;
        e.preventDefault();
        activeId = ids[idx];
        pendingScroll = null; pendingFocusTab = true;
        schedule();
      });
      const built = buildPipelinePanel(active);
      const el = card({
        id: 'engine-pipelines', code: 'ENG-01', title: 'خطوط المعالجة الخمسة',
        subtitle: 'اختر خطاً لعرض حالته ومقاييسه؛ أهمية الميزات ومصفوفة المؤشرات مطويتان افتراضياً',
        actions: [badge(`${fmt.num(data.totals.running)} / ${fmt.num(data.pipelines.length)} تعمل`, data.totals.running === data.pipelines.length ? 'good' : 'warning')],
        body: h('div', { class: 'stack gap-4' }, tabs, built.panel),
        footer: built.actions,
        tableView: built.tableView,
      });
      live.pipelinesCard = el;
      return el;
    }
    let pendingFocusTab = false;

    /** 30 s jitter: patch the expanded card's meta and drift meter plus the header totals; rebuild only on structural change. */
    function patchPipelines() {
      const state = store.state;
      const plat = safe(() => psel.platform(state), null) || state.platform || {};
      const pipelines = collectPipelines(state, plat);
      if (structuralSignature(pipelines) !== live.signature || !live.pipelinesCard || !live.pipelinesCard.isConnected) { schedule(); return; }
      const p = pipelines.find((x) => String(x.id) === activeId);
      if (p && live.meta) {
        setText(live.meta.lastRun, fmt.relative(p.lastRun)); live.meta.lastRun.title = fmt.dateTime(p.lastRun);
        setText(live.meta.runs, fmt.num(num(p.runsToday)));
        setText(live.meta.latency, latencyText(p));
        setText(live.meta.risks, fmt.num(num(p.risksLast30d)));
        if (live.drift) live.drift.set(Math.max(0, Math.min(100, num(p.driftScore) * 100)));
      }
      const runsToday = pipelines.reduce((a, x) => a + num(x.runsToday), 0);
      const meanLatency = pipelines.length ? pipelines.reduce((a, x) => a + num(x.avgLatencyMs), 0) / pipelines.length : 0;
      setText(live.headRuns, fmt.num(runsToday)); setText(live.headLatency, fmt.num(meanLatency));
    }

    function ratingChip(label, rating, tone) {
      const b = badge(label, tone);
      b.classList.add('rating', `is-${rating}`);
      return b;
    }

    function buildExplainability(data) {
      const steps = [
        ['المدخلات المعتمدة', 'يستقبل كل خط فقط السجلات التي اجتازت طبقة التحقق، ويحوّلها إلى ميزات (features) موصوفة بالعربية: مدة سداد البند، نسبة انحراف الكمية، احتمال التأخير، قراءة الحساس…'],
        ['التقدير ثم المعايرة', `يُنتج النموذج احتمالاً أو تقديراً خاماً، ثم تُعايره طبقة التسجيل المشتركة على بيانات الأثر التاريخية ليصبح درجة ${range100()} قابلة للمقارنة بين الخطوط الخمسة.`],
        ['التصنيف الخلفي', `تُسند الدرجة إلى نوع (مالي / سلامة / تأخير / نزاع) وتقييم لوني: أحمر من ${fmt.num(70)} فأكثر، أصفر من ${fmt.num(40)} إلى ${fmt.num(69)}، أخضر أقل من ${fmt.num(40)}. ما يتجاوز ${fmt.num(data.alertThreshold)} يدخل قائمة التنبيهات، وما يبلغ ${fmt.num(data.criticalThreshold)} فأكثر يُصعَّد فوراً.`],
        ['تفسير المحرك', 'تُترجم أعلى ثلاث ميزات مساهمة (قيم شابلي التقريبية) إلى جملة واحدة تسمي البند أو السطر أو النشاط أو القراءة المحددة وسبب أهميتها — مع نسبة ثقة النموذج وإصداره.'],
        ['الإنسان في الحلقة', 'كل قبول أو تعديل أو تجاوز للتوصية يُسجَّل في سجل التدقيق مع السبب، ويُعاد تغذيته لإعادة معايرة النموذج في دورة التدريب التالية.'],
      ];
      return card({
        code: 'ENG-06', title: 'كيف تُحسب الدرجة ويُصاغ التفسير', subtitle: 'طبقة التفسير المشتركة لجميع الخطوط — من المدخلات المعتمدة إلى التجاوز البشري المُسجَّل',
        body: h('div', { class: 'stack gap-4' },
          h('ol', { class: 'explain-steps' }, ...steps.map(([t, d]) => h('li', {}, h('div', { class: 'stack', style: { gap: '2px' } }, h('span', { class: 'text-sm semibold' }, t), h('span', { class: 'text-xs ink-2', style: { lineHeight: '1.6' } }, d))))),
          h('div', { class: 'row wrap gap-2', role: 'group', 'aria-label': 'نطاقات التقييم' },
            ratingChip(`أحمر: ${fmt.num(70)} فأكثر — تدخل فوري`, 'red', 'critical'),
            ratingChip(`أصفر: من ${fmt.num(40)} إلى ${fmt.num(69)} — مراقبة`, 'yellow', 'warning'),
            ratingChip(`أخضر: أقل من ${fmt.num(40)} — ضمن حدود التحمل`, 'green', 'good'),
          ),
          h('div', { class: 'note', style: { '--tone': 'var(--brand)' } }, h('strong', {}, 'العتبات الحالية: '), `تنبيه أكبر من ${fmt.num(data.alertThreshold)} · تصعيد فوري من ${fmt.num(data.criticalThreshold)} فأكثر. `, button('تعديل العتبات', { variant: 'ghost', size: 'sm', icon: 'bell', onClick: () => router.navigate('alerts') })),
        ),
      });
    }

    function buildAudit(data) {
      const rows = auditFilter === 'all' ? data.audit : data.audit.filter((e) => e.action === auditFilter);
      const chips = h('div', { class: 'chip-group chips is-scroll', role: 'group', 'aria-label': 'تصفية سجل التدقيق', style: { overflowX: 'auto' } },
        h('button', { type: 'button', class: ['chip', 'is-sm', auditFilter === 'all' ? 'is-active' : null], 'aria-pressed': auditFilter === 'all' ? 'true' : 'false', onClick: () => { auditFilter = 'all'; refreshAudit(); } }, h('span', {}, 'الكل'), h('span', { class: 'chip-count' }, fmt.num(data.audit.length))),
        ...Object.entries(ACTION).filter(([k]) => data.actionCounts[k]).map(([k, a]) => h('button', { type: 'button', class: ['chip', 'is-sm', `tone-${a.tone}`, auditFilter === k ? 'is-active' : null], 'aria-pressed': auditFilter === k ? 'true' : 'false', onClick: () => { auditFilter = k; refreshAudit(); } }, glyph(a.tone, 12), h('span', {}, a.label), h('span', { class: 'chip-count' }, fmt.num(data.actionCounts[k])))),
      );
      const table = dataTable({
        dense: true, pageSize: 8, stickyFirst: true, emptyText: `لا توجد أحداث خلال آخر ${fmt.num(data.range)} يوماً`, caption: 'سجل التدقيق',
        columns: [
          { key: 'at', label: 'الوقت', priority: 'high', render: (e) => h('span', { class: 'text-xs nowrap', title: fmt.dateTime(e.at) }, fmt.dateTime(e.at)), sortValue: (e) => Date.parse(e.at) || 0 },
          { key: 'actor', label: 'المنفّذ', priority: 'low', render: (e) => e.actor || '—' },
          { key: 'action', label: 'الإجراء', priority: 'high', render: (e) => { const a = ACTION[e.action] || { label: e.action || '—', tone: 'neutral' }; return badge(a.label, a.tone); } },
          { key: 'target', label: 'الهدف', priority: 'medium', render: (e) => h('span', { class: 'row gap-1 wrap' }, ...withCodes(e.target || '—')) },
          { key: 'detail', label: 'التفاصيل', priority: 'medium', sortable: false, render: (e) => h('span', { class: 'text-sm' }, ...withCodes(e.detail || '—')) },
        ],
        rows: rows.map((e, i) => ({ id: e.id || `a-${i}`, ...e })), initialSort: { key: 'at', dir: 'desc' },
      });
      const el = card({
        id: 'engine-audit', code: 'ENG-07', title: 'سجل التدقيق والإصدارات', subtitle: `التجاوزات، الكتابة العكسية وتحديثات النماذج خلال آخر ${fmt.num(data.range)} يوماً`,
        actions: [h('span', { class: 'text-sm muted' }, `${fmt.num(data.auditAll.length)} حدثاً إجمالاً`)],
        body: h('div', { class: 'stack gap-3' }, chips, table.el),
      });
      live.audit = el;
      return el;
    }
    /** Audit entries only touch the audit card — swap it instead of rebuilding the page. */
    function refreshAudit() {
      if (raf) return;
      if (!live.audit || !live.audit.isConnected) { schedule(); return; }
      const next = buildAudit(collect());
      live.audit.replaceWith(next);
    }

    /* ───────────────────────── build ───────────────────────── */

    function build() {
      raf = 0;
      const data = collect();
      live.signature = structuralSignature(data.pipelines);
      const frag = document.createDocumentFragment();
      frag.append(
        buildHead(data),
        buildMap(data),
        buildPipelines(data),
        buildExplainability(data),
        buildAudit(data),
      );
      root.replaceChildren(frag);
      if (pendingFocusTab) {
        pendingFocusTab = false;
        const ref = live.tabs.get(activeId);
        if (ref) { try { ref.tab.focus({ preventScroll: true }); } catch { /* ignore */ } }
      }
      if (pendingScroll) {
        const target = pendingScroll; pendingScroll = null;
        requestAnimationFrame(() => scrollTo(target));
        // the deep-link params (?pipeline= / ?section=) are consumed once: drop them so a reload or back-forward starts clean
        try { if (/^#\/engine\?/.test(location.hash || '')) history.replaceState(null, '', '#/engine'); } catch { /* ignore */ }
      }
    }

    function schedule() {
      if (raf) return;
      raf = requestAnimationFrame(build);
    }

    const unsubs = [
      bus.on('store:change', (payload) => {
        const path = payload && payload.path ? String(payload.path) : '*';
        if (path === '*') { schedule(); return; }
        if (/^settings/.test(path)) return; // settings:change handles it
        if (!/^platform\./.test(path)) return; // Part A collections and the feed never change this view
        if (/^platform\.pipelines/.test(path)) { if (!raf) patchPipelines(); return; }
        if (/^platform\.validation/.test(path)) { if (!raf && live.gate) setText(live.gate, gateText(safe(() => psel.validationSummary(store.state), null))); return; }
        if (/^platform\.auditLog/.test(path)) { refreshAudit(); return; }
        // connectors, tasks, alerts, aiRisks, … are not displayed here
      }),
      bus.on('filters:change', (payload) => { const key = payload && payload.key; if (!key || key === 'range') schedule(); }),
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
