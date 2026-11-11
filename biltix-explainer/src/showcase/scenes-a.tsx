/**
 * Scenes 1–6 of the MVP showcase: brand reveal, bilingual, cockpit, gauges & radar, explainable AI,
 * human approval → tracked task. Every frame of the app shown is a real capture of biltix-hse.
 */
import React from 'react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';
import { Emblem } from '../components/Emblem';
import { StageView, Layer } from '../components/Stage';
import { mix, prog } from '../lib/anim';
import { camAt, type Shot } from '../lib/camera';
import { C, EASE, FONT } from '../theme';
import { cap, mark, marks, pad, src, union, worldRect, type Placed, type Rect } from './captures';
import { T } from './copy';
import { CornerTicks, frameRect, MetalFrame, type SceneProps } from './kit';
import { BrowserFrame, Callout, Chip, Highlight, PerspectivePlane, Pointer, rectToScreen, ShotCard } from './ui';

const URL = (lang: string, route: string) => `biltix-risk-ai.vercel.app/${lang === 'en' ? '?lang=en' : ''}#/${route}`;
const VIEW = (c: { cssW: number }): Rect => ({ x: 0, y: 0, w: c.cssW, h: 900 });

/* ── 1 · brand reveal ── */
export const S1Brand: React.FC<SceneProps> = ({ lang, t }) => {
  const f = useCurrentFrame();
  const rtl = lang === 'ar';
  const N = t.frames;
  const ck = cap(lang, 'cockpit');
  const rise = prog(f, 0, N, EASE.cam);
  const FX = 380;
  const FY = 196;
  const FW = 1160;
  const FH = 400;
  const text = prog(f, 26, 26, EASE.out);
  const arName = prog(f, 40, 24, EASE.out);
  const eyebrow = prog(f, 50, 22, EASE.out);
  return (
    <AbsoluteFill>
      <PerspectivePlane file={src(ck)} imgW={ck.w} imgH={ck.h} w={1640} cx={960} cy={mix(1060, 870, rise)} pitch={mix(71, 58, rise)} opacity={0.62 * prog(f, 0, 44, EASE.out)} />
      <div
        style={{
          position: 'absolute',
          left: 160,
          top: 40,
          width: 1600,
          height: 760,
          background: 'radial-gradient(closest-side, rgba(244,247,251,0.97), rgba(244,247,251,0.82) 55%, rgba(244,247,251,0))',
        }}
      />
      <CornerTicks x={FX} y={FY} w={FW} h={FH} at={18} />
      <MetalFrame x={FX} y={FY} w={FW} h={FH} r={30} draw={prog(f, 4, 40, EASE.inOut)} comet={prog(f, 36, 24)} rtl={rtl} id="s1" />
      <div dir="ltr" style={{ position: 'absolute', left: FX + 30, top: FY - 44, fontFamily: FONT.mono, fontSize: 16, color: C.ink3, letterSpacing: '0.12em', opacity: prog(f, 24, 20) }}>
        BILTIX · RISK AI · DATUM X 0.000 · Y 0.000
      </div>
      <div style={{ position: 'absolute', left: FX, top: FY, width: FW, height: FH, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 26 }}>
        <div style={{ fontSize: 26, fontWeight: 600, color: C.accentText, letterSpacing: rtl ? 0 : '0.04em', opacity: eyebrow, transform: `translateY(${(1 - eyebrow) * 10}px)` }}>{T[lang].hse}</div>
        <div dir="ltr" style={{ display: 'flex', alignItems: 'center', gap: 34 }}>
          <Emblem size={128} draw={prog(f, 6, 30, EASE.inOut)} build={prog(f, 16, 34, EASE.out)} notch={prog(f, 44, 14, EASE.out)} id="s1e" />
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 26, opacity: text, transform: `translateY(${(1 - text) * 16}px)` }}>
            <span style={{ fontFamily: FONT.en, fontSize: 104, fontWeight: 650, letterSpacing: `${mix(0.22, 0.09, text)}em`, color: C.ink, lineHeight: 1 }}>BILTIX</span>
            <span style={{ fontFamily: FONT.en, fontSize: 104, fontWeight: 400, color: C.ink2, lineHeight: 1 }}>Risk AI</span>
          </div>
        </div>
        <div dir="rtl" lang="ar" style={{ fontFamily: FONT.ar, fontSize: 50, fontWeight: 500, color: C.ink2, opacity: arName, transform: `translateY(${(1 - arName) * 12}px)` }}>
          {T[lang].brandAr}
        </div>
      </div>
    </AbsoluteFill>
  );
};

/* ── 2 · one platform, two languages: the English and Arabic cockpits slide in, mirrored ── */
export const S2Bilingual: React.FC<SceneProps> = ({ t }) => {
  const f = useCurrentFrame();
  const N = t.frames;
  const en = cap('en', 'cockpit');
  const ar = cap('ar', 'cockpit');
  const W = 836;
  const scale = W / 1600;
  const y = 300;
  const sl = prog(f, 0, 34, EASE.expo);
  const sr = prog(f, 3, 34, EASE.expo);
  const xl = 104 - (1 - sl) * 1180;
  const xr = 1920 - 104 - W + (1 - sr) * 1180;
  const push = prog(f, 24, N - 10, EASE.cam);
  const chips = prog(f, 22, 18, EASE.out);
  const axis = prog(f, 26, 22, EASE.inOut);
  return (
    <AbsoluteFill style={{ transform: `scale(${1 + 0.04 * push})`, transformOrigin: '960px 560px' }}>
      <BrowserFrame p={{ c: en, x: xl, y, scale }} crop={VIEW(en)} url={URL('en', 'cockpit')} bar={40} radius={18} />
      <BrowserFrame p={{ c: ar, x: xr, y, scale }} crop={VIEW(ar)} url={URL('ar', 'cockpit')} bar={40} radius={18} />
      <div style={{ position: 'absolute', top: y - 40 - 78, left: xl, opacity: chips, transform: `translateY(${(1 - chips) * 10}px)` }} dir="ltr">
        <Chip color={C.primary} style={{ fontFamily: FONT.en }}>{T.en.langEn}</Chip>
      </div>
      <div style={{ position: 'absolute', top: y - 40 - 78, right: 1920 - (xr + W), opacity: chips, transform: `translateY(${(1 - chips) * 10}px)` }} dir="rtl" lang="ar">
        <Chip color={C.accent} style={{ fontFamily: FONT.ar }}>{T.ar.langAr}</Chip>
      </div>
      <svg width={1920} height={1080} style={{ position: 'absolute', inset: 0 }}>
        <path d={`M 960 ${y - 120} V ${y - 120 + 640 * axis}`} stroke={C.ink} strokeOpacity={0.3} strokeWidth={1.4} strokeDasharray="6 8" fill="none" />
        <rect x={953} y={y + 200} width={14} height={14} transform={`rotate(45 960 ${y + 207})`} fill={C.surface} stroke="#E8731B" strokeWidth={2} opacity={axis} />
      </svg>
    </AbsoluteFill>
  );
};

/* ── 3 · the cockpit in a browser, slow dolly down the full page ── */
export const S3Cockpit: React.FC<SceneProps> = ({ lang, t }) => {
  const f = useCurrentFrame();
  const N = t.frames;
  const c = cap(lang, 'cockpit-full');
  const scale = 0.9;
  const visH = 820 / scale;
  const dom = marks(c, 'domain');
  const maxScroll = dom.length ? Math.max(0, dom[0].y - 150) : 520;
  const p = prog(f, 6, N - 2, EASE.cam);
  const push = prog(f, 0, N + 14, EASE.cam);
  const enter = prog(f, 0, 20, EASE.out);
  return (
    <AbsoluteFill style={{ transform: `scale(${0.965 + 0.045 * push}) translateY(${(1 - enter) * 26}px)`, transformOrigin: '960px 520px' }}>
      <BrowserFrame p={{ c, x: 240, y: 150 - mix(0, maxScroll, p) * scale, scale }} crop={{ x: 0, y: mix(0, maxScroll, p), w: 1600, h: visH }} url={URL(lang, 'cockpit')} />
    </AbsoluteFill>
  );
};

/* ── 4 · macro: ring gauges on the domain dials, then the radar trend ── */
export const S4Gauges: React.FC<SceneProps> = ({ lang, t }) => {
  const f = useCurrentFrame();
  const rtl = lang === 'ar';
  const N = t.frames;
  const c = cap(lang, 'cockpit-full');
  const p: Placed = { c, x: 40, y: -360, scale: 1.15 };
  const dom = marks(c, 'domain');
  const rings = marks(c, 'ring');
  const row = union(...dom);
  // the site & safety dial (4th domain card in rail order), else the middle one
  const dSite = dom[Math.min(3, dom.length - 1)];
  const ringIn = (d: Rect) => rings.find((r) => r.x >= d.x && r.x + r.w <= d.x + d.w && r.y >= d.y && r.y + r.h <= d.y + d.h) || pad(d, -40);
  const ring = ringIn(dSite);
  const radarCard = mark(c, 'radarCard');
  const radars = marks(c, 'radar');
  const radar = radars[radars.length - 1] || radarCard;
  const W = (r: Rect) => worldRect(p, r);
  const pair = union(dom[Math.max(0, Math.min(2, dom.length - 2))], dSite);
  const shots: Shot[] = [
    frameRect(0, W(row), 0.92, 1.2),
    frameRect(Math.round(N * 0.36), W(pair), 0.84, 1.9),
    { ...frameRect(Math.round(N * 0.5), W(pair), 0.84, 1.9) },
    frameRect(Math.round(N * 0.8), W(radarCard), 0.78, 1.75),
    { ...frameRect(N + 14, W(radarCard), 0.78, 1.75), z: frameRect(0, W(radarCard), 0.78, 1.75).z! + 60 },
  ];
  const cam = camAt(f, shots);
  const rs = rectToScreen(cam, W(ring));
  const rr = rectToScreen(cam, W(radar));
  return (
    <AbsoluteFill>
      <StageView cam={cam}>
        <Layer>
          <ShotCard p={p} crop={{ x: row.x - 20, y: row.y - 50, w: row.w + 40, h: radarCard.y + radarCard.h + 60 - (row.y - 50) }} radius={22} />
          <Highlight r={pad(W(ring), 10)} rtl={rtl} at={Math.round(N * 0.3)} out={Math.round(N * 0.56)} radius={W(ring).w / 2 + 10} comet={false} color="#E8731B" />
          <Highlight r={pad(W(radar), 12)} rtl={rtl} at={Math.round(N * 0.74)} radius={24} color="#E8731B" />
        </Layer>
      </StageView>
      <Callout
        box={rs}
        ay={0.5}
        dx={170}
        dy={-120}
        label={T[lang].ringGauges}
        note={lang === 'ar' ? 'شعاع لكل أسبوع حول الدرجة' : 'one spoke per week around the score'}
        at={Math.round(N * 0.34)}
        out={Math.round(N * 0.54)}
        rtl={rtl}
      />
      <Callout
        box={rr}
        ay={0.3}
        dx={150}
        dy={-110}
        label={T[lang].radar}
        note={T[lang].radarNote}
        at={Math.round(N * 0.8)}
        rtl={rtl}
      />
    </AbsoluteFill>
  );
};

/* ── 5 · explainable AI: severity, confidence and data quality, the explanation, the source evidence ── */
export const S5Explain: React.FC<SceneProps> = ({ lang, t }) => {
  const f = useCurrentFrame();
  const rtl = lang === 'ar';
  const N = t.frames;
  const d0 = cap(lang, 'airisks-drawer');
  const d1 = cap(lang, 'airisks-drawer-explain');
  const d2 = cap(lang, 'airisks-drawer-evidence');
  const p0: Placed = { c: d0, x: 160, y: 96, scale: 1 };
  const p1: Placed = { ...p0, c: d1 };
  const meas = worldRect(p0, mark(d0, 'measures'));
  const ex1 = worldRect(p1, union(mark(d1, 'explain'), mark(d1, 'explainText')));
  const drawer = worldRect(p0, mark(d0, 'drawer'));
  const x01 = Math.round(N * 0.42);
  const shots: Shot[] = [
    { ...frameRect(0, drawer, 0.98, 1.05), x: 960, y: 560, z: -40 },
    frameRect(Math.round(N * 0.24), meas, 0.84, 1.95),
    frameRect(Math.round(N * 0.4), meas, 0.84, 1.95),
    frameRect(Math.round(N * 0.6), ex1, 0.8, 1.9),
    { ...frameRect(N + 14, ex1, 0.8, 1.9), y: ex1.y + ex1.h / 2 + 90 },
  ];
  const cam = camAt(f, shots);
  const ms = rectToScreen(cam, meas);
  const es = rectToScreen(cam, ex1);
  const fade1 = prog(f, x01, 12, EASE.inOut);
  // the source evidence, cropped from the Evidence tab, floats in as its own card
  // the quote and its provenance line (the reference row above it is left out of the crop)
  const evFull = mark(d2, 'evidence');
  const evR = { x: evFull.x, y: evFull.y + 36, w: evFull.w, h: evFull.h - 36 };
  const evScale = Math.min(1.25, 940 / evR.w);
  const ev = prog(f, Math.round(N * 0.66), 18, EASE.out);
  const evW = evR.w * evScale;
  const evX = rtl ? 1920 - 120 - evW : 120;
  const evY = 150;
  const side = rtl ? -1 : 1;
  return (
    <AbsoluteFill>
      <StageView cam={cam}>
        <Layer>
          <ShotCard p={p0} crop={VIEW(d0)} radius={16} />
          {fade1 > 0 && <ShotCard p={p1} crop={VIEW(d1)} radius={16} opacity={fade1} shadow={false} />}
          <Highlight r={pad(meas, 8)} rtl={rtl} at={Math.round(N * 0.22)} out={x01} radius={16} />
          <Highlight r={pad(ex1, 10)} rtl={rtl} at={Math.round(N * 0.56)} radius={14} />
        </Layer>
      </StageView>
      <Callout anchor={{ x: ms.x + ms.w / 2, y: ms.y }} dx={side * 120} dy={-70} label={T[lang].score} at={Math.round(N * 0.26)} out={x01} rtl={rtl} />
      <Callout anchor={{ x: rtl ? es.x + es.w : es.x, y: es.y + 16 }} dx={-side * 60} dy={-80} label={T[lang].why} at={Math.round(N * 0.58)} out={Math.round(N * 0.66)} rtl={rtl} />
      {ev > 0 && (
        <svg width={1920} height={1080} style={{ position: 'absolute', inset: 0, opacity: ev }}>
          <defs>
            <mask id="s5-hole">
              <rect width={1920} height={1080} fill="#fff" />
              <rect x={es.x - 14} y={es.y - 14} width={es.w + 28} height={es.h + 28} rx={18} fill="#000" />
            </mask>
          </defs>
          <rect width={1920} height={1080} fill="rgba(244,247,251,0.78)" mask="url(#s5-hole)" />
        </svg>
      )}
      {ev > 0 && (
        <div style={{ position: 'absolute', left: 0, top: 0, width: 1920, height: 1080, opacity: ev, transform: `translateY(${(1 - ev) * 24}px)` }}>
          <div style={{ position: 'absolute', top: evY - 52, ...(rtl ? { right: 120 } : { left: 120 }) }}>
            <Chip color="#E8731B" mark="diamond" size={22}>{T[lang].evidence}</Chip>
          </div>
          <ShotCard p={{ c: d2, x: evX - evR.x * evScale, y: evY - evR.y * evScale, scale: evScale }} crop={evR} radius={14} />
        </div>
      )}
    </AbsoluteFill>
  );
};

/* ── 6 · a human approves; the accepted recommendation becomes a tracked task on the board ── */
export const S6Approve: React.FC<SceneProps> = ({ lang, t }) => {
  const f = useCurrentFrame();
  const rtl = lang === 'ar';
  const N = t.frames;
  const tr = cap(lang, 'airisks-drawer-treatment');
  const ac = cap(lang, 'airisks-drawer-accept');
  const tb = cap(lang, 'tasks');
  const ta = cap(lang, 'tasks-after');
  const p0: Placed = { c: tr, x: 160, y: 96, scale: 1 };
  const p1: Placed = { ...p0, c: ac };
  const rec = worldRect(p0, mark(tr, 'rec'));
  const bA = worldRect(p0, mark(tr, 'btnAccept'));
  const bC = worldRect(p1, mark(ac, 'btnAcceptCreate'));
  const form = worldRect(p1, mark(ac, 'acceptForm'));
  const k1 = Math.round(N * 0.2);
  const swap = Math.round(N * 0.24);
  const k2 = Math.round(N * 0.38);
  const out = Math.round(N * 0.46);
  const shots: Shot[] = [
    frameRect(0, union(rec, bA), 0.8, 1.7),
    frameRect(swap, union(rec, bA), 0.8, 1.7),
    frameRect(k2 - 4, union(bC, form), 0.78, 1.7),
    frameRect(N, union(bC, form), 0.78, 1.7),
  ];
  const cam = camAt(f, shots);
  const sA = rectToScreen(cam, bA);
  const sC = rectToScreen(cam, bC);
  const fadeAc = prog(f, swap, 10, EASE.inOut);
  const drawerOut = 1 - prog(f, out, 14, EASE.inOut);
  // the board: slides in from the inline-end; the new card glides from the button into the New column
  const bp = prog(f, out - 2, 22, EASE.expo);
  const bs = 0.8;
  const bx = 960 - (1600 * bs) / 2 + (rtl ? -1 : 1) * (1 - bp) * 520;
  const by = 160;
  const pb: Placed = { c: tb, x: bx, y: by, scale: bs };
  const pa: Placed = { ...pb, c: ta };
  const colNew = mark(ta, 'kanbanCol', 0);
  const card = marks(ta, 'kanbanCard')
    .filter((k) => k.x >= colNew.x - 2 && k.x + k.w <= colNew.x + colNew.w + 2)
    .sort((a, b) => a.y - b.y)[0];
  const land = Math.round(N * 0.78);
  const fly = prog(f, Math.round(N * 0.56), land - Math.round(N * 0.56), EASE.inOut);
  const swapBoard = prog(f, land - 2, 8, EASE.inOut);
  const cardW = worldRect(pa, card);
  const from = { x: sC.x + sC.w / 2 - cardW.w / 2, y: sC.y - cardW.h * 0.2 };
  const cx = mix(from.x, cardW.x, fly);
  const cy = mix(from.y, cardW.y, fly) - Math.sin(Math.PI * fly) * 90;
  const cardScale = mix(0.86, 1, fly);
  const overlay = f < land + 12 ? 1 - prog(f, land + 2, 10, EASE.inOut) : 0;
  return (
    <AbsoluteFill>
      {drawerOut > 0 && (
        <AbsoluteFill style={{ opacity: drawerOut, transform: `scale(${1 - 0.06 * (1 - drawerOut)})`, transformOrigin: '960px 540px' }}>
          <StageView cam={cam}>
            <Layer>
              <ShotCard p={p0} crop={VIEW(tr)} radius={16} />
              {fadeAc > 0 && <ShotCard p={p1} crop={VIEW(ac)} radius={16} opacity={fadeAc} shadow={false} />}
              <Highlight r={pad(bA, 6)} rtl={rtl} at={k1 - 10} out={swap} radius={12} comet={false} />
              <Highlight r={pad(bC, 6)} rtl={rtl} at={k2} radius={12} comet={false} />
            </Layer>
          </StageView>
          <Callout box={sC} ay={0.5} dx={130} dy={-90} label={T[lang].approve} at={k2 + 2} rtl={rtl} />
          <Pointer
            keys={[
              [0, rtl ? 520 : 1400, 980],
              [k1, sA.x + sA.w * 0.5, sA.y + sA.h * 0.55],
              [swap + 8, sA.x + sA.w * 0.5, sA.y + sA.h * 0.55],
              [k2, sC.x + sC.w * 0.5, sC.y + sC.h * 0.55],
            ]}
            clicks={[k1 + 2, k2 + 4]}
            opacity={prog(f, 2, 10)}
          />
        </AbsoluteFill>
      )}
      {bp > 0 && (
        <AbsoluteFill style={{ opacity: bp }}>
          <BrowserFrame p={pb} crop={VIEW(tb)} url={URL(lang, 'tasks')} bar={42} />
          {swapBoard > 0 && <BrowserFrame p={pa} crop={VIEW(ta)} url={URL(lang, 'tasks')} bar={42} opacity={swapBoard} style={{ boxShadow: 'none' }} />}
          <Highlight r={pad(cardW, 8)} rtl={rtl} at={land + 4} radius={16} color="#E8731B" />
        </AbsoluteFill>
      )}
      {f >= Math.round(N * 0.56) && overlay > 0 && (
        <div style={{ position: 'absolute', left: cx, top: cy, width: cardW.w, height: cardW.h, transform: `scale(${cardScale})`, transformOrigin: 'center', opacity: overlay }}>
          <ShotCard p={{ c: ta, x: -card.x * bs, y: -card.y * bs, scale: bs }} crop={card} radius={12} edge="line" style={{ boxShadow: `0 ${mix(30, 4, fly)}px ${mix(50, 10, fly)}px -16px rgba(19,34,56,${mix(0.45, 0.15, fly)})` }} />
        </div>
      )}
      <Callout box={cardW} ay={0.2} dx={110} dy={-60} label={T[lang].task} at={land + 8} rtl={rtl} />
    </AbsoluteFill>
  );
};
