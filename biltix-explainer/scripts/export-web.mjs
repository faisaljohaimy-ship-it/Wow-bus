#!/usr/bin/env node
/**
 * Web exports for biltix-hse/assets/video:
 *   - explainer-<lang>-720p.mp4  H.264 High, yuv420p, +faststart; ≤ 3.3 MiB silent, or ≤ 3.7 MiB with
 *     the AI narration track (CRF is raised step by step until the file fits the budget)
 *   - explainer-<lang>-poster.webp  1280×720 still of a representative frame, < 120 KB
 *   - explainer-<lang>.vtt  rewritten from the same cue list as the manifest
 *   - ../biltix-hse/js/data/explainer-media.js  the app's media manifest (voice: null when silent)
 * Also remuxes a freshly rendered (silent) 1080p master with +faststart (stream copy, no re-encode).
 *
 * Narration: when out/voice/<lang>.json exists (written by scripts/voice-mux.mjs), the same
 * narration is muxed again onto the master with the same code (lib/media.mjs narrateLanguage), so
 * a full rebuild (npm run build) keeps it. Without that record the language stays silent.
 *
 *   node scripts/export-web.mjs [--lang ar|en|both] [--poster-frame 420]
 */
import { execFileSync } from 'node:child_process';
import { copyFileSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { bundle } from '@remotion/bundler';
import { renderStill, selectComposition } from '@remotion/renderer';
import { browserExecutable, chromeMode, ffprobeBin } from './env.mjs';
import { encodeWeb, entryFromDisk, ff, layout, masterFile, narrateLanguage, readVoiceStore, requireBundledFfmpeg, silentSource, vttFile, WEB_BUDGET, WEB_SCALE, webFile, writeManifest } from './lib/media.mjs';
import { ROOT, storyCues, vttText } from './lib/story.mjs';

const arg = (name, def) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : def;
};
const langs = arg('lang', 'both') === 'both' ? ['ar', 'en'] : [arg('lang')];
const POSTER_FRAME = Number(arg('poster-frame', '420')); // risk analysis: portfolio dial, category dials, likelihood × impact matrix
const POSTER_BUDGET = 120 * 1024;
const kb = (f) => `${(statSync(f).size / 1024).toFixed(0)} KB`;
const L = layout();
requireBundledFfmpeg();

let serveUrl = null;
const entries = {};
for (const lang of langs) {
  const master = masterFile(L, lang);
  const narration = readVoiceStore(L, lang);
  const source = silentSource(lang);

  // 1. faststart remux of a fresh (silent) master (moov atom first, streams copied)
  if (source === master) {
    const tmp = `${master}.faststart.tmp`;
    ff(['-i', master, '-map', '0:v:0', '-c', 'copy', '-movflags', '+faststart', '-f', 'mp4', tmp]);
    renameSync(tmp, master);
  } else if (!narration) {
    // The master carries a narration whose record is gone: back to the silent original.
    copyFileSync(source, master);
    console.log(`1080p ${lang}: no out/voice/${lang}.json, master restored from ${basename(source)}`);
  }

  const web = webFile(L, lang);
  if (narration) {
    // 2a. narration: master with audio, 720p with audio, VTT (see voice-mux.mjs)
    const { entry } = narrateLanguage({ lang, input: narration.input, voice: narration.voice, L, opts: narration.options || {}, log: (s) => console.log(s) });
    entries[lang] = entry;
  } else {
    // 2b. silent: 720p web version within budget, VTT from the storyboard
    console.log(`1080p ${lang}: ${master} (${kb(master)})`);
    const { crf } = encodeWeb({ inputs: ['-i', master], filter: `[0:v:0]${WEB_SCALE}[v]`, out: web, budget: WEB_BUDGET.silent });
    console.log(`720p  ${lang}: ${web} (${kb(web)}, crf ${crf})`);
    writeFileSync(vttFile(L, lang), vttText(lang, storyCues(lang)));
    entries[lang] = entryFromDisk(L, lang);
  }
  const probe = execFileSync(ffprobeBin, ['-v', 'error', '-show_entries', 'stream=codec_name,codec_type,width,height,pix_fmt,sample_rate,channels', '-of', 'csv=p=0', web]).toString().trim();
  console.log(`      streams: ${probe.replace(/\n/g, ' | ')}`);

  // 3. poster (WebP straight from the composition, 1280×720)
  serveUrl = serveUrl || (await bundle({ entryPoint: resolve(ROOT, 'src/index.ts') }));
  const composition = await selectComposition({ serveUrl, id: lang === 'ar' ? 'ExplainerAR' : 'ExplainerEN', browserExecutable, chromeMode });
  const poster = resolve(L.web, `explainer-${lang}-poster.webp`);
  // Remotion's WebP stills have no quality knob: take Chrome's default encode, and only if it
  // is over budget re-encode a PNG still with Pillow at a decreasing quality.
  await renderStill({ serveUrl, composition, frame: POSTER_FRAME, output: poster, imageFormat: 'webp', scale: 2 / 3, browserExecutable, chromeMode, overwrite: true });
  if (statSync(poster).size >= POSTER_BUDGET) {
    const png = resolve(ROOT, `out/poster-${lang}.tmp.png`);
    await renderStill({ serveUrl, composition, frame: POSTER_FRAME, output: png, imageFormat: 'png', scale: 2 / 3, browserExecutable, chromeMode, overwrite: true });
    execFileSync('python3', ['-I', '-c', [
      'import sys, os; from PIL import Image',
      'src, dst, budget = sys.argv[1], sys.argv[2], int(sys.argv[3])',
      'im = Image.open(src).convert("RGB")',
      'for q in range(84, 30, -4):',
      '    im.save(dst, "WEBP", quality=q, method=6)',
      '    if os.path.getsize(dst) < budget: break',
    ].join('\n'), png, poster, String(POSTER_BUDGET)]);
  }
  console.log(`poster ${lang}: ${poster} (${kb(poster)})`);
}

// 4. the app's media manifest (languages not exported this run are read back from disk)
const written = writeManifest(L, entries);
console.log(`manifest: ${L.manifest} (${Object.entries(written).map(([l, e]) => `${l} ${e.duration} s, voice ${e.voice ? e.voice.name : 'none'}`).join(' · ')})`);
