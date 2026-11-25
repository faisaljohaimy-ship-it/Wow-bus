/**
 * BILTIX Risk AI — manual risk registration form (js/views/shared/risk-form.js). Owner: B-REGISTER.
 * Used by airisks.js and cockpit.js (B-COCKPIT, "Register risk").
 *
 *   openRiskForm(ctx, { onSaved, defaults }) → modal api
 *     Fields: source, project, domain, type, title, description, likelihood 1–5, impact 1–5 (no silent
 *     defaults: required radio groups with no preselection), owner, due date (not in the past), optional
 *     evidence link (http/https). Validation = store.validateAiRisk (the shared rule set) + a required source;
 *     errors are shown inline per field (aria-invalid + described-by) with a summary, bilingual.
 *     On success store.addAiRisk (audited, applies the alert thresholds) → toast → onSaved(risk)
 *     (default: open the new risk in the drawer). Nothing is stored when validation fails.
 */

import { components } from '../../ui/components.js';
import { i18n, t } from '../../core/i18n.js';
import { fmt as defaultFmt } from '../../core/fmt.js';
import { SOURCE_VALIDATION } from '../../data/platform-seed.js';
import {
  openRiskDrawer, envOf, ensureStyles, ACTOR, DOMAINS, TYPES, siteName, domainLabel, typeLabel, sourceLabel, ratingOf, ratingBadge, numRun,
  scaleField, ownerField, ownerValue, readValues, showErrors, clearErrors, fieldErrors, errParams, failText, todayISO,
} from './risk-drawer.js';

const { h, clear, glyph, modal, toast, formField } = components;
const MANUAL_SOURCE = 'إدخال يدوي';
const text = (v) => (typeof v === 'string' ? v.trim() : (v == null ? '' : String(v)));

/** Source options: the validated source systems (one per validation source) + manual entry / document. */
function sourceOptions() {
  const seen = new Set();
  const out = [];
  for (const [name, id] of Object.entries(SOURCE_VALIDATION || {})) {
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(name);
  }
  return out.map((v) => ({ value: v, label: sourceLabel(v) })).sort((a, b) => a.label.localeCompare(b.label, i18n.locale()))
    .concat([{ value: MANUAL_SOURCE, label: sourceLabel(MANUAL_SOURCE) }]);
}

export function openRiskForm(ctx = {}, { onSaved = null, defaults = {}, returnFocus = null } = {}) {
  ensureStyles();
  const env = envOf(ctx);
  const store = env.store;
  const state = store.state || {};
  const g = store.filters || state.filters || {};
  const d = defaults && typeof defaults === 'object' ? defaults : {};
  const projectDefault = text(d.projectId) || (g.siteId && g.siteId !== 'all' ? g.siteId : '');
  const sites = Array.isArray(state.sites) ? state.sites : [];

  let L = null;
  let I = null;
  const preview = h('div', { class: 'risk-score-preview', 'aria-live': 'polite' });
  const paintPreview = () => {
    clear(preview);
    if (!(L >= 1 && I >= 1)) { preview.append(glyph('neutral', 14), h('span', {}, t('risk.form.scorePreviewEmpty', { k: defaultFmt.num(4) }))); return; }
    const s = L * I * 4;
    const r = ratingOf(s, env);
    preview.append(h('span', {}, t('risk.form.scorePreview')), h('span', { class: ['score-num', `is-${r}`] }, numRun(`${defaultFmt.num(s)}/${defaultFmt.num(100)}`)), ratingBadge(r, { sm: true }),
      h('span', { class: 'risk-li' }, numRun(`${defaultFmt.num(L)}×${defaultFmt.num(I)}×${defaultFmt.num(4)}`)));
  };

  const form = h('form', { class: 'stack gap-4 risk-new-form', novalidate: true, 'aria-label': t('risk.form.title') },
    h('p', { class: 'note text-sm', style: { margin: 0 } }, t('risk.form.intro')),
    h('div', { class: 'risk-form-grid' },
      formField({ label: t('risk.form.source'), name: 'source', type: 'select', required: true, value: text(d.source), placeholder: t('risk.form.sourcePh'), options: sourceOptions(), hint: t('risk.form.sourceHint') }),
      formField({ label: t('risk.form.project'), name: 'projectId', type: 'select', required: true, value: projectDefault, placeholder: t('risk.form.projectPh'), options: sites.map((s) => ({ value: s.id, label: siteName(state, s.id) })) }),
      formField({ label: t('risk.form.domain'), name: 'category', type: 'select', required: true, value: text(d.category), placeholder: t('risk.form.domainPh'), options: DOMAINS.map((x) => ({ value: x, label: domainLabel(x) })) }),
      formField({ label: t('risk.form.type'), name: 'type', type: 'select', required: true, value: text(d.type), placeholder: t('risk.form.typePh'), options: TYPES.map((x) => ({ value: x, label: typeLabel(x) })) }),
      h('div', { class: 'is-full' }, formField({ label: t('risk.form.titleLabel'), name: 'title', type: 'text', required: true, placeholder: t('risk.form.titlePh') })),
      h('div', { class: 'is-full' }, formField({ label: t('risk.form.description'), name: 'description', type: 'textarea', rows: 3, placeholder: t('risk.form.descriptionPh') }))),
    scaleField({ name: 'likelihood', label: t('risk.form.likelihood'), kind: 'l', hint: t('risk.form.likelihoodHint', errParams()), onChange: (n) => { L = n; paintPreview(); } }),
    scaleField({ name: 'impact', label: t('risk.form.impact'), kind: 'i', hint: t('risk.form.impactHint', errParams()), onChange: (n) => { I = n; paintPreview(); } }),
    preview,
    h('div', { class: 'risk-form-grid' },
      ownerField(state, { value: text(d.owner) }),
      formField({ label: t('risk.form.due'), name: 'dueDate', type: 'date', required: true, value: text(d.dueDate), min: todayISO(env), hint: t('risk.form.dueHint') }),
      h('div', { class: 'is-full' }, formField({ label: t('risk.form.evidence'), name: 'evidenceUrl', type: 'url', placeholder: 'https://', hint: t('risk.form.evidenceHint') }))));
  paintPreview();

  let api = null;
  let saving = false;
  function submit() {
    if (saving) return false;
    clearErrors(form);
    const v = readValues(form);
    const obj = {
      source: text(v.source), projectId: text(v.projectId), category: text(v.category), type: text(v.type),
      title: text(v.title), description: text(v.description),
      likelihood: v.likelihood === '' || v.likelihood == null ? null : Number(v.likelihood),
      impact: v.impact === '' || v.impact == null ? null : Number(v.impact),
      owner: ownerValue(v), dueDate: text(v.dueDate), evidenceUrl: text(v.evidenceUrl) || null,
    };
    const errors = [];
    if (!obj.source) errors.push({ field: 'source', message: t('risk.err.field.source.required', errParams()) });
    let check = { ok: true, errors: [] };
    try { if (typeof store.validateAiRisk === 'function') check = store.validateAiRisk(obj, { mode: 'manual' }); } catch { /* the store re-validates below */ }
    errors.push(...fieldErrors(check && check.errors, { evidence: 'evidenceUrl' }));
    if (errors.length) { showErrors(form, errors, { summary: t('risk.form.summary') }); return false; }
    if (typeof store.addAiRisk !== 'function') { showErrors(form, [], { summary: t('risk.err.unavailable') }); return false; }
    saving = true;
    let res = null;
    try { res = store.addAiRisk(obj, { by: ACTOR }); } catch { res = { ok: false }; }
    saving = false;
    if (!res || res.ok === false) {
      showErrors(form, fieldErrors(res && res.errors, { evidence: 'evidenceUrl' }), { summary: res && res.errors ? t('risk.form.summary') : failText(res) });
      return false;
    }
    const alerted = res.status === 'تنبيه';
    toast(alerted ? t('risk.form.savedAlert', { code: res.code }) : t('risk.form.saved', { code: res.code }), { tone: 'good', title: res.code });
    const saved = res;
    setTimeout(() => {
      if (typeof onSaved === 'function') { try { onSaved(saved); } catch { /* caller */ } }
      else openRiskDrawer(ctx, saved.id, { tab: 'overview' });
    }, 0);
    return undefined;
  }

  api = modal({
    title: t('risk.form.title'), subtitle: t('risk.form.subtitle'), body: form, size: 'lg', returnFocus,
    actions: [
      { label: t('risk.common.cancel'), variant: 'ghost' },
      { label: t('risk.form.submit'), variant: 'primary', icon: 'plus', onClick: () => submit() },
    ],
  });
  api.el.classList.add('risk-form-modal');
  form.addEventListener('submit', (e) => { e.preventDefault(); if (submit() !== false) api.close('action'); });
  api.open();
  return api;
}

export default openRiskForm;
