#!/usr/bin/env node
/**
 * Music under the narration of a rendered film v2 (FilmAR / FilmEN), ducked from the voice timeline.
 *
 *   node scripts/film-mix.mjs --video <film-ar-1080p.mp4> --out <BILTIX-Film-Arabic.mp4> [--lang ar] [--music public/v2/score-180.mp3]
 *                             [--max-mb 70] [--stem]
 *
 * - Music (AI score, Lyria 3 Pro via Higgsfield) is brought to −16 LUFS. When the film is longer than the score, the
 *   score is extended by repeating a calm stretch of its middle (the quietest window of the middle third) with two
 *   3 s equal-power crossfades — never a hard loop.
 * - Gain automation from src/film/voice-timing.json (scripts/lib/film-timeline.mjs): −15 dB while a line is spoken
 *   (0.3 s attack before the first word, 0.45 s release after the last), −7 dB between lines, −4 dB before the
 *   first line and after the last; 1 s fade-in, 3.5 s fade-out to the end.
 * - Summed with the film's narration, normalised to −16 LUFS integrated / −1.5 dBTP (a 4×-rate look-ahead limiter,
 *   then loudnorm two-pass in linear mode). Video stream copied, AAC 192 kb/s, +faststart.
 * - If the result is larger than --max-mb, the video is re-encoded (x264 CRF 22) to fit.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, statSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { filmTimeline } from './lib/film-timeline.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const FFMPEG = process.env.FFMPEG || '/usr/bin/ffmpeg';
const FFPROBE = FFMPEG.replace(/ffmpeg$/, 'ffprobe');
const arg = (name, def) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? (process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : 'true') : def;
};
const video = arg('video');
if (!video || !existsSync(video)) {
  console.error('usage: node scripts/film-mix.mjs --video <film.mp4> --out <final.mp4> [--lang ar|en] [--music file] [--max-mb 70]');
  process.exit(2);
}
const lang = arg('lang', /-ar[-.]/.test(basename(video)) ? 'ar' : 'en');
const music = resolve(arg('music', resolve(ROOT, 'public/v2/score-180.mp3')));
const out = resolve(arg('out', video.replace(/\.mp4$/, '-mix.mp4')));
const maxMB = Number(arg('max-mb', '70'));
const TARGET = { I: -16, TP: -1.5, LRA: 20 };
const DUCK = { under: -15, between: -7, edge: -4, attack: 0.3, release: 0.45, fadeIn: 1.0, fadeOut: 3.5, xf: 3 };

const run = (args) => {
  const r = spawnSync(FFMPEG, ['-hide_banner', '-nostats', ...args], { encoding: 'utf8', maxBuffer: 256 << 20 });
  if (r.status !== 0) throw new Error(`ffmpeg failed: ${args.join(' ')}\n${r.stderr.slice(-3000)}`);
  return r.stderr;
};
const json = (log) => JSON.parse(log.slice(log.lastIndexOf('{'), log.lastIndexOf('}') + 1));
const probeDur = (f) => Number(spawnSync(FFPROBE, ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f], { encoding: 'utf8' }).stdout.trim());

const D = probeDur(video);
const M = probeDur(music);
const tl = filmTimeline(lang);
if (Math.abs(tl.seconds - D) > 0.2) console.warn(`warning: video ${D.toFixed(2)} s, timeline ${tl.seconds.toFixed(2)} s`);
const spans = tl.scenes.map((s) => s.voice);

// 1) extension: the score's resolution must land on the film's end. musicalEnd = the last moment the score is within
//    22 dB of its loudest stretch; the calm stretch repeated is the quietest window of the middle third.
const env = (() => {
  const r = spawnSync(FFMPEG, ['-v', 'error', '-i', music, '-ac', '1', '-ar', '2000', '-f', 'f32le', '-'], { maxBuffer: 256 << 20 });
  const buf = r.stdout;
  return new Float32Array(buf.buffer, buf.byteOffset, Math.floor(buf.length / 4));
})();
const SR = 2000;
const rmsDb = (t0, t1) => {
  const i0 = Math.max(0, Math.floor(t0 * SR));
  const i1 = Math.min(env.length, Math.floor(t1 * SR));
  let e = 0;
  for (let i = i0; i < i1; i++) e += env[i] * env[i];
  return 10 * Math.log10(e / Math.max(1, i1 - i0) + 1e-12);
};
let loudest = -120;
for (let t = 0; t < M - 2; t += 0.5) loudest = Math.max(loudest, rmsDb(t, t + 2));
let musicalEnd = M;
for (let t = M - 2; t > 0; t -= 0.25) if (rmsDb(t, t + 1) > loudest - 22) { musicalEnd = t + 1; break; }
const X = Math.max(0, D - M + 1.0, D - 1.0 - musicalEnd);
let p = 0;
if (X > 0) {
  const win = X + 2 * DUCK.xf + 1;
  let best = Infinity;
  const lo = M * 0.33;
  const hi = Math.max(lo + 0.25, M * 0.7 - win);
  for (let t = lo; t < hi; t += 0.25) {
    const e = rmsDb(t, t + win);
    if (e < best) { best = e; p = t; }
  }
  console.log(`score ${M.toFixed(2)} s (musical end ${musicalEnd.toFixed(2)} s), film ${D.toFixed(2)} s: repeating ${X.toFixed(2)} s of the calm stretch at ${p.toFixed(2)} s (${best.toFixed(1)} dB)`);
}

// 2) music gain: loudness to −16 LUFS, then the ducking curve
const mm = json(run(['-i', music, '-af', `loudnorm=I=${TARGET.I}:TP=${TARGET.TP}:LRA=${TARGET.LRA}:print_format=json`, '-f', 'null', '-']));
const musicGain = (TARGET.I - Number(mm.input_i)).toFixed(2);
const duck = spans.map(([a, b]) => `clip(min((t-${(a - DUCK.attack).toFixed(3)})/${DUCK.attack},(${(b + DUCK.release).toFixed(3)}-t)/${DUCK.release}),0,1)`).join('+');
const first = spans[0][0];
const lastEnd = spans[spans.length - 1][1];
// between lines −7; before the first word and after the last word −4 (eased over 1 s)
const edge = `clip(max((${(first - DUCK.attack - 1).toFixed(3)}-t)/1,(t-${(lastEnd + DUCK.release).toFixed(3)})/1),0,1)`;
const base = `(${DUCK.between}+(${DUCK.edge - DUCK.between})*${edge})`;
const gain = `pow(10,(${base}+(${DUCK.under}-${base})*clip(${duck},0,1))/20)`;

const ext =
  X > 0
    ? `[1:a]aformat=sample_rates=48000:channel_layouts=stereo,asplit=2[m1][m2];[m1]atrim=0:${(p + X + DUCK.xf).toFixed(3)},asetpts=N/SR/TB[ma];[m2]atrim=${p.toFixed(3)},asetpts=N/SR/TB[mb];[ma][mb]acrossfade=d=${DUCK.xf}:c1=qsin:c2=qsin[mx];[mx]`
    : `[1:a]aformat=sample_rates=48000:channel_layouts=stereo[mx];[mx]`;
const bed = `${ext}atrim=0:${D.toFixed(3)},asetpts=N/SR/TB,volume=${musicGain}dB,volume='${gain}':eval=frame,afade=t=in:st=0:d=${DUCK.fadeIn},afade=t=out:st=${(D - DUCK.fadeOut).toFixed(3)}:d=${DUCK.fadeOut}`;
const graph = `${bed}[bed];[0:a]aformat=sample_rates=48000:channel_layouts=stereo[v];[v][bed]amix=inputs=2:normalize=0:duration=first[x]`;
const inputs = ['-i', video, '-i', music];
if (arg('stem', 'false') === 'true') {
  const stem = out.replace(/\.mp4$/, '-music-stem.wav');
  run(['-y', ...inputs, '-filter_complex', `${bed}[s]`, '-map', '[s]', '-c:a', 'pcm_s16le', stem]);
  console.log(`music stem → ${stem}`);
}

// 3) sum → limiter → loudnorm (two-pass, linear)
const lim = `aresample=192000,alimiter=limit=${Math.pow(10, -3.5 / 20).toFixed(4)}:attack=4:release=90:level=false:latency=true`;
const m = json(run([...inputs, '-filter_complex', `${graph};[x]${lim},loudnorm=I=${TARGET.I}:TP=${TARGET.TP}:LRA=${TARGET.LRA}:print_format=json[m]`, '-map', '[m]', '-f', 'null', '-']));
const full = `${graph};[x]${lim},loudnorm=I=${TARGET.I}:TP=${TARGET.TP}:LRA=${TARGET.LRA}:measured_I=${m.input_i}:measured_TP=${m.input_tp}:measured_LRA=${m.input_lra}:measured_thresh=${m.input_thresh}:offset=${m.target_offset}:linear=true:print_format=json,aresample=48000[out]`;
const t0 = Date.now();
const log = run(['-y', ...inputs, '-filter_complex', full, '-map', '0:v:0', '-map', '[out]', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', '-shortest', out]);
const res = json(log);
let mb = statSync(out).size / 1e6;
if (mb > maxMB) {
  console.log(`${mb.toFixed(1)} MB > ${maxMB} MB: re-encoding the video at CRF 22`);
  const tmp = out.replace(/\.mp4$/, '.crf22.mp4');
  run(['-y', '-i', out, '-map', '0', '-c:v', 'libx264', '-preset', 'slow', '-crf', '22', '-pix_fmt', 'yuv420p', '-c:a', 'copy', '-movflags', '+faststart', tmp]);
  spawnSync('mv', [tmp, out]);
  mb = statSync(out).size / 1e6;
}
const chk = run(['-i', out, '-map', '0:a', '-af', 'ebur128=peak=true', '-f', 'null', '-']);
const LI = (chk.match(/I:\s+(-?[\d.]+) LUFS/g) || []).pop();
const LP = (chk.match(/Peak:\s+(-?[\d.]+) dBFS/g) || []).pop();
console.log(`${out}\n  ${probeDur(out).toFixed(2)} s, ${mb.toFixed(1)} MB; loudness ${res.output_i} LUFS / ${res.output_tp} dBTP (${res.normalization_type}); file ${LI}, true ${LP} (${((Date.now() - t0) / 1000).toFixed(0)} s)`);
