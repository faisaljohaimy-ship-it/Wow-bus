/**
 * Film v2, act 1 — the case (S01–S06): hook on AI footage, the tower, the approval, supply, schedule, ripple.
 * Every scene is a pure function of its local frame; beats are tied to the voice (atLine / caption chunks).
 */
import React from 'react';
import { AbsoluteFill, staticFile, useCurrentFrame } from 'remotion';
import { Emblem } from '../components/Emblem';
import { mix, prog } from '../lib/anim';
import { C, EASE, ELEV, FONT, METAL } from '../theme';
import { captionChunks } from './captions';
import { Clip, Count, FocusRing, FootageTag, LB, Letterbox, LowShade, SceneCam, Screen, Shine, Stream, WarmGrade, shake } from './fx';
import { BrollFrame, Box, Card, Chip, Icon, IconTile, Kicker, Mono, Ring, Stamp, Words, metalBorder, px, rise, useFilm } from './kit';
import { brollFile, pickBroll } from './media';
import { Chain, DayRuler, Flag, GanttBar, SubmittalCard, dayScale } from './parts';
import { atLine, XFADE, type SceneTiming } from './timeline';

export type SceneProps = { s: SceneTiming };
const B = (n: Parameters<typeof brollFile>[0]) => staticFile(brollFile(n));

/* ═════════════ S01 Hook ═════════════ */
export const S01: React.FC<SceneProps> = ({ s }) => {
  const f = useCurrentFrame();
  const { lang, rtl, c } = useFilm();
  const ch = captionChunks(lang, s);
  const end = s.frames + XFADE;
  const cut = Math.round(atLine(s, 0.4));
  const bar = mix(420, LB, prog(f, 0, 64, EASE.cam)) * (1 - prog(f, s.frames - 40, 40, EASE.inOut));
  const lift = 1 - prog(f, 0, 22, EASE.out);
  const xd = prog(f, cut - 6, 16, EASE.inOut);
  const flash = Math.sin(Math.PI * prog(f, cut - 8, 22, EASE.inOut));
  // headline (music intro → first words)
  const hOut = 1 - prog(f, cut - 4, 14, EASE.inOut);
  const ul = prog(f, 96, 30, EASE.inOut);
  // chain on the aerial
  const n0 = cut + 6;
  const nodeIn = [0, 1, 2, 3, 4].map((i) => prog(f, n0 + i * 5, 18, EASE.expo));
  const linkIn = [0, 1, 2, 3].map((i) => prog(f, n0 + 10 + i * 5, 14, EASE.inOut));
  const dom = ch[1] ? ch[1].from - 6 : atLine(s, 0.6);
  const lit = [0, 1, 2, 3, 4].map((i) => (i < 3 ? prog(f, dom + i * 13, 10, EASE.out) : 0));
  const pulse = f > dom - 10 ? Math.min(0.66, prog(f, dom - 10, 52, EASE.inOut) * 0.66) : null;
  const shield = prog(f, dom + 44, 20, EASE.expo);
  const W = 284;
  const G = 74;
  const X0 = (1920 - (5 * W + 4 * G)) / 2;
  const CY = 600;
  const shieldX = X0 + 3 * W + 2 * G + G / 2; // between cost and safety (logical)
  const sub = prog(f, dom + 56, 22, EASE.out);
  return (
    <AbsoluteFill style={{ background: '#05070B', overflow: 'hidden' }}>
      <Clip src={B('facade-lift')} from={0} dur={cut + 12} scale={[1.0, 1.1]} drift={[-40, -10]} origin="45% 40%" />
      <Clip src={B('aerial')} from={cut - 8} dur={end - cut + 8} opacity={xd} scale={[1.04, 1.12]} drift={[30, -14]} origin="50% 40%" />
      <WarmGrade />
      <LowShade k={0.9} />
      <AbsoluteFill style={{ background: 'radial-gradient(70% 55% at 50% 46%, rgba(255,190,120,0.55), rgba(255,140,60,0) 70%)', opacity: 0.55 * flash }} />
      {/* headline over the façade lift */}
      <AbsoluteFill style={{ opacity: hOut, background: 'radial-gradient(900px 420px at 50% 44%, rgba(14,9,5,0.55), rgba(14,9,5,0) 100%)' }} />
      <div style={{ position: 'absolute', left: 0, right: 0, top: 330, textAlign: 'center', opacity: hOut, transform: `scale(${mix(1, 1.04, prog(f, 30, cut, EASE.soft)).toFixed(4)})` }}>
        <div style={{ fontSize: 104, fontWeight: 700, color: '#FFFFFF', lineHeight: 1.25, textShadow: '0 4px 28px rgba(0,0,0,0.45)' }}>
          <Words text={c.hook[0]} at={34} per={5} dur={20} dist={30} />
        </div>
        <div style={{ position: 'relative', display: 'inline-block', marginTop: 6, fontSize: 104, fontWeight: 700, lineHeight: 1.3 }}>
          <span style={{ background: 'linear-gradient(180deg, #FFE2C2 0%, #FFB46A 45%, #F08A2E 100%)', WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' }}>
            <Words text={c.hook[1]} at={62} per={6} dur={20} dist={30} />
          </span>
          <span style={{ position: 'absolute', insetInlineStart: 0, bottom: -6, height: 6, width: `${(ul * 100).toFixed(1)}%`, borderRadius: 3, background: METAL, boxShadow: '0 0 18px rgba(255,120,30,0.8)' }} />
        </div>
      </div>
      {/* chain on the aerial */}
      {f >= n0 - 2 && (
        <>
          <AbsoluteFill style={{ background: 'radial-gradient(1000px 360px at 50% 40%, rgba(14,9,5,0.5), rgba(14,9,5,0) 100%)', opacity: prog(f, dom - 14, 20) }} />
          <div style={{ position: 'absolute', left: 0, right: 0, top: 360, textAlign: 'center', fontSize: 64, fontWeight: 700, color: '#FFFFFF', textShadow: '0 3px 22px rgba(0,0,0,0.55)' }}>
            <Words text={c.hookSub} at={dom - 12} per={4} dur={18} dist={22} />
          </div>
          <Chain x0={X0} y={CY} w={W} gap={G} nodeIn={nodeIn} linkIn={linkIn} lit={lit} litTone={[C.red, C.red, C.red, C.orange, C.orange]} pulse={pulse} onDark />
          {shield > 0 && (
            <div style={{ position: 'absolute', left: px(rtl, shieldX) - 54, top: CY + 46 - 54, width: 108, height: 108, borderRadius: 30, ...metalBorder('#FFFFFF', 3), display: 'flex', alignItems: 'center', justifyContent: 'center', transform: `scale(${mix(1.8, 1, shield).toFixed(3)})`, opacity: Math.min(1, shield * 1.5), boxShadow: `0 0 0 ${(14 * (1 - shield)).toFixed(1)}px rgba(255,140,40,0.35), 0 18px 40px -10px rgba(0,0,0,0.6)` }}>
              <Emblem size={72} id="s1shield" />
            </div>
          )}
          <div style={{ position: 'absolute', left: 0, right: 0, top: CY + 130, display: 'flex', justifyContent: 'center', ...{ opacity: sub, transform: `translateY(${((1 - sub) * 16).toFixed(1)}px)` } }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 14, padding: '10px 26px', borderRadius: 999, background: 'rgba(8,14,26,0.55)', border: '1.5px solid rgba(255,194,127,0.6)', color: '#FFE2C2', fontSize: 34, fontWeight: 600 }}>
              <Icon name="shield" size={34} color="#FFC27F" />
              {c.stopped}
            </span>
          </div>
        </>
      )}
      <AbsoluteFill style={{ background: '#000', opacity: lift }} />
      <Letterbox bar={bar} />
      <FootageTag text={c.aiFootage} opacity={prog(f, 20, 20, EASE.out) * (1 - prog(f, s.frames - 30, 20, EASE.inOut))} top={Math.max(24, bar / 2 - 21)} />
    </AbsoluteFill>
  );
};

/* ═════════════ S02 Context: the tower ═════════════ */
const Tower: React.FC<{ at: number }> = ({ at }) => {
  const f = useCurrentFrame();
  const { rtl, c } = useFilm();
  const N = 38;
  const fh = 14.5;
  const W = 200;
  const X = 50;
  const base = 690;
  const scan = ((f - at - 80) % 110) / 110;
  const craneA = Math.sin((f - at) / 40) * 9;
  const bayW = W / 6;
  const lo = base - 15 * fh;
  const hi = base - 7 * fh;
  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      <svg width={420} height={760} viewBox="0 0 420 760" style={{ position: 'absolute', left: 0, top: 0, overflow: 'visible', transform: rtl ? 'scaleX(-1)' : undefined }}>
        <defs>
          <linearGradient id="tw-glass" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#CFE0FA" />
            <stop offset="0.5" stopColor="#9DBDF0" />
            <stop offset="1" stopColor="#6E95D8" />
          </linearGradient>
          <linearGradient id="tw-scan" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#FF8A2E" stopOpacity={0} />
            <stop offset="0.5" stopColor="#FF8A2E" stopOpacity={0.55} />
            <stop offset="1" stopColor="#FF8A2E" stopOpacity={0} />
          </linearGradient>
        </defs>
        <rect x={X - 40} y={base} width={W + 80} height={6} rx={3} fill={C.ink} opacity={0.75} />
        {Array.from({ length: N }, (_, i) => {
          const p = prog(f, at + i * 1.6, 10, EASE.out);
          if (p <= 0) return null;
          const y = base - (i + 1) * fh;
          const gap = i + 1 >= 8 && i + 1 <= 15;
          return (
            <g key={i} opacity={p}>
              <rect x={X} y={y} width={W} height={fh} fill={gap ? '#FFFFFF' : 'url(#tw-glass)'} stroke={C.ink} strokeOpacity={0.55} strokeWidth={1} />
              {Array.from({ length: 5 }, (_, k) => (
                <line key={k} x1={X + bayW * (k + 1)} y1={y} x2={X + bayW * (k + 1)} y2={y + fh} stroke={gap ? C.orange : '#FFFFFF'} strokeOpacity={gap ? 0.8 : 0.55} strokeWidth={gap ? 1.4 : 1} strokeDasharray={gap ? '3 3' : undefined} />
              ))}
            </g>
          );
        })}
        {/* empty façade bays, floors 8–15 */}
        {prog(f, at + 26, 1) > 0 && (
          <rect x={X - 4} y={lo - 2} width={W + 8} height={hi - lo + 4} fill="rgba(236,131,90,0.10)" stroke={C.orange} strokeWidth={3} strokeDasharray="10 6" strokeDashoffset={-f * 0.8} opacity={0.6 + 0.4 * Math.sin((f - at) / 9) ** 2} />
        )}
        {/* core + crane */}
        {prog(f, at + 60, 1) > 0 && (
          <g opacity={prog(f, at + 60, 16)}>
            <rect x={X + W / 2 - 6} y={base - N * fh - 120} width={12} height={120} fill={C.ink} opacity={0.8} />
            <g transform={`rotate(${craneA} ${X + W / 2} ${base - N * fh - 116})`}>
              <rect x={X + W / 2 - 150} y={base - N * fh - 122} width={240} height={8} fill={C.gold} />
              <line x1={X + W / 2 + 70} y1={base - N * fh - 114} x2={X + W / 2 + 70} y2={base - N * fh - 60 + 10 * Math.sin((f - at) / 22)} stroke={C.ink} strokeWidth={1.4} />
              <rect x={X + W / 2 + 58} y={base - N * fh - 62 + 10 * Math.sin((f - at) / 22)} width={24} height={14} fill={C.orange} />
            </g>
          </g>
        )}
        {/* scanning laser */}
        {f > at + 80 && <rect x={X - 16} y={base - N * fh + (1 - scan) * N * fh - 30} width={W + 32} height={60} fill="url(#tw-scan)" />}
      </svg>
      {/* bracket + labels (HTML, never mirrored) */}
      <div style={{ position: 'absolute', top: lo - 6, insetInlineStart: X + W + 22, height: hi - lo + 12, width: 16, borderTop: `3px solid ${C.orange}`, borderBottom: `3px solid ${C.orange}`, borderInlineEnd: `3px solid ${C.orange}`, opacity: prog(f, at + 40, 14) }} />
      <div style={{ position: 'absolute', top: (lo + hi) / 2 - 24, insetInlineStart: X + W + 52, opacity: prog(f, at + 44, 16), whiteSpace: 'nowrap' }}>
        <Chip tone="orange" size={26}>{c.facadeZone}</Chip>
      </div>
      <div style={{ position: 'absolute', top: base + 18, insetInlineStart: X + 10, ...rise(f, at + 30, 20, 30) }}>
        <Chip tone="blue" icon="pin" size={30}>{c.riyadh}</Chip>
      </div>
    </div>
  );
};

const Hourglass: React.FC<{ size: number; color?: string; phase?: number }> = ({ size, color = C.amberText, phase = 0 }) => {
  const f = useCurrentFrame();
  const T = 90;
  const t = ((f + phase) % T) / T;
  const flip = prog(t * T, T - 14, 14, EASE.inOut) * 180;
  const top = 1 - Math.min(1, t / 0.84);
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" style={{ display: 'block', flex: 'none' }}>
      <g transform={`rotate(${flip} 20 20)`}>
        <path d="M10 4h20 M10 36h20 M12 4c0 9 16 9 16 16S12 27 12 36 M28 4c0 9-16 9-16 16s16 7 16 16" fill="none" stroke={color} strokeWidth={2.2} strokeLinecap="round" />
        <path d={`M${20 - 7 * top} ${19 - 9 * top} L${20 + 7 * top} ${19 - 9 * top} L20 19 Z`} fill={color} opacity={0.75} />
        <path d={`M${20 - 7 * (1 - top)} 34 L${20 + 7 * (1 - top)} 34 L20 ${34 - 10 * (1 - top)} Z`} fill={color} opacity={0.75} />
        {t < 0.84 && <line x1={20} y1={20} x2={20} y2={33} stroke={color} strokeWidth={1.2} strokeDasharray="1.5 2.5" strokeDashoffset={-f} />}
      </g>
    </svg>
  );
};

export const S02: React.FC<SceneProps> = ({ s }) => {
  const f = useCurrentFrame();
  const { lang, rtl, c } = useFilm();
  const ch = captionChunks(lang, s);
  const a = s.vFrom - 6;
  const b = ch[1] ? ch[1].from : atLine(s, 0.5);
  const lockAt = b + Math.round((s.vTo - b) * 0.45);
  const fac = pickBroll('factory-line', 'facade-lift');
  const wig = f > lockAt + 12 ? Math.sin((f - lockAt) / 2.2) * 6 * Math.exp(-((f - lockAt - 12) % 75) / 10) : 0;
  return (
    <SceneCam frames={s.frames} zoom={[1, 1.04]} drift={[-14, -6]}>
      <Box x={110} y={150} w={460} h={760}>
        <Tower at={6} />
      </Box>
      <Box x={760} y={150} w={1050}>
        <div style={rise(f, a, 18)}>
          <Kicker size={30}>{c.example}</Kicker>
        </div>
        <div style={{ marginTop: 14, fontSize: 88, fontWeight: 700, color: C.ink, lineHeight: 1.2 }}>
          <Words text={c.project} at={a + 6} per={4} dur={18} />
        </div>
        <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 18, fontSize: 44, fontWeight: 500, color: C.ink2, ...rise(f, a + 22, 18) }}>
          <Icon name="building" size={44} color={C.ink2} />
          <span>{c.floors}</span>
          <span style={{ width: 8, height: 8, borderRadius: 9, background: C.border2 }} />
          <span>{c.riyadh}</span>
        </div>
      </Box>
      {/* panels ready (AI footage of the production line) */}
      <Card x={760} y={470} w={500} h={372} pad={0} style={{ overflow: 'hidden', ...rise(f, b - 4, 22, 40) }}>
        <div style={{ position: 'relative', height: 236, overflow: 'hidden', borderRadius: '20px 20px 0 0' }}>
          <BrollFrame src={brollFile(fac)} x={-4} y={-4} w={508} h={244} from={b - 4} dur={s.frames + XFADE - b + 4} tag={c.aiFootage} r={0} scale={[1.02, 1.12]} />
        </div>
        <div style={{ padding: '18px 26px', display: 'flex', alignItems: 'center', gap: 16 }}>
          <IconTile name="crate" size={60} tone="green" />
          <div>
            <div style={{ fontSize: 32, fontWeight: 650, color: C.ink, lineHeight: 1.3 }}>{c.panels}</div>
            <div style={{ marginTop: 6 }}>
              <Chip tone="green" icon="check" size={26}>{c.ready}</Chip>
            </div>
          </div>
        </div>
      </Card>
      {/* link between: ready ≠ approved */}
      <svg width={1920} height={1080} style={{ position: 'absolute', inset: 0, overflow: 'visible' }}>
        <Stream d={`M ${px(rtl, 1264)} 650 L ${px(rtl, 1300)} 650`} n={2} speed={0.03} opacity={prog(f, lockAt, 10)} />
      </svg>
      <Card x={1300} y={470} w={510} h={372} comet style={{ ...rise(f, lockAt - 6, 22, 40) }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 170, position: 'relative' }}>
          <div style={{ position: 'absolute', width: 150, height: 150, borderRadius: 99, border: `3px dashed ${C.amber}`, transform: `rotate(${(f * 1.2).toFixed(1)}deg)`, opacity: 0.7 }} />
          <div style={{ transform: `rotate(${wig.toFixed(2)}deg)` }}>
            <IconTile name="lock" size={110} tone="amber" />
          </div>
        </div>
        <div style={{ marginTop: 16, fontSize: 36, fontWeight: 700, color: C.ink }}>{c.glassApproval}</div>
        <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 12 }}>
          <Chip tone="amber" size={28} dot>{c.pendingConsultant}</Chip>
          <Hourglass size={40} />
        </div>
      </Card>
    </SceneCam>
  );
};

/* ═════════════ S03 The approval ═════════════ */
export const S03: React.FC<SceneProps> = ({ s }) => {
  const f = useCurrentFrame();
  const { lang, rtl, c } = useFilm();
  const ch = captionChunks(lang, s);
  const stampAt = Math.round(atLine(s, 0.2));
  const b = ch[1] ? ch[1].from : atLine(s, 0.45);
  const back = prog(f, b - 18, 26, EASE.inOut);
  const r1 = prog(f, b - 6, 24, EASE.expo);
  const co = prog(f, b + 40, 22, EASE.expo);
  const link = prog(f, b + 30, 22, EASE.inOut);
  const days = Math.round(atLine(s, 0.86));
  return (
    <SceneCam frames={s.frames} zoom={[1, 1.035]} drift={[10, -4]}>
      <AbsoluteFill style={{ transform: shake(f, stampAt, 12) }}>
        {/* Rev 0 */}
        <div style={{ position: 'absolute', inset: 0, opacity: mix(1, 0.55, back), transform: `translate(${((rtl ? 1 : -1) * 60 * back).toFixed(1)}px, ${(-70 * back).toFixed(1)}px) scale(${mix(1, 0.84, back).toFixed(4)})`, transformOrigin: rtl ? '85% 20%' : '15% 20%' }}>
          <div style={rise(f, 4, 22, 40)}>
            <SubmittalCard x={150} y={170} w={800} h={330} rev={c.rev0}>
              <div style={{ marginTop: 18, display: 'flex', alignItems: 'center', gap: 14, fontSize: 28, color: C.ink2 }}>
                <Icon name="user" size={30} color={C.ink3} />
                <span>{lang === 'ar' ? 'الاستشاري' : 'Consultant'}</span>
              </div>
            </SubmittalCard>
          </div>
          <Stamp at={stampAt} color={C.redText} rotate={-9} size={48} style={{ top: 330, insetInlineStart: 520 }}>
            <span style={{ fontFamily: FONT.mono, marginInlineEnd: 16 }}>{c.codeC[0]}</span>
            {c.codeC[1]}
          </Stamp>
        </div>
        {/* Rev 1 */}
        {r1 > 0 && (
          <div style={{ position: 'absolute', inset: 0, opacity: r1, transform: `translate(${((rtl ? -1 : 1) * (1 - r1) * 160).toFixed(1)}px, 0)` }}>
            <SubmittalCard x={230} y={420} w={840} h={400} rev={c.rev1} style={{ boxShadow: `0 0 0 ${(6 * Math.sin(f / 10) ** 2).toFixed(1)}px rgba(250,178,25,0.25), ${ELEV}` }}>
              <div style={{ marginTop: 22, display: 'flex', alignItems: 'center', gap: 30 }}>
                <Ring size={150} value={12} max={14} color={C.amber} width={14} draw={prog(f, b + 6, 34, EASE.out)}>
                  <Mono size={38} color={C.ink} weight={600}>{`${Math.round(mix(0, 12, prog(f, b + 6, 34, EASE.out)))}/14`}</Mono>
                </Ring>
                <div>
                  <div style={{ fontSize: 30, color: C.ink2, fontWeight: 500 }}>{c.reviewDays}</div>
                  <div style={{ marginTop: 12 }}>
                    <Chip tone="amber" size={32} dot>{c.pending}</Chip>
                  </div>
                </div>
              </div>
              <Shine at={b + 20} every={120} />
            </SubmittalCard>
          </div>
        )}
        {/* dotted link → CO-034 */}
        <svg width={1920} height={1080} style={{ position: 'absolute', inset: 0, overflow: 'visible' }}>
          {link > 0 && (
            <>
              <path d={`M ${px(rtl, 1070)} 620 C ${px(rtl, 1140)} 620, ${px(rtl, 1140)} 520, ${px(rtl, 1200)} 520`} fill="none" stroke={C.amber} strokeWidth={3.5} strokeDasharray="2 10" strokeLinecap="round" strokeDashoffset={-f * 0.7} opacity={link} />
              <Stream d={`M ${px(rtl, 1070)} 620 C ${px(rtl, 1140)} 620, ${px(rtl, 1140)} 520, ${px(rtl, 1200)} 520`} n={2} speed={0.02} color="#E8A010" opacity={link} />
            </>
          )}
        </svg>
        {co > 0 && (
          <Card x={1200} y={330} w={590} h={400} comet style={{ opacity: co, transform: `translateY(${((1 - co) * 40).toFixed(1)}px) scale(${mix(0.94, 1, co).toFixed(3)})` }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <IconTile name="contract" size={60} tone="orange" />
              <div>
                <div style={{ fontSize: 28, color: C.ink2, fontWeight: 600 }}>{c.co}</div>
                <Mono size={28} color={C.orangeText} weight={600}>CO-034</Mono>
              </div>
            </div>
            <div style={{ marginTop: 20, fontSize: 38, fontWeight: 700, color: C.ink, lineHeight: 1.3 }}>{c.coTitle}</div>
            <div style={{ marginTop: 10, fontSize: 30, color: C.ink2 }}>{c.coWait}</div>
            <div style={{ marginTop: 22, display: 'flex', alignItems: 'center', gap: 16 }}>
              <Hourglass size={64} phase={20} />
              <span style={{ fontSize: 30, color: C.ink2, fontWeight: 600 }}>{c.pendingFor}</span>
              <span style={{ fontSize: 60, fontWeight: 700, color: C.amberText, lineHeight: 1 }}>
                <Count to={16} at={days - 24} dur={30} />
              </span>
              <span style={{ fontSize: 30, color: C.ink2, fontWeight: 600 }}>{c.days}</span>
            </div>
          </Card>
        )}
      </AbsoluteFill>
    </SceneCam>
  );
};

/* ═════════════ S04 Supply ═════════════ */
export const S04: React.FC<SceneProps> = ({ s }) => {
  const f = useCurrentFrame();
  const { lang, rtl, c } = useFilm();
  const ch = captionChunks(lang, s);
  const b = ch[1] ? ch[1].from : atLine(s, 0.55);
  const X = dayScale(rtl, 150, 1770, -40, 120);
  const RY = 560;
  const ruler = prog(f, 2, 34, EASE.inOut);
  const lead = prog(f, atLine(s, 0.06), 42, EASE.inOut);
  const pin = prog(f, atLine(s, 0.36), 18, EASE.expo);
  const rule = prog(f, atLine(s, 0.48), 20, EASE.out);
  const slotFlag = prog(f, b + 10, 18, EASE.expo);
  const xa = X(-14);
  const xb = X(96);
  const today = X(0);
  const pulse = 0.5 + 0.5 * Math.sin(f / 7);
  const fac = pickBroll('factory-line', 'facade-lift');
  return (
    <SceneCam frames={s.frames} zoom={[1, 1.03]} drift={[-12, 0]}>
      <Box x={150} y={150} w={1000}>
        <div style={rise(f, 0, 18)}>
          <Kicker size={30}>{c.chain[1]}</Kicker>
        </div>
      </Box>
      {/* today column */}
      <div style={{ position: 'absolute', left: today - 1.5, top: 250, width: 3, height: RY - 250, background: `linear-gradient(180deg, rgba(47,111,237,0), ${C.primary})`, opacity: ruler }} />
      <div style={{ position: 'absolute', left: today, top: RY, width: 22, height: 22, marginLeft: -11, marginTop: -11, borderRadius: 99, background: C.primary, boxShadow: `0 0 0 ${(6 + 8 * pulse).toFixed(1)}px rgba(47,111,237,${(0.18 * (1 - pulse) + 0.06).toFixed(3)})`, opacity: ruler }} />
      <DayRuler X={X} y={RY} d0={-40} d1={120} step={10} label={20} draw={ruler} todayLabel={c.today} />
      {/* lead time, drawn back from the need date */}
      {lead > 0 && (
        <div style={{ position: 'absolute', top: 440, left: rtl ? xb : mix(xb, xa, lead), width: Math.abs(xb - xa) * lead, height: 70, borderRadius: 16, background: 'linear-gradient(180deg, #3D7BF0, #2557C9)', boxShadow: '0 14px 28px -16px rgba(31,90,214,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#FFFFFF', fontSize: 32, fontWeight: 650, overflow: 'hidden', whiteSpace: 'nowrap' }}>
          {lead > 0.55 ? c.leadTime : null}
          <Shine at={atLine(s, 0.06) + 44} every={140} strength={0.4} />
        </div>
      )}
      <Flag x={xb} top={300} stemTo={RY} tone={C.primary} p={prog(f, atLine(s, 0.02), 16, EASE.out)}>
        <Chip tone="blue" icon="calendar" size={28}>
          {c.needDate} <Mono size={24} color={C.primaryText} weight={600}>+96</Mono>
        </Chip>
      </Flag>
      {/* the passed PO date */}
      {pin > 0 && (
        <div style={{ position: 'absolute', top: 440, left: Math.min(xa, today), width: Math.abs(today - xa), height: 70, borderRadius: 12, background: 'repeating-linear-gradient(135deg, rgba(208,59,59,0.22) 0 10px, rgba(208,59,59,0.06) 10px 20px)', border: `2px solid ${C.red}`, opacity: pin }} />
      )}
      <Flag x={xa} top={252} stemTo={RY} tone={C.red} p={pin} align={rtl ? 'start' : 'end'}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: rtl ? 'flex-start' : 'flex-end', gap: 8 }}>
          <Chip tone="red" icon="alert" size={30}>{c.orderBy}</Chip>
          <span style={{ fontSize: 30, fontWeight: 700, color: C.redText }}>{c.passed}</span>
        </div>
      </Flag>
      <Flag x={X(14)} top={330} stemTo={RY} tone={C.amberText} p={slotFlag} align={rtl ? 'end' : 'start'}>
        <Chip tone="amber" icon="factory" size={26}>{c.slotEnd} · {lang === 'ar' ? '24 نوفمبر' : '24 Nov'}</Chip>
      </Flag>
      {/* rule */}
      <Box x={150} y={640} w={1640} style={{ display: 'flex', justifyContent: 'center', ...rise(f, atLine(s, 0.48), 20) }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 18, padding: '10px 26px', borderRadius: 16, background: '#FFFFFF', border: `1.5px solid ${C.border}`, boxShadow: ELEV, fontSize: 30, color: C.ink2, fontWeight: 500, opacity: rule }}>
          {c.rule}
          <Mono size={30} color={C.redText} weight={600}>{c.ruleNum}</Mono>
        </span>
      </Box>
      {/* PO blocked + production slot */}
      <Card x={150} y={720} w={640} h={128} pad="20px 26px" style={{ ...rise(f, atLine(s, 0.42), 22, 30), display: 'flex', alignItems: 'center', gap: 18 }}>
        <div style={{ transform: `rotate(${(f > atLine(s, 0.5) ? Math.sin(f / 2.5) * 5 * Math.exp(-((f - atLine(s, 0.5)) % 70) / 9) : 0).toFixed(2)}deg)` }}>
          <IconTile name="lock" size={74} tone="red" />
        </div>
        <div>
          <div style={{ fontSize: 32, fontWeight: 650, color: C.ink }}>{c.po}</div>
          <div style={{ marginTop: 6 }}>
            <Chip tone="red" size={25}>{c.poBlocked}</Chip>
          </div>
        </div>
      </Card>
      <Card x={850} y={720} w={940} h={128} pad={0} comet style={{ ...rise(f, b - 4, 22, 30), overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', height: '100%' }}>
          <div style={{ position: 'relative', width: 228, height: 124, flex: 'none', overflow: 'hidden' }}>
            <BrollFrame src={brollFile(fac)} x={-4} y={-4} w={236} h={132} from={b - 4} dur={s.frames + XFADE - b + 4} tag="" r={0} scale={[1.05, 1.15]} />
          </div>
          <div style={{ flex: 1, padding: '0 26px' }}>
            <div style={{ fontSize: 32, fontWeight: 650, color: C.ink, whiteSpace: 'nowrap' }}>{c.slot}</div>
            <div style={{ marginTop: 6, fontSize: 24, color: C.ink3, display: 'flex', alignItems: 'center', gap: 10 }}>
              <svg width={14} height={14} viewBox="0 0 16 16"><path d="M8 0.8 C8.6 5.2 10.8 7.4 15.2 8 C10.8 8.6 8.6 10.8 8 15.2 C7.4 10.8 5.2 8.6 0.8 8 C5.2 7.4 7.4 5.2 8 0.8Z" fill="#E8731B" /></svg>
              {c.aiFootage}
            </div>
          </div>
          <div style={{ paddingInlineEnd: 24 }}>
            <Ring size={100} value={14} max={30} color={C.amber} width={10} draw={prog(f, b + 8, 30, EASE.out)}>
              <span style={{ fontSize: 34, fontWeight: 700, color: C.amberText, lineHeight: 1 }}>
                <Count to={14} at={b + 8} dur={30} />
              </span>
              <span style={{ fontSize: 17, color: C.ink3 }}>{c.days}</span>
            </Ring>
          </div>
        </div>
      </Card>
    </SceneCam>
  );
};

/* ═════════════ S05 Schedule ═════════════ */
export const S05: React.FC<SceneProps> = ({ s }) => {
  const f = useCurrentFrame();
  const { lang, rtl, c } = useFilm();
  const ch = captionChunks(lang, s);
  const shrink = Math.round(atLine(s, 0.2));
  const g0 = shrink + 6;
  const slide = prog(f, atLine(s, 0.62), 40, EASE.inOut);
  const ghost = prog(f, ch[1] ? ch[1].from : atLine(s, 0.8), 30, EASE.out);
  // screen: big, then to the corner (picture-in-picture, keeps playing)
  const sp = prog(f, shrink, 34, EASE.cam);
  const sw = mix(1240, 520, sp);
  const sx = mix((1920 - 1240) / 2, 1920 - 96 - 520, sp);
  const sy = mix(190, 150, sp);
  const X = dayScale(rtl, 520, 1760, -10, 220);
  const rowY = [470, 590];
  const sup = prog(f, g0 + 6, 26, EASE.inOut);
  const a11 = prog(f, g0 + 18, 26, EASE.inOut);
  const shift = 28 * slide;
  const crit = prog(f, g0 + 34, 22, EASE.inOut);
  return (
    <SceneCam frames={s.frames} zoom={[1, 1.03]} drift={[0, -6]}>
      {/* Gantt */}
      <div style={{ position: 'absolute', inset: 0, opacity: prog(f, g0 - 4, 16) }}>
        <Box x={150} y={170} w={900}>
          <Kicker size={30}>{c.chain[2]}</Kicker>
          <div style={{ marginTop: 10, fontSize: 44, fontWeight: 700, color: C.ink, lineHeight: 1.25, maxWidth: 820 }}>
            <Words text={c.a1100} at={g0 + 4} per={3} />
          </div>
        </Box>
        {[c.supplyBar, 'A1100'].map((t, i) => (
          <Box key={i} x={150} y={rowY[i]} w={340} h={70} style={{ display: 'flex', alignItems: 'center', fontSize: 32, fontWeight: 650, color: C.ink, ...rise(f, g0 + 6 + i * 8, 18) }}>
            {i === 1 ? <Mono size={32} color={C.ink} weight={600}>A1100</Mono> : t}
          </Box>
        ))}
        <svg width={1920} height={1080} style={{ position: 'absolute', inset: 0 }}>
          {[rowY[0] - 20, rowY[1] + 90].map((y, i) => (
            <line key={i} x1={px(rtl, 150)} y1={y} x2={px(rtl, 1770)} y2={y} stroke={C.border} strokeWidth={1.5} />
          ))}
          {/* critical path */}
          {crit > 0 && (
            <>
              <path d={`M ${X(110)} ${rowY[0] + 35} C ${X(116)} ${rowY[0] + 35}, ${X(96 + shift) - (rtl ? -1 : 1) * 30} ${rowY[1] + 35}, ${X(96 + shift)} ${rowY[1] + 35}`} fill="none" stroke={C.red} strokeWidth={4} strokeDasharray={`${crit * 400} 400`} />
              <Stream d={`M ${X(110)} ${rowY[0] + 35} C ${X(116)} ${rowY[0] + 35}, ${X(96 + shift) - (rtl ? -1 : 1) * 30} ${rowY[1] + 35}, ${X(96 + shift)} ${rowY[1] + 35}`} n={2} speed={0.025} color={C.red} opacity={crit} />
            </>
          )}
          <line x1={X(0)} y1={rowY[0] - 40} x2={X(0)} y2={rowY[1] + 100} stroke={C.primary} strokeWidth={2.5} strokeDasharray="6 6" opacity={prog(f, g0, 16)} />
        </svg>
        <GanttBar xa={X(0)} xb={X(110)} y={rowY[0]} h={70} fill="linear-gradient(180deg, #3D7BF0, #2557C9)" label={c.leadTime} draw={sup} />
        {/* ghost +50 and baseline outline */}
        <GanttBar xa={X(96 + 50)} xb={X(156 + 50)} y={rowY[1]} h={70} fill={C.red} dashed opacity={ghost * 0.9} label="" />
        <div style={{ position: 'absolute', top: rowY[1] - 66, left: X(186), transform: 'translateX(-50%)', opacity: ghost, whiteSpace: 'nowrap' }}>
          <Chip tone="red" icon="alert" size={26}>{c.plus50}</Chip>
        </div>
        <GanttBar xa={X(96)} xb={X(156)} y={rowY[1]} h={70} fill={C.ink3} dashed opacity={slide * 0.5} label="" />
        <GanttBar xa={X(96 + shift)} xb={X(156 + shift)} y={rowY[1]} h={70} fill={`linear-gradient(180deg, ${C.red}, #A92B2B)`} label={c.a1100.split(' · ')[0]} draw={a11} />
        {/* float 0 + slip badge */}
        <div style={{ position: 'absolute', top: rowY[1] + 96, left: X(126 + shift), transform: 'translateX(-50%)', display: 'flex', gap: 14, ...rise(f, g0 + 40, 16) }}>
          <Chip tone="red" icon="alert" size={28}>{c.float0}</Chip>
          <Chip tone="red" size={28}>{c.critical}</Chip>
        </div>
        {slide > 0 && (
          <div style={{ position: 'absolute', top: rowY[1] - 76, left: X(96 + shift), transform: 'translateX(-50%)', padding: '6px 20px', borderRadius: 14, background: C.red, color: '#fff', fontSize: 36, fontWeight: 700, boxShadow: '0 12px 26px -12px rgba(208,59,59,0.9)', whiteSpace: 'nowrap', opacity: Math.min(1, slide * 3) }}>
            <Count to={28} at={atLine(s, 0.62)} dur={40} prefix="+" /> {c.days}
          </div>
        )}
        <Box x={150} y={760} w={1640} style={{ display: 'flex', justifyContent: 'flex-end', ...rise(f, atLine(s, 0.7), 16) }}>
          <Chip tone="neutral" icon="zap" size={26}>{c.modelEst}</Chip>
        </Box>
      </div>
      {/* the real schedule screen */}
      <div style={{ position: 'absolute', inset: 0, color: sp > 0.5 ? C.ink2 : C.ink2 }}>
        <Screen
          ui="ui-schedule"
          fallback="schedule"
          x={sx}
          y={sy}
          w={sw}
          dur={s.frames + XFADE}
          focus={[
            [0, 1.0, 0.5, 0.3],
            [shrink, 1.35, 0.55, 0.42],
            [s.frames, 1.25, 0.5, 0.5],
          ]}
          startAt={2.6}
          clipFocus={[
            [2.6, 1.0, 0.5, 0.3],
            [5.0, 1.25, 0.5, 0.42],
            [8.4, 1.4, 0.5, 0.55],
            [9.6, 1.75, rtl ? 0.2 : 0.8, 0.4],
          ]}
          shine={14}
        />
      </div>
    </SceneCam>
  );
};

/* ═════════════ S06 Ripple ═════════════ */
export const S06: React.FC<SceneProps> = ({ s }) => {
  const f = useCurrentFrame();
  const { lang, rtl, c } = useFilm();
  const ch = captionChunks(lang, s);
  const b = ch[1] ? ch[1].from : atLine(s, 0.6);
  const W = 300;
  const G = 46;
  const X0 = (1920 - (5 * W + 4 * G)) / 2;
  const CY = 520;
  const nodeIn = [0, 1, 2, 3, 4].map((i) => prog(f, 2 + i * 3, 16, EASE.expo));
  const linkIn = [0, 1, 2, 3].map((i) => prog(f, 8 + i * 3, 12, EASE.inOut));
  const litAt = [6, 10, 14, Math.round(atLine(s, 0.08)), b];
  const lit = litAt.map((a) => prog(f, a, 12, EASE.out));
  const costAt = litAt[3];
  const permitAt = Math.round(atLine(s, 0.4));
  const pulse = f > 20 ? ((f - 20) % 70) / 70 : null;
  return (
    <SceneCam frames={s.frames} zoom={[1, 1.04]} drift={[8, -4]}>
      {/* exposure */}
      <Box x={150} y={170} w={560} style={rise(f, costAt, 20, 30)}>
        <Kicker size={30}>{c.exposure}</Kicker>
        <div style={{ marginTop: 6, display: 'flex', alignItems: 'baseline', gap: 16, color: C.redText }}>
          <span style={{ fontSize: 112, fontWeight: 700, lineHeight: 1.05 }}>
            <Count to={24.9} at={costAt} dur={44} digits={1} prefix="≈ " />
          </span>
          <span style={{ fontSize: 44, fontWeight: 650 }}>{lang === 'ar' ? 'مليون ريال' : 'M SAR'}</span>
        </div>
      </Box>
      {/* permit */}
      <Box x={720} y={170} w={420} style={{ display: 'flex', alignItems: 'center', gap: 22, ...rise(f, permitAt, 20, 30) }}>
        <Ring size={150} value={26} max={30} color={C.orange} width={14} draw={prog(f, permitAt + 4, 34, EASE.out)}>
          <Mono size={34} color={C.ink} weight={600}>{`${Math.round(mix(0, 26, prog(f, permitAt + 4, 34, EASE.out)))}/30`}</Mono>
        </Ring>
        <div>
          <div style={{ fontSize: 32, fontWeight: 650, color: C.ink, lineHeight: 1.3 }}>{c.permit}</div>
          <div style={{ marginTop: 8 }}>
            <Chip tone="orange" size={24}>{c.permitDays}</Chip>
          </div>
        </div>
      </Box>
      {/* night lifts — AI footage */}
      <div style={rise(f, b - 8, 22, 30)}>
        <BrollFrame src={brollFile('facade-lift')} x={1210} y={150} w={600} h={300} from={b - 8} dur={s.frames + XFADE - b + 8} tag={c.aiFootage} scale={[1.12, 1.24]} />
      </div>
      <Chain x0={X0} y={CY} w={W} gap={G} nodeIn={nodeIn} linkIn={linkIn} lit={lit} litTone={[C.red, C.red, C.red, C.red, C.orange]} pulse={pulse} />
      {c.chainDetail.map((t, i) => {
        const p = prog(f, litAt[i] + 4, 16, EASE.out);
        const x = X0 + i * (W + G);
        return (
          <Box key={i} x={x} y={CY + 112} w={W} style={{ display: 'flex', justifyContent: 'center', opacity: p, transform: `translateY(${((1 - p) * -12).toFixed(1)}px)` }}>
            <svg width={4} height={20} style={{ position: 'absolute', top: -20 }}>
              <line x1={2} y1={0} x2={2} y2={20} stroke={i === 4 ? C.orange : C.red} strokeWidth={3} />
            </svg>
            <span style={{ padding: '8px 16px', borderRadius: 14, background: i === 4 ? '#FDF0E9' : '#FDEDED', border: `1.5px solid ${i === 4 ? '#F2CDB9' : '#F3C4C4'}`, color: i === 4 ? C.orangeText : C.redText, fontSize: 26, fontWeight: 650, textAlign: 'center', lineHeight: 1.35 }}>{t}</span>
          </Box>
        );
      })}
      <FocusRing x={X0 + 4 * (W + G)} y={CY} w={W} h={92} at={b + 4} r={24} />
      <span style={{ display: 'none' }}>{rtl}</span>
    </SceneCam>
  );
};
