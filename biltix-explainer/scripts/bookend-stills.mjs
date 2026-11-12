#!/usr/bin/env node
/**
 * Review stills of the cinematic bookends straight from the compositions (one bundle, PNG).
 *
 *   node scripts/bookend-stills.mjs --ids OpenEN,CloseAR --frames 30,90,150 [--out out/bookend-stills]
 *
 * For stills of the rendered files use ffmpeg instead (see README, "MVP film bookends").
 */
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { bundle } from '@remotion/bundler';
import { renderStill, selectComposition } from '@remotion/renderer';
import { browserExecutable, chromeMode } from './env.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const arg = (name, def) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : def;
};
const ids = arg('ids', 'OpenAR,OpenEN,CloseAR,CloseEN').split(',');
const frames = arg('frames', '20,60,110,160,200').split(',').map(Number);
const OUT = resolve(ROOT, arg('out', 'out/bookend-stills'));
mkdirSync(OUT, { recursive: true });

const serveUrl = await bundle({ entryPoint: resolve(ROOT, 'src/index.ts') });
for (const id of ids) {
  const composition = await selectComposition({ serveUrl, id, browserExecutable, chromeMode });
  for (const frame of frames) {
    const output = resolve(OUT, `${id}-${String(frame).padStart(3, '0')}.png`);
    await renderStill({ serveUrl, composition, frame, output, browserExecutable, chromeMode, overwrite: true, imageFormat: 'png' });
    console.log(output);
  }
}
