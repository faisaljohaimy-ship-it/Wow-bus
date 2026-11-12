#!/usr/bin/env node
/**
 * Render review stills and a 4×3 contact sheet per language.
 *
 *   node scripts/contact-sheet.mjs                     # both languages, 12 default frames
 *   node scripts/contact-sheet.mjs --lang ar --frames 60,175,300
 *
 * Output: out/contact/<lang>-<frame>.png (1920×1080) and out/contact/<lang>-sheet.png
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { bundle } from '@remotion/bundler';
import { renderStill, selectComposition } from '@remotion/renderer';
import { browserExecutable, chromeMode } from './env.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = resolve(ROOT, 'out/contact');
const arg = (name, def) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : def;
};
const langs = arg('lang', 'both') === 'both' ? ['ar', 'en'] : [arg('lang')];
// One frame inside each beat, at the moment its key visual has settled.
const DEFAULT_FRAMES = [60, 172, 280, 420, 560, 615, 715, 790, 865, 990, 1140, 1236];
const frames = arg('frames', DEFAULT_FRAMES.join(',')).split(',').map(Number);
const sheet = arg('sheet', frames.length === 12 ? 'yes' : 'no') === 'yes';

mkdirSync(OUT, { recursive: true });
console.log('bundling…');
const serveUrl = await bundle({ entryPoint: resolve(ROOT, 'src/index.ts') });

for (const lang of langs) {
  const id = lang === 'ar' ? 'ExplainerAR' : 'ExplainerEN';
  const composition = await selectComposition({ serveUrl, id, browserExecutable, chromeMode });
  const files = [];
  for (const frame of frames) {
    const output = resolve(OUT, `${lang}-${String(frame).padStart(4, '0')}.png`);
    await renderStill({ serveUrl, composition, frame, output, browserExecutable, chromeMode, overwrite: true, imageFormat: 'png' });
    files.push(output);
    console.log(`  ${lang} frame ${frame} → ${output}`);
  }
  if (sheet) {
    // Remotion's bundled ffmpeg has no tiling filters; Pillow builds the sheet (review only).
    const out = resolve(OUT, `${lang}-sheet.png`);
    try {
      execFileSync('python3', ['-I', resolve(ROOT, 'scripts/sheet.py'), out, ...files], { stdio: 'inherit' });
      console.log(`  sheet → ${out}`);
    } catch {
      console.warn('  (contact sheet skipped: python3 + Pillow not available)');
    }
  }
}

if (!existsSync(OUT)) process.exit(1);
