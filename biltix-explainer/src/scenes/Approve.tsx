import React from 'react';
import { useCurrentFrame } from 'remotion';
import { Check, DirArrow, Person, Pill, ScoreChip } from '../components/Bits';
import { Code, Eyebrow, Num } from '../components/Chrome';
import { Metal } from '../components/Metal';
import { mixHex } from '../components/Ring';
import { Layer, Shot } from '../components/Stage';
import { COPY } from '../copy';
import { DATA } from '../data';
import type { SceneProps } from '../Explainer';
import { enter, prog } from '../lib/anim';
import { arcPath, polar } from '../lib/geom';
import { SHOTS } from '../shots';
import { C, EASE, STAGGER } from '../theme';

const S = DATA.story;
const ratingOf = (score: number) => (score >= 70 ? 'red' : score >= 40 ? 'yellow' : 'green'); // B2 thresholds
const PRESS = 74; // frame the reviewer accepts
const TARGET_LABEL = `${S.recommendation.targetApprox ? '~' : ''}${S.recommendation.targetScore}`;
const CLOCK_MIN = 60; // the dial's scale: one hour from detection

export const Approve: React.FC<SceneProps> = ({ lang, frames, matchIn, matchOut }) => {
  const f = useCurrentFrame();
  const rtl = lang === 'ar';
  const ar = lang === 'ar';
  const t = COPY[lang].approve;
  const rl = COPY[lang].rating;
  const press = prog(f, PRESS, 5, EASE.inOut) - prog(f, PRESS + 5, 8, EASE.out);
  const accepted = prog(f, PRESS + 8, 14, EASE.out);
  const ring = prog(f, PRESS + 4, 22, EASE.out);

  const tl = S.timeline;
  const at = (kind: string) => tl.find((e) => e.kind === kind);
  // minutes elapsed since detection, from the real timestamps
  const since = (kind: string) => {
    const e = at(kind);
    const d0 = at('detected');
    return e && d0 ? Math.round((Date.parse(e.at) - Date.parse(d0.at)) / 60000) : null;
  };
  const steps = [
    { time: at('detected')?.time, label: t.detected, delta: 0 },
    { time: at('alert')?.time, label: t.escalated, delta: since('alert') ?? 0 },
    { time: at('ack')?.time, label: t.acknowledged, delta: since('ack') ?? 0 },
    { time: at('accept')?.time, label: t.decided, delta: since('accept') ?? 0 },
  ];
  const decisionMin = steps[3].delta;
  // decision clock: the arc runs from detection to the decision once the reviewer has accepted
  const clockP = prog(f, 92, 40, EASE.inOut);
  const clockMin = decisionMin * clockP;
  const CX = 150;
  const CR = 118;
  const ang = (m: number) => -90 + (rtl ? -1 : 1) * (360 * m) / CLOCK_MIN;

  return (
    <Shot frames={frames} rtl={rtl} matchIn={matchIn} matchOut={matchOut} shots={SHOTS.approve}>
      <Layer>
        {/* ── recommendation ── */}
        <Metal x={96} y={150} w={1000} h={750} rtl={rtl} comet={{ phase: 0.15, speed: 13, len: 160 }} style={{ padding: '32px 40px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, ...enter(f, 0) }}>
            <Eyebrow>{t.recTitle}</Eyebrow>
            <span style={{ color: C.ink3 }}>·</span>
            <Code size={20}>{S.code}</Code>
          </div>
          <div style={{ marginTop: 16, fontSize: ar ? 33 : 34, lineHeight: 1.5, fontWeight: 500, color: C.ink, maxWidth: 920, ...enter(f, 4, 24, 12) }}>
            {ar ? S.recommendation.actionAr : S.recommendation.actionEn}
          </div>
          <div style={{ height: 1, background: C.border, margin: '26px 0 22px' }} />
          <div style={{ display: 'flex', gap: 56, alignItems: 'flex-start', ...enter(f, 14, 20, 10) }}>
            <div>
              <div style={{ fontSize: 19, color: C.ink3, marginBottom: 10 }}>{t.impact}</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <ScoreChip score={S.score} rating={S.rating} label={rl[S.rating]} size={26} />
                <DirArrow rtl={rtl} size={30} />
                <ScoreChip score={TARGET_LABEL} rating={ratingOf(S.recommendation.targetScore)} label={rl[ratingOf(S.recommendation.targetScore)]} size={26} dashed />
              </div>
            </div>
            <div>
              <div style={{ fontSize: 19, color: C.ink3, marginBottom: 10 }}>{t.effort}</div>
              <div style={{ fontSize: 26, fontWeight: 600, lineHeight: '56px' }}>{ar ? S.recommendation.effortAr : S.recommendation.effortEn}</div>
            </div>
          </div>
          <div style={{ marginTop: 22, maxWidth: 900, ...enter(f, 18, 20, 10) }}>
            <div style={{ fontSize: 19, color: C.ink3, marginBottom: 6 }}>{t.rationale}</div>
            <div style={{ fontSize: 24, lineHeight: 1.5, color: C.ink2 }}>{ar ? S.recommendation.rationaleAr : S.recommendation.rationaleEn}</div>
          </div>

          {/* decision buttons */}
          <div style={{ position: 'absolute', bottom: 34, insetInlineStart: 40, display: 'flex', gap: 16, alignItems: 'center', ...enter(f, 22, 20, 10) }}>
            <div style={{ position: 'relative' }}>
              <div style={{ position: 'absolute', inset: -10 * ring, borderRadius: 16 + 10 * ring, border: `2px solid ${C.accent}`, opacity: (1 - ring) * (ring > 0 ? 0.9 : 0) }} />
              <div
                style={{
                  height: 64,
                  minWidth: 220,
                  padding: '0 30px',
                  borderRadius: 14,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 12,
                  fontSize: 24,
                  fontWeight: 600,
                  color: '#FFFFFF',
                  background: accepted > 0 ? `linear-gradient(180deg, #2B8FD8, ${C.primary})` : C.primary,
                  boxShadow: `0 10px 26px rgba(47,111,237,${0.28 + 0.18 * accepted})`,
                  transform: `scale(${1 - 0.04 * press})`,
                }}
              >
                {accepted > 0 ? (
                  <>
                    <Check size={26} p={accepted} color="#FFFFFF" />
                    <span style={{ opacity: accepted }}>{t.accepted}</span>
                    <Num size={21} color="#E6EEFF" style={{ opacity: accepted }}>
                      {at('accept')?.time}
                    </Num>
                  </>
                ) : (
                  t.accept
                )}
              </div>
            </div>
            {[t.edit, t.dismiss].map((label, i) => (
              <div
                key={label}
                style={{
                  height: 64,
                  padding: '0 28px',
                  borderRadius: 14,
                  display: 'flex',
                  alignItems: 'center',
                  fontSize: 23,
                  fontWeight: 500,
                  color: C.ink2,
                  border: i === 0 ? `1px solid ${C.border2}` : '1px solid transparent',
                  background: '#FFFFFF',
                  opacity: 1 - 0.6 * accepted,
                }}
              >
                {label}
              </div>
            ))}
          </div>
        </Metal>

        {/* ── reviewer + decision clock ── */}
        <Metal x={1120} y={150} w={704} h={750} rtl={rtl} comet={{ phase: 0.7, speed: 13, len: 150, opacity: accepted }} style={{ padding: '30px 40px', ...enter(f, 8, 24, 16) }}>
          <Eyebrow>{t.reviewer}</Eyebrow>
          <div style={{ display: 'flex', alignItems: 'center', gap: 20, marginTop: 14 }}>
            <div
              style={{
                width: 84,
                height: 84,
                borderRadius: 999,
                background: C.raised,
                border: `1.5px solid ${C.border2}`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: accepted > 0 ? `0 0 0 ${4 * accepted}px rgba(14,147,172,0.25)` : 'none',
              }}
            >
              <Person size={52} />
            </div>
            <div>
              <div style={{ fontSize: 29, fontWeight: 600 }}>{ar ? S.reviewer.nameAr : S.reviewer.nameEn}</div>
              <div style={{ fontSize: 19, color: C.ink2, marginTop: 4 }}>
                {ar ? S.reviewer.roleAr : S.reviewer.roleEn} · <Code size={17} color={C.ink2}>{S.site.code}</Code>
              </div>
            </div>
            <span style={{ flex: 1 }} />
            <Pill color={C.primary} size={18}>
              <Person size={19} color={C.ink} />
              {t.human}
            </Pill>
          </div>

          {/* the clock: 60-minute dial, events at their real minute offsets from detection */}
          <div style={{ position: 'absolute', top: 196, insetInlineStart: 30, width: 300, height: 300 }}>
            <svg width={300} height={300} style={{ position: 'absolute', inset: 0, overflow: 'visible' }}>
              <circle cx={CX} cy={CX} r={CR} fill="none" stroke={mixHex(C.primary, C.raised, 0.12)} strokeWidth={16} />
              {Array.from({ length: 12 }, (_, i) => {
                const a = -90 + i * 30;
                const p0 = polar(CX, CX, CR + 14, a);
                const p1 = polar(CX, CX, CR + (i % 3 === 0 ? 24 : 19), a);
                return <line key={i} x1={p0.x} y1={p0.y} x2={p1.x} y2={p1.y} stroke={C.ink3} strokeOpacity={i % 3 === 0 ? 0.8 : 0.45} strokeWidth={1.4} />;
              })}
              {clockMin > 0.2 && <path d={arcPath(CX, CX, CR, ang(0), ang(clockMin))} fill="none" stroke={C.accent} strokeWidth={16} strokeLinecap="round" />}
              {steps.map((s, i) => {
                const p = polar(CX, CX, CR, ang(s.delta));
                const lit = clockMin >= s.delta - 0.01 && (i === 0 || clockP > 0);
                return <circle key={i} cx={p.x} cy={p.y} r={i === 3 ? 10 : 7} fill={lit ? (i === 3 ? C.accent : '#FFFFFF') : '#FFFFFF'} stroke={lit ? C.accentText : C.border2} strokeWidth={2.5} />;
              })}
            </svg>
            <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', opacity: prog(f, 88, 10) }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                <Num size={62} weight={600}>
                  {Math.round(clockMin)}
                </Num>
                <span style={{ fontSize: 21, color: C.ink2 }}>{t.minUnit}</span>
              </div>
              <div style={{ fontSize: 17, color: C.ink3, textAlign: 'center', maxWidth: 170, lineHeight: 1.3 }}>{t.toDecision}</div>
            </div>
          </div>
          <div style={{ position: 'absolute', top: 196, insetInlineStart: 356, insetInlineEnd: 30 }}>
            <div style={{ fontSize: 18, color: C.ink3, marginBottom: 8 }}>{t.clock}</div>
            {steps.map((s, i) => {
              const isDecision = i === steps.length - 1;
              const lit = isDecision ? accepted : 1;
              return (
                <div key={s.label} style={{ display: 'flex', alignItems: 'center', gap: 12, height: 70, borderBottom: i < 3 ? `1px solid ${C.border}` : 'none', ...enter(f, 16 + i * STAGGER * 3, 20, 8) }}>
                  <Num size={21} color={isDecision && lit > 0 ? C.ink : C.ink2} mono>
                    {s.time}
                  </Num>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 20, color: isDecision ? (lit > 0 ? C.ink : C.ink3) : C.ink, fontWeight: isDecision ? 600 : 500, whiteSpace: 'nowrap' }}>{s.label}</div>
                    {i > 0 && <div style={{ fontSize: 17, color: C.ink3, opacity: isDecision ? lit : 1 }}>{t.min(s.delta)}</div>}
                  </div>
                </div>
              );
            })}
          </div>
          <div style={{ position: 'absolute', top: 506, insetInlineStart: 30, width: 300, textAlign: 'center', fontSize: 15, color: C.ink3 }}>{t.scale}</div>
          <div style={{ position: 'absolute', bottom: 30, insetInlineStart: 40, insetInlineEnd: 40, ...enter(f, 30, 20, 8) }}>
            <div style={{ fontSize: 18, color: C.ink3, marginBottom: 10 }}>{t.stakeholders}</div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              {S.stakeholders.map((st) => (
                <Pill key={st.id} color={C.border2} fill={false} size={18}>
                  {ar ? st.ar : st.en}
                </Pill>
              ))}
            </div>
          </div>
        </Metal>
      </Layer>
    </Shot>
  );
};
