 
(function () {
  'use strict';
  var GATES = [
    ['G01', ['كل ادعاء رئيسي مرتبط بمصدر صالح أو موسوم بمحاكاة أو «غير مقاس».', 'Every main claim links to a valid source or is labelled simulated or not measured.']],
    ['G02', ['لا بيانات خاصة ولا أسرار ولا صوت خام داخل النسخة العامة.', 'No private data, secrets or raw voice inside the public edition.']],
    ['G03', ['حقوق الأصول والصوت والموسيقى اللازمة للاستخدام المقصود موثقة.', 'Rights for the assets, voice and music needed for the intended use are documented.']],
    ['G04', ['لا شراء ولا اشتراك ولا رصيد جديد دون موافقة محددة على التكلفة.', 'No purchase, subscription or new credit without a specific cost approval.']],
    ['G05', ['لكل فيلم نهائي خطوة ذكاء اصطناعي منفذة وموثقة، ومراجعة واضحة.', 'Every final film has a documented AI step that was actually run, and a clear review.']],
    ['G06', ['الموقع والتصيير قابلان للبناء، ولا خطأ يمنع رحلة المستخدم الأساسية.', 'The site and the renderer build, and no error blocks the main user journey.']],
    ['G07', ['لا صوتان في وقت واحد، ولا صوت تلقائي يتجاوز سياسة المتصفح.', 'No two sounds at once, and no automatic sound beyond browser policy.']],
    ['G08', ['اللغتان والفصول والأدلة متصلة فعلًا: الترتيب العربي ثم الإنجليزي كامل، وكل فرضية تعود إلى مشهدها مع عودة صحيحة إلى موضع القراءة.', 'Languages, chapters and evidence are truly connected: the full Arabic-then-English order, and every hypothesis reaches its scene with a valid return to the reading position.']],
    ['G09', ['المقاييس الحساسة والحسابات وحالات المدخل المفقود صحيحة.', 'Sensitive metrics, calculations and missing-input cases are correct.']],
    ['G10', ['وسائط التسليم كاملة وسليمة، ومدتها وعدد إطاراتها موثقان.', 'Delivered media are complete and undamaged, with duration and frame count recorded.']],
    ['G11', ['المشاهد الاصطناعية وإعادة التمثيل ونسخ العرض التجريبي موسومة بوضوح.', 'Synthetic scenes, reenactments and demo builds are clearly labelled.']],
    ['G12', ['خفض الحركة محترم، والحركة التلقائية يمكن إيقافها، ولوحة المفاتيح تعمل.', 'Reduced motion is respected, automatic motion can be stopped, and the keyboard works.']],
    ['G13', ['لا تعديل لمشروعات أو إنتاج قائم خارج نطاق نسخة السيرة المستقلة.', 'No change to other projects or live production outside this standalone portfolio edition.']],
    ['G14', ['عند النشر: رابط النشر الفعلي وبصمة النسخة ورحلة المستخدم متحقق منها.', 'On release: the actual deployment link, the build fingerprint and the user journey are verified.']],
    ['G15', ['تقرير النتيجة يطابق الأدلة: لا يُعلن اكتمال المواصفة إلا عند نجاح معاييرها المئة والبوابات من الأولى إلى الرابعة عشرة، مع ما يثبت ذلك.', 'The result report matches the evidence: completion is declared only when all 100 criteria and gates G01 to G14 pass, with the proof attached.']],
  ];
  var RUBRIC = [
    ['content', ['المحتوى والدليل', 'Content and evidence'], 25],
    ['visual', ['الإخراج البصري', 'Visual direction'], 25],
    ['audio', ['الصوت', 'Sound'], 20],
    ['ux', ['تجربة المستخدم', 'User experience'], 15],
    ['reliability', ['الاعتمادية والأداء والخصوصية', 'Reliability, performance and privacy'], 15],
  ];
   
  var FILM_TARGETS = [
    [['الأبعاد', 'Frame size'], ['١٩٢٠ × ١٠٨٠', '1920 × 1080']],
    [['معدل الإطارات', 'Frame rate'], ['٣٠ إطارًا في الثانية بمعدل ثابت', '30 fps CFR']],
    [['عدد الإطارات', 'Frames'], ['٩٠٠', '900']],
    [['المدة', 'Duration'], ['٣٠٫٠٠٠ ث', '30.000 s']],
    [['الترميز', 'Codecs'], ['الصورة `H.264` بنظام الألوان `yuv420p`، والصوت `AAC`', 'H.264 yuv420p + AAC']],
    [['الحاوية', 'Container'], ['حاوية `MP4` مهيأة للبدء السريع', 'MP4 faststart']],
    [['المرافقات', 'Companions'], ['ملصق لكل فيلم، دون ترجمة نصية', 'A poster per film, no captions']],
  ];
  var LOUD_TARGETS = [
    [['الشدة المتكاملة', 'Integrated loudness'], ['نحو −١٦ وحدة جهارة نسبةً إلى النطاق الكامل', '≈ −16 LUFS']],
    [['أعلى قمة حقيقية', 'True peak'], ['لا تتجاوز −١ ديسيبل للقمة الحقيقية', '≤ −1 dBTP']],
  ];
  var PERF_TARGETS = [
    [['أكبر رسم للمحتوى', 'Largest Contentful Paint'], ['لا يتجاوز ٢٫٥ ث', 'LCP ≤ 2.5 s']],
    [['إزاحة التخطيط التراكمية', 'Cumulative Layout Shift'], ['لا تتجاوز ٠٫١', 'CLS ≤ 0.1']],
  ];
  var SITE_TESTS = [
    ['load', ['التحميل الأولي', 'Initial load']], ['autoplay', ['التشغيل التلقائي الصامت', 'Muted autoplay']],
    ['advance', ['الانتقال إلى الفيلم التالي', 'Advance to the next film']], ['pause', ['احترام الإيقاف اليدوي', 'Manual pause respected']],
    ['one-sound', ['صوت واحد في الصفحة', 'One sound on the page']], ['lang', ['تبديل اللغة', 'Language switch']],
    ['nav', ['التنقل والروابط', 'Navigation and links']],
    ['evidence', ['فتح الأدلة', 'Opening the evidence']], ['search', ['البحث والتصفية', 'Search and filters']],
    ['kpi', ['حاسبة المؤشر', 'KPI calculator']], ['mobile', ['عرض الهاتف دون تمدد أفقي', 'Phone width without horizontal overflow']],
    ['errors', ['حالات الخطأ', 'Error states']], ['reduced', ['خفض الحركة', 'Reduced motion']],
    ['keyboard', ['لوحة المفاتيح', 'Keyboard']], ['contrast', ['التباين', 'Contrast']],
  ];
  var KNOWN_OPEN = [
    { status: 'open', text: ['لا محرك WebKit في بيئة البناء، فلا ندّعي اختبار WebKit ولا تشغيلًا على هاتف آيفون فعلي.', 'No WebKit engine in the build environment, so we claim no WebKit test and no playback on a physical iPhone.'] },
    { status: 'open', text: ['لم تُجرَ بعد مشاهدة بشرية مستقلة للأفلام ولا مراجعة بشرية للنطق.', 'No independent human viewing of the films and no human pronunciation review yet.'] },
    { status: 'open', text: ['خطة مزود السرد ومستوى ترخيصه التجاري غير مؤكدين من الحساب نفسه.', 'The narration provider’s plan and commercial-licence tier are not confirmed by the account itself.'] },
    { status: 'open', text: ['استنساخ صوت المالك لم يكن ممكنًا؛ السرد بصوت راوٍ واحد من المكتبة ولا يُقدَّم بوصفه صوت فيصل.', 'Cloning the owner’s voice was not possible; the narration uses one library narrator and is never presented as Faisal’s voice.'] },
  ];
  var ST = {
    PASS: ['اجتاز', 'Pass'], FAIL: ['لم يجتز', 'Fail'], BLOCKED: ['متوقف بمانع', 'Blocked'], NOT_RUN: ['لم يُنفَّذ', 'Not run'],
  };
  var T = {
    atRelease: ['يُقاس عند الإصدار', 'Measured at release'],
    pendingAll: ['لم يُكتب تقرير الفحص بعد. كل نتيجة هنا تُقرأ «يُقاس عند الإصدار» حتى يملأها فحص الإصدار، والقيم الظاهرة أهداف لا نتائج.', 'The release check has not been written yet. Every result here reads “Measured at release” until the release run fills it, and the values shown are targets, not results.'],
    measuredOn: ['قيس في ', 'Measured on '],
    env: ['البيئة: ', 'Environment: '],
    gatesH: ['بوابات الإصدار', 'Release gates'],
    gatesP: ['خمس عشرة بوابة مستقلة. لا يعوّض مجموع النقاط بوابة لم تنجح.', 'Fifteen independent gates. No total score makes up for a gate that did not pass.'],
    gatesNone: ['لم تُفحص البوابات بعد، فحالة كل بوابة «لم يُنفَّذ».', 'The gates have not been checked yet, so every gate reads “Not run”.'],
    filmsH: ['فحص ملفات الأفلام', 'Film file checks'],
    filmsP: ['عشرون ملفًّا: عشرة بالعربية وعشرة بالإنجليزية، كل واحد يُفحص آليًّا بعد التصيير بأداة الفحص في FFmpeg.', 'Twenty files, ten Arabic and ten English, each probed with ffprobe after rendering.'],
    target: ['الهدف', 'Target'],
    targetsNote: ['أهداف المواصفة، وليست نتائج.', 'Specification targets, not results.'],
    loudH: ['الصوت والشدة', 'Loudness'],
    perfH: ['أداء الصفحة في بيئة مختبرية', 'Page performance in a lab environment'],
    perfNote: ['قياس مختبري في بيئة مسمّاة، وليس قياسًا ميدانيًّا من زوار حقيقيين.', 'A lab measurement in a named environment, not field data from real visitors.'],
    testsH: ['اختبارات الموقع', 'Site tests'],
    rubricH: ['معيار التقييم', 'Scoring rubric'],
    rubricP: ['الأوزان من التوجيه. لا نطبع درجة ذاتية: ١٠/١٠ هدف قبول، والعمود الأخير يعدّ المعايير التي نجحت بدليل فقط.', 'Weights from the directive. We print no self-awarded score: 10/10 is an acceptance target, and the last column counts only criteria that passed with evidence.'],
    notScored: ['لم يُقيَّم بعد', 'Not scored yet'],
    passedOf: ['نجح بدليل: ', 'Passed with evidence: '],
    defectsH: ['العيوب المتبقية', 'Remaining defects'],
    knownOpen: ['بنود مفتوحة معروفة من سجل العوائق في ٢٥ نوفمبر ٢٠٢٦. تقرير الإصدار يحل محل هذه القائمة.', 'Known open items from the blockers log, 25 November 2026. The release report replaces this list.'],
    noDefects: ['لم يسجّل تقرير الإصدار عيبًا متبقيًا.', 'The release report lists no remaining defect.'],
    cols: { key: ['الملف', 'File'], video: ['الصورة', 'Video'], frames: ['الإطارات', 'Frames'], dur: ['المدة صورة / صوت', 'Duration video / audio'], codec: ['الترميز', 'Codecs'], fast: ['بدء سريع', 'Faststart'], lufs: ['الجهارة', 'LUFS'], tp: ['القمة الحقيقية', 'dBTP'], st: ['النتيجة', 'Result'] },
    yes: ['نعم', 'Yes'], no: ['لا', 'No'],
    sev: { blocking: ['حاجب', 'Blocking'], major: ['مؤثر', 'Major'], minor: ['طفيف', 'Minor'] },
    open: ['مفتوح', 'Open'], fixed: ['أُصلح', 'Fixed'], accepted: ['مقبول بقرار', 'Accepted by decision'],
    weight: ['الوزن', 'Weight'],
  };
  var MONTHS = {
    ar: ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'],
    en: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
  };

  function normStatus(s) {
    var k = String(s == null ? 'NOT_RUN' : s).toUpperCase().replace(/[\s-]+/g, '_');
    if (k === 'PASSED' || k === 'OK') k = 'PASS';
    if (k === 'FAILED') k = 'FAIL';
    if (k === 'NOTRUN' || k === 'PENDING' || k === 'SKIPPED') k = 'NOT_RUN';
    return ST[k] ? k : 'NOT_RUN';
  }
  function pick(o, keys) { for (var i = 0; i < keys.length; i++) if (o && o[keys[i]] != null) return o[keys[i]]; return null; }
  function arr(v) { return Array.isArray(v) ? v : null; }

  function mount(root, api) {
    var P = api.P, el = api.el;
    var lang = function () { return api.lang(); };
    var host = el('div', { class: 'm-quality' });
    root.appendChild(host);
    function sep() { return lang() === 'ar' ? '، ' : ' · '; }
    function txt(v) { return v == null ? '' : (Array.isArray(v) ? P(v) : String(v)); }
    function n(v) { return lang() === 'ar' ? api.num(String(v)) : String(v); }
    function fmtDate(iso) {
      var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || '');
      if (!m) return txt(iso);
      return lang() === 'ar' ? api.num(Number(m[3]) + ' ' + MONTHS.ar[Number(m[2]) - 1] + ' ' + m[1]) : Number(m[3]) + ' ' + MONTHS.en[Number(m[2]) - 1] + ' ' + m[1];
    }
    function badge(status) {
      var k = normStatus(status);
      return el('span', { class: 'm-quality-s m-quality-s-' + k.toLowerCase().replace('_', '') },
        el('i', { 'aria-hidden': 'true' }),
        lang() === 'ar' ? el('span', { class: 'm-quality-sl' }, P(ST[k])) : el('bdi', { dir: 'ltr', class: 'mono m-quality-sc' }, k.replace('_', ' ')));
    }
    function pendingTag() { return el('span', { class: 'm-quality-pend' }, el('i', { 'aria-hidden': 'true' }), P(T.atRelease)); }
    function ltr(v) { return el('bdi', { dir: 'ltr', class: 'mono' }, v); }
     
    function rich(text) {
      var out = [];
      String(text == null ? '' : text).split(/`([^`]+)`/).forEach(function (part, i) { if (part) out.push(i % 2 ? el('code', { dir: 'ltr', translate: 'no' }, part) : part); });
      return out;
    }
    function gateLabel(id) { return lang() === 'ar' ? api.num(String(id).replace(/^G/i, '')) : id; }
    function section(id, title, lead, kids, wide) {
      return el('section', { class: 'm-quality-sec' + (wide ? ' is-wide' : ''), 'aria-labelledby': 'm-quality-' + id },
        el('div', { class: 'm-quality-sech' }, el('h3', { id: 'm-quality-' + id, class: 'm-quality-h' }, P(title)), lead ? el('p', { class: 'm-quality-lead' }, P(lead)) : null),
        kids);
    }
    function targetList(rows) {
      return el('dl', { class: 'm-quality-targets' }, rows.map(function (r) {
        return el('div', null, el('dt', null, P(r[0])), el('dd', null, Array.isArray(r[1]) ? (lang() === 'ar' ? rich(P(r[1])) : ltr(P(r[1]))) : ltr(r[1])));
      }));
    }
    function pendingBlock(rows, extraNote) {
      return el('div', { class: 'm-quality-pblock' },
        el('div', { class: 'm-quality-prow' }, pendingTag(), el('span', { class: 'note' }, P(T.targetsNote))),
        rows ? targetList(rows) : null,
        extraNote ? el('p', { class: 'note' }, P(extraNote)) : null);
    }

    function render() {
      var q = (api.data && api.data.quality) || null;
      var wasOpen = !!host.querySelector('.m-quality-all[open]');
      var active = document.activeElement, activeId = active && host.contains(active) ? active.id : null;
      host.textContent = '';

       
      var gatesData = q ? arr(pick(q, ['gates', 'release_gates'])) : null;
      var gmap = {};
      (gatesData || []).forEach(function (g) { if (g && g.id) gmap[String(g.id).toUpperCase()] = g; });
      var tally = { PASS: 0, FAIL: 0, BLOCKED: 0, NOT_RUN: 0 };
      GATES.forEach(function (g) { tally[normStatus(gmap[g[0]] ? gmap[g[0]].status : 'NOT_RUN')]++; });
      var env = q ? pick(q, ['environment', 'env']) : null;
      var head = el('div', { class: 'm-quality-head' },
        el('p', { class: 'm-quality-asof' }, q && q.as_of
          ? [P(T.measuredOn), el('time', { datetime: q.as_of }, fmtDate(q.as_of)), env ? sep() + P(T.env) + txt(env) : '']
          : [pendingTag(), ' ', P(T.pendingAll)]),
        el('ul', { class: 'm-quality-tally', 'aria-label': P(T.gatesH) }, ['PASS', 'FAIL', 'BLOCKED', 'NOT_RUN'].map(function (k) {
          return el('li', { class: 'm-quality-t-' + k.toLowerCase().replace('_', '') }, el('b', { class: 'mono' }, n(tally[k])), badge(k));
        })));
      host.append(head);

       
      var gl = el('ol', { class: 'm-quality-gates' }, GATES.map(function (g) {
        var d = gmap[g[0]] || {};
        var ev = arr(d.evidence);
        return el('li', null,
          el('span', { class: 'mono m-quality-gid' }, el('span', { class: 'sr' }, lang() === 'ar' ? 'البوابة ' : 'Gate '), gateLabel(g[0])),
          el('span', { class: 'm-quality-greq' }, P(g[1]),
            d.note ? el('span', { class: 'm-quality-gnote' }, txt(d.note)) : null,
            ev && ev.length ? el('span', { class: 'm-quality-gev' }, ev.map(function (e) { return el('bdi', { dir: 'auto' }, txt(e)); })) : null),
          badge(d.status || 'NOT_RUN'));
      }));
      host.append(section('gates', T.gatesH, gatesData ? T.gatesP : T.gatesNone, gl, true));

       
      var films = q ? arr(pick(q, ['films', 'film_checks'])) : null;
      var loud = q ? arr(q.loudness) : null;
      var lmap = {};
      (loud || []).forEach(function (l) { if (l && l.key) lmap[l.key] = l; });
      if (films && films.length) {
        var C = T.cols;
        var headRow = el('div', { class: 'm-quality-fr m-quality-fhead', 'aria-hidden': 'true' },
          [C.key, C.video, C.frames, C.dur, C.codec, C.fast, C.lufs, C.tp, C.st].map(function (c) { return el('span', null, P(c)); }));
        var rows = films.map(function (f) {
          var l = lmap[f.key] || {};
          var w = pick(f, ['width']), h = pick(f, ['height']), res = pick(f, ['resolution']) || (w && h ? w + '×' + h : '—');
          var fps = pick(f, ['fps', 'frame_rate', 'r_frame_rate']);
          var dv = pick(f, ['duration_v', 'duration_video', 'duration']), da = pick(f, ['duration_a', 'duration_audio']);
          var vc = pick(f, ['vcodec', 'video_codec']), pf = pick(f, ['pix_fmt']), ac = pick(f, ['acodec', 'audio_codec']);
          var fs = pick(f, ['faststart']);
          var lu = pick(f, ['lufs', 'integrated_lufs']) != null ? pick(f, ['lufs', 'integrated_lufs']) : pick(l, ['lufs', 'integrated_lufs']);
          var tp = pick(f, ['true_peak', 'tp']) != null ? pick(f, ['true_peak', 'tp']) : pick(l, ['true_peak', 'tp']);
          function cell(label, v) { return el('span', null, el('em', { class: 'm-quality-fl' }, P(label)), v); }
          function yn(v) { return v == null ? '—' : (v === true || v === 'yes' || (typeof v === 'number' && v > 0) ? P(T.yes) : (v === false || v === 'no' || v === 0 ? P(T.no) : txt(v))); }
          return el('li', { class: 'm-quality-fr' },
            el('code', { class: 'm-quality-fkey', dir: 'ltr', translate: 'no' }, f.key || '—'),
            cell(C.video, lang() === 'ar' ? n(res) + (fps ? ' · ' + n(fps) + ' إطارًا/ث' : '') : ltr(res + (fps ? ' · ' + fps + ' fps' : ''))),
            cell(C.frames, lang() === 'ar' ? n(pick(f, ['frames', 'nb_frames']) != null ? String(pick(f, ['frames', 'nb_frames'])) : '—') : ltr(pick(f, ['frames', 'nb_frames']) != null ? String(pick(f, ['frames', 'nb_frames'])) : '—')),
            cell(C.dur, lang() === 'ar' ? n((dv != null ? dv : '—') + ' / ' + (da != null ? da : '—')) + ' ث' : ltr((dv != null ? dv : '—') + ' / ' + (da != null ? da : '—') + ' s')),
            cell(C.codec, el('code', { dir: 'ltr', translate: 'no' }, [vc, pf, ac].filter(Boolean).join(' · ') || '—')),
            cell(C.fast, yn(fs)),
            cell(C.lufs, ltr(lu != null ? String(lu) : '—')), cell(C.tp, ltr(tp != null ? String(tp) : '—')),
            el('span', { class: 'm-quality-fst' }, badge(f.status)));
        });
        var ft = { PASS: 0, FAIL: 0, BLOCKED: 0, NOT_RUN: 0 }, notPass = [];
        films.forEach(function (f, i) { var k = normStatus(f.status); ft[k]++; if (k !== 'PASS') notPass.push(i); });
        var sumLine = el('ul', { class: 'm-quality-fsum' }, ['PASS', 'FAIL', 'BLOCKED', 'NOT_RUN'].filter(function (k) { return ft[k]; }).map(function (k) {
          return el('li', null, el('b', { class: 'mono' }, n(ft[k])), badge(k));
        }));
        var attention = notPass.length ? el('div', { class: 'm-quality-ftable' }, headRow.cloneNode(true), el('ul', { class: 'm-quality-frows' }, notPass.map(function (i) { return rows[i].cloneNode(true); }))) : null;
        var all = el('details', { class: 'm-quality-all' },
          el('summary', { id: 'm-quality-all-s' }, P(['كل الملفات', 'All files']) + ' (' + n(films.length) + ')'),
          el('div', { class: 'm-quality-ftable' }, headRow, el('ul', { class: 'm-quality-frows' }, rows)));
        host.append(section('films', T.filmsH, T.filmsP, [sumLine, attention, all], true));
      } else {
        host.append(section('films', T.filmsH, T.filmsP, pendingBlock(FILM_TARGETS), true));
      }

       
      var pair = el('div', { class: 'm-quality-pair' });
      if ((films && films.some(function (f) { return pick(f, ['lufs', 'integrated_lufs']) != null; })) || (loud && loud.length)) {
        pair.append(section('loud', T.loudH, null, el('div', { class: 'm-quality-pblock' },
          el('p', { class: 'note' }, P(['القيم المقيسة لكل ملف في جدول الأفلام أعلاه، مقابل هذه الأهداف.', 'The measured value of each file is in the film table above, against these targets.'])),
          targetList(LOUD_TARGETS))));
      } else {
        pair.append(section('loud', T.loudH, null, pendingBlock(LOUD_TARGETS)));
      }
      var perf = q ? pick(q, ['performance', 'lab']) : null;
      var metrics = perf ? arr(perf.metrics) || arr(perf) : null;
      if (metrics && metrics.length) {
        var penv = pick(perf, ['environment', 'env']) || env;
        pair.append(section('perf', T.perfH, null, el('div', { class: 'm-quality-pblock' },
          el('p', { class: 'm-quality-envline' }, P(T.env), el('b', null, txt(penv) || '—'),
            perf.tool ? sep() + txt(perf.tool) : '', perf.runs ? sep() + n(perf.runs) + (lang() === 'ar' ? (Number(perf.runs) > 10 ? ' تشغيلًا' : ' تشغيلات') : ' runs') : ''),
          el('ul', { class: 'm-quality-metrics' }, metrics.map(function (m) {
            return el('li', null,
              el('span', { class: 'm-quality-ml' }, txt(m.label || m.id)),
              el('b', { class: 'mono' }, ltr(String(m.value) + (m.unit ? ' ' + m.unit : ''))),
              m.target != null ? el('span', { class: 'note' }, P(T.target) + ': ', ltr(String(m.target))) : null,
              m.status ? badge(m.status) : null);
          })),
          el('p', { class: 'note m-quality-lab' }, P(T.perfNote)))));
      } else {
        pair.append(section('perf', T.perfH, null, pendingBlock(PERF_TARGETS, T.perfNote)));
      }
      host.append(pair);

       
      var pair2 = el('div', { class: 'm-quality-pair' });
      var tests = q ? arr(pick(q, ['site_tests', 'tests'])) : null;
      if (tests && tests.length) {
        pair2.append(section('tests', T.testsH, null, el('ul', { class: 'm-quality-tests' }, tests.map(function (t) {
          return el('li', null,
            el('span', { class: 'm-quality-tl' }, txt(t.label || t.name || t.id),
              t.browser ? el('span', { class: 'm-quality-tb' }, ltr(txt(t.browser))) : null,
              t.note ? el('span', { class: 'm-quality-gnote' }, txt(t.note)) : null),
            badge(t.status));
        }))));
      } else {
        pair2.append(section('tests', T.testsH, null, el('div', { class: 'm-quality-pblock' },
          el('div', { class: 'm-quality-prow' }, pendingTag()),
          el('ul', { class: 'm-quality-tnames' }, SITE_TESTS.map(function (t) { return el('li', null, P(t[1])); })))));
      }
      var rub = q ? arr(q.rubric) : null;
      var rmap = {};
      (rub || []).forEach(function (r) { if (r && r.id) rmap[r.id] = r; });
      var rubricRows = (rub && rub.length && !rub.every(function (r) { return RUBRIC.some(function (d) { return d[0] === r.id; }); }))
        ? rub.map(function (r) { return [r.id, r.label || [r.id, r.id], r.weight]; })
        : RUBRIC;
      pair2.append(section('rubric', T.rubricH, T.rubricP, el('ul', { class: 'm-quality-rubric' }, rubricRows.map(function (d) {
        var r = rmap[d[0]] || {};
        var w = r.weight != null ? r.weight : d[2];
        var counted = r.passed != null && r.total != null;
        return el('li', null,
          el('span', { class: 'm-quality-rl' }, P(d[1])),
          el('span', { class: 'm-quality-rw' }, el('span', { class: 'm-quality-rbar', style: 'width:' + Math.max(0, Math.min(100, Number(w) || 0)) * 2 + '%' }), el('b', { class: 'mono' }, n(w) + (lang() === 'ar' ? '٪' : '%'))),
          el('span', { class: 'm-quality-rs' }, counted
            ? [P(T.passedOf), ltr(String(r.passed) + ' / ' + String(r.total))]
            : P(T.notScored)));
      }))));
      host.append(pair2);

       
      var defects = q ? arr(q.defects) : null;
      var dkids;
      if (defects) {
        dkids = defects.length ? el('ul', { class: 'm-quality-defects' }, defects.map(function (d) {
          var sev = d.severity && T.sev[d.severity] ? P(T.sev[d.severity]) : txt(d.severity);
          var stt = d.status && T[d.status] ? P(T[d.status]) : txt(d.status || '');
          return el('li', null, el('span', { class: 'm-quality-dt' }, txt(d.text || d.title)),
            el('span', { class: 'm-quality-dm' }, sev ? el('span', { class: 'm-quality-sev m-quality-sev-' + (d.severity || 'x') }, sev) : null, stt ? el('span', { class: 'note' }, stt) : null));
        })) : el('p', { class: 'note' }, P(T.noDefects));
      } else {
        dkids = el('div', { class: 'm-quality-pblock' },
          el('div', { class: 'm-quality-prow' }, pendingTag(), el('span', { class: 'note' }, P(T.knownOpen))),
          el('ul', { class: 'm-quality-defects' }, KNOWN_OPEN.map(function (d) {
            return el('li', null, el('span', { class: 'm-quality-dt' }, P(d.text)), el('span', { class: 'm-quality-dm' }, el('span', { class: 'note' }, P(T.open))));
          })));
      }
      host.append(section('defects', T.defectsH, null, dkids, true));
      if (wasOpen) { var d = host.querySelector('.m-quality-all'); if (d) d.open = true; }
      if (activeId) { var a = document.getElementById(activeId); if (a) a.focus(); }
    }
    render();
    if (api.onLang) api.onLang(render);
  }

  (window.StudioModules = window.StudioModules || {}).quality = { mount: mount };
})();
