/**
 * Site-camera beat: a hard cut to a procedurally drawn, SIMULATED CCTV-style frame of the story risk's
 * location (north excavation face), then a pull-back that reveals it is the app's camera viewer with
 * its honesty badges (Simulated · Camera not connected), the same rules as the app's spatial view
 * (biltix-hse docs/design/spatial.md): no "live", no "REC", no detection confidence.
 * Every annotated quantity comes from data.json (crack length, worker and excavator counts, sensor
 * and photo references); the scene itself is drawn by hand and is not a survey or a recording.
 * The picture never mirrors (it is a camera image); only the viewer chrome follows the language.
 */
import React from 'react';
import { useCurrentFrame } from 'remotion';
import { Code, Eyebrow, Num, Tag } from '../components/Chrome';
import { Metal } from '../components/Metal';
import { Layer, Shot } from '../components/Stage';
import { COPY } from '../copy';
import { DATA } from '../data';
import type { SceneProps } from '../Explainer';
import { enter, prog } from '../lib/anim';
import { SHOTS } from '../shots';
import { C, EASE, FONT } from '../theme';

const S = DATA.story;
const F = S.facts;
const CAM = (S as { siteCamera?: { code: string } | null }).siteCamera || null;
/** Feed rectangle in world px (left-to-right layout); the scene opens with it filling the frame. */
export const FEED = { x: 224, y: 212, w: 1116, h: 628 };
const W = FEED.w;
const H = FEED.h;

/** Deterministic pseudo-random (no Math.random in renders). */
const rnd = (i: number) => {
  const x = Math.sin(i * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};

const Feed: React.FC<{ f: number; lang: 'ar' | 'en' }> = ({ f, lang }) => {
  const t = COPY[lang].sitecam;
  const tick = Math.floor(f / 2); // the picture updates at 15 fps, like the burned-in counter says
  const zoom = 1 + 0.07 * prog(f, 10, 90, EASE.soft); // slow digital PTZ toward the crest
  const crestY = 238;
  const toeY = 402;
  const floorY = 520;
  // tension cracks: ~crackLengthM metres behind the crest, drawn at ~11 px per metre at the crest's depth
  const crackLen = F.crackLengthM * 11;
  const crackX0 = 470;
  const crackPts = Array.from({ length: 10 }, (_, i) => `${crackX0 + (i * crackLen) / 9},${crestY - 12 + (i % 2 ? -3 : 3) + rnd(i) * 3}`).join(' ');
  const workers = Array.from({ length: F.workers }, (_, i) => {
    const bx = 300 + rnd(i + 3) * 520;
    const by = toeY + 30 + rnd(i + 40) * 78;
    const walk = Math.sin(tick * 0.18 + i) * 3 * (i % 3 === 0 ? 1 : 0.3);
    return { x: bx + walk, y: by, s: 0.75 + (by - toeY) / 160 };
  });
  const excavators = Array.from({ length: F.excavators }, (_, i) => ({ x: 360 + i * 140 + rnd(i + 90) * 40, y: toeY + 26 + (i % 2) * 34, arm: Math.sin(tick * 0.09 + i * 1.7) * 6 }));
  const ts = (() => {
    const base = Date.parse(S.detectedAt);
    const d = new Date(base + Math.floor(f / 30) * 1000);
    const two = (n: number) => String(n).padStart(2, '0');
    // render the dataset's own wall-clock (Riyadh, UTC+3) independent of the render machine's zone
    const r = new Date(d.getTime() + 3 * 3600 * 1000);
    return `${r.getUTCFullYear()}-${two(r.getUTCMonth() + 1)}-${two(r.getUTCDate())} ${two(r.getUTCHours())}:${two(r.getUTCMinutes())}:${two(r.getUTCSeconds())}`;
  })();
  return (
    <div dir="ltr" style={{ position: 'relative', width: W, height: H, overflow: 'hidden', background: '#11161F', borderRadius: 12 }}>
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ position: 'absolute', inset: 0 }}>
        <defs>
          <linearGradient id="sc-sky" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#22304C" />
            <stop offset="60%" stopColor="#4E5A76" />
            <stop offset="100%" stopColor="#B08A74" />
          </linearGradient>
          <linearGradient id="sc-face" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#8E7E6B" />
            <stop offset="100%" stopColor="#6A5C4C" />
          </linearGradient>
          <linearGradient id="sc-floor" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#5E5446" />
            <stop offset="100%" stopColor="#4A4238" />
          </linearGradient>
          <radialGradient id="sc-lamp" cx="50%" cy="0%" r="100%">
            <stop offset="0%" stopColor="#FFE3A8" stopOpacity={0.55} />
            <stop offset="100%" stopColor="#FFE3A8" stopOpacity={0} />
          </radialGradient>
          <radialGradient id="sc-vig" cx="50%" cy="50%" r="75%">
            <stop offset="60%" stopColor="#000" stopOpacity={0} />
            <stop offset="100%" stopColor="#000" stopOpacity={0.55} />
          </radialGradient>
          <pattern id="sc-scan" width="4" height="4" patternUnits="userSpaceOnUse">
            <rect width="4" height="2" fill="#000" fillOpacity={0.09} />
          </pattern>
        </defs>
        <g transform={`translate(${560 * (1 - zoom)} ${crestY * (1 - zoom)}) scale(${zoom})`}>
          <rect width={W} height={210} fill="url(#sc-sky)" />
          {/* far ridges */}
          <path d={`M0 186 L120 168 L210 178 L330 150 L420 166 L560 142 L690 160 L800 146 L930 170 L1116 156 L1116 214 L0 214 Z`} fill="#3E4352" />
          <path d={`M0 200 L160 190 L300 198 L470 182 L640 196 L820 186 L1000 198 L1116 192 L1116 222 L0 222 Z`} fill="#4E5058" />
          {/* plateau beyond the crest */}
          <path d={`M0 214 L1116 214 L1116 ${crestY + 6} L0 ${crestY + 2} Z`} fill="#84765F" />
          {/* north face: two benches (lit treads, shaded risers), erosion gullies, a haul ramp */}
          <path d={`M0 ${crestY + 2} L1116 ${crestY + 6} L1116 ${toeY} L0 ${toeY - 6} Z`} fill="url(#sc-face)" />
          {[0.34, 0.67].map((k, i) => {
            const y = crestY + (toeY - crestY) * k;
            return (
              <g key={i}>
                <path d={`M0 ${y - 1} L1116 ${y + 3} L1116 ${y + 10} L0 ${y + 6} Z`} fill="#B5A487" />
                <path d={`M0 ${y + 6} L1116 ${y + 10} L1116 ${y + 22} L0 ${y + 18} Z`} fill="#5B4F41" opacity={0.55} />
              </g>
            );
          })}
          {Array.from({ length: 22 }, (_, i) => (
            <path key={i} d={`M ${30 + i * 50} ${crestY + 8} q ${6 + rnd(i) * 8} ${(toeY - crestY) * 0.4} ${-4 + rnd(i + 5) * 10} ${toeY - crestY - 14}`} fill="none" stroke="#4F4537" strokeOpacity={0.32} strokeWidth={1.4} />
          ))}
          <path d={`M 40 ${toeY - 4} L 760 ${crestY + 10} L 800 ${crestY + 10} L 96 ${toeY - 2} Z`} fill="#A08F75" opacity={0.75} />
          <path d={`M 40 ${toeY - 4} L 760 ${crestY + 10}`} fill="none" stroke="#C7B796" strokeOpacity={0.5} strokeWidth={1.5} />
          {/* crest edge */}
          <path d={`M0 ${crestY + 2} L1116 ${crestY + 6}`} fill="none" stroke="#C9B898" strokeOpacity={0.7} strokeWidth={1.5} />
          {/* pit floor + tyre tracks */}
          <path d={`M0 ${toeY - 6} L1116 ${toeY} L1116 ${H} L0 ${H} Z`} fill="url(#sc-floor)" />
          {[0, 1, 2].map((i) => (
            <path key={i} d={`M ${-40 + i * 30} ${floorY + 20} C ${300 + i * 20} ${toeY + 70}, ${700 - i * 30} ${toeY + 60}, ${1160} ${toeY + 40 + i * 10}`} fill="none" stroke="#3E372E" strokeOpacity={0.5} strokeWidth={3} />
          ))}
          {/* light towers (twilight): soft warm pools on the floor */}
          {[170, 950].map((x, i) => (
            <g key={i}>
              <ellipse cx={x} cy={toeY + 92} rx={150} ry={34} fill="url(#sc-lamp)" opacity={0.65} />
              <line x1={x} y1={toeY + 70} x2={x} y2={toeY - 30} stroke="#26262A" strokeWidth={3} />
              <rect x={x - 13} y={toeY - 38} width={26} height={9} rx={2} fill="#FFE9B8" />
              <circle cx={x} cy={toeY - 34} r={16} fill="#FFE3A8" opacity={0.18} />
            </g>
          ))}
          {/* excavators */}
          {excavators.map((e, i) => (
            <g key={i} transform={`translate(${e.x} ${e.y})`}>
              <rect x={-18} y={-12} width={36} height={14} rx={3} fill="#C99418" stroke="#5A4108" strokeWidth={1} />
              <rect x={-14} y={2} width={30} height={6} rx={3} fill="#2E2A24" />
              <path d={`M 12 -10 L 30 ${-26 + e.arm} L 42 ${-8 + e.arm}`} fill="none" stroke="#C99418" strokeWidth={4} strokeLinejoin="round" />
              <path d={`M 40 ${-10 + e.arm} l 6 6 l -8 2 z`} fill="#8A6A12" />
            </g>
          ))}
          {/* workers: one figure per worker on the floor below the face (hard hat + vest) */}
          {workers.map((w, i) => (
            <g key={i} transform={`translate(${w.x} ${w.y}) scale(${w.s})`}>
              <rect x={-2.4} y={-14} width={4.8} height={9} rx={1.5} fill="#F08A2E" />
              <rect x={-2.2} y={-5} width={1.8} height={7} fill="#2E2A24" />
              <rect x={0.4} y={-5} width={1.8} height={7} fill="#2E2A24" />
              <circle cx={0} cy={-16.5} r={2.6} fill="#F4F1E8" />
            </g>
          ))}
          {/* near rim (camera side) with a line of barriers */}
          <path d={`M0 ${floorY + 34} C 300 ${floorY + 22}, 760 ${floorY + 26}, 1116 ${floorY + 40} L1116 ${H} L0 ${H} Z`} fill="#2F2A24" />
          <path d={`M0 ${floorY + 34} C 300 ${floorY + 22}, 760 ${floorY + 26}, 1116 ${floorY + 40}`} fill="none" stroke="#6B5F4E" strokeWidth={2} />
          {Array.from({ length: 12 }, (_, i) => {
            const x = 30 + i * 92;
            const y = floorY + 28 + Math.sin(i * 0.7) * 3 + (i > 6 ? (i - 6) * 1.5 : 0);
            return (
              <g key={i}>
                <path d={`M ${x} ${y} l 8 -16 h 54 l 8 16 z`} fill="#D9D4CA" />
                <path d={`M ${x + 14} ${y - 16} h 10 l -6 16 h -10 z M ${x + 40} ${y - 16} h 10 l -6 16 h -10 z`} fill="#D2552A" />
              </g>
            );
          })}
          {/* tension cracks behind the crest */}
          <polyline points={crackPts} fill="none" stroke="#1E1A16" strokeWidth={2.4} strokeLinejoin="round" />
          {/* inclinometer post on the crest */}
          <g transform={`translate(${crackX0 - 70} ${crestY - 4})`}>
            <line x1={0} y1={0} x2={0} y2={-26} stroke="#D8DEE6" strokeWidth={2} />
            <circle cx={0} cy={-28} r={3.4} fill={tick % 8 < 4 ? '#FF8A3D' : '#6B4A2E'} />
          </g>
          {/* depth haze + dust */}
          <rect y={140} width={W} height={140} fill="#C9B9A6" opacity={0.08} />
        </g>
        {/* camera artefacts: scanlines, vignette, a touch of noise (changes at 15 fps) */}
        <rect width={W} height={H} fill="url(#sc-scan)" />
        {Array.from({ length: 70 }, (_, i) => (
          <rect key={i} x={rnd(i + tick * 7) * W} y={rnd(i * 3 + tick * 11) * H} width={2} height={2} fill="#FFFFFF" opacity={0.05} />
        ))}
        <rect width={W} height={H} fill="url(#sc-vig)" />
      </svg>
      {/* illustrative evidence box over the cracks (localized tag, like the app's illustrative boxes) */}
      {(() => {
        const o = prog(f, 30, 14, EASE.out);
        const bx = 560 + (crackX0 - 16 - 560) * zoom;
        const by = crestY + (crestY - 34 - crestY) * zoom;
        const bw = (crackLen + 32) * zoom;
        const bh = 40 * zoom;
        return (
          <>
            <div style={{ position: 'absolute', left: bx, top: by, width: bw, height: bh, border: '2px dashed #FFB46A', borderRadius: 4, opacity: o }} />
            <div
              dir={lang === 'ar' ? 'rtl' : 'ltr'}
              style={{ position: 'absolute', left: bx, top: by - 34, padding: '3px 10px', background: 'rgba(12,16,24,0.82)', color: '#FFD9AE', fontSize: 16, fontWeight: 600, borderRadius: 4, whiteSpace: 'nowrap', opacity: o, fontFamily: lang === 'ar' ? FONT.ar : FONT.en }}
            >
              {`${t.illustrative} · ${t.crack(F.crackLengthM)}`}
            </div>
          </>
        );
      })()}
      {/* OSD */}
      <div style={{ position: 'absolute', top: 14, left: 16, fontFamily: FONT.mono, fontSize: 17, color: '#F2F5F9', textShadow: '0 1px 2px #000', lineHeight: 1.45 }}>
        <div>{`${t.cam} · ${S.site.code}${CAM ? ` · ${CAM.code}` : ''}`}</div>
        <div style={{ fontFamily: lang === 'ar' ? FONT.ar : FONT.en, fontSize: 16, opacity: 0.9 }} dir={lang === 'ar' ? 'rtl' : 'ltr'}>
          {t.zone}
        </div>
        {/* the honesty tag sits with the camera name, top-left: clear of the caption band at every zoom */}
        <div style={{ display: 'inline-block', marginTop: 8, fontSize: 16, fontWeight: 600, letterSpacing: '0.04em', color: '#FFE2C2', background: 'rgba(12,16,24,0.8)', padding: '4px 10px', borderRadius: 4, textShadow: 'none' }}>
          {t.osdSim}
        </div>
      </div>
      <div style={{ position: 'absolute', top: 14, right: 16, textAlign: 'right', fontFamily: FONT.mono, fontSize: 17, color: '#F2F5F9', textShadow: '0 1px 2px #000', lineHeight: 1.45 }}>
        <div>{ts}</div>
        <div style={{ opacity: 0.85 }}>{t.osdFps}</div>
      </div>
    </div>
  );
};

export const SiteCam: React.FC<SceneProps> = ({ lang, frames, cutIn, matchIn, matchOut }) => {
  const f = useCurrentFrame();
  const rtl = lang === 'ar';
  const t = COPY[lang].sitecam;
  const chrome = prog(f, 26, 26, EASE.out);
  const cardX = 200;
  return (
    <Shot frames={frames} rtl={rtl} matchIn={matchIn} matchOut={matchOut} shots={SHOTS.sitecam} cutIn={cutIn}>
      <Layer>
        <Metal x={cardX} y={136} w={1520} h={772} rtl={rtl} comet={{ phase: 0.3, speed: 15, len: 180, opacity: prog(f, 50, 20) }} style={{ opacity: chrome }}>
          <div style={{ position: 'absolute', top: 18, insetInlineStart: 24, insetInlineEnd: 24, display: 'flex', alignItems: 'center', gap: 14 }}>
            <span style={{ fontSize: 26, fontWeight: 600 }}>{t.title}</span>
            <Code size={20} color={C.ink2}>
              {S.site.code}
            </Code>
            <span style={{ fontSize: 19, color: C.ink3 }}>{t.zone}</span>
            <span style={{ flex: 1 }} />
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '5px 14px', borderRadius: 999, background: 'rgba(184,134,11,0.10)', border: '1px solid rgba(184,134,11,0.55)', fontSize: 18, fontWeight: 600, color: C.amberText }}>
              <span style={{ width: 8, height: 8, borderRadius: 2, background: C.gold, transform: 'rotate(45deg)' }} />
              {t.simulated}
            </span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '5px 14px', borderRadius: 999, background: C.raised, border: `1px solid ${C.border2}`, fontSize: 18, fontWeight: 600, color: C.ink2 }}>
              <span style={{ width: 9, height: 9, borderRadius: 999, border: `2px solid ${C.ink3}` }} />
              {t.notConnected}
            </span>
          </div>
          {/* side panel: what the feed is linked to */}
          <div style={{ position: 'absolute', top: 76, insetInlineEnd: 24, width: 332 }}>
            <Eyebrow>{t.evidence}</Eyebrow>
            <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', ...enter(f, 40, 18, 8) }}>
                <span style={{ padding: '4px 12px', borderRadius: 8, border: `1px solid ${C.border}`, background: C.raised }}>
                  <Code size={20}>{S.code}</Code>
                </span>
                <span style={{ fontSize: 18, color: C.redText, fontWeight: 600 }}>{COPY[lang].rating[S.rating]}</span>
                <Num size={18} weight={600}>
                  {S.score}
                </Num>
              </div>
              <div style={{ fontSize: 18, color: C.ink2, lineHeight: 1.4, ...enter(f, 42, 18, 8) }}>{lang === 'ar' ? S.titleShortAr : S.titleShortEn}</div>
              <div style={{ height: 1, background: C.border }} />
              <div style={{ ...enter(f, 46, 18, 8) }}>
                <div style={{ fontSize: 16, color: C.ink3 }}>{COPY[lang].explain.evidence}</div>
                <Code size={18}>{F.sensorRef}</Code>
              </div>
              <div style={{ ...enter(f, 48, 18, 8) }}>
                <div style={{ fontSize: 16, color: C.ink3 }}>{t.photo}</div>
                <Code size={16} color={C.ink2}>
                  {F.imageRef}
                </Code>
              </div>
              <div style={{ ...enter(f, 50, 18, 8) }}>
                <div style={{ fontSize: 16, color: C.ink3 }}>{t.site}</div>
                <div style={{ fontSize: 18, color: C.ink }}>{t.crew(F.workers, F.excavators)}</div>
              </div>
              <div style={{ marginTop: 6, ...enter(f, 54, 18, 8) }}>
                <Tag size={15} style={{ whiteSpace: 'normal', lineHeight: 1.35 }}>
                  {t.note}
                </Tag>
              </div>
            </div>
          </div>
        </Metal>
        <div style={{ position: 'absolute', insetInlineStart: FEED.x, top: FEED.y, width: FEED.w, height: FEED.h, boxShadow: '0 10px 30px -12px rgba(19,34,56,0.5)', borderRadius: 12 }}>
          <Feed f={f} lang={lang} />
        </div>
      </Layer>
    </Shot>
  );
};
