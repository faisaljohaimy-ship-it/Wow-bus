import React from 'react';
import { useCurrentFrame } from 'remotion';
import { Check, DirArrow, Person, Pill, ScoreChip } from '../components/Bits';
import { Card, Code, Eyebrow, Num } from '../components/Chrome';
import { SceneFrame } from '../components/SceneFrame';
import { COPY } from '../copy';
import { DATA } from '../data';
import type { SceneProps } from '../Explainer';
import { enter, prog } from '../lib/anim';
import { C, EASE, STAGGER } from '../theme';

const S = DATA.story;
const EFFORT_EN: Record<string, string> = { 'عالٍ': 'High', 'متوسط': 'Medium', 'منخفض': 'Low' };
const ratingOf = (score: number) => (score >= 70 ? 'red' : score >= 40 ? 'yellow' : 'green'); // B2 thresholds
const PRESS = 74; // frame the reviewer accepts

export const Approve: React.FC<SceneProps> = ({ lang, frames }) => {
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
    { time: at('detected')?.time, label: t.detected, delta: null as number | null },
    { time: at('alert')?.time, label: t.escalated, delta: since('alert') },
    { time: at('ack')?.time, label: t.acknowledged, delta: since('ack') },
    { time: at('accept')?.time, label: t.decided, delta: since('accept') },
  ];

  return (
    <SceneFrame
      frames={frames}
      rtl={rtl}
      cam={[
        { f: 0, s: 1.0, x: 0, y: 0 },
        { f: 64, s: 1.03, x: 30, y: -14 },
        { f: frames + 15, s: 1.045, x: -46, y: 0 },
      ]}
    >
      {/* ── recommendation ── */}
      <Card style={{ top: 236, insetInlineStart: 96, width: 1000, height: 664, padding: '32px 40px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, ...enter(f, 0) }}>
          <Eyebrow>{t.recTitle}</Eyebrow>
          <span style={{ color: C.ink3 }}>·</span>
          <Code size={20}>{S.code}</Code>
        </div>
        <div style={{ marginTop: 18, fontSize: ar ? 31 : 33, lineHeight: 1.5, fontWeight: 500, color: C.ink, maxWidth: 920, ...enter(f, 4, 24, 12) }}>
          {ar ? S.recommendation.actionAr : S.recommendation.actionEn}
        </div>
        <div style={{ height: 1, background: C.border, margin: '30px 0 24px' }} />
        <div style={{ display: 'flex', gap: 56, alignItems: 'center', ...enter(f, 14, 20, 10) }}>
          <div>
            <div style={{ fontSize: 19, color: C.ink3, marginBottom: 10 }}>{t.impact}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <ScoreChip score={S.score} rating={S.rating} label={rl[S.rating]} size={26} />
              <DirArrow rtl={rtl} size={30} />
              <ScoreChip score={S.recommendation.targetScore} rating={ratingOf(S.recommendation.targetScore)} label={rl[ratingOf(S.recommendation.targetScore)]} size={26} dashed />
            </div>
          </div>
          <div>
            <div style={{ fontSize: 19, color: C.ink3, marginBottom: 10 }}>{t.effort}</div>
            <div style={{ fontSize: 26, fontWeight: 600 }}>{ar ? S.recommendation.effortAr : EFFORT_EN[S.recommendation.effortAr] || S.recommendation.effortAr}</div>
          </div>
        </div>

        {/* decision buttons */}
        <div style={{ position: 'absolute', bottom: 36, insetInlineStart: 40, display: 'flex', gap: 16, alignItems: 'center', ...enter(f, 22, 20, 10) }}>
          <div style={{ position: 'relative' }}>
            <div
              style={{
                position: 'absolute',
                inset: -10 * ring,
                borderRadius: 16 + 10 * ring,
                border: `2px solid ${C.accent}`,
                opacity: (1 - ring) * (ring > 0 ? 0.9 : 0),
              }}
            />
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
                boxShadow: `0 10px 30px rgba(47,111,237,${0.35 + 0.2 * accepted})`,
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
                border: i === 0 ? `1px solid ${C.border}` : '1px solid transparent',
                opacity: 1 - 0.6 * accepted,
              }}
            >
              {label}
            </div>
          ))}
        </div>
      </Card>

      {/* ── reviewer ── */}
      <Card style={{ top: 236, insetInlineStart: 1120, width: 704, height: 664, padding: '32px 40px', ...enter(f, 8, 24, 16) }}>
        <Eyebrow>{t.reviewer}</Eyebrow>
        <div style={{ display: 'flex', alignItems: 'center', gap: 22, marginTop: 16 }}>
          <div
            style={{
              width: 92,
              height: 92,
              borderRadius: 999,
              background: C.bg,
              border: `1.5px solid ${C.border}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: accepted > 0 ? `0 0 0 ${3 * accepted}px rgba(25,198,230,0.35)` : 'none',
            }}
          >
            <Person size={56} />
          </div>
          <div>
            <div style={{ fontSize: 31, fontWeight: 600 }}>{ar ? S.reviewer.nameAr : S.reviewer.nameEn}</div>
            <div style={{ fontSize: 20, color: C.ink2, marginTop: 4 }}>
              {ar ? S.reviewer.roleAr : S.reviewer.roleEn} · <Code size={18} color={C.ink2}>{S.site.code}</Code>
            </div>
          </div>
        </div>
        <div style={{ marginTop: 22 }}>
          <Pill color={C.primary} size={19}>
            <Person size={20} color={C.ink} />
            {t.human}
          </Pill>
        </div>
        {/* decision timing — real timestamps from the risk's timeline */}
        <div style={{ position: 'relative', marginTop: 34 }}>
          <div style={{ position: 'absolute', top: 14, bottom: 14, insetInlineStart: 113, width: 2, background: C.border }} />
          {steps.map((s, i) => {
            const isDecision = i === steps.length - 1;
            const lit = isDecision ? accepted : 1;
            return (
              <div key={s.label} style={{ display: 'flex', alignItems: 'center', height: 64, ...enter(f, 16 + i * STAGGER * 3, 20, 8) }}>
                <div style={{ width: 96 }}>
                  <Num size={22} color={isDecision && lit > 0 ? C.ink : C.ink2} mono>
                    {s.time}
                  </Num>
                </div>
                <div style={{ width: 36, display: 'flex', justifyContent: 'center' }}>
                  <span
                    style={{
                      width: 14,
                      height: 14,
                      borderRadius: 999,
                      background: isDecision ? (lit > 0 ? C.accent : C.bg) : C.primary,
                      border: `2px solid ${isDecision ? C.accent : C.primary}`,
                      boxShadow: isDecision && lit > 0 ? `0 0 14px ${C.accent}` : 'none',
                    }}
                  />
                </div>
                <div style={{ fontSize: 22, color: isDecision ? (lit > 0 ? C.ink : C.ink3) : C.ink2, marginInlineStart: 12, fontWeight: isDecision ? 600 : 400 }}>{s.label}</div>
                {s.delta != null && (
                  <div style={{ marginInlineStart: 12, fontSize: 18, color: C.ink3, opacity: isDecision ? lit : 1 }}>{t.min(s.delta)}</div>
                )}
              </div>
            );
          })}
        </div>
      </Card>
    </SceneFrame>
  );
};
