import { Easing } from 'remotion';

/** BILTIX precision palette (dark engineering surfaces). */
export const C = {
  bg: '#080F1B',
  surface: '#111D2E',
  raised: '#17263B',
  border: '#26384F',
  borderSoft: 'rgba(38, 56, 79, 0.65)',
  ink: '#F4F7FB',
  ink2: '#B8C6D8',
  ink3: '#8796AC',
  primary: '#2F6FED',
  accent: '#19C6E6',
  gold: '#D4A017',
  // Risk states — same values as the app's tokens.css; always paired with a text label.
  red: '#D03B3B',
  amber: '#FAB219',
  orange: '#EC835A',
  green: '#0CA30C',
  greenInk: '#3CCB5A',
  grid: 'rgba(150, 182, 232, 1)',
} as const;

export type Tone = 'critical' | 'serious' | 'warning' | 'good';
export const TONE: Record<Tone, string> = { critical: C.red, serious: C.orange, warning: C.amber, good: C.green };
export const RATING_TONE: Record<string, Tone> = { red: 'critical', yellow: 'warning', green: 'good' };

export const FONT = {
  ar: '"IBM Plex Sans Arabic", "IBM Plex Sans", sans-serif',
  en: '"IBM Plex Sans", "IBM Plex Sans Arabic", sans-serif',
  mono: '"IBM Plex Mono", ui-monospace, monospace',
} as const;

/** Easing set — no linear motion for UI elements. */
export const EASE = {
  out: Easing.bezier(0.22, 1, 0.36, 1),
  expo: Easing.bezier(0.16, 1, 0.3, 1),
  inOut: Easing.bezier(0.65, 0, 0.35, 1),
  soft: Easing.bezier(0.45, 0, 0.25, 1),
} as const;

/** 1 frame ≈ 33 ms at 30 fps: the stagger unit for related elements (25–40 ms). */
export const STAGGER = 1;

export const nf = new Intl.NumberFormat('en-US');
export const fmtNum = (n: number) => nf.format(Math.round(n));
export const fmtPct = (n: number, digits = 1) => `${n.toFixed(digits)}%`;
