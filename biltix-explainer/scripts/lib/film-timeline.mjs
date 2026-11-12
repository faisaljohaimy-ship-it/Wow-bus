/**
 * The film v2 timeline in Node (the same arithmetic as src/film/timeline.ts): scenes from src/film/voice-timing.json
 * and src/film/layout.json. Used by scripts/film-mix.mjs (music ducking), film-stills.mjs and check-frames.py's
 * film mode (which reads the JSON written by `node scripts/lib/film-timeline.mjs <lang>`).
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

export function filmTimeline(lang) {
  const L = JSON.parse(readFileSync(resolve(ROOT, 'src/film/layout.json'), 'utf8'));
  const raw = JSON.parse(readFileSync(resolve(ROOT, 'src/film/voice-timing.json'), 'utf8'))[lang];
  if (!raw || raw.lines.length !== L.scenes) throw new Error(`voice-timing.json has no ${L.scenes}-line timeline for ${lang}`);
  const { fps, intro, lead, tail, hold } = L;
  let t = 0;
  const scenes = raw.lines.map((ln, i) => {
    const len = ln.end - ln.start;
    const ld = (i === 0 ? intro : 0) + lead;
    const tl = i === raw.lines.length - 1 ? hold : tail;
    const from = Math.round(t * fps);
    const voiceSec = t + ld;
    t += ld + len + tl;
    const to = Math.round(t * fps);
    return { index: i, from, frames: to - from, voice: [voiceSec, voiceSec + len] };
  });
  return { fps, xfade: L.xfade, total: Math.round(t * fps), seconds: t, scenes, demoScenes: L.demoScenes, chip: L.chip };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  console.log(JSON.stringify(filmTimeline(process.argv[2] || 'ar')));
}
