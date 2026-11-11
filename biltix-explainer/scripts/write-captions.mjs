#!/usr/bin/env node
/**
 * Write WebVTT caption files from the storyboard, so cue text and timing are
 * exactly what the compositions render (same captionCues() and copy).
 * The cue list and VTT text come from scripts/lib/story.mjs, which export-web.mjs and
 * voice-mux.mjs also use for the app's media manifest.
 *
 *   node scripts/write-captions.mjs [--out ../biltix-hse/assets/video]
 *
 * Requires Node ≥ 22.18 (native TypeScript type stripping for storyboard.ts).
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { FPS, LANGS, readData, ROOT, storyCues, vttText } from './lib/story.mjs';

const i = process.argv.indexOf('--out');
const OUT = resolve(ROOT, i > -1 ? process.argv[i + 1] : '../biltix-hse/assets/video');
const data = readData();

mkdirSync(OUT, { recursive: true });
for (const lang of LANGS) {
  const cues = storyCues(lang, data.validation.sources);
  for (const cue of cues) {
    const words = cue.text.split(/\s+/).filter(Boolean).length;
    const secs = (cue.to - cue.from) / FPS;
    if (words > 9) throw new Error(`caption "${cue.text}" has ${words} words (> 9)`);
    if (secs < 1.6) throw new Error(`caption "${cue.text}" is visible ${secs.toFixed(2)} s (< 1.6 s)`);
  }
  const file = resolve(OUT, `explainer-${lang}.vtt`);
  writeFileSync(file, vttText(lang, cues));
  console.log(`write-captions: ${file}`);
}
