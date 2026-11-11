/**
 * Film v2, act 2 — the platform at work (S07–S12): evidence, AI assessment, recommendations, the human decision,
 * tasks and the evidence-based closure. Real app screens (recordings when present, else captures under a live
 * camera) sit next to the kinetic diagrams.
 */
import React from 'react';
import { AbsoluteFill, staticFile, useCurrentFrame } from 'remotion';
import { keys, mix, prog } from '../lib/anim';
import { C, EASE, ELEV, FONT, METAL } from '../theme';
import { captionChunks } from './captions';
import { Backdrop, Clip, CoolGrade, FocusRing, FootageTag, LowShade, SceneCam, Screen, Shine, Stream, shake } from './fx';
import { BrollFrame, Box, Card, Chip, Icon, IconTile, Kicker, Mono, Words, metalBorder, px, rise, useFilm, type ChipTone } from './kit';
import { brollFile, pickBroll } from './media';
import { ChecklistSeal, DecisionStamp, DriverBars, EvidenceOrbit, ScoreDial, TaskCard } from './parts';
import { atLine, XFADE, type SceneTiming } from './timeline';

export type SceneProps = { s: SceneTiming };

/** AI spark chip (the platform's own AI at work). */
const AiChip: React.FC<{ text: string; dark?: boolean; size?: number; style?: React.CSSProperties }> = ({ text, dark, size = 26, style }) => {
  const f = useCurrentFrame();
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 12,
        padding: `${Math.round(size * 0.3)}px ${Math.round(size * 0.7)}px`,
        borderRadius: 999,
        border: '2px solid transparent',
        background: `linear-gradient(${dark ? '#0E1A2E' : '#FFFFFF'}, ${dark ? '#0E1A2E' : '#FFFFFF'}) padding-box, ${METAL} border-box`,
        color: dark ? '#FFE2C2' : C.orangeText,
        fontSize: size,
        fontWeight: 650,
        whiteSpace: 'nowrap',
        boxShadow: '0 10px 24px -14px rgba(200,90,20,0.7)',
        ...style,
      }}
    >
      <svg width={size} height={size} viewBox="0 0 16 16" style={{ flex: 'none', transform: `rotate(${(f * 2) % 360}deg)` }}>
        <path d="M8 0.8 C8.6 5.2 10.8 7.4 15.2 8 C10.8 8.6 8.6 10.8 8 15.2 C7.4 10.8 5.2 8.6 0.8 8 C5.2 7.4 7.4 5.2 8 0.8Z" fill="#F08A2E" />
      </svg>
      {text}
    </span>
  );
};

/* ═════════════ S07 Evidence ═════════════ */
/** S07 cuts from the operations room to the evidence orbit at the second caption chunk (the HUD reads it too). */
export const s07Cut = (lang: 'ar' | 'en', s: SceneTiming) => {
  const ch = captionChunks(lang, s);
  return (ch[1] ? ch[1].from : Math.round(atLine(s, 0.4))) - 12;
};
export const S07: React.FC<SceneProps> = ({ s }) => {
  const f = useCurrentFrame();
  const { lang, rtl, c } = useFilm();
  const cut = s07Cut(lang, s);
  const iris = prog(f, cut, 20, EASE.inOut);
  const R = mix(0, 1200, iris);
  const listFrom = cut + 14;
  const listTo = s.vTo - 6;
  const at = Array.from({ length: 7 }, (_, i) => Math.round(mix(listFrom, listTo, i / 6.4)));
  const linked = at.filter((a) => f >= a + 14).length;
  const card = prog(f, cut + 6, 22, EASE.expo);
  const CX = 960;
  const CY = 500;
  const box = { x: CX, y: CY, w: 680, h: lang === 'en' ? 300 : 270 };
  return (
    <AbsoluteFill>
      {/* phase A: Tuesday 06:10 in the operations room (AI footage) + the cockpit */}
      {iris < 1 && (
        <AbsoluteFill style={{ background: '#05070B' }}>
          <Clip src={staticFile(brollFile('ops-room'))} from={0} dur={cut + 22} scale={[1.02, 1.12]} drift={[-30, -8]} />
          <CoolGrade />
          <LowShade k={0.8} />
          <SceneCam frames={cut + 20} zoom={[1, 1.03]}>
            <Box x={140} y={190} w={700} style={{ color: '#FFFFFF' }}>
              <div style={{ ...rise(f, 4, 20) }}>
                <AiChip text={c.aiLinked} dark size={28} />
              </div>
              <div style={{ marginTop: 26, display: 'flex', alignItems: 'center', gap: 22, ...rise(f, 10, 22) }}>
                <Icon name="clock" size={72} color="#FFC27F" width={1.7} />
                <span style={{ fontSize: 92, fontWeight: 700, lineHeight: 1.1, textShadow: '0 4px 22px rgba(0,0,0,0.5)' }}>{lang === 'ar' ? 'الثلاثاء' : 'Tue'}</span>
                <Mono size={92} color="#FFFFFF" weight={600} style={{ textShadow: '0 4px 22px rgba(0,0,0,0.5)' }}>
                  {`06:${String(Math.min(10, Math.floor(prog(f, 12, 40, EASE.out) * 10))).padStart(2, '0')}`}
                </Mono>
              </div>
              <div style={{ marginTop: 18, fontSize: 40, fontWeight: 600, color: '#E3ECF8', ...rise(f, 22, 20) }}>
                {c.sevenSources} → <Mono size={38} color="#FFD9B0" weight={600}>AIR-1069</Mono>
              </div>
            </Box>
            <div style={{ color: '#E3ECF8', ...rise(f, 8, 26, 40) }}>
              <Screen
                ui="ui-cockpit"
                fallback="cockpit"
                x={940}
                y={240}
                w={860}
                dur={cut + 22}
                focus={[
                  [0, 1.0, 0.5, 0.25],
                  [cut, 1.18, rtl ? 0.62 : 0.38, 0.35],
                ]}
                startAt={2.6}
                clipFocus={[
                  [2.6, 1.05, 0.5, 0.3],
                  [4.2, 1.2, 0.5, 0.42],
                  [7.0, 1.25, 0.5, 0.6],
                ]}
                shine={20}
              />
            </div>
          </SceneCam>
          <FootageTag text={c.aiFootage} opacity={1 - iris} />
        </AbsoluteFill>
      )}
      {/* phase B: the evidence orbit (iris in from the risk card) */}
      {iris > 0 && (
        <AbsoluteFill style={{ clipPath: iris < 1 ? `circle(${R.toFixed(1)}px at ${px(rtl, CX)}px ${CY}px)` : undefined }}>
          <Backdrop dark={0} at={s.from + f} />
          <SceneCam frames={s.frames - cut} zoom={[1.02, 1.0]}>
            <EvidenceOrbit cx={CX} cy={CY} rx={700} ry={300} at={at} spin={(f - cut) * 0.12} fly={0} cardBox={box} />
            <div
              style={{
                position: 'absolute',
                left: px(rtl, CX) - box.w / 2,
                top: CY - box.h / 2,
                width: box.w,
                height: box.h,
                boxSizing: 'border-box',
                borderRadius: 26,
                ...metalBorder('#FFFFFF', 2.5),
                boxShadow: `0 0 0 ${(8 * Math.sin(f / 9) ** 2).toFixed(1)}px rgba(208,59,59,0.14), ${ELEV}`,
                padding: '26px 32px',
                opacity: card,
                transform: `scale(${mix(0.86, 1, card).toFixed(4)})`,
                overflow: 'hidden',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <Mono size={30} color={C.redText} weight={600} style={{ padding: '4px 14px', borderRadius: 10, background: '#FDEDED', border: '1.5px solid #F3C4C4' }}>AIR-1069</Mono>
                <span style={{ flex: 1 }} />
                <Chip tone="neutral" icon="clock" size={24}>{c.detected}</Chip>
              </div>
              <div style={{ marginTop: 14, fontSize: lang === 'en' ? 31 : 34, fontWeight: 700, color: C.ink, lineHeight: 1.32 }}>{c.riskTitle}</div>
              <div style={{ marginTop: 14, display: 'flex', alignItems: 'center', gap: 14 }}>
                <span style={{ fontSize: 46, fontWeight: 700, color: C.accentText, lineHeight: 1 }}>
                  <bdi dir="ltr">{linked}</bdi>
                </span>
                <span style={{ fontSize: 28, fontWeight: 600, color: C.ink2 }}>{c.evidence}</span>
                <span style={{ flex: 1 }} />
                <span style={{ fontSize: 22, color: C.ink3 }}>{c.sourcesNote}</span>
              </div>
              <Shine at={cut + 30} every={110} strength={0.4} />
            </div>
          </SceneCam>
        </AbsoluteFill>
      )}
      {iris > 0 && iris < 1 && (
        <svg width={1920} height={1080} style={{ position: 'absolute', inset: 0 }}>
          <circle cx={px(rtl, CX)} cy={CY} r={R} fill="none" stroke="#FF8A2E" strokeWidth={6} opacity={0.9} />
          <circle cx={px(rtl, CX)} cy={CY} r={R} fill="none" stroke="#FFE2C2" strokeWidth={2} />
        </svg>
      )}
    </AbsoluteFill>
  );
};

/* ═════════════ S08 Assessment ═════════════ */
export const S08: React.FC<SceneProps> = ({ s }) => {
  const f = useCurrentFrame();
  const { lang, rtl, c } = useFilm();
  const ch = captionChunks(lang, s);
  const b = ch[1] ? ch[1].from : atLine(s, 0.55);
  const lAt = Math.round(atLine(s, 0.16));
  const iAt = Math.round(atLine(s, 0.27));
  const sAt = Math.round(atLine(s, 0.36));
  const redAt = Math.round(atLine(s, 0.5));
  const dial = prog(f, 2, 26, EASE.out);
  const score = mix(0, 80, prog(f, sAt, 40, EASE.expo));
  const col = score < 40 ? C.amber : score < 70 ? C.orange : C.red;
  const tok = (t: string, at: number, color: string = C.ink) => {
    const p = prog(f, at, 14, EASE.expo);
    return (
      <span style={{ display: 'inline-block', opacity: p, transform: `translateY(${((1 - p) * 18).toFixed(1)}px) scale(${mix(1.3, 1, p).toFixed(3)})`, color }}>{t}</span>
    );
  };
  const drv = [0, 1, 2, 3, 4].map((i) => Math.round(atLine(s, 0.4) + i * 6));
  const fxE = rtl ? 0.24 : 0.76;
  return (
    <SceneCam frames={s.frames} zoom={[1, 1.035]} drift={[-8, -4]}>
      <ScoreDial cx={340} cy={420} r={190} value={score} draw={dial} color={col} label={c.score} sub={<div style={{ marginTop: 8, opacity: prog(f, redAt, 12) }}><Chip tone="red" size={28}>{c.red}</Chip></div>} />
      {/* red flash at "red" */}
      <svg width={1920} height={1080} style={{ position: 'absolute', inset: 0, overflow: 'visible' }}>
        <circle cx={px(rtl, 340)} cy={420} r={190 + 60 * prog(f, redAt, 24, EASE.out)} fill="none" stroke={C.red} strokeWidth={4} opacity={0.6 * (1 - prog(f, redAt, 24, EASE.out)) * (f >= redAt ? 1 : 0)} />
      </svg>
      <Box x={110} y={650} w={500} style={{ textAlign: 'center' }}>
        <div dir="ltr" style={{ fontFamily: FONT.en, fontSize: 64, fontWeight: 700, letterSpacing: '0.02em' }}>
          {tok('4', lAt, C.ink)} {tok('×', lAt + 4, C.ink3)} {tok('5', iAt, C.ink)} {tok('×', iAt + 4, C.ink3)} {tok('4', iAt + 8, C.ink)} {tok('=', sAt, C.ink3)} {tok('80', sAt + 4, C.redText)}
        </div>
        <div style={{ marginTop: 6, display: 'flex', justifyContent: 'center', gap: 10, fontSize: 24, color: C.ink3, fontWeight: 600 }}>
          <span style={{ opacity: prog(f, lAt, 12) }}>{c.likelihood}</span>
          <span>·</span>
          <span style={{ opacity: prog(f, iAt, 12) }}>{c.impact}</span>
          <span>·</span>
          <span style={{ opacity: prog(f, iAt + 8, 12) }}>{c.scale}</span>
        </div>
      </Box>
      <Box x={650} y={170} w={540}>
        <div style={rise(f, 6, 18)}>
          <AiChip text={c.aiScored} size={26} />
        </div>
        <div style={{ marginTop: 26, ...rise(f, drv[0] - 8, 16) }}>
          <Kicker size={28}>{c.drivers}</Kicker>
        </div>
        <div style={{ marginTop: 16 }}>
          <DriverBars labels={c.driverLabels} pct={[35, 25, 20, 15, 5]} at={drv} width={520} />
        </div>
        <div style={{ marginTop: 18, ...rise(f, drv[4] + 14, 16) }}>
          <Chip tone="amber" icon="zap" size={24}>{c.confidence}</Chip>
        </div>
      </Box>
      {/* real register drawer: the explanation */}
      <div style={{ color: C.ink2, ...rise(f, 10, 24, 30) }}>
        <Screen
          ui="ui-register"
          fallback="airisks-drawer-explain"
          x={1240}
          y={210}
          w={590}
          dur={s.frames + XFADE}
          focus={[
            [0, 1.05, fxE, 0.3],
            [b - 20, 1.25, fxE, 0.45],
            [b + 30, 1.9, fxE, 0.58],
            [s.frames, 2.0, fxE, 0.6],
          ]}
          startAt={3.0}
          clipFocus={[
            [3.0, 1.12, 0.5, 0.42],
            [5.8, 1.12, 0.5, 0.45],
            [6.7, 1.75, rtl ? 0.18 : 0.82, 0.4],
            [8.0, 1.8, rtl ? 0.18 : 0.82, 0.45],
            [10.6, 1.95, rtl ? 0.18 : 0.82, 0.55],
          ]}
          shine={30}
        />
      </div>
      {/* the explanation, in plain language */}
      <Card x={650} y={680} w={1180} pad="20px 28px" style={{ ...rise(f, b - 4, 20, 24) }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 26, fontWeight: 650, color: C.accentText }}>
          <Icon name="doc" size={28} color={C.accentText} />
          {c.why}
          <span style={{ flex: 1 }} />
          <Chip tone="teal" icon="link" size={22}>{c.withSources}</Chip>
        </div>
        <div style={{ marginTop: 8, fontSize: 30, fontWeight: 500, color: C.ink, lineHeight: 1.5 }}>
          <Words text={c.explain} at={b + 2} per={2} dur={12} dist={10} />
        </div>
      </Card>
      <FocusRing x={1240} y={210 + 44 + Math.round((590 * 9) / 16) * 0.35} w={594} h={Math.round((590 * 9) / 16) * 0.4} at={b + 34} />
    </SceneCam>
  );
};

/* ═════════════ S09 Recommendations ═════════════ */
const RecRow: React.FC<{ x: number; y: number; w: number; h?: number; i: number; p: number; state?: 'accepted' | 'hedge' | null; sp?: number; dim?: number }> = ({ x, y, w, h = 150, i, p, state = null, sp = 0, dim = 0 }) => {
  const { rtl, c } = useFilm();
  if (p <= 0) return null;
  const gainTone: ChipTone = i === 1 ? 'blue' : 'green';
  const costTone: ChipTone = i === 0 ? 'green' : 'amber';
  const ring = state === 'accepted' ? C.green : state === 'hedge' ? C.amber : null;
  return (
    <Card
      x={x}
      y={y}
      w={w}
      h={h}
      pad={h < 140 ? '14px 24px' : '18px 26px'}
      style={{
        opacity: Math.min(1, p * 1.3) * (1 - dim * 0.45),
        transform: `translateX(${((rtl ? 1 : -1) * (1 - p) * 120).toFixed(1)}px) scale(${mix(0.92, 1, p).toFixed(3)})`,
        boxShadow: ring && sp > 0 ? `0 0 0 ${(6 * sp).toFixed(1)}px ${ring}44, ${ELEV}` : ELEV,
        overflow: 'hidden',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
        <span style={{ fontFamily: FONT.mono, fontSize: 34, fontWeight: 600, color: '#FFFFFF', background: C.ink, borderRadius: 12, padding: '2px 14px', direction: 'ltr' }}>{`R${i + 1}`}</span>
        <span style={{ fontSize: 36, fontWeight: 700, color: C.ink, whiteSpace: 'nowrap' }}>{c.recTitles[i]}</span>
        <span style={{ flex: 1 }} />
        {state && sp > 0 && (
          <span style={{ opacity: sp, transform: `scale(${mix(1.5, 1, sp).toFixed(3)})` }}>
            <Chip tone={state === 'accepted' ? 'green' : 'amber'} icon={state === 'accepted' ? 'check' : 'shield'} size={27}>
              {state === 'accepted' ? c.accepted : c.hedge}
            </Chip>
          </span>
        )}
      </div>
      <div style={{ marginTop: h < 140 ? 8 : 14, display: 'flex', gap: 14 }}>
        <Chip tone={gainTone} icon={i === 1 ? 'shield' : 'refresh'} size={rtl ? 26 : 23}>{c.recGain[i]}</Chip>
        <Chip tone={costTone} icon={costTone === 'green' ? 'check' : 'alert'} size={rtl ? 26 : 23}>{c.recCost[i]}</Chip>
      </div>
      <Shine at={0} every={0} />
    </Card>
  );
};

export const S09: React.FC<SceneProps> = ({ s }) => {
  const f = useCurrentFrame();
  const { lang, rtl, c } = useFilm();
  const ch = captionChunks(lang, s);
  const b = ch[1] ? ch[1].from : atLine(s, 0.4);
  const at = [b - 2, Math.round(mix(b, s.vTo, 0.36)), Math.round(mix(b, s.vTo, 0.68))];
  const fxE = rtl ? 0.24 : 0.76;
  const SW = 700;
  const SH = Math.round((SW * 9) / 16);
  const rowsY = [210, 400, 590];
  return (
    <SceneCam frames={s.frames} zoom={[1, 1.035]} drift={[6, -4]}>
      <Box x={120} y={150} w={700} style={{ display: 'flex', alignItems: 'center', gap: 16, ...rise(f, 2, 18) }}>
        <Kicker size={30}>{c.recs}</Kicker>
        <Chip tone="neutral" icon="zap" size={24}>{c.recNote}</Chip>
      </Box>
      <div style={{ color: C.ink2, ...rise(f, 4, 24, 30) }}>
        <Screen
          ui="ui-treatment"
          fallback="airisks-drawer-treatment"
          x={120}
          y={280}
          w={SW}
          dur={s.frames + XFADE}
          focus={[
            [0, 1.1, fxE, 0.2],
            [b, 1.6, fxE, 0.3],
            [s.frames, 1.75, fxE, 0.32],
          ]}
          startAt={2.8}
          clipFocus={[
            [2.8, 1.1, 0.5, 0.4],
            [4.4, 1.7, rtl ? 0.18 : 0.82, 0.35],
            [7.0, 1.8, rtl ? 0.18 : 0.82, 0.45],
            [11, 1.85, rtl ? 0.18 : 0.82, 0.6],
          ]}
          shine={24}
        />
      </div>
      <svg width={1920} height={1080} style={{ position: 'absolute', inset: 0, overflow: 'visible' }}>
        {rowsY.map((y, i) => {
          const d = `M ${px(rtl, 120 + SW + 4)} ${280 + 44 + SH * 0.4} C ${px(rtl, 870)} ${280 + 44 + SH * 0.4}, ${px(rtl, 860)} ${y + 75}, ${px(rtl, 920)} ${y + 75}`;
          const p = prog(f, at[i] - 6, 14, EASE.inOut);
          return (
            <g key={i}>
              <path d={d} fill="none" stroke={C.border2} strokeWidth={2.5} strokeDasharray={`${p * 600} 600`} />
              <Stream d={d} n={2} speed={0.02} phase={i * 0.3} opacity={p} width={4} />
            </g>
          );
        })}
      </svg>
      {rowsY.map((y, i) => (
        <RecRow key={i} x={920} y={y} w={890} i={i} p={prog(f, at[i], 22, EASE.expo)} />
      ))}
      {[0, 1, 2].map((i) => (
        <div key={i} style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
          {f > at[i] + 10 && f < at[i] + 50 && (
            <Box x={920} y={rowsY[i]} w={890} h={150} style={{ borderRadius: 22, overflow: 'hidden' }}>
              <Shine at={at[i] + 10} dur={36} strength={0.6} />
            </Box>
          )}
        </div>
      ))}
    </SceneCam>
  );
};

/* ═════════════ S10 Decision ═════════════ */
export const S10: React.FC<SceneProps> = ({ s }) => {
  const f = useCurrentFrame();
  const { lang, c } = useFilm();
  const ch = captionChunks(lang, s);
  const b = ch[1] ? ch[1].from : atLine(s, 0.55);
  const a1 = Math.round(atLine(s, 0.24));
  const a3 = Math.round(atLine(s, 0.32));
  const h2 = Math.round(atLine(s, 0.44));
  const stampAt = Math.round(atLine(s, 0.5));
  const condAt = Math.round(mix(b, s.vTo, 0.4));
  const pm = pickBroll('pm-approve', 'engineer');
  return (
    <SceneCam frames={s.frames} zoom={[1, 1.035]} drift={[-6, -4]}>
      <AbsoluteFill style={{ transform: shake(f, stampAt, 8) }}>
        <Box x={120} y={140} w={780}>
          <div style={{ fontSize: 64, fontWeight: 700, color: C.ink, lineHeight: 1.2 }}>
            <Words text={c.humanDecides} at={s.vFrom - 4} per={4} dur={18} />
          </div>
        </Box>
        <div style={rise(f, 4, 22, 30)}>
          <BrollFrame src={brollFile(pm)} x={120} y={240} w={780} h={420} from={0} dur={s.frames + XFADE} tag={c.aiFootage} scale={[1.02, 1.12]} />
        </div>
        {/* PM card over the footage */}
        <Box x={150} y={584} w={520} style={{ ...rise(f, a1 - 10, 20, 20) }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '14px 20px', borderRadius: 20, background: '#FFFFFF', border: `1.5px solid ${C.border}`, boxShadow: ELEV }}>
            <span style={{ width: 64, height: 64, borderRadius: 99, background: METAL, display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>
              <span style={{ width: 58, height: 58, borderRadius: 99, background: '#FFFFFF', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Icon name="user" size={36} color={C.ink} />
              </span>
            </span>
            <div>
              <div style={{ fontSize: 30, fontWeight: 700, color: C.ink }}>{c.pm}</div>
              <div style={{ fontSize: 24, fontWeight: 500, color: C.ink2 }}>{c.pmName}</div>
            </div>
          </div>
        </Box>
        {[0, 1, 2].map((i) => (
          <RecRow key={i} x={960} y={140 + i * 140} w={850} h={128} i={i} p={prog(f, 2 + i * 4, 18, EASE.expo)} state={i === 1 ? 'hedge' : 'accepted'} sp={prog(f, [a1, h2, a3][i], 14, EASE.expo)} dim={i === 1 ? prog(f, h2, 14) * 0.6 : 0} />
        ))}
        <DecisionStamp at={stampAt} lines={c.decision} style={{ top: 566, insetInlineStart: 1130 }} />
        {/* recorded reason + condition */}
        <Card x={960} y={704} w={850} pad="14px 24px" style={{ ...rise(f, b - 6, 20, 24) }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 26, fontWeight: 650, color: C.accentText }}>
            <Icon name="doc" size={28} color={C.accentText} />
            {c.reason}
            <span style={{ flex: 1 }} />
            <Mono size={22} color={C.ink3}>10:05</Mono>
          </div>
          <div style={{ marginTop: 4, fontSize: 25, fontWeight: 500, color: C.ink, lineHeight: 1.42 }}>
            <Words text={c.reasonText} at={b} per={1} dur={10} dist={8} />
          </div>
        </Card>
        <Box x={120} y={724} w={780} style={{ ...rise(f, condAt, 20, 20) }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 16, padding: '14px 22px', borderRadius: 18, background: '#FFF5DE', border: `2px solid ${C.amber}`, boxShadow: ELEV }}>
            <IconTile name="shield" size={58} tone="amber" />
            <div>
              <div style={{ fontSize: 22, fontWeight: 700, color: C.amberText }}>{c.conditionLabel}</div>
              <div style={{ fontSize: 31, fontWeight: 700, color: C.ink }}>{c.condition}</div>
            </div>
          </div>
        </Box>
      </AbsoluteFill>
    </SceneCam>
  );
};

/* ═════════════ S11 Tasks ═════════════ */
export const S11: React.FC<SceneProps> = ({ s }) => {
  const f = useCurrentFrame();
  const { lang, rtl, c } = useFilm();
  const ch = captionChunks(lang, s);
  const b = ch[1] ? ch[1].from : atLine(s, 0.5);
  const drop = (i: number) => Math.round(mix(s.vFrom, b - 6, i / 6));
  const back = prog(f, b + 4, Math.max(30, s.vTo - b - 10), EASE.inOut);
  const delay = mix(28, 4, back);
  const CW = 390;
  const GX = 20;
  const X = (d: number) => px(rtl, 500 + d * 16);
  return (
    <SceneCam frames={s.frames} zoom={[1, 1.03]} drift={[-6, -4]}>
      <Box x={120} y={140} w={1200} style={{ display: 'flex', alignItems: 'center', gap: 16, ...rise(f, 0, 18) }}>
        <Kicker size={30}>{c.tasks}</Kicker>
      </Box>
      {c.taskTitles.map((t, i) => (
        <TaskCard key={i} x={120 + (i % 3) * (CW + GX)} y={200 + Math.floor(i / 3) * 176} w={CW} h={160} id={`TSK-${410 + i}`} title={t} owner={c.taskOwners[i]} due={c.taskDue[i]} p={prog(f, drop(i), 18, EASE.expo)} />
      ))}
      <div style={{ color: C.ink2, ...rise(f, 6, 24, 30) }}>
        <Screen
          ui="ui-tasks"
          fallback="tasks-after"
          x={1370}
          y={240}
          w={450}
          dur={s.frames + XFADE}
          focus={[
            [0, 1.25, 0.5, 0.45],
            [s.frames, 1.6, rtl ? 0.7 : 0.3, 0.55],
          ]}
          startAt={2.5}
          clipFocus={[
            [2.5, 1.1, 0.5, 0.4],
            [4.0, 1.4, 0.55, 0.5],
            [6.2, 1.7, rtl ? 0.18 : 0.82, 0.4],
            [11, 1.75, rtl ? 0.18 : 0.82, 0.55],
          ]}
          shine={30}
        />
      </div>
      <Box x={1370} y={560} w={450} style={{ ...rise(f, drop(5) + 6, 16) }}>
        <Chip tone="neutral" icon="link" size={22}>{c.writeback}</Chip>
      </Box>
      {/* forecast delay strip */}
      <Card x={120} y={600} w={1210} h={250} pad="22px 30px" style={{ ...rise(f, b - 10, 20, 24) }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 30 }}>
          <div style={{ width: 300, flex: 'none' }}>
            <div style={{ fontSize: 28, fontWeight: 600, color: C.ink2 }}>{c.forecastDelay}</div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
              <span style={{ fontSize: 110, fontWeight: 700, lineHeight: 1.05, color: back > 0.6 ? C.greenText : C.redText }}>
                <bdi dir="ltr">{Math.round(delay)}</bdi>
              </span>
              <span style={{ fontSize: 34, fontWeight: 600, color: C.ink2 }}>{Math.round(delay) <= 10 ? c.daysUnit : c.dayUnit}</span>
            </div>
          </div>
          <div style={{ flex: 1 }} />
        </div>
      </Card>
      <svg width={1920} height={1080} style={{ position: 'absolute', inset: 0, overflow: 'visible', opacity: prog(f, b - 6, 16) }}>
        <line x1={X(0)} y1={672} x2={X(0)} y2={800} stroke={C.primary} strokeWidth={2.5} strokeDasharray="6 6" />
      </svg>
      <div style={{ position: 'absolute', top: 690, left: Math.min(X(0), X(40)), width: Math.abs(X(40) - X(0)), height: 1, opacity: prog(f, b - 6, 16) }} />
      {(() => {
        const xa = X(delay);
        const xb = X(delay + 20);
        const l = Math.min(xa, xb);
        return (
          <>
            <div style={{ position: 'absolute', top: 700, left: Math.min(X(0), X(20)), width: Math.abs(X(20) - X(0)), height: 64, borderRadius: 14, border: `2.5px dashed ${C.ink3}`, boxSizing: 'border-box', opacity: 0.5 * prog(f, b - 6, 16) }} />
            <div style={{ position: 'absolute', top: 700, left: l, width: Math.abs(xb - xa), height: 64, borderRadius: 14, background: back > 0.6 ? `linear-gradient(180deg, ${C.green}, #087E08)` : `linear-gradient(180deg, ${C.red}, #A92B2B)`, boxShadow: '0 12px 26px -14px rgba(19,34,56,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 28, fontWeight: 650, opacity: prog(f, b - 6, 16), overflow: 'hidden' }}>
              <Mono size={28} color="#FFFFFF" weight={600}>A1100</Mono>
              <Shine at={b + 4} every={90} strength={0.45} />
            </div>
            <div style={{ position: 'absolute', top: 776, left: X(0), transform: 'translateX(-50%)', fontSize: 24, fontWeight: 600, color: C.ink2, opacity: prog(f, b - 6, 16), whiteSpace: 'nowrap' }}>{c.baseline}</div>
          </>
        );
      })()}
    </SceneCam>
  );
};

/* ═════════════ S12 Closure ═════════════ */
export const S12: React.FC<SceneProps> = ({ s }) => {
  const f = useCurrentFrame();
  const { lang, c } = useFilm();
  const ch = captionChunks(lang, s);
  const b = ch[1] ? ch[1].from : atLine(s, 0.6);
  const itemAt = [Math.round(atLine(s, 0.3)), Math.round(atLine(s, 0.4)), Math.round(atLine(s, 0.5)), b + 8, Math.round(mix(b, s.vTo, 0.62))];
  const sealAt = Math.round(atLine(s, 0.62));
  const insp = pickBroll('facade-inspect', 'cam360-floor');
  return (
    <SceneCam frames={s.frames} zoom={[1, 1.03]} drift={[-6, -6]}>
      <ChecklistSeal x={110} y={140} w={1090} itemAt={itemAt} sealAt={sealAt} sealX={1530} sealY={370} sealR={200} />
      <div style={rise(f, b - 10, 22, 30)}>
        <BrollFrame src={brollFile(insp)} x={1290} y={610} w={500} h={240} from={b - 10} dur={s.frames + XFADE - b + 10} tag={c.aiFootage} scale={[1.02, 1.12]} />
      </div>
      {/* audit trail */}
      <Box x={110} y={720} w={1090} style={{ display: 'flex', alignItems: 'center', gap: 12, ...rise(f, s.vFrom, 18) }}>
        <span style={{ fontSize: 24, fontWeight: 700, color: C.ink2, whiteSpace: 'nowrap', marginInlineEnd: 6 }}>{c.audit}</span>
        {c.auditItems.map(([t, l], i) => {
          const p = prog(f, s.vFrom + 6 + i * 12, 16, EASE.out);
          return (
            <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderRadius: 12, background: '#FFFFFF', border: `1.5px solid ${C.border}`, opacity: p, transform: `translateY(${((1 - p) * 12).toFixed(1)}px)`, fontSize: 21, color: C.ink2, whiteSpace: 'nowrap' }}>
              <Mono size={20} color={C.primaryText} weight={600}>{t}</Mono>
              {l}
            </span>
          );
        })}
      </Box>
    </SceneCam>
  );
};

export { Stream, keys };
