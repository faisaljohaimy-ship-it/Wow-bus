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
