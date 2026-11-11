/**
 * Storyboard-derived tables shared by write-captions.mjs, export-web.mjs and voice-mux.mjs, so the
 * WebVTT files, the narration placement and the app's media manifest
 * (biltix-hse/js/data/explainer-media.js) are built from the same cue list.
 *
 * Requires Node ≥ 22.18 (native TypeScript type stripping for storyboard.ts).
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CAPTIONS, captionCues, fillCaption, FPS, SCENES, sceneStart, TOTAL_FRAMES, TRANSITION } from '../../src/storyboard.ts';

export { FPS, TOTAL_FRAMES };
export const LANGS = ['ar', 'en'];
export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

/** The app-relative web files and their size, as the manifest lists them. */
export const WEB = Object.freeze({
  width: 1280,
  height: 720,
  mp4: (lang) => `assets/video/explainer-${lang}-720p.mp4`,
  poster: (lang) => `assets/video/explainer-${lang}-poster.webp`,
  vtt: (lang) => `assets/video/explainer-${lang}.vtt`,
});

/**
 * How the narration speaks `{sources}`. The captions show the digits; the voice reads the
 * number as words. A number missing here means the narration script must be updated first.
 */
export const SPOKEN_NUMBERS = Object.freeze({
  ar: { 13: 'ثلاثةَ عشرَ' },
  en: { 13: 'Thirteen' },
});

export const readData = () => JSON.parse(readFileSync(resolve(ROOT, 'src/data.json'), 'utf8'));

/** Frame → seconds at millisecond precision (the precision of the VTT timestamps). */
export const frameSec = (frame) => Math.round((frame / FPS) * 1000) / 1000;

/** Caption cues in storyboard order: { id, from, to (frames), start, end (s), step, text }. */
export function storyCues(lang, sources = readData().validation.sources) {
  return captionCues().map((cue, i) => ({
    id: cue.id,
    from: cue.from,
    to: cue.to,
    start: frameSec(cue.from),
    end: frameSec(cue.to),
    step: SCENES[i].step,
    text: fillCaption(CAPTIONS[lang][cue.id], { sources }),
  }));
}

/** Scene windows: start (s), end (s), and the dissolve that leads into the scene (0 after a hard cut). */
export function storyScenes() {
  return SCENES.map((s) => {
    const start = sceneStart(s.id) / FPS;
    return { id: s.id, start, end: start + s.frames / FPS, cut: !!s.cut, step: s.step, dissolve: s.cut || start === 0 ? 0 : TRANSITION / FPS };
  });
}

/** The narration script: the captions in order, with `{sources}` as the voice says it. */
export function narrationScript(lang, sources = readData().validation.sources) {
  const spoken = SPOKEN_NUMBERS[lang]?.[sources];
  if (!spoken) throw new Error(`no spoken form of ${sources} for "${lang}" in SPOKEN_NUMBERS (scripts/lib/story.mjs)`);
  return captionCues().map((cue) => ({
    id: cue.id,
    caption: fillCaption(CAPTIONS[lang][cue.id], { sources }),
    spoken: CAPTIONS[lang][cue.id].replace('{sources}', spoken),
  }));
}

const ts = (sec) => {
  const ms = Math.round(sec * 1000);
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  const s = Math.floor((ms % 60_000) / 1000);
  const r = ms % 1000;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(r).padStart(3, '0')}`;
};

/** WebVTT text for a cue list (start/end in seconds). Byte-identical to the original write-captions output. */
export function vttText(lang, cues) {
  const lines = [`WEBVTT - BILTIX Risk AI explainer (${lang === 'ar' ? 'العربية' : 'English'}) — ${lang === 'ar' ? 'بيانات توضيحية' : 'demo data'}`, ''];
  cues.forEach((cue, n) => {
    lines.push(String(n + 1), `${ts(cue.start)} --> ${ts(cue.end)} line:88% align:center`, cue.text, '');
  });
  return lines.join('\n');
}

/** Read back a VTT written by vttText(): [{ start, end, text }]. */
export function parseVtt(text) {
  const sec = (t) => {
    const [h, m, s] = t.split(':');
    return Math.round((Number(h) * 3600 + Number(m) * 60 + Number(s)) * 1000) / 1000;
  };
  const out = [];
  const lines = String(text).split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const m = /^(\d\d:\d\d:\d\d\.\d{3}) --> (\d\d:\d\d:\d\d\.\d{3})/.exec(lines[i]);
    if (!m) continue;
    const body = [];
    for (let j = i + 1; j < lines.length && lines[j].trim() !== ''; j++) body.push(lines[j]);
    out.push({ start: sec(m[1]), end: sec(m[2]), text: body.join('\n') });
  }
  return out;
}

/** Manifest cues from a VTT cue list, with the storyboard's ids and steps. */
export function manifestCues(vttCues) {
  if (vttCues.length !== SCENES.length) throw new Error(`expected ${SCENES.length} cues, found ${vttCues.length}`);
  return vttCues.map((c, i) => ({ id: SCENES[i].id, start: c.start, end: c.end, step: SCENES[i].step, text: c.text }));
}

const str = (s) => `'${String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\r/g, '\\r').replace(/\n/g, '\\n').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029')}'`;
const num = (x) => String(Math.round(Number(x) * 1000) / 1000);

/**
 * The app's media manifest, biltix-hse/js/data/explainer-media.js. `langs` maps 'ar' / 'en' to
 * { duration, voice: null | { name, provider, model }, cues: [{ id, start, end, step, text }] }.
 */
export function formatManifest({ build, langs }) {
  const out = [
    '/** BILTIX explainer media manifest. Generated by biltix-explainer/scripts (export-web.mjs / voice-mux.mjs) — do not edit by hand. */',
    'export const EXPLAINER = Object.freeze({',
    `  build: ${str(build)},`,
    '  langs: {',
  ];
  for (const lang of LANGS) {
    const e = langs[lang];
    if (!e) throw new Error(`manifest entry for "${lang}" missing`);
    const voice = e.voice ? `{ name: ${str(e.voice.name)}, provider: ${str(e.voice.provider)}, model: ${str(e.voice.model)} }` : 'null';
    out.push(
      `    ${lang}: { mp4: ${str(WEB.mp4(lang))}, poster: ${str(WEB.poster(lang))}, vtt: ${str(WEB.vtt(lang))}, width: ${WEB.width}, height: ${WEB.height}, duration: ${num(e.duration)},`,
      `          voice: ${voice},`,
      '          cues: [',
      ...e.cues.map((c) => `            { id: ${str(c.id)}, start: ${num(c.start)}, end: ${num(c.end)}, step: ${c.step == null ? 'null' : c.step}, text: ${str(c.text)} },`),
      '          ] },',
    );
  }
  out.push('  },', '});', 'export default EXPLAINER;', '');
  return out.join('\n');
}
