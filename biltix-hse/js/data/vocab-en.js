/**
 * Biltix Risk AI — English names for generated records (js/data/vocab-en.js)
 *
 * The live engines (live.js, platform-live.js) and the store compose every runtime event and record in
 * BOTH languages at creation time (CONTRACT §8: `title/detail` + `titleEn/detailEn`, runtime records carry
 * `titleEn/…`). They cannot depend on the active UI language, so they resolve English names here.
 *
 * Single source of English: the data dictionaries (js/i18n/data/index.js — `{ <ns>: { <id>: mirror }, terms }`)
 * and the enum labels (js/i18n/enums.js — `en.enum.<ns>[storedValue]`). They are loaded with a NON-blocking
 * dynamic import started when this module is evaluated (boot is never delayed; `vocabReady` resolves when
 * they are in). Until then — or for a value the dictionaries do not cover — resolvers fall back to a neutral,
 * code-based phrase (site code, "zone 3", worker badge) and NEVER to Arabic text. The only hard-coded strings
 * below are the few the dictionaries do not have.
 *
 * No side effects beyond that one import; no DOM.
 */

let DATA = null;   // merged data dictionaries
let ENUM = null;   // enums.en.enum

/** Resolves (never rejects) once the dictionaries are available — or failed to load. */
export const vocabReady = Promise.all([
  import('../i18n/data/index.js').then((m) => { DATA = (m && m.default) || null; }).catch(() => {}),
  import('../i18n/enums.js').then((m) => { ENUM = (m && m.default && m.default.en && m.default.en.enum) || null; }).catch(() => {}),
]).then(() => Boolean(DATA || ENUM));

/** True when the dictionaries are loaded (diagnostics / tests). */
export function vocabLoaded() {
  return Boolean(DATA && ENUM);
}

/* Strings the dictionaries do not carry (engine phrasing units, actor roles of generated entries). */
const UNIT_FALLBACK = Object.freeze({ 'دقيقة': 'min', 'يومًا': 'days', 'بندًا': 'items', 'كم': 'km', 'مللي ثانية': 'ms', 'م.ث': 'ms' });
const ROLE_FALLBACK = Object.freeze({
  'مسؤول جودة البيانات': 'Data-quality officer', 'مهندس النماذج': 'Model engineer', 'المسؤول': 'Owner', 'مدير المشروع': 'Project manager',
  'النظام': 'System', 'محرك الذكاء الاصطناعي': 'AI engine',
});

const ARABIC = /[؀-ۿ]/;
const own = (obj, key) => (obj && key != null && Object.prototype.hasOwnProperty.call(obj, key) ? obj[key] : undefined);

export function hasArabic(text) {
  return ARABIC.test(String(text || ''));
}

/** Free text that may contain Arabic: returned only when it has none. */
export function latinOnly(text, fallback = '') {
  const v = String(text == null ? '' : text).trim();
  return v && !ARABIC.test(v) ? v : fallback;
}

/** Enum label in English (enums.en.enum[ns][value]); else `fallback`, else the value when it is not Arabic. */
export function enumEn(ns, value, fallback) {
  if (value == null || value === '') return fallback == null ? '' : fallback;
  const hit = own(ENUM && ENUM[ns], value);
  if (typeof hit === 'string' && hit) return hit;
  if (fallback != null) return fallback;
  return ARABIC.test(String(value)) ? '' : String(value);
}

/** A field of a record's English mirror (data[ns][id][field]) — '' when absent or not a string. */
export function dataEn(ns, id, field) {
  const v = own(own(DATA && DATA[ns], id), field);
  return typeof v === 'string' ? v : '';
}

export function siteEn(site) {
  if (!site) return '';
  if (typeof site.nameEn === 'string' && site.nameEn) return site.nameEn;
  return dataEn('sites', site.id, 'name') || site.code || String(site.id || '');
}

export function siteEnById(sites, id) {
  const site = Array.isArray(sites) ? sites.find((s) => s && s.id === id) : null;
  if (site) return siteEn(site);
  return dataEn('sites', id, 'name') || String(id || '');
}

/** Zone name from the sites mirror (zones are mirrored index-wise); fallback "<site code> · zone n". */
export function zoneEn(zone, site) {
  if (!zone) return '';
  if (typeof zone.nameEn === 'string' && zone.nameEn) return zone.nameEn;
  const zid = String(zone.id || '');
  const siteId = site ? site.id : zid.split('-')[0];
  let index = site && Array.isArray(site.zones) ? site.zones.findIndex((z) => z && z.id === zid) : -1;
  if (index < 0) { const m = /-Z(\d+)$/.exec(zid); index = m ? Number(m[1]) - 1 : -1; }
  const zones = own(own(DATA && DATA.sites, siteId), 'zones');
  const name = Array.isArray(zones) && index >= 0 && zones[index] ? zones[index].name : '';
  if (name) return name;
  const n = /-Z(\d+)$/.exec(zid);
  return `${site && site.code ? `${site.code} · ` : ''}zone ${n ? n[1] : zid}`;
}

/** People, organisations, roles (data.terms); "role — name" phrases resolve their parts. */
export function personEn(name, fallback = '') {
  const v = String(name == null ? '' : name).trim();
  if (!v) return fallback;
  const terms = DATA && DATA.terms;
  const hit = own(terms, v) || own(ROLE_FALLBACK, v);
  if (hit) return hit;
  const parts = v.split(' — ');
  if (parts.length === 2) {
    const a = own(terms, parts[0]) || own(ROLE_FALLBACK, parts[0]);
    const b = own(terms, parts[1]);
    if (a && b) return `${a} — ${b}`;
    if (b) return b;
  }
  return ARABIC.test(v) ? fallback : v;
}

/** Worker: English name from the workers mirror, else the badge code (never the Arabic name). */
export function workerEn(worker) {
  if (!worker) return '';
  return dataEn('workers', worker.id, 'name') || worker.badge || String(worker.id || '');
}

export function courseEn(course) {
  if (!course) return '';
  return dataEn('courses', course.id, 'name') || enumEn('course', course.id) || enumEn('course', course.name) || String(course.code || course.id || '');
}

/** Integration (Part A) or platform connector name by id. */
export function integrationEn(idOrRecord) {
  const id = idOrRecord && typeof idOrRecord === 'object' ? idOrRecord.id : idOrRecord;
  const name = idOrRecord && typeof idOrRecord === 'object' ? idOrRecord.name : '';
  return dataEn('integrations', id, 'name') || dataEn('connectors', id, 'name') || latinOnly(name) || String(id || '');
}

export function sourceSystemEn(name) {
  const v = String(name || '');
  if (!v) return '';
  return enumEn('sourceSystem', v, '') || latinOnly(v, 'source system');
}

export function unitEn(unit) {
  const v = String(unit || '');
  if (!v) return '';
  return enumEn('unit', v, '') || own(UNIT_FALLBACK, v) || latinOnly(v);
}

export default {
  vocabReady, vocabLoaded, hasArabic, latinOnly, enumEn, dataEn, siteEn, siteEnById, zoneEn, personEn, workerEn, courseEn,
  integrationEn, sourceSystemEn, unitEn,
};
