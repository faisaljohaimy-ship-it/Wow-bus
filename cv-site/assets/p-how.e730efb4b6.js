 
(window.FJPages = window.FJPages || {}).how = function (api) {
  'use strict';
  var W = window, D = document, S = W.SQDS, $ = function (id) { return D.getElementById(id); };
  var el = api.el, bi = api.bi, STR = api.strings, pad2 = api.pad2;
  var STEPS = (api.data.method || {}).steps || [];
  function dig(s, l) { return l === 'ar' ? String(s).replace(/[0-9]/g, function (d) { return '٠١٢٣٤٥٦٧٨٩'[d]; }) : String(s); }
  var g = $('methodGraph');
  if (g && STEPS.length) {
    var wf = S.workflow({ id: 'method', label: STR['mp.how.graph'], variant: 'a', headingLevel: 3,
      steps: STEPS.map(function (s) { return { key: s.key, icon: s.icon, label: s.title, title: s.title, text: (s.stages[0] || {}).text, meta: s.ledger.length ? [s.ledger.map(function (r) { return r.cid; }).join(' · '), s.ledger.map(function (r) { return r.cid; }).join(' · ')] : null }; }),
      onSelect: function (i) { var c = $('step-' + STEPS[i].key); if (c) c.setAttribute('data-hl', '1'); } });
    wf.el.setAttribute('data-sqds-slot', 'workflow-graph');
    g.append(wf.el, el('p', { class: 'scn-note' }, bi(['انتقل بين الخطوات بالأسهم؛ تفاصيل كل خطوة ودليلها في القائمة أدناه.', 'Move between steps with the arrow keys; each step’s detail and evidence are in the list below.'])));
    if (W.FJFx) setTimeout(function () { W.FJFx.graph(wf.el); }, 300);
  }
  var list = $('methodSteps');
  STEPS.forEach(function (s, i) {
    var claims = el('ul', { class: 'det-list' }, s.ledger.map(function (r) { return el('li', null, el('div', { class: 'ev-claim' }, api.chip(r.status), el('a', { href: '/evidence/#row-' + r.id }, r.cid)), el('p', null, bi(r.claim))); }));
    var drivers = s.drivers.length ? el('ul', { class: 'det-list' }, s.drivers.map(function (d) { return el('li', null, el('div', { class: 'det-row' }, api.chip(d.state), el('b', null, bi(d.label))), el('p', null, bi(d.text)), d.evidence ? el('p', { class: 'det-ev' }, bi(d.evidence)) : null); })) : null;
    var stages = el('div', null, s.stages.map(function (st) { return el('p', null, el('b', null, bi(st.label)), ' — ', bi(st.text)); }));
    var films = el('div', { class: 'card-acts' }, (s.films || []).map(function (f) { return api.button({ kind: 'secondary', icon: 'cinema', label: api.TP('mp.watchFilm', { n: [dig(pad2(f[0]), 'ar'), pad2(f[0])] }), onClick: function () { api.playFilm({ film: f[0], lang: api.lang(), chapter: f[1], from: 'step-' + s.key }); } }).el; }));
    var c = api.card({ id: 'step-' + s.key, icon: s.icon, kicker: [dig(pad2(i + 1), 'ar') + ' / ٠٧', pad2(i + 1) + ' / 07'], title: s.title, capability: (s.stages[0] || {}).text,
      status: s.drivers.length ? api.ladder(s.drivers[0].state) : null, statusLabel: s.drivers.length ? (W.STATUS[s.drivers[0].state] || {}).label : null,
      details: el('div', { class: 'det-wrap' }, stages, drivers, el('div', { class: 'det-block' }, el('h4', null, bi(STR['mp.flows.ledgerIds'])), claims), films), variant: 'a', focusMode: false, headingLevel: 3, fx: 'card-wf' });
    var li = el('li'); li.append(c.el); list.append(li);
  });
  list.classList.remove('reserve');
  var dh = $('methodDrivers'), seen = {};
  STEPS.forEach(function (s) { s.drivers.forEach(function (d) { var k = JSON.stringify(d.label); if (seen[k]) return; seen[k] = 1;
    dh.append(api.card({ id: 'drv-' + Object.keys(seen).length, icon: 'automation', kicker: ['محرّك', 'Driver'], title: d.label, capability: d.text, example: d.evidence, exampleLabel: ['الدليل', 'Evidence'], status: api.ladder(d.state), statusLabel: (W.STATUS[d.state] || {}).label, variant: 'c', focusMode: false, headingLevel: 3, fx: 'row' }).el); }); });
  dh.append(el('div', { class: 'cta-row wide' }, api.button({ kind: 'secondary', icon: 'decision', label: STR['mp.how.flows'], href: '/workflows/', trailing: true }).el, api.button({ kind: 'tertiary', label: api.pair('cap.method.t'), href: '/company/#method', trailing: true }).el));
};
