#!/usr/bin/env node
/**
 * Write WebVTT caption files from the storyboard, so cue text and timing are
 * exactly what the compositions render (same captionCues() and copy).
 *
 *   node scripts/write-captions.mjs [--out ../biltix-hse/assets/video]
 *
 * Requires Node ≥ 22.18 (native TypeScript type stripping for storyboard.ts).
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CAPTIONS, captionCues, fillCaption, FPS } from '../src/storyboard.ts';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const i = process.argv.indexOf('--out');
const OUT = resolve(ROOT, i > -1 ? process.argv[i + 1] : '../biltix-hse/assets/video');
const data = JSON.parse(readFileSync(resolve(ROOT, 'src/data.json'), 'utf8'));

const ts = (frame) => {
  const ms = Math.round((frame / FPS) * 1000);
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  const s = Math.floor((ms % 60_000) / 1000);
  const r = ms % 1000;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(r).padStart(3, '0')}`;
};

mkdirSync(OUT, { recursive: true });
for (const lang of ['ar', 'en']) {
  const lines = [`WEBVTT - BILTIX Risk AI explainer (${lang === 'ar' ? 'العربية' : 'English'}) — ${lang === 'ar' ? 'بيانات توضيحية' : 'demo data'}`, ''];
  captionCues().forEach((cue, n) => {
    const text = fillCaption(CAPTIONS[lang][cue.id], { sources: data.validation.sources });
    const words = text.split(/\s+/).filter(Boolean).length;
    const secs = (cue.to - cue.from) / FPS;
    if (words > 9) throw new Error(`caption "${text}" has ${words} words (> 9)`);
    if (secs < 1.6) throw new Error(`caption "${text}" is visible ${secs.toFixed(2)} s (< 1.6 s)`);
    lines.push(String(n + 1), `${ts(cue.from)} --> ${ts(cue.to)} line:88% align:center`, text, '');
  });
  const file = resolve(OUT, `explainer-${lang}.vtt`);
  writeFileSync(file, lines.join('\n'));
  console.log(`write-captions: ${file}`);
}
