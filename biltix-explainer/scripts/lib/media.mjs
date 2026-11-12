/**
 * File and ffmpeg side of the explainer exports, shared by export-web.mjs and voice-mux.mjs so the
 * two never disagree about where files live, how the web MP4 is encoded, which master is the
 * silent original, or what the app's media manifest says.
 *
 * Only the ffmpeg/ffprobe bundled with Remotion's compositor package are used (scripts/env.mjs).
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, extname, join, resolve } from 'node:path';
import { ffmpegBin, ffprobeBin } from '../env.mjs';
import * as N from './narration.mjs';
import * as S from './story.mjs';

const MiB = 1024 * 1024;
export const kib = (bytes) => `${(bytes / 1024).toFixed(0)} KB`;

/** 1080p master re-encode (only when the tail is extended): the settings of remotion.config.ts. */
export const MASTER_X264 = ['-c:v', 'libx264', '-preset', 'slow', '-crf', '20', '-pix_fmt', 'yuv420p', '-profile:v', 'high'];
/** 720p web encode, unchanged from the silent exports. */
export const WEB_SCALE = 'scale=1280:720:flags=lanczos';
export const webX264 = (crf) => ['-c:v', 'libx264', '-preset', 'slow', '-crf', String(crf), '-tune', 'animation', '-profile:v', 'high', '-level', '4.0', '-pix_fmt', 'yuv420p'];
/**
 * Web MP4 size budgets. Silent: 3.3 MiB (3.46 MB) keeps the recut (a moving camera on every frame)
 * at about the size of the larger of the earlier static cut's web files (3.1 and 3.4 MB). With the
 * narration (128 kb/s, about 0.65 MB for 41.5 s) the file may reach 3.7 MiB.
 */
export const WEB_BUDGET = Object.freeze({ silent: 3.3 * MiB, voiced: 3.7 * MiB });
/** Narration track: AAC-LC, 48 kHz, mono, 128 kb/s. */
export const AAC = ['-c:a', 'aac', '-b:a', '128k', '-ar', String(N.SAMPLE_RATE), '-ac', '1'];

export function requireBundledFfmpeg() {
  if (!existsSync(ffmpegBin) || !existsSync(ffprobeBin)) {
    throw new Error(`the ffmpeg bundled with Remotion was not found (${ffmpegBin}); run npm ci in biltix-explainer`);
  }
}

/** Run the bundled ffmpeg. Returns its stderr (the log, where silencedetect and loudnorm report). */
export function ff(args, { log = false } = {}) {
  const r = spawnSync(ffmpegBin, ['-hide_banner', '-nostdin', '-y', '-nostats', '-v', log ? 'info' : 'error', ...args], { encoding: 'utf8', maxBuffer: 256 * MiB });
  if (r.status !== 0) {
    const tail = String(r.stderr || r.error || '').trim().split('\n').slice(-12).join('\n');
    throw new Error(`ffmpeg exited with ${r.status}: ffmpeg ${args.join(' ')}\n${tail}`);
  }
  return r.stderr || '';
}

export function mediaInfo(file) {
  const p = JSON.parse(execFileSync(ffprobeBin, ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', file], { encoding: 'utf8' }));
  const v = p.streams.find((s) => s.codec_type === 'video');
  const a = p.streams.find((s) => s.codec_type === 'audio');
  const rate = (r) => {
    const [n, d] = String(r || '0/1').split('/').map(Number);
    return d ? n / d : 0;
  };
  return {
    file,
    size: Number(p.format.size),
    duration: Number(p.format.duration),
    video: v ? { codec: v.codec_name, width: v.width, height: v.height, fps: rate(v.r_frame_rate), frames: Number(v.nb_frames), duration: Number(v.duration), pixFmt: v.pix_fmt } : null,
    audio: a ? { codec: a.codec_name, profile: a.profile, sampleRate: Number(a.sample_rate), channels: a.channels, bitRate: Number(a.bit_rate), duration: Number(a.duration) } : null,
  };
}

/* ------------------------------------------------------------------ layout */

/**
 * Where the files live. Default: the real locations (out/ masters, ../biltix-hse/assets/video,
 * ../biltix-hse/js/data/explainer-media.js). With outDir, the same tree under outDir.
 */
export function layout(outDir = null) {
  const base = outDir ? resolve(outDir) : null;
  const masters = base ? join(base, 'out') : join(S.ROOT, 'out');
  const app = base ? join(base, 'biltix-hse') : resolve(S.ROOT, '../biltix-hse');
  return { base, isDefault: !base, masters, voice: join(masters, 'voice'), web: join(app, 'assets/video'), manifest: join(app, 'js/data/explainer-media.js') };
}
export const masterFile = (L, lang) => join(L.masters, `biltix-explainer-${lang}-1080p.mp4`);
export const silentFile = (L, lang) => join(L.masters, `biltix-explainer-${lang}-1080p-silent.mp4`);
export const webFile = (L, lang) => join(L.web, `explainer-${lang}-720p.mp4`);
export const vttFile = (L, lang) => join(L.web, `explainer-${lang}.vtt`);

/**
 * The silent original of a language's master: the master itself when it has no audio track (a
 * fresh render), otherwise the -silent.mp4 kept next to it by the first narration mux.
 */
export function silentSource(lang) {
  const L = layout();
  const master = masterFile(L, lang);
  const silent = silentFile(L, lang);
  if (existsSync(master) && !mediaInfo(master).audio) return master;
  if (existsSync(silent)) {
    if (mediaInfo(silent).audio) throw new Error(`${silent} has an audio track; it must be the silent render`);
    return silent;
  }
  if (!existsSync(master)) throw new Error(`missing ${master}: run npm run render:${lang} first`);
  throw new Error(`${master} has an audio track and ${basename(silent)} is missing: the silent original is gone (npm run render:${lang})`);
}

/* ------------------------------------------------------------------ narration record (out/voice) */

/** The narration kept for rebuilds: out/voice/<lang>.json + the audio file it names. */
export function readVoiceStore(L, lang) {
  const json = join(L.voice, `${lang}.json`);
  if (!existsSync(json)) return null;
  const meta = JSON.parse(readFileSync(json, 'utf8'));
  const input = join(L.voice, meta.file);
  if (!existsSync(input)) throw new Error(`${json} names ${meta.file}, which is missing`);
  return { ...meta, input };
}

function writeVoiceStore(L, lang, input, voice, options) {
  mkdirSync(L.voice, { recursive: true });
  const file = `${lang}${extname(input).toLowerCase() || '.audio'}`;
  const dest = join(L.voice, file);
  if (resolve(input) !== resolve(dest)) copyFileSync(input, dest);
  const sha256 = createHash('sha256').update(readFileSync(dest)).digest('hex');
  const meta = { file, source: basename(input), bytes: statSync(dest).size, sha256, voice, options };
  writeFileSync(join(L.voice, `${lang}.json`), `${JSON.stringify(meta, null, 2)}\n`);
  return meta;
}

/* ------------------------------------------------------------------ web encode and manifest */

/**
 * 720p H.264 within `budget`: the CRF is raised one step at a time from `crfStart` until the
 * whole file (video + any copied audio) fits.
 */
export function encodeWeb({ inputs, filter, audioInput = null, extra = [], out, budget, crfStart = 24, log = () => {} }) {
  const tmp = `${out}.tmp.mp4`;
  for (let crf = crfStart; crf <= 34; crf += 1) {
    ff([
      ...inputs, '-filter_complex', filter, '-map', '[v]',
      ...(audioInput == null ? ['-an'] : ['-map', `${audioInput}:a:0`, '-c:a', 'copy']),
      ...webX264(crf), ...extra, '-movflags', '+faststart', '-f', 'mp4', tmp,
    ]);
    const size = statSync(tmp).size;
    if (size <= budget) {
      renameSync(tmp, out);
      return { crf, size };
    }
    log(`      crf ${crf}: ${kib(size)} > ${kib(budget)}, next CRF`);
  }
  rmSync(tmp, { force: true });
  throw new Error(`${out}: no CRF up to 34 fits ${kib(budget)}`);
}

/** A manifest entry read back from the files on disk (out-dir first, then the real locations). */
export function entryFromDisk(L, lang) {
  const D = layout();
  const here = existsSync(webFile(L, lang)) ? L : D;
  const web = webFile(here, lang);
  const vtt = existsSync(vttFile(here, lang)) ? vttFile(here, lang) : vttFile(D, lang);
  const info = mediaInfo(web);
  let voice = null;
  if (info.audio) {
    const store = readVoiceStore(here, lang);
    if (!store) throw new Error(`${web} has an audio track but no narration record (${join(here.voice, `${lang}.json`)}); run voice-mux for ${lang}`);
    voice = store.voice;
  }
  return { duration: N.round3(info.video.duration), voice, cues: S.manifestCues(S.parseVtt(readFileSync(vtt, 'utf8'))) };
}

/** Write biltix-hse/js/data/explainer-media.js: given entries win, other languages are read from disk. */
export function writeManifest(L, entries = {}, build = new Date().toISOString().slice(0, 10)) {
  const langs = {};
  for (const lang of S.LANGS) langs[lang] = entries[lang] || entryFromDisk(L, lang);
  mkdirSync(dirname(L.manifest), { recursive: true });
  writeFileSync(L.manifest, S.formatManifest({ build, langs }));
  return langs;
}

/* ------------------------------------------------------------------ narration mux */

const SR = N.SAMPLE_RATE;

function atempo(seg, tempo, tmp, n) {
  const a = join(tmp, `line${n}.wav`);
  const b = join(tmp, `line${n}-atempo.wav`);
  writeFileSync(a, N.encodeWavFloat(seg, SR));
  ff(['-i', a, '-af', `atempo=${tempo.toFixed(5)}`, '-c:a', 'pcm_s24le', '-f', 'wav', b]);
  return N.decodeWav(readFileSync(b)).samples;
}

const loudnormArgs = (o, tp, m = null) =>
  `loudnorm=I=${o.targetI}:TP=${tp.toFixed(2)}:LRA=${o.loudnessRange}` +
  (m ? `:measured_I=${m.input_i}:measured_TP=${m.input_tp}:measured_LRA=${m.input_lra}:measured_thresh=${m.input_thresh}:offset=${m.target_offset}:linear=true` : '') +
  ':print_format=json';

function measure(file, o, tp) {
  return N.parseLoudnormJson(ff(['-i', file, '-af', loudnormArgs(o, tp), '-f', 'null', '-'], { log: true }));
}

/** Onsets / offsets of sound in a decoded file, for the placement check. */
function detectEdges(file, duration, thresholdDb) {
  const sil = N.parseSilences(ff(['-i', file, '-af', `silencedetect=noise=${thresholdDb.toFixed(1)}dB:d=0.1`, '-f', 'null', '-'], { log: true }), duration);
  const onsets = sil.map((s) => s.end).filter((t) => t < duration - 1e-3);
  if (!sil.length || sil[0].start > 1e-3) onsets.unshift(0);
  const offsets = sil.map((s) => s.start).filter((t) => t > 1e-3);
  return { onsets, offsets };
}
const nearest = (list, t) => list.reduce((best, x) => (Math.abs(x - t) < Math.abs(best - t) ? x : best), Infinity);

/**
 * Mux one language's narration onto its explainer.
 *
 * Reads the silent master, splits the narration into its 10 lines, places them in the scene
 * windows, normalises the loudness, and (unless dryRun) writes the 1080p master with audio, the
 * 720p web file, the VTT and the narration record. Returns { entry, report, plan }.
 *
 * @param {object} p
 * @param {'ar'|'en'} p.lang
 * @param {string} p.input  narration audio (one file, the 10 caption lines in order)
 * @param {{name:string, provider:string, model:string}} p.voice  labels for the manifest
 * @param {object} [p.L]  layout(); default = the real locations
 * @param {object} [p.opts]  overrides of narration.mjs DEFAULTS
 */
export function narrateLanguage({ lang, input, voice, L = layout(), dryRun = false, opts = {}, crfStart = 24, keepTemp = false, log = console.log }) {
  const o = { ...N.DEFAULTS, ...opts };
  if (!existsSync(input)) throw new N.NarrationError(`narration file not found: ${input}`);
  const sources = S.readData().validation.sources;
  const cues = S.storyCues(lang, sources);
  const scenes = S.storyScenes();
  const script = S.narrationScript(lang, sources);
  const src0 = silentSource(lang);
  const vinfo = mediaInfo(src0).video;
  if (!vinfo || vinfo.frames !== S.TOTAL_FRAMES || Math.abs(vinfo.fps - S.FPS) > 1e-6) {
    throw new Error(`${src0}: ${vinfo?.frames} frames at ${vinfo?.fps} fps; the storyboard has ${S.TOTAL_FRAMES} at ${S.FPS}. Render the master again first.`);
  }
  const duration = vinfo.frames / vinfo.fps;
  const tmp = mkdtempSync(join(tmpdir(), `voice-mux-${lang}-`));
  const report = [];
  const say = (s = '') => {
    report.push(s);
    log(s);
  };
  try {
    say(`== ${lang.toUpperCase()} narration: ${input}`);
    say(`   voice: ${voice.name} · ${voice.provider} · ${voice.model} (AI-generated)`);

    // 1. Decode to 48 kHz mono and find the silences.
    const srcWav = join(tmp, 'source.wav');
    ff(['-i', input, '-map', '0:a:0', '-ac', '1', '-ar', String(SR), '-c:a', 'pcm_s24le', '-f', 'wav', srcWav]);
    const src = N.decodeWav(readFileSync(srcWav)).samples;
    const srcDur = src.length / SR;
    const silences = N.parseSilences(ff(['-i', srcWav, '-af', `silencedetect=noise=${o.silenceDb}dB:d=${o.detectPause}`, '-f', 'null', '-'], { log: true }), srcDur);

    // 2. Ten lines at the nine longest pauses, checked against the script.
    const bounds = N.soundBounds(src, SR, o.silenceDb);
    if (!bounds) throw new N.NarrationError(`${input} is silent (nothing above ${o.silenceDb} dBFS)`);
    const split = N.splitLines(silences, srcDur, { count: cues.length, minPause: o.minPause, bounds });
    say(`   source: ${N.fmt(srcDur)} s, lead ${N.fmt(split.lead)} s, trail ${N.fmt(split.trail)} s, ${silences.length} silences ≥ ${o.detectPause} s at ${o.silenceDb} dBFS`);
    say(`   line breaks (the ${split.pauses.length} longest pauses): ${split.pauses.map((p) => N.fmt(p.dur, 2)).join(' · ')} s; next longest silence ${split.runnerUp ? `${N.fmt(split.runnerUp.dur, 2)} s at ${N.fmt(split.runnerUp.start, 2)} s` : 'none'}`);
    const shares = N.checkShares(split.lines, script.map((s) => s.spoken), { tolerance: o.shareTolerance, ids: cues.map((c) => c.id) });

    // 3. Placement.
    const plan = N.planPlacement({ durations: split.lines.map((l) => l.dur), cues, scenes, duration, fps: vinfo.fps, opts: o });
    const finalCues = N.adjustCues(cues, plan);
    say('');
    say(N.table(
      ['#', 'line', 'letters', 'spoken s', 'share s', '×', 'cue in', 'start', 'Δ cue', 'tempo', 'end', 'limit', 'margin', 'adjustment'],
      plan.rows.map((r, i) => [
        r.n, r.id, shares[i].letters, N.fmt(r.srcDur), N.fmt(shares[i].expected), N.fmt(shares[i].ratio, 2), N.fmt(r.cueStart), N.fmt(r.start), N.signed(r.shift),
        N.fmt(r.tempo, 4), N.fmt(r.end), N.fmt(r.limit), N.fmt(r.margin), r.notes.join('; ') || 'none (cue start)',
      ]),
    ));
    say('   limit = next cue start − 0.12 s (last line: video end − 0.4 s); margin = time left to the next cue start (last line: to the video end).');
    if (plan.extension > 0) {
      const lc = finalCues[finalCues.length - 1];
      say(`   tail: +${plan.extensionFrames} frames (${N.fmt(plan.extension)} s) holding the last frame → ${N.fmt(plan.duration)} s; last cue end ${N.fmt(cues[cues.length - 1].end)} → ${N.fmt(lc.end)} s`);
    } else say(`   tail: none (video stays ${N.fmt(duration)} s; cues unchanged)`);

    // 4. Assemble the timeline: each line with a little room around it, faded, at its start.
    const mix = new Float32Array(Math.round(plan.duration * SR));
    split.lines.forEach((line, i) => {
      const row = plan.rows[i];
      const before = i === 0 ? 0 : (split.pauses[i - 1].start + split.pauses[i - 1].end) / 2;
      const after = i === split.lines.length - 1 ? srcDur : (split.pauses[i].start + split.pauses[i].end) / 2;
      const pre = Math.max(0, Math.min(o.preRoll, line.onset - before));
      const post = Math.max(0, Math.min(o.postRoll, after - line.offset));
      let seg = src.slice(Math.round((line.onset - pre) * SR), Math.round((line.offset + post) * SR));
      if (Math.abs(row.tempo - 1) > 1e-6) seg = atempo(seg, row.tempo, tmp, i + 1);
      N.fadeEdges(seg, SR, o.fadeIn, o.fadeOut);
      N.placeSegment(mix, seg, Math.round((row.start - pre / row.tempo) * SR));
    });

    // 5. Loudness: measure; true-peak limit only if a linear gain to the target would break the
    //    ceiling; loudnorm second pass (linear); AAC; measure the decoded AAC; tighten if needed.
    const mixWav = join(tmp, 'mix.wav');
    const aac = join(tmp, 'narration.m4a');
    const checkWav = join(tmp, 'check.wav');
    writeFileSync(mixWav, N.encodeWavFloat(mix, SR));
    // `ceiling` is the true peak the linear gain may reach (the target minus headroom for the AAC
    // encode); the limiter holds peaks 0.3 dB under it so loudnorm's own check keeps linear mode.
    let ceiling = o.targetTP - o.codecMargin;
    let m = measure(mixWav, o, ceiling);
    const raw = m;
    const unlimited = Float32Array.from(mix);
    let limited = false;
    let pass2 = null;
    let fin = null;
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      for (let k = 0; k < 4 && m.input_tp + (o.targetI - m.input_i) > ceiling - 0.05; k += 1) {
        N.limitTruePeak(mix, N.dbToLin(ceiling - (o.targetI - m.input_i) - 0.3), SR);
        limited = true;
        writeFileSync(mixWav, N.encodeWavFloat(mix, SR));
        m = measure(mixWav, o, ceiling);
      }
      pass2 = N.parseLoudnormJson(ff(['-i', mixWav, '-af', `${loudnormArgs(o, ceiling, m)},aresample=${SR}`, ...AAC, '-f', 'mp4', aac], { log: true }));
      ff(['-i', aac, '-ac', '1', '-ar', String(SR), '-c:a', 'pcm_s24le', '-f', 'wav', checkWav]);
      fin = measure(checkWav, o, ceiling);
      if (fin.input_tp <= o.targetTP) break;
      ceiling -= fin.input_tp - o.targetTP + 0.1;
      say(`   AAC true peak ${N.fmt(fin.input_tp, 2)} dBTP > ${o.targetTP}: peak ceiling lowered to ${N.fmt(ceiling, 2)} dBTP, again`);
    }
    let limitNote = '; no limiting needed';
    if (limited) {
      let minGain = 1;
      let over1 = 0;
      for (let i = 0; i < mix.length; i++) {
        if (Math.abs(unlimited[i]) < 1e-4) continue;
        const g = mix[i] / unlimited[i];
        if (g < minGain) minGain = g;
        if (g < 0.891) over1 += 1;
      }
      limitNote = `; true-peak limiter (look-ahead 5 ms, release 80 ms) so the peaks after gain stay ≤ ${N.fmt(ceiling - 0.3, 2)} dBTP: ` +
        `max ${N.fmt(-N.linToDb(minGain), 2)} dB, > 1 dB on ${(over1 / SR).toFixed(2)} s → ${N.fmt(m.input_i, 2)} LUFS / ${N.fmt(m.input_tp, 2)} dBTP`;
    }
    say('');
    say(`   loudness: source mix ${N.fmt(raw.input_i, 2)} LUFS / ${N.fmt(raw.input_tp, 2)} dBTP / LRA ${N.fmt(raw.input_lra, 1)}${limitNote}` +
      `; loudnorm pass 2: ${pass2.normalization_type} (gain ${N.signed(o.targetI - m.input_i, 2)} dB)`);
    say(`   narration track (decoded AAC, 48 kHz mono 128 kb/s): ${N.fmt(fin.input_i, 2)} LUFS integrated, ${N.fmt(fin.input_tp, 2)} dBTP true peak, LRA ${N.fmt(fin.input_lra, 1)}`);
    if (pass2.normalization_type !== 'linear') say('   warning: loudnorm fell back to dynamic mode');
    if (Math.abs(fin.input_i - o.targetI) > 0.5 || fin.input_tp > o.targetTP) throw new N.NarrationError(`narration loudness ${fin.input_i} LUFS / ${fin.input_tp} dBTP misses the target ${o.targetI} LUFS ±0.5 / ≤ ${o.targetTP} dBTP`);

    // 6. Placement check on the decoded AAC: each line's onset and end vs the plan and the cue.
    const outDur = N.decodeWav(readFileSync(checkWav)).samples.length / SR;
    const edges = detectEdges(checkWav, outDur, o.silenceDb + (fin.input_i - raw.input_i));
    const check = plan.rows.map((r) => {
      const on = nearest(edges.onsets, r.start);
      const off = nearest(edges.offsets, r.end);
      return { ...r, on, off, dStart: on - r.start, dEnd: off - r.end, dCue: on - r.cueStart };
    });
    say('');
    say(N.table(
      ['#', 'line', 'planned start', 'detected', 'Δ plan', 'Δ cue', 'planned end', 'detected', 'Δ plan'],
      check.map((c) => [c.n, c.id, N.fmt(c.start), N.fmt(c.on), N.signed(c.dStart), N.signed(c.dCue), N.fmt(c.end), N.fmt(c.off), N.signed(c.dEnd)]),
    ));
    const worst = Math.max(...check.map((c) => Math.max(Math.abs(c.dStart), Math.abs(c.dEnd))));
    const unmoved = check.filter((c) => !c.notes.length);
    const worstCue = unmoved.length ? Math.max(...unmoved.map((c) => Math.abs(c.dCue))) : 0;
    say(`   placement check: worst |Δ plan| ${N.fmt(worst)} s; lines at their cue (${unmoved.length}/10): worst |Δ cue| ${N.fmt(worstCue)} s (tolerance 0.15 s)`);
    if (worst > 0.15 || worstCue > 0.15) throw new N.NarrationError('placement check failed: a line in the mixed track is more than 0.15 s from its planned position');
    say(`   audio length ${N.fmt(outDur)} s for a ${N.fmt(plan.duration)} s video`);

    if (dryRun) {
      say('   dry run: nothing written');
      return { lang, report, plan, entry: null };
    }

    // 7. Write: silent original, 1080p master with audio, 720p web file, VTT, narration record.
    mkdirSync(L.masters, { recursive: true });
    mkdirSync(L.web, { recursive: true });
    const master = masterFile(L, lang);
    const silent = silentFile(L, lang);
    if (resolve(src0) !== resolve(silent)) {
      copyFileSync(src0, `${silent}.voice-tmp`);
      renameSync(`${silent}.voice-tmp`, silent);
    }
    let hold = null;
    if (plan.extensionFrames > 0) {
      hold = join(tmp, 'last-frame.mkv');
      ff(['-ss', String((vinfo.frames - 1.5) / vinfo.fps), '-i', silent, '-frames:v', '1', '-c:v', 'rawvideo', '-pix_fmt', 'yuv420p', '-f', 'matroska', hold]);
    }
    const frames = vinfo.frames + plan.extensionFrames;
    const vin = ['-i', silent, ...(hold ? ['-stream_loop', '-1', '-t', String((plan.extensionFrames + 2) / vinfo.fps), '-i', hold] : []), '-i', aac];
    const aIn = hold ? 2 : 1;
    const chain = hold ? '[0:v:0][1:v:0]concat=n=2:v=1:a=0' : '[0:v:0]';
    const cfr = hold ? ['-r', String(vinfo.fps), '-frames:v', String(frames)] : [];
    const masterTmp = `${master}.voice-tmp`;
    if (hold) ff([...vin, '-filter_complex', `${chain}[v]`, '-map', '[v]', '-map', `${aIn}:a:0`, ...MASTER_X264, ...cfr, '-c:a', 'copy', '-movflags', '+faststart', '-f', 'mp4', masterTmp]);
    else ff([...vin, '-map', '0:v:0', '-map', `${aIn}:a:0`, '-c', 'copy', '-movflags', '+faststart', '-f', 'mp4', masterTmp]);
    renameSync(masterTmp, master);

    const web = webFile(L, lang);
    const enc = encodeWeb({ inputs: vin, filter: `${chain}${hold ? ',' : ''}${WEB_SCALE}[v]`, audioInput: aIn, extra: cfr, out: web, budget: WEB_BUDGET.voiced, crfStart, log });
    writeFileSync(vttFile(L, lang), S.vttText(lang, finalCues));
    const stored = writeVoiceStore(L, lang, input, voice, opts);

    // 8. Check the written files.
    const mi = mediaInfo(master);
    const wi = mediaInfo(web);
    for (const f of [mi, wi]) {
      if (!f.audio || f.audio.codec !== 'aac' || f.audio.sampleRate !== SR) throw new Error(`${f.file}: no 48 kHz AAC narration track`);
      if (f.video.frames !== frames) throw new Error(`${f.file}: ${f.video.frames} frames, expected ${frames}`);
      if (Math.abs(f.audio.duration - f.video.duration) > 0.05) throw new Error(`${f.file}: audio ${f.audio.duration} s vs video ${f.video.duration} s`);
    }
    say('');
    say(`   1080p ${master}: ${kib(mi.size)}, video ${hold ? `re-encoded (CRF 20, ${frames} frames)` : 'stream-copied'}, ${N.fmt(mi.video.duration)} s, audio ${mi.audio.codec} ${mi.audio.sampleRate} Hz ${mi.audio.channels} ch ${Math.round(mi.audio.bitRate / 1000)} kb/s ${N.fmt(mi.audio.duration)} s`);
    say(`   silent original kept: ${silent}`);
    say(`   720p  ${web}: ${kib(wi.size)} (CRF ${enc.crf}, budget ${kib(WEB_BUDGET.voiced)}), ${N.fmt(wi.video.duration)} s, audio ${N.fmt(wi.audio.duration)} s`);
    say(`   VTT   ${vttFile(L, lang)}${plan.extension > 0 ? ' (last cue end adjusted)' : ' (cues unchanged)'}`);
    say(`   narration record: ${join(L.voice, `${lang}.json`)} (${stored.file}, sha256 ${stored.sha256.slice(0, 12)}…)`);
    const entry = { duration: N.round3(wi.video.duration), voice, cues: S.manifestCues(finalCues) };
    return { lang, report, plan, entry };
  } finally {
    if (keepTemp) log(`   temp files kept: ${tmp}`);
    else rmSync(tmp, { recursive: true, force: true });
  }
}
