/**
 * BILTIX Risk AI — formatting helpers (js/core/fmt.js)
 *
 * Language-aware (i18n.locale(): 'ar-SA' | 'en-GB') and numerals-aware ('latn' | 'arab', chosen
 * independently of the language) number / date / currency / duration formatting.
 * Contract: ARCHITECTURE.md §4 (every export and signature kept) + v3 CONTRACT §4:
 *
 *   fmt.setNumerals('latn'|'arab') · fmt.getNumerals()
 *   fmt.locale()                     // full Intl locale in use, e.g. 'en-GB-u-nu-latn-ca-gregory'
 *   fmt.num(n, {maximumFractionDigits=0, minimumFractionDigits=0}={})
 *   fmt.compact(n)                   // "1.2K" / "4.5m" (en) · "1.2 ألف" / "4.5 مليون" (ar)
 *   fmt.currency(n, {compact=false, digits=0}={})   // SAR: "SAR 12,500,000" · "‏12,500,000 ر.س.‏"
 *   fmt.pct(n, digits=0)             // n already in 0..100
 *   fmt.signed(n, digits=0)          // "+3" / "−2" (U+2212 minus)
 *   fmt.signedPct(n, digits=0)
 *   fmt.parseSigned(str)
 *   fmt.digits(text)                 // ASCII digits inside free text → active numeral system
 *   fmt.date(iso, {style='medium'}={})   // 'short' | 'medium' | 'long' | 'full' | 'numeric'
 *   fmt.dateTime(iso) · fmt.time(iso, {seconds=false}={})
 *   fmt.hijri(dateObj=new Date())    // "30 جمادى الأولى 1448 هـ" · "30 Jumada I 1448 AH"
 *   fmt.relative(iso, now=Date.now())    // "قبل 3 دقائق" · "3 minutes ago"
 *   fmt.duration(ms, {style='short'|'long'}={})   // "٥ س ١٢ د" · "5h 12m" · "5 hours 12 minutes"
 *   fmt.dayName(iso)
 *   fmt.toDate(value)
 *
 * Every Intl call is guarded: if the host lacks a calendar/locale, a deterministic fallback string
 * is produced instead of throwing. Date-only ISO strings ("2026-11-09") are parsed as LOCAL dates
 * so they never shift a day in western time zones.
 *
 * Time zone policy (one rule for every screen): instants are shown in Asia/Riyadh (fmt.timeZone,
 * the sites' zone and the app-bar clock's). Calendar days — date-only strings, or a Date at local
 * midnight passed to date()/dayName() — are shown as that day, with no zone conversion. Side-effect free on import except registering
 * fmt.num as i18n's {count} formatter (keeps tn() numerals-aware without an import cycle).
 */

import { i18n } from './i18n.js';

const ARABIC_INDIC_DIGITS = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'];
/** Bidi control marks Intl may emit around signed numbers (LRM, RLM, ALM, embeddings, isolates). */
const BIDI_MARKS_RE = /[‎‏؜‪-‮⁦-⁩]/g;
/** Arabic-Indic (U+0660–0669) and Extended Arabic-Indic (U+06F0–06F9) digits → ASCII. */
const NON_ASCII_DIGIT_RE = /[٠-٩۰-۹]/g;

/** Arabic count words: [singular, dual, plural (3–10), singular-accusative (11+)]. */
const DURATION_WORDS_AR = Object.freeze({
  day: ['يوم', 'يومان', 'أيام', 'يوماً'],
  hour: ['ساعة', 'ساعتان', 'ساعات', 'ساعة'],
  minute: ['دقيقة', 'دقيقتان', 'دقائق', 'دقيقة'],
  second: ['ثانية', 'ثانيتان', 'ثوانٍ', 'ثانية'],
});
const DURATION_WORDS_EN = Object.freeze({
  day: ['day', 'days'], hour: ['hour', 'hours'], minute: ['minute', 'minutes'], second: ['second', 'seconds'],
});
/** Compact unit letters for the countdown style ("٥ س ١٢ د" / "5h 12m"). */
const DURATION_LETTERS = Object.freeze({
  ar: { day: 'ي', hour: 'س', minute: 'د', second: 'ث' },
  en: { day: 'd', hour: 'h', minute: 'm', second: 's' },
});
const EXPIRED = Object.freeze({ ar: 'منتهٍ', en: 'Expired' });
const MONTHS = Object.freeze({
  ar: ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'],
  en: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
});
const WEEKDAYS = Object.freeze({
  ar: ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'],
  en: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
});
const UNIT_WORDS = Object.freeze({
  ar: { second: 'ثانية', minute: 'دقيقة', hour: 'ساعة', day: 'يوم' },
  en: { second: 'second', minute: 'minute', hour: 'hour', day: 'day' },
});
const COMPACT_FALLBACK = Object.freeze({
  ar: { b: 'مليار', m: 'مليون', k: 'ألف' },
  en: { b: 'bn', m: 'm', k: 'k' },
});
const HIJRI_ERA = Object.freeze({ ar: 'هـ', en: 'AH' });
const CURRENCY_FALLBACK = Object.freeze({ ar: 'ر.س', en: 'SAR' });

const MINUS = '−';
const EM_DASH = '—';
const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

let numerals = 'latn';

/** The product's reference time zone (fixed UTC+3, no DST). */
export const TIME_ZONE = 'Asia/Riyadh';
const TZ_OFFSET_MS = 3 * 3_600_000;
/** Wall-clock fields of an instant in Riyadh time, for the no-Intl fallbacks. */
function riyadhFields(d) {
  const z = new Date(d.getTime() + TZ_OFFSET_MS);
  return { y: z.getUTCFullYear(), m: z.getUTCMonth(), day: z.getUTCDate(), wd: z.getUTCDay(), h: z.getUTCHours(), min: z.getUTCMinutes(), s: z.getUTCSeconds() };
}
/** A calendar day rather than an instant: a date-only string, or a Date/number at local midnight. */
function isCalendarDay(value, d) {
  if (typeof value === 'string') return /^\d{4}-\d{2}-\d{2}$/.test(value.trim());
  return d.getHours() === 0 && d.getMinutes() === 0 && d.getSeconds() === 0 && d.getMilliseconds() === 0;
}
/** A local Date carrying the Riyadh calendar day/time of an instant (only for the no-Intl fallbacks). */
function riyadhAsLocal(d) {
  const z = riyadhFields(d);
  return new Date(z.y, z.m, z.day, z.h, z.min, z.s);
}
/**
 * What to hand Intl for a date: instants are read in Riyadh time; a calendar day is re-expressed as UTC
 * midnight of its own Y/M/D and formatted in UTC, so the host zone can never move it.
 * @returns {{ date: Date, options: object }}
 */
function zoned(options, value, d, forceInstant = false) {
  if (forceInstant || !isCalendarDay(value, d)) return { date: d, options: { ...options, timeZone: TIME_ZONE } };
  return { date: new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())), options: { ...options, timeZone: 'UTC' } };
}

/** Memoised Intl formatter instances keyed by constructor + locale + options. */
const cache = new Map();

function cached(kind, locale, options) {
  const key = `${kind}|${locale}|${JSON.stringify(options || {})}`;
  let instance = cache.get(key);
  if (instance) return instance;
  switch (kind) {
    case 'number': instance = new Intl.NumberFormat(locale, options); break;
    case 'date': instance = new Intl.DateTimeFormat(locale, options); break;
    case 'relative': instance = new Intl.RelativeTimeFormat(locale, options); break;
    default: throw new Error(`Unknown formatter kind: ${kind}`);
  }
  cache.set(key, instance);
  return instance;
}

/** Active UI language ('ar' | 'en'); defensive when i18n is unavailable. */
function lang() {
  try { return i18n.lang() === 'en' ? 'en' : 'ar'; } catch { return 'ar'; }
}

function baseLocale() {
  try { return i18n.locale(); } catch { return 'ar-SA'; }
}

/** Gregorian locale with the numbering system made explicit (independent of the language). */
function locale() {
  return `${baseLocale()}-u-nu-${numerals}-ca-gregory`;
}
function hijriLocale() {
  return `${baseLocale()}-u-ca-islamic-umalqura-nu-${numerals}`;
}
function plainLocale() {
  return `${baseLocale()}-u-nu-${numerals}`;
}

/** Convert ASCII digits in a string to the active numeral system (fallback paths only). */
function localizeDigits(text) {
  const s = String(text);
  if (numerals !== 'arab') return s;
  return s.replace(/[0-9]/g, (d) => ARABIC_INDIC_DIGITS[d.charCodeAt(0) - 48]);
}

function pad2(n) {
  return String(n).padStart(2, '0');
}

function isFiniteNumber(n) {
  return typeof n === 'number' && Number.isFinite(n);
}

/**
 * Parse anything date-like into a Date.
 * - Date instances are returned as a copy; numbers are epoch milliseconds.
 * - "YYYY-MM-DD" is parsed as a LOCAL calendar date (no UTC shift).
 * - Any other string goes through the Date constructor (full ISO with offset).
 * Returns null for invalid input.
 */
export function toDate(value) {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : new Date(value.getTime());
  if (typeof value === 'number') {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  if (typeof value !== 'string' || value.length === 0) return null;
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (dateOnly) {
    const d = new Date(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3]));
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Plain-number fallback with thousands separators (used only when Intl fails). */
function fallbackNumber(n, maximumFractionDigits) {
  const fixed = Math.abs(n).toFixed(Math.max(0, Math.min(20, maximumFractionDigits)));
  const [intPart, fracPart] = fixed.split('.');
  const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const frac = fracPart ? fracPart.replace(/0+$/, '') : '';
  const body = frac ? `${grouped}.${frac}` : grouped;
  return localizeDigits((n < 0 ? MINUS : '') + body);
}

function formatNumber(n, options) {
  try {
    return cached('number', locale(), options).format(n);
  } catch {
    return fallbackNumber(n, options.maximumFractionDigits ?? 0);
  }
}

function formatDateParts(date, options, fallback) {
  try {
    return cached('date', locale(), options).format(date);
  } catch {
    return localizeDigits(fallback(date));
  }
}

const DATE_STYLES = Object.freeze({
  short: { day: 'numeric', month: 'short' },
  medium: { day: 'numeric', month: 'long', year: 'numeric' },
  long: { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' },
  full: { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' },
  numeric: { day: '2-digit', month: '2-digit', year: 'numeric' },
});

function fallbackDate(style) {
  return (d) => {
    const L = lang();
    const dd = d.getDate();
    const mm = MONTHS[L][d.getMonth()];
    const yy = d.getFullYear();
    const comma = L === 'ar' ? '،' : ',';
    switch (style) {
      case 'short': return `${dd} ${L === 'en' ? mm.slice(0, 3) : mm}`;
      case 'long':
      case 'full': return `${WEEKDAYS[L][d.getDay()]}${comma} ${dd} ${mm} ${yy}`;
      case 'numeric': return `${pad2(dd)}/${pad2(d.getMonth() + 1)}/${yy}`;
      default: return `${dd} ${mm} ${yy}`;
    }
  };
}

/**
 * Pick the relative-time unit the way humans speak about elapsed time:
 * seconds under a minute, minutes under an hour, hours under a day, days beyond.
 */
function relativeUnit(deltaMs) {
  const abs = Math.abs(deltaMs);
  if (abs < MINUTE) return { unit: 'second', value: Math.round(deltaMs / SECOND) };
  if (abs < HOUR) return { unit: 'minute', value: Math.round(deltaMs / MINUTE) };
  if (abs < DAY) return { unit: 'hour', value: Math.round(deltaMs / HOUR) };
  return { unit: 'day', value: Math.round(deltaMs / DAY) };
}

function fallbackRelative(value, unit) {
  const L = lang();
  if (value === 0) return L === 'en' ? 'now' : 'الآن';
  const n = Math.abs(value);
  const word = UNIT_WORDS[L][unit];
  if (L === 'en') {
    const w = n === 1 ? word : `${word}s`;
    return value < 0 ? `${localizeDigits(n)} ${w} ago` : `in ${localizeDigits(n)} ${w}`;
  }
  return value < 0 ? `قبل ${localizeDigits(n)} ${word}` : `خلال ${localizeDigits(n)} ${word}`;
}

/** "يومان" / "٥ ساعات" / "١٢ دقيقة" — Arabic agreement for counted units. */
function countWordAr(n, unit, formatInt) {
  const words = DURATION_WORDS_AR[unit];
  if (n === 1) return words[0];
  if (n === 2) return words[1];
  if (n >= 3 && n <= 10) return `${formatInt(n)} ${words[2]}`;
  return `${formatInt(n)} ${words[3]}`;
}

/** "1 day" / "5 hours" */
function countWordEn(n, unit, formatInt) {
  const [one, many] = DURATION_WORDS_EN[unit];
  return `${formatInt(n)} ${n === 1 ? one : many}`;
}

export const fmt = {
  /**
   * Switch the numeral system used by every formatter (independent of the UI language).
   * @param {'latn'|'arab'} system
   */
  setNumerals(system) {
    numerals = system === 'arab' ? 'arab' : 'latn';
  },

  /** @returns {'latn'|'arab'} the active numeral system */
  getNumerals() {
    return numerals;
  },

  /** Full Intl locale in use for Gregorian dates and numbers, e.g. 'ar-SA-u-nu-latn-ca-gregory'. */
  locale() {
    return locale();
  },

  /**
   * Format a number with grouping.
   * @param {number} n
   * @param {{maximumFractionDigits?: number, minimumFractionDigits?: number}} [opts]
   */
  num(n, { maximumFractionDigits = 0, minimumFractionDigits = 0 } = {}) {
    if (!isFiniteNumber(n)) return EM_DASH;
    const minFrac = Math.min(minimumFractionDigits, maximumFractionDigits);
    return formatNumber(n, { maximumFractionDigits, minimumFractionDigits: minFrac });
  },

  /**
   * Compact notation ("1.2 ألف" / "4.5 مليون" · "1.2K" / "4.5m").
   * @param {number} n
   */
  compact(n) {
    if (!isFiniteNumber(n)) return EM_DASH;
    if (Math.abs(n) < 1000) return formatNumber(n, { maximumFractionDigits: 0 });
    try {
      return cached('number', locale(), { notation: 'compact', maximumFractionDigits: 1 }).format(n);
    } catch {
      const abs = Math.abs(n);
      const sign = n < 0 ? MINUS : '';
      const words = COMPACT_FALLBACK[lang()];
      const sep = lang() === 'ar' ? ' ' : '';
      if (abs >= 1e9) return `${sign}${fallbackNumber(abs / 1e9, 1)}${sep}${words.b}`;
      if (abs >= 1e6) return `${sign}${fallbackNumber(abs / 1e6, 1)}${sep}${words.m}`;
      return `${sign}${fallbackNumber(abs / 1e3, 1)}${sep}${words.k}`;
    }
  },

  /**
   * Saudi riyal amount → "SAR 12,500,000" / "SAR 12.5m" (en) · "‏12,500,000 ر.س.‏" / "‏12.5 مليون ر.س.‏" (ar).
   * @param {number} n
   * @param {{compact?: boolean, digits?: number}} [opts]
   */
  currency(n, { compact = false, digits = 0 } = {}) {
    if (!isFiniteNumber(n)) return EM_DASH;
    const options = compact && Math.abs(n) >= 1000
      ? { style: 'currency', currency: 'SAR', notation: 'compact', maximumFractionDigits: 1 }
      : { style: 'currency', currency: 'SAR', minimumFractionDigits: Math.min(digits, 2), maximumFractionDigits: Math.max(0, digits) };
    try {
      return cached('number', locale(), options).format(n).replace(/-/g, MINUS);
    } catch {
      const body = compact ? fmt.compact(n) : formatNumber(n, { maximumFractionDigits: digits });
      return lang() === 'en' ? `${CURRENCY_FALLBACK.en} ${body}` : `${body} ${CURRENCY_FALLBACK.ar}`;
    }
  },

  /**
   * Percentage where `n` is already in 0..100 → "87%" (Arabic-Indic: "٨٧٪").
   * @param {number} n
   * @param {number} [digits=0]
   */
  pct(n, digits = 0) {
    if (!isFiniteNumber(n)) return EM_DASH;
    const sign = numerals === 'arab' ? '٪' : '%';
    return `${formatNumber(n, { maximumFractionDigits: digits })}${sign}`;
  },

  /**
   * Signed number with an explicit "+" and a typographic minus (U+2212).
   * Zero renders without a sign. Bidi marks from Intl are preserved so the sign
   * stays on the correct side of the digits inside RTL text.
   * @param {number} n
   * @param {number} [digits=0]
   */
  signed(n, digits = 0) {
    if (!isFiniteNumber(n)) return EM_DASH;
    const rounded = Number(n.toFixed(digits));
    if (rounded === 0) return formatNumber(0, { maximumFractionDigits: digits });
    try {
      return cached('number', locale(), { signDisplay: 'exceptZero', maximumFractionDigits: digits })
        .format(rounded)
        .replace(/-/g, MINUS);
    } catch {
      const body = fallbackNumber(Math.abs(rounded), digits);
      return rounded > 0 ? `+${body}` : `${MINUS}${body}`;
    }
  },

  /**
   * Signed percentage → "+3%" / "−2%" ("+٣٪" with Arabic-Indic numerals); zero → "0%".
   * @param {number} n  already in percentage points
   * @param {number} [digits=0]
   */
  signedPct(n, digits = 0) {
    if (!isFiniteNumber(n)) return EM_DASH;
    const sign = numerals === 'arab' ? '٪' : '%';
    return `${fmt.signed(n, digits)}${sign}`;
  },

  /**
   * Parse a number rendered by fmt.signed / fmt.signedPct / fmt.num (or typed by a user) back
   * into a JS number: strips bidi marks, grouping separators, percent signs and whitespace,
   * maps Arabic-Indic digits and the Arabic decimal separator, understands U+2212 minus.
   * @param {string|number} str
   * @returns {number} NaN when nothing numeric is left
   */
  parseSigned(str) {
    if (typeof str === 'number') return str;
    if (str === null || str === undefined) return NaN;
    const cleaned = String(str)
      .replace(BIDI_MARKS_RE, '')
      .replace(NON_ASCII_DIGIT_RE, (d) => {
        const code = d.charCodeAt(0);
        return String(code >= 0x06f0 ? code - 0x06f0 : code - 0x0660);
      })
      .replace(/[٬,\s  ']/g, '') // Arabic & Latin thousands separators, spaces
      .replace(/٫/g, '.')                   // Arabic decimal separator
      .replace(/[−‒–]/g, '-')     // typographic minus / dashes
      .replace(/[%٪‰]/g, '')           // %, ٪, ‰
      .trim();
    if (!/^[+-]?(\d+\.?\d*|\.\d+)$/.test(cleaned)) return NaN;
    return Number(cleaned);
  },

  /**
   * Convert ASCII digits inside free text to the active numeral system (identity for 'latn').
   * Use for sentences assembled elsewhere (feed titles, seed copy) so the numerals setting holds.
   * @param {string} text
   */
  digits(text) {
    return localizeDigits(text == null ? '' : text);
  },

  /**
   * Gregorian date in the UI language.
   * styles: 'short' → "9 نوفمبر" / "9 Nov" · 'medium' → "9 نوفمبر 2026" / "9 November 2026" ·
   *         'long'/'full' → "الاثنين، 9 نوفمبر 2026" / "Monday 9 November 2026" · 'numeric' → "09/11/2026"
   * @param {string|Date|number} iso
   * @param {{style?: 'short'|'medium'|'long'|'full'|'numeric'}} [opts]
   */
  date(iso, { style = 'medium', instant = false } = {}) {
    const d = toDate(iso);
    if (!d) return EM_DASH;
    const z = zoned(DATE_STYLES[style] || DATE_STYLES.medium, iso, d, instant);
    const day = z.options.timeZone === TIME_ZONE ? riyadhAsLocal(d) : d; // local fields for the no-Intl fallback
    return formatDateParts(z.date, z.options, () => fallbackDate(style)(day));
  },

  /**
   * Date + 24h time → "9 نوفمبر 2026، 14:20" / "9 November 2026, 14:20".
   * @param {string|Date|number} iso
   */
  dateTime(iso) {
    const d = toDate(iso);
    if (!d) return EM_DASH;
    return `${fmt.date(d, { instant: true })}${lang() === 'ar' ? '،' : ','} ${fmt.time(d)}`;
  },

  /**
   * 24-hour clock "HH:MM". Accepts a full ISO string, a Date, or a bare "HH:MM" string.
   * Pass `{seconds:true}` for "HH:MM:SS" (app-bar live clock).
   * @param {string|Date|number} iso
   * @param {{seconds?: boolean}} [opts]
   */
  time(iso, { seconds = false } = {}) {
    if (typeof iso === 'string') {
      const bare = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(iso.trim());
      if (bare) {
        const hh = pad2(Number(bare[1]));
        const base = `${hh}:${bare[2]}`;
        return localizeDigits(seconds && bare[3] ? `${base}:${bare[3]}` : base);
      }
    }
    const d = toDate(iso);
    if (!d) return EM_DASH;
    const options = seconds
      ? { hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23', timeZone: TIME_ZONE }
      : { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: TIME_ZONE };
    return formatDateParts(d, options, (x) => {
      const z = riyadhFields(x);
      return seconds ? `${pad2(z.h)}:${pad2(z.min)}:${pad2(z.s)}` : `${pad2(z.h)}:${pad2(z.min)}`;
    });
  },

  /**
   * Umm al-Qura Hijri date in the UI language → "30 جمادى الأولى 1448 هـ" / "30 Jumada I 1448 AH".
   * @param {Date|string|number} [dateObj=new Date()]
   */
  hijri(dateObj = new Date()) {
    const d = toDate(dateObj);
    if (!d) return EM_DASH;
    try {
      const z = zoned({ day: 'numeric', month: 'long', year: 'numeric' }, dateObj, d);
      const formatter = cached('date', hijriLocale(), z.options);
      const parts = formatter.formatToParts(z.date);
      const pick = (type) => (parts.find((p) => p.type === type) || {}).value || '';
      const day = pick('day');
      const month = pick('month');
      const year = pick('year');
      if (day && month && year) return `${day} ${month} ${year} ${HIJRI_ERA[lang()]}`;
      return formatter.format(z.date);
    } catch {
      // Host without the Umm al-Qura calendar: fall back to the Gregorian date.
      return fmt.date(d);
    }
  },

  /**
   * Human relative time → "قبل 3 دقائق" / "3 minutes ago" · "الآن" / "now" · "أمس" / "yesterday".
   * @param {string|Date|number} iso
   * @param {Date|number} [now=Date.now()] reference instant (injectable for tests)
   */
  relative(iso, now = Date.now()) {
    const d = toDate(iso);
    if (!d) return EM_DASH;
    const ref = toDate(now) || new Date();
    const { unit, value } = relativeUnit(d.getTime() - ref.getTime());
    // Anything within ±10 seconds reads as "now".
    const v = unit === 'second' && Math.abs(value) < 10 ? 0 : value;
    try {
      return cached('relative', plainLocale(), { numeric: 'auto' }).format(v, unit);
    } catch {
      return fallbackRelative(v, unit);
    }
  },

  /**
   * Duration in two sizes (digits never glued to letters in Arabic):
   *   'short' (countdown chips): ar "٢ ي ٥ س" · "٥ س ١٢ د" · "٤٥ د" · "٣٠ ث" — en "2d 5h" · "5h 12m" · "45m" · "30s"
   *   'long':  ar "يومان و٥ ساعات" · "٥ ساعات و١٢ دقيقة" — en "2 days 5 hours" · "5 hours 12 minutes"
   *   negative → "منتهٍ" / "Expired"
   * @param {number} ms
   * @param {{style?: 'short'|'long'}} [opts]
   */
  duration(ms, { style = 'short' } = {}) {
    if (!isFiniteNumber(ms)) return EM_DASH;
    const L = lang();
    if (ms < 0) return EXPIRED[L];
    const total = Math.floor(ms / SECOND);
    const days = Math.floor(total / 86400);
    const hours = Math.floor((total % 86400) / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    const seconds = total % 60;
    const n = (x) => formatNumber(x, { maximumFractionDigits: 0 });
    const parts = days > 0 ? [['day', days], ['hour', hours]]
      : hours > 0 ? [['hour', hours], ['minute', minutes]]
        : minutes > 0 ? [['minute', minutes]]
          : [['second', seconds]];
    if (style === 'long') {
      const kept = parts.filter(([, v], i) => i === 0 || v > 0);
      if (L === 'en') return kept.map(([unit, v]) => countWordEn(v, unit, n)).join(' ');
      return kept.map(([unit, v]) => countWordAr(v, unit, n)).join(' و');
    }
    if (L === 'en') return parts.map(([unit, v]) => `${n(v)}${DURATION_LETTERS.en[unit]}`).join(' ');
    return parts.map(([unit, v]) => `${n(v)} ${DURATION_LETTERS.ar[unit]}`).join(' ');
  },

  /**
   * Weekday name in the UI language → "الاثنين" / "Monday".
   * @param {string|Date|number} iso
   */
  dayName(iso) {
    const d = toDate(iso);
    if (!d) return EM_DASH;
    const z = zoned({ weekday: 'long' }, iso, d);
    return formatDateParts(z.date, z.options, () => WEEKDAYS[lang()][z.options.timeZone === TIME_ZONE ? riyadhFields(d).wd : d.getDay()]);
  },

  /** Parse helper re-exported on the object for convenience (see `toDate`). */
  toDate,

  /** The reference time zone every instant is shown in ('Asia/Riyadh'). */
  timeZone: TIME_ZONE,
};

// tn() preformats {count} with fmt.num (numerals-aware) — registered here to avoid an import cycle.
try { i18n.setCountFormatter((n) => fmt.num(n, { maximumFractionDigits: Number.isInteger(n) ? 0 : 1 })); } catch { /* i18n unavailable */ }

export default fmt;
