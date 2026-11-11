/**
 * Film v2 kit: context (language, direction, copy), layout helpers, cards, chips, icons, stamps, word reveals,
 * b-roll, the HUD (wordmark, chapter rail, Demo-data chip, roadmap tag, AI-footage tag) and the captions.
 * 2D only: opacity, translate, scale, rotate. No CSS 3D, no backdrop-filter, no blur filters.
 * Layout coordinates are logical (inline-start = 0): HTML boxes use insetInlineStart (mirrored by dir="rtl"),
 * SVG geometry goes through px(rtl, x).
 */
import React, { createContext, useContext } from 'react';
import { AbsoluteFill, OffthreadVideo, Sequence, staticFile, useCurrentFrame } from 'remotion';
import { Comet } from '../components/Metal';
import { Emblem } from '../components/Emblem';
import { mix, prog } from '../lib/anim';
import { C, EASE, ELEV, FONT, METAL } from '../theme';
import type { Copy } from './copy';
import type { Chunk } from './captions';
import { FPS, type Lang } from './timeline';

/* ── context ── */
export type FilmCtxT = { lang: Lang; rtl: boolean; c: Copy };
export const FilmCtx = createContext<FilmCtxT>(null as unknown as FilmCtxT);
export const useFilm = () => useContext(FilmCtx);

/** A point x in logical coordinates → physical (mirrored in Arabic). */
export const px = (rtl: boolean, x: number) => (rtl ? 1920 - x : x);

export const NAVY = '#0B1A33';
export const NAVY2 = '#12284D';

/* ── motion helpers ── */
/** Fade + rise entrance at frame `at`. */
export const rise = (f: number, at: number, dur = 18, dist = 24): React.CSSProperties => {
  const p = prog(f, at, dur, EASE.out);
  return { opacity: p, transform: `translateY(${((1 - p) * dist).toFixed(2)}px)` };
};
/** Fade + scale-in entrance. */
export const pop = (f: number, at: number, dur = 16, from = 0.92): React.CSSProperties => {
  const p = prog(f, at, dur, EASE.expo);
  return { opacity: Math.min(1, p * 1.4), transform: `scale(${mix(from, 1, p).toFixed(4)})` };
};
/** Slide in along the inline axis (positive = from the inline-end side). */
export const slideIn = (f: number, at: number, rtl: boolean, dist = 60, dur = 20): React.CSSProperties => {
  const p = prog(f, at, dur, EASE.out);
  return { opacity: p, transform: `translateX(${((rtl ? -1 : 1) * (1 - p) * dist).toFixed(2)}px)` };
};

/* ── absolutely positioned logical box ── */
export const Box: React.FC<{ x: number; y: number; w?: number; h?: number; style?: React.CSSProperties; children?: React.ReactNode }> = ({ x, y, w, h, style, children }) => (
  <div style={{ position: 'absolute', top: y, insetInlineStart: x, width: w, height: h, boxSizing: 'border-box', ...style }}>{children}</div>
);

/* ── cards ── */
export const metalBorder = (fill: string = C.surface, width = 2): React.CSSProperties => ({
  border: `${width}px solid transparent`,
  background: `linear-gradient(${fill}, ${fill}) padding-box, ${METAL} border-box`,
});

export const Card: React.FC<{
  x: number;
  y: number;
  w: number;
  h?: number;
  r?: number;
  metal?: boolean;
  comet?: boolean;
  pad?: number | string;
  fill?: string;
  style?: React.CSSProperties;
  children?: React.ReactNode;
}> = ({ x, y, w, h, r = 22, metal = true, comet = false, pad = 28, fill = C.surface, style, children }) => {
  const { rtl } = useFilm();
  return (
    <Box
      x={x}
      y={y}
      w={w}
      h={h}
      style={{
        borderRadius: r,
        padding: pad,
        ...(metal ? metalBorder(fill) : { background: fill, border: `1.5px solid ${C.border}` }),
        boxShadow: ELEV,
        ...style,
      }}
    >
      {children}
      {comet && h ? <Comet w={w} h={h} r={r} rtl={rtl} speed={10} len={160} /> : null}
    </Box>
  );
};

/* ── chips ── */
export type ChipTone = 'red' | 'amber' | 'green' | 'blue' | 'neutral' | 'orange' | 'dark' | 'teal';
const CHIP: Record<ChipTone, { bg: string; fg: string; bd: string }> = {
  red: { bg: '#FDEDED', fg: C.redText, bd: '#F3C4C4' },
  amber: { bg: '#FFF5DE', fg: C.amberText, bd: '#F2D79A' },
  green: { bg: '#E8F6E8', fg: C.greenText, bd: '#B9E2B9' },
  blue: { bg: '#EAF1FE', fg: C.primaryText, bd: '#C8D8FA' },
  teal: { bg: '#E4F5F8', fg: C.accentText, bd: '#B5E1E9' },
  orange: { bg: '#FDF0E9', fg: C.orangeText, bd: '#F2CDB9' },
  neutral: { bg: C.raised, fg: C.ink2, bd: C.border },
  dark: { bg: 'rgba(255,255,255,0.08)', fg: '#FFFFFF', bd: 'rgba(255,255,255,0.26)' },
};
export const Chip: React.FC<{ tone?: ChipTone; icon?: IconName; size?: number; style?: React.CSSProperties; children: React.ReactNode; dot?: boolean }> = ({
  tone = 'neutral',
  icon,
  size = 28,
  style,
  children,
  dot,
}) => {
  const t = CHIP[tone];
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: Math.round(size * 0.36),
        padding: `${Math.round(size * 0.24)}px ${Math.round(size * 0.62)}px`,
        borderRadius: 999,
        background: t.bg,
        color: t.fg,
        border: `1.5px solid ${t.bd}`,
        fontSize: size,
        fontWeight: 600,
        lineHeight: 1.25,
        whiteSpace: 'nowrap',
        ...style,
      }}
    >
      {dot && <span style={{ width: size * 0.32, height: size * 0.32, borderRadius: 99, background: t.fg, flex: 'none' }} />}
      {icon && <Icon name={icon} size={Math.round(size * 1.05)} color={t.fg} />}
      {children}
    </span>
  );
};

/** Mono code (IDs, dates, numbers) isolated from the bidi context. */
export const Mono: React.FC<{ children: React.ReactNode; size?: number; color?: string; weight?: number; style?: React.CSSProperties }> = ({ children, size = 26, color = C.ink2, weight = 500, style }) => (
  <bdi dir="ltr" style={{ fontFamily: FONT.mono, fontSize: size, color, fontWeight: weight, unicodeBidi: 'isolate', whiteSpace: 'nowrap', ...style }}>
    {children}
  </bdi>
);

/* ── icons (24 × 24, stroke) ── */
const PATHS = {
  doc: 'M6 2.8h8l4.2 4.2V21H6z M14 2.8V7h4.2 M8.8 11.5h6.4 M8.8 15h6.4 M8.8 18.2h4',
  lock: 'M5.5 10.5h13v10h-13z M8.2 10.5V7.6a3.8 3.8 0 0 1 7.6 0v2.9 M12 14.4v2.6',
  hourglass: 'M6.5 2.8h11 M6.5 21.2h11 M7.6 2.8c0 5 8.8 4.6 8.8 9.2S7.6 16.2 7.6 21.2 M16.4 2.8c0 5-8.8 4.6-8.8 9.2s8.8 4.2 8.8 9.2',
  crate: 'M3 7.5l9-4.3 9 4.3v9L12 20.8 3 16.5z M3 7.5l9 4.3 9-4.3 M12 11.8v9 M7.5 5.4l9 4.3',
  pin: 'M12 21.5s-6.8-6.4-6.8-11.4a6.8 6.8 0 0 1 13.6 0c0 5-6.8 11.4-6.8 11.4z M12 12.6a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z',
  check: 'M4.5 12.5l4.8 4.8L19.5 7',
  x: 'M6 6l12 12 M18 6L6 18',
  shield: 'M12 2.8l7.5 3v6c0 4.8-3.2 8.2-7.5 9.4-4.3-1.2-7.5-4.6-7.5-9.4v-6z M8.6 12l2.4 2.4 4.4-4.6',
  signal: 'M4 20v-3 M9 20v-6 M14 20v-9 M19 20V5',
  cloud: 'M7 18.5h10.2a4.2 4.2 0 0 0 .6-8.4A6 6 0 0 0 6.3 11a3.8 3.8 0 0 0 .7 7.5z',
  camera: 'M3 8.2h3.6l1.6-2.6h7.6l1.6 2.6H21V19H3z M12 16.4a3.4 3.4 0 1 0 0-6.8 3.4 3.4 0 0 0 0 6.8z',
  crane: 'M6 21V4 M6 4h14 M6 4L3 7.5 M3 4h3 M17 4v6 M15.5 10h3v2.5h-3z M4 21h5 M6 8.5l3-4.5 M6 13l3-4.5',
  cart: 'M3 4h2.6l2.2 11h10.4l2-7.6H7 M9.5 20a1.3 1.3 0 1 0 0-2.6 1.3 1.3 0 0 0 0 2.6z M16.5 20a1.3 1.3 0 1 0 0-2.6 1.3 1.3 0 0 0 0 2.6z',
  calendar: 'M4 6h16v14.5H4z M4 10.2h16 M8.5 3.5v4.2 M15.5 3.5v4.2',
  contract: 'M5 2.8h10l4 4V21H5z M8 9h8 M8 12.5h8 M8 16h4.5 M13.5 18.5c1-1.6 2-1.6 2.6-.4.5.9 1.3.9 2.4-.6',
  mail: 'M3 5.5h18v13H3z M3 6.5l9 6.8 9-6.8',
  photo: 'M3 5h18v14H3z M3 16l5-5 4 4 3-3 6 6 M15.5 10a1.6 1.6 0 1 0 0-3.2 1.6 1.6 0 0 0 0 3.2z',
  weather: 'M8 3.5v1.8 M3.5 8H5.3 M4.8 4.8l1.3 1.3 M11.2 4.8l-1.3 1.3 M10.6 9.4a3 3 0 1 0-4.9 2.4 M8.5 20h9.4a3.6 3.6 0 0 0 .5-7.2 5 5 0 0 0-9.6 1.4A3 3 0 0 0 8.5 20z',
  user: 'M12 12a4.2 4.2 0 1 0 0-8.4 4.2 4.2 0 0 0 0 8.4z M4 21c.8-4.2 4-6.5 8-6.5s7.2 2.3 8 6.5',
  users: 'M9 11.5a3.6 3.6 0 1 0 0-7.2 3.6 3.6 0 0 0 0 7.2z M2.8 20c.7-3.7 3.2-5.6 6.2-5.6s5.5 1.9 6.2 5.6 M16 4.6a3.4 3.4 0 0 1 0 6.6 M17.6 14.6c2 .6 3.3 2.4 3.7 5.4',
  qr: 'M3.5 3.5h6.5v6.5H3.5z M14 3.5h6.5v6.5H14z M3.5 14h6.5v6.5H3.5z M6 6h1.5v1.5H6z M16.5 6H18v1.5h-1.5z M6 16.5h1.5V18H6z M14 14h2.5v2.5H14z M18 14h2.5 M14 18.5h2.5v2 M18.5 17.5v3h2',
  layers: 'M12 3.5l9 4.6-9 4.6-9-4.6z M3 12.4l9 4.6 9-4.6 M3 16.6l9 4.6 9-4.6',
  chip: 'M7 7h10v10H7z M10 10h4v4h-4z M9.5 3.5V7 M14.5 3.5V7 M9.5 17v3.5 M14.5 17v3.5 M3.5 9.5H7 M3.5 14.5H7 M17 9.5h3.5 M17 14.5h3.5',
  factory: 'M3 20.5V10l5 3V10l5 3V10l5 3V4h3v16.5z M7 17h2 M11.5 17h2 M16 17h2',
  alert: 'M12 3.5l9.5 16.5h-19z M12 9.5v5 M12 17.4v.4',
  clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z M12 7v5.4l3.4 2',
  link: 'M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1.2 1.2 M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1.2-1.2',
  server: 'M4 4h16v6H4z M4 14h16v6H4z M7.5 7h.5 M7.5 17h.5',
  globe: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z M3 12h18 M12 3c2.8 3 2.8 15 0 18 M12 3c-2.8 3-2.8 15 0 18',
  key: 'M8 15.5a4 4 0 1 0 0-8 4 4 0 0 0 0 8z M11.5 11.5H21 M17.5 11.5v3.5 M20 11.5v2.5',
  power: 'M13 2.5L5.5 13.5H12l-1 8 7.5-11H12z',
  building: 'M5 21V3.5h10V21 M15 9h4v12 M3 21h18 M8 7h1.5 M11 7h1.5 M8 10.5h1.5 M11 10.5h1.5 M8 14h1.5 M11 14h1.5',
  eyeoff: 'M3 3l18 18 M10.6 5.2A10 10 0 0 1 22 12a14 14 0 0 1-3.2 4 M6.6 6.6A14 14 0 0 0 2 12c2 4.2 5.6 7 10 7a9.6 9.6 0 0 0 4.4-1 M9.9 9.9a3 3 0 0 0 4.2 4.2',
  zap: 'M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z',
  refresh: 'M20 11a8 8 0 0 0-14.3-4.6L4 8.2 M4 4v4.2h4.2 M4 13a8 8 0 0 0 14.3 4.6L20 15.8 M20 20v-4.2h-4.2',
  upload: 'M12 16V4.5 M7.5 9L12 4.5 16.5 9 M4.5 15.5v4h15v-4',
  database: 'M12 8.5c4.4 0 8-1.3 8-3s-3.6-3-8-3-8 1.3-8 3 3.6 3 8 3z M4 5.5v13c0 1.7 3.6 3 8 3s8-1.3 8-3v-13 M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3',
  gateway: 'M4 12h4 M16 12h4 M8 7.5h8v9H8z M11 10.5h2v3h-2z',
  plan: 'M3.5 4.5h17v15h-17z M3.5 10h7v9.5 M10.5 4.5v3 M14 10h6.5 M14 10v4',
  hardhat: 'M3 17.5h18 M4.5 17.5a7.5 7.5 0 0 1 15 0 M10 6.5h4v5h-4z',
  pole: 'M12 21V8 M8.5 21h7 M8 5.5h8v3.5H8z M16 6.2l2.5-1.2v4.5L16 8.3',
  wifioff: 'M3 3l18 18 M8.6 15.8a5 5 0 0 1 6.8 0 M5.2 12.4a10 10 0 0 1 4-2.4 M18.8 12.4a10 10 0 0 0-2.3-1.7 M2 8.8a15 15 0 0 1 3.8-2.6 M22 8.8a15 15 0 0 0-11-4 M12 19.5h.1',
  arrowR: 'M4 12h15 M13.5 6.5L19 12l-5.5 5.5',
  coins: 'M12 8c4.4 0 8-1.1 8-2.5S16.4 3 12 3 4 4.1 4 5.5 7.6 8 12 8z M4 5.5v4c0 1.4 3.6 2.5 8 2.5s8-1.1 8-2.5v-4 M4 9.5v4c0 1.4 3.6 2.5 8 2.5s8-1.1 8-2.5v-4 M4 13.5v4c0 1.4 3.6 2.5 8 2.5s8-1.1 8-2.5v-4',
  hand: 'M8 11V5a1.6 1.6 0 0 1 3.2 0v5 M11.2 10V3.8a1.6 1.6 0 0 1 3.2 0V10 M14.4 10V5.2a1.6 1.6 0 0 1 3.2 0v8.3c0 4-2.6 7-6.6 7-3 0-4.6-1.6-6.2-4.4l-1.6-3c-.6-1 0-2.2 1-2.4.7-.2 1.4.2 1.8.8L8 13.5',
} as const;
export type IconName = keyof typeof PATHS;
export const Icon: React.FC<{ name: IconName; size?: number; color?: string; width?: number; style?: React.CSSProperties; flip?: boolean }> = ({ name, size = 28, color = C.ink2, width = 1.8, style, flip }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden style={{ flex: 'none', display: 'block', transform: flip ? 'scaleX(-1)' : undefined, ...style }}>
    <path d={PATHS[name]} fill="none" stroke={color} strokeWidth={width} strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

/** Icon in a soft rounded square. */
export const IconTile: React.FC<{ name: IconName; size?: number; tone?: ChipTone; style?: React.CSSProperties }> = ({ name, size = 64, tone = 'blue', style }) => {
  const t = CHIP[tone];
  return (
    <span style={{ width: size, height: size, borderRadius: size * 0.28, background: t.bg, border: `1.5px solid ${t.bd}`, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flex: 'none', ...style }}>
      <Icon name={name} size={Math.round(size * 0.56)} color={t.fg} width={1.9} />
    </span>
  );
};

/* ── text ── */
/** Words revealed one by one (whole words only, so Arabic joining is never broken). */
export const Words: React.FC<{ text: string; at: number; per?: number; dur?: number; dist?: number; style?: React.CSSProperties; wordStyle?: React.CSSProperties }> = ({
  text,
  at,
  per = 3,
  dur = 14,
  dist = 18,
  style,
  wordStyle,
}) => {
  const f = useCurrentFrame();
  const words = text.split(' ');
  return (
    <span style={style}>
      {words.map((w, i) => {
        const p = prog(f, at + i * per, dur, EASE.out);
        return (
          <React.Fragment key={i}>
            <span style={{ display: 'inline-block', opacity: p, transform: `translateY(${((1 - p) * dist).toFixed(2)}px)`, ...wordStyle }}>{w}</span>
            {i < words.length - 1 ? ' ' : null}
          </React.Fragment>
        );
      })}
    </span>
  );
};

/** A label with a short metal bar on its inline-start (section headings inside scenes). */
export const Kicker: React.FC<{ children: React.ReactNode; color?: string; size?: number; style?: React.CSSProperties }> = ({ children, color = C.accentText, size = 30, style }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 14, fontSize: size, fontWeight: 600, color, ...style }}>
    <span style={{ width: 34, height: 5, borderRadius: 3, background: METAL, flex: 'none' }} />
    <span>{children}</span>
  </div>
);

/* ── stamp: slams in with an impact ring ── */
export const Stamp: React.FC<{ at: number; color: string; rotate?: number; children: React.ReactNode; size?: number; style?: React.CSSProperties }> = ({ at, color, rotate = -8, children, size = 40, style }) => {
  const f = useCurrentFrame();
  const p = prog(f, at, 9, EASE.expo);
  if (f < at) return null;
  const s = mix(2.1, 1, p);
  const ring = prog(f, at + 5, 16, EASE.out);
  return (
    <div style={{ position: 'absolute', ...style }}>
      <div style={{ position: 'relative', transform: `rotate(${rotate}deg) scale(${s.toFixed(4)})`, opacity: Math.min(1, p * 1.6) }}>
        <div
          style={{
            border: `5px solid ${color}`,
            borderRadius: 16,
            padding: `${size * 0.22}px ${size * 0.6}px`,
            color,
            fontSize: size,
            fontWeight: 700,
            lineHeight: 1.25,
            background: 'rgba(255,255,255,0.86)',
            boxShadow: `inset 0 0 0 3px rgba(255,255,255,0.9), inset 0 0 0 5px ${color}`,
            whiteSpace: 'nowrap',
            textAlign: 'center',
          }}
        >
          {children}
        </div>
        {ring > 0 && ring < 1 && (
          <div style={{ position: 'absolute', inset: -10 - 40 * ring, borderRadius: 24, border: `3px solid ${color}`, opacity: (1 - ring) * 0.5 }} />
        )}
      </div>
    </div>
  );
};

/* ── progress ring ── */
export const Ring: React.FC<{ size: number; value: number; max: number; color: string; track?: string; width?: number; children?: React.ReactNode; draw?: number }> = ({
  size,
  value,
  max,
  color,
  track = C.pressed,
  width = 12,
  children,
  draw = 1,
}) => {
  const r = (size - width) / 2;
  const P = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(1, value / max)) * draw;
  return (
    <div style={{ position: 'relative', width: size, height: size, flex: 'none' }}>
      <svg width={size} height={size} style={{ position: 'absolute', inset: 0 }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={track} strokeWidth={width} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={width}
          strokeLinecap="round"
          strokeDasharray={`${(P * v).toFixed(2)} ${P.toFixed(2)}`}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>{children}</div>
    </div>
  );
};

/* ── SVG wire with draw-on and a travelling pulse ── */
export const Wire: React.FC<{ d: string; draw: number; color?: string; width?: number; dash?: string; pulse?: number | null; pulseColor?: string; opacity?: number }> = ({
  d,
  draw,
  color = C.lineStrong,
  width = 3,
  dash,
  pulse = null,
  pulseColor = '#FF5E00',
  opacity = 1,
}) => {
  if (draw <= 0) return null;
  return (
    <g opacity={opacity}>
      {dash ? (
        <>
          <defs />
          <path d={d} fill="none" stroke={color} strokeWidth={width} strokeDasharray={dash} strokeLinecap="round" opacity={Math.min(1, draw * 1.5)} />
        </>
      ) : (
        <path d={d} pathLength={1} fill="none" stroke={color} strokeWidth={width} strokeLinecap="round" strokeDasharray={`${draw} 1`} />
      )}
      {pulse !== null && pulse > 0 && pulse < 1 && (
        <path d={d} pathLength={1} fill="none" stroke={pulseColor} strokeWidth={width + 3} strokeLinecap="round" strokeDasharray="0.06 1" strokeDashoffset={-(pulse * 1.06 - 0.06)} />
      )}
    </g>
  );
};

/* ── b-roll ── */
/** Full-bleed clip in [from, from + dur): eased push (scale) and drift; slowed to fit the 4.0 s source, never frozen. */
export const Broll: React.FC<{ src: string; from: number; dur: number; scale?: [number, number]; drift?: [number, number]; opacity?: number; rate?: number; fit?: 'cover' }> = ({
  src,
  from,
  dur,
  scale = [1, 1.06],
  drift = [0, 0],
  opacity = 1,
  rate,
}) => {
  const f = useCurrentFrame();
  if (opacity <= 0.001 || f < from || f >= from + dur) return null;
  const r = rate ?? Math.min(1, (3.9 * FPS) / dur);
  const p = prog(f, from, dur - 1, EASE.soft);
  const s = mix(scale[0], scale[1], p);
  const maxX = ((s - 1) * 1920) / 2;
  const maxY = ((s - 1) * 1080) / 2;
  const tx = Math.max(-maxX, Math.min(maxX, drift[0] * p));
  const ty = Math.max(-maxY, Math.min(maxY, drift[1] * p));
  return (
    <Sequence from={from} durationInFrames={dur} layout="none">
      <AbsoluteFill style={{ opacity, transform: `translate(${tx.toFixed(2)}px, ${ty.toFixed(2)}px) scale(${s.toFixed(5)})` }}>
        <OffthreadVideo src={staticFile(src)} muted playbackRate={r} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      </AbsoluteFill>
    </Sequence>
  );
};

/** Warm cinematic grade over b-roll + lens vignette + a bottom shade for the captions. */
export const Grade: React.FC<{ warmth?: number }> = ({ warmth = 1 }) => (
  <>
    <AbsoluteFill style={{ mixBlendMode: 'soft-light', opacity: warmth, background: 'linear-gradient(170deg, rgba(255,160,80,0.42) 0%, rgba(255,175,105,0.16) 46%, rgba(255,175,105,0) 100%)' }} />
    <AbsoluteFill style={{ background: 'radial-gradient(130% 120% at 50% 46%, rgba(10,8,6,0) 52%, rgba(10,8,6,0.30) 78%, rgba(10,8,6,0.58) 100%)' }} />
    <AbsoluteFill style={{ background: 'linear-gradient(180deg, rgba(8,14,26,0.30) 0%, rgba(8,14,26,0) 22%, rgba(8,14,26,0) 52%, rgba(8,14,26,0.55) 100%)' }} />
  </>
);

/** "AI-generated" tag (a four-point spark). `dark` for use on footage. */
export const AiFootageTag: React.FC<{ text: string; dark?: boolean; size?: number; style?: React.CSSProperties }> = ({ text, dark = true, size = 22, style }) => (
  <span
    style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: 10,
      padding: '7px 16px',
      borderRadius: 999,
      border: dark ? '1px solid rgba(255,255,255,0.34)' : `1px solid ${C.border}`,
      background: dark ? 'rgba(8,14,26,0.52)' : '#FFFFFF',
      color: dark ? 'rgba(255,255,255,0.94)' : C.ink2,
      fontSize: size,
      fontWeight: 500,
      whiteSpace: 'nowrap',
      ...style,
    }}
  >
    <svg width={16} height={16} viewBox="0 0 16 16" aria-hidden style={{ flex: 'none' }}>
      <path d="M8 0.8 C8.6 5.2 10.8 7.4 15.2 8 C10.8 8.6 8.6 10.8 8 15.2 C7.4 10.8 5.2 8.6 0.8 8 C5.2 7.4 7.4 5.2 8 0.8Z" fill="#FFB46A" />
    </svg>
    {text}
  </span>
);

/** A rounded window with a b-roll clip inside (metal edge), tagged as AI footage. */
export const BrollFrame: React.FC<{ src: string; x: number; y: number; w: number; h: number; from: number; dur: number; tag: string; r?: number; scale?: [number, number]; opacity?: number }> = ({
  src,
  x,
  y,
  w,
  h,
  from,
  dur,
  tag,
  r = 26,
  scale = [1.0, 1.08],
  opacity = 1,
}) => {
  const f = useCurrentFrame();
  const rate = Math.min(1, (3.9 * FPS) / dur);
  const p = prog(f, from, dur - 1, EASE.soft);
  const s = mix(scale[0], scale[1], p);
  return (
    <Box x={x} y={y} w={w} h={h} style={{ borderRadius: r, ...metalBorder('#0B1220', 2.5), boxShadow: ELEV, overflow: 'hidden', opacity }}>
      <div style={{ position: 'absolute', inset: 0, borderRadius: r - 2, overflow: 'hidden' }}>
        {f >= from && f < from + dur && (
          <Sequence from={from} durationInFrames={dur} layout="none">
            <div style={{ position: 'absolute', inset: 0, transform: `scale(${s.toFixed(5)})` }}>
              <OffthreadVideo src={staticFile(src)} muted playbackRate={rate} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            </div>
          </Sequence>
        )}
        <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(120% 120% at 50% 45%, rgba(0,0,0,0) 60%, rgba(0,0,0,0.35) 100%)' }} />
        {tag ? (
          <div style={{ position: 'absolute', bottom: 16, insetInlineEnd: 16 }}>
            <AiFootageTag text={tag} />
          </div>
        ) : null}
      </div>
    </Box>
  );
};

/* ── HUD ── */
const mixHex = (a: string, b: string, t: number) => {
  const pa = [1, 3, 5].map((i) => parseInt(a.slice(i, i + 2), 16));
  const pb = [1, 3, 5].map((i) => parseInt(b.slice(i, i + 2), 16));
  return `rgb(${pa.map((v, i) => Math.round(mix(v, pb[i], t))).join(',')})`;
};

/** Demo-data chip: fixed box (layout.json chip), top inline-end. Static while shown (the frame check reads it). */
export const DemoChip: React.FC<{ text: string; opacity: number }> = ({ text, opacity }) => {
  if (opacity <= 0.001) return null;
  return (
    <div
      style={{
        position: 'absolute',
        top: 40,
        insetInlineEnd: 72,
        width: 228,
        height: 44,
        boxSizing: 'border-box',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 12,
        borderRadius: 999,
        border: `1.5px solid ${C.border}`,
        background: '#FFFFFF',
        boxShadow: '0 1px 2px rgba(19,34,56,0.06)',
        color: C.ink2,
        fontSize: 23,
        fontWeight: 600,
        opacity,
      }}
    >
      <span style={{ width: 10, height: 10, borderRadius: 2, background: C.gold, transform: 'rotate(45deg)' }} />
      {text}
    </div>
  );
};

/** Roadmap tag (S13–S17): top inline-end, on the navy canvas. */
export const RoadmapTag: React.FC<{ text: string; opacity: number }> = ({ text, opacity }) => {
  if (opacity <= 0.001) return null;
  return (
    <div
      style={{
        position: 'absolute',
        top: 40,
        insetInlineEnd: 72,
        height: 44,
        boxSizing: 'border-box',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '0 20px',
        borderRadius: 999,
        border: '1.5px dashed rgba(255,194,127,0.75)',
        background: 'rgba(255,255,255,0.06)',
        color: '#FFD9B0',
        fontSize: 23,
        fontWeight: 600,
        opacity,
        whiteSpace: 'nowrap',
      }}
    >
      <Icon name="plan" size={22} color="#FFD9B0" />
      {text}
    </div>
  );
};

export const Hud: React.FC<{
  brand: number; // wordmark + rail opacity
  dark: number; // 0 light canvas … 1 navy canvas
  chapter: number;
  chapterBlend: number; // 0..1 crossfade toward `chapter` from the previous one
  prevChapter: number;
  demo: number;
  roadmap: number;
}> = ({ brand, dark, chapter, chapterBlend, prevChapter, demo, roadmap }) => {
  const { c } = useFilm();
  const ink = mixHex(C.ink, '#FFFFFF', dark);
  const ink2 = mixHex(C.ink2, '#C9D6EA', dark);
  return (
    <AbsoluteFill style={{ pointerEvents: 'none' }}>
      {brand > 0.001 && (
        <>
          <div style={{ position: 'absolute', left: 0, right: 0, top: 0, height: 130, opacity: brand * (1 - dark), background: 'linear-gradient(180deg, rgba(244,247,251,0.96) 0px, rgba(244,247,251,0.86) 70px, rgba(244,247,251,0) 130px)' }} />
          <div style={{ position: 'absolute', top: 38, insetInlineStart: 72, opacity: brand }}>
            <div dir="ltr" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <Emblem size={44} id="fhud" />
              <span style={{ fontFamily: FONT.en, fontSize: 27, fontWeight: 650, letterSpacing: '0.09em', color: ink }}>BILTIX</span>
              <span style={{ fontFamily: FONT.en, fontSize: 27, fontWeight: 400, color: ink2 }}>Risk AI</span>
            </div>
          </div>
          {/* chapter rail */}
          <div style={{ position: 'absolute', top: 40, left: 0, right: 0, display: 'flex', justifyContent: 'center', opacity: brand }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, height: 44 }}>
              <div style={{ position: 'relative', minWidth: 300, height: 34, fontSize: 24, fontWeight: 600, color: ink }}>
                {[prevChapter, chapter].map((ch, k) => {
                  const o = k === 0 ? 1 - chapterBlend : chapterBlend;
                  if (o <= 0.001 || (k === 0 && prevChapter === chapter)) return null;
                  return (
                    <span key={k} style={{ position: 'absolute', insetInlineEnd: 0, top: 0, display: 'flex', alignItems: 'baseline', gap: 12, whiteSpace: 'nowrap', opacity: o, transform: `translateY(${((k === 0 ? -1 : 1) * (1 - o) * 10).toFixed(1)}px)` }}>
                      <bdi dir="ltr" style={{ fontFamily: FONT.mono, fontSize: 21, color: ink2 }}>{`0${ch + 1}`}</bdi>
                      <span>{c.chapters[ch]}</span>
                    </span>
                  );
                })}
              </div>
              <div style={{ display: 'flex', gap: 7 }}>
                {c.chapters.map((_, i) => {
                  const on = i < chapter ? 1 : i === chapter ? chapterBlend + (prevChapter === chapter ? 1 : 0) : 0;
                  return (
                    <span key={i} style={{ position: 'relative', width: 46, height: 6, borderRadius: 3, background: dark > 0.5 ? 'rgba(255,255,255,0.18)' : C.pressed, overflow: 'hidden' }}>
                      <span style={{ position: 'absolute', inset: 0, background: METAL, opacity: Math.min(1, on) }} />
                    </span>
                  );
                })}
              </div>
            </div>
          </div>
        </>
      )}
      <DemoChip text={c.demo} opacity={demo} />
      <RoadmapTag text={c.roadmapTag} opacity={roadmap} />
    </AbsoluteFill>
  );
};

/* ── captions: one plate per chunk, bottom centre, ≤ 2 lines at 42 px ── */
export const Captions: React.FC<{ chunks: Chunk[] }> = ({ chunks }) => {
  const f = useCurrentFrame();
  const { rtl } = useFilm();
  const k = chunks.findIndex((ch) => f >= ch.from - 4 && f < ch.to + 4);
  if (k < 0) return null;
  const ch = chunks[k];
  const pin = prog(f, ch.from - 4, 5, EASE.out);
  const pout = 1 - prog(f, ch.to - 1, 5, EASE.inOut);
  const o = Math.min(pin, pout);
  if (o <= 0.001) return null;
  return (
    <div style={{ position: 'absolute', left: 0, right: 0, bottom: 40, display: 'flex', justifyContent: 'center', opacity: o, transform: `translateY(${((1 - pin) * 8).toFixed(2)}px)` }}>
      <div
        style={{
          position: 'relative',
          maxWidth: 1540,
          padding: rtl ? '12px 40px 16px' : '13px 40px 15px',
          borderRadius: 18,
          background: 'rgba(255,255,255,0.95)',
          border: `1px solid ${C.border}`,
          boxShadow: '0 2px 4px rgba(19,34,56,0.08), 0 22px 44px -22px rgba(19,34,56,0.42)',
          fontSize: 42,
          fontWeight: 500,
          lineHeight: rtl ? 1.5 : 1.36,
          color: C.ink,
          textAlign: 'center',
          textWrap: 'balance',
        }}
      >
        <span style={{ position: 'absolute', bottom: -1, left: '50%', width: 120, marginLeft: -60, height: 4, borderRadius: 2, background: METAL }} />
        {ch.text}
      </div>
    </div>
  );
};
