/**
 * Schematic slope cross-section (not to scale) used as an evidence / control
 * illustration. Every annotated quantity (crack offset, worker and excavator
 * counts, evacuation radius) comes from data.json; only the terrain outline is
 * drawn by hand. RTL mirrors the drawing; labels are HTML so Arabic shapes.
 */
import React from 'react';
import { C, FONT } from '../theme';

export type SectionProps = {
  w: number;
  h: number;
  rtl: boolean;
  crestX: number; // x of the crest
  toeX: number; // x of the toe
  pxPerM: number;
  crackM?: number; // tension crack offset behind the crest (m)
  sensorX?: number;
  sensorLabel?: string;
  workers: number;
  excavators: number;
  crewX: number; // where the crew cluster starts
  crewCols?: number;
  zoneM?: number; // exclusion zone from the toe (m)
  zoneP?: number; // 0→1 reveal of the zone
  crewShift?: number; // px the crew has moved (evacuation)
  draw?: number; // 0→1 terrain draw-on
  annot?: number; // 0→1 annotations
  labels: { crest: string; pit: string; crack?: string; movement?: string; zone?: string; crew?: string };
};

export const Section: React.FC<SectionProps> = ({
  w,
  h,
  rtl,
  crestX,
  toeX,
  pxPerM,
  crackM,
  sensorX,
  sensorLabel,
  workers,
  excavators,
  crewX,
  crewCols = 11,
  zoneM,
  zoneP = 0,
  crewShift = 0,
  draw = 1,
  annot = 1,
  labels,
}) => {
  const top = h * 0.28;
  const floor = h * 0.84;
  const X = (x: number) => (rtl ? w - x : x);
  const terrain = `M ${X(0)} ${top} L ${X(crestX)} ${top} L ${X(toeX)} ${floor} L ${X(w)} ${floor}`;
  const body = `${terrain} L ${X(w)} ${h} L ${X(0)} ${h} Z`;
  const tlen = crestX + Math.hypot(toeX - crestX, floor - top) + (w - toeX);
  const crackX = crackM != null ? crestX - crackM * pxPerM : null;
  const zoneW = zoneM != null ? zoneM * pxPerM : 0;
  const label = (x: number, y: number, text: string, align: 'start' | 'center' | 'end' = 'center', color: string = C.ink3, size = 16) => {
    const ax = X(x);
    const tx = align === 'center' ? '-50%' : (align === 'start') !== rtl ? '0' : '-100%';
    return (
      <div style={{ position: 'absolute', left: ax, top: y, transform: `translate(${tx}, 0)`, fontSize: size, color, whiteSpace: 'nowrap', opacity: annot }}>{text}</div>
    );
  };
  return (
    <div style={{ position: 'relative', width: w, height: h }}>
      <svg width={w} height={h} style={{ position: 'absolute', inset: 0, overflow: 'visible' }}>
        <defs>
          <pattern id={`earth-${w}`} width="14" height="14" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2="14" stroke={C.ink3} strokeOpacity={0.16} strokeWidth="1" />
          </pattern>
          <pattern id={`zone-${w}`} width="10" height="10" patternUnits="userSpaceOnUse" patternTransform="rotate(-45)">
            <rect width="10" height="10" fill={C.accent} fillOpacity={0.08} />
            <line x1="0" y1="0" x2="0" y2="10" stroke={C.accent} strokeOpacity={0.45} strokeWidth="1.5" />
          </pattern>
        </defs>
        <path d={body} fill={C.pressed} opacity={0.95 * draw} />
        <path d={body} fill={`url(#earth-${w})`} opacity={draw} />
        <path d={terrain} fill="none" stroke={C.ink2} strokeWidth={2} strokeDasharray={tlen} strokeDashoffset={tlen * (1 - draw)} />

        {/* exclusion zone: a band on the pit floor measured from the toe */}
        {zoneM != null && zoneP > 0 && (
          <g opacity={zoneP}>
            <rect x={rtl ? X(toeX) - zoneW * zoneP : X(toeX)} y={floor - 46} width={zoneW * zoneP} height={46} fill={`url(#zone-${w})`} />
            <line x1={X(toeX + zoneW * zoneP)} x2={X(toeX + zoneW * zoneP)} y1={floor - 70} y2={floor} stroke={C.accent} strokeWidth={2} strokeDasharray="6 5" />
            <line x1={X(toeX)} x2={X(toeX + zoneW * zoneP)} y1={floor - 62} y2={floor - 62} stroke={C.accent} strokeWidth={1} />
            <line x1={X(toeX)} x2={X(toeX)} y1={floor - 68} y2={floor - 56} stroke={C.accent} strokeWidth={1} />
          </g>
        )}

        {/* tension crack behind the crest */}
        {crackX != null && (
          <g opacity={annot}>
            <path
              d={`M ${X(crackX)} ${top} L ${X(crackX - 3)} ${top + 12} L ${X(crackX + 3)} ${top + 24} L ${X(crackX - 2)} ${top + 38} L ${X(crackX + 1)} ${top + 48}`}
              fill="none"
              stroke={C.red}
              strokeWidth={2.2}
              strokeLinejoin="round"
            />
            <line x1={X(crackX)} x2={X(crestX)} y1={top - 16} y2={top - 16} stroke={C.ink3} strokeWidth={1} />
            <line x1={X(crackX)} x2={X(crackX)} y1={top - 22} y2={top - 10} stroke={C.ink3} strokeWidth={1} />
            <line x1={X(crestX)} x2={X(crestX)} y1={top - 22} y2={top - 10} stroke={C.ink3} strokeWidth={1} />
          </g>
        )}

        {/* inclinometer with exaggerated deflection toward the pit */}
        {sensorX != null && (
          <g opacity={annot}>
            <line x1={X(sensorX)} x2={X(sensorX)} y1={top} y2={floor - 6} stroke={C.accent} strokeOpacity={0.45} strokeWidth={1.5} strokeDasharray="4 4" />
            <path
              d={`M ${X(sensorX)} ${floor - 6} C ${X(sensorX)} ${top + 60}, ${X(sensorX + 4)} ${top + 30}, ${X(sensorX + 14)} ${top}`}
              fill="none"
              stroke={C.accent}
              strokeWidth={2}
            />
            <rect x={X(sensorX) - 5} y={top - 5} width={10} height={10} rx={2} fill={C.accent} />
          </g>
        )}

        {/* movement arrow along the slope face */}
        {labels.movement && (
          <g opacity={annot}>
            {(() => {
              const ax0 = crestX + (toeX - crestX) * 0.42;
              const ay0 = top + (floor - top) * 0.42 - 18;
              const ax1 = crestX + (toeX - crestX) * 0.72;
              const ay1 = top + (floor - top) * 0.72 - 18;
              const ang = Math.atan2(ay1 - ay0, (ax1 - ax0) * (rtl ? -1 : 1));
              const hx = X(ax1);
              return (
                <>
                  <line x1={X(ax0)} y1={ay0} x2={hx} y2={ay1} stroke={C.red} strokeWidth={2.4} />
                  <path
                    d={`M ${hx} ${ay1} l ${-10 * Math.cos(ang - 0.45)} ${-10 * Math.sin(ang - 0.45)} M ${hx} ${ay1} l ${-10 * Math.cos(ang + 0.45)} ${-10 * Math.sin(ang + 0.45)}`}
                    stroke={C.red}
                    strokeWidth={2.4}
                    strokeLinecap="round"
                  />
                </>
              );
            })()}
          </g>
        )}

        {/* crew: one dot per worker, one glyph per excavator (exact counts) */}
        <g opacity={annot} transform={`translate(${rtl ? -crewShift : crewShift} 0)`}>
          {Array.from({ length: workers }, (_, i) => {
            const c = i % crewCols;
            const r = Math.floor(i / crewCols);
            return <circle key={i} cx={X(crewX + c * 9)} cy={floor - 8 - r * 9} r={3} fill={C.ink} opacity={0.9} />;
          })}
          {Array.from({ length: excavators }, (_, i) => {
            const ex = crewX + crewCols * 9 + 10 + i * 26;
            const bx = X(ex);
            const dir = rtl ? -1 : 1;
            return (
              <g key={i}>
                <rect x={rtl ? bx - 18 : bx} y={floor - 12} width={18} height={10} rx={2} fill="#D69A14" stroke="#8A5A00" strokeWidth={1} />
                <path d={`M ${bx + dir * 14} ${floor - 12} l ${dir * 8} ${-10} l ${dir * 6} ${8}`} fill="none" stroke="#8A5A00" strokeWidth={2} />
              </g>
            );
          })}
        </g>
      </svg>
      {crackX != null ? label(crestX + 22, top - 4, labels.crest, 'start', C.ink3) : label(crestX, top + 10, labels.crest, 'end', C.ink3)}
      {label(w - 6, floor - 66, labels.pit, 'end', C.ink3)}
      {crackX != null && labels.crack && label((crackX + crestX) / 2, top - 46, labels.crack, 'center', C.ink2, 16)}
      {sensorX != null && sensorLabel && (
        <div style={{ position: 'absolute', left: X(sensorX), top: top + 64, transform: `translate(${rtl ? '10px' : 'calc(-100% - 10px)'}, 0)`, fontFamily: FONT.mono, fontSize: 15, color: C.accentText, opacity: annot, whiteSpace: 'nowrap' }}>
          {sensorLabel}
        </div>
      )}
      {labels.movement && label(crestX + (toeX - crestX) * 0.62 + 46, top + (floor - top) * 0.36, labels.movement, 'start', C.ink2, 16)}
      {zoneM != null && labels.zone && (
        <div style={{ position: 'absolute', left: X(toeX + (zoneW * zoneP) / 2), top: floor - 90, transform: 'translate(-50%, 0)', fontSize: 16, fontWeight: 600, color: C.accentText, opacity: zoneP, whiteSpace: 'nowrap' }}>
          {labels.zone}
        </div>
      )}
      {labels.crew && label(crewX + crewShift, floor + 10, labels.crew, 'start', C.ink2, 16)}
    </div>
  );
};
