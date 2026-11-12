/**
 * BILTIX Risk AI — MVP showcase (ShowcaseAR / ShowcaseEN), 1920 × 1080, 30 fps.
 *
 * Thirteen scenes, one per narration line (src/showcase/voice-timing.json from scripts/showcase-voice.mjs).
 * Each scene cross-dissolves into the next over XFADE frames. Screen-fixed on top: a soft top band with the
 * wordmark (inline-start) and the Demo-data chip (inline-end, every frame), and the lower third: the scene
 * title and the caption of the line, on a plate, timed to the voice. Audio: one clip per line from the
 * normalised narration (public/voice/showcase-<lang>.norm.wav), placed 0.35 s into its scene; the clip ends
 * lie inside the gated silence, so cuts are click-free.
 */
import React from 'react';
import { AbsoluteFill, Html5Audio, Sequence, staticFile, useCurrentFrame, type CalculateMetadataFunction } from 'remotion';
import { Emblem } from '../components/Emblem';
import { waitForFonts } from '../fonts';
import { prog } from '../lib/anim';
import { C, EASE, FONT, METAL } from '../theme';
import { widthCheck } from './captures';
import { CAPTIONS, T, TITLES } from './copy';
import type { SceneProps } from './kit';
import { S1Brand, S2Bilingual, S3Cockpit, S4Gauges, S5Explain, S6Approve } from './scenes-a';
import { S10Design, S11Quality, S12Honesty, S13Close, S7Spatial, S8Sources, S9Mosaic } from './scenes-b';
import { timeline, XFADE, type Lang } from './timeline';
import { Backdrop, Vignette } from './ui';

waitForFonts();

/** `node biltix-hse/tests/run.mjs` on this tree: "104 passed, 0 failed (18 files)". */
export const TESTS_PASSED = 104;

export type ShowcaseProps = { lang: Lang };

export const calculateShowcaseMetadata: CalculateMetadataFunction<ShowcaseProps> = ({ props }) => ({
  durationInFrames: timeline(props.lang).total,
});

const Quality: React.FC<SceneProps> = (p) => {
  const wc = widthCheck();
  return <S11Quality {...p} tests={TESTS_PASSED} widths={wc ? wc.widths.length : 6} noOverflow={!!wc && wc.overflow.length === 0 && wc.checked > 0} />;
};
const SCENES: Array<React.FC<SceneProps>> = [S1Brand, S2Bilingual, S3Cockpit, S4Gauges, S5Explain, S6Approve, S7Spatial, S8Sources, S9Mosaic, S10Design, Quality, S12Honesty, S13Close];

/** Scene wrapper: dissolve in over XFADE (not the first), dissolve out over XFADE past its end (not the last). */
const Fade: React.FC<{ frames: number; first: boolean; last: boolean; children: React.ReactNode }> = ({ frames, first, last, children }) => {
  const f = useCurrentFrame();
  const fin = first ? 1 : prog(f, 0, XFADE, EASE.inOut);
  const fout = last ? 1 : 1 - prog(f, frames, XFADE, EASE.inOut);
  return <AbsoluteFill style={{ opacity: fin * fout }}>{children}</AbsoluteFill>;
};

/** Top band, wordmark, Demo-data chip. */
const Hud: React.FC<{ lang: Lang; brand: number }> = ({ lang, brand }) => (
  <AbsoluteFill style={{ pointerEvents: 'none' }}>
    <div style={{ position: 'absolute', left: 0, right: 0, top: 0, height: 140, background: 'linear-gradient(180deg, rgba(244,247,251,0.95) 0px, rgba(244,247,251,0.88) 70px, rgba(244,247,251,0) 140px)', opacity: Math.max(brand, 0.0) }} />
    <div style={{ position: 'absolute', top: 38, insetInlineStart: 72, opacity: brand }}>
      <div dir="ltr" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <Emblem size={42} id="hud" />
        <span style={{ fontFamily: FONT.en, fontSize: 26, fontWeight: 650, letterSpacing: '0.09em', color: C.ink }}>BILTIX</span>
        <span style={{ fontFamily: FONT.en, fontSize: 26, fontWeight: 400, color: C.ink2 }}>Risk AI</span>
      </div>
    </div>
    <div
      style={{
        position: 'absolute',
        top: 40,
        insetInlineEnd: 72,
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '8px 18px',
        borderRadius: 999,
        border: `1px solid ${C.border}`,
        background: '#FFFFFF',
        boxShadow: '0 1px 2px rgba(19,34,56,0.06)',
        color: C.ink2,
        fontSize: 21,
        fontWeight: 500,
      }}
    >
      <span style={{ width: 9, height: 9, borderRadius: 2, background: C.gold, transform: 'rotate(45deg)' }} />
      {T[lang].demo}
    </div>
  </AbsoluteFill>
);

/** Lower third: scene title + the narration line, on a plate with a metal accent bar; timed to the voice. */
const LowerThird: React.FC<{ lang: Lang; index: number; from: number; to: number }> = ({ lang, index, from, to }) => {
  const f = useCurrentFrame();
  const pin = prog(f, from - 6, 10, EASE.out);
  const pout = 1 - prog(f, to + 12, 10, EASE.inOut);
  const o = Math.min(pin, pout);
  if (o <= 0) return null;
  const title = TITLES[lang][index];
  const rtl = lang === 'ar';
  return (
    <div style={{ position: 'absolute', bottom: 52, insetInlineStart: 96, maxWidth: 1360, opacity: o, transform: `translateY(${(1 - pin) * 12}px)` }}>
      <div
        style={{
          position: 'relative',
          padding: rtl ? '16px 34px 20px 34px' : '16px 34px 19px 34px',
          paddingInlineStart: 40,
          borderRadius: 18,
          background: 'rgba(255,255,255,0.96)',
          border: `1px solid ${C.border}`,
          boxShadow: '0 2px 4px rgba(19,34,56,0.06), 0 22px 44px -22px rgba(19,34,56,0.38)',
          overflow: 'hidden',
        }}
      >
        <span style={{ position: 'absolute', top: 0, bottom: 0, insetInlineStart: 0, width: 6, background: METAL }} />
        {title && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 22, fontWeight: 600, color: C.accentText, marginBottom: 6 }}>
            <bdi dir="ltr" style={{ fontFamily: FONT.mono, fontSize: 19, fontWeight: 500 }}>{`${String(index + 1).padStart(2, '0')} / 13`}</bdi>
            <span style={{ width: 5, height: 5, borderRadius: 99, background: C.border2 }} />
            <span>{title}</span>
          </div>
        )}
        <div style={{ fontSize: 40, fontWeight: 500, color: C.ink, lineHeight: rtl ? 1.55 : 1.38, textAlign: 'start' }}>{CAPTIONS[lang][index]}</div>
      </div>
    </div>
  );
};

export const Showcase: React.FC<ShowcaseProps> = ({ lang }) => {
  const frame = useCurrentFrame();
  const rtl = lang === 'ar';
  const tl = timeline(lang);
  const sc = tl.scenes;
  const last = sc.length - 1;
  // wordmark in the HUD: hidden during the two brand scenes
  const brand = Math.min(prog(frame, sc[1].from, 16, EASE.out), 1 - prog(frame, sc[last].from, XFADE, EASE.inOut));
  return (
    <AbsoluteFill
      dir={rtl ? 'rtl' : 'ltr'}
      lang={lang}
      style={{ fontFamily: rtl ? FONT.ar : FONT.en, color: C.ink, background: C.bg, WebkitFontSmoothing: 'antialiased', textRendering: 'geometricPrecision' }}
    >
      <Backdrop />
      {sc.map((s, i) => {
        const Comp = SCENES[i];
        return (
          <Sequence key={i} from={s.from} durationInFrames={s.frames + (i === last ? 0 : XFADE)} name={`s${i + 1}`} layout="none">
            <Fade frames={s.frames} first={i === 0} last={i === last}>
              <Comp lang={lang} t={s} />
            </Fade>
          </Sequence>
        );
      })}
      <Vignette />
      <Hud lang={lang} brand={brand} />
      {sc.map((s, i) => (
        <Sequence key={`c${i}`} from={s.from} durationInFrames={s.frames + (i === last ? 0 : XFADE)} name={`caption ${i + 1}`} layout="none">
          <LowerThird lang={lang} index={i} from={s.voiceFrom} to={s.voiceTo} />
        </Sequence>
      ))}
      {sc.map((s, i) => (
        <Sequence key={`a${i}`} from={s.from + s.clipAt} durationInFrames={s.clipFrames} name={`voice ${i + 1}`} layout="none">
          <Html5Audio src={staticFile(tl.audio)} trimBefore={s.trimBefore} />
        </Sequence>
      ))}
    </AbsoluteFill>
  );
};
