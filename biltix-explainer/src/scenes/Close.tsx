import React from 'react';
import { spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { Check, DirArrow, ScoreChip } from '../components/Bits';
import { Card, Code, Eyebrow, Num } from '../components/Chrome';
import { SceneFrame } from '../components/SceneFrame';
import { Seal } from '../components/Seal';
import { COPY } from '../copy';
import { DATA } from '../data';
import type { SceneProps } from '../Explainer';
import { enter, prog } from '../lib/anim';
import { C, EASE } from '../theme';

const S = DATA.story;
const ratingOf = (score: number) => (score >= 70 ? 'red' : score >= 40 ? 'yellow' : 'green'); // B2 thresholds
const CODE_SPLIT = /(AIR-\d+|MT-\d+|AL-\d+|IN-[\w-]+|Biltix PM|BILTIX PM|\d+(?:\.\d+)?%)/;
const IS_PCT = /^\d+(?:\.\d+)?%$/;
const IS_CODE = /^(AIR-\d+|MT-\d+|AL-\d+|IN-[\w-]+)$/;

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
        ) : IS_PCT.test(p) ? (
          <bdi key={i} dir="ltr">
            {p}
          </bdi>
        ) : /^biltix pm$/i.test(p) ? (
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

const ROW_H = 70;
const ROW0 = 16; // first row appears
const ROW_GAP = 6; // frames between rows (sequential audit read-out)

export const Close: React.FC<SceneProps> = ({ lang, frames }) => {
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

  return (
    <SceneFrame
      frames={frames}
      rtl={rtl}
      cam={[
        { f: 0, s: 1.0, x: 0, y: 0 },
        { f: closeAt, s: 1.015, x: 20, y: 0 },
        { f: frames + 15, s: 1.04, x: -28, y: 4 },
      ]}
    >
      {/* ── audit trail ── */}
      <Card style={{ top: 236, insetInlineStart: 96, width: 1040, height: 664, padding: '28px 40px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, ...enter(f, 0) }}>
          <Eyebrow>{t.eyebrow}</Eyebrow>
          <span style={{ color: C.ink3 }}>·</span>
          <Code size={20}>{S.code}</Code>
        </div>
        <div style={{ fontSize: 34, fontWeight: 600, marginTop: 4, ...enter(f, 2) }}>{t.title}</div>
        <div style={{ position: 'relative', marginTop: 20 }}>
          {/* spine */}
          <div style={{ position: 'absolute', top: ROW_H / 2, insetInlineStart: 208, width: 2, height: (rows.length) * ROW_H * lineP, background: C.border }} />
          {rows.map((r, i) => {
            const p = prog(f, ROW0 + i * ROW_GAP, 16, EASE.out);
            const tone = r.kind === 'detected' ? C.red : r.kind === 'alert' ? C.amber : C.primary;
            return (
              <div key={`${r.kind}-${i}`} style={{ display: 'flex', alignItems: 'center', height: ROW_H, opacity: p, transform: `translateY(${(1 - p) * 8}px)` }}>
                <div style={{ width: 190 }}>
                  <Num size={17} color={C.ink3} mono>
                    {r.date}
                  </Num>{' '}
                  <Num size={20} color={C.ink2} mono>
                    {r.time}
                  </Num>
                </div>
                <div style={{ width: 38, display: 'flex', justifyContent: 'center' }}>
                  <span style={{ width: 12, height: 12, borderRadius: 999, background: C.surface, border: `2px solid ${tone}` }} />
                </div>
                <div style={{ marginInlineStart: 14, minWidth: 0 }}>
                  <div style={{ fontSize: 21, color: C.ink, whiteSpace: 'nowrap' }}>
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
              height: ROW_H + 6,
              marginTop: 6,
              borderRadius: 14,
              border: `1px dashed rgba(212,160,23,${0.6 * closeP})`,
              background: `rgba(212,160,23,${0.05 * closeP})`,
              opacity: closeP,
              marginInline: -12,
              paddingInline: 12,
            }}
          >
            <div style={{ width: 190, fontSize: 17, color: C.ink3 }}>—</div>
            <div style={{ width: 38, display: 'flex', justifyContent: 'center' }}>
              <span style={{ width: 26, height: 26, borderRadius: 999, border: `1.5px solid ${C.gold}`, display: 'flex', alignItems: 'center', justifyContent: 'center', background: C.bg }}>
                <Check size={18} p={check} color={C.accent} />
              </span>
            </div>
            <div style={{ marginInlineStart: 14, display: 'flex', alignItems: 'center', gap: 16 }}>
              <span style={{ fontSize: 23, fontWeight: 600 }}>{t.verified}</span>
              <span style={{ fontSize: 16, color: C.ink3, padding: '3px 10px', borderRadius: 999, border: `1px dashed ${C.ink3}` }}>{t.illustrative}</span>
            </div>
          </div>
        </div>
      </Card>

      {/* ── verified-closure seal ── */}
      <div style={{ position: 'absolute', top: 240, insetInlineStart: 1160, width: 664, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <div style={{ opacity: Math.min(1, sealIn * 1.2), transform: `scale(${0.94 + 0.06 * sealIn})` }}>
          <Seal size={392} ring={ring} ticks={ticks} text={prog(f, closeAt + 14, 20)} check={check} halo={halo} micro={`BILTIX RISK AI · VERIFIED CLOSURE · ${S.code} · `.repeat(2)} />
        </div>
        <div style={{ marginTop: 18, fontSize: 36, fontWeight: 600, ...enter(f, closeAt + 26, 20, 10) }}>{t.verified}</div>
        <div style={{ marginTop: 6, fontSize: 19, color: C.ink2, ...enter(f, closeAt + 28, 20, 10) }}>{t.closure}</div>
        <div style={{ marginTop: 20, display: 'flex', alignItems: 'center', gap: 14, ...enter(f, closeAt + 32, 20, 10) }}>
          <ScoreChip score={S.score} rating={S.rating} label={rl[S.rating]} size={22} />
          <DirArrow rtl={rtl} size={26} />
          <ScoreChip score={`${S.recommendation.targetApprox ? '~' : ''}${target}`} rating={ratingOf(target)} label={rl[ratingOf(target)]} size={22} dashed />
        </div>
        <div style={{ marginTop: 10, fontSize: 16, color: C.ink3, ...enter(f, closeAt + 34, 20, 10) }}>
          {t.residual} · {t.illustrative}
        </div>
      </div>
    </SceneFrame>
  );
};
