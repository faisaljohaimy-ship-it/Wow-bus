# Biltix HSE — مركز قيادة السلامة والصحة المهنية
## Architecture & module contract (single source of truth for every builder)

This document is the binding contract between modules. Every builder agent owns a
disjoint set of files and codes **only** against the APIs written here. If something is
missing from the contract, implement it locally in your own file; never edit another
agent's file. Read this whole file before writing a line.

---

## 0. Product summary

A static, build-free, single-page web application (Arabic, RTL) that is an
**Occupational Health & Safety (OHS/HSE) risk-management command center** for
**بلتكس (Biltix)** — a Saudi construction-technology company whose platform covers
construction project management, site inspections, document management (Biltix DMS)
and daily site operations for contractors, project managers, engineers and consultants.

The dashboard looks like an engineering operations room: dark "command center" theme by
default (light theme available), continuously animated radars that never stop, a live
event feed from connected systems, and architectural geometry (Islamic eight-point-star
lattice "mashrabiya", isometric building blocks, blueprint grids, CAD corner brackets)
as the visual DNA.

Deployment target: Vercel static hosting. Root of the deployment = `biltix-hse/`.

Hard constraints:
- **No build step, no framework, no npm dependencies.** Plain ES modules (`type="module"`),
  CSS custom properties, Canvas 2D + SVG. The only external resource is Google Fonts.
- **Arabic RTL first.** `<html lang="ar" dir="rtl">`. Use CSS logical properties
  (`margin-inline-start`, `inset-inline-end`, `padding-inline`, `text-align: start`)
  everywhere; never `left/right` except inside canvas math.
- **Security:** anything that comes from data or user input goes into the DOM via
  `textContent` / `createTextNode` / attribute setters — never string-concatenated
  `innerHTML`. `innerHTML` is allowed only for static, hard-coded SVG/markup literals
  that contain no data.
- **Accessibility:** landmarks, labels, `:focus-visible` rings, every chart has a table
  view twin, status is never color-alone (icon + label), `prefers-reduced-motion`
  respected (radars keep a slow, non-sweeping pulse instead of a sweep).
- **Performance:** one shared `requestAnimationFrame` loop for all radars; canvases
  sized for `devicePixelRatio` (cap 2); loops pause when `document.hidden`; feed capped
  at 200 items; no layout thrash (batch DOM writes).

---

## 1. File layout & ownership

```
biltix-hse/
  index.html                  (owner: CORE)   app shell markup, font links, module bootstrap
  vercel.json                 (owner: CORE)
  assets/favicon.svg          (owner: ART)
  assets/manifest.webmanifest (owner: CORE)
  css/tokens.css              (owner: CSS)    design tokens, both themes, typography scale
  css/base.css                (owner: CSS)    reset, shell layout (app bar, nav rail, main, feed), utilities, responsive
  css/components.css          (owner: CSS)    cards, tiles, badges, buttons, tables, forms, modal, drawer, kanban, toast, tabs, segmented, command palette, feed items
  css/charts.css              (owner: CSS)    chart chrome: axes, grid, legend, tooltip, table-view, radar frames
  css/print.css               (owner: CSS)    print report layout
  docs/ARCHITECTURE.md        (this file)
  js/core/bus.js              (owner: CORE)   event bus
  js/core/fmt.js              (owner: CORE)   number/date/duration formatting (numerals setting aware)
  js/core/store.js            (owner: CORE)   state store + persistence + CRUD + filters
  js/core/selectors.js        (owner: CORE)   derived data (KPIs, matrices, trends) — pure functions
  js/core/router.js           (owner: CORE)   hash router, view lifecycle
  js/app.js                   (owner: CORE)   bootstrap: theme, settings, shell wiring, command palette, notifications, live engine start
  js/data/seed.js             (owner: DATA)   all Arabic seed content (sites, risks, incidents, permits, inspections, workers, courses, ISO clauses, integrations, sensors, legal register)
  js/data/live.js             (owner: LIVE)   live simulation engine (seeded RNG), sensor drift, feed events, permit expiry, blip derivation
  js/data/sources.js          (owner: LIVE)   external adapters: JSON API, Google Sheets CSV, Supabase REST, webhook POST, CSV/JSON export
  js/ui/components.js         (owner: CORE)   DOM helpers + reusable components (card, statTile, badge, dataTable, modal, drawer, toast, kanban, forms, segmented, tabs, emptyState)
  js/ui/charts.js             (owner: CHARTS) SVG charts: line, bars, heatmap/matrix, segmented bar, sparkline, meter, ring, spider; tooltip; table views
  js/ui/radar.js              (owner: RADAR)  Canvas radars: SweepRadar, SensorRadar, SitePlanRadar, ComplianceRadar; radarLoop
  js/ui/art.js                (owner: ART)    architectural SVG art: logo mark, mashrabiya pattern, isometric grid, blueprint backdrop, icon set
  js/views/overview.js        (owner: VIEWS-A)
  js/views/radar.js           (owner: VIEWS-A)
  js/views/risks.js           (owner: VIEWS-A)
  js/views/incidents.js       (owner: VIEWS-B)
  js/views/permits.js         (owner: VIEWS-B)
  js/views/inspections.js     (owner: VIEWS-B)
  js/views/training.js        (owner: VIEWS-C)
  js/views/compliance.js      (owner: VIEWS-C)
  js/views/integrations.js    (owner: VIEWS-C)
  js/views/reports.js         (owner: VIEWS-D)
  js/views/settings.js        (owner: VIEWS-D)
  js/views/index.js           (owner: CORE)   registry: exports `views` array in nav order
```

Import paths are relative (`../core/store.js`). Every module is side-effect free on import
except `app.js` (bootstrap) and `index.html`.

---

## 2. Design tokens (css/tokens.css) — exact names

All colors are CSS custom properties on `:root`. Dark is the default theme
(`<html data-theme="dark">`); light is `data-theme="light"`. `app.js` sets the attribute
from settings and emits `theme:change` on the bus.

```css
:root, :root[data-theme="dark"] {
  color-scheme: dark;
  --bg-0: #070D18;  /* page plane */
  --bg-1: #0B1322;  /* card / chart surface  (validator surface) */
  --bg-2: #111C2E;  /* raised: inputs, hover, nested */
  --bg-3: #182540;  /* active / pressed */
  --line: #1E2B45;         /* hairline borders & gridlines */
  --line-2: #2A3A5C;       /* axis baseline / stronger border */
  --ink-1: #EEF2F8;  --ink-2: #AAB6CC;  --ink-3: #74829C;  /* primary / secondary / muted text */
  --brand: #2F6FED;  --brand-ink: #FFFFFF;   /* buttons, active nav, links */
  --accent: #19C6E6;                          /* radar sweep, live indicators, focus ring, highlights */
  --gold: #D4A017;                            /* logo + architectural ornament lines ONLY (never status) */
  --good: #0CA30C; --warning: #FAB219; --serious: #EC835A; --critical: #D03B3B;   /* status — fixed, icon+label always */
  --s1:#3987e5; --s2:#d95926; --s3:#199e70; --s4:#c98500; --s5:#d55181; --s6:#008300; --s7:#9085e9; --s8:#e66767; /* categorical series, fixed order */
  --seq-100:#cde2fb; --seq-200:#9ec5f4; --seq-300:#6da7ec; --seq-400:#3987e5; --seq-500:#256abf; --seq-600:#184f95; --seq-700:#0d366b; /* sequential blue */
  --div-neg: #e66767; --div-mid: #383835; --div-pos: #3987e5;  /* diverging */
  --shadow-1: 0 1px 2px rgba(0,0,0,.4), 0 8px 24px -12px rgba(0,0,0,.6);
  --glow-accent: 0 0 0 1px rgba(25,198,230,.35), 0 0 24px -6px rgba(25,198,230,.6);
  --radius-card: 14px; --radius-ctl: 9px; --radius-pill: 999px;
  --font-sans: "IBM Plex Sans Arabic", system-ui, -apple-system, "Segoe UI", sans-serif;
  --font-mono: "IBM Plex Mono", ui-monospace, SFMono-Regular, Menlo, monospace;
  --fs-xs: 12px; --fs-sm: 13px; --fs-md: 14px; --fs-lg: 16px; --fs-xl: 20px; --fs-2xl: 28px; --fs-hero: 48px;
  --space-1: 4px; --space-2: 8px; --space-3: 12px; --space-4: 16px; --space-5: 24px; --space-6: 32px;
  --rail-w: 236px; --rail-w-collapsed: 72px; --feed-w: 320px; --appbar-h: 64px;
  --ease: cubic-bezier(.2,.8,.2,1); --dur-1: 160ms; --dur-2: 320ms;
}
:root[data-theme="light"] {
  color-scheme: light;
  --bg-0: #F2F5FA; --bg-1: #FFFFFF; --bg-2: #F6F8FC; --bg-3: #EAF0F9;
  --line: #E3E8F0; --line-2: #C9D3E3;
  --ink-1: #0E1726; --ink-2: #4A5568; --ink-3: #6B7890;
  --brand: #2F6FED; --brand-ink: #FFFFFF; --accent: #0E93AC; --gold: #B8860B;
  --good: #0CA30C; --warning: #FAB219; --serious: #EC835A; --critical: #D03B3B;
  --s1:#2a78d6; --s2:#eb6834; --s3:#1baf7a; --s4:#eda100; --s5:#e87ba4; --s6:#008300; --s7:#6250d6; --s8:#e34948;
  --div-mid: #f0efec;
  --shadow-1: 0 1px 2px rgba(14,23,38,.06), 0 8px 24px -12px rgba(14,23,38,.18);
  --glow-accent: 0 0 0 1px rgba(14,147,172,.35), 0 0 24px -6px rgba(14,147,172,.45);
}
```

Validated: the 8 categorical steps pass all six dataviz checks on `#0B1322` (dark) and on
`#FFFFFF` (light, with the relief rule: light-mode aqua/yellow/magenta need visible
labels or the table view — every chart ships a table view). Status colors clear 3:1 on
dark; on light, `warning`/`serious` are sub-3:1 by design → always icon + label.

Typography: Google Fonts `IBM Plex Sans Arabic` (400,500,600,700) + `IBM Plex Mono`
(400,500) via `<link>` in `index.html`. Body 14px/1.6. Codes (R-1042, PTW-5521, ISO
clause numbers) use `--font-mono`. Tables and axis ticks use
`font-variant-numeric: tabular-nums`; hero and tile values use proportional figures.

Visual DNA (implemented in CSS + art.js):
- Page backdrop: `--bg-0` with a faint blueprint grid (24px, 1px lines at 4% ink) and a very
  faint mashrabiya lattice band in the app bar / hero areas.
- Cards: `--bg-1`, 1px `--line` border, `--radius-card`, `--shadow-1`, plus **CAD corner
  brackets**: 10px L-shaped brackets at the four corners drawn with `::before/::after`
  (`.card.is-framed`). A 1px top highlight `linear-gradient(90deg, transparent, var(--gold) 50%, transparent)` at 35% opacity on `.card.is-hero`.
- Section headers carry a mono "code tag" (e.g. `SEC-02`) before the title.
- Active nav item: `--brand` text + a 6px isometric diamond indicator in `--accent`.
- Live indicators: 8px dot in `--accent` with a 1.8s CSS pulse ring (`.live-dot`).

---

## 3. Data schema (js/data/seed.js exports) — exact shapes

`seed.js` exports **one** default object `seed` plus named enums. All text in Arabic
unless it is a code/standard. Dates are ISO strings (`YYYY-MM-DD` or full ISO). The
"today" anchor for generated data is `2026-11-09`.

```js
export const CATEGORIES = [ // 12 hazard categories, index = sector on the sweep radar (30° each)
  { id:'height',     name:'العمل على ارتفاعات',      icon:'height' },
  { id:'excavation', name:'الحفريات والخنادق',        icon:'excavation' },
  { id:'lifting',    name:'الرافعات وعمليات الرفع',   icon:'crane' },
  { id:'electrical', name:'الكهرباء',                 icon:'bolt' },
  { id:'confined',   name:'الأماكن المغلقة',          icon:'confined' },
  { id:'hotwork',    name:'الأعمال الساخنة',          icon:'flame' },
  { id:'heat',       name:'الإجهاد الحراري',          icon:'sun' },
  { id:'chemical',   name:'المواد الكيميائية والغبار',icon:'flask' },
  { id:'traffic',    name:'المركبات وحركة المرور',    icon:'truck' },
  { id:'scaffold',   name:'السقالات والأعمال المؤقتة',icon:'scaffold' },
  { id:'structural', name:'الانهيارات الإنشائية',     icon:'structure' },
  { id:'ergonomic',  name:'المناولة اليدوية والإرجونوميكس', icon:'body' },
];
export const RISK_STATUS = ['مفتوح','قيد المعالجة','مُسيطر عليه','مغلق'];
export const CONTROL_TYPES = ['إلغاء','استبدال','ضوابط هندسية','ضوابط إدارية','معدات الوقاية الشخصية']; // hierarchy of controls
export const INCIDENT_TYPES = ['إصابة مضيعة للوقت','إصابة تتطلب علاجاً طبياً','إسعافات أولية','حادث وشيك','تلف ممتلكات','حادث بيئي'];
export const INCIDENT_STATUS = ['مفتوح','قيد التحقيق','إجراءات تصحيحية','مغلق'];
export const PERMIT_TYPES = ['أعمال ساخنة','أماكن مغلقة','العمل على ارتفاع','عزل كهربائي','حفريات','رفع ثقيل','أعمال ليلية'];
export const PERMIT_STATUS = ['مسودة','بانتظار الاعتماد','نشط','معلق','مغلق'];
export const INSPECTION_TYPES = ['جولة سلامة','تفتيش معدات','تدقيق داخلي','تفتيش سقالات','فحص رافعات','تفتيش كهرباء'];
export const INSPECTION_STATUS = ['مجدول','منجز','متأخر'];
export const ROOT_CAUSES = ['غياب التدريب','إجراء عمل غير كافٍ','عطل معدات','ضعف الإشراف','عدم استخدام معدات الوقاية','ظروف بيئية','تصميم غير آمن','ضغط الجدول الزمني'];

seed = {
  company: { name:'بلتكس', nameEn:'Biltix', product:'Biltix HSE', tagline:'مركز قيادة السلامة والصحة المهنية', website:'https://biltix.sa' },
  sites: [ // exactly 6
    { id:'S1', code:'RUH-01', name:'برج الواجهة المالية', city:'الرياض', type:'برج تجاري', phase:'الهيكل الإنشائي', workers:842, manager:'م. خالد العتيبي', contractor:'بلتكس للمقاولات', safetyScore:87, zones:[{id,name,x,y,w,h}]  /* 6 zones, normalized 0..1 site-plan rectangles */ },
    { id:'S2', code:'JED-02', name:'مجمع البحر الأحمر السكني', city:'جدة', ... },
    { id:'S3', code:'NEOM-03', name:'محطة الطاقة الشمسية — نيوم', city:'نيوم', ... },
    { id:'S4', code:'DMM-04', name:'مستودعات ميناء الدمام اللوجستية', city:'الدمام', ... },
    { id:'S5', code:'QID-05', name:'مدينة القدية الترفيهية — المرحلة 2', city:'القدية', ... },
    { id:'S6', code:'MED-06', name:'توسعة مستشفى المدينة التخصصي', city:'المدينة المنورة', ... },
  ],
  risks: [ // 48 items
    { id:'R1', code:'R-1001', siteId:'S1', categoryId:'height', hazard:'سقوط من حافة البلاطة غير المحمية', activity:'صب الخرسانة — الطابق 23',
      description:'…', likelihood:4, severity:5, residualLikelihood:2, residualSeverity:4,
      controls:[{type:'ضوابط هندسية', text:'تركيب حواجز حافة معتمدة'}, …],
      owner:'م. سارة القحطاني', dueDate:'2026-11-20', status:'قيد المعالجة', source:'تفتيش', legalRef:'لائحة السلامة والصحة المهنية — المادة 12',
      createdAt:'2026-10-02', updatedAt:'2026-11-07', history:[{at, by, text}] }
  ],
  incidents: [ // 30 items across the last 120 days, mixed types; ~55% near-misses
    { id:'I1', code:'INC-2026-031', siteId, type, severity:1..5, date:'2026-11-06', time:'14:20', title, description, location,
      bodyPart:'اليد'|null, rootCause, immediateCause, status, daysLost:0, reporter, categoryId,
      investigationStep:0..4 /* ['جمع الأدلة','المقابلات','تحليل الأسباب (5 لماذا)','الإجراءات التصحيحية','الإغلاق'] */,
      actions:[{id, text, owner, due, done:boolean}] }
  ],
  permits: [ // 22 items
    { id:'P1', code:'PTW-5521', siteId, type, status, requester, approver, startsAt:'2026-11-09T06:00:00+03:00', expiresAt:'2026-11-09T18:00:00+03:00',
      location:'المنطقة ج — المستوى 12', hazards:[…], controls:[…], workers:6, gasTest:{o2:20.9,lel:0,h2s:0,co:2}|null }
  ],
  inspections: [ // 26 items, past & upcoming (±30 days)
    { id, code:'INS-0912', siteId, type, inspector, date, status, score:0..100|null, checklistTotal, checklistDone, findings:[{id,text,severity:'منخفض'|'متوسط'|'عالٍ', status:'مفتوح'|'مغلق'}] }
  ],
  courses: [ // 10
    { id:'C1', name:'التوعية بالسلامة في الموقع', validityMonths:12, mandatory:true, hours:4 }, … ('العمل على ارتفاعات','الأماكن المغلقة','تصاريح العمل','الإسعافات الأولية','مكافحة الحريق','الإجهاد الحراري','قيادة المعدات الثقيلة','الإشارة والربط (Rigging)','قيادة دفاعية')
  ],
  workers: [ // 72 synthetic workers spread over sites & contractors
    { id:'W1', name:'أحمد بن سعد', role:'عامل بناء', siteId, company:'بلتكس للمقاولات'|'شركة الإنشاءات الحديثة'|'الخليج للكهروميكانيك'|'مقاولو الصلب', certs:[{courseId, completedAt, expiresAt}] }
  ],
  isoClauses: [ // ISO 45001:2018 clauses 4..10 with Arabic titles, subclauses with score 0..100 and gaps[]
    { id:'4', title:'سياق المنظمة', subclauses:[{id:'4.1', title:'فهم المنظمة وسياقها', score:92, gaps:[]}, …] }, … up to '10' (التحسين)
  ],
  legalRegister: [ { id, title:'نظام العمل السعودي — الباب الثامن (الوقاية من مخاطر العمل)', authority:'وزارة الموارد البشرية والتنمية الاجتماعية', status:'ممتثل'|'جزئي'|'فجوة', lastReview, nextReview } … 8 items incl. المجلس الوطني للسلامة والصحة المهنية (NCOSH), التأمينات الاجتماعية (GOSI) — إصابات العمل, الدفاع المدني, كود البناء السعودي SBC, بيئة ],
  integrations: [ // 16 connectors
    { id:'biltix-pm', name:'منصة بلتكس لإدارة المشاريع', vendor:'Biltix', category:'core', status:'connected', lastSync:ISO, latencyMs:120, eventsPerHour:340, description:'…', icon:'biltix',
      configFields:[{key:'apiUrl', label:'عنوان API', type:'url', placeholder:'https://api.biltix.sa/v1'}, {key:'apiKey', label:'مفتاح API', type:'password'}] },
    'biltix-dms' (إدارة المستندات), 'iot-gateway' (بوابة الحساسات MQTT), 'cctv-ai' (كاميرات ذكية — كشف معدات الوقاية), 'wearables' (أجهزة قابلة للارتداء), 'access-control' (بوابات الدخول والحضور),
    'weather-ncm' (المركز الوطني للأرصاد), 'gosi' (التأمينات الاجتماعية — إصابات العمل), 'hrms' (نظام الموارد البشرية), 'erp-sap' (SAP / Oracle ERP),
    'slack' , 'teams', 'whatsapp' (تنبيهات واتساب للأعمال), 'email-smtp', 'sms-twilio', 'webhooks' (Webhooks / n8n / Zapier), 'google-sheets', 'supabase', 'powerbi'
    // status mix: 11 connected, 2 degraded, 1 disconnected, rest 'configurable'
  ],
  sensors: [ // 14 live sensors across sites
    { id:'SN1', siteId:'S1', kind:'غاز H2S', unit:'ppm', value:1.2, min:0, max:20, threshold:10, zoneId }, kinds: 'غاز H2S','أول أكسيد الكربون CO','الضوضاء','الإجهاد الحراري WBGT','الغبار PM2.5','الاهتزاز','سرعة الرياح','الأكسجين O₂'
  ],
  feedTemplates: [ /* optional helper phrases for live.js */ ],
};
export default seed;
```

Risk score = `likelihood × severity` (1..25). Tier: 1–4 منخفض (`good`), 5–9 متوسط
(`warning`), 10–15 عالٍ (`serious`), 16–25 حرج (`critical`). This tiering is the single
definition used everywhere (`selectors.riskTier(score)`).

---

## 4. Core APIs (js/core/*, js/ui/components.js) — exact signatures

### bus.js
```js
export const bus = {
  on(event, handler) => unsubscribeFn,
  once(event, handler) => unsubscribeFn,
  off(event, handler),
  emit(event, payload),
};
```
Events used across modules (string names are the contract):
- `theme:change` {theme}
- `settings:change` {settings}
- `store:change` {path}            (any state mutation)
- `filters:change` {filters}
- `feed:event` FeedEvent           (live engine → UI)
- `alert` {severity, title, detail, siteId}   (critical events → toast/banner)
- `route:change` {id, params}
- `sensors:tick` {sensors}          (every live tick)
- `integrations:tick` {integrations}

### fmt.js
```js
export const fmt = {
  setNumerals('latn'|'arab'),
  num(n, {maximumFractionDigits=0}={}),    // Intl, locale 'ar-SA-u-nu-latn' or 'ar-SA' (arab)
  compact(n),                               // 1.2K / 4.5M style via Intl notation:'compact'
  pct(n, digits=0),                         // "87%" (n already in 0..100)
  signed(n, digits=0),                      // "+3" / "−2" with proper minus sign
  date(iso, {style='medium'}={}),           // Gregorian, Arabic month names, e.g. "9 نوفمبر 2026"
  dateTime(iso),
  time(iso),
  hijri(dateObj=new Date()),                // "18 جمادى الأولى 1448هـ" via 'ar-SA-u-ca-islamic-umalqura'
  relative(iso),                            // "قبل 3 دقائق" via Intl.RelativeTimeFormat
  duration(ms),                             // "5س 12د" countdown style
  dayName(iso),
};
```

### store.js
```js
export const store = {
  state,                             // live object (read-only by convention)
  get(path),                         // 'settings.theme'
  set(path, value),                  // emits store:change
  update(fn),                        // fn(state) mutates; emits store:change
  subscribe(fn) => unsub,            // fn(state, {path})
  reset(),                           // back to seed + default settings, clears localStorage
  // CRUD (each emits store:change and persists)
  addRisk(obj) => risk, updateRisk(id, patch), deleteRisk(id),
  addIncident(obj) => incident, updateIncident(id, patch),
  addPermit(obj) => permit, updatePermit(id, patch),
  updateInspection(id, patch),
  updateIntegration(id, patch),
  pushFeed(event),                   // prepend, cap 200
  // filters
  filters: {siteId:'all', range:30, search:''},
  setFilter(key, value),             // emits filters:change
  // settings
  setSettings(patch),                // merges, persists, emits settings:change (and theme:change if theme changed)
};
```
State shape: `{ ...seed, feed: FeedEvent[], settings, filters, meta:{version:1, savedAt} }`.
Persistence key: `biltix-hse:v1` (localStorage, debounced 300ms). On load, if a saved
state exists with the same version, merge it over seed (saved wins). `settings` defaults:
```js
{ theme:'dark', numerals:'latn', brand:{ primary:'#2F6FED', accent:'#19C6E6', companyName:'بلتكس', logoUrl:'' },
  sound:false, feedPaused:false, dataSource:{ type:'simulation', url:'', apiKey:'', table:'' }, alertWebhook:'' }
```
`app.js` applies `settings.brand.primary/accent` to `--brand/--accent` at runtime.

### selectors.js (pure, all take `state` and optional `filters`)
```js
export const sel = {
  riskScore(r), riskTier(score) => 'منخفض'|'متوسط'|'عالٍ'|'حرج', tierTone(tier) => 'good'|'warning'|'serious'|'critical',
  filteredRisks(state, filters), filteredIncidents(state, filters), filteredPermits(state, filters), filteredInspections(state, filters),
  kpis(state, filters) => { safetyIndex, ltifr, trir, daysSinceLTI, openIncidents, nearMisses30d, activePermits, criticalRisks, capaClosure, trainingCompliance, inspectionsDue, deltas:{ltifr, trir, ... signed numbers vs previous period} },
  riskMatrix(state, filters) => number[5][5]  // [severityIndex 0..4 from 1..5][likelihoodIndex]
  incidentTrend(state, weeks=12) => [{label:'أسبوع 36', incidents, nearMisses}]
  incidentsByType(state, filters) => [{label, value}]
  rootCausePareto(state, filters) => [{label, value, cumulativePct}]
  permitsByStatus(state, filters) => [{id, label, value}]  (order = PERMIT_STATUS)
  siteScores(state) => [{site, score, trend:number[12], openRisks, openIncidents}]
  trainingMatrix(state, siteId) => { workers:[...], courses:[...], cells:[[status]] }  // status: 'valid'|'expiring'|'expired'|'missing'
  trainingCompletionByCourse(state) => [{label, pct}]
  expiringCerts(state, days=60) => [{worker, course, expiresAt}]
  isoScores(state) => [{id, title, score}]   // clause-level mean of subclauses
  radarBlips(state, filters) => [{id, code, label, angle (deg), r (0..1), tier, tone, siteId, categoryId}]  // angle = category sector center + jitter by site index; r = 0.12 + 0.82*(1 - score/25)
  sensorAxes(state, siteId) => [{id,label,unit,max,threshold,value,pct}]
  urgentActions(state) => [{kind:'risk'|'incident'|'permit'|'inspection'|'cert', text, due, tone, href}]
};
```
Safety Index formula (0..100, documented in the UI tooltip): `100 − 2.5·criticalOpen − 1.0·highOpen − 4·LTI(90d) − 1.5·medicalTreatment(90d) − 0.5·nearMiss(30d) + 0.1·trainingCompliance% ...` clamp 0..100; the exact constants live in selectors.js with a comment.

### router.js
```js
export const router = {
  register(view),               // view: {id, title, icon, code:'SEC-01', render(container, ctx) => cleanupFn|void}
  start(defaultId='overview'),
  navigate(id, params={}),      // sets location.hash = `#/${id}` (+ `?k=v`)
  current() => {id, params},
};
```
`ctx` passed to render: `{ store, bus, sel, fmt, charts, radar, components, art, live, sources, router }`.
On navigation the router calls the previous cleanup, empties the container, mounts the
new view, emits `route:change`, moves focus to the view `<h1>`.

### components.js
```js
export function h(tag, attrs={}, ...children)          // attrs: class, dataset, aria-*, on* handlers, style object; children: Node|string|Array|null; strings become text nodes
export function svgIcon(name, size=18)                  // delegates to art.icon(name) returning an <svg> element
export function card({code, title, subtitle, actions=[], body, footer, framed=true, hero=false, tableView=null}) => HTMLElement
   // tableView: () => HTMLTableElement; when given, card header gets a "رسم / جدول" segmented toggle that swaps body and table
export function statTile({label, value, unit='', delta=null, deltaGoodWhen='down', spark=null, icon=null, tone=null, onClick=null, hint=''}) => HTMLElement
export function badge(text, tone='neutral'|'good'|'warning'|'serious'|'critical'|'brand'|'accent', {icon=null}={}) => HTMLElement   // tone badges include an icon glyph automatically
export function tierBadge(tier)                          // uses sel.tierTone
export function button(label, {variant='primary'|'ghost'|'outline'|'danger', icon=null, size='md'|'sm', onClick, attrs}={})
export function segmented({options:[{value,label}], value, onChange, ariaLabel}) => {el, set(value)}
export function tabs({items:[{id,label,render}], active}) => {el, show(id)}
export function dataTable({columns:[{key,label,width,align,sortable=true,render(row)=>Node|string}], rows, rowKey='id', onRowClick, pageSize=12, emptyText='لا توجد بيانات', dense=false}) => {el, update(rows), setSort(key, dir)}
export function modal({title, body, actions=[{label, variant, onClick}], size='md'|'lg', onClose}) => {open(), close(), el}
export function drawer({title, subtitle, body, actions}) => {open(), close(), el}     // slides from inline-end
export function toast(message, {tone='neutral', timeout=4500, action=null}={})
export function kanban({columns:[{id,label,tone}], items:[{id,columnId,render:()=>Node}], onMove(id, toColumnId)}) => {el, update(items)}
export function formField({label, name, type='text'|'select'|'textarea'|'number'|'date'|'datetime-local'|'url'|'password', value, options=[], required=false, hint='', placeholder=''}) => HTMLElement (label + control, control has name attr)
export function readForm(formEl) => plain object (FormData → object)
export function emptyState({icon, title, text, action})
export function progress({value, max=100, tone}) => meter-like bar element (status tone fill)
export function countdown(targetIso, {onExpire}) => {el, stop()}   // ticks each second, text via fmt.duration
export function liveDot(tone='accent')
export function kv(pairs:[[label, valueNode|string]])  // definition list
```

---

## 5. Charts API (js/ui/charts.js) — exact signatures

All functions return `{ el, update(data), table() }` where `el` is an `<svg>`-containing
`<div class="chart">` element, `update` re-renders in place with new data, and `table()`
returns a `<table>` twin (headers + rows, Arabic labels) for the card's table toggle.
Charts are responsive: they render to the container width using `ResizeObserver`
(viewBox + width 100%), heights are fixed per call. All text uses ink tokens, never series
color. Legends are present for ≥2 series (none for 1). Gridlines hairline solid `--line`.
Bars ≤ 24px thick with 4px rounded data-ends. 2px lines, ≥8px markers with 2px surface
ring. Hover: crosshair + single tooltip listing every series (line), per-mark tooltip
(bars/cells). Keyboard: marks are focusable (`tabindex=0`) and show the same tooltip.

```js
export const charts = {
  lineChart({series:[{id,label,color /*css var string e.g. 'var(--s1)'*/, values:number[]}], labels:string[], height=220, yFormat=fmt.num, area=false, ariaLabel}),
  barChart({items:[{id,label,value,color?}], horizontal=true, height, valueFormat=fmt.num, color='var(--s1)', showValues=true, maxBars=12, ariaLabel}),   // ranked bars default; one hue
  groupedBars({groups:string[], series:[{id,label,color,values}], height, valueFormat, ariaLabel}),
  heatmap({rows:string[], cols:string[], cells:number[][], colorFor:(value,ri,ci)=>cssColor, labelFor:(value,ri,ci)=>string, onCellClick, cellSize='auto', ariaLabel, rowTitle, colTitle}),  // used for the 5×5 risk matrix (status tones by tier) and the training matrix (sequential)
  segmentedBar({parts:[{id,label,value,color}], tall=true, valueFormat, ariaLabel}),   // tall: 28px, labels inside where fit; legend of names only
  sparkline({values:number[], width=96, height=28, color='var(--ink-3)', accentLast=true}),  // returns {el}
  meter({value, max=100, label, thresholds:[{upTo, tone}], height=10}),     // same-ramp track; returns {el, update}
  gauge({value, max=100, size=180, label, sublabel}),                          // 270° arc hero gauge for the Safety Index; number in center uses --fs-hero
  ring({value, max=100, size=72, color, label}),                               // small ring meter (ISO clause scores)
  spider({axes:[{id,label}], series:[{id,label,color,values:number[]}], max=100, size=260, ariaLabel}),  // static SVG radar/spider
  tooltip: { show(x, y, {title, rows:[{label, value, color}]}), hide() },      // singleton; DOM built with textContent
  paletteFor(index) => 'var(--s1)'..'var(--s8)',                               // fixed order, never cycles past 8 (throws)
};
```

---

## 6. Radar engine (js/ui/radar.js) — exact signatures

One shared loop. Each radar is a class taking a `<canvas>` and options, reading theme
colors from CSS custom properties (`getComputedStyle(document.documentElement)`) on
`start()` and on `theme:change`. Canvas is sized to its parent via `ResizeObserver`,
`dpr = Math.min(devicePixelRatio, 2)`. All radars expose the same lifecycle.

```js
export const radarLoop = { add(radar), remove(radar), pause(), resume(), fps() };  // single RAF; pauses on document.hidden; respects prefers-reduced-motion (sets radar.reduced = true)

class RadarBase { constructor(canvas, opts); start(); stop(); destroy(); setData(data); resize(); setHoverHandler(fn); }

export class SweepRadar extends RadarBase
  // opts: { rings=4, sectors=12, sectorLabels:string[], sweepDegPerSec=22, getBlips:()=>Blip[], onHover(blip|null, {x,y}), showLabels=true }
  // Blip: {id, code, label, angle(deg, 0 = up/north, clockwise), r(0..1), tone:'good'|'warning'|'serious'|'critical'}
  // Draws: concentric rings (hairline), sector spokes, faint sector labels on the rim, rotating sweep wedge (accent gradient 60° trailing fade),
  //        blips as filled dots (color by tone) with a surface ring; a blip "pings" (expanding ring) when the sweep passes over it; afterglow trail.
  //        Center emblem: small isometric cube (art). Hit-test on pointermove → onHover(blip) for a DOM tooltip.
  // reduced motion: no sweep; blips breathe slowly (opacity 0.7↔1 over 3s).

export class SensorRadar extends RadarBase
  // opts: { axes:[{id,label,unit,max,threshold}], getValues:()=>number[], rotateDegPerSec=4 }
  // Polar/spider of live sensor values: filled polygon (accent at 18% alpha, 2px stroke), threshold polygon (dashed hairline is NOT allowed → use a dotted ring of small dots or a solid warning-tone hairline), axis labels + current values at the tips; the whole dial rotates slowly; values ease toward targets.

export class SitePlanRadar extends RadarBase
  // opts: { zones:[{id,name,x,y,w,h}] (normalized), getPings:()=>Ping[], getHazards:()=>Hazard[] }
  // Ping: {x,y,kind:'worker'|'vehicle'|'crane', vx, vy}  Hazard: {x,y,tone,label}
  // Draws an isometric-tilted site plan (2D rectangles sheared 30°), zone names, moving pings (workers as small dots, vehicles as rounded rects moving along zone edges), hazard pulses by tone, and a scanning horizontal line (accent) that sweeps top→bottom every 6s.

export class ComplianceRadar extends RadarBase
  // opts: { axes:[{id,label}], getValues:()=>number[], target=85 }
  // Spider of ISO 45001 clause scores vs. target ring; slow rotation (2°/s); score labels at tips; gaps (below target) highlighted with warning tone wedges.
```

Colors inside canvases: read `--bg-1, --line, --line-2, --ink-2, --ink-3, --accent,
--good, --warning, --serious, --critical, --gold` from CSS vars. Never hard-code hex
in the radar module.

---

## 7. Live engine & sources (js/data/live.js, js/data/sources.js)

```js
// live.js
export const live = {
  start({store, bus}),           // idempotent; uses a seeded RNG (mulberry32, seed 20261109) for determinism
  stop(), pause(), resume(), isRunning(),
  tick(),                        // one simulation step (also used by tests)
  getBlips(),                    // store-derived blips + transient "detections" (sweep radar)
  getPings(siteId),              // moving workers/vehicles for SitePlanRadar
  getSensorValues(siteId),       // eased live values
  getHazards(siteId),
};
```
Behaviour:
- Every 2.5–7 s emit a `FeedEvent` and `store.pushFeed(event)`:
  `{ id, ts(ISO), type:'sensor'|'permit'|'incident'|'nearmiss'|'inspection'|'training'|'integration'|'ppe'|'weather'|'alert', tone, siteId, title, detail, sourceId (integration id) }`.
  Realistic Arabic phrasing (e.g. "كاميرا ذكية: رصد عامل بدون خوذة — المنطقة ب", "تصريح PTW-5521 يقترب من الانتهاء خلال 45 دقيقة", "قراءة H2S تجاوزت 8 ppm — المستودع 3", "اعتماد جولة سلامة — برج الواجهة المالية").
- Every 1 s: sensors drift toward slowly moving targets (sinusoidal + noise); occasionally (≈ every 90 s) a sensor crosses its threshold for 20–40 s → emits `alert` and a feed event with tone `critical`.
- Every 1 s: check permits; when `expiresAt` within 60 min and status 'نشط' → feed warning once; when past → set status 'مغلق' (via store.updatePermit) once.
- Integrations: every 10–20 s update `lastSync`, `latencyMs` jitter, `eventsPerHour`; a 'degraded' one recovers after ~2 min; emit `integrations:tick`.
- Occasionally (≈ every 4 min) add a near-miss incident via `store.addIncident` (tone warning).
- Respects `store.state.settings.feedPaused` (no feed events while paused; sensors keep moving).
- Pauses when `document.hidden`.

```js
// sources.js
export const sources = {
  async testConnection({type, url, apiKey, table}) => {ok, latencyMs, message},   // JSON API: GET url; Sheets: GET csv url; Supabase: GET `${url}/rest/v1/${table}?select=*&limit=1` with apikey header; webhook: POST ping
  async importRisks({type, url, apiKey, table}) => {count, risks}  // maps rows → Risk schema; CSV header mapping documented in the UI template
  exportCSV(rows, columns, filename), exportJSON(obj, filename), downloadTemplateCSV(),
  async postWebhook(url, payload) => {ok, status},
  buildReport(state) => {title, period, kpis, sections[]}  // plain object for reports view & print
};
```
`fetch` errors must surface as friendly Arabic messages; no uncaught promise rejections.

---

## 8. Views — what each must contain

Common: each view module exports `default { id, code, title, icon, render }`.
`render(container, ctx)` builds DOM synchronously, subscribes to `store`/`bus` as needed,
and returns a cleanup function that unsubscribes and stops radars it started. Views
respect the global filters (site + range) from `store.filters`; the filter row itself
lives in the app shell (app.js) above the main area: site select (الكل + 6 sites), range
segmented (7/30/90 يوم), search input (used by risks/incidents/permits tables),
"إيقاف البث/استئناف" toggle for the feed.

Each view starts with a `.view-head` (code tag, `<h1>`, one-line description, optional actions).

1. `overview.js` — `SEC-01 نظرة عامة`
   - Row 1: hero card (gauge Safety Index + 3 short facts: أيام بدون إصابة مضيعة للوقت, LTIFR, TRIR) spanning 4 cols; SweepRadar card spanning 8 cols ("رادار المخاطر الحي", legend of tones, hover tooltip, "فتح الرادار الكامل" link to #/radar).
   - Row 2: KPI tiles ×8 (statTile with sparkline + delta): الحوادث المفتوحة, الحوادث الوشيكة (30 يوم), التصاريح النشطة, المخاطر الحرجة, إغلاق الإجراءات التصحيحية %, الامتثال التدريبي %, تفتيشات مستحقة, مؤشر معدل التكرار.
   - Row 3: risk matrix 5×5 heatmap (status tones by tier, counts inside, click → navigate to risks with filter), incidents trend line (2 series + legend + crosshair), permits segmented bar.
   - Row 4: sites table (name, city, phase, workers, safety score ring/progress, sparkline, open risks, open incidents) + urgent actions list (sel.urgentActions) with tone badges.
2. `radar.js` — `SEC-02 الرادار الحي`: 2×2 grid of radar cards (SweepRadar large, SensorRadar, SitePlanRadar, ComplianceRadar), each with a telemetry side strip (live values, fmt.relative last update) and a tone legend; a top strip with 6 live chips (الحساسات النشطة, التنبيهات آخر ساعة, الأشخاص في الموقع, المعدات المتحركة, سرعة الرياح, WBGT). Site selector filter applies (SensorRadar & SitePlanRadar follow the selected site; when 'all' use S1).
3. `risks.js` — `SEC-03 سجل المخاطر`: toolbar (category filter chips, status filter, tier filter, add button), dataTable (code, hazard, site, category w/ icon, L, S, score with tierBadge, residual, owner, due (overdue in critical tone + icon), status), row click → drawer with full details, hierarchy of controls as a stepped list, residual vs inherent mini-bar pair, history timeline, actions (تغيير الحالة, تعديل, حذف). Add/edit modal form (all fields) → store.addRisk/updateRisk. Side column: mini matrix heatmap + top categories ranked bars.
4. `incidents.js` — `SEC-04 الحوادث`: KPI strip; trend line; incident type segmented bar; root-cause Pareto (ranked bars + cumulative line is NOT allowed as dual axis → show ranked bars with cumulative % as a direct label); list/cards with severity badge, status, investigation stepper (5 steps); detail drawer with actions checklist (toggle done → store.updateIncident); report-incident modal.
5. `permits.js` — `SEC-05 تصاريح العمل`: kanban by PERMIT_STATUS with permit cards (type icon, code, site, location, requester, workers, live countdown to expiry, gas test chips if present); drag or buttons to move (onMove → store.updatePermit); filters by type; new permit modal; a strip with counts and "تنتهي خلال ساعة" badge list.
6. `inspections.js` — `SEC-06 التفتيش والتدقيق`: schedule table (upcoming ±30 days) with status badges; completion by site (ranked bars); findings open vs closed (segmented bar); checklist progress meters; detail drawer with findings list and toggle close.
7. `training.js` — `SEC-07 التدريب والكفاءات`: training matrix heatmap (workers × courses, cell status: valid/expiring/expired/missing → sequential blue steps for valid/expiring plus status tones for expired/missing — legend + icons in tooltip), completion by course (ranked bars), expiring certificates table (60 days) with tone badges, course catalog cards.
8. `compliance.js` — `SEC-08 الامتثال ISO 45001`: overall ring + ComplianceRadar (static spider via charts.spider is acceptable here since the animated one lives in the radar view), clause cards with ring meters and gap lists, legal register table (status badges), document control summary.
9. `integrations.js` — `SEC-09 التكاملات`: summary strip (connected/degraded/disconnected counts, events per hour total, mean latency), connector cards grid (icon, name, vendor, category badge, status badge with live dot, last sync relative, latency, sparkline of eventsPerHour history, "إعداد" button → modal with configFields + "اختبار الاتصال" calling sources.testConnection where the type is one of json/sheets/supabase/webhook, "مزامنة الآن" for connected), and a **data source** panel: choose simulation / JSON API / Google Sheets CSV / Supabase; fields; test; import risks; download CSV template; alert webhook URL field with "إرسال تنبيه تجريبي".
10. `reports.js` — `SEC-10 التقارير`: period selector, generated monthly HSE report preview (sections: الملخص التنفيذي, مؤشرات الأداء, الحوادث, المخاطر, التصاريح, التدريب, الامتثال, التوصيات) with charts, buttons: طباعة / PDF (window.print with print.css), تصدير CSV (risks, incidents), تصدير JSON (full state), مشاركة (navigator.share fallback copy link), **تقرير صوتي** (speechSynthesis in Arabic if an `ar` voice exists; button toggles play/stop; never autoplay).
11. `settings.js` — `SEC-11 الإعدادات`: theme (dark/light), numerals (latn/arab), brand (primary & accent color inputs with live preview, company name, logo URL), sound toggle, reduced-motion override, feed pause, data management (export/import JSON, reset to seed with confirm modal), about (version, build date, link to biltix.sa).

---

## 9. App shell (index.html + app.js + base.css)

Structure (RTL: inline-start is the right side):
```
<a class="skip-link" href="#main">تخطي إلى المحتوى</a>
<header class="appbar">  logo mark + "بلتكس HSE" + tagline | live clock (HH:MM:SS) + Gregorian & Hijri date | search/command button (Ctrl+K) | integrations pill (n/16 متصل, live dot) | notifications bell (count) | theme toggle | user chip
<nav class="rail" aria-label="التنقل الرئيسي"> one button per view (icon + label + code) ; collapse toggle
<div class="filters"> site select | range segmented | search input | feed pause toggle
<main id="main" class="main"> view container
<aside class="feed" aria-label="البث الحي"> header with live dot + "البث الحي" + counts; list of feed items (icon by type, tone bar, title, detail, site, relative time), newest first, slide-in animation; footer "عرض الكل"
<div id="toasts"> <div id="modals"> <div id="tooltip">
<div class="cmdk" hidden> command palette: fuzzy search over views + actions (إضافة مخاطرة, تبديل السمة, إيقاف البث ...) + risks/permits by code
```
Alert banner: on `alert` events with tone critical, show a dismissible banner under the
app bar for 12 s (also a toast). Notifications bell opens a drawer listing the last 30
alerts.

Responsive breakpoints: ≥1280 full three-column; 960–1279 rail collapsed (icons only),
feed as a toggleable drawer; <960 single column, bottom tab bar (first 5 views + "المزيد"),
feed in drawer, filters wrap.

Numerals: `fmt.setNumerals(settings.numerals)` at boot and on change; views re-render on
`settings:change`.

---

## 10. Dataviz rules in force (summary)

One axis per chart (no dual axis). Categorical colors in fixed order `--s1..--s8`, never
cycled; status tones only for status meaning; sequential one-hue for magnitude; diverging
only for polarity. Thin marks, hairline solid grid, legend for ≥2 series, selective direct
labels, table view for every chart, tooltips on hover + focus, text never in series color.
Stat tiles instead of one-bar charts. Donuts/pies are not used (segmented bars instead).

---

## 11. Definition of done (every builder self-checks)

- `node --check <file>` passes for each JS file you own (syntax).
- Serve `biltix-hse/` with `python3 -m http.server 8123` and load
  `http://localhost:8123/#/<your view>` in Playwright headless Chromium; **zero console
  errors**; your DOM renders; radars animate (canvas not blank).
- RTL correct (no `left/right` in CSS you wrote); keyboard focus visible; Arabic text
  only in UI; codes in mono.
- No hard-coded hex colors in JS (read CSS vars) except inside `art.js` gradients that
  reference tokens via `currentColor`/vars.
- Reduced motion path exists for every animation you add.

---

## 12. Debug hooks & QA harness

`app.js` exposes `window.biltix = { store, bus, router, live, sel, fmt }` (read-only debug
hooks used by the QA harness and by browser devtools). Nothing else may depend on it.

QA harness (outside the repo): `/tmp/claude-0/-home-user-Wow-bus/dd6d5ceb-f590-5279-b090-3be1abebb8fa/scratchpad/qa/qa.mjs`
```
node qa.mjs --port 8131 --routes overview,radar,risks --viewport 1440x900 --theme dark --out /path/to/dir
```
It serves `biltix-hse/` with Python's http.server on the given port (if not already
served), opens each route in headless Chromium, waits for render, and reports console
errors, page errors, failed requests, blank canvases, horizontal overflow, and writes
screenshots `<route>-<theme>-<viewport>.png` to `--out`. Exit code 1 when any error.
Use a port unique to you (stated in your task) so parallel agents do not collide.

---
---

# PART B — AI-Powered Risk Management Platform scope (from the client proposal)

The client proposal ("AI-Powered Risk Management Platform — Architecture, Capabilities &
Detailed Proposal", v2) widens the product: the HSE module above becomes the **Site /
Safety pillar** of a five-domain **Risk Cockpit**. Everything in Part A stays valid; Part B
adds entities, APIs, views and shell changes. File ownership for Part B:

```
js/data/platform-seed.js        (owner: PLATFORM-DATA)   all new entities (section B3)
js/core/platform-selectors.js   (owner: PLATFORM-DATA)   pure derived data for the platform (section B4)
js/core/store.js                (owner: PLATFORM-CORE)   add state.platform merge, re-anchoring, CRUD (section B5)
js/data/platform-live.js        (owner: PLATFORM-CORE)   AI pipeline / validation / alert simulation (section B6)
js/app.js, index.html           (owner: PLATFORM-CORE)   grouped navigation, product naming, cockpit as home (section B7)
js/views/index.js               (owner: PLATFORM-CORE)   new registry order (section B7)
css/platform.css                (owner: PLATFORM-CORE)   styles for nav groups + platform-only components (section B8)
js/views/cockpit.js, airisks.js, tasks.js            (owner: PLATFORM-VIEWS-1)
js/views/contracts.js, bom.js, schedule.js           (owner: PLATFORM-VIEWS-2)
js/views/cost.js, dataquality.js, engine.js, alerts.js, roadmap.js   (owner: PLATFORM-VIEWS-3)
```
Part A files keep their owners; Part B agents never edit Part A files except where
listed above (store.js, app.js, index.html, views/index.js are re-assigned to PLATFORM-CORE).

## B1. Product framing

- Product name: **بلتكس — منصة إدارة المخاطر بالذكاء الاصطناعي** (Biltix AI Risk Management Platform).
  Short brand text in the app bar: "بلتكس Risk AI"; tagline: "قمرة قيادة المخاطر — خمسة مجالات، تصنيف فوري، معالجة مُتتبعة".
  The HSE pillar keeps its own titles (نظرة عامة على السلامة, الرادار الحي, …).
- Five-layer architecture (unchanged principle: the platform **reads** client systems and
  **writes back only** risk flags, scores, alerts and mitigation tasks):
  1. Integration Layer (REST/SDK connectors + webhooks): Biltix Application modules
     (العقود, BoM/BoQ, الجدول الزمني, تقارير الموقع, التكلفة والميزانية, الصور), Enterprise
     connectors (Primavera P6 EPPM Web Services, Autodesk Platform Services for BIM/CAD,
     Oracle ERP/CRM — primary; SAP/Zoho/HubSpot configurable), External feeds (commodity
     price indices, currency rates, weather NCM, GIS layers).
  2. Data Validation & Cleansing Layer (schema checks, de-duplication, completeness,
     consistency) — nothing reaches the AI engine until it passes.
  3. Risk Data Lake (structured + unstructured, normalized, versioned, auditable).
  4. AI Risk Engine — five pipelines on a shared scoring & explainability layer:
     Contract NLP, BoM Forecasting, Schedule Model (delay probability + Monte Carlo),
     Site Image/Report AI (predictive analytics on photos & daily reports), Cost Forecast
     (EVM + time-series). Output: 0–100 score + plain-language driver explanation.
  5. Backend Risk Classification Logic: type **Financial / Safety / Delay / Conflict**
     + rating **Red / Yellow / Green**; then Alerting & Workflow (threshold → alert queue;
     critical → immediate escalation via Email/Slack/Teams; write-back to the PM app;
     mitigation task created & assigned); then the Risk Cockpit.
  Cross-cutting: security & access control, audit/versioning, model explainability,
  human-in-the-loop overrides (every override is logged and fed back for recalibration).

## B2. Classification rules (single definition, in platform-selectors.js)

- `score` is 0–100. **Rating**: `red` if score ≥ 70 (حرج — تدخل فوري), `yellow` if 40–69
  (مرتفع — مراقبة), `green` if < 40 (ضمن حدود التحمل). Tone mapping: red→`critical`,
  yellow→`warning`, green→`good`. Arabic labels: أحمر / أصفر / أخضر.
- **Type**: `Financial` (مالي), `Safety` (سلامة), `Delay` (تأخير), `Conflict` (نزاع).
- **Category / domain** (= pipeline): `contract` (العقود), `bom` (المواد والتوريد), `schedule`
  (الجدول الزمني), `site` (الموقع والسلامة), `cost` (التكلفة).
- Alert threshold (settings.platform.alertThreshold, default 60): score > threshold →
  alert; score ≥ criticalThreshold (default 85) → **immediate escalation** queue; otherwise
  → standard alert queue. Below threshold → logged to the register only.
- **Category score** = round(0.5 × max(open scores) + 0.5 × mean(open scores)) over open
  AI risks of that category (0 when none). **Consolidated score** = Σ weight × category
  score with default weights contract .20, bom .20, schedule .25, site .20, cost .15
  (settings.platform.weights; must sum to 1). Both exposed with 12-week trends.

## B3. Platform data schema (js/data/platform-seed.js → `export default platformSeed`)

Projects = the six HSE sites (same ids S1..S6). Anchor date 2026-11-09. All Arabic text
except codes/standards/system names. Counts are minimums.

```js
platformSeed = {
  projects: [ { id:'S1', budgetSAR, contractValueSAR, startDate, plannedFinish, forecastFinish, percentComplete, plannedPercent,
                evm:{ BAC, PV, EV, AC, CPI, SPI, EAC, ETC, VAC }, currencyExposure:[{code:'USD',pct},{code:'EUR',pct},{code:'CNY',pct}], weights?:null } ×6 ],
  contracts: [ ≥10: { id, code:'CT-2026-014', projectId, title, counterparty, type:'عقد رئيسي'|'عقد من الباطن'|'أمر شراء'|'عطاء', valueSAR, currency, signedAt, endsAt,
                status:'ساري'|'قيد التفاوض'|'منتهٍ', riskScore, subcontractorSharePct,
                clauses:[ ≥4 each: { id, ref:'14.2', title, excerpt (1–2 Arabic sentences), flag:null|'ambiguous'|'payment'|'liquidated-damages'|'insurance-missing'|'indemnity-missing'|'warranty-missing'|'obligation'|'force-majeure',
                                      severity 0–100, explanation, redline (suggested wording), benchmark (e.g. 'المعيار السوقي: 30 يوماً؛ البند الحالي: 90 يوماً'), status:'مفتوح'|'قيد المراجعة القانونية'|'مُعالج' } ],
                obligations:[ { id, text, due, owner, status:'قادم'|'متأخر'|'منجز', clauseRef } ] } ],
  suppliers: [ ≥12: { id, name, category, country, shareOfSpendPct, financialHealth 0–100, deliveryPerformancePct, singleSource:boolean, leadTimeDays, creditRating:'A'|'B'|'C', riskScore } ],
  commodities: [ 6: حديد التسليح, الأسمنت, النحاس, الألمنيوم, الديزل, الخشب — { id, name, unit, series:[24 monthly prices], forecast:[6], volatilityPct, exposureSAR, trend:'صاعد'|'هابط'|'مستقر' } ],
  boqItems: [ ≥18: { id, code, projectId, description, unit, boqQty, bimQty, variancePct, unitPrice, supplierId, leadTimeDays, requiredBy, orderBy, specCompliance:'مطابق'|'غير مطابق'|'قيد المراجعة', riskScore } ],
  scheduleTasks: [ ≥30: { id, code:'A1020', projectId, name, wbs, start, finish, baselineFinish, floatDays, critical:boolean, percentComplete, delayProbability 0–1, expectedDelayDays, subcontractorId, trade, weatherSensitive:boolean } ],
  monteCarlo: { [projectId]: { p50, p80, p90 (ISO dates), histogram:[{ days, prob }] (≥12 bins), runs:5000 } },
  resources: [ ≥12: { id, projectId, trade, planned, available, utilizationPct, nextWeekGap } ],
  approvals: [ ≥8: { id, projectId, authority (أمانة الرياض, الدفاع المدني, الشركة السعودية للكهرباء, هيئة تطوير بوابة الدرعية, المركز الوطني للرقابة على الالتزام البيئي, …), type, submittedAt, statutoryDays, elapsedDays, status:'قيد المعالجة'|'معتمد'|'متأخر'|'مطلوب استكمال', riskScore } ],
  subcontractors: [ ≥8: { id, name, projectId, trade, plannedProgressPct, actualProgressPct, trend:[8], scorecard 0–100, openNotices } ],
  weather: { [projectId]: { next7:[ { date, tempMax, windKmh, dustRisk:'منخفض'|'متوسط'|'عالٍ', rainProb, delayRisk 0–1 } ] } },
  costLines: [ ≥24: { id, projectId, wbs, name, budget, actual, committed, forecast, variancePct } ],
  changeOrders: [ ≥10: { id, code:'CO-031', projectId, title, amountSAR, status:'مقترح'|'قيد الاعتماد'|'معتمد'|'مرفوض', submittedAt, impactDays, driver } ],
  currencies: [ USD (3.75 pegged), EUR, CNY, INR, TRY, GBP: { code, nameAr, rate, change30dPct, exposureSAR, forecast30d } ],
  labourIndex: [ ≥6: { region, trade, series:[12], change12mPct } ],
  aiRisks: [ ≥60 across all 5 categories, all 6 projects, ~35% red, 40% yellow, 25% green:
    { id, code:'AIR-1042', projectId, category, type, score, title, driverExplanation (plain Arabic, names the specific clause/line/task/reading and why it matters),
      evidence:{ kind:'clause'|'boq'|'task'|'inspection'|'cost'|'image'|'sensor'|'supplier'|'approval'|'changeOrder', ref, excerpt, sourceSystem:'Biltix — العقود'|'Primavera P6'|'Autodesk APS'|'Oracle ERP'|'Biltix — تقارير الموقع'|'بوابة الحساسات'|'المركز الوطني للأرصاد'|'مؤشرات السلع'|'أسعار الصرف', link? },
      recommendation:{ action, rationale, effort:'منخفض'|'متوسط'|'عالٍ', impact (expected reduction e.g. 'خفض الدرجة إلى ~35'), alternatives:[≤2] },
      pipeline:'contract-nlp'|'bom-forecast'|'schedule-model'|'site-ai'|'cost-forecast', modelVersion, confidence 0–1, detectedAt, updatedAt,
      status:'مكتشف'|'تنبيه'|'مهمة مُسندة'|'قيد المعالجة'|'مغلق'|'مُتجاوز', owner, dueDate, taskId, escalated:boolean,
      stakeholders:['PM'|'Legal'|'Procurement'|'Site'|'Finance'|'PMO'],
      responseParams:{ PM:{ scheduleImpactDays, costImpactSAR, criticalPath:boolean }, Legal:{ clauseRef, exposureSAR, disputeLikelihood }, Procurement:{ supplier, leadTimeDays, alternates }, Site:{ location, hazard, controls }, Finance:{ budgetImpactSAR, cashflowMonth }, PMO:{ trend, kpi, portfolioRank } } (include only the roles in stakeholders),
      overrides:[ { at, by, fromAction, toAction, reason } ], history:[ { at, by, text } ] } ],
  tasks: [ ≥18: { id, code:'MT-0231', riskId, projectId, title, owner, dueDate, status:'جديدة'|'قيد التنفيذ'|'متأخرة'|'مغلقة', source:'ai-accepted'|'ai-edited'|'manual', writeback:{ target:'Biltix PM', status:'synced'|'pending'|'failed', at }, createdAt, closedAt, outcome } ],
  alerts: [ ≥14: { id, riskId, projectId, severity:'critical'|'routine', queue:'immediate'|'standard', channels:['email','slack','teams','whatsapp'], sentAt, acknowledged:boolean, ackBy, ackAt, title } ],
  pipelines: [ 5: { id, name (EN), nameAr, description, techniques:[...], inputs:[...], status:'running'|'idle'|'training'|'degraded', lastRun, runsToday, avgLatencyMs, precision, recall, calibrationError, driftScore 0–1, version:'v2.3.1',
                   featureImportance:[ ≥5 { feature, weight } ], acceptanceRatePct, overridesLast30d, risksLast30d, kris:[ ≥5 { indicator, technique, inputs, mitigation } ] /* exactly the KRI matrix rows from the proposal, in Arabic */ } ],
  validation: { sources:[ ≥8: { id, name, recordsIn, passed, rejected, deduplicated, completenessPct, consistencyPct, lastBatch } ],
                rules:[ ≥10: { id, name, type:'schema'|'dedupe'|'completeness'|'consistency', hitsToday, enabled:true } ],
                quarantine:[ ≥12: { id, sourceId, recordRef, reason, at, status:'معلّق'|'مُصحح'|'مرفوض' } ] },
  connectors: [ ≥12 enterprise connectors (distinct from Part A integrations): primavera-p6 (Oracle Primavera P6 EPPM Web Services), autodesk-aps (Autodesk Platform Services — Model Derivative / BIM 360), oracle-erp (Oracle Fusion ERP), oracle-crm, sap-s4 (configurable), zoho-crm (configurable), hubspot (configurable), biltix-contracts, biltix-boq, biltix-schedule, biltix-site-reports, biltix-cost, biltix-images, feed-commodities, feed-fx-sama, feed-weather-ncm, feed-gis —
                { id, name, vendor, layer:'enterprise'|'biltix'|'external', api, mode:'read'|'read+writeback', entities:[...], status:'connected'|'degraded'|'disconnected'|'configurable', lastSync, recordsPerDay, latencyMs, writeback:[...], description, configFields:[...] } ],
  auditLog: [ ≥20: { id, at, actor, action:'override'|'accept'|'escalate'|'writeback'|'model-update'|'validation'|'login'|'config', target, detail } ],
  roadmap: { scopeItems:[7 from §5.1], assumptions:[6 from §5.2], outOfScope:[...],
             milestones:[ { id:'M0', name:'تخصيص الفريق وانطلاق المشروع', deliverables:[...], month:0, paymentPct:null, status:'منجز'|'جارٍ'|'قادم' }, 'M1' الاستكشاف ومعمارية التكامل, 'M2' بناء التكاملات وطبقة التحقق, 'M3' تحسينات محرك المخاطر, 'M4' قمرة القيادة ومعاملات الاستجابة واختبار القبول والإطلاق ],
             paymentNote:'النسب تُستكمل مع العميل؛ المجموع 100%' },
};
```
Payment percentages are **null in the seed** (the proposal leaves them blank); the roadmap view
lets the user fill them (persisted in settings.platform.paymentPct) and validates the 100% total.

## B4. platform-selectors.js (`export const psel = {...}`, pure)

```js
rating(score) => 'red'|'yellow'|'green'; ratingTone(rating) => 'critical'|'warning'|'good'; ratingLabel(rating) => 'أحمر'|'أصفر'|'أخضر';
typeLabel(type), categoryLabel(cat), categoryIcon(cat) (contract→'file-text', bom→'list', schedule→'calendar', site→'helmet', cost→'chart'), pipelineLabel(id);
platform(state) => state.platform;                         // accessor (never undefined after store load)
filteredAiRisks(state, filters) => open+closed filtered by site/range/search;
openAiRisks(state, filters);
categoryScores(state, filters) => [{ category, label, score, rating, open, red, yellow, green, trend:[12] }] (B2 formula);
consolidatedScore(state, filters) => { score, rating, delta, trend:[12], weights };
typeDistribution(state, filters) => [{ type, label, value }];
ratingDistribution(state, filters) => [{ rating, label, value }];
alertQueue(state) => { immediate:[...alerts], standard:[...] } (unacknowledged first, newest first);
tasksByStatus(state) => [{ status, items }]; overdueTasks(state);
evm(state, projectId) => { BAC, PV, EV, AC, CPI, SPI, EAC, ETC, VAC, SV, CV, percentComplete, plannedPercent, status:'ضمن الميزانية'|'تحذير'|'تجاوز' };
costForecast(state, projectId) => { months:[labels], budget:[], actual:[], forecast:[] };
contractFlags(state, filters) => [{ contract, clause }] ranked by severity; obligationsCalendar(state, days=60);
supplierConcentration(state) => ranked by shareOfSpendPct with singleSource flag; commodityExposure(state);
boqVariance(state, filters) => items with |variancePct| ≥ 5 ranked; longLeadItems(state, days=45);
criticalPathSlippage(state, filters) => critical tasks ranked by delayProbability × expectedDelayDays; monteCarlo(state, projectId);
approvalsAtRisk(state) => elapsedDays/statutoryDays ≥ 0.8 or status 'متأخر'; subcontractorPerformance(state);
weatherDelayRisk(state, projectId);
validationSummary(state) => { recordsIn, passed, rejected, deduplicated, passRatePct, completenessPct, consistencyPct, quarantineOpen, bySource };
pipelineHealth(state) => pipelines with derived health tone;
responseParams(risk) => [{ role, label (مدير المشروع/القانونية/المشتريات/الموقع/المالية/مكتب إدارة المشاريع), rows:[[label, value]] }];
riskFlowStage(risk) => index 0..7 for the flow stepper (مُلتقط → مُتحقق → في بحيرة البيانات → مُقيَّم → مُصنَّف → تنبيه → مهمة → مغلق);
riskTimeline(risk) => merged history + overrides + task + alerts sorted by time;
```

## B5. store.js additions (PLATFORM-CORE)

- Import `platformSeed` from `../data/platform-seed.js`; on load, `state.platform` = deep clone
  (saved state wins when present, same version key); re-anchor ALL platform date fields by the
  same dayDelta used for Part A (contracts signedAt/endsAt, obligations.due, boqItems requiredBy/orderBy,
  scheduleTasks start/finish/baselineFinish, monteCarlo p50/p80/p90, approvals.submittedAt,
  weather dates, changeOrders.submittedAt, aiRisks detectedAt/updatedAt/dueDate/history/overrides,
  tasks dueDate/createdAt/closedAt/writeback.at, alerts sentAt/ackAt, pipelines.lastRun,
  validation lastBatch & quarantine.at, auditLog.at, connectors.lastSync).
- Settings additions (DEFAULT_SETTINGS.platform): `{ weights:{contract:.2,bom:.2,schedule:.25,site:.2,cost:.15}, alertThreshold:60, criticalThreshold:85, channels:{email:true,slack:true,teams:false,whatsapp:false}, paymentPct:{M0:null,M1:null,M2:null,M3:null,M4:null}, writebackEnabled:true }`.
- Methods (each persists, emits `store:change`, appends to `platform.auditLog` where noted):
  `addAiRisk(obj)`, `updateAiRisk(id, patch)`,
  `acceptRecommendation(riskId, {owner, dueDate, escalate})` → creates task (source 'ai-accepted', writeback pending→synced after 1.5 s via setTimeout, emits feed event 'تمت الكتابة العكسية إلى Biltix PM'), sets risk.status 'مهمة مُسندة', owner/dueDate/taskId, audit 'accept';
  `overrideRecommendation(riskId, {action, reason, owner, dueDate, escalate})` → logs override on the risk, creates task (source 'ai-edited'), status 'مهمة مُسندة', audit 'override';
  `escalateRisk(riskId, channels)` → adds alert {severity:'critical', queue:'immediate'}, risk.escalated=true, bus 'alert', audit 'escalate';
  `dismissAiRisk(riskId, reason)` → status 'مُتجاوز', audit;
  `addTask(obj)`, `updateTask(id, patch)` (closing a task closes its risk with outcome + audit 'close');
  `ackAlert(id, by)`, `updateValidation(patch)`, `updatePipeline(id, patch)`, `updateConnector(id, patch)`, `pushAudit(entry)`, `resolveQuarantine(id, status)`.
- `store.platformFilters` not needed: the global filters (site/range/search) apply.

## B6. platform-live.js (`export const platformLive = { start({store,bus}), stop(), pause(), resume() }`)

Started by app.js after `live.start`. Seeded RNG. Every 4–9 s one of: a **pipeline run** feed
event (type 'ai', e.g. "محرك العقود NLP: بند غامض في CT-2026-014 §14.2 — الدرجة 72 (أحمر)"), a
**validation** event ("طبقة التحقق: رفض 3 سجلات مكررة من Oracle ERP · اكتمال 98.4%"), a
**connector** sync event ("Primavera P6: مزامنة 412 نشاطاً · المسار الحرج محدّث"), a
**write-back** event, or a **task** status event. Every ~3 min a new AI risk is detected
(`store.addAiRisk`) with realistic content for a random category; if score > alertThreshold an
alert is added (queue by criticalThreshold) and bus 'alert' fires for critical ones (the Part A
banner shows it). Every 30 s pipelines' lastRun/runsToday/latency jitter and validation
counters increase (`updateValidation`); every 60 s overdue tasks are re-flagged 'متأخرة' with a
feed event. Respects settings.feedPaused and document.hidden.

## B7. Shell changes (PLATFORM-CORE)

- Navigation becomes **grouped** (rail sections with small uppercase-style Arabic group labels):
  1. قمرة القيادة: `cockpit` (الرئيسية, 'CPT-00'), `airisks` (سجل المخاطر الذكي, 'AIR-01'), `tasks` (مهام المعالجة, 'AIR-02'), `alerts` (التنبيهات والتصعيد, 'AIR-03')
  2. مجالات المخاطر: `contracts` (مخاطر العقود, 'DOM-01'), `bom` (مخاطر المواد والتوريد, 'DOM-02'), `schedule` (مخاطر الجدول الزمني, 'DOM-03'), `cost` (مخاطر التكلفة, 'DOM-04'), `overview` (مخاطر الموقع والسلامة → the HSE overview, 'DOM-05' shown here, its own code stays SEC-01 inside the view)
  3. السلامة والصحة المهنية (HSE): `radar`, `risks`, `incidents`, `permits`, `inspections`, `training`, `compliance`
  4. المنصة: `engine` (محرك الذكاء الاصطناعي, 'PLT-01'), `dataquality` (جودة البيانات والتحقق, 'PLT-02'), `integrations`, `reports`, `roadmap` (خارطة الطريق والمقترح, 'PLT-03'), `settings`
  `views/index.js` exports `views` (flat array in this order) and `navGroups` ([{id,label,viewIds}]).
  Default route = `cockpit`. Bottom tab bar: cockpit, airisks, overview, radar, المزيد.
- App bar: brand text "بلتكس Risk AI" + tagline from B1; the integrations pill counts Part A
  integrations **and** platform connectors; add a **consolidated score pill** (score + rating dot)
  that navigates to cockpit; the command palette indexes AI risks (code/title), contracts, tasks.
- Filters row: unchanged (site select = المشروع).
- `window.biltix` also exposes `psel` and `platformLive`.

## B8. css/platform.css (PLATFORM-CORE)

Nav group labels (.rail-group, .rail-group-label), score pill (.score-pill with rating dot),
rating badges (.rating.is-red/.is-yellow/.is-green — reuse tone colors, never new hues),
type chips (.type-chip), flow stepper (.flow with 8 nodes + animated packet that moves along
the stage line every 2.4 s; reduced-motion: static), pipeline diagram (.pipeline-map: five layer
rows connected by vertical connectors with pulsing dots; dark/light), evidence block
(.evidence with mono ref and source system chip), recommendation card (.recommendation with
accept/override actions), response-parameter table (.response-params role tabs), KRI matrix
table (.kri-table 4 columns), EVM strip (.evm-strip), Monte Carlo histogram wrapper, roadmap
Gantt (.roadmap-gantt five milestone bars), quarantine list, connector cards variant
(.connector-card with layer stripe: enterprise=brand, biltix=accent, external=gold).

## B9. Views (Part B) — each exports `default { id, code, title, icon, render(container, ctx) }`;
ctx additionally carries `psel` and `platformLive`.

1. `cockpit.js` 'cockpit' CPT-00 "قمرة قيادة المخاطر" icon 'radar'. Row 1: hero card with the
   **consolidated score** gauge (charts.gauge, inverted tone: higher = worse → tone from rating),
   delta vs previous period, 12-week trend sparkline, weights legend (click → settings);
   beside it five **category tiles** (contract/bom/schedule/site/cost) each with score, rating
   badge with icon, open/red counts, sparkline, click → the domain view (site → `overview`).
   Row 2: **flow strip** (.flow, B8) visualizing the end-to-end pipeline with live packet
   animation and live counters per stage (ingested today, validated %, risks scored, classified,
   alerts, tasks, closed) from psel/validationSummary. Row 3: ranked open red risks table
   (code, title, project, category, type chip, score, rating, owner, due; row click → opens the
   same risk drawer as airisks via a shared exported function from airisks.js? NO — cross-view
   imports are not allowed; instead router.navigate('airisks', {risk:id}) which opens the drawer),
   alert queue card (immediate first) with acknowledge buttons, pipeline health strip (five mini
   cards: status dot, last run relative, runs today, acceptance rate), data-quality mini card
   (pass rate meter, quarantine count → dataquality), type distribution segmented bar, rating
   distribution segmented bar (status tones). Row 4: projects table (name, consolidated project
   score, CPI/SPI, percent complete vs planned, red count, next milestone).
2. `airisks.js` 'airisks' AIR-01 "سجل المخاطر الذكي" icon 'shield-alert'. Toolbar: category
   chips, type chips, rating segmented (الكل/أحمر/أصفر/أخضر), status select, pipeline select,
   sort (score desc default). dataTable: code, title, project, category (icon+label), type chip,
   score (mono) + rating badge, pipeline, confidence %, detected (fmt.relative), owner, status.
   Row click (and `?risk=ID` param) → **risk drawer implementing the proposal's user flow**:
   header (code, title, rating badge, type chip, score ring), flow stepper (psel.riskFlowStage),
   sections: (a) الدليل من المصدر — evidence block with source system chip, ref in mono, excerpt;
   (b) تفسير المحرك — plain-language driver explanation + confidence meter + model version +
   feature importance mini bars (from the pipeline); (c) الإجراء الموصى به — recommendation card
   with effort/impact chips and alternatives; actions: **قبول التوصية** (one click → modal asking
   owner + due date + escalate checkbox → store.acceptRecommendation), **تعديل / تجاوز**
   (modal: new action text, reason (required), owner, due, escalate → store.overrideRecommendation),
   **تصعيد فوري** (channels checkboxes → store.escalateRisk), **تجاهل** (reason → dismissAiRisk);
   (d) معاملات الاستجابة لأصحاب المصلحة — role tabs (psel.responseParams) so every stakeholder
   sees their data points; (e) السجل الزمني — psel.riskTimeline incl. overrides and write-back;
   (f) الكتابة العكسية — status of the linked task's writeback to Biltix PM. Toasts on each action.
   Side column: type distribution + top projects by red count (ranked bars).
3. `tasks.js` 'tasks' AIR-02 "مهام المعالجة" icon 'file-check'. KPI strip (مفتوحة, متأخرة,
   أُغلقت هذا الشهر, متوسط زمن الإغلاق, نسبة القبول مقابل التعديل). components.kanban across
   task statuses with task cards (code, title, risk code + rating dot, owner, due with overdue
   tone, source badge ai-accepted/ai-edited/manual, writeback chip synced/pending/failed with
   'إعادة المزامنة' for failed); onMove → store.updateTask; detail drawer with link to the risk
   (router.navigate('airisks',{risk})), outcome textarea on close (feeds "model recalibration"
   audit). 'مهمة يدوية' modal → store.addTask.
4. `alerts.js` 'alerts' AIR-03 "التنبيهات والتصعيد" icon 'bell'. Two columns: التصعيد الفوري
   (critical, channels icons, ack button, time) and قائمة التنبيهات القياسية; thresholds card
   (alertThreshold/criticalThreshold sliders → store.setSettings platform) with a live preview of
   how many open risks would alert; channels card (email/slack/teams/whatsapp toggles + 'إرسال
   تنبيه تجريبي' via sources.postWebhook when settings.alertWebhook is set); write-back log table
   (from auditLog action 'writeback').
5. `contracts.js` 'contracts' DOM-01 "مخاطر العقود" icon 'file-text'. KPI strip (عقود مراقبة,
   بنود مُعلَّمة, التزامات خلال 30 يوماً, تركّز المقاولين من الباطن); contracts dataTable (code,
   title, counterparty, type, value fmt.compact SAR, flagged clauses count, risk score + rating,
   status); drawer: clause list with flag badges, excerpt, explanation, benchmark, redline
   suggestion, 'إحالة للقانونية' button (creates task); obligations calendar (next 60 days list
   with due badges); subcontractor concentration ranked bars (one hue, label share %); KRI
   matrix table for the contract pipeline (from pipelines[contract-nlp].kris).
6. `bom.js` 'bom' DOM-02 "مخاطر المواد والتوريد (BoM)" icon 'list'. Commodity price lineChart
   (choose a commodity via segmented; series: actual + forecast as a second series labelled
   'توقع' — two series legend), volatility/exposure tiles, supplier concentration ranked bars
   with single-source badges, BoQ↔BIM variance dataTable (code, description, BoQ qty, BIM qty,
   variance % with tone, supplier, lead time, order-by date with overdue tone, spec compliance
   badge), long-lead items list, KRI matrix.
7. `schedule.js` 'schedule' DOM-03 "مخاطر الجدول الزمني" icon 'calendar'. Critical-path
   slippage dataTable (code, task, project, finish vs baseline, float, delay probability as a
   meter, expected delay days, subcontractor), **Monte Carlo** card: histogram as barChart
   (days → probability) + P50/P80/P90 tiles (fmt.date), resource utilization ranked bars with
   over-allocation tone, weather risk 7-day strip (per selected project: temp, wind, dust,
   rain, delay risk meter), regulatory approvals table (authority, type, elapsed/statutory as a
   meter, status badge, escalation button → task), subcontractor performance sparklines, KRI matrix.
8. `cost.js` 'cost' DOM-04 "مخاطر التكلفة" icon 'chart'. EVM strip per selected project (CPI,
   SPI, EAC, ETC, VAC with tone chips and formula hints), cost trend lineChart (budget / actual /
   forecast — three series with legend), commodity inflation impact tiles, currency exposure
   table (code, rate, 30d change signed, exposure, forecast, hedging recommendation chip),
   change-order creep (segmentedBar by status + table), labour index sparklines, cost lines
   variance dataTable (tone by variance), KRI matrix.
9. `engine.js` 'engine' PLT-01 "محرك الذكاء الاصطناعي والتفسير" icon 'sliders'. Pipeline map
   (.pipeline-map of the five layers from B1 with the five model cards), per-pipeline cards:
   status, version, last run, runs today, latency, precision/recall/calibration/drift meters,
   feature importance ranked bars, acceptance vs override segmented bar (human-in-the-loop),
   KRI matrix (collapsible), 'إعادة تدريب' / 'إيقاف مؤقت' buttons (simulated status change via
   store.updatePipeline + toast), explainability note card (how the 0–100 score and the driver
   explanation are produced), audit log table (versioning/overrides).
10. `dataquality.js` 'dataquality' PLT-02 "جودة البيانات وطبقة التحقق" icon 'badge-check'.
    Summary tiles (records in today, pass rate meter, deduplicated, completeness, consistency,
    quarantine open); per-source table (source, records in, passed, rejected, deduplicated,
    completeness %, consistency %, last batch); rules table with hits and enabled toggles
    (store.updateValidation); quarantine queue with resolve actions (مُصحح / مرفوض →
    store.resolveQuarantine) and reasons; a 'لا يصل أي سجل إلى المحرك قبل اجتياز التحقق' principle
    banner with the validation gate position in the flow.
11. `roadmap.js` 'roadmap' PLT-03 "خارطة الطريق والمقترح التفصيلي" icon 'calendar'. Architecture
    card (five layers + v2 additions as a vertical layer diagram built with DOM, not an image),
    scope-of-work checklist (7 items), assumptions list, milestones Gantt (M0–M4 bars by month,
    status), milestone table with deliverables and **editable payment %** inputs (settings
    platform.paymentPct; live total with validation to 100%), integration principle note
    (read-only + write-back of flags/alerts), 'تصدير المقترح' (print).

## B10. Definition of done for Part B

Same as §11, plus: the cockpit loads in < 1.5 s on a cold start with no console errors; every
rating/type is shown with icon + label (never color alone); the risk drawer actions persist
across reload and appear in the audit log and the tasks kanban; group navigation works on all
breakpoints; the HSE pillar keeps working unchanged.
