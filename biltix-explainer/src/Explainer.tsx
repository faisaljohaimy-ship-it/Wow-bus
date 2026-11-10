import React from 'react';
import { AbsoluteFill, Sequence, useCurrentFrame } from 'remotion';
import { Background, CaptionBand, StepRail, TopBar } from './components/Chrome';
import { waitForFonts } from './fonts';
import { Analyze } from './scenes/Analyze';
import { Approve } from './scenes/Approve';
import { Close } from './scenes/Close';
import { Explain } from './scenes/Explain';
import { Intro } from './scenes/Intro';
import { Mitigate } from './scenes/Mitigate';
import { Outro } from './scenes/Outro';
import { Source } from './scenes/Source';
import { Validate } from './scenes/Validate';
import { SCENES, TRANSITION, type Lang, type SceneId } from './storyboard';
import { C, FONT } from './theme';

waitForFonts();

export type SceneProps = { lang: Lang; frames: number };

const SCENE_COMPONENTS: Record<SceneId, React.FC<SceneProps>> = {
  intro: Intro,
  source: Source,
  validate: Validate,
  analyze: Analyze,
  explain: Explain,
  approve: Approve,
  mitigate: Mitigate,
  close: Close,
  outro: Outro,
};

export const Explainer: React.FC<{ lang: Lang }> = ({ lang }) => {
  const frame = useCurrentFrame();
  const rtl = lang === 'ar';
  let from = 0;
  return (
    <AbsoluteFill
      dir={rtl ? 'rtl' : 'ltr'}
      lang={lang}
      style={{
        fontFamily: rtl ? FONT.ar : FONT.en,
        color: C.ink,
        background: C.bg,
        WebkitFontSmoothing: 'antialiased',
        textRendering: 'geometricPrecision',
      }}
    >
      <Background drift={frame * 0.12} />
      {SCENES.map((s, i) => {
        const Comp = SCENE_COMPONENTS[s.id];
        const last = i === SCENES.length - 1;
        const seq = (
          <Sequence key={s.id} from={from} durationInFrames={s.frames + (last ? 0 : TRANSITION)} name={s.id} layout="none">
            <Comp lang={lang} frames={s.frames} />
          </Sequence>
        );
        from += s.frames;
        return seq;
      })}
      <TopBar lang={lang} frame={frame} />
      <StepRail lang={lang} />
      <CaptionBand lang={lang} />
    </AbsoluteFill>
  );
};
