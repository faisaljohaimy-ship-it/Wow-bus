#!/usr/bin/env node
/**
 * Music under the narration of a rendered MVP showcase, ducked from the voice timeline.
 *
 *   node scripts/showcase-mix.mjs --video out/biltix-mvp-en-1080p.mp4 [--music bed.wav] [--lang en] [--out dir] [--stem]
 *
 * - The music is brought to −16 LUFS (two-pass loudnorm), looped or cut to the video length, and gain-automated
 *   from src/showcase/voice-timing.json: −14 dB while a line is spoken (0.25 s attack before the first word,
 *   0.4 s release after the last), −6 dB between lines; 1.5 s fade-in, 3 s fade-out.
 * - It is summed with the video's narration, and the sum is normalised to −16 LUFS integrated / −1.5 dBTP
 *   (a 4×-rate look-ahead limiter, then loudnorm two-pass in linear mode).
 * - Output: <name>-music.mp4 next to the video (or in --out): the video stream copied, AAC 192 kb/s, +faststart.
 *   Without --music the narration alone gets the same loudness pass → <name>-voice.mp4.
 * - --stem also writes the processed music alone (<name>-music-stem.wav) to check the ducking.
 * Uses the system ffmpeg when present (loudnorm, aeval, alimiter), else the one shipped with Remotion.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ffmpegBin as remotionFfmpeg } from './env.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const FFMPEG = process.env.FFMPEG || (existsSync('/usr/bin/ffmpeg') ? '/usr/bin/ffmpeg' : remotionFfmpeg);
const FFPROBE = FFMPEG.replace(/ffmpeg$/, 'ffprobe');
const arg = (name, def) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? (process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : 'true') : def;
};
const video = arg('video');
if (!video || !existsSync(video)) {
  console.error('usage: node scripts/showcase-mix.mjs --video <rendered.mp4> [--music <file>] [--lang ar|en] [--out <dir>] [--stem]');
  process.exit(2);
}
const music = arg('music', null);
const lang = arg('lang', /-ar[-.]/.test(basename(video)) ? 'ar' : 'en');
const outDir = resolve(arg('out', dirname(video)));
const name = basename(video).replace(/\.mp4$/, '');
const TARGET = { I: -16, TP: -1.5, LRA: 20 };
const DUCK = { under: -14, between: -6, attack: 0.25, release: 0.4, fadeIn: 1.5, fadeOut: 3 };

const run = (args) => {
  const r = spawnSync(FFMPEG, ['-hide_banner', '-nostats', ...args], { encoding: 'utf8', maxBuffer: 64 << 20 });
  if (r.status !== 0) throw new Error(`ffmpeg failed: ${args.join(' ')}\n${r.stderr.slice(-3000)}`);
  return r.stderr;
};
const json = (log) => JSON.parse(log.slice(log.lastIndexOf('{'), log.lastIndexOf('}') + 1));
const duration = Number(spawnSync(FFPROBE, ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', video], { encoding: 'utf8' }).stdout.trim());

const timing = JSON.parse(readFileSync(resolve(ROOT, 'src/showcase/voice-timing.json'), 'utf8'))[lang];
if (!timing) throw new Error(`no timeline for ${lang} in voice-timing.json`);
const fps = timing.fps;
const spans = timing.scenes.map((s) => [s.voice.from / fps, s.voice.to / fps]);
if (Math.abs(timing.total / fps - duration) > 0.2) console.warn(`warning: video is ${duration.toFixed(2)} s, timeline ${(timing.total / fps).toFixed(2)} s`);

/** Duck amount 0..1 at time t: 1 while a line is spoken, with attack/release ramps. */
const duck = spans
  .map(([a, b]) => `clip(min((t-${(a - DUCK.attack).toFixed(3)})/${DUCK.attack},(${(b + DUCK.release).toFixed(3)}-t)/${DUCK.release}),0,1)`)
  .join('+');
const gain = `pow(10,(${DUCK.between}+(${DUCK.under - DUCK.between})*clip(${duck},0,1))/20)`;

/** Two-pass loudness to TARGET for an audio filter graph ending in [x] (pre-limited at 4× rate). */
function loudnessChain(inputs, graph, label) {
  const lim = `aresample=192000,alimiter=limit=${Math.pow(10, -3.5 / 20).toFixed(4)}:attack=4:release=90:level=false:latency=true`;
  const measure = run([...inputs, '-filter_complex', `${graph};[x]${lim},loudnorm=I=${TARGET.I}:TP=${TARGET.TP}:LRA=${TARGET.LRA}:print_format=json[m]`, '-map', '[m]', '-f', 'null', '-']);
  const m = json(measure);
  return {
    graph: `${graph};[x]${lim},loudnorm=I=${TARGET.I}:TP=${TARGET.TP}:LRA=${TARGET.LRA}:measured_I=${m.input_i}:measured_TP=${m.input_tp}:measured_LRA=${m.input_lra}:measured_thresh=${m.input_thresh}:offset=${m.target_offset}:linear=true:print_format=json,aresample=48000[${label}]`,
    measured: m,
  };
}

const inputs = ['-i', video];
let graph;
if (music) {
  if (!existsSync(music)) throw new Error(`music not found: ${music}`);
  // music to −16 LUFS first, so "−14 dB under the voice" is relative to a voice at −16 LUFS
  const mm = json(run(['-i', music, '-af', `loudnorm=I=${TARGET.I}:TP=${TARGET.TP}:LRA=${TARGET.LRA}:print_format=json`, '-f', 'null', '-']));
  const musicGain = (TARGET.I - Number(mm.input_i)).toFixed(2);
  inputs.push('-stream_loop', '-1', '-i', music);
  const bed = `[1:a]aformat=sample_rates=48000:channel_layouts=stereo,atrim=0:${duration.toFixed(3)},asetpts=N/SR/TB,volume=${musicGain}dB,volume='${gain}':eval=frame,afade=t=in:st=0:d=${DUCK.fadeIn},afade=t=out:st=${(duration - DUCK.fadeOut).toFixed(3)}:d=${DUCK.fadeOut}`;
  graph = `${bed}[bed];[0:a]aformat=sample_rates=48000:channel_layouts=stereo[v];[v][bed]amix=inputs=2:normalize=0:duration=first[x]`;
  if (arg('stem', 'false') === 'true') {
    const stem = resolve(outDir, `${name}-music-stem.wav`);
    run(['-y', ...inputs, '-filter_complex', `${bed}[s]`, '-map', '[s]', '-c:a', 'pcm_s16le', stem]);
    console.log(`music stem → ${stem}`);
  }
} else {
  graph = `[0:a]aformat=sample_rates=48000:channel_layouts=stereo[x]`;
}
const { graph: full } = loudnessChain(inputs, graph, 'out');
const out = resolve(outDir, `${name}-${music ? 'music' : 'voice'}.mp4`);
const log = run(['-y', ...inputs, '-filter_complex', full, '-map', '0:v:0', '-map', '[out]', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', '-shortest', out]);
const res = json(log);
const chk = run(['-i', out, '-map', '0:a', '-af', 'ebur128=peak=true', '-f', 'null', '-']);
const LI = (chk.match(/I:\s+(-?[\d.]+) LUFS/g) || []).pop();
const LP = (chk.match(/Peak:\s+(-?[\d.]+) dBFS/g) || []).pop();
console.log(`${out}\n  loudness: ${res.output_i} LUFS / ${res.output_tp} dBTP (${res.normalization_type}); file ${LI}, true ${LP}`);
