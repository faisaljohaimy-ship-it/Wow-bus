 
(function () {
  'use strict';
  var PAGE = 12;
  var MONTHS = {
    ar: ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'],
    en: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
  };
  var T = {
    catsH: ['سبعة أصناف لا تُجمع', 'Seven categories, never added together'],
    catsNav: ['أصناف الكتالوج', 'Catalog categories'],
    rowsShown: ['صفًّا معروضًا', 'rows shown'],
    rowShown: ['صف معروض', 'row shown'],
    search: ['ابحث بالاسم أو الوظيفة أو المثال، بالعربية أو الإنجليزية', 'Search name, function or example, in Arabic or English'],
    searchPh: ['مثال: فيديو، قاعدة بيانات، اختبار', 'e.g. video, Supabase, test'],
    layer: ['الطبقة', 'Layer'],
    anyLayer: ['كل الطبقات', 'All layers'],
    stateF: ['الحالة', 'State'],
    anyState: ['أي حالة', 'Any state'],
    of: ['من', 'of'],
    inCat: ['في صنف', 'in'],
    match: ['مطابقة', 'matching'],
    others: ['مطابقات في أصناف أخرى، كلٌّ وحده:', 'Matches in other categories, each on its own:'],
    emptyH: ['لا صف يطابق هذا البحث في هذا الصنف.', 'No row in this category matches this search.'],
    emptyP: ['جرّب كلمة أخرى، أو امسح عوامل التصفية.', 'Try another word, or clear the filters.'],
    clear: ['مسح عوامل التصفية', 'Clear filters'],
    more: ['عرض المزيد', 'Show more'],
    remaining: ['متبقٍّ', 'remaining'],
    fn: ['الوظيفة', 'Function'], input: ['المدخل', 'Input'], output: ['المخرج', 'Output'],
    via: ['طريقة الربط', 'Connection'], example: ['مثال عملي', 'Worked example'], evidence: ['الدليل', 'Evidence'],
    action: ['ما تفعله', 'What it does'], check: ['كيف نتحقق', 'How we check'], capacity: ['السعة والحدود', 'Capacity and limits'],
    packages: ['الحزم', 'Packages'],
    state: ['الحالة', 'State'], source: ['المصدر', 'Source'], verified: ['تاريخ التحقق', 'Verified on'],
    group: ['المجموعة', 'Group'],
    ed3: ['في النسخة الثالثة كانت حالته: محاكاة. مشهده في الفيلم ٠٣ ما زال إعادة تمثيل.', 'In edition 3 its state was: simulated. Its film 03 scene remains a reenactment.'],
    foot: ['تاريخ التحقق من الكتالوج: ', 'Catalog verified on '],
    affil: ['أسماء المنتجات تصف الاستخدام فقط، ولا تعني ارتباطًا بأي جهة أو رعاية منها.', 'Product names describe use only and imply no affiliation with, or endorsement by, any company.'],
    regH: ['أعداد السجلات المرجعية — منفصلة ولا تُجمع', 'Registry figures — kept apart, never added together'],
    listedH: ['مدرجة وغير موصولة', 'Listed, not connected'],
    countLive: ['النتائج', 'Results'],
  };
  var STATE_FALLBACK = {
    verified: ['مثبت', 'Verified'], observed: ['مرصود', 'Observed'], configured: ['مهيأ', 'Configured'],
    in_code: ['في الكود', 'In code'], disabled: ['معطل', 'Disabled'], simulated: ['محاكاة', 'Simulated'],
    proposed: ['مقترح', 'Proposed'], not_measured: ['غير مقاس', 'Not measured'], stated: ['من السيرة', 'From the CV'],
  };

  function norm(s) {
    return String(s == null ? '' : s).toLowerCase()
      .replace(/[ً-ٰٟـ]/g, '')
      .replace(/[أإآٱ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه')
      .replace(/ؤ/g, 'و').replace(/ئ/g, 'ي')
      .replace(/[٠-٩]/g, function (d) { return String(d.charCodeAt(0) - 0x660); })
      .replace(/[‘’`]/g, "'").replace(/[·•|,؛،]/g, ' ').replace(/\s+/g, ' ').trim();
  }
  function flat(v) { return Array.isArray(v) ? v.join(' ') : (v || ''); }

  function mount(root, api) {
    var cat = (api.data && api.data.catalog) || null;
    var host = api.el('div', { class: 'm-lab' });
    root.appendChild(host);
    if (!cat || !Array.isArray(cat.items)) {
      host.appendChild(api.el('p', { class: 'note' }, api.P(['بيانات الكتالوج غير متاحة في هذه النسخة.', 'The catalog data is not available in this build.'])));
      return;
    }
    var P = api.P;
    var L = function (pair) { return P(pair); };
    var lang = function () { return api.lang(); };
    var layerLabel = {};
    (cat.layers || []).forEach(function (l) { layerLabel[l.key] = l.label; });
    var cats = (cat.categories || []).map(function (c) { return c.key; });
    var items = cat.items.map(function (it) {
      return { it: it, hay: norm([it.name, it.name_ar, flat(it['function']), flat(it.example), flat(layerLabel[it.layer])].join(' ')) };
    });
    var st = { cat: cats.indexOf('used') >= 0 ? 'used' : cats[0], q: '', layer: 'all', state: 'all', shown: PAGE, open: {} };
    var uid = (root.id || 'm-lab') + '-';

    function fmtN(n) {
      var s = Number(n).toLocaleString('en-US');
      return lang() === 'ar' ? api.num(s).replace(/,/g, '٬') : s;
    }
    function fmtDate(iso) {
      var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || '');
      if (!m) return iso || '';
      var d = Number(m[3]), mo = Number(m[2]) - 1, y = m[1];
      return lang() === 'ar' ? api.num(d + ' ' + MONTHS.ar[mo] + ' ' + y) : d + ' ' + MONTHS.en[mo] + ' ' + y;
    }
    function arRows(n, tail) {
       
      if (n === 1) return 'صف واحد' + (tail ? ' ' + tail[0] : '');
      if (n === 2) return 'صفان' + (tail ? ' ' + tail[1] : '');
      if (n >= 3 && n <= 10) return fmtN(n) + ' صفوف' + (tail ? ' ' + tail[1] : '');
      return fmtN(n) + ' صفًّا' + (tail ? ' ' + tail[0] : '');
    }
    function unitFor(key, d) {
      if (!d.unit) return '';
      var u = L(d.unit), v = d.value;
      if (lang() === 'ar' && /^صفًّا/.test(u) && v >= 3 && v <= 10) u = u.replace(/^صفًّا/, 'صفوف');
      return u;
    }
    function stateLabel(k) { return STATE_FALLBACK[k] ? P(STATE_FALLBACK[k]) : k; }
    function chip(k) { return api.chip ? api.chip(k) : api.el('span', { class: 'st st-' + k }, api.el('i', { 'aria-hidden': 'true' }), stateLabel(k)); }
    function latin(text) { return api.el('bdi', { dir: 'auto' }, text); }
     
    function rich(text) {
      var out = [];
      String(text == null ? '' : text).split(/`([^`]+)`/).forEach(function (part, i) {
        if (!part) return;
        out.push(i % 2 ? api.el('code', { dir: 'ltr', translate: 'no' }, part) : part);
      });
      return out;
    }
    function RL(pair) { return rich(L(pair)); }
    function nameChip(name) {
      if (/^[@a-z0-9][\w@./^:-]*( [\^~]?[\d.]+)?$/.test(name) && !/^[a-z]+$/.test(name) || /^[a-z0-9]+(\.[a-z0-9_]+)+$/.test(name)) return api.el('code', { dir: 'ltr', translate: 'no' }, name);
      return api.el('bdi', { dir: 'ltr', translate: 'no', 'data-proper-name': '' }, name);
    }
     
    function nameRich(text) {
      var out = [];
      String(text == null ? '' : text).split(/`([^`]+)`/).forEach(function (part, i) {
        if (!part) return;
        if (i % 2) { out.push(api.el('code', { dir: 'ltr', translate: 'no' }, part)); return; }
        var last = 0, re = /[A-Za-z][A-Za-z0-9.+#&'’-]*(?:\s+[A-Za-z0-9][A-Za-z0-9.+#&'’-]*)*/g, m;
        while ((m = re.exec(part))) {
          if (m.index > last) out.push(part.slice(last, m.index));
          out.push(api.el('bdi', { dir: 'ltr', translate: 'no', 'data-proper-name': '' }, m[0]));
          last = m.index + m[0].length;
        }
        if (last < part.length) out.push(part.slice(last));
      });
      return out;
    }
    function itemName(it) { return lang() === 'ar' && it.name_ar ? api.el('span', null, nameRich(it.name_ar)) : (lang() === 'ar' ? nameChip(it.name) : latin(it.name)); }
    function catDef(key) { return (cat.categories || []).filter(function (c) { return c.key === key; })[0]; }

    function tokens() { var q = norm(st.q); return q ? q.split(' ') : []; }
    function matchesQ(entry, tk) { for (var i = 0; i < tk.length; i++) if (entry.hay.indexOf(tk[i]) < 0) return false; return true; }
    function inCat(key) { return items.filter(function (e) { return e.it.category === key; }); }
    function filtered() {
      var tk = tokens();
      return inCat(st.cat).filter(function (e) {
        if (st.layer !== 'all' && e.it.layer !== st.layer) return false;
        if (st.state !== 'all' && e.it.state !== st.state) return false;
        return matchesQ(e, tk);
      });
    }

     
    var grid = api.el('div', { class: 'm-lab-grid' });
    var nav = api.el('nav', { class: 'm-lab-cats' });
    var main = api.el('div', { class: 'm-lab-main' });
    var foot = api.el('div', { class: 'm-lab-foot' });
    grid.append(nav, main);
    host.append(grid, foot);

    var defBox = api.el('div', { class: 'm-lab-def' });
    var tools = api.el('div', { class: 'm-lab-tools', role: 'search' });
    var input = api.el('input', { type: 'search', id: uid + 'q', autocomplete: 'off', spellcheck: 'false' });
    var qLabel = api.el('label', { for: uid + 'q' });
    var searchBox = api.el('div', { class: 'search m-lab-search' }, qLabel, input);
    var layerSel = api.el('select', { id: uid + 'layer', class: 'm-lab-select' });
    var layerLabelEl = api.el('label', { for: uid + 'layer' });
    var layerBox = api.el('div', { class: 'field m-lab-field' }, layerLabelEl, layerSel);
    var stateGroup = api.el('div', { class: 'filters m-lab-states', role: 'group' });
    var stateCap = api.el('span', { class: 'm-lab-cap', id: uid + 'statecap' });
    var stateBox = api.el('div', { class: 'm-lab-statebox' }, stateCap, stateGroup);
    tools.append(searchBox, layerBox, stateBox);
    var count = api.el('p', { class: 'm-lab-count', role: 'status', 'aria-live': 'polite', 'aria-atomic': 'true' });
    var others = api.el('div', { class: 'm-lab-others' });
    var list = api.el('ul', { class: 'm-lab-list' });
    var empty = api.el('div', { class: 'm-lab-empty', hidden: true });
    var moreBox = api.el('div', { class: 'm-lab-more' });
    main.append(defBox, tools, count, others, list, empty, moreBox);

    input.addEventListener('input', function () {
      st.q = input.value; st.shown = PAGE;
      renderList(); scheduleCount();
    });
    input.addEventListener('keydown', function (e) { if (e.key === 'Escape' && input.value) { input.value = ''; st.q = ''; st.shown = PAGE; renderList(); scheduleCount(); } });
    layerSel.addEventListener('change', function () { st.layer = layerSel.value; st.shown = PAGE; renderStates(); renderList(); scheduleCount(); });

    var countTimer = null;
    function scheduleCount() { clearTimeout(countTimer); countTimer = setTimeout(renderCount, 380); }

     
    function renderNav() {
      nav.textContent = '';
      nav.setAttribute('aria-label', L(T.catsNav));
      nav.append(api.el('h3', { class: 'm-lab-cats-h' }, L(T.catsH)));
      var ul = api.el('ul', { class: 'm-lab-cat-list' });
      cats.forEach(function (key) {
        var c = catDef(key), d = (cat.counts_detail || {})[key] || {}, value = d.value != null ? d.value : (cat.counts || {})[key];
        var rows = d.rows != null ? d.rows : inCat(key).length;
        var extra = value !== rows
          ? api.el('span', { class: 'm-lab-cat-x' }, lang() === 'ar' ? arRows(rows, ['معروضًا', 'معروضة']).replace('صف واحد معروضًا', 'صف واحد معروض') : fmtN(rows) + ' ' + L(rows === 1 ? T.rowShown : T.rowsShown))
          : null;
        var b = api.el('button', {
          type: 'button', class: 'm-lab-cat', id: uid + 'cat-' + key, 'aria-pressed': key === st.cat ? 'true' : 'false', 'data-cat': key,
          onclick: function () { selectCat(key, true); },
        },
        api.el('span', { class: 'm-lab-cat-l' }, L(c.label)),
        api.el('span', { class: 'm-lab-cat-n' }, api.el('b', { class: 'mono' }, fmtN(value)), ' ', api.el('span', { class: 'm-lab-cat-u' }, unitFor(key, d))),
        extra);
        ul.append(api.el('li', null, b));
      });
      nav.append(ul);
    }
    function selectCat(key, focusList) {
      if (key === st.cat) return;
      st.cat = key; st.shown = PAGE; st.open = {};
      var layers = layersIn(key), states = statesIn(key);
      if (st.layer !== 'all' && layers.indexOf(st.layer) < 0) st.layer = 'all';
      if (st.state !== 'all' && states.indexOf(st.state) < 0) st.state = 'all';
      Array.prototype.forEach.call(nav.querySelectorAll('.m-lab-cat'), function (b) { b.setAttribute('aria-pressed', b.getAttribute('data-cat') === key ? 'true' : 'false'); });
      renderDef(); renderLayers(); renderStates(); renderList(); renderCount();
      if (focusList && window.matchMedia && window.matchMedia('(max-width: 900px)').matches) {
        defBox.scrollIntoView({ block: 'start', behavior: api.reducedMotion ? 'auto' : 'smooth' });
      }
    }

    function renderDef() {
      var c = catDef(st.cat), d = (cat.counts_detail || {})[st.cat] || {};
      defBox.textContent = '';
      defBox.append(
        api.el('h3', { class: 'm-lab-def-h' }, L(c.label)),
        api.el('p', { class: 'm-lab-def-p' }, L(c.definition)),
        d.basis ? api.el('p', { class: 'm-lab-def-basis' },
          api.el('b', { class: 'mono' }, fmtN(d.value)), ' ', unitFor(st.cat, d), ' — ', RL(d.basis)) : null
      );
    }

    function layersIn(key) {
      var seen = [];
      inCat(key).forEach(function (e) { if (seen.indexOf(e.it.layer) < 0) seen.push(e.it.layer); });
      var order = (cat.layers || []).map(function (l) { return l.key; });
      return seen.sort(function (a, b) { return order.indexOf(a) - order.indexOf(b); });
    }
    function statesIn(key) {
      var seen = [];
      inCat(key).forEach(function (e) { if (seen.indexOf(e.it.state) < 0) seen.push(e.it.state); });
      var order = cat.states || Object.keys(STATE_FALLBACK);
      return seen.sort(function (a, b) { return order.indexOf(a) - order.indexOf(b); });
    }
    function renderLayers() {
      layerLabelEl.textContent = L(T.layer);
      layerSel.textContent = '';
      var rows = inCat(st.cat);
      layerSel.append(api.el('option', { value: 'all' }, L(T.anyLayer) + ' (' + fmtN(rows.length) + ')'));
      layersIn(st.cat).forEach(function (k) {
        var n = rows.filter(function (e) { return e.it.layer === k; }).length;
        layerSel.append(api.el('option', { value: k }, (layerLabel[k] ? L(layerLabel[k]) : k) + ' (' + fmtN(n) + ')'));
      });
      layerSel.value = st.layer;
      layerSel.disabled = layersIn(st.cat).length < 2;
    }
    function renderStates() {
      stateCap.textContent = L(T.stateF);
      stateGroup.setAttribute('aria-labelledby', uid + 'statecap');
      stateGroup.textContent = '';
      var rows = inCat(st.cat).filter(function (e) { return st.layer === 'all' || e.it.layer === st.layer; });
      var opts = ['all'].concat(statesIn(st.cat));
      opts.forEach(function (k) {
        var n = k === 'all' ? rows.length : rows.filter(function (e) { return e.it.state === k; }).length;
        stateGroup.append(api.el('button', {
          type: 'button', class: 'filter m-lab-sf', id: uid + 'sf-' + k, 'aria-pressed': st.state === k ? 'true' : 'false', 'data-st': k,
          onclick: function () { st.state = k; st.shown = PAGE; renderStates(); renderList(); scheduleCount(); },
        }, (k === 'all' ? L(T.anyState) : stateLabel(k)) + ' ' + fmtN(n)));
      });
    }

     
    function renderCount() {
      var res = filtered(), all = inCat(st.cat).length, c = catDef(st.cat);
      var filteredOn = st.q || st.layer !== 'all' || st.state !== 'all';
      var text = lang() === 'ar'
        ? (filteredOn ? 'يطابق ' + fmtN(res.length) + ' من ' + arRows(all) + ' في صنف «' + c.label[0] + '»' : arRows(all) + ' في صنف «' + c.label[0] + '»')
        : (filteredOn ? fmtN(res.length) + ' of ' + fmtN(all) + ' rows match in “' + c.label[1] + '”' : fmtN(all) + (all === 1 ? ' row' : ' rows') + ' in “' + c.label[1] + '”');
      var d = (cat.counts_detail || {})[st.cat] || {};
      if (d.value != null && d.value !== all) {
        text += lang() === 'ar'
          ? '. الصفوف شارحة، والعدد الذي تمثله ' + fmtN(d.value) + ' ' + unitFor(st.cat, d) + '.'
          : '. The rows explain a count of ' + fmtN(d.value) + ' ' + L(d.unit) + '.';
      }
      count.textContent = text;
    }

     
    function field(label, value, cls) {
      if (value == null || value === '' || (Array.isArray(value) && !value.length)) return null;
      return api.el('div', { class: 'm-lab-f' + (cls ? ' ' + cls : '') }, api.el('dt', null, L(label)), api.el('dd', null, value));
    }
    function body(it) {
      var dl = api.el('dl', { class: 'm-lab-dl' });
      var pkg = Array.isArray(it.packages) && it.packages.length > 1 ? api.el('code', { class: 'm-lab-pk', dir: 'ltr', translate: 'no' }, it.packages.join(' · ')) : null;
      [
        field(T.fn, RL(it['function'])),
        field(T.input, it.input ? RL(it.input) : null),
        field(T.output, it.output ? RL(it.output) : null),
        field(T.via, it.connects_via ? RL(it.connects_via) : null),
        field(T.action, it.action ? RL(it.action) : null),
        field(T.example, it.example ? RL(it.example) : null, 'm-lab-wide'),
        field(T.evidence, it.evidence ? RL(it.evidence) : null, 'm-lab-wide m-lab-ev'),
        field(T.check, it.check ? RL(it.check) : null, 'm-lab-wide'),
        field(T.capacity, it.capacity ? RL(it.capacity) : null, 'm-lab-wide'),
        pkg ? field(T.packages, pkg, 'm-lab-wide') : null,
        field(T.group, it.group ? RL(it.group) : null),
        field(T.state, api.el('span', { class: 'm-lab-stv' }, chip(it.state),
          it.state_in_edition_3 ? api.el('span', { class: 'm-lab-ed3' }, L(T.ed3)) : null)),
        field(T.source, it.source ? RL(it.source) : null),
        field(T.verified, it.verified_at ? api.el('time', { datetime: it.verified_at }, fmtDate(it.verified_at)) : null),
      ].forEach(function (n) { if (n) dl.append(n); });
      return dl;
    }
    function itemNode(it) {
      var id = uid + it.id.replace(/[^a-z0-9_-]/gi, '_');
      var open = !!st.open[it.id];
       
      var bodyEl = api.el('div', { class: 'm-lab-body', id: id + '-b', role: 'region', 'aria-labelledby': id + '-t' });
      if (!open) bodyEl.hidden = true; else bodyEl.append(body(it));
      var btn = api.el('button', {
        type: 'button', class: 'm-lab-btn', id: id + '-t', 'aria-expanded': open ? 'true' : 'false', 'aria-controls': id + '-b',
        onclick: function () {
          var now = btn.getAttribute('aria-expanded') !== 'true';
          btn.setAttribute('aria-expanded', now ? 'true' : 'false');
          if (now) { st.open[it.id] = true; if (!bodyEl.firstChild) bodyEl.append(body(it)); bodyEl.hidden = false; }
          else { delete st.open[it.id]; bodyEl.hidden = true; }
        },
      },
      api.el('span', { class: 'm-lab-name' }, itemName(it)),
      api.el('span', { class: 'm-lab-fnl' }, RL(it['function'])),
      api.el('span', { class: 'm-lab-meta' }, chip(it.state), api.el('span', { class: 'm-lab-layer' }, layerLabel[it.layer] ? L(layerLabel[it.layer]) : it.layer)),
      api.el('span', { class: 'm-lab-chev', 'aria-hidden': 'true' }));
      return api.el('li', { class: 'm-lab-item', 'data-id': it.id }, api.el('h4', { class: 'm-lab-ih' }, btn), bodyEl);
    }
    function renderList(focusFrom) {
      var res = filtered();
      list.textContent = '';
      var vis = res.slice(0, st.shown);
      vis.forEach(function (e) { list.append(itemNode(e.it)); });
      empty.hidden = res.length > 0;
      empty.textContent = '';
      if (!res.length) {
        empty.append(
          api.el('p', { class: 'm-lab-empty-h' }, L(T.emptyH)),
          api.el('p', { class: 'note' }, L(T.emptyP)),
          api.el('button', { type: 'button', class: 'btn', onclick: clearFilters }, L(T.clear))
        );
      }
      moreBox.textContent = '';
      if (res.length > vis.length) {
        var left = res.length - vis.length;
        moreBox.append(api.el('button', {
          type: 'button', class: 'btn m-lab-morebtn', id: uid + 'more',
          onclick: function () {
            var from = st.shown; st.shown += PAGE; renderList(from); renderCount();
          },
        }, L(T.more), api.el('span', { class: 'm-lab-left' }, '(' + fmtN(left) + ' ' + L(T.remaining) + ')')));
      }
      if (typeof focusFrom === 'number') {
        var btns = list.querySelectorAll('.m-lab-btn');
        if (btns[focusFrom]) btns[focusFrom].focus();
      }
      renderOthers();
    }
    function renderOthers() {
      others.textContent = '';
      var tk = tokens();
      if (!tk.length) return;
      var hits = cats.filter(function (k) { return k !== st.cat; }).map(function (k) {
        return { k: k, n: inCat(k).filter(function (e) { return matchesQ(e, tk); }).length };
      }).filter(function (h) { return h.n > 0; });
      if (!hits.length) return;
      others.append(api.el('span', { class: 'm-lab-cap' }, L(T.others)));
      var ul = api.el('ul', { class: 'm-lab-olist' });
      hits.forEach(function (h) {
        ul.append(api.el('li', null, api.el('button', {
          type: 'button', class: 'link-btn m-lab-ob',
          onclick: function () { selectCat(h.k, false); var b = nav.querySelector('[data-cat="' + h.k + '"]'); if (b) b.focus(); },
        }, L(catDef(h.k).label) + ' (' + fmtN(h.n) + ')')));
      });
      others.append(ul);
    }
    function clearFilters() {
      st.q = ''; input.value = ''; st.layer = 'all'; st.state = 'all'; st.shown = PAGE;
      renderLayers(); renderStates(); renderList(); renderCount();
      input.focus();
    }

     
    function renderFoot() {
      foot.textContent = '';
      foot.append(
        api.el('p', { class: 'm-lab-verify' },
          L(T.foot), api.el('time', { datetime: cat.as_of }, fmtDate(cat.as_of)), '. ', L(T.affil)),
        cat.note ? api.el('p', { class: 'note' }, L(cat.note)) : null
      );
      if (Array.isArray(cat.registry_counts) && cat.registry_counts.length) {
        var ul = api.el('ul', { class: 'm-lab-reg' });
        cat.registry_counts.forEach(function (r) {
          var n = r.display ? L(r.display) : (r.qualifier === 'more_than' ? (lang() === 'ar' ? 'أكثر من ' : 'More than ') + fmtN(r.n) : fmtN(r.n));
          ul.append(api.el('li', null,
            api.el('b', { class: 'mono' }, n),
            api.el('span', { class: 'm-lab-reg-l' }, RL(r.label)),
            api.el('span', { class: 'm-lab-reg-m' }, chip(r.state), api.el('span', { class: 'note' }, (r.source ? RL(r.source) : '')))
          ));
        });
        foot.append(api.el('details', { class: 'm-lab-details' },
          api.el('summary', null, L(T.regH)),
          cat.registry_counts_note ? api.el('p', { class: 'note' }, L(cat.registry_counts_note)) : null,
          ul));
      }
      var lnc = cat.listed_not_connected;
      if (lnc && Array.isArray(lnc.detail) && lnc.detail.length) {
        var ul2 = api.el('ul', { class: 'm-lab-lnc' });
        lnc.detail.forEach(function (d) { ul2.append(api.el('li', null, api.el('span', { class: 'm-lab-lnc-n' }, lang() === 'ar' ? nameRich(d.name_ar || d.name) : latin(d.name)), ' — ', RL(d.status))); });
        foot.append(api.el('details', { class: 'm-lab-details' },
          api.el('summary', null, L(T.listedH) + ' (' + fmtN(lnc.detail.length) + ')'),
          lnc.note ? api.el('p', { class: 'note' }, RL(lnc.note)) : null, ul2));
      }
    }

    function renderChrome() {
      qLabel.textContent = L(T.search);
      input.placeholder = L(T.searchPh);
    }
    function renderAll() {
      renderChrome(); renderNav(); renderDef(); renderLayers(); renderStates(); renderList(); renderCount(); renderFoot();
    }
    renderAll();
    if (api.onLang) api.onLang(function () {
      var active = document.activeElement, activeId = active && host.contains(active) ? active.id : null;
      var openDetails = Array.prototype.map.call(foot.querySelectorAll('details'), function (d) { return d.open; });
      renderAll();
      Array.prototype.forEach.call(foot.querySelectorAll('details'), function (d, i) { if (openDetails[i]) d.open = true; });
      if (activeId) { var n = document.getElementById(activeId); if (n) n.focus(); }
    });
  }

  (window.StudioModules = window.StudioModules || {}).lab = { mount: mount };
})();
