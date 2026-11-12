/**
 * Bookend timing (frames at 30 fps). Both bookends are 7.5 s (225 frames), 1920 × 1080.
 *
 * The b-roll clips are 4.0 s at 24 fps (96 source frames). A clip that has to stay on screen longer than
 * that is slowed a little (`rate` < 1), never frozen: at 30 fps, frame n of a clip shows source time
 * n / 30 × rate, and the last frame of every clip window stays inside the 4.0 s source.
 */
export const FPS = 30;
export const WIDTH = 1920;
export const HEIGHT = 1080;
export const BOOKEND_FRAMES = 225; // 7.5 s

/** Background of the app (and of the core film's first and last frames). */
export const LIGHT = '#F4F7FB';

/** Cross-dissolve between the two clips of a bookend: frames [XD_FROM, XD_FROM + XD_LEN). Centre ≈ 3.65 s. */
export const XD_FROM = 99;
export const XD_LEN = 21;

/** The last 0.8 s of the open dissolve to LIGHT; the close starts from LIGHT and dissolves in over 0.8 s. */
export const LIGHT_LEN = 24;

/** 2.39:1 letterbox: bar height at rest (px). */
export const BAR = Math.round((HEIGHT - WIDTH / 2.39) / 2); // 138

export type Clip = { file: string; from: number; dur: number; rate: number };

export const OPEN_CLIPS: Clip[] = [
  { file: 'broll/aerial.mp4', from: 0, dur: XD_FROM + XD_LEN, rate: 1 }, // 0 → 4.0 s, last frame at source 3.97 s
  { file: 'broll/engineer.mp4', from: XD_FROM, dur: BOOKEND_FRAMES - XD_FROM, rate: 0.94 }, // 3.3 → 7.5 s, last frame at source 3.92 s
];

export const CLOSE_CLIPS: Clip[] = [
  { file: 'broll/ops-room.mp4', from: 0, dur: XD_FROM + XD_LEN, rate: 1 },
  { file: 'broll/hardhat.mp4', from: XD_FROM, dur: BOOKEND_FRAMES - XD_FROM, rate: 0.94 },
];

/** Source time (s) of the last frame shown of a clip window (must stay < 4.0 s). */
export const lastSourceTime = (c: Clip) => ((c.dur - 1) / FPS) * c.rate;
