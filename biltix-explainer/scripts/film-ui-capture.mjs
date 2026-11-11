#!/usr/bin/env node
/**
 * Film v2 — real, moving screen recordings of the BILTIX Risk AI app (biltix-hse v3.7 motion pass) for the film.
 *
 *   NODE_PATH=/opt/node-tools/node_modules node scripts/film-ui-capture.mjs [--app /path/to/biltix-hse] [--port 9861]
 *       [--lang ar,en] [--only ui-cockpit,ui-register,…] [--sheet /path/ui-sheet.jpg] [--keep-frames]
 *       [--slow 5] [--slow-heavy 15] [--target-fps 45] [--max-gap-p95 45] [--retakes 2] [--clock-mode anchored|fixed]
 *
 * Set-up (as biltix-hse/tools/qa.mjs): Playwright Chromium resolved with createRequire (NODE_PATH and global installs
 * work); the app served read-only by `python3 -m http.server --bind 127.0.0.1` when nothing listens on --port (stopped
 * at the end); locale ar-SA; full motion (reducedMotion 'no-preference'); light theme (store.setSettings + data-theme);
 * the language named in the URL (?lang=ar|en; v3.7.1 opens in English otherwise) and checked with i18n.setLang; the
 * clock at 2026-11-10T09:00:00+03:00 (Asia/Riyadh), the instant the QA runs and the showcase stills use. Clock mode
 * 'anchored' (default) starts Date at that instant and runs it on the page clock below, so the header clock ticks in the
 * video instead of standing still; 'fixed' holds Date at that instant, as qa.mjs does with page.clock.setFixedTime (not
 * used here: that fake clock also replaces requestAnimationFrame and the timers, which the recorder paces itself).
 * The cockpit's "How the platform works" hero starts minimised (its own localStorage key), so the metrics, ring
 * gauges, domain dials and laser edges are what animate in.
 *
 * Recording: CDP Page.startScreencast (jpeg, quality 92, everyNthFrame 1, at the device-pixel size of the viewport)
 * with every frame's timestamp. The screencast only sends a frame when the picture changes, so each frame is held
 * until the next one (ffmpeg concat demuxer with per-frame durations), then resampled to a constant 30 fps H.264 file
 * (-vsync cfr -r 30, CRF 18, yuv420p, BT.709 limited range, +faststart, no audio).
 * A software-rendered 1080p page on a shared machine paints 3–25 frames a real second (1–2 while a heavy view mounts),
 * so every take is recorded in slow motion and its timestamps compressed back. The dilation covers every clock the
 * page animates with: the document timeline (CSS animations, transitions, Web Animations) through CDP
 * Animation.setPlaybackRate, a page clock installed before any app script (performance.now, requestAnimationFrame
 * time, setTimeout / setInterval kept on page time across rate changes, Date) and the camera-feed worker's clock.
 * Base dilation: at least --slow, raised from the real screencast rate measured on the settled page just before the
 * take (to about --target-fps frames per clip second); ×3 (--slow-heavy / --slow) while a view mounts and stages in or
 * a drawer / viewer opens. A take whose frame-gap p95 still exceeds --max-gap-p95 ms is recorded again from a fresh
 * page with 1.8× the dilation (--retakes). Nothing is interpolated: every frame of a clip is a real paint.
 * Every clip starts on a settled page (ready flag, web fonts, finished entrances; the target view mounted once before,
 * as the rail's hover prefetch would load it) and moves only through scripted clicks, typing and eased scrolls: no
 * cursor is drawn, and the pointer is parked over an empty strip of the fixed top bar after each click, so no hover
 * light or tooltip follows it and no card lifts as content scrolls under it. Routes are entered from the side rail
 * (or the phone tab bar), so the gliding nav marker, the route transition and the staged entrances are all real.
 *
 * Clips (desktop 1920×1080 at DPR 1; the phone clip 390×844 at DPR 3 → 1170×2532), each in Arabic (RTL) and English:
 *   ui-cockpit       rail → Risk cockpit: KPI count-ups, ring gauges, domain dials, laser edges; eased scroll to the
 *                    12-week radial risk trend as it draws in
 *   ui-register      rail → AI risk register: rows stagger in; Rating "Red"; search "curtain wall" / "الزجاجية" (the
 *                    two façade risks: single-source glass AIR-1005 and the A1100 slip AIR-1003); open AIR-1005 →
 *                    overview (explanation) → Evidence tab
 *   ui-treatment     AIR-1005 drawer → Treatment tab → Accept recommendation → Accept and create task: the decision is
 *                    recorded (note, linked task, toast, history count)
 *   ui-tasks         (the recommendation accepted off camera, owner filter = procurement manager) rail → Mitigation
 *                    tasks: the new glazing PO task moved New → In progress (FLIP), then its details drawer
 *   ui-schedule      rail → Schedule risk: tiles, slippage bars and the critical-path table; eased scroll to the
 *                    curtain-wall activity A1100, highlighted and opened (critical path, 28-day slip)
 *   ui-spatial       rail → Site spatial view: select the Tower crane 2 zone (the plan pans and zooms to it), open the
 *                    simulated camera CAM-S1-03 (lens iris opens on the live simulated feed)
 *   ui-integrations  rail → Integrations & systems: connector cards and gauges, eased scroll; rail → Data quality &
 *                    validation (the validated sources)
 *   ui-phone         phone: tab bar → Risk cockpit, staged entrance, eased scroll through the KPIs and domain dials
 *
 * Output: public/v2/ui/<clip>-<lang>.mp4 (public/v2 is kept out of git: re-create with this command) and
 * public/v2/ui/manifest.json (per clip: size, duration, frames in / out, capture density and frame-gap percentiles,
 * dilation, takes, and `marks` — seconds from the clip start of each scripted beat, so the film can cut on them).
 * --sheet writes a contact sheet (4 labelled frames per clip).
 */
import { createRequire } from 'node:module';
import { execFileSync, spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import net from 'node:net';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const { chromium } = createRequire(import.meta.url)('playwright');

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = Object.fromEntries(
  process.argv.slice(2).reduce((a, v, i, arr) => {
    if (v.startsWith('--')) a.push([v.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : 'true']);
    return a;
  }, []),
);
const APP = resolve(args.app || process.env.BILTIX_APP || resolve(ROOT, '../biltix-hse'));
const PORT = Number(args.port || 9861);
const LANGS = (args.lang || 'ar,en').split(',').filter(Boolean);
const ONLY = args.only ? new Set(args.only.split(',')) : null;
const OUT = resolve(ROOT, 'public/v2/ui');
const FRAMES = resolve(args.frames || resolve(ROOT, 'out/ui-frames'));
const FFMPEG = args.ffmpeg || (existsSync('/usr/bin/ffmpeg') ? '/usr/bin/ffmpeg' : 'ffmpeg');
const FFPROBE = args.ffprobe || (existsSync('/usr/bin/ffprobe') ? '/usr/bin/ffprobe' : 'ffprobe');
const CLOCK = new Date('2026-11-10T09:00:00+03:00');
const CLOCK_MODE = args['clock-mode'] === 'fixed' ? 'fixed' : 'anchored';
const FPS = 30;
// Time dilation while recording (see the header): the least base dilation; calibration may raise it per take.
const SLOW = Math.max(1, Number(args.slow || 5));
// Heavier dilation while a view mounts and stages in, or a drawer / viewer opens: the busiest moments for the renderer.
const HEAVY = Math.max(SLOW, Number(args['slow-heavy'] || 15));
// Load calibration: before each take, the real screencast rate of the settled page is measured and the dilation raised
// (never lowered) so that the clip gets about TARGET frames per second; a take whose frame-gap p95 still exceeds
// MAX_P95 ms is recorded again from a fresh page with 1.8× the dilation (at most RETAKES times).
const TARGET = Number(args['target-fps'] || 45);
const MAX_P95 = Number(args['max-gap-p95'] || 45);
const RETAKES = Number(args.retakes ?? 2);
const MAX_SLOW = 40;
const DESKTOP = { viewport: { width: 1920, height: 1080 }, dpr: 1 };
const PHONE = { viewport: { width: 390, height: 844 }, dpr: 3, mobile: true };
const OWNER_PROCUREMENT = 'م. بدر القرني — مدير المشتريات'; // stored owner value (shown translated in English)
const RISK = 'AR5'; // AIR-1005: single-source curtain-wall glass supplier, order date passed — the film's worked example
const want = (name) => !ONLY || ONLY.has(name);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
mkdirSync(OUT, { recursive: true });

/* ───────────────────────────── server (as qa.mjs) ───────────────────────────── */
function portOpen(p) {
  return new Promise((res) => {
    const s = net.createConnection({ port: p, host: '127.0.0.1' });
    s.once('connect', () => { s.end(); res(true); });
    s.once('error', () => res(false));
  });
}
let server = null;
if (!(await portOpen(PORT))) {
  if (!existsSync(resolve(APP, 'index.html'))) throw new Error(`no app at ${APP} (pass --app)`);
  server = spawn('python3', ['-m', 'http.server', String(PORT), '--directory', APP, '--bind', '127.0.0.1'], { stdio: 'ignore' });
  for (let i = 0; i < 40 && !(await portOpen(PORT)); i++) await sleep(150);
}
// The language is always named in the URL (v3.7.1 opens in English unless told otherwise).
const base = (lang) => `http://127.0.0.1:${PORT}/?lang=${lang}`;

/* ───────────────────────────── browser, page set-up ───────────────────────────── */
const browser = await chromium.launch({ args: ['--hide-scrollbars', '--force-color-profile=srgb', '--font-render-hinting=none'] });

async function newPage(kind, lang) {
  const ctx = await browser.newContext({
    viewport: kind.viewport, deviceScaleFactor: kind.dpr, isMobile: !!kind.mobile, hasTouch: !!kind.mobile,
    locale: 'ar-SA', timezoneId: 'Asia/Riyadh', colorScheme: 'light', reducedMotion: 'no-preference',
  });
  await ctx.addInitScript(({ anchor, mode }) => {
    try { localStorage.setItem('biltix-hse:explainer:collapsed', '1'); } catch { /* storage blocked */ }
    // One page clock for everything scripted: performance.now, requestAnimationFrame timestamps, timer delays and Date
    // all follow `rate` (1 = real time). The recorder slows it down; CSS / WAAPI follow through Animation.setPlaybackRate.
    const realNow = performance.now.bind(performance);
    const realRaf = window.requestAnimationFrame.bind(window);
    const realTimeout = window.setTimeout.bind(window);
    const realClear = window.clearTimeout.bind(window);
    let rate = 1;
    let r0 = realNow();
    let v0 = r0;
    const toV = (real) => v0 + (real - r0) * rate;
    const vnow = () => toV(realNow());
    performance.now = vnow;
    // Animation.setPlaybackRate also slows Chrome's own rAF timestamps; callbacks get this clock's time instead, so
    // rAF time and performance.now always agree.
    window.requestAnimationFrame = (cb) => realRaf(() => cb(vnow()));
    // Timers run on page time: each pending timeout / interval keeps its due time and is re-armed when the rate
    // changes, so a delay set before a change still lasts exactly its length in page time.
    const pending = new Map();
    let seq = 1e7;
    const arm = (id) => {
      const t = pending.get(id);
      if (!t) return;
      if (t.h != null) realClear(t.h);
      t.h = realTimeout(() => fire(id), Math.max(0, (t.due - vnow()) / rate));
    };
    const fire = (id) => {
      const t = pending.get(id);
      if (!t) return;
      if (t.every != null) { t.due = Math.max(t.due + t.every, vnow()); arm(id); } else pending.delete(id);
      t.fn(...t.a); // re-armed first: an exception still reaches the page's error handling, and the interval goes on
    };
    const add = (fn, d, a, every) => {
      if (typeof fn !== 'function') return realTimeout(fn, Math.max(0, Number(d) || 0) / rate);
      const ms = Math.max(0, Number(d) || 0);
      const id = ++seq;
      pending.set(id, { fn, a, due: vnow() + ms, every: every ? Math.max(1, ms) : null, h: null });
      arm(id);
      return id;
    };
    const clear = (id) => { const t = pending.get(id); if (t) { realClear(t.h); pending.delete(id); } else realClear(id); };
    window.setTimeout = (fn, d, ...a) => add(fn, d, a, false);
    window.setInterval = (fn, d, ...a) => add(fn, d, a, true);
    window.clearTimeout = clear;
    window.clearInterval = clear;
    Object.defineProperty(window, '__filmTime', { value: Object.freeze({ setRate(r) { const n = realNow(); v0 = toV(n); r0 = n; rate = r; for (const id of pending.keys()) arm(id); } }) });
    // Date: starts at the film's instant and runs on the page clock ('anchored'), or stands still ('fixed', as qa.mjs).
    const Real = Date;
    const t0 = vnow();
    const now = mode === 'fixed' ? () => anchor : () => anchor + (vnow() - t0);
    globalThis.Date = new Proxy(Real, {
      construct(target, a, nt) { return Reflect.construct(target, a.length ? a : [now()], nt); },
      apply() { return new Real(now()).toString(); },
      get(target, prop, recv) { return prop === 'now' ? () => Math.floor(now()) : Reflect.get(target, prop, recv); },
    });
  }, { anchor: CLOCK.getTime(), mode: CLOCK_MODE });
  const page = await ctx.newPage();
  // Workers (the simulated camera feed) keep their own clock: it follows the page's rate from the moment the worker
  // appears (its frame loop is a setTimeout chain paced by Date.now, so each next frame picks up a rate change).
  page.on('worker', (w) => {
    w.evaluate((r0) => {
      if (self.__filmTime) return;
      const realNow = performance.now.bind(performance);
      const realTimeout = self.setTimeout.bind(self);
      const dateOff = Date.now() - realNow();
      let rate = r0;
      let p0 = realNow();
      let v0 = p0;
      const vnow = () => v0 + (realNow() - p0) * rate;
      performance.now = vnow;
      Date.now = () => Math.floor(vnow() + dateOff);
      self.setTimeout = (fn, d, ...a) => realTimeout(fn, Math.max(0, Number(d) || 0) / rate, ...a);
      if (typeof self.requestAnimationFrame === 'function') { const raf = self.requestAnimationFrame.bind(self); self.requestAnimationFrame = (cb) => raf(() => cb(vnow())); }
      self.__filmTime = { setRate(r) { const n = realNow(); v0 = vnow(); p0 = n; rate = r; } };
    }, page.__filmRate || 1).catch(() => {});
  });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String((e && e.message) || e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  return { ctx, page, errors, kind, lang };
}

/** Wait until the app is ready, painted in the right language and theme, and every finite entrance has finished. */
async function settle(page, lang, { extra = 400 } = {}) {
  await page.waitForFunction(() => window.biltix && window.biltix.ready === true, null, { timeout: 20000 });
  await page.evaluate((l) => {
    try { window.biltix.store?.setSettings?.({ theme: 'light' }); document.documentElement.setAttribute('data-theme', 'light'); } catch { /* older build */ }
    try { if (window.biltix.i18n.lang() !== l) window.biltix.i18n.setLang(l); } catch { /* older build */ }
  }, lang);
  await page.evaluate(async (l) => {
    await document.fonts.ready;
    const fam = l === 'en' ? '"IBM Plex Sans"' : '"IBM Plex Sans Arabic"';
    await Promise.all(['400', '500', '600'].map((w) => document.fonts.load(`${w} 16px ${fam}`).catch(() => null)));
    await document.fonts.load('500 14px "IBM Plex Mono"').catch(() => null);
  }, lang);
  await page
    .waitForFunction(() => document.getAnimations().every((a) => {
      const end = a.effect && a.effect.getComputedTiming ? a.effect.getComputedTiming().endTime : 0;
      return !Number.isFinite(end) || a.playState !== 'running';
    }), null, { timeout: 9000, polling: 150 })
    .catch(() => console.warn('  (animations still running after 9 s)'));
  await sleep(extra);
}

async function open(page, lang, hash, opts) {
  await page.goto(`${base(lang)}#/${hash}`, { waitUntil: 'domcontentloaded' });
  await settle(page, lang, opts);
}

/** In-app route change (no reload: loaded view modules, view memory and the store stay), page scrolled to the top. */
async function hop(page, lang, hash, opts) {
  await page.evaluate((h) => { location.hash = `#/${h}`; }, hash);
  await sleep(300);
  await settle(page, lang, opts);
  await page.evaluate(() => {
    for (const b of document.querySelectorAll('.toast .toast-close')) b.click();
    const main = document.querySelector('main');
    if (main) main.scrollTop = 0;
    document.scrollingElement.scrollTop = 0;
  });
  await sleep(400);
}

/** Set-up for a clip that enters `target` from `from`: the target view is mounted once first (its modules load and
 *  its charts warm up, as the rail's hover prefetch does for a person), then the page waits on `from`. */
async function enterFrom(page, lang, target, from) {
  await open(page, lang, target, { extra: 200 });
  await hop(page, lang, from);
}

/** Park the (invisible) pointer over an empty strip of the fixed top bar: no hover light, tooltip or card lift. */
async function park(page) {
  const vp = page.viewportSize();
  const pt = await page.evaluate(({ w }) => {
    const bad = 'button, a, input, select, textarea, [role="button"], [role="tab"], [data-tooltip], .card, svg, canvas, main, .rail, aside, nav';
    const ys = [10, 52, 6];
    const xs = [];
    for (let x = 20; x < w; x += 16) xs.push(x);
    xs.sort((a, b) => Math.abs(a - w * 0.3) - Math.abs(b - w * 0.3));
    for (const y of ys) for (const x of xs) {
      const el = document.elementFromPoint(x, y);
      if (!el || el.closest(bad)) continue;
      if (getComputedStyle(el).cursor === 'pointer') continue;
      return { x, y };
    }
    return { x: Math.round(w * 0.3), y: 6 };
  }, { w: vp.width });
  await page.mouse.move(pt.x, pt.y, { steps: 6 });
}

/** Eased (cubic in-out) scroll of the page scroller (main on desktop, the document on phones). */
async function glide(page, { to = null, selector = null, align = 0.5, by = 0, duration = 1800 } = {}) {
  await page.evaluate(([sel, target, al, delta, dur]) => new Promise((done) => {
    const main = document.querySelector('main');
    const own = main && main.scrollHeight > main.clientHeight + 4 && /(auto|scroll)/.test(getComputedStyle(main).overflowY);
    const s = own ? main : document.scrollingElement;
    const viewH = own ? main.clientHeight : window.innerHeight;
    const top0 = own ? main.getBoundingClientRect().top : 0;
    let dest = typeof target === 'number' ? target : s.scrollTop + delta;
    if (sel) {
      const el = document.querySelector(sel);
      if (el) { const r = el.getBoundingClientRect(); dest = s.scrollTop + (r.top - top0) + r.height / 2 - viewH * al; }
    }
    dest = Math.max(0, Math.min(dest, s.scrollHeight - viewH));
    const from = s.scrollTop;
    const prev = s.style.scrollBehavior;
    s.style.scrollBehavior = 'auto';
    const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
    const t0 = performance.now();
    const step = (now) => {
      const k = Math.min(1, (now - t0) / dur);
      s.scrollTop = from + (dest - from) * ease(k);
      if (k < 1) requestAnimationFrame(step); else { s.style.scrollBehavior = prev; done(); }
    };
    requestAnimationFrame(step);
  }), [selector, to, align, by, duration]);
}

/** Real click on a point of `selector` where the element on top belongs to it (and not to `avoid`): plan zones carry
 *  cameras, sensors and crane labels inside them. */
async function clickInside(page, selector, avoid) {
  const pt = await page.evaluate(([sel, av]) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    const tries = [];
    for (const fy of [0.35, 0.5, 0.65, 0.25, 0.8]) for (const fx of [0.3, 0.45, 0.6, 0.2, 0.75]) tries.push([r.left + r.width * fx, r.top + r.height * fy]);
    for (const [x, y] of tries) {
      const hit = document.elementFromPoint(x, y);
      if (hit && el.contains(hit) && !(av && hit.closest(av))) return { x, y };
    }
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }, [selector, avoid || null]);
  if (!pt) throw new Error(`nothing matches ${selector}`);
  await page.mouse.move(pt.x, pt.y, { steps: 10 });
  await page.mouse.click(pt.x, pt.y);
}

/** Click through the rail (desktop) or the tab bar (phone); falls back to the router for routes without a button. */
async function nav(page, id) {
  const btn = page.locator(`.rail-item[data-view="${id}"]:visible, .tab-item[data-view="${id}"]:visible`).first();
  if (await btn.count()) {
    if ((await page.evaluate(() => matchMedia('(pointer: coarse)').matches))) await btn.tap();
    else await btn.click();
  } else await page.evaluate((v) => { location.hash = `#/${v}`; }, id);
}

/* ───────────────────────────── recorder ───────────────────────────── */
/**
 * Records `fn` with the CDP screencast while the page runs SLOW× slower than real time: the document timeline (CSS
 * animations, transitions, Web Animations) through CDP Animation.setPlaybackRate, and the page clock (performance.now,
 * requestAnimationFrame, timers, Date — and the camera worker's) through window.__filmTime. Frame timestamps are then
 * divided by SLOW, so the clip plays at real speed. `fn(mark, wait)` runs the scripted beats: wait(ms) waits `ms` of
 * page time; mark(label) notes a beat. Returns the frames ({ file, t } in clip seconds) and the marks.
 */
async function record(page, name, fn, { slow: base = SLOW, heavy: heavyBase = HEAVY } = {}) {
  const dir = resolve(FRAMES, name);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  const vp = page.viewportSize();
  const dpr = await page.evaluate(() => window.devicePixelRatio);
  const cdp = await page.context().newCDPSession(page);
  const frames = [];
  const writes = [];
  cdp.on('Page.screencastFrame', (ev) => {
    cdp.send('Page.screencastFrameAck', { sessionId: ev.sessionId }).catch(() => {});
    const file = resolve(dir, `f${String(frames.length).padStart(5, '0')}.jpg`);
    frames.push({ file, t: ev.metadata.timestamp });
    writes.push(writeFile(file, Buffer.from(ev.data, 'base64')));
  });
  const marks = [];
  const setRate = async (r) => {
    page.__filmRate = r;
    await Promise.all([
      cdp.send('Animation.setPlaybackRate', { playbackRate: r }),
      page.evaluate((x) => window.__filmTime.setRate(x), r),
      ...page.workers().map((w) => w.evaluate((x) => self.__filmTime && self.__filmTime.setRate(x), r).catch(() => {})),
    ]);
  };
  // Dilation segments: [{ wall, slow }]; the clip clock integrates wall time ÷ slow over them.
  const segs = [];
  let slow = base;
  const pace = async (k) => { slow = k; await setRate(1 / k); segs.push({ wall: Date.now() / 1000, slow: k }); };
  await setRate(1 / base);
  const wall0 = Date.now() / 1000;
  segs.push({ wall: wall0, slow: base });
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 92, everyNthFrame: 1, maxWidth: Math.round(vp.width * dpr), maxHeight: Math.round(vp.height * dpr) });
  const api = {
    mark: (label) => marks.push({ label, wall: Date.now() / 1000 }),
    wait: (ms) => sleep(ms * slow),
    slow: () => slow,
    pace,
    /** Run `fn` with a heavier dilation (a view mounting, a drawer or viewer opening), then go back. `k` is relative to
     *  the clip's base dilation (default: the heavy dilation). */
    heavy: async (fn, k = null) => {
      const prev = slow;
      await pace(Math.min(MAX_SLOW * 2, k ? Math.max(base, (k / SLOW) * base) : heavyBase));
      try { await fn(); } finally { await pace(prev); }
    },
  };
  await fn(api);
  const wallEnd = Date.now() / 1000;
  await cdp.send('Page.stopScreencast');
  await setRate(1);
  await sleep(150);
  await Promise.all(writes);
  await cdp.detach().catch(() => {});
  if (!frames.length) throw new Error(`${name}: the screencast sent no frames`);
  // Frame timestamps are wall-clock seconds (the same clock as Date.now here); clip time = wall time ÷ SLOW.
  const first = frames[0].t;
  const skew = Math.abs(first - wall0) < 30 ? 0 : first - wall0;
  const bounds = segs.map((sg, i) => ({ from: sg.wall + skew, to: i + 1 < segs.length ? segs[i + 1].wall + skew : Infinity, slow: sg.slow }));
  const abs = (w) => bounds.reduce((acc, b) => acc + Math.max(0, Math.min(w, b.to) - b.from) / b.slow, 0);
  const clip = (wall) => abs(wall) - abs(first);
  const out = frames.map((f) => ({ file: f.file, t: clip(f.t) }));
  const end = Math.max(out[out.length - 1].t + 1 / FPS, clip(wallEnd + skew));
  return { frames: out, end, realSeconds: wallEnd - wall0, paces: [...new Set(segs.map((x) => x.slow))], marks: marks.map((m) => ({ label: m.label, t: +clip(m.wall + skew).toFixed(3) })), size: { w: Math.round(vp.width * dpr), h: Math.round(vp.height * dpr) } };
}

/** Real screencast frames per second of the settled page (its laser edges keep it painting), over `ms`. */
async function measureFps(page, ms = 1500) {
  const vp = page.viewportSize();
  const dpr = await page.evaluate(() => window.devicePixelRatio);
  const cdp = await page.context().newCDPSession(page);
  let n = 0;
  cdp.on('Page.screencastFrame', (ev) => { n++; cdp.send('Page.screencastFrameAck', { sessionId: ev.sessionId }).catch(() => {}); });
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 92, everyNthFrame: 1, maxWidth: Math.round(vp.width * dpr), maxHeight: Math.round(vp.height * dpr) });
  await sleep(300);
  n = 0;
  const t0 = Date.now();
  await sleep(ms);
  const fps = n / ((Date.now() - t0) / 1000);
  await cdp.send('Page.stopScreencast');
  await cdp.detach().catch(() => {});
  await sleep(100);
  return fps;
}

/** Frames + timestamps → constant 30 fps H.264. */
function encode(name, rec) {
  const { frames, end } = rec;
  const list = [];
  for (let i = 0; i < frames.length; i++) {
    const next = i + 1 < frames.length ? frames[i + 1].t : end;
    const d = Math.max(0.001, next - frames[i].t);
    list.push(`file '${frames[i].file}'`, `duration ${d.toFixed(6)}`);
  }
  list.push(`file '${frames[frames.length - 1].file}'`); // the concat demuxer needs the last file twice to honour its duration
  const listFile = resolve(FRAMES, `${name}.ffconcat`);
  writeFileSync(listFile, `ffconcat version 1.0\n${list.join('\n')}\n`);
  const out = resolve(OUT, `${name}.mp4`);
  const { w, h } = rec.size;
  const even = (n) => n - (n % 2);
  execFileSync(FFMPEG, [
    '-hide_banner', '-v', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', listFile,
    '-vf', `scale=${even(w)}:${even(h)}:flags=lanczos:in_range=full:out_range=tv:in_color_matrix=bt601:out_color_matrix=bt709,format=yuv420p`,
    '-vsync', 'cfr', '-r', String(FPS),
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-pix_fmt', 'yuv420p', '-profile:v', 'high',
    '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-color_range', 'tv',
    '-movflags', '+faststart', '-an', out,
  ], { stdio: ['ignore', 'ignore', 'pipe'] });
  return out;
}

function probe(file) {
  const j = JSON.parse(execFileSync(FFPROBE, ['-v', 'error', '-select_streams', 'v:0', '-count_frames', '-show_entries', 'stream=width,height,r_frame_rate,nb_read_frames:format=duration', '-of', 'json', file]).toString());
  const s = j.streams[0];
  return { width: s.width, height: s.height, fps: s.r_frame_rate, frames: Number(s.nb_read_frames), duration: Number(j.format.duration) };
}

/* ───────────────────────────── the clips ───────────────────────────── */
const T = {
  red: /^(Red|أحمر)$/,
  accept: /^(Accept recommendation|قبول التوصية)/,
  create: /(Accept and create task|قبول وإنشاء)/,
  search: { en: 'curtain wall', ar: 'الزجاجية' },
};

const CLIPS = [
  {
    name: 'ui-cockpit', kind: DESKTOP,
    setup: async ({ page, lang }) => enterFrom(page, lang, 'cockpit', 'airisks'),
    run: async ({ page }, { mark, wait, heavy }) => {
      await wait(400);
      mark('nav');
      await heavy(async () => { await nav(page, 'cockpit'); await park(page); await wait(1900); });
      await wait(1100);
      mark('scroll'); await glide(page, { selector: '.card:has(.rt-spoke)', align: 0.52, duration: 2400 });
      mark('trend'); await wait(2000);
    },
  },
  {
    name: 'ui-register', kind: DESKTOP,
    setup: async ({ page, lang }) => enterFrom(page, lang, 'airisks', 'cockpit'),
    run: async ({ page, lang }, { mark, wait, heavy, slow }) => {
      await wait(400);
      mark('nav');
      await heavy(async () => { await nav(page, 'airisks'); await park(page); await wait(1500); });
      await wait(200);
      mark('red'); await page.locator('.reg-card .seg-btn').filter({ hasText: T.red }).first().click(); await park(page);
      await wait(900);
      const q = page.locator('.reg-card input.filter-search-input').first();
      mark('search'); await q.click(); await q.pressSequentially(T.search[lang], { delay: 65 * slow() }); await park(page);
      await wait(1000);
      mark('open');
      await heavy(async () => { await page.locator('.reg-card button.row-open[aria-label*="AIR-1005"]').first().click(); await park(page); await wait(1000); });
      await wait(700);
      mark('evidence');
      await heavy(async () => { await page.locator('.risk-drawer .drawer-tab').nth(1).click(); await park(page); await wait(600); });
      await wait(900);
    },
  },
  {
    name: 'ui-treatment', kind: DESKTOP,
    setup: async ({ page, lang }) => open(page, lang, `airisks?risk=${RISK}`, { extra: 600 }),
    run: async ({ page }, { mark, wait, heavy }) => {
      await wait(500);
      mark('treatment');
      await heavy(async () => { await page.locator('.risk-drawer .drawer-tab').nth(2).click(); await park(page); await wait(600); });
      await wait(900);
      mark('accept'); await page.locator('.risk-drawer button').filter({ hasText: T.accept }).first().click(); await park(page);
      await wait(1400);
      mark('create');
      await heavy(async () => { await page.locator('.risk-drawer button').filter({ hasText: T.create }).first().click(); await park(page); await wait(800); });
      mark('recorded'); await wait(2000);
    },
  },
  {
    name: 'ui-tasks', kind: DESKTOP,
    setup: async ({ page, lang }) => {
      // off camera: the façade recommendation is accepted, which creates its mitigation task
      await open(page, lang, `airisks?risk=${RISK}`, { extra: 300 });
      await page.locator('.risk-drawer .drawer-tab').nth(2).click(); await sleep(500);
      await page.locator('.risk-drawer button').filter({ hasText: T.accept }).first().click(); await sleep(500);
      await page.locator('.risk-drawer button').filter({ hasText: T.create }).first().click(); await sleep(900);
      // the board filtered to the procurement manager through its own filter (the view remembers a reader's filters)
      await hop(page, lang, 'tasks');
      await page.locator('main select').first().selectOption(OWNER_PROCUREMENT);
      await sleep(600);
      await hop(page, lang, 'airisks');
    },
    run: async ({ page }, { mark, wait, heavy }) => {
      await wait(400);
      mark('nav');
      await heavy(async () => { await nav(page, 'tasks'); await park(page); await wait(1500); });
      await wait(300);
      const card = page.locator('.kanban-col').first().locator('.kanban-card').filter({ hasText: /glazing|الزجاج/ }).first();
      mark('menu'); await card.locator('button.kanban-move').click();
      await wait(800);
      mark('move');
      await heavy(async () => { await page.locator('[role="menu"] [role="menuitem"]').first().click(); await park(page); await wait(900); });
      await wait(700);
      const moved = page.locator('.kanban-card').filter({ hasText: /glazing|الزجاج/ }).first();
      mark('details');
      await heavy(async () => { await moved.locator('button[aria-label*="MT-"]').last().click(); await park(page); await wait(900); });
      await wait(1300);
    },
  },
  {
    name: 'ui-schedule', kind: DESKTOP,
    setup: async ({ page, lang }) => enterFrom(page, lang, 'schedule', 'airisks'),
    run: async ({ page }, { mark, wait, heavy }) => {
      await wait(400);
      mark('nav');
      await heavy(async () => { await nav(page, 'schedule'); await park(page); await wait(2000); });
      await wait(300);
      const sel = 'tr:has(button.row-open[aria-label*="A1100"])';
      const row = page.locator(sel).first();
      mark('scroll'); await heavy(() => glide(page, { selector: sel, align: 0.62, duration: 1700 }), 10);
      await wait(200);
      const box = await row.boundingBox();
      if (box) { mark('highlight'); await page.mouse.move(box.x + box.width * 0.45, box.y + box.height / 2, { steps: 14 }); }
      await wait(700);
      mark('open');
      await heavy(async () => { await row.locator('button.row-open').click(); await park(page); await wait(1000); });
      await wait(1400);
    },
  },
  {
    name: 'ui-spatial', kind: DESKTOP,
    setup: async ({ page, lang }) => enterFrom(page, lang, 'spatial', 'airisks'),
    run: async ({ page }, { mark, wait, heavy }) => {
      await wait(400);
      mark('nav');
      await heavy(async () => { await nav(page, 'spatial'); await park(page); await wait(1600); });
      await wait(200);
      mark('zone');
      await heavy(async () => { await clickInside(page, '.sp-zone[data-zone="S1-Z2"]', '.sp-cam, .sp-sensor, text'); await park(page); await wait(1500); });
      await wait(300);
      mark('camera');
      await heavy(async () => { await clickInside(page, '.sp-cam[data-camera="CAM-S1-03"]'); await park(page); await wait(1500); });
      await wait(1800);
    },
  },
  {
    name: 'ui-integrations', kind: DESKTOP,
    setup: async ({ page, lang }) => { await enterFrom(page, lang, 'dataquality', 'integrations'); await hop(page, lang, 'airisks'); },
    run: async ({ page }, { mark, wait, heavy }) => {
      await wait(400);
      mark('nav');
      await heavy(async () => { await nav(page, 'integrations'); await park(page); await wait(1700); });
      await wait(200);
      mark('scroll'); await heavy(() => glide(page, { to: 650, duration: 2200 }), 10);
      await wait(600);
      mark('validation');
      await heavy(async () => { await nav(page, 'dataquality'); await park(page); await wait(1800); });
      await wait(700);
    },
  },
  {
    name: 'ui-phone', kind: PHONE,
    setup: async ({ page, lang }) => enterFrom(page, lang, 'cockpit', 'airisks'),
    run: async ({ page }, { mark, wait, heavy }) => {
      await wait(400);
      mark('nav');
      await heavy(async () => { await nav(page, 'cockpit'); await wait(1600); }, 10);
      await wait(500);
      mark('scroll'); await glide(page, { by: 1500, duration: 3400 });
      await wait(1100);
    },
  },
];

/* ───────────────────────────── run ───────────────────────────── */
const manifestFile = resolve(OUT, 'manifest.json');
const manifest = existsSync(manifestFile) ? JSON.parse(readFileSync(manifestFile, 'utf8')) : {};
manifest.clock = CLOCK.toISOString();
manifest.clockMode = CLOCK_MODE;
manifest.app = (() => { try { return execFileSync('git', ['-C', APP, 'describe', '--always', '--dirty']).toString().trim(); } catch { return null; } })();
manifest.fps = FPS;
manifest.clips = manifest.clips || {};
const made = [];
let failed = false;

for (const clip of CLIPS) {
  if (!want(clip.name)) continue;
  for (const lang of LANGS) {
    const id = `${clip.name}-${lang}`;
    let boost = 1;
    for (let take = 0; take <= RETAKES; take++) {
      const env = await newPage(clip.kind, lang);
      try {
        await clip.setup(env);
        await park(env.page);
        const fpsReal = await measureFps(env.page);
        const slow = Math.min(MAX_SLOW, Math.max(SLOW, Math.ceil(TARGET / Math.max(fpsReal, 0.5))) * boost);
        const heavy = Math.min(MAX_SLOW * 2, Math.max(HEAVY, slow * (HEAVY / SLOW)));
        const rec = await record(env.page, id, (api) => clip.run(env, api), { slow, heavy });
        const span = rec.frames[rec.frames.length - 1].t - rec.frames[0].t;
        const gaps = rec.frames.slice(1).map((f, i) => f.t - rec.frames[i].t).sort((x, y) => x - y);
        const q = (k) => (gaps.length ? +(gaps[Math.min(gaps.length - 1, Math.floor(k * gaps.length))] * 1000).toFixed(0) : 0);
        const gapMs = { p50: q(0.5), p95: q(0.95), max: q(1) };
        const note = `${id} take ${take + 1}: ${fpsReal.toFixed(1)} real fps → ${rec.paces.map((x) => +x.toFixed(1)).join('/')}× dilation, ${rec.frames.length} frames, gap p95 ${gapMs.p95} ms, max ${gapMs.max} ms`;
        if (gapMs.p95 > MAX_P95 && take < RETAKES && slow < MAX_SLOW) {
          console.log(`${note} — retake`);
          boost *= 1.8;
          continue;
        }
        const file = encode(id, rec);
        const p = probe(file);
        const entry = {
          file: `ui/${id}.mp4`, lang, dir: lang === 'ar' ? 'rtl' : 'ltr', width: p.width, height: p.height, fps: FPS,
          duration: +p.duration.toFixed(3), framesOut: p.frames, framesIn: rec.frames.length,
          captureFps: +(rec.frames.length / Math.max(span, 0.001)).toFixed(1), gapMs, realFps: +fpsReal.toFixed(1),
          slow: rec.paces.map((x) => +x.toFixed(1)), takes: take + 1, realSeconds: +rec.realSeconds.toFixed(1), bytes: statSync(file).size,
          marks: rec.marks, pageErrors: env.errors.slice(0, 5),
        };
        manifest.clips[id] = entry;
        made.push({ id, file, entry });
        console.log(`${id}: ${p.width}×${p.height} ${p.duration.toFixed(2)} s, ${entry.captureFps} frames/s of clip time (${note.slice(id.length + 1)}), ${(entry.bytes / 1048576).toFixed(1)} MB${env.errors.length ? `, ${env.errors.length} page error(s): ${env.errors[0]}` : ''}`);
        break;
      } catch (e) {
        if (take < RETAKES) { console.warn(`${id} take ${take + 1} failed (${String(e && e.message || e).split('\n')[0]}) — retake`); continue; }
        failed = true;
        console.error(`${id}: FAILED — ${e && e.stack || e}`);
        break;
      } finally {
        if (!args['keep-frames']) rmSync(resolve(FRAMES, id), { recursive: true, force: true });
        await env.ctx.close();
      }
    }
  }
}
await browser.close();
if (server) server.kill();
writeFileSync(manifestFile, JSON.stringify(manifest, null, 1));
if (!args['keep-frames']) rmSync(FRAMES, { recursive: true, force: true });

/* ───────────────────────────── contact sheet ───────────────────────────── */
if (args.sheet) {
  const sheet = resolve(args.sheet);
  const tiles = resolve(dirname(sheet), 'ui-sheet-tiles');
  rmSync(tiles, { recursive: true, force: true });
  mkdirSync(tiles, { recursive: true });
  const font = ['/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', '/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf'].find((f) => existsSync(f));
  const ids = Object.keys(manifest.clips).filter((id) => existsSync(resolve(ROOT, 'public/v2', manifest.clips[id].file)))
    .sort((a, b) => CLIPS.findIndex((c) => a.startsWith(c.name + '-')) - CLIPS.findIndex((c) => b.startsWith(c.name + '-')) || a.localeCompare(b));
  const FR = [0.1, 0.4, 0.7, 0.97];
  let n = 0;
  for (const id of ids) {
    const e = manifest.clips[id];
    for (const f of FR) {
      const t = Math.max(0, e.duration * f - 0.05);
      const label = `${id}  ${t.toFixed(1)}s`;
      const draw = font ? `,drawtext=fontfile=${font}:text='${label}':x=8:y=h-24:fontsize=15:fontcolor=white:box=1:boxcolor=0x0B1220@0.72:boxborderw=5` : '';
      execFileSync(FFMPEG, ['-hide_banner', '-v', 'error', '-y', '-ss', t.toFixed(3), '-i', resolve(ROOT, 'public/v2', e.file), '-frames:v', '1',
        '-vf', `scale=w=640:h=360:force_original_aspect_ratio=decrease:flags=lanczos,pad=640:360:(ow-iw)/2:(oh-ih)/2:color=0xE9EDF2${draw}`,
        '-q:v', '3', resolve(tiles, `t${String(n++).padStart(3, '0')}.jpg`)]);
    }
  }
  if (n) {
    execFileSync(FFMPEG, ['-hide_banner', '-v', 'error', '-y', '-framerate', '1', '-i', resolve(tiles, 't%03d.jpg'),
      '-vf', `tile=${FR.length}x${Math.ceil(n / FR.length)}:padding=6:margin=6:color=0xFFFFFF`, '-frames:v', '1', '-q:v', '3', sheet]);
    console.log(`sheet → ${sheet} (${n} tiles)`);
  }
  rmSync(tiles, { recursive: true, force: true });
}
console.log(`${made.length} clip(s) → ${OUT}`);
process.exit(failed ? 1 : 0);
