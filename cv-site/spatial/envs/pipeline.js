 
import { T, C, V, line, orbit, spline } from '../kit.js';

export const defaults = { auto: true, autoResult: 'approved', plates: 3 };
const STAGES = [['المدخلات', 'Input', 'inputs'], ['النموذج', 'Model', 'ai'], ['المعالجة', 'Processing', 'automation'], ['القرار', 'Decision', 'decision'], ['الدليل', 'Evidence', 'evidence']];
const ARR = [0, 1.0, 2.4, 3.6];          

export function create(kit, input) {
  const { scene, dir } = kit;
  const D = Object.assign({}, defaults, input);
  kit.lights({ key: [2 * dir, 9, 8], keyI: 1.35, hemi: .75, points: [[[0, 3, -1.5], C.cyan, 6, 10]] });
  scene.add(kit.floor({ center: [0, -3.4], radius: 12 }));
  const Y = 1.25, Z = -3.6, X = i => dir * (-6.4 + i * 3.2), st = i => V(X(i), Y, Z);
  const review = V(X(3) + dir * .2, .5, -1.0);
  STAGES.forEach((s, i) => { const l = kit.label([s[0], s[1]], { size: .3 }); l.position.set(X(i), 2.6, Z); const pl = new T.PointLight(new T.Color(i === 1 ? C.violet : C.cyan), 3.5, 4.5, 2); pl.position.set(X(i) - dir * .6, 2.1, Z + 1.3); scene.add(pl); scene.add(l); const p = kit.pool(C.cyan, 1.3, .22); p.position.set(X(i), .02, Z); scene.add(p); });
  const tagL = kit.label(['سيناريو افتراضي', 'Hypothetical scenario'], { size: .2, color: C.linkRaised, edge: 'rgba(134, 168, 255, .5)' }); tagL.position.set(X(0), .55, Z + 1.4); scene.add(tagL);
   
  for (let k = 0; k < 3; k++) { const d = kit.slab({ w: .82, h: 1.08, d: .025, cut: .07, edgeOpacity: .75 }); d.position.set(X(0) - dir * .14 * k, Y + .04 * k, Z - .16 * k); d.rotation.y = dir * (.25 - k * .08); scene.add(d); }
   
  const mG = new T.Group(); mG.position.copy(st(1)); scene.add(mG);
  const icoGeo = kit.track(new T.IcosahedronGeometry(.7, 1)), ico = new T.Mesh(icoGeo, kit.glassMat({ thickness: .9, rough: .06 }));
  mG.add(ico, kit.edges(icoGeo, C.cyanHi, .6));
  const mGlow = kit.glow(C.violet, 1.3, .7, true); mG.add(mGlow);
  const mLight = new T.PointLight(new T.Color(C.violet), 2, 5, 2); mG.add(mLight);
   
  const pG = new T.Group(); pG.position.copy(st(2)); scene.add(pG);
  const rings = [.78, .62, .47].map((r, k) => { const m = kit.mesh(new T.TorusGeometry(r, .028, 10, 96), kit.std(k === 1 ? C.cyanDeep : C.titanium, { emissive: C.cyan, emissiveIntensity: k === 1 ? .45 : .12, rough: .25, metal: .85 })); pG.add(m); return m; });
   
  const dG = new T.Group(); dG.position.copy(st(3)); scene.add(dG);
  const dia = kit.slab({ w: .95, h: .95, d: .07, cut: .02, edgeOpacity: .85 }); dia.rotation.z = Math.PI / 4; dG.add(dia);
  const dGlow = kit.glow(C.cyan, 1.6, 0); dG.add(dGlow);
   
  const eG = new T.Group(); eG.position.set(X(4), .35, Z); scene.add(eG);
  const plates = []; for (let k = 0; k < 10; k++) { const p = kit.slab({ w: 1.15, h: .78, d: .05, cut: .06, edgeOpacity: .7 }); p.rotation.x = -Math.PI / 2; eG.add(p); plates.push(p); }
  const caret = kit.mesh(new T.ConeGeometry(.09, .2, 3), kit.std(C.gold, { emissive: C.gold, emissiveIntensity: .35, rough: .3, metal: .8 })); caret.rotation.x = Math.PI; eG.add(caret);
  const eGlow = kit.glow(C.gold, 1.6, 0); eG.add(eGlow);
   
  const rv = kit.mesh(new T.RingGeometry(.42, .47, 64), kit.basic(C.linkRaised, { transparent: true, opacity: .7, side: T.DoubleSide, blending: T.AdditiveBlending, depthWrite: false })); rv.rotation.x = -Math.PI / 2; rv.position.set(review.x, .03, review.z); scene.add(rv);
  const rl = kit.label(['قيد المراجعة', 'Under review'], { size: .22, color: C.linkRaised, edge: 'rgba(134, 168, 255, .5)' }); rl.position.set(review.x - dir * .9, .3, review.z + .2); scene.add(rl);
   
  const main = new T.CatmullRomCurve3([st(0), st(1), st(2), st(3)], false, 'catmullrom', 0);
  const toE = new T.QuadraticBezierCurve3(st(3), V(X(3) + dir * 1.6, Y + .1, Z), V(X(4), .62, Z));
  const toR = new T.QuadraticBezierCurve3(st(3), V(X(3) + dir * .3, .8, -2.2), review.clone().add(V(0, .05, 0)));
  scene.add(kit.tube(main, .02, { color: C.cyan, speed: 1.2, gap: 3.2, base: .22 }));
  const gTube = kit.tube(toE, .022, { color: C.gold, speed: 1, gap: 1.5, base: .1, head: .6 }), rTube = kit.tube(toR, .018, { color: C.linkRaised, speed: .9, gap: 1.4, base: .1, head: .6 });
  scene.add(gTube, rTube);
  scene.add(kit.floorPath([[X(0), Z + .9], [X(4), Z + .9]], { width: .06, color: C.cyan, base: .1, speed: 1, gap: 4 }));
  const pk = kit.packets(12, { color: C.cyanHi }), gp = kit.packets(12, { color: C.gold, halo: .42 });
  scene.add(pk.mesh, pk.halos, gp.mesh, gp.halos);

   
  function runs(events) {
    const ins = [], res = [];
    if (D.auto) { ins.push({ id: 'auto', t: .8 }); res.push({ t: 5.2, status: D.autoResult }); }
    for (const e of events) { if (e.type === 'input') ins.push({ id: e.id, t: e.t }); else if (e.type === 'result') res.push({ t: e.t, status: e.detail && e.detail.status === 'review' ? 'review' : 'approved', id: e.id }); }
    return ins.map((r, k) => { const x = res[k]; const go = x ? Math.max(x.t, r.t + ARR[3]) : Infinity; return Object.assign(r, { status: x ? x.status : null, go, end: x ? go + (x.status === 'review' ? 1 : 1.2) : Infinity, resId: x && x.id }); });
  }
  const pulse = (t, at) => t >= at ? Math.exp(-(t - at) * 2.4) : 0;
  const V0 = new T.Vector3();
  return {
    stillAt: D.auto ? 6.6 : 0,
    extraSpan: D.auto ? 7 : 0,
    eventSpan: e => e.type === 'input' ? ARR[3] + .4 : 1.6,
    cues(e, log) {
      const R = runs(log);
      if (e.type === 'input') { const r = R.find(x => x.id === e.id); return r ? STAGES.slice(0, 4).map((s, i) => ({ type: 'stage', stage: s[1].toLowerCase(), at: r.t + ARR[i] })) : []; }
      if (e.type === 'result') { const r = R.find(x => x.resId === e.id); return r ? [{ type: 'stage', stage: r.status === 'review' ? 'review' : 'evidence', at: r.end, input: r.id }] : []; }
      return [];
    },
    styles: {
      dolly: { dur: 9, ease: 'inout', fov: [50, 46], path: line([X(0) - dir * 1.4, 2.1, 2.8], [X(3) + dir * .4, 2.3, 3.4], [X(0) + dir * .6, 1.2, Z], [X(3) + dir * 1.1, 1.0, Z]) },
      orbit: { dur: 9.5, ease: 'emphasized', fov: [50, 48], path: orbit({ c: [0, 1.2, Z], r: [12.5, 10.2], az: [-140 * dir, -12 * dir], el: [28, 15], look: [[0, 1, Z]] }) },
      flythrough: { dur: 10.5, ease: 'inout', fov: [58, 46], path: spline([[X(0) - dir * 2.6, 1.9, -1.2], [X(1) - dir * .4, 2.35, -2.4], [X(2) - dir * 1.1, Y + .02, Z], [X(2) + dir * .7, Y + .02, Z], [X(3) - dir * .4, 2.4, -2.2], [X(3) + dir * .2, 2.5, 1.9]], [[X(1), Y, Z], [X(2), Y, Z], [X(3), Y, Z], [X(3) + dir * 1.2, 1, Z]]) },
    },
    update({ t, a, events }) {
      const R = runs(events);
      let pm = 0, pp = 0, spin = 0, pd = 0, pe = 0, pr = 0, nE = 0, appr = 0, rev = 0;
      R.forEach((r, i) => {
        pm = Math.max(pm, pulse(t, r.t + ARR[1])); pp = Math.max(pp, pulse(t, r.t + ARR[2])); pd = Math.max(pd, pulse(t, r.go), t >= r.t + ARR[3] && t < r.go ? .5 : 0);
        if (t >= r.t + ARR[2]) spin += 1 - Math.exp(-(t - r.t - ARR[2]) * 1.6);
        if (r.status === 'approved' && t >= r.end) { nE++; pe = Math.max(pe, pulse(t, r.end)); }
        if (r.status === 'review' && t >= r.end) pr = Math.max(pr, pulse(t, r.end));
        if (r.status === 'approved' && t >= r.go && t < r.end + .6) appr = 1;
        if (r.status === 'review' && t >= r.go && t < r.end + .6) rev = 1;
        let p = null, gold = false;
        const dt = t - r.t;
        if (dt >= 0 && t < r.go) { const u = Math.min(dt / ARR[3], 1); p = main.getPoint(u, V0); if (dt >= ARR[3]) p.y += .05 * Math.sin(a * 3 + i); }
        else if (t >= r.go && t < r.end) { const u = (t - r.go) / (r.end - r.go); p = (r.status === 'review' ? toR : toE).getPoint(u, V0); gold = r.status === 'approved'; }
        if (i < 12) { pk.set(i, p || V0.set(0, -99, 0), p && !gold ? 1 : 0); gp.set(i, p || V0.set(0, -99, 0), p && gold ? 1 : 0); }
      });
      for (let i = R.length; i < 12; i++) { pk.set(i, V0.set(0, -99, 0), 0); gp.set(i, V0.set(0, -99, 0), 0); }
      pk.commit(); gp.commit();
      ico.rotation.y = a * .15; ico.rotation.x = a * .06;
      mGlow.material.opacity = .55 + pm * .45; mGlow.scale.setScalar(1.3 + pm * .6); mLight.intensity = 2 + pm * 6;
      rings[0].rotation.set(a * .2 + spin * 1.3, a * .1, 0); rings[1].rotation.set(0, a * .25 + spin * 1.7, a * .05); rings[2].rotation.set(a * .12, 0, a * .3 + spin * 2.1);
      dGlow.material.opacity = .22 + pd * .7;
      const count = Math.min(plates.length, D.plates + nE);
      plates.forEach((p, k) => { p.visible = k < count; const drop = k === count - 1 && nE > 0 ? pe * .6 : 0; p.position.y = k * .075 + drop; });
      caret.position.set(0, (count - 1) * .075 + .22 + pe * .6, 0);
      eGlow.material.opacity = pe * .85;
      gTube.material.uniforms.uOp.value = .25 + appr * .75; rTube.material.uniforms.uOp.value = .25 + rev * .75;
      rv.material.opacity = .45 + pr * .55;
      this._last = { runs: R.length, evidence: count, waiting: R.filter(r => t >= r.t + ARR[3] && t < r.go).length };
    },
    debug() { return this._last || null; },
  };
}
