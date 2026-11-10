/**
 * Biltix Risk AI — external data adapters (js/data/sources.js)
 *
 * Contract: docs/ARCHITECTURE.md §7.
 *
 *   sources.testConnection({type,url,apiKey,table}) → {ok, latencyMs, message}   (+ mapping: recognised columns)
 *   sources.importRisks({type,url,apiKey,table})    → {count, risks}   (+ skipped, warnings, ok, message, mapping)
 *
 * A probe or import only succeeds when the response is tabular risk data: HTML pages and
 * JavaScript bodies are rejected, and the header mapping must recognise the «الخطر» column
 * plus at least two other known columns (the detected mapping is reported in the message).
 *   sources.exportCSV(rows, columns, filename)        → csv string (and triggers a download in a browser)
 *   sources.exportJSON(obj, filename)                 → json string (and triggers a download)
 *   sources.downloadTemplateCSV()                     → csv string (risk-register import template, 3 example rows)
 *   sources.postWebhook(url, payload)                 → {ok, status}  (+ message, opaque)
 *   sources.buildReport(state, {range, siteId, now})  → {title, period, kpis, sections[]}
 *
 * Source types: 'json' (GET → array), 'sheets' (GET CSV → parse), 'supabase'
 * (GET `${url}/rest/v1/${table}?select=*&limit=N` with apikey + Bearer headers), 'webhook'
 * (POST ping). Every network call has an 8 s AbortController timeout, URLs must be https
 * (http is tolerated only for loopback hosts during local development), and every failure
 * resolves to a friendly Arabic message — nothing here ever rejects.
 *
 * Plain ES module, no dependencies, no side effects on import. The only DOM use is the
 * download helper (an <a download> click), guarded for non-browser hosts.
 */

import seed, { CATEGORIES, RISK_STATUS } from './seed.js';
import { sel } from '../core/selectors.js';
import { fmt } from '../core/fmt.js';

export const TIMEOUT_MS = 8000;
export const IMPORT_LIMIT = 1000;
export const ISO_TARGET = 85;

const DAY_MS = 86_400_000;
const LOOPBACK = new Set(['localhost', '127.0.0.1', '[::1]', '::1', '0.0.0.0']);
/** One product name everywhere (V19/RTL-25): the HSE module is a pillar of Biltix Risk AI. */
export const BRAND = Object.freeze({ product: 'بلتكس Risk AI', hseProduct: 'بلتكس HSE', pillar: 'ركيزة السلامة والصحة المهنية' });
const CONTROL_DEFAULT_TYPE = 'ضوابط إدارية';
const RISK_CLOSED = 'مغلق';

/* ────────────────────────────── messages ────────────────────────────── */

export const MESSAGES = Object.freeze({
  invalidUrl: 'الرابط غير صالح. يجب أن يبدأ بـ https:// (يُسمح بـ http فقط للخادم المحلي localhost).',
  timeout: 'انتهت مهلة الاتصال (8 ثوانٍ) دون استجابة من الخادم. تحقق من الرابط ومن توفر الخدمة.',
  network: 'تعذّر الوصول إلى الخادم. تحقق من الاتصال بالإنترنت ومن إعدادات CORS على الخادم المستهدف.',
  noFetch: 'هذا المتصفح لا يدعم الاتصال الشبكي (fetch). يرجى استخدام متصفح حديث.',
  notJson: 'الاستجابة ليست بصيغة JSON صالحة. تأكد أن الرابط يعيد مصفوفة سجلات.',
  notArray: 'الاستجابة لا تحتوي على مصفوفة سجلات. المتوقع مصفوفة JSON أو كائن يضم الحقل data أو items أو rows.',
  htmlNotCsv: 'استلمنا صفحة ويب بدل ملف CSV. في Google Sheets استخدم «ملف ← مشاركة ← النشر على الويب» بصيغة CSV ثم انسخ الرابط الناتج.',
  scriptNotCsv: 'استلمنا شيفرة برمجية (JavaScript) بدل ملف CSV. تأكد أن الرابط يشير إلى ملف CSV منشور وليس إلى صفحة أو سكربت.',
  jsonNotCsv: 'استلمنا استجابة JSON بدل ملف CSV. اختر نوع المصدر «JSON API» لهذا الرابط أو استخدم رابط التصدير بصيغة CSV.',
  htmlNotJson: 'استلمنا صفحة ويب (HTML) بدل استجابة JSON. تحقق من أن الرابط يشير إلى نقطة نهاية API تعيد JSON.',
  emptyCsv: 'ملف CSV فارغ أو لا يحتوي على صف عناوين.',
  unmappedColumns: 'تعذّر التعرف على أعمدة سجل المخاطر: يلزم عمود «الخطر» وعمودان معروفان آخران على الأقل (الموقع، الفئة، الاحتمالية، الشدة، المالك…).',
  supabaseTable: 'يلزم تحديد اسم الجدول في Supabase (مثال: risks).',
  supabaseKey: 'يلزم إدخال مفتاح API (anon key) للاتصال بـ Supabase.',
  unknownType: 'نوع المصدر غير مدعوم. الأنواع المتاحة: JSON API، Google Sheets CSV، Supabase، Webhook.',
  simulation: 'وضع المحاكاة لا يحتاج إلى اتصال خارجي — البيانات تُولَّد محليًا.',
  webhookOpaque: 'تم إرسال الطلب، لكن المتصفح لم يتمكن من قراءة الاستجابة بسبب سياسة CORS لدى الخدمة المستقبِلة (استجابة مبهمة).',
  noRows: 'لم يُعثر على أي صف يحتوي على وصف للخطر. تحقق من عناوين الأعمدة (الكود، الموقع، الفئة، الخطر…).',
});

function httpMessage(status) {
  if (status === 401 || status === 403) return `رُفض الوصول (HTTP ${status}). تحقق من مفتاح API والصلاحيات.`;
  if (status === 404) return 'المسار غير موجود (HTTP 404). تحقق من الرابط أو اسم الجدول.';
  if (status === 429) return 'تم تجاوز حد الطلبات المسموح (HTTP 429). حاول مرة أخرى بعد قليل.';
  if (status >= 500) return `الخادم يواجه خللاً داخليًا (HTTP ${status}). حاول لاحقًا.`;
  return `استجابة غير متوقعة من الخادم (HTTP ${status}).`;
}

const TYPE_LABELS = Object.freeze({
  json: 'JSON API',
  sheets: 'Google Sheets CSV',
  supabase: 'Supabase',
  webhook: 'Webhook',
  simulation: 'المحاكاة',
});

/* ────────────────────────────── small helpers ────────────────────────────── */

const arr = (v) => (Array.isArray(v) ? v : []);
const clamp = (n, min, max) => Math.min(max, Math.max(min, n));
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const text = (v) => (v == null ? '' : String(v).trim());
const nowMs = () => (typeof performance !== 'undefined' && typeof performance.now === 'function' ? performance.now() : Date.now());

function safeNum(n, digits = 0) {
  try { return fmt.num(n, { maximumFractionDigits: digits }); } catch { return String(n); }
}
function safePct(n, digits = 0) {
  try { return fmt.pct(n, digits); } catch { return `${n}%`; }
}
function safeDate(iso, style = 'medium') {
  try { return fmt.date(iso, { style }); } catch { return String(iso); }
}

const ARABIC_INDIC = '٠١٢٣٤٥٦٧٨٩';
const PERSIAN = '۰۱۲۳۴۵۶۷۸۹';
/** Normalise Arabic-Indic / Persian digits to ASCII. */
function latinDigits(s) {
  return String(s ?? '').replace(/[٠-٩۰-۹]/g, (ch) => {
    const a = ARABIC_INDIC.indexOf(ch);
    return String(a >= 0 ? a : PERSIAN.indexOf(ch));
  });
}

/** Arabic-aware text normalisation for header / enum matching. */
function norm(value) {
  return latinDigits(value)
    .replace(/^﻿/, '')
    .toLowerCase()
    .replace(/[ً-ْـ]/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .replace(/\(.*?\)/g, ' ')
    .replace(/[_\-./:*#]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Strip the definite article from each word ("الموقع" → "موقع"). */
function bare(value) {
  return norm(value).split(' ').map((w) => w.replace(/^(ال|لل)/, '')).join(' ').trim();
}

/* ────────────────────────────── URL validation ────────────────────────────── */

/** Returns a URL instance or null. https only; http only for loopback hosts. */
export function validateUrl(value) {
  const raw = text(value);
  if (!raw) return null;
  let url;
  try { url = new URL(raw); } catch { return null; }
  if (url.protocol === 'https:') return url;
  if (url.protocol === 'http:' && LOOPBACK.has(url.hostname)) return url;
  return null;
}

/** Google Sheets "edit" links are converted to the CSV export endpoint. */
function normalizeSheetsUrl(url) {
  const m = /^https:\/\/docs\.google\.com\/spreadsheets\/d\/([A-Za-z0-9_-]+)/.exec(url.href);
  if (!m) return url;
  if (/\/export\b|\/pub\b|output=csv|format=csv/.test(url.href)) return url;
  const gid = url.hash && /gid=(\d+)/.exec(url.hash) ? /gid=(\d+)/.exec(url.hash)[1] : url.searchParams.get('gid');
  const out = new URL(`https://docs.google.com/spreadsheets/d/${m[1]}/export`);
  out.searchParams.set('format', 'csv');
  if (gid) out.searchParams.set('gid', gid);
  return out;
}

function supabaseEndpoint(url, table, limit) {
  const base = url.href.replace(/\/rest\/v1\/?.*$/, '').replace(/\/+$/, '');
  const safeTable = text(table).replace(/[^A-Za-z0-9_.]/g, '');
  return `${base}/rest/v1/${encodeURIComponent(safeTable)}?select=*&limit=${limit}`;
}

/* ────────────────────────────── fetch with timeout ────────────────────────────── */

/**
 * fetch() wrapper: 8 s AbortController timeout, no throw. Resolves to
 * { ok, status, response|null, error:'timeout'|'network'|'nofetch'|null, latencyMs }.
 */
async function request(url, init = {}, timeoutMs = TIMEOUT_MS) {
  if (typeof fetch !== 'function') return { ok: false, status: 0, response: null, error: 'nofetch', latencyMs: 0 };
  const controller = typeof AbortController === 'function' ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
  const started = nowMs();
  try {
    const response = await fetch(url, { ...init, signal: controller ? controller.signal : undefined });
    return { ok: response.ok, status: response.status, response, error: null, latencyMs: Math.round(nowMs() - started) };
  } catch (err) {
    const aborted = err && (err.name === 'AbortError' || err.code === 20);
    return { ok: false, status: 0, response: null, error: aborted ? 'timeout' : 'network', latencyMs: Math.round(nowMs() - started), cause: err };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function failureMessage(result) {
  if (result.error === 'nofetch') return MESSAGES.noFetch;
  if (result.error === 'timeout') return MESSAGES.timeout;
  if (result.error === 'network') return MESSAGES.network;
  return httpMessage(result.status);
}

async function readText(response) {
  try { return await response.text(); } catch { return ''; }
}

function parseJsonText(body) {
  try { return { value: JSON.parse(body), error: null }; } catch { return { value: null, error: MESSAGES.notJson }; }
}

/** Extract an array of records from an arbitrary JSON payload. */
function recordsFromJson(value) {
  if (Array.isArray(value)) return rowsToObjects(value);
  if (!isObj(value)) return null;
  for (const key of ['data', 'items', 'rows', 'records', 'results', 'risks', 'values', 'result']) {
    if (Array.isArray(value[key])) return rowsToObjects(value[key]);
    if (isObj(value[key])) {
      const nested = recordsFromJson(value[key]);
      if (nested) return nested;
    }
  }
  const firstArray = Object.values(value).find((v) => Array.isArray(v));
  return firstArray ? rowsToObjects(firstArray) : null;
}

/** Arrays of arrays (e.g. Sheets API `values`) become objects keyed by the header row. */
function rowsToObjects(list) {
  if (!list.length) return [];
  if (list.every((row) => Array.isArray(row))) {
    const [headers, ...rows] = list;
    return rows.map((row) => Object.fromEntries(headers.map((hd, i) => [text(hd), row[i]])));
  }
  return list.filter(isObj);
}

/* ────────────────────────────── CSV ────────────────────────────── */

function detectDelimiter(firstLine) {
  const candidates = [',', ';', '\t', '|'];
  let best = ','; let bestCount = -1;
  for (const d of candidates) {
    let count = 0; let inQuotes = false;
    for (const ch of firstLine) {
      if (ch === '"') inQuotes = !inQuotes;
      else if (ch === d && !inQuotes) count += 1;
    }
    if (count > bestCount) { best = d; bestCount = count; }
  }
  return best;
}

/**
 * RFC 4180-style parser: quotes, escaped quotes (""), delimiters and newlines inside
 * quotes, CRLF / LF / CR line endings, BOM, blank lines. Delimiter auto-detected.
 * Returns { headers, rows, records, delimiter }.
 */
export function parseCSV(input, { delimiter } = {}) {
  const src = String(input ?? '').replace(/^﻿/, '');
  if (!src.trim()) return { headers: [], rows: [], records: [], delimiter: delimiter || ',' };
  const firstLineEnd = src.search(/\r\n|\n|\r/);
  const d = delimiter || detectDelimiter(firstLineEnd === -1 ? src : src.slice(0, firstLineEnd));
  const rows = [];
  let row = [];
  let cell = '';
  let inQuotes = false;
  for (let i = 0; i < src.length; i += 1) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') { cell += '"'; i += 1; } else inQuotes = false;
      } else cell += ch;
      continue;
    }
    if (ch === '"') { inQuotes = true; continue; }
    if (ch === d) { row.push(cell); cell = ''; continue; }
    if (ch === '\r' || ch === '\n') {
      if (ch === '\r' && src[i + 1] === '\n') i += 1;
      row.push(cell); cell = '';
      if (row.some((c) => c.trim() !== '')) rows.push(row);
      row = [];
      continue;
    }
    cell += ch;
  }
  row.push(cell);
  if (row.some((c) => c.trim() !== '')) rows.push(row);
  if (!rows.length) return { headers: [], rows: [], records: [], delimiter: d };
  const headers = rows[0].map((hd) => text(hd).replace(/^﻿/, ''));
  const body = rows.slice(1);
  const records = body.map((r) => Object.fromEntries(headers.map((hd, i) => [hd, r[i] == null ? '' : r[i]])));
  return { headers, rows: body, records, delimiter: d };
}

/** Escape one CSV cell (quotes, delimiters, newlines) and neutralise formula injection. */
function csvCell(value) {
  let s;
  if (value == null) s = '';
  else if (typeof value === 'boolean') s = value ? 'نعم' : 'لا';
  else if (typeof value === 'object') { try { s = JSON.stringify(value); } catch { s = String(value); } }
  else s = String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  if (/[",\n\r;\t]/.test(s) || /^\s|\s$/.test(s)) s = `"${s.replace(/"/g, '""')}"`;
  return s;
}

function normalizeColumns(rows, columns) {
  if (Array.isArray(columns) && columns.length) {
    return columns.map((c) => (typeof c === 'string' ? { key: c, label: c } : { key: c.key, label: c.label || c.key, format: typeof c.format === 'function' ? c.format : (typeof c.render === 'function' ? null : null) }));
  }
  const first = arr(rows).find(isObj);
  return first ? Object.keys(first).map((k) => ({ key: k, label: k })) : [];
}

/** Build a UTF-8 BOM CSV string (CRLF rows) — Excel opens Arabic correctly. */
export function toCSV(rows, columns) {
  const cols = normalizeColumns(rows, columns);
  const lines = [cols.map((c) => csvCell(c.label)).join(',')];
  for (const row of arr(rows)) {
    lines.push(cols.map((c) => {
      let v = isObj(row) ? row[c.key] : row;
      if (c.format) { try { v = c.format(v, row); } catch { /* keep raw */ } }
      return csvCell(v);
    }).join(','));
  }
  return `﻿${lines.join('\r\n')}\r\n`;
}

/* ────────────────────────────── downloads ────────────────────────────── */

function download(content, filename, mime) {
  if (typeof document === 'undefined' || typeof Blob === 'undefined' || typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function') return false;
  try {
    const blob = new Blob([content], { type: mime });
    const href = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = href;
    a.download = filename;
    a.rel = 'noopener';
    a.style.display = 'none';
    (document.body || document.documentElement).appendChild(a);
    a.click();
    setTimeout(() => {
      a.remove();
      try { URL.revokeObjectURL(href); } catch { /* ignore */ }
    }, 1000);
    return true;
  } catch {
    return false;
  }
}

function safeFilename(name, fallback) {
  const s = text(name) || fallback;
  return s.replace(/[\\/:*?"<>|\u0000-\u001f]/g, '-');
}

/* ────────────────────────────── risk row mapping ────────────────────────────── */

export const TEMPLATE_COLUMNS = Object.freeze([
  { key: 'code', label: 'الكود' },
  { key: 'site', label: 'الموقع' },
  { key: 'category', label: 'الفئة' },
  { key: 'hazard', label: 'الخطر' },
  { key: 'activity', label: 'النشاط' },
  { key: 'likelihood', label: 'الاحتمالية' },
  { key: 'severity', label: 'الشدة' },
  { key: 'owner', label: 'المالك' },
  { key: 'dueDate', label: 'تاريخ الاستحقاق' },
  { key: 'status', label: 'الحالة' },
]);

const FIELD_ALIASES = {
  code: ['الكود', 'الرمز', 'رمز', 'رمز المخاطرة', 'كود', 'code', 'id', 'risk code', 'risk id', 'ref', 'reference'],
  siteId: ['الموقع', 'موقع', 'رمز الموقع', 'اسم الموقع', 'المشروع', 'مشروع', 'site', 'site id', 'site code', 'site name', 'project'],
  categoryId: ['الفئة', 'فئة', 'التصنيف', 'تصنيف', 'فئة الخطر', 'category', 'category id', 'hazard category', 'type'],
  hazard: ['الخطر', 'خطر', 'وصف الخطر', 'المخاطرة', 'مخاطرة', 'hazard', 'risk', 'risk title', 'title', 'danger'],
  activity: ['النشاط', 'نشاط', 'المهمة', 'مهمة', 'activity', 'task', 'operation', 'process'],
  likelihood: ['الاحتمالية', 'الاحتمال', 'احتمالية', 'احتمال', 'likelihood', 'probability', 'l', 'p'],
  severity: ['الشدة', 'شدة', 'الخطورة', 'خطورة', 'الأثر', 'أثر', 'severity', 'impact', 'consequence', 's'],
  owner: ['المالك', 'مالك', 'المسؤول', 'مسؤول', 'صاحب الإجراء', 'owner', 'responsible', 'assignee', 'action owner'],
  dueDate: ['تاريخ الاستحقاق', 'الاستحقاق', 'استحقاق', 'الموعد', 'موعد الإغلاق', 'تاريخ', 'due date', 'duedate', 'due', 'deadline', 'target date', 'date'],
  status: ['الحالة', 'حالة', 'status', 'state'],
  description: ['الوصف', 'وصف', 'التفاصيل', 'تفاصيل', 'description', 'details', 'notes'],
  controls: ['الضوابط', 'ضوابط', 'إجراءات التحكم', 'controls', 'control measures', 'mitigation', 'mitigations'],
  residualLikelihood: ['الاحتمالية المتبقية', 'residual likelihood', 'rl'],
  residualSeverity: ['الشدة المتبقية', 'residual severity', 'rs'],
  legalRef: ['المرجع القانوني', 'المرجع النظامي', 'legal ref', 'legal reference', 'regulation'],
  source: ['المصدر', 'مصدر', 'source'],
  zoneId: ['المنطقة', 'منطقة', 'zone', 'area', 'location'],
};

const ALIAS_INDEX = (() => {
  const exact = new Map();
  for (const [field, aliases] of Object.entries(FIELD_ALIASES)) {
    for (const alias of aliases) {
      const k = bare(alias);
      if (k && !exact.has(k)) exact.set(k, field);
    }
  }
  return exact;
})();

/**
 * Map actual headers → canonical field names. Exact normalised matches win; remaining
 * headers fall back to containment. Several headers may feed the same field (a sheet
 * mixing Arabic and English columns): per row the first non-empty value is used, and an
 * exact match is never displaced by a containment match.
 */
function mapHeaders(headers) {
  const mapping = new Map();
  const exactFields = new Set();
  const pending = [];
  for (const hd of headers) {
    const key = bare(hd);
    const field = ALIAS_INDEX.get(key);
    if (field) { mapping.set(hd, field); exactFields.add(field); } else pending.push(hd);
  }
  for (const hd of pending) {
    const key = bare(hd);
    if (!key) continue;
    for (const [alias, field] of ALIAS_INDEX) {
      if (exactFields.has(field) || alias.length < 3) continue;
      if (key.includes(alias) || alias.includes(key)) { mapping.set(hd, field); break; }
    }
  }
  return mapping;
}

/** Arabic labels for the canonical risk fields (used when reporting a detected mapping). */
const FIELD_LABELS = Object.freeze({
  code: 'الكود', siteId: 'الموقع', categoryId: 'الفئة', hazard: 'الخطر', activity: 'النشاط',
  likelihood: 'الاحتمالية', severity: 'الشدة', owner: 'المالك', dueDate: 'تاريخ الاستحقاق', status: 'الحالة',
  description: 'الوصف', controls: 'الضوابط', residualLikelihood: 'الاحتمالية المتبقية', residualSeverity: 'الشدة المتبقية',
  legalRef: 'المرجع القانوني', source: 'المصدر', zoneId: 'المنطقة',
});
/** A source is accepted only when «الخطر» plus at least this many other known columns are recognised. */
export const MIN_KNOWN_COLUMNS = 2;

/**
 * Inspect a header list (or the union of record keys) and decide whether it describes a
 * risk register: the hazard column must be recognised together with ≥ MIN_KNOWN_COLUMNS
 * other known columns. Returns { ok, headers, fields, labels, unknown, message }.
 */
export function describeMapping(headersOrRecords) {
  const headers = Array.isArray(headersOrRecords) && headersOrRecords.every((h) => typeof h === 'string')
    ? headersOrRecords.map((h) => text(h)).filter(Boolean)
    : Array.from(new Set(arr(headersOrRecords).filter(isObj).flatMap((r) => Object.keys(r)))).map((h) => text(h)).filter(Boolean);
  const mapping = mapHeaders(headers);
  const fields = Array.from(new Set(mapping.values()));
  const labels = fields.map((f) => FIELD_LABELS[f] || f);
  const unknown = headers.filter((h) => !mapping.has(h));
  const hasHazard = fields.includes('hazard');
  const ok = hasHazard && fields.length - 1 >= MIN_KNOWN_COLUMNS;
  const detected = labels.length ? `الأعمدة المتعرَّف عليها: ${labels.join('، ')}` : 'لم يُتعرَّف على أي عمود';
  const received = headers.length ? ` · الأعمدة المستلمة: ${headers.slice(0, 8).join('، ')}${headers.length > 8 ? '…' : ''}` : '';
  const message = ok ? detected : `${MESSAGES.unmappedColumns} ${detected}${received}.`;
  return { ok, headers, fields, labels, unknown, hasHazard, message };
}

/** Body sniffing: a CSV/JSON endpoint that answers with a web page or a script is not a data source. */
function looksLikeHtml(body) {
  const head = String(body || '').slice(0, 2048);
  return /^\s*(?:<!doctype\b|<html\b|<head\b|<body\b|<\?xml\b)/i.test(head) || (/^\s*</.test(head) && /<\/(?:html|head|body|div|script|title|p|table)>/i.test(String(body || '')));
}
function looksLikeScript(body) {
  const head = String(body || '').slice(0, 2048).replace(/^﻿/, '');
  if (/^\s*(?:\/\/|\/\*|['"]use strict['"];?)/.test(head)) return true;
  if (/^\s*(?:import\s+[\w{*]|export\s+(?:default|const|function|class|\{)|(?:const|let|var)\s+[\w$]+\s*=|(?:async\s+)?function\s*[\w$]*\s*\(|\(\s*(?:async\s+)?function\b|window\.|document\.|class\s+[\w$]+\s*(?:extends|\{))/.test(head)) return true;
  return /<script\b/i.test(head);
}
function looksLikeJson(body) {
  return /^\s*[[{]/.test(String(body || '').replace(/^﻿/, ''));
}

const CATEGORY_RULES = [
  ['ergonomic', /مناول|ارجونوم|ergonom|manual handling|posture/],
  ['scaffold', /سقال|scaffold/],
  ['height', /ارتفاع|سقوط|height|fall/],
  ['excavation', /حفر|خند|excavat|trench/],
  ['lifting', /رافع|رفع|lift|crane|hoist|rigging/],
  ['electrical', /كهرب|electric|voltage|شحن/],
  ['confined', /مغلق|محصور|confined/],
  ['hotwork', /ساخن|لحام|hot ?work|weld|cutting/],
  ['heat', /حرار|اجهاد|heat|thermal/],
  ['chemical', /كيميائ|غبار|مواد|chemic|dust|hazmat|silica/],
  ['traffic', /مرور|مركب|سيار|شاحن|traffic|vehicle|truck|plant movement/],
  ['structural', /انهيار|انشائ|هيكل|structur|collapse|formwork/],
];

function resolveCategory(value, categories) {
  const raw = text(value);
  if (!raw) return null;
  const n = norm(raw);
  const list = arr(categories);
  const direct = list.find((c) => c.id === raw || norm(c.id) === n || norm(c.name) === n);
  if (direct) return direct.id;
  const byName = list.find((c) => n.includes(norm(c.name)) || norm(c.name).includes(n));
  if (byName) return byName.id;
  for (const [id, re] of CATEGORY_RULES) if (re.test(n) && list.some((c) => c.id === id)) return id;
  return null;
}

function resolveSite(value, sites) {
  const raw = text(value);
  const list = arr(sites);
  if (!raw || !list.length) return null;
  const n = norm(raw);
  const direct = list.find((s) => s.id === raw || norm(s.id) === n || norm(s.code) === n || norm(s.name) === n);
  if (direct) return direct.id;
  const partial = list.find((s) => n.includes(norm(s.name)) || norm(s.name).includes(n) || (s.city && norm(s.city) === n) || (s.code && n.includes(norm(s.code))));
  return partial ? partial.id : null;
}

const LIKELIHOOD_WORDS = [
  [5, /شبه مؤكد|مؤكد|عالي جدا|عال جدا|almost certain|certain|very high|frequent/],
  [4, /مرجح|عالي|عال|مرتفع|likely|high|probable/],
  [3, /محتمل|متوسط|possible|medium|moderate|occasional/],
  [2, /غير محتمل|منخفض|unlikely|low|remote/],
  [1, /نادر|مستبعد|rare|very low|improbable/],
];
const SEVERITY_WORDS = [
  [5, /كارث|قاتل|عالي جدا|عال جدا|catastroph|fatal|critical|very high/],
  [4, /كبير|خطير|جسيم|عالي|عال|مرتفع|major|high|serious|severe/],
  [3, /متوسط|moderate|medium/],
  [2, /بسيط|منخفض|minor|low/],
  [1, /لا يذكر|طفيف|ضئيل|negligible|insignificant|very low|trivial/],
];

function parseScale(value, words, fallback) {
  const raw = latinDigits(text(value));
  if (!raw) return { value: fallback, ok: false };
  const m = /(\d+(?:\.\d+)?)/.exec(raw);
  if (m) {
    const n = Number(m[1]);
    if (Number.isFinite(n)) return { value: clamp(Math.round(n), 1, 5), ok: true };
  }
  const n = norm(raw);
  for (const [score, re] of words) if (re.test(n)) return { value: score, ok: true };
  return { value: fallback, ok: false };
}

const STATUS_RULES = [
  ['مغلق', /مغلق|منجز|مكتمل|closed|done|complete|resolved/],
  ['مُسيطر عليه', /مسيطر|تحت السيطره|محكوم|controlled|mitigated|managed/],
  ['قيد المعالجة', /قيد|جاري|معالج|in progress|progress|ongoing|treating|open action|working/],
  ['مفتوح', /مفتوح|جديد|open|new|active/],
];

function resolveStatus(value) {
  const raw = text(value);
  if (!raw) return 'مفتوح';
  const n = norm(raw);
  const exact = arr(RISK_STATUS).find((s) => norm(s) === n);
  if (exact) return exact;
  for (const [status, re] of STATUS_RULES) if (re.test(n) && arr(RISK_STATUS).includes(status)) return status;
  return 'مفتوح';
}

/** Accepts ISO, DD/MM/YYYY, DD-MM-YYYY, YYYY/MM/DD, Excel serials and Arabic-Indic digits → 'YYYY-MM-DD' or ''. */
export function parseDate(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return toISODate(value);
  const raw = latinDigits(text(value));
  if (!raw) return '';
  let m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/.exec(raw);
  if (m) return buildDate(+m[1], +m[2], +m[3]);
  m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})/.exec(raw);
  if (m) return buildDate(+m[3], +m[2], +m[1]);
  if (/^\d{5}(\.\d+)?$/.test(raw)) {
    const serial = Number(raw);
    if (serial > 20_000 && serial < 80_000) return toISODate(new Date(Date.UTC(1899, 11, 30) + serial * DAY_MS), true);
  }
  const t = Date.parse(raw);
  return Number.isFinite(t) ? toISODate(new Date(t)) : '';
}

function buildDate(y, mo, d) {
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return '';
  const dt = new Date(y, mo - 1, d);
  return dt.getMonth() === mo - 1 ? toISODate(dt) : '';
}

function toISODate(dt, utc = false) {
  const y = utc ? dt.getUTCFullYear() : dt.getFullYear();
  const mo = (utc ? dt.getUTCMonth() : dt.getMonth()) + 1;
  const d = utc ? dt.getUTCDate() : dt.getDate();
  return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

function splitControls(value) {
  if (Array.isArray(value)) return value.map((c) => (isObj(c) ? { type: text(c.type) || CONTROL_DEFAULT_TYPE, text: text(c.text) } : { type: CONTROL_DEFAULT_TYPE, text: text(c) })).filter((c) => c.text);
  return text(value).split(/\s*[;|\n]\s*|\s*،\s*(?=[^\d])/).map((t) => t.trim()).filter(Boolean).map((t) => ({ type: CONTROL_DEFAULT_TYPE, text: t }));
}

/**
 * Map raw records (objects keyed by source headers) → Risk-schema objects ready for
 * store.addRisk. Returns { risks, skipped, warnings }.
 */
export function mapRiskRows(records, { sites = arr(seed && seed.sites), categories = CATEGORIES, sourceLabel = 'استيراد' } = {}) {
  const list = arr(records).filter(isObj);
  const warnings = [];
  const risks = [];
  let skipped = 0;
  if (!list.length) return { risks, skipped, warnings };
  const headers = Array.from(new Set(list.flatMap((r) => Object.keys(r))));
  const mapping = mapHeaders(headers);
  const required = ['hazard'];
  for (const field of required) {
    if (!Array.from(mapping.values()).includes(field)) warnings.push('لم يُعثر على عمود «الخطر» — سيتم تجاهل الصفوف التي لا تحتوي على وصف للخطر.');
  }
  const defaultSite = arr(sites)[0] ? arr(sites)[0].id : 'S1';
  list.forEach((record, index) => {
    const row = {};
    for (const [hd, field] of mapping) {
      if (record[hd] === undefined || text(record[hd]) === '') continue;
      if (row[field] === undefined || text(row[field]) === '') row[field] = record[hd];
    }
    const hazard = text(row.hazard) || text(row.description);
    if (!hazard) { skipped += 1; return; }
    const rowNo = index + 2;
    const siteId = resolveSite(row.siteId, sites);
    if (!siteId && text(row.siteId)) warnings.push(`الصف ${rowNo}: الموقع «${text(row.siteId)}» غير معروف — تم استخدام الموقع الافتراضي.`);
    const categoryId = resolveCategory(row.categoryId, categories) || resolveCategory(hazard, categories) || resolveCategory(row.activity, categories);
    if (!categoryId) warnings.push(`الصف ${rowNo}: تعذّر تحديد الفئة — تم استخدام «${arr(categories)[0] ? arr(categories)[0].name : 'الافتراضية'}».`);
    const likelihood = parseScale(row.likelihood, LIKELIHOOD_WORDS, 3);
    const severity = parseScale(row.severity, SEVERITY_WORDS, 3);
    if (!likelihood.ok && text(row.likelihood)) warnings.push(`الصف ${rowNo}: قيمة الاحتمالية «${text(row.likelihood)}» غير مفهومة — استُخدمت 3.`);
    if (!severity.ok && text(row.severity)) warnings.push(`الصف ${rowNo}: قيمة الشدة «${text(row.severity)}» غير مفهومة — استُخدمت 3.`);
    const rl = parseScale(row.residualLikelihood, LIKELIHOOD_WORDS, likelihood.value);
    const rs = parseScale(row.residualSeverity, SEVERITY_WORDS, severity.value);
    const dueDate = parseDate(row.dueDate);
    if (!dueDate && text(row.dueDate)) warnings.push(`الصف ${rowNo}: تاريخ الاستحقاق «${text(row.dueDate)}» غير صالح — سيُستخدم الموعد الافتراضي.`);
    const risk = {
      code: text(row.code) || undefined,
      siteId: siteId || defaultSite,
      categoryId: categoryId || (arr(categories)[0] ? arr(categories)[0].id : 'height'),
      hazard,
      activity: text(row.activity),
      description: text(row.description),
      likelihood: likelihood.value,
      severity: severity.value,
      residualLikelihood: clamp(rl.value, 1, likelihood.value),
      residualSeverity: clamp(rs.value, 1, severity.value),
      controls: splitControls(row.controls),
      owner: text(row.owner),
      dueDate: dueDate || undefined,
      status: resolveStatus(row.status),
      source: text(row.source) || sourceLabel,
      legalRef: text(row.legalRef),
    };
    if (text(row.zoneId)) risk.zoneId = text(row.zoneId);
    risks.push(risk);
  });
  return { risks, skipped, warnings: warnings.slice(0, 40) };
}

/* ────────────────────────────── adapters ────────────────────────────── */

async function fetchRecords({ type, url, apiKey, table }, limit) {
  const kind = text(type).toLowerCase();
  if (kind === 'simulation' || !kind) return { ok: false, message: MESSAGES.simulation, records: [], latencyMs: 0, status: 0 };
  if (!['json', 'sheets', 'supabase'].includes(kind)) return { ok: false, message: MESSAGES.unknownType, records: [], latencyMs: 0, status: 0 };
  const parsed = validateUrl(url);
  if (!parsed) return { ok: false, message: MESSAGES.invalidUrl, records: [], latencyMs: 0, status: 0 };

  let target = parsed.href;
  const headers = { Accept: kind === 'sheets' ? 'text/csv, text/plain, */*' : 'application/json' };
  if (kind === 'supabase') {
    if (!text(table)) return { ok: false, message: MESSAGES.supabaseTable, records: [], latencyMs: 0, status: 0 };
    if (!text(apiKey)) return { ok: false, message: MESSAGES.supabaseKey, records: [], latencyMs: 0, status: 0 };
    target = supabaseEndpoint(parsed, table, limit);
    headers.apikey = text(apiKey);
    headers.Authorization = `Bearer ${text(apiKey)}`;
  } else if (kind === 'sheets') {
    target = normalizeSheetsUrl(parsed).href;
  } else if (text(apiKey)) {
    headers.Authorization = `Bearer ${text(apiKey)}`;
  }

  const result = await request(target, { method: 'GET', headers, mode: 'cors', credentials: 'omit' });
  if (!result.ok) return { ok: false, message: failureMessage(result), records: [], latencyMs: result.latencyMs, status: result.status };

  const body = await readText(result.response);
  const fail = (message) => ({ ok: false, message, records: [], latencyMs: result.latencyMs, status: result.status });
  if (kind === 'sheets') {
    if (looksLikeHtml(body)) return fail(MESSAGES.htmlNotCsv);
    if (looksLikeScript(body)) return fail(MESSAGES.scriptNotCsv);
    if (looksLikeJson(body)) return fail(MESSAGES.jsonNotCsv);
    const csv = parseCSV(body);
    if (!csv.headers.length) return fail(MESSAGES.emptyCsv);
    // C-14: a CSV is accepted only when its header row reads as a risk register.
    const mapping = describeMapping(csv.headers);
    if (!mapping.ok) return fail(mapping.message);
    return { ok: true, message: '', records: csv.records.slice(0, limit), latencyMs: result.latencyMs, status: result.status, mapping };
  }
  if (looksLikeHtml(body)) return fail(MESSAGES.htmlNotJson);
  if (!looksLikeJson(body) && looksLikeScript(body)) return fail(MESSAGES.notJson);
  const json = parseJsonText(body);
  if (json.error) return fail(json.error);
  const records = recordsFromJson(json.value);
  if (!records) return fail(MESSAGES.notArray);
  // Same mapping gate for JSON / Supabase rows (an empty result set is still a valid connection).
  const mapping = records.length ? describeMapping(records) : null;
  if (mapping && !mapping.ok) return fail(mapping.message);
  return { ok: true, message: '', records: records.slice(0, limit), latencyMs: result.latencyMs, status: result.status, mapping };
}

async function pingWebhook(url) {
  const parsed = validateUrl(url);
  if (!parsed) return { ok: false, latencyMs: 0, message: MESSAGES.invalidUrl, status: 0 };
  const started = nowMs();
  const res = await postWebhook(parsed.href, {
    type: 'ping',
    source: 'Biltix Risk AI',
    text: 'اختبار اتصال من بلتكس Risk AI — ركيزة السلامة والصحة المهنية',
    sentAt: new Date().toISOString(),
  });
  const latencyMs = Math.round(nowMs() - started);
  return { ...res, latencyMs: res.latencyMs ?? latencyMs };
}

/**
 * Probe a data source. Never rejects.
 * @returns {Promise<{ok:boolean, latencyMs:number, message:string, status?:number, count?:number}>}
 */
async function testConnection(config = {}) {
  try {
    const kind = text(config.type).toLowerCase();
    if (kind === 'webhook') return await pingWebhook(config.url);
    if (kind === 'simulation' || !kind) return { ok: true, latencyMs: 0, message: MESSAGES.simulation, status: 0 };
    const res = await fetchRecords(config, 1);
    if (!res.ok) return { ok: false, latencyMs: res.latencyMs, message: res.message, status: res.status };
    const label = TYPE_LABELS[kind] || kind;
    const sample = res.records.length ? ` — تم استلام ${safeNum(res.records.length)} سجل تجريبي` : ' — الاستجابة صحيحة لكنها فارغة';
    const mapped = res.mapping && res.mapping.labels && res.mapping.labels.length ? ` · ${res.mapping.message}` : '';
    return {
      ok: true, latencyMs: res.latencyMs, status: res.status, count: res.records.length,
      mapping: res.mapping ? { fields: res.mapping.fields, labels: res.mapping.labels, unknown: res.mapping.unknown } : null,
      message: `تم الاتصال بنجاح بـ ${label} خلال ${safeNum(res.latencyMs)} مللي ثانية${sample}${mapped}.`,
    };
  } catch (err) {
    return { ok: false, latencyMs: 0, message: MESSAGES.network, status: 0, error: err && err.message ? err.message : String(err) };
  }
}

/**
 * Fetch rows from the source and map them to the Risk schema. Never rejects.
 * @returns {Promise<{count:number, risks:object[], skipped:number, warnings:string[], ok:boolean, message:string}>}
 */
async function importRisks(config = {}, options = {}) {
  try {
    const kind = text(config.type).toLowerCase();
    const res = await fetchRecords(config, IMPORT_LIMIT);
    if (!res.ok) return { count: 0, risks: [], skipped: 0, warnings: [], ok: false, message: res.message, latencyMs: res.latencyMs };
    const mapped = mapRiskRows(res.records, { ...options, sourceLabel: `استيراد — ${TYPE_LABELS[kind] || kind}` });
    const ok = mapped.risks.length > 0;
    const columns = res.mapping && res.mapping.labels && res.mapping.labels.length ? ` · ${res.mapping.message}` : '';
    const message = ok
      ? `تم استيراد ${safeNum(mapped.risks.length)} مخاطرة من ${TYPE_LABELS[kind] || kind}${mapped.skipped ? ` وتجاهل ${safeNum(mapped.skipped)} صفًا دون وصف للخطر` : ''}${columns}.`
      : MESSAGES.noRows;
    return {
      count: mapped.risks.length, risks: mapped.risks, skipped: mapped.skipped, warnings: mapped.warnings, ok, message, latencyMs: res.latencyMs,
      mapping: res.mapping ? { fields: res.mapping.fields, labels: res.mapping.labels, unknown: res.mapping.unknown } : null,
    };
  } catch (err) {
    return { count: 0, risks: [], skipped: 0, warnings: [], ok: false, message: MESSAGES.network, error: err && err.message ? err.message : String(err) };
  }
}

/**
 * POST a JSON payload to a webhook (Slack / Teams / n8n / Zapier…). Tries a CORS request
 * first; if the browser blocks it, falls back to an opaque no-cors request. Never rejects.
 * @returns {Promise<{ok:boolean, status:number, message:string, opaque?:boolean, latencyMs?:number}>}
 */
async function postWebhook(url, payload = {}) {
  try {
    const parsed = validateUrl(url);
    if (!parsed) return { ok: false, status: 0, message: MESSAGES.invalidUrl };
    const bodyObj = isObj(payload) ? payload : { text: text(payload) };
    let body;
    try { body = JSON.stringify(bodyObj); } catch { return { ok: false, status: 0, message: 'تعذّر تحويل الحمولة إلى JSON.' }; }

    const first = await request(parsed.href, { method: 'POST', mode: 'cors', credentials: 'omit', headers: { 'Content-Type': 'application/json' }, body });
    if (first.response) {
      return {
        ok: first.ok,
        status: first.status,
        latencyMs: first.latencyMs,
        message: first.ok ? `تم استلام التنبيه من الخدمة (HTTP ${first.status}).` : httpMessage(first.status),
      };
    }
    if (first.error === 'timeout') return { ok: false, status: 0, latencyMs: first.latencyMs, message: MESSAGES.timeout };
    if (first.error === 'nofetch') return { ok: false, status: 0, message: MESSAGES.noFetch };

    // CORS-blocked endpoints (Slack, Teams…) still accept an opaque request without a preflight.
    const second = await request(parsed.href, { method: 'POST', mode: 'no-cors', credentials: 'omit', headers: { 'Content-Type': 'text/plain;charset=UTF-8' }, body });
    if (second.response) return { ok: true, status: 0, opaque: true, latencyMs: second.latencyMs, message: MESSAGES.webhookOpaque };
    return { ok: false, status: 0, latencyMs: second.latencyMs, message: second.error === 'timeout' ? MESSAGES.timeout : MESSAGES.network };
  } catch (err) {
    return { ok: false, status: 0, message: MESSAGES.network, error: err && err.message ? err.message : String(err) };
  }
}

/* ────────────────────────────── exports ────────────────────────────── */

function exportCSV(rows, columns, filename) {
  const csv = toCSV(rows, columns);
  download(csv, safeFilename(filename, 'biltix-hse-export.csv'), 'text/csv;charset=utf-8');
  return csv;
}

function exportJSON(obj, filename) {
  let json;
  try { json = JSON.stringify(obj, null, 2); } catch { json = JSON.stringify({ error: 'تعذّر تحويل البيانات إلى JSON' }); }
  download(json, safeFilename(filename, 'biltix-hse-export.json'), 'application/json;charset=utf-8');
  return json;
}

function templateRows() {
  const sites = arr(seed && seed.sites);
  const site = (i) => (sites[i] ? sites[i].code : ['RUH-01', 'JED-02', 'NEOM-03'][i]);
  const cat = (id, fallback) => { const c = arr(CATEGORIES).find((x) => x.id === id); return c ? c.name : fallback; };
  const today = new Date();
  const plus = (days) => toISODate(new Date(today.getTime() + days * DAY_MS));
  return [
    { code: 'R-2001', site: site(0), category: cat('height', 'العمل على ارتفاعات'), hazard: 'سقوط من حافة بلاطة غير محمية', activity: 'صب الخرسانة — الطابق 12', likelihood: 4, severity: 5, owner: 'م. سارة القحطاني', dueDate: plus(14), status: 'مفتوح' },
    { code: 'R-2002', site: site(1), category: cat('electrical', 'الكهرباء'), hazard: 'تلامس مع كابل مؤقت مكشوف العزل', activity: 'التمديدات الكهربائية — المبنى B', likelihood: 3, severity: 4, owner: 'م. عمر باجابر', dueDate: plus(21), status: 'قيد المعالجة' },
    { code: 'R-2003', site: site(2), category: cat('heat', 'الإجهاد الحراري'), hazard: 'إجهاد حراري أثناء تركيب الألواح ظهرًا', activity: 'تركيب الألواح الشمسية — القطاع الجنوبي', likelihood: 4, severity: 3, owner: 'م. لمى العنزي', dueDate: plus(7), status: 'مُسيطر عليه' },
  ];
}

function downloadTemplateCSV() {
  const csv = toCSV(templateRows(), TEMPLATE_COLUMNS);
  download(csv, 'biltix-hse-risks-template.csv', 'text/csv;charset=utf-8');
  return csv;
}

/* ────────────────────────────── report builder ────────────────────────────── */

/** Arabic count phrase: 1 → "نقطة واحدة", 2 → "نقطتان", 3–10 → "3 نقاط", 11+ → "11 نقطة". */
function count(n, forms) {
  const v = Math.abs(Math.round(n));
  if (v === 1) return `${forms.one} واحدة`.replace('واحدة', forms.fem === false ? 'واحد' : 'واحدة');
  if (v === 2) return forms.two;
  if (v >= 3 && v <= 10) return `${safeNum(v)} ${forms.few}`;
  return `${safeNum(v)} ${forms.many}`;
}

const F = Object.freeze({
  point: { one: 'نقطة', two: 'نقطتين', few: 'نقاط', many: 'نقطة' },
  incident: { one: 'حادث', two: 'حادثين', few: 'حوادث', many: 'حادثًا', fem: false },
  nearMiss: { one: 'حادث وشيك', two: 'حادثين وشيكين', few: 'حوادث وشيكة', many: 'حادثًا وشيكًا', fem: false },
  risk: { one: 'مخاطرة', two: 'مخاطرتين', few: 'مخاطر', many: 'مخاطرة' },
  permit: { one: 'تصريح', two: 'تصريحين', few: 'تصاريح', many: 'تصريحًا', fem: false },
  day: { one: 'يوم', two: 'يومين', few: 'أيام', many: 'يومًا', fem: false },
  inspection: { one: 'تفتيش', two: 'تفتيشين', few: 'تفتيشات', many: 'تفتيشًا', fem: false },
  cert: { one: 'شهادة', two: 'شهادتين', few: 'شهادات', many: 'شهادة' },
  clause: { one: 'بند', two: 'بندين', few: 'بنود', many: 'بندًا', fem: false },
  action: { one: 'إجراء', two: 'إجراءين', few: 'إجراءات', many: 'إجراءً', fem: false },
});

/** "بارتفاع X مقارنة بالفترة السابقة" / "بانخفاض …" / "دون تغيّر عن الفترة السابقة". */
function versusPrevious(delta, forms, { pctUnit = false, digits = 0 } = {}) {
  const d = Number(delta) || 0;
  if (Math.abs(d) < (digits ? 0.005 : 0.5)) return 'دون تغيّر عن الفترة السابقة';
  const amount = pctUnit ? `${safeNum(Math.abs(d), digits)} نقطة مئوية` : (forms ? count(Math.abs(d), forms) : safeNum(Math.abs(d), digits));
  return `${d > 0 ? 'بارتفاع' : 'بانخفاض'} ${amount} مقارنة بالفترة السابقة`;
}

function deltaTone(delta, goodWhen = 'down') {
  const d = Number(delta) || 0;
  if (d === 0) return 'neutral';
  const improving = goodWhen === 'down' ? d < 0 : d > 0;
  return improving ? 'good' : 'serious';
}

function monthYear(date) {
  try {
    const locale = fmt.getNumerals && fmt.getNumerals() === 'arab' ? 'ar-SA-u-ca-gregory' : 'ar-SA-u-nu-latn-ca-gregory';
    return new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' }).format(date);
  } catch {
    return safeDate(date).replace(/^\d+\s+/, '');
  }
}

function tierCounts(state, filters, at) {
  const counts = { 'منخفض': 0, 'متوسط': 0, 'عالٍ': 0, 'حرج': 0 };
  for (const r of arr(sel.filteredRisks(state, filters, at))) {
    if (r.status === RISK_CLOSED) continue;
    const tier = sel.riskTier(sel.riskScore(r));
    if (counts[tier] !== undefined) counts[tier] += 1;
  }
  return counts;
}

const QUARTER_NAMES = ['الأول', 'الثاني', 'الثالث', 'الرابع'];

function parseLocalDate(value) {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  const raw = text(value);
  if (!raw) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  const dt = m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date(raw);
  return Number.isNaN(dt.getTime()) ? null : dt;
}

/**
 * Build the monthly HSE report as a plain object (reports view + print).
 * `period` is the human label (string) the reports view prints; `periodInfo` carries the
 * structured window. Accepts the reports view's call shape as well:
 *   buildReport(state, { period:'month'|'quarter'|'30d', from, to, range, siteId, now })
 * @param {object} state  store.state
 * @param {{range?:number, siteId?:string, now?:Date|string, from?:string|Date, to?:string|Date, period?:string}} [opts]
 */
function buildReport(state, opts = {}) {
  const s = isObj(state) ? state : {};
  const at = parseLocalDate(opts.now) || parseLocalDate(opts.to) || new Date();
  const fromOpt = parseLocalDate(opts.from);
  const toOpt = parseLocalDate(opts.to) || at;
  let range = Number(opts.range) > 0 ? Math.round(Number(opts.range)) : 0;
  if (!range && fromOpt) range = Math.max(1, Math.round((toOpt.getTime() - fromOpt.getTime()) / DAY_MS) + 1);
  if (!range) range = Number(s.filters && s.filters.range) > 0 ? Number(s.filters.range) : 30;
  const filters = { siteId: text(opts.siteId) || (s.filters && s.filters.siteId) || 'all', range, search: '' };
  const company = isObj(s.company) ? s.company : { name: 'بلتكس', product: BRAND.product, hseProduct: BRAND.hseProduct, pillar: BRAND.pillar };
  const site = filters.siteId !== 'all' ? arr(s.sites).find((x) => x.id === filters.siteId) : null;
  const scopeLabel = site ? site.name : 'جميع المواقع';

  const safe = (fn, fallback) => { try { const v = fn(); return v == null ? fallback : v; } catch { return fallback; } };
  const k = safe(() => sel.kpis(s, filters, at), { deltas: {}, previous: {}, period: {} });
  const d = k.deltas || {};
  const prev = k.previous || {};
  const toMs = at.getTime();
  const fromDate = fromOpt || new Date(toMs - (filters.range - 1) * DAY_MS);
  const kind = text(opts.period);
  const rangeLabel = `${safeDate(fromDate)} – ${safeDate(at)}`;
  let windowLabel;
  if (kind === 'month') windowLabel = monthYear(fromDate);
  else if (kind === 'quarter') windowLabel = `الربع ${QUARTER_NAMES[Math.floor(fromDate.getMonth() / 3)]} ${fromDate.getFullYear()}`;
  else windowLabel = `آخر ${safeNum(filters.range)} يومًا`;
  const period = {
    key: kind || (filters.range === 30 ? '30d' : 'custom'),
    from: toISODate(fromDate),
    to: toISODate(at),
    days: filters.range,
    label: `${windowLabel} (${rangeLabel})`,
    rangeLabel,
    month: monthYear(at),
    scope: scopeLabel,
    siteId: filters.siteId,
  };

  /* ── data ── */
  const trend = safe(() => sel.incidentTrend(s, 12, filters, at), []);
  const byType = safe(() => sel.incidentsByType(s, filters, at), []);
  const pareto = safe(() => sel.rootCausePareto(s, filters, at), []).slice(0, 6);
  const incidents = safe(() => sel.filteredIncidents(s, filters, at), []);
  const openHigh = incidents.filter((i) => i.status !== 'مغلق' && Number(i.severity) >= 4).slice(0, 6);
  const matrix = safe(() => sel.riskMatrix(s, filters, at), []);
  const tiers = safe(() => tierCounts(s, filters, at), { 'منخفض': 0, 'متوسط': 0, 'عالٍ': 0, 'حرج': 0 });
  const byCategory = safe(() => sel.risksByCategory(s, filters, at), []).slice(0, 6);
  const overdueRisks = arr(s.risks)
    .filter((r) => r && r.status !== RISK_CLOSED && (filters.siteId === 'all' || r.siteId === filters.siteId) && Date.parse(r.dueDate) < new Date(at.getFullYear(), at.getMonth(), at.getDate()).getTime())
    .sort((a, b) => sel.riskScore(b) - sel.riskScore(a))
    .slice(0, 6)
    .map((r) => ({ id: r.id, code: r.code, hazard: r.hazard, owner: r.owner, dueDate: r.dueDate, score: sel.riskScore(r), tier: sel.riskTier(sel.riskScore(r)), tone: sel.tierTone(sel.riskTier(sel.riskScore(r))) }));
  const permitsByStatus = safe(() => sel.permitsByStatus(s, filters, at), []);
  const permitsByType = (() => {
    const counts = new Map();
    for (const p of safe(() => sel.filteredPermits(s, filters, at), [])) counts.set(p.type, (counts.get(p.type) || 0) + 1);
    return Array.from(counts, ([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);
  })();
  const expiringPermits = safe(() => sel.permitsExpiringSoon(s, 60, filters, at), []).map((p) => ({ id: p.id, code: p.code, type: p.type, siteId: p.siteId, location: p.location, expiresAt: p.expiresAt }));
  const trainingByCourse = safe(() => sel.trainingCompletionByCourse(s, filters, at), []);
  const weakestCourses = trainingByCourse.slice().sort((a, b) => a.pct - b.pct).slice(0, 3);
  const expiring30 = safe(() => sel.expiringCerts(s, 30, filters, at), []);
  const expiring60 = safe(() => sel.expiringCerts(s, 60, filters, at), []);
  const isoScores = safe(() => sel.isoScores(s), []);
  const isoOverall = safe(() => sel.isoOverall(s), 0);
  const isoBelow = isoScores.filter((c) => c.score < ISO_TARGET);
  const isoGaps = isoScores.reduce((sum, c) => sum + (Number(c.gaps) || 0), 0);
  const legal = arr(s.legalRegister);
  const legalCounts = { 'ممتثل': 0, 'جزئي': 0, 'فجوة': 0 };
  for (const item of legal) if (item && legalCounts[item.status] !== undefined) legalCounts[item.status] += 1;
  const urgent = safe(() => sel.urgentActions(s, at, { limit: 8, siteId: filters.siteId }), []);
  const siteScores = safe(() => sel.siteScores(s, at), []).filter((row) => filters.siteId === 'all' || row.site.id === filters.siteId);
  const integ = safe(() => sel.integrationSummary(s), { total: 0, connected: 0, degraded: 0, disconnected: 0 });

  const num = (v, digits = 0) => safeNum(Number(v) || 0, digits);
  const pct = (v) => safePct(Number(v) || 0);

  /* ── narrative ── */
  const summary = [
    `سجّل مؤشر السلامة ${num(k.safetyIndex)} من 100 لنطاق «${scopeLabel}» خلال الفترة ${period.label}، ${versusPrevious(d.safetyIndex, F.point)}.`,
    `بلغ عدد الحوادث المسجلة ${count(k.incidentsInPeriod || 0, F.incident)} (${versusPrevious(d.incidentsInPeriod, F.incident)})، منها ${count(k.nearMisses30d || 0, F.nearMiss)} خلال آخر 30 يومًا، وما زال ${count(k.openIncidents || 0, F.incident)} قيد المتابعة.`,
    `معدل تكرار الإصابات المضيعة للوقت LTIFR بلغ ${num(k.ltifr, 2)} ومعدل الحوادث المسجلة TRIR ${num(k.trir, 2)}، مع ${count(k.daysSinceLTI || 0, F.day)} دون إصابة مضيعة للوقت.`,
    `يضم سجل المخاطر ${count(k.openRisks || 0, F.risk)} مفتوحة، منها ${count(k.criticalRisks || 0, F.risk)} حرجة و${count(k.highRisks || 0, F.risk)} عالية، و${count(k.overdueRisks || 0, F.risk)} تجاوزت موعد المعالجة.`,
    `التصاريح النشطة ${count(k.activePermits || 0, F.permit)}، والامتثال التدريبي ${pct(k.trainingCompliance)} (${versusPrevious(d.trainingCompliance, null, { pctUnit: true })})، ونسبة إغلاق الإجراءات التصحيحية ${pct(k.capaClosure)}.`,
    `متوسط الامتثال لمتطلبات ISO 45001 بلغ ${pct(isoOverall)}${isoBelow.length ? `، مع ${count(isoBelow.length, F.clause)} دون المستهدف (${pct(ISO_TARGET)})` : ' وجميع البنود فوق المستهدف'}.`,
  ];

  const kpiItems = [
    { id: 'safetyIndex', label: 'مؤشر السلامة', value: k.safetyIndex, unit: '/100', delta: d.safetyIndex, deltaGoodWhen: 'up', tone: deltaTone(d.safetyIndex, 'up') },
    { id: 'ltifr', label: 'LTIFR', value: k.ltifr, unit: '', digits: 2, delta: d.ltifr, deltaGoodWhen: 'down', tone: deltaTone(d.ltifr, 'down') },
    { id: 'trir', label: 'TRIR', value: k.trir, unit: '', digits: 2, delta: d.trir, deltaGoodWhen: 'down', tone: deltaTone(d.trir, 'down') },
    { id: 'daysSinceLTI', label: 'أيام دون إصابة مضيعة للوقت', value: k.daysSinceLTI, unit: 'يوم', delta: d.daysSinceLTI, deltaGoodWhen: 'up', tone: deltaTone(d.daysSinceLTI, 'up') },
    { id: 'openIncidents', label: 'الحوادث المفتوحة', value: k.openIncidents, unit: '', delta: d.openIncidents, deltaGoodWhen: 'down', tone: deltaTone(d.openIncidents, 'down') },
    { id: 'nearMisses30d', label: 'الحوادث الوشيكة (30 يومًا)', value: k.nearMisses30d, unit: '', delta: d.nearMisses30d, deltaGoodWhen: 'down', tone: deltaTone(d.nearMisses30d, 'down') },
    { id: 'activePermits', label: 'التصاريح النشطة', value: k.activePermits, unit: '', delta: d.activePermits, deltaGoodWhen: 'up', tone: 'neutral' },
    { id: 'criticalRisks', label: 'المخاطر الحرجة', value: k.criticalRisks, unit: '', delta: d.criticalRisks, deltaGoodWhen: 'down', tone: deltaTone(d.criticalRisks, 'down') },
    { id: 'capaClosure', label: 'إغلاق الإجراءات التصحيحية', value: k.capaClosure, unit: '%', delta: d.capaClosure, deltaGoodWhen: 'up', tone: deltaTone(d.capaClosure, 'up') },
    { id: 'trainingCompliance', label: 'الامتثال التدريبي', value: k.trainingCompliance, unit: '%', delta: d.trainingCompliance, deltaGoodWhen: 'up', tone: deltaTone(d.trainingCompliance, 'up') },
    { id: 'inspectionsDue', label: 'تفتيشات مستحقة', value: k.inspectionsDue, unit: '', delta: d.inspectionsDue, deltaGoodWhen: 'down', tone: deltaTone(d.inspectionsDue, 'down') },
  ];

  const kpiNarrative = [
    `${(d.ltifr || 0) <= 0 ? 'تحسّن' : 'تراجع'} مؤشر LTIFR إلى ${num(k.ltifr, 2)} مقابل ${num(prev.ltifr, 2)} في الفترة السابقة، فيما ${(d.trir || 0) <= 0 ? 'تحسّن' : 'تراجع'} TRIR إلى ${num(k.trir, 2)} مقابل ${num(prev.trir, 2)}.`,
    `${k.inspectionsDue ? `هناك ${count(k.inspectionsDue, F.inspection)} مستحقة خلال الأسبوع القادم أو متأخرة` : 'لا توجد تفتيشات متأخرة أو مستحقة خلال الأسبوع القادم'}، ونسبة إغلاق الإجراءات التصحيحية ${pct(k.capaClosure)} (${versusPrevious(d.capaClosure, null, { pctUnit: true })}).`,
  ];

  const topCause = pareto[0];
  const incidentNarrative = [
    `وقع خلال الفترة ${count(k.incidentsInPeriod || 0, F.incident)}، ${versusPrevious(d.incidentsInPeriod, F.incident)}؛ وتشكّل الحوادث الوشيكة ${pct(incidents.length ? Math.round((incidents.filter((i) => i.type === 'حادث وشيك').length / incidents.length) * 100) : 0)} من البلاغات، وهو مؤشر على ثقافة إبلاغ ${incidents.length && incidents.filter((i) => i.type === 'حادث وشيك').length / incidents.length >= 0.5 ? 'إيجابية' : 'تحتاج إلى تعزيز'}.`,
    topCause ? `السبب الجذري الأكثر تكرارًا هو «${topCause.label}» بنسبة ${pct(topCause.pct)} من الحوادث المصنفة${pareto[1] ? `، يليه «${pareto[1].label}» (${pct(pareto[1].pct)})` : ''}.` : 'لا تتوفر أسباب جذرية مصنفة لحوادث هذه الفترة.',
    openHigh.length ? `ما زال ${count(openHigh.length, F.incident)} بدرجة خطورة عالية (4 فأكثر) مفتوحًا ويستلزم استكمال التحقيق وإغلاق الإجراءات.` : 'لا توجد حوادث مفتوحة بدرجة خطورة عالية.',
  ];

  const riskNarrative = [
    `يتوزع سجل المخاطر المفتوحة على ${count(tiers['حرج'], F.risk)} حرجة، و${count(tiers['عالٍ'], F.risk)} عالية، و${count(tiers['متوسط'], F.risk)} متوسطة، و${count(tiers['منخفض'], F.risk)} منخفضة؛ وعدد المخاطر الحرجة ${versusPrevious(d.criticalRisks, F.risk)}.`,
    byCategory[0] ? `أكثر الفئات تركّزًا هي «${byCategory[0].label}» (${count(byCategory[0].value, F.risk)})${byCategory[1] ? ` تليها «${byCategory[1].label}» (${count(byCategory[1].value, F.risk)})` : ''}.` : 'لا توجد مخاطر مفتوحة ضمن النطاق المحدد.',
    overdueRisks.length ? `تجاوزت ${count(overdueRisks.length, F.risk)} موعد المعالجة المقرر، أبرزها ${overdueRisks.slice(0, 2).map((r) => `${r.code} (${r.tier})`).join(' و')}.` : 'جميع المخاطر المفتوحة ضمن مواعيد المعالجة المقررة.',
  ];

  const activeCount = (permitsByStatus.find((p) => p.id === 'active') || {}).value || 0;
  const pendingCount = (permitsByStatus.find((p) => p.id === 'pending') || {}).value || 0;
  const permitNarrative = [
    `يوجد ${count(activeCount, F.permit)} نشطة و${count(pendingCount, F.permit)} بانتظار الاعتماد${permitsByType[0] ? `، وأكثر الأنواع تداولًا «${permitsByType[0].label}»` : ''}.`,
    expiringPermits.length ? `${count(expiringPermits.length, F.permit)} تنتهي خلال الساعة القادمة وتحتاج إلى إقفال أو تمديد موثق.` : 'لا توجد تصاريح نشطة تنتهي خلال الساعة القادمة.',
  ];

  const trainingNarrative = [
    `بلغ الامتثال التدريبي للدورات الإلزامية ${pct(k.trainingCompliance)}، ${versusPrevious(d.trainingCompliance, null, { pctUnit: true })}.`,
    weakestCourses.length ? `أقل الدورات تغطية: ${weakestCourses.map((c) => `«${c.label}» (${pct(c.pct)})`).join('، ')}.` : 'لا تتوفر بيانات دورات.',
    `${count(expiring30.length, F.cert)} تنتهي خلال 30 يومًا و${count(expiring60.length, F.cert)} خلال 60 يومًا، ويلزم جدولة إعادة التأهيل قبل انتهائها.`,
  ];

  const complianceNarrative = [
    `متوسط درجات بنود ISO 45001 (4–10) هو ${pct(isoOverall)} مقابل مستهدف ${pct(ISO_TARGET)}${isoBelow.length ? `؛ البنود دون المستهدف: ${isoBelow.map((c) => `${c.id} ${c.title} (${pct(c.score)})`).join('، ')}` : '، وجميع البنود تحقق المستهدف'}.`,
    `يضم السجل القانوني ${num(legal.length)} متطلبًا: ${num(legalCounts['ممتثل'])} ممتثل، ${num(legalCounts['جزئي'])} امتثال جزئي، ${num(legalCounts['فجوة'])} فجوة${isoGaps ? `؛ وإجمالي الفجوات الموثقة في بنود المعيار ${num(isoGaps)}` : ''}.`,
  ];

  /* ── recommendations ── */
  const recommendations = [];
  if (k.criticalRisks > 0) recommendations.push({ tone: 'critical', text: `معالجة ${count(k.criticalRisks, F.risk)} حرجة عبر ضوابط هندسية أو إلغاء النشاط قبل استئنافه، ومراجعة التقييم أسبوعيًا حتى تنخفض الدرجة المتبقية دون 10.` });
  if (k.overdueRisks > 0) recommendations.push({ tone: 'serious', text: `إغلاق ${count(k.overdueRisks, F.risk)} متأخرة عن موعد المعالجة وتصعيد المتأخر منها لمدير الموقع مع تواريخ مستهدفة جديدة.` });
  if (openHigh.length) recommendations.push({ tone: 'serious', text: `استكمال التحقيق في ${count(openHigh.length, F.incident)} عالية الخطورة وإغلاق إجراءاتها التصحيحية خلال 14 يومًا.` });
  if (topCause) recommendations.push({ tone: 'warning', text: `استهداف السبب الجذري «${topCause.label}» ببرنامج وقائي مخصص (تدريب، إشراف، إجراءات عمل) لكونه يفسر ${pct(topCause.pct)} من الحوادث.` });
  if (k.trainingCompliance < 90) recommendations.push({ tone: 'warning', text: `رفع الامتثال التدريبي من ${pct(k.trainingCompliance)} إلى 90% على الأقل بجدولة ${count(expiring30.length + expiring60.length, F.cert)} قريبة الانتهاء وتغطية الفجوات في ${weakestCourses.map((c) => `«${c.label}»`).join(' و') || 'الدورات الإلزامية'}.` });
  if (k.inspectionsDue > 0) recommendations.push({ tone: 'warning', text: `تنفيذ ${count(k.inspectionsDue, F.inspection)} مستحقة أو متأخرة وتوثيق نتائجها خلال الأسبوع.` });
  if (isoBelow.length) recommendations.push({ tone: 'warning', text: `خطة تحسين لبنود ISO 45001 دون المستهدف (${isoBelow.map((c) => c.id).join('، ')}) مع مالك ومهلة لكل فجوة قبل التدقيق الداخلي القادم.` });
  if (legalCounts['فجوة'] > 0 || legalCounts['جزئي'] > 0) recommendations.push({ tone: 'warning', text: `معالجة ${num(legalCounts['فجوة'] + legalCounts['جزئي'])} متطلبًا نظاميًا غير مكتمل الامتثال في السجل القانوني وتحديث تواريخ المراجعة.` });
  if (integ.degraded > 0 || integ.disconnected > 0) recommendations.push({ tone: 'warning', text: `استعادة ${num(integ.degraded + integ.disconnected)} تكاملًا متدهورًا أو منقطعًا لضمان اكتمال بيانات الحساسات والحضور في قمرة القيادة.` });
  if (k.capaClosure < 80) recommendations.push({ tone: 'warning', text: `رفع نسبة إغلاق الإجراءات التصحيحية من ${pct(k.capaClosure)} إلى 80% عبر مراجعة أسبوعية للإجراءات المتأخرة.` });
  if (!recommendations.length) recommendations.push({ tone: 'good', text: 'الأداء ضمن المستهدفات؛ يُوصى بالحفاظ على وتيرة الجولات الميدانية واجتماعات صندوق الأدوات وتحديث تقييمات المخاطر قبل كل مرحلة جديدة.' });

  const sections = [
    { id: 'summary', code: 'RPT-01', title: 'الملخص التنفيذي', narrative: summary, highlights: kpiItems.slice(0, 4) },
    { id: 'kpis', code: 'RPT-02', title: 'مؤشرات الأداء', narrative: kpiNarrative, items: kpiItems, siteScores: siteScores.map((row) => ({ siteId: row.site.id, site: row.site.name, city: row.site.city, score: row.score, openRisks: row.openRisks, openIncidents: row.openIncidents, trend: row.trend })) },
    { id: 'incidents', code: 'RPT-03', title: 'الحوادث', narrative: incidentNarrative, trend, byType, pareto, openHigh: openHigh.map((i) => ({ id: i.id, code: i.code, title: i.title, type: i.type, severity: i.severity, status: i.status, siteId: i.siteId, date: i.date })) },
    { id: 'risks', code: 'RPT-04', title: 'المخاطر', narrative: riskNarrative, matrix, tiers, byCategory, overdue: overdueRisks },
    { id: 'permits', code: 'RPT-05', title: 'التصاريح', narrative: permitNarrative, byStatus: permitsByStatus, byType: permitsByType, expiringSoon: expiringPermits },
    { id: 'training', code: 'RPT-06', title: 'التدريب', narrative: trainingNarrative, byCourse: trainingByCourse, expiring30: expiring30.length, expiring60: expiring60.length, expiring: expiring60.slice(0, 12).map((e) => ({ worker: e.worker.name, workerId: e.worker.id, course: e.course.name, expiresAt: e.expiresAt, daysLeft: e.daysLeft, tone: e.tone })) },
    { id: 'compliance', code: 'RPT-07', title: 'الامتثال', narrative: complianceNarrative, isoOverall, target: ISO_TARGET, isoScores: isoScores.map((c) => ({ id: c.id, title: c.title, score: c.score, gaps: c.gaps })), legal: legalCounts, legalRegister: legal.map((l) => ({ id: l.id, title: l.title, authority: l.authority, status: l.status, nextReview: l.nextReview })) },
    { id: 'recommendations', code: 'RPT-08', title: 'التوصيات', narrative: recommendations.map((r) => r.text), items: recommendations, urgent: urgent.map((u) => ({ kind: u.kind, code: u.code, text: u.text, due: u.due, tone: u.tone, href: u.href })) },
  ];

  const cadence = kind === 'quarter' ? 'الربعي' : 'الشهري';
  return {
    title: `تقرير السلامة والصحة المهنية ${cadence} — ${company.name || 'بلتكس'} — ${kind === 'quarter' ? windowLabel : period.month}`,
    subtitle: `${company.product || BRAND.product} · ${company.pillar || BRAND.pillar} · ${scopeLabel} · ${rangeLabel}`,
    company: { name: company.name, product: company.product || BRAND.product, hseProduct: company.hseProduct || BRAND.hseProduct, pillar: company.pillar || BRAND.pillar, tagline: company.tagline },
    generatedAt: new Date().toISOString(),
    period: period.label,
    periodInfo: period,
    kpis: k,
    sections,
  };
}

/* ────────────────────────────── public surface ────────────────────────────── */

export const sources = {
  testConnection,
  importRisks,
  exportCSV,
  exportJSON,
  downloadTemplateCSV,
  postWebhook,
  buildReport,
  // helpers exposed for views/tests (beyond the contract)
  parseCSV,
  toCSV,
  mapRiskRows,
  describeMapping,
  validateUrl,
  parseDate,
  TEMPLATE_COLUMNS,
  MESSAGES,
  BRAND,
};

export default sources;
