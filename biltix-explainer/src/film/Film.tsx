/**
 * BILTIX Risk AI — film v2 "One material" (FilmAR / FilmEN), 1920 × 1080, 30 fps, ≈ 3 min.
 *
 * Eighteen scenes, one per narration line (src/film/voice-timing.json from scripts/film-voice.mjs). Every scene
 * moves on every frame: AI footage (Veo via Higgsfield), real screens of the app (recordings from public/v2/ui when
 * present, else the captures under a live camera), the AI 360° panorama panned continuously, and kinetic diagrams
 * over a living backdrop. Scenes hand over with designed transitions (dip to light/dark, light-sweep wipe, whip pan
 * with motion trails, iris, push), each XFADE frames long. Screen-fixed on top: the HUD (wordmark, chapter rail,
 * Demo-data chip on S02–S12, roadmap tag on S13–S17) and burned-in captions timed to the voice. Audio: one clip per
 * line from the normalised narration; music is mixed afterwards (scripts/film-mix.mjs).
 */
import React from 'react';
import { AbsoluteFill, Html5Audio, Sequence, staticFile, useCurrentFrame, type CalculateMetadataFunction } from 'remotion';
import { waitForFonts } from '../fonts';
import { mix, prog } from '../lib/anim';
import { EASE, FONT, C } from '../theme';
import { captionChunks } from './captions';
import { COPY } from './copy';
import { Backdrop, Dust } from './fx';
import { Captions, FilmCtx, Hud, useFilm } from './kit';
import { S01, S02, S03, S04, S05, S06 } from './scenes-a';
import { S07, S08, S09, S10, S11, S12, s07Cut } from './scenes-b';
import { S13, S14, S15, S16, S17, S18 } from './scenes-c';
import { timeline, XFADE, type Lang, type SceneTiming } from './timeline';

waitForFonts();

export type FilmProps = { lang: Lang };

export const calculateFilmMetadata: CalculateMetadataFunction<FilmProps> = ({ props }) => ({
  durationInFrames: timeline(props.lang).total,
});

type SceneC = React.FC<{ s: SceneTiming }>;
const SCENES: SceneC[] = [S01, S02, S03, S04, S05, S06, S07, S08, S09, S10, S11, S12, S13, S14, S15, S16, S17, S18];

/** Transition INTO scene i. */
type Tr = 'cut' | 'dissolve' | 'dip' | 'whip' | 'iris' | 'sweep' | 'push';
const TR: Tr[] = ['cut', 'dip', 'sweep', 'whip', 'push', 'iris', 'whip', 'iris', 'sweep', 'push', 'whip', 'sweep', 'dip', 'iris', 'whip', 'sweep', 'whip', 'dip'];
/** Colour of the dip into scene i. */
const DIP: Record<number, string> = { 1: '#FFF8F0', 12: '#0B1A33', 17: '#05070B' };
/** Navy canvas (1) or light canvas (0) under each scene; S07 starts on footage (dark HUD) until its cut. */
const CANVAS = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1];
const CHAPTER = [0, 0, 0, 0, 0, 0, 1, 1, 2, 2, 2, 3, 4, 4, 4, 4, 4, 4];
const IRIS_AT: Record<number, [number, number]> = { 5: [960, 600], 7: [340, 420], 13: [360, 625] };

/** Scene wrapper: the incoming and outgoing halves of each transition. */
const Shell: React.FC<{ i: number; s: SceneTiming; last: boolean; children: React.ReactNode }> = ({ i, s, last, children }) => {
  const f = useCurrentFrame();
  const { rtl } = useFilm();
  const inT = i > 0 ? TR[i] : 'cut';
  const outT = last ? 'cut' : TR[i + 1];
  let style: React.CSSProperties = {};
  let ghost: { dx: number; o: number }[] = [];
  let overlay: React.ReactNode = null;
  let bg = false;
  const dir = rtl ? 1 : -1; // the way content travels on a forward whip
  if (i > 0 && f < XFADE) {
    const t = f / XFADE;
    const e = EASE.inOut(t);
    if (inT === 'dissolve') style = { opacity: e };
    if (inT === 'dip') style = { opacity: t < 0.5 ? 0 : EASE.out((t - 0.5) * 2) };
    if (inT === 'push') style = { opacity: e, transform: `scale(${mix(0.93, 1, e).toFixed(4)})` };
    if (inT === 'whip') {
      const x = -dir * 1920 * (1 - e);
      const v = (1920 * Math.abs(EASE.inOut(Math.min(1, t + 0.05)) - EASE.inOut(Math.max(0, t - 0.05)))) / (0.1 * XFADE);
      style = { transform: `translateX(${x.toFixed(1)}px)` };
      if (v > 20) ghost = [{ dx: x + dir * v * 0.45, o: 0.3 }, { dx: x + dir * v * 0.9, o: 0.14 }];
    }
    if (inT === 'iris') {
      const [cx, cy] = IRIS_AT[i] ?? [960, 540];
      const X = rtl ? 1920 - cx : cx;
      const R = mix(0, 1250, e);
      style = { clipPath: `circle(${R.toFixed(1)}px at ${X}px ${cy}px)` };
      bg = true;
      overlay = (
        <svg width={1920} height={1080} style={{ position: 'absolute', inset: 0 }}>
          <circle cx={X} cy={cy} r={R} fill="none" stroke="#FF8A2E" strokeWidth={7} opacity={0.85 * (1 - t * 0.6)} />
          <circle cx={X} cy={cy} r={R} fill="none" stroke="#FFE2C2" strokeWidth={2} opacity={1 - t * 0.6} />
        </svg>
      );
    }
    if (inT === 'sweep') {
      const edge = mix(rtl ? 1920 + 280 : -280, rtl ? -280 : 1920 + 280, e);
      style = { clipPath: rtl ? `polygon(${edge}px 0, 1920px 0, 1920px 1080px, ${edge + 220}px 1080px)` : `polygon(0 0, ${edge}px 0, ${edge - 220}px 1080px, 0 1080px)` };
      bg = true;
      overlay = (
        <div
          style={{
            position: 'absolute',
            top: -20,
            bottom: -20,
            left: (rtl ? edge + 110 : edge - 110) - 130,
            width: 260,
            background: 'linear-gradient(90deg, rgba(255,180,106,0) 0%, rgba(255,226,194,0.8) 42%, rgba(255,255,255,0.95) 50%, rgba(255,140,40,0.55) 60%, rgba(255,140,40,0) 100%)',
            transform: `skewX(${rtl ? 11.3 : -11.3}deg)`,
          }}
        />
      );
    }
  }
  if (!last && f >= s.frames) {
    const t = (f - s.frames) / XFADE;
    const e = EASE.inOut(t);
    if (outT === 'dissolve') style = { opacity: 1 - e };
    if (outT === 'dip') style = { opacity: t < 0.5 ? 1 : 0 };
    if (outT === 'push') style = { opacity: 1 - e, transform: `scale(${mix(1, 1.1, e).toFixed(4)})` };
    if (outT === 'iris' || outT === 'sweep') style = { transform: `scale(${mix(1, 1.05, e).toFixed(4)})` };
    if (outT === 'whip') {
      const x = dir * 1920 * e;
      const v = (1920 * Math.abs(EASE.inOut(Math.min(1, t + 0.05)) - EASE.inOut(Math.max(0, t - 0.05)))) / (0.1 * XFADE);
      style = { transform: `translateX(${x.toFixed(1)}px)` };
      if (v > 20) ghost = [{ dx: x - dir * v * 0.45, o: 0.3 }, { dx: x - dir * v * 0.9, o: 0.14 }];
    }
  }
  return (
    <>
      {ghost.map((g, k) => (
        <AbsoluteFill key={k} style={{ opacity: g.o, transform: `translateX(${g.dx.toFixed(1)}px)` }}>
          {children}
        </AbsoluteFill>
      ))}
      <AbsoluteFill style={style}>
        {bg && <Backdrop dark={CANVAS[i]} at={s.from + f} />}
        {children}
      </AbsoluteFill>
      {overlay}
    </>
  );
};

/** HUD state at a frame: canvas darkness, brand, Demo chip, roadmap tag, chapter. */
function hudAt(frame: number, sc: SceneTiming[], lang: Lang) {
  const last = sc.length - 1;
  let i = sc.findIndex((s) => frame >= s.from && frame < s.from + s.frames);
  if (i < 0) i = last;
  const darkOf = (k: number, local: number) => {
    if (k === 6) return 1 - prog(local, s07Cut(lang, sc[6]), 20, EASE.inOut);
    return CANVAS[k];
  };
  const local = frame - sc[i].from;
  let dark = darkOf(i, local);
  if (i > 0 && local < XFADE) dark = mix(darkOf(i - 1, local + sc[i - 1].frames), dark, EASE.inOut(local / XFADE));
  const brand = Math.min(prog(frame, sc[1].from + 4, 16, EASE.out), 1 - prog(frame, sc[last].from, XFADE, EASE.inOut));
  const demo = prog(frame, sc[1].from, XFADE, EASE.inOut) * (1 - prog(frame, sc[12].from, XFADE, EASE.inOut));
  const roadmap = prog(frame, sc[12].from + 4, 14, EASE.out) * (1 - prog(frame, sc[last].from, XFADE, EASE.inOut));
  const chapter = CHAPTER[i];
  let prev = chapter;
  for (let k = i; k >= 0; k -= 1) if (CHAPTER[k] !== chapter) { prev = CHAPTER[k]; break; }
  const firstOfChapter = sc.findIndex((_, k) => CHAPTER[k] === chapter);
  const blend = prog(frame, sc[firstOfChapter].from, 20, EASE.inOut);
  return { dark, brand, demo, roadmap, chapter, prev: blend >= 1 ? chapter : prev, blend: blend >= 1 ? 1 : blend };
}

export const Film: React.FC<FilmProps> = ({ lang }) => {
  const frame = useCurrentFrame();
  const rtl = lang === 'ar';
  const tl = timeline(lang);
  const sc = tl.scenes;
  const last = sc.length - 1;
  const h = hudAt(frame, sc, lang);
  // dips: a colour wash peaking at the middle of the transition into scenes listed in DIP
  const dips = Object.entries(DIP).map(([k, col]) => {
    const s = sc[Number(k)];
    const t = (frame - s.from) / XFADE;
    const o = t >= 0 && t < 1 ? 1 - Math.abs(2 * t - 1) : 0;
    return o > 0 ? <AbsoluteFill key={k} style={{ background: col === '#FFF8F0' ? 'radial-gradient(120% 120% at 50% 45%, #FFFFFF 0%, #FFF3E6 60%, #FFE2C2 100%)' : col, opacity: EASE.inOut(o) }} /> : null;
  });
  return (
    <FilmCtx.Provider value={{ lang, rtl, c: COPY[lang] }}>
      <AbsoluteFill
        dir={rtl ? 'rtl' : 'ltr'}
        lang={lang}
        style={{ fontFamily: rtl ? FONT.ar : FONT.en, color: C.ink, background: C.bg, WebkitFontSmoothing: 'antialiased', textRendering: 'geometricPrecision', overflow: 'hidden' }}
      >
        <Backdrop dark={h.dark > 0.5 && frame >= sc[12].from ? 1 : prog(frame, sc[12].from, XFADE, EASE.inOut)} />
        <Dust dark={frame >= sc[12].from + XFADE / 2 ? 1 : 0} />
        {sc.map((s, i) => {
          const Comp = SCENES[i];
          return (
            <Sequence key={i} from={s.from} durationInFrames={s.frames + (i === last ? 0 : XFADE)} name={`S${String(i + 1).padStart(2, '0')}`} layout="none">
              <Shell i={i} s={s} last={i === last}>
                <Comp s={s} />
              </Shell>
            </Sequence>
          );
        })}
        {dips}
        <AbsoluteFill style={{ pointerEvents: 'none', background: 'radial-gradient(1500px 980px at 50% 46%, rgba(19,34,56,0) 64%, rgba(19,34,56,0.08) 100%)' }} />
        <Hud brand={h.brand} dark={h.dark} chapter={h.chapter} chapterBlend={h.blend} prevChapter={h.prev} demo={h.demo} roadmap={h.roadmap} />
        {sc.map((s, i) => (
          <Sequence key={`c${i}`} from={s.from} durationInFrames={s.frames + (i === last ? 0 : XFADE)} name={`captions ${i + 1}`} layout="none">
            <Captions chunks={captionChunks(lang, s)} />
          </Sequence>
        ))}
        {sc.map((s, i) => (
          <Sequence key={`a${i}`} from={s.from + s.clipAt} durationInFrames={s.clipFrames} name={`voice ${i + 1}`} layout="none">
            <Html5Audio src={staticFile(tl.audio)} trimBefore={s.trimBefore} />
          </Sequence>
        ))}
      </AbsoluteFill>
    </FilmCtx.Provider>
  );
};
