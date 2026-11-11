// QA harness for Biltix HSE. Usage:
//   node tools/qa.mjs --routes cockpit,airisks --viewport 1440x900,390x844 --theme dark,light --lang ar,en --out ./qa-out [--clock 2026-11-10T09:00:00+03:00] [--tall true] [--wait 3000] [--port 8131]
// Serves this folder with python3 http.server when nothing listens on --port. Exits 1 on console errors, failed requests (media
// downloads cancelled by the page excepted), blank canvases, horizontal overflow, an empty main region, or visible Arabic text on
// a non-Arabic page. Requires Playwright + Chromium (preinstalled in cloud sessions).
import { createRequire } from 'node:module';
// CommonJS resolution honours NODE_PATH and global installs; a bare ESM import would not.
const { chromium } = createRequire(import.meta.url)('playwright');
import { spawn } from 'node:child_process';
import { mkdirSync, existsSync } from 'node:fs';
import net from 'node:net';
import { fileURLToPath } from 'node:url';

const args = Object.fromEntries(process.argv.slice(2).reduce((a, v, i, arr) => { if (v.startsWith('--')) a.push([v.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : 'true']); return a; }, []));
const port = Number(args.port || 8131);
const root = args.root || fileURLToPath(new URL('..', import.meta.url));
const routes = (args.routes || 'cockpit,airisks,tasks,alerts,contracts,bom,schedule,cost,overview,radar,spatial,risks,incidents,permits,inspections,training,compliance,engine,dataquality,integrations,reports,roadmap,settings').split(',').filter(Boolean);
const viewports = (args.viewport || '1440x900').split(',').map(v => { const [w, h] = v.split('x').map(Number); return { width: w, height: h }; });
const themes = (args.theme || 'dark').split(',');
const langs = (args.lang || 'ar').split(',');
const freeze = args.clock ? new Date(args.clock) : null;
const out = args.out || `${process.cwd()}/qa-out`;
const waitMs = Number(args.wait || 3000);
mkdirSync(out, { recursive: true });

function portOpen(p) { return new Promise(res => { const s = net.createConnection({ port: p, host: '127.0.0.1' }); s.once('connect', () => { s.end(); res(true); }); s.once('error', () => res(false)); }); }
let server = null;
if (!(await portOpen(port))) {
  server = spawn('python3', ['-m', 'http.server', String(port), '--directory', root, '--bind', '127.0.0.1'], { stdio: 'ignore' });
  for (let i = 0; i < 40 && !(await portOpen(port)); i++) await new Promise(r => setTimeout(r, 150));
}

const browser = await chromium.launch();
const report = [];
let failed = false;
for (const lang of langs) for (const theme of themes) for (const vp of viewports) {
  const ctx = await browser.newContext({ viewport: vp, deviceScaleFactor: 1, locale: 'ar-SA', reducedMotion: 'no-preference' });
  const page = await ctx.newPage();
  if (freeze) { try { await page.clock.setFixedTime(freeze); } catch (e) {} }
  const errors = [], pageErrors = [], failedReqs = [], warnings = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); else if (m.type() === 'warning') warnings.push(m.text()); });
  page.on('pageerror', e => pageErrors.push(String(e && e.message || e)));
  // A media download the page cancels (the cockpit hero's <video> is unmounted on navigation) is ERR_ABORTED by design,
  // not a failed request; media that answers 4xx/5xx is still reported by the 'response' listener below.
  page.on('requestfailed', r => { const u = r.url(); const why = r.failure()?.errorText || ''; if (u.includes('fonts.g') || (r.resourceType() === 'media' && why.includes('ERR_ABORTED'))) return; failedReqs.push(`${u} :: ${why}`); });
  page.on('response', r => { if (r.status() >= 400 && !r.url().includes('fonts.g')) failedReqs.push(`${r.url()} :: HTTP ${r.status()}`); });
  for (const route of routes) {
    errors.length = 0; pageErrors.length = 0; failedReqs.length = 0; warnings.length = 0;
    const url = `http://127.0.0.1:${port}/${lang !== 'ar' ? '?lang=' + lang : ''}#/${route}`;
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded' });
      try { await page.waitForFunction(() => window.biltix && window.biltix.store && typeof window.biltix.store.setSettings === 'function', null, { timeout: 8000 }); } catch (e) {}
      await page.evaluate(([t, l]) => { try { window.biltix?.store?.setSettings?.({ theme: t }); document.documentElement.setAttribute('data-theme', t); if (window.biltix?.i18n?.setLang && window.biltix.i18n.lang?.() !== l) window.biltix.i18n.setLang(l); } catch (e) {} }, [theme, lang]);
      try { await page.waitForFunction(() => !window.biltix || window.biltix.ready !== false, null, { timeout: 8000 }); } catch (e) {}
      await page.waitForTimeout(waitMs);
      const info = await page.evaluate(() => {
        const main = document.querySelector('main');
        const canvases = [...document.querySelectorAll('canvas')].map(c => {
          try { const ctx = c.getContext('2d'); if (!ctx || !c.width || !c.height) return { w: c.width, h: c.height, blank: true, note: 'no-ctx-or-zero' };
            const d = ctx.getImageData(0, 0, c.width, c.height).data; let nz = 0; for (let i = 3; i < d.length; i += 4 * 97) if (d[i] > 0) nz++; return { w: c.width, h: c.height, blank: nz < 5 }; } catch (e) { return { blank: null, note: String(e) }; }
        });
        const overflow = document.documentElement.scrollWidth > window.innerWidth + 1;
        const h1 = document.querySelector('main h1')?.textContent?.trim() || null;
        const mainChars = main ? main.textContent.replace(/\s+/g, ' ').trim().length : 0;
        const dir = document.documentElement.getAttribute('dir');
        const theme = document.documentElement.getAttribute('data-theme');
        const feedItems = document.querySelectorAll('.feed li, .feed .feed-item').length;
        const htmlLang = document.documentElement.getAttribute('lang');
        // Translation gaps: Arabic text on an English page, outside elements that declare lang="ar" (e.g. the language switch).
        const foreign = [];
        if (htmlLang && !htmlLang.startsWith('ar')) {
          const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
          for (let n = walker.nextNode(); n; n = walker.nextNode()) {
            const text = n.nodeValue.trim();
            if (!text || !/[\u0600-\u06FF]/.test(text)) continue;
            const el = n.parentElement;
            if (!el || el.closest('[lang^="ar"], script, style, template, [hidden], [aria-hidden="true"]')) continue;
            if (!el.getClientRects().length) continue;
            foreign.push(text.slice(0, 80));
          }
        }
        return { canvases, overflow, h1, mainChars, dir, theme, feedItems, title: document.title, htmlLang, foreignCount: foreign.length, foreignSamples: foreign.slice(0, 12) };
      });
      const shot = `${out}/${route}-${lang === 'ar' ? '' : lang + '-'}${theme}-${vp.width}x${vp.height}.png`;
      if (args.tall) {
        const sh = await page.evaluate(() => { const m = document.querySelector('main'); return m ? m.scrollHeight + 160 : document.documentElement.scrollHeight; });
        const h = Math.max(vp.height, Math.min(sh, 7000));
        if (h !== vp.height) { await page.setViewportSize({ width: vp.width, height: h }); await page.waitForTimeout(700); }
      }
      await page.screenshot({ path: shot, fullPage: true });
      if (args.tall) await page.setViewportSize(vp);
      const entry = { route, lang, theme, viewport: `${vp.width}x${vp.height}`, ...info, errors: [...errors], pageErrors: [...pageErrors], failedReqs: [...failedReqs], warnings: warnings.slice(0, 5), screenshot: shot };
      entry.ok = !entry.errors.length && !entry.pageErrors.length && !entry.failedReqs.length && entry.mainChars > 40 && !entry.canvases.some(c => c.blank === true) && !entry.overflow && !entry.foreignCount;
      if (!entry.ok) failed = true;
      report.push(entry);
    } catch (e) { failed = true; report.push({ route, theme, viewport: `${vp.width}x${vp.height}`, fatal: String(e) }); }
  }
  await ctx.close();
}
await browser.close();
if (server) server.kill();
console.log(JSON.stringify(report, null, 1));
console.log(failed ? '\nQA: ISSUES FOUND' : '\nQA: ALL OK');
process.exit(failed ? 1 : 0);
