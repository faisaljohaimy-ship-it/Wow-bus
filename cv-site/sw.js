 
'use strict';
const BUILD = 'a671154d1259';
const CACHE = 'fj-brief-' + BUILD;
const params = new URL(self.location.href).searchParams;
const SAVED = params.get('b') === BUILD ? (params.get('l') || '').split(',').filter((l) => l === 'ar' || l === 'en') : [];
const SCOPE = new URL(self.registration.scope);
const PAGE_KEY = new URL('fj-offline/page', SCOPE).href;
const PASSAGE = /^\/media\/brief\/(ar|en)-\d{2}-[a-z]+(?:-[a-z]+)*\.mp4$/;
const ASSET = /^\/assets\/[\w./-]+$/;

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const k of await caches.keys()) if (k.startsWith('fj-brief-') && k !== CACHE) await caches.delete(k);
    await self.clients.claim();
  })());
});

 
function parseRange(header, size) {
  const m = /^bytes=(\d*)-(\d*)$/.exec(String(header || '').trim());
  if (!m || (m[1] === '' && m[2] === '')) return null;
  let start;
  let end;
  if (m[1] === '') {
    const n = Number(m[2]);
    if (!(n > 0)) return null;
    start = Math.max(0, size - n);
    end = size - 1;
  } else {
    start = Number(m[1]);
    end = m[2] === '' ? size - 1 : Math.min(Number(m[2]), size - 1);
  }
  if (!(start <= end) || start >= size) return null;
  return [start, end];
}

async function passage(request) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(request.url, { ignoreSearch: true, ignoreVary: true });
  if (!hit) return fetch(request);
  const blob = await hit.blob();
  const size = blob.size;
  const type = hit.headers.get('Content-Type') || 'video/mp4';
  const base = { 'Content-Type': type, 'Accept-Ranges': 'bytes', 'Cache-Control': 'no-store', 'X-FJ-Offline': BUILD };
  const header = request.headers.get('Range');
  if (!header) return new Response(blob, { status: 200, headers: Object.assign({ 'Content-Length': String(size) }, base) });
  const r = parseRange(header, size);
  if (!r) return new Response(null, { status: 416, headers: Object.assign({ 'Content-Range': 'bytes */' + size }, base) });
  return new Response(blob.slice(r[0], r[1] + 1, type), {
    status: 206,
    headers: Object.assign({ 'Content-Length': String(r[1] - r[0] + 1), 'Content-Range': 'bytes ' + r[0] + '-' + r[1] + '/' + size }, base),
  });
}

async function asset(request) {
  const hit = await (await caches.open(CACHE)).match(request.url, { ignoreVary: true });
  return hit || fetch(request);
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || !SAVED.length) return;
  const url = new URL(req.url);
  if (url.origin !== SCOPE.origin) return;
  const m = PASSAGE.exec(url.pathname);
  if (m) {
    if (SAVED.indexOf(m[1]) >= 0) event.respondWith(passage(req));
    return;
  }
  if (req.mode === 'navigate') {
    const rel = url.pathname.startsWith(SCOPE.pathname) ? url.pathname.slice(SCOPE.pathname.length) : null;
    if (rel === '' || rel === 'index.html') event.respondWith(fetch(req).catch(async () => (await (await caches.open(CACHE)).match(PAGE_KEY)) || Response.error()));
    return;
  }
  if (ASSET.test(url.pathname) && !req.headers.has('Range')) event.respondWith(asset(req));
});
