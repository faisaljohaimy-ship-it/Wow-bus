import React from 'react';
import { useCurrentFrame } from 'remotion';
import { Emblem } from '../components/Emblem';
import { SceneFrame } from '../components/SceneFrame';
import { COPY } from '../copy';
import type { SceneProps } from '../Explainer';
import { prog } from '../lib/anim';
import { C, EASE, FONT } from '../theme';

export const Intro: React.FC<SceneProps> = ({ lang, frames }) => {
  const f = useCurrentFrame();
  const draw = prog(f, 2, 26, EASE.inOut);
  const build = prog(f, 12, 26, EASE.out);
  const notch = prog(f, 28, 14, EASE.expo);
  const word = prog(f, 20, 26, EASE.expo);
  const line = prog(f, 32, 30, EASE.inOut);
  const sub = prog(f, 38, 22, EASE.out);
  return (
    <SceneFrame frames={frames} rtl={lang === 'ar'} first cam={[{ f: 0, s: 1, x: 0, y: 0 }, { f: frames + 15, s: 1.035, x: 0, y: -6 }]}>
      <div style={{ position: 'absolute', left: 0, right: 0, top: 250, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <div style={{ filter: `drop-shadow(0 0 ${28 * notch}px rgba(47,111,237,0.35))` }}>
          <Emblem size={200} draw={draw} build={build} notch={notch} id="intro" />
        </div>
        <div
          dir="ltr"
          style={{
            marginTop: 34,
            display: 'flex',
            alignItems: 'baseline',
            gap: 22,
            fontFamily: FONT.en,
            opacity: word,
            transform: `translateY(${(1 - word) * 14}px)`,
          }}
        >
          <span style={{ fontSize: 92, fontWeight: 600, letterSpacing: `${0.16 - 0.06 * word}em`, color: C.ink }}>BILTIX</span>
          <span style={{ fontSize: 92, fontWeight: 300, color: C.ink2 }}>Risk AI</span>
        </div>
        <div style={{ marginTop: 22, width: 360 * line, height: 1, background: `linear-gradient(90deg, rgba(212,160,23,0), ${C.gold}, rgba(212,160,23,0))` }} />
        <div style={{ marginTop: 24, fontSize: 32, fontWeight: 400, color: C.ink2, opacity: sub, transform: `translateY(${(1 - sub) * 10}px)` }}>
          {COPY[lang].brandSub}
        </div>
      </div>
    </SceneFrame>
  );
};
