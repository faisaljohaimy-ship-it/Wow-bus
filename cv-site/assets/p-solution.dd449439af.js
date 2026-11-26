 
(window.FJPages = window.FJPages || {}).solution = function (api) {
  'use strict';
  var W = window, D = document, S = W.SQDS, $ = function (id) { return D.getElementById(id); };
  var el = api.el, bi = api.bi, STR = api.strings, pad2 = api.pad2;
  var SO = ((api.data.solutions || {}).solutions || []).filter(function (x) { return x.slug === api.page.slug; })[0];
  var CAPS = ((api.data.capabilities || {}).cards || []);
  if (!SO) return;
  var main = $('solMain');
  function dig(s, l) { return l === 'ar' ? String(s).replace(/[0-9]/g, function (d) { return '٠١٢٣٤٥٦٧٨٩'[d]; }) : String(s); }
  function items(list, tag) { return el('ul', { class: 'det-list' }, list.map(function (it) { return el('li', null, el('div', { class: 'det-row' }, it.state ? api.chip(it.state) : null, bi(it.label ? it.label : null), bi(it.text)), it.evidence ? el('p', { class: 'det-ev' }, bi(it.evidence)) : null); })); }
  var n = 0;
  function section(key, iconId, title, face, details, extra) {
    n++;
    var c = api.card(Object.assign({ id: 'sol-' + key, scn: SO.diagram, icon: iconId, kicker: [dig(pad2(n), 'ar'), pad2(n)], title: title, capability: face, details: details, variant: 'a', focusMode: false, headingLevel: 2, fx: 'rise' }, extra || {}));
    main.append(c.el);
    return c;
  }
  section('problem', 'problem', STR['mp.sol.problem'], (SO.problem[0] || {}).text, items(SO.problem)).toggle(true, { silent: true });
   
  var dg = S.workflow({ id: 'solDiagram', label: STR['mp.sol.diagram'], variant: 'b', headingLevel: 3,
    steps: SO.diagram.map(function (d, i) { var ap = SO.approach[i] || SO.approach[SO.approach.length - 1] || {}; return { key: 'n' + i, icon: d[0], label: [d[1], d[2]], title: [d[1], d[2]], text: ap.text || [d[1], d[2]] }; }) });
  section('diagram', 'architecture', STR['mp.sol.diagram'], SO.intro, el('div', null, dg.el, el('p', { class: 'scn-note' }, bi(STR['mp.scenario.note'])))).toggle(true, { silent: true });
  dg.layout();
  section('approach', 'ai', STR['mp.sol.approach'], (SO.approach[0] || {}).text, items(SO.approach));
  section('tech', 'code', STR['mp.sol.tech'], [SO.tech.map(function (t) { return t.name; }).join(' · '), SO.tech.map(function (t) { return t.name; }).join(' · ')],
    el('div', { class: 'tool-chips' }, SO.tech.map(function (t) { return el('span', { class: 'tool-chip' }, el('bdi', { dir: 'ltr', translate: 'no', 'data-proper-name': '' }, t.name), api.chip(t.category, t.label)); })));
  section('outputs', 'result', STR['mp.sol.outputs'], (SO.outputs[0] || {}).text, el('div', null, el('p', null, el('span', { class: 'det-tag' }, bi(STR['mp.sol.outputsTag']))), items(SO.outputs)));
  section('limits', 'problem', STR['mp.sol.limits'], (SO.limits[0] || {}).text, items(SO.limits));
  section('data', 'data', STR['mp.sol.data'], (SO.data[0] || {}).text, items(SO.data));
   
  var ev = SO.evidence || {};
  var claims = el('ul', { class: 'det-list' }, (ev.ledger || []).map(function (r) {
    return el('li', null, el('div', { class: 'ev-claim' }, api.chip(r.status), el('a', { href: '/evidence/#row-' + r.id }, r.cid), el('span', { class: 'acc' }, bi(api.pair('ledger.envH.' + (r.env || 'none'))))), el('p', null, bi(r.claim)));
  }));
  var films = el('div', { class: 'card-acts' }, (ev.films || []).map(function (f) {
    return api.button({ kind: 'secondary', icon: 'cinema', label: api.TP('mp.watchFilm', { n: [dig(pad2(f[0]), 'ar'), pad2(f[0])] }), onClick: function () { api.playFilm({ film: f[0], lang: api.lang(), chapter: f[1], from: 'sol-evidence' }); } }).el;
  }));
  var links = el('div', { class: 'id-chips' }, (ev.cases || []).map(function (c) { return el('a', { href: '/work/#cases' }, c); }).concat((ev.caps || []).map(function (slug) {
    var cp = CAPS.filter(function (x) { return x.slug === slug; })[0];
    return el('a', { href: '/capabilities/#cap-' + slug }, bi(cp ? cp.title : [slug, slug]));
  })));
  var nEv = (ev.ledger || []).length;
  section('evidence', 'evidence', STR['mp.sol.evidence'], api.TP('mp.ev.claims', { n: [dig(nEv, 'ar'), String(nEv)] }), el('div', { class: 'det-wrap' }, claims, films, links)).toggle(true, { silent: true });
  section('faq', 'inputs', STR['mp.sol.faq'], (SO.faq[0] || {}).q, el('div', { class: 'faq' }, SO.faq.map(function (f) { return el('details', null, el('summary', null, bi(f.q)), el('p', null, bi(f.a))); })));
  var how = el('ol', { class: 'det-ol' }, [1, 2, 3, 4].map(function (i) { return el('li', null, el('b', null, bi(api.pair('contact.s' + i + 'h'))), ' — ', bi(api.pair('contact.s' + i))); }));
  section('start', 'decision', STR['mp.sol.start'], api.pair('contact.s1'), how, { actions: [api.button({ kind: 'primary', icon: 'decision', label: STR['mp.cta.demo'], href: '/contact/?type=demo' })] });
  main.append(el('div', { class: 'cta-row' }, api.button({ kind: 'tertiary', label: STR['mp.sol.all'], href: '/solutions/', trailing: true }).el));
   
  var sc = $('stickyCta');
  if (sc) sc.append(api.button({ id: 'stickyDemo', kind: 'primary', label: STR['mp.cta.demo'], href: '/contact/?type=demo' }).el, api.button({ id: 'stickyProposal', kind: 'secondary', label: STR['mp.cta.proposal'], href: '/contact/?type=proposal' }).el);
};
