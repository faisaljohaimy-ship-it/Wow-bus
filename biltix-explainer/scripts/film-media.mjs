#!/usr/bin/env node
/**
 * Media inventory + derived stills for the film v2 (FilmAR / FilmEN). Run before every render:
 *
 *   node scripts/film-media.mjs
 *
 * - Probes what exists under public/ (the film falls back gracefully for anything missing):
 *     AI b-roll       public/v2/broll/<name>.mp4   (aerial, engineer, ops-room, hardhat, facade-lift, cam360-floor,
 *                                                   offline-basement; optional factory-line, pm-approve,
 *                                                   facade-inspect, qr-scan)
 *     UI recordings   public/v2/ui/<name>-<lang>.mp4 (ui-cockpit, ui-register, ui-treatment, ui-tasks, ui-schedule,
 *                                                   ui-spatial, ui-integrations, ui-phone) — real screens of the app
 *     app captures    public/showcase/<lang>/*.png  (or public/showcase/showcase/<lang>/ — the folder is detected)
 * - Writes the derived stills the film uses: public/v2/film/panorama.jpg (the AI 360° panorama scaled for a
 *   continuous pan) and public/v2/film/site-thumb.jpg (a site-photo thumbnail from the façade b-roll).
 * - Writes src/film/media.json: { broll: {name: seconds}, ui: {"name-lang": {dur, w, h, fps}}, captures: dir }.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PUB = resolve(ROOT, 'public');
const FFMPEG = process.env.FFMPEG || '/usr/bin/ffmpeg';
const FFPROBE = FFMPEG.replace(/ffmpeg$/, 'ffprobe');

const probe = (file) => {
  const r = spawnSync(FFPROBE, ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height,r_frame_rate:format=duration', '-of', 'json', file], { encoding: 'utf8' });
  if (r.status !== 0) return null;
  const j = JSON.parse(r.stdout);
  const s = j.streams?.[0];
  const dur = Number(j.format?.duration);
  if (!s || !(dur > 0.5)) return null;
  const [a, b] = String(s.r_frame_rate || '30/1').split('/').map(Number);
  return { dur: Number(dur.toFixed(3)), w: s.width, h: s.height, fps: Number((a / (b || 1)).toFixed(3)) };
};
const ff = (args) => {
  const r = spawnSync(FFMPEG, ['-hide_banner', '-v', 'error', '-y', ...args], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`ffmpeg ${args.join(' ')}\n${r.stderr}`);
};

const BROLL = ['aerial', 'engineer', 'ops-room', 'hardhat', 'facade-lift', 'cam360-floor', 'offline-basement', 'factory-line', 'pm-approve', 'facade-inspect', 'qr-scan'];
const UI = ['ui-cockpit', 'ui-register', 'ui-treatment', 'ui-tasks', 'ui-schedule', 'ui-spatial', 'ui-integrations', 'ui-phone'];

const broll = {};
for (const n of BROLL) {
  const f = resolve(PUB, `v2/broll/${n}.mp4`);
  const p = existsSync(f) ? probe(f) : null;
  if (p) broll[n] = p.dur;
}
const ui = {};
for (const n of UI)
  for (const lang of ['ar', 'en']) {
    const f = resolve(PUB, `v2/ui/${n}-${lang}.mp4`);
    const p = existsSync(f) ? probe(f) : null;
    if (p) ui[`${n}-${lang}`] = p;
  }
const captures = existsSync(resolve(PUB, 'showcase/ar/cockpit.png')) ? 'showcase' : existsSync(resolve(PUB, 'showcase/showcase/ar/cockpit.png')) ? 'showcase/showcase' : null;
if (!captures) throw new Error('app captures not found under public/showcase — run scripts/showcase-capture.mjs');

// derived stills
mkdirSync(resolve(PUB, 'v2/film'), { recursive: true });
const pano = resolve(PUB, 'v2/panorama-floor.png');
const panoOut = resolve(PUB, 'v2/film/panorama.jpg');
if (existsSync(pano)) ff(['-i', pano, '-vf', 'scale=3168:-2:flags=lanczos', '-q:v', '3', panoOut]);
const thumbSrc = resolve(PUB, 'v2/broll/facade-lift.mp4');
if (existsSync(thumbSrc)) ff(['-ss', '1.2', '-i', thumbSrc, '-frames:v', '1', '-vf', 'crop=760:760:420:200,scale=180:180:flags=lanczos', '-q:v', '3', resolve(PUB, 'v2/film/site-thumb.jpg')]);
// qr-scan: the handheld's screen is a chroma-green plate in the AI clip; key it to a dark device screen
const qrSrc = resolve(PUB, 'v2/broll/qr-scan.mp4');
const qrOut = resolve(PUB, 'v2/film/qr-scan-keyed.mp4');
if (existsSync(qrSrc)) {
  ff(['-i', qrSrc, '-f', 'lavfi', '-i', 'color=c=0x0C2430:s=1920x1080:r=24:d=4', '-filter_complex',
    '[0:v]chromakey=0x00FF00:0.22:0.08,despill=type=green:mix=0.6:expand=0.2[k];[1:v][k]overlay=shortest=1,format=yuv420p[v]',
    '-map', '[v]', '-an', '-c:v', 'libx264', '-crf', '17', '-preset', 'medium', qrOut]);
  if (probe(qrOut)) broll['qr-scan-keyed'] = probe(qrOut).dur;
}
const imgSize = (file) => {
  const r = spawnSync(FFPROBE, ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', file], { encoding: 'utf8' });
  const [w, h] = r.stdout.trim().split(',').map(Number);
  return w && h ? { w, h } : null;
};
const panoProbe = existsSync(panoOut) ? imgSize(panoOut) : null;

const out = { broll, ui, captures, panorama: panoProbe ? { w: panoProbe.w, h: panoProbe.h } : null };
writeFileSync(resolve(ROOT, 'src/film/media.json'), JSON.stringify(out, null, 1) + '\n');
console.log(`b-roll: ${Object.keys(broll).join(', ') || 'none'}`);
console.log(`ui recordings: ${Object.keys(ui).map((k) => `${k} ${ui[k].dur}s ${ui[k].w}x${ui[k].h}`).join(', ') || 'none yet'}`);
console.log(`captures: public/${captures}; panorama: ${panoProbe ? `${panoProbe.w}x${panoProbe.h}` : 'missing'}`);
if (existsSync(resolve(PUB, 'v2/ui'))) console.log(`public/v2/ui: ${readdirSync(resolve(PUB, 'v2/ui')).join(', ')}`);
console.log('→ src/film/media.json');
