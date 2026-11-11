/**
 * BILTIX Risk AI — cockpit hero explainer (js/ui/explainer-hero.js). Owner: B-COCKPIT.
 * Design: docs/design/components.md "Explainer hero". Media: js/data/explainer-media.js (generated manifest).
 *
 * The "How the platform works" video as the first card of #/cockpit:
 *   section.card.is-framed.is-hero.ckh[data-state][data-frame]   (region, labelled by its h2)
 *     .ckh-media   > .ckh-stage (16:9: poster <img>, <video playsinline muted preload=none>, vignette, big play,
 *                    buffering spinner, error/empty/offline state) + .ckh-controls (progress slider with the seven step
 *                    ticks and a glowing playhead; play/pause, sound, time, captions, language version, full screen)
 *     header.ckh-head  kicker, h2, one-line lead, the voice disclosure (or the honest "silent" note), collapse toggle
 *     aside.ckh-chapters  current-step chip + the ten cue lines (transcript = text alternative; a line seeks)
 * Phones stack video → title → chapters (transcript folded behind a toggle); when `main` is ≥ 880 px wide the video
 * sits on the inline-start side and the title + chapters on the inline-end side (css/components.css "Explainer hero").
 *
 * Playback rules
 *   - The poster paints at once (fixed 16:9 box, no layout shift). The video gets its src only after window load +
 *     an idle callback, then autoplays when autoplayDecision() allows it (reduced motion, settings.motion 'reduce',
 *     Save-Data, a collapsed hero or one finished viewing in this tab session all say no).
 *   - Sound: with a narrated file (manifest voice ≠ null) and a page that has already had a user gesture, unmuted play
 *     is tried first; a NotAllowedError falls back to muted play, and the sound control next to play/pause becomes a
 *     prominent labelled "Turn sound on" pill — under the picture, so it never covers the burned-in captions. Silent
 *     files show no sound control at all, only the note "Silent — captions in picture".
 *   - It plays only while ≥ 35 % of the stage is on screen and the tab is visible; it resumes by itself only when it was
 *     playing (automatically or by the reader) and the reader had not paused it. No loop: the end shows a replay state.
 *   - Playback position, the chosen language version and the play/pause intent survive a re-mount (language or numeral
 *     switch, leaving and re-entering the cockpit) through module state; live store updates never touch the hero.
 *     A stretch that started by itself is still autoplay after a re-mount: resumeDecision() runs the policy again (the
 *     motion setting may have been turned down on #/settings meanwhile); a stretch the reader started carries on.
 *
 * Motion and cost: compositor-only. The playhead and progress fill run as one linear Web Animation per playing stretch,
 * and the clock digits are strips stepped by steps() transform animations — all re-synced from the media clock on
 * play / pause / seek / rate change — so the running time writes nothing per frame or per second. The main thread wakes
 * only at cue boundaries (≈ every 4 s: transcript highlight, step chip, slider value; there is no timeupdate listener).
 * The title light sweep runs once per page load; the sound button's equaliser bars move only while sound is playing.
 * All of it is off under reduced motion (OS unless the setting forces motion on, or the setting) and forced colours
 * (motionOn(); the rail and clock then step once per second); print hides the hero (css/print.css). The video itself
 * is content, not decoration: forced colours alone do not stop it (the autoplay policy above decides).
 *
 * Pure helpers (node tests: tests/explainer-hero.test.mjs): autoplayDecision, resumeDecision, cueIndexAt, stepStarts,
 * stepAt, formatClock, seekTarget, checkExplainerManifest, posterVariant.
 */

import { h, clear, svgIcon, button, emptyState, errorState, offlineState } from './components.js';
import { isRtl } from './i18n-bridge.js';

export const STEP_COUNT = 7;
export const VISIBLE_RATIO = 0.35;
export const SEEK_STEP = 5;
export const STORAGE_KEYS = Object.freeze({ collapsed: 'biltix-hse:explainer:collapsed', finished: 'biltix-hse:explainer:finished' });
/**
 * <img sizes> for the poster: ≤ 560 px wide beside the chapters from 1024 px; below, the content column minus the page
 * gutters and the card padding (measured: 360 → 306, 390 → 336, 430 → 376, 768 → 710 px), so a 1.75× phone takes the
 * 640 px file instead of the 1280 px one. Keep in sync with index.html.
 */
export const POSTER_SIZES = '(min-width: 1024px) 560px, calc(100vw - 54px)';
const CUE_IDS = ['intro', 'source', 'validate', 'analyze', 'explain', 'sitecam', 'approve', 'mitigate', 'close', 'outro'];

/* ------------------------------------------------------------------ */
/* Pure helpers                                                         */
/* ------------------------------------------------------------------ */

/**
 * Whether the hero may start by itself. Order of reasons = order of precedence.
 * `motion` is settings.motion ('auto' | 'reduce' | 'full'): 'full' overrides the OS preference, as everywhere in the app.
 * @returns {{ autoplay: boolean, reason: null|'collapsed'|'motion-setting'|'reduced-motion'|'save-data'|'finished' }}
 */
export function autoplayDecision({ reducedMotion = false, motion = 'auto', saveData = false, collapsed = false, finished = false } = {}) {
  if (collapsed) return { autoplay: false, reason: 'collapsed' };
  if (motion === 'reduce' || motion === 'reduced') return { autoplay: false, reason: 'motion-setting' };
  if (reducedMotion && motion !== 'full') return { autoplay: false, reason: 'reduced-motion' };
  if (saveData) return { autoplay: false, reason: 'save-data' };
  if (finished) return { autoplay: false, reason: 'finished' };
  return { autoplay: true, reason: null };
}
export const shouldAutoplay = (env) => autoplayDecision(env).autoplay;

/**
 * Whether a re-mounted hero (language / numeral switch, return to the cockpit) carries on playing.
 * `prev` is what the previous mount handed over: { wantPlay, auto }. A stretch the reader started is theirs and carries
 * on (unless the hero is minimised); one that started by itself is still autoplay, so autoplayDecision() decides again
 * with the current environment (motion turned down on #/settings meanwhile, Save-Data, the OS preference).
 * @returns {{ resume: boolean, reason: null|'collapsed'|'motion-setting'|'reduced-motion'|'save-data'|'finished' }}
 */
export function resumeDecision({ wantPlay = false, auto = false } = {}, env = {}) {
  if (!wantPlay) return { resume: false, reason: null };
  if (env && env.collapsed) return { resume: false, reason: 'collapsed' };
  if (!auto) return { resume: true, reason: null };
  const d = autoplayDecision(env);
  return { resume: d.autoplay, reason: d.reason };
}

/** Index of the cue on screen at `time`: the last cue that has started (gaps keep the previous line); -1 before the first. */
export function cueIndexAt(cues, time) {
  if (!Array.isArray(cues) || !cues.length || typeof time !== 'number' || !Number.isFinite(time)) return -1;
  let lo = 0; let hi = cues.length - 1; let ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (cues[mid].start <= time + 1e-3) { ans = mid; lo = mid + 1; } else hi = mid - 1;
  }
  return ans;
}

/** Start time of each of the seven steps (the first cue carrying that step), null for a step without a cue. */
export function stepStarts(cues, steps = STEP_COUNT) {
  const out = Array.from({ length: steps }, () => null);
  for (const c of Array.isArray(cues) ? cues : []) {
    if (Number.isInteger(c.step) && c.step >= 0 && c.step < steps && (out[c.step] === null || c.start < out[c.step])) out[c.step] = c.start;
  }
  return out;
}

/** Step at `time`: { index (cue), step (0..6 | null), phase ('intro' | 'step' | 'outro') }. */
export function stepAt(cues, time) {
  const i = cueIndexAt(cues, time);
  if (i < 0) return { index: -1, step: null, phase: 'intro' };
  const step = cues[i].step;
  if (Number.isInteger(step)) return { index: i, step, phase: 'step' };
  return { index: i, step: null, phase: i === 0 ? 'intro' : 'outro' };
}

/** m:ss (floored; invalid or negative → 0:00). */
export function formatClock(seconds) {
  const s = typeof seconds === 'number' && Number.isFinite(seconds) && seconds > 0 ? Math.floor(seconds) : 0;
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/**
 * Keyboard seeking on the progress slider. The rail runs left → right in both languages (media timelines are not
 * mirrored), so ArrowRight always moves forward. PageUp / PageDown jump between the seven steps.
 * @returns {number|null} the new time (clamped to 0..duration), or null when the key is not handled.
 */
export function seekTarget(key, { time = 0, duration = 0, starts = [], step = SEEK_STEP } = {}) {
  const d = Number.isFinite(duration) && duration > 0 ? duration : 0;
  const now = Math.min(Math.max(Number.isFinite(time) ? time : 0, 0), d);
  const clamp = (v) => Math.min(Math.max(v, 0), d);
  const marks = (Array.isArray(starts) ? starts : []).filter((v) => typeof v === 'number' && Number.isFinite(v)).sort((a, b) => a - b);
  switch (key) {
    case 'ArrowRight': case 'ArrowUp': return clamp(now + step);
    case 'ArrowLeft': case 'ArrowDown': return clamp(now - step);
    case 'Home': return 0;
    case 'End': return d;
    case 'PageUp': { const next = marks.find((m) => m > now + 0.5); return next === undefined ? d : clamp(next); }
    case 'PageDown': {
      // Back to the start of the current step, or to the previous one when we are already at (≤ 1.5 s into) it.
      const prev = marks.filter((m) => m < now - 1.5);
      return prev.length ? clamp(prev[prev.length - 1]) : 0;
    }
    default: return null;
  }
}

/** The 640 px poster next to the 1280 px one (assets/video/explainer-ar-poster.webp → …-poster-640.webp). */
export function posterVariant(poster) {
  return typeof poster === 'string' && /\.webp$/i.test(poster) ? poster.replace(/\.webp$/i, '-640.webp') : null;
}

/**
 * Shape check of the generated manifest (js/data/explainer-media.js). Returns every problem found, so a broken
 * generator run is caught by the node tests and, at run time, a broken language entry shows the "not available" state.
 */
export function checkExplainerManifest(m, { langs = ['ar', 'en'] } = {}) {
  const errors = [];
  const str = (v) => typeof v === 'string' && v.trim() !== '';
  const pos = (v) => typeof v === 'number' && Number.isFinite(v) && v > 0;
  if (!m || typeof m !== 'object') return { ok: false, errors: ['manifest missing'] };
  if (!str(m.build)) errors.push('build missing');
  if (!m.langs || typeof m.langs !== 'object') return { ok: false, errors: [...errors, 'langs missing'] };
  for (const lang of langs) {
    const e = m.langs[lang];
    const at = (msg) => errors.push(`${lang}: ${msg}`);
    if (!e || typeof e !== 'object') { at('entry missing'); continue; }
    for (const k of ['mp4', 'poster', 'vtt']) if (!str(e[k])) at(`${k} missing`);
    if (str(e.mp4) && !/\.mp4$/i.test(e.mp4)) at('mp4 is not an .mp4 path');
    if (str(e.vtt) && !/\.vtt$/i.test(e.vtt)) at('vtt is not a .vtt path');
    if (!(Number.isInteger(e.width) && e.width > 0 && Number.isInteger(e.height) && e.height > 0)) at('width/height invalid');
    if (!pos(e.duration)) at('duration invalid');
    if (e.voice !== null) {
      if (!e.voice || typeof e.voice !== 'object' || !str(e.voice.name) || !str(e.voice.provider) || !str(e.voice.model)) at('voice must be null or { name, provider, model }');
    }
    if (!Array.isArray(e.cues) || e.cues.length !== CUE_IDS.length) { at(`cues must be ${CUE_IDS.length} entries`); continue; }
    let last = -Infinity;
    e.cues.forEach((c, i) => {
      if (!c || c.id !== CUE_IDS[i]) at(`cue ${i} id should be ${CUE_IDS[i]}`);
      if (!c) return;
      if (!(typeof c.start === 'number' && typeof c.end === 'number' && c.start >= 0 && c.end > c.start)) at(`cue ${c.id} times invalid`);
      else {
        if (c.start < last) at(`cue ${c.id} overlaps the previous cue`);
        if (pos(e.duration) && c.end > e.duration + 0.05) at(`cue ${c.id} ends after the video`);
        last = c.end;
      }
      if (!(c.step === null || (Number.isInteger(c.step) && c.step >= 0 && c.step < STEP_COUNT))) at(`cue ${c.id} step invalid`);
      if (!str(c.text) || /\{\w+\}/.test(c.text)) at(`cue ${c.id} text missing or unfilled`);
    });
    const starts = stepStarts(e.cues);
    if (starts.some((s) => s === null)) at('not every step has a cue');
  }
  return { ok: errors.length === 0, errors };
}

/* ------------------------------------------------------------------ */
/* Module state: survives re-mounts (language / numerals switch, route re-entry) for this page load */
/* ------------------------------------------------------------------ */

const session = {
  saved: false,          // a previous mount wrote its state
  time: 0,
  wantPlay: false,
  userPaused: false,
  auto: false,           // the current playing stretch was started automatically
  soundPref: null,       // null | 'on' | 'off' (the reader's explicit choice)
  captions: false,
  langOverride: null,    // a version the reader picked that differs from the UI language
  swept: false,          // title sweep already shown in this page load
};
/** Test / harness hook: forget the module state (the next mount behaves like a fresh page). */
export function resetExplainerSession() {
  Object.assign(session, { saved: false, time: 0, wantPlay: false, userPaused: false, auto: false, soundPref: null, captions: false, langOverride: null, swept: false });
}

function readStore(kind, key) {
  try { return (kind === 'local' ? window.localStorage : window.sessionStorage).getItem(key); } catch { return null; }
}
function writeStore(kind, key, value) {
  try {
    const s = kind === 'local' ? window.localStorage : window.sessionStorage;
    if (value === null) s.removeItem(key); else s.setItem(key, value);
  } catch { /* storage unavailable: the choice lasts for this page only */ }
}

/* ------------------------------------------------------------------ */
/* Icons (24×24 line glyphs, stroke 1.75 like js/ui/art.js)              */
/* ------------------------------------------------------------------ */

const SVG_NS = 'http://www.w3.org/2000/svg';
function glyphOf(defs, size = 18) {
  const svg = document.createElementNS(SVG_NS, 'svg');
  for (const [k, v] of Object.entries({ viewBox: '0 0 24 24', width: size, height: size, fill: 'none', stroke: 'currentColor', 'stroke-width': '1.75', 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true', focusable: 'false' })) svg.setAttribute(k, String(v));
  svg.classList.add('icon');
  for (const d of defs) {
    const p = document.createElementNS(SVG_NS, d.t || 'path');
    for (const [k, v] of Object.entries(d)) if (k !== 't') p.setAttribute(k, String(v));
    svg.appendChild(p);
  }
  return svg;
}
const ICON = {
  play: (s) => glyphOf([{ d: 'M7.5 5.2v13.6a.8.8 0 0 0 1.2.7l11-6.8a.8.8 0 0 0 0-1.4l-11-6.8a.8.8 0 0 0-1.2.7z', fill: 'currentColor' }], s),
  pause: (s) => glyphOf([{ t: 'rect', x: 6.5, y: 5, width: 3.8, height: 14, rx: 1, fill: 'currentColor', stroke: 'none' }, { t: 'rect', x: 13.7, y: 5, width: 3.8, height: 14, rx: 1, fill: 'currentColor', stroke: 'none' }], s),
  replay: (s) => glyphOf([{ d: 'M4.5 12a7.5 7.5 0 1 0 2.2-5.3' }, { d: 'M4.5 4.5v4h4' }], s),
  sound: (s) => glyphOf([{ d: 'M4 9.5h3.5L12 5.5v13l-4.5-4H4z' }, { d: 'M15.5 9a4 4 0 0 1 0 6' }, { d: 'M18 6.5a7.5 7.5 0 0 1 0 11' }], s),
  muted: (s) => glyphOf([{ d: 'M4 9.5h3.5L12 5.5v13l-4.5-4H4z' }, { d: 'M16 9.5l5 5M21 9.5l-5 5' }], s),
  cc: (s) => glyphOf([{ t: 'rect', x: 3, y: 5.5, width: 18, height: 13, rx: 2.5 }, { d: 'M10.4 10.4a2.1 2.1 0 1 0 0 3.2M16.6 10.4a2.1 2.1 0 1 0 0 3.2' }], s),
  globe: (s) => glyphOf([{ t: 'circle', cx: 12, cy: 12, r: 8.5 }, { d: 'M3.5 12h17M12 3.5c2.4 2.4 3.5 5.3 3.5 8.5s-1.1 6.1-3.5 8.5c-2.4-2.4-3.5-5.3-3.5-8.5s1.1-6.1 3.5-8.5z' }], s),
  expand: (s) => glyphOf([{ d: 'M4.5 9V4.5H9M15 4.5h4.5V9M19.5 15v4.5H15M9 19.5H4.5V15' }], s),
  shrink: (s) => glyphOf([{ d: 'M9 4.5V9H4.5M19.5 9H15V4.5M15 19.5V15h4.5M4.5 15H9v4.5' }], s),
  up: (s) => glyphOf([{ d: 'M6 15l6-6 6 6' }], s),
  down: (s) => glyphOf([{ d: 'M6 9l6 6 6-6' }], s),
  spark: (s) => glyphOf([{ d: 'M12 3.5l1.9 5.1 5.1 1.9-5.1 1.9L12 17.5l-1.9-5.1L5 10.5l5.1-1.9z' }, { d: 'M18.5 15.5l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7z' }], s),
};

/** A span holding several icons, one visible at a time (no DOM churn when the state changes). */
function iconSet(names, size) {
  const wrap = h('span', { class: 'ckh-ic', 'aria-hidden': 'true' });
  const map = {};
  for (const n of names) { const s = h('span', { class: 'ckh-ic-one', 'data-ic': n }); s.appendChild(ICON[n](size)); wrap.appendChild(s); map[n] = s; }
  const show = (n) => { for (const [k, s] of Object.entries(map)) s.hidden = k !== n; };
  show(names[0]);
  return { el: wrap, show };
}

/* ------------------------------------------------------------------ */
/* Component                                                            */
/* ------------------------------------------------------------------ */

let seq = 0;

/**
 * @param {object} o
 * @param {object} o.manifest       EXPLAINER from js/data/explainer-media.js
 * @param {'ar'|'en'} o.uiLang      interface language (the default video version)
 * @param {(key:string, params?:object)=>string} o.t   strings under cockpit.hero.*
 * @param {(s:string)=>string} [o.digits]   numeral system for free text (fmt.digits)
 * @param {(n:number)=>string} [o.num]
 * @param {()=>object} [o.settings]  current settings (motion)
 * @param {{enabled:()=>boolean}} [o.motion]
 * @returns {{ el: HTMLElement, playFromStart: (opts?:{focus?:boolean})=>void, destroy: ()=>void }}
 */
export function createExplainerHero({ manifest, uiLang = 'ar', t, digits = (s) => s, num = (n) => String(n), settings = () => ({}), motion = null } = {}) {
  const uid = `ckh${++seq}${Math.random().toString(36).slice(2, 6)}`;
  // Decorative / progress motion: off under reduced motion (motion.enabled(): OS unless the setting forces it on, the
  // setting, hidden tab) and under forced colours (as charts.js gaugeIdleOn) — the rail and clock then step per second.
  let fcMq = null;
  try { fcMq = window.matchMedia('(forced-colors: active)'); } catch { /* old engine */ }
  const forcedColors = () => !!(fcMq && fcMq.matches);
  const motionOn = () => { if (forcedColors()) return false; try { return !!(motion && typeof motion.enabled === 'function' ? motion.enabled() : false); } catch { return false; } };
  const langs = (manifest && manifest.langs) || {};
  const valid = checkExplainerManifest(manifest);
  const okLang = (l) => !!(langs[l] && typeof langs[l].mp4 === 'string' && Array.isArray(langs[l].cues) && !valid.errors.some((e) => e.startsWith(`${l}:`)));
  const otherOf = (l) => (l === 'ar' ? 'en' : 'ar');
  const langName = (l) => (l === 'en' ? t('langEn') : t('langAr'));

  let vlang = session.langOverride && okLang(session.langOverride) ? session.langOverride : uiLang;
  let entry = langs[vlang] || null;
  let cues = entry && Array.isArray(entry.cues) ? entry.cues : [];
  let starts = stepStarts(cues);
  let voice = entry && entry.voice && typeof entry.voice === 'object' ? entry.voice : null;

  /* ---- state ---- */
  let destroyed = false;
  let collapsed = readStore('local', STORAGE_KEYS.collapsed) === '1';
  let state = 'idle';            // idle | loading | playing | paused | ended | error
  let wantPlay = false;          // the reader (or autoplay) wants it playing; visibility may still hold it
  let userPaused = false;
  let auto = false;
  let inView = false;
  let srcLang = null;            // language whose file is attached to <video>
  let pendingSeek = session.saved && session.time > 0 ? session.time : null;
  let shownTime = pendingSeek || 0;
  let curIdx = -2;
  let lastSec = -1;
  let errored = false;
  let errToken = 0;
  let playPending = false;
  let scrubbing = false;
  let railAnims = [];
  let clockAnims = [];
  let idleHandle = 0;
  let spinTimer = 0;
  let started = false;
  let swept = session.swept;
  const offs = [];
  const on = (target, type, fn, opts) => { target.addEventListener(type, fn, opts); offs.push(() => target.removeEventListener(type, fn, opts)); };

  /* ---- DOM ---- */
  const titleId = `${uid}-title`;
  const mediaId = `${uid}-media`;
  const chapId = `${uid}-chap`;
  const cuesId = `${uid}-cues`;

  const poster = h('img', { class: 'ckh-poster', alt: '', width: 1280, height: 720, decoding: 'async', fetchpriority: 'high', draggable: false });
  const video = h('video', { class: 'ckh-video', playsinline: true, 'webkit-playsinline': true, muted: true, preload: 'none', tabindex: '-1', disableremoteplayback: true, 'aria-label': t('videoAria'), 'aria-describedby': cuesId });
  video.muted = true;
  video.defaultMuted = true;
  const shade = h('span', { class: 'ckh-shade', 'aria-hidden': 'true' });
  const bigIcons = iconSet(['play', 'replay'], 30);
  const bigBtn = h('button', { type: 'button', class: 'ckh-big', 'aria-label': t('playVideo') }, bigIcons.el);
  const spinner = h('span', { class: ['spinner', 'ckh-spin'], 'aria-hidden': 'true', hidden: true });
  const stateHost = h('div', { class: 'ckh-state', hidden: true });
  const stage = h('div', { class: 'ckh-stage' }, poster, video, shade, bigBtn, spinner, stateHost);

  const fill = h('span', { class: 'ckh-fill' });
  const track = h('span', { class: 'ckh-track' }, fill);
  const ticks = h('span', { class: 'ckh-ticks', 'aria-hidden': 'true' });
  const headDot = h('span', { class: 'ckh-dot' });
  const headWrap = h('span', { class: 'ckh-headwrap', 'aria-hidden': 'true' }, headDot);
  const rail = h('div', {
    class: 'ckh-rail', role: 'slider', tabindex: '0', 'aria-label': t('progress'), 'aria-valuemin': '0',
    'aria-valuemax': '0', 'aria-valuenow': '0', 'aria-orientation': 'horizontal', dir: 'ltr',
  }, track, ticks, headWrap);

  const playIcons = iconSet(['play', 'pause', 'replay'], 18);
  const playBtn = button('', { variant: 'primary', icon: playIcons.el, attrs: { class: 'ckh-btn ckh-play', 'aria-label': t('play'), title: t('play') } });
  // Clock "m:ss / m:ss" as digit strips (odometer): while playing, each strip is stepped by a steps() transform animation
  // synced to the media clock, so the running time costs no main-thread work; paused, the strips are set statically.
  const glyphs = digits('0123456789').split('');
  const odo = (n) => { const strip = h('span', { class: 'ckh-odo-strip' }); for (let i = 0; i < n; i += 1) strip.appendChild(h('span', {}, glyphs[i] || String(i))); return { el: h('span', { class: 'ckh-odo' }, strip), strip, n }; };
  const odoMin = odo(10);
  const odoTens = odo(6);
  const odoOnes = odo(10);
  const totalEl = h('span', { class: 'ckh-total' });
  const timeEl = h('span', { class: 'ckh-time', dir: 'ltr', 'aria-hidden': 'true' }, odoMin.el, ':', odoTens.el, odoOnes.el, totalEl);
  // Sound (narrated files only): an icon button; while it plays muted it becomes the prominent labelled "Turn sound on"
  // pill (.is-prompt) — in the control row, never over the picture's burned-in captions; while sound plays the
  // speaker glyph gives way to equaliser bars (they move only while sound is playing).
  const soundIcons = iconSet(['sound', 'muted'], 18);
  soundIcons.el.classList.add('btn-ic');
  const eq = h('span', { class: 'ckh-eq', 'aria-hidden': 'true' }, h('i'), h('i'), h('i'), h('i'));
  const soundLabel = h('span', { class: 'ckh-sound-label', hidden: true });
  const soundBtn = h('button', { type: 'button', class: ['btn', 'btn-ghost', 'btn-icon', 'ckh-btn', 'ckh-sound'], 'aria-label': t('soundOn'), title: t('soundOn') }, soundIcons.el, eq, soundLabel);
  const ccBtn = button('', { variant: 'ghost', icon: ICON.cc(18), attrs: { class: 'ckh-btn ckh-cc', 'aria-label': t('captions'), title: t('captionsTitle'), 'aria-pressed': 'false' } });
  const langCode = h('span', { class: 'ckh-lang-code' });
  const langSr = h('span', { class: 'sr-only' });
  const langBtn = h('button', { type: 'button', class: ['btn', 'btn-ghost', 'ckh-btn', 'ckh-lang'] }, ICON.globe(16), langCode, langSr);
  const fsIcons = iconSet(['expand', 'shrink'], 18);
  const fsBtn = button('', { variant: 'ghost', icon: fsIcons.el, attrs: { class: 'ckh-btn', 'aria-label': t('fullscreen'), title: t('fullscreen') } });
  const row = h('div', { class: 'ckh-row' },
    playBtn, soundBtn, timeEl, h('span', { class: 'ckh-spacer' }), ccBtn, langBtn, fsBtn);
  const controls = h('div', { class: 'ckh-controls', role: 'group', 'aria-label': t('controls') }, rail, row);
  const media = h('div', { class: 'ckh-media', id: mediaId }, stage, controls);

  const sweep = h('span', { class: 'ckh-sweep', 'aria-hidden': 'true' });
  const title = h('h2', { class: 'ckh-title', id: titleId }, h('span', { class: 'ckh-title-text' }, t('title')), sweep);
  const durEl = h('span', { class: 'ckh-dur', dir: 'ltr' });
  const kicker = h('span', { class: 'ckh-kicker' }, ICON.spark(14), h('span', {}, t('kicker')), h('span', { class: 'ckh-sep', 'aria-hidden': 'true' }, '·'), durEl);
  const note = h('span', { class: 'ckh-note' });
  const barIcons = iconSet(['play'], 16);
  const barPlay = button(t('playVideo'), { variant: 'primary', size: 'sm', icon: barIcons.el, attrs: { class: 'ckh-barplay', hidden: true } });
  const collapseIcons = iconSet(['up', 'down'], 16);
  const collapseBtn = button(t('collapse'), { variant: 'ghost', size: 'sm', icon: collapseIcons.el, attrs: { class: 'ckh-collapse', 'aria-controls': `${mediaId} ${chapId}`, 'aria-expanded': 'true', title: t('collapseTitle') } });
  const head = h('header', { class: 'ckh-head' },
    h('div', { class: 'ckh-titles' }, kicker, title, h('p', { class: 'ckh-sub' }, t('sub'))),
    h('div', { class: 'ckh-tools' }, note, barPlay, collapseBtn));

  const chip = h('span', { class: 'ckh-chip' });
  const txIcons = iconSet(['down', 'up'], 16);
  const txLabel = h('span', { class: 'btn-label' }, t('transcriptShow'));
  const txBtn = h('button', { type: 'button', class: ['btn', 'btn-ghost', 'btn-sm', 'ckh-tx'], 'aria-expanded': 'false', 'aria-controls': cuesId }, txIcons.el, txLabel);
  const chapTitle = h('h3', { class: 'ckh-chap-title', id: `${uid}-chap-title` }, t('chapters'));
  const cueList = h('ol', { class: ['ckh-cues', 'is-folded'], id: cuesId, 'aria-label': t('transcriptAria') });
  const chapters = h('div', { class: 'ckh-chapters', id: chapId },
    h('div', { class: 'ckh-chap-head' }, chapTitle, chip, txBtn), cueList);

  const el = h('section', { class: ['card', 'is-framed', 'is-hero', 'ckh'], 'aria-labelledby': titleId, 'data-state': 'idle', 'data-frame': 'poster' },
    media, head, chapters);

  /* ---- rendering helpers ---- */

  const durationNow = () => {
    const d = Number(video.duration);
    if (srcLang && Number.isFinite(d) && d > 0) return d;
    return entry && entry.duration > 0 ? entry.duration : 0;
  };
  const currentTime = () => {
    if (pendingSeek !== null) return pendingSeek;
    return srcLang ? (Number(video.currentTime) || 0) : 0;
  };
  const frac = (time) => { const d = durationNow(); return d > 0 ? Math.min(1, Math.max(0, time / d)) : 0; };
  const clockText = (s) => digits(formatClock(s));

  function setState(next) {
    state = next;
    el.setAttribute('data-state', next);
    const ended = next === 'ended';
    const playing = next === 'playing' || next === 'loading';
    playIcons.show(ended ? 'replay' : (playing && wantPlay ? 'pause' : 'play'));
    const label = ended ? t('replay') : (playing && wantPlay ? t('pause') : t('play'));
    playBtn.setAttribute('aria-label', label);
    playBtn.setAttribute('title', label);
    bigIcons.show(ended ? 'replay' : 'play');
    bigBtn.setAttribute('aria-label', ended ? t('replay') : t('playVideo'));
    bigBtn.hidden = !(next === 'idle' || ended || (next === 'paused' && !wantPlay)) || errored;
    clearTimeout(spinTimer);
    if (next === 'loading') spinTimer = setTimeout(() => { if (state === 'loading') spinner.hidden = false; }, 350);
    else spinner.hidden = true;
    renderSound();
  }

  function renderSound() {
    const sounding = !!voice && !video.muted && state === 'playing';
    // Prominent "Turn sound on" while a narrated file plays (or is about to) without sound.
    const prompt = !!voice && video.muted && !errored && (state === 'playing' || state === 'loading' || (state === 'paused' && wantPlay));
    el.classList.toggle('has-voice', !!voice);
    el.classList.toggle('is-sounding', sounding);
    el.classList.toggle('is-prompting', prompt);
    soundBtn.hidden = !voice;
    soundBtn.classList.toggle('is-prompt', prompt);
    soundBtn.classList.toggle('btn-primary', prompt);
    soundBtn.classList.toggle('btn-ghost', !prompt);
    soundBtn.classList.toggle('btn-icon', !prompt);
    if (!voice) return;
    soundIcons.show(video.muted ? 'muted' : 'sound');
    const label = video.muted ? t('soundOn') : t('soundOff');
    soundBtn.setAttribute('aria-label', label);
    soundBtn.setAttribute('title', label);
    soundLabel.textContent = prompt ? label : '';
    soundLabel.hidden = !prompt;
  }

  function renderNote() {
    clear(note);
    note.classList.toggle('is-ai', !!voice);
    if (voice) {
      note.append(ICON.spark(14), h('span', {}, t('aiVoice')), h('bdi', { class: 'ckh-voice-name', dir: 'ltr', translate: 'no' }, `${voice.name} · ${voice.provider}`));
      note.setAttribute('title', t('aiVoiceTitle', { name: voice.name, provider: voice.provider }));
    } else {
      note.append(ICON.muted(14), h('span', {}, t('silent')));
      note.setAttribute('title', t('silentTitle'));
    }
  }

  function setPoster() {
    const p = entry && entry.poster;
    const small = posterVariant(p);
    poster.removeAttribute('srcset');
    if (p) {
      if (small) { poster.setAttribute('sizes', POSTER_SIZES); poster.setAttribute('srcset', `${small} 640w, ${p} 1280w`); }
      poster.setAttribute('src', p);
      poster.hidden = false;
    } else poster.hidden = true;
  }

  function buildTicks() {
    clear(ticks);
    const d = entry && entry.duration > 0 ? entry.duration : 0;
    starts.forEach((s, i) => {
      if (s === null || !(d > 0)) return;
      ticks.appendChild(h('i', { class: 'ckh-tick', 'data-step': i, style: { insetInlineStart: `${(s / d) * 100}%` } }));
    });
  }

  function buildCues() {
    clear(cueList);
    cueList.setAttribute('lang', vlang);
    cueList.setAttribute('dir', vlang === 'ar' ? 'rtl' : 'ltr');
    cues.forEach((c, i) => {
      const stepTag = Number.isInteger(c.step) ? num(c.step + 1) : '•';
      const btn = h('button', { type: 'button', class: 'ckh-cue', 'data-i': i },
        h('span', { class: 'ckh-cue-time', dir: 'ltr' }, clockText(c.start)),
        h('span', { class: ['ckh-cue-step', Number.isInteger(c.step) ? null : 'is-bookend'], 'aria-hidden': 'true' }, stepTag),
        h('span', { class: 'ckh-cue-text' }, digits(c.text)));
      cueList.appendChild(h('li', {}, btn));
    });
    curIdx = -2;
  }

  function stepLabel(time) {
    const s = stepAt(cues, time);
    if (s.phase === 'step') return t('stepOf', { n: num(s.step + 1), total: num(STEP_COUNT), name: t(`steps.${s.step}`) });
    return s.phase === 'outro' ? t('outro') : t('intro');
  }

  /** Static clock digits (paused, seeking, reduced motion): one transform per strip. */
  function setClock(time) {
    const s = Math.max(0, Math.floor(time));
    const put = (o, k) => { o.strip.style.transform = `translateY(${(-(k % o.n) * 100) / o.n}%)`; };
    put(odoMin, Math.floor(s / 60) % 10);
    put(odoTens, Math.floor((s % 60) / 10));
    put(odoOnes, s % 10);
  }

  /**
   * Current cue, step chip, slider value and (when not animated) the clock. Called by the cue-boundary timer
   * while playing, and directly on seeks / state changes; writes only what changed. The slider's value is kept
   * per second only while it has focus (the visible clock runs on the compositor).
   */
  function renderTime(time, force = false) {
    shownTime = time;
    const sec = Math.floor(time);
    const d = durationNow();
    const idx = cueIndexAt(cues, time);
    const animated = clockAnims.length && !scrubbing;
    if (!animated && (force || sec !== lastSec)) setClock(time);
    if (force || idx !== curIdx || (sec !== lastSec && document.activeElement === rail)) {
      const total = ` / ${clockText(d)}`;
      if (totalEl.textContent !== total) totalEl.textContent = total;
      const lab = stepLabel(time);
      rail.setAttribute('aria-valuemax', String(Math.round(d)));
      rail.setAttribute('aria-valuenow', String(Math.min(Math.round(d), Math.round(time))));
      rail.setAttribute('aria-valuetext', t('valueText', { time: clockText(time), total: clockText(d), step: lab }));
      if (idx !== curIdx) {
        const prev = curIdx >= 0 ? cueList.querySelector(`.ckh-cue[data-i="${curIdx}"]`) : null;
        if (prev) prev.removeAttribute('aria-current');
        curIdx = idx;
        const cur = idx >= 0 ? cueList.querySelector(`.ckh-cue[data-i="${idx}"]`) : null;
        if (cur) { cur.setAttribute('aria-current', 'true'); revealCue(cur); }
        chip.textContent = lab;
      }
    }
    lastSec = sec;
    if (!railAnims.length || scrubbing) setRail(frac(time));
  }

  function revealCue(btn) {
    const li = btn.parentElement;
    if (!li || cueList.scrollHeight <= cueList.clientHeight + 1) return;
    if (cueList.matches(':hover') || cueList.contains(document.activeElement)) return;
    const top = li.offsetTop;
    const bottom = top + li.offsetHeight;
    if (top >= cueList.scrollTop && bottom <= cueList.scrollTop + cueList.clientHeight) return;
    try { cueList.scrollTo({ top: Math.max(0, top - cueList.clientHeight / 3), behavior: motionOn() ? 'smooth' : 'auto' }); } catch { cueList.scrollTop = top; }
  }

  /* ---- progress rail (compositor-driven while playing) ---- */

  const fillTf = (p) => `scaleX(${p.toFixed(4)})`;
  const headTf = (p) => `translateX(${(p * 100).toFixed(3)}%)`;
  function setRail(p) { fill.style.transform = fillTf(p); headWrap.style.transform = headTf(p); }
  function stopRail() {
    for (const a of railAnims.concat(clockAnims)) { try { a.cancel(); } catch { /* gone */ } }
    railAnims = [];
    clockAnims = [];
    stopTicks();
  }
  /**
   * (Re)start the compositor animations for one playing stretch: progress fill + playhead (linear to the end) and
   * the three clock strips (steps()), all from the media's current time; then arm the cue-boundary timer.
   */
  function syncRail() {
    stopRail();
    const time = currentTime();
    const p = frac(time);
    setRail(p);
    setClock(time);
    lastSec = Math.floor(time);
    const d = durationNow();
    if (state !== 'playing' || video.paused || scrubbing || !(d > 0)) return;
    const rate = video.playbackRate || 1;
    if (motionOn() && typeof fill.animate === 'function') {
      const remain = ((d - time) / rate) * 1000;
      try {
        if (remain > 50) {
          const opts = { duration: remain, easing: 'linear', fill: 'forwards' };
          railAnims = [fill.animate([{ transform: fillTf(p) }, { transform: 'scaleX(1)' }], opts), headWrap.animate([{ transform: headTf(p) }, { transform: 'translateX(100%)' }], opts)];
          railAnims[0].__start = time;
          railAnims[0].__remain = remain;
        }
        if (d < 600) {
          clockAnims = [[odoMin, 60], [odoTens, 10], [odoOnes, 1]].map(([o, unit]) => {
            const a = o.strip.animate([{ transform: 'translateY(0%)' }, { transform: 'translateY(-100%)' }], { duration: o.n * unit * 1000, iterations: Infinity, easing: `steps(${o.n}, end)` });
            a.playbackRate = rate;
            a.currentTime = (time * 1000) % (o.n * unit * 1000);
            return a;
          });
          clockAnims[2].__t0 = time;
        }
      } catch { stopRail(); setRail(p); setClock(time); }
    }
    scheduleTick();
  }
  /** True when the running animations drift from the media clock by more than 0.25 s (stall, rate change). */
  function drifted(time) {
    const a = railAnims[0];
    if (a && a.__remain > 0) {
      const progressed = (Number(a.currentTime) || 0) / a.__remain;
      const expected = a.__start + progressed * (durationNow() - a.__start);
      if (Math.abs(expected - time) > 0.25) return true;
    }
    const c = clockAnims[2];
    if (c) {
      const shown = ((Number(c.currentTime) || 0) / 1000) % 10;
      const diff = Math.abs(shown - (time % 10));
      if (Math.min(diff, 10 - diff) > 0.25) return true;
    }
    return false;
  }

  /*
   * While playing, the main thread wakes only at the next cue boundary (≈ every 4 s) to move the transcript highlight,
   * the step chip and the slider value — or every second when the clock is not animated (reduced motion) or the
   * slider has focus — and at most every 5 s as a drift check. No timeupdate listener.
   */
  let tickTimer = 0;
  function stopTicks() { if (tickTimer) { clearTimeout(tickTimer); tickTimer = 0; } }
  function scheduleTick() {
    stopTicks();
    if (destroyed || state !== 'playing' || video.paused || scrubbing) return;
    const time = Number(video.currentTime) || 0;
    const rate = video.playbackRate || 1;
    const next = cues.find((c) => c.start > time + 0.02);
    let target = next ? next.start : durationNow();
    if (!clockAnims.length || document.activeElement === rail) target = Math.min(target, Math.floor(time) + 1);
    const wait = Math.max(40, Math.min(5000, ((target - time) / rate) * 1000 + 30));
    tickTimer = setTimeout(onTick, wait);
  }
  function onTick() {
    tickTimer = 0;
    if (destroyed || scrubbing || video.paused) return;
    const time = Number(video.currentTime) || 0;
    if ((railAnims.length || clockAnims.length) && drifted(time)) { renderTime(time); syncRail(); return; }
    renderTime(time);
    scheduleTick();
  }

  /* ---- media ---- */

  function attachTrack() {
    const old = video.querySelector('track');
    if (old) old.remove();
    if (!session.captions || !entry || !entry.vtt) return;
    const tr = h('track', { kind: 'captions', src: entry.vtt, srclang: vlang, label: langName(vlang) });
    video.appendChild(tr);
    try { tr.track.mode = 'showing'; } catch { /* old engine */ }
  }

  function ensureSrc() {
    if (srcLang === vlang || !entry || !okLang(vlang)) return;
    srcLang = vlang;
    video.setAttribute('lang', vlang);
    video.src = entry.mp4;
    attachTrack();
  }

  function detachSrc() {
    if (!srcLang) return;
    srcLang = null;
    try { video.pause(); } catch { /* noop */ }
    try { video.removeAttribute('src'); video.load(); } catch { /* noop */ }
  }

  function hasActivation() {
    try { return !!(navigator.userActivation && navigator.userActivation.hasBeenActive); } catch { return false; }
  }

  async function doPlay() {
    if (destroyed || errored || playPending) return;
    if (!okLang(vlang)) { showMissing(); return; }
    ensureSrc();
    if (state !== 'playing') setState('loading');
    playPending = true;
    try {
      await video.play();
    } catch (err) {
      const name = err && err.name;
      if (name === 'NotAllowedError' && !video.muted) {
        video.muted = true;                       // unmuted autoplay refused: play muted, offer the sound pill
        renderSound();
        try { await video.play(); } catch (e2) { if (e2 && e2.name === 'NotAllowedError') blocked(); }
      } else if (name === 'NotAllowedError') blocked();
      // AbortError: a pause or a new src interrupted play() — the state machine already moved on.
    } finally {
      playPending = false;
      if (!destroyed && !video.paused && !shouldPlay()) { try { video.pause(); } catch { /* noop */ } }
    }
  }

  function blocked() {
    wantPlay = false;
    auto = false;
    setState(srcLang && currentTime() > 0 ? 'paused' : 'idle');
    el.setAttribute('data-autoplay', 'blocked');
  }

  const shouldPlay = () => wantPlay && !collapsed && inView && !document.hidden && !errored && !destroyed;

  function apply() {
    if (destroyed) return;
    if (shouldPlay()) { if (video.paused && !playPending) doPlay(); }
    else if (!video.paused) { try { video.pause(); } catch { /* noop */ } }
  }

  /* ---- reader actions ---- */

  /**
   * Playback the reader asked for (a gesture). sound: 'keep' (control-bar toggle), 'auto' (first start: with sound
   * unless the reader muted it before) or 'on' (the header button). Muted only matters when the file has a voice.
   */
  function userPlay({ sound = 'keep' } = {}) {
    if (errored) clearError();
    wantPlay = true;
    userPaused = false;
    auto = false;
    if (voice && (sound === 'on' || (sound === 'auto' && session.soundPref !== 'off'))) video.muted = false;
    if (state === 'ended' || (srcLang && video.ended)) seek(0);
    setState('loading');
    // Start inside the gesture (unmuted play needs it on some engines); if the stage is off screen the
    // visibility rule pauses it again and resumes it once the stage scrolls back into view.
    doPlay();
  }

  function userPause() {
    wantPlay = false;
    userPaused = true;
    auto = false;
    try { video.pause(); } catch { /* noop */ }
    setState(state === 'idle' ? 'idle' : 'paused');
  }

  function togglePlay() {
    if (state === 'ended') { seek(0); userPlay({ sound: 'auto' }); return; }
    if (wantPlay && (state === 'playing' || state === 'loading')) userPause();
    else userPlay({ sound: state === 'idle' ? 'auto' : 'keep' });
  }

  function setMuted(muted) {
    video.muted = muted;
    session.soundPref = muted ? 'off' : 'on';
    renderSound();
    if (!muted && video.paused && wantPlay) apply();
  }

  function seek(time) {
    const d = durationNow();
    const target = Math.min(Math.max(Number(time) || 0, 0), d > 0 ? d : 0);
    if (srcLang && video.readyState >= 1) {
      try { video.currentTime = target; pendingSeek = null; } catch { pendingSeek = target; }
    } else pendingSeek = target;
    if (state === 'ended' && target < d - 0.05) setState(wantPlay ? 'loading' : 'paused');
    renderTime(target, true);
    if (!scrubbing) syncRail();
  }

  function switchLang(next, { play = false } = {}) {
    if (!langs[next] || next === vlang) return;
    const time = currentTime();
    const resume = wantPlay || play;
    detachSrc();
    vlang = next;
    session.langOverride = next !== uiLang ? next : null;
    entry = langs[vlang];
    cues = Array.isArray(entry.cues) ? entry.cues : [];
    starts = stepStarts(cues);
    voice = entry.voice && typeof entry.voice === 'object' ? entry.voice : null;
    if (!voice) video.muted = true;
    clearError();
    pendingSeek = state === 'ended' ? 0 : time;
    el.setAttribute('data-frame', 'poster');
    setPoster();
    buildTicks();
    buildCues();
    renderLangBtn();
    renderNote();
    renderTime(pendingSeek, true);
    if (!okLang(vlang)) { showMissing(); return; }
    if (resume) { wantPlay = true; setState('loading'); if (!inView) inView = true; doPlay(); } else setState(time > 0 ? 'paused' : 'idle');
  }

  function renderLangBtn() {
    const other = otherOf(vlang);
    const available = !!langs[other];
    langBtn.hidden = !available;
    langCode.textContent = other === 'en' ? 'EN' : 'ع';
    langCode.setAttribute('lang', other);
    langSr.textContent = other === 'en' ? t('versionEn') : t('versionAr');
    langBtn.setAttribute('title', langSr.textContent);
  }

  function toggleCaptions() {
    session.captions = !session.captions;
    ccBtn.setAttribute('aria-pressed', session.captions ? 'true' : 'false');
    if (srcLang) attachTrack();
  }

  const fsEl = () => document.fullscreenElement || document.webkitFullscreenElement || null;
  function toggleFullscreen() {
    try {
      if (fsEl()) { (document.exitFullscreen || document.webkitExitFullscreen).call(document); return; }
      if (media.requestFullscreen) media.requestFullscreen().catch(() => {});
      else if (media.webkitRequestFullscreen) media.webkitRequestFullscreen();
      else if (video.webkitEnterFullscreen) { ensureSrc(); video.webkitEnterFullscreen(); }
    } catch { /* not allowed */ }
  }
  function renderFs() {
    const full = fsEl() === media;
    fsIcons.show(full ? 'shrink' : 'expand');
    const label = full ? t('exitFullscreen') : t('fullscreen');
    fsBtn.setAttribute('aria-label', label);
    fsBtn.setAttribute('title', label);
  }

  function setCollapsed(next, { user = false } = {}) {
    collapsed = !!next;
    el.classList.toggle('is-collapsed', collapsed);
    media.hidden = collapsed;
    chapters.hidden = collapsed;
    barPlay.hidden = !collapsed;
    collapseIcons.show(collapsed ? 'down' : 'up');
    collapseBtn.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
    const lab = collapseBtn.querySelector('.btn-label');
    if (lab) lab.textContent = collapsed ? t('expand') : t('collapse');
    if (collapsed) { wantPlay = false; auto = false; if (!video.paused) { try { video.pause(); } catch { /* noop */ } } if (state === 'playing' || state === 'loading') setState('paused'); }
    if (user) writeStore('local', STORAGE_KEYS.collapsed, collapsed ? '1' : null);
    apply();
  }

  function setTranscript(open) {
    cueList.classList.toggle('is-folded', !open);
    txBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
    txIcons.show(open ? 'up' : 'down');
    txLabel.textContent = open ? t('transcriptHide') : t('transcriptShow');
  }

  /* ---- errors / empty states inside the stage ---- */

  function showState(node) {
    clear(stateHost);
    stateHost.appendChild(node);
    stateHost.hidden = false;
    bigBtn.hidden = true;
    renderSound();
  }
  function clearError() {
    errored = false;
    errToken += 1;
    clear(stateHost);
    stateHost.hidden = true;
  }
  function retry() {
    clearError();
    detachSrc();
    userPlay();
  }
  function showMissing() {
    errored = true;
    wantPlay = false;
    stopRail();
    setState('error');
    const other = otherOf(vlang);
    showState(emptyState({
      icon: 'play', title: t('missingTitle', { lang: langName(vlang) }), text: t('missingText'),
      action: okLang(other) ? { label: t('watchOther', { lang: langName(other) }), icon: 'play', onClick: () => switchLang(other, { play: true }) } : null,
    }));
  }
  async function onError() {
    if (destroyed || !srcLang || !video.error) return;
    const my = ++errToken;
    errored = true;
    wantPlay = false;
    stopRail();
    setState('error');
    if (typeof navigator !== 'undefined' && navigator.onLine === false) { showState(offlineState({ text: t('offlineText'), retry })); return; }
    let missing = false;
    try { const res = await fetch(entry.mp4, { method: 'HEAD', cache: 'no-cache' }); missing = res.status === 404; } catch {
      if (my !== errToken || destroyed) return;
      showState(navigator.onLine === false ? offlineState({ text: t('offlineText'), retry }) : errorState({ title: t('errorTitle'), text: t('errorText'), retry }));
      return;
    }
    if (my !== errToken || destroyed) return;
    if (missing) { srcLang = null; showMissing(); return; }
    showState(errorState({ title: t('errorTitle'), text: t('errorText'), retry }));
  }

  /* ---- events ---- */

  on(bigBtn, 'click', () => { if (state === 'ended') seek(0); userPlay({ sound: 'auto' }); });
  on(playBtn, 'click', togglePlay);
  on(soundBtn, 'click', () => setMuted(!video.muted));
  on(ccBtn, 'click', toggleCaptions);
  on(langBtn, 'click', () => switchLang(otherOf(vlang)));
  on(fsBtn, 'click', toggleFullscreen);
  on(document, 'fullscreenchange', renderFs);
  on(document, 'webkitfullscreenchange', renderFs);
  on(collapseBtn, 'click', () => setCollapsed(!collapsed, { user: true }));
  on(barPlay, 'click', () => { setCollapsed(false, { user: true }); userPlay({ sound: 'auto' }); try { playBtn.focus({ preventScroll: true }); } catch { /* noop */ } });
  on(txBtn, 'click', () => setTranscript(cueList.classList.contains('is-folded')));
  on(cueList, 'click', (e) => {
    const btn = e.target && e.target.closest ? e.target.closest('.ckh-cue') : null;
    if (!btn) return;
    const c = cues[Number(btn.getAttribute('data-i'))];
    if (!c) return;
    seek(c.start + 0.02);
    // Phones: the transcript sits under the video; bring the picture back before it plays.
    if (!inView) { try { stage.scrollIntoView({ block: 'nearest', behavior: motionOn() ? 'smooth' : 'auto' }); } catch { /* noop */ } }
    if (!(wantPlay && (state === 'playing' || state === 'loading'))) userPlay({ sound: state === 'idle' ? 'auto' : 'keep' });
  });
  // Clicking the picture toggles playback (pointer convenience; the buttons carry the keyboard path).
  on(stage, 'click', (e) => {
    if (e.target !== video && e.target !== poster && e.target !== shade && e.target !== stage) return;
    if (errored) return;
    togglePlay();
  });

  /* rail: pointer scrubbing + keyboard */
  const railFrac = (e) => {
    const r = rail.getBoundingClientRect();
    return r.width > 0 ? Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)) : 0;
  };
  let scrubFrame = 0;
  let scrubTo = null;
  const flushScrub = () => { scrubFrame = 0; if (scrubTo !== null) { seek(scrubTo * durationNow()); scrubTo = null; } };
  on(rail, 'pointerdown', (e) => {
    if (e.button !== 0) return;
    scrubbing = true;
    stopRail();
    try { rail.setPointerCapture(e.pointerId); } catch { /* noop */ }
    seek(railFrac(e) * durationNow());
  });
  on(rail, 'pointermove', (e) => {
    if (!scrubbing) return;
    scrubTo = railFrac(e);
    if (!scrubFrame) scrubFrame = requestAnimationFrame(flushScrub);
  });
  const endScrub = () => { if (!scrubbing) return; scrubbing = false; if (scrubFrame) { cancelAnimationFrame(scrubFrame); flushScrub(); } syncRail(); };
  on(rail, 'pointerup', endScrub);
  on(rail, 'pointercancel', endScrub);
  on(rail, 'keydown', (e) => {
    const next = seekTarget(e.key, { time: currentTime(), duration: durationNow(), starts });
    if (next === null) return;
    e.preventDefault();
    seek(next);
  });

  /* media element */
  on(video, 'loadedmetadata', () => {
    if (pendingSeek !== null) { const target = pendingSeek; pendingSeek = null; try { video.currentTime = target; } catch { /* noop */ } }
    renderTime(currentTime(), true);
  });
  on(video, 'playing', () => {
    if (destroyed) return;
    el.setAttribute('data-frame', 'video');
    setState('playing');
    syncRail();
  });
  on(video, 'pause', () => {
    if (destroyed || video.ended || errored) return;   // a media error pauses too: keep the error state
    setState(state === 'idle' ? 'idle' : 'paused');
    syncRail();
  });
  on(video, 'waiting', () => { if (wantPlay && !video.paused && !errored) { setState('loading'); stopRail(); } });
  on(video, 'seeking', () => { if (!scrubbing) stopRail(); });
  on(video, 'seeked', () => { if (!scrubbing) { renderTime(currentTime(), true); syncRail(); } });
  on(video, 'ratechange', syncRail);
  on(video, 'volumechange', renderSound);
  on(video, 'loadeddata', () => { if (state !== 'idle') el.setAttribute('data-frame', 'video'); });
  on(rail, 'focus', () => { renderTime(currentTime(), true); scheduleTick(); });
  on(rail, 'blur', scheduleTick);
  on(video, 'ended', () => {
    wantPlay = false;
    auto = false;
    stopRail();
    setRail(1);
    setState('ended');
    renderTime(durationNow(), true);
    writeStore('session', STORAGE_KEYS.finished, '1');
  });
  on(video, 'error', onError);
  on(poster, 'error', () => {
    // The 640 px variant may be missing after a new export: fall back to the full poster, then to the dark stage.
    if (poster.hasAttribute('srcset')) { poster.removeAttribute('srcset'); poster.removeAttribute('sizes'); if (entry && entry.poster) poster.setAttribute('src', entry.poster); return; }
    poster.hidden = true;
  });
  on(document, 'visibilitychange', apply);

  /* visibility of the stage: play only while ≥ 35 % of it is on screen */
  let io = null;
  if (typeof IntersectionObserver === 'function') {
    io = new IntersectionObserver((entries) => {
      for (const en of entries) {
        inView = en.isIntersecting && en.intersectionRatio >= VISIBLE_RATIO - 0.001;
        if (inView) sweepTitle();
      }
      apply();
    }, { threshold: [0, VISIBLE_RATIO, 0.6, 1] });
    io.observe(stage);
  } else inView = true;

  /** One light sweep over the title the first time the hero is seen in this page load. */
  function sweepTitle() {
    if (swept || collapsed) return;
    swept = true;
    session.swept = true;
    if (!motionOn() || typeof sweep.animate !== 'function') return;
    const s = isRtl() ? -1 : 1;
    try {
      sweep.animate([
        { transform: `translateX(${s * -110}%)`, opacity: 0 },
        { opacity: 1, offset: 0.2 },
        { opacity: 1, offset: 0.75 },
        { transform: `translateX(${s * 260}%)`, opacity: 0 },
      ], { duration: 1100, delay: 220, easing: 'cubic-bezier(.22,1,.36,1)' });
    } catch { /* decoration only */ }
  }

  /* ---- autoplay after load + idle ---- */

  function policyEnv() {
    const s = (typeof settings === 'function' ? settings() : null) || {};
    const attr = document.documentElement.getAttribute('data-motion');
    const motionSetting = s.motion === 'reduce' || s.motion === 'full' ? s.motion : (attr === 'reduce' || attr === 'reduced' || attr === 'full' ? attr : 'auto');
    let reduced = false;
    try { reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { /* old engine */ }
    let saveData = false;
    try { saveData = !!(navigator.connection && navigator.connection.saveData); } catch { /* noop */ }
    return { reducedMotion: reduced, motion: motionSetting, saveData, collapsed, finished: readStore('session', STORAGE_KEYS.finished) === '1' };
  }

  function start() {
    idleHandle = 0;
    if (destroyed || started) return;
    started = true;
    if (session.saved) {
      // Re-mount: carry on as before (the reader's own pause, the position and the version are kept) — but a stretch
      // that started by itself goes through the autoplay policy again (resumeDecision).
      userPaused = session.userPaused;
      const decision = resumeDecision({ wantPlay: session.wantPlay, auto: session.auto }, policyEnv());
      if (decision.resume && okLang(vlang)) {
        wantPlay = true;
        auto = session.auto;
        if (voice) video.muted = !(session.soundPref === 'on' || (session.soundPref === null && hasActivation() && !session.auto));
        setState('loading');
        apply();
      }
      // Not resumed because of the policy: the position is kept and the big play button waits for the reader.
      el.setAttribute('data-autoplay', decision.resume || !decision.reason ? 'resumed' : decision.reason);
      return;
    }
    const decision = autoplayDecision(policyEnv());
    el.setAttribute('data-autoplay', decision.autoplay ? 'on' : decision.reason);
    if (!decision.autoplay || !okLang(vlang)) return;
    wantPlay = true;
    auto = true;
    video.muted = !(voice && hasActivation() && session.soundPref !== 'off');
    setState('loading');
    apply();
  }

  /**
   * Motion turned down while the hero runs (settings → html[data-motion], or the OS preference): a video that started
   * on its own stops (it is motion too; the reader can still press play), and the rail / clock re-sync to stepwise updates.
   */
  function onMotionChange() {
    if (destroyed) return;
    const env = policyEnv();
    const reduce = env.motion === 'reduce' || env.motion === 'reduced' || (env.reducedMotion && env.motion !== 'full');
    if (reduce && auto && wantPlay) {
      wantPlay = false;
      auto = false;
      try { video.pause(); } catch { /* noop */ }
      setState(srcLang && currentTime() > 0 ? 'paused' : 'idle');
    }
    syncRail();
  }
  let motionMo = null;
  if (typeof MutationObserver === 'function') {
    motionMo = new MutationObserver(onMotionChange);
    motionMo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-motion'] });
  }
  try { const mq = window.matchMedia('(prefers-reduced-motion: reduce)'); if (mq && mq.addEventListener) on(mq, 'change', onMotionChange); } catch { /* old engine */ }
  // Forced colours switched on / off while it plays: the rail and clock move to (or back from) stepwise updates.
  try { if (fcMq && fcMq.addEventListener) on(fcMq, 'change', onMotionChange); } catch { /* old engine */ }

  const ric = typeof requestIdleCallback === 'function' ? (fn) => requestIdleCallback(fn, { timeout: 2500 }) : (fn) => setTimeout(fn, 200);
  const cancelRic = typeof cancelIdleCallback === 'function' ? (id) => cancelIdleCallback(id) : (id) => clearTimeout(id);
  const onLoad = () => { if (!destroyed && !started) idleHandle = ric(start); };
  if (document.readyState === 'complete') onLoad(); else on(window, 'load', onLoad, { once: true });

  /* ---- first render ---- */
  setPoster();
  buildTicks();
  buildCues();
  renderNote();
  renderLangBtn();
  renderFs();
  fsBtn.hidden = !(media.requestFullscreen || media.webkitRequestFullscreen || video.webkitEnterFullscreen);
  ccBtn.setAttribute('aria-pressed', session.captions ? 'true' : 'false');
  durEl.textContent = entry && entry.duration > 0 ? clockText(entry.duration) : '';
  setTranscript(false);
  setCollapsed(collapsed);
  setState('idle');
  renderTime(shownTime, true);
  // A version missing from (or broken in) the manifest: the empty state offers the other one, no network needed.
  if (!okLang(vlang)) showMissing();

  return {
    el,
    /** Header button: show the hero, start from the beginning with sound (it is the reader's gesture). */
    playFromStart({ focus = true } = {}) {
      if (destroyed) return;
      if (collapsed) setCollapsed(false, { user: true });
      try { el.scrollIntoView({ block: 'start', behavior: motionOn() ? 'smooth' : 'auto' }); } catch { el.scrollIntoView(); }
      if (voice) session.soundPref = 'on';
      seek(0);
      userPlay({ sound: 'on' });
      if (focus) { try { playBtn.focus({ preventScroll: true }); } catch { playBtn.focus(); } }
    },
    /** For tests and the QA harness. */
    debug: () => ({ state, wantPlay, userPaused, auto, inView, collapsed, vlang, srcLang, muted: video.muted, time: currentTime(), curIdx, voice: !!voice }),
    destroy() {
      if (destroyed) return;
      // Only a hero that got going (autoplay decided, or the reader acted) hands its state to the next mount;
      // one torn down before its idle start leaves the session untouched, so the next mount decides afresh.
      if (started || wantPlay || userPaused || currentTime() > 0) {
        session.saved = true;
        session.time = state === 'ended' ? 0 : currentTime();
        session.wantPlay = wantPlay && state !== 'ended';
        session.userPaused = userPaused;
        session.auto = auto;
        if (voice && wantPlay && session.soundPref === null && !video.muted) session.soundPref = 'on';
      }
      destroyed = true;
      if (idleHandle) cancelRic(idleHandle);
      clearTimeout(spinTimer);
      stopRail();
      if (io) io.disconnect();
      if (motionMo) motionMo.disconnect();
      offs.splice(0).forEach((off) => { try { off(); } catch { /* noop */ } });
      detachSrc();
    },
  };
}

export default createExplainerHero;
