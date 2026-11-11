/**
 * Pure helpers for the AI narration pipeline (scripts/voice-mux.mjs): no file system, no
 * ffmpeg, no storyboard import. Everything here is unit-tested in tests/narration.test.mjs.
 *
 *   parseSilences   ffmpeg silencedetect log → silences
 *   splitLines      silences → exactly N spoken lines (the N−1 longest pauses ≥ minPause)
 *   checkShares     each line's length vs its share of the script by letter count
 *   planPlacement   lines → start / tempo per scene window, plus a tail extension if needed
 *   fadeEdges, placeSegment, limitTruePeak, interSamplePeaks   sample-level helpers
 *   decodeWav, encodeWavFloat   minimal RIFF/WAVE reader and writer
 */

export const SAMPLE_RATE = 48000;

export const DEFAULTS = Object.freeze({
  /** silencedetect threshold (dBFS) and the shortest silence it reports (s). */
  silenceDb: -45,
  detectPause: 0.2,
  /** A line break is a silence of at least this length (s). The script uses 1.2 s breaks. */
  minPause: 0.6,
  /** Each line's length must be within ×/÷ this factor of its letter-count share. */
  shareTolerance: 1.6,
  /** A line ends at least this long before the next cue starts (s). */
  gapBeforeNextCue: 0.12,
  /** A line never starts within this of the previous line's end (s). */
  gapAfterPrev: 0.15,
  /** Largest speed-up applied with atempo. */
  maxTempo: 1.08,
  /** Picture kept after the last word (s); the video tail is extended to keep it. */
  tailPad: 0.4,
  /** Audio kept before each line's detected onset and after its offset (s). */
  preRoll: 0.04,
  postRoll: 0.08,
  /** Raised-cosine fades at each line's edges (s), within the 15–30 ms brief. */
  fadeIn: 0.02,
  fadeOut: 0.03,
  /** Loudness: integrated target (LUFS), true-peak ceiling (dBTP), headroom kept for the AAC encode (dB). */
  targetI: -16,
  targetTP: -1.5,
  codecMargin: 0.5,
  loudnessRange: 20,
});

export class NarrationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'NarrationError';
  }
}

const EPS = 1e-6;
export const round3 = (x) => Math.round(x * 1000) / 1000;
export const fmt = (x, d = 3) => (x == null || Number.isNaN(x) ? '–' : Number(x).toFixed(d));
export const signed = (x, d = 3) => (x == null ? '–' : `${x >= 0 ? '+' : '−'}${Math.abs(x).toFixed(d)}`);

/* ------------------------------------------------------------------ silences and lines */

/**
 * Parse ffmpeg's silencedetect log. A silence still open at the end of the file (no
 * silence_end) runs to `duration`. Times are clamped to [0, duration].
 * @returns {Array<{start:number,end:number,dur:number}>}
 */
export function parseSilences(log, duration) {
  const out = [];
  let open = null;
  for (const line of String(log).split(/\r?\n/)) {
    const s = /silence_start:\s*(-?[\d.]+(?:e-?\d+)?)/.exec(line);
    if (s) {
      open = Math.max(0, Number(s[1]));
      continue;
    }
    const e = /silence_end:\s*(-?[\d.]+(?:e-?\d+)?)/.exec(line);
    if (e && open != null) {
      const end = Math.min(duration, Number(e[1]));
      out.push({ start: open, end, dur: end - open });
      open = null;
    }
  }
  if (open != null && open < duration) out.push({ start: open, end: duration, dur: duration - open });
  return out;
}

/**
 * First and last sample above `thresholdDb` (dBFS), in seconds: where the speech starts and ends
 * even when the lead or trail silence is shorter than silencedetect's minimum.
 */
export function soundBounds(x, sr, thresholdDb = DEFAULTS.silenceDb) {
  const t = 10 ** (thresholdDb / 20);
  let a = 0;
  while (a < x.length && Math.abs(x[a]) <= t) a++;
  let b = x.length - 1;
  while (b > a && Math.abs(x[b]) <= t) b--;
  return a >= x.length ? null : { first: a / sr, last: (b + 1) / sr };
}

/**
 * Split a narration into `count` lines at its `count − 1` longest interior pauses that are at
 * least `minPause` long. Leading and trailing silences are not pauses. `bounds` (from
 * soundBounds) gives the exact first and last sound; otherwise the lead/trail silences do.
 * @returns {{ lines: Array<{onset:number,offset:number,dur:number}>, pauses: Array, runnerUp: object|null, lead: number, trail: number }}
 */
export function splitLines(silences, duration, { count = 10, minPause = DEFAULTS.minPause, edge = 0.005, bounds = null } = {}) {
  const lead = silences.find((s) => s.start <= edge);
  const trail = silences.find((s) => s.end >= duration - edge && s !== lead);
  const first = bounds ? bounds.first : lead ? lead.end : 0;
  const last = bounds ? bounds.last : trail ? trail.start : duration;
  if (last - first <= 0) throw new NarrationError('the narration is silent (no sound above the silence threshold)');
  const interior = silences.filter((s) => s !== lead && s !== trail && s.start > first && s.end < last);
  const need = count - 1;
  const long = interior.filter((s) => s.dur >= minPause - EPS);
  const byLength = [...interior].sort((a, b) => b.dur - a.dur);
  if (long.length < need) {
    const seen = byLength.slice(0, need + 2).map((s) => `${fmt(s.dur, 2)} s at ${fmt(s.start, 2)} s`).join(', ') || 'none';
    throw new NarrationError(
      `found ${long.length} pause(s) of at least ${minPause} s between lines, need exactly ${need} for ${count} lines ` +
        `(longest interior silences: ${seen}). The narration must read the ${count} caption lines in order with a ` +
        `<break time="1.2s"/> between them; if the breaks are there but quieter or shorter, adjust --silence-db or --min-pause.`,
    );
  }
  const pauses = [...long].sort((a, b) => b.dur - a.dur).slice(0, need).sort((a, b) => a.start - b.start);
  const runnerUp = byLength.find((s) => !pauses.includes(s)) || null;
  const lines = [];
  for (let i = 0; i < count; i++) {
    const onset = i === 0 ? first : pauses[i - 1].end;
    const offset = i === need ? last : pauses[i].start;
    lines.push({ onset, offset, dur: offset - onset });
  }
  return { lines, pauses, runnerUp, lead: first, trail: duration - last };
}

/** Letters and digits only (combining marks such as Arabic harakat are not counted). */
export function letterCount(text) {
  return (String(text).normalize('NFD').replace(/\p{M}/gu, '').match(/[\p{L}\p{N}]/gu) || []).length;
}

/**
 * Check each line's spoken length against its share of the script by letter count.
 * Throws a NarrationError listing every line outside ×/÷ tolerance.
 */
export function checkShares(lines, texts, { tolerance = DEFAULTS.shareTolerance, ids = [] } = {}) {
  if (lines.length !== texts.length) throw new NarrationError(`${lines.length} lines detected for a ${texts.length}-line script`);
  const letters = texts.map(letterCount);
  const totalLetters = letters.reduce((a, b) => a + b, 0);
  const speech = lines.reduce((a, l) => a + l.dur, 0);
  const rows = lines.map((l, i) => {
    const expected = (speech * letters[i]) / totalLetters;
    const ratio = l.dur / expected;
    return { n: i + 1, id: ids[i] || String(i + 1), letters: letters[i], expected, actual: l.dur, ratio, ok: ratio <= tolerance + EPS && ratio >= 1 / tolerance - EPS };
  });
  const bad = rows.filter((r) => !r.ok);
  if (bad.length) {
    throw new NarrationError(
      `the detected lines do not match the script (allowed: ×/÷ ${tolerance} of each line's letter share):\n` +
        bad.map((r) => `  line ${r.n} (${r.id}): ${fmt(r.actual, 2)} s spoken, ${fmt(r.expected, 2)} s expected from ${r.letters} letters (×${fmt(r.ratio, 2)})`).join('\n') +
        '\nA line break was probably missed or a pause inside a line was taken for one. Check the file reads the captions in order, one <break time="1.2s"/> between lines.',
    );
  }
  return rows;
}

/* ------------------------------------------------------------------ placement */

/**
 * Place each line in its scene window.
 *
 *   preferred start = the cue start (never within gapAfterPrev of the previous line's end)
 *   limit           = next cue start − gapBeforeNextCue; for the last line, duration − tailPad
 *   1. fits at the preferred start → keep it
 *   2. else start earlier, as late as fits, not before scene start − dissolve (scene start after a
 *      hard cut) nor within gapAfterPrev of the previous line's end
 *   3. else start at that floor and speed up with atempo ≤ maxTempo
 *   4. the last line may still overrun: the video is extended by holding its last frame for
 *      (end − duration) + tailPad, rounded up to whole frames. Any other line that cannot fit fails.
 *
 * @param {object} p
 * @param {number[]} p.durations  spoken length of each line (s)
 * @param {Array<{id:string,start:number,end:number}>} p.cues
 * @param {Array<{id:string,start:number,dissolve:number}>} p.scenes  dissolve = 0 for a hard cut
 * @param {number} p.duration  video duration (s)
 * @param {number} p.fps
 */
export function planPlacement({ durations, cues, scenes, duration, fps, opts = {} }) {
  const o = { ...DEFAULTS, ...opts };
  const n = cues.length;
  if (durations.length !== n || scenes.length !== n) throw new NarrationError(`placement needs one line per cue (${durations.length} lines, ${n} cues, ${scenes.length} scenes)`);
  const rows = [];
  let prevEnd = -Infinity;
  let extension = 0;
  for (let i = 0; i < n; i++) {
    const cue = cues[i];
    const scene = scenes[i];
    const last = i === n - 1;
    const d = durations[i];
    const limit = last ? duration - o.tailPad : cues[i + 1].start - o.gapBeforeNextCue;
    const floor = Math.max(0, scene.start - (scene.dissolve || 0));
    const lower = Math.max(floor, prevEnd + o.gapAfterPrev);
    const preferred = Math.max(cue.start, prevEnd + o.gapAfterPrev);
    const notes = [];
    let start;
    let tempo = 1;
    if (preferred + d <= limit + EPS) {
      start = preferred;
      if (preferred > cue.start + EPS) notes.push(`starts ${fmt(preferred - cue.start)} s after the cue (${o.gapAfterPrev} s after the previous line)`);
    } else if (lower + d <= limit + EPS) {
      start = limit - d;
      notes.push(`earlier start ${signed(start - cue.start)} s`);
    } else {
      start = lower;
      const room = limit - lower;
      const need = room > EPS ? d / room : Infinity;
      if (need <= o.maxTempo + EPS) {
        tempo = need;
        notes.push(`earlier start ${signed(start - cue.start)} s`, `atempo ${fmt(tempo, 4)}`);
      } else {
        tempo = o.maxTempo;
        const end = start + d / tempo;
        if (!last) {
          throw new NarrationError(
            `line ${i + 1} (${cue.id}) is ${fmt(d, 2)} s long: even from ${fmt(lower)} s (scene start − dissolve, or ${o.gapAfterPrev} s after the previous line) ` +
              `at atempo ${o.maxTempo} it ends at ${fmt(end)} s, after ${fmt(limit)} s (${o.gapBeforeNextCue} s before the next cue). ` +
              `Regenerate this line a little faster or shorter; scenes are not retimed.`,
          );
        }
        notes.push(`earlier start ${signed(start - cue.start)} s`, `atempo ${fmt(tempo, 4)} (cap)`);
      }
    }
    const len = d / tempo;
    const end = start + len;
    if (last && end > limit + EPS) {
      const frames = Math.ceil((end - duration + o.tailPad) * fps - EPS);
      extension = frames / fps;
      notes.push(`video tail +${frames} frame(s) (${fmt(extension)} s, last frame held)`);
    }
    rows.push({
      n: i + 1, id: cue.id, cueStart: cue.start, cueEnd: cue.end, limit, floor: lower,
      srcDur: d, tempo, start, end, len, shift: start - cue.start,
      margin: last ? duration + extension - end : limit + o.gapBeforeNextCue - end,
      notes,
    });
    prevEnd = end;
  }
  return { rows, extension, duration: duration + extension, extensionFrames: Math.round(extension * fps) };
}

/**
 * The cue table after placement: unchanged unless the tail was extended and the last line now
 * speaks past its cue end, then that end moves to the line's end + 0.1 s (within the new duration).
 */
export function adjustCues(cues, plan) {
  const out = cues.map((c) => ({ ...c }));
  if (plan.extension > 0) {
    const last = out[out.length - 1];
    const row = plan.rows[plan.rows.length - 1];
    const want = Math.min(plan.duration, Math.ceil((row.end + 0.1) * 1000 - EPS) / 1000);
    if (want > last.end + EPS) last.end = round3(want);
  }
  return out;
}

/* ------------------------------------------------------------------ samples */

/** Raised-cosine fade-in / fade-out over the first and last `fadeIn` / `fadeOut` seconds, in place. */
export function fadeEdges(x, sr, fadeIn = DEFAULTS.fadeIn, fadeOut = DEFAULTS.fadeOut) {
  const a = Math.min(x.length, Math.round(fadeIn * sr));
  const b = Math.min(x.length, Math.round(fadeOut * sr));
  for (let i = 0; i < a; i++) x[i] *= 0.5 - 0.5 * Math.cos((Math.PI * i) / a);
  for (let i = 0; i < b; i++) x[x.length - 1 - i] *= 0.5 - 0.5 * Math.cos((Math.PI * i) / b);
  return x;
}

/** Add `seg` into `mix` starting at sample `at` (clipped to the buffer). Returns the samples written. */
export function placeSegment(mix, seg, at) {
  let written = 0;
  for (let i = 0; i < seg.length; i++) {
    const j = at + i;
    if (j < 0 || j >= mix.length) continue;
    mix[j] += seg[i];
    written++;
  }
  return written;
}

const besselI0 = (x) => {
  let sum = 1;
  let term = 1;
  for (let k = 1; k < 50; k++) {
    term *= (x / (2 * k)) ** 2;
    sum += term;
    if (term < 1e-12 * sum) break;
  }
  return sum;
};

/** Kaiser-windowed sinc taps that interpolate x at n + frac from x[n − half + 1 … n + half]. */
function interpKernel(frac, half = 12, beta = 8) {
  const taps = new Float64Array(2 * half);
  const i0b = besselI0(beta);
  for (let j = 0; j < 2 * half; j++) {
    const t = frac - (j - half + 1);
    const sinc = Math.abs(t) < 1e-12 ? 1 : Math.sin(Math.PI * t) / (Math.PI * t);
    const r = t / half;
    taps[j] = Math.abs(r) >= 1 ? 0 : (sinc * besselI0(beta * Math.sqrt(1 - r * r))) / i0b;
  }
  return taps;
}

/**
 * Peak magnitude of each sample and of the three 4×-oversampled points after it (an estimate of
 * the true peak in the spirit of ITU-R BS.1770 Annex 2).
 */
export function interSamplePeaks(x, half = 12) {
  const kernels = [0.25, 0.5, 0.75].map((f) => interpKernel(f, half));
  const out = new Float32Array(x.length);
  const n = x.length;
  for (let i = 0; i < n; i++) {
    let m = Math.abs(x[i]);
    // Inter-sample overs only matter near loud samples: skip quiet stretches cheaply.
    const near = Math.max(m, i + 1 < n ? Math.abs(x[i + 1]) : 0);
    if (near > 0.05) {
      for (const k of kernels) {
        let acc = 0;
        const base = i - half + 1;
        for (let j = 0; j < k.length; j++) {
          const idx = base + j;
          if (idx >= 0 && idx < n) acc += x[idx] * k[j];
        }
        const a = Math.abs(acc);
        if (a > m) m = a;
      }
    }
    out[i] = m;
  }
  return out;
}

/**
 * Look-ahead true-peak limiter, in place. Gain never exceeds what keeps every (oversampled) peak
 * at or below `ceiling` (linear): required gain → forward minimum over the look-ahead window →
 * instant attack / exponential release → moving average over the same window (so the gain ramps
 * down smoothly before each peak and is still at or below the requirement on the peak itself).
 * @returns {{ reducedSamples:number, maxReductionDb:number }}
 */
export function limitTruePeak(x, ceiling, sr, { lookahead = 0.005, release = 0.08 } = {}) {
  const n = x.length;
  const peaks = interSamplePeaks(x);
  const need = new Float64Array(n);
  let any = false;
  for (let i = 0; i < n; i++) {
    need[i] = peaks[i] > ceiling ? ceiling / peaks[i] : 1;
    if (need[i] < 1) any = true;
  }
  if (!any) return { reducedSamples: 0, maxReductionDb: 0 };
  const L = Math.max(2, Math.round(lookahead * sr));
  // m[i] = min(need[i − 1 … i + L − 1]) with a monotonic deque.
  const m = new Float64Array(n);
  const dq = new Int32Array(n + L + 1);
  let head = 0;
  let tail = 0;
  let next = 0;
  for (let i = 0; i < n; i++) {
    const hi = Math.min(n - 1, i + L - 1);
    while (next <= hi) {
      while (tail > head && need[dq[tail - 1]] >= need[next]) tail--;
      dq[tail++] = next++;
    }
    while (dq[head] < i - 1) head++;
    m[i] = need[dq[head]];
  }
  const a = 1 - Math.exp(-1 / (release * sr));
  let prev = 1;
  for (let i = 0; i < n; i++) {
    const relaxed = prev + (1 - prev) * a;
    prev = m[i] < relaxed ? m[i] : relaxed;
    m[i] = prev;
  }
  let sum = 0;
  let reduced = 0;
  let minGain = 1;
  for (let i = 0; i < n; i++) {
    sum += m[i];
    if (i >= L) sum -= m[i - L];
    // Window [i − L + 1, i]; before it is full, the first value stands in for the missing ones.
    const g = Math.min(1, i >= L - 1 ? sum / L : (sum + (L - 1 - i) * m[0]) / L);
    if (g < 1 - 1e-9) {
      reduced++;
      if (g < minGain) minGain = g;
    }
    x[i] *= g;
  }
  return { reducedSamples: reduced, maxReductionDb: -20 * Math.log10(minGain) };
}

export const dbToLin = (db) => 10 ** (db / 20);
export const linToDb = (v) => 20 * Math.log10(Math.max(v, 1e-12));

/* ------------------------------------------------------------------ WAV */

/** Decode a PCM WAV (8/16/24/32-bit int or 32-bit float), mixing every channel down to mono. */
export function decodeWav(buf) {
  if (buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WAVE') throw new Error('not a RIFF/WAVE file');
  let pos = 12;
  let fmtChunk = null;
  let data = null;
  while (pos + 8 <= buf.length) {
    const id = buf.toString('ascii', pos, pos + 4);
    let size = buf.readUInt32LE(pos + 4);
    const body = pos + 8;
    if (id === 'data' && (size === 0 || size === 0xffffffff || body + size > buf.length)) size = buf.length - body; // streamed header
    if (id === 'fmt ') {
      fmtChunk = { format: buf.readUInt16LE(body), channels: buf.readUInt16LE(body + 2), sampleRate: buf.readUInt32LE(body + 4), bits: buf.readUInt16LE(body + 14) };
      // WAVE_FORMAT_EXTENSIBLE: the real format code opens the sub-format GUID.
      if (fmtChunk.format === 0xfffe && size >= 40) fmtChunk.format = buf.readUInt16LE(body + 24);
    }
    if (id === 'data') {
      data = buf.subarray(body, body + size);
      break;
    }
    pos = body + size + (size % 2);
  }
  if (!fmtChunk || !data) throw new Error('WAV without fmt or data chunk');
  const { format, channels, sampleRate, bits } = fmtChunk;
  if (format !== 1 && format !== 3) throw new Error(`unsupported WAV format code ${format}`);
  const bytes = bits / 8;
  const frames = Math.floor(data.length / (bytes * channels));
  const out = new Float32Array(frames);
  for (let f = 0; f < frames; f++) {
    let acc = 0;
    for (let c = 0; c < channels; c++) {
      const o = (f * channels + c) * bytes;
      let v;
      if (format === 3 && bits === 32) v = data.readFloatLE(o);
      else if (bits === 16) v = data.readInt16LE(o) / 32768;
      else if (bits === 24) v = data.readIntLE(o, 3) / 8388608;
      else if (bits === 32) v = data.readInt32LE(o) / 2147483648;
      else if (bits === 8) v = (data.readUInt8(o) - 128) / 128;
      else throw new Error(`unsupported WAV sample format (${bits}-bit, format ${format})`);
      acc += v;
    }
    out[f] = acc / channels;
  }
  return { sampleRate, channels, samples: out };
}

/** Encode mono 32-bit float WAV. */
export function encodeWavFloat(samples, sr = SAMPLE_RATE) {
  const dataBytes = samples.length * 4;
  const buf = Buffer.alloc(44 + dataBytes);
  buf.write('RIFF', 0, 'ascii');
  buf.writeUInt32LE(36 + dataBytes, 4);
  buf.write('WAVE', 8, 'ascii');
  buf.write('fmt ', 12, 'ascii');
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(3, 20); // IEEE float
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(sr, 24);
  buf.writeUInt32LE(sr * 4, 28);
  buf.writeUInt16LE(4, 32);
  buf.writeUInt16LE(32, 34);
  buf.write('data', 36, 'ascii');
  buf.writeUInt32LE(dataBytes, 40);
  for (let i = 0; i < samples.length; i++) buf.writeFloatLE(samples[i], 44 + i * 4);
  return buf;
}

/* ------------------------------------------------------------------ loudnorm and reports */

/** The JSON block loudnorm prints with print_format=json (the last one in the log). */
export function parseLoudnormJson(log) {
  const text = String(log);
  const end = text.lastIndexOf('}');
  const start = text.lastIndexOf('{', end);
  if (start < 0 || end < 0) throw new Error('no loudnorm JSON in the ffmpeg log');
  const j = JSON.parse(text.slice(start, end + 1));
  const num = (k) => (j[k] == null ? null : Number(j[k]));
  return {
    input_i: num('input_i'), input_tp: num('input_tp'), input_lra: num('input_lra'), input_thresh: num('input_thresh'),
    output_i: num('output_i'), output_tp: num('output_tp'), output_lra: num('output_lra'), output_thresh: num('output_thresh'),
    target_offset: num('target_offset'), normalization_type: j.normalization_type || null,
  };
}

/** Plain-text table. */
export function table(headers, rows) {
  const cells = [headers, ...rows].map((r) => r.map((c) => String(c ?? '')));
  const width = headers.map((_, i) => Math.max(...cells.map((r) => [...r[i]].length)));
  const line = (r) => r.map((c, i) => c + ' '.repeat(width[i] - [...c].length)).join('  ').trimEnd();
  return [line(cells[0]), width.map((w) => '-'.repeat(w)).join('  '), ...cells.slice(1).map(line)].join('\n');
}
