import React from 'react';
import { useCurrentFrame } from 'remotion';
import { Eyebrow, Num, Tag } from '../components/Chrome';
import { Emblem } from '../components/Emblem';
import { Metal, MetalRing } from '../components/Metal';
import { Layer, Shot } from '../components/Stage';
import { COPY } from '../copy';
import { DATA } from '../data';
import type { SceneProps } from '../Explainer';
import { countUp, enter, prog } from '../lib/anim';
import { isLatin, polar } from '../lib/geom';
import { SHOTS } from '../shots';
import { C, EASE, fmtNum, STAGGER } from '../theme';
import { COMET_LAPS } from './Intro';

const V = DATA.validation;
const SHOWN = 6;
/** Hub centre; the scene opens with the camera on it (match cut from the intro emblem). */
const HUB = { x: 1330, y: 540 };
const HUB_R = 103;
const SPOKE_IN = 138;
const SPOKE_MAX = 250; // px for the largest source (linear: length = records in / max × 250)

export const Source: React.FC<SceneProps> = ({ lang, frames, matchIn, matchOut }) => {
  const f = useCurrentFrame();
  const rtl = lang === 'ar';
  const t = COPY[lang].source;
  const mx = (x: number) => (rtl ? 1920 - x : x);
  const rows = V.bySource.slice(0, SHOWN);
  const maxRec = Math.max(...V.bySource.map((s) => s.recordsIn));
  const n = V.bySource.length;
  const step = 360 / n;
  // spokes start at the inline-end (3 o'clock in English, 9 o'clock in Arabic) and run clockwise / counter-clockwise
  const angleOf = (k: number) => (rtl ? -90 - k * step : 90 + k * step) - 90; // polar(): 0° = +x
  const hub = { x: mx(HUB.x), y: HUB.y };
  const count = countUp(f, 30, 64, V.recordsIn);
  const lastBatch = V.lastBatch ? V.lastBatch.slice(11, 16) : '';
  const hubP = prog(f, 0, 18, EASE.out);

  // flow arc from the hub into the records counter (left card)
  const a0 = { x: mx(HUB.x - HUB_R - 8), y: HUB.y + 24 };
  const a1 = { x: mx(812), y: 772 };
  const ctl = { x: mx(1040), y: 860 };
  const arc = `M ${a0.x} ${a0.y} Q ${ctl.x} ${ctl.y} ${a1.x} ${a1.y}`;
  const qpt = (tt: number) => ({
    x: (1 - tt) * (1 - tt) * a0.x + 2 * (1 - tt) * tt * ctl.x + tt * tt * a1.x,
    y: (1 - tt) * (1 - tt) * a0.y + 2 * (1 - tt) * tt * ctl.y + tt * tt * a1.y,
  });
  const arcDraw = prog(f, 40, 24, EASE.inOut);

  return (
    <Shot frames={frames} rtl={rtl} matchIn={matchIn} matchOut={matchOut} shots={SHOTS.source}>
      {/* ── radial feeds round the ingestion hub ── */}
      <Layer>
        <svg width={1920} height={1080} style={{ position: 'absolute', inset: 0, overflow: 'visible' }}>
          {V.bySource.map((s, k) => {
            const ang = angleOf(k);
            const len = (s.recordsIn / maxRec) * SPOKE_MAX;
            const grow = prog(f, 14 + k * STAGGER * 1.5, 34, EASE.expo);
            const p0 = polar(hub.x, hub.y, SPOKE_IN, ang);
            const pS = polar(hub.x, hub.y, SPOKE_IN + SPOKE_MAX, ang);
            const p1 = polar(hub.x, hub.y, SPOKE_IN + Math.max(0.5, len * grow), ang);
            const top = k < SHOWN;
            return (
              <g key={s.id}>
                <line x1={p0.x} y1={p0.y} x2={pS.x} y2={pS.y} stroke="rgba(85,100,124,0.09)" strokeWidth={10} strokeLinecap="round" opacity={prog(f, 8, 20)} />
                <line x1={p0.x} y1={p0.y} x2={p1.x} y2={p1.y} stroke={top ? C.primary : '#9DB4DE'} strokeWidth={10} strokeLinecap="round" opacity={grow > 0 ? 1 : 0} />
              </g>
            );
          })}
          {/* records travelling inward along the labelled spokes */}
          {rows.map((s, k) => {
            const ang = angleOf(k);
            const len = (s.recordsIn / maxRec) * SPOKE_MAX;
            const live = prog(f, 44 + k * 2, 10);
            return [0, 0.5].map((ph) => {
              const tt = ((((f - 44) / 36 + ph + k * 0.17) % 1) + 1) % 1;
              const r = SPOKE_IN + len + 14 - tt * (len + 14 + SPOKE_IN - HUB_R - 6);
              const p = polar(hub.x, hub.y, r, ang);
              return <circle key={`${k}-${ph}`} cx={p.x} cy={p.y} r={4.2} fill={C.accentBright} opacity={live * Math.sin(Math.PI * tt) * 0.95} />;
            });
          })}
          {/* hub → counter */}
          <path d={arc} fill="none" stroke={C.border2} strokeWidth={2} strokeDasharray="1200" strokeDashoffset={1200 * (1 - arcDraw)} />
          {arcDraw >= 1 &&
            [0, 0.33, 0.66].map((ph) => {
              const tt = ((((f - 64) / 34 + ph) % 1) + 1) % 1;
              const p = qpt(tt);
              return <circle key={ph} cx={p.x} cy={p.y} r={4.5} fill={C.accent} opacity={Math.sin(Math.PI * tt)} />;
            })}
          {/* hub disc */}
          <circle cx={hub.x} cy={hub.y} r={HUB_R - 2} fill="#FFFFFF" opacity={hubP} style={{ filter: 'drop-shadow(0 10px 22px rgba(19,34,56,0.14))' }} />
          <circle cx={hub.x} cy={hub.y} r={HUB_R - 14} fill="none" stroke={C.primary} strokeOpacity={0.35} strokeWidth={1.2} strokeDasharray="2 7" opacity={hubP} />
        </svg>
        <MetalRing cx={hub.x} cy={hub.y} r={HUB_R} width={2.5} rtl={rtl} id="hub-ring" comet={{ phase: (COMET_LAPS * 72) % 1, speed: COMET_LAPS * 2 * Math.PI * HUB_R, len: 140 }} />
        <div style={{ position: 'absolute', left: hub.x - 66, top: hub.y - 66 }}>
          <Emblem size={132} id="hub" />
        </div>
        {/* hub label (above, where the smallest feeds leave room) */}
        <div style={{ position: 'absolute', left: hub.x - 160, width: 320, top: hub.y - HUB_R - 74, textAlign: 'center', ...enter(f, 30, 18, 8) }}>
          <div style={{ fontSize: 24, fontWeight: 600, color: C.ink }}>{t.hub}</div>
        </div>
        {/* index badges at the tips of the labelled spokes */}
        {rows.map((s, k) => {
          const len = (s.recordsIn / maxRec) * SPOKE_MAX;
          const p = polar(hub.x, hub.y, SPOKE_IN + len + 30, angleOf(k));
          const o = prog(f, 30 + k * STAGGER * 2, 14, EASE.out);
          return (
            <div
              key={s.id}
              style={{
                position: 'absolute',
                left: p.x - 17,
                top: p.y - 17,
                width: 34,
                height: 34,
                borderRadius: 999,
                background: '#FFFFFF',
                border: `1.5px solid ${C.primary}`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                opacity: o,
                transform: `scale(${0.7 + 0.3 * o})`,
                boxShadow: '0 2px 6px rgba(19,34,56,0.12)',
              }}
            >
              <Num size={17} weight={600} color={C.primaryText} mono>
                {k + 1}
              </Num>
            </div>
          );
        })}
      </Layer>

      {/* ── the sources and the records counter ── */}
      <Layer>
        <Metal x={96} y={150} w={700} h={750} rtl={rtl} comet={{ phase: 0.62, speed: 12, len: 150, opacity: prog(f, 50, 20) }} style={{ padding: '30px 36px', opacity: prog(f, 6, 20) }}>
          <div style={enter(f, 8)}>
            <Eyebrow>{t.eyebrow}</Eyebrow>
            <div style={{ fontSize: 44, fontWeight: 600, marginTop: 4, color: C.ink }}>{t.title(V.sources)}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 8 }}>
              <span style={{ fontSize: 20, color: C.ink3 }}>{t.sub}</span>
            </div>
            <div style={{ marginTop: 12 }}>
              <Tag size={17}>{t.feeds}</Tag>
            </div>
          </div>
          <div style={{ position: 'absolute', top: 206, insetInlineStart: 36, insetInlineEnd: 36 }}>
            {rows.map((s, i) => {
              const name = lang === 'ar' ? s.nameAr : s.nameEn;
              return (
                <div key={s.id} style={{ height: 52, display: 'flex', alignItems: 'center', gap: 14, borderBottom: `1px solid ${C.border}`, ...enter(f, 12 + i * STAGGER * 2, 18, 10) }}>
                  <span style={{ width: 28, height: 28, borderRadius: 999, border: `1.5px solid ${C.primary}`, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>
                    <Num size={14} weight={600} color={C.primaryText} mono>
                      {i + 1}
                    </Num>
                  </span>
                  <span style={{ fontSize: 22, fontWeight: 500, color: C.ink, flex: 1, whiteSpace: 'nowrap' }}>{isLatin(name) ? <bdi dir="ltr">{name}</bdi> : name}</span>
                  <Num size={22} color={C.ink2}>
                    {fmtNum(s.recordsIn)}
                  </Num>
                </div>
              );
            })}
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 12, fontSize: 18, color: C.ink3, ...enter(f, 22, 18, 8) }}>
              <span>{t.more(V.bySource.length - SHOWN)}</span>
              <span>{t.radial}</span>
            </div>
          </div>
          <div style={{ position: 'absolute', insetInlineStart: 36, insetInlineEnd: 36, bottom: 30, ...enter(f, 34, 22, 12) }}>
            <Eyebrow>{t.records}</Eyebrow>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginTop: 4 }}>
              <Num size={84} weight={500} color={C.ink}>
                {fmtNum(count)}
              </Num>
              <div style={{ textAlign: 'end' }}>
                <div style={{ fontSize: 17, color: C.ink3 }}>{t.lastBatch}</div>
                <Num size={28} color={C.ink}>
                  {lastBatch}
                </Num>
              </div>
            </div>
          </div>
        </Metal>
      </Layer>
    </Shot>
  );
};
