/**
 * Biltix Risk AI — view: محرك الذكاء الاصطناعي والتفسير (js/views/engine.js) — PLT-01
 *
 * The AI Risk Engine: a DOM-built map of the five architecture layers (.pipeline-map)
 * with the five model nodes, one detailed card per pipeline (status, version, last run,
 * runs today, latency, precision / recall / calibration / drift meters, feature-importance
 * ranked bars, acceptance-vs-override segmented bar, collapsible KRI matrix, retrain /
 * pause actions via store.updatePipeline), an explainability note and the audit log.
 *
 * Fallback styles for the structures this view introduces live in a `@layer views`
 * block, so the unlayered css/platform.css (PLATFORM-CORE) always takes precedence.
 *
 * Contract: docs/ARCHITECTURE.md §4, §5, B1 (layers), B2 (thresholds), B3 (pipelines,
 * auditLog), B4 (psel.pipelineHealth), B5 (updatePipeline, pushAudit), B8, B9.9.
 * Data reaches the DOM only through textContent / components.h. No cross-view imports.
 */

const STYLE_ID = 'view-engine-style';
const STYLE_TEXT = `@layer views {
  .pipeline-map { display: flex; flex-direction: column; min-inline-size: 0; }
  .pipeline-layer { display: flex; flex-wrap: wrap; gap: var(--space-3) var(--space-4); padding: var(--space-3) var(--space-4); border: 1px solid var(--line); border-inline-start: 3px solid var(--layer-tone, var(--line-2)); border-radius: var(--radius-ctl); background: var(--bg-2); min-inline-size: 0; }
  .pipeline-layer.is-engine { background: color-mix(in srgb, var(--brand) 6%, var(--bg-2)); }
  .pipeline-layer-head { flex: 0 0 230px; min-inline-size: 0; display: flex; flex-direction: column; gap: 3px; }
  .pipeline-layer-no { font-family: var(--font-mono); font-size: 11px; letter-spacing: .08em; color: var(--ink-3); }
  .pipeline-layer-title { margin: 0; font-size: var(--fs-md); font-weight: 600; color: var(--ink-1); }
  .pipeline-layer-desc { margin: 0; font-size: var(--fs-xs); color: var(--ink-3); line-height: 1.5; }
  .pipeline-layer-nodes { flex: 1 1 320px; display: flex; flex-wrap: wrap; gap: 8px; align-items: stretch; min-inline-size: 0; }
  .pipeline-node { display: inline-flex; align-items: center; gap: 6px; padding: 6px 10px; border-radius: 8px; background: var(--bg-1); border: 1px solid var(--line); font-size: var(--fs-xs); color: var(--ink-2); min-inline-size: 0; }
  .pipeline-node > svg { flex: none; color: var(--ink-3); }
  .pipeline-node.is-model { flex: 1 1 160px; flex-direction: column; align-items: flex-start; gap: 4px; padding: 10px 12px; cursor: pointer; text-align: start; font: inherit; color: var(--ink-2); transition: border-color var(--dur-1) var(--ease), background var(--dur-1) var(--ease); }
  .pipeline-node.is-model:hover, .pipeline-node.is-model:focus-visible { border-color: var(--line-2); background: var(--bg-3); }
  .pipeline-node-title { font-size: var(--fs-sm); font-weight: 600; color: var(--ink-1); }
  .pipeline-node-meta { display: flex; gap: 8px; align-items: center; font-size: 11px; color: var(--ink-3); flex-wrap: wrap; }
  .pipeline-connector { position: relative; block-size: 30px; display: flex; justify-content: center; align-items: center; }
  .pipeline-connector::before { content: ""; position: absolute; inset-block: 0; inline-size: 2px; background: var(--line-2); }
  .pipeline-connector .live-dot { position: relative; }
  .engine-meters { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--space-3); }
  .engine-meta { display: grid; grid-template-columns: repeat(auto-fit, minmax(110px, 1fr)); gap: var(--space-2); }
  .engine-meta-cell { display: flex; flex-direction: column; gap: 2px; padding: 8px 10px; border-radius: 8px; background: var(--bg-2); border: 1px solid var(--line); min-inline-size: 0; }
  .engine-meta-label { font-size: 11px; color: var(--ink-3); }
  .engine-meta-value { font-family: var(--font-mono); font-size: var(--fs-sm); font-variant-numeric: tabular-nums; color: var(--ink-1); }
  .engine-kri > summary { cursor: pointer; font-size: var(--fs-sm); font-weight: 600; color: var(--ink-2); padding-block: 6px; list-style: none; display: flex; align-items: center; gap: 8px; }
  .engine-kri > summary::-webkit-details-marker { display: none; }
  .engine-kri > summary::before { content: ""; inline-size: 7px; block-size: 7px; border-inline-end: 2px solid currentColor; border-block-end: 2px solid currentColor; transform: rotate(-45deg); transition: transform var(--dur-1) var(--ease); margin-inline-end: 2px; }
  .engine-kri[open] > summary::before { transform: rotate(45deg); }
  .explain-steps { margin: 0; padding-inline-start: 0; list-style: none; counter-reset: xs; display: grid; gap: 10px; }
  .explain-steps > li { display: grid; grid-template-columns: 28px minmax(0, 1fr); gap: 10px; align-items: start; counter-increment: xs; }
  .explain-steps > li::before { content: counter(xs); display: grid; place-items: center; inline-size: 26px; block-size: 26px; border-radius: 50%; background: color-mix(in srgb, var(--brand) 16%, transparent); color: var(--brand); font-family: var(--font-mono); font-size: 12px; font-weight: 600; }
  @media (max-width: 720px) { .pipeline-layer-head { flex-basis: 100%; } .engine-meters { grid-template-columns: minmax(0, 1fr); } }
  @media (prefers-reduced-motion: reduce) { .pipeline-node.is-model, .engine-kri > summary::before { transition: none; } }
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
const LAYERS = [
  { no: '01', title: 'طبقة التكامل', desc: 'موصلات REST/SDK وWebhooks تقرأ من وحدات بلتكس والأنظمة المؤسسية والتغذيات الخارجية.', tone: 'var(--accent)', nodes: [['layers', 'Biltix — العقود، BoM/BoQ، الجدول، تقارير الموقع، التكلفة، الصور'], ['server', 'Primavera P6 EPPM'], ['server', 'Autodesk APS (BIM/CAD)'], ['server', 'Oracle ERP / CRM'], ['globe', 'السلع · أسعار الصرف · الأرصاد · GIS']] },
  { no: '02', title: 'التحقق والتنظيف', desc: 'فحص المخطط، إزالة التكرار، الاكتمال والاتساق — لا يصل سجل إلى المحرك قبل اجتيازها.', tone: 'var(--critical)', nodes: [['list', 'مخطط البيانات'], ['copy', 'إزالة التكرار'], ['badge-check', 'الاكتمال'], ['sliders', 'الاتساق']] },
  { no: '03', title: 'بحيرة بيانات المخاطر', desc: 'بيانات مهيكلة وغير مهيكلة، مُوحَّدة ومُصدَّرة (versioned) وقابلة للتدقيق.', tone: 'var(--s7)', nodes: [['database', 'سجلات مهيكلة'], ['file-text', 'مستندات وصور'], ['clock', 'إصدارات زمنية'], ['shield-alert', 'مسار تدقيق كامل']] },
  { no: '04', title: 'محرك المخاطر بخمسة خطوط', desc: 'خمسة نماذج على طبقة تسجيل وتفسير مشتركة: درجة 0–100 + تفسير بلغة واضحة.', tone: 'var(--brand)', engine: true },
  { no: '05', title: 'التصنيف والتنبيه → قمرة القيادة', desc: 'النوع (مالي/سلامة/تأخير/نزاع) والتقييم (أحمر/أصفر/أخضر)، ثم قائمة التنبيهات، الكتابة العكسية، ومهام المعالجة.', tone: 'var(--good)', nodes: [['tag', 'منطق التصنيف الخلفي'], ['bell', 'التنبيه والتصعيد'], ['refresh', 'الكتابة العكسية إلى Biltix PM'], ['file-check', 'مهام المعالجة'], ['radar', 'قمرة القيادة']] },
];

const safe = (fn, fallback) => { try { const v = fn(); return v === undefined ? fallback : v; } catch { return fallback; } };
const arr = (v) => (Array.isArray(v) ? v : []);
const num = (v, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);
const asPct = (v) => { const n = num(v); return n <= 1 ? n * 100 : n; };

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
    const params = ctx.params || {};

    /* ───────────────────────── helpers ───────────────────────── */

    const mono = (text, extra = []) => h('span', { class: ['mono', 'num', ...arr(extra)] }, String(text ?? '—'));
    const statusOf = (p) => STATUS[p && p.status] || { label: p && p.status ? String(p.status) : '—', tone: 'neutral' };
    const now = () => (typeof store.now === 'function' ? store.now() : new Date());

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

    /** Meter with threshold tones; prefers charts.meter, falls back to the `.meter` chrome. */
    function meter({ value, max = 100, label, thresholds, format }) {
      const v = Math.max(0, Math.min(max, num(value)));
      const tone = (thresholds.find((t) => v <= t.upTo) || thresholds[thresholds.length - 1]).tone;
      const c = makeChart('meter', { value: v, max, label, thresholds, height: 8 });
      const valueText = format ? format(v) : fmt.num(v, { maximumFractionDigits: 1 });
      const head = h('div', { class: 'meter-head' }, h('span', {}, label), h('span', { class: 'row gap-1' }, glyph(tone, 12), h('span', { class: 'meter-value' }, valueText)));
      if (c) return h('div', { class: ['meter', `tone-${tone}`] }, head, c.el);
      const el = h('div', { class: ['meter', `tone-${tone}`], role: 'meter', 'aria-valuemin': '0', 'aria-valuemax': String(max), 'aria-valuenow': String(v), 'aria-label': label, 'aria-valuetext': valueText });
      el.append(head, h('div', { class: 'meter-track' }, h('div', { class: 'meter-fill', style: { inlineSize: `${((v / max) * 100).toFixed(1)}%`, background: 'var(--tone)' } })));
      return el;
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
    function pushAudit(entry) {
      if (typeof store.pushAudit === 'function') { try { store.pushAudit(entry); } catch { /* ignore */ } }
    }

    function retrain(p) {
      if (retrainTimers.has(p.id)) return;
      updatePipeline(p.id, { status: 'training', lastRun: now().toISOString() });
      pushAudit({ actor: 'المستخدم الحالي', action: 'model-update', target: p.name || p.id, detail: `بدء إعادة تدريب ${p.nameAr || p.name} (${p.version || ''}) بالبيانات المعتمدة من طبقة التحقق` });
      toast(`بدأت إعادة تدريب «${p.nameAr || p.name}» — تستغرق المحاكاة نحو 10 ثوانٍ`, { tone: 'accent' });
      const timer = setTimeout(() => {
        retrainTimers.delete(p.id);
        const nextVersion = bumpVersion(p.version);
        try {
          updatePipeline(p.id, { status: 'running', version: nextVersion, lastRun: now().toISOString(), driftScore: Math.max(0.02, num(p.driftScore) * 0.35), calibrationError: Math.max(0.01, num(p.calibrationError) * 0.7) });
          pushAudit({ actor: 'النظام', action: 'model-update', target: p.name || p.id, detail: `اكتملت إعادة التدريب — الإصدار ${nextVersion}؛ انخفض الانجراف وخطأ المعايرة` });
          toast(`اكتملت إعادة تدريب «${p.nameAr || p.name}» — الإصدار ${nextVersion}`, { tone: 'good' });
        } catch { /* store gone */ }
      }, 10_000);
      retrainTimers.set(p.id, timer);
    }
    function togglePause(p) {
      const pausing = p.status !== 'idle';
      updatePipeline(p.id, { status: pausing ? 'idle' : 'running', lastRun: pausing ? p.lastRun : now().toISOString() });
      pushAudit({ actor: 'المستخدم الحالي', action: 'config', target: p.name || p.id, detail: pausing ? `إيقاف مؤقت لخط ${p.nameAr || p.name} — لن تُسجَّل مخاطر جديدة منه` : `استئناف خط ${p.nameAr || p.name}` });
      toast(pausing ? `تم إيقاف «${p.nameAr || p.name}» مؤقتاً` : `تم استئناف «${p.nameAr || p.name}»`, { tone: pausing ? 'warning' : 'good' });
    }

    /* ───────────────────────── data ───────────────────────── */

    function collect() {
      const state = store.state;
      const plat = safe(() => psel.platform(state), null) || state.platform || {};
      let pipelines = safe(() => psel.pipelineHealth(state), null);
      if (!Array.isArray(pipelines) || !pipelines.length) pipelines = arr(plat.pipelines);
      pipelines = pipelines.map((p) => ({ ...p, _tone: healthTone(p) }));
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
        risks30: pipelines.reduce((a, p) => a + num(p.risksLast30d), 0),
        overrides30: pipelines.reduce((a, p) => a + num(p.overridesLast30d), 0),
        acceptance: pipelines.length ? pipelines.reduce((a, p) => a + num(p.acceptanceRatePct), 0) / pipelines.length : 0,
        running: pipelines.filter((p) => p.status === 'running').length,
        meanLatency: pipelines.length ? pipelines.reduce((a, p) => a + num(p.avgLatencyMs), 0) / pipelines.length : 0,
      };
      const validation = safe(() => psel.validationSummary(state), null);
      return { state, plat, pipelines, alertThreshold, criticalThreshold, range, audit, auditAll, actionCounts, totals, validation };
    }

    /* ───────────────────────── sections ───────────────────────── */

    function buildHead(data) {
      const t = data.totals;
      return h('div', { class: 'view-head' },
        h('div', { class: 'view-head-text' },
          h('span', { class: 'code-tag' }, 'PLT-01'),
          h('h1', { tabindex: '-1' }, 'محرك الذكاء الاصطناعي والتفسير'),
          h('p', { class: 'view-lead' }, 'خمسة خطوط نمذجة على طبقة تسجيل وتفسير مشتركة: كل مخاطرة تحصل على درجة 0–100، نوع، تقييم لوني، وتفسير بلغة واضحة يسمي البند أو السطر أو النشاط الذي أثارها — مع الإنسان في الحلقة لكل قرار.'),
        ),
        h('div', { class: 'view-actions' },
          badge(`${fmt.num(t.running)} / ${fmt.num(data.pipelines.length)} خطوط تعمل`, t.running === data.pipelines.length ? 'good' : 'warning'),
          h('span', { class: 'text-sm muted' }, `${fmt.num(t.runsToday)} تشغيلة اليوم · زمن استجابة ${fmt.num(t.meanLatency)} مللي ثانية`),
        ),
      );
    }

    function buildMap(data) {
      const map = h('div', { class: 'pipeline-map', role: 'group', 'aria-label': 'معمارية المنصة: خمس طبقات من التكامل إلى قمرة القيادة' });
      LAYERS.forEach((layer, i) => {
        const nodes = h('div', { class: 'pipeline-layer-nodes' });
        if (layer.engine) {
          data.pipelines.forEach((p) => {
            const st = statusOf(p);
            nodes.appendChild(h('button', { type: 'button', class: ['pipeline-node', 'is-model'], 'aria-label': `الانتقال إلى بطاقة ${p.nameAr || p.name}`, onClick: () => { const el = root.querySelector(`#pipe-${CSS.escape(p.id)}`); if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'start' }); const title = el.querySelector('.card-title'); if (title) { title.setAttribute('tabindex', '-1'); title.focus({ preventScroll: true }); } } } },
              h('span', { class: 'row gap-2' }, liveDot(st.tone === 'neutral' ? 'neutral' : st.tone), svgIcon(PIPELINE_ICON[p.id] || 'sliders', 14), h('span', { class: 'pipeline-node-title' }, p.nameAr || p.name || p.id)),
              h('span', { class: 'pipeline-node-meta' }, mono(p.version || '—'), h('span', {}, st.label), h('span', {}, `${fmt.num(num(p.runsToday))} تشغيلة`)),
            ));
          });
          if (!data.pipelines.length) nodes.appendChild(h('span', { class: 'pipeline-node' }, 'لا توجد خطوط مسجلة'));
          nodes.appendChild(h('span', { class: 'pipeline-node', style: { flexBasis: '100%' } }, svgIcon('sliders', 14), h('span', {}, 'طبقة التسجيل والتفسير المشتركة — درجة 0–100 · معايرة · أهم المحركات')));
        } else {
          layer.nodes.forEach(([icon, label]) => nodes.appendChild(h('span', { class: 'pipeline-node' }, svgIcon(icon, 14), h('span', {}, label))));
          if (i === 1 && data.validation) nodes.appendChild(badge(`معدل الاجتياز ${fmt.pct(num(data.validation.passRatePct), 1)}`, num(data.validation.passRatePct) >= 97 ? 'good' : 'warning'));
        }
        map.appendChild(h('div', { class: ['pipeline-layer', layer.engine ? 'is-engine' : null], 'data-layer': layer.no, style: { '--layer-tone': layer.tone } },
          h('div', { class: 'pipeline-layer-head' }, h('span', { class: 'pipeline-layer-no' }, `LAYER ${layer.no}`), h('h3', { class: 'pipeline-layer-title' }, layer.title), h('p', { class: 'pipeline-layer-desc' }, layer.desc)),
          nodes,
        ));
        if (i < LAYERS.length - 1) map.appendChild(h('div', { class: 'pipeline-connector', 'aria-hidden': 'true' }, liveDot('accent')));
      });
      return card({
        code: 'ENG-00', title: 'خريطة خطوط المعالجة', subtitle: 'من موصلات التكامل إلى قمرة القيادة — انقر على أي خط للانتقال إلى بطاقته',
        body: map,
        footer: h('p', { class: 'text-xs muted' }, 'المنصة تقرأ من أنظمة العميل فقط؛ ما يُكتب عكسياً هو أعلام المخاطر والدرجات والتنبيهات ومهام المعالجة.'),
      });
    }

    function buildPipelineCard(data, p, span) {
      const st = statusOf(p);
      const precision = asPct(p.precision); const recall = asPct(p.recall);
      const calib = asPct(p.calibrationError); const drift = Math.max(0, Math.min(100, num(p.driftScore) * 100));
      const meters = h('div', { class: 'engine-meters' },
        meter({ value: precision, label: 'الدقة (Precision)', thresholds: [{ upTo: 74.99, tone: 'critical' }, { upTo: 84.99, tone: 'warning' }, { upTo: 100, tone: 'good' }], format: (v) => fmt.pct(v, 1) }),
        meter({ value: recall, label: 'الاستدعاء (Recall)', thresholds: [{ upTo: 74.99, tone: 'critical' }, { upTo: 84.99, tone: 'warning' }, { upTo: 100, tone: 'good' }], format: (v) => fmt.pct(v, 1) }),
        meter({ value: calib, max: 25, label: 'خطأ المعايرة (ECE)', thresholds: [{ upTo: 5, tone: 'good' }, { upTo: 10, tone: 'warning' }, { upTo: 25, tone: 'critical' }], format: (v) => fmt.pct(v, 1) }),
        meter({ value: drift, label: 'انجراف البيانات', thresholds: [{ upTo: 20, tone: 'good' }, { upTo: 40, tone: 'warning' }, { upTo: 100, tone: 'critical' }], format: (v) => fmt.num(v / 100, { maximumFractionDigits: 2, minimumFractionDigits: 2 }) }),
      );
      const meta = h('div', { class: 'engine-meta' },
        ...[
          ['الإصدار', mono(p.version || '—')],
          ['آخر تشغيل', h('span', { title: fmt.dateTime(p.lastRun) }, fmt.relative(p.lastRun))],
          ['تشغيلات اليوم', mono(fmt.num(num(p.runsToday)))],
          ['زمن الاستجابة', mono(`${fmt.num(num(p.avgLatencyMs))} ms`)],
          ['مخاطر 30 يوماً', mono(fmt.num(num(p.risksLast30d)))],
        ].map(([label, value]) => h('div', { class: 'engine-meta-cell' }, h('span', { class: 'engine-meta-label' }, label), h('span', { class: 'engine-meta-value' }, value))),
      );

      const fi = arr(p.featureImportance).slice().sort((a, b) => num(b.weight) - num(a.weight)).slice(0, 6);
      const fiMax = fi.reduce((a, f) => Math.max(a, num(f.weight)), 0) || 1;
      const fiChart = fi.length ? makeChart('barChart', { items: fi.map((f, i) => ({ id: `${p.id}-f${i}`, label: f.feature, value: Number((num(f.weight) <= 1 ? num(f.weight) * 100 : num(f.weight)).toFixed(1)) })), horizontal: true, height: fi.length * 28 + 24, valueFormat: (v) => fmt.pct(v, 0), color: 'var(--s1)', showValues: true, maxBars: 6, ariaLabel: `أهمية الميزات — ${p.nameAr || p.name}` }) : null;
      const fiFallback = fi.length ? h('div', { class: 'bar-pair' }, ...fi.map((f) => h('div', { class: 'bar-pair-row', style: { gridTemplateColumns: 'minmax(0, 11em) minmax(0, 1fr) 3em' } }, h('span', { class: 'truncate', title: f.feature }, f.feature), h('div', { class: 'progress tone-brand', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': String(Math.round((num(f.weight) / fiMax) * 100)), 'aria-label': f.feature }, h('div', { class: 'progress-bar', style: { inlineSize: `${((num(f.weight) / fiMax) * 100).toFixed(1)}%` } })), h('span', { class: 'progress-value' }, fmt.pct(num(f.weight) <= 1 ? num(f.weight) * 100 : num(f.weight), 0))))) : emptyState({ title: 'لا تتوفر أهمية الميزات' });

      const acc = Math.max(0, Math.min(100, num(p.acceptanceRatePct)));
      const segParts = [{ id: 'accept', label: 'قبول التوصية', value: Number(acc.toFixed(1)), color: 'var(--s1)' }, { id: 'override', label: 'تعديل أو تجاوز', value: Number((100 - acc).toFixed(1)), color: 'var(--s2)' }];
      const seg = makeChart('segmentedBar', { parts: segParts, tall: true, valueFormat: (v) => fmt.pct(v, 0), ariaLabel: `القبول مقابل التجاوز — ${p.nameAr || p.name}` });
      const segFallback = h('div', { class: 'segbar' }, h('div', { class: 'segbar-track' }, ...segParts.map((s) => h('div', { class: 'segbar-part', style: { flex: `${s.value} 1 0`, '--part': s.color }, title: `${s.label}: ${fmt.pct(s.value, 0)}` }, h('span', { class: 'segbar-label' }, fmt.pct(s.value, 0))))), h('div', { class: 'legend' }, ...segParts.map((s) => h('span', { class: 'legend-item' }, h('span', { class: 'legend-key', style: { background: s.color } }), h('span', { class: 'legend-label' }, s.label)))));

      const kris = arr(p.kris);
      const kriTable = dataTable({ dense: true, pageSize: 0, emptyText: 'لا تتوفر مصفوفة مؤشرات لهذا الخط', caption: `مصفوفة مؤشرات المخاطر — ${p.nameAr || p.name}`, columns: [
        { key: 'indicator', label: 'المؤشر', sortable: false, render: (r) => h('span', { class: 'semibold' }, r.indicator || '—') },
        { key: 'technique', label: 'التقنية', sortable: false, render: (r) => r.technique || '—' },
        { key: 'inputs', label: 'المدخلات', sortable: false, render: (r) => (Array.isArray(r.inputs) ? r.inputs.join(' · ') : (r.inputs || '—')) },
        { key: 'mitigation', label: 'المعالجة', sortable: false, render: (r) => r.mitigation || '—' },
      ], rows: kris.map((k, i) => ({ id: `${p.id}-k${i}`, ...k })) });
      kriTable.table.classList.add('kri-table');
      const details = h('details', { class: 'engine-kri', open: openKri.has(p.id), onToggle: (e) => { if (e.target.open) openKri.add(p.id); else openKri.delete(p.id); } }, h('summary', {}, h('span', {}, `مصفوفة مؤشرات المخاطر (KRI) — ${fmt.num(kris.length)} مؤشرات`)), kriTable.el);

      const isTraining = p.status === 'training' || retrainTimers.has(p.id);
      const actions = h('div', { class: 'row wrap gap-2' },
        button(isTraining ? 'جارٍ التدريب…' : 'إعادة تدريب', { variant: 'outline', size: 'sm', icon: 'refresh', onClick: () => retrain(p), attrs: { disabled: isTraining, 'aria-busy': isTraining ? 'true' : undefined } }),
        button(p.status === 'idle' ? 'استئناف' : 'إيقاف مؤقت', { variant: p.status === 'idle' ? 'primary' : 'ghost', size: 'sm', icon: p.status === 'idle' ? 'play' : 'pause', onClick: () => togglePause(p), attrs: { disabled: isTraining } }),
        h('span', { class: 'toolbar-spacer' }),
        button('المخاطر المكتشفة', { variant: 'ghost', size: 'sm', icon: 'shield-alert', onClick: () => router.navigate('airisks', { pipeline: p.id }) }),
      );

      return card({
        id: `pipe-${p.id}`, code: String(p.id || '').toUpperCase(), title: p.nameAr || p.name || p.id,
        subtitle: [p.name, p.description].filter(Boolean).join(' — '),
        className: span,
        actions: [badge(st.label, st.tone), liveDot(p._tone)],
        body: h('div', { class: 'stack gap-4' },
          meta,
          arr(p.techniques).length ? h('div', { class: 'chip-group' }, ...arr(p.techniques).map((t) => h('span', { class: 'chip is-sm', role: 'listitem' }, svgIcon('sliders', 12), h('span', {}, String(t))))) : null,
          meters,
          h('div', { class: 'stack gap-2' }, h('span', { class: 'text-sm semibold' }, 'أهمية الميزات (محركات الدرجة)'), fiChart ? fiChart.el : fiFallback),
          h('div', { class: 'stack gap-2' }, h('div', { class: 'row between wrap' }, h('span', { class: 'text-sm semibold' }, 'الإنسان في الحلقة: القبول مقابل التجاوز'), h('span', { class: 'text-xs muted' }, `${fmt.num(num(p.overridesLast30d))} تجاوزاً من ${fmt.num(num(p.risksLast30d))} مخاطرة خلال 30 يوماً`)), seg ? seg.el : segFallback),
          details,
        ),
        footer: actions,
        tableView: fi.length ? () => simpleTable(['الميزة', 'الوزن'], fi.map((f) => [f.feature, fmt.pct(num(f.weight) <= 1 ? num(f.weight) * 100 : num(f.weight), 1)])) : null,
      });
    }

    function buildPipelines(data) {
      const spans = ['col-span-4', 'col-span-4', 'col-span-4', 'col-span-6', 'col-span-6'];
      const cards = data.pipelines.map((p, i) => buildPipelineCard(data, p, spans[i] || 'col-span-6'));
      if (!cards.length) return card({ code: 'ENG-01', title: 'خطوط المعالجة', body: emptyState({ title: 'لا توجد خطوط نمذجة مسجلة', text: 'تأكد من تحميل بيانات المنصة.' }) });
      return h('div', { class: 'grid-12' }, ...cards);
    }

    function buildExplainability(data) {
      const steps = [
        ['المدخلات المعتمدة', 'يستقبل كل خط فقط السجلات التي اجتازت طبقة التحقق، ويحوّلها إلى ميزات (features) موصوفة بالعربية: مدة سداد البند، نسبة انحراف الكمية، احتمال التأخير، قراءة الحساس…'],
        ['التقدير ثم المعايرة', 'يُنتج النموذج احتمالاً أو تقديراً خاماً، ثم تُعايره طبقة التسجيل المشتركة على بيانات الأثر التاريخية ليصبح درجة من 0 إلى 100 قابلة للمقارنة بين الخطوط الخمسة.'],
        ['التصنيف الخلفي', `تُسند الدرجة إلى نوع (مالي / سلامة / تأخير / نزاع) وتقييم لوني: أحمر ≥ 70، أصفر 40–69، أخضر < 40. ما يتجاوز ${fmt.num(data.alertThreshold)} يدخل قائمة التنبيهات، وما يبلغ ${fmt.num(data.criticalThreshold)} فأكثر يُصعَّد فوراً.`],
        ['تفسير المحرك', 'تُترجم أعلى ثلاث ميزات مساهمة (قيم شابلي التقريبية) إلى جملة واحدة تسمي البند أو السطر أو النشاط أو القراءة المحددة وسبب أهميتها — مع نسبة ثقة النموذج وإصداره.'],
        ['الإنسان في الحلقة', 'كل قبول أو تعديل أو تجاوز للتوصية يُسجَّل في سجل التدقيق مع السبب، ويُعاد تغذيته لإعادة معايرة النموذج في دورة التدريب التالية.'],
      ];
      return card({
        code: 'ENG-06', title: 'كيف تُحسب الدرجة ويُصاغ التفسير', subtitle: 'طبقة التفسير المشتركة لجميع الخطوط',
        className: 'col-span-5',
        body: h('div', { class: 'stack gap-4' },
          h('ol', { class: 'explain-steps' }, ...steps.map(([t, d]) => h('li', {}, h('div', { class: 'stack', style: { gap: '2px' } }, h('span', { class: 'text-sm semibold' }, t), h('span', { class: 'text-xs ink-2', style: { lineHeight: '1.6' } }, d))))),
          h('div', { class: 'row wrap gap-2', 'aria-label': 'نطاقات التقييم' },
            (() => { const b = badge('أحمر ≥ 70 — تدخل فوري', 'critical'); b.classList.add('rating', 'is-red'); return b; })(),
            (() => { const b = badge('أصفر 40–69 — مراقبة', 'warning'); b.classList.add('rating', 'is-yellow'); return b; })(),
            (() => { const b = badge('أخضر < 40 — ضمن حدود التحمل', 'good'); b.classList.add('rating', 'is-green'); return b; })(),
          ),
          h('div', { class: 'note', style: { '--tone': 'var(--brand)' } }, h('strong', {}, 'العتبات الحالية: '), `تنبيه > ${fmt.num(data.alertThreshold)} · تصعيد فوري ≥ ${fmt.num(data.criticalThreshold)}. `, button('تعديل العتبات', { variant: 'ghost', size: 'sm', icon: 'bell', onClick: () => router.navigate('alerts') })),
        ),
      });
    }

    function buildAudit(data) {
      const rows = auditFilter === 'all' ? data.audit : data.audit.filter((e) => e.action === auditFilter);
      const chips = h('div', { class: 'chip-group', role: 'group', 'aria-label': 'تصفية سجل التدقيق' },
        h('button', { type: 'button', class: ['chip', 'is-sm', auditFilter === 'all' ? 'is-active' : null], 'aria-pressed': auditFilter === 'all' ? 'true' : 'false', onClick: () => { auditFilter = 'all'; schedule(); } }, h('span', {}, 'الكل'), h('span', { class: 'chip-count' }, fmt.num(data.audit.length))),
        ...Object.entries(ACTION).filter(([k]) => data.actionCounts[k]).map(([k, a]) => h('button', { type: 'button', class: ['chip', 'is-sm', `tone-${a.tone}`, auditFilter === k ? 'is-active' : null], 'aria-pressed': auditFilter === k ? 'true' : 'false', onClick: () => { auditFilter = k; schedule(); } }, glyph(a.tone, 12), h('span', {}, a.label), h('span', { class: 'chip-count' }, fmt.num(data.actionCounts[k])))),
      );
      const table = dataTable({
        dense: true, pageSize: 10, emptyText: `لا توجد أحداث خلال آخر ${fmt.num(data.range)} يوماً`, caption: 'سجل التدقيق',
        columns: [
          { key: 'at', label: 'الوقت', render: (e) => h('span', { class: 'text-xs nowrap', title: fmt.dateTime(e.at) }, fmt.dateTime(e.at)), sortValue: (e) => Date.parse(e.at) || 0 },
          { key: 'actor', label: 'المنفّذ', render: (e) => e.actor || '—' },
          { key: 'action', label: 'الإجراء', render: (e) => { const a = ACTION[e.action] || { label: e.action || '—', tone: 'neutral' }; return badge(a.label, a.tone); } },
          { key: 'target', label: 'الهدف', mono: true, render: (e) => mono(e.target || '—') },
          { key: 'detail', label: 'التفاصيل', sortable: false, render: (e) => h('span', { class: 'text-sm' }, e.detail || '—') },
        ],
        rows: rows.map((e, i) => ({ id: e.id || `a-${i}`, ...e })), initialSort: { key: 'at', dir: 'desc' },
      });
      return card({
        id: 'engine-audit', code: 'ENG-07', title: 'سجل التدقيق والإصدارات', subtitle: `التجاوزات، الكتابة العكسية وتحديثات النماذج خلال آخر ${fmt.num(data.range)} يوماً`,
        className: 'col-span-7',
        actions: [h('span', { class: 'text-sm muted' }, `${fmt.num(data.auditAll.length)} حدثاً إجمالاً`)],
        body: h('div', { class: 'stack gap-3' }, chips, table.el),
      });
    }

    /* ───────────────────────── build ───────────────────────── */

    function build() {
      raf = 0;
      const data = collect();
      const frag = document.createDocumentFragment();
      frag.append(
        buildHead(data),
        buildMap(data),
        buildPipelines(data),
        h('div', { class: 'grid-12' }, buildExplainability(data), buildAudit(data)),
      );
      root.replaceChildren(frag);
    }

    function schedule() {
      if (raf) return;
      raf = requestAnimationFrame(build);
    }

    const NOISY = /^(feed|sensors|integrations)/;
    const unsubs = [
      bus.on('store:change', (payload) => { const path = payload && payload.path ? String(payload.path) : '*'; if (!NOISY.test(path)) schedule(); }),
      bus.on('filters:change', (payload) => { const key = payload && payload.key; if (!key || key === 'range') schedule(); }),
      bus.on('settings:change', () => schedule()),
    ];

    build();

    // Deep links: ?pipeline=ID scrolls to the card, ?section=audit to the log.
    requestAnimationFrame(() => {
      const target = params.pipeline ? root.querySelector(`#pipe-${CSS.escape(String(params.pipeline))}`) : (params.section === 'audit' ? root.querySelector('#engine-audit') : null);
      if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });

    return () => {
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      unsubs.forEach((u) => { try { if (typeof u === 'function') u(); } catch { /* ignore */ } });
      root.remove();
    };
  },
};
