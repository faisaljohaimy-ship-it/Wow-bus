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
const STORY_L = DATA.story.likelihood;
const STORY_I = DATA.story.impact;
const LEGEND: Array<{ tone: Tone; range: string; label: (lang: 'ar' | 'en') => string }> = [
  { tone: 'critical', range: `≥ ${THRESH.red}`, label: (lang) => COPY[lang].rating.red },
  { tone: 'warning', range: `${THRESH.yellow}–${THRESH.red - 1}`, label: (lang) => COPY[lang].rating.yellow },
  { tone: 'good', range: `< ${THRESH.yellow}`, label: (lang) => COPY[lang].rating.green },
];

/** Solid mix of a tone over the card surface (avoids muddy alpha blends). */
export function shade(hex: string, k: number): string {
  const a = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  const b = [0x11, 0x1d, 0x2e];
  return `rgb(${a.map((v, i) => Math.round(v * k + b[i] * (1 - k))).join(',')})`;
}

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
  const rowY = (i: number) => gy + (5 - i) * (cell + gap); // impact 5 on top
  const highlight = prog(f, 112, 18, EASE.out); // focus hand-off to the site category
  const storyRing = prog(f, 120, 18, EASE.out); // …and to the story risk's cell

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
        { f: frames + 15, s: 1.04, x: -28, y: 4 },
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

      {/* ── AI risk matrix: open AI risks by likelihood × impact ── */}
      <Card style={{ top: 236, insetInlineStart: 988, width: 836, height: 664, ...enter(f, 6, 24, 16) }}>
        <div style={{ position: 'absolute', top: 30, insetInlineStart: 36 }}>
          <Eyebrow>{t.heatTitle}</Eyebrow>
          <div style={{ fontSize: 34, fontWeight: 600, marginTop: 4 }}>{t.heatSub(HEAT.total).split(' · ')[0]}</div>
          <div style={{ fontSize: 20, color: C.ink3, marginTop: 4 }}>{t.heatSub(HEAT.total).split(' · ')[1]}</div>
        </div>
        {/* impact axis (vertical) */}
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
          {t.severity} {rtl ? '←' : '→'}
        </div>
        {[5, 4, 3, 2, 1].map((i) => (
          <div
            key={i}
            style={{
              position: 'absolute',
              top: rowY(i) + cell / 2 - 13,
              insetInlineStart: 64,
              width: 128,
              textAlign: 'end',
              fontSize: 17,
              color: C.ink2,
              whiteSpace: 'nowrap',
              opacity: prog(f, 14, 16),
            }}
          >
            {t.severityLabels[i - 1]}{' '}
            <Num size={15} color={C.ink3} mono>
              {i}
            </Num>
          </div>
        ))}
        {HEAT.cells.map((c) => {
          const tone = TONE[c.tone as Tone];
          const order = c.likelihood - 1 + (5 - c.impact); // diagonal wave from the low corner
          const p = prog(f, 16 + order * STAGGER * 2 + (c.likelihood - 1) * STAGGER, 20, EASE.out);
          const has = c.count > 0;
          const isStory = c.likelihood === STORY_L && c.impact === STORY_I;
          return (
            <div
              key={`${c.likelihood}-${c.impact}`}
              style={{
                position: 'absolute',
                top: rowY(c.impact),
                insetInlineStart: colX(c.likelihood),
                width: cell,
                height: cell,
                borderRadius: 10,
                background: has ? `linear-gradient(180deg, ${shade(tone, 0.74)} 0%, ${shade(tone, 0.6)} 100%)` : shade(tone, 0.13),
                border: `1px solid ${has ? shade(tone, 0.95) : shade(tone, 0.3)}`,
                boxShadow: isStory ? `0 0 0 ${3 * storyRing}px ${C.accent}, 0 0 ${22 * storyRing}px ${C.accent}88` : has ? 'inset 0 1px 0 rgba(255,255,255,0.12)' : 'none',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                opacity: p,
                transform: `scale(${0.86 + 0.14 * p})`,
                boxSizing: 'border-box',
              }}
            >
              {has && (
                <Num size={30} weight={600} color="#FFFFFF" style={{ textShadow: '0 1px 2px rgba(0,0,0,0.35)' }}>
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
        {/* legend: cell colour = platform rating of likelihood × impact × 4 */}
        <div style={{ position: 'absolute', top: gy + 4, insetInlineStart: 652, width: 160 }}>
          {LEGEND.map((lg, i) => {
            const tone = TONE[lg.tone];
            return (
              <div key={lg.tone} style={{ marginBottom: 22, ...enter(f, 28 + i * STAGGER, 18, 8) }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ width: 16, height: 16, borderRadius: 4, background: shade(tone, 0.7), border: `1px solid ${tone}` }} />
                  <span style={{ fontSize: 19, color: C.ink }}>{lg.label(lang)}</span>
                </div>
                <div style={{ marginInlineStart: 26, marginTop: 2 }}>
                  <Num size={15} color={C.ink3} mono>
                    {lg.range}
                  </Num>
                </div>
              </div>
            );
          })}
          <div style={{ fontSize: 15, color: C.ink3, lineHeight: 1.4, marginTop: 6, ...enter(f, 34, 18, 8) }}>{t.formula}</div>
        </div>
      </Card>
    </SceneFrame>
  );
};
