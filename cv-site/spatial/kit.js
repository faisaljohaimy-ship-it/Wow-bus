 
import * as T from './vendor/three.spatial.min.js';
export { T };

 
export const C = {
  deepSpace: '#040914', sapphire: '#071629', obsidian: '#0B1322', titanium: '#162638', cyan: '#29E5F2',
  blue: '#477BFF', violet: '#8B6EFF', gold: '#E8BC78', pearl: '#F7FAFF', muted: '#AFC2D5', faint: '#8FA3B8',
  linkRaised: '#86A8FF', violetText: '#B9A8FF', cyanDeep: '#14B7CB', cyanHi: '#7FF2FA',
};

 
function bezier(x1, y1, x2, y2) {
  const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx, cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
  const X = t => ((ax * t + bx) * t + cx) * t, Y = t => ((ay * t + by) * t + cy) * t;
  return x => {
    if (x <= 0) return 0; if (x >= 1) return 1;
    let lo = 0, hi = 1, t = x;
    for (let i = 0; i < 30; i++) { const v = X(t); if (Math.abs(v - x) < 1e-6) break; if (v < x) lo = t; else hi = t; t = (lo + hi) / 2; }
    return Y(t);
  };
}
export const ease = {
  standard: bezier(.2, .7, .2, 1), emphasized: bezier(.16, 1, .3, 1), decelerate: bezier(0, 0, .2, 1),
  accelerate: bezier(.4, 0, 1, 1), inout: bezier(.65, 0, .35, 1), data: bezier(.22, 1, .36, 1),
  linear: x => x, smooth: x => x * x * (3 - 2 * x),
};
export const clamp01 = x => x < 0 ? 0 : x > 1 ? 1 : x;
export const lerp = (a, b, k) => a + (b - a) * k;
export const smooth = (e0, e1, x) => { const k = clamp01((x - e0) / (e1 - e0)); return k * k * (3 - 2 * k); };
export const DEG = Math.PI / 180;

 
export function rng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
export function hash(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return h >>> 0; }

 
const NF = {};
export function fmt(n, lang, d = 0) {
  const k = lang + d;
  return (NF[k] || (NF[k] = new Intl.NumberFormat(lang === 'ar' ? 'ar-u-nu-arab' : 'en-US', { minimumFractionDigits: d, maximumFractionDigits: d }))).format(n);
}
export const pct = (n, lang, d = 0) => fmt(n, lang, d) + (lang === 'ar' ? '٪' : '%');
 
export function score(actual, target, weight = .6, attendance = 1) {
  if (actual == null || target == null || !(target > 0)) return null;
  return Math.round(100 * (actual / target * weight + attendance * (1 - weight)));
}
 
export function mixData(a, b, k) {
  if (typeof b === 'number' && typeof a === 'number') return a + (b - a) * k;
  if (Array.isArray(b)) return b.map((v, i) => mixData(Array.isArray(a) ? a[i] : undefined, v, k));
  if (b && typeof b === 'object') { const o = {}; for (const key in b) o[key] = mixData(a && a[key], b[key], k); return o; }
  return k < 1 && a !== undefined ? a : b;
}

export const FONTS = {
  ar: '"IBM Plex Sans Arabic", "Noto Sans Arabic", "IBM Plex Sans", system-ui, sans-serif',
  en: '"IBM Plex Sans", "IBM Plex Sans Arabic", system-ui, sans-serif',
  mono: '"IBM Plex Mono", "IBM Plex Sans Arabic", ui-monospace, monospace',
};
export function fontsReady(ms = 1500) {
  const f = typeof document !== 'undefined' && document.fonts;
  if (!f || !f.load) return Promise.resolve();
  const all = ['400', '600'].flatMap(w => [`${w} 32px "IBM Plex Sans Arabic"`, `${w} 32px "IBM Plex Sans"`]).map(s => f.load(s).catch(() => 0));
  return Promise.race([Promise.all(all), new Promise(r => setTimeout(r, ms))]);
}

 
export function text(g, s, x, y, o = {}) {
  g.save();
  g.font = `${o.weight || 400} ${o.size || 24}px ${o.mono ? FONTS.mono : FONTS[o.lang] || FONTS.en}`;
  g.fillStyle = o.color || C.pearl; g.textAlign = o.align || 'start'; g.textBaseline = o.base || 'alphabetic';
  g.direction = o.lang === 'ar' ? 'rtl' : 'ltr';
  if (o.track && o.lang !== 'ar' && 'letterSpacing' in g) g.letterSpacing = o.track;   
  g.fillText(s, x, y, o.max);
  g.restore();
}
export function rrect(g, x, y, w, h, r) { g.beginPath(); g.roundRect ? g.roundRect(x, y, w, h, r) : g.rect(x, y, w, h); }
 
export function backing(g, w, h, o = {}) {
  const gr = g.createLinearGradient(0, 0, w * .3, h);
  gr.addColorStop(0, `rgba(11, 19, 34, ${o.top ?? .9})`); gr.addColorStop(1, `rgba(4, 9, 20, ${o.bottom ?? .82})`);
  rrect(g, 1, 1, w - 2, h - 2, o.r ?? Math.round(h * .045)); g.fillStyle = gr; g.fill();
  g.strokeStyle = 'rgba(127, 242, 250, .35)'; g.lineWidth = 2; g.stroke();
  g.fillStyle = 'rgba(247, 250, 255, .07)'; g.fillRect(o.r ?? 10, 2, w - 2 * (o.r ?? 10), 2);
}
 
export const STATUS = {
  verified: { mark: '✓', color: C.gold, label: ['مثبت', 'Verified'] },
  demonstrated: { mark: '▶', color: C.cyan, label: ['مُبيَّن عمليًا', 'Demonstrated'] },
  simulated: { mark: '◇', color: C.linkRaised, label: ['محاكاة', 'Simulated'] },
  proposed: { mark: '○', color: C.muted, label: ['مقترح', 'Proposed'] },
  pending: { mark: '–', color: C.muted, label: ['قيد المراجعة', 'Under review'] },
};
export const TAG = ['سيناريو افتراضي · بيانات محاكاة', 'Hypothetical scenario · simulated data'];
export function tag(g, L, x, y, pair, o = {}) {
  const s = pair[L.li], size = o.size || Math.round(L.h * .052);
  g.save(); g.font = `600 ${size}px ${FONTS[L.lang]}`; g.direction = L.rtl ? 'rtl' : 'ltr';
  const tw = g.measureText(s).width, pad = size * .7, w = tw + pad * 2 + size * 1.2, h = size * 1.9;
  const x0 = L.rtl ? x - w : x;
  rrect(g, x0, y - h / 2, w, h, h / 2); g.fillStyle = 'rgba(71, 123, 255, .14)'; g.fill();
  g.strokeStyle = 'rgba(134, 168, 255, .55)'; g.lineWidth = 1.5; g.stroke();
  g.fillStyle = C.linkRaised; g.textBaseline = 'middle'; g.textAlign = 'start';
  const mx = L.rtl ? x0 + w - pad : x0 + pad;
  g.fillText('◇', mx, y + 1); g.fillText(s, L.rtl ? mx - size * 1.2 : mx + size * 1.2, y + 1);
  g.restore(); return w;
}
 
export function icon(g, id, x, y, size, o = {}) {
  const lib = globalThis.SQDS_ICONS, ic = lib && lib.icons && lib.icons.find(i => i.id === id);
  g.save(); g.translate(x, y); g.scale(size / 48, size / 48);
  g.lineCap = 'round'; g.lineJoin = 'round';
  if (!ic) {
    g.strokeStyle = C.cyanHi; g.lineWidth = 1.75; g.beginPath(); g.arc(24, 24, 17, 0, 7); g.stroke();
    g.fillStyle = o.accent || C.cyan; g.beginPath(); g.arc(24, 24, 3.2, 0, 7); g.fill(); g.restore(); return;
  }
  if (o.rtl && ic.mirrorInRtl) { g.translate(48, 0); g.scale(-1, 1); }
  const P = lib.paint, accent = o.accent || P.accent;
  const glass = g.createLinearGradient(0, 0, 16.8, 48);
  for (const [k, c] of P.glass.stops) glass.addColorStop(k, c);
  for (const grp of ic.groups) for (const it of grp.items) {
    const role = lib.roles[it.role] || {};
    if (role.restOpacity === 0) continue;
    g.save();
    if (it.transform) for (const m of it.transform.matchAll(/(rotate|translate|scale)\(([^)]*)\)/g)) {
      const v = m[2].split(/[\s,]+/).map(Number);
      if (m[1] === 'rotate') { g.translate(v[1] || 0, v[2] || 0); g.rotate(v[0] * DEG); g.translate(-(v[1] || 0), -(v[2] || 0)); }
      else if (m[1] === 'translate') g.translate(v[0], v[1] || 0); else g.scale(v[0], v[1] ?? v[0]);
    }
    let p;
    if (it.el === 'path') p = new Path2D(it.d);
    else { p = new Path2D(); if (it.el === 'circle') p.arc(it.cx, it.cy, it.r, 0, Math.PI * 2); else if (it.el === 'ellipse') p.ellipse(it.cx, it.cy, it.rx, it.ry, 0, 0, Math.PI * 2); else p.rect(it.x, it.y, it.width, it.height); }
    g.globalAlpha = role.opacity ?? 1;
    g.lineWidth = role.width === 'detail' ? lib.stroke.detail : lib.stroke.base;
    const fill = { glass, accent, accentSoft: P.accentSoft, field: P.field }[role.fill];
    const stroke = { edge: P.edge, accent }[role.stroke];
    if (fill) { g.fillStyle = fill; g.fill(p, it.fillRule || 'nonzero'); }
    if (stroke) { g.strokeStyle = stroke; g.stroke(p); }
    g.restore();
  }
  g.restore();
}

 
export const V = (x, y, z) => new T.Vector3(x, y, z);
export function line(p0, p1, l0, l1) {
  const P0 = V(...p0), P1 = V(...p1), L0 = V(...l0), L1 = V(...(l1 || l0));
  return k => ({ p: P0.clone().lerp(P1, k), l: L0.clone().lerp(L1, k) });
}
export function orbit({ c, r, az, el, look }) {
  const O = V(...c), L0 = V(...((look && look[0]) || c)), L1 = V(...((look && (look[1] || look[0])) || c));
  return k => {
    const R = lerp(r[0], r[1], k), A = lerp(az[0], az[1], k) * DEG, E = lerp(el[0], el[1], k) * DEG;
    return { p: V(O.x + R * Math.cos(E) * Math.sin(A), O.y + R * Math.sin(E), O.z + R * Math.cos(E) * Math.cos(A)), l: L0.clone().lerp(L1, k) };
  };
}
export function spline(ps, ls) {
  const cp = new T.CatmullRomCurve3(ps.map(p => V(...p)), false, 'centripetal');
  const cl = ls.length > 1 ? new T.CatmullRomCurve3(ls.map(p => V(...p)), false, 'centripetal') : null, L = V(...ls[0]);
  return k => ({ p: cp.getPointAt(k), l: cl ? cl.getPointAt(k) : L.clone() });
}

 
const FOG_VS = 'uniform float uFogD; varying float vFog;';
const PATH_VS = `${FOG_VS} varying vec2 vUv;
void main() { vUv = uv; vec4 mv = modelViewMatrix * vec4(position, 1.0); float d = length(mv.xyz);
  vFog = 1.0 - exp(-uFogD * uFogD * d * d); gl_Position = projectionMatrix * mv; }`;
const PATH_FS = `uniform vec3 uColor; uniform float uTime, uSpeed, uGap, uBase, uHead, uOp, uLen, uAcross; varying vec2 vUv; varying float vFog;
void main() { float d = vUv.x * uLen; float ph = fract((d - uTime * uSpeed) / uGap);
  float pulse = pow(ph, 12.0) * uHead; float across = 1.0 - abs(vUv.y * 2.0 - 1.0);
  float core = mix(1.0, smoothstep(0.0, 0.75, across), uAcross);
  float a = clamp((uBase + pulse) * core * uOp * (1.0 - vFog), 0.0, 1.0);
  gl_FragColor = vec4(uColor * (1.0 + pulse * 0.6), a);
  #include <colorspace_fragment>
}`;
const FLOOR_VS = `${FOG_VS} varying vec3 vW;
void main() { vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; vec4 mv = viewMatrix * w; float d = length(mv.xyz);
  vFog = 1.0 - exp(-uFogD * uFogD * d * d); gl_Position = projectionMatrix * mv; }`;
const FLOOR_FS = `uniform vec3 uBase, uLine, uFogC; uniform float uGrid, uR; uniform vec2 uC; varying vec3 vW; varying float vFog;
void main() { vec2 p = vW.xz / uGrid; vec2 g = abs(fract(p - 0.5) - 0.5) / fwidth(p); float ln = 1.0 - min(min(g.x, g.y), 1.0);
  float r = length(vW.xz - uC) / uR; float fall = exp(-r * r * 2.2);
  vec3 c = uBase * (0.45 + 0.55 * fall) + uLine * ln * 0.13 * fall;
  gl_FragColor = vec4(mix(c, uFogC, vFog), 1.0);
  #include <colorspace_fragment>
}`;
const SKY_VS = 'varying vec3 vP; void main() { vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }';
const SKY_FS = `uniform vec3 uTop, uHor, uGlow; varying vec3 vP;
void main() { float h = vP.y; vec3 c = mix(uHor, uTop, smoothstep(-0.05, 0.6, h)); c = mix(c, uTop, smoothstep(0.0, -0.4, h));
  c += uGlow * exp(-h * h * 60.0) * 0.5; gl_FragColor = vec4(c, 1.0);
  #include <colorspace_fragment>
}`;

 
export function makeKit({ renderer, tier, lang, seed, ibl }) {
  const bag = new Set(), glassMeshes = new Set(), canvases = [];
  const track = o => { if (o) bag.add(o); return o; };
  const hi = tier === 'high', lo = tier === 'low', rtl = lang === 'ar', li = rtl ? 0 : 1, dir = rtl ? -1 : 1;
  const rand = rng(seed);
  const pick = p => Array.isArray(p) ? p[li] : p;
  const u = { time: { value: 0 } };                                 
  const fog = { color: { value: new T.Color(C.deepSpace) }, density: { value: .045 } };
  const scene = new T.Scene();
  scene.background = new T.Color(C.deepSpace);
  scene.fog = new T.FogExp2(C.deepSpace, fog.density.value);
  let glowTex = null, glassDowngraded = false;

   
  const sky = new T.Mesh(track(new T.SphereGeometry(90, 32, 16)), track(new T.ShaderMaterial({
    uniforms: { uTop: { value: new T.Color(C.deepSpace) }, uHor: { value: new T.Color(C.sapphire) }, uGlow: { value: new T.Color(C.cyanDeep).multiplyScalar(.12) } },
    vertexShader: SKY_VS, fragmentShader: SKY_FS, side: T.BackSide, depthWrite: false, fog: false,
  })));
  sky.renderOrder = -10; scene.add(sky);

   
  if ((ibl ?? hi) && renderer) {
    const pm = new T.PMREMGenerator(renderer), s = new T.Scene();
    const add = (geo, color, k, pos, rot, side) => { const m = new T.Mesh(geo, new T.MeshBasicMaterial({ color: new T.Color(color).multiplyScalar(k), side: side || T.DoubleSide })); m.position.set(...pos); if (rot) m.rotation.set(...rot); s.add(m); };
    add(new T.BoxGeometry(30, 14, 30), C.sapphire, .7, [0, 2, 0], null, T.BackSide);
    add(new T.PlaneGeometry(14, 5), C.pearl, 2.4, [0, 8.9, -2], [Math.PI / 2, 0, 0]);
    add(new T.PlaneGeometry(.8, 9), C.cyan, 2.2, [-14.9, 2, -4], [0, Math.PI / 2, 0]);
    add(new T.PlaneGeometry(9, 3), C.blue, 1.1, [2, 2.5, -14.9]);
    add(new T.PlaneGeometry(3, 6), C.pearl, 1.2, [14.9, 2, 5], [0, -Math.PI / 2, 0]);
    const rt = track(pm.fromScene(s, .03));
    s.traverse(o => { if (o.isMesh) { o.geometry.dispose(); o.material.dispose(); } });
    pm.dispose();
    scene.environment = rt.texture;
  }

  function lights({ key = [4, 9, 6], keyI = 1.5, hemi = .9, points = [] } = {}) {
    scene.add(new T.HemisphereLight(new T.Color('#3a5f86'), new T.Color(C.deepSpace), hemi));
    const d = new T.DirectionalLight(new T.Color(C.pearl), keyI); d.position.set(...key); scene.add(d);
    return points.map(([pos, color, intensity, dist]) => { const p = new T.PointLight(new T.Color(color), intensity, dist || 12, 2); p.position.set(...pos); scene.add(p); return p; });
  }

   
  function glassMat(o = {}, forceMid) {
    const tint = new T.Color(o.tint || C.pearl);
    if (hi && !forceMid && !glassDowngraded && !o.noTransmission) return track(new T.MeshPhysicalMaterial({
      color: tint, metalness: 0, roughness: o.rough ?? .14, transmission: 1, thickness: o.thickness ?? .3, ior: 1.42,
      attenuationColor: new T.Color(C.cyanHi), attenuationDistance: 5, specularIntensity: 1, envMapIntensity: 1.15,
    }));
    if (!lo) return track(new T.MeshPhongMaterial({                 
      color: tint.lerp(new T.Color(C.cyan), .14), specular: new T.Color(C.pearl).multiplyScalar(.55), shininess: 90,
      transparent: true, opacity: o.opacity ?? .2, depthWrite: false, side: T.DoubleSide,
    }));
    return track(new T.MeshBasicMaterial({ color: new T.Color(C.sapphire).lerp(new T.Color(C.cyan), .2), transparent: true, opacity: (o.opacity ?? .2) + .1, depthWrite: false, side: T.DoubleSide }));
  }
  function downgradeGlass() {                                    
    if (!hi || glassDowngraded) return false;
    glassDowngraded = true;
    for (const m of glassMeshes) if (m.material.transmission) { const old = m.material; m.material = glassMat({}, true); old.dispose(); bag.delete(old); }
    return true;
  }
  const lineMat = (color = C.cyanHi, opacity = .5) => track(new T.LineBasicMaterial({ color: new T.Color(color), transparent: true, opacity, depthWrite: false, blending: T.AdditiveBlending }));
  const edges = (geo, color, opacity) => new T.LineSegments(track(new T.EdgesGeometry(geo, 24)), lineMat(color, opacity));
  const basic = (color, o = {}) => track(new T.MeshBasicMaterial(Object.assign({ color: new T.Color(color) }, o)));
   
  function std(color, o = {}) {
    const base = { color: new T.Color(color), emissive: new T.Color(o.emissive || '#000000'), emissiveIntensity: o.emissiveIntensity ?? 1 };
    if (hi) return track(new T.MeshStandardMaterial(Object.assign(base, { roughness: o.rough ?? .35, metalness: o.metal ?? .4 })));
    if (!lo) return track(new T.MeshPhongMaterial(Object.assign(base, { shininess: 20 + (1 - (o.rough ?? .35)) * 80, specular: new T.Color(C.muted).multiplyScalar(.25 + (o.metal ?? .4) * .4) })));
    return track(new T.MeshLambertMaterial(base));
  }
  const mesh = (geo, mat, parent) => { const m = new T.Mesh(track(geo), mat); if (parent) parent.add(m); return m; };

   
  function cutShape(w, h, c) {
    const s = new T.Shape(), x = w / 2, y = h / 2; c = Math.min(c, x * .5, y * .5);
    s.moveTo(-x + c, -y); s.lineTo(x - c, -y); s.lineTo(x, -y + c); s.lineTo(x, y - c); s.lineTo(x - c, y); s.lineTo(-x + c, y); s.lineTo(-x, y - c); s.lineTo(-x, -y + c); s.closePath();
    return s;
  }
  function slab({ w = 1, h = 1, d = .05, cut = .08, mat, edge = C.cyanHi, edgeOpacity = .5, glass } = {}) {
    const geo = track(new T.ExtrudeGeometry(cutShape(w, h, cut), { depth: d, bevelEnabled: false, curveSegments: 1 }));
    geo.translate(0, 0, -d / 2);
    const g = new T.Group(), m = new T.Mesh(geo, mat || glassMat(glass));
    if (!mat) glassMeshes.add(m);
    g.add(m);
    if (edge) g.add(edges(geo, edge, edgeOpacity));
    return g;
  }
   
  function screen({ w, h, px, z = 0 }) {
    px = px || (hi ? 1024 : lo ? 400 : 720);
    const cw = px, ch = Math.round(px * h / w), cv = document.createElement('canvas');
    cv.width = cw; cv.height = ch; canvases.push(cv);
    const g = cv.getContext('2d'), tex = track(new T.CanvasTexture(cv));
    tex.colorSpace = T.SRGBColorSpace;
    if (hi && renderer) tex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    const m = mesh(new T.PlaneGeometry(w, h), basic('#ffffff', { map: tex, transparent: true, depthWrite: false, toneMapped: false }));
    m.position.z = z; m.renderOrder = 3;
    const L = { w: cw, h: ch, rtl, li, lang, x: v => rtl ? cw - v : v };
    const api = { mesh: m, tex, g, L, key: undefined, paint(fn, key) { if (key !== undefined && key === api.key) return false; api.key = key; g.clearRect(0, 0, cw, ch); fn(g, L); tex.needsUpdate = true; return true; } };
    return api;
  }
  function panel(o) {                                             
    const g = new T.Group(), s = slab(o), sc = screen({ w: o.w - (o.inset ?? .12), h: o.h - (o.inset ?? .12), px: o.px, z: (o.d || .05) / 2 + .006 });
    g.add(s, sc.mesh);
    return { group: g, screen: sc, slab: s };
  }
  function glowTexture() {
    if (glowTex) return glowTex;
    const cv = document.createElement('canvas'); cv.width = cv.height = 64; const g = cv.getContext('2d');
    const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(.25, 'rgba(255,255,255,.45)'); gr.addColorStop(.6, 'rgba(255,255,255,.08)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    glowTex = track(new T.CanvasTexture(cv)); canvases.push(cv);
    return glowTex;
  }
  function glow(color, size, opacity = 1) {
    const s = new T.Sprite(track(new T.SpriteMaterial({ map: glowTexture(), color: new T.Color(color), transparent: true, opacity, depthWrite: false, blending: T.AdditiveBlending })));
    s.scale.set(size, size, 1); return s;
  }
   
  function pool(color, r, opacity = .35) {
    const m = mesh(new T.PlaneGeometry(r * 2, r * 2), track(new T.MeshBasicMaterial({ map: glowTexture(), color: new T.Color(color), transparent: true, opacity, depthWrite: false, blending: T.AdditiveBlending })));
    m.rotation.x = -Math.PI / 2; return m;
  }
   
  function label(pair, o = {}) {
    const s = pick(pair), px = hi ? 56 : lo ? 34 : 44, sub = o.sub ? pick(o.sub) : '';
    const probe = document.createElement('canvas').getContext('2d');
    probe.font = `${o.weight || 600} ${px}px ${FONTS[lang]}`; let w = probe.measureText(s).width;
    if (sub) { probe.font = `400 ${px * .62}px ${FONTS[lang]}`; w = Math.max(w, probe.measureText(sub).width); }
    const pad = px * .55, cw = Math.ceil(w + pad * 2), ch = Math.ceil(px * (sub ? 2.15 : 1.55)), cv = document.createElement('canvas');
    cv.width = cw; cv.height = ch; canvases.push(cv);
    const g = cv.getContext('2d');
    if (o.bg !== false) { rrect(g, 1, 1, cw - 2, ch - 2, ch * (sub ? .2 : .5)); g.fillStyle = 'rgba(4, 9, 20, .78)'; g.fill(); g.strokeStyle = o.edge || 'rgba(127, 242, 250, .4)'; g.lineWidth = 2; g.stroke(); }
    text(g, s, cw / 2, px * 1.08, { size: px, weight: o.weight || 600, color: o.color || C.pearl, align: 'center', lang });
    if (sub) text(g, sub, cw / 2, px * 1.86, { size: px * .62, color: o.subColor || C.muted, align: 'center', lang });
    const tex = track(new T.CanvasTexture(cv)); tex.colorSpace = T.SRGBColorSpace;
    const sp = new T.Sprite(track(new T.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, toneMapped: false })));
    const hgt = (o.size || .2) * (sub ? 1.4 : 1); sp.scale.set(hgt * cw / ch, hgt, 1); sp.renderOrder = 5;
    return sp;
  }
   
  function pathMat({ color = C.cyan, speed = .9, gap = 3.2, base = .16, head = 1.3, opacity = 1, len = 1, across = 1 } = {}) {
    return track(new T.ShaderMaterial({
      uniforms: { uTime: u.time, uColor: { value: new T.Color(color) }, uSpeed: { value: speed }, uGap: { value: gap }, uBase: { value: base }, uHead: { value: head }, uOp: { value: opacity }, uLen: { value: len }, uAcross: { value: across }, uFogD: fog.density },
      vertexShader: PATH_VS, fragmentShader: PATH_FS, transparent: true, depthWrite: false, blending: T.AdditiveBlending, side: T.DoubleSide, fog: false,
    }));
  }
   
  function fillet(pts, r = .5, seg = 6) {
    const out = [pts[0].clone()];
    for (let i = 1; i < pts.length - 1; i++) {
      const p = pts[i], a = pts[i - 1].clone().sub(p), b = pts[i + 1].clone().sub(p);
      const rr = Math.min(r, a.length() / 2, b.length() / 2), s = p.clone().addScaledVector(a.normalize(), rr), e = p.clone().addScaledVector(b.normalize(), rr);
      for (let k = 0; k <= seg; k++) { const t = k / seg; out.push(s.clone().multiplyScalar((1 - t) * (1 - t)).addScaledVector(p, 2 * (1 - t) * t).addScaledVector(e, t * t)); }
    }
    out.push(pts[pts.length - 1].clone()); return out;
  }
  function ribbon(pts, width) {
    const n = pts.length, pos = new Float32Array(n * 6), uv = new Float32Array(n * 4), idx = [];
    let dist = 0;
    for (let i = 0; i < n; i++) {
      const p = pts[i], a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)];
      let tx = b.x - a.x, tz = b.z - a.z; const l = Math.hypot(tx, tz) || 1; tx /= l; tz /= l;
      const nx = -tz * width / 2, nz = tx * width / 2;
      if (i) dist += p.distanceTo(pts[i - 1]);
      pos.set([p.x + nx, p.y, p.z + nz, p.x - nx, p.y, p.z - nz], i * 6); uv.set([dist, 0, dist, 1], i * 4);
      if (i < n - 1) { const k = i * 2; idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
    }
    const geo = track(new T.BufferGeometry());
    geo.setAttribute('position', new T.BufferAttribute(pos, 3)); geo.setAttribute('uv', new T.BufferAttribute(uv, 2)); geo.setIndex(idx);
    return { geo, length: dist };
  }
  function floorPath(pts, { width = .07, y = .012, r = .45, ...m } = {}) {
    const P = fillet(pts.map(p => V(p[0], y, p[1])), r), rb = ribbon(P, width);
    return new T.Mesh(rb.geo, pathMat(Object.assign({ len: 1 }, m)));
  }
  function tube(curve, radius, m = {}) {
    const geo = track(new T.TubeGeometry(curve, lo ? 40 : 80, radius, lo ? 4 : 6, false));
    return new T.Mesh(geo, pathMat(Object.assign({ len: curve.getLength(), across: 0 }, m)));
  }
  function floor({ size = 60, grid = 1, center = [0, 0], radius = 14, color = C.obsidian } = {}) {
    const m = mesh(new T.PlaneGeometry(size, size), track(new T.ShaderMaterial({
      uniforms: { uBase: { value: new T.Color(color) }, uLine: { value: new T.Color(C.cyanHi) }, uFogC: fog.color, uFogD: fog.density, uGrid: { value: grid }, uR: { value: radius }, uC: { value: new T.Vector2(...center) } },
      vertexShader: FLOOR_VS, fragmentShader: FLOOR_FS, fog: false,
    })));
    m.rotation.x = -Math.PI / 2; m.renderOrder = -5; return m;
  }
   
  function packets(n, { color = C.cyanHi, r = .05, halo = .32 } = {}) {
    const im = new T.InstancedMesh(track(new T.SphereGeometry(r, lo ? 8 : 12, lo ? 6 : 8)), basic(color, { toneMapped: false }), n);
    im.frustumCulled = false;
    const pos = new Float32Array(n * 3), geo = track(new T.BufferGeometry());
    geo.setAttribute('position', new T.BufferAttribute(pos, 3).setUsage(T.DynamicDrawUsage));
    const pts = new T.Points(geo, track(new T.PointsMaterial({ map: glowTexture(), color: new T.Color(color), size: halo, sizeAttenuation: true, transparent: true, depthWrite: false, blending: T.AdditiveBlending })));
    pts.frustumCulled = false;
    const M = new T.Matrix4(), S = new T.Vector3(), Q = new T.Quaternion();
    return {
      mesh: im, halos: pts,
      set(i, p, s = 1) { S.setScalar(s); M.compose(p, Q, S); im.setMatrixAt(i, M); if (s > 0) pos.set([p.x, p.y, p.z], i * 3); else pos.set([0, -99, 0], i * 3); },
      commit() { im.instanceMatrix.needsUpdate = true; geo.attributes.position.needsUpdate = true; },
    };
  }
  function dispose() {
    scene.traverse(o => { if (o.geometry) bag.add(o.geometry); if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => bag.add(m)); });
    for (const o of bag) { if (o.map) o.map.dispose(); o.dispose && o.dispose(); }
    bag.clear(); glassMeshes.clear();
    for (const cv of canvases) { cv.width = cv.height = 0; }
    canvases.length = 0; scene.clear(); scene.environment = null;
  }
  return {
    T, C, scene, tier, hi, lo, lang, rtl, li, dir, rand, u, fog, pick, track,
    lights, glassMat, downgradeGlass, lineMat, edges, basic, std, mesh, slab, screen, panel, glow, pool, label,
    pathMat, fillet, ribbon, floorPath, tube, floor, packets, dispose,
    stats: () => ({ tracked: bag.size, glass: glassMeshes.size, transmission: hi && !glassDowngraded }),
  };
}
