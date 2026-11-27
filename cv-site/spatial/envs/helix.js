 
import { T, C, V, line, orbit, spline, text, backing, icon, fmt, ease, clamp01 } from '../kit.js';

export const defaults = {
  items: [['هندسة الأنظمة', 'Systems engineering', 'systems'], ['معمارية الذكاء الاصطناعي', 'AI architecture', 'architecture'], ['النماذج والوكلاء', 'Models & agents', 'agents'],
    ['أدوات المطورين', 'Developer tools', 'code'], ['الأتمتة', 'Automation', 'automation'], ['الأمن', 'Security', 'security'],
    ['البيانات والتحليلات', 'Data & analytics', 'data'], ['البنية السحابية', 'Cloud infrastructure', 'cloud'], ['الأدلة', 'Evidence', 'evidence']],
  order: null,
};
const AX = V(0, 1.95, -4.2), PW = 1.55, PH = .98;

export function create(kit, input) {
  const { scene, lang, rtl, li, dir } = kit;
  const n = 9;
  kit.lights({ key: [3 * dir, 9, 7], keyI: 1.4, hemi: .75, points: [[[0, 3.4, -1.6], C.cyan, 6, 9], [[0, .6, -4.2], C.blue, 3, 6]] });
  scene.add(kit.floor({ center: [AX.x, AX.z], radius: 10 }));
  const pts = []; for (let a = 0; a <= 360; a += 6) pts.push([AX.x + Math.sin(a * Math.PI / 180) * 2.9, AX.z + Math.cos(a * Math.PI / 180) * 2.9]);
  scene.add(kit.floorPath(pts, { width: .05, color: C.cyan, speed: .6, gap: 3, base: .12, r: .1 }));
  const axisGlow = kit.pool(C.cyan, 1.6, .3); axisGlow.position.set(AX.x, .02, AX.z); scene.add(axisGlow);
  const panels = [];
  for (let i = 0; i < n; i++) { const p = kit.panel({ w: PW, h: PH, d: .045, cut: .09, px: kit.hi ? 640 : kit.lo ? 300 : 460 }); scene.add(p.group); panels.push(p); }
  function paint(i, item, idx) {
    panels[i].screen.paint((g, L) => {
      const { w, h } = L; backing(g, w, h, { top: .86, bottom: .78 });
      icon(g, item[2], L.x(w * .07) - (rtl ? h * .3 : 0), h * .1, h * .3, { rtl });
      text(g, fmt(idx + 1, lang).padStart(2, li ? '0' : '٠'), L.x(w * .93), h * .2, { size: h * .1, color: C.cyan, align: 'end', lang, mono: li === 1 });
      text(g, item[li], L.x(w * .07), h * .66, { size: h * (item[li].length > 18 ? .1 : .12), weight: 600, lang, max: w * .86 });
      g.fillStyle = C.cyan; g.fillRect(rtl ? w * .93 - w * .16 : w * .07, h * .76, w * .16, h * .012);
    }, item[li] + idx + lang);
  }
   
  const yawQ = y => new T.Quaternion().setFromAxisAngle(V(0, 1, 0), y);
  const stack = i => ({ p: V(AX.x + (i - 4) * .02 * dir, 1.55 + i * .022, AX.z + 1.2 - i * .075), q: new T.Quaternion().setFromEuler(new T.Euler(-.12, (i - 4) * .035 * dir, 0)) });
  const helix = i => { const th = (i * 40 + 20) * Math.PI / 180 * dir; return { p: V(AX.x + Math.sin(th) * 2.5, .6 + i * .34, AX.z + Math.cos(th) * 2.5), q: yawQ(th) }; };
  const wall = s => ({ p: V(AX.x + dir * ((s % 3) - 1) * 1.72, 3.05 - Math.floor(s / 3) * 1.12, AX.z), q: yawQ(0) });
  const cyl = p => ({ r: Math.hypot(p.x - AX.x, p.z - AX.z), th: Math.atan2(p.x - AX.x, p.z - AX.z), y: p.y });
  const tmpQ = new T.Quaternion();
   
  function move(A, B, k, turns, bulge, obj) {
    const a = cyl(A.p), b = cyl(B.p);
    let dth = b.th - a.th; while (dth > Math.PI) dth -= 2 * Math.PI; while (dth < -Math.PI) dth += 2 * Math.PI;
    const extra = turns * 2 * Math.PI * dir, th = a.th + (dth + extra) * k, r = a.r + (b.r - a.r) * k + bulge * Math.sin(Math.PI * k);
    obj.position.set(AX.x + Math.sin(th) * r, a.y + (b.y - a.y) * k + .35 * Math.sin(Math.PI * k), AX.z + Math.cos(th) * r);
    tmpQ.slerpQuaternions(A.q, B.q, k); obj.quaternion.copy(yawQ(extra * k)).multiply(tmpQ);
  }
  const seq = {   
    dolly: [['stack', 'helix', 1, 2.4, .12, 0, .5], ['helix', 'wall', 5, 2.6, .1, 0, .9]],
    orbit: [['stack', 'helix', .6, 2.4, .12, 0, .5], ['helix', 'wall', 4.8, 2.8, .12, 0, .9]],
    flythrough: [['wall', 'helix', 1, 2.6, .1, 0, .6], ['helix', 'wall', 6.6, 2.8, .1, 1, .9]],
  };
  const slotsOf = order => { const s = Array.from({ length: n }, (_, i) => i); if (Array.isArray(order) && order.length === n) order.forEach((item, slot) => { s[item] = slot; }); return s; };
  const at = (name, i, slots) => name === 'stack' ? stack(slots[i]) : name === 'helix' ? helix(slots[i]) : wall(slots[i]);
  let shown = null;
  return {
    dataSpan: 2.6,
    styles: {
      dolly: { dur: 9, ease: 'inout', fov: [50, 46], path: line([0, 2.6, 7.2], [0, 1.95, .9], [0, 1.9, -4.2], [0, 1.95, -4.2]) },
      orbit: { dur: 9.5, ease: 'emphasized', fov: [50, 46], path: orbit({ c: [AX.x, 2.1, AX.z], r: [8.5, 5.2], az: [140 * dir, 0], el: [26, 2], look: [[0, 1.9, -4.2]] }) },
      flythrough: { dur: 11, ease: 'inout', fov: [60, 46], path: spline([[0, 2.2, 6.4], [0, 1.1, -1.2], [.05, 1.0, -4.0], [.1 * dir, 3.4, -4.3], [0, 4.4, -1.6], [0, 1.95, 1.1]], [[0, 1.6, -4.2], [0, 1.2, -7], [.2 * dir, 3.5, -7.5], [0, 2.4, -4.2], [0, 1.95, -4.2]]) },
    },
    update({ t, a, data, style }) {
      const items = (data.cur.items || defaults.items).slice(0, n), cur = slotsOf(data.cur.order), prev = slotsOf(data.prev.order);
      const changed = data.n > 0 && data.u < 1 && cur.join() !== prev.join();
      const slots = changed ? prev : cur, st = seq[style.id], tau = style.dt;
      for (let i = 0; i < n; i++) {
        const it = items[i] || defaults.items[i]; paint(i, it, cur[i]);
        const obj = panels[i].group;
        let placed = false;
        for (let j = st.length - 1; j >= 0 && !placed; j--) {
          const [f, to, s0, du, sg, turns, bulge] = st[j], u = clamp01((tau - s0 - i * sg) / du);
          if (tau >= s0 + i * sg || j === 0) {
            if (u >= 1 && j === st.length - 1) { const w = at(to, i, slots); obj.position.copy(w.p); obj.quaternion.copy(w.q); }
            else if (u <= 0) { const w = at(f, i, slots); obj.position.copy(w.p); obj.quaternion.copy(w.q); }
            else move(at(f, i, slots), at(to, i, slots), ease.inout(u), turns, bulge, obj);
            placed = true;
          }
        }
        if (changed && tau > st[st.length - 1][2] + st[st.length - 1][3] + 1) {
          const u = clamp01((data.dt - i * .08) / 1.9);
          move(wall(prev[i]), wall(cur[i]), ease.inout(u), 1, 1.4, obj);
        }
      }
      axisGlow.material.opacity = .22 + .08 * Math.sin(a * 1.1);
      shown = cur;
    },
    debug() { return { slots: shown }; },
  };
}
