import React from 'react';
import { useCurrentFrame } from 'remotion';
import { Emblem } from '../components/Emblem';
import { MetalRing } from '../components/Metal';
import { Layer, Shot } from '../components/Stage';
import { COPY } from '../copy';
import type { SceneProps } from '../Explainer';
import { prog } from '../lib/anim';
import { SHOTS } from '../shots';
import { C, EASE, FONT } from '../theme';

/** Emblem at (960, EMBLEM_Y): the source scene's ingestion hub opens on the same screen spot (match cut). */
export const EMBLEM_Y = 370;
export const EMBLEM_SIZE = 210;
export const RING_R = 168;
/** Comet angular speed (laps per frame); the hub ring in the source scene runs at the same rate. */
export const COMET_LAPS = 15 / (2 * Math.PI * 168);

export const Intro: React.FC<SceneProps> = ({ lang, frames, matchIn, matchOut }) => {
  const f = useCurrentFrame();
  const rtl = lang === 'ar';
  const draw = prog(f, 2, 26, EASE.inOut);
  const build = prog(f, 12, 26, EASE.out);
  const notch = prog(f, 28, 14, EASE.expo);
  const ring = prog(f, 6, 40, EASE.inOut);
  const word = prog(f, 22, 26, EASE.expo);
  const line = prog(f, 32, 30, EASE.inOut);
  const sub = prog(f, 38, 22, EASE.out);
  return (
    <Shot frames={frames} rtl={rtl} matchIn={matchIn} matchOut={matchOut} first shots={SHOTS.intro}>
      {/* the dial ring sits a little behind the emblem plane */}
      <Layer depth={-60}>
        <MetalRing cx={960} cy={EMBLEM_Y} r={RING_R} width={2.5} rtl={rtl} id="intro-ring" draw={ring} opacity={0.9} comet={{ phase: 0.0, speed: 15, len: 220, opacity: prog(f, 30, 16) }} />
        <svg width={1920} height={1080} style={{ position: 'absolute', inset: 0 }}>
          {Array.from({ length: 60 }, (_, i) => {
            const a = (i / 60) * Math.PI * 2 - Math.PI / 2;
            const major = i % 5 === 0;
            const r0 = 186;
            const r1 = r0 + (major ? 14 : 7);
            const p = prog(f, 8 + i * 0.5, 14, EASE.out);
            return (
              <line
                key={i}
                x1={960 + r0 * Math.cos(a)}
                y1={EMBLEM_Y + r0 * Math.sin(a)}
                x2={960 + r1 * Math.cos(a)}
                y2={EMBLEM_Y + r1 * Math.sin(a)}
                stroke={major ? C.gold : C.border2}
                strokeOpacity={p * (major ? 0.8 : 0.9)}
                strokeWidth={major ? 1.6 : 1.2}
              />
            );
          })}
        </svg>
      </Layer>
      <Layer>
        <div style={{ position: 'absolute', left: 960 - EMBLEM_SIZE / 2, top: EMBLEM_Y - EMBLEM_SIZE / 2, filter: `drop-shadow(0 14px 26px rgba(19,34,56,${0.16 * notch}))` }}>
          <Emblem size={EMBLEM_SIZE} draw={draw} build={build} notch={notch} id="intro" />
        </div>
      </Layer>
      <Layer depth={30}>
        <div style={{ position: 'absolute', left: 0, right: 0, top: 572, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <div dir="ltr" style={{ display: 'flex', alignItems: 'baseline', gap: 22, fontFamily: FONT.en, opacity: word, transform: `translateY(${(1 - word) * 14}px)` }}>
            <span style={{ fontSize: 80, fontWeight: 600, letterSpacing: `${0.15 - 0.05 * word}em`, color: C.ink }}>BILTIX</span>
            <span style={{ fontSize: 80, fontWeight: 300, color: C.ink2 }}>Risk AI</span>
          </div>
          <div style={{ marginTop: 16, width: 360 * line, height: 2, background: `linear-gradient(90deg, rgba(184,134,11,0), ${C.gold}, rgba(184,134,11,0))` }} />
          <div style={{ marginTop: 18, fontSize: 30, fontWeight: 400, color: C.ink2, opacity: sub, transform: `translateY(${(1 - sub) * 10}px)` }}>{COPY[lang].brandSub}</div>
        </div>
      </Layer>
    </Shot>
  );
};
