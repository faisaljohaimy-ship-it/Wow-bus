#!/usr/bin/env node
/**
 * Narration prep for the BILTIX Risk AI film v2 (FilmAR / FilmEN).
 *
 *   node scripts/film-voice.mjs [--lang ar,en]
 *
 * For each language, from public/v2/voice/<lang>.mp3 (18 narration lines, ~1.4 s pauses between them):
 *  1. finds the 18 lines: silencedetect (−40 dB, ≥ 50 ms); the 17 longest silences between the first and the last
 *     word are the line breaks. Fails loudly unless exactly 17 silences are ≥ 0.9 s (comma pauses are < 0.9 s);
 *  2. English only: if the take is longer than 205 s it is tightened with atempo (at most 1.07);
 *  3. normalises to −16 LUFS integrated / −1.5 dBTP (system ffmpeg loudnorm, two passes, linear mode, after a
 *     transparent 4×-rate look-ahead limiter), 48 kHz mono, and closes a gate between the lines (from 120 ms after
 *     a line to 120 ms before the next, 20 ms ramps) so every cut the video makes lands on true zero;
 *     → public/v2/voice/film-<lang>.wav (derived, gitignored);
 *  4. writes src/film/voice-timing.json { <lang>: { lines: [{start, end, pauses}], duration, tempo, audio, loudness } }
 *     with times on the processed file's clock (pauses = the short silences inside a line, for caption timing).
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const VOICE = resolve(ROOT, 'public/v2/voice');
const OUT_JSON = resolve(ROOT, 'src/film/voice-timing.json');
const FFMPEG = process.env.FFMPEG || '/usr/bin/ffmpeg';
if (!existsSync(FFMPEG)) throw new Error(`system ffmpeg not found at ${FFMPEG} (set FFMPEG)`);
const arg = (name, def) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : def;
};
const LANGS = arg('lang', 'ar,en').split(',');

export const VOICE_CFG = {
  lines: 18,
  minBreak: 0.9, // every line break is at least this long, and no pause inside a line is
  maxTotal: 205, // English is tightened when the take is longer than this (s)
  maxTempo: 1.07,
  pad: 0.12, // the gate opens this long before the first word of a line
  ramp: 0.02,
  innerPause: 0.18, // silences inside a line at least this long are recorded (caption chunk timing)
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

/** Silences of a file: [{a, b}] in seconds. */
function silences(file, dur) {
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
  return sil;
}

/** The 18 spoken lines of a narration file (source clock). */
function findLines(file) {
  const n = VOICE_CFG.lines;
  const dur = duration(file);
  const sil = silences(file, dur);
  const lead = sil.find((x) => x.a <= 0.02);
  const trail = sil.find((x) => x.b >= dur - 0.02);
  const first = lead ? lead.b : 0;
  const last = trail ? trail.a : dur;
  const inner = sil.filter((x) => x !== lead && x !== trail && x.a > first && x.b < last);
  const long = inner.filter((x) => x.b - x.a >= VOICE_CFG.minBreak);
  if (long.length !== n - 1) {
    throw new Error(`${file}: ${long.length} pauses ≥ ${VOICE_CFG.minBreak} s, expected exactly ${n - 1} (lengths: ${long.map((x) => (x.b - x.a).toFixed(2)).join(' ')})`);
  }
  const gaps = [...inner].sort((p, q) => q.b - q.a - (p.b - p.a)).slice(0, n - 1).sort((p, q) => p.a - q.a);
  // the 17 longest silences must be exactly the 17 that are ≥ 0.9 s
  if (gaps.some((g) => !long.includes(g))) throw new Error(`${file}: the 17 longest silences are not the 17 breaks ≥ ${VOICE_CFG.minBreak} s`);
  const lines = [];
  let start = first;
  for (const g of gaps) { lines.push({ start, end: g.a }); start = g.b; }
  lines.push({ start, end: last });
  for (const l of lines) {
    l.pauses = inner.filter((x) => !gaps.includes(x) && x.a > l.start && x.b < l.end && x.b - x.a >= VOICE_CFG.innerPause).map((x) => [x.a, x.b]);
  }
  const shortestBreak = Math.min(...gaps.map((g) => g.b - g.a));
  const rest = inner.filter((x) => !gaps.includes(x)).map((x) => x.b - x.a);
  return { duration: dur, lines, shortestBreak, longestInner: rest.length ? Math.max(...rest) : 0 };
}

const timing = existsSync(OUT_JSON) ? JSON.parse(readFileSync(OUT_JSON, 'utf8')) : {};
for (const lang of LANGS) {
  const src = resolve(VOICE, `${lang}.mp3`);
  const out = resolve(VOICE, `film-${lang}.wav`);
  const found = findLines(src);
  const tempo = lang === 'en' && found.duration > VOICE_CFG.maxTotal ? Math.min(VOICE_CFG.maxTempo, found.duration / VOICE_CFG.maxTotal) : 1;
  const k = 1 / tempo; // source time → processed time
  console.log(
    `${lang}: ${found.duration.toFixed(2)} s, ${found.lines.length} lines (${found.lines.map((l) => (l.end - l.start).toFixed(2)).join(' ')}); ` +
      `shortest break ${found.shortestBreak.toFixed(2)} s, longest pause inside a line ${found.longestInner.toFixed(2)} s; tempo ${tempo.toFixed(4)}`,
  );
  const lines = found.lines.map((l) => ({ start: l.start * k, end: l.end * k, pauses: l.pauses.map(([a, b]) => [a * k, b * k]) }));
  const dur = found.duration * k;

  // loudness: gain to about −16 LUFS, a 4×-rate look-ahead limiter (−3.5 dB, latency compensated), then loudnorm
  // two-pass in linear mode (one constant gain). The gain is raised by what the limiter took (up to three rounds).
  const { I, TP, LRA } = VOICE_CFG.target;
  const tempoF = tempo !== 1 ? `atempo=${tempo.toFixed(5)},` : '';
  const measure = (pre) => {
    const log = run(['-i', src, '-af', `${tempoF}${pre ? pre + ',' : ''}loudnorm=I=${I}:TP=${TP}:LRA=${LRA}:print_format=json`, '-f', 'null', '-']);
    return JSON.parse(log.slice(log.lastIndexOf('{'), log.lastIndexOf('}') + 1));
  };
  const m0 = measure('');
  let g = I - Number(m0.input_i);
  let pre = '';
  let mj = null;
  for (let round = 0; round < 3; round++) {
    pre = `volume=${g.toFixed(2)}dB,aresample=192000,alimiter=limit=${Math.pow(10, -3.5 / 20).toFixed(4)}:attack=4:release=90:level=false:latency=true`;
    mj = measure(pre);
    if (I - Number(mj.input_i) + Number(mj.input_tp) <= TP - 0.3) break;
    g += I - Number(mj.input_i);
  }
  const { pad, ramp } = VOICE_CFG;
  const closed = [[-1, lines[0].start - pad]];
  for (let i = 0; i < lines.length - 1; i++) closed.push([lines[i].end + pad, lines[i + 1].start - pad]);
  closed.push([lines[lines.length - 1].end + pad, dur + 1]);
  const gain = closed.map(([a, b]) => `clip(max((${a.toFixed(4)}-t)/${ramp},(t-${b.toFixed(4)})/${ramp}),0,1)`).join('*');
  const af = [
    `${tempoF}${pre}`,
    `loudnorm=I=${I}:TP=${TP}:LRA=${LRA}:measured_I=${mj.input_i}:measured_TP=${mj.input_tp}:measured_LRA=${mj.input_lra}:measured_thresh=${mj.input_thresh}:offset=${mj.target_offset}:linear=true:print_format=json`,
    'aresample=48000',
    `aeval='val(0)*${gain}':c=same`,
  ].join(',');
  const log = run(['-y', '-i', src, '-af', af, '-ac', '1', '-ar', '48000', '-c:a', 'pcm_s16le', out]);
  const res = JSON.parse(log.slice(log.lastIndexOf('{'), log.lastIndexOf('}') + 1));
  const chk = run(['-i', out, '-af', 'ebur128=peak=true', '-f', 'null', '-']);
  const LI = Number((chk.match(/I:\s+(-?[\d.]+) LUFS/g) || []).pop()?.match(/-?[\d.]+/)[0]);
  const LP = Number((chk.match(/Peak:\s+(-?[\d.]+) dBFS/g) || []).pop()?.match(/-?[\d.]+/)[0]);
  // the processed file must still break into the same 18 lines at the same places: each break starts between
  // 150 ms before the last word's end (quiet tails fall under −40 dB) and the gate (end + pad), and ends between the
  // gate and 150 ms after the next first word
  const outDur = duration(out);
  const check = silences(out, outDur).filter((x) => x.b - x.a >= VOICE_CFG.minBreak && x.a > 0.05 && x.b < outDur - 0.05);
  const off = (v, lo, hi) => (v < lo ? lo - v : v > hi ? v - hi : 0);
  const drift = check.length ? Math.max(...check.map((x, i) => Math.max(off(x.a, lines[i].end - 0.15, lines[i].end + pad + 0.02), off(x.b, lines[i + 1].start - pad - 0.02, lines[i + 1].start + 0.15)))) : 9;
  if (check.length !== VOICE_CFG.lines - 1 || drift > 0.001) throw new Error(`${out}: ${check.length} breaks after processing, off by ${drift.toFixed(3)} s`);
  console.log(`  loudness ${m0.input_i} LUFS / ${m0.input_tp} dBTP → file ${LI} LUFS, true peak ${LP} dBFS (${res.normalization_type}); ${outDur.toFixed(2)} s; breaks re-found, drift ${(drift * 1000).toFixed(0)} ms → ${out}`);
  const r3 = (x) => Number(x.toFixed(3));
  timing[lang] = {
    source: `v2/voice/${lang}.mp3`,
    audio: `v2/voice/film-${lang}.wav`,
    duration: r3(outDur),
    tempo: r3(tempo),
    loudness: { integrated: LI, truePeak: LP, input: Number(m0.input_i) },
    lines: lines.map((l) => ({ start: r3(l.start), end: r3(l.end), pauses: l.pauses.map(([a, b]) => [r3(a), r3(b)]) })),
  };
}
writeFileSync(OUT_JSON, JSON.stringify(timing, null, 1) + '\n');
console.log(`→ ${OUT_JSON}`);
