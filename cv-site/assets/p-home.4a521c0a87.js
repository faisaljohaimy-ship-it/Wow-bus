 
(window.FJPages = window.FJPages || {}).home = function (api) {
  'use strict';
  var D = document, S = window.SQDS, $ = function (id) { return D.getElementById(id); };
  var el = api.el, bi = api.bi, STR = api.strings, REL = api.release;
  var reduced = api.reducedMotion;

   
  var row = $('instRow');
  if (row) {
    var sum = api.data.summary || {};
    var films = sum.films || 20, topics = sum.filmsPerLang || 10;
    var c = S.counter({ label: STR['mp.inst.films'], value: reduced ? films : 0, unit: ['فيلمًا', 'films'], status: 'verified',
      formula: [String(topics).replace(/[0-9]/g, function (d) { return '٠١٢٣٤٥٦٧٨٩'[d]; }) + ' موضوعات × لغتان', topics + ' topics × 2 languages'] });
    c.el.setAttribute('data-fx', 'inst');
    c.el.__fxSet = function (instant) { c.set({ value: films }); if (!instant && window.FJFx) setTimeout(function () { window.FJFx.lock(c.el.querySelector('.sqds-counter__num') || c.el); }, 450); };
    var note1 = el('p', { class: 'sqds-inst__note' }, bi(STR['mp.inst.filmsNote']));
    c.el.append(note1);
    var K = window.FJKPI, r = K ? K.ratio(16, 20) : null, st = K ? K.selfTest() : { pass: false };
    var val = r && r.status === 'ok' ? Math.round(K.round(r.pct, 6)) : 0;
    var g = S.gauge({ label: STR['mp.inst.kpi'], value: reduced ? val : 0, max: 100, unit: '%', status: st.pass ? 'verified' : 'pending', note: STR['mp.inst.kpiNote'] });
    g.el.setAttribute('data-fx', 'inst'); g.el.setAttribute('data-signal', 'kpi'); g.el.id = 'homeKpi';
    g.el.__fxSet = function (instant) { g.set({ value: val }); if (!instant && window.FJFx) setTimeout(function () { window.FJFx.lock(g.el.querySelector('.sqds-gauge__big') || g.el); }, 450); };
    var relId = REL.id === 'local build' ? bi(api.pair('rel.local')) : el('code', { translate: 'no' }, REL.id);
    var ri = el('figure', { class: 'rel-inst sqds-inst', 'data-sqds': 'release', 'data-fx': 'inst', 'data-sqds-slot': 'release-stamp' },
      el('figcaption', { class: 'ri-label' }, bi(STR['mp.inst.rel'])),
      el('p', { class: 'ri-id', 'data-signal': 'release' }, relId),
      el('div', { class: 'ri-rows' },
        REL.commit ? el('span', null, bi(api.pair('rel.commit')), ' ', el('code', { translate: 'no' }, String(REL.commit).slice(0, 12))) : null,
        REL.build ? el('span', null, bi(['مفتاح المحتوى', 'content key']), ' ', el('code', { translate: 'no' }, REL.build)) : null,
        REL.builtAt ? el('span', null, bi(api.pair('rel.built')), ' ', el('bdi', { dir: 'ltr' }, REL.builtAt.replace('T', ' ').replace('Z', ' UTC'))) : null),
      el('p', { class: 'ri-note' }, bi(STR['mp.inst.relNote'])),
      el('div', null, api.button({ kind: 'tertiary', label: api.site.pages.filter(function (p) { return p.id === 'evidence'; })[0].nav, href: '/evidence/#release', trailing: true }).el));
    row.append(c.el, g.el, ri);
  }

   
  var tiles = $('pageTiles');
  if (tiles) {
    var SC = (api.site.scenarios || {}).home || {};
    api.site.pages.filter(function (p) { return p.id !== 'home'; }).forEach(function (p, i) {
      var sc = SC[p.id];
      var details = el('div', { class: 'det-block' },
        el('p', null, bi(p.desc)),
        sc ? api.loopSlot('page-' + p.id, { steps: sc.steps }, { id: 'scn-' + p.id }) : null,
        sc ? el('p', { class: 'scn-note' }, bi(STR['mp.scenario.note'])) : null);
      var open = api.button({ kind: 'primary', label: STR['mp.open'], href: p.path, trailing: true, id: 'tile-go-' + p.id });
      open.el.setAttribute('aria-label', api.P(STR['mp.open']) + ': ' + api.P(p.nav));
      api.onLang(function () { open.el.setAttribute('aria-label', api.P(STR['mp.open']) + ': ' + api.P(p.nav)); });
      var cd = api.card({ id: 'tile-' + p.id, icon: p.icon, kicker: api.biNum([p.num, p.num]), title: p.nav, capability: p.intro, details: details, variant: 'a', focusMode: false, headingLevel: 3, actions: [open], fx: 'card-cap' });
      tiles.append(cd.el);
    });
    tiles.classList.remove('reserve');
  }
};
