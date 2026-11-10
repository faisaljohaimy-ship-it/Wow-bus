/**
 * BILTIX Risk AI — i18n bridge for the shared UI layer (js/ui/*.js). Owner: A-UI.
 *
 * Registers the UI-layer dictionaries ('ui', 'charts', 'radar') with the i18n runtime at import time
 * (CONTRACT §4) and hands components a guarded `t` / `tn`: when js/core/i18n.js is unavailable or
 * incomplete, keys resolve from the local dictionaries (active <html lang>, then Arabic, then the key),
 * so a component never prints a raw key and never throws.
 *
 * Also exposes the reading direction helpers every component uses (`dir()`, `isRtl()`, `locale()`),
 * read at call time so a language switch (router re-mount) picks up the new direction.
 */
import { i18n } from '../core/i18n.js';
import uiDict from '../i18n/ui.js';
import chartsDict from '../i18n/charts.js';
import radarDict from '../i18n/radar.js';

const LOCAL = { ui: uiDict, charts: chartsDict, radar: radarDict };
const PLURALS = new Set(['zero', 'one', 'two', 'few', 'many', 'other']);
const hasApi = (name) => !!i18n && typeof i18n[name] === 'function';

if (hasApi('register')) {
  for (const [ns, dict] of Object.entries(LOCAL)) {
    try { i18n.register(ns, dict); } catch { /* the local fallback below still serves the strings */ }
  }
}

/** 'ar' | 'en' — from the runtime, else from <html lang>. */
export function lang() {
  if (hasApi('lang')) { try { const l = i18n.lang(); if (l === 'ar' || l === 'en') return l; } catch { /* fall through */ } }
  try { return String(document.documentElement.getAttribute('lang') || 'ar').toLowerCase().startsWith('en') ? 'en' : 'ar'; } catch { return 'ar'; }
}

/** 'rtl' | 'ltr' — the document direction wins (it is what the browser lays out). */
export function dir() {
  try {
    const d = document.documentElement.getAttribute('dir');
    if (d === 'rtl' || d === 'ltr') return d;
  } catch { /* no DOM */ }
  if (hasApi('dir')) { try { return i18n.dir() === 'ltr' ? 'ltr' : 'rtl'; } catch { /* fall through */ } }
  return lang() === 'en' ? 'ltr' : 'rtl';
}

export const isRtl = () => dir() === 'rtl';

/** BCP-47 locale for Intl APIs (collation, plural rules). */
export function locale() {
  if (hasApi('locale')) { try { return i18n.locale(); } catch { /* fall through */ } }
  return lang() === 'en' ? 'en-GB' : 'ar-SA';
}

function walk(node, parts) {
  let cur = node;
  for (const p of parts) {
    if (!cur || typeof cur !== 'object' || !Object.prototype.hasOwnProperty.call(cur, p)) return undefined;
    cur = cur[p];
  }
  return cur;
}

function localLookup(key, l) {
  const [ns, ...rest] = String(key || '').split('.');
  const dict = LOCAL[ns];
  if (!dict) return undefined;
  const own = walk(dict[l], rest);
  return own !== undefined ? own : walk(dict.ar, rest);
}

function interpolate(s, params) {
  if (!params) return String(s);
  return String(s).replace(/\{(\w+)\}/g, (whole, name) => (params[name] === undefined || params[name] === null ? whole : String(params[name])));
}

function pickPlural(obj, n, l) {
  if (!obj || typeof obj !== 'object' || !Object.keys(obj).every((k) => PLURALS.has(k))) return obj;
  if (n === 0 && obj.zero !== undefined) return obj.zero;
  let cat = 'other';
  try { cat = new Intl.PluralRules(l === 'en' ? 'en-GB' : 'ar-SA').select(n); } catch { cat = n === 1 ? 'one' : 'other'; }
  return obj[cat] ?? obj.other ?? Object.values(obj)[0];
}

/** Translate a UI-layer key ('ui.*', 'charts.*', 'radar.*'). Never throws, never returns undefined. */
export function t(key, params) {
  if (hasApi('t') && hasApi('has')) {
    try { if (i18n.has(key)) return i18n.t(key, params); } catch { /* local fallback */ }
  }
  const v = localLookup(key, lang());
  if (typeof v === 'string') return interpolate(v, params);
  return String(key ?? '');
}

/** Plural translation; {count} is formatted by the runtime (fmt-aware) or with Intl. */
export function tn(key, count, params) {
  if (hasApi('tn') && hasApi('has')) {
    try { if (i18n.has(key)) return i18n.tn(key, count, params); } catch { /* local fallback */ }
  }
  const l = lang();
  const n = Number(count);
  const v = pickPlural(localLookup(key, l), n, l);
  if (typeof v !== 'string') return String(key ?? '');
  let c = String(count ?? '');
  try { if (Number.isFinite(n)) c = new Intl.NumberFormat(`${l === 'en' ? 'en-GB' : 'ar-SA'}-u-nu-latn`).format(n); } catch { /* keep raw */ }
  return interpolate(v, { count: c, ...(params || {}) });
}

export const bridge = { t, tn, lang, dir, isRtl, locale };
export default bridge;
