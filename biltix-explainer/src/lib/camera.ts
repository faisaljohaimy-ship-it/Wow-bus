/**
 * Virtual camera.
 *
 * A shot list is a few keys `{ f, x, y, z, yaw, pitch, roll }` relative to the scene start:
 * - x, y   the world point the lens looks at (1920 × 1080 world px, measured from the LEFT edge
 *          in the left-to-right layout; `mirrorShot` flips it for Arabic)
 * - z      dolly: + moves toward the scene. Magnification on the focus plane = LENS / (LENS − z)
 * - yaw    orbit around the focus point (degrees, + swings the camera toward the inline-end)
 * - pitch  crane tilt (degrees), roll a hair of dutch angle — both kept tiny
 * Between keys the camera eases (EASE.cam by default, or the key's own curve), so it settles on
 * the detail being explained and never starts or stops abruptly.
 *
 * The world is a 3D plane (CSS perspective = LENS) and layers sit on it at translateZ(depth):
 * when the camera pans or orbits, near layers travel further than far ones (real parallax).
 */
import type { CSSProperties } from 'react';
import { EASE, LENS } from '../theme';

type EaseFn = (t: number) => number;

export type Shot = { f: number; x: number; y: number; z?: number; yaw?: number; pitch?: number; roll?: number; ease?: EaseFn };
export type Cam = { x: number; y: number; z: number; yaw: number; pitch: number; roll: number };

const FIELDS = ['x', 'y', 'z', 'yaw', 'pitch', 'roll'] as const;

/** Camera state at a frame (frame relative to the scene start). */
export function camAt(frame: number, shots: Shot[]): Cam {
  const k = shots;
  const val = (s: Shot, key: (typeof FIELDS)[number]) => (s[key] as number | undefined) ?? 0;
  const out = {} as Cam;
  if (frame <= k[0].f) {
    for (const key of FIELDS) out[key] = val(k[0], key);
    return out;
  }
  for (let i = 0; i < k.length - 1; i += 1) {
    const a = k[i];
    const b = k[i + 1];
    if (frame <= b.f) {
      const t = (b.ease || EASE.cam)(Math.min(1, Math.max(0, (frame - a.f) / Math.max(1, b.f - a.f))));
      for (const key of FIELDS) out[key] = val(a, key) + (val(b, key) - val(a, key)) * t;
      return out;
    }
  }
  for (const key of FIELDS) out[key] = val(k[k.length - 1], key);
  return out;
}

/** Arabic mirrors the frame: x is measured from the right edge and orbits swing the other way. */
export function mirrorShot(s: Shot, rtl: boolean): Shot {
  if (!rtl) return s;
  return { ...s, x: 1920 - s.x, yaw: -(s.yaw ?? 0), roll: -(s.roll ?? 0) };
}

/** Magnification of the focus plane for a dolly position. */
export const magnification = (z: number) => LENS / (LENS - z);

/** CSS transform of the world plane for a camera state. */
export function worldTransform(c: Cam): CSSProperties {
  return {
    transformOrigin: `${c.x.toFixed(2)}px ${c.y.toFixed(2)}px`,
    transform: `translate3d(${(960 - c.x).toFixed(2)}px, ${(540 - c.y).toFixed(2)}px, ${c.z.toFixed(2)}px) rotateX(${c.pitch.toFixed(3)}deg) rotateY(${c.yaw.toFixed(3)}deg) rotateZ(${c.roll.toFixed(3)}deg)`,
    transformStyle: 'preserve-3d',
  };
}

/** Blend two camera states (for the background plate during a dissolve). */
export function mixCam(a: Cam, b: Cam, t: number): Cam {
  const out = {} as Cam;
  for (const key of FIELDS) out[key] = a[key] + (b[key] - a[key]) * t;
  return out;
}

/** Smoothstep focus pull: 0 → 1 between two frames (for rack focus and dimming). */
export function pull(frame: number, from: number, to: number): number {
  const t = Math.min(1, Math.max(0, (frame - from) / Math.max(1, to - from)));
  return t * t * (3 - 2 * t);
}
