 
(window.FJPages = window.FJPages || {}).capabilities = function (api) {
  'use strict';
  var D = document, $ = function (id) { return D.getElementById(id); };
  var el = api.el, bi = api.bi, STR = api.strings, pad2 = api.pad2;
  var CAPS = (api.data.capabilities && api.data.capabilities.cards) || [];
  var host = $('capCards'); if (!host) return;
  function dig(s, l) { return l === 'ar' ? String(s).replace(/[0-9]/g, function (d) { return '٠١٢٣٤٥٦٧٨٩'[d]; }) : String(s); }
  CAPS.forEach(function (c, i) {
    var items = el('ul', { class: 'det-list' }, (c.items || []).map(function (it) {
      return el('li', null, el('div', { class: 'det-row' }, api.chip(it.state, it.stateLabel || null), bi(it.text)), it.evidence ? el('p', { class: 'det-ev' }, bi(it.evidence)) : null);
    }));
    var tools = (c.tools || []).length ? el('div', { class: 'tool-chips' }, c.tools.map(function (t) {
      return el('span', { class: 'tool-chip' }, el('bdi', { dir: 'ltr', translate: 'no', 'data-proper-name': '' }, t.name), api.chip(t.category, t.label));
    })) : null;
    var f = c.film || {};
    var watch = f.n ? api.button({ id: 'btn-cap-' + c.slug, kind: 'secondary', icon: 'cinema', label: api.TP('mp.watchFilm', { n: [dig(pad2(f.n), 'ar'), pad2(f.n)] }), onClick: function () {
      api.playFilm({ film: f.n, lang: api.lang(), chapter: f.chapter || 'hook', from: 'cap-' + c.slug });
    } }) : null;
    var details = el('div', { class: 'det-wrap' },
      el('div', { class: 'det-block' }, el('h4', null, bi(STR['mp.caps.items'])), items),
      tools ? el('div', { class: 'det-block' }, el('h4', null, bi(STR['mp.caps.tools'])), tools) : null,
      f.n ? el('div', { class: 'det-block' }, el('h4', null, bi(STR['mp.caps.film'])), el('p', null, bi(f.title), ' · ', bi(f.chapterLabel))) : null,
      el('p', { class: 'det-ev' }, bi(STR['mp.caps.source']), ': ', bi(c.sourceNote || ['بيانات الملف المهني وكتالوج الأدوات وقصة الأفلام', 'the profile data, the tool catalog and the film storyboard'])));
    var slot = api.loopSlot('cap-' + c.slug, c.scenario ? { steps: c.scenario.steps } : null, { id: 'scn-cap-' + c.slug, delay: 160, mode: 'both' });
    var card = api.card({ id: 'cap-' + c.slug, icon: c.icon, kicker: c.kicker, title: c.title, capability: c.capability, example: c.example, exampleLabel: STR['mp.caps.example'],
      status: c.status.ladder, statusLabel: c.status.label, details: details, variant: 'b', focusMode: false, headingLevel: 2, slot: slot, actions: watch ? [watch] : [], fx: 'card-cap' });
    card.el.setAttribute('data-sqds-slot', 'capability-card');
    card.el.setAttribute('data-slug', c.slug);
    host.append(card.el);
  });
  host.classList.remove('reserve');
};
