import React from 'react';
import { spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { Check, DirArrow, ScoreChip } from '../components/Bits';
import { Code, Eyebrow, Num, Tag } from '../components/Chrome';
import { Metal, MetalRing } from '../components/Metal';
import { Seal } from '../components/Seal';
import { Layer, Shot } from '../components/Stage';
import { COPY } from '../copy';
import { DATA } from '../data';
import type { SceneProps } from '../Explainer';
import { enter, prog } from '../lib/anim';
import { SHOTS } from '../shots';
import { C, EASE } from '../theme';

const S = DATA.story;
const ratingOf = (score: number) => (score >= 70 ? 'red' : score >= 40 ? 'yellow' : 'green'); // B2 thresholds
const CODE_SPLIT = /(AIR-\d+|MT-\d+|AL-\d+|IN-[\w-]+|Biltix PM|BILTIX PM|\d+(?:\.\d+)?%)/;
const IS_PCT = /^\d+(?:\.\d+)?%$/;
const IS_CODE = /^(AIR-\d+|MT-\d+|AL-\d+|IN-[\w-]+)$/;

/** Seal geometry (world px, left-to-right layout); the outro's step ring starts at this size and spot. */
export const SEAL = { x: 1484, y: 440, size: 376, ringR: 186 };

/** Isolate Latin codes inside Arabic sentences; "(MT-0214)" → "· MT-0214". */
const Rich: React.FC<{ text: string }> = ({ text }) => {
  const clean = text.replace(/\s*\(((?:AIR|MT|AL)-\d+)\)/g, ' · $1');
  const parts = clean.split(CODE_SPLIT);
  return (
    <>
      {parts.map((p, i) =>
        IS_CODE.test(p) ? (
          <Code key={i} size={19}>
            {p}
          </Code>
        ) : IS_PCT.test(p) || /^biltix pm$/i.test(p) ? (
          <bdi key={i} dir="ltr">
            {p}
          </bdi>
        ) : (
          <React.Fragment key={i}>{p}</React.Fragment>
        ),
      )}
    </>
  );
};

const ROW_H = 66;
const ROW0 = 14; // first row appears
const ROW_GAP = 6; // frames between rows (sequential audit read-out)

export const Close: React.FC<SceneProps> = ({ lang, frames, matchIn, matchOut }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const rtl = lang === 'ar';
  const ar = lang === 'ar';
  const t = COPY[lang].close;
  const rl = COPY[lang].rating;
  const rows = S.timeline;
  const closeAt = ROW0 + rows.length * ROW_GAP + 8;
  const closeP = prog(f, closeAt, 18, EASE.out);
  const sealIn = spring({ frame: f - closeAt + 4, fps, config: { damping: 200, mass: 0.8 } });
  const ring = prog(f, closeAt, 30, EASE.inOut);
  const ticks = prog(f, closeAt + 6, 30, EASE.inOut);
  const check = prog(f, closeAt + 24, 18, EASE.out);
  const halo = prog(f, closeAt + 36, 16, EASE.out) * (1 - prog(f, closeAt + 58, 40, EASE.inOut) * 0.6);
  const lineP = prog(f, ROW0, rows.length * ROW_GAP + 10, EASE.inOut);
  const target = S.closure.targetScore;
  const sx = rtl ? 1920 - SEAL.x : SEAL.x;

  return (
    <Shot frames={frames} rtl={rtl} matchIn={matchIn} matchOut={matchOut} shots={SHOTS.close}>
      <Layer>
        {/* ── audit trail ── */}
        <Metal x={96} y={150} w={1024} h={750} rtl={rtl} comet={{ phase: 0.4, speed: 13, len: 160 }} style={{ padding: '28px 40px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, ...enter(f, 0) }}>
            <Eyebrow>{t.eyebrow}</Eyebrow>
            <span style={{ color: C.ink3 }}>·</span>
            <Code size={20}>{S.code}</Code>
          </div>
          <div style={{ fontSize: 34, fontWeight: 600, marginTop: 4, ...enter(f, 2) }}>{t.title}</div>
          <div style={{ position: 'relative', marginTop: 18 }}>
            <div style={{ position: 'absolute', top: ROW_H / 2, insetInlineStart: 208, width: 2, height: rows.length * ROW_H * lineP, background: C.border2 }} />
            {rows.map((r, i) => {
              const p = prog(f, ROW0 + i * ROW_GAP, 16, EASE.out);
              const tone = r.kind === 'detected' ? C.red : r.kind === 'alert' ? '#D69A14' : C.primary;
              return (
                <div key={`${r.kind}-${i}`} style={{ display: 'flex', alignItems: 'center', height: ROW_H, opacity: p, transform: `translateY(${(1 - p) * 8}px)` }}>
                  <div style={{ width: 190 }}>
                    <Num size={16} color={C.ink3} mono>
                      {r.date}
                    </Num>{' '}
                    <Num size={20} color={C.ink2} mono>
                      {r.time}
                    </Num>
                  </div>
                  <div style={{ width: 38, display: 'flex', justifyContent: 'center' }}>
                    <span style={{ width: 13, height: 13, borderRadius: 999, background: '#FFFFFF', border: `2.5px solid ${tone}` }} />
                  </div>
                  <div style={{ marginInlineStart: 14, minWidth: 0 }}>
                    <div style={{ fontSize: 20.5, color: C.ink, whiteSpace: 'nowrap' }}>
                      <Rich text={ar ? r.textAr : r.textEn} />
                    </div>
                    <div style={{ fontSize: 16, color: C.ink3, marginTop: 1 }}>{ar ? r.byAr : r.byEn}</div>
                  </div>
                </div>
              );
            })}
            {/* closure row — the workflow's end state (illustrative for this demo risk) */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                height: ROW_H + 8,
                marginTop: 8,
                borderRadius: 14,
                border: `1.5px dashed rgba(184,134,11,${0.7 * closeP})`,
                background: `rgba(184,134,11,${0.06 * closeP})`,
                opacity: closeP,
                marginInline: -12,
                paddingInline: 12,
              }}
            >
              <div style={{ width: 190, fontSize: 17, color: C.ink3 }}>-</div>
              <div style={{ width: 38, display: 'flex', justifyContent: 'center' }}>
                <span style={{ width: 28, height: 28, borderRadius: 999, border: `1.5px solid ${C.gold}`, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#FFFFFF' }}>
                  <Check size={19} p={check} color={C.accentText} />
                </span>
              </div>
              <div style={{ marginInlineStart: 14, display: 'flex', alignItems: 'center', gap: 16 }}>
                <span style={{ fontSize: 23, fontWeight: 600 }}>{t.verified}</span>
                <Tag size={16}>{t.illustrative}</Tag>
              </div>
            </div>
          </div>
        </Metal>

        {/* ── verified-closure seal, with the laser comet orbiting its metal ring ── */}
        <MetalRing cx={sx} cy={SEAL.y} r={SEAL.ringR} width={2.5} rtl={rtl} id="seal-ring" draw={ring} comet={{ phase: 0.1, speed: 12, len: 200, opacity: prog(f, closeAt + 20, 16) }} />
        <div style={{ position: 'absolute', left: sx - SEAL.size / 2, top: SEAL.y - SEAL.size / 2, opacity: Math.min(1, sealIn * 1.2), transform: `scale(${0.94 + 0.06 * sealIn})` }}>
          <Seal size={SEAL.size} ring={ring} ticks={ticks} text={prog(f, closeAt + 14, 20)} check={check} halo={halo} micro={`BILTIX RISK AI · VERIFIED CLOSURE · ${S.code} · `.repeat(2)} />
        </div>
        <div style={{ position: 'absolute', top: SEAL.y + SEAL.ringR + 26, insetInlineStart: 1144, width: 680, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <div style={{ fontSize: 34, fontWeight: 600, ...enter(f, closeAt + 26, 20, 10) }}>{t.verified}</div>
          <div style={{ marginTop: 4, fontSize: 19, color: C.ink2, ...enter(f, closeAt + 28, 20, 10) }}>{t.closure}</div>
          <div style={{ marginTop: 16, display: 'flex', alignItems: 'center', gap: 14, ...enter(f, closeAt + 32, 20, 10) }}>
            <ScoreChip score={S.score} rating={S.rating} label={rl[S.rating]} size={22} />
            <DirArrow rtl={rtl} size={26} />
            <ScoreChip score={`${S.recommendation.targetApprox ? '~' : ''}${target}`} rating={ratingOf(target)} label={rl[ratingOf(target)]} size={22} dashed />
          </div>
          <div style={{ marginTop: 10, fontSize: 16, color: C.ink3, ...enter(f, closeAt + 34, 20, 10) }}>
            {t.residual} · {t.illustrative}
          </div>
        </div>
      </Layer>
    </Shot>
  );
};
