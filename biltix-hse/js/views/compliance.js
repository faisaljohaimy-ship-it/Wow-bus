/**
 * Biltix HSE — view: الامتثال ISO 45001 (js/views/compliance.js) — SEC-08
 *
 * Overall score ring + static spider of the seven ISO 45001:2018 clauses (4..10) against
 * the 85 % target, clause cards with ring meters and expandable sub-clause gap lists,
 * the legal register with status badges and review dates, and a document-control
 * summary (clause 7.5 — المعلومات الموثقة). Data comes from `state.isoClauses`,
 * `state.legalRegister` and `sel.isoScores`; the view re-renders on store / numerals
 * changes. Data reaches the DOM only via textContent / components.h.
 *
 * Document control: the seed has no documents collection, so the register is derived
 * deterministically from a fixed catalogue of HSE documents mapped to the sub-clauses
 * that govern them (status follows the governing sub-clause score and open gaps). When
 * `state.documents` exists it is used instead.
 */

const TARGET = 85;
const DAY_MS = 86_400_000;

const LEGAL_TONE = { 'ممتثل': 'good', 'جزئي': 'warning', 'فجوة': 'critical' };
const DOC_STATUS = {
  valid:  { label: 'وثائق سارية',  short: 'سارية',        tone: 'good' },
  review: { label: 'قيد المراجعة', short: 'قيد المراجعة', tone: 'warning' },
  expired:{ label: 'منتهية',       short: 'منتهية',       tone: 'critical' },
};

/** Controlled HSE documents → governing ISO 45001 sub-clause. Titles are static UI literals. */
const DOC_CATALOGUE = [
  { code: 'POL-01', title: 'سياسة السلامة والصحة المهنية', clause: '5.2' },
  { code: 'MAN-01', title: 'دليل نظام إدارة السلامة والصحة المهنية', clause: '4.4' },
  { code: 'PRC-01', title: 'إجراء تحديد المخاطر وتقييمها', clause: '6.1' },
  { code: 'PRC-02', title: 'إجراء تحديد المتطلبات القانونية وتقييم الامتثال', clause: '6.1' },
  { code: 'PRC-03', title: 'إجراء التشاور ومشاركة العمال', clause: '5.4' },
  { code: 'PRC-04', title: 'إجراء الكفاءة والتدريب والتوعية', clause: '7.2' },
  { code: 'PRC-05', title: 'إجراء الاتصال الداخلي والخارجي', clause: '7.4' },
  { code: 'PRC-06', title: 'إجراء ضبط المعلومات الموثقة', clause: '7.5' },
  { code: 'PRC-07', title: 'إجراء تصاريح العمل للأعمال عالية الخطورة', clause: '8.1' },
  { code: 'PRC-08', title: 'إجراء إدارة المقاولين والتوريد', clause: '8.1' },
  { code: 'PRC-09', title: 'إجراء إدارة التغيير', clause: '8.1' },
  { code: 'PLN-01', title: 'خطة الاستعداد والاستجابة للطوارئ', clause: '8.2' },
  { code: 'PRC-10', title: 'إجراء الرصد والقياس وتقويم الأداء', clause: '9.1' },
  { code: 'PRC-11', title: 'برنامج التدقيق الداخلي', clause: '9.2' },
  { code: 'PRC-12', title: 'إجراء مراجعة الإدارة', clause: '9.3' },
  { code: 'PRC-13', title: 'إجراء التحقيق في الحوادث وعدم المطابقة', clause: '10.2' },
  { code: 'PRC-14', title: 'إجراء التحسين المستمر', clause: '10.3' },
  { code: 'OBJ-01', title: 'أهداف السلامة والصحة المهنية وخطط تحقيقها', clause: '6.2' },
];

const safe = (fn, fallback) => { try { const v = fn(); return v === undefined ? fallback : v; } catch { return fallback; } };
const mean = (xs) => { const l = xs.filter((v) => Number.isFinite(v)); return l.length ? l.reduce((a, b) => a + b, 0) / l.length : 0; };

function scoreTone(score) { if (score >= TARGET) return 'good'; if (score >= 70) return 'warning'; return 'critical'; }
function scoreLabel(score) { if (score >= TARGET) return 'يحقق المستهدف'; if (score >= 70) return 'دون المستهدف'; return 'فجوة حرجة'; }
function toneVar(tone) { return `var(--${tone === 'neutral' ? 'ink-3' : tone})`; }

export default {
  id: 'compliance',
  code: 'SEC-08',
  title: 'الامتثال ISO 45001',
  icon: 'badge-check',

  render(container, ctx) {
    const { store, bus, sel, fmt, charts, components, sources } = ctx;
    const { h, card, badge, dataTable, button, drawer, toast, emptyState, progress, svgIcon, glyph, kv } = components;

    const root = h('section', { class: 'view view-compliance' });
    container.appendChild(root);

    let raf = 0;
    let openDrawer = null;
    let lastNumerals = safe(() => store.state.settings.numerals, 'latn');
    const expanded = new Set(); // clause ids whose sub-clause list is open (survives re-render)

    /* ───────────────────────── helpers ───────────────────────── */

    const mono = (text, extra = '') => h('span', { class: ['num', ...String(extra).split(/\s+/).filter(Boolean)], style: { fontFamily: 'var(--font-mono)' } }, String(text ?? ''));

    function makeChart(name, opts) {
      if (!charts || typeof charts[name] !== 'function') return null;
      try { const c = charts[name](opts); return c && c.el instanceof Node ? c : null; } catch (err) { console.warn(`[compliance] charts.${name} failed`, err); return null; }
    }
    function chartOr(chart, fallback) {
      return chart ? chart.el : (fallback || emptyState({ title: 'الرسم غير متاح حالياً', text: 'استخدم عرض الجدول للاطلاع على البيانات.' }));
    }
    function tableOf(chart, fallbackFn) {
      return () => {
        if (chart && typeof chart.table === 'function') { const t = safe(() => chart.table(), null); if (t instanceof Node) return t; }
        return fallbackFn ? fallbackFn() : h('table');
      };
    }
    function ringOr(score, size, label) {
      const tone = scoreTone(score);
      const ring = makeChart('ring', { value: score, max: 100, size, color: toneVar(tone), label });
      if (ring) return ring.el;
      // Fallback: a labelled progress bar keeps the information available.
      return h('div', { class: 'stack gap-1', style: { inlineSize: `${size}px` } },
        h('span', { class: 'ring-value', style: { fontSize: `${Math.round(size / 3.2)}px` } }, fmt.pct(score)),
        progress({ value: score, max: 100, tone, label: label || 'الدرجة' }));
    }

    /* ───────────────────────── data ───────────────────────── */

    function documentRegister(state, subById) {
      if (Array.isArray(state.documents) && state.documents.length) {
        return state.documents.map((d, i) => {
          const raw = String(d.status || '');
          const key = /سار/.test(raw) ? 'valid' : /مراجعة/.test(raw) ? 'review' : /منته/.test(raw) ? 'expired' : 'review';
          return { code: d.code || d.id || `DOC-${i + 1}`, title: d.title || d.name || '—', clause: d.clause || '', status: key, score: null };
        });
      }
      return DOC_CATALOGUE.map((d) => {
        const sub = subById.get(d.clause) || null;
        const score = sub ? Number(sub.score) || 0 : 0;
        const gaps = sub ? (Array.isArray(sub.gaps) ? sub.gaps.length : 0) : 0;
        let status = 'valid';
        if (!sub) status = 'review';
        else if (score < 65) status = 'expired';
        else if (score < TARGET || gaps > 0) status = 'review';
        return { ...d, status, score: sub ? score : null, subTitle: sub ? sub.title : '' };
      });
    }

    function collect() {
      const state = store.state;
      const now = store.now ? store.now() : new Date();
      const clauses = (safe(() => sel.isoScores(state), []) || []).map((c) => ({
        ...c,
        score: Math.round(Number(c.score) || 0),
        subclauses: Array.isArray(c.subclauses) ? c.subclauses : [],
        gaps: Number.isFinite(c.gaps) ? c.gaps : (Array.isArray(c.subclauses) ? c.subclauses.reduce((n, s) => n + (Array.isArray(s.gaps) ? s.gaps.length : 0), 0) : 0),
      }));
      const overall = Math.round(safe(() => (typeof sel.isoOverall === 'function' ? sel.isoOverall(state) : mean(clauses.map((c) => c.score))), 0) || mean(clauses.map((c) => c.score)));
      const subById = new Map();
      clauses.forEach((c) => c.subclauses.forEach((s) => { if (s && s.id) subById.set(String(s.id), s); }));
      const allSubs = clauses.flatMap((c) => c.subclauses.map((s) => ({ ...s, clauseId: c.id, clauseTitle: c.title })));
      const openGaps = allSubs.reduce((n, s) => n + (Array.isArray(s.gaps) ? s.gaps.length : 0), 0);

      const legal = (Array.isArray(state.legalRegister) ? state.legalRegister : []).map((l) => {
        const next = l.nextReview ? new Date(l.nextReview) : null;
        const days = next && Number.isFinite(next.getTime()) ? Math.ceil((next.getTime() - now.getTime()) / DAY_MS) : null;
        return { ...l, tone: LEGAL_TONE[l.status] || 'neutral', daysToReview: days };
      });
      const docs = documentRegister(state, subById);
      const docCounts = { valid: 0, review: 0, expired: 0 };
      docs.forEach((d) => { docCounts[d.status] = (docCounts[d.status] || 0) + 1; });

      return { state, now, clauses, overall, allSubs, openGaps, legal, docs, docCounts };
    }

    /* ───────────────────────── sections ───────────────────────── */

    function buildHead(data) {
      const exportBtn = button('تصدير التقييم CSV', {
        variant: 'outline', size: 'sm', icon: svgIcon('download', 16),
        onClick: () => {
          const rows = data.allSubs.map((s) => ({ clause: s.clauseId, clauseTitle: s.clauseTitle, id: s.id, title: s.title, score: s.score, gaps: (s.gaps || []).join(' | ') }));
          const columns = [{ key: 'clause', label: 'البند' }, { key: 'clauseTitle', label: 'عنوان البند' }, { key: 'id', label: 'البند الفرعي' }, { key: 'title', label: 'العنوان' }, { key: 'score', label: 'الدرجة' }, { key: 'gaps', label: 'الفجوات' }];
          try {
            if (!rows.length) throw new Error('empty');
            if (!sources || typeof sources.exportCSV !== 'function') throw new Error('unavailable');
            sources.exportCSV(rows, columns, `biltix-hse-iso45001-${new Date().toISOString().slice(0, 10)}.csv`);
            toast(`تم تصدير ${fmt.num(rows.length)} بنداً فرعياً بصيغة CSV.`, { tone: 'good' });
          } catch { toast('تعذر التصدير حالياً. حاول مرة أخرى لاحقاً.', { tone: 'critical' }); }
        },
      });
      return h('div', { class: 'view-head' },
        h('div', { class: 'view-head-text' },
          h('span', { class: 'code-tag' }, 'SEC-08'),
          h('h1', { tabindex: '-1' }, 'الامتثال ISO 45001'),
          h('p', { class: 'view-lead' }, `تقييم نضج نظام إدارة السلامة والصحة المهنية وفق بنود المواصفة ISO 45001:2018 (البنود 4 إلى 10) مقابل مستهدف ${fmt.pct(TARGET)}، إلى جانب سجل المتطلبات القانونية وضبط الوثائق.`),
        ),
        h('div', { class: 'view-actions' }, badge(scoreLabel(data.overall), scoreTone(data.overall)), exportBtn),
      );
    }

    function clausesTable(data) {
      const t = h('table', { class: 'table is-dense' }, h('caption', { class: 'sr-only' }, 'درجات بنود ISO 45001 مقابل المستهدف'),
        h('thead', {}, h('tr', {}, h('th', { scope: 'col' }, 'البند'), h('th', { scope: 'col' }, 'العنوان'), h('th', { scope: 'col' }, 'الدرجة'), h('th', { scope: 'col' }, 'المستهدف'), h('th', { scope: 'col' }, 'الفجوات'), h('th', { scope: 'col' }, 'الحالة'))));
      const tb = h('tbody');
      data.clauses.forEach((c) => tb.appendChild(h('tr', {}, h('td', { class: 'mono' }, String(c.id)), h('td', {}, c.title), h('td', { class: 'num' }, fmt.pct(c.score)), h('td', { class: 'num' }, fmt.pct(TARGET)), h('td', { class: 'num' }, fmt.num(c.gaps)), h('td', {}, scoreLabel(c.score)))));
      t.appendChild(tb);
      return t;
    }

    function buildHero(data) {
      const above = data.clauses.filter((c) => c.score >= TARGET).length;
      const compliant = data.legal.filter((l) => l.status === 'ممتثل').length;
      const body = h('div', { class: 'stack gap-4', style: { alignItems: 'stretch' } },
        h('div', { class: 'stack gap-2', style: { alignItems: 'center', textAlign: 'center' } },
          ringOr(data.overall, 168, 'الدرجة الإجمالية'),
          h('div', { class: 'stack gap-1', style: { alignItems: 'center' } },
            h('span', { class: 'text-sm ink-2' }, 'الدرجة الإجمالية — متوسط البنود السبعة'),
            badge(`${scoreLabel(data.overall)} · المستهدف ${fmt.pct(TARGET)}`, scoreTone(data.overall)),
          ),
        ),
        h('div', { class: 'hero-facts' },
          h('div', { class: 'fact' }, h('span', { class: 'fact-label' }, 'بنود تحقق المستهدف'), h('span', { class: 'fact-value' }, `${fmt.num(above)}`, h('small', {}, `من ${fmt.num(data.clauses.length)}`))),
          h('div', { class: 'fact' }, h('span', { class: 'fact-label' }, 'فجوات مفتوحة'), h('span', { class: 'fact-value' }, fmt.num(data.openGaps))),
          h('div', { class: 'fact' }, h('span', { class: 'fact-label' }, 'متطلبات قانونية ممتثلة'), h('span', { class: 'fact-value' }, `${fmt.num(compliant)}`, h('small', {}, `من ${fmt.num(data.legal.length)}`))),
        ),
      );
      return card({ code: 'ISO-01', title: 'النضج العام', subtitle: 'ISO 45001:2018', hero: true, className: 'col-span-4', body, tableView: () => clausesTable(data) });
    }

    function buildSpider(data) {
      const axes = data.clauses.map((c) => ({ id: String(c.id), label: `${c.id} — ${c.title}` }));
      const spider = axes.length ? makeChart('spider', {
        axes,
        series: [
          { id: 'score', label: 'الدرجة', color: 'var(--s1)', values: data.clauses.map((c) => c.score) },
          { id: 'target', label: `المستهدف ${fmt.pct(TARGET)}`, color: 'var(--ink-3)', values: data.clauses.map(() => TARGET) },
        ],
        max: 100,
        size: 320,
        ariaLabel: 'رسم عنكبوتي لدرجات بنود ISO 45001 السبعة مقارنة بالمستهدف',
      }) : null;
      const legend = h('ul', { class: 'legend is-center', 'aria-label': 'المفتاح' },
        h('li', { class: 'legend-item' }, h('span', { class: 'legend-key', style: { '--key': 'var(--s1)' } }), h('span', { class: 'legend-label' }, 'الدرجة')),
        h('li', { class: 'legend-item' }, h('span', { class: 'legend-key is-line', style: { '--key': 'var(--ink-3)' } }), h('span', { class: 'legend-label' }, `المستهدف ${fmt.pct(TARGET)}`)),
      );
      const chips = h('div', { class: 'matrix-legend', role: 'list', 'aria-label': 'درجات البنود' },
        ...data.clauses.map((c) => h('span', { class: ['matrix-legend-item', `tone-${scoreTone(c.score)}`], role: 'listitem' },
          glyph(scoreTone(c.score), 12), mono(c.id, 'text-xs'), h('span', { class: 'legend-label' }, c.title), h('span', { class: 'legend-value' }, fmt.pct(c.score)))));
      const body = axes.length
        ? h('div', { class: 'stack gap-3' }, chartOr(spider, clausesTable(data)), spider ? null : legend, chips)
        : emptyState({ title: 'لا توجد بنود تقييم', text: 'تحقق من بيانات ISO 45001 في المصدر.' });
      return card({ code: 'ISO-02', title: 'خريطة البنود مقابل المستهدف', subtitle: 'البنود 4–10 من ISO 45001:2018', className: 'col-span-8', body, tableView: tableOf(spider, () => clausesTable(data)) });
    }

    function subclauseList(clause) {
      const list = h('ul', { class: 'controls-list', 'aria-label': `البنود الفرعية للبند ${clause.id}` });
      clause.subclauses.forEach((s) => {
        const score = Math.round(Number(s.score) || 0);
        const tone = scoreTone(score);
        const gaps = Array.isArray(s.gaps) ? s.gaps : [];
        list.appendChild(h('li', { class: ['controls-item', `tone-${tone}`] },
          h('span', { class: 'controls-type', style: { fontFamily: 'var(--font-mono)' } }, String(s.id)),
          h('div', { class: 'stack gap-2 grow' },
            h('div', { class: 'row between gap-2 wrap' }, h('span', { class: 'semibold' }, s.title || '—'), badge(fmt.pct(score), tone)),
            h('div', { class: 'progress-row' }, progress({ value: score, max: 100, tone, label: `درجة ${s.id}` }), h('span', { class: 'progress-value' }, fmt.pct(score))),
            gaps.length
              ? h('div', { class: 'stack gap-1' },
                h('span', { class: 'text-xs muted' }, `${fmt.num(gaps.length)} ${gaps.length === 1 ? 'فجوة' : gaps.length === 2 ? 'فجوتان' : 'فجوات'}:`),
                h('ul', { class: 'stack gap-1 text-sm', style: { paddingInlineStart: '18px', listStyle: 'disc' } }, ...gaps.map((g) => h('li', {}, String(g)))))
              : h('span', { class: 'row gap-1 text-xs tone-good', style: { color: 'var(--tone-ink)' } }, glyph('good', 12), h('span', {}, 'لا توجد فجوات مسجلة')),
          ),
        ));
      });
      return list;
    }

    function buildClauseCards(data) {
      const cards = data.clauses.map((c) => {
        const tone = scoreTone(c.score);
        const panelId = `iso-sub-${String(c.id).replace(/[^\w-]/g, '')}`;
        const panel = h('div', { id: panelId, class: 'stack gap-2', hidden: !expanded.has(String(c.id)) }, subclauseList(c));
        const toggle = button(expanded.has(String(c.id)) ? 'إخفاء البنود الفرعية' : `عرض البنود الفرعية (${fmt.num(c.subclauses.length)})`, {
          variant: 'ghost', size: 'sm', icon: glyph('chevronDown', 14),
          attrs: { 'aria-expanded': expanded.has(String(c.id)) ? 'true' : 'false', 'aria-controls': panelId },
          onClick: () => {
            const id = String(c.id);
            const open = !expanded.has(id);
            if (open) expanded.add(id); else expanded.delete(id);
            panel.hidden = !open;
            toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
            const label = toggle.querySelector('.btn-label');
            if (label) label.textContent = open ? 'إخفاء البنود الفرعية' : `عرض البنود الفرعية (${fmt.num(c.subclauses.length)})`;
          },
        });
        const body = h('div', { class: 'stack gap-3' },
          h('div', { class: 'ring-row' },
            ringOr(c.score, 64, `البند ${c.id}`),
            h('div', { class: 'ring-text grow' },
              h('span', { class: 'row gap-2 wrap' }, mono(`البند ${c.id}`, 'text-xs muted'), badge(scoreLabel(c.score), tone)),
              h('span', { class: 'semibold' }, c.title),
              h('span', { class: 'text-xs muted' }, `${fmt.num(c.subclauses.length)} بنود فرعية · ${fmt.num(c.gaps)} ${c.gaps === 1 ? 'فجوة' : c.gaps === 2 ? 'فجوتان' : 'فجوات'} · المستهدف ${fmt.pct(TARGET)}`),
            ),
          ),
          h('div', { class: 'progress-row' }, progress({ value: c.score, max: 100, tone, label: `درجة البند ${c.id}` }), h('span', { class: 'progress-value' }, fmt.signed(c.score - TARGET))),
          h('div', { class: 'row' }, toggle),
          panel,
        );
        return card({ code: `ISO-${String(c.id).padStart(2, '0')}`, title: c.title, subtitle: `البند ${c.id}`, className: 'is-compact', body });
      });
      return h('section', { class: 'stack gap-3', 'aria-labelledby': 'iso-clauses-title' },
        h('div', { class: 'row between wrap' },
          h('div', { class: 'card-titles' }, h('span', { class: 'card-code', 'aria-hidden': 'true' }, 'ISO-03'), h('h2', { class: 'card-title', id: 'iso-clauses-title' }, 'بطاقات البنود والفجوات')),
          h('div', { class: 'matrix-legend' },
            h('span', { class: 'matrix-legend-item tone-good' }, glyph('good', 12), h('span', {}, `يحقق المستهدف (≥ ${fmt.pct(TARGET)})`)),
            h('span', { class: 'matrix-legend-item tone-warning' }, glyph('warning', 12), h('span', {}, `دون المستهدف (${fmt.pct(70)}–${fmt.pct(TARGET - 1)})`)),
            h('span', { class: 'matrix-legend-item tone-critical' }, glyph('critical', 12), h('span', {}, `فجوة حرجة (< ${fmt.pct(70)})`)),
          ),
        ),
        cards.length ? h('div', { class: 'cards-grid' }, ...cards) : emptyState({ title: 'لا توجد بنود' }),
      );
    }

    function openLegal(r) {
      if (openDrawer) { try { openDrawer.close(); } catch { /* ignore */ } openDrawer = null; }
      const reqs = Array.isArray(r.requirements) ? r.requirements : [];
      const body = h('div', { class: 'stack gap-4' },
        h('div', { class: 'row gap-2 wrap' }, badge(r.status || '—', r.tone), r.nextReview && Number.isFinite(r.daysToReview) && r.daysToReview < 0 ? badge('المراجعة متأخرة', 'critical') : null),
        kv([
          ['الجهة التنظيمية', r.authority || '—'],
          ['المرجع النظامي', r.ref || '—'],
          ['المسؤول', r.owner || '—'],
          ['آخر مراجعة', r.lastReview ? fmt.date(r.lastReview) : '—'],
          ['المراجعة القادمة', r.nextReview ? fmt.date(r.nextReview) : '—'],
        ]),
        reqs.length ? h('div', { class: 'stack gap-2' },
          h('span', { class: 'form-section-title' }, 'المتطلبات المنطبقة'),
          h('ul', { class: 'controls-list' }, ...reqs.map((q, i) => h('li', { class: 'controls-item' }, h('span', { class: 'controls-type' }, fmt.num(i + 1)), h('span', {}, String(q)))))) : null,
        r.evidence ? h('div', { class: 'stack gap-1' }, h('span', { class: 'form-section-title' }, 'أدلة الامتثال'), h('p', { class: 'text-sm ink-2' }, String(r.evidence))) : null,
        r.gap ? h('div', { class: ['note', `tone-${r.tone}`] }, h('strong', {}, 'الفجوة: '), String(r.gap)) : h('div', { class: 'note tone-good' }, 'لا توجد فجوات مسجلة على هذا المتطلب.'),
      );
      openDrawer = drawer({ title: r.title || 'متطلب قانوني', subtitle: r.authority || '', body, size: 'lg', onClose: () => { openDrawer = null; } });
      openDrawer.open();
    }

    function buildLegal(data) {
      const table = dataTable({
        caption: 'سجل المتطلبات القانونية والتنظيمية',
        pageSize: 10,
        rowKey: 'id',
        emptyText: 'لا توجد متطلبات مسجلة',
        initialSort: { key: 'status', dir: 'asc' },
        onRowClick: (r) => openLegal(r),
        columns: [
          { key: 'title', label: 'المتطلب', render: (r) => h('div', { class: 'stack gap-1' }, h('span', { class: 'semibold' }, r.title || '—'), r.ref ? h('span', { class: 'text-xs muted' }, String(r.ref)) : null) },
          { key: 'authority', label: 'الجهة التنظيمية' },
          { key: 'owner', label: 'المسؤول' },
          { key: 'status', label: 'الحالة', render: (r) => badge(r.status || '—', r.tone), sortValue: (r) => ({ 'فجوة': 0, 'جزئي': 1, 'ممتثل': 2 })[r.status] ?? 3 },
          { key: 'lastReview', label: 'آخر مراجعة', render: (r) => (r.lastReview ? fmt.date(r.lastReview) : '—'), sortValue: (r) => (r.lastReview ? new Date(r.lastReview).getTime() : 0) },
          { key: 'nextReview', label: 'المراجعة القادمة', sortValue: (r) => (r.nextReview ? new Date(r.nextReview).getTime() : 0), render: (r) => {
            if (!r.nextReview) return '—';
            const d = r.daysToReview;
            const overdue = Number.isFinite(d) && d < 0;
            const soon = Number.isFinite(d) && d >= 0 && d <= 30;
            return h('div', { class: 'stack gap-1' },
              h('span', { class: overdue ? 'urgent-due is-overdue' : 'num' }, fmt.date(r.nextReview)),
              overdue ? badge('متأخرة', 'critical') : soon ? badge(d === 0 ? 'اليوم' : `خلال ${fmt.num(d)} ${d === 1 ? 'يوم' : d <= 10 ? 'أيام' : 'يوماً'}`, 'warning') : null,
            );
          } },
        ],
        rows: data.legal,
      });
      const counts = ['ممتثل', 'جزئي', 'فجوة'].map((s) => ({ s, n: data.legal.filter((l) => l.status === s).length }));
      return card({
        code: 'ISO-04', title: 'سجل المتطلبات القانونية', subtitle: 'الأنظمة واللوائح السعودية المنطبقة ومدى الامتثال لها', className: 'col-span-8',
        body: table.el,
        footer: h('div', { class: 'matrix-legend' }, ...counts.map(({ s, n }) => h('span', { class: ['matrix-legend-item', `tone-${LEGAL_TONE[s]}`] }, glyph(LEGAL_TONE[s], 12), h('span', {}, s), h('span', { class: 'legend-value' }, fmt.num(n))))),
      });
    }

    function buildDocuments(data) {
      const tiles = h('div', { class: 'hero-facts' }, ...Object.keys(DOC_STATUS).map((k) => {
        const meta = DOC_STATUS[k];
        return h('div', { class: ['fact', `tone-${meta.tone}`] },
          h('span', { class: 'fact-label row gap-1' }, glyph(meta.tone, 12), h('span', {}, meta.label)),
          h('span', { class: 'fact-value' }, fmt.num(data.docCounts[k] || 0)));
      }));
      const attention = data.docs.filter((d) => d.status !== 'valid').sort((a, b) => (a.status === 'expired' ? 0 : 1) - (b.status === 'expired' ? 0 : 1) || (a.score ?? 0) - (b.score ?? 0));
      const list = h('ul', { class: 'urgent-list', 'aria-label': 'وثائق تتطلب إجراءً' },
        ...attention.slice(0, 6).map((d) => {
          const meta = DOC_STATUS[d.status];
          return h('li', { class: ['urgent-item', `tone-${meta.tone}`] },
            h('span', { class: 'urgent-icon' }, glyph(meta.tone, 14)),
            h('span', { class: 'urgent-text' }, h('span', {}, d.title), h('span', { class: 'urgent-sub' }, d.clause ? `البند ${d.clause}${d.subTitle ? ` — ${d.subTitle}` : ''}` : '—')),
            h('span', { class: 'urgent-due' }, mono(d.code), h('span', {}, d.status === 'expired' ? 'إعادة إصدار' : 'مراجعة')));
        }));
      const total = data.docs.length;
      const validPct = total ? Math.round(((data.docCounts.valid || 0) / total) * 100) : 0;
      const body = h('div', { class: 'stack gap-4' },
        tiles,
        h('div', { class: 'progress-row' }, progress({ value: validPct, max: 100, tone: scoreTone(validPct), label: 'نسبة الوثائق السارية' }), h('span', { class: 'progress-value' }, fmt.pct(validPct))),
        attention.length
          ? h('div', { class: 'stack gap-2' }, h('span', { class: 'text-xs muted' }, 'وثائق تتطلب إجراءً — الأعلى أولوية أولاً'), list)
          : h('div', { class: 'note tone-good' }, 'جميع الوثائق المضبوطة سارية ومحدّثة.'),
        h('p', { class: 'text-xs muted' }, `الإجمالي ${fmt.num(total)} وثيقة مضبوطة. تُشتق الحالة من درجة البند الفرعي الحاكم لكل وثيقة والفجوات المفتوحة عليه.`),
      );
      const tableFn = () => {
        const t = h('table', { class: 'table is-dense' }, h('thead', {}, h('tr', {}, h('th', { scope: 'col' }, 'الرمز'), h('th', { scope: 'col' }, 'الوثيقة'), h('th', { scope: 'col' }, 'البند الحاكم'), h('th', { scope: 'col' }, 'الحالة'))));
        const tb = h('tbody');
        data.docs.forEach((d) => tb.appendChild(h('tr', {}, h('td', { class: 'mono' }, d.code), h('td', {}, d.title), h('td', { class: 'mono' }, d.clause || '—'), h('td', {}, DOC_STATUS[d.status].short))));
        t.appendChild(tb);
        return t;
      };
      return card({ code: 'ISO-05', title: 'ضبط الوثائق', subtitle: 'المعلومات الموثقة — البند 7.5', className: 'col-span-4', body, tableView: tableFn });
    }

    /* ───────────────────────── build ───────────────────────── */

    function build() {
      raf = 0;
      const data = collect();
      const frag = document.createDocumentFragment();
      frag.append(
        buildHead(data),
        h('div', { class: 'grid-12' }, buildHero(data), buildSpider(data)),
        buildClauseCards(data),
        h('div', { class: 'grid-12' }, buildLegal(data), buildDocuments(data)),
      );
      root.replaceChildren(frag);
    }

    function schedule() { if (!raf) raf = requestAnimationFrame(build); }

    const RELEVANT = /^(\*|isoClauses|legalRegister|documents)/;
    const unsubs = [
      bus.on('store:change', (payload) => { const path = payload && payload.path ? String(payload.path) : '*'; if (RELEVANT.test(path)) schedule(); }),
      bus.on('settings:change', (payload) => {
        const n = payload && payload.settings ? payload.settings.numerals : safe(() => store.state.settings.numerals, lastNumerals);
        if (n !== lastNumerals) { lastNumerals = n; schedule(); }
      }),
    ];

    build();

    return () => {
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      unsubs.forEach((u) => { try { if (typeof u === 'function') u(); } catch { /* ignore */ } });
      if (openDrawer) { try { openDrawer.close(); } catch { /* ignore */ } openDrawer = null; }
      root.remove();
    };
  },
};
