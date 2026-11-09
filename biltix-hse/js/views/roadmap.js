/**
 * Biltix Risk AI — view: خارطة الطريق والمقترح التفصيلي (js/views/roadmap.js) — PLT-03
 *
 * The detailed proposal as a living page: a DOM-built vertical diagram of the five
 * architecture layers (.layer-stack from css/platform.css) with the v2 additions
 * highlighted (teal: enterprise connectors, red: validation & cleansing layer, navy: backend
 * classification logic), the scope-of-work checklist, assumptions, the M0–M4 milestone Gantt
 * (.roadmap-gantt), the milestone table with editable payment percentages persisted in
 * settings.platform.paymentPct (live total, green at exactly 100%), the integration
 * principle note and 'تصدير المقترح' (print).
 *
 * Fallback styles for the structures this view introduces (v2 accents, check lists, the
 * principle grid) live in a `@layer views` block, so the unlayered css/platform.css
 * (PLATFORM-CORE) always takes precedence.
 *
 * Contract: docs/ARCHITECTURE.md §4, B1 (layers), B3 (roadmap), B5 (paymentPct), B8, B9.11.
 * Data reaches the DOM only through textContent / components.h. No cross-view imports.
 */

const STYLE_ID = 'view-roadmap-style';
const STYLE_TEXT = `@layer views {
  .layer-stack-item.is-v2 { border-color: color-mix(in srgb, var(--v2-tone, var(--line-2)) 55%, var(--line)); background: color-mix(in srgb, var(--v2-tone, var(--bg-2)) 8%, var(--bg-2)); }
  .layer-stack-body { display: flex; flex-direction: column; gap: 8px; min-inline-size: 0; }
  .layer-stack-title { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
  .arch-nodes { display: flex; flex-wrap: wrap; gap: 8px; }
  .arch-node { display: inline-flex; align-items: center; gap: 6px; padding: 5px 10px; border-radius: 8px; background: var(--bg-1); border: 1px solid var(--line); font-size: var(--fs-xs); color: var(--ink-2); min-inline-size: 0; }
  .arch-node > svg { flex: none; color: var(--ink-3); }
  .arch-node.is-v2 { border-color: color-mix(in srgb, var(--v2-tone) 60%, transparent); background: color-mix(in srgb, var(--v2-tone) 12%, var(--bg-1)); color: var(--ink-1); }
  .arch-node.is-v2 > svg { color: var(--v2-tone); }
  .v2-badge { display: inline-flex; align-items: center; gap: 5px; padding: 1px 8px; border-radius: var(--radius-pill); font-size: 11px; font-weight: 600; color: color-mix(in srgb, var(--v2-tone) 80%, var(--ink-1)); background: color-mix(in srgb, var(--v2-tone) 14%, var(--bg-1)); border: 1px solid color-mix(in srgb, var(--v2-tone) 45%, var(--line)); }
  .v2-badge > svg { inline-size: 12px; block-size: 12px; }
  .v2-legend { display: flex; flex-wrap: wrap; gap: 8px 14px; align-items: center; font-size: var(--fs-xs); color: var(--ink-2); }
  .v2-legend-item { display: inline-flex; align-items: center; gap: 6px; }
  .v2-legend-key { inline-size: 10px; block-size: 10px; border-radius: 3px; background: var(--v2-tone); flex: none; }
  .arch-connector { display: flex; justify-content: center; color: var(--ink-3); block-size: 18px; align-items: center; }
  .check-list { margin: 0; padding: 0; list-style: none; display: grid; gap: 10px; }
  .check-list > li { display: grid; grid-template-columns: 22px minmax(0, 1fr); gap: 10px; align-items: start; font-size: var(--fs-sm); color: var(--ink-1); line-height: 1.55; }
  .check-list > li > svg { color: var(--good); margin-block-start: 2px; }
  .check-list.is-assumptions > li > svg { color: var(--brand); }
  .check-list.is-out > li { color: var(--ink-2); }
  .check-list.is-out > li > svg { color: var(--ink-3); }
  .deliverables { margin: 0; padding-inline-start: 1.1em; font-size: var(--fs-xs); color: var(--ink-2); line-height: 1.55; display: grid; gap: 2px; }
  .principle-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--space-3); }
  .principle-col { padding: 12px 14px; border-radius: var(--radius-ctl); border: 1px solid var(--line); background: var(--bg-2); border-block-start: 3px solid var(--tone, var(--line-2)); }
  .principle-col h3 { margin: 0 0 8px; font-size: var(--fs-sm); display: flex; align-items: center; gap: 8px; }
  .principle-col ul { margin: 0; padding-inline-start: 1.1em; font-size: var(--fs-xs); color: var(--ink-2); line-height: 1.6; }
  @media (max-width: 720px) { .principle-grid { grid-template-columns: minmax(0, 1fr); } }
  @media print { .view-roadmap .view-actions, .view-roadmap .btn, .view-roadmap .card-view-toggle { display: none !important; } .view-roadmap .card { break-inside: avoid; } .view-roadmap .roadmap-payment input { border: 0; background: transparent; } }
}`;

const MONTHS = 5; // M0 … M4
const MILESTONE_IDS = ['M0', 'M1', 'M2', 'M3', 'M4'];
const STATUS_TONE = { 'منجز': 'good', 'جارٍ': 'accent', 'قادم': 'neutral' };
const V2 = {
  connectors: { label: 'موصلات الأنظمة المؤسسية', tone: 'var(--accent)', toneName: 'سماوي' },
  validation: { label: 'طبقة التحقق والتنظيف', tone: 'var(--critical)', toneName: 'أحمر' },
  classification: { label: 'منطق التصنيف الخلفي', tone: 'var(--brand)', toneName: 'كحلي' },
};
const LAYERS = [
  { no: '1', title: 'طبقة التكامل', desc: 'موصلات REST/SDK وWebhooks تقرأ من وحدات تطبيق بلتكس، ومن الأنظمة المؤسسية، ومن التغذيات الخارجية.', nodes: [['layers', 'وحدات بلتكس: العقود · BoM/BoQ · الجدول · تقارير الموقع · التكلفة · الصور'], ['integration', 'Primavera P6 EPPM', 'connectors'], ['integration', 'Autodesk Platform Services', 'connectors'], ['integration', 'Oracle ERP / CRM', 'connectors'], ['plug', 'SAP · Zoho · HubSpot (قابلة للضبط)', 'connectors'], ['globe', 'السلع · أسعار الصرف · الأرصاد · GIS']] },
  { no: '2', title: 'طبقة التحقق والتنظيف', desc: 'فحص المخطط، إزالة التكرار، الاكتمال والاتساق — لا يصل سجل إلى المحرك قبل اجتيازها.', v2: 'validation', nodes: [['list', 'مخطط البيانات'], ['copy', 'إزالة التكرار'], ['badge-check', 'الاكتمال'], ['sliders', 'الاتساق'], ['alert', 'قائمة الحجر']] },
  { no: '3', title: 'بحيرة بيانات المخاطر', desc: 'بيانات مهيكلة وغير مهيكلة مُوحَّدة، مُصدَّرة (versioned) وقابلة للتدقيق.', nodes: [['erp', 'سجلات مهيكلة'], ['file-text', 'مستندات وصور'], ['clock', 'إصدارات زمنية'], ['shield-alert', 'مسار تدقيق']] },
  { no: '4', title: 'محرك المخاطر بالذكاء الاصطناعي', desc: 'خمسة خطوط على طبقة تسجيل وتفسير مشتركة: درجة 0–100 مع تفسير بلغة واضحة.', nodes: [['file-text', 'العقود (NLP)'], ['list', 'توقع المواد (BoM)'], ['calendar', 'نموذج الجدول + مونت كارلو'], ['helmet', 'صور وتقارير الموقع'], ['chart', 'توقع التكلفة (EVM)']] },
  { no: '5', title: 'التصنيف والتنبيه وقمرة القيادة', desc: 'النوع (مالي / سلامة / تأخير / نزاع) والتقييم (أحمر / أصفر / أخضر)، ثم التنبيه وسير العمل والكتابة العكسية.', nodes: [['filter', 'منطق التصنيف الخلفي', 'classification'], ['bell', 'التنبيه والتصعيد'], ['refresh', 'الكتابة العكسية إلى Biltix PM'], ['file-check', 'مهام المعالجة'], ['radar', 'قمرة قيادة المخاطر']] },
];
const READS = ['العقود والبنود والالتزامات', 'جداول الكميات BoM/BoQ وكميات BIM', 'الجدول الزمني والمسار الحرج (P6)', 'تقارير الموقع اليومية والصور', 'التكلفة والميزانية والقيمة المكتسبة (ERP)', 'السلع وأسعار الصرف والأرصاد'];
const WRITES = ['أعلام المخاطر على العنصر الأصلي (بند / سطر / نشاط)', 'الدرجة 0–100 والتقييم اللوني', 'التنبيهات والتصعيدات', 'مهام المعالجة المُسندة ومواعيدها'];

const safe = (fn, fallback) => { try { const v = fn(); return v === undefined ? fallback : v; } catch { return fallback; } };
const arr = (v) => (Array.isArray(v) ? v : []);
const num = (v, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);

function ensureStyle() {
  if (typeof document === 'undefined' || document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = STYLE_TEXT;
  document.head.appendChild(style);
}

export default {
  id: 'roadmap',
  code: 'PLT-03',
  title: 'خارطة الطريق والمقترح التفصيلي',
  icon: 'calendar',

  render(container, ctx) {
    const { store, bus, fmt, components, psel, router } = ctx;
    const { h, card, badge, button, toast, emptyState, svgIcon, glyph } = components;

    ensureStyle();
    const root = h('section', { class: 'view view-roadmap' });
    container.appendChild(root);

    let raf = 0;
    let restoreFocusId = null;

    /* ───────────────────────── helpers ───────────────────────── */

    const mono = (text, extra = []) => h('span', { class: ['mono', 'num', ...arr(extra)] }, String(text ?? '—'));
    const totalTone = (t) => (t === 100 ? 'good' : (t > 100 ? 'critical' : (t > 0 ? 'warning' : 'neutral')));
    const totalLabel = (t) => (t === 100 ? 'المجموع 100% — مكتمل' : (t > 100 ? `المجموع ${fmt.pct(t)} — يتجاوز 100%` : (t > 0 ? `المجموع ${fmt.pct(t)} — المتبقي ${fmt.pct(100 - t)}` : 'لم تُحدد النسب بعد')));

    function totalBadge(total) {
      const el = badge(totalLabel(total), totalTone(total));
      el.classList.add('payment-total');
      el.setAttribute('aria-live', 'polite');
      return el;
    }
    function paintTotal(el, total) {
      const tone = totalTone(total);
      el.className = `badge tone-${tone} payment-total`;
      el.dataset.tone = tone;
      const ic = el.querySelector('.badge-icon'); const next = glyph(tone, 14); next.classList.add('badge-icon');
      if (ic) ic.replaceWith(next); else el.insertBefore(next, el.firstChild);
      const text = el.querySelector('.badge-text'); if (text) text.textContent = totalLabel(total);
    }

    function savePayment(id, value) {
      store.setSettings({ platform: { paymentPct: { [id]: value } } });
    }

    /* ───────────────────────── data ───────────────────────── */

    function collect() {
      const state = store.state;
      const plat = safe(() => psel.platform(state), null) || state.platform || {};
      const roadmap = plat.roadmap || {};
      const saved = (state.settings && state.settings.platform && state.settings.platform.paymentPct) || {};
      const milestones = arr(roadmap.milestones).map((m, i) => {
        const id = m.id || MILESTONE_IDS[i] || `M${i}`;
        const savedPct = saved[id];
        const pct = savedPct === null || savedPct === undefined || savedPct === '' ? (m.paymentPct === null || m.paymentPct === undefined ? null : num(m.paymentPct)) : num(savedPct);
        return { ...m, id, month: Math.max(0, num(m.month, i)), duration: Math.max(0.5, num(m.durationMonths, 1)), pct, deliverables: arr(m.deliverables) };
      }).sort((a, b) => a.month - b.month);
      const total = milestones.reduce((a, m) => a + (m.pct === null ? 0 : m.pct), 0);
      const current = milestones.find((m) => m.status === 'جارٍ') || null;
      const span = Math.max(MONTHS, Math.ceil(Math.max(0, ...milestones.map((m) => m.month + m.duration))), num(roadmap.totalMonths, 0));
      return { state, plat, roadmap, milestones, total, current, months: span, scope: arr(roadmap.scopeItems), assumptions: arr(roadmap.assumptions), outOfScope: arr(roadmap.outOfScope), paymentNote: roadmap.paymentNote || 'النسب تُستكمل مع العميل؛ المجموع 100%' };
    }

    /* ───────────────────────── sections ───────────────────────── */

    function buildHead(data) {
      return h('div', { class: 'view-head' },
        h('div', { class: 'view-head-text' },
          h('span', { class: 'code-tag' }, 'PLT-03'),
          h('h1', { tabindex: '-1' }, 'خارطة الطريق والمقترح التفصيلي'),
          h('p', { class: 'view-lead' }, 'منصة إدارة المخاطر بالذكاء الاصطناعي — الإصدار الثاني: المعمارية بخمس طبقات، نطاق العمل، الافتراضات، المعالم من M0 إلى M4، وجدول الدفعات القابل للاستكمال مع العميل.'),
        ),
        h('div', { class: 'view-actions' },
          totalBadge(data.total),
          button('تصدير المقترح', { variant: 'primary', size: 'sm', icon: 'print', onClick: () => { try { window.print(); } catch { toast('تعذر فتح نافذة الطباعة', { tone: 'warning' }); } } }),
        ),
      );
    }

    /** .layer-stack > .layer-stack-item[data-layer] > .layer-stack-index + body(h4 + p + nodes) — structure from css/platform.css, v2 accents from this view. */
    function buildArchitecture() {
      const diagram = h('div', { class: 'layer-stack', role: 'group', 'aria-label': 'المعمارية بخمس طبقات مع إضافات الإصدار الثاني' });
      LAYERS.forEach((layer, i) => {
        const v2 = layer.v2 ? V2[layer.v2] : null;
        const nodes = h('div', { class: 'arch-nodes' }, ...layer.nodes.map(([icon, label, v2key]) => {
          const tag = v2key ? V2[v2key] : null;
          return h('span', { class: ['arch-node', tag ? 'is-v2' : null], style: tag ? { '--v2-tone': tag.tone } : undefined, title: tag ? `إضافة الإصدار الثاني — ${tag.label}` : undefined }, svgIcon(icon, 13), h('span', {}, label), tag ? h('span', { class: 'sr-only' }, ` (إضافة الإصدار الثاني: ${tag.label})`) : null);
        }));
        diagram.appendChild(h('div', { class: ['layer-stack-item', v2 ? 'is-v2' : null], 'data-layer': layer.no, style: v2 ? { '--v2-tone': v2.tone } : undefined },
          h('span', { class: 'layer-stack-index', 'aria-hidden': 'true' }, layer.no),
          h('div', { class: 'layer-stack-body' },
            h('div', { class: 'layer-stack-title' }, h('h4', {}, layer.title), v2 ? h('span', { class: 'v2-badge' }, svgIcon('sparkles', 12), h('span', {}, `إضافة الإصدار الثاني — ${v2.toneName}`)) : null),
            h('p', {}, layer.desc),
            nodes,
          ),
        ));
        if (i < LAYERS.length - 1) diagram.appendChild(h('div', { class: 'arch-connector', 'aria-hidden': 'true' }, glyph('chevronDown', 16)));
      });
      const legend = h('div', { class: 'v2-legend', 'aria-label': 'دليل ألوان إضافات الإصدار الثاني' },
        h('span', { class: 'semibold' }, 'إضافات الإصدار الثاني:'),
        ...Object.values(V2).map((v) => h('span', { class: 'v2-legend-item', style: { '--v2-tone': v.tone } }, h('span', { class: 'v2-legend-key', 'aria-hidden': 'true' }), svgIcon('sparkles', 12), h('span', {}, `${v.label} (${v.toneName})`))),
      );
      return card({
        code: 'RM-01', title: 'المعمارية بخمس طبقات', subtitle: 'من موصلات التكامل إلى قمرة القيادة — المبدأ الثابت: قراءة من أنظمة العميل، وكتابة عكسية لأعلام المخاطر فقط',
        body: h('div', { class: 'stack gap-4' }, legend, diagram),
      });
    }

    function checkList(items, { icon, className, empty }) {
      if (!items.length) return emptyState({ title: empty });
      return h('ul', { class: ['check-list', className] }, ...items.map((item) => {
        const text = typeof item === 'string' ? item : (item && (item.text || item.title)) || '—';
        const done = item && typeof item === 'object' && item.done === true;
        return h('li', {}, icon(), h('span', { class: 'row wrap gap-2', style: { alignItems: 'baseline' } }, h('span', {}, text), done ? badge('منجز', 'good') : null));
      }));
    }

    function buildScopeCard(data) {
      return card({
        code: 'RM-02', title: 'نطاق العمل', subtitle: `${fmt.num(data.scope.length)} بنود تسليم في الإصدار الثاني`,
        className: 'col-span-6',
        body: h('div', { class: 'stack gap-4' },
          checkList(data.scope, { icon: () => glyph('good', 18), className: 'is-scope', empty: 'لم تُحمَّل بنود نطاق العمل' }),
          data.outOfScope.length ? h('div', { class: 'stack gap-2' }, h('span', { class: 'text-sm semibold muted' }, 'خارج النطاق'), checkList(data.outOfScope, { icon: () => glyph('neutral', 18), className: 'is-out', empty: '' })) : null,
        ),
      });
    }

    function buildAssumptionsCard(data) {
      return card({
        code: 'RM-03', title: 'الافتراضات', subtitle: 'ما يعتمد عليه الجدول الزمني والنطاق',
        className: 'col-span-6',
        body: checkList(data.assumptions, { icon: () => glyph('brand', 18), className: 'is-assumptions', empty: 'لم تُحمَّل الافتراضات' }),
        footer: h('p', { class: 'text-xs muted' }, 'أي تغيير في الافتراضات (توفر واجهات الأنظمة، جودة البيانات التاريخية، توفر فريق العميل) يُدار عبر طلب تغيير على المعالم M2–M4.'),
      });
    }

    /** .roadmap-gantt[--months] > .roadmap-gantt-head(spacer + .roadmap-months > .roadmap-month*) + .roadmap-row*(.roadmap-row-label + .roadmap-row-track > .roadmap-bar[data-status][--start,--span]) */
    function buildGanttCard(data) {
      if (!data.milestones.length) return card({ code: 'RM-04', title: 'المعالم الزمنية', body: emptyState({ title: 'لم تُحمَّل معالم خارطة الطريق' }) });
      const months = data.months;
      const gantt = h('div', { class: 'roadmap-gantt', role: 'table', 'aria-label': 'مخطط جانت للمعالم من M0 إلى M4', style: { '--months': String(months) } });
      const monthsRow = h('div', { class: 'roadmap-months', role: 'row' });
      const currentMonth = data.current ? Math.floor(data.current.month) : -1;
      for (let m = 0; m < months; m += 1) monthsRow.appendChild(h('span', { class: 'roadmap-month', role: 'columnheader', title: `الشهر ${fmt.num(m + 1)}`, 'aria-label': `الشهر ${fmt.num(m + 1)}`, style: currentMonth === m ? { color: 'var(--accent)', fontWeight: '600' } : undefined }, fmt.num(m + 1)));
      gantt.appendChild(h('div', { class: 'roadmap-gantt-head' }, h('span', { role: 'columnheader' }, 'المعلم / الشهر'), monthsRow));
      data.milestones.forEach((m) => {
        // Fractional months are common in the proposal (M0 = half a month), so bars are positioned by percentage.
        const start = Math.min(months, Math.max(0, m.month));
        const span = Math.max(0.5, Math.min(months - start, m.duration));
        const tone = STATUS_TONE[m.status] || 'neutral';
        const bar = h('div', { class: ['roadmap-bar', m.status === 'منجز' ? 'is-done' : null, m.status === 'جارٍ' ? 'is-active' : null, m.status === 'قادم' ? 'is-upcoming' : null], 'data-status': m.status || 'قادم',
          style: { '--start': String(Math.floor(start)), '--span': String(Math.max(1, Math.round(span))), position: 'absolute', insetBlockStart: '5px', blockSize: '22px', margin: '0', insetInlineStart: `calc(${((start / months) * 100).toFixed(3)}% + 2px)`, inlineSize: `calc(${((span / months) * 100).toFixed(3)}% - 4px)` },
          title: `${m.name || m.id} — ${m.status || ''} · من الشهر ${fmt.num(Math.floor(start) + 1)}، ${fmt.num(span, { maximumFractionDigits: 1 })} شهر` },
          glyph(tone, 12), h('span', {}, m.status || '—'));
        gantt.appendChild(h('div', { class: 'roadmap-row', role: 'row' },
          h('div', { class: 'roadmap-row-label', role: 'rowheader' }, h('span', { class: 'mono' }, m.id), h('strong', { title: m.name || '' }, m.name || m.id)),
          h('div', { class: 'roadmap-row-track', role: 'cell' }, bar),
        ));
      });
      const legend = h('div', { class: 'row wrap gap-2', 'aria-label': 'حالات المعالم' }, h('span', { class: 'text-xs muted' }, 'الحالة:'), ...Object.entries(STATUS_TONE).map(([label, tone]) => badge(label, tone)), h('span', { class: 'toolbar-spacer' }), h('span', { class: 'text-xs muted' }, `${fmt.num(months)} أشهر إجمالاً`));
      return card({
        code: 'RM-04', title: 'المعالم الزمنية (M0 – M4)', subtitle: data.current ? `المعلم الجاري: ${data.current.id} — ${data.current.name}` : `خمسة معالم على مدى ${fmt.num(months)} أشهر`,
        body: h('div', { class: 'stack gap-3' }, gantt, legend),
        tableView: () => {
          const t = h('table', { class: 'table is-dense' });
          t.appendChild(h('thead', {}, h('tr', {}, ...['المعلم', 'الاسم', 'الشهر', 'الحالة'].map((x) => h('th', { scope: 'col' }, x)))));
          t.appendChild(h('tbody', {}, ...data.milestones.map((m) => h('tr', {}, h('td', { class: 'mono' }, m.id), h('td', {}, m.name || '—'), h('td', {}, `الشهر ${fmt.num(Math.floor(m.month) + 1)} · ${fmt.num(m.duration, { maximumFractionDigits: 1 })} شهر`), h('td', {}, m.status || '—')))));
          return t;
        },
      });
    }

    function buildMilestoneTable(data) {
      if (!data.milestones.length) return null;
      const total = totalBadge(data.total);
      const totalRow = h('div', { class: ['roadmap-total', data.total === 100 ? 'is-ok' : 'is-off'] }, h('span', {}, 'إجمالي نسب الدفعات'), h('span', { class: 'row gap-2' }, h('span', { class: 'mono num' }, fmt.pct(data.total)), total));
      const inputs = new Map();
      const recompute = () => {
        let sum = 0; for (const inp of inputs.values()) { if (inp.value !== '') sum += num(inp.value); }
        paintTotal(total, sum);
        totalRow.classList.toggle('is-ok', sum === 100); totalRow.classList.toggle('is-off', sum !== 100);
        const sumEl = totalRow.querySelector('.mono'); if (sumEl) sumEl.textContent = fmt.pct(sum);
        const headerBadge = root.querySelector('.view-head .payment-total'); if (headerBadge) paintTotal(headerBadge, sum);
      };

      const table = h('table', { class: 'table milestone-table' });
      table.appendChild(h('caption', { class: 'sr-only' }, 'جدول المعالم والمخرجات ونسب الدفعات'));
      table.appendChild(h('thead', {}, h('tr', {}, ...[['المعلم', ''], ['المخرجات', ''], ['الشهر', 'align-center'], ['الحالة', ''], ['نسبة الدفعة', 'align-end']].map(([label, cls]) => h('th', { scope: 'col', class: cls || null }, label)))));
      const tbody = h('tbody');
      data.milestones.forEach((m) => {
        const id = `pay-${m.id}`;
        const input = h('input', { type: 'number', id, class: 'field-control', min: '0', max: '100', step: '5', inputmode: 'decimal', dir: 'ltr', 'aria-label': `نسبة دفعة المعلم ${m.id} — ${m.name || ''}`, placeholder: '—' });
        input.value = m.pct === null ? '' : String(m.pct);
        input.addEventListener('input', recompute);
        input.addEventListener('change', () => {
          let v = input.value === '' ? null : num(input.value);
          if (v !== null) { v = Math.min(100, Math.max(0, v)); input.value = String(v); }
          restoreFocusId = id;
          savePayment(m.id, v);
          const sum = Array.from(inputs.values()).reduce((a, inp) => a + (inp.value === '' ? 0 : num(inp.value)), 0);
          toast(sum === 100 ? 'تم حفظ نسب الدفعات — المجموع 100%' : `تم حفظ نسبة ${m.id} — المجموع الحالي ${fmt.pct(sum)}`, { tone: sum === 100 ? 'good' : 'neutral' });
        });
        inputs.set(m.id, input);
        tbody.appendChild(h('tr', {},
          h('td', {}, h('div', { class: 'stack', style: { gap: '2px' } }, mono(m.id), h('span', { class: 'text-sm semibold' }, m.name || '—'))),
          h('td', {}, m.deliverables.length ? h('ul', { class: 'deliverables' }, ...m.deliverables.map((d) => h('li', {}, typeof d === 'string' ? d : (d && (d.text || d.title)) || '—'))) : h('span', { class: 'muted' }, '—')),
          h('td', { class: 'align-center' }, h('span', { class: 'stack', style: { gap: '1px', alignItems: 'center' } }, h('span', { class: 'mono num' }, `${fmt.num(Math.floor(m.month) + 1)}`), h('span', { class: 'text-xs muted nowrap' }, `${fmt.num(m.duration, { maximumFractionDigits: 1 })} شهر`))),
          h('td', {}, badge(m.status || '—', STATUS_TONE[m.status] || 'neutral')),
          h('td', { class: 'align-end' }, h('span', { class: 'roadmap-payment' }, input, h('span', { class: 'muted text-sm', 'aria-hidden': 'true' }, '%'))),
        ));
      });
      table.appendChild(tbody);

      return card({
        code: 'RM-05', title: 'المعالم والمخرجات وجدول الدفعات', subtitle: data.paymentNote,
        body: h('div', { class: 'stack gap-3' }, h('div', { class: 'table-wrap' }, table), totalRow),
        footer: h('p', { class: 'text-xs muted' }, 'النسب تُحفظ محلياً في إعدادات المنصة وتظهر في المقترح المطبوع؛ يتحول المجموع إلى الأخضر عند بلوغ 100% بالضبط.'),
      });
    }

    function buildPrincipleCard() {
      return card({
        code: 'RM-06', title: 'مبدأ التكامل', subtitle: 'قراءة فقط من أنظمة العميل — كتابة عكسية لأعلام المخاطر والتنبيهات والمهام فقط',
        body: h('div', { class: 'stack gap-3' },
          h('div', { class: 'note', style: { '--tone': 'var(--accent)' } }, h('strong', {}, 'لا تُعدِّل المنصة أي بيانات مصدرية. '), 'تبقى العقود والكميات والجداول والتكاليف ملكاً لأنظمتها؛ تضيف المنصة طبقة مخاطر فوقها فقط، وكل كتابة عكسية مُسجَّلة في سجل التدقيق وقابلة للتراجع.'),
          h('div', { class: 'principle-grid' },
            h('div', { class: 'principle-col', style: { '--tone': 'var(--brand)' } }, h('h3', {}, svgIcon('download', 15), h('span', {}, 'تقرأ المنصة')), h('ul', {}, ...READS.map((t) => h('li', {}, t)))),
            h('div', { class: 'principle-col', style: { '--tone': 'var(--good)' } }, h('h3', {}, svgIcon('upload', 15), h('span', {}, 'تكتب المنصة عكسياً')), h('ul', {}, ...WRITES.map((t) => h('li', {}, t)))),
          ),
        ),
        footer: h('div', { class: 'row between wrap' }, h('span', { class: 'text-xs muted' }, 'أمن ووصول حسب الدور، تدقيق وإصدارات، قابلية التفسير، وتجاوز بشري مُسجَّل — متطلبات عرضية على كل الطبقات.'), button('موصلات التكامل', { variant: 'ghost', size: 'sm', icon: 'link', onClick: () => router.navigate('integrations') })),
      });
    }

    /* ───────────────────────── build ───────────────────────── */

    function build() {
      raf = 0;
      const data = collect();
      const frag = document.createDocumentFragment();
      frag.append(
        buildHead(data),
        buildArchitecture(),
        h('div', { class: 'grid-12' }, buildScopeCard(data), buildAssumptionsCard(data)),
        buildGanttCard(data),
        buildMilestoneTable(data),
        buildPrincipleCard(),
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

    const NOISY = /^(feed|sensors|integrations|settings)/;
    const unsubs = [
      bus.on('store:change', (payload) => { const path = payload && payload.path ? String(payload.path) : '*'; if (!NOISY.test(path)) schedule(); }),
      bus.on('filters:change', () => { /* roadmap is portfolio-level: no filter dependency */ }),
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
