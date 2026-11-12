#!/usr/bin/env node
/**
 * Synthetic stand-in for a narration file, to exercise scripts/voice-mux.mjs end to end without
 * the real AI voice: 10 speech-like bursts (voiced harmonics with syllable envelopes, intonation
 * and noisy onsets), 1.2 s pauses between them, 0.3 s lead and trail, a −70 dBFS noise floor,
 * and a 0.25 s comma gap inside lines 2 and 5. It is a test signal, not speech.
 *
 *   node tests/synth-narration.mjs --out narration-en.mp3 --lines 1.9,3.0,2.9,2.5,3.1,3.35,2.1,3.4,2.5,3.4
 *     [--seed 1] [--f0 110] [--peak -1] [--plosives]
 *
 * .mp3 output goes through the bundled ffmpeg (44.1 kHz mono, 128 kb/s, like the provider's
 * files); any other extension is written as a 32-bit float WAV.
 */
import { spawnSync } from 'node:child_process';
import { rmSync, writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { ffmpegBin } from '../scripts/env.mjs';
import { encodeWavFloat } from '../scripts/lib/narration.mjs';

const SR = 44100;

function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return (s >>> 0) / 4294967296;
  };
}

/** One speech-like burst of `dur` seconds; `gaps` = [{at, len}] near-silent gaps inside it (commas). */
function burst(dur, rand, { f0 = 110, plosives = false, gaps = [] } = {}) {
  const n = Math.round(dur * SR);
  const out = new Float32Array(n);
  // Syllables of 0.14–0.30 s with short dips, a longer dip at word ends; stress varies.
  const env = new Float32Array(n);
  let t = 0;
  let syl = 0;
  while (t < dur - 0.08) {
    const len = Math.min(0.14 + rand() * 0.16, dur - t);
    const amp = 0.55 + rand() * 0.45;
    const a = Math.round(t * SR);
    const b = Math.round((t + len) * SR);
    for (let i = a; i < b && i < n; i++) {
      const x = (i - a) / (b - a);
      const shape = x < 0.25 ? 0.5 - 0.5 * Math.cos((Math.PI * x) / 0.25) : x > 0.65 ? 0.5 + 0.5 * Math.cos((Math.PI * (x - 0.65)) / 0.35) : 1;
      env[i] = Math.max(env[i], amp * shape);
    }
    syl += 1;
    t += len + (syl % 3 === 0 ? 0.06 + rand() * 0.05 : 0.015 + rand() * 0.03);
  }
  // Voiced carrier: 24 harmonics, two formant bumps, slow intonation and a falling line.
  const harm = Array.from({ length: 24 }, (_, k) => {
    const f = k + 1;
    const formant = Math.exp(-(((f * f0 - 600) / 250) ** 2)) * 1.0 + Math.exp(-(((f * f0 - 1700) / 400) ** 2)) * 0.5;
    return { amp: (1 / f ** 0.9) * (0.3 + formant), phase: rand() * Math.PI * 2 };
  });
  let phase = 0;
  let lp = 0;
  for (let i = 0; i < n; i++) {
    const tt = i / SR;
    const pitch = f0 * (1 + 0.07 * Math.sin(2 * Math.PI * 0.8 * tt + 1) - 0.1 * (tt / dur));
    phase += (2 * Math.PI * pitch) / SR;
    let v = 0;
    for (let k = 0; k < harm.length; k++) v += harm[k].amp * Math.sin((k + 1) * phase + harm[k].phase);
    // A little breath noise, high-passed.
    const w = rand() * 2 - 1;
    const hp = w - lp;
    lp = lp * 0.6 + w * 0.4;
    out[i] = (v * 0.35 + hp * 0.04) * env[i];
  }
  // Noisy onsets on a third of the syllables (fricatives), and optional plosive clicks.
  for (let s = 0; s < syl; s += 3) {
    const at = Math.round(((s / syl) * dur) * SR);
    const len = Math.round((0.03 + rand() * 0.03) * SR);
    for (let i = 0; i < len && at + i < n; i++) out[at + i] += (rand() * 2 - 1) * 0.12 * Math.sin((Math.PI * i) / len);
    if (plosives && rand() < 0.5) {
      const c = Math.round(0.004 * SR);
      for (let i = 0; i < c && at + i < n; i++) out[at + i] += (i % 2 ? -1 : 1) * 0.9 * Math.sin((Math.PI * i) / c);
    }
  }
  for (const g of gaps) {
    const a = Math.round(g.at * SR);
    const b = Math.min(n, Math.round((g.at + g.len) * SR));
    for (let i = a; i < b; i++) out[i] = 0;
  }
  return out;
}

function main() {
  const args = process.argv.slice(2).flatMap((t, i, all) => (/^-\d/.test(all[i + 1] || '') && t.startsWith('--') && !t.includes('=') ? [`${t}=${all[i + 1]}`] : /^-\d/.test(t) && all[i - 1]?.startsWith('--') && !all[i - 1].includes('=') ? [] : [t]));
  const { values: a } = parseArgs({
    args,
    options: {
      out: { type: 'string' },
      lines: { type: 'string' },
      seed: { type: 'string', default: '1' },
      f0: { type: 'string', default: '110' },
      peak: { type: 'string', default: '-1' },
      plosives: { type: 'boolean', default: false },
      pause: { type: 'string', default: '1.2' },
    },
  });
  if (!a.out || !a.lines) throw new Error('usage: node tests/synth-narration.mjs --out <file> --lines d1,…,d10 [--seed n] [--f0 Hz] [--peak dBFS] [--plosives]');
  const durs = a.lines.split(',').map(Number);
  const rand = rng(Number(a.seed));
  const pause = Number(a.pause);
  const lead = 0.3;
  const total = lead * 2 + durs.reduce((x, y) => x + y, 0) + pause * (durs.length - 1);
  const mix = new Float32Array(Math.round(total * SR));
  let t = lead;
  durs.forEach((d, i) => {
    const gaps = i === 1 || i === 4 ? [{ at: d * 0.45, len: 0.25 }] : [];
    const b = burst(d, rand, { f0: Number(a.f0), plosives: a.plosives, gaps });
    mix.set(b, Math.round(t * SR));
    t += d + pause;
  });
  let peak = 0;
  for (const v of mix) peak = Math.max(peak, Math.abs(v));
  const g = 10 ** (Number(a.peak) / 20) / peak;
  for (let i = 0; i < mix.length; i++) mix[i] = mix[i] * g + (rand() * 2 - 1) * 10 ** (-70 / 20);
  const wav = encodeWavFloat(mix, SR);
  if (a.out.endsWith('.mp3')) {
    const tmp = `${a.out}.tmp.wav`;
    writeFileSync(tmp, wav);
    const r = spawnSync(ffmpegBin, ['-hide_banner', '-v', 'error', '-y', '-i', tmp, '-c:a', 'libmp3lame', '-b:a', '128k', '-ar', String(SR), '-ac', '1', a.out], { encoding: 'utf8' });
    rmSync(tmp, { force: true });
    if (r.status !== 0) throw new Error(r.stderr);
  } else writeFileSync(a.out, wav);
  console.log(`synth-narration: ${a.out} (${total.toFixed(2)} s; lines ${durs.join(' ')} s; ${pause} s pauses)`);
}

main();
