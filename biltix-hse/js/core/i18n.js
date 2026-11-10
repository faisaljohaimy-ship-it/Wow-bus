/**
 * BILTIX Risk AI — internationalisation runtime (js/core/i18n.js)
 *
 * Contract: docs/specs/v3-precision/CONTRACT.md §4. Guide: docs/i18n.md.
 *
 *   i18n.lang()                 'ar' | 'en'   (settings.lang, default 'ar')
 *   i18n.dir()                  'rtl' | 'ltr'
 *   i18n.locale()               'ar-SA' | 'en-GB'   (fmt adds -u-nu-latn|arab and the calendar)
 *   i18n.setLang(lang)          → Promise. Persists store.setSettings({ lang }), sets html[lang][dir],
 *                               emits bus 'lang:change' { lang, dir }. The first switch to English
 *                               awaits the English data dictionaries (lazy, see loadData()).
 *   i18n.register(ns, dict)     dict = { ar: {…}, en: {…} } (nested objects allowed). Keys: 'ns.path.to.key'.
 *   i18n.t(key, params)         '{name}' interpolation; fallback: active → ar → key. Never throws.
 *   i18n.tn(key, count, params) plural object { zero, one, two, few, many, other } chosen with
 *                               Intl.PluralRules(lang); {count} is preformatted with fmt.num.
 *   i18n.has(key, lang?)        true when the key resolves in `lang` (default: active) or in Arabic.
 *   i18n.label(enumNs, value)   enum display: t(`enum.${enumNs}.${value}`) falling back to the value.
 *   i18n.registerData(ns, map)  map = { [recordId]: mirror }   (ns 'terms' = { arabic: english }).
 *   i18n.L(record, field, ns)   data value in the active language (en: original deep-merged with the
 *                               mirror; else record[field + 'En']; else the original). ar: original.
 *   i18n.localize(record, ns)   the whole record deep-merged with its mirror (en) — for views.
 *   i18n.term(str)              free repeated strings (people, organisations, roles, places).
 *   i18n.missing()              Set of 'lang:key' strings that fell back (diagnostics; no console output).
 *
 * Extras (documented in docs/i18n.md): i18n.loadData(), i18n.dataReady(), i18n.attach({ store }),
 * i18n.isRtl(), i18n.other(), i18n.pick({ ar, en }), i18n.setCountFormatter(fn), i18n.langs.
 *
 * Dependency-free except bus.js (no store / fmt import: fmt imports this module, and node tests can
 * import it). The initial language comes from <html lang> (set by the pre-paint script in index.html
 * from ?lang= or the saved settings) and is reconciled by app.js through i18n.attach().
 */

import { bus } from './bus.js';

export const LANGS = Object.freeze(['ar', 'en']);
const DIRS = Object.freeze({ ar: 'rtl', en: 'ltr' });
const LOCALES = Object.freeze({ ar: 'ar-SA', en: 'en-GB' });
const PLURAL_CATEGORIES = new Set(['zero', 'one', 'two', 'few', 'many', 'other']);
const PARAM_RE = /\{(\w+)\}/g;

/**
 * English data dictionaries (js/i18n/data/*.js, owner A-DATA-EN), imported on the first switch to
 * English only — Arabic sessions never download them. Each file:
 *   export default { <collection>: { <recordId>: <mirror> }, terms: { 'عربي': 'English' } }
 * Add a new file here when it lands (a missing path would surface as a 404 in the console).
 */
export const DATA_DICTIONARY_FILES = Object.freeze([
  /* filled from the files present in js/i18n/data/ — see docs/i18n.md §4 */
]);

/** @type {{ ar: Record<string, object>, en: Record<string, object> }} namespace → nested dictionary */
const dicts = { ar: Object.create(null), en: Object.create(null) };
/** @type {Record<string, Record<string, any>>} data namespace → recordId → mirror */
const dataDicts = Object.create(null);
/** @type {Map<string, string>} Arabic free term → English */
const terms = new Map();
const missingKeys = new Set();
const pluralRules = new Map();

let current = initialLang();
let attachedStore = null;
let countFormatter = null;
let dataPromise = null;
let dataLoaded = DATA_DICTIONARY_FILES.length === 0;
let switchToken = 0;

/* ────────────────────────────── helpers ────────────────────────────── */

function normLang(value) {
  const v = String(value || '').trim().toLowerCase().slice(0, 2);
  return LANGS.includes(v) ? v : null;
}

function initialLang() {
  try {
    if (typeof document !== 'undefined' && document.documentElement) {
      const fromHtml = normLang(document.documentElement.getAttribute('lang'));
      if (fromHtml) return fromHtml;
    }
  } catch { /* no DOM (node) */ }
  return 'ar';
}

const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v)
  && (Object.getPrototypeOf(v) === Object.prototype || Object.getPrototypeOf(v) === null);
const UNSAFE = new Set(['__proto__', 'constructor', 'prototype']);

/** Deep merge for dictionaries: objects merge key-wise, everything else replaces. */
function mergeDict(target, patch) {
  if (!isPlainObject(patch)) return target;
  const out = isPlainObject(target) ? target : Object.create(null);
  for (const [key, value] of Object.entries(patch)) {
    if (UNSAFE.has(key) || value === undefined) continue;
    out[key] = isPlainObject(value) && isPlainObject(out[key]) ? mergeDict(out[key], value) : (isPlainObject(value) ? mergeDict(Object.create(null), value) : value);
  }
  return out;
}

/**
 * Walk `parts` inside `node`. Segments may themselves contain dots (enum values such as
 * 'ISO 45001 §6.1'), so the longest matching joined segment wins at each level.
 */
function walk(node, parts, from = 0) {
  if (from >= parts.length) return node;
  if (!node || typeof node !== 'object') return undefined;
  for (let end = parts.length; end > from; end -= 1) {
    const key = end - from === 1 ? parts[from] : parts.slice(from, end).join('.');
    if (Object.prototype.hasOwnProperty.call(node, key)) {
      const found = walk(node[key], parts, end);
      if (found !== undefined) return found;
    }
  }
  return undefined;
}

function lookup(lang, key) {
  if (typeof key !== 'string' || !key) return undefined;
  const dot = key.indexOf('.');
  const ns = dot === -1 ? key : key.slice(0, dot);
  const root = dicts[lang] && dicts[lang][ns];
  if (root === undefined) return undefined;
  if (dot === -1) return root;
  return walk(root, key.slice(dot + 1).split('.'));
}

function isPluralObject(v) {
  return isPlainObject(v) && Object.keys(v).length > 0 && Object.keys(v).every((k) => PLURAL_CATEGORIES.has(k));
}

function interpolate(template, params) {
  const s = String(template);
  if (!params || typeof params !== 'object') return s;
  return s.replace(PARAM_RE, (whole, name) => {
    const v = params[name];
    return v === undefined || v === null ? whole : String(v);
  });
}

function rulesFor(lang) {
  let r = pluralRules.get(lang);
  if (!r) {
    try { r = new Intl.PluralRules(LOCALES[lang] || lang); } catch { r = { select: (n) => (n === 1 ? 'one' : 'other') }; }
    pluralRules.set(lang, r);
  }
  return r;
}

function formatCount(n) {
  if (typeof countFormatter === 'function') {
    try { return countFormatter(n); } catch { /* fall back below */ }
  }
  try { return new Intl.NumberFormat(`${LOCALES[current]}-u-nu-latn`).format(n); } catch { return String(n); }
}

function choosePlural(obj, lang, count) {
  if (!isPluralObject(obj)) return obj;
  const n = Number(count);
  if (!Number.isFinite(n)) return obj.other !== undefined ? obj.other : Object.values(obj)[0];
  if (n === 0 && obj.zero !== undefined) return obj.zero;
  let cat = 'other';
  try { cat = rulesFor(lang).select(n); } catch { cat = 'other'; }
  if (obj[cat] !== undefined) return obj[cat];
  if (obj.other !== undefined) return obj.other;
  return Object.values(obj)[0];
}

function noteMissing(lang, key) {
  if (missingKeys.size < 5000) missingKeys.add(`${lang}:${key}`);
}

/** Resolve a key to a raw value (string or plural object) in the active language, then Arabic. */
function resolve(key) {
  const own = lookup(current, key);
  if (own !== undefined && own !== null) return { value: own, lang: current };
  noteMissing(current, key);
  if (current !== 'ar') {
    const ar = lookup('ar', key);
    if (ar !== undefined && ar !== null) return { value: ar, lang: 'ar' };
    noteMissing('ar', key);
  }
  return null;
}

/* ── data mirrors ── */

/**
 * Deep-merge a translation mirror over an original value:
 * strings replace; objects merge key-wise; arrays merge index-wise (length of the original);
 * null / undefined in the mirror keep the original.
 */
export function mergeMirror(original, mirror) {
  if (mirror === undefined || mirror === null) return original;
  if (typeof mirror === 'string') return mirror === '' ? original : mirror;
  if (Array.isArray(mirror)) {
    if (!Array.isArray(original)) return original === undefined || original === null ? mirror.slice() : original;
    return original.map((item, i) => mergeMirror(item, mirror[i]));
  }
  if (isPlainObject(mirror)) {
    if (!isPlainObject(original) && !(original && typeof original === 'object' && !Array.isArray(original))) {
      return original === undefined || original === null ? { ...mirror } : original;
    }
    const out = { ...original };
    for (const [k, v] of Object.entries(mirror)) {
      if (UNSAFE.has(k)) continue;
      out[k] = mergeMirror(original[k], v);
    }
    return out;
  }
  return original;
}

function recordKey(record) {
  if (!record || typeof record !== 'object') return '_';
  if (record.id !== undefined && record.id !== null && record.id !== '') return String(record.id);
  return '_';
}

function mirrorFor(ns, record) {
  if (!ns) return undefined;
  const table = dataDicts[ns];
  if (!table) return undefined;
  return table[recordKey(record)];
}

/* ────────────────────────────── language application ────────────────────────────── */

function applyDocument(lang) {
  if (typeof document === 'undefined' || !document.documentElement) return;
  const root = document.documentElement;
  if (root.getAttribute('lang') !== lang) root.setAttribute('lang', lang);
  if (root.getAttribute('dir') !== DIRS[lang]) root.setAttribute('dir', DIRS[lang]);
}

function persist(lang) {
  const store = attachedStore || (typeof globalThis !== 'undefined' && globalThis.biltix && globalThis.biltix.store) || null;
  if (!store || typeof store.setSettings !== 'function') return;
  try {
    const saved = store.state && store.state.settings ? store.state.settings.lang : undefined;
    if (saved !== lang) store.setSettings({ lang });
  } catch { /* storage unavailable: the language still applies for this session */ }
}

function commit(lang, { silent = false } = {}) {
  const changed = lang !== current;
  current = lang;
  applyDocument(lang);
  persist(lang);
  if (changed && !silent) bus.emit('lang:change', { lang, dir: DIRS[lang] });
  return changed;
}

async function importDataFile(path) {
  const mod = await import(path);
  const dict = mod && (mod.default || mod.data || mod);
  if (!dict || typeof dict !== 'object') return 0;
  let count = 0;
  for (const [ns, map] of Object.entries(dict)) {
    if (!map || typeof map !== 'object') continue;
    if (ns === 'terms') { registerTerms(map); count += 1; continue; }
    i18n.registerData(ns, map);
    count += 1;
  }
  return count;
}

function registerTerms(map) {
  for (const [ar, en] of Object.entries(map || {})) {
    if (typeof en === 'string' && en && !UNSAFE.has(ar)) terms.set(ar, en);
  }
}

/* ────────────────────────────── public API ────────────────────────────── */

export const i18n = {
  langs: LANGS,

  /** @returns {'ar'|'en'} */
  lang() { return current; },

  /** @returns {'rtl'|'ltr'} */
  dir() { return DIRS[current]; },

  isRtl() { return current === 'ar'; },

  /** The other language (for the switch and "view in …" links). */
  other() { return current === 'ar' ? 'en' : 'ar'; },

  /** 'ar-SA' | 'en-GB' — numerals and calendar extensions are added by fmt. */
  locale(lang = current) { return LOCALES[lang] || LOCALES.ar; },

  /**
   * Switch the UI language. Resolves once the change is applied (immediately when the English data
   * dictionaries are already loaded or the target is Arabic). Concurrent calls: the last one wins.
   * @param {'ar'|'en'} lang
   * @returns {Promise<boolean>} true when the language changed
   */
  setLang(lang) {
    const next = normLang(lang);
    if (!next) return Promise.resolve(false);
    const token = ++switchToken;
    if (next === 'en' && !dataLoaded) {
      return i18n.loadData().then(() => (token === switchToken ? commit(next) : false));
    }
    return Promise.resolve(commit(next));
  },

  /**
   * Bind the store (persistence) and reconcile the language with the saved settings / URL.
   * Called once by app.js before the first render. Does not emit 'lang:change'.
   * @param {{ store?: object, lang?: string }} opts
   */
  attach({ store = null, lang = null } = {}) {
    if (store) attachedStore = store;
    const next = normLang(lang) || current;
    commit(next, { silent: true });
    return current;
  },

  /** Register a namespace: dict = { ar: {…}, en: {…} } — merged when the namespace already exists. */
  register(ns, dict) {
    if (typeof ns !== 'string' || !ns || ns.includes('.') || !dict || typeof dict !== 'object') return i18n;
    for (const lang of LANGS) {
      if (isPlainObject(dict[lang])) dicts[lang][ns] = mergeDict(dicts[lang][ns], dict[lang]);
    }
    return i18n;
  },

  /** Translate a key; '{name}' placeholders are replaced from params. Never throws. */
  t(key, params) {
    try {
      const hit = resolve(key);
      if (!hit) return String(key ?? '');
      let value = hit.value;
      if (isPluralObject(value)) value = choosePlural(value, hit.lang, params && typeof params.count === 'number' ? params.count : NaN);
      if (typeof value !== 'string') return typeof value === 'number' ? String(value) : String(key);
      return interpolate(value, params);
    } catch {
      return String(key ?? '');
    }
  },

  /** Plural translation: the dictionary value is { zero, one, two, few, many, other }. */
  tn(key, count, params) {
    try {
      const n = Number(count);
      const hit = resolve(key);
      if (!hit) return String(key ?? '');
      const value = choosePlural(hit.value, hit.lang, n);
      if (typeof value !== 'string') return String(key);
      return interpolate(value, { count: Number.isFinite(n) ? formatCount(n) : String(count ?? ''), ...(params || {}) });
    } catch {
      return String(key ?? '');
    }
  },

  /** True when the key resolves in `lang` (default: active language) or in Arabic. */
  has(key, lang) {
    const target = normLang(lang) || current;
    const v = lookup(target, key);
    if (v !== undefined && v !== null) return true;
    if (lang) return false;
    const ar = lookup('ar', key);
    return ar !== undefined && ar !== null;
  },

  /** Enum display label (stored enum values stay Arabic / codes; display goes through the dictionary). */
  label(enumNs, value) {
    if (value === undefined || value === null || value === '') return '';
    const raw = String(value);
    const key = `enum.${enumNs}.${raw}`;
    const own = lookup(current, key);
    if (typeof own === 'string') return own;
    if (current !== 'ar') {
      noteMissing(current, key);
      // English without a translation: an English stored value (red, connected …) reads better than an Arabic label.
      if (!/[؀-ۿ]/.test(raw)) return raw;
    }
    const ar = lookup('ar', key);
    return typeof ar === 'string' ? ar : raw;
  },

  /** Register English data mirrors for a collection (merged record by record). */
  registerData(ns, map) {
    if (typeof ns !== 'string' || !ns || !map || typeof map !== 'object') return i18n;
    if (ns === 'terms') { registerTerms(map); return i18n; }
    const table = dataDicts[ns] || (dataDicts[ns] = Object.create(null));
    for (const [id, mirror] of Object.entries(map)) {
      if (UNSAFE.has(id) || mirror === undefined || mirror === null) continue;
      table[id] = table[id] === undefined ? mirror : mergeMirror(table[id], mirror);
    }
    return i18n;
  },

  /** A data field in the active language (see contract §4). */
  L(record, field, ns) {
    if (!record || typeof record !== 'object') return record;
    const original = record[field];
    if (current === 'ar') return original;
    const mirror = mirrorFor(ns, record);
    if (mirror && typeof mirror === 'object' && mirror[field] !== undefined && mirror[field] !== null) {
      return mergeMirror(original, mirror[field]);
    }
    const en = record[`${field}En`];
    if (en !== undefined && en !== null && en !== '') return en;
    if (typeof original === 'string') {
      const termed = terms.get(original) ?? terms.get(original.trim());
      if (termed) return termed;
    }
    return original;
  },

  /** Whole record in the active language (en: deep-merged with its mirror; '<field>En' fields applied). */
  localize(record, ns) {
    if (!record || typeof record !== 'object' || current === 'ar') return record;
    let out = record;
    const mirror = mirrorFor(ns, record);
    if (mirror && typeof mirror === 'object') out = mergeMirror(record, mirror);
    let copied = out !== record;
    for (const key of Object.keys(record)) {
      if (key.length <= 2 || !key.endsWith('En')) continue;
      const base = key.slice(0, -2);
      const en = record[key];
      if (typeof en !== 'string' || !en) continue;
      if (mirror && mirror[base] !== undefined) continue;
      if (!copied) { out = { ...record }; copied = true; }
      out[base] = en;
    }
    return out;
  },

  /** Repeated free strings (people, organisations, authorities, roles, places). */
  term(str) {
    if (current === 'ar' || typeof str !== 'string' || !str) return str;
    return terms.get(str) ?? terms.get(str.trim()) ?? str;
  },

  /** Pick from an inline { ar, en } pair (for one-off strings that live with their data). */
  pick(pair) {
    if (!pair || typeof pair !== 'object') return pair;
    return pair[current] ?? pair.ar ?? pair.en ?? '';
  },

  /** Diagnostics: 'lang:key' strings that were looked up but not found. */
  missing() { return missingKeys; },

  /** Import every English data dictionary once (no-op when already loaded). */
  loadData() {
    if (dataLoaded) return Promise.resolve(true);
    if (!dataPromise) {
      dataPromise = Promise.allSettled(DATA_DICTIONARY_FILES.map((p) => importDataFile(new URL(p, import.meta.url).href)))
        .then(() => { dataLoaded = true; return true; });
    }
    return dataPromise;
  },

  /** True when the English data dictionaries are in memory. */
  dataReady() { return dataLoaded; },

  /** fmt registers fmt.num here so {count} follows the numerals setting (avoids an import cycle). */
  setCountFormatter(fn) { countFormatter = typeof fn === 'function' ? fn : null; },

  /** Introspection for tests and the translation guide. */
  namespaces() { return Object.keys(dicts.ar).concat(Object.keys(dicts.en).filter((n) => !(n in dicts.ar))); },
  dataNamespaces() { return Object.keys(dataDicts); },
};

export const t = (key, params) => i18n.t(key, params);
export const tn = (key, count, params) => i18n.tn(key, count, params);
export const L = (record, field, ns) => i18n.L(record, field, ns);

export default i18n;
