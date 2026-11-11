/** Scene helpers: props, framing math for the camera, mirroring, the metal frame used by the brand scenes. */
import React from 'react';
import { useCurrentFrame } from 'remotion';
import { Comet } from '../components/Metal';
import { prog } from '../lib/anim';
import type { Shot } from '../lib/camera';
import { EASE, LENS } from '../theme';
import type { Rect } from './captures';
import type { Lang, SceneTiming } from './timeline';

export type SceneProps = { lang: Lang; t: SceneTiming };

/**
 * Camera key that frames a world rectangle: magnification so the rect fills `fill` of the frame (capped at
 * `max`), and the look point shifted so the rect sits a little above centre (room for the lower third).
 */
export function frameRect(f: number, r: Rect, fill = 0.8, max = 2.2, lift = 60): Shot {
  const m = Math.min(max, (1920 * fill) / r.w, (1080 * fill) / r.h);
  return { f, x: r.x + r.w / 2, y: r.y + r.h / 2 + lift / m, z: LENS * (1 - 1 / m) };
}

/** x of a box of width w laid out from the inline-start (mirrored in Arabic). */
export const ix = (rtl: boolean, x: number, w: number) => (rtl ? 1920 - x - w : x);

/** Rounded frame stroked with the nickel-orange metal (draws on), with the laser comet running round it. */
export const MetalFrame: React.FC<{ x: number; y: number; w: number; h: number; r?: number; draw: number; comet: number; rtl: boolean; id: string; width?: number }> = ({
  x,
  y,
  w,
  h,
  r = 28,
  draw,
  comet,
  rtl,
  id,
  width = 2.5,
}) => {
  const P = 2 * (w + h) - 8 * r + 2 * Math.PI * r;
  return (
    <div style={{ position: 'absolute', left: x, top: y, width: w, height: h }}>
      <svg width={w} height={h} style={{ position: 'absolute', inset: 0, overflow: 'visible' }}>
        <defs>
          <linearGradient id={`${id}-m`} x1="0" y1="0" x2="1" y2="1">
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
        <rect
          x={1}
          y={1}
          width={w - 2}
          height={h - 2}
          rx={r}
          fill="none"
          stroke={`url(#${id}-m)`}
          strokeWidth={width}
          strokeDasharray={`${P * draw} ${P}`}
          transform={rtl ? `translate(${w} 0) scale(-1 1)` : undefined}
        />
      </svg>
      <div style={{ position: 'absolute', inset: 0, border: '2px solid transparent', boxSizing: 'border-box' }}>
        <Comet w={w} h={h} r={r} rtl={rtl} speed={12} len={190} opacity={comet} />
      </div>
    </div>
  );
};

/** Survey corner ticks round a box (construction marks), drawing on. */
export const CornerTicks: React.FC<{ x: number; y: number; w: number; h: number; at: number; gap?: number; len?: number; color?: string }> = ({ x, y, w, h, at, gap = 18, len = 30, color = '#132238' }) => {
  const frame = useCurrentFrame();
  const p = prog(frame, at, 18, EASE.inOut);
  if (p <= 0) return null;
  const L = len * p;
  const d = [
    `M ${x - gap} ${y - gap + L} V ${y - gap} H ${x - gap + L}`,
    `M ${x + w + gap - L} ${y - gap} H ${x + w + gap} V ${y - gap + L}`,
    `M ${x - gap} ${y + h + gap - L} V ${y + h + gap} H ${x - gap + L}`,
    `M ${x + w + gap - L} ${y + h + gap} H ${x + w + gap} V ${y + h + gap - L}`,
  ].join(' ');
  return (
    <svg width={1920} height={1080} style={{ position: 'absolute', inset: 0, overflow: 'visible' }}>
      <path d={d} fill="none" stroke={color} strokeOpacity={0.35} strokeWidth={1.6} />
    </svg>
  );
};
