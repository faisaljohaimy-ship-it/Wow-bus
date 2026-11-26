 
(window.FJPages = window.FJPages || {}).solutions = function (api) {
  'use strict';
  var D = document, $ = function (id) { return D.getElementById(id); };
  var el = api.el, bi = api.bi, STR = api.strings, pad2 = api.pad2;
  var SOLS = (api.data.solutions || {}).solutions || [];
  function dig(s, l) { return l === 'ar' ? String(s).replace(/[0-9]/g, function (d) { return '٠١٢٣٤٥٦٧٨٩'[d]; }) : String(s); }
  var host = $('solCards');
  SOLS.forEach(function (so, i) {
    var go = api.button({ id: 'sol-open-' + so.slug, kind: 'primary', label: STR['mp.sol.open'], href: '/solutions/' + so.slug + '/', trailing: true });
    var details = el('div', { class: 'det-wrap' },
      el('div', { class: 'det-block' }, el('h4', null, bi(STR['mp.sol.limits'])), el('p', null, bi((so.limits[0] || {}).text))),
      api.loopSlot('sol-' + so.slug, { steps: so.diagram }, { id: 'scn-sol-' + so.slug }), el('p', { class: 'scn-note' }, bi(STR['mp.scenario.note'])));
    var c = api.card({ id: 'sol-' + so.slug, icon: so.icon, kicker: [dig(pad2(i + 1), 'ar'), pad2(i + 1)], title: so.title, capability: so.intro, example: (so.problem[0] || {}).text, exampleLabel: STR['mp.sol.problem'],
      details: details, variant: 'b', focusMode: false, headingLevel: 2, actions: [go], fx: 'card-cap' });
    host.append(c.el);
  });
  host.classList.remove('reserve');
  api.capPanels($('capPanels'), (api.data.capabilities || {}).cards || []);
};
