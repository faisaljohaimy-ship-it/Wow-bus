/**
 * Biltix Risk AI — English vocabulary for generated records (js/data/vocab-en.js)
 *
 * The live engines (live.js, platform-live.js) and the store compose every runtime event and record
 * in BOTH languages at creation time (CONTRACT §8: `title/detail` + `titleEn/detailEn`, runtime records
 * carry `titleEn/descriptionEn/…`). They cannot depend on the active UI language, so the English names
 * of the static entities they mention (sites, zones, courses, sensor kinds, integrations, enums and the
 * people who appear as owners/approvers) live here, keyed by id or by the stored Arabic value.
 *
 * This is NOT the translation layer for seed content (that is js/i18n/data/*.js, keyed by record id,
 * owned by the data-translation work); it only covers what the engines embed in generated sentences.
 * Unknown values fall back to a neutral code-based descriptor — never to Arabic text.
 *
 * Plain data, no imports, no side effects.
 */

export const SITE_EN = Object.freeze({
  S1: 'Financial Plaza Tower',
  S2: 'Red Sea Residential Complex',
  S3: 'NEOM Solar Power Plant',
  S4: 'Dammam Port Logistics Warehouses',
  S5: 'Qiddiya Entertainment City — Phase 2',
  S6: 'Madinah Specialist Hospital Expansion',
});

export const ZONE_EN = Object.freeze({
  'S1-Z1': 'Zone A — tower core and foundations', 'S1-Z2': 'Tower crane 2', 'S1-Z3': 'Rebar workshop',
  'S1-Z4': 'Storage yard', 'S1-Z5': 'Site offices', 'S1-Z6': 'Entrance gate',
  'S2-Z1': 'Building A — finishes', 'S2-Z2': 'Building B — MEP works', 'S2-Z3': 'Building C — façades',
  'S2-Z4': 'Drainage network and manholes', 'S2-Z5': 'Materials storage yard', 'S2-Z6': 'Site offices and gate',
  'S3-Z1': 'Panel field — north sector', 'S3-Z2': 'Panel field — south sector', 'S3-Z3': 'Substation and transformers',
  'S3-Z4': 'Assembly and storage yard', 'S3-Z5': 'BESS energy storage', 'S3-Z6': 'Camp, offices and gate',
  'S4-Z1': 'Warehouse 1 — steel structure', 'S4-Z2': 'Warehouse 2 — roofing and cladding', 'S4-Z3': 'Warehouse 3 — internal fit-out',
  'S4-Z4': 'Steel fabrication shop', 'S4-Z5': 'Manoeuvring and loading yard', 'S4-Z6': 'Site offices and port gate',
  'S5-Z1': 'Main excavation area', 'S5-Z2': 'Crusher and batching plant', 'S5-Z3': 'Backfill and compaction ramp',
  'S5-Z4': 'Internal haul road', 'S5-Z5': 'Heavy equipment yard', 'S5-Z6': 'Site offices and entrance gate',
  'S6-Z1': 'Existing building — link zone', 'S6-Z2': 'Expansion tower — levels 1–3', 'S6-Z3': 'Main atrium and scaffolding',
  'S6-Z4': 'Basement — tanks and generator room', 'S6-Z5': 'Storage yard', 'S6-Z6': 'Site offices and contractor gate',
});

export const CATEGORY_EN = Object.freeze({
  height: 'Work at height', excavation: 'Excavations and trenches', lifting: 'Cranes and lifting', electrical: 'Electrical',
  confined: 'Confined spaces', hotwork: 'Hot work', heat: 'Heat stress', chemical: 'Chemicals and dust', traffic: 'Vehicles and traffic',
  scaffold: 'Scaffolding and temporary works', structural: 'Structural collapse', ergonomic: 'Manual handling and ergonomics',
});

export const COURSE_EN = Object.freeze({
  C1: 'Site safety induction', C2: 'Working at heights', C3: 'Confined spaces', C4: 'Permits to work', C5: 'First aid',
  C6: 'Firefighting', C7: 'Heat stress', C8: 'Heavy equipment operation', C9: 'Signalling and rigging', C10: 'Defensive driving',
});

/** Sensor kinds as stored in the seed (Arabic) → English. */
export const SENSOR_KIND_EN = Object.freeze({
  'سرعة الرياح': 'Wind speed', 'الضوضاء': 'Noise', 'الغبار PM2.5': 'Dust PM2.5', 'غاز H2S': 'H2S gas',
  'الأكسجين O₂': 'Oxygen O₂', 'الإجهاد الحراري WBGT': 'Heat stress WBGT', 'أول أكسيد الكربون CO': 'Carbon monoxide CO', 'الاهتزاز': 'Vibration',
});

/** Units that are Arabic in the seed. */
export const UNIT_EN = Object.freeze({ 'كم/س': 'km/h', '°م': '°C', 'م/ث²': 'm/s²', 'دقيقة': 'min', 'يومًا': 'days', 'بندًا': 'items', 'كم': 'km', 'مللي ثانية': 'ms', 'ريال/طن': 'SAR/t' });

export const INTEGRATION_EN = Object.freeze({
  'biltix-pm': 'Biltix project management platform', 'biltix-dms': 'Biltix DMS — document management', 'iot-gateway': 'Sensor gateway (MQTT)',
  'cctv-ai': 'Smart cameras — PPE detection', wearables: 'Wearable devices', 'access-control': 'Access gates and attendance',
  'weather-ncm': 'National Center for Meteorology', gosi: 'GOSI — occupational injuries', hrms: 'HR management system', 'erp-sap': 'SAP / Oracle ERP',
  slack: 'Slack', teams: 'Microsoft Teams', whatsapp: 'WhatsApp Business alerts', 'email-smtp': 'Email (SMTP)', 'sms-twilio': 'SMS (Twilio)',
  webhooks: 'Webhooks / n8n / Zapier', 'google-sheets': 'Google Sheets', supabase: 'Supabase', powerbi: 'Power BI',
  // platform connectors
  'primavera-p6': 'Oracle Primavera P6 EPPM', 'autodesk-aps': 'Autodesk Platform Services', 'oracle-erp': 'Oracle Fusion Cloud ERP',
  'oracle-crm': 'Oracle CX Sales (CRM)', 'sap-s4': 'SAP S/4HANA', 'zoho-crm': 'Zoho CRM', hubspot: 'HubSpot CRM',
  'biltix-contracts': 'Biltix — Contracts module', 'biltix-boq': 'Biltix — BoQ/BoM', 'biltix-schedule': 'Biltix — Schedule',
  'biltix-site-reports': 'Biltix — Site reports', 'biltix-cost': 'Biltix — Cost and budget', 'biltix-images': 'Biltix — Photos and media',
  'feed-commodities': 'Commodity price indices', 'feed-fx-sama': 'Exchange rates — Saudi Central Bank (SAMA)', 'feed-weather-ncm': 'National Center for Meteorology',
  'feed-gis': 'GIS layers (General Authority for Survey and Geospatial Information)',
});

/** Source-system names used in AI-risk evidence and validation sources. */
export const SOURCE_SYSTEM_EN = Object.freeze({
  'Biltix — العقود': 'Biltix — Contracts', 'Biltix — تقارير الموقع': 'Biltix — Site reports', 'Biltix — التكلفة': 'Biltix — Cost',
  'Biltix — الصور': 'Biltix — Photos', 'بوابة الحساسات': 'Sensor gateway', 'المركز الوطني للأرصاد': 'National Center for Meteorology',
  'مؤشرات السلع': 'Commodity indices', 'أسعار الصرف': 'Exchange rates', 'Primavera P6': 'Primavera P6', 'Autodesk APS': 'Autodesk APS', 'Oracle ERP': 'Oracle ERP',
  'Biltix — العقود ': 'Biltix — Contracts', 'Biltix — BoQ/BoM': 'Biltix — BoQ/BoM', 'Biltix — الجدول الزمني': 'Biltix — Schedule',
  'Biltix — التكلفة والميزانية': 'Biltix — Cost and budget', 'Primavera P6 EPPM': 'Primavera P6 EPPM', 'Autodesk APS (BIM)': 'Autodesk APS (BIM)',
  'أسعار الصرف (ساما)': 'Exchange rates (SAMA)', 'بوابة الحساسات (MQTT)': 'Sensor gateway (MQTT)',
});

export const PERMIT_TYPE_EN = Object.freeze({
  'أعمال ساخنة': 'Hot work', 'أماكن مغلقة': 'Confined space', 'العمل على ارتفاع': 'Work at height', 'عزل كهربائي': 'Electrical isolation',
  'حفريات': 'Excavation', 'رفع ثقيل': 'Heavy lift', 'أعمال ليلية': 'Night work',
});
export const INSPECTION_TYPE_EN = Object.freeze({
  'جولة سلامة': 'Safety walk', 'تفتيش معدات': 'Equipment inspection', 'تدقيق داخلي': 'Internal audit', 'تفتيش سقالات': 'Scaffold inspection',
  'فحص رافعات': 'Crane inspection', 'تفتيش كهرباء': 'Electrical inspection',
});
export const INCIDENT_TYPE_EN = Object.freeze({
  'إصابة مضيعة للوقت': 'Lost-time injury', 'إصابة تتطلب علاجاً طبياً': 'Medical-treatment injury', 'إسعافات أولية': 'First aid',
  'حادث وشيك': 'Near miss', 'تلف ممتلكات': 'Property damage', 'حادث بيئي': 'Environmental incident',
});
export const RISK_TIER_EN = Object.freeze({ 'منخفض': 'Low', 'متوسط': 'Medium', 'عالٍ': 'High', 'حرج': 'Critical' });
export const AI_STATUS_EN = Object.freeze({ 'مكتشف': 'Detected', 'تنبيه': 'Alerted', 'مهمة مُسندة': 'Task assigned', 'قيد المعالجة': 'In treatment', 'مغلق': 'Closed', 'مُتجاوز': 'Dismissed' });
export const TASK_STATUS_EN = Object.freeze({ 'جديدة': 'New', 'قيد التنفيذ': 'In progress', 'متأخرة': 'Overdue', 'مغلقة': 'Closed' });
export const RATING_EN = Object.freeze({ red: 'Red', yellow: 'Amber', green: 'Green' });
export const PIPELINE_EN = Object.freeze({
  'contract-nlp': 'Contract NLP engine', 'bom-forecast': 'BoM forecasting engine', 'schedule-model': 'Schedule model',
  'site-ai': 'Site AI (photos and reports)', 'cost-forecast': 'Cost forecasting engine',
});
export const CHANNEL_EN = Object.freeze({ email: 'email', slack: 'Slack', teams: 'Teams', whatsapp: 'WhatsApp' });
export const EFFORT_EN = Object.freeze({ 'منخفض': 'Low', 'متوسط': 'Medium', 'عالٍ': 'High' });

/** People who appear as owners, approvers and inspectors in generated sentences. */
export const PERSON_EN = Object.freeze({
  'م. خالد العتيبي': 'Eng. Khalid Al-Otaibi', 'م. سارة القحطاني': 'Eng. Sarah Al-Qahtani', 'م. نورة الزهراني': 'Eng. Noura Al-Zahrani',
  'م. عمر باجابر': 'Eng. Omar Bajaber', 'م. فهد الشمري': 'Eng. Fahad Al-Shammari', 'م. لمى العنزي': 'Eng. Lama Al-Anazi',
  'م. عبدالله الدوسري': 'Eng. Abdullah Al-Dosari', 'م. مها الغامدي': 'Eng. Maha Al-Ghamdi', 'م. ريم السبيعي': 'Eng. Reem Al-Subaie',
  'م. تركي المطيري': 'Eng. Turki Al-Mutairi', 'م. ماجد الأنصاري': 'Eng. Majed Al-Ansari', 'م. هند الحربي': 'Eng. Hind Al-Harbi',
  'م. سلطان الرشيدي': 'Eng. Sultan Al-Rashidi', 'م. يوسف الشهراني': 'Eng. Yousef Al-Shahrani', 'م. سامي الحازمي (مفتش خارجي معتمد)': 'Eng. Sami Al-Hazmi (certified external inspector)',
  'م. بدر الجهني': 'Eng. Badr Al-Juhani', 'ناصر العمري': 'Nasser Al-Omari', 'وليد الصاعدي': 'Waleed Al-Saadi',
  'أ. فيصل الحربي — المستشار القانوني': 'Faisal Al-Harbi — Legal Counsel', 'أ. نوف السديري — مديرة المالية': 'Nouf Al-Sudairi — Finance Director',
  'م. بدر القرني — مدير المشتريات': 'Eng. Badr Al-Qarni — Procurement Manager', 'م. هيا الدوسري — مكتب إدارة المشاريع': 'Eng. Haya Al-Dosari — PMO',
  'م. سعود الحارثي — مدير التخطيط': 'Eng. Saud Al-Harthi — Planning Manager',
  'أ. فيصل الحربي': 'Faisal Al-Harbi', 'أ. نوف السديري': 'Nouf Al-Sudairi', 'م. بدر القرني': 'Eng. Badr Al-Qarni', 'م. هيا الدوسري': 'Eng. Haya Al-Dosari', 'م. سعود الحارثي': 'Eng. Saud Al-Harthi',
  'مدير المشروع': 'Project manager', 'النظام': 'System', 'محرك الذكاء الاصطناعي': 'AI engine', 'مسؤول جودة البيانات': 'Data-quality officer',
  'مهندس النماذج': 'Model engineer', 'المسؤول': 'Owner',
});

/* ── resolvers (always return English or a neutral code-based phrase, never Arabic) ── */

const ARABIC = /[؀-ۿ]/;

/** English for a stored value via `map`, else `fallback` (default: the value when it is not Arabic, else ''). */
export function en(map, value, fallback) {
  if (value == null || value === '') return fallback == null ? '' : fallback;
  const hit = map && Object.prototype.hasOwnProperty.call(map, value) ? map[value] : undefined;
  if (hit) return hit;
  if (fallback != null) return fallback;
  return ARABIC.test(String(value)) ? '' : String(value);
}

export function siteEn(site) {
  if (!site) return '';
  if (typeof site.nameEn === 'string' && site.nameEn) return site.nameEn;
  return SITE_EN[site.id] || site.code || String(site.id || '');
}
export function siteEnById(sites, id) {
  const site = Array.isArray(sites) ? sites.find((s) => s && s.id === id) : null;
  return site ? siteEn(site) : (SITE_EN[id] || '');
}
export function zoneEn(zone, site) {
  if (!zone) return '';
  if (typeof zone.nameEn === 'string' && zone.nameEn) return zone.nameEn;
  return ZONE_EN[zone.id] || `${site && site.code ? `${site.code} · ` : ''}zone ${String(zone.id || '').split('-').pop()}`;
}
export function personEn(name, fallback = '') {
  const v = String(name || '').trim();
  if (!v) return fallback;
  if (PERSON_EN[v]) return PERSON_EN[v];
  // "role — name" phrases (requesters): keep the name part when known.
  const parts = v.split(' — ');
  if (parts.length === 2 && PERSON_EN[parts[1]]) return PERSON_EN[parts[1]];
  return ARABIC.test(v) ? fallback : v;
}
/** Free text that may contain Arabic: returned only when it has none. */
export function latinOnly(text, fallback = '') {
  const v = String(text || '').trim();
  return v && !ARABIC.test(v) ? v : fallback;
}
export function hasArabic(text) {
  return ARABIC.test(String(text || ''));
}

export default {
  SITE_EN, ZONE_EN, CATEGORY_EN, COURSE_EN, SENSOR_KIND_EN, UNIT_EN, INTEGRATION_EN, SOURCE_SYSTEM_EN, PERMIT_TYPE_EN,
  INSPECTION_TYPE_EN, INCIDENT_TYPE_EN, RISK_TIER_EN, AI_STATUS_EN, TASK_STATUS_EN, RATING_EN, PIPELINE_EN, CHANNEL_EN,
  EFFORT_EN, PERSON_EN, en, siteEn, siteEnById, zoneEn, personEn, latinOnly, hasArabic,
};
