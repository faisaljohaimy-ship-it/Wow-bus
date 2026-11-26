 
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

   
  var co = $('coCta');
  if (co) co.append(api.button({ id: 'coDemo', kind: 'primary', icon: 'decision', label: STR['mp.cta.meeting'], href: '/contact/?type=demo' }).el,
    api.button({ id: 'coProposal', kind: 'secondary', icon: 'projects', label: STR['mp.cta.proposal'], href: '/contact/?type=proposal' }).el);
};
