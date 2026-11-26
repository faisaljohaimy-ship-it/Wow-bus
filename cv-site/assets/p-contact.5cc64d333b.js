 
(window.FJPages = window.FJPages || {}).contact = function (api) {
  'use strict';
  var W = window, D = document, $ = function (id) { return D.getElementById(id); };
  var el = api.el, bi = api.bi, STR = api.strings, T = api.T;
  var L = {
    name: ['الاسم', 'Name'], organisation: ['الجهة', 'Organisation'], email: ['البريد الإلكتروني', 'E-mail'], message: ['صِف المشروع أو القرار المطلوب', 'Describe the project or the decision'],
    role: ['المنصب (اختياري)', 'Role (optional)'], phone: ['الهاتف (اختياري)', 'Phone (optional)'], country: ['الدولة (اختياري)', 'Country (optional)'],
    budget: ['نطاق الميزانية (بالدولار الأمريكي)', 'Budget range (US dollars)'], timeline: ['الموعد المتوقع للبدء', 'Expected start'], choose: ['اختر', 'Choose'],
    consent: ['أوافق على إشعار الخصوصية أعلاه', 'I agree to the privacy notice above'],
  };
  var BUDGET = [['lt-50k', 'أقل من ٥٠ ألف دولار', 'Under USD 50k'], ['50k-150k', 'من ٥٠ إلى ١٥٠ ألف دولار', 'USD 50k to 150k'], ['150k-500k', 'من ١٥٠ إلى ٥٠٠ ألف دولار', 'USD 150k to 500k'], ['gt-500k', 'أكثر من ٥٠٠ ألف دولار', 'Over USD 500k'], ['undisclosed', 'أفضّل عدم الإفصاح', 'Prefer not to say']];
  var TIMELINE = [['asap', 'في أقرب وقت', 'As soon as possible'], ['1-3m', 'خلال ١ إلى ٣ أشهر', 'Within 1 to 3 months'], ['3-6m', 'خلال ٣ إلى ٦ أشهر', 'Within 3 to 6 months'], ['6m-plus', 'بعد ٦ أشهر أو أكثر', 'In 6 months or more'], ['exploring', 'نستكشف فقط', 'Just exploring']];
  var TYPES = [['demo', 'mp.ct.demo', 'mp.ct.demoP'], ['proposal', 'mp.ct.proposal', 'mp.ct.proposalP']];
  var q = new URLSearchParams(W.location.search).get('type');
  var current = q === 'proposal' ? 'proposal' : 'demo';
  var mod = null, values = {};
  var host = $('formsHost'), tabs = $('formTabs');
  function P(p) { return api.P(p); }
  function field(id, name, label, input) { return el('div', { 'data-field': '' }, el('label', { for: id }, P(label)), input); }
  function input(id, name, attrs) { return el('input', Object.assign({ id: id, name: name, value: values[name] || null }, attrs || {})); }
  function select(id, name, opts) {
    var s = el('select', { id: id, name: name }, el('option', { value: '' }, P(L.choose)), opts.map(function (o) { return el('option', { value: o[0] }, api.lang() === 'ar' ? o[1] : o[2]); }));
    if (values[name]) s.value = values[name];
    return s;
  }
  function err(f, msg) { var e = el('p', { class: 'fj-err', id: f.id + '-err' }, msg); f.setAttribute('aria-invalid', 'true'); f.setAttribute('aria-describedby', e.id); f.parentNode.append(e); }
  function buildForm(type) {
    var p = type + '-';
    var ta = el('textarea', { id: p + 'message', name: 'message', rows: '5', maxlength: '4000' }); ta.value = values.message || '';
    var step1 = el('fieldset', { class: 'step', 'data-step': '1' }, el('legend', null, P(STR['mp.ct.step1'])),
      el('div', { class: 'fields' },
        field(p + 'name', 'name', L.name, input(p + 'name', 'name', { autocomplete: 'name', maxlength: '100', required: true })),
        field(p + 'organisation', 'organisation', L.organisation, input(p + 'organisation', 'organisation', { autocomplete: 'organization', maxlength: '150', required: true })),
        field(p + 'email', 'email', L.email, input(p + 'email', 'email', { type: 'email', autocomplete: 'email', maxlength: '254', required: true, dir: 'ltr' }))),
      field(p + 'message', 'message', L.message, ta));
    var next = api.button({ kind: 'secondary', label: STR['mp.ct.next'], trailing: true, id: p + 'next' });
    step1.append(el('div', { class: 'row' }, next.el));
    var step2 = el('fieldset', { class: 'step', 'data-step': '2', hidden: true }, el('legend', null, P(STR['mp.ct.step2'])),
      el('div', { class: 'fields' },
        field(p + 'role', 'role', L.role, input(p + 'role', 'role', { autocomplete: 'organization-title', maxlength: '100' })),
        field(p + 'phone', 'phone', L.phone, input(p + 'phone', 'phone', { type: 'tel', autocomplete: 'tel', maxlength: '30', dir: 'ltr' })),
        field(p + 'country', 'country', L.country, input(p + 'country', 'country', { autocomplete: 'country-name', maxlength: '60' })),
        type === 'proposal' ? field(p + 'budget', 'budgetRange', L.budget, select(p + 'budget', 'budgetRange', BUDGET)) : null,
        type === 'proposal' ? field(p + 'timeline', 'timeline', L.timeline, select(p + 'timeline', 'timeline', TIMELINE)) : null),
      el('div', { 'data-lead-privacy': '' }),
      el('label', { class: 'consent' }, el('input', { type: 'checkbox', name: 'consent', id: p + 'consent' }), el('span', null, P(L.consent))));
    var back = api.button({ kind: 'tertiary', label: STR['mp.ct.back'], id: p + 'back' });
    var send = el('button', { type: 'submit', class: 'sqds-btn sqds-btn--primary sqds-btn--md', id: p + 'send' }, el('span', { class: 'sqds-btn__label' }, P(STR['mp.ct.send'])));
    step2.append(el('div', { class: 'row' }, back.el, send));
    var form = el('form', { class: 'lead', id: 'form-' + type, 'data-lead-form': '', 'data-type': type, 'data-lang': api.lang(), novalidate: true, 'aria-labelledby': p + 'h' },
      el('h3', { id: p + 'h' }, P(STR[TYPES.filter(function (t) { return t[0] === type; })[0][1]])),
      el('p', { class: 'note' }, P(STR[TYPES.filter(function (t) { return t[0] === type; })[0][2]])),
      api.page.leadsConnected ? null : el('p', { class: 'honest', role: 'note' }, P(STR['mp.ct.notConnected'])),
      step1, step2, el('div', { 'data-lead-status': '' }));
    function check1() {
      form.querySelectorAll('.fj-err').forEach(function (n) { n.remove(); });
      form.querySelectorAll('[data-step="1"] [aria-invalid]').forEach(function (n) { n.removeAttribute('aria-invalid'); n.removeAttribute('aria-describedby'); });
      var f = function (n) { return form.querySelector('[name="' + n + '"]'); }, bad = [];
      if (f('name').value.trim().length < 2) { err(f('name'), f('name').value.trim() ? T('mp.ct.min2') : T('mp.ct.req')); bad.push(f('name')); }
      if (f('organisation').value.trim().length < 2) { err(f('organisation'), f('organisation').value.trim() ? T('mp.ct.min2') : T('mp.ct.req')); bad.push(f('organisation')); }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f('email').value.trim())) { err(f('email'), f('email').value.trim() ? T('mp.ct.badEmail') : T('mp.ct.req')); bad.push(f('email')); }
      if (f('message').value.trim().length < 10) { err(f('message'), T('mp.ct.short')); bad.push(f('message')); }
      if (bad.length) { bad[0].focus(); return false; }
      return true;
    }
    function show(step) {
      step1.hidden = step !== 1; step2.hidden = step !== 2;
      var first = (step === 1 ? step1 : step2).querySelector('input, textarea, select');
      if (first) first.focus();
    }
    next.el.addEventListener('click', function () { if (check1()) show(2); });
    back.el.addEventListener('click', function () { show(1); });
     
    new MutationObserver(function () { if (form.querySelector('[data-step="1"] [aria-invalid="true"]') && step1.hidden) { step1.hidden = false; step2.hidden = false; } }).observe(form, { subtree: true, attributes: true, attributeFilter: ['aria-invalid'] });
    form.append(el('noscript', null, P(STR['mp.ct.noscript'])));
    form.addEventListener('input', function (e) { if (e.target.name) values[e.target.name] = e.target.value; });
    return form;
  }
  function render() {
    api.clear(host); api.clear(tabs);
    TYPES.forEach(function (t) {
      var b = api.button({ id: 'tab-' + t[0], kind: 'tertiary', label: STR[t[1]], onClick: function () { current = t[0]; render(); try { history.replaceState(history.state, '', '?type=' + t[0]); } catch (e) {   } } });
      b.el.setAttribute('role', 'tab'); b.el.setAttribute('aria-selected', String(current === t[0])); b.el.setAttribute('aria-controls', 'form-' + t[0]);
      tabs.append(b.el);
    });
    var form = buildForm(current);
    form.setAttribute('role', 'tabpanel');
    host.append(form);
    if (mod) mod.initLeadForm(form);
  }
  render();
   
  if (api.page.leadClient) {
    import(api.page.leadClient).then(function (m) { mod = m; host.querySelectorAll('form[data-lead-form]').forEach(function (f) { m.initLeadForm(f); }); },
      function () { var st = host.querySelector('[data-lead-status]'); if (st) { st.className = 'lead-status lead-status--error'; st.textContent = api.lang() === 'ar' ? 'تعذّر تحميل النموذج.' : 'The form could not load.'; } });
  }
  api.onLang(function () { render(); });    

   
  var cc = $('contactCards');
  var SC = ((api.site.scenarios || {}).home || {}).company;
  var how = el('ol', { class: 'det-ol' }, [1, 2, 3, 4].map(function (i) { return el('li', null, el('b', null, bi(api.pair('contact.s' + i + 'h'))), ' — ', bi(api.pair('contact.s' + i))); }));
  var c1 = api.card({ id: 'card-how', icon: 'decision', kicker: ['أربع خطوات', 'Four steps'], title: api.pair('contact.steps'), capability: api.pair('take.p1'), details: how, variant: 'b', focusMode: false, headingLevel: 3,
    slot: SC ? api.loopSlot('page-company', { steps: SC.steps }, { id: 'scn-contact' }) : null, fx: 'card-cap' });
  var bring = el('ul', { class: 'det-list' }, [1, 2, 3, 4].map(function (i) { return el('li', null, bi(api.pair('contact.b' + i))); }));
  var status = el('p', { class: 'contact-status', id: 'contactStatus', role: 'status', 'aria-live': 'polite' });
  function copyText(text) {
    function fallback() {
      var old = cc.querySelector('.copy-fallback'); if (old) old.remove();
      var ta = el('textarea', { class: 'copy-fallback', readonly: true, 'aria-label': T('contact.copyFail') }); ta.value = text;
      status.textContent = T('contact.copyFail'); status.parentNode.insertBefore(ta, status.nextSibling); ta.focus(); ta.select();
    }
    try { if (!navigator.clipboard || !navigator.clipboard.writeText) return fallback(); navigator.clipboard.writeText(text).then(function () { status.textContent = T('contact.copied'); }, fallback); } catch (e) { fallback(); }
  }
  var copyBtn = api.button({ id: 'briefCopy', kind: 'secondary', icon: 'inputs', label: api.pair('contact.copy'), onClick: function () { copyText(T('contact.brief')); } });
  var pdfBtn = api.button({ id: 'saveProfile', kind: 'secondary', icon: 'projects', label: api.pair('contact.profile'), onClick: function () {
    var name = 'faisal-al-juhaimy-profile-' + api.lang() + '.pdf';
    api.saveFile('/docs/' + name, name).then(function () { status.textContent = T('contact.saved'); });
  } });
  var est = el('p', { class: 'det-row' }, api.chip('proposed', api.pair('contact.estimateChip')), ' ', bi(api.pair('contact.estimate')));
  var c2 = api.card({ id: 'card-bring', icon: 'inputs', kicker: ['قبل البدء', 'Before we start'], title: api.pair('contact.bring'), capability: api.pair('contact.b1'), details: el('div', { class: 'det-wrap' }, bring, est), variant: 'b', focusMode: false, headingLevel: 3,
    actions: [copyBtn, pdfBtn], fx: 'card-cap' });
  cc.append(c1.el, c2.el, el('div', { class: 'wide' }, status));
};
