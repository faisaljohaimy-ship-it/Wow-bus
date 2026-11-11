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
 * The world is a stack of flat planes at depths (px toward the viewer). The camera's projection
 * (rotation about the focus point, then a pinhole lens of LENS px centred on the frame) is computed
 * here, in JS, and each plane receives one plain 2D `matrix()`: exact at the focus point and
 * linear around it. Near planes still travel further than far ones when the camera pans or orbits
 * (real parallax), and a dolly still magnifies near planes more than far ones.
 *
 * Why not CSS 3D (perspective + preserve-3d + translateZ)? That is how the v3.1 recut first drew
 * the camera, and Chromium then composited every scene as a 3D rendering context: on rare frames
 * (about 1 frame in 300, mostly different frames from one render to the next) the screenshot
 * Remotion takes caught those planes with some of their raster tiles not drawn, so a card, a band
 * of a card or a whole scene vanished for one frame. With 2D matrices there is no 3D context left
 * to composite. The only thing given up is the keystone of a ≤ 1.6° orbit (a few px at the frame
 * corners, see `planeAffine`), which the eye cannot see.
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

const RAD = Math.PI / 180;

/**
 * Exact screen position of world point (px, py) on the plane at depth d, for camera c: the point is
 * rotated about the focus point (roll, then yaw, then pitch — the order the earlier CSS transform
 * `rotateX · rotateY · rotateZ` applied them), moved by the dolly, and projected through a pinhole
 * of LENS px centred on the 1920 × 1080 frame.
 */
export function project(c: Cam, px: number, py: number, d = 0): { x: number; y: number } {
  let x = px - c.x;
  let y = py - c.y;
  let z = d;
  const r = c.roll * RAD;
  [x, y] = [x * Math.cos(r) - y * Math.sin(r), x * Math.sin(r) + y * Math.cos(r)];
  const a = c.yaw * RAD;
  [x, z] = [x * Math.cos(a) + z * Math.sin(a), -x * Math.sin(a) + z * Math.cos(a)];
  const b = c.pitch * RAD;
  [y, z] = [y * Math.cos(b) - z * Math.sin(b), y * Math.sin(b) + z * Math.cos(b)];
  const depth = LENS - (z + c.z);
  if (!(depth > 1)) throw new Error(`camera: plane ${d} is at or behind the lens (z ${c.z.toFixed(1)})`);
  const s = LENS / depth;
  return { x: 960 + x * s, y: 540 + y * s };
}

/** The 2D affine of a plane: the projection's value at the focus point and its slope across ±H px. */
const H = 480;
export type Affine = { a: number; b: number; c: number; d: number; e: number; f: number };
export function planeAffine(c: Cam, depth = 0): Affine {
  const o = project(c, c.x, c.y, depth);
  const xp = project(c, c.x + H, c.y, depth);
  const xm = project(c, c.x - H, c.y, depth);
  const yp = project(c, c.x, c.y + H, depth);
  const ym = project(c, c.x, c.y - H, depth);
  const a = (xp.x - xm.x) / (2 * H);
  const b = (xp.y - xm.y) / (2 * H);
  const cc = (yp.x - ym.x) / (2 * H);
  const d = (yp.y - ym.y) / (2 * H);
  const m = { a, b, c: cc, d, e: o.x - (a * c.x + cc * c.y), f: o.y - (b * c.x + d * c.y) };
  for (const v of Object.values(m)) if (!Number.isFinite(v)) throw new Error(`camera: non-finite plane matrix at depth ${depth}`);
  return m;
}

/** Apply a plane's affine to a world point (used by the framing check and the scenes' anchors). */
export const applyAffine = (m: Affine, x: number, y: number) => ({ x: m.a * x + m.c * y + m.e, y: m.b * x + m.d * y + m.f });

/** CSS for a plane at a depth: one 2D matrix about the world origin (no 3D rendering context). */
export function planeStyle(c: Cam, depth = 0): CSSProperties {
  const m = planeAffine(c, depth);
  const n = (v: number, k: number) => v.toFixed(k);
  return { transformOrigin: '0 0', transform: `matrix(${n(m.a, 6)}, ${n(m.b, 6)}, ${n(m.c, 6)}, ${n(m.d, 6)}, ${n(m.e, 3)}, ${n(m.f, 3)})` };
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
