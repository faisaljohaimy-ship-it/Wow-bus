import React from 'react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';
import { camera, prog, type CamKey } from '../lib/anim';
import { TRANSITION } from '../storyboard';
import { EASE } from '../theme';

/**
 * Wraps one scene: cross-fade in/out over TRANSITION frames, a hair of scale
 * on the hand-off, and a restrained camera (scale 1.00–1.06, eased pans).
 * Camera x is expressed toward the inline-end, so RTL mirrors it.
 */
export const SceneFrame: React.FC<{
  frames: number;
  rtl: boolean;
  cam?: CamKey[];
  first?: boolean;
  last?: boolean;
  children: React.ReactNode;
}> = ({ frames, rtl, cam, first, last, children }) => {
  const frame = useCurrentFrame();
  const fin = first ? 1 : prog(frame, 0, TRANSITION, EASE.inOut);
  const fout = last ? 1 : 1 - prog(frame, frames, TRANSITION, EASE.inOut);
  const hand = 1 + (1 - fin) * -0.012 + (1 - fout) * 0.014;
  const keys = (cam || [
    { f: 0, s: 1, x: 0, y: 0 },
    { f: frames + TRANSITION, s: 1.03, x: 0, y: 0 },
  ]).map((k) => ({ ...k, x: rtl ? -k.x : k.x }));
  return (
    <AbsoluteFill style={{ opacity: fin * fout }}>
      <AbsoluteFill style={{ transform: `scale(${hand})` }}>
        <AbsoluteFill style={camera(frame, keys)}>{children}</AbsoluteFill>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
