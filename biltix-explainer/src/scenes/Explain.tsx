import React from 'react';
import { useCurrentFrame } from 'remotion';
import { Code, Eyebrow, Num, RatingBadge, Tag } from '../components/Chrome';
import { Metal } from '../components/Metal';
import { mixHex, RingGauge } from '../components/Ring';
import { Section } from '../components/Section';
import { Layer, Shot } from '../components/Stage';
import { COPY } from '../copy';
import { DATA } from '../data';
import type { SceneProps } from '../Explainer';
import { pull } from '../lib/camera';
import { countUp, enter, prog } from '../lib/anim';
import { arcPath, polar } from '../lib/geom';
import { SHOTS } from '../shots';
import { C, EASE, RATING_TONE, RING_TONE, STAGGER, TONE } from '../theme';

const S = DATA.story;
const F = S.facts;
/** Rack focus: the risk card is sharp first, then the focus pulls to the evidence (max 3 px blur). */
const RACK = { from: 60, to: 82, max: 3 };

/** 270° displacement gauge: 0 → scaleMax mm, limit tick, value arc; exact angle = 270° × mm / scaleMax. */
const RateGauge: React.FC<{ size: number; value: number; limit: number; scaleMax: number; p: number; rtl: boolean; tone: string; unit: string; ratio: string; limitLabel: string }> = ({
  size,
  value,
  limit,
  scaleMax,
  p,
  rtl,
  tone,
  unit,
  ratio,
  limitLabel,
}) => {
  const c = size / 2;
  const r = size * 0.38;
  const a0 = 135; // start (7:30), sweep 270° clockwise; mirrored in Arabic
  const ang = (mm: number) => (rtl ? 180 - (a0 + (270 * mm) / scaleMax) : a0 + (270 * mm) / scaleMax);
  const ticks = Array.from({ length: scaleMax / 4 + 1 }, (_, i) => i * 4);
  const v = value * p;
  const lim0 = polar(c, c, r - 22, ang(limit));
  const lim1 = polar(c, c, r + 22, ang(limit));
  const limL = polar(c, c, r + 44, ang(limit));
  return (
    <div style={{ position: 'relative', width: size, height: size }}>
      <svg width={size} height={size} style={{ position: 'absolute', inset: 0, overflow: 'visible' }}>
        <path d={arcPath(c, c, r, ang(0), ang(scaleMax))} fill="none" stroke={mixHex(tone, C.raised, 0.12)} strokeWidth={18} strokeLinecap="round" />
        {/* the tolerated band (0 → limit) */}
        <path d={arcPath(c, c, r + 16, ang(0), ang(limit))} fill="none" stroke={C.green} strokeOpacity={0.55} strokeWidth={4} />
        {v > 0.05 && <path d={arcPath(c, c, r, ang(0), ang(v))} fill="none" stroke={tone} strokeWidth={18} strokeLinecap="round" style={{ filter: `drop-shadow(0 0 6px ${tone}66)` }} />}
        <line x1={lim0.x} y1={lim0.y} x2={lim1.x} y2={lim1.y} stroke={C.ink} strokeWidth={2.5} />
        {ticks.map((tv) => {
          const q0 = polar(c, c, r - 14, ang(tv));
          const q1 = polar(c, c, r - 24, ang(tv));
          const ql = polar(c, c, r - 40, ang(tv));
          return (
            <g key={tv}>
              <line x1={q0.x} y1={q0.y} x2={q1.x} y2={q1.y} stroke={C.ink3} strokeWidth={1.2} />
              <text x={ql.x} y={ql.y + 5} fill={C.ink3} fontFamily='"IBM Plex Mono", monospace' fontSize={14} textAnchor="middle">
                {tv}
              </text>
            </g>
          );
        })}
      </svg>
      <div style={{ position: 'absolute', left: limL.x, top: limL.y - 12, transform: 'translate(-50%, 0)', fontSize: 15, color: C.ink, whiteSpace: 'nowrap', fontWeight: 600 }}>{limitLabel}</div>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        <Num size={64} weight={600}>
          {Math.round(v)}
        </Num>
        <div style={{ fontSize: 17, color: C.ink3, marginTop: -4 }}>{unit}</div>
        <div style={{ marginTop: 6, opacity: p > 0.98 ? 1 : 0 }}>
          <Num size={22} weight={600} color={C.redText}>
            {ratio}
          </Num>
        </div>
      </div>
    </div>
  );
};

export const Explain: React.FC<SceneProps> = ({ lang, frames, cutOut, matchIn, matchOut }) => {
  const f = useCurrentFrame();
  const rtl = lang === 'ar';
  const ar = lang === 'ar';
  const t = COPY[lang].explain;
  const rl = COPY[lang].rating;
  const tone = RATING_TONE[S.rating];
  const score = countUp(f, 6, 40, S.score);
  const scaleMax = Math.ceil((F.weeklyMm + 1) / 4) * 4;
  const rack = pull(f, RACK.from, RACK.to);
  const blurA = RACK.max * rack;
  const blurB = RACK.max * (1 - rack) * prog(f, 18, 14);

  return (
    <Shot frames={frames} rtl={rtl} matchIn={matchIn} matchOut={matchOut} shots={SHOTS.explain} cutOut={cutOut}>
      {/* ── layer A: the risk and its drivers ── */}
      <Layer blur={blurA} opacity={1 - 0.12 * rack}>
        <Metal x={96} y={150} w={920} h={432} rtl={rtl} comet={{ phase: 0.05, speed: 13, len: 160, opacity: 1 - rack }} style={{ padding: '28px 36px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, ...enter(f, 0) }}>
            <span style={{ padding: '5px 14px', borderRadius: 10, border: `1px solid ${C.border}`, background: C.raised }}>
              <Code size={24}>{S.code}</Code>
            </span>
            <RatingBadge color={TONE[tone]} label={rl[S.rating]} size={20} />
            <span style={{ fontSize: 20, color: C.ink2 }}>{ar ? S.categoryAr : S.categoryEn}</span>
            <span style={{ color: C.ink3 }}>·</span>
            <Code size={20} color={C.ink2}>
              {S.site.code}
            </Code>
          </div>
          <div style={{ fontSize: 36, fontWeight: 600, marginTop: 16, lineHeight: 1.25, maxWidth: 660, ...enter(f, 2) }}>{ar ? S.titleShortAr : S.titleShortEn}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginTop: 10, fontSize: 19, color: C.ink3, ...enter(f, 4) }}>
            <span>
              {ar ? S.pipeline.nameAr : S.pipeline.nameEn}{' '}
              <Code size={16} color={C.ink3}>
                {S.pipeline.version}
              </Code>
            </span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              {t.confidence}{' '}
              <Num size={18} color={C.ink2}>
                {S.confidencePct}%
              </Num>
              <Tag size={14}>{t.illustrative}</Tag>
            </span>
          </div>
          {S.likelihood != null && S.impact != null && (
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginTop: 12, fontSize: 19, color: C.ink2, ...enter(f, 8, 20, 8) }}>
              <span>{t.likelihood}</span>
              <Num size={23} weight={600}>
                {S.likelihood}
              </Num>
              <span style={{ color: C.ink3 }}>×</span>
              <span>{t.impact}</span>
              <Num size={23} weight={600}>
                {S.impact}
              </Num>
              <span style={{ color: C.ink3 }}>×</span>
              <Num size={23} weight={600}>
                4
              </Num>
              <span style={{ color: C.ink3 }}>=</span>
              <Num size={23} weight={700} color={C.redText}>
                {S.score}
              </Num>
            </div>
          )}
          <div style={{ marginTop: 12, fontSize: ar ? 22 : 22.5, lineHeight: 1.55, color: C.ink2, maxWidth: 845, ...enter(f, 12, 22, 10) }}>{ar ? S.explanationAr : S.explanationEn}</div>
          <div style={{ position: 'absolute', insetInlineStart: 36, insetInlineEnd: 36, bottom: 22, display: 'flex', alignItems: 'baseline', gap: 10, paddingTop: 12, borderTop: `1px solid ${C.border}`, ...enter(f, 18, 20, 8) }}>
            <span style={{ fontSize: 17, color: C.ink3 }}>{t.detected}</span>
            <Num size={19} color={C.ink} mono>{`${S.detectedAt.slice(0, 10)} ${S.detectedAt.slice(11, 16)}`}</Num>
          </div>
          {/* score dial */}
          <div style={{ position: 'absolute', top: 18, insetInlineEnd: 26 }}>
            <RingGauge size={150} r={58} stroke={12} value={score / 100} tone={RING_TONE[tone]} rtl={rtl} id="story-score">
              <Num size={42} weight={600}>
                {Math.round(score)}
              </Num>
            </RingGauge>
          </div>
        </Metal>

        {/* why: model drivers — ring = share of the pipeline's total model weight (weights sum to 1) */}
        <Metal x={96} y={606} w={920} h={294} rtl={rtl} style={{ padding: '22px 36px', ...enter(f, 22, 22, 14) }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ fontSize: 25, fontWeight: 600 }}>{t.why}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 17, color: C.ink3 }}>
              {t.modelWeight}
              <Tag size={14}>{t.illustrativeWeights}</Tag>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', columnGap: 18, marginTop: 14 }}>
            {S.drivers.map((d, i) => {
              const p = prog(f, 30 + i * STAGGER * 3, 36, EASE.expo);
              return (
                <div key={d.key} style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', ...enter(f, 26 + i * STAGGER * 3, 18, 8) }}>
                  <RingGauge size={96} r={34} stroke={8} value={d.weight * p} tone={C.primary} rtl={rtl} glow={0.5} id={`drv-${d.key}`}>
                    <Num size={19} weight={600} mono>
                      {d.weight.toFixed(2)}
                    </Num>
                  </RingGauge>
                  <div style={{ fontSize: 17, color: C.ink3, marginTop: 6, lineHeight: 1.3, minHeight: 44 }}>{ar ? d.labelAr : d.labelEn}</div>
                  <div style={{ fontSize: 19, fontWeight: 600, color: C.ink, marginTop: 2, lineHeight: 1.3 }}>{ar ? d.valueAr : d.valueEn}</div>
                </div>
              );
            })}
          </div>
        </Metal>
      </Layer>

      {/* ── layer B: the evidence, a little deeper in the scene ── */}
      <Layer depth={-40} blur={blurB}>
        <Metal x={1040} y={150} w={784} h={750} rtl={rtl} comet={{ phase: 0.55, speed: 13, len: 160, opacity: rack }} style={{ padding: '28px 36px', ...enter(f, 14, 24, 16) }}>
          <Eyebrow>{t.evidence}</Eyebrow>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 6, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 27, fontWeight: 600 }}>{ar ? S.evidence.sourceAr : S.evidence.sourceEn}</span>
            <span style={{ padding: '4px 12px', borderRadius: 8, border: `1px solid ${C.border}`, background: C.raised }}>
              <Code size={18}>{F.sensorRef}</Code>
            </span>
            <span style={{ padding: '4px 12px', borderRadius: 8, border: `1px solid ${C.border}`, background: C.raised }}>
              <Code size={15} color={C.ink2}>
                {F.imageRef}
              </Code>
            </span>
          </div>
          <div style={{ position: 'absolute', top: 120, insetInlineStart: 20 }}>
            <RateGauge
              size={330}
              value={F.weeklyMm}
              limit={F.limitMm}
              scaleMax={scaleMax}
              p={prog(f, 40, 40, EASE.expo)}
              rtl={rtl}
              tone={TONE[tone]}
              unit={t.mmWeek}
              ratio={`${F.rateRatio}×`}
              limitLabel={`${t.limit} ${F.limitMm}`}
            />
          </div>
          <div style={{ position: 'absolute', top: 160, insetInlineStart: 380, insetInlineEnd: 36 }}>
            <div style={{ fontSize: 20, color: C.ink2, ...enter(f, 44, 18, 8) }}>{t.weeklyRate}</div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginTop: 4, ...enter(f, 46, 18, 8) }}>
              <Num size={40} weight={600} color={C.redText}>
                {`${F.rateRatio}×`}
              </Num>
              <span style={{ fontSize: 19, color: C.ink2 }}>{t.ofLimit}</span>
            </div>
            <div style={{ height: 1, background: C.border, margin: '22px 0' }} />
            <div style={{ fontSize: 20, color: C.ink2, ...enter(f, 52, 18, 8) }}>{t.cumulative}</div>
            <div style={{ marginTop: 4, ...enter(f, 54, 18, 8) }}>
              <Num size={40} weight={600}>
                {F.cumulativeMm} {t.mm}
              </Num>
            </div>
          </div>
          <div style={{ position: 'absolute', insetInlineStart: 36, bottom: 22 }}>
            <div style={{ fontSize: 15, color: C.ink3, marginBottom: 2 }}>{t.schematic}</div>
            <Section
              w={712}
              h={236}
              rtl={rtl}
              crestX={290}
              toeX={420}
              pxPerM={12}
              crackM={F.crackDistanceM}
              sensorX={222}
              sensorLabel={F.sensorRef}
              workers={F.workers}
              excavators={F.excavators}
              crewX={438}
              crewCols={11}
              draw={prog(f, 30, 40, EASE.inOut)}
              annot={prog(f, 70, 22, EASE.out)}
              labels={{
                crest: t.crest,
                pit: t.pit,
                crack: `${t.crack} · ${F.crackDistanceM} ${t.m}`,
                movement: t.movement,
                crew: COPY[lang].sitecam.crew(F.workers, F.excavators),
              }}
            />
          </div>
        </Metal>
      </Layer>
    </Shot>
  );
};
