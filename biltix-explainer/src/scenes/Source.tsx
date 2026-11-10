import React from 'react';
import { useCurrentFrame } from 'remotion';
import { Card, Eyebrow, Num } from '../components/Chrome';
import { Emblem } from '../components/Emblem';
import { SceneFrame } from '../components/SceneFrame';
import { COPY } from '../copy';
import { DATA } from '../data';
import type { SceneProps } from '../Explainer';
import { countUp, enter, prog } from '../lib/anim';
import { cubic, cubicLength, isLatin, type Pt } from '../lib/geom';
import { C, EASE, fmtNum, STAGGER } from '../theme';

const V = DATA.validation;
const SHOWN = 6;

export const Source: React.FC<SceneProps> = ({ lang, frames }) => {
  const f = useCurrentFrame();
  const rtl = lang === 'ar';
  const t = COPY[lang].source;
  const mx = (x: number) => (rtl ? 1920 - x : x);
  const rows = V.bySource.slice(0, SHOWN);
  const maxRec = Math.max(...V.bySource.map((s) => s.recordsIn));
  const rowY = (i: number) => 445 + i * 74;
  const hub: Pt = { x: mx(1140), y: 566 };
  const hubR = 78;

  const paths = rows.map((_, i) => {
    const p0 = { x: mx(858), y: rowY(i) };
    const p3 = { x: mx(1140 - hubR - 4), y: hub.y + (i - 2.5) * 9 };
    const p1 = { x: mx(960), y: p0.y };
    const p2 = { x: mx(985), y: p3.y };
    return { p0, p1, p2, p3, len: cubicLength(p0, p1, p2, p3) };
  });
  const count = countUp(f, 16, 70, V.recordsIn);
  const lastBatch = V.lastBatch ? V.lastBatch.slice(11, 16) : '';

  return (
    <SceneFrame
      frames={frames}
      rtl={rtl}
      cam={[
        { f: 0, s: 1.0, x: 0, y: 0 },
        { f: 40, s: 1.005, x: 0, y: 0 },
        { f: frames + 15, s: 1.045, x: -40, y: 6 },
      ]}
    >
      {/* sources card */}
      <Card style={{ top: 236, insetInlineStart: 96, width: 762, height: 664, padding: '30px 36px' }}>
        <div style={enter(f, 2)}>
          <Eyebrow>{t.eyebrow}</Eyebrow>
          <div style={{ fontSize: 42, fontWeight: 600, marginTop: 4, color: C.ink }}>{t.title(V.sources)}</div>
          <div style={{ fontSize: 21, color: C.ink3, marginTop: 6 }}>{t.sub}</div>
        </div>
        <div style={{ position: 'absolute', top: 176, insetInlineStart: 36, insetInlineEnd: 36 }}>
          {rows.map((s, i) => {
            const name = lang === 'ar' ? s.nameAr : s.nameEn;
            const bar = prog(f, 14 + i * STAGGER, 34, EASE.expo);
            return (
              <div key={s.id} style={{ height: 66, marginBottom: 8, ...enter(f, 6 + i * STAGGER, 20, 14) }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                  <span style={{ fontSize: 23, fontWeight: 500, color: C.ink }}>
                    {isLatin(name) ? <bdi dir="ltr">{name}</bdi> : name}
                  </span>
                  <Num size={22} color={C.ink2}>
                    {fmtNum(s.recordsIn)}
                  </Num>
                </div>
                <div style={{ marginTop: 12, height: 6, borderRadius: 3, background: C.raised, overflow: 'hidden' }}>
                  <div
                    style={{
                      width: `${(s.recordsIn / maxRec) * 100 * bar}%`,
                      height: '100%',
                      borderRadius: 3,
                      background: `linear-gradient(${rtl ? 270 : 90}deg, ${C.primary}, ${C.accent})`,
                    }}
                  />
                </div>
              </div>
            );
          })}
          <div style={{ fontSize: 20, color: C.ink3, marginTop: 4, ...enter(f, 12, 20, 10) }}>{t.more(V.bySource.length - SHOWN)}</div>
        </div>
      </Card>

      {/* data streams */}
      <svg width="1920" height="1080" style={{ position: 'absolute', inset: 0, overflow: 'visible' }}>
        {paths.map((p, i) => {
          const d = `M ${p.p0.x} ${p.p0.y} C ${p.p1.x} ${p.p1.y}, ${p.p2.x} ${p.p2.y}, ${p.p3.x} ${p.p3.y}`;
          const draw = prog(f, 20 + i * STAGGER, 30, EASE.inOut);
          return (
            <g key={i}>
              <path d={d} fill="none" stroke={C.border} strokeWidth={1.5} strokeDasharray={p.len} strokeDashoffset={p.len * (1 - draw)} />
              {[0, 0.5].map((ph) => {
                const tt = (((f - 30) / 44 + ph + i * 0.13) % 1 + 1) % 1;
                const pt = cubic(p.p0, p.p1, p.p2, p.p3, tt);
                const o = draw >= 1 ? Math.sin(Math.PI * tt) : 0;
                return <circle key={ph} cx={pt.x} cy={pt.y} r={3.2} fill={C.accent} opacity={o * 0.9} />;
              })}
            </g>
          );
        })}
        {/* hub → counter */}
        {(() => {
          const draw = prog(f, 44, 20, EASE.inOut);
          const x0 = mx(1140 + hubR + 4);
          const x1 = mx(1290);
          return (
            <g>
              <line x1={x0} x2={x0 + (x1 - x0) * draw} y1={hub.y} y2={hub.y} stroke={C.accent} strokeOpacity={0.6} strokeWidth={2} />
              {draw >= 1 &&
                [0, 0.5].map((ph) => {
                  const tt = (((f - 64) / 26 + ph) % 1 + 1) % 1;
                  return <circle key={ph} cx={x0 + (x1 - x0) * tt} cy={hub.y} r={3.5} fill={C.accent} opacity={Math.sin(Math.PI * tt)} />;
                })}
            </g>
          );
        })()}
        {/* hub rings */}
        {(() => {
          const p = prog(f, 26, 26, EASE.expo);
          const breathe = 0.5 + 0.5 * Math.sin((f / 30) * Math.PI * 0.9);
          return (
            <g opacity={p}>
              <circle cx={hub.x} cy={hub.y} r={hubR + 18} fill="none" stroke={C.accent} strokeOpacity={0.10 + 0.08 * breathe} strokeWidth={1} />
              <circle cx={hub.x} cy={hub.y} r={hubR} fill={C.surface} stroke={C.border} strokeWidth={1.5} />
              <circle cx={hub.x} cy={hub.y} r={hubR - 10} fill="none" stroke={C.primary} strokeOpacity={0.5} strokeWidth={1} strokeDasharray="2 6" />
            </g>
          );
        })()}
      </svg>
      <div
        style={{
          position: 'absolute',
          left: hub.x - 40,
          top: hub.y - 44,
          width: 80,
          display: 'flex',
          justifyContent: 'center',
          opacity: prog(f, 30, 20),
        }}
      >
        <Emblem size={76} id="hub" />
      </div>
      <div
        style={{
          position: 'absolute',
          left: hub.x - 120,
          width: 240,
          top: hub.y + hubR + 26,
          textAlign: 'center',
          fontSize: 21,
          color: C.ink2,
          ...enter(f, 34, 20, 8),
        }}
      >
        {t.hub}
      </div>

      {/* counter card */}
      <Card style={{ top: 392, insetInlineStart: 1290, width: 534, height: 348, padding: '32px 38px', ...enter(f, 40, 24, 16) }}>
        <Eyebrow>{t.records}</Eyebrow>
        <div style={{ marginTop: 14 }}>
          <Num size={96} weight={500} color={C.ink}>
            {fmtNum(count)}
          </Num>
        </div>
        <div style={{ height: 1, background: C.border, margin: '26px 0 22px' }} />
        <div style={{ display: 'flex', gap: 40 }}>
          <div>
            <div style={{ fontSize: 18, color: C.ink3 }}>{t.eyebrow}</div>
            <Num size={30} color={C.ink}>
              {V.sources}
            </Num>
          </div>
          <div>
            <div style={{ fontSize: 18, color: C.ink3 }}>{t.lastBatch}</div>
            <Num size={30} color={C.ink}>
              {lastBatch}
            </Num>
          </div>
        </div>
      </Card>
    </SceneFrame>
  );
};
