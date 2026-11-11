/**
 * Building blocks of the MVP showcase, in the app's light theme: survey-grid backdrop, capture cards with the
 * nickel-orange metal edge, a browser frame, a phone frame, laser highlights, screen-space callouts, a pointer,
 * chips and the wordmark. All motion is 2D (opacity, translate, scale, one matrix per camera plane): no CSS 3D,
 * no backdrop-filter, no blur filters.
 */
import React, { useLayoutEffect, useRef, useState } from 'react';
import { AbsoluteFill, Img, cancelRender, continueRender, delayRender, useCurrentFrame } from 'remotion';
import { Comet } from '../components/Metal';
import { Emblem } from '../components/Emblem';
import { prog } from '../lib/anim';
import { applyAffine, planeAffine, type Cam } from '../lib/camera';
import { BEAM, C, EASE, ELEV, FONT, METAL } from '../theme';
import { src, type Placed, type Rect, worldRect } from './captures';

/* ── backdrop: app plane, ambient light and the light theme's survey grid (static: cached by the compositor) ── */
export const Backdrop: React.FC = () => {
  const cell = 120;
  return (
    <AbsoluteFill style={{ background: C.bg }}>
      <AbsoluteFill
        style={{
          background:
            'radial-gradient(1200px 760px at 28% 18%, rgba(47,111,237,0.085), rgba(47,111,237,0) 70%), radial-gradient(1000px 640px at 78% 30%, rgba(14,147,172,0.07), rgba(14,147,172,0) 70%), radial-gradient(900px 520px at 60% 108%, rgba(232,115,27,0.06), rgba(232,115,27,0) 70%)',
        }}
      />
      <svg width={1920} height={1080} style={{ position: 'absolute', inset: 0 }}>
        <defs>
          <pattern id="sc-grid" width={cell} height={cell} patternUnits="userSpaceOnUse" x={0} y={0}>
            <path d={`M 0 0.5 H ${cell} M 0.5 0 V ${cell}`} fill="none" stroke={C.grid} strokeOpacity={0.035} strokeWidth={1} />
            <path d={`M 0 0.5 h 8 M ${cell - 8} 0.5 h 8 M 0.5 0 v 8 M 0.5 ${cell - 8} v 8`} fill="none" stroke={C.grid} strokeOpacity={0.08} strokeWidth={1.4} />
          </pattern>
          <radialGradient id="sc-fade" cx="50%" cy="40%" r="70%">
            <stop offset="0%" stopColor="#fff" stopOpacity={1} />
            <stop offset="100%" stopColor="#fff" stopOpacity={0.3} />
          </radialGradient>
          <mask id="sc-mask">
            <rect width={1920} height={1080} fill="url(#sc-fade)" />
          </mask>
        </defs>
        <rect width={1920} height={1080} fill="url(#sc-grid)" mask="url(#sc-mask)" />
      </svg>
    </AbsoluteFill>
  );
};

/** Vignette: a hair of depth at the frame edges (screen-fixed). */
export const Vignette: React.FC = () => (
  <AbsoluteFill style={{ pointerEvents: 'none', background: 'radial-gradient(1500px 980px at 50% 46%, rgba(19,34,56,0) 64%, rgba(19,34,56,0.07) 100%)' }} />
);

/* ── metal edge as a CSS border (same banded gradient as --edge-metal) ── */
export const metalBorder = (fill = C.surface, width = 2): React.CSSProperties => ({
  border: `${width}px solid transparent`,
  background: `linear-gradient(${fill}, ${fill}) padding-box, ${METAL} border-box`,
});

/**
 * A capture in world space, optionally cropped to a CSS rectangle, in a rounded card with the metal edge.
 * The card sits at worldRect(p, crop), so every mark of the capture maps with worldRect(p, mark).
 */
export const ShotCard: React.FC<{
  p: Placed;
  crop?: Rect;
  radius?: number;
  edge?: 'metal' | 'line' | 'none';
  shadow?: boolean;
  opacity?: number;
  style?: React.CSSProperties;
  children?: React.ReactNode;
}> = ({ p, crop, radius = 18, edge = 'metal', shadow = true, opacity = 1, style, children }) => {
  const cr = crop || { x: 0, y: 0, w: p.c.cssW, h: p.c.cssH };
  const r = worldRect(p, cr);
  const bw = edge === 'none' ? 0 : 2;
  return (
    <div
      style={{
        position: 'absolute',
        left: r.x - bw,
        top: r.y - bw,
        width: r.w + bw * 2,
        height: r.h + bw * 2,
        boxSizing: 'border-box',
        borderRadius: radius,
        ...(edge === 'metal' ? metalBorder() : edge === 'line' ? { border: `${bw}px solid ${C.border}`, background: C.surface } : { background: C.surface }),
        boxShadow: shadow ? ELEV : undefined,
        overflow: 'hidden',
        opacity,
        ...style,
      }}
    >
      <div style={{ position: 'absolute', inset: 0, borderRadius: radius - bw, overflow: 'hidden' }}>
        <Img
          src={src(p.c)}
          style={{ position: 'absolute', left: -cr.x * p.scale, top: -cr.y * p.scale, width: p.c.cssW * p.scale, height: p.c.cssH * p.scale, maxWidth: 'none' }}
        />
        {children}
      </div>
    </div>
  );
};

/** Browser window: metal edge, a quiet toolbar with the deployment URL, and the capture (scrollable via `crop`). */
export const BrowserFrame: React.FC<{
  p: Placed;
  crop: Rect;
  url: string;
  bar?: number;
  radius?: number;
  opacity?: number;
  style?: React.CSSProperties;
  children?: React.ReactNode;
}> = ({ p, crop, url, bar = 46, radius = 20, opacity = 1, style, children }) => {
  const r = worldRect(p, crop);
  return (
    <div
      style={{
        position: 'absolute',
        left: r.x - 2,
        top: r.y - bar - 2,
        width: r.w + 4,
        height: r.h + bar + 4,
        boxSizing: 'border-box',
        borderRadius: radius,
        ...metalBorder(),
        boxShadow: ELEV,
        overflow: 'hidden',
        opacity,
        ...style,
      }}
    >
      <div dir="ltr" style={{ position: 'absolute', left: 0, right: 0, top: 0, height: bar, background: '#F7F9FC', borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', gap: 10, padding: '0 18px' }}>
        {['#E4E9F0', '#E4E9F0', '#E4E9F0'].map((c, i) => (
          <span key={i} style={{ width: 12, height: 12, borderRadius: 99, background: c, boxShadow: 'inset 0 0 0 1px #D2DAE5' }} />
        ))}
        <div style={{ marginInlineStart: 18, height: 28, flex: '0 1 560px', borderRadius: 99, background: '#FFFFFF', border: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', gap: 8, padding: '0 14px', fontFamily: FONT.en, fontSize: 15, color: C.ink3, whiteSpace: 'nowrap', overflow: 'hidden' }}>
          <svg width={12} height={14} viewBox="0 0 12 14" aria-hidden>
            <rect x={1} y={6} width={10} height={7} rx={2} fill="none" stroke={C.ink3} strokeWidth={1.4} />
            <path d="M3.5 6V4.2a2.5 2.5 0 0 1 5 0V6" fill="none" stroke={C.ink3} strokeWidth={1.4} />
          </svg>
          {url}
        </div>
      </div>
      <div style={{ position: 'absolute', left: 0, right: 0, top: bar, bottom: 0, overflow: 'hidden' }}>
        <Img src={src(p.c)} style={{ position: 'absolute', left: -crop.x * p.scale, top: -crop.y * p.scale, width: p.c.cssW * p.scale, height: p.c.cssH * p.scale, maxWidth: 'none' }} />
        {children}
      </div>
    </div>
  );
};

/** Phone: graphite bezel, dynamic-island notch, the capture as the screen (390 × 844 CSS px). */
export const PhoneFrame: React.FC<{ p: Placed; style?: React.CSSProperties }> = ({ p, style }) => {
  const w = p.c.cssW * p.scale;
  const h = p.c.cssH * p.scale;
  const b = 13 * (p.scale / 0.9); // bezel
  const R = 58 * (p.scale / 0.9);
  return (
    <div
      style={{
        position: 'absolute',
        left: p.x - b,
        top: p.y - b,
        width: w + 2 * b,
        height: h + 2 * b,
        borderRadius: R + b,
        background: 'linear-gradient(145deg, #3A4352 0%, #1B222D 40%, #2A323F 70%, #11161E 100%)',
        boxShadow: '0 2px 3px rgba(19,34,56,0.18), 0 34px 60px -28px rgba(19,34,56,0.55), 0 0 0 1.5px rgba(232,115,27,0.55)',
        ...style,
      }}
    >
      <div style={{ position: 'absolute', left: b, top: b, width: w, height: h, borderRadius: R, overflow: 'hidden', background: '#fff' }}>
        <Img src={src(p.c)} style={{ width: w, height: h, display: 'block' }} />
        <div style={{ position: 'absolute', top: 11 * p.scale, left: '50%', width: 118 * p.scale, height: 34 * p.scale, marginLeft: -59 * p.scale, borderRadius: 99, background: '#0B0F15' }} />
      </div>
    </div>
  );
};

/* ── laser highlight: a thin rounded frame that draws on, with the beam comet running round it ── */
export const Highlight: React.FC<{ r: Rect; rtl: boolean; at: number; radius?: number; color?: string; comet?: boolean; width?: number; out?: number }> = ({
  r,
  rtl,
  at,
  radius = 12,
  color = C.primary,
  comet = true,
  width = 3,
  out,
}) => {
  const frame = useCurrentFrame();
  const draw = prog(frame, at, 16, EASE.inOut);
  const fade = out === undefined ? 1 : 1 - prog(frame, out, 10, EASE.inOut);
  if (draw <= 0 || fade <= 0) return null;
  const P = 2 * (r.w + r.h) - 8 * radius + 2 * Math.PI * radius;
  return (
    <div style={{ position: 'absolute', left: r.x, top: r.y, width: r.w, height: r.h, opacity: fade, pointerEvents: 'none' }}>
      <svg width={r.w} height={r.h} style={{ position: 'absolute', inset: 0, overflow: 'visible' }}>
        <rect x={-6} y={-6} width={r.w + 12} height={r.h + 12} rx={radius + 6} fill="none" stroke={color} strokeOpacity={0.14 * draw} strokeWidth={10} />
        <rect
          x={0}
          y={0}
          width={r.w}
          height={r.h}
          rx={radius}
          fill="none"
          stroke={color}
          strokeWidth={width}
          strokeDasharray={`${P * draw} ${P}`}
          transform={rtl ? `translate(${r.w} 0) scale(-1 1)` : undefined}
        />
      </svg>
      {comet && (
        <div style={{ position: 'absolute', inset: 0, border: '2px solid transparent', boxSizing: 'border-box' }}>
          <Comet w={r.w} h={r.h} r={radius} rtl={rtl} speed={9} len={120} opacity={prog(frame, at + 8, 14)} />
        </div>
      )}
    </div>
  );
};

/** Project a world point through the camera (plane at depth 0) to the screen. */
export const toScreen = (cam: Cam, x: number, y: number) => applyAffine(planeAffine(cam, 0), x, y);
export const rectToScreen = (cam: Cam, r: Rect): Rect => {
  const a = toScreen(cam, r.x, r.y);
  const b = toScreen(cam, r.x + r.w, r.y + r.h);
  return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(b.x - a.x), h: Math.abs(b.y - a.y) };
};

/**
 * Screen-space callout: a dot on the anchor, a thin elbow line, and a label plate (constant size, always crisp).
 * Give `box` (the target's screen rect): the label goes to the inline-end side of it when there is room, else to
 * the other side, and stays clear of the top band and the lower third. `dx` is the horizontal reach (px).
 */
export const Callout: React.FC<{
  box?: Rect;
  anchor?: { x: number; y: number };
  ay?: number;
  label: string;
  note?: string;
  dx: number;
  dy: number;
  at: number;
  out?: number;
  rtl: boolean;
}> = ({ box, anchor: anchorIn, ay = 0.35, label, note, dx: reach, dy, at, out, rtl }) => {
  const frame = useCurrentFrame();
  const line = prog(frame, at, 14, EASE.inOut);
  const lab = prog(frame, at + 8, 14, EASE.out);
  const fade = out === undefined ? 1 : 1 - prog(frame, out, 10, EASE.inOut);
  if (line <= 0 || fade <= 0) return null;
  const w = Math.max(label.length * 15.5, (note || '').length * 11) + 48;
  let anchor = anchorIn || { x: 960, y: 540 };
  let dx = reach;
  if (box) {
    const reachAbs = Math.abs(reach);
    const roomRight = 1880 - (box.x + box.w + reachAbs + 10);
    const roomLeft = box.x - reachAbs - 10 - 40;
    const right = rtl ? !(roomLeft >= w) && roomRight >= roomLeft : roomRight >= w || roomRight >= roomLeft;
    anchor = { x: right ? box.x + box.w : box.x, y: box.y + box.h * ay };
    dx = right ? reachAbs : -reachAbs;
  }
  const ex = anchor.x + dx;
  const ey = Math.min(800, Math.max(170, anchor.y + dy));
  const mid = { x: anchor.x + dx * 0.35, y: ey };
  const len = Math.hypot(mid.x - anchor.x, mid.y - anchor.y) + Math.abs(ex - mid.x);
  const toRight = dx >= 0;
  return (
    <div style={{ position: 'absolute', inset: 0, opacity: fade, pointerEvents: 'none' }}>
      <svg width={1920} height={1080} style={{ position: 'absolute', inset: 0, overflow: 'visible' }}>
        <path d={`M ${anchor.x} ${anchor.y} L ${mid.x} ${mid.y} L ${ex} ${ey}`} fill="none" stroke={C.ink} strokeOpacity={0.55} strokeWidth={1.6} strokeDasharray={`${len * line} ${len}`} />
        <circle cx={anchor.x} cy={anchor.y} r={7} fill={C.surface} stroke={BEAM.core} strokeWidth={2.5} opacity={Math.min(1, line * 3)} />
        <circle cx={anchor.x} cy={anchor.y} r={14} fill="none" stroke={BEAM.core} strokeOpacity={0.25 * Math.min(1, line * 3)} strokeWidth={6} />
      </svg>
      <div
        dir={rtl ? 'rtl' : 'ltr'}
        style={{
          position: 'absolute',
          top: ey - 34,
          ...(toRight ? { left: ex + 10 } : { right: 1920 - ex + 10 }),
          opacity: lab,
          transform: `translateX(${(toRight ? -1 : 1) * (1 - lab) * 14}px)`,
          padding: '12px 20px 13px',
          borderRadius: 14,
          background: 'rgba(255,255,255,0.97)',
          border: `1px solid ${C.border}`,
          boxShadow: '0 2px 4px rgba(19,34,56,0.06), 0 16px 34px -18px rgba(19,34,56,0.35)',
          whiteSpace: 'nowrap',
          textAlign: 'start',
        }}
      >
        <div style={{ fontSize: 28, fontWeight: 600, color: C.ink, lineHeight: 1.2 }}>{label}</div>
        {note && <div style={{ fontSize: 20, fontWeight: 500, color: C.ink3, marginTop: 4 }}>{note}</div>}
      </div>
    </div>
  );
};

/** Pointer that glides between screen points and clicks (ripple). keys: [[frame, x, y], …]; clicks: frames. */
export const Pointer: React.FC<{ keys: Array<[number, number, number]>; clicks: number[]; opacity?: number }> = ({ keys, clicks, opacity = 1 }) => {
  const frame = useCurrentFrame();
  let x = keys[0][1];
  let y = keys[0][2];
  for (let i = 0; i < keys.length - 1; i++) {
    const [f0, x0, y0] = keys[i];
    const [f1, x1, y1] = keys[i + 1];
    if (frame >= f0) {
      const t = EASE.inOut(Math.min(1, Math.max(0, (frame - f0) / Math.max(1, f1 - f0))));
      x = x0 + (x1 - x0) * t;
      y = y0 + (y1 - y0) * t;
    }
  }
  const press = clicks.reduce((m, c) => Math.max(m, frame >= c - 3 && frame < c + 5 ? 1 - Math.abs(frame - c) / 5 : 0), 0);
  return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', opacity }}>
      {clicks.map((c) => {
        const t = prog(frame, c, 20, EASE.out);
        if (frame < c || t >= 1) return null;
        return (
          <div
            key={c}
            style={{ position: 'absolute', left: x - 40, top: y - 40, width: 80, height: 80, borderRadius: 99, border: `3px solid ${BEAM.core}`, opacity: 1 - t, transform: `scale(${0.3 + t * 0.9})` }}
          />
        );
      })}
      <svg width={40} height={48} viewBox="0 0 40 48" style={{ position: 'absolute', left: x - 6, top: y - 3, transform: `scale(${1 - press * 0.12})`, transformOrigin: '6px 3px', filter: 'drop-shadow(0 4px 6px rgba(19,34,56,0.35))' }}>
        <path d="M6 3 L6 37 L14.5 29 L20.5 43 L26.5 40.5 L20.5 27 L32 27 Z" fill={C.ink} stroke="#FFFFFF" strokeWidth={2.4} strokeLinejoin="round" />
      </svg>
    </div>
  );
};

/** Pill chip with a leading mark. */
export const Chip: React.FC<{ children: React.ReactNode; color?: string; mark?: 'dot' | 'diamond' | 'check' | 'none'; size?: number; style?: React.CSSProperties }> = ({
  children,
  color = C.primary,
  mark = 'dot',
  size = 24,
  style,
}) => (
  <span
    style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: size * 0.45,
      padding: `${size * 0.42}px ${size * 0.8}px`,
      borderRadius: 999,
      background: '#FFFFFF',
      border: `1px solid ${C.border}`,
      boxShadow: '0 1px 2px rgba(19,34,56,0.06), 0 10px 24px -16px rgba(19,34,56,0.3)',
      color: C.ink,
      fontSize: size,
      fontWeight: 500,
      whiteSpace: 'nowrap',
      lineHeight: 1.15,
      ...style,
    }}
  >
    {mark === 'dot' && <span style={{ width: size * 0.42, height: size * 0.42, borderRadius: 99, background: color, boxShadow: `0 0 0 4px ${color}22` }} />}
    {mark === 'diamond' && <span style={{ width: size * 0.36, height: size * 0.36, borderRadius: 2, background: color, transform: 'rotate(45deg)' }} />}
    {mark === 'check' && <Check size={size * 1.05} color={color} />}
    {children}
  </span>
);

export const Check: React.FC<{ size: number; color?: string; draw?: number }> = ({ size, color = C.green, draw = 1 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" style={{ display: 'block', flex: 'none' }} aria-hidden>
    <circle cx={12} cy={12} r={11} fill={color} fillOpacity={0.12 * draw} stroke={color} strokeOpacity={0.55 * draw} strokeWidth={1.2} />
    <path d="M7 12.4l3.3 3.3L17.2 8.6" fill="none" stroke={color} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" strokeDasharray="16" strokeDashoffset={16 * (1 - draw)} />
  </svg>
);

/** The wordmark: emblem + "BILTIX" + "Risk AI" (always LTR). */
export const Wordmark: React.FC<{ size: number; draw?: number; build?: number; notch?: number; id: string; style?: React.CSSProperties }> = ({ size, draw = 1, build = 1, notch = 1, id, style }) => (
  <div dir="ltr" style={{ display: 'flex', alignItems: 'center', gap: size * 0.32, ...style }}>
    <Emblem size={size * 1.25} draw={draw} build={build} notch={notch} id={id} />
    <span style={{ fontFamily: FONT.en, fontSize: size, fontWeight: 650, letterSpacing: '0.09em', color: C.ink, lineHeight: 1 }}>BILTIX</span>
    <span style={{ fontFamily: FONT.en, fontSize: size, fontWeight: 400, color: C.ink2, lineHeight: 1 }}>Risk AI</span>
  </div>
);

/**
 * A capture laid on a plane tilted back by `pitch` (deg) and drawn in true perspective on a canvas, one 2 px
 * screen row at a time (exact keystone with no CSS 3D context). `cx`, `cy`: screen point of the plane centre;
 * `w`: plane width in px at that point; rows fade out toward the horizon.
 */
export const PerspectivePlane: React.FC<{ file: string; imgW: number; imgH: number; w: number; cx: number; cy: number; pitch: number; dist?: number; opacity?: number }> = ({
  file,
  imgW,
  imgH,
  w,
  cx,
  cy,
  pitch,
  dist = 1500,
  opacity = 1,
}) => {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [handle] = useState(() => delayRender(`perspective plane ${file}`));
  useLayoutEffect(() => {
    const im = new Image();
    im.onload = () => { setImg(im); continueRender(handle); };
    im.onerror = () => cancelRender(new Error(`could not load ${file}`));
    im.src = file;
  }, [file, handle]);
  useLayoutEffect(() => {
    const cv = canvas.current;
    if (!cv || !img) return;
    const ctx = cv.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, 1920, 1080);
    if (opacity <= 0.002) return;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    const H = (w * imgH) / imgW; // plane height in px
    const th = (pitch * Math.PI) / 180;
    const sin = Math.sin(th);
    const cos = Math.cos(th);
    // screen y of a plane row v (v from −H/2 at the far edge to +H/2 at the near edge)
    const yOf = (v: number) => cy + (v * cos * dist) / (dist + v * sin);
    const vOf = (Y: number) => ((Y - cy) * dist) / (dist * cos - (Y - cy) * sin);
    const top = Math.max(0, Math.floor(yOf(-H / 2)));
    const bot = Math.min(1080, Math.ceil(yOf(H / 2)));
    const step = 2;
    for (let Y = top; Y < bot; Y += step) {
      const v0 = Math.max(-H / 2, vOf(Y));
      const v1 = Math.min(H / 2, vOf(Y + step));
      if (v1 <= v0) continue;
      const s = dist / (dist + ((v0 + v1) / 2) * sin);
      const half = (w / 2) * s;
      const sy = ((v0 + H / 2) / H) * imgH;
      const sh = Math.max(1, ((v1 - v0) / H) * imgH);
      const far = (v0 + H / 2) / H; // 0 at the far edge
      ctx.globalAlpha = opacity * Math.min(1, Math.max(0, (far - 0.02) / 0.42)) ** 1.4;
      ctx.drawImage(img, 0, sy, imgW, sh, cx - half, Y, half * 2, step + 0.6);
    }
    ctx.globalAlpha = 1;
  });
  return <canvas ref={canvas} width={1920} height={1080} style={{ position: 'absolute', left: 0, top: 0, width: 1920, height: 1080 }} />;
};
