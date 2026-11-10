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
import { latinOnly, enumEn, siteEn, courseEn, workerEn } from './vocab-en.js';

export const TIMEOUT_MS = 8000;
export const IMPORT_LIMIT = 1000;
export const ISO_TARGET = 85;

const DAY_MS = 86_400_000;
const LOOPBACK = new Set(['localhost', '127.0.0.1', '[::1]', '::1', '0.0.0.0']);
/** One product name everywhere (V19/RTL-25): the HSE module is a pillar of Biltix Risk AI. */
export const BRAND = Object.freeze({ product: 'بلتكس Risk AI', hseProduct: 'بلتكس Risk AI · السلامة والصحة المهنية', pillar: 'ركيزة السلامة والصحة المهنية' });
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
  simulation: 'وضع العرض التجريبي: لا يوجد اتصال خارجي لاختباره — البيانات تُولَّد في هذا المتصفح.',
  webhookOpaque: 'تم إرسال الطلب، لكن المتصفح لم يتمكن من قراءة الاستجابة بسبب سياسة CORS لدى الخدمة المستقبِلة (استجابة مبهمة)؛ لا يمكن تأكيد الاستلام.',
  noRows: 'لم يُعثر على أي صف يحتوي على وصف للخطر. تحقق من عناوين الأعمدة (الكود، الموقع، الفئة، الخطر…).',
  requiresBackend: 'غير متصل — يتطلب هذا الموصل خادماً خلفياً (بيانات اعتماد وطلبات من جهة الخادم)؛ لا يمكن اختباره من المتصفح.',
});

/** English copies of MESSAGES (same keys) — every result carries `message` (ar) and `messageEn` (en) + `reason` (key). */
export const MESSAGES_EN = Object.freeze({
  invalidUrl: 'The link is not valid. It must start with https:// (http is allowed only for a local server such as localhost).',
  timeout: 'The connection timed out (8 seconds) without a response. Check the link and that the service is available.',
  network: 'The server could not be reached. Check the internet connection and the CORS settings of the target server.',
  noFetch: 'This browser does not support network requests (fetch). Please use a modern browser.',
  notJson: 'The response is not valid JSON. Make sure the link returns an array of records.',
  notArray: 'The response contains no array of records. Expected a JSON array or an object with a data, items or rows field.',
  htmlNotCsv: 'We received a web page instead of a CSV file. In Google Sheets use File → Share → Publish to the web as CSV, then copy the resulting link.',
  scriptNotCsv: 'We received program code (JavaScript) instead of a CSV file. Make sure the link points to a published CSV file, not a page or a script.',
  jsonNotCsv: 'We received a JSON response instead of a CSV file. Choose the "JSON API" source type for this link or use the CSV export link.',
  htmlNotJson: 'We received a web page (HTML) instead of JSON. Check that the link points to an API endpoint that returns JSON.',
  emptyCsv: 'The CSV file is empty or has no header row.',
  unmappedColumns: 'The risk-register columns could not be recognised: a "hazard" column and at least two other known columns are required (site, category, likelihood, severity, owner…).',
  supabaseTable: 'Enter the Supabase table name (for example: risks).',
  supabaseKey: 'Enter the API key (anon key) to connect to Supabase.',
  unknownType: 'Unsupported source type. Available types: JSON API, Google Sheets CSV, Supabase, Webhook.',
  simulation: 'Demo mode: there is no external connection to test — the data is generated in this browser.',
  webhookOpaque: 'The request was sent, but the browser could not read the response because of the receiving service\'s CORS policy (opaque response). Delivery cannot be confirmed.',
  noRows: 'No row with a hazard description was found. Check the column headers (code, site, category, hazard…).',
  requiresBackend: 'Not connected — this connector requires a backend (server-side credentials and requests); it cannot be tested from the browser.',
});

/** Bilingual result fields for a MESSAGES key. */
function msg(key, extra = {}) {
  return { reason: key, message: MESSAGES[key] || key, messageEn: MESSAGES_EN[key] || key, ...extra };
}

function httpMessage(status) {
  if (status === 401 || status === 403) return `رُفض الوصول (HTTP ${status}). تحقق من مفتاح API والصلاحيات.`;
  if (status === 404) return 'المسار غير موجود (HTTP 404). تحقق من الرابط أو اسم الجدول.';
  if (status === 429) return 'تم تجاوز حد الطلبات المسموح (HTTP 429). حاول مرة أخرى بعد قليل.';
  if (status >= 500) return `الخادم يواجه خللاً داخليًا (HTTP ${status}). حاول لاحقًا.`;
  return `استجابة غير متوقعة من الخادم (HTTP ${status}).`;
}

function httpMessageEn(status) {
  if (status === 401 || status === 403) return `Access denied (HTTP ${status}). Check the API key and permissions.`;
  if (status === 404) return 'Path not found (HTTP 404). Check the link or the table name.';
  if (status === 429) return 'Too many requests (HTTP 429). Try again shortly.';
  if (status >= 500) return `The server reported an internal error (HTTP ${status}). Try again later.`;
  return `Unexpected response from the server (HTTP ${status}).`;
}

const TYPE_LABELS = Object.freeze({
  json: 'JSON API',
  sheets: 'Google Sheets CSV',
  supabase: 'Supabase',
  webhook: 'Webhook',
  simulation: 'المحاكاة',
});
const TYPE_LABELS_EN = Object.freeze({ json: 'JSON API', sheets: 'Google Sheets CSV', supabase: 'Supabase', webhook: 'Webhook', simulation: 'Demo data' });

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

/** Bilingual failure fields for a fetch result. */
function failure(result) {
  if (result.error === 'nofetch' || result.error === 'timeout' || result.error === 'network') {
    return msg(result.error === 'nofetch' ? 'noFetch' : result.error);
  }
  return { reason: `http-${result.status}`, message: httpMessage(result.status), messageEn: httpMessageEn(result.status) };
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
const FIELD_LABELS_EN = Object.freeze({
  code: 'Code', siteId: 'Site', categoryId: 'Category', hazard: 'Hazard', activity: 'Activity',
  likelihood: 'Likelihood', severity: 'Severity', owner: 'Owner', dueDate: 'Due date', status: 'Status',
  description: 'Description', controls: 'Controls', residualLikelihood: 'Residual likelihood', residualSeverity: 'Residual severity',
  legalRef: 'Legal reference', source: 'Source', zoneId: 'Zone',
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
  const detectedEn = fields.length ? `Recognised columns: ${fields.map((f) => FIELD_LABELS_EN[f] || f).join(', ')}` : 'No column was recognised';
  const receivedEn = headers.length ? ` · columns received: ${headers.slice(0, 8).join(', ')}${headers.length > 8 ? '…' : ''}` : '';
  const messageEn = ok ? detectedEn : `${MESSAGES_EN.unmappedColumns} ${detectedEn}${receivedEn}.`;
  return { ok, headers, fields, labels, labelsEn: fields.map((f) => FIELD_LABELS_EN[f] || f), unknown, hasHazard, message, messageEn };
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

function parseScale(value, words, fallback, { strict = false } = {}) {
  const raw = latinDigits(text(value));
  if (!raw) return { value: fallback, ok: false };
  const m = /(\d+(?:\.\d+)?)/.exec(raw);
  if (m) {
    const n = Number(m[1]);
    if (strict && (!Number.isInteger(n) || n < 1 || n > 5)) return { value: fallback, ok: false };
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

/* ────────────────────────────── v3: import preview (strict, per-row) ────────────────────────────── */

const SITE_HINT = 'RUH-01 / JED-02 / NEOM-03 / DMM-04 / QID-05 / MED-06';

function rowError(row, field, message, messageEn) {
  return { row, field, message, messageEn };
}

/**
 * Turn an import input into raw records. Accepts { text, format?: 'csv'|'json' } (pasted / uploaded file
 * content), { records: [...] } (already parsed) or a plain array. Returns { records, error? }.
 */
function recordsFromInput(input) {
  if (Array.isArray(input)) return { records: input.filter(isObj) };
  const src = isObj(input) ? input : {};
  if (Array.isArray(src.records)) return { records: src.records.filter(isObj) };
  const body = typeof src.text === 'string' ? src.text : (typeof input === 'string' ? input : '');
  if (!body.trim()) return { records: [], error: msg('emptyCsv') };
  const fmtHint = text(src.format).toLowerCase() || (/\.json$/i.test(text(src.fileName)) ? 'json' : (/\.csv$/i.test(text(src.fileName)) ? 'csv' : ''));
  if (fmtHint === 'json' || (!fmtHint && looksLikeJson(body))) {
    const json = parseJsonText(body);
    if (json.error) return { records: [], error: msg('notJson') };
    const recs = recordsFromJson(json.value);
    return recs ? { records: recs } : { records: [], error: msg('notArray') };
  }
  if (looksLikeHtml(body)) return { records: [], error: msg('htmlNotCsv') };
  const csv = parseCSV(body);
  if (!csv.headers.length) return { records: [], error: msg('emptyCsv') };
  return { records: csv.records };
}

/**
 * Validate raw records as HSE risk-register rows — no silent defaults: an unknown site, an unresolved
 * category, a missing/unparseable likelihood or severity, a missing hazard or an invalid/missing due date
 * is an ERROR for that row; an unknown status or a missing owner is a warning. Row numbers follow the
 * source (header = row 1, first data row = 2).
 */
function previewRecords(records, { sites = arr(seed && seed.sites), categories = CATEGORIES, sourceLabel = 'استيراد' } = {}) {
  const list = arr(records).filter(isObj);
  const headers = Array.from(new Set(list.flatMap((r) => Object.keys(r))));
  const mapping = mapHeaders(headers);
  const described = describeMapping(headers);
  const rows = [];
  const errors = [];
  const warnings = [];
  const seenCodes = new Set();
  list.forEach((record, index) => {
    const rowNo = index + 2;
    const raw = {};
    for (const [hd, field] of mapping) {
      if (record[hd] === undefined || text(record[hd]) === '') continue;
      if (raw[field] === undefined || text(raw[field]) === '') raw[field] = record[hd];
    }
    const rowErrors = [];
    const rowWarnings = [];
    const hazard = text(raw.hazard);
    if (!hazard) rowErrors.push(rowError(rowNo, 'hazard', 'وصف الخطر مطلوب.', 'The hazard description is required.'));
    const siteId = resolveSite(raw.siteId, sites);
    if (!text(raw.siteId)) rowErrors.push(rowError(rowNo, 'siteId', `الموقع مطلوب (${SITE_HINT}).`, `The site is required (${SITE_HINT}).`));
    else if (!siteId) rowErrors.push(rowError(rowNo, 'siteId', `الموقع «${text(raw.siteId)}» غير معروف (${SITE_HINT}).`, `Unknown site "${text(raw.siteId)}" (${SITE_HINT}).`));
    const categoryId = resolveCategory(raw.categoryId, categories) || (text(raw.categoryId) ? null : resolveCategory(hazard, categories));
    if (!categoryId) rowErrors.push(rowError(rowNo, 'categoryId', text(raw.categoryId) ? `الفئة «${text(raw.categoryId)}» غير معروفة.` : 'الفئة مطلوبة.', text(raw.categoryId) ? `Unknown category "${text(raw.categoryId)}".` : 'The category is required.'));
    const likelihood = parseScale(raw.likelihood, LIKELIHOOD_WORDS, null, { strict: true });
    if (!text(raw.likelihood)) rowErrors.push(rowError(rowNo, 'likelihood', 'الاحتمالية مطلوبة (1–5).', 'Likelihood is required (1–5).'));
    else if (!likelihood.ok) rowErrors.push(rowError(rowNo, 'likelihood', `قيمة الاحتمالية «${text(raw.likelihood)}» غير مفهومة (1–5).`, `Likelihood "${text(raw.likelihood)}" is not understood (1–5).`));
    const severity = parseScale(raw.severity, SEVERITY_WORDS, null, { strict: true });
    if (!text(raw.severity)) rowErrors.push(rowError(rowNo, 'severity', 'الشدة مطلوبة (1–5).', 'Severity is required (1–5).'));
    else if (!severity.ok) rowErrors.push(rowError(rowNo, 'severity', `قيمة الشدة «${text(raw.severity)}» غير مفهومة (1–5).`, `Severity "${text(raw.severity)}" is not understood (1–5).`));
    const dueDate = parseDate(raw.dueDate);
    if (!text(raw.dueDate)) rowErrors.push(rowError(rowNo, 'dueDate', 'تاريخ الاستحقاق مطلوب.', 'The due date is required.'));
    else if (!dueDate) rowErrors.push(rowError(rowNo, 'dueDate', `تاريخ الاستحقاق «${text(raw.dueDate)}» غير صالح.`, `The due date "${text(raw.dueDate)}" is not valid.`));
    const code = text(raw.code);
    if (code && seenCodes.has(code)) rowErrors.push(rowError(rowNo, 'code', `الكود ${code} مكرر في الملف.`, `Code ${code} appears twice in the file.`));
    if (code) seenCodes.add(code);
    const statusRaw = text(raw.status);
    const status = resolveStatus(raw.status);
    if (statusRaw && norm(status) !== norm(statusRaw) && !STATUS_RULES.some(([st, re]) => st === status && re.test(norm(statusRaw)))) {
      rowWarnings.push(rowError(rowNo, 'status', `الحالة «${statusRaw}» غير معروفة — ستُسجّل «مفتوح».`, `Unknown status "${statusRaw}" — it will be recorded as Open.`));
    }
    if (!text(raw.owner)) rowWarnings.push(rowError(rowNo, 'owner', 'لا يوجد مالك — ستبقى المخاطرة دون مسؤول.', 'No owner — the risk will stay unassigned.'));
    const lv = likelihood.ok ? likelihood.value : null;
    const sv = severity.ok ? severity.value : null;
    const rl = parseScale(raw.residualLikelihood, LIKELIHOOD_WORDS, lv);
    const rs = parseScale(raw.residualSeverity, SEVERITY_WORDS, sv);
    const data = {
      code: code || undefined,
      siteId: siteId || null,
      categoryId: categoryId || null,
      hazard,
      activity: text(raw.activity),
      description: text(raw.description),
      likelihood: lv,
      severity: sv,
      residualLikelihood: lv ? clamp(rl.value || lv, 1, lv) : null,
      residualSeverity: sv ? clamp(rs.value || sv, 1, sv) : null,
      controls: splitControls(raw.controls),
      owner: text(raw.owner),
      dueDate: dueDate || null,
      status,
      source: text(raw.source) || sourceLabel,
      legalRef: text(raw.legalRef),
    };
    if (text(raw.zoneId)) data.zoneId = text(raw.zoneId);
    const valid = rowErrors.length === 0;
    rows.push({ row: rowNo, valid, data, errors: rowErrors, warnings: rowWarnings, raw: record });
    errors.push(...rowErrors);
    warnings.push(...rowWarnings);
  });
  const validRows = rows.filter((r) => r.valid);
  return {
    ok: validRows.length > 0,
    rows,
    valid: validRows.map((r) => r.data),
    validCount: validRows.length,
    invalidCount: rows.length - validRows.length,
    total: rows.length,
    errors,
    warnings,
    mapping: { ok: described.ok, fields: described.fields, labels: described.labels, labelsEn: described.labelsEn, unknown: described.unknown, message: described.message, messageEn: described.messageEn },
  };
}

/**
 * Import preview (CONTRACT §8 / AC-11) → { rows, valid, errors: [{ row, field, message, messageEn }], warnings,
 * validCount, invalidCount, total, mapping, reason?, message, messageEn }. Nothing is stored here.
 *   • local input — { text, format? | fileName? } or { records } or an array — returns the result directly;
 *   • a remote source — { type: 'json'|'sheets'|'supabase', url, apiKey, table } — returns a Promise of it.
 * Callers may always `await` it.
 */
function importPreview(input = {}) {
  const src = isObj(input) ? input : {};
  const isRemote = !Array.isArray(input) && typeof src.text !== 'string' && !Array.isArray(src.records) && text(src.type);
  const finish = (records, extra = {}) => {
    const p = previewRecords(records, { sourceLabel: extra.sourceLabel || 'استيراد' });
    const summary = p.total
      ? { message: `${safeNum(p.validCount)} صفاً صالحاً من ${safeNum(p.total)}${p.invalidCount ? ` — ${safeNum(p.invalidCount)} بأخطاء لن تُستورد` : ''}.`, messageEn: `${p.validCount} valid row${p.validCount === 1 ? '' : 's'} of ${p.total}${p.invalidCount ? ` — ${p.invalidCount} with errors will not be imported` : ''}.` }
      : msg('noRows');
    return { ...p, ...summary, ...extra, reason: p.total ? (p.validCount ? 'ok' : 'no-valid-rows') : 'noRows' };
  };
  if (isRemote) {
    const kind = text(src.type).toLowerCase();
    return fetchRecords(src, IMPORT_LIMIT).then((res) => {
      if (!res.ok) return { ok: false, rows: [], valid: [], errors: [], warnings: [], validCount: 0, invalidCount: 0, total: 0, mapping: null, reason: res.reason, message: res.message, messageEn: res.messageEn, latencyMs: res.latencyMs, real: true };
      return finish(res.records, { latencyMs: res.latencyMs, real: true, sourceLabel: `استيراد — ${TYPE_LABELS[kind] || kind}` });
    }).catch((err) => ({ ok: false, rows: [], valid: [], errors: [], warnings: [], validCount: 0, invalidCount: 0, total: 0, mapping: null, ...msg('network'), error: err && err.message ? err.message : String(err) }));
  }
  const parsed = recordsFromInput(input);
  if (parsed.error) return { ok: false, rows: [], valid: [], errors: [], warnings: [], validCount: 0, invalidCount: 0, total: 0, mapping: null, ...parsed.error };
  return finish(parsed.records, { sourceLabel: text(src.sourceLabel) || (text(src.fileName) ? `استيراد — ${text(src.fileName)}` : 'استيراد') });
}

/**
 * Commit previewed rows: only VALID rows are added (store.addRisk, one summary feed event instead of one per
 * row). Accepts the preview result, its `rows`, or its `valid` records. `opts.store` overrides the store
 * (tests); `opts.source` labels the batch. Returns { ok, count, ids, skipped, reason, message, messageEn }.
 */
async function commitImport(rowsOrPreview, opts = {}) {
  let list;
  if (isObj(rowsOrPreview) && Array.isArray(rowsOrPreview.rows)) list = rowsOrPreview.rows;
  else if (Array.isArray(rowsOrPreview)) list = rowsOrPreview;
  else list = [];
  let target = opts.store || null;
  if (!target) {
    try { target = (await import('../core/store.js')).store; } catch { target = null; }
  }
  if (!target || typeof target.addRisk !== 'function') return { ok: false, count: 0, ids: [], skipped: list.length, reason: 'no-store', message: 'تعذّر الوصول إلى مخزن البيانات.', messageEn: 'The data store is not available.' };
  const ids = [];
  let skipped = 0;
  for (const item of list) {
    const isRow = isObj(item) && isObj(item.data) && 'valid' in item;
    if (isRow && !item.valid) { skipped += 1; continue; }
    const data = isRow ? item.data : item;
    if (!isObj(data) || !text(data.hazard) || !data.siteId || !data.categoryId || !data.likelihood || !data.severity || !data.dueDate) { skipped += 1; continue; }
    const risk = target.addRisk({ ...data, source: text(opts.source) || data.source || 'استيراد' }, { silent: true });
    if (risk && risk.id) ids.push(risk.id); else skipped += 1;
  }
  if (ids.length && typeof target.pushFeed === 'function') {
    const ev = target.pushFeed({
      type: 'risk', tone: 'accent', siteId: null,
      title: `استيراد ${safeNum(ids.length)} مخاطرة إلى سجل المخاطر${skipped ? ` (استُبعد ${safeNum(skipped)} صفاً غير صالح)` : ''}`,
      titleEn: `${ids.length} risk${ids.length === 1 ? '' : 's'} imported into the risk register${skipped ? ` (${skipped} invalid row${skipped === 1 ? '' : 's'} excluded)` : ''}`,
      detail: text(opts.source) || 'استيراد ملف', detailEn: latinOnly(text(opts.source)) || 'File import',
      sourceId: 'biltix-hse',
    });
    if (ev && opts.bus && typeof opts.bus.emit === 'function') opts.bus.emit('feed:event', ev);
  }
  return {
    ok: ids.length > 0, count: ids.length, ids, skipped, reason: ids.length ? 'ok' : 'nothing-imported',
    message: ids.length ? `تم استيراد ${safeNum(ids.length)} مخاطرة${skipped ? ` واستُبعد ${safeNum(skipped)} صفاً` : ''}.` : 'لم يُستورد أي صف — لا توجد صفوف صالحة.',
    messageEn: ids.length ? `${ids.length} risk${ids.length === 1 ? '' : 's'} imported${skipped ? `; ${skipped} row${skipped === 1 ? '' : 's'} excluded` : ''}.` : 'Nothing was imported — there are no valid rows.',
  };
}

/* ────────────────────────────── adapters ────────────────────────────── */

async function fetchRecords({ type, url, apiKey, table }, limit) {
  const kind = text(type).toLowerCase();
  const none = { records: [], latencyMs: 0, status: 0 };
  if (kind === 'simulation' || !kind) return { ok: false, ...msg('simulation'), ...none };
  if (!['json', 'sheets', 'supabase'].includes(kind)) return { ok: false, ...msg('unknownType'), ...none };
  const parsed = validateUrl(url);
  if (!parsed) return { ok: false, ...msg('invalidUrl'), ...none };

  let target = parsed.href;
  const headers = { Accept: kind === 'sheets' ? 'text/csv, text/plain, */*' : 'application/json' };
  if (kind === 'supabase') {
    if (!text(table)) return { ok: false, ...msg('supabaseTable'), ...none };
    if (!text(apiKey)) return { ok: false, ...msg('supabaseKey'), ...none };
    target = supabaseEndpoint(parsed, table, limit);
    headers.apikey = text(apiKey);
    headers.Authorization = `Bearer ${text(apiKey)}`;
  } else if (kind === 'sheets') {
    target = normalizeSheetsUrl(parsed).href;
  } else if (text(apiKey)) {
    headers.Authorization = `Bearer ${text(apiKey)}`;
  }

  const result = await request(target, { method: 'GET', headers, mode: 'cors', credentials: 'omit' });
  if (!result.ok) return { ok: false, ...failure(result), records: [], latencyMs: result.latencyMs, status: result.status };

  const body = await readText(result.response);
  const fail = (key, extra = {}) => ({ ok: false, ...(typeof key === 'string' ? msg(key) : key), records: [], latencyMs: result.latencyMs, status: result.status, ...extra });
  if (kind === 'sheets') {
    if (looksLikeHtml(body)) return fail('htmlNotCsv');
    if (looksLikeScript(body)) return fail('scriptNotCsv');
    if (looksLikeJson(body)) return fail('jsonNotCsv');
    const csv = parseCSV(body);
    if (!csv.headers.length) return fail('emptyCsv');
    // C-14: a CSV is accepted only when its header row reads as a risk register.
    const mapping = describeMapping(csv.headers);
    if (!mapping.ok) return fail({ reason: 'unmappedColumns', message: mapping.message, messageEn: mapping.messageEn });
    return { ok: true, message: '', messageEn: '', records: csv.records.slice(0, limit), latencyMs: result.latencyMs, status: result.status, mapping };
  }
  if (looksLikeHtml(body)) return fail('htmlNotJson');
  if (!looksLikeJson(body) && looksLikeScript(body)) return fail('notJson');
  const json = parseJsonText(body);
  if (json.error) return fail('notJson');
  const records = recordsFromJson(json.value);
  if (!records) return fail('notArray');
  // Same mapping gate for JSON / Supabase rows (an empty result set is still a valid connection).
  const mapping = records.length ? describeMapping(records) : null;
  if (mapping && !mapping.ok) return fail({ reason: 'unmappedColumns', message: mapping.message, messageEn: mapping.messageEn });
  return { ok: true, message: '', messageEn: '', records: records.slice(0, limit), latencyMs: result.latencyMs, status: result.status, mapping };
}

async function pingWebhook(url) {
  const parsed = validateUrl(url);
  if (!parsed) return { ok: false, latencyMs: 0, status: 0, ...msg('invalidUrl') };
  const started = nowMs();
  const res = await postWebhook(parsed.href, {
    type: 'ping',
    source: 'BILTIX Risk AI',
    text: 'اختبار اتصال من بلتكس Risk AI — Connection test from BILTIX Risk AI',
    sentAt: new Date().toISOString(),
  });
  const latencyMs = Math.round(nowMs() - started);
  return { ...res, latencyMs: res.latencyMs ?? latencyMs };
}

/** Source types that a browser can genuinely test over HTTP; everything else needs a backend. */
export const REAL_TEST_TYPES = Object.freeze(['json', 'sheets', 'supabase', 'webhook']);

/**
 * Probe a data source. Never rejects. HONEST by design (CONTRACT §5): `ok: true` only after a real HTTP
 * request succeeded (json / sheets / supabase GET, webhook POST with a readable 2xx). Demo mode and
 * connectors without a browser-testable endpoint return ok:false with `skipped: true` and a reason
 * ('simulation' | 'requiresBackend'); an opaque webhook response is `ok: false, opaque: true` (delivery
 * unconfirmed). Every result: { ok, latencyMs, status, reason, message, messageEn, real }.
 */
async function testConnection(config = {}) {
  try {
    const kind = text(config.type).toLowerCase();
    if (kind === 'simulation' || !kind) return { ok: false, skipped: true, real: false, latencyMs: 0, status: 0, ...msg('simulation') };
    if (!REAL_TEST_TYPES.includes(kind)) return { ok: false, skipped: true, real: false, latencyMs: 0, status: 0, ...msg('requiresBackend') };
    if (kind === 'webhook') {
      const res = await pingWebhook(config.url);
      return { ...res, ok: Boolean(res.ok && !res.opaque), real: true };
    }
    const res = await fetchRecords(config, 1);
    if (!res.ok) return { ok: false, real: true, latencyMs: res.latencyMs, status: res.status, reason: res.reason, message: res.message, messageEn: res.messageEn };
    const label = TYPE_LABELS[kind] || kind;
    const labelEn = TYPE_LABELS_EN[kind] || kind;
    const n = res.records.length;
    const sample = n ? ` — تم استلام ${safeNum(n)} سجل تجريبي` : ' — الاستجابة صحيحة لكنها فارغة';
    const sampleEn = n ? ` — ${n} sample record${n === 1 ? '' : 's'} received` : ' — the response is valid but empty';
    const mapped = res.mapping && res.mapping.labels && res.mapping.labels.length ? ` · ${res.mapping.message}` : '';
    const mappedEn = res.mapping && res.mapping.labels && res.mapping.labels.length ? ` · ${res.mapping.messageEn}` : '';
    return {
      ok: true, real: true, latencyMs: res.latencyMs, status: res.status, count: n, reason: 'ok',
      mapping: res.mapping ? { fields: res.mapping.fields, labels: res.mapping.labels, labelsEn: res.mapping.labelsEn, unknown: res.mapping.unknown } : null,
      message: `تم الاتصال بنجاح بـ ${label} خلال ${safeNum(res.latencyMs)} مللي ثانية${sample}${mapped}.`,
      messageEn: `Connected to ${labelEn} in ${res.latencyMs} ms${sampleEn}${mappedEn}.`,
    };
  } catch (err) {
    return { ok: false, real: true, latencyMs: 0, status: 0, ...msg('network'), error: err && err.message ? err.message : String(err) };
  }
}

/**
 * Fetch rows from the source and map them to the Risk schema (lenient legacy mapper, see importPreview for
 * the strict per-row validation used before committing). Never rejects.
 * @returns {Promise<{count:number, risks:object[], skipped:number, warnings:string[], ok:boolean, message:string, messageEn:string}>}
 */
async function importRisks(config = {}, options = {}) {
  try {
    const kind = text(config.type).toLowerCase();
    const res = await fetchRecords(config, IMPORT_LIMIT);
    if (!res.ok) return { count: 0, risks: [], skipped: 0, warnings: [], ok: false, reason: res.reason, message: res.message, messageEn: res.messageEn, latencyMs: res.latencyMs };
    const mapped = mapRiskRows(res.records, { ...options, sourceLabel: `استيراد — ${TYPE_LABELS[kind] || kind}` });
    const ok = mapped.risks.length > 0;
    const columns = res.mapping && res.mapping.labels && res.mapping.labels.length ? ` · ${res.mapping.message}` : '';
    const message = ok
      ? `تم استيراد ${safeNum(mapped.risks.length)} مخاطرة من ${TYPE_LABELS[kind] || kind}${mapped.skipped ? ` وتجاهل ${safeNum(mapped.skipped)} صفًا دون وصف للخطر` : ''}${columns}.`
      : MESSAGES.noRows;
    const messageEn = ok
      ? `${mapped.risks.length} risk${mapped.risks.length === 1 ? '' : 's'} read from ${TYPE_LABELS_EN[kind] || kind}${mapped.skipped ? `; ${mapped.skipped} row(s) without a hazard skipped` : ''}.`
      : MESSAGES_EN.noRows;
    return {
      count: mapped.risks.length, risks: mapped.risks, skipped: mapped.skipped, warnings: mapped.warnings, ok, reason: ok ? 'ok' : 'noRows', message, messageEn, latencyMs: res.latencyMs,
      records: res.records,
      mapping: res.mapping ? { fields: res.mapping.fields, labels: res.mapping.labels, labelsEn: res.mapping.labelsEn, unknown: res.mapping.unknown } : null,
    };
  } catch (err) {
    return { count: 0, risks: [], skipped: 0, warnings: [], ok: false, ...msg('network'), error: err && err.message ? err.message : String(err) };
  }
}

/**
 * POST a JSON payload to a webhook (Slack / Teams / n8n / Zapier…). Tries a CORS request first; if the
 * browser blocks it, falls back to an opaque no-cors request — then `ok: true, opaque: true` means "sent,
 * delivery NOT confirmed" (callers must not show a success claim for it). Never rejects.
 * @returns {Promise<{ok:boolean, status:number, message:string, messageEn:string, opaque?:boolean, latencyMs?:number}>}
 */
async function postWebhook(url, payload = {}) {
  try {
    const parsed = validateUrl(url);
    if (!parsed) return { ok: false, status: 0, ...msg('invalidUrl') };
    const bodyObj = isObj(payload) ? payload : { text: text(payload) };
    let body;
    try { body = JSON.stringify(bodyObj); } catch { return { ok: false, status: 0, reason: 'payload', message: 'تعذّر تحويل الحمولة إلى JSON.', messageEn: 'The payload could not be converted to JSON.' }; }

    const first = await request(parsed.href, { method: 'POST', mode: 'cors', credentials: 'omit', headers: { 'Content-Type': 'application/json' }, body });
    if (first.response) {
      return {
        ok: first.ok,
        status: first.status,
        latencyMs: first.latencyMs,
        reason: first.ok ? 'ok' : `http-${first.status}`,
        message: first.ok ? `استلمت الخدمة الطلب (HTTP ${first.status}).` : httpMessage(first.status),
        messageEn: first.ok ? `The service accepted the request (HTTP ${first.status}).` : httpMessageEn(first.status),
      };
    }
    if (first.error === 'timeout') return { ok: false, status: 0, latencyMs: first.latencyMs, ...msg('timeout') };
    if (first.error === 'nofetch') return { ok: false, status: 0, ...msg('noFetch') };

    // CORS-blocked endpoints (Slack, Teams…) still accept an opaque request without a preflight.
    const second = await request(parsed.href, { method: 'POST', mode: 'no-cors', credentials: 'omit', headers: { 'Content-Type': 'text/plain;charset=UTF-8' }, body });
    if (second.response) return { ok: true, status: 0, opaque: true, latencyMs: second.latencyMs, ...msg('webhookOpaque') };
    return { ok: false, status: 0, latencyMs: second.latencyMs, ...msg(second.error === 'timeout' ? 'timeout' : 'network') };
  } catch (err) {
    return { ok: false, status: 0, ...msg('network'), error: err && err.message ? err.message : String(err) };
  }
}

/* ────────────────────────────── exports ────────────────────────────── */

function exportCSV(rows, columns, filename) {
  const csv = toCSV(rows, columns);
  download(csv, safeFilename(filename, 'biltix-risk-ai-export.csv'), 'text/csv;charset=utf-8');
  return csv;
}

function exportJSON(obj, filename) {
  let json;
  try { json = JSON.stringify(obj, null, 2); } catch { json = JSON.stringify({ error: 'تعذّر تحويل البيانات إلى JSON' }); }
  download(json, safeFilename(filename, 'biltix-risk-ai-export.json'), 'application/json;charset=utf-8');
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
  download(csv, 'biltix-risk-ai-risks-template.csv', 'text/csv;charset=utf-8');
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
  // Open high-severity incidents use the sel.urgentActions rule (open, severity ≥ 4, site scope, any date):
  // an incident reported before the period is still open work. `openHighCount` is the total; `openHigh` lists the top 6.
  const incidentById = new Map(arr(s.incidents).filter(Boolean).map((i) => [i.id, i]));
  const openHighAll = safe(() => sel.urgentActions(s, at, { siteId: filters.siteId }), [])
    .filter((a) => a && a.kind === 'incident')
    .map((a) => incidentById.get(a.id))
    .filter(Boolean)
    .sort((a, b) => (Number(b.severity) || 0) - (Number(a.severity) || 0) || String(b.date || '').localeCompare(String(a.date || '')));
  const openHighCount = openHighAll.length;
  const openHigh = openHighAll.slice(0, 6);
  const matrix = safe(() => sel.riskMatrix(s, filters, at), []);
  const tiers = safe(() => tierCounts(s, filters, at), { 'منخفض': 0, 'متوسط': 0, 'عالٍ': 0, 'حرج': 0 });
  const byCategory = safe(() => sel.risksByCategory(s, filters, at), []).slice(0, 6);
  // ONE overdue definition (sel.overdueRisks) — the same list feeds kpis.overdueRisks, the urgent actions,
  // the overview and every sentence of this report; `overdue` lists the top 6, `overdueCount` is the total.
  const overdueAll = safe(() => sel.overdueRisks(s, filters, at), []);
  const overdueCount = overdueAll.length;
  const overdueRisks = overdueAll
    .slice(0, 6)
    .map((r) => ({ id: r.id, code: r.code, hazard: r.hazard, owner: r.owner, dueDate: r.dueDate, score: r.score, tier: r.tier, tone: r.tone, daysOverdue: r.daysOverdue }));
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
    `سجّل مؤشر السلامة ${num(k.safetyIndex)} من ${num(100)} لنطاق «${scopeLabel}» خلال الفترة ${period.label}، ${versusPrevious(d.safetyIndex, F.point)}.`,
    `بلغ عدد الحوادث المسجلة ${count(k.incidentsInPeriod || 0, F.incident)} (${versusPrevious(d.incidentsInPeriod, F.incident)})، منها ${count(k.nearMisses30d || 0, F.nearMiss)} خلال آخر ${count(30, F.day)}، وما زال ${count(k.openIncidents || 0, F.incident)} قيد المتابعة.`,
    `معدل تكرار الإصابات المضيعة للوقت LTIFR بلغ ${num(k.ltifr, 2)} ومعدل الحوادث المسجلة TRIR ${num(k.trir, 2)}، مع ${count(k.daysSinceLTI || 0, F.day)} دون إصابة مضيعة للوقت.`,
    `يضم سجل المخاطر ${count(k.openRisks || 0, F.risk)} مفتوحة، منها ${count(k.criticalRisks || 0, F.risk)} حرجة و${count(k.highRisks || 0, F.risk)} عالية، و${count(overdueCount, F.risk)} تجاوزت موعد المعالجة.`,
    `التصاريح النشطة ${count(k.activePermits || 0, F.permit)}، والامتثال التدريبي ${pct(k.trainingCompliance)} (${versusPrevious(d.trainingCompliance, null, { pctUnit: true })})، ونسبة إغلاق الإجراءات التصحيحية ${pct(k.capaClosure)}.`,
    `متوسط الامتثال لمتطلبات ISO 45001 بلغ ${pct(isoOverall)}${isoBelow.length ? `، مع ${count(isoBelow.length, F.clause)} دون المستهدف (${pct(ISO_TARGET)})` : ' وجميع البنود فوق المستهدف'}.`,
  ];

  const kpiItems = [
    { id: 'safetyIndex', label: 'مؤشر السلامة', value: k.safetyIndex, unit: '/100', delta: d.safetyIndex, deltaGoodWhen: 'up', tone: deltaTone(d.safetyIndex, 'up') },
    { id: 'ltifr', label: 'LTIFR', value: k.ltifr, unit: '', digits: 2, delta: d.ltifr, deltaGoodWhen: 'down', tone: deltaTone(d.ltifr, 'down') },
    { id: 'trir', label: 'TRIR', value: k.trir, unit: '', digits: 2, delta: d.trir, deltaGoodWhen: 'down', tone: deltaTone(d.trir, 'down') },
    { id: 'daysSinceLTI', label: 'أيام دون إصابة مضيعة للوقت', value: k.daysSinceLTI, unit: 'يوم', delta: d.daysSinceLTI, deltaGoodWhen: 'up', tone: deltaTone(d.daysSinceLTI, 'up') },
    { id: 'openIncidents', label: 'الحوادث المفتوحة', value: k.openIncidents, unit: '', delta: d.openIncidents, deltaGoodWhen: 'down', tone: deltaTone(d.openIncidents, 'down') },
    // Near misses carry no good/bad judgement: a rise can mean more hazards or a healthier reporting culture.
    { id: 'nearMisses30d', label: `الحوادث الوشيكة (${count(30, F.day)})`, value: k.nearMisses30d, unit: '', delta: d.nearMisses30d, deltaGoodWhen: 'none', tone: 'neutral' },
    { id: 'activePermits', label: 'التصاريح النشطة', value: k.activePermits, unit: '', delta: d.activePermits, deltaGoodWhen: 'up', tone: 'neutral' },
    { id: 'criticalRisks', label: 'المخاطر الحرجة', value: k.criticalRisks, unit: '', delta: d.criticalRisks, deltaGoodWhen: 'down', tone: deltaTone(d.criticalRisks, 'down') },
    { id: 'capaClosure', label: 'إغلاق الإجراءات التصحيحية', value: k.capaClosure, unit: '%', delta: d.capaClosure, deltaGoodWhen: 'up', tone: deltaTone(d.capaClosure, 'up') },
    { id: 'trainingCompliance', label: 'الامتثال التدريبي', value: k.trainingCompliance, unit: '%', delta: d.trainingCompliance, deltaGoodWhen: 'up', tone: deltaTone(d.trainingCompliance, 'up') },
    { id: 'inspectionsDue', label: 'تفتيشات مستحقة', value: k.inspectionsDue, unit: '', delta: d.inspectionsDue, deltaGoodWhen: 'down', tone: deltaTone(d.inspectionsDue, 'down') },
  ];

  // Direction words come from sel.describeDelta so an increase is never described as a decrease.
  const moveAr = (delta, goodWhen, name, value, before) => {
    const dd = sel.describeDelta(delta, goodWhen);
    if (dd.direction === 'flat') return `استقر ${name} عند ${value} دون تغيّر عن الفترة السابقة`;
    return `${dd.direction === 'up' ? 'ارتفع' : 'انخفض'} ${name} إلى ${value} مقابل ${before} في الفترة السابقة (${dd.good ? 'تحسّن في الأداء' : 'تراجع في الأداء'})`;
  };
  const moveEn = (delta, goodWhen, name, value, before) => {
    const dd = sel.describeDelta(delta, goodWhen);
    if (dd.direction === 'flat') return `${name} held at ${value}, unchanged from the previous period`;
    return `${name} ${dd.direction === 'up' ? 'rose' : 'fell'} to ${value} from ${before} in the previous period (${dd.good ? 'an improvement' : 'a deterioration'})`;
  };
  const kpiNarrative = [
    `${moveAr(d.ltifr, 'down', 'مؤشر LTIFR', num(k.ltifr, 2), num(prev.ltifr, 2))}، و${moveAr(d.trir, 'down', 'مؤشر TRIR', num(k.trir, 2), num(prev.trir, 2))}.`,
    `${k.inspectionsDue ? `هناك ${count(k.inspectionsDue, F.inspection)} مستحقة خلال الأسبوع القادم أو متأخرة` : 'لا توجد تفتيشات متأخرة أو مستحقة خلال الأسبوع القادم'}، ونسبة إغلاق الإجراءات التصحيحية ${pct(k.capaClosure)} (${versusPrevious(d.capaClosure, null, { pctUnit: true })}).`,
  ];

  const topCause = pareto[0];
  const incidentNarrative = [
    `وقع خلال الفترة ${count(k.incidentsInPeriod || 0, F.incident)}، ${versusPrevious(d.incidentsInPeriod, F.incident)}؛ وتشكّل الحوادث الوشيكة ${pct(incidents.length ? Math.round((incidents.filter((i) => i.type === 'حادث وشيك').length / incidents.length) * 100) : 0)} من البلاغات، وهو مؤشر على ثقافة إبلاغ ${incidents.length && incidents.filter((i) => i.type === 'حادث وشيك').length / incidents.length >= 0.5 ? 'إيجابية' : 'تحتاج إلى تعزيز'}.`,
    topCause ? `السبب الجذري الأكثر تكرارًا هو «${topCause.label}» بنسبة ${pct(topCause.pct)} من الحوادث المصنفة${pareto[1] ? `، يليه «${pareto[1].label}» (${pct(pareto[1].pct)})` : ''}.` : 'لا تتوفر أسباب جذرية مصنفة لحوادث هذه الفترة.',
    openHighCount ? `ما زال ${count(openHighCount, F.incident)} بدرجة خطورة عالية (${num(4)} فأكثر) مفتوحًا ويستلزم استكمال التحقيق وإغلاق الإجراءات.` : 'لا توجد حوادث مفتوحة بدرجة خطورة عالية.',
  ];

  const riskNarrative = [
    `يتوزع سجل المخاطر المفتوحة على ${count(tiers['حرج'], F.risk)} حرجة، و${count(tiers['عالٍ'], F.risk)} عالية، و${count(tiers['متوسط'], F.risk)} متوسطة، و${count(tiers['منخفض'], F.risk)} منخفضة؛ وعدد المخاطر الحرجة ${versusPrevious(d.criticalRisks, F.risk)}.`,
    byCategory[0] ? `أكثر الفئات تركّزًا هي «${byCategory[0].label}» (${count(byCategory[0].value, F.risk)})${byCategory[1] ? ` تليها «${byCategory[1].label}» (${count(byCategory[1].value, F.risk)})` : ''}.` : 'لا توجد مخاطر مفتوحة ضمن النطاق المحدد.',
    overdueCount ? `تجاوزت ${count(overdueCount, F.risk)} موعد المعالجة المقرر، أبرزها ${overdueRisks.slice(0, 2).map((r) => `${r.code} (${r.tier})`).join(' و')}.` : 'جميع المخاطر المفتوحة ضمن مواعيد المعالجة المقررة.',
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
    `${count(expiring30.length, F.cert)} تنتهي خلال ${count(30, F.day)} و${count(expiring60.length, F.cert)} خلال ${count(60, F.day)}، ويلزم جدولة إعادة التأهيل قبل انتهائها.`,
  ];

  const complianceNarrative = [
    `متوسط درجات بنود ISO 45001 (${num(4)}–${num(10)}) هو ${pct(isoOverall)} مقابل مستهدف ${pct(ISO_TARGET)}${isoBelow.length ? `؛ البنود دون المستهدف: ${isoBelow.map((c) => `${c.id} ${c.title} (${pct(c.score)})`).join('، ')}` : '، وجميع البنود تحقق المستهدف'}.`,
    `يضم السجل القانوني ${num(legal.length)} متطلبًا: ${num(legalCounts['ممتثل'])} ممتثل، ${num(legalCounts['جزئي'])} امتثال جزئي، ${num(legalCounts['فجوة'])} فجوة${isoGaps ? `؛ وإجمالي الفجوات الموثقة في بنود المعيار ${num(isoGaps)}` : ''}.`,
  ];

  /* ── recommendations ── */
  const recommendations = [];
  if (k.criticalRisks > 0) recommendations.push({ tone: 'critical', text: `معالجة ${count(k.criticalRisks, F.risk)} حرجة عبر ضوابط هندسية أو إلغاء النشاط قبل استئنافه، ومراجعة التقييم أسبوعيًا حتى تنخفض الدرجة المتبقية دون ${num(10)}.` });
  if (overdueCount > 0) recommendations.push({ tone: 'serious', text: `إغلاق ${count(overdueCount, F.risk)} متأخرة عن موعد المعالجة وتصعيد المتأخر منها لمدير الموقع مع تواريخ مستهدفة جديدة.` });
  if (openHighCount) recommendations.push({ tone: 'serious', text: `استكمال التحقيق في ${count(openHighCount, F.incident)} عالية الخطورة وإغلاق إجراءاتها التصحيحية خلال ${count(14, F.day)}.` });
  if (topCause) recommendations.push({ tone: 'warning', text: `استهداف السبب الجذري «${topCause.label}» ببرنامج وقائي مخصص (تدريب، إشراف، إجراءات عمل) لكونه يفسر ${pct(topCause.pct)} من الحوادث.` });
  if (k.trainingCompliance < 90) recommendations.push({ tone: 'warning', text: `رفع الامتثال التدريبي من ${pct(k.trainingCompliance)} إلى ${pct(90)} على الأقل بجدولة ${count(expiring60.length, F.cert)} قريبة الانتهاء وتغطية الفجوات في ${weakestCourses.map((c) => `«${c.label}»`).join(' و') || 'الدورات الإلزامية'}.` });
  if (k.inspectionsDue > 0) recommendations.push({ tone: 'warning', text: `تنفيذ ${count(k.inspectionsDue, F.inspection)} مستحقة أو متأخرة وتوثيق نتائجها خلال الأسبوع.` });
  if (isoBelow.length) recommendations.push({ tone: 'warning', text: `خطة تحسين لبنود ISO 45001 دون المستهدف (${isoBelow.map((c) => c.id).join('، ')}) مع مالك ومهلة لكل فجوة قبل التدقيق الداخلي القادم.` });
  if (legalCounts['فجوة'] > 0 || legalCounts['جزئي'] > 0) recommendations.push({ tone: 'warning', text: `معالجة ${num(legalCounts['فجوة'] + legalCounts['جزئي'])} متطلبًا نظاميًا غير مكتمل الامتثال في السجل القانوني وتحديث تواريخ المراجعة.` });
  if (integ.degraded > 0 || integ.disconnected > 0) recommendations.push({ tone: 'warning', text: `استعادة ${num(integ.degraded + integ.disconnected)} تكاملًا متدهورًا أو منقطعًا لضمان اكتمال بيانات الحساسات والحضور في قمرة القيادة.` });
  if (k.capaClosure < 80) recommendations.push({ tone: 'warning', text: `رفع نسبة إغلاق الإجراءات التصحيحية من ${pct(k.capaClosure)} إلى ${pct(80)} عبر مراجعة أسبوعية للإجراءات المتأخرة.` });
  if (!recommendations.length) recommendations.push({ tone: 'good', text: 'الأداء ضمن المستهدفات؛ يُوصى بالحفاظ على وتيرة الجولات الميدانية واجتماعات صندوق الأدوات وتحديث تقييمات المخاطر قبل كل مرحلة جديدة.' });

  /* ── English narrative (same facts, same definitions; numbers formatted by the view) ── */
  const n0 = (v, digits = 0) => (Number(v) || 0).toFixed(digits);
  const pe = (v) => `${Math.round(Number(v) || 0)}%`;
  const plural = (v, one, many) => `${Math.abs(Math.round(Number(v) || 0))} ${Math.abs(Math.round(Number(v) || 0)) === 1 ? one : many}`;
  const vsPrevEn = (delta, one, many, { pp = false, digits = 0 } = {}) => {
    const dd = sel.describeDelta(Math.abs(Number(delta) || 0) < (digits ? 0.005 : 0.5) ? 0 : delta, 'none');
    if (dd.direction === 'flat') return 'unchanged from the previous period';
    const amount = pp ? `${n0(Math.abs(delta), digits)} percentage point${Math.abs(delta) === 1 ? '' : 's'}` : (one ? plural(delta, one, many) : n0(Math.abs(delta), digits));
    return `${dd.direction === 'up' ? 'up' : 'down'} ${amount} on the previous period`;
  };
  const scopeEn = site ? siteEn(site) : 'all sites';
  const catEn = (c) => enumEn('hseCategory', c.id, c.label);
  const tierEn = (t) => enumEn('tier', t, t);
  const periodLabelEn = kind === 'month' ? `${fromDate.toLocaleString('en-GB', { month: 'long', year: 'numeric' })}` : (kind === 'quarter' ? `Q${Math.floor(fromDate.getMonth() / 3) + 1} ${fromDate.getFullYear()}` : `Last ${filters.range} days`);
  const nearMissShare = incidents.length ? Math.round((incidents.filter((i) => i.type === 'حادث وشيك').length / incidents.length) * 100) : 0;
  const summaryEn = [
    `The safety index scored ${n0(k.safetyIndex)} out of 100 for ${scopeEn} ${kind === 'month' || kind === 'quarter' ? `in ${periodLabelEn}` : `over the last ${filters.range} days`}, ${vsPrevEn(d.safetyIndex, 'point', 'points')}.`,
    `${plural(k.incidentsInPeriod || 0, 'incident was', 'incidents were')} recorded (${vsPrevEn(d.incidentsInPeriod, 'incident', 'incidents')}), including ${plural(k.nearMisses30d || 0, 'near miss', 'near misses')} in the last 30 days; ${plural(k.openIncidents || 0, 'incident remains', 'incidents remain')} open.`,
    `LTIFR stands at ${n0(k.ltifr, 2)} and TRIR at ${n0(k.trir, 2)}, with ${plural(k.daysSinceLTI || 0, 'day', 'days')} since the last lost-time injury.`,
    `The risk register holds ${plural(k.openRisks || 0, 'open risk', 'open risks')}: ${n0(k.criticalRisks)} critical, ${n0(k.highRisks)} high, and ${plural(overdueCount, 'risk', 'risks')} past the treatment due date.`,
    `${plural(k.activePermits || 0, 'permit is', 'permits are')} active; training compliance is ${pe(k.trainingCompliance)} (${vsPrevEn(d.trainingCompliance, null, null, { pp: true })}) and corrective-action closure ${pe(k.capaClosure)}.`,
    `Average ISO 45001 compliance is ${pe(isoOverall)}${isoBelow.length ? `, with ${plural(isoBelow.length, 'clause', 'clauses')} below the ${pe(ISO_TARGET)} target` : ' and every clause is above target'}.`,
  ];
  const kpiNarrativeEn = [
    `${moveEn(d.ltifr, 'down', 'LTIFR', n0(k.ltifr, 2), n0(prev.ltifr, 2))}; ${moveEn(d.trir, 'down', 'TRIR', n0(k.trir, 2), n0(prev.trir, 2))}.`,
    `${k.inspectionsDue ? `${plural(k.inspectionsDue, 'inspection is', 'inspections are')} due within the next week or overdue` : 'No inspection is overdue or due within the next week'}; corrective-action closure is ${pe(k.capaClosure)} (${vsPrevEn(d.capaClosure, null, null, { pp: true })}).`,
  ];
  const incidentNarrativeEn = [
    `${plural(k.incidentsInPeriod || 0, 'incident', 'incidents')} occurred in the period, ${vsPrevEn(d.incidentsInPeriod, 'incident', 'incidents')}; near misses make up ${pe(nearMissShare)} of reports, ${nearMissShare >= 50 ? 'a sign of a healthy reporting culture' : 'so reporting culture needs strengthening'}.`,
    topCause ? `The most frequent root cause is "${enumEn('rootCause', topCause.label, topCause.label)}" at ${pe(topCause.pct)} of classified incidents${pareto[1] ? `, followed by "${enumEn('rootCause', pareto[1].label, pareto[1].label)}" (${pe(pareto[1].pct)})` : ''}.` : 'No classified root causes are available for this period.',
    openHighCount ? `${plural(openHighCount, 'high-severity incident (4+) is', 'high-severity incidents (4+) are')} still open and need the investigation and corrective actions completed.` : 'There are no open high-severity incidents.',
  ];
  const riskNarrativeEn = [
    `Open risks: ${n0(tiers['حرج'])} critical, ${n0(tiers['عالٍ'])} high, ${n0(tiers['متوسط'])} medium and ${n0(tiers['منخفض'])} low; the number of critical risks is ${vsPrevEn(d.criticalRisks, 'risk', 'risks')}.`,
    byCategory[0] ? `The largest concentration is "${catEn(byCategory[0])}" (${plural(byCategory[0].value, 'risk', 'risks')})${byCategory[1] ? `, followed by "${catEn(byCategory[1])}" (${plural(byCategory[1].value, 'risk', 'risks')})` : ''}.` : 'There are no open risks in the selected scope.',
    overdueCount ? `${plural(overdueCount, 'risk is', 'risks are')} past the treatment due date, led by ${overdueRisks.slice(0, 2).map((r) => `${r.code} (${tierEn(r.tier)})`).join(' and ')}.` : 'Every open risk is within its treatment due date.',
  ];
  const permitNarrativeEn = [
    `${plural(activeCount, 'permit is', 'permits are')} active and ${plural(pendingCount, 'is', 'are')} awaiting approval${permitsByType[0] ? `; the most common type is "${enumEn('permitType', permitsByType[0].label, permitsByType[0].label)}"` : ''}.`,
    expiringPermits.length ? `${plural(expiringPermits.length, 'permit expires', 'permits expire')} within the next hour and need a documented close-out or extension.` : 'No active permit expires within the next hour.',
  ];
  const trainingNarrativeEn = [
    `Mandatory training compliance is ${pe(k.trainingCompliance)}, ${vsPrevEn(d.trainingCompliance, null, null, { pp: true })}.`,
    weakestCourses.length ? `Lowest coverage: ${weakestCourses.map((c) => `"${courseEn((s.courses || []).find((x) => x.id === c.id) || { id: c.id, name: c.label })}" (${pe(c.pct)})`).join(', ')}.` : 'No course data is available.',
    `${plural(expiring30.length, 'certificate expires', 'certificates expire')} within 30 days and ${n0(expiring60.length)} within 60 days; requalification must be scheduled before they lapse.`,
  ];
  const complianceNarrativeEn = [
    `ISO 45001 clauses 4–10 average ${pe(isoOverall)} against a ${pe(ISO_TARGET)} target${isoBelow.length ? `; clauses below target: ${isoBelow.map((c) => `${c.id} (${pe(c.score)})`).join(', ')}` : ', and every clause meets the target'}.`,
    `The legal register holds ${n0(legal.length)} requirements: ${n0(legalCounts['ممتثل'])} compliant, ${n0(legalCounts['جزئي'])} partial, ${n0(legalCounts['فجوة'])} gap${isoGaps ? `; documented gaps across the standard's clauses: ${n0(isoGaps)}` : ''}.`,
  ];
  const recEn = [];
  if (k.criticalRisks > 0) recEn.push({ tone: 'critical', text: `Treat ${plural(k.criticalRisks, 'critical risk', 'critical risks')} with engineering controls or by stopping the activity before it resumes, and review the assessment weekly until the residual score is below 10.` });
  if (overdueCount > 0) recEn.push({ tone: 'serious', text: `Close ${plural(overdueCount, 'overdue risk', 'overdue risks')} and escalate the late ones to the site manager with new target dates.` });
  if (openHighCount) recEn.push({ tone: 'serious', text: `Complete the investigation of ${plural(openHighCount, 'high-severity incident', 'high-severity incidents')} and close their corrective actions within 14 days.` });
  if (topCause) recEn.push({ tone: 'warning', text: `Target the root cause "${enumEn('rootCause', topCause.label, topCause.label)}" with a dedicated prevention programme (training, supervision, work procedures) — it explains ${pe(topCause.pct)} of incidents.` });
  if (k.trainingCompliance < 90) recEn.push({ tone: 'warning', text: `Raise training compliance from ${pe(k.trainingCompliance)} to at least 90% by scheduling ${plural(expiring60.length, 'expiring certificate', 'expiring certificates')} due within 60 days and closing the gaps in the weakest courses.` });
  if (k.inspectionsDue > 0) recEn.push({ tone: 'warning', text: `Carry out ${plural(k.inspectionsDue, 'due or overdue inspection', 'due or overdue inspections')} and record the results this week.` });
  if (isoBelow.length) recEn.push({ tone: 'warning', text: `Improvement plan for the ISO 45001 clauses below target (${isoBelow.map((c) => c.id).join(', ')}) with an owner and a deadline for each gap before the next internal audit.` });
  if (legalCounts['فجوة'] > 0 || legalCounts['جزئي'] > 0) recEn.push({ tone: 'warning', text: `Address ${plural(legalCounts['فجوة'] + legalCounts['جزئي'], 'regulatory requirement', 'regulatory requirements')} that are not fully compliant and update the review dates.` });
  if (integ.degraded > 0 || integ.disconnected > 0) recEn.push({ tone: 'warning', text: `Restore ${plural(integ.degraded + integ.disconnected, 'degraded or disconnected integration', 'degraded or disconnected integrations')} (simulated in this demo) so sensor and attendance data stay complete.` });
  if (k.capaClosure < 80) recEn.push({ tone: 'warning', text: `Raise corrective-action closure from ${pe(k.capaClosure)} to 80% through a weekly review of late actions.` });
  if (!recEn.length) recEn.push({ tone: 'good', text: 'Performance is on target; keep the cadence of field walks and toolbox talks and refresh risk assessments before each new phase.' });
  recommendations.forEach((r, i) => { if (recEn[i]) r.textEn = recEn[i].text; });
  const kpiLabelsEn = { safetyIndex: 'Safety index', ltifr: 'LTIFR', trir: 'TRIR', daysSinceLTI: 'Days without a lost-time injury', openIncidents: 'Open incidents', nearMisses30d: 'Near misses (30 days)', activePermits: 'Active permits', criticalRisks: 'Critical risks', capaClosure: 'Corrective-action closure', trainingCompliance: 'Training compliance', inspectionsDue: 'Inspections due' };
  for (const item of kpiItems) {
    item.labelEn = kpiLabelsEn[item.id] || item.label;
    const dd = sel.describeDelta(item.delta, item.id === 'activePermits' ? 'none' : item.deltaGoodWhen);
    item.direction = dd.direction;
    item.good = dd.good;
  }

  const sections = [
    { id: 'summary', code: 'RPT-01', title: 'الملخص التنفيذي', titleEn: 'Executive summary', narrative: summary, narrativeEn: summaryEn, highlights: kpiItems.slice(0, 4) },
    { id: 'kpis', code: 'RPT-02', title: 'مؤشرات الأداء', titleEn: 'Performance indicators', narrative: kpiNarrative, narrativeEn: kpiNarrativeEn, items: kpiItems, siteScores: siteScores.map((row) => ({ siteId: row.site.id, site: row.site.name, city: row.site.city, score: row.score, openRisks: row.openRisks, openIncidents: row.openIncidents, trend: row.trend })) },
    { id: 'incidents', code: 'RPT-03', title: 'الحوادث', titleEn: 'Incidents', narrative: incidentNarrative, narrativeEn: incidentNarrativeEn, trend, byType, pareto, openHighCount, openHigh: openHigh.map((i) => ({ id: i.id, code: i.code, title: i.title, type: i.type, severity: i.severity, status: i.status, siteId: i.siteId, date: i.date })) },
    { id: 'risks', code: 'RPT-04', title: 'المخاطر', titleEn: 'Risks', narrative: riskNarrative, narrativeEn: riskNarrativeEn, matrix, tiers, byCategory, overdue: overdueRisks, overdueCount },
    { id: 'permits', code: 'RPT-05', title: 'التصاريح', titleEn: 'Permits to work', narrative: permitNarrative, narrativeEn: permitNarrativeEn, byStatus: permitsByStatus, byType: permitsByType, expiringSoon: expiringPermits },
    { id: 'training', code: 'RPT-06', title: 'التدريب', titleEn: 'Training', narrative: trainingNarrative, narrativeEn: trainingNarrativeEn, byCourse: trainingByCourse, expiring30: expiring30.length, expiring60: expiring60.length, expiring: expiring60.slice(0, 12).map((e) => ({ worker: e.worker.name, workerId: e.worker.id, course: e.course.name, expiresAt: e.expiresAt, daysLeft: e.daysLeft, tone: e.tone })) },
    { id: 'compliance', code: 'RPT-07', title: 'الامتثال', titleEn: 'Compliance', narrative: complianceNarrative, narrativeEn: complianceNarrativeEn, isoOverall, target: ISO_TARGET, isoScores: isoScores.map((c) => ({ id: c.id, title: c.title, score: c.score, gaps: c.gaps })), legal: legalCounts, legalRegister: legal.map((l) => ({ id: l.id, title: l.title, authority: l.authority, status: l.status, nextReview: l.nextReview })) },
    { id: 'recommendations', code: 'RPT-08', title: 'التوصيات', titleEn: 'Recommendations', narrative: recommendations.map((r) => r.text), narrativeEn: recommendations.map((r) => r.textEn || ''), items: recommendations, urgent: urgent.map((u) => ({ kind: u.kind, code: u.code, text: u.text, due: u.due, tone: u.tone, href: u.href })) },
  ];

  const cadence = kind === 'quarter' ? 'الربعي' : 'الشهري';
  return {
    title: `تقرير السلامة والصحة المهنية ${cadence} — ${company.name || 'بلتكس'} — ${kind === 'quarter' ? windowLabel : period.month}`,
    subtitle: `${company.product || BRAND.product} · ${company.pillar || BRAND.pillar} · ${scopeLabel} · ${rangeLabel}`,
    titleEn: `BILTIX Risk AI — Health, Safety & Environment ${kind === 'quarter' ? 'quarterly' : 'monthly'} report — ${periodLabelEn}`,
    subtitleEn: `BILTIX Risk AI · HSE pillar · ${scopeEn} · ${period.from} – ${period.to}`,
    periodEn: `${periodLabelEn} (${period.from} – ${period.to})`,
    overdueCount,
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
  // v3 (CONTRACT §8 / AC-11)
  importPreview,
  commitImport,
  REAL_TEST_TYPES,
  MESSAGES_EN,
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
