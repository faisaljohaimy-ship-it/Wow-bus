 
(window.FJPages = window.FJPages || {}).motionlab = function (api) {
  'use strict';
  var D = document, $ = function (id) { return D.getElementById(id); };
  var el = api.el, bi = api.bi, STR = api.strings;
  var LAB = api.data.motionlab || { motions: [] };
  function dig(s) { return String(s).replace(/[0-9]/g, function (d) { return '٠١٢٣٤٥٦٧٨٩'[d]; }); }
  var host = $('labCards'); if (!host) return;
  LAB.motions.forEach(function (m) {
    var f = m.files || {};
    var slot = api.loopSlot(null, null, { files: { mp4: f.mp4, webm: f.webm, webp: f.poster }, tag: STR['mp.lab.preview'] });
    var q = m.qa || {}, yes = q.endsAtRest ? STR['mp.lab.yes'] : STR['mp.lab.no'];
    var qaLine = api.TP('mp.lab.qaLine', { f: [dig(q.frames || 0), String(q.frames || 0)], d: [dig(q.determinism || 0), String(q.determinism || 0)], r: yes });
    var details = el('div', { class: 'det-wrap' },
      el('p', { class: 'det-ev' }, bi(qaLine)),
      el('p', { class: 'det-ev' }, bi(STR['mp.lab.tier']), ': ', bi(STR['mp.lab.tier.' + m.tier] || [m.tier, m.tier])));
    var c = api.card({ id: 'lab-' + m.id, icon: 'motion', kicker: [m.id + ' · ' + dig(m.seconds) + ' ث', m.id + ' · ' + m.seconds + ' s'], title: m.name, capability: m.meaning,
      example: m.used, exampleLabel: STR['mp.lab.used'], status: q.pass ? 'verified' : 'unverified', statusLabel: q.pass ? STR['mp.lab.qaPass'] : STR['mp.lab.qaFail'],
      details: details, slot: slot, variant: 'b', focusMode: false, headingLevel: 3, scn: false, fx: 'card-cap' });
    c.el.setAttribute('data-motion', m.id);
    host.append(c.el);
  });
};
