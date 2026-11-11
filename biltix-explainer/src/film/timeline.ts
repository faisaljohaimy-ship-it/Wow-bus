/**
 * Film v2 timeline, per language, from src/film/voice-timing.json (scripts/film-voice.mjs) and src/film/layout.json.
 * One scene per narration line: scene = lead 0.4 s + line + tail 0.5 s; S01 adds a 2.5 s music intro before its
 * line and S18 holds 3 s after it. Scenes cross-dissolve over XFADE frames (the outgoing scene runs past its end).
 * The same arithmetic is repeated in scripts/lib/film-timeline.mjs (music ducking) and scripts/check-frames.py.
 */
import LAYOUT from './layout.json';
import TIMING from './voice-timing.json';

export type Lang = 'ar' | 'en';
export const FPS = LAYOUT.fps;
export const WIDTH = LAYOUT.width;
export const HEIGHT = LAYOUT.height;
export const XFADE = LAYOUT.xfade;

export type Line = { start: number; end: number; pauses: Array<[number, number]> };
export type SceneTiming = {
  index: number;
  from: number; // first frame of the scene (video clock)
  frames: number;
  /** first and last word of the line, frames from the scene start */
  vFrom: number;
  vTo: number;
  /** the line's audio clip: placement (frames from the scene start), source trim and length (frames) */
  clipAt: number;
  trimBefore: number;
  clipFrames: number;
  /** the line (processed-audio clock) and its inner pauses, seconds */
  line: Line;
  /** seconds from the scene start to the first word */
  voiceSec: number;
};

type Raw = { audio: string; duration: number; tempo: number; lines: Line[] };

export function timeline(lang: Lang): { total: number; audio: string; tempo: number; scenes: SceneTiming[] } {
  const raw = (TIMING as unknown as Record<Lang, Raw>)[lang];
  if (!raw || raw.lines.length !== LAYOUT.scenes) throw new Error(`voice-timing.json has no ${LAYOUT.scenes}-line timeline for "${lang}" — run node scripts/film-voice.mjs`);
  const { fps, intro, lead, tail, hold, pad } = LAYOUT;
  let t = 0;
  const scenes = raw.lines.map((ln, i) => {
    const len = ln.end - ln.start;
    const ld = (i === 0 ? intro : 0) + lead;
    const tl = i === raw.lines.length - 1 ? hold : tail;
    const from = Math.round(t * fps);
    const voiceSec = t + ld;
    t += ld + len + tl;
    const to = Math.round(t * fps);
    const trimBefore = Math.max(0, Math.floor((ln.start - pad) * fps));
    const srcFrom = trimBefore / fps;
    return {
      index: i,
      from,
      frames: to - from,
      vFrom: Math.round(voiceSec * fps) - from,
      vTo: Math.round((voiceSec + len) * fps) - from,
      clipAt: Math.round((voiceSec - (ln.start - srcFrom)) * fps) - from,
      trimBefore,
      clipFrames: Math.ceil((ln.end + pad - srcFrom) * fps),
      line: ln,
      voiceSec: voiceSec - from / fps,
    };
  });
  return { total: Math.round(t * fps), audio: raw.audio, tempo: raw.tempo, scenes };
}

/** Frame (from the scene start) at which the voice reaches `sec` seconds into its line. */
export const atVoice = (s: SceneTiming, sec: number) => Math.round(s.vFrom + sec * FPS);
/** Frame (from the scene start) at a fraction 0..1 of the spoken line. */
export const atLine = (s: SceneTiming, f: number) => Math.round(s.vFrom + f * (s.vTo - s.vFrom));
