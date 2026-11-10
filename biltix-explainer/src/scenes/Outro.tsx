import React from 'react';
import { useCurrentFrame } from 'remotion';
import { Check } from '../components/Bits';
import { Emblem } from '../components/Emblem';
import { SceneFrame } from '../components/SceneFrame';
import { COPY } from '../copy';
import type { SceneProps } from '../Explainer';
import { enter, prog } from '../lib/anim';
import { STEPS } from '../storyboard';
import { C, EASE, FONT, STAGGER } from '../theme';

export const Outro: React.FC<SceneProps> = ({ lang, frames }) => {
  const f = useCurrentFrame();
  const rtl = lang === 'ar';
  const line = prog(f, 16, 30, EASE.inOut);
  return (
    <SceneFrame frames={frames} rtl={rtl} last cam={[{ f: 0, s: 1.03, x: 0, y: 0 }, { f: frames, s: 1.0, x: 0, y: 0 }]}>
      <div style={{ position: 'absolute', left: 0, right: 0, top: 262, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <div style={{ ...enter(f, 2, 22, 10), filter: 'drop-shadow(0 0 24px rgba(47,111,237,0.3))' }}>
          <Emblem size={150} id="outro" />
        </div>
        <div dir="ltr" style={{ marginTop: 26, display: 'flex', alignItems: 'baseline', gap: 18, fontFamily: FONT.en, ...enter(f, 6, 22, 10) }}>
          <span style={{ fontSize: 76, fontWeight: 600, letterSpacing: '0.1em', color: C.ink }}>BILTIX</span>
          <span style={{ fontSize: 76, fontWeight: 300, color: C.ink2 }}>Risk AI</span>
        </div>
        <div style={{ marginTop: 18, width: 320 * line, height: 1, background: `linear-gradient(90deg, rgba(212,160,23,0), ${C.gold}, rgba(212,160,23,0))` }} />
        <div style={{ marginTop: 20, fontSize: 28, color: C.ink2, ...enter(f, 10, 22, 8) }}>{COPY[lang].brandSub}</div>
        <div style={{ marginTop: 46, display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'nowrap' }}>
          {STEPS[lang].map((s, i) => (
            <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 14, ...enter(f, 14 + i * STAGGER, 18, 8) }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 19, color: C.ink2, whiteSpace: 'nowrap' }}>
                <span style={{ width: 20, height: 20, borderRadius: 999, background: 'rgba(47,111,237,0.25)', border: `1px solid ${C.primary}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Check size={14} color={C.ink} stroke={3} />
                </span>
                {s}
              </span>
              {i < STEPS[lang].length - 1 && <span style={{ width: 22, height: 1, background: C.border }} />}
            </div>
          ))}
        </div>
      </div>
    </SceneFrame>
  );
};
