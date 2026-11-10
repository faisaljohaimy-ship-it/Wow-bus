import React from 'react';
import { C } from '../theme';

/**
 * The BILTIX emblem (same geometry as biltix-hse/assets/favicon.svg):
 * gold hexagon frame, isometric stepped structure, accent shield notch.
 * `draw` (0→1) animates the frame stroke, `build` (0→1) raises the blocks,
 * `notch` (0→1) pops the shield — all default to fully drawn.
 */
export const Emblem: React.FC<{ size: number; draw?: number; build?: number; notch?: number; id?: string }> = ({
  size,
  draw = 1,
  build = 1,
  notch = 1,
  id = 'em',
}) => {
  const HEX = 'M24 3L42.19 13.5L42.19 34.5L24 45L5.81 34.5L5.81 13.5z';
  const hexLen = 6 * 21; // side ≈ 21
  const blocks = [
    { pts: '14.47,23.5 24,29 24,36 14.47,30.5', shade: 'dark' },
    { pts: '33.53,23.5 24,29 24,36 33.53,30.5', shade: 'lit' },
    { pts: '24,18 33.53,23.5 24,29 14.47,23.5', shade: 'top' },
    { pts: '21.4,15.5 27.46,19 27.46,27 21.4,23.5', shade: 'dark' },
    { pts: '33.53,15.5 27.46,19 27.46,27 33.53,23.5', shade: 'lit' },
    { pts: '27.46,12 33.53,15.5 27.46,19 21.4,15.5', shade: 'top' },
  ];
  const shade = { dark: { fill: C.bg, op: 0.34 }, lit: { fill: '#FFFFFF', op: 0.14 }, top: { fill: '#FFFFFF', op: 0.46 } } as const;
  const SHIELD = 'M0-4.8l4 1.7v2.9c0 2.7-1.7 4.8-4 5.6-2.3-.8-4-2.9-4-5.6v-2.9z';
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" style={{ display: 'block', overflow: 'visible' }} aria-hidden>
      <defs>
        <mask id={`${id}-notch`} maskUnits="userSpaceOnUse" x="0" y="0" width="48" height="48">
          <rect width="48" height="48" fill="#FFFFFF" />
          <g transform="translate(37.2 36.2)" opacity={notch > 0 ? 1 : 0}>
            <path d={SHIELD} fill="#000" stroke="#000" strokeWidth={3.2} strokeLinejoin="round" />
          </g>
        </mask>
      </defs>
      <g mask={`url(#${id}-notch)`}>
        <path d={HEX} fill="#0B1322" fillOpacity={0.5 * draw} />
        <path
          d={HEX}
          fill="none"
          stroke={C.gold}
          strokeWidth={1.5}
          strokeLinejoin="round"
          strokeDasharray={hexLen}
          strokeDashoffset={hexLen * (1 - draw)}
        />
      </g>
      {blocks.map((b, i) => {
        const t = Math.max(0, Math.min(1, build * 1.6 - i * 0.12));
        return (
          <g key={i} opacity={t} transform={`translate(0 ${(1 - t) * 3})`}>
            <polygon points={b.pts} fill={C.primary} />
            <polygon points={b.pts} fill={shade[b.shade as keyof typeof shade].fill} opacity={shade[b.shade as keyof typeof shade].op} />
          </g>
        );
      })}
      <path
        d="M14.47 23.5L24 29l3.46-2M21.4 15.5l6.06 3.5 6.07-3.5"
        fill="none"
        stroke="#FFFFFF"
        strokeOpacity={0.55 * build}
        strokeWidth={0.6}
        strokeLinejoin="round"
      />
      <g transform={`translate(37.2 36.2) scale(${0.6 + 0.4 * notch})`} opacity={notch}>
        <path d={SHIELD} fill={C.accent} />
        <path d="M-1.9-.2l1.3 1.3L2-1.6" fill="none" stroke={C.bg} strokeWidth={1.1} strokeLinecap="round" strokeLinejoin="round" />
      </g>
    </svg>
  );
};
