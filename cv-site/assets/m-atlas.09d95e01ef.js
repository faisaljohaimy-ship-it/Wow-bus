 
(function () {
  'use strict';

  function setAttrs(e, attrs) {
    if (!attrs) return;
    Object.keys(attrs).forEach(function (k) {
      var v = attrs[k];
      if (v == null || v === false) return;
      if (k === 'text') e.textContent = v;
      else if (k.slice(0, 2) === 'on' && typeof v === 'function') e.addEventListener(k.slice(2), v);
      else e.setAttribute(k, v === true ? '' : v);
    });
  }
  function add(p, k) {
    if (k == null || k === false) return;
    if (Array.isArray(k)) { k.forEach(function (x) { add(p, x); }); return; }
    p.appendChild(k.nodeType ? k : document.createTextNode(String(k)));
  }
  function h(tag, attrs) { var e = document.createElement(tag); setAttrs(e, attrs); for (var i = 2; i < arguments.length; i++) add(e, arguments[i]); return e; }
  function clear(n) { while (n.firstChild) n.removeChild(n.firstChild); return n; }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
   
  function rich(text) {
    var out = [];
    String(text == null ? '' : text).split(/(`[^`]+`|\[[A-Za-z]{1,6}\])/).forEach(function (part) {
      if (!part) return;
      if (part.charAt(0) === '`') out.push(h('code', { dir: 'ltr', translate: 'no' }, part.slice(1, -1)));
      else if (part.charAt(0) === '[') out.push(h('kbd', null, part.slice(1, -1)));
      else out.push(part);
    });
    return out;
  }

  var T = {
    mapH: ['الخريطة: سبع طبقات بالترتيب', 'The map: seven layers, in order'],
    mapP: ['من البوابة التي يدخل منها الطلب إلى المراقبة التي تثبت ما حدث. شكل العلامة ولونها يدلّان على الحالة. اختر عقدة لترى ملاحظتها ودليلها.',
      'From the gateway a request enters to the observability that proves what happened. The marker’s shape and colour show the state. Select a node to see its note and evidence.'],
    keys: ['الأسهم تنقل بين العقد، ومفتاح [Enter] يعرض التفاصيل.', 'Arrow keys move between nodes; [Enter] shows the details.'],
    legend: ['تصفية حسب الحالة', 'Filter by state'],
    all: ['الكل', 'All'],
    asOf: ['حتى', 'As of'],
    layer: ['الطبقة', 'Layer'],
    evidence: ['الدليل', 'Evidence'],
    map: ['خريطة الطبقات', 'Map of the layers'],
    protoH: ['البروتوكولات بكلمات بسيطة', 'Protocols in plain words'],
    protoP: ['ما هو كل بروتوكول، ومتى نستخدمه، وأين يظهر في أدلتنا.', 'What each protocol is, when we use it, and where it appears in our evidence.'],
    colWhat: ['ما هو', 'What it is'], colWhen: ['متى نستخدمه', 'When we use it'], inEv: ['في أدلتنا', 'In our evidence'],
    bizH: ['أنظمة الأعمال بحالتها كما هي', 'Business systems, as they stand'],
    bizP: ['عشرة أنظمة شائعة في المؤسسات: ما رُبط فعلًا، وما هو في الكود، وما هو مسار ممكن لم يُبنَ بعد.',
      'Ten systems common in organisations: what is really connected, what is in code, and what is a possible path not built yet.'],
    path: ['المسار الممكن', 'Possible path'], protocols: ['البروتوكولات', 'Protocols'],
    limitsH: ['عن عدد الأنظمة', 'On the number of systems'],
    goProto: ['انتقل إلى شرح البروتوكول', 'Go to the protocol explanation'],

    simTag: ['محاكاة ببيانات اصطناعية', 'Simulation with synthetic data'],
    trace: ['معرّف التتبع الاصطناعي:', 'Synthetic trace id:'],
    run: ['تشغيل', 'Run'], pause: ['إيقاف مؤقت', 'Pause'], step: ['الخطوة التالية', 'Next step'], reset: ['من البداية', 'Start over'],
    approve: ['اعتماد بصفتك المشرف (عيّنة)', 'Approve as the supervisor (sample)'],
    controls: ['أدوات المحاكاة', 'Simulator controls'],
    simKeys: ['داخل المحاكاة: مفتاح [N] للخطوة التالية، ومفتاح [R] للتشغيل أو الإيقاف، ومفتاح [A] للاعتماد، ومفتاح [Esc] للإيقاف.', 'Inside the simulator: [N] for the next step, [R] to run or pause, [A] to approve, [Esc] to pause.'],
    policyText: ['تصاعدية: تتضاعف مهلة الانتظار في كل مرة، مع تفاوت عشوائي', 'exponential, x2, with jitter'],
    sec: ['ث', 's'],
    rm: ['الحركة المخففة مفعّلة: تتقدم المحاكاة بالنقر فقط.', 'Reduced motion is on: the simulation advances only on click.'],
    ready: ['جاهز. سيمر بلاغ ميداني اصطناعي عبر الطبقات في تسع خطوات:', 'Ready. A synthetic field report will pass through the layers in nine steps:'],
    stepOf: ['الخطوة', 'Step'], of: ['من', 'of'],
    payload: ['الحمولة الاصطناعية', 'Synthetic payload'],
    logH: ['سجل الأحداث', 'Event log'], logEmpty: ['لا أحداث بعد. اضغط «تشغيل» أو «الخطوة التالية».', 'No events yet. Press Run or Next step.'],
    logTime: ['الزمن: بداية الخطوة، اصطناعي', 'Time: start of the step, synthetic'],
    layers: ['الطبقات', 'Layers'], activeNow: ['نشطة الآن', 'active now'],
    attempt: ['المحاولة', 'Attempt'], timeout: ['انتهت المهلة', 'timed out'], created: ['أُنشئت المسودة', 'draft created'],
    backoff: ['انتظار متزايد قبل الإعادة', 'Backoff before the retry'], ms: ['ملي ثانية', 'ms'],
    policy: ['السياسة', 'Policy'], maxA: ['أقصى عدد للمحاولات', 'Maximum attempts'],
    key: ['مفتاح منع التكرار', 'Idempotency key'],
    firstSeen: ['سُجّل أول مرة في الخطوة', 'first stored at step'],
    dupResult: ['هذا التسليم تكرار: لا يُنشأ أمر عمل ثانٍ.', 'This delivery is a repeat: no second work order is created.'],
    waitBox: ['يتوقف الوكيل هنا حتى يقرر إنسان. لا يتقدم المسار دون اعتماد.', 'The agent stops here until a person decides. The path does not move on without approval.'],
    approved: ['اعتمده مشرف الوردية (عيّنة)', 'Approved by the shift supervisor (sample)'],
    approvedTag: ['اعتُمد', 'Approved'],
    approvedLog: ['اعتماد بشري: مشرف الوردية (عيّنة)', 'Human approval: shift supervisor (sample)'],
    done: ['اكتمل المثال. كل القيم اصطناعية.', 'The example is complete. Every value is synthetic.'],
    waiting: ['بانتظار الاعتماد', 'Waiting for approval'],
    missing: ['بيانات الأطلس غير متاحة في هذه النسخة.', 'The atlas data is not available in this build.']
  };
   
  var PROTO_AR = {
    rest_graphql: 'واجهات الويب البرمجية', webhooks: 'الإشعارات عبر الويب', oauth_oidc: 'التفويض وتسجيل الدخول',
    queues: 'الطوابير', etl: 'الاستخراج والتحويل والتحميل', rag: 'التوليد المدعوم بالاسترجاع',
    tool_calling: 'استدعاء الأدوات', structured_outputs: 'المخرجات المنظمة', object_storage: 'تخزين الملفات',
    rls_permissions: 'أمان الصفوف والصلاحيات'
  };

  function mount(root, api) {
    var host = h('div', { class: 'm-atlas' });
    root.appendChild(host);
    var A = api.data && api.data.atlas;
    var P = function (pair) { return api.P(pair); };
    var ar = function () { return api.lang() === 'ar'; };
    if (!A || !A.layers) { host.appendChild(h('p', { class: 'note' }, P(T.missing))); return; }
    var reduced = !!api.reducedMotion;
    var STATES = ['connected', 'in_code', 'possible_path'];
    var layerByKey = {};
    A.layers.forEach(function (l, i) { layerByKey[l.key] = { layer: l, index: i }; });
    var firstConnected = null;
    A.layers.some(function (l) { return l.nodes.some(function (n) { if (n.status === 'connected') { firstConnected = n.id; return true; } return false; }); });
    var state = { node: firstConnected || (A.layers[0].nodes[0] || {}).id, filter: 'all', focusNode: null };
    var refs = {};

    function n(x) { return api.num(String(x)); }
    function count(x, forms) {
      
      if (!ar()) return n(x) + ' ' + (x === 1 ? forms[4] : forms[5]);
      if (x === 1) return forms[0];
      if (x === 2) return forms[1];
      if (x >= 3 && x <= 10) return n(x) + ' ' + forms[2];
      return n(x) + ' ' + forms[3];
    }
    var NODES = ['عقدة واحدة', 'عقدتان', 'عقد', 'عقدة', 'node', 'nodes'];
    var SYSTEMS = ['نظام واحد', 'نظامان', 'أنظمة', 'نظامًا', 'system', 'systems'];
    function stLabel(s) { return P((A.status_key[s] || {}).label || [s, s]); }
    function stHelp(s) { return P((A.status_key[s] || {}).help || ['', '']); }
    function glyph(s) { return h('span', { class: 'm-atlas-g is-' + s, 'aria-hidden': 'true' }); }
    function stTag(s) { return h('span', { class: 'm-atlas-st is-' + s, title: stHelp(s) }, glyph(s), stLabel(s)); }
    function nodeName(node) { return ar() && node.name_ar ? node.name_ar : node.name; }
    function nameEl(node) {
      var txt = nodeName(node);
      return ar() && !node.name_ar ? h('bdi', { dir: 'ltr' }, rich(txt)) : h('span', null, rich(txt));
    }
    function fdate(s) {
      var M = { ar: ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'],
        en: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'] };
      var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || ''));
      return m ? n(Number(m[3])) + ' ' + M[api.lang()][Number(m[2]) - 1] + ' ' + n(m[1]) : String(s || '');
    }
    function evTag() { return h('span', { class: 'm-atlas-evtag' }, P(T.evidence)); }

     
    function mapSection() {
      var sec = h('section', { class: 'm-atlas-sec m-atlas-mapsec', 'aria-labelledby': 'ma-map-h' });
      var counts = { connected: 0, in_code: 0, possible_path: 0 }, total = 0;
      A.layers.forEach(function (l) { l.nodes.forEach(function (x) { counts[x.status] = (counts[x.status] || 0) + 1; total++; }); });
      sec.appendChild(h('div', { class: 'm-atlas-head' },
        h('div', { class: 'm-atlas-title' }, h('h3', { id: 'ma-map-h' }, P(T.mapH)), h('span', { class: 'note' }, P(T.asOf) + ' ' + fdate(A.as_of))),
        h('p', null, P(T.mapP)),
        h('p', { class: 'note' }, rich(P(T.keys)))));

      
      var legend = h('div', { class: 'm-atlas-legend', role: 'group', 'aria-label': P(T.legend) });
      var fbtn = {};
      ['all'].concat(STATES).forEach(function (s) {
        var b = h('button', { type: 'button', class: 'm-atlas-fbtn', 'aria-pressed': state.filter === s ? 'true' : 'false',
          onclick: function () { setFilter(s); } },
          s === 'all' ? null : glyph(s),
          h('span', null, s === 'all' ? P(T.all) : stLabel(s)),
          h('b', { class: 'mono' }, n(s === 'all' ? total : (counts[s] || 0))));
        fbtn[s] = b;
        legend.appendChild(b);
      });
      sec.appendChild(legend);
      sec.appendChild(h('ul', { class: 'm-atlas-keyhelp' }, STATES.map(function (s) {
        return h('li', null, stTag(s), h('span', null, stHelp(s)));
      })));

      var scroller = h('div', { class: 'm-atlas-scroll' });
      var ol = h('ol', { class: 'm-atlas-layers', 'aria-label': P(T.map) });
      var buttons = [], byId = {};
      A.layers.forEach(function (l, li) {
        var row = h('li', { class: 'm-atlas-layer', id: 'ma-layer-' + l.key });
        row.appendChild(h('div', { class: 'm-atlas-lhead' },
          h('span', { class: 'm-atlas-lidx mono', 'aria-hidden': 'true' }, n(pad(li + 1))),
          h('div', { class: 'm-atlas-ltext' },
            h('h4', null, h('span', { class: 'sr' }, P(T.layer) + ' ' + n(li + 1) + ': '), P(l.label)),
            h('p', null, rich(P(l.what))),
            h('p', { class: 'm-atlas-lcount' }, count(l.nodes.length, NODES)))));
        var ul = h('ul', { class: 'm-atlas-nodes' });
        l.nodes.forEach(function (node, ni) {
          var b = h('button', { type: 'button', class: 'm-atlas-node is-' + node.status, id: 'ma-node-' + node.id,
            'aria-pressed': 'false', 'aria-controls': 'ma-detail', tabindex: '-1',
            'data-li': li, 'data-ni': ni,
            onclick: function () { selectNode(node.id, true); } },
            glyph(node.status), nameEl(node), h('span', { class: 'sr' }, ' · ' + stLabel(node.status)));
          b.addEventListener('focus', function () { state.focusNode = node.id; roving(node.id); });
          buttons.push(b); byId[node.id] = { b: b, node: node, layer: l, li: li, ni: ni, row: row };
          ul.appendChild(h('li', null, b));
        });
        row.appendChild(ul);
        ol.appendChild(row);
      });
      ol.addEventListener('keydown', function (e) {
        var cur = byId[state.focusNode || state.node]; if (!cur) return;
        var li = cur.li, ni = cur.ni, target = null;
        var fwd = ar() ? 'ArrowLeft' : 'ArrowRight', back = ar() ? 'ArrowRight' : 'ArrowLeft';
        var flat = buttons.indexOf(cur.b);
        if (e.key === fwd) target = buttons[Math.min(buttons.length - 1, flat + 1)];
        else if (e.key === back) target = buttons[Math.max(0, flat - 1)];
        else if (e.key === 'ArrowDown' && li < A.layers.length - 1) target = byIdx(li + 1, ni);
        else if (e.key === 'ArrowUp' && li > 0) target = byIdx(li - 1, ni);
        else if (e.key === 'Home') target = buttons[0];
        else if (e.key === 'End') target = buttons[buttons.length - 1];
        if (!target) return;
        e.preventDefault();
        target.focus();
      });
      function byIdx(li, ni) { var nodes = A.layers[li].nodes; var k = Math.min(ni, nodes.length - 1); return byId[nodes[k].id].b; }
      scroller.appendChild(ol);
      sec.appendChild(scroller);
      var detail = h('div', { class: 'm-atlas-detail', id: 'ma-detail', 'aria-live': 'polite' });
      refs.map = { buttons: buttons, byId: byId, detail: detail, fbtn: fbtn };
      return sec;
    }
    function roving(id) {
      var r = refs.map; if (!r) return;
      r.buttons.forEach(function (b) { b.setAttribute('tabindex', b.id === 'ma-node-' + id ? '0' : '-1'); });
    }
    function setFilter(s) {
      state.filter = s;
      var r = refs.map;
      Object.keys(r.fbtn).forEach(function (k) { r.fbtn[k].setAttribute('aria-pressed', k === s ? 'true' : 'false'); });
      r.buttons.forEach(function (b) {
        var node = r.byId[b.id.slice(8)].node;
        b.classList.toggle('is-dim', s !== 'all' && node.status !== s);
      });
    }
    function selectNode(id, user) {
      var r = refs.map, it = r.byId[id]; if (!it) return;
      state.node = id;
      r.buttons.forEach(function (b) { b.setAttribute('aria-pressed', b === it.b ? 'true' : 'false'); });
      roving(state.focusNode && user ? state.focusNode : id);
      var d = clear(r.detail), node = it.node;
      d.appendChild(h('div', { class: 'm-atlas-dtop' }, stTag(node.status),
        h('span', { class: 'm-atlas-dlayer' }, P(T.layer) + ' ' + n(pad(it.li + 1)) + ' · ' + P(it.layer.label))));
      d.appendChild(h('h5', null, nameEl(node)));
      d.appendChild(h('p', null, rich(P(node.note))));
      d.appendChild(h('p', { class: 'm-atlas-ev' }, evTag(), ' ', rich(P(node.evidence))));
      d.appendChild(h('p', { class: 'note' }, stLabel(node.status) + ': ' + stHelp(node.status)));
      it.row.appendChild(d);
    }

     
    function protoSection() {
      var sec = h('section', { class: 'm-atlas-sec', 'aria-labelledby': 'ma-proto-h' });
      sec.appendChild(h('div', { class: 'm-atlas-head' }, h('h3', { id: 'ma-proto-h' }, P(T.protoH)), h('p', null, P(T.protoP))));
      var list = h('div', { class: 'm-atlas-protos', role: 'list' });
      list.appendChild(h('div', { class: 'm-atlas-prow is-head', 'aria-hidden': 'true' },
        h('span', null, ''), h('span', null, P(T.colWhat)), h('span', null, P(T.colWhen))));
      (A.protocols || []).forEach(function (p) {
        list.appendChild(h('div', { class: 'm-atlas-prow', role: 'listitem', id: 'ma-proto-' + p.key, tabindex: '-1' },
          h('div', { class: 'm-atlas-pname' },
            ar() && PROTO_AR[p.key] ? h('h4', { class: 'is-ar' }, PROTO_AR[p.key])
              : h('h4', null, h('bdi', { dir: 'ltr' }, p.name)),
            stTag(p.status)),
          h('div', { class: 'm-atlas-pcell' }, h('span', { class: 'm-atlas-plab' }, P(T.colWhat)), h('p', null, rich(P(p.plain)))),
          h('div', { class: 'm-atlas-pcell' }, h('span', { class: 'm-atlas-plab' }, P(T.colWhen)), h('p', null, rich(P(p.when)))),
          h('p', { class: 'm-atlas-pev' }, h('span', { class: 'm-atlas-evtag' }, P(T.inEv)), ' ', rich(P(p.in_evidence)))));
      });
      sec.appendChild(list);
      return sec;
    }

     
    function bizSection() {
      var sec = h('section', { class: 'm-atlas-sec', 'aria-labelledby': 'ma-biz-h' });
      var bs = A.business_systems || [];
      var c = { connected: 0, in_code: 0, possible_path: 0 };
      bs.forEach(function (b) { c[b.status] = (c[b.status] || 0) + 1; });
      var protoName = {};
      (A.protocols || []).forEach(function (p) { protoName[p.key] = p.name; });
      sec.appendChild(h('div', { class: 'm-atlas-head' }, h('h3', { id: 'ma-biz-h' }, P(T.bizH)), h('p', null, P(T.bizP)),
        h('p', { class: 'm-atlas-bizcount' }, count(bs.length, SYSTEMS) + ': ',
          STATES.map(function (s, i) { return [i ? ' · ' : '', glyph(s), ' ', stLabel(s) + ' ' + n(c[s] || 0)]; }))));
      if (A.limits) sec.appendChild(h('blockquote', { class: 'm-atlas-limits' }, h('h4', null, P(T.limitsH)), h('p', null, rich(P(A.limits)))));
      var ul = h('ul', { class: 'm-atlas-biz' });
      bs.forEach(function (b) {
        ul.appendChild(h('li', { class: 'm-atlas-brow is-' + b.status },
          h('div', { class: 'm-atlas-bname' }, h('h4', null, rich(P(b.name))), stTag(b.status)),
          h('div', { class: 'm-atlas-bnote' }, h('p', null, rich(P(b.note))), h('p', { class: 'm-atlas-ev' }, evTag(), ' ', rich(P(b.evidence)))),
          h('div', { class: 'm-atlas-bpath' },
            h('p', null, rich(P(b.path))),
            (b.protocols || []).length ? h('div', { class: 'm-atlas-ptags', role: 'group', 'aria-label': P(T.protocols) },
              b.protocols.map(function (k) {
                return h('a', { class: 'm-atlas-ptag mono', href: '#ma-proto-' + k, title: P(T.goProto),
                  onclick: function (e) {
                    e.preventDefault();
                    var t = document.getElementById('ma-proto-' + k); if (!t) return;
                    t.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'center' });
                    t.focus({ preventScroll: true });
                    t.classList.remove('is-flash'); void t.offsetWidth; t.classList.add('is-flash');
                  } }, ar() && PROTO_AR[k] ? PROTO_AR[k] : h('bdi', { dir: 'ltr' }, protoName[k] || k));
              })) : null)));
      });
      sec.appendChild(ul);
      return sec;
    }

     
    var demo = (A.demo || []).slice().sort(function (a, b) { return a.step - b.step; });
    var meta = A.demo_meta || {};
    var ticks = [];
    demo.forEach(function (s, i) {
      var att = s.payload && s.payload.attempts;
      if (s.outcome === 'retry' && att && att.length > 1) {
        att.forEach(function (a, k) { ticks.push({ i: i, kind: 'attempt', a: k }); });
      } else if (s.outcome === 'waiting_human') {
        ticks.push({ i: i, kind: 'wait' });
        ticks.push({ i: i, kind: 'approved' });
      } else ticks.push({ i: i, kind: 'step' });
    });
    var sim = { pos: -1, running: false, timer: null, log: [] };

    function stepDelay(next) {
      if (!next) return 1300;
      if (next.kind === 'attempt' && next.a > 0) { var w = demo[next.i].payload.attempts[next.a].wait_ms; return w || 1300; }
      return 1300;
    }
    function isWaiting() { return sim.pos >= 0 && ticks[sim.pos].kind === 'wait'; }
    function isDone() { return sim.pos >= ticks.length - 1; }

    function simSection() {
      var sec = h('section', { class: 'm-atlas-sec m-atlas-sim', 'aria-labelledby': 'ma-sim-h' });
      sec.appendChild(h('div', { class: 'm-atlas-head' },
        h('div', { class: 'm-atlas-title' }, h('h3', { id: 'ma-sim-h' }, P(meta.title || ['', ''])), api.chip('simulated', P(T.simTag))),
        h('p', null, P(meta.note || ['', '']) + ' '),
        h('p', { class: 'note' }, P(T.trace), ' ', meta.trace_id ? h('code', { dir: 'ltr', translate: 'no' }, meta.trace_id) : null)));

      var box = h('div', { class: 'm-atlas-simbox', tabindex: '-1' });
      
      var runB = h('button', { type: 'button', class: 'btn btn-primary m-atlas-run', onclick: toggleRun });
      var stepB = h('button', { type: 'button', class: 'btn m-atlas-stepb', onclick: function () { manualStep(); } }, P(T.step));
      var resetB = h('button', { type: 'button', class: 'btn m-atlas-reset', onclick: function () { resetSim(true); } }, P(T.reset));
      var ctr = h('div', { class: 'm-atlas-ctrl', role: 'group', 'aria-label': P(T.controls) }, reduced ? null : runB, stepB, resetB,
        h('span', { class: 'm-atlas-counter mono', 'aria-hidden': 'true' }));
      box.appendChild(ctr);
      box.appendChild(h('p', { class: 'note m-atlas-keys' }, reduced ? P(T.rm) + ' ' : '', rich(P(T.simKeys))));
      
      var prog = h('ol', { class: 'm-atlas-prog', 'aria-hidden': 'true' });
      demo.forEach(function (s) { prog.appendChild(h('li', { class: 'is-' + s.outcome, title: P(s.title) })); });
      box.appendChild(prog);

      var grid = h('div', { class: 'm-atlas-simgrid' });
      var rail = h('ol', { class: 'm-atlas-rail', 'aria-label': P(T.layers) });
      A.layers.forEach(function (l, i) {
        rail.appendChild(h('li', { 'data-k': l.key }, h('span', { class: 'm-atlas-rdot', 'aria-hidden': 'true' }),
          h('span', { class: 'mono m-atlas-ridx' }, n(pad(i + 1))), h('span', null, P(l.label)),
          h('span', { class: 'sr m-atlas-ractive' })));
      });
      var stage = h('div', { class: 'm-atlas-stage', 'aria-live': 'polite' });
      var logWrap = h('div', { class: 'm-atlas-logwrap' },
        h('h4', { id: 'ma-log-h' }, P(T.logH)),
        h('p', { class: 'note' }, P(T.logTime)));
      var log = h('ol', { class: 'm-atlas-log' });
      logWrap.appendChild(h('div', { role: 'log', 'aria-labelledby': 'ma-log-h', 'aria-live': 'off' }, log));
      grid.appendChild(rail); grid.appendChild(stage); grid.appendChild(logWrap);
      box.appendChild(grid);
      sec.appendChild(box);

      box.addEventListener('keydown', function (e) {
        if (e.target && /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
        if (e.altKey || e.ctrlKey || e.metaKey) return;
        var k = e.key.toLowerCase();
        if (k === 'n') { e.preventDefault(); manualStep(); }
        else if (k === 'r' && !reduced) { e.preventDefault(); toggleRun(); }
        else if (k === 'a') { if (isWaiting()) { e.preventDefault(); approve(); } }
        else if (e.key === 'Escape') { if (sim.running) { e.preventDefault(); stopRun(); } }
      });
      refs.sim = { box: box, runB: runB, stepB: stepB, resetB: resetB, prog: prog, rail: rail, stage: stage, log: log, counter: ctr.querySelector('.m-atlas-counter') };
      return sec;
    }

    function layerLabel(k) { var x = layerByKey[k]; return x ? P(x.layer.label) : k; }
    function tms(ms) { var s = (ms / 1000).toFixed(3); return '+' + n(s) + ' ' + P(T.sec); }

    function advance() {
      if (isDone() || isWaiting()) return false;
      sim.pos++;
      var t = ticks[sim.pos], s = demo[t.i];
      var entry = { t: s.t_ms, layer: s.layer, outcome: s.outcome, title: s.title, kind: t.kind, a: t.a, step: s.step };
      if (t.kind === 'attempt') entry.outcome = demo[t.i].payload.attempts[t.a].result === 'timeout' ? 'retry' : 'ok';
      if (t.kind === 'approved') { entry.outcome = 'ok'; entry.t = null; }
      sim.log.push(entry);
      return true;
    }
    function manualStep() {
      if (isWaiting()) { var ab = refs.sim.stage.querySelector('.m-atlas-approve'); if (ab) ab.focus(); return; }
      if (sim.running) stopRun();
      if (advance()) {
        paint();
        if (isWaiting()) { var b = refs.sim.stage.querySelector('.m-atlas-approve'); if (b) b.focus(); }
      }
    }
    function approve() {
      if (!isWaiting()) return;
      var resume = sim.wasRunning;
      sim.pos++;
      var s = demo[ticks[sim.pos].i];
      sim.log.push({ t: null, layer: s.layer, outcome: 'ok', kind: 'approved', step: s.step });
      paint();
      refs.sim.stepB.focus();
      if (resume && !reduced) startRun();
    }
    function toggleRun() { if (sim.running) stopRun(); else startRun(); }
    function startRun() {
      if (reduced) return;
      if (isDone()) resetSim(false);
      if (isWaiting()) return;
      sim.running = true; sim.wasRunning = true;
      schedule();
      paint();
    }
    function stopRun() {
      sim.running = false; sim.wasRunning = false;
      if (sim.timer) { clearTimeout(sim.timer); sim.timer = null; }
      paint();
    }
    function schedule() {
      if (sim.timer) clearTimeout(sim.timer);
      var next = ticks[sim.pos + 1];
      var delay = sim.pos < 0 ? 350 : stepDelay(next);
      sim.timer = setTimeout(function () {
        sim.timer = null;
        if (!sim.running) return;
        advance();
        if (isWaiting()) { sim.running = false; paint(); return; }
        if (isDone()) { sim.running = false; sim.wasRunning = false; paint(); return; }
        paint();
        schedule();
      }, delay);
      if (next && next.kind === 'attempt' && next.a > 0) sim.backoffUntil = Date.now() + delay;
    }
    function resetSim(focus) {
      stopRun();
      sim.pos = -1; sim.log = []; sim.wasRunning = false;
      paint();
      if (focus) refs.sim.stepB.focus();
    }

    function paint() {
      var r = refs.sim; if (!r) return;
      var t = sim.pos >= 0 ? ticks[sim.pos] : null, s = t ? demo[t.i] : null;
      
      r.runB.textContent = sim.running ? P(T.pause) : P(T.run);
      r.runB.setAttribute('aria-pressed', sim.running ? 'true' : 'false');
      var stepOff = isDone() || isWaiting();
      r.stepB.setAttribute('aria-disabled', stepOff ? 'true' : 'false');
      r.runB.setAttribute('aria-disabled', isWaiting() ? 'true' : 'false');
      r.counter.textContent = P(T.stepOf) + ' ' + n(s ? s.step : 0) + ' ' + P(T.of) + ' ' + n(demo.length);
      
      Array.prototype.forEach.call(r.prog.children, function (li, i) {
        var done = s && (i < t.i || (i === t.i && (t.kind !== 'wait' && !(t.kind === 'attempt' && t.a === 0))));
        li.classList.toggle('is-done', !!done);
        li.classList.toggle('is-current', !!s && i === t.i);
      });
      
      var visited = {};
      sim.log.forEach(function (e) { visited[e.layer] = true; });
      Array.prototype.forEach.call(r.rail.children, function (li) {
        var k = li.getAttribute('data-k'), on = !!s && s.layer === k;
        li.classList.toggle('is-active', on);
        li.classList.toggle('is-visited', !!visited[k]);
        if (on) li.setAttribute('aria-current', 'step'); else li.removeAttribute('aria-current');
        li.querySelector('.m-atlas-ractive').textContent = on ? ' (' + P(T.activeNow) + ')' : '';
      });
      
      var st = clear(r.stage);
      if (!s) {
        st.appendChild(h('p', { class: 'm-atlas-ready' }, P(T.ready)));
        st.appendChild(h('ol', { class: 'm-atlas-plan' }, demo.map(function (d) {
          return h('li', null, h('span', { class: 'mono' }, n(pad(d.step))), h('span', null, P(d.title)), h('small', null, layerLabel(d.layer)));
        })));
      } else {
        var outcome = t.kind === 'approved' ? 'ok' : (t.kind === 'attempt' ? (t.a === 0 ? 'retry' : 'ok') : s.outcome);
        var outLabel = t.kind === 'approved' ? P(T.approved) : P((meta.outcomes || {})[outcome] || [outcome, outcome]);
        st.appendChild(h('div', { class: 'm-atlas-stop' },
          h('span', { class: 'mono m-atlas-sno' }, P(T.stepOf) + ' ' + n(s.step) + ' ' + P(T.of) + ' ' + n(demo.length)),
          h('span', { class: 'm-atlas-slayer' }, layerLabel(s.layer)),
          h('span', { class: 'm-atlas-out is-' + outcome }, outLabel)));
        st.appendChild(h('h4', null, P(s.title)));
        st.appendChild(h('p', null, P(s.detail)));
        if (t.kind === 'attempt') st.appendChild(attemptsView(s, t.a));
        if (s.outcome === 'ignored') st.appendChild(dupView(s));
        if (t.kind === 'wait') st.appendChild(h('div', { class: 'm-atlas-wait' },
          h('p', null, P(T.waitBox)),
          h('button', { type: 'button', class: 'btn btn-primary m-atlas-approve', onclick: approve }, P(T.approve))));
        if (t.kind === 'approved') st.appendChild(h('p', { class: 'm-atlas-okline' }, P(T.approved)));
        if (isDone()) st.appendChild(h('p', { class: 'm-atlas-okline' }, P(T.done)));
        st.appendChild(h('div', { class: 'm-atlas-payload' },
          h('p', { class: 'm-atlas-plab' }, P(T.payload)),
          h('pre', { dir: 'ltr', tabindex: '0', 'aria-label': P(T.payload) }, JSON.stringify(s.payload, null, 2))));
      }
      
      var lg = clear(r.log);
      if (!sim.log.length) lg.appendChild(h('li', { class: 'm-atlas-lempty' }, P(T.logEmpty)));
      sim.log.forEach(function (e, idx) {
        var d = demo.filter(function (x) { return x.step === e.step; })[0];
        var text;
        if (e.kind === 'attempt') {
          var at = d.payload.attempts[e.a];
          text = P(T.attempt) + ' ' + n(at.n) + ': ' + (at.result === 'timeout' ? P(T.timeout) :
            (at.wait_ms ? (ar() ? 'بعد انتظار ' + n(at.wait_ms.toLocaleString('en-US')).replace(/,/g, '٬') + ' ' + P(T.ms) + '، ' : 'after a ' + at.wait_ms.toLocaleString('en-US') + ' ms wait, ') : '') +
            P(T.created) + (at.draft_id ? ' ' : ''));
        } else if (e.kind === 'approved') text = P(T.approvedLog);
        else text = P(d.title);
        var outKey = e.kind === 'approved' ? 'ok' : e.outcome;
        lg.appendChild(h('li', { class: idx === sim.log.length - 1 ? 'is-new' : null },
          h('span', { class: 'mono m-atlas-lt' }, e.t == null ? '—' : tms(e.t)),
          h('span', { class: 'm-atlas-ll' }, layerLabel(e.layer)),
          h('span', { class: 'm-atlas-out is-' + outKey }, e.kind === 'approved' ? P(T.approvedTag) : P((meta.outcomes || {})[outKey] || [outKey, outKey])),
          h('span', { class: 'm-atlas-lx' }, text, e.kind === 'attempt' && d.payload.attempts[e.a].draft_id ? h('code', { dir: 'ltr', translate: 'no' }, d.payload.attempts[e.a].draft_id) : null)));
      });
      var lw = r.log; lw.scrollTop = lw.scrollHeight;
    }

    function attemptsView(s, upto) {
      var p = s.payload, list = h('ol', { class: 'm-atlas-attempts' });
      p.attempts.forEach(function (a, k) {
        if (k > upto + 1) return;
        var pending = k === upto + 1;
        var li = h('li', { class: pending ? 'is-pending' : (a.result === 'timeout' ? 'is-fail' : 'is-ok') },
          h('b', null, P(T.attempt) + ' ' + n(a.n)),
          a.wait_ms ? h('span', { class: 'm-atlas-bo' }, P(T.backoff) + ': ', ar() ? n(a.wait_ms.toLocaleString('en-US')).replace(/,/g, '٬') + ' ' + P(T.ms) : h('bdi', { dir: 'ltr', class: 'mono' }, a.wait_ms.toLocaleString('en-US') + ' ms'),
            pending && sim.running && !reduced ? h('span', { class: 'm-atlas-bobar', style: '--bo:' + a.wait_ms + 'ms' }) : null) : null,
          h('span', null, pending ? '…' : (a.result === 'timeout' ? P(T.timeout) : P(T.created))),
          a.draft_id && !pending ? h('code', { dir: 'ltr', translate: 'no' }, a.draft_id) : null);
        list.appendChild(li);
      });
      return h('div', { class: 'm-atlas-retry' }, list,
        h('p', { class: 'note' }, P(T.policy) + ': ', ar() ? P(T.policyText) : h('bdi', { dir: 'ltr', class: 'mono' }, p.backoff || ''), ' · ' + P(T.maxA) + ': ' + n(p.max_attempts || '')));
    }
    function dupView(s) {
      var key = s.payload.idempotency_key, first = null;
      demo.some(function (d) { if (d.step < s.step && d.payload && d.payload.idempotency_key === key) { first = d; return true; } return false; });
      return h('div', { class: 'm-atlas-dup' },
        h('p', null, P(T.key) + ': ', h('code', { dir: 'ltr', translate: 'no', class: 'm-atlas-key' }, key),
          first ? ' · ' + P(T.firstSeen) + ' ' + n(first.step) + ' (' : '', first ? h('code', { dir: 'ltr', translate: 'no' }, first.payload.event_id || '') : null, first ? ')' : ''),
        h('p', { class: 'm-atlas-okline' }, P(T.dupResult)));
    }

     
    function render() {
      if (sim.timer) { clearTimeout(sim.timer); sim.timer = null; }
      var wasRunning = sim.running;
      sim.running = false;
      clear(host); refs = {};
      var map = mapSection();
      host.appendChild(map);
      host.appendChild(protoSection());
      host.appendChild(bizSection());
      host.appendChild(simSection());
      setFilter(state.filter);
      selectNode(state.node, false);
      paint();
      if (wasRunning) startRun();
    }
    render();
    if (api.onLang) api.onLang(function () {
      var id = host.contains(document.activeElement) && document.activeElement.id;
      render();
      if (id) { var f = document.getElementById(id); if (f) f.focus(); }
    });
  }

  (window.StudioModules = window.StudioModules || {}).atlas = { mount: mount };
})();
