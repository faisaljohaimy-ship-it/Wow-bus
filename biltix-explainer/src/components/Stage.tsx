/**
 * Stage: the virtual camera's frame.
 *
 *   <Shot frames rtl shots>          dissolve in/out + the scene's camera path
 *     <Layer depth={0}> cards </Layer>
 *     <Layer depth={60} blur={…}> foreground accents </Layer>
 *   </Shot>
 *
 * The world plane is 1920 × 1080 with CSS perspective (LENS); every Layer is a full-size plane at
 * translateZ(depth). Rack focus = blur on the out-of-focus Layer only (kept ≤ 4 px, used sparingly).
 */
import React from 'react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';
import { camAt, mirrorShot, worldTransform, type Cam, type Shot as ShotKey } from '../lib/camera';
import { prog } from '../lib/anim';
import { TRANSITION } from '../storyboard';
import { EASE, LENS } from '../theme';

export const StageView: React.FC<{ cam: Cam; children: React.ReactNode }> = ({ cam, children }) => (
  <AbsoluteFill style={{ perspective: LENS, perspectiveOrigin: '960px 540px', overflow: 'hidden' }}>
    <div style={{ position: 'absolute', left: 0, top: 0, width: 1920, height: 1080, ...worldTransform(cam) }}>{children}</div>
  </AbsoluteFill>
);

/** A plane of the world at a depth (px toward the viewer). */
export const Layer: React.FC<{ depth?: number; blur?: number; opacity?: number; style?: React.CSSProperties; children: React.ReactNode }> = ({
  depth = 0,
  blur = 0,
  opacity = 1,
  style,
  children,
}) => (
  <div
    style={{
      position: 'absolute',
      left: 0,
      top: 0,
      width: 1920,
      height: 1080,
      transform: depth ? `translateZ(${depth}px)` : undefined,
      filter: blur > 0.05 ? `blur(${blur.toFixed(2)}px)` : undefined,
      opacity,
      ...style,
    }}
  >
    {children}
  </div>
);

/**
 * One scene: dissolve in (unless it enters on a cut), dissolve out, and the camera path.
 * Shots are written for the left-to-right layout; Arabic mirrors them.
 */
export const Shot: React.FC<{
  frames: number;
  rtl: boolean;
  shots: ShotKey[];
  first?: boolean;
  last?: boolean;
  cutIn?: boolean;
  cutOut?: boolean;
  matchIn?: boolean;
  matchOut?: boolean;
  children: React.ReactNode;
}> = ({ frames, rtl, shots, first, last, cutIn, cutOut, matchIn, matchOut, children }) => {
  const frame = useCurrentFrame();
  // matched hand-off: full 15-frame cross-dissolve; otherwise a dip: out over 0–10, in over 5–15
  const fin = first || cutIn ? 1 : matchIn ? prog(frame, 0, TRANSITION, EASE.inOut) : prog(frame, 5, TRANSITION - 5, EASE.inOut);
  const fout = last || cutOut ? 1 : 1 - (matchOut ? prog(frame, frames, TRANSITION, EASE.inOut) : prog(frame, frames, TRANSITION - 5, EASE.inOut));
  const cam = camAt(frame, shots.map((s) => mirrorShot(s, rtl)));
  return (
    <AbsoluteFill style={{ opacity: fin * fout }}>
      <StageView cam={cam}>{children}</StageView>
    </AbsoluteFill>
  );
};
