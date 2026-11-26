 
import { T, C, V, line, orbit, spline, text, backing, tag, icon, score, fmt, pct, mixData, TAG, STATUS } from '../kit.js';

export const defaults = {
  actual: 16, target: 20, weight: .6, attendance: 1,
  series: [42, 47, 51, 49, 56, 61, 58, 64, 69, 72, 75, 80],
  bars: [62, 74, 58, 81, 69, 77],
  stages: [['استقبال', 'Intake'], ['تحقق', 'Check'], ['تحليل', 'Analyse'], ['قرار', 'Decide'], ['تنفيذ', 'Act'], ['دليل', 'Evidence']],
  ledger: [['حساب المؤشر', 'KPI calculation', 'verified'], ['مسار الموافقة', 'Approval path', 'demonstrated'], ['بيانات العرض', 'Display data', 'simulated'], ['تكامل الأنظمة', 'Systems integration', 'proposed']],
};

export function create(kit, input) {
  const { scene, lang, rtl, li, dir } = kit;
  let cur = Object.assign({}, defaults, input);
  kit.lights({ key: [4 * dir, 9, 7], keyI: 1.4, hemi: .8, points: [[[0, 1.3, -6], C.cyan, 9, 9], [[0, 3.2, -8.6], C.pearl, 6, 8]] });
  scene.add(kit.floor({ center: [0, -5], radius: 13, grid: 1 }));

   
  const mull = kit.std(C.titanium, { metal: .85, rough: .32 });
  const mullGeo = kit.track(new T.BoxGeometry(.07, 3.95, .07));
  for (const side of [-1, 1]) for (let i = 0; i < 5; i++) {
    const z = -9.6 + i * 2.75, pane = kit.slab({ w: 2.6, h: 3.7, d: .05, cut: .05, edgeOpacity: .32, glass: { opacity: .14 } });
    pane.position.set(side * 6.1, 1.95, z); pane.rotation.y = side * Math.PI / 2; scene.add(pane);
    const m = new T.Mesh(mullGeo, mull); m.position.set(side * 6.1, 1.98, z - 1.375); scene.add(m);
  }
  const back = kit.slab({ w: 12.2, h: 3.9, d: .06, cut: .1, edgeOpacity: .28, glass: { opacity: .1 } });
  back.position.set(0, 1.95, -11.2); scene.add(back);
   
  const louver = kit.basic(C.cyanHi, { transparent: true, opacity: kit.lo ? .32 : .22, depthWrite: false, blending: T.AdditiveBlending });
  const lGeo = kit.track(new T.BoxGeometry(.06, .02, 15.5));
  for (let i = -3; i <= 3; i++) { const m = new T.Mesh(lGeo, louver); m.position.set(i * 1.7, 4.25, -3.6); scene.add(m); }

   
  const hub = new T.Group(); hub.position.set(0, .015, -6); scene.add(hub);
  const ring = (r0, r1, color, op) => { const m = kit.mesh(new T.RingGeometry(r0, r1, 96), kit.basic(color, { transparent: true, opacity: op, depthWrite: false, blending: T.AdditiveBlending, side: T.DoubleSide })); m.rotation.x = -Math.PI / 2; hub.add(m); return m; };
  ring(1.12, 1.17, C.cyan, .9); ring(.78, .8, C.cyanHi, .5);
  const tick = ring(1.24, 1.3, C.cyan, .45); tick.geometry.dispose(); tick.geometry = kit.track(new T.RingGeometry(1.24, 1.3, 64, 1, 0, Math.PI * .6));
  hub.add(kit.pool(C.cyan, 2.4, .32));

   
  const P = [
    [[-5.7, -1.2], [-2.2, -1.2], [-2.2, -6], [-1.15, -6]], [[-5.7, -4.1], [-3.4, -4.1], [-3.4, -5.5], [-1.15, -5.5]],
    [[-5.7, -8.4], [-2.6, -8.4], [-2.6, -6.6], [-1.1, -6.4]], [[5.7, -1.2], [2.2, -1.2], [2.2, -6], [1.15, -6]],
    [[5.7, -4.1], [3.4, -4.1], [3.4, -5.5], [1.15, -5.5]], [[5.7, -8.4], [2.6, -8.4], [2.6, -6.6], [1.1, -6.4]],
    [[0, -7.17], [0, -9.3]], [[-.82, -6.6], [-3.2, -7.4]], [[.82, -6.6], [3.2, -7.4]],
  ];
  P.forEach((pts, i) => {
    const out = i >= 6, m = kit.floorPath(pts, { width: out ? .09 : .065, color: i === 2 || i === 4 ? C.blue : C.cyan, speed: out ? 1.1 : .85, gap: out ? 2.2 : 3.4, base: .14, head: 1.2 });
    m.material.uniforms.uTime = { get value() { return kit.u.time.value + i * .37; } };
    scene.add(m);
    if (!out) { const port = kit.glow(C.cyanHi, .42, .8); port.position.set(pts[0][0], .05, pts[0][1]); scene.add(port); }
  });

   
  const main = kit.panel({ w: 4.6, h: 2.6, d: .06, cut: .14, px: kit.hi ? 1280 : kit.lo ? 560 : 900 });
  main.group.position.set(0, 1.78, -9.65); scene.add(main.group);
  const left = kit.panel({ w: 2.6, h: 1.95, d: .05, cut: .1 }), right = kit.panel({ w: 2.6, h: 1.95, d: .05, cut: .1 });
  const first = rtl ? right : left, second = rtl ? left : right;             
  left.group.position.set(-3.75, 1.5, -7.2); left.group.rotation.y = .62;
  right.group.position.set(3.75, 1.5, -7.2); right.group.rotation.y = -.62;
  scene.add(left.group, right.group);
  for (const [x, z, r] of [[0, -9.4, 2.4], [-3.6, -6.9, 1.4], [3.6, -6.9, 1.4]]) { const p = kit.pool(C.cyan, r, .2); p.position.set(x, .02, z); scene.add(p); }

  function paintMain(d) {
    const s = score(d.actual, d.target, d.weight, d.attendance), ratio = d.target > 0 ? Math.round(d.actual / d.target * 100) : null;
    const key = [s, ratio, d.series.map(v => v.toFixed(1)).join()].join('|');
    main.screen.paint((g, L) => {
      const { w, h } = L, x = L.x;
      backing(g, w, h);
      text(g, li ? 'DATA ROOM · WEIGHTED KPI' : 'غرفة البيانات · المؤشر الموزون', x(w * .05), h * .13, { size: h * .05, weight: 600, color: C.cyan, lang, track: '.14em' });
      text(g, s == null ? STATUS.pending.label[li] : pct(s, lang), x(w * .05), h * .42, { size: h * (s == null ? .12 : .23), weight: 600, lang });
      const wt = Math.round(d.weight * 100);
      text(g, s == null ? (li ? 'Target missing: not calculated' : 'المستهدف غير متاح: لا يُحسب') : (li ? `${fmt(d.actual, lang)} of ${fmt(d.target, lang)} at ${wt}/${100 - wt}` : `${fmt(d.actual, lang)} من ${fmt(d.target, lang)} بوزن ${fmt(wt, lang)}/${fmt(100 - wt, lang)}`), x(w * .05), h * .54, { size: h * .055, color: C.muted, lang });
      if (ratio != null) text(g, li ? `ratio ${fmt(d.actual, lang)}/${fmt(d.target, lang)} = ${pct(ratio, lang)}` : `النسبة ${fmt(d.actual, lang)}/${fmt(d.target, lang)} = ${pct(ratio, lang)}`, x(w * .05), h * .63, { size: h * .045, color: C.faint, lang });
      tag(g, L, x(w * .05), h * .86, TAG, { size: h * .042 });
       
      const cx0 = w * .5, cw = w * .44, cy0 = h * .2, ch = h * .58, n = d.series.length, mx = 100;
      g.strokeStyle = 'rgba(175, 194, 213, .18)'; g.lineWidth = 1;
      for (let i = 0; i <= 4; i++) { const y = cy0 + ch * i / 4; g.beginPath(); g.moveTo(x(cx0), y); g.lineTo(x(cx0 + cw), y); g.stroke(); }
      const pt = i => [x(cx0 + cw * i / (n - 1)), cy0 + ch * (1 - d.series[i] / mx)];
      const gr = g.createLinearGradient(0, cy0, 0, cy0 + ch); gr.addColorStop(0, 'rgba(41, 229, 242, .32)'); gr.addColorStop(1, 'rgba(41, 229, 242, 0)');
      g.beginPath(); g.moveTo(x(cx0), cy0 + ch); for (let i = 0; i < n; i++) g.lineTo(...pt(i)); g.lineTo(x(cx0 + cw), cy0 + ch); g.closePath(); g.fillStyle = gr; g.fill();
      g.beginPath(); for (let i = 0; i < n; i++) g[i ? 'lineTo' : 'moveTo'](...pt(i)); g.strokeStyle = C.cyan; g.lineWidth = h * .009; g.lineJoin = 'round'; g.stroke();
      const [ex, ey] = pt(n - 1); g.fillStyle = C.cyanHi; g.beginPath(); g.arc(ex, ey, h * .016, 0, 7); g.fill();
      text(g, fmt(Math.round(d.series[n - 1]), lang), ex, ey - h * .04, { size: h * .045, weight: 600, color: C.pearl, lang, align: 'center' });
      text(g, li ? 'Trend, last 12 periods' : 'الاتجاه، آخر ١٢ فترة', x(cx0 + cw), cy0 + ch + h * .08, { size: h * .042, color: C.faint, lang, align: 'end' });
    }, key);
  }
  function paintBars(d) {
    first.screen.paint((g, L) => {
      const { w, h } = L, x = L.x; backing(g, w, h);
      icon(g, 'data', x(w * .06) - (rtl ? h * .12 : 0), h * .06, h * .12, { rtl });
      text(g, li ? 'Throughput by stage' : 'الإنتاجية حسب المرحلة', x(w * .06 + h * .16), h * .14, { size: h * .065, weight: 600, lang });
      const n = d.bars.length, bw = w * .1, gap = (w * .84 - bw * n) / (n - 1), base = h * .78, top = h * .26;
      d.bars.forEach((v, i) => {
        const bx = x(w * .08 + i * (bw + gap)) - (rtl ? bw : 0), bh = (base - top) * v / 100;
        const gr = g.createLinearGradient(0, base - bh, 0, base); gr.addColorStop(0, C.cyan); gr.addColorStop(1, 'rgba(20, 183, 203, .35)');
        g.fillStyle = gr; g.fillRect(bx, base - bh, bw, bh);
        text(g, fmt(Math.round(v), lang), bx + bw / 2, base - bh - h * .025, { size: h * .05, weight: 600, align: 'center', lang });
        text(g, d.stages[i][li], bx + bw / 2, base + h * .07, { size: h * .045, color: C.muted, align: 'center', lang });
      });
      tag(g, L, x(w * .06), h * .92, TAG, { size: h * .04 });
    }, d.bars.map(v => Math.round(v)).join() + lang);
  }
  function paintLedger(d) {
    second.screen.paint((g, L) => {
      const { w, h } = L, x = L.x; backing(g, w, h);
      icon(g, 'evidence', x(w * .06) - (rtl ? h * .12 : 0), h * .06, h * .12, { rtl, accent: C.gold });
      text(g, li ? 'Evidence ledger' : 'سجل الأدلة', x(w * .06 + h * .16), h * .14, { size: h * .065, weight: 600, lang });
      d.ledger.forEach((r, i) => {
        const y = h * (.32 + i * .15), st = STATUS[r[2]] || STATUS.proposed;
        g.fillStyle = 'rgba(247, 250, 255, .05)'; g.fillRect(w * .05, y - h * .075, w * .9, h * .12);
        text(g, r[li], x(w * .08), y, { size: h * .055, lang });
        text(g, st.mark + ' ' + st.label[li], x(w * .92), y, { size: h * .05, weight: 600, color: st.color, align: 'end', lang });
      });
      tag(g, L, x(w * .06), h * .92, TAG, { size: h * .04 });
    }, lang + d.ledger.map(r => r[2]).join());
  }

  const eye = 1.6;
  return {
    styles: {
      dolly: { dur: 8.5, ease: 'inout', fov: [52, 44], path: line([0, eye + .15, 7.5], [0, eye, -3.4], [0, 1.7, -4], [0, 1.75, -9.6]) },
      orbit: { dur: 9.5, ease: 'emphasized', fov: [50, 46], path: orbit({ c: [0, 1.6, -5.6], r: [10.5, 7.6], az: [-118 * dir, 24 * dir], el: [24, 9], look: [[0, 1.2, -6], [0, 1.6, -7.4]] }) },
      flythrough: { dur: 10, ease: 'inout', fov: [58, 46], path: spline([[0, 13.5, -3.2], [.6 * dir, 8.5, 0], [.3 * dir, 4.6, 2.6], [0, 2.4, 1.2], [0, eye, -2.2]], [[0, 0, -5.4], [0, .4, -6.4], [0, 1.2, -8], [0, 1.6, -9.2], [0, 1.75, -9.6]]) },
    },
    update({ a, data }) {
      cur = Object.assign({}, defaults, data.cur);
      const d = mixData(Object.assign({}, defaults, data.prev), cur, data.k);
      paintMain(d); paintBars(d); paintLedger(d);
      tick.rotation.z = -a * .25;
    },
    debug() { return { kpi: score(cur.actual, cur.target, cur.weight, cur.attendance) }; },
  };
}
