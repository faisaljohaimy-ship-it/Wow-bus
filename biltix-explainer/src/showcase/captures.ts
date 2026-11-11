/**
 * The app captures (scripts/showcase-capture.mjs → public/showcase/manifest.json): files, sizes, and the
 * CSS-pixel rectangles of the elements the camera aims at. Scenes place a capture in world space at a scale
 * (world px per CSS px) and convert its rectangles with `worldRect`.
 */
import { staticFile } from 'remotion';
import MANIFEST from '../../public/showcase/manifest.json';
import type { Lang } from './timeline';

export type Rect = { x: number; y: number; w: number; h: number; t?: string };
export type Capture = {
  file: string;
  route: string;
  kind: string;
  cssW: number;
  cssH: number;
  dpr: number;
  w: number;
  h: number;
  h1: string | null;
  marks: Record<string, Rect[]>;
};
type Manifest = {
  captures: Record<Lang, Record<string, Capture>>;
  navTitles: Record<Lang, Record<string, string>>;
  sources: Record<Lang, string[]>;
  widthCheck?: { widths: number[]; checked: number; overflow: string[] };
};
const M = MANIFEST as unknown as Manifest;

/** Rail order of the 23 routes (biltix-hse/js/views/index.js navGroups). */
export const ROUTES = [
  'cockpit', 'airisks', 'tasks', 'alerts',
  'contracts', 'bom', 'schedule', 'cost', 'overview',
  'radar', 'spatial', 'risks', 'incidents', 'permits', 'inspections', 'training', 'compliance',
  'engine', 'dataquality', 'integrations', 'reports', 'roadmap', 'settings',
] as const;

export function cap(lang: Lang, name: string): Capture {
  const c = M.captures[lang]?.[name];
  if (!c) throw new Error(`capture ${lang}/${name} missing — run scripts/showcase-capture.mjs`);
  return c;
}
export const src = (c: Capture) => staticFile(`showcase/${c.file}`);
export const thumb = (lang: Lang, route: string) => staticFile(`showcase/${lang}/thumb/${route}.jpg`);
export const navTitle = (lang: Lang, route: string) => M.navTitles[lang]?.[route] ?? route;
export const sources = (lang: Lang) => M.sources[lang] ?? [];
export const widthCheck = () => M.widthCheck ?? null;

/** A mark of a capture, optionally the first whose text matches. */
export function mark(c: Capture, key: string, i = 0, match?: RegExp): Rect {
  const list = c.marks[key] || [];
  const r = match ? list.find((m) => match.test(m.t || '')) : list[i];
  if (!r) throw new Error(`mark ${key}${match ? ' ' + match : `[${i}]`} missing on ${c.file}`);
  return r;
}
export const marks = (c: Capture, key: string) => c.marks[key] || [];

/** Union of rectangles. */
export function union(...rs: Rect[]): Rect {
  const x = Math.min(...rs.map((r) => r.x));
  const y = Math.min(...rs.map((r) => r.y));
  const x2 = Math.max(...rs.map((r) => r.x + r.w));
  const y2 = Math.max(...rs.map((r) => r.y + r.h));
  return { x, y, w: x2 - x, h: y2 - y };
}
export const pad = (r: Rect, px: number, py = px): Rect => ({ x: r.x - px, y: r.y - py, w: r.w + 2 * px, h: r.h + 2 * py });

/** A capture placed at (x, y) in world px with `scale` world px per CSS px. */
export type Placed = { c: Capture; x: number; y: number; scale: number };
export const worldRect = (p: Placed, r: Rect): Rect => ({ x: p.x + r.x * p.scale, y: p.y + r.y * p.scale, w: r.w * p.scale, h: r.h * p.scale });
