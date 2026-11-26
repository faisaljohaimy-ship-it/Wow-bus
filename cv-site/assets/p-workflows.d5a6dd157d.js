 
(window.FJPages = window.FJPages || {}).workflows = function (api) {
  'use strict';
  var D = document, S = window.SQDS, $ = function (id) { return D.getElementById(id); };
  var el = api.el, bi = api.bi, STR = api.strings, pad2 = api.pad2;
  var HYP = (api.data.hypotheses && api.data.hypotheses.hypotheses) || [];
  var META = (api.data.hypotheses && api.data.hypotheses.meta) || {};
  var TOPICS = (api.data.sequence && api.data.sequence.topics) || [];
  var TOPIC_ICON = { 1: 'systems', 2: 'code', 3: 'ai', 4: 'agents', 5: 'data', 6: 'integration', 7: 'motion', 8: 'deployment', 9: 'automation', 10: 'projects' };
  var PROCESS = { 1: 'architecture', 2: 'code', 3: 'data', 4: 'agents', 5: 'performance', 6: 'security', 7: 'motion', 8: 'deployment', 9: 'automation', 10: 'systems' };
  var L = {
    hypothesis: ['الفرضية', 'Hypothesis'], kIf: ['إذا', 'If'], kThen: ['فإن', 'then'], kBecause: ['لأن', 'because'], kTest: ['ونختبر ذلك بواسطة', 'we test it by'],
    conditions: ['شروط التطبيق', 'Conditions'], inputs: ['المدخلات', 'Inputs'], steps: ['خطوات الاستخدام', 'Steps of use'], calc: ['من ملف التحقق', 'From the check'],
    expected: ['النتيجة المتوقعة', 'Expected result'], expectedTag: ['متوقعة، لم تتحقق بعد', 'Expected, not achieved'], expectedTagDone: ['صيغت قبل التجربة', 'Stated before the trial'],
    observed: ['ما رصدناه', 'What we observed'], acceptance: ['معيار القبول', 'Acceptance criterion'], limits: ['الحدود', 'Limits'],
    stateEv: ['الحالة والدليل', 'State and evidence'], film: ['الفيلم', 'Film'], chapter: ['الفصل', 'Chapter'],
  };
  function Pl(p, l) { return Array.isArray(p) ? String(p[l === 'ar' ? 0 : 1] == null ? p[0] : p[l === 'ar' ? 0 : 1]) : (p == null ? '' : String(p)); }
  function both(fn) { return [fn('ar'), fn('en')]; }
  function dig(s, l) { return l === 'ar' ? String(s).replace(/[0-9]/g, function (d) { return '٠١٢٣٤٥٦٧٨٩'[d]; }) : String(s); }
  function firstSentence(s) { var m = String(s || '').match(/^.*?[.؛;](\s|$)/); return (m ? m[0] : String(s || '')).trim(); }
  var DEC_RE = /approv|confirm|review|decid|accept|sign/i;
  function flowFor(h) {
    var t = TOPICS[(h.topic && h.topic.film || 0) - 1] || {};
    var steps = h.steps || [], inputs = h.inputs || [];
    var dec = null;
    for (var i = steps.length - 1; i >= 0; i--) if (DEC_RE.test(steps[i][1] || '')) { dec = steps[i]; break; }
    var observed = h.observed || null;
    function lab(k) { return api.pair('wf.' + k); }
    return [
      { key: 'problem', label: lab('problem'), text: h.problem },
      { key: 'inputs', label: lab('inputs'), text: both(function (l) { return inputs.slice(0, 2).map(function (p) { return Pl(p, l); }).join(' · ') + (inputs.length > 2 ? ' +' + dig(inputs.length - 2, l) : ''); }) },
      { key: 'ai', label: lab('ai'), text: (t.script && t.script.method) ? t.script.method : (h.statement && h.statement.then), meta: t.tool || null },
      { key: 'process', label: lab('process'), text: both(function (l) { return steps.length ? Pl(steps[0], l) + (steps.length > 1 ? ' … ' + Pl(steps[steps.length - 1], l) : '') : ''; }), meta: steps.length ? api.TP('wf.nSteps', { n: [dig(steps.length, 'ar'), String(steps.length)] }) : null },
      { key: 'decision', label: lab('decision'), text: dec || api.pair('wf.noDecision'), meta: dec ? null : api.pair('wf.missingTag'), missing: !dec },
      { key: 'result', label: lab('result'), text: observed ? observed : both(function (l) { return Pl(api.pair('wf.notRun'), l) + ' ' + Pl(h.expected, l); }), badge: observed ? api.ladder(h.state) : null, meta: observed ? null : api.pair('wf.expectedTag'), missing: !observed },
      { key: 'evidence', label: lab('evidence'), text: both(function (l) { return firstSentence(Pl(h.evidence && h.evidence.text, l)); }), badge: api.ladder(h.state) },
    ];
  }
  function block(title, content, cls) { return el('div', { class: 'det-block' + (cls ? ' ' + cls : '') }, el('h4', null, bi(title)), content); }
  function list(items, ordered) { return el(ordered ? 'ol' : 'ul', { class: ordered ? 'det-ol' : 'det-list' }, (items || []).map(function (it) { return el('li', null, bi(it)); })); }
  function details(h, flow) {
    var st = h.statement || {}, done = h.state === 'verified' || h.state === 'observed', ev = h.evidence || {};
    var wf = S.workflow({ id: 'wf-' + h.id, label: api.pair('wf.label'), steps: flow.map(function (f) { return { key: f.key, label: f.label, title: f.label, text: f.text, badge: f.badge || null, meta: f.meta || null }; }), variant: 'a', headingLevel: 4 });
    wf.el.setAttribute('data-sqds-slot', 'workflow-graph');
    var ledgerIds = (ev.ids || []).map(function (x) {
      var row = (window.LEDGER || []).filter(function (r) { return r.id === x.id; })[0];
      return el('a', { href: '/evidence/#row-' + x.id, title: row ? api.P(row.claim) : x.id }, (row && row.cid ? row.cid + ' · ' : '') + x.id);
    });
    var box = el('div', { class: 'det-wrap' },
      el('div', { class: 'wf-detail-graph' }, wf.el),
      block(L.hypothesis, el('dl', { class: 'det-stmt' },
        el('div', null, el('dt', null, bi(L.kIf)), el('dd', null, bi(st.if))),
        el('div', null, el('dt', null, bi(L.kThen)), el('dd', null, bi(st.then))),
        el('div', null, el('dt', null, bi(L.kBecause)), el('dd', null, bi(st.because))),
        el('div', null, el('dt', null, bi(L.kTest)), el('dd', null, bi(st.test))))),
      block(L.conditions, list(h.conditions)),
      block(L.inputs, list(h.inputs)),
      block(L.steps, list(h.steps, true)),
      h.code ? block(L.calc, el('pre', { class: 'ev-src', dir: 'ltr', translate: 'no', tabindex: '0' }, h.code)) : null,
      el('div', { class: 'det-block' }, el('h4', null, bi(L.expected), ' ', el('span', { class: 'det-tag' }, bi(done ? L.expectedTagDone : L.expectedTag))), el('p', null, bi(h.expected))),
      h.observed ? el('div', { class: 'det-block' }, el('h4', null, bi(L.observed), ' ', api.chip(h.state)), el('p', null, bi(h.observed))) : null,
      block(L.acceptance, el('p', null, bi(h.acceptance))),
      block(L.limits, el('p', null, bi(h.limits))),
      el('div', { class: 'det-block' }, el('h4', null, bi(L.stateEv)), el('p', null, api.chip(h.state), ' ', bi(ev.text)),
        ledgerIds.length ? el('div', null, el('p', { class: 'det-ev' }, bi(STR['mp.flows.ledgerIds'])), el('div', { class: 'id-chips' }, ledgerIds)) : null));
    return { node: box, wf: wf };
  }
  function rail(flow) {
    var r = el('div', { class: 'wf-mini', 'aria-hidden': 'true' });
    flow.forEach(function (f) { r.append(el('i', { class: f.missing ? 'is-gap' : 'is-on' })); });
    r.append(el('b'));
    return r;
  }
  var host = $('flowCards');
  if (!host) return;
  var stateLabel = META.states || {};
  HYP.forEach(function (h, i) {
    var film = h.scene && h.scene.film || (h.topic && h.topic.film) || i + 1, t = TOPICS[film - 1] || {};
    var flow = flowFor(h), det = details(h, flow);
     
    var steps = [['inputs', 'wf.inputs'], ['ai', 'wf.ai'], [PROCESS[film] || 'automation', 'wf.process'], ['decision', 'wf.decision'], ['evidence', 'wf.evidence']].map(function (x) { var lab = api.pair(x[1]) || [x[1], x[1]]; return [x[0], lab[0], lab[1]]; });
    var slot = api.loopSlot('topic-' + pad2(film), { steps: steps }, { id: 'scn-' + h.id, delay: 120 });
    var chLab = ((t.labels || {})[h.scene && h.scene.chapter] || [h.scene && h.scene.chapter, h.scene && h.scene.chapter]);
    var watch = api.button({ id: 'btn-' + h.id, kind: 'secondary', icon: 'cinema', label: api.TP('mp.watchCh', { c: chLab }), onClick: function () {
      api.playFilm({ film: film, lang: api.lang(), chapter: (h.scene && h.scene.chapter) || 'hook', from: h.id });
    } });
    watch.el.setAttribute('data-film', String(film));
    var num = [dig(pad2(film), 'ar'), pad2(film)];
    var c = api.card({ id: h.id, icon: TOPIC_ICON[film] || 'decision', kicker: api.TP('mp.flows.wfCard', { n: num }), title: (h.topic && h.topic.title) || t.title || h.id,
      capability: h.short, example: h.problem, exampleLabel: STR['mp.flows.problem'], status: api.ladder(h.state), statusLabel: stateLabel[h.state] || null,
      details: det.node, detailsLabel: STR['mp.flows.details'], variant: 'a', focusMode: false, headingLevel: 2, before: rail(flow), slot: slot, actions: [watch], fx: 'card-wf',
      onToggle: function (open) { if (open) { det.wf.layout(); if (window.FJFx) window.FJFx.graph(det.wf.el); if (window.FJHooks) window.FJHooks.emit('workflow', { id: h.id, lang: api.lang(), steps: flow, scene: h.scene, el: det.wf.el }); } } });
    c.el.setAttribute('data-hyp', h.id);
    c.el.setAttribute('data-state-detail', h.state);
    host.append(c.el);
  });
  host.classList.remove('reserve');
   
  window.addEventListener('studio:hypothesis', function (e) { var id = e.detail && e.detail.id, n = id && $(id); if (n) { api.reveal(n); n.scrollIntoView({ block: 'start', behavior: api.reducedMotion ? 'auto' : 'smooth' }); } });
};
