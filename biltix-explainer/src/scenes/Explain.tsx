import React from 'react';
import { useCurrentFrame } from 'remotion';
import { Card, Code, Eyebrow, Num, RatingBadge } from '../components/Chrome';
import { SceneFrame } from '../components/SceneFrame';
import { Section } from '../components/Section';
import { COPY } from '../copy';
import { DATA } from '../data';
import type { SceneProps } from '../Explainer';
import { countUp, enter, prog } from '../lib/anim';
import { arcPath } from '../lib/geom';
import { C, EASE, RATING_TONE, STAGGER, TONE } from '../theme';

const S = DATA.story;
const F = S.facts;

export const Explain: React.FC<SceneProps> = ({ lang, frames }) => {
  const f = useCurrentFrame();
  const rtl = lang === 'ar';
  const ar = lang === 'ar';
  const t = COPY[lang].explain;
  const rl = COPY[lang].rating;
  const tone = TONE[RATING_TONE[S.rating]];
  const score = countUp(f, 8, 40, S.score);

  // weekly displacement vs limit — exact linear scale
  const scaleMax = Math.ceil((F.weeklyMm + 1) / 4) * 4;
  const chartW = 732;
  const xs = (mm: number) => (mm / scaleMax) * chartW;
  const barP = prog(f, 60, 34, EASE.expo);
  const maxW = Math.max(...S.drivers.map((d) => d.weight));

  return (
    <SceneFrame
      frames={frames}
      rtl={rtl}
      cam={[
        { f: 0, s: 1.0, x: 0, y: 0 },
        { f: 40, s: 1.02, x: 26, y: 4 },
        { f: 92, s: 1.022, x: 18, y: 2 },
        { f: frames + 15, s: 1.045, x: -30, y: 4 },
      ]}
    >
      {/* ── risk card ── */}
      <Card style={{ top: 236, insetInlineStart: 96, width: 900, height: 404, padding: '28px 36px' }} glow="rgba(208,59,59,0.25)">
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, ...enter(f, 0) }}>
          <span style={{ padding: '6px 14px', borderRadius: 10, border: `1px solid ${C.border}`, background: C.bg }}>
            <Code size={24}>{S.code}</Code>
          </span>
          <RatingBadge color={tone} label={rl[S.rating]} size={20} />
          <span style={{ fontSize: 20, color: C.ink2 }}>{ar ? S.categoryAr : S.categoryEn}</span>
          <span style={{ color: C.ink3 }}>·</span>
          <Code size={20} color={C.ink2}>
            {S.site.code}
          </Code>
        </div>
        <div style={{ fontSize: 38, fontWeight: 600, marginTop: 18, lineHeight: 1.25, maxWidth: 700, ...enter(f, 2) }}>{ar ? S.titleShortAr : S.titleShortEn}</div>
        <div style={{ display: 'flex', gap: 22, marginTop: 10, fontSize: 19, color: C.ink3, ...enter(f, 4) }}>
          <span>
            {ar ? S.pipeline.nameAr : S.pipeline.nameEn}{' '}
            <Code size={17} color={C.ink3}>
              {S.pipeline.version}
            </Code>
          </span>
          <span>
            {t.confidence}{' '}
            <Num size={19} color={C.ink2}>
              {S.confidencePct}%
            </Num>
          </span>
        </div>
        {S.likelihood != null && S.impact != null && (
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginTop: 14, fontSize: 19, color: C.ink2, ...enter(f, 6, 20, 8) }}>
            <span>{ar ? 'الاحتمالية' : 'Likelihood'}</span>
            <Num size={22} weight={600}>{S.likelihood}</Num>
            <span style={{ color: C.ink3 }}>×</span>
            <span>{ar ? 'الأثر' : 'impact'}</span>
            <Num size={22} weight={600}>{S.impact}</Num>
            <span style={{ color: C.ink3 }}>×</span>
            <Num size={22} weight={600}>4</Num>
            <span style={{ color: C.ink3 }}>=</span>
            <Num size={22} weight={600} color={tone}>{S.score}</Num>
          </div>
        )}
        <div style={{ marginTop: 14, fontSize: 20.5, lineHeight: 1.6, color: C.ink2, maxWidth: 828, ...enter(f, 10, 22, 10) }}>
          {ar ? S.explanationAr : S.explanationEn}
        </div>
        {/* detection facts */}
        <div style={{ position: 'absolute', insetInlineStart: 36, insetInlineEnd: 36, bottom: 26, display: 'flex', gap: 44, paddingTop: 16, borderTop: `1px solid ${C.border}`, ...enter(f, 16, 20, 8) }}>
          {[
            [t.detected, <Num key="d" size={20} color={C.ink} mono>{`${S.detectedAt.slice(0, 10)} ${S.detectedAt.slice(11, 16)}`}</Num>],
            [t.precision, <Num key="p" size={20} color={C.ink} mono>{S.pipeline.precision.toFixed(2)}</Num>],
            [t.recall, <Num key="r" size={20} color={C.ink} mono>{S.pipeline.recall.toFixed(2)}</Num>],
          ].map(([k, v], i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
              <span style={{ fontSize: 17, color: C.ink3 }}>{k}</span>
              {v}
            </div>
          ))}
        </div>
        {/* score ring */}
        <div style={{ position: 'absolute', top: 24, insetInlineEnd: 30, width: 120, height: 120 }}>
          <svg width={120} height={120} style={{ transform: rtl ? 'scaleX(-1)' : undefined }}>
            <circle cx={60} cy={60} r={50} fill="none" stroke={C.raised} strokeWidth={9} />
            <path d={arcPath(60, 60, 50, -90, -90 + 3.6 * score * 0.9999)} fill="none" stroke={tone} strokeWidth={9} strokeLinecap="round" />
          </svg>
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Num size={40} weight={600}>
              {Math.round(score)}
            </Num>
          </div>
        </div>
      </Card>

      {/* ── why: model drivers (site-ai feature importances) ── */}
      <Card style={{ top: 660, insetInlineStart: 96, width: 900, height: 240, padding: '22px 36px', ...enter(f, 20, 22, 14) }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <div style={{ fontSize: 24, fontWeight: 600 }}>{t.why}</div>
          <div style={{ fontSize: 17, color: C.ink3 }}>{t.modelWeight}</div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', columnGap: 40, rowGap: 14, marginTop: 14 }}>
          {S.drivers.map((d, i) => {
            const p = prog(f, 30 + i * STAGGER, 36, EASE.expo);
            return (
              <div key={d.key} style={enter(f, 24 + i * STAGGER, 18, 8)}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10 }}>
                  <span style={{ fontSize: 18, color: C.ink3, whiteSpace: 'nowrap' }}>{ar ? d.labelAr : d.labelEn}</span>
                  <Num size={17} color={C.ink3} mono>
                    {d.weight.toFixed(2)}
                  </Num>
                </div>
                <div style={{ fontSize: 21, fontWeight: 500, color: C.ink, marginTop: 2, whiteSpace: 'nowrap' }}>{ar ? d.valueAr : d.valueEn}</div>
                <div style={{ marginTop: 7, height: 5, borderRadius: 3, background: C.raised }}>
                  <div style={{ width: `${(d.weight / maxW) * 100 * p}%`, height: '100%', borderRadius: 3, background: `linear-gradient(${rtl ? 270 : 90}deg, ${C.primary}, ${C.accent})` }} />
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      {/* ── evidence ── */}
      <Card style={{ top: 236, insetInlineStart: 1020, width: 804, height: 664, padding: '28px 36px', ...enter(f, 14, 24, 16) }}>
        <Eyebrow>{t.evidence}</Eyebrow>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 6 }}>
          <span style={{ fontSize: 28, fontWeight: 600 }}>{ar ? S.evidence.sourceAr : S.evidence.sourceEn}</span>
          <span style={{ padding: '4px 12px', borderRadius: 8, border: `1px solid ${C.border}`, background: C.bg }}>
            <Code size={19}>{F.sensorRef}</Code>
          </span>
          <span style={{ padding: '4px 12px', borderRadius: 8, border: `1px solid ${C.border}`, background: C.bg }}>
            <Code size={16} color={C.ink2}>
              {F.imageRef}
            </Code>
          </span>
        </div>

        {/* rate vs limit */}
        <div style={{ marginTop: 26 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <span style={{ fontSize: 20, color: C.ink2 }}>{t.weeklyRate}</span>
            <span style={{ display: 'flex', alignItems: 'baseline', gap: 8, opacity: prog(f, 84, 16) }}>
              <Num size={30} weight={600}>
                {F.rateRatio}×
              </Num>
              <span style={{ fontSize: 18, color: C.ink3 }}>
                {t.limit}
              </span>
            </span>
          </div>
          <div style={{ position: 'relative', width: chartW, height: 92, marginTop: 10 }}>
            <div style={{ position: 'absolute', top: 18, insetInlineStart: 0, width: chartW, height: 28, borderRadius: 6, background: C.raised }} />
            <div
              style={{
                position: 'absolute',
                top: 18,
                insetInlineStart: 0,
                width: xs(F.weeklyMm) * barP,
                height: 28,
                borderRadius: 6,
                background: `linear-gradient(${rtl ? 270 : 90}deg, ${tone}aa, ${tone})`,
                boxShadow: `0 0 18px ${tone}55`,
              }}
            />
            {/* limit marker */}
            <div style={{ position: 'absolute', top: 6, insetInlineStart: xs(F.limitMm) - 1, width: 2, height: 52, background: C.ink, opacity: 0.85 }} />
            <div style={{ position: 'absolute', top: -20, insetInlineStart: xs(F.limitMm) + 8, fontSize: 16, color: C.ink, whiteSpace: 'nowrap' }}>
              {t.limit}{' '}
              <Num size={16}>
                {F.limitMm} {t.mm}
              </Num>
            </div>
            {/* value label, inside the bar end */}
            <div
              style={{
                position: 'absolute',
                top: 18,
                insetInlineEnd: chartW - xs(F.weeklyMm) * barP + 14,
                height: 28,
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                opacity: prog(f, 76, 14),
                whiteSpace: 'nowrap',
              }}
            >
              <Num size={22} weight={600} color="#FFFFFF">
                {F.weeklyMm}
              </Num>
              <span style={{ fontSize: 16, color: '#FFE9E9' }}>{t.mmWeek}</span>
            </div>
            {/* axis */}
            {Array.from({ length: scaleMax / 4 + 1 }, (_, i) => i * 4).map((v) => (
              <div key={v} style={{ position: 'absolute', top: 54, insetInlineStart: xs(v) - 20, width: 40, textAlign: 'center' }}>
                <div style={{ width: 1, height: 6, background: C.ink3, margin: '0 auto' }} />
                <Num size={14} color={C.ink3} mono>
                  {v}
                </Num>
              </div>
            ))}
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginTop: 4, ...enter(f, 70, 18, 8) }}>
          <span style={{ fontSize: 20, color: C.ink2 }}>{t.cumulative}</span>
          <Num size={28} weight={600}>
            {F.cumulativeMm} {t.mm}
          </Num>
        </div>

        <div style={{ position: 'absolute', insetInlineStart: 36, bottom: 26 }}>
          <div style={{ fontSize: 15, color: C.ink3, marginBottom: 2 }}>{t.schematic}</div>
          <Section
            w={732}
            h={250}
            rtl={rtl}
            crestX={300}
            toeX={430}
            pxPerM={12}
            crackM={F.crackDistanceM}
            sensorX={232}
            sensorLabel={F.sensorRef}
            workers={F.workers}
            excavators={F.excavators}
            crewX={448}
            crewCols={11}
            draw={prog(f, 26, 40, EASE.inOut)}
            annot={prog(f, 56, 22, EASE.out)}
            labels={{
              crest: t.crest,
              pit: t.pit,
              crack: `${t.crack} · ${F.crackDistanceM} ${t.m}`,
              movement: t.movement,
              crew: ar ? `${F.workers} عاملاً · ${F.excavators} حفارات` : `${F.workers} workers · ${F.excavators} excavators`,
            }}
          />
        </div>
      </Card>
    </SceneFrame>
  );
};
