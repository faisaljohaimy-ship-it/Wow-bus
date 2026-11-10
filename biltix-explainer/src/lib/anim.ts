import type { CSSProperties } from 'react';
import { interpolate } from 'remotion';
import { EASE } from '../theme';

type EaseFn = (t: number) => number;

/** Eased 0→1 progress of a window [start, start+dur]. */
export function prog(frame: number, start: number, dur: number, ease: EaseFn = EASE.out): number {
  if (dur <= 0) return frame >= start ? 1 : 0;
  return interpolate(frame, [start, start + dur], [0, 1], {
    easing: ease,
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
}

/** Map progress to a range. */
export const mix = (a: number, b: number, t: number) => a + (b - a) * t;

/** Fade + rise entrance. */
export function enter(frame: number, delay: number, dur = 20, dist = 18): CSSProperties {
  const p = prog(frame, delay, dur, EASE.out);
  return { opacity: p, transform: `translateY(${(1 - p) * dist}px)` };
}

/** Piecewise eased keyframes: keys = [[frame, value], …] sorted by frame. */
export function keys(frame: number, k: Array<[number, number]>, ease: EaseFn = EASE.inOut): number {
  if (frame <= k[0][0]) return k[0][1];
  for (let i = 0; i < k.length - 1; i += 1) {
    const [f0, v0] = k[i];
    const [f1, v1] = k[i + 1];
    if (frame <= f1) return mix(v0, v1, ease((frame - f0) / Math.max(1, f1 - f0)));
  }
  return k[k.length - 1][1];
}

/** Count-up value. */
export function countUp(frame: number, start: number, dur: number, to: number, from = 0): number {
  return mix(from, to, prog(frame, start, dur, EASE.expo));
}
