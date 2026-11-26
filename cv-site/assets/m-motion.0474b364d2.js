 
(function () {
  'use strict';
  var MODS = (window.StudioModules = window.StudioModules || {});

  var T = {
    over: ['حركة داخل الصورة · لوحة حية', 'Internal image motion · live panel'],
    layersOn: ['افصل الطبقات', 'Separate the layers'],
    layersOff: ['أعد تركيب الطبقات', 'Recompose the layers'],
    pause: ['أوقف الحركة', 'Pause motion'],
    play: ['شغّل الحركة', 'Play motion'],
    reducedNote: ['تقليل الحركة مفعّل في جهازك، فاللوحة ساكنة. زر الطبقات يعمل دون انتقال.', 'Reduced motion is on for your device, so the panel is still. The layer button works without a transition.'],
    pointerHint: ['حرّك المؤشر فوق اللوحة ليتبعه القوس.', 'Move the pointer over the panel and the arc follows it.'],
    layers: ['طبقات اللوحة', 'The panel’s layers'],
    index: ['ست وظائف للحركة', 'Six functions of motion'],
    count: ['الأنماط: {n}', '{n} patterns'],
    why: ['لماذا نستخدمها', 'Why we use it'],
    target: ['العنصر المستهدف', 'Target'],
    timing: ['التوقيت', 'Timing'],
    range: ['نطاق الحركة', 'Range'],
    easing: ['منحنى الحركة', 'Easing'],
    cost: ['أثر الأداء', 'Performance cost'],
    reduced: ['بديل تقليل الحركة', 'Reduced-motion alternative'],
    source: ['المصدر', 'Source'],
    watch: ['شاهد المثال — فيلم {n}', 'Watch the example — film {n}'],
    langAr: ['العربية', 'Arabic'], langEn: ['الإنجليزية', 'English'],
    alt: ['بالإنجليزية', 'English'],
    chapter: ['الفصل', 'Chapter'],
    hyp: ['الفرضية {n}', 'Hypothesis {n}'],
    replay: ['أعد الحركة', 'Replay the motion'],
    goLive: ['انتقل إلى اللوحة الحية', 'Go to the live panel'],
    na: ['المشهد المرجعي غير متاح بعد', 'The reference scene is not available yet'],
    noData: ['بيانات مكتبة الحركة غير متاحة.', 'The motion library data is not available.'],
    stageDesc: ['أقراص زجاجية ومعدنية على شعاع ضوء، وأمامها قوس معدني يتحرك على محوره.', 'Glass and metal discs on a beam of light, with a metal arc in front that moves on its own axis.'],
  };
   
  var SP = {
    proof: ['الدليل', 'Proof'], proofLine: ['٤ حالات قبول ناجحة', '4 acceptance cases pass'],
    calc: ['الحساب', 'The calculation'],
    thread: [['الواجهة', 'View'], ['الدالة', 'Hook'], ['الاستعلام', 'Query'], ['الشرط', 'Rule']],
    path: [['الواجهة', 'Interface'], ['البيانات', 'Data'], ['الذكاء الاصطناعي', 'AI'], ['مراجعة بشرية', 'Human review']],
    rec: ['توصية مقترحة', 'Proposed recommendation'], before: ['بانتظار قرار بشري', 'Awaiting human decision'], after: ['دليل جديد = مراجعة جديدة', 'New evidence = new review'], slip: ['دليل جديد: حرارة المحمل', 'New evidence: bearing temperature'],
    target: ['المستهدف', 'Target'], result: ['الناتج', 'Result'], pending: ['قيد المراجعة', 'Pending review'],
    beatA: ['الوضوح', 'Clarity'], beatB: ['ترجمة لاحقة', 'Translated later'], beatAk: ['الفصل ١ · الافتتاح', 'Beat 1 · hook'], beatBk: ['الفصل ٢ · المشكلة', 'Beat 2 · problem'],
    weights: ['الأوزان', 'Weights'],
    plan: ['هدف تخطيطي', 'Planning target'], planV: ['من ٢ إلى ٦ أسابيع', '2–6 weeks'], meas: ['مقاس', 'Measured'], measV: ['٧٬٩٣٧ التزامًا', '7,937 commits'],
    still: ['النص ثابت', 'Text stays still'],
    cutAr: ['النسخة العربية', 'Arabic cut'], cutEn: ['النسخة الإنجليزية', 'English cut'],
    hold: ['ابدأ بمشروع واحد محدد النطاق', 'Start with one scoped project'], holdBar: ['ثبات ١٫٥ ثانية', 'Hold 1.5 s'],
    aiShort: ['رسم توضيحي مولّد بالذكاء الاصطناعي', 'AI-generated illustration'],
  };
  var COST_DOTS = { none: 0, low: 1, medium: 2, high: 3 };

  function pad2(n) { n = Number(n); return (n < 10 ? '0' : '') + n; }
   
  function richWith(h, text) {
    var out = [];
    String(text == null ? '' : text).split(/`([^`]+)`/).forEach(function (part, i) { if (part) out.push(i % 2 ? h('code', { dir: 'ltr', translate: 'no' }, part) : part); });
    return out;
  }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

  MODS.motion = {
    mount: function (root, api) {
      api = api || {};
      var data = (api.data && api.data.motion) || null;
      var ui = { split: false, paused: false };
      var ctl = { exhibit: null, io: null, timers: [] };
      var body = document.createElement('div');
      body.className = 'm-motion';
      root.appendChild(body);
      var mq = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;

      function reduced() { return !!(api.reducedMotion || (mq && mq.matches)); }
      function lang() { return (typeof api.lang === 'function' ? api.lang() : document.documentElement.lang) === 'en' ? 'en' : 'ar'; }
      function P(pair) { if (!Array.isArray(pair)) return pair == null ? '' : String(pair); return pair[lang() === 'ar' ? 0 : 1]; }
      function num(s) { return typeof api.num === 'function' ? api.num(String(s)) : (lang() === 'ar' ? String(s).replace(/[0-9]/g, function (d) { return '٠١٢٣٤٥٦٧٨٩'[d]; }) : String(s)); }
       
      function arUnits(v) { return num(String(v).replace(/(\d)\s*px\b/g, '$1 بكسل').replace(/(\d)\s*s\b/g, '$1 ث').replace(/%/g, '٪')); }
      function fill(str, map) { return str.replace(/\{(\w+)\}/g, function (_, k) { return map[k]; }); }
      function h(tag, attrs) {
        var e = document.createElement(tag);
        if (attrs) Object.keys(attrs).forEach(function (k) {
          var v = attrs[k];
          if (v == null || v === false) return;
          if (k === 'class') e.className = v;
          else if (k === 'text') e.textContent = v;
          else if (k === 'style') e.style.cssText = v;
          else if (k.slice(0, 2) === 'on') e.addEventListener(k.slice(2), v);
          else e.setAttribute(k, v === true ? '' : v);
        });
        for (var i = 2; i < arguments.length; i++) add(e, arguments[i]);
        return e;
      }
      function add(e, c) {
        if (c == null || c === false) return;
        if (Array.isArray(c)) { c.forEach(function (x) { add(e, x); }); return; }
        e.appendChild(typeof c === 'object' ? c : document.createTextNode(String(c)));
      }
      function icon(kind) {
        var ns = 'http://www.w3.org/2000/svg';
        var s = document.createElementNS(ns, 'svg');
        s.setAttribute('viewBox', '0 0 16 16'); s.setAttribute('aria-hidden', 'true'); s.setAttribute('focusable', 'false');
        s.setAttribute('class', 'm-motion-ic');
        var d = { play: 'M4.5 2.8v10.4L13 8z', replay: 'M3.2 8a4.8 4.8 0 1 0 1.5-3.5M3 2.6v2.9h2.9', pause: 'M5 3v10M11 3v10', layers: 'M8 2.5 14 6 8 9.5 2 6zM2 9.2 8 12.7l6-3.5' }[kind];
        var p = document.createElementNS(ns, 'path');
        p.setAttribute('d', d);
        if (kind === 'play') p.setAttribute('fill', 'currentColor');
        else { p.setAttribute('fill', 'none'); p.setAttribute('stroke', 'currentColor'); p.setAttribute('stroke-width', '1.6'); p.setAttribute('stroke-linecap', 'round'); p.setAttribute('stroke-linejoin', 'round'); }
        s.appendChild(p);
        return s;
      }

       
      function sceneAvailable(film, lng, chapter) {
        var seq = api.data && api.data.sequence;
        if (!seq) return null;
        var key = lng + '-' + pad2(film);
        var items = seq.films || seq.items || seq.playlist || seq.media || null;
        if (items && !Array.isArray(items) && typeof items === 'object') items = Object.keys(items).map(function (k) { var v = items[k] || {}; v.key = v.key || k; return v; });
        if (!Array.isArray(items)) return null;
        var f = null;
        for (var i = 0; i < items.length; i++) {
          var x = items[i];
          if (!x || x.type === 'bridge' || x.kind === 'bridge') continue;
          var n = Number(x.film != null ? x.film : (x.n != null ? x.n : (x.num != null ? x.num : x.id)));
          if (x.key === key || (n === Number(film) && (x.lang === lng || x.language === lng))) { f = x; break; }
        }
        if (!f) return false;
        if (f.available === false || f.missing === true || f.exists === false) return false;
        var st = String(f.availability || f.media_state || f.file_state || '');
        if (/^(missing|failed|unavailable|absent|not_produced|pending)$/.test(st)) return false;
        var ch = f.chapters || f.chapter_times || f.beats || null;
        if (ch) {
          if (Array.isArray(ch)) return ch.some(function (c) { return c && (c.id === chapter || c.key === chapter || c.chapter === chapter); });
          return ch[chapter] != null;
        }
        return true;
      }
      function showNA(box) { var na = box && box.querySelector('.m-motion-na'); if (na) { na.hidden = false; na.textContent = P(T.na); } }
      function play(id, sc, lng, box) {
        if (sceneAvailable(sc.film, lng, sc.chapter) === false || typeof api.playFilm !== 'function') { showNA(box); return; }
        var na = box.querySelector('.m-motion-na'); if (na) na.hidden = true;
        var res;
        try { res = api.playFilm({ film: sc.film, lang: lng, chapter: sc.chapter, from: id }); } catch (e) { showNA(box); return; }
        if (res && typeof res.then === 'function') res.then(function (r) { if (r === false || (r && r.ok === false)) showNA(box); }, function () { showNA(box); });
      }
      function watchLabel(sc) { return fill(P(T.watch), { n: num(pad2(sc.film)) }); }
      function watchBox(id, sc) {
        var box = h('div', { class: 'm-motion-watch' });
        var lng = api.lang();    
        var avail = sceneAvailable(sc.film, lng, sc.chapter);
        box.appendChild(h('div', { class: 'm-motion-watch-row' },
          h('button', { type: 'button', class: 'btn m-motion-play', id: 'btn-' + id + '-' + lng, 'data-film': sc.film, 'data-chapter': sc.chapter, 'data-lang': lng, onclick: function () { play(id, sc, api.lang(), box); } },
            icon('play'), h('span', null, watchLabel(sc)))));
        box.appendChild(h('p', { class: 'm-motion-chapter' }, P(T.chapter) + ': ', h('span', null, P(sc.label))));
        box.appendChild(h('p', { class: 'm-motion-na', role: 'status', hidden: avail !== false }, avail === false ? P(T.na) : ''));
        return box;
      }
      function hypLink(hid) {
        var n = hid.replace(/^hyp-/, '');
        return h('button', { type: 'button', class: 'm-motion-link', 'data-hyp': hid, onclick: function () {
          var detail = { id: hid, handled: false };
          try { window.dispatchEvent(new CustomEvent('studio:hypothesis', { detail: detail })); } catch (e) {   }
          if (!detail.handled && typeof api.go === 'function') api.go('hypotheses');
        } }, fill(P(T.hyp), { n: num(n) }));
      }

       
      function buildExhibit() {
        var ex = data.exhibit;
        var g = ex.geometry, mo = ex.motion;
        var plate = ex.layers[0], subj = ex.layers[1];
        var stage = h('div', { class: 'm-motion-stage', dir: 'ltr', role: 'img', 'aria-label': P(ex.label) + '. ' + P(T.stageDesc),
          style: '--beam-y:' + (g.beam.y * 100) + '%;--beam-x0:' + (g.beam.x0 * 100) + '%;--beam-w:' + ((g.beam.x1 - g.beam.x0) * 100) + '%;--pivot:' + (g.pivot.x * 100) + '% ' + (g.pivot.y * 100) + '%;--overscan:' + g.overscan + ';--pulse:' + mo.pulse_period_s + 's;--sweep:' + mo.sweep_period_s + 's' },
          h('div', { class: 'm-motion-inner' },
            h('div', { class: 'm-motion-layer m-motion-plate' },
              h('img', { src: plate.file, alt: '', width: 1600, height: 900, decoding: 'async', loading: 'lazy', draggable: 'false' }),
              h('span', { class: 'm-motion-tag', dir: lang() === 'ar' ? 'rtl' : 'ltr' }, num(1) + ' · ' + P(plate.label))),
            h('div', { class: 'm-motion-layer m-motion-subject' },
              h('img', { src: subj.file, alt: '', width: 1600, height: 902, decoding: 'async', loading: 'lazy', draggable: 'false' }),
              h('span', { class: 'm-motion-tag', dir: lang() === 'ar' ? 'rtl' : 'ltr' }, num(2) + ' · ' + P(subj.label))),
            h('div', { class: 'm-motion-layer m-motion-light' },
              h('div', { class: 'm-motion-beam' }, h('span', { class: 'm-motion-run' }, h('i', { class: 'm-motion-pulse' }))),
              h('div', { class: 'm-motion-sheen' }, h('span', { class: 'm-motion-win' }, h('img', { src: subj.file, alt: '', width: 1600, height: 902, decoding: 'async', loading: 'lazy', draggable: 'false' }))),
              h('span', { class: 'm-motion-tag', dir: lang() === 'ar' ? 'rtl' : 'ltr' }, num(3) + ' · ' + P(ex.layers[2].label)))));
        var fig = h('figure', { class: 'm-motion-fig' + (ui.split ? ' is-split' : '') + (reduced() ? ' is-reduced' : ''), id: 'mo-exhibit-fig' },
          h('div', { class: 'm-motion-frame' }, stage,
             
            [2, 1, 0].map(function (i) { return h('span', { class: 'm-motion-mark mk-' + (i + 1), 'aria-hidden': 'true' }, num(i + 1)); }),
            h('span', { class: 'm-motion-ai' }, P(ex.label))),
          h('figcaption', { class: 'm-motion-cap' },
            h('p', { class: 'm-motion-cap-label' }, P(ex.label)),
            h('p', null, P(ex.provenance))));

        var layersBtn = h('button', { type: 'button', class: 'btn m-motion-tgl', id: 'mo-layers', 'aria-pressed': String(ui.split), 'aria-controls': 'mo-exhibit-fig' },
          icon('layers'), h('span', null, P(ui.split ? T.layersOff : T.layersOn)));
        layersBtn.addEventListener('click', function () {
          ui.split = !ui.split;
          fig.classList.toggle('is-split', ui.split);
          layersBtn.setAttribute('aria-pressed', String(ui.split));
          layersBtn.lastChild.textContent = P(ui.split ? T.layersOff : T.layersOn);
        });
        var pauseBtn = h('button', { type: 'button', class: 'btn m-motion-tgl', id: 'mo-pause', 'aria-pressed': String(ui.paused), hidden: reduced() },
          icon(ui.paused ? 'play' : 'pause'), h('span', null, P(ui.paused ? T.play : T.pause)));
        pauseBtn.addEventListener('click', function () {
          ui.paused = !ui.paused;
          pauseBtn.setAttribute('aria-pressed', String(ui.paused));
          pauseBtn.replaceChild(icon(ui.paused ? 'play' : 'pause'), pauseBtn.firstChild);
          pauseBtn.lastChild.textContent = P(ui.paused ? T.play : T.pause);
          body.classList.toggle('is-paused', ui.paused);
          if (ctl.exhibit) ctl.exhibit.update();
        });

        var text = h('div', { class: 'm-motion-ex-text' },
          h('p', { class: 'm-motion-over' }, P(T.over)),
          h('h3', { class: 'm-motion-ex-h', id: 'mo-exhibit-h' }, P(ex.title)),
          h('p', { class: 'm-motion-lede' }, P(ex.lede)),
          h('dl', { class: 'm-motion-ex-specs' }, ex.specs.map(function (s) {
            return h('div', null, h('dt', null, P(s.label)), h('dd', null, api.lang() === 'ar' ? arUnits(s.value) : h('bdi', { dir: 'ltr', class: 'mono' }, s.value)));
          })),
          h('div', { class: 'm-motion-ex-ctrl' }, layersBtn, pauseBtn),
          h('p', { class: 'm-motion-note-live', role: 'note' }, reduced() ? P(T.reducedNote) : P(T.pointerHint)),
          h('div', { class: 'm-motion-layers-legend' },
            h('h4', null, P(T.layers)),
            h('ol', null, ex.layers.map(function (l, i) { return h('li', null, h('b', null, num(i + 1) + ' · ' + P(l.label)), ' — ', P(l.role)); }))));
        var pat = data.patterns.filter(function (p) { return p.id === ex.pattern; })[0];
        if (pat) text.appendChild(h('div', { class: 'm-motion-ex-links' }, watchBox(ex.id, pat.scene), hypLink(ex.hypothesis)));
        var sec = h('section', { class: 'm-motion-exhibit', id: 'mo-exhibit', 'aria-labelledby': 'mo-exhibit-h', tabindex: '-1' }, fig, text);
        return { el: sec, fig: fig, stage: stage };
      }

      function Exhibit(fig, stage) {
        var raf = 0, last = 0, t0 = 0, tAcc = 0, visible = false, pointerAt = -1e9, nx = 0, ny = 0;
        var cur = { ax: 0, ay: 0, rot: 0, px: 0, py: 0 };
        var mo = data.exhibit.motion;
        function running() { return visible && !document.hidden && !ui.paused && !reduced(); }
        function update() {
          var on = running();
          fig.classList.toggle('is-paused', !on);
          fig.classList.toggle('is-reduced', reduced());
          if (on && !raf) { last = performance.now(); raf = requestAnimationFrame(tick); }
          else if (!on && raf) { cancelAnimationFrame(raf); raf = 0; }
          if (reduced()) set({ ax: 0, ay: 0, rot: 0, px: 0, py: 0 });
        }
        function set(v) {
          stage.style.setProperty('--ax', v.ax.toFixed(2) + 'px');
          stage.style.setProperty('--ay', v.ay.toFixed(2) + 'px');
          stage.style.setProperty('--rot', v.rot.toFixed(3) + 'deg');
          stage.style.setProperty('--px', v.px.toFixed(2) + 'px');
          stage.style.setProperty('--py', v.py.toFixed(2) + 'px');
        }
        function tick(now) {
          raf = requestAnimationFrame(tick);
          var dt = Math.min(0.1, (now - last) / 1000); last = now; tAcc += dt;
          var t = tAcc;
          var W = stage.clientWidth || 800;
          var A = clamp(W * 0.0225, mo.shift_px[0], mo.shift_px[1]);   
          var tg;
          if (now - pointerAt < 2500) {
            tg = { px: nx * A * mo.plate_factor, py: ny * A * 0.12, rot: nx * mo.tilt_deg };
            tg.ax = tg.px + nx * A; tg.ay = tg.py * 2.8;
          } else {
            var c = A * mo.plate_factor * (0.64 * Math.sin(0.23 * t) + 0.36 * Math.sin(0.11 * t + 1.3));
            var cy = A * 0.12 * Math.sin(0.17 * t + 0.6);
            tg = { px: c, py: cy, ax: c + A * Math.sin(mo.shift_rate * t + 0.4), ay: cy * 2.8, rot: mo.tilt_deg * Math.sin(mo.tilt_rate * t) };
          }
          var k = 1 - Math.exp(-dt * 5);
          Object.keys(cur).forEach(function (key) { cur[key] += (tg[key] - cur[key]) * k; });
          set(cur);
        }
        var io = 'IntersectionObserver' in window ? new IntersectionObserver(function (es) { visible = es[0].isIntersecting; update(); }, { threshold: 0.1 }) : null;
        if (io) io.observe(fig); else { visible = true; }
        function onMove(e) {
          var r = stage.getBoundingClientRect();
          nx = clamp(((e.clientX - r.left) / r.width - 0.5) * 2, -1, 1);
          ny = clamp(((e.clientY - r.top) / r.height - 0.5) * 2, -1, 1);
          pointerAt = performance.now();
        }
        function onLeave() { pointerAt = -1e9; }
        stage.addEventListener('pointermove', onMove);
        stage.addEventListener('pointerleave', onLeave);
        document.addEventListener('visibilitychange', update);
        if (mq && mq.addEventListener) mq.addEventListener('change', update);
        set(cur);
        update();
        return {
          update: update,
          destroy: function () {
            if (io) io.disconnect();
            if (raf) cancelAnimationFrame(raf);
            raf = 0;
            document.removeEventListener('visibilitychange', update);
            if (mq && mq.removeEventListener) mq.removeEventListener('change', update);
          },
        };
      }

       
      function specimen(p) {
        var k = p.specimen, s = h('div', { class: 'm-motion-sp sp-' + k, 'aria-hidden': 'true' });
        function L(pair) { return P(pair); }
        switch (k) {
          case 'caret':
            s.appendChild(h('p', { class: 'sp-over' }, L(SP.proof)));
            s.appendChild(h('p', { class: 'sp-line' }, h('span', { class: 'sp-text' }, L(SP.proofLine)), h('span', { class: 'sp-cur' }, h('i', { class: 'sp-bar' }), h('i', { class: 'sp-ring' }))));
            break;
          case 'rack':
            s.appendChild(h('p', { class: 'sp-over' }, L(SP.calc)));
            s.appendChild(h('div', { class: 'sp-terms', dir: 'ltr' }, h('span', { class: 'sp-t sp-t1' }, '16/20 = 80%'), h('span', { class: 'sp-t sp-t2' }, '0.6 × 80 + 0.4 × 100'), h('span', { class: 'sp-t sp-t3' }, '= 88%')));
            break;
          case 'thread':
          case 'path':
            var nodes = k === 'thread' ? SP.thread : SP.path;
            s.appendChild(h('div', { class: 'sp-nodes' }, h('i', { class: 'sp-track' }), h('i', { class: 'sp-fill' }), h('i', { class: 'sp-dot' }),
              nodes.map(function (n, i) { return h('span', { class: 'sp-n sp-n' + (i + 1) }, h('i'), h('span', null, L(n))); })));
            break;
          case 'review':
            s.appendChild(h('div', { class: 'sp-card' },
              h('p', { class: 'sp-over' }, L(SP.rec)),
              h('p', { class: 'sp-swap' }, h('span', { class: 'sp-was' }, h('i', { class: 'sp-mark' }), L(SP.before)), h('span', { class: 'sp-now' }, h('i', { class: 'sp-mark' }), L(SP.after)))));
            s.appendChild(h('p', { class: 'sp-slip' }, L(SP.slip)));
            break;
          case 'pending':
            s.appendChild(h('div', { class: 'sp-cells' },
              h('div', { class: 'sp-cell' }, h('span', { class: 'sp-k' }, L(SP.target)), h('span', { class: 'sp-v' }, h('b', { class: 'sp-old mono' }, '20'), h('b', { class: 'sp-new mono' }, '—'))),
              h('div', { class: 'sp-cell sp-res' }, h('span', { class: 'sp-k' }, L(SP.result)), h('span', { class: 'sp-v' }, h('b', { class: 'sp-old mono' }, '88%'), h('b', { class: 'sp-ghost mono' }, '0%'), h('b', { class: 'sp-new' }, L(SP.pending))))));
            break;
          case 'beat':
            s.appendChild(h('div', { class: 'sp-scene sp-a' }, h('span', { class: 'sp-over' }, L(SP.beatAk)), h('b', null, L(SP.beatA))));
            s.appendChild(h('div', { class: 'sp-scene sp-b' }, h('span', { class: 'sp-over' }, L(SP.beatBk)), h('b', null, L(SP.beatB))));
            s.appendChild(h('i', { class: 'sp-sweep' }));
            s.appendChild(api.lang() === 'ar' ? h('span', { class: 'sp-badge' }, '١٠ إطارات') : h('span', { class: 'sp-badge mono', dir: 'ltr' }, '10 f'));
            break;
          case 'diff':
            s.appendChild(h('pre', { class: 'sp-code', dir: 'ltr' },
              h('span', { class: 'sp-ctx' }, '  score(actual, target, weight) {'), '\n',
              h('span', { class: 'sp-del' }, '- if (!target) return 0;'), '\n',
              h('span', { class: 'sp-add' }, '+ ', h('span', { class: 'sp-type sp-type1' }, 'if (target == null || target <= 0)')), '\n',
              h('span', { class: 'sp-add' }, '+ ', h('span', { class: 'sp-type sp-type2' }, '  return null;')), '\n',
              h('span', { class: 'sp-ctx' }, '    return Math.round(…);')));
            break;
          case 'ghost':
            s.appendChild(h('p', { class: 'sp-over' }, L(SP.weights)));
            s.appendChild(h('div', { class: 'sp-bar' }, h('i', { class: 'sp-split' })));
            s.appendChild(h('div', { class: 'sp-res', dir: 'ltr' },
              h('span', { class: 'sp-was mono' }, '60/40 → 88%'),
              h('span', { class: 'sp-now mono' }, '70/30 → 86%')));
            break;
          case 'divider':
            s.appendChild(h('div', { class: 'sp-half sp-plan' }, h('span', { class: 'st st-proposed' }, h('i'), L(SP.plan)), h('b', null, L(SP.planV))));
            s.appendChild(h('i', { class: 'sp-line' }));
            s.appendChild(h('div', { class: 'sp-half sp-meas' }, h('span', { class: 'st st-verified' }, h('i'), L(SP.meas)), h('b', null, L(SP.measV))));
            break;
          case 'parallax':
            s.appendChild(h('i', { class: 'sp-l sp-l0' }));
            s.appendChild(h('i', { class: 'sp-l sp-l1' }));
            s.appendChild(h('i', { class: 'sp-l sp-l2' }));
            s.appendChild(h('p', { class: 'sp-front' }, L(SP.still)));
            break;
          case 'counter':
            s.appendChild(h('div', { class: 'sp-counts' },
              h('div', null, h('b', { class: 'sp-num mono', 'data-to': '900' }, '900'), h('span', null, L(SP.cutAr))),
              h('div', null, h('b', { class: 'sp-num mono', 'data-to': '900' }, '900'), h('span', null, L(SP.cutEn)))));
            s.appendChild(api.lang() === 'ar' ? h('p', { class: 'sp-foot' }, '٣٠ إطارًا في الثانية · ٣٠ ث') : h('p', { class: 'sp-foot mono', dir: 'ltr' }, '30 fps · 30 s'));
            break;
          case 'clock':
            s.appendChild(h('b', { class: 'sp-clock mono', dir: 'ltr', 'data-clock': '1042.791' }, '17:22.791'));
            s.appendChild(api.lang() === 'ar' ? h('p', { class: 'sp-foot' }, num('23:32:36') + ' ← ' + num('23:49:58.791') + ' بالتوقيت العالمي') : h('p', { class: 'sp-foot mono', dir: 'ltr' }, '23:32:36 → 23:49:58.791 UTC'));
            break;
          case 'hold':
            s.appendChild(h('p', { class: 'sp-invite' }, L(SP.hold)));
            s.appendChild(h('div', { class: 'sp-holdbar' }, h('i'), h('span', null, L(SP.holdBar))));
            break;
          case 'exhibit':
            s.className += ' sp-mini';
            s.appendChild(h('img', { src: data.exhibit.layers[0].file, alt: '', loading: 'lazy', decoding: 'async', width: 1600, height: 900 }));
            s.appendChild(h('img', { src: data.exhibit.layers[1].file, alt: '', loading: 'lazy', decoding: 'async', width: 1600, height: 902, class: 'sp-arc' }));
            s.appendChild(h('span', { class: 'sp-ai' }, L(SP.aiShort)));
            break;
        }
        return s;
      }
      function fmtClock(sec) {
        var m = Math.floor(sec / 60), s = sec - m * 60;
        var ss = s.toFixed(3); if (s < 10) ss = '0' + ss;
        return (m < 10 ? '0' : '') + m + ':' + ss;
      }
      function tween(el, from, to, dur, delay, fmt) {
        var start = null;
        function ease(x) { return x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2; }
        function step(now) {
          if (start === null) start = now + delay;
          var k = clamp((now - start) / dur, 0, 1);
          el.textContent = fmt(from + (to - from) * ease(k));
          if (k < 1) ctl.timers.push(requestAnimationFrame(step));
          else el.textContent = fmt(to);
        }
        el.textContent = fmt(from);
        ctl.timers.push(requestAnimationFrame(step));
      }
      function runSpecimen(s) {
        if (!s || reduced()) return;
        s.classList.remove('is-run');
        void s.offsetWidth;
        s.classList.add('is-run');
        s.querySelectorAll('[data-to]').forEach(function (el) { tween(el, 0, Number(el.getAttribute('data-to')), 800, 200, function (v) { return String(Math.round(v)); }); });
        s.querySelectorAll('[data-clock]').forEach(function (el) {
          el.classList.remove('is-flash');
          tween(el, 0, Number(el.getAttribute('data-clock')), 1200, 150, fmtClock);
          ctl.timers.push(setTimeout(function () { el.classList.add('is-flash'); }, 1360));
        });
      }

       
      function isEngineCode(c) { return /[A-Za-z_][\w.]*\(|\{|\b\w+:\s/.test(String(c || '')); }
      function specRow(label, item) {
        var code = item.code && (api.lang() !== 'ar' || isEngineCode(item.code)) ? item.code : null;
        return h('div', { class: 'm-motion-spec-row' },
          h('dt', null, P(label)),
          h('dd', null, h('span', null, P(item.text || item)), code ? h('code', { class: 'm-motion-code', dir: 'ltr', translate: 'no' }, code) : null));
      }
      function patternRow(p) {
        var sp = specimen(p);
        var media = h('div', { class: 'm-motion-media' }, sp);
        if (p.specimen === 'exhibit') {
          media.appendChild(h('button', { type: 'button', class: 'm-motion-link', onclick: function () {
            var sec = document.getElementById('mo-exhibit'); if (!sec) return;
            sec.scrollIntoView({ behavior: reduced() ? 'auto' : 'smooth', block: 'start' });
            try { sec.focus({ preventScroll: true }); } catch (e) { sec.focus(); }
          } }, P(T.goLive)));
        } else {
          media.appendChild(h('button', { type: 'button', class: 'm-motion-replay', 'aria-label': P(T.replay) + ': ' + P(p.name), hidden: reduced(), onclick: function () { runSpecimen(sp); } }, icon('replay'), h('span', null, P(T.replay))));
        }
        var dots = COST_DOTS[p.cost.level] || 0;
        var costLabel = P((data.meta.cost && data.meta.cost[p.cost.level]) || [p.cost.level, p.cost.level]);
        var costDd = { text: [costLabel + ' — ' + p.cost.text[0], costLabel + ' — ' + p.cost.text[1]] };
        var li = h('li', { class: 'm-motion-pat', id: p.id },
          media,
          h('div', { class: 'm-motion-body' },
            h('h4', { class: 'm-motion-name' }, P(p.name)),
            h('p', { class: 'm-motion-why' }, h('span', { class: 'm-motion-why-k' }, P(T.why) + ': '), P(p.why)),
            h('dl', { class: 'm-motion-spec' },
              specRow(T.target, { text: p.target }),
              specRow(T.timing, p.timing),
              specRow(T.range, p.range),
              specRow(T.easing, p.easing),
              h('div', { class: 'm-motion-spec-row' }, h('dt', null, P(T.cost)),
                h('dd', null, h('span', { class: 'm-motion-cost', 'data-level': p.cost.level, 'aria-hidden': 'true' }, [0, 1, 2].map(function (i) { return h('i', { class: i < dots ? 'on' : '' }); })), h('span', null, P(costDd.text)))),
              specRow(T.reduced, { text: p.reduced })),
            p.note ? h('p', { class: 'm-motion-pnote note' }, richWith(h, P(p.note))) : null,
            h('div', { class: 'm-motion-actions' }, watchBox(p.id, p.scene), hypLink(p.hypothesis)),
            h('p', { class: 'm-motion-src' }, P(T.source) + ': ', api.lang() === 'ar' && p.source_ar ? h('span', null, richWith(h, p.source_ar)) : h('bdi', { dir: 'ltr', class: 'mono' }, p.source))));
        return { li: li, sp: sp };
      }

      function teardown() {
        if (ctl.exhibit) { ctl.exhibit.destroy(); ctl.exhibit = null; }
        if (ctl.io) { ctl.io.disconnect(); ctl.io = null; }
        ctl.timers.forEach(function (t) { cancelAnimationFrame(t); clearTimeout(t); });
        ctl.timers = [];
      }

      function render() {
        var focusId = document.activeElement && body.contains(document.activeElement) ? document.activeElement.id : null;
        teardown();
        body.textContent = '';
        if (!data || !Array.isArray(data.patterns) || !data.exhibit) { body.appendChild(h('p', { class: 'note' }, P(T.noData))); return; }
        body.classList.toggle('is-paused', ui.paused);

        var ex = buildExhibit();
        body.appendChild(ex.el);

        var specs = [];
        var nav = h('nav', { class: 'm-motion-index', 'aria-label': P(T.index) },
          h('h3', { class: 'm-motion-index-h' }, P(T.index)),
          h('ol', null, data.functions.map(function (f, i) {
            var n = data.patterns.filter(function (p) { return p.function === f.id; }).length;
            return h('li', null, h('a', { href: '#mo-fn-' + f.id, class: 'm-motion-index-a' },
              h('span', { class: 'm-motion-index-n' }, num(pad2(i + 1))),
              h('span', { class: 'm-motion-index-t' }, P(f.label)),
              h('span', { class: 'm-motion-index-c' }, fill(P(T.count), { n: num(n) }))));
          })));
        body.appendChild(nav);

        data.functions.forEach(function (f, i) {
          var pats = data.patterns.filter(function (p) { return p.function === f.id; });
          var ul = h('ul', { class: 'm-motion-list' });
          pats.forEach(function (p) { var r = patternRow(p); ul.appendChild(r.li); if (p.specimen !== 'exhibit') specs.push(r.sp); });
          body.appendChild(h('section', { class: 'm-motion-group', id: 'mo-fn-' + f.id, 'aria-labelledby': 'mo-fn-h-' + f.id },
            h('header', { class: 'm-motion-group-head' },
              h('span', { class: 'm-motion-group-n', 'aria-hidden': 'true' }, num(pad2(i + 1))),
              h('div', null, h('h3', { id: 'mo-fn-h-' + f.id }, P(f.label)), h('p', null, P(f.purpose)))),
            ul));
        });

        ctl.exhibit = Exhibit(ex.fig, ex.stage);
        if ('IntersectionObserver' in window) {
          ctl.io = new IntersectionObserver(function (es) {
            es.forEach(function (e) {
              if (!e.isIntersecting) return;
              ctl.io.unobserve(e.target);
              if (!ui.paused && !reduced() && !e.target.getAttribute('data-played')) { e.target.setAttribute('data-played', '1'); runSpecimen(e.target); }
            });
          }, { threshold: 0.6 });
          specs.forEach(function (s) { ctl.io.observe(s); });
        }
        if (focusId) { var f = document.getElementById(focusId); if (f) { try { f.focus({ preventScroll: true }); } catch (e) { f.focus(); } } }
      }

      render();
      if (typeof api.onLang === 'function') api.onLang(render);
    },
  };
})();
