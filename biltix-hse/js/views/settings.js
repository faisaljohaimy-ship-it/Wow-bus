/**
 * Biltix HSE — SEC-11 الإعدادات (js/views/settings.js)
 *
 * Cards: المظهر (theme, numerals with a live example, motion), الهوية (brand primary /
 * accent as colour picker + hex text kept in sync, company name, logo URL with preview,
 * restore defaults), البث والتنبيهات (feed pause, sound, alert webhook), البيانات (export /
 * import JSON with validation + confirm, reset to seed with confirm), حول النظام.
 *
 * Every change goes through store.setSettings (persisted + broadcast); the view listens to
 * settings:change and syncs its controls in place (no full re-render, so a colour drag keeps
 * focus). Motion is persisted as settings.motion ('auto'|'reduce'|'full') — the values
 * css/tokens.css reads from <html data-motion> — and mirrored to settings.reducedMotion for
 * the app shell. Data reaches the DOM only via textContent / components.h.
 */

import * as storeModule from '../core/store.js';

const APP_VERSION = '2.0.0';
const BUILD_DATE = '2026-11-09';
const SITE_URL = 'https://biltix.sa';
const SITE_LABEL = 'biltix.sa';
const HEX_RE = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;
const HTTP_RE = /^https?:\/\/[^\s]+$/i;
const MAX_IMPORT_BYTES = 20 * 1024 * 1024;
const SVG_NS = 'http://www.w3.org/2000/svg';
const COLLECTIONS = ['risks', 'incidents', 'permits', 'inspections', 'integrations', 'feed'];
const COLLECTION_LABELS = { risks: 'المخاطر', incidents: 'الحوادث', permits: 'تصاريح العمل', inspections: 'التفتيشات', integrations: 'التكاملات', feed: 'أحداث البث' };
const MOTION_OPTIONS = [
  { value: 'auto', label: 'تلقائي — حسب إعدادات النظام' },
  { value: 'reduce', label: 'مخفّضة — إيقاف المسح والنبض المستمر' },
  { value: 'full', label: 'كاملة — تجاهل تفضيل النظام' },
];
const DATA_SOURCE_LABELS = { simulation: 'محاكاة توضيحية', json: 'JSON API', sheets: 'Google Sheets CSV', supabase: 'Supabase', webhook: 'Webhook' };

const FALLBACK_DEFAULTS = Object.freeze({
  theme: 'dark',
  numerals: 'latn',
  brand: Object.freeze({ primary: '', accent: '', companyName: 'بلتكس', logoUrl: '' }),
  sound: false,
  feedPaused: false,
  dataSource: Object.freeze({ type: 'simulation', url: '', apiKey: '', table: '' }),
  alertWebhook: '',
});
const DEFAULTS = storeModule.DEFAULT_SETTINGS || FALLBACK_DEFAULTS;

let uidCounter = 0;
const uid = (prefix) => `set-${prefix}-${(++uidCounter).toString(36)}`;
/** art.js reference (set on render) so icons use the shared RTL-aware icon set when available. */
let artRef = null;
/** Local icon name → art.js icon name. */
const ART_NAMES = { send: 'webhook', image: 'file-text' };

/* ────────────────────────────── static icons ────────────────────────────── */

const ICONS = {
  moon: ['M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z'],
  sun: ['M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z', 'M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4'],
  refresh: ['M20 11a8 8 0 1 0 1.3 4.5', 'M20 4v7h-7'],
  download: ['M12 3v12', 'M7 10l5 5 5-5', 'M4 19h16'],
  upload: ['M12 15V3', 'M7 8l5-5 5 5', 'M4 19h16'],
  trash: ['M4 7h16', 'M9 7V4h6v3', 'M6 7l1 13h10l1-13', 'M10 11v6M14 11v6'],
  send: ['M22 2L11 13', 'M22 2l-7 20-4-9-9-4z'],
  external: ['M14 4h6v6', 'M20 4l-9 9', 'M19 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5'],
  plug: ['M9 2v6M15 2v6', 'M6 8h12v4a6 6 0 0 1-12 0z', 'M12 18v4'],
  image: ['M4 5h16v14H4z', 'M4 16l5-5 4 4 3-3 4 4', 'M15.5 9.5h.01'],
  info: ['M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z', 'M12 11v5', 'M12 8h.01'],
};

function icon(name, size = 16) {
  if (artRef && typeof artRef.icon === 'function' && typeof artRef.hasIcon === 'function') {
    try {
      const artName = ART_NAMES[name] || name;
      if (artRef.hasIcon(artName)) {
        const node = artRef.icon(artName, size);
        if (node instanceof Node) { node.classList.add('icon'); return node; }
      }
    } catch { /* fall back to the local glyph */ }
  }
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  svg.classList.add('icon');
  for (const d of ICONS[name] || ICONS.info) {
    const p = document.createElementNS(SVG_NS, 'path');
    p.setAttribute('d', d);
    svg.appendChild(p);
  }
  return svg;
}

/* ────────────────────────────── helpers ────────────────────────────── */

function normalizeHex(value) {
  const s = String(value || '').trim();
  if (!HEX_RE.test(s)) return null;
  const hex = s.slice(1);
  const full = hex.length === 3 ? hex.split('').map((c) => c + c).join('') : hex;
  return `#${full.toLowerCase()}`;
}

function isHttpUrl(value) {
  const s = String(value || '').trim();
  if (!HTTP_RE.test(s)) return false;
  try { const u = new URL(s); return u.protocol === 'http:' || u.protocol === 'https:'; } catch { return false; }
}

function clone(value) {
  try { return structuredClone(value); } catch { return JSON.parse(JSON.stringify(value)); }
}

function motionOf(settings) {
  const m = settings && settings.motion;
  if (m === 'reduce' || m === 'full' || m === 'auto') return m;
  return settings && settings.reducedMotion ? 'reduce' : 'auto';
}

/** <html data-motion> drives css/tokens.css: "reduce" forces calm, "full" overrides the OS preference. */
function applyMotion(motion) {
  const root = document.documentElement;
  if (motion === 'reduce' || motion === 'full') root.setAttribute('data-motion', motion);
  else root.removeAttribute('data-motion');
}

function playTick() {
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ac = new AC();
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.type = 'sine';
    osc.frequency.value = 880;
    gain.gain.value = 0.0001;
    osc.connect(gain).connect(ac.destination);
    const t = ac.currentTime;
    gain.gain.exponentialRampToValueAtTime(0.08, t + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
    osc.start(t);
    osc.stop(t + 0.2);
    osc.onended = () => { try { ac.close(); } catch { /* ignore */ } };
  } catch { /* audio unavailable */ }
}

function downloadJSON(obj, filename) {
  const blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

function isoDate(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function validateSnapshot(obj) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return { ok: false, reason: 'الملف ليس كائن JSON صالحاً.' };
  const present = COLLECTIONS.filter((k) => Array.isArray(obj[k]));
  const hasSettings = Boolean(obj.settings && typeof obj.settings === 'object' && !Array.isArray(obj.settings));
  if (!present.length && !hasSettings) return { ok: false, reason: 'لا يحتوي الملف على أي من مجموعات بيانات بلتكس HSE (المخاطر، الحوادث، التصاريح، التفتيشات، التكاملات، الإعدادات).' };
  if (obj.meta && obj.meta.version !== undefined && Number(obj.meta.version) !== 1) return { ok: false, reason: `إصدار الملف (${obj.meta.version}) غير متوافق مع هذا الإصدار من النظام.` };
  for (const k of present) {
    if (obj[k].some((item) => !item || typeof item !== 'object' || Array.isArray(item))) return { ok: false, reason: `مجموعة «${COLLECTION_LABELS[k]}» تحتوي عناصر غير صالحة.` };
  }
  const counts = {};
  for (const k of present) counts[k] = obj[k].length;
  return { ok: true, present, hasSettings, counts, savedAt: obj.meta && typeof obj.meta.savedAt === 'string' ? obj.meta.savedAt : null };
}

async function readFileText(file) {
  if (typeof file.text === 'function') return file.text();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error || new Error('read failed'));
    reader.readAsText(file, 'utf-8');
  });
}

/* ────────────────────────────── the view ────────────────────────────── */

function render(container, ctx) {
  const { store, bus, fmt, components, router } = ctx;
  const sources = ctx.sources || {};
  const art = ctx.art || {};
  artRef = art;
  const { h, card, badge, button, segmented, toast, modal, formField, kv, liveDot } = components;
  const subs = [];
  const timers = new Set();
  const settings = () => (store.state && store.state.settings) || {};
  const brand = () => ({ ...(DEFAULTS.brand || {}), ...(settings().brand || {}) });

  function later(fn, ms) {
    const id = setTimeout(() => { timers.delete(id); fn(); }, ms);
    timers.add(id);
    return id;
  }

  function save(patch, message, tone = 'good') {
    try {
      store.setSettings(patch);
      if (message) toast(message, { tone, timeout: 2600 });
      return true;
    } catch (err) {
      console.error('[biltix-hse] settings: save failed', err);
      toast('تعذر حفظ الإعدادات.', { tone: 'serious' });
      return false;
    }
  }

  /* debounced brand colour saves (colour pickers fire continuously while dragging) */
  let pendingBrand = null;
  let brandTimer = null;
  function queueBrand(patch) {
    pendingBrand = { ...(pendingBrand || {}), ...patch };
    if (brandTimer) clearTimeout(brandTimer);
    brandTimer = setTimeout(flushBrand, 120);
  }
  function flushBrand() {
    if (brandTimer) { clearTimeout(brandTimer); brandTimer = null; }
    if (!pendingBrand) return;
    const patch = pendingBrand;
    pendingBrand = null;
    save({ brand: patch });
  }

  /* ── header ── */
  const storageOk = (() => { try { const k = 'biltix-hse:probe'; localStorage.setItem(k, '1'); localStorage.removeItem(k); return true; } catch { return false; } })();
  const head = h('div', { class: 'view-head' },
    h('div', { class: 'view-head-text' },
      h('span', { class: 'code-tag' }, 'SEC-11'),
      h('h1', {}, 'الإعدادات'),
      h('p', { class: 'view-lead' }, 'خصّص المظهر والهوية والبث وإدارة البيانات. تُحفظ التغييرات فوراً على هذا الجهاز وتُطبَّق مباشرة على الواجهة.')),
    h('div', { class: 'view-actions' }, badge(storageOk ? 'الحفظ المحلي مفعّل' : 'الحفظ المحلي غير متاح — التغييرات مؤقتة', storageOk ? 'good' : 'warning')));

  /* ── field helpers ── */
  function segField(label, hint, seg) {
    const id = uid('lbl');
    seg.el.setAttribute('aria-labelledby', id);
    seg.el.classList.add('is-block');
    return h('div', { class: 'field' }, h('span', { class: 'field-label', id }, label), seg.el, hint ? h('p', { class: 'field-hint' }, hint) : null);
  }

  function switchRow({ label, hint, checked, onChange }) {
    const id = uid('sw');
    const labelId = uid('swl');
    const hintId = hint ? uid('swh') : null;
    const set = (v) => { sw.setAttribute('aria-checked', v ? 'true' : 'false'); sw.classList.toggle('is-on', Boolean(v)); };
    const sw = h('button', {
      type: 'button', class: ['switch', checked ? 'is-on' : null], role: 'switch', id,
      'aria-checked': checked ? 'true' : 'false', 'aria-labelledby': labelId, 'aria-describedby': hintId || undefined,
      onClick: () => { const next = sw.getAttribute('aria-checked') !== 'true'; set(next); onChange(next); },
    });
    const el = h('div', { class: 'field is-inline', style: { flexWrap: 'wrap' } }, sw, h('label', { class: 'field-label', id: labelId, for: id }, label), hint ? h('p', { class: 'field-hint', id: hintId }, hint) : null);
    return { el, set };
  }

  function controlOf(fieldEl) {
    return fieldEl.querySelector('.field-control');
  }

  function markInvalid(fieldEl, invalid, message) {
    fieldEl.classList.toggle('is-invalid', Boolean(invalid));
    let err = fieldEl.querySelector('.field-error');
    if (invalid) {
      if (!err) { err = h('p', { class: 'field-error text-xs', role: 'alert' }); fieldEl.appendChild(err); }
      err.textContent = message || '';
    } else if (err) err.remove();
  }

  /* ════════════════ المظهر ════════════════ */

  const themeSeg = segmented({
    options: [{ value: 'dark', label: 'داكن', icon: icon('moon', 14) }, { value: 'light', label: 'فاتح', icon: icon('sun', 14) }],
    value: settings().theme === 'light' ? 'light' : 'dark',
    ariaLabel: 'السمة',
    onChange: (v) => save({ theme: v }, v === 'light' ? 'تم تفعيل السمة الفاتحة.' : 'تم تفعيل السمة الداكنة.'),
  });
  const numeralsSeg = segmented({
    options: [{ value: 'latn', label: 'لاتينية 0123' }, { value: 'arab', label: 'عربية ٠١٢٣' }],
    value: settings().numerals === 'arab' ? 'arab' : 'latn',
    ariaLabel: 'نظام الأرقام',
    onChange: (v) => save({ numerals: v }, 'تم تحديث نظام الأرقام في كامل الواجهة.'),
  });
  const numeralsExample = h('p', { class: 'field-hint tabular', 'aria-live': 'polite' });
  function paintExample() {
    const now = store.now ? store.now() : new Date();
    numeralsExample.textContent = `مثال: ${fmt.num(1234567)} · ${fmt.pct(87.5, 1)} · ${fmt.date(now)} · ${fmt.time(now)}`;
  }
  paintExample();

  const motionField = formField({ label: 'الحركة والرسوم المتحركة', name: 'motion', type: 'select', value: motionOf(settings()), options: MOTION_OPTIONS, hint: 'يؤثر في مسح الرادارات ونبض المؤشرات الحية والانتقالات. يُحفظ كتفضيل للنظام ويُطبَّق فوراً.' });
  const motionSelect = controlOf(motionField);
  motionSelect.addEventListener('change', () => {
    const v = MOTION_OPTIONS.some((o) => o.value === motionSelect.value) ? motionSelect.value : 'auto';
    applyMotion(v);
    save({ motion: v, reducedMotion: v === 'reduce' }, 'تم حفظ إعداد الحركة.');
  });

  const appearanceCard = card({
    code: 'SET-01', title: 'المظهر', subtitle: 'السمة ونظام الأرقام والحركة',
    body: h('div', { class: 'stack gap-4' },
      segField('السمة', 'الوضع الداكن هو الافتراضي لغرفة العمليات؛ الوضع الفاتح مناسب للطباعة وشاشات النهار.', themeSeg),
      segField('نظام الأرقام', null, numeralsSeg),
      numeralsExample,
      motionField),
  });

  /* ════════════════ الهوية ════════════════ */

  function colorField({ label, key, token, hint }) {
    const hexId = uid('hex');
    const picker = h('input', { type: 'color', class: 'field-control', 'aria-label': `منتقي ${label}`, style: { flex: 'none' } });
    const text = h('input', { type: 'text', id: hexId, class: 'field-control mono ltr', maxlength: '7', spellcheck: 'false', autocomplete: 'off', placeholder: '#2F6FED', style: { flex: '1 1 auto', minInlineSize: '0' } });
    const swatch = h('span', { class: 'brand-swatch', 'aria-hidden': 'true', style: { inlineSize: '28px', blockSize: '28px', borderRadius: '8px', border: '1px solid var(--line-2)', flex: 'none', background: `var(--${token})` } });
    const wrap = h('div', { class: 'field' }, h('label', { class: 'field-label', for: hexId }, label), h('div', { class: 'input-group', style: { alignItems: 'center' } }, picker, text, swatch), h('p', { class: 'field-hint' }, hint));

    const setValue = (hex) => {
      const n = normalizeHex(hex);
      if (!n) return;
      if (document.activeElement !== picker) picker.value = n;
      if (document.activeElement !== text) text.value = n.toUpperCase();
      markInvalid(wrap, false);
    };
    picker.addEventListener('input', () => {
      text.value = picker.value.toUpperCase();
      markInvalid(wrap, false);
      queueBrand({ [key]: picker.value });
    });
    picker.addEventListener('change', () => { flushBrand(); toast('تم حفظ لون الهوية.', { tone: 'good', timeout: 2200 }); });
    text.addEventListener('input', () => {
      const raw = text.value.trim();
      const n = normalizeHex(raw.startsWith('#') || raw === '' ? raw : `#${raw}`);
      if (n) { picker.value = n; markInvalid(wrap, false); queueBrand({ [key]: n }); }
      else markInvalid(wrap, raw !== '', 'استخدم صيغة HEX مثل #2F6FED');
    });
    text.addEventListener('change', () => {
      const raw = text.value.trim();
      const n = normalizeHex(raw.startsWith('#') || raw === '' ? raw : `#${raw}`);
      if (!n) {
        toast('صيغة اللون غير صحيحة — استخدم صيغة HEX مثل #2F6FED.', { tone: 'warning' });
        const current = normalizeHex(brand()[key]);
        text.value = current ? current.toUpperCase() : '';
        markInvalid(wrap, false);
        return;
      }
      text.value = n.toUpperCase();
      flushBrand();
      toast('تم حفظ لون الهوية.', { tone: 'good', timeout: 2200 });
    });
    setValue(brand()[key]);
    return { el: wrap, setValue };
  }

  const primaryField = colorField({ label: 'اللون الأساسي', key: 'primary', token: 'brand', hint: 'الأزرار والروابط والعناصر النشطة في التنقل.' });
  const accentField = colorField({ label: 'لون التمييز', key: 'accent', token: 'accent', hint: 'مسح الرادار والمؤشرات الحية وحلقة التركيز.' });

  const companyField = formField({ label: 'اسم الشركة', name: 'companyName', value: brand().companyName || '', placeholder: DEFAULTS.brand.companyName, hint: 'يظهر في شريط التطبيق وترويسة التقارير.' });
  const companyInput = controlOf(companyField);
  companyInput.addEventListener('change', () => {
    const v = companyInput.value.trim();
    if (!v) { companyInput.value = DEFAULTS.brand.companyName; save({ brand: { companyName: DEFAULTS.brand.companyName } }, 'أُعيد اسم الشركة إلى الافتراضي.', 'neutral'); return; }
    save({ brand: { companyName: v.slice(0, 60) } }, 'تم حفظ اسم الشركة.');
  });

  const logoField = formField({ label: 'رابط الشعار', name: 'logoUrl', type: 'url', value: brand().logoUrl || '', placeholder: 'https://example.com/logo.svg', hint: 'رابط مباشر لصورة (SVG أو PNG) يبدأ بـ https:// — يُترك فارغاً لاستخدام شعار بلتكس الافتراضي.' });
  const logoInput = controlOf(logoField);
  const logoImg = h('img', { alt: 'معاينة شعار الشركة', width: '56', height: '56', decoding: 'async', referrerpolicy: 'no-referrer', style: { inlineSize: '56px', blockSize: '56px', objectFit: 'contain', borderRadius: '10px', background: 'var(--bg-2)', border: '1px solid var(--line)', padding: '6px' } });
  const logoStatus = h('span', { class: 'muted text-xs' }, 'معاينة الشعار');
  const logoPreview = h('div', { class: 'row gap-3', hidden: true }, logoImg, logoStatus);
  logoImg.addEventListener('load', () => { logoPreview.hidden = false; logoStatus.textContent = 'معاينة الشعار — تم التحميل بنجاح.'; });
  logoImg.addEventListener('error', () => { logoPreview.hidden = false; logoImg.style.visibility = 'hidden'; logoStatus.textContent = 'تعذر تحميل الصورة من هذا الرابط. تحقق من أن الرابط عام ويشير إلى صورة.'; });
  function paintLogoPreview(url) {
    const u = String(url || '').trim();
    if (!isHttpUrl(u)) { logoPreview.hidden = true; logoImg.removeAttribute('src'); return; }
    if (logoImg.getAttribute('src') === u) return;
    logoImg.style.visibility = '';
    logoStatus.textContent = 'جارٍ تحميل المعاينة…';
    logoPreview.hidden = false;
    logoImg.setAttribute('src', u);
  }
  logoInput.addEventListener('change', () => {
    const v = logoInput.value.trim();
    if (!v) { markInvalid(logoField, false); save({ brand: { logoUrl: '' } }, 'أُعيد الشعار الافتراضي.', 'neutral'); paintLogoPreview(''); return; }
    if (!isHttpUrl(v)) { markInvalid(logoField, true, 'أدخل رابطاً كاملاً يبدأ بـ https://'); toast('رابط الشعار غير صالح — يجب أن يبدأ بـ https://', { tone: 'warning' }); return; }
    markInvalid(logoField, false);
    save({ brand: { logoUrl: v } }, 'تم حفظ رابط الشعار.');
    paintLogoPreview(v);
  });
  paintLogoPreview(brand().logoUrl);

  function lockupNode() {
    let node = null;
    try {
      if (typeof art.logoLockup === 'function') node = art.logoLockup();
      else if (typeof art.logoMark === 'function') node = art.logoMark(32);
    } catch { node = null; }
    if (!(node instanceof Node)) node = components.glyph('brand', 28);
    if (node.setAttribute && !node.hasAttribute('aria-hidden')) node.setAttribute('aria-hidden', 'true');
    return node;
  }
  const brandPreview = h('div', { class: 'note tone-brand row between wrap gap-3', 'aria-label': 'معاينة الهوية' },
    h('div', { class: 'row gap-3' }, lockupNode(), h('strong', {}, 'معاينة الهوية')),
    h('div', { class: 'row gap-2 wrap' },
      h('span', { class: 'btn btn-primary btn-sm', 'aria-hidden': 'true' }, h('span', { class: 'btn-label' }, 'زر أساسي')),
      h('span', { class: 'row gap-1 text-xs' }, liveDot('accent'), 'مؤشر حي'),
      badge('تمييز', 'accent')));

  const resetBrandBtn = button('استعادة الافتراضي', {
    variant: 'ghost', size: 'sm', icon: icon('refresh', 14),
    onClick: () => {
      pendingBrand = null;
      if (brandTimer) { clearTimeout(brandTimer); brandTimer = null; }
      save({ brand: clone(DEFAULTS.brand) }, 'أُعيدت ألوان الهوية والاسم والشعار إلى الإعداد الافتراضي.', 'neutral');
      syncFromState();
    },
  });

  const brandCard = card({
    code: 'SET-02', title: 'الهوية', subtitle: 'الألوان والاسم والشعار — تُطبَّق مباشرة على الواجهة',
    actions: [resetBrandBtn],
    body: h('div', { class: 'stack gap-4' },
      brandPreview,
      h('div', { class: 'form-grid' }, primaryField.el, accentField.el),
      companyField,
      logoField,
      logoPreview),
  });

  /* ════════════════ البث والتنبيهات ════════════════ */

  const feedSwitch = switchRow({
    label: 'إيقاف البث الحي مؤقتاً',
    hint: 'تتوقف أحداث البث عن الظهور في اللوحة الجانبية بينما تستمر قراءات الحساسات والرادارات في الخلفية.',
    checked: Boolean(settings().feedPaused),
    onChange: (v) => save({ feedPaused: v }, v ? 'تم إيقاف البث الحي مؤقتاً.' : 'تم استئناف البث الحي.', v ? 'warning' : 'good'),
  });
  const soundSwitch = switchRow({
    label: 'التنبيهات الصوتية',
    hint: 'نغمة قصيرة عند ورود تنبيه حرج من الحساسات أو الأنظمة المتصلة.',
    checked: Boolean(settings().sound),
    onChange: (v) => { if (v) playTick(); save({ sound: v }, v ? 'تم تفعيل التنبيهات الصوتية.' : 'تم إيقاف التنبيهات الصوتية.'); },
  });

  const webhookField = formField({ label: 'رابط Webhook للتنبيهات', name: 'alertWebhook', type: 'url', value: settings().alertWebhook || '', placeholder: 'https://hooks.example.com/…', hint: 'يستقبل التنبيهات الحرجة بصيغة JSON (Slack، Teams، n8n، Zapier). يُترك فارغاً لتعطيل الإرسال.' });
  const webhookInput = controlOf(webhookField);
  const testWebhookBtn = button('إرسال تنبيه تجريبي', { variant: 'outline', size: 'sm', icon: icon('send', 14), onClick: () => { sendTestAlert(); } });
  function paintWebhookButton() { testWebhookBtn.disabled = !isHttpUrl(settings().alertWebhook); }
  webhookInput.addEventListener('change', () => {
    const v = webhookInput.value.trim();
    if (!v) { markInvalid(webhookField, false); save({ alertWebhook: '' }, 'تم تعطيل إرسال التنبيهات عبر Webhook.', 'neutral'); paintWebhookButton(); return; }
    if (!isHttpUrl(v)) { markInvalid(webhookField, true, 'أدخل رابطاً كاملاً يبدأ بـ https://'); toast('رابط Webhook غير صالح — يجب أن يبدأ بـ https://', { tone: 'warning' }); return; }
    markInvalid(webhookField, false);
    save({ alertWebhook: v }, 'تم حفظ رابط Webhook.');
    paintWebhookButton();
  });
  paintWebhookButton();

  async function sendTestAlert() {
    const url = settings().alertWebhook;
    if (!isHttpUrl(url)) { toast('أدخل رابط Webhook صالحاً أولاً.', { tone: 'warning' }); return; }
    if (typeof sources.postWebhook !== 'function') { toast('إرسال Webhook غير متاح في هذا الإصدار.', { tone: 'warning' }); return; }
    testWebhookBtn.disabled = true;
    testWebhookBtn.setAttribute('aria-busy', 'true');
    try {
      const now = store.now ? store.now() : new Date();
      const result = await sources.postWebhook(url, {
        source: 'biltix-hse', kind: 'test', severity: 'info', title: 'تنبيه تجريبي من بلتكس HSE',
        detail: 'هذا تنبيه تجريبي للتحقق من إعداد Webhook. لا يتطلب أي إجراء.', ts: now.toISOString(),
      });
      if (result && result.ok) toast(`تم إرسال التنبيه التجريبي بنجاح${result.status ? ` (${fmt.num(result.status)})` : ''}.`, { tone: 'good' });
      else toast(`لم يقبل الخادم التنبيه التجريبي${result && result.status ? ` (${fmt.num(result.status)})` : ''}. تحقق من الرابط والصلاحيات.`, { tone: 'serious' });
    } catch (err) {
      toast(err && err.message ? String(err.message) : 'تعذر الوصول إلى رابط Webhook.', { tone: 'serious' });
    } finally {
      testWebhookBtn.removeAttribute('aria-busy');
      paintWebhookButton();
    }
  }

  const feedCard = card({
    code: 'SET-03', title: 'البث والتنبيهات', subtitle: 'البث الحي والصوت وقنوات التنبيه الخارجية',
    body: h('div', { class: 'stack gap-4' },
      feedSwitch.el,
      soundSwitch.el,
      h('hr', { class: 'divider' }),
      webhookField,
      h('div', { class: 'row gap-2 wrap' }, testWebhookBtn, h('span', { class: 'muted text-xs' }, 'يُرسل طلب POST بحمولة JSON تجريبية إلى الرابط المحفوظ.'))),
  });

  /* ════════════════ البيانات ════════════════ */

  function dataStats() {
    const st = store.state || {};
    const len = (k) => (Array.isArray(st[k]) ? st[k].length : 0);
    let bytes = 0;
    try { bytes = JSON.stringify(st).length; } catch { bytes = 0; }
    const savedAt = st.meta && st.meta.savedAt;
    return [
      ['المخاطر', fmt.num(len('risks'))],
      ['الحوادث', fmt.num(len('incidents'))],
      ['تصاريح العمل', fmt.num(len('permits'))],
      ['التفتيشات', fmt.num(len('inspections'))],
      ['أحداث البث المحفوظة', fmt.num(len('feed'))],
      ['آخر حفظ محلي', savedAt ? fmt.relative(savedAt) : 'لم يُحفظ بعد'],
      ['حجم البيانات', `${fmt.num(bytes / 1024, { maximumFractionDigits: 1 })} كيلوبايت`],
    ];
  }
  let statsEl = kv(dataStats());
  statsEl.classList.add('is-compact');
  function paintStats() {
    const next = kv(dataStats());
    next.classList.add('is-compact');
    statsEl.replaceWith(next);
    statsEl = next;
  }

  function exportJSON() {
    const filename = `biltix-hse-${isoDate(store.now ? store.now() : new Date())}.json`;
    try {
      if (typeof sources.exportJSON === 'function') sources.exportJSON(store.state, filename);
      else downloadJSON(store.state, filename);
      toast('تم تصدير الحالة الكاملة للنظام بصيغة JSON.', { tone: 'good' });
    } catch (err) {
      console.warn('[biltix-hse] settings: exportJSON failed, using local writer', err);
      try { downloadJSON(store.state, filename); toast('تم تصدير الحالة الكاملة للنظام بصيغة JSON.', { tone: 'good' }); } catch { toast('تعذر إنشاء ملف JSON.', { tone: 'serious' }); }
    }
  }

  const fileInput = h('input', { type: 'file', accept: '.json,application/json', class: 'sr-only', tabindex: '-1', 'aria-hidden': 'true' });
  fileInput.addEventListener('change', () => {
    const file = fileInput.files && fileInput.files[0];
    fileInput.value = '';
    if (file) importFile(file);
  });

  async function importFile(file) {
    if (file.size > MAX_IMPORT_BYTES) { toast('حجم الملف يتجاوز 20 ميجابايت.', { tone: 'warning' }); return; }
    let snapshot;
    try {
      snapshot = JSON.parse(await readFileText(file));
    } catch {
      toast('تعذر قراءة الملف — تأكد من أنه ملف JSON صالح.', { tone: 'serious' });
      return;
    }
    const check = validateSnapshot(snapshot);
    if (!check.ok) { toast(check.reason, { tone: 'serious', timeout: 7000 }); return; }
    const rows = check.present.map((k) => [COLLECTION_LABELS[k], fmt.num(check.counts[k])]);
    if (check.hasSettings) rows.push(['الإعدادات', 'مضمّنة']);
    if (check.savedAt) rows.push(['تاريخ التصدير', fmt.dateTime(check.savedAt)]);
    const body = h('div', { class: 'stack gap-3' },
      h('p', { class: 'text-sm' }, `الملف «${file.name}» يحتوي على المجموعات التالية:`),
      kv(rows),
      h('div', { class: 'note tone-warning' }, 'سيستبدل الاستيراد البيانات الحالية للمجموعات المضمّنة في الملف، ثم يُعاد تحميل الصفحة لتطبيق التغييرات. يُنصح بتصدير نسخة احتياطية أولاً.'));
    const m = modal({
      title: 'تأكيد استيراد البيانات',
      body,
      actions: [
        { label: 'إلغاء', variant: 'ghost' },
        { label: 'استيراد وإعادة التحميل', variant: 'primary', icon: icon('upload', 15), onClick: () => doImport(snapshot) },
      ],
    });
    m.open();
  }

  function fallbackImport(snapshot) {
    store.update((state) => {
      for (const k of COLLECTIONS) if (Array.isArray(snapshot[k])) state[k] = clone(snapshot[k]);
      if (snapshot.settings && typeof snapshot.settings === 'object') state.settings = { ...state.settings, ...clone(snapshot.settings) };
    }, '*');
    return true;
  }

  function doImport(snapshot) {
    let ok = false;
    try {
      ok = typeof store.importState === 'function' ? Boolean(store.importState(snapshot)) : fallbackImport(snapshot);
    } catch (err) {
      console.error('[biltix-hse] settings: import failed', err);
      ok = false;
    }
    if (!ok) { toast('تعذر استيراد الملف — بنية البيانات غير مقبولة.', { tone: 'serious' }); return false; }
    try { if (typeof store.flush === 'function') store.flush(); } catch { /* ignore */ }
    toast('تم استيراد البيانات بنجاح — جارٍ إعادة التحميل…', { tone: 'good' });
    later(() => location.reload(), 700);
    return true;
  }

  function confirmReset() {
    const m = modal({
      title: 'إعادة التعيين إلى البيانات الافتراضية',
      body: h('div', { class: 'stack gap-3' },
        h('div', { class: 'note tone-critical' }, 'سيُحذف كل ما أُضيف أو عُدّل محلياً — المخاطر والحوادث والتصاريح والتفتيشات والتكاملات وسجل البث — وتعود الإعدادات إلى وضعها الافتراضي، ثم يُعاد تحميل الصفحة. لا يمكن التراجع عن هذا الإجراء.'),
        h('p', { class: 'text-sm muted' }, 'يمكنك تصدير نسخة JSON قبل المتابعة للاحتفاظ بالبيانات الحالية.')),
      actions: [
        { label: 'تصدير نسخة أولاً', variant: 'outline', closes: false, onClick: () => exportJSON() },
        { label: 'إلغاء', variant: 'ghost' },
        { label: 'إعادة التعيين', variant: 'danger', icon: icon('trash', 15), onClick: () => {
          try { store.reset(); } catch (err) { console.error('[biltix-hse] settings: reset failed', err); toast('تعذر إعادة التعيين.', { tone: 'serious' }); return false; }
          toast('أُعيد النظام إلى البيانات الافتراضية — جارٍ إعادة التحميل…', { tone: 'good' });
          later(() => location.reload(), 600);
          return true;
        } },
      ],
    });
    m.open();
  }

  const dataCard = card({
    code: 'SET-04', title: 'البيانات', subtitle: 'النسخ الاحتياطي والاستعادة وإعادة التعيين',
    body: h('div', { class: 'stack gap-4' },
      statsEl,
      h('div', { class: 'row gap-2 wrap' },
        button('تصدير JSON', { variant: 'outline', icon: icon('download', 16), onClick: exportJSON }),
        button('استيراد JSON', { variant: 'outline', icon: icon('upload', 16), onClick: () => fileInput.click() }),
        fileInput),
      h('p', { class: 'muted text-xs' }, 'يشمل التصدير كامل الحالة (البيانات والإعدادات وعوامل التصفية). عند الاستيراد تُراجع بنية الملف قبل التطبيق.'),
      h('hr', { class: 'divider' }),
      h('div', { class: 'row between wrap gap-3' },
        h('div', { class: 'stack gap-1' }, h('strong', { class: 'text-sm' }, 'إعادة التعيين إلى البيانات الافتراضية'), h('span', { class: 'muted text-xs' }, 'يحذف التعديلات المحلية ويعيد بيانات العرض التوضيحية والإعدادات الأصلية.')),
        button('إعادة التعيين', { variant: 'danger', size: 'sm', icon: icon('trash', 14), onClick: confirmReset, attrs: { class: 'is-soft' } }))),
  });

  /* ════════════════ حول النظام ════════════════ */

  const company = (store.state && store.state.company) || {};
  const dataSourceBadge = h('span');
  function paintDataSource() {
    const type = (settings().dataSource && settings().dataSource.type) || 'simulation';
    const label = DATA_SOURCE_LABELS[type] || type;
    dataSourceBadge.replaceChildren(badge(label, type === 'simulation' ? 'warning' : 'good'));
  }
  paintDataSource();
  const standards = Array.isArray(company.standards) && company.standards.length
    ? h('div', { class: 'row gap-2 wrap' }, company.standards.map((s) => badge(String(s), 'neutral')))
    : badge('ISO 45001:2018', 'neutral');
  const aboutKv = kv([
    ['الإصدار', h('span', { class: 'mono' }, APP_VERSION)],
    ['تاريخ البناء', h('span', { class: 'row gap-2 wrap' }, fmt.date(BUILD_DATE), h('span', { class: 'mono muted' }, BUILD_DATE))],
    ['الشركة', `${company.name || DEFAULTS.brand.companyName}${company.nameEn ? ` — ${company.nameEn}` : ''}`],
    ['الموقع الإلكتروني', h('a', { href: SITE_URL, target: '_blank', rel: 'noopener noreferrer', class: 'row gap-1 mono ltr', style: { display: 'inline-flex' } }, SITE_LABEL, icon('external', 13))],
    ['مصدر البيانات الحالي', dataSourceBadge],
    ['المعايير المرجعية', standards],
  ]);
  const aboutNote = h('div', { class: 'note tone-warning stack gap-2' },
    h('div', { class: 'row gap-2' }, icon('info', 16), h('strong', {}, 'ملاحظة حول البيانات')),
    h('p', { class: 'text-sm' }, 'البيانات المعروضة في النظام توضيحية (محاكاة حية تُعاد مزامنة تواريخها مع تاريخ اليوم) ما لم يُربط مصدر بيانات حقيقي من قسم التكاملات — JSON API أو Google Sheets أو Supabase.'),
    h('div', {}, button('فتح التكاملات', { variant: 'outline', size: 'sm', icon: icon('plug', 14), onClick: () => (router && typeof router.navigate === 'function' ? router.navigate('integrations') : (location.hash = '#/integrations')) })));
  const aboutCard = card({
    code: 'SET-05', title: 'حول النظام', subtitle: `${company.product || 'Biltix HSE'} — ${company.tagline || 'مركز قيادة السلامة والصحة المهنية'}`,
    body: h('div', { class: 'grid-12' },
      h('div', { class: 'col-span-7' }, aboutKv),
      h('div', { class: 'col-span-5' }, aboutNote)),
  });

  /* ── assemble ── */

  const view = h('section', { class: 'view view-settings' },
    head,
    h('div', { class: 'grid-12' },
      h('div', { class: 'col-span-6' }, appearanceCard),
      h('div', { class: 'col-span-6' }, brandCard),
      h('div', { class: 'col-span-6' }, feedCard),
      h('div', { class: 'col-span-6' }, dataCard),
      h('div', { class: 'col-span-12' }, aboutCard)));
  container.appendChild(view);
  applyMotion(motionOf(settings()));

  /* ── sync from external changes (appbar toggles, command palette, imports) ── */

  function syncFromState() {
    const s = settings();
    const b = brand();
    themeSeg.set(s.theme === 'light' ? 'light' : 'dark');
    numeralsSeg.set(s.numerals === 'arab' ? 'arab' : 'latn');
    const motion = motionOf(s);
    if (document.activeElement !== motionSelect) motionSelect.value = motion;
    applyMotion(motion);
    primaryField.setValue(b.primary);
    accentField.setValue(b.accent);
    if (document.activeElement !== companyInput) companyInput.value = b.companyName || '';
    if (document.activeElement !== logoInput) logoInput.value = b.logoUrl || '';
    paintLogoPreview(b.logoUrl);
    feedSwitch.set(Boolean(s.feedPaused));
    soundSwitch.set(Boolean(s.sound));
    if (document.activeElement !== webhookInput) webhookInput.value = s.alertWebhook || '';
    paintWebhookButton();
    paintExample();
    paintDataSource();
  }

  let statsTimer = null;
  subs.push(bus.on('settings:change', () => syncFromState()));
  subs.push(bus.on('store:change', (payload) => {
    const path = String((payload && payload.path) || '*');
    if (path === 'settings') return;
    if (statsTimer) clearTimeout(statsTimer);
    statsTimer = setTimeout(() => { statsTimer = null; paintStats(); }, 500);
  }));

  return function cleanup() {
    subs.splice(0).forEach((off) => { try { off(); } catch { /* ignore */ } });
    if (statsTimer) { clearTimeout(statsTimer); statsTimer = null; }
    flushBrand();
    for (const id of timers) clearTimeout(id);
    timers.clear();
    try { if (window.speechSynthesis) window.speechSynthesis.cancel(); } catch { /* ignore */ }
  };
}

export const settingsView = {
  id: 'settings',
  code: 'SEC-11',
  title: 'الإعدادات',
  icon: 'sliders',
  render,
};

export default settingsView;
