 
(window.FJPages = window.FJPages || {}).films = function (api) {
  'use strict';
  var W = window, D = document, S = W.SQDS;
  var $ = function (id) { return D.getElementById(id); };
  var root = D.documentElement;
  var P = api.P, T = api.T, el = api.el, num = api.num, chip = api.chip, clear = api.clear, pad2 = api.pad2, store = api.store;
  var SEQ = api.data.sequence || { topics: [], items: [], chapterIds: [] };
  var reduced = api.reducedMotion;
  var lang = api.lang();
  var TOPIC_ICON = { 1: 'systems', 2: 'code', 3: 'ai', 4: 'agents', 5: 'data', 6: 'integration', 7: 'motion', 8: 'deployment', 9: 'automation', 10: 'projects' };
  var CH_ICON = { hook: 'inputs', problem: 'problem', result: 'result', closing: 'evidence' };
  function listFor(l) {
    var pl = SEQ.playlists && SEQ.playlists[l];
    if (Array.isArray(pl)) return pl;
    return (SEQ.items || []).filter(function (i) { return i.kind === 'bridge' || i.lang === l; });
  }
  var ITEMS = listFor(lang);
  var TOPICS = SEQ.topics || [];
  var CH_IDS = SEQ.chapterIds || ['hook', 'problem', 'method', 'result', 'closing'];
  var FILM_TOTAL = ITEMS.filter(function (i) { return i.kind === 'film'; }).length;
  var SUMMARY = SEQ.summary || {};
  var v = $('cinVideo');
  var C = {
    idx: 0, mode: 'film', missing: false, nextUp: false, auto: true, muted: true,
    started: false, autoTried: false, blocked: false, userPaused: false, held: null, expectPause: false,
    pendingTime: null, wantPlay: false, rev: 0, onReady: null, seekTimer: null,
    bridgeLeft: 0, bridgeTotal: 0, bridgeHold: false, bridgeTimer: null, ptrAt: 0,
    from: null, inView: false, played: {}, warmed: {}, noticeText: '', navGen: 0, errInfo: null, saveAt: 0, lastKey: null,
  };
  function svgPath(d, fill) {
    var ns = 'http://www.w3.org/2000/svg', s = D.createElementNS(ns, 'svg'), p = D.createElementNS(ns, 'path');
    s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('aria-hidden', 'true'); s.setAttribute('class', 'ic');
    p.setAttribute('d', d); if (fill) p.setAttribute('fill', 'currentColor'); else { p.setAttribute('fill', 'none'); p.setAttribute('stroke', 'currentColor'); p.setAttribute('stroke-width', '1.8'); p.setAttribute('stroke-linecap', 'round'); p.setAttribute('stroke-linejoin', 'round'); }
    s.appendChild(p); return s;
  }
  function host(id, b) { var h = $(id); if (h) { clear(h); h.append(b.el); } return b; }
   
  var bRetry = host('ovRetryHost', api.button({ id: 'ovRetry', kind: 'primary', label: api.pair('cin.retry'), onClick: function () { loadItem(C.idx, { play: true }); } }));
  var bSkip = host('ovSkipHost', api.button({ id: 'ovSkip', kind: 'secondary', label: api.pair('cin.skipFilm'), onClick: function () { if (C.idx + 1 < ITEMS.length) loadItem(C.idx + 1, { play: true }); else { C.mode = 'end'; paint(); } } }));
  var bNextGo = host('ovNextHost', api.button({ id: 'ovNextBtn', kind: 'primary', label: api.pair('cin.nextGo'), onClick: function () { var n = nextTarget(); if (n >= 0) loadItem(n, { play: true }); } }));
  var bEndGo = host('ovEndGoHost', api.button({ id: 'ovEndGo', kind: 'primary', label: api.pair('cin.endGo'), icon: 'decision', href: '/workflows/' }));
  var bEndAgain = host('ovEndAgainHost', api.button({ id: 'ovEndAgain', kind: 'secondary', label: api.pair('cin.endAgain'), onClick: function () { C.played = {}; loadItem(0, { play: true }); } }));
  var bBridgeGo = host('bGoHost', api.button({ id: 'bGo', kind: 'primary', label: ['', ''], onClick: function () { loadItem(C.idx + 1, { play: true }); } }));
  var bBack = host('cinBackHost', api.button({ id: 'cinBack', kind: 'secondary', label: api.pair('cin.backHyp'), icon: 'decision', onClick: function () { backToReading(); } }));
  bBack.el.hidden = true;
  var bEvidence = api.button({ id: 'cinEvidence', kind: 'secondary', label: api.pair('cin.evidence'), icon: 'evidence', onClick: function () { var t = topicOf((current() || {}).topic); if (t) openEvidence(t.evidence || []); } });
  $('cinActs').append(bEvidence.el);
  var bFlows = api.button({ id: 'cinToHyp', kind: 'tertiary', label: api.pair('cin.toHyp'), trailing: true, href: '/workflows/' });
  $('cinToFlows').append(bFlows.el);

  function topicOf(n) { return TOPICS[n - 1] || null; }   function posOf(n) { var t = topicOf(n); return (t && t.pos) || n; }   function ordered() { var seen = {}, out = []; ITEMS.forEach(function (i) { if (i.kind === 'film' && !seen[i.topic] && topicOf(i.topic)) { seen[i.topic] = 1; out.push(topicOf(i.topic)); } }); TOPICS.forEach(function (x) { if (!seen[x.id]) out.push(x); }); return out; }
  function current() { return ITEMS[C.idx] || null; }
  function filmOf(it) { var t = it && topicOf(it.topic); return t && t.films ? t.films[it.lang] || null : null; }
  function idxOfKey(key) { for (var i = 0; i < ITEMS.length; i++) if (ITEMS[i].kind === 'film' && ITEMS[i].key === key) return i; return -1; }
  function chapterById(f, id) { var cs = (f && f.chapters) || []; for (var i = 0; i < cs.length; i++) if (cs[i].id === id) return cs[i]; return null; }
  function chapterAt(f, t) {
    var cs = (f && f.chapters) || []; if (!cs.length) return CH_IDS[0];
    for (var i = 0; i < cs.length; i++) if (t >= cs[i].start - 0.02 && t < cs[i].end) return cs[i].id;
    return t >= cs[cs.length - 1].start ? cs[cs.length - 1].id : cs[0].id;
  }
  function langName(l) { return T('lang.' + l); }
  function frameInView() {
    var r = $('cinFrame').getBoundingClientRect(), h = W.innerHeight || D.documentElement.clientHeight;
    var vis = Math.max(0, Math.min(r.bottom, h) - Math.max(r.top, 0));
    return r.height > 0 && vis / r.height >= 0.5;
  }
  function status(text) { $('cinStatus').textContent = text || ''; }
  function notice(text) { C.noticeText = text || ''; paintNotice(); }
  function sysPause() { if (!v.paused) { C.expectPause = true; v.pause(); } }
  function playSafe() {
    v.muted = C.muted;
    var p; try { p = v.play(); } catch (e) { p = null; }
    if (p && p.catch) p.catch(function (err) {
      if (err && err.name === 'AbortError') return;
      if (!C.muted) {
        C.muted = true; v.muted = true;
        var q = v.play(); if (q && q.catch) q.catch(function () { C.blocked = true; paint(); });
        paint();
      } else { C.blocked = true; paint(); }
    });
  }
  function isRunning() {
    if (C.mode === 'film') return !C.missing && !v.paused && !v.ended;
    if (C.mode === 'bridge') return !!C.bridgeTimer && !C.bridgeHold;
    return false;
  }
  function hold(reason) {
    if (C.mode === 'film' && C.wantPlay && !C.missing) { C.wantPlay = false; C.held = reason; paint(); return true; }
    if (!isRunning()) return false;
    if (C.mode === 'bridge') { C.bridgeHold = true; paint(); return true; }
    C.held = reason; sysPause(); paint(); return true;
  }
  function resume() {
    C.held = null; C.userPaused = false;
    if (C.mode === 'film' && !C.missing) { if (v.ended) v.currentTime = 0; playSafe(); }
    else if (C.mode === 'bridge') { C.bridgeHold = false; if (!C.bridgeTimer) startBridgeTimer(); }
    paint();
  }
   
  function wipe() {
    if (reduced) return;
    var r = $('cinReveal'); r.classList.remove('run'); void r.offsetWidth; r.classList.add('run');
  }

   
  function loadItem(idx, opts) {
    opts = opts || {};
    if (idx < 0 || idx >= ITEMS.length) return Promise.resolve(false);
    stopBridgeTimer();
    C.idx = idx; C.missing = false; C.nextUp = false;
    var it = ITEMS[idx];
    var rev = ++C.rev;
    if (C.onReady) { var old = C.onReady; C.onReady = null; old(false); }
    if (it.kind === 'bridge') {
      C.mode = 'bridge'; sysPause();
      C.held = null; C.userPaused = false;
      var b = (topicOf(it.topic) || {}).bridge || {};
      C.bridgeTotal = Math.max(3, Number(b.seconds) || 6); C.bridgeLeft = C.bridgeTotal;
      C.bridgeHold = reduced || !C.auto || !!opts.manual;
      if (!C.bridgeHold) startBridgeTimer();
      buildChapters(); paint(); save();
      return Promise.resolve(true);
    }
    C.mode = 'film';
    var f = filmOf(it);
    C.wantPlay = !!opts.play;
    if (opts.play) { C.userPaused = false; C.held = null; }
    sysPause();
    if (!f || f.media === 'missing' || !f.src) { C.missing = true; v.removeAttribute('src'); v.load(); v.poster = ''; buildChapters(); paint(); return Promise.resolve(false); }
    var start = 0;
    if (opts.chapter) { var ch = chapterById(f, opts.chapter); start = ch ? ch.start : 0; }
    else if (opts.time != null) start = Number(opts.time) || 0;
    C.pendingTime = start > 0.05 ? start : null;
    if (v.getAttribute('src') !== f.src || !v.currentSrc) {
      if (C.lastKey && C.lastKey !== it.key) wipe();
      v.poster = f.poster || '';
      v.preload = 'metadata';
      v.src = f.src;
      v.load();
    } else if (v.readyState >= 1) {
      setTimeout(function () { if (rev === C.rev) onMeta(); }, 0);
    } else { v.load(); }
    C.lastKey = it.key;
    v.setAttribute('aria-label', P(topicOf(it.topic).title) + ' — ' + langName(it.lang));
    buildChapters(); paint();
    return new Promise(function (resolve) { C.onReady = function (ok) { resolve(ok && rev === C.rev); }; });
  }
  function ready(ok) {
    clearTimeout(C.seekTimer);
    C.pendingTime = null;
    if (ok && C.wantPlay) { C.wantPlay = false; playSafe(); }
    var cb = C.onReady; C.onReady = null; if (cb) cb(ok);
    paintProgress(); paint();
  }
  function onMeta() {
    if (C.mode !== 'film') return;
    if (C.pendingTime != null) {
      var t = Math.min(C.pendingTime, Math.max(0, (v.duration || C.pendingTime + 1) - 0.25));
      if (Math.abs(v.currentTime - t) < 0.05) { ready(true); return; }
      C.pendingTime = t;
      try { v.currentTime = t; } catch (e) { ready(true); return; }
      clearTimeout(C.seekTimer);
      C.seekTimer = setTimeout(function () { if (C.pendingTime != null) ready(true); }, 5000);
    } else ready(true);
  }
  v.addEventListener('loadedmetadata', onMeta);
  v.addEventListener('seeked', function () { if (C.pendingTime != null && Math.abs(v.currentTime - C.pendingTime) < 0.4) ready(true); else paintProgress(); });
  v.addEventListener('error', function () {
    if (C.mode !== 'film' || !v.getAttribute('src')) return;
    C.missing = true; C.wantPlay = false; C.pendingTime = null;
    var src = v.getAttribute('src'), code = v.error ? v.error.code : 0;
    C.errInfo = { src: src, code: code, http: null };
    var cb = C.onReady; C.onReady = null; if (cb) cb(false);
    paint();
    try {    
      fetch(src, { method: 'HEAD', cache: 'no-store' }).then(function (r) { if (C.errInfo && C.errInfo.src === src) { C.errInfo.http = r.status; paint(); } }, function () { if (C.errInfo && C.errInfo.src === src) { C.errInfo.http = 0; paint(); } });
    } catch (e) {   }
  });
  v.addEventListener('play', function () {
    C.expectPause = false; C.started = true; C.blocked = false; C.userPaused = false; C.held = null; C.nextUp = false;
    var it = current(); if (it) C.played[it.key] = true;
    pauseClaimed(); notice(''); paint(); save();
  });
  v.addEventListener('pause', function () {
    if (C.expectPause) { C.expectPause = false; paint(); save(); return; }
    if (v.ended || C.mode !== 'film') { paint(); return; }
    C.userPaused = true; paint(); save();
  });
  v.addEventListener('ended', onEnded);
  v.addEventListener('timeupdate', function () { paintProgress(); warmNext(); if (Date.now() - C.saveAt > 1500) save(); });
  function onEnded() {
    var it = current(); if (!it || it.kind !== 'film' || C.mode !== 'film') return;
    C.played[it.key] = true;
    var next = C.idx + 1;
    if (next >= ITEMS.length) { C.mode = 'end'; paint(); status(T('cin.endH')); save(); return; }
    if (!C.auto || C.held || C.userPaused) { C.nextUp = true; paint(); return; }
    if (reduced && ITEMS[next].kind === 'film') { C.nextUp = true; paint(); return; }
    loadItem(next, { play: true });
  }
  function nextTarget() {
    var i = C.idx + 1;
    if (!C.auto) while (i < ITEMS.length && ITEMS[i].kind !== 'film') i++;
    return i < ITEMS.length ? i : -1;
  }
  function warmNext() {
    if (!(v.duration > 0) || v.currentTime / v.duration < 0.8) return;
    for (var i = C.idx + 1; i < ITEMS.length; i++) {
      if (ITEMS[i].kind !== 'film') continue;
      var f = filmOf(ITEMS[i]);
      if (f && f.src && f.media !== 'missing' && !C.warmed[f.src]) {
        C.warmed[f.src] = true;
        try { fetch(f.src, { headers: { Range: 'bytes=0-524287' } }).catch(function () {}); } catch (e) {   }
      }
      return;
    }
  }
  function stepFilm(dir) {
    var i = C.idx + dir;
    if (C.mode === 'end' && dir < 0) i = C.idx;
    while (i >= 0 && i < ITEMS.length && ITEMS[i].kind !== 'film') i += dir;
    if (i < 0 || i >= ITEMS.length) return;
    notice('');
    loadItem(i, { play: true });
  }
  function swapVersion() { api.requestLang(lang === 'ar' ? 'en' : 'ar'); }
   
  function followLanguage(snap) {
    if (!ITEMS.length) return;
    var idx = Math.min(C.idx, ITEMS.length - 1);
    var it = ITEMS[idx];
    if (snap.kind && it && (it.kind !== snap.kind || it.topic !== snap.topic)) {
      for (var i = 0; i < ITEMS.length; i++) if (ITEMS[i].kind === snap.kind && ITEMS[i].topic === snap.topic) { idx = i; break; }
    }
    C.idx = idx; it = ITEMS[idx];
    if (snap.mode === 'film' && it && it.kind === 'film') {
      var keepUser = C.userPaused, keepHeld = C.held;
      loadItem(idx, { chapter: snap.chapter || 'hook', play: snap.playing }).then(function (ok) {
        if (!snap.playing) { C.userPaused = keepUser; C.held = keepHeld; paint(); }
        if (ok) status(T('cin.swapped', { l: langName(lang), ch: P((topicOf(it.topic).labels || {})[snap.chapter] || [snap.chapter, snap.chapter]) }));
      });
      return;
    }
    if (snap.mode === 'bridge' || snap.mode === 'end') {
      var pf = it && filmOf({ topic: it.topic, lang: lang });
      sysPause();
      if (v.getAttribute('src')) { v.removeAttribute('src'); try { v.load(); } catch (e) {   } }
      v.poster = pf && pf.poster ? pf.poster : '';
    }
  }
  function seekChapter(id) {
    var it = current(); if (!it || C.mode !== 'film') return;
    var f = filmOf(it), ch = chapterById(f, id); if (!ch) return;
    notice('');
    if (C.missing || v.readyState < 1) { loadItem(C.idx, { chapter: id, play: true }); return; }
    C.nextUp = false; C.held = null; C.userPaused = false;
    C.pendingTime = ch.start; C.wantPlay = true;
    try { v.currentTime = ch.start; } catch (e) {   }
    clearTimeout(C.seekTimer); C.seekTimer = setTimeout(function () { if (C.pendingTime != null) ready(true); }, 5000);
    paint();
  }
  function togglePlay() {
    if (C.mode === 'end') { loadItem(0, { play: true }); return; }
    if (C.mode === 'bridge') { if (C.bridgeHold) { C.bridgeHold = false; if (!C.bridgeTimer) startBridgeTimer(); } else C.bridgeHold = true; paint(); return; }
    if (C.missing) { loadItem(C.idx, { play: true }); return; }
    if (!v.paused && !v.ended) { C.userPaused = true; sysPause(); paint(); return; }
    if (C.nextUp) { var n = nextTarget(); if (n >= 0) { loadItem(n, { play: true, manual: false }); return; } }
    C.userPaused = false; C.held = null;
    if (v.ended) v.currentTime = 0;
    playSafe();
  }

   
  function startBridgeTimer() {
    stopBridgeTimer();
    var last = performance.now();
    C.bridgeTimer = setInterval(function () {
      var now = performance.now(), dt = (now - last) / 1000; last = now;
      if (C.mode !== 'bridge') { stopBridgeTimer(); return; }
      if (C.bridgeHold || D.hidden) { paintBridgeTimer(); return; }
      C.bridgeLeft -= dt;
      if (C.bridgeLeft <= 0) { stopBridgeTimer(); loadItem(C.idx + 1, { play: true }); return; }
      paintBridgeTimer();
    }, 100);
  }
  function stopBridgeTimer() { if (C.bridgeTimer) { clearInterval(C.bridgeTimer); C.bridgeTimer = null; } }
  function bridgeHoldNow() { if (C.mode === 'bridge' && !C.bridgeHold) { C.bridgeHold = true; paint(); } }
  var ovB = $('ovBridge');
  ovB.addEventListener('pointerdown', function (e) { C.ptrAt = Date.now(); if (!$('bPause').contains(e.target)) bridgeHoldNow(); });
  ovB.addEventListener('focusin', function () { if (Date.now() - C.ptrAt > 400) bridgeHoldNow(); });
  $('bPause').addEventListener('click', function () {
    if (C.mode !== 'bridge') return;
    C.bridgeHold = !C.bridgeHold;
    if (!C.bridgeHold && !C.bridgeTimer) startBridgeTimer();
    paint();
  });
  $('cinSkipBridge').addEventListener('click', function () { if (C.mode === 'bridge') loadItem(C.idx + 1, { play: true }); });

   
  var FROM_RE = /^[A-Za-z][\w-]{0,63}$/;
  function parseHash(h) {
    h = String(h || '').replace(/^#/, '');
    if (!/(^|&)film=/.test(h)) return null;
    var q = new URLSearchParams(h);
    return { film: q.get('film'), lang: q.get('lang'), chapter: q.get('chapter'), from: q.get('from') };
  }
  function validRef(o) {
    if (!o) return null;
    var raw = o.film, n = typeof raw === 'number' ? raw : (/^\d{1,2}$/.test(String(raw == null ? '' : raw)) ? parseInt(raw, 10) : NaN);
    var l = o.lang == null || o.lang === '' ? lang : o.lang, ch = o.chapter == null || o.chapter === '' ? 'hook' : String(o.chapter);
    if (!(n >= 1 && n <= TOPICS.length && Math.floor(n) === n)) return null;
    if (l !== 'ar' && l !== 'en') return null;
    if (CH_IDS.indexOf(ch) < 0) return null;
    var t = topicOf(n), f = t && t.films && t.films[l];
    if (!f || f.media === 'missing' || !f.src) return null;
    var c = chapterById(f, ch); if (!c || !(c.end > c.start) || !(c.start >= 0)) return null;
    return { film: n, lang: l, chapter: ch, key: l + '-' + pad2(n), from: o.from && FROM_RE.test(String(o.from)) ? String(o.from) : null };
  }
  function scrollToCinema(instant) { $('cinema').scrollIntoView({ behavior: reduced || instant ? 'auto' : 'smooth', block: 'start' }); }
   
  function fromStore(id) {
    var f = store.get('fj.from');
    if (!f || !f.path || f.path === W.location.pathname || Date.now() - (f.at || 0) > 60 * 60 * 1000) return null;
    if (id && f.id && f.id !== id) return null;
    return { id: f.id || id || null, page: f.page, path: f.path, y: f.y, focus: f.focus, remote: true };
  }
  function playFilm(o, how) {
    how = how || {}; o = o || {};
    var fromId = o.from != null && FROM_RE.test(String(o.from)) ? String(o.from) : null;
    if (how.initial) C.from = fromStore(fromId) || (fromId && $(fromId) ? { id: fromId, y: null, focus: null } : null);
    else if (!how.keepFrom) {
      var a = D.activeElement;
      var fa = a && a !== D.body && !$('cin').contains(a) ? a : null;
      C.from = fa ? { id: fromId, y: W.scrollY, focus: fa, anchor: fa.getBoundingClientRect().top } : null;
    }
    pauseClaimed();
    var r = validRef(o);
    paint();
    scrollToCinema(how.initial);
    if (!r) { notice(T('cin.notAvail')); paint(); return Promise.resolve({ ok: false, reason: 'unavailable' }); }
    if (r.lang !== lang) { C.skipFollow = true; api.setLang(r.lang); }    
    notice('');
    if (!how.fromHash) { try { history.replaceState(history.state, '', api.filmHash(r)); } catch (e) {   } }
    var play = !(how.initial && reduced);
    setTimeout(function () { if (!frameInView()) hold('view'); }, reduced || how.initial ? 300 : 1400);
    return loadItem(idxOfKey(r.key), { chapter: r.chapter, play: play }).then(function (ok) {
      return { ok: !!ok, film: r.film, lang: r.lang, chapter: r.chapter, time: v.currentTime };
    });
  }
  function backToReading() {
    var f = C.from; if (!f) return;
    hold('back');
    if (f.remote) {
      store.set('fj.return', { path: f.path, id: f.id, y: f.y, focus: f.focus, at: Date.now() });
      store.del('fj.from');
      var ref = '';
      try { ref = D.referrer ? new URL(D.referrer).pathname : ''; } catch (e) { ref = ''; }
      if (ref === f.path && W.history.length > 1) { W.history.back(); return; }
      api.navigate(f.path + (f.id ? '#' + f.id : ''));
      return;
    }
    C.from = null;
    try { history.replaceState(null, '', W.location.pathname + W.location.search); } catch (e) {   }
    paint();
    if (f.focus && D.contains(f.focus)) { W.scrollTo({ top: Math.max(0, W.scrollY + f.focus.getBoundingClientRect().top - (f.anchor || 0)), behavior: 'instant' }); try { f.focus.focus({ preventScroll: true }); } catch (e) {   } }
    else if (f.y != null) W.scrollTo({ top: f.y, behavior: 'instant' });
    W.requestAnimationFrame(function () { if (!frameInView()) hold('view'); });
  }
  function openEvidence(ids) {
    hold('evidence');
    api.navigate('/evidence/' + (ids.length ? '#open=' + ids.map(encodeURIComponent).join(',') : ''));
  }
  W.addEventListener('hashchange', function () {
    var ref = parseHash(W.location.hash);
    if (ref) playFilm(ref, { fromHash: true, keepFrom: !!C.from });
  });

   
  function pauseClaimed() { D.querySelectorAll('video, audio').forEach(function (m) { if (m !== v && !m.paused) { try { m.pause(); } catch (e) {   } } }); }

   
  function maybeAutostart() {
    if (C.started || C.autoTried || reduced || !C.inView || D.hidden) return;
    if (C.mode !== 'film' || C.missing || C.userPaused) return;
    C.autoTried = true; C.wantPlay = false; playSafe();
  }
  if ('IntersectionObserver' in W) {
    new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        var was = C.inView;
        C.inView = e.isIntersecting && e.intersectionRatio >= 0.5;
        if (!C.inView && was) hold('view'); else if (C.inView) maybeAutostart();
      });
    }, { threshold: [0, 0.5, 1] }).observe($('cinFrame'));
  }
  D.addEventListener('visibilitychange', function () { if (D.hidden) { hold('hidden'); save(); } });

   
  function save() {
    C.saveAt = Date.now();
    var it = current(), f = it && it.kind === 'film' ? filmOf(it) : null;
    var t = C.pendingTime != null ? C.pendingTime : v.currentTime || 0;
    store.set('fj.cinema', { idx: C.idx, key: it && it.key, film: it && it.topic, kind: it && it.kind, lang: lang, chapter: f ? chapterAt(f, t) : null, time: Math.round(t * 10) / 10,
      muted: C.muted, auto: C.auto, mode: C.mode, playing: C.mode === 'film' && !v.paused && !v.ended, userPaused: C.userPaused, at: Date.now() });
  }
  W.addEventListener('pagehide', save);

   
  function fmt(t) { t = Math.max(0, Math.floor(t || 0)); return pad2(Math.floor(t / 60)) + ':' + pad2(t % 60); }
  function keepFocus(fn) {
    var a = D.activeElement, key = null;
    if (a && a !== D.body) key = a.id ? '#' + a.id : a.getAttribute('data-key') ? '[data-key="' + a.getAttribute('data-key') + '"]' : a.getAttribute('data-ch') ? '[data-ch="' + a.getAttribute('data-ch') + '"]' : null;
    fn();
    if (key && !D.contains(a)) { var b = D.querySelector(key); if (b) b.focus({ preventScroll: true }); }
  }
  function buildChapters() {
    keepFocus(function () {
      var box = clear($('cinChapters')), ticks = clear($('tlTicks')), it = current(), f = it && it.kind === 'film' ? filmOf(it) : null;
      if (!f) return;
      var t = topicOf(it.topic), dur = f.duration || 30;
      (f.chapters || []).forEach(function (c, i) {
        var label = P(t.labels[c.id] || [c.id, c.id]);
        box.append(el('button', { class: 'ch', type: 'button', 'data-ch': c.id, style: 'flex-grow:' + Math.max(0.5, c.end - c.start).toFixed(2),
          'aria-label': T('cin.chapterGo', { n: num(i + 1), label: label }) + ' · ' + num(fmt(c.start)),
          onclick: function () { seekChapter(c.id); } },
          el('span', { class: 'ch-bar', 'aria-hidden': 'true' }, el('i')), el('span', { class: 'ch-label', text: label })));
        if (i > 0) ticks.append(el('span', { class: 'tl-tick', style: 'inset-inline-start:' + (c.start / dur * 100).toFixed(2) + '%' }));
      });
    });
    paintProgress();
  }
  function paintProgress() {
    var it = current(), f = it && it.kind === 'film' ? filmOf(it) : null;
    var t = C.pendingTime != null ? C.pendingTime : v.currentTime;
    if (f) {
      var cur = chapterAt(f, t), btns = $('cinChapters').children, cs = f.chapters || [];
      for (var i = 0; i < btns.length && i < cs.length; i++) {
        var c = cs[i], p = Math.max(0, Math.min(1, (t - c.start) / Math.max(0.01, c.end - c.start)));
        btns[i].style.setProperty('--p', p.toFixed(3));
        if (c.id === cur) btns[i].setAttribute('aria-current', 'true'); else btns[i].removeAttribute('aria-current');
      }
      var tp = topicOf(it.topic), ci = CH_IDS.indexOf(cur);
      var dur = v.duration > 0 ? v.duration : f.duration;
      var frac = dur > 0 ? Math.max(0, Math.min(1, t / dur)) : 0;
      $('tlFill').style.transform = 'scaleX(' + frac.toFixed(4) + ')';
      $('tlHead').style.insetInlineStart = (frac * 100).toFixed(2) + '%';
      $('cinChNow').textContent = num(ci + 1) + ' / ' + num(cs.length) + ' · ' + P(tp.labels[cur] || [cur, cur]);
      $('cinTime').textContent = num(fmt(t) + ' / ' + fmt(dur));
    } else { $('cinChNow').textContent = ''; $('cinTime').textContent = '—'; $('tlFill').style.transform = 'scaleX(0)'; $('tlHead').style.insetInlineStart = '0%'; }
  }
  function paintBridgeTimer() {
    var frac = C.bridgeTotal ? 1 - Math.max(0, C.bridgeLeft) / C.bridgeTotal : 0;
    $('bTrack').style.transform = 'scaleX(' + Math.max(0, Math.min(1, frac)).toFixed(3) + ')';
    $('bTimerText').textContent = C.bridgeHold || !C.bridgeTimer ? T('cin.bridgePaused') : T('cin.bridgeTimer', { s: num(Math.max(1, Math.ceil(C.bridgeLeft))) });
    $('bPause').textContent = C.bridgeHold ? T('cin.resume') : T('cin.bridgePause');
    $('bPause').setAttribute('aria-pressed', String(C.bridgeHold));
  }
  function paintNotice() { $('cinNotice').hidden = !C.noticeText; $('cinNoticeText').textContent = C.noticeText; }
  var scnTopic = 0, scnCard = null;
  function topicSteps(t) { return CH_IDS.map(function (c) { var lab = (t.labels || {})[c] || [c, c]; return [c === 'method' ? TOPIC_ICON[t.id] : CH_ICON[c], lab[0], lab[1]]; }); }
   
  function paintScenario(t) {
    if (!t || scnTopic === t.id) return;
    scnTopic = t.id;
    var box = $('cinScnCard'); if (!box) return;
    if (scnCard) scnCard.destroy();
    var nn = [String(pad2(posOf(t.id))).replace(/[0-9]/g, function (d) { return '٠١٢٣٤٥٦٧٨٩'[d]; }), pad2(posOf(t.id))];
    scnCard = api.card({ id: 'cinScenarioCard', icon: TOPIC_ICON[t.id], kicker: api.TP('cin.topic', { n: nn }), title: t.title, capability: t.tagline,
      slot: api.loopSlot(null, { steps: topicSteps(t) }, { id: 'cinScn' }), details: [t.disclosure, t.caveat], variant: 'b', focusMode: false, headingLevel: 2, status: api.ladder(t.state.key), statusLabel: t.state.label });
    api.clear(box); box.append(scnCard.el);
  }
  var orbitCard = (function () {
    var box = $('cinOrbitCard'); if (!box) return null;
    var orbit = el('div', { class: 'orbit', id: 'cinOrbit', role: 'group', 'data-i-label': 'cin.list', 'aria-label': T('cin.list') },
      el('span', { class: 'orbit-ring', 'aria-hidden': 'true' }), el('span', { class: 'orbit-core', 'aria-hidden': 'true' }, el('b', { id: 'orbitNum' }), el('span', { id: 'orbitTitle' })));
    var c = api.card({ id: 'cinOrbitCard_', icon: 'cinema', kicker: ['١٠ موضوعات · ٢٠ فيلمًا', '10 topics · 20 films'], title: api.pair('cin.listH'), capability: ['اختر موضوعًا لتشغيل فيلمه بلغة الصفحة.', 'Pick a topic to play its film in the page language.'],
      slot: orbit, details: api.pair('cin.listP'), variant: 'b', focusMode: false, headingLevel: 2 });
    box.append(c.el);
    return c;
  })();
  function paint() {
    var it = current(), t = it ? topicOf(it.topic) : null, f = it && it.kind === 'film' ? filmOf(it) : null;
    var cin = $('cin');
    cin.classList.toggle('is-bridge', C.mode === 'bridge');
    cin.classList.toggle('is-end', C.mode === 'end');
    $('cinFrame').classList.toggle('dim', C.mode === 'bridge' || C.mode === 'end');
    var count = $('cinCount'), topicEl = $('cinTopic'), tag = $('cinLangTag'), st = clear($('cinState')), ph = $('cinPh');
    if (C.mode === 'end') { count.textContent = T('cin.endOf'); topicEl.textContent = ''; tag.hidden = true; ph.hidden = true; }
    else if (C.mode === 'bridge') {
      count.textContent = T('cin.bridgeOf', { a: num(pad2(posOf(it.topic))), b: num(pad2(posOf(it.to != null ? it.to : it.topic + 1))) });
      topicEl.textContent = T('cin.bridgeLabel'); tag.hidden = true; ph.hidden = true;
    } else if (it && t) {
      count.textContent = T('cin.filmOf', { n: num(it.n), total: num(FILM_TOTAL) });
      topicEl.textContent = T('cin.topic', { n: num(pad2(posOf(it.topic))) }) + ' · ' + P(t.title);
      tag.hidden = false; tag.textContent = langName(it.lang); tag.setAttribute('title', T('cin.filmLang', { l: langName(it.lang) }));
      st.append(chip(t.state.key, t.state.label));
      ph.hidden = !(f && f.media === 'placeholder-e3'); ph.textContent = T('cin.placeholderTag'); ph.title = T('cin.placeholder');
    }
    var filmLive = C.mode === 'film' && !C.missing;
    $('ovStart').hidden = !(filmLive && !C.started && v.paused && (C.blocked || reduced));
    $('ovStartNote').textContent = reduced ? T('cin.reduced') : C.blocked ? T('cin.blocked') : T('cin.startNote');
    var showHold = filmLive && C.started && !C.nextUp && !v.ended && v.paused && (C.held || C.userPaused) && C.pendingTime == null;
    $('ovHold').hidden = !showHold;
    $('cinFrame').classList.toggle('is-held', showHold);
    $('ovHoldText').textContent = C.held ? T('cin.hold.' + C.held) : T('cin.hold.user');
    $('ovMissing').hidden = !(C.mode === 'film' && C.missing);
    $('ovMissingText').textContent = T('cin.missingP', { n: it ? num(pad2(posOf(it.topic))) : '' });
    var ei = C.missing && C.errInfo;
    $('ovMissingErr').textContent = ei ? (ei.http ? T('cin.errHttp', { s: num(ei.http) }) : ei.http === 0 ? T('cin.errNet') : ei.code === 4 ? T('cin.errFormat') : '') : '';
    var nt = nextTarget();
    $('ovNext').hidden = !(filmLive && C.nextUp && nt >= 0);
    if (nt >= 0) {
      var ni = ITEMS[nt], nTopic = topicOf(ni.topic);
      $('ovNextText').textContent = T('cin.nextUp', { title: ni.kind === 'bridge' ? T('cin.bridgeOf', { a: num(pad2(ni.topic)), b: num(pad2(ni.topic + 1)) }) : T('cin.topic', { n: num(pad2(ni.topic)) }) + ' · ' + P(nTopic.title) });
    }
    $('ovEnd').hidden = C.mode !== 'end';
    $('ovBridge').hidden = C.mode !== 'bridge';
    if (C.mode === 'bridge' && t) {
      var b = t.bridge || {};
      $('bLabel').textContent = T('cin.bridgeLabel') + ' · ' + num(pad2(posOf(it.topic))) + (lang === 'ar' ? ' ← ' : ' → ') + num(pad2(posOf(it.to != null ? it.to : it.topic + 1)));
      $('bIdea').textContent = P(b.idea); $('bEx').textContent = P(b.example); $('bQ').textContent = P(b.question);
      bBridgeGo.el.querySelector('.sqds-btn__label').textContent = T('cin.bridgeGo', { n: num(pad2(posOf(it.to != null ? it.to : it.topic + 1))) });
      paintBridgeTimer();
    }
    paintNotice();
    var playing = C.mode === 'film' ? (!v.paused && !v.ended) : C.mode === 'bridge' ? (!!C.bridgeTimer && !C.bridgeHold) : false;
    var pb = $('cinPlay');
    pb.setAttribute('aria-label', playing ? T('cin.pause') : T('cin.play'));
    var want = playing ? 'pause' : 'play', cur = pb.querySelector('svg');
    if (W.FJTransport && (!cur || cur.getAttribute('data-icon') !== 'transport-' + want)) { var ni = W.FJTransport.icon(want, 30); if (cur) cur.replaceWith(ni); else pb.append(ni); if (W.FJMotion && C.started) W.FJMotion.swapIcon(ni); }
    $('cinFrame').classList.toggle('is-playing', C.mode === 'film' && playing);
    if (W.FJHooks) {
      var chNow = f ? chapterAt(f, C.pendingTime != null ? C.pendingTime : v.currentTime) : null;
      var sig = [it && it.key, C.mode, playing, chNow, lang, C.missing].join('|');
      if (sig !== C.hookSig) { C.hookSig = sig; W.FJHooks.emit('cinema', { id: 'cinema', key: it && it.key, film: it && it.topic, lang: lang, mode: C.mode, playing: !!playing, chapter: chNow, missing: !!C.missing, el: $('cin') }); }
    }
    var firstFilm = idxOfKey(ITEMS.length ? ITEMS[0].key : ''), lastFilm = ITEMS.length - 1;
    $('cinPrev').setAttribute('aria-label', T('cin.prev')); $('cinNext').setAttribute('aria-label', T('cin.next'));
    $('cinPrev').disabled = C.mode !== 'end' && C.idx <= firstFilm;
    $('cinNext').disabled = C.mode === 'end' || C.idx >= lastFilm;
    $('cinSound').setAttribute('aria-pressed', String(!C.muted));
    $('cinSound').setAttribute('aria-label', T('cin.soundLabel') + ': ' + (C.muted ? T('cin.soundOff') : T('cin.soundOn')));
    $('cinSoundText').textContent = C.muted ? T('cin.soundOff') : T('cin.soundOn');
    var sic = $('cinSoundIc'), sw = C.muted ? 'soundOff' : 'soundOn', sv = sic && sic.querySelector('svg');
    if (sic && W.FJTransport && (!sv || sv.getAttribute('data-icon') !== 'transport-' + sw)) { api.clear(sic); sic.append(W.FJTransport.icon(sw, 22)); }
    var other = lang === 'ar' ? 'en' : 'ar';
    $('cinSwapText').textContent = T('cin.swap', { l: langName(other) });
    $('cinSwap').setAttribute('aria-label', T('cin.swap', { l: langName(other) }) + ' — ' + T('cin.swapLabel', { l: langName(other) }));
    $('cinSkipBridge').hidden = C.mode !== 'bridge';
    $('cinSeq').setAttribute('aria-pressed', String(!C.auto));
    $('cinSeqText').textContent = C.auto ? T('cin.seqStop') : T('cin.seqGo');
    bBack.el.hidden = !C.from;
    if (C.from) bBack.el.querySelector('.sqds-btn__label').textContent = C.from.id && /^hyp/i.test(C.from.id) ? T('cin.backHyp') : T('cin.backRead');
    if (t) {
      $('cinTitle').textContent = P(t.title);
      $('cinTagline').textContent = P(t.tagline);
      $('cinProof').textContent = num(P(t.proof));
      var pc = clear($('cinProofChip')); pc.append(chip(t.proofState));
      $('cinDisc').textContent = P(t.disclosure) + ' · ' + P(t.caveat);
      var shown = f || filmOf({ topic: t.id, lang: lang });
      $('cinProv').hidden = !(shown && shown.provisional);
      $('cinProv').textContent = T('cin.provisional') + (shown && shown.media === 'placeholder-e3' ? ' ' + T('cin.placeholder') : '');
      bFlows.el.setAttribute('href', '/workflows/#hyp-' + pad2(t.id));
      paintScript(it, t);
      paintScenario(t);
      paintOrbit(t);
    }
    paintList();
    paintProgress();
  }
  var scriptKey = '';
  function paintScript(it, t) {
    var key = t.id + '-' + lang;
    if (key === scriptKey) return; scriptKey = key;
    var list = clear($('cinScriptList'));
    CH_IDS.forEach(function (id) {
      var line = t.script && t.script[id] ? t.script[id][lang === 'ar' ? 0 : 1] : '';
      if (!line) return;
      list.append(el('li', null, el('b', { text: P(t.labels[id] || [id, id]) }), el('span', { lang: lang, dir: lang === 'ar' ? 'rtl' : 'ltr', text: line })));
    });
  }
   
  var orbitNodes = [];
  function buildOrbit() {
    var box = $('cinOrbit');
    orbitNodes.forEach(function (n) { n.remove(); }); orbitNodes = [];
    var n = TOPICS.length || 10;     ordered().forEach(function (t, i) {
      var a = -Math.PI / 2 + (i / n) * Math.PI * 2 * (lang === 'ar' ? -1 : 1);
      var x = 50 + 44 * Math.cos(a), y = 50 + 40 * Math.sin(a);
      var key = lang + '-' + pad2(t.id), f = t.films[lang];
      var b = el('button', { type: 'button', class: 'orbit-node' + (f && f.media === 'missing' ? ' missing' : ''), 'data-key': key, 'data-topic': t.id, tabindex: '-1', style: 'left:' + x.toFixed(2) + '%;top:' + y.toFixed(2) + '%',
        'aria-label': T('cin.badge', { n: num(t.id), total: num(FILM_TOTAL), title: P(t.title) }) + (f && f.media === 'missing' ? ' — ' + T('cin.badgeMissing') : ''),
        onclick: function () { notice(''); loadItem(idxOfKey(key), { play: true }); } }, num(pad2(posOf(t.id))));
      b.addEventListener('keydown', function (e) {
        var j = null, rtl = root.dir === 'rtl';
        if (e.key === 'ArrowRight' || e.key === 'ArrowDown') j = (i + ((e.key === 'ArrowRight' && rtl) ? -1 : 1) + n) % n;
        else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') j = (i + ((e.key === 'ArrowLeft' && rtl) ? 1 : -1) + n) % n;
        else if (e.key === 'Home') j = 0; else if (e.key === 'End') j = n - 1;
        if (j == null) return;
        e.preventDefault(); orbitNodes.forEach(function (o) { o.tabIndex = -1; }); orbitNodes[j].tabIndex = 0; orbitNodes[j].focus();
      });
      box.append(b); orbitNodes.push(b);
    });
  }
  function paintOrbit(t) {
    var cur = current();
    var anyFocus = orbitNodes.some(function (o) { return o === D.activeElement; });
    orbitNodes.forEach(function (b) {
      var on = Number(b.getAttribute('data-topic')) === t.id && C.mode !== 'end';
      b.setAttribute('aria-pressed', String(on));
      if (!anyFocus) b.tabIndex = on ? 0 : -1;
      b.classList.toggle('played', !!C.played[b.getAttribute('data-key')]);
    });
    if (!orbitNodes.some(function (b) { return b.tabIndex === 0; }) && orbitNodes[0]) orbitNodes[0].tabIndex = 0;
    $('orbitNum').textContent = num(pad2(posOf(t.id)));
    $('orbitTitle').textContent = P(t.title);
    void cur;
  }
   
  function buildList() {
    keepFocus(function () {
      var list = clear($('cinList'));
      ordered().forEach(function (t) {         var key = lang + '-' + pad2(t.id), i = idxOfKey(key), item = ITEMS[i] || { n: posOf(t.id) }, f = t.films[lang];
        var thumb = f && (f.thumb || f.poster);
        var li = el('li', { class: 'ftile', 'data-topic': t.id, 'data-fx': 'tile' },
          el('div', { class: 'ftile-poster fx-wipe' }, thumb ? el('img', { src: thumb, alt: '', loading: 'lazy', decoding: 'async', width: '480', height: '270' }) : null,
            el('span', { class: 'ftile-num' }, num(pad2(posOf(t.id))))),
          el('div', { class: 'ftile-title' }, P(t.title)),
          el('div', { class: 'ftile-meta' }, api.icon(TOPIC_ICON[t.id], { size: 22 }), el('span', null, P(t.tool)), chip(t.state.key, t.state.label), el('span', { class: 'mono' }, num(fmt(f ? f.duration : 0)))),
          el('button', { class: 'ftile-play', type: 'button', 'data-key': key,
            'aria-label': T('cin.badge', { n: num(item.n), total: num(FILM_TOTAL), title: P(t.title) }) + (f && f.media === 'missing' ? ' — ' + T('cin.badgeMissing') : ''),
            onclick: function () { notice(''); loadItem(i, { play: true }); scrollToCinema(); } }));
        var scn = api.scenario({ steps: topicSteps(t) }, { trigger: 'view', id: 'scn-tile-' + t.id });
        if (scn) li.append(el('div', { class: 'ftile-scn' }, scn.el));
        if (t.bridge) li.append(el('span', { class: 'bridge-note' }, T('cin.bridgeLabel') + ' · ' + num(pad2(posOf(t.id))) + (lang === 'ar' ? ' ← ' : ' → ') + num(pad2(posOf(t.id) + 1))));
        list.append(li);
      });
    });
    $('cinPhNote').hidden = !(SUMMARY.placeholders > 0);
    $('plKicker').textContent = num(pad2(FILM_TOTAL)) + ' · ' + T('lang.' + lang);
    if (W.FJFx) W.FJFx.scan($('cinList'));
  }
  function paintList() {
    var it = current();
    Array.prototype.forEach.call(D.querySelectorAll('#cinList .ftile'), function (li) {
      var on = it && Number(li.getAttribute('data-topic')) === it.topic && C.mode !== 'end';
      if (on) li.setAttribute('aria-current', 'true'); else li.removeAttribute('aria-current');
    });
  }

   
  $('cinPlay').addEventListener('click', togglePlay);
  $('cinPrev').addEventListener('click', function () { stepFilm(-1); });
  $('cinNext').addEventListener('click', function () { stepFilm(1); });
  $('cinSound').addEventListener('click', function () { C.muted = !C.muted; v.muted = C.muted; paint(); save(); });
  $('cinSwap').addEventListener('click', swapVersion);
  $('cinSeq').addEventListener('click', function () {
    C.auto = !C.auto;
    if (C.mode === 'bridge') { if (!C.auto) C.bridgeHold = true; }
    status(C.auto ? '' : T('cin.seqOff')); paint(); save();
  });
  $('ovStartBtn').addEventListener('click', function () { C.userPaused = false; C.held = null; C.started = true; playSafe(); paint(); });
  $('ovHoldBtn').addEventListener('click', resume);
  $('cinNoticeClose').addEventListener('click', function () { notice(''); });

   
  api.onLangSwitch(function () {
    var it = current(), snap = { mode: C.mode, kind: it && it.kind, topic: it && it.topic, chapter: null, playing: false };
    if (it && it.kind === 'film' && C.mode === 'film') {
      var f = filmOf(it), t = C.missing ? 0 : (C.pendingTime != null ? C.pendingTime : v.currentTime);
      snap.chapter = chapterAt(f, t);
      snap.playing = (!v.paused && !v.ended) || (C.wantPlay && C.pendingTime != null);
    }
    return snap;
  }, function (l, snap) {
    lang = l;
    ITEMS = listFor(lang);
    FILM_TOTAL = ITEMS.filter(function (i) { return i.kind === 'film'; }).length;
    var ref = parseHash(W.location.hash);
    if (ref && ref.lang && ref.lang !== lang) { try { history.replaceState(history.state, '', W.location.hash.replace(/([#&])lang=(ar|en)/, '$1lang=' + lang)); } catch (e) {   } }
    if (snap && !C.skipFollow) followLanguage(snap);
    C.skipFollow = false;
    scnTopic = 0; scriptKey = '';
    buildOrbit(); buildList(); buildChapters(); paint(); save();
  });

   
  if (W.FJTransport) W.FJTransport.upgrade($('cin'));
  buildOrbit(); buildList();
  var initial = parseHash(W.location.hash);
  var saved = store.get('fj.cinema');
  if (initial) { C.autoTried = true; playFilm(initial, { fromHash: true, initial: true }); }
  else if (saved && saved.key && Date.now() - (saved.at || 0) < 6 * 3600 * 1000) {
     
    C.muted = saved.muted !== false; C.auto = saved.auto !== false; v.muted = C.muted;
    var k = saved.key, i = idxOfKey(k);
    if (i < 0 && saved.film) i = idxOfKey(lang + '-' + pad2(saved.film));
    if (saved.kind === 'bridge' || saved.mode === 'end') {
      var bi = Math.max(0, Math.min(ITEMS.length - 1, saved.idx || 0));
      if (saved.mode === 'end') { loadItem(ITEMS.length - 1, { play: false }).then(function () { C.mode = 'end'; paint(); }); }
      else loadItem(bi, { manual: true });
    } else if (i >= 0) {
      var sameLang = saved.lang === lang;
      C.userPaused = !!saved.userPaused || !saved.playing; C.started = true;
      loadItem(i, sameLang ? { time: saved.time } : { chapter: saved.chapter || 'hook' }).then(function () { C.userPaused = !!saved.userPaused || !saved.playing; paint(); if (saved.playing && !reduced && frameInView()) { C.userPaused = false; playSafe(); } });
    } else loadItem(0, { play: false });
  }
  else loadItem(0, { play: false });
  paint();
  W.FJCinema = {
    playFilm: function (o) { return playFilm(o); }, hold: hold, save: save,
    state: function () { var it = current(); return { idx: C.idx, key: it && it.key, kind: it && it.kind, mode: C.mode, auto: C.auto, muted: C.muted, held: C.held, userPaused: C.userPaused, missing: C.missing, nextUp: C.nextUp, started: C.started, from: C.from && C.from.id, fromPath: C.from && C.from.path || null, paused: v.paused, time: v.currentTime, src: v.getAttribute('src'), bridgeHold: C.bridgeHold, bridgeLeft: C.bridgeLeft, reduced: reduced, langPending: api.langPending(), lang: lang }; },
  };
  W.StudioCinema = W.FJCinema;
};
