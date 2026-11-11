#!/usr/bin/env node
/**
 * Narration prep and timeline for the MVP showcase (ShowcaseAR / ShowcaseEN).
 *
 *   node scripts/showcase-voice.mjs [--lang ar,en]
 *
 * For each language, from public/voice/showcase-<lang>.mp3 (ElevenLabs eleven_multilingual_v2, 13 lines):
 *  1. finds the 13 lines: silencedetect (−40 dB, ≥ 50 ms) and the 12 longest silences between the first and
 *     the last word are the line breaks (they are all ≥ 1.0 s; comma pauses inside a line are < 0.85 s);
 *  2. normalises to −16 LUFS integrated / −1.5 dBTP with loudnorm in two passes (measure, then a linear gain),
 *     resamples to 48 kHz mono, and closes a gate between the lines (from 120 ms after a line to 120 ms before
 *     the next) with 20 ms ramps, so every cut the video makes lands on true zero: no clicks;
 *     → public/voice/showcase-<lang>.norm.wav (derived, gitignored);
 *  3. lays out the scenes: scene i lasts its line + 0.9 s, the line starts 0.35 s into the scene; the first
 *     scene adds a 1.6 s lead-in before its line and the last one holds 2.5 s after it;
 *     → src/showcase/voice-timing.json { <lang>: { duration, lines: [{start, end}], scenes: [...], total } }.
 * Uses the system ffmpeg when present (silencedetect, loudnorm, aeval), else the one shipped with Remotion.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ffmpegBin as remotionFfmpeg } from './env.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const VOICE = resolve(ROOT, 'public/voice');
const OUT_JSON = resolve(ROOT, 'src/showcase/voice-timing.json');
const FFMPEG = process.env.FFMPEG || (existsSync('/usr/bin/ffmpeg') ? '/usr/bin/ffmpeg' : remotionFfmpeg);
const arg = (name, def) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : def;
};
const LANGS = arg('lang', 'ar,en').split(',');

export const LAYOUT = {
  fps: 30,
  lines: 13,
  leadIn: 1.6, // music-only lead-in before line 1
  voiceAt: 0.35, // a line starts this far into its scene
  after: 0.55, // scene continues after its line (0.35 + 0.55 = 0.9 s on top of the line)
  hold: 2.5, // the last scene holds this long after its line
  pad: 0.12, // gate opens / audio clip starts this long before the first word of a line
  ramp: 0.02, // gate ramps
  target: { I: -16, TP: -1.5, LRA: 11 },
};

const run = (args) => {
  const r = spawnSync(FFMPEG, ['-hide_banner', '-nostats', ...args], { encoding: 'utf8', maxBuffer: 64 << 20 });
  if (r.status !== 0) throw new Error(`ffmpeg failed: ${args.join(' ')}\n${r.stderr.slice(-2000)}`);
  return r.stderr;
};
const duration = (file) => {
  const s = run(['-i', file, '-f', 'null', '-']);
  const m = [...s.matchAll(/time=(\d+):(\d+):([\d.]+)/g)].pop();
  return m ? Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) : NaN;
};

/** The 13 spoken lines of a narration file: [{start, end}] in seconds. */
export function findLines(file, n = LAYOUT.lines) {
  const dur = duration(file);
  const log = run(['-i', file, '-af', 'silencedetect=noise=-40dB:d=0.05', '-f', 'null', '-']);
  const sil = [];
  let open = null;
  for (const line of log.split('\n')) {
    const s = line.match(/silence_start: (-?[\d.]+)/);
    const e = line.match(/silence_end: ([\d.]+)/);
    if (s) open = Math.max(0, Number(s[1]));
    if (e && open !== null) { sil.push({ a: open, b: Number(e[1]) }); open = null; }
  }
  if (open !== null) sil.push({ a: open, b: dur });
  const lead = sil.find((x) => x.a <= 0.02);
  const trail = sil.find((x) => x.b >= dur - 0.02);
  const first = lead ? lead.b : 0;
  const last = trail ? trail.a : dur;
  const gaps = sil
    .filter((x) => x !== lead && x !== trail && x.a > first && x.b < last)
    .sort((p, q) => q.b - q.a - (p.b - p.a))
    .slice(0, n - 1)
    .sort((p, q) => p.a - q.a);
  if (gaps.length !== n - 1) throw new Error(`${file}: found ${gaps.length + 1} lines, expected ${n}`);
  const lines = [];
  let start = first;
  for (const g of gaps) { lines.push({ start, end: g.a }); start = g.b; }
  lines.push({ start, end: last });
  const shortestGap = Math.min(...gaps.map((g) => g.b - g.a));
  const inner = sil.filter((x) => x !== lead && x !== trail && !gaps.includes(x)).map((x) => x.b - x.a);
  return { duration: dur, lines, shortestGap, longestInner: inner.length ? Math.max(...inner) : 0 };
}

/** Scene layout in frames for a language's lines. */
export function layout(lines) {
  const { fps, leadIn, voiceAt, after, hold, pad } = LAYOUT;
  const scenes = [];
  let t = 0;
  lines.forEach((ln, i) => {
    const len = ln.end - ln.start;
    const lead = (i === 0 ? leadIn : 0) + voiceAt;
    const tail = i === lines.length - 1 ? hold : after;
    const from = Math.round(t * fps);
    const voiceSec = t + lead; // the first word, on the video's clock
    t += lead + len + tail;
    const to = Math.round(t * fps);
    // audio clip: source from `pad` before the first word (floored to a frame) to `pad` after the last word;
    // both ends lie inside the closed gate (true zero), so frame rounding never cuts a word or clicks
    const trimBefore = Math.max(0, Math.floor((ln.start - pad) * fps));
    const srcFrom = trimBefore / fps;
    scenes.push({
      from,
      frames: to - from,
      voice: {
        from: Math.round(voiceSec * fps), // first word (video frame)
        to: Math.round((voiceSec + len) * fps), // last word
        at: Math.round((voiceSec - (ln.start - srcFrom)) * fps), // where the clip is placed
        trimBefore, // source frames skipped
        frames: Math.ceil((ln.end + pad - srcFrom) * fps), // clip length
      },
    });
  });
  return { scenes, total: Math.round(t * fps) };
}

/** Lag (ms) of b against a, from 10 ms RMS envelopes at 8 kHz, searched over ±250 ms. */
function envelopeLag(a, b) {
  const env = (file) => {
    const r = spawnSync(FFMPEG, ['-v', 'error', '-i', file, '-ac', '1', '-ar', '8000', '-f', 'f32le', '-'], { maxBuffer: 256 << 20 });
    const x = new Float32Array(r.stdout.buffer, r.stdout.byteOffset, Math.floor(r.stdout.length / 4));
    const n = Math.floor(x.length / 80);
    const e = new Float64Array(n);
    for (let i = 0; i < n; i++) { let s = 0; for (let k = 0; k < 80; k++) { const v = x[i * 80 + k]; s += v * v; } e[i] = Math.log10(1e-9 + Math.sqrt(s / 80)); }
    return e;
  };
  const ea = env(a);
  const eb = env(b);
  let best = 0;
  let bestScore = -Infinity;
  for (let l = -25; l <= 25; l++) {
    let s = 0;
    for (let i = 30; i < Math.min(ea.length, eb.length) - 30; i++) s += ea[i] * eb[i + l];
    if (s > bestScore) { bestScore = s; best = l; }
  }
  return best * 10;
}

const timing = existsSync(OUT_JSON) ? JSON.parse(readFileSync(OUT_JSON, 'utf8')) : {};
for (const lang of LANGS) {
  const src = resolve(VOICE, `showcase-${lang}.mp3`);
  const norm = resolve(VOICE, `showcase-${lang}.norm.wav`);
  const found = findLines(src);
  const { lines } = found;
  console.log(`${lang}: ${found.duration.toFixed(2)} s, ${lines.length} lines (${lines.map((l) => (l.end - l.start).toFixed(2)).join(' ')}), shortest break ${found.shortestGap.toFixed(2)} s, longest pause inside a line ${found.longestInner.toFixed(2)} s`);

  // loudness. The takes have a high crest factor (true peak ~23 dB above the integrated loudness; −16 LUFS at
  // −1.5 dBTP allows 14.5 dB), so a single loudnorm would fall back to its dynamic mode. Instead: a gain to
  // about −16 LUFS, a transparent look-ahead limiter at 4× rate (−3.5 dB, latency compensated), then loudnorm
  // two-pass in linear mode (one constant gain) on that, at 48 kHz.
  const { I, TP, LRA } = LAYOUT.target;
  const measure = (file, pre) => {
    const log = run(['-i', file, '-af', `${pre ? pre + ',' : ''}loudnorm=I=${I}:TP=${TP}:LRA=${LRA}:print_format=json`, '-f', 'null', '-']);
    return JSON.parse(log.slice(log.lastIndexOf('{'), log.lastIndexOf('}') + 1));
  };
  const m0 = measure(src);
  // the limiter runs at 192 kHz, so its sample peaks are close to true peaks; the gain is raised by what the
  // limiter took (up to three rounds) until a constant loudnorm gain fits under −1.5 dBTP
  let g = I - Number(m0.input_i);
  let pre = '';
  let mj = null;
  for (let round = 0; round < 3; round++) {
    pre = `volume=${g.toFixed(2)}dB,aresample=192000,alimiter=limit=${Math.pow(10, -3.5 / 20).toFixed(4)}:attack=4:release=90:level=false:latency=true`;
    mj = measure(src, pre);
    if (I - Number(mj.input_i) + Number(mj.input_tp) <= TP - 0.3) break;
    g += I - Number(mj.input_i);
  }
  // gate between lines (and before the first / after the last), 20 ms ramps
  const { pad, ramp } = LAYOUT;
  const closed = [[-1, lines[0].start - pad]];
  for (let i = 0; i < lines.length - 1; i++) closed.push([lines[i].end + pad, lines[i + 1].start - pad]);
  closed.push([lines[lines.length - 1].end + pad, found.duration + 1]);
  const gain = closed.map(([a, b]) => `clip(max((${a.toFixed(4)}-t)/${ramp},(t-${b.toFixed(4)})/${ramp}),0,1)`).join('*');
  const af = [
    pre,
    `loudnorm=I=${I}:TP=${TP}:LRA=${LRA}:measured_I=${mj.input_i}:measured_TP=${mj.input_tp}:measured_LRA=${mj.input_lra}:measured_thresh=${mj.input_thresh}:offset=${mj.target_offset}:linear=true:print_format=json`,
    'aresample=48000',
    `aeval='val(0)*${gain}':c=same`,
  ].join(',');
  const m2 = run(['-y', '-i', src, '-af', af, '-ac', '1', '-ar', '48000', '-c:a', 'pcm_s16le', norm]);
  const out = JSON.parse(m2.slice(m2.lastIndexOf('{'), m2.lastIndexOf('}') + 1));
  // check: integrated loudness and true peak of the written file
  const chk = run(['-i', norm, '-af', 'ebur128=peak=true', '-f', 'null', '-']);
  const LI = Number((chk.match(/I:\s+(-?[\d.]+) LUFS/g) || []).pop()?.match(/-?[\d.]+/)[0]);
  const LP = Number((chk.match(/Peak:\s+(-?[\d.]+) dBFS/g) || []).pop()?.match(/-?[\d.]+/)[0]);
  // alignment check: lag of the normalised file against the source (10 ms envelopes, ±250 ms)
  const lag = envelopeLag(src, norm);
  console.log(`  loudness: input ${m0.input_i} LUFS / ${m0.input_tp} dBTP → ${out.output_i} LUFS / ${out.output_tp} dBTP (${out.normalization_type}); file ${LI} LUFS, true peak ${LP} dBFS; lag vs source ${lag} ms → ${norm}`);
  if (Math.abs(lag) > 10) throw new Error(`${norm} is shifted by ${lag} ms against the source`);
  const lay = layout(lines);
  timing[lang] = {
    source: `voice/showcase-${lang}.mp3`,
    audio: `voice/showcase-${lang}.norm.wav`,
    duration: Number(found.duration.toFixed(3)),
    loudness: { integrated: LI, truePeak: LP, input: Number(m0.input_i), mode: out.normalization_type, lagMs: lag },
    lines: lines.map((l) => ({ start: Number(l.start.toFixed(3)), end: Number(l.end.toFixed(3)) })),
    fps: LAYOUT.fps,
    total: lay.total,
    scenes: lay.scenes,
  };
  console.log(`  timeline: ${lay.total} frames (${(lay.total / LAYOUT.fps).toFixed(2)} s), scenes ${lay.scenes.map((s) => s.frames).join(' ')}`);
}
writeFileSync(OUT_JSON, JSON.stringify(timing, null, 1) + '\n');
console.log(`→ ${OUT_JSON}`);
