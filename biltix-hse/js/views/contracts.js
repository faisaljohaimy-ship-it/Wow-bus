/**
 * Biltix Risk AI — view: مخاطر العقود (js/views/contracts.js) — DOM-01
 *
 * Contract-NLP domain of the Risk Cockpit: flagged clauses, obligations calendar,
 * subcontractor concentration, the open AI risks of the `contract` category and the
 * pipeline's KRI matrix. Everything is scoped by the global project filter
 * (store.filters.siteId) and re-renders on store / filter / settings changes.
 *
 * Contract: docs/ARCHITECTURE.md Part A §4–§5 (components, charts), Part B §B2–B4,
 * §B8 class names (.rating, .type-chip, .kri-table, .evidence) and §B9 item 5.
 * Data reaches the DOM only through textContent / components.h. No imports: every
 * dependency arrives through `ctx` (store, bus, fmt, charts, components, psel, router).
 */

const DAY_MS = 86_400_000;
const OBLIGATION_WINDOW_DAYS = 60;
const OBLIGATION_KPI_DAYS = 30;
const CATEGORY = 'contract';
const PIPELINE_ID = 'contract-nlp';
const LEGAL_OWNER = 'الإدارة القانونية';

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
const FLAG_META = {
  ambiguous: { label: 'بند غامض' },
  payment: { label: 'شروط الدفع' },
  'liquidated-damages': { label: 'غرامات التأخير' },
  'insurance-missing': { label: 'غياب بند التأمين' },
  'indemnity-missing': { label: 'غياب بند التعويض' },
  'warranty-missing': { label: 'غياب بند الضمان' },
  obligation: { label: 'التزام تعاقدي' },
  'force-majeure': { label: 'القوة القاهرة' },
};
const CLAUSE_STATUS_TONE = { 'مفتوح': 'warning', 'قيد المراجعة القانونية': 'brand', 'مُعالج': 'good' };
const CONTRACT_STATUS_TONE = { 'ساري': 'good', 'قيد التفاوض': 'warning', 'منتهٍ': 'neutral' };
const RISK_STATUS_TONE = { 'مكتشف': 'neutral', 'تنبيه': 'warning', 'مهمة مُسندة': 'brand', 'قيد المعالجة': 'accent', 'مغلق': 'good', 'مُتجاوز': 'neutral' };
const CLOSED_RISK = new Set(['مغلق', 'مُتجاوز']);
const OPEN_TASK = new Set(['جديدة', 'قيد التنفيذ', 'متأخرة']);
const SUBCONTRACT_TYPE = 'عقد من الباطن';

const STYLE_ID = 'view-contracts-style';
const STYLE_TEXT = `@layer views {
  .view-contracts .grid-12 { align-items: start; }
  .view-contracts .code { font-family: var(--font-mono); font-variant-numeric: tabular-nums; unicode-bidi: isolate; }
}`;
const CODE_RE = /\b[A-Z]{1,5}-[A-Z0-9-]*\d[A-Z0-9-]*\b/g;
const OBLIGATIONS_DEFAULT = 6;

const safe = (fn, fallback) => { try { const v = fn(); return v === undefined ? fallback : v; } catch { return fallback; } };
const lower = (v) => String(v ?? '').toLowerCase();
/** Codes inside plain strings (drawer subtitles, toasts): bidi-isolated with non-breaking hyphens (RTL-5). */
const codeText = (code) => `\u2068${String(code ?? '').replace(/-/g, '\u2011')}\u2069`;

function ensureStyle() {
  if (typeof document === 'undefined' || document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = STYLE_TEXT;
  document.head.appendChild(style);
}

/** UI state that survives re-renders inside one visit (module-level, no persistence). */
let kriOpen = false;
let obligationsExpanded = false;

export default {
  id: 'contracts',
  code: 'DOM-01',
  title: 'مخاطر العقود',
  icon: 'file-text',

  render(container, ctx) {
    const { store, bus, fmt, charts, components, router } = ctx;
    const psel = ctx.psel || null;
    const { h, card, statTile, badge, dataTable, button, drawer, toast, emptyState, progress, svgIcon, glyph, kv } = components;

    ensureStyle();
    const root = h('section', { class: 'view view-contracts' });
    container.appendChild(root);

    let raf = 0;
    let openDrawer = null;
    let lastNumerals = safe(() => store.state.settings.numerals, 'latn');
    let lastPlatformSettings = safe(() => JSON.stringify(store.state.settings.platform || null), 'null');

    /* ───────────────────────── primitives ───────────────────────── */

    const mono = (text, extra = null) => h('span', { class: ['mono', ...String(extra || '').split(/\s+/).filter(Boolean)], style: { fontFamily: 'var(--font-mono)', fontVariantNumeric: 'tabular-nums' } }, String(text ?? '—'));
    /** A code such as CT-2026-014 as an isolated LTR mono run that never breaks (RTL-5). */
    const codeSpan = (code, extra = null) => h('span', { class: ['code', 'mono', 'nowrap', ...String(extra || '').split(/\s+/).filter(Boolean)], dir: 'ltr' }, String(code ?? '—'));
    /** Split a title mixing Arabic prose and Latin codes into text + code spans. */
    function withCodes(str) {
      const t = String(str ?? ''); const out = []; let last = 0; let m;
      CODE_RE.lastIndex = 0;
      while ((m = CODE_RE.exec(t))) { if (m.index > last) out.push(t.slice(last, m.index)); out.push(codeSpan(m[0])); last = m.index + m[0].length; }
      if (last < t.length) out.push(t.slice(last));
      return out.length ? out : [t];
    }
    const sar = (n) => (Number.isFinite(Number(n)) ? `${fmt.compact(Number(n))} ر.س` : '—');
    const startOfToday = () => { const d = store.now ? store.now() : new Date(); d.setHours(0, 0, 0, 0); return d; };
    const daysUntil = (iso) => { const d = fmt.toDate(iso); if (!d) return null; d.setHours(0, 0, 0, 0); return Math.round((d.getTime() - startOfToday().getTime()) / DAY_MS); };
    const isoPlusDays = (days) => { const d = startOfToday(); d.setDate(d.getDate() + days); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

    function ratingOf(score) {
      const s = Number(score) || 0;
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
    /** Rating badge: icon + Arabic label (never colour alone), B8 classes `.rating.is-red|yellow|green`. */
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
      return h('span', { class: 'row gap-2 nowrap', style: { alignItems: 'center' } }, mono(fmt.num(Number(score) || 0), 'semibold'), ratingBadge(score, opts));
    }
    /** Type chip (B8 `.type-chip`): icon + Arabic label; falls back to badge chrome without platform.css. */
    function typeChip(type) {
      const meta = TYPE_META[type] || { label: String(type || '—'), icon: 'file-text' };
      const label = psel && typeof psel.typeLabel === 'function' ? (safe(() => psel.typeLabel(type), null) || meta.label) : meta.label;
      const chip = badge(label, 'neutral', { icon: svgIcon(meta.icon, 14) });
      chip.classList.add('type-chip', `is-${lower(type) || 'unknown'}`);
      chip.dataset.type = String(type || '');
      return chip;
    }
    function statusBadge(status, map, fallback = 'neutral') {
      return badge(status || '—', map[status] || fallback);
    }
    function flagBadge(clause) {
      if (!clause || !clause.flag) return badge('بدون ملاحظات', 'good');
      const meta = FLAG_META[clause.flag] || { label: String(clause.flag) };
      const r = ratingOf(clause.severity);
      const b = badge(meta.label, ratingTone(r));
      b.title = `${RATING_META[r].hint} — الدرجة ${fmt.num(Number(clause.severity) || 0)}`;
      return b;
    }
    function dueBadge(iso, status) {
      const days = daysUntil(iso);
      if (status === 'منجز') return badge('منجز', 'good');
      if (status === 'متأخر' || (days !== null && days < 0)) return badge(days !== null && days < 0 ? `متأخر ${fmt.num(Math.abs(days))} يوم` : 'متأخر', 'critical');
      if (days === null) return badge('قادم', 'neutral');
      if (days === 0) return badge('اليوم', 'critical');
      if (days === 1) return badge('غداً', 'serious');
      if (days <= 7) return badge(`خلال ${fmt.num(days)} أيام`, 'serious');
      if (days <= 30) return badge(`خلال ${fmt.num(days)} يوماً`, 'warning');
      return badge(`خلال ${fmt.num(days)} يوماً`, 'neutral');
    }

    function makeChart(name, opts) {
      if (!charts || typeof charts[name] !== 'function') return null;
      try { const c = charts[name](opts); return c && c.el instanceof Node ? c : null; } catch (err) { console.warn(`[contracts] charts.${name} failed`, err); return null; }
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
      rows.forEach((r) => tb.appendChild(h('tr', {}, ...r.map((c, i) => h('td', { class: i > 0 && typeof c === 'string' && /^[\d٠-٩]/.test(c) ? 'num' : null }, c)))));
      t.appendChild(tb);
      return t;
    }
    function siteName(state, id) {
      const s = (state.sites || []).find((x) => x.id === id);
      return s ? s.name : (id || '—');
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

      const contractsAll = (platform.contracts || []).filter(inScope);
      const contracts = contractsAll.filter((c) => matches(c.code, c.title, c.counterparty, c.type));
      const today = startOfToday().getTime();

      const flaggedClauses = [];
      contractsAll.forEach((c) => (c.clauses || []).forEach((cl) => { if (cl && cl.flag && cl.status !== 'مُعالج') flaggedClauses.push({ contract: c, clause: cl }); }));
      flaggedClauses.sort((a, b) => (Number(b.clause.severity) || 0) - (Number(a.clause.severity) || 0));

      const obligations = [];
      contractsAll.forEach((c) => (c.obligations || []).forEach((o) => {
        if (!o || o.status === 'منجز') return;
        const days = daysUntil(o.due);
        if (days === null || days > OBLIGATION_WINDOW_DAYS) return;
        obligations.push({ ...o, days, contract: c, overdue: o.status === 'متأخر' || days < 0 });
      }));
      obligations.sort((a, b) => a.days - b.days);
      const obligations30 = obligations.filter((o) => o.days >= 0 && o.days <= OBLIGATION_KPI_DAYS);
      const overdue = obligations.filter((o) => o.overdue);

      // Subcontractor concentration: share of subcontract value by counterparty (falls back to all counterparties).
      const subs = contractsAll.filter((c) => c.type === SUBCONTRACT_TYPE && c.status !== 'منتهٍ');
      const base = subs.length ? subs : contractsAll.filter((c) => c.status !== 'منتهٍ');
      const totalValue = base.reduce((n, c) => n + (Number(c.valueSAR) || 0), 0);
      const byParty = new Map();
      base.forEach((c) => byParty.set(c.counterparty, (byParty.get(c.counterparty) || 0) + (Number(c.valueSAR) || 0)));
      const concentration = [...byParty.entries()]
        .map(([name, value]) => ({ id: name, label: name, valueSAR: value, value: totalValue ? Math.round((value / totalValue) * 1000) / 10 : 0, contracts: base.filter((c) => c.counterparty === name).length }))
        .sort((a, b) => b.value - a.value);
      const topShare = concentration.length ? concentration[0].value : 0;
      const hhi = concentration.reduce((n, p) => n + (p.value * p.value), 0); // Herfindahl index on % shares (0..10000)

      // Open AI risks of this domain (psel first, local fallback).
      let openRisks = psel && typeof psel.openAiRisks === 'function' ? safe(() => psel.openAiRisks(state, filters), null) : null;
      if (!Array.isArray(openRisks)) openRisks = (platform.aiRisks || []).filter((r) => r && !CLOSED_RISK.has(r.status) && inScope(r));
      const domainRisks = openRisks.filter((r) => r && r.category === CATEGORY).sort((a, b) => (Number(b.score) || 0) - (Number(a.score) || 0));

      let categoryScore = null;
      const scores = psel && typeof psel.categoryScores === 'function' ? safe(() => psel.categoryScores(state, filters), null) : null;
      if (Array.isArray(scores)) categoryScore = scores.find((s) => s && s.category === CATEGORY) || null;
      if (!categoryScore) {
        const vals = domainRisks.map((r) => Number(r.score) || 0);
        const score = vals.length ? Math.round(0.5 * Math.max(...vals) + 0.5 * (vals.reduce((a, b) => a + b, 0) / vals.length)) : 0;
        categoryScore = { category: CATEGORY, score, rating: ratingOf(score), open: vals.length, red: vals.filter((v) => v >= 70).length, trend: [] };
      }

      const pipeline = (platform.pipelines || []).find((p) => p && p.id === PIPELINE_ID) || null;

      return {
        state, filters, siteId, search, platform, today,
        contractsAll, contracts, flaggedClauses, obligations, obligations30, overdue,
        concentration, topShare, hhi, subsOnly: subs.length > 0,
        domainRisks, categoryScore, pipeline,
      };
    }

    /* ───────────────────────── actions ───────────────────────── */

    /** Best-effort link between a contract (and optionally a clause) and an open AI risk of this domain. */
    function relatedRisk(platform, contract, clause) {
      const risks = (platform.aiRisks || []).filter((r) => r && r.category === CATEGORY && !CLOSED_RISK.has(r.status) && r.projectId === contract.projectId);
      const code = lower(contract.code);
      const ref = clause ? lower(clause.ref) : '';
      const hay = (r) => lower(`${r.evidence && r.evidence.ref} ${r.evidence && r.evidence.excerpt} ${r.title} ${r.driverExplanation}`);
      if (clause && ref) {
        const exact = risks.find((r) => hay(r).includes(code) && (hay(r).includes(`§${ref}`) || hay(r).includes(` ${ref} `) || hay(r).endsWith(` ${ref}`)));
        if (exact) return exact;
      }
      return risks.find((r) => hay(r).includes(code)) || null;
    }

    function existingTask(platform, risk, title) {
      return (platform.tasks || []).find((t) => t && OPEN_TASK.has(t.status) && ((risk && t.riskId === risk.id) || t.title === title)) || null;
    }

    function referToLegal(data, contract, clause = null) {
      if (typeof store.addTask !== 'function') {
        toast('إنشاء المهام غير متاح حالياً — وحدة مهام المنصة لم تُحمَّل بعد.', { tone: 'warning' });
        return null;
      }
      const risk = relatedRisk(data.platform, contract, clause);
      const title = clause
        ? `مراجعة قانونية — ${contract.code} §${clause.ref}: ${clause.title}`
        : `مراجعة قانونية شاملة — ${contract.code}: ${contract.title}`;
      const dup = existingTask(data.platform, clause ? risk : null, title);
      if (dup) {
        toast(`توجد مهمة مفتوحة بالفعل (${dup.code || dup.id}) لهذه الإحالة.`, { tone: 'neutral', action: { label: 'فتح المهام', onClick: () => router.navigate('tasks') } });
        return { task: dup, created: false };
      }
      let task = null;
      try {
        task = store.addTask({
          title,
          projectId: contract.projectId,
          riskId: risk ? risk.id : null,
          owner: LEGAL_OWNER,
          dueDate: isoPlusDays(clause && Number(clause.severity) >= 70 ? 3 : 7),
          status: 'جديدة',
          source: 'manual',
          description: clause
            ? [clause.explanation, clause.benchmark, clause.redline ? `الصياغة المقترحة: ${clause.redline}` : ''].filter(Boolean).join(' · ')
            : `إحالة العقد ${contract.code} (${contract.counterparty}) للمراجعة القانونية الشاملة.`,
          origin: { view: 'contracts', contractId: contract.id, clauseId: clause ? clause.id : null },
        });
      } catch (err) {
        console.warn('[contracts] addTask failed', err);
        toast('تعذر إنشاء المهمة. حاول مرة أخرى.', { tone: 'critical' });
        return null;
      }
      if (clause && clause.status !== 'مُعالج' && typeof store.update === 'function') {
        store.update((state) => {
          const p = state.platform; if (!p) return 'platform';
          const c = (p.contracts || []).find((x) => x && x.id === contract.id);
          const cl = c && (c.clauses || []).find((x) => x && x.id === clause.id);
          if (cl) cl.status = 'قيد المراجعة القانونية';
          return `platform.contracts.${contract.id}`;
        });
      }
      const code = task && (task.code || task.id);
      toast(
        `أُحيلت ${clause ? `المادة §${clause.ref}` : 'العقد'} إلى ${LEGAL_OWNER}${code ? ` — المهمة ${code}` : ''}${risk ? ` · مرتبطة بالمخاطرة ${risk.code}` : ''}.`,
        { tone: 'good', action: { label: 'فتح المهام', onClick: () => router.navigate('tasks') } },
      );
      return { task, created: true };
    }

    /* ───────────────────────── drawer ───────────────────────── */

    function clauseItem(data, contract, clause) {
      const r = ratingOf(clause.severity);
      const tone = ratingTone(r);
      const status = h('span', { class: 'clause-status' }, statusBadge(clause.status, CLAUSE_STATUS_TONE));
      const refer = button('إحالة للقانونية', {
        variant: clause.status === 'مُعالج' ? 'ghost' : 'outline', size: 'sm', icon: svgIcon('file-text', 14),
        attrs: { disabled: clause.status === 'مُعالج', title: clause.status === 'مُعالج' ? 'البند مُعالج بالفعل' : 'إنشاء مهمة معالجة وإسنادها للإدارة القانونية' },
        onClick: () => {
          const result = referToLegal(data, contract, clause);
          if (result && result.created && clause.status !== 'مُعالج') {
            status.replaceChildren(statusBadge('قيد المراجعة القانونية', CLAUSE_STATUS_TONE));
            refer.disabled = true; refer.title = 'تمت الإحالة';
          }
        },
      });
      const sev = Number(clause.severity) || 0;
      return h('article', { class: ['evidence', 'clause-item', `tone-${tone}`], 'data-clause': clause.id, style: { display: 'flex', flexDirection: 'column', gap: '10px', padding: '12px', border: '1px solid var(--line)', borderInlineStart: '3px solid var(--tone)', borderRadius: '10px', background: 'color-mix(in srgb, var(--bg-2) 55%, transparent)' } },
        h('div', { class: 'row between wrap gap-2' },
          h('div', { class: 'row gap-2 wrap', style: { alignItems: 'center' } },
            mono(`§${clause.ref || '—'}`, 'evidence-ref semibold'),
            h('span', { class: 'semibold' }, clause.title || 'بند'),
          ),
          h('div', { class: 'row gap-2 wrap', style: { alignItems: 'center' } }, flagBadge(clause), status),
        ),
        clause.excerpt ? h('blockquote', { class: 'evidence-excerpt text-sm', style: { margin: 0, paddingInline: '12px 0', borderInlineStart: '2px solid var(--line-2)', color: 'var(--ink-2)', fontStyle: 'normal' } }, clause.excerpt) : null,
        clause.flag ? h('div', { class: 'row gap-3', style: { alignItems: 'center' } },
          h('span', { class: 'text-xs muted nowrap' }, 'درجة الخطورة'),
          h('div', { class: 'progress-row grow' }, progress({ value: sev, max: 100, tone, label: `درجة خطورة البند ${clause.ref}` }), h('span', { class: 'progress-value' }, fmt.num(sev))),
          ratingBadge(sev),
        ) : null,
        clause.explanation ? h('p', { class: 'text-sm' }, h('strong', { class: 'ink-2' }, 'تفسير المحرك: '), clause.explanation) : null,
        clause.benchmark ? h('div', { class: 'note tone-accent' }, h('strong', {}, 'المعيار المرجعي: '), clause.benchmark) : null,
        clause.redline ? h('div', { class: 'note tone-brand' }, h('strong', {}, 'الصياغة المقترحة (Redline): '), clause.redline) : null,
        clause.flag ? h('div', { class: 'row end gap-2' }, refer) : null,
      );
    }

    function openContract(data, contract, focusClauseId = null) {
      if (!contract) return;
      if (openDrawer) { try { openDrawer.close(); } catch { /* ignore */ } openDrawer = null; }
      const clauses = (contract.clauses || []).slice().sort((a, b) => (Number(b.severity) || 0) - (Number(a.severity) || 0));
      const flagged = clauses.filter((c) => c.flag);
      const related = (data.platform.aiRisks || []).filter((r) => r && r.category === CATEGORY && !CLOSED_RISK.has(r.status) && lower(`${r.evidence && r.evidence.ref} ${r.title} ${r.driverExplanation}`).includes(lower(contract.code)));
      const obligations = (contract.obligations || []).slice().sort((a, b) => (fmt.toDate(a.due) || 0) - (fmt.toDate(b.due) || 0));
      const endsIn = daysUntil(contract.endsAt);

      const body = h('div', { class: 'stack gap-4' },
        h('section', { class: 'drawer-section' },
          h('div', { class: 'row between wrap gap-2', style: { marginBlockEnd: '10px' } },
            h('div', { class: 'row gap-2 wrap', style: { alignItems: 'center' } }, badge(contract.type || '—', 'neutral'), statusBadge(contract.status, CONTRACT_STATUS_TONE)),
            scoreCell(contract.riskScore, { large: true }),
          ),
          kv([
            ['الطرف المقابل', contract.counterparty],
            ['المشروع', siteName(data.state, contract.projectId)],
            ['قيمة العقد', `${fmt.num(Number(contract.valueSAR) || 0)} ${contract.currency || 'ر.س'}`],
            ['تاريخ التوقيع', fmt.date(contract.signedAt)],
            ['تاريخ الانتهاء', h('span', { class: 'row gap-2 wrap', style: { alignItems: 'center' } }, fmt.date(contract.endsAt), endsIn !== null && endsIn >= 0 && endsIn <= 90 && contract.status === 'ساري' ? badge(`ينتهي خلال ${fmt.num(endsIn)} يوماً`, endsIn <= 30 ? 'serious' : 'warning') : null)],
            ['حصة المقاولين من الباطن', fmt.pct(Number(contract.subcontractorSharePct) || 0)],
            ['البنود المُعلَّمة', `${fmt.num(flagged.length)} من ${fmt.num(clauses.length)}`],
          ]),
        ),
        h('section', { class: 'drawer-section' },
          h('h3', { class: 'drawer-section-title' }, `البنود المُحلَّلة بمحرك العقود (${fmt.num(clauses.length)})`),
          clauses.length
            ? h('div', { class: 'stack gap-3' }, ...clauses.map((cl) => clauseItem(data, contract, cl)))
            : emptyState({ title: 'لا توجد بنود مُحلَّلة لهذا العقد' }),
        ),
        h('section', { class: 'drawer-section' },
          h('h3', { class: 'drawer-section-title' }, `الالتزامات التعاقدية (${fmt.num(obligations.length)})`),
          obligations.length
            ? h('ul', { class: 'urgent-list' }, ...obligations.map((o) => h('li', { class: ['urgent-item', o.status === 'متأخر' || (daysUntil(o.due) ?? 1) < 0 ? 'is-overdue' : null] },
              h('span', { class: 'urgent-icon' }, glyph('clock', 15)),
              h('div', { class: 'urgent-text' }, h('span', {}, o.text), h('span', { class: 'urgent-sub' }, `${o.owner || '—'} · §${o.clauseRef || '—'}`)),
              h('div', { class: 'urgent-due' }, h('span', {}, fmt.date(o.due, { style: 'short' })), dueBadge(o.due, o.status)),
            )))
            : emptyState({ title: 'لا توجد التزامات مسجلة' }),
        ),
        h('section', { class: 'drawer-section' },
          h('h3', { class: 'drawer-section-title' }, `المخاطر الذكية المرتبطة (${fmt.num(related.length)})`),
          related.length
            ? h('ul', { class: 'urgent-list' }, ...related.map((r) => h('li', { class: 'urgent-item' },
              h('span', { class: 'urgent-icon' }, svgIcon('shield-alert', 15)),
              h('div', { class: 'urgent-text' }, h('span', { class: 'row gap-2 wrap', style: { alignItems: 'center' } }, codeSpan(r.code), h('span', {}, ...withCodes(r.title))), h('span', { class: 'urgent-sub' }, `${r.owner || 'بدون مالك'} · ${r.status}`)),
              h('div', { class: 'urgent-due' }, scoreCell(r.score), button('فتح', { variant: 'ghost', size: 'sm', onClick: () => { if (openDrawer) openDrawer.close(); router.navigate('airisks', { risk: r.id }); } })),
            )))
            : h('p', { class: 'text-sm muted' }, 'لم يرصد المحرك مخاطر مفتوحة مرتبطة بهذا العقد.'),
        ),
      );

      openDrawer = drawer({
        title: contract.title,
        subtitle: `${codeText(contract.code)} · ${contract.counterparty}`,
        body,
        size: 'lg',
        actions: [
          { label: 'إحالة العقد للقانونية', variant: 'primary', icon: svgIcon('file-text', 16), closes: false, onClick: () => { referToLegal(data, contract, null); return false; } },
          { label: 'إغلاق', variant: 'ghost' },
        ],
        onClose: () => { openDrawer = null; },
      });
      openDrawer.open();
      if (focusClauseId) {
        requestAnimationFrame(() => {
          const node = openDrawer && openDrawer.el.querySelector(`[data-clause="${CSS.escape(String(focusClauseId))}"]`);
          if (node) { node.scrollIntoView({ block: 'center', behavior: 'smooth' }); node.classList.add('is-focus'); }
        });
      }
    }

    /* ───────────────────────── sections ───────────────────────── */

    function scopeLabel(data) { return data.siteId ? siteName(data.state, data.siteId) : 'جميع المشاريع'; }

    function buildHead(data) {
      const cs = data.categoryScore;
      const scorePill = cs ? h('div', { class: 'row gap-2', style: { alignItems: 'center' }, title: 'درجة مجال العقود = 0.5 × أعلى درجة مفتوحة + 0.5 × متوسط الدرجات المفتوحة' },
        h('span', { class: 'text-xs muted' }, 'درجة المجال'),
        mono(fmt.num(Number(cs.score) || 0), 'text-lg semibold'),
        ratingBadge(cs.score),
      ) : null;
      return h('div', { class: 'view-head' },
        h('div', { class: 'view-head-text' },
          h('span', { class: 'code-tag' }, 'DOM-01'),
          h('h1', { tabindex: '-1' }, 'مخاطر العقود'),
          h('p', { class: 'view-lead' }, `تحليل بنود العقود بمحرك المعالجة اللغوية (Contract NLP) لـ${scopeLabel(data)}: البنود الغامضة وشروط الدفع وغرامات التأخير وبنود التأمين والتعويض، مع تقويم الالتزامات وتركّز المقاولين من الباطن.`),
        ),
        h('div', { class: 'view-actions' },
          scorePill,
          button('سجل المخاطر الذكي', { variant: 'outline', size: 'sm', icon: svgIcon('shield-alert', 15), onClick: () => router.navigate('airisks', { category: CATEGORY }) }),
        ),
      );
    }

    function buildKpis(data) {
      const cs = data.categoryScore;
      const redClauses = data.flaggedClauses.filter((f) => ratingOf(f.clause.severity) === 'red').length;
      const spark = cs && Array.isArray(cs.trend) && cs.trend.length > 1 ? makeChart('sparkline', { values: cs.trend, width: 96, height: 28, color: 'var(--ink-3)', accentLast: true }) : null;
      const conc = data.topShare;
      const concTone = conc >= 40 ? 'critical' : conc >= 25 ? 'warning' : 'good';
      const activeList = data.contractsAll.filter((c) => c.status === 'ساري');
      const active = activeList.length;
      const activeValue = activeList.reduce((n, c) => n + (Number(c.valueSAR) || 0), 0);
      const avgScore = active ? Math.round(activeList.reduce((n, c) => n + (Number(c.riskScore) || 0), 0) / active) : 0;
      return h('div', { class: 'kpi-row' },
        statTile({ label: 'درجة مجال العقود', value: Number(cs.score) || 0, unit: `/ ${fmt.num(100)}`, tone: ratingTone(ratingOf(cs.score)), icon: svgIcon('file-text', 18), spark, hint: `${fmt.num(cs.open || 0)} مخاطر مفتوحة · ${fmt.num(cs.red || 0)} حمراء — ${RATING_META[ratingOf(cs.score)].hint}` }),
        statTile({ label: 'عقود مراقبة', value: data.contractsAll.length, tone: 'brand', icon: svgIcon('list', 18), hint: `${fmt.num(active)} سارية · ${fmt.num(data.contractsAll.filter((c) => c.status === 'قيد التفاوض').length)} قيد التفاوض · ${fmt.num(data.contractsAll.filter((c) => c.status === 'منتهٍ').length)} منتهية` }),
        statTile({ label: 'قيمة العقود السارية', value: fmt.compact(activeValue), unit: 'ر.س', tone: 'accent', icon: svgIcon('chart', 18), hint: `${fmt.num(active)} عقداً سارياً — متوسط درجة المخاطر ${fmt.num(avgScore)}` }),
        statTile({ label: 'بنود مُعلَّمة', value: data.flaggedClauses.length, tone: redClauses ? 'critical' : data.flaggedClauses.length ? 'warning' : 'good', icon: glyph(redClauses ? 'critical' : 'warning', 18), hint: `${fmt.num(redClauses)} بنداً بتصنيف أحمر تتطلب تدخلاً فورياً`, onClick: () => { const t = root.querySelector('[data-section="flags"]'); if (t) t.scrollIntoView({ behavior: 'smooth', block: 'start' }); } }),
        statTile({ label: `التزامات خلال ${fmt.num(OBLIGATION_KPI_DAYS)} يوماً`, value: data.obligations30.length, tone: data.overdue.length ? 'critical' : data.obligations30.length ? 'warning' : 'good', icon: glyph('clock', 18), hint: data.overdue.length ? `${fmt.num(data.overdue.length)} التزاماً متأخراً بالفعل` : 'لا توجد التزامات متأخرة', onClick: () => { const t = root.querySelector('[data-section="obligations"]'); if (t) t.scrollIntoView({ behavior: 'smooth', block: 'start' }); } }),
        statTile({ label: 'تركّز المقاولين من الباطن', value: fmt.pct(conc, 1), tone: concTone, icon: svgIcon('truck', 18), hint: data.concentration.length ? `أعلى حصة: ${data.concentration[0].label} · مؤشر هيرفندال ${fmt.num(Math.round(data.hhi))}` : 'لا توجد عقود من الباطن ضمن النطاق' }),
      );
    }

    function buildContractsCard(data) {
      const rows = data.contracts.map((c) => {
        const flagged = (c.clauses || []).filter((cl) => cl && cl.flag && cl.status !== 'مُعالج');
        const maxSev = flagged.reduce((m, cl) => Math.max(m, Number(cl.severity) || 0), 0);
        return { ...c, _flagged: flagged.length, _maxSev: maxSev };
      });
      const table = dataTable({
        caption: 'العقود المراقبة ضمن النطاق',
        pageSize: 8, stickyFirst: true,
        rowKey: 'id',
        emptyText: data.search ? 'لا توجد عقود مطابقة للبحث' : 'لا توجد عقود ضمن هذا النطاق',
        onRowClick: (r) => openContract(data, data.contractsAll.find((c) => c.id === r.id) || r),
        initialSort: { key: 'riskScore', dir: 'desc' },
        columns: [
          { key: 'code', label: 'الرمز', width: 120, priority: 'high', render: (r) => codeSpan(r.code) },
          { key: 'title', label: 'العقد والطرف المقابل', priority: 'high', render: (r) => h('div', { class: 'stack gap-1' }, h('span', { class: 'semibold' }, ...withCodes(r.title)), h('span', { class: 'text-xs muted' }, `${r.counterparty || '—'} · ${siteName(data.state, r.projectId)}`)) },
          { key: 'type', label: 'النوع', priority: 'low', render: (r) => badge(r.type || '—', r.type === SUBCONTRACT_TYPE ? 'accent' : 'neutral') },
          { key: 'valueSAR', label: 'القيمة', align: 'end', priority: 'medium', render: (r) => mono(sar(r.valueSAR), 'num'), sortValue: (r) => Number(r.valueSAR) || 0 },
          { key: '_flagged', label: 'بنود مُعلَّمة', align: 'center', priority: 'medium', render: (r) => (r._flagged ? badge(fmt.num(r._flagged), ratingTone(ratingOf(r._maxSev))) : badge(fmt.num(0), 'good')), sortValue: (r) => r._flagged },
          { key: 'riskScore', label: 'درجة المخاطر', priority: 'high', render: (r) => scoreCell(r.riskScore), sortValue: (r) => Number(r.riskScore) || 0 },
          { key: 'status', label: 'الحالة', priority: 'low', render: (r) => statusBadge(r.status, CONTRACT_STATUS_TONE) },
        ],
        rows,
      });
      return card({
        code: 'CT-01', title: 'العقود المراقبة', className: 'col-span-12',
        subtitle: `${fmt.num(rows.length)} عقداً — ${scopeLabel(data)} · انقر على أي صف لعرض البنود والتفسير والصياغة المقترحة`,
        body: table.el,
      });
    }

    function buildConcentrationCard(data) {
      const items = data.concentration.slice(0, 10).map((p) => ({ id: p.id, label: p.label, value: p.value }));
      const chart = items.length ? makeChart('barChart', {
        items, horizontal: true, height: Math.max(200, items.length * 32 + 24), valueFormat: (v) => fmt.pct(v, 1), color: 'var(--s1)', showValues: true, maxBars: 10,
        ariaLabel: 'حصة كل طرف مقابل من قيمة عقود الباطن، مرتبة تنازلياً',
      }) : null;
      const fallback = () => simpleTable('تركّز المقاولين من الباطن', ['الطرف', 'الحصة', 'القيمة', 'العقود'], data.concentration.map((p) => [p.label, fmt.pct(p.value, 1), sar(p.valueSAR), fmt.num(p.contracts)]));
      const top = data.concentration[0];
      const body = items.length
        ? h('div', { class: 'stack gap-3' },
          chart ? chart.el : fallback(),
          top ? h('div', { class: ['note', `tone-${data.topShare >= 40 ? 'critical' : data.topShare >= 25 ? 'warning' : 'good'}`] },
            glyph(data.topShare >= 40 ? 'critical' : data.topShare >= 25 ? 'warning' : 'good', 14), ' ',
            h('strong', {}, `${top.label} يستحوذ على ${fmt.pct(top.value, 1)}`), ` من ${data.subsOnly ? 'قيمة عقود الباطن' : 'قيمة العقود'} ضمن النطاق. `,
            data.topShare >= 40 ? 'تركّز مرتفع: يُنصح بتأهيل بديل وتفعيل بند الاستبدال.' : data.topShare >= 25 ? 'تركّز متوسط: راقب أداء المقاول والالتزامات الشهرية.' : 'توزيع صحي للمخاطر التعاقدية.') : null,
        )
        : emptyState({ title: 'لا توجد عقود من الباطن ضمن النطاق', text: 'غيّر المشروع من عوامل التصفية.' });
      return card({
        code: 'CT-02', title: 'تركّز المقاولين من الباطن', className: 'col-span-4',
        subtitle: data.subsOnly ? 'حصة كل مقاول من قيمة عقود الباطن السارية' : 'لا توجد عقود من الباطن — تُعرض حصص جميع الأطراف',
        body, tableView: tableOf(chart, fallback),
      });
    }

    function buildFlagsCard(data) {
      const rows = data.flaggedClauses.slice(0, 40).map((f) => ({ id: `${f.contract.id}-${f.clause.id}`, contractId: f.contract.id, clauseId: f.clause.id, code: f.contract.code, ref: f.clause.ref, title: f.clause.title, flag: f.clause.flag, severity: Number(f.clause.severity) || 0, status: f.clause.status, counterparty: f.contract.counterparty, contract: f.contract, clause: f.clause }));
      const table = dataTable({
        caption: 'البنود المُعلَّمة مرتبة حسب الخطورة',
        pageSize: 6, dense: true, rowKey: 'id', stickyFirst: true,
        emptyText: 'لا توجد بنود مُعلَّمة ضمن النطاق',
        onRowClick: (r) => openContract(data, r.contract, r.clauseId),
        initialSort: { key: 'severity', dir: 'desc' },
        columns: [
          { key: 'code', label: 'العقد والمادة', priority: 'high', render: (r) => h('div', { class: 'stack gap-1' }, h('span', { class: 'row gap-2 wrap', style: { alignItems: 'center' } }, codeSpan(r.code), mono(`§${r.ref}`, 'semibold num')), h('span', { class: 'text-sm' }, r.title), h('span', { class: 'text-xs muted' }, r.counterparty)), sortValue: (r) => `${r.code} ${r.ref}` },
          { key: 'flag', label: 'العلامة', priority: 'medium', render: (r) => flagBadge(r.clause) },
          { key: 'severity', label: 'الخطورة', priority: 'high', render: (r) => scoreCell(r.severity), sortValue: (r) => r.severity },
          { key: 'status', label: 'الحالة', priority: 'low', render: (r) => statusBadge(r.status, CLAUSE_STATUS_TONE) },
          { key: 'actions', label: '', sortable: false, priority: 'medium', render: (r) => button('إحالة للقانونية', { variant: 'ghost', size: 'sm', onClick: () => { referToLegal(data, r.contract, r.clause); } }) },
        ],
        rows,
      });
      const el = card({
        code: 'CT-03', title: 'البنود المُعلَّمة الأعلى خطورة', className: 'col-span-8',
        subtitle: `${fmt.num(data.flaggedClauses.length)} بنداً مفتوحاً أو قيد المراجعة — مرتبة تنازلياً حسب درجة الخطورة`,
        body: table.el,
      });
      el.dataset.section = 'flags';
      return el;
    }

    function buildObligationsCard(data) {
      const shown = obligationsExpanded ? data.obligations : data.obligations.slice(0, OBLIGATIONS_DEFAULT);
      const list = shown.length
        ? h('ul', { class: 'urgent-list', 'aria-label': 'تقويم الالتزامات التعاقدية', style: shown.length > 4 ? { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '8px' } : undefined }, ...shown.map((o) => h('li', { class: ['urgent-item', o.overdue ? 'is-overdue' : null, `tone-${o.overdue ? 'critical' : o.days <= 7 ? 'serious' : o.days <= 30 ? 'warning' : 'neutral'}`] },
          h('span', { class: 'urgent-icon' }, glyph(o.overdue ? 'critical' : o.days <= 7 ? 'serious' : 'clock', 15)),
          h('div', { class: 'urgent-text' },
            h('button', { type: 'button', class: 'btn btn-ghost btn-sm', style: { blockSize: 'auto', padding: 0, justifyContent: 'flex-start', textAlign: 'start', whiteSpace: 'normal', fontSize: 'var(--fs-sm)' }, onClick: () => openContract(data, o.contract) }, o.text),
            h('span', { class: 'urgent-sub row gap-2 wrap' }, codeSpan(o.contract.code), h('span', { class: 'num' }, `§${o.clauseRef || '—'}`), h('span', {}, o.owner || '—')),
          ),
          h('div', { class: 'urgent-due' }, h('span', {}, `${fmt.dayName(o.due)} ${fmt.date(o.due, { style: 'short' })}`), dueBadge(o.due, o.status)),
        )))
        : emptyState({ title: `لا توجد التزامات خلال ${fmt.num(OBLIGATION_WINDOW_DAYS)} يوماً`, text: 'جميع الالتزامات التعاقدية ضمن النطاق منجزة أو أبعد من نافذة المتابعة.' });
      const el = card({
        code: 'CT-04', title: `تقويم الالتزامات — ${fmt.num(OBLIGATION_WINDOW_DAYS)} يوماً`, className: 'col-span-12',
        subtitle: `${fmt.num(data.obligations.length)} التزاماً قادماً أو متأخراً · ${fmt.num(data.overdue.length)} متأخر`,
        body: list,
        actions: data.obligations.length > OBLIGATIONS_DEFAULT ? [button(obligationsExpanded ? 'عرض أقل' : `عرض الكل (${fmt.num(data.obligations.length)})`, { variant: 'ghost', size: 'sm', icon: obligationsExpanded ? 'chevron-up' : 'chevron-down', onClick: () => { obligationsExpanded = !obligationsExpanded; schedule(); } })] : [],
        footer: data.obligations.length > shown.length ? h('p', { class: 'text-xs muted' }, `يُعرض أقرب ${fmt.num(shown.length)} التزاماً من أصل ${fmt.num(data.obligations.length)}؛ اضغط «عرض الكل» أو افتح العقد لعرض القائمة كاملة.`) : h('div', { class: 'tone-legend' },
          h('span', { class: 'tone-legend-item tone-critical' }, glyph('critical', 12), h('span', {}, 'متأخر')),
          h('span', { class: 'tone-legend-item tone-serious' }, glyph('serious', 12), h('span', {}, 'خلال أسبوع')),
          h('span', { class: 'tone-legend-item tone-warning' }, glyph('warning', 12), h('span', {}, 'خلال 30 يوماً')),
          h('span', { class: 'tone-legend-item tone-neutral' }, glyph('clock', 12), h('span', {}, 'قادم')),
        ),
      });
      el.dataset.section = 'obligations';
      return el;
    }

    function buildRisksCard(data) {
      const rows = data.domainRisks;
      const red = rows.filter((r) => ratingOf(r.score) === 'red').length;
      const table = dataTable({
        caption: 'المخاطر المكتشفة في مجال العقود',
        pageSize: 6, rowKey: 'id', stickyFirst: true,
        emptyText: 'لا توجد مخاطر مفتوحة في هذا المجال ضمن النطاق',
        onRowClick: (r) => router.navigate('airisks', { risk: r.id }),
        initialSort: { key: 'score', dir: 'desc' },
        columns: [
          { key: 'code', label: 'الرمز', width: 110, priority: 'high', render: (r) => codeSpan(r.code) },
          { key: 'title', label: 'المخاطرة', priority: 'high', render: (r) => h('div', { class: 'stack gap-1' }, h('span', { class: 'semibold' }, ...withCodes(r.title)), h('span', { class: 'text-xs muted row gap-1 wrap' }, h('span', {}, siteName(data.state, r.projectId)), r.evidence && r.evidence.ref ? ' · ' : null, r.evidence && r.evidence.ref ? h('span', { class: 'mono', dir: 'ltr' }, r.evidence.ref) : null)) },
          { key: 'score', label: 'الدرجة والتصنيف', priority: 'high', render: (r) => scoreCell(r.score), sortValue: (r) => Number(r.score) || 0 },
          { key: 'type', label: 'النوع', priority: 'medium', render: (r) => typeChip(r.type) },
          { key: 'owner', label: 'المالك', priority: 'low', render: (r) => r.owner || h('span', { class: 'muted' }, 'غير مُسند') },
          { key: 'status', label: 'الحالة', priority: 'medium', render: (r) => statusBadge(r.status, RISK_STATUS_TONE) },
        ],
        rows,
      });
      return card({
        code: 'CT-05', title: 'المخاطر المكتشفة في هذا المجال', className: 'col-span-12',
        subtitle: `${fmt.num(rows.length)} مخاطر مفتوحة من محرك العقود · ${fmt.num(red)} بتصنيف أحمر — انقر لفتح المخاطرة في السجل الذكي`,
        actions: [button('السجل الذكي', { variant: 'ghost', size: 'sm', icon: svgIcon('shield-alert', 14), onClick: () => router.navigate('airisks', { category: CATEGORY }) })],
        body: table.el,
      });
    }

    function buildKriCard(data) {
      const pipeline = data.pipeline;
      const kris = pipeline && Array.isArray(pipeline.kris) ? pipeline.kris : [];
      const asText = (v) => (Array.isArray(v) ? v.filter(Boolean).join(' · ') : String(v ?? '—'));
      const table = h('table', { class: 'kri-table table is-dense' },
        h('caption', { class: 'sr-only' }, 'مصفوفة مؤشرات المخاطر الرئيسية لمحرك العقود: المؤشر، التقنية، المدخلات، إجراء المعالجة'),
        h('thead', {}, h('tr', {}, h('th', { scope: 'col' }, 'المؤشر'), h('th', { scope: 'col' }, 'تقنية الذكاء الاصطناعي'), h('th', { scope: 'col' }, 'مدخلات البيانات'), h('th', { scope: 'col' }, 'إجراء المعالجة'))),
        h('tbody', {}, ...kris.map((k) => h('tr', {},
          h('td', { 'data-label': 'المؤشر', style: { fontWeight: 600 } }, asText(k.indicator)),
          h('td', { 'data-label': 'تقنية الذكاء الاصطناعي' }, asText(k.technique)),
          h('td', { 'data-label': 'مدخلات البيانات' }, asText(k.inputs)),
          h('td', { 'data-label': 'إجراء المعالجة' }, asText(k.mitigation)),
        ))),
      );
      const bodyWrap = h('div', { class: 'table-wrap' }, kris.length ? table : emptyState({ title: 'مصفوفة المؤشرات غير متاحة', text: 'لم تُحمَّل بيانات خط أنابيب محرك العقود بعد.' }));
      const toggle = button(kriOpen ? 'طيّ' : 'عرض', { variant: 'ghost', size: 'sm', icon: glyph('chevronDown', 14), attrs: { 'aria-expanded': kriOpen ? 'true' : 'false', 'aria-controls': 'ct-kri-body' } });
      const el = card({
        code: 'CT-06', title: 'مصفوفة مؤشرات المخاطر والمعالجة', className: 'col-span-12',
        subtitle: pipeline ? `${pipeline.nameAr || pipeline.name} · ${pipeline.version || ''} · ${fmt.num(kris.length)} مؤشرات رئيسية (KRIs) من المقترح` : 'محرك العقود NLP',
        actions: [toggle], body: bodyWrap,
      });
      el.classList.add('kri-card');
      const bodyEl = el.querySelector('.card-body');
      if (bodyEl) { bodyEl.id = 'ct-kri-body'; bodyEl.hidden = !kriOpen; }
      toggle.addEventListener('click', () => {
        kriOpen = !kriOpen;
        if (bodyEl) bodyEl.hidden = !kriOpen;
        toggle.setAttribute('aria-expanded', kriOpen ? 'true' : 'false');
        const lbl = toggle.querySelector('.btn-label'); if (lbl) lbl.textContent = kriOpen ? 'طيّ' : 'عرض';
        toggle.style.setProperty('--chev', kriOpen ? '0deg' : '180deg');
        const ic = toggle.querySelector('svg'); if (ic) ic.style.transform = kriOpen ? '' : 'rotate(180deg)';
      });
      const ic = toggle.querySelector('svg'); if (ic && !kriOpen) ic.style.transform = 'rotate(180deg)';
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
          emptyState({ icon: svgIcon('file-text', 32), title: 'بيانات المنصة غير متاحة بعد', text: 'لم تُحمَّل بيانات منصة إدارة المخاطر (state.platform). أعد تحميل الصفحة بعد اكتمال التهيئة.' }),
        );
        root.replaceChildren(frag);
        return;
      }
      frag.append(
        buildHead(data),
        buildKpis(data),
        h('div', { class: 'grid-12' }, buildContractsCard(data)),
        h('div', { class: 'grid-12' }, buildFlagsCard(data), buildConcentrationCard(data)),
        h('div', { class: 'grid-12' }, buildObligationsCard(data)),
        h('div', { class: 'grid-12' }, buildRisksCard(data)),
        h('div', { class: 'grid-12' }, buildKriCard(data)),
      );
      root.replaceChildren(frag);
    }

    function schedule() { if (!raf) raf = requestAnimationFrame(build); }

    // Only the entities this view displays rebuild it: contracts, AI risks, alerts (and site names / a full reset).
    // Tasks are read at action time only (duplicate detection), pipeline / validation / connector telemetry is never shown (C-4).
    const RELEVANT = /^(\*|sites|platform\.(contracts|aiRisks|alerts))/;
    const unsubs = [
      bus.on('store:change', (payload) => { const path = payload && payload.path ? String(payload.path) : '*'; if (RELEVANT.test(path)) schedule(); }),
      bus.on('filters:change', (payload) => { const key = payload && payload.key; if (!key || key === 'siteId' || key === 'range' || key === 'search') schedule(); }),
      bus.on('settings:change', (payload) => {
        const s = (payload && payload.settings) || store.state.settings || {};
        const numerals = s.numerals || 'latn';
        const platformJson = safe(() => JSON.stringify(s.platform || null), 'null');
        if (numerals !== lastNumerals || platformJson !== lastPlatformSettings) { lastNumerals = numerals; lastPlatformSettings = platformJson; schedule(); }
      }),
    ];

    build();

    // Deep link: #/contracts?contract=CT-2026-014 (code or id) opens the drawer.
    const want = ctx.params && (ctx.params.contract || ctx.params.id);
    if (want) {
      const data = collect();
      const c = data.platform ? (data.platform.contracts || []).find((x) => x && (x.id === want || x.code === want)) : null;
      if (c) openContract(data, c, ctx.params.clause || null);
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
