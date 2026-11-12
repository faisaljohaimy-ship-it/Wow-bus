/**
 * Circular charts in the app's v3.1 language (js/ui/charts.js ringGauge, css/charts.css):
 *  - RingGauge: a ratio ring (value 0–1 from 12 o'clock, clockwise; counter-clockwise in Arabic)
 *    with radial weekly bars round it — one spoke per week, slot centres at (k + ½)·360°/n, length
 *    ∝ value / barMax from zero, the current (last) week in the ring tone with a glow, past weeks a
 *    lighter step of the same hue.
 *  - Donut: exact proportional segments (angle = 360° × part / whole) with 2 px surface gaps.
 * Geometry is exact; animation only scales the drawn fraction (progress 0 → 1).
 */
import React from 'react';
import { arcPath, polar } from '../lib/geom';
import { C } from '../theme';

/** Solid mix of two hex colours (t = share of a). */
export function mixHex(a: string, b: string, t: number): string {
  const pa = [1, 3, 5].map((i) => parseInt(a.slice(i, i + 2), 16));
  const pb = [1, 3, 5].map((i) => parseInt(b.slice(i, i + 2), 16));
  return `rgb(${pa.map((v, i) => Math.round(v * t + pb[i] * (1 - t))).join(',')})`;
}

/** Arc from 12 o'clock over `frac` of the circle; clockwise unless ccw. Full circles split in two. */
function ringArc(cx: number, cy: number, r: number, frac: number, ccw: boolean, from = 0): string {
  const f = Math.max(0, Math.min(1, frac));
  const a0 = -90 + (ccw ? -360 : 360) * from;
  const sweep = (ccw ? -360 : 360) * f;
  if (Math.abs(sweep) >= 359.99) {
    const mid = a0 + sweep / 2;
    return `${arcPath(cx, cy, r, a0, mid)} ${arcPath(cx, cy, r, mid, a0 + sweep - (ccw ? -0.01 : 0.01))}`;
  }
  return arcPath(cx, cy, r, a0, a0 + sweep);
}

export const RingGauge: React.FC<{
  size: number;
  r: number;
  stroke: number;
  value: number; // drawn ratio 0–1 (already animated)
  tone: string;
  rtl: boolean;
  bars?: number[] | null; // weekly values, oldest first
  barMax?: number;
  barIn?: number; // inner radius of the spokes
  barLen?: number;
  barW?: number;
  barsP?: number; // 0–1 growth of the spokes (staggered internally)
  face?: boolean;
  glow?: number; // 0–1 glow on the end cap
  id: string;
  children?: React.ReactNode; // centre content (HTML)
}> = ({ size, r, stroke, value, tone, rtl, bars, barMax, barIn, barLen, barW = 4, barsP = 1, face = true, glow = 1, id, children }) => {
  const c = size / 2;
  const track = mixHex(tone, C.raised, 0.15);
  const slot = 'rgba(85,100,124,0.11)';
  const past = mixHex(tone, C.raised, 0.5);
  const n = bars ? bars.length : 0;
  const max = barMax ?? (bars ? Math.max(...bars) : 1);
  const bi = barIn ?? r + stroke / 2 + 10;
  const bl = barLen ?? r * 0.32;
  const end = polar(c, c, r, -90 + (rtl ? -360 : 360) * Math.min(1, value));
  return (
    <div style={{ position: 'relative', width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ position: 'absolute', inset: 0, overflow: 'visible' }}>
        <defs>
          <radialGradient id={`${id}-face`} cx="50%" cy="28%" r="72%">
            <stop offset="0%" stopColor={mixHex(tone, '#FFFFFF', 0.1)} />
            <stop offset="100%" stopColor="#FFFFFF" />
          </radialGradient>
          <radialGradient id={`${id}-cap`} cx="50%" cy="40%" r="60%">
            <stop offset="0%" stopColor={mixHex(tone, '#FFFFFF', 0.55)} />
            <stop offset="100%" stopColor={tone} />
          </radialGradient>
        </defs>
        {/* radial weekly bars */}
        {bars &&
          bars.map((v, k) => {
            const ang = -90 + (rtl ? -1 : 1) * (k + 0.5) * (360 / n);
            const cur = k === n - 1;
            const g = Math.max(0, Math.min(1, barsP * 1.6 - (k / n) * 0.6));
            const frac = Math.max(0, Math.min(1, v / max)) * g;
            const p0 = polar(c, c, bi, ang);
            const p1 = polar(c, c, bi + bl, ang);
            const pf = polar(c, c, bi + bl * frac, ang);
            return (
              <g key={k}>
                <line x1={p0.x} y1={p0.y} x2={p1.x} y2={p1.y} stroke={cur ? mixHex(tone, '#FFFFFF', 0.16) : slot} strokeWidth={cur ? barW + 1 : barW} strokeLinecap="round" />
                {frac > 0.001 && (
                  <line
                    x1={p0.x}
                    y1={p0.y}
                    x2={pf.x}
                    y2={pf.y}
                    stroke={cur ? tone : past}
                    strokeWidth={cur ? barW + 1 : barW}
                    strokeLinecap="round"
                    style={cur ? { filter: `drop-shadow(0 0 4px ${tone}99)` } : undefined}
                  />
                )}
              </g>
            );
          })}
        {face && <circle cx={c} cy={c} r={r - stroke / 2} fill={`url(#${id}-face)`} stroke={mixHex(tone, '#FFFFFF', 0.12)} strokeWidth={1} />}
        <circle cx={c} cy={c} r={r} fill="none" stroke={track} strokeWidth={stroke} />
        {value > 0.002 && (
          <>
            <path d={ringArc(c, c, r, value, rtl)} fill="none" stroke={tone} strokeWidth={stroke} strokeLinecap="round" />
            <circle cx={end.x} cy={end.y} r={stroke * 0.42} fill={`url(#${id}-cap)`} style={{ filter: glow > 0 ? `drop-shadow(0 0 ${6 * glow}px ${tone})` : undefined }} />
          </>
        )}
      </svg>
      {children && <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>{children}</div>}
    </div>
  );
};

export type DonutSeg = { key: string; value: number; color: string; pattern?: string };

/** Exact proportional donut: segment angles = 360° × value / total, drawn up to `progress`. */
export const Donut: React.FC<{
  size: number;
  r: number;
  stroke: number;
  segs: DonutSeg[];
  progress: number; // 0–1 sweep of the whole donut
  rtl: boolean;
  gap?: number; // px of surface between segments (drawn over the boundary)
  track?: string;
  defs?: React.ReactNode;
  children?: React.ReactNode;
}> = ({ size, r, stroke, segs, progress, rtl, gap = 3, track = C.raised, defs, children }) => {
  const c = size / 2;
  const total = segs.reduce((a, s) => a + s.value, 0);
  let acc = 0;
  const placed = segs.map((s) => {
    const from = acc / total;
    acc += s.value;
    return { ...s, from, to: acc / total };
  });
  return (
    <div style={{ position: 'relative', width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ position: 'absolute', inset: 0, overflow: 'visible' }}>
        {defs && <defs>{defs}</defs>}
        <circle cx={c} cy={c} r={r} fill="none" stroke={track} strokeWidth={stroke} />
        {placed.map((s) => {
          const vis = Math.max(0, Math.min(s.to, progress) - s.from);
          if (vis <= 0) return null;
          return <path key={s.key} d={ringArc(c, c, r, vis, rtl, s.from)} fill="none" stroke={s.pattern || s.color} strokeWidth={stroke} />;
        })}
        {/* surface gaps on each boundary that has been reached */}
        {placed.map((s, i) => {
          if (i === 0 && progress < 0.999) return null;
          if (s.from > progress) return null;
          const ang = -90 + (rtl ? -360 : 360) * s.from;
          const p0 = polar(c, c, r - stroke / 2 - 1, ang);
          const p1 = polar(c, c, r + stroke / 2 + 1, ang);
          return <line key={`g-${s.key}`} x1={p0.x} y1={p0.y} x2={p1.x} y2={p1.y} stroke={C.surface} strokeWidth={gap} />;
        })}
      </svg>
      {children && <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>{children}</div>}
    </div>
  );
};
