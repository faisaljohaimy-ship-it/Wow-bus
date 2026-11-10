import { Easing } from 'remotion';

/**
 * BILTIX v3.1 visual language, light theme (biltix-hse/css/tokens.css :root[data-theme="light"]).
 * Status colours are marks only and always ship with a printed label; the *Text variants are
 * the ≥ 4.5:1 text tones on white from the same token file.
 */
export const C = {
  bg: '#F4F7FB', // --bg-0 app plane
  surface: '#FFFFFF', // --bg-1 card
  raised: '#F3F6FA', // --bg-2 nested / inputs
  pressed: '#E8EEF6', // --bg-3
  border: '#DCE5EF', // --line
  border2: '#C5D2E1', // --line-2
  lineStrong: '#7888A0', // --line-strong
  ink: '#132238', // --ink-1
  ink2: '#3D4F69', // --ink-2
  ink3: '#55647C', // --ink-3
  primary: '#2F6FED', // --brand
  primaryText: '#1F5AD6', // --brand-text
  accent: '#0E93AC', // --accent (light)
  accentBright: '#19C6E6', // --accent (dark) — highlights only, never text on white
  accentText: '#0A7489', // --accent-text
  gold: '#B8860B', // --gold (light) — ornament only, never status
  // status marks (both themes) + light text tones
  red: '#D03B3B',
  amber: '#FAB219',
  orange: '#EC835A',
  green: '#0CA30C',
  redText: '#B42318',
  amberText: '#8A5A00',
  orangeText: '#A4471F',
  greenText: '#087208',
  // the light theme's survey grid ink
  grid: '#132238',
} as const;

/** Nickel-orange metal edge (light), the same banded gradient as --edge-metal. */
export const METAL =
  'linear-gradient(135deg, #A8480B 0%, #E8731B 16%, #FFB46A 28%, #F08A2E 38%, #B4500D 52%, #EE7E22 66%, #FFC27F 78%, #D8661A 90%, #A8480B 100%)';
/** Laser comet colours (--beam-*). */
export const BEAM = { tail: 'rgba(255,106,0,0.38)', core: '#FF5E00', head: '#FFE2C2', glow: 'rgba(255,110,20,0.45)' } as const;
/** Card elevation (--elev-1) + metal glow (--edge-glow), scaled for a 1080p frame. */
export const ELEV = '0 2px 4px rgba(19,34,56,0.06), 0 14px 34px -18px rgba(19,34,56,0.22), 0 18px 40px -26px rgba(200,90,20,0.38)';

export type Tone = 'critical' | 'serious' | 'warning' | 'good';
export const TONE: Record<Tone, string> = { critical: C.red, serious: C.orange, warning: C.amber, good: C.green };
export const TONE_TEXT: Record<Tone, string> = { critical: C.redText, serious: C.orangeText, warning: C.amberText, good: C.greenText };
export const RATING_TONE: Record<string, Tone> = { red: 'critical', yellow: 'warning', green: 'good' };
/** Light-theme ring tone for warning (the app mixes 72 % warning with its text tone for contrast). */
export const RING_TONE: Record<Tone, string> = { critical: C.red, serious: C.orange, warning: '#D69A14', good: C.green };

export const FONT = {
  ar: '"IBM Plex Sans Arabic", "IBM Plex Sans", sans-serif',
  en: '"IBM Plex Sans", "IBM Plex Sans Arabic", sans-serif',
  mono: '"IBM Plex Mono", ui-monospace, monospace',
} as const;

/**
 * Easing set — no linear motion for UI elements.
 * `cam` is the dolly / pan curve: a long, soft acceleration and an even longer settle,
 * so the camera never starts or stops abruptly. `orbit` is gentler still (arc moves).
 */
export const EASE = {
  out: Easing.bezier(0.22, 1, 0.36, 1),
  expo: Easing.bezier(0.16, 1, 0.3, 1),
  inOut: Easing.bezier(0.65, 0, 0.35, 1),
  soft: Easing.bezier(0.45, 0, 0.25, 1),
  cam: Easing.bezier(0.42, 0, 0.18, 1),
  orbit: Easing.bezier(0.37, 0, 0.27, 1),
} as const;

/** 1 frame ≈ 33 ms at 30 fps: the stagger unit for related elements (25–40 ms). */
export const STAGGER = 1;

/** Virtual camera lens: CSS perspective distance (px). 2200 px ≈ a 50 mm look on a 1920 px frame. */
export const LENS = 2200;

export const nf = new Intl.NumberFormat('en-US');
export const fmtNum = (n: number) => nf.format(Math.round(n));
export const fmtPct = (n: number, digits = 1) => `${n.toFixed(digits)}%`;
