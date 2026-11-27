 
(window.FJPages = window.FJPages || {}).home = function (api) {
  'use strict';
  var W = window, D = document, S = W.SQDS, $ = function (id) { return D.getElementById(id); };
  var el = api.el, bi = api.bi, STR = api.strings, REL = api.release, pad2 = api.pad2;
  var reduced = api.reducedMotion;
  var SUM = api.data.summary || {}, CAPS = (api.data.capabilities || {}).cards || [], SOLS = (api.data.solutions || {}).solutions || [], METHOD = (api.data.method || {}).steps || [];
  function dig(s, l) { return l === 'ar' ? String(s).replace(/[0-9]/g, function (d) { return '٠١٢٣٤٥٦٧٨٩'[d]; }) : String(s); }

   
   
  api.mountSpatial($('spatialSlot'));

   
  api.capPanels($('capPanels'), CAPS);

   
  var bs = $('buildStrip');
  if (bs && METHOD.length) {
    var wf = S.workflow({ id: 'homeMethod', label: STR['mp.how.graph'], variant: 'a', headingLevel: 3,
      steps: METHOD.map(function (s) { return { key: s.key, icon: s.icon, label: s.title, title: s.title, text: (s.stages[0] || {}).text || s.title }; }) });
    wf.el.setAttribute('data-fx', 'rise');
    bs.append(wf.el, el('div', { class: 'cta-row' }, api.button({ kind: 'primary', label: STR['mp.home.build'], href: '/how-we-build/', trailing: true }).el));
  }

   
  var st = $('solTeaser');
  if (st) {
    SOLS.forEach(function (so, i) {
      var go = api.button({ kind: 'primary', label: STR['mp.sol.open'], href: '/solutions/' + so.slug + '/', trailing: true, id: 'sol-go-' + so.slug });
      var details = el('div', { class: 'det-wrap' }, el('p', null, bi((so.problem[0] || {}).text)),
        api.loopSlot('sol-' + so.slug, { steps: so.diagram }, { id: 'scn-home-sol-' + i }), el('p', { class: 'scn-note' }, bi(STR['mp.scenario.note'])));
      var c = api.card({ id: 'teaser-' + so.slug, icon: so.icon, kicker: [dig(pad2(i + 1), 'ar'), pad2(i + 1)], title: so.title, capability: so.intro, details: details, variant: 'a', focusMode: false, headingLevel: 3, actions: [go], fx: 'card-cap' });
      st.append(c.el);
    });
    st.classList.remove('reserve');
  }

   
  var strip = $('evStrip');
  (SUM.figures || []).forEach(function (f) {
    strip.append(el('figure', { class: 'ev-fig', 'data-fx': 'row' },
      el('p', { class: 'ev-fig-v', 'data-signal': f.signal || null }, el('bdi', { dir: 'ltr' }, f.value[1] || f.value)),
      el('figcaption', null, el('span', { class: 'ev-fig-l' }, bi(f.label)), el('span', { class: 'ev-fig-m' }, api.chip(f.state, null), ' ', bi(f.method), ' · ', el('bdi', { dir: 'ltr' }, f.date)))));
  });
  var row = $('instRow');
  if (row) {
    var films = SUM.films || 20, topics = SUM.filmsPerLang || 10;
    var c = S.counter({ label: STR['mp.inst.films'], value: reduced ? films : 0, unit: ['فيلمًا', 'films'], status: 'verified', formula: [dig(topics, 'ar') + ' موضوعات × لغتان', topics + ' topics × 2 languages'] });
    c.el.setAttribute('data-fx', 'inst');
    c.el.__fxSet = function (instant) { c.set({ value: films }); if (!instant && W.FJFx) setTimeout(function () { W.FJFx.lock(c.el.querySelector('.sqds-counter__num') || c.el); }, 450); };
    c.el.append(el('p', { class: 'sqds-inst__note' }, bi(STR['mp.inst.filmsNote'])));
    var K = W.FJKPI, r = K ? K.ratio(16, 20) : null, stt = K ? K.selfTest() : { pass: false };
    var val = r && r.status === 'ok' ? Math.round(K.round(r.pct, 6)) : 0;
    var g = S.gauge({ label: STR['mp.inst.kpi'], value: reduced ? val : 0, max: 100, unit: '%', status: stt.pass ? 'verified' : 'pending', note: STR['mp.inst.kpiNote'] });
    g.el.setAttribute('data-fx', 'inst'); g.el.setAttribute('data-signal', 'kpi'); g.el.id = 'homeKpi';
    g.el.__fxSet = function (instant) { g.set({ value: val }); if (!instant && W.FJFx) setTimeout(function () { W.FJFx.lock(g.el.querySelector('.sqds-gauge__big') || g.el); }, 450); };
    var relId = REL.id === 'local build' ? bi(api.pair('rel.local')) : el('code', { translate: 'no' }, REL.id);
    var ri = el('figure', { class: 'rel-inst sqds-inst', 'data-sqds': 'release', 'data-fx': 'inst', 'data-sqds-slot': 'release-stamp' },
      el('figcaption', { class: 'ri-label' }, bi(STR['mp.inst.rel'])),
      el('p', { class: 'ri-id', 'data-signal': 'release' }, relId),
      el('div', { class: 'ri-rows' },
        REL.commit ? el('span', null, bi(api.pair('rel.commit')), ' ', el('code', { translate: 'no' }, String(REL.commit).slice(0, 12))) : null,
        REL.build ? el('span', null, bi(['مفتاح المحتوى', 'content key']), ' ', el('code', { translate: 'no' }, REL.build)) : null,
        REL.builtAt ? el('span', null, bi(api.pair('rel.built')), ' ', el('bdi', { dir: 'ltr' }, REL.builtAt.replace('T', ' ').replace('Z', ' UTC'))) : null),
      el('p', { class: 'ri-note' }, bi(STR['mp.inst.relNote'])));
    row.append(c.el, g.el, ri);
  }
  var gal = $('liveGallery');
  (SUM.systems || []).forEach(function (sy) {
    var c2 = api.card({ id: 'sys-' + sy.key, scn: ((api.site.scenarios || {}).home || {}).work ? api.site.scenarios.home.work.steps : null, icon: sy.icon, kicker: sy.envLabel, title: sy.name, capability: sy.what, example: sy.proves, exampleLabel: ['ما يثبته السجل', 'What the record shows'],
      status: api.ladder(sy.status), statusLabel: (W.STATUS[sy.status] || {}).label, variant: 'c', focusMode: false, headingLevel: 3, fx: 'row',
      details: el('div', { class: 'det-wrap' }, el('p', { class: 'det-ev' }, bi(STR['mp.home.notLive']), ' · ', el('bdi', { dir: 'ltr' }, sy.date)), el('p', { class: 'id-chips' }, api.claimLink(sy.claim))),
      actions: [api.button({ kind: 'tertiary', label: ['الأعمال', 'Work'], href: '/work/#cases', trailing: true })] });
    c2.el.setAttribute('data-env', sy.env);
    gal.append(c2.el);
  });

   
  var fs = $('filmSlot'), CF = api.page.companyFilm || {};
  function paintFilm() {
    api.clear(fs);
    var l = api.lang(), f = CF[l];
    if (f && f.src) {
      var v = el('video', { controls: true, preload: 'none', playsinline: true, poster: f.poster || null, src: f.src, class: 'company-film', 'aria-label': api.T('mp.home.film') });
      v.addEventListener('play', function () { api.claimMedia(v); });
      fs.append(el('div', { class: 'company-film-frame' }, v));
      $('sFilmP').hidden = true;
    } else {
      var t10 = '/posters/' + l + '-10.jpg';
      fs.append(el('a', { class: 'film-teaser fx-wipe', href: '/films/', 'data-fx': 'tile' }, el('img', { src: t10.replace('/posters/', '/thumbs/'), alt: '', loading: 'lazy', width: '480', height: '270' }),
        el('span', { class: 'film-teaser-t' }, bi(STR['mp.cta.films']))));
    }
  }
  paintFilm(); api.onLang(paintFilm);

   
  var cc = $('contactCta');
  if (cc) cc.append(api.button({ id: 'ctaMeeting', kind: 'primary', size: 'lg', icon: 'decision', label: STR['mp.cta.meeting'], href: '/contact/?type=demo', magnetic: true }).el,
    api.button({ id: 'ctaProposal', kind: 'secondary', size: 'lg', icon: 'projects', label: STR['mp.cta.proposal'], href: '/contact/?type=proposal' }).el);
};
