 
(function () {
  'use strict';
  var SVGNS = 'http://www.w3.org/2000/svg';
   
  var FILM_TITLES = {
    4: ['وكلاء الذكاء الاصطناعي · سديد', 'AI Agents / SADEED'],
    5: ['البيانات ومؤشرات الأداء', 'Data & KPI'],
    6: ['BILTIX · التكامل', 'BILTIX / Integration'],
    8: ['الجودة من GitHub إلى Vercel', 'GitHub / Vercel / Quality'],
  };
  var T = {
    problem: ['المشكلة', 'The problem'],
    built: ['ما الذي بنيناه', 'What we built'],
    proven: ['ما الذي ثبت', 'What is proven'],
    notProven: ['ما الذي لم يثبت', 'What is not proven'],
    honest: ['الحالة', 'State'],
    watch: ['شاهد فصل النتيجة · الفيلم ', 'Watch the result · film '],
    ledger: ['افتح سجل الأدلة', 'Open the evidence ledger'],
    unavailable: ['المشهد المرجعي غير متاح بعد.', 'The reference scene is not available yet.'],
    caseWord: ['دراسة الحالة', 'Case'],
    modules: ['وحدات العرض وحالة كل واحدة', 'The demo’s modules and the state of each'],
    formula: ['المعادلة', 'Formula'],
    cases: ['حالات القبول', 'Acceptance cases'],
    cols: [['الحالة', 'Case'], ['الفعلي', 'Actual'], ['المستهدف', 'Target'], ['الوزن', 'Weight'], ['النتيجة', 'Result']],
    pending: ['قيد المراجعة', 'Pending review'],
    privacy: ['لا تظهر هنا بيانات تشغيلية سرية: كل مشهد ببيانات اصطناعية، والأرقام أعداد إجمالية مع تاريخها ومصدرها.', 'No confidential operational data appears here: every scene uses synthetic data, and the figures are aggregate counts with their date and source.'],
  };

  function svg(path) {
    var s = document.createElementNS(SVGNS, 'svg');
    s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('aria-hidden', 'true'); s.setAttribute('class', 'm-cases-ic');
    var p = document.createElementNS(SVGNS, 'path'); p.setAttribute('d', path); s.appendChild(p);
    return s;
  }

  function mount(root, api) {
    var P = api.P, data = api.data || {};
    var lang = function () { return api.lang(); };
    function fmtN(n, dec) {
      var s = Number(n).toLocaleString('en-US', { minimumFractionDigits: dec || 0, maximumFractionDigits: dec || 0 });
      return lang() === 'ar' ? api.num(s).replace(/,/g, '٬') : s;
    }
    function measured(id) {
      var m = data.metrics && Array.isArray(data.metrics.measured) ? data.metrics.measured : [];
      for (var i = 0; i < m.length; i++) if (m[i].id === id) return m[i];
      return null;
    }
    function project(name) {
      var ps = data.profile && Array.isArray(data.profile.projects) ? data.profile.projects : [];
      for (var i = 0; i < ps.length; i++) if (ps[i].name === name) return ps[i];
      return null;
    }
    function pad(n) { return (n < 10 ? '0' : '') + n; }
    function filmTitle(n) {
      var s = data.sequence;
      try {
        var pools = [].concat((s && s.topics) || [], (s && s.films) || []);
        for (var i = 0; i < pools.length; i++) {
          var t = pools[i], id = t.film != null ? t.film : (t.n != null ? t.n : (t.topic != null ? t.topic : t.id));
          if ((Number(id) === n || t.num === pad(n)) && Array.isArray(t.title)) return t.title;
        }
      } catch (e) {   }
      return FILM_TITLES[n];
    }
    function chip(k, label) { return api.chip(k, label ? P(label) : undefined); }

    var commits = measured('commits_total'), days = measured('active_days'), rel = measured('release_interval_pr455');
    var kpiCases = measured('kpi_acceptance_cases');
    var sadeed = project('SADEED'), biltix = project('BILTIX Risk AI'), kpi = project('KPI calculator');

    var CASES = [
      {
        id: 'sadeed', n: 1, name: ['سديد', 'SADEED'],
        title: ['وكلاء يقترحون، ومسؤول يعتمد', 'Agents propose; an accountable person approves'],
        states: [['observed', ['تطبيق يعمل', 'Running application']], ['simulated', ['مشاهد ببيانات اصطناعية', 'Synthetic film scenes']]],
        honest: ['تطبيق يعمل ونسخته قابلة للفحص. مشاهد الفيلمين ٠٤ و٠٨ ببيانات اصطناعية في كل لقطة.', 'A running application whose build can be checked. Films 04 and 08 use synthetic data in every scene.'],
        problem: ['في التشغيل الصناعي قد يصل البلاغ في وقته ثم يتأخر القرار: الدليل موزع على أكثر من مكان، أو لا يُعرف من يملك الخطوة التالية.', 'In industrial operations a report can arrive on time while the decision still waits: the evidence sits in several places, or nobody knows who owns the next step.'],
        built: [sadeed ? sadeed.what : ['تطبيق عمليات وأمن صناعي بمساعد ذكاء اصطناعي.', 'An operations and industrial-security application with an AI assistant.'],
          ['كل توصية تتوقف عند بوابة اعتماد بشري، وأي دليل جديد يعيدها إلى المراجعة.', 'Every recommendation stops at a human approval gate, and new evidence sends it back to review.']],
        proven: [
          commits && days ? { st: commits.state, text: function () {
            return lang() === 'ar' ? fmtN(commits.value) + ' التزامًا في ' + fmtN(days.value) + ' يومًا نشطًا منذ مايو ٢٠٢٦.' : fmtN(commits.value) + ' commits across ' + fmtN(days.value) + ' active days since May 2026.';
          }, src: commits.source, limit: ['يقيس النشاط لا القيمة.', 'It measures activity, not value.'] } : null,
          { st: 'observed', text: ['التطبيق يخدم نسخة يمكن فحص هويتها، وله سجلات نشاط حديثة.', 'The application serves a build whose identity can be checked, and has recent activity logs.'], src: ['مراجعة الجرد · ٢٥ نوفمبر ٢٠٢٦', 'Inventory review · 25 November 2026'] },
          { st: 'observed', text: ['طبقة البيانات: ١٤٨ جدولًا عليها عزل على مستوى الصف، و٤٢٣ سياسة وصول، بقراءة إجمالية.', 'Data layer: 148 tables under row-level security and 423 access policies, from an aggregate read.'], src: ['مراجعة الجرد · ٢٥ نوفمبر ٢٠٢٦', 'Inventory review · 25 November 2026'], limit: ['عدد السياسات لا يثبت صحة العزل.', 'A policy count does not prove isolation.'] },
          rel ? { st: rel.state, text: function () {
            return lang() === 'ar' ? (rel.display ? rel.display[0] : '') + ' من الدمج إلى التحقق على النطاقين في التحديث #455.' : (rel.display ? rel.display[1] : '') + ' from merge to verification on both domains for update #455.';
          }, src: ['GitHub · طابعان زمنيان مسجّلان · ٢٢ نوفمبر ٢٠٢٦', 'GitHub · two recorded timestamps · 22 November 2026'], limit: ['زمن إصدار لتحديث واحد، لا زمن تطوير.', 'A release interval for one update, not development time.'] } : null,
        ],
        notProven: [
          { st: 'in_code', text: ['أدوات الدردشة معرَّفة في الكود، وجدول التفعيل كان معطلًا كله عند المراجعة.', 'The chat tools are defined in code, and the activation table was fully off at the review.'] },
          { st: 'simulated', text: ['الفيلم ٠٤ لا يعرض استدعاءً حيًّا لنموذج ولا إجراءً على حادثة فعلية.', 'Film 04 shows no live model call and no action on a real incident.'] },
          { st: 'proposed', text: ['اختبار العزل بحسابين اصطناعيين ما زال مقترحًا.', 'The isolation test with two synthetic accounts is still a proposal.'] },
          { st: 'not_measured', text: ['لا ندّعي عميلًا ولا جهة تشغيل ولا عدد مستخدمين.', 'We claim no client, no operating organisation and no user count.'] },
        ],
        films: [{ n: 4, what: ['مسار القرار مع الاعتماد البشري', 'The decision path with human approval'] }, { n: 8, what: ['مسار الإصدار والتحقق على النطاقين', 'The release and verification path'] }],
      },
      {
        id: 'biltix', n: 2, name: ['BILTIX لإدارة المخاطر بالذكاء الاصطناعي', 'BILTIX Risk AI'],
        title: ['ملاحظة ميدانية تصير خطرًا له مالك وموعد مراجعة', 'A field observation becomes a risk with an owner and a review date'],
        states: [['simulated', ['عرض تجريبي', 'Demo build']]],
        honest: ['عرض تجريبي، لا منتج إنتاجي. ما ثبت مكتوب بحالته، وما لم يثبت معروض بوصفه تصوّرًا.', 'A demo, not a production product. What is proven carries its state; what is not is shown as a concept.'],
        problem: ['في الموقع تُسجَّل ملاحظة ثم تضيع بين الميدان والسجل: بلا أولوية، ولا مالك، ولا موعد مراجعة.', 'On site, an observation is noted and then lost between the field and the register: no priority, no owner, no review date.'],
        built: [biltix ? biltix.what : ['عرض تجريبي يحوّل ملاحظة ميدانية إلى خطر.', 'A demo that turns a field observation into a risk.'],
          ['نقدّر الخطر بمصفوفة احتمال وأثر من خمس درجات لكلٍّ منهما، ونسند له مالكًا وموعد مراجعة.', 'We score the risk on a five-by-five likelihood and impact matrix, then assign an owner and a review date.']],
        extra: 'modules',
        proven: [
          { st: 'observed', text: ['نجحت اختبارات التطبيق في تلك النسخة ١٩٨ من ١٩٨ عند إعادة تشغيلها في ٢٤ نوفمبر ٢٠٢٦.', 'That build’s app tests passed 198 of 198 when re-run on 24 November 2026.'], src: ['تقرير جاهزية القبول · ٢٤ نوفمبر ٢٠٢٦', 'Acceptance-readiness report · 24 November 2026'], limit: ['لم نُعِد تشغيلها لهذه النسخة من الصفحة.', 'We did not re-run them for this edition of the page.'] },
          { st: 'in_code', text: ['سجل المخاطر والحساب ومهام المعالجة تعمل محليًّا في العرض.', 'The risk register, the scoring and the treatment tasks work locally in the demo.'], src: ['تقرير جاهزية القبول · ٢٤ نوفمبر ٢٠٢٦', 'Acceptance-readiness report · 24 November 2026'] },
        ],
        notProven: [
          { st: 'simulated', text: ['مسح رمز الاستجابة السريعة بالكاميرا، وعارض المخططات الهندسية ونماذج معلومات البناء، والعارض بزاوية ٣٦٠° تمثيلية.', 'QR camera scanning, the CAD/BIM viewer and the 360° viewer are illustrative.'] },
          { st: 'not_measured', text: ['المزامنة تجري داخل المتصفح نفسه، والعمل متعدد المستخدمين غير مثبت.', 'Sync runs inside the same browser only, and multi-user work is not proven.'] },
          { st: 'proposed', text: ['اختبار القبول مؤجل: القرار المقترح في التقرير نفسه إبقاء الإصدار عرضًا تجريبيًّا.', 'Acceptance testing is deferred: the report’s own proposed decision keeps the release a demo.'] },
        ],
        films: [{ n: 6, what: ['من الملاحظة إلى الخطر، وحالة كل وحدة', 'From observation to risk, with the state of each module'] }],
      },
      {
        id: 'kpi', n: 3, name: ['حاسبة المؤشر', 'KPI calculator'],
        title: ['رقم يمكن إعادة حسابه', 'A number you can recompute'],
        states: [['verified', ['حساب مثبت', 'Verified calculation']], ['simulated', ['عيّنة اصطناعية', 'Synthetic sample']]],
        honest: ['الدالة واختبارها مثبتان ويمكن تكرارهما. العيّنة اصطناعية ولا تمثّل بيانات موظفين.', 'The function and its test are verified and repeatable. The sample is synthetic and represents no employee data.'],
        problem: ['مؤشر على لوحة لا يستطيع أحد إعادة حسابه، ومستهدف مفقود يتحول بصمت إلى صفر.', 'A KPI on a dashboard that nobody can recompute, and a missing target that silently becomes zero.'],
        built: [['دالة مؤشر موزون مع اختبار قبول. المعادلة والمدخلات والمصدر ظاهرة، والمستهدف المفقود أو الصفري يعلّق النتيجة للمراجعة.', 'A weighted KPI function with an acceptance test. The formula, the inputs and the source are visible, and a missing or zero target sends the result to review.']],
        extra: 'kpi',
        proven: [
          { st: kpiCases ? kpiCases.state : 'verified', text: ['نجحت حالات القبول الأربع عند إعادة تشغيلها في ٢٥ نوفمبر ٢٠٢٦: ٨٨٪ بوزن ٦٠/٤٠، و٨٦٪ بوزن ٧٠/٣٠، والمستهدف المفقود أو الصفري يذهب إلى المراجعة.', 'All four acceptance cases passed when re-run on 25 November 2026: 88% at 60/40, 86% at 70/30, and a missing or zero target goes to review.'], src: ['اختبار القبول في الحزمة · سجل التنفيذ', 'The acceptance test in the package · execution log'] },
          { st: 'verified', text: ['قبل التعديل فشل الاختبار: أعادت الدالة صفرًا، والمتوقع قيمة فارغة تعني «قيد المراجعة».', 'Before the change the test failed: the function returned 0 where null was expected.'], src: ['نتيجة الاختبار قبل التعديل وبعده', 'Test result before and after the change'] },
        ],
        notProven: [
          { st: 'simulated', text: ['العيّنة اصطناعية: لا بيانات موظفين ولا لوحة في الإنتاج.', 'The sample is synthetic: no employee data and no production dashboard.'] },
          { st: 'not_measured', text: ['تجربة محلية داخل هذه الحزمة، وليست سجل تعديل في مستودع إنتاجي.', 'A local test inside this package, not the record of a change in a production repository.'] },
        ],
        films: [{ n: 5, what: ['الحساب أمامك، ومستهدف مفقود لا يصير صفرًا', 'The calculation in view, and a missing target that never reads zero'] }],
      },
    ];

    var host = api.el('div', { class: 'm-cases' });
    root.appendChild(host);
     
    var kpiSlot = document.getElementById('m-cases-kpi') || api.el('div', { id: 'm-cases-kpi' });

    function textOf(t) { return typeof t === 'function' ? t() : P(t); }
    function claimList(list, cls) {
      var ul = api.el('ul', { class: 'm-cases-claims ' + cls });
      list.forEach(function (c) {
        if (!c) return;
        ul.append(api.el('li', null,
          api.el('span', { class: 'm-cases-chip' }, chip(c.st)),
          api.el('span', { class: 'm-cases-ctext' }, textOf(c.text),
            c.limit ? api.el('span', { class: 'm-cases-limit' }, ' ' + P(c.limit)) : null,
            c.src ? api.el('span', { class: 'm-cases-src' }, P(c.src)) : null)));
      });
      return ul;
    }
    function modulesTable() {
      var mods = [
        { st: 'in_code', label: ['سجل المخاطر', 'Risk register'], line: ['يعمل محليًّا في العرض', 'Works locally in the demo'] },
        { st: 'observed', label: ['اختبارات التطبيق', 'App tests'], line: ['١٩٨ من ١٩٨، أُعيد تشغيلها في ٢٤ نوفمبر ٢٠٢٦', '198 of 198, re-run on 24 November 2026'] },
        { st: 'in_code', label: ['ملصقات رموز الاستجابة السريعة', 'QR labels'], line: ['توليد الملصقات وإدخال يدوي', 'Label generation, manual entry'] },
        { st: 'in_code', label: ['تسجيل دون اتصال', 'Offline capture'], line: ['تخزين محلي وصندوق إرسال', 'Local cache and outbox'] },
        { st: 'simulated', label: ['مسح بالكاميرا', 'Camera scanning'], line: ['لم يُثبت على هاتف فعلي', 'Not proven on a real phone'] },
        { st: 'simulated', label: ['عارض المخططات الهندسية ونماذج معلومات البناء', 'CAD/BIM viewer'], line: ['رسم توضيحي، لا ملف هندسي', 'Illustrative drawing, no engineering file'] },
        { st: 'simulated', label: ['عارض 360°', '360° viewer'], line: ['نقطة واحدة بصورة مولّدة', 'One point, generated image'] },
        { st: 'not_measured', label: ['مزامنة ومستخدمون متعددون', 'Sync and multi-user'], line: ['داخل المتصفح نفسه فقط', 'Same browser only'] },
      ];
      var ul = api.el('ul', { class: 'm-cases-mods' });
      mods.forEach(function (m) {
        ul.append(api.el('li', null, api.el('b', null, P(m.label)), chip(m.st), api.el('span', null, P(m.line))));
      });
      return api.el('div', { class: 'm-cases-extra' }, api.el('h5', { class: 'm-cases-k' }, P(T.modules)), ul);
    }
    function kpiExtra() {
      var rows = [['A', '16', '20', '60/40', '88%'], ['B', '16', '20', '70/30', '86%'], ['C', '16', '—', '60/40', null], ['D', '16', '0', '60/40', null]];
      var thead = api.el('tr', null, T.cols.map(function (c) { return api.el('th', { scope: 'col' }, P(c)); }));
      var tbody = api.el('tbody', null, rows.map(function (r) {
        return api.el('tr', null,
          api.el('th', { scope: 'row', class: lang() === 'ar' ? null : 'mono' }, lang() === 'ar' ? { A: 'أ', B: 'ب', C: 'ج', D: 'د' }[r[0]] : r[0]),
          api.el('td', { class: 'mono' }, api.num(r[1])),
          api.el('td', { class: 'mono' }, api.num(r[2])),
          api.el('td', { class: 'mono' }, api.num(r[3])),
          api.el('td', { class: r[4] ? 'mono m-cases-ok' : 'm-cases-pend' }, r[4] ? api.num(r[4]).replace('%', lang() === 'ar' ? '٪' : '%') : P(T.pending)));
      }));
      return api.el('div', { class: 'm-cases-extra' },
        api.el('h5', { class: 'm-cases-k' }, P(T.formula)),
        api.el('p', { class: 'm-cases-formula' }, lang() === 'ar'
          ? 'الدرجة = تقريب(١٠٠ × (المنجز ÷ المستهدف × الوزن + الحضور × (١ − الوزن)))'
          : api.el('bdi', { dir: 'ltr', class: 'mono' }, 'score = round(100 × (actual / target × w + attendance × (1 − w)))')),
        api.el('h5', { class: 'm-cases-k' }, P(T.cases)),
        api.el('table', { class: 'm-cases-table' }, api.el('thead', null, thead), tbody));
    }
    function filmButton(c, f) {
      var status = api.el('span', { class: 'm-cases-status', role: 'status', 'aria-live': 'polite' });
      var btn = api.el('button', {
        type: 'button', class: 'btn m-cases-film', id: 'case-' + c.id + '-film-' + pad(f.n), 'data-film': f.n,
        onclick: function () {
          status.textContent = '';
          var opts = { film: f.n, lang: api.lang(), chapter: 'result', from: 'case-' + c.id };
          var done = function (ok) { if (ok === false) status.textContent = P(T.unavailable); };
          try {
            var r = api.playFilm(opts);
            if (r && typeof r.then === 'function') r.then(done, function () { status.textContent = P(T.unavailable); });
          } catch (e) { status.textContent = P(T.unavailable); }
        },
      }, svg('M8 5v14l11-7z'), api.el('span', { class: 'm-cases-film-t' },
        api.el('b', null, P(T.watch) + (lang() === 'ar' ? api.num(pad(f.n)) : pad(f.n))),
        api.el('small', null, P(filmTitle(f.n)) + ' — ' + P(f.what))));
      return api.el('div', { class: 'm-cases-filmwrap' }, btn, status);
    }
    function caseNode(c) {
      var hid = 'case-' + c.id + '-h';
      var art = api.el('article', { class: 'm-cases-case', id: 'case-' + c.id, tabindex: '-1', 'aria-labelledby': hid });
      var num = api.el('div', { class: 'm-cases-num', 'aria-hidden': 'true' }, lang() === 'ar' ? api.num(String(c.n)) : pad(c.n));
      var head = api.el('header', { class: 'm-cases-head' },
        api.el('p', { class: 'm-cases-kicker' }, P(T.caseWord) + ' ' + (lang() === 'ar' ? api.num(String(c.n)) + ': ' : pad(c.n) + ' · '), api.el('bdi', { dir: 'auto' }, P(c.name))),
        api.el('h3', { id: hid, class: 'm-cases-title' }, P(c.title)),
        api.el('div', { class: 'm-cases-state' },
          api.el('span', { class: 'sr' }, P(T.honest) + ': '),
          c.states.map(function (s) { return chip(s[0], s[1]); }),
          api.el('span', { class: 'm-cases-honest' }, P(c.honest))));
      var left = api.el('div', { class: 'm-cases-story' },
        api.el('section', { class: 'm-cases-part' }, api.el('h4', { class: 'm-cases-k' }, P(T.problem)), api.el('p', null, P(c.problem))),
        api.el('section', { class: 'm-cases-part' }, api.el('h4', { class: 'm-cases-k' }, P(T.built)), c.built.map(function (b) { return api.el('p', null, P(b)); }),
          c.extra === 'modules' ? modulesTable() : null,
          c.extra === 'kpi' ? kpiExtra() : null));
      var right = api.el('div', { class: 'm-cases-proof' },
        api.el('section', { class: 'm-cases-part' }, api.el('h4', { class: 'm-cases-k m-cases-ev' }, P(T.proven)), claimList(c.proven, 'is-proven')),
        api.el('section', { class: 'm-cases-part' }, api.el('h4', { class: 'm-cases-k' }, P(T.notProven)), claimList(c.notProven, 'is-open')));
      var act = api.el('div', { class: 'm-cases-act' },
        c.films.map(function (f) { return filmButton(c, f); }),
        api.el('button', { type: 'button', class: 'link-btn m-cases-ledger', onclick: function () { api.go('evidence'); } }, P(T.ledger)));
      var body = api.el('div', { class: 'm-cases-body' }, head, api.el('div', { class: 'm-cases-cols' }, left, right), act);
      if (c.id === 'kpi') body.append(kpiSlot);
      art.append(num, body);
      return art;
    }
    function render() {
      var active = document.activeElement, activeId = active && host.contains(active) ? active.id : null;
      if (kpiSlot.parentNode) kpiSlot.parentNode.removeChild(kpiSlot);
      host.textContent = '';
      CASES.forEach(function (c) { host.append(caseNode(c)); });
      host.append(api.el('p', { class: 'note m-cases-privacy' }, P(T.privacy)));
      if (activeId) { var n = document.getElementById(activeId); if (n) n.focus(); }
    }
    render();
    if (api.onLang) api.onLang(render);
  }

  (window.StudioModules = window.StudioModules || {}).cases = { mount: mount };
})();
