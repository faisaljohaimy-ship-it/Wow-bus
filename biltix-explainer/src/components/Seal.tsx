import React from 'react';
import { C, FONT } from '../theme';
import { Check } from './Bits';

/**
 * Verified-closure seal: gold hairline dial (the one gold ornament of the
 * scene), a ring of Latin micro-text, a raised disc and a drawn check.
 * ring/ticks/check/halo are 0→1 progress values driven by the scene.
 */
export const Seal: React.FC<{ size: number; ring: number; ticks: number; text: number; check: number; halo: number; micro: string }> = ({
  size,
  ring,
  ticks,
  text,
  check,
  halo,
  micro,
}) => {
  const c = size / 2;
  const rOuter = c - 8;
  const rText = c - 44;
  const rDisc = c - 66;
  const circ = 2 * Math.PI * rOuter;
  const textCirc = 2 * Math.PI * rText;
  const N = 72;
  return (
    <div style={{ position: 'relative', width: size, height: size }}>
      <div
        style={{
          position: 'absolute',
          inset: -30,
          borderRadius: 999,
          background: `radial-gradient(circle, rgba(25,198,230,${0.16 * halo}) 0%, rgba(25,198,230,0) 65%)`,
        }}
      />
      <svg width={size} height={size} style={{ position: 'absolute', inset: 0, overflow: 'visible' }}>
        <defs>
          <radialGradient id="seal-disc" cx="50%" cy="38%" r="70%">
            <stop offset="0%" stopColor="#1C2E48" />
            <stop offset="100%" stopColor={C.surface} />
          </radialGradient>
          <path id="seal-text" d={`M ${c} ${c - rText} a ${rText} ${rText} 0 1 1 -0.01 0`} />
        </defs>
        <circle
          cx={c}
          cy={c}
          r={rOuter}
          fill="none"
          stroke={C.gold}
          strokeWidth={1.4}
          strokeDasharray={circ}
          strokeDashoffset={circ * (1 - ring)}
          transform={`rotate(-90 ${c} ${c})`}
        />
        {Array.from({ length: N }, (_, i) => {
          if (i / N > ticks) return null;
          const a = (i / N) * Math.PI * 2 - Math.PI / 2;
          const major = i % 6 === 0;
          const r0 = rOuter - (major ? 16 : 9);
          const r1 = rOuter - 4;
          return (
            <line
              key={i}
              x1={c + r0 * Math.cos(a)}
              y1={c + r0 * Math.sin(a)}
              x2={c + r1 * Math.cos(a)}
              y2={c + r1 * Math.sin(a)}
              stroke={C.gold}
              strokeOpacity={major ? 0.8 : 0.4}
              strokeWidth={major ? 1.4 : 1}
            />
          );
        })}
        <text fill={C.ink2} fontFamily={FONT.mono} fontSize={14} letterSpacing={3} opacity={text}>
          <textPath href="#seal-text" textLength={textCirc - 6} lengthAdjust="spacing">
            {micro}
          </textPath>
        </text>
        <circle cx={c} cy={c} r={rDisc} fill="url(#seal-disc)" stroke={C.primary} strokeWidth={2} opacity={Math.min(1, ring * 1.4)} />
        <circle cx={c} cy={c} r={rDisc - 10} fill="none" stroke={C.border} strokeWidth={1} opacity={Math.min(1, ring * 1.4)} />
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ filter: `drop-shadow(0 0 ${14 * halo}px rgba(25,198,230,0.7))` }}>
          <Check size={rDisc * 1.05} p={check} color={C.accent} stroke={2.2} />
        </div>
      </div>
    </div>
  );
};
