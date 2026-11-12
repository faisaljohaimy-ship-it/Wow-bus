/**
 * What media exists for this render (src/film/media.json, written by scripts/film-media.mjs before every render):
 * AI b-roll clips, real UI screen recordings of the app, the app captures folder and the derived panorama.
 * Every scene that uses an optional clip checks it here and falls back gracefully.
 */
import { staticFile } from 'remotion';
import MANIFEST from '../../public/showcase/manifest.json';
import MEDIA from './media.json';
import type { Lang } from './timeline';

export type UiClip = { dur: number; w: number; h: number; fps: number };
type Media = { broll: Record<string, number>; ui: Record<string, UiClip>; captures: string; panorama: { w: number; h: number } | null };
const M = MEDIA as unknown as Media;

export type BrollName =
  | 'aerial'
  | 'engineer'
  | 'ops-room'
  | 'hardhat'
  | 'facade-lift'
  | 'cam360-floor'
  | 'offline-basement'
  | 'factory-line'
  | 'pm-approve'
  | 'facade-inspect'
  | 'qr-scan-keyed';

export const hasBroll = (n: BrollName) => n in M.broll;
export const brollFile = (n: BrollName) => (n === 'qr-scan-keyed' ? 'v2/film/qr-scan-keyed.mp4' : `v2/broll/${n}.mp4`);
/** The first clip of the list that exists (the last one is the guaranteed fallback). */
export const pickBroll = (...names: BrollName[]): BrollName => names.find(hasBroll) ?? names[names.length - 1];

export type UiName = 'ui-cockpit' | 'ui-register' | 'ui-treatment' | 'ui-tasks' | 'ui-schedule' | 'ui-spatial' | 'ui-integrations' | 'ui-phone';
export const uiClip = (n: UiName, lang: Lang): UiClip | null => M.ui[`${n}-${lang}`] ?? null;
export const uiFile = (n: UiName, lang: Lang) => staticFile(`v2/ui/${n}-${lang}.mp4`);

type Cap = { file: string; cssW: number; cssH: number; marks: Record<string, Array<{ x: number; y: number; w: number; h: number; t?: string }>> };
const CAPS = (MANIFEST as unknown as { captures: Record<Lang, Record<string, Cap>> }).captures;
/** An app capture (real screen of the platform, 1600 × 900 CSS px desktop or 390 × 844 phone). */
export const capture = (lang: Lang, name: string) => {
  const c = CAPS[lang]?.[name];
  if (!c) throw new Error(`capture ${lang}/${name} missing`);
  return { ...c, src: staticFile(`${M.captures}/${c.file}`) };
};

export const PANO = M.panorama ?? { w: 3168, h: 1344 };
