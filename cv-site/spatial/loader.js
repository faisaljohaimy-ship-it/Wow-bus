 
const BASE = new URL('./', import.meta.url).href;

export function posterUrl(env, style, lang) { return `${BASE}posters/${env}-${style}-${lang === 'en' ? 'en' : 'ar'}.webp`; }

export function mountWhenVisible(el, opts = {}) {
  const o = Object.assign({ env: 'room', style: 'dolly' }, opts);
  const lang = String(o.lang || document.documentElement.lang || 'ar').slice(0, 2) === 'en' ? 'en' : 'ar';
  if (o.tier === 'auto') delete o.tier;
  if (!o.posterBase) o.posterBase = BASE + 'posters/';
  const reduced = o.reducedMotion ?? matchMedia('(prefers-reduced-motion: reduce)').matches;
  let handle = null, done = false, io = null, resolveReady;
  const queue = [], ready = new Promise(r => { resolveReady = r; });
  el.style.backgroundImage = `url("${posterUrl(o.env, o.style, lang)}")`;
  el.style.backgroundSize = 'cover'; el.style.backgroundPosition = 'center';
  el.setAttribute('data-spatial', 'poster-pending');
  const call = name => (...a) => { if (handle) return handle[name](...a); queue.push([name, a]); };
  const proxy = {
    ready, get handle() { return handle; },
    setStyle: call('setStyle'), setData: call('setData'), emit: call('emit'), setLang: call('setLang'),
    pause: call('pause'), resume: call('resume'), replay: call('replay'),
    dispose() { done = true; if (io) io.disconnect(); if (handle) handle.dispose(); el.style.backgroundImage = ''; },
  };
  async function load() {
    if (done) return;
    const { SpatialScene } = await import('./spatial.js');
    if (done) return;
    handle = SpatialScene.mount(el, o);
    for (const [n, a] of queue.splice(0)) handle[n](...a);
    resolveReady(await handle.ready);
  }
  if (reduced && !o.data) { el.setAttribute('data-spatial', 'poster'); resolveReady('poster'); return proxy; }
  if (typeof IntersectionObserver === 'undefined') { load(); return proxy; }
  io = new IntersectionObserver(es => { if (es.some(e => e.isIntersecting)) { io.disconnect(); io = null; load(); } }, { rootMargin: o.rootMargin || '200px' });
  io.observe(el);
  return proxy;
}
