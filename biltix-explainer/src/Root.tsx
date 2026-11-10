import React from 'react';
import { Composition } from 'remotion';
import { Explainer } from './Explainer';
import { FPS, HEIGHT, TOTAL_FRAMES, WIDTH } from './storyboard';

export const RemotionRoot: React.FC = () => (
  <>
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
  </>
);
