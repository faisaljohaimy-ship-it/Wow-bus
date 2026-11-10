import React from 'react';
import { useCurrentFrame } from 'remotion';
import { Eyebrow, Num, RatingBadge } from '../components/Chrome';
import { Metal } from '../components/Metal';
import { mixHex, RingGauge } from '../components/Ring';
import { Layer, Shot } from '../components/Stage';
import { COPY } from '../copy';
import { DATA } from '../data';
import type { SceneProps } from '../Explainer';
import { countUp, enter, prog } from '../lib/anim';
import { SHOTS } from '../shots';
import { C, EASE, RATING_TONE, RING_TONE, STAGGER, TONE, TONE_TEXT, type Tone } from '../theme';

const CONS = DATA.consolidated;
const HEAT = DATA.heatmap;
const THRESH = { yellow: 40, red: 70 }; // platform-selectors RATING_THRESHOLDS (B2)
const STORY_L = DATA.story.likelihood;
const STORY_I = DATA.story.impact;
const IS_AI = HEAT.source === 'ai-risks';
const DIST = Object.fromEntries(DATA.ratingDistribution.map((d) => [d.rating, d.value])) as Record<string, number>;

/** Portfolio dial centre: the validation ring sat on the same screen spot (match cut). */
export const DIAL = { x: 398, y: 598, r: 190 };
/** Matrix geometry (world px, left-to-right layout). */
export const MATRIX = { x0: 1318, y0: 300, cell: 78, gap: 6 };
export const storyCell = () => ({
  x: MATRIX.x0 + (STORY_L - 1) * (MATRIX.cell + MATRIX.gap) + MATRIX.cell / 2,
  y: MATRIX.y0 + (5 - STORY_I) * (MATRIX.cell + MATRIX.gap) + MATRIX.cell / 2,
});

export const Analyze: React.FC<SceneProps> = ({ lang, frames, matchIn, matchOut }) => {
  const f = useCurrentFrame();
  const rtl = lang === 'ar';
  const t = COPY[lang].analyze;
  const rl = COPY[lang].rating;
  const consTone = RATING_TONE[CONS.rating];
  const sweep = prog(f, 8, 56, EASE.inOut);
  const gv = countUp(f, 8, 56, CONS.score);
  const bars = prog(f, 20, 50, EASE.out);
  const highlight = prog(f, 104, 18, EASE.out);
  const storyRing = prog(f, 112, 20, EASE.out);
  const { cell, gap, x0, y0 } = MATRIX;
  const colX = (l: number) => x0 + (l - 1) * (cell + gap) - 1148; // card-relative (matrix card starts at 1148)
  const rowY = (i: number) => y0 + (5 - i) * (cell + gap) - 150;
  const legend: Array<{ tone: Tone; rating: string; range: string }> = [
    { tone: 'critical', rating: 'red', range: `${THRESH.red}–100` },
    { tone: 'warning', rating: 'yellow', range: `${THRESH.yellow}–${THRESH.red - 1}` },
    { tone: 'good', rating: 'green', range: `0–${THRESH.yellow - 1}` },
  ];

  return (
    <Shot frames={frames} rtl={rtl} matchIn={matchIn} matchOut={matchOut} shots={SHOTS.analyze}>
      <Layer>
        {/* ── consolidated portfolio dial ── */}
        <Metal x={96} y={150} w={604} h={750} rtl={rtl} comet={{ phase: 0.35, speed: 13, len: 160 }} style={{ padding: '30px 36px' }}>
          <div style={enter(f, 0)}>
            <Eyebrow>{t.eyebrow}</Eyebrow>
            <div style={{ fontSize: 33, fontWeight: 600, marginTop: 4 }}>{t.gaugeTitle}</div>
            <div style={{ fontSize: 19, color: C.ink3, marginTop: 4 }}>{t.gaugeSub(DATA.openAiRisks)}</div>
          </div>
          <div style={{ position: 'absolute', bottom: 22, insetInlineStart: 36, fontSize: 17, color: C.ink3, ...enter(f, 40, 18, 6) }}>{t.weeks}</div>
        </Metal>
        <div style={{ position: 'absolute', insetInlineStart: DIAL.x - 280, top: DIAL.y - 280 }}>
          <RingGauge
            size={560}
            r={DIAL.r}
            stroke={24}
            value={(CONS.score / 100) * sweep}
            tone={RING_TONE[consTone]}
            rtl={rtl}
            bars={CONS.trend}
            barMax={100}
            barIn={DIAL.r + 26}
            barLen={50}
            barW={7}
            barsP={bars}
            id="cons"
          >
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
              <Num size={124} weight={500}>
                {Math.round(gv)}
              </Num>
              <Num size={30} color={C.ink3}>
                /100
              </Num>
            </div>
            <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, ...enter(f, 40, 18, 8) }}>
              <RatingBadge color={TONE[consTone]} label={rl[CONS.rating]} size={22} />
              <div style={{ fontSize: 19, color: C.ink2 }}>{lang === 'ar' ? CONS.hintAr : CONS.hintEn}</div>
            </div>
          </RingGauge>
        </div>

        {/* ── five category dials (ring = score / 100, bars = 12 weekly scores) ── */}
        <Metal x={724} y={150} w={400} h={750} rtl={rtl} style={{ padding: '30px 30px', ...enter(f, 6, 22, 14) }}>
          <Eyebrow>{t.categories}</Eyebrow>
          <div style={{ marginTop: 16 }}>
            {DATA.categories.map((c, i) => {
              const tone = RATING_TONE[c.rating];
              const p = prog(f, 18 + i * STAGGER * 3, 44, EASE.expo);
              const isSite = c.id === DATA.story.category;
              return (
                <div
                  key={c.id}
                  style={{
                    position: 'relative',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 16,
                    height: 118,
                    marginInline: -14,
                    paddingInline: 14,
                    borderRadius: 16,
                    border: `1.5px solid ${isSite ? `rgba(14,147,172,${0.75 * highlight})` : 'transparent'}`,
                    background: isSite ? `rgba(14,147,172,${0.06 * highlight})` : 'transparent',
                    ...enter(f, 10 + i * STAGGER * 3, 20, 10),
                  }}
                >
                  <RingGauge
                    size={104}
                    r={30}
                    stroke={7}
                    value={(c.score / 100) * p}
                    tone={RING_TONE[tone]}
                    rtl={rtl}
                    bars={c.trend}
                    barMax={100}
                    barIn={40}
                    barLen={11}
                    barW={3.2}
                    barsP={p}
                    glow={0.6}
                    id={`cat-${c.id}`}
                  >
                    <Num size={22} weight={600}>
                      {Math.round(c.score * p)}
                    </Num>
                  </RingGauge>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 21, fontWeight: 500, color: C.ink, lineHeight: 1.2 }}>{lang === 'ar' ? c.labelAr : c.labelEn}</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
                      <span style={{ width: 10, height: 10, borderRadius: 999, background: TONE[tone] }} />
                      <span style={{ fontSize: 18, color: TONE_TEXT[tone], fontWeight: 600 }}>{rl[c.rating]}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </Metal>

        {/* ── AI risk matrix: open AI risks by likelihood × impact ── */}
        <Metal x={1148} y={150} w={676} h={750} rtl={rtl} style={{ ...enter(f, 10, 24, 16) }}>
          <div style={{ position: 'absolute', top: 28, insetInlineStart: 36 }}>
            <Eyebrow>{IS_AI ? t.heatTitle : t.heatTitleHse}</Eyebrow>
            <div style={{ fontSize: 31, fontWeight: 600, marginTop: 4 }}>{(IS_AI ? t.heatSub : t.heatSubHse)(HEAT.total).split(' · ')[0]}</div>
            <div style={{ fontSize: 19, color: C.ink3, marginTop: 2 }}>{(IS_AI ? t.heatSub : t.heatSubHse)(HEAT.total).split(' · ')[1]}</div>
          </div>
          {/* impact axis */}
          <div style={{ position: 'absolute', top: rowY(3) + cell / 2 - 12, insetInlineStart: -10, width: 80, textAlign: 'center', fontSize: 17, color: C.ink3, transform: `rotate(${rtl ? 90 : -90}deg)` }}>
            {IS_AI ? t.severity : t.severityHse}
          </div>
          {[5, 4, 3, 2, 1].map((i) => (
            <div key={i} style={{ position: 'absolute', top: rowY(i) + cell / 2 - 12, insetInlineStart: 50, width: colX(1) - 62, textAlign: 'end', fontSize: 16, color: C.ink2, whiteSpace: 'nowrap', opacity: prog(f, 14, 16) }}>
              {t.severityLabels[i - 1]}{' '}
              <Num size={14} color={C.ink3} mono>
                {i}
              </Num>
            </div>
          ))}
          {HEAT.cells.map((c) => {
            const tone = TONE[c.tone as Tone];
            const order = c.likelihood - 1 + (5 - c.impact);
            const p = prog(f, 16 + order * STAGGER * 2 + (c.likelihood - 1) * STAGGER, 20, EASE.out);
            const has = c.count > 0;
            const isStory = c.likelihood === STORY_L && c.impact === STORY_I;
            const warm = c.tone === 'warning';
            return (
              <div
                key={`${c.likelihood}-${c.impact}`}
                style={{
                  position: 'absolute',
                  top: rowY(c.impact),
                  insetInlineStart: colX(c.likelihood),
                  width: cell,
                  height: cell,
                  borderRadius: 12,
                  background: has ? `linear-gradient(180deg, ${mixHex(tone, '#FFFFFF', warm ? 0.85 : 0.78)} 0%, ${mixHex(tone, '#FFFFFF', warm ? 0.95 : 0.92)} 100%)` : mixHex(tone, '#FFFFFF', 0.1),
                  border: `1px solid ${has ? mixHex(tone, '#000000', 0.86) : mixHex(tone, '#FFFFFF', 0.3)}`,
                  boxShadow: isStory ? `0 0 0 ${4 * storyRing}px #FFFFFF, 0 0 0 ${7 * storyRing}px ${C.accent}, 0 0 ${26 * storyRing}px ${C.accentBright}` : has ? 'inset 0 1px 0 rgba(255,255,255,0.35)' : 'none',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  opacity: p,
                  transform: `scale(${0.86 + 0.14 * p})`,
                  boxSizing: 'border-box',
                }}
              >
                {has && (
                  <Num size={30} weight={600} color={warm ? C.ink : '#FFFFFF'}>
                    {c.count}
                  </Num>
                )}
              </div>
            );
          })}
          {[1, 2, 3, 4, 5].map((l) => (
            <div key={l} style={{ position: 'absolute', top: rowY(1) + cell + 10, insetInlineStart: colX(l) - 8, width: cell + 16, textAlign: 'center', fontSize: 15, lineHeight: 1.25, color: C.ink2, opacity: prog(f, 18, 16) }}>
              <Num size={14} color={C.ink3} mono>
                {l}
              </Num>
              <div>{t.likelihoodLabels[l - 1]}</div>
            </div>
          ))}
          <div style={{ position: 'absolute', top: rowY(1) + cell + 62, insetInlineStart: colX(1), width: 5 * cell + 4 * gap, textAlign: 'center', fontSize: 17, color: C.ink3, opacity: prog(f, 18, 16) }}>
            {t.likelihood}
          </div>
          {/* legend: cell colour = platform rating of likelihood × impact × 4; counts = open risks per rating */}
          <div style={{ position: 'absolute', bottom: 28, insetInlineStart: 36, insetInlineEnd: 36, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
            {legend.map((lg, i) => (
              <div key={lg.tone} style={{ ...enter(f, 28 + i * STAGGER * 2, 18, 8) }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                  <span style={{ width: 16, height: 16, borderRadius: 4, background: TONE[lg.tone] }} />
                  <span style={{ fontSize: 18, color: C.ink, fontWeight: 600 }}>{rl[lg.rating]}</span>
                  <Num size={18} color={C.ink}>
                    {DIST[lg.rating]}
                  </Num>
                </div>
                <div style={{ marginInlineStart: 25, marginTop: 2 }}>
                  <Num size={14} color={C.ink3} mono>
                    {lg.range}
                  </Num>
                </div>
              </div>
            ))}
            {IS_AI && <div style={{ fontSize: 14, color: C.ink3, lineHeight: 1.4, whiteSpace: 'pre', textAlign: 'end', ...enter(f, 34, 18, 8) }}>{t.formula}</div>}
          </div>
        </Metal>
      </Layer>
    </Shot>
  );
};
