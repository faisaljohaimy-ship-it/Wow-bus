/**
 * Biltix HSE — SEC-10 التقارير (js/views/reports.js)
 *
 * Generated periodic OHS report:
 *   • period selector (هذا الشهر / آخر 30 يوماً / الربع الحالي) → selectors are evaluated for
 *     that window (plus the global site filter) and `sources.buildReport(state, period)` is
 *     consulted for title / period / kpis when it returns them;
 *   • print-friendly <article class="report"> with a print-only cover (logo lockup, title,
 *     period, prepared-by, date), eight sections (executive summary, KPIs, incidents, risks,
 *     permits, training, compliance, recommendations) — every chart has a table twin;
 *   • action bar: print / PDF, CSV (risks, incidents), full JSON, share, Arabic voice report.
 *
 * Data reaches the DOM only through textContent / components.h. The view depends solely on
 * the ctx handed by the router ({store, bus, sel, fmt, charts, components, art, sources,
 * router}) and returns a cleanup that unsubscribes and cancels speech synthesis.
 */

const DAY_MS = 86_400_000;
const SVG_NS = 'http://www.w3.org/2000/svg';
const REPORT_TITLE = 'تقرير السلامة والصحة المهنية';
const PREPARED_BY = 'بلتكس HSE';
const TRAINING_TARGET = 85;
const ISO_TARGET = 85;

const PERIODS = [
  { value: 'month', label: 'هذا الشهر' },
  { value: '30d', label: 'آخر 30 يوماً' },
  { value: 'quarter', label: 'الربع الحالي' },
];
const QUARTER_NAMES = ['الأول', 'الثاني', 'الثالث', 'الرابع'];
const TONE_RANK = { critical: 0, serious: 1, warning: 2, good: 3, accent: 4, brand: 4, neutral: 5 };
const PRIORITY_LABEL = { critical: 'عاجل', serious: 'مرتفع', warning: 'متوسط', good: 'إيجابي', neutral: 'معلومة', accent: 'معلومة', brand: 'معلومة' };

/** Remembered for the session so switching views keeps the chosen period. */
let currentPeriod = '30d';
let uidCounter = 0;
const uid = (prefix) => `rpt-${prefix}-${(++uidCounter).toString(36)}`;
/** art.js reference (set on render) so action icons use the shared RTL-aware icon set when available. */
let artRef = null;
/** Local icon name → art.js icon name. */
const ART_NAMES = { csv: 'table', json: 'export', doc: 'file-text', arrow: 'arrow-start' };

/* ────────────────────────────── static icons (no data inside) ────────────────────────────── */

const ICONS = {
  print: ['M6 9V4h12v5', 'M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2', 'M6 14h12v6H6z'],
  csv: ['M4 5h16v14H4z', 'M4 10h16M4 15h16M10 5v14'],
  json: ['M8 4H7a2 2 0 0 0-2 2v3.5A2.5 2.5 0 0 1 2.5 12 2.5 2.5 0 0 1 5 14.5V18a2 2 0 0 0 2 2h1', 'M16 4h1a2 2 0 0 1 2 2v3.5a2.5 2.5 0 0 0 2.5 2.5 2.5 2.5 0 0 0-2.5 2.5V18a2 2 0 0 1-2 2h-1'],
  share: ['M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7', 'M16 6l-4-4-4 4', 'M12 2v13'],
  play: ['M7 4l12 8-12 8z'],
  stop: ['M6 6h12v12H6z'],
  speaker: ['M11 5L6 9H2v6h4l5 4V5z', 'M15.5 8.5a5 5 0 0 1 0 7', 'M18.5 5.5a9 9 0 0 1 0 13'],
  calendar: ['M4 5h16v15H4z', 'M4 10h16', 'M8 3v4M16 3v4'],
  arrow: ['M19 12H5', 'M12 19l-7-7 7-7'],
  doc: ['M7 3h7l5 5v13H7z', 'M14 3v5h5', 'M9 13h6M9 17h6'],
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
  for (const d of ICONS[name] || ICONS.doc) {
    const p = document.createElementNS(SVG_NS, 'path');
    p.setAttribute('d', d);
    svg.appendChild(p);
  }
  return svg;
}

/* ────────────────────────────── small helpers ────────────────────────────── */

function safe(fn, fallback) {
  try {
    const v = fn();
    return v === undefined ? fallback : v;
  } catch (err) {
    console.warn('[biltix-hse] reports: selector failed', err);
    return fallback;
  }
}

function startOfDay(d) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function addDays(d, n) {
  const x = new Date(d.getTime());
  x.setDate(x.getDate() + n);
  return x;
}

function isoDate(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function clamp(n, min, max) {
  return Math.min(max, Math.max(min, n));
}

function toneFor(score) {
  if (score >= 85) return 'good';
  if (score >= 70) return 'warning';
  if (score >= 50) return 'serious';
  return 'critical';
}

function downloadBlob(blob, filename) {
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

/** Local CSV writer (UTF-8 BOM so Excel opens Arabic correctly) used when sources.exportCSV is unavailable. */
function csvDownload(rows, columns, filename) {
  const esc = (value) => {
    let s = value === null || value === undefined ? '' : String(value);
    if (/^[=+@\t\r]/.test(s)) s = `'${s}`;
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [columns.map((c) => esc(c.label)).join(',')];
  for (const row of rows) lines.push(columns.map((c) => esc(row[c.key])).join(','));
  downloadBlob(new Blob([`﻿${lines.join('\r\n')}`], { type: 'text/csv;charset=utf-8' }), filename);
}

function jsonDownload(obj, filename) {
  downloadBlob(new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json;charset=utf-8' }), filename);
}

/* ────────────────────────────── Arabic copy helpers ────────────────────────────── */

const NOUNS = {
  report: { zero: 'لا بلاغات', one: 'بلاغ واحد', two: 'بلاغان', few: 'بلاغات', many: 'بلاغاً' },
  incident: { zero: 'لا حوادث', one: 'حادث واحد', two: 'حادثان', few: 'حوادث', many: 'حادثاً' },
  nearMiss: { zero: 'لا حوادث وشيكة', one: 'حادث وشيك واحد', two: 'حادثان وشيكان', few: 'حوادث وشيكة', many: 'حادثاً وشيكاً' },
  lti: { zero: 'لا إصابات مضيعة للوقت', one: 'إصابة واحدة مضيعة للوقت', two: 'إصابتان مضيعتان للوقت', few: 'إصابات مضيعة للوقت', many: 'إصابة مضيعة للوقت' },
  risk: { zero: 'لا مخاطر', one: 'مخاطرة واحدة', two: 'مخاطرتان', few: 'مخاطر', many: 'مخاطرة' },
  permit: { zero: 'لا تصاريح', one: 'تصريح واحد', two: 'تصريحان', few: 'تصاريح', many: 'تصريحاً' },
  inspection: { zero: 'لا تفتيشات', one: 'تفتيش واحد', two: 'تفتيشان', few: 'تفتيشات', many: 'تفتيشاً' },
  cert: { zero: 'لا شهادات', one: 'شهادة واحدة', two: 'شهادتان', few: 'شهادات', many: 'شهادة' },
  gap: { zero: 'لا فجوات', one: 'فجوة واحدة', two: 'فجوتان', few: 'فجوات', many: 'فجوة' },
  day: { zero: 'لا أيام', one: 'يوم واحد', two: 'يومان', few: 'أيام', many: 'يوماً' },
  point: { zero: '', one: 'نقطة واحدة', two: 'نقطتين', few: 'نقاط', many: 'نقطة' },
  pp: { zero: '', one: 'نقطة مئوية واحدة', two: 'نقطتين مئويتين', few: 'نقاط مئوية', many: 'نقطة مئوية' },
  site: { zero: 'لا مواقع', one: 'موقع واحد', two: 'موقعان', few: 'مواقع', many: 'موقعاً' },
  action: { zero: 'لا إجراءات', one: 'إجراء واحد', two: 'إجراءان', few: 'إجراءات', many: 'إجراءً' },
  course: { zero: 'لا دورات', one: 'دورة واحدة', two: 'دورتان', few: 'دورات', many: 'دورة' },
};

function makeCopy(fmt) {
  const count = (n, noun) => {
    const v = Math.max(0, Math.round(Number(n) || 0));
    if (v === 0) return noun.zero;
    if (v === 1) return noun.one;
    if (v === 2) return noun.two;
    if (v <= 10) return `${fmt.num(v)} ${noun.few}`;
    return `${fmt.num(v)} ${noun.many}`;
  };
  const delta = (d, noun = NOUNS.point) => {
    const n = Number(d) || 0;
    if (Math.abs(n) < 0.005) return 'دون تغيير يُذكر مقارنة بالفترة السابقة';
    const mag = Math.abs(n);
    const amount = Number.isInteger(mag) ? count(mag, noun) : `${fmt.num(mag, { maximumFractionDigits: 2 })} ${noun.many}`;
    return `${n > 0 ? 'بارتفاع' : 'بانخفاض'} ${amount} عن الفترة السابقة`;
  };
  return { count, delta };
}

/* ────────────────────────────── period model ────────────────────────────── */

function resolvePeriod(key, now, fmt) {
  const today = startOfDay(now);
  let from;
  let kind = key;
  if (key === 'month') from = new Date(today.getFullYear(), today.getMonth(), 1);
  else if (key === 'quarter') from = new Date(today.getFullYear(), Math.floor(today.getMonth() / 3) * 3, 1);
  else { from = addDays(today, -29); kind = '30d'; }
  const range = Math.max(1, Math.round((today.getTime() - from.getTime()) / DAY_MS) + 1);

  let label;
  if (kind === 'month') label = monthYear(from, fmt);
  else if (kind === 'quarter') label = `الربع ${QUARTER_NAMES[Math.floor(from.getMonth() / 3)]} ${yearLabel(from, fmt)}`;
  else label = 'آخر 30 يوماً';
  const rangeLabel = `${fmt.date(from)} – ${fmt.date(today)}`;
  const suffix = kind === 'quarter' ? 'الربعي' : 'الشهري';
  return { key: kind, from, to: today, now, range, label, rangeLabel, title: `${REPORT_TITLE} ${suffix}` };
}

function intlLocale(fmt) {
  const arab = typeof fmt.getNumerals === 'function' && fmt.getNumerals() === 'arab';
  return arab ? 'ar-SA-u-ca-gregory' : 'ar-SA-u-nu-latn-ca-gregory';
}

function monthYear(date, fmt) {
  try {
    return new Intl.DateTimeFormat(intlLocale(fmt), { month: 'long', year: 'numeric' }).format(date);
  } catch {
    return fmt.date(date);
  }
}

function yearLabel(date, fmt) {
  try {
    return new Intl.DateTimeFormat(intlLocale(fmt), { year: 'numeric' }).format(date);
  } catch {
    return String(date.getFullYear());
  }
}

/* ────────────────────────────── speech controller ────────────────────────────── */

function splitForSpeech(text, maxLen = 180) {
  const sentences = String(text).split(/(?<=[.!؟?؛\n])\s+/).map((s) => s.trim()).filter(Boolean);
  const chunks = [];
  let buffer = '';
  for (const s of sentences) {
    if (buffer && buffer.length + s.length + 1 > maxLen) { chunks.push(buffer); buffer = s; }
    else buffer = buffer ? `${buffer} ${s}` : s;
  }
  if (buffer) chunks.push(buffer);
  return chunks;
}

function createSpeech(onState) {
  const synth = typeof window !== 'undefined' ? window.speechSynthesis : null;
  const supported = Boolean(synth && typeof window.SpeechSynthesisUtterance === 'function');
  let speaking = false;
  let pending = 0;

  const voices = () => { try { return synth.getVoices() || []; } catch { return []; } };
  const arabicVoice = () => {
    const list = voices();
    return list.find((v) => /^ar[-_]SA/i.test(v.lang)) || list.find((v) => /^ar/i.test(v.lang) && v.default) || list.find((v) => /^ar/i.test(v.lang)) || null;
  };
  const setState = (next) => { if (speaking === next) return; speaking = next; onState(next); };

  function start(text) {
    if (!supported || !text) return false;
    try { synth.cancel(); } catch { /* ignore */ }
    const chunks = splitForSpeech(text);
    if (!chunks.length) return false;
    const voice = arabicVoice();
    pending = chunks.length;
    setState(true);
    try {
      chunks.forEach((chunk) => {
        const u = new SpeechSynthesisUtterance(chunk);
        u.lang = voice ? voice.lang : 'ar-SA';
        if (voice) u.voice = voice;
        u.rate = 0.95;
        u.pitch = 1;
        const done = () => { pending -= 1; if (pending <= 0) setState(false); };
        u.onend = done;
        u.onerror = () => { pending = 0; setState(false); };
        synth.speak(u);
      });
    } catch {
      pending = 0;
      setState(false);
      return false;
    }
    return true;
  }

  function stop() {
    pending = 0;
    try { if (synth) synth.cancel(); } catch { /* ignore */ }
    setState(false);
  }

  return { supported, start, stop, hasArabic: () => Boolean(arabicVoice()), isSpeaking: () => speaking };
}

/* ────────────────────────────── data collection ────────────────────────────── */

function collect(ctx, period) {
  const { store, sel } = ctx;
  const state = store.state || {};
  const now = period.now;
  const siteId = (store.filters && store.filters.siteId) || 'all';
  const filters = { siteId, range: period.range, search: '' };
  const kpis = safe(() => sel.kpis(state, filters, now), { deltas: {}, previous: {} });
  const weeks = clamp(Math.ceil(period.range / 7) + 1, 5, 14);
  const byType = safe(() => sel.incidentsByType(state, filters, now), []);
  const iso = safe(() => sel.isoScores(state), []);
  const isoOverall = safe(() => (typeof sel.isoOverall === 'function' ? sel.isoOverall(state) : Math.round(iso.reduce((a, c) => a + c.score, 0) / (iso.length || 1))), 0);
  const nearMissInPeriod = (byType.find((t) => t.label === 'حادث وشيك') || {}).value || 0;

  let built = null;
  try {
    if (ctx.sources && typeof ctx.sources.buildReport === 'function') {
      built = ctx.sources.buildReport(state, { period: period.key, from: isoDate(period.from), to: isoDate(period.to), range: period.range, siteId, now });
    }
  } catch (err) {
    console.warn('[biltix-hse] reports: sources.buildReport failed', err);
  }

  return {
    state, now, siteId, filters, period,
    site: siteId !== 'all' ? safe(() => sel.siteById(state, siteId), null) : null,
    sites: Array.isArray(state.sites) ? state.sites : [],
    kpis,
    nearMissInPeriod,
    incidentsOnly: Math.max(0, (kpis.incidentsInPeriod || 0) - nearMissInPeriod),
    trend: safe(() => sel.incidentTrend(state, weeks, filters, now), []),
    byType,
    pareto: safe(() => sel.rootCausePareto(state, filters, now), []),
    matrix: safe(() => sel.riskMatrix(state, filters, now), Array.from({ length: 5 }, () => Array(5).fill(0))),
    categories: safe(() => sel.risksByCategory(state, filters, now), []),
    permits: safe(() => sel.permitsByStatus(state, filters, now), []),
    permitsSoon: safe(() => sel.permitsExpiringSoon(state, 60, filters, now), []),
    training: safe(() => sel.trainingCompletionByCourse(state, filters, now), []),
    expiring: safe(() => sel.expiringCerts(state, 60, filters, now), []),
    iso,
    isoOverall,
    legal: Array.isArray(state.legalRegister) ? state.legalRegister : [],
    urgent: safe(() => sel.urgentActions(state, now, { siteId }), []),
    risks: safe(() => sel.filteredRisks(state, filters, now), []),
    incidents: safe(() => sel.filteredIncidents(state, filters, now), []),
    built: built && typeof built === 'object' ? built : null,
  };
}

/* ────────────────────────────── the view ────────────────────────────── */

function render(container, ctx) {
  const { store, bus, sel, fmt, components, router } = ctx;
  const charts = ctx.charts || {};
  const sources = ctx.sources || {};
  const art = ctx.art || {};
  artRef = art;
  const { h, card, statTile, badge, button, segmented, toast, emptyState, kv } = components;
  const copy = makeCopy(fmt);
  const subs = [];
  let rebuildTimer = null;
  let voicesHandler = null;
  let latest = null;

  if (ctx.params && PERIODS.some((p) => p.value === ctx.params.period)) currentPeriod = ctx.params.period;

  /* ── header ── */
  const periodSeg = segmented({
    options: PERIODS,
    value: currentPeriod,
    ariaLabel: 'فترة التقرير',
    onChange: (value) => { currentPeriod = value; rebuild(); },
  });

  const head = h('div', { class: 'view-head' },
    h('div', { class: 'view-head-text' },
      h('span', { class: 'code-tag' }, 'SEC-10'),
      h('h1', {}, 'التقارير'),
      h('p', { class: 'view-lead' }, 'تقرير دوري للسلامة والصحة المهنية يُولَّد مباشرة من بيانات النظام، قابل للطباعة والتصدير والمشاركة، ويتبع الموقع المحدد في عوامل التصفية.')),
    h('div', { class: 'view-actions' }, h('span', { class: 'muted text-sm' }, 'الفترة'), periodSeg.el));

  /* ── speech ── */
  let speechText = '';
  const speech = createSpeech((speaking) => paintVoiceButton(speaking));
  const voiceBtn = button('تقرير صوتي', {
    variant: 'outline',
    icon: icon('play', 16),
    onClick: () => {
      if (!speech.supported) { toast('القراءة الصوتية غير مدعومة في هذا المتصفح.', { tone: 'warning' }); return; }
      if (speech.isSpeaking()) { speech.stop(); return; }
      if (!speech.start(speechText)) toast('تعذر بدء القراءة الصوتية.', { tone: 'warning' });
    },
    attrs: { 'aria-pressed': 'false', title: 'قراءة الملخص التنفيذي بصوت عربي' },
  });
  const voiceHint = h('span', { class: 'muted text-xs report-voice-hint', 'aria-live': 'polite' });

  function paintVoiceButton(speaking) {
    const label = voiceBtn.querySelector('.btn-label');
    const ic = voiceBtn.querySelector('.btn-ic');
    if (label) label.textContent = speaking ? 'إيقاف القراءة' : 'تقرير صوتي';
    if (ic) { const next = icon(speaking ? 'stop' : 'play', 16); next.classList.add('btn-ic'); ic.replaceWith(next); }
    voiceBtn.setAttribute('aria-pressed', speaking ? 'true' : 'false');
    voiceBtn.classList.toggle('is-active', speaking);
  }

  function paintVoiceHint() {
    if (!speech.supported) { voiceHint.textContent = 'القراءة الصوتية غير متاحة في هذا المتصفح.'; return; }
    voiceHint.textContent = speech.hasArabic() ? 'صوت عربي متاح للقراءة.' : 'لا يتوفر صوت عربي مثبت — سيُستخدم الصوت الافتراضي للمتصفح.';
  }
  paintVoiceHint();
  if (speech.supported && window.speechSynthesis && typeof window.speechSynthesis.addEventListener === 'function') {
    voicesHandler = () => paintVoiceHint();
    window.speechSynthesis.addEventListener('voiceschanged', voicesHandler);
  }

  /* ── actions ── */
  function exportRows(kind) {
    if (!latest) return;
    const siteName = (id) => { const s = latest.sites.find((x) => x.id === id); return s ? s.name : ''; };
    const catName = (id) => { const c = safe(() => sel.categoryById(id), null); return c ? c.name : id || ''; };
    const stamp = isoDate(latest.now);
    if (kind === 'risks') {
      const columns = [
        { key: 'code', label: 'الرمز' }, { key: 'site', label: 'الموقع' }, { key: 'category', label: 'فئة الخطر' },
        { key: 'hazard', label: 'الخطر' }, { key: 'activity', label: 'النشاط' }, { key: 'likelihood', label: 'الاحتمالية' },
        { key: 'severity', label: 'الشدة' }, { key: 'score', label: 'الدرجة' }, { key: 'tier', label: 'المستوى' },
        { key: 'residualLikelihood', label: 'الاحتمالية المتبقية' }, { key: 'residualSeverity', label: 'الشدة المتبقية' },
        { key: 'residualScore', label: 'الدرجة المتبقية' }, { key: 'controls', label: 'الضوابط' }, { key: 'owner', label: 'المسؤول' },
        { key: 'dueDate', label: 'موعد المعالجة' }, { key: 'status', label: 'الحالة' }, { key: 'source', label: 'المصدر' },
        { key: 'legalRef', label: 'المرجع النظامي' }, { key: 'createdAt', label: 'تاريخ الإنشاء' }, { key: 'updatedAt', label: 'آخر تحديث' },
      ];
      const rows = latest.risks.map((r) => {
        const score = sel.riskScore(r);
        return {
          code: r.code, site: siteName(r.siteId), category: catName(r.categoryId), hazard: r.hazard, activity: r.activity,
          likelihood: r.likelihood, severity: r.severity, score, tier: sel.riskTier(score),
          residualLikelihood: r.residualLikelihood, residualSeverity: r.residualSeverity, residualScore: safe(() => sel.residualScore(r), ''),
          controls: (Array.isArray(r.controls) ? r.controls : []).map((c) => (c && c.type ? `${c.type}: ${c.text}` : (c && c.text) || '')).filter(Boolean).join(' | '),
          owner: r.owner, dueDate: r.dueDate, status: r.status, source: r.source, legalRef: r.legalRef, createdAt: r.createdAt, updatedAt: r.updatedAt,
        };
      });
      exportCSV(rows, columns, `biltix-hse-risks-${stamp}.csv`, 'تم تصدير سجل المخاطر بصيغة CSV.');
      return;
    }
    const columns = [
      { key: 'code', label: 'الرمز' }, { key: 'date', label: 'التاريخ' }, { key: 'time', label: 'الوقت' }, { key: 'site', label: 'الموقع' },
      { key: 'type', label: 'النوع' }, { key: 'severity', label: 'الشدة' }, { key: 'title', label: 'العنوان' }, { key: 'location', label: 'المكان' },
      { key: 'category', label: 'فئة الخطر' }, { key: 'bodyPart', label: 'الجزء المصاب' }, { key: 'rootCause', label: 'السبب الجذري' },
      { key: 'immediateCause', label: 'السبب المباشر' }, { key: 'status', label: 'الحالة' }, { key: 'investigationStep', label: 'خطوة التحقيق' },
      { key: 'daysLost', label: 'أيام العمل المفقودة' }, { key: 'actions', label: 'الإجراءات (المنجزة/الكل)' }, { key: 'reporter', label: 'المبلّغ' },
    ];
    const rows = latest.incidents.map((i) => {
      const actions = Array.isArray(i.actions) ? i.actions : [];
      return {
        code: i.code, date: i.date, time: i.time, site: siteName(i.siteId), type: i.type, severity: i.severity, title: i.title, location: i.location,
        category: catName(i.categoryId), bodyPart: i.bodyPart || '', rootCause: i.rootCause, immediateCause: i.immediateCause, status: i.status,
        investigationStep: i.investigationStep, daysLost: i.daysLost, actions: `${actions.filter((a) => a && a.done).length}/${actions.length}`, reporter: i.reporter,
      };
    });
    exportCSV(rows, columns, `biltix-hse-incidents-${stamp}.csv`, 'تم تصدير سجل الحوادث بصيغة CSV.');
  }

  function exportCSV(rows, columns, filename, message) {
    if (!rows.length) { toast('لا توجد سجلات ضمن الفترة والموقع المحددين للتصدير.', { tone: 'warning' }); return; }
    try {
      if (typeof sources.exportCSV === 'function') sources.exportCSV(rows, columns, filename);
      else csvDownload(rows, columns, filename);
      toast(message, { tone: 'good' });
    } catch (err) {
      console.warn('[biltix-hse] reports: exportCSV failed, using local writer', err);
      try { csvDownload(rows, columns, filename); toast(message, { tone: 'good' }); } catch { toast('تعذر إنشاء ملف CSV.', { tone: 'serious' }); }
    }
  }

  function exportJSON() {
    const filename = `biltix-hse-${isoDate(store.now ? store.now() : new Date())}.json`;
    try {
      if (typeof sources.exportJSON === 'function') sources.exportJSON(store.state, filename);
      else jsonDownload(store.state, filename);
      toast('تم تصدير الحالة الكاملة للنظام بصيغة JSON.', { tone: 'good' });
    } catch (err) {
      console.warn('[biltix-hse] reports: exportJSON failed, using local writer', err);
      try { jsonDownload(store.state, filename); toast('تم تصدير الحالة الكاملة للنظام بصيغة JSON.', { tone: 'good' }); } catch { toast('تعذر إنشاء ملف JSON.', { tone: 'serious' }); }
    }
  }

  async function share() {
    if (!latest) return;
    const title = latest.period.title;
    const text = `${title} — ${latest.period.label}\n${speechText.split('\n')[0] || ''}`;
    const url = location.href;
    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      try {
        await navigator.share({ title, text, url });
        toast('تمت مشاركة التقرير.', { tone: 'good' });
        return;
      } catch (err) {
        if (err && err.name === 'AbortError') return;
      }
    }
    try {
      await navigator.clipboard.writeText(`${title}\n${latest.period.label}\n${url}\n\n${speechText}`);
      toast('تم نسخ رابط التقرير وملخصه التنفيذي إلى الحافظة.', { tone: 'good' });
    } catch {
      toast('تعذر النسخ إلى الحافظة في هذا المتصفح.', { tone: 'warning' });
    }
  }

  function print() {
    try { window.print(); } catch { toast('تعذر فتح نافذة الطباعة.', { tone: 'warning' }); }
  }

  const actions = h('div', { class: 'toolbar report-actions print-hide', role: 'toolbar', 'aria-label': 'إجراءات التقرير' },
    button('طباعة / حفظ PDF', { variant: 'primary', icon: icon('print', 16), onClick: print }),
    button('تصدير CSV للمخاطر', { variant: 'outline', icon: icon('csv', 16), onClick: () => exportRows('risks') }),
    button('تصدير CSV للحوادث', { variant: 'outline', icon: icon('csv', 16), onClick: () => exportRows('incidents') }),
    button('تصدير JSON كامل', { variant: 'outline', icon: icon('json', 16), onClick: exportJSON }),
    button('مشاركة', { variant: 'outline', icon: icon('share', 16), onClick: () => { share(); } }),
    h('span', { class: 'toolbar-spacer' }),
    h('div', { class: 'row gap-2 wrap' }, voiceBtn, voiceHint));

  /* ── report body ── */
  const article = h('article', { class: 'report stack gap-4', 'aria-label': 'معاينة التقرير' });
  const view = h('section', { class: 'view view-reports' }, head, actions, article);
  container.appendChild(view);

  /* ── builders ── */

  function lockup() {
    const wrap = h('div', { class: 'row gap-3 report-lockup' });
    let node = null;
    try {
      if (typeof art.logoLockup === 'function') node = art.logoLockup();
      else if (typeof art.logoMark === 'function') node = art.logoMark(40);
    } catch { node = null; }
    if (node instanceof Node) {
      if (node.setAttribute && !node.hasAttribute('aria-hidden')) node.setAttribute('aria-hidden', 'true');
      wrap.appendChild(node);
      if (typeof art.logoLockup !== 'function') wrap.appendChild(h('strong', { class: 'text-lg' }, PREPARED_BY));
    } else {
      wrap.appendChild(components.glyph('brand', 36));
      wrap.appendChild(h('strong', { class: 'text-lg' }, PREPARED_BY));
    }
    return wrap;
  }

  function sectionEl(code, title, lead, { breakBefore = false, narrative = null } = {}) {
    const id = uid('sec');
    const header = h('header', { class: 'row between wrap gap-3 report-section-head' },
      h('div', { class: 'row gap-2 wrap' }, h('span', { class: 'code-tag' }, code), h('h2', { id, class: 'report-section-title' }, title)),
      lead ? h('p', { class: 'muted text-sm' }, lead) : null);
    return h('section', { class: ['report-section', 'stack', 'gap-3', breakBefore ? 'print-break' : null], 'aria-labelledby': id }, header, narrative);
  }

  /** Section object produced by sources.buildReport (when the engine returned one). */
  function builtSection(d, id) {
    const list = d.built && Array.isArray(d.built.sections) ? d.built.sections : [];
    return list.find((s) => s && s.id === id) || null;
  }

  /** The engine's narrative sentences for a section, rendered as an analytical note. */
  function narrativeBlock(d, id) {
    const s = builtSection(d, id);
    const lines = s && Array.isArray(s.narrative) ? s.narrative.filter((x) => typeof x === 'string' && x.trim()) : [];
    if (!lines.length) return null;
    return h('div', { class: 'note tone-accent report-narrative-note print-avoid' }, h('p', { class: 'text-sm', style: { maxInlineSize: '100ch' } }, lines.join(' ')));
  }

  function simpleTable(caption, headers, rows) {
    const table = h('table', { class: 'chart-table' });
    if (caption) table.appendChild(h('caption', {}, caption));
    table.appendChild(h('thead', {}, h('tr', {}, headers.map((label, i) => h('th', { scope: 'col', class: i > 0 ? 'num' : null }, label)))));
    table.appendChild(h('tbody', {}, rows.map((cells) => h('tr', {}, cells.map((c, i) => h('td', { class: i > 0 ? 'num' : null }, c === null || c === undefined || c === '' ? '—' : String(c)))))));
    return table;
  }

  /** Build a chart defensively: a failing chart module degrades to its table twin. */
  function mountChart(make, fallbackTable) {
    try {
      const c = make();
      if (c && c.el instanceof Node) {
        return { el: c.el, table: () => { try { const t = typeof c.table === 'function' ? c.table() : null; return t instanceof Node ? t : fallbackTable(); } catch { return fallbackTable(); } } };
      }
    } catch (err) {
      console.warn('[biltix-hse] reports: chart failed, showing table', err);
    }
    let table = null;
    try { table = fallbackTable(); } catch { table = null; }
    return {
      el: table ? h('div', { class: 'table-wrap' }, table) : emptyState({ title: 'لا تتوفر بيانات لهذا المخطط' }),
      table: fallbackTable,
    };
  }

  function chartCard({ code, title, subtitle, chart, className = '' }) {
    return card({ code, title, subtitle, className, body: chart.el, tableView: chart.table });
  }

  function factEl(label, value, { tone = null, small = '' } = {}) {
    const el = h('div', { class: ['fact', tone ? `tone-${tone}` : null] });
    el.appendChild(h('span', { class: 'fact-label' }, label));
    const v = h('span', { class: 'fact-value' }, String(value));
    if (small) v.appendChild(h('small', {}, small));
    el.appendChild(v);
    return el;
  }

  /* ── executive summary ── */

  function summaryParagraphs(d) {
    const k = d.kpis;
    const prev = k.previous || {};
    const { count, delta } = copy;
    const scope = d.site ? `لموقع «${d.site.name}» (${d.site.code || d.site.id})` : `لجميع مواقع الشركة (${count(d.sites.length, NOUNS.site)})`;
    const si = Number(k.safetyIndex) || 0;
    const siQual = si >= 85 ? 'وهو مستوى جيد يعكس سيطرة فعالة على المخاطر' : si >= 70 ? 'وهو مستوى مقبول يتطلب متابعة الإجراءات المفتوحة' : 'وهو مستوى يستدعي تدخلاً عاجلاً من الإدارة';
    const total = Number(k.incidentsInPeriod) || 0;
    const topCat = d.categories[0];
    const weakest = d.iso.length ? d.iso.reduce((a, c) => (c.score < a.score ? c : a), d.iso[0]) : null;
    const gaps = d.iso.reduce((sum, c) => sum + (Number(c.gaps) || 0), 0);
    const pending = (d.permits.find((p) => p.label === 'بانتظار الاعتماد') || {}).value || 0;
    const top = d.pareto[0];

    const p1 = `يغطي هذا التقرير فترة ${d.period.label} (${d.period.rangeLabel}) ${scope}، ويستند إلى بيانات سجل المخاطر والحوادث وتصاريح العمل والتفتيش والتدريب حتى ${fmt.dateTime(d.now)}. `
      + `بلغ مؤشر السلامة العام ${fmt.num(si)} من 100، ${delta(k.deltas.safetyIndex)}، ${siQual}.`;

    const p2 = `سُجّل خلال الفترة ${count(total, NOUNS.report)}${total ? `: ${count(d.incidentsOnly, NOUNS.incident)} و${count(d.nearMissInPeriod, NOUNS.nearMiss)}` : ''}، `
      + `${k.lti ? `من بينها ${count(k.lti, NOUNS.lti)}` : 'دون أي إصابة مضيعة للوقت'}، مقابل ${count(prev.incidentsInPeriod, NOUNS.report)} في الفترة السابقة. `
      + `وبلغ معدل تكرار الإصابات المضيعة للوقت (LTIFR) ${fmt.num(k.ltifr, { maximumFractionDigits: 2 })} ومعدل الحوادث المسجلة (TRIR) ${fmt.num(k.trir, { maximumFractionDigits: 2 })}، `
      + `فيما مضى ${count(k.daysSinceLTI, NOUNS.day)} دون إصابة مضيعة للوقت.`
      + (top ? ` وتصدّر «${top.label}» الأسباب الجذرية بنسبة ${fmt.pct(top.pct)} من البلاغات المحللة.` : '');

    const p3 = `يضم سجل المخاطر ${count(k.openRisks, NOUNS.risk)} مفتوحة، منها ${fmt.num(k.criticalRisks)} في المستوى الحرج و${fmt.num(k.highRisks)} في المستوى العالي، `
      + `${k.overdueRisks ? `و${count(k.overdueRisks, NOUNS.risk)} تجاوزت موعد المعالجة المقرر` : 'ولا توجد مخاطر متأخرة عن موعد معالجتها'}`
      + `${topCat ? `، وتتركز المخاطر المفتوحة في فئة «${topCat.label}» (${fmt.num(topCat.value)})` : ''}. `
      + `هناك ${count(k.activePermits, NOUNS.permit)} نشطة و${count(pending, NOUNS.permit)} بانتظار الاعتماد، و${count(k.inspectionsDue, NOUNS.inspection)} مستحقة أو متأخرة خلال الأسبوع.`;

    const p4 = `بلغت نسبة الامتثال التدريبي ${fmt.pct(k.trainingCompliance)} ${delta(k.deltas.trainingCompliance, NOUNS.pp)}، وتنتهي صلاحية ${count(d.expiring.length, NOUNS.cert)} خلال 60 يوماً. `
      + `وأُغلق ${fmt.pct(k.capaClosure)} من الإجراءات التصحيحية (${fmt.num(k.actionsDone)} من ${fmt.num(k.actionsTotal)}). `
      + (d.iso.length
        ? `يبلغ متوسط الامتثال لمتطلبات ISO 45001 ${fmt.pct(d.isoOverall)}، وأدنى البنود «${weakest.title}» بنسبة ${fmt.pct(weakest.score)} مع ${count(gaps, NOUNS.gap)} موثقة تتطلب خطة معالجة.`
        : '');

    return [p1, p2, p3, p4].filter((p) => p.trim());
  }

  function summarySection(d) {
    const k = d.kpis;
    const paragraphs = summaryParagraphs(d);
    const strip = h('div', { class: 'summary-strip' },
      stripCell('مؤشر السلامة', fmt.num(k.safetyIndex), '/100', k.deltas.safetyIndex, 'up'),
      stripCell('البلاغات في الفترة', fmt.num(k.incidentsInPeriod), '', k.deltas.incidentsInPeriod, 'down'),
      stripCell('المخاطر الحرجة المفتوحة', fmt.num(k.criticalRisks), '', k.deltas.criticalRisks, 'down'),
      stripCell('الامتثال التدريبي', fmt.pct(k.trainingCompliance), '', k.deltas.trainingCompliance, 'up'));
    const body = h('div', { class: 'stack gap-4' }, strip, h('div', { class: 'stack gap-3 report-narrative', style: { maxInlineSize: '92ch' } }, paragraphs.map((p) => h('p', {}, p))));
    const sec = sectionEl('RPT-01', 'الملخص التنفيذي', 'قراءة تحليلية للأرقام مقارنةً بالفترة السابقة المماثلة.');
    sec.appendChild(card({ hero: true, body }));
    return { el: sec, text: paragraphs.join('\n') };
  }

  function stripCell(label, value, small, delta, goodWhen) {
    const cell = h('div', { class: 'summary-cell' });
    cell.appendChild(h('span', { class: 'summary-label' }, label));
    const v = h('span', { class: 'summary-value' }, value);
    if (small) v.appendChild(h('small', {}, small));
    cell.appendChild(v);
    const n = Number(delta);
    if (Number.isFinite(n)) {
      const tone = n === 0 ? 'neutral' : ((goodWhen === 'up') === (n > 0) ? 'good' : 'serious');
      cell.appendChild(h('span', { class: 'row gap-1 text-xs muted' }, badge(fmt.signed(n), tone), 'عن الفترة السابقة'));
    }
    return cell;
  }

  /* ── KPIs ── */

  function kpiSection(d) {
    const k = d.kpis;
    const dl = k.deltas || {};
    const tiles = h('div', { class: 'kpi-row' },
      statTile({ label: 'مؤشر السلامة', value: k.safetyIndex, unit: '/100', delta: dl.safetyIndex, deltaGoodWhen: 'up', tone: toneFor(k.safetyIndex), hint: 'مؤشر مركّب من المخاطر المفتوحة والإصابات والحوادث الوشيكة والامتثال التدريبي' }),
      statTile({ label: 'LTIFR', value: fmt.num(k.ltifr, { maximumFractionDigits: 2 }), delta: fmt.signed(dl.ltifr || 0, 2), deltaGoodWhen: 'down', hint: 'إصابات مضيعة للوقت لكل مليون ساعة عمل' }),
      statTile({ label: 'TRIR', value: fmt.num(k.trir, { maximumFractionDigits: 2 }), delta: fmt.signed(dl.trir || 0, 2), deltaGoodWhen: 'down', hint: 'الحوادث المسجلة لكل 200 ألف ساعة عمل' }),
      statTile({ label: 'الحوادث المسجلة', value: d.incidentsOnly, delta: (dl.incidentsInPeriod || 0), deltaGoodWhen: 'down', hint: 'الإصابات وتلف الممتلكات والحوادث البيئية خلال الفترة (دون الحوادث الوشيكة)' }),
      statTile({ label: 'الحوادث الوشيكة (30 يوماً)', value: k.nearMisses30d, delta: dl.nearMisses30d, deltaGoodWhen: 'up', hint: 'ارتفاع الإبلاغ عن الحوادث الوشيكة مؤشر إيجابي على ثقافة الإبلاغ' }),
      statTile({ label: 'المخاطر الحرجة المفتوحة', value: k.criticalRisks, delta: dl.criticalRisks, deltaGoodWhen: 'down', tone: k.criticalRisks > 0 ? 'critical' : 'good' }),
      statTile({ label: 'إغلاق الإجراءات التصحيحية', value: k.capaClosure, unit: '%', delta: dl.capaClosure, deltaGoodWhen: 'up', tone: toneFor(k.capaClosure) }),
      statTile({ label: 'الامتثال التدريبي', value: k.trainingCompliance, unit: '%', delta: dl.trainingCompliance, deltaGoodWhen: 'up', tone: toneFor(k.trainingCompliance) }));
    const sec = sectionEl('RPT-02', 'مؤشرات الأداء', 'التغير محسوب مقارنةً بالفترة السابقة المماثلة في الطول.', { narrative: narrativeBlock(d, 'kpis') });
    sec.appendChild(tiles);
    return sec;
  }

  /* ── incidents ── */

  function incidentsSection(d) {
    const labels = d.trend.map((b) => b.label);
    const line = mountChart(
      () => charts.lineChart({
        series: [
          { id: 'incidents', label: 'الحوادث', color: 'var(--s1)', values: d.trend.map((b) => b.incidents) },
          { id: 'nearmiss', label: 'الحوادث الوشيكة', color: 'var(--s2)', values: d.trend.map((b) => b.nearMisses) },
        ],
        labels, height: 240, yFormat: fmt.num, ariaLabel: 'اتجاه الحوادث والحوادث الوشيكة أسبوعياً',
      }),
      () => simpleTable('اتجاه الحوادث أسبوعياً', ['الأسبوع', 'الحوادث', 'الحوادث الوشيكة'], d.trend.map((b) => [b.label, fmt.num(b.incidents), fmt.num(b.nearMisses)])),
    );
    const typeParts = d.byType.map((t, i) => ({ id: t.id, label: t.label, value: t.value, color: paletteFor(i) }));
    const seg = mountChart(
      () => charts.segmentedBar({ parts: typeParts, tall: true, valueFormat: fmt.num, ariaLabel: 'توزيع البلاغات حسب النوع' }),
      () => simpleTable('البلاغات حسب النوع', ['النوع', 'العدد'], d.byType.map((t) => [t.label, fmt.num(t.value)])),
    );
    const causes = d.pareto.slice(0, 6);
    const pareto = mountChart(
      () => charts.barChart({ items: causes.map((c) => ({ id: c.label, label: c.label, value: c.value })), horizontal: true, height: Math.max(140, causes.length * 34), valueFormat: fmt.num, color: 'var(--s1)', showValues: true, maxBars: 6, ariaLabel: 'الأسباب الجذرية الأكثر تكراراً' }),
      () => simpleTable('الأسباب الجذرية', ['السبب الجذري', 'العدد', 'النسبة', 'التراكمي'], causes.map((c) => [c.label, fmt.num(c.value), fmt.pct(c.pct), fmt.pct(c.cumulativePct)])),
    );
    const sec = sectionEl('RPT-03', 'الحوادث', `${copy.count(d.kpis.incidentsInPeriod, NOUNS.report)} خلال الفترة، ${fmt.num(d.kpis.openIncidents)} ما تزال مفتوحة.`, { breakBefore: true, narrative: narrativeBlock(d, 'incidents') });
    sec.appendChild(h('div', { class: 'grid-12' },
      h('div', { class: 'col-span-7' }, chartCard({ code: 'RPT-03A', title: 'اتجاه الحوادث', subtitle: 'الحوادث مقابل الحوادث الوشيكة لكل أسبوع', chart: line })),
      h('div', { class: 'col-span-5' }, chartCard({ code: 'RPT-03B', title: 'حسب النوع', subtitle: 'توزيع البلاغات ضمن فترة التقرير', chart: seg })),
      h('div', { class: 'col-span-12' }, causes.length
        ? chartCard({ code: 'RPT-03C', title: 'الأسباب الجذرية', subtitle: 'الأكثر تكراراً أولاً — النسبة التراكمية في عرض الجدول', chart: pareto })
        : card({ code: 'RPT-03C', title: 'الأسباب الجذرية', body: emptyState({ title: 'لا توجد بلاغات محللة ضمن الفترة' }) }))));
    return sec;
  }

  function paletteFor(i) {
    try { if (typeof charts.paletteFor === 'function') return charts.paletteFor(i); } catch { /* fall through */ }
    return `var(--s${(i % 8) + 1})`;
  }

  /* ── risks ── */

  function risksSection(d) {
    const rows = ['5', '4', '3', '2', '1'];
    const cols = ['1', '2', '3', '4', '5'];
    const cells = rows.map((_, ri) => d.matrix[4 - ri] || Array(5).fill(0));
    const toneAt = (ri, ci) => sel.tierTone(sel.riskTier((5 - ri) * (ci + 1)));
    const heat = mountChart(
      () => charts.heatmap({
        rows: rows.map((r) => `الشدة ${fmt.num(Number(r))}`),
        cols: cols.map((c) => fmt.num(Number(c))),
        cells,
        colorFor: (value, ri, ci) => `color-mix(in srgb, var(--${toneAt(ri, ci)}) ${value > 0 ? 72 : 16}%, var(--bg-1))`,
        labelFor: (value) => (value > 0 ? fmt.num(value) : ''),
        ariaLabel: 'مصفوفة المخاطر 5×5 — عدد المخاطر المفتوحة لكل خلية',
        rowTitle: 'الشدة',
        colTitle: 'الاحتمالية',
      }),
      () => simpleTable('مصفوفة المخاطر — الشدة × الاحتمالية', ['الشدة \\ الاحتمالية', ...cols.map((c) => fmt.num(Number(c)))], rows.map((r, ri) => [fmt.num(Number(r)), ...cells[ri].map((v) => fmt.num(v))])),
    );
    const cats = d.categories.slice(0, 8);
    const bars = mountChart(
      () => charts.barChart({ items: cats.map((c) => ({ id: c.id, label: c.label, value: c.value })), horizontal: true, height: Math.max(200, cats.length * 34), valueFormat: fmt.num, color: 'var(--s1)', showValues: true, maxBars: 8, ariaLabel: 'المخاطر المفتوحة حسب الفئة' }),
      () => simpleTable('المخاطر المفتوحة حسب الفئة', ['الفئة', 'العدد'], cats.map((c) => [c.label, fmt.num(c.value)])),
    );
    const k = d.kpis;
    const sec = sectionEl('RPT-04', 'المخاطر', `${copy.count(k.openRisks, NOUNS.risk)} مفتوحة — ${fmt.num(k.criticalRisks)} حرجة، ${fmt.num(k.highRisks)} عالية، ${fmt.num(k.overdueRisks)} متأخرة.`, { narrative: narrativeBlock(d, 'risks') });
    sec.appendChild(h('div', { class: 'grid-12' },
      h('div', { class: 'col-span-6' }, chartCard({ code: 'RPT-04A', title: 'مصفوفة المخاطر', subtitle: 'المخاطر المفتوحة حسب الشدة والاحتمالية', chart: heat })),
      h('div', { class: 'col-span-6' }, cats.length
        ? chartCard({ code: 'RPT-04B', title: 'أعلى فئات المخاطر', subtitle: 'عدد المخاطر المفتوحة لكل فئة', chart: bars })
        : card({ code: 'RPT-04B', title: 'أعلى فئات المخاطر', body: emptyState({ title: 'لا توجد مخاطر مفتوحة ضمن النطاق' }) }))));
    return sec;
  }

  /* ── permits ── */

  function permitsSection(d) {
    const parts = d.permits.map((p, i) => ({ id: p.id, label: p.label, value: p.value, color: paletteFor(i) }));
    const seg = mountChart(
      () => charts.segmentedBar({ parts, tall: true, valueFormat: fmt.num, ariaLabel: 'تصاريح العمل حسب الحالة' }),
      () => simpleTable('تصاريح العمل حسب الحالة', ['الحالة', 'العدد'], d.permits.map((p) => [p.label, fmt.num(p.value)])),
    );
    const value = (label) => (d.permits.find((p) => p.label === label) || {}).value || 0;
    const facts = h('div', { class: 'hero-facts' },
      factEl('نشطة الآن', fmt.num(d.kpis.activePermits), { tone: 'good' }),
      factEl('بانتظار الاعتماد', fmt.num(value('بانتظار الاعتماد')), { tone: 'accent' }),
      factEl('تنتهي قريباً', fmt.num(d.permitsSoon.length), { tone: d.permitsSoon.length ? 'warning' : null }));
    const soon = d.permitsSoon.slice(0, 4);
    const list = soon.length
      ? h('div', { class: 'stack gap-2' },
        h('p', { class: 'text-xs muted' }, 'التصاريح النشطة التي تنتهي خلال الساعة القادمة'),
        h('ul', { class: 'stack gap-2 text-sm', style: { listStyle: 'none', padding: 0, margin: 0 } }, soon.map((p) => h('li', { class: 'row between gap-2 wrap' },
          h('span', { class: 'row gap-2' }, h('span', { class: 'mono' }, p.code), h('span', {}, p.type)),
          h('span', { class: 'muted mono' }, fmt.time(p.expiresAt))))))
      : h('p', { class: 'muted text-sm' }, 'لا توجد تصاريح نشطة تنتهي خلال الساعة القادمة.');
    const total = d.permits.reduce((s, p) => s + p.value, 0);
    const sec = sectionEl('RPT-05', 'تصاريح العمل', `${copy.count(total, NOUNS.permit)} ضمن النطاق — ${fmt.num(value('معلق'))} معلقة.`, { narrative: narrativeBlock(d, 'permits') });
    sec.appendChild(h('div', { class: 'grid-12' },
      h('div', { class: 'col-span-7' }, chartCard({ code: 'RPT-05A', title: 'التصاريح حسب الحالة', subtitle: 'مسودة · بانتظار الاعتماد · نشط · معلق · مغلق', chart: seg })),
      h('div', { class: 'col-span-5' }, card({ code: 'RPT-05B', title: 'الوضع الحالي', body: h('div', { class: 'stack gap-3' }, facts, h('hr', { class: 'divider' }), list) }))));
    return sec;
  }

  /* ── training ── */

  function trainingSection(d) {
    const items = d.training.slice().sort((a, b) => b.pct - a.pct);
    const bars = mountChart(
      () => charts.barChart({ items: items.map((c) => ({ id: c.id, label: c.label, value: c.pct })), horizontal: true, height: Math.max(220, items.length * 32), valueFormat: (v) => fmt.pct(v), color: 'var(--s1)', showValues: true, maxBars: 12, ariaLabel: 'نسبة إتمام كل دورة تدريبية' }),
      () => simpleTable('إتمام الدورات التدريبية', ['الدورة', 'النسبة', 'الحاصلون', 'العمال'], items.map((c) => [c.label, fmt.pct(c.pct), fmt.num(c.holders), fmt.num(c.workers)])),
    );
    const below = items.filter((c) => c.pct < TRAINING_TARGET);
    const facts = h('div', { class: 'hero-facts' },
      factEl('الامتثال التدريبي', fmt.pct(d.kpis.trainingCompliance), { tone: toneFor(d.kpis.trainingCompliance) }),
      factEl('تنتهي خلال 60 يوماً', fmt.num(d.expiring.length), { tone: d.expiring.length ? 'warning' : null }),
      factEl(`دورات دون ${fmt.pct(TRAINING_TARGET)}`, fmt.num(below.length), { tone: below.length ? 'serious' : 'good' }));
    const soon = d.expiring.slice(0, 5);
    const list = soon.length
      ? h('ul', { class: 'stack gap-2 text-sm', style: { listStyle: 'none', padding: 0, margin: 0 } }, soon.map((x) => h('li', { class: 'row between gap-2 wrap' },
        h('span', { class: 'stack gap-1' }, h('strong', {}, x.worker.name), h('span', { class: 'muted text-xs' }, x.course.name)),
        badge(fmt.date(x.expiresAt, { style: 'short' }), x.tone || 'warning'))))
      : h('p', { class: 'muted text-sm' }, 'لا توجد شهادات تنتهي خلال الستين يوماً القادمة.');
    const sec = sectionEl('RPT-06', 'التدريب', `الامتثال التدريبي ${fmt.pct(d.kpis.trainingCompliance)} — الهدف ${fmt.pct(TRAINING_TARGET)} لكل دورة إلزامية.`, { breakBefore: true, narrative: narrativeBlock(d, 'training') });
    sec.appendChild(h('div', { class: 'grid-12' },
      h('div', { class: 'col-span-7' }, items.length
        ? chartCard({ code: 'RPT-06A', title: 'إتمام الدورات التدريبية', subtitle: 'نسبة العمال الحاصلين على شهادة سارية لكل دورة', chart: bars })
        : card({ code: 'RPT-06A', title: 'إتمام الدورات التدريبية', body: emptyState({ title: 'لا تتوفر بيانات تدريب' }) })),
      h('div', { class: 'col-span-5' }, card({ code: 'RPT-06B', title: 'الشهادات', body: h('div', { class: 'stack gap-3' }, facts, h('hr', { class: 'divider' }), h('p', { class: 'text-xs muted' }, 'أقرب الشهادات انتهاءً'), list) }))));
    return sec;
  }

  /* ── compliance ── */

  function complianceSection(d) {
    const axes = d.iso.map((c) => ({ id: c.id, label: `${c.id} ${c.title}` }));
    const spider = mountChart(
      () => charts.spider({ axes, series: [{ id: 'score', label: 'درجة الامتثال', color: 'var(--s1)', values: d.iso.map((c) => c.score) }], max: 100, size: 280, ariaLabel: 'درجات بنود ISO 45001 من 4 إلى 10' }),
      () => simpleTable('درجات بنود ISO 45001', ['البند', 'الدرجة', 'الفجوات'], d.iso.map((c) => [`${c.id} — ${c.title}`, fmt.pct(c.score), fmt.num(c.gaps)])),
    );
    const ring = mountChart(
      () => charts.ring({ value: d.isoOverall, max: 100, size: 112, color: 'var(--brand)', label: 'ISO 45001' }),
      () => simpleTable('الامتثال العام', ['المؤشر', 'القيمة'], [['متوسط الامتثال', fmt.pct(d.isoOverall)]]),
    );
    const above = d.iso.filter((c) => c.score >= ISO_TARGET).length;
    const gaps = d.iso.reduce((s, c) => s + (Number(c.gaps) || 0), 0);
    const legalCount = (status) => d.legal.filter((l) => l && l.status === status).length;
    const legalRow = h('div', { class: 'row gap-2 wrap' },
      badge(`ممتثل ${fmt.num(legalCount('ممتثل'))}`, 'good'),
      badge(`جزئي ${fmt.num(legalCount('جزئي'))}`, 'warning'),
      badge(`فجوة ${fmt.num(legalCount('فجوة'))}`, 'critical'));
    const overall = h('div', { class: 'stack gap-3' },
      h('div', { class: 'ring-row' }, ring.el, h('div', { class: 'ring-text' },
        h('span', { class: 'text-xs muted' }, 'متوسط الامتثال'),
        h('strong', { class: 'text-lg' }, fmt.pct(d.isoOverall)),
        h('span', { class: 'text-xs muted' }, `المستهدف ${fmt.pct(ISO_TARGET)}`))),
      h('div', { class: 'row gap-2 wrap' }, badge(d.isoOverall >= ISO_TARGET ? 'ضمن المستهدف' : 'دون المستهدف', d.isoOverall >= ISO_TARGET ? 'good' : 'warning')),
      kv([
        [`بنود ≥ ${fmt.pct(ISO_TARGET)}`, `${fmt.num(above)} من ${fmt.num(d.iso.length)}`],
        ['الفجوات الموثقة', fmt.num(gaps)],
        ['السجل القانوني', d.legal.length ? legalRow : '—'],
      ]));
    const sec = sectionEl('RPT-07', 'الامتثال', `ISO 45001:2018 — متوسط ${fmt.pct(d.isoOverall)} مقابل مستهدف ${fmt.pct(ISO_TARGET)}.`, { narrative: narrativeBlock(d, 'compliance') });
    sec.appendChild(h('div', { class: 'grid-12' },
      h('div', { class: 'col-span-5' }, card({ code: 'RPT-07A', title: 'الامتثال العام', body: overall })),
      h('div', { class: 'col-span-7' }, d.iso.length
        ? chartCard({ code: 'RPT-07B', title: 'درجات البنود 4–10', subtitle: 'متوسط درجات البنود الفرعية لكل بند رئيسي', chart: spider })
        : card({ code: 'RPT-07B', title: 'درجات البنود 4–10', body: emptyState({ title: 'لا تتوفر بيانات امتثال' }) }))));
    return sec;
  }

  /* ── recommendations ── */

  function buildRecommendations(d) {
    const { count } = copy;
    const out = [];
    const byKind = (kind) => d.urgent.filter((u) => u.kind === kind);
    const codes = (list, n = 4) => list.slice(0, n).map((u) => u.code).filter(Boolean).join('، ') + (list.length > n ? ` و${fmt.num(list.length - n)} أخرى` : '');

    const overdueRisks = byKind('risk');
    if (overdueRisks.length) {
      out.push({ tone: overdueRisks.some((u) => u.tone === 'critical') ? 'critical' : 'serious', title: `معالجة ${count(overdueRisks.length, NOUNS.risk)} تجاوزت موعد المعالجة المقرر`, detail: `إعادة جدولة الضوابط وتحديث المالكين: ${codes(overdueRisks)}.`, href: '#/risks', section: 'سجل المخاطر' });
    }
    const openIncidents = byKind('incident');
    if (openIncidents.length) {
      out.push({ tone: 'critical', title: `إغلاق التحقيق في ${count(openIncidents.length, NOUNS.incident)} عالي الخطورة`, detail: `استكمال تحليل الأسباب الجذرية والإجراءات التصحيحية: ${codes(openIncidents)}.`, href: '#/incidents', section: 'الحوادث' });
    }
    const permits = byKind('permit');
    if (permits.length) {
      out.push({ tone: permits.some((u) => u.tone === 'critical') ? 'critical' : 'warning', title: `مراجعة ${count(permits.length, NOUNS.permit)} منتهية أو توشك على الانتهاء`, detail: `إغلاق التصاريح المنتهية أو تمديدها رسمياً قبل استمرار العمل: ${codes(permits)}.`, href: '#/permits', section: 'تصاريح العمل' });
    }
    const inspections = byKind('inspection');
    if (inspections.length) {
      out.push({ tone: 'serious', title: `تنفيذ ${count(inspections.length, NOUNS.inspection)} متأخرة عن موعدها`, detail: `إعادة الجدولة خلال الأسبوع وتوثيق الملاحظات: ${codes(inspections)}.`, href: '#/inspections', section: 'التفتيش والتدقيق' });
    }
    const certs = byKind('cert');
    if (certs.length) {
      out.push({ tone: 'warning', title: `تجديد ${count(certs.length, NOUNS.cert)} تنتهي خلال 14 يوماً`, detail: 'حجز مقاعد إعادة التأهيل قبل انتهاء الصلاحية حتى لا يُمنع العمال من مباشرة الأعمال الخطرة.', href: '#/training', section: 'التدريب والكفاءات' });
    }

    const weakSubs = d.iso
      .flatMap((c) => (Array.isArray(c.subclauses) ? c.subclauses : []).map((s) => ({ ...s, clause: c })))
      .filter((s) => Array.isArray(s.gaps) && s.gaps.length)
      .sort((a, b) => (Number(a.score) || 0) - (Number(b.score) || 0))
      .slice(0, 2);
    for (const s of weakSubs) {
      out.push({ tone: (Number(s.score) || 0) < 70 ? 'serious' : 'warning', title: `سدّ فجوات البند ${s.id} «${s.title}» (${fmt.pct(Number(s.score) || 0)})`, detail: s.gaps.map((g) => (typeof g === 'string' ? g : (g && g.text) || '')).filter(Boolean).join('؛ ') || 'توثيق خطة معالجة بمسؤول وموعد محددين.', href: '#/compliance', section: 'الامتثال' });
    }

    const below = d.training.filter((c) => c.pct < TRAINING_TARGET).sort((a, b) => (b.mandatory - a.mandatory) || (a.pct - b.pct)).slice(0, 2);
    for (const c of below) {
      out.push({ tone: c.pct < 70 ? 'serious' : 'warning', title: `رفع نسبة إتمام دورة «${c.label}» إلى ${fmt.pct(TRAINING_TARGET)} على الأقل (حالياً ${fmt.pct(c.pct)})`, detail: `${fmt.num(c.workers - c.holders)} من العمال دون شهادة سارية${c.mandatory ? ' — الدورة إلزامية' : ''}.`, href: '#/training', section: 'التدريب والكفاءات' });
    }

    const top = d.pareto[0];
    if (top && top.value >= 2) {
      out.push({ tone: top.pct >= 30 ? 'serious' : 'warning', title: `معالجة السبب الجذري الأكثر تكراراً: «${top.label}»`, detail: `يمثل ${fmt.pct(top.pct)} من البلاغات المحللة في الفترة — يُوصى بمراجعة إجراءات العمل والإشراف والتدريب المرتبطة به.`, href: '#/incidents', section: 'الحوادث' });
    }

    // Engine recommendations (sources.buildReport) for topics the derived list does not cover.
    const engine = builtSection(d, 'recommendations');
    const engineItems = engine && Array.isArray(engine.items) ? engine.items : [];
    const ENGINE_TOPICS = ['تكامل', 'الإجراءات التصحيحية', 'السجل القانوني', 'الامتثال التدريبي', 'متطلبًا نظاميًا'];
    for (const item of engineItems) {
      const text = item && typeof item.text === 'string' ? item.text.trim() : '';
      if (!text || !ENGINE_TOPICS.some((t) => text.includes(t))) continue;
      if (out.some((r) => r.title === text)) continue;
      out.push({ tone: TONE_RANK[item.tone] !== undefined ? item.tone : 'warning', title: text, detail: '', href: null, section: null });
    }

    if (!out.length) {
      out.push({ tone: 'good', title: 'لا توجد توصيات عاجلة لهذه الفترة', detail: 'يُوصى بالاستمرار في برنامج التفتيش الدوري وتعزيز الإبلاغ عن الحوادث الوشيكة والمحافظة على نسب الامتثال التدريبي.', href: '#/overview', section: 'نظرة عامة' });
    }
    out.sort((a, b) => (TONE_RANK[a.tone] ?? 9) - (TONE_RANK[b.tone] ?? 9));
    return out.slice(0, 9);
  }

  function recommendationsSection(d) {
    const recs = buildRecommendations(d);
    const list = h('ol', { class: 'urgent-list report-recs', style: { padding: 0, margin: 0 } }, recs.map((r, i) => {
      const ic = components.glyph(r.tone, 15);
      const link = r.href
        ? h('a', { href: r.href, class: 'text-xs print-hide', onClick: (e) => { e.preventDefault(); const id = String(r.href).replace(/^#\//, '').split('?')[0]; if (router && typeof router.navigate === 'function') router.navigate(id); else location.hash = r.href; } }, `فتح ${r.section}`)
        : h('span', { class: 'text-xs muted print-hide' }, 'محرك التقارير');
      return h('li', { class: ['urgent-item', `tone-${r.tone}`] },
        h('span', { class: 'urgent-icon', 'aria-hidden': 'true' }, ic),
        h('div', { class: 'urgent-text' },
          h('div', { class: 'row gap-2 wrap' }, badge(PRIORITY_LABEL[r.tone] || 'معلومة', r.tone), h('strong', {}, `${fmt.num(i + 1)}. ${r.title}`)),
          r.detail ? h('span', { class: 'urgent-sub' }, r.detail) : null),
        h('span', { class: 'text-xs nowrap', style: { alignSelf: 'center' } }, link));
    }));
    const sec = sectionEl('RPT-08', 'التوصيات', 'مشتقة من الإجراءات العاجلة وفجوات الامتثال والتدريب، مرتبة حسب الأولوية.');
    sec.appendChild(card({ body: list }));
    return sec;
  }

  /* ── cover / footer ── */

  function screenHeader(d) {
    const meta = h('div', { class: 'hero-facts' },
      factEl('الفترة', d.period.label, { small: '' }),
      factEl('النطاق', d.site ? d.site.name : 'جميع المواقع'),
      factEl('تاريخ الإصدار', fmt.date(d.now)));
    const body = h('div', { class: 'stack gap-4' },
      h('div', { class: 'row between wrap gap-3' },
        h('div', { class: 'row gap-3 wrap' }, lockup(), h('div', { class: 'stack gap-1' },
          h('h2', { class: 'text-lg', style: { fontSize: 'var(--fs-xl)' } }, d.period.title),
          h('span', { class: 'muted text-sm' }, `${d.period.rangeLabel} · إعداد: ${PREPARED_BY}`))),
        h('div', { class: 'row gap-2 wrap' }, badge(`${fmt.num(d.period.range)} يوماً`, 'accent'), d.site ? badge(d.site.code || d.site.id, 'brand') : badge('كل المواقع', 'brand'))),
      meta);
    return h('div', { class: 'print-hide' }, card({ hero: true, framed: true, body }));
  }

  function printCover(d) {
    const cover = h('header', { class: 'report-only is-row report-cover' },
      h('div', { class: 'row gap-3' }, lockup(), h('div', { class: 'stack gap-1' },
        h('div', { class: 'report-cover-title' }, d.period.title),
        h('div', {}, `${d.period.label} · ${d.period.rangeLabel}`),
        h('div', {}, d.site ? `النطاق: ${d.site.name} (${d.site.code || d.site.id})` : 'النطاق: جميع المواقع'))),
      h('div', { class: 'report-cover-meta' },
        h('div', {}, `إعداد: ${PREPARED_BY}`),
        h('div', {}, `تاريخ الإصدار: ${fmt.date(d.now)}`),
        h('div', {}, `${fmt.hijri(d.now)}`),
        h('div', {}, `المرجع: HSE-RPT-${isoDate(d.now).replace(/-/g, '')}`)));
    return cover;
  }

  function printFooter(d) {
    const foot = h('footer', { class: 'report-only is-row report-footer' },
      h('span', {}, `${PREPARED_BY} — مركز قيادة السلامة والصحة المهنية`),
      h('span', {}, `أُنشئ آلياً بتاريخ ${fmt.dateTime(d.now)} · البيانات توضيحية ما لم يُربط مصدر بيانات حقيقي`));
    const sign = h('div', { class: 'report-only is-grid report-sign' },
      h('div', {}, 'مدير السلامة والصحة المهنية'),
      h('div', {}, 'مدير المشروع'),
      h('div', {}, 'ممثل الإدارة العليا'));
    return [foot, sign];
  }

  /* ── assemble ── */

  function build() {
    const period = resolvePeriod(currentPeriod, store.now ? store.now() : new Date(), fmt);
    const d = collect(ctx, period);
    // The engine's KPI bundle backs ours when a selector failed locally; titles stay period-aware here.
    if (d.built && d.built.kpis && typeof d.built.kpis === 'object' && !Number.isFinite(d.kpis.safetyIndex) && Number.isFinite(d.built.kpis.safetyIndex)) {
      d.kpis = { ...d.built.kpis, deltas: d.built.kpis.deltas || {}, previous: d.built.kpis.previous || {} };
    }
    latest = d;
    const summary = summarySection(d);
    speechText = `${d.period.title}. ${d.period.label}. ${summary.text}`;
    periodSeg.set(currentPeriod);
    article.replaceChildren(
      printCover(d),
      screenHeader(d),
      summary.el,
      kpiSection(d),
      incidentsSection(d),
      risksSection(d),
      permitsSection(d),
      trainingSection(d),
      complianceSection(d),
      recommendationsSection(d),
      ...printFooter(d),
    );
  }

  function rebuild() {
    if (rebuildTimer) { clearTimeout(rebuildTimer); rebuildTimer = null; }
    try { build(); } catch (err) {
      console.error('[biltix-hse] reports: build failed', err);
      article.replaceChildren(emptyState({ title: 'تعذر توليد التقرير', text: 'حدث خطأ أثناء تجميع البيانات. حاول تغيير الفترة أو إعادة تحميل الصفحة.' }));
    }
  }

  function scheduleRebuild() {
    if (rebuildTimer) clearTimeout(rebuildTimer);
    rebuildTimer = setTimeout(rebuild, 350);
  }

  rebuild();

  /* ── subscriptions ── */
  subs.push(bus.on('store:change', (payload) => {
    const path = String((payload && payload.path) || '*');
    if (path === 'feed' || path === 'settings' || path.startsWith('integrations')) return;
    scheduleRebuild();
  }));
  subs.push(bus.on('settings:change', () => scheduleRebuild()));
  subs.push(bus.on('filters:change', (payload) => {
    if (payload && payload.key && payload.key !== 'siteId') return;
    scheduleRebuild();
  }));
  subs.push(bus.on('route:change', (payload) => {
    if (payload && payload.id !== 'reports') speech.stop();
  }));
  const onPageHide = () => speech.stop();
  window.addEventListener('pagehide', onPageHide);
  const onBeforePrint = () => speech.stop();
  window.addEventListener('beforeprint', onBeforePrint);

  return function cleanup() {
    if (rebuildTimer) { clearTimeout(rebuildTimer); rebuildTimer = null; }
    subs.splice(0).forEach((off) => { try { off(); } catch { /* ignore */ } });
    window.removeEventListener('pagehide', onPageHide);
    window.removeEventListener('beforeprint', onBeforePrint);
    if (voicesHandler && window.speechSynthesis && typeof window.speechSynthesis.removeEventListener === 'function') {
      window.speechSynthesis.removeEventListener('voiceschanged', voicesHandler);
    }
    speech.stop();
    try { if (window.speechSynthesis) window.speechSynthesis.cancel(); } catch { /* ignore */ }
  };
}

export const reportsView = {
  id: 'reports',
  code: 'SEC-10',
  title: 'التقارير',
  icon: 'file-text',
  render,
};

export default reportsView;
