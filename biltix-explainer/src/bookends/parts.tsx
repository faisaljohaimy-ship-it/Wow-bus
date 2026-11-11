/**
 * Building blocks of the cinematic bookends: graded b-roll, letterbox, the honesty tag, the metal frame
 * drawn on by the laser comet, corner ticks and the link pill. 2D only (no perspective, preserve-3d or
 * translateZ anywhere), eased with the theme's curves.
 */
import React from 'react';
import { AbsoluteFill, OffthreadVideo, Sequence, staticFile, useCurrentFrame } from 'remotion';
import { mix, prog } from '../lib/anim';
import { BEAM, C, EASE, FONT, METAL } from '../theme';
import type { Lang } from './copy';
import { BAR, type Clip } from './timing';

/* ── b-roll: one clip in its window, with a slow eased push (scale) and drift (px) ── */
export const Footage: React.FC<{
  clip: Clip;
  opacity: number;
  scale: [number, number];
  drift?: [number, number]; // px at the end of the window (screen space)
  origin?: string;
}> = ({ clip, opacity, scale, drift = [0, 0], origin = '50% 50%' }) => {
  const f = useCurrentFrame();
  if (opacity <= 0.001 || f < clip.from || f >= clip.from + clip.dur) return null;
  const p = prog(f, clip.from, clip.dur - 1, EASE.soft);
  const s = mix(scale[0], scale[1], p);
  // the drift never exceeds the overscan the scale gives, so no edge of the clip ever shows
  const maxX = ((s - 1) * 1920) / 2;
  const maxY = ((s - 1) * 1080) / 2;
  const tx = Math.max(-maxX, Math.min(maxX, drift[0] * p));
  const ty = Math.max(-maxY, Math.min(maxY, drift[1] * p));
  return (
    <Sequence from={clip.from} durationInFrames={clip.dur} layout="none">
      <AbsoluteFill style={{ opacity, transform: `translate(${tx.toFixed(2)}px, ${ty.toFixed(2)}px) scale(${s.toFixed(5)})`, transformOrigin: origin }}>
        <OffthreadVideo src={staticFile(clip.file)} muted playbackRate={clip.rate} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      </AbsoluteFill>
    </Sequence>
  );
};

/* ── soft cinematic grade: warm highlights from the sun side, slightly cooler and deeper shadows, a warm lens vignette ── */
export const Grade: React.FC<{ warmth?: number }> = ({ warmth = 1 }) => (
  <>
    {/* multiply tints even the brightest sky toward cream (soft-light alone leaves pure white untouched) */}
    <AbsoluteFill style={{ mixBlendMode: 'multiply', opacity: 0.7 * warmth, background: 'linear-gradient(180deg, rgb(255,228,198) 0%, rgb(255,244,230) 38%, rgb(255,255,255) 62%)' }} />
    <AbsoluteFill
      style={{
        mixBlendMode: 'soft-light',
        opacity: warmth,
        background: 'linear-gradient(170deg, rgba(255,160,80,0.50) 0%, rgba(255,175,105,0.20) 46%, rgba(255,175,105,0) 100%)',
      }}
    />
    <AbsoluteFill style={{ background: 'linear-gradient(180deg, rgba(16,26,48,0) 55%, rgba(16,26,48,0.22) 100%)' }} />
    <AbsoluteFill style={{ background: 'radial-gradient(130% 120% at 50% 48%, rgba(16,10,6,0) 54%, rgba(16,10,6,0.28) 78%, rgba(16,10,6,0.56) 100%)' }} />
  </>
);

/** Local shade behind a text block (an elliptical falloff, no hard edge; warm black, so a bright sky never turns grey). */
export const Shade: React.FC<{ cx: number; cy: number; rx: number; ry: number; alpha: number }> = ({ cx, cy, rx, ry, alpha }) => (
  <AbsoluteFill
    style={{
      background: `radial-gradient(${rx}px ${ry}px at ${cx}px ${cy}px, rgba(20,12,7,${alpha}) 0%, rgba(20,12,7,${(alpha * 0.62).toFixed(3)}) 45%, rgba(20,12,7,0) 100%)`,
    }}
  />
);

/* ── 2.39:1 letterbox bars ── */
export const Letterbox: React.FC<{ bar: number }> = ({ bar }) => (
  <>
    <div style={{ position: 'absolute', left: 0, right: 0, top: 0, height: bar, background: '#000' }} />
    <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: bar, background: '#000' }} />
  </>
);

/* ── honesty tag: on the lower bar, inline-end corner, for the whole shot ── */
export const HonestTag: React.FC<{ lang: Lang; text: string }> = ({ lang, text }) => {
  const rtl = lang === 'ar';
  const H = 40;
  return (
    <div
      dir={rtl ? 'rtl' : 'ltr'}
      lang={lang}
      style={{
        position: 'absolute',
        bottom: Math.round((BAR - H) / 2),
        insetInlineEnd: 64,
        height: H,
        boxSizing: 'border-box',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '0 18px',
        borderRadius: 999,
        border: '1px solid rgba(255,255,255,0.26)',
        background: 'rgba(255,255,255,0.06)',
        color: 'rgba(255,255,255,0.86)',
        fontFamily: rtl ? FONT.ar : FONT.en,
        fontSize: 21,
        fontWeight: 500,
        letterSpacing: rtl ? 0 : '0.01em',
        whiteSpace: 'nowrap',
      }}
    >
      {/* a small four-point spark: "generated" (not a status colour) */}
      <svg width={16} height={16} viewBox="0 0 16 16" aria-hidden style={{ flex: 'none' }}>
        <path d="M8 0.8 C8.6 5.2 10.8 7.4 15.2 8 C10.8 8.6 8.6 10.8 8 15.2 C7.4 10.8 5.2 8.6 0.8 8 C5.2 7.4 7.4 5.2 8 0.8Z" fill="#FFC27F" />
      </svg>
      <span>{text}</span>
    </div>
  );
};

/* ── metal frame drawn on by the laser comet ── */

/** Point at arc length s along a rounded rectangle (0,0,w,h,r), starting at (r,0), clockwise. */
function pointAt(s: number, w: number, h: number, r: number): [number, number] {
  const seg = [w - 2 * r, (Math.PI * r) / 2, h - 2 * r, (Math.PI * r) / 2, w - 2 * r, (Math.PI * r) / 2, h - 2 * r, (Math.PI * r) / 2];
  const P = seg.reduce((a, b) => a + b, 0);
  let u = ((s % P) + P) % P;
  const arc = (cx: number, cy: number, a0: number, len: number): [number, number] => {
    const a = a0 + len / r;
    return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
  };
  if (u < seg[0]) return [r + u, 0];
  u -= seg[0];
  if (u < seg[1]) return arc(w - r, r, -Math.PI / 2, u);
  u -= seg[1];
  if (u < seg[2]) return [w, r + u];
  u -= seg[2];
  if (u < seg[3]) return arc(w - r, h - r, 0, u);
  u -= seg[3];
  if (u < seg[4]) return [w - r - u, h];
  u -= seg[4];
  if (u < seg[5]) return arc(r, h - r, Math.PI / 2, u);
  u -= seg[5];
  if (u < seg[6]) return [0, h - r - u];
  u -= seg[6];
  return arc(r, r, Math.PI, u);
}

const perimeter = (w: number, h: number, r: number) => 2 * (w + h) - 8 * r + 2 * Math.PI * r;

/**
 * Distance travelled by the comet t frames after it starts, and its speed: an eased start, a fast first lap
 * that draws the frame (about `drawFrames`), then an eased slow-down to the app's cruising speed.
 */
function travel(t: number, P: number, drawFrames: number, cruise: number): { d: number; v: number } {
  if (t <= 0) return { d: 0, v: 0 };
  const up = 12;
  const down = 24;
  const tDown = drawFrames - 4;
  const vmax = P / (drawFrames - 7);
  const speed = (u: number) => {
    if (u <= 0) return 0;
    const a = EASE.inOut(Math.min(1, u / up));
    const b = EASE.inOut(Math.min(1, Math.max(0, (u - tDown) / down)));
    return vmax * a * (1 - b) + cruise * b;
  };
  let d = 0;
  const n = Math.floor(t);
  for (let k = 0; k < n; k += 1) d += speed(k + 0.5);
  d += speed(n + (t - n) / 2) * (t - n);
  return { d, v: speed(t) };
}

export const LaserFrame: React.FC<{
  x: number;
  y: number;
  w: number;
  h: number;
  r?: number;
  start: number;
  drawFrames?: number;
  cruise?: number;
  rtl: boolean;
  id: string;
  plate?: [number, number]; // smoked-glass opacity at the top and at the bottom
  stroke?: number;
}> = ({ x, y, w, h, r = 28, start, drawFrames = 40, cruise = 11, rtl, id, plate = [0.5, 0.64], stroke = 2.5 }) => {
  const f = useCurrentFrame();
  const P = perimeter(w, h, r);
  const { d, v } = travel(f - start, P, drawFrames, cruise);
  if (d <= 0) return null;
  const drawn = Math.min(1, d / P);
  const head = d % P;
  const closed = d >= P;
  // the tail stretches with speed (a hint of motion blur) and never reaches back past the start point
  const L = Math.min(closed ? 1e9 : d, 80 + v * 2.4);
  const N = 12;
  const seg = L / N;
  const [hx, hy] = pointAt(head, w, h, r);
  const pad = 24;
  const plateOn = EASE.inOut(Math.min(1, drawn * 1.15));
  return (
    <svg
      width={w + pad * 2}
      height={h + pad * 2}
      viewBox={`${-pad} ${-pad} ${w + pad * 2} ${h + pad * 2}`}
      style={{ position: 'absolute', left: x - pad, top: y - pad, overflow: 'visible' }}
      aria-hidden
    >
      <defs>
        <linearGradient id={`${id}-metal`} x1="0" y1="0" x2="1" y2="1">
          {[
            ['0%', '#A8480B'],
            ['16%', '#E8731B'],
            ['28%', '#FFB46A'],
            ['38%', '#F08A2E'],
            ['52%', '#B4500D'],
            ['66%', '#EE7E22'],
            ['78%', '#FFC27F'],
            ['90%', '#D8661A'],
            ['100%', '#A8480B'],
          ].map(([o, c]) => (
            <stop key={o} offset={o} stopColor={c} />
          ))}
        </linearGradient>
        <linearGradient id={`${id}-plate`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#101A2B" stopOpacity={plate[0]} />
          <stop offset="100%" stopColor="#060A12" stopOpacity={plate[1]} />
        </linearGradient>
        <radialGradient id={`${id}-flare`}>
          <stop offset="0%" stopColor="#FFFFFF" stopOpacity={1} />
          <stop offset="22%" stopColor={BEAM.head} stopOpacity={0.95} />
          <stop offset="48%" stopColor={BEAM.core} stopOpacity={0.45} />
          <stop offset="100%" stopColor={BEAM.core} stopOpacity={0} />
        </radialGradient>
      </defs>
      <rect x={0} y={0} width={w} height={h} rx={r} fill={`url(#${id}-plate)`} opacity={plateOn} />
      {/* English: clockwise from the top-left; Arabic: the mirror image, counter-clockwise from the top-right */}
      <g transform={rtl ? `translate(${w} 0) scale(-1 1)` : undefined}>
        <rect
          x={0}
          y={0}
          width={w}
          height={h}
          rx={r}
          fill="none"
          stroke="rgba(255,140,40,0.22)"
          strokeWidth={stroke + 6}
          strokeDasharray={closed ? undefined : `${d.toFixed(2)} ${P + 4}`}
        />
        <rect
          x={0}
          y={0}
          width={w}
          height={h}
          rx={r}
          fill="none"
          stroke={`url(#${id}-metal)`}
          strokeWidth={stroke}
          strokeDasharray={closed ? undefined : `${d.toFixed(2)} ${P + 4}`}
        />
        {/* glow round the head */}
        <rect
          x={0}
          y={0}
          width={w}
          height={h}
          rx={r}
          fill="none"
          stroke={BEAM.glow}
          strokeWidth={12}
          strokeOpacity={0.5}
          strokeDasharray={`${(seg * 4).toFixed(2)} ${(P - seg * 4).toFixed(2)}`}
          strokeDashoffset={(-((((head - seg * 4) % P) + P) % P)).toFixed(2)}
        />
        {Array.from({ length: N }, (_, i) => {
          const s0 = head - (i + 1) * seg;
          const k = 1 - i / N;
          return (
            <rect
              key={i}
              x={0}
              y={0}
              width={w}
              height={h}
              rx={r}
              fill="none"
              stroke={i === 0 ? BEAM.head : i < 3 ? BEAM.core : BEAM.tail}
              strokeOpacity={Math.pow(k, 1.6)}
              strokeWidth={i === 0 ? stroke + 1.4 : stroke + 0.8}
              strokeDasharray={`${(seg + 0.6).toFixed(2)} ${(P - seg - 0.6).toFixed(2)}`}
              strokeDashoffset={(-(((s0 % P) + P) % P)).toFixed(2)}
            />
          );
        })}
        <circle cx={hx} cy={hy} r={18} fill={`url(#${id}-flare)`} />
      </g>
    </svg>
  );
};

/* ── survey corner ticks round a frame ── */
export const CornerTicks: React.FC<{ x: number; y: number; w: number; h: number; gap?: number; len?: number; opacity: number }> = ({ x, y, w, h, gap = 16, len = 18, opacity }) => {
  if (opacity <= 0.001) return null;
  const x0 = x - gap;
  const y0 = y - gap;
  const x1 = x + w + gap;
  const y1 = y + h + gap;
  const d = [
    `M ${x0} ${y0 + len} V ${y0} H ${x0 + len}`,
    `M ${x1 - len} ${y0} H ${x1} V ${y0 + len}`,
    `M ${x1} ${y1 - len} V ${y1} H ${x1 - len}`,
    `M ${x0 + len} ${y1} H ${x0} V ${y1 - len}`,
  ].join(' ');
  return (
    <svg width={1920} height={1080} style={{ position: 'absolute', left: 0, top: 0, opacity }} aria-hidden>
      <path d={d} fill="none" stroke="rgba(255,255,255,0.7)" strokeWidth={1.6} />
    </svg>
  );
};

/* ── the app link on a white pill with the metal edge ── */
export const LinkPill: React.FC<{ text: string; style?: React.CSSProperties }> = ({ text, style }) => (
  <span
    dir="ltr"
    style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: 14,
      padding: '12px 28px',
      borderRadius: 999,
      border: '2px solid transparent',
      background: `linear-gradient(#FFFFFF, #FFFFFF) padding-box, ${METAL} border-box`,
      boxShadow: '0 16px 34px -16px rgba(0,0,0,0.55)',
      fontFamily: FONT.mono,
      fontSize: 28,
      fontWeight: 500,
      color: C.ink,
      whiteSpace: 'nowrap',
      unicodeBidi: 'isolate',
      ...style,
    }}
  >
    <svg width={24} height={24} viewBox="0 0 24 24" aria-hidden>
      <circle cx={12} cy={12} r={10} fill="none" stroke={C.accent} strokeWidth={1.8} />
      <path d="M2 12h20M12 2c3 3.2 3 16.8 0 20M12 2c-3 3.2-3 16.8 0 20" fill="none" stroke={C.accent} strokeWidth={1.6} />
    </svg>
    {text}
  </span>
);
