/**
 * Film v2 diagram components: the five-link chain, the submittal card, the day ruler and Gantt bars, the score
 * dial and driver bars, the evidence orbit, recommendation / task cards, the closure checklist and seal, the
 * roadmap pillars, the offline phone, the QR scan, the plan layers, the panorama window and the architecture strip.
 * Each takes progress values (0..1) or frames from its scene, so the scenes stay pure functions of the frame.
 */
import React from 'react';
import { Img, staticFile, useCurrentFrame } from 'remotion';
import { MetalRing } from '../components/Metal';
import { Emblem } from '../components/Emblem';
import { mix, prog } from '../lib/anim';
import { C, EASE, ELEV, FONT, METAL } from '../theme';
import { Box, Card, Chip, Icon, IconTile, Mono, Ring, Stamp, Wire, metalBorder, px, useFilm, type ChipTone, type IconName } from './kit';

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

/* ════════════════ Chain: five linked nodes ════════════════ */
const CHAIN_ICONS: IconName[] = ['doc', 'crate', 'calendar', 'coins', 'hardhat'];
export const Chain: React.FC<{
  x0: number;
  y: number;
  w: number;
  gap: number;
  h?: number;
  size?: number;
  nodeIn: number[];
  linkIn: number[];
  lit: number[];
  litTone?: string[];
  pulse?: number | null; // 0..1 along the whole chain
  onDark?: boolean;
}> = ({ x0, y, w, gap, h = 92, size = 34, nodeIn, linkIn, lit, litTone, pulse = null, onDark }) => {
  const { rtl, c } = useFilm();
  const total = 5 * w + 4 * gap;
  const tones = litTone ?? [C.red, C.orange, C.red, C.orange, C.orange];
  return (
    <>
      <svg width={1920} height={1080} style={{ position: 'absolute', left: 0, top: 0, overflow: 'visible' }}>
        {[0, 1, 2, 3].map((i) => {
          const a = x0 + (i + 1) * w + i * gap;
          const b = a + gap;
          const p = clamp01(linkIn[i] ?? 0);
          if (p <= 0) return null;
          const yy = y + h / 2;
          const xa = px(rtl, a);
          const xb = px(rtl, a + gap * p);
          const hot = Math.min(lit[i] ?? 0, lit[i + 1] ?? 0);
          return (
            <g key={i}>
              <line x1={xa} y1={yy} x2={xb} y2={yy} stroke={onDark ? 'rgba(255,255,255,0.85)' : C.lineStrong} strokeWidth={3} strokeLinecap="round" />
              {hot > 0 && <line x1={xa} y1={yy} x2={xb} y2={yy} stroke={C.red} strokeWidth={4} strokeLinecap="round" opacity={hot} />}
              {p >= 1 && (
                <g transform={`translate(${px(rtl, (a + b) / 2)} ${yy})`}>
                  <rect x={-13} y={-8} width={26} height={16} rx={8} fill={onDark ? 'rgba(10,16,28,0.6)' : C.surface} stroke={onDark ? '#FFFFFF' : C.lineStrong} strokeWidth={2.4} />
                </g>
              )}
            </g>
          );
        })}
        {pulse !== null && pulse > 0 && pulse < 1 && (
          <circle cx={px(rtl, x0 + pulse * total)} cy={y + h / 2} r={9} fill="#FF5E00" stroke="#FFE2C2" strokeWidth={3} />
        )}
      </svg>
      {c.chain.map((label, i) => {
        const p = clamp01(nodeIn[i] ?? 0);
        if (p <= 0) return null;
        const l = clamp01(lit[i] ?? 0);
        const tone = tones[i];
        return (
          <Box
            key={i}
            x={x0 + i * (w + gap)}
            y={y}
            w={w}
            h={h}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 14,
              borderRadius: 22,
              ...(l > 0.5 ? { background: '#FFFFFF', border: `3px solid ${tone}` } : metalBorder('#FFFFFF', 2)),
              boxShadow: l > 0 ? `0 0 0 ${(6 * l).toFixed(1)}px ${tone}26, ${ELEV}` : ELEV,
              opacity: p,
              transform: `translateY(${((1 - p) * 26).toFixed(1)}px) scale(${mix(0.9, 1, p).toFixed(3)})`,
              fontSize: size,
              fontWeight: 650,
              color: l > 0.5 ? tone : C.ink,
            }}
          >
            <Icon name={CHAIN_ICONS[i]} size={size + 6} color={l > 0.5 ? tone : C.ink2} width={2} />
            <span>{label}</span>
          </Box>
        );
      })}
    </>
  );
};

/* ════════════════ Submittal card ════════════════ */
export const SubmittalCard: React.FC<{ x: number; y: number; w: number; h: number; rev: string; dim?: number; compact?: boolean; children?: React.ReactNode; style?: React.CSSProperties }> = ({ x, y, w, h, rev, dim = 0, compact, children, style }) => {
  const { c } = useFilm();
  return (
    <Card x={x} y={y} w={w} h={h} style={{ ...style }}>
      <div style={{ opacity: 1 - dim * 0.55 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <IconTile name="doc" size={60} tone="blue" />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span style={{ fontSize: 28, fontWeight: 600, color: C.ink2 }}>{c.submittal}</span>
            <Mono size={26} color={C.primaryText} weight={600}>MAR-S1-CW-014</Mono>
          </div>
          <span style={{ flex: 1 }} />
          <Chip tone="neutral" size={26}>{rev}</Chip>
        </div>
        {!compact && <div style={{ marginTop: 18, fontSize: 42, fontWeight: 700, color: C.ink, lineHeight: 1.3 }}>{c.material}</div>}
        <div style={{ marginTop: compact ? 18 : 10, height: 2, background: C.border }} />
        {children}
      </div>
    </Card>
  );
};

/* ════════════════ Day ruler (days relative to today) ════════════════ */
export type DayScale = (d: number) => number; // → physical x
export const dayScale = (rtl: boolean, x0: number, x1: number, d0: number, d1: number): DayScale => (d) => px(rtl, x0 + ((d - d0) / (d1 - d0)) * (x1 - x0));

export const DayRuler: React.FC<{ X: DayScale; y: number; d0: number; d1: number; step: number; label: number; draw: number; todayLabel: string; dark?: boolean }> = ({ X, y, d0, d1, step, label, draw, todayLabel }) => {
  const ticks: number[] = [];
  for (let d = Math.ceil(d0 / step) * step; d <= d1; d += step) ticks.push(d);
  const xa = X(d0);
  const xb = X(d1);
  const xe = mix(xa, xb, draw);
  return (
    <>
      <svg width={1920} height={1080} style={{ position: 'absolute', left: 0, top: 0, overflow: 'visible' }}>
        <line x1={xa} y1={y} x2={xe} y2={y} stroke={C.ink3} strokeWidth={2.5} />
        {ticks.map((d) => {
          const x = X(d);
          const vis = (x - xa) / (xb - xa) <= draw + 1e-6;
          if (!vis) return null;
          const major = d % label === 0;
          return <line key={d} x1={x} y1={y} x2={x} y2={y + (major ? 18 : 10)} stroke={C.ink3} strokeWidth={major ? 2.2 : 1.4} />;
        })}
      </svg>
      {ticks
        .filter((d) => d % label === 0 && (X(d) - xa) / (xb - xa) <= draw + 1e-6)
        .map((d) => (
          <div key={d} style={{ position: 'absolute', left: X(d), top: y + 24, transform: 'translateX(-50%)', fontSize: 26, fontWeight: d === 0 ? 700 : 500, color: d === 0 ? C.ink : C.ink3, whiteSpace: 'nowrap' }}>
            {d === 0 ? todayLabel : <Mono size={24} color={C.ink3}>{d > 0 ? `+${d}` : `−${-d}`}</Mono>}
          </div>
        ))}
    </>
  );
};

/** A flag pinned above the ruler at physical x: a stem and a label box (stays inside 80..1840). */
export const Flag: React.FC<{ x: number; top: number; stemTo: number; tone: string; p: number; children: React.ReactNode; align?: 'center' | 'start' | 'end' }> = ({ x, top, stemTo, tone, p, children, align = 'center' }) => {
  if (p <= 0) return null;
  const tx = align === 'center' ? '-50%' : align === 'start' ? '0%' : '-100%';
  return (
    <>
      <svg width={1920} height={1080} style={{ position: 'absolute', left: 0, top: 0, overflow: 'visible', opacity: p }}>
        <line x1={x} y1={top + 40} x2={x} y2={mix(top + 40, stemTo, p)} stroke={tone} strokeWidth={3} />
        <circle cx={x} cy={stemTo} r={7 * p} fill={tone} stroke="#FFFFFF" strokeWidth={2.5} />
      </svg>
      <div style={{ position: 'absolute', left: x, top, transform: `translateX(${tx}) translateY(${((1 - p) * 14).toFixed(1)}px)`, opacity: p, whiteSpace: 'nowrap' }}>{children}</div>
    </>
  );
};

/* ════════════════ Gantt bar ════════════════ */
export const GanttBar: React.FC<{ xa: number; xb: number; y: number; h?: number; fill: string; label?: React.ReactNode; dashed?: boolean; opacity?: number; draw?: number; textColor?: string }> = ({
  xa,
  xb,
  y,
  h = 64,
  fill,
  label,
  dashed,
  opacity = 1,
  draw = 1,
  textColor = '#FFFFFF',
}) => {
  const l = Math.min(xa, xb);
  const w = Math.abs(xb - xa);
  const rtl = xb < xa;
  const ww = w * draw;
  if (ww <= 0.5 || opacity <= 0) return null;
  return (
    <div
      style={{
        position: 'absolute',
        top: y,
        left: rtl ? l + w - ww : l,
        width: ww,
        height: h,
        borderRadius: 14,
        boxSizing: 'border-box',
        background: dashed ? 'repeating-linear-gradient(135deg, rgba(208,59,59,0.10) 0 10px, rgba(208,59,59,0.02) 10px 20px)' : fill,
        border: dashed ? `2.5px dashed ${fill}` : 'none',
        boxShadow: dashed ? 'none' : '0 10px 22px -14px rgba(19,34,56,0.55)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
        opacity,
        color: dashed ? fill : textColor,
        fontSize: 28,
        fontWeight: 650,
        whiteSpace: 'nowrap',
      }}
    >
      {draw > 0.6 ? label : null}
    </div>
  );
};

/* ════════════════ Score dial (270° gauge) ════════════════ */
export const ScoreDial: React.FC<{ cx: number; cy: number; r: number; value: number; draw: number; color: string; label: string; sub?: React.ReactNode }> = ({ cx, cy, r, value, draw, color, label, sub }) => {
  const { rtl } = useFilm();
  const sw = 30;
  const A = 270;
  const P = 2 * Math.PI * r;
  const arc = (P * A) / 360;
  const v = clamp01(value / 100);
  const rot = 135;
  return (
    <>
      <svg width={1920} height={1080} style={{ position: 'absolute', left: 0, top: 0, overflow: 'visible' }}>
        <g transform={`rotate(${rot} ${px(rtl, cx)} ${cy})`} opacity={draw}>
          <circle cx={px(rtl, cx)} cy={cy} r={r} fill="none" stroke={C.pressed} strokeWidth={sw} strokeLinecap="round" strokeDasharray={`${arc * draw} ${P}`} />
          {[40, 70].map((t) => (
            <circle key={t} cx={px(rtl, cx)} cy={cy} r={r + sw / 2 + 10} fill="none" stroke={C.ink3} strokeWidth={8} strokeDasharray={`2 ${P * 2}`} strokeDashoffset={-((P + 2 * Math.PI * (sw / 2 + 10)) * A / 360) * (t / 100)} />
          ))}
          <circle cx={px(rtl, cx)} cy={cy} r={r} fill="none" stroke={color} strokeWidth={sw} strokeLinecap="round" strokeDasharray={`${arc * v} ${P}`} />
        </g>
      </svg>
      <div style={{ position: 'absolute', left: px(rtl, cx), top: cy, transform: 'translate(-50%, -54%)', textAlign: 'center', opacity: draw }}>
        <div style={{ fontSize: 30, fontWeight: 600, color: C.ink2 }}>{label}</div>
        <div dir="ltr" style={{ fontFamily: FONT.en, fontSize: 150, fontWeight: 700, color: C.ink, lineHeight: 1, letterSpacing: '-0.02em' }}>
          {Math.round(value)}
          <span style={{ fontSize: 46, fontWeight: 500, color: C.ink3 }}>/100</span>
        </div>
        {sub}
      </div>
    </>
  );
};

/* ════════════════ Driver bars ════════════════ */
export const DriverBars: React.FC<{ labels: string[]; pct: number[]; at: number[]; width: number }> = ({ labels, pct, at, width }) => {
  const f = useCurrentFrame();
  const max = Math.max(...pct);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {labels.map((l, i) => {
        const p = prog(f, at[i], 22, EASE.out);
        const pw = prog(f, at[i] + 4, 26, EASE.expo);
        return (
          <div key={i} style={{ opacity: p, transform: `translateY(${((1 - p) * 14).toFixed(1)}px)` }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 14, fontSize: 30, fontWeight: 500, color: C.ink, lineHeight: 1.35 }}>
              <span style={{ flex: 1, whiteSpace: 'nowrap' }}>{l}</span>
              <Mono size={28} color={C.ink} weight={600}>{`${Math.round(pct[i] * pw)}%`}</Mono>
            </div>
            <div style={{ marginTop: 6, height: 12, width, borderRadius: 6, background: C.pressed, overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${((pct[i] / max) * 100 * pw).toFixed(2)}%`, borderRadius: 6, background: i === 0 ? C.red : i < 3 ? C.orange : C.amber }} />
            </div>
          </div>
        );
      })}
    </div>
  );
};

/* ════════════════ Evidence orbit ════════════════ */
const SOURCE_ICONS: IconName[] = ['doc', 'cart', 'calendar', 'contract', 'mail', 'photo', 'weather'];
export const EvidenceOrbit: React.FC<{ cx: number; cy: number; rx: number; ry: number; at: number[]; spin: number; fly: number; cardBox: { x: number; y: number; w: number; h: number } }> = ({
  cx,
  cy,
  rx,
  ry,
  at,
  spin,
  fly,
  cardBox,
}) => {
  const f = useCurrentFrame();
  const { rtl, c } = useFilm();
  const n = 7;
  const pos = Array.from({ length: n }, (_, i) => {
    const a = (-90 + (360 / n) * i + spin) * (Math.PI / 180);
    const x = cx + rx * Math.cos(a);
    const y = cy + ry * Math.sin(a);
    return { x: mix(x, cx, fly * 0.82), y: mix(y, cy, fly * 0.82) };
  });
  // edge point of the card toward a chip
  const edge = (x: number, y: number) => {
    const dx = x - cx;
    const dy = y - cy;
    const sx = cardBox.w / 2 / Math.max(1e-6, Math.abs(dx));
    const sy = cardBox.h / 2 / Math.max(1e-6, Math.abs(dy));
    const s = Math.min(sx, sy);
    return { x: cx + dx * s, y: cy + dy * s };
  };
  return (
    <>
      <svg width={1920} height={1080} style={{ position: 'absolute', left: 0, top: 0, overflow: 'visible' }}>
        <ellipse cx={px(rtl, cx)} cy={cy} rx={rx} ry={ry} fill="none" stroke={C.ink} strokeOpacity={0.07 * (1 - fly)} strokeWidth={2} strokeDasharray="4 10" />
        {pos.map((p, i) => {
          const d = prog(f, at[i] + 4, 16, EASE.inOut);
          if (d <= 0) return null;
          const e = edge(p.x, p.y);
          const path = `M ${px(rtl, p.x)} ${p.y} L ${px(rtl, e.x)} ${e.y}`;
          const pulse = ((f - at[i] - 10) % 45) / 45;
          return <Wire key={i} d={path} draw={d} color={C.accent} width={2.5} pulse={f > at[i] + 10 ? pulse : null} pulseColor="#FF5E00" opacity={1 - fly} />;
        })}
      </svg>
      {pos.map((p, i) => {
        const a = prog(f, at[i], 16, EASE.expo);
        if (a <= 0) return null;
        return (
          <div
            key={i}
            style={{
              position: 'absolute',
              left: px(rtl, p.x),
              top: p.y,
              transform: `translate(-50%, -50%) scale(${(mix(0.6, 1, a) * mix(1, 0.4, fly)).toFixed(3)})`,
              opacity: a * (1 - fly),
              display: 'flex',
              alignItems: 'center',
              gap: 14,
              padding: '12px 22px 12px 14px',
              paddingInlineStart: 14,
              paddingInlineEnd: 24,
              borderRadius: 20,
              background: '#FFFFFF',
              border: `1.5px solid ${C.border}`,
              boxShadow: ELEV,
              whiteSpace: 'nowrap',
            }}
          >
            {i === 5 ? (
              <span style={{ width: 58, height: 58, borderRadius: 14, overflow: 'hidden', flex: 'none', border: `1.5px solid ${C.border}` }}>
                <Img src={staticFile('v2/film/site-thumb.jpg')} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              </span>
            ) : (
              <IconTile name={SOURCE_ICONS[i]} size={58} tone={i === 6 ? 'teal' : 'blue'} />
            )}
            <span style={{ display: 'flex', flexDirection: 'column' }}>
              <span style={{ fontSize: 30, fontWeight: 650, color: C.ink, lineHeight: 1.25 }}>{c.sources[i]}</span>
              <span style={{ fontSize: 22, fontWeight: 500, color: C.ink3, fontFamily: /[A-Z0-9]/.test(c.sourceSys[i]) ? FONT.mono : undefined }}>{c.sourceSys[i]}</span>
            </span>
          </div>
        );
      })}
    </>
  );
};

/* ════════════════ Recommendation card ════════════════ */
export const RecCard: React.FC<{
  x: number;
  y: number;
  w: number;
  h: number;
  id: string;
  title: string;
  gain: string;
  cost: string;
  gainTone: ChipTone;
  costTone: ChipTone;
  p: number;
  state?: 'accepted' | 'hedge' | null;
  stateP?: number;
  stateLabel?: string;
  compact?: boolean;
}> = ({ x, y, w, h, id, title, gain, cost, gainTone, costTone, p, state = null, stateP = 0, stateLabel, compact }) => {
  if (p <= 0) return null;
  const ring = state === 'accepted' ? C.green : state === 'hedge' ? C.amber : null;
  return (
    <Card
      x={x}
      y={y}
      w={w}
      h={h}
      pad={compact ? '22px 26px' : 32}
      style={{
        opacity: Math.min(1, p * 1.3),
        transform: `translateY(${((1 - p) * 40).toFixed(1)}px) scale(${mix(0.94, 1, p).toFixed(3)})`,
        boxShadow: ring && stateP > 0 ? `0 0 0 ${(5 * stateP).toFixed(1)}px ${ring}55, ${ELEV}` : ELEV,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <span style={{ fontFamily: FONT.mono, fontSize: compact ? 34 : 40, fontWeight: 600, color: '#FFFFFF', background: C.ink, borderRadius: 14, padding: '4px 16px', direction: 'ltr' }}>{id}</span>
        <span style={{ flex: 1 }} />
        {state && stateP > 0 && (
          <span style={{ opacity: stateP, transform: `scale(${mix(1.4, 1, stateP).toFixed(3)})` }}>
            <Chip tone={state === 'accepted' ? 'green' : 'amber'} icon={state === 'accepted' ? 'check' : 'shield'} size={28}>
              {stateLabel}
            </Chip>
          </span>
        )}
      </div>
      <div style={{ marginTop: compact ? 12 : 26, fontSize: compact ? 32 : 40, fontWeight: 700, color: C.ink, lineHeight: 1.32 }}>{title}</div>
      {!compact && (
        <div style={{ position: 'absolute', insetInlineStart: 32, insetInlineEnd: 32, bottom: 30, display: 'flex', flexDirection: 'column', gap: 14, alignItems: 'flex-start' }}>
          <Chip tone={gainTone} icon={gainTone === 'green' ? 'refresh' : 'shield'} size={29}>{gain}</Chip>
          <Chip tone={costTone} icon={costTone === 'green' ? 'check' : 'alert'} size={27}>{cost}</Chip>
        </div>
      )}
    </Card>
  );
};

/* ════════════════ Decision stamp ════════════════ */
export const DecisionStamp: React.FC<{ at: number; lines: string[]; style?: React.CSSProperties }> = ({ at, lines, style }) => (
  <Stamp at={at} color={C.greenText} rotate={-5} size={44} style={style}>
    <div>{lines[0]}</div>
    <div style={{ fontSize: 32, fontWeight: 600, color: C.amberText }}>{lines[1]}</div>
  </Stamp>
);

/* ════════════════ Task card ════════════════ */
export const TaskCard: React.FC<{ x: number; y: number; w: number; h: number; id: string; title: string; owner: string; due: string; p: number }> = ({ x, y, w, h, id, title, owner, due, p }) => {
  if (p <= 0) return null;
  return (
    <Card
      x={x}
      y={y}
      w={w}
      h={h}
      pad="20px 24px"
      style={{ opacity: Math.min(1, p * 1.4), transform: `translateY(${((1 - p) * -46).toFixed(1)}px) rotate(${((1 - p) * -2.5).toFixed(2)}deg)` }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <Mono size={24} color={C.primaryText} weight={600}>{id}</Mono>
        <span style={{ flex: 1 }} />
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 24, color: C.ink2, fontWeight: 500 }}>
          <Icon name="calendar" size={24} color={C.ink3} />
          {due}
        </span>
      </div>
      <div style={{ marginTop: 10, fontSize: 27, fontWeight: 650, color: C.ink, lineHeight: 1.3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{title}</div>
      <div style={{ marginTop: 12 }}>
        <Chip tone="neutral" icon="user" size={24}>{owner}</Chip>
      </div>
    </Card>
  );
};

/* ════════════════ Closure checklist + seal ════════════════ */
export const ChecklistSeal: React.FC<{ x: number; y: number; w: number; itemAt: number[]; sealAt: number; sealX: number; sealY: number; sealR: number }> = ({ x, y, w, itemAt, sealAt, sealX, sealY, sealR }) => {
  const f = useCurrentFrame();
  const { rtl, c } = useFilm();
  const sealDraw = prog(f, sealAt, 40, EASE.inOut);
  const sealIn = prog(f, sealAt - 30, 24, EASE.out);
  return (
    <>
      <Card x={x} y={y} w={w} pad="30px 34px" style={rise(f, 4)}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 14 }}>
          <IconTile name="shield" size={56} tone="teal" />
          <span style={{ fontSize: 44, fontWeight: 700, color: C.ink }}>{c.closure}</span>
        </div>
        {c.closureItems.map((t, i) => {
          const p = prog(f, itemAt[i], 14, EASE.out);
          return (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 20, padding: '14px 0', borderTop: `1.5px solid ${C.border}` }}>
              <span
                style={{
                  width: 50,
                  height: 50,
                  borderRadius: 12,
                  flex: 'none',
                  boxSizing: 'border-box',
                  border: `2.5px ${p > 0.5 ? 'solid' : 'dashed'} ${p > 0.5 ? C.accent : C.border2}`,
                  background: p > 0.5 ? '#E4F5F8' : 'transparent',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transform: `scale(${(1 + 0.18 * Math.sin(Math.PI * p)).toFixed(3)})`,
                }}
              >
                <Icon name={(['doc', 'cart', 'calendar', 'qr', 'camera'] as IconName[])[i]} size={28} color={p > 0.5 ? C.accentText : C.lineStrong} />
              </span>
              <span style={{ flex: 1, fontSize: 34, fontWeight: p > 0.5 ? 650 : 500, color: mixColor(p) }}>{t}</span>
              <span style={{ opacity: 0.35 + 0.65 * p }}>
                <Mono size={24} color={C.ink2} weight={600} style={{ padding: '4px 12px', borderRadius: 8, background: C.raised, border: `1px solid ${C.border}` }}>
                  {c.closureSrc[i]}
                </Mono>
              </span>
              <span style={{ width: 170, textAlign: 'end', fontSize: 24, fontWeight: 600, color: C.accentText, opacity: p }}>{c.required}</span>
            </div>
          );
        })}
      </Card>
      {/* seal */}
      <div style={{ opacity: sealIn }}>
        <MetalRing cx={px(rtl, sealX)} cy={sealY} r={sealR} width={5} rtl={rtl} id="seal" draw={sealDraw} comet={sealDraw >= 1 ? { speed: 9, len: 220 } : null} />
        <svg width={1920} height={1080} style={{ position: 'absolute', left: 0, top: 0 }}>
          <circle cx={px(rtl, sealX)} cy={sealY} r={sealR - 22} fill="#FFFFFF" stroke={C.border} strokeWidth={2} strokeDasharray="3 7" />
        </svg>
        <div style={{ position: 'absolute', left: px(rtl, sealX), top: sealY, transform: 'translate(-50%, -50%)', width: sealR * 1.5, textAlign: 'center' }}>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 10 }}>
            <IconTile name="shield" size={72} tone={sealDraw >= 1 ? 'green' : 'teal'} />
          </div>
          <div style={{ fontSize: 38, fontWeight: 700, color: C.ink, lineHeight: 1.3 }}>{c.seal[0]}</div>
          <div style={{ marginTop: 10, display: 'inline-flex', alignItems: 'center', gap: 10, fontSize: 28, fontWeight: 600, color: C.ink2 }}>
            <Icon name="users" size={30} color={C.ink2} />
            {c.seal[1]}
          </div>
        </div>
      </div>
    </>
  );
};
const mixColor = (p: number) => (p > 0.5 ? C.ink : C.ink3);
const rise = (f: number, at: number): React.CSSProperties => {
  const p = prog(f, at, 18, EASE.out);
  return { opacity: p, transform: `translateY(${((1 - p) * 24).toFixed(1)}px)` };
};

/* ════════════════ Roadmap pillars ════════════════ */
const PILLAR_ICONS: IconName[] = ['wifioff', 'qr', 'plan', 'camera'];
export const Pillars: React.FC<{ x0: number; y: number; w: number; gap: number; h: number; at: number; stagger?: number; highlight?: number | null }> = ({ x0, y, w, gap, h, at, stagger = 5, highlight = null }) => {
  const f = useCurrentFrame();
  const { c } = useFilm();
  return (
    <>
      {c.pillars.map((label, i) => {
        const p = prog(f, at + i * stagger, 24, EASE.expo);
        if (p <= 0) return null;
        const dim = highlight !== null && highlight !== i ? 0.4 : 1;
        return (
          <Box
            key={i}
            x={x0 + i * (w + gap)}
            y={y}
            w={w}
            h={h}
            style={{
              borderRadius: 26,
              border: '2px solid transparent',
              background: `linear-gradient(180deg, #1A3157, #0F2142) padding-box, ${METAL} border-box`,
              boxShadow: '0 30px 60px -30px rgba(0,0,0,0.7), inset 0 1px 0 rgba(255,255,255,0.08)',
              opacity: p * dim,
              transform: `translateY(${((1 - p) * 80).toFixed(1)}px)`,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 22,
              color: '#FFFFFF',
            }}
          >
            <span style={{ fontFamily: FONT.mono, fontSize: 64, fontWeight: 600, background: METAL, WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent', lineHeight: 1 }}>{`0${i + 1}`}</span>
            <span style={{ width: 92, height: 92, borderRadius: 26, background: 'rgba(255,255,255,0.08)', border: '1.5px solid rgba(255,255,255,0.22)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Icon name={PILLAR_ICONS[i]} size={52} color="#FFFFFF" width={1.7} />
            </span>
            <span style={{ fontSize: 40, fontWeight: 650, textAlign: 'center', lineHeight: 1.3 }}>{label}</span>
          </Box>
        );
      })}
    </>
  );
};

/* ════════════════ Phone: offline capture, outbox, sync ════════════════ */
export const PhoneOffline: React.FC<{ x: number; y: number; rowsAt: number[]; syncAt: number }> = ({ x, y, rowsAt, syncAt }) => {
  const f = useCurrentFrame();
  const { c } = useFilm();
  const W = 400;
  const H = 720;
  const sync = prog(f, syncAt, 30, EASE.inOut);
  const queued = rowsAt.filter((a) => f >= a + 8).length;
  const shown = sync > 0 ? Math.round(queued * (1 - sync)) : queued;
  const done = prog(f, syncAt + 28, 14, EASE.out);
  const bars = sync > 0 ? Math.min(4, Math.floor(sync * 5)) : 0;
  return (
    <Box x={x} y={y} w={W} h={H} style={{ borderRadius: 58, background: '#0E1726', padding: 14, boxShadow: '0 40px 80px -30px rgba(0,0,0,0.7), 0 0 0 2px rgba(255,255,255,0.08)' }}>
      <div style={{ position: 'relative', width: '100%', height: '100%', borderRadius: 46, background: C.bg, overflow: 'hidden' }}>
        {/* status bar */}
        <div dir="ltr" style={{ height: 64, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 30px', fontFamily: FONT.en, fontSize: 22, fontWeight: 600, color: C.ink }}>
          <span>06:42</span>
          <span style={{ width: 110, height: 30, borderRadius: 16, background: '#0E1726' }} />
          <span style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 20 }}>
            {[0, 1, 2, 3].map((i) => (
              <span key={i} style={{ width: 5, height: 6 + i * 4.5, borderRadius: 1.5, background: i < bars ? C.green : '#C5D2E1' }} />
            ))}
            {bars === 0 && <Icon name="x" size={18} color={C.red} width={3} style={{ marginInlineStart: 2 }} />}
          </span>
        </div>
        {/* connection banner */}
        <div style={{ margin: '4px 20px 0', padding: '10px 16px', borderRadius: 16, display: 'flex', alignItems: 'center', gap: 12, fontSize: 26, fontWeight: 650, background: done > 0.5 ? '#E8F6E8' : '#FDEDED', color: done > 0.5 ? C.greenText : C.redText, border: `1.5px solid ${done > 0.5 ? '#B9E2B9' : '#F3C4C4'}` }}>
          <Icon name={done > 0.5 ? 'check' : 'wifioff'} size={28} color={done > 0.5 ? C.greenText : C.redText} width={2.2} />
          <span style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.25 }}>
            <span style={{ whiteSpace: 'nowrap' }}>{done > 0.5 ? c.synced : c.noSignal}</span>
            {done > 0.5 && <span style={{ fontSize: 18, fontWeight: 500, color: C.ink2, whiteSpace: 'nowrap' }}>{c.syncedNote}</span>}
          </span>
        </div>
        <div style={{ margin: '18px 24px 10px', fontSize: 27, fontWeight: 700, color: C.ink }}>{c.basement}</div>
        {c.formRows.map((t, i) => {
          const p = prog(f, rowsAt[i], 14, EASE.out);
          const up = prog(f, syncAt + i * 6, 18, EASE.inOut);
          return (
            <div key={i} style={{ margin: '0 20px 12px', padding: '14px 16px', borderRadius: 16, background: '#FFFFFF', border: `1.5px solid ${C.border}`, display: 'flex', alignItems: 'center', gap: 12, opacity: p, transform: `translateY(${((1 - p) * 16).toFixed(1)}px)` }}>
              <Icon name={(['alert', 'photo', 'pin'] as IconName[])[i]} size={30} color={C.ink2} />
              <span style={{ flex: 1, fontSize: 25, fontWeight: 600, color: C.ink }}>{t}</span>
              <span style={{ position: 'relative', width: 30, height: 30 }}>
                <span style={{ position: 'absolute', inset: 0, opacity: 1 - up }}>
                  <Icon name="clock" size={30} color={C.amberText} />
                </span>
                <span style={{ position: 'absolute', inset: 0, opacity: up }}>
                  <Icon name="check" size={30} color={C.greenText} width={2.4} />
                </span>
              </span>
            </div>
          );
        })}
        {/* outbox */}
        <div style={{ position: 'absolute', left: 20, right: 20, bottom: 26, padding: '16px 18px', borderRadius: 18, background: '#FFFFFF', border: `1.5px solid ${C.border}`, display: 'flex', alignItems: 'center', gap: 14 }}>
          <span style={{ width: 52, height: 52, borderRadius: 14, background: shown > 0 ? '#FFF5DE' : '#E8F6E8', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="upload" size={30} color={shown > 0 ? C.amberText : C.greenText} width={2.1} />
          </span>
          <span style={{ fontFamily: FONT.en, fontSize: 44, fontWeight: 700, color: C.ink }}>{shown}</span>
          <span style={{ fontSize: 24, fontWeight: 600, color: C.ink2 }}>{c.outbox}</span>
        </div>
      </div>
    </Box>
  );
};

/* ════════════════ QR scan ════════════════ */
/** Deterministic 25 × 25 QR-like matrix (decorative; finder patterns in three corners). */
const QR_N = 25;
const QR = (() => {
  const m: boolean[][] = Array.from({ length: QR_N }, () => Array(QR_N).fill(false));
  let s = 7;
  const rnd = () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  for (let r = 0; r < QR_N; r++) for (let c = 0; c < QR_N; c++) m[r][c] = rnd() > 0.52;
  const finder = (r0: number, c0: number) => {
    for (let r = -1; r < 8; r++)
      for (let c = -1; c < 8; c++) {
        const rr = r0 + r;
        const cc = c0 + c;
        if (rr < 0 || cc < 0 || rr >= QR_N || cc >= QR_N) continue;
        const ring = Math.max(Math.abs(r - 3), Math.abs(c - 3));
        m[rr][cc] = r >= 0 && c >= 0 && r < 7 && c < 7 && (ring === 3 || ring <= 1);
      }
  };
  finder(0, 0);
  finder(0, QR_N - 7);
  finder(QR_N - 7, 0);
  return m;
})();
export const QrCode: React.FC<{ size: number; color?: string }> = ({ size, color = C.ink }) => {
  const u = size / QR_N;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ display: 'block' }}>
      {QR.flatMap((row, r) => row.map((on, c) => (on ? <rect key={`${r}-${c}`} x={c * u} y={r * u} width={u + 0.3} height={u + 0.3} fill={color} /> : null)))}
    </svg>
  );
};

export const QrScan: React.FC<{ x: number; y: number; scanAt: number; lockAt: number }> = ({ x, y, scanAt, lockAt }) => {
  const f = useCurrentFrame();
  const { rtl } = useFilm();
  const W = 620;
  const H = 520;
  const q = 210;
  const qx = (W - q) / 2 - 60;
  const qy = 120;
  const scan = prog(f, scanAt, lockAt - scanAt, EASE.inOut);
  const lock = prog(f, lockAt, 12, EASE.expo);
  const sweep = Math.sin(scan * Math.PI * 3) * 0.5 + 0.5;
  return (
    <Box x={x} y={y} w={W} h={H}>
      {/* crate */}
      <svg width={W} height={H} style={{ position: 'absolute', inset: 0, overflow: 'visible', transform: rtl ? 'scaleX(-1)' : undefined }}>
        <defs>
          <linearGradient id="wood" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#D9A86A" />
            <stop offset="1" stopColor="#B98547" />
          </linearGradient>
        </defs>
        <path d={`M40 70 L${W - 120} 70 L${W - 20} 20 L140 20 Z`} fill="#E5BE86" stroke="#8C6331" strokeWidth={3} />
        <path d={`M${W - 120} 70 L${W - 20} 20 L${W - 20} ${H - 90} L${W - 120} ${H - 40} Z`} fill="#A87638" stroke="#8C6331" strokeWidth={3} />
        <rect x={40} y={70} width={W - 160} height={H - 110} fill="url(#wood)" stroke="#8C6331" strokeWidth={3} />
        {[0, 1, 2, 3].map((i) => (
          <line key={i} x1={40} y1={70 + ((H - 110) / 4) * (i + 1)} x2={W - 120} y2={70 + ((H - 110) / 4) * (i + 1)} stroke="#9C7038" strokeWidth={2} opacity={0.6} />
        ))}
        <path d={`M40 70 L${W - 120} ${H - 40} M${W - 120} 70 L40 ${H - 40}`} stroke="#9C7038" strokeWidth={10} opacity={0.35} />
      </svg>
      {/* label with QR */}
      <div style={{ position: 'absolute', insetInlineStart: qx - 26, top: qy - 26, width: q + 52, height: q + 96, borderRadius: 12, background: '#FFFFFF', boxShadow: '0 8px 20px -10px rgba(0,0,0,0.5)', padding: 26, boxSizing: 'border-box' }}>
        <QrCode size={q} />
        <div style={{ marginTop: 12, textAlign: 'center' }}>
          <Mono size={22} color={C.ink} weight={600}>CW-S1-014 · 14/40</Mono>
        </div>
      </div>
      {/* scanner brackets + laser */}
      {scan > 0 && (
        <svg width={W} height={H} style={{ position: 'absolute', inset: 0, overflow: 'visible' }}>
          {(() => {
            const bx = rtl ? W - (qx + q) - 40 : qx - 40;
            const by = qy - 40;
            const s = q + 80;
            const k = mix(1.25, 1, lock);
            const cx = bx + s / 2;
            const cy = by + s / 2;
            const L = 46;
            const col = lock > 0.5 ? C.green : C.accentBright;
            return (
              <g transform={`translate(${cx} ${cy}) scale(${k}) translate(${-cx} ${-cy})`} opacity={Math.min(1, scan * 4)}>
                <path d={`M${bx} ${by + L} V${by} H${bx + L} M${bx + s - L} ${by} H${bx + s} V${by + L} M${bx + s} ${by + s - L} V${by + s} H${bx + s - L} M${bx + L} ${by + s} H${bx} V${by + s - L}`} fill="none" stroke={col} strokeWidth={7} strokeLinecap="round" />
                {lock < 0.5 && <rect x={bx + 10} y={by + 20 + sweep * (s - 40)} width={s - 20} height={4} rx={2} fill="#FF5E00" opacity={0.95} />}
                {lock < 0.5 && <rect x={bx + 10} y={by + 12 + sweep * (s - 40)} width={s - 20} height={20} fill="#FF5E00" opacity={0.12} />}
              </g>
            );
          })()}
        </svg>
      )}
    </Box>
  );
};

/* ════════════════ Plan with stacking layers ════════════════ */
export const PlanLayers: React.FC<{ x: number; y: number; w: number; h: number; layerAt: number[]; baseAt: number }> = ({ x, y, w, h, layerAt, baseAt }) => {
  const f = useCurrentFrame();
  const { rtl, c } = useFilm();
  const base = prog(f, baseAt, 30, EASE.inOut);
  const L = layerAt.map((a) => prog(f, a, 22, EASE.expo));
  const PW = w - 300; // plan area width (toggles take 300 on the inline-start side)
  const PH = h - 40;
  const ox = 300;
  const cols = 6;
  const rows = 4;
  const gx = (i: number) => 60 + (i * (PW - 120)) / cols;
  const gy = (j: number) => 60 + (j * (PH - 150)) / rows;
  const zones = [
    { c: [0, 0, 2, 2], col: '#2F6FED', n: 'Z1' },
    { c: [2, 0, 4, 2], col: '#0E93AC', n: 'Z2' },
    { c: [4, 0, 6, 2], col: '#EC835A', n: 'Z3' },
    { c: [0, 2, 3, 4], col: '#0CA30C', n: 'Z4' },
    { c: [3, 2, 6, 4], col: '#B8860B', n: 'Z5' },
  ];
  const lift = (p: number) => `translateY(${((1 - p) * -40).toFixed(1)}px)`;
  const mx = (v: number) => (rtl ? PW - v : v);
  return (
    <Box x={x} y={y} w={w} h={h}>
      {/* toggles */}
      <div style={{ position: 'absolute', insetInlineStart: 0, top: 30, width: 260, display: 'flex', flexDirection: 'column', gap: 16 }}>
        {c.layers.map((t, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 18px', borderRadius: 16, background: '#FFFFFF', border: `1.5px solid ${L[i] > 0.5 ? C.accent : C.border}`, boxShadow: L[i] > 0.5 ? ELEV : 'none', opacity: 0.45 + 0.55 * base }}>
            <span style={{ position: 'relative', width: 50, height: 28, borderRadius: 14, background: L[i] > 0.5 ? C.accent : C.border2, flex: 'none' }}>
              <span style={{ position: 'absolute', top: 3, insetInlineStart: mix(3, 25, L[i]), width: 22, height: 22, borderRadius: 11, background: '#FFFFFF' }} />
            </span>
            <span style={{ fontSize: 30, fontWeight: 600, color: L[i] > 0.5 ? C.ink : C.ink3 }}>{t}</span>
          </div>
        ))}
      </div>
      {/* sheet */}
      <div style={{ position: 'absolute', insetInlineStart: ox, top: 0, width: PW, height: PH, borderRadius: 20, background: '#FBFCFE', ...metalBorder('#FBFCFE', 2), boxShadow: ELEV, overflow: 'hidden', opacity: base }}>
        <svg width={PW} height={PH} style={{ position: 'absolute', inset: 0 }}>
          {/* grid lines A..G / 1..5 */}
          {Array.from({ length: cols + 1 }, (_, i) => (
            <line key={`v${i}`} x1={mx(gx(i))} y1={30} x2={mx(gx(i))} y2={PH - 70} stroke={C.ink3} strokeOpacity={0.35} strokeWidth={1.4} strokeDasharray="10 6 2 6" />
          ))}
          {Array.from({ length: rows + 1 }, (_, j) => (
            <line key={`h${j}`} x1={30} y1={gy(j)} x2={PW - 30} y2={gy(j)} stroke={C.ink3} strokeOpacity={0.35} strokeWidth={1.4} strokeDasharray="10 6 2 6" />
          ))}
          {Array.from({ length: cols + 1 }, (_, i) =>
            Array.from({ length: rows + 1 }, (_, j) => <rect key={`c${i}${j}`} x={mx(gx(i)) - 7} y={gy(j) - 7} width={14} height={14} fill={C.ink} opacity={0.75} />),
          )}
          {/* outline + core */}
          <rect x={Math.min(mx(gx(0)), mx(gx(cols)))} y={gy(0)} width={Math.abs(mx(gx(cols)) - mx(gx(0)))} height={gy(rows) - gy(0)} fill="none" stroke={C.ink} strokeWidth={4} />
          <rect x={Math.min(mx(gx(2.6)), mx(gx(3.4)))} y={gy(1.4)} width={Math.abs(mx(gx(3.4)) - mx(gx(2.6)))} height={gy(2.6) - gy(1.4)} fill="#E8EEF6" stroke={C.ink} strokeWidth={3} />
          {/* layer 1: zones */}
          <g style={{ opacity: L[0], transform: lift(L[0]) }}>
            {zones.map((z, i) => {
              const xa = Math.min(mx(gx(z.c[0])), mx(gx(z.c[2])));
              const ww = Math.abs(mx(gx(z.c[2])) - mx(gx(z.c[0])));
              return (
                <g key={i}>
                  <rect x={xa + 6} y={gy(z.c[1]) + 6} width={ww - 12} height={gy(z.c[3]) - gy(z.c[1]) - 12} fill={z.col} fillOpacity={0.12} stroke={z.col} strokeWidth={2.5} rx={8} />
                  <text x={xa + 22} y={gy(z.c[1]) + 40} fontFamily={FONT.mono} fontSize={24} fontWeight={600} fill={z.col}>{z.n}</text>
                </g>
              );
            })}
          </g>
          {/* layer 2: cranes */}
          <g style={{ opacity: L[1], transform: lift(L[1]) }}>
            {[
              [1.2, 1.2, 'TC-1'],
              [4.6, 2.9, 'TC-2'],
            ].map(([i, j, n]) => (
              <g key={n as string}>
                <circle cx={mx(gx(i as number))} cy={gy(j as number)} r={170} fill="#B8860B" fillOpacity={0.06} stroke="#B8860B" strokeWidth={2.5} strokeDasharray="12 8" />
                <rect x={mx(gx(i as number)) - 14} y={gy(j as number) - 14} width={28} height={28} fill="#B8860B" />
                <text x={mx(gx(i as number)) + 22} y={gy(j as number) - 20} fontFamily={FONT.mono} fontSize={24} fontWeight={600} fill="#8A5A00">{n}</text>
              </g>
            ))}
          </g>
          {/* layer 3: cameras (view cones) */}
          <g style={{ opacity: L[2], transform: lift(L[2]) }}>
            {[
              [0.15, 0.2, 35],
              [5.85, 0.2, 145],
              [5.85, 3.8, 215],
              [0.15, 3.8, -35],
            ].map(([i, j, a], k) => {
              const cx = mx(gx(i));
              const cy = gy(j);
              const ang = ((rtl ? 180 - a : a) * Math.PI) / 180;
              const r = 150;
              const s = 0.42;
              const p1 = [cx + r * Math.cos(ang - s), cy + r * Math.sin(ang - s)];
              const p2 = [cx + r * Math.cos(ang + s), cy + r * Math.sin(ang + s)];
              return (
                <g key={k}>
                  <path d={`M${cx} ${cy} L${p1[0]} ${p1[1]} A${r} ${r} 0 0 1 ${p2[0]} ${p2[1]} Z`} fill="#0E93AC" fillOpacity={0.16} stroke="#0E93AC" strokeWidth={2} />
                  <circle cx={cx} cy={cy} r={11} fill="#0E1726" stroke="#19C6E6" strokeWidth={3} />
                </g>
              );
            })}
          </g>
        </svg>
        {/* layer 4: QR points */}
        <div style={{ position: 'absolute', inset: 0, opacity: L[3], transform: lift(L[3]) }}>
          {[
            [1, 1],
            [3, 0.5],
            [5, 1.5],
            [2, 3],
            [4.4, 3.4],
          ].map(([i, j], k) => (
            <div key={k} style={{ position: 'absolute', left: mx(gx(i)) - 22, top: gy(j) - 22, width: 44, height: 44, borderRadius: 8, background: '#FFFFFF', border: `2.5px solid ${C.ink}`, padding: 4, boxSizing: 'border-box', boxShadow: '0 4px 10px -4px rgba(0,0,0,0.4)' }}>
              <QrCode size={31} />
            </div>
          ))}
        </div>
        {/* title block */}
        <div style={{ position: 'absolute', insetInlineEnd: 24, bottom: 18, display: 'flex', alignItems: 'center', gap: 14, padding: '10px 18px', borderRadius: 10, border: `1.5px solid ${C.ink}`, background: '#FFFFFF', fontSize: 24, fontWeight: 600, color: C.ink }}>
          <Icon name="plan" size={26} color={C.ink} />
          {c.sheet}
          <Mono size={22} color={C.ink2}>A-12-101 · C</Mono>
        </div>
      </div>
    </Box>
  );
};

/* ════════════════ Panorama window (continuous pan, wrap-around) ════════════════ */
export const PanoramaWindow: React.FC<{ x: number; y: number; w: number; h: number; pan: number; imgW: number; imgH: number; offsetY: number; opacity?: number; children?: React.ReactNode }> = ({
  x,
  y,
  w,
  h,
  pan,
  imgW,
  imgH,
  offsetY,
  opacity = 1,
  children,
}) => {
  const ox = -(((pan % imgW) + imgW) % imgW);
  return (
    <Box x={x} y={y} w={w} h={h} style={{ borderRadius: 28, ...metalBorder('#0B1220', 2.5), boxShadow: '0 30px 70px -30px rgba(0,0,0,0.75)', overflow: 'hidden', opacity }}>
      <div style={{ position: 'absolute', inset: 0, borderRadius: 26, overflow: 'hidden' }}>
        <div dir="ltr" style={{ position: 'absolute', left: 0, top: -offsetY, width: imgW * 2, height: imgH, transform: `translateX(${ox.toFixed(2)}px)` }}>
          <Img src={staticFile('v2/film/panorama.jpg')} style={{ position: 'absolute', left: 0, top: 0, width: imgW, height: imgH }} />
          <Img src={staticFile('v2/film/panorama.jpg')} style={{ position: 'absolute', left: imgW - 1, top: 0, width: imgW, height: imgH }} />
        </div>
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(5,10,20,0.35) 0%, rgba(5,10,20,0) 26%, rgba(5,10,20,0) 70%, rgba(5,10,20,0.45) 100%)' }} />
        {children}
      </div>
    </Box>
  );
};

/** 360° compass: a ring with the heading needle. */
export const Compass: React.FC<{ heading: number; size?: number }> = ({ heading, size = 96 }) => (
  <div style={{ position: 'relative', width: size, height: size }}>
    <svg width={size} height={size} viewBox="0 0 100 100" style={{ position: 'absolute', inset: 0 }}>
      <circle cx={50} cy={50} r={46} fill="rgba(8,14,26,0.55)" stroke="rgba(255,255,255,0.7)" strokeWidth={2} />
      {Array.from({ length: 24 }, (_, i) => (
        <line key={i} x1={50} y1={7} x2={50} y2={i % 6 === 0 ? 15 : 11} stroke="#FFFFFF" strokeOpacity={0.7} strokeWidth={1.6} transform={`rotate(${i * 15 - heading} 50 50)`} />
      ))}
      <path d="M50 22 L58 50 L50 46 L42 50 Z" fill="#FF8A2E" />
    </svg>
    <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', paddingTop: 30, fontFamily: FONT.en, fontSize: size * 0.2, fontWeight: 700, color: '#FFFFFF' }}>360°</div>
  </div>
);

/* ════════════════ Architecture strip ════════════════ */
export const ArchStrip: React.FC<{ y: number; srcAt: number[]; gwAt: number; platAt: number; fieldAt: number[] }> = ({ y, srcAt, gwAt, platAt, fieldAt }) => {
  const f = useCurrentFrame();
  const { rtl, c } = useFilm();
  const SRC = { x: 120, w: 420, h: 92, gap: 22 };
  const GW = { x: 690, w: 330, h: 170 };
  const PL = { x: 1120, w: 340, h: 230 };
  const FD = { x: 1590, w: 250, h: 92, gap: 30 };
  const srcY = (i: number) => y + i * (SRC.h + SRC.gap);
  const midY = y + (4 * SRC.h + 3 * SRC.gap) / 2;
  const fieldY = (i: number) => midY - (3 * FD.h + 2 * FD.gap) / 2 + i * (FD.h + FD.gap);
  const gw = prog(f, gwAt, 18, EASE.expo);
  const pl = prog(f, platAt, 18, EASE.expo);
  const srcIcons: IconName[] = ['doc', 'cart', 'calendar', 'building'];
  const fieldIcons: IconName[] = ['wifioff', 'qr', 'camera'];
  const flow = (f % 40) / 40;
  return (
    <>
      <svg width={1920} height={1080} style={{ position: 'absolute', left: 0, top: 0, overflow: 'visible' }}>
        {srcAt.map((a, i) => {
          const d = prog(f, Math.max(a + 6, gwAt), 16, EASE.inOut);
          const x0 = SRC.x + SRC.w;
          const y0 = srcY(i) + SRC.h / 2;
          const x1 = GW.x;
          const y1 = midY;
          const path = `M ${px(rtl, x0)} ${y0} C ${px(rtl, x0 + 70)} ${y0}, ${px(rtl, x1 - 70)} ${y1}, ${px(rtl, x1)} ${y1}`;
          return <Wire key={i} d={path} draw={d} color="rgba(255,255,255,0.55)" width={2.5} pulse={d >= 1 ? (flow + i * 0.25) % 1 : null} />;
        })}
        <Wire d={`M ${px(rtl, GW.x + GW.w)} ${midY} L ${px(rtl, PL.x)} ${midY}`} draw={prog(f, platAt - 6, 14, EASE.inOut)} color="rgba(255,255,255,0.7)" width={3} pulse={pl >= 1 ? flow : null} />
        {fieldAt.map((a, i) => {
          const d = prog(f, a - 4, 14, EASE.inOut);
          const x0 = PL.x + PL.w;
          const x1 = FD.x;
          const y1 = fieldY(i) + FD.h / 2;
          const path = `M ${px(rtl, x0)} ${midY} C ${px(rtl, x0 + 60)} ${midY}, ${px(rtl, x1 - 60)} ${y1}, ${px(rtl, x1)} ${y1}`;
          return <Wire key={i} d={path} draw={d} color="rgba(255,255,255,0.55)" width={2.5} pulse={d >= 1 ? (flow + 0.5 + i * 0.2) % 1 : null} />;
        })}
      </svg>
      {c.archSources.map((t, i) => {
        const p = prog(f, srcAt[i], 16, EASE.expo);
        return (
          <Box key={i} x={SRC.x} y={srcY(i)} w={SRC.w} h={SRC.h} style={{ ...darkCard, opacity: p, transform: `translateX(${((rtl ? 1 : -1) * (1 - p) * 40).toFixed(1)}px)` }}>
            <Icon name={srcIcons[i]} size={36} color="#FFD9B0" />
            <span style={{ fontSize: 32, fontWeight: 600 }}>{t}</span>
          </Box>
        );
      })}
      <Box x={GW.x} y={midY - GW.h / 2} w={GW.w} h={GW.h} style={{ ...darkCard, flexDirection: 'column', justifyContent: 'center', gap: 12, opacity: gw, transform: `scale(${mix(0.85, 1, gw).toFixed(3)})`, border: '2px dashed rgba(255,194,127,0.7)' }}>
        <Icon name="gateway" size={52} color="#FFD9B0" />
        <span style={{ fontSize: 34, fontWeight: 650 }}>{c.gateway}</span>
      </Box>
      <Box x={PL.x} y={midY - PL.h / 2} w={PL.w} h={PL.h} style={{ borderRadius: 26, ...metalBorder('#FFFFFF', 2.5), boxShadow: '0 30px 60px -24px rgba(0,0,0,0.6)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14, opacity: pl, transform: `scale(${mix(0.85, 1, pl).toFixed(3)})` }}>
        <Emblem size={84} id="arch" />
        <span style={{ fontSize: 38, fontWeight: 700, color: C.ink }}>{c.platform}</span>
      </Box>
      <div style={{ position: 'absolute', top: fieldY(0) - 52, insetInlineStart: FD.x, width: FD.w, textAlign: 'center', fontSize: 28, fontWeight: 600, color: '#C9D6EA', opacity: prog(f, fieldAt[0], 14, EASE.out) }}>{c.field}</div>
      {c.fieldItems.map((t, i) => {
        const p = prog(f, fieldAt[i], 16, EASE.expo);
        return (
          <Box key={i} x={FD.x} y={fieldY(i)} w={FD.w} h={FD.h} style={{ ...darkCard, justifyContent: 'center', opacity: p, transform: `translateX(${((rtl ? -1 : 1) * (1 - p) * 40).toFixed(1)}px)` }}>
            <Icon name={fieldIcons[i]} size={34} color="#FFD9B0" />
            <span style={{ fontSize: 28, fontWeight: 600, whiteSpace: 'nowrap' }}>{t}</span>
          </Box>
        );
      })}
    </>
  );
};
const darkCard: React.CSSProperties = {
  borderRadius: 20,
  background: 'rgba(255,255,255,0.07)',
  border: '1.5px solid rgba(255,255,255,0.22)',
  display: 'flex',
  alignItems: 'center',
  gap: 16,
  padding: '0 24px',
  color: '#FFFFFF',
};

export { Ring };
