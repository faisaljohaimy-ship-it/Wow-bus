/**
 * Persistent frame chrome (light theme): the background plate (ambient light + subtle BILTIX
 * engineering grid + identity mark) on a far layer of the camera, and the screen-fixed HUD —
 * top bar (brand, circular 7-beat step dial, demo-data label) and the caption band.
 * The HUD never moves with the camera, so text there is always steady.
 */
import React from 'react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';
import { COPY } from '../copy';
import { DATA } from '../data';
import { prog } from '../lib/anim';
import { arcPath } from '../lib/geom';
import { CAPTION_FADE, CAPTIONS, captionCues, fillCaption, SCENES, STEPS, type Lang } from '../storyboard';
import { C, EASE, FONT } from '../theme';
import { Emblem } from './Emblem';

/* ── background plate: drawn in world space, placed on a far layer (depth −800) by Explainer ── */
const CELL = 160;
export const BackgroundPlate: React.FC = () => {
  // A 4000 × 2400 plate centred on the world, so it covers the frame at every dolly position.
  const W = 4000;
  const H = 2400;
  const ox = -(W - 1920) / 2;
  const oy = -(H - 1080) / 2;
  const cross = 9;
  return (
    <div style={{ position: 'absolute', left: ox, top: oy, width: W, height: H, background: C.bg }}>
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background:
            'radial-gradient(1100px 700px at 34% 30%, rgba(47,111,237,0.075), rgba(47,111,237,0) 70%), radial-gradient(900px 560px at 70% 38%, rgba(14,147,172,0.06), rgba(14,147,172,0) 70%)',
        }}
      />
      <svg width={W} height={H} style={{ position: 'absolute', inset: 0 }}>
        <defs>
          <pattern id="bg-cell" width={CELL} height={CELL} patternUnits="userSpaceOnUse" x={(-ox) % CELL} y={(-oy) % CELL}>
            <path d={`M 0 0.5 H ${CELL} M 0.5 0 V ${CELL}`} fill="none" stroke={C.grid} strokeOpacity={0.032} strokeWidth={1} />
            <path
              d={`M 0 0.5 h ${cross} M ${CELL - cross} 0.5 h ${cross} M 0.5 0 v ${cross} M 0.5 ${CELL - cross} v ${cross}`}
              fill="none"
              stroke={C.grid}
              strokeOpacity={0.075}
              strokeWidth={1.5}
            />
            <path d={`M ${CELL / 2} ${CELL / 2 - 2} v 4 M ${CELL / 2 - 2} ${CELL / 2} h 4`} fill="none" stroke={C.grid} strokeOpacity={0.05} strokeWidth={1} />
          </pattern>
          <radialGradient id="bg-fade" cx="50%" cy="30%" r="62%">
            <stop offset="0%" stopColor="#FFFFFF" stopOpacity={1} />
            <stop offset="100%" stopColor="#FFFFFF" stopOpacity={0.35} />
          </radialGradient>
          <mask id="bg-mask">
            <rect width={W} height={H} fill="url(#bg-fade)" />
          </mask>
        </defs>
        <rect width={W} height={H} fill="url(#bg-cell)" mask="url(#bg-mask)" />
      </svg>
    </div>
  );
};

/* ── screen-fixed lens vignette: a hair of depth at the frame edges ── */
export const Vignette: React.FC = () => (
  <AbsoluteFill style={{ pointerEvents: 'none', background: 'radial-gradient(1500px 980px at 50% 46%, rgba(19,34,56,0) 62%, rgba(19,34,56,0.075) 100%)' }} />
);

/**
 * HUD bands: the top bar and the caption sit on soft fades of the app plane, so a card the camera
 * carries under them dims instead of colliding with the HUD text.
 */
export const HudBands: React.FC<{ opacity: number }> = ({ opacity }) => (
  <AbsoluteFill style={{ pointerEvents: 'none', opacity }}>
    <div style={{ position: 'absolute', left: 0, right: 0, top: 0, height: 150, background: 'linear-gradient(180deg, rgba(244,247,251,0.97) 0px, rgba(244,247,251,0.92) 92px, rgba(244,247,251,0) 150px)' }} />
    <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 190, background: 'linear-gradient(0deg, rgba(244,247,251,0.9) 0px, rgba(244,247,251,0.55) 96px, rgba(244,247,251,0) 190px)' }} />
  </AbsoluteFill>
);

/* ── code chip: Latin, monospace, never breaks ── */
export const Code: React.FC<{ children: React.ReactNode; size?: number; color?: string; style?: React.CSSProperties }> = ({
  children,
  size = 22,
  color = C.accentText,
  style,
}) => (
  <bdi
    dir="ltr"
    style={{ fontFamily: FONT.mono, fontSize: size, fontWeight: 500, color, whiteSpace: 'nowrap', letterSpacing: '0.01em', unicodeBidi: 'isolate', ...style }}
  >
    {children}
  </bdi>
);

/* ── numbers: Plex Sans tabular figures (mono on request), isolated for RTL ── */
export const Num: React.FC<{ children: React.ReactNode; size: number; weight?: number; color?: string; mono?: boolean; style?: React.CSSProperties }> = ({
  children,
  size,
  weight = 500,
  color = C.ink,
  mono = false,
  style,
}) => (
  <bdi
    dir="ltr"
    style={{
      fontFamily: mono ? FONT.mono : FONT.en,
      fontSize: size,
      fontWeight: weight,
      color,
      whiteSpace: 'nowrap',
      fontVariantNumeric: 'tabular-nums',
      letterSpacing: mono ? '0' : '-0.01em',
      unicodeBidi: 'isolate',
      ...style,
    }}
  >
    {children}
  </bdi>
);

export const Eyebrow: React.FC<{ children: React.ReactNode; color?: string; style?: React.CSSProperties }> = ({ children, color = C.ink3, style }) => (
  <div style={{ fontSize: 21, fontWeight: 500, color, letterSpacing: '0.01em', ...style }}>{children}</div>
);

/* ── rating badge: colour is never alone, the label is always printed ── */
export const RatingBadge: React.FC<{ color: string; textColor?: string; label: string; size?: number; style?: React.CSSProperties }> = ({
  color,
  textColor = C.ink,
  label,
  size = 22,
  style,
}) => (
  <span
    style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: 10,
      padding: `${size * 0.26}px ${size * 0.62}px`,
      borderRadius: 999,
      background: `${color}1A`,
      border: `1px solid ${color}99`,
      color: textColor,
      fontSize: size,
      fontWeight: 600,
      whiteSpace: 'nowrap',
    }}
  >
    <span style={{ width: size * 0.45, height: size * 0.45, borderRadius: 999, background: color, boxShadow: `0 0 0 3px ${color}26` }} />
    <span style={style}>{label}</span>
  </span>
);

/** Dashed tag for demo / illustrative / simulated values (same idea as the app's tags). */
export const Tag: React.FC<{ children: React.ReactNode; size?: number; color?: string; style?: React.CSSProperties }> = ({ children, size = 16, color = C.ink3, style }) => (
  <span
    style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: 6,
      fontSize: size,
      lineHeight: 1.2,
      fontWeight: 500,
      color,
      padding: '3px 10px',
      borderRadius: 999,
      border: `1px dashed ${color}`,
      background: '#FFFFFF',
      whiteSpace: 'nowrap',
      ...style,
    }}
  >
    {children}
  </span>
);

/* ── circular 7-beat step dial (top bar) ── */
const StepDial: React.FC<{ lang: Lang }> = ({ lang }) => {
  const frame = useCurrentFrame();
  const rtl = lang === 'ar';
  let f0 = 0;
  let pos = -1;
  let fadeIn = 0;
  let fadeOut = 1;
  let stepStart = 0;
  for (const s of SCENES) {
    if (s.id === 'intro') fadeIn = prog(frame, f0 + s.frames - 16, 22, EASE.out);
    if (s.id === 'outro') fadeOut = 1 - prog(frame, f0 - 4, 18, EASE.inOut);
    if (frame >= f0 + (s.cut ? 0 : 6) && s.step !== null && s.step !== pos) {
      pos = s.step;
      stepStart = f0 + (s.cut ? 0 : 6);
    }
    f0 += s.frames;
  }
  const o = fadeIn * fadeOut;
  if (o <= 0.01 || pos < 0) return null;
  const turn = prog(frame, stepStart, 20, EASE.inOut); // the current segment fills
  const labelIn = prog(frame, stepStart, 14, EASE.out);
  const R = 19;
  const size = 52;
  const c = size / 2;
  const segDeg = 360 / 7;
  const gap = 7;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 16, opacity: o }}>
      <svg width={size} height={size} style={{ display: 'block', transform: rtl ? 'scaleX(-1)' : undefined }}>
        {Array.from({ length: 7 }, (_, i) => {
          const a0 = -90 + i * segDeg + gap / 2;
          const a1 = -90 + (i + 1) * segDeg - gap / 2;
          const done = i < pos;
          const cur = i === pos;
          return (
            <g key={i}>
              <path d={arcPath(c, c, R, a0, a1)} fill="none" stroke={C.border2} strokeWidth={5} strokeLinecap="round" />
              {(done || cur) && (
                <path
                  d={arcPath(c, c, R, a0, cur ? a0 + (a1 - a0) * turn : a1)}
                  fill="none"
                  stroke={cur ? C.accent : C.primary}
                  strokeWidth={5}
                  strokeLinecap="round"
                />
              )}
            </g>
          );
        })}
      </svg>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, opacity: labelIn, transform: `translateY(${(1 - labelIn) * 6}px)`, whiteSpace: 'nowrap' }}>
        <span style={{ fontFamily: FONT.mono, fontSize: 19, color: C.accentText, fontWeight: 500 }}>
          <bdi dir="ltr">{`${String(pos + 1).padStart(2, '0')} / 07`}</bdi>
        </span>
        <span style={{ fontSize: 24, fontWeight: 600, color: C.ink }}>{STEPS[lang][pos]}</span>
      </div>
    </div>
  );
};

/* ── top bar ── */
export const TopBar: React.FC<{ lang: Lang; visible?: number }> = ({ lang, visible = 1 }) => {
  const frame = useCurrentFrame();
  const p = prog(frame, 60, 22, EASE.out) * visible;
  const t = COPY[lang];
  return (
    <div style={{ position: 'absolute', top: 34, insetInlineStart: 96, insetInlineEnd: 96, height: 64, opacity: p }}>
      <div style={{ position: 'absolute', top: 6, insetInlineStart: 0 }}>
        <div dir="ltr" style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <Emblem size={46} id="tb" />
          <span style={{ fontFamily: FONT.en, fontSize: 27, fontWeight: 600, letterSpacing: '0.1em', color: C.ink }}>BILTIX</span>
          <span style={{ fontFamily: FONT.en, fontSize: 27, fontWeight: 400, color: C.ink2 }}>Risk AI</span>
        </div>
      </div>
      <div style={{ position: 'absolute', top: 6, left: 0, right: 0, display: 'flex', justifyContent: 'center' }}>
        <StepDial lang={lang} />
      </div>
      <div
        style={{
          position: 'absolute',
          top: 10,
          insetInlineEnd: 0,
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
        {t.demo}
      </div>
    </div>
  );
};

/* ── caption band: one cue per scene, timings shared with the .vtt files ── */
export const CaptionBand: React.FC<{ lang: Lang }> = ({ lang }) => {
  const frame = useCurrentFrame();
  const cue = captionCues().find((c) => frame >= c.from && frame < c.to);
  if (!cue) return null;
  const pin = prog(frame, cue.from, CAPTION_FADE, EASE.out);
  const pout = 1 - prog(frame, cue.to - CAPTION_FADE, CAPTION_FADE, EASE.inOut);
  const o = Math.min(pin, pout);
  return (
    <div style={{ position: 'absolute', left: 0, right: 0, bottom: 46, display: 'flex', justifyContent: 'center', opacity: o }}>
      <div
        style={{
          maxWidth: 1560,
          padding: '14px 40px 17px',
          borderRadius: 18,
          background: 'rgba(255,255,255,0.96)',
          border: `1px solid ${C.border}`,
          boxShadow: '0 2px 4px rgba(19,34,56,0.06), 0 18px 40px -18px rgba(19,34,56,0.35)',
          color: C.ink,
          fontSize: 44,
          fontWeight: 500,
          lineHeight: 1.3,
          textAlign: 'center',
          transform: `translateY(${(1 - pin) * 8}px)`,
          whiteSpace: 'nowrap',
        }}
      >
        {fillCaption(CAPTIONS[lang][cue.id], { sources: DATA.validation.sources })}
      </div>
    </div>
  );
};
