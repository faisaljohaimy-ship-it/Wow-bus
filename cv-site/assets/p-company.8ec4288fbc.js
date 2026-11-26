 
(window.FJPages = window.FJPages || {}).company = function (api) {
  'use strict';
  var W = window, D = document, $ = function (id) { return D.getElementById(id); };
  var el = api.el, bi = api.bi, STR = api.strings, T = api.T;
  var PROF = api.data.profile || {};
  function moduleCard(name, hostId, iconId, kicker, title, line, extra) {
    var host = $(hostId); if (!host) return null;
    var rootEl = el('div', { class: 'wrap mod-host', id: 'm-' + name }, el('p', { class: 'mod-loading' }, bi(['جارٍ التحميل…', 'Loading…'])));
    var sc = (((api.site.scenarios || {}).modules) || {})[name];
    var det = el('div', { class: 'det-wrap' }, sc ? api.loopSlot('mod-' + name, { steps: sc.steps }, { id: 'scn-mod-' + name }) : null, sc ? el('p', { class: 'scn-note' }, bi(STR['mp.scenario.note'])) : null, rootEl);
    var spec = Object.assign({ id: 'card-' + name, icon: iconId, kicker: kicker, title: title, capability: line, details: det, detailsLabel: STR['mp.proj.open'], variant: 'a', focusMode: false, headingLevel: 3,
      onToggle: function (open) { if (open) api.mountModule(name, rootEl); } }, extra || {});
    var c = api.card(spec);
    c.el.classList.add('wide'); c.el.setAttribute('data-module', name);
    host.append(c.el);
    return c;
  }
  var notClaimed = PROF.not_claimed_items ? el('div', { class: 'det-block' }, el('h4', null, bi(['ما لا ندّعيه', 'What we do not claim'])), el('ul', { class: 'det-list' }, PROF.not_claimed_items.map(function (x) { return el('li', null, bi(x)); }))) : null;
  moduleCard('profile', 'leaderHost', 'agents', PROF.role || STR['mp.co.leader'], PROF.name || api.pair('brand.name'), PROF.role_note || api.pair('sec.profile.p'), { status: 'unverified', statusLabel: (W.STATUS.stated || {}).label, example: PROF.summary ? [String(PROF.summary[0]).split('،')[0] + '…', String(PROF.summary[1]).split(/[.;]/)[0] + '.'] : null, exampleLabel: ['بإفادته', 'In his words'], fx: 'card-cap' });
  if (notClaimed) { var lh = $('leaderHost'); if (lh) lh.append(api.card({ id: 'card-notclaimed', icon: 'security', kicker: ['الحدود', 'Limits'], title: ['ما لا ندّعيه', 'What we do not claim'], capability: PROF.not_claimed || null, details: notClaimed, variant: 'c', focusMode: false, headingLevel: 3, fx: 'rise' }).el); }
  moduleCard('factory', 'methodHost', 'automation', ['المنهج', 'Method'], api.pair('cap.method.t'), api.pair('cap.method.s'), { fx: 'card-cap' });
  moduleCard('motion', 'motionHost', 'motion', ['الحركة', 'Motion'], api.pair('cap.motion.t'), api.pair('cap.motion.s'), { fx: 'card-cap' });

   
  var cc = $('contactCards'); if (!cc) return;
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
  var copyBtn = api.button({ id: 'briefCopy', kind: 'primary', icon: 'inputs', label: api.pair('contact.copy'), onClick: function () { copyText(T('contact.brief')); } });
  var pdfBtn = api.button({ id: 'saveProfile', kind: 'secondary', icon: 'projects', label: api.pair('contact.profile'), onClick: function () {
    var name = 'faisal-al-juhaimy-profile-' + api.lang() + '.pdf';
    api.saveFile('/docs/' + name, name).then(function () { status.textContent = T('contact.saved'); });
  } });
  var est = el('p', { class: 'det-row' }, api.chip('proposed', api.pair('contact.estimateChip')), ' ', bi(api.pair('contact.estimate')));
  var c2 = api.card({ id: 'card-bring', icon: 'inputs', kicker: ['قبل البدء', 'Before we start'], title: api.pair('contact.bring'), capability: api.pair('contact.b1'), details: el('div', { class: 'det-wrap' }, bring, est), variant: 'b', focusMode: false, headingLevel: 3,
    actions: [copyBtn, pdfBtn], fx: 'card-cap' });
  cc.append(c1.el, c2.el);
  cc.append(el('div', { class: 'wide' }, status));
};
