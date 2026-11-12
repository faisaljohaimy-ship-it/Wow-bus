/**
 * Showcase timeline, per language, from src/showcase/voice-timing.json (written by scripts/showcase-voice.mjs):
 * one scene per narration line. Scene i lasts its line + 0.9 s with the line starting 0.35 s in; scene 1 adds
 * a 1.6 s lead-in, scene 13 holds 2.5 s after its line. Arabic and English each use their own line lengths.
 */
import TIMING from './voice-timing.json';

export type Lang = 'ar' | 'en';
export const FPS = 30;
export const WIDTH = 1920;
export const HEIGHT = 1080;
/** Cross-dissolve between scenes (frames): the outgoing scene runs this long past its end while the next fades in. */
export const XFADE = 14;

export type SceneTiming = {
  index: number;
  from: number;
  frames: number;
  /** first and last word of the line, frames from the scene start */
  voiceFrom: number;
  voiceTo: number;
  /** the audio clip of the line: placement (frames from the scene start), source trim and length (frames) */
  clipAt: number;
  trimBefore: number;
  clipFrames: number;
};

type Raw = {
  audio: string;
  total: number;
  lines: Array<{ start: number; end: number }>;
  scenes: Array<{ from: number; frames: number; voice: { from: number; to: number; at: number; trimBefore: number; frames: number } }>;
};

export function timeline(lang: Lang): { total: number; audio: string; scenes: SceneTiming[] } {
  const raw = (TIMING as unknown as Record<Lang, Raw>)[lang];
  if (!raw || raw.scenes.length !== 13) throw new Error(`voice-timing.json has no 13-scene timeline for "${lang}" — run node scripts/showcase-voice.mjs`);
  return {
    total: raw.total,
    audio: raw.audio,
    scenes: raw.scenes.map((s, i) => ({
      index: i,
      from: s.from,
      frames: s.frames,
      voiceFrom: s.voice.from - s.from,
      voiceTo: s.voice.to - s.from,
      clipAt: s.voice.at - s.from,
      trimBefore: s.voice.trimBefore,
      clipFrames: s.voice.frames,
    })),
  };
}
