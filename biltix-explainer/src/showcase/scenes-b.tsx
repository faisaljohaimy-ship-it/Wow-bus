/**
 * Scenes 7–13 of the MVP showcase: spatial view and simulated camera, the 13 validated demo sources, the 23
 * screens, the design language, phones and quality, honest status labels, closing.
 */
import React from 'react';
import { AbsoluteFill, Img, useCurrentFrame } from 'remotion';
import { Emblem } from '../components/Emblem';
import { Metal } from '../components/Metal';
import { Layer, StageView } from '../components/Stage';
import { mix, prog } from '../lib/anim';
import { camAt, type Shot } from '../lib/camera';
import { C, EASE, FONT, METAL } from '../theme';
import { cap, mark, marks, navTitle, pad, ROUTES, sources, src, thumb, union, worldRect, type Placed, type Rect } from './captures';
import { T } from './copy';
import { CornerTicks, frameRect, ix, MetalFrame, type SceneProps } from './kit';
import { BrowserFrame, Callout, Check, Chip, Highlight, PhoneFrame, rectToScreen, ShotCard } from './ui';

const VIEW = (c: { cssW: number }): Rect => ({ x: 0, y: 0, w: c.cssW, h: 900 });

/* ── 7 · site spatial view: the selected zone and its links, then the simulated camera ── */
export const S7Spatial: React.FC<SceneProps> = ({ lang, t }) => {
  const f = useCurrentFrame();
  const rtl = lang === 'ar';
  const N = t.frames;
  const sz = cap(lang, 'spatial-zone');
  const sc = cap(lang, 'spatial-camera');
  const p0: Placed = { c: sz, x: 160, y: 96, scale: 1 };
  const p1: Placed = { ...p0, c: sc };
  const zone = worldRect(p0, mark(sz, 'zoneSel'));
  const plan = worldRect(p0, mark(sz, 'plan'));
  const vs = mark(sc, 'viewerStatus');
  const simBadge = marks(sc, 'demo').find((r) => Math.abs(r.y - vs.y) < 8) || { ...vs, w: 120 };
  const chips = worldRect(p1, union(vs, mark(sc, 'viewerHonest')));
  const feed = worldRect(p1, mark(sc, 'viewerFeed'));
  const dialog = worldRect(p1, mark(sc, 'dialog'));
  const open = Math.round(N * 0.46);
  const shots: Shot[] = [
    { ...frameRect(0, plan, 0.95, 1.2) },
    frameRect(Math.round(N * 0.28), pad(zone, 110, 90), 0.82, 1.85),
    frameRect(open, pad(zone, 110, 90), 0.82, 1.85),
    frameRect(Math.round(N * 0.66), union(chips, { ...feed, h: feed.h * 0.35 }), 0.86, 1.7),
    frameRect(N + 14, dialog, 0.94, 1.25),
  ];
  const cam = camAt(f, shots);
  const fadeCam = prog(f, open, 12, EASE.inOut);
  const zs = rectToScreen(cam, zone);
  return (
    <AbsoluteFill>
      <StageView cam={cam}>
        <Layer>
          <ShotCard p={p0} crop={VIEW(sz)} radius={16} />
          {fadeCam > 0 && <ShotCard p={p1} crop={VIEW(sc)} radius={16} opacity={fadeCam} shadow={false} />}
          <Highlight r={pad(zone, 6)} rtl={rtl} at={Math.round(N * 0.22)} out={open} radius={10} color="#E8731B" />
          <Highlight r={pad(worldRect(p1, simBadge), 6)} rtl={rtl} at={Math.round(N * 0.64)} radius={14} />
        </Layer>
      </StageView>
      <Callout box={zs} ay={0.3} dx={140} dy={-90} label={T[lang].zone} at={Math.round(N * 0.26)} out={open} rtl={rtl} />
    </AbsoluteFill>
  );
};

/* ── 8 · 13 demo data sources, validated before analysis ── */
export const S8Sources: React.FC<SceneProps> = ({ lang, t }) => {
  const f = useCurrentFrame();
  const rtl = lang === 'ar';
  const N = t.frames;
  const list = sources(lang);
  const ig = cap(lang, 'integrations');
  const bs = 0.62;
  const bw = 1600 * bs;
  const enter = prog(f, 0, 26, EASE.expo);
  const scroll = mix(0, 140, prog(f, 10, N + 14, EASE.cam));
  const bx = ix(rtl, 1920 - 90 - bw, bw) + (rtl ? -1 : 1) * (1 - enter) * 160;
  const cw = 690;
  // the counter follows the ticks: it shows how many sources are ticked so far
  const tickAt = (i: number) => Math.round(N * 0.1) + i * 3 + 4;
  const n = list.filter((_, i) => f >= tickAt(i) + 6).length;
  const cardIn = prog(f, 2, 22, EASE.out);
  return (
    <AbsoluteFill>
      <div style={{ opacity: enter }}>
        <BrowserFrame p={{ c: ig, x: bx, y: 230 - scroll * bs, scale: bs }} crop={{ x: 0, y: scroll, w: 1600, h: 900 }} url={`biltix-risk-ai.vercel.app/${lang === 'en' ? '?lang=en' : ''}#/integrations`} bar={40} radius={18} />
      </div>
      <div style={{ opacity: cardIn, transform: `translateY(${(1 - cardIn) * 22}px)` }}>
        <Metal x={96} y={132} w={cw} h={760} rtl={rtl} r={24} comet={{ speed: 11, len: 170, phase: 0.1 }}>
          <div style={{ position: 'absolute', insetInlineStart: 40, insetInlineEnd: 40, top: 30 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 26 }}>
              <span dir="ltr" style={{ fontFamily: FONT.en, fontSize: 132, fontWeight: 600, color: C.ink, fontVariantNumeric: 'tabular-nums', lineHeight: 1, minWidth: 160, textAlign: rtl ? 'right' : 'left' }}>
                {n}
              </span>
              <div>
                <div style={{ fontSize: 34, fontWeight: 600, color: C.ink, lineHeight: 1.25 }}>{T[lang].sources}</div>
                <div style={{ fontSize: 24, fontWeight: 500, color: C.ink3, marginTop: 6 }}>{T[lang].validated}</div>
              </div>
            </div>
            <div style={{ height: 1, background: C.border, margin: '26px 0 14px' }} />
            {list.map((name, i) => {
              const at = Math.round(N * 0.1) + i * 3;
              const p = prog(f, at, 14, EASE.out);
              return (
                <div key={name} style={{ display: 'flex', alignItems: 'center', gap: 16, height: 40.5, opacity: p, transform: `translateX(${(rtl ? 1 : -1) * (1 - p) * 16}px)` }}>
                  <Check size={26} color={C.green} draw={prog(f, tickAt(i), 12, EASE.inOut)} />
                  <span style={{ fontSize: 24, fontWeight: 500, color: C.ink, whiteSpace: 'nowrap', unicodeBidi: 'plaintext' }}>{name}</span>
                </div>
              );
            })}
          </div>
        </Metal>
      </div>
    </AbsoluteFill>
  );
};

/* ── 9 · the 23 screens: a mosaic of real thumbnails, the camera travelling across it ── */
export const S9Mosaic: React.FC<SceneProps> = ({ lang, t }) => {
  const f = useCurrentFrame();
  const rtl = lang === 'ar';
  const N = t.frames;
  const TW = 480;
  const TH = 270;
  const LH = 62;
  const GX = 44;
  const GY = 40;
  const COLS = 6;
  const gw = COLS * TW + (COLS - 1) * GX;
  const gh = 4 * (TH + LH) + 3 * GY;
  const ox = 960 - gw / 2;
  const oy = 540 - gh / 2;
  const cell = (i: number) => {
    const col = i % COLS;
    const row = Math.floor(i / COLS);
    const c = rtl ? COLS - 1 - col : col;
    return { x: ox + c * (TW + GX), y: oy + row * (TH + LH + GY) };
  };
  const start = rtl ? { x: 960 + gw * 0.3, y: 540 - gh * 0.26 } : { x: 960 - gw * 0.3, y: 540 - gh * 0.26 };
  const end = rtl ? { x: 960 - gw * 0.2, y: 540 + gh * 0.2 } : { x: 960 + gw * 0.2, y: 540 + gh * 0.2 };
  const shots: Shot[] = [
    { f: 0, x: start.x, y: start.y, z: -620, roll: rtl ? 2 : -2 },
    { f: N + 14, x: end.x, y: end.y, z: -300, roll: rtl ? 0.5 : -0.5 },
  ];
  const cam = camAt(f, shots);
  return (
    <AbsoluteFill>
      <StageView cam={cam}>
        <Layer>
          <div style={{ position: 'absolute', left: 0, top: 0, width: 1920, height: 1080, transform: `rotate(${rtl ? 6 : -6}deg)`, transformOrigin: '960px 540px' }}>
            {ROUTES.map((r, i) => {
              const { x, y } = cell(i);
              const p = prog(f, i * 1.2, 22, EASE.out);
              return (
                <div key={r} style={{ position: 'absolute', left: x, top: y, width: TW, opacity: p, transform: `translateY(${(1 - p) * 40}px)` }}>
                  <div style={{ width: TW, height: TH, borderRadius: 14, overflow: 'hidden', border: '2px solid transparent', boxSizing: 'border-box', background: `linear-gradient(#fff, #fff) padding-box, ${METAL} border-box`, boxShadow: '0 2px 4px rgba(19,34,56,0.06), 0 18px 34px -20px rgba(19,34,56,0.35)' }}>
                    <Img src={thumb(lang, r)} style={{ width: '100%', height: '100%', display: 'block' }} />
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 14, height: LH, padding: '0 6px' }}>
                    <span dir="ltr" style={{ fontFamily: FONT.mono, fontSize: 22, color: C.accentText, fontWeight: 500 }}>{String(i + 1).padStart(2, '0')}</span>
                    <span style={{ fontSize: 28, fontWeight: 600, color: C.ink, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{navTitle(lang, r)}</span>
                  </div>
                </div>
              );
            })}
            {(() => {
              const { x, y } = cell(23);
              const p = prog(f, 30, 24, EASE.out);
              return (
                <div style={{ position: 'absolute', left: x, top: y, width: TW, height: TH, opacity: p }}>
                  <Metal x={0} y={0} w={TW} h={TH} rtl={rtl} r={16} comet={{ speed: 10, len: 150 }}>
                    <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 22 }}>
                      <span dir="ltr" style={{ fontFamily: FONT.en, fontSize: 128, fontWeight: 600, color: C.ink, lineHeight: 1 }}>23</span>
                      <span style={{ fontSize: 40, fontWeight: 600, color: C.ink2 }}>{T[lang].screens}</span>
                    </div>
                  </Metal>
                </div>
              );
            })()}
          </div>
        </Layer>
      </StageView>
    </AbsoluteFill>
  );
};

/* ── 10 · design language: a real card under the metal edge and laser, tokens, type ── */
const SWATCHES: Array<[string, string]> = [
  ['--bg-0', '#F4F7FB'],
  ['--ink-1', '#132238'],
  ['--brand', '#2F6FED'],
  ['--accent', '#0E93AC'],
  ['--edge-metal', 'metal'],
  ['--beam-core', '#FF5E00'],
  ['--good', '#0CA30C'],
  ['--warning', '#FAB219'],
  ['--critical', '#D03B3B'],
];
export const S10Design: React.FC<SceneProps> = ({ lang, t }) => {
  const f = useCurrentFrame();
  const rtl = lang === 'ar';
  const N = t.frames;
  const ck = cap(lang, 'cockpit');
  const tile = pad(mark(ck, 'metric', 0), -3);
  const cw = 740;
  const s = cw / tile.w;
  const chH = tile.h * s;
  const cx = ix(rtl, 150, cw);
  const cy = 230;
  const push = prog(f, 0, N + 14, EASE.cam);
  const card = prog(f, 0, 22, EASE.out);
  const g = (at: number) => prog(f, at, 18, EASE.inOut);
  const sx = ix(rtl, 1060, 700);
  return (
    <AbsoluteFill style={{ transform: `scale(${1 + 0.035 * push})`, transformOrigin: '960px 500px' }}>
      {/* construction lines */}
      <svg width={1920} height={1080} style={{ position: 'absolute', inset: 0, overflow: 'visible' }}>
        <g stroke={C.ink} strokeOpacity={0.28} strokeWidth={1.3} fill="none" strokeDasharray="5 7">
          <path d={`M ${cx - 90} ${cy} H ${cx - 90 + (cw + 180) * g(6)}`} />
          <path d={`M ${cx - 90} ${cy + chH} H ${cx - 90 + (cw + 180) * g(10)}`} />
          <path d={`M ${cx} ${cy - 90} V ${cy - 90 + (chH + 180) * g(8)}`} />
          <path d={`M ${cx + cw} ${cy - 90} V ${cy - 90 + (chH + 180) * g(12)}`} />
        </g>
        {/* width dimension */}
        <g opacity={g(16)} stroke={C.ink} strokeOpacity={0.55} strokeWidth={1.4}>
          <path d={`M ${cx} ${cy + chH + 46} H ${cx + cw}`} />
          <path d={`M ${cx} ${cy + chH + 38} v 16 M ${cx + cw} ${cy + chH + 38} v 16`} />
        </g>
      </svg>
      <div dir="ltr" style={{ position: 'absolute', left: cx + cw / 2 - 120, width: 240, top: cy + chH + 58, textAlign: 'center', fontFamily: FONT.mono, fontSize: 20, color: C.ink3, opacity: g(16) }}>
        .metric-tile
      </div>
      <div dir="ltr" style={{ position: 'absolute', top: cy - 62, ...(rtl ? { right: 1920 - cx - cw + 44 } : { left: cx + 44 }), fontFamily: FONT.mono, fontSize: 20, color: '#A4471F', opacity: g(22), whiteSpace: 'nowrap' }}>
        --radius-lg · 14px
      </div>
      <div style={{ opacity: card, transform: `translateY(${(1 - card) * 18}px)` }}>
        <Metal x={150} y={cy} w={cw} h={chH} rtl={rtl} r={30} comet={{ speed: 14, len: 220, phase: 0.62 }}>
          <div style={{ position: 'absolute', inset: 0, borderRadius: 28, overflow: 'hidden' }}>
            <Img src={src(ck)} style={{ position: 'absolute', left: -tile.x * s, top: -tile.y * s, width: ck.cssW * s, height: ck.cssH * s, maxWidth: 'none' }} />
          </div>
        </Metal>
      </div>
      {/* radius guide at the inline-start top corner, over the card */}
      <svg width={1920} height={1080} style={{ position: 'absolute', inset: 0, overflow: 'visible', opacity: g(20) }}>
        <circle cx={rtl ? cx + cw - 30 : cx + 30} cy={cy + 30} r={30} fill="none" stroke="#E8731B" strokeWidth={1.8} strokeDasharray="3 5" />
        <path d={`M ${rtl ? cx + cw - 30 : cx + 30} ${cy + 30} L ${rtl ? cx + cw - 9 : cx + 9} ${cy + 9} L ${rtl ? cx + cw + 30 : cx - 30} ${cy - 30}`} fill="none" stroke="#E8731B" strokeWidth={1.6} />
      </svg>
      {/* labels for edge and laser */}
      <div style={{ position: 'absolute', top: cy + chH + 110, ...(rtl ? { right: 150 } : { left: 150 }), display: 'flex', gap: 18, opacity: g(26) }}>
        <Chip color="#E8731B" mark="diamond" size={22}>{T[lang].metal}</Chip>
        <Chip color="#FF5E00" mark="dot" size={22}>{T[lang].laser}</Chip>
      </div>
      {/* tokens */}
      <div style={{ position: 'absolute', left: sx, top: 196, width: 700 }}>
        <div style={{ fontSize: 26, fontWeight: 600, color: C.ink2, marginBottom: 22, opacity: g(10) }}>{T[lang].tokens}</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '22px 26px' }}>
          {SWATCHES.map(([name, hex], i) => {
            const p = prog(f, 12 + i * 2, 16, EASE.out);
            return (
              <div key={name} style={{ opacity: p, transform: `translateY(${(1 - p) * 14}px)` }}>
                <div style={{ height: 96, borderRadius: 16, background: hex === 'metal' ? METAL : hex, border: hex === '#F4F7FB' ? `1px solid ${C.border2}` : '1px solid rgba(19,34,56,0.08)', boxShadow: '0 1px 2px rgba(19,34,56,0.06)' }} />
                <div dir="ltr" style={{ fontFamily: FONT.mono, fontSize: 19, color: C.ink, marginTop: 10, textAlign: rtl ? 'right' : 'left' }}>{name}</div>
                <div dir="ltr" style={{ fontFamily: FONT.mono, fontSize: 17, color: C.ink3, marginTop: 2, textAlign: rtl ? 'right' : 'left' }}>{hex === 'metal' ? 'nickel-orange' : hex}</div>
              </div>
            );
          })}
        </div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 26, marginTop: 30, opacity: g(30) }}>
          <span style={{ fontFamily: FONT.en, fontSize: 84, fontWeight: 600, color: C.ink, lineHeight: 1 }}>Aa</span>
          <span lang="ar" style={{ fontFamily: FONT.ar, fontSize: 84, fontWeight: 600, color: C.ink, lineHeight: 1 }}>أب</span>
          <span dir="ltr" style={{ fontFamily: FONT.mono, fontSize: 19, color: C.ink3 }}>{T[lang].type}</span>
        </div>
      </div>
    </AbsoluteFill>
  );
};

/* ── 11 · phones, and quality checks that were measured ── */
export const S11Quality: React.FC<SceneProps & { tests: number; widths: number; noOverflow: boolean }> = ({ lang, t, tests, widths, noOverflow }) => {
  const f = useCurrentFrame();
  const rtl = lang === 'ar';
  const N = t.frames;
  const phones = ['phone-cockpit', 'phone-airisks', 'phone-spatial'].map((n) => cap(lang, n));
  const sc = 0.76;
  const pw = 390 * sc;
  const centers = [300, 640, 980].map((x) => (rtl ? 1920 - x : x));
  const rot = [-6, 0, 6].map((r) => (rtl ? -r : r));
  const items: Array<[string, string]> = [
    [String(tests), T[lang].tests],
    [String(widths), noOverflow ? T[lang].widths : lang === 'ar' ? 'عروض شاشة مفحوصة' : 'screen widths checked'],
    ['AR · EN', T[lang].bilingual],
    ['A11y', T[lang].wcag],
  ];
  const lx = ix(rtl, 1230, 600);
  const drift = prog(f, 0, N + 14, EASE.cam);
  return (
    <AbsoluteFill>
      {phones.map((c, i) => {
        const order = [0, 2, 1][i];
        const p = prog(f, order * 4, 30, EASE.expo);
        const mid = i === 1;
        return (
          <div
            key={c.file}
            style={{
              position: 'absolute',
              left: 0,
              top: 0,
              width: 1920,
              height: 1080,
              opacity: p,
              transform: `translate(${centers[i] - pw / 2}px, ${(mid ? 150 : 196) + (1 - p) * 240 - drift * (mid ? 26 : 14)}px) rotate(${rot[i] * p}deg) scale(${mid ? 1.04 : 0.96})`,
              transformOrigin: `${pw / 2}px 340px`,
              zIndex: mid ? 2 : 1,
            }}
          >
            <PhoneFrame p={{ c, x: 0, y: 0, scale: sc }} />
          </div>
        );
      })}
      <div style={{ position: 'absolute', left: lx, top: 200, width: 600, display: 'flex', flexDirection: 'column', gap: 22 }}>
        {items.map(([big, label], i) => {
          const p = prog(f, 10 + i * 5, 18, EASE.out);
          return (
            <div
              key={label}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 22,
                padding: '18px 26px',
                borderRadius: 20,
                background: '#FFFFFF',
                border: `1px solid ${C.border}`,
                boxShadow: '0 2px 4px rgba(19,34,56,0.05), 0 18px 36px -22px rgba(19,34,56,0.35)',
                opacity: p,
                transform: `translateX(${(rtl ? -1 : 1) * (1 - p) * 30}px)`,
              }}
            >
              <Check size={34} color={C.green} draw={prog(f, 16 + i * 5, 14, EASE.inOut)} />
              <span dir="ltr" style={{ fontFamily: FONT.en, fontSize: big.length > 4 ? 30 : 44, fontWeight: 600, color: C.ink, minWidth: 104, textAlign: 'center', fontVariantNumeric: 'tabular-nums' }}>{big}</span>
              <span style={{ fontSize: 27, fontWeight: 500, color: C.ink2, lineHeight: 1.3 }}>{label}</span>
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};

/* ── 12 · honest status: macro crops of the app's own Demo / Simulated / Illustrative labels ── */
export const S12Honesty: React.FC<SceneProps> = ({ lang, t }) => {
  const f = useCurrentFrame();
  const rtl = lang === 'ar';
  const N = t.frames;
  const ck = cap(lang, 'cockpit');
  const dr = cap(lang, 'airisks-drawer');
  const sc = cap(lang, 'spatial-camera');
  const al = cap(lang, 'alerts');
  const toStart = (r: Rect, ext: number): Rect => (rtl ? { x: r.x, y: r.y, w: r.w + ext, h: r.h } : { x: r.x - ext, y: r.y, w: r.w + ext, h: r.h });
  const demo = mark(ck, 'demo', 0);
  const ill = mark(dr, 'sim', 0);
  const vs = mark(sc, 'viewerStatus');
  const vsBadges = marks(sc, 'demo').filter((r) => Math.abs(r.y - vs.y) < 8);
  const simRow = vsBadges.length ? union(...vsBadges, { ...vsBadges[0], w: 1, x: rtl ? vsBadges[0].x - 230 : vsBadges[0].x + vsBadges[0].w + 230 }) : { ...vs, w: 360 };
  const notSent = mark(al, 'sim', 0);
  const crops: Array<{ c: typeof ck; r: Rect; badge: Rect; route: string }> = [
    { c: ck, r: pad(toStart(demo, 330), 14, 12), badge: demo, route: 'cockpit' },
    { c: dr, r: pad(toStart(ill, 112), 14, 12), badge: ill, route: 'airisks' },
    { c: sc, r: pad(simRow, 14, 12), badge: vsBadges[0] || vs, route: 'spatial' },
    { c: al, r: pad(toStart(notSent, 226), 14, 12), badge: notSent, route: 'alerts' },
  ];
  const head = prog(f, 0, 20, EASE.out);
  const push = prog(f, 0, N + 14, EASE.cam);
  const colX = [130, 990];
  const rowY = [320, 610];
  return (
    <AbsoluteFill style={{ transform: `scale(${1 + 0.04 * push})`, transformOrigin: '960px 520px' }}>
      <div style={{ position: 'absolute', top: 150, ...(rtl ? { right: 130 } : { left: 130 }), display: 'flex', alignItems: 'center', gap: 24, opacity: head, transform: `translateY(${(1 - head) * 14}px)` }}>
        <span style={{ fontSize: 56, fontWeight: 600, color: C.ink }}>{T[lang].honesty}</span>
        <Chip color={C.gold} mark="diamond" size={24}>{T[lang].demo}</Chip>
      </div>
      {crops.map(({ c, r, badge, route }, i) => {
        const scale = Math.min(2.5, 790 / r.w);
        const x = ix(rtl, colX[i % 2], r.w * scale);
        const y = rowY[Math.floor(i / 2)];
        const p = prog(f, 6 + i * 4, 22, EASE.out);
        const p0: Placed = { c, x: x - r.x * scale, y: y - r.y * scale, scale };
        return (
          <div key={i} style={{ position: 'absolute', inset: 0, opacity: p, transform: `translateY(${(1 - p) * 26}px)` }}>
            <ShotCard p={p0} crop={r} radius={16} />
            <Highlight r={pad(worldRect(p0, badge), 6)} rtl={rtl} at={20 + i * 5} radius={14} color="#E8731B" />
            <div style={{ position: 'absolute', top: y + r.h * scale + 22, ...(rtl ? { right: 1920 - x - r.w * scale } : { left: x }), fontSize: 22, fontWeight: 500, color: C.ink3, display: 'flex', gap: 10, alignItems: 'center' }}>
              <span style={{ width: 8, height: 8, borderRadius: 2, background: '#E8731B', transform: 'rotate(45deg)' }} />
              {T[lang].from} · {navTitle(lang, route)}
            </div>
          </div>
        );
      })}
    </AbsoluteFill>
  );
};

/* ── 13 · closing: wordmark, the line, the link ── */
export const S13Close: React.FC<SceneProps> = ({ lang, t }) => {
  const f = useCurrentFrame();
  const rtl = lang === 'ar';
  const FX = 360;
  const FY = 176;
  const FW = 1200;
  const FH = 450;
  const a = prog(f, 0, 24, EASE.out);
  const tag = prog(f, t.voiceFrom + Math.round((t.voiceTo - t.voiceFrom) * 0.42), 22, EASE.out);
  const link = prog(f, t.voiceTo - 6, 22, EASE.out);
  return (
    <AbsoluteFill>
      <div style={{ position: 'absolute', left: 160, top: 0, width: 1600, height: 900, background: 'radial-gradient(closest-side, rgba(255,255,255,0.9), rgba(255,255,255,0))' }} />
      <CornerTicks x={FX} y={FY} w={FW} h={FH} at={4} />
      <MetalFrame x={FX} y={FY} w={FW} h={FH} r={32} draw={prog(f, 0, 30, EASE.inOut)} comet={prog(f, 18, 20)} rtl={rtl} id="s13" />
      <div style={{ position: 'absolute', left: FX, top: FY, width: FW, height: FH, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 26 }}>
        <div dir="ltr" style={{ display: 'flex', alignItems: 'center', gap: 30, opacity: a, transform: `scale(${0.96 + 0.04 * a})` }}>
          <Emblem size={118} id="s13e" />
          <span style={{ fontFamily: FONT.en, fontSize: 96, fontWeight: 650, letterSpacing: '0.09em', color: C.ink, lineHeight: 1 }}>BILTIX</span>
          <span style={{ fontFamily: FONT.en, fontSize: 96, fontWeight: 400, color: C.ink2, lineHeight: 1 }}>Risk AI</span>
        </div>
        <div dir="rtl" lang="ar" style={{ fontFamily: FONT.ar, fontSize: 46, fontWeight: 500, color: C.ink2, opacity: prog(f, 8, 22, EASE.out) }}>{T[lang].brandAr}</div>
        <div style={{ fontSize: 36, fontWeight: 500, color: C.ink, opacity: tag, transform: `translateY(${(1 - tag) * 10}px)` }}>{T[lang].closing}</div>
      </div>
      <div style={{ position: 'absolute', top: FY + FH + 46, left: 0, width: 1920, display: 'flex', justifyContent: 'center', opacity: link, transform: `translateY(${(1 - link) * 12}px)` }}>
        <span
          dir="ltr"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 14,
            padding: '14px 30px',
            borderRadius: 999,
            border: '2px solid transparent',
            background: `linear-gradient(#fff, #fff) padding-box, ${METAL} border-box`,
            boxShadow: '0 14px 30px -18px rgba(19,34,56,0.4)',
            fontFamily: FONT.mono,
            fontSize: 30,
            fontWeight: 500,
            color: C.ink,
          }}
        >
          <svg width={26} height={26} viewBox="0 0 24 24" aria-hidden>
            <circle cx={12} cy={12} r={10} fill="none" stroke={C.accent} strokeWidth={1.8} />
            <path d="M2 12h20M12 2c3 3.2 3 16.8 0 20M12 2c-3 3.2-3 16.8 0 20" fill="none" stroke={C.accent} strokeWidth={1.6} />
          </svg>
          {T[lang].link}
        </span>
      </div>
    </AbsoluteFill>
  );
};
