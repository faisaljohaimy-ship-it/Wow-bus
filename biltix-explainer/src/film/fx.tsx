/**
 * Film v2 motion layer: the living backdrop (drifting survey grid, ambient light, dust), the scene camera (a slow
 * continuous push so no frame ever holds still), letterbox, cinematic grades, the AI-footage tag, light sweeps,
 * pulses streaming along connectors, and the Screen: a real recording of the app (public/v2/ui) — or, until one
 * exists, the real capture with a continuous camera — in a browser or phone frame with focus zooms.
 * 2D only (opacity, translate, scale, rotate, clip-path); no CSS 3D, no backdrop-filter, no blur filters.
 */
import React from 'react';
import { AbsoluteFill, Img, OffthreadVideo, Sequence, useCurrentFrame } from 'remotion';
import { keys, mix, prog } from '../lib/anim';
import { BEAM, C, EASE, ELEV, FONT, METAL } from '../theme';
import { AiFootageTag, Box, metalBorder, NAVY, NAVY2, useFilm } from './kit';
import { capture, uiClip, uiFile, type UiName } from './media';
import { FPS } from './timeline';

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

/* ── living backdrop: light plane ↔ navy roadmap plane, drifting grid, slow ambient light ── */
export const Backdrop: React.FC<{ dark: number; at?: number }> = ({ dark, at }) => {
  const lf = useCurrentFrame();
  const f = at ?? lf;
  const cell = 120;
  const ox = (f * 0.35) % cell;
  const oy = (f * 0.18) % cell;
  const a = f / FPS;
  const b1 = [28 + 6 * Math.sin(a * 0.11), 18 + 5 * Math.cos(a * 0.09)];
  const b2 = [76 + 5 * Math.cos(a * 0.08), 32 + 6 * Math.sin(a * 0.12)];
  const b3 = [58 + 8 * Math.sin(a * 0.07), 104];
  return (
    <AbsoluteFill>
      {dark < 1 && (
        <AbsoluteFill style={{ background: C.bg }}>
          <AbsoluteFill
            style={{
              background: `radial-gradient(1200px 760px at ${b1[0]}% ${b1[1]}%, rgba(47,111,237,0.09), rgba(47,111,237,0) 70%), radial-gradient(1000px 640px at ${b2[0]}% ${b2[1]}%, rgba(14,147,172,0.075), rgba(14,147,172,0) 70%), radial-gradient(900px 520px at ${b3[0]}% ${b3[1]}%, rgba(232,115,27,0.07), rgba(232,115,27,0) 70%)`,
            }}
          />
          <svg width={1920} height={1080} style={{ position: 'absolute', inset: 0 }}>
            <defs>
              <pattern id="fl-grid" width={cell} height={cell} patternUnits="userSpaceOnUse" x={ox} y={oy}>
                <path d={`M 0 0.5 H ${cell} M 0.5 0 V ${cell}`} fill="none" stroke={C.grid} strokeOpacity={0.04} strokeWidth={1} />
                <path d={`M 0 0.5 h 8 M ${cell - 8} 0.5 h 8 M 0.5 0 v 8 M 0.5 ${cell - 8} v 8`} fill="none" stroke={C.grid} strokeOpacity={0.09} strokeWidth={1.4} />
              </pattern>
            </defs>
            <rect width={1920} height={1080} fill="url(#fl-grid)" />
          </svg>
          <AbsoluteFill style={{ background: 'radial-gradient(72% 72% at 50% 42%, rgba(244,247,251,0) 40%, rgba(244,247,251,0.75) 100%)' }} />
        </AbsoluteFill>
      )}
      {dark > 0 && (
        <AbsoluteFill style={{ opacity: dark, background: `linear-gradient(160deg, ${NAVY2} 0%, ${NAVY} 55%, #07111F 100%)` }}>
          <AbsoluteFill
            style={{
              background: `radial-gradient(1100px 700px at ${b2[0] - 8}% ${b1[1] + 6}%, rgba(25,198,230,0.10), rgba(25,198,230,0) 70%), radial-gradient(900px 600px at ${b1[0]}% ${b3[1] - 10}%, rgba(255,140,40,0.10), rgba(255,140,40,0) 70%)`,
            }}
          />
          <svg width={1920} height={1080} style={{ position: 'absolute', inset: 0 }}>
            <defs>
              <pattern id="fd-grid" width={cell} height={cell} patternUnits="userSpaceOnUse" x={ox} y={oy}>
                <path d={`M 0 0.5 H ${cell} M 0.5 0 V ${cell}`} fill="none" stroke="#FFFFFF" strokeOpacity={0.045} strokeWidth={1} />
                <path d={`M 0 0.5 h 8 M ${cell - 8} 0.5 h 8 M 0.5 0 v 8 M 0.5 ${cell - 8} v 8`} fill="none" stroke="#FFFFFF" strokeOpacity={0.12} strokeWidth={1.4} />
              </pattern>
            </defs>
            <rect width={1920} height={1080} fill="url(#fd-grid)" />
          </svg>
        </AbsoluteFill>
      )}
    </AbsoluteFill>
  );
};

/** Floating dust / light motes (deterministic), drifting up with a slow sway — the canvas is never still. */
const MOTES = Array.from({ length: 34 }, (_, i) => {
  const r = (k: number) => {
    const x = Math.sin(i * 127.1 + k * 311.7) * 43758.5453;
    return x - Math.floor(x);
  };
  return { x: r(1) * 1920, y: r(2) * 1080, s: 1.5 + r(3) * 3.2, v: 0.25 + r(4) * 0.55, ph: r(5) * 6.28, warm: r(6) > 0.55 };
});
export const Dust: React.FC<{ dark: number; opacity?: number; at?: number }> = ({ dark, opacity = 1, at }) => {
  const lf = useCurrentFrame();
  const f = at ?? lf;
  return (
    <svg width={1920} height={1080} style={{ position: 'absolute', inset: 0, opacity }}>
      {MOTES.map((m, i) => {
        const y = (((m.y - f * m.v) % 1180) + 1180) % 1180 - 50;
        const x = m.x + Math.sin(f / 70 + m.ph) * 26;
        const tw = 0.45 + 0.55 * Math.sin(f / 23 + m.ph * 3) ** 2;
        const col = m.warm ? '#FF9A3C' : dark > 0.5 ? '#9FE3F2' : '#2F6FED';
        return <circle key={i} cx={x} cy={y} r={m.s} fill={col} opacity={(dark > 0.5 ? 0.42 : 0.2) * tw} />;
      })}
    </svg>
  );
};

/** Scene camera: a slow eased push and drift across the whole scene (x mirrored in Arabic). */
export const SceneCam: React.FC<{ frames: number; zoom?: [number, number]; drift?: [number, number]; origin?: string; children: React.ReactNode }> = ({
  frames,
  zoom = [1, 1.035],
  drift = [0, 0],
  origin = '50% 46%',
  children,
}) => {
  const f = useCurrentFrame();
  const { rtl } = useFilm();
  const p = prog(f, -6, frames + 24, EASE.soft);
  const s = mix(zoom[0], zoom[1], p);
  const dx = (rtl ? -1 : 1) * drift[0] * p;
  const dy = drift[1] * p;
  return <AbsoluteFill style={{ transform: `translate(${dx.toFixed(2)}px, ${dy.toFixed(2)}px) scale(${s.toFixed(5)})`, transformOrigin: origin }}>{children}</AbsoluteFill>;
};

/** Camera shake (a decaying wobble) after an impact at frame `at`. */
export const shake = (f: number, at: number, amp = 10): string => {
  const t = f - at;
  if (t < 0 || t > 16) return 'none';
  const k = Math.exp(-t / 4.5) * amp;
  return `translate(${(Math.sin(t * 2.9) * k).toFixed(2)}px, ${(Math.cos(t * 3.7) * k * 0.6).toFixed(2)}px)`;
};

/* ── 2.39:1 letterbox ── */
export const LB = Math.round((1080 - 1920 / 2.39) / 2); // 138
export const Letterbox: React.FC<{ bar: number }> = ({ bar }) =>
  bar <= 0.5 ? null : (
    <>
      <div style={{ position: 'absolute', left: 0, right: 0, top: 0, height: bar, background: '#05070B' }} />
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: bar, background: '#05070B' }} />
    </>
  );

/* ── grades ── */
export const WarmGrade: React.FC<{ k?: number }> = ({ k = 1 }) => (
  <>
    {/* plain alpha layers only (no blend modes: they force full-frame offscreen passes in the software compositor) */}
    <AbsoluteFill style={{ opacity: k, background: 'linear-gradient(168deg, rgba(255,150,64,0.26) 0%, rgba(255,176,110,0.12) 42%, rgba(255,190,140,0) 62%, rgba(24,40,72,0.16) 100%)' }} />
    <AbsoluteFill style={{ background: 'radial-gradient(130% 120% at 50% 46%, rgba(12,8,5,0) 52%, rgba(12,8,5,0.28) 78%, rgba(12,8,5,0.55) 100%)' }} />
  </>
);
export const CoolGrade: React.FC<{ k?: number }> = ({ k = 1 }) => (
  <>
    <AbsoluteFill style={{ opacity: k, background: 'linear-gradient(170deg, rgba(20,90,170,0.24) 0%, rgba(14,120,150,0.10) 50%, rgba(255,140,60,0.08) 100%)' }} />
    <AbsoluteFill style={{ background: 'radial-gradient(130% 120% at 50% 46%, rgba(4,10,20,0) 50%, rgba(4,10,20,0.32) 78%, rgba(4,10,20,0.6) 100%)' }} />
  </>
);
/** Bottom shade so captions and lower text sit on footage. */
export const LowShade: React.FC<{ k?: number }> = ({ k = 1 }) => (
  <AbsoluteFill style={{ background: `linear-gradient(180deg, rgba(6,10,18,${(0.35 * k).toFixed(3)}) 0%, rgba(6,10,18,0) 20%, rgba(6,10,18,0) 55%, rgba(6,10,18,${(0.62 * k).toFixed(3)}) 100%)` }} />
);

/* ── full-bleed AI clip with an eased push and drift; slowed (never below `minRate`) to fill its window ── */
export const Clip: React.FC<{ src: string; from: number; dur: number; scale?: [number, number]; drift?: [number, number]; opacity?: number; start?: number; srcDur?: number; origin?: string; offsetX?: number }> = ({
  src,
  from,
  dur,
  scale = [1.02, 1.1],
  drift = [0, 0],
  opacity = 1,
  start = 0,
  srcDur = 4,
  origin = '50% 50%',
  offsetX = 0,
}) => {
  const f = useCurrentFrame();
  if (opacity <= 0.001 || f < from || f >= from + dur) return null;
  const avail = srcDur - start - 0.08;
  const rate = Math.min(1, Math.max(0.5, (avail * FPS) / dur));
  const p = prog(f, from, dur - 1, EASE.soft);
  const s = mix(scale[0], scale[1], p);
  const maxX = ((s - 1) * 1920) / 2;
  const maxY = ((s - 1) * 1080) / 2;
  const tx = Math.max(-maxX, Math.min(maxX, drift[0] * p));
  const ty = Math.max(-maxY, Math.min(maxY, drift[1] * p));
  return (
    <Sequence from={from} durationInFrames={dur} layout="none">
      <AbsoluteFill style={{ opacity, overflow: 'hidden' }}>
        <AbsoluteFill style={{ transform: `translate(${(tx + offsetX).toFixed(2)}px, ${ty.toFixed(2)}px) scale(${s.toFixed(5)})`, transformOrigin: origin }}>
          <OffthreadVideo src={src} muted playbackRate={rate} trimBefore={Math.round(start * FPS)} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        </AbsoluteFill>
      </AbsoluteFill>
    </Sequence>
  );
};

/** The AI-footage tag, screen-fixed while generated footage is on screen. */
export const FootageTag: React.FC<{ text: string; opacity: number; top?: number }> = ({ text, opacity, top = 104 }) =>
  opacity <= 0.001 ? null : (
    <div style={{ position: 'absolute', top, insetInlineEnd: 72, opacity }}>
      <AiFootageTag text={text} size={22} />
    </div>
  );

/* ── light sweep: a soft bright band travelling across a box (inside an overflow-hidden parent) ── */
export const Shine: React.FC<{ at: number; dur?: number; every?: number; strength?: number }> = ({ at, dur = 36, every = 0, strength = 0.55 }) => {
  const f = useCurrentFrame();
  const { rtl } = useFilm();
  let t = f - at;
  if (every > 0 && t > 0) t %= every;
  if (t < 0 || t > dur) return null;
  const p = EASE.inOut(t / dur);
  const x = mix(-40, 140, p);
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        pointerEvents: 'none',
        background: `linear-gradient(${rtl ? 250 : 110}deg, rgba(255,255,255,0) ${x - 22}%, rgba(255,255,255,${(strength * 0.7).toFixed(2)}) ${x - 6}%, rgba(255,230,200,${(strength * 0.45).toFixed(2)}) ${x}%, rgba(255,255,255,0) ${x + 16}%)`,
      }}
    />
  );
};

/* ── several pulses streaming along an SVG path (pathLength = 1) ── */
export const Stream: React.FC<{ d: string; n?: number; speed?: number; color?: string; width?: number; opacity?: number; phase?: number; len?: number }> = ({
  d,
  n = 3,
  speed = 0.012,
  color = '#FF5E00',
  width = 5,
  opacity = 1,
  phase = 0,
  len = 0.035,
}) => {
  const f = useCurrentFrame();
  if (opacity <= 0.01) return null;
  return (
    <g opacity={opacity}>
      {Array.from({ length: n }, (_, i) => {
        const u = (((f * speed + phase + i / n) % 1) + 1) % 1;
        const fade = Math.sin(Math.PI * u);
        return (
          <path
            key={i}
            d={d}
            pathLength={1}
            fill="none"
            stroke={color}
            strokeWidth={width}
            strokeLinecap="round"
            strokeDasharray={`${len} 2`}
            strokeDashoffset={-(u * (1 + len) - len)}
            opacity={fade}
          />
        );
      })}
    </g>
  );
};

/* ── the app on screen: a real recording when one exists, else the real capture under a continuous camera ── */
export type FocusKey = [number, number, number, number]; // [frame, zoom, fx, fy] (focus point 0..1 of the screen)
export const Screen: React.FC<{
  ui: UiName;
  fallback: string;
  x: number;
  y: number;
  w: number;
  from?: number;
  dur: number;
  focus?: FocusKey[];
  /** focus keys on the recording's own clock [seconds, zoom, fx, fy]; used instead of `focus` when a recording exists */
  clipFocus?: FocusKey[];
  phone?: boolean;
  startAt?: number;
  label?: string;
  opacity?: number;
  style?: React.CSSProperties;
  bar?: number;
  shine?: number;
  children?: React.ReactNode;
}> = ({ ui, fallback, x, y, w, from = 0, dur, focus = [[0, 1, 0.5, 0.5]], clipFocus, phone, startAt = 0, label, opacity = 1, style, bar = 44, shine, children }) => {
  const f = useCurrentFrame();
  const { lang, rtl, c } = useFilm();
  if (opacity <= 0.001) return null;
  const rec = uiClip(ui, lang);
  const cap = capture(lang, fallback);
  const W = w;
  const H = phone ? Math.round((w * 844) / 390) : Math.round((w * 9) / 16);
  // recording: slowed to fill the window (≥ 0.6×); it fades to the capture if it still ends early
  const need = dur / FPS;
  const avail = rec ? rec.dur - startAt - 0.1 : 0;
  const rate = rec ? Math.min(1, Math.max(0.6, avail / need)) : 1;
  const fk: FocusKey[] = rec && clipFocus ? clipFocus.map(([sec, zz, xx, yy]) => [from + ((sec - startAt) / rate) * FPS, zz, xx, yy]) : focus;
  const z = keys(f, fk.map(([k, zz]) => [k, zz] as [number, number]), EASE.cam);
  const fx = keys(f, fk.map(([k, , xx]) => [k, xx] as [number, number]), EASE.cam);
  const fy = keys(f, fk.map(([k, , , yy]) => [k, yy] as [number, number]), EASE.cam);
  const tx = Math.max(W - W * z, Math.min(0, W / 2 - fx * W * z));
  const ty = Math.max(H - H * z, Math.min(0, H / 2 - fy * H * z));
  const recFrames = rec ? Math.min(dur, Math.floor((avail / rate) * FPS)) : 0;
  const recOut = rec && recFrames < dur ? 1 - prog(f, from + recFrames - 8, 8, EASE.inOut) : 1;
  const tag = label ?? (rec ? c.screenRec : c.screenCap);
  const radius = phone ? Math.round(w * 0.14) : 18;
  const content = (
    <div style={{ position: 'absolute', left: 0, top: 0, width: W, height: H, transformOrigin: '0 0', transform: `translate(${tx.toFixed(2)}px, ${ty.toFixed(2)}px) scale(${z.toFixed(5)})` }}>
      <Img src={cap.src} style={{ position: 'absolute', inset: 0, width: W, height: H, objectFit: 'cover', objectPosition: 'top' }} />
      {rec && recFrames > 0 && (
        <Sequence from={from} durationInFrames={recFrames} layout="none">
          <div style={{ position: 'absolute', inset: 0, opacity: recOut, background: '#fff' }}>
            <OffthreadVideo src={uiFile(ui, lang)} muted playbackRate={rate} trimBefore={Math.round(startAt * rec.fps)} style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'top' }} />
          </div>
        </Sequence>
      )}
      {children}
    </div>
  );
  return (
    <Box x={x} y={y} w={W + (phone ? 0 : 4)} h={H + (phone ? 0 : bar + 4)} style={{ opacity, ...style }}>
      {label !== '' && (
        <div style={{ position: 'absolute', top: phone ? -56 : -52, insetInlineStart: phone ? 0 : 6, display: 'flex', alignItems: 'center', gap: 10, fontSize: 22, fontWeight: 600, color: 'inherit', whiteSpace: 'nowrap' }}>
          <span style={{ width: 10, height: 10, borderRadius: 99, background: rec ? '#E5484D' : C.accent, boxShadow: rec ? '0 0 0 4px rgba(229,72,77,0.18)' : 'none', opacity: rec ? 0.55 + 0.45 * Math.abs(Math.sin(f / 9)) : 1 }} />
          <span>{tag}</span>
        </div>
      )}
      {phone ? (
        <div
          style={{
            position: 'absolute',
            inset: -14,
            borderRadius: radius + 14,
            background: 'linear-gradient(145deg, #3A4352 0%, #1B222D 40%, #2A323F 70%, #11161E 100%)',
            boxShadow: '0 2px 3px rgba(19,34,56,0.18), 0 40px 70px -30px rgba(5,10,20,0.7), 0 0 0 1.5px rgba(232,115,27,0.6)',
          }}
        >
          <div style={{ position: 'absolute', left: 14, top: 14, width: W, height: H, borderRadius: radius, overflow: 'hidden', background: '#fff' }}>
            {content}
            <div style={{ position: 'absolute', top: Math.round(w * 0.03), left: '50%', width: w * 0.3, height: w * 0.085, marginLeft: -w * 0.15, borderRadius: 99, background: '#0B0F15' }} />
            {shine !== undefined && <Shine at={shine} every={150} strength={0.35} />}
          </div>
        </div>
      ) : (
        <div style={{ position: 'absolute', inset: 0, borderRadius: radius, ...metalBorder('#FFFFFF', 2), boxShadow: '0 2px 4px rgba(19,34,56,0.08), 0 40px 80px -36px rgba(10,20,40,0.55), 0 18px 40px -26px rgba(200,90,20,0.4)', overflow: 'hidden' }}>
          <div dir="ltr" style={{ position: 'absolute', left: 0, right: 0, top: 0, height: bar, background: '#F7F9FC', borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', gap: 10, padding: '0 18px' }}>
            {[0, 1, 2].map((i) => (
              <span key={i} style={{ width: 12, height: 12, borderRadius: 99, background: '#E4E9F0', boxShadow: 'inset 0 0 0 1px #D2DAE5' }} />
            ))}
            <div style={{ marginInlineStart: 14, height: 28, flex: '0 1 520px', borderRadius: 99, background: '#FFFFFF', border: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', gap: 8, padding: '0 14px', fontFamily: FONT.en, fontSize: 16, color: C.ink3, whiteSpace: 'nowrap', overflow: 'hidden' }}>
              <svg width={12} height={14} viewBox="0 0 12 14" aria-hidden>
                <rect x={1} y={6} width={10} height={7} rx={2} fill="none" stroke={C.ink3} strokeWidth={1.4} />
                <path d="M3.5 6V4.2a2.5 2.5 0 0 1 5 0V6" fill="none" stroke={C.ink3} strokeWidth={1.4} />
              </svg>
              biltix-risk-ai.vercel.app
            </div>
          </div>
          <div style={{ position: 'absolute', left: 0, right: 0, top: bar, bottom: 0, overflow: 'hidden', background: '#fff' }}>
            {content}
            {shine !== undefined && <Shine at={shine} every={160} strength={0.32} />}
          </div>
        </div>
      )}
      {/* RTL/LTR follows the page; the screen itself is the app as captured */}
      <span style={{ display: 'none' }}>{rtl ? 'rtl' : 'ltr'}</span>
    </Box>
  );
};

/** Laser-ring "focus" that draws round a box and breathes (on screens and diagrams). */
export const FocusRing: React.FC<{ x: number; y: number; w: number; h: number; at: number; r?: number; color?: string }> = ({ x, y, w, h, at, r = 16, color = '#FF6A00' }) => {
  const f = useCurrentFrame();
  const { rtl } = useFilm();
  const p = prog(f, at, 18, EASE.out);
  if (p <= 0) return null;
  const P = 2 * (w + h);
  const breathe = 0.5 + 0.5 * Math.sin((f - at) / 8);
  const X = rtl ? 1920 - x - w : x;
  return (
    <svg width={1920} height={1080} style={{ position: 'absolute', left: 0, top: 0, overflow: 'visible' }}>
      <rect x={X - 6} y={y - 6} width={w + 12} height={h + 12} rx={r} fill="none" stroke={color} strokeOpacity={0.25 * breathe} strokeWidth={10} />
      <rect x={X - 6} y={y - 6} width={w + 12} height={h + 12} rx={r} fill="none" stroke={color} strokeWidth={3} strokeDasharray={`${(P + 48) * p} ${P + 48}`} />
    </svg>
  );
};

/** Big eased counter (Western digits, isolated LTR). */
export const Count: React.FC<{ from?: number; to: number; at: number; dur?: number; digits?: number; style?: React.CSSProperties; prefix?: string; suffix?: string }> = ({
  from = 0,
  to,
  at,
  dur = 36,
  digits = 0,
  style,
  prefix = '',
  suffix = '',
}) => {
  const f = useCurrentFrame();
  const v = mix(from, to, prog(f, at, dur, EASE.expo));
  return (
    <bdi dir="ltr" style={{ unicodeBidi: 'isolate', fontVariantNumeric: 'tabular-nums', ...style }}>
      {prefix}
      {v.toFixed(digits)}
      {suffix}
    </bdi>
  );
};

/** Orange glow dot (the laser head) at a physical point. */
export const Spark: React.FC<{ x: number; y: number; r?: number; opacity?: number }> = ({ x, y, r = 16, opacity = 1 }) => (
  <div
    style={{
      position: 'absolute',
      left: x - r,
      top: y - r,
      width: r * 2,
      height: r * 2,
      borderRadius: 99,
      opacity,
      background: `radial-gradient(circle, #FFFFFF 0%, ${BEAM.head} 22%, rgba(255,94,0,0.55) 48%, rgba(255,94,0,0) 72%)`,
    }}
  />
);

export { clamp01, METAL, ELEV };
