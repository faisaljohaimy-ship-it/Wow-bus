#!/usr/bin/env node
/**
 * Mux an AI narration onto the rendered explainer without re-rendering or retiming it.
 *
 * Each narration file reads the 10 caption lines of src/storyboard.ts in order (the `{sources}`
 * number spoken as words) with a pause of about 1.2 s between lines. The script splits the file
 * into its 10 lines at the 9 longest pauses, checks every line against its share of the script,
 * places each line in its scene window (cue start first; earlier start; atempo ≤ 1.08; for the last
 * line, a held last frame), normalises the track to −16 LUFS / ≤ −1.5 dBTP and writes:
 *
 *   out/biltix-explainer-<lang>-1080p.mp4         master with the narration (video stream copied
 *                                                 unless the tail had to be extended)
 *   out/biltix-explainer-<lang>-1080p-silent.mp4  the silent original, kept
 *   out/voice/<lang>.json + <lang>.<ext>          the narration and its labels, for rebuilds (export-web.mjs)
 *   ../biltix-hse/assets/video/explainer-<lang>-720p.mp4   web file with the narration (≤ 3.7 MiB)
 *   ../biltix-hse/assets/video/explainer-<lang>.vtt        cues (unchanged unless the tail was extended)
 *   ../biltix-hse/js/data/explainer-media.js      the app's media manifest (voice labels, duration, cues)
 *
 *   node scripts/voice-mux.mjs --ar narration-ar.mp3 --en narration-en.mp3 \
 *     --ar-voice "Saadoun" --en-voice "Ryan" --provider ElevenLabs --model eleven_multilingual_v2 \
 *     [--out-dir <dir>] [--dry-run]
 *
 * Options: --out-dir writes the same tree under <dir> instead of the real locations; --dry-run
 * prints the report and writes nothing; --min-pause <s> (0.6), --silence-db <dB> (−45),
 * --share-tolerance <×> (1.6), --web-crf <n> (first CRF tried for the 720p file, 24), --keep-temp.
 * Uses only the ffmpeg/ffprobe bundled with Remotion (scripts/env.mjs).
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { layout, narrateLanguage, requireBundledFfmpeg, writeManifest } from './lib/media.mjs';
import { NarrationError } from './lib/narration.mjs';

const HELP = `usage: node scripts/voice-mux.mjs [--ar <file>] [--en <file>] --provider <name> --model <id>
       [--ar-voice <name>] [--en-voice <name>] [--out-dir <dir>] [--dry-run]
       [--min-pause 0.6] [--silence-db -45] [--share-tolerance 1.6] [--web-crf 24] [--keep-temp]`;

function main() {
  // parseArgs rejects "--silence-db -45": glue a negative number to its option.
  const args = process.argv.slice(2).flatMap((t, i, all) => (/^-\d/.test(all[i + 1] || '') && t.startsWith('--') && !t.includes('=') ? [`${t}=${all[i + 1]}`] : /^-\d/.test(t) && all[i - 1]?.startsWith('--') && !all[i - 1].includes('=') ? [] : [t]));
  const { values: a } = parseArgs({
    args,
    options: {
      ar: { type: 'string' },
      en: { type: 'string' },
      'ar-voice': { type: 'string' },
      'en-voice': { type: 'string' },
      provider: { type: 'string' },
      model: { type: 'string' },
      'out-dir': { type: 'string' },
      'dry-run': { type: 'boolean', default: false },
      'min-pause': { type: 'string' },
      'silence-db': { type: 'string' },
      'share-tolerance': { type: 'string' },
      'web-crf': { type: 'string' },
      'keep-temp': { type: 'boolean', default: false },
      help: { type: 'boolean', short: 'h' },
    },
    strict: true,
  });
  if (a.help) {
    console.log(HELP);
    return;
  }
  const langs = ['ar', 'en'].filter((l) => a[l]);
  if (!langs.length) throw new NarrationError(`give --ar and/or --en\n${HELP}`);
  // The manifest tells viewers which voice they hear: no defaults, every label is stated.
  if (!a.provider || !a.model) throw new NarrationError('--provider and --model are required (they label the AI voice in the app)');
  for (const l of langs) if (!a[`${l}-voice`]) throw new NarrationError(`--${l}-voice is required with --${l} (it labels the AI voice in the app)`);

  const num = (k) => {
    if (a[k] == null) return undefined;
    const v = Number(a[k]);
    if (!Number.isFinite(v)) throw new NarrationError(`--${k} must be a number`);
    return v;
  };
  const opts = Object.fromEntries(Object.entries({ minPause: num('min-pause'), silenceDb: num('silence-db'), shareTolerance: num('share-tolerance') }).filter(([, v]) => v !== undefined));
  const L = layout(a['out-dir'] || null);
  requireBundledFfmpeg();

  const entries = {};
  for (const lang of langs) {
    const voice = { name: a[`${lang}-voice`], provider: a.provider, model: a.model };
    const res = narrateLanguage({ lang, input: a[lang], voice, L, dryRun: a['dry-run'], opts, crfStart: num('web-crf') ?? 24, keepTemp: a['keep-temp'] });
    if (!a['dry-run']) {
      entries[lang] = res.entry;
      mkdirSync(L.voice, { recursive: true });
      writeFileSync(join(L.voice, `report-${lang}.txt`), `${res.report.join('\n')}\n`);
    }
    console.log('');
  }
  if (a['dry-run']) return;
  const written = writeManifest(L, entries);
  console.log(`manifest ${L.manifest}`);
  for (const lang of ['ar', 'en']) {
    const e = written[lang];
    console.log(`  ${lang}: duration ${e.duration} s, voice ${e.voice ? `${e.voice.name} · ${e.voice.provider} · ${e.voice.model}` : 'null (silent)'}, last cue ${e.cues[e.cues.length - 1].start}–${e.cues[e.cues.length - 1].end} s`);
  }
}

try {
  main();
} catch (err) {
  console.error(`voice-mux: ${err instanceof NarrationError ? err.message : err.stack || err}`);
  process.exit(1);
}
