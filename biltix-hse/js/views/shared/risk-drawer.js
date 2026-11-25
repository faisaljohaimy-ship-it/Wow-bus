/**
 * BILTIX Risk AI — shared AI-risk drawer + risk UI helpers (js/views/shared/risk-drawer.js)
 * Owner: B-REGISTER (v3 Precision). Used by airisks.js, cockpit.js (B-COCKPIT), tasks.js, alerts.js.
 *
 *   openRiskDrawer(ctx, riskId, { onClose, returnFocus, tab, urlParam = true }) → drawer api | null
 *     One drawer at a time (opening another risk swaps the content in place). Tabs:
 *       Overview   header chips · next action · three DISTINCT measures (severity L×I×4 with its matrix
 *                  position, model confidence, input-data quality + issues) · residual · explanation ·
 *                  details (source, project, owner, due, detected, engine) · 12-stage lifecycle
 *       Evidence   source evidence (safe http/https links only) · data-quality checks · attached evidence
 *                  (link / note / file metadata, "stored on this device only") with add / remove
 *       Treatment  recommendation (accept / override with reason / dismiss with reason) · assignment ·
 *                  escalation (channels, simulated delivery) · linked tasks + write-back state · plan ·
 *                  residual assessment (required before closure) · close with outcome · reopen
 *       History    merged timeline newest first (actor, time) · CSV export
 *     Every action calls the audited store methods (A-DATA) and reports the real result. Live store
 *     changes refresh the open tab in place (inline-form input and focus are preserved). The drawer
 *     mirrors ?risk=ID into the current hash (history.replaceState, history.state kept) while open.
 *
 *   riskUi — helpers shared by the register, the form and the views (chips, labels, localisation,
 *     inline forms with bilingual field errors, CSV export, style injection).
 *
 * Strings: t('risk.*') (js/i18n/risk.js). Data text: i18n.L / localize / term / label. Data reaches the
 * DOM only through textContent (components.h). Nothing here caches a translated string at module level.
 */

import { components } from '../../ui/components.js';
import { i18n, t, tn } from '../../core/i18n.js';
import { fmt as defaultFmt } from '../../core/fmt.js';
import { store as defaultStore } from '../../core/store.js';
import { bus as defaultBus } from '../../core/bus.js';
import { status as statusApi } from '../../core/status.js';
import { psel as defaultPsel } from '../../core/platform-selectors.js';
import { sources as defaultSources } from '../../data/sources.js';
import { motion } from '../../ui/motion.js';
import { spatialTargetForAiRisk } from '../../data/spatial-seed.js';
import riskDict from '../../i18n/risk.js';

i18n.register('risk', riskDict);

const { h, clear, glyph, svgIcon, badge, button, drawer, toast, formField, emptyState, kv, statusBadge } = components;

/* ────────────────────────────── constants (data, not UI copy) ────────────────────────────── */

/** Stored actor for actions taken in this demo profile (stored values stay Arabic; shown via i18n.term). */
export const ACTOR = 'م. فيصل الحربي';
/** The English display of the demo actor (same as the shell's user chip). */
i18n.registerData('terms', { [ACTOR]: 'Eng. Faisal Al-Harbi', 'إدخال يدوي': 'Manual entry' });

export const RISK_STATUSES = ['مكتشف', 'تنبيه', 'مهمة مُسندة', 'قيد المعالجة', 'مغلق', 'مُتجاوز'];
export const TERMINAL = ['مغلق', 'مُتجاوز'];
export const CLOSED = 'مغلق';
export const DISMISSED = 'مُتجاوز';
export const DOMAINS = ['contract', 'bom', 'schedule', 'site', 'cost'];
export const TYPES = ['Financial', 'Safety', 'Delay', 'Conflict'];
export const RATINGS = ['red', 'yellow', 'green'];
export const CHANNELS = ['email', 'slack', 'teams', 'whatsapp'];
const TASK_CLOSED = 'مغلقة';
const DOMAIN_ICON = { contract: 'file-text', bom: 'package', schedule: 'calendar', site: 'helmet', cost: 'chart' };
const TYPE_ICON = { Financial: 'chart', Safety: 'helmet', Delay: 'clock', Conflict: 'file-text' };
const CHANNEL_ICON = { email: 'mail', slack: 'hash', teams: 'teams', whatsapp: 'whatsapp' };
const EVIDENCE_ICON = { link: 'link', note: 'pencil', file: 'folder' };
const TIMELINE_TONE = { detected: 'accent', history: 'brand', override: 'warning', task: 'brand', writeback: 'accent', 'task-closed': 'good', alert: 'critical', ack: 'good' };
const USER_CLOSE = new Set(['close', 'escape', 'backdrop', 'action']);
const CODE_RE = /\b[A-Z]{1,5}-[A-Z0-9-]*\d[A-Z0-9-]*\b/g;
const LATIN_NUM_TOKEN = /[A-Za-z][A-Za-z0-9._-]*\d[A-Za-z0-9._-]*|\d+[A-Za-z][A-Za-z0-9._-]*/g;
const STYLE_ID = 'risk-shared-style';

/* ────────────────────────────── small utilities ────────────────────────────── */

const arr = (v) => (Array.isArray(v) ? v : []);
const text = (v) => (typeof v === 'string' ? v.trim() : (v == null ? '' : String(v)));
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const num = (v, d = 0) => { const n = Number(v); return Number.isFinite(n) ? n : d; };
const pad2 = (n) => String(n).padStart(2, '0');
const isEn = () => i18n.lang() === 'en';

export function envOf(ctx = {}) {
  const c = ctx && typeof ctx === 'object' ? ctx : {};
  return {
    store: c.store || defaultStore,
    bus: c.bus || defaultBus,
    psel: c.psel || defaultPsel,
    fmt: c.fmt || defaultFmt,
    router: c.router || null,
    sources: c.sources || defaultSources,
  };
}
const stateOf = (env) => (env.store && env.store.state) || {};
const nowOf = (env) => (env.store && typeof env.store.now === 'function' ? env.store.now() : new Date());
export function todayISO(env) {
  const d = nowOf(env);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}
function startOfToday(env) { const d = nowOf(env); return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime(); }
function dateMs(v) {
  if (!v) return NaN;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(v));
  return m ? new Date(+m[1], +m[2] - 1, +m[3]).getTime() : Date.parse(String(v));
}

/** ASCII digits in free text → active numeral system; Latin tokens (P6, 2B, PN10) keep their digits. */
export function prose(value) {
  const s = String(value ?? '');
  if (!/\d/.test(s) || typeof defaultFmt.digits !== 'function') return s;
  let out = ''; let last = 0; let m;
  LATIN_NUM_TOKEN.lastIndex = 0;
  while ((m = LATIN_NUM_TOKEN.exec(s))) { out += defaultFmt.digits(s.slice(last, m.index)) + m[0]; last = m.index + m[0].length; }
  return out + defaultFmt.digits(s.slice(last));
}

/** A code (AIR-1042, MT-0224) as an isolated LTR mono run that never breaks. */
export function codeSpan(code, extra = null) {
  return h('span', { class: ['code', 'mono', 'nowrap', extra], dir: 'ltr', translate: 'no' }, String(code ?? ''));
}
/** Free text with embedded codes split into prose + LTR code runs. */
export function withCodes(str) {
  const s = String(str ?? ''); const out = []; let last = 0; let m;
  CODE_RE.lastIndex = 0;
  while ((m = CODE_RE.exec(s))) { if (m.index > last) out.push(prose(s.slice(last, m.index))); out.push(codeSpan(m[0])); last = m.index + m[0].length; }
  if (last < s.length) out.push(prose(s.slice(last)));
  const nodes = out.length ? out : [prose(s)];
  // Data the dictionaries do not cover (user input, runtime records) stays Arabic in English mode: mark it.
  return isEn() && ARABIC_RE.test(s) ? [h('span', { lang: 'ar', dir: 'rtl' }, ...nodes)] : nodes;
}
const ARABIC_RE = /[\u0600-\u06FF]/;
/** A text node for data that may fall back to Arabic in English mode (lang="ar" when it does). */
export function dataText(str, cls = null) {
  const s = String(str ?? '');
  return isEn() && ARABIC_RE.test(s) ? h('span', { class: cls, lang: 'ar', dir: 'rtl' }, s) : (cls ? h('span', { class: cls }, s) : s);
}
/** One LTR numeric run (keeps "80/100" and "4×5" together in Arabic). */
export function numRun(str, extra = null) { return h('span', { class: ['num', 'nowrap', extra], dir: 'ltr' }, String(str)); }

export function safeHttpUrl(value) {
  const raw = text(value);
  if (!raw) return null;
  try { const u = new URL(raw); return u.protocol === 'http:' || u.protocol === 'https:' ? u.href : null; } catch { return null; }
}

/* ────────────────────────────── data localisation ────────────────────────────── */

export function riskTitle(r) { return r ? (text(i18n.L(r, 'title', 'aiRisks')) || r.code || r.id) : ''; }
export function riskField(r, field) { return r ? i18n.L(r, field, 'aiRisks') : null; }
export function person(name) { return name ? i18n.term(String(name)) : t('risk.common.unassigned'); }
export function siteOf(state, id) { return arr(state && state.sites).find((s) => s && s.id === id) || null; }
export function siteName(state, id) { const s = siteOf(state, id); return s ? prose(text(i18n.L(s, 'name', 'sites')) || s.name || id) : (id ? String(id) : '—'); }
export function domainLabel(cat) { return i18n.label('aiCategory', cat) || String(cat || '—'); }
export function typeLabel(type) { return i18n.label('aiType', type) || String(type || '—'); }
export function ratingLabel(r) { return i18n.label('rating', r) || String(r || '—'); }
export function statusLabel(s) { return i18n.label('aiRiskStatus', s) || String(s || '—'); }
export function taskStatusLabel(s) { return i18n.label('taskStatus', s) || String(s || '—'); }
export function sourceLabel(v) {
  if (!v) return t('risk.common.unknownSource');
  if (v === 'إدخال يدوي') return t('risk.form.sourceManual');
  return i18n.label('sourceSystem', v) || String(v);
}
export function ratingOf(score, env = envOf()) { try { return env.psel.rating(score); } catch { return score >= 70 ? 'red' : score >= 40 ? 'yellow' : 'green'; } }
export const ratingTone = (r) => (r === 'red' ? 'critical' : r === 'yellow' ? 'warning' : 'good');
export function statusTone(s, env = envOf()) { try { return env.psel.statusTone(s); } catch { return 'neutral'; } }

/** Mitigation task title in the active language (mirror → titleEn → the risk's localised recommendation/plan). */
export function taskTitle(task, risk = null) {
  if (!task) return '';
  if (!isEn()) return text(task.title) || task.code || task.id;
  const mirrored = text(i18n.L(task, 'title', 'tasks'));
  if (mirrored && mirrored !== task.title) return mirrored;
  if (text(task.titleEn)) return text(task.titleEn);
  if (risk) {
    const rec = risk.recommendation || {};
    if (task.title && task.title === rec.action) { const lr = riskField(risk, 'recommendation'); if (lr && text(lr.action)) return text(lr.action); }
    const plan = risk.treatment && risk.treatment.plan;
    if (task.title && task.title === plan) { const lt = riskField(risk, 'treatment'); if (lt && text(lt.plan)) return text(lt.plan); }
    if (task.title && task.title === risk.title) return riskTitle(risk);
  }
  return text(task.title) || task.code;
}
export function alertTitle(a) { return a ? (text(i18n.L(a, 'title', 'alerts')) || a.code || '') : ''; }

/** Input-data quality in the active language (source name via the validationSources mirror). */
export function dataQualityOf(risk, env = envOf()) {
  let dq = risk && risk.dataQuality;
  if (!dq) { try { dq = env.psel.dataQuality(stateOf(env), risk); } catch { dq = null; } }
  if (!dq) return null;
  const en = isEn();
  let sourceName = dq.sourceName || null;
  if (en && dq.sourceId) {
    const name = text(i18n.L({ id: dq.sourceId, name: dq.sourceName }, 'name', 'validationSources'));
    sourceName = name && name !== dq.sourceName ? name : (i18n.label('sourceSystem', dq.sourceName) || i18n.term(dq.sourceName) || dq.sourceName);
  }
  const issues = arr(dq.issues).map((iss) => ({ ...iss, label: i18n.label('dataQualityIssue', iss.code) || iss.code, text: en ? (text(iss.textEn) || text(iss.text)) : text(iss.text) }));
  return { ...dq, sourceName, issues };
}

/* ────────────────────────────── chips & badges ────────────────────────────── */

export function ratingBadge(r, { sm = false } = {}) {
  const rr = RATINGS.includes(r) ? r : 'green';
  return h('span', { class: ['rating', `is-${rr}`, sm ? 'is-sm' : null], 'data-rating': rr }, glyph(ratingTone(rr), 12), h('span', {}, ratingLabel(rr)));
}
export function statusChip(s, env = envOf()) {
  const el = badge(statusLabel(s), statusTone(s, env));
  el.classList.add('risk-status-chip');
  el.dataset.status = String(s || '');
  return el;
}
export function domainChip(cat) {
  return h('span', { class: 'cat-chip', 'data-category': cat || '' }, svgIcon(DOMAIN_ICON[cat] || 'layers', 13), h('span', {}, domainLabel(cat)));
}
export function typeChip(type) {
  return h('span', { class: ['type-chip', `is-${String(type || 'unknown').toLowerCase()}`], 'data-type': type || '' }, svgIcon(TYPE_ICON[type] || 'alert-circle', 12), h('span', {}, typeLabel(type)));
}
export function channelChip(key) {
  return h('span', { class: 'channel-chip' }, svgIcon(CHANNEL_ICON[key] || 'bell', 11), h('span', {}, i18n.label('channel', key) || key));
}
/** Score number coloured by rating + its L×I position, as one compact group. */
export function scoreGroup(score, likelihood, impact, { badgeToo = true, sm = true } = {}) {
  const r = ratingOf(score);
  return h('span', { class: 'risk-score-group' },
    h('span', { class: 'risk-score-top' },
      h('span', { class: ['score-num', `is-${r}`], 'data-rating': r }, defaultFmt.num(num(score))),
      badgeToo ? ratingBadge(r, { sm }) : null),
    isNum(Number(likelihood)) && Number(likelihood) > 0 && Number(impact) > 0
      ? h('span', { class: 'risk-li', title: t('risk.common.liTitle', { l: defaultFmt.num(Number(likelihood)), i: defaultFmt.num(Number(impact)) }) }, numRun(`${defaultFmt.num(Number(likelihood))}×${defaultFmt.num(Number(impact))}`))
      : null);
}
/** Due date with the overdue tone (icon + word, never colour alone). */
export function dueCell(iso, overdue, { short = true } = {}) {
  if (!iso) return h('span', { class: 'risk-due is-none' }, t('risk.common.noDue'));
  return h('span', { class: ['risk-due', overdue ? 'is-overdue' : null] },
    glyph(overdue ? 'critical' : 'clock', 13),
    h('span', {}, defaultFmt.date(iso, { style: short ? 'short' : 'medium' })),
    overdue ? h('span', { class: 'risk-due-flag' }, t('risk.common.overdue')) : null);
}
/** Model confidence as a % or "not applicable" for manual entries. */
export function confidenceText(conf) {
  return conf == null || !Number.isFinite(Number(conf)) ? null : defaultFmt.pct(Math.round(Number(conf) * 100));
}
/** Input-data quality level chip: three segments + word (not a risk colour). */
export function dqChip(level, score = null) {
  const lv = ['high', 'medium', 'low'].includes(level) ? level : null;
  const filled = lv === 'high' ? 3 : lv === 'medium' ? 2 : lv === 'low' ? 1 : 0;
  const label = lv ? (i18n.label('dataQualityLevel', lv) || lv) : t('risk.common.notValidated');
  return h('span', { class: ['dq-chip', lv ? `is-${lv}` : 'is-none'], title: score != null ? t('risk.ov.dqScoreTitle', { score: defaultFmt.num(score), max: defaultFmt.num(100) }) : undefined },
    h('span', { class: 'dq-bars', 'aria-hidden': 'true' }, [0, 1, 2].map((i) => h('span', { class: i < filled ? 'is-on' : null }))),
    h('span', {}, label));
}
export function writebackChip(task, env = envOf()) {
  const wb = (task && task.writeback) || {};
  const st = ['synced', 'pending', 'failed'].includes(wb.status) ? wb.status : '';
  const demo = statusApi.mode(stateOf(env)) === 'demo' || wb.simulated === true;
  const label = st ? (i18n.label('writeback', st) || st) : t('risk.tr.wbNone');
  return h('span', { class: 'writeback-chip', 'data-status': st || undefined },
    h('span', {}, label),
    demo && st ? h('span', { class: 'sim-tag' }, t('risk.common.simulated')) : null);
}

/* ────────────────────────────── feedback helpers ────────────────────────────── */

/** Bilingual message of a store failure ({ ok:false, reason, message, messageEn }). */
export function failText(res, fallbackKey = 'risk.err.generic') {
  if (res && res.reason && i18n.has(`risk.err.${res.reason}`)) return t(`risk.err.${res.reason}`);
  if (res && (res.message || res.messageEn)) return isEn() ? (res.messageEn || t(fallbackKey)) : (res.message || t(fallbackKey));
  return t(fallbackKey);
}
/** Field errors from the store ([{ field, code, message, messageEn }]) → [{ field, message }] in the active language. */
export function fieldErrors(errors, map = {}) {
  return arr(errors).map((e) => {
    const field = map[e.field] || e.field;
    const key = `risk.err.field.${e.field}.${e.code}`;
    const message = i18n.has(key) ? t(key, errParams()) : (isEn() ? (e.messageEn || e.message) : (e.message || e.messageEn));
    return { field, message: message || t('risk.err.generic') };
  });
}

/** Numbers used in validation copy, formatted in the active numeral system. */
export function errParams() { return { n: defaultFmt.num(5), a: defaultFmt.num(1), b: defaultFmt.num(5), mb: defaultFmt.num(25) }; }

/* ────────────────────────────── inline forms ────────────────────────────── */

let formUid = 0;

/** Show [{ field, message }] on a form: .field.is-invalid + .field-error + aria, summary, focus first. */
export function showErrors(form, errors, { summary = null, focus = true } = {}) {
  clearErrors(form);
  const list = arr(errors);
  let first = null;
  for (const err of list) {
    const field = form.querySelector(`[data-name="${cssEscape(err.field)}"]`) || form.querySelector(`[data-field="${cssEscape(err.field)}"]`);
    if (!field) continue;
    field.classList.add('is-invalid');
    const id = `ferr-${++formUid}`;
    const msg = h('p', { class: 'field-error', id }, glyph('critical', 14), h('span', {}, err.message));
    field.appendChild(msg);
    const controls = field.querySelectorAll('input, select, textarea');
    controls.forEach((c) => {
      c.setAttribute('aria-invalid', 'true');
      const prev = c.getAttribute('aria-describedby');
      c.setAttribute('aria-describedby', prev ? `${prev} ${id}` : id);
      c.dataset.errId = id;
    });
    if (!first && controls[0]) first = controls[0];
  }
  const unplaced = list.filter((err) => !form.querySelector(`[data-name="${cssEscape(err.field)}"], [data-field="${cssEscape(err.field)}"]`));
  if (summary || unplaced.length) {
    const box = h('div', { class: 'form-error-summary', role: 'alert' }, glyph('critical', 18),
      h('div', {}, summary ? h('p', {}, summary) : null, unplaced.length ? h('ul', {}, unplaced.map((e) => h('li', {}, e.message))) : null));
    form.insertBefore(box, form.firstChild);
  }
  if (focus && first) { try { first.focus({ preventScroll: false }); } catch { first.focus(); } }
}
export function clearErrors(form) {
  if (!form) return;
  form.querySelectorAll('.form-error-summary').forEach((n) => n.remove());
  form.querySelectorAll('.field-error').forEach((n) => n.remove());
  form.querySelectorAll('.is-invalid').forEach((n) => n.classList.remove('is-invalid'));
  form.querySelectorAll('[aria-invalid="true"]').forEach((c) => {
    c.removeAttribute('aria-invalid');
    const id = c.dataset.errId;
    if (id) {
      const rest = (c.getAttribute('aria-describedby') || '').split(/\s+/).filter((x) => x && x !== id).join(' ');
      if (rest) c.setAttribute('aria-describedby', rest); else c.removeAttribute('aria-describedby');
      delete c.dataset.errId;
    }
  });
}
const cssEscape = (v) => (typeof CSS !== 'undefined' && typeof CSS.escape === 'function' ? CSS.escape(String(v)) : String(v).replace(/["\\]/g, '\\$&'));

/**
 * Accessible 1–5 scale as a radio group (no default selection unless `value` is given).
 * kind: 'l' (likelihood) | 'i' (impact) — option words come from risk.scale.<kind>.<n>.
 */
export function scaleField({ name, label, kind = 'l', value = null, required = true, hint = '', onChange = null }) {
  const id = `scale-${++formUid}`;
  const hintId = hint ? `${id}-hint` : null;
  const fs = h('fieldset', { class: ['field', 'risk-scale-field', required ? 'is-required' : null], 'data-name': name });
  const legend = h('legend', { class: 'field-label', id: `${id}-legend` }, label);
  if (required) legend.appendChild(h('span', { class: 'field-req', 'aria-hidden': 'true' }, ' *'));
  fs.appendChild(legend);
  const group = h('div', { class: 'risk-scale', role: 'radiogroup', 'aria-labelledby': `${id}-legend`, 'aria-describedby': hintId || undefined, 'aria-required': required ? 'true' : undefined });
  for (let n = 1; n <= 5; n += 1) {
    const inputId = `${id}-${n}`;
    const input = h('input', { type: 'radio', name, id: inputId, value: String(n), class: 'risk-scale-input' });
    if (String(value) === String(n)) input.checked = true;
    if (typeof onChange === 'function') input.addEventListener('change', () => onChange(n));
    group.appendChild(h('label', { class: 'risk-scale-opt', for: inputId }, input,
      h('span', { class: 'risk-scale-face' }, h('span', { class: 'risk-scale-num num' }, defaultFmt.num(n)), h('span', { class: 'risk-scale-word' }, t(`risk.scale.${kind}.${n}`)))));
  }
  fs.appendChild(group);
  if (hint) fs.appendChild(h('p', { class: 'field-hint', id: hintId }, hint));
  return fs;
}

/** Read every named control of a form (radios → checked value or ''; checkboxes → boolean; files → File|null). */
export function readValues(form) {
  const out = {};
  if (!form) return out;
  form.querySelectorAll('input[name], select[name], textarea[name]').forEach((c) => {
    const n = c.name;
    if (c.type === 'radio') { if (!(n in out)) out[n] = ''; if (c.checked) out[n] = c.value; return; }
    if (c.type === 'checkbox') {
      if (c.value && c.value !== 'on') { if (!Array.isArray(out[n])) out[n] = []; if (c.checked) out[n].push(c.value); } else out[n] = c.checked;
      return;
    }
    if (c.type === 'file') { out[n] = c.files && c.files[0] ? c.files[0] : null; return; }
    out[n] = c.value;
  });
  return out;
}

/* ────────────────────────────── CSV export ────────────────────────────── */

export function exportCsv(env, rows, columns, filename) {
  try {
    if (env.sources && typeof env.sources.exportCSV === 'function') { env.sources.exportCSV(rows, columns, filename); return true; }
  } catch { /* fall through */ }
  return false;
}

/* ────────────────────────────── shared styles ────────────────────────────── */

const STYLE_TEXT = `
.risk-score-group { display: inline-flex; align-items: center; gap: 4px 6px; flex-wrap: wrap; }
.risk-score-top { display: inline-flex; align-items: center; gap: 6px; white-space: nowrap; }
.risk-score-group .score-num { font-size: var(--fs-md); min-inline-size: 2ch; }
.risk-li { font-family: var(--font-mono-mixed); font-size: 11px; color: var(--ink-3); padding: 0 5px; border: 1px solid var(--line); border-radius: 4px; background: var(--bg-2); white-space: nowrap; }
.risk-due { display: inline-flex; align-items: center; gap: 5px; white-space: nowrap; color: var(--ink-2); font-size: var(--fs-sm); }
.risk-due > svg { flex: none; color: var(--ink-3); }
.risk-due.is-overdue { color: var(--critical-text); font-weight: 500; }
.risk-due.is-overdue > svg { color: var(--critical-text); }
.risk-due-flag { font-size: 11px; padding: 0 6px; border-radius: 4px; border: 1px solid color-mix(in srgb, var(--critical) 45%, var(--line)); }
.risk-due.is-none { color: var(--ink-3); }
.dq-chip { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; color: var(--ink-2); white-space: nowrap; }
.dq-bars { display: inline-flex; gap: 2px; align-items: flex-end; }
.dq-bars > span { inline-size: 4px; block-size: 6px; border-radius: 1px; background: var(--line-2); }
.dq-bars > span:nth-child(2) { block-size: 9px; }
.dq-bars > span:nth-child(3) { block-size: 12px; }
.dq-bars > span.is-on { background: var(--accent); }
.dq-chip.is-low .dq-bars > span.is-on { background: var(--ink-3); }
.dq-chip.is-none { color: var(--ink-3); }
.risk-muted { color: var(--ink-3); }
.risk-status-chip { white-space: nowrap; }
.reg-chip { display: inline-flex; align-items: center; gap: 6px; min-block-size: 32px; padding: 0 10px; border-radius: 999px; border: 1px solid color-mix(in srgb, var(--brand) 45%, var(--line-2)); background: color-mix(in srgb, var(--brand) 10%, var(--bg-1)); color: var(--ink-1); font-size: var(--fs-sm); cursor: pointer; }
.reg-chip:hover { border-color: var(--brand); }
.reg-chip:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
.reg-chip > svg { inline-size: 12px; block-size: 12px; color: var(--ink-3); }
@media (pointer: coarse) { .reg-chip { min-block-size: 40px; } }
/* phones: filter selects stack under their label and may shrink (components.css keeps a 150px floor on .is-select;
   segmented groups take their own row there too, so no per-view rule is needed for them) */
@container main (max-width: 640px) {
  .reg-filter-bar .filter-bar-group.is-select, .tsk-filter-bar .filter-bar-group.is-select { flex-direction: column; align-items: stretch; gap: 4px; }
  .reg-filter-bar .filter-bar-group.is-select .field-control, .tsk-filter-bar .filter-bar-group.is-select .field-control { min-inline-size: 0; inline-size: 100%; }
}

/* inline forms (drawer, tasks) */
.risk-inline-form { display: grid; gap: var(--space-3); padding: var(--space-4); border: 1px solid var(--line-2); border-radius: var(--radius-md); background: var(--bg-2); }
.risk-inline-form .form-title { font-size: var(--fs-md); font-weight: 600; color: var(--ink-1); margin: 0; }
.risk-inline-form .form-intro { font-size: var(--fs-sm); color: var(--ink-2); margin: 0; line-height: 1.6; }
.risk-inline-form .form-actions { justify-content: flex-start; }
.risk-inline-form .field-control { background: var(--bg-1); }
.risk-form-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: var(--space-3); }
.risk-form-grid > .is-full { grid-column: 1 / -1; }
.risk-checks { display: flex; flex-wrap: wrap; gap: 8px 16px; border: 0; padding: 0; margin: 0; }
.risk-checks legend { font-size: var(--fs-sm); font-weight: 500; color: var(--ink-1); margin-block-end: 6px; padding: 0; }
.risk-check { display: inline-flex; align-items: center; gap: 8px; min-block-size: 40px; font-size: var(--fs-sm); color: var(--ink-1); cursor: pointer; }
.risk-check input { inline-size: 18px; block-size: 18px; accent-color: var(--brand); }

/* 1–5 scale */
.risk-scale-field { border: 0; padding: 0; margin: 0; min-inline-size: 0; }
.risk-scale-field > legend { padding: 0; margin-block-end: 6px; }
.risk-scale { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 6px; }
.risk-scale-opt { position: relative; display: block; cursor: pointer; min-inline-size: 0; }
.risk-scale-input { position: absolute; inset: 0; opacity: 0; margin: 0; cursor: pointer; }
.risk-scale-face { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2px; min-block-size: 52px; padding: 6px 4px; border: 1px solid var(--line-strong); border-radius: var(--radius-sm); background: var(--bg-1); text-align: center; transition: border-color var(--dur-micro) var(--ease-out), background-color var(--dur-micro) var(--ease-out); }
.risk-scale-num { font-size: var(--fs-lg); font-weight: 600; color: var(--ink-1); line-height: 1.1; }
.risk-scale-word { font-size: 11px; color: var(--ink-3); line-height: 1.25; overflow-wrap: anywhere; }
.risk-scale-opt:hover .risk-scale-face { border-color: var(--ink-3); }
.risk-scale-input:checked + .risk-scale-face { border-color: var(--brand); background: color-mix(in srgb, var(--brand) 14%, var(--bg-1)); box-shadow: inset 0 0 0 1px var(--brand); }
.risk-scale-input:checked + .risk-scale-face .risk-scale-word { color: var(--ink-1); }
.risk-scale-input:focus-visible + .risk-scale-face { outline: 2px solid var(--focus); outline-offset: 2px; }
.field.is-invalid .risk-scale-face { border-color: var(--critical); }
.risk-score-preview { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 12px; padding: 10px 12px; border-radius: var(--radius-sm); background: var(--bg-1); border: 1px dashed var(--line-2); font-size: var(--fs-sm); color: var(--ink-2); }
.risk-score-preview .score-num { font-size: var(--fs-xl); }

/* drawer */
.risk-drawer .drawer-sub { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 8px; }
.risk-drawer .drawer-panel { display: flex; flex-direction: column; gap: var(--space-5); }
.risk-sec { display: flex; flex-direction: column; gap: var(--space-3); min-inline-size: 0; }
.risk-sec-head { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 8px 12px; }
.risk-sec-title { font-size: var(--fs-lg); font-weight: 600; color: var(--ink-1); margin: 0; line-height: 1.3; }
.risk-sec-sub { font-size: var(--fs-sm); color: var(--ink-3); margin: 0; }
.risk-chips { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 8px; }
.risk-next { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; gap: 10px 16px; padding: 14px 16px; border-radius: var(--radius-md); border: 1px solid var(--line-2); border-inline-start: 3px solid var(--tone, var(--brand)); background: var(--bg-2); }
.risk-next-label { font-size: var(--fs-xs); color: var(--ink-3); text-transform: none; }
.risk-next-title { font-size: var(--fs-md); font-weight: 600; color: var(--ink-1); }
.risk-next-why { font-size: var(--fs-sm); color: var(--ink-2); }
@container drawer (max-width: 520px) { .risk-next { grid-template-columns: minmax(0, 1fr); } }
.risk-measures { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: var(--space-3); }
@container drawer (max-width: 700px) { .risk-measures { grid-template-columns: minmax(0, 1fr); } }
.risk-measure { display: flex; flex-direction: column; gap: 8px; padding: 14px; border-radius: var(--radius-md); border: 1px solid var(--line); background: var(--bg-1); min-inline-size: 0; }
.risk-measure-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.risk-measure-label { font-size: var(--fs-sm); font-weight: 500; color: var(--ink-2); display: inline-flex; align-items: center; gap: 6px; }
.risk-measure-label > svg { color: var(--ink-3); }
.risk-measure-value { display: flex; align-items: baseline; flex-wrap: wrap; gap: 6px 10px; }
.risk-measure-value .big { font-size: var(--fs-2xl); font-weight: 600; color: var(--ink-1); font-variant-numeric: tabular-nums; line-height: 1.1; }
.risk-measure-value .big.score-num { font-size: var(--fs-2xl); }
.risk-measure-help { font-size: 12px; color: var(--ink-3); line-height: 1.5; margin: 0; }
.risk-measure-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 4px; font-size: 12px; color: var(--ink-2); }
.risk-measure-list li { display: flex; gap: 6px; align-items: flex-start; }
.risk-measure-list li > svg { flex: none; margin-block-start: 2px; color: var(--ink-3); }
.risk-matrix { display: grid; grid-template-columns: auto repeat(5, 16px); grid-auto-rows: 16px; gap: 2px; align-items: center; direction: ltr; }
.risk-matrix-cell { inline-size: 16px; block-size: 16px; border-radius: 3px; background: var(--bg-3); border: 1px solid var(--line); }
.risk-matrix-cell.is-band-red { background: color-mix(in srgb, var(--critical) 18%, var(--bg-2)); }
.risk-matrix-cell.is-band-yellow { background: color-mix(in srgb, var(--warning) 16%, var(--bg-2)); }
.risk-matrix-cell.is-band-green { background: color-mix(in srgb, var(--good) 14%, var(--bg-2)); }
.risk-matrix-cell.is-here { background: var(--ink-1); border-color: var(--ink-1); box-shadow: 0 0 0 2px var(--bg-1), 0 0 0 3px var(--ink-1); }
.risk-matrix-cell.is-residual { background: transparent; border: 2px dashed var(--ink-2); }
.risk-matrix-axis { font-size: 10px; color: var(--ink-3); font-family: var(--font-mono-mixed); text-align: center; }
.risk-matrix-wrap { display: flex; align-items: flex-end; gap: 10px; flex-wrap: wrap; }
.risk-matrix-legend { display: flex; flex-direction: column; gap: 4px; font-size: 11px; color: var(--ink-3); }
.risk-matrix-legend span { display: inline-flex; align-items: center; gap: 6px; }
.risk-matrix-legend i { display: inline-block; inline-size: 10px; block-size: 10px; border-radius: 2px; background: var(--ink-1); }
.risk-matrix-legend i.is-residual { background: transparent; border: 2px dashed var(--ink-2); }
.risk-meter { position: relative; block-size: 8px; border-radius: 999px; background: var(--bg-3); overflow: hidden; }
.risk-meter > span { position: absolute; inset-block: 0; inset-inline-start: 0; border-radius: inherit; background: var(--accent); }
.risk-segs { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 3px; }
.risk-segs > span { block-size: 8px; border-radius: 2px; background: var(--bg-3); }
.risk-segs > span.is-on { background: var(--accent); }
.risk-segs.is-low > span.is-on { background: var(--ink-3); }
.risk-residual { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 14px; padding: 12px 14px; border-radius: var(--radius-md); border: 1px solid var(--line); background: var(--bg-1); }
.risk-residual.is-none { border-style: dashed; color: var(--ink-2); font-size: var(--fs-sm); }
.risk-explain { font-size: var(--fs-md); line-height: 1.7; color: var(--ink-1); margin: 0; overflow-wrap: anywhere; }
.risk-drawer .kv { row-gap: 2px; }
.risk-lc { border: 1px solid var(--line); border-radius: var(--radius-md); background: var(--bg-1); }
.risk-lc > summary { list-style: none; cursor: pointer; display: grid; gap: 8px; padding: 12px 14px; border-radius: inherit; }
.risk-lc > summary::-webkit-details-marker { display: none; }
.risk-lc > summary:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
.risk-lc-top { display: flex; align-items: center; justify-content: space-between; gap: 8px; flex-wrap: wrap; }
.risk-lc-title { font-size: var(--fs-sm); font-weight: 600; color: var(--ink-1); }
.risk-lc-current { font-size: var(--fs-sm); color: var(--ink-2); }
.risk-lc-toggle { display: inline-flex; align-items: center; gap: 4px; font-size: 12px; color: var(--brand-text); }
.risk-lc[open] .risk-lc-toggle svg { transform: rotate(180deg); }
.risk-lc-bar { display: grid; grid-template-columns: repeat(12, minmax(0, 1fr)); gap: 3px; }
.risk-lc-bar > span { block-size: 6px; border-radius: 2px; background: var(--bg-3); }
.risk-lc-bar > span[data-state="done"] { background: var(--brand); }
.risk-lc-bar > span[data-state="current"] { background: color-mix(in srgb, var(--brand) 45%, var(--bg-3)); box-shadow: inset 0 0 0 1px var(--brand); }
.risk-lc-bar > span[data-state="skipped"] { background: repeating-linear-gradient(90deg, var(--line-2) 0 3px, transparent 3px 6px); }
.risk-lc > .lifecycle { padding: 4px 14px 14px; }
.risk-rec { display: flex; flex-direction: column; gap: 10px; padding: 14px; border-radius: var(--radius-md); border: 1px solid var(--line); background: var(--bg-1); }
.risk-rec-action { font-size: var(--fs-md); font-weight: 500; color: var(--ink-1); line-height: 1.6; margin: 0; }
.risk-rec-why { font-size: var(--fs-sm); color: var(--ink-2); line-height: 1.6; margin: 0; }
.risk-rec-alts { margin: 0; padding-inline-start: 18px; font-size: var(--fs-sm); color: var(--ink-2); display: grid; gap: 4px; }
.risk-actions { display: flex; flex-wrap: wrap; gap: 8px; }
.risk-reason { font-size: 12px; color: var(--ink-3); margin: 0; display: flex; gap: 6px; align-items: flex-start; }
.risk-reason > svg { flex: none; margin-block-start: 2px; }
.risk-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
.risk-list-item { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 6px 12px; align-items: center; padding: 10px 12px; border-radius: var(--radius-md); border: 1px solid var(--line); background: var(--bg-1); }
.risk-list-main { display: flex; flex-direction: column; gap: 4px; min-inline-size: 0; }
.risk-list-title { font-size: var(--fs-sm); font-weight: 500; color: var(--ink-1); overflow-wrap: anywhere; }
.risk-list-meta { display: flex; flex-wrap: wrap; gap: 4px 10px; align-items: center; font-size: 12px; color: var(--ink-3); }
@container drawer (max-width: 520px) { .risk-list-item { grid-template-columns: minmax(0, 1fr); } }
.risk-hist-toolbar { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 8px; }
.risk-drawer .timeline-text .code { font-size: .95em; }
.risk-drawer .evidence-excerpt { margin: 0; }
.risk-ev-checks { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 8px; }
.risk-ev-check { display: flex; flex-direction: column; gap: 2px; padding: 10px 12px; border-radius: var(--radius-sm); border: 1px solid var(--line); background: var(--bg-1); }
.risk-ev-check .k { font-size: 12px; color: var(--ink-3); }
.risk-ev-check .v { font-size: var(--fs-lg); font-weight: 600; color: var(--ink-1); font-variant-numeric: tabular-nums; }
.risk-file-input { font-size: var(--fs-sm); color: var(--ink-2); }
@media (max-width: 479.98px) {
  .risk-drawer .drawer-tab > svg, .risk-drawer .drawer-tab > .icon { display: none; }
  .risk-drawer .drawer-tab { padding-inline: 10px; }
}
@media (prefers-reduced-motion: reduce) { .risk-scale-face { transition: none; } }
`;

export function ensureStyles() {
  if (typeof document === 'undefined' || document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = STYLE_TEXT;
  document.head.appendChild(style);
}

/* ────────────────────────────── URL (?risk=) ────────────────────────────── */

/** Merge params into the current hash query (history.replaceState; history.state kept for the router). */
export function patchHashParams(patch) {
  try {
    const hash = location.hash || '#/';
    const q = hash.indexOf('?');
    const path = q === -1 ? hash : hash.slice(0, q);
    const params = new URLSearchParams(q === -1 ? '' : hash.slice(q + 1));
    for (const [k, v] of Object.entries(patch || {})) {
      if (v === null || v === undefined || v === '' || v === 'all' || v === false) params.delete(k);
      else params.set(k, String(v));
    }
    const qs = params.toString();
    const next = qs ? `${path}?${qs}` : path;
    if (next !== hash) history.replaceState(history.state, '', next);
  } catch { /* sandboxed */ }
}
export function hashParams() {
  try {
    const hash = location.hash || '';
    const q = hash.indexOf('?');
    return q === -1 ? {} : Object.fromEntries(new URLSearchParams(hash.slice(q + 1)));
  } catch { return {}; }
}
function routeId() {
  try { return ((location.hash || '').replace(/^#\/?/, '').split('?')[0]) || ''; } catch { return ''; }
}

/* ────────────────────────────── the drawer ────────────────────────────── */

let active = null;

/** Currently open risk drawer (id + api) or null. */
export function activeRiskDrawer() { return active && active.api && active.api.isOpen() ? { riskId: active.riskId, api: active.api } : null; }

/** Close the shared drawer if it is open. */
export function closeRiskDrawer(reason = 'action') { if (active && active.api) { try { active.api.close(reason); } catch { /* ignore */ } } }

/**
 * Open the risk drawer. Returns the drawer api, or null when the risk does not exist (a warning toast is
 * shown and ?risk= is removed). `tab`: 'overview' | 'evidence' | 'treatment' | 'history'.
 */
export function openRiskDrawer(ctx = {}, riskId, { onClose = null, returnFocus = null, tab = null, urlParam = true, focusForm = null } = {}) {
  ensureStyles();
  const env = envOf(ctx);
  const risk = findRisk(env, riskId);
  if (!risk) {
    toast(t('risk.drawer.notFound'), { tone: 'warning' });
    if (urlParam) patchHashParams({ risk: null });
    return null;
  }
  if (active && active.api && active.api.isOpen()) {
    const same = active.riskId === risk.id;
    active.riskId = risk.id;
    active.env = env;
    if (typeof onClose === 'function') active.onClose = onClose;
    if (returnFocus) active.returnFocus = returnFocus;
    if (!same) { active.forms.clear(); active.sig = ''; }
    if (urlParam) { active.urlParam = true; patchHashParams({ risk: risk.code || risk.id }); }
    refresh(active, { force: true, all: true });
    if (tab) active.api.setTab(tab, { focus: false });
    if (focusForm) openForm(active, focusForm);
    return active.api;
  }

  const st = {
    riskId: risk.id, env, onClose, returnFocus, urlParam, forms: new Map(), sig: '', raf: 0, unsubs: [], api: null, route: routeId(),
  };
  const tabs = [
    { id: 'overview', label: t('risk.tab.overview'), icon: 'info', render: (panel) => renderPanel(st, 'overview', panel) },
    { id: 'evidence', label: t('risk.tab.evidence'), icon: 'link', count: evidenceCount(risk), render: (panel) => renderPanel(st, 'evidence', panel) },
    { id: 'treatment', label: t('risk.tab.treatment'), icon: 'shield-check', render: (panel) => renderPanel(st, 'treatment', panel) },
    { id: 'history', label: t('risk.tab.history'), icon: 'clock', count: timelineOf(st, risk).length, render: (panel) => renderPanel(st, 'history', panel) },
  ];
  const api = drawer({
    title: prose(riskTitle(risk)),
    subtitle: ' ',
    tabs,
    activeTab: tab || null,
    kind: 'airisk',
    size: 'lg',
    className: 'risk-drawer',
    returnFocus: returnFocus || null,
    onClose: (reason) => {
      const was = active === st;
      st.unsubs.splice(0).forEach((u) => { try { u(); } catch { /* ignore */ } });
      if (st.raf) { cancelAnimationFrame(st.raf); st.raf = 0; }
      if (was) active = null;
      if (st.urlParam && USER_CLOSE.has(reason) && routeId() === st.route) patchHashParams({ risk: null });
      if (typeof st.onClose === 'function') { try { st.onClose(reason, st.riskId); } catch { /* the caller owns its errors */ } }
    },
  });
  st.api = api;
  active = st;
  paintHead(st, risk);
  // Track inline-form input so a live refresh never loses what the reader typed.
  api.el.addEventListener('input', (e) => rememberInput(st, e.target));
  api.el.addEventListener('change', (e) => rememberInput(st, e.target));

  st.unsubs.push(env.bus.on('store:change', (payload) => {
    const path = payload && typeof payload.path === 'string' ? payload.path : '*';
    if (path !== '*' && !/^(platform\.(aiRisks|tasks|alerts)|settings|sites)/.test(path)) return;
    schedule(st);
  }));
  st.unsubs.push(env.bus.on('ui:route-leave', () => { try { api.close('navigate'); } catch { /* ignore */ } }));
  st.sig = signature(st);
  api.open();
  if (urlParam) patchHashParams({ risk: risk.code || risk.id });
  if (focusForm) openForm(st, focusForm);
  return api;
}

function findRisk(env, id) {
  if (id === null || id === undefined || id === '') return null;
  try { return env.psel.riskById(stateOf(env), String(id)); } catch { return arr(stateOf(env).platform && stateOf(env).platform.aiRisks).find((r) => r && (r.id === id || r.code === id)) || null; }
}
function currentRisk(st) { return findRisk(st.env, st.riskId); }
function tasksOf(st, risk) {
  const tasks = arr(stateOf(st.env).platform && stateOf(st.env).platform.tasks);
  return tasks.filter((x) => x && (x.riskId === risk.id || x.id === risk.taskId)).sort((a, b) => (Date.parse(a.createdAt) || 0) - (Date.parse(b.createdAt) || 0));
}
function alertsOf(st, risk) {
  try { return arr(st.env.psel.alertsForRisk(stateOf(st.env), risk.id)); } catch { return []; }
}
function evidenceCount(risk) { return arr(risk && risk.treatment && risk.treatment.evidence).length + (risk && risk.evidence ? 1 : 0); }
function timelineOf(st, risk) { try { return arr(st.env.psel.riskTimeline(risk, stateOf(st.env))); } catch { return arr(risk.history); } }

function signature(st) {
  const risk = currentRisk(st);
  if (!risk) return 'gone';
  const tasks = tasksOf(st, risk).map((x) => [x.id, x.status, x.owner, x.dueDate, x.updatedAt, x.writeback && x.writeback.status, x.writeback && x.writeback.at, arr(x.attachments).length].join(':'));
  const alerts = alertsOf(st, risk).map((a) => `${a.id}:${a.acknowledged ? 1 : 0}`);
  const s = stateOf(st.env).settings || {};
  return [risk.updatedAt, risk.status, risk.owner, risk.dueDate, risk.escalated, risk.residualLikelihood, risk.residualImpact, arr(risk.history).length,
    arr(risk.treatment && risk.treatment.evidence).length, tasks.join('|'), alerts.join('|'), JSON.stringify((s.platform || {}).channels || {}), s.numerals].join('#');
}

function schedule(st) {
  if (st.raf || !st.api || !st.api.isOpen()) return;
  st.raf = requestAnimationFrame(() => { st.raf = 0; refresh(st); });
}

function refresh(st, { force = false, all = false } = {}) {
  if (!st.api || !st.api.isOpen()) return;
  const risk = currentRisk(st);
  if (!risk) { toast(t('risk.drawer.gone'), { tone: 'warning' }); st.api.close('gone'); return; }
  const sig = signature(st);
  if (!force && sig === st.sig) return;
  st.sig = sig;
  paintHead(st, risk);
  st.api.setTabCount('evidence', evidenceCount(risk));
  st.api.setTabCount('history', timelineOf(st, risk).length);
  const focus = captureFocus(st);
  const activeTab = st.api.activeTab;
  ['overview', 'evidence', 'treatment', 'history'].forEach((id) => { if (all || id !== activeTab) st.api.refreshTab(id); });
  if (!all) st.api.refreshTab(activeTab);
  restoreFocus(st, focus);
}

function paintHead(st, risk) {
  st.api.setTitle(prose(riskTitle(risk)));
  const sub = st.api.el.querySelector('.drawer-sub');
  if (sub) {
    clear(sub);
    sub.append(codeSpan(risk.code || risk.id), h('span', { 'aria-hidden': 'true' }, '·'), h('span', {}, siteName(stateOf(st.env), risk.projectId)), h('span', { 'aria-hidden': 'true' }, '·'), h('span', {}, domainLabel(risk.category)));
  }
}

function captureFocus(st) {
  const a = document.activeElement;
  if (!a || !st.api.el.contains(a)) return null;
  const form = a.closest('[data-form]');
  if (form && a.name) return { form: form.dataset.form, name: a.name, value: a.type === 'radio' ? a.value : null };
  if (a.dataset && a.dataset.focusKey) return { key: a.dataset.focusKey };
  return null;
}
function restoreFocus(st, f) {
  if (!f) return;
  let target = null;
  if (f.form) {
    const form = st.api.el.querySelector(`[data-form="${cssEscape(f.form)}"]`);
    if (form) target = f.value !== null ? form.querySelector(`[name="${cssEscape(f.name)}"][value="${cssEscape(f.value)}"]`) : form.querySelector(`[name="${cssEscape(f.name)}"]`);
  } else if (f.key) target = st.api.el.querySelector(`[data-focus-key="${cssEscape(f.key)}"]`);
  if (target) { try { target.focus({ preventScroll: true }); } catch { target.focus(); } }
}

function rememberInput(st, el) {
  if (!el || !el.name) return;
  const form = el.closest && el.closest('[data-form]');
  if (!form) return;
  const id = form.dataset.form;
  const entry = st.forms.get(id) || { open: true, values: {} };
  if (el.type === 'checkbox') {
    if (el.value && el.value !== 'on') {
      const set = new Set(arr(entry.values[el.name]));
      if (el.checked) set.add(el.value); else set.delete(el.value);
      entry.values[el.name] = Array.from(set);
    } else entry.values[el.name] = el.checked;
  } else if (el.type === 'file') {
    // file metadata only; the File object itself cannot be restored into an input
    entry.file = el.files && el.files[0] ? el.files[0] : null;
  } else if (el.type !== 'radio' || el.checked) entry.values[el.name] = el.value;
  st.forms.set(id, entry);
}

function openForm(st, id) {
  st.forms.set(id, { open: true, values: (st.forms.get(id) || {}).values || {} });
  const map = { accept: 'treatment', override: 'treatment', dismiss: 'treatment', assign: 'treatment', escalate: 'treatment', residual: 'treatment', close: 'treatment', reopen: 'treatment', evidence: 'evidence' };
  const tab = map[id] || 'treatment';
  if (st.api.activeTab !== tab) st.api.setTab(tab, { focus: false });
  else st.api.refreshTab(tab);
  requestAnimationFrame(() => {
    const form = st.api.el.querySelector(`[data-form="${cssEscape(id)}"]`);
    if (!form) return;
    try { form.scrollIntoView({ block: 'nearest', behavior: motion.enabled() ? 'smooth' : 'auto' }); } catch { /* ignore */ }
    const first = form.querySelector('input:not([type="hidden"]):not([disabled]), select, textarea');
    if (first) { try { first.focus({ preventScroll: true }); } catch { first.focus(); } }
  });
}
function closeForm(st, id) {
  st.forms.delete(id);
  st.api.refreshTab(st.api.activeTab);
  requestAnimationFrame(() => {
    const opener = st.api.el.querySelector(`[data-focus-key="open-${cssEscape(id)}"]`);
    if (opener) { try { opener.focus({ preventScroll: true }); } catch { opener.focus(); } }
  });
}

/* ── panel rendering ── */

function renderPanel(st, tab, panel) {
  const risk = currentRisk(st);
  if (!risk) return emptyState({ title: t('risk.drawer.gone') });
  const frag = document.createDocumentFragment();
  const build = { overview: renderOverview, evidence: renderEvidence, treatment: renderTreatment, history: renderHistory }[tab];
  try { frag.appendChild(build(st, risk, panel)); } catch (err) {
    frag.appendChild(components.errorState({ title: t('risk.drawer.renderError'), text: t('risk.drawer.renderErrorText'), retry: () => st.api.refreshTab(tab) }));
  }
  return frag;
}

function section(title, { sub = null, actions = null, id = null } = {}, ...children) {
  const head = h('div', { class: 'risk-sec-head' }, h('div', {}, h('h3', { class: 'risk-sec-title t-card', id: id || undefined }, title), sub ? h('p', { class: 'risk-sec-sub' }, sub) : null), actions);
  return h('section', { class: 'risk-sec', 'aria-labelledby': id || undefined }, head, ...children);
}

/* ── Overview ── */

function renderOverview(st, risk) {
  const env = st.env;
  const state = stateOf(env);
  const now = nowOf(env);
  const wrap = h('div', { class: 'risk-ov stack gap-5' });
  const open = !TERMINAL.includes(risk.status);
  const score = num(risk.score);
  const rating = ratingOf(score, env);
  const overdue = open && risk.dueDate && dateMs(risk.dueDate) < startOfToday(env);

  // header chips
  wrap.appendChild(h('div', { class: 'risk-chips', role: 'group', 'aria-label': t('risk.ov.classification') },
    ratingBadge(rating), statusChip(risk.status, env), domainChip(risk.category), typeChip(risk.type),
    risk.escalated ? badge(t('risk.ov.escalated'), 'critical', { icon: 'bell' }) : null,
    risk.origin === 'manual' ? badge(t('risk.ov.manual'), 'neutral', { icon: 'pencil' }) : null,
    overdue ? badge(t('risk.common.overdue'), 'critical', { icon: 'clock' }) : null));

  // next action
  let next = null;
  try { next = env.psel.nextAction(risk, state, now); } catch { next = null; }
  if (next) {
    const key = next.key || 'none';
    const tone = next.tone || 'neutral';
    const handler = nextHandler(st, risk, key);
    wrap.appendChild(h('div', { class: 'risk-next', style: { '--tone': `var(--${tone === 'neutral' ? 'line-2' : tone})` } },
      h('div', { class: 'stack gap-1' },
        h('span', { class: 'risk-next-label t-label' }, t('risk.ov.nextAction')),
        h('span', { class: 'risk-next-title' }, t(`risk.next.${key}.label`)),
        h('span', { class: 'risk-next-why' }, t(`risk.next.${key}.why`))),
      handler ? button(t(`risk.next.${key}.cta`), { variant: key === 'escalate' ? 'danger' : 'primary', icon: handler.icon, onClick: handler.run, attrs: { 'data-focus-key': 'next-action' } }) : null));
  }

  // three distinct measures
  wrap.appendChild(h('div', { class: 'risk-measures' },
    severityMeasure(risk, env), confidenceMeasure(risk, env), dataQualityMeasure(risk, env)));

  // residual
  wrap.appendChild(residualBlock(st, risk));

  // explanation
  const explanation = text(riskField(risk, 'driverExplanation')) || text(riskField(risk, 'description'));
  wrap.appendChild(section(t('risk.ov.explanation'), { id: 'risk-ov-explain' },
    explanation ? h('p', { class: 'risk-explain' }, ...withCodes(explanation)) : h('p', { class: 'risk-muted text-sm' }, t('risk.ov.explanationNone'))));

  // details
  const ev = risk.evidence || {};
  const detailPairs = [
    [t('risk.ov.source'), h('span', {}, sourceLabel(ev.sourceSystem || (risk.origin === 'manual' ? 'إدخال يدوي' : null)))],
    [t('risk.ov.project'), siteName(state, risk.projectId)],
    [t('risk.ov.owner'), risk.owner ? person(risk.owner) : h('span', { class: 'risk-muted' }, t('risk.common.unassigned'))],
    [t('risk.ov.due'), dueCell(risk.dueDate, overdue, { short: false })],
    [t('risk.ov.detected'), h('span', { title: defaultFmt.relative(risk.detectedAt) }, defaultFmt.dateTime(risk.detectedAt))],
    [t('risk.ov.updated'), h('span', { title: defaultFmt.dateTime(risk.updatedAt) }, defaultFmt.relative(risk.updatedAt))],
    [t('risk.ov.engine'), risk.origin === 'manual' ? t('risk.ov.engineManual') : h('span', { class: 'row gap-2 wrap' }, h('span', {}, i18n.label('pipeline', risk.pipeline) || risk.pipeline), risk.modelVersion ? h('span', { class: 'mono', dir: 'ltr' }, risk.modelVersion) : null)],
    [t('risk.ov.stakeholders'), arr(risk.stakeholders).length ? arr(risk.stakeholders).map((r) => i18n.label('stakeholderRole', r) || r).join(t('risk.common.listSep')) : '—'],
  ];
  const mapRow = siteMapRow(st, risk, state);
  if (mapRow) detailPairs.push(mapRow);
  const details = kv(detailPairs);
  details.classList.add('is-compact');
  wrap.appendChild(section(t('risk.ov.details'), { id: 'risk-ov-details' }, details));

  // lifecycle
  wrap.appendChild(lifecycleBlock(st, risk));
  return wrap;
}

/**
 * "Show on site map": deep link into the site spatial view when the data places the risk (its zone, the zone of
 * the HSE register risk it names, or at least its site). Nothing is guessed; no target → no row.
 */
function siteMapRow(st, risk, state) {
  let target = null;
  try { target = spatialTargetForAiRisk(state, risk); } catch { target = null; }
  if (!target) return null;
  const params = { site: target.site, zone: target.zone || null, risk: target.risk || null };
  const note = target.via ? t('risk.ov.showOnMapVia', { code: target.via }) : (target.zone ? null : t('risk.ov.showOnMapSite'));
  return [t('risk.ov.siteMap'), h('span', { class: 'stack gap-1' },
    button(t('risk.ov.showOnMap'), { variant: 'outline', size: 'sm', icon: 'map-pin', onClick: () => navigateTo(st, 'spatial', params), attrs: { 'data-focus-key': 'show-on-map', style: 'align-self: flex-start' } }),
    note ? h('span', { class: 'risk-muted text-sm' }, ...withCodes(note)) : null)];
}

function nextHandler(st, risk, key) {
  const go = (formId) => () => openForm(st, formId);
  switch (key) {
    case 'review': return { icon: 'check', run: () => { st.api.setTab('treatment', { focus: false }); requestAnimationFrame(() => { const el = st.api.el.querySelector('#risk-tr-rec'); if (el) { try { el.scrollIntoView({ block: 'start' }); } catch { /* ignore */ } } const b = st.api.el.querySelector('[data-focus-key="open-accept"], [data-focus-key="open-override"]'); if (b) b.focus({ preventScroll: true }); }); } };
    case 'escalate': return { icon: 'bell', run: go('escalate') };
    case 'assign': return { icon: 'user', run: go('assign') };
    case 'add-evidence': return { icon: 'link', run: go('evidence') };
    case 'assess-residual': return { icon: 'sliders', run: go('residual') };
    case 'close': return { icon: 'check-circle', run: go('close') };
    case 'start-treatment':
    case 'follow-up-overdue': {
      const task = tasksOf(st, risk).find((x) => x.status !== TASK_CLOSED);
      if (!task) return { icon: 'user', run: go('assign') };
      return { icon: 'file-check', run: () => navigateTo(st, 'tasks', { id: task.id }) };
    }
    default: return null;
  }
}

function navigateTo(st, id, params) {
  const r = st.env.router;
  try { st.api.close('navigate'); } catch { /* ignore */ }
  if (r && typeof r.navigate === 'function') r.navigate(id, params);
  else { try { location.hash = `#/${id}?${new URLSearchParams(params).toString()}`; } catch { /* ignore */ } }
}

function measure(icon, label, valueNode, ...rest) {
  return h('div', { class: 'risk-measure' },
    h('div', { class: 'risk-measure-head' }, h('span', { class: 'risk-measure-label' }, svgIcon(icon, 14), h('span', {}, label))),
    valueNode, ...rest);
}

function severityMeasure(risk, env) {
  const score = num(risk.score);
  const r = ratingOf(score, env);
  const l = num(risk.likelihood, NaN);
  const i = num(risk.impact, NaN);
  const hasLI = l >= 1 && i >= 1;
  const rl = num(risk.residualLikelihood, NaN);
  const ri = num(risk.residualImpact, NaN);
  const hasRes = rl >= 1 && ri >= 1;
  const value = h('div', { class: 'risk-measure-value' },
    h('span', { class: ['big', 'score-num', `is-${r}`] }, numRun(`${defaultFmt.num(score)}/${defaultFmt.num(100)}`)),
    ratingBadge(r));
  const matrix = hasLI ? liMatrix(l, i, hasRes ? rl : null, hasRes ? ri : null) : null;
  return measure('shield-alert', t('risk.ov.severity'), value,
    hasLI ? h('p', { class: 'risk-measure-help' }, t('risk.ov.severityFormula', { l: defaultFmt.num(l), i: defaultFmt.num(i), k: defaultFmt.num(4), lw: t(`risk.scale.l.${l}`), iw: t(`risk.scale.i.${i}`) })) : null,
    matrix,
    h('p', { class: 'risk-measure-help' }, t('risk.ov.severityHelp', { min: defaultFmt.num(0), max: defaultFmt.num(100) })));
}

/** 5×5 likelihood (x) × impact (y) position; the dark cell is the inherent position, the dashed one the residual. */
function liMatrix(l, i, rl, ri) {
  const grid = h('div', { class: 'risk-matrix', role: 'img', 'aria-label': t('risk.ov.matrixAria', { l: defaultFmt.num(l), i: defaultFmt.num(i) }) + (rl ? ` ${t('risk.ov.matrixAriaResidual', { l: defaultFmt.num(rl), i: defaultFmt.num(ri) })}` : '') });
  for (let row = 5; row >= 1; row -= 1) {
    grid.appendChild(h('span', { class: 'risk-matrix-axis', 'aria-hidden': 'true' }, defaultFmt.num(row)));
    for (let col = 1; col <= 5; col += 1) {
      const s = row * col * 4;
      const band = s >= 70 ? 'red' : s >= 40 ? 'yellow' : 'green';
      grid.appendChild(h('span', { class: ['risk-matrix-cell', `is-band-${band}`, col === l && row === i ? 'is-here' : null, rl && col === rl && row === ri && !(col === l && row === i) ? 'is-residual' : null] }));
    }
  }
  grid.appendChild(h('span', { 'aria-hidden': 'true' }));
  for (let col = 1; col <= 5; col += 1) grid.appendChild(h('span', { class: 'risk-matrix-axis', 'aria-hidden': 'true' }, defaultFmt.num(col)));
  const legend = h('div', { class: 'risk-matrix-legend', 'aria-hidden': 'true' },
    h('span', {}, t('risk.ov.matrixAxes')),
    h('span', {}, h('i'), t('risk.ov.matrixInherent')),
    rl ? h('span', {}, h('i', { class: 'is-residual' }), t('risk.ov.matrixResidual')) : null);
  return h('div', { class: 'risk-matrix-wrap' }, grid, legend);
}

function confidenceMeasure(risk, env) {
  const pct = confidenceText(risk.confidence);
  if (pct === null) {
    return measure('sparkle', t('risk.ov.confidence'),
      h('div', { class: 'risk-measure-value' }, h('span', { class: 'big risk-muted' }, t('risk.ov.confidenceNa'))),
      h('p', { class: 'risk-measure-help' }, t('risk.ov.confidenceNaHelp')));
  }
  const v = Math.round(num(risk.confidence) * 100);
  const demo = statusApi.pipeline(stateOf(env)) === 'demo';
  return measure('sparkle', t('risk.ov.confidence'),
    h('div', { class: 'risk-measure-value' }, h('span', { class: 'big' }, numRun(pct)), demo ? h('span', { class: 'sim-tag' }, t('risk.common.illustrative')) : null),
    h('div', { class: 'risk-meter', role: 'img', 'aria-label': t('risk.ov.confidenceAria', { pct }) }, h('span', { style: { inlineSize: `${Math.max(0, Math.min(100, v))}%` } })),
    h('p', { class: 'risk-measure-help' }, t('risk.ov.confidenceHelp')));
}

function dataQualityMeasure(risk, env) {
  const dq = dataQualityOf(risk, env);
  if (!dq) {
    return measure('badge-check', t('risk.ov.dq'), h('div', { class: 'risk-measure-value' }, h('span', { class: 'big risk-muted' }, t('risk.common.notValidated'))), h('p', { class: 'risk-measure-help' }, t('risk.ov.dqHelp')));
  }
  const lv = ['high', 'medium', 'low'].includes(dq.level) ? dq.level : null;
  const filled = lv === 'high' ? 3 : lv === 'medium' ? 2 : lv === 'low' ? 1 : 0;
  const issues = dq.issues.slice(0, 3);
  return measure('badge-check', t('risk.ov.dq'),
    h('div', { class: 'risk-measure-value' },
      h('span', { class: 'big' }, lv ? (i18n.label('dataQualityLevel', lv) || lv) : t('risk.common.notValidated')),
      dq.score != null ? h('span', { class: 'text-sm muted' }, numRun(`${defaultFmt.num(dq.score)}/${defaultFmt.num(100)}`)) : null),
    h('div', { class: ['risk-segs', lv ? `is-${lv}` : null], role: 'img', 'aria-label': t('risk.ov.dqAria', { level: lv ? i18n.label('dataQualityLevel', lv) : t('risk.common.notValidated') }) }, [0, 1, 2].map((k) => h('span', { class: k < filled ? 'is-on' : null }))),
    dq.sourceName ? h('p', { class: 'risk-measure-help' }, t('risk.ov.dqSource', { source: dq.sourceName })) : null,
    issues.length
      ? h('ul', { class: 'risk-measure-list', 'aria-label': t('risk.ov.dqIssues') }, issues.map((iss) => h('li', {}, glyph(iss.code === 'quarantine' ? 'warning' : 'neutral', 12), h('span', {}, ...withCodes(iss.text || iss.label)))))
      : h('p', { class: 'risk-measure-help' }, t('risk.ov.dqNoIssues')),
    h('p', { class: 'risk-measure-help' }, t('risk.ov.dqHelp')));
}

function residualBlock(st, risk) {
  const rl = num(risk.residualLikelihood, NaN);
  const ri = num(risk.residualImpact, NaN);
  const ra = risk.residualAssessment || null;
  if (rl >= 1 && ri >= 1) {
    const rs = rl * ri * 4;
    const r = ratingOf(rs, st.env);
    const why = ra ? (isEn() ? (text(ra.justificationEn) || text((riskField(risk, 'residualAssessment') || {}).justification) || text(ra.justification)) : text(ra.justification)) : '';
    return section(t('risk.ov.residual'), { id: 'risk-ov-residual' },
      h('div', { class: 'risk-residual' },
        h('span', { class: ['score-num', `is-${r}`], style: { fontSize: 'var(--fs-xl)' } }, numRun(`${defaultFmt.num(rs)}/${defaultFmt.num(100)}`)),
        ratingBadge(r),
        h('span', { class: 'risk-li' }, numRun(`${defaultFmt.num(rl)}×${defaultFmt.num(ri)}`)),
        h('span', { class: 'text-sm muted' }, t('risk.ov.residualVs', { score: defaultFmt.num(num(risk.score)) })),
        ra ? h('span', { class: 'text-xs muted' }, t('risk.ov.residualBy', { by: person(ra.by), at: defaultFmt.date(ra.at) })) : null),
      why ? h('p', { class: 'text-sm', style: { margin: 0, color: 'var(--ink-2)' } }, ...withCodes(why)) : null);
  }
  const open = !TERMINAL.includes(risk.status);
  return section(t('risk.ov.residual'), { id: 'risk-ov-residual' },
    h('div', { class: 'risk-residual is-none' }, glyph('neutral', 14), h('span', {}, t('risk.ov.residualNone')),
      open ? button(t('risk.ov.residualCta'), { variant: 'outline', size: 'sm', icon: 'sliders', onClick: () => openForm(st, 'residual') }) : null));
}

function lifecycleBlock(st, risk) {
  let stages = [];
  try { stages = arr(st.env.psel.lifecycle(risk, stateOf(st.env))); } catch { stages = []; }
  if (!stages.length) return h('div');
  const idx = stages.findIndex((s) => s.state === 'current');
  const doneCount = stages.filter((s) => s.state === 'done').length;
  const current = idx >= 0 ? stages[idx] : null;
  const details = h('details', { class: 'risk-lc' });
  const summary = h('summary', {},
    h('div', { class: 'risk-lc-top' },
      h('span', { class: 'risk-lc-title' }, t('risk.ov.lifecycle')),
      h('span', { class: 'risk-lc-toggle' }, h('span', {}, t('risk.ov.lifecycleToggle')), svgIcon('chevron-down', 14))),
    h('span', { class: 'risk-lc-current' }, current
      ? t('risk.ov.lifecycleCurrent', { n: defaultFmt.num(idx + 1), total: defaultFmt.num(stages.length), stage: t(`risk.lc.${current.key}`) })
      : t('risk.ov.lifecycleDone', { n: defaultFmt.num(doneCount), total: defaultFmt.num(stages.length) })),
    h('span', { class: 'risk-lc-bar', 'aria-hidden': 'true' }, stages.map((s) => h('span', { 'data-state': s.state }))));
  details.appendChild(summary);
  const ol = h('ol', { class: 'lifecycle is-vertical', 'aria-label': t('risk.ov.lifecycle') });
  stages.forEach((s) => {
    const meta = s.state === 'done' && (s.at || s.by)
      ? [s.at ? defaultFmt.date(s.at) : null, s.by ? stageActor(s.by) : null].filter(Boolean).join(' · ')
      : (s.state === 'skipped' ? t('risk.ov.stageSkipped') : (s.state === 'current' ? t('risk.ov.stageCurrent') : t('risk.ov.stagePending')));
    ol.appendChild(h('li', { class: 'lifecycle-step', 'data-state': s.state, 'aria-current': s.state === 'current' ? 'step' : undefined },
      h('span', { class: 'lifecycle-dot' }, s.state === 'done' ? glyph('good', 14) : null),
      h('span', { class: 'lifecycle-text' },
        h('span', { class: 'lifecycle-label' }, t(`risk.lc.${s.key}`)),
        h('span', { class: 'lifecycle-meta' }, meta),
        h('span', { class: 'sr-only' }, ` — ${t(`risk.lcState.${s.state}`)}`))));
  });
  details.appendChild(ol);
  return details;
}

/** Engine names and sources in "by" fields are enum values; people go through terms. */
function stageActor(by) {
  const label = i18n.label('pipeline', by);
  if (label && label !== by) return label;
  const src = i18n.label('sourceSystem', by);
  if (src && src !== by) return src;
  if (by === 'النظام') return t('risk.common.system');
  for (const p of ['contract-nlp', 'bom-forecast', 'schedule-model', 'site-ai', 'cost-forecast']) {
    try { if (defaultPsel.pipelineLabel(p) === by) return i18n.label('pipeline', p); } catch { /* ignore */ }
  }
  return person(by);
}

/* ── Evidence ── */

function renderEvidence(st, risk) {
  const env = st.env;
  const wrap = h('div', { class: 'stack gap-5' });
  const ev = risk.evidence || null;
  const evL = riskField(risk, 'evidence') || ev;

  // source evidence
  if (ev) {
    const url = safeHttpUrl(ev.link);
    const excerpt = text(evL && evL.excerpt);
    wrap.appendChild(section(t('risk.ev.source'), { id: 'risk-ev-source', sub: t('risk.ev.sourceSub') },
      h('div', { class: 'evidence' },
        h('div', { class: 'evidence-head' },
          ev.ref ? h('span', { class: 'evidence-ref mono', dir: /^[\x20-\x7E]+$/.test(String(ev.ref)) ? 'ltr' : 'auto' }, dataText(i18n.term(String(ev.ref)))) : null,
          h('span', { class: 'source-chip' }, svgIcon('layers', 12), sourceLabel(ev.sourceSystem))),
        excerpt ? h('blockquote', { class: 'evidence-excerpt' }, ...withCodes(excerpt)) : h('p', { class: 'risk-muted text-sm' }, t('risk.ev.noExcerpt')),
        h('div', { class: 'evidence-meta' },
          ev.kind ? h('span', { class: 'evidence-kind' }, t('risk.ev.kind', { kind: i18n.label('evidenceKind', ev.kind) || ev.kind })) : null,
          h('span', {}, t('risk.ev.readOnly')),
          url ? h('a', { href: url, target: '_blank', rel: 'noopener noreferrer' }, t('risk.ev.openSource'), svgIcon('external', 12))
            : (ev.link ? h('span', { class: 'mono text-xs', dir: 'ltr', title: t('risk.ev.internalRef') }, String(ev.link)) : null)))));
  } else {
    wrap.appendChild(section(t('risk.ev.source'), { id: 'risk-ev-source' }, emptyState({ icon: 'link', title: t('risk.ev.noSource'), text: t('risk.ev.noSourceText') })));
  }

  // data-quality checks
  const dq = dataQualityOf(risk, env);
  const checks = dq && dq.checks ? dq.checks : null;
  wrap.appendChild(section(t('risk.ev.checks'), { id: 'risk-ev-checks', sub: dq && dq.sourceName ? t('risk.ov.dqSource', { source: dq.sourceName }) : t('risk.ev.checksSub') },
    checks
      ? h('div', { class: 'risk-ev-checks' },
        checkCell(t('risk.ev.validity'), defaultFmt.pct(num(checks.validityPct), 1)),
        checkCell(t('risk.ev.completeness'), defaultFmt.pct(num(checks.completenessPct), 1)),
        checkCell(t('risk.ev.consistency'), defaultFmt.pct(num(checks.consistencyPct), 1)),
        checkCell(t('risk.ev.quarantine'), defaultFmt.num(num(checks.quarantineOpen))))
      : h('p', { class: 'note text-sm', style: { '--tone': 'var(--line-2)' } }, t('risk.ev.notValidated')),
    dq && dq.issues.length ? h('ul', { class: 'risk-measure-list' }, dq.issues.map((iss) => h('li', {}, glyph(iss.code === 'quarantine' ? 'warning' : 'neutral', 12), h('span', {}, h('strong', {}, iss.label), ' — ', ...withCodes(iss.text))))) : null,
    h('div', { class: 'risk-actions' }, button(t('risk.ev.openDq'), { variant: 'ghost', size: 'sm', icon: 'badge-check', onClick: () => navigateTo(st, 'dataquality', {}) }))));

  // attached evidence
  const items = arr(risk.treatment && risk.treatment.evidence).slice().sort((a, b) => (Date.parse(b.addedAt) || 0) - (Date.parse(a.addedAt) || 0));
  const terminal = TERMINAL.includes(risk.status);
  const list = items.length
    ? h('ul', { class: 'evidence-list' }, items.map((it) => evidenceItem(st, risk, it, terminal)))
    : emptyState({ icon: 'folder', title: t('risk.ev.emptyTitle'), text: t('risk.ev.emptyText') });
  const formOpen = st.forms.has('evidence');
  const addBtn = !formOpen ? button(t('risk.ev.add'), { variant: 'outline', size: 'sm', icon: 'plus', onClick: () => openForm(st, 'evidence'), attrs: { disabled: terminal, 'data-focus-key': 'open-evidence' } }) : null;
  wrap.appendChild(section(t('risk.ev.attached'), { id: 'risk-ev-attached', sub: t('risk.ev.attachedSub'), actions: addBtn },
    list,
    terminal ? h('p', { class: 'risk-reason' }, glyph('neutral', 12), t('risk.ev.closedReason')) : null,
    formOpen && !terminal ? evidenceForm(st, risk) : null));
  return wrap;
}

function checkCell(k, v) { return h('div', { class: 'risk-ev-check' }, h('span', { class: 'k' }, k), h('span', { class: 'v' }, numRun(v))); }

function evidenceItem(st, risk, it, terminal) {
  const url = it.kind === 'link' ? safeHttpUrl(it.url) : null;
  const title = isEn() ? (text(it.titleEn) || text(it.title)) : text(it.title);
  const titleNode = url ? h('a', { class: 'evidence-title', href: url, target: '_blank', rel: 'noopener noreferrer' }, title || url) : h('span', { class: 'evidence-title' }, ...withCodes(title || '—'));
  const meta = h('span', { class: 'evidence-meta' },
    h('span', {}, i18n.label('evidenceKind', it.kind) || it.kind),
    it.by ? h('span', {}, person(it.by)) : null,
    it.addedAt ? h('span', { title: defaultFmt.dateTime(it.addedAt) }, defaultFmt.date(it.addedAt)) : null,
    it.ref ? h('span', { class: 'mono', dir: 'ltr' }, String(it.ref)) : null,
    it.kind === 'file' && it.fileName ? h('span', { dir: 'auto' }, String(it.fileName)) : null,
    it.kind === 'file' && isNum(it.size) ? numRun(fileSize(it.size)) : null);
  const note = it.kind === 'note' && it.note ? h('span', { class: 'text-sm', style: { color: 'var(--ink-2)' } }, ...withCodes(it.note)) : null;
  const local = it.local !== false;
  const remove = local && !terminal
    ? button('', { variant: 'ghost', size: 'sm', icon: 'trash', onClick: () => removeEvidence(st, risk, it), attrs: { 'aria-label': t('risk.ev.remove', { title: title || '' }), title: t('risk.ev.removeShort') } })
    : null;
  return h('li', { class: 'evidence-item', 'data-kind': it.kind || 'note' },
    h('span', { class: 'evidence-icon', 'aria-hidden': 'true' }, svgIcon(EVIDENCE_ICON[it.kind] || 'file-text', 16)),
    h('span', { class: 'evidence-body' }, titleNode, note, meta),
    h('span', { class: 'evidence-local', title: local ? t('risk.ev.localTitle') : t('risk.ev.sourceRecordTitle') }, local ? t('risk.ev.local') : t('risk.ev.sourceRecord')),
    remove ? h('span', { class: 'evidence-actions' }, remove) : null);
}

function fileSize(bytes) {
  const b = num(bytes);
  if (b >= 1024 * 1024) return `${defaultFmt.num(b / (1024 * 1024), { maximumFractionDigits: 1 })} ${t('risk.common.mb')}`;
  if (b >= 1024) return `${defaultFmt.num(b / 1024, { maximumFractionDigits: 0 })} ${t('risk.common.kb')}`;
  return `${defaultFmt.num(b)} ${t('risk.common.bytes')}`;
}

function removeEvidence(st, risk, it) {
  const store = st.env.store;
  if (typeof store.removeEvidence !== 'function') { toast(t('risk.err.unavailable'), { tone: 'warning' }); return; }
  const res = store.removeEvidence(risk.id, it.id, { by: ACTOR });
  if (res && res.ok) toast(t('risk.toast.evidenceRemoved'), { tone: 'neutral', title: risk.code });
  else toast(failText(res), { tone: 'warning', title: risk.code });
}

/** Generic inline form shell inside the drawer (state kept in st.forms). */
function inlineForm(st, id, { title, intro = null, body, submitLabel, variant = 'primary', icon = null, onSubmit }) {
  const saved = (st.forms.get(id) || {}).values || {};
  const form = h('form', { class: 'risk-inline-form', 'data-form': id, novalidate: true, 'aria-label': title },
    h('p', { class: 'form-title' }, title),
    intro ? h('p', { class: 'form-intro' }, intro) : null,
    body,
    h('div', { class: 'form-actions' },
      button(submitLabel, { variant, icon, attrs: { type: 'submit' } }),
      button(t('risk.common.cancel'), { variant: 'ghost', onClick: () => closeForm(st, id) })));
  // restore remembered values
  for (const [name, value] of Object.entries(saved)) {
    const controls = form.querySelectorAll(`[name="${cssEscape(name)}"]`);
    controls.forEach((c) => {
      if (c.type === 'radio') c.checked = String(c.value) === String(value);
      else if (c.type === 'checkbox') c.checked = Array.isArray(value) ? value.includes(c.value) : !!value;
      else if (c.type !== 'file') c.value = value;
    });
  }
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    clearErrors(form);
    let result;
    try { result = onSubmit(readValues(form), form); } catch (err) { result = { ok: false, message: t('risk.err.generic') }; }
    if (result && result.ok === false) {
      showErrors(form, result.errors || [], { summary: result.message || null });
      return;
    }
    st.forms.delete(id);
    st.sig = '';
    refresh(st, { force: true });
  });
  return form;
}

function evidenceForm(st, risk) {
  const kindSaved = ((st.forms.get('evidence') || {}).values || {}).kind || 'link';
  const kindField = h('fieldset', { class: 'field risk-checks', 'data-name': 'kind' },
    h('legend', {}, t('risk.ev.formKind')),
    ...['link', 'note', 'file'].map((k) => h('label', { class: 'risk-check' }, h('input', { type: 'radio', name: 'kind', value: k, checked: k === kindSaved ? true : undefined }), h('span', {}, i18n.label('evidenceKind', k) || k))));
  const urlField = formField({ label: t('risk.ev.formUrl'), name: 'url', type: 'url', placeholder: 'https://', hint: t('risk.ev.formUrlHint') });
  const noteField = formField({ label: t('risk.ev.formNote'), name: 'note', type: 'textarea', rows: 3 });
  const fileWrap = h('div', { class: 'field', 'data-name': 'fileName' },
    h('label', { class: 'field-label', for: 'risk-ev-file' }, t('risk.ev.formFile')),
    h('input', { type: 'file', id: 'risk-ev-file', name: 'file', class: 'risk-file-input' }),
    h('p', { class: 'field-hint' }, t('risk.ev.formFileHint')));
  const body = h('div', { class: 'risk-form-grid' },
    h('div', { class: 'is-full' }, kindField),
    h('div', { class: 'is-full' }, formField({ label: t('risk.ev.formTitle'), name: 'title', type: 'text', required: true, placeholder: t('risk.ev.formTitlePh') })),
    h('div', { class: 'is-full', 'data-kind-slot': 'link' }, urlField),
    h('div', { class: 'is-full', 'data-kind-slot': 'note' }, noteField),
    h('div', { class: 'is-full', 'data-kind-slot': 'file' }, fileWrap));
  const sync = (k) => body.querySelectorAll('[data-kind-slot]').forEach((n) => { n.hidden = n.dataset.kindSlot !== k; });
  kindField.addEventListener('change', (e) => { if (e.target && e.target.name === 'kind') sync(e.target.value); });
  sync(kindSaved);
  return inlineForm(st, 'evidence', {
    title: t('risk.ev.formHeading'), intro: t('risk.ev.formIntro'), body, submitLabel: t('risk.ev.formSubmit'), icon: 'plus',
    onSubmit: (v) => {
      const store = st.env.store;
      if (typeof store.addEvidence !== 'function') return { ok: false, message: t('risk.err.unavailable') };
      const kind = v.kind || 'link';
      const payload = { kind, title: text(v.title) };
      if (kind === 'link') payload.url = text(v.url);
      if (kind === 'note') payload.note = text(v.note);
      if (kind === 'file') { const f = v.file || ((st.forms.get('evidence') || {}).file) || null; if (f) { payload.fileName = f.name; payload.size = f.size; payload.mime = f.type; } }
      const res = store.addEvidence(risk.id, payload, { by: ACTOR });
      if (!res || res.ok === false) return { ok: false, message: failText(res), errors: fieldErrors(res && res.errors, { url: 'url', note: 'note', fileName: 'fileName', title: 'title', size: 'fileName' }) };
      toast(t('risk.toast.evidenceAdded'), { tone: 'good', title: risk.code });
      return { ok: true };
    },
  });
}

/* ── Treatment ── */

function renderTreatment(st, risk) {
  const env = st.env;
  const store = env.store;
  const state = stateOf(env);
  const wrap = h('div', { class: 'stack gap-5' });
  const terminal = TERMINAL.includes(risk.status);
  let tr = { accept: false, override: false, dismiss: !terminal, escalate: !terminal };
  try { if (typeof store.aiRiskTransitions === 'function') tr = store.aiRiskTransitions(risk.id); } catch { /* keep defaults */ }
  const tasks = tasksOf(st, risk);
  const recL = riskField(risk, 'recommendation') || risk.recommendation || {};
  const hasRec = !!text(risk.recommendation && risk.recommendation.action);

  /* recommendation */
  const decision = (() => {
    if (risk.status === DISMISSED) return h('p', { class: 'risk-reason' }, glyph('neutral', 12), t('risk.tr.decisionDismissed'));
    const last = arr(risk.overrides).slice(-1)[0];
    if (tasks.length && last && last.toAction !== 'تجاهل المخاطرة') return h('p', { class: 'risk-reason' }, glyph('warning', 12), t('risk.tr.decisionOverridden', { by: person(last.by), at: defaultFmt.date(last.at) }));
    if (tasks.length) return h('p', { class: 'risk-reason' }, glyph('good', 12), t('risk.tr.decisionAccepted'));
    return null;
  })();
  const recActions = [];
  const decided = tasks.length > 0 || risk.status === DISMISSED;
  if ((hasRec || tr.accept) && !decided) {
    if (!st.forms.has('accept')) recActions.push(button(t('risk.tr.accept'), { variant: 'primary', icon: 'check', onClick: () => openForm(st, 'accept'), attrs: { disabled: !tr.accept, 'data-focus-key': 'open-accept' } }));
    if (!st.forms.has('override')) recActions.push(button(t('risk.tr.override'), { variant: 'outline', icon: 'edit', onClick: () => openForm(st, 'override'), attrs: { disabled: !tr.override, 'data-focus-key': 'open-override' } }));
  }
  if (!st.forms.has('dismiss') && tr.dismiss) recActions.push(button(t('risk.tr.dismiss'), { variant: 'ghost', icon: 'close', onClick: () => openForm(st, 'dismiss'), attrs: { disabled: !tr.dismiss, 'data-focus-key': 'open-dismiss' } }));
  const recBlock = hasRec
    ? h('div', { class: 'risk-rec' },
      h('div', { class: 'risk-chips' },
        h('span', { class: 'sim-tag' }, svgIcon('sparkle', 11), t('risk.tr.engineRec')),
        risk.recommendation.effort ? h('span', { class: 'recommendation-chip' }, t('risk.tr.effort', { effort: i18n.label('effort', risk.recommendation.effort) || risk.recommendation.effort })) : null,
        text(recL.impact) ? h('span', { class: 'recommendation-chip' }, ...withCodes(t('risk.tr.expected', { impact: text(recL.impact) }))) : null),
      h('p', { class: 'risk-rec-action' }, ...withCodes(text(recL.action))),
      text(recL.rationale) ? h('p', { class: 'risk-rec-why' }, ...withCodes(text(recL.rationale))) : null,
      arr(recL.alternatives).length ? h('div', { class: 'stack gap-1' }, h('span', { class: 't-label' }, t('risk.tr.alternatives')), h('ul', { class: 'risk-rec-alts' }, arr(recL.alternatives).map((a) => h('li', {}, ...withCodes(text(a)))))) : null)
    : h('p', { class: 'note text-sm', style: { '--tone': 'var(--line-2)' } }, risk.origin === 'manual' ? t('risk.tr.noRecManual') : t('risk.tr.noRec'));
  const transitionsWhy = !tr.accept && !terminal && hasRec && !decided ? h('p', { class: 'risk-reason' }, glyph('neutral', 12), t('risk.tr.notAssignable')) : null;
  wrap.appendChild(section(t('risk.tr.recommendation'), { id: 'risk-tr-rec' },
    recBlock, decision, transitionsWhy,
    terminal || !recActions.length ? null : h('div', { class: 'risk-actions' }, ...recActions),
    st.forms.has('accept') && tr.accept ? acceptForm(st, risk) : null,
    st.forms.has('override') && tr.override ? overrideForm(st, risk) : null,
    st.forms.has('dismiss') && tr.dismiss ? dismissForm(st, risk) : null));

  /* assignment */
  const openTask = tasks.find((x) => x.status !== TASK_CLOSED) || null;
  const overdue = !terminal && risk.dueDate && dateMs(risk.dueDate) < startOfToday(env);
  const assignKv = kv([
    [t('risk.ov.owner'), risk.owner ? person(risk.owner) : h('span', { class: 'risk-muted' }, t('risk.common.unassigned'))],
    [t('risk.ov.due'), dueCell(risk.dueDate, overdue, { short: false })],
  ]);
  assignKv.classList.add('is-compact');
  wrap.appendChild(section(t('risk.tr.assignment'), { id: 'risk-tr-assign', sub: openTask ? t('risk.tr.assignmentTaskSub', { code: openTask.code }) : t('risk.tr.assignmentSub'),
    actions: !terminal && !st.forms.has('assign') ? button(t('risk.tr.assignChange'), { variant: 'outline', size: 'sm', icon: 'user', onClick: () => openForm(st, 'assign'), attrs: { 'data-focus-key': 'open-assign' } }) : null },
  assignKv,
  st.forms.has('assign') && !terminal ? assignForm(st, risk, openTask) : null));

  /* escalation */
  const alerts = alertsOf(st, risk).slice().sort((a, b) => (Date.parse(b.sentAt) || 0) - (Date.parse(a.sentAt) || 0));
  const alertList = alerts.length
    ? h('ul', { class: 'risk-list' }, alerts.map((a) => h('li', { class: 'risk-list-item' },
      h('div', { class: 'risk-list-main' },
        h('span', { class: 'risk-list-title' }, i18n.label('alertQueue', a.queue) || a.queue, ' · ', i18n.label('alertSeverity', a.severity) || a.severity),
        h('span', { class: 'risk-list-meta' },
          codeSpan(a.code || a.id),
          h('span', { title: defaultFmt.dateTime(a.sentAt) }, defaultFmt.relative(a.sentAt)),
          arr(a.channels).length ? h('span', { class: 'row gap-1 wrap' }, ...arr(a.channels).map(channelChip)) : null,
          h('span', { class: 'sim-tag' }, t('risk.tr.notDelivered')))),
      a.acknowledged ? badge(t('risk.tr.acked', { by: person(a.ackBy) }), 'good') : badge(t('risk.tr.notAcked'), 'warning'))))
    : h('p', { class: 'text-sm risk-muted', style: { margin: 0 } }, t('risk.tr.noAlerts'));
  wrap.appendChild(section(t('risk.tr.escalation'), { id: 'risk-tr-esc', sub: risk.escalated ? t('risk.tr.escalatedSub') : t('risk.tr.escalationSub'),
    actions: !terminal && !st.forms.has('escalate') ? button(t('risk.tr.escalate'), { variant: 'outline', size: 'sm', icon: 'bell', onClick: () => openForm(st, 'escalate'), attrs: { disabled: !tr.escalate, 'data-focus-key': 'open-escalate' } }) : null },
  alertList,
  st.forms.has('escalate') && tr.escalate ? escalateForm(st, risk) : null));

  /* linked tasks + write-back */
  const taskList = tasks.length
    ? h('ul', { class: 'risk-list' }, tasks.map((x) => {
      const tOver = x.status !== TASK_CLOSED && (x.status === 'متأخرة' || (x.dueDate && dateMs(x.dueDate) < startOfToday(env)));
      return h('li', { class: 'risk-list-item' },
        h('div', { class: 'risk-list-main' },
          h('span', { class: 'risk-list-title' }, codeSpan(x.code || x.id), ' ', ...withCodes(taskTitle(x, risk))),
          h('span', { class: 'risk-list-meta' },
            badge(taskStatusLabel(x.status), x.status === TASK_CLOSED ? 'good' : x.status === 'متأخرة' ? 'critical' : x.status === 'قيد التنفيذ' ? 'warning' : 'brand'),
            h('span', {}, person(x.owner)),
            dueCell(x.dueDate, tOver),
            writebackChip(x, env))),
        button(t('risk.tr.openTask'), { variant: 'ghost', size: 'sm', icon: 'file-check', onClick: () => navigateTo(st, 'tasks', { id: x.id }) }));
    }))
    : h('p', { class: 'text-sm risk-muted', style: { margin: 0 } }, t('risk.tr.noTasks'));
  wrap.appendChild(section(t('risk.tr.tasks'), { id: 'risk-tr-tasks', sub: t('risk.tr.tasksSub'),
    actions: !terminal && !tasks.length && !tr.accept ? button(t('risk.tr.newTask'), { variant: 'outline', size: 'sm', icon: 'plus', onClick: () => navigateTo(st, 'tasks', { new: '1', risk: risk.id }) }) : null },
  taskList));

  /* treatment plan */
  const trL = riskField(risk, 'treatment') || risk.treatment || {};
  const planTask = risk.treatment && risk.treatment.taskId ? tasks.find((x) => x.id === risk.treatment.taskId) : null;
  const plan = planTask ? taskTitle(planTask, risk) : text(trL.plan);
  wrap.appendChild(section(t('risk.tr.plan'), { id: 'risk-tr-plan' },
    plan ? h('p', { class: 'risk-explain', style: { fontSize: 'var(--fs-sm)' } }, ...withCodes(plan)) : h('p', { class: 'text-sm risk-muted', style: { margin: 0 } }, t('risk.tr.noPlan'))));

  /* residual assessment */
  const rl = num(risk.residualLikelihood, NaN);
  const ri = num(risk.residualImpact, NaN);
  const assessed = rl >= 1 && ri >= 1;
  const hasTreatment = Boolean(risk.taskId || tasks.length || (risk.treatment && (risk.treatment.plan || arr(risk.treatment.evidence).length)));
  wrap.appendChild(section(t('risk.tr.residual'), { id: 'risk-tr-res', sub: t('risk.tr.residualSub'),
    actions: !terminal && !st.forms.has('residual') ? button(assessed ? t('risk.tr.reassess') : t('risk.tr.assess'), { variant: assessed ? 'outline' : 'primary', size: 'sm', icon: 'sliders', onClick: () => openForm(st, 'residual'), attrs: { disabled: !hasTreatment, 'data-focus-key': 'open-residual' } }) : null },
  assessed ? residualBlock(st, risk).querySelector('.risk-residual') : h('p', { class: 'text-sm risk-muted', style: { margin: 0 } }, t('risk.ov.residualNone')),
  !terminal && !hasTreatment ? h('p', { class: 'risk-reason' }, glyph('neutral', 12), t('risk.tr.residualNeedsTreatment')) : null,
  st.forms.has('residual') && !terminal && hasTreatment ? residualForm(st, risk) : null));

  /* close / reopen */
  if (!terminal) {
    wrap.appendChild(section(t('risk.tr.closeTitle'), { id: 'risk-tr-close', sub: t('risk.tr.closeSub'),
      actions: !st.forms.has('close') ? button(t('risk.tr.close'), { variant: 'outline', size: 'sm', icon: 'check-circle', onClick: () => openForm(st, 'close'), attrs: { disabled: !assessed, 'data-focus-key': 'open-close' } }) : null },
    !assessed ? h('p', { class: 'risk-reason' }, glyph('neutral', 12), t('risk.tr.closeNeedsResidual')) : null,
    st.forms.has('close') && assessed ? closeForm2(st, risk) : null));
  } else {
    const outcome = isEn() ? (text(risk.outcomeEn) || text((riskField(risk, 'outcome') || '')) || text(risk.outcome)) : text(risk.outcome);
    wrap.appendChild(section(risk.status === CLOSED ? t('risk.tr.closedTitle') : t('risk.tr.dismissedTitle'), { id: 'risk-tr-closed',
      sub: risk.closedAt ? t('risk.tr.closedAt', { at: defaultFmt.dateTime(risk.closedAt) }) : null,
      actions: !st.forms.has('reopen') ? button(t('risk.tr.reopen'), { variant: 'outline', size: 'sm', icon: 'refresh', onClick: () => openForm(st, 'reopen'), attrs: { 'data-focus-key': 'open-reopen' } }) : null },
    outcome ? h('p', { class: 'risk-explain', style: { fontSize: 'var(--fs-sm)' } }, ...withCodes(outcome)) : null,
    st.forms.has('reopen') ? reopenForm(st, risk) : null));
  }
  void state;
  return wrap;
}

/** Owner options: known people from risks and tasks (stored values, displayed via terms) + "someone else". */
export function ownerOptions(state) {
  const p = (state && state.platform) || {};
  const set = new Set();
  arr(p.aiRisks).forEach((r) => { if (r && text(r.owner)) set.add(text(r.owner)); });
  arr(p.tasks).forEach((x) => { if (x && text(x.owner)) set.add(text(x.owner)); });
  set.add(ACTOR);
  return Array.from(set).sort((a, b) => person(a).localeCompare(person(b), i18n.locale()));
}

/** Owner select + "other person" text field (no silent default unless `value` is given). */
export function ownerField(state, { name = 'owner', value = '', required = true, label = null } = {}) {
  const opts = ownerOptions(state);
  const known = value && opts.includes(value);
  const wrap = h('div', { class: 'stack gap-2', 'data-field': name });
  const sel = formField({ label: label || t('risk.form.owner'), name: `${name}Pick`, type: 'select', required, value: known ? value : (value ? '__other' : ''), placeholder: t('risk.form.ownerPh'),
    options: opts.map((o) => ({ value: o, label: person(o) })).concat([{ value: '__other', label: t('risk.form.ownerOther') }]) });
  sel.dataset.name = name;
  const other = formField({ label: t('risk.form.ownerOtherLabel'), name: `${name}Other`, type: 'text', value: known ? '' : (value || ''), placeholder: t('risk.form.ownerOtherPh') });
  other.hidden = !(value && !known);
  const select = sel.querySelector('select');
  select.addEventListener('change', () => { other.hidden = select.value !== '__other'; if (!other.hidden) { const inp = other.querySelector('input'); if (inp) inp.focus(); } });
  wrap.append(sel, other);
  return wrap;
}
export function ownerValue(values, name = 'owner') {
  const pick = values[`${name}Pick`];
  if (pick === '__other') return text(values[`${name}Other`]);
  return text(pick);
}

function dueField(env, value, { name = 'dueDate', label = null, required = true } = {}) {
  return formField({ label: label || t('risk.form.due'), name, type: 'date', required, value: value || '', min: todayISO(env) });
}

function validateOwnerDue(env, v, { ownerRequired = true } = {}) {
  const errors = [];
  const owner = ownerValue(v);
  if (ownerRequired && !owner) errors.push({ field: 'owner', message: t('risk.err.field.owner.required', errParams()) });
  const due = text(v.dueDate);
  if (!due) errors.push({ field: 'dueDate', message: t('risk.err.field.dueDate.required', errParams()) });
  else if (due < todayISO(env)) errors.push({ field: 'dueDate', message: t('risk.err.field.dueDate.past', errParams()) });
  return { owner, due, errors };
}

function futureDue(env, risk) { return risk.dueDate && risk.dueDate >= todayISO(env) ? risk.dueDate : ''; }

function acceptForm(st, risk) {
  const env = st.env;
  const state = stateOf(env);
  const body = h('div', { class: 'risk-form-grid' },
    ownerField(state, { value: risk.owner || '' }),
    dueField(env, futureDue(env, risk)),
    h('label', { class: 'risk-check is-full' }, h('input', { type: 'checkbox', name: 'escalate' }), h('span', {}, t('risk.tr.alsoEscalate'))));
  return inlineForm(st, 'accept', {
    title: t('risk.tr.acceptTitle'), intro: t('risk.tr.acceptIntro'), body, submitLabel: t('risk.tr.acceptSubmit'), icon: 'check',
    onSubmit: (v) => {
      const { owner, due, errors } = validateOwnerDue(env, v);
      if (errors.length) return { ok: false, errors };
      if (typeof env.store.acceptRecommendation !== 'function') return { ok: false, message: t('risk.err.unavailable') };
      const task = env.store.acceptRecommendation(risk.id, { owner, dueDate: due, escalate: !!v.escalate, by: ACTOR });
      if (!task) return { ok: false, message: t('risk.err.transition') };
      toast(t('risk.toast.accepted', { code: task.code }), { tone: 'good', title: risk.code });
      return { ok: true };
    },
  });
}

function overrideForm(st, risk) {
  const env = st.env;
  const state = stateOf(env);
  const recL = riskField(risk, 'recommendation') || risk.recommendation || {};
  const body = h('div', { class: 'risk-form-grid' },
    h('div', { class: 'is-full' }, formField({ label: t('risk.tr.overrideAction'), name: 'action', type: 'textarea', rows: 3, required: true, value: isEn() ? '' : text(risk.recommendation && risk.recommendation.action), placeholder: isEn() ? text(recL.action) : '' })),
    h('div', { class: 'is-full' }, formField({ label: t('risk.tr.overrideReason'), name: 'reason', type: 'textarea', rows: 2, required: true, hint: t('risk.tr.overrideReasonHint') })),
    ownerField(state, { value: risk.owner || '' }),
    dueField(env, futureDue(env, risk)),
    h('label', { class: 'risk-check is-full' }, h('input', { type: 'checkbox', name: 'escalate' }), h('span', {}, t('risk.tr.alsoEscalate'))));
  return inlineForm(st, 'override', {
    title: t('risk.tr.overrideTitle'), intro: t('risk.tr.overrideIntro'), body, submitLabel: t('risk.tr.overrideSubmit'), icon: 'edit',
    onSubmit: (v) => {
      const { owner, due, errors } = validateOwnerDue(env, v);
      if (!text(v.action)) errors.unshift({ field: 'action', message: t('risk.err.field.action.required', errParams()) });
      if (text(v.reason).length < 5) errors.unshift({ field: 'reason', message: t('risk.err.field.reason.required', errParams()) });
      if (errors.length) return { ok: false, errors };
      if (typeof env.store.overrideRecommendation !== 'function') return { ok: false, message: t('risk.err.unavailable') };
      const task = env.store.overrideRecommendation(risk.id, { action: text(v.action), reason: text(v.reason), owner, dueDate: due, escalate: !!v.escalate, by: ACTOR });
      if (!task) return { ok: false, message: t('risk.err.transition') };
      toast(t('risk.toast.overridden', { code: task.code }), { tone: 'good', title: risk.code });
      return { ok: true };
    },
  });
}

function dismissForm(st, risk) {
  const env = st.env;
  const body = h('div', { class: 'risk-form-grid' }, h('div', { class: 'is-full' }, formField({ label: t('risk.tr.dismissReason'), name: 'reason', type: 'textarea', rows: 3, required: true, placeholder: t('risk.tr.dismissReasonPh') })));
  return inlineForm(st, 'dismiss', {
    title: t('risk.tr.dismissTitle'), intro: t('risk.tr.dismissIntro'), body, submitLabel: t('risk.tr.dismissSubmit'), variant: 'danger', icon: 'close',
    onSubmit: (v) => {
      if (text(v.reason).length < 5) return { ok: false, errors: [{ field: 'reason', message: t('risk.err.field.reason.required', errParams()) }] };
      if (typeof env.store.dismissAiRisk !== 'function') return { ok: false, message: t('risk.err.unavailable') };
      const res = env.store.dismissAiRisk(risk.id, text(v.reason), ACTOR);
      if (!res) return { ok: false, message: t('risk.err.transition') };
      toast(t('risk.toast.dismissed'), { tone: 'neutral', title: risk.code });
      return { ok: true };
    },
  });
}

function assignForm(st, risk, openTask) {
  const env = st.env;
  const state = stateOf(env);
  const body = h('div', { class: 'risk-form-grid' }, ownerField(state, { value: risk.owner || '' }), dueField(env, futureDue(env, risk)));
  return inlineForm(st, 'assign', {
    title: t('risk.tr.assignTitle'), intro: openTask ? t('risk.tr.assignIntroTask', { code: openTask.code }) : t('risk.tr.assignIntro'), body, submitLabel: t('risk.tr.assignSubmit'), icon: 'user',
    onSubmit: (v) => {
      const { owner, due, errors } = validateOwnerDue(env, v);
      if (errors.length) return { ok: false, errors };
      const store = env.store;
      if (openTask) {
        if (typeof store.assignTask === 'function' && owner !== openTask.owner) {
          const r1 = store.assignTask(openTask.id, owner, { by: ACTOR });
          if (r1 && r1.ok === false) return { ok: false, message: failText(r1), errors: fieldErrors(r1.errors) };
        }
        if (typeof store.editTask === 'function' && due !== openTask.dueDate) {
          const r2 = store.editTask(openTask.id, { dueDate: due }, { by: ACTOR });
          if (r2 && r2.ok === false) return { ok: false, message: failText(r2), errors: fieldErrors(r2.errors) };
        }
      }
      if (typeof store.updateAiRisk !== 'function') return { ok: false, message: t('risk.err.unavailable') };
      const changed = owner !== risk.owner || due !== risk.dueDate;
      if (changed) {
        const res = store.updateAiRisk(risk.id, { owner, dueDate: due, by: ACTOR, note: `إسناد المخاطرة إلى ${owner} — الاستحقاق ${due}` });
        if (!res) return { ok: false, message: t('risk.err.generic') };
      }
      toast(changed ? t('risk.toast.assigned', { owner: person(owner) }) : t('risk.toast.noChange'), { tone: changed ? 'good' : 'neutral', title: risk.code });
      return { ok: true };
    },
  });
}

function escalateForm(st, risk) {
  const env = st.env;
  const s = stateOf(env).settings || {};
  const configured = (s.platform && s.platform.channels) || { email: true, slack: true };
  const body = h('div', { class: 'stack gap-3' },
    h('fieldset', { class: 'risk-checks field', 'data-name': 'channels' }, h('legend', {}, t('risk.tr.channels')),
      ...CHANNELS.map((c) => h('label', { class: 'risk-check' }, h('input', { type: 'checkbox', name: 'channels', value: c, checked: configured[c] ? true : undefined }), svgIcon(CHANNEL_ICON[c], 14), h('span', {}, i18n.label('channel', c) || c)))),
    h('p', { class: 'note text-sm is-demo', style: { '--tone': 'var(--accent)', margin: 0 } }, t('risk.tr.escalateHonest')));
  return inlineForm(st, 'escalate', {
    title: t('risk.tr.escalateTitle'), intro: t('risk.tr.escalateIntro'), body, submitLabel: t('risk.tr.escalateSubmit'), variant: 'danger', icon: 'bell',
    onSubmit: (v) => {
      const channels = arr(v.channels);
      if (!channels.length) return { ok: false, errors: [{ field: 'channels', message: t('risk.err.field.channels.required', errParams()) }] };
      if (typeof env.store.escalateRisk !== 'function') return { ok: false, message: t('risk.err.unavailable') };
      const alert = env.store.escalateRisk(risk.id, channels, ACTOR);
      if (!alert) return { ok: false, message: t('risk.err.transition') };
      toast(tn('risk.toast.escalated', channels.length), { tone: 'warning', title: risk.code });
      return { ok: true };
    },
  });
}

function residualForm(st, risk) {
  const env = st.env;
  const inherent = num(risk.score);
  const saved = (st.forms.get('residual') || {}).values || {};
  const preview = h('div', { class: 'risk-score-preview', 'aria-live': 'polite' });
  const paint = (l, i) => {
    clear(preview);
    if (!(l >= 1 && i >= 1)) { preview.append(glyph('neutral', 14), h('span', {}, t('risk.tr.residualPreviewEmpty', { score: defaultFmt.num(inherent) }))); return; }
    const s = l * i * 4;
    const r = ratingOf(s, env);
    preview.append(h('span', {}, t('risk.tr.residualPreview')), h('span', { class: ['score-num', `is-${r}`] }, numRun(`${defaultFmt.num(s)}/${defaultFmt.num(100)}`)), ratingBadge(r, { sm: true }),
      h('span', { class: 'text-xs muted' }, t('risk.tr.residualVsInherent', { score: defaultFmt.num(inherent) })));
    if (s > inherent) preview.append(h('span', { class: 'risk-reason', style: { color: 'var(--critical-text)' } }, glyph('critical', 12), t('risk.err.residual-above-inherent')));
  };
  let L = num(saved.likelihood, NaN);
  let I = num(saved.impact, NaN);
  const body = h('div', { class: 'stack gap-3' },
    scaleField({ name: 'likelihood', label: t('risk.tr.residualL'), kind: 'l', value: saved.likelihood || null, onChange: (n) => { L = n; paint(L, I); } }),
    scaleField({ name: 'impact', label: t('risk.tr.residualI'), kind: 'i', value: saved.impact || null, onChange: (n) => { I = n; paint(L, I); } }),
    preview,
    formField({ label: t('risk.tr.residualWhy'), name: 'justification', type: 'textarea', rows: 3, required: true, hint: t('risk.tr.residualWhyHint', errParams()) }));
  paint(L, I);
  return inlineForm(st, 'residual', {
    title: t('risk.tr.residualTitle'), intro: t('risk.tr.residualIntro', { l: defaultFmt.num(num(risk.likelihood)), i: defaultFmt.num(num(risk.impact)), score: defaultFmt.num(inherent) }), body, submitLabel: t('risk.tr.residualSubmit'), icon: 'sliders',
    onSubmit: (v) => {
      const errors = [];
      if (!v.likelihood) errors.push({ field: 'likelihood', message: t('risk.err.field.likelihood.required', errParams()) });
      if (!v.impact) errors.push({ field: 'impact', message: t('risk.err.field.impact.required', errParams()) });
      if (text(v.justification).length < 5) errors.push({ field: 'justification', message: t('risk.err.field.justification.required', errParams()) });
      if (errors.length) return { ok: false, errors };
      if (typeof env.store.assessResidual !== 'function') return { ok: false, message: t('risk.err.unavailable') };
      const res = env.store.assessResidual(risk.id, { likelihood: Number(v.likelihood), impact: Number(v.impact), justification: text(v.justification), by: ACTOR });
      if (!res || res.ok === false) return { ok: false, message: failText(res), errors: fieldErrors(res && res.errors) };
      toast(t('risk.toast.residual', { score: defaultFmt.num(Number(v.likelihood) * Number(v.impact) * 4) }), { tone: 'good', title: risk.code });
      return { ok: true };
    },
  });
}

function closeForm2(st, risk) {
  const env = st.env;
  const tasks = tasksOf(st, risk).filter((x) => x.status !== TASK_CLOSED);
  const body = h('div', { class: 'stack gap-3' },
    formField({ label: t('risk.tr.outcome'), name: 'outcome', type: 'textarea', rows: 3, required: true, placeholder: t('risk.tr.outcomePh') }),
    tasks.length ? h('p', { class: 'risk-reason' }, glyph('neutral', 12), t('risk.tr.closeTasksToo', { codes: tasks.map((x) => x.code).join(t('risk.common.listSep')) })) : null);
  return inlineForm(st, 'close', {
    title: t('risk.tr.closeFormTitle'), intro: t('risk.tr.closeIntro'), body, submitLabel: t('risk.tr.closeSubmit'), icon: 'check-circle',
    onSubmit: (v) => {
      if (!text(v.outcome)) return { ok: false, errors: [{ field: 'outcome', message: t('risk.err.field.outcome.required', errParams()) }] };
      if (typeof env.store.closeAiRisk !== 'function') return { ok: false, message: t('risk.err.unavailable') };
      const res = env.store.closeAiRisk(risk.id, { outcome: text(v.outcome), by: ACTOR });
      if (!res || res.ok === false) return { ok: false, message: failText(res) };
      toast(t('risk.toast.closed'), { tone: 'good', title: risk.code });
      return { ok: true };
    },
  });
}

function reopenForm(st, risk) {
  const env = st.env;
  const body = formField({ label: t('risk.tr.reopenReason'), name: 'reason', type: 'textarea', rows: 3, required: true });
  return inlineForm(st, 'reopen', {
    title: t('risk.tr.reopenTitle'), intro: t('risk.tr.reopenIntro'), body, submitLabel: t('risk.tr.reopenSubmit'), icon: 'refresh',
    onSubmit: (v) => {
      if (!text(v.reason)) return { ok: false, errors: [{ field: 'reason', message: t('risk.err.field.reason.required', errParams()) }] };
      if (typeof env.store.reopenAiRisk !== 'function') return { ok: false, message: t('risk.err.unavailable') };
      const res = env.store.reopenAiRisk(risk.id, { reason: text(v.reason), by: ACTOR });
      if (!res || res.ok === false) return { ok: false, message: failText(res) };
      toast(t('risk.toast.reopened'), { tone: 'warning', title: risk.code });
      return { ok: true };
    },
  });
}

/* ── History ── */

/**
 * One timeline entry's text in the active language: structured entries from the dictionary (psel timeline kinds;
 * a plain status change, historyKind 'status' with statusFrom/statusTo, in both languages), then seed history via
 * the aiRisks mirror, runtime entries via textEn.
 */
const ASSIGN_NOTE_RE = /^إسناد المخاطرة إلى (.+) — الاستحقاق (\d{4}-\d{2}-\d{2})$/;
function entryText(risk, e) {
  const structural = structuralText(risk, e);
  if (structural) return structural;
  if (e.historyKind === 'status' && RISK_STATUSES.includes(e.statusFrom) && RISK_STATUSES.includes(e.statusTo)) {
    return t('risk.hist.statusChanged', { from: statusLabel(e.statusFrom), to: statusLabel(e.statusTo) });
  }
  if (!isEn()) return text(e.text);
  const am = ASSIGN_NOTE_RE.exec(text(e.text));
  if (am) return t('risk.hist.assignedNote', { owner: person(am[1]), due: defaultFmt.date(am[2]) });
  if (e.kind === 'history' || (e.kind === 'detected' && Number.isInteger(e.historyIndex))) {
    if (text(e.textEn)) return text(e.textEn);
    const hist = riskField(risk, 'history');
    const mirrored = Array.isArray(hist) && Number.isInteger(e.historyIndex) && hist[e.historyIndex] ? text(hist[e.historyIndex].text) : '';
    if (mirrored && mirrored !== text(e.text)) return mirrored;
    return text(e.text);
  }
  return text(e.textEn) || text(e.text);
}

/** Timeline entries built by psel from structured records are worded from the dictionary (both languages). */
function structuralText(risk, e) {
  switch (e.kind) {
    case 'detected':
      if (Number.isInteger(e.historyIndex)) return '';
      return t('risk.hist.detectedText', { score: defaultFmt.num(num(risk.score)), rating: ratingLabel(ratingOf(num(risk.score))) });
    case 'task': return e.task ? t('risk.hist.taskText', { code: e.task.code || e.task.id, title: taskTitle(e.task, risk) }) : '';
    case 'task-closed': return e.task ? t('risk.hist.taskClosedText', { code: e.task.code || e.task.id }) : '';
    case 'writeback': {
      const code = (/\(([A-Z]+-\d+)\)\s*$/.exec(text(e.text)) || [])[1] || '';
      const stKey = ['synced', 'failed', 'pending'].includes(e.status) ? e.status : 'pending';
      return t(`risk.hist.wb.${stKey}`, { code });
    }
    case 'alert': {
      const a = e.alert || {};
      const ch = arr(a.channels).map((c) => i18n.label('channel', c) || c).join(t('risk.common.listSep'));
      return t(a.queue === 'immediate' ? 'risk.hist.alertImmediate' : 'risk.hist.alertStandard', { channels: ch || t('risk.hist.noChannels') });
    }
    case 'ack': return t('risk.hist.ackText');
    default: return '';
  }
}

function historyRows(st, risk) {
  return timelineOf(st, risk).slice().sort((a, b) => (Date.parse(b.at) || 0) - (Date.parse(a.at) || 0)).map((e) => ({
    at: e.at, kind: e.kind || 'history', by: e.by ? stageActor(e.by) : '—', text: entryText(risk, e), tone: e.tone || TIMELINE_TONE[e.kind] || 'brand',
  }));
}

function renderHistory(st, risk) {
  const rows = historyRows(st, risk);
  const wrap = h('div', { class: 'stack gap-4' });
  const exportBtn = button(t('risk.hist.export'), { variant: 'outline', size: 'sm', icon: 'download', onClick: () => exportHistory(st, risk), attrs: { disabled: !rows.length } });
  wrap.appendChild(h('div', { class: 'risk-hist-toolbar' }, h('p', { class: 'text-sm muted', style: { margin: 0 } }, tn('risk.hist.count', rows.length)), exportBtn));
  if (!rows.length) { wrap.appendChild(emptyState({ icon: 'clock', title: t('risk.hist.empty'), text: t('risk.hist.emptyText') })); return wrap; }
  wrap.appendChild(h('ol', { class: 'timeline', 'aria-label': t('risk.hist.aria') }, rows.map((r) => h('li', { class: ['timeline-item', `is-${r.kind}`], style: { '--tone': `var(--${r.tone === 'neutral' ? 'ink-3' : r.tone})` } },
    h('time', { class: 'timeline-time', datetime: text(r.at) }, defaultFmt.dateTime(r.at)),
    h('p', { class: 'timeline-text' }, ...withCodes(r.text || '—')),
    h('span', { class: 'timeline-by' }, [r.by, t(`risk.hist.kind.${r.kind}`)].filter(Boolean).join(' · '))))));
  return wrap;
}

function exportHistory(st, risk) {
  const rows = historyRows(st, risk).map((r) => ({ at: defaultFmt.dateTime(r.at), iso: text(r.at), actor: r.by, kind: t(`risk.hist.kind.${r.kind}`), text: r.text }));
  const ok = exportCsv(st.env, rows, [
    { key: 'at', label: t('risk.hist.colTime') }, { key: 'iso', label: t('risk.hist.colIso') }, { key: 'actor', label: t('risk.hist.colActor') },
    { key: 'kind', label: t('risk.hist.colKind') }, { key: 'text', label: t('risk.hist.colText') },
  ], `biltix-risk-ai-${risk.code || risk.id}-history-${todayISO(st.env)}.csv`);
  toast(ok ? tn('risk.toast.exported', rows.length) : t('risk.err.export'), { tone: ok ? 'good' : 'warning' });
}

/* ────────────────────────────── exports ────────────────────────────── */

export const riskUi = {
  ACTOR, RISK_STATUSES, TERMINAL, DOMAINS, TYPES, RATINGS, CHANNELS,
  envOf, ensureStyles, prose, codeSpan, withCodes, numRun, safeHttpUrl, riskTitle, riskField, person, siteName, siteOf,
  domainLabel, typeLabel, ratingLabel, statusLabel, taskStatusLabel, sourceLabel, ratingOf, ratingTone, statusTone, taskTitle, alertTitle,
  dataQualityOf, ratingBadge, statusChip, domainChip, typeChip, channelChip, scoreGroup, dueCell, confidenceText, dqChip, writebackChip,
  failText, fieldErrors, errParams, showErrors, clearErrors, scaleField, readValues, exportCsv, patchHashParams, hashParams, ownerOptions, ownerField, ownerValue, todayISO,
};

export default openRiskDrawer;
