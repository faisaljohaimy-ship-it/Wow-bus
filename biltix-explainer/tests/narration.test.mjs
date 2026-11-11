/**
 * Unit tests for the narration pipeline's pure parts (scripts/lib/narration.mjs) and the
 * storyboard tables it is placed against (scripts/lib/story.mjs).
 *
 *   node --test tests/        (npm test)
 */
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { test } from 'node:test';
import { pathToFileURL } from 'node:url';
import {
  adjustCues, checkShares, decodeWav, DEFAULTS, encodeWavFloat, fadeEdges, interSamplePeaks, letterCount, limitTruePeak,
  NarrationError, parseLoudnormJson, parseSilences, placeSegment, planPlacement, soundBounds, splitLines,
} from '../scripts/lib/narration.mjs';
import { formatManifest, manifestCues, narrationScript, parseVtt, ROOT, storyCues, storyScenes, vttText } from '../scripts/lib/story.mjs';

const near = (a, b, tol = 1e-3, msg) => assert.ok(Math.abs(a - b) <= tol, msg || `${a} ≉ ${b} (±${tol})`);
const cues = storyCues('en', 13);
const scenes = storyScenes();
const DUR = 41.5;
const FPS = 30;
/** Durations that fit every window at its cue start. */
const fitting = () => [1.8, 3.0, 2.8, 3.0, 3.0, 2.5, 2.4, 3.0, 2.8, 2.0];

/* ---------------------------------------------------------------- silences and lines */

/** silencedetect log for a narration with a lead, nine 1.2 s breaks, one comma and a trail. */
function fakeLog({ breaks = 9, comma = true } = {}) {
  const rows = ['[silencedetect @ 0x1] silence_start: -0.000113', '[silencedetect @ 0x1] silence_end: 0.3 | silence_duration: 0.3'];
  let t = 0.3;
  for (let i = 0; i < breaks; i++) {
    t += 2.5;
    if (comma && i === 1) {
      rows.push(`[silencedetect @ 0x1] silence_start: ${t - 1.3}`, `[silencedetect @ 0x1] silence_end: ${t - 1.05} | silence_duration: 0.25`);
    }
    rows.push(`[silencedetect @ 0x1] silence_start: ${t}`, `[silencedetect @ 0x1] silence_end: ${t + 1.2} | silence_duration: 1.2`);
    t += 1.2;
  }
  t += 2.5;
  rows.push(`[silencedetect @ 0x1] silence_start: ${t}`);
  return { log: rows.join('\n'), duration: t + 0.3 };
}

test('parseSilences pairs start/end, clamps a negative start and closes a trailing silence at the end', () => {
  const { log, duration } = fakeLog();
  const s = parseSilences(log, duration);
  assert.equal(s.length, 12); // lead + 9 breaks + comma + trail
  assert.equal(s[0].start, 0);
  near(s[0].dur, 0.3);
  near(s.at(-1).end, duration);
  near(s.at(-1).dur, 0.3);
});

test('splitLines: ten lines at the nine longest pauses, the comma pause stays inside its line', () => {
  const { log, duration } = fakeLog();
  const { lines, pauses, runnerUp, lead, trail } = splitLines(parseSilences(log, duration), duration, { count: 10 });
  assert.equal(lines.length, 10);
  assert.equal(pauses.length, 9);
  near(lead, 0.3);
  near(trail, 0.3);
  near(lines[0].onset, 0.3);
  near(lines[0].dur, 2.5);
  near(lines[2].dur, 2.5, 1e-3, 'line 3 keeps its comma pause'); // the comma sits in the third segment
  near(runnerUp.dur, 0.25);
  for (const l of lines) near(l.dur, 2.5);
});

test('splitLines fails clearly with the wrong number of pauses', () => {
  const { log, duration } = fakeLog({ breaks: 8 });
  assert.throws(() => splitLines(parseSilences(log, duration), duration, { count: 10 }), (e) => e instanceof NarrationError && /found 8 pause\(s\) of at least 0\.6 s.*need exactly 9/s.test(e.message));
});

test('splitLines takes only the nine longest when there are more long silences', () => {
  const { log, duration } = fakeLog({ breaks: 10 });
  const sil = parseSilences(log, duration);
  sil[5].dur = 0.7; // one break shorter than the others → it is the one left out
  const { pauses, runnerUp, lines } = splitLines(sil, duration, { count: 10 });
  assert.equal(pauses.length, 9);
  assert.equal(lines.length, 10);
  assert.ok(!pauses.includes(sil[5]));
  assert.equal(runnerUp, sil[5]);
});

test('soundBounds finds speech that starts and ends closer to the file edges than silencedetect sees', () => {
  const sr = 1000;
  const x = new Float32Array(3000);
  for (let i = 80; i < 2950; i++) x[i] = 0.2 * Math.sin(i);
  x[80] = 0.3;
  x[2949] = 0.3;
  const b = soundBounds(x, sr, -45);
  near(b.first, 0.08);
  near(b.last, 2.95);
  assert.equal(soundBounds(new Float32Array(100), sr, -45), null);
  // with bounds, line 1 starts at the first sound even though no lead silence was reported
  const { lines } = splitLines([{ start: 1, end: 2, dur: 1 }], 3, { count: 2, bounds: b });
  near(lines[0].onset, 0.08);
  near(lines[1].offset, 2.95);
});

test('letterCount ignores harakat, spaces and punctuation', () => {
  assert.equal(letterCount('ثلاثةَ عشرَ'), letterCount('ثلاثة عشر'));
  assert.equal(letterCount('ثلاثة عشر'), 8);
  assert.equal(letterCount('Evidence-backed decisions, with humans in control'), 42);
  assert.equal(letterCount('13 data'), 6);
});

test('checkShares accepts lines near their letter share and names the ones that are not', () => {
  const texts = narrationScript('en', 13).map((s) => s.spoken);
  const letters = texts.map(letterCount);
  const lines = letters.map((n) => ({ dur: n * 0.08 }));
  const rows = checkShares(lines, texts);
  for (const r of rows) near(r.ratio, 1, 1e-9);
  // two lines merged and one split: the shares break
  const bad = lines.map((l) => ({ ...l }));
  bad[3].dur += bad[4].dur;
  bad[4].dur = 0.6;
  assert.throws(() => checkShares(bad, texts, { ids: cues.map((c) => c.id) }), (e) => e instanceof NarrationError && /line 4 \(analyze\)/.test(e.message) && /line 5 \(explain\)/.test(e.message));
});

/* ---------------------------------------------------------------- placement */

test('planPlacement keeps every line on its cue when it fits', () => {
  const p = planPlacement({ durations: fitting(), cues, scenes, duration: DUR, fps: FPS });
  assert.equal(p.extension, 0);
  p.rows.forEach((r, i) => {
    near(r.start, cues[i].start);
    assert.equal(r.tempo, 1);
    assert.deepEqual(r.notes, []);
    if (i < 9) assert.ok(r.end <= cues[i + 1].start - DEFAULTS.gapBeforeNextCue + 1e-9);
  });
});

test('planPlacement: an overrunning line starts earlier, as late as fits', () => {
  const d = fitting();
  d[0] = 2.4; // intro window at the cue: 0.6 → 2.613 (2.013 s)
  const p = planPlacement({ durations: d, cues, scenes, duration: DUR, fps: FPS });
  const r = p.rows[0];
  near(r.end, cues[1].start - 0.12);
  near(r.start, cues[1].start - 0.12 - 2.4);
  assert.equal(r.tempo, 1);
  assert.match(r.notes.join(), /earlier start −0\.387 s/);
});

test('planPlacement never starts within 0.15 s of the previous line and never before scene start − dissolve', () => {
  const d = fitting();
  d[0] = 2.4; // ends exactly at 2.613 → the next line may not start before 2.763 (cue 2.733)
  const p = planPlacement({ durations: d, cues, scenes, duration: DUR, fps: FPS });
  near(p.rows[1].start, p.rows[0].end + 0.15);
  assert.match(p.rows[1].notes.join(), /after the cue/);
  // The source scene starts at 2.4 s after a 0.5 s dissolve: a long line starts at 1.9 s at the
  // earliest (here the intro line ends at 1.6 s, so 1.75 s would be allowed by the 0.15 s rule).
  const d2 = fitting();
  d2[0] = 1.0;
  d2[1] = 4.95; // 1.9 + 4.95 > 6.813 → starts at the floor, slightly sped up
  const p2 = planPlacement({ durations: d2, cues, scenes, duration: DUR, fps: FPS });
  near(p2.rows[1].start, 1.9, 1e-9);
  near(p2.rows[1].tempo, 4.95 / (6.813 - 1.9), 1e-9);
  assert.ok(p2.rows[1].start >= p2.rows[0].end + 0.15 - 1e-9);
});

test('planPlacement: atempo when an earlier start is not enough; a hard cut has no dissolve to borrow', () => {
  const d = fitting();
  d[5] = 3.35; // sitecam: hard cut at 21.5 s, limit 24.713 s → room 3.213 s
  const p = planPlacement({ durations: d, cues, scenes, duration: DUR, fps: FPS });
  const r = p.rows[5];
  near(r.start, 21.5);
  near(r.tempo, 3.35 / (24.713 - 21.5), 1e-6);
  near(r.end, 24.713);
  assert.match(r.notes.join(), /atempo 1\.04/);
});

test('planPlacement: atempo is capped at 1.08 and a middle line that still does not fit fails', () => {
  const d = fitting();
  d[5] = 3.6; // needs 3.6 / 3.213 = 1.12
  assert.throws(() => planPlacement({ durations: d, cues, scenes, duration: DUR, fps: FPS }), (e) => e instanceof NarrationError && /line 6 \(sitecam\)/.test(e.message) && /atempo 1\.08/.test(e.message));
});

test('planPlacement: the last line extends the tail by holding the last frame (needed + 0.4 s, whole frames)', () => {
  const d = fitting();
  d[9] = 3.4; // outro: floor 38.1 s, limit 41.1 s → needs 1.133 → capped at 1.08 → ends 41.248
  const p = planPlacement({ durations: d, cues, scenes, duration: DUR, fps: FPS });
  const r = p.rows[9];
  near(r.start, 38.1);
  near(r.tempo, 1.08);
  near(r.end, 38.1 + 3.4 / 1.08, 1e-9);
  const frames = Math.ceil((r.end - DUR + 0.4) * FPS);
  assert.equal(p.extensionFrames, frames);
  assert.equal(frames, 5);
  near(p.duration, DUR + frames / FPS, 1e-9);
  assert.ok(p.duration - r.end >= 0.4 - 1e-9, 'at least 0.4 s of picture after the last word');
  assert.match(r.notes.join(), /video tail \+5 frame/);
  // the last cue then covers the spoken line
  const adj = adjustCues(cues, p);
  near(adj[9].end, Math.ceil((r.end + 0.1) * 1000) / 1000);
  assert.deepEqual(adj.slice(0, 9), cues.slice(0, 9));
  // without an extension the cues are unchanged
  assert.deepEqual(adjustCues(cues, planPlacement({ durations: fitting(), cues, scenes, duration: DUR, fps: FPS })), cues);
});

/* ---------------------------------------------------------------- samples */

test('fadeEdges: raised-cosine 20 ms in / 30 ms out, the middle untouched', () => {
  const sr = 48000;
  const x = new Float32Array(sr).fill(1);
  fadeEdges(x, sr, 0.02, 0.03);
  assert.equal(x[0], 0);
  near(x[480], 0.5, 0.01);
  near(x[960], 1, 1e-6);
  near(x[sr / 2], 1, 1e-9);
  near(x[sr - 1], 0, 1e-6);
  near(x[sr - 720], 0.5, 0.01);
  assert.ok(x[sr - 1441] > 0.999);
});

test('placeSegment adds at an offset and clips at the buffer edges', () => {
  const mix = new Float32Array(10);
  assert.equal(placeSegment(mix, Float32Array.from([1, 2, 3]), 8), 2);
  assert.deepEqual([...mix.slice(7)], [0, 1, 2]);
  assert.equal(placeSegment(mix, Float32Array.from([5, 6]), -1), 1);
  assert.equal(mix[0], 6);
});

test('interSamplePeaks finds the true peak between samples', () => {
  // fs/4 sine at 45° phase: every sample is ±0.707, the waveform peaks at 1.0 between them
  const x = Float32Array.from({ length: 4000 }, (_, n) => Math.sin((Math.PI / 2) * n + Math.PI / 4));
  const p = interSamplePeaks(x);
  let sample = 0;
  let truePeak = 0;
  for (let i = 100; i < 3900; i++) {
    sample = Math.max(sample, Math.abs(x[i]));
    truePeak = Math.max(truePeak, p[i]);
  }
  near(sample, Math.SQRT1_2, 1e-3);
  near(truePeak, 1, 0.01);
});

test('limitTruePeak holds peaks under the ceiling and leaves quiet passages alone', () => {
  const sr = 48000;
  const x = new Float32Array(sr);
  for (let i = 0; i < sr; i++) x[i] = (i > 24000 && i < 26400 ? 0.98 : 0.1) * Math.sin((2 * Math.PI * 440 * i) / sr);
  const before = Float32Array.from(x);
  const ceiling = 0.5;
  const res = limitTruePeak(x, ceiling, sr);
  assert.ok(res.maxReductionDb > 5.5 && res.maxReductionDb < 6.5, `reduction ${res.maxReductionDb}`);
  const p = interSamplePeaks(x);
  assert.ok(Math.max(...p) <= ceiling * 1.005, `peak ${Math.max(...p)} > ${ceiling}`);
  // untouched before the look-ahead window (5 ms), recovered after the release (80 ms time constant)
  for (const i of [1000, 10000, 20000, 23700]) assert.equal(x[i], before[i], `sample ${i} changed`);
  for (const i of [46000, 47000]) near(x[i] / before[i], 1, 0.005, `sample ${i} not recovered`);
  // nothing to do below the ceiling
  const quiet = Float32Array.from({ length: 1000 }, (_, i) => 0.2 * Math.sin(i / 7));
  assert.deepEqual(limitTruePeak(quiet, 0.5, sr), { reducedSamples: 0, maxReductionDb: 0 });
});

test('WAV float round trip', () => {
  const x = Float32Array.from({ length: 1000 }, (_, i) => Math.sin(i / 10) * 0.9);
  const { sampleRate, channels, samples } = decodeWav(encodeWavFloat(x, 44100));
  assert.equal(sampleRate, 44100);
  assert.equal(channels, 1);
  assert.deepEqual([...samples], [...x]);
});

test('parseLoudnormJson reads the last JSON block of an ffmpeg log', () => {
  const log = 'stuff {not json\n[Parsed_loudnorm_0 @ 0x1]\n{\n\t"input_i" : "-18.77",\n\t"input_tp" : "-2.49",\n\t"input_lra" : "4.30",\n\t"input_thresh" : "-28.95",\n\t"output_i" : "-16.00",\n\t"output_tp" : "-2.00",\n\t"output_lra" : "4.20",\n\t"output_thresh" : "-26.20",\n\t"normalization_type" : "linear",\n\t"target_offset" : "0.00"\n}\n';
  const j = parseLoudnormJson(log);
  assert.equal(j.input_i, -18.77);
  assert.equal(j.input_tp, -2.49);
  assert.equal(j.normalization_type, 'linear');
});

/* ---------------------------------------------------------------- storyboard tables and manifest */

test('storyCues and vttText reproduce the committed VTT files byte for byte', () => {
  for (const lang of ['ar', 'en']) {
    const file = resolve(ROOT, `../biltix-hse/assets/video/explainer-${lang}.vtt`);
    const text = readFileSync(file, 'utf8');
    assert.equal(vttText(lang, storyCues(lang, 13)), text);
    const parsed = parseVtt(text);
    assert.deepEqual(parsed.map((c) => [c.start, c.end, c.text]), storyCues(lang, 13).map((c) => [c.start, c.end, c.text]));
  }
});

test('scene windows: steps as in the storyboard, no dissolve into the intro or after the hard cut', () => {
  assert.deepEqual(scenes.map((s) => s.step), [null, 0, 1, 2, 3, 3, 4, 5, 6, null]);
  assert.equal(scenes[0].dissolve, 0);
  assert.equal(scenes[5].id, 'sitecam');
  assert.equal(scenes[5].dissolve, 0);
  near(scenes[1].dissolve, 0.5);
  near(scenes[9].start, 38.6);
});

test('the narration script speaks the number, the captions show it', () => {
  assert.equal(narrationScript('en', 13)[1].spoken, 'Thirteen data sources flow into one pipeline');
  assert.equal(narrationScript('en', 13)[1].caption, '13 data sources flow into one pipeline');
  assert.match(narrationScript('ar', 13)[1].spoken, /^ثلاثةَ عشرَ مصدراً/);
  assert.throws(() => narrationScript('en', 14), /no spoken form of 14/);
});

test('formatManifest writes an importable module in the agreed shape', async () => {
  const entry = (lang, voice) => ({ duration: 41.5, voice, cues: manifestCues(storyCues(lang, 13)) });
  const text = formatManifest({ build: '2026-11-11', langs: { ar: entry('ar', { name: 'Saadoun', provider: 'ElevenLabs', model: 'eleven_multilingual_v2' }), en: entry('en', null) } });
  assert.match(text, /^\/\*\* BILTIX explainer media manifest\. Generated by biltix-explainer\/scripts \(export-web\.mjs \/ voice-mux\.mjs\) — do not edit by hand\. \*\/\nexport const EXPLAINER = Object\.freeze\(\{\n {2}build: '2026-11-11',\n {2}langs: \{\n {4}ar: \{ mp4: 'assets\/video\/explainer-ar-720p\.mp4', poster: 'assets\/video\/explainer-ar-poster\.webp', vtt: 'assets\/video\/explainer-ar\.vtt', width: 1280, height: 720, duration: 41\.5,\n/);
  assert.match(text, /\nexport default EXPLAINER;\n$/);
  const dir = mkdtempSync(join(tmpdir(), 'manifest-'));
  try {
    writeFileSync(join(dir, 'explainer-media.js'), text);
    writeFileSync(join(dir, 'package.json'), '{"type":"module"}');
    const mod = await import(pathToFileURL(join(dir, 'explainer-media.js')).href);
    const M = mod.default;
    assert.equal(mod.EXPLAINER, M);
    assert.ok(Object.isFrozen(M));
    assert.deepEqual(Object.keys(M), ['build', 'langs']);
    assert.deepEqual(Object.keys(M.langs), ['ar', 'en']);
    for (const lang of ['ar', 'en']) {
      const e = M.langs[lang];
      assert.deepEqual(Object.keys(e), ['mp4', 'poster', 'vtt', 'width', 'height', 'duration', 'voice', 'cues']);
      assert.equal(e.cues.length, 10);
      assert.deepEqual(Object.keys(e.cues[0]), ['id', 'start', 'end', 'step', 'text']);
      assert.deepEqual(e.cues.map((c) => c.step), [null, 0, 1, 2, 3, 3, 4, 5, 6, null]);
      assert.deepEqual({ start: e.cues[0].start, end: e.cues[0].end }, { start: 0.6, end: 2.533 });
    }
    assert.deepEqual(M.langs.ar.voice, { name: 'Saadoun', provider: 'ElevenLabs', model: 'eleven_multilingual_v2' });
    assert.equal(M.langs.en.voice, null);
    assert.equal(M.langs.en.cues[1].text, '13 data sources flow into one pipeline');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
