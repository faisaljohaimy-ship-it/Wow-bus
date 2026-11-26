'use strict';
/*
 * POST /api/lead  -  demo / proposal lead intake (Vercel Node.js serverless function).
 * No npm dependencies. Contract: docs/LEADS_API.md
 *
 * Env (read per request):
 *   BLOB_READ_WRITE_TOKEN  required  Vercel Blob read-write token (store should be PRIVATE)
 *   LEADS_BLOB_ACCESS      optional  'private' (default) | 'public'  (must match the store type)
 *   RESEND_API_KEY + LEAD_NOTIFY_TO + LEAD_NOTIFY_FROM  optional  e-mail notification (all three needed; no built-in sender)
 *   VERCEL_BLOB_API_URL / RESEND_API_URL  optional  endpoint overrides (used by tests)
 *   LEAD_RATE_BURST / LEAD_RATE_HOURLY    optional  numbers, defaults 3 per 60 s and 8 per hour per IP
 */
const crypto = require('node:crypto');

const BLOB_API_VERSION = '13'; // value sent by @vercel/blob 2.9.0
const DEFAULT_BLOB_API = 'https://vercel.com/api/blob';
const MAX_BODY_BYTES = 16 * 1024;
const MIN_FILL_MS = 2500;          // faster than this => bot
const MAX_FORM_AGE_MS = 24 * 3600 * 1000;
const MAX_TRACKED_IPS = 5000;

const TYPES = ['demo', 'proposal'];
const LANGS = ['ar', 'en'];
const BUDGETS = ['lt-50k', '50k-150k', '150k-500k', 'gt-500k', 'undisclosed']; // USD
const TIMELINES = ['asap', '1-3m', '3-6m', '6m-plus', 'exploring'];
const ALLOWED_KEYS = new Set(['type', 'name', 'organisation', 'role', 'email', 'phone', 'country',
  'message', 'budgetRange', 'timeline', 'lang', 'consent', 'website', 'startedAt']);

const M = {
  method:   { ar: 'الطريقة غير مسموح بها. استخدم POST.', en: 'Method not allowed. Use POST.' },
  origin:   { ar: 'الطلب مرفوض: مصدر غير مسموح.', en: 'Request rejected: origin not allowed.' },
  ctype:    { ar: 'يجب أن يكون المحتوى JSON.', en: 'Content-Type must be application/json.' },
  toolarge: { ar: 'حجم الطلب كبير جدًا.', en: 'Request body too large.' },
  badjson:  { ar: 'تعذر قراءة البيانات المرسلة.', en: 'Could not parse the submitted data.' },
  invalid:  { ar: 'يرجى تصحيح الحقول المحددة ثم إعادة الإرسال.', en: 'Please correct the highlighted fields and resubmit.' },
  bot:      { ar: 'تعذر قبول الطلب.', en: 'The request could not be accepted.' },
  rate:     { ar: 'محاولات كثيرة. يرجى الانتظار قليلًا ثم المحاولة مجددًا.', en: 'Too many attempts. Please wait a moment and try again.' },
  nostore:  { ar: 'خدمة استقبال الطلبات غير مفعّلة حاليًا ولم يتم حفظ طلبك. يرجى المحاولة لاحقًا.', en: 'The request intake service is not configured right now and your request was NOT saved. Please try again later.' },
  storefail:{ ar: 'تعذر حفظ طلبك ولم يتم استلامه. يرجى المحاولة لاحقًا.', en: 'We could not save your request and it was NOT received. Please try again later.' },
  ok:       { ar: 'تم استلام طلبك. سنتواصل معك قريبًا.', en: 'Your request was received. We will be in touch soon.' },
};
const FIELD = {
  required: { ar: 'هذا الحقل مطلوب.', en: 'This field is required.' },
  length:   { ar: 'الطول غير مناسب.', en: 'Length is not valid.' },
  format:   { ar: 'الصيغة غير صحيحة.', en: 'Format is not valid.' },
  enum:     { ar: 'قيمة غير مسموح بها.', en: 'Value not allowed.' },
  consent:  { ar: 'يلزم الموافقة على إشعار الخصوصية.', en: 'Consent to the privacy notice is required.' },
  unknown:  { ar: 'حقل غير معروف.', en: 'Unknown field.' },
};

// ---- in-memory abuse control (per warm instance only; see docs) ----
const hits = new Map(); // ip -> [timestamps]
function rateLimited(ip, now) {
  const burstMax = Number(process.env.LEAD_RATE_BURST) || 3;
  const hourMax = Number(process.env.LEAD_RATE_HOURLY) || 8;
  const arr = (hits.get(ip) || []).filter((t) => now - t < 3600 * 1000);
  const burst = arr.filter((t) => now - t < 60 * 1000).length;
  if (burst >= burstMax || arr.length >= hourMax) { hits.set(ip, arr); return true; }
  arr.push(now);
  hits.set(ip, arr);
  if (hits.size > MAX_TRACKED_IPS) {
    for (const [k, v] of hits) { if (!v.some((t) => now - t < 3600 * 1000)) hits.delete(k); }
    if (hits.size > MAX_TRACKED_IPS) hits.delete(hits.keys().next().value);
  }
  return false;
}

function clientIp(req) {
  const h = req.headers || {};
  const raw = h['x-vercel-forwarded-for'] || h['x-real-ip'] || (h['x-forwarded-for'] || '').split(',')[0] ||
    (req.socket && req.socket.remoteAddress) || 'unknown';
  return String(raw).trim().slice(0, 64);
}

function send(res, status, body, extra) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (extra) for (const k of Object.keys(extra)) res.setHeader(k, extra[k]);
  res.end(JSON.stringify(body));
}
function fail(res, status, code, lang, extra, more) {
  const m = M[code];
  const l = LANGS.includes(lang) ? lang : null;
  send(res, status, Object.assign({
    ok: false, code,
    message: l ? m[l] : m.ar + ' / ' + m.en,
    message_ar: m.ar, message_en: m.en,
  }, more || {}), extra);
}

function sameOrigin(req) {
  const h = req.headers || {};
  if (h['sec-fetch-site'] && !['same-origin', 'none'].includes(h['sec-fetch-site'])) return false;
  const origin = h.origin;
  if (!origin) return true; // non-browser or same-origin GET-like; abuse control still applies
  let o;
  try { o = new URL(origin); } catch { return false; }
  const host = String(h['x-forwarded-host'] || h.host || '').split(',')[0].trim().toLowerCase();
  return !!host && o.host.toLowerCase() === host;
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    if (req.body !== undefined && req.body !== null) {
      if (typeof req.body === 'object' && !Buffer.isBuffer(req.body)) return resolve(req.body);
      const s = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : String(req.body);
      if (Buffer.byteLength(s) > MAX_BODY_BYTES) return reject(Object.assign(new Error('big'), { code: 'toolarge' }));
      try { return resolve(JSON.parse(s)); } catch { return reject(Object.assign(new Error('json'), { code: 'badjson' })); }
    }
    const chunks = []; let size = 0; let over = false;
    req.on('data', (c) => {
      if (over) return; // drain without buffering
      size += c.length;
      if (size > MAX_BODY_BYTES) { over = true; chunks.length = 0; reject(Object.assign(new Error('big'), { code: 'toolarge' })); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      if (over) return;
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
      catch { reject(Object.assign(new Error('json'), { code: 'badjson' })); }
    });
    req.on('error', () => reject(Object.assign(new Error('io'), { code: 'badjson' })));
  });
}

// eslint-disable-next-line no-control-regex
const CTRL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\u2028\u2029\u202A-\u202E\u2066-\u2069]/g;
const EMAIL_RE = /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]{1,64}@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$/;
const PHONE_RE = /^\+?[0-9][0-9\s().-]{4,29}$/;

function validate(b) {
  const errors = {};
  const out = {};
  if (b === null || typeof b !== 'object' || Array.isArray(b)) return { errors: { _body: 'format' } };
  for (const k of Object.keys(b)) if (!ALLOWED_KEYS.has(k)) errors[k] = 'unknown';

  const str = (key, { min = 0, max, required = false, multiline = false }) => {
    let v = b[key];
    if (v === undefined || v === null || v === '') { if (required) errors[key] = 'required'; return; }
    if (typeof v !== 'string') { errors[key] = 'format'; return; }
    v = v.normalize('NFC');
    v = multiline ? v.replace(/\r\n?/g, '\n').replace(CTRL, '').replace(/[ \t]+/g, ' ') : v.replace(CTRL, '').replace(/\s+/g, ' ');
    v = v.trim();
    if (!v) { if (required) errors[key] = 'required'; return; }
    if (v.length < min || v.length > max) { errors[key] = 'length'; return; }
    out[key] = v;
  };
  const en = (key, list, required) => {
    const v = b[key];
    if (v === undefined || v === null || v === '') { if (required) errors[key] = 'required'; return; }
    if (typeof v !== 'string' || !list.includes(v)) { errors[key] = 'enum'; return; }
    out[key] = v;
  };
  en('type', TYPES, true);
  en('lang', LANGS, true);
  str('name', { min: 2, max: 100, required: true });
  str('organisation', { min: 2, max: 150, required: true });
  str('role', { max: 100 });
  str('email', { min: 6, max: 254, required: true });
  if (out.email && (!EMAIL_RE.test(out.email) || out.email.includes('..'))) errors.email = 'format';
  str('phone', { max: 30 });
  if (out.phone && !PHONE_RE.test(out.phone)) errors.phone = 'format';
  str('country', { max: 60 });
  str('message', { min: 10, max: 4000, required: true, multiline: true });
  en('budgetRange', BUDGETS, false);
  en('timeline', TIMELINES, false);
  if (b.consent !== true) errors.consent = 'consent';
  if (b.startedAt !== undefined && (typeof b.startedAt !== 'number' || !Number.isFinite(b.startedAt))) errors.startedAt = 'format';
  if (b.website !== undefined && typeof b.website !== 'string') errors.website = 'format';
  return { errors, value: out };
}

async function storeLead(token, record) {
  const base = (process.env.VERCEL_BLOB_API_URL || DEFAULT_BLOB_API).replace(/\/+$/, '');
  const access = process.env.LEADS_BLOB_ACCESS === 'public' ? 'public' : 'private';
  const d = new Date(record.receivedAt);
  const pathname = `leads/${d.getUTCFullYear()}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${record.type}-${record.id}.json`;
  const storeId = token.split('_')[3] || '';
  const r = await fetch(`${base}/?pathname=${encodeURIComponent(pathname)}`, {
    method: 'PUT',
    headers: {
      authorization: `Bearer ${token}`,
      'x-api-version': BLOB_API_VERSION,
      'x-vercel-blob-store-id': storeId,
      'x-vercel-blob-access': access,
      'x-add-random-suffix': '1',
      'x-allow-overwrite': '0',
      'x-content-type': 'application/json',
      'x-cache-control-max-age': '60',
    },
    body: JSON.stringify(record, null, 2),
    signal: AbortSignal.timeout(8000),
  });
  if (!r.ok) throw Object.assign(new Error('blob ' + r.status), { status: r.status });
  return pathname;
}

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
async function notify(record) {
  const key = process.env.RESEND_API_KEY, to = process.env.LEAD_NOTIFY_TO, from = process.env.LEAD_NOTIFY_FROM;
  if (!key || !to || !from) return 'skipped';
  const rows = ['type', 'name', 'organisation', 'role', 'email', 'phone', 'country', 'budgetRange', 'timeline', 'lang', 'message', 'id']
    .filter((k) => record[k]).map((k) => `<tr><th align="left">${k}</th><td>${esc(record[k]).replace(/\n/g, '<br>')}</td></tr>`).join('');
  try {
    const r = await fetch(process.env.RESEND_API_URL || 'https://api.resend.com/emails', {
      method: 'POST',
      headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        from,
        to: to.split(',').map((s) => s.trim()).filter(Boolean),
        subject: `New ${record.type} request (${record.id})`,
        html: `<table>${rows}</table>`,
      }),
      signal: AbortSignal.timeout(6000),
    });
    return r.ok ? 'sent' : 'failed';
  } catch { return 'failed'; }
}

async function handler(req, res) {
  try {
    if (!sameOrigin(req)) return fail(res, 403, 'origin');
    if (req.method === 'OPTIONS') { res.statusCode = 204; res.setHeader('Allow', 'POST, OPTIONS'); res.setHeader('Cache-Control', 'no-store'); return res.end(); }
    if (req.method !== 'POST') return fail(res, 405, 'method', null, { Allow: 'POST, OPTIONS' });
    if (!/^application\/json\b/i.test(String((req.headers || {})['content-type'] || ''))) return fail(res, 415, 'ctype');

    let body;
    try { body = await readBody(req); }
    catch (e) { return fail(res, e.code === 'toolarge' ? 413 : 400, e.code || 'badjson'); }
    const lang = body && LANGS.includes(body.lang) ? body.lang : null;

    // bot checks before anything else
    if (body && typeof body === 'object' && body.website) return fail(res, 400, 'bot', lang);
    if (body && typeof body.startedAt === 'number') {
      const age = Date.now() - body.startedAt;
      if (age < MIN_FILL_MS || age > MAX_FORM_AGE_MS) return fail(res, 400, 'bot', lang);
    }

    const { errors, value } = validate(body);
    if (Object.keys(errors).length) {
      const fields = {};
      for (const k of Object.keys(errors)) {
        const f = FIELD[errors[k]] || FIELD.format;
        fields[k] = { code: errors[k], message: lang ? f[lang] : f.ar + ' / ' + f.en };
      }
      return fail(res, 422, 'invalid', lang, null, { errors: fields });
    }

    const ip = clientIp(req);
    if (rateLimited(ip, Date.now())) return fail(res, 429, 'rate', lang, { 'Retry-After': '60' });

    const token = process.env.BLOB_READ_WRITE_TOKEN;
    if (!token || !/^vercel_blob_rw_/.test(token)) return fail(res, 503, 'nostore', lang);

    const id = crypto.randomBytes(8).toString('hex');
    const record = Object.assign({
      schema: 1, id, receivedAt: new Date().toISOString(),
      consent: { given: true, at: new Date().toISOString(), notice: 'privacy-v1' },
      ipHash: crypto.createHash('sha256').update(token + '|' + ip).digest('hex').slice(0, 16),
    }, value);

    try { await storeLead(token, record); }
    catch (e) {
      console.error('lead_store_failed', e && e.status ? e.status : 'network'); // no personal data
      return fail(res, 502, 'storefail', lang);
    }
    const mail = await notify(record);
    if (mail === 'failed') console.error('lead_notify_failed');
    return send(res, 201, { ok: true, id, message: M.ok[lang || 'ar'], message_ar: M.ok.ar, message_en: M.ok.en });
  } catch (e) {
    console.error('lead_unexpected', e && e.name);
    return fail(res, 500, 'storefail', null);
  }
}

module.exports = handler;
module.exports.default = handler;
module.exports._internals = { validate, reset: () => hits.clear(), TYPES, BUDGETS, TIMELINES };
