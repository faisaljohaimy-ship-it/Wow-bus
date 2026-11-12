/**
 * Film v2, act 3 — the roadmap (S13–S17, on the navy canvas, tagged "roadmap — not built yet") and the close (S18).
 */
import React from 'react';
import { AbsoluteFill, staticFile, useCurrentFrame } from 'remotion';
import { Emblem } from '../components/Emblem';
import { LaserFrame, LinkPill } from '../bookends/parts';
import { mix, prog } from '../lib/anim';
import { C, EASE, ELEV, FONT, METAL } from '../theme';
import { captionChunks } from './captions';
import { LINK } from './copy';
import { Backdrop, Clip, CoolGrade, FootageTag, LB, Letterbox, LowShade, SceneCam, Screen, Stream, WarmGrade } from './fx';
import { AiFootageTag, BrollFrame, Box, Chip, Icon, Kicker, Mono, Words, px, rise, useFilm, type IconName } from './kit';
import { brollFile, hasBroll, PANO, pickBroll } from './media';
import { ArchStrip, Compass, PanoramaWindow, PhoneOffline, Pillars, PlanLayers, QrScan } from './parts';
import { atLine, XFADE, type SceneTiming } from './timeline';

export type SceneProps = { s: SceneTiming };

const DarkKicker: React.FC<{ n: number; text: string; at: number }> = ({ n, text, at }) => {
  const f = useCurrentFrame();
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 18, ...rise(f, at, 20) }}>
      <span style={{ fontFamily: FONT.mono, fontSize: 40, fontWeight: 600, background: METAL, WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' }}>{`0${n}`}</span>
      <span style={{ width: 40, height: 3, background: METAL, borderRadius: 2 }} />
      <span style={{ fontSize: 34, fontWeight: 650, color: '#FFE2C2' }}>{text}</span>
    </div>
  );
};

/* ═════════════ S13 Roadmap intro ═════════════ */
export const S13: React.FC<SceneProps> = ({ s }) => {
  const f = useCurrentFrame();
  const { c } = useFilm();
  const end = s.frames + XFADE;
  return (
    <AbsoluteFill>
      <Clip src={staticFile(brollFile('aerial'))} from={0} dur={end} scale={[1.18, 1.1]} drift={[20, 6]} opacity={0.42} start={1.6} />
      <AbsoluteFill style={{ background: 'linear-gradient(180deg, rgba(11,26,51,0.55) 0%, rgba(11,26,51,0.82) 55%, rgba(7,17,31,0.95) 100%)' }} />
      <SceneCam frames={s.frames} zoom={[1.04, 1]}>
        <div style={{ position: 'absolute', left: 0, right: 0, top: 170, textAlign: 'center', color: '#FFFFFF' }}>
          <div style={{ fontSize: 100, fontWeight: 700, lineHeight: 1.2 }}>
            <Words text={c.roadmap} at={2} per={5} dur={20} dist={26} />
          </div>
          <div style={{ marginTop: 8, fontSize: 44, fontWeight: 500, color: '#C9D6EA', ...rise(f, 14, 20) }}>{c.roadmapSub}</div>
        </div>
        <Pillars x0={180} y={460} w={360} gap={40} h={330} at={20} stagger={6} />
      </SceneCam>
      <FootageTag text={c.aiFootage} opacity={prog(f, 4, 16)} />
    </AbsoluteFill>
  );
};

/* ═════════════ S14 Offline ═════════════ */
export const S14: React.FC<SceneProps> = ({ s }) => {
  const f = useCurrentFrame();
  const { lang, rtl, c } = useFilm();
  const ch = captionChunks(lang, s);
  const b = ch[1] ? ch[1].from : atLine(s, 0.55);
  const end = s.frames + XFADE;
  const rowsAt = [Math.round(atLine(s, 0.2)), Math.round(atLine(s, 0.3)), Math.round(atLine(s, 0.4))];
  const syncAt = b + 6;
  const back = prog(f, syncAt + 4, 20, EASE.out);
  return (
    <AbsoluteFill>
      <Clip src={staticFile(brollFile('offline-basement'))} from={0} dur={end} scale={[1.02, 1.1]} drift={[rtl ? 30 : -30, -6]} offsetX={rtl ? 0 : 640} />
      <CoolGrade k={0.8} />
      <AbsoluteFill style={{ background: `linear-gradient(${rtl ? 270 : 90}deg, rgba(11,26,51,0.97) 0%, rgba(11,26,51,0.9) 34%, rgba(11,26,51,0.25) 62%, rgba(11,26,51,0) 80%)` }} />
      <LowShade k={0.6} />
      {/* the signal: lost → back */}
      <Box x={1560} y={160} w={240} style={{ display: 'flex', justifyContent: 'center' }}>
        <div style={{ width: 120, height: 120, borderRadius: 99, background: back > 0.5 ? 'rgba(12,163,12,0.25)' : 'rgba(208,59,59,0.28)', border: `2px solid ${back > 0.5 ? '#6BE06B' : '#FF8A8A'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: `0 0 0 ${(10 + 10 * Math.sin(f / 7) ** 2).toFixed(1)}px ${back > 0.5 ? 'rgba(12,163,12,0.12)' : 'rgba(208,59,59,0.12)'}`, ...rise(f, 6, 18) }}>
          <Icon name={back > 0.5 ? 'signal' : 'wifioff'} size={64} color="#FFFFFF" width={2} />
        </div>
      </Box>
      <SceneCam frames={s.frames} zoom={[1, 1.03]}>
        <Box x={130} y={170} w={520} style={{ color: '#FFFFFF' }}>
          <DarkKicker n={1} text={c.pillars[0]} at={0} />
          <div style={{ marginTop: 26, fontSize: 52, fontWeight: 700, lineHeight: 1.3 }}>
            <Words text={c.basement} at={6} per={3} />
          </div>
          <div style={{ marginTop: 34, display: 'flex', flexDirection: 'column', gap: 16, alignItems: 'flex-start' }}>
            {c.offlineChips.map((t, i) => (
              <span key={i} style={rise(f, rowsAt[0] + i * 10, 18)}>
                <Chip tone="dark" icon={(['globe', 'database', 'refresh'] as IconName[])[i]} size={30}>{t}</Chip>
              </span>
            ))}
          </div>
        </Box>
        <div style={{ position: 'absolute', inset: 0, transform: 'scale(0.9)', transformOrigin: rtl ? '1080px 170px' : '840px 170px' }}>
          <PhoneOffline x={680} y={170} rowsAt={rowsAt} syncAt={syncAt} />
        </div>
      </SceneCam>
      <FootageTag text={c.aiFootage} opacity={1} />
    </AbsoluteFill>
  );
};

/* ═════════════ S15 QR + drawings ═════════════ */
export const S15: React.FC<SceneProps> = ({ s }) => {
  const f = useCurrentFrame();
  const { lang, rtl, c } = useFilm();
  const ch = captionChunks(lang, s);
  const cut = (ch[1] ? ch[1].from : Math.round(atLine(s, 0.5))) - 10;
  const lockAt = Math.round(atLine(s, 0.24));
  const wipe = prog(f, cut, 20, EASE.inOut);
  const keyed = hasBroll('qr-scan-keyed');
  const scan = prog(f, 10, lockAt - 10, EASE.inOut);
  const lock = prog(f, lockAt, 12, EASE.expo);
  const res = prog(f, lockAt + 6, 20, EASE.expo);
  const sweep = Math.sin(scan * Math.PI * 3) * 0.5 + 0.5;
  // the QR label in the footage (physical px, the clip is never mirrored)
  const Q = { x: 1336, y: 340, w: 180, h: 455 };
  const layerAt = [0.56, 0.68, 0.8, 0.9].map((k) => Math.round(mix(cut + 20, s.vTo, (k - 0.5) / 0.5)));
  const edge = mix(rtl ? 1920 + 260 : -260, rtl ? -260 : 1920 + 260, wipe);
  return (
    <AbsoluteFill>
      {/* phase A: scanning a crate on site (AI footage) */}
      {wipe < 1 && (
        <AbsoluteFill style={{ background: '#05070B' }}>
          {keyed ? (
            <>
              <Clip src={staticFile(brollFile('qr-scan-keyed'))} from={0} dur={cut + 24} scale={[1.0, 1.06]} drift={[0, 0]} origin="70% 55%" />
              <WarmGrade k={0.7} />
              <LowShade k={0.7} />
              <svg width={1920} height={1080} style={{ position: 'absolute', inset: 0, overflow: 'visible' }}>
                {(() => {
                  const k = mix(1.25, 1, lock);
                  const cx = Q.x + Q.w / 2;
                  const cy = Q.y + Q.h / 2;
                  const L = 52;
                  const bx = Q.x - 26;
                  const by = Q.y - 26;
                  const bw = Q.w + 52;
                  const bh = Q.h + 52;
                  const col = lock > 0.5 ? '#3BE07A' : '#FF8A2E';
                  return (
                    <g transform={`translate(${cx} ${cy}) scale(${k}) translate(${-cx} ${-cy})`} opacity={Math.min(1, scan * 5)}>
                      <path d={`M${bx} ${by + L} V${by} H${bx + L} M${bx + bw - L} ${by} H${bx + bw} V${by + L} M${bx + bw} ${by + bh - L} V${by + bh} H${bx + bw - L} M${bx + L} ${by + bh} H${bx} V${by + bh - L}`} fill="none" stroke={col} strokeWidth={8} strokeLinecap="round" />
                      {lock < 0.5 && <rect x={bx + 8} y={by + 16 + sweep * (bh - 32)} width={bw - 16} height={5} rx={2} fill="#FF5E00" />}
                      {lock < 0.5 && <rect x={bx + 8} y={by + 6 + sweep * (bh - 32)} width={bw - 16} height={26} fill="#FF5E00" opacity={0.16} />}
                    </g>
                  );
                })()}
              </svg>
            </>
          ) : (
            <AbsoluteFill style={{ background: '#0B1A33' }}>
              <QrScan x={1100} y={220} scanAt={10} lockAt={lockAt} />
            </AbsoluteFill>
          )}
          <SceneCam frames={cut + 20} zoom={[1, 1.02]}>
            <Box x={130} y={150} w={760} style={{ color: '#FFFFFF' }}>
              <DarkKicker n={2} text={c.pillars[1]} at={0} />
            </Box>
            {res > 0 && (
              <div style={{ position: 'absolute', left: 130, top: 250, width: 640, opacity: res, transform: `translateY(${((1 - res) * 30).toFixed(1)}px) scale(${mix(0.94, 1, res).toFixed(3)})` }}>
                <div dir={rtl ? 'rtl' : 'ltr'} style={{ padding: '22px 28px', borderRadius: 22, background: '#FFFFFF', border: '2px solid transparent', backgroundImage: `linear-gradient(#fff, #fff), ${METAL}`, backgroundOrigin: 'border-box', backgroundClip: 'padding-box, border-box', boxShadow: '0 30px 60px -24px rgba(0,0,0,0.7)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                    <span style={{ width: 64, height: 64, borderRadius: 18, background: '#E8F6E8', border: '1.5px solid #B9E2B9', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Icon name="check" size={40} color={C.greenText} width={2.6} />
                    </span>
                    <div>
                      <div style={{ fontSize: 40, fontWeight: 700, color: C.ink }}>{c.crate}</div>
                      <div style={{ fontSize: 28, fontWeight: 600, color: C.greenText }}>{c.match}</div>
                    </div>
                  </div>
                  <div style={{ marginTop: 12, display: 'flex', gap: 12, alignItems: 'center' }}>
                    <Mono size={24} color={C.ink2} weight={600}>{c.poRef}</Mono>
                    <Mono size={24} color={C.ink3}>CW-S1-014</Mono>
                  </div>
                </div>
                <div style={{ marginTop: 18, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                  {c.scanTargets.map((t, i) => (
                    <span key={i} style={rise(f, lockAt + 24 + i * 8, 16)}>
                      <Chip tone="dark" icon={(['crate', 'pin', 'doc'] as IconName[])[i]} size={28}>{t}</Chip>
                    </span>
                  ))}
                </div>
              </div>
            )}
          </SceneCam>
          <FootageTag text={c.aiFootage} opacity={keyed ? 1 : 0} />
        </AbsoluteFill>
      )}
      {/* phase B: approved drawings, layer by layer (light-sweep wipe) */}
      {wipe > 0 && (
        <AbsoluteFill style={{ clipPath: wipe < 1 ? (rtl ? `polygon(${edge}px 0, 1920px 0, 1920px 1080px, ${edge + 200}px 1080px)` : `polygon(0 0, ${edge}px 0, ${edge - 200}px 1080px, 0 1080px)`) : undefined }}>
          <Backdrop dark={1} at={s.from + f} />
          <SceneCam frames={s.frames - cut} zoom={[1.03, 1]}>
            <Box x={130} y={140} w={1200} style={{ color: '#FFFFFF' }}>
              <DarkKicker n={3} text={c.drawings} at={cut + 8} />
            </Box>
            <div style={{ color: '#FFFFFF' }}>
              <PlanLayers x={120} y={230} w={1070} h={610} layerAt={layerAt} baseAt={cut + 10} />
            </div>
            <div style={{ color: '#C9D6EA', ...rise(f, cut + 16, 22, 30) }}>
              <Screen
                ui="ui-spatial"
                fallback="spatial-camera"
                x={1240}
                y={290}
                w={580}
                from={cut}
                dur={s.frames + XFADE - cut}
                focus={[
                  [cut, 1.1, 0.5, 0.45],
                  [s.frames, 1.5, rtl ? 0.62 : 0.38, 0.55],
                ]}
                startAt={1.2}
                clipFocus={[
                  [1.2, 1.05, 0.5, 0.45],
                  [4.0, 1.45, rtl ? 0.62 : 0.38, 0.55],
                  [7.6, 1.6, rtl ? 0.58 : 0.42, 0.6],
                  [9.0, 1.15, 0.5, 0.5],
                ]}
                shine={cut + 30}
              />
            </div>
          </SceneCam>
        </AbsoluteFill>
      )}
      {wipe > 0 && wipe < 1 && (
        <div style={{ position: 'absolute', top: 0, bottom: 0, left: (rtl ? edge + 100 : edge - 100) - 120, width: 240, background: 'linear-gradient(90deg, rgba(255,180,106,0) 0%, rgba(255,226,194,0.85) 45%, rgba(255,255,255,0.95) 50%, rgba(255,140,40,0.5) 58%, rgba(255,140,40,0) 100%)', transform: `skewX(${rtl ? 10.5 : -10.5}deg)` }} />
      )}
    </AbsoluteFill>
  );
};

/* ═════════════ S16 360° ═════════════ */
export const S16: React.FC<SceneProps> = ({ s }) => {
  const f = useCurrentFrame();
  const { lang, rtl, c } = useFilm();
  const ch = captionChunks(lang, s);
  const b = ch[1] ? ch[1].from : atLine(s, 0.5);
  const end = s.frames + XFADE;
  const imgH = 1000;
  const imgW = Math.round((PANO.w * imgH) / PANO.h);
  const WIN = { x: 120, y: 150, w: 1680, h: 470 };
  const pan = 300 + f * 2.6;
  const heading = ((pan / imgW) * 360) % 360;
  const strip = [b - 4, b + 14, b + 30, Math.round(mix(b, s.vTo, 0.55)), Math.round(mix(b, s.vTo, 0.8))];
  const Y = 700;
  const nodes = [
    { x: 120, w: 300, icon: 'pole' as IconName, t: c.pole },
    { x: 560, w: 300, icon: 'chip' as IconName, t: c.edge },
    { x: 1300, w: 500, icon: 'building' as IconName, t: c.platform },
  ];
  return (
    <SceneCam frames={s.frames} zoom={[1, 1.025]}>
      <div style={rise(f, 0, 22, 30)}>
        <PanoramaWindow x={WIN.x} y={WIN.y} w={WIN.w} h={WIN.h} pan={pan} imgW={imgW} imgH={imgH} offsetY={(imgH - WIN.h) / 2 + 40}>
          <div style={{ position: 'absolute', top: 22, insetInlineStart: 26, color: '#FFFFFF' }}>
            <DarkKicker n={4} text={c.pillars[3]} at={0} />
          </div>
          <div style={{ position: 'absolute', top: 18, insetInlineEnd: 22 }}>
            <Compass heading={heading} size={104} />
          </div>
          <div style={{ position: 'absolute', bottom: 18, insetInlineEnd: 22 }}>
            <AiFootageTag text={c.aiImage} />
          </div>
          <div style={{ position: 'absolute', bottom: 22, insetInlineStart: 440, ...rise(f, atLine(s, 0.2), 18) }}>
            <Chip tone="dark" icon="plan" size={28}>{c.walk}</Chip>
          </div>
        </PanoramaWindow>
      </div>
      <div style={rise(f, atLine(s, 0.18), 22, 24)}>
        <BrollFrame src={brollFile(pickBroll('cam360-floor'))} x={WIN.x + 22} y={WIN.y + WIN.h - 222} w={380} h={200} from={0} dur={end} tag="" scale={[1.0, 1.08]} />
      </div>
      {/* fixed camera → edge AI → events only → platform */}
      <svg width={1920} height={1080} style={{ position: 'absolute', inset: 0, overflow: 'visible' }}>
        {[
          [420, 560],
          [860, 1300],
        ].map(([a, z], i) => {
          const d = `M ${px(rtl, a)} ${Y + 66} L ${px(rtl, z)} ${Y + 66}`;
          const p = prog(f, strip[i * 2 + 1] - 4, 14, EASE.inOut);
          return (
            <g key={i}>
              <path d={d} stroke={i === 1 ? '#FFC27F' : 'rgba(255,255,255,0.6)'} strokeWidth={i === 1 ? 3 : 2.5} strokeDasharray={i === 1 ? '10 8' : `${p * 500} 500`} strokeDashoffset={i === 1 ? -f * 1.2 : 0} opacity={p} fill="none" />
              <Stream d={d} n={i === 1 ? 4 : 2} speed={0.022} opacity={p} width={i === 1 ? 10 : 5} len={i === 1 ? 0.012 : 0.04} />
            </g>
          );
        })}
      </svg>
      {nodes.map((n, i) => {
        const p = prog(f, strip[i === 2 ? 3 : i * 2], 18, EASE.expo);
        return (
          <Box key={i} x={n.x} y={Y} w={n.w} h={132} style={{ borderRadius: 22, background: i === 2 ? '#FFFFFF' : 'rgba(255,255,255,0.08)', border: i === 2 ? '2px solid transparent' : '1.5px solid rgba(255,255,255,0.26)', ...(i === 2 ? { backgroundImage: `linear-gradient(#fff, #fff), ${METAL}`, backgroundOrigin: 'border-box', backgroundClip: 'padding-box, border-box' } : {}), display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 16, opacity: p, transform: `scale(${mix(0.86, 1, p).toFixed(3)})`, color: i === 2 ? C.ink : '#FFFFFF', boxShadow: i === 2 ? ELEV : 'none' }}>
            {i === 2 ? <Emblem size={64} id="s16" /> : <Icon name={n.icon} size={52} color="#FFD9B0" width={1.8} />}
            <span style={{ fontSize: 34, fontWeight: 650 }}>{n.t}</span>
          </Box>
        );
      })}
      <Box x={860} y={Y - 6} w={440} style={{ display: 'flex', justifyContent: 'center', ...rise(f, strip[2], 16) }}>
        <span style={{ padding: '6px 16px', borderRadius: 999, background: 'rgba(255,194,127,0.14)', border: '1.5px solid rgba(255,194,127,0.6)', color: '#FFE2C2', fontSize: 27, fontWeight: 650, whiteSpace: 'nowrap' }}>{c.eventsOnly}</span>
      </Box>
      <Box x={860} y={Y + 96} w={440} style={{ display: 'flex', justifyContent: 'center', ...rise(f, strip[4], 16) }}>
        <Chip tone="dark" icon="eyeoff" size={27}>{c.privacy}</Chip>
      </Box>
    </SceneCam>
  );
};

/* ═════════════ S17 Go-live needs ═════════════ */
export const S17: React.FC<SceneProps> = ({ s }) => {
  const f = useCurrentFrame();
  const { lang, rtl, c } = useFilm();
  const ch = captionChunks(lang, s);
  const b = ch[1] ? ch[1].from : atLine(s, 0.55);
  const srcAt = [0.1, 0.18, 0.26, 0.34].map((k) => Math.round(atLine(s, k)));
  const gwAt = Math.round(atLine(s, 0.42));
  const platAt = gwAt + 12;
  const fieldAt = [platAt + 14, platAt + 22, platAt + 30];
  const scr = 1 - prog(f, gwAt - 16, 14, EASE.inOut);
  return (
    <SceneCam frames={s.frames} zoom={[1, 1.03]}>
      <Box x={120} y={150} w={1000} style={{ color: '#FFFFFF' }}>
        <div style={{ fontSize: 60, fontWeight: 700, lineHeight: 1.2 }}>
          <Words text={c.goLive} at={s.vFrom - 6} per={4} dur={18} />
        </div>
      </Box>
      <ArchStrip y={290} srcAt={srcAt} gwAt={gwAt} platAt={platAt} fieldAt={fieldAt} />
      <div style={{ color: '#C9D6EA', opacity: scr * prog(f, 2, 16) }}>
        <Screen ui="ui-integrations" fallback="integrations" x={1240} y={170} w={560} dur={s.frames + XFADE} focus={[[0, 1.1, 0.5, 0.45], [s.frames, 1.35, 0.5, 0.6]]} startAt={2.5} clipFocus={[[2.5, 1.1, 0.5, 0.35], [9, 1.35, 0.5, 0.6]]} shine={10} />
      </div>
      <Box x={120} y={770} w={1680} style={{ display: 'flex', justifyContent: 'center', gap: 18 }}>
        {c.needs.map((t, i) => (
          <span key={i} style={rise(f, b + i * 10, 18, 20)}>
            <Chip tone="dark" icon={(['power', 'server', 'key'] as IconName[])[i]} size={30}>{t}</Chip>
          </span>
        ))}
      </Box>
      <span style={{ display: 'none' }}>{rtl}</span>
    </SceneCam>
  );
};

/* ═════════════ S18 Close ═════════════ */
export const S18: React.FC<SceneProps> = ({ s }) => {
  const f = useCurrentFrame();
  const { lang, rtl, c } = useFilm();
  const ch = captionChunks(lang, s);
  const cut = Math.round(atLine(s, 0.45));
  const end = s.frames;
  const bar = mix(0, LB, prog(f, 0, 40, EASE.cam));
  const xd = prog(f, cut, 24, EASE.inOut);
  const FR = { x: 480, y: 250, w: 960, h: 470 };
  const t1 = prog(f, 22, 22, EASE.out);
  const t2 = prog(f, 34, 22, EASE.out);
  const tg = prog(f, ch[1] ? ch[1].from - 4 : atLine(s, 0.5), 22, EASE.out);
  const lk = prog(f, s.vTo - 10, 20, EASE.out);
  const cr = prog(f, s.vTo + 14, 24, EASE.out);
  const out = prog(f, end - 24, 24, EASE.inOut);
  return (
    <AbsoluteFill style={{ background: '#05070B' }}>
      <Clip src={staticFile(brollFile('aerial'))} from={0} dur={cut + 26} scale={[1.0, 1.08]} drift={[-24, -10]} />
      <Clip src={staticFile(brollFile('hardhat'))} from={cut} dur={end - cut} opacity={xd} scale={[1.02, 1.1]} drift={[rtl ? 20 : -20, 0]} />
      <WarmGrade />
      <AbsoluteFill style={{ background: 'radial-gradient(900px 520px at 50% 50%, rgba(10,7,4,0.62), rgba(10,7,4,0) 100%)' }} />
      <LaserFrame x={FR.x} y={FR.y} w={FR.w} h={FR.h} r={30} start={8} drawFrames={44} cruise={10} rtl={rtl} id="s18" plate={[0.42, 0.6]} />
      <div style={{ position: 'absolute', left: FR.x, top: FR.y, width: FR.w, height: FR.h, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14, color: '#FFFFFF' }}>
        <div style={{ ...rise(f, 16, 22), display: 'flex', alignItems: 'center', gap: 22 }}>
          <Emblem size={96} id="s18em" draw={prog(f, 14, 22, EASE.inOut)} build={prog(f, 22, 26, EASE.out)} notch={prog(f, 40, 12, EASE.out)} />
          <span dir="ltr" style={{ display: 'inline-flex', alignItems: 'baseline', gap: 20, whiteSpace: 'nowrap', opacity: t1 }}>
            <span style={{ fontFamily: FONT.en, fontSize: 92, fontWeight: 600, letterSpacing: `${mix(0.2, 0.09, t1).toFixed(3)}em` }}>BILTIX</span>
            <span style={{ fontFamily: FONT.en, fontSize: 92, fontWeight: 400, color: 'rgba(255,255,255,0.86)' }}>Risk AI</span>
          </span>
        </div>
        <div dir="rtl" lang="ar" style={{ fontFamily: FONT.ar, fontSize: 50, fontWeight: 500, color: 'rgba(255,255,255,0.9)', ...rise(f, 34, 22), opacity: t2 }}>{c.nameAr}</div>
        <div style={{ width: mix(0, 420, tg), height: 3, background: METAL, borderRadius: 2, marginTop: 8 }} />
        <div style={{ fontSize: rtl ? 42 : 36, fontWeight: 600, color: '#FFE2C2', textAlign: 'center', whiteSpace: 'nowrap', ...rise(f, ch[1] ? ch[1].from - 2 : 60, 22) }}>{c.tagline}</div>
        <div style={{ marginTop: 14, ...rise(f, s.vTo - 10, 20) }}>
          <LinkPill text={LINK} style={{ opacity: lk }} />
        </div>
      </div>
      <Letterbox bar={bar} />
      <FootageTag text={c.aiFootage} opacity={prog(f, 10, 16) * (1 - out)} top={Math.max(24, bar / 2 - 21)} />
      {/* credits: every AI at work in this film */}
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: Math.round(LB / 2) - 20, display: 'flex', justifyContent: 'center', opacity: cr * (1 - out) }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 12, fontSize: 25, fontWeight: 500, color: 'rgba(255,255,255,0.85)', whiteSpace: 'nowrap' }}>
          <svg width={18} height={18} viewBox="0 0 16 16"><path d="M8 0.8 C8.6 5.2 10.8 7.4 15.2 8 C10.8 8.6 8.6 10.8 8 15.2 C7.4 10.8 5.2 8.6 0.8 8 C5.2 7.4 7.4 5.2 8 0.8Z" fill="#FFB46A" /></svg>
          {c.credits}
        </span>
      </div>
      <AbsoluteFill style={{ background: '#05070B', opacity: out }} />
      <span style={{ display: 'none' }}>{lang}</span>
    </AbsoluteFill>
  );
};

export { Mono, Kicker, CoolGrade };
