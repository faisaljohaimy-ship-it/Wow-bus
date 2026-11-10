/** Small geometry helpers for hand-built charts (exact, data-driven). */

export type Pt = { x: number; y: number };

export function cubic(p0: Pt, p1: Pt, p2: Pt, p3: Pt, t: number): Pt {
  const u = 1 - t;
  return {
    x: u * u * u * p0.x + 3 * u * u * t * p1.x + 3 * u * t * t * p2.x + t * t * t * p3.x,
    y: u * u * u * p0.y + 3 * u * u * t * p1.y + 3 * u * t * t * p2.y + t * t * t * p3.y,
  };
}

export function cubicLength(p0: Pt, p1: Pt, p2: Pt, p3: Pt, steps = 32): number {
  let len = 0;
  let prev = p0;
  for (let i = 1; i <= steps; i += 1) {
    const p = cubic(p0, p1, p2, p3, i / steps);
    len += Math.hypot(p.x - prev.x, p.y - prev.y);
    prev = p;
  }
  return len;
}

/** Point on a circle; angle in degrees, clockwise from +x (SVG y-down). */
export function polar(cx: number, cy: number, r: number, deg: number): Pt {
  const a = (deg * Math.PI) / 180;
  return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
}

/** SVG arc path from a0 to a1 (degrees, clockwise when a1 > a0). */
export function arcPath(cx: number, cy: number, r: number, a0: number, a1: number): string {
  const s = polar(cx, cy, r, a0);
  const e = polar(cx, cy, r, a1);
  const sweep = a1 >= a0 ? 1 : 0;
  const large = Math.abs(a1 - a0) > 180 ? 1 : 0;
  return `M ${s.x.toFixed(2)} ${s.y.toFixed(2)} A ${r} ${r} 0 ${large} ${sweep} ${e.x.toFixed(2)} ${e.y.toFixed(2)}`;
}

/** True when a string has no Arabic letters (so it must be isolated LTR inside RTL text). */
export const isLatin = (s: string) => !/[؀-ۿ]/.test(s);
