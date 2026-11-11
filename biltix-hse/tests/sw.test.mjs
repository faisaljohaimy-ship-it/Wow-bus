/**
 * sw.js behaviour, run in a vm context with a fake Cache Storage and a scripted network (no browser):
 * install / activate, the app shell (network first, cached offline, never replaced by another document),
 * precached files (cache first), other files (stale-while-revalidate), the bypass list, a newer build.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const SRC = readFileSync(new URL('../sw.js', import.meta.url), 'utf8');
const ORIGIN = 'https://app.test';
const STAMP = '3.8.0+202611120000';
const shellHtml = (stamp = STAMP) => `<!DOCTYPE html><html lang="en"><head><meta name="biltix-build" content="${stamp}"></head><body>app ${stamp}</body></html>`;

/** A response as the network returns it for a same-origin request (type 'basic'). */
function basic(body, { status = 200, type = 'text/plain', redirected = false } = {}) {
  const res = new Response(body, { status, headers: { 'Content-Type': type } });
  Object.defineProperty(res, 'type', { value: 'basic' });
  if (redirected) Object.defineProperty(res, 'redirected', { value: true });
  return res;
}

function boot({ stamp = STAMP } = {}) {
  const stores = new Map();           // cache name → Map(url → Response)
  const handlers = {};
  const net = { online: true, routes: new Map(), calls: [] };
  const abs = (u) => new URL(typeof u === 'string' ? u : u.url, `${ORIGIN}/`).href.split('#')[0];
  class FakeRequest {
    constructor(url, init = {}) {
      this.url = abs(url);
      this.method = init.method || 'GET';
      this.mode = init.mode || 'cors';
      this.destination = init.destination || '';
      this.headers = new Headers(init.headers || {});
    }
  }
  const cacheApi = (name) => {
    if (!stores.has(name)) stores.set(name, new Map());
    const map = stores.get(name);
    return {
      async match(req) { const hit = map.get(abs(req)); return hit ? hit.clone() : undefined; },
      async put(req, res) { map.set(abs(req), res); },
      async keys() { return [...map.keys()].map((url) => new FakeRequest(url)); },
    };
  };
  const state = { skipped: 0, claimed: 0 };
  const self = {
    location: { href: `${ORIGIN}/sw.js?v=${encodeURIComponent(stamp)}`, origin: ORIGIN },
    registration: { scope: `${ORIGIN}/` },
    addEventListener(type, fn) { handlers[type] = fn; },
    skipWaiting: async () => { state.skipped += 1; },
    clients: { claim: async () => { state.claimed += 1; } },
  };
  const context = vm.createContext({
    self, URL, Response, Headers, Promise, Set, Map, setTimeout, clearTimeout, console,
    Request: FakeRequest,
    caches: {
      open: async (name) => cacheApi(name),
      keys: async () => [...stores.keys()],
      delete: async (name) => stores.delete(name),
    },
    fetch: async (req) => {
      const url = abs(req);
      net.calls.push(url);
      if (!net.online) throw new TypeError('Failed to fetch');
      // a static host answers by path: the query string does not change the file
      const route = net.routes.get(url) || net.routes.get(url.split('?')[0]) || (/\/index\.html(\?|$)/.test(url) ? net.routes.get(`${ORIGIN}/`) : null);
      if (route) return route();
      return basic(`net:${url}`);
    },
  });
  vm.runInContext(SRC, context, { filename: 'sw.js' });
  const lifecycle = async (type) => { const waits = []; handlers[type]({ waitUntil: (p) => waits.push(p) }); await Promise.all(waits); };
  /** Dispatch a fetch event. Resolves to { handled, response, body } once respondWith and waitUntil settled. */
  const request = async (url, init = {}) => {
    const waits = [];
    let answer;
    handlers.fetch({ request: new FakeRequest(url, init), respondWith: (p) => { answer = Promise.resolve(p); }, waitUntil: (p) => waits.push(Promise.resolve(p).catch(() => null)) });
    if (!answer) return { handled: false };
    const response = await answer;
    await Promise.all(waits);
    return { handled: true, response, body: response ? await response.clone().text() : null };
  };
  const cached = async (name, url) => { const hit = await cacheApi(name).match(url); return hit ? hit.text() : null; };
  net.routes.set(`${ORIGIN}/`, () => basic(shellHtml(stamp), { type: 'text/html' }));
  return { handlers, net, stores, state, lifecycle, request, cached, SHELL: `biltix-shell-${stamp}`, RUNTIME: `biltix-rt-${stamp}`, stamp };
}

const precacheCount = () => (SRC.match(/\/\* BEGIN PRECACHE[\s\S]*?\/\* END PRECACHE \*\//)[0].match(/^ {2}'/gm) || []).length;

export const tests = [
  {
    name: 'install: every precache entry is fetched and stored under this build\'s cache; a failed file does not abort; skipWaiting',
    async fn() {
      const sw = boot();
      sw.net.routes.set(`${ORIGIN}/js/views/tasks.js`, () => basic('nope', { status: 404 }));
      sw.net.routes.set(`${ORIGIN}/css/print.css`, () => { throw new TypeError('reset'); });
      await sw.lifecycle('install');
      const n = precacheCount();
      assert.ok(n > 120, `${n} precache entries`);
      assert.equal(sw.stores.get(sw.SHELL).size, n - 2, 'all but the two failing files are cached');
      assert.equal(await sw.cached(sw.SHELL, './'), shellHtml());
      assert.ok(await sw.cached(sw.SHELL, 'js/app.js'));
      assert.equal(sw.state.skipped, 1);
    },
  },
  {
    name: 'activate: caches of older builds are deleted, other origins\' caches are left alone, clients are claimed',
    async fn() {
      const sw = boot();
      sw.stores.set('biltix-shell-3.7.2+old', new Map([['x', basic('old')]]));
      sw.stores.set('biltix-rt-3.7.2+old', new Map());
      sw.stores.set('someone-else', new Map());
      await sw.lifecycle('install');
      await sw.lifecycle('activate');
      assert.deepEqual([...sw.stores.keys()].sort(), [sw.SHELL, 'someone-else'].sort());
      assert.equal(sw.state.claimed, 1);
    },
  },
  {
    name: 'app shell: network first online, the cached copy offline; ?lang= and hash routes are the same shell',
    async fn() {
      const sw = boot();
      await sw.lifecycle('install');
      const online = await sw.request('/?lang=ar', { mode: 'navigate', destination: 'document' });
      assert.equal(online.body, shellHtml());
      sw.net.online = false;
      for (const url of ['/', '/?lang=ar', '/index.html']) {
        const off = await sw.request(url, { mode: 'navigate', destination: 'document' });
        assert.equal(off.body, shellHtml(), `${url} offline → the cached shell`);
      }
    },
  },
  {
    name: 'app shell with nothing cached and no network: the bilingual offline page (503)',
    async fn() {
      const sw = boot();
      sw.net.online = false;
      const res = await sw.request('/', { mode: 'navigate', destination: 'document' });
      assert.equal(res.response.status, 503);
      assert.ok(res.body.includes('lang="ar"') && res.body.includes('lang="en"'));
    },
  },
  {
    name: 'another document in scope (docs/golive/plan.md opened from #/golive) is never served as, or saved as, the shell',
    async fn() {
      const sw = boot();
      await sw.lifecycle('install');
      const plan = '# BILTIX Risk AI — Technical go-live plan';
      sw.net.routes.set(`${ORIGIN}/docs/golive/plan.md`, () => basic(plan, { type: 'text/markdown' }));
      const doc = await sw.request('/docs/golive/plan.md', { mode: 'navigate', destination: 'document' });
      assert.equal(doc.body, plan, 'the plan itself is returned');
      assert.equal(await sw.cached(sw.SHELL, './'), shellHtml(), 'the cached app shell is untouched');
      sw.net.online = false;
      const offDoc = await sw.request('/docs/golive/plan.md', { mode: 'navigate', destination: 'document' });
      assert.equal(offDoc.body, plan, 'offline: the plan from the runtime cache');
      const app = await sw.request('/', { mode: 'navigate', destination: 'document' });
      assert.equal(app.body, shellHtml(), 'offline: the app still opens');
      const never = await sw.request('/docs/golive/plan-ar.md', { mode: 'navigate', destination: 'document' });
      assert.equal(never.response.status, 503, 'a document never seen is the offline page, not the app shell');
    },
  },
  {
    name: 'a 200 page without the build stamp at the app URL (captive portal, host error page) does not replace the shell',
    async fn() {
      const sw = boot();
      await sw.lifecycle('install');
      sw.net.routes.set(`${ORIGIN}/`, () => basic('<html><body>Sign in to Wi-Fi</body></html>', { type: 'text/html' }));
      const res = await sw.request('/', { mode: 'navigate', destination: 'document' });
      assert.ok(res.body.includes('Sign in'), 'the network answer is passed through');
      assert.equal(await sw.cached(sw.SHELL, './'), shellHtml(), 'the cached shell is still the app');
      sw.net.routes.set(`${ORIGIN}/`, () => basic(shellHtml(), { type: 'text/html', redirected: true }));
      await sw.request('/', { mode: 'navigate', destination: 'document' });
      assert.equal(await sw.cached(sw.SHELL, './'), shellHtml());
    },
  },
  {
    name: 'precached files are served from the cache without the network; the loader\'s module requests included',
    async fn() {
      const sw = boot();
      await sw.lifecycle('install');
      sw.net.calls.length = 0;
      for (const f of ['js/app.js', 'js/views/cockpit.js', 'js/i18n/golive-strip.js', 'css/field.css', 'assets/360/panorama-floor-preview.jpg']) {
        const res = await sw.request(`/${f}`, { destination: f.endsWith('.js') ? 'script' : '' });
        assert.equal(res.body, `net:${ORIGIN}/${f}`, f);
      }
      assert.deepEqual(sw.net.calls, [], 'no network request for precached files');
      sw.net.online = false;
      assert.ok((await sw.request('/js/views/fieldkit.js', { destination: 'script' })).body);
    },
  },
  {
    name: 'other same-origin files: stale-while-revalidate into the runtime cache; offline from that cache; the full panorama is one of them',
    async fn() {
      const sw = boot();
      await sw.lifecycle('install');
      const url = '/assets/360/panorama-floor.jpg';
      assert.equal(await sw.cached(sw.SHELL, url), null, 'not precached (about 1 MB)');
      const first = await sw.request(url, { destination: 'image' });
      assert.equal(first.body, `net:${ORIGIN}${url}`);
      assert.equal(await sw.cached(sw.RUNTIME, url), `net:${ORIGIN}${url}`);
      sw.net.online = false;
      assert.equal((await sw.request(url, { destination: 'image' })).body, `net:${ORIGIN}${url}`);
      const miss = await sw.request('/assets/never-seen.png', { destination: 'image' });
      assert.equal(miss.response.type, 'error', 'a file never seen fails as a network error offline');
    },
  },
  {
    name: 'bypassed: non-GET, other origins, ?build-check=, sw.js itself, Range and media requests',
    async fn() {
      const sw = boot();
      await sw.lifecycle('install');
      assert.equal((await sw.request('/api', { method: 'POST' })).handled, false);
      assert.equal((await sw.request('https://elsewhere.test/x.js')).handled, false);
      assert.equal((await sw.request('/index.html?build-check=1')).handled, false);
      assert.equal((await sw.request('/sw.js?v=1')).handled, false);
      assert.equal((await sw.request('/assets/video/explainer-en.mp4', { destination: 'video' })).handled, false);
      assert.equal((await sw.request('/assets/video/explainer-en.mp4')).handled, false);
      assert.equal((await sw.request('/assets/360/panorama-floor.jpg', { headers: { Range: 'bytes=0-99' } })).handled, false);
    },
  },
  {
    name: 'a newer build on the network: the old worker stops answering from its cache (no mixed builds), cache only as offline fallback',
    async fn() {
      const sw = boot();
      await sw.lifecycle('install');
      sw.net.routes.set(`${ORIGIN}/`, () => basic(shellHtml('3.8.1+202612010000'), { type: 'text/html' }));
      const nav = await sw.request('/', { mode: 'navigate', destination: 'document' });
      assert.ok(nav.body.includes('3.8.1'), 'the new page is served');
      assert.equal(await sw.cached(sw.SHELL, './'), shellHtml(), 'and is not stored in the old build\'s cache');
      sw.net.routes.set(`${ORIGIN}/js/app.js`, () => basic('new app.js'));
      assert.equal((await sw.request('/js/app.js', { destination: 'script' })).body, 'new app.js', 'modules now come from the network');
      sw.net.online = false;
      assert.equal((await sw.request('/js/app.js', { destination: 'script' })).body, `net:${ORIGIN}/js/app.js`, 'offline: the old copy rather than nothing');
    },
  },
];
