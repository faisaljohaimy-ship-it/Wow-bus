/**
 * BILTIX Risk AI — procedural SIMULATED site-camera feed (js/ui/camfeed.js). Owner: spatial view.
 *
 * There is no camera connection. This module DRAWS a plausible construction scene for a camera record
 * (js/data/spatial-seed.js): sky and light from the Asia/Riyadh time of day (infrared monochrome at night),
 * far skyline or desert ridges, a scene preset for the camera's zone (concrete frame with floors, columns,
 * edge protection and scaffolding; yard; gate; trench; solar rows; steel warehouse; earthworks), a tower or
 * mobile crane whose jib slews slowly, worker silhouettes with hard hats and vests, a vehicle, depth haze,
 * sensor grain, vignette and a slight barrel (lens) curvature. Illustrative boxes are drawn only for the
 * PPE events the caller passes in (events that exist in the simulated feed for the zone).
 *
 * Cost model (docs/design/spatial.md §Performance):
 *   • plate canvas  — everything static, drawn once per open (and again every 10 minutes of Riyadh time);
 *   • dyn canvas    — crane jib, workers, vehicle, boxes, sensor grain, frame counter; redrawn per frame;
 *   • both canvases are handed to a module WORKER (OffscreenCanvas): this same file is the worker script,
 *     so frames are drawn and committed off the main thread. Without OffscreenCanvas / module workers the
 *     same renderer runs on the main thread (fallback, more main-thread time);
 *   • vignette / scanlines / OSD — static DOM layers (the OSD clock text changes once per second).
 * The loop runs at FPS (15, a typical CCTV rate; never above 30) only while started, the frame is on
 * screen (IntersectionObserver) and the tab is visible. Under reduced motion (prefers-reduced-motion or
 * html[data-motion="reduce"]) it renders ONE still frame and stops.
 *
 *   const feed = createCamFeed(host, { camera, preset, kind, levels, labels, rtlZone, rtlLabels, fps })
 *   feed.setEvents([{ id, item }]) · feed.start() · feed.stop() · feed.still() · feed.destroy()
 *   feed.stats() → { frames, avgDrawMs, running, mode, backend: 'worker'|'main', phase }
 *
 * Geometry is a picture: the frame is dir="ltr" and never mirrors in Arabic; only text inside follows its language.
 */

const W = 768;
const H = 432;
const FPS = 15;
const MAX_FPS = 30;
const LENS_K = -0.05;     // barrel curvature
const LENS_ZOOM = 1.045;  // hides the pulled-in corners

/* ────────────────────────────── small math / colour helpers ────────────────────────────── */

function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6D2B79F5) >>> 0;
    let x = a;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}
function hash32(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i += 1) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h >>> 0;
}
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const rgbCache = new Map();
function rgb(hex) {
  let c = rgbCache.get(hex);
  if (c) return c;
  const s = hex.replace('#', '');
  c = [parseInt(s.slice(0, 2), 16), parseInt(s.slice(2, 4), 16), parseInt(s.slice(4, 6), 16)];
  rgbCache.set(hex, c);
  return c;
}
const css = (c, a = 1) => (a >= 1 ? `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})` : `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`);
const mixC = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];

/** Time of day in Riyadh (UTC+3, no DST) → light phase. */
export function riyadhHour(ms = Date.now()) {
  const h = (((ms / 3_600_000) + 3) % 24 + 24) % 24;
  return h;
}
export function lightPhase(hour) {
  if (hour < 5.25 || hour >= 18.6) return 'night';
  if (hour < 6.75) return 'dawn';
  if (hour >= 16.6) return 'dusk';
  return 'day';
}

/* ────────────────────────────── palettes ────────────────────────────── */

const SKY = {
  day: { urban: ['#5B8CC2', '#9DBEDC', '#D5DEE3'], desert: ['#5E93C9', '#A9C8E0', '#E7DAC2'] },
  dawn: { urban: ['#3A557F', '#B58A86', '#F0C392'], desert: ['#3D5A86', '#C59080', '#F4C891'] },
  dusk: { urban: ['#2F4468', '#C07A5C', '#EFAF6E'], desert: ['#33496E', '#CC825A', '#F2B46E'] },
  night: { urban: ['#1E2224', '#33383A', '#5A6062'], desert: ['#1E2224', '#33383A', '#5E6466'] },
};
const GROUND = {
  urban: { far: '#B4AEA2', near: '#857E72' },
  desert: { far: '#D6BE96', near: '#A9875C' },
};
const P = {
  concrete: '#BAB5AA', slab: '#CFCAC0', column: '#A9A398', interior: '#45484C', interiorLit: '#6A6E70',
  formwork: '#C68638', edgeY: '#E6C01C', edgeR: '#CB3F2B', tube: '#98A1A8', board: '#9E7645', net: '#2E6E56',
  crane: '#E2B21A', craneDark: '#6E5A12', counter: '#8A8A86', cab: '#D9D7CF',
  vestO: '#F08A24', vestL: '#B9D532', stripe: '#E9EEF0', helmW: '#F1F1EC', helmY: '#F0BF2C', pants: '#3A3F47', shirt: '#59626E', skin: '#6E523F',
  truck: '#E7E6E0', dump: '#D6A21E', mixer: '#D8D6CE', tyre: '#232527', glass: '#3C4A57',
  contB: '#3E6C8A', contR: '#8A4A33', contG: '#5B7848', rebar: '#7A4A2E', block: '#B9B2A2', pallet: '#9C7A4E',
  steel: '#6F7C88', steelLight: '#A7B1BA', roof: '#C8CED3', panel: '#1F3552', panelHi: '#4E6E92', pile: '#8E9499',
  fence: '#D9DCD8', fenceDark: '#9BA09C', barrierR: '#C8452F', barrierW: '#E9E6DE', road: '#6E6B66', mark: '#E8E4D8',
  soil: '#9E7B52', soilDark: '#7A5C3B', soilLight: '#C2A37A', rock: '#8F7B66', machine: '#D49A1C',
};

/* ────────────────────────────── scene model ────────────────────────────── */

const PRESET = {
  frame: { horizon: 0.6, aim: 70 },
  midrise: { horizon: 0.58, aim: 55 },
  yard: { horizon: 0.42, aim: 40 },
  gate: { horizon: 0.45, aim: 35 },
  trench: { horizon: 0.38, aim: 30 },
  solar: { horizon: 0.36, aim: 40 },
  warehouse: { horizon: 0.5, aim: 45 },
  earthworks: { horizon: 0.37, aim: 45 },
};

function buildModel(camera, preset, kind, levels) {
  const p = PRESET[preset] || PRESET.yard;
  const fovRad = (clamp(Number(camera.fov) || 80, 40, 110) * Math.PI) / 180;
  const f = (W / 2) / Math.tan(fovRad / 2);
  const hc = clamp(Number(camera.mountHeight) || 8, 3, 30);
  const horizonY = H * clamp(p.horizon - (hc - 8) * 0.011, 0.24, 0.66);
  const zMinGround = (f * hc) / (H - horizonY);
  const rng = mulberry32(hash32(String(camera.id || 'cam')));
  return { camera, preset, kind: kind === 'desert' ? 'desert' : 'urban', f, hc, horizonY, zMinGround, rng, aim: p.aim, levels: levels || null };
}

/** World (X right, Y up, Z depth; metres) → screen, before the lens warp. */
function proj(m, X, Y, Z) {
  const z = Math.max(0.5, Z);
  return [W / 2 + (m.f * X) / z, m.horizonY + (m.f * (m.hc - Y)) / z];
}
function warp(x, y) {
  const cx = W / 2; const cy = H / 2;
  const u = (x - cx) / cx; const v = (y - cy) / cx;
  // r·(1 + K·r²) is only monotonic for small r: far outside the frame the scale is held constant, so an
  // off-screen object can never fold back into the picture.
  const s = (1 + LENS_K * Math.min(u * u + v * v, 3)) * LENS_ZOOM;
  return [cx + u * s * cx, cy + v * s * cx];
}
function wp(m, X, Y, Z) { const p = proj(m, X, Y, Z); return warp(p[0], p[1]); }

/** Polyline / polygon through the lens (segments subdivided so straight lines bow slightly). */
function wpath(ctx, pts, closed) {
  ctx.beginPath();
  const n = pts.length;
  const segs = closed ? n : n - 1;
  let first = true;
  for (let i = 0; i < segs; i += 1) {
    const a = pts[i]; const b = pts[(i + 1) % n];
    const steps = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 22));
    for (let k = 0; k <= steps; k += 1) {
      if (!first && k === 0) continue;
      const t = k / steps;
      const q = warp(lerp(a[0], b[0], t), lerp(a[1], b[1], t));
      if (first) { ctx.moveTo(q[0], q[1]); first = false; } else ctx.lineTo(q[0], q[1]);
    }
  }
  if (closed) ctx.closePath();
}
function wpoly(ctx, m, world, closed = true) { wpath(ctx, world.map((w) => proj(m, w[0], w[1], w[2])), closed); }

/* ────────────────────────────── light ────────────────────────────── */

function makeLight(phase, kind) {
  const sky = SKY[phase][kind];
  const ir = phase === 'night';
  const tint = phase === 'dawn' ? [1.04, 0.9, 0.8] : phase === 'dusk' ? [1.06, 0.88, 0.74] : [1, 1, 1];
  const dim = phase === 'dawn' || phase === 'dusk' ? 0.86 : 1;
  const hazeHex = sky[2];
  const haze = rgb(hazeHex);
  const hazeDist = kind === 'desert' ? 520 : 760;
  /** Colour of a material at depth z (haze) with phase tint; infrared → luminance. */
  function col(hex, z = 30, k = 1) {
    let c = rgb(hex);
    if (ir) {
      const l = 0.3 * c[0] + 0.59 * c[1] + 0.11 * c[2];
      const g = clamp(l * 0.78 + 34, 0, 255) * k;
      c = [g * 0.97, g, g * 0.97];
      const a = 1 - Math.exp(-z / 260);
      return mixC(c, [54, 58, 59], a * 0.9);
    }
    c = [c[0] * tint[0] * dim * k, c[1] * tint[1] * dim * k, c[2] * tint[2] * dim * k];
    const a = 1 - Math.exp(-z / hazeDist);
    return mixC(c, haze, clamp(a, 0, 0.92));
  }
  return { phase, ir, sky, haze, col };
}

/* ────────────────────────────── plate (static) ────────────────────────────── */

function drawSky(ctx, m, L) {
  const g = ctx.createLinearGradient(0, 0, 0, m.horizonY + 6);
  g.addColorStop(0, L.sky[0]); g.addColorStop(0.6, L.sky[1]); g.addColorStop(1, L.sky[2]);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, m.horizonY + 8);
  if (L.ir) return;
  // thin, high haze bands (static)
  const rng = mulberry32(hash32(`${m.camera.id}:sky`));
  for (let i = 0; i < 4; i += 1) {
    const cx = rng() * W; const cy = m.horizonY * (0.18 + rng() * 0.55); const rx = 140 + rng() * 220; const ry = 5 + rng() * 9;
    const cg = ctx.createRadialGradient(cx, cy, 1, cx, cy, rx);
    cg.addColorStop(0, `rgba(255,255,255,${0.1 + rng() * 0.08})`); cg.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.save(); ctx.translate(cx, cy); ctx.scale(1, ry / rx); ctx.translate(-cx, -cy);
    ctx.fillStyle = cg; ctx.fillRect(cx - rx, cy - rx, rx * 2, rx * 2); ctx.restore();
  }
}

function drawSun(ctx, m, L, hour) {
  if (L.ir) return;
  const az = 90 + (hour - 6) * 15;                 // 06:00 east, 12:00 south, 18:00 west
  const el = Math.sin((Math.PI * (hour - 6)) / 12) * 52;
  let diff = ((az - (Number(m.camera.heading) || 0)) + 540) % 360 - 180;
  const half = (Number(m.camera.fov) || 80) / 2 + 18;
  if (Math.abs(diff) > half) return;
  const x = W / 2 + m.f * Math.tan((diff * Math.PI) / 180);
  const y = m.horizonY - m.f * Math.tan((Math.max(el, 1) * Math.PI) / 180);
  const r = L.phase === 'day' ? 150 : 210;
  const g = ctx.createRadialGradient(x, y, 2, x, y, r);
  const warm = L.phase !== 'day';
  g.addColorStop(0, warm ? 'rgba(255,226,170,0.95)' : 'rgba(255,253,240,0.95)');
  g.addColorStop(0.08, warm ? 'rgba(255,196,120,0.55)' : 'rgba(255,248,225,0.5)');
  g.addColorStop(1, 'rgba(255,240,210,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, m.horizonY + 40);
}

function drawFar(ctx, m, L) {
  const rng = mulberry32(hash32(`${m.camera.id}:far`));
  if (m.kind === 'desert') {
    // two ridgelines (escarpment / mountains), hazed
    for (let layer = 0; layer < 2; layer += 1) {
      const z = layer === 0 ? 2600 : 1400;
      const c = L.col(layer === 0 ? '#9C8A78' : '#A88E70', z);
      ctx.fillStyle = css(c);
      const base = m.horizonY + 1;
      const amp = layer === 0 ? 34 : 18;
      const pts = [[0, base]];
      let y = base - amp * (0.4 + rng() * 0.5);
      for (let x = 0; x <= W; x += 16) {
        y = clamp(y + (rng() - 0.5) * (layer === 0 ? 9 : 6), base - amp * 1.25, base - 3);
        if (layer === 0 && rng() < 0.05) y = base - amp * (0.9 + rng() * 0.3);
        pts.push([x, y]);
      }
      pts.push([W, base]);
      wpath(ctx, pts, true);
      ctx.fill();
    }
    return;
  }
  // urban skyline: blocks of different heights at 700–1600 m
  for (let pass = 0; pass < 2; pass += 1) {
    const z = pass === 0 ? 1600 : 900;
    const c = L.col(pass === 0 ? '#8E98A2' : '#8A9096', z);
    ctx.fillStyle = css(c);
    let x = -10;
    while (x < W + 10) {
      const w = 8 + rng() * (pass === 0 ? 26 : 34);
      const hgt = (pass === 0 ? 6 : 4) + rng() * (pass === 0 ? 30 : 22) + (rng() < 0.08 ? 40 : 0);
      if (rng() < 0.8) { wpath(ctx, [[x, m.horizonY + 1], [x, m.horizonY - hgt], [x + w, m.horizonY - hgt], [x + w, m.horizonY + 1]], true); ctx.fill(); }
      x += w + rng() * 6;
    }
  }
}

function drawGround(ctx, m, L) {
  const G = GROUND[m.kind];
  const g = ctx.createLinearGradient(0, m.horizonY, 0, H);
  g.addColorStop(0, css(L.col(G.far, 900)));
  g.addColorStop(0.35, css(L.col(G.far, 160)));
  g.addColorStop(1, css(L.col(G.near, 10)));
  ctx.fillStyle = g;
  const p = [[-40, m.horizonY], [W + 40, m.horizonY], [W + 40, H + 40], [-40, H + 40]];
  wpath(ctx, p, true);
  ctx.fill();
  // texture: soft patches of compacted soil / gravel laid on the ground plane, then a few tyre tracks
  const rng = mulberry32(hash32(`${m.camera.id}:ground`));
  const z0 = m.zMinGround * 0.98;
  for (let i = 0; i < 70; i += 1) {
    const Z = z0 + (260 - z0) * rng() ** 1.7;
    const X = (rng() - 0.5) * (Z * 1.6);
    const c = wp(m, X, 0, Z);
    const rx = (m.f * (2 + rng() * 9)) / Z / 2;
    const ry = Math.max(0.6, (m.f * m.hc * (1 + rng() * 4)) / (Z * Z) / 2);
    const dark = rng() < 0.6;
    ctx.fillStyle = css(L.col(dark ? G.near : G.far, Z, dark ? 0.86 : 1.08), 0.08 + rng() * 0.12);
    ctx.beginPath(); ctx.ellipse(c[0], c[1], rx, ry, 0, 0, Math.PI * 2); ctx.fill();
  }
  ctx.strokeStyle = css(L.col(G.near, 40, 0.8), 0.22);
  for (let k = 0; k < 3; k += 1) {
    const X0 = (rng() - 0.5) * 30; const drift = (rng() - 0.5) * 24;
    for (const off of [0, 2.1]) {
      ctx.lineWidth = 1.2;
      const pts = [];
      for (let j = 0; j <= 12; j += 1) { const Z = z0 + j * 9; pts.push(proj(m, X0 + off + drift * Math.sin(j / 5), 0, Z)); }
      wpath(ctx, pts, false); ctx.stroke();
    }
  }
}

/** Axis-aligned cuboid with shaded faces (front at z0). */
function cuboid(ctx, m, L, x0, x1, y0, y1, z0, z1, hex, { top = 1.12, side = 0.8, front = 1, alpha = 1, shadow = true } = {}) {
  const zc = (z0 + z1) / 2;
  if (shadow && y0 <= 0.05) {
    const hgt = y1 - y0; const dx = hgt * 0.35; const dz = hgt * 0.5;
    ctx.fillStyle = `rgba(0,0,0,${L.ir ? 0.12 : L.phase === 'day' ? 0.2 : 0.13})`;
    wpoly(ctx, m, [[x0 - 0.15, 0, z0 - 0.15], [x1 + 0.15, 0, z0 - 0.15], [x1 + dx + 0.2, 0, z1 + dz], [x0 + dx, 0, z1 + dz]]);
    ctx.fill();
  }
  if (y1 < m.hc) { ctx.fillStyle = css(L.col(hex, zc, top), alpha); wpoly(ctx, m, [[x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1]]); ctx.fill(); }
  if (x0 > 0) { ctx.fillStyle = css(L.col(hex, zc, side), alpha); wpoly(ctx, m, [[x0, y0, z0], [x0, y1, z0], [x0, y1, z1], [x0, y0, z1]]); ctx.fill(); }
  if (x1 < 0) { ctx.fillStyle = css(L.col(hex, zc, side), alpha); wpoly(ctx, m, [[x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1]]); ctx.fill(); }
  ctx.fillStyle = css(L.col(hex, z0, front), alpha);
  wpoly(ctx, m, [[x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0]]);
  ctx.fill();
}

function line3(ctx, m, a, b) { wpoly(ctx, m, [a, b], false); ctx.stroke(); }

/** Concrete frame building: slabs, columns, deep interior with a back row of columns, props under the newest
 *  slabs, blockwork on the lower floors, formwork, rebar and edge protection on the working deck. */
function frameBuilding(ctx, m, L, { x0, x1, z0, depth, floors, total, fh = 3.6, scaffold = null, finished = false, rng, hoist = false }) {
  const z1 = z0 + depth;
  const topY = floors * fh;
  const span = 6;
  // ground shadow
  ctx.fillStyle = `rgba(0,0,0,${L.ir ? 0.12 : 0.16})`;
  wpoly(ctx, m, [[x0, 0, z0 - 0.3], [x1 + 2, 0, z0 - 0.3], [x1 + 8, 0, z1 + 10], [x0 + 6, 0, z1 + 10]]); ctx.fill();
  // side face (receding) when visible
  const sideX = x1 < 0 ? x1 : (x0 > 0 ? x0 : null);
  if (sideX !== null) {
    ctx.fillStyle = css(L.col(finished ? P.block : P.interior, z0 + depth / 2, finished ? 0.78 : 0.9));
    wpoly(ctx, m, [[sideX, 0, z0], [sideX, topY, z0], [sideX, topY, z1], [sideX, 0, z1]]); ctx.fill();
    ctx.strokeStyle = css(L.col(P.slab, z0 + depth / 2, 0.86)); ctx.lineWidth = Math.max(1, (m.f * 0.35) / (z0 + depth / 2));
    for (let i = 1; i <= floors; i += 1) line3(ctx, m, [sideX, i * fh, z0], [sideX, i * fh, z1]);
    ctx.lineWidth = Math.max(1, (m.f * 0.5) / (z0 + depth / 2));
    ctx.strokeStyle = css(L.col(P.column, z0 + depth / 2, 0.8));
    for (let z = z0; z <= z1 + 0.01; z += span) line3(ctx, m, [sideX, 0, z], [sideX, topY, z]);
  }
  // deep interior, then the back row of columns seen through the frame
  ctx.fillStyle = css(L.col(finished ? P.block : '#363431', z1));
  wpoly(ctx, m, [[x0, 0, z0], [x1, 0, z0], [x1, topY, z0], [x0, topY, z0]]); ctx.fill();
  if (!finished) {
    ctx.fillStyle = css(L.col('#55524D', z1 - 1));
    for (let x = x0 + span / 2; x < x1; x += span) { wpoly(ctx, m, [[x, 0, z1 - 1], [x + 0.7, 0, z1 - 1], [x + 0.7, topY, z1 - 1], [x, topY, z1 - 1]]); ctx.fill(); }
    // soffit light band under each slab (bounce light), lower floors partly blocked in
    for (let i = 0; i < floors; i += 1) {
      ctx.fillStyle = css(L.col('#6B6760', z0 + 4), 0.55);
      wpoly(ctx, m, [[x0, (i + 1) * fh - 0.9, z0 + 0.5], [x1, (i + 1) * fh - 0.9, z0 + 0.5], [x1, (i + 1) * fh - 0.45, z0 + 0.5], [x0, (i + 1) * fh - 0.45, z0 + 0.5]]); ctx.fill();
      if (i < Math.floor(floors * 0.45)) {
        for (let x = x0; x < x1 - span + 0.1; x += span) {
          if (rng() < 0.55) {
            ctx.fillStyle = css(L.col(P.block, z0 + 0.2, 0.96));
            wpoly(ctx, m, [[x + 0.8, i * fh, z0 + 0.2], [x + span, i * fh, z0 + 0.2], [x + span, (i + 1) * fh - 0.45, z0 + 0.2], [x + 0.8, (i + 1) * fh - 0.45, z0 + 0.2]]); ctx.fill();
            ctx.fillStyle = css(L.col('#2E2D2B', z0 + 0.2));
            wpoly(ctx, m, [[x + 2.2, i * fh + 1, z0 + 0.15], [x + 4.6, i * fh + 1, z0 + 0.15], [x + 4.6, i * fh + 2.5, z0 + 0.15], [x + 2.2, i * fh + 2.5, z0 + 0.15]]); ctx.fill();
          }
        }
      }
    }
    // re-propping under the two newest slabs
    ctx.strokeStyle = css(L.col(P.tube, z0 + 2)); ctx.lineWidth = Math.max(0.6, (m.f * 0.08) / z0);
    for (let i = Math.max(0, floors - 3); i < floors - 1; i += 1) for (let x = x0 + 0.9; x < x1; x += 1.3) line3(ctx, m, [x, i * fh, z0 + 2], [x, (i + 1) * fh - 0.45, z0 + 2]);
  } else {
    // blockwork infill with window openings
    ctx.fillStyle = css(L.col('#2F3134', z0, 0.95));
    for (let i = 0; i < floors; i += 1) {
      for (let x = x0 + 1.2; x < x1 - 1.5; x += 3) {
        if (rng() < 0.85) { wpoly(ctx, m, [[x, i * fh + 0.9, z0], [x + 1.5, i * fh + 0.9, z0], [x + 1.5, i * fh + 2.5, z0], [x, i * fh + 2.5, z0]]); ctx.fill(); }
      }
    }
  }
  ctx.fillStyle = css(L.col(finished ? P.block : P.column, z0, finished ? 0.92 : 1));
  for (let x = x0; x <= x1 + 0.01; x += span) {
    const cx = Math.min(x, x1 - 0.8);
    const colTop = topY + (x > x0 + span && !finished ? fh * 0.85 : 0);
    wpoly(ctx, m, [[cx, 0, z0], [cx + 0.8, 0, z0], [cx + 0.8, colTop, z0], [cx, colTop, z0]]); ctx.fill();
  }
  ctx.fillStyle = css(L.col(P.slab, z0, 1.08));
  for (let i = 1; i <= floors; i += 1) {
    const y = i * fh;
    wpoly(ctx, m, [[x0 - 0.25, y - 0.45, z0], [x1 + 0.25, y - 0.45, z0], [x1 + 0.25, y, z0], [x0 - 0.25, y, z0]]); ctx.fill();
  }
  if (!finished) {
    ctx.strokeStyle = css(L.col(P.rebar, z0)); ctx.lineWidth = Math.max(0.6, (m.f * 0.06) / z0);
    for (let x = x0 + 0.3; x < x1; x += 1.1) line3(ctx, m, [x, topY, z0 + 0.4], [x, topY + 1.4, z0 + 0.4]);
    ctx.fillStyle = css(L.col(P.formwork, z0));
    for (let x = x0 + 3; x < x1 - 3; x += 7) { wpoly(ctx, m, [[x, topY, z0 + 0.6], [x + 2.4, topY, z0 + 0.6], [x + 2.4, topY + 3.2, z0 + 0.6], [x, topY + 3.2, z0 + 0.6]]); ctx.fill(); }
    const edgeFloors = Math.min(5, floors);
    for (let i = floors - edgeFloors + 1; i <= floors; i += 1) {
      const y = i * fh;
      ctx.strokeStyle = css(L.col(P.edgeY, z0)); ctx.lineWidth = Math.max(1, (m.f * 0.12) / z0);
      line3(ctx, m, [x0, y + 1.0, z0 - 0.1], [x1, y + 1.0, z0 - 0.1]);
      line3(ctx, m, [x0, y + 0.5, z0 - 0.1], [x1, y + 0.5, z0 - 0.1]);
      ctx.strokeStyle = css(L.col(P.edgeR, z0));
      for (let x = x0; x <= x1; x += 2.4) line3(ctx, m, [x, y, z0 - 0.1], [x, y + 1.05, z0 - 0.1]);
    }
    // debris / safety net fan below the working deck
    ctx.fillStyle = css(L.col(P.net, z0), 0.42);
    const ny = (floors - edgeFloors) * fh;
    wpoly(ctx, m, [[x0 - 0.6, ny - 0.4, z0 - 0.5], [x1 + 0.6, ny - 0.4, z0 - 0.5], [x1 + 0.6, ny + 0.6, z0 - 2], [x0 - 0.6, ny + 0.6, z0 - 2]]); ctx.fill();
  }
  if (hoist) {
    // construction hoist: mast + cage on the facade
    const hx = x1 - 6;
    ctx.strokeStyle = css(L.col(P.steel, z0 - 1.5)); ctx.lineWidth = Math.max(1, (m.f * 0.12) / z0);
    line3(ctx, m, [hx, 0, z0 - 1.5], [hx, topY + 2, z0 - 1.5]); line3(ctx, m, [hx + 1, 0, z0 - 1.5], [hx + 1, topY + 2, z0 - 1.5]);
    cuboid(ctx, m, L, hx + 1, hx + 3.4, fh * Math.floor(floors * 0.3), fh * Math.floor(floors * 0.3) + 2.4, z0 - 2.6, z0 - 1, P.machine, { shadow: false });
  }
  if (scaffold) scaffoldGrid(ctx, m, L, { ...scaffold, z: z0 - 1.2 });
  // ghost of the remaining levels (planned height), very faint
  if (total && total > floors) {
    ctx.strokeStyle = css(L.col(P.slab, z0), 0.2); ctx.setLineDash([3, 4]); ctx.lineWidth = 1;
    wpoly(ctx, m, [[x0, topY, z0], [x0, total * fh, z0], [x1, total * fh, z0], [x1, topY, z0]], false); ctx.stroke();
    ctx.setLineDash([]);
  }
}

/** Distance at which a structure of height `top` keeps its top inside the frame (top margin `frac` of H). */
function zToFit(m, top, frac = 0.12) {
  return (m.f * Math.max(0, top - m.hc)) / Math.max(30, m.horizonY - H * frac);
}

function scaffoldGrid(ctx, m, L, { x0, x1, y0 = 0, y1, z, net = false }) {
  ctx.strokeStyle = css(L.col(P.tube, z)); ctx.lineWidth = 1;
  for (let x = x0; x <= x1 + 0.01; x += 2.5) line3(ctx, m, [x, y0, z], [x, y1, z]);
  for (let y = y0; y <= y1 + 0.01; y += 2) line3(ctx, m, [x0, y, z], [x1, y, z]);
  ctx.globalAlpha = 0.55;
  for (let x = x0; x < x1 - 2.4; x += 5) line3(ctx, m, [x, y0, z], [x + 5, Math.min(y1, y0 + 4), z]);
  ctx.globalAlpha = 1;
  ctx.fillStyle = css(L.col(P.board, z));
  for (let y = y0 + 2; y <= y1; y += 2) { wpoly(ctx, m, [[x0, y - 0.12, z - 0.3], [x1, y - 0.12, z - 0.3], [x1, y + 0.06, z - 0.3], [x0, y + 0.06, z - 0.3]]); ctx.fill(); }
  if (net) { ctx.fillStyle = css(L.col(P.net, z), 0.42); wpoly(ctx, m, [[x0, y0 + 2, z - 0.6], [x1, y0 + 2, z - 0.6], [x1, y1, z - 0.6], [x0, y1, z - 0.6]]); ctx.fill(); }
}

function towerMast(ctx, m, L, cr) {
  const { X, Z, height } = cr;
  const w = 1.8;
  ctx.strokeStyle = css(L.col(P.crane, Z)); ctx.lineWidth = Math.max(1, (m.f * 0.25) / Z);
  line3(ctx, m, [X - w / 2, 0, Z], [X - w / 2, height, Z]);
  line3(ctx, m, [X + w / 2, 0, Z], [X + w / 2, height, Z]);
  ctx.lineWidth = Math.max(0.6, (m.f * 0.1) / Z);
  for (let y = 0; y < height; y += w) { line3(ctx, m, [X - w / 2, y, Z], [X + w / 2, y + w, Z]); line3(ctx, m, [X - w / 2, y + w, Z], [X + w / 2, y + w, Z]); }
  // cab + slewing ring + apex
  cuboid(ctx, m, L, X - 1.6, X + 1.2, height, height + 2.2, Z - 1.2, Z + 1.2, P.cab);
  ctx.strokeStyle = css(L.col(P.craneDark, Z)); ctx.lineWidth = Math.max(1, (m.f * 0.2) / Z);
  line3(ctx, m, [X, height + 2.2, Z], [X, height + 9, Z]);
  // base ballast
  cuboid(ctx, m, L, X - 3, X + 3, 0, 1.2, Z - 3, Z + 3, P.counter);
}

function mobileCarrier(ctx, m, L, cr) {
  const { X, Z } = cr;
  cuboid(ctx, m, L, X - 6, X + 6, 0.9, 3, Z - 1.4, Z + 1.4, P.crane);
  cuboid(ctx, m, L, X + 3.5, X + 6.3, 3, 5, Z - 1.3, Z + 1.3, P.cab);
  cuboid(ctx, m, L, X - 2.4, X + 1.6, 3, 4.6, Z - 1.2, Z + 1.2, P.crane, { front: 0.92 });
  ctx.fillStyle = css(L.col(P.tyre, Z));
  for (let x = -4.5; x <= 4.5; x += 3) { const c = wp(m, X + x, 0.6, Z - 1.4); const r = Math.max(1.5, (m.f * 0.6) / Z); ctx.beginPath(); ctx.arc(c[0], c[1], r, 0, Math.PI * 2); ctx.fill(); }
  // outriggers
  ctx.strokeStyle = css(L.col(P.steel, Z)); ctx.lineWidth = Math.max(1, (m.f * 0.2) / Z);
  line3(ctx, m, [X - 5, 0.6, Z - 1.4], [X - 6.5, 0, Z - 4]); line3(ctx, m, [X + 5, 0.6, Z - 1.4], [X + 6.5, 0, Z - 4]);
}

function stackRebar(ctx, m, L, x, z, len = 9) {
  for (let k = 0; k < 3; k += 1) cuboid(ctx, m, L, x, x + len, k * 0.35, k * 0.35 + 0.3, z + k * 0.2, z + 1.2 + k * 0.2, P.rebar, { top: 1.25 });
  cuboid(ctx, m, L, x + 0.5, x + 0.9, 0, 0.12, z - 0.2, z + 1.6, P.pallet);
}
function container(ctx, m, L, x, z, hex, len = 6) {
  cuboid(ctx, m, L, x, x + len, 0, 2.6, z, z + 2.4, hex);
  ctx.strokeStyle = css(L.col(hex, z, 0.75)); ctx.lineWidth = 1;
  for (let k = 0.4; k < len; k += 0.5) line3(ctx, m, [x + k, 0.1, z], [x + k, 2.5, z]);
}

function drawPresetStatic(ctx, m, L) {
  const { rng } = m;
  const zg = m.zMinGround;
  const lv = m.levels || null;
  const dyn = { crane: null, workers: [], vehicle: null };
  const addWorkers = (n, zA, zB, xA, xB, y = 0) => {
    for (let i = 0; i < n; i += 1) {
      const z = lerp(zA, zB, rng());
      dyn.workers.push({ x0: lerp(xA, xB, rng()), range: 3 + rng() * 7, z, y, speed: 0.6 + rng() * 0.6, phase: rng() * 10, vest: rng() < 0.55 ? 'O' : 'L', helmet: rng() < 0.6 ? 'W' : 'Y', idle: rng() < 0.25 });
    }
  };
  switch (m.preset) {
    case 'frame': {
      const near = zg * 1.06 + 2;
      const floors = clamp(lv && lv.done ? lv.done : 16, 3, 40);
      const topY = floors * 3.6;
      // far enough that the working deck (edge protection, formwork) stays in the picture
      const z0 = clamp(Math.max(near + 14, zToFit(m, topY + 5, 0.14)), near + 14, 340);
      const wM = clamp((0.5 * W * z0) / m.f, 26, 110);
      const x1 = -0.06 * wM; const x0 = x1 - wM;
      frameBuilding(ctx, m, L, { x0, x1, z0, depth: clamp(wM * 0.55, 16, 40), floors, total: lv && lv.total, rng, hoist: true, scaffold: { x0, x1: x0 + wM * 0.3, y1: Math.min(topY, 7 * 3.6) } });
      const cHeight = topY + 18;
      const cr = { type: 'tower', X: x1 + wM * 0.28, Z: Math.max(z0 + 12, zToFit(m, cHeight + 9, 0.05)), height: cHeight, jib: clamp(wM * 0.9, 40, 70), counter: 16 };
      towerMast(ctx, m, L, cr);
      dyn.crane = cr;
      stackRebar(ctx, m, L, 2, near + 8, 10);
      container(ctx, m, L, 12, near + 12, P.contB);
      container(ctx, m, L, 19, near + 12, P.contG);
      for (let k = 0; k < 4; k += 1) cuboid(ctx, m, L, -6 + k * 1.7, -4.6 + k * 1.7, 0, 1.1, near + 4, near + 5.2, P.block);
      addWorkers(3, near + 1, near + 9, -8, 10);
      dyn.vehicle = { kind: 'mixer', z: near + 4.5, y: 0, speed: 2.8, span: 70 };
      break;
    }
    case 'midrise': {
      const z0 = Math.max(40, zg * 1.15 + 6);
      const floors = clamp(lv && lv.done ? lv.done : 8, 3, 12);
      frameBuilding(ctx, m, L, { x0: -38, x1: -2, z0, depth: 18, floors, total: lv && lv.total, finished: true, rng, scaffold: { x0: -38, x1: -2, y1: floors * 3.3, net: true }, fh: 3.3 });
      frameBuilding(ctx, m, L, { x0: 10, x1: 40, z0: z0 + 30, depth: 18, floors, finished: true, rng, fh: 3.3 });
      // material hoist tower
      ctx.strokeStyle = css(L.col(P.steel, z0 - 2)); ctx.lineWidth = 1.2;
      line3(ctx, m, [-20, 0, z0 - 2.4], [-20, floors * 3.3 + 3, z0 - 2.4]); line3(ctx, m, [-18.4, 0, z0 - 2.4], [-18.4, floors * 3.3 + 3, z0 - 2.4]);
      const cr = { type: 'tower', X: 26, Z: Math.max(z0 + 70, zToFit(m, floors * 3.3 + 39, 0.05)), height: floors * 3.3 + 30, jib: 46, counter: 14 };
      towerMast(ctx, m, L, cr);
      dyn.crane = cr;
      for (let k = 0; k < 3; k += 1) cuboid(ctx, m, L, 4 + k * 2.2, 5.8 + k * 2.2, 0, 1.1, z0 - 9, z0 - 7.6, P.block);
      addWorkers(3, z0 - 10, z0 - 4, -8, 14);
      addWorkers(2, z0 - 1.6, z0 - 1.4, -34, -6, 3 * 3.3);
      dyn.vehicle = { kind: 'pickup', z: z0 - 13, y: 0, speed: 3.2, span: 60 };
      break;
    }
    case 'yard': {
      const z0 = Math.max(28, zg * 1.1 + 4);
      const yFloors = clamp(lv && lv.done ? lv.done : 14, 3, 40);
      const yZ = Math.max(z0 + 110, zToFit(m, yFloors * 3.6 + 5, 0.14));
      frameBuilding(ctx, m, L, { x0: -0.55 * (yZ / m.f) * W, x1: -0.12 * (yZ / m.f) * W, z0: yZ, depth: 30, floors: yFloors, total: lv && lv.total, rng });
      // workshop shed: columns + roof
      ctx.strokeStyle = css(L.col(P.steel, z0 + 14)); ctx.lineWidth = 2;
      for (let x = -30; x <= -8; x += 5.5) line3(ctx, m, [x, 0, z0 + 14], [x, 6, z0 + 14]);
      ctx.fillStyle = css(L.col(P.roof, z0 + 14, 0.95));
      wpoly(ctx, m, [[-31, 6, z0 + 14], [-7, 6, z0 + 14], [-7, 7.2, z0 + 26], [-31, 7.2, z0 + 26]]); ctx.fill();
      ctx.fillStyle = css(L.col(P.interior, z0 + 20));
      wpoly(ctx, m, [[-30, 0, z0 + 24], [-8, 0, z0 + 24], [-8, 6, z0 + 24], [-30, 6, z0 + 24]]); ctx.fill();
      stackRebar(ctx, m, L, -4, z0 + 4, 10);
      stackRebar(ctx, m, L, 8, z0 + 9, 8);
      container(ctx, m, L, 16, z0 + 16, P.contR);
      container(ctx, m, L, 23, z0 + 16, P.contG);
      for (let k = 0; k < 4; k += 1) cuboid(ctx, m, L, -2 + k * 1.6, -0.8 + k * 1.6, 0, 1, z0 + 1, z0 + 2.2, P.block);
      const cr = { type: 'tower', X: -0.02 * (yZ / m.f) * W, Z: Math.max(yZ + 20, zToFit(m, yFloors * 3.6 + 27, 0.05)), height: yFloors * 3.6 + 18, jib: 50, counter: 15 };
      towerMast(ctx, m, L, cr);
      dyn.crane = cr;
      addWorkers(4, z0, z0 + 10, -14, 18);
      dyn.vehicle = { kind: 'flatbed', z: z0 + 0.4, y: 0, speed: 2.6, span: 64 };
      break;
    }
    case 'gate': {
      const z0 = Math.max(16, zg * 1.08 + 2);
      // road with lane markings
      ctx.fillStyle = css(L.col(P.road, z0 + 20));
      wpoly(ctx, m, [[-4, 0, z0 - 4], [6, 0, z0 - 4], [6, 0, 400], [-4, 0, 400]]); ctx.fill();
      ctx.strokeStyle = css(L.col(P.mark, z0 + 10)); ctx.lineWidth = 1.4;
      for (let z = z0; z < 200; z += 8) line3(ctx, m, [1, 0, z], [1, 0, z + 4]);
      // painted kerbs (yellow / black) along both edges
      for (const kx of [-4.2, 6]) for (let z = z0 - 4, k = 0; z < 120; z += 1.5, k += 1) cuboid(ctx, m, L, kx, kx + 0.25, 0, 0.18, z, z + 1.5, k % 2 ? '#2A2A28' : '#E2C12A', { shadow: false, top: 1.05 });
      // hoarding fence along the road, gate posts, guard cabin, barrier arm
      ctx.fillStyle = css(L.col(P.fence, z0 + 10));
      wpoly(ctx, m, [[-6, 0, z0 + 6], [-6, 2.4, z0 + 6], [-6, 2.4, 160], [-6, 0, 160]]); ctx.fill();
      wpoly(ctx, m, [[8, 0, z0 + 6], [8, 2.4, z0 + 6], [8, 2.4, 160], [8, 0, 160]]); ctx.fill();
      ctx.strokeStyle = css(L.col(P.fenceDark, z0 + 10)); ctx.lineWidth = 1;
      for (let z = z0 + 6; z < 140; z += 3) { line3(ctx, m, [-6, 0, z], [-6, 2.4, z]); line3(ctx, m, [8, 0, z], [8, 2.4, z]); }
      cuboid(ctx, m, L, -12, -7, 0, 2.8, z0, z0 + 3.4, P.cab);
      ctx.fillStyle = css(L.col(P.glass, z0));
      wpoly(ctx, m, [[-11, 1.2, z0 - 0.02], [-8, 1.2, z0 - 0.02], [-8, 2.3, z0 - 0.02], [-11, 2.3, z0 - 0.02]]); ctx.fill();
      cuboid(ctx, m, L, -6.4, -5.6, 0, 1.2, z0 + 4, z0 + 4.6, P.barrierR);
      ctx.strokeStyle = css(L.col(P.barrierR, z0 + 4)); ctx.lineWidth = 2.2;
      line3(ctx, m, [-6, 1.1, z0 + 4.3], [-0.5, 3.8, z0 + 4.3]);
      ctx.strokeStyle = css(L.col(P.barrierW, z0 + 4)); ctx.lineWidth = 2.2; ctx.setLineDash([5, 5]);
      line3(ctx, m, [-6, 1.1, z0 + 4.3], [-0.5, 3.8, z0 + 4.3]); ctx.setLineDash([]);
      // site safety board on posts: header band, mandatory-PPE discs and a warning triangle (no text)
      ctx.strokeStyle = css(L.col(P.steel, z0 + 2)); ctx.lineWidth = Math.max(1, (m.f * 0.1) / z0);
      line3(ctx, m, [9.3, 0, z0 + 2.1], [9.3, 1.3, z0 + 2.1]); line3(ctx, m, [12.7, 0, z0 + 2.1], [12.7, 1.3, z0 + 2.1]);
      cuboid(ctx, m, L, 9, 13, 1.3, 3.8, z0 + 2, z0 + 2.15, '#F2F2EE', { shadow: false });
      cuboid(ctx, m, L, 9, 13, 3.3, 3.8, z0 + 1.98, z0 + 2.0, '#1F7A3A', { shadow: false });
      ctx.fillStyle = css(L.col('#2F5FC8', z0 + 2));
      for (let k = 0; k < 3; k += 1) { const c = wp(m, 9.7 + k * 1.05, 2.5, z0 + 1.97); ctx.beginPath(); ctx.arc(c[0], c[1], Math.max(1.5, (m.f * 0.38) / (z0 + 2)), 0, Math.PI * 2); ctx.fill(); }
      ctx.fillStyle = css(L.col('#E8B820', z0 + 2));
      { const a = wp(m, 12.5, 2.95, z0 + 1.97); const b = wp(m, 12.05, 2.1, z0 + 1.97); const c = wp(m, 12.95, 2.1, z0 + 1.97); ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.lineTo(c[0], c[1]); ctx.closePath(); ctx.fill(); }
      const gFloors = clamp(lv && lv.done ? lv.done : 12, 3, 40);
      const gZ = Math.max(z0 + 120, zToFit(m, gFloors * 3.6 + 5, 0.14));
      frameBuilding(ctx, m, L, { x0: 0.08 * (gZ / m.f) * W, x1: 0.42 * (gZ / m.f) * W, z0: gZ, depth: 30, floors: gFloors, total: lv && lv.total, rng });
      const cr = { type: m.kind === 'desert' ? 'mobile' : 'tower', X: m.kind === 'desert' ? 30 : 0.02 * (gZ / m.f) * W, Z: m.kind === 'desert' ? z0 + 150 : Math.max(gZ + 20, zToFit(m, gFloors * 3.6 + 27, 0.05)), height: gFloors * 3.6 + 18, jib: 48, counter: 14, boom: 34 };
      if (cr.type === 'tower') towerMast(ctx, m, L, cr); else mobileCarrier(ctx, m, L, cr);
      dyn.crane = cr;
      addWorkers(2, z0 + 2, z0 + 7, -4, 6);
      dyn.vehicle = { kind: 'dump', z: z0 + 12, y: 0, speed: 2.4, span: 54, across: true };
      break;
    }
    case 'trench': {
      const z0 = Math.max(18, zg * 1.08 + 2);
      // trench band + shoring boxes + spoil heap
      ctx.fillStyle = css(L.col(P.soilDark, z0 + 3, 0.6));
      wpoly(ctx, m, [[-60, 0, z0 + 2], [60, 0, z0 + 2], [60, 0, z0 + 5], [-60, 0, z0 + 5]]); ctx.fill();
      for (let x = -14; x < 14; x += 4.2) cuboid(ctx, m, L, x, x + 3.8, 0, 1.0, z0 + 1.8, z0 + 2.1, P.steel);
      ctx.fillStyle = css(L.col(P.soil, z0 + 9));
      wpath(ctx, [proj(m, -40, 0, z0 + 8), proj(m, -28, 3.2, z0 + 10), proj(m, -16, 2.2, z0 + 11), proj(m, -6, 0, z0 + 12)], true); ctx.fill();
      for (let k = 0; k < 3; k += 1) cuboid(ctx, m, L, 16, 18.4, k * 0.9, k * 0.9 + 0.8, z0 + 6, z0 + 8.4, '#A9A69E');
      for (let x = -12; x < 12; x += 2.2) cuboid(ctx, m, L, x, x + 2, 0, 0.9, z0 + 0.4, z0 + 0.9, Math.round(x) % 2 ? P.barrierR : P.barrierW);
      frameBuilding(ctx, m, L, { x0: -60, x1: -18, z0: z0 + 60, depth: 18, floors: 9, finished: true, rng, fh: 3.3 });
      frameBuilding(ctx, m, L, { x0: 0, x1: 40, z0: z0 + 72, depth: 18, floors: 9, finished: true, rng, fh: 3.3, scaffold: { x0: 0, x1: 40, y1: 29, net: true } });
      const cr = { type: 'mobile', X: -8, Z: z0 + 40, boom: 30 };
      mobileCarrier(ctx, m, L, cr);
      dyn.crane = cr;
      addWorkers(3, z0 - 1, z0 + 7, -10, 10);
      dyn.vehicle = { kind: 'pickup', z: z0 + 16, y: 0, speed: 3, span: 60 };
      break;
    }
    case 'solar': {
      const zStart = Math.max(12, zg * 1.05);
      for (let z = 360; z >= zStart; z -= 7.5) {
        const zc = z;
        ctx.fillStyle = css(L.col(P.pile, zc));
        for (let x = -70; x <= 70; x += 7) { wpoly(ctx, m, [[x, 0, zc + 1], [x + 0.25, 0, zc + 1], [x + 0.25, 1.3, zc + 1], [x, 1.3, zc + 1]]); ctx.fill(); }
        // module face tilted towards the camera: low edge near, high edge far
        ctx.fillStyle = css(L.col(P.panel, zc));
        wpoly(ctx, m, [[-72, 1.0, zc], [72, 1.0, zc], [72, 2.4, zc + 2.2], [-72, 2.4, zc + 2.2]]); ctx.fill();
        if (zc < 160) {
          ctx.fillStyle = css(L.col(P.panelHi, zc), L.ir ? 0.25 : 0.45);   // sky reflection on the upper half
          wpoly(ctx, m, [[-72, 1.8, zc + 1.2], [72, 1.8, zc + 1.2], [72, 2.4, zc + 2.2], [-72, 2.4, zc + 2.2]]); ctx.fill();
          ctx.strokeStyle = css(L.col('#C9D2DA', zc), 0.5); ctx.lineWidth = 0.7;
          line3(ctx, m, [-72, 2.4, zc + 2.2], [72, 2.4, zc + 2.2]);
          if (zc < 40) { ctx.strokeStyle = css(L.col('#C9D2DA', zc), 0.22); for (let x = -72; x <= 72; x += 4.2) line3(ctx, m, [x, 1.0, zc], [x, 2.4, zc + 2.2]); }
        }
      }
      const cr = { type: 'mobile', X: 26, Z: zStart + 70, boom: 28 };
      mobileCarrier(ctx, m, L, cr);
      dyn.crane = cr;
      addWorkers(4, zStart + 2, zStart + 12, -12, 14);
      dyn.vehicle = { kind: 'pickup', z: zStart + 5, y: 0, speed: 3.4, span: 70 };
      break;
    }
    case 'warehouse': {
      const zStart = Math.max(26, zg * 1.1 + 4);
      ctx.fillStyle = css(L.col('#B8B4AA', zStart + 30));
      wpoly(ctx, m, [[-26, 0.02, zStart], [26, 0.02, zStart], [26, 0.02, zStart + 96], [-26, 0.02, zStart + 96]]); ctx.fill();
      for (let i = 9; i >= 0; i -= 1) {
        const z = zStart + i * 9.6;
        ctx.strokeStyle = css(L.col(P.steel, z)); ctx.lineWidth = Math.max(1, (m.f * 0.45) / z);
        wpoly(ctx, m, [[-24, 0, z], [-24, 11, z], [0, 14.5, z], [24, 11, z], [24, 0, z]], false); ctx.stroke();
        if (i >= 5) {
          ctx.fillStyle = css(L.col(P.roof, z, 1.02));
          wpoly(ctx, m, [[-24, 11, z], [0, 14.5, z], [0, 14.5, z + 9.6], [-24, 11, z + 9.6]]); ctx.fill();
        }
      }
      ctx.strokeStyle = css(L.col(P.steelLight, zStart + 40)); ctx.lineWidth = 0.8;
      for (let k = 0; k <= 6; k += 1) { const x = -24 + k * 4; const y = 11 + (3.5 * k) / 6; line3(ctx, m, [x, y, zStart], [x, y, zStart + 86]); }
      cuboid(ctx, m, L, 6, 9, 0, 1.6, zStart + 6, zStart + 8, '#C0452C');
      ctx.strokeStyle = css(L.col(P.steel, zStart + 7)); ctx.lineWidth = 1; line3(ctx, m, [6.4, 1.6, zStart + 7], [8.6, 6.5, zStart + 7]); line3(ctx, m, [8.6, 1.6, zStart + 7], [6.4, 6.5, zStart + 7]);
      cuboid(ctx, m, L, 5.6, 9.4, 6.5, 6.8, zStart + 5.6, zStart + 8.4, '#C0452C');
      const cr = { type: 'mobile', X: -36, Z: zStart + 30, boom: 34 };
      mobileCarrier(ctx, m, L, cr);
      dyn.crane = cr;
      addWorkers(3, zStart + 2, zStart + 14, -16, 16);
      dyn.workers.push({ x0: 7.5, range: 0.8, z: zStart + 7, y: 6.8, speed: 0.4, phase: 1, vest: 'O', helmet: 'W', idle: true });
      dyn.vehicle = { kind: 'forklift', z: zStart + 4, y: 0, speed: 2, span: 40 };
      break;
    }
    case 'earthworks':
    default: {
      const zStart = Math.max(16, zg * 1.05);
      // terraced benches receding
      const benches = [[zStart + 20, 0, P.soil], [zStart + 34, 3, P.soilLight], [zStart + 52, 6, P.soil], [zStart + 80, 9, P.soilLight]];
      for (let i = benches.length - 1; i >= 0; i -= 1) {
        const [z, y, hex] = benches[i];
        ctx.fillStyle = css(L.col(hex, z));
        wpoly(ctx, m, [[-140, y, z], [140, y, z], [140, y + 3, z + 4], [-140, y + 3, z + 4]]); ctx.fill();
        ctx.fillStyle = css(L.col(hex, z + 6, 1.08));
        wpoly(ctx, m, [[-140, y + 3, z + 4], [140, y + 3, z + 4], [140, y + 3, z + 14], [-140, y + 3, z + 14]]); ctx.fill();
      }
      // excavator on the first bench (tracks, house, boom, arm, bucket)
      const ex = -14; const ez = zStart + 24;
      cuboid(ctx, m, L, ex - 2.4, ex + 2.4, 3, 3.9, ez - 1.6, ez + 1.6, P.tyre);
      cuboid(ctx, m, L, ex - 1.8, ex + 2.2, 3.9, 6, ez - 1.4, ez + 1.4, P.machine);
      cuboid(ctx, m, L, ex + 0.6, ex + 2.2, 6, 7.4, ez - 1.2, ez + 0.2, P.glass);
      ctx.strokeStyle = css(L.col(P.machine, ez)); ctx.lineWidth = Math.max(1.5, (m.f * 0.5) / ez);
      wpoly(ctx, m, [[ex + 2, 5.4, ez], [ex + 6.5, 9.2, ez], [ex + 9.5, 4.2, ez]], false); ctx.stroke();
      ctx.fillStyle = css(L.col(P.tyre, ez)); wpoly(ctx, m, [[ex + 9, 4.4, ez], [ex + 10.6, 4.0, ez], [ex + 10.2, 3.1, ez], [ex + 8.8, 3.3, ez]]); ctx.fill();
      // dust haze patches
      for (let k = 0; k < 4; k += 1) {
        const c = wp(m, -30 + k * 20, 2, zStart + 30 + k * 6);
        const g = ctx.createRadialGradient(c[0], c[1], 2, c[0], c[1], 60);
        g.addColorStop(0, css(L.col(P.soilLight, 40), 0.28)); g.addColorStop(1, css(L.col(P.soilLight, 40), 0));
        ctx.fillStyle = g; ctx.fillRect(c[0] - 60, c[1] - 60, 120, 120);
      }
      const cr = { type: 'mobile', X: 40, Z: zStart + 160, boom: 34 };
      mobileCarrier(ctx, m, L, cr);
      dyn.crane = cr;
      addWorkers(2, zStart + 3, zStart + 9, -6, 12);
      dyn.vehicle = { kind: 'dump', z: zStart + 10, y: 0, speed: 3.2, span: 80 };
      break;
    }
  }
  return dyn;
}

/** Depth haze over the plate + infrared fall-off at night. */
function drawAtmosphere(ctx, m, L) {
  const g = ctx.createLinearGradient(0, m.horizonY - 40, 0, m.horizonY + 70);
  const c = L.ir ? [70, 74, 75] : L.haze;
  g.addColorStop(0, css(c, 0));
  g.addColorStop(0.5, css(c, L.ir ? 0.2 : 0.32));
  g.addColorStop(1, css(c, 0));
  ctx.fillStyle = g;
  ctx.fillRect(0, m.horizonY - 40, W, 110);
  if (L.ir) {
    const r = ctx.createRadialGradient(W / 2, H * 1.05, 40, W / 2, H * 0.9, W * 0.8);
    r.addColorStop(0, 'rgba(255,255,255,0.10)');
    r.addColorStop(1, 'rgba(0,0,0,0.38)');
    ctx.fillStyle = r;
    ctx.fillRect(0, 0, W, H);
  }
}

/* ────────────────────────────── dynamic layer ────────────────────────────── */

function drawCrane(ctx, m, L, cr, t) {
  if (!cr) return;
  const blinkOn = Math.floor(t * 1.1) % 2 === 0;
  if (cr.type === 'tower') {
    const phi = 0.9 + 0.5 * Math.sin((2 * Math.PI * t) / 150);     // slow slew (≈ 2.5 min period)
    const top = cr.height + 2.2;
    const dx = Math.cos(phi); const dz = Math.sin(phi);
    const tip = [cr.X + cr.jib * dx, top + 0.6, cr.Z + cr.jib * dz];
    const back = [cr.X - cr.counter * dx, top + 0.4, cr.Z - cr.counter * dz];
    const apex = [cr.X, top + 7, cr.Z];
    const sw = Math.max(1, (m.f * 0.22) / cr.Z);
    ctx.strokeStyle = css(L.col(P.crane, cr.Z)); ctx.lineWidth = sw;
    const a = wp(m, cr.X, top, cr.Z); const b = wp(m, tip[0], tip[1], tip[2]); const c = wp(m, back[0], back[1], back[2]);
    const at = wp(m, tip[0], tip[1] + 1.6, tip[2]); const ap = wp(m, apex[0], apex[1], apex[2]);
    ctx.beginPath(); ctx.moveTo(c[0], c[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
    const topChord = wp(m, cr.X, top + 1.8, cr.Z);
    ctx.lineWidth = Math.max(0.7, sw * 0.55);
    ctx.beginPath(); ctx.moveTo(topChord[0], topChord[1]); ctx.lineTo(at[0], at[1]); ctx.stroke();
    // lattice zigzag (8 bays)
    ctx.beginPath();
    for (let i = 0; i <= 8; i += 1) {
      const k = i / 8;
      const lo = [lerp(a[0], b[0], k), lerp(a[1], b[1], k)];
      const hi = [lerp(topChord[0], at[0], k), lerp(topChord[1], at[1], k)];
      if (i === 0) ctx.moveTo(lo[0], lo[1]);
      ctx.lineTo(hi[0], hi[1]);
      if (i < 8) ctx.lineTo(lerp(a[0], b[0], k + 1 / 16), lerp(a[1], b[1], k + 1 / 16));
    }
    ctx.stroke();
    // pendants from the apex
    ctx.strokeStyle = css(L.col(P.craneDark, cr.Z), 0.8); ctx.lineWidth = 0.8;
    ctx.beginPath(); ctx.moveTo(ap[0], ap[1]); ctx.lineTo(lerp(a[0], b[0], 0.66), lerp(a[1], b[1], 0.66)); ctx.moveTo(ap[0], ap[1]); ctx.lineTo(c[0], c[1]); ctx.stroke();
    // counterweight
    ctx.fillStyle = css(L.col(P.counter, cr.Z));
    const cw = Math.max(3, (m.f * 2.4) / cr.Z);
    ctx.fillRect(c[0] - cw / 2, c[1], cw, cw * 0.8);
    // trolley + hook + load
    const k = 0.45 + 0.18 * Math.sin((2 * Math.PI * t) / 47);
    const tr = [lerp(tip[0], cr.X, 1 - k), top + 0.4, lerp(tip[2], cr.Z, 1 - k)];
    const hookY = Math.max(6, top * (0.35 + 0.12 * Math.sin((2 * Math.PI * t) / 63)));
    const trs = wp(m, tr[0], tr[1], tr[2]); const hk = wp(m, tr[0], hookY, tr[2]);
    ctx.strokeStyle = css(L.col('#2A2C2E', cr.Z), 0.9); ctx.lineWidth = 0.8;
    ctx.beginPath(); ctx.moveTo(trs[0], trs[1]); ctx.lineTo(hk[0], hk[1]); ctx.stroke();
    const lw = Math.max(4, (m.f * 4.5) / tr[2]); const lh = Math.max(2, (m.f * 0.8) / tr[2]);
    ctx.fillStyle = css(L.col(P.rebar, tr[2], 1.1));
    ctx.fillRect(hk[0] - lw / 2, hk[1], lw, lh);
    // aviation lights
    if (blinkOn || !L.ir) {
      ctx.fillStyle = L.ir ? 'rgba(255,255,255,0.95)' : 'rgba(235,40,30,0.95)';
      const s = blinkOn ? 2.2 : 1.4;
      ctx.fillRect(ap[0] - s / 2, ap[1] - s / 2, s, s);
      ctx.fillRect(b[0] - s / 2, b[1] - s / 2, s, s);
    }
    return;
  }
  // mobile crane: telescopic boom elevated ~58°, slewing slowly
  const phi = -0.6 + 0.55 * Math.sin((2 * Math.PI * t) / 130);
  const el = (58 * Math.PI) / 180;
  const Lb = cr.boom || 30;
  const pivot = [cr.X - 0.4, 4.4, cr.Z];
  const tip = [pivot[0] + Lb * Math.cos(el) * Math.sin(phi), pivot[1] + Lb * Math.sin(el), pivot[2] + Lb * Math.cos(el) * Math.cos(phi) * 0.6];
  const a = wp(m, pivot[0], pivot[1], pivot[2]); const b = wp(m, tip[0], tip[1], tip[2]);
  ctx.strokeStyle = css(L.col(P.crane, cr.Z)); ctx.lineWidth = Math.max(1.4, (m.f * 0.55) / cr.Z);
  ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
  const hookY = Math.max(2, tip[1] * (0.3 + 0.1 * Math.sin((2 * Math.PI * t) / 41)));
  const hk = wp(m, tip[0], hookY, tip[2]);
  ctx.strokeStyle = css(L.col('#2A2C2E', cr.Z), 0.9); ctx.lineWidth = 0.8;
  ctx.beginPath(); ctx.moveTo(b[0], b[1]); ctx.lineTo(hk[0], hk[1]); ctx.stroke();
  const lw = Math.max(3, (m.f * 3) / tip[2]);
  ctx.fillStyle = css(L.col(P.steelLight, tip[2]));
  ctx.fillRect(hk[0] - lw / 2, hk[1], lw, Math.max(2, lw * 0.3));
  if (blinkOn) { ctx.fillStyle = L.ir ? 'rgba(255,255,255,0.95)' : 'rgba(235,40,30,0.95)'; ctx.fillRect(b[0] - 1, b[1] - 1, 2, 2); }
}

/** One worker: legs swing while walking; flagged items (PPE event) are drawn missing. */
function drawWorker(ctx, m, L, w, t, missing) {
  const along = w.idle ? Math.sin((t * w.speed) / 3 + w.phase) * 0.4 : Math.sin((t * w.speed) / w.range + w.phase) * w.range;
  const X = w.x0 + along;
  const base = wp(m, X, w.y, w.z);
  const s = (m.f * 1.0) / w.z;                       // px per metre
  if (s < 3) return null;
  const hgt = 1.75 * s;
  const step = w.idle ? 0 : Math.sin(t * 6 * w.speed + w.phase) * 0.22 * s;
  const x = base[0]; const y = base[1];
  if (w.y === 0) { ctx.fillStyle = 'rgba(0,0,0,0.2)'; ctx.beginPath(); ctx.ellipse(x + s * 0.3, y, s * 0.5, Math.max(0.8, s * 0.12), 0, 0, Math.PI * 2); ctx.fill(); }
  ctx.lineCap = 'round';
  ctx.strokeStyle = css(L.col(P.pants, w.z)); ctx.lineWidth = Math.max(1, s * 0.16);
  ctx.beginPath(); ctx.moveTo(x, y - hgt * 0.47); ctx.lineTo(x - step, y); ctx.moveTo(x, y - hgt * 0.47); ctx.lineTo(x + step, y); ctx.stroke();
  const torsoTop = y - hgt * 0.82; const torsoH = hgt * 0.37; const tw = s * 0.42;
  const vestHex = missing.vest ? P.shirt : (w.vest === 'O' ? P.vestO : P.vestL);
  ctx.fillStyle = css(L.col(vestHex, w.z, L.ir && !missing.vest ? 1.35 : 1));
  ctx.fillRect(x - tw / 2, torsoTop, tw, torsoH);
  if (!missing.vest) { ctx.fillStyle = css(L.col(P.stripe, w.z, L.ir ? 1.3 : 1)); ctx.fillRect(x - tw / 2, torsoTop + torsoH * 0.55, tw, Math.max(1, torsoH * 0.12)); }
  ctx.strokeStyle = css(L.col(vestHex, w.z, 0.85)); ctx.lineWidth = Math.max(1, s * 0.11);
  const arm = w.idle ? 0.1 : -step * 0.6;
  ctx.beginPath(); ctx.moveTo(x - tw / 2, torsoTop + 2); ctx.lineTo(x - tw / 2 - arm * 0.4, torsoTop + torsoH); ctx.moveTo(x + tw / 2, torsoTop + 2); ctx.lineTo(x + tw / 2 + arm * 0.4, torsoTop + torsoH); ctx.stroke();
  const hr = Math.max(1.2, s * 0.12);
  const hy = torsoTop - hr * 1.1;
  ctx.fillStyle = css(L.col(P.skin, w.z));
  ctx.beginPath(); ctx.arc(x, hy, hr, 0, Math.PI * 2); ctx.fill();
  if (!missing.helmet) {
    ctx.fillStyle = css(L.col(w.helmet === 'W' ? P.helmW : P.helmY, w.z, L.ir ? 1.2 : 1));
    ctx.beginPath(); ctx.arc(x, hy - hr * 0.15, hr * 1.12, Math.PI, 0); ctx.fill();
    ctx.fillRect(x - hr * 1.4, hy - hr * 0.2, hr * 2.8, Math.max(1, hr * 0.3));
  }
  ctx.lineCap = 'butt';
  return { x, y, top: hy - hr * 1.4, w: Math.max(tw, hr * 2.8) };
}

function drawVehicle(ctx, m, L, v, t) {
  if (!v) return;
  const period = (2 * v.span) / v.speed + 12;
  const ph = (t % period) / period;
  let X; let dir;
  if (ph < 0.45) { X = -v.span / 2 + (ph / 0.45) * v.span; dir = 1; } else if (ph < 0.5) { X = v.span / 2; dir = 1; } else if (ph < 0.95) { X = v.span / 2 - ((ph - 0.5) / 0.45) * v.span; dir = -1; } else { X = -v.span / 2; dir = -1; }
  const s = m.f / v.z;
  const p = wp(m, X, 0, v.z);
  const len = (v.kind === 'forklift' ? 3 : v.kind === 'pickup' ? 5.2 : 8.4) * s;
  const hgt = (v.kind === 'pickup' ? 1.8 : v.kind === 'forklift' ? 2.2 : 3.2) * s;
  const x = p[0] - len / 2; const y = p[1];
  const cabW = len * (v.kind === 'forklift' ? 0.5 : 0.26);
  const cabX = dir > 0 ? x + len - cabW : x;
  const bodyHex = v.kind === 'dump' ? P.dump : v.kind === 'forklift' ? P.machine : P.truck;
  ctx.fillStyle = 'rgba(0,0,0,0.22)';
  ctx.beginPath(); ctx.ellipse(p[0] + len * 0.08, y, len * 0.56, Math.max(1, hgt * 0.1), 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = css(L.col(P.tyre, v.z));
  ctx.fillRect(x + len * 0.05, y - hgt * 0.32, len * 0.9, hgt * 0.14);
  ctx.fillStyle = css(L.col(P.truck, v.z, 1.02));
  ctx.fillRect(cabX, y - hgt * 0.95, cabW, hgt * 0.65);
  ctx.fillStyle = css(L.col(P.glass, v.z));
  ctx.fillRect(dir > 0 ? cabX + cabW * 0.45 : cabX + cabW * 0.1, y - hgt * 0.88, cabW * 0.45, hgt * 0.25);
  const bx = dir > 0 ? x : x + cabW; const bw = len - cabW;
  if (v.kind === 'mixer') {
    ctx.fillStyle = css(L.col(P.mixer, v.z));
    ctx.beginPath(); ctx.ellipse(bx + bw / 2, y - hgt * 0.62, bw * 0.46, hgt * 0.32, dir > 0 ? -0.12 : 0.12, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = css(L.col('#8E8C86', v.z)); ctx.lineWidth = Math.max(1, s * 0.12);
    const sp = (t * 2) % 1;
    for (let k = 0; k < 3; k += 1) { const xx = bx + bw * (0.2 + 0.3 * ((k + sp) % 3) / 1.5); ctx.beginPath(); ctx.moveTo(xx, y - hgt * 0.9); ctx.lineTo(xx + bw * 0.08, y - hgt * 0.34); ctx.stroke(); }
  } else if (v.kind === 'forklift') {
    ctx.fillStyle = css(L.col(bodyHex, v.z));
    ctx.fillRect(bx, y - hgt * 0.6, bw, hgt * 0.3);
    ctx.strokeStyle = css(L.col(P.steel, v.z)); ctx.lineWidth = Math.max(1, s * 0.15);
    const mx = dir > 0 ? x + len + 0.2 * s : x - 0.2 * s;
    ctx.beginPath(); ctx.moveTo(mx, y); ctx.lineTo(mx, y - hgt * 1.3); ctx.stroke();
  } else {
    ctx.fillStyle = css(L.col(bodyHex, v.z));
    ctx.fillRect(bx, y - hgt * (v.kind === 'pickup' ? 0.55 : 0.85), bw, hgt * (v.kind === 'pickup' ? 0.25 : 0.55));
  }
  ctx.fillStyle = css(L.col(P.tyre, v.z));
  const r = Math.max(1.5, hgt * 0.17);
  const wheels = v.kind === 'pickup' || v.kind === 'forklift' ? [0.2, 0.8] : [0.14, 0.62, 0.8];
  for (const k of wheels) { ctx.beginPath(); ctx.arc(x + len * k, y - r, r, 0, Math.PI * 2); ctx.fill(); }
  if (L.ir || L.phase !== 'day') {
    ctx.fillStyle = L.ir ? 'rgba(255,255,255,0.9)' : 'rgba(255,240,200,0.9)';
    const hx = dir > 0 ? x + len - 1 : x - 1;
    ctx.fillRect(hx, y - hgt * 0.5, 2.4, 2.4);
  }
  // beacon on site plant
  if (Math.floor(t * 2) % 2 === 0) { ctx.fillStyle = L.ir ? 'rgba(255,255,255,0.9)' : 'rgba(255,170,30,0.95)'; ctx.fillRect(cabX + cabW / 2 - 1.2, y - hgt * 0.95 - 2.4, 2.4, 2.4); }
}

function drawBox(ctx, b, text, fontFamily, rtl) {
  const pad = Math.max(4, b.w * 0.6);
  const x0 = b.x - b.w / 2 - pad; const x1 = b.x + b.w / 2 + pad;
  const y0 = b.top - pad * 0.8; const y1 = b.y + pad * 0.4;
  ctx.strokeStyle = 'rgba(255,196,0,0.95)'; ctx.lineWidth = 1.4;
  ctx.setLineDash([4, 3]); ctx.strokeRect(x0, y0, x1 - x0, y1 - y0); ctx.setLineDash([]);
  const c = 5; ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x0, y0 + c); ctx.lineTo(x0, y0); ctx.lineTo(x0 + c, y0);
  ctx.moveTo(x1 - c, y0); ctx.lineTo(x1, y0); ctx.lineTo(x1, y0 + c);
  ctx.moveTo(x0, y1 - c); ctx.lineTo(x0, y1); ctx.lineTo(x0 + c, y1);
  ctx.moveTo(x1 - c, y1); ctx.lineTo(x1, y1); ctx.lineTo(x1, y1 - c);
  ctx.stroke();
  ctx.font = `600 11px ${fontFamily}`;
  ctx.direction = rtl ? 'rtl' : 'ltr';
  ctx.textAlign = 'left';
  const tw = ctx.measureText(text).width;
  const tx = clamp(x0, 4, W - tw - 12);
  const ty = Math.max(16, y0 - 4);
  ctx.fillStyle = 'rgba(20,16,0,0.78)';
  ctx.fillRect(tx, ty - 13, tw + 8, 16);
  ctx.fillStyle = 'rgba(255,214,64,1)';
  if (rtl) { ctx.textAlign = 'right'; ctx.fillText(text, tx + tw + 4, ty); } else ctx.fillText(text, tx + 4, ty);
  ctx.direction = 'ltr';
}

/* ────────────────────────────── renderer (worker or main thread) ────────────────────────────── */

function makeCanvas(w, h) {
  if (typeof OffscreenCanvas === 'function') return new OffscreenCanvas(w, h);
  const c = document.createElement('canvas'); c.width = w; c.height = h; return c;
}

/**
 * Draws one camera: plate (static) + dynamic layer. Pure canvas 2D, no DOM: runs in a worker on two
 * OffscreenCanvases, or on the main thread on two <canvas> elements.
 */
function makeRenderer(plate, dyn, cfg) {
  const camera = cfg.camera || {};
  const labels = cfg.labels || {};
  const fonts = cfg.fonts || { mono: 'monospace', sans: 'sans-serif' };
  const fps = clamp(Number(cfg.fps) || FPS, 1, MAX_FPS);
  const model = buildModel(camera, cfg.preset || camera.scene || 'yard', cfg.kind, cfg.levels);
  const pctx = plate.getContext('2d', { alpha: false });
  const dctx = dyn.getContext('2d');
  let light = null; let lightKey = ''; let dynModel = null;
  let frames = 0; let drawMs = 0; let events = [];
  const t0 = Date.now() - (hash32(String(camera.id)) % 60000);
  // sensor grain: one noise tile, re-offset every frame
  const tile = makeCanvas(160, 160);
  {
    const x = tile.getContext('2d');
    const img = x.createImageData(160, 160);
    const rng = mulberry32(20261110);
    for (let i = 0; i < img.data.length; i += 4) { const v = rng() * 255; img.data[i] = v; img.data[i + 1] = v; img.data[i + 2] = v; img.data[i + 3] = 14 + rng() * 22; }
    x.putImageData(img, 0, 0);
  }
  const grain = dctx.createPattern(tile, 'repeat');
  const grainRng = mulberry32(hash32(`${camera.id}:grain`));

  function ensurePlate(now) {
    const hour = riyadhHour(now);
    const phase = lightPhase(hour);
    const key = `${phase}:${Math.floor(hour * 6)}`;     // re-light every 10 minutes
    if (key === lightKey && dynModel) return false;
    lightKey = key;
    light = makeLight(phase, model.kind);
    model.rng = mulberry32(hash32(String(camera.id || 'cam')));
    pctx.save();
    pctx.fillStyle = light.sky[2]; pctx.fillRect(0, 0, W, H);
    drawSky(pctx, model, light);
    drawSun(pctx, model, light, hour);
    drawFar(pctx, model, light);
    drawGround(pctx, model, light);
    dynModel = drawPresetStatic(pctx, model, light);
    drawAtmosphere(pctx, model, light);
    pctx.restore();
    return true;
  }

  function frame(now) {
    const started = (typeof performance !== 'undefined' ? performance.now() : Date.now());
    ensurePlate(now);
    const t = (now - t0) / 1000;
    dctx.clearRect(0, 0, W, H);
    drawCrane(dctx, model, light, dynModel.crane, t);
    drawVehicle(dctx, model, light, dynModel.vehicle, t);
    // The first ground workers carry the PPE events the caller passed (illustrative boxes only for those).
    const flagged = new Map();
    // nearest ground workers first: the illustrative box sits on the most legible silhouette
    const ground = dynModel.workers.map((w, i) => ({ w, i })).filter((x) => x.w.y === 0).sort((a, b) => a.w.z - b.w.z).map((x) => x.i);
    const pool = ground.length ? ground : dynModel.workers.map((_, i) => i);
    events.slice(0, 2).forEach((ev, k) => { if (pool[k] !== undefined) flagged.set(pool[k], ev); });
    const boxes = [];
    for (const { w, i } of dynModel.workers.map((w, i) => ({ w, i })).sort((a, b) => b.w.z - a.w.z)) {
      const ev = flagged.get(i);
      const bb = drawWorker(dctx, model, light, w, t, { helmet: Boolean(ev && ev.item === 'helmet'), vest: Boolean(ev && ev.item === 'vest') });
      if (ev && bb) boxes.push({ bb, ev });
    }
    for (const { bb, ev } of boxes) {
      const item = labels.ppe && labels.ppe[ev.item] ? labels.ppe[ev.item] : ev.item;
      drawBox(dctx, bb, `${labels.illustrative || 'ILLUSTRATIVE'} · ${item}`, cfg.rtlLabels ? fonts.sans : fonts.mono, Boolean(cfg.rtlLabels));
    }
    // grain
    if (grain) {
      const ox = Math.floor(grainRng() * 160); const oy = Math.floor(grainRng() * 160);
      dctx.save(); dctx.translate(-ox, -oy); dctx.fillStyle = grain; dctx.fillRect(ox, oy, W, H); dctx.restore();
    }
    // burned-in frame counter (Latin, like a camera OSD code)
    frames += 1;
    dctx.font = `500 11px ${fonts.mono}`;
    dctx.textAlign = 'right';
    const fc = `FRM ${String(frames).padStart(6, '0')}  ${fps} FPS SIM`;
    dctx.fillStyle = 'rgba(0,0,0,0.6)'; dctx.fillText(fc, W - 13, H - 11);
    dctx.fillStyle = 'rgba(255,255,255,0.9)'; dctx.fillText(fc, W - 14, H - 12);
    dctx.textAlign = 'left';
    drawMs += (typeof performance !== 'undefined' ? performance.now() : Date.now()) - started;
  }

  return {
    fps,
    frame,
    setEvents(list) { events = Array.isArray(list) ? list.slice(0, 2) : []; },
    stats: () => ({ frames, avgDrawMs: frames ? +(drawMs / frames).toFixed(3) : 0, phase: light ? light.phase : null, ir: Boolean(light && light.ir) }),
  };
}

/** Frame pacing: setTimeout at `fps` (a worker commits OffscreenCanvas frames at the end of each task). */
function makeLoop(renderer, { useRaf = false, onFrame = null, now = () => Date.now() } = {}) {
  const interval = 1000 / renderer.fps;
  let running = false; let timer = 0; let raf = 0;
  function tick() {
    timer = 0;
    if (!running) return;
    const go = () => {
      raf = 0;
      if (!running) return;
      const start = Date.now();
      try { renderer.frame(now()); } catch { running = false; return; }
      if (onFrame) onFrame();
      timer = setTimeout(tick, Math.max(0, interval - (Date.now() - start)));
    };
    if (useRaf && typeof requestAnimationFrame === 'function') raf = requestAnimationFrame(go); else go();
  }
  return {
    run() { if (running) return; running = true; tick(); },
    pause() { running = false; if (timer) { clearTimeout(timer); timer = 0; } if (raf) { cancelAnimationFrame(raf); raf = 0; } },
    still(at) { this.pause(); try { renderer.frame(at || now()); } catch { /* ignore */ } if (onFrame) onFrame(); },
    get running() { return running; },
  };
}

/* ────────────────────────────── worker side (this same file) ────────────────────────────── */

const IS_WORKER = typeof document === 'undefined' && typeof WorkerGlobalScope !== 'undefined' && typeof self !== 'undefined' && self instanceof WorkerGlobalScope;

if (IS_WORKER) {
  let renderer = null; let loop = null; let lastPost = 0; let lastIr = null;
  let pendingMode = null; let pendingEvents = null;   // messages that arrive while the fonts load
  let clockOffset = 0;                                // the page's clock minus this worker's (tests freeze the page clock)
  const sync = (msg) => { if (msg && Number.isFinite(msg.sentAt)) clockOffset = msg.sentAt - Date.now(); };
  const post = (force = false) => {
    if (!renderer) return;
    const now = Date.now();
    const st = renderer.stats();
    if (!force && now - lastPost < 1000 && st.ir === lastIr) return;
    lastPost = now; lastIr = st.ir;
    self.postMessage({ type: 'stats', stats: { ...st, running: Boolean(loop && loop.running) } });
  };
  async function loadFonts(urls) {
    if (!urls || typeof FontFace !== 'function' || !self.fonts) return false;
    const faces = [['CF Mono', urls.mono, '500'], ['CF Sans', urls.sans, '600'], ['CF Arabic', urls.arabic, '600']].filter((f) => f[1]);
    try { await Promise.all(faces.map(async ([family, url, weight]) => { const face = new FontFace(family, `url("${url}")`, { weight }); await face.load(); self.fonts.add(face); })); return true; } catch { return false; }
  }
  self.onmessage = async (e) => {
    const msg = e.data || {};
    sync(msg);
    try {
      if (msg.type === 'init') {
        const fontsOk = await loadFonts(msg.fontUrls);
        const fonts = fontsOk
          ? { mono: '"CF Mono", ui-monospace, monospace', sans: '"CF Arabic", "CF Sans", sans-serif' }
          : { mono: 'ui-monospace, monospace', sans: 'sans-serif' };
        renderer = makeRenderer(msg.plate, msg.dyn, { ...msg.cfg, fonts });
        loop = makeLoop(renderer, { onFrame: () => post(false), now: () => Date.now() + clockOffset });
        if (pendingEvents) renderer.setEvents(pendingEvents);
        const m0 = pendingMode || { type: msg.mode, at: msg.at };
        if (m0.type === 'run') loop.run(); else if (m0.type === 'still') loop.still(m0.at);
        pendingMode = null; pendingEvents = null;
        post(true);
      } else if (!renderer) {
        if (msg.type === 'events') pendingEvents = msg.events;
        else if (msg.type === 'run' || msg.type === 'pause' || msg.type === 'still') pendingMode = msg;
      } else if (msg.type === 'run') { loop.run(); post(true); }
      else if (msg.type === 'pause') { loop.pause(); post(true); }
      else if (msg.type === 'still') { loop.still(msg.at); post(true); }
      else if (msg.type === 'events') { renderer.setEvents(msg.events); if (!loop.running && msg.redraw) loop.still(msg.at); }
      else if (msg.type === 'stats') post(true);
      else if (msg.type === 'destroy') { if (loop) loop.pause(); renderer = null; loop = null; self.close(); }
    } catch (err) {
      self.postMessage({ type: 'error', message: String((err && err.message) || err) });
    }
  };
}

/* ────────────────────────────── main side ────────────────────────────── */

function reducedMotion() {
  try {
    const forced = document.documentElement.getAttribute('data-motion');
    if (forced === 'reduce' || forced === 'reduced') return true;
    if (forced === 'full') return false;
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch { return false; }
}

function canUseWorker() {
  try {
    return typeof Worker === 'function' && typeof OffscreenCanvas === 'function'
      && typeof HTMLCanvasElement !== 'undefined' && typeof HTMLCanvasElement.prototype.transferControlToOffscreen === 'function';
  } catch { return false; }
}

/**
 * @param {HTMLElement} host  element to build the feed into (emptied)
 * @param {{ camera: object, preset?: string, kind?: 'urban'|'desert', levels?: {done:number,total:number},
 *           labels: { simulated: string, illustrative: string, ppe: Record<string,string>, ir: string, zone: string, timeZone: string },
 *           rtlZone?: boolean, rtlLabels?: boolean, fps?: number, onTick?: (date: Date) => void, worker?: boolean }} opts
 */
export function createCamFeed(host, opts = {}) {
  const camera = opts.camera || {};
  const labels = opts.labels || {};
  const fps = clamp(Number(opts.fps) || FPS, 1, MAX_FPS);

  while (host.firstChild) host.removeChild(host.firstChild);
  const frame = document.createElement('div');
  frame.className = 'cf-frame';
  frame.setAttribute('dir', 'ltr');
  frame.setAttribute('aria-hidden', 'true');
  const mkCanvas = (cls) => { const c = document.createElement('canvas'); c.className = cls; c.width = W; c.height = H; return c; };
  let plate = mkCanvas('cf-plate');
  let dyn = mkCanvas('cf-dyn');
  const fx = document.createElement('div'); fx.className = 'cf-fx';
  const osd = document.createElement('div'); osd.className = 'cf-osd';
  const mk = (cls, text, attrs = {}) => { const e = document.createElement('span'); e.className = cls; if (text) e.textContent = text; for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v); return e; };
  const tl = mk('cf-osd-tl');
  tl.append(mk('cf-osd-code', camera.id || ''), mk('cf-osd-zone', labels.zone || '', { dir: opts.rtlZone ? 'rtl' : 'ltr' }));
  const tr = mk('cf-osd-tr');
  const clock = mk('cf-osd-clock', '');
  const mode = mk('cf-osd-mode', '');
  tr.append(clock, mode);
  // the positioned box stays LTR (its logical inset must not flip); the text inside carries its own direction
  const bl = mk('cf-osd-bl');
  bl.append(mk('cf-osd-bl-text', labels.simulated || 'SIMULATED', { dir: opts.rtlLabels ? 'rtl' : 'ltr' }));
  osd.append(tl, tr, bl);
  frame.append(plate, dyn, fx, osd);
  host.appendChild(frame);

  const cssVar = (name, fallback) => { try { return getComputedStyle(host).getPropertyValue(name).trim() || fallback; } catch { return fallback; } };
  const cfg = {
    camera: { ...camera },
    preset: opts.preset || camera.scene || 'yard',
    kind: opts.kind,
    levels: opts.levels ? { ...opts.levels } : null,
    labels: { illustrative: labels.illustrative, ppe: { ...(labels.ppe || {}) } },
    rtlLabels: Boolean(opts.rtlLabels),
    fps,
  };

  let backend = 'main';
  let worker = null;
  let renderer = null;
  let loop = null;
  let remoteStats = { frames: 0, avgDrawMs: 0, phase: null, ir: false, running: false };
  let wanted = false;
  let destroyed = false;
  let visible = true;
  let pageVisible = document.visibilityState !== 'hidden';
  let stillAt = null;
  let events = [];

  const paintMode = (ir) => { const text = ir ? (labels.ir || 'IR') : ''; if (mode.textContent !== text) mode.textContent = text; };

  function startMain() {
    backend = 'main';
    renderer = makeRenderer(plate, dyn, { ...cfg, fonts: { mono: cssVar('--font-mono', 'monospace'), sans: cssVar('--font-sans', 'sans-serif') } });
    renderer.setEvents(events);
    loop = makeLoop(renderer, { useRaf: true, onFrame: () => paintMode(renderer.stats().ir) });
  }

  if (opts.worker !== false && canUseWorker()) {
    try {
      const pOff = plate.transferControlToOffscreen();
      const dOff = dyn.transferControlToOffscreen();
      worker = new Worker(import.meta.url, { type: 'module', name: `camfeed-${camera.id || ''}` });
      const fontUrls = {
        mono: new URL('../../assets/fonts/plex-mono-latin-500.woff2', import.meta.url).href,
        sans: new URL('../../assets/fonts/plex-sans-latin-600.woff2', import.meta.url).href,
        arabic: new URL('../../assets/fonts/plex-arabic-arabic-600.woff2', import.meta.url).href,
      };
      worker.onmessage = (e) => {
        const msg = e.data || {};
        if (msg.type === 'stats') { remoteStats = msg.stats; paintMode(Boolean(msg.stats.ir)); }
        else if (msg.type === 'error') fallBack();
      };
      worker.onerror = (e) => { if (e && typeof e.preventDefault === 'function') e.preventDefault(); fallBack(); };
      worker.postMessage({ type: 'init', plate: pOff, dyn: dOff, cfg, fontUrls, mode: 'idle', sentAt: Date.now() }, [pOff, dOff]);
      backend = 'worker';
    } catch { worker = null; startMain(); }
  } else startMain();

  /** The worker could not start (blocked, unsupported): fresh canvases, same renderer on the main thread. */
  function fallBack() {
    if (destroyed || backend === 'main') return;
    try { if (worker) worker.terminate(); } catch { /* ignore */ }
    worker = null;
    const p2 = mkCanvas('cf-plate'); const d2 = mkCanvas('cf-dyn');
    plate.replaceWith(p2); dyn.replaceWith(d2); plate = p2; dyn = d2;
    startMain();
    applyMode();
  }

  const send = (msg) => { if (worker) { try { worker.postMessage({ ...msg, sentAt: Date.now() }); } catch { /* ignore */ } } };
  function doRun() { stillAt = null; frame.classList.remove('is-still'); if (backend === 'worker') send({ type: 'run' }); else loop.run(); }
  function doPause() { if (backend === 'worker') send({ type: 'pause' }); else loop.pause(); }
  function doStill() { stillAt = Date.now(); frame.classList.add('is-still'); if (backend === 'worker') send({ type: 'still', at: stillAt }); else loop.still(stillAt); tickClock(); }

  let runningState = 'idle';
  /** One place decides: idle (not wanted) · still (reduced motion) · paused (hidden / off screen) · run. */
  function applyMode() {
    if (destroyed) return;
    let next = 'idle';
    if (wanted) next = reducedMotion() ? 'still' : (visible && pageVisible ? 'run' : 'paused');
    if (next === runningState && !(next === 'still' && !stillAt)) return;
    runningState = next;
    if (next === 'run') doRun();
    else if (next === 'still') doStill();
    else doPause();
  }

  function tickClock() {
    const d = stillAt ? new Date(stillAt) : new Date();
    if (typeof opts.onTick === 'function') { try { opts.onTick(d); } catch { /* ignore */ } }
    const z = new Date(d.getTime() + 3 * 3_600_000);
    const p2 = (n) => String(n).padStart(2, '0');
    const text = `${z.getUTCFullYear()}-${p2(z.getUTCMonth() + 1)}-${p2(z.getUTCDate())} ${p2(z.getUTCHours())}:${p2(z.getUTCMinutes())}:${p2(z.getUTCSeconds())} ${labels.timeZone || 'AST'}`;
    if (clock.textContent !== text) clock.textContent = text;
  }

  const onVis = () => { pageVisible = document.visibilityState !== 'hidden'; applyMode(); };
  document.addEventListener('visibilitychange', onVis);
  let io = null;
  if (typeof IntersectionObserver === 'function') {
    io = new IntersectionObserver((entries) => { for (const e of entries) visible = e.isIntersecting; applyMode(); }, { threshold: 0.05 });
    io.observe(frame);
  }
  let mo = null;
  if (typeof MutationObserver === 'function') {
    mo = new MutationObserver(() => { runningState = runningState === 'still' ? 'restill' : runningState; applyMode(); });
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-motion'] });
  }
  const mq = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null;
  const onMq = () => applyMode();
  if (mq && typeof mq.addEventListener === 'function') mq.addEventListener('change', onMq);

  tickClock();
  const clockTimer = setInterval(() => { if (pageVisible && !stillAt) tickClock(); }, 1000);

  const api = {
    el: frame,
    get backend() { return backend; },
    start() { wanted = true; applyMode(); return api; },
    stop() { wanted = false; applyMode(); return api; },
    still() { wanted = true; doStill(); runningState = 'still'; return api; },
    setEvents(list) {
      events = (Array.isArray(list) ? list : []).slice(0, 2).map((e) => ({ id: String(e.id || ''), item: String(e.item || '') }));
      if (backend === 'worker') send({ type: 'events', events, redraw: runningState === 'still', at: stillAt });
      else if (renderer) { renderer.setEvents(events); if (runningState === 'still') loop.still(stillAt); }
      return api;
    },
    isRunning: () => runningState === 'run',
    stats: () => {
      const st = backend === 'worker' ? remoteStats : (renderer ? renderer.stats() : remoteStats);
      return { ...st, running: runningState === 'run', mode: runningState === 'still' ? 'still' : (runningState === 'run' ? 'live-sim' : 'paused'), fps, backend };
    },
    destroy() {
      destroyed = true;
      if (worker) { send({ type: 'destroy' }); try { worker.terminate(); } catch { /* ignore */ } worker = null; }
      if (loop) loop.pause();
      clearInterval(clockTimer);
      document.removeEventListener('visibilitychange', onVis);
      if (io) { try { io.disconnect(); } catch { /* ignore */ } io = null; }
      if (mo) { try { mo.disconnect(); } catch { /* ignore */ } mo = null; }
      if (mq && typeof mq.removeEventListener === 'function') mq.removeEventListener('change', onMq);
    },
  };
  Object.defineProperty(frame, '__camfeed', { value: api, enumerable: false });
  return api;
}

export default { createCamFeed, riyadhHour, lightPhase };
