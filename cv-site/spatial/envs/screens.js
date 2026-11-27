 
import { T, C, V, line, orbit, spline, text, backing, tag, icon, score, fmt, pct, mixData, TAG, STATUS, DEG } from '../kit.js';

export const defaults = {
  actual: 16, target: 20, attendance: 1, weights: [.6, .7, .5],
  bars: [62, 74, 58, 81, 69, 77], stages: [['استقبال', 'Intake'], ['تحقق', 'Check'], ['تحليل', 'Analyse'], ['قرار', 'Decide'], ['تنفيذ', 'Act'], ['دليل', 'Evidence']],
  series: [44, 46, 52, 50, 57, 60, 59, 66, 68, 73, 76, 80],
  mix: [55, 30, 15], mixLabels: [['مؤتمت', 'Automated'], ['بمراجعة بشرية', 'Human-reviewed'], ['يدوي', 'Manual']],
};
const MIXC = [C.cyan, C.blue, C.muted];

export function create(kit, input) {
  const { scene, lang, rtl, li, dir } = kit;
  let cur = Object.assign({}, defaults, input);
  const [sweep] = kit.lights({ key: [3 * dir, 8, 8], keyI: 1.3, hemi: .75, points: [[[0, 3, -1], C.cyanHi, 7, 10], [[0, 2.2, -5], C.blue, 4, 8]] });
  scene.add(kit.floor({ center: [0, -2.5], radius: 11 }));
  const O = [0, 1.6, 1.5], arc = (R, th, y) => V(O[0] + R * Math.sin(th * DEG), y, O[2] - R * Math.cos(th * DEG));
  const white = new T.Color('#ffffff'), M = new T.Matrix4(), Q = new T.Quaternion(), S = new T.Vector3(), P = new T.Vector3(), Z = new T.Vector3(0, 0, 1);
  const place = (pn, R, th, y) => { pn.group.position.copy(arc(R, th, y)); pn.group.rotation.y = -th * DEG; scene.add(pn.group); const p = kit.pool(C.cyan, 1.5, .18); p.position.set(pn.group.position.x, .02, pn.group.position.z); scene.add(p); return pn; };
  const sx = (sc, x) => (x / sc.sw + .5) * sc.screen.L.w, sy = (sc, y) => (.5 - y / sc.sh) * sc.screen.L.h;
  const mk = (w, h, R, th, y) => { const pn = kit.panel({ w, h, d: .05, cut: .1 }); pn.sw = w - .12; pn.sh = h - .12; return place(pn, R, th, y); };
  const inst = (n, mat) => { const m = new T.InstancedMesh(kit.track(new T.BoxGeometry(1, 1, 1)), mat, n); m.frustumCulled = false; for (let i = 0; i < n; i++) m.setColorAt(i, white); return m; };
  const glowMat = (emissiveIntensity = .5) => kit.std('#ffffff', { emissive: C.cyanDeep, emissiveIntensity, rough: .3, metal: .1 });

   
  const A = mk(2.9, 1.85, 5.2, -38 * dir, 1.75), B = mk(2.9, 1.85, 5.2, 0, 1.8), Cc = mk(2.9, 1.85, 5.2, 38 * dir, 1.75);
   
  const K = mk(3.3, 2.05, 8.6, -19 * dir, 3.05), E = mk(3.3, 2.05, 8.6, 19 * dir, 3.05);
  [[5.2, -60, 60], [8.6, -30, 30]].forEach(([R, a0, a1], j) => {
    const pts = []; for (let a = a0; a <= a1; a += 4) { const p = arc(R - 1.1, a, 0); pts.push([p.x, p.z]); }
    const m = kit.floorPath(pts, { width: .05, color: j ? C.blue : C.cyan, speed: .7, gap: 4, base: .12 }); scene.add(m);
  });

   
  const nb = defaults.bars.length, bars = inst(nb, glowMat(.45)); A.group.add(bars);
  const shelf = kit.slab({ w: 2.6, h: .34, d: .03, cut: .03, edgeOpacity: .4 }); shelf.rotation.x = -Math.PI / 2; shelf.position.set(0, -.64, .2); A.group.add(shelf);
  const barX = i => dir * (-1.05 + i * .42);
   
  const N = 64, ln = kit.track(new T.BufferGeometry()), lpos = new Float32Array(N * 12), lidx = [];
  for (let i = 0; i < N - 1; i++) for (const o of [0, 2]) { const a = i * 4 + o, b = a + 4; lidx.push(a, b, a + 1, a + 1, b, b + 1); }
  ln.setAttribute('position', new T.BufferAttribute(lpos, 3).setUsage(T.DynamicDrawUsage)); ln.setIndex(lidx);
  const lineMesh = new T.Mesh(ln, kit.basic(C.cyanHi, { side: T.DoubleSide, toneMapped: false })); lineMesh.frustumCulled = false; B.group.add(lineMesh);
  const ar = kit.track(new T.BufferGeometry()), apos = new Float32Array(N * 6), acol = new Float32Array(N * 6), aidx = [];
  for (let i = 0; i < N - 1; i++) { const a = i * 2; aidx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
  const cy = new T.Color(C.cyan).multiplyScalar(.42);
  for (let i = 0; i < N; i++) acol.set([0, 0, 0, cy.r, cy.g, cy.b], i * 6);
  ar.setAttribute('position', new T.BufferAttribute(apos, 3).setUsage(T.DynamicDrawUsage)); ar.setAttribute('color', new T.BufferAttribute(acol, 3)); ar.setIndex(aidx);
  const area = new T.Mesh(ar, kit.basic('#ffffff', { vertexColors: true, transparent: true, depthWrite: false, blending: T.AdditiveBlending, side: T.DoubleSide })); area.frustumCulled = false; B.group.add(area);
  const ns = defaults.series.length, marks = new T.InstancedMesh(kit.track(new T.SphereGeometry(.03, 10, 8)), kit.basic(C.pearl, { toneMapped: false }), ns); marks.frustumCulled = false; B.group.add(marks);
  const headGlow = kit.glow(C.cyan, .34, .9); B.group.add(headGlow);
  const LX = x => dir * x, LY = v => -.56 + v / 100 * 1.08, LZ = .16;
   
  const NSEG = 72, ring = inst(NSEG, glowMat(.35)); ring.position.set(LX(-.55), -.04, .12); Cc.group.add(ring);
   
  const NG = 54, gauge = inst(NG, glowMat(.5)); gauge.position.set(LX(-.62), -.08, .12); K.group.add(gauge);
   
  const cmp = inst(3, glowMat(.45)); E.group.add(cmp);
  const ringCol = MIXC.map(c => new T.Color(c)), dim = new T.Color(C.titanium).multiplyScalar(1.6), cyanC = new T.Color(C.cyan), hiC = new T.Color(C.cyanHi);

  function catmull(s, u) { const i = Math.floor(u), t = u - i, g = k => s[Math.max(0, Math.min(s.length - 1, k))]; const p0 = g(i - 1), p1 = g(i), p2 = g(i + 1), p3 = g(i + 2); return .5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (-p0 + 3 * p1 - 3 * p2 + p3) * t * t * t); }
  function seg(m, i, x, y, z, rot, w, h, d, col) { P.set(x, y, z); Q.setFromAxisAngle(Z, rot); S.set(w, h, d); M.compose(P, Q, S); m.setMatrixAt(i, M); if (col) m.setColorAt(i, col); }

  function drawBars(d) {
    d.bars.forEach((v, i) => { const h = Math.max(.005, v / 100 * 1.05); seg(bars, i, barX(i), -.62 + h / 2, .22, 0, .26, h, .2, i === d.bars.indexOf(Math.max(...d.bars)) ? hiC : cyanC); });
    bars.instanceMatrix.needsUpdate = true; bars.instanceColor.needsUpdate = true;
    A.screen.paint((g, L) => {
      const { w, h } = L; backing(g, w, h, { top: .78, bottom: .7 });
      icon(g, 'data', L.x(w * .05) - (rtl ? h * .11 : 0), h * .06, h * .11, { rtl });
      text(g, li ? 'Throughput by stage' : 'الإنتاجية حسب المرحلة', L.x(w * .05 + h * .15), h * .135, { size: h * .065, weight: 600, lang });
      d.bars.forEach((v, i) => { const x = sx(A, barX(i)); text(g, fmt(Math.round(v), lang), x, h * .86, { size: h * .06, weight: 600, align: 'center', lang }); text(g, d.stages[i][li], x, h * .94, { size: h * .042, color: C.muted, align: 'center', lang }); });
      tag(g, L, L.x(w * .05), h * .24, TAG, { size: h * .038 });
    }, d.bars.map(Math.round).join() + lang);
  }
  function drawLine(d) {
    const s = d.series, m = s.length;
    for (let i = 0; i < N; i++) {
      const u = i / (N - 1) * (m - 1), v = Math.max(0, Math.min(100, catmull(s, u))), x = LX(-1.22 + 2.44 * i / (N - 1)), y = LY(v);
      lpos.set([x, y - .022, LZ, x, y + .022, LZ, x, y + .022, LZ - .05, x, y + .022, LZ + .05], i * 12);
      apos.set([x, LY(0), LZ, x, y, LZ], i * 6);
    }
    ln.attributes.position.needsUpdate = true; ar.attributes.position.needsUpdate = true;
    for (let i = 0; i < m; i++) seg(marks, i, LX(-1.22 + 2.44 * i / (m - 1)), LY(s[i]), LZ, 0, i === m - 1 ? 1.7 : 1, i === m - 1 ? 1.7 : 1, 1);
    marks.instanceMatrix.needsUpdate = true;
    headGlow.position.set(LX(1.22), LY(s[m - 1]), LZ + .02);
    B.screen.paint((g, L) => {
      const { w, h } = L; backing(g, w, h, { top: .78, bottom: .7 });
      text(g, li ? 'Trend, last 12 periods' : 'الاتجاه، آخر ١٢ فترة', L.x(w * .05), h * .135, { size: h * .065, weight: 600, lang });
      g.strokeStyle = 'rgba(175, 194, 213, .16)'; g.lineWidth = 1;
      for (let k = 0; k <= 4; k++) { const y = sy(B, LY(k * 25)); g.beginPath(); g.moveTo(w * .04, y); g.lineTo(w * .96, y); g.stroke(); text(g, fmt(k * 25, lang), L.x(w * .035), y - h * .012, { size: h * .036, color: C.faint, lang, align: 'end' }); }
      text(g, fmt(Math.round(s[m - 1]), lang), sx(B, LX(1.22)), sy(B, LY(s[m - 1])) - h * .07, { size: h * .07, weight: 600, align: 'center', lang });
      tag(g, L, L.x(w * .05), h * .93, TAG, { size: h * .038 });
    }, s.map(v => v.toFixed(1)).join() + lang);
  }
  function drawRing(d) {
    const tot = d.mix.reduce((a, b) => a + b, 0) || 1, cum = []; let c = 0; for (const v of d.mix) cum.push(c += v / tot);
    for (let i = 0; i < NSEG; i++) {
      const f = (i + .5) / NSEG; let k = cum.findIndex(x => f < x); if (k < 0) k = d.mix.length - 1;
      const edge = cum.some(x => Math.abs(f - x) < .5 / NSEG + 1e-6 && x < 1 - 1e-6) || (f < .5 / NSEG + 1e-6), ang = Math.PI / 2 - dir * f * Math.PI * 2;
      const depth = [.16, .1, .06][k] || .06;
      seg(ring, i, Math.cos(ang) * .58, Math.sin(ang) * .58, depth / 2, ang, edge ? 0 : .044, edge ? 0 : .15, edge ? 0 : depth, ringCol[k]);
    }
    ring.instanceMatrix.needsUpdate = true; ring.instanceColor.needsUpdate = true;
    const shares = d.mix.map(v => Math.round(v / tot * 100));
    Cc.screen.paint((g, L) => {
      const { w, h } = L; backing(g, w, h, { top: .78, bottom: .7 });
      text(g, li ? 'Decision mix' : 'مزيج القرارات', L.x(w * .05), h * .135, { size: h * .065, weight: 600, lang });
      const cx = sx(Cc, LX(-.55)), cyy = sy(Cc, -.04);
      text(g, pct(shares[0], lang), cx, cyy + h * .03, { size: h * .1, weight: 600, align: 'center', lang });
      d.mixLabels.forEach((lb, i) => { const y = h * (.4 + i * .14); g.fillStyle = MIXC[i]; g.fillRect(L.x(w * .58) - (rtl ? h * .05 : 0), y - h * .045, h * .05, h * .05); text(g, lb[li], L.x(w * .58 + h * .08), y, { size: h * .05, lang }); text(g, pct(shares[i], lang), L.x(w * .95), y, { size: h * .05, weight: 600, lang, align: 'end' }); });
      tag(g, L, L.x(w * .05), h * .93, TAG, { size: h * .038 });
    }, shares.join() + lang);
  }
  function drawKpi(d) {
    const s = score(d.actual, d.target, d.weights[0], d.attendance), p = s == null ? 0 : s / 100;
    for (let i = 0; i < NG; i++) {
      const f = (i + .5) / NG, on = f < p, ang = (225 - f * 270) * DEG * 1;
      const a = dir > 0 ? ang : Math.PI - ang;
      seg(gauge, i, Math.cos(a) * .62, Math.sin(a) * .62, on ? .07 : .025, a + Math.PI / 2, .055, .13, on ? .14 : .05, on ? cyanC : dim);
    }
    gauge.instanceMatrix.needsUpdate = true; gauge.instanceColor.needsUpdate = true;
    const wt = Math.round(d.weights[0] * 100);
    K.screen.paint((g, L) => {
      const { w, h } = L; backing(g, w, h, { top: .8, bottom: .72 });
      text(g, li ? 'Weighted KPI' : 'المؤشر الموزون', L.x(w * .05), h * .13, { size: h * .065, weight: 600, lang });
      const cx = sx(K, LX(-.62)), cyy = sy(K, -.08);
      text(g, s == null ? STATUS.pending.label[li] : pct(s, lang), cx, cyy + h * .04, { size: h * (s == null ? .065 : .12), weight: 600, align: 'center', lang });
      const x0 = L.x(w * .56);
      const lines = s == null ? [li ? 'Target missing or zero:' : 'المستهدف مفقود أو صفري:', li ? 'not calculated, not approved' : 'لا يُحسب ولا يُعتمد']
        : [li ? `(${fmt(d.actual, lang)} ÷ ${fmt(d.target, lang)}) × ${fmt(d.weights[0], lang, 1)}` : `(${fmt(d.actual, lang)} ÷ ${fmt(d.target, lang)}) × ${fmt(d.weights[0], lang, 1)}`,
          li ? `+ ${fmt(d.attendance, lang)} × ${fmt(1 - d.weights[0], lang, 1)}` : `+ ${fmt(d.attendance, lang)} × ${fmt(1 - d.weights[0], lang, 1)}`,
          li ? `weight ${wt}/${100 - wt}` : `الوزن ${fmt(wt, lang)}/${fmt(100 - wt, lang)}`];
      lines.forEach((t, i) => text(g, t, x0, h * (.36 + i * .12), { size: h * .055, color: i ? C.muted : C.pearl, lang }));
      tag(g, L, L.x(w * .05), h * .92, TAG, { size: h * .036 });
    }, [s, d.actual, d.target, wt, lang].join());
    return s;
  }
  function drawCompare(d) {
    const sc = d.weights.map(wt => score(d.actual, d.target, wt, d.attendance));
    sc.forEach((s, i) => { const L = (s || 0) / 100 * 1.5, x0 = LX(-.95); seg(cmp, i, x0 + dir * L / 2, .25 - i * .38, .14, 0, Math.max(.001, L), .16, .12, i ? cyanC : hiC); });
    cmp.instanceMatrix.needsUpdate = true; cmp.instanceColor.needsUpdate = true;
    E.screen.paint((g, L) => {
      const { w, h } = L; backing(g, w, h, { top: .8, bottom: .72 });
      text(g, li ? 'Same inputs, three weights' : 'المدخلات نفسها بثلاثة أوزان', L.x(w * .05), h * .13, { size: h * .065, weight: 600, lang });
      d.weights.forEach((wt, i) => {
        const y = sy(E, .25 - i * .38), p = Math.round(wt * 100);
        text(g, li ? `${p}/${100 - p}` : `${fmt(p, lang)}/${fmt(100 - p, lang)}`, L.x(w * .04), y - h * .085, { size: h * .045, color: C.muted, lang });
        text(g, sc[i] == null ? STATUS.pending.label[li] : pct(sc[i], lang), L.x(w * .95), y + h * .02, { size: h * .06, weight: 600, lang, align: 'end' });
      });
      tag(g, L, L.x(w * .05), h * .92, TAG, { size: h * .036 });
    }, sc.join() + d.weights.join() + lang);
    return sc;
  }

  const front = arc(5.2, 0, 1.8), kp = arc(8.6, -19 * dir, 3.05), nK = V(O[0] - kp.x, 0, O[2] - kp.z).normalize(), gap = arc(5.2, -19 * dir, 1.75);
  let last = {};
  return {
    styles: {
      dolly: { dur: 8.5, ease: 'inout', fov: [52, 47], path: line([0, 2.2, 10.5], [0, 1.85, 4.6], [0, 1.6, -3], [front.x, 2.0, front.z]) },
      orbit: { dur: 9.5, ease: 'emphasized', fov: [50, 46], path: orbit({ c: [0, 2.0, -3.4], r: [11, 8.2], az: [-128 * dir, -14 * dir], el: [24, 8], look: [[0, 1.6, -3.4], [0, 2.0, -3.8]] }) },
      flythrough: { dur: 10, ease: 'inout', fov: [56, 44], path: spline([[0, 2.6, 9], [-.4 * dir, 2.1, 3.4], [gap.x * .8, 1.9, gap.z + .9], [gap.x, 1.95, gap.z - .3], [kp.x + nK.x * 2.7, 2.85, kp.z + nK.z * 2.7]], [[0, 1.8, -3.7], [gap.x * .6, 1.8, gap.z - 1], [gap.x, 2.4, gap.z - 2.2], [kp.x, 2.95, kp.z]]) },
    },
    update({ a, data }) {
      cur = Object.assign({}, defaults, data.cur);
      const d = mixData(Object.assign({}, defaults, data.prev), cur, data.k);
      drawBars(d); drawLine(d); drawRing(d);
      last = { kpi: drawKpi(d), compare: drawCompare(d) };
      headGlow.material.opacity = .65 + .3 * Math.sin(a * 2.4);
      if (sweep) sweep.position.set(Math.sin(a * .35) * 4.5, 3, -1 - Math.cos(a * .35) * 2);
    },
    debug() { return { kpi: score(cur.actual, cur.target, cur.weights[0], cur.attendance), compare: cur.weights.map(w => score(cur.actual, cur.target, w, cur.attendance)), shown: last }; },
  };
}
