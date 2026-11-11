#!/usr/bin/env node
// Stamp the static page headers into index.html (the pre-view painted before any JavaScript loads).
//
//   node tools/stamp-shell.mjs          rewrite the block between /*@pre-begin*/ and /*@pre-end*/ in index.html
//   node tools/stamp-shell.mjs --check  exit 1 when index.html is out of date (tests/shell-pre.test.mjs does the same)
//
// The inline script after <main> in index.html draws, for the route in the address bar, the same page header the
// view renders first (code tag, h1, lead; on the cockpit the explainer poster), so the largest element of the first
// screen paints with the HTML and CSS instead of after the app boots (mobile LCP). The strings come from the view
// dictionaries (js/i18n/<view>.js) and the shell dictionary (js/i18n/core.js), resolved with the same keys the views
// use. Views whose lead takes parameters (training, compliance, engine) or whose title depends on data (reports) get
// no pre-view: a header that changes when the view mounts would only move the LCP later.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Per view: [dictionary file, title keys (first that exists wins), lead keys, extra h1 class, extra lead class] —
 * the classes the view itself puts on its h1 / lead (they change the type scale, so the boxes must match).
 * `core:` keys read js/i18n/core.js.
 */
const SPEC = {
  airisks: ['airisks', ['title'], ['lead'], 't-page', 't-lead'],
  tasks: ['tasks', ['title'], ['lead'], 't-page', 't-lead'],
  alerts: ['alerts', ['title'], ['lead'], 't-page', 't-lead'],
  contracts: ['contracts', ['title'], ['lead']],
  bom: ['bom', ['title'], ['lead']],
  schedule: ['schedule', ['title'], ['lead']],
  cost: ['cost', ['title'], ['lead']],
  overview: ['overview', ['core:nav.overview.page', 'title'], ['lead']],
  radar: ['radar-view', ['core:nav.radar.title', 'radarView.title', 'title'], ['radarView.lead', 'lead']],
  spatial: ['spatial', ['core:nav.spatial.title', 'title'], ['lead']],
  risks: ['risks', ['core:nav.risks.title', 'title'], ['lead']],
  incidents: ['incidents', ['core:nav.incidents.title', 'title'], ['lead']],
  permits: ['permits', ['core:nav.permits.title'], ['lead'], 't-page'],
  inspections: ['inspections', ['core:nav.inspections.title'], ['lead'], 't-page'],
  dataquality: ['dataquality', ['title'], ['lead']],
  integrations: ['integrations', ['title'], ['lead']],
  roadmap: ['roadmap', ['title'], ['lead']],
  settings: ['settings', ['title'], ['lead']],
};

const get = (obj, path) => path.split('.').reduce((o, k) => (o && typeof o === 'object' ? o[k] : undefined), obj);
const isStatic = (s) => typeof s === 'string' && s.trim() !== '' && !/[{}]/.test(s);

/** { v, ids, routes: { id: { c: code, h?: h1 class, l?: lead class, ar: [title, lead], en: [title, lead] } } }. */
export async function buildPre() {
  const { views } = await import(pathToFileURL(join(root, 'js/views/index.js')).href);
  const core = (await import(pathToFileURL(join(root, 'js/i18n/core.js')).href)).default;
  const routes = {};
  for (const v of views) {
    const spec = SPEC[v.id];
    if (!spec) continue;
    const dict = (await import(pathToFileURL(join(root, `js/i18n/${spec[0]}.js`)).href)).default;
    const pick = (keys, lang) => {
      for (const k of keys) {
        const val = k.startsWith('core:') ? get(core[lang], k.slice(5)) : get(dict[lang], k);
        if (val !== undefined) return val;
      }
      return undefined;
    };
    const entry = { c: v.code || '' };
    if (spec[3]) entry.h = spec[3];
    if (spec[4]) entry.l = spec[4];
    let ok = true;
    for (const lang of ['ar', 'en']) {
      const title = pick(spec[1], lang);
      const lead = pick(spec[2], lang);
      if (!isStatic(title) || !isStatic(lead)) { ok = false; break; }
      entry[lang] = [title, lead];
    }
    if (ok) routes[v.id] = entry;
  }
  return { v: 1, ids: views.map((v) => v.id), routes };
}

/** JSON that is safe inside an inline <script>. */
export function inlineJson(value) {
  return JSON.stringify(value).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
}

const BLOCK = /\/\*@pre-begin\*\/[\s\S]*?\/\*@pre-end\*\//;

export function stamped(html, pre) {
  if (!BLOCK.test(html)) throw new Error('index.html has no /*@pre-begin*/ … /*@pre-end*/ block');
  return html.replace(BLOCK, `/*@pre-begin*/${inlineJson(pre)}/*@pre-end*/`);
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  const file = join(root, 'index.html');
  const html = readFileSync(file, 'utf8');
  const next = stamped(html, await buildPre());
  if (process.argv.includes('--check')) {
    if (next !== html) { console.error('index.html pre-view is out of date: run node tools/stamp-shell.mjs'); process.exit(1); }
    console.log('index.html pre-view is up to date');
  } else if (next !== html) {
    writeFileSync(file, next);
    console.log('index.html pre-view stamped');
  } else console.log('index.html pre-view already up to date');
}
