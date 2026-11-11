/**
 * BILTIX Risk AI — 360° panorama viewer (js/ui/pano360.js). No libraries.
 *
 *   webgl   an equirectangular sphere, ray-cast per pixel in a fragment shader (one full-screen triangle pair; the
 *           texture wraps horizontally in the shader, so NPOT images work on WebGL 1). Rows outside the image's
 *           vertical coverage (a 21:9 capture covers ±76°) are filled with sky / ground colours.
 *   canvas  Canvas 2D cylindrical fallback (no WebGL): the visible window of the panorama is drawn directly.
 *   static  reduced motion (OS, settings, Static background) or no canvas: the whole panorama as one image with
 *           its hotspots; nothing moves.
 *
 * Input: pointer drag, two-finger pinch zoom, wheel zoom (with Ctrl, or while the viewer has focus), keyboard
 * (arrows look around, + / − zoom, 0 or Home resets), optional device orientation (asks for permission on iOS;
 * never offered under reduced motion). Rendering happens on demand only — there is no animation loop: a frame is
 * drawn after an input, a resize or a hotspot change, so nothing runs or replays while the viewer sits still.
 * Hotspots are real <button>s positioned over the picture (keyboard reachable, named); behind-the-camera hotspots
 * are hidden (and leave the tab order). The picture never mirrors in Arabic (dir="ltr"); text follows its language.
 *
 *   createPano360(host, { src, yaw, pitch, fov, hotspots:[{ id, yaw, pitch, label, tone, onActivate }], labels,
 *                         mode: 'auto'|'webgl'|'canvas'|'static', onView })
 *     → { el, mode, ready, lookAt(yaw, pitch, fov), setHotspots(list), setSource(src|null, { empty }), view(), destroy() }
 */

const DEG = Math.PI / 180;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const wrap180 = (d) => ((((d + 180) % 360) + 360) % 360) - 180;
const MIN_FOV = 30;
const MAX_FOV = 100;

function reducedMotion() {
  try {
    const forced = document.documentElement.getAttribute('data-motion');
    if (forced === 'reduce') return true;
    if (forced === 'full') return document.documentElement.getAttribute('data-bg') === 'static';
    return matchMedia('(prefers-reduced-motion: reduce)').matches || document.documentElement.getAttribute('data-bg') === 'static';
  } catch { return false; }
}

function el(tag, attrs = {}, ...kids) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') n.className = v;
    else if (k === 'text') n.textContent = v;
    else n.setAttribute(k, v === true ? '' : String(v));
  }
  kids.flat().forEach((c) => { if (c) n.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
  return n;
}

const VERT = 'attribute vec2 p; varying vec2 v; void main(){ v = p; gl_Position = vec4(p, 0.0, 1.0); }';
const FRAG = `precision highp float;
varying vec2 v;
uniform sampler2D tex;
uniform float yaw, pitch, tanV, aspect, latTop, latBot;
uniform vec3 sky, ground;
const float PI = 3.14159265358979;
void main(){
  vec3 d = normalize(vec3(v.x * tanV * aspect, v.y * tanV, 1.0));
  float cp = cos(pitch), sp = sin(pitch);
  d = vec3(d.x, d.y * cp + d.z * sp, -d.y * sp + d.z * cp);
  float cy = cos(yaw), sy = sin(yaw);
  d = vec3(d.x * cy + d.z * sy, d.y, -d.x * sy + d.z * cy);
  float lon = atan(d.x, d.z);
  float lat = asin(clamp(d.y, -1.0, 1.0));
  float u = fract(lon / (2.0 * PI) + 0.5);
  float t = (latTop - lat) / (latTop - latBot);
  if (t < 0.0) gl_FragColor = vec4(sky, 1.0);
  else if (t > 1.0) gl_FragColor = vec4(ground, 1.0);
  else gl_FragColor = texture2D(tex, vec2(u, t));
}`;

function makeGL(canvas) {
  let gl = null;
  try { gl = canvas.getContext('webgl', { antialias: false, alpha: false, preserveDrawingBuffer: true, powerPreference: 'low-power' }) || canvas.getContext('experimental-webgl'); } catch { gl = null; }
  if (!gl) return null;
  const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) || 'shader'); return s; };
  try {
    const prog = gl.createProgram();
    gl.attachShader(prog, sh(gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error('link');
    gl.useProgram(prog);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, 'p');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    const u = {};
    ['tex', 'yaw', 'pitch', 'tanV', 'aspect', 'latTop', 'latBot', 'sky', 'ground'].forEach((k) => { u[k] = gl.getUniformLocation(prog, k); });
    const tex = gl.createTexture();
    return { gl, prog, u, tex, maxTex: gl.getParameter(gl.MAX_TEXTURE_SIZE) || 2048 };
  } catch { return null; }
}

export function createPano360(host, opts = {}) {
  const labels = { title: '360°', help: '', simulated: '', zoomIn: '+', zoomOut: '−', reset: '0', gyro: '', gyroDenied: '', loading: '', empty: '', ...(opts.labels || {}) };
  const reduced = reducedMotion();
  let mode = opts.mode && opts.mode !== 'auto' ? opts.mode : (reduced ? 'static' : 'webgl');
  let yaw = Number(opts.yaw) || 0;
  let pitch = Number(opts.pitch) || 0;
  let fov = clamp(Number(opts.fov) || 75, MIN_FOV, MAX_FOV);   // vertical field of view (degrees)
  let hotspots = Array.isArray(opts.hotspots) ? opts.hotspots.slice() : [];
  let img = null; let vCover = 152; let destroyed = false; let raf = 0; let glx = null; let ctx2d = null;
  const sky = [0.62, 0.76, 0.9]; const ground = [0.78, 0.78, 0.76];
  let readyResolve; const ready = new Promise((r) => { readyResolve = r; });

  const helpId = `pano-help-${Math.random().toString(36).slice(2, 8)}`;
  const canvas = el('canvas', { class: 'pano-canvas', tabindex: '0', role: 'img', 'aria-roledescription': labels.title, 'aria-label': labels.alt || labels.title, 'aria-describedby': helpId });
  const stage = el('div', { class: 'pano-stage' });
  const spotsHost = el('div', { class: 'pano-spots' });
  const osd = el('p', { class: 'pano-osd' }, el('span', { class: 'pano-osd-text', dir: opts.rtl ? 'rtl' : 'ltr', text: labels.simulated }));
  const empty = el('div', { class: 'pano-empty', hidden: true }, el('span', { text: labels.empty }));
  const help = el('p', { class: 'sr-only', id: helpId, text: labels.help });
  const btnIn = el('button', { type: 'button', class: 'pano-btn', 'aria-label': labels.zoomIn, title: labels.zoomIn, text: '+' });
  const btnOut = el('button', { type: 'button', class: 'pano-btn', 'aria-label': labels.zoomOut, title: labels.zoomOut, text: '−' });
  const btnReset = el('button', { type: 'button', class: 'pano-btn', 'aria-label': labels.reset, title: labels.reset, text: '⟲' });
  let gyroBtn = null;
  const controls = el('div', { class: 'pano-controls' }, btnIn, btnOut, btnReset);
  const root = el('div', { class: `pano is-${mode}`, dir: 'ltr' }, stage, help);
  host.appendChild(root);
  const home = { yaw, pitch, fov };

  /* ───────── geometry ───────── */
  const size = () => ({ w: stage.clientWidth || 1, h: stage.clientHeight || 1 });
  const tanV = () => Math.tan((fov * DEG) / 2);
  const latTop = () => (vCover / 2) * DEG;
  function clampView() {
    fov = clamp(fov, MIN_FOV, MAX_FOV);
    yaw = wrap180(yaw);
    const half = fov / 2;
    const lim = Math.max(0, vCover / 2 - half);
    pitch = clamp(pitch, -lim, lim);
  }
  /** Screen position (px) of a direction, or null when behind the camera / outside the picture. */
  function project(hy, hp) {
    const { w, h } = size();
    if (mode === 'static') {
      return { x: ((wrap180(hy) + 180) / 360) * w, y: (0.5 - hp / vCover) * h };
    }
    if (mode === 'canvas') {
      const aspect = w / h;
      const fovH = clamp(fov * aspect, 1, 360);
      const dx = wrap180(hy - yaw);
      if (Math.abs(dx) > fovH / 2) return null;
      return { x: w / 2 + (dx / fovH) * w, y: h / 2 - ((hp - pitch) / fov) * h };
    }
    const cyw = Math.cos(yaw * DEG); const syw = Math.sin(yaw * DEG);
    const cp = Math.cos(pitch * DEG); const sp = Math.sin(pitch * DEG);
    const x0 = Math.cos(hp * DEG) * Math.sin(hy * DEG); const y0 = Math.sin(hp * DEG); const z0 = Math.cos(hp * DEG) * Math.cos(hy * DEG);
    const x1 = x0 * cyw - z0 * syw; const z1 = x0 * syw + z0 * cyw;
    const y2 = y0 * cp - z1 * sp; const z2 = y0 * sp + z1 * cp;
    if (z2 <= 0.05) return null;
    const t = tanV(); const aspect = w / h;
    const nx = x1 / z2 / (t * aspect); const ny = y2 / z2 / t;
    if (Math.abs(nx) > 1.05 || Math.abs(ny) > 1.05) return null;
    return { x: (nx + 1) / 2 * w, y: (1 - ny) / 2 * h };
  }

  /* ───────── drawing ───────── */
  function draw() {
    raf = 0;
    if (destroyed || !img) return;
    const { w, h } = size();
    if (mode === 'webgl' && glx) {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const cw = Math.round(w * dpr); const ch = Math.round(h * dpr);
      if (canvas.width !== cw || canvas.height !== ch) { canvas.width = cw; canvas.height = ch; }
      const { gl, u } = glx;
      gl.viewport(0, 0, cw, ch);
      gl.uniform1f(u.yaw, yaw * DEG); gl.uniform1f(u.pitch, pitch * DEG);
      gl.uniform1f(u.tanV, tanV()); gl.uniform1f(u.aspect, w / h);
      gl.uniform1f(u.latTop, latTop()); gl.uniform1f(u.latBot, -latTop());
      gl.uniform3f(u.sky, ...sky); gl.uniform3f(u.ground, ...ground);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
    } else if (mode === 'canvas' && ctx2d) {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const cw = Math.round(w * dpr); const ch = Math.round(h * dpr);
      if (canvas.width !== cw || canvas.height !== ch) { canvas.width = cw; canvas.height = ch; }
      const iw = img.naturalWidth; const ih = img.naturalHeight;
      const fovH = clamp(fov * (w / h), 1, 360);
      const sw = (fovH / 360) * iw; const sh = (fov / vCover) * ih;
      let sx = ((wrap180(yaw) + 180) / 360) * iw - sw / 2;
      const sy = clamp((0.5 - pitch / vCover) * ih - sh / 2, 0, Math.max(0, ih - sh));
      sx = ((sx % iw) + iw) % iw;
      ctx2d.fillStyle = '#9EC2E6'; ctx2d.fillRect(0, 0, cw, ch);
      const first = Math.min(sw, iw - sx);
      ctx2d.drawImage(img, sx, sy, first, sh, 0, 0, (first / sw) * cw, ch);
      if (first < sw) ctx2d.drawImage(img, 0, sy, sw - first, sh, (first / sw) * cw, 0, ((sw - first) / sw) * cw, ch);
    }
    placeSpots();
    if (typeof opts.onView === 'function') { try { opts.onView({ yaw, pitch, fov }); } catch { /* ignore */ } }
  }
  const render = () => { if (!raf && !destroyed) raf = requestAnimationFrame(draw); };

  /* ───────── hotspots ───────── */
  let spotEls = [];
  function buildSpots() {
    spotsHost.replaceChildren();
    spotEls = hotspots.map((hs) => {
      const b = el('button', { type: 'button', class: 'pano-spot', 'data-tone': hs.tone || 'brand', 'data-spot': hs.id, 'aria-label': hs.label || hs.id, title: hs.label || hs.id },
        el('span', { class: 'pano-spot-dot', 'aria-hidden': 'true' }),
        el('span', { class: 'pano-spot-label', dir: hs.rtl ? 'rtl' : 'auto', text: hs.short || hs.label || hs.id }));
      b.addEventListener('click', (e) => { e.stopPropagation(); if (typeof hs.onActivate === 'function') hs.onActivate(hs, b); });
      spotsHost.appendChild(b);
      return { hs, b };
    });
    placeSpots();
  }
  function placeSpots() {
    const { w, h } = size();
    for (const { hs, b } of spotEls) {
      const p = img ? project(Number(hs.yaw) || 0, Number(hs.pitch) || 0) : null;
      // a marker is shown whole or not at all (no half-cut target at the picture's edge)
      const m = 16;
      const visible = Boolean(p) && p.x >= m && p.x <= w - m && p.y >= m && p.y <= h - m;
      if (!visible) { if (!b.hidden) b.hidden = true; continue; }
      if (b.hidden) b.hidden = false;
      b.style.transform = `translate(${Math.round(p.x)}px, ${Math.round(p.y)}px)`;
      b.classList.toggle('is-end', p.x > w * 0.7);
    }
  }

  /* ───────── input ───────── */
  const pointers = new Map();
  let pinch0 = 0; let fov0 = fov;
  function onDown(e) {
    if (mode === 'static') return;
    canvas.setPointerCapture && canvas.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 2) { const [a, b] = [...pointers.values()]; pinch0 = Math.hypot(a.x - b.x, a.y - b.y); fov0 = fov; }
    root.classList.add('is-dragging');
  }
  function onMove(e) {
    const prev = pointers.get(e.pointerId);
    if (!prev) return;
    const cur = { x: e.clientX, y: e.clientY };
    pointers.set(e.pointerId, cur);
    if (pointers.size >= 2) {
      const [a, b] = [...pointers.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinch0 > 0 && d > 0) { fov = fov0 * (pinch0 / d); clampView(); render(); }
      return;
    }
    const { w, h } = size();
    const fovH = mode === 'canvas' ? fov * (w / h) : 2 * Math.atan(tanV() * (w / h)) / DEG;
    yaw -= ((cur.x - prev.x) / w) * fovH;
    pitch += ((cur.y - prev.y) / h) * fov;
    clampView(); render();
  }
  function onUp(e) { pointers.delete(e.pointerId); if (pointers.size < 2) pinch0 = 0; if (!pointers.size) root.classList.remove('is-dragging'); }
  function onWheel(e) {
    if (mode === 'static') return;
    if (!e.ctrlKey && document.activeElement !== canvas) return;
    e.preventDefault();
    fov *= Math.exp(e.deltaY * 0.0015); clampView(); render();
  }
  function onKey(e) {
    if (mode === 'static') return;
    const step = e.shiftKey ? 15 : 5;
    let used = true;
    switch (e.key) {
      case 'ArrowLeft': yaw -= step; break;
      case 'ArrowRight': yaw += step; break;
      case 'ArrowUp': pitch += step; break;
      case 'ArrowDown': pitch -= step; break;
      case '+': case '=': fov -= 8; break;
      case '-': case '_': fov += 8; break;
      case '0': case 'Home': yaw = home.yaw; pitch = home.pitch; fov = home.fov; break;
      default: used = false;
    }
    if (used) { e.preventDefault(); clampView(); render(); }
  }
  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerup', onUp);
  canvas.addEventListener('pointercancel', onUp);
  canvas.addEventListener('wheel', onWheel, { passive: false });
  canvas.addEventListener('keydown', onKey);
  btnIn.addEventListener('click', () => { fov -= 10; clampView(); render(); });
  btnOut.addEventListener('click', () => { fov += 10; clampView(); render(); });
  btnReset.addEventListener('click', () => { yaw = home.yaw; pitch = home.pitch; fov = home.fov; clampView(); render(); });

  // device orientation: offered on touch devices only, never under reduced motion; iOS asks for permission
  let gyroOn = false; let gyroBase = null;
  const onOrient = (e) => {
    if (!gyroOn || e.alpha === null) return;
    if (!gyroBase) gyroBase = { alpha: e.alpha, yaw };
    yaw = gyroBase.yaw - wrap180(e.alpha - gyroBase.alpha);
    pitch = clamp((e.beta || 90) - 90, -80, 80);
    clampView(); render();
  };
  function setGyro(on) {
    gyroOn = on; gyroBase = null;
    if (gyroBtn) gyroBtn.setAttribute('aria-pressed', on ? 'true' : 'false');
    if (on) window.addEventListener('deviceorientation', onOrient); else window.removeEventListener('deviceorientation', onOrient);
  }
  let coarse = false;
  try { coarse = matchMedia('(pointer: coarse)').matches; } catch { coarse = false; }
  if (!reduced && coarse && typeof window.DeviceOrientationEvent !== 'undefined' && labels.gyro) {
    gyroBtn = el('button', { type: 'button', class: 'pano-btn pano-gyro', 'aria-pressed': 'false', 'aria-label': labels.gyro, title: labels.gyro, text: '◎' });
    gyroBtn.addEventListener('click', async () => {
      if (gyroOn) { setGyro(false); return; }
      try {
        const DOE = window.DeviceOrientationEvent;
        if (DOE && typeof DOE.requestPermission === 'function') {
          const res = await DOE.requestPermission();
          if (res !== 'granted') { gyroBtn.title = labels.gyroDenied || labels.gyro; return; }
        }
        setGyro(true);
      } catch { gyroBtn.title = labels.gyroDenied || labels.gyro; }
    });
    controls.appendChild(gyroBtn);
  }

  let ro = null;
  if (typeof ResizeObserver === 'function') { ro = new ResizeObserver(() => render()); ro.observe(stage); }

  /* ───────── modes ───────── */
  function mountStatic() {
    mode = 'static';
    root.className = 'pano is-static';
    const pic = el('img', { class: 'pano-static-img', alt: labels.alt || labels.title, src: opts.src, decoding: 'async' });
    stage.replaceChildren(pic, spotsHost, osd, empty);
    pic.addEventListener('load', () => { img = pic; vCover = 360 * (pic.naturalHeight / pic.naturalWidth); stage.style.aspectRatio = `${pic.naturalWidth} / ${pic.naturalHeight}`; buildSpots(); readyResolve(mode); }, { once: true });
    pic.addEventListener('error', () => readyResolve('error'), { once: true });
  }
  function mountCanvas(kind) {
    stage.replaceChildren(canvas, spotsHost, osd, empty);
    root.insertBefore(controls, help);   // over the picture's end corner on wide screens, under it on phones (css)
    if (kind === 'webgl') { glx = makeGL(canvas); if (!glx) kind = 'canvas'; }
    if (kind === 'canvas') { ctx2d = canvas.getContext('2d'); if (!ctx2d) { mountStatic(); return; } }
    mode = kind;
    root.className = `pano is-${mode}`;
  }
  function upload(image) {
    if (mode !== 'webgl' || !glx) return;
    const { gl, tex, u, maxTex } = glx;
    let source = image;
    if (image.naturalWidth > maxTex) {
      const c = document.createElement('canvas');
      c.width = maxTex; c.height = Math.round(maxTex * image.naturalHeight / image.naturalWidth);
      c.getContext('2d').drawImage(image, 0, 0, c.width, c.height);
      source = c;
    }
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, source);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.uniform1i(u.tex, 0);
  }
  function load(src) {
    if (mode === 'static') { empty.hidden = Boolean(src); spotsHost.hidden = !src; return; }
    img = null;
    root.classList.add('is-loading');
    if (!src) { empty.hidden = false; root.classList.remove('is-loading'); placeSpots(); readyResolve('empty'); return; }
    empty.hidden = true;
    const im = new Image();
    im.decoding = 'async';
    im.onload = () => {
      if (destroyed) return;
      img = im; vCover = clamp(360 * (im.naturalHeight / im.naturalWidth), 30, 180);
      try { upload(im); } catch { mountCanvas('canvas'); }
      clampView(); buildSpots(); root.classList.remove('is-loading'); draw(); readyResolve(mode);
    };
    im.onerror = () => { root.classList.remove('is-loading'); empty.hidden = false; readyResolve('error'); };
    im.src = src;
  }

  if (mode === 'static') mountStatic(); else mountCanvas(mode);
  load(opts.src);

  return {
    el: root,
    get mode() { return mode; },
    ready,
    view: () => ({ yaw, pitch, fov }),
    lookAt(y, p, f) { if (Number.isFinite(y)) yaw = y; if (Number.isFinite(p)) pitch = p; if (Number.isFinite(f)) fov = f; clampView(); render(); },
    setHotspots(list) { hotspots = Array.isArray(list) ? list.slice() : []; buildSpots(); },
    setSource(src, { empty: msg = null } = {}) {
      if (msg) empty.firstChild.textContent = msg;
      if (mode === 'static') {
        const pic = stage.querySelector('.pano-static-img');
        if (pic) pic.hidden = !src;
        empty.hidden = Boolean(src);
        spotsHost.hidden = !src;
        if (src && pic && pic.getAttribute('src') !== src) pic.src = src;
        return;
      }
      spotsHost.hidden = !src;
      load(src);
      if (!src && canvas.getContext) { try { if (ctx2d) ctx2d.clearRect(0, 0, canvas.width, canvas.height); if (glx) { glx.gl.clearColor(0.1, 0.12, 0.14, 1); glx.gl.clear(glx.gl.COLOR_BUFFER_BIT); } } catch { /* ignore */ } }
    },
    destroy() {
      destroyed = true;
      if (raf) cancelAnimationFrame(raf);
      setGyro(false);
      if (ro) { try { ro.disconnect(); } catch { /* ignore */ } }
      if (glx) { try { const ext = glx.gl.getExtension('WEBGL_lose_context'); if (ext) ext.loseContext(); } catch { /* ignore */ } }
      root.remove();
    },
  };
}

export default { createPano360 };
