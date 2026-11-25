/**
 * BILTIX Risk AI — HSE pillar — SEC-10 Reports (js/views/reports.js). Owner: B-HSE2 (v3 Precision).
 *
 * Periodic health & safety report (this month / last 30 days / this quarter), for the project selected in the
 * shell filters, printable to A4 PDF in Arabic and English:
 *   • ONE set of definitions: the KPI bundle is sources.buildReport().kpis (= sel.kpis for the same window),
 *     the overdue count is buildReport().overdueCount (= sel.overdueRisks(...).length, the list feeding the
 *     overview and every sentence of the report), inspections due = kpis.inspectionsDue with the overdue part
 *     from sel.urgentActions. Section narratives and recommendations are the engine's own text
 *     (narrative / narrativeEn, items[].text / textEn).
 *   • The executive summary is composed from the 'reports' dictionary; every direction word comes from
 *     sel.describeDelta(delta, goodWhen) and is tagged data-delta / data-direction / data-good so a probe can
 *     assert that an increase is never described as a decrease.
 *   • Title / product: "BILTIX Risk AI" with the HSE pillar as subtitle; demo data is labelled as such.
 *   • Times in Asia/Riyadh. Live data changes rebuild the report without replaying the entrance motion.
 * Actions: print / PDF, CSV (risks, incidents; headers and values in the active language), full JSON, share,
 * read-aloud (speechSynthesis in the active language, never autoplay).
 */

import { i18n, t, tn } from '../core/i18n.js';
import { status as statusApi } from '../core/status.js';
import dict from '../i18n/reports.js';

i18n.register('reports', dict);

const DAY_MS = 86_400_000;
const TZ = 'Asia/Riyadh';
const TZ_OFFSET_MS = 3 * 3_600_000;
const TRAINING_TARGET = 85;
const ISO_TARGET = 85;
const EXPIRING_DAYS = 60;
const DUE_WINDOW_DAYS = 7;
const PERIOD_KEYS = ['month', '30d', 'quarter'];
const TONE_RANK = { critical: 0, serious: 1, warning: 2, good: 3, neutral: 4 };
const SVG_NS = 'http://www.w3.org/2000/svg';

/** Digits inside record text follow the numerals setting; codes (MH-14, R-1042, PM2.5, ISO 45001) stay Latin. */
const AR_DIGITS = '٠١٢٣٤٥٦٧٨٩';
function codeSafeDigits(fmt, text) {
  const s = String(text ?? '');
  if (!s || !fmt || typeof fmt.getNumerals !== 'function' || fmt.getNumerals() !== 'arab') return s;
  return s.replace(/\d+(?:[.,/:]\d+)*/g, (m, offset, whole) => {
    let prev = whole[offset - 1] || '';
    if (prev === '/' || prev === ':') prev = whole[offset - 2] || '';
    const next = whole[offset + m.length] || '';
    if (/[A-Za-z\-_#]/.test(prev) || /[A-Za-z]/.test(next) || /(ISO|SBC|UTC)\s?\+?$/i.test(whole.slice(Math.max(0, offset - 5), offset))) return m;
    return m.replace(/\d/g, (d) => AR_DIGITS[Number(d)]).replace(/\./g, '٫').replace(/,/g, '٬');
  });
}

/** Remembered for the session so switching views keeps the chosen period (a key, not a translated string). */
let currentPeriod = '30d';
let uidCounter = 0;
const uid = (prefix) => `rpt-${prefix}-${(++uidCounter).toString(36)}`;

/* ────────────────────────────── icons (static paths, no data) ────────────────────────────── */

const ICONS = {
  print: ['M6 9V4h12v5', 'M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2', 'M6 14h12v6H6z'],
  csv: ['M4 5h16v14H4z', 'M4 10h16M4 15h16M10 5v14'],
  json: ['M8 4H7a2 2 0 0 0-2 2v3.5A2.5 2.5 0 0 1 2.5 12 2.5 2.5 0 0 1 5 14.5V18a2 2 0 0 0 2 2h1', 'M16 4h1a2 2 0 0 1 2 2v3.5a2.5 2.5 0 0 0 2.5 2.5 2.5 2.5 0 0 0-2.5 2.5V18a2 2 0 0 1-2 2h-1'],
  share: ['M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7', 'M16 6l-4-4-4 4', 'M12 2v13'],
  play: ['M7 4l12 8-12 8z'],
  stop: ['M6 6h12v12H6z'],
};
function icon(name, size = 16) {
  const svg = document.createElementNS(SVG_NS, 'svg');
  for (const [k, v] of Object.entries({ viewBox: '0 0 24 24', width: size, height: size, fill: 'none', stroke: 'currentColor', 'stroke-width': 2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true', focusable: 'false' })) svg.setAttribute(k, String(v));
  svg.classList.add('icon');
  for (const d of ICONS[name] || ICONS.csv) { const p = document.createElementNS(SVG_NS, 'path'); p.setAttribute('d', d); svg.appendChild(p); }
  return svg;
}

/* ────────────────────────────── small helpers ────────────────────────────── */

function safe(fn, fallback) { try { const v = fn(); return v === undefined || v === null ? fallback : v; } catch { return fallback; } }
const clamp = (n, min, max) => Math.min(max, Math.max(min, n));
const isoDate = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const addDays = (d, n) => { const x = new Date(d.getTime()); x.setDate(x.getDate() + n); return x; };
function toneFor(score) { if (score >= 85) return 'good'; if (score >= 70) return 'warning'; if (score >= 50) return 'serious'; return 'critical'; }
function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.rel = 'noopener';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}
function csvDownload(rows, columns, filename) {
  const esc = (value) => {
    let s = value === null || value === undefined ? '' : String(value);
    if (/^[=+@\t\r-]/.test(s)) s = `'${s}`;
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [columns.map((c) => esc(c.label)).join(',')];
  for (const row of rows) lines.push(columns.map((c) => esc(row[c.key])).join(','));
  downloadBlob(new Blob([`﻿${lines.join('\r\n')}`], { type: 'text/csv;charset=utf-8' }), filename);
}
const jsonDownload = (obj, filename) => downloadBlob(new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json;charset=utf-8' }), filename);

/** Riyadh calendar day of an instant, as a local-midnight Date (selectors and buildReport work on local days). */
function riyadhDay(nowDate) {
  const k = new Date(nowDate.getTime() + TZ_OFFSET_MS).toISOString().slice(0, 10).split('-').map(Number);
  return new Date(k[0], k[1] - 1, k[2]);
}

/* ────────────────────────────── speech ────────────────────────────── */

function splitForSpeech(text, maxLen = 180) {
  const sentences = String(text).split(/(?<=[.!؟?؛;\n])\s+/).map((s) => s.trim()).filter(Boolean);
  const chunks = [];
  let buffer = '';
  for (const s of sentences) {
    if (buffer && buffer.length + s.length + 1 > maxLen) { chunks.push(buffer); buffer = s; } else buffer = buffer ? `${buffer} ${s}` : s;
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
  const voiceFor = (lang) => {
    const list = voices();
    const re = lang === 'en' ? /^en/i : /^ar/i;
    const pref = lang === 'en' ? /^en[-_](GB|US)/i : /^ar[-_]SA/i;
    return list.find((v) => pref.test(v.lang)) || list.find((v) => re.test(v.lang) && v.default) || list.find((v) => re.test(v.lang)) || null;
  };
  const setState = (next) => { if (speaking === next) return; speaking = next; onState(next); };
  function start(text, lang) {
    if (!supported || !text) return false;
    try { synth.cancel(); } catch { /* ignore */ }
    const chunks = splitForSpeech(text);
    if (!chunks.length) return false;
    const voice = voiceFor(lang);
    pending = chunks.length;
    setState(true);
    try {
      chunks.forEach((chunk) => {
        const u = new SpeechSynthesisUtterance(chunk);
        u.lang = voice ? voice.lang : (lang === 'en' ? 'en-GB' : 'ar-SA');
        if (voice) u.voice = voice;
        u.rate = 0.95;
        u.onend = () => { pending -= 1; if (pending <= 0) setState(false); };
        u.onerror = () => { pending = 0; setState(false); };
        synth.speak(u);
      });
    } catch { pending = 0; setState(false); return false; }
    return true;
  }
  function stop() { pending = 0; try { if (synth) synth.cancel(); } catch { /* ignore */ } setState(false); }
  return { supported, start, stop, hasVoice: (lang) => Boolean(voiceFor(lang)), isSpeaking: () => speaking };
}


/**
 * Uneven pairs (4+8, 5+7) collapse to "half + full" between 960 and 1279 px (css/base.css), which leaves a
 * half-empty row. In that range the pair is rebalanced from data-pair: 'half' → span 6, 'full' → span 12.
 */
const MID_MQ = '(min-width: 960px) and (max-width: 1279.98px)';
function applyPairs(root) {
  let mid = false;
  try { mid = window.matchMedia(MID_MQ).matches; } catch { mid = false; }
  root.querySelectorAll('[data-pair]').forEach((el) => { el.style.gridColumn = mid ? (el.dataset.pair === 'full' ? 'span 12' : 'span 6') : ''; });
}

/* ────────────────────────────── the view ────────────────────────────── */

function render(container, ctx) {
  const { store, bus, sel, fmt, components, router } = ctx;
  const charts = ctx.charts || {};
  const sources = ctx.sources || {};
  const art = ctx.art || {};
  const { h, card, badge, button, segmented, toast, emptyState, kv, statusBadge, motion } = components;
  const subs = [];
  let rebuildTimer = null;
  let voicesHandler = null;
  let latest = null;
  let firstBuild = true;
  const lang = () => i18n.lang();
  /** An HSE risk's source in the active language: an imported risk's English twin (`sourceEn`) in English, else the enum label. */
  const riskSourceText = (r) => {
    if (!r || !r.source) return '';
    if (lang() !== 'ar' && typeof r.sourceEn === 'string' && r.sourceEn.trim()) return r.sourceEn.trim();
    return i18n.label('riskSource', r.source);
  };

  if (ctx.params && PERIOD_KEYS.includes(ctx.params.period)) currentPeriod = ctx.params.period;

  /* ── formatting helpers (Riyadh time, numerals) ── */
  const zCache = new Map();
  const zoned = (value, opts) => {
    const d = fmt.toDate(value);
    if (!d) return null;
    const key = `${fmt.locale()}|${JSON.stringify(opts)}`;
    if (!zCache.has(key)) { let f = null; try { f = new Intl.DateTimeFormat(fmt.locale(), { ...opts, timeZone: TZ }); } catch { f = null; } zCache.set(key, f); }
    const f = zCache.get(key);
    try { return f ? f.format(d) : null; } catch { return null; }
  };
  const zTime = (v) => zoned(v, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }) || fmt.time(v);
  const zDate = (v) => zoned(v, { day: 'numeric', month: 'long', year: 'numeric' }) || fmt.date(v);
  const zDateTime = (v) => `${zDate(v)}${lang() === 'ar' ? '،' : ','} ${zTime(v)}`;
  const pct = (v, digits = 0) => fmt.pct(Number(v) || 0, digits);
  const num = (v, digits = 0) => fmt.num(Number(v) || 0, { maximumFractionDigits: digits });
  const stripBidi = (s) => String(s).replace(/[‎‏؜⁦-⁩]/g, '');
  /** Digits inside engine sentences follow the numerals setting; codes (R-1042, ISO 45001, PM2.5) stay Latin. */
  const localizeDigits = (text) => codeSafeDigits(fmt, text);
  const siteLabel = (s) => (s ? localizeDigits(i18n.L(s, 'name', 'sites')) : '');
  const scopeLabel = (d) => (d.site ? t('reports.scopeSite', { name: siteLabel(d.site), code: d.site.code || d.site.id }) : t('reports.allSites'));

  /* ── period model ── */
  function monthYear(date) { try { return new Intl.DateTimeFormat(fmt.locale(), { month: 'long', year: 'numeric' }).format(date); } catch { return fmt.date(date); } }
  function yearOf(date) { try { return new Intl.DateTimeFormat(fmt.locale(), { year: 'numeric' }).format(date); } catch { return String(date.getFullYear()); } }
  function resolvePeriod(key, now) {
    const today = riyadhDay(now);
    let from;
    let kind = PERIOD_KEYS.includes(key) ? key : '30d';
    if (kind === 'month') from = new Date(today.getFullYear(), today.getMonth(), 1);
    else if (kind === 'quarter') from = new Date(today.getFullYear(), Math.floor(today.getMonth() / 3) * 3, 1);
    else { from = addDays(today, -29); kind = '30d'; }
    const range = Math.max(1, Math.round((today.getTime() - from.getTime()) / DAY_MS) + 1);
    const qn = Math.floor(from.getMonth() / 3) + 1;
    const label = kind === 'month' ? monthYear(from)
      : kind === 'quarter' ? t('reports.period.quarterName', { q: t(`reports.period.quarters.${qn}`), qn: fmt.num(qn), year: yearOf(from) })
        : t('reports.period.30d', { n: fmt.num(30) });
    return { key: kind, from, to: today, now, range, label, rangeLabel: t('reports.period.range', { from: fmt.date(from), to: fmt.date(today) }), title: t(`reports.title.${kind}`) };
  }

  /* ── data ── */
  function collect(period) {
    const state = store.state || {};
    const now = period.now;
    const siteId = (store.filters && store.filters.siteId) || 'all';
    const filters = { siteId, range: period.range, search: '' };
    let built = null;
    try {
      if (typeof sources.buildReport === 'function') built = sources.buildReport(state, { period: period.key, from: isoDate(period.from), to: isoDate(period.to), range: period.range, siteId, now });
    } catch { built = null; }
    const kpis = (built && built.kpis && Number.isFinite(built.kpis.safetyIndex)) ? built.kpis : safe(() => sel.kpis(state, filters, now), { deltas: {}, previous: {} });
    const section = (id) => (built && Array.isArray(built.sections) ? built.sections.find((s) => s && s.id === id) : null) || null;
    const overdueList = safe(() => sel.overdueRisks(state, filters, now), []);
    const overdueCount = built && Number.isFinite(built.overdueCount) ? built.overdueCount : overdueList.length;
    const urgent = safe(() => sel.urgentActions(state, now, { siteId }), []);
    const byType = safe(() => sel.incidentsByType(state, filters, now), []);
    const nearMissInPeriod = (byType.find((x) => x.label === 'حادث وشيك') || {}).value || 0;
    const iso = safe(() => sel.isoScores(state), []);
    return {
      state, now, siteId, filters, period, built, kpis, section,
      site: siteId !== 'all' ? safe(() => sel.siteById(state, siteId), null) : null,
      sites: Array.isArray(state.sites) ? state.sites : [],
      overdueCount,
      overdueTop: (section('risks') && Array.isArray(section('risks').overdue) ? section('risks').overdue : overdueList.slice(0, 6)),
      overdueInspections: urgent.filter((u) => u.kind === 'inspection').length,
      nearMissInPeriod,
      incidentsOnly: Math.max(0, (Number(kpis.incidentsInPeriod) || 0) - nearMissInPeriod),
      trend: safe(() => sel.incidentTrend(state, clamp(Math.ceil(period.range / 7) + 1, 5, 14), filters, now), []),
      byType,
      pareto: safe(() => sel.rootCausePareto(state, filters, now), []),
      matrix: safe(() => sel.riskMatrix(state, filters, now), Array.from({ length: 5 }, () => Array(5).fill(0))),
      categories: safe(() => sel.risksByCategory(state, filters, now), []),
      permits: safe(() => sel.permitsByStatus(state, filters, now), []),
      permitsSoon: safe(() => sel.permitsExpiringSoon(state, 60, filters, now), []),
      training: safe(() => sel.trainingCompletionByCourse(state, filters, now), []),
      expiring: safe(() => sel.expiringCerts(state, EXPIRING_DAYS, filters, now), []),
      iso: iso.map((c) => { const loc = i18n.localize(c, 'isoClauses') || c; return { ...c, title: loc.title || c.title }; }),
      isoOverall: safe(() => sel.isoOverall(state), 0),
      legal: Array.isArray(state.legalRegister) ? state.legalRegister : [],
      risks: safe(() => sel.filteredRisks(state, filters, now), []),
      incidents: safe(() => sel.filteredIncidents(state, filters, now), []),
      mode: safe(() => statusApi.mode(state), 'demo'),
    };
  }

  /* ── header ── */
  const periodSeg = segmented({
    options: PERIOD_KEYS.map((k) => ({ value: k, label: k === '30d' ? t('reports.period.30d', { n: fmt.num(30) }) : t(`reports.period.${k}`) })),
    value: currentPeriod,
    ariaLabel: t('reports.period.label'),
    onChange: (value) => { currentPeriod = value; rebuild(); },
  });
  const head = h('header', { class: 'view-head print-hide' },
    h('div', { class: 'view-head-text' },
      h('span', { class: 'code-tag' }, 'SEC-10'),
      h('h1', { class: 't-page', id: 'reports-title', tabindex: '-1' }, t('core.nav.reports.title')),
      h('p', { class: 'view-lead' }, t('reports.lead'))),
    h('div', { class: 'view-actions' }, h('span', { class: 't-label' }, t('reports.period.label')), periodSeg.el));

  /* ── speech ── */
  let speechText = '';
  const speech = createSpeech((speaking) => paintVoiceButton(speaking));
  const voiceBtn = button(t('reports.actions.voice'), {
    variant: 'outline', icon: icon('play', 16),
    onClick: () => {
      if (!speech.supported) { toast(t('reports.actions.voiceUnsupported'), { tone: 'warning' }); return; }
      if (speech.isSpeaking()) { speech.stop(); return; }
      if (!speech.start(speechText, lang())) toast(t('reports.actions.voiceFailed'), { tone: 'warning' });
    },
    attrs: { 'aria-pressed': 'false', title: t('reports.actions.voiceTitle') },
  });
  const voiceHint = h('span', { class: 't-helper report-voice-hint', 'aria-live': 'polite' });
  function paintVoiceButton(speaking) {
    const label = voiceBtn.querySelector('.btn-label');
    const ic = voiceBtn.querySelector('.btn-ic');
    if (label) label.textContent = speaking ? t('reports.actions.voiceStop') : t('reports.actions.voice');
    if (ic) { const next = icon(speaking ? 'stop' : 'play', 16); next.classList.add('btn-ic'); ic.replaceWith(next); }
    voiceBtn.setAttribute('aria-pressed', speaking ? 'true' : 'false');
  }
  function paintVoiceHint() {
    if (!speech.supported) { voiceHint.textContent = t('reports.actions.voiceUnsupported'); return; }
    voiceHint.textContent = speech.hasVoice(lang()) ? t('reports.actions.voiceHas') : t('reports.actions.voiceNone');
  }
  paintVoiceHint();
  if (speech.supported && typeof window.speechSynthesis.addEventListener === 'function') {
    voicesHandler = () => paintVoiceHint();
    window.speechSynthesis.addEventListener('voiceschanged', voicesHandler);
  }

  /* ── exports ── */
  function exportRows(kind) {
    if (!latest) return;
    const siteName = (id) => siteLabel(latest.sites.find((x) => x.id === id));
    const stamp = isoDate(latest.period.to);
    const cols = (keys) => keys.map((key) => ({ key, label: t(`reports.csv.${key}`) }));
    if (kind === 'risks') {
      const rows = latest.risks.map((r) => {
        const score = sel.riskScore(r);
        const controls = i18n.L(r, 'controls', 'risks');
        return {
          code: r.code, site: siteName(r.siteId), category: i18n.label('hseCategory', r.categoryId), hazard: i18n.L(r, 'hazard', 'risks'), activity: i18n.L(r, 'activity', 'risks'),
          likelihood: r.likelihood, severity: r.severity, score, tier: i18n.label('tier', sel.riskTier(score)),
          residualLikelihood: r.residualLikelihood, residualSeverity: r.residualSeverity, residualScore: safe(() => sel.residualScore(r), ''),
          controls: (Array.isArray(controls) ? controls : []).map((c) => (c && c.type ? `${i18n.label('controlType', c.type)}: ${c.text}` : (typeof c === 'string' ? c : (c && c.text) || ''))).filter(Boolean).join(' | '),
          owner: r.owner ? i18n.term(r.owner) : '', dueDate: r.dueDate, status: i18n.label('riskStatus', r.status), source: riskSourceText(r),
          legalRef: r.legalRef ? i18n.L(r, 'legalRef', 'risks') : '', createdAt: r.createdAt, updatedAt: r.updatedAt,
        };
      });
      exportCSV(rows, cols(['code', 'site', 'category', 'hazard', 'activity', 'likelihood', 'severity', 'score', 'tier', 'residualLikelihood', 'residualSeverity', 'residualScore', 'controls', 'owner', 'dueDate', 'status', 'source', 'legalRef', 'createdAt', 'updatedAt']), `biltix-risk-ai-hse-risks-${stamp}.csv`, t('reports.toast.csvRisks'));
      return;
    }
    const rows = latest.incidents.map((i) => {
      const actions = Array.isArray(i.actions) ? i.actions : [];
      return {
        code: i.code, date: i.date, time: i.time, site: siteName(i.siteId), type: i18n.label('incidentType', i.type), severity: i.severity,
        title: i18n.L(i, 'title', 'incidents'), location: i18n.L(i, 'location', 'incidents'), category: i18n.label('hseCategory', i.categoryId),
        bodyPart: i.bodyPart ? i18n.label('bodyPart', i.bodyPart) : '', rootCause: i.rootCause ? i18n.label('rootCause', i.rootCause) : '',
        immediateCause: i.immediateCause ? i18n.L(i, 'immediateCause', 'incidents') : '', status: i18n.label('incidentStatus', i.status),
        investigationStep: Number.isFinite(Number(i.investigationStep)) ? Number(i.investigationStep) + 1 : '', daysLost: i.daysLost,
        actions: `${actions.filter((a) => a && a.done).length}/${actions.length}`, reporter: i.reporter ? i18n.term(i.reporter) : '',
      };
    });
    exportCSV(rows, cols(['code', 'date', 'time', 'site', 'type', 'severity', 'title', 'location', 'category', 'bodyPart', 'rootCause', 'immediateCause', 'status', 'investigationStep', 'daysLost', 'actions', 'reporter']), `biltix-risk-ai-hse-incidents-${stamp}.csv`, t('reports.toast.csvIncidents'));
  }
  function exportCSV(rows, columns, filename, message) {
    if (!rows.length) { toast(t('reports.toast.noRows'), { tone: 'warning' }); return; }
    try {
      if (typeof sources.exportCSV === 'function') sources.exportCSV(rows, columns, filename); else csvDownload(rows, columns, filename);
      toast(message, { tone: 'good' });
    } catch {
      try { csvDownload(rows, columns, filename); toast(message, { tone: 'good' }); } catch { toast(t('reports.toast.csvFailed'), { tone: 'serious' }); }
    }
  }
  function exportJSON() {
    const filename = `biltix-risk-ai-state-${isoDate(latest ? latest.period.to : new Date())}.json`;
    try {
      if (typeof sources.exportJSON === 'function') sources.exportJSON(store.state, filename); else jsonDownload(store.state, filename);
      toast(t('reports.toast.json'), { tone: 'good' });
    } catch {
      try { jsonDownload(store.state, filename); toast(t('reports.toast.json'), { tone: 'good' }); } catch { toast(t('reports.toast.jsonFailed'), { tone: 'serious' }); }
    }
  }
  async function share() {
    if (!latest) return;
    const title = `${t('reports.product')} — ${latest.period.title}`;
    const text = `${title} — ${latest.period.label}\n${speechText.split('\n')[0] || ''}`;
    const url = location.href;
    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      try { await navigator.share({ title, text, url }); toast(t('reports.toast.shared'), { tone: 'neutral' }); return; } catch (err) { if (err && err.name === 'AbortError') return; }
    }
    try { await navigator.clipboard.writeText(`${title}\n${latest.period.label}\n${url}\n\n${speechText}`); toast(t('reports.toast.copied'), { tone: 'good' }); } catch { toast(t('reports.toast.copyFailed'), { tone: 'warning' }); }
  }
  function print() { try { window.print(); } catch { toast(t('reports.actions.printFailed'), { tone: 'warning' }); } }

  const actions = h('div', { class: 'toolbar report-actions print-hide', role: 'toolbar', 'aria-label': t('reports.actions.label') },
    button(t('reports.actions.print'), { variant: 'primary', icon: icon('print', 16), onClick: print }),
    button(t('reports.actions.csvRisks'), { variant: 'outline', icon: icon('csv', 16), onClick: () => exportRows('risks') }),
    button(t('reports.actions.csvIncidents'), { variant: 'outline', icon: icon('csv', 16), onClick: () => exportRows('incidents') }),
    button(t('reports.actions.json'), { variant: 'outline', icon: icon('json', 16), onClick: exportJSON }),
    button(t('reports.actions.share'), { variant: 'outline', icon: icon('share', 16), onClick: () => { share(); } }),
    h('span', { class: 'toolbar-spacer' }),
    h('div', { class: 'row gap-2 wrap' }, voiceBtn, voiceHint));

  const article = h('article', { class: 'report stack gap-4', 'aria-labelledby': 'reports-title' });
  const view = h('section', { class: 'view view-reports', 'aria-labelledby': 'reports-title' }, head, actions, article);
  container.appendChild(view);

  /* ── building blocks ── */
  function lockup() {
    let node = null;
    try { if (typeof art.logoLockup === 'function') node = art.logoLockup(); } catch { node = null; }
    const wrap = h('div', { class: 'row gap-3 report-lockup' });
    if (node instanceof Node) { node.setAttribute('aria-hidden', 'true'); wrap.appendChild(node); wrap.appendChild(h('span', { class: 'sr-only' }, t('reports.product'))); } else wrap.appendChild(h('strong', { class: 't-card' }, t('reports.product')));
    return wrap;
  }
  function sectionEl(code, title, lead, narrative = null) {
    const id = uid('sec');
    return h('section', { class: ['report-section', 'stack', 'gap-3'], 'aria-labelledby': id },
      h('header', { class: 'row between wrap gap-3 report-section-head print-keep-next' },
        h('div', { class: 'row gap-2 wrap' }, h('span', { class: 'code-tag' }, code), h('h2', { id, class: 'report-section-title t-section' }, title)),
        lead ? h('p', { class: 't-helper' }, lead) : null),
      narrative);
  }
  /** The engine's narrative for a section in the active language (buildReport narrative / narrativeEn). */
  function narrativeBlock(d, id) {
    const s = d.section(id);
    if (!s) return null;
    const list = lang() === 'en' && Array.isArray(s.narrativeEn) && s.narrativeEn.some(Boolean) ? s.narrativeEn : s.narrative;
    const lines = Array.isArray(list) ? list.filter((x) => typeof x === 'string' && x.trim()) : [];
    if (!lines.length) return null;
    return h('div', { class: 'note tone-accent report-narrative-note print-avoid', 'data-source': 'buildReport', 'data-section': id },
      h('span', { class: 't-label' }, t('reports.narrativeLabel')),
      h('p', { class: 't-body is-secondary', style: { maxInlineSize: '100ch' } }, localizeDigits(lines.join(' '))));
  }
  function simpleTable(caption, headers, rows) {
    const table = h('table', { class: 'chart-table' });
    if (caption) table.appendChild(h('caption', {}, caption));
    table.appendChild(h('thead', {}, h('tr', {}, headers.map((label, i) => h('th', { scope: 'col', class: i > 0 ? 'num' : null }, label)))));
    table.appendChild(h('tbody', {}, rows.map((cells) => h('tr', {}, cells.map((c, i) => h(i === 0 ? 'th' : 'td', { scope: i === 0 ? 'row' : undefined, class: i > 0 ? 'num' : null }, c === null || c === undefined || c === '' ? '—' : String(c)))))));
    return table;
  }
  function mountChart(make, fallbackTable) {
    try {
      const c = make();
      if (c && c.el instanceof Node) return { el: c.el, table: () => { try { const tb = typeof c.table === 'function' ? c.table() : null; return tb instanceof Node ? tb : fallbackTable(); } catch { return fallbackTable(); } } };
    } catch { /* table twin below */ }
    let table = null;
    try { table = fallbackTable(); } catch { table = null; }
    return { el: table ? h('div', { class: 'table-wrap' }, table) : emptyState({ title: t('reports.noChart') }), table: fallbackTable };
  }
  /** Long text cards may split across printed pages (print.css keeps other cards whole). */
  const allowBreak = (el) => { el.style.breakInside = 'auto'; el.style.pageBreakInside = 'auto'; el.style.boxDecorationBreak = 'clone'; el.style.webkitBoxDecorationBreak = 'clone'; return el; };
  const chartCard = ({ code, title, subtitle, chart }) => card({ code, title, subtitle, body: chart.el, tableView: chart.table });
  const factEl = (label, value, tone = null) => h('div', { class: ['fact', tone ? `tone-${tone}` : null] }, h('span', { class: 'fact-label' }, label), h('span', { class: 'fact-value num' }, String(value)));
  const paletteFor = (i) => { try { if (typeof charts.paletteFor === 'function') return charts.paletteFor(Math.min(i, 7)); } catch { /* fall through */ } return `var(--s${(i % 8) + 1})`; };

  /** Direction phrase from sel.describeDelta, tagged for the consistency probe. */
  function moveNode(delta, goodWhen, amountFn) {
    const n = Number(delta);
    const d = sel.describeDelta(Number.isFinite(n) ? n : 0, goodWhen);
    const text = d.direction === 'flat'
      ? t('reports.delta.flat')
      : t(`reports.delta.${d.direction}.${d.neutral ? 'neutral' : (d.good ? 'good' : 'bad')}`, { amount: amountFn(Math.abs(n)) });
    return h('span', { class: 'report-move', 'data-delta': String(Number.isFinite(n) ? n : 0), 'data-direction': d.direction, 'data-good-when': goodWhen, 'data-good': String(d.good) }, text);
  }
  /** t() with Node-valued params: the nodes are spliced into the translated sentence. */
  function richT(key, params) {
    const nodes = [];
    const flat = {};
    for (const [k, v] of Object.entries(params)) {
      if (v instanceof Node) { flat[k] = `⁣${nodes.length}⁣`; nodes.push(v); } else flat[k] = v;
    }
    const frag = document.createDocumentFragment();
    String(t(key, flat)).split(/⁣(\d+)⁣/).forEach((part, i) => {
      if (i % 2 === 1) frag.appendChild(nodes[Number(part)]); else if (part) frag.appendChild(document.createTextNode(part));
    });
    return frag;
  }
  const metricSpan = (metric, text) => h('span', { 'data-metric': metric }, text);
  function deltaChip(delta, goodWhen, digits = 0, pctUnit = false) {
    const n = Number(delta);
    if (!Number.isFinite(n)) return null;
    const d = sel.describeDelta(n, goodWhen);
    const cls = d.direction === 'flat' || d.neutral ? 'is-flat' : (d.good ? 'is-good' : 'is-bad');
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('fill', 'none'); svg.setAttribute('stroke', 'currentColor'); svg.setAttribute('stroke-width', '2'); svg.setAttribute('aria-hidden', 'true');
    const p = document.createElementNS(SVG_NS, 'path');
    p.setAttribute('d', d.direction === 'up' ? 'M12 19V5M5 12l7-7 7 7' : d.direction === 'down' ? 'M12 5v14M5 12l7 7 7-7' : 'M5 12h14');
    svg.appendChild(p);
    const word = d.direction === 'flat' ? t('reports.delta.same') : d.neutral ? '' : (d.good ? t('reports.delta.better') : t('reports.delta.worse'));
    return h('span', { class: ['delta', cls], 'data-delta': String(n), 'data-direction': d.direction, 'data-good': String(d.good) },
      svg, h('bdi', { dir: 'ltr' }, stripBidi(pctUnit ? fmt.signedPct(n, digits) : fmt.signed(n, digits))), word ? h('span', { class: 'sr-only' }, ` ${word}`) : null);
  }
  function metricTile({ label, value, unit = '', tone = null, delta = null, helper = '', hint = '', metric = null }) {
    return h('div', { class: ['metric-tile', tone ? `tone-${tone}` : null], title: hint || undefined },
      h('div', { class: 'metric-head' }, h('span', { class: 'metric-label' }, label)),
      h('div', { class: 'metric-value' }, h('span', { class: 't-metric', 'data-metric': metric || undefined }, value), unit ? h('span', { class: 'metric-unit' }, unit) : null),
      h('div', { class: 'metric-foot' }, delta, helper ? h('span', { class: 'metric-helper' }, helper) : null));
  }

  /* ── executive summary ── */
  function summarySection(d) {
    const k = d.kpis;
    const dl = k.deltas || {};
    const n = (key, v) => tn(`reports.n.${key}`, Math.abs(Math.round(Number(v) || 0)));
    const si = Number(k.safetyIndex) || 0;
    const quality = si >= 85 ? 'good' : si >= 70 ? 'fair' : 'poor';
    const topCat = d.categories[0];
    const weakest = d.iso.length ? d.iso.reduce((a, c) => (c.score < a.score ? c : a), d.iso[0]) : null;
    const gaps = d.iso.reduce((s, c) => s + (Number(c.gaps) || 0), 0);
    const pending = (d.permits.find((p) => p.label === 'بانتظار الاعتماد') || {}).value || 0;

    const p1 = richT('reports.summary.p1', {
      period: d.period.key === '30d' ? t('reports.period.inline30d', { n: fmt.num(30) }) : d.period.label, range: d.period.rangeLabel, scope: d.site ? scopeLabel(d) : t('reports.allSitesInline'), asOf: t('reports.riyadh', { time: zDateTime(d.now) }),
      value: metricSpan('safetyIndex', num(si)), max: num(100),
      move: moveNode(dl.safetyIndex, 'up', (a) => n('point', a)), quality: t(`reports.summary.quality.${quality}`),
    });
    const p2 = richT('reports.summary.p2', {
      reports: metricSpan('incidentsInPeriod', n('report', k.incidentsInPeriod)), incidents: n('incident', d.incidentsOnly), nearMisses: n('nearMiss', d.nearMissInPeriod),
      lti: tn('reports.n.lti', Number(k.lti) || 0), move: moveNode(dl.incidentsInPeriod, 'down', (a) => n('report', a)),
      ltifr: num(k.ltifr, 2), ltifrMove: moveNode(dl.ltifr, 'down', (a) => num(a, 2)),
      trir: num(k.trir, 2), trirMove: moveNode(dl.trir, 'down', (a) => num(a, 2)),
      days: n('day', k.daysSinceLTI),
    });
    const p3 = richT('reports.summary.p3', {
      open: n('openRisk', k.openRisks), critical: metricSpan('criticalRisks', num(k.criticalRisks)), high: num(k.highRisks),
      overdue: metricSpan('overdueRisks', n('risk', d.overdueCount)),
      topCat: topCat ? t('reports.summary.topCat', { name: i18n.label('hseCategory', topCat.id), count: num(topCat.value) }) : '',
      move: moveNode(dl.criticalRisks, 'down', (a) => n('risk', a)),
      active: n('permit', k.activePermits), pending: n('permit', pending),
      due: metricSpan('inspectionsDue', n('inspection', k.inspectionsDue)), window: num(DUE_WINDOW_DAYS), overdueIns: metricSpan('overdueInspections', num(d.overdueInspections)),
    });
    const p4 = richT('reports.summary.p4', {
      training: metricSpan('trainingCompliance', pct(k.trainingCompliance)), move: moveNode(dl.trainingCompliance, 'up', (a) => n('pp', a)),
      expiring: n('cert', d.expiring.length), window: num(EXPIRING_DAYS), capa: pct(k.capaClosure), done: num(k.actionsDone), total: num(k.actionsTotal),
      iso: weakest ? t('reports.summary.iso', { score: pct(d.isoOverall), clause: weakest.title, weakest: pct(weakest.score), gaps: n('gap', gaps) }) : '',
    });
    const paragraphs = [p1, p2, p3, p4].map((frag) => h('p', { style: { breakInside: 'avoid' } }, frag));
    const strip = h('div', { class: 'summary-strip', style: { gridTemplateColumns: 'repeat(auto-fit, minmax(112px, 1fr))' } },
      stripCell(t('reports.kpi.safetyIndex'), num(si), t('reports.kpi.outOf', { max: num(100) }), deltaChip(dl.safetyIndex, 'up')),
      stripCell(t('reports.kpi.recorded'), num(d.incidentsOnly), '', null),
      stripCell(t('reports.kpi.critical'), num(k.criticalRisks), '', deltaChip(dl.criticalRisks, 'down')),
      stripCell(t('reports.kpi.overdue'), num(d.overdueCount), '', deltaChip(dl.overdueRisks, 'down'), 'overdueRisks'),
      stripCell(t('reports.kpi.training'), pct(k.trainingCompliance), '', deltaChip(dl.trainingCompliance, 'up', 0, true)));
    const narrative = h('div', { class: 'stack gap-3 report-narrative', style: { maxInlineSize: '92ch' }, 'data-summary': 'true' }, paragraphs);
    const body = h('div', { class: 'stack gap-4' }, strip, narrative);
    const sec = sectionEl('RPT-01', t('reports.summary.title'), t('reports.summary.lead'));
    const summaryCard = card({ hero: true, body });
    allowBreak(summaryCard);
    sec.appendChild(summaryCard);
    return { el: sec, text: paragraphs.map((p) => p.textContent.replace(/\s+/g, ' ').trim()).join('\n') };
  }
  function stripCell(label, value, small, chip, metric = null) {
    const v = h('span', { class: 'summary-value num' }, h('span', { 'data-metric': metric || undefined }, value));
    if (small) v.appendChild(h('small', {}, small));
    return h('div', { class: 'summary-cell' }, h('span', { class: 'summary-label' }, label), v,
      chip ? h('span', { class: 'row gap-1 t-helper' }, chip, h('span', {}, t('reports.summary.metricDelta'))) : null);
  }

  /* ── KPIs ── */
  function kpiSection(d) {
    const k = d.kpis;
    const dl = k.deltas || {};
    const sign = fmt.getNumerals() === 'arab' ? '٪' : '%';
    const helper = t('reports.delta.vsPrevious', { days: tn('reports.period.days', d.period.range) });
    const grid = h('div', { class: 'metric-grid' },
      metricTile({ label: t('reports.kpi.safetyIndex'), value: num(k.safetyIndex), unit: t('reports.kpi.outOf', { max: num(100) }), tone: toneFor(k.safetyIndex), delta: deltaChip(dl.safetyIndex, 'up'), helper, hint: t('reports.kpi.safetyHint') }),
      metricTile({ label: t('reports.kpi.ltifr'), value: num(k.ltifr, 2), delta: deltaChip(dl.ltifr, 'down', 2), helper, hint: t('reports.kpi.ltifrHint') }),
      metricTile({ label: t('reports.kpi.trir'), value: num(k.trir, 2), delta: deltaChip(dl.trir, 'down', 2), helper, hint: t('reports.kpi.trirHint', { n: num(200) }) }),
      metricTile({ label: t('reports.kpi.nearMisses', { n: num(30) }), value: num(k.nearMisses30d), delta: deltaChip(dl.nearMisses30d, 'none'), helper, hint: t('reports.kpi.nearMissHint') }),
      metricTile({ label: t('reports.kpi.critical'), value: num(k.criticalRisks), tone: k.criticalRisks > 0 ? 'critical' : 'good', delta: deltaChip(dl.criticalRisks, 'down'), helper }),
      metricTile({ label: t('reports.kpi.overdue'), value: num(d.overdueCount), tone: d.overdueCount > 0 ? 'serious' : 'good', delta: deltaChip(dl.overdueRisks, 'down'), helper, metric: 'overdueRisks' }),
      metricTile({ label: t('reports.kpi.capa'), value: num(k.capaClosure), unit: sign, tone: toneFor(k.capaClosure), delta: deltaChip(dl.capaClosure, 'up', 0, true), helper }),
      metricTile({ label: t('reports.kpi.training'), value: num(k.trainingCompliance), unit: sign, tone: toneFor(k.trainingCompliance), delta: deltaChip(dl.trainingCompliance, 'up', 0, true), helper }));
    const sec = sectionEl('RPT-02', t('reports.kpi.title'), t('reports.kpi.lead'), narrativeBlock(d, 'kpis'));
    sec.appendChild(grid);
    return sec;
  }

  /* ── incidents ── */
  function incidentsSection(d) {
    const labels = d.trend.map((b) => t('reports.incidents.week', { n: fmt.num(b.week) }));
    const line = mountChart(() => charts.radarTrend({
      series: [
        { id: 'incidents', label: t('reports.incidents.series'), color: 'var(--s1)', values: d.trend.map((b) => b.incidents) },
        { id: 'nearmiss', label: t('reports.incidents.nearMiss'), color: 'var(--s2)', values: d.trend.map((b) => b.nearMisses) },
      ],
      labels, height: 240, yFormat: (v) => fmt.num(v), ariaLabel: t('reports.incidents.trendAria'),
    }), () => simpleTable(t('reports.incidents.trendAria'), [t('reports.incidents.weekCol'), t('reports.incidents.series'), t('reports.incidents.nearMiss')], d.trend.map((b, i) => [labels[i], num(b.incidents), num(b.nearMisses)])));
    const typeParts = d.byType.map((x, i) => ({ id: x.id, label: i18n.label('incidentType', x.label), value: x.value, color: paletteFor(i) }));
    const seg = mountChart(() => charts.segmentedBar({ parts: typeParts, tall: true, valueFormat: (v) => fmt.num(v), ariaLabel: t('reports.incidents.byTypeAria') }),
      () => simpleTable(t('reports.incidents.byTypeAria'), [t('reports.incidents.type'), t('reports.incidents.count')], typeParts.map((x) => [x.label, num(x.value)])));
    const causes = d.pareto.slice(0, 6).map((c) => ({ ...c, name: i18n.label('rootCause', c.label) }));
    const pareto = mountChart(() => charts.barChart({ items: causes.map((c) => ({ id: c.label, label: c.name, value: c.value })), horizontal: true, height: Math.max(140, causes.length * 34), valueFormat: (v) => fmt.num(v), color: 'var(--s1)', showValues: true, maxBars: 6, ariaLabel: t('reports.incidents.causesAria') }),
      () => simpleTable(t('reports.incidents.causes'), [t('reports.incidents.cause'), t('reports.incidents.count'), t('reports.incidents.share'), t('reports.incidents.cumulative')], causes.map((c) => [c.name, num(c.value), pct(c.pct), pct(c.cumulativePct)])));
    const sec = sectionEl('RPT-03', t('reports.incidents.title'),
      t('reports.incidents.lead', { reports: tn('reports.n.report', Number(d.kpis.incidentsInPeriod) || 0), open: tn('reports.incidents.open', Number(d.kpis.openIncidents) || 0) }),
      narrativeBlock(d, 'incidents'));
    sec.appendChild(h('div', { class: 'grid-12', style: { alignItems: 'start' } },
      h('div', { class: 'col-span-7', 'data-pair': 'half' }, chartCard({ code: 'RPT-03A', title: t('reports.incidents.trend'), subtitle: t('reports.incidents.trendSub'), chart: line })),
      h('div', { class: 'col-span-5', 'data-pair': 'half' }, chartCard({ code: 'RPT-03B', title: t('reports.incidents.byType'), subtitle: t('reports.incidents.byTypeSub'), chart: seg })),
      h('div', { class: 'col-span-12' }, causes.length
        ? chartCard({ code: 'RPT-03C', title: t('reports.incidents.causes'), subtitle: t('reports.incidents.causesSub'), chart: pareto })
        : card({ code: 'RPT-03C', title: t('reports.incidents.causes'), body: emptyState({ title: t('reports.incidents.noCauses') }) }))));
    return sec;
  }

  /* ── risks ── */
  function risksSection(d) {
    const rows = [5, 4, 3, 2, 1];
    const cols = [1, 2, 3, 4, 5];
    const cells = rows.map((_, ri) => d.matrix[4 - ri] || Array(5).fill(0));
    const toneAt = (ri, ci) => sel.tierTone(sel.riskTier((5 - ri) * (ci + 1)));
    const heat = mountChart(() => charts.heatmap({
      rows: rows.map((r) => t('reports.risks.severityN', { n: fmt.num(r) })), cols: cols.map((c) => fmt.num(c)), cells,
      colorFor: (value, ri, ci) => `color-mix(in srgb, var(--${toneAt(ri, ci)}) ${value > 0 ? 72 : 16}%, var(--bg-1))`,
      labelFor: (value) => (value > 0 ? fmt.num(value) : ''),
      ariaLabel: t('reports.risks.matrixAria', { n: fmt.num(5) }), rowTitle: t('reports.risks.severity'), colTitle: t('reports.risks.likelihood'),
    }), () => simpleTable(t('reports.risks.matrix'), [t('reports.risks.matrixCorner'), ...cols.map((c) => fmt.num(c))], rows.map((r, ri) => [fmt.num(r), ...cells[ri].map((v) => fmt.num(v))])));
    const cats = d.categories.slice(0, 8).map((c) => ({ ...c, name: i18n.label('hseCategory', c.id) }));
    const bars = mountChart(() => charts.barChart({ items: cats.map((c) => ({ id: c.id, label: c.name, value: c.value })), horizontal: true, height: Math.max(200, cats.length * 34), valueFormat: (v) => fmt.num(v), color: 'var(--s1)', showValues: true, maxBars: 8, ariaLabel: t('reports.risks.categoriesAria') }),
      () => simpleTable(t('reports.risks.categoriesAria'), [t('reports.risks.category'), t('reports.risks.count')], cats.map((c) => [c.name, num(c.value)])));
    const k = d.kpis;
    const overdueBody = d.overdueCount
      ? h('div', { class: 'stack gap-2' },
        h('ol', { class: 'priority-list' }, d.overdueTop.map((r) => h('li', { class: ['priority-item', `tone-${r.tone || 'serious'}`] },
          h('span', { class: 'priority-rank', 'aria-hidden': 'true' }),
          h('div', { class: 'priority-main' },
            h('div', { class: 'priority-title' }, h('span', { class: 'code' }, r.code), ' ', h('span', {}, localizeDigits(i18n.L({ id: r.id, hazard: r.hazard }, 'hazard', 'risks') || '—'))),
            h('div', { class: 'priority-meta' }, h('span', {}, r.owner ? i18n.term(r.owner) : '—'), h('span', {}, r.dueDate ? fmt.date(r.dueDate) : '—'))),
          h('div', { class: 'priority-side' }, badge(i18n.label('tier', r.tier), r.tone || 'serious'), h('span', { class: 'priority-due is-overdue' }, tn('reports.risks.daysOverdue', Number(r.daysOverdue) || 0)))))),
        d.overdueCount > d.overdueTop.length ? h('p', { class: 't-helper' }, tn('reports.risks.more', d.overdueCount - d.overdueTop.length)) : null)
      : h('p', { class: 'note tone-good' }, t('reports.risks.overdueNone'));
    const sec = sectionEl('RPT-04', t('reports.risks.title'),
      t('reports.risks.lead', { open: tn('reports.n.risk', Number(k.openRisks) || 0), critical: num(k.criticalRisks), high: num(k.highRisks), overdue: num(d.overdueCount) }),
      narrativeBlock(d, 'risks'));
    sec.appendChild(h('div', { class: 'grid-12', style: { alignItems: 'start' } },
      h('div', { class: 'col-span-6' }, chartCard({ code: 'RPT-04A', title: t('reports.risks.matrix'), subtitle: t('reports.risks.matrixSub'), chart: heat })),
      h('div', { class: 'col-span-6' }, cats.length
        ? chartCard({ code: 'RPT-04B', title: t('reports.risks.categories'), subtitle: t('reports.risks.categoriesSub'), chart: bars })
        : card({ code: 'RPT-04B', title: t('reports.risks.categories'), body: emptyState({ title: t('reports.risks.noOpen') }) })),
      h('div', { class: 'col-span-12' }, allowBreak(card({ code: 'RPT-04C', title: t('reports.risks.overdueTitle'), subtitle: tn('reports.risks.overdueSub', d.overdueCount, { shown: fmt.num(d.overdueTop.length) }), body: overdueBody })))));
    return sec;
  }

  /* ── permits ── */
  function permitsSection(d) {
    const parts = d.permits.map((p, i) => ({ id: p.id, label: i18n.label('permitStatus', p.label), value: p.value, color: paletteFor(i) }));
    const seg = mountChart(() => charts.segmentedBar({ parts, tall: true, valueFormat: (v) => fmt.num(v), ariaLabel: t('reports.permits.byStatusAria') }),
      () => simpleTable(t('reports.permits.byStatusAria'), [t('reports.permits.status'), t('reports.permits.count')], parts.map((p) => [p.label, num(p.value)])));
    const value = (label) => (d.permits.find((p) => p.label === label) || {}).value || 0;
    const facts = h('div', { class: 'hero-facts' },
      factEl(t('reports.permits.active'), num(d.kpis.activePermits)),
      factEl(t('reports.permits.pending'), num(value('بانتظار الاعتماد')), value('بانتظار الاعتماد') ? 'warning' : null),
      factEl(t('reports.permits.soon'), num(d.permitsSoon.length), d.permitsSoon.length ? 'warning' : null));
    const soon = d.permitsSoon.slice(0, 4);
    const list = soon.length
      ? h('div', { class: 'stack gap-2' }, h('p', { class: 't-helper' }, t('reports.permits.soonList')),
        h('ul', { class: 'stack gap-2', style: { listStyle: 'none', padding: 0, margin: 0 } }, soon.map((p) => h('li', { class: 'row between gap-2 wrap' },
          h('span', { class: 'row gap-2' }, h('span', { class: 'code' }, p.code), h('span', {}, i18n.label('permitType', p.type))),
          h('span', { class: 't-helper num' }, t('reports.permits.at', { time: zTime(p.expiresAt) }))))))
      : h('p', { class: 't-helper' }, t('reports.permits.soonNone'));
    const total = d.permits.reduce((s, p) => s + p.value, 0);
    const sec = sectionEl('RPT-05', t('reports.permits.title'), t('reports.permits.lead', { total: tn('reports.n.permit', total), suspended: num(value('معلق')) }), narrativeBlock(d, 'permits'));
    sec.appendChild(h('div', { class: 'grid-12', style: { alignItems: 'start' } },
      h('div', { class: 'col-span-7', 'data-pair': 'half' }, chartCard({ code: 'RPT-05A', title: t('reports.permits.byStatus'), subtitle: parts.map((p) => p.label).join(' · '), chart: seg })),
      h('div', { class: 'col-span-5', 'data-pair': 'half' }, card({ code: 'RPT-05B', title: t('reports.permits.now'), body: h('div', { class: 'stack gap-3' }, facts, h('hr', { class: 'divider' }), list) }))));
    return sec;
  }

  /* ── training ── */
  function trainingSection(d) {
    const courseLabel = (c) => i18n.L(((d.state.courses || []).find((x) => x.id === c.id)) || { id: c.id, name: c.label }, 'name', 'courses');
    const items = d.training.slice().sort((a, b) => b.pct - a.pct).map((c) => ({ ...c, name: courseLabel(c) }));
    const bars = mountChart(() => charts.barChart({ items: items.map((c) => ({ id: c.id, label: c.name, value: c.pct })), horizontal: true, height: Math.max(220, items.length * 32), valueFormat: (v) => fmt.pct(v), color: 'var(--s1)', showValues: true, maxBars: 12, ariaLabel: t('reports.training.coursesAria') }),
      () => simpleTable(t('reports.training.courses'), [t('reports.training.course'), t('reports.training.pct'), t('reports.training.holders'), t('reports.training.workers')], items.map((c) => [c.name, pct(c.pct), num(c.holders), num(c.workers)])));
    const below = items.filter((c) => c.pct < TRAINING_TARGET);
    const facts = h('div', { class: 'hero-facts' },
      factEl(t('reports.training.compliance'), pct(d.kpis.trainingCompliance), toneFor(d.kpis.trainingCompliance)),
      factEl(t('reports.training.expiring', { n: num(EXPIRING_DAYS) }), num(d.expiring.length), d.expiring.length ? 'warning' : null),
      factEl(t('reports.training.below', { target: pct(TRAINING_TARGET) }), num(below.length), below.length ? 'serious' : 'good'));
    const soon = d.expiring.slice(0, 5);
    const list = soon.length
      ? h('ul', { class: 'stack gap-2', style: { listStyle: 'none', padding: 0, margin: 0 } }, soon.map((x) => h('li', { class: 'row between gap-2 wrap' },
        h('span', { class: 'stack gap-1' }, h('strong', {}, i18n.L(x.worker, 'name', 'workers')), h('span', { class: 't-helper' }, i18n.L(x.course, 'name', 'courses'))),
        badge(fmt.date(x.expiresAt, { style: 'short' }), x.tone || 'warning'))))
      : h('p', { class: 't-helper' }, t('reports.training.none', { n: num(EXPIRING_DAYS) }));
    const sec = sectionEl('RPT-06', t('reports.training.title'), t('reports.training.lead', { pct: pct(d.kpis.trainingCompliance), target: pct(TRAINING_TARGET) }), narrativeBlock(d, 'training'));
    sec.appendChild(h('div', { class: 'grid-12', style: { alignItems: 'start' } },
      h('div', { class: 'col-span-7', 'data-pair': 'half' }, items.length
        ? chartCard({ code: 'RPT-06A', title: t('reports.training.courses'), subtitle: t('reports.training.coursesSub'), chart: bars })
        : card({ code: 'RPT-06A', title: t('reports.training.courses'), body: emptyState({ title: t('reports.training.noData') }) })),
      h('div', { class: 'col-span-5', 'data-pair': 'half' }, card({ code: 'RPT-06B', title: t('reports.training.certs'), body: h('div', { class: 'stack gap-3' }, facts, h('hr', { class: 'divider' }), h('p', { class: 't-label' }, t('reports.training.soonest')), list) }))));
    return sec;
  }

  /* ── compliance ── */
  function complianceSection(d) {
    const digits = (s) => String(s ?? '').replace(/\d+(?:\.\d+)?/g, (m) => fmt.num(Number(m), { maximumFractionDigits: 2 }));
    const axes = d.iso.map((c) => ({ id: c.id, label: `${digits(c.id)} ${c.title}` }));
    const spider = mountChart(() => charts.spider({ axes, series: [{ id: 'score', label: t('reports.compliance.series'), color: 'var(--s1)', values: d.iso.map((c) => c.score) }], max: 100, size: 360, target: ISO_TARGET, ariaLabel: t('reports.compliance.clausesAria', { from: fmt.num(4), to: fmt.num(10) }) }),
      () => simpleTable(t('reports.compliance.clausesAria', { from: fmt.num(4), to: fmt.num(10) }), [t('reports.compliance.clause'), t('reports.compliance.score'), t('reports.compliance.gapsCol')], d.iso.map((c) => [`${digits(c.id)} — ${c.title}`, pct(c.score), num(c.gaps)])));
    const ring = mountChart(() => charts.ring({ value: d.isoOverall, max: 100, size: 112, color: `var(--${toneFor(d.isoOverall) === 'good' ? 'good' : 'brand'})`, label: 'ISO 45001' }),
      () => simpleTable(t('reports.compliance.overall'), ['', ''], [[t('reports.compliance.mean'), pct(d.isoOverall)]]));
    const above = d.iso.filter((c) => c.score >= ISO_TARGET).length;
    const gaps = d.iso.reduce((s, c) => s + (Number(c.gaps) || 0), 0);
    const legalCount = (s) => d.legal.filter((l) => l && l.status === s).length;
    const legalRow = h('div', { class: 'row gap-2 wrap' },
      badge(`${i18n.label('legalStatus', 'ممتثل')} ${num(legalCount('ممتثل'))}`, 'good'),
      badge(`${i18n.label('legalStatus', 'جزئي')} ${num(legalCount('جزئي'))}`, 'warning'),
      badge(`${i18n.label('legalStatus', 'فجوة')} ${num(legalCount('فجوة'))}`, 'critical'));
    const meets = d.isoOverall >= ISO_TARGET;
    const overall = h('div', { class: 'stack gap-3' },
      h('div', { class: 'ring-row' }, ring.el, h('div', { class: 'ring-text' },
        h('span', { class: 't-helper' }, t('reports.compliance.mean')),
        h('strong', { class: 't-metric is-sm' }, pct(d.isoOverall)),
        h('span', { class: 't-helper' }, t('reports.compliance.target', { target: pct(ISO_TARGET) })))),
      h('div', { class: 'row gap-2 wrap' }, badge(meets ? t('reports.compliance.within') : t('reports.compliance.below'), meets ? 'good' : 'warning')),
      kv([
        [t('reports.compliance.above', { target: pct(ISO_TARGET) }), t('reports.compliance.aboveValue', { n: num(above), total: num(d.iso.length) })],
        [t('reports.compliance.gaps'), num(gaps)],
        [t('reports.compliance.legal'), d.legal.length ? legalRow : '—'],
      ]));
    const sec = sectionEl('RPT-07', t('reports.compliance.title'), t('reports.compliance.lead', { standard: '\u2066ISO 45001:2018\u2069', score: pct(d.isoOverall), target: pct(ISO_TARGET) }), narrativeBlock(d, 'compliance'));
    sec.appendChild(h('div', { class: 'grid-12', style: { alignItems: 'start' } },
      h('div', { class: 'col-span-5', 'data-pair': 'half' }, card({ code: 'RPT-07A', title: t('reports.compliance.overall'), body: overall })),
      h('div', { class: 'col-span-7', 'data-pair': 'half' }, d.iso.length
        ? chartCard({ code: 'RPT-07B', title: t('reports.compliance.clauses', { from: fmt.num(4), to: fmt.num(10) }), subtitle: t('reports.compliance.clausesSub'), chart: spider })
        : card({ code: 'RPT-07B', title: t('reports.compliance.clauses', { from: fmt.num(4), to: fmt.num(10) }), body: emptyState({ title: t('reports.compliance.noData') }) }))));
    return sec;
  }

  /* ── recommendations (engine items, same definitions) ── */
  function topicOf(text) {
    const s = String(text || '');
    if (/تكامل/.test(s)) return 'integrations';
    if (/السبب الجذري|التحقيق|الإجراءات التصحيحية/.test(s)) return 'incidents';
    if (/ISO|السجل القانوني|نظامي/.test(s)) return 'compliance';
    if (/تدريب|الامتثال التدريبي|شهادات/.test(s)) return 'training';
    if (/تفتيش/.test(s)) return 'inspections';
    if (/تصريح|تصاريح/.test(s)) return 'permits';
    if (/حوادث|التحقيق|السبب الجذري|الإجراءات التصحيحية/.test(s)) return 'incidents';
    if (/مخاطر|مخاطرة/.test(s)) return 'risks';
    return 'overview';
  }
  function recommendationsSection(d) {
    const s = d.section('recommendations');
    const items = (s && Array.isArray(s.items) ? s.items : []).map((r) => ({ tone: TONE_RANK[r.tone] !== undefined ? r.tone : 'warning', text: lang() === 'en' ? (r.textEn || r.text) : r.text, topic: topicOf(r.text) }))
      .filter((r) => r.text)
      .sort((a, b) => (TONE_RANK[a.tone] ?? 9) - (TONE_RANK[b.tone] ?? 9));
    const list = items.length
      ? h('ol', { class: 'priority-list' }, items.map((r) => {
        const section = t(`reports.recs.sections.${r.topic}`);
        const link = h('a', { href: `#/${r.topic}`, class: 'btn btn-ghost btn-sm print-hide', onClick: (e) => { e.preventDefault(); if (router && typeof router.navigate === 'function') router.navigate(r.topic); else location.hash = `#/${r.topic}`; } }, t('reports.recs.open', { section }));
        return h('li', { class: ['priority-item', `tone-${r.tone}`] },
          h('span', { class: 'priority-rank', 'aria-hidden': 'true' }),
          h('div', { class: 'priority-main' }, h('div', { class: 'priority-title', style: { fontWeight: 500 } }, localizeDigits(r.text))),
          h('div', { class: 'priority-side' }, badge(t(`reports.recs.priority.${r.tone}`), r.tone)),
          h('div', { class: 'priority-action' }, link));
      }))
      : emptyState({ title: t('reports.recs.none') });
    const sec = sectionEl('RPT-08', t('reports.recs.title'), t('reports.recs.lead'));
    sec.appendChild(allowBreak(card({ body: list })));
    return sec;
  }

  /* ── cover / screen header / footer ── */
  const sourceNote = (d) => (d.mode === 'demo' ? t('reports.demoNote') : t('reports.liveNote', { source: safe(() => statusApi.label(statusApi.source(d.state).status), '') }));
  function screenHeader(d) {
    const meta = h('div', { class: 'hero-facts' },
      factEl(t('reports.periodFact'), d.period.label),
      factEl(t('reports.scopeFact'), scopeLabel(d)),
      factEl(t('reports.issuedFact'), zDate(d.now)));
    const statusKey = d.mode === 'demo' ? 'demo' : safe(() => statusApi.source(d.state).status, 'not_connected');
    const body = h('div', { class: 'stack gap-4' },
      h('div', { class: 'row between wrap gap-3' },
        h('div', { class: 'row gap-4 wrap' }, lockup(), h('div', { class: 'stack gap-1' },
          h('h2', { class: 't-section' }, d.period.title),
          h('span', { class: 't-helper' }, `${t('reports.pillar')} · ${d.period.rangeLabel}`))),
        h('div', { class: 'row gap-2 wrap' }, typeof statusBadge === 'function' ? statusBadge(statusKey) : null, badge(tn('reports.period.days', d.period.range), 'accent'))),
      meta,
      h('p', { class: 'note is-demo t-helper' }, sourceNote(d)));
    return h('div', { class: 'print-hide' }, card({ hero: true, framed: true, body }));
  }
  function printCover(d) {
    return h('header', { class: 'report-only is-row report-cover' },
      h('div', { class: 'stack gap-2', style: { flex: '1 1 auto', minInlineSize: '0' } },
        lockup(),
        h('div', { class: 'report-cover-title' }, d.period.title),
        h('div', {}, t('reports.pillar')),
        h('div', {}, `${d.period.label} · ${d.period.rangeLabel}`),
        h('div', {}, t('reports.scope', { scope: scopeLabel(d) })),
        h('div', { class: 'report-demo-note' }, sourceNote(d))),
      h('div', { class: 'report-cover-meta stack gap-1', style: { flex: '0 0 auto', whiteSpace: 'nowrap', fontFamily: 'var(--font-sans)' } },
        h('div', {}, t('reports.preparedBy', { name: t('reports.product') })),
        h('div', {}, t('reports.issued', { date: zDate(d.now) })),
        h('div', {}, fmt.hijri(d.now)),
        h('div', { class: 'row gap-1', style: { justifyContent: 'flex-end' } }, t('reports.reference'), h('span', { class: 'code' }, `HSE-RPT-${isoDate(d.period.to).replace(/-/g, '')}`))));
  }
  function printFooter(d) {
    return [
      h('footer', { class: 'report-only is-row report-footer' },
        h('span', {}, `${t('reports.product')} — ${t('reports.pillar')}`),
        h('span', {}, `${t('reports.footer', { when: t('reports.riyadh', { time: zDateTime(d.now) }) })} · ${sourceNote(d)}`)),
      h('div', { class: 'report-only is-grid report-sign' }, h('div', {}, t('reports.sign.hse')), h('div', {}, t('reports.sign.pm')), h('div', {}, t('reports.sign.exec'))),
    ];
  }

  /* ── assemble ── */
  function build() {
    const period = resolvePeriod(currentPeriod, typeof store.now === 'function' ? store.now() : new Date());
    const d = collect(period);
    latest = d;
    const summary = summarySection(d);
    speechText = `${t('reports.product')}. ${d.period.title}. ${d.period.label}. ${summary.text}`;
    periodSeg.set(currentPeriod);
    const sections = [summary.el, kpiSection(d), incidentsSection(d), risksSection(d), permitsSection(d), trainingSection(d), complianceSection(d), recommendationsSection(d)];
    const headerCard = screenHeader(d);
    const scrollY = window.scrollY;
    article.replaceChildren(printCover(d), headerCard, ...sections, ...printFooter(d));
    applyPairs(article);
    article.dataset.period = d.period.key;
    article.dataset.overdue = String(d.overdueCount);
    if (firstBuild) {
      firstBuild = false;
      motion.enter([headerCard, ...sections.slice(0, 3)], { y: 10 });
    } else if (Math.abs(window.scrollY - scrollY) > 1) window.scrollTo({ top: scrollY });
  }
  function rebuild() {
    if (rebuildTimer) { clearTimeout(rebuildTimer); rebuildTimer = null; }
    try { build(); } catch (err) {
      console.warn('[biltix] reports: build failed', err);
      article.replaceChildren(components.errorState ? components.errorState({ title: t('reports.error.title'), text: t('reports.error.text'), retry: () => rebuild() }) : emptyState({ title: t('reports.error.title'), text: t('reports.error.text') }));
    }
  }
  let staleWhileHidden = false;
  function scheduleRebuild() {
    if (rebuildTimer) clearTimeout(rebuildTimer);
    rebuildTimer = setTimeout(() => {
      rebuildTimer = null;
      if (document.hidden) { staleWhileHidden = true; return; }
      rebuild();
    }, 350);
  }
  const onVisibility = () => { if (!document.hidden && staleWhileHidden) { staleWhileHidden = false; rebuild(); } };
  document.addEventListener('visibilitychange', onVisibility);

  rebuild();

  /* Rebuild only for collections the report displays (feed / sensor / integration ticks never touch it). */
  const DISPLAYED = /^(\*|risks|incidents|permits|inspections|workers|courses|sites|isoClauses|legalRegister|documents)(\.|$)/;
  subs.push(bus.on('store:change', (payload) => { if (DISPLAYED.test(String((payload && payload.path) || '*'))) scheduleRebuild(); }));
  subs.push(bus.on('settings:change', () => scheduleRebuild()));
  subs.push(bus.on('filters:change', (payload) => { if (payload && payload.key && payload.key !== 'siteId') return; scheduleRebuild(); }));
  subs.push(bus.on('route:change', (payload) => { if (payload && payload.id !== 'reports') speech.stop(); }));
  let midMq = null;
  const onMq = () => applyPairs(article);
  try { midMq = window.matchMedia(MID_MQ); midMq.addEventListener('change', onMq); } catch { midMq = null; }
  const onPageHide = () => speech.stop();
  window.addEventListener('pagehide', onPageHide);
  window.addEventListener('beforeprint', onPageHide);

  return function cleanup() {
    if (rebuildTimer) { clearTimeout(rebuildTimer); rebuildTimer = null; }
    subs.splice(0).forEach((off) => { try { off(); } catch { /* ignore */ } });
    window.removeEventListener('pagehide', onPageHide);
    window.removeEventListener('beforeprint', onPageHide);
    document.removeEventListener('visibilitychange', onVisibility);
    if (voicesHandler && window.speechSynthesis && typeof window.speechSynthesis.removeEventListener === 'function') window.speechSynthesis.removeEventListener('voiceschanged', voicesHandler);
    if (midMq) { try { midMq.removeEventListener('change', onMq); } catch { /* ignore */ } }
    speech.stop();
  };
}

export const reportsView = {
  id: 'reports',
  code: 'SEC-10',
  get title() { return t('core.nav.reports.title'); },
  icon: 'file-text',
  render,
};

export default reportsView;
