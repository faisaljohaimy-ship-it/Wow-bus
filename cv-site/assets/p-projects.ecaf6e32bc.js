 
(window.FJPages = window.FJPages || {}).projects = function (api) {
  'use strict';
  var D = document, S = window.SQDS, $ = function (id) { return D.getElementById(id); };
  var el = api.el, bi = api.bi, STR = api.strings, P = api.P, T = api.T, num = api.num, clear = api.clear, ltr = api.ltr;
  var reduced = api.reducedMotion;
  var PROJ = (api.data.profile && api.data.profile.projects) || [];
  var SCASE = ((api.site.scenarios || {}).cases) || {}, SMOD = ((api.site.scenarios || {}).modules) || {};
  var PICON = { SADEED: 'projects', 'BILTIX Risk AI': 'integration', 'KPI calculator': 'data', 'Evidence portfolio': 'evidence' };

   
  var cases = $('caseCards');
  if (cases) {
    PROJ.forEach(function (p, i) {
      var name = [p.name_ar || p.name, p.name];
      var details = el('div', { class: 'det-wrap' },
        p.role ? el('div', { class: 'det-block' }, el('h4', null, bi(['الدور', 'Role'])), el('p', null, bi(p.role))) : null,
        p.note ? el('div', { class: 'det-block' }, el('h4', null, bi(['ما يثبته الدليل وحدوده', 'What the evidence shows, and its limits'])), el('p', null, bi(p.note))) : null,
        (p.evidence_ids || []).length ? el('div', { class: 'det-block' }, el('h4', null, bi(STR['mp.flows.ledgerIds'])), el('div', { class: 'id-chips' }, p.evidence_ids.map(function (id) {
          var row = (window.LEDGER || []).filter(function (r) { return r.id === id; })[0];
          return el('a', { href: '/evidence/#row-' + id }, (row && row.cid ? row.cid + ' · ' : '') + id);
        }))) : null,
        SCASE[p.name] ? api.loopSlot('case-' + i, { steps: SCASE[p.name].steps }, { id: 'scn-case-' + i }) : null,
        SCASE[p.name] ? el('p', { class: 'scn-note' }, bi(STR['mp.scenario.note'])) : null);
      var c = api.card({ id: 'case-' + i, icon: PICON[p.name] || 'projects', kicker: ['الحالة ' + String(i + 1).replace(/[0-9]/g, function (d) { return '٠١٢٣٤٥٦٧٨٩'[d]; }), 'Case ' + (i + 1)], title: name, capability: p.what, status: api.ladder(p.status), statusLabel: (window.STATUS[p.status] || {}).label,
        details: details, variant: 'c', focusMode: false, headingLevel: 3, fx: 'card-cap' });
      cases.append(c.el);
    });
    cases.append(moduleCard('cases', 'projects', ['الملف الكامل', 'Full file'], STR['mp.proj.caseFile'], api.pair('sec.cases.p')).el);
  }
  function moduleCard(name, iconId, kicker, title, line) {
    var rootEl = el('div', { class: 'wrap mod-host', id: 'm-' + name }, el('p', { class: 'mod-loading' }, bi(['جارٍ التحميل…', 'Loading…'])));
    var sc = SMOD[name];
    var det = el('div', { class: 'det-wrap' }, sc ? api.loopSlot('mod-' + name, { steps: sc.steps }, { id: 'scn-mod-' + name }) : null, sc ? el('p', { class: 'scn-note' }, bi(STR['mp.scenario.note'])) : null, rootEl);
    var c = api.card({ id: 'card-' + name, icon: iconId, kicker: kicker, title: title, capability: line, details: det, detailsLabel: STR['mp.proj.open'], variant: 'a', focusMode: false, headingLevel: 3,
      onToggle: function (open) { if (open) api.mountModule(name, rootEl); } });
    c.el.classList.add('wide'); c.el.setAttribute('data-module', name);
    return c;
  }
  var lab = $('labHost'); if (lab) lab.append(moduleCard('lab', 'code', ['المختبر', 'Lab'], STR['mp.proj.lab'], api.pair('cap.tools.s')).el);
  var atlas = $('atlasHost'); if (atlas) atlas.append(moduleCard('atlas', 'integration', ['الأطلس', 'Atlas'], STR['mp.proj.atlas'], api.pair('cap.integrations.s')).el);

   
  var KPI = window.FJKPI || null;
  var gHost = $('kpiGauges');
  var gauge = null;
  if (gHost && KPI) {
    var r0 = KPI.ratio(16, 20), r1 = KPI.weighted({ actual: 16, target: 20, attendance: 100, weight: 0.6 }), r2 = KPI.weighted({ actual: 16, target: 20, attendance: 100, weight: 0.7 }), r3 = KPI.ratio(16, '');
    var st = KPI.selfTest();
    var rows = [
      { key: 'ratio', label: api.pair('kpi.case0'), value: Math.round(KPI.round(r0.pct, 6)), state: 'ok' },
      { key: 'w60', label: api.pair('kpi.case1'), value: r1.score, state: 'ok', current: true },
      { key: 'w70', label: api.pair('kpi.case2'), value: r2.score, state: 'ok' },
      { key: 'none', label: api.pair('kpi.case3'), value: 0, state: r3.status === 'review' ? 'review' : 'ok' },
    ];
    var cmp = S.compare({ label: STR['mp.proj.compare'], rows: rows, max: 100, unit: '%', status: st.pass ? 'verified' : 'pending' });
    cmp.el.setAttribute('data-fx', 'inst'); cmp.el.id = 'kpiCompare';
    gauge = S.gauge({ label: api.pair('kpi.result'), value: reduced ? r1.score : 0, max: 100, unit: '%', status: st.pass ? 'verified' : 'pending', note: api.pair('kpi.sim') });
    gauge.el.id = 'kpiGauge'; gauge.el.setAttribute('data-signal', 'kpi'); gauge.el.setAttribute('data-fx', 'inst');
    gauge.el.__fxSet = function () { paintKpi(true); };
    gHost.append(gauge.el, cmp.el);
  }

   
  var K = { actual: '16', target: '20', attend: '100', w: 0.6, mode: 'weighted', approved: false, cleared: false, last: '' };
  function kpiCalc() {
    if (!KPI) return { status: 'invalid' };
    if (K.mode === 'ratio') { var r = KPI.ratio(K.actual, K.target); return r.status === 'ok' ? Object.assign({ mode: 'ratio', value: r.pct, score: Math.round(KPI.round(r.pct, 6)) }, r) : r; }
    return KPI.weighted({ actual: K.actual, target: K.target, attendance: K.attend, weight: K.w });
  }
  function fx(n, d) { var r = Number(n.toFixed(d)); return (Math.abs(r - n) > 1e-9 ? '≈ ' : '') + r.toFixed(d); }
  function kpiChanged() { if (K.approved) { K.approved = false; K.cleared = true; } paintKpi(); }
  function setWeight(w) { w = Math.max(0, Math.min(1, Math.round(w * 100) / 100)); K.mode = 'weighted'; if (K.w !== w) { K.w = w; kpiChanged(); } else paintKpi(); }
  var calc = $('m-cases-kpi');
  function buildKpi() {
    if (!calc) return;
    clear(calc);
    function field(id, key, label, attrs) {
      var inp = el('input', Object.assign({ id: id, type: 'number', inputmode: 'decimal', step: 'any', value: K[key] }, attrs || {}));
      inp.addEventListener('input', function () { K[key] = inp.value; kpiChanged(); });
      return el('div', { class: 'field' }, el('label', { for: id }, bi(api.pair(label))), inp);
    }
    var seg = el('div', { class: 'lang-sw', id: 'kpiWeight', role: 'group', 'aria-labelledby': 'kpiWeightLabel' });
    [0.6, 0.7].forEach(function (w) {
      var t = Math.round(w * 100) + '/' + Math.round((1 - w) * 100);
      var b = api.button({ id: 'kpiW' + Math.round(w * 100), kind: 'tertiary', label: [t, t], onClick: function () { setWeight(w); } });
      b.el.setAttribute('data-w', String(w)); b.el.setAttribute('dir', 'ltr');
      seg.append(b.el);
    });
    var range = el('input', { type: 'range', id: 'kpiWRange', min: '0', max: '100', step: '5', value: String(Math.round(K.w * 100)), 'aria-labelledby': 'kpiWRangeLabel' });
    range.addEventListener('input', function () { setWeight(Number(range.value) / 100); });
    var cases = el('div', { class: 'card-acts', role: 'group', 'aria-labelledby': 'kpiCasesLabel' });
    [['kpi.case0', '16', '20', null, 'ratio'], ['kpi.case1', '16', '20', 0.6], ['kpi.case2', '16', '20', 0.7], ['kpi.case3', '16', '', null], ['kpi.case4', '16', '0', null]].forEach(function (c, i) {
      cases.append(api.button({ id: 'kpiCase' + i, kind: 'secondary', label: api.pair(c[0]), onClick: function () {
        K.actual = c[1]; K.target = c[2]; K.attend = '100'; K.mode = c[4] || 'weighted'; if (c[3] != null) K.w = c[3];
        $('kpiActual').value = K.actual; $('kpiTarget').value = K.target; $('kpiAttend').value = K.attend; kpiChanged();
      } }).el);
    });
    var approve = el('input', { type: 'checkbox', id: 'kpiApprove' });
    approve.addEventListener('change', function () { K.approved = approve.checked; K.cleared = false; paintKpi(); });
    var st = KPI ? KPI.selfTest() : { passed: 0, total: 0, pass: false };
    calc.append(
      el('div', { class: 'calc-head' }, el('h3', null, bi(api.pair('kpi.h'))), el('p', { class: 'note' }, bi(api.pair('kpi.sub'))),
        el('div', { class: 'calc-tags' }, api.chip('simulated', api.pair('kpi.sim')), api.chip('verified', api.pair('kpi.state')))),
      el('div', { class: 'calc-fields' }, field('kpiActual', 'actual', 'kpi.actual', { min: '0' }), field('kpiTarget', 'target', 'kpi.target', { min: '0' }), field('kpiAttend', 'attend', 'kpi.attend', { min: '0', max: '100' })),
      el('div', { class: 'calc-row' }, el('span', { class: 'field-label', id: 'kpiWeightLabel' }, bi(api.pair('kpi.weight'))), seg,
        el('div', { class: 'calc-wrow' }, el('label', { for: 'kpiWRange', id: 'kpiWRangeLabel', class: 'field-label' }, bi(api.pair('kpi.wRange'))), el('output', { class: 'mono', id: 'kpiWVal', for: 'kpiWRange' })), range),
      el('div', { class: 'calc-row' }, el('span', { class: 'field-label', id: 'kpiCasesLabel' }, bi(api.pair('kpi.cases'))), cases),
      el('div', { class: 'calc-out', role: 'status', 'aria-live': 'polite' },
        el('span', { class: 'field-label' }, bi(api.pair('kpi.result'))),
        el('output', { class: 'calc-big', id: 'kpiBig', for: 'kpiActual kpiTarget kpiAttend kpiWRange' }),
        el('p', { class: 'calc-formula', id: 'kpiFormula' }),
        el('div', { class: 'calc-bar', id: 'kpiBar', 'aria-hidden': 'true' }, el('span', { class: 'a', id: 'kpiBarA' }), el('span', { class: 'b', id: 'kpiBarB' })),
        el('ul', { class: 'calc-parts', id: 'kpiParts' }),
        el('p', { class: 'calc-why', id: 'kpiWhy' }),
        el('div', { class: 'calc-approve', id: 'kpiApproveBox' }, el('label', { for: 'kpiApprove' }, approve, bi(api.pair('kpi.approve'))), el('p', { id: 'kpiApproveNote' }))),
      el('div', { class: 'calc-foot' }, el('p', null, bi(api.pair('kpi.rule'))),
        el('p', { class: 'kpi-self', id: 'kpiSelf' }, api.chip(st.pass ? 'verified' : 'pending', api.TP('kpi.self', { p: [String(st.passed).replace(/[0-9]/g, function (d) { return '٠١٢٣٤٥٦٧٨٩'[d]; }), String(st.passed)], t: [String(st.total).replace(/[0-9]/g, function (d) { return '٠١٢٣٤٥٦٧٨٩'[d]; }), String(st.total)] }))),
        api.button({ id: 'kpiWatch', kind: 'secondary', icon: 'cinema', label: api.pair('kpi.watch'), onClick: function () { api.playFilm({ film: 5, lang: api.lang(), chapter: 'method', from: 'kpiWatch' }); } }).el));
    K.last = '';
    paintKpi();
  }
  function paintKpi(fromReveal) {
    if (!$('kpiBig')) return;
    var r = kpiCalc(), big = $('kpiBig'), why = $('kpiWhy'), formula = clear($('kpiFormula')), parts = clear($('kpiParts'));
    Array.prototype.forEach.call($('kpiWeight').querySelectorAll('button'), function (b) { b.setAttribute('aria-pressed', String(K.mode === 'weighted' && Math.abs(Number(b.getAttribute('data-w')) - K.w) < 1e-9)); });
    var wa = Math.round(K.w * 100);
    $('kpiWRange').value = String(wa);
    $('kpiWVal').textContent = num(wa + '/' + (100 - wa));
    $('kpiWRange').setAttribute('aria-valuetext', T('kpi.wNow', { a: num(wa), b: num(100 - wa) }));
    big.className = 'calc-big'; big.removeAttribute('data-signal'); $('kpiBar').hidden = true;
    if (r.status === 'invalid') { big.textContent = '—'; big.classList.add('is-review'); why.textContent = T('kpi.invalid'); }
    else if (r.status === 'review') {
      big.textContent = T('kpi.review'); big.classList.add('is-review'); why.textContent = T('kpi.reviewWhy');
      var tv = r.reason === 'target-missing' ? T('kpi.none') : num(String(KPI.read(K.target)));
      formula.append(api.lang() === 'ar' ? el('span', null, T('kpi.reviewLine', { t: tv })) : ltr(T('kpi.reviewLine', { t: tv }), 'mono'));
    } else {
      big.textContent = num(r.score) + (api.lang() === 'ar' ? '٪' : '%'); why.textContent = '';
      big.classList.add('is-computed'); big.setAttribute('data-signal', 'kpi');
      var pct = r.ratio * 100;
      formula.append(ltr(r.actual + ' ÷ ' + r.target + ' = ' + fx(r.ratio, 2) + '  →  ' + fx(pct, 1).replace('≈ ', '') + '%', 'mono'));
      if (r.mode === 'ratio') parts.append(el('li', null, T('kpi.ratioOnly')));
      else {
        formula.append(el('br'), ltr(r.weight.toFixed(2) + ' × ' + fx(pct, 1).replace('≈ ', '') + ' + ' + (1 - r.weight).toFixed(2) + ' × ' + fx(r.attendance, 1).replace('≈ ', '') + ' = ' + fx(r.value, 2) + (Math.abs(r.value - r.score) > 1e-9 ? '  →  ' + r.score : ''), 'mono'));
        var ach = r.parts.achievement, att = r.parts.attendance;
        $('kpiBar').hidden = false;
        var scale = Math.max(100, ach + att);
        $('kpiBarA').style.width = (ach / scale * 100).toFixed(2) + '%';
        $('kpiBarB').style.width = (att / scale * 100).toFixed(2) + '%';
        parts.append(el('li', null, el('i', { class: 'a', 'aria-hidden': 'true' }), T('kpi.achieve') + ' ', el('b', { text: num(Math.round(ach * 10) / 10) + ' ' + T('kpi.points') })),
          el('li', null, el('i', { class: 'b', 'aria-hidden': 'true' }), T('kpi.attendPart') + ' ', el('b', { text: num(Math.round(att * 10) / 10) + ' ' + T('kpi.points') })));
      }
    }
    var changed = K.last && K.last !== big.textContent;
    if (changed && window.FJFx) window.FJFx.lock(big);
    K.last = big.textContent;
    if (gauge) {    
      if (r.status === 'ok') gauge.set({ value: r.score, state: 'ok' }); else gauge.set({ state: 'review' });
      if ((changed || fromReveal) && window.FJFx) setTimeout(function () { window.FJFx.lock(gauge.el.querySelector('.sqds-gauge__big') || gauge.el); }, 420);
    }
    var ap = $('kpiApprove'), note = $('kpiApproveNote'), box = $('kpiApproveBox');
    if (r.status !== 'ok') K.approved = false;
    ap.disabled = r.status !== 'ok'; ap.checked = K.approved;
    box.classList.toggle('is-approved', !!K.approved);
    if (K.approved) box.setAttribute('data-signal', 'approved'); else box.removeAttribute('data-signal');
    note.textContent = K.approved ? T('kpi.approved') : K.cleared ? T('kpi.cleared') : r.status !== 'ok' ? T('kpi.cannot') : T('kpi.notApproved');
    if (window.FJHooks) window.FJHooks.emit('kpi', { id: 'calculator', result: r, weight: K.w, mode: K.mode, approved: !!K.approved, lang: api.lang(), el: calc });
  }
  buildKpi();
  api.onLang(function () { paintKpi(); });
};
