/**
 * Biltix Risk AI — view: مخاطر التكلفة (js/views/cost.js) — DOM-04
 *
 * Cost-domain pillar of the Risk Cockpit: Earned-Value strip (CPI / SPI / EAC / ETC / VAC
 * with formula hints), three-series cost trend, commodity inflation impact, currency
 * exposure with hedging advice, change-order creep, labour index sparklines, cost-line
 * variance, the KRI matrix of the Cost Forecast pipeline and the open AI risks of the
 * `cost` category.
 *
 * Contract: docs/ARCHITECTURE.md §4 (components), §5 (charts), B2–B4 (psel), B9.8.
 * Data reaches the DOM only through textContent / components.h. No cross-view imports.
 */

const CATEGORY = 'cost';
const PIPELINE_ID = 'cost-forecast';
const CO_STATUS = ['مقترح', 'قيد الاعتماد', 'معتمد', 'مرفوض'];
const CO_TONE = { 'مقترح': 'neutral', 'قيد الاعتماد': 'warning', 'معتمد': 'brand', 'مرفوض': 'neutral' };
const TYPE_LABEL = { Financial: 'مالي', Safety: 'سلامة', Delay: 'تأخير', Conflict: 'نزاع' };
const TYPE_ICON = { Financial: 'chart', Safety: 'helmet', Delay: 'clock', Conflict: 'file-text' };
const RATING_LABEL = { red: 'أحمر', yellow: 'أصفر', green: 'أخضر' };
const RATING_TONE = { red: 'critical', yellow: 'warning', green: 'good' };
const CLOSED_STATUSES = new Set(['مغلق', 'مُتجاوز']);

const safe = (fn, fallback) => { try { const v = fn(); return v === undefined ? fallback : v; } catch { return fallback; } };
const arr = (v) => (Array.isArray(v) ? v : []);
const num = (v, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);

export default {
  id: 'cost',
  code: 'DOM-04',
  title: 'مخاطر التكلفة',
  icon: 'chart',

  render(container, ctx) {
    const { store, bus, fmt, charts, components, psel, sources, router } = ctx;
    const { h, card, statTile, badge, dataTable, button, segmented, toast, emptyState, progress, svgIcon, glyph } = components;

    const root = h('section', { class: 'view view-cost' });
    container.appendChild(root);

    let raf = 0;
    let localProject = 'portfolio'; // used only while the global project filter is "all"

    /* ───────────────────────── helpers ───────────────────────── */

    const mono = (text, extra = []) => h('span', { class: ['mono', 'num', ...arr(extra)] }, String(text ?? '—'));
    const sar = (v) => (Number.isFinite(Number(v)) ? `${fmt.compact(Number(v))} ر.س` : '—');
    const sarFull = (v) => (Number.isFinite(Number(v)) ? `${fmt.num(Number(v))} ر.س` : '—');
    const ratio = (v) => (Number.isFinite(Number(v)) ? fmt.num(Number(v), { maximumFractionDigits: 2, minimumFractionDigits: 2 }) : '—');

    function makeChart(name, opts) {
      if (!charts || typeof charts[name] !== 'function') return null;
      try { const c = charts[name](opts); return c && c.el instanceof Node ? c : null; } catch (err) { console.warn(`[cost] charts.${name} failed`, err); return null; }
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

    function ratingOf(score) {
      const r = safe(() => psel.rating(score), null);
      if (r) return r;
      return score >= 70 ? 'red' : (score >= 40 ? 'yellow' : 'green');
    }
    function ratingBadge(score) {
      const r = ratingOf(num(score));
      const tone = safe(() => psel.ratingTone(r), RATING_TONE[r]) || RATING_TONE[r];
      const label = safe(() => psel.ratingLabel(r), RATING_LABEL[r]) || RATING_LABEL[r];
      const el = badge(label, tone);
      el.classList.add('rating', `is-${r}`);
      return el;
    }
    function typeChip(type) {
      const label = safe(() => psel.typeLabel(type), null) || TYPE_LABEL[type] || String(type ?? '—');
      const key = String(type || '').toLowerCase();
      return h('span', { class: ['type-chip', key ? `is-${key}` : null], 'data-type': type ? String(type) : undefined }, svgIcon(TYPE_ICON[type] || 'chart', 12), h('span', {}, label));
    }
    function toneBadge(label, tone) { return badge(label, tone); }

    function indexTone(v) { if (!Number.isFinite(v)) return 'neutral'; if (v >= 1) return 'good'; if (v >= 0.9) return 'warning'; return 'critical'; }
    function cpiLabel(v) { if (!Number.isFinite(v)) return 'غير متاح'; if (v >= 1) return 'ضمن الميزانية'; if (v >= 0.9) return 'ضغط على التكلفة'; return 'تجاوز في التكلفة'; }
    function spiLabel(v) { if (!Number.isFinite(v)) return 'غير متاح'; if (v >= 1) return 'ضمن الجدول'; if (v >= 0.9) return 'تأخر طفيف'; return 'تأخر في الجدول'; }
    function eacTone(eac, bac) { if (!Number.isFinite(eac) || !bac) return 'neutral'; const r = eac / bac; if (r <= 1) return 'good'; if (r <= 1.05) return 'warning'; return 'critical'; }
    function eacLabel(eac, bac) { if (!Number.isFinite(eac) || !bac) return 'غير متاح'; const r = eac / bac; if (r <= 1) return 'ضمن الميزانية'; if (r <= 1.05) return 'تحذير'; return 'تجاوز متوقع'; }
    function vacTone(v) { if (!Number.isFinite(v)) return 'neutral'; return v >= 0 ? 'good' : 'critical'; }
    function vacLabel(v) { if (!Number.isFinite(v)) return 'غير متاح'; return v >= 0 ? 'وفر متوقع' : 'عجز متوقع'; }
    function varianceTone(v) { if (!Number.isFinite(v)) return 'neutral'; if (v <= 0) return 'good'; if (v <= 5) return 'warning'; if (v <= 10) return 'serious'; return 'critical'; }
    function varianceLabel(v) { if (!Number.isFinite(v)) return '—'; if (v <= 0) return 'ضمن الميزانية'; if (v <= 5) return 'انحراف طفيف'; if (v <= 10) return 'انحراف مرتفع'; return 'تجاوز'; }
    function changeTone(pct, { badAbove = 2, warnAbove = 0.5 } = {}) { if (!Number.isFinite(pct)) return 'neutral'; if (pct > badAbove) return 'critical'; if (pct > warnAbove) return 'warning'; return 'good'; }

    function hedgeAdvice(c) {
      if (c.code === 'USD' || c.pegged) return { label: 'مربوط بالريال — لا حاجة', tone: 'good' };
      const ch = Math.abs(num(c.change30dPct));
      const fcMove = c.forecast30d && c.rate ? Math.abs(num(c.forecast30d) / num(c.rate, 1) - 1) * 100 : 0;
      const exposure = num(c.exposureSAR);
      if ((ch >= 3 || fcMove >= 2.5) && exposure > 0) return { label: 'تحوّط آجل موصى به', tone: 'serious' };
      if (ch >= 1.5 || fcMove >= 1.2) return { label: 'مراقبة وتثبيت جزئي', tone: 'warning' };
      return { label: 'لا إجراء مطلوب', tone: 'neutral' };
    }

    function formulaHint(text) {
      return h('span', { class: 'mono text-xs muted ltr', dir: 'ltr', title: 'صيغة الحساب' }, String(text));
    }

    /* ───────────────────────── data ───────────────────────── */

    function platformOf(state) {
      return safe(() => psel.platform(state), null) || state.platform || {};
    }
    function projectName(state, id) {
      if (!id || id === 'all' || id === 'portfolio') return 'محفظة المشاريع';
      const s = arr(state.sites).find((x) => x.id === id);
      return s ? s.name : String(id);
    }
    function projectCode(state, id) {
      const s = arr(state.sites).find((x) => x.id === id);
      return s ? s.code : String(id);
    }

    function evmFor(state, projectId) {
      const direct = safe(() => psel.evm(state, projectId), null);
      if (direct && Number.isFinite(Number(direct.BAC))) return direct;
      const p = arr(platformOf(state).projects).find((x) => x.id === projectId);
      if (!p || !p.evm) return null;
      const e = p.evm;
      const BAC = num(e.BAC); const PV = num(e.PV); const EV = num(e.EV); const AC = num(e.AC);
      const CPI = AC ? EV / AC : NaN; const SPI = PV ? EV / PV : NaN;
      const EAC = Number.isFinite(CPI) && CPI ? BAC / CPI : NaN;
      return { BAC, PV, EV, AC, CPI: num(e.CPI, CPI), SPI: num(e.SPI, SPI), EAC: num(e.EAC, EAC), ETC: num(e.ETC, EAC - AC), VAC: num(e.VAC, BAC - EAC), SV: EV - PV, CV: EV - AC, percentComplete: num(p.percentComplete, BAC ? (EV / BAC) * 100 : 0), plannedPercent: num(p.plannedPercent, BAC ? (PV / BAC) * 100 : 0), status: CPI >= 1 ? 'ضمن الميزانية' : (CPI >= 0.9 ? 'تحذير' : 'تجاوز') };
    }

    function aggregateEvm(state, ids) {
      const parts = ids.map((id) => evmFor(state, id)).filter(Boolean);
      if (!parts.length) return null;
      const sum = (k) => parts.reduce((acc, p) => acc + num(p[k]), 0);
      const BAC = sum('BAC'); const PV = sum('PV'); const EV = sum('EV'); const AC = sum('AC');
      const CPI = AC ? EV / AC : NaN; const SPI = PV ? EV / PV : NaN;
      const EAC = Number.isFinite(CPI) && CPI ? BAC / CPI : NaN;
      return { BAC, PV, EV, AC, CPI, SPI, EAC, ETC: EAC - AC, VAC: BAC - EAC, SV: EV - PV, CV: EV - AC, percentComplete: BAC ? (EV / BAC) * 100 : 0, plannedPercent: BAC ? (PV / BAC) * 100 : 0, status: CPI >= 1 ? 'ضمن الميزانية' : (CPI >= 0.9 ? 'تحذير' : 'تجاوز'), projects: parts.length };
    }

    function forecastFor(state, ids) {
      const series = ids.map((id) => safe(() => psel.costForecast(state, id), null)).filter((f) => f && Array.isArray(f.months) && f.months.length);
      if (!series.length) return null;
      if (series.length === 1) return series[0];
      const base = series[0];
      const sumAt = (key, i) => series.reduce((acc, f) => acc + num(arr(f[key])[i]), 0);
      return {
        months: base.months.slice(),
        budget: base.months.map((_, i) => sumAt('budget', i)),
        actual: base.months.map((_, i) => (series.some((f) => arr(f.actual)[i] !== null && arr(f.actual)[i] !== undefined) ? sumAt('actual', i) : null)),
        forecast: base.months.map((_, i) => sumAt('forecast', i)),
      };
    }

    function collect() {
      const state = store.state;
      const filters = store.filters || { siteId: 'all', range: 30, search: '' };
      const plat = platformOf(state);
      const siteId = filters.siteId || 'all';
      const projects = arr(plat.projects);
      const projectIds = projects.map((p) => p.id);
      const scopeAll = siteId === 'all';
      const scopeId = scopeAll ? (localProject === 'portfolio' || !projectIds.includes(localProject) ? 'portfolio' : localProject) : siteId;
      const ids = scopeId === 'portfolio' ? projectIds : [scopeId];
      const inScope = (pid) => ids.includes(pid);

      const evm = scopeId === 'portfolio' ? aggregateEvm(state, ids) : evmFor(state, scopeId);
      const forecast = forecastFor(state, ids);

      const commodities = arr(plat.commodities).map((c) => {
        const series = arr(c.series); const fc = arr(c.forecast);
        const last = num(series[series.length - 1]); const fcLast = num(fc[fc.length - 1], last);
        const impactPct = last ? ((fcLast / last) - 1) * 100 : 0;
        return { ...c, impactPct, impactSAR: num(c.exposureSAR) * (impactPct / 100) };
      }).sort((a, b) => Math.abs(b.impactSAR) - Math.abs(a.impactSAR));

      const currencies = arr(plat.currencies).map((c) => ({ ...c, advice: hedgeAdvice(c) })).sort((a, b) => num(b.exposureSAR) - num(a.exposureSAR));

      const changeOrders = arr(plat.changeOrders).filter((co) => inScope(co.projectId));
      const coByStatus = CO_STATUS.map((s, i) => ({ id: s, label: s, status: s, count: changeOrders.filter((c) => c.status === s).length, amount: changeOrders.filter((c) => c.status === s).reduce((a, c) => a + num(c.amountSAR), 0), color: safe(() => charts.paletteFor(i), `var(--s${i + 1})`) }));
      const contractValue = projects.filter((p) => inScope(p.id)).reduce((a, p) => a + num(p.contractValueSAR, num(p.budgetSAR)), 0);
      const approvedCO = coByStatus.find((x) => x.status === 'معتمد');
      const pendingCO = coByStatus.find((x) => x.status === 'قيد الاعتماد');
      const creepPct = contractValue ? ((approvedCO ? approvedCO.amount : 0) / contractValue) * 100 : 0;

      const labour = arr(plat.labourIndex);
      const costLines = arr(plat.costLines).filter((l) => inScope(l.projectId)).map((l) => ({ ...l, variancePct: num(l.variancePct, l.budget ? ((num(l.forecast) - num(l.budget)) / num(l.budget)) * 100 : 0) })).sort((a, b) => b.variancePct - a.variancePct);

      const pipeline = arr(plat.pipelines).find((p) => p.id === PIPELINE_ID) || null;

      let aiRisks = safe(() => psel.openAiRisks(state, filters), null);
      if (!Array.isArray(aiRisks)) aiRisks = arr(plat.aiRisks).filter((r) => !CLOSED_STATUSES.has(r.status) && (scopeAll || r.projectId === siteId));
      aiRisks = aiRisks.filter((r) => r.category === CATEGORY && inScope(r.projectId)).sort((a, b) => num(b.score) - num(a.score));

      return { state, plat, siteId, scopeAll, scopeId, ids, projects, evm, forecast, commodities, currencies, changeOrders, coByStatus, contractValue, approvedCO, pendingCO, creepPct, labour, costLines, pipeline, aiRisks };
    }

    /* ───────────────────────── sections ───────────────────────── */

    function buildHead(data) {
      const actions = [];
      if (sources && typeof sources.exportCSV === 'function') {
        actions.push(button('تصدير بنود التكلفة', {
          variant: 'outline', size: 'sm', icon: 'download',
          onClick: () => {
            try {
              sources.exportCSV(data.costLines, [
                { key: 'wbs', label: 'WBS' }, { key: 'name', label: 'البند' }, { key: 'budget', label: 'الميزانية' }, { key: 'actual', label: 'الفعلي' },
                { key: 'committed', label: 'الملتزم به' }, { key: 'forecast', label: 'المتوقع' }, { key: 'variancePct', label: 'الانحراف %' },
              ], `biltix-cost-lines-${data.scopeId}.csv`);
              toast('تم تصدير بنود التكلفة بصيغة CSV', { tone: 'good' });
            } catch { toast('تعذر التصدير حالياً', { tone: 'warning' }); }
          },
        }));
      }
      actions.push(button('سجل المخاطر الذكي', { variant: 'ghost', size: 'sm', icon: 'shield-alert', onClick: () => router.navigate('airisks', { category: CATEGORY }) }));

      return h('div', { class: 'view-head' },
        h('div', { class: 'view-head-text' },
          h('span', { class: 'code-tag' }, 'DOM-04'),
          h('h1', { tabindex: '-1' }, 'مخاطر التكلفة'),
          h('p', { class: 'view-lead' }, `القيمة المكتسبة، اتجاه التكلفة، التعرض للعملات والسلع، أوامر التغيير وانحراف بنود التكلفة لـ ${projectName(data.state, data.scopeId)} — تغذّيها خط «توقع التكلفة» في محرك الذكاء الاصطناعي.`),
        ),
        h('div', { class: 'view-actions' }, ...actions),
      );
    }

    function buildScopeBar(data) {
      if (!data.scopeAll) {
        return h('div', { class: 'toolbar' },
          h('span', { class: 'text-sm muted' }, 'نطاق العرض:'),
          badge(projectName(data.state, data.scopeId), 'brand', { icon: 'building' }),
          h('span', { class: 'text-xs muted' }, 'يتبع مرشح المشروع في شريط الفلاتر'),
        );
      }
      const options = [{ value: 'portfolio', label: 'المحفظة', icon: 'layers' }, ...data.projects.map((p) => ({ value: p.id, label: projectCode(data.state, p.id), icon: 'building', title: projectName(data.state, p.id) }))];
      const chips = h('div', { class: 'chip-group', role: 'group', 'aria-label': 'اختيار المشروع' }, ...options.map((o) => {
        const active = o.value === data.scopeId;
        return h('button', { type: 'button', class: ['chip', 'is-sm', active ? 'is-active' : null], 'aria-pressed': active ? 'true' : 'false', title: o.title || undefined, onClick: () => { localProject = o.value; schedule(); } }, svgIcon(o.icon, 12), h('span', {}, o.label));
      }));
      return h('div', { class: 'toolbar' },
        h('span', { class: 'text-sm muted' }, 'نطاق العرض:'),
        chips,
        h('span', { class: 'toolbar-spacer' }),
        h('span', { class: 'text-xs muted' }, data.scopeId === 'portfolio' ? `إجمالي ${fmt.num(data.projects.length)} مشاريع` : projectName(data.state, data.scopeId)),
      );
    }

    /** .evm-cell[data-tone] > .evm-label(.mono abbr + name) + .evm-value(.mono) + .evm-status + .evm-hint — structure from css/platform.css */
    function evmCell({ code, label, value, tone, statusLabel, formula, hint }) {
      const cell = h('div', { class: ['evm-cell', `tone-${tone}`], 'data-tone': tone, 'data-metric': code });
      cell.appendChild(h('span', { class: 'evm-label' }, h('abbr', { class: 'mono evm-abbr', title: label }, code), h('span', {}, label)));
      cell.appendChild(h('span', { class: 'evm-value mono num' }, value));
      cell.appendChild(h('span', { class: 'evm-status' }, toneBadge(statusLabel, tone)));
      cell.appendChild(h('span', { class: 'evm-hint', style: { whiteSpace: 'nowrap' } }, formulaHint(formula)));
      if (hint) cell.appendChild(h('span', { class: 'evm-hint' }, hint));
      return cell;
    }

    function buildEvmCard(data) {
      const e = data.evm;
      if (!e) {
        return card({ code: 'CST-01', title: 'إدارة القيمة المكتسبة (EVM)', body: emptyState({ title: 'لا تتوفر بيانات القيمة المكتسبة', text: 'تأكد من اتصال موصل «Biltix — التكلفة والميزانية».' }) });
      }
      const strip = h('div', { class: 'evm-strip', role: 'group', 'aria-label': 'مؤشرات القيمة المكتسبة' },
        evmCell({ code: 'CPI', label: 'مؤشر أداء التكلفة', value: ratio(e.CPI), tone: indexTone(e.CPI), statusLabel: cpiLabel(e.CPI), formula: 'CPI = EV / AC', hint: 'أعلى من 1 يعني إنفاقاً أقل من القيمة المُنجزة' }),
        evmCell({ code: 'SPI', label: 'مؤشر أداء الجدول', value: ratio(e.SPI), tone: indexTone(e.SPI), statusLabel: spiLabel(e.SPI), formula: 'SPI = EV / PV', hint: 'أقل من 1 يعني إنجازاً أبطأ من المخطط' }),
        evmCell({ code: 'EAC', label: 'التقدير عند الإنجاز', value: sar(e.EAC), tone: eacTone(e.EAC, e.BAC), statusLabel: eacLabel(e.EAC, e.BAC), formula: 'EAC = BAC / CPI', hint: `الميزانية عند الإنجاز (BAC): ${sar(e.BAC)}` }),
        evmCell({ code: 'ETC', label: 'التقدير للإنجاز المتبقي', value: sar(e.ETC), tone: 'brand', statusLabel: 'المتبقي للإنجاز', formula: 'ETC = EAC − AC', hint: `التكلفة الفعلية حتى اليوم (AC): ${sar(e.AC)}` }),
        evmCell({ code: 'VAC', label: 'الانحراف عند الإنجاز', value: `${e.VAC < 0 ? '−' : ''}${sar(Math.abs(e.VAC))}`, tone: vacTone(e.VAC), statusLabel: vacLabel(e.VAC), formula: 'VAC = BAC − EAC', hint: e.VAC < 0 ? 'قيمة سالبة: التكلفة المتوقعة تتجاوز الميزانية' : 'قيمة موجبة: وفر متوقع مقابل الميزانية' }),
      );

      const signedSar = (v) => `${v < 0 ? '−' : ''}${sar(Math.abs(v))}`;
      const facts = h('div', { class: 'hero-facts evm-facts', style: { gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' } },
        ...[
          ['BAC', 'الميزانية عند الإنجاز', sar(e.BAC), sarFull(e.BAC), 'neutral'],
          ['PV', 'القيمة المخططة', sar(e.PV), sarFull(e.PV), 'neutral'],
          ['EV', 'القيمة المكتسبة', sar(e.EV), sarFull(e.EV), 'neutral'],
          ['AC', 'التكلفة الفعلية', sar(e.AC), sarFull(e.AC), 'neutral'],
          ['SV', 'انحراف الجدول (EV − PV)', signedSar(e.SV), `${e.SV < 0 ? '−' : ''}${sarFull(Math.abs(e.SV))}`, e.SV >= 0 ? 'good' : 'warning'],
          ['CV', 'انحراف التكلفة (EV − AC)', signedSar(e.CV), `${e.CV < 0 ? '−' : ''}${sarFull(Math.abs(e.CV))}`, e.CV >= 0 ? 'good' : 'critical'],
        ].map(([code, label, value, full, tone]) => h('div', { class: ['fact', `tone-${tone}`], title: full },
          h('span', { class: 'fact-label row gap-1' }, mono(code, ['text-xs']), h('span', {}, label)),
          h('span', { class: 'fact-value mono num row gap-1' }, tone === 'neutral' ? null : glyph(tone, 13), h('span', {}, value)),
        )),
      );

      const pc = Math.max(0, Math.min(100, num(e.percentComplete)));
      const pp = Math.max(0, Math.min(100, num(e.plannedPercent)));
      const progressPair = h('div', { class: 'bar-pair', 'aria-label': 'نسبة الإنجاز الفعلية مقابل المخططة' },
        h('div', { class: 'bar-pair-row' }, h('span', {}, 'الإنجاز الفعلي'), progress({ value: pc, tone: pc >= pp ? 'good' : 'warning', label: 'نسبة الإنجاز الفعلية' }), h('span', { class: 'progress-value' }, fmt.pct(pc))),
        h('div', { class: 'bar-pair-row' }, h('span', {}, 'الإنجاز المخطط'), progress({ value: pp, tone: 'brand', label: 'نسبة الإنجاز المخططة' }), h('span', { class: 'progress-value' }, fmt.pct(pp))),
      );

      const statusTone = e.status === 'ضمن الميزانية' ? 'good' : (e.status === 'تحذير' ? 'warning' : 'critical');
      return card({
        code: 'CST-01', title: 'إدارة القيمة المكتسبة (EVM)',
        subtitle: `${projectName(data.state, data.scopeId)} — حالة التكلفة الإجمالية`,
        actions: [toneBadge(e.status || '—', statusTone)],
        body: h('div', { class: 'stack gap-4' }, strip, facts, progressPair),
        footer: h('p', { class: 'text-xs muted' }, 'تُحسب المؤشرات من بيانات Oracle ERP و«Biltix — التكلفة والميزانية» بعد اجتياز طبقة التحقق؛ الدرجات 0–100 لمخاطر التكلفة تُشتق من CPI وVAC واتجاه السلع وأوامر التغيير.'),
      });
    }

    function buildTrendCard(data) {
      const f = data.forecast;
      let chart = null;
      if (f) {
        chart = makeChart('lineChart', {
          series: [
            { id: 'budget', label: 'الميزانية', color: 'var(--s1)', values: arr(f.budget).map((v) => num(v)) },
            { id: 'actual', label: 'الفعلي', color: 'var(--s2)', values: arr(f.actual).map((v) => (v === null || v === undefined ? null : num(v))) },
            { id: 'forecast', label: 'المتوقع', color: 'var(--s3)', values: arr(f.forecast).map((v) => num(v)) },
          ],
          labels: arr(f.months).map(String), height: 240, yFormat: (v) => fmt.compact(v), ariaLabel: 'اتجاه التكلفة: الميزانية مقابل الفعلي والمتوقع',
        });
      }
      const fallbackTable = () => simpleTable(['الشهر', 'الميزانية', 'الفعلي', 'المتوقع'], arr(f && f.months).map((m, i) => [m, sar(arr(f.budget)[i]), arr(f.actual)[i] == null ? '—' : sar(arr(f.actual)[i]), sar(arr(f.forecast)[i])]));
      return card({
        code: 'CST-02', title: 'اتجاه التكلفة', subtitle: 'الميزانية التراكمية مقابل الفعلي والمتوقع (ر.س)',
        body: f ? chartOr(chart) : emptyState({ title: 'لا تتوفر سلسلة التكلفة لهذا النطاق' }),
        tableView: f ? tableOf(chart, fallbackTable) : null,
      });
    }

    function buildCommodityCard(data) {
      const items = data.commodities.slice(0, 6);
      if (!items.length) return card({ code: 'CST-03', title: 'أثر تضخم السلع', className: 'col-span-4', body: emptyState({ title: 'لا تتوفر مؤشرات السلع' }) });
      const tiles = items.map((c) => statTile({
        label: c.name, value: fmt.compact(num(c.exposureSAR)), unit: 'ر.س', delta: Number(num(c.impactPct).toFixed(1)), deltaGoodWhen: 'down',
        tone: changeTone(c.impactPct, { badAbove: 4, warnAbove: 1 }), icon: 'package',
        hint: `${c.trend || '—'} · تقلب ${fmt.pct(num(c.volatilityPct), 1)} · أثر متوقع ${c.impactSAR < 0 ? '−' : ''}${sar(Math.abs(c.impactSAR))}`,
        onClick: () => router.navigate('bom', { commodity: c.id }),
      }));
      const totalImpact = items.reduce((a, c) => a + c.impactSAR, 0);
      return card({
        code: 'CST-03', title: 'أثر تضخم السلع', subtitle: 'التعرض الحالي وتغير السعر المتوقع خلال 6 أشهر',
        className: 'col-span-4',
        actions: [toneBadge(`${totalImpact < 0 ? '−' : '+'}${sar(Math.abs(totalImpact))}`, changeTone(totalImpact > 0 ? 5 : 0, { badAbove: 4, warnAbove: 1 }))],
        body: h('div', { class: 'kpi-row', style: { gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' } }, ...tiles),
      });
    }

    function buildCurrencyCard(data) {
      const rows = data.currencies;
      const table = dataTable({
        dense: true, pageSize: 0, rowKey: 'code', emptyText: 'لا تتوفر بيانات العملات',
        caption: 'التعرض للعملات الأجنبية',
        columns: [
          { key: 'code', label: 'العملة', render: (r) => h('span', { class: 'row gap-2' }, mono(r.code), h('span', { class: 'text-sm' }, r.nameAr || '')) },
          { key: 'rate', label: 'السعر (ر.س)', align: 'end', mono: true, render: (r) => fmt.num(num(r.rate), { maximumFractionDigits: 4, minimumFractionDigits: 2 }) },
          { key: 'change30dPct', label: 'التغير 30 يوماً', align: 'end', render: (r) => h('span', { class: ['num', 'mono', `tone-${changeTone(Math.abs(num(r.change30dPct)), { badAbove: 3, warnAbove: 1.5 })}`], style: { color: 'var(--tone-ink)' } }, fmt.signed(num(r.change30dPct), 1) + '%') },
          { key: 'exposureSAR', label: 'التعرض', align: 'end', mono: true, render: (r) => sar(r.exposureSAR), sortValue: (r) => num(r.exposureSAR) },
          { key: 'forecast30d', label: 'توقع 30 يوماً', align: 'end', mono: true, render: (r) => fmt.num(num(r.forecast30d), { maximumFractionDigits: 4, minimumFractionDigits: 2 }) },
          { key: 'advice', label: 'توصية التحوّط', sortable: false, render: (r) => toneBadge(r.advice.label, r.advice.tone) },
        ],
        rows, initialSort: { key: 'exposureSAR', dir: 'desc' },
      });
      const totalExposure = rows.reduce((a, c) => a + num(c.exposureSAR), 0);
      return card({
        code: 'CST-04', title: 'التعرض للعملات', subtitle: 'أسعار الصرف (ساما) والتعرض غير المُحوَّط',
        className: 'col-span-6',
        actions: [h('span', { class: 'text-sm muted' }, 'إجمالي التعرض: ', mono(sar(totalExposure)))],
        body: table.el,
      });
    }

    function buildChangeOrdersCard(data) {
      const parts = data.coByStatus.filter((p) => p.amount > 0).map((p) => ({ id: p.id, label: p.label, value: p.amount, color: p.color }));
      const seg = parts.length ? makeChart('segmentedBar', { parts, tall: true, valueFormat: (v) => fmt.compact(v), ariaLabel: 'قيمة أوامر التغيير حسب الحالة' }) : null;
      const strip = h('div', { class: 'summary-strip' },
        h('div', { class: 'summary-cell' }, h('span', { class: 'summary-label' }, 'زحف التكلفة (معتمد ÷ قيمة العقد)'), h('span', { class: ['summary-value', 'mono', 'num'] }, fmt.pct(data.creepPct, 1)), toneBadge(data.creepPct > 5 ? 'تجاوز حد التحمل' : (data.creepPct > 2.5 ? 'يقترب من الحد' : 'ضمن حد التحمل'), data.creepPct > 5 ? 'critical' : (data.creepPct > 2.5 ? 'warning' : 'good'))),
        h('div', { class: 'summary-cell' }, h('span', { class: 'summary-label' }, 'قيد الاعتماد'), h('span', { class: ['summary-value', 'mono', 'num'] }, sar(data.pendingCO ? data.pendingCO.amount : 0)), h('span', { class: 'text-xs muted' }, `${fmt.num(data.pendingCO ? data.pendingCO.count : 0)} أوامر`)),
        h('div', { class: 'summary-cell' }, h('span', { class: 'summary-label' }, 'إجمالي الأوامر'), h('span', { class: ['summary-value', 'mono', 'num'] }, fmt.num(data.changeOrders.length)), h('span', { class: 'text-xs muted' }, `أثر زمني ${fmt.num(data.changeOrders.reduce((a, c) => a + num(c.impactDays), 0))} يوماً`)),
      );
      const table = dataTable({
        dense: true, pageSize: 6, emptyText: 'لا توجد أوامر تغيير في هذا النطاق', caption: 'أوامر التغيير',
        columns: [
          { key: 'code', label: 'الرمز', mono: true, render: (r) => mono(r.code) },
          { key: 'title', label: 'العنوان', render: (r) => h('span', { class: 'truncate', title: r.title || '' }, r.title || '—') },
          { key: 'amountSAR', label: 'القيمة', align: 'end', mono: true, render: (r) => sar(r.amountSAR), sortValue: (r) => num(r.amountSAR) },
          { key: 'impactDays', label: 'الأثر (يوم)', align: 'end', mono: true, render: (r) => fmt.num(num(r.impactDays)) },
          { key: 'status', label: 'الحالة', render: (r) => toneBadge(r.status || '—', CO_TONE[r.status] || 'neutral') },
          { key: 'submittedAt', label: 'التقديم', render: (r) => h('span', { class: 'text-xs', title: fmt.date(r.submittedAt) }, fmt.relative(r.submittedAt)) },
        ],
        rows: data.changeOrders, initialSort: { key: 'amountSAR', dir: 'desc' },
      });
      return card({
        code: 'CST-05', title: 'زحف أوامر التغيير', subtitle: 'توزيع القيمة حسب الحالة وأحدث الأوامر',
        className: 'col-span-6',
        body: h('div', { class: 'stack gap-4' }, strip, seg ? seg.el : null, table.el),
        tableView: parts.length ? tableOf(seg, () => simpleTable(['الحالة', 'العدد', 'القيمة'], data.coByStatus.map((p) => [p.label, fmt.num(p.count), sar(p.amount)]))) : null,
      });
    }

    function buildLabourCard(data) {
      if (!data.labour.length) return card({ code: 'CST-06', title: 'مؤشر أجور العمالة', className: 'col-span-4', body: emptyState({ title: 'لا تتوفر مؤشرات الأجور' }) });
      const rows = data.labour.map((l) => {
        const spark = makeChart('sparkline', { values: arr(l.series).map((v) => num(v)), width: 110, height: 28, color: 'var(--ink-3)', accentLast: true });
        const tone = changeTone(num(l.change12mPct), { badAbove: 6, warnAbove: 3 });
        return h('div', { class: 'row between gap-3', style: { paddingBlock: '8px', borderBlockEnd: '1px solid var(--line)' } },
          h('div', { class: 'stack gap-1 grow', style: { gap: '2px' } }, h('span', { class: 'text-sm semibold truncate' }, l.trade || '—'), h('span', { class: 'text-xs muted truncate' }, l.region || '—')),
          spark ? h('span', { class: 'spark', 'aria-hidden': 'true' }, spark.el) : null,
          h('span', { class: ['badge', `tone-${tone}`], 'data-tone': tone }, glyph(tone, 13), h('span', { class: 'badge-text mono' }, `${fmt.signed(num(l.change12mPct), 1)}%`)),
        );
      });
      return card({
        code: 'CST-06', title: 'مؤشر أجور العمالة', subtitle: 'التغير خلال 12 شهراً حسب المنطقة والحرفة',
        className: 'col-span-4',
        body: h('div', { class: 'stack', style: { gap: '0' } }, ...rows),
        tableView: () => simpleTable(['الحرفة', 'المنطقة', 'التغير 12 شهراً'], data.labour.map((l) => [l.trade, l.region, `${fmt.signed(num(l.change12mPct), 1)}%`])),
        footer: h('p', { class: 'text-xs muted' }, 'المصدر: مؤشرات السلع والأجور — يُستخدم كمدخل لنموذج توقع التكلفة.'),
      });
    }

    function buildCostLinesCard(data) {
      const over = data.costLines.filter((l) => l.variancePct > 5).length;
      const table = dataTable({
        dense: true, pageSize: 8, emptyText: 'لا توجد بنود تكلفة في هذا النطاق', caption: 'انحراف بنود التكلفة',
        columns: [
          { key: 'wbs', label: 'WBS', mono: true, render: (r) => mono(r.wbs) },
          { key: 'name', label: 'البند', render: (r) => h('span', { class: 'stack', style: { gap: '1px' } }, h('span', { class: 'truncate', title: r.name || '' }, r.name || '—'), data.scopeId === 'portfolio' ? h('span', { class: 'text-xs muted' }, projectCode(data.state, r.projectId)) : null) },
          { key: 'budget', label: 'الميزانية', align: 'end', mono: true, render: (r) => sar(r.budget), sortValue: (r) => num(r.budget) },
          { key: 'actual', label: 'الفعلي', align: 'end', mono: true, render: (r) => sar(r.actual), sortValue: (r) => num(r.actual) },
          { key: 'committed', label: 'الملتزم', align: 'end', mono: true, render: (r) => sar(r.committed), sortValue: (r) => num(r.committed) },
          { key: 'forecast', label: 'المتوقع', align: 'end', mono: true, render: (r) => sar(r.forecast), sortValue: (r) => num(r.forecast) },
          { key: 'variancePct', label: 'الانحراف', align: 'end', render: (r) => h('span', { class: 'row gap-2', style: { justifyContent: 'flex-end' } }, toneBadge(varianceLabel(r.variancePct), varianceTone(r.variancePct)), mono(`${fmt.signed(r.variancePct, 1)}%`)) },
        ],
        rows: data.costLines, initialSort: { key: 'variancePct', dir: 'desc' },
      });
      return card({
        code: 'CST-07', title: 'انحراف بنود التكلفة', subtitle: 'المتوقع مقابل الميزانية لكل بند WBS',
        className: 'col-span-8',
        actions: [toneBadge(`${fmt.num(over)} بنود متجاوزة`, over ? 'warning' : 'good')],
        body: table.el,
      });
    }

    function buildKriCard(data) {
      const kris = arr(data.pipeline && data.pipeline.kris);
      const table = dataTable({
        dense: true, pageSize: 0, emptyText: 'لا تتوفر مصفوفة مؤشرات المخاطر لهذا الخط', caption: 'مصفوفة مؤشرات المخاطر الرئيسية — توقع التكلفة',
        columns: [
          { key: 'indicator', label: 'المؤشر', sortable: false, render: (r) => h('span', { class: 'semibold' }, r.indicator || '—') },
          { key: 'technique', label: 'التقنية', sortable: false, render: (r) => r.technique || '—' },
          { key: 'inputs', label: 'المدخلات', sortable: false, render: (r) => (Array.isArray(r.inputs) ? r.inputs.join(' · ') : (r.inputs || '—')) },
          { key: 'mitigation', label: 'المعالجة', sortable: false, render: (r) => r.mitigation || '—' },
        ],
        rows: kris.map((k, i) => ({ id: `kri-${i}`, ...k })),
      });
      table.table.classList.add('kri-table');
      return card({
        code: 'CST-08', title: 'مصفوفة مؤشرات المخاطر (KRI) — التكلفة',
        subtitle: data.pipeline ? `${data.pipeline.nameAr || data.pipeline.name || ''} · ${data.pipeline.version || ''}` : 'خط توقع التكلفة',
        className: 'col-span-6',
        actions: [button('المحرك', { variant: 'ghost', size: 'sm', icon: 'sliders', onClick: () => router.navigate('engine', { pipeline: PIPELINE_ID }) })],
        body: table.el,
      });
    }

    function buildAiRisksCard(data) {
      const rows = data.aiRisks;
      const red = rows.filter((r) => ratingOf(num(r.score)) === 'red').length;
      const table = dataTable({
        dense: true, pageSize: 6, emptyText: 'لا توجد مخاطر تكلفة مفتوحة في هذا النطاق', caption: 'مخاطر التكلفة المكتشفة بالذكاء الاصطناعي',
        onRowClick: (r) => router.navigate('airisks', { risk: r.id }),
        columns: [
          { key: 'code', label: 'الرمز', mono: true, render: (r) => mono(r.code) },
          { key: 'title', label: 'المخاطرة', render: (r) => h('span', { class: 'stack', style: { gap: '1px' } }, h('span', { class: 'truncate', title: r.title || '' }, r.title || '—'), h('span', { class: 'text-xs muted' }, projectCode(data.state, r.projectId))) },
          { key: 'type', label: 'النوع', render: (r) => typeChip(r.type) },
          { key: 'score', label: 'الدرجة', align: 'end', render: (r) => h('span', { class: 'row gap-2', style: { justifyContent: 'flex-end' } }, mono(fmt.num(num(r.score))), ratingBadge(r.score)), sortValue: (r) => num(r.score) },
          { key: 'owner', label: 'المالك', render: (r) => r.owner || '—' },
          { key: 'status', label: 'الحالة', render: (r) => badge(r.status || '—', 'neutral') },
        ],
        rows, initialSort: { key: 'score', dir: 'desc' },
      });
      return card({
        code: 'CST-09', title: 'مخاطر التكلفة المفتوحة', subtitle: 'مكتشفة بواسطة خط توقع التكلفة — انقر للتفاصيل والتوصية',
        className: 'col-span-6',
        actions: [toneBadge(`${fmt.num(red)} أحمر`, red ? 'critical' : 'good'), h('span', { class: 'text-sm muted' }, `${fmt.num(rows.length)} مفتوحة`)],
        body: table.el,
      });
    }

    /* ───────────────────────── build ───────────────────────── */

    function build() {
      raf = 0;
      const data = collect();
      const frag = document.createDocumentFragment();
      frag.append(
        buildHead(data),
        buildScopeBar(data),
        buildEvmCard(data),
        h('div', { class: 'grid-12' }, buildTrendCard(data), buildCommodityCard(data)),
        h('div', { class: 'grid-12' }, buildCurrencyCard(data), buildChangeOrdersCard(data)),
        h('div', { class: 'grid-12' }, buildCostLinesCard(data), buildLabourCard(data)),
        h('div', { class: 'grid-12' }, buildKriCard(data), buildAiRisksCard(data)),
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
      bus.on('filters:change', (payload) => { const key = payload && payload.key; if (!key || key === 'siteId' || key === 'range' || key === 'search') schedule(); }),
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
