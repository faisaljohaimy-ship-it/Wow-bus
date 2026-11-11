#!/usr/bin/env node
/**
 * Review stills of the film v2 (bundles once, renders many frames).
 *
 *   node scripts/film-stills.mjs [--lang ar] [--at 0.3,0.8] [--frames 120,480] [--scenes 1,7] [--out dir] [--scale 0.5]
 *
 * --at: points inside every scene (fraction of the scene); --frames: absolute frames instead; --scenes limits --at.
 * Writes <out>/<lang>-<frame>.jpg.
 */
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { bundle } from '@remotion/bundler';
import { renderStill, selectComposition } from '@remotion/renderer';
import { browserExecutable, chromeMode } from './env.mjs';
import { filmTimeline } from './lib/film-timeline.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const arg = (name, def) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : def;
};
const langs = arg('lang', 'ar').split(',');
const OUT = resolve(arg('out', resolve(ROOT, 'out/film-stills')));
const scale = Number(arg('scale', '0.5'));
const only = arg('scenes', null)?.split(',').map(Number);
mkdirSync(OUT, { recursive: true });

console.log('bundling…');
const serveUrl = await bundle({ entryPoint: resolve(ROOT, 'src/index.ts') });
for (const lang of langs) {
  const id = lang === 'ar' ? 'FilmAR' : 'FilmEN';
  const composition = await selectComposition({ serveUrl, id, inputProps: { lang }, browserExecutable, chromeMode });
  const tl = filmTimeline(lang);
  const frames = arg('frames', null)
    ? arg('frames').split(',').map(Number)
    : tl.scenes.filter((_, i) => !only || only.includes(i + 1)).flatMap((s) => arg('at', '0.75').split(',').map((a) => s.from + Math.round(s.frames * Number(a))));
  for (const frame of frames) {
    const output = resolve(OUT, `${lang}-${String(frame).padStart(4, '0')}.jpg`);
    const t0 = Date.now();
    await renderStill({ serveUrl, composition, frame, output, browserExecutable, chromeMode, overwrite: true, imageFormat: 'jpeg', jpegQuality: 88, scale, inputProps: { lang }, timeoutInMilliseconds: 120000 });
    console.log(`  ${lang} ${frame} → ${output} (${Date.now() - t0} ms)`);
  }
}
