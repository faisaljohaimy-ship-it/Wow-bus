import React from 'react';
import { useCurrentFrame } from 'remotion';
import { Check } from '../components/Bits';
import { Emblem } from '../components/Emblem';
import { MetalRing } from '../components/Metal';
import { Layer, Shot } from '../components/Stage';
import { COPY } from '../copy';
import type { SceneProps } from '../Explainer';
import { prog } from '../lib/anim';
import { polar } from '../lib/geom';
import { SHOTS } from '../shots';
import { STEPS } from '../storyboard';
import { C, EASE, FONT, STAGGER } from '../theme';

/**
 * The seven beats on one circle round the emblem: the story closes the loop.
 * The ring starts at the seal's on-screen size (camera far back), and the camera dollies in.
 */
const CTR = { x: 960, y: 500 };
const R = 288;

export const Outro: React.FC<SceneProps> = ({ lang, frames, matchIn, matchOut }) => {
  const f = useCurrentFrame();
  const rtl = lang === 'ar';
  const steps = STEPS[lang];
  const n = steps.length;
  const ang = (i: number) => -90 + (rtl ? -1 : 1) * (i * 360) / n;
  const lap = prog(f, 4, 50, EASE.inOut); // the comet's first lap lights the nodes in order
  const word = prog(f, 30, 24, EASE.expo);
  const sub = prog(f, 40, 22, EASE.out);
  return (
    <Shot frames={frames} rtl={rtl} matchIn={matchIn} matchOut={matchOut} last shots={SHOTS.outro}>
      <Layer>
        <MetalRing cx={CTR.x} cy={CTR.y} r={R} width={3} rtl={rtl} id="outro-ring" comet={{ phase: 0, speed: 2 * Math.PI * R / 50, len: 260, opacity: 1 - prog(f, 56, 20) }} />
        <svg width={1920} height={1080} style={{ position: 'absolute', inset: 0, overflow: 'visible' }}>
          {Array.from({ length: 72 }, (_, i) => {
            const a = -90 + i * 5;
            const major = i % 6 === 0;
            const p0 = polar(CTR.x, CTR.y, R - 12, a);
            const p1 = polar(CTR.x, CTR.y, R - (major ? 26 : 18), a);
            return <line key={i} x1={p0.x} y1={p0.y} x2={p1.x} y2={p1.y} stroke={major ? C.gold : C.border2} strokeOpacity={major ? 0.8 : 0.8} strokeWidth={major ? 1.6 : 1.1} />;
          })}
        </svg>
        {steps.map((s, i) => {
          const lit = prog(f, 4 + (50 * i) / n, 8, EASE.out) * (lap > 0 ? 1 : 0);
          const p = polar(CTR.x, CTR.y, R, ang(i));
          const lp = polar(CTR.x, CTR.y, R + 34, ang(i));
          const dx = lp.x - CTR.x;
          const align = Math.abs(dx) < 40 ? 'center' : dx > 0 ? 'left' : 'right';
          const tx = align === 'center' ? '-50%' : align === 'left' ? '0%' : '-100%';
          const ty = lp.y < CTR.y - R * 0.7 ? '-100%' : lp.y > CTR.y + R * 0.7 ? '0%' : '-50%';
          return (
            <React.Fragment key={s}>
              <div
                style={{
                  position: 'absolute',
                  left: p.x - 17,
                  top: p.y - 17,
                  width: 34,
                  height: 34,
                  borderRadius: 999,
                  background: lit > 0.5 ? C.primary : '#FFFFFF',
                  border: `2px solid ${C.primary}`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  boxShadow: `0 0 0 ${5 * lit}px rgba(47,111,237,0.14)`,
                }}
              >
                <Check size={20} p={lit} color="#FFFFFF" stroke={3} />
              </div>
              <div
                style={{
                  position: 'absolute',
                  left: lp.x,
                  top: lp.y,
                  transform: `translate(${tx}, ${ty})`,
                  display: 'flex',
                  alignItems: 'baseline',
                  gap: 8,
                  whiteSpace: 'nowrap',
                  opacity: prog(f, 10 + i * STAGGER * 2, 16, EASE.out),
                }}
              >
                <span style={{ fontFamily: FONT.mono, fontSize: 17, color: C.accentText }}>
                  <bdi dir="ltr">{String(i + 1).padStart(2, '0')}</bdi>
                </span>
                <span style={{ fontSize: 23, fontWeight: 600, color: C.ink }}>{s}</span>
              </div>
            </React.Fragment>
          );
        })}
        <div style={{ position: 'absolute', left: CTR.x - 70, top: CTR.y - 150 }}>
          <Emblem size={140} id="outro" />
        </div>
        <div style={{ position: 'absolute', left: 0, right: 0, top: CTR.y + 4, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <div dir="ltr" style={{ display: 'flex', alignItems: 'baseline', gap: 16, fontFamily: FONT.en, opacity: word, transform: `translateY(${(1 - word) * 10}px)` }}>
            <span style={{ fontSize: 58, fontWeight: 600, letterSpacing: '0.1em', color: C.ink }}>BILTIX</span>
            <span style={{ fontSize: 58, fontWeight: 300, color: C.ink2 }}>Risk AI</span>
          </div>
          <div style={{ marginTop: 10, fontSize: 24, color: C.ink2, opacity: sub }}>{COPY[lang].brandSub}</div>
        </div>
      </Layer>
    </Shot>
  );
};
