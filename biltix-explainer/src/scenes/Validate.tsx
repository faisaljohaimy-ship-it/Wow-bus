import React from 'react';
import { useCurrentFrame } from 'remotion';
import { Eyebrow, Num } from '../components/Chrome';
import { Metal } from '../components/Metal';
import { Donut, RingGauge } from '../components/Ring';
import { Layer, Shot } from '../components/Stage';
import { COPY } from '../copy';
import { DATA } from '../data';
import type { SceneProps } from '../Explainer';
import { countUp, enter, prog } from '../lib/anim';
import { arcPath, polar } from '../lib/geom';
import { SHOTS } from '../shots';
import { BEAM, C, EASE, fmtNum, fmtPct, STAGGER } from '../theme';

const V = DATA.validation;
const DEDUP = '#7C93B6';
const REJECT = '#55647C';
/** Validation ring centre (world px, left-to-right layout); the analyze scene opens on the same spot. */
export const VRING = { x: 520, y: 604, r: 196, stroke: 46 };

export const Validate: React.FC<SceneProps> = ({ lang, frames, matchIn, matchOut }) => {
  const f = useCurrentFrame();
  const rtl = lang === 'ar';
  const t = COPY[lang].validate;
  const mx = (x: number) => (rtl ? 1920 - x : x);
  const sweep = prog(f, 14, 46, EASE.inOut); // the scan travels once round the ring
  const segs = [
    { key: 'passed', value: V.passed, color: C.primary, label: t.passed },
    { key: 'dedup', value: V.deduplicated, color: DEDUP, label: t.dedup },
    { key: 'rejected', value: V.rejected, color: REJECT, label: t.rejected, pattern: 'url(#v-hatch)' },
  ];
  const size = 520;
  const cx = mx(VRING.x);
  const head = polar(cx, VRING.y, VRING.r, -90 + (rtl ? -360 : 360) * sweep);
  const kpis = [
    { label: t.passRate, value: V.passRatePct },
    { label: t.completeness, value: V.completenessPct },
    { label: t.consistency, value: V.consistencyPct },
  ];
  const tile = (i: number) => ({ x: 1080 + (i % 2) * 384, y: 150 + Math.floor(i / 2) * 387 });

  return (
    <Shot frames={frames} rtl={rtl} matchIn={matchIn} matchOut={matchOut} shots={SHOTS.validate}>
      <Layer>
        <Metal x={96} y={150} w={960} h={750} rtl={rtl} comet={{ phase: 0.1, speed: 13, len: 160 }} style={{ padding: '30px 36px' }}>
          <div style={enter(f, 2)}>
            <Eyebrow>{t.eyebrow}</Eyebrow>
            <div style={{ fontSize: 42, fontWeight: 600, marginTop: 4 }}>{t.title}</div>
            <div style={{ fontSize: 21, color: C.ink3, marginTop: 6 }}>{t.sub(V.rulesEnabled, fmtNum(V.ruleHitsToday))}</div>
          </div>
          {/* legend with exact values */}
          <div style={{ position: 'absolute', top: 250, insetInlineEnd: 36, width: 270 }}>
            <Eyebrow style={{ marginBottom: 16, ...enter(f, 24, 18, 8) }}>{t.split}</Eyebrow>
            {segs.map((s, i) => (
              <div key={s.key} style={{ marginBottom: 26, ...enter(f, 30 + i * STAGGER * 4, 18, 10) }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span
                    style={{
                      width: 18,
                      height: 18,
                      borderRadius: 5,
                      background: s.key === 'rejected' ? `repeating-linear-gradient(45deg, ${REJECT} 0 3px, ${REJECT}55 3px 6px)` : s.color,
                    }}
                  />
                  <Num size={i === 0 ? 36 : 30} color={C.ink}>
                    {fmtNum(s.value)}
                  </Num>
                </div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginTop: 2, marginInlineStart: 30 }}>
                  <span style={{ fontSize: 20, color: C.ink2 }}>{s.label}</span>
                  <Num size={18} color={C.ink3} mono>
                    {fmtPct((s.value / V.recordsIn) * 100)}
                  </Num>
                </div>
              </div>
            ))}
          </div>
        </Metal>
        {/* the validation ring: segment angle = 360° × count / records in */}
        <div style={{ position: 'absolute', left: cx - size / 2, top: VRING.y - size / 2, opacity: prog(f, 4, 14) }}>
          <Donut
            size={size}
            r={VRING.r}
            stroke={VRING.stroke}
            segs={segs}
            progress={sweep}
            rtl={rtl}
            defs={
              <pattern id="v-hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                <rect width="6" height="6" fill={REJECT} fillOpacity={0.3} />
                <line x1="0" y1="0" x2="0" y2="6" stroke={REJECT} strokeWidth="3" />
              </pattern>
            }
          >
            <Num size={58} weight={500} color={C.ink}>
              {fmtNum(countUp(f, 6, 40, V.recordsIn, V.recordsIn * 0.9))}
            </Num>
            <div style={{ fontSize: 21, color: C.ink3, marginTop: 2 }}>{t.recordsIn}</div>
          </Donut>
        </div>
        {/* scan head travelling round the ring */}
        {sweep > 0.001 && sweep < 0.999 && (
          <svg width={1920} height={1080} style={{ position: 'absolute', inset: 0, overflow: 'visible' }}>
            <path
              d={arcPath(cx, VRING.y, VRING.r + VRING.stroke / 2 + 12, -90 + (rtl ? -360 : 360) * Math.max(0, sweep - 0.08), -90 + (rtl ? -360 : 360) * sweep)}
              fill="none"
              stroke={BEAM.core}
              strokeOpacity={0.55}
              strokeWidth={3}
              strokeLinecap="round"
            />
            <line
              x1={polar(cx, VRING.y, VRING.r - VRING.stroke / 2 - 6, -90 + (rtl ? -360 : 360) * sweep).x}
              y1={polar(cx, VRING.y, VRING.r - VRING.stroke / 2 - 6, -90 + (rtl ? -360 : 360) * sweep).y}
              x2={polar(cx, VRING.y, VRING.r + VRING.stroke / 2 + 16, -90 + (rtl ? -360 : 360) * sweep).x}
              y2={polar(cx, VRING.y, VRING.r + VRING.stroke / 2 + 16, -90 + (rtl ? -360 : 360) * sweep).y}
              stroke={BEAM.core}
              strokeWidth={2.5}
              strokeLinecap="round"
            />
            <circle cx={head.x} cy={head.y} r={7} fill={BEAM.head} style={{ filter: `drop-shadow(0 0 8px ${BEAM.core})` }} />
          </svg>
        )}
      </Layer>

      {/* KPI dials: ratio rings (no weekly series exists for these, so no radial bars) */}
      <Layer>
        {kpis.map((k, i) => {
          const p = prog(f, 22 + i * STAGGER * 3, 44, EASE.expo);
          const pos = tile(i);
          return (
            <Metal key={k.label} x={pos.x} y={pos.y} w={360} h={363} rtl={rtl} style={{ padding: '26px 28px', ...enter(f, 14 + i * STAGGER * 3, 22, 16) }}>
              <div style={{ fontSize: 23, color: C.ink2, fontWeight: 500 }}>{k.label}</div>
              <div style={{ position: 'absolute', left: 0, right: 0, top: 84, display: 'flex', justifyContent: 'center' }}>
                <RingGauge size={236} r={96} stroke={16} value={(k.value / 100) * p} tone={C.accent} rtl={rtl} id={`kpi-${i}`}>
                  <Num size={46} weight={500}>
                    {fmtPct(k.value * p)}
                  </Num>
                </RingGauge>
              </div>
            </Metal>
          );
        })}
        {(() => {
          const pos = tile(3);
          const segDeg = 360 / V.quarantineTotal;
          return (
            <Metal x={pos.x} y={pos.y} w={360} h={363} rtl={rtl} style={{ padding: '26px 28px', ...enter(f, 14 + 3 * STAGGER * 3, 22, 16) }}>
              <div style={{ fontSize: 23, color: C.ink2, fontWeight: 500 }}>{t.quarantine}</div>
              <div style={{ position: 'absolute', left: 0, right: 0, top: 84, display: 'flex', justifyContent: 'center' }}>
                <div style={{ position: 'relative', width: 236, height: 236 }}>
                  <svg width={236} height={236} style={{ position: 'absolute', inset: 0, transform: rtl ? 'scaleX(-1)' : undefined }}>
                    {Array.from({ length: V.quarantineTotal }, (_, j) => {
                      const on = j < V.quarantineOpen;
                      const q = prog(f, 34 + j * STAGGER, 12, EASE.out);
                      const a0 = -90 + j * segDeg + 3;
                      const a1 = -90 + (j + 1) * segDeg - 3;
                      return <path key={j} d={arcPath(118, 118, 96, a0, a1)} fill="none" stroke={on ? C.primary : C.border} strokeWidth={16} opacity={0.3 + 0.7 * q} />;
                    })}
                  </svg>
                  <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                    <Num size={52} weight={500}>
                      {V.quarantineOpen}
                    </Num>
                    <div style={{ fontSize: 18, color: C.ink3 }}>{t.quarantineOf(V.quarantineTotal)}</div>
                  </div>
                </div>
              </div>
            </Metal>
          );
        })()}
      </Layer>
    </Shot>
  );
};
