/**
 * Biltix Risk AI — view: جودة البيانات وطبقة التحقق (js/views/dataquality.js) — PLT-02
 *
 * The Data Validation & Cleansing layer: nothing reaches the AI engine before passing
 * schema / de-duplication / completeness / consistency checks. The view shows the gate's
 * position in the end-to-end flow, today's throughput, per-source quality, the rule set
 * with enable toggles (store.updateValidationRule / updateValidation) and the quarantine
 * queue with resolve actions (store.resolveQuarantine).
 *
 * DOM structures follow css/platform.css (.validation-gate, ul.quarantine-list >
 * li.quarantine-item[data-status]); Part A chrome (.stepper, .meter, .switch) is reused.
 *
 * Contract: docs/ARCHITECTURE.md §4 (components), §5 (charts), B3 (validation), B4
 * (psel.validationSummary), B5 (store methods), B9.10. Data reaches the DOM only through
 * textContent / components.h. No cross-view imports.
 */

const FLOW_STAGES = ['مُلتقط', 'مُتحقق', 'في بحيرة البيانات', 'مُقيَّم', 'مُصنَّف', 'تنبيه', 'مهمة', 'مغلق'];
const GATE_INDEX = 1;
const RULE_TYPE = {
  schema: { label: 'مخطط البيانات', icon: 'list', hint: 'الأنواع والحقول الإلزامية والنطاقات' },
  dedupe: { label: 'إزالة التكرار', icon: 'copy', hint: 'مطابقة السجلات المكررة عبر المصادر' },
  completeness: { label: 'الاكتمال', icon: 'badge-check', hint: 'نسبة الحقول المعبأة في كل سجل' },
  consistency: { label: 'الاتساق', icon: 'sliders', hint: 'توافق القيم بين الأنظمة (مثل الكميات والتواريخ)' },
};
const Q_STATUS = { 'معلّق': 'warning', 'مُصحح': 'good', 'مرفوض': 'neutral' };
const Q_FILTERS = [{ value: 'all', label: 'الكل' }, { value: 'معلّق', label: 'معلّق' }, { value: 'مُصحح', label: 'مُصحح' }, { value: 'مرفوض', label: 'مرفوض' }];
const Q_PAGE = 8;

const safe = (fn, fallback) => { try { const v = fn(); return v === undefined ? fallback : v; } catch { return fallback; } };
const arr = (v) => (Array.isArray(v) ? v : []);
const num = (v, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);
const pctTone = (p, good = 97, warn = 92) => (p >= good ? 'good' : (p >= warn ? 'warning' : 'critical'));

export default {
  id: 'dataquality',
  code: 'PLT-02',
  title: 'جودة البيانات وطبقة التحقق',
  icon: 'badge-check',

  render(container, ctx) {
    const { store, bus, fmt, charts, components, psel, router } = ctx;
    const { h, card, statTile, badge, dataTable, button, toast, emptyState, svgIcon, glyph } = components;

    const root = h('section', { class: 'view view-dataquality' });
    container.appendChild(root);

    let raf = 0;
    let quarantineFilter = 'all';
    let quarantineLimit = Q_PAGE;
    let restoreFocusId = null;

    /* ───────────────────────── helpers ───────────────────────── */

    const mono = (text, extra = []) => h('span', { class: ['mono', 'num', ...arr(extra)] }, String(text ?? '—'));
    const pct = (v, d = 1) => fmt.pct(num(v), d);

    function makeChart(name, opts) {
      if (!charts || typeof charts[name] !== 'function') return null;
      try { const c = charts[name](opts); return c && c.el instanceof Node ? c : null; } catch (err) { console.warn(`[dataquality] charts.${name} failed`, err); return null; }
    }
    const chartOr = (chart, fallback) => (chart ? chart.el : (fallback || emptyState({ title: 'الرسم غير متاح حالياً', text: 'استخدم عرض الجدول للاطلاع على البيانات.' })));
    const tableOf = (chart, fallbackFn) => () => {
      if (chart && typeof chart.table === 'function') { const t = safe(() => chart.table(), null); if (t instanceof Node) return t; }
      return fallbackFn ? fallbackFn() : h('table');
    };
    function simpleTable(headers, rows) {
      const table = h('table', { class: 'table is-dense' });
      table.appendChild(h('thead', {}, h('tr', {}, ...headers.map((t) => h('th', { scope: 'col' }, String(t))))));
      table.appendChild(h('tbody', {}, ...rows.map((r) => h('tr', {}, ...r.map((c) => h('td', {}, c instanceof Node ? c : String(c ?? '—')))))));
      return table;
    }

    /** Inline meter: `.meter` chrome from charts.css, tone by thresholds (icon + value beside it where shown). */
    function meter(value, { max = 100, tone = null, label = '' } = {}) {
      const v = Math.max(0, Math.min(max, num(value)));
      const t = tone || pctTone(v);
      const el = h('div', { class: ['meter', 'is-inline', `tone-${t}`], role: 'meter', 'aria-valuemin': '0', 'aria-valuemax': String(max), 'aria-valuenow': String(v), 'aria-label': label || undefined, 'aria-valuetext': pct(v) });
      el.appendChild(h('div', { class: 'meter-track' }, h('div', { class: 'meter-fill', style: { inlineSize: `${((v / max) * 100).toFixed(1)}%`, background: 'var(--tone)' } })));
      return el;
    }

    function switchBtn({ id, on, label, onToggle }) {
      return h('button', { type: 'button', id, role: 'switch', class: ['switch', on ? 'is-on' : null], 'aria-checked': on ? 'true' : 'false', 'aria-label': label, title: label, onClick: () => onToggle(!on) });
    }

    /* ───────────────────────── store bridges (contract B5 with safe fallbacks) ───────────────────────── */

    function setRuleEnabled(rule, enabled, rules) {
      if (typeof store.updateValidationRule === 'function') { store.updateValidationRule(rule.id, { enabled }); return; }
      const next = rules.map((x) => (x.id === rule.id ? { ...x, enabled } : x));
      if (typeof store.updateValidation === 'function') { store.updateValidation({ rules: next }); return; }
      store.update((s) => { if (!s.platform) s.platform = {}; if (!s.platform.validation) s.platform.validation = {}; s.platform.validation.rules = next; return 'platform.validation.rules'; });
    }
    function resolveQuarantine(id, status) {
      if (typeof store.resolveQuarantine === 'function') { store.resolveQuarantine(id, status, 'مسؤول جودة البيانات'); return; }
      store.update((s) => { const q = arr(s.platform && s.platform.validation && s.platform.validation.quarantine).find((x) => x.id === id); if (q) { q.status = status; q.resolvedAt = new Date().toISOString(); } return 'platform.validation.quarantine'; });
    }

    /* ───────────────────────── data ───────────────────────── */

    function collect() {
      const state = store.state;
      const plat = safe(() => psel.platform(state), null) || state.platform || {};
      const validation = plat.validation || {};
      const sourcesList = arr(validation.sources);
      const rules = arr(validation.rules);
      const quarantine = arr(validation.quarantine).slice().sort((a, b) => (Date.parse(b.at) || 0) - (Date.parse(a.at) || 0));

      let summary = safe(() => psel.validationSummary(state), null);
      if (!summary || !Number.isFinite(Number(summary.recordsIn))) {
        const recordsIn = sourcesList.reduce((a, s) => a + num(s.recordsIn), 0);
        const passed = sourcesList.reduce((a, s) => a + num(s.passed), 0);
        const rejected = sourcesList.reduce((a, s) => a + num(s.rejected), 0);
        const deduplicated = sourcesList.reduce((a, s) => a + num(s.deduplicated), 0);
        const mean = (k) => (sourcesList.length ? sourcesList.reduce((a, s) => a + num(s[k]), 0) / sourcesList.length : 0);
        summary = { recordsIn, passed, rejected, deduplicated, passRatePct: recordsIn ? (passed / recordsIn) * 100 : 0, completenessPct: mean('completenessPct'), consistencyPct: mean('consistencyPct'), quarantineOpen: quarantine.filter((q) => q.status === 'معلّق').length, bySource: sourcesList };
      }
      const bySource = (Array.isArray(summary.bySource) && summary.bySource.length ? summary.bySource : sourcesList).map((s) => ({ ...s, passRatePct: num(s.passRatePct, num(s.recordsIn) ? (num(s.passed) / num(s.recordsIn)) * 100 : 0) }));
      const sourceName = (id) => { const s = sourcesList.find((x) => x.id === id); return s ? s.name : (id || '—'); };

      const reasons = Object.values(quarantine.filter((q) => q.status === 'معلّق').reduce((acc, q) => { const k = q.reason || 'غير محدد'; acc[k] = acc[k] || { id: k, label: k, value: 0 }; acc[k].value += 1; return acc; }, {})).sort((a, b) => b.value - a.value);
      const enabledRules = rules.filter((r) => r.enabled !== false).length;
      const hitsToday = rules.reduce((a, r) => a + num(r.hitsToday), 0);
      const lastBatch = sourcesList.map((s) => Date.parse(s.lastBatch) || 0).reduce((a, b) => Math.max(a, b), 0);

      return { state, plat, validation, sourcesList, rules, quarantine, summary, bySource, sourceName, reasons, enabledRules, hitsToday, lastBatch: lastBatch ? new Date(lastBatch).toISOString() : null };
    }

    /* ───────────────────────── sections ───────────────────────── */

    function buildHead(data) {
      const s = data.summary;
      return h('div', { class: 'view-head' },
        h('div', { class: 'view-head-text' },
          h('span', { class: 'code-tag' }, 'PLT-02'),
          h('h1', { tabindex: '-1' }, 'جودة البيانات وطبقة التحقق'),
          h('p', { class: 'view-lead' }, 'الطبقة الثانية من المعمارية: فحص المخطط، إزالة التكرار، الاكتمال والاتساق لكل سجل وارد من موصلات التكامل قبل إيداعه في بحيرة بيانات المخاطر.'),
        ),
        h('div', { class: 'view-actions' },
          badge(`معدل الاجتياز ${pct(s.passRatePct)}`, pctTone(num(s.passRatePct))),
          data.lastBatch ? h('span', { class: 'text-xs muted' }, 'آخر دفعة: ', h('span', { title: fmt.dateTime(data.lastBatch) }, fmt.relative(data.lastBatch))) : null,
          button('سجل التدقيق', { variant: 'ghost', size: 'sm', icon: 'sliders', onClick: () => router.navigate('engine', { section: 'audit' }) }),
        ),
      );
    }

    /** .validation-gate principle banner + the 8-stage flow stepper with the gate highlighted. */
    function buildPrinciple(data) {
      const s = data.summary;
      const gate = h('div', { class: 'validation-gate', role: 'note' },
        svgIcon('badge-check', 22),
        h('div', { class: 'stack', style: { gap: '2px' } },
          h('span', {}, h('strong', {}, 'لا يصل أي سجل إلى المحرك قبل اجتياز التحقق.'), ' البوابة تقع بين الالتقاط وبحيرة بيانات المخاطر؛ السجلات المرفوضة تُحجر مع سبب واضح ولا تُغذّي أي خط من خطوط المحرك الخمسة.'),
          h('span', { class: 'text-xs muted' }, `اليوم: ${fmt.num(num(s.recordsIn))} سجلاً وارداً · اجتاز ${fmt.num(num(s.passed))} (${pct(s.passRatePct)}) · رُفض ${fmt.num(num(s.rejected))} · أُزيل ${fmt.num(num(s.deduplicated))} مكرراً`),
        ),
      );
      const stepper = h('ol', { class: ['stepper', 'is-sm', 'flow-gate'], 'aria-label': 'موقع بوابة التحقق في تدفق المخاطر' });
      FLOW_STAGES.forEach((label, i) => {
        const dot = h('span', { class: 'step-dot', 'aria-hidden': 'true' });
        if (i < GATE_INDEX) dot.appendChild(glyph('good', 12));
        else if (i === GATE_INDEX) dot.appendChild(svgIcon('badge-check', 12));
        else dot.textContent = String(i + 1);
        const li = h('li', { class: ['step', i < GATE_INDEX ? 'is-done' : null, i === GATE_INDEX ? 'is-current' : null], 'aria-current': i === GATE_INDEX ? 'step' : undefined }, dot, h('span', { class: 'step-label' }, label));
        if (i === GATE_INDEX) li.appendChild(h('span', { class: 'pipeline-gate', style: { marginBlockStart: '4px' } }, svgIcon('badge-check', 12), h('span', {}, 'بوابة التحقق')));
        stepper.appendChild(li);
      });
      return h('div', { class: 'stack gap-3' }, gate, stepper);
    }

    function buildTiles(data) {
      const s = data.summary;
      const quarantineOpen = num(s.quarantineOpen);
      return h('div', { class: 'kpi-row' },
        statTile({ label: 'السجلات الواردة اليوم', value: num(s.recordsIn), icon: 'erp', hint: `${fmt.num(data.sourcesList.length)} مصادر متصلة` }),
        statTile({ label: 'اجتازت التحقق', value: num(s.passed), icon: 'badge-check', tone: pctTone(num(s.passRatePct)), hint: `معدل الاجتياز ${pct(s.passRatePct)}` }),
        statTile({ label: 'مكررة أُزيلت', value: num(s.deduplicated), icon: 'copy', hint: 'قاعدة إزالة التكرار عبر المصادر' }),
        statTile({ label: 'الاكتمال', value: `${fmt.num(num(s.completenessPct), { maximumFractionDigits: 1 })}%`, icon: 'list', tone: pctTone(num(s.completenessPct), 97, 93), hint: 'متوسط الحقول المعبأة لكل سجل' }),
        statTile({ label: 'الاتساق', value: `${fmt.num(num(s.consistencyPct), { maximumFractionDigits: 1 })}%`, icon: 'sliders', tone: pctTone(num(s.consistencyPct), 97, 93), hint: 'توافق القيم بين الأنظمة المصدرية' }),
        statTile({ label: 'محجورة معلّقة', value: quarantineOpen, icon: 'alert', tone: quarantineOpen ? 'warning' : 'good', hint: quarantineOpen ? 'بانتظار التصحيح أو الرفض' : 'لا توجد سجلات معلّقة', onClick: () => { quarantineFilter = 'معلّق'; schedule(); requestAnimationFrame(() => { const el = root.querySelector('#dq-quarantine'); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' }); }); } }),
      );
    }

    function buildSourcesCard(data) {
      const rows = data.bySource.map((s) => ({ ...s, id: s.id || s.name }));
      const table = dataTable({
        dense: true, pageSize: 0, emptyText: 'لا توجد مصادر بيانات مسجلة', caption: 'جودة البيانات حسب المصدر',
        columns: [
          { key: 'name', label: 'المصدر', render: (r) => h('span', { class: 'row gap-2' }, svgIcon('erp', 14), h('span', { class: 'truncate', title: r.name || '' }, r.name || '—')) },
          { key: 'recordsIn', label: 'واردة', align: 'end', mono: true, render: (r) => fmt.num(num(r.recordsIn)) },
          { key: 'passed', label: 'اجتازت', align: 'end', mono: true, render: (r) => fmt.num(num(r.passed)) },
          { key: 'rejected', label: 'مرفوضة', align: 'end', render: (r) => h('span', { class: ['mono', 'num', num(r.rejected) ? 'tone-warning' : 'tone-good'], style: { color: 'var(--tone-ink)' } }, fmt.num(num(r.rejected))) },
          { key: 'deduplicated', label: 'مكررة', align: 'end', mono: true, render: (r) => fmt.num(num(r.deduplicated)) },
          { key: 'completenessPct', label: 'الاكتمال', width: 130, render: (r) => h('div', { class: 'progress-row' }, meter(r.completenessPct, { label: `اكتمال ${r.name}` }), h('span', { class: 'progress-value' }, pct(r.completenessPct))), sortValue: (r) => num(r.completenessPct) },
          { key: 'consistencyPct', label: 'الاتساق', width: 130, render: (r) => h('div', { class: 'progress-row' }, meter(r.consistencyPct, { label: `اتساق ${r.name}` }), h('span', { class: 'progress-value' }, pct(r.consistencyPct))), sortValue: (r) => num(r.consistencyPct) },
          { key: 'lastBatch', label: 'آخر دفعة', render: (r) => h('span', { class: 'text-xs nowrap', title: fmt.dateTime(r.lastBatch) }, fmt.relative(r.lastBatch)), sortValue: (r) => Date.parse(r.lastBatch) || 0 },
        ],
        rows, initialSort: { key: 'recordsIn', dir: 'desc' },
      });
      return card({ code: 'DQ-01', title: 'الجودة حسب المصدر', subtitle: 'دفعات اليوم من موصلات التكامل — الواردة، المجتازة، المرفوضة، المكررة، ونسب الاكتمال والاتساق', body: table.el });
    }

    function buildPassRateCard(data) {
      const items = data.bySource.slice().sort((a, b) => a.passRatePct - b.passRatePct).map((s) => ({ id: s.id || s.name, label: s.name, value: Number(num(s.passRatePct).toFixed(1)) }));
      const chart = items.length ? makeChart('barChart', { items, horizontal: true, height: Math.max(160, items.length * 30 + 40), valueFormat: (v) => fmt.pct(v, 1), color: 'var(--s1)', showValues: true, maxBars: 12, sorted: false, ariaLabel: 'معدل الاجتياز حسب المصدر' }) : null;
      const weakest = items[0];
      return card({
        code: 'DQ-02', title: 'معدل الاجتياز حسب المصدر', subtitle: weakest ? `الأدنى أولاً — «${weakest.label}» يحتاج تنظيفاً عند المنبع` : 'الأدنى أولاً — المصادر التي تحتاج تنظيفاً عند المنبع',
        className: 'col-span-6',
        body: items.length ? chartOr(chart) : emptyState({ title: 'لا توجد مصادر' }),
        tableView: items.length ? tableOf(chart, () => simpleTable(['المصدر', 'معدل الاجتياز'], items.map((i) => [i.label, fmt.pct(i.value, 1)]))) : null,
      });
    }

    function buildRulesCard(data) {
      const rows = data.rules;
      const table = dataTable({
        dense: true, pageSize: 0, emptyText: 'لا توجد قواعد تحقق', caption: 'قواعد التحقق والتنظيف',
        columns: [
          { key: 'name', label: 'القاعدة', render: (r) => { const t = RULE_TYPE[r.type] || { label: r.type || '—', icon: 'list', hint: '' }; return h('span', { class: 'semibold', title: t.hint || undefined, style: { opacity: r.enabled === false ? '.6' : '1' } }, r.name || '—'); } },
          { key: 'type', label: 'النوع', render: (r) => { const t = RULE_TYPE[r.type] || { label: r.type || '—', icon: 'list' }; return badge(t.label, 'neutral', { icon: t.icon }); } },
          { key: 'hitsToday', label: 'إصابات اليوم', align: 'end', render: (r) => mono(fmt.num(num(r.hitsToday))), sortValue: (r) => num(r.hitsToday) },
          { key: 'enabled', label: 'مفعّلة', align: 'center', sortable: false, render: (r) => h('span', { class: 'row gap-2', style: { justifyContent: 'center' } },
            switchBtn({ id: `rule-${r.id}`, on: r.enabled !== false, label: `${r.enabled !== false ? 'تعطيل' : 'تفعيل'} قاعدة ${r.name || ''}`, onToggle: (next) => {
              restoreFocusId = `rule-${r.id}`;
              setRuleEnabled(r, next, data.rules);
              toast(next ? `تم تفعيل قاعدة «${r.name}»` : `تم تعطيل قاعدة «${r.name}» — ستمر السجلات دون هذا الفحص`, { tone: next ? 'good' : 'warning' });
            } }),
            h('span', { class: 'text-xs muted' }, r.enabled !== false ? 'نعم' : 'لا'),
          ) },
        ],
        rows, initialSort: { key: 'hitsToday', dir: 'desc' },
      });
      return card({
        code: 'DQ-03', title: 'قواعد التحقق', subtitle: 'كل قاعدة تُطبَّق على كل سجل قبل البوابة — عطّل قاعدة لتجاوز فحصها مؤقتاً',
        className: 'col-span-6',
        actions: [badge(`${fmt.num(data.enabledRules)} / ${fmt.num(rows.length)} مفعّلة`, data.enabledRules === rows.length ? 'good' : 'warning'), h('span', { class: 'text-sm muted' }, `${fmt.num(data.hitsToday)} إصابة اليوم`)],
        body: table.el,
      });
    }

    /** li.quarantine-item[data-status] > .quarantine-main + .quarantine-meta + .quarantine-actions (css/platform.css) */
    function quarantineItem(data, q) {
      const tone = Q_STATUS[q.status] || 'neutral';
      const actions = h('div', { class: 'quarantine-actions' });
      if (q.status === 'معلّق') {
        actions.append(
          button('مُصحح', { variant: 'outline', size: 'sm', icon: glyph('good', 14), onClick: () => { resolveQuarantine(q.id, 'مُصحح'); toast(`تم تصحيح السجل ${q.recordRef || ''} وإعادته إلى مسار التحقق`, { tone: 'good' }); } }),
          button('مرفوض', { variant: 'ghost', size: 'sm', icon: glyph('close', 14), onClick: () => { resolveQuarantine(q.id, 'مرفوض'); toast(`تم رفض السجل ${q.recordRef || ''} نهائياً`, { tone: 'neutral' }); } }),
        );
      } else {
        actions.appendChild(badge(q.status || '—', tone));
      }
      return h('li', { class: 'quarantine-item', 'data-status': q.status || 'معلّق' },
        h('div', { class: 'quarantine-main' },
          h('span', { class: 'row gap-2 wrap' }, h('span', { class: 'quarantine-ref mono' }, q.recordRef || q.id), q.status === 'معلّق' ? badge('معلّق', 'warning') : null),
          h('span', { class: 'quarantine-reason' }, q.reason || '—'),
        ),
        actions,
        h('div', { class: 'quarantine-meta' },
          h('span', {}, svgIcon('erp', 11), ' ', data.sourceName(q.sourceId)),
          h('span', { title: fmt.dateTime(q.at) }, `حُجر ${fmt.relative(q.at)}`),
          q.resolvedAt ? h('span', { title: fmt.dateTime(q.resolvedAt) }, `عُولج ${fmt.relative(q.resolvedAt)}${q.resolvedBy ? ` — ${q.resolvedBy}` : ''}`) : null,
        ),
      );
    }

    function buildQuarantineCard(data) {
      const all = data.quarantine;
      const filtered = quarantineFilter === 'all' ? all : all.filter((q) => q.status === quarantineFilter);
      const counts = Object.fromEntries(Q_FILTERS.map((f) => [f.value, f.value === 'all' ? all.length : all.filter((q) => q.status === f.value).length]));
      const chips = h('div', { class: 'chip-group', role: 'group', 'aria-label': 'تصفية قائمة الحجر' }, ...Q_FILTERS.map((f) => {
        const active = quarantineFilter === f.value;
        const tone = Q_STATUS[f.value];
        return h('button', { type: 'button', class: ['chip', 'is-sm', tone ? `tone-${tone}` : null, active ? 'is-active' : null], 'aria-pressed': active ? 'true' : 'false', onClick: () => { quarantineFilter = f.value; quarantineLimit = Q_PAGE; schedule(); } }, tone ? glyph(tone, 12) : null, h('span', {}, f.label), h('span', { class: 'chip-count' }, fmt.num(counts[f.value])));
      }));

      const reasonsSeg = data.reasons.length ? makeChart('segmentedBar', { parts: data.reasons.slice(0, 6).map((r, i) => ({ id: r.id, label: r.label, value: r.value, color: safe(() => charts.paletteFor(i), `var(--s${i + 1})`) })), tall: false, valueFormat: (v) => fmt.num(v), ariaLabel: 'أسباب الحجر للسجلات المعلّقة' }) : null;

      const shown = filtered.slice(0, quarantineLimit);
      const list = shown.length
        ? h('ul', { class: 'quarantine-list', 'aria-label': 'قائمة الحجر' }, ...shown.map((q) => quarantineItem(data, q)))
        : emptyState({ icon: glyph('good', 32), title: quarantineFilter === 'all' ? 'قائمة الحجر فارغة — كل السجلات اجتازت التحقق' : 'لا توجد سجلات بهذه الحالة' });
      const more = filtered.length > shown.length
        ? h('div', { class: 'row', style: { justifyContent: 'center' } }, button(`عرض المزيد (${fmt.num(filtered.length - shown.length)})`, { variant: 'ghost', size: 'sm', icon: glyph('chevronDown', 14), onClick: () => { quarantineLimit += Q_PAGE; schedule(); } }))
        : null;

      return card({
        id: 'dq-quarantine', code: 'DQ-04', title: 'قائمة الحجر', subtitle: 'سجلات أوقفتها البوابة — صحّح عند المنبع أو ارفض نهائياً',
        actions: [badge(counts['معلّق'] ? `${fmt.num(counts['معلّق'])} معلّقة` : 'لا سجلات معلّقة', counts['معلّق'] ? 'warning' : 'good')],
        body: h('div', { class: 'stack gap-3' },
          chips,
          reasonsSeg ? h('div', { class: 'stack gap-1' }, h('span', { class: 'text-xs muted' }, 'أسباب الحجر للسجلات المعلّقة'), reasonsSeg.el) : null,
          list,
          more,
        ),
        tableView: reasonsSeg ? tableOf(reasonsSeg, () => simpleTable(['السبب', 'العدد'], data.reasons.map((r) => [r.label, fmt.num(r.value)]))) : null,
        footer: h('p', { class: 'text-xs muted' }, 'كل قرار تصحيح أو رفض يُسجَّل في سجل التدقيق (إجراء «تحقق») ويُغذّي إعادة معايرة قواعد التنظيف.'),
      });
    }

    /* ───────────────────────── build ───────────────────────── */

    function build() {
      raf = 0;
      const data = collect();
      const frag = document.createDocumentFragment();
      frag.append(
        buildHead(data),
        buildPrinciple(data),
        buildTiles(data),
        buildSourcesCard(data),
        h('div', { class: 'grid-12' }, buildRulesCard(data), buildPassRateCard(data)),
        buildQuarantineCard(data),
      );
      root.replaceChildren(frag);
      if (restoreFocusId) {
        const el = root.querySelector(`#${CSS.escape(restoreFocusId)}`);
        restoreFocusId = null;
        if (el) { try { el.focus({ preventScroll: true }); } catch { /* ignore */ } }
      }
    }

    function schedule() {
      if (raf) return;
      raf = requestAnimationFrame(build);
    }

    const NOISY = /^(feed|sensors|integrations)/;
    const unsubs = [
      bus.on('store:change', (payload) => { const path = payload && payload.path ? String(payload.path) : '*'; if (!NOISY.test(path)) schedule(); }),
      bus.on('filters:change', () => schedule()),
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
