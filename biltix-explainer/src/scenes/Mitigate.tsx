import React from 'react';
import { useCurrentFrame } from 'remotion';
import { Check, Pill } from '../components/Bits';
import { Card, Code, Eyebrow, Num } from '../components/Chrome';
import { SceneFrame } from '../components/SceneFrame';
import { Section } from '../components/Section';
import { COPY } from '../copy';
import { DATA } from '../data';
import type { SceneProps } from '../Explainer';
import { enter, prog } from '../lib/anim';
import { C, EASE, STAGGER } from '../theme';

const S = DATA.story;
const T = S.task;
const F = S.facts;

export const Mitigate: React.FC<SceneProps> = ({ lang, frames }) => {
  const f = useCurrentFrame();
  const rtl = lang === 'ar';
  const ar = lang === 'ar';
  const t = COPY[lang].mitigate;
  const syncTime = T.writeback.at.slice(11, 16);
  const flow = prog(f, 46, 26, EASE.inOut);
  const synced = prog(f, 72, 14, EASE.out);
  const meta: Array<[string, React.ReactNode]> = [
    [t.owner, ar ? T.ownerAr : T.ownerEn],
    [t.due, <Num key="d" size={22} mono>{T.dueDate}</Num>],
    [t.risk, <Code key="r" size={22}>{S.code}</Code>],
    [t.criticalPath, S.pmImpact.criticalPath ? t.yes : '—'],
    [t.schedule, t.days(S.pmImpact.scheduleDays)],
    [t.cost, t.sar(S.pmImpact.costSAR)],
  ];

  return (
    <SceneFrame
      frames={frames}
      rtl={rtl}
      cam={[
        { f: 0, s: 1.0, x: 0, y: 0 },
        { f: 60, s: 1.02, x: 24, y: -8 },
        { f: frames + 15, s: 1.04, x: 10, y: -26 },
      ]}
    >
      {/* ── the task ── */}
      <Card style={{ top: 236, insetInlineStart: 96, width: 1040, height: 664, padding: '30px 40px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, ...enter(f, 0) }}>
          <span style={{ padding: '6px 14px', borderRadius: 10, border: `1px solid ${C.border}`, background: C.bg }}>
            <Code size={26}>{T.code}</Code>
          </span>
          <Pill color={C.primary} size={19}>
            <span style={{ width: 8, height: 8, borderRadius: 999, background: C.accent }} />
            {t.status}
          </Pill>
          <span style={{ fontSize: 19, color: C.ink3 }}>{t.source}</span>
        </div>
        <div style={{ fontSize: 31, fontWeight: 600, lineHeight: 1.35, marginTop: 18, maxWidth: 940, ...enter(f, 3) }}>{ar ? T.titleAr : T.titleEn}</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1.25fr 1fr 1fr', rowGap: 16, columnGap: 28, marginTop: 24, ...enter(f, 8, 20, 10) }}>
          {meta.map(([k, v]) => (
            <div key={k}>
              <div style={{ fontSize: 17, color: C.ink3 }}>{k}</div>
              <div style={{ fontSize: 22, fontWeight: 500, marginTop: 3, whiteSpace: 'nowrap' }}>{v}</div>
            </div>
          ))}
        </div>
        <div style={{ height: 1, background: C.border, margin: '24px 0 16px' }} />
        <Eyebrow style={enter(f, 12)}>{t.controls}</Eyebrow>
        <div style={{ marginTop: 8 }}>
          {S.controls.map((c, i) => {
            const p = prog(f, 26 + i * STAGGER * 4, 18, EASE.out);
            return (
              <div key={c.en} style={{ display: 'flex', alignItems: 'center', height: 46, gap: 16, ...enter(f, 16 + i * STAGGER, 18, 8) }}>
                <span
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: 8,
                    border: `1.5px solid ${c.done ? C.primary : C.border}`,
                    background: c.done ? `rgba(47,111,237,${0.9 * p})` : 'transparent',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  {c.done ? (
                    <Check size={22} p={p} color="#FFFFFF" />
                  ) : (
                    <svg width={16} height={16} viewBox="0 0 16 16">
                      <circle cx={8} cy={8} r={6} fill="none" stroke={C.border} strokeWidth={2} />
                      <path d="M8 2 A6 6 0 0 1 14 8" fill="none" stroke={C.accent} strokeWidth={2} strokeLinecap="round" />
                    </svg>
                  )}
                </span>
                <span style={{ fontSize: 22, color: c.done ? C.ink : C.ink2, flex: 1 }}>{ar ? c.ar : c.en}</span>
                <span style={{ fontSize: 17, color: c.done ? C.ink2 : C.accent }}>{c.done ? t.done : t.inProgress}</span>
              </div>
            );
          })}
        </div>
      </Card>

      {/* ── evacuation zone (control #1), schematic ── */}
      <Card style={{ top: 236, insetInlineStart: 1160, width: 664, height: 404, padding: '26px 32px', ...enter(f, 8, 24, 14) }}>
        <Eyebrow>{t.zone}</Eyebrow>
        <div style={{ display: 'flex', gap: 10, marginTop: 12, flexWrap: 'wrap' }}>
          {S.controls
            .filter((c) => c.done)
            .map((c, i) => (
              <Pill key={c.en} color={C.accent} size={18} style={enter(f, 20 + i * STAGGER * 4, 16, 6)}>
                <Check size={16} p={prog(f, 26 + i * STAGGER * 4, 14)} color={C.accent} />
                {ar ? c.ar : c.en}
              </Pill>
            ))}
        </div>
        <div style={{ position: 'absolute', insetInlineStart: 32, bottom: 22 }}>
          <Section
            w={600}
            h={300}
            rtl={rtl}
            crestX={60}
            toeX={140}
            pxPerM={10}
            workers={F.workers}
            excavators={F.excavators}
            crewX={150}
            crewCols={8}
            crewShift={prog(f, 34, 40, EASE.inOut) * (F.evacuateM * 10 + 10)}
            zoneM={F.evacuateM}
            zoneP={prog(f, 22, 30, EASE.inOut)}
            draw={1}
            annot={prog(f, 6, 16)}
            labels={{
              crest: COPY[lang].explain.crest,
              pit: COPY[lang].explain.pit,
              zone: `${F.evacuateM} ${COPY[lang].explain.m}`,
            }}
          />
        </div>
      </Card>

      {/* ── write-back to the PM system ── */}
      <Card style={{ top: 660, insetInlineStart: 1160, width: 664, height: 240, padding: '24px 32px', ...enter(f, 30, 24, 14) }}>
        <Eyebrow>{t.writeback}</Eyebrow>
        <div style={{ position: 'relative', marginTop: 22, height: 70, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ padding: '14px 18px', borderRadius: 12, border: `1px solid ${C.border}`, background: C.bg, zIndex: 1 }}>
            <Code size={22}>{T.code}</Code>
          </div>
          <div style={{ position: 'absolute', insetInlineStart: 170, insetInlineEnd: 190, top: 34, height: 2, background: C.border }}>
            <div style={{ width: `${flow * 100}%`, height: '100%', background: `linear-gradient(${rtl ? 270 : 90}deg, ${C.primary}, ${C.accent})` }} />
            {flow >= 1 &&
              [0, 0.5].map((ph) => {
                const tt = (((f - 72) / 24 + ph) % 1 + 1) % 1;
                return <span key={ph} style={{ position: 'absolute', top: -3, insetInlineStart: `${tt * 100}%`, width: 8, height: 8, borderRadius: 999, background: C.accent, opacity: Math.sin(Math.PI * tt) }} />;
              })}
          </div>
          <div dir="ltr" style={{ padding: '14px 18px', borderRadius: 12, border: `1px solid ${synced > 0 ? C.accent : C.border}`, background: C.bg, fontSize: 22, fontWeight: 600, zIndex: 1, whiteSpace: 'nowrap' }}>
            {T.writeback.target}
          </div>
        </div>
        <div style={{ marginTop: 18, display: 'flex', alignItems: 'center', gap: 12, opacity: synced }}>
          <Pill color={C.accent} size={19}>
            <Check size={18} p={synced} color={C.accent} />
            {t.synced}
          </Pill>
          <Num size={20} color={C.ink2} mono>
            {T.writeback.at.slice(0, 10)} {syncTime}
          </Num>
        </div>
      </Card>
    </SceneFrame>
  );
};
