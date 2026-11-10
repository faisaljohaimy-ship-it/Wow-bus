import React from 'react';
import { useCurrentFrame } from 'remotion';
import { Card, Eyebrow, Num, RatingBadge } from '../components/Chrome';
import { Gauge } from '../components/Gauge';
import { SceneFrame } from '../components/SceneFrame';
import { COPY } from '../copy';
import { DATA } from '../data';
import type { SceneProps } from '../Explainer';
import { countUp, enter, prog } from '../lib/anim';
import { C, EASE, RATING_TONE, STAGGER, TONE, type Tone } from '../theme';

const CONS = DATA.consolidated;
const HEAT = DATA.heatmap;
const THRESH = { yellow: 40, red: 70 }; // platform-selectors RATING_THRESHOLDS (B2)

export const Analyze: React.FC<SceneProps> = ({ lang, frames }) => {
  const f = useCurrentFrame();
  const rtl = lang === 'ar';
  const t = COPY[lang].analyze;
  const rl = COPY[lang].rating;
  const consColor = TONE[RATING_TONE[CONS.rating]];
  const gv = countUp(f, 14, 56, CONS.score);
  const gaugeIn = prog(f, 4, 26, EASE.out);

  /* heatmap geometry (card-relative, logical inline axis) */
  const cell = 76;
  const gap = 6;
  const gx = 206;
  const gy = 150;
  const colX = (l: number) => gx + (l - 1) * (cell + gap);
  const rowY = (s: number) => gy + (5 - s) * (cell + gap); // severity 5 on top
  const highlight = prog(f, 112, 18, EASE.out); // focus hand-off to the site category

  const dist = DATA.ratingDistribution;
  const distTotal = dist.reduce((a, d) => a + d.value, 0);
  const distW = 796;

  return (
    <SceneFrame
      frames={frames}
      rtl={rtl}
      cam={[
        { f: 0, s: 1.0, x: 0, y: 0 },
        { f: 70, s: 1.012, x: 10, y: 0 },
        { f: frames + 15, s: 1.05, x: -70, y: 8 },
      ]}
    >
      {/* ── consolidated score + categories ── */}
      <Card style={{ top: 236, insetInlineStart: 96, width: 868, height: 664, padding: '30px 36px' }}>
        <div style={enter(f, 0)}>
          <Eyebrow>{t.eyebrow}</Eyebrow>
          <div style={{ fontSize: 34, fontWeight: 600, marginTop: 4 }}>{t.gaugeTitle}</div>
          <div style={{ fontSize: 20, color: C.ink3, marginTop: 4 }}>{t.gaugeSub(DATA.openAiRisks)}</div>
        </div>
        <div style={{ position: 'absolute', top: 138, insetInlineStart: 18, width: 400, height: 400, opacity: gaugeIn }}>
          <Gauge value={gv} size={400} rtl={rtl} color={consColor} thresholds={THRESH} />
          <div style={{ position: 'absolute', top: 130, left: 0, right: 0, textAlign: 'center' }}>
            <Num size={104} weight={500}>
              {Math.round(gv)}
            </Num>
          </div>
          <div style={{ position: 'absolute', top: 262, left: 0, right: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, ...enter(f, 40, 18, 8) }}>
            <RatingBadge color={consColor} label={rl[CONS.rating]} size={22} />
            <div style={{ fontSize: 19, color: C.ink2 }}>{lang === 'ar' ? CONS.hintAr : CONS.hintEn}</div>
          </div>
        </div>

        {/* five category scores */}
        <div style={{ position: 'absolute', top: 150, insetInlineStart: 452, width: 380 }}>
          <Eyebrow style={{ marginBottom: 12, ...enter(f, 6) }}>{t.categories}</Eyebrow>
          {DATA.categories.map((c, i) => {
            const tone = TONE[RATING_TONE[c.rating]];
            const p = prog(f, 18 + i * STAGGER, 40, EASE.expo);
            const isSite = c.id === DATA.story.category;
            return (
              <div
                key={c.id}
                style={{
                  position: 'relative',
                  height: 62,
                  marginBottom: 4,
                  padding: '6px 12px',
                  marginInline: -12,
                  borderRadius: 12,
                  border: `1px solid ${isSite ? `rgba(25,198,230,${0.7 * highlight})` : 'transparent'}`,
                  background: isSite ? `rgba(25,198,230,${0.06 * highlight})` : 'transparent',
                  ...enter(f, 10 + i * STAGGER, 20, 10),
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                  <span style={{ fontSize: 21, fontWeight: 500, color: C.ink }}>{lang === 'ar' ? c.labelAr : c.labelEn}</span>
                  <span style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
                    <span style={{ fontSize: 16, color: C.ink3 }}>{rl[c.rating]}</span>
                    <Num size={24}>{Math.round(c.score * p)}</Num>
                  </span>
                </div>
                <div style={{ position: 'relative', marginTop: 8, height: 7, borderRadius: 4, background: C.raised }}>
                  <div style={{ width: `${c.score * p}%`, height: '100%', borderRadius: 4, background: tone }} />
                  {[THRESH.yellow, THRESH.red].map((th) => (
                    <span key={th} style={{ position: 'absolute', top: -3, insetInlineStart: `${th}%`, width: 1, height: 13, background: C.ink3, opacity: 0.6 }} />
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        {/* open AI risks by rating — stacked bar, exact proportions */}
        <div style={{ position: 'absolute', top: 520, insetInlineStart: 36, width: distW, ...enter(f, 30, 20, 10) }}>
          <div style={{ fontSize: 20, color: C.ink2, marginBottom: 12 }}>{t.distribution(distTotal)}</div>
          <div style={{ display: 'flex', height: 16, borderRadius: 6, overflow: 'hidden', background: C.raised }}>
            {dist.map((d, i) => {
              const p = prog(f, 36 + i * STAGGER, 36, EASE.expo);
              return (
                <div
                  key={d.rating}
                  style={{
                    width: `${(d.value / distTotal) * 100 * p}%`,
                    background: TONE[RATING_TONE[d.rating] as Tone],
                    borderInlineEnd: i < dist.length - 1 ? `2px solid ${C.surface}` : 'none',
                  }}
                />
              );
            })}
          </div>
          <div style={{ display: 'flex', marginTop: 10 }}>
            {dist.map((d) => (
              <div key={d.rating} style={{ width: `${(d.value / distTotal) * 100}%`, display: 'flex', alignItems: 'baseline', gap: 8 }}>
                <Num size={22}>{d.value}</Num>
                <span style={{ fontSize: 18, color: C.ink2 }}>{rl[d.rating]}</span>
              </div>
            ))}
          </div>
        </div>
      </Card>

      {/* ── HSE register heatmap: likelihood × severity ── */}
      <Card style={{ top: 236, insetInlineStart: 988, width: 836, height: 664, ...enter(f, 6, 24, 16) }}>
        <div style={{ position: 'absolute', top: 30, insetInlineStart: 36 }}>
          <Eyebrow>{t.heatTitle}</Eyebrow>
          <div style={{ fontSize: 34, fontWeight: 600, marginTop: 4 }}>{t.heatSub(HEAT.total).split(' · ')[0]}</div>
          <div style={{ fontSize: 20, color: C.ink3, marginTop: 4 }}>{t.heatSub(HEAT.total).split(' · ')[1]}</div>
        </div>
        {/* severity axis */}
        <div
          style={{
            position: 'absolute',
            top: gy + (5 * cell + 4 * gap) / 2 - 14,
            insetInlineStart: 6,
            width: 70,
            textAlign: 'center',
            fontSize: 18,
            color: C.ink3,
            transform: `rotate(${rtl ? 90 : -90}deg)`,
          }}
        >
          {t.severity}
        </div>
        {[5, 4, 3, 2, 1].map((s) => (
          <div
            key={s}
            style={{
              position: 'absolute',
              top: rowY(s) + cell / 2 - 13,
              insetInlineStart: 64,
              width: 128,
              textAlign: 'end',
              fontSize: 17,
              color: C.ink2,
              whiteSpace: 'nowrap',
              opacity: prog(f, 14, 16),
            }}
          >
            {t.severityLabels[s - 1]}{' '}
            <Num size={15} color={C.ink3} mono>
              {s}
            </Num>
          </div>
        ))}
        {HEAT.cells.map((c) => {
          const tone = TONE[c.tone as Tone];
          const order = c.likelihood - 1 + (5 - c.severity); // diagonal wave from the low corner
          const p = prog(f, 16 + order * STAGGER * 2 + (c.likelihood - 1) * STAGGER, 20, EASE.out);
          const has = c.count > 0;
          return (
            <div
              key={`${c.likelihood}-${c.severity}`}
              style={{
                position: 'absolute',
                top: rowY(c.severity),
                insetInlineStart: colX(c.likelihood),
                width: cell,
                height: cell,
                borderRadius: 10,
                background: has ? `linear-gradient(180deg, ${tone}70 0%, ${tone}46 100%)` : `${tone}14`,
                border: `1px solid ${has ? `${tone}` : `${tone}30`}`,
                boxShadow: has ? `inset 0 1px 0 rgba(255,255,255,0.10)` : 'none',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                opacity: p,
                transform: `scale(${0.86 + 0.14 * p})`,
                boxSizing: 'border-box',
              }}
            >
              {has && (
                <Num size={30} weight={500} color={C.ink}>
                  {c.count}
                </Num>
              )}
            </div>
          );
        })}
        {[1, 2, 3, 4, 5].map((l) => (
          <div
            key={l}
            style={{
              position: 'absolute',
              top: gy + 5 * cell + 4 * gap + 10,
              insetInlineStart: colX(l) - 6,
              width: cell + 12,
              textAlign: 'center',
              fontSize: 16,
              lineHeight: 1.25,
              color: C.ink2,
              opacity: prog(f, 18, 16),
            }}
          >
            <Num size={15} color={C.ink3} mono>
              {l}
            </Num>
            <div>{t.likelihoodLabels[l - 1]}</div>
          </div>
        ))}
        <div
          style={{
            position: 'absolute',
            top: gy + 5 * cell + 4 * gap + 60,
            insetInlineStart: gx,
            width: 5 * cell + 4 * gap,
            textAlign: 'center',
            fontSize: 18,
            color: C.ink3,
            opacity: prog(f, 18, 16),
          }}
        >
          {t.likelihood} {rtl ? '←' : '→'}
        </div>
        {/* legend: tier = likelihood × severity bands from the app's TIERS table */}
        <div style={{ position: 'absolute', top: gy + 4, insetInlineStart: 656, width: 150 }}>
          {[...HEAT.tiers].reverse().map((tr, i) => {
            const tone = TONE[tr.tone as Tone];
            return (
              <div key={tr.tone} style={{ marginBottom: 20, ...enter(f, 28 + i * STAGGER, 18, 8) }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ width: 16, height: 16, borderRadius: 4, background: `${tone}55`, border: `1px solid ${tone}` }} />
                  <span style={{ fontSize: 19, color: C.ink }}>{t.tiers[tr.tone]}</span>
                </div>
                <div style={{ marginInlineStart: 26, marginTop: 2 }}>
                  <Num size={15} color={C.ink3} mono>
                    {tr.min}–{tr.max}
                  </Num>
                </div>
              </div>
            );
          })}
        </div>
      </Card>
    </SceneFrame>
  );
};
