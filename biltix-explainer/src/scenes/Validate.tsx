import React from 'react';
import { useCurrentFrame } from 'remotion';
import { Card, Eyebrow, Num } from '../components/Chrome';
import { SceneFrame } from '../components/SceneFrame';
import { COPY } from '../copy';
import { DATA } from '../data';
import type { SceneProps } from '../Explainer';
import { countUp, enter, prog } from '../lib/anim';
import { C, EASE, fmtNum, fmtPct, STAGGER } from '../theme';

const V = DATA.validation;
const DEDUP = '#4C6385';
const REJECT = '#8796AC';

export const Validate: React.FC<SceneProps> = ({ lang, frames }) => {
  const f = useCurrentFrame();
  const rtl = lang === 'ar';
  const t = COPY[lang].validate;
  const W = 1656; // bar width (px)
  const H = 60;
  const segs = [
    { key: 'passed', value: V.passed, color: `url(#v-pass)`, swatch: C.accent, label: t.passed },
    { key: 'dedup', value: V.deduplicated, color: DEDUP, swatch: DEDUP, label: t.dedup },
    { key: 'rejected', value: V.rejected, color: `url(#v-hatch)`, swatch: REJECT, label: t.rejected },
  ].map((s) => ({ ...s, w: (s.value / V.recordsIn) * W, pct: (s.value / V.recordsIn) * 100 }));
  let acc = 0;
  const placed = segs.map((s) => {
    const x = acc;
    acc += s.w;
    return { ...s, x };
  });
  const scan = prog(f, 12, 44, EASE.inOut); // validation sweep
  const reveal = prog(f, 4, 18, EASE.out);
  const split = prog(f, 56, 16, EASE.out);
  // RTL: the bar starts at the right edge
  const X = (x: number) => (rtl ? W - x : x);
  const zoom = 4;
  const zoomSpan = 100; // last 100 px of the bar, magnified ×4
  const inset = { w: zoomSpan * zoom, h: 34 };
  const zoomP = prog(f, 66, 22, EASE.expo);

  const kpis = [
    { label: t.passRate, value: V.passRatePct, pct: true },
    { label: t.completeness, value: V.completenessPct, pct: true },
    { label: t.consistency, value: V.consistencyPct, pct: true },
    { label: t.quarantine, value: V.quarantineOpen, pct: false },
  ];

  return (
    <SceneFrame
      frames={frames}
      rtl={rtl}
      cam={[
        { f: 0, s: 1.0, x: 0, y: 0 },
        { f: 50, s: 1.01, x: 0, y: 0 },
        { f: frames + 15, s: 1.04, x: -34, y: 10 },
      ]}
    >
      <Card style={{ top: 236, insetInlineStart: 96, width: 1728, height: 362, padding: '30px 36px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', ...enter(f, 2) }}>
          <div>
            <Eyebrow>{t.eyebrow}</Eyebrow>
            <div style={{ fontSize: 40, fontWeight: 600, marginTop: 4 }}>{t.title}</div>
            <div style={{ fontSize: 21, color: C.ink3, marginTop: 6 }}>{t.sub(V.rulesEnabled, fmtNum(V.ruleHitsToday))}</div>
          </div>
          <div style={{ textAlign: 'end' }}>
            <Num size={44} color={C.ink}>
              {fmtNum(countUp(f, 0, 30, V.recordsIn, V.recordsIn * 0.9))}
            </Num>
            <div style={{ fontSize: 20, color: C.ink3, marginTop: 2 }}>{t.recordsIn}</div>
          </div>
        </div>

        {/* proportional bar — every segment width = count / records in */}
        <svg width={W} height={H + 120} style={{ position: 'absolute', top: 168, insetInlineStart: 36, overflow: 'visible' }}>
          <defs>
            <linearGradient id="v-pass" x1={rtl ? 1 : 0} x2={rtl ? 0 : 1} y1="0" y2="0">
              <stop offset="0%" stopColor={C.primary} />
              <stop offset="100%" stopColor={C.accent} />
            </linearGradient>
            <pattern id="v-hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <rect width="6" height="6" fill={REJECT} fillOpacity={0.35} />
              <line x1="0" y1="0" x2="0" y2="6" stroke={REJECT} strokeWidth="3" />
            </pattern>
            <pattern id="v-raw" width="10" height="10" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <rect width="10" height="10" fill="#15233A" />
              <line x1="0" y1="0" x2="0" y2="10" stroke="#1D2E48" strokeWidth="4" />
            </pattern>
            <clipPath id="v-clip">
              <rect x={rtl ? W - W * scan : 0} y={0} width={W * scan} height={H} />
            </clipPath>
            <clipPath id="v-round">
              <rect x={rtl ? W - W * reveal : 0} y={0} width={W * reveal} height={H} rx={10} />
            </clipPath>
          </defs>
          <g clipPath="url(#v-round)">
            <rect x={0} y={0} width={W} height={H} fill="url(#v-raw)" />
            <g clipPath="url(#v-clip)">
              {placed.map((s) => (
                <rect key={s.key} x={rtl ? W - s.x - s.w : s.x} y={0} width={s.w} height={H} fill={s.color} />
              ))}
              {/* segment separators (drawn over the boundary, no width stolen) */}
              {placed.slice(1).map((s) => (
                <rect key={s.key} x={X(s.x) - 1.5 * split} y={0} width={3 * split} height={H} fill={C.surface} />
              ))}
            </g>
          </g>
          {/* scan line */}
          {scan > 0 && scan < 1 && (
            <g>
              <rect x={X(W * scan) - 1} y={-14} width={2} height={H + 28} fill={C.accent} />
              <rect x={X(W * scan) - (rtl ? 0 : 60)} y={0} width={60} height={H} fill="url(#v-pass)" opacity={0.18} />
            </g>
          )}
          {/* magnifier bracket over the tail of the bar */}
          <g opacity={zoomP}>
            <path
              d={`M ${X(W - zoomSpan)} ${H + 6} L ${X(W - zoomSpan)} ${H + 14} L ${X(W)} ${H + 14} L ${X(W)} ${H + 6}`}
              fill="none"
              stroke={C.ink3}
              strokeWidth={1}
            />
            <line x1={X(W - zoomSpan / 2)} y1={H + 14} x2={X(W - inset.w / 2)} y2={H + 40} stroke={C.ink3} strokeWidth={1} strokeDasharray="3 4" />
          </g>
          <g opacity={zoomP} transform={`translate(${rtl ? 0 : W - inset.w} ${H + 44 + (1 - zoomP) * 8})`}>
            <rect x={0} y={0} width={inset.w} height={inset.h} rx={6} fill="none" stroke={C.border} />
            {placed.map((s) => {
              const x0 = Math.max(s.x, W - zoomSpan);
              const x1 = s.x + s.w;
              if (x1 <= W - zoomSpan) return null;
              const zx = (x0 - (W - zoomSpan)) * zoom;
              const zw = (x1 - x0) * zoom;
              return <rect key={s.key} x={rtl ? inset.w - zx - zw : zx} y={1} width={zw} height={inset.h - 2} fill={s.color} />;
            })}
            {placed.slice(1).map((s) => {
              const zx = (s.x - (W - zoomSpan)) * zoom;
              return <rect key={s.key} x={(rtl ? inset.w - zx : zx) - 1.5} y={1} width={3} height={inset.h - 2} fill={C.surface} />;
            })}
          </g>
        </svg>
        {/* legend with exact values */}
        <div style={{ position: 'absolute', top: 262, insetInlineStart: 36, display: 'flex', gap: 40, ...enter(f, 30, 20, 10) }}>
          {placed.map((s) => (
            <div key={s.key} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ width: 16, height: 16, borderRadius: 4, background: s.swatch, opacity: s.key === 'rejected' ? 0.8 : 1 }} />
              <Num size={s.key === 'passed' ? 30 : 26} color={C.ink}>
                {fmtNum(s.value)}
              </Num>
              <span style={{ fontSize: 21, color: C.ink2 }}>{s.label}</span>
              <Num size={19} color={C.ink3} mono>
                {fmtPct(s.pct)}
              </Num>
            </div>
          ))}
        </div>
        <div style={{ position: 'absolute', top: 302, insetInlineEnd: 36 + inset.w + 14, fontSize: 18, color: C.ink3, opacity: zoomP }}>
          <Num size={18} color={C.ink3} mono>
            ×{zoom}
          </Num>
        </div>
      </Card>

      {/* KPI tiles */}
      {kpis.map((k, i) => {
        const p = prog(f, 26 + i * STAGGER, 40, EASE.expo);
        const val = k.pct ? fmtPct(k.value * p) : fmtNum(k.value * p);
        return (
          <Card key={k.label} style={{ top: 622, insetInlineStart: 96 + i * (414 + 24), width: 414, height: 278, padding: '28px 30px', ...enter(f, 18 + i * STAGGER, 22, 16) }}>
            <div style={{ fontSize: 22, color: C.ink2 }}>{k.label}</div>
            <div style={{ marginTop: 10 }}>
              <Num size={64} color={C.ink}>
                {val}
              </Num>
            </div>
            {k.pct ? (
              <div style={{ marginTop: 34 }}>
                <div style={{ height: 8, borderRadius: 4, background: C.raised, overflow: 'hidden', border: `1px solid ${C.borderSoft}` }}>
                  <div style={{ width: `${k.value * p}%`, height: '100%', background: `linear-gradient(${rtl ? 270 : 90}deg, ${C.primary}, ${C.accent})` }} />
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8 }}>
                  <Num size={16} color={C.ink3} mono>
                    0
                  </Num>
                  <Num size={16} color={C.ink3} mono>
                    100
                  </Num>
                </div>
              </div>
            ) : (
              <div style={{ marginTop: 26 }}>
                <div style={{ display: 'flex', gap: 6 }}>
                  {Array.from({ length: V.quarantineTotal }, (_, j) => {
                    const on = j < V.quarantineOpen;
                    const q = prog(f, 34 + j * STAGGER, 14, EASE.out);
                    return (
                      <span
                        key={j}
                        style={{
                          width: 18,
                          height: 18,
                          borderRadius: 4,
                          background: on ? C.primary : 'transparent',
                          border: `1px solid ${on ? C.primary : C.border}`,
                          opacity: 0.25 + 0.75 * q,
                        }}
                      />
                    );
                  })}
                </div>
                <div style={{ fontSize: 18, color: C.ink3, marginTop: 10 }}>{t.quarantineOf(V.quarantineTotal)}</div>
              </div>
            )}
          </Card>
        );
      })}
    </SceneFrame>
  );
};
