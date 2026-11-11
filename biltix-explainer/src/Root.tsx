import React from 'react';
import { Close, Open } from './bookends/Bookends';
import { BOOKEND_FRAMES, FPS as BK_FPS, HEIGHT as BK_H, WIDTH as BK_W } from './bookends/timing';
import { Composition } from 'remotion';
import { Explainer } from './Explainer';
import { calculateShowcaseMetadata, Showcase } from './showcase/Showcase';
import { FPS as SC_FPS, HEIGHT as SC_H, WIDTH as SC_W } from './showcase/timeline';
import { FPS, HEIGHT, TOTAL_FRAMES, WIDTH } from './storyboard';

export const RemotionRoot: React.FC = () => (
  <>
    {/* MVP film bookends (7.5 s, silent): cinematic open and close around the showcase; b-roll in public/broll/ */}
    <Composition id="OpenAR" component={Open} durationInFrames={BOOKEND_FRAMES} fps={BK_FPS} width={BK_W} height={BK_H} defaultProps={{ lang: 'ar' as const }} />
    <Composition id="OpenEN" component={Open} durationInFrames={BOOKEND_FRAMES} fps={BK_FPS} width={BK_W} height={BK_H} defaultProps={{ lang: 'en' as const }} />
    <Composition id="CloseAR" component={Close} durationInFrames={BOOKEND_FRAMES} fps={BK_FPS} width={BK_W} height={BK_H} defaultProps={{ lang: 'ar' as const }} />
    <Composition id="CloseEN" component={Close} durationInFrames={BOOKEND_FRAMES} fps={BK_FPS} width={BK_W} height={BK_H} defaultProps={{ lang: 'en' as const }} />
    <Composition
      id="ExplainerAR"
      component={Explainer}
      durationInFrames={TOTAL_FRAMES}
      fps={FPS}
      width={WIDTH}
      height={HEIGHT}
      defaultProps={{ lang: 'ar' as const }}
    />
    <Composition
      id="ExplainerEN"
      component={Explainer}
      durationInFrames={TOTAL_FRAMES}
      fps={FPS}
      width={WIDTH}
      height={HEIGHT}
      defaultProps={{ lang: 'en' as const }}
    />
    {/* MVP showcase: one scene per narration line; duration from src/showcase/voice-timing.json */}
    <Composition
      id="ShowcaseAR"
      component={Showcase}
      durationInFrames={2000}
      calculateMetadata={calculateShowcaseMetadata}
      fps={SC_FPS}
      width={SC_W}
      height={SC_H}
      defaultProps={{ lang: 'ar' as const }}
    />
    <Composition
      id="ShowcaseEN"
      component={Showcase}
      durationInFrames={2000}
      calculateMetadata={calculateShowcaseMetadata}
      fps={SC_FPS}
      width={SC_W}
      height={SC_H}
      defaultProps={{ lang: 'en' as const }}
    />
  </>
);
