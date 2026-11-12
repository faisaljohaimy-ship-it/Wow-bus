/**
 * Stage: the virtual camera's frame.
 *
 *   <Shot frames rtl shots>          dissolve in/out + the scene's camera path
 *     <Layer depth={0}> cards </Layer>
 *     <Layer depth={60} blur={…}> foreground accents </Layer>
 *   </Shot>
 *
 * The world is 1920 × 1080; every Layer is a full-size flat plane at a depth (px toward the viewer).
 * The camera projects each plane in JS (src/lib/camera.ts) and the plane gets one 2D matrix(): no CSS
 * perspective, no preserve-3d, no translateZ, so Chromium never composites a 3D rendering context
 * (which is what made whole cards or scenes drop out of single frames in the first v3.1 render).
 * Rack focus = blur on the out-of-focus Layer only (kept ≤ 4 px, used sparingly).
 */
import React, { createContext, useContext } from 'react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';
import { camAt, mirrorShot, planeStyle, type Cam, type Shot as ShotKey } from '../lib/camera';
import { prog } from '../lib/anim';
import { TRANSITION } from '../storyboard';
import { EASE } from '../theme';

const REST: Cam = { x: 960, y: 540, z: 0, yaw: 0, pitch: 0, roll: 0 };
const CamContext = createContext<Cam>(REST);

/** The frame: clips the world and hands the camera to its Layers. */
export const StageView: React.FC<{ cam: Cam; children: React.ReactNode }> = ({ cam, children }) => (
  <AbsoluteFill style={{ overflow: 'hidden' }}>
    <CamContext.Provider value={cam}>{children}</CamContext.Provider>
  </AbsoluteFill>
);

/** A plane of the world at a depth (px toward the viewer), placed by the camera with a 2D matrix. */
export const Layer: React.FC<{ depth?: number; blur?: number; opacity?: number; style?: React.CSSProperties; children: React.ReactNode }> = ({
  depth = 0,
  blur = 0,
  opacity = 1,
  style,
  children,
}) => {
  const cam = useContext(CamContext);
  return (
    <div
      style={{
        position: 'absolute',
        left: 0,
        top: 0,
        width: 1920,
        height: 1080,
        ...planeStyle(cam, depth),
        filter: blur > 0.05 ? `blur(${blur.toFixed(2)}px)` : undefined,
        opacity,
        ...style,
      }}
    >
      {children}
    </div>
  );
};

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
