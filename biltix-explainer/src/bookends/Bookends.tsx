/**
 * Cinematic bookends of the MVP showcase film: OpenAR / OpenEN and CloseAR / CloseEN (1920 × 1080, 30 fps,
 * 7.5 s each, silent). AI-generated b-roll (public/broll/, not in git) under a soft grade and a 2.39:1
 * letterbox, with the BILTIX title built in a nickel-orange metal frame that the laser comet draws on.
 *
 * - Open: aerial site → engineer (cross-dissolve at about 3.65 s), letterbox bars that open from a slit,
 *   title + tagline, and the last 0.8 s dissolving to the app's light plane (#F4F7FB), the colour of the
 *   core film's first frame.
 * - Close: from #F4F7FB into the operations room → the hard hat (about 3.65 s), end card with the
 *   wordmark, the closing line and the link, then a fade back to the light plane.
 * Both carry the honesty tag "AI-generated illustrative footage" on the lower bar for the whole shot.
 * The footage is never mirrored; in Arabic only the text, the reading order and the comet's direction
 * (counter-clockwise) change.
 */
import React from 'react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';
import { Emblem } from '../components/Emblem';
import { waitForFonts } from '../fonts';
import { mix, prog } from '../lib/anim';
import { EASE, FONT, METAL } from '../theme';
import { BOOK, LINK, type Lang } from './copy';
import { CornerTicks, Footage, Grade, HonestTag, LaserFrame, Letterbox, LinkPill, Shade } from './parts';
import { BAR, BOOKEND_FRAMES, CLOSE_CLIPS, LIGHT, LIGHT_LEN, OPEN_CLIPS, XD_FROM, XD_LEN } from './timing';

waitForFonts();

export type BookendProps = { lang: Lang };

const WHITE = '#FFFFFF';
const WHITE2 = 'rgba(255,255,255,0.86)';
const SHADOW = '0 2px 14px rgba(0,0,0,0.45)';

/** Opacity of the second clip over the first during the cross-dissolve. */
const dissolve = (f: number) => prog(f, XD_FROM, XD_LEN - 1, EASE.inOut);

/** "BILTIX Risk AI" set in IBM Plex Sans; `track` tightens the letter-spacing of BILTIX as it settles. */
const Wordmark: React.FC<{ size: number; track?: number; color?: string; color2?: string }> = ({ size, track = 0.09, color = WHITE, color2 = WHITE2 }) => (
  <span dir="ltr" style={{ display: 'inline-flex', alignItems: 'baseline', gap: size * 0.26, lineHeight: 1, whiteSpace: 'nowrap', unicodeBidi: 'isolate' }}>
    <span style={{ fontFamily: FONT.en, fontSize: size, fontWeight: 600, letterSpacing: `${track}em`, color }}>BILTIX</span>
    <span style={{ fontFamily: FONT.en, fontSize: size, fontWeight: 400, color: color2 }}>Risk AI</span>
  </span>
);

const ArName: React.FC<{ size: number; weight?: number; color?: string }> = ({ size, weight = 500, color = WHITE2 }) => (
  <span dir="rtl" lang="ar" style={{ fontFamily: FONT.ar, fontSize: size, fontWeight: weight, color, lineHeight: 1.25, whiteSpace: 'nowrap', unicodeBidi: 'isolate' }}>
    {BOOK.ar.nameAr}
  </span>
);

const rise = (p: number, dist = 14): React.CSSProperties => ({ opacity: p, transform: `translateY(${((1 - p) * dist).toFixed(2)}px)` });

/* ───────────────────────────── Open ───────────────────────────── */

/** Title frame of the open: left of centre, clear of the engineer (right third of the second clip). */
const OF = { x: 104, y: 352, w: 968, h: 376, r: 28 };

export const Open: React.FC<BookendProps> = ({ lang }) => {
  const f = useCurrentFrame();
  const rtl = lang === 'ar';
  const t = BOOK[lang];
  const xd = dissolve(f);
  // letterbox: a slit at the first frame that opens to 2.39:1
  const bar = mix(372, BAR, prog(f, 0, 56, EASE.cam));
  const lift = prog(f, 0, 14, EASE.out); // the first frames come up from a dim exposure
  const toLight = prog(f, BOOKEND_FRAMES - 1 - (LIGHT_LEN - 1), LIGHT_LEN - 1, EASE.inOut);

  const em = { draw: prog(f, 28, 24, EASE.inOut), build: prog(f, 36, 28, EASE.out), notch: prog(f, 56, 12, EASE.out) };
  const l1 = prog(f, 40, 24, EASE.out);
  const l2 = prog(f, 52, 22, EASE.out);
  const rule = prog(f, 62, 24, EASE.inOut);
  const tag = prog(f, 68, 26, EASE.out);
  const ticks = prog(f, 58, 18, EASE.out);
  const cx = OF.x + OF.w / 2;

  return (
    <AbsoluteFill style={{ background: '#000', overflow: 'hidden' }}>
      <Footage clip={OPEN_CLIPS[0]} opacity={1} scale={[1.0, 1.08]} drift={[-38, -12]} origin="50% 42%" />
      <Footage clip={OPEN_CLIPS[1]} opacity={xd} scale={[1.02, 1.07]} drift={[-22, 0]} origin="62% 45%" />
      <Grade />
      <Shade cx={cx} cy={OF.y + OF.h / 2 + 20} rx={880} ry={430} alpha={0.46} />
      <AbsoluteFill style={{ background: '#000', opacity: (1 - lift) * 0.5 }} />

      {/* title */}
      <CornerTicks x={OF.x} y={OF.y} w={OF.w} h={OF.h} opacity={ticks * 0.75} />
      <LaserFrame {...OF} start={16} drawFrames={40} rtl={rtl} id={`open-${lang}`} />
      <div
        style={{
          position: 'absolute',
          left: OF.x,
          top: OF.y,
          width: OF.w,
          height: OF.h,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          textShadow: SHADOW,
        }}
      >
        <div dir={rtl ? 'rtl' : 'ltr'} style={{ display: 'flex', alignItems: 'center', gap: rtl ? 24 : 30 }}>
          <div style={{ flex: 'none', filter: 'drop-shadow(0 6px 14px rgba(0,0,0,0.35))' }}>
            <Emblem size={rtl ? 84 : 96} draw={em.draw} build={em.build} notch={em.notch} id={`open-em-${lang}`} />
          </div>
          <div style={rise(l1, 16)}>{rtl ? <ArName size={56} weight={600} color={WHITE} /> : <Wordmark size={80} track={mix(0.2, 0.09, l1)} />}</div>
        </div>
        <div style={{ marginTop: rtl ? 14 : 18, ...rise(l2, 12) }}>{rtl ? <Wordmark size={38} track={0.09} /> : <ArName size={40} />}</div>
        <div style={{ marginTop: 26, marginBottom: 22, width: 132 * rule, height: 2, borderRadius: 2, background: METAL, opacity: rule }} />
        <div
          dir={rtl ? 'rtl' : 'ltr'}
          lang={lang}
          style={{
            fontFamily: rtl ? FONT.ar : FONT.en,
            fontSize: rtl ? 40 : 36,
            fontWeight: rtl ? 500 : 400,
            lineHeight: 1.3,
            letterSpacing: rtl ? 0 : '0.005em',
            color: WHITE,
            whiteSpace: 'nowrap',
            ...rise(tag, 12),
          }}
        >
          {t.tagline}
        </div>
      </div>

      <Letterbox bar={bar} />
      <HonestTag lang={lang} text={t.honest} />
      <AbsoluteFill style={{ background: LIGHT, opacity: toLight }} />
    </AbsoluteFill>
  );
};

/* ───────────────────────────── Close ───────────────────────────── */

/** End card of the close: right of centre, over the sky and the skyline, clear of the hard hat (left). */
const CF = { x: 1036, y: 236, w: 812, h: 392, r: 30 };

export const Close: React.FC<BookendProps> = ({ lang }) => {
  const f = useCurrentFrame();
  const rtl = lang === 'ar';
  const t = BOOK[lang];
  const xd = dissolve(f);
  const fromLight = 1 - prog(f, 0, LIGHT_LEN - 1, EASE.inOut);
  const toLight = prog(f, BOOKEND_FRAMES - 1 - (LIGHT_LEN - 1), LIGHT_LEN - 1, EASE.inOut);
  const S = XD_FROM; // the end card starts with the cross-dissolve to the hard hat

  const card = prog(f, S + 8, 30, EASE.inOut); // the shade behind the card
  const em = { draw: prog(f, S + 10, 22, EASE.inOut), build: prog(f, S + 16, 26, EASE.out), notch: prog(f, S + 34, 12, EASE.out) };
  const wm = prog(f, S + 14, 24, EASE.out);
  const ar = prog(f, S + 22, 22, EASE.out);
  const rule = prog(f, S + 28, 24, EASE.inOut);
  const c1 = prog(f, S + 30, 24, EASE.out);
  const c2 = prog(f, S + 34, 24, EASE.out);
  const link = prog(f, S + 46, 24, EASE.out);
  const ticks = prog(f, S + 42, 18, EASE.out);
  const cx = CF.x + CF.w / 2;

  return (
    <AbsoluteFill style={{ background: '#000', overflow: 'hidden' }}>
      <Footage clip={CLOSE_CLIPS[0]} opacity={1} scale={[1.03, 1.09]} drift={[30, -8]} origin="50% 46%" />
      <Footage clip={CLOSE_CLIPS[1]} opacity={xd} scale={[1.0, 1.06]} drift={[-20, -10]} origin="40% 60%" />
      <Grade warmth={mix(0.55, 1, xd)} />
      <Shade cx={cx} cy={CF.y + CF.h / 2 + 50} rx={760} ry={500} alpha={0.52 * card} />

      <CornerTicks x={CF.x} y={CF.y} w={CF.w} h={CF.h} opacity={ticks * 0.75} />
      <LaserFrame {...CF} start={S + 4} drawFrames={38} rtl={rtl} id={`close-${lang}`} />
      <div
        style={{
          position: 'absolute',
          left: CF.x,
          top: CF.y,
          width: CF.w,
          height: CF.h,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          textShadow: SHADOW,
        }}
      >
        <div dir="ltr" style={{ display: 'flex', alignItems: 'center', gap: 22 }}>
          <div style={{ flex: 'none', filter: 'drop-shadow(0 6px 14px rgba(0,0,0,0.35))' }}>
            <Emblem size={74} draw={em.draw} build={em.build} notch={em.notch} id={`close-em-${lang}`} />
          </div>
          <div style={rise(wm, 12)}>
            <Wordmark size={60} track={mix(0.18, 0.09, wm)} />
          </div>
        </div>
        <div style={{ marginTop: 14, ...rise(ar, 10) }}>
          <ArName size={rtl ? 36 : 32} />
        </div>
        <div style={{ marginTop: 26, marginBottom: 24, width: 140 * rule, height: 2, borderRadius: 2, background: METAL, opacity: rule }} />
        <div
          dir={rtl ? 'rtl' : 'ltr'}
          lang={lang}
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: rtl ? 4 : 6,
            fontFamily: rtl ? FONT.ar : FONT.en,
            fontSize: rtl ? 46 : 42,
            fontWeight: 500,
            lineHeight: rtl ? 1.35 : 1.2,
            letterSpacing: rtl ? 0 : '-0.003em',
            color: WHITE,
          }}
        >
          <span style={rise(c1, 12)}>{t.closing[0]}</span>
          <span style={rise(c2, 12)}>{t.closing[1]}</span>
        </div>
      </div>
      <div style={{ position: 'absolute', top: CF.y + CF.h + 34, left: CF.x, width: CF.w, display: 'flex', justifyContent: 'center', ...rise(link, 12) }}>
        <LinkPill text={LINK} />
      </div>

      <Letterbox bar={BAR} />
      <HonestTag lang={lang} text={t.honest} />
      <AbsoluteFill style={{ background: LIGHT, opacity: Math.max(fromLight, toLight) }} />
    </AbsoluteFill>
  );
};
