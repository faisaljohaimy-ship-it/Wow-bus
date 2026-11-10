/**
 * Cards with the app's nickel-orange metal edge (css/components.css "Edges") and, where it helps,
 * the laser comet: a short glowing segment travelling round the edge at constant speed along the
 * border's rounded centre line, clockwise in English and counter-clockwise in Arabic.
 * The comet is ornament only — the orange is never a status colour.
 */
import React from 'react';
import { useCurrentFrame } from 'remotion';
import { BEAM, C, ELEV, METAL } from '../theme';

export const EDGE = 2; // px: the 1.5 px app edge, scaled for a 1080p master shown at 720p

export type CometOpts = { phase?: number; speed?: number; len?: number; opacity?: number };

/** Perimeter of a rounded rectangle. */
const perimeter = (w: number, h: number, r: number) => 2 * (w + h) - 8 * r + 2 * Math.PI * r;

/** The comet alone, drawn on a w × h rounded rectangle (physical coordinates, clockwise). */
export const Comet: React.FC<{ w: number; h: number; r: number; rtl: boolean; inset?: number } & CometOpts> = ({
  w,
  h,
  r,
  rtl,
  inset = EDGE / 2,
  phase = 0,
  speed = 13,
  len = 150,
  opacity = 1,
}) => {
  const frame = useCurrentFrame();
  if (opacity <= 0.01) return null;
  const W = w - inset * 2;
  const H = h - inset * 2;
  const R = Math.max(0, r - inset);
  const P = perimeter(W, H, R);
  const head = (((phase * P + speed * frame) % P) + P) % P;
  const N = 12;
  const seg = len / N;
  const segs = Array.from({ length: N }, (_, i) => {
    const start = head - (i + 1) * seg;
    const off = -((start % P) + P) % P;
    const k = 1 - i / N;
    const color = i === 0 ? BEAM.head : i < 3 ? BEAM.core : BEAM.tail;
    return { off, alpha: Math.pow(k, 1.6), color, width: i === 0 ? 3.4 : 2.8 };
  });
  return (
    <svg
      width={w}
      height={h}
      style={{ position: 'absolute', left: -EDGE, top: -EDGE, overflow: 'visible', pointerEvents: 'none', transform: rtl ? 'scaleX(-1)' : undefined, opacity }}
    >
      {/* glow round the head */}
      <rect
        x={inset}
        y={inset}
        width={W}
        height={H}
        rx={R}
        fill="none"
        stroke={BEAM.glow}
        strokeWidth={10}
        strokeOpacity={0.5}
        strokeDasharray={`${seg * 4} ${P - seg * 4}`}
        strokeDashoffset={-((((head - seg * 4) % P) + P) % P)}
      />
      {segs.map((s, i) => (
        <rect
          key={i}
          x={inset}
          y={inset}
          width={W}
          height={H}
          rx={R}
          fill="none"
          stroke={s.color}
          strokeOpacity={s.alpha}
          strokeWidth={s.width}
          strokeDasharray={`${seg + 0.6} ${P - seg - 0.6}`}
          strokeDashoffset={s.off}
        />
      ))}
    </svg>
  );
};

/** A card on the light surface with the metal edge (and an optional comet). Positioned by its inline-start. */
export const Metal: React.FC<{
  x: number;
  y: number;
  w: number;
  h: number;
  r?: number;
  rtl: boolean;
  comet?: CometOpts | null;
  soft?: boolean; // nested / quiet card: the metal washed toward the surface (no comet)
  fill?: string;
  style?: React.CSSProperties;
  children?: React.ReactNode;
}> = ({ x, y, w, h, r = 22, rtl, comet, soft, fill = C.surface, style, children }) => (
  <div
    style={{
      position: 'absolute',
      top: y,
      insetInlineStart: x,
      width: w,
      height: h,
      boxSizing: 'border-box',
      borderRadius: r,
      border: `${EDGE}px solid transparent`,
      background: soft
        ? `linear-gradient(${fill}, ${fill}) padding-box, linear-gradient(rgba(255,255,255,0.55), rgba(255,255,255,0.55)) border-box, ${METAL} border-box`
        : `linear-gradient(${fill}, ${fill}) padding-box, ${METAL} border-box`,
      boxShadow: soft ? '0 1px 2px rgba(19,34,56,0.05)' : ELEV,
      ...style,
    }}
  >
    {children}
    {comet && !soft && <Comet w={w} h={h} r={r} rtl={rtl} {...comet} />}
  </div>
);

/** A metal ring (circle edge) with an optional comet orbiting it — for emblems, seals and dials. */
export const MetalRing: React.FC<{ cx: number; cy: number; r: number; width?: number; rtl: boolean; comet?: CometOpts | null; id: string; opacity?: number; draw?: number }> = ({
  cx,
  cy,
  r,
  width = 3,
  rtl,
  comet,
  id,
  opacity = 1,
  draw = 1,
}) => {
  const frame = useCurrentFrame();
  const P = 2 * Math.PI * r;
  const N = 12;
  const len = comet?.len ?? 170;
  const seg = len / N;
  const head = comet ? ((((comet.phase ?? 0) * P + (comet.speed ?? 10) * frame) % P) + P) % P : 0;
  return (
    <svg width={1920} height={1080} style={{ position: 'absolute', left: 0, top: 0, overflow: 'visible', opacity }}>
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
      </defs>
      <circle
        cx={cx}
        cy={cy}
        r={r}
        fill="none"
        stroke={`url(#${id}-metal)`}
        strokeWidth={width}
        strokeDasharray={`${P * draw} ${P}`}
        transform={`rotate(-90 ${cx} ${cy})`}
      />
      {comet && (comet.opacity ?? 1) > 0.01 && (
        <g transform={`rotate(-90 ${cx} ${cy})${rtl ? ` translate(${cx} ${cy}) scale(1 -1) translate(${-cx} ${-cy})` : ''}`} opacity={comet.opacity ?? 1}>
          <circle
            cx={cx}
            cy={cy}
            r={r}
            fill="none"
            stroke={BEAM.glow}
            strokeWidth={width + 8}
            strokeOpacity={0.5}
            strokeDasharray={`${seg * 4} ${P - seg * 4}`}
            strokeDashoffset={-((((head - seg * 4) % P) + P) % P)}
          />
          {Array.from({ length: N }, (_, i) => {
            const start = head - (i + 1) * seg;
            const off = -((start % P) + P) % P;
            const k = 1 - i / N;
            return (
              <circle
                key={i}
                cx={cx}
                cy={cy}
                r={r}
                fill="none"
                stroke={i === 0 ? BEAM.head : i < 3 ? BEAM.core : BEAM.tail}
                strokeOpacity={Math.pow(k, 1.6)}
                strokeWidth={i === 0 ? width + 1 : width}
                strokeDasharray={`${seg + 0.6} ${P - seg - 0.6}`}
                strokeDashoffset={off}
              />
            );
          })}
        </g>
      )}
    </svg>
  );
};
