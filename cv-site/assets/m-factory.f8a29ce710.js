 
(function () {
  'use strict';
  var SVGNS = 'http://www.w3.org/2000/svg';

   
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
  function sv(tag, attrs) { var e = document.createElementNS(SVGNS, tag); setAttrs(e, attrs); for (var i = 2; i < arguments.length; i++) add(e, arguments[i]); return e; }
  function clear(n) { while (n.firstChild) n.removeChild(n.firstChild); return n; }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function round(x, d) { var f = Math.pow(10, d == null ? 6 : d); return Math.round(x * f) / f; }

   
  var T = {
    pathH: ['المسار: ثماني محطات، وبوابات لا تُتخطى', 'The path: eight stages, and gates we never skip'],
    pathP: ['اختر محطة لترى ما يحدث فيها، وما يراه العميل، والفحوص التي لا نتخطاها. التوازي يقصّر البناء، ولا يقصّر التحقق.',
      'Select a stage to see what happens in it, what the client sees and the checks we never skip. Parallel work shortens the build, never the verification.'],
    rail: ['محطات المسار', 'Stages of the path'],
    keys: ['الأسهم تنقل بين المحطات، ومفتاح [Home] أو مفتاح [End] ينقل إلى الطرفين.', 'Arrow keys move between stages; [Home] and [End] jump to either end.'],
    method: ['وصف لطريقة عملنا، لا قياس.', 'A description of how we work, not a measurement.'],
    of: ['من', 'of'],
    what: ['ما يحدث', 'What happens'],
    sees: ['ما يراه العميل', 'What the client sees'],
    checks: ['فحوص لا تُتخطى', 'Checks that cannot be skipped'],
    speeds: ['ما يسرّع هذه المحطة، وحالة دليله', 'What speeds this stage, and the state of its evidence'],
    evidence: ['الدليل', 'Evidence'],
    loop: ['تعود الدورة إلى المواصفة، لا إلى البداية.', 'The cycle returns to the spec, not to the start.'],
    kind: { serial: ['متتابعة', 'Sequential'], parallel: ['متوازية', 'Parallel'], gate: ['بوابة', 'Gate'], loop: ['دورة', 'Loop'] },
    tracks: ['مسارات', 'tracks'],

    cpH: ['أثر التوازي على المسار الحرج', 'What parallel work does to the critical path'],
    cpCap: ['رسم لمعادلة الحاسبة أدناه بمدخلاتك الحالية، وليس جدولًا زمنيًّا ولا قياسًا. الحصة المتتابعة مرسومة نصفين: قبل المسارات وبعدها.',
      'A drawing of the calculator’s formula below, with your current inputs. It is not a schedule and not a measurement. The sequential share is drawn in two halves: before and after the tracks.'],
    cpIll: ['توضيح للمعادلة', 'Illustration of the formula'],
    cpRow1: ['خط واحد متتابع', 'One sequential line'],
    cpRow2: ['مسارات متوازية', 'Parallel tracks'],
    cpPre: ['الاستكشاف والمواصفة والبنية', 'Discovery, spec and architecture'],
    cpBuild: ['البناء', 'Build'],
    cpGate: ['التكامل والتحقق، بالطول نفسه في الصفّين', 'Integration and verification, the same length on both rows'],
    cpRework: ['إعادة العمل والانتظار', 'Rework and waiting'],
    cpCrit: ['المسار الحرج', 'Critical path'],
    cpCritNote: ['المسار الحرج هو الحصة المتتابعة مع مسار واحد. المسارات متساوية في هذا النموذج، فأيٌّ منها حرج. بوابة التحقق لا تقصر في أي صف.',
      'The critical path is the sequential share plus one track. The tracks are equal in this model, so any one of them is critical. The verification gate is no shorter on either row.'],
    cpScenario: ['سيناريو توضيحي', 'illustrative scenario'],
    cpEstimate: ['تقدير', 'estimate'],

    inputsH: ['المدخلات', 'Inputs'],
    outputsH: ['النتائج المقدَّرة', 'Estimated results'],
    allowed: ['المدى المسموح', 'Allowed'],
    outOfRange: ['خارج المدى المسموح', 'Outside the allowed range'],
    raisedH: ['رُفع الحد الأعلى ليساوي الحد الأدنى.', 'The upper bound was raised to match the lower bound.'],
    loweredL: ['خُفّض الحد الأدنى ليساوي الحد الأعلى.', 'The lower bound was lowered to match the upper bound.'],
    stripH: ['المدد على محور واحد', 'The durations on one axis'],
    stripTrad: ['المسار التقليدي، سيناريو توضيحي', 'Traditional path, illustrative scenario'],
    stripPlan: ['هدفنا التخطيطي', 'Our planning target'],
    stripModel: ['المدة المقدَّرة', 'Modelled duration'],
    orMore: ['أو أكثر', 'or more'],
    rangeNote: ['الطرف الأقصر للمدة يفترض تجنّب إعادة العمل كلها، وهو الحد المتفائل الذي تعتمده المعادلة. الطرف الأطول يفترض ألّا يُتجنَّب شيء منها.',
      'The shorter end of the duration assumes all rework is avoided, the optimistic bound the formula uses. The longer end assumes none of it is.'],
    planCost: ['التكلفة عبر الهدف التخطيطي', 'Cost across the planning target'],
    single: ['قيمة واحدة من مدخلك', 'one value, from your input'],
    yes: ['نعم', 'Yes'], no: ['لا', 'No'],
    assumH: ['شروط المقارنة العادلة', 'Fair-comparison assumptions'],
    notMeasH: ['ما لم نقسه بعد', 'What we have not measured'],
    formulaH: ['المعادلة', 'The formula'],
    constant: ['ثابت معلن', 'Declared constant'],
    reset: ['إعادة المدخلات الافتراضية', 'Reset the sample inputs'],
    vs: ['مقابل', 'against'],

    measH: ['ما قسناه فعلًا', 'What we measured'],
    asOf: ['حتى', 'As of'],
    start: ['البداية', 'Start'], end: ['النهاية', 'End'], source: ['المصدر', 'Source'], limit: ['الحد', 'Limit'],
    merge: ['الدمج', 'Merge'], verified: ['التحقق على النطاقين', 'Verified on both domains'],
    releaseH: ['زمن إصدار واحد', 'One release interval'],
    paceH: ['وتيرة المستودع', 'Repository pace'],
    toDay: ['حتى ', 'to '],
    month: ['الشهر', 'Month'],
    scale: ['المحور يبدأ من الصفر، والأعمدة بمقياس واحد.', 'The axis starts at zero, and every bar uses one scale.'],
    missing: ['بيانات المصنع غير متاحة في هذه النسخة.', 'The factory data is not available in this build.']
  };

   
  var STAGE = {
    discovery: {
      sees: ['صفحة واحدة: القرار المطلوب، وصاحبه، واختبار القبول الذي سيحكم عليه.', 'One page: the decision needed, its owner, and the acceptance test that will judge it.'],
      checks: [['لا يبدأ البناء بلا صاحب قرار واختبار قبول مكتوب.', 'Building does not start without a decision owner and a written acceptance test.']],
      drivers: []
    },
    spec: {
      sees: ['التكليف المكتوب: المستخدمون والبيانات والصلاحيات، وحالة ناجحة وأخرى فاشلة يقرؤهما ويعترض عليهما.', 'The written brief: users, data, permissions, and one passing and one failing case to read and challenge.'],
      checks: [['لكل متطلب حالة اختبار، وما لا يُختبر لا يُبنى.', 'Every requirement has a test case; what cannot be tested is not built.'],
        ['الصلاحيات تُسمّى قبل أي شاشة.', 'Permissions are named before any screen.']],
      drivers: ['spec_driven']
    },
    architecture: {
      sees: ['خريطة قصيرة: من أين تأتي البيانات، ومن يرى ماذا، وأي المسارات تُبنى معًا.', 'A short map: where the data comes from, who sees what, and which tracks are built together.'],
      checks: [['قواعد الوصول وعقد البيانات تُكتب قبل الواجهة.', 'Access rules and the data contract are written before the interface.'],
        ['لكل ملف مالك واحد، فلا يعدّل مساران الملف نفسه.', 'Every file has one owner, so no two tracks edit the same file.']],
      drivers: ['context_engineering']
    },
    parallel_build: {
      sees: ['تقدّم كل مسار على حدة، ونسخ معاينة يفتحها بنفسه.', 'Progress per track, and preview builds to open themselves.'],
      checks: [['كل تغيير يُراجَع قبل دمجه.', 'Every change is reviewed before it is merged.'],
        ['الفحوص الآلية تعمل على كل مسار، لا على المسار الأخير وحده.', 'Automated checks run on every track, not only on the last one.']],
      drivers: ['coding_agents', 'reuse']
    },
    integration: {
      sees: ['نسخة واحدة تجمع المسارات على بيانات عيّنة آمنة.', 'One build that joins the tracks, on safe sample data.'],
      checks: [['المخرجات تلتقي عند عقد البيانات نفسه، وأي خلاف يُصلَح قبل التحقق.', 'The outputs meet at the same data contract, and any mismatch is fixed before verification.']],
      drivers: []
    },
    verification: {
      sees: ['نتائج الفحوص كما هي: ما نجح، وما فشل، وما لم يُقَس.', 'Check results as they are: what passed, what failed and what was not measured.'],
      checks: [['اختبارات الأمان والصلاحيات.', 'Security and permission tests.'],
        ['اختبارات القبول المكتوبة في المواصفة.', 'The acceptance tests written in the spec.'],
        ['مطابقة هوية النسخة المنشورة.', 'A match of the released build’s identity.']],
      drivers: ['ci_cd']
    },
    demo: {
      sees: ['نموذج يعمل على بيانات عيّنة يجربه بنفسه، مع قائمة صريحة بما ليس جاهزًا للإنتاج.', 'A working prototype on sample data to try themselves, with a plain list of what is not ready for production.'],
      checks: [['لا تظهر بيانات تشغيلية حقيقية في العرض.', 'No real operational data appears in the demo.'],
        ['العرض يُوسَم بأنه عرض، لا منتج.', 'The demo is labelled a demo, not a product.']],
      drivers: []
    },
    iteration: {
      sees: ['قائمة تغييرات أضيق، مرتبة حسب أثرها.', 'A narrower list of changes, ordered by their effect.'],
      checks: [['كل تغيير يعود إلى المواصفة أولًا، ثم يمر بالتحقق نفسه.', 'Every change returns to the spec first, then passes the same verification.']],
      drivers: ['spec_driven']
    }
  };

  var MONTHS = {
    ar: ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'],
    en: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
  };

  function mount(root, api) {
    var host = h('div', { class: 'm-factory' });
    root.appendChild(host);
    var data = api.data && api.data.metrics;
    var P = function (pair) { return api.P(pair); };
    var ar = function () { return api.lang() === 'ar'; };
    if (!data || !data.calculator || !data.stages) { host.appendChild(h('p', { class: 'note' }, P(T.missing))); return; }

    var calc = data.calculator;
    var S = (calc.constants.filter(function (c) { return c.key === 'serial_share'; })[0] || { value: 0.4 }).value;
    var defs = {};
    calc.inputs.forEach(function (d) { defs[d.key] = d; });
    function defaults() { var v = {}; calc.inputs.forEach(function (d) { v[d.key] = d.default; }); return v; }
    var reduced = !!api.reducedMotion;
    var state = { stage: data.stages[0].key, v: defaults() };
    var refs = {};

     
    function fmt(n, dec) {
      var s = Number(n).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: dec == null ? 1 : dec });
      return ar() ? api.num(s).replace(/,/g, '٬') : s;
    }
    function cur(n) { return fmt(Math.round(n), 0); }
    function money(n) { return cur(n) + ' ' + P(calc.currency.label); }
    function moneyRange(a, b) { return range(a, b, cur) + ' ' + P(calc.currency.label); }
    function range(a, b, f) {
      if (round(a, 3) === round(b, 3)) return f(a);
      return ar() ? 'من ' + f(a) + ' إلى ' + f(b) : f(a) + '–' + f(b);
    }
    function weeks(n) { return fmt(n, 1); }
     
    function wu(n) {
      n = round(n, 1);
      if (!ar()) return n === 1 ? 'week' : 'weeks';
      if (n % 1 === 0) { if (n >= 11 && n <= 99) return 'أسبوعًا'; if (n >= 3 && n <= 10) return 'أسابيع'; return 'أسبوع'; }
      return 'أسابيع';
    }
    function ltr(text, cls) { return h('bdi', { dir: 'ltr', class: cls || 'mono' }, text); }
     
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
    function utc(t) { return ar() ? h('span', null, api.num(t) + ' بالتوقيت العالمي') : ltr(t + ' UTC'); }
    function fdate(s) {
      var m = /^(\d{4})-(\d{2})(?:-(\d{2}))?(?:T(\d{2}:\d{2}:\d{2}(?:\.\d+)?)Z)?$/.exec(String(s || ''));
      if (!m) return document.createTextNode(String(s || ''));
      var mon = MONTHS[api.lang()][Number(m[2]) - 1];
      var txt = (m[3] ? api.num(String(Number(m[3]))) + ' ' : '') + mon + ' ' + api.num(m[1]);
      if (!m[4]) return document.createTextNode(txt);
      return h('span', null, txt + ' · ', utc(m[4]));
    }
    function chip(stateKey, label) { return api.chip(stateKey, label); }

     
    function model(v) {
      var f = S + (1 - S) / v.parallel_tracks;
      var Tw = v.traditional_weeks, R = v.rework_share, N = v.team_size, C = v.weekly_cost_per_person;
      var L = v.our_weeks_low, H = v.our_weeks_high;
      var wOpt = round(Tw * (1 - R) * f), wCons = round(Tw * f);
      return {
        T: Tw, R: R, N: N, C: C, L: L, H: H, P: v.parallel_tracks, f: f,
        wOpt: wOpt, wCons: wCons,
        tradCost: Tw * N * C, costOpt: round(wOpt * N * C, 2), costCons: round(wCons * N * C, 2),
        planLow: L * N * C, planHigh: H * N * C,
        pos: wOpt > H ? 'above' : (wOpt < L ? 'below' : 'inside')
      };
    }
     
    (function () {
      var ex = calc.example; if (!ex) return;
      var m = model(Object.assign({}, ex.inputs));
      var o = ex.outputs, ok = Math.abs(m.wOpt - o.modelled_weeks) < 1e-6 && Math.abs(m.costOpt - o.modelled_cost) < 1e-3 &&
        m.tradCost === o.traditional_cost && (m.pos === 'inside') === o.inside_planning_target;
      if (!ok && window.console) console.warn('[factory] calculator does not reproduce metrics.calculator.example');
    })();

     
    function pathSection() {
      var stages = data.stages;
      var sec = h('section', { class: 'm-factory-sec m-factory-path', 'aria-labelledby': 'mf-path-h' });
      sec.appendChild(h('div', { class: 'm-factory-head' },
        h('h3', { id: 'mf-path-h' }, P(T.pathH)),
        h('p', null, P(T.pathP)),
        h('p', { class: 'note' }, P(T.method) + ' ', rich(P(T.keys)))));

      var wrap = h('div', { class: 'm-factory-railwrap' });
      
      var svg = sv('svg', { class: 'm-factory-railsvg', viewBox: '0 0 800 64', preserveAspectRatio: 'none', 'aria-hidden': 'true', focusable: 'false' },
        sv('path', { class: 'm-factory-loop', d: 'M750 30 C750 8 735 4 712 4 H188 C165 4 150 8 150 30' }),
        sv('path', { class: 'm-factory-lane', d: 'M250 30 C282 30 296 16 326 16 H374 C404 16 418 30 450 30' }),
        sv('path', { class: 'm-factory-lane', d: 'M250 30 C282 30 296 44 326 44 H374 C404 44 418 30 450 30' }));
      wrap.appendChild(svg);
      wrap.appendChild(h('div', { class: 'm-factory-base', 'aria-hidden': 'true' }));
      var fill = h('div', { class: 'm-factory-fill', 'aria-hidden': 'true' });
      wrap.appendChild(fill);

      var list = h('div', { class: 'm-factory-stops', role: 'tablist', 'aria-label': P(T.rail) });
      var tabs = {};
      stages.forEach(function (st, i) {
        var b = h('button', {
          type: 'button', role: 'tab', id: 'mf-tab-' + st.key, class: 'm-factory-stop is-' + st.kind,
          'aria-controls': 'mf-stage-panel', 'aria-selected': 'false', tabindex: '-1',
          onclick: function () { select(st.key, false); }
        },
          h('span', { class: 'm-factory-dot', 'aria-hidden': 'true' }),
          h('span', { class: 'm-factory-idx mono' }, api.num(pad(i + 1))),
          h('span', { class: 'm-factory-name' }, P(st.label)),
          h('span', { class: 'm-factory-kind' }, P(T.kind[st.kind] || T.kind.serial)));
        tabs[st.key] = b;
        list.appendChild(b);
      });
      list.addEventListener('keydown', function (e) {
        var keys = stages.map(function (s) { return s.key; });
        var i = keys.indexOf(state.stage), n = keys.length, next = null;
        var fwd = ar() ? 'ArrowLeft' : 'ArrowRight', back = ar() ? 'ArrowRight' : 'ArrowLeft';
        if (e.key === fwd || e.key === 'ArrowDown') next = (i + 1) % n;
        else if (e.key === back || e.key === 'ArrowUp') next = (i - 1 + n) % n;
        else if (e.key === 'Home') next = 0;
        else if (e.key === 'End') next = n - 1;
        if (next == null) return;
        e.preventDefault();
        select(keys[next], true);
      });
      wrap.appendChild(list);
      sec.appendChild(wrap);

      var panel = h('div', { class: 'm-factory-stage', role: 'tabpanel', id: 'mf-stage-panel', tabindex: '0' });
      sec.appendChild(panel);
      refs.path = { wrap: wrap, fill: fill, tabs: tabs, panel: panel };
      return sec;
    }

    function select(key, focus) {
      var r = refs.path; if (!r) return;
      var prev = state.stage;
      state.stage = key;
      var keys = data.stages.map(function (s) { return s.key; });
      var idx = keys.indexOf(key);
      keys.forEach(function (k, i) {
        var b = r.tabs[k], on = k === key;
        b.setAttribute('aria-selected', on ? 'true' : 'false');
        b.setAttribute('tabindex', on ? '0' : '-1');
        b.classList.toggle('is-done', i <= idx);
      });
      r.wrap.style.setProperty('--p', String(idx / (keys.length - 1)));
      r.wrap.classList.toggle('is-parallel', key === 'parallel_build');
      r.wrap.classList.toggle('is-loop', key === 'iteration');
      if (!reduced && prev !== key) { r.wrap.classList.remove('is-pulse'); void r.wrap.offsetWidth; r.wrap.classList.add('is-pulse'); }
      renderStage();
      if (focus) r.tabs[key].focus();
    }

    function renderStage() {
      var r = refs.path, panel = clear(r.panel);
      var stages = data.stages, idx = 0;
      stages.forEach(function (s, i) { if (s.key === state.stage) idx = i; });
      var st = stages[idx], copy = STAGE[st.key] || { sees: ['', ''], checks: [], drivers: [] };
      panel.setAttribute('aria-labelledby', 'mf-tab-' + st.key);
      panel.appendChild(h('div', { class: 'm-factory-stage-head' },
        h('span', { class: 'm-factory-count mono' }, api.num(pad(idx + 1)) + ' ' + P(T.of) + ' ' + api.num(pad(stages.length))),
        h('h4', null, P(st.label)),
        h('span', { class: 'm-factory-kindtag is-' + st.kind }, P(T.kind[st.kind] || T.kind.serial))));
      panel.appendChild(h('div', { class: 'm-factory-cols' },
        h('div', { class: 'm-factory-col' }, h('h5', null, P(T.what)), h('p', null, P(st.what))),
        h('div', { class: 'm-factory-col' }, h('h5', null, P(T.sees)), h('p', null, P(copy.sees))),
        h('div', { class: 'm-factory-col is-checks' }, h('h5', null, P(T.checks)),
          h('ul', { class: 'm-factory-checks' }, copy.checks.map(function (c) { return h('li', null, P(c)); })))));
      if (st.key === 'iteration') panel.appendChild(h('p', { class: 'm-factory-loopnote' }, P(T.loop)));
      var drivers = (copy.drivers || []).map(function (k) { return (data.drivers || []).filter(function (d) { return d.key === k; })[0]; }).filter(Boolean);
      if (drivers.length) {
        panel.appendChild(h('div', { class: 'm-factory-drivers' },
          h('h5', null, P(T.speeds)),
          h('ul', null, drivers.map(function (d) {
            return h('li', null,
              h('div', { class: 'm-factory-drv-top' }, h('b', null, P(d.label)), chip(d.state)),
              h('p', null, P(d.what)),
              h('p', { class: 'm-factory-ev' }, h('span', { class: 'm-factory-evtag' }, P(T.evidence)), ' ', P(d.evidence)));
          }))));
      }
      refs.cp = null;
      if (st.key === 'parallel_build') panel.appendChild(criticalPath());
    }

     
    function criticalPath() {
      var fig = h('figure', { class: 'm-factory-cp', 'aria-labelledby': 'mf-cp-h' });
      fig.appendChild(h('div', { class: 'm-factory-cp-head' },
        h('h5', { id: 'mf-cp-h' }, P(T.cpH)), chip('proposed', P(T.cpIll))));
      var rows = h('div', { class: 'm-factory-cp-rows' });
      fig.appendChild(rows);
      fig.appendChild(h('ul', { class: 'm-factory-cp-legend' },
        h('li', null, h('i', { class: 'sw is-pre' }), P(T.cpPre)),
        h('li', null, h('i', { class: 'sw is-build' }), P(T.cpBuild)),
        h('li', null, h('i', { class: 'sw is-gate' }), P(T.cpGate)),
        h('li', null, h('i', { class: 'sw is-rework' }), P(T.cpRework)),
        h('li', null, h('i', { class: 'sw is-crit' }), P(T.cpCrit))));
      fig.appendChild(h('figcaption', { class: 'note' }, P(T.cpCritNote) + ' ' + P(T.cpCap)));
      function seg(w, max, cls, title) {
        return h('span', { class: 'm-factory-seg ' + cls, style: 'width:' + (100 * w / max).toFixed(3) + '%', title: title });
      }
      function draw() {
        var m = model(state.v); clear(rows);
        var Tp = m.T * (1 - m.R), pre = Tp * S / 2, build = Tp * (1 - S), post = pre, rew = m.T * m.R, lane = build / m.P;
        var max = m.T;
        var r1 = h('div', { class: 'm-factory-cp-row' },
          h('div', { class: 'm-factory-cp-lab' }, h('b', null, P(T.cpRow1)), h('span', { class: 'mono' }, weeks(m.T) + ' ' + wu(m.T) + ' · ' + P(T.cpScenario))),
          h('div', { class: 'm-factory-cp-track' },
            seg(pre, max, 'is-pre', P(T.cpPre)), seg(build, max, 'is-build', P(T.cpBuild)),
            seg(post, max, 'is-gate', P(T.cpGate)), rew > 0 ? seg(rew, max, 'is-rework', P(T.cpRework)) : null));
        var lanes = h('span', { class: 'm-factory-lanes is-crit-wrap', style: 'width:' + (100 * lane / max).toFixed(3) + '%' });
        for (var i = 0; i < m.P; i++) lanes.appendChild(h('span', { class: 'm-factory-lanebar' + (i === 0 ? ' is-crit' : ''), style: '--d:' + (i * 60) + 'ms' }));
        var r2 = h('div', { class: 'm-factory-cp-row' },
          h('div', { class: 'm-factory-cp-lab' }, h('b', null, P(T.cpRow2) + ' · ' + api.num(String(m.P)) + ' ' + P(T.tracks)), h('span', { class: 'mono' }, weeks(m.wOpt) + ' ' + wu(m.wOpt) + ' · ' + P(T.cpEstimate))),
          h('div', { class: 'm-factory-cp-track' },
            seg(pre, max, 'is-pre is-crit', P(T.cpPre)), lanes, seg(post, max, 'is-gate is-crit', P(T.cpGate))));
        rows.appendChild(r1); rows.appendChild(r2);
        var ticks = h('div', { class: 'm-factory-cp-axis', 'aria-hidden': 'true' });
        var step = m.T <= 16 ? 2 : (m.T <= 30 ? 5 : 10);
        for (var t = 0; t <= m.T + 1e-9; t += step) ticks.appendChild(h('span', { style: 'inset-inline-start:' + (100 * t / max).toFixed(3) + '%' }, fmt(t, 0)));
        rows.appendChild(ticks);
      }
      draw();
      refs.cp = draw;
      return fig;
    }

     
    function calcSection() {
      var sec = h('section', { class: 'm-factory-sec m-factory-calc', 'aria-labelledby': 'mf-calc-h' });
      sec.appendChild(h('div', { class: 'm-factory-head' },
        h('div', { class: 'm-factory-title' }, h('h3', { id: 'mf-calc-h' }, P(calc.label)), chip('proposed', P(calc.tag))),
        h('p', null, P(calc.disclaimer))));

      
      var est = data.estimates || [];
      var cmp = h('div', { class: 'm-factory-compare' });
      est.forEach(function (e, i) {
        if (i > 0) cmp.appendChild(h('span', { class: 'm-factory-vs', 'aria-hidden': 'true' }, P(T.vs)));
        cmp.appendChild(h('div', { class: 'm-factory-est is-' + e.kind },
          h('div', { class: 'm-factory-est-top' }, chip(e.state, P(e.tag))),
          h('p', { class: 'm-factory-est-val' }, P(e.display)),
          h('p', { class: 'm-factory-est-lab' }, P(e.label)),
          h('p', { class: 'note' }, P(e.limit)),
          h('p', { class: 'note m-factory-src' }, P(T.source) + ': ', rich(P(e.source)))));
      });
      sec.appendChild(cmp);

      var grid = h('div', { class: 'm-factory-calc-grid' });
      grid.appendChild(inputsBlock());
      grid.appendChild(outputsBlock());
      grid.appendChild(assumptionsBlock());
      sec.appendChild(grid);
      sec.appendChild(formulaBlock());
      return sec;
    }

    function inputsBlock() {
      var box = h('div', { class: 'm-factory-inputs', role: 'group', 'aria-labelledby': 'mf-in-h' });
      box.appendChild(h('h4', { id: 'mf-in-h' }, P(T.inputsH)));
      refs.inputs = {};
      calc.inputs.forEach(function (d) {
        var pct = d.key === 'rework_share';
        var toUi = function (x) { return pct ? Math.round(x * 100) : x; };
        var fromUi = function (x) { return pct ? x / 100 : x; };
        var min = toUi(d.min), max = toUi(d.max), step = toUi(d.step);
        var unit = pct ? '%' : P(d.unit);
        var id = 'mf-in-' + d.key;
        var msg = h('p', { class: 'm-factory-msg', id: id + '-msg', 'aria-live': 'polite' });
        var help = h('p', { class: 'm-factory-help', id: id + '-help' }, P(d.help) + ' ',
          h('span', { class: 'm-factory-bounds' }, P(T.allowed) + ': ', ar() ? 'من ' + fmt(min, 2) + ' إلى ' + fmt(max, 2) : fmt(min, 2) + '–' + fmt(max, 2), ' ' + unit));
        var num = h('input', { type: 'number', id: id, min: min, max: max, step: step, value: toUi(state.v[d.key]), inputmode: 'decimal',
          'aria-describedby': id + '-help ' + id + '-msg' });
        var rng = h('input', { type: 'range', min: min, max: max, step: step, value: toUi(state.v[d.key]),
          'aria-label': P(d.label) + (pct ? ' (%)' : ' (' + P(d.unit) + ')'), 'aria-describedby': id + '-help' });
        function snap(x) { x = Math.min(max, Math.max(min, x)); var k = Math.round((x - min) / step); return round(min + k * step, 4); }
        function setUi(x) { num.value = x; rng.value = x; num.removeAttribute('aria-invalid'); }
        function commit(x, from) {
          state.v[d.key] = fromUi(x);
          msg.textContent = '';
          
          if (d.key === 'our_weeks_low' && state.v.our_weeks_high < state.v.our_weeks_low) {
            state.v.our_weeks_high = state.v.our_weeks_low; refs.inputs.our_weeks_high.set(state.v.our_weeks_high); msg.textContent = P(T.raisedH);
          }
          if (d.key === 'our_weeks_high' && state.v.our_weeks_high < state.v.our_weeks_low) {
            state.v.our_weeks_low = state.v.our_weeks_high; refs.inputs.our_weeks_low.set(state.v.our_weeks_low); msg.textContent = P(T.loweredL);
          }
          if (from !== 'num') num.value = x;
          if (from !== 'rng') rng.value = x;
          update();
        }
        rng.addEventListener('input', function () { var x = snap(Number(rng.value)); num.removeAttribute('aria-invalid'); commit(x, 'rng'); });
        num.addEventListener('input', function () {
          if (num.value === '') return;
          var x = Number(num.value);
          if (!isFinite(x) || x < min || x > max) { num.setAttribute('aria-invalid', 'true'); msg.textContent = P(T.outOfRange) + '.'; return; }
          num.removeAttribute('aria-invalid'); commit(x, 'num'); rng.value = x;
        });
        num.addEventListener('change', function () {
          var x = Number(num.value); if (!isFinite(x) || num.value === '') x = toUi(state.v[d.key]);
          x = snap(x); setUi(x); commit(x, 'change');
        });
        refs.inputs[d.key] = { set: function (val) { setUi(toUi(val)); } };
        box.appendChild(h('div', { class: 'm-factory-field' },
          h('div', { class: 'm-factory-field-top' },
            h('label', { for: id }, P(d.label), ' ', ar() && d.symbol_ar ? h('span', { class: 'm-factory-sym' }, d.symbol_ar) : ltr(d.symbol, 'mono m-factory-sym')),
            h('span', { class: 'm-factory-field-num' }, num, h('span', { class: 'm-factory-unit' }, unit))),
          rng, help, msg));
      });
      box.appendChild(h('button', { type: 'button', class: 'btn m-factory-reset', onclick: function () {
        state.v = defaults();
        calc.inputs.forEach(function (d) { refs.inputs[d.key].set(state.v[d.key]); });
        update();
      } }, P(T.reset)));
      return box;
    }

    function outputsBlock() {
      var box = h('div', { class: 'm-factory-outputs', 'aria-labelledby': 'mf-out-h', role: 'region' });
      box.appendChild(h('h4', { id: 'mf-out-h' }, P(T.outputsH)));
      
      var strip = h('div', { class: 'm-factory-strip', role: 'img', 'aria-labelledby': 'mf-strip-h' },
        h('p', { class: 'm-factory-strip-h', id: 'mf-strip-h' }, P(T.stripH)));
      var rowsS = h('div', { class: 'm-factory-strip-rows' });
      strip.appendChild(rowsS);
      box.appendChild(strip);
      var out = {};
      var dl = h('dl', { class: 'm-factory-out' });
      function row(key, label) {
        var dd = h('dd', { class: 'mono' });
        dl.appendChild(h('div', { class: 'm-factory-out-row' + (key === 'modelled_weeks' ? ' is-key' : '') },
          h('dt', null, h('span', null, label), chip('proposed', P(calc.tag))), dd));
        out[key] = dd;
      }
      var lab = {};
      calc.outputs.forEach(function (o) { lab[o.key] = P(o.label); });
      row('modelled_weeks', lab.modelled_weeks);
      row('modelled_cost', lab.modelled_cost);
      row('planning_cost', P(T.planCost));
      row('weeks_earlier', lab.weeks_earlier);
      row('cost_difference', lab.cost_difference);
      row('traditional_cost', lab.traditional_cost);
      row('inside_planning_target', lab.inside_planning_target);
      box.appendChild(dl);
      var status = h('p', { class: 'm-factory-status', 'aria-live': 'polite' });
      box.appendChild(status);
      box.appendChild(h('p', { class: 'note' }, P(T.rangeNote)));
      refs.out = { dd: out, status: status, strip: rowsS };
      return box;
    }

    function assumptionsBlock() {
      var box = h('aside', { class: 'm-factory-assume', 'aria-labelledby': 'mf-as-h' });
      box.appendChild(h('h4', { id: 'mf-as-h' }, P(T.assumH)));
      box.appendChild(h('ol', { class: 'm-factory-alist' }, (data.assumptions || []).map(function (a, i) {
        return h('li', null, h('span', { class: 'mono m-factory-anum' }, api.num(pad(i + 1))), h('span', null, P(a.text)));
      })));
      if ((data.not_measured || []).length) {
        box.appendChild(h('h4', null, P(T.notMeasH)));
        box.appendChild(h('ul', { class: 'm-factory-nm' }, data.not_measured.map(function (n) {
          return h('li', null, chip(n.state), h('p', null, P(n.text)));
        })));
      }
      return box;
    }

    function formulaBlock() {
      var f = calc.formula;
      var sConst = calc.constants[0];
      return h('div', { class: 'm-factory-formula' },
        h('h4', null, P(T.formulaH)),
        ar() && f.expr_ar ? h('p', { class: 'm-factory-expr is-ar' }, f.expr_ar, h('br'), f.expr_cost_ar) : h('p', { class: 'm-factory-expr' }, ltr(f.expr), h('br'), ltr(f.expr_cost)),
        h('p', null, P(f.text)),
        h('p', null, P(f.reading)),
        sConst ? h('p', { class: 'note' }, P(T.constant) + ': ', ar() && sConst.symbol_ar ? sConst.symbol_ar + ' = ' + api.num(String(sConst.value)) : ltr(sConst.symbol + ' = ' + sConst.value), ' · ' + P(sConst.label) + '. ' + P(sConst.help)) : null,
        h('p', { class: 'note' }, P(f.expr_note) + ' ' + (calc.example ? P(calc.example.note) : '')),
        h('p', { class: 'note' }, P(calc.currency.note)));
    }

    function update() {
      var m = model(state.v);
      var o = refs.out; if (!o) return;
      var wr = function (a, b) { return range(a, b, weeks) + ' ' + wu(b); };
      o.dd.modelled_weeks.textContent = wr(m.wOpt, m.wCons);
      o.dd.modelled_cost.textContent = moneyRange(m.costOpt, m.costCons);
      o.dd.planning_cost.textContent = moneyRange(m.planLow, m.planHigh);
      o.dd.weeks_earlier.textContent = wr(m.T - m.wCons, m.T - m.wOpt);
      o.dd.cost_difference.textContent = moneyRange(m.tradCost - m.costCons, m.tradCost - m.costOpt);
      o.dd.traditional_cost.textContent = money(m.tradCost);
      o.dd.inside_planning_target.textContent = m.pos === 'inside' ? P(T.yes) : P(T.no);
      o.status.textContent = P(calc.messages[m.pos]);
      o.status.className = 'm-factory-status is-' + m.pos;
      
      var max = Math.max(m.T, m.H, m.wCons) * 1.12;
      var sr = clear(o.strip);
      function bar(cls, a, b, label, value) {
        return h('div', { class: 'm-factory-srow ' + cls },
          h('div', { class: 'm-factory-slab' }, h('span', null, label), h('b', { class: 'mono' }, value)),
          h('div', { class: 'm-factory-sline' },
            h('span', { class: 'm-factory-sbar', style: 'inset-inline-start:' + (100 * a / max).toFixed(3) + '%;width:' + Math.max(0.6, 100 * (b - a) / max).toFixed(3) + '%' })));
      }
      var tradTxt = weeks(m.T) + ' ' + wu(m.T) + ' ' + P(T.orMore);
      sr.appendChild(bar('is-trad', 0, m.T, P(T.stripTrad), tradTxt));
      sr.appendChild(bar('is-plan', m.L, m.H, P(T.stripPlan), wr(m.L, m.H)));
      sr.appendChild(bar('is-model', m.wOpt, m.wCons, P(T.stripModel), wr(m.wOpt, m.wCons)));
      var axis = h('div', { class: 'm-factory-saxis', 'aria-hidden': 'true' });
      var step = max <= 16 ? 2 : (max <= 32 ? 4 : (max <= 64 ? 10 : 20));
      for (var t = 0; t <= max; t += step) axis.appendChild(h('span', { style: 'inset-inline-start:' + (100 * t / max).toFixed(3) + '%' }, fmt(t, 0)));
      sr.appendChild(axis);
      sr.parentNode.setAttribute('aria-label', P(T.stripH) + ': ' + P(T.stripTrad) + ' ' + tradTxt + '; ' +
        P(T.stripPlan) + ' ' + wr(m.L, m.H) + '; ' + P(T.stripModel) + ' ' + wr(m.wOpt, m.wCons) + '.');
      if (refs.cp) refs.cp();
    }

     
    function byId(id) { return (data.measured || []).filter(function (x) { return x.id === id; })[0]; }
    function meta(item, opts) {
      opts = opts || {};
      var dl = h('dl', { class: 'm-factory-meta' });
      function r(k, v) { dl.appendChild(h('div', null, h('dt', null, P(k)), h('dd', null, v))); }
      if (!opts.noPeriod) { r(T.start, fdate(item.start)); r(T.end, fdate(item.end)); }
      r(T.source, rich(P(item.source)));
      r(T.limit, rich(P(item.limit)));
      return dl;
    }

    function measuredSection() {
      var sec = h('section', { class: 'm-factory-sec m-factory-measured panel', 'aria-labelledby': 'mf-meas-h' });
      sec.appendChild(h('div', { class: 'm-factory-head' },
        h('div', { class: 'm-factory-title' }, h('h3', { id: 'mf-meas-h' }, P(T.measH)), h('span', { class: 'note' }, P(T.asOf) + ' ', fdate(data.as_of))),
        h('p', null, P(data.note))));
      var grid = h('div', { class: 'm-factory-meas-grid' });

      var pr = byId('release_interval_pr455');
      if (pr) {
        var a = Date.parse(pr.start), b = Date.parse(pr.end);
        var box = h('div', { class: 'm-factory-release' },
          h('div', { class: 'm-factory-mtop' }, h('h4', null, P(T.releaseH)), chip(pr.state)),
          h('p', { class: 'm-factory-big mono' }, P(pr.display || [String(pr.value), String(pr.value)])),
          h('p', { class: 'm-factory-mlab' }, P(pr.label)));
        if (isFinite(a) && isFinite(b)) {
          var tl = h('div', { class: 'm-factory-tl', role: 'img', 'aria-label': ar()
              ? P(T.merge) + ' ' + api.num(pr.start.slice(11, 19)) + ' ← ' + P(T.verified) + ' ' + api.num(pr.end.slice(11, 23)) + '، بالتوقيت العالمي'
              : P(T.merge) + ' ' + pr.start.slice(11, 19) + ' UTC → ' + P(T.verified) + ' ' + pr.end.slice(11, 23) + ' UTC' },
            h('div', { class: 'm-factory-tl-bar' }, h('span', { class: 'm-factory-tl-fill' })),
            h('div', { class: 'm-factory-tl-ends' },
              h('div', null, h('b', null, P(T.merge)), utc(pr.start.slice(11, 19))),
              h('div', null, h('b', null, P(T.verified)), utc(pr.end.slice(11, 23)))));
          box.appendChild(tl);
        }
        box.appendChild(meta(pr));
        grid.appendChild(box);
      }

      var pace = h('div', { class: 'm-factory-pace' },
        h('div', { class: 'm-factory-mtop' }, h('h4', null, P(T.paceH))));
      var ul = h('ul', { class: 'm-factory-pacelist' });
      ['commits_total', 'active_days', 'commits_last_30_days', 'pr_merges'].forEach(function (id) {
        var it = byId(id); if (!it) return;
        ul.appendChild(h('li', null,
          h('div', { class: 'm-factory-pace-top' },
            h('p', { class: 'm-factory-pace-val' }, h('b', { class: 'mono' }, fmt(it.value, 0)), ' ', h('span', null, P(it.unit))),
            chip(it.state)),
          h('p', { class: 'm-factory-mlab' }, P(it.label)),
          meta(it)));
      });
      pace.appendChild(ul);
      grid.appendChild(pace);
      sec.appendChild(grid);
      (data.series || []).forEach(function (s) { if (s.id === 'monthly_commits') sec.appendChild(commitChart(s)); });
      return sec;
    }

    function commitChart(s) {
      var pts = s.points || [];
      var vmax = Math.max.apply(null, pts.map(function (p) { return p.value; }).concat([1]));
      var mag = Math.pow(10, Math.floor(Math.log10(vmax)));
      var top = Math.ceil(vmax / mag) * mag; if (top === vmax) top += mag;
      var ticks = 4, stepV = top / ticks;
      var fig = h('figure', { class: 'm-factory-chart', 'aria-labelledby': 'mf-chart-h' });
      fig.appendChild(h('div', { class: 'm-factory-mtop' }, h('h4', { id: 'mf-chart-h' }, P(s.label)), chip(s.state)));
      var plot = h('div', { class: 'm-factory-plot', 'aria-hidden': 'true' });
      for (var i = 0; i <= ticks; i++) {
        plot.appendChild(h('div', { class: 'm-factory-grid', style: 'bottom:' + (100 * i / ticks) + '%' }, h('span', { class: 'mono' }, fmt(stepV * i, 0))));
      }
      var cols = 'grid-template-columns:repeat(' + Math.max(1, pts.length) + ',minmax(0,1fr))';
      var bars = h('div', { class: 'm-factory-bars', style: cols });
      pts.forEach(function (p, i) {
        var pct = 100 * p.value / top;
        bars.appendChild(h('div', { class: 'm-factory-bcol' + (p.partial_to ? ' is-partial' : '') },
          h('span', { class: 'm-factory-bar', style: 'height:' + pct.toFixed(3) + '%;--d:' + (i * 70) + 'ms' }),
          h('span', { class: 'm-factory-val mono', style: 'bottom:calc(' + pct.toFixed(3) + '% + 4px)' }, fmt(p.value, 0))));
      });
      plot.appendChild(bars);
      fig.appendChild(plot);
      fig.appendChild(h('div', { class: 'm-factory-months', 'aria-hidden': 'true', style: cols }, pts.map(function (p) {
        return h('span', null, P(p.label), p.partial_to ? h('small', null, P(T.toDay) + api.num(String(Number(p.partial_to.slice(8, 10))))) : null);
      })));
      
      fig.appendChild(h('table', { class: 'sr' },
        h('caption', null, P(s.label)),
        h('thead', null, h('tr', null, h('th', { scope: 'col' }, P(T.month)), h('th', { scope: 'col' }, P(s.unit)))),
        h('tbody', null, pts.map(function (p) {
          return h('tr', null, h('th', { scope: 'row' }, P(p.label) + ' ' + api.num(p.month.slice(0, 4)) + (p.partial_to ? ' (' + P(T.toDay) + api.num(String(Number(p.partial_to.slice(8, 10)))) + ')' : '')), h('td', null, fmt(p.value, 0)));
        }))));
      fig.appendChild(h('figcaption', null, h('p', { class: 'note' }, P(T.scale)), meta(s)));
      return fig;
    }

     
    function render() {
      clear(host);
      refs = {};
      host.appendChild(pathSection());
      host.appendChild(calcSection());
      host.appendChild(measuredSection());
      select(state.stage, false);
      host.querySelector('.m-factory-railwrap').classList.remove('is-pulse');
      update();
      reveal();
    }
     
    function reveal() {
      var items = host.querySelectorAll('.m-factory-chart, .m-factory-tl, .m-factory-railwrap');
      if (reduced || !('IntersectionObserver' in window)) return;
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (en) { if (en.isIntersecting) { en.target.classList.add('is-in'); io.unobserve(en.target); } });
      }, { threshold: 0.35 });
      Array.prototype.forEach.call(items, function (n) { io.observe(n); });
    }
    render();
    if (api.onLang) api.onLang(function () {
      var hadFocus = host.contains(document.activeElement) && document.activeElement.id;
      render();
      if (hadFocus) { var f = document.getElementById(hadFocus); if (f) f.focus(); }
    });
  }

  (window.StudioModules = window.StudioModules || {}).factory = { mount: mount };
})();
