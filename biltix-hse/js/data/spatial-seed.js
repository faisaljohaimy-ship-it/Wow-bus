/**
 * BILTIX Risk AI — site plans and SIMULATED site cameras for the spatial view (js/data/spatial-seed.js).
 * Owner: spatial view (docs/design/spatial.md). Pure module: no DOM, no store writes, safe to import in node.
 *
 * Coordinates: every point is in SITE-NORMALISED plan space (x 0..1 west to east, y 0..1 north to south),
 * the same space as the zone rectangles in js/data/seed.js (zone.x / y / w / h). Plan north is up; each site
 * carries the angle of true north (trueNorthDeg, clockwise from plan north) for the north arrow.
 * Headings are degrees clockwise from plan north (0 = up, 90 = east / right on the plan).
 *
 * Cameras: there is NO camera connection anywhere in this build. Every camera record is a demo fixture
 * (simulated: true); the view renders a procedural "feed" (js/ui/camfeed.js) and labels it as simulated.
 * English mirrors of the Arabic copy sit next to it in the same record (`…En`), read through i18n.L().
 *
 * Linking (one definition per metric): zoneLinks() composes the shared selectors (js/core/selectors.js)
 * with the same global filters the registers use, then narrows to one zone. It never re-defines "open",
 * "overdue" or a period; the only extra rule is "a permit is open unless it is closed (مغلق)".
 */

import { sel as defaultSel } from '../core/selectors.js';

const CLOSED = 'مغلق';
const arr = (v) => (Array.isArray(v) ? v : []);

/** Plan drawing space (SVG viewBox): the site boundary is mapped into PLAN.inner. */
export const PLAN = Object.freeze({
  width: 1000,
  height: 640,
  inner: Object.freeze({ x: 56, y: 40, w: 836, h: 500 }),
});

/** Scene presets the camera feed renderer knows (js/ui/camfeed.js). */
export const SCENES = Object.freeze(['frame', 'midrise', 'yard', 'gate', 'trench', 'solar', 'warehouse', 'earthworks']);

/**
 * Site plans. Every feature is drawn from these records (nothing is an image):
 *   kind        urban | desert — far background of the camera feeds
 *   widthM      real width of the site boundary in metres (scale bar)
 *   trueNorthDeg angle of true north, clockwise from plan north
 *   footprints  buildings: polygon, label, levels { done, total } (structure progress), optional core polygon
 *   structures  sheds, cabins, containers, tanks, plant: rect [x, y, w, h] + type
 *   cranes      tower / mobile cranes: position + slewing radius (normalised to the site width)
 *   gates       position on the boundary + side (n|e|s|w) + label
 *   roads       haul roads: polylines
 *   arrays      solar rows: rect + number of rows
 *   pits        excavations: rect + number of benches (drawn as contour rings)
 *   manholes    small round chambers: point + code (codes stay Latin)
 */
export const SITE_PLANS = Object.freeze({
  S1: {
    kind: 'urban', widthM: 240, trueNorthDeg: -8,
    footprints: [
      { id: 'S1-B1', zoneId: 'S1-Z1', label: 'البرج', labelEn: 'Tower', levels: { done: 23, total: 38 },
        poly: [[0.07, 0.08], [0.47, 0.08], [0.47, 0.2], [0.53, 0.2], [0.53, 0.5], [0.07, 0.5]],
        core: [[0.22, 0.2], [0.35, 0.2], [0.35, 0.36], [0.22, 0.36]] },
    ],
    structures: [
      { type: 'shed', zoneId: 'S1-Z3', rect: [0.65, 0.35, 0.3, 0.16], label: 'سقيفة القص', labelEn: 'Cutting shed' },
      { type: 'cabin', zoneId: 'S1-Z5', rect: [0.03, 0.61, 0.16, 0.07] },
      { type: 'cabin', zoneId: 'S1-Z5', rect: [0.03, 0.71, 0.16, 0.07] },
      { type: 'stack', zoneId: 'S1-Z4', rect: [0.32, 0.74, 0.14, 0.08] },
      { type: 'stack', zoneId: 'S1-Z4', rect: [0.5, 0.74, 0.1, 0.16] },
      { type: 'stack', zoneId: 'S1-Z4', rect: [0.7, 0.72, 0.2, 0.07] },
      { type: 'tank', zoneId: 'S1-Z3', rect: [0.9, 0.53, 0.04, 0.035] },
    ],
    cranes: [
      { id: 'TC-1', type: 'tower', x: 0.39, y: 0.13, r: 0.27 },
      { id: 'TC-2', type: 'tower', x: 0.8, y: 0.15, r: 0.3 },
    ],
    gates: [
      { id: 'G1', x: 0, y: 0.91, side: 'w', label: 'البوابة 1', labelEn: 'Gate 1' },
      { id: 'G2', x: 0.62, y: 1, side: 's', label: 'بوابة الشاحنات', labelEn: 'Truck gate' },
    ],
    roads: [[[0, 0.91], [0.27, 0.91], [0.27, 0.64], [0.62, 0.64], [0.62, 1]]],
  },
  S2: {
    kind: 'urban', widthM: 310, trueNorthDeg: 12,
    footprints: [
      { id: 'S2-BA', zoneId: 'S2-Z1', label: 'المبنى أ', labelEn: 'Building A', levels: { done: 9, total: 9 }, poly: [[0.05, 0.08], [0.29, 0.08], [0.29, 0.42], [0.05, 0.42]] },
      { id: 'S2-BB', zoneId: 'S2-Z2', label: 'المبنى ب', labelEn: 'Building B', levels: { done: 9, total: 9 }, poly: [[0.39, 0.08], [0.62, 0.08], [0.62, 0.42], [0.39, 0.42]] },
      { id: 'S2-BC', zoneId: 'S2-Z3', label: 'المبنى ج', labelEn: 'Building C', levels: { done: 9, total: 9 }, poly: [[0.72, 0.08], [0.95, 0.08], [0.95, 0.42], [0.72, 0.42]] },
    ],
    structures: [
      { type: 'scaffold', zoneId: 'S2-Z3', rect: [0.7, 0.06, 0.27, 0.02] },
      { type: 'scaffold', zoneId: 'S2-Z3', rect: [0.7, 0.43, 0.27, 0.02] },
      { type: 'stack', zoneId: 'S2-Z5', rect: [0.45, 0.6, 0.12, 0.1] },
      { type: 'container', zoneId: 'S2-Z5', rect: [0.6, 0.6, 0.11, 0.06] },
      { type: 'container', zoneId: 'S2-Z5', rect: [0.6, 0.7, 0.11, 0.06] },
      { type: 'cabin', zoneId: 'S2-Z6', rect: [0.79, 0.6, 0.17, 0.08] },
    ],
    cranes: [{ id: 'MC-1', type: 'mobile', x: 0.84, y: 0.47, r: 0.12 }],
    gates: [{ id: 'G1', x: 1, y: 0.86, side: 'e', label: 'البوابة الرئيسية', labelEn: 'Main gate' }],
    roads: [[[1, 0.86], [0.42, 0.86], [0.42, 0.52]], [[0.1, 0.52], [0.98, 0.52]]],
    manholes: [
      { code: 'MH-12', x: 0.08, y: 0.66 }, { code: 'MH-13', x: 0.18, y: 0.74 },
      { code: 'MH-14', x: 0.28, y: 0.82 }, { code: 'MH-15', x: 0.36, y: 0.92 },
    ],
  },
  S3: {
    kind: 'desert', widthM: 1800, trueNorthDeg: 0,
    footprints: [],
    arrays: [
      { zoneId: 'S3-Z1', rect: [0.03, 0.05, 0.44, 0.37], rows: 9 },
      { zoneId: 'S3-Z2', rect: [0.53, 0.05, 0.44, 0.37], rows: 9 },
    ],
    structures: [
      { type: 'plant', zoneId: 'S3-Z3', rect: [0.05, 0.5, 0.11, 0.1], label: 'محول', labelEn: 'Transformer' },
      { type: 'plant', zoneId: 'S3-Z3', rect: [0.18, 0.5, 0.09, 0.1] },
      { type: 'container', zoneId: 'S3-Z5', rect: [0.74, 0.52, 0.09, 0.07] },
      { type: 'container', zoneId: 'S3-Z5', rect: [0.86, 0.52, 0.09, 0.07] },
      { type: 'container', zoneId: 'S3-Z5', rect: [0.74, 0.64, 0.09, 0.07] },
      { type: 'container', zoneId: 'S3-Z5', rect: [0.86, 0.64, 0.09, 0.07] },
      { type: 'stack', zoneId: 'S3-Z4', rect: [0.36, 0.55, 0.12, 0.1] },
      { type: 'stack', zoneId: 'S3-Z4', rect: [0.52, 0.55, 0.12, 0.1] },
      { type: 'cabin', zoneId: 'S3-Z6', rect: [0.04, 0.8, 0.1, 0.06] },
      { type: 'cabin', zoneId: 'S3-Z6', rect: [0.16, 0.8, 0.1, 0.06] },
    ],
    cranes: [{ id: 'MC-1', type: 'mobile', x: 0.6, y: 0.75, r: 0.08 }],
    gates: [{ id: 'G1', x: 0, y: 0.92, side: 'w', label: 'بوابة المعسكر', labelEn: 'Camp gate' }],
    roads: [[[0, 0.92], [0.33, 0.92], [0.33, 0.47], [1, 0.47]], [[0.5, 0.47], [0.5, 0.03]]],
  },
  S4: {
    kind: 'urban', widthM: 420, trueNorthDeg: -15,
    footprints: [
      { id: 'S4-W1', zoneId: 'S4-Z1', label: 'المستودع 1', labelEn: 'Warehouse 1', levels: { done: 1, total: 1 }, poly: [[0.04, 0.06], [0.29, 0.06], [0.29, 0.52], [0.04, 0.52]], grid: true },
      { id: 'S4-W2', zoneId: 'S4-Z2', label: 'المستودع 2', labelEn: 'Warehouse 2', levels: { done: 1, total: 1 }, poly: [[0.37, 0.06], [0.63, 0.06], [0.63, 0.52], [0.37, 0.52]], grid: true },
      { id: 'S4-W3', zoneId: 'S4-Z3', label: 'المستودع 3', labelEn: 'Warehouse 3', levels: { done: 1, total: 1 }, poly: [[0.71, 0.06], [0.96, 0.06], [0.96, 0.52], [0.71, 0.52]], grid: true },
    ],
    structures: [
      { type: 'shed', zoneId: 'S4-Z4', rect: [0.04, 0.66, 0.26, 0.18], label: 'ورشة الصلب', labelEn: 'Steel shop' },
      { type: 'stack', zoneId: 'S4-Z5', rect: [0.4, 0.66, 0.14, 0.08] },
      { type: 'container', zoneId: 'S4-Z5', rect: [0.58, 0.66, 0.12, 0.06] },
      { type: 'cabin', zoneId: 'S4-Z6', rect: [0.79, 0.65, 0.17, 0.08] },
    ],
    cranes: [{ id: 'MC-1', type: 'mobile', x: 0.5, y: 0.56, r: 0.14 }],
    gates: [{ id: 'G1', x: 1, y: 0.9, side: 'e', label: 'بوابة الميناء', labelEn: 'Port gate' }],
    roads: [[[1, 0.9], [0.36, 0.9], [0.36, 0.57], [0.98, 0.57]]],
  },
  S5: {
    kind: 'desert', widthM: 900, trueNorthDeg: 4,
    footprints: [],
    pits: [{ zoneId: 'S5-Z1', rect: [0.05, 0.06, 0.46, 0.44], benches: 4 }],
    structures: [
      { type: 'plant', zoneId: 'S5-Z2', rect: [0.62, 0.06, 0.12, 0.14], label: 'الكسارة', labelEn: 'Crusher' },
      { type: 'tank', zoneId: 'S5-Z2', rect: [0.8, 0.07, 0.06, 0.08] },
      { type: 'tank', zoneId: 'S5-Z2', rect: [0.88, 0.07, 0.06, 0.08] },
      { type: 'stack', zoneId: 'S5-Z3', rect: [0.62, 0.36, 0.3, 0.12] },
      { type: 'stack', zoneId: 'S5-Z5', rect: [0.06, 0.76, 0.14, 0.08] },
      { type: 'stack', zoneId: 'S5-Z5', rect: [0.26, 0.76, 0.14, 0.08] },
      { type: 'cabin', zoneId: 'S5-Z6', rect: [0.66, 0.76, 0.14, 0.08] },
      { type: 'cabin', zoneId: 'S5-Z6', rect: [0.82, 0.76, 0.12, 0.08] },
    ],
    cranes: [],
    gates: [{ id: 'G1', x: 0.8, y: 1, side: 's', label: 'بوابة الدخول', labelEn: 'Entrance gate' }],
    roads: [[[0, 0.625], [1, 0.625]], [[0.8, 1], [0.8, 0.625]], [[0.4, 0.625], [0.4, 0.5]]],
  },
  S6: {
    kind: 'urban', widthM: 180, trueNorthDeg: 22,
    footprints: [
      { id: 'S6-EX', zoneId: 'S6-Z1', label: 'المبنى القائم', labelEn: 'Existing building', levels: { done: 6, total: 6 }, poly: [[0.02, 0.05], [0.26, 0.05], [0.26, 0.55], [0.02, 0.55]], existing: true },
      { id: 'S6-TW', zoneId: 'S6-Z2', label: 'برج التوسعة', labelEn: 'Expansion tower', levels: { done: 3, total: 7 }, poly: [[0.34, 0.07], [0.66, 0.07], [0.66, 0.52], [0.34, 0.52]],
        core: [[0.46, 0.22], [0.54, 0.22], [0.54, 0.34], [0.46, 0.34]] },
    ],
    structures: [
      { type: 'scaffold', zoneId: 'S6-Z3', rect: [0.73, 0.1, 0.03, 0.42] },
      { type: 'scaffold', zoneId: 'S6-Z3', rect: [0.86, 0.1, 0.03, 0.42] },
      { type: 'tank', zoneId: 'S6-Z4', rect: [0.06, 0.68, 0.08, 0.1] },
      { type: 'tank', zoneId: 'S6-Z4', rect: [0.17, 0.68, 0.08, 0.1] },
      { type: 'plant', zoneId: 'S6-Z4', rect: [0.29, 0.7, 0.12, 0.12], label: 'المولدات', labelEn: 'Generators' },
      { type: 'stack', zoneId: 'S6-Z5', rect: [0.5, 0.68, 0.1, 0.1] },
      { type: 'container', zoneId: 'S6-Z5', rect: [0.62, 0.68, 0.1, 0.06] },
      { type: 'cabin', zoneId: 'S6-Z6', rect: [0.79, 0.66, 0.17, 0.08] },
    ],
    cranes: [{ id: 'TC-1', type: 'tower', x: 0.62, y: 0.14, r: 0.32 }],
    gates: [{ id: 'G1', x: 0.9, y: 1, side: 's', label: 'بوابة المقاول', labelEn: 'Contractor gate' }],
    roads: [[[0.9, 1], [0.9, 0.62], [0.32, 0.62]]],
  },
});

/** Simulated cameras: one record per mounted position. Codes are Latin and never localised. */
const CAM = (o) => Object.freeze({ simulated: true, connected: false, lens: '4 mm', range: 0.2, ...o });
export const CAMERAS = Object.freeze([
  /* S1 — Financial Gateway Tower (Riyadh) */
  CAM({ id: 'CAM-S1-01', siteId: 'S1', zoneId: 'S1-Z6', x: 0.04, y: 0.86, heading: 96, fov: 92, mountHeight: 6, lens: '2.8 mm', scene: 'gate',
    purpose: 'بوابة الدخول وحركة المركبات', purposeEn: 'Entrance gate and vehicle movements' }),
  CAM({ id: 'CAM-S1-02', siteId: 'S1', zoneId: 'S1-Z1', x: 0.57, y: 0.55, heading: 318, fov: 70, mountHeight: 12, scene: 'frame',
    purpose: 'نواة البرج وحواف البلاطات العليا', purposeEn: 'Tower core and upper slab edges' }),
  CAM({ id: 'CAM-S1-03', siteId: 'S1', zoneId: 'S1-Z2', x: 0.63, y: 0.27, heading: 40, fov: 62, mountHeight: 18, lens: '6 mm', range: 0.22, scene: 'frame',
    purpose: 'منطقة الرفع أسفل برج الرافعة 2', purposeEn: 'Lift zone below tower crane 2' }),
  CAM({ id: 'CAM-S1-04', siteId: 'S1', zoneId: 'S1-Z3', x: 0.97, y: 0.55, heading: 296, fov: 100, mountHeight: 5, lens: '2.8 mm', range: 0.17, scene: 'yard',
    purpose: 'ورشة الحديد ومحطة القص', purposeEn: 'Rebar workshop and cutting station' }),
  CAM({ id: 'CAM-S1-05', siteId: 'S1', zoneId: 'S1-Z4', x: 0.96, y: 0.97, heading: 292, fov: 88, mountHeight: 8, scene: 'yard',
    purpose: 'ساحة التخزين وبوابة الشاحنات', purposeEn: 'Laydown yard and truck gate' }),
  /* S2 — Red Sea Residential Compound (Jeddah) */
  CAM({ id: 'CAM-S2-01', siteId: 'S2', zoneId: 'S2-Z6', x: 0.97, y: 0.95, heading: 296, fov: 92, mountHeight: 6, lens: '2.8 mm', scene: 'gate',
    purpose: 'البوابة الرئيسية ومنطقة التسليم', purposeEn: 'Main gate and delivery bay' }),
  CAM({ id: 'CAM-S2-02', siteId: 'S2', zoneId: 'S2-Z3', x: 0.69, y: 0.47, heading: 22, fov: 74, mountHeight: 10, scene: 'midrise',
    purpose: 'سقالات واجهات المبنى ج', purposeEn: 'Building C façade scaffolding' }),
  CAM({ id: 'CAM-S2-03', siteId: 'S2', zoneId: 'S2-Z4', x: 0.03, y: 0.53, heading: 138, fov: 84, mountHeight: 5, range: 0.24, scene: 'trench',
    purpose: 'شبكة الصرف وغرفة التفتيش MH-14', purposeEn: 'Drainage network and manhole MH-14' }),
  CAM({ id: 'CAM-S2-04', siteId: 'S2', zoneId: 'S2-Z1', x: 0.31, y: 0.47, heading: 322, fov: 78, mountHeight: 9, scene: 'midrise',
    purpose: 'أعمال التشطيبات في المبنى أ', purposeEn: 'Building A finishing works' }),
  /* S3 — NEOM solar plant */
  CAM({ id: 'CAM-S3-01', siteId: 'S3', zoneId: 'S3-Z1', x: 0.48, y: 0.43, heading: 300, fov: 96, mountHeight: 8, lens: '2.8 mm', range: 0.24, scene: 'solar',
    purpose: 'حقل الألواح الشمالي وتركيب المتتبعات', purposeEn: 'North array and tracker installation' }),
  CAM({ id: 'CAM-S3-02', siteId: 'S3', zoneId: 'S3-Z2', x: 0.52, y: 0.43, heading: 58, fov: 96, mountHeight: 8, lens: '2.8 mm', range: 0.24, scene: 'solar',
    purpose: 'حقل الألواح الجنوبي — الصف 48', purposeEn: 'South array, row 48' }),
  CAM({ id: 'CAM-S3-03', siteId: 'S3', zoneId: 'S3-Z4', x: 0.68, y: 0.97, heading: 318, fov: 86, mountHeight: 7, scene: 'yard',
    purpose: 'ساحة التجميع ومسار الشاحنات', purposeEn: 'Assembly yard and truck route' }),
  CAM({ id: 'CAM-S3-04', siteId: 'S3', zoneId: 'S3-Z6', x: 0.03, y: 0.97, heading: 48, fov: 92, mountHeight: 6, lens: '2.8 mm', scene: 'gate',
    purpose: 'بوابة المعسكر ونقطة التجمع', purposeEn: 'Camp gate and muster point' }),
  /* S4 — Dammam port logistics warehouses */
  CAM({ id: 'CAM-S4-01', siteId: 'S4', zoneId: 'S4-Z1', x: 0.03, y: 0.57, heading: 28, fov: 80, mountHeight: 10, scene: 'warehouse',
    purpose: 'تركيب الهيكل الفولاذي للمستودع 1', purposeEn: 'Warehouse 1 steel erection' }),
  CAM({ id: 'CAM-S4-02', siteId: 'S4', zoneId: 'S4-Z2', x: 0.5, y: 0.58, heading: 2, fov: 80, mountHeight: 12, range: 0.22, scene: 'warehouse',
    purpose: 'أعمال الأسقف والتكسية في المستودع 2', purposeEn: 'Warehouse 2 roofing and cladding' }),
  CAM({ id: 'CAM-S4-03', siteId: 'S4', zoneId: 'S4-Z5', x: 0.73, y: 0.97, heading: 290, fov: 90, mountHeight: 8, scene: 'yard',
    purpose: 'ساحة المناورة والشحن', purposeEn: 'Manoeuvring and loading yard' }),
  CAM({ id: 'CAM-S4-04', siteId: 'S4', zoneId: 'S4-Z6', x: 0.97, y: 0.96, heading: 296, fov: 92, mountHeight: 6, lens: '2.8 mm', scene: 'gate',
    purpose: 'بوابة الميناء ومكاتب الموقع', purposeEn: 'Port gate and site offices' }),
  /* S5 — Qiddiya phase 2 earthworks */
  CAM({ id: 'CAM-S5-01', siteId: 'S5', zoneId: 'S5-Z1', x: 0.53, y: 0.53, heading: 314, fov: 84, mountHeight: 9, range: 0.26, scene: 'earthworks',
    purpose: 'منطقة الحفريات الرئيسية — التقاطع الشرقي', purposeEn: 'Main excavation, east crossing' }),
  CAM({ id: 'CAM-S5-02', siteId: 'S5', zoneId: 'S5-Z2', x: 0.97, y: 0.28, heading: 292, fov: 80, mountHeight: 8, scene: 'earthworks',
    purpose: 'الكسارة ومحطة الخلط', purposeEn: 'Crusher and batching plant' }),
  CAM({ id: 'CAM-S5-03', siteId: 'S5', zoneId: 'S5-Z4', x: 0.28, y: 0.68, heading: 84, fov: 76, mountHeight: 7, range: 0.26, scene: 'earthworks',
    purpose: 'طريق النقل الداخلي', purposeEn: 'Internal haul road' }),
  CAM({ id: 'CAM-S5-04', siteId: 'S5', zoneId: 'S5-Z6', x: 0.63, y: 0.97, heading: 22, fov: 92, mountHeight: 6, lens: '2.8 mm', scene: 'gate',
    purpose: 'بوابة الدخول ومكاتب الموقع', purposeEn: 'Entrance gate and site offices' }),
  /* S6 — Madinah specialist hospital expansion */
  CAM({ id: 'CAM-S6-01', siteId: 'S6', zoneId: 'S6-Z2', x: 0.33, y: 0.58, heading: 30, fov: 72, mountHeight: 11, scene: 'frame',
    purpose: 'برج التوسعة — الطوابق 1 إلى 3', purposeEn: 'Expansion tower, levels 1 to 3' }),
  CAM({ id: 'CAM-S6-02', siteId: 'S6', zoneId: 'S6-Z3', x: 0.97, y: 0.58, heading: 322, fov: 80, mountHeight: 9, scene: 'midrise',
    purpose: 'البهو الرئيسي والسقالات', purposeEn: 'Main atrium and scaffolding' }),
  CAM({ id: 'CAM-S6-03', siteId: 'S6', zoneId: 'S6-Z1', x: 0.02, y: 0.58, heading: 34, fov: 82, mountHeight: 8, scene: 'midrise',
    purpose: 'منطقة الربط مع المبنى القائم', purposeEn: 'Link to the existing building' }),
  CAM({ id: 'CAM-S6-04', siteId: 'S6', zoneId: 'S6-Z6', x: 0.97, y: 0.97, heading: 300, fov: 92, mountHeight: 6, lens: '2.8 mm', scene: 'gate',
    purpose: 'بوابة المقاول', purposeEn: 'Contractor gate' }),
]);

/* ────────────────────────────── lookups ────────────────────────────── */

export function camerasFor(siteId) { return CAMERAS.filter((c) => c.siteId === siteId); }
export function cameraById(id) { return CAMERAS.find((c) => c.id === id) || null; }
export function camerasInZone(zoneId) { return CAMERAS.filter((c) => c.zoneId === zoneId); }
export function planFor(siteId) { return SITE_PLANS[siteId] || null; }

/** Site-normalised point → plan (SVG) coordinates. */
export function toPlan(x, y) {
  const { inner } = PLAN;
  return { x: inner.x + x * inner.w, y: inner.y + y * inner.h };
}

/** True when the point lies in the zone rectangle (edges included). */
export function inZone(zone, x, y) {
  return Boolean(zone) && x >= zone.x - 1e-9 && x <= zone.x + zone.w + 1e-9 && y >= zone.y - 1e-9 && y <= zone.y + zone.h + 1e-9;
}

/** Deterministic 32-bit hash (FNV-1a) for stable marker placement. */
export function hash32(str) {
  let h = 0x811c9dc5;
  const s = String(str);
  for (let i = 0; i < s.length; i += 1) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h >>> 0;
}

/**
 * Where a zone-only record (sensor) is drawn: a stable spot inside the zone, kept off its centre (the label).
 * The seed has no sensor coordinates, so the marker is a placement, not a surveyed position (said in the UI).
 */
export function markerPoint(zone, key, slot = 0) {
  const h = hash32(`${key}:${slot}`);
  const fx = 0.16 + ((h & 0xff) / 255) * 0.68;
  const fy = 0.62 + (((h >>> 8) & 0xff) / 255) * 0.26;
  return { x: zone.x + zone.w * fx, y: zone.y + zone.h * fy };
}

/* ────────────────────────────── zone links (shared selectors) ────────────────────────────── */

function globalFilters(state, siteId) {
  const f = (state && state.filters) || {};
  return { ...f, siteId, search: '', range: Number(f.range) > 0 ? Number(f.range) : 30 };
}

/**
 * Everything linked to one zone, from the same selectors the registers use:
 *   risks       sel.filteredRisks(state, site filters) in the zone (register rows: open risks + closed ones
 *               updated inside the period) — `open` / `overdue` split with sel.isOverdueRisk
 *   sensors     store sensors with this siteId + zoneId
 *   cameras     simulated cameras mounted in the zone (this module)
 *   permits     sel.filteredPermits(...) in the zone, not closed
 *   incidents   sel.filteredIncidents(...) in the zone (the period of the global filter)
 *   inspections sel.filteredInspections(...) in the zone (±period; overdue ones always)
 * @returns {{ risks, openRisks, overdueRisks, sensors, cameras, permits, incidents, inspections, counts }}
 */
export function zoneLinks(state, siteId, zoneId, { sel = defaultSel, now } = {}) {
  const st = state || {};
  const f = globalFilters(st, siteId);
  const at = now || undefined;
  const inZoneOnly = (list) => arr(list).filter((r) => r && r.siteId === siteId && r.zoneId === zoneId);
  const risks = inZoneOnly(sel.filteredRisks(st, f, at));
  const todayStart = (() => { const d = at ? new Date(at) : new Date(); return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime(); })();
  const openRisks = risks.filter((r) => r.status !== CLOSED);
  const overdueRisks = risks.filter((r) => sel.isOverdueRisk(r, todayStart));
  const sensors = inZoneOnly(st.sensors);
  const cameras = camerasInZone(zoneId).filter((c) => c.siteId === siteId);
  const permits = inZoneOnly(sel.filteredPermits(st, f, at)).filter((p) => p.status !== CLOSED);
  const incidents = inZoneOnly(sel.filteredIncidents(st, f, at));
  const inspections = inZoneOnly(sel.filteredInspections(st, f, at));
  return {
    risks, openRisks, overdueRisks, sensors, cameras, permits, incidents, inspections,
    counts: { risks: risks.length, openRisks: openRisks.length, overdueRisks: overdueRisks.length, sensors: sensors.length, cameras: cameras.length, permits: permits.length, incidents: incidents.length, inspections: inspections.length },
  };
}

/** Highest-severity tone among a zone's open risks (for the plan badge), or null. */
export function zoneTone(openRisks, sel = defaultSel) {
  const rank = { critical: 0, serious: 1, warning: 2, good: 3 };
  let best = null;
  for (const r of arr(openRisks)) {
    const tone = sel.tierTone(sel.riskTier(sel.riskScore(r)));
    if (best === null || (rank[tone] ?? 9) < (rank[best] ?? 9)) best = tone;
  }
  return best;
}

/* ────────────────────────────── simulated PPE events (feed) ────────────────────────────── */

const ARABIC_INDIC = /[٠-٩]/g;
const latinDigits = (s) => String(s || '').replace(ARABIC_INDIC, (d) => String(d.charCodeAt(0) - 0x0660)).replace(/[‑ ]/g, (c) => (c === '‑' ? '-' : ' '));

/** PPE item a feed sentence is about (the engine's phrases), or null for a compliance / unknown sentence. */
export function ppeItemOf(event) {
  const s = `${event && event.title ? event.title : ''} ${event && event.titleEn ? event.titleEn : ''}`;
  if (/خوذة|helmet|hard hat/i.test(s)) return 'helmet';
  if (/سترة|vest|hi-vis/i.test(s)) return 'vest';
  if (/حزام|harness/i.test(s)) return 'harness';
  if (/نظارات|glasses/i.test(s)) return 'glasses';
  return null;
}

/**
 * PPE NON-compliance events that the simulated feed reported for a camera's zone. The feed events carry a
 * siteId but no zoneId, so the zone is matched on the zone name the engine wrote into the sentence
 * (Arabic title, digits normalised; or the English mirror). Compliance sentences (tone good) are excluded.
 * Only these events may drive the illustrative detection boxes in the viewer.
 * @param {object} state  store state (state.feed, state.sites)
 * @param {object} camera camera record
 * @param {{ zoneNameEn?: string, sinceMs?: number, limit?: number }} [opts]
 */
export function ppeEventsFor(state, camera, { zoneNameEn = '', sinceMs = null, limit = 3 } = {}) {
  if (!camera) return [];
  const site = arr(state && state.sites).find((s) => s && s.id === camera.siteId);
  const zone = site ? arr(site.zones).find((z) => z && z.id === camera.zoneId) : null;
  if (!zone) return [];
  const nameAr = latinDigits(zone.name).trim();
  const nameEn = String(zoneNameEn || '').trim();
  const out = [];
  for (const ev of arr(state && state.feed)) {
    if (!ev || ev.type !== 'ppe' || ev.siteId !== camera.siteId) continue;
    if (ev.tone !== 'warning' && ev.tone !== 'serious' && ev.tone !== 'critical') continue;
    if (ev.zoneId && ev.zoneId !== camera.zoneId) continue;
    if (!ev.zoneId) {
      const ar = latinDigits(ev.title);
      const en = String(ev.titleEn || '');
      if (!(nameAr && ar.includes(nameAr)) && !(nameEn && en.includes(nameEn))) continue;
    }
    const ts = Date.parse(ev.ts);
    if (sinceMs !== null && Number.isFinite(ts) && ts < sinceMs) continue;
    const item = ppeItemOf(ev);
    if (!item) continue;
    out.push({ id: ev.id, ts: ev.ts, item, tone: ev.tone, title: ev.title, titleEn: ev.titleEn || '', simulated: ev.simulated !== false, event: ev });
    if (out.length >= limit) break;
  }
  return out;
}

/* ────────────────────────────── AI risk → site map target ────────────────────────────── */

const HSE_CODE_RE = /\bR-\d{4}\b/g;

/**
 * Where an AI risk sits on the site map, when the data says so:
 *   1. the record carries siteId/projectId + zoneId → that zone;
 *   2. a site-domain risk whose text names an HSE register code (R-1001) of the same site that has a zone →
 *      that zone (via: the HSE risk);
 *   3. a site-domain risk with a project that is a site → the site only.
 * Otherwise null (no button). Never guesses a zone.
 * @returns {{ site: string, zone?: string, risk?: string, via?: string } | null}
 */
export function spatialTargetForAiRisk(state, risk) {
  if (!risk) return null;
  const sites = arr(state && state.sites);
  const siteId = risk.siteId || risk.projectId || null;
  const site = sites.find((s) => s && s.id === siteId) || null;
  if (!site) return null;
  if (risk.zoneId && arr(site.zones).some((z) => z && z.id === risk.zoneId)) return { site: site.id, zone: risk.zoneId };
  if (risk.category !== 'site') return null;
  const text = [risk.title, risk.driverExplanation, risk.evidence && risk.evidence.excerpt].filter(Boolean).join(' ');
  const codes = text.match(HSE_CODE_RE) || [];
  for (const code of codes) {
    const hse = arr(state && state.risks).find((r) => r && r.code === code && r.siteId === site.id && r.zoneId);
    if (hse && arr(site.zones).some((z) => z && z.id === hse.zoneId)) return { site: site.id, zone: hse.zoneId, risk: hse.id, via: hse.code };
  }
  return { site: site.id };
}

/** Deep-link params for the spatial route (empty values dropped by router.buildHash). */
export function spatialParams({ site, zone, camera, risk } = {}) {
  return { site: site || null, zone: zone || null, camera: camera || null, risk: risk || null };
}

export default { PLAN, SCENES, SITE_PLANS, CAMERAS, camerasFor, cameraById, camerasInZone, planFor, toPlan, inZone, markerPoint, zoneLinks, zoneTone, ppeEventsFor, ppeItemOf, spatialTargetForAiRisk, spatialParams };
