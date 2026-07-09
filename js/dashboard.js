/* ============================================================
   Neexios Operations Dashboard
   Vanilla JS + SVG. No external libraries.
   - Seeded deterministic data (same numbers every load)
   - One filter row scopes every chart, stat and table
   - Crosshair tooltip on the line chart, per-mark tooltips
     on bars / donut / heat cells
   - Every chart has a table-view twin (relief rule)
   ============================================================ */

(function () {
  "use strict";

  const $ = (s, r) => (r || document).querySelector(s);
  const SVGNS = "http://www.w3.org/2000/svg";

  /* ---------- theme ---------- */
  const root = document.documentElement;
  const savedTheme = localStorage.getItem("nx_theme");
  if (savedTheme) root.dataset.theme = savedTheme;
  else if (matchMedia("(prefers-color-scheme: dark)").matches) root.dataset.theme = "dark";

  $("#themeToggle").addEventListener("click", () => {
    const next = root.dataset.theme === "dark" ? "light" : "dark";
    root.dataset.theme = next;
    localStorage.setItem("nx_theme", next);
    render(); // charts read CSS variables at render time
  });

  const css = (name) => getComputedStyle(root).getPropertyValue(name).trim();

  /* ---------- seeded data ---------- */
  function mulberry32(seed) {
    return function () {
      seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  const DAYS = 180; // history window: covers 90-day range + its comparison window
  const WEEKDAYS = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];
  const MONTHS = ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"];

  function buildData() {
    const rnd = mulberry32(20260709);
    const days = [];
    const today = new Date();
    for (let i = DAYS - 1; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const dow = d.getDay();
      const weekend = dow === 4 || dow === 5; // Thu/Fri peak travel
      const trend = 1 + (DAYS - 1 - i) * 0.0022; // slow growth
      const base = 620 * trend * (weekend ? 1.45 : 1) * (0.82 + rnd() * 0.36);
      const bookings = Math.round(base);
      const revenue = Math.round(bookings * (78 + rnd() * 22));
      const occupancy = Math.min(97, Math.round(58 + (weekend ? 14 : 0) + rnd() * 22));
      const onTime = Math.round(88 + rnd() * 10);
      days.push({ date: d, dow, bookings, revenue, occupancy, onTime });
    }

    // hour-of-day demand profile per weekday (for the heatmap), 12 two-hour bins
    const profile = [];
    for (let dow = 0; dow < 7; dow++) {
      const row = [];
      for (let b = 0; b < 12; b++) {
        const h = b * 2;
        let v = 12;
        if (h >= 6 && h < 10) v = 68;       // morning peak
        else if (h >= 10 && h < 14) v = 44;
        else if (h >= 14 && h < 18) v = 58; // afternoon peak
        else if (h >= 18 && h < 22) v = 74; // evening peak
        else if (h >= 22) v = 30;
        if (dow === 4 || dow === 5) v *= 1.4;
        row.push(Math.round(v * (0.75 + rnd() * 0.5)));
      }
      profile.push(row);
    }

    const routes = [
      { name: "الرياض ↔ جدة", share: 0.24 },
      { name: "جدة ↔ مكة المكرمة", share: 0.19 },
      { name: "الرياض ↔ الدمام", share: 0.16 },
      { name: "المدينة ↔ مكة المكرمة", share: 0.13 },
      { name: "جدة ↔ المدينة", share: 0.1 },
      { name: "الرياض ↔ القصيم", share: 0.08 },
    ];

    const channels = [
      { name: "التطبيق", share: 0.46 },
      { name: "الموقع", share: 0.3 },
      { name: "الوكلاء", share: 0.14 },
      { name: "المكاتب", share: 0.1 },
    ];

    const names = ["أحمد الغامدي", "سارة القحطاني", "خالد العنزي", "منى الحربي", "فهد الدوسري", "ريم الشمري", "ناصر الزهراني", "هند العتيبي"];
    const statuses = [
      { key: "ok", label: "مؤكد" }, { key: "ok", label: "مؤكد" }, { key: "ok", label: "مؤكد" },
      { key: "wait", label: "بانتظار الدفع" }, { key: "cancel", label: "ملغي" },
    ];
    const recent = names.map((n, i) => {
      const r = routes[Math.floor(rnd() * routes.length)];
      const st = statuses[Math.floor(rnd() * statuses.length)];
      return {
        id: "NX-" + (48210 + i * 7),
        name: n,
        route: r.name.replace("↔", "→"),
        seats: 1 + Math.floor(rnd() * 4),
        amount: Math.round((70 + rnd() * 160)),
        time: `${String(8 + Math.floor(rnd() * 12)).padStart(2, "0")}:${rnd() > 0.5 ? "30" : "00"}`,
        status: st,
      };
    });

    return { days, profile, routes, channels, recent };
  }

  const DATA = buildData();

  /* ---------- state ---------- */
  let range = 30;

  function slices() {
    const cur = DATA.days.slice(-range);
    const prev = DATA.days.slice(-range * 2, -range);
    return { cur, prev };
  }

  /* ---------- formatting ---------- */
  const fmt = (n) => n.toLocaleString("en-US");
  const compact = (n) =>
    n >= 1e6 ? (n / 1e6).toFixed(1) + "M" : n >= 1e3 ? (n / 1e3).toFixed(n >= 1e4 ? 0 : 1) + "K" : String(n);
  const dayLabel = (d) => `${d.getDate()} ${MONTHS[d.getMonth()]}`;

  /* ---------- tooltip ---------- */
  const tip = document.createElement("div");
  tip.className = "tip";
  document.body.appendChild(tip);

  function showTip(x, y, titleText, rows) {
    tip.textContent = "";
    const t = document.createElement("div");
    t.className = "tip-title";
    t.textContent = titleText;
    tip.appendChild(t);
    rows.forEach((r) => {
      const row = document.createElement("div");
      row.className = "row";
      const k = document.createElement("span");
      k.className = "k";
      if (r.color) {
        const i = document.createElement("i");
        i.style.borderTopColor = r.color;
        k.appendChild(i);
      }
      k.appendChild(document.createTextNode(r.label));
      const v = document.createElement("strong");
      v.textContent = r.value;
      row.appendChild(k);
      row.appendChild(v);
      tip.appendChild(row);
    });
    tip.classList.add("on");
    const w = tip.offsetWidth, h = tip.offsetHeight;
    let left = x + 14, top = y - h - 10;
    if (left + w > innerWidth - 8) left = x - w - 14;
    if (top < 8) top = y + 14;
    tip.style.left = left + "px";
    tip.style.top = top + "px";
  }
  const hideTip = () => tip.classList.remove("on");

  /* ---------- svg helpers ---------- */
  function el(name, attrs, parent) {
    const n = document.createElementNS(SVGNS, name);
    for (const k in attrs) n.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(n);
    return n;
  }

  function niceMax(v) {
    const p = Math.pow(10, Math.floor(Math.log10(v)));
    for (const m of [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) if (m * p >= v) return m * p;
    return 10 * p;
  }

  /* ---------- KPI tiles ---------- */
  function renderKpis() {
    const { cur, prev } = slices();
    const sum = (arr, k) => arr.reduce((a, d) => a + d[k], 0);
    const avg = (arr, k) => sum(arr, k) / arr.length;

    const defs = [
      { id: "kpiBookings", label: "إجمالي الحجوزات", cur: sum(cur, "bookings"), prev: sum(prev, "bookings"), fmt: fmt, spark: "bookings" },
      { id: "kpiRevenue", label: "الإيرادات (ر.س)", cur: sum(cur, "revenue"), prev: sum(prev, "revenue"), fmt: (v) => compact(v), spark: "revenue" },
      { id: "kpiOcc", label: "متوسط الإشغال", cur: avg(cur, "occupancy"), prev: avg(prev, "occupancy"), fmt: (v) => Math.round(v) + "%", spark: "occupancy" },
      { id: "kpiOnTime", label: "الالتزام بالمواعيد", cur: avg(cur, "onTime"), prev: avg(prev, "onTime"), fmt: (v) => Math.round(v) + "%", spark: "onTime" },
    ];

    defs.forEach((k) => {
      const tile = $("#" + k.id);
      const delta = ((k.cur - k.prev) / k.prev) * 100;
      const up = delta >= 0;
      $(".tile-value", tile).textContent = k.fmt(k.cur);
      const dEl = $(".tile-delta", tile);
      dEl.className = "tile-delta " + (up ? "up" : "down");
      dEl.textContent = "";
      dEl.appendChild(document.createTextNode((up ? "▲ " : "▼ ") + Math.abs(delta).toFixed(1) + "% "));
      const small = document.createElement("small");
      small.textContent = "مقابل الفترة السابقة";
      dEl.appendChild(small);

      // sparkline: 12 points, de-emphasis stroke, accent end-dot
      const sp = $(".tile-spark", tile);
      sp.textContent = "";
      const pts = [];
      const step = Math.max(1, Math.floor(cur.length / 12));
      for (let i = 0; i < cur.length; i += step) pts.push(cur[i][k.spark]);
      const w = 88, h = 28, mn = Math.min(...pts), mx = Math.max(...pts);
      const sx = (i) => (i / (pts.length - 1)) * (w - 6) + 3;
      const sy = (v) => h - 4 - ((v - mn) / (mx - mn || 1)) * (h - 8);
      const dPath = pts.map((v, i) => (i ? "L" : "M") + sx(i).toFixed(1) + "," + sy(v).toFixed(1)).join(" ");
      el("path", { d: dPath, fill: "none", stroke: css("--dim"), "stroke-width": 2, "stroke-linecap": "round", "stroke-linejoin": "round" }, sp);
      el("circle", { cx: sx(pts.length - 1), cy: sy(pts[pts.length - 1]), r: 3.5, fill: css("--brand"), stroke: css("--surface"), "stroke-width": 2 }, sp);
    });
  }

  /* ---------- line chart: bookings, current vs previous period ---------- */
  function renderLine() {
    const { cur, prev } = slices();
    const host = $("#lineChart");
    host.textContent = "";

    const W = host.clientWidth || 640;
    const H = 280, mT = 14, mR = 46, mB = 30, mL = 44;
    const pw = W - mL - mR, ph = H - mT - mB;
    const svg = el("svg", { viewBox: `0 0 ${W} ${H}`, width: "100%", height: H, role: "img", "aria-label": "الحجوزات اليومية: الفترة الحالية مقابل السابقة" }, host);

    const maxV = niceMax(Math.max(...cur.map((d) => d.bookings), ...prev.map((d) => d.bookings)));
    const x = (i) => mL + (i / (cur.length - 1)) * pw;
    const y = (v) => mT + ph - (v / maxV) * ph;

    // grid + y ticks (solid hairlines)
    for (let t = 0; t <= 4; t++) {
      const v = (maxV / 4) * t;
      el("line", { x1: mL, x2: mL + pw, y1: y(v), y2: y(v), class: t === 0 ? "baseline-l" : "gridline" }, svg);
      const tx = el("text", { x: mL - 8, y: y(v) + 4, "text-anchor": "end", class: "axis-text" }, svg);
      tx.textContent = compact(v);
    }
    // x ticks: ~5 date labels
    const ticks = 5;
    for (let t = 0; t < ticks; t++) {
      const i = Math.round((t / (ticks - 1)) * (cur.length - 1));
      const tx = el("text", { x: x(i), y: H - 8, "text-anchor": "middle", class: "axis-text" }, svg);
      tx.textContent = dayLabel(cur[i].date);
    }

    const path = (arr) => arr.map((d, i) => (i ? "L" : "M") + x(i).toFixed(1) + "," + y(d.bookings).toFixed(1)).join(" ");

    // previous period — de-emphasis gray (emphasis form)
    el("path", { d: path(prev.slice(0, cur.length)), fill: "none", stroke: css("--dim"), "stroke-width": 2, "stroke-linecap": "round", "stroke-linejoin": "round" }, svg);
    // current period — series 1, with a 10% area wash
    const s1 = css("--s1");
    el("path", { d: path(cur) + ` L ${x(cur.length - 1)} ${y(0)} L ${x(0)} ${y(0)} Z`, fill: s1, opacity: 0.1 }, svg);
    el("path", { d: path(cur), fill: "none", stroke: s1, "stroke-width": 2, "stroke-linecap": "round", "stroke-linejoin": "round" }, svg);

    // end marker + selective direct label (endpoint only)
    const last = cur[cur.length - 1];
    el("circle", { cx: x(cur.length - 1), cy: y(last.bookings), r: 4.5, fill: s1, stroke: css("--surface"), "stroke-width": 2 }, svg);
    const lbl = el("text", { x: x(cur.length - 1) + 8, y: y(last.bookings) + 4, class: "dlabel" }, svg);
    lbl.textContent = compact(last.bookings);

    // crosshair + hover layer (the crosshair finds the X)
    const cross = el("line", { y1: mT, y2: mT + ph, class: "crosshair", opacity: 0 }, svg);
    const dotCur = el("circle", { r: 4.5, fill: s1, stroke: css("--surface"), "stroke-width": 2, opacity: 0 }, svg);
    const dotPrev = el("circle", { r: 4.5, fill: css("--dim"), stroke: css("--surface"), "stroke-width": 2, opacity: 0 }, svg);
    const hit = el("rect", { x: mL, y: mT, width: pw, height: ph, fill: "transparent" }, svg);

    hit.addEventListener("pointermove", (e) => {
      const r = svg.getBoundingClientRect();
      const px = ((e.clientX - r.left) / r.width) * W;
      const i = Math.max(0, Math.min(cur.length - 1, Math.round(((px - mL) / pw) * (cur.length - 1))));
      const cx = x(i);
      cross.setAttribute("x1", cx); cross.setAttribute("x2", cx); cross.setAttribute("opacity", 1);
      dotCur.setAttribute("cx", cx); dotCur.setAttribute("cy", y(cur[i].bookings)); dotCur.setAttribute("opacity", 1);
      const p = prev[i];
      if (p) { dotPrev.setAttribute("cx", cx); dotPrev.setAttribute("cy", y(p.bookings)); dotPrev.setAttribute("opacity", 1); }
      else dotPrev.setAttribute("opacity", 0);
      const rows = [{ label: "الفترة الحالية", value: fmt(cur[i].bookings), color: s1 }];
      if (p) rows.push({ label: "الفترة السابقة", value: fmt(p.bookings), color: css("--dim") });
      showTip(e.clientX, e.clientY, dayLabel(cur[i].date), rows);
    });
    hit.addEventListener("pointerleave", () => {
      cross.setAttribute("opacity", 0); dotCur.setAttribute("opacity", 0); dotPrev.setAttribute("opacity", 0);
      hideTip();
    });

    // table twin
    const tb = $("#lineTable tbody");
    tb.textContent = "";
    const step = Math.max(1, Math.floor(cur.length / 10));
    for (let i = 0; i < cur.length; i += step) {
      const tr = document.createElement("tr");
      [dayLabel(cur[i].date), fmt(cur[i].bookings), prev[i] ? fmt(prev[i].bookings) : "—"].forEach((v) => {
        const td = document.createElement("td");
        td.textContent = v;
        tr.appendChild(td);
      });
      tb.appendChild(tr);
    }
  }

  /* ---------- bars: top routes (one series → one color) ---------- */
  function renderBars() {
    const { cur } = slices();
    const total = cur.reduce((a, d) => a + d.bookings, 0);
    const host = $("#barChart");
    host.textContent = "";

    const rows = DATA.routes.map((r) => ({ name: r.name, v: Math.round(total * r.share) }));
    const W = host.clientWidth || 380;
    // RTL-native: baseline on the right, bars grow leftward (matches reading direction)
    const barH = 18, gap = 28, mT = 24, mVal = 52;
    const xBase = W - 8;
    const H = mT + rows.length * (barH + gap) - gap + barH;
    const svg = el("svg", { viewBox: `0 0 ${W} ${H}`, width: "100%", height: H, role: "img", "aria-label": "أكثر المسارات حجزاً" }, host);
    const maxV = Math.max(...rows.map((r) => r.v));
    const s1 = css("--s1");

    rows.forEach((r, i) => {
      const yTop = mT + i * (barH + gap);
      const w = Math.max(4, ((xBase - mVal) * r.v) / maxV);
      const name = el("text", { x: xBase, y: yTop - 6, class: "axis-text", "text-anchor": "end", "font-size": 12 }, svg);
      name.textContent = r.name;
      // 4px rounded data-end (left tip), square at the right baseline
      const g = el("g", { class: "bar-rect", tabindex: 0 }, svg);
      el("rect", { x: xBase - w, y: yTop, width: w, height: barH, rx: 4, fill: s1 }, g);
      el("rect", { x: xBase - Math.min(4, w), y: yTop, width: Math.min(4, w), height: barH, fill: s1 }, g);
      const val = el("text", { x: xBase - w - 6, y: yTop + barH - 4, class: "dlabel", "text-anchor": "end" }, svg);
      val.textContent = compact(r.v);

      const over = (e) => showTip(e.clientX || 0, e.clientY || 0, r.name, [{ label: "حجوزات", value: fmt(r.v), color: s1 }]);
      g.addEventListener("pointermove", over);
      g.addEventListener("focus", (e) => { const b = g.getBoundingClientRect(); showTip(b.left + b.width / 2, b.top, r.name, [{ label: "حجوزات", value: fmt(r.v), color: s1 }]); });
      g.addEventListener("pointerleave", hideTip);
      g.addEventListener("blur", hideTip);
    });

    const tb = $("#barTable tbody");
    tb.textContent = "";
    rows.forEach((r) => {
      const tr = document.createElement("tr");
      [r.name, fmt(r.v), ((r.v / total) * 100).toFixed(1) + "%"].forEach((v) => {
        const td = document.createElement("td");
        td.textContent = v;
        tr.appendChild(td);
      });
      tb.appendChild(tr);
    });
  }

  /* ---------- donut: bookings by channel ---------- */
  function renderDonut() {
    const { cur } = slices();
    const total = cur.reduce((a, d) => a + d.bookings, 0);
    const host = $("#donutChart");
    host.textContent = "";

    const S = 190, cx = S / 2, cy = S / 2, R = 78, r = 52;
    const svg = el("svg", { viewBox: `0 0 ${S} ${S}`, width: S, height: S, role: "img", "aria-label": "الحجوزات حسب القناة" }, host);
    const colors = [css("--s1"), css("--s2"), css("--s3"), css("--s4")];
    let a0 = -Math.PI / 2;

    DATA.channels.forEach((c, i) => {
      const v = Math.round(total * c.share);
      const a1 = a0 + c.share * Math.PI * 2;
      const large = a1 - a0 > Math.PI ? 1 : 0;
      const p = (a, rad) => [cx + rad * Math.cos(a), cy + rad * Math.sin(a)];
      const [x0, y0] = p(a0, R), [x1, y1] = p(a1, R), [x2, y2] = p(a1, r), [x3, y3] = p(a0, r);
      const seg = el("path", {
        d: `M ${x0} ${y0} A ${R} ${R} 0 ${large} 1 ${x1} ${y1} L ${x2} ${y2} A ${r} ${r} 0 ${large} 0 ${x3} ${y3} Z`,
        fill: colors[i],
        stroke: css("--surface"),
        "stroke-width": 2, /* the 2px surface gap between fills */
        class: "bar-rect",
        tabindex: 0,
      }, svg);
      const pct = (c.share * 100).toFixed(0) + "%";
      seg.addEventListener("pointermove", (e) => showTip(e.clientX, e.clientY, c.name, [
        { label: "حجوزات", value: fmt(v), color: colors[i] },
        { label: "الحصة", value: pct },
      ]));
      seg.addEventListener("pointerleave", hideTip);
      a0 = a1;
    });

    const t1 = el("text", { x: cx, y: cy - 4, class: "donut-center", "font-size": 22, "font-weight": 800, fill: css("--ink") }, svg);
    t1.textContent = compact(total);
    const t2 = el("text", { x: cx, y: cy + 16, class: "donut-center", "font-size": 11, fill: css("--muted") }, svg);
    t2.textContent = "إجمالي الحجوزات";

    // legend with values (identity never color-alone)
    const lg = $("#donutLegend");
    lg.textContent = "";
    DATA.channels.forEach((c, i) => {
      const row = document.createElement("div");
      row.className = "row";
      const sw = document.createElement("i");
      sw.style.background = colors[i];
      const name = document.createElement("span");
      name.className = "name";
      name.textContent = c.name;
      const val = document.createElement("strong");
      val.textContent = compact(Math.round(total * c.share));
      const pc = document.createElement("small");
      pc.textContent = " (" + (c.share * 100).toFixed(0) + "%)";
      row.append(sw, name, val, pc);
      lg.appendChild(row);
    });
  }

  /* ---------- heatmap: demand by weekday × time ---------- */
  function renderHeat() {
    const host = $("#heatChart");
    host.textContent = "";
    const scale = range / 30; // intensity scales with the window
    const W = host.clientWidth || 640;
    const mL = 64, mT = 6, mB = 24, mR = 6;
    const cols = 12, rowsN = 7;
    const cw = (W - mL - mR) / cols;
    const ch = 26;
    const H = mT + rowsN * ch + mB;
    const svg = el("svg", { viewBox: `0 0 ${W} ${H}`, width: "100%", height: H, role: "img", "aria-label": "كثافة الطلب حسب اليوم والساعة" }, host);

    const ramp = [css("--q1"), css("--q2"), css("--q3"), css("--q4"), css("--q5"), css("--q6"), css("--q7")];
    const flat = DATA.profile.flat();
    const mx = Math.max(...flat), mn = Math.min(...flat);

    for (let d = 0; d < rowsN; d++) {
      const lbl = el("text", { x: mL - 8, y: mT + d * ch + ch / 2 + 4, "text-anchor": "end", class: "axis-text" }, svg);
      lbl.textContent = WEEKDAYS[d];
      for (let b = 0; b < cols; b++) {
        const v = DATA.profile[d][b];
        const norm = (v - mn) / (mx - mn || 1);
        const color = ramp[Math.min(6, Math.floor(norm * 7))];
        const cell = el("rect", {
          x: mL + b * cw + 1, y: mT + d * ch + 1,
          width: cw - 2, height: ch - 2, rx: 4,
          fill: color, class: "heat-cell", tabindex: 0,
        }, svg);
        const shown = Math.round(v * scale);
        const hourLbl = `${String(b * 2).padStart(2, "0")}:00–${String(b * 2 + 2).padStart(2, "0")}:00`;
        cell.addEventListener("pointermove", (e) =>
          showTip(e.clientX, e.clientY, `${WEEKDAYS[d]} · ${hourLbl}`, [{ label: "حجوزات", value: fmt(shown), color }])
        );
        cell.addEventListener("pointerleave", hideTip);
      }
    }
    for (let b = 0; b < cols; b += 2) {
      const tx = el("text", { x: mL + b * cw + cw / 2, y: H - 6, "text-anchor": "middle", class: "axis-text" }, svg);
      tx.textContent = String(b * 2).padStart(2, "0") + ":00";
    }
    $("#heatMin").textContent = fmt(Math.round(mn * scale));
    $("#heatMax").textContent = fmt(Math.round(mx * scale));

    // table twin
    const tb = $("#heatTable tbody");
    tb.textContent = "";
    DATA.profile.forEach((row, d) => {
      const tr = document.createElement("tr");
      const th = document.createElement("td");
      th.textContent = WEEKDAYS[d];
      tr.appendChild(th);
      [0, 3, 6, 9].forEach((b) => {
        const td = document.createElement("td");
        const sum = row.slice(b, b + 3).reduce((a, v) => a + v, 0);
        td.textContent = fmt(Math.round(sum * scale));
        tr.appendChild(td);
      });
      tb.appendChild(tr);
    });
  }

  /* ---------- fleet status (status colors + icon + label) ---------- */
  function renderFleet() {
    const items = [
      { n: 132, label: "باص في الخدمة", tone: "--st-good", icon: "M9 12l2 2 4-4 M12 21a9 9 0 1 1 0-18 9 9 0 0 1 0 18z" },
      { n: 7, label: "رحلات متأخرة", tone: "--st-warn", icon: "M12 7v5l3 3 M12 21a9 9 0 1 1 0-18 9 9 0 0 1 0 18z" },
      { n: 4, label: "في الصيانة", tone: "--st-serious", icon: "M14.7 6.3a4 4 0 0 0-5.4 5.4L4 17v3h3l5.3-5.3a4 4 0 0 0 5.4-5.4l-2.4 2.4-2.3-2.3 2.7-2.1z" },
      { n: 2, label: "خارج الخدمة", tone: "--st-critical", icon: "M15 9l-6 6 M9 9l6 6 M12 21a9 9 0 1 1 0-18 9 9 0 0 1 0 18z" },
    ];
    const host = $("#fleetRow");
    host.textContent = "";
    items.forEach((it) => {
      const chip = document.createElement("div");
      chip.className = "chip";
      const dot = document.createElement("span");
      dot.className = "dot";
      const c = css(it.tone);
      dot.style.background = "color-mix(in srgb, " + c + " 15%, transparent)";
      dot.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="${c}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="${it.icon}"/></svg>`;
      const txt = document.createElement("div");
      txt.className = "txt";
      const strong = document.createElement("strong");
      strong.textContent = fmt(it.n);
      const span = document.createElement("span");
      span.textContent = it.label;
      txt.append(strong, span);
      chip.append(dot, txt);
      host.appendChild(chip);
    });
  }

  /* ---------- recent bookings table ---------- */
  function renderRecent() {
    const tb = $("#recentTable tbody");
    tb.textContent = "";
    DATA.recent.forEach((r) => {
      const tr = document.createElement("tr");
      const cells = [r.id, r.name, r.route, r.time, String(r.seats), fmt(r.amount) + " ر.س"];
      cells.forEach((v) => {
        const td = document.createElement("td");
        td.textContent = v;
        tr.appendChild(td);
      });
      const td = document.createElement("td");
      const pill = document.createElement("span");
      pill.className = "pill " + r.status.key;
      pill.textContent = r.status.label;
      td.appendChild(pill);
      tr.appendChild(td);
      tb.appendChild(tr);
    });
  }

  /* ---------- render all ---------- */
  function render() {
    renderKpis();
    renderLine();
    renderBars();
    renderDonut();
    renderHeat();
    renderFleet();
    renderRecent();
  }

  /* ---------- filter row (scopes everything below) ---------- */
  document.querySelectorAll("#rangeSeg button").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll("#rangeSeg button").forEach((b) => b.setAttribute("aria-pressed", b === btn));
      range = parseInt(btn.dataset.range, 10);
      // refetch keeps the frame: hold previous render dimmed, then swap
      document.querySelectorAll(".chart-body").forEach((c) => c.classList.add("refetching"));
      setTimeout(() => {
        render();
        document.querySelectorAll(".chart-body").forEach((c) => c.classList.remove("refetching"));
      }, 180);
    });
  });

  /* ---------- table-view toggles ---------- */
  document.querySelectorAll(".tbl-toggle").forEach((btn) => {
    btn.addEventListener("click", () => {
      const card = btn.closest(".card");
      const on = !card.classList.contains("show-table");
      card.classList.toggle("show-table", on);
      btn.setAttribute("aria-pressed", on);
      btn.textContent = on ? "رسم" : "جدول";
    });
  });

  /* ---------- responsive re-render (width changes only) ---------- */
  let lastW = innerWidth, resizeT = null;
  addEventListener("resize", () => {
    if (innerWidth === lastW) return;
    lastW = innerWidth;
    clearTimeout(resizeT);
    resizeT = setTimeout(render, 120);
  });

  render();
})();
