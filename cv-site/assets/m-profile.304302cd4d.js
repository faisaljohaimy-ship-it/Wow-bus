 
(function () {
  'use strict';
  var CV_DIR = window.FJ_DOCS_BASE || 'docs/';    
  var CV_NAME = function (l) { return 'faisal-al-juhaimy-profile-' + l + '.pdf'; };
  var CASE_OF = { 'SADEED': 'sadeed', 'BILTIX Risk AI': 'biltix', 'KPI calculator': 'kpi' };
  var MONTHS = {
    ar: ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'],
    en: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
  };
  var T = {
    cvH: ['سيرة قصيرة للطباعة', 'Short printable CV'],
    cvP: ['صفحة مطبوعة واحدة بلغة الصفحة، إصدار نوفمبر ٢٠٢٦، بلا بيانات اتصال. كل سطر فيها مأخوذ من هذا القسم بحالته.', 'One A4 page in the page language, November 2026 edition, with no contact details. Every line on it comes from this section, with its state.'],
    cvBtn: ['نزّل السيرة القصيرة بالعربية، جاهزة للطباعة', 'Download the short CV · PDF in English'],
    cvOther: ['النسخة الإنجليزية · PDF', 'Arabic version · PDF'],
    cvFail: ['تعذّر الحفظ من الصفحة، فاستخدمنا رابط التنزيل المباشر.', 'Saving from the page failed, so we used the direct download link.'],
    words: ['بكلماته', 'In his words'],
    qualH: ['المؤهل والخلفية', 'Qualification and background'],
    qualP: ['كما تذكرها المصادر، ولكل بند حالته ومصدره.', 'As the sources state them, each item with its state and source.'],
    projH: ['دوره في كل مشروع', 'His role in each project'],
    role: ['الدور', 'Role'], what: ['المشروع', 'The project'], note: ['الحالة والحدود', 'State and limits'],
    seeCase: ['اقرأ دراسة الحالة', 'Read the case study'],
    skillsH: ['مهارات بحالتها', 'Skills, each with its state'],
    skillsP: ['لا نسب إتقان ولا ترتيب: لكل مهارة حالتها ودليلها.', 'No mastery percentages and no rankings: each skill carries its state and its evidence.'],
    langH: ['لغات العمل', 'Working languages'],
    notH: ['ما لا ندّعيه عن قصد', 'What we deliberately do not claim'],
    asOf: ['المصادر مقروءة في ', 'Sources read on '],
  };

  function mount(root, api) {
    var P = api.P, el = api.el;
    var lang = function () { return api.lang(); };
    var host = el('div', { class: 'm-profile' });
    root.appendChild(host);
    function fmtDate(iso) {
      var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || '');
      if (!m) return iso || '';
      return lang() === 'ar' ? api.num(Number(m[3]) + ' ' + MONTHS.ar[Number(m[2]) - 1] + ' ' + m[1]) : Number(m[3]) + ' ' + MONTHS.en[Number(m[2]) - 1] + ' ' + m[1];
    }
    function chip(k, label) { return api.chip(k, label ? P(label) : undefined); }
    function auto(t) { return el('bdi', { dir: 'auto' }, t); }

    function cvBlock() {
      var l = lang();
      var path = CV_DIR + CV_NAME(l), name = CV_NAME(l);
      var status = el('p', { class: 'm-profile-cvstatus note', role: 'status', 'aria-live': 'polite' });
      var fallback = function () {
        var a = el('a', { href: path, download: name, hidden: true }); document.body.appendChild(a); a.click(); a.remove();
        status.textContent = P(T.cvFail);
      };
      var main;
      if (typeof api.saveFile === 'function') {
        main = el('button', {
          type: 'button', class: 'btn btn-primary m-profile-cvbtn', id: 'profile-cv',
          onclick: function () {
            status.textContent = '';
            try {
              var r = api.saveFile(path, name);
              if (r && typeof r.then === 'function') r.then(function (ok) { if (ok === false) fallback(); }, fallback);
            } catch (e) { fallback(); }
          },
        }, downIcon(), P(T.cvBtn));
      } else {
        main = el('a', { class: 'btn btn-primary m-profile-cvbtn', id: 'profile-cv', href: path, download: name, type: 'application/pdf' }, downIcon(), P(T.cvBtn));
      }
      return el('div', { class: 'm-profile-cv' },
        el('h3', { class: 'm-profile-k' }, P(T.cvH)),
        el('p', { class: 'm-profile-cvp' }, P(T.cvP)),
         
        el('div', { class: 'm-profile-cvact' }, main),
        status);
    }
    function downIcon() {
      var s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('aria-hidden', 'true'); s.setAttribute('class', 'm-profile-ic');
      var p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      p.setAttribute('d', 'M12 4v11M7 11l5 5 5-5M5 20h14'); s.appendChild(p);
      return s;
    }
    function itemRow(it) {
      return el('li', null,
        el('div', { class: 'm-profile-it' }, el('b', null, P(it.title || it.name)), chip(it.status)),
        it.detail ? el('p', null, P(it.detail)) : null,
        it.source ? el('p', { class: 'm-profile-src' }, P(it.source)) : null);
    }

    function render() {
      var d = api.data && api.data.profile;
      var active = document.activeElement, activeId = active && host.contains(active) ? active.id : null;
      host.textContent = '';
      if (!d) { host.append(el('p', { class: 'note' }, P(['بيانات السيرة غير متاحة في هذه النسخة.', 'The profile data is not available in this build.']))); return; }

       
      var ident = el('div', { class: 'm-profile-ident' },
        el('p', { class: 'm-profile-role' }, P(d.role)),
        el('p', { class: 'm-profile-name' }, P(d.name)),
        d.role_note ? el('p', { class: 'm-profile-rnote' }, P(d.role_note)) : null,
        cvBlock());
      var st = d.statement;
      var story = el('div', { class: 'm-profile-story' },
        el('p', { class: 'm-profile-summary' }, P(d.summary)),
        st ? el('figure', { class: 'm-profile-quote' },
          el('blockquote', null, el('p', null, P(st.text))),
          el('figcaption', null, chip(st.status || 'stated', T.words), el('span', { class: 'm-profile-src' }, P(st.source)))) : null);
      host.append(el('div', { class: 'm-profile-top' }, ident, story));

       
      var qual = [].concat(d.qualifications || [], d.experience || []);
      host.append(el('section', { class: 'm-profile-sec', 'aria-labelledby': 'm-profile-qual' },
        el('div', { class: 'm-profile-sech' }, el('h3', { id: 'm-profile-qual', class: 'm-profile-h' }, P(T.qualH)), el('p', { class: 'm-profile-lead' }, P(T.qualP))),
        el('ul', { class: 'm-profile-list' }, qual.map(itemRow))));

       
      host.append(el('section', { class: 'm-profile-sec', 'aria-labelledby': 'm-profile-proj' },
        el('div', { class: 'm-profile-sech' }, el('h3', { id: 'm-profile-proj', class: 'm-profile-h' }, P(T.projH))),
        el('ul', { class: 'm-profile-projects' }, (d.projects || []).map(function (p) {
          var nm = lang() === 'ar' && p.name_ar ? p.name_ar : p.name;
          var caseId = CASE_OF[p.name];
          return el('li', null,
            el('div', { class: 'm-profile-ph' }, el('b', { class: 'm-profile-pn' }, auto(nm)),
              chip(p.status)),
            el('dl', { class: 'm-profile-pdl' },
              el('div', null, el('dt', null, P(T.role)), el('dd', { class: 'm-profile-prole' }, P(p.role))),
              el('div', null, el('dt', null, P(T.what)), el('dd', null, P(p.what))),
              p.note ? el('div', { class: 'm-profile-wide' }, el('dt', null, P(T.note)), el('dd', null, P(p.note))) : null),
            caseId ? el('button', { type: 'button', class: 'link-btn m-profile-case', onclick: function () { api.go('cases'); } }, P(T.seeCase)) : null);
        }))));

       
      host.append(el('section', { class: 'm-profile-sec', 'aria-labelledby': 'm-profile-skills' },
        el('div', { class: 'm-profile-sech' }, el('h3', { id: 'm-profile-skills', class: 'm-profile-h' }, P(T.skillsH)), el('p', { class: 'm-profile-lead' }, P(T.skillsP))),
        el('div', { class: 'm-profile-groups' }, (d.skills_groups || []).map(function (g) {
          return el('div', { class: 'm-profile-group' },
            el('h4', { class: 'm-profile-gh' }, P(g.name)),
            el('ul', null, (g.items || []).map(function (it) {
              return el('li', null, el('span', { class: 'm-profile-sk' }, P(it.text)), chip(it.status), it.evidence ? el('span', { class: 'm-profile-skev' }, P(it.evidence)) : null);
            })));
        }))));

       
      var notItems = d.not_claimed_items || [];
      host.append(el('div', { class: 'm-profile-pair' },
        el('section', { class: 'm-profile-sec', 'aria-labelledby': 'm-profile-lang' },
          el('div', { class: 'm-profile-sech' }, el('h3', { id: 'm-profile-lang', class: 'm-profile-h' }, P(T.langH))),
          el('ul', { class: 'm-profile-list' }, (d.languages || []).map(itemRow))),
        el('section', { class: 'm-profile-sec', 'aria-labelledby': 'm-profile-not' },
          el('div', { class: 'm-profile-sech' }, el('h3', { id: 'm-profile-not', class: 'm-profile-h' }, P(T.notH))),
          el('ul', { class: 'm-profile-not' }, notItems.map(function (x) { return el('li', null, P(x)); })),
          d.as_of ? el('p', { class: 'note' }, P(T.asOf), el('time', { datetime: d.as_of }, fmtDate(d.as_of)), '.') : null)));
      if (activeId) { var n = document.getElementById(activeId); if (n) n.focus(); }
    }
    render();
    if (api.onLang) api.onLang(render);
  }

  (window.StudioModules = window.StudioModules || {}).profile = { mount: mount };
})();
