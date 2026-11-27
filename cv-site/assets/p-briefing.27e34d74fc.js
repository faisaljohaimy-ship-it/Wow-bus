 
(function () {
  'use strict';
  var REL = window.RELEASE || {};
  var BUILD = REL.build || 'dev';
  var CACHE = 'fj-brief-' + BUILD;
  var SEQ = (window.DATA && window.DATA.sequence) || {};
  var BRIEF = SEQ.briefing || null;
  var base = new URL('./', location.href);
   
  var CFG = window.FJ_OFFLINE || {};
  var SW_URL = CFG.sw || 'sw.js';
  var EXTRA = Array.isArray(CFG.assets) ? CFG.assets : [];
  function abs(p) { return new URL(p, base).href; }
  var PAGE_KEY = abs('fj-offline/page');
  function manifestKey(l) { return abs('fj-offline/manifest-' + l + '.json'); }
  var state = { busy: null, saved: {}, swLangs: [], checked: false };
  var subs = [];
  function emit() { subs.forEach(function (fn) { try { fn(api.snapshot()); } catch (e) {   } }); }

  function supported() {
    return !!(window.isSecureContext && 'serviceWorker' in navigator && 'caches' in window && BRIEF && BRIEF.passages);
  }
  function files(l) {
    var rows = (BRIEF && BRIEF.passages && BRIEF.passages[l]) || [];
    return rows.filter(function (r) { return r && r.src; }).map(function (r) { return { url: abs(r.src), bytes: r.bytes || 0, key: r.key }; });
  }
  function plannedBytes(l) { return files(l).reduce(function (a, f) { return a + f.bytes; }, 0); }
  function regLangs(reg) {
    var w = reg && (reg.active || reg.waiting || reg.installing);
    if (!w) return [];
    try {
      var q = new URL(w.scriptURL).searchParams;
      if (q.get('b') !== BUILD) return [];
      return (q.get('l') || '').split(',').filter(function (x) { return x === 'ar' || x === 'en'; });
    } catch (e) { return []; }
  }

   
  function refresh() {
    if (!supported()) { state.checked = true; emit(); return Promise.resolve(api.snapshot()); }
     
    return Promise.all([caches.has(CACHE), navigator.serviceWorker.getRegistration('./')]).then(function (x) {
      state.swLangs = regLangs(x[1]);
      if (!x[0]) { state.saved = {}; state.checked = true; emit(); return api.snapshot(); }
      return caches.open(CACHE).then(function (cache) { return [cache]; });
    }).then(function (x) {
      if (!Array.isArray(x)) return x;
      var cache = x[0];
      return Promise.all(['ar', 'en'].map(function (l) {
        return cache.match(manifestKey(l)).then(function (m) {
          if (!m) return null;
          return m.json().then(function (man) {
            if (!man || man.build !== BUILD) return null;
            return Promise.all(files(l).map(function (f) { return cache.match(f.url).then(function (r) { return !!r; }); })).then(function (have) {
              return have.every(Boolean) ? man : null;
            });
          });
        });
      })).then(function (mans) {
        state.saved = { ar: mans[0], en: mans[1] };
        state.checked = true; emit();
        return api.snapshot();
      });
    }).catch(function () { state.checked = true; emit(); return api.snapshot(); });
  }

  function fetchWithProgress(url, onBytes) {
    return fetch(url, { cache: 'no-store' }).then(function (res) {
      if (res.status !== 200) throw new Error('HTTP ' + res.status + ' for ' + url);
      var type = res.headers.get('Content-Type') || 'application/octet-stream';
      if (!res.body || !res.body.getReader) return res.blob().then(function (b) { onBytes(b.size); return { blob: b, type: type }; });
      var reader = res.body.getReader(), chunks = [];
      function pump() {
        return reader.read().then(function (r) {
          if (r.done) return { blob: new Blob(chunks, { type: type }), type: type };
          chunks.push(r.value); onBytes(r.value.byteLength);
          return pump();
        });
      }
      return pump();
    });
  }

  function register(langs) {
    if (!langs.length) {
      return navigator.serviceWorker.getRegistration('./').then(function (reg) { return reg ? reg.unregister() : false; });
    }
    var url = SW_URL + '?b=' + encodeURIComponent(BUILD) + '&l=' + langs.join(',');
    return navigator.serviceWorker.register(url, { scope: './', updateViaCache: 'none' }).then(function (reg) {
       
      return new Promise(function (resolve) {
        var done = false;
        function check() {
          var c = navigator.serviceWorker.controller;
          if (!done && c && c.scriptURL.indexOf(url) >= 0) { done = true; resolve(reg); }
        }
        navigator.serviceWorker.addEventListener('controllerchange', check);
        check();
        var n = 0, t = setInterval(function () { check(); if (done || ++n > 100) { clearInterval(t); if (!done) { done = true; resolve(reg); } } }, 100);
      });
    });
  }

  function save(l) {
    if (!supported()) return Promise.reject(new Error('unsupported'));
    if (state.busy) return Promise.reject(new Error('busy'));
    var list = files(l);
    if (!list.length) return Promise.reject(new Error('no passages'));
    var total = list.reduce(function (a, f) { return a + f.bytes; }, 0), got = 0;
    state.busy = { lang: l, done: 0, total: total }; emit();
    var cache;
    return caches.open(CACHE).then(function (c) {
      cache = c;
       
      return fetch('./', { cache: 'reload' }).then(function (res) {
        if (res.status !== 200) throw new Error('page HTTP ' + res.status);
        return cache.put(PAGE_KEY, res);
      }).then(function () {
         
        return EXTRA.reduce(function (p, u) {
          return p.then(function () { return fetch(u).then(function (res) { if (res.status !== 200) throw new Error('asset HTTP ' + res.status + ' for ' + u); return cache.put(abs(u), res); }); });
        }, Promise.resolve());
      });
    }).then(function () {
      return list.reduce(function (p, f) {
        return p.then(function () {
          return fetchWithProgress(f.url, function (n) { got += n; state.busy.done = got; emit(); }).then(function (x) {
            return cache.put(f.url, new Response(x.blob, { status: 200, headers: { 'Content-Type': x.type, 'Content-Length': String(x.blob.size) } }));
          });
        });
      }, Promise.resolve());
    }).then(function () {
      var man = { build: BUILD, release: REL.id || null, lang: l, files: list.map(function (f) { return f.url.replace(base.href, ''); }), bytes: got, savedAt: new Date().toISOString() };
      return cache.put(manifestKey(l), new Response(JSON.stringify(man), { headers: { 'Content-Type': 'application/json' } }));
    }).then(function () {
      var langs = ['ar', 'en'].filter(function (x) { return x === l || (state.saved[x] && x !== l); });
      return register(langs);
    }).then(function () {
      state.busy = null;
      return refresh();
    }, function (err) {
      state.busy = null;
       
      var undo = cache ? Promise.all(list.map(function (f) { return cache.delete(f.url); }).concat([cache.delete(manifestKey(l))])) : Promise.resolve();
      return undo.then(function () { return refresh(); }).then(function () { throw err; });
    });
  }

  function remove(l) {
    if (!supported()) return Promise.resolve(api.snapshot());
    return caches.open(CACHE).then(function (cache) {
      var keep = ['ar', 'en'].filter(function (x) { return x !== l && state.saved[x]; });
      var dels = files(l).map(function (f) { return cache.delete(f.url); }).concat([cache.delete(manifestKey(l))]);
      if (!keep.length) { dels.push(cache.delete(PAGE_KEY)); EXTRA.forEach(function (u) { dels.push(cache.delete(abs(u))); }); }
      return Promise.all(dels).then(function () { return register(keep); }).then(function () {
        if (!keep.length) return caches.delete(CACHE);
        return null;
      });
    }).then(refresh, refresh);
  }

  var api = {
    supported: supported,
    plannedBytes: plannedBytes,
    cacheName: CACHE,
    build: BUILD,
    refresh: refresh,
    save: save,
    remove: remove,
    onChange: function (fn) { if (typeof fn === 'function') subs.push(fn); },
     
    active: function (l) {
      var c = navigator.serviceWorker && navigator.serviceWorker.controller;
      return !!(c && state.saved[l] && state.swLangs.indexOf(l) >= 0);
    },
    snapshot: function () {
      return { supported: supported(), checked: state.checked, busy: state.busy ? Object.assign({}, state.busy) : null,
        saved: { ar: !!state.saved.ar, en: !!state.saved.en }, savedInfo: { ar: state.saved.ar || null, en: state.saved.en || null },
        worker: state.swLangs.slice(), controlled: !!(navigator.serviceWorker && navigator.serviceWorker.controller), build: BUILD,
        planned: { ar: plannedBytes('ar'), en: plannedBytes('en') } };
    },
  };
  window.FJOffline = api;
   
  if (supported() && navigator.serviceWorker.controller) refresh();
  else { state.checked = !supported(); }
})();

;
 
(window.StudioModules = window.StudioModules || {}).briefing = {
  init: function (api, host) {
    'use strict';
    var $ = function (id) { return document.getElementById(id); };
    var P = api.P, el = api.el, num = api.num;
    var TOPICS = host.topics || [];
    var v = host.video;
    var KPI = window.FJKPI || null;
    var OFF = window.FJOffline || null;
    var REL = window.RELEASE || { id: 'local build', commit: null };
    var BR = (api.data.sequence && api.data.sequence.briefing) || null;
    var HYP = ((api.data.hypotheses && api.data.hypotheses.hypotheses) || []);
    var S = {
      title: ['الإحاطة التنفيذية', 'Executive briefing'],
      sub: ['ستة مقاطع من الأفلام العشرة', 'Six passages from the ten films'],
      prev: ['المقطع السابق', 'Previous passage'], next: ['المقطع التالي', 'Next passage'],
      play: ['تشغيل', 'Play'], pause: ['إيقاف مؤقت', 'Pause'],
      soundOn: ['الصوت يعمل', 'Sound on'], soundOff: ['الصوت مكتوم', 'Sound off'],
      exit: ['خروج', 'Exit'],
      fsOn: ['ملء الشاشة', 'Full screen'], fsOff: ['الخروج من ملء الشاشة', 'Exit full screen'],
      filmLang: ['لغة الصفحة والأفلام', 'Page and film language'],
      of: ['المقطع {a} من {b}', 'Passage {a} of {b}'],
      progress: ['تقدم الإحاطة', 'Briefing progress'],
      endH: ['انتهت الإحاطة', 'Briefing complete'],
      endP: ['الأفلام كاملة وسير العمل والأدلة في الصفحة.', 'The full films, the workflows and the evidence are on the page.'],
      endFilms: ['شاهد الأفلام كاملة', 'Watch the full films'], endFlows: ['سير العمل والفرضيات', 'Workflows and hypotheses'], again: ['أعد الإحاطة', 'Replay the briefing'],
      missing: ['هذا المقطع غير متاح الآن، ننتقل إلى التالي.', 'This passage is not available now; moving to the next one.'],
      fsNo: ['ملء الشاشة غير متاح هنا؛ تُعرض الإحاطة على كامل النافذة.', 'Fullscreen is not available here; the briefing fills the window instead.'],
      keys: [[['مفتاح المسافة', 'تشغيل أو إيقاف'], ['الأسهم', 'السابق والتالي'], ['#M', 'الصوت'], ['#F', 'ملء الشاشة'], ['#Esc', 'خروج']],
        [['#Space', 'play or pause'], ['Arrows', 'previous or next'], ['#M', 'sound'], ['#F', 'full screen'], ['#Esc', 'exit']]],
      approx: ['نحو {t}', 'About {t}'],
       
      ruleH: ['قاعدة مختبرة في الكود', 'A rule tested in code'],
      ruleT: ['مستهدف مفقود ← {r}، لا صفر', 'Missing target → {r}, never zero'],
      decH: ['قرار قابل للمراجعة', 'A decision you can review'],
      decProp: ['المقترح', 'Proposal'], decAppr: ['الاعتماد', 'Approval'], decRule: ['القاعدة', 'Rule'], decNow: ['الحالة الآن', 'State now'],
      decNowT: ['قيد المراجعة بعد دليل جديد', 'Under review after new evidence'],
      decReview: ['راجع هذا القرار', 'Review this decision'],
      kpiH: ['مؤشر محسوب الآن', 'A KPI computed now'],
      kpiLine: ['١٦ من ٢٠ = {r} · بوزن ٦٠/٤٠ مع حضور كامل = {a} · بوزن ٧٠/٣٠ = {b} · بلا مستهدف: {m}', '16 of 20 = {r} · 60/40 with full attendance = {a} · 70/30 = {b} · no target: {m}'],
      kpiSelf: ['أُعيد الحساب في هذا المتصفح: {p} من {t} مطابقة', 'Recomputed in this browser: {p} of {t} match'],
      kpiSim: ['بيانات العرض محاكاة', 'Demonstration data: simulated'],
      relH: ['إصدار يمكن تتبّعه', 'A release you can trace'],
      relThis: ['هذه الصفحة', 'This page'], relLocal: ['بناء محلي', 'local build'], relCommit: ['الإيداع', 'commit'], relBuild: ['البناء', 'build'],
      rel455: ['تحديث سديد ٤٥٥: من الدمج إلى التحقق على النطاقين ١٧ دقيقة و٢٢٫٧٩١ ثانية', 'SADEED update 455: merge to verified on both domains in 17 min 22.791 s'],
      relEnv: ['الإنتاج · مُبيَّن عمليًا', 'Production · Demonstrated'],
      claim: ['الادعاء {c} في سجل الأدلة', 'Claim {c} in the evidence ledger'],
       
      offSave: ['احفظ للعرض دون اتصال · {s}', 'Save for offline · {s}'],
      offSaving: ['جارٍ الحفظ دون اتصال… {p}', 'Saving for offline… {p}'],
      offSaved: ['محفوظة للعرض دون اتصال', 'Saved for offline'],
      offRemove: ['احذف النسخة', 'Remove copy'],
      offNo: ['الحفظ دون اتصال غير متاح في هذا المتصفح', 'Offline saving is not available in this browser'],
      offFail: ['تعذّر الحفظ، ولم يبق شيء محفوظ جزئيًا', 'Saving failed; nothing partial was kept'],
      offInfo: ['تُحفظ الصفحة والمقاطع الستة بلغة الصفحة فقط، ولا تُحفظ الأفلام العشرون.', 'Only the page and the six passages in the page language are saved, never the twenty films.'],
      mb: ['{n} م.ب', '{n} MB'],
    };
    function L(k, vars) { var s = P(S[k]); if (vars) Object.keys(vars).forEach(function (x) { s = s.split('{' + x + '}').join(String(vars[x])); }); return s; }
    function pad2(n) { return String(n).padStart(2, '0'); }
    function fmt(t) { t = Math.max(0, Math.round(t || 0)); return num(pad2(Math.floor(t / 60)) + ':' + pad2(t % 60)); }
    function mb(bytes) { return L('mb', { n: num((Math.round(bytes / 1e5) / 10).toFixed(1)) }); }

     
    var PLAN = BR && BR.plan ? BR.plan : [{ film: 1, ch: ['hook'] }, { film: 2, ch: ['method', 'result'], panel: 'rule' }, { film: 4, ch: ['result'], panel: 'decision' },
      { film: 5, ch: ['result'], panel: 'kpi' }, { film: 8, ch: ['result'], panel: 'release' }, { film: 10, ch: ['closing'] }];
    var TARGET = 90;
    function range(i, l) {
      var seg = PLAN[i], t = TOPICS[seg.film - 1], f = t && t.films && t.films[l];
      if (!f || !f.chapters) return null;
      var cs = f.chapters.filter(function (c) { return seg.ch.indexOf(c.id) >= 0; });
      if (!cs.length) return null;
      var start = Math.min.apply(null, cs.map(function (c) { return c.start; })), end = Math.max.apply(null, cs.map(function (c) { return c.end; }));
      var pas = BR && BR.passages && BR.passages[l] && BR.passages[l][i];
      var src = pas && pas.src && pas.film === seg.film ? pas.src : null;
      var dur = src && pas.duration ? pas.duration : end - start;
      return { key: f.key || (l + '-' + pad2(seg.film)), start: start, end: end, dur: dur, src: src, ok: src ? true : f.media !== 'missing' && !!f.src };
    }
    function plan(l) {
      var film = 0;
      PLAN.forEach(function (s, i) { var r = range(i, l); if (r) film += r.dur; });
      var card = Math.round(Math.min(8, Math.max(3, (TARGET - film) / PLAN.length)) * 2) / 2;
      var steps = [];
      PLAN.forEach(function (s, i) {
        var r = range(i, l);
        steps.push({ kind: 'card', seg: i, dur: card });
        steps.push({ kind: 'film', seg: i, dur: r ? r.dur : 0, r: r });
      });
      return { steps: steps, card: card, film: film, total: steps.reduce(function (a, s) { return a + s.dur; }, 0) };
    }

     
    var B = { on: false, lang: 'ar', plan: null, i: 0, paused: false, cardLeft: 0, tick: null, last: 0, fs: false, fsUserExit: false, slot: null, done: false, ret: null };
    function icon(d) {
      var ns = 'http://www.w3.org/2000/svg', s = document.createElementNS(ns, 'svg'), p = document.createElementNS(ns, 'path');
      s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('aria-hidden', 'true'); s.setAttribute('class', 'ic'); p.setAttribute('d', d); p.setAttribute('fill', 'currentColor'); s.appendChild(p); return s;
    }
    function strokeIcon(d) { var s = icon(d), p = s.firstChild; p.setAttribute('fill', 'none'); p.setAttribute('stroke', 'currentColor'); p.setAttribute('stroke-width', '1.8'); p.setAttribute('stroke-linecap', 'round'); p.setAttribute('stroke-linejoin', 'round'); return s; }
    function ib(id, d) { return el('button', { type: 'button', class: 'bf-ib', id: id }, icon(d)); }
    var layer = el('div', { class: 'bf', id: 'brief', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'bfTitle', 'data-sqds-slot': 'briefing', hidden: true });
    var stage = el('div', { class: 'bf-stage', id: 'bfStage' });
    var card = el('div', { class: 'bf-card', id: 'bfCard', hidden: true });
    var lower = el('div', { class: 'bf-lower', id: 'bfLower', hidden: true });
    var end = el('div', { class: 'bf-end', id: 'bfEnd', hidden: true });
    var bar = el('div', { class: 'bf-bar', id: 'bfBar', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': '100' }, el('i', { id: 'bfFill' }), el('span', { class: 'bf-ticks', id: 'bfTicks', 'aria-hidden': 'true' }));
    var top = el('div', { class: 'bf-top' },
      el('div', { class: 'bf-id' }, el('h2', { id: 'bfTitle' }), el('p', { id: 'bfSub' })),
      el('div', { class: 'bf-top-acts' },
        el('button', { type: 'button', class: 'ctl bf-fs', id: 'bfFs', 'aria-pressed': 'false' }, strokeIcon('M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5'), el('span', { id: 'bfFsT' })),
        el('button', { type: 'button', class: 'bf-exit', id: 'bfExit' }, el('span', { id: 'bfExitT' }), el('kbd', null, 'Esc'))));
    var ctl = el('div', { class: 'bf-ctl' },
      el('div', { class: 'bf-row' },
        ib('bfPrev', 'M7 5h2v14H7zM19 6v12l-9-6z'),
        ib('bfPlay', 'M8 5v14l11-7z'),
        ib('bfNext', 'M15 5h2v14h-2zM5 6v12l9-6z'),
        el('span', { class: 'bf-time mono', id: 'bfTime' })),
      el('div', { class: 'bf-row bf-row-b' },
        el('div', { class: 'seg bf-lang', role: 'group', id: 'bfLang' },
           
          el('button', { type: 'button', id: 'bfLangAr', lang: 'ar', 'data-lang-switch': 'ar' }, 'عربي'),
          el('button', { type: 'button', id: 'bfLangEn', lang: 'en', 'data-lang-switch': 'en' }, 'English')),
        el('button', { type: 'button', class: 'ctl bf-snd', id: 'bfSound', 'aria-pressed': 'false' }, el('span', { id: 'bfSoundT' })),
        el('span', { class: 'bf-off', id: 'bfOff' },
          el('button', { type: 'button', class: 'ctl', id: 'bfOffSave' }, strokeIcon('M12 4v11M7 10l5 5 5-5M5 20h14'), el('span', { id: 'bfOffT' })),
          el('button', { type: 'button', class: 'ctl', id: 'bfOffDel', hidden: true }, el('span', { id: 'bfOffDelT' })))));
    var live = el('p', { class: 'sr', id: 'bfLive', role: 'status', 'aria-live': 'polite' });
    var offLive = el('p', { class: 'bf-offnote', id: 'bfOffNote', role: 'status', 'aria-live': 'polite' });
    var keys = el('p', { class: 'bf-keys', id: 'bfKeys' });
    stage.append(card, lower, end);
    layer.append(top, stage, bar, ctl, offLive, keys, live);
    document.body.append(layer);

    function paintStatic() {
      $('bfTitle').textContent = L('title');
      $('bfSub').textContent = L('sub') + ' · ' + L('approx', { t: fmt((B.plan || plan(B.lang)).total) });
      $('bfExitT').textContent = L('exit');
      $('bfPrev').setAttribute('aria-label', L('prev')); $('bfNext').setAttribute('aria-label', L('next'));
      $('bfLang').setAttribute('aria-label', L('filmLang'));
      bar.setAttribute('aria-label', L('progress'));
      while (keys.firstChild) keys.removeChild(keys.firstChild);
      S.keys[api.lang() === 'ar' ? 0 : 1].forEach(function (k, i) {
        if (i) keys.append(' · ');
        keys.append(k[0].charAt(0) === '#' ? el('kbd', null, k[0].slice(1)) : k[0], ': ' + k[1]);
      });
      var btn = $('briefBtn');
      if (btn) btn.setAttribute('title', L('title') + ' · ' + L('approx', { t: fmt(plan(api.lang()).total) }));
      paintOffline();
    }
    function paintCtl() {
      var playing = B.on && !B.paused && !B.done;
      var pp = $('bfPlay'); pp.setAttribute('aria-label', playing ? L('pause') : L('play'));
      var glyph = playing ? 'M7 5h4v14H7zM13 5h4v14h-4z' : 'M8 5v14l11-7z', path = pp.querySelector('path');
      if (path.getAttribute('d') !== glyph) { path.setAttribute('d', glyph); if (window.FJMotion && B.on) window.FJMotion.swapIcon(pp.querySelector('svg')); }
      var m = host.muted();
      $('bfSound').setAttribute('aria-pressed', String(!m)); $('bfSoundT').textContent = m ? L('soundOff') : L('soundOn');
      $('bfLangAr').setAttribute('aria-pressed', String(B.lang === 'ar')); $('bfLangEn').setAttribute('aria-pressed', String(B.lang === 'en'));
      var isFs = !!(document.fullscreenElement || document.webkitFullscreenElement);
      $('bfFs').setAttribute('aria-pressed', String(isFs)); $('bfFsT').textContent = isFs ? L('fsOff') : L('fsOn'); $('bfFs').setAttribute('aria-label', isFs ? L('fsOff') : L('fsOn'));
      var segI = B.plan ? B.plan.steps[Math.min(B.i, B.plan.steps.length - 1)].seg : 0;
      $('bfPrev').disabled = B.done ? false : segI <= 0;
      $('bfNext').disabled = B.done;
    }
    function ticks() {
      var tk = $('bfTicks'); while (tk.firstChild) tk.removeChild(tk.firstChild);
      var acc = 0;
      B.plan.steps.forEach(function (s, i) { if (s.kind === 'card' && i > 0) tk.append(el('i', { style: 'inset-inline-start:' + (acc / B.plan.total * 100).toFixed(2) + '%' })); acc += s.dur; });
    }
    function filmPos(s) { if (!s || !s.r) return 0; return s.r.src ? host.passageTime() : v.currentTime - s.r.start; }
    function elapsed() {
      if (!B.plan) return 0;
      if (B.done) return B.plan.total;
      var acc = 0;
      for (var k = 0; k < B.i && k < B.plan.steps.length; k++) acc += B.plan.steps[k].dur;
      var s = B.plan.steps[B.i];
      if (s) acc += s.kind === 'card' ? (s.dur - B.cardLeft) : Math.max(0, Math.min(s.dur, filmPos(s)));
      return acc;
    }
    function paintBar() {
      var pct = B.plan ? Math.min(100, elapsed() / B.plan.total * 100) : 0;
      $('bfFill').style.transform = 'scaleX(' + (pct / 100).toFixed(4) + ')';
      bar.setAttribute('aria-valuenow', String(Math.round(pct)));
      bar.setAttribute('aria-valuetext', fmt(elapsed()) + ' / ' + fmt(B.plan ? B.plan.total : 0));
      $('bfTime').textContent = fmt(elapsed()) + ' / ' + fmt(B.plan ? B.plan.total : 0);
    }
    function topicLine(seg) {
      var t = TOPICS[PLAN[seg].film - 1] || {};
      var chs = PLAN[seg].ch.map(function (c) { return t.labels && t.labels[c] ? P(t.labels[c]) : c; }).join(' + ');
      return { t: t, n: num(pad2(((TOPICS[PLAN[seg].film - 1] || {}).pos) || PLAN[seg].film)), title: P(t.title), ch: chs };
    }

     
    function pct(n) { return num(Math.round(n)) + (api.lang() === 'ar' ? '٪' : '%'); }
    function claimTag(cid) { var parts = L('claim', { c: '\u0000' }).split('\u0000'); return el('span', { class: 'bf-claim' }, parts[0], el('code', { translate: 'no' }, cid), parts[1] || ''); }
    function panelRule() {
      var r = KPI ? KPI.weighted({ actual: 16, target: null, attendance: 100, weight: 0.6 }) : { status: 'review' };
      return el('div', { class: 'bf-panel', 'data-panel': 'rule' }, el('p', { class: 'bf-ph' }, L('ruleH')),
        el('p', { class: 'bf-pline' }, L('ruleT', { r: r.status === 'review' ? P(KPI ? KPI.REVIEW_LABEL : ['قيد المراجعة', 'Under review']) : '—' }), ' ', api.chip('verified')),
        claimTag('C-05'));
    }
    function panelDecision() {
      var h = HYP.filter(function (x) { return x.id === 'hyp-04'; })[0];
      if (!h) return null;
      var steps = h.steps || [], appr = null;
      for (var i = steps.length - 1; i >= 0; i--) if (/approv/i.test(steps[i][1] || '')) { appr = steps[i]; break; }
      var prop = steps.filter(function (x) { return /recommendation|propos/i.test(x[1] || ''); })[0];
      return el('div', { class: 'bf-panel', 'data-panel': 'decision' }, el('p', { class: 'bf-ph' }, L('decH'), ' ', api.chip(h.state)),
        el('ol', { class: 'bf-dec' },
          prop ? el('li', null, el('b', null, L('decProp')), el('span', null, P(prop))) : null,
          appr ? el('li', { class: 'is-approved' }, el('b', null, L('decAppr')), el('span', { 'data-signal': 'approved' }, P(appr))) : null,
          el('li', null, el('b', null, L('decRule')), el('span', null, P(h.expected))),
          el('li', { class: 'is-now' }, el('b', null, L('decNow')), el('span', null, L('decNowT')))),
        el('div', { class: 'bf-prow' }, claimTag('C-08'),
          el('button', { type: 'button', class: 'btn bf-review', id: 'bfReview', onclick: function () { reviewDecision(); } }, L('decReview'))));
    }
    function panelKpi() {
      if (!KPI) return null;
      var r = KPI.ratio(16, 20), a = KPI.weighted({ actual: 16, target: 20, attendance: 100, weight: 0.6 }), b = KPI.weighted({ actual: 16, target: 20, attendance: 100, weight: 0.7 });
      var m = KPI.weighted({ actual: 16, target: null, attendance: 100, weight: 0.6 }), st = KPI.selfTest();
      return el('div', { class: 'bf-panel', 'data-panel': 'kpi' }, el('p', { class: 'bf-ph' }, L('kpiH')),
        el('p', { class: 'bf-kpi', 'data-signal': 'kpi', id: 'bfKpiValue' }, pct(a.value)),
        el('p', { class: 'bf-pline' }, L('kpiLine', { r: pct(r.pct), a: pct(a.value), b: pct(b.value), m: m.status === 'review' ? P(KPI.REVIEW_LABEL) : '—' })),
        el('p', { class: 'bf-pline' }, api.chip('simulated', L('kpiSim')), ' ', api.chip(st.pass ? 'verified' : 'pending', L('kpiSelf', { p: num(st.passed), t: num(st.total) }))),
        claimTag('C-04'));
    }
    function panelRelease() {
      var id = REL.id === 'local build' ? L('relLocal') : el('code', { translate: 'no' }, REL.id);
      return el('div', { class: 'bf-panel', 'data-panel': 'release' }, el('p', { class: 'bf-ph' }, L('relH')),
        el('p', { class: 'bf-stamp', 'data-signal': 'release', id: 'bfRelease' }, el('b', null, L('relThis')), ' ', id,
          REL.commit ? [' · ' + L('relCommit') + ' ', el('code', { translate: 'no' }, String(REL.commit).slice(0, 12))] : null,
          REL.build ? [' · ' + L('relBuild') + ' ', el('code', { translate: 'no' }, REL.build)] : null),
        el('p', { class: 'bf-pline' }, L('rel455'), ' · ', L('relEnv')),
        claimTag('C-06'));
    }
    function panelFor(seg) {
      var k = PLAN[seg].panel;
      return k === 'rule' ? panelRule() : k === 'decision' ? panelDecision() : k === 'kpi' ? panelKpi() : k === 'release' ? panelRelease() : null;
    }
    function showCard(seg) {
      var x = topicLine(seg), t = x.t, pnl = panelFor(seg);
      while (card.firstChild) card.removeChild(card.firstChild);
      card.classList.toggle('has-panel', !!pnl);
      card.append(
        el('div', { class: 'bf-ctext' },
          el('p', { class: 'bf-of' }, L('of', { a: num(seg + 1), b: num(PLAN.length) })),
          el('p', { class: 'bf-num', 'aria-hidden': 'true' }, x.n),
          el('h3', { class: 'bf-ttl' }, x.title),
          el('p', { class: 'bf-ch' }, x.ch),
          t.proof ? el('p', { class: 'bf-proof' }, el('span', { class: 'caret', 'aria-hidden': 'true' }), el('span', null, num(P(t.proof))), ' ', api.chip(t.proofState || (t.state && t.state.key) || 'proposed')) : null));
      if (pnl) { pnl.setAttribute('data-sqds-slot', 'briefing-panel'); card.append(pnl); }
      card.hidden = false; lower.hidden = true;
      if (window.FJMotion) window.FJMotion.panel(card);
      live.textContent = L('of', { a: num(seg + 1), b: num(PLAN.length) }) + ' · ' + x.title + ' · ' + x.ch;
      if (window.FJHooks) window.FJHooks.emit('briefing-card', { id: 'seg' + seg, seg: seg, film: PLAN[seg].film, panel: PLAN[seg].panel || null, lang: api.lang(), el: card });
    }
    function showLower(seg, text) {
      var x = topicLine(seg);
      while (lower.firstChild) lower.removeChild(lower.firstChild);
      lower.append(el('span', { class: 'bf-ln' }, x.n), el('span', null, text || (x.title + ' · ' + x.ch)));
      lower.hidden = false; card.hidden = true;
    }

    function stopTick() { if (B.tick) { clearInterval(B.tick); B.tick = null; } }
    function startTick() {
      stopTick(); B.last = Date.now();
      B.tick = setInterval(function () {
        var now = Date.now(), dt = (now - B.last) / 1000; B.last = now;
        var s = B.plan && B.plan.steps[B.i]; if (!s || B.done) return;
        if (s.kind === 'card') {
          if (!B.paused) { B.cardLeft = Math.max(0, B.cardLeft - dt); if (B.cardLeft <= 0) { step(B.i + 1); return; } }
        } else if (s.r && !B.loading) {
          if (host.missing() && !B.missAt) { B.missAt = now; showLower(s.seg, L('missing')); }
          if (B.missAt && now - B.missAt > 2200) { B.missAt = 0; step(B.i + 1); return; }
          if (!B.paused && !host.missing() && (filmPos(s) >= s.r.dur - 0.08 || v.ended)) { step(B.i + 1); return; }
        }
        paintBar();
      }, 100);
    }
    function load(r, play) {
      if (!r || !r.ok) return Promise.resolve(false);
      B.loading = true;
      var p = r.src ? host.loadPassage({ src: r.src, key: r.key, start: r.start }, play) : host.load(r.key, r.start, play);
      return p.then(function (ok) { B.loading = false; return ok; }, function () { B.loading = false; return false; });
    }
    function isLoaded(r) {
      if (!r) return false;
      if (r.src) return v.getAttribute('src') === r.src && v.readyState >= 1 && v.currentTime < 0.3;
      return v.getAttribute('src') === 'media/' + r.key + '.mp4' && Math.abs(v.currentTime - r.start) < 0.3;
    }
    function step(i) {
      if (!B.on) return;
      B.missAt = 0;
      if (i >= B.plan.steps.length) { finish(); return; }
      if (i < 0) i = 0;
      B.i = i; B.done = false; end.hidden = true;
      var s = B.plan.steps[i];
      if (s.kind === 'card') {
        host.pause();
        B.cardLeft = s.dur;
        showCard(s.seg);
        var nx = B.plan.steps[i + 1];
        if (nx && nx.r) load(nx.r, false);    
      } else {
        showLower(s.seg);
        if (!s.r || !s.r.ok) { B.missAt = Date.now(); showLower(s.seg, L('missing')); }
        else if (isLoaded(s.r) && !B.loading) { if (!B.paused) host.play(); }
        else load(s.r, !B.paused);
      }
      paintCtl(); paintBar();
    }
    function segStep(seg) { return seg * 2; }
    function curSeg() { var s = B.plan.steps[Math.min(B.i, B.plan.steps.length - 1)]; return s ? s.seg : 0; }
    function finish() {
      host.pause(); B.done = true; B.i = B.plan.steps.length;
      card.hidden = true; lower.hidden = true;
      while (end.firstChild) end.removeChild(end.firstChild);
      end.append(el('h3', null, L('endH')), el('p', null, L('endP')),
        el('div', { class: 'bf-end-acts' },
          el('button', { type: 'button', class: 'btn btn-primary', id: 'bfEndFilms', onclick: function () { close('cinema'); } }, L('endFilms')),
          el('button', { type: 'button', class: 'btn', id: 'bfEndFlows', onclick: function () { close('hypotheses'); } }, L('endFlows')),
          el('button', { type: 'button', class: 'btn', id: 'bfAgain', onclick: function () { B.paused = false; step(0); } }, L('again'))));
      end.hidden = false; live.textContent = L('endH');
      paintCtl(); paintBar();
      try { $('bfEndFilms').focus({ preventScroll: true }); } catch (e) {   }
    }
    function setPaused(p) {
      if (B.done) return;
      B.paused = p;
      var s = B.plan.steps[B.i];
      if (s && s.kind === 'film') { if (p) host.pause(); else host.play(); }
      paintCtl();
    }
     
    function reviewDecision() {
      close('hypotheses', function () {
        try { window.dispatchEvent(new CustomEvent('studio:hypothesis', { detail: { id: 'hyp-04' } })); } catch (e) {   }
      });
    }
     
    function setLang(l) { if (api.requestLang) api.requestLang(l); else if (l !== api.lang()) api.setLang(l); }
    function followLang(l) {
      if (!B.on || l === B.lang) { B.lang = l; return; }
      var keepI = B.i, keepLeft = B.cardLeft;
      B.lang = l; B.plan = plan(l); ticks(); paintStatic();
      if (B.done) { finish(); return; }
      var s = B.plan.steps[keepI];
      if (s.kind === 'card') { B.cardLeft = Math.min(keepLeft, s.dur); showCard(s.seg); var nx = B.plan.steps[keepI + 1]; if (nx && nx.r) load(nx.r, false); }
      else { showLower(s.seg); load(s.r, !B.paused); }
      paintCtl(); paintBar();
    }

     
    function requestFs() {
      var req = layer.requestFullscreen || layer.webkitRequestFullscreen;
      if (!req) { live.textContent = L('fsNo'); return; }
      try {
        var pr = req.call(layer);
        if (pr && pr.then) pr.then(function () { B.fs = true; paintCtl(); }, function () { live.textContent = L('fsNo'); paintCtl(); });
        else { B.fs = true; paintCtl(); }
      } catch (e) { live.textContent = L('fsNo'); }
    }
    function exitFs() {
      var fsEl = document.fullscreenElement || document.webkitFullscreenElement;
      if (!fsEl) return;
      B.fsUserExit = true;
      try { (document.exitFullscreen || document.webkitExitFullscreen).call(document); } catch (e) { B.fsUserExit = false; }
    }
    function toggleFs() { if (document.fullscreenElement || document.webkitFullscreenElement) exitFs(); else requestFs(); }

     
    function paintOffline(snap) {
      var save = $('bfOffSave'), del = $('bfOffDel'), t = $('bfOffT');
      if (!save) return;
      var l = api.lang();
      if (!OFF || !OFF.supported()) { save.disabled = true; t.textContent = L('offNo'); del.hidden = true; return; }
      snap = snap || OFF.snapshot();
      if (snap.busy) {
        save.disabled = true; del.hidden = true;
        var p = snap.busy.total ? Math.min(100, Math.round(snap.busy.done / snap.busy.total * 100)) : 0;
        t.textContent = L('offSaving', { p: num(p) + (l === 'ar' ? '٪' : '%') });
      } else if (snap.saved[l]) {
        save.disabled = true; t.textContent = L('offSaved') + ' · ' + (l === 'ar' ? 'العربية' : 'English');
        del.hidden = false; $('bfOffDelT').textContent = L('offRemove');
      } else {
        save.disabled = false; del.hidden = true;
        t.textContent = L('offSave', { s: mb((snap.planned && snap.planned[l]) || OFF.plannedBytes(l)) });
      }
      save.setAttribute('aria-describedby', 'bfOffNote');
    }
    if (OFF) OFF.onChange(function (snap) { paintOffline(snap); });
    $('bfOffSave').addEventListener('click', function () {
      if (!OFF) return;
      $('bfOffNote').textContent = L('offInfo');
      OFF.save(api.lang()).then(function () { $('bfOffNote').textContent = L('offSaved'); }, function () { $('bfOffNote').textContent = L('offFail'); });
    });
    $('bfOffDel').addEventListener('click', function () { if (OFF) OFF.remove(api.lang()).then(function () { $('bfOffNote').textContent = ''; }); });

    function open() {
      if (B.on) return;
      B.ret = document.activeElement;
      B.on = true; B.done = false; B.paused = false; B.fsUserExit = false;
      B.lang = api.lang(); B.plan = plan(B.lang);
      host.enter();
      B.slot = document.createComment('cinFrame');
      host.frame.parentNode.insertBefore(B.slot, host.frame);
      stage.insertBefore(host.frame, stage.firstChild);
      layer.hidden = false; document.documentElement.classList.add('bf-open');
      paintStatic(); ticks();
      if (OFF) OFF.refresh();
      host.setMuted(false);
      B.fs = false;
      requestFs();
      startTick(); step(0);
      try { $('bfPlay').focus({ preventScroll: true }); } catch (e) {   }
    }
     
    function afterFullscreen(fn) {
      if (!(document.fullscreenElement || document.webkitFullscreenElement)) { fn(); return; }
      var done = false;
      function run() { if (done) return; done = true; document.removeEventListener('fullscreenchange', run); document.removeEventListener('webkitfullscreenchange', run); fn(); }
      document.addEventListener('fullscreenchange', run); document.addEventListener('webkitfullscreenchange', run);
      setTimeout(run, 900);
    }
    function close(goTo, then) {
      if (!B.on) return;
      B.on = false; stopTick(); host.pause();
      var fsEl = document.fullscreenElement || document.webkitFullscreenElement;
      if (fsEl) { B.fsUserExit = true; try { (document.exitFullscreen || document.webkitExitFullscreen).call(document); } catch (e) {   } }
      B.fs = false;
      if (B.slot && B.slot.parentNode) { B.slot.parentNode.insertBefore(host.frame, B.slot); B.slot.remove(); }
      B.slot = null;
      layer.hidden = true; document.documentElement.classList.remove('bf-open');
      card.hidden = true; lower.hidden = true; end.hidden = true;
      host.leave();
      var back = goTo ? null : (B.ret && B.ret !== document.body && document.contains(B.ret) ? B.ret : $('briefBtn'));
       
      afterFullscreen(function () {
        if (goTo) api.go(goTo);
        else if (back) { try { back.focus({ preventScroll: true }); } catch (e) {   } }
        if (then) then();
      });
    }

    $('bfExit').addEventListener('click', function () { close(); });
    $('bfFs').addEventListener('click', toggleFs);
    $('bfPlay').addEventListener('click', function () { if (B.done) { B.paused = false; step(0); } else setPaused(!B.paused); });
    $('bfNext').addEventListener('click', function () { if (!B.done) step(segStep(curSeg() + 1)); });
    $('bfPrev').addEventListener('click', function () { if (B.done) step(segStep(PLAN.length - 1)); else step(segStep(Math.max(0, curSeg() - 1))); });
    $('bfLangAr').addEventListener('click', function () { setLang('ar'); });
    $('bfLangEn').addEventListener('click', function () { setLang('en'); });
    $('bfSound').addEventListener('click', function () { host.setMuted(!host.muted()); paintCtl(); });
    layer.addEventListener('keydown', function (e) {
      if (!B.on || e.ctrlKey || e.metaKey || e.altKey) return;
      var rtl = document.documentElement.dir === 'rtl';
      if (e.key === 'Escape') { e.preventDefault(); close(); return; }
      if (e.key === ' ' || e.key === 'k' || e.key === 'K') { if (e.target && e.target.tagName === 'BUTTON' && e.key === ' ') return; e.preventDefault(); $('bfPlay').click(); return; }
      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { e.preventDefault(); ((e.key === 'ArrowRight') !== rtl ? $('bfNext') : $('bfPrev')).click(); return; }
      if (e.key === 'm' || e.key === 'M') { e.preventDefault(); $('bfSound').click(); return; }
      if (e.key === 'f' || e.key === 'F') { e.preventDefault(); toggleFs(); return; }
      if (e.key === 'Tab') {    
        var f = Array.prototype.filter.call(layer.querySelectorAll('button:not([disabled]), [href]'), function (n) { return n.offsetParent !== null || n === document.activeElement; });
        if (!f.length) return;
        var first = f[0], last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    });
     
    ['fullscreenchange', 'webkitfullscreenchange'].forEach(function (ev) {
      document.addEventListener(ev, function () {
        var isFs = !!(document.fullscreenElement || document.webkitFullscreenElement);
        if (B.on && !isFs) {
          if (B.fsUserExit) { B.fsUserExit = false; B.fs = false; }
          else if (B.fs) { close(); return; }
        }
        if (isFs) B.fs = true;
        if (B.on) paintCtl();
      });
    });
    document.addEventListener('visibilitychange', function () { if (B.on && document.hidden && !B.paused) setPaused(true); });
    api.onLang(function (l) { if (B.on) followLang(l); else { B.lang = l; paintStatic(); paintCtl(); } });
    var btn = $('briefBtn'); if (btn) btn.addEventListener('click', function () { open(); });
    paintStatic(); paintCtl();

    return {
      open: open, close: function () { close(); }, toggle: function () { if (B.on) close(); else open(); },
      toggleFullscreen: toggleFs,
      state: function () {
        var s = B.plan && B.plan.steps[B.i];
        return { on: B.on, lang: B.lang, i: B.i, seg: s ? s.seg : null, kind: s ? s.kind : (B.done ? 'end' : null), done: B.done, paused: B.paused,
          total: B.plan ? B.plan.total : plan(api.lang()).total, card: B.plan ? B.plan.card : null, film: B.plan ? B.plan.film : null, elapsed: elapsed(),
          fs: !!(document.fullscreenElement || document.webkitFullscreenElement), key: s && s.r ? s.r.key : null, src: s && s.r ? (s.r.src || 'media/' + s.r.key + '.mp4') : null,
          passage: !!(s && s.r && s.r.src), range: s && s.r ? [s.r.start, s.r.end] : null, panel: s ? PLAN[s.seg].panel || null : null, pos: s && s.kind === 'film' ? filmPos(s) : null };
      },
      plan: function (l) { return plan(l || api.lang()); },
    };
  },
};

;
 
(window.FJPages = window.FJPages || {}).briefing = function (api) {
  'use strict';
  var W = window, D = document, $ = function (id) { return D.getElementById(id); };
  var el = api.el, bi = api.bi, STR = api.strings, pad2 = api.pad2, store = api.store;
  var SEQ = api.data.sequence || {}, TOPICS = SEQ.topics || [], BR = SEQ.briefing || {};
  var TOPIC_ICON = { 1: 'systems', 2: 'code', 3: 'ai', 4: 'agents', 5: 'data', 6: 'integration', 7: 'motion', 8: 'deployment', 9: 'automation', 10: 'projects' };
  var PANEL = { rule: ['قاعدة مختبرة في الكود', 'A rule tested in code'], decision: ['قرار قابل للمراجعة', 'A decision you can review'], kpi: ['مؤشر محسوب الآن', 'A KPI computed now'], release: ['إصدار يمكن تتبّعه', 'A release you can trace'] };
  function dig(s, l) { return l === 'ar' ? String(s).replace(/[0-9]/g, function (d) { return '٠١٢٣٤٥٦٧٨٩'[d]; }) : String(s); }
  var v = $('bfVideo'), frame = $('bfFrame');
  var H = { muted: false, missing: false, rev: 0 };
  function playSafe() {
    v.muted = H.muted;
    var p; try { p = v.play(); } catch (e) { p = null; }
    if (p && p.catch) p.catch(function (err) { if (err && err.name === 'AbortError') return; if (!H.muted) { H.muted = true; v.muted = true; var q = v.play(); if (q && q.catch) q.catch(function () {}); } });
  }
  function loadSrc(src, t, play) {
    H.missing = false;
    var rev = ++H.rev;
    return new Promise(function (resolve) {
      var finished = false;
      function done(ok) {
        if (finished) return; finished = true;
        v.removeEventListener('loadedmetadata', meta); v.removeEventListener('error', fail); v.removeEventListener('seeked', seeked);
        if (rev !== H.rev) { resolve(false); return; }
        if (ok && play) playSafe();
        resolve(ok);
      }
      function seeked() { done(true); }
      function meta() { if (t > 0.05) { v.addEventListener('seeked', seeked); try { v.currentTime = t; } catch (e) { done(true); } } else done(true); }
      function fail() { H.missing = true; done(false); }
      v.addEventListener('loadedmetadata', meta); v.addEventListener('error', fail);
      if (v.getAttribute('src') !== src) { v.preload = 'auto'; v.src = src; v.load(); }
      else if (v.readyState >= 1) { if (t > 0.05) { v.addEventListener('seeked', seeked); try { v.currentTime = t; } catch (e) { done(true); } } else { try { v.currentTime = 0; } catch (e) {   } done(true); } }
      else v.load();
    });
  }
  var host = {
    video: v, frame: frame, topics: TOPICS,
    enter: function () { var b = api.background(); if (b) b.pause(); return true; },
    leave: function () { v.pause(); var b = api.background(); if (b) b.resume(); return Promise.resolve(true); },
    load: function (key, time, play) {
      var n = parseInt(String(key).slice(3), 10), l = String(key).slice(0, 2), t = TOPICS[n - 1], f = t && t.films && t.films[l];
      if (!f || !f.src) { H.missing = true; return Promise.resolve(false); }
      return loadSrc(f.src, time || 0, play !== false);
    },
    loadPassage: function (p, play) { return p && p.src ? loadSrc(p.src, 0, !!play) : Promise.resolve(false); },
    passageTime: function () { return v.currentTime; },
    pause: function () { if (!v.paused) v.pause(); },
    play: function () { playSafe(); },
    muted: function () { return H.muted; },
    setMuted: function (m) { H.muted = !!m; v.muted = H.muted; },
    missing: function () { return H.missing; },
  };
  W.FJ_OFFLINE = W.FJ_OFFLINE || { sw: '/sw.js', assets: (api.page.offline || []) };

   
  var acts = $('heroActs');
  var start = api.button({ id: 'briefBtn', kind: 'primary', size: 'lg', icon: 'cinema', label: STR['mp.brief.start'], magnetic: true });
  start.el.setAttribute('aria-keyshortcuts', 'B');
  var resumeBtn = api.button({ id: 'briefResume', kind: 'secondary', size: 'lg', label: ['', ''] });
  resumeBtn.el.hidden = true;
  if (acts) { api.clear(acts); acts.append(start.el, resumeBtn.el); }
  var reg = W.StudioModules || {};
  var briefing = null;
  if (reg.briefing && reg.briefing.init) { try { briefing = reg.briefing.init(api, host); } catch (e) { if (W.console) console.error('briefing failed:', e); } }
  W.StudioBriefing = briefing;

   
  function saveProgress() {
    if (!briefing) return;
    var s = briefing.state();
    if (s.on) store.set('fj.brief', { seg: s.seg == null ? 0 : s.seg, lang: s.lang, done: !!s.done, at: Date.now() });
  }
  setInterval(function () { if (briefing && briefing.state().on) saveProgress(); }, 1000);
  W.addEventListener('pagehide', saveProgress);
  function paintResume() {
    var p = store.get('fj.brief');
    var show = !!(p && !p.done && p.seg > 0 && briefing && !briefing.state().on);
    resumeBtn.el.hidden = !show;
    if (show) resumeBtn.el.querySelector('.sqds-btn__label').textContent = api.T('mp.brief.resume', { n: api.num(p.seg + 1) });
  }
  resumeBtn.el.addEventListener('click', function () {
    var p = store.get('fj.brief'); if (!briefing || !p) return;
    briefing.open();
    var k = 0;
    (function nextSeg() { if (k++ >= p.seg) return; var b = $('bfNext'); if (b && !b.disabled) b.click(); setTimeout(nextSeg, 60); })();
  });
  paintResume();
  api.onLang(paintResume);
  new MutationObserver(function () { if (!D.documentElement.classList.contains('bf-open')) { saveProgress(); paintResume(); } }).observe(D.documentElement, { attributes: true, attributeFilter: ['class'] });

   
  var cards = $('briefCards');
  var plan = (BR.plan || []);
  var sumAr = (BR.passages && BR.passages.ar) || [], sumEn = (BR.passages && BR.passages.en) || [];
  plan.forEach(function (s, i) {
    var t = TOPICS[s.film - 1] || {}, labs = (s.ch || []).map(function (c) { return (t.labels || {})[c] || [c, c]; });
    var durA = sumAr[i] && sumAr[i].duration, durE = sumEn[i] && sumEn[i].duration;
    var steps = ['hook', 'problem', 'method', 'result', 'closing'].map(function (c) { var lab = (t.labels || {})[c] || [c, c]; return [c === 'method' ? TOPIC_ICON[s.film] : ({ hook: 'inputs', problem: 'problem', result: 'result', closing: 'evidence' })[c], lab[0], lab[1]]; });
    var details = el('div', { class: 'det-wrap' },
      el('p', null, bi(t.tagline)),
      s.panel ? el('p', null, bi(['على بطاقة العنوان: ', 'On the title card: ']), bi(PANEL[s.panel])) : null,
      (durA || durE) ? el('p', { class: 'det-ev' }, bi([dig((durA || 0).toFixed(1), 'ar') + ' ثانية', (durE || 0).toFixed(1) + ' s'])) : null,
      api.loopSlot('topic-' + pad2(s.film), { steps: steps, label: t.title }, { id: 'scn-brief-' + i }),
      el('p', { class: 'scn-note' }, bi(STR['mp.scenario.note'])));
    var c = api.card({ id: 'brief-' + (i + 1), icon: TOPIC_ICON[s.film] || 'cinema', kicker: [dig('المقطع ' + (i + 1) + ' · الفيلم ' + pad2(((TOPICS[s.film - 1] || {}).pos) || s.film), 'ar'), 'Passage ' + (i + 1) + ' · Film ' + pad2(((TOPICS[s.film - 1] || {}).pos) || s.film)],
      title: t.title, capability: [labs.map(function (x) { return x[0]; }).join(' + '), labs.map(function (x) { return x[1]; }).join(' + ')], status: api.ladder((t.state || {}).key), statusLabel: (t.state || {}).label,
      details: details, variant: 'b', focusMode: false, headingLevel: 3, fx: 'card-cap' });
    cards.append(c.el);
  });

   
  var OFF = W.FJOffline;
  var note = el('p', { class: 'off-note', id: 'offNote', role: 'status', 'aria-live': 'polite' });
  var save = api.button({ id: 'offSave', kind: 'secondary', icon: 'deployment', label: ['', ''], onClick: function () {
    if (!OFF) return; note.textContent = api.T('mp.brief.offlineP');
    OFF.save(api.lang()).then(function () { paint(); }, function () { note.textContent = api.lang() === 'ar' ? 'تعذّر الحفظ، ولم يبق شيء محفوظ جزئيًا' : 'Saving failed; nothing partial was kept'; });
  } });
  var del = api.button({ id: 'offDel', kind: 'tertiary', label: ['احذف النسخة', 'Remove copy'], onClick: function () { if (OFF) OFF.remove(api.lang()).then(paint); } });
  function mb(b) { var x = (Math.round(b / 1e5) / 10).toFixed(1); return api.lang() === 'ar' ? dig(x, 'ar').replace('.', '٫') + ' م.ب' : x + ' MB'; }
  function paint(snap) {
    var l = api.lang(), lab = save.el.querySelector('.sqds-btn__label');
    if (!OFF || !OFF.supported()) { save.el.disabled = true; lab.textContent = l === 'ar' ? 'الحفظ دون اتصال غير متاح في هذا المتصفح' : 'Offline saving is not available in this browser'; del.el.hidden = true; return; }
    snap = snap && snap.saved ? snap : OFF.snapshot();
    if (snap.busy) { save.el.disabled = true; del.el.hidden = true; var p = snap.busy.total ? Math.min(100, Math.round(snap.busy.done / snap.busy.total * 100)) : 0; lab.textContent = (l === 'ar' ? 'جارٍ الحفظ… ' + dig(p, 'ar') + '٪' : 'Saving… ' + p + '%'); }
    else if (snap.saved[l]) { save.el.disabled = true; lab.textContent = l === 'ar' ? 'محفوظة للعرض دون اتصال' : 'Saved for offline'; del.el.hidden = false; }
    else { save.el.disabled = false; del.el.hidden = true; lab.textContent = (l === 'ar' ? 'احفظ للعرض دون اتصال · ' : 'Save for offline · ') + mb((snap.planned && snap.planned[l]) || OFF.plannedBytes(l)); }
  }
  if (OFF) OFF.onChange(paint);
  api.onLang(function () { paint(); });
  var offCard = api.card({ id: 'brief-offline', icon: 'security', kicker: ['دون اتصال', 'Offline'], title: STR['mp.brief.offline'], capability: STR['mp.brief.offlineP'], status: 'demonstrated', statusLabel: ['عند الطلب فقط', 'On request only'],
    details: el('div', { class: 'off-panel' }, el('div', { class: 'off-row' }, save.el, del.el), note), variant: 'b', focusMode: false, headingLevel: 3, fx: 'card-cap' });
  cards.append(offCard.el);
  paint();
  if (OFF) OFF.refresh();
  if ((W.location.hash || '') === '#start') W.requestAnimationFrame(function () { try { start.el.focus({ preventScroll: true }); } catch (e) {   } });
};
