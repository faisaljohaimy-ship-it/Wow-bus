#!/usr/bin/env node
/**
 * Web exports for biltix-hse/assets/video:
 *   - explainer-<lang>-720p.mp4  H.264 High, yuv420p, +faststart, no audio, ≤ 3.5 MB
 *     (CRF is raised step by step until the file fits the budget)
 *   - explainer-<lang>-poster.webp  1280×720 still of a representative frame, < 120 KB
 * Also remuxes the 1080p masters with +faststart (stream copy, no re-encode).
 *
 *   node scripts/export-web.mjs [--lang ar|en|both] [--poster-frame 505]
 */
import { execFileSync } from 'node:child_process';
import { existsSync, renameSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { bundle } from '@remotion/bundler';
import { renderStill, selectComposition } from '@remotion/renderer';
import { browserExecutable, chromeMode, ffmpegBin, ffprobeBin } from './env.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const WEB = resolve(ROOT, '../biltix-hse/assets/video');
const arg = (name, def) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : def;
};
const langs = arg('lang', 'both') === 'both' ? ['ar', 'en'] : [arg('lang')];
const POSTER_FRAME = Number(arg('poster-frame', '505')); // risk analysis: gauge + likelihood × impact matrix
const MP4_BUDGET = 3.5 * 1024 * 1024;
const POSTER_BUDGET = 120 * 1024;
const kb = (f) => `${(statSync(f).size / 1024).toFixed(0)} KB`;
const ff = (args) => execFileSync(ffmpegBin, ['-hide_banner', '-v', 'error', '-y', ...args], { stdio: 'inherit' });

let serveUrl = null;
for (const lang of langs) {
  const master = resolve(ROOT, `out/biltix-explainer-${lang}-1080p.mp4`);
  if (!existsSync(master)) throw new Error(`missing ${master} — run npm run render:${lang} first`);

  // 1. faststart remux of the 1080p master (moov atom first, streams copied)
  const tmp = `${master}.faststart.tmp`;
  ff(['-i', master, '-map', '0:v:0', '-c', 'copy', '-movflags', '+faststart', '-f', 'mp4', tmp]);
  renameSync(tmp, master);
  console.log(`1080p ${lang}: ${master} (${kb(master)})`);

  // 2. 720p web version within budget
  const web = resolve(WEB, `explainer-${lang}-720p.mp4`);
  for (let crf = 23; crf <= 34; crf += 1) {
    ff([
      '-i', master, '-map', '0:v:0', '-an',
      '-vf', 'scale=1280:720:flags=lanczos',
      '-c:v', 'libx264', '-preset', 'slow', '-crf', String(crf), '-tune', 'animation',
      '-profile:v', 'high', '-level', '4.0', '-pix_fmt', 'yuv420p',
      '-movflags', '+faststart', '-f', 'mp4', web,
    ]);
    if (statSync(web).size <= MP4_BUDGET) {
      console.log(`720p  ${lang}: ${web} (${kb(web)}, crf ${crf})`);
      break;
    }
  }
  const probe = execFileSync(ffprobeBin, ['-v', 'error', '-show_entries', 'stream=codec_name,codec_type,width,height,pix_fmt', '-of', 'csv=p=0', web]).toString().trim();
  console.log(`      streams: ${probe.replace(/\n/g, ' | ')}`);

  // 3. poster (WebP straight from the composition, 1280×720)
  serveUrl = serveUrl || (await bundle({ entryPoint: resolve(ROOT, 'src/index.ts') }));
  const composition = await selectComposition({ serveUrl, id: lang === 'ar' ? 'ExplainerAR' : 'ExplainerEN', browserExecutable, chromeMode });
  const poster = resolve(WEB, `explainer-${lang}-poster.webp`);
  for (let q = 82; q >= 40; q -= 6) {
    await renderStill({ serveUrl, composition, frame: POSTER_FRAME, output: poster, imageFormat: 'webp', jpegQuality: q, scale: 2 / 3, browserExecutable, chromeMode, overwrite: true });
    if (statSync(poster).size < POSTER_BUDGET) break;
  }
  console.log(`poster ${lang}: ${poster} (${kb(poster)})`);
}
