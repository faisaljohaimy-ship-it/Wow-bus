/**
 * Biltix HSE — formatting helpers (js/core/fmt.js)
 *
 * Numerals-aware number / date / duration formatting for the Arabic UI.
 * Contract (ARCHITECTURE.md §4):
 *
 *   fmt.setNumerals('latn'|'arab')
 *   fmt.num(n, {maximumFractionDigits=0}={})
 *   fmt.compact(n)
 *   fmt.pct(n, digits=0)             // n already in 0..100
 *   fmt.signed(n, digits=0)          // "+3" / "−2" (U+2212 minus)
 *   fmt.date(iso, {style='medium'}={})
 *   fmt.dateTime(iso)
 *   fmt.time(iso)
 *   fmt.hijri(dateObj=new Date())
 *   fmt.relative(iso)
 *   fmt.duration(ms)
 *   fmt.dayName(iso)
 *
 * Locale strategy
 *   'latn' → 'ar-SA-u-nu-latn-ca-gregory'   (Arabic UI, Western digits, Gregorian)
 *   'arab' → 'ar-SA-u-ca-gregory'           (Arabic-Indic digits, Gregorian)
 *   hijri  → 'ar-SA-u-ca-islamic-umalqura' + the current numerals setting
 *
 * Every Intl call is guarded: if the host lacks a calendar/locale, a plain
 * deterministic fallback string is produced instead of throwing. Date-only ISO
 * strings ("2026-11-09") are parsed as LOCAL dates so they never shift a day in
 * western time zones. Side-effect free on import.
 */

const NUMERALS = Object.freeze({
  latn: 'ar-SA-u-nu-latn-ca-gregory',
  arab: 'ar-SA-u-ca-gregory',
});
const HIJRI_LOCALE = Object.freeze({
  latn: 'ar-SA-u-ca-islamic-umalqura-nu-latn',
  arab: 'ar-SA-u-ca-islamic-umalqura-nu-arab',
});
const RELATIVE_LOCALE = Object.freeze({
  latn: 'ar-SA-u-nu-latn',
  arab: 'ar-SA-u-nu-arab',
});

const ARABIC_INDIC_DIGITS = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'];
const MONTHS_AR = [
  'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
  'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر',
];
const WEEKDAYS_AR = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];

const MINUS = '−';
const EM_DASH = '—';
const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

let numerals = 'latn';

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

function locale() {
  return NUMERALS[numerals] || NUMERALS.latn;
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
 * - Date instances are returned as-is (a copy).
 * - Numbers are treated as epoch milliseconds.
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
    const dd = d.getDate();
    const mm = MONTHS_AR[d.getMonth()];
    const yy = d.getFullYear();
    switch (style) {
      case 'short': return `${dd} ${mm}`;
      case 'long':
      case 'full': return `${WEEKDAYS_AR[d.getDay()]}، ${dd} ${mm} ${yy}`;
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

const UNIT_AR = Object.freeze({
  second: 'ثانية',
  minute: 'دقيقة',
  hour: 'ساعة',
  day: 'يوم',
});

function fallbackRelative(value, unit) {
  if (value === 0) return 'الآن';
  const n = Math.abs(value);
  const word = UNIT_AR[unit];
  return value < 0 ? `قبل ${localizeDigits(n)} ${word}` : `خلال ${localizeDigits(n)} ${word}`;
}

export const fmt = {
  /**
   * Switch the numeral system used by every formatter.
   * @param {'latn'|'arab'} system
   */
  setNumerals(system) {
    numerals = system === 'arab' ? 'arab' : 'latn';
  },

  /** @returns {'latn'|'arab'} the active numeral system */
  getNumerals() {
    return numerals;
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
   * Compact notation (Arabic: "1.2 ألف", "4.5 مليون").
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
      if (abs >= 1e9) return `${sign}${fallbackNumber(abs / 1e9, 1)} مليار`;
      if (abs >= 1e6) return `${sign}${fallbackNumber(abs / 1e6, 1)} مليون`;
      return `${sign}${fallbackNumber(abs / 1e3, 1)} ألف`;
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
   * Gregorian date with Arabic month names.
   * styles: 'short' → "9 نوفمبر" · 'medium' → "9 نوفمبر 2026" ·
   *         'long'/'full' → "الاثنين، 9 نوفمبر 2026" · 'numeric' → "09/11/2026"
   * @param {string|Date|number} iso
   * @param {{style?: 'short'|'medium'|'long'|'full'|'numeric'}} [opts]
   */
  date(iso, { style = 'medium' } = {}) {
    const d = toDate(iso);
    if (!d) return EM_DASH;
    const options = DATE_STYLES[style] || DATE_STYLES.medium;
    return formatDateParts(d, options, fallbackDate(style));
  },

  /**
   * Date + 24h time → "9 نوفمبر 2026، 14:20".
   * @param {string|Date|number} iso
   */
  dateTime(iso) {
    const d = toDate(iso);
    if (!d) return EM_DASH;
    return `${fmt.date(d)}، ${fmt.time(d)}`;
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
      ? { hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }
      : { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' };
    return formatDateParts(d, options, (x) => (
      seconds
        ? `${pad2(x.getHours())}:${pad2(x.getMinutes())}:${pad2(x.getSeconds())}`
        : `${pad2(x.getHours())}:${pad2(x.getMinutes())}`
    ));
  },

  /**
   * Umm al-Qura Hijri date → "18 جمادى الأولى 1448هـ".
   * @param {Date|string|number} [dateObj=new Date()]
   */
  hijri(dateObj = new Date()) {
    const d = toDate(dateObj);
    if (!d) return EM_DASH;
    const hijriLocale = HIJRI_LOCALE[numerals] || HIJRI_LOCALE.latn;
    try {
      const parts = cached('date', hijriLocale, { day: 'numeric', month: 'long', year: 'numeric' })
        .formatToParts(d);
      const pick = (type) => (parts.find((p) => p.type === type) || {}).value || '';
      const day = pick('day');
      const month = pick('month');
      const year = pick('year');
      if (day && month && year) return `${day} ${month} ${year}هـ`;
      return cached('date', hijriLocale, { day: 'numeric', month: 'long', year: 'numeric' }).format(d);
    } catch {
      // Host without the Umm al-Qura calendar: fall back to the Gregorian date.
      return fmt.date(d);
    }
  },

  /**
   * Human relative time → "قبل 3 دقائق" / "خلال 45 دقيقة" / "الآن" / "أمس".
   * @param {string|Date|number} iso
   * @param {Date|number} [now=Date.now()] reference instant (injectable for tests)
   */
  relative(iso, now = Date.now()) {
    const d = toDate(iso);
    if (!d) return EM_DASH;
    const ref = toDate(now) || new Date();
    const { unit, value } = relativeUnit(d.getTime() - ref.getTime());
    // Anything within ±10 seconds reads as "now" rather than "قبل 4 ثوانٍ".
    const v = unit === 'second' && Math.abs(value) < 10 ? 0 : value;
    try {
      return cached('relative', RELATIVE_LOCALE[numerals] || RELATIVE_LOCALE.latn, { numeric: 'auto' })
        .format(v, unit);
    } catch {
      return fallbackRelative(v, unit);
    }
  },

  /**
   * Countdown-style duration:
   *   ≥ 1 day  → "2ي 5س"     ≥ 1 hour → "5س 12د"
   *   ≥ 1 min  → "45د"       < 1 min  → "30ث"
   *   negative → "منتهٍ"
   * @param {number} ms
   */
  duration(ms) {
    if (!isFiniteNumber(ms)) return EM_DASH;
    if (ms < 0) return 'منتهٍ';
    const total = Math.floor(ms / SECOND);
    const days = Math.floor(total / 86400);
    const hours = Math.floor((total % 86400) / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    const seconds = total % 60;
    const n = (x) => formatNumber(x, { maximumFractionDigits: 0 });
    if (days > 0) return `${n(days)}ي ${n(hours)}س`;
    if (hours > 0) return `${n(hours)}س ${n(minutes)}د`;
    if (minutes > 0) return `${n(minutes)}د`;
    return `${n(seconds)}ث`;
  },

  /**
   * Arabic weekday name → "الاثنين".
   * @param {string|Date|number} iso
   */
  dayName(iso) {
    const d = toDate(iso);
    if (!d) return EM_DASH;
    return formatDateParts(d, { weekday: 'long' }, (x) => WEEKDAYS_AR[x.getDay()]);
  },

  /** Parse helper re-exported on the object for convenience (see `toDate`). */
  toDate,
};

export default fmt;
