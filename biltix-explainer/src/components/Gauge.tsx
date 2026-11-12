import React from 'react';
import { arcPath, polar } from '../lib/geom';
import { C, FONT } from '../theme';

/**
 * 240° score gauge, 0–100. Geometry is exact: angle = start + 2.4° × value.
 * RTL mirrors the sweep (0 on the right). Zone ring shows the rating bands
 * (green < 40 ≤ yellow < 70 ≤ red) from the platform's B2 thresholds.
 */
export const Gauge: React.FC<{
  value: number; // animated value
  size: number;
  rtl: boolean;
  color: string;
  thresholds: { yellow: number; red: number };
  ticks?: number[];
  stroke?: number;
  zoneOpacity?: number;
}> = ({ value, size, rtl, color, thresholds, ticks = [0, 40, 70, 100], stroke = 20, zoneOpacity = 1 }) => {
  const cx = size / 2;
  const cy = size / 2;
  const r = size * 0.36;
  const rz = r + stroke / 2 + 12;
  const ang = (v: number) => (rtl ? 30 - 2.4 * v : 150 + 2.4 * v);
  const zones = [
    { from: 0, to: thresholds.yellow, color: C.green },
    { from: thresholds.yellow, to: thresholds.red, color: C.amber },
    { from: thresholds.red, to: 100, color: C.red },
  ];
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ overflow: 'visible', display: 'block' }}>
      <path d={arcPath(cx, cy, r, ang(0), ang(100))} fill="none" stroke={C.raised} strokeWidth={stroke} strokeLinecap="round" />
      <path d={arcPath(cx, cy, r, ang(0), ang(100))} fill="none" stroke={C.border} strokeWidth={1} transform="" opacity={0.0} />
      {zones.map((z) => (
        <path
          key={z.from}
          d={arcPath(cx, cy, rz, ang(z.from + 0.6), ang(z.to - 0.6))}
          fill="none"
          stroke={z.color}
          strokeOpacity={0.55 * zoneOpacity}
          strokeWidth={4}
        />
      ))}
      {ticks.map((tv) => {
        const a = ang(tv);
        const p0 = polar(cx, cy, rz - 6, a);
        const p1 = polar(cx, cy, rz + 6, a);
        const pl = polar(cx, cy, rz + 24, a);
        return (
          <g key={tv} opacity={zoneOpacity}>
            <line x1={p0.x} y1={p0.y} x2={p1.x} y2={p1.y} stroke={C.ink3} strokeWidth={1.2} />
            <text x={pl.x} y={pl.y + 5} fill={C.ink3} fontFamily={FONT.mono} fontSize={16} textAnchor="middle">
              {tv}
            </text>
          </g>
        );
      })}
      {value > 0.2 && (
        <>
          <path
            d={arcPath(cx, cy, r, ang(0), ang(value))}
            fill="none"
            stroke={color}
            strokeWidth={stroke}
            strokeLinecap="round"
            style={{ filter: `drop-shadow(0 0 10px ${color}66)` }}
          />
          {(() => {
            const p = polar(cx, cy, r, ang(value));
            return <circle cx={p.x} cy={p.y} r={stroke / 2 - 4} fill={C.ink} opacity={0.9} />;
          })()}
        </>
      )}
    </svg>
  );
};
