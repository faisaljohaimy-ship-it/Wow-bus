/**
 * Persistent frame chrome: blueprint background, top bar (brand + demo-data
 * label), the 7-beat step rail and the caption band.
 */
import React from 'react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';
import { COPY } from '../copy';
import { prog } from '../lib/anim';
import { DATA } from '../data';
import { CAPTION_FADE, CAPTIONS, captionCues, fillCaption, SCENES, STEPS, type Lang } from '../storyboard';
import { C, EASE, FONT } from '../theme';
import { Emblem } from './Emblem';

/* ── background: deep surface, soft key light, sparse blueprint grid (2–4 %) ── */
export const Background: React.FC<{ drift: number }> = ({ drift }) => {
  const minor = 40;
  const major = 200;
  const ox = (drift * 0.6) % major;
  const oy = (drift * 0.25) % major;
  return (
    <AbsoluteFill style={{ background: C.bg }}>
      <AbsoluteFill
        style={{
          background:
            'radial-gradient(1100px 760px at 50% 46%, rgba(47,111,237,0.10), rgba(47,111,237,0) 70%), radial-gradient(900px 500px at 82% 12%, rgba(25,198,230,0.045), rgba(25,198,230,0) 70%)',
        }}
      />
      <svg width="1920" height="1080" style={{ position: 'absolute', inset: 0 }}>
        <defs>
          <pattern id="g-minor" width={minor} height={minor} patternUnits="userSpaceOnUse" x={-ox} y={-oy}>
            <path d={`M ${minor} 0 L 0 0 0 ${minor}`} fill="none" stroke={C.grid} strokeOpacity={0.022} strokeWidth={1} />
          </pattern>
          <pattern id="g-major" width={major} height={major} patternUnits="userSpaceOnUse" x={-ox} y={-oy}>
            <path d={`M ${major} 0 L 0 0 0 ${major}`} fill="none" stroke={C.grid} strokeOpacity={0.04} strokeWidth={1} />
          </pattern>
        </defs>
        <rect width="1920" height="1080" fill="url(#g-minor)" />
        <rect width="1920" height="1080" fill="url(#g-major)" />
      </svg>
      {/* registration marks at the content frame corners */}
      <svg width="1920" height="1080" style={{ position: 'absolute', inset: 0 }}>
        {[
          [72, 228],
          [1848, 228],
          [72, 920],
          [1848, 920],
        ].map(([x, y], i) => (
          <g key={i} stroke={C.ink3} strokeOpacity={0.28} strokeWidth={1}>
            <line x1={x - 9} y1={y} x2={x + 9} y2={y} />
            <line x1={x} y1={y - 9} x2={x} y2={y + 9} />
          </g>
        ))}
      </svg>
      <AbsoluteFill style={{ background: 'radial-gradient(1400px 900px at 50% 50%, rgba(0,0,0,0) 60%, rgba(2,6,12,0.55) 100%)' }} />
    </AbsoluteFill>
  );
};

/* ── code chip: Latin, monospace, never breaks ── */
export const Code: React.FC<{ children: React.ReactNode; size?: number; color?: string; style?: React.CSSProperties }> = ({
  children,
  size = 22,
  color = C.accent,
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

/* ── card surface ── */
export const Card: React.FC<{ style?: React.CSSProperties; children: React.ReactNode; glow?: string }> = ({ style, children, glow }) => (
  <div
    style={{
      position: 'absolute',
      background: `linear-gradient(180deg, ${C.raised} 0%, ${C.surface} 100%)`,
      border: `1px solid ${C.border}`,
      borderRadius: 20,
      boxShadow: `0 1px 0 rgba(255,255,255,0.04) inset, 0 24px 60px rgba(0,0,0,0.38)${glow ? `, 0 0 0 1px ${glow}` : ''}`,
      boxSizing: 'border-box',
      ...style,
    }}
  >
    {children}
  </div>
);

export const Eyebrow: React.FC<{ children: React.ReactNode; color?: string; style?: React.CSSProperties }> = ({ children, color = C.ink3, style }) => (
  <div style={{ fontSize: 20, fontWeight: 500, color, letterSpacing: '0.02em', ...style }}>{children}</div>
);

/* ── rating badge: colour is never alone, the label is always printed ── */
export const RatingBadge: React.FC<{ color: string; label: string; size?: number; style?: React.CSSProperties }> = ({ color, label, size = 22, style }) => (
  <span
    style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: 10,
      padding: `${size * 0.28}px ${size * 0.62}px`,
      borderRadius: 999,
      background: `${color}22`,
      border: `1px solid ${color}88`,
      color: C.ink,
      fontSize: size,
      fontWeight: 600,
      whiteSpace: 'nowrap',
      ...style,
    }}
  >
    <span style={{ width: size * 0.45, height: size * 0.45, borderRadius: 999, background: color, boxShadow: `0 0 12px ${color}aa` }} />
    {label}
  </span>
);

/* ── top bar ── */
export const TopBar: React.FC<{ lang: Lang; frame: number }> = ({ lang, frame }) => {
  const p = prog(frame, 64, 24, EASE.out);
  const t = COPY[lang];
  return (
    <div style={{ position: 'absolute', top: 44, insetInlineStart: 96, insetInlineEnd: 96, height: 52, display: 'flex', alignItems: 'center', justifyContent: 'space-between', opacity: p }}>
      <div dir="ltr" style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <Emblem size={44} id="tb" />
        <span style={{ fontFamily: FONT.en, fontSize: 26, fontWeight: 600, letterSpacing: '0.1em', color: C.ink }}>BILTIX</span>
        <span style={{ fontFamily: FONT.en, fontSize: 26, fontWeight: 400, color: C.ink2 }}>Risk AI</span>
      </div>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: '8px 18px',
          borderRadius: 999,
          border: `1px solid ${C.border}`,
          background: 'rgba(17,29,46,0.7)',
          color: C.ink2,
          fontSize: 21,
          fontWeight: 500,
        }}
      >
        <span style={{ width: 8, height: 8, borderRadius: 2, background: C.gold, transform: 'rotate(45deg)' }} />
        {t.demo}
      </div>
    </div>
  );
};

/* ── step rail: 7 beats, progress fills continuously with the story ── */
export const StepRail: React.FC<{ lang: Lang }> = ({ lang }) => {
  const frame = useCurrentFrame();
  // continuous position along the rail (0..6) from scene timings
  let f0 = 0;
  let pos = -1;
  let fadeIn = 0;
  let fadeOut = 1;
  for (const s of SCENES) {
    if (s.id === 'intro') fadeIn = prog(frame, f0 + s.frames - 18, 24, EASE.out);
    if (s.id === 'outro') fadeOut = 1 - prog(frame, f0 + 6, 22, EASE.inOut);
    // the active node switches at the middle of the cross-fade into its scene
    if (frame >= f0 + 6) {
      if (s.step !== null) pos = s.step;
      else if (s.id === 'outro') pos = 7;
    }
    f0 += s.frames;
  }
  const labels = STEPS[lang];
  const x0 = 120;
  const x1 = 1800;
  const span = (x1 - x0) / 6;
  const y = 148;
  // smooth fill between nodes at each scene change
  let fillTo = 0;
  {
    let start = 0;
    for (const s of SCENES) {
      if (s.step !== null) {
        const p = prog(frame, start - 6, 22, EASE.inOut);
        if (p > 0) fillTo = Math.max(fillTo, (s.step - 1) * span + p * span);
      }
      start += s.frames;
    }
    fillTo = Math.max(0, fillTo);
  }
  const rtl = lang === 'ar';
  const X = (i: number) => (rtl ? x1 - i * span : x0 + i * span);
  return (
    <div style={{ position: 'absolute', inset: 0, opacity: fadeIn * fadeOut }}>
      <svg width="1920" height="1080" style={{ position: 'absolute', inset: 0 }}>
        <defs>
          <linearGradient id="rail-fill" x1={rtl ? 1 : 0} x2={rtl ? 0 : 1} y1="0" y2="0">
            <stop offset="0%" stopColor={C.primary} />
            <stop offset="100%" stopColor={C.accent} />
          </linearGradient>
        </defs>
        <line x1={x0} x2={x1} y1={y} y2={y} stroke={C.border} strokeWidth={2} />
        <line
          x1={rtl ? x1 : x0}
          x2={rtl ? x1 - fillTo : x0 + fillTo}
          y1={y}
          y2={y}
          stroke="url(#rail-fill)"
          strokeWidth={2}
        />
        {labels.map((_, i) => {
          const done = i < pos;
          const cur = i === pos;
          const cx = X(i);
          return (
            <g key={i}>
              {cur && <circle cx={cx} cy={y} r={15} fill="none" stroke={C.accent} strokeOpacity={0.35} strokeWidth={1.5} />}
              <circle
                cx={cx}
                cy={y}
                r={cur ? 8 : 6.5}
                fill={cur ? C.accent : done ? C.primary : C.bg}
                stroke={cur ? C.accent : done ? C.primary : C.ink3}
                strokeWidth={1.5}
              />
            </g>
          );
        })}
      </svg>
      {labels.map((label, i) => {
        const cur = i === pos;
        const done = i < pos;
        return (
          <div
            key={i}
            style={{
              position: 'absolute',
              top: y + 20,
              left: X(i) - 140,
              width: 280,
              textAlign: 'center',
              fontSize: 19,
              fontWeight: cur ? 600 : 500,
              color: cur ? C.ink : done ? C.ink2 : C.ink3,
              whiteSpace: 'nowrap',
            }}
          >
            <span style={{ fontFamily: FONT.mono, fontSize: 15, color: cur ? C.accent : C.ink3, marginInlineEnd: 8 }}>{String(i + 1).padStart(2, '0')}</span>
            {label}
          </div>
        );
      })}
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
    <div style={{ position: 'absolute', left: 0, right: 0, bottom: 58, display: 'flex', justifyContent: 'center', opacity: o }}>
      <div
        style={{
          maxWidth: 1500,
          padding: '16px 40px 18px',
          borderRadius: 16,
          background: 'rgba(8,15,27,0.78)',
          border: `1px solid ${C.border}`,
          boxShadow: '0 18px 40px rgba(0,0,0,0.35)',
          color: C.ink,
          fontSize: 44,
          fontWeight: 500,
          lineHeight: 1.3,
          textAlign: 'center',
          transform: `translateY(${(1 - pin) * 10}px)`,
          whiteSpace: 'nowrap',
        }}
      >
        {fillCaption(CAPTIONS[lang][cue.id], { sources: DATA.validation.sources })}
      </div>
    </div>
  );
};
