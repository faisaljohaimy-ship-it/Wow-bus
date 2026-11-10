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

export type CamKey = { f: number; s: number; x: number; y: number };

/**
 * Restrained camera: scale 1.00–1.06 and small pans, eased between keys.
 * x/y are in px of the 1920×1080 canvas (positive x = toward inline-end when
 * `rtlMirror` is applied by the caller).
 */
export function camera(frame: number, k: CamKey[], ease: EaseFn = EASE.inOut): CSSProperties {
  const s = Math.min(1.06, Math.max(1, keys(frame, k.map((c) => [c.f, c.s] as [number, number]), ease)));
  const xRaw = keys(frame, k.map((c) => [c.f, c.x] as [number, number]), ease);
  const yRaw = keys(frame, k.map((c) => [c.f, c.y] as [number, number]), ease);
  // Safe framing: the 1728 px content block never gets closer than 24 px to the
  // frame edge, and vertical drift stays within ±10 px (clear of the caption band).
  const maxX = Math.max(0, (1920 - 1728 * s) / 2 - 24);
  // soft limit (tanh) so a limited pan still eases instead of stopping dead
  const x = maxX > 0 ? maxX * Math.tanh(xRaw / maxX) : 0;
  const y = 10 * Math.tanh(yRaw / 10);
  return { transform: `translate(${x}px, ${y}px) scale(${s})`, transformOrigin: '50% 50%' };
}

/** Count-up value. */
export function countUp(frame: number, start: number, dur: number, to: number, from = 0): number {
  return mix(from, to, prog(frame, start, dur, EASE.expo));
}
