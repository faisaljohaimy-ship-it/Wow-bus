 
import { T, C, V, line, orbit, spline } from '../kit.js';

export const defaults = {
  sources: [['مستندات', 'Documents'], ['قواعد بيانات', 'Databases'], ['واجهات برمجية', 'APIs'], ['نماذج إدخال', 'Web forms']],
  agents: 3, packets: 12, period: 9, approvalEvery: 1.5,
};

export function create(kit, input) {
  const { scene, rtl, li, dir } = kit;
  const D = Object.assign({}, defaults, input), NS = Math.min(6, D.sources.length);
  kit.lights({ key: [3 * dir, 9, 7], keyI: 1.3, hemi: .7, points: [[[0, 2.4, -2.6], C.cyan, 7, 9]] });
  scene.add(kit.floor({ center: [0, -4], radius: 12 }));
  const core = V(0, 1.75, -4.2), appr = V(3.7 * dir, 1.75, -3.3), out = V(6.6 * dir, 1.5, -2.3);
  const src = Array.from({ length: NS }, (_, k) => V(dir * (-5.6 + .35 * Math.sin(k * 1.7)), 2.75 - k * .58, -6.1 + k * 1.2));

   
  const coreGeo = kit.track(new T.IcosahedronGeometry(.72, 0)), coreG = new T.Group(); coreG.position.copy(core); scene.add(coreG);
  const crystal = new T.Mesh(coreGeo, kit.glassMat({ thickness: .9, rough: .08 })); coreG.add(crystal, kit.edges(coreGeo, C.cyanHi, .8));
  const inner = kit.glow(C.violet, 1.3, .85, true); coreG.add(inner);
  const vLight = new T.PointLight(new T.Color(C.violet), 3, 5, 2); coreG.add(vLight);
  coreG.add(kit.label(['النموذج', 'Model'], { size: .3, sub: ['وكلاء في مدارات', 'agents in orbit'] })); coreG.children[coreG.children.length - 1].position.set(0, 1.25, 0);
   
  const NA = Math.min(5, D.agents), orbits = [];
  for (let k = 0; k < NA; k++) {
    const r = 1.45 + k * .55, tilt = [.28, -.42, .62, -.18, .5][k], yaw = k * 1.1;
    const g = new T.Group(); g.rotation.set(tilt, yaw, 0); coreG.add(g);
    const ring = kit.mesh(new T.TorusGeometry(r, .007, 4, 160), kit.basic(C.cyanHi, { transparent: true, opacity: .45, depthWrite: false, blending: T.AdditiveBlending }));
    ring.rotation.x = Math.PI / 2; g.add(ring);
    const agent = kit.mesh(new T.OctahedronGeometry(.12, 0), kit.std(C.pearl, { emissive: C.cyan, emissiveIntensity: .55, rough: .2, metal: .2 }));
    const halo = kit.glow(C.cyan, .5, .7); g.add(agent, halo);
    orbits.push({ r, agent, halo, w: [.42, -.33, .27, -.22, .3][k], ph: k * 2.1 });
  }
   
  src.forEach((p, k) => {
    const g = kit.mesh(new T.SphereGeometry(.2, 24, 16), kit.glassMat({ thickness: .4 })); g.position.copy(p); scene.add(g);
    const h = kit.glow(C.cyanHi, .7, .6); h.position.copy(p); scene.add(h);
    const lb = kit.label(D.sources[k], { size: .22 }); lb.position.copy(p).add(V(-dir * .2, .36, 0)); scene.add(lb);
  });
   
  const ag = new T.Group(); ag.position.copy(appr); ag.rotation.y = -dir * .5; scene.add(ag);
  const goldMat = kit.std(C.gold, { emissive: C.gold, emissiveIntensity: .15, rough: .25, metal: .9 });
  const portal = kit.mesh(new T.TorusGeometry(.62, .045, 12, 96), goldMat); ag.add(portal);
  const disc = kit.mesh(new T.CircleGeometry(.58, 64), kit.glassMat({ thickness: .2, rough: .3 })); ag.add(disc);
  const pc = document.createElement('canvas'); pc.width = pc.height = 128; const pg = pc.getContext('2d');
  pg.strokeStyle = C.gold; pg.lineWidth = 7; pg.lineCap = 'round'; pg.beginPath(); pg.arc(64, 44, 18, 0, 7); pg.stroke(); pg.beginPath(); pg.arc(64, 112, 40, Math.PI * 1.15, Math.PI * 1.85); pg.stroke();
  const pt = kit.track(new T.CanvasTexture(pc)); pt.colorSpace = T.SRGBColorSpace;
  const person = new T.Sprite(kit.track(new T.SpriteMaterial({ map: pt, transparent: true, depthWrite: false, toneMapped: false }))); person.scale.set(.55, .55, 1); ag.add(person);
  const gateGlow = kit.glow(C.gold, 2.2, 0); ag.add(gateGlow);
  const al = kit.label(['موافقة بشرية', 'Human approval'], { size: .3, edge: 'rgba(232, 188, 120, .6)', sub: ['لا إجراء دون موافقة', 'no action without approval'] }); al.position.set(0, 1.05, 0); ag.add(al);
   
  const ex = kit.slab({ w: .9, h: .62, d: .08, cut: .08, edge: C.gold, edgeOpacity: .45 }); ex.position.copy(out); ex.rotation.y = -dir * .7; scene.add(ex);
  const xl = kit.label(['إجراء معتمد', 'Approved action'], { size: .24 }); xl.position.copy(out).add(V(0, .7, 0)); scene.add(xl);

   
  const curve = (a, b, lift) => { const m = a.clone().lerp(b, .5); m.y += lift; return new T.QuadraticBezierCurve3(a.clone(), m, b.clone()); };
  const toCore = src.map(p => curve(p, core.clone().add(p.clone().sub(core).setLength(.78)), .5));
  const cOut = core.clone().add(appr.clone().sub(core).setLength(.8)), aIn = appr.clone().add(V(-dir * .1, 0, 0));
  const toAppr = curve(cOut, aIn, .35), toOut = curve(appr.clone().add(V(dir * .15, 0, 0)), out.clone().add(V(-dir * .45, 0, 0)), .25);
  toCore.forEach((c, k) => scene.add(kit.tube(c, .016, { color: k % 2 ? C.blue : C.cyan, speed: .9, gap: 2.2, base: .22 })));
  scene.add(kit.tube(toAppr, .02, { color: C.cyan, speed: 1, gap: 1.6, base: .28 }));
  const goldPath = kit.tube(toOut, .022, { color: C.gold, speed: .8, gap: 1.4, base: .18, head: 1 }); scene.add(goldPath);
  const fp = kit.floorPath([[src[1].x, src[1].z + .8], [core.x, core.z + 1.2], [appr.x, appr.z + 1], [out.x, out.z + .9]], { width: .05, color: C.cyan, base: .1, r: 1.2 }); scene.add(fp);

   
  const NP = Math.min(24, D.packets), pk = kit.packets(NP, { color: C.cyanHi }), gk = kit.packets(NP, { color: C.gold, halo: .4 });
  scene.add(pk.mesh, pk.halos, gk.mesh, gk.halos);
  const V0 = new T.Vector3();
  let G = D.approvalEvery;
  const release = A => Math.ceil((A - .5) / G) * G + .5;
  return {
    styles: {
      dolly: { dur: 9, ease: 'inout', fov: [50, 46], path: line([-6.8 * dir, 2.4, 4.4], [1.5 * dir, 2.15, 4.6], [-4.6 * dir, 1.9, -4.6], [1.6 * dir, 1.75, -3.6]) },
      orbit: { dur: 9.5, ease: 'emphasized', fov: [48, 46], path: orbit({ c: [core.x, 1.8, core.z], r: [9.5, 7.4], az: [150 * dir, 14 * dir], el: [20, 9], look: [[0, 1.75, -4.2], [1.4 * dir, 1.7, -3.7]] }) },
      flythrough: { dur: 10.5, ease: 'inout', fov: [60, 48], path: spline([[-.6 * dir, .45, 2.2], [.3 * dir, 1.0, -1.4], [1.2 * dir, 2.3, -2.2], [1.6 * dir, 4.6, .2], [.9 * dir, 6.6, 3.6]], [[0, 1.8, -4.2], [0, 2.2, -4.2], [.4 * dir, 1.9, -4.2], [.9 * dir, 1.5, -3.9]]) },
    },
    update({ a, data }) {
      G = Math.max(.5, +(data.cur.approvalEvery ?? D.approvalEvery) || 1.5);
      inner.material.opacity = .75 + .15 * Math.sin(a * 1.3);
      crystal.rotation.y = a * .12; crystal.rotation.x = a * .05;
      for (const o of orbits) { const ang = o.ph + a * o.w; o.agent.position.set(Math.cos(ang) * o.r, 0, Math.sin(ang) * o.r); o.agent.rotation.y = a; o.halo.position.copy(o.agent.position); }
      let flash = 0; const last = release(a) - G; if (a >= last && last >= .5) flash = Math.exp(-(a - last) * 3);
      gateGlow.material.opacity = flash * .9; goldMat.emissiveIntensity = .15 + flash * 1.2;
      const P = D.period;
      for (let i = 0; i < NP; i++) {
        const k = i % NS, tau = ((a - i * P / NP) % P + P) % P, A = a - tau + 3.2, R = release(A);
        let p = null, gold = false, s = 1;
        if (a - i * P / NP < 0) p = null;
        else if (tau < 1.8) p = toCore[k].getPoint(tau / 1.8, V0);
        else if (tau < 2.0) { p = core; s = 0; }
        else if (tau < 3.2) p = toAppr.getPoint((tau - 2) / 1.2, V0);
        else if (a < R) { p = V0.copy(aIn).add(V(0, ((i % 3) - 1) * .16, 0)); }
        else if (a < R + 1.2) { p = toOut.getPoint((a - R) / 1.2, V0); gold = true; }
        pk.set(i, p || V0.set(0, -99, 0), p && !gold ? s : 0); gk.set(i, p || V0.set(0, -99, 0), p && gold ? 1 : 0);
      }
      pk.commit(); gk.commit();
    },
    debug(t) { return { sources: NS, agents: NA, approvalEvery: G }; },
  };
}
