#!/usr/bin/env node
/**
 * Final assembly of the cinematic MVP film: open bookend + core film (with its narration) + close bookend,
 * with a music bed under the whole film, ducked under the narration.
 *
 *   node scripts/showcase-final.mjs --lang ar \
 *     --core  out/BILTIX-MVP-Arabic.mp4 \
 *     --open  final/bookends/open-ar.mp4 --close final/bookends/close-ar.mp4 \
 *     --music assets/music/score.mp3 \
 *     --out   final/BILTIX-MVP-Cinematic-Arabic.mp4
 *   options: --xfade 0.5 (s) · --hold 1.0 (s) · --music-start 0 (s into the music) · --stems <dir> (narration and music
 *            stems as WAV, after the final gain) · --report <file.json> · --dry-run (print the plan only)
 *
 * Picture: the three parts are joined with `xfade` cross-dissolves (default 0.5 s, smoothstep-eased);
 *   the core starts at open − xfade and the close at open + core − 2 × xfade, so
 *   total = open + core + close − 2 × xfade. Every input is brought to 1920 × 1080, 30 fps, yuv420p, SAR 1
 *   first (a no-op for the masters).
 * Narration: the core's own audio, cut to the core's picture length and delayed by (open − xfade), so
 *   every line stays on the frame it was rendered with.
 * Music: trimmed to the film (looped only if it is shorter), 1.5 s fade-in, 3 s fade-out at the end, set
 *   to −16 LUFS ("full level"), then gain-automated from the narration itself: the speech spans come from
 *   `silencedetect` on the core audio (the showcase gates the gaps between lines to digital silence).
 *   Full level in the open and the close, −7 dB between lines inside the core, −15 dB under a line
 *   (0.3 s attack before the first word, 0.5 s release after the last); ramps are smoothstep-shaped and
 *   applied every 10 ms. Gaps between lines shorter than --hold (default 1.0 s) keep the duck (no pumping in
 *   a breath); the bed comes up to −7 dB in real pauses.
 * Loudness: narration + music summed, one gain to −16 LUFS integrated (measured with ebur128 first), then
 *   a look-ahead limiter at 4× sample rate holding the true peak under −1.5 dBTP (limit −2 dBFS, so the
 *   AAC encoder's overshoot stays inside the budget).
 * Colour: Remotion writes full-range YUV with the BT.601 matrix (yuvj420p, tagged bt470bg); every input is
 *   converted with the `colorspace` filter to the BT.709 matrix, limited range (primaries and transfer
 *   untouched), so players that assume BT.709 for HD show the same colours as the renders.
 * Encode: H.264 High, CRF 21, preset slow, yuv420p, BT.709 tags, 30 fps, +faststart; AAC-LC 192 kb/s 48 kHz stereo.
 * Check: prints every duration, the plan, and the measured loudness (ebur128: I, LRA, true peak) and
 *   blackdetect of the written file.
 *
 * Needs a full ffmpeg (xfade, ebur128, silencedetect, alimiter): /usr/bin/ffmpeg or $FFMPEG.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const FFMPEG = process.env.FFMPEG || '/usr/bin/ffmpeg';
const FFPROBE = process.env.FFPROBE || FFMPEG.replace(/ffmpeg$/, 'ffprobe');
const FPS = 30;
const W = 1920;
const H = 1080;
const SR = 48000;
const TARGET = { I: -16, TP: -1.5 };
const DUCK = { between: -7, under: -15, attack: 0.3, release: 0.5, fadeIn: 1.5, fadeOut: 3, step: 480 };

const argv = process.argv.slice(2);
const arg = (name, def) => {
  const i = argv.indexOf(`--${name}`);
  if (i < 0) return def;
  const v = argv[i + 1];
  return v === undefined || v.startsWith('--') ? 'true' : v;
};
const usage = () => {
  console.error('usage: node scripts/showcase-final.mjs --lang ar|en --core <core.mp4> --open <open.mp4> --close <close.mp4> --music <music> --out <file.mp4> [--xfade 0.5] [--hold 1.0] [--music-start 0] [--stems <dir>] [--report <file.json>] [--dry-run]');
  process.exit(2);
};
const lang = arg('lang');
const files = { core: arg('core'), open: arg('open'), close: arg('close'), music: arg('music') };
const out = arg('out');
if (!['ar', 'en'].includes(lang) || !out || Object.values(files).some((f) => !f)) usage();
for (const [k, f] of Object.entries(files)) if (!existsSync(f)) throw new Error(`--${k}: file not found: ${f}`);
const X = Number(arg('xfade', '0.5'));
const musicStart = Number(arg('music-start', '0'));
const dry = arg('dry-run', 'false') === 'true';

/* ── helpers ── */
const run = (bin, args, { nice = true } = {}) => {
  const cmd = nice && existsSync('/usr/bin/nice') ? ['/usr/bin/nice', ['-n', '10', bin, ...args]] : [bin, args];
  const r = spawnSync(cmd[0], cmd[1], { encoding: 'utf8', maxBuffer: 256 << 20 });
  if (r.status !== 0) throw new Error(`${bin} failed (${r.status}): ${args.join(' ')}\n${(r.stderr || '').slice(-4000)}`);
  return r;
};
const ff = (args) => run(FFMPEG, ['-hide_banner', '-nostats', ...args]).stderr;
const f3 = (n) => Number(n).toFixed(3);
const shq = (a) => (/^[\w@%+=:,./-]+$/.test(a) ? a : `'${a.replace(/'/g, `'\\''`)}'`);

const filters = run(FFMPEG, ['-hide_banner', '-filters'], { nice: false }).stdout;
for (const need of ['xfade', 'ebur128', 'silencedetect', 'alimiter', 'blackdetect', 'adelay'])
  if (!new RegExp(`\\s${need}\\s`).test(filters)) throw new Error(`${FFMPEG} has no ${need} filter; set FFMPEG to a full build`);

function probe(file) {
  const j = JSON.parse(run(FFPROBE, ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', file], { nice: false }).stdout);
  const v = j.streams.find((s) => s.codec_type === 'video');
  const a = j.streams.find((s) => s.codec_type === 'audio');
  let vInfo = null;
  if (v) {
    const [num, den] = v.r_frame_rate.split('/').map(Number);
    const fps = num / den;
    let frames = Number(v.nb_frames);
    if (!Number.isFinite(frames) || frames <= 0) {
      const c = JSON.parse(run(FFPROBE, ['-v', 'error', '-select_streams', 'v:0', '-count_packets', '-show_entries', 'stream=nb_read_packets', '-of', 'json', file], { nice: false }).stdout);
      frames = Number(c.streams[0].nb_read_packets);
    }
    // colour: Remotion writes JPEG-style full-range YUV with the BT.601 matrix (yuvj420p, bt470bg); untagged HD
    // is read as BT.709 limited range
    const full = /^yuvj/.test(v.pix_fmt) || v.color_range === 'pc';
    const space = ['bt470bg', 'smpte170m'].includes(v.color_space) ? 'bt470bg' : v.color_space === 'bt709' ? 'bt709' : /^yuvj/.test(v.pix_fmt) ? 'bt470bg' : 'bt709';
    vInfo = { width: v.width, height: v.height, fps, frames, duration: frames / fps, pix_fmt: v.pix_fmt, space, range: full ? 'pc' : 'tv' };
  }
  return { video: vInfo, audio: a ? { duration: Number(a.duration || j.format.duration), rate: Number(a.sample_rate), channels: a.channels } : null, duration: Number(j.format.duration) };
}

const P = { open: probe(files.open), core: probe(files.core), close: probe(files.close), music: probe(files.music) };
for (const k of ['open', 'core', 'close']) if (!P[k].video) throw new Error(`--${k} has no video stream`);
if (!P.core.audio) throw new Error('--core has no audio stream (the narration is taken from the core film)');
if (!P.music.audio) throw new Error('--music has no audio stream');

/* ── timeline ── */
// Exact durations from frame counts (converted to 30 fps if an input is at another rate).
const dur = (k) => Math.round(P[k].video.duration * FPS) / FPS;
const Do = dur('open');
const Dc = dur('core');
const Dl = dur('close');
if (Do < X * 2 || Dc < X * 2 || Dl < X * 2) throw new Error('every part must be longer than two cross-fades');
const off1 = Do - X; // core starts (xfade 1 begins)
const off2 = Do + Dc - 2 * X; // close starts (xfade 2 begins)
const T = Do + Dc + Dl - 2 * X;
const totalFrames = Math.round(T * FPS);
const delay = off1; // narration delay
const delaySamples = Math.round(delay * SR);

/* ── speech spans of the narration (core time), from silencedetect ── */
function speechSpans() {
  const log = ff(['-i', files.core, '-map', '0:a:0', '-af', `atrim=0:${f3(Dc)},silencedetect=noise=-45dB:d=0.3`, '-f', 'null', '-']);
  const sil = [];
  let open = null;
  for (const line of log.split('\n')) {
    const s = line.match(/silence_start: (-?[\d.]+)/);
    const e = line.match(/silence_end: (-?[\d.]+)/);
    if (s) open = Math.max(0, Number(s[1]));
    if (e && open !== null) {
      sil.push([open, Number(e[1])]);
      open = null;
    }
  }
  if (open !== null) sil.push([open, Dc]);
  const spans = [];
  let t = 0;
  for (const [a, b] of sil) {
    if (a - t > 0.08) spans.push([t, a]);
    t = b;
  }
  if (Dc - t > 0.08) spans.push([t, Dc]);
  return spans;
}
const spansCore = speechSpans();
// Hold the duck through short breaths between lines: a gap shorter than --hold (default 1.0 s) would only let the
// music swell for a fraction of a second (audible pumping), so such lines are ducked as one block; the bed comes
// up to the "between lines" level in real pauses.
const hold = Number(arg('hold', '1.0'));
const spansHeld = spansCore.reduce((acc, [a, b]) => {
  const last = acc[acc.length - 1];
  if (last && a - last[1] < hold) last[1] = b;
  else acc.push([a, b]);
  return acc;
}, []);
const spans = spansHeld.map(([a, b]) => [a + delay, b + delay]);
if (Dc > 20 && spansCore.length < 2)
  console.warn(
    `  WARNING: the core audio has ${spansCore.length} speech span(s) and almost no silence: it may already carry music.\n` +
      '           Use the narration-only render of the core film (the Remotion master), or the music will be doubled and ducked as one block.',
  );

/* ── music gain automation (dB), as an ffmpeg expression of t ── */
// core envelope: 0 in the open/close, 1 inside the core; smooth ramps across each cross-fade
const rampIn = [off1 - 0.25, off1 + X + 0.25];
const rampOut = [off2 - 0.25, off2 + X + 0.25];
const coreEnv = `clip(min((t-${f3(rampIn[0])})/${f3(rampIn[1] - rampIn[0])},(${f3(rampOut[1])}-t)/${f3(rampOut[1] - rampOut[0])}),0,1)`;
const duckTerms = spans.map(([a, b]) => `clip(min((t-${f3(a - DUCK.attack)})/${DUCK.attack},(${f3(b + DUCK.release)}-t)/${DUCK.release}),0,1)`);
const duckMax = duckTerms.length ? duckTerms.reduce((acc, term) => `max(${acc},${term})`) : '0';
// st(0): smoothstep(core), st(1): smoothstep(duck)
const gainDb =
  `st(0,${coreEnv});st(0,ld(0)*ld(0)*(3-2*ld(0)));` +
  `st(1,${duckMax});st(1,ld(1)*ld(1)*(3-2*ld(1)));` +
  `ld(0)*(${DUCK.between}+(${DUCK.under - DUCK.between})*ld(1))`;

/* ── music level: −16 LUFS = "full level" ── */
const ebur = (log) => {
  const tail = log.slice(log.lastIndexOf('Summary:'));
  const num = (re) => {
    const m = tail.match(re);
    return m ? Number(m[1]) : NaN;
  };
  return { I: num(/I:\s+(-?[\d.]+|-inf) LUFS/), LRA: num(/LRA:\s+(-?[\d.]+) LU/), TP: num(/Peak:\s+(-?[\d.]+|-inf) dBFS/) };
};
const musicLoop = P.music.audio.duration < musicStart + T;
const musicIn = [...(musicLoop ? ['-stream_loop', '-1'] : []), '-i', files.music];
const musicMeasured = ebur(ff([...musicIn, '-map', '0:a:0', '-af', `atrim=start=${f3(musicStart)}:duration=${f3(T)},ebur128=peak=true`, '-f', 'null', '-']));
const musicGain = Number.isFinite(musicMeasured.I) && musicMeasured.I > -70 ? TARGET.I - musicMeasured.I : 0;

/* ── filter graphs ── */
// Every input → BT.709 matrix, limited range, yuv420p (only the matrix and the range change; primaries and
// transfer are passed through), 1920 × 1080, 30 fps.
const vin = (i, k) =>
  `[${i}:v]setpts=PTS-STARTPTS,fps=${FPS},` +
  `colorspace=ispace=${P[k].video.space}:iprimaries=bt709:itrc=bt709:irange=${P[k].video.range}:space=bt709:primaries=bt709:trc=bt709:range=tv:format=yuv420p,` +
  `scale=${W}:${H}:flags=lanczos:force_original_aspect_ratio=decrease,pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2,setsar=1,format=yuv420p,settb=1/${FPS}`;
const ease = `st(0,P*P*(3-2*P));A*ld(0)+B*(1-ld(0))`;
const video =
  `${vin(0, 'open')},trim=end_frame=${Math.round(Do * FPS)}[o];` +
  `${vin(1, 'core')},trim=end_frame=${Math.round(Dc * FPS)}[c];` +
  `${vin(2, 'close')},trim=end_frame=${Math.round(Dl * FPS)}[l];` +
  `[o][c]xfade=transition=custom:duration=${X}:offset=${f3(off1)}:expr='${ease}'[oc];` +
  `[oc][l]xfade=transition=custom:duration=${X}:offset=${f3(off2)}:expr='${ease}',format=yuv420p[v]`;
const AF = `aformat=sample_fmts=fltp:sample_rates=${SR}:channel_layouts=stereo`;
const narration = `[1:a]${AF},atrim=0:${f3(Dc)},asetpts=N/SR/TB,adelay=delays=${delaySamples}S:all=1,apad=whole_len=${Math.round(T * SR)},atrim=end_sample=${Math.round(T * SR)}[n]`;
const music =
  `[3:a]${AF},atrim=start=${f3(musicStart)}:duration=${f3(T)},asetpts=N/SR/TB,volume=${musicGain.toFixed(2)}dB,` +
  `asetnsamples=n=${DUCK.step}:p=0,volume='pow(10,(${gainDb})/20)':eval=frame,` +
  `afade=t=in:st=0:d=${DUCK.fadeIn}:curve=qsin,afade=t=out:st=${f3(T - DUCK.fadeOut)}:d=${DUCK.fadeOut}:curve=qsin,` +
  `apad=whole_len=${Math.round(T * SR)},atrim=end_sample=${Math.round(T * SR)}[m]`;
const mix = `${narration};${music};[n][m]amix=inputs=2:normalize=0:duration=longest[mx]`;
const inputs = ['-i', files.open, '-i', files.core, '-i', files.close, ...musicIn];

const plan = {
  lang,
  inputs: {
    open: { file: files.open, frames: P.open.video.frames, fps: P.open.video.fps, seconds: Do },
    core: { file: files.core, frames: P.core.video.frames, fps: P.core.video.fps, seconds: Dc, audioSeconds: P.core.audio.duration },
    close: { file: files.close, frames: P.close.video.frames, fps: P.close.video.fps, seconds: Dl },
    music: { file: files.music, seconds: P.music.audio.duration, start: musicStart, looped: musicLoop, integratedLUFS: musicMeasured.I, gainDb: Number(musicGain.toFixed(2)) },
  },
  xfade: X,
  coreStartsAt: off1,
  closeStartsAt: off2,
  narrationDelay: delay,
  total: { seconds: T, frames: totalFrames },
  speechSpans: spansCore.map(([a, b]) => [Number((a + delay).toFixed(3)), Number((b + delay).toFixed(3))]),
  duckSpans: spans.map(([a, b]) => [Number(a.toFixed(3)), Number(b.toFixed(3))]),
  ducking: { full: 'open and close', between: `${DUCK.between} dB`, under: `${DUCK.under} dB`, attack: DUCK.attack, release: DUCK.release, hold, fadeIn: DUCK.fadeIn, fadeOut: DUCK.fadeOut },
};
console.log(`BILTIX MVP final (${lang})`);
console.log(`  open  ${f3(Do)} s (${P.open.video.frames} f)   core ${f3(Dc)} s (${P.core.video.frames} f, audio ${f3(P.core.audio.duration)} s)   close ${f3(Dl)} s (${P.close.video.frames} f)`);
console.log(`  xfade ${X} s → core at ${f3(off1)} s, close at ${f3(off2)} s, total ${f3(T)} s (${totalFrames} frames)`);
console.log(`  narration delayed by ${f3(delay)} s (${delaySamples} samples); ${spansCore.length} speech spans, first at ${spans.length ? f3(spans[0][0]) : '-'} s, last ends ${spans.length ? f3(spans[spans.length - 1][1]) : '-'} s; ${spans.length} duck block(s) (gaps < ${hold} s held)`);
console.log(`  music ${f3(P.music.audio.duration)} s from ${musicStart} s${musicLoop ? ' (looped)' : ''}, ${musicMeasured.I} LUFS → gain ${musicGain.toFixed(2)} dB`);

/* ── pass 1: loudness of the mix ── */
const mixMeasured = ebur(ff([...inputs, '-filter_complex', `${mix};[mx]ebur128=peak=true[x]`, '-map', '[x]', '-f', 'null', '-']));
const gain = TARGET.I - mixMeasured.I;
plan.mix = { measuredLUFS: mixMeasured.I, measuredTP: mixMeasured.TP, gainDb: Number(gain.toFixed(2)) };
console.log(`  mix before gain: ${mixMeasured.I} LUFS, true peak ${mixMeasured.TP} dBFS → gain ${gain.toFixed(2)} dB, limiter at −2 dBFS (4× rate)`);

const limiter = `volume=${gain.toFixed(2)}dB,aresample=${SR * 4},alimiter=limit=${Math.pow(10, -2 / 20).toFixed(5)}:attack=4:release=60:level=false:latency=true,aresample=${SR}`;
const audio = `${mix};[mx]${limiter}[a]`;
const encode = [
  '-y',
  ...inputs,
  '-filter_complex',
  `${video};${audio}`,
  '-map', '[v]',
  '-map', '[a]',
  '-c:v', 'libx264', '-profile:v', 'high', '-preset', 'slow', '-crf', '21', '-pix_fmt', 'yuv420p', '-r', String(FPS), '-g', String(FPS * 4),
  '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-color_range', 'tv',
  '-c:a', 'aac', '-b:a', '192k', '-ar', String(SR), '-ac', '2',
  '-frames:v', String(totalFrames),
  '-movflags', '+faststart',
  out,
];
plan.command = [FFMPEG, ...encode].map(shq).join(' ');
if (dry) {
  console.log(JSON.stringify(plan, null, 2));
  process.exit(0);
}

/* ── pass 2: encode ── */
mkdirSync(dirname(resolve(out)), { recursive: true });
const t0 = Date.now();
ff(encode);
console.log(`  encoded → ${out} in ${((Date.now() - t0) / 1000).toFixed(0)} s`);

if (arg('stems')) {
  const dir = resolve(arg('stems'));
  mkdirSync(dir, { recursive: true });
  const g = `volume=${gain.toFixed(2)}dB`;
  ff(['-y', ...inputs, '-filter_complex', `${narration};${music};[n]${g}[ns];[m]${g}[ms]`, '-map', '[ns]', '-c:a', 'pcm_s16le', resolve(dir, `narration-${lang}.wav`), '-map', '[ms]', '-c:a', 'pcm_s16le', resolve(dir, `music-${lang}.wav`)]);
  console.log(`  stems → ${dir}/narration-${lang}.wav, music-${lang}.wav`);
}

/* ── check the written file ── */
const R = probe(out);
const loud = ebur(ff(['-i', out, '-map', '0:a:0', '-af', 'ebur128=peak=true', '-f', 'null', '-']));
const black = [...ff(['-i', out, '-map', '0:v:0', '-vf', 'blackdetect=d=0.04:pix_th=0.10:pic_th=0.98', '-f', 'null', '-']).matchAll(/black_start:([\d.]+) black_end:([\d.]+) black_duration:([\d.]+)/g)].map((m) => m.slice(1, 4).map(Number));
plan.result = {
  file: out,
  bytes: statSync(out).size,
  video: R.video,
  audioSeconds: R.audio?.duration,
  loudness: loud,
  blackdetect: black,
};
console.log(`  result: ${R.video.width}×${R.video.height} ${R.video.fps} fps, ${R.video.frames} frames = ${f3(R.video.duration)} s (expected ${totalFrames}), audio ${f3(R.audio.duration)} s, ${plan.result.bytes} B`);
console.log(`  loudness (ebur128): I ${loud.I} LUFS, LRA ${loud.LRA} LU, true peak ${loud.TP} dBFS  (target ${TARGET.I} LUFS / ≤ ${TARGET.TP} dBTP)`);
console.log(`  blackdetect (≥ 0.04 s, 98 % of pixels below 10 %): ${black.length ? black.map(([a, b]) => `${a}–${b} s`).join(', ') : 'none'}`);
const problems = [];
if (R.video.frames !== totalFrames) problems.push(`frame count ${R.video.frames} ≠ ${totalFrames}`);
if (Math.abs(loud.I - TARGET.I) > 0.5) problems.push(`integrated loudness ${loud.I} LUFS`);
if (loud.TP > TARGET.TP) problems.push(`true peak ${loud.TP} dBFS`);
if (black.length) problems.push('black frames');
if (arg('report')) writeFileSync(resolve(arg('report')), `${JSON.stringify(plan, null, 2)}\n`);
if (problems.length) {
  console.error(`  CHECK FAILED: ${problems.join('; ')}`);
  process.exit(1);
}
console.log('  checks passed');
