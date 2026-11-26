 
(window.FJPages = window.FJPages || {}).evidence = function (api) {
  'use strict';
  var D = document, W = window, $ = function (id) { return D.getElementById(id); };
  var el = api.el, bi = api.bi, STR = api.strings, P = api.P, T = api.T, clear = api.clear, pad2 = api.pad2;
  var LEDGER = W.LEDGER || [], STATUS = W.STATUS || {};
  var SUMMARY = api.data.summary || {};
  var SCALE = ['verified', 'demonstrated', 'simulated', 'planned', 'unverified'];
  var ENVS = ['production', 'uat', 'demo', 'site', 'none'];
  var ENV_ICON = { production: 'deployment', uat: 'security', demo: 'cinema', site: 'motion', none: 'evidence' };
  function rowStatus(r) { if (r.dynamic === 'voice') return (SUMMARY.narrated || 0) > 0 || SUMMARY.edition4 > 0 ? 'observed' : 'proposed'; return r.status; }
  function rowScale(r) { return api.ladder(rowStatus(r)); }
  function rowText(r, field) {
    var p = r[field]; if (!Array.isArray(p)) return p;
    return p.map(function (s, i) {
      s = String(s);
      var dig = function (n) { return i === 0 ? String(n).replace(/[0-9]/g, function (d) { return '٠١٢٣٤٥٦٧٨٩'[d]; }) : String(n); };
      if (r.dynamic === 'films') s = s.split('{e4}').join(dig(SUMMARY.edition4 || 0));
      if (r.dynamic === 'voice') s = s.split('{nv}').join(dig(SUMMARY.narrated || 0));
      return s;
    });
  }
  function envPair(env) { return api.pair('ledger.envH.' + (env || 'none')); }
  function accEl(r) { var a = r.access || 'none'; return el('span', { class: 'acc acc-' + a }, bi(api.pair('ledger.acc.' + a))); }
  var cards = {};
  var F = { filter: 'all' };

   
  function ledgerBody(r) {
    var detail = rowStatus(r), scale = rowScale(r);
    var dl = el('dl', { class: 'ev-dl' },
      el('div', null, el('dt', null, bi(api.pair('ledger.cid'))), el('dd', null, el('code', { class: 'row-cid', translate: 'no' }, r.cid || r.id))),
      el('div', null, el('dt', null, bi(api.pair('ledger.status'))), el('dd', null, api.chip(scale, null), detail !== scale ? [' ', el('span', { class: 'note' }, bi(api.pair('ledger.detail')), ': ', bi((STATUS[detail] || { label: [detail, detail] }).label))] : null)),
      el('div', null, el('dt', null, bi(api.pair('ledger.proves'))), el('dd', null, bi(rowText(r, 'proves')))),
      el('div', null, el('dt', null, bi(api.pair('ledger.limit'))), el('dd', null, bi(rowText(r, 'limit')))),
      el('div', null, el('dt', null, bi(api.pair('ledger.source'))), el('dd', null, bi(r.source))),
      el('div', null, el('dt', null, bi(api.pair('ledger.date'))), el('dd', null, api.ltr(r.asOf, 'mono'))),
      el('div', null, el('dt', null, bi(api.pair('ledger.env'))), el('dd', null, bi(envPair(r.env)))),
      el('div', null, el('dt', null, bi(api.pair('ledger.access'))), el('dd', null, accEl(r), ' — ', bi(api.pair('ledger.accH.' + (r.access || 'none'))))));
    var acts = el('div', { class: 'card-acts' });
    if (r.film) acts.append(api.button({ id: 'lw-' + r.id, kind: 'secondary', icon: 'cinema', label: api.TP('ledger.watch', { n: [String(pad2(r.film)).replace(/[0-9]/g, function (d) { return '٠١٢٣٤٥٦٧٨٩'[d]; }), pad2(r.film)] }),
      onClick: function () { api.playFilm({ film: r.film, lang: api.lang(), chapter: 'result', from: 'lw-' + r.id }); } }).el);
    if (r.go === 'kpi') acts.append(api.button({ kind: 'tertiary', label: api.pair('ledger.tryCalc'), href: '/projects/#kpi', trailing: true }).el);
    if (r.go === 'factory') acts.append(api.button({ kind: 'tertiary', label: api.pair('ledger.openFactory'), href: '/company/#method', trailing: true }).el);
    return el('div', { class: 'det-wrap' }, dl, r.text ? el('pre', { class: 'ev-src', tabindex: '0', 'aria-label': T('ledger.excerpt') }, r.text) : null, acts.childNodes.length ? acts : null);
  }
  function renderLedger() {
    var rows = $('ledgerRows'); if (!rows) return;
    clear(rows);
    ENVS.forEach(function (env) {
      var list = LEDGER.filter(function (r) { return (r.env || 'none') === env; });
      if (!list.length) return;
      var group = el('section', { class: 'env-group', id: 'env-' + env, 'data-env': env, 'aria-labelledby': 'envh-' + env },
        el('div', { class: 'env-h' }, el('h3', { id: 'envh-' + env }, bi(envPair(env))), el('p', null, bi(api.pair('ledger.envP.' + env)))));
      var grid = el('div', { class: 'grid-cards cols-2' });
      list.forEach(function (r) {
        var cap = [r.asOf + ' · ', r.asOf + ' · '];
        var accL = api.pair('ledger.acc.' + (r.access || 'none')) || ['', ''];
        cap = [String(r.asOf) + ' · ' + accL[0], String(r.asOf) + ' · ' + accL[1]];
        var c = api.card({ id: 'row-' + r.id, icon: ENV_ICON[env] || 'evidence', kicker: [(r.cid || r.id) + ' · ' + envPair(env)[0], (r.cid || r.id) + ' · ' + envPair(env)[1]], title: rowText(r, 'claim'), capability: cap,
          status: rowScale(r), details: ledgerBody(r), variant: 'c', focusMode: false, headingLevel: 4, fx: 'row' });
        c.el.setAttribute('data-scale', rowScale(r)); c.el.setAttribute('data-env', env); c.el.setAttribute('data-access', r.access || 'none'); c.el.setAttribute('data-cid', r.cid || '');
        cards[r.id] = c;
        grid.append(c.el);
      });
      group.append(grid);
      rows.append(group);
    });
    rows.classList.remove('reserve');
    if (W.FJHooks) W.FJHooks.emit('ledger', { id: 'ledger', lang: api.lang(), filter: F.filter, rows: LEDGER.map(function (r) { return { id: r.id, cid: r.cid, scale: rowScale(r), detail: rowStatus(r), env: r.env || 'none', access: r.access || 'none', date: r.asOf, film: r.film || null }; }), el: rows });
  }
  function applyFilter() {
    LEDGER.forEach(function (r) { var c = cards[r.id]; if (c) c.el.hidden = !(F.filter === 'all' || rowScale(r) === F.filter); });
    Array.prototype.forEach.call(D.querySelectorAll('.env-group'), function (g) { g.hidden = !g.querySelector('.sqds-card:not([hidden])'); });
    Array.prototype.forEach.call(D.querySelectorAll('#ledgerFilters button'), function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-f') === F.filter)); });
  }
  function renderFilters() {
    var box = $('ledgerFilters'); if (!box) return;
    clear(box);
    var counts = {}; LEDGER.forEach(function (r) { var s = rowScale(r); counts[s] = (counts[s] || 0) + 1; });
    ['all'].concat(SCALE.filter(function (s) { return counts[s]; })).forEach(function (s) {
      var n = s === 'all' ? LEDGER.length : counts[s];
      var lab = s === 'all' ? api.pair('ledger.all') : (W.SQDS.status[s] || {}).label || [s, s];
      var b = api.button({ id: 'lf-' + s, kind: 'tertiary', label: [lab[0] + ' · ' + String(n).replace(/[0-9]/g, function (d) { return '٠١٢٣٤٥٦٧٨٩'[d]; }), lab[1] + ' · ' + n], onClick: function () { F.filter = s; applyFilter(); } });
      b.el.setAttribute('data-f', s);
      box.append(b.el);
    });
    var bar = clear($('coverBar'));
    SCALE.forEach(function (s) { if (counts[s]) bar.append(el('span', { class: 'seg-' + s, style: 'flex:' + counts[s] })); });
    var tot = $('coverTotal'); clear(tot);
    tot.append(bi([
      String(LEDGER.length).replace(/[0-9]/g, function (d) { return '٠١٢٣٤٥٦٧٨٩'[d]; }) + ' ' + api.pair('ledger.count')[0] + ' · ' + SCALE.filter(function (s) { return counts[s]; }).map(function (s) { return W.SQDS.status[s].label[0] + ' ' + String(counts[s]).replace(/[0-9]/g, function (d) { return '٠١٢٣٤٥٦٧٨٩'[d]; }); }).join(' · '),
      LEDGER.length + ' ' + api.pair('ledger.count')[1] + ' · ' + SCALE.filter(function (s) { return counts[s]; }).map(function (s) { return W.SQDS.status[s].label[1] + ' ' + counts[s]; }).join(' · ')]));
  }
  function renderLegend() {
    var list = $('legend'); if (!list) return;
    clear(list);
    SCALE.forEach(function (s) { list.append(el('li', null, el('div', { class: 'det-row' }, api.chip(s), bi((STATUS[s] || W.SQDS.status[s] || {}).help)))); });
    ['public', 'private', 'none'].forEach(function (a) { list.append(el('li', null, el('div', { class: 'det-row' }, accEl({ access: a }), bi(api.pair('ledger.accH.' + a))))); });
    list.append(el('li', null, el('p', { class: 'note' }, bi(api.pair('ledger.mapNote')))));
  }
  renderFilters(); renderLedger(); renderLegend(); applyFilter();

   
  var envCols = $('envCols');
  if (envCols) ['production', 'uat', 'demo'].forEach(function (env) {
    var list = LEDGER.filter(function (r) { return (r.env || 'none') === env; });
    var ids = el('div', { class: 'id-chips' }, list.map(function (r) { return el('a', { href: '#row-' + r.id }, (r.cid || r.id)); }));
    var n = list.length;
    var c = api.card({ id: 'envc-' + env, icon: env === 'production' ? 'deployment' : env === 'uat' ? 'security' : 'cinema', kicker: [String(n).replace(/[0-9]/g, function (d) { return '٠١٢٣٤٥٦٧٨٩'[d]; }) + ' ' + api.pair('ledger.count')[0], n + ' ' + api.pair('ledger.count')[1]],
      title: envPair(env), capability: api.pair('ledger.envP.' + env), details: el('div', { class: 'det-block' }, ids), variant: 'c', focusMode: false, headingLevel: 3, fx: 'rise' });
    envCols.append(c.el);
  });
  D.addEventListener('click', function (e) {    
    var a = e.target.closest && e.target.closest('a[href^="#row-"]'); if (!a) return;
    var n = $(a.getAttribute('href').slice(1)); if (!n) return;
    e.preventDefault(); api.reveal(n); n.scrollIntoView({ block: 'start', behavior: api.reducedMotion ? 'auto' : 'smooth' });
    try { history.replaceState(history.state, '', a.getAttribute('href')); } catch (x) {   }
  });

   
  var qh = $('qualityHost');
  if (qh) {
    var qRoot = el('div', { class: 'wrap mod-host', id: 'm-quality' }, el('p', { class: 'mod-loading' }, bi(['جارٍ التحميل…', 'Loading…'])));
    var qsc = (((api.site.scenarios || {}).modules) || {}).quality;
    var qDet = el('div', { class: 'det-wrap' }, qsc ? api.loopSlot('mod-quality', { steps: qsc.steps }, { id: 'scn-mod-quality' }) : null, qsc ? el('p', { class: 'scn-note' }, bi(STR['mp.scenario.note'])) : null, qRoot);
    var qc = api.card({ id: 'card-quality', icon: 'performance', kicker: ['البوابات', 'Gates'], title: api.pair('cap.quality.t'), capability: api.pair('cap.quality.s'), details: qDet, detailsLabel: STR['mp.proj.open'], variant: 'a', focusMode: false, headingLevel: 3,
      onToggle: function (open) { if (open) api.mountModule('quality', qRoot); } });
    qc.el.classList.add('wide'); qc.el.setAttribute('data-module', 'quality');
    qh.append(qc.el);
  }

   
  var fq = api.data.filmqa, fh = $('filmqaHost');
  if (fh && fq && fq.rows) {
    var ok = fq.rows.filter(function (x) { return x.ok; }).length, tot = fq.rows.length;
    var th = function (p) { return el('th', { scope: 'col' }, bi(p)); };
    var table = el('div', { class: 'table-scroll', tabindex: '0', role: 'region', 'aria-label': T('mp.ev.filmqa') }, el('table', { class: 'filmqa' },
      el('thead', null, el('tr', null, th(['الملف', 'File']), th(['المدة', 'Duration']), th(['الأبعاد', 'Size']), th(['الإطارات/ث', 'fps']), th(['الصوت', 'Audio']), th(['ترجمة', 'Subtitles']), th(['بدء سريع', 'Fast start']), th(['الحجم', 'Bytes']), th(['الجهارة', 'Loudness']))),
      el('tbody', null, fq.rows.map(function (x) {
        return el('tr', null, el('td', null, x.key), el('td', null, (x.duration || 0).toFixed(2) + ' s'), el('td', null, x.width + '×' + x.height), el('td', null, x.fps), el('td', null, x.audio || '—'),
          el('td', null, String(x.subtitles)), el('td', null, x.faststart ? '✓' : '—'), el('td', null, String(x.bytes)), el('td', null, x.lufs != null ? x.lufs + ' LUFS · ' + x.tp + ' dBTP' : '—'));
      }))));
    var line = [String(ok).replace(/[0-9]/g, function (d) { return '٠١٢٣٤٥٦٧٨٩'[d]; }) + ' من ' + String(tot).replace(/[0-9]/g, function (d) { return '٠١٢٣٤٥٦٧٨٩'[d]; }) + ' ملفًا اجتازت الفحص: بلا مسار ترجمة، ' + fq.summary.ar, ok + ' of ' + tot + ' files pass: no subtitle stream, ' + fq.summary.en];
    var fc = api.card({ id: 'card-filmqa', icon: 'cinema', kicker: ['قيس عند البناء', 'Measured at build'], title: api.pair('mp.ev.filmqa'), capability: line, status: ok === tot ? 'verified' : 'unverified',
      details: el('div', { class: 'det-wrap' }, table, el('p', { class: 'det-ev' }, bi(fq.note))), variant: 'c', focusMode: false, headingLevel: 3, fx: 'row' });
    fc.el.classList.add('wide');
    fh.append(fc.el);
  }

   
  var rh = $('releaseHost'), REL = api.release;
  if (rh) {
    var relRows = el('dl', { class: 'ev-dl' },
      el('div', null, el('dt', null, bi(api.pair('rel.label'))), el('dd', { 'data-signal': 'release', style: 'color:var(--sqds-gold)' }, REL.id === 'local build' ? bi(api.pair('rel.local')) : el('code', { translate: 'no' }, REL.id))),
      REL.commit ? el('div', null, el('dt', null, bi(api.pair('rel.commit'))), el('dd', null, el('code', { translate: 'no' }, REL.commit))) : null,
      el('div', null, el('dt', null, bi(['مفتاح المحتوى', 'Content key'])), el('dd', null, el('code', { translate: 'no' }, REL.build || '—'))),
      el('div', null, el('dt', null, bi(api.pair('rel.built'))), el('dd', null, el('bdi', { dir: 'ltr' }, (REL.builtAt || '').replace('T', ' ').replace('Z', ' UTC')))),
      el('div', null, el('dt', null, bi(['المصدر', 'Source'])), el('dd', null, el('code', { translate: 'no' }, REL.source || '—'))));
    var rc = api.card({ id: 'card-release', icon: 'deployment', kicker: ['الإصدار', 'Release'], title: ['إصدار يمكن تتبّعه', 'A release you can trace'], capability: STR['mp.inst.relNote'], status: 'verified', statusLabel: ['مُعرَّف في هذا البناء', 'Identified in this build'],
      details: relRows, variant: 'c', focusMode: false, headingLevel: 3, fx: 'row' });
    rc.el.setAttribute('data-sqds-slot', 'release-stamp');
    var rb = REL.rollback || null;
    var rbc = api.card({ id: 'card-rollback', icon: 'automation', kicker: STR['mp.ev.rollback'], title: rb ? [rb, rb] : STR['mp.ev.rollback'], capability: rb ? ['البناء السابق الذي يمكن الرجوع إليه', 'The previous build to roll back to'] : STR['mp.ev.rollbackNone'],
      status: rb ? 'demonstrated' : 'unverified', statusLabel: rb ? null : ['غير مسجَّل', 'Not recorded'], details: el('p', null, bi(api.pair('cap.quality.s'))), variant: 'c', focusMode: false, headingLevel: 3, fx: 'row' });
    rh.append(rc.el, rbc.el);
  }

   
  function openFromHash() {
    var h = (W.location.hash || '').slice(1);
    var m = /^open=([\w,-]+)$/.exec(h);
    var ids = m ? m[1].split(',') : (/^row-[\w-]+$/.test(h) ? [h.slice(4)] : []);
    ids.forEach(function (id) { var c = cards[id]; if (c && !c.expanded) c.toggle(true, { silent: true }); });
    var first = ids.length ? $('row-' + ids[0]) : null;
    if (first) W.requestAnimationFrame(function () { first.scrollIntoView({ block: 'start', behavior: 'instant' }); var b = first.querySelector('.sqds-card__toggle'); if (b) b.focus({ preventScroll: true }); });
  }
  openFromHash();
  W.addEventListener('hashchange', openFromHash);
};
