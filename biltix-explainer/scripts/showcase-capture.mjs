#!/usr/bin/env node
/**
 * Screen captures of the BILTIX Risk AI app (../biltix-hse) for the MVP showcase video.
 *
 *   NODE_PATH=/opt/node-tools/node_modules node scripts/showcase-capture.mjs [--port 9701] [--lang ar,en]
 *       [--only cockpit,airisks-drawer,…] [--no-phones] [--no-routes] [--check-widths]
 *
 * Same set-up as biltix-hse/tools/qa.mjs: Playwright Chromium (resolved with createRequire, so NODE_PATH and
 * global installs work), the app served by `python3 -m http.server` on 127.0.0.1 when nothing listens on --port,
 * a fixed clock (2026-11-10T09:00:00+03:00) so every "x hours ago" and every seeded timestamp matches, English
 * through ?lang=en plus i18n.setLang, light theme (the app default) and full motion (reducedMotion
 * 'no-preference'). Before each shot it waits for the app's ready flag, the web fonts, non-blank canvases, the
 * metal-edge laser overlay (span.edge-run) and the end of every finite entrance animation; the infinite edge
 * comets are then paused at one fixed time so captures are repeatable (full-page shots hide them), and keyboard
 * focus is dropped so no focus ring is baked into a picture.
 *
 * Output (public/showcase/, kept out of git: about 60 MB, re-create with this command):
 *   <lang>/<route>.png            1600×900 CSS px at DPR 2 (3200×1800) for all 23 routes
 *   <lang>/<route>-full.jpg       full page (main region expanded), JPEG q92, for cockpit, overview, airisks, spatial, integrations
 *   <lang>/airisks-drawer*.png    the risk drawer on AIR-1014 (overview, explanation, evidence, treatment, accept form, accepted)
 *   <lang>/spatial-zone.png, spatial-camera.png, tasks-after.png
 *   <lang>/phone-<route>.png      390×844 at DPR 3 for cockpit, airisks, spatial, tasks
 *   <lang>/thumb/<route>.jpg      960×540 thumbnails of the 23 routes (ffmpeg) for the mosaic
 *   manifest.json                 sizes, page titles, nav titles, the 13 validated sources, and element rectangles
 *                                 (CSS px) the video aims its camera at
 * --check-widths adds a no-horizontal-scroll check of all 23 routes at 360/390/430/768/1024/1440 px in both languages.
 */
import { createRequire } from 'node:module';
import { execFileSync, spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import net from 'node:net';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ffmpegBin } from './env.mjs';

const { chromium } = createRequire(import.meta.url)('playwright');

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const APP = resolve(ROOT, '../biltix-hse');
const OUT = resolve(ROOT, 'public/showcase');
const args = Object.fromEntries(
  process.argv.slice(2).reduce((a, v, i, arr) => {
    if (v.startsWith('--')) a.push([v.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : 'true']);
    return a;
  }, []),
);
const PORT = Number(args.port || 9701);
const LANGS = (args.lang || 'ar,en').split(',');
const ONLY = args.only ? new Set(args.only.split(',')) : null;
const CLOCK = new Date('2026-11-10T09:00:00+03:00');
const ROUTES = 'cockpit,airisks,tasks,alerts,contracts,bom,schedule,cost,overview,radar,spatial,risks,incidents,permits,inspections,training,compliance,engine,dataquality,integrations,reports,roadmap,settings'.split(',');
const FULL = ['cockpit', 'overview', 'airisks', 'spatial', 'integrations'];
const PHONE = ['cockpit', 'airisks', 'spatial', 'tasks'];
const DESKTOP = { width: 1600, height: 900 };
const RISK = 'AR14'; // AIR-1014: a red safety risk awaiting the human decision (crane lifting in forecast high winds)
const want = (name) => !ONLY || ONLY.has(name);

/* ── element rectangles the video aims at (CSS px, page coordinates) ── */
const MARKS = [
  ['h1', 'main h1', 1],
  ['demo', '.status-badge.is-demo', 24],
  ['sim', '.sim-tag', 24],
  ['ring', '.ring-gauge', 16],
  ['radial', '.radial-trend', 16],
  ['metric', '.metric-tile', 8],
  ['domain', '.domain-card', 8],
  ['radar', 'svg:has(.rt-spoke)', 6],
  ['radarCard', '.card:has(.rt-spoke)', 6],
  ['card', '.card.is-framed', 24],
  ['drawer', '.risk-drawer', 1],
  ['explain', '#risk-ov-explain', 1],
  ['evidence', '.risk-drawer .evidence', 2],
  ['dq', '.risk-drawer .evidence-head, .risk-drawer [class*="dq"]', 6],
  ['nextAction', '.risk-drawer [class*="next"]', 2],
  ['acceptForm', '.risk-drawer form', 2],
  ['measures', '.risk-drawer .risk-measures', 1],
  ['measure', '.risk-drawer .risk-measure', 3],
  ['explainText', '.risk-drawer .risk-explain', 1],
  ['rec', '.risk-drawer .risk-rec', 1],
  ['plan', '.sp-plan-card', 1],
  ['zoneSel', '.sp-zone[aria-pressed="true"]', 1],
  ['viewerStatus', '.sp-viewer-status', 1],
  ['viewerHonest', '.sp-viewer-honest', 1],
  ['viewerFeed', '.sp-viewer canvas', 1],
  ['zone', '.sp-zone', 12],
  ['cam', '.sp-cam', 12],
  ['dialog', '.modal, [role="dialog"][aria-modal="true"]', 2],
  ['feed', '.modal canvas, [role="dialog"] canvas', 2],
  ['kanbanCol', '.kanban-col', 6],
  ['kanbanCard', '.kanban-card', 40],
  ['intCard', '.int-card', 40],
  ['topDemo', 'header [class*="demo"], .topbar [class*="demo"]', 3],
];
const BUTTONS = [
  ['btnReview', /Review recommendation|مراجعة التوصية/],
  ['btnAccept', /^(Accept recommendation|قبول التوصية)/],
  ['btnAcceptCreate', /Accept and create task|قبول وإنشاء/],
];

function portOpen(p) {
  return new Promise((res) => {
    const s = net.createConnection({ port: p, host: '127.0.0.1' });
    s.once('connect', () => { s.end(); res(true); });
    s.once('error', () => res(false));
  });
}
let server = null;
if (!(await portOpen(PORT))) {
  server = spawn('python3', ['-m', 'http.server', String(PORT), '--directory', APP, '--bind', '127.0.0.1'], { stdio: 'ignore' });
  for (let i = 0; i < 40 && !(await portOpen(PORT)); i++) await new Promise((r) => setTimeout(r, 150));
}
const base = (lang) => `http://127.0.0.1:${PORT}/${lang === 'en' ? '?lang=en' : ''}`;

/** Wait until the page is ready, painted, and still. */
async function settle(page, lang, { extra = 350 } = {}) {
  await page.waitForFunction(() => window.biltix && window.biltix.ready === true, null, { timeout: 15000 });
  await page.evaluate((l) => {
    try { if (window.biltix.i18n.lang() !== l) window.biltix.i18n.setLang(l); } catch { /* older build */ }
  }, lang);
  await page.evaluate(() => document.fonts.ready);
  // charts drawn: every canvas in main has ink
  await page
    .waitForFunction(() => [...document.querySelectorAll('main canvas, [role="dialog"] canvas')].every((c) => {
      try {
        const ctx = c.getContext('2d');
        if (!ctx || !c.width || !c.height) return true;
        const d = ctx.getImageData(0, 0, c.width, c.height).data;
        let nz = 0;
        for (let i = 3; i < d.length; i += 4 * 97) if (d[i] > 0) nz++;
        return nz >= 5;
      } catch { return true; }
    }), null, { timeout: 8000 })
    .catch(() => console.warn('  (a canvas stayed blank)'));
  // the edge laser overlay is attached to every lit host on screen
  await page
    .waitForFunction(() => {
      const hosts = document.querySelectorAll('.card:not(.is-plain), .tile, .metric-tile, .domain-card, .int-card, .kanban-card');
      return !hosts.length || document.querySelectorAll('.edge-run').length > 0;
    }, null, { timeout: 6000 })
    .catch(() => console.warn('  (no edge overlay)'));
  // finite animations (entrances, count-ups, gauge sweeps) have finished
  await page
    .waitForFunction(() => document.getAnimations().every((a) => {
      const end = a.effect && a.effect.getComputedTiming ? a.effect.getComputedTiming().endTime : 0;
      return !Number.isFinite(end) || a.playState !== 'running';
    }), null, { timeout: 9000, polling: 150 })
    .catch(() => console.warn('  (animations still running after 9 s)'));
  await page.waitForTimeout(extra);
  // freeze the infinite edge comets at one phase; drop focus rings
  await page.evaluate(() => {
    for (const a of document.getAnimations()) {
      const end = a.effect && a.effect.getComputedTiming ? a.effect.getComputedTiming().endTime : 0;
      if (!Number.isFinite(end)) { try { a.pause(); a.currentTime = 2600; } catch { /* ignore */ } }
    }
    if (document.activeElement && document.activeElement !== document.body) document.activeElement.blur();
  });
  await page.waitForTimeout(120);
}

async function marks(page) {
  return page.evaluate(([list, buttons]) => {
    const out = {};
    const rect = (el) => {
      const r = el.getBoundingClientRect();
      return { x: Math.round(r.x * 10) / 10, y: Math.round(r.y * 10) / 10, w: Math.round(r.width * 10) / 10, h: Math.round(r.height * 10) / 10 };
    };
    const visible = (el) => {
      const r = el.getBoundingClientRect();
      if (r.width < 2 || r.height < 2) return false;
      const cs = getComputedStyle(el);
      return cs.visibility !== 'hidden' && cs.display !== 'none' && Number(cs.opacity) > 0.05;
    };
    for (const [key, sel, limit] of list) {
      let els = [];
      try { els = [...document.querySelectorAll(sel)]; } catch { els = []; }
      const items = els.filter(visible).slice(0, limit).map((el) => ({ ...rect(el), t: (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 90) }));
      if (items.length) out[key] = items;
    }
    for (const [key, src] of buttons) {
      const re = new RegExp(src);
      const items = [...document.querySelectorAll('button')].filter((b) => visible(b) && re.test(b.textContent.trim())).slice(0, 3).map((el) => ({ ...rect(el), t: el.textContent.trim() }));
      if (items.length) out[key] = items;
    }
    return out;
  }, [MARKS, BUTTONS.map(([k, re]) => [k, re.source])]);
}

const manifest = existsSync(resolve(OUT, 'manifest.json')) ? JSON.parse(readFileSync(resolve(OUT, 'manifest.json'), 'utf8')) : {};
manifest.clock = CLOCK.toISOString();
manifest.app = (() => { try { return execFileSync('git', ['-C', APP, 'rev-parse', '--short', 'HEAD']).toString().trim(); } catch { return null; } })();
manifest.captures = manifest.captures || {};
manifest.navTitles = manifest.navTitles || {};
manifest.sources = manifest.sources || {};

/** Screenshot and record one capture. */
async function shoot(page, lang, name, { route, kind = 'viewport', full = false, jpeg = false } = {}) {
  const dir = resolve(OUT, lang);
  mkdirSync(dir, { recursive: true });
  const file = `${lang}/${name}.${jpeg ? 'jpg' : 'png'}`;
  const vp = page.viewportSize();
  let cssH = vp.height;
  if (full) {
    // In a page-tall viewport the comets' will-change layers can be composited as solid blocks for a frame
    // (seen once: an orange rectangle over a card). Full-page shots keep the metal edges and drop the comets.
    await page.addStyleTag({ content: '.edge-run{display:none!important}' });
    const sh = await page.evaluate(() => { const m = document.querySelector('main'); return m ? m.scrollHeight + 160 : document.documentElement.scrollHeight; });
    cssH = Math.max(vp.height, Math.min(sh, 7200));
    if (cssH !== vp.height) {
      await page.setViewportSize({ width: vp.width, height: cssH });
      await page.waitForTimeout(900);
      await settle(page, lang, { extra: 200 });
    }
  }
  const m = await marks(page);
  const h1 = await page.evaluate(() => document.querySelector('main h1')?.textContent?.trim() || null);
  await page.screenshot({ path: resolve(OUT, file), type: jpeg ? 'jpeg' : 'png', quality: jpeg ? 92 : undefined, fullPage: false });
  if (full && cssH !== vp.height) await page.setViewportSize(vp);
  const dpr = await page.evaluate(() => window.devicePixelRatio);
  const entry = { file, route, kind, cssW: vp.width, cssH, dpr, w: Math.round(vp.width * dpr), h: Math.round(cssH * dpr), bytes: statSync(resolve(OUT, file)).size, h1, marks: m };
  (manifest.captures[lang] = manifest.captures[lang] || {})[name] = entry;
  console.log(`  ${file}  ${entry.w}×${entry.h}  ${(entry.bytes / 1024).toFixed(0)} KB`);
  return entry;
}

async function open(page, lang, hash, opts) {
  await page.goto(`${base(lang)}#/${hash}`, { waitUntil: 'domcontentloaded' });
  await settle(page, lang, opts);
}

const browser = await chromium.launch();
const newPage = async (viewport, dpr) => {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: dpr, locale: 'ar-SA', reducedMotion: 'no-preference' });
  const page = await ctx.newPage();
  await page.clock.setFixedTime(CLOCK);
  const errors = [];
  page.on('pageerror', (e) => errors.push(String((e && e.message) || e)));
  page.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text()); });
  return { ctx, page, errors };
};

for (const lang of LANGS) {
  console.log(`[${lang}] desktop 1600×900 @2x`);
  const { ctx, page, errors } = await newPage(DESKTOP, 2);

  if (args['no-routes'] !== 'true') {
    for (const route of ROUTES) {
      if (!want(route) && !(FULL.includes(route) && want(`${route}-full`))) continue;
      await open(page, lang, route);
      if (want(route)) await shoot(page, lang, route, { route });
      if (FULL.includes(route) && want(`${route}-full`)) await shoot(page, lang, `${route}-full`, { route, kind: 'full', full: true, jpeg: true });
    }
  }
  // nav titles and the 13 validated data sources, in this language
  await open(page, lang, 'dataquality', { extra: 100 });
  manifest.navTitles[lang] = await page.evaluate(() => Object.fromEntries(window.biltix.views.map((v) => [v.id, window.biltix.i18n.t(`core.nav.${v.id}.title`)])));
  manifest.sources[lang] = await page.evaluate(() => {
    const t = [...document.querySelectorAll('main table')].find((x) => x.querySelectorAll('tbody tr').length === 13) || null;
    return t ? [...t.querySelectorAll('tbody tr')].map((r) => (r.querySelector('th,td')?.textContent || '').trim()) : [];
  });

  // the spatial view: a zone selected, then the simulated camera viewer
  if (want('spatial-zone')) { await open(page, lang, 'spatial?site=S1&zone=S1-Z2'); await shoot(page, lang, 'spatial-zone', { route: 'spatial', kind: 'zone' }); }
  if (want('spatial-camera')) { await open(page, lang, 'spatial?site=S1&zone=S1-Z2&camera=CAM-S1-03', { extra: 1600 }); await shoot(page, lang, 'spatial-camera', { route: 'spatial', kind: 'camera' }); }

  // the risk drawer on AIR-1014: overview, explanation, evidence, treatment, accept form; then accept → task
  if (want('airisks-drawer') || want('airisks-drawer-explain') || want('airisks-drawer-evidence') || want('airisks-drawer-treatment') || want('airisks-drawer-accept') || want('tasks-after')) {
    await open(page, lang, `airisks?risk=${RISK}`, { extra: 600 });
    if (want('airisks-drawer')) await shoot(page, lang, 'airisks-drawer', { route: 'airisks', kind: 'drawer' });
    if (want('airisks-drawer-explain')) {
      await page.evaluate(() => {
        const el = document.querySelector('#risk-ov-explain');
        if (!el) return;
        let s = el.parentElement;
        while (s && !(s.scrollHeight > s.clientHeight + 4 && /(auto|scroll)/.test(getComputedStyle(s).overflowY))) s = s.parentElement;
        if (s) s.scrollTop += el.getBoundingClientRect().top - s.getBoundingClientRect().top - 330;
      });
      await page.waitForTimeout(500);
      await settle(page, lang, { extra: 150 });
      await shoot(page, lang, 'airisks-drawer-explain', { route: 'airisks', kind: 'drawer' });
    }
    const tab = async (re) => {
      const tabs = page.locator('.risk-drawer [role="tab"]');
      const n = await tabs.count();
      for (let i = 0; i < n; i++) if (re.test((await tabs.nth(i).textContent()) || '')) { await tabs.nth(i).click(); break; }
      await page.waitForTimeout(700);
      await settle(page, lang, { extra: 150 });
    };
    if (want('airisks-drawer-evidence')) { await tab(/Evidence|الأدلة|الدليل/); await shoot(page, lang, 'airisks-drawer-evidence', { route: 'airisks', kind: 'drawer' }); }
    await tab(/Treatment|المعالجة/);
    if (want('airisks-drawer-treatment')) await shoot(page, lang, 'airisks-drawer-treatment', { route: 'airisks', kind: 'drawer' });
    const accept = page.locator('.risk-drawer button').filter({ hasText: /^(Accept recommendation|قبول التوصية)/ });
    if (await accept.count()) {
      await accept.first().click();
      await page.waitForTimeout(700);
      await settle(page, lang, { extra: 150 });
      if (want('airisks-drawer-accept')) await shoot(page, lang, 'airisks-drawer-accept', { route: 'airisks', kind: 'drawer' });
      const create = page.locator('.risk-drawer button').filter({ hasText: /Accept and create task|قبول وإنشاء/ });
      if (await create.count()) {
        await create.first().click();
        await page.waitForTimeout(1200);
        await settle(page, lang, { extra: 200 });
        if (want('airisks-drawer-accepted')) await shoot(page, lang, 'airisks-drawer-accepted', { route: 'airisks', kind: 'drawer' });
        if (want('tasks-after')) { await open(page, lang, 'tasks'); await shoot(page, lang, 'tasks-after', { route: 'tasks', kind: 'after-accept' }); }
      } else console.warn('  (no "Accept and create task" button)');
    } else console.warn('  (no "Accept recommendation" button)');
  }
  if (errors.length) console.warn(`  page errors (${errors.length}): ${errors.slice(0, 3).join(' | ')}`);
  manifest.errors = { ...(manifest.errors || {}), [lang]: errors.slice(0, 20) };
  await ctx.close();

  if (args['no-phones'] !== 'true') {
    console.log(`[${lang}] phone 390×844 @3x`);
    const ph = await newPage({ width: 390, height: 844 }, 3);
    for (const route of PHONE) {
      if (!want(`phone-${route}`)) continue;
      await open(ph.page, lang, route);
      await shoot(ph.page, lang, `phone-${route}`, { route, kind: 'phone' });
    }
    await ph.ctx.close();
  }

  // thumbnails for the 23-screen mosaic
  mkdirSync(resolve(OUT, lang, 'thumb'), { recursive: true });
  for (const route of ROUTES) {
    const src = resolve(OUT, lang, `${route}.png`);
    if (!existsSync(src)) continue;
    execFileSync(ffmpegBin, ['-hide_banner', '-v', 'error', '-y', '-i', src, '-vf', 'scale=960:540:flags=lanczos', '-q:v', '3', resolve(OUT, lang, 'thumb', `${route}.jpg`)]);
  }
}

/* ── optional: no page-level horizontal scroll at the six acceptance widths ── */
if (args['check-widths'] === 'true') {
  const widths = [360, 390, 430, 768, 1024, 1440];
  const result = { widths, checked: 0, overflow: [], when: new Date().toISOString() };
  for (const lang of LANGS) {
    for (const w of widths) {
      const { ctx, page } = await newPage({ width: w, height: 900 }, 1);
      await page.goto(`${base(lang)}#/cockpit`, { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => window.biltix && window.biltix.ready === true, null, { timeout: 15000 });
      for (const route of ROUTES) {
        await page.evaluate((r) => { location.hash = `#/${r}`; }, route);
        await page.waitForTimeout(650);
        const over = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
        result.checked += 1;
        if (over) result.overflow.push(`${lang} ${w} ${route}`);
      }
      await ctx.close();
      console.log(`  widths: ${lang} ${w}px checked`);
    }
  }
  manifest.widthCheck = result;
  console.log(`widths: ${result.checked} route × width × language checks, overflow on ${result.overflow.length}${result.overflow.length ? ': ' + result.overflow.join(', ') : ''}`);
}

await browser.close();
if (server) server.kill();
writeFileSync(resolve(OUT, 'manifest.json'), JSON.stringify(manifest, null, 1));
let total = 0;
for (const lang of Object.keys(manifest.captures)) for (const e of Object.values(manifest.captures[lang])) total += e.bytes;
console.log(`manifest → ${resolve(OUT, 'manifest.json')} (${(total / 1048576).toFixed(1)} MB of captures)`);
