import React from 'react';
import { useCurrentFrame } from 'remotion';
import { Check, Pill } from '../components/Bits';
import { Code, Eyebrow, Num, Tag } from '../components/Chrome';
import { Metal } from '../components/Metal';
import { Section } from '../components/Section';
import { Layer, Shot } from '../components/Stage';
import { COPY } from '../copy';
import { DATA } from '../data';
import type { SceneProps } from '../Explainer';
import { pull } from '../lib/camera';
import { enter, prog } from '../lib/anim';
import { arcPath } from '../lib/geom';
import { SHOTS } from '../shots';
import { C, EASE, STAGGER } from '../theme';

const S = DATA.story;
const T = S.task;
const F = S.facts;

export const Mitigate: React.FC<SceneProps> = ({ lang, frames, matchIn, matchOut }) => {
  const f = useCurrentFrame();
  const rtl = lang === 'ar';
  const ar = lang === 'ar';
  const t = COPY[lang].mitigate;
  const syncTime = T.writeback.at.slice(11, 16);
  const flow = prog(f, 70, 26, EASE.inOut);
  const synced = prog(f, 96, 14, EASE.out);
  const rack = pull(f, 66, 90); // focus pulls from the task to the zone and write-back
  const done = S.controls.filter((c) => c.done).length;
  const meta: Array<[string, React.ReactNode]> = [
    [t.owner, ar ? T.ownerAr : T.ownerEn],
    [t.due, <Num key="d" size={22} mono>{T.dueDate}</Num>],
    [t.risk, <Code key="r" size={22}>{S.code}</Code>],
    [t.criticalPath, S.pmImpact.criticalPath ? t.yes : '-'],
    [t.schedule, t.days(S.pmImpact.scheduleDays)],
    [t.cost, t.sar(S.pmImpact.costSAR)],
  ];
  const segDeg = 360 / S.controls.length;

  return (
    <Shot frames={frames} rtl={rtl} matchIn={matchIn} matchOut={matchOut} shots={SHOTS.mitigate}>
      {/* ── the task ── */}
      <Layer blur={2.5 * rack} opacity={1 - 0.1 * rack}>
        <Metal x={96} y={150} w={1024} h={750} rtl={rtl} comet={{ phase: 0.2, speed: 13, len: 160, opacity: 1 - rack }} style={{ padding: '30px 40px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, ...enter(f, 0) }}>
            <span style={{ padding: '5px 14px', borderRadius: 10, border: `1px solid ${C.border}`, background: C.raised }}>
              <Code size={26}>{T.code}</Code>
            </span>
            <Pill color={C.primary} size={19}>
              <span style={{ width: 8, height: 8, borderRadius: 999, background: C.accent }} />
              {t.status}
            </Pill>
            <span style={{ fontSize: 19, color: C.ink3 }}>{t.source}</span>
          </div>
          <div style={{ fontSize: 30, fontWeight: 600, lineHeight: 1.35, marginTop: 16, maxWidth: 940, ...enter(f, 3) }}>{ar ? T.titleAr : T.titleEn}</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1.25fr 1fr 1fr', rowGap: 14, columnGap: 28, marginTop: 22, ...enter(f, 8, 20, 10) }}>
            {meta.map(([k, v]) => (
              <div key={k}>
                <div style={{ fontSize: 17, color: C.ink3 }}>{k}</div>
                <div style={{ fontSize: 22, fontWeight: 500, marginTop: 3, whiteSpace: 'nowrap' }}>{v}</div>
              </div>
            ))}
          </div>
          <div style={{ height: 1, background: C.border, margin: '22px 0 14px' }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 18, ...enter(f, 12) }}>
            {/* controls dial: one segment per control, filled when the risk's history says it is done */}
            <div style={{ position: 'relative', width: 76, height: 76 }}>
              <svg width={76} height={76} style={{ position: 'absolute', inset: 0, transform: rtl ? 'scaleX(-1)' : undefined }}>
                {S.controls.map((c, i) => {
                  const p = prog(f, 26 + i * STAGGER * 4, 16, EASE.out);
                  return (
                    <path key={i} d={arcPath(38, 38, 30, -90 + i * segDeg + 5, -90 + (i + 1) * segDeg - 5)} fill="none" stroke={c.done ? C.primary : C.border} strokeWidth={9} strokeLinecap="round" opacity={c.done ? 0.3 + 0.7 * p : 1} />
                  );
                })}
              </svg>
              <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Num size={20} weight={600}>{`${done}/${S.controls.length}`}</Num>
              </div>
            </div>
            <div>
              <Eyebrow>{t.controls}</Eyebrow>
              <div style={{ fontSize: 20, fontWeight: 600, color: C.ink }}>{t.controlsDone(done, S.controls.length)}</div>
            </div>
          </div>
          <div style={{ marginTop: 8 }}>
            {S.controls.map((c, i) => {
              const p = prog(f, 26 + i * STAGGER * 4, 18, EASE.out);
              return (
                <div key={c.en} style={{ display: 'flex', alignItems: 'center', height: 44, gap: 16, ...enter(f, 16 + i * STAGGER, 18, 8) }}>
                  <span
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: 8,
                      border: `1.5px solid ${c.done ? C.primary : C.border2}`,
                      background: c.done ? `rgba(47,111,237,${0.95 * p})` : '#FFFFFF',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    {c.done ? (
                      <Check size={22} p={p} color="#FFFFFF" />
                    ) : (
                      <svg width={16} height={16} viewBox="0 0 16 16">
                        <circle cx={8} cy={8} r={6} fill="none" stroke={C.border2} strokeWidth={2} />
                        <path d="M8 2 A6 6 0 0 1 14 8" fill="none" stroke={C.accent} strokeWidth={2} strokeLinecap="round" />
                      </svg>
                    )}
                  </span>
                  <span style={{ fontSize: 22, color: C.ink, flex: 1 }}>{ar ? c.ar : c.en}</span>
                  <span style={{ fontSize: 17, fontWeight: 600, color: c.done ? C.primaryText : C.accentText }}>{c.done ? t.done : t.inProgress}</span>
                </div>
              );
            })}
          </div>
        </Metal>
      </Layer>

      {/* ── exclusion zone (control #1, schematic) and the simulated write-back ── */}
      <Layer depth={-30}>
        <Metal x={1144} y={150} w={680} h={420} rtl={rtl} comet={{ phase: 0.6, speed: 13, len: 150, opacity: rack }} style={{ padding: '24px 30px', ...enter(f, 8, 24, 14) }}>
          <Eyebrow>{t.zone}</Eyebrow>
          <div style={{ display: 'flex', gap: 10, marginTop: 10, flexWrap: 'wrap' }}>
            {S.controls
              .filter((c) => c.done)
              .map((c, i) => (
                <Pill key={c.en} color={C.accent} size={17} style={enter(f, 20 + i * STAGGER * 4, 16, 6)}>
                  <Check size={16} p={prog(f, 26 + i * STAGGER * 4, 14)} color={C.accentText} />
                  {ar ? c.ar : c.en}
                </Pill>
              ))}
          </div>
          <div style={{ position: 'absolute', insetInlineStart: 30, bottom: 20 }}>
            <Section
              w={616}
              h={290}
              rtl={rtl}
              crestX={60}
              toeX={140}
              pxPerM={10}
              workers={F.workers}
              excavators={F.excavators}
              crewX={150}
              crewCols={8}
              crewShift={prog(f, 40, 44, EASE.inOut) * (F.evacuateM * 10 + 10)}
              zoneM={F.evacuateM}
              zoneP={prog(f, 26, 30, EASE.inOut)}
              draw={1}
              annot={prog(f, 6, 16)}
              labels={{ crest: COPY[lang].explain.crest, pit: COPY[lang].explain.pit, zone: `${F.evacuateM} ${COPY[lang].explain.m}` }}
            />
          </div>
        </Metal>

        <Metal x={1144} y={594} w={680} h={306} rtl={rtl} style={{ padding: '22px 30px', ...enter(f, 30, 24, 14) }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <Eyebrow>{t.writeback}</Eyebrow>
            <span style={{ flex: 1 }} />
            {/* the Simulated tag is part of the card: on screen for as long as the write-back is */}
            <Tag size={16} color={C.amberText}>
              {t.synced}
            </Tag>
          </div>
          <div style={{ position: 'relative', marginTop: 6, height: 104 }}>
            {/* an arc, not a line: the record travels over it */}
            <svg width={616} height={110} style={{ position: 'absolute', inset: 0, overflow: 'visible', transform: rtl ? 'scaleX(-1)' : undefined }}>
              {(() => {
                const cx = 308;
                const r = 150;
                const cy = 79 + r * Math.sin((32 * Math.PI) / 180); // both ends at the chips' mid-height
                const a0 = -90 - 58;
                const a1 = -90 + 58;
                const d = arcPath(cx, cy, r, a0, a1);
                const len = (2 * Math.PI * r * 116) / 360;
                const tt = ((((f - 96) / 30) % 1) + 1) % 1;
                const head = a0 + (a1 - a0) * tt;
                const hp = { x: cx + r * Math.cos((head * Math.PI) / 180), y: cy + r * Math.sin((head * Math.PI) / 180) };
                return (
                  <>
                    <path d={d} fill="none" stroke={C.border2} strokeWidth={2} strokeDasharray="5 6" />
                    <path d={d} fill="none" stroke={C.accent} strokeWidth={2.5} strokeDasharray={`${len * flow} ${len}`} />
                    {flow >= 1 && <circle cx={hp.x} cy={hp.y} r={5} fill={C.accentBright} style={{ filter: `drop-shadow(0 0 5px ${C.accent})` }} />}
                  </>
                );
              })()}
            </svg>
            <div style={{ position: 'absolute', insetInlineStart: 0, top: 54, padding: '12px 18px', borderRadius: 12, border: `1px solid ${C.border2}`, background: '#FFFFFF', boxShadow: '0 2px 6px rgba(19,34,56,0.08)' }}>
              <Code size={22}>{T.code}</Code>
            </div>
            <div
              style={{
                position: 'absolute',
                insetInlineEnd: 0,
                top: 54,
                padding: '12px 18px',
                borderRadius: 12,
                border: `1px solid ${synced > 0 ? C.accent : C.border2}`,
                background: '#FFFFFF',
                fontSize: 22,
                fontWeight: 600,
                whiteSpace: 'nowrap',
                boxShadow: '0 2px 6px rgba(19,34,56,0.08)',
              }}
            >
              <bdi dir="ltr">{T.writeback.target}</bdi>
            </div>
          </div>
          <div style={{ marginTop: 10 }}>
            <Num size={19} color={C.ink2} mono style={{ opacity: synced }}>
              {T.writeback.at.slice(0, 10)} {syncTime}
            </Num>
            {/* shown with the card (from scene frame ~30 to its end: readable for about 3.3 s), not only after the arc */}
            <div style={{ fontSize: 17, color: C.ink3, marginTop: 4 }}>{t.simNote}</div>
          </div>
        </Metal>
      </Layer>
    </Shot>
  );
};
