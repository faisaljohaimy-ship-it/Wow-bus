/**
 * Biltix Risk AI — view: مخاطر المواد والتوريد (BoM) (js/views/bom.js) — DOM-02
 *
 * BoM-forecasting domain of the Risk Cockpit: commodity price actual + forecast,
 * exposure and volatility tiles, supplier concentration with single-source flags,
 * BoQ↔BIM quantity variance, long-lead items, the open AI risks of the `bom`
 * category and the pipeline's KRI matrix. Scoped by the global project filter.
 *
 * Contract: docs/ARCHITECTURE.md Part A §4–§5, Part B §B2–B4, §B8 class names
 * (.rating, .type-chip, .kri-table, .evidence) and §B9 item 6. Data reaches the DOM
 * only through textContent / components.h; all dependencies arrive through `ctx`.
 */

const DAY_MS = 86_400_000;
const CATEGORY = 'bom';
const PIPELINE_ID = 'bom-forecast';
const LONG_LEAD_DAYS = 45;
const VARIANCE_WARN = 5;
const VARIANCE_CRIT = 15;
const PROCUREMENT_OWNER = 'إدارة المشتريات';
const MONTHS_SHORT = ['ينا', 'فبر', 'مار', 'أبر', 'ماي', 'يون', 'يول', 'أغس', 'سبت', 'أكت', 'نوف', 'ديس'];

const RATING_META = {
  red: { label: 'أحمر', tone: 'critical', hint: 'حرج — تدخل فوري' },
  yellow: { label: 'أصفر', tone: 'warning', hint: 'مرتفع — مراقبة' },
  green: { label: 'أخضر', tone: 'good', hint: 'ضمن حدود التحمل' },
};
const TYPE_META = {
  Financial: { label: 'مالي', icon: 'chart' },
  Safety: { label: 'سلامة', icon: 'helmet' },
  Delay: { label: 'تأخير', icon: 'calendar' },
  Conflict: { label: 'نزاع', icon: 'shield-alert' },
};
const RISK_STATUS_TONE = { 'مكتشف': 'neutral', 'تنبيه': 'warning', 'مهمة مُسندة': 'brand', 'قيد المعالجة': 'accent', 'مغلق': 'good', 'مُتجاوز': 'neutral' };
const SPEC_TONE = { 'مطابق': 'good', 'غير مطابق': 'critical', 'قيد المراجعة': 'warning' };
const TREND_META = { 'صاعد': { tone: 'serious', glyph: 'serious' }, 'هابط': { tone: 'good', glyph: 'good' }, 'مستقر': { tone: 'neutral', glyph: 'neutral' } };
const CREDIT_TONE = { A: 'good', B: 'warning', C: 'critical' };
const CLOSED_RISK = new Set(['مغلق', 'مُتجاوز']);
const OPEN_TASK = new Set(['جديدة', 'قيد التنفيذ', 'متأخرة']);

const safe = (fn, fallback) => { try { const v = fn(); return v === undefined ? fallback : v; } catch { return fallback; } };
const lower = (v) => String(v ?? '').toLowerCase();
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

/** UI state that survives re-renders inside one visit (module-level, no persistence). */
let selectedCommodityId = null;
let kriOpen = true;

export default {
  id: 'bom',
  code: 'DOM-02',
  title: 'مخاطر المواد والتوريد (BoM)',
  icon: 'list',

  render(container, ctx) {
    const { store, bus, fmt, charts, components, router } = ctx;
    const psel = ctx.psel || null;
    const { h, card, statTile, badge, dataTable, button, drawer, toast, emptyState, progress, svgIcon, glyph, kv } = components;

    const root = h('section', { class: 'view view-bom' });
    container.appendChild(root);

    let raf = 0;
    let openDrawer = null;
    let lastNumerals = safe(() => store.state.settings.numerals, 'latn');
    let lastPlatformSettings = safe(() => JSON.stringify(store.state.settings.platform || null), 'null');

    /* ───────────────────────── primitives ───────────────────────── */

    const mono = (text, extra = null) => h('span', { class: ['mono', ...String(extra || '').split(/\s+/).filter(Boolean)], style: { fontFamily: 'var(--font-mono)', fontVariantNumeric: 'tabular-nums' } }, String(text ?? '—'));
    const sar = (n) => (Number.isFinite(Number(n)) ? `${fmt.compact(Number(n))} ر.س` : '—');
    const startOfToday = () => { const d = store.now ? store.now() : new Date(); d.setHours(0, 0, 0, 0); return d; };
    const daysUntil = (iso) => { const d = fmt.toDate(iso); if (!d) return null; d.setHours(0, 0, 0, 0); return Math.round((d.getTime() - startOfToday().getTime()) / DAY_MS); };
    const isoPlusDays = (days) => { const d = startOfToday(); d.setDate(d.getDate() + days); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

    function ratingOf(score) {
      const s = num(score);
      const r = psel && typeof psel.rating === 'function' ? safe(() => psel.rating(s), null) : null;
      if (r && RATING_META[r]) return r;
      return s >= 70 ? 'red' : s >= 40 ? 'yellow' : 'green';
    }
    function ratingTone(rating) {
      const t = psel && typeof psel.ratingTone === 'function' ? safe(() => psel.ratingTone(rating), null) : null;
      return t || RATING_META[rating].tone;
    }
    function ratingLabel(rating) {
      const l = psel && typeof psel.ratingLabel === 'function' ? safe(() => psel.ratingLabel(rating), null) : null;
      return l || RATING_META[rating].label;
    }
    function ratingBadge(score, { large = false } = {}) {
      const r = ratingOf(score);
      const b = badge(ratingLabel(r), ratingTone(r));
      b.classList.add('rating', `is-${r}`);
      if (large) b.classList.add('is-lg');
      b.title = RATING_META[r].hint;
      b.dataset.rating = r;
      return b;
    }
    function scoreCell(score, opts) {
      return h('span', { class: 'row gap-2 nowrap', style: { alignItems: 'center' } }, mono(fmt.num(num(score)), 'semibold'), ratingBadge(score, opts));
    }
    function typeChip(type) {
      const meta = TYPE_META[type] || { label: String(type || '—'), icon: 'list' };
      const label = psel && typeof psel.typeLabel === 'function' ? (safe(() => psel.typeLabel(type), null) || meta.label) : meta.label;
      const chip = badge(label, 'neutral', { icon: svgIcon(meta.icon, 14) });
      chip.classList.add('type-chip', `is-${lower(type) || 'unknown'}`);
      chip.dataset.type = String(type || '');
      return chip;
    }
    function statusBadge(status, map, fallback = 'neutral') { return badge(status || '—', map[status] || fallback); }
    function trendBadge(trend) {
      const m = TREND_META[trend] || TREND_META['مستقر'];
      return badge(trend || 'مستقر', m.tone, { icon: glyph(m.glyph, 12) });
    }
    function varianceTone(pct) {
      const a = Math.abs(num(pct));
      return a >= VARIANCE_CRIT ? 'critical' : a >= VARIANCE_WARN ? 'warning' : 'good';
    }
    function varianceBadge(pct) {
      const v = num(pct);
      const tone = varianceTone(v);
      const b = badge(fmt.signed(v, 1) + '%', tone);
      b.title = tone === 'good' ? 'ضمن حدود التحمل (± 5%)' : tone === 'warning' ? 'فرق ملحوظ بين BoQ و BIM — يتطلب مراجعة الكميات' : 'فرق جوهري — خطر تجاوز أو نقص في التوريد';
      return b;
    }
    function orderByCell(iso) {
      const days = daysUntil(iso);
      if (days === null) return h('span', { class: 'muted' }, '—');
      const tone = days < 0 ? 'critical' : days <= 14 ? 'warning' : 'neutral';
      const label = days < 0 ? `متأخر ${fmt.num(Math.abs(days))} يوم` : days === 0 ? 'اليوم' : `خلال ${fmt.num(days)} يوماً`;
      return h('div', { class: ['stack', 'gap-1', days < 0 ? 'is-overdue' : null] }, h('span', { class: 'nowrap' }, fmt.date(iso, { style: 'short' })), badge(label, tone));
    }

    function makeChart(name, opts) {
      if (!charts || typeof charts[name] !== 'function') return null;
      try { const c = charts[name](opts); return c && c.el instanceof Node ? c : null; } catch (err) { console.warn(`[bom] charts.${name} failed`, err); return null; }
    }
    function tableOf(chart, fallbackFn) {
      return () => {
        if (chart && typeof chart.table === 'function') { const t = safe(() => chart.table(), null); if (t instanceof Node) return t; }
        return fallbackFn ? fallbackFn() : h('table');
      };
    }
    function simpleTable(caption, headers, rows) {
      const t = h('table', { class: 'table is-dense' }, h('caption', { class: 'sr-only' }, caption));
      t.appendChild(h('thead', {}, h('tr', {}, ...headers.map((x) => h('th', { scope: 'col' }, x)))));
      const tb = h('tbody');
      rows.forEach((r) => tb.appendChild(h('tr', {}, ...r.map((c, i) => h('td', { class: i > 0 && typeof c === 'string' && /^[\d٠-٩+−-]/.test(c) ? 'num' : null }, c)))));
      t.appendChild(tb);
      return t;
    }
    function siteName(state, id) { const s = (state.sites || []).find((x) => x.id === id); return s ? s.name : (id || '—'); }

    /** Month labels: 24 history months ending this month, then 6 forecast months. */
    function monthLabels(history, forecast) {
      const now = store.now ? store.now() : new Date();
      const out = [];
      for (let i = -(history - 1); i <= forecast; i += 1) {
        const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
        out.push(`${MONTHS_SHORT[d.getMonth()]} ${String(d.getFullYear()).slice(2)}`);
      }
      return out;
    }

    /* ───────────────────────── data ───────────────────────── */

    function collect() {
      const state = store.state;
      const filters = store.filters || { siteId: 'all', range: 30, search: '' };
      const siteId = filters.siteId && filters.siteId !== 'all' ? filters.siteId : null;
      const search = lower(filters.search).trim();
      const platform = (psel && typeof psel.platform === 'function' ? safe(() => psel.platform(state), null) : null) || state.platform || null;
      if (!platform) return { state, filters, siteId, search, platform: null };

      const inScope = (item) => !siteId || item.projectId === siteId;
      const matches = (...fields) => !search || fields.some((f) => lower(f).includes(search));

      const commodities = (platform.commodities || []).filter(Boolean);
      if (!selectedCommodityId || !commodities.some((c) => c.id === selectedCommodityId)) {
        const top = commodities.slice().sort((a, b) => num(b.exposureSAR) - num(a.exposureSAR))[0];
        selectedCommodityId = top ? top.id : null;
      }
      const commodity = commodities.find((c) => c.id === selectedCommodityId) || null;
      const totalExposure = commodities.reduce((n, c) => n + num(c.exposureSAR), 0);

      const supplierById = new Map((platform.suppliers || []).filter(Boolean).map((s) => [s.id, s]));
      const boqAll = (platform.boqItems || []).filter((b) => b && inScope(b)).map((b) => ({ ...b, supplier: supplierById.get(b.supplierId) || null }));
      const boqItems = boqAll.filter((b) => matches(b.code, b.description, b.supplier && b.supplier.name, b.specCompliance));

      // Suppliers: when a project is selected, narrow to those serving its BoQ (if any are referenced).
      const scopedIds = new Set(boqAll.map((b) => b.supplierId).filter(Boolean));
      let suppliers = (platform.suppliers || []).filter(Boolean);
      const suppliersNarrowed = !!siteId && suppliers.some((s) => scopedIds.has(s.id));
      if (suppliersNarrowed) suppliers = suppliers.filter((s) => scopedIds.has(s.id));
      let concentration = psel && typeof psel.supplierConcentration === 'function' && !siteId ? safe(() => psel.supplierConcentration(state), null) : null;
      if (!Array.isArray(concentration) || !concentration.length || !concentration.every((s) => s && typeof s.name === 'string')) concentration = suppliers.slice();
      concentration = concentration.slice().sort((a, b) => num(b.shareOfSpendPct) - num(a.shareOfSpendPct));
      const singleSource = suppliers.filter((s) => s.singleSource);

      let variance = psel && typeof psel.boqVariance === 'function' ? safe(() => psel.boqVariance(state, filters), null) : null;
      if (!Array.isArray(variance)) variance = boqAll.filter((b) => Math.abs(num(b.variancePct)) >= VARIANCE_WARN);
      const varianceCount = variance.filter((b) => b && (!siteId || b.projectId === siteId)).length;

      let longLead = psel && typeof psel.longLeadItems === 'function' ? safe(() => psel.longLeadItems(state, LONG_LEAD_DAYS), null) : null;
      if (!Array.isArray(longLead) || !longLead.every((b) => b && b.code)) longLead = boqAll.filter((b) => num(b.leadTimeDays) >= LONG_LEAD_DAYS);
      longLead = longLead
        .filter((b) => inScope(b))
        .map((b) => ({ ...b, supplier: b.supplier || supplierById.get(b.supplierId) || null, days: daysUntil(b.orderBy) }))
        .sort((a, b) => (a.days ?? 9999) - (b.days ?? 9999));

      const nonCompliant = boqAll.filter((b) => b.specCompliance === 'غير مطابق').length;

      let openRisks = psel && typeof psel.openAiRisks === 'function' ? safe(() => psel.openAiRisks(state, filters), null) : null;
      if (!Array.isArray(openRisks)) openRisks = (platform.aiRisks || []).filter((r) => r && !CLOSED_RISK.has(r.status) && inScope(r));
      const domainRisks = openRisks.filter((r) => r && r.category === CATEGORY).sort((a, b) => num(b.score) - num(a.score));

      let categoryScore = null;
      const scores = psel && typeof psel.categoryScores === 'function' ? safe(() => psel.categoryScores(state, filters), null) : null;
      if (Array.isArray(scores)) categoryScore = scores.find((s) => s && s.category === CATEGORY) || null;
      if (!categoryScore) {
        const vals = domainRisks.map((r) => num(r.score));
        const score = vals.length ? Math.round(0.5 * Math.max(...vals) + 0.5 * (vals.reduce((a, b) => a + b, 0) / vals.length)) : 0;
        categoryScore = { category: CATEGORY, score, rating: ratingOf(score), open: vals.length, red: vals.filter((v) => v >= 70).length, trend: [] };
      }

      const pipeline = (platform.pipelines || []).find((p) => p && p.id === PIPELINE_ID) || null;

      return {
        state, filters, siteId, search, platform,
        commodities, commodity, totalExposure,
        suppliers, suppliersNarrowed, concentration, singleSource, supplierById,
        boqAll, boqItems, varianceCount, longLead, nonCompliant,
        domainRisks, categoryScore, pipeline,
      };
    }

    /* ───────────────────────── actions ───────────────────────── */

    function relatedRisks(platform, item) {
      const code = lower(item.code);
      return (platform.aiRisks || []).filter((r) => r && r.category === CATEGORY && !CLOSED_RISK.has(r.status) && r.projectId === item.projectId
        && lower(`${r.evidence && r.evidence.ref} ${r.evidence && r.evidence.excerpt} ${r.title} ${r.driverExplanation}`).includes(code));
    }

    function createProcurementTask(data, item) {
      if (typeof store.addTask !== 'function') { toast('إنشاء المهام غير متاح حالياً — وحدة مهام المنصة لم تُحمَّل بعد.', { tone: 'warning' }); return null; }
      const risk = relatedRisks(data.platform, item)[0] || null;
      const title = `معالجة توريد — ${item.code}: ${item.description}`;
      const dup = (data.platform.tasks || []).find((t) => t && OPEN_TASK.has(t.status) && ((risk && t.riskId === risk.id) || t.title === title));
      if (dup) { toast(`توجد مهمة مفتوحة بالفعل (${dup.code || dup.id}) لهذا البند.`, { tone: 'neutral', action: { label: 'فتح المهام', onClick: () => router.navigate('tasks') } }); return dup; }
      const overdue = (daysUntil(item.orderBy) ?? 1) < 0;
      let task = null;
      try {
        task = store.addTask({
          title,
          projectId: item.projectId,
          riskId: risk ? risk.id : null,
          owner: PROCUREMENT_OWNER,
          dueDate: isoPlusDays(overdue ? 2 : 7),
          status: 'جديدة',
          source: 'manual',
          description: `فرق الكمية BoQ/BIM ${fmt.signed(num(item.variancePct), 1)}% · مدة التوريد ${fmt.num(num(item.leadTimeDays))} يوماً · المطابقة: ${item.specCompliance || '—'}${item.supplier ? ` · المورد: ${item.supplier.name}` : ''}`,
          origin: { view: 'bom', boqItemId: item.id },
        });
      } catch (err) { console.warn('[bom] addTask failed', err); toast('تعذر إنشاء المهمة. حاول مرة أخرى.', { tone: 'critical' }); return null; }
      const code = task && (task.code || task.id);
      toast(`أُنشئت مهمة توريد${code ? ` ${code}` : ''} وأُسندت إلى ${PROCUREMENT_OWNER}${risk ? ` — مرتبطة بالمخاطرة ${risk.code}` : ''}.`, { tone: 'good', action: { label: 'فتح المهام', onClick: () => router.navigate('tasks') } });
      return task;
    }

    /* ───────────────────────── drawer ───────────────────────── */

    function openItem(data, item) {
      if (!item) return;
      if (openDrawer) { try { openDrawer.close(); } catch { /* ignore */ } openDrawer = null; }
      const s = item.supplier;
      const qtyDiff = num(item.bimQty) - num(item.boqQty);
      const costImpact = Math.abs(qtyDiff) * num(item.unitPrice);
      const related = relatedRisks(data.platform, item);
      const vTone = varianceTone(item.variancePct);
      const body = h('div', { class: 'stack gap-4' },
        h('section', { class: 'drawer-section' },
          h('div', { class: 'row between wrap gap-2', style: { marginBlockEnd: '10px' } },
            h('div', { class: 'row gap-2 wrap', style: { alignItems: 'center' } }, statusBadge(item.specCompliance, SPEC_TONE), varianceBadge(item.variancePct)),
            scoreCell(item.riskScore, { large: true }),
          ),
          kv([
            ['المشروع', siteName(data.state, item.projectId)],
            ['الوحدة', item.unit || '—'],
            ['كمية جدول الكميات (BoQ)', mono(fmt.num(num(item.boqQty), { maximumFractionDigits: 1 }))],
            ['كمية نموذج BIM', mono(fmt.num(num(item.bimQty), { maximumFractionDigits: 1 }))],
            ['الفرق', h('span', { class: ['row', 'gap-2', `tone-${vTone}`], style: { alignItems: 'center' } }, mono(`${fmt.signed(qtyDiff, 1)} ${item.unit || ''}`), varianceBadge(item.variancePct))],
            ['سعر الوحدة', `${fmt.num(num(item.unitPrice), { maximumFractionDigits: 2 })} ر.س`],
            ['الأثر المالي التقديري للفرق', h('span', { class: `tone-${vTone}` }, `${fmt.num(Math.round(costImpact))} ر.س`)],
            ['مدة التوريد', `${fmt.num(num(item.leadTimeDays))} يوماً${num(item.leadTimeDays) >= LONG_LEAD_DAYS ? ' — بند طويل التوريد' : ''}`],
            ['آخر موعد للطلب', orderByCell(item.orderBy)],
            ['مطلوب في الموقع', fmt.date(item.requiredBy)],
          ]),
        ),
        h('section', { class: 'drawer-section' },
          h('h3', { class: 'drawer-section-title' }, 'المورد'),
          s ? h('div', { class: 'stack gap-3' },
            h('div', { class: 'row between wrap gap-2' },
              h('div', { class: 'stack gap-1' }, h('span', { class: 'semibold' }, s.name), h('span', { class: 'text-xs muted' }, `${s.category || '—'} · ${s.country || '—'}`)),
              h('div', { class: 'row gap-2 wrap' }, s.singleSource ? badge('مصدر وحيد', 'critical') : badge('مصادر متعددة', 'good'), badge(`تصنيف ائتماني ${s.creditRating || '—'}`, CREDIT_TONE[s.creditRating] || 'neutral')),
            ),
            h('div', { class: 'bar-pair' },
              h('div', { class: 'bar-pair-row' }, h('span', {}, 'الصحة المالية'), progress({ value: num(s.financialHealth), max: 100, tone: num(s.financialHealth) >= 70 ? 'good' : num(s.financialHealth) >= 50 ? 'warning' : 'critical', label: 'الصحة المالية للمورد' }), h('span', { class: 'progress-value' }, fmt.num(num(s.financialHealth)))),
              h('div', { class: 'bar-pair-row' }, h('span', {}, 'أداء التسليم'), progress({ value: num(s.deliveryPerformancePct), max: 100, tone: num(s.deliveryPerformancePct) >= 90 ? 'good' : num(s.deliveryPerformancePct) >= 75 ? 'warning' : 'critical', label: 'أداء التسليم في الموعد' }), h('span', { class: 'progress-value' }, fmt.pct(num(s.deliveryPerformancePct)))),
              h('div', { class: 'bar-pair-row' }, h('span', {}, 'حصة الإنفاق'), progress({ value: num(s.shareOfSpendPct), max: 100, tone: 'brand', label: 'حصة المورد من الإنفاق' }), h('span', { class: 'progress-value' }, fmt.pct(num(s.shareOfSpendPct), 1))),
            ),
          ) : h('p', { class: 'text-sm muted' }, 'لم يُحدَّد مورد لهذا البند بعد.'),
        ),
        h('section', { class: 'drawer-section' },
          h('h3', { class: 'drawer-section-title' }, `المخاطر الذكية المرتبطة (${fmt.num(related.length)})`),
          related.length
            ? h('ul', { class: 'urgent-list' }, ...related.map((r) => h('li', { class: 'urgent-item' },
              h('span', { class: 'urgent-icon' }, svgIcon('shield-alert', 15)),
              h('div', { class: 'urgent-text' }, h('span', { class: 'row gap-2 wrap', style: { alignItems: 'center' } }, mono(r.code), h('span', {}, r.title)), h('span', { class: 'urgent-sub' }, `${r.owner || 'بدون مالك'} · ${r.status}`)),
              h('div', { class: 'urgent-due' }, scoreCell(r.score), button('فتح', { variant: 'ghost', size: 'sm', onClick: () => { if (openDrawer) openDrawer.close(); router.navigate('airisks', { risk: r.id }); } })),
            )))
            : h('p', { class: 'text-sm muted' }, 'لم يرصد المحرك مخاطر مفتوحة مرتبطة بهذا البند.'),
        ),
      );
      openDrawer = drawer({
        title: item.description,
        subtitle: `${item.code} · ${siteName(data.state, item.projectId)}`,
        body, size: 'lg',
        actions: [
          { label: 'إنشاء مهمة توريد', variant: 'primary', icon: svgIcon('list', 16), closes: false, onClick: () => { createProcurementTask(data, item); return false; } },
          { label: 'إغلاق', variant: 'ghost' },
        ],
        onClose: () => { openDrawer = null; },
      });
      openDrawer.open();
    }

    /* ───────────────────────── sections ───────────────────────── */

    function scopeLabel(data) { return data.siteId ? siteName(data.state, data.siteId) : 'جميع المشاريع'; }

    function buildHead(data) {
      const cs = data.categoryScore;
      const pill = cs ? h('div', { class: 'row gap-2', style: { alignItems: 'center' }, title: 'درجة مجال المواد = 0.5 × أعلى درجة مفتوحة + 0.5 × متوسط الدرجات المفتوحة' },
        h('span', { class: 'text-xs muted' }, 'درجة المجال'), mono(fmt.num(num(cs.score)), 'text-lg semibold'), ratingBadge(cs.score)) : null;
      return h('div', { class: 'view-head' },
        h('div', { class: 'view-head-text' },
          h('span', { class: 'code-tag' }, 'DOM-02'),
          h('h1', { tabindex: '-1' }, 'مخاطر المواد والتوريد (BoM)'),
          h('p', { class: 'view-lead' }, `توقعات أسعار السلع والتعرض لها، تركّز الموردين والمصادر الوحيدة، فروقات الكميات بين جدول الكميات ونموذج BIM، والبنود طويلة التوريد — لـ${scopeLabel(data)}.`),
        ),
        h('div', { class: 'view-actions' },
          pill,
          button('سجل المخاطر الذكي', { variant: 'outline', size: 'sm', icon: svgIcon('shield-alert', 15), onClick: () => router.navigate('airisks', { category: CATEGORY }) }),
        ),
      );
    }

    function buildKpis(data) {
      const cs = data.categoryScore;
      const spark = cs && Array.isArray(cs.trend) && cs.trend.length > 1 ? makeChart('sparkline', { values: cs.trend, width: 96, height: 28, color: 'var(--ink-3)', accentLast: true }) : null;
      const overdueLong = data.longLead.filter((b) => b.days !== null && b.days < 0).length;
      return h('div', { class: 'kpi-row' },
        statTile({ label: 'درجة مجال المواد والتوريد', value: num(cs.score), unit: '/ 100', tone: ratingTone(ratingOf(cs.score)), icon: svgIcon('list', 18), spark, hint: `${fmt.num(cs.open || 0)} مخاطر مفتوحة · ${fmt.num(cs.red || 0)} حمراء — ${RATING_META[ratingOf(cs.score)].hint}` }),
        statTile({ label: 'التعرض لأسعار السلع', value: fmt.compact(data.totalExposure), unit: 'ر.س', tone: 'brand', icon: svgIcon('chart', 18), hint: `${fmt.num(data.commodities.length)} سلع مراقبة · ${fmt.num(data.commodities.filter((c) => c.trend === 'صاعد').length)} منها في اتجاه صاعد (على مستوى المحفظة)` }),
        statTile({ label: 'موردون أحاديو المصدر', value: data.singleSource.length, tone: data.singleSource.length ? 'critical' : 'good', icon: glyph(data.singleSource.length ? 'critical' : 'good', 18), hint: data.singleSource.length ? `${data.singleSource.map((s) => s.name).slice(0, 3).join('، ')}${data.singleSource.length > 3 ? ' …' : ''}` : 'لكل بند مورد بديل مؤهل', onClick: () => { const t = root.querySelector('[data-section="suppliers"]'); if (t) t.scrollIntoView({ behavior: 'smooth', block: 'start' }); } }),
        statTile({ label: 'فروقات BoQ↔BIM ≥ 5%', value: data.varianceCount, tone: data.boqAll.some((b) => Math.abs(num(b.variancePct)) >= VARIANCE_CRIT) ? 'critical' : data.varianceCount ? 'warning' : 'good', icon: glyph('warning', 18), hint: `من أصل ${fmt.num(data.boqAll.length)} بنداً ضمن النطاق`, onClick: () => { const t = root.querySelector('[data-section="variance"]'); if (t) t.scrollIntoView({ behavior: 'smooth', block: 'start' }); } }),
        statTile({ label: 'بنود طويلة التوريد', value: data.longLead.length, tone: overdueLong ? 'critical' : data.longLead.length ? 'warning' : 'good', icon: glyph('clock', 18), hint: overdueLong ? `${fmt.num(overdueLong)} بنداً تجاوز آخر موعد للطلب` : `مدة توريد ≥ ${fmt.num(LONG_LEAD_DAYS)} يوماً` }),
        statTile({ label: 'بنود غير مطابقة للمواصفات', value: data.nonCompliant, tone: data.nonCompliant ? 'serious' : 'good', icon: glyph(data.nonCompliant ? 'serious' : 'good', 18), hint: `${fmt.num(data.boqAll.filter((b) => b.specCompliance === 'قيد المراجعة').length)} بنداً قيد المراجعة` }),
      );
    }

    function buildCommodityCard(data) {
      const c = data.commodity;
      const options = data.commodities.map((x) => ({ value: x.id, label: x.name }));
      const seg = components.segmented({ options, value: selectedCommodityId, ariaLabel: 'اختيار السلعة', onChange: (v) => { selectedCommodityId = v; schedule(); } });
      seg.el.classList.add('seg-sm');
      if (!c) return card({ code: 'BOM-01', title: 'أسعار السلع والتوقعات', className: 'col-span-8', body: emptyState({ title: 'لا توجد سلع مراقبة' }) });

      const series = Array.isArray(c.series) ? c.series.map(num) : [];
      const forecast = Array.isArray(c.forecast) ? c.forecast.map(num) : [];
      const labels = monthLabels(series.length, forecast.length);
      const actualValues = series.concat(new Array(forecast.length).fill(null));
      const forecastValues = new Array(Math.max(0, series.length - 1)).fill(null).concat(series.length ? [series[series.length - 1]] : []).concat(forecast);
      const chart = series.length ? makeChart('lineChart', {
        series: [
          { id: 'actual', label: 'السعر الفعلي', color: 'var(--s1)', values: actualValues },
          { id: 'forecast', label: 'توقع', color: 'var(--s2)', values: forecastValues },
        ],
        labels, height: 240, yFormat: (v) => fmt.num(v, { maximumFractionDigits: 1 }),
        ariaLabel: `سعر ${c.name} (${c.unit}) خلال 24 شهراً مع توقع 6 أشهر`,
      }) : null;
      const fallback = () => simpleTable(`سعر ${c.name}`, ['الشهر', 'السعر الفعلي', 'توقع'], labels.map((l, i) => [l, actualValues[i] === null ? '—' : fmt.num(actualValues[i], { maximumFractionDigits: 1 }), forecastValues[i] === null || forecastValues[i] === undefined ? '—' : fmt.num(forecastValues[i], { maximumFractionDigits: 1 })]));

      const last = series.length ? series[series.length - 1] : 0;
      const first = series.length ? series[0] : 0;
      const end = forecast.length ? forecast[forecast.length - 1] : last;
      const change24 = first ? ((last - first) / first) * 100 : 0;
      const change6 = last ? ((end - last) / last) * 100 : 0;
      const fact = (label, value, sub = null, tone = null) => h('div', { class: ['fact', tone ? `tone-${tone}` : null] }, h('span', { class: 'fact-label' }, label), h('span', { class: 'fact-value' }, value), sub ? h('span', { class: 'text-xs muted' }, sub) : null);
      const facts = h('div', { class: 'hero-facts', style: { gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))' } },
        fact('آخر سعر', h('span', {}, mono(fmt.num(last, { maximumFractionDigits: 1 })), h('small', {}, ` ر.س / ${c.unit || 'وحدة'}`)), `${fmt.signed(change24, 1)}% خلال 24 شهراً`),
        fact('التقلب السنوي', h('span', {}, mono(fmt.pct(num(c.volatilityPct), 1))), num(c.volatilityPct) >= 20 ? 'تقلب مرتفع' : num(c.volatilityPct) >= 10 ? 'تقلب متوسط' : 'تقلب منخفض', num(c.volatilityPct) >= 20 ? 'critical' : num(c.volatilityPct) >= 10 ? 'warning' : 'good'),
        fact('التعرض', h('span', {}, mono(fmt.compact(num(c.exposureSAR))), h('small', {}, ' ر.س')), `${fmt.pct(data.totalExposure ? (num(c.exposureSAR) / data.totalExposure) * 100 : 0)} من إجمالي التعرض`),
        fact('التوقع لـ 6 أشهر', h('span', { class: 'row gap-2', style: { alignItems: 'center' } }, mono(`${fmt.signed(change6, 1)}%`), trendBadge(c.trend)), `إلى ${fmt.num(end, { maximumFractionDigits: 1 })} ر.س / ${c.unit || 'وحدة'}`),
      );
      const body = h('div', { class: 'stack gap-3' },
        chart ? chart.el : fallback(),
        facts,
        h('p', { class: 'text-xs muted' }, 'السلسلة الزرقاء هي الأسعار التاريخية الشهرية؛ السلسلة البرتقالية «توقع» ناتجة من نموذج السلاسل الزمنية لمحرك BoM وتبدأ من آخر سعر فعلي. مؤشرات السلع على مستوى المحفظة ولا تتأثر بفلتر المشروع.'),
      );
      return card({
        code: 'BOM-01', title: 'أسعار السلع والتوقعات', className: 'col-span-8',
        subtitle: `${c.name} — ${fmt.num(series.length)} شهراً فعلياً + ${fmt.num(forecast.length)} أشهر توقع`,
        actions: [seg.el], body, tableView: tableOf(chart, fallback),
      });
    }

    function buildExposureCard(data) {
      const rows = data.commodities.slice().sort((a, b) => num(b.exposureSAR) - num(a.exposureSAR));
      const list = h('div', { class: 'stack gap-2', role: 'list', 'aria-label': 'التعرض حسب السلعة' }, ...rows.map((c) => {
        const spark = makeChart('sparkline', { values: (c.series || []).map(num), width: 88, height: 26, color: 'var(--ink-3)', accentLast: true });
        const active = c.id === selectedCommodityId;
        const vol = num(c.volatilityPct);
        return h('button', {
          type: 'button', role: 'listitem', class: ['urgent-item', active ? 'is-selected' : null], 'aria-pressed': active ? 'true' : 'false',
          style: { inlineSize: '100%', textAlign: 'start', cursor: 'pointer', background: active ? 'color-mix(in srgb, var(--brand) 10%, transparent)' : undefined, borderColor: active ? 'color-mix(in srgb, var(--brand) 45%, var(--line))' : undefined, font: 'inherit', color: 'inherit' },
          onClick: () => { selectedCommodityId = c.id; schedule(); },
        },
        h('span', { class: 'urgent-icon' }, glyph((TREND_META[c.trend] || TREND_META['مستقر']).glyph, 15)),
        h('div', { class: 'urgent-text' },
          h('span', { class: 'row gap-2 wrap', style: { alignItems: 'center' } }, h('span', { class: 'semibold' }, c.name), trendBadge(c.trend)),
          h('span', { class: 'urgent-sub' }, `تقلب ${fmt.pct(vol, 1)} · التعرض ${sar(c.exposureSAR)}`),
        ),
        h('div', { class: 'urgent-due' }, spark ? spark.el : mono(fmt.num((c.series || []).slice(-1)[0], { maximumFractionDigits: 1 }))),
        );
      }));
      const fallback = () => simpleTable('التعرض حسب السلعة', ['السلعة', 'الاتجاه', 'التقلب', 'التعرض'], rows.map((c) => [c.name, c.trend || '—', fmt.pct(num(c.volatilityPct), 1), sar(c.exposureSAR)]));
      return card({
        code: 'BOM-02', title: 'التعرض والتقلب حسب السلعة', className: 'col-span-4',
        subtitle: `إجمالي التعرض ${sar(data.totalExposure)} — انقر لاختيار السلعة`,
        body: rows.length ? list : emptyState({ title: 'لا توجد سلع' }), tableView: fallback,
      });
    }

    function buildSuppliersCard(data) {
      const items = data.concentration.slice(0, 12).map((s) => ({ id: s.id, label: s.name, value: num(s.shareOfSpendPct) }));
      const chart = items.length ? makeChart('barChart', {
        items, horizontal: true, height: Math.max(220, items.length * 30 + 24), valueFormat: (v) => fmt.pct(v, 1), color: 'var(--s1)', showValues: true, maxBars: 12,
        ariaLabel: 'حصة كل مورد من الإنفاق، مرتبة تنازلياً',
      }) : null;
      const fallback = () => simpleTable('تركّز الموردين', ['المورد', 'حصة الإنفاق', 'المصدر', 'التصنيف الائتماني', 'مدة التوريد'], data.concentration.map((s) => [s.name, fmt.pct(num(s.shareOfSpendPct), 1), s.singleSource ? 'مصدر وحيد' : 'متعدد', s.creditRating || '—', `${fmt.num(num(s.leadTimeDays))} يوماً`]));
      const flagged = data.concentration.filter((s) => s.singleSource || s.creditRating === 'C' || num(s.financialHealth) < 50).slice(0, 6);
      const body = h('div', { class: 'stack gap-3' },
        chart ? chart.el : fallback(),
        flagged.length ? h('div', { class: 'stack gap-2' },
          h('h3', { class: 'drawer-section-title', style: { marginBlockEnd: 0 } }, 'موردون يتطلبون المتابعة'),
          h('ul', { class: 'urgent-list' }, ...flagged.map((s) => h('li', { class: ['urgent-item', s.singleSource ? 'tone-critical' : 'tone-warning'] },
            h('span', { class: 'urgent-icon' }, glyph(s.singleSource ? 'critical' : 'warning', 15)),
            h('div', { class: 'urgent-text' },
              h('span', { class: 'row gap-2 wrap', style: { alignItems: 'center' } }, h('span', { class: 'semibold' }, s.name), s.singleSource ? badge('مصدر وحيد', 'critical') : null, badge(`ائتمان ${s.creditRating || '—'}`, CREDIT_TONE[s.creditRating] || 'neutral')),
              h('span', { class: 'urgent-sub' }, `${s.category || '—'} · ${s.country || '—'} · صحة مالية ${fmt.num(num(s.financialHealth))} · تسليم في الموعد ${fmt.pct(num(s.deliveryPerformancePct))}`),
            ),
            h('div', { class: 'urgent-due' }, mono(fmt.pct(num(s.shareOfSpendPct), 1)), h('span', {}, `${fmt.num(num(s.leadTimeDays))} يوم توريد`)),
          ))),
        ) : h('p', { class: 'text-sm muted' }, 'لا يوجد موردون بمصدر وحيد أو تصنيف ائتماني منخفض ضمن النطاق.'),
      );
      const el = card({
        code: 'BOM-03', title: 'تركّز الموردين والمصادر الوحيدة', className: 'col-span-6',
        subtitle: data.suppliersNarrowed ? `موردو بنود ${scopeLabel(data)} — ${fmt.num(data.suppliers.length)} مورداً` : `حصة الإنفاق على مستوى المحفظة — ${fmt.num(data.suppliers.length)} مورداً`,
        body, tableView: tableOf(chart, fallback),
      });
      el.dataset.section = 'suppliers';
      return el;
    }

    function buildLongLeadCard(data) {
      const rows = data.longLead.slice(0, 12);
      const list = rows.length ? h('ul', { class: 'urgent-list', 'aria-label': 'البنود طويلة التوريد' }, ...rows.map((b) => {
        const overdue = b.days !== null && b.days < 0;
        const soon = b.days !== null && b.days >= 0 && b.days <= 14;
        return h('li', { class: ['urgent-item', overdue ? 'is-overdue' : null, overdue ? 'tone-critical' : soon ? 'tone-warning' : 'tone-neutral'] },
          h('span', { class: 'urgent-icon' }, glyph(overdue ? 'critical' : soon ? 'warning' : 'clock', 15)),
          h('div', { class: 'urgent-text' },
            h('button', { type: 'button', class: 'btn btn-ghost btn-sm', style: { blockSize: 'auto', padding: 0, justifyContent: 'flex-start', textAlign: 'start', whiteSpace: 'normal', fontSize: 'var(--fs-sm)' }, onClick: () => openItem(data, b) }, h('span', { class: 'row gap-2 wrap', style: { alignItems: 'center' } }, mono(b.code), h('span', {}, b.description))),
            h('span', { class: 'urgent-sub row gap-2 wrap' }, h('span', {}, b.supplier ? b.supplier.name : 'بدون مورد'), b.supplier && b.supplier.singleSource ? badge('مصدر وحيد', 'critical') : null, h('span', {}, `مدة التوريد ${fmt.num(num(b.leadTimeDays))} يوماً`), h('span', {}, siteName(data.state, b.projectId))),
          ),
          h('div', { class: 'urgent-due' }, h('span', {}, `آخر موعد للطلب ${fmt.date(b.orderBy, { style: 'short' })}`), badge(overdue ? `متأخر ${fmt.num(Math.abs(b.days))} يوم` : b.days === 0 ? 'اليوم' : `خلال ${fmt.num(b.days)} يوماً`, overdue ? 'critical' : soon ? 'warning' : 'neutral')),
        );
      })) : emptyState({ title: 'لا توجد بنود طويلة التوريد ضمن النطاق', text: `البند طويل التوريد عندما تبلغ مدة توريده ${fmt.num(LONG_LEAD_DAYS)} يوماً أو أكثر.` });
      return card({
        code: 'BOM-04', title: 'البنود طويلة التوريد', className: 'col-span-6',
        subtitle: `${fmt.num(data.longLead.length)} بنداً بمدة توريد ≥ ${fmt.num(LONG_LEAD_DAYS)} يوماً — الأقرب إلى آخر موعد للطلب أولاً`,
        body: list,
        footer: data.longLead.length > rows.length ? h('p', { class: 'text-xs muted' }, `يُعرض ${fmt.num(rows.length)} من أصل ${fmt.num(data.longLead.length)} بنداً.`) : null,
      });
    }

    function buildVarianceCard(data) {
      const rows = data.boqItems.map((b) => ({ ...b, _absVar: Math.abs(num(b.variancePct)), _supplierName: b.supplier ? b.supplier.name : '' }));
      const table = dataTable({
        caption: 'فروقات الكميات بين جدول الكميات ونموذج BIM',
        pageSize: 10, rowKey: 'id',
        emptyText: data.search ? 'لا توجد بنود مطابقة للبحث' : 'لا توجد بنود ضمن هذا النطاق',
        onRowClick: (r) => openItem(data, r),
        initialSort: { key: '_absVar', dir: 'desc' },
        columns: [
          { key: 'code', label: 'الرمز', mono: true, width: 110, render: (r) => mono(r.code) },
          { key: 'description', label: 'الوصف', render: (r) => h('div', { class: 'stack gap-1' }, h('span', { class: 'semibold' }, r.description), h('span', { class: 'text-xs muted' }, `${siteName(data.state, r.projectId)} · ${r.unit || ''}`)) },
          { key: 'boqQty', label: 'كمية BoQ', align: 'end', render: (r) => mono(fmt.num(num(r.boqQty), { maximumFractionDigits: 1 })), sortValue: (r) => num(r.boqQty) },
          { key: 'bimQty', label: 'كمية BIM', align: 'end', render: (r) => mono(fmt.num(num(r.bimQty), { maximumFractionDigits: 1 })), sortValue: (r) => num(r.bimQty) },
          { key: '_absVar', label: 'الفرق %', render: (r) => varianceBadge(r.variancePct), sortValue: (r) => r._absVar },
          { key: '_supplierName', label: 'المورد', render: (r) => (r.supplier ? h('div', { class: 'row gap-1 wrap', style: { alignItems: 'center' } }, h('span', {}, r.supplier.name), r.supplier.singleSource ? badge('مصدر وحيد', 'critical') : null) : h('span', { class: 'muted' }, '—')) },
          { key: 'leadTimeDays', label: 'مدة التوريد', align: 'end', render: (r) => h('span', { class: num(r.leadTimeDays) >= LONG_LEAD_DAYS ? 'semibold' : null }, `${fmt.num(num(r.leadTimeDays))} يوم`), sortValue: (r) => num(r.leadTimeDays) },
          { key: 'orderBy', label: 'آخر موعد للطلب', render: (r) => orderByCell(r.orderBy), sortValue: (r) => (fmt.toDate(r.orderBy) || new Date(0)).getTime() },
          { key: 'specCompliance', label: 'المطابقة', render: (r) => statusBadge(r.specCompliance, SPEC_TONE) },
        ],
        rows,
      });
      const el = card({
        code: 'BOM-05', title: 'فروقات الكميات BoQ ↔ BIM', className: 'col-span-12',
        subtitle: `${fmt.num(rows.length)} بنداً — ${fmt.num(data.varianceCount)} منها بفرق ≥ ${fmt.num(VARIANCE_WARN)}% · مرتبة حسب حجم الفرق`,
        body: table.el,
        footer: h('div', { class: 'tone-legend' },
          h('span', { class: 'tone-legend-item tone-good' }, glyph('good', 12), h('span', {}, 'ضمن ± 5%')),
          h('span', { class: 'tone-legend-item tone-warning' }, glyph('warning', 12), h('span', {}, '5% – 15%: مراجعة الكميات')),
          h('span', { class: 'tone-legend-item tone-critical' }, glyph('critical', 12), h('span', {}, '≥ 15%: خطر تجاوز أو نقص')),
        ),
      });
      el.dataset.section = 'variance';
      return el;
    }

    function buildRisksCard(data) {
      const rows = data.domainRisks;
      const red = rows.filter((r) => ratingOf(r.score) === 'red').length;
      const table = dataTable({
        caption: 'المخاطر المكتشفة في مجال المواد والتوريد',
        pageSize: 8, rowKey: 'id',
        emptyText: 'لا توجد مخاطر مفتوحة في هذا المجال ضمن النطاق',
        onRowClick: (r) => router.navigate('airisks', { risk: r.id }),
        initialSort: { key: 'score', dir: 'desc' },
        columns: [
          { key: 'code', label: 'الرمز', mono: true, width: 110, render: (r) => mono(r.code) },
          { key: 'title', label: 'المخاطرة', render: (r) => h('div', { class: 'stack gap-1' }, h('span', { class: 'semibold' }, r.title), h('span', { class: 'text-xs muted' }, `${siteName(data.state, r.projectId)}${r.evidence && r.evidence.ref ? ` · ${r.evidence.ref}` : ''}`)) },
          { key: 'score', label: 'الدرجة والتصنيف', render: (r) => scoreCell(r.score), sortValue: (r) => num(r.score) },
          { key: 'type', label: 'النوع', render: (r) => typeChip(r.type) },
          { key: 'owner', label: 'المالك', render: (r) => r.owner || h('span', { class: 'muted' }, 'غير مُسند') },
          { key: 'status', label: 'الحالة', render: (r) => statusBadge(r.status, RISK_STATUS_TONE) },
        ],
        rows,
      });
      return card({
        code: 'BOM-06', title: 'المخاطر المكتشفة في هذا المجال', className: 'col-span-12',
        subtitle: `${fmt.num(rows.length)} مخاطر مفتوحة من محرك توقعات BoM · ${fmt.num(red)} بتصنيف أحمر — انقر لفتح المخاطرة في السجل الذكي`,
        actions: [button('السجل الذكي', { variant: 'ghost', size: 'sm', icon: svgIcon('shield-alert', 14), onClick: () => router.navigate('airisks', { category: CATEGORY }) })],
        body: table.el,
      });
    }

    function buildKriCard(data) {
      const pipeline = data.pipeline;
      const kris = pipeline && Array.isArray(pipeline.kris) ? pipeline.kris : [];
      const asText = (v) => (Array.isArray(v) ? v.filter(Boolean).join(' · ') : String(v ?? '—'));
      const table = h('table', { class: 'kri-table table is-dense' },
        h('caption', { class: 'sr-only' }, 'مصفوفة مؤشرات المخاطر الرئيسية لمحرك المواد والتوريد: المؤشر، التقنية، المدخلات، إجراء المعالجة'),
        h('thead', {}, h('tr', {}, h('th', { scope: 'col' }, 'المؤشر'), h('th', { scope: 'col' }, 'تقنية الذكاء الاصطناعي'), h('th', { scope: 'col' }, 'مدخلات البيانات'), h('th', { scope: 'col' }, 'إجراء المعالجة'))),
        h('tbody', {}, ...kris.map((k) => h('tr', {},
          h('td', { 'data-label': 'المؤشر', style: { fontWeight: 600 } }, asText(k.indicator)),
          h('td', { 'data-label': 'تقنية الذكاء الاصطناعي' }, asText(k.technique)),
          h('td', { 'data-label': 'مدخلات البيانات' }, asText(k.inputs)),
          h('td', { 'data-label': 'إجراء المعالجة' }, asText(k.mitigation)),
        ))),
      );
      const bodyWrap = h('div', { class: 'table-wrap' }, kris.length ? table : emptyState({ title: 'مصفوفة المؤشرات غير متاحة', text: 'لم تُحمَّل بيانات خط أنابيب محرك BoM بعد.' }));
      const toggle = button(kriOpen ? 'طيّ' : 'عرض', { variant: 'ghost', size: 'sm', icon: glyph('chevronDown', 14), attrs: { 'aria-expanded': kriOpen ? 'true' : 'false', 'aria-controls': 'bom-kri-body' } });
      const el = card({
        code: 'BOM-07', title: 'مصفوفة مؤشرات المخاطر والمعالجة', className: 'col-span-12',
        subtitle: pipeline ? `${pipeline.nameAr || pipeline.name} · ${pipeline.version || ''} · ${fmt.num(kris.length)} مؤشرات رئيسية (KRIs) من المقترح` : 'محرك توقعات BoM',
        actions: [toggle], body: bodyWrap,
      });
      el.classList.add('kri-card');
      const bodyEl = el.querySelector('.card-body');
      if (bodyEl) { bodyEl.id = 'bom-kri-body'; bodyEl.hidden = !kriOpen; }
      const ic = toggle.querySelector('svg');
      if (ic && !kriOpen) ic.style.transform = 'rotate(180deg)';
      toggle.addEventListener('click', () => {
        kriOpen = !kriOpen;
        if (bodyEl) bodyEl.hidden = !kriOpen;
        toggle.setAttribute('aria-expanded', kriOpen ? 'true' : 'false');
        const lbl = toggle.querySelector('.btn-label'); if (lbl) lbl.textContent = kriOpen ? 'طيّ' : 'عرض';
        if (ic) ic.style.transform = kriOpen ? '' : 'rotate(180deg)';
      });
      return el;
    }

    /* ───────────────────────── build ───────────────────────── */

    function build() {
      raf = 0;
      const data = collect();
      const frag = document.createDocumentFragment();
      if (!data.platform) {
        frag.append(
          buildHead({ ...data, categoryScore: null }),
          emptyState({ icon: svgIcon('list', 32), title: 'بيانات المنصة غير متاحة بعد', text: 'لم تُحمَّل بيانات منصة إدارة المخاطر (state.platform). أعد تحميل الصفحة بعد اكتمال التهيئة.' }),
        );
        root.replaceChildren(frag);
        return;
      }
      frag.append(
        buildHead(data),
        buildKpis(data),
        h('div', { class: 'grid-12' }, buildCommodityCard(data), buildExposureCard(data)),
        h('div', { class: 'grid-12' }, buildSuppliersCard(data), buildLongLeadCard(data)),
        h('div', { class: 'grid-12' }, buildVarianceCard(data)),
        h('div', { class: 'grid-12' }, buildRisksCard(data)),
        h('div', { class: 'grid-12' }, buildKriCard(data)),
      );
      root.replaceChildren(frag);
    }

    function schedule() { if (!raf) raf = requestAnimationFrame(build); }

    const IGNORE = /^(feed|sensors|integrations|permits|incidents|inspections|risks|workers|platform\.(validation|connectors|auditLog|pipelines|alerts))/;
    const unsubs = [
      bus.on('store:change', (payload) => { const path = payload && payload.path ? String(payload.path) : '*'; if (!IGNORE.test(path)) schedule(); }),
      bus.on('filters:change', (payload) => { const key = payload && payload.key; if (!key || key === 'siteId' || key === 'range' || key === 'search') schedule(); }),
      bus.on('settings:change', (payload) => {
        const s = (payload && payload.settings) || store.state.settings || {};
        const numerals = s.numerals || 'latn';
        const platformJson = safe(() => JSON.stringify(s.platform || null), 'null');
        if (numerals !== lastNumerals || platformJson !== lastPlatformSettings) { lastNumerals = numerals; lastPlatformSettings = platformJson; schedule(); }
      }),
    ];

    build();

    // Deep links: #/bom?item=BQ-… opens a BoQ item; #/bom?commodity=… preselects a commodity.
    if (ctx.params && ctx.params.commodity) { selectedCommodityId = String(ctx.params.commodity); build(); }
    const wantItem = ctx.params && (ctx.params.item || ctx.params.id);
    if (wantItem) {
      const data = collect();
      const item = data.platform ? data.boqAll.find((b) => b.id === wantItem || b.code === wantItem) : null;
      if (item) openItem(data, item);
    }

    return () => {
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      unsubs.forEach((u) => { try { if (typeof u === 'function') u(); } catch { /* ignore */ } });
      if (openDrawer) { try { openDrawer.close(); } catch { /* ignore */ } openDrawer = null; }
      root.remove();
    };
  },
};
