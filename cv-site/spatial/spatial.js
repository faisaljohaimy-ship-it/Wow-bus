 
import { T, makeKit, ease, clamp01, smooth, lerp, hash, fontsReady, DEG } from './kit.js';

export const VERSION = '1.0.0';
export const ENVS = {
  room: { title: ['غرفة البيانات الافتراضية', 'Virtual Data Room'], desc: ['غرفة بجدران زجاجية ومسارات بيانات مضيئة على الأرض تقود إلى لوحات تحليل.', 'A room of glass walls where light data paths on the floor lead to analysis panels.'] },
  screens: { title: ['شاشات التحليل المجسمة', 'Holographic Analysis Screens'], desc: ['شاشات عائمة برسوم بيانية ثلاثية الأبعاد تُعاد حسابها من البيانات الممررة.', 'Floating screens with 3D charts that recompute from the data passed in.'] },
  orbits: { title: ['مسارات البيانات والمدارات الذكية', 'Luminous Data Paths & Smart Orbits'], desc: ['حزم بيانات تنتقل بين العقد، ووكلاء في مدارات، وكل إجراء يمر بعقدة موافقة بشرية.', 'Packets travel between nodes, agents orbit the model, and every action passes a human approval node.'] },
  helix: { title: ['ألواح زجاجية بانتقالات حلزونية', 'Floating Glass Panels, Helical Transitions'], desc: ['ألواح زجاجية تتفكك في مسار حلزوني ثم تعيد ترتيب نفسها في جدار قابل للقراءة.', 'Glass panels come apart along a helix and reassemble into a readable wall.'] },
  pipeline: { title: ['تدفق المعالجة بالذكاء الاصطناعي', 'AI Processing Flow'], desc: ['مدخلات ثم نموذج ثم معالجة ثم قرار ثم دليل، وحركة المسار تستجيب لأحداث الإدخال والنتيجة.', 'Input, model, processing, decision and evidence as a spatial pipeline that reacts to input and result events.'] },
};
export const STYLES = {
  dolly: { title: ['اقتراب هادئ', 'Calm dolly'], purpose: ['يقود النظر إلى نقطة القراءة ثم يتوقف.', 'Leads the eye to the reading point, then stops.'] },
  orbit: { title: ['دوران ثم استقرار', 'Orbit and settle'], purpose: ['يكشف العمق والعلاقات ثم يستقر على زاوية القراءة.', 'Reveals depth and relations, then settles on the reading angle.'] },
  flythrough: { title: ['عبور بين الطبقات', 'Flythrough between layers'], purpose: ['ينتقل من النظرة العامة إلى التفصيل عبر طبقات المشهد.', 'Moves from overview to detail through the layers of the scene.'] },
};
const TIERS = {
  high: { dpr: 2, aa: true, fps: 60, budget: 20 },     
  mid: { dpr: 1.5, aa: true, fps: 60, budget: 20 },
  low: { dpr: 1, aa: false, fps: 30, budget: 34 },
};
const SCALES = [1, .85, .72, .6, .5];                    
const H = 1 / 60, RAMP_UP = .6, RAMP_DOWN = 2.4, DATA_SPAN = .9;
const live = new Set();
let contexts = 0, gl2;

export function webgl2Available() {
  if (gl2 !== undefined) return gl2;
  try { const g = document.createElement('canvas').getContext('webgl2'); gl2 = !!g; const x = g && g.getExtension('WEBGL_lose_context'); if (x) x.loseContext(); }
  catch (e) { gl2 = false; }
  return gl2;
}
export function detectTier() {
  const n = navigator, mem = n.deviceMemory || 4, cores = n.hardwareConcurrency || 4;
  const coarse = matchMedia('(pointer: coarse)').matches, small = Math.min(screen.width, screen.height) < 600;
  if (coarse || small || mem <= 2 || cores <= 2) return 'low';
  return cores >= 8 && mem >= 8 ? 'high' : 'mid';
}
export function lowPowerDevice() {
  const n = navigator;
  return !!((n.connection && n.connection.saveData) || (n.deviceMemory && n.deviceMemory < 2) || (n.hardwareConcurrency && n.hardwareConcurrency < 2));
}
const pickLang = l => String(l || document.documentElement.lang || 'ar').slice(0, 2) === 'en' ? 'en' : 'ar';
const envLoaders = { room: () => import('./envs/room.js'), screens: () => import('./envs/screens.js'), orbits: () => import('./envs/orbits.js'), helix: () => import('./envs/helix.js'), pipeline: () => import('./envs/pipeline.js') };

function mount(target, o = {}) {
  const host = typeof target === 'string' ? document.querySelector(target) : target;
  if (!host) throw new Error('SpatialScene.mount: element not found');
  const env = ENVS[o.env] ? o.env : 'room';
  let style = STYLES[o.style] ? o.style : 'dolly';
  let tier = TIERS[o.tier] ? o.tier : detectTier();
  let lang = pickLang(o.lang);
  const reduced = o.reducedMotion ?? matchMedia('(prefers-reduced-motion: reduce)').matches;
  const seed = (o.seed ?? hash(env)) >>> 0, ambient = o.ambient ?? 10, adaptive = o.adaptive !== false;
  const stillReason = reduced ? 'reduced-motion' : o.poster === 'always' ? 'poster' : (o.poster !== 'never' && (o.lowPower ?? lowPowerDevice())) ? 'low-power' : '';
  const posterBase = o.posterBase || new URL('./posters/', import.meta.url).href;

   
  const isCanvas = host instanceof HTMLCanvasElement, box = isCanvas ? host : host;
  const canvas = isCanvas ? host : document.createElement('canvas');
  const canvasDisplay = canvas.style.display;
  if (!isCanvas) {
    if (getComputedStyle(host).position === 'static') host.style.position = 'relative';
    canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block';
    host.appendChild(canvas);
  }
  canvas.style.opacity = '0';
  if (!reduced) canvas.style.transition = 'opacity .36s cubic-bezier(.2,.7,.2,1)';
  canvas.setAttribute('role', 'img');
  const img = document.createElement('img');
  img.decoding = 'async'; img.setAttribute('data-spatial-poster', '');
  img.style.cssText = (isCanvas ? '' : 'position:absolute;inset:0;') + 'width:100%;height:100%;object-fit:cover;display:none';
  img.onerror = () => { img.style.display = 'none'; };
  if (isCanvas) { if (host.className) img.className = host.className; host.after(img); } else host.appendChild(img);
  const label = () => { const e = ENVS[env], i = lang === 'ar' ? 0 : 1; return e.title[i] + ' — ' + e.desc[i]; };
  const setLabel = () => { canvas.setAttribute('aria-label', label()); img.alt = label(); (isCanvas ? canvas : host).setAttribute('data-spatial-env', env); };
  setLabel();

   
  let mode = 'loading', disposed = false, renderer = null, kit = null, sc = null, camera = null, mod = null;
  let tNow = Math.max(0, +o.time || 0), lastDraw = -1, frames = 0, qIdx = 0, size = [0, 0, 1];
  let userPaused = o.autoplay === false, visible = typeof IntersectionObserver === 'undefined', hidden = document.hidden;
  let raf = 0, lastNow = 0, warm = 0, slow = 0, good = 0, ups = 0, stillTimer = 0;
  let styleLog = [{ t: tNow, style, from: null }], dataLog = [{ t: tNow, d: Object.assign({}, o.data) }], evLog = [], evId = 0;
  let W = null, aI = 0, aS = 0;
  const dts = [], win = [];
  const budget = o.budgetMs || TIERS[tier].budget;
  const emit = e => { if (typeof o.onEvent === 'function') try { o.onEvent(Object.assign({ env }, e)); } catch (err) { console.error(err); } };
  const setState = s => { mode = s; (isCanvas ? canvas : host).setAttribute('data-spatial', s); };
  setState('loading');

  function createRenderer(cv) {
    try {
      const r = new T.WebGLRenderer({ canvas: cv, antialias: o.antialias ?? TIERS[tier].aa, alpha: false, stencil: false, powerPreference: tier === 'high' ? 'high-performance' : 'default', failIfMajorPerformanceCaveat: !!o.failIfMajorPerformanceCaveat });
      r.toneMapping = T.NeutralToneMapping; r.toneMappingExposure = 1.05; r.transmissionResolutionScale = .5;
      contexts++; return r;
    } catch (e) { return null; }
  }
  function build() {
    kit = makeKit({ renderer, tier, lang, seed, ibl: o.ibl });
    camera = camera || new T.PerspectiveCamera(45, 16 / 9, .05, 220);
    sc = mod.create(kit, dataLog[dataLog.length - 1].d, { env, lang, tier });
    W = null; aI = 0; aS = 0;
  }
  function freeScene() { if (kit) kit.dispose(); kit = sc = null; }
  function freeRenderer() {
    if (!renderer) return;
    const r = renderer; renderer = null; contexts--;
    r.dispose(); r.forceContextLoss();
  }
  function applySize(cv) {
    const el = isCanvas ? canvas : host;
    let w = el.clientWidth || o.width || 960, h = el.clientHeight || o.height || Math.round(w * 9 / 16);
    const dpr = Math.min(window.devicePixelRatio || 1, o.maxDpr || TIERS[tier].dpr) * SCALES[qIdx];
    renderer.setPixelRatio(dpr); renderer.setSize(w, h, false);
    camera.aspect = w / h; size = [w, h, +dpr.toFixed(3)];
  }

   
  function styleAt(t) { let i = styleLog.length - 1; while (i > 0 && styleLog[i].t > t) i--; return styleLog[i]; }
  function poseAt(t) {
    const s = styleAt(t), st = sc.styles[s.style], u = clamp01((t - s.t) / st.dur), k = (ease[st.ease] || ease.inout)(u);
    const q = st.path(k); let fov = lerp(st.fov[0], st.fov[1], k);
    if (s.from) { const w = smooth(0, st.blend || .45, u); q.p = s.from.p.clone().lerp(q.p, w); q.l = s.from.l.clone().lerp(q.l, w); fov = lerp(s.from.fov, fov, w); }
    return { p: q.p, l: q.l, fov, u, k, s, st };
  }
  function dataAt(t) {
    let i = dataLog.length - 1; while (i > 0 && dataLog[i].t > t) i--;
    const cur = dataLog[i], prev = i > 0 ? dataLog[i - 1] : cur, span = sc.dataSpan || DATA_SPAN;
    const u = i > 0 ? clamp01((t - cur.t) / span) : 1;
    return { cur: cur.d, prev: prev.d, u, k: ease.data(u), t0: cur.t, dt: t - cur.t, n: i };
  }
  function windows() {
    if (W) return W;
    W = styleLog.map(s => [s.t, s.t + sc.styles[s.style].dur + ambient]);
    for (let i = 1; i < dataLog.length; i++) W.push([dataLog[i].t, dataLog[i].t + (sc.dataSpan || DATA_SPAN) + 1.5]);
    for (const e of evLog) W.push([e.t, e.t + (sc.eventSpan ? sc.eventSpan(e) : 2) + 1]);
    if (sc.extraSpan) W.push([styleLog[0].t, styleLog[0].t + sc.extraSpan]);
    return W;
  }
  function speed(t) {                                   
    let s = 0;
    for (const [a, b] of windows()) { if (t < a) continue; const v = t < b ? smooth(a, a + RAMP_UP, t) : 1 - smooth(b, b + RAMP_DOWN, t); if (v > s) s = v; }
    return s;
  }
  function ambientAt(t) {                               
    const n = Math.floor(t / H);
    if (n < aI) { aI = 0; aS = 0; }
    for (; aI < n; aI++) aS += speed((aI + .5) * H) * H;
    return aS + speed((n + .5) * H) * (t - n * H);
  }
  const restTime = () => Math.max(...windows().map(w => w[1])) + RAMP_DOWN;
  function changed() { W = null; if (tNow < aI * H) { aI = 0; aS = 0; } }
  function stillTime() {
    const s = styleLog[styleLog.length - 1]; let t = s.t + sc.styles[s.style].dur + .001;
    for (const e of evLog) t = Math.max(t, e.t + (sc.eventSpan ? sc.eventSpan(e) : 0));
    if (sc.stillAt) t = Math.max(t, sc.stillAt);
    return Math.max(t, dataLog[dataLog.length - 1].t + (sc.dataSpan || DATA_SPAN));
  }
  function fitFov(f) { const a = camera.aspect, ref = 1.5; return a >= ref ? f : Math.min(2 * Math.atan(Math.tan(f * DEG / 2) * ref / a) / DEG, 80); }

  function draw(t) {
    const P = poseAt(t);
    camera.position.copy(P.p); camera.fov = fitFov(P.fov); camera.updateProjectionMatrix(); camera.lookAt(P.l);
    const a = ambientAt(t); kit.u.time.value = a;
    sc.update({ t, a, data: dataAt(t), events: evLog, style: { id: P.s.style, t0: P.s.t, u: P.u, k: P.k, dt: t - P.s.t } });
    renderer.render(kit.scene, camera);
    frames++;
    if (lastDraw >= 0 && t > lastDraw && mode === 'live') {
      const land = P.s.t + P.st.dur;
      if (lastDraw < land && land <= t) emit({ type: 'landed', style: P.s.style, t: land });
      if (sc.cues) for (const e of evLog) for (const c of sc.cues(e, evLog)) if (c.at > lastDraw && c.at <= t) emit(Object.assign({ t: c.at, run: e.id }, c));
    }
    lastDraw = t;
  }
  const running = () => mode === 'live' && !userPaused && visible && !hidden && tNow < restTime();
  function halt() { if (raf) cancelAnimationFrame(raf); raf = 0; lastNow = 0; }
  function kick() { if (!raf && running()) raf = requestAnimationFrame(frame); }
  function frame(now) {
    raf = 0;
    if (!running()) { lastNow = 0; if (mode === 'live' && tNow >= restTime()) emit({ type: 'idle', t: tNow }); return; }
    if (lastNow) {
      const dt = now - lastNow;
      if (dt < 1000 / TIERS[tier].fps - 3) { raf = requestAnimationFrame(frame); return; }   
      tNow += Math.min(dt, 100) / 1000;
      dts.push(dt); if (dts.length > 240) dts.shift();
      if (adaptive) adapt(dt);
    }
    lastNow = now;
    draw(tNow);
    if (running()) raf = requestAnimationFrame(frame); else { lastNow = 0; if (tNow >= restTime()) emit({ type: 'idle', t: tNow }); }
  }
  function adapt(dt) {                                  
    if (warm < 12) { warm++; return; }
    win.push(dt); if (win.length < 30) return;
    const med = win.slice().sort((a, b) => a - b)[15]; win.length = 0;
    if (med > budget * 1.15) {
      good = 0; if (++slow < 2) return; slow = 0;
      if (qIdx < SCALES.length - 1) { qIdx++; applySize(); emit({ type: 'quality', scale: SCALES[qIdx], dpr: size[2], frameMs: +med.toFixed(1) }); }
      else if (kit.downgradeGlass()) emit({ type: 'quality', scale: SCALES[qIdx], transmission: false, frameMs: +med.toFixed(1) });
    } else if (med < budget * .55) {
      slow = 0; if (++good < 5 || !qIdx || ups >= 2) return; good = 0; ups++; qIdx--; applySize();
      emit({ type: 'quality', scale: SCALES[qIdx], dpr: size[2], frameMs: +med.toFixed(1) });
    } else { slow = 0; good = 0; }
  }
  const drawNow = () => { if (mode === 'live' && renderer) { draw(tNow); canvas.style.opacity = '1'; } };

   
  function showImg(src) { img.src = src; img.style.display = 'block'; canvas.style.display = 'none'; }
  function fallback(reason) {
    freeScene(); freeRenderer(); halt();
    setState('fallback'); showImg(`${posterBase}${env}-${styleLog[styleLog.length - 1].style}-${lang}.webp`);
    emit({ type: 'fallback', reason });
  }
  function renderStill(reason) {                        
    if (disposed) return;
    const cv = document.createElement('canvas');
    renderer = createRenderer(cv);
    if (!renderer) return fallback('webgl-context');
    build(); applySize();
    const t = stillTime(); lastDraw = -1; draw(t);
    const url = cv.toDataURL('image/webp', .9);
    freeScene(); freeRenderer(); cv.width = cv.height = 0;
    setState('poster'); showImg(url);
    emit({ type: 'poster', reason, t });
  }
  function scheduleStill() { if (!stillTimer && mode === 'poster') stillTimer = setTimeout(() => { stillTimer = 0; renderStill(stillReason); }, 0); }

   
  const io = visible ? null : new IntersectionObserver(es => { visible = es[es.length - 1].isIntersecting; if (visible) kick(); else halt(); }, { rootMargin: '48px' });
  if (io) io.observe(isCanvas ? canvas : host);
  const onVis = () => { hidden = document.hidden; if (hidden) halt(); else kick(); };
  document.addEventListener('visibilitychange', onVis);
  const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => { if (mode === 'live' && renderer) { applySize(); drawNow(); } else if (mode === 'poster') scheduleStill(); }) : null;
  const onLost = e => { if (disposed || mode !== 'live') return; e.preventDefault(); halt(); setState('lost'); showImg(`${posterBase}${env}-${style}-${lang}.webp`); emit({ type: 'contextlost' }); };
  const onRestored = () => { if (disposed || mode !== 'lost') return; setState('live'); img.style.display = 'none'; canvas.style.display = canvasDisplay; applySize(); drawNow(); kick(); emit({ type: 'contextrestored' }); };
  canvas.addEventListener('webglcontextlost', onLost);
  canvas.addEventListener('webglcontextrestored', onRestored);

  const ready = (async () => {
    if (o.forceFallback || !webgl2Available()) return fallback(o.forceFallback ? 'forced' : 'webgl-unavailable');
    await fontsReady();
    try { mod = await envLoaders[env](); } catch (e) { emit({ type: 'error', message: String(e) }); return fallback('module'); }
    if (disposed) return;
    if (stillReason) { setState('poster'); renderStill(stillReason); }
    else {
      renderer = createRenderer(canvas);
      if (!renderer) return fallback('webgl-context');
      build(); applySize(); setState('live'); drawNow(); kick();
      emit({ type: 'ready', mode: 'live', tier, style, lang });
    }
    if (ro) ro.observe(isCanvas ? canvas : host);
    if (document.fonts && document.fonts.addEventListener) document.fonts.addEventListener('loadingdone', onFonts);
  })().then(() => mode);
  function onFonts() { if (mode === 'live') rebuild(); else if (mode === 'poster') scheduleStill(); }
  function rebuild() { freeScene(); build(); drawNow(); kick(); }

  const handle = {
    ready,
    get mode() { return mode; },
    setStyle(s) {
      if (disposed || !STYLES[s]) return;
      style = s;
      if (mode === 'poster') { styleLog = [{ t: 0, style: s, from: null }]; return scheduleStill(); }
      if (mode !== 'live') { styleLog = [{ t: tNow, style: s, from: null }]; return; }
      const P = poseAt(tNow);
      styleLog.push({ t: tNow, style: s, from: { p: P.p.clone(), l: P.l.clone(), fov: P.fov } });
      changed(); drawNow(); kick();
    },
    setData(d) {
      if (disposed || !d) return;
      const merged = Object.assign({}, dataLog[dataLog.length - 1].d, d);
      if (mode === 'live') { dataLog.push({ t: tNow, d: merged }); changed(); drawNow(); kick(); }
      else { dataLog = [{ t: 0, d: merged }]; scheduleStill(); }
    },
    emit(type, detail) {
      if (disposed) return;
      evLog.push({ id: ++evId, t: mode === 'live' ? tNow : 0, type, detail: detail || {} });
      if (evLog.length > 64) evLog.shift();
      if (mode === 'live') { changed(); drawNow(); kick(); } else scheduleStill();
    },
    setLang(l) { if (disposed) return; lang = pickLang(l); setLabel(); if (mode === 'live') rebuild(); else scheduleStill(); },
    pause() { userPaused = true; halt(); },
    resume() { if (disposed) return; userPaused = false; kick(); },
    seek(t) { tNow = Math.max(0, +t || 0); drawNow(); kick(); },
    replay() {
      if (disposed) return;
      styleLog = [{ t: 0, style, from: null }]; dataLog = [{ t: 0, d: dataLog[dataLog.length - 1].d }]; evLog = [];
      tNow = 0; lastDraw = -1; changed(); aI = 0; aS = 0; drawNow(); kick();
    },
    snapshot(type = 'image/png', q) { if (mode === 'live' && renderer) { draw(tNow); return canvas.toDataURL(type, q); } return mode === 'poster' ? img.src : null; },
    bench(n = 20) {                                     
      if (mode !== 'live' || !renderer) return null;
      const gl = renderer.getContext(), px = new Uint8Array(4), keep = lastDraw;
      draw(tNow); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
      const t0 = performance.now();
      for (let i = 0; i < n; i++) { lastDraw = -1; draw(tNow + i / 60); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); }
      const ms = (performance.now() - t0) / n; lastDraw = keep; draw(tNow); return +ms.toFixed(2);
    },
    debug() { return sc && sc.debug ? sc.debug(tNow) : null; },
    stats() {
      const s = dts.slice().sort((a, b) => a - b), q = p => s.length ? +s[Math.min(s.length - 1, Math.floor(p * s.length))].toFixed(2) : null;
      const info = renderer && renderer.info;
      return {
        env, style, tier, lang, mode, t: +tNow.toFixed(3), frames, scale: SCALES[qIdx], dpr: size[2], size: size.slice(0, 2),
        p50: q(.5), p95: q(.95), fps: s.length ? +(1000 * s.length / s.reduce((a, b) => a + b, 0)).toFixed(1) : null,
        calls: info ? info.render.calls : 0, triangles: info ? info.render.triangles : 0,
        geometries: info ? info.memory.geometries : 0, textures: info ? info.memory.textures : 0,
        programs: info && info.programs ? info.programs.length : 0, rest: sc ? +restTime().toFixed(2) : null,
        running: !!raf, kit: kit ? kit.stats() : null,
      };
    },
    dispose() {
      if (disposed) return;
      disposed = true; halt(); clearTimeout(stillTimer);
      if (io) io.disconnect(); if (ro) ro.disconnect();
      document.removeEventListener('visibilitychange', onVis);
      if (document.fonts && document.fonts.removeEventListener) document.fonts.removeEventListener('loadingdone', onFonts);
      canvas.removeEventListener('webglcontextlost', onLost); canvas.removeEventListener('webglcontextrestored', onRestored);
      freeScene(); freeRenderer(); camera = null; mod = null;
      if (isCanvas) { canvas.style.display = canvasDisplay; canvas.removeAttribute('data-spatial'); } else canvas.remove();
      img.onerror = null; img.removeAttribute('src'); img.remove();
      setState('disposed'); live.delete(handle);
    },
  };
  live.add(handle);
  return handle;
}

export const SpatialScene = {
  mount, version: VERSION, envs: Object.keys(ENVS), styles: Object.keys(STYLES), tiers: Object.keys(TIERS), meta: { envs: ENVS, styles: STYLES },
  detectTier, webgl2Available, stats: () => ({ live: live.size, contexts }),
};
export default SpatialScene;
