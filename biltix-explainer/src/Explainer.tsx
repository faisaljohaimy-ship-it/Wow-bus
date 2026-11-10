import React from 'react';
import { AbsoluteFill, Sequence, useCurrentFrame } from 'remotion';
import { BackgroundPlate, CaptionBand, HudBands, TopBar, Vignette } from './components/Chrome';
import { Layer, StageView } from './components/Stage';
import { waitForFonts } from './fonts';
import { prog } from './lib/anim';
import { camAt, mirrorShot, mixCam, type Cam } from './lib/camera';
import { Analyze } from './scenes/Analyze';
import { Approve } from './scenes/Approve';
import { Close } from './scenes/Close';
import { Explain } from './scenes/Explain';
import { Intro } from './scenes/Intro';
import { Mitigate } from './scenes/Mitigate';
import { Outro } from './scenes/Outro';
import { SiteCam } from './scenes/SiteCam';
import { Source } from './scenes/Source';
import { Validate } from './scenes/Validate';
import { SHOTS } from './shots';
import { SCENES, sceneSpan, sceneStart, TRANSITION, type Lang, type SceneId } from './storyboard';
import { C, EASE, FONT } from './theme';

waitForFonts();

export type SceneProps = { lang: Lang; frames: number; cutIn?: boolean; cutOut?: boolean; matchIn?: boolean; matchOut?: boolean };

const SCENE_COMPONENTS: Record<SceneId, React.FC<SceneProps>> = {
  intro: Intro,
  source: Source,
  validate: Validate,
  analyze: Analyze,
  explain: Explain,
  sitecam: SiteCam,
  approve: Approve,
  mitigate: Mitigate,
  close: Close,
  outro: Outro,
};

/** The camera the background plate follows: the active scene's, blended through each dissolve. */
function plateCam(frame: number, rtl: boolean): Cam {
  let start = 0;
  let prevStart = 0;
  for (let i = 0; i < SCENES.length; i += 1) {
    const s = SCENES[i];
    const end = start + s.frames;
    if (frame < end || i === SCENES.length - 1) {
      const cam = camAt(frame - start, SHOTS[s.id].map((k) => mirrorShot(k, rtl)));
      if (i > 0 && !s.cut && frame < start + TRANSITION) {
        const prev = camAt(frame - prevStart, SHOTS[SCENES[i - 1].id].map((k) => mirrorShot(k, rtl)));
        return mixCam(prev, cam, prog(frame, start, TRANSITION, EASE.inOut));
      }
      return cam;
    }
    prevStart = start;
    start = end;
  }
  return { x: 960, y: 540, z: 0, yaw: 0, pitch: 0, roll: 0 };
}

/**
 * The light HUD (top bar + bands) steps aside while the dark simulated feed fills the frame after the
 * hard cut, and returns as the camera pulls back to the viewer.
 */
const CAM_AT = sceneStart('sitecam');
const CAM_LEN = SCENES.find((s) => s.id === 'sitecam')!.frames;
function hudVisible(frame: number): number {
  if (frame < CAM_AT || frame >= CAM_AT + CAM_LEN) return 1;
  return prog(frame, CAM_AT + 30, 22, EASE.out);
}

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
      {/* far plate: grid + ambient light, 800 px behind the action plane (parallax) */}
      <StageView cam={plateCam(frame, rtl)}>
        <Layer depth={-800}>
          <BackgroundPlate />
        </Layer>
      </StageView>
      {SCENES.map((s, i) => {
        const Comp = SCENE_COMPONENTS[s.id];
        const next = SCENES[i + 1];
        const seq = (
          <Sequence key={s.id} from={from} durationInFrames={sceneSpan(i)} name={s.id} layout="none">
            <Comp lang={lang} frames={s.frames} cutIn={!!s.cut} cutOut={!!next?.cut} matchIn={!!s.match} matchOut={!!next?.match} />
          </Sequence>
        );
        from += s.frames;
        return seq;
      })}
      <Vignette />
      <HudBands opacity={hudVisible(frame)} />
      <TopBar lang={lang} visible={hudVisible(frame)} />
      <CaptionBand lang={lang} />
    </AbsoluteFill>
  );
};
