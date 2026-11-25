/** Radar trend helpers (js/ui/charts.js): dial angles, points, scale from zero, rim label thinning, paths, states. */
import assert from 'node:assert/strict';
import {
  radarAngles, radarPoint, radarAngleOf, radarIndexAt, radarScale, radarFractions, radarPaths, radarRimPicks, radarState,
} from '../js/ui/charts.js';

const close = (a, b, eps = 1e-9, msg = '') => assert.ok(Math.abs(a - b) <= eps, `${msg} expected ${b}, got ${a}`);
/** Label box of width w, height 10, centred on (x, y). */
const box = (x, y, w = 20) => ({ x0: x - w / 2, x1: x + w / 2, y0: y - 5, y1: y + 5 });
/** Boxes for n labels on a circle of radius r round (0, 0), clockwise from 12 o'clock (same convention as the chart). */
const ringBoxes = (n, r, w = 20) => radarAngles(n).map((deg) => { const p = radarPoint(0, 0, r, deg); return box(p.x, p.y, w); });

export const tests = [
  {
    name: 'radarAngles: one spoke per period, 0° (12 o\'clock) first, evenly spaced clockwise',
    fn() {
      assert.deepEqual(radarAngles(12), [0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330]);
      assert.deepEqual(radarAngles(4), [0, 90, 180, 270]);
      assert.deepEqual(radarAngles(1), [0]);
      const six = radarAngles(6);
      assert.equal(six.length, 6);
      six.forEach((d, i) => close(d, i * 60));
      assert.deepEqual(radarAngles(0), []);
      assert.deepEqual(radarAngles(-3), []);
      assert.deepEqual(radarAngles(null), []);
    },
  },
  {
    name: 'radarPoint: 12 o\'clock is straight up, 3 o\'clock is to the right (clockwise on screen, y down)',
    fn() {
      const top = radarPoint(100, 100, 50, 0);
      close(top.x, 100); close(top.y, 50);
      const right = radarPoint(100, 100, 50, 90);
      close(right.x, 150); close(right.y, 100);
      const bottom = radarPoint(100, 100, 50, 180);
      close(bottom.x, 100); close(bottom.y, 150);
      const left = radarPoint(100, 100, 50, 270);
      close(left.x, 50); close(left.y, 100);
      const centre = radarPoint(10, 20, 0, 123);
      close(centre.x, 10); close(centre.y, 20);
    },
  },
  {
    name: 'radarAngleOf / radarIndexAt: invert radarPoint and snap a pointer to the nearest spoke',
    fn() {
      for (const deg of [0, 15, 90, 179.5, 200, 359]) {
        const p = radarPoint(40, 60, 30, deg);
        close(radarAngleOf(40, 60, p.x, p.y), deg, 1e-9, `angle ${deg}`);
      }
      assert.equal(radarIndexAt(0, 12), 0);
      assert.equal(radarIndexAt(14.9, 12), 0);
      assert.equal(radarIndexAt(15.1, 12), 1);
      assert.equal(radarIndexAt(330, 12), 11, 'the latest week sits just before 12 o\'clock');
      assert.equal(radarIndexAt(350, 12), 0, 'past half a step before 12 snaps forward to the first week');
      assert.equal(radarIndexAt(-30, 12), 11, 'negative angles wrap');
      assert.equal(radarIndexAt(725, 12), 0, 'angles past a turn wrap');
      assert.equal(radarIndexAt(100, 1), 0);
      assert.equal(radarIndexAt(45, 0), -1);
    },
  },
  {
    name: 'radarScale: linear from zero, nice step, at most `count` rings, the outer ring covers the maximum',
    fn() {
      const open = radarScale([0, 2, 1, 4, 5, 9, 11, 12, 15, 23, 39, 58]);
      assert.deepEqual(open.ticks, [20, 40, 60]);
      assert.equal(open.max, 60);
      assert.equal(open.min, 0);
      assert.equal(open.decimals, 0);
      const score = radarScale([57, 57, 61, 64, 66, 69, 70, 73, 74, 77, 77, 79]);
      assert.deepEqual(score.ticks, [20, 40, 60, 80], 'the scale starts at zero even when every value is high');
      const pct = radarScale([100, 40]);
      assert.deepEqual(pct.ticks, [25, 50, 75, 100]);
      const small = radarScale([0.12, 0.37]);
      assert.deepEqual(small.ticks, [0.1, 0.2, 0.3, 0.4]);
      assert.equal(small.decimals, 1);
      const quarter = radarScale([0.9, 0.2], { count: 4 });
      assert.deepEqual(quarter.ticks, [0.25, 0.5, 0.75, 1]);
      assert.equal(quarter.decimals, 2);
      for (const values of [[1, 7], [3.3, 0.4], [999, 1], [12345]]) {
        const s = radarScale(values);
        assert.ok(s.max >= Math.max(...values), `max ${s.max} covers ${values}`);
        assert.ok(s.ticks.length >= 1 && s.ticks.length <= 4, `ring count ${s.ticks.length} for ${values}`);
        s.ticks.forEach((t, k) => close(t, (k + 1) * s.step, 1e-9, 'evenly spaced rings'));
      }
    },
  },
  {
    name: 'radarScale: counts never get fractional rings; zeros, negatives and gaps are honest',
    fn() {
      assert.deepEqual(radarScale([0, 1, 3, 2]).ticks, [1, 2, 3], 'incident counts: whole-number rings');
      assert.deepEqual(radarScale([1, 0, 1]).ticks, [1]);
      assert.deepEqual(radarScale([10, 3]).ticks, [5, 10], '2.5 is skipped for counts');
      assert.equal(radarScale([10, 3]).integer, true);
      const zeros = radarScale([0, 0, 0]);
      assert.equal(zeros.empty, false, 'known zeros are data, not an empty chart');
      assert.deepEqual(zeros.ticks, [1]);
      const neg = radarScale([-5, 4]);
      assert.equal(neg.min, 0, 'no negative radius');
      assert.ok(neg.max >= 4);
      const gaps = radarScale([null, undefined, NaN, 6, 'x']);
      assert.deepEqual(gaps.ticks, [2, 4, 6], 'unknown values are ignored by the scale');
    },
  },
  {
    name: 'radarScale / radarFractions / radarState: empty series',
    fn() {
      for (const values of [[], null, undefined, [null, NaN, Infinity]]) {
        const s = radarScale(values);
        assert.equal(s.empty, true, `empty for ${JSON.stringify(values)}`);
        assert.deepEqual(s.ticks, []);
      }
      assert.deepEqual(radarFractions([], 10), []);
      assert.deepEqual(radarFractions([5, null, 20, -3], 10), [0.5, null, 1, 0], 'clamped to the dial, unknown kept null');
      assert.deepEqual(radarFractions([4], 0), [1], 'a zero max never divides by zero');
      assert.equal(radarState([], 12), 'empty');
      assert.equal(radarState([{ values: [1, 2] }], 0), 'empty');
      assert.equal(radarState([{ values: [null, null] }], 2), 'empty');
      assert.equal(radarState([{ values: [] }, { values: [] }], 12), 'empty');
      assert.equal(radarState([{ values: [null, 3, null] }], 3), 'one', 'a single known period has no shape yet');
      assert.equal(radarState([{ values: [3] }, { values: [null, 4] }], 2), 'one');
      assert.equal(radarState([{ values: [0, 0] }], 2), 'shape', 'two known zeros are a (flat) shape');
      assert.equal(radarState([{ values: [1, 2, 3] }], 3), 'shape');
    },
  },
  {
    name: 'radarPaths: fill closes the known points, outline joins consecutive periods, seams are dashed joins',
    fn() {
      const pts = [{ x: 0, y: -10 }, { x: 10, y: 0 }, { x: 0, y: 10 }, { x: -10, y: 0 }];
      const full = radarPaths(pts);
      assert.equal(full.area, 'M0,-10 L10,0 L0,10 L-10,0 Z');
      assert.equal(full.line, 'M0,-10 L10,0 L0,10 L-10,0');
      assert.equal(full.seam, 'M-10,0 L0,-10', 'the closing edge latest → first is a seam, not a measured step');
      const gap = radarPaths([pts[0], null, pts[2], pts[3]]);
      assert.equal(gap.area, 'M0,-10 L0,10 L-10,0 Z');
      assert.equal(gap.line, 'M0,10 L-10,0', 'no solid line across the unknown period');
      assert.equal(gap.seam, 'M0,-10 L0,10 M-10,0 L0,-10');
      const two = radarPaths([pts[0], pts[1], null, null]);
      assert.equal(two.area, '', 'two points have no area');
      assert.equal(two.seam, '', 'and no closing edge (it would retrace the line)');
      assert.equal(two.line, 'M0,-10 L10,0');
      assert.deepEqual(radarPaths([null, pts[1], null]), { area: '', line: '', seam: '' });
      assert.deepEqual(radarPaths([]), { area: '', line: '', seam: '' });
    },
  },
  {
    name: 'radarRimPicks: every label when they fit, always the latest and the first',
    fn() {
      const r = radarRimPicks(ringBoxes(6, 200));
      assert.deepEqual(r.picks, [0, 1, 2, 3, 4, 5]);
      assert.equal(r.stride, 1);
      assert.equal(r.complete, true);
      const twelve = radarRimPicks(ringBoxes(12, 200), { minStride: 2 });
      assert.equal(twelve.stride, 2);
      assert.deepEqual(twelve.picks, [0, 3, 5, 7, 9, 11], 'counted back from the latest; the label crowding 12 o\'clock gives way');
    },
  },
  {
    name: 'radarRimPicks: thins evenly when labels collide, never overlaps, respects bounds',
    fn() {
      const boxes = ringBoxes(12, 60, 40);
      const r = radarRimPicks(boxes, { gap: 4 });
      const hit = (a, b) => a.x0 < b.x1 + 4 && b.x0 < a.x1 + 4 && a.y0 < b.y1 + 4 && b.y0 < a.y1 + 4;
      assert.ok(r.stride > 1, 'a small dial thins the labels');
      assert.ok(r.picks.includes(11), 'the latest is always kept');
      if (!r.picks.includes(0)) assert.ok(hit(boxes[0], boxes[11]), 'the first label only gives way to the latest');
      const roomy = ringBoxes(12, 80, 30);
      const r2 = radarRimPicks(roomy, { gap: 4 });
      assert.ok(r2.picks.includes(11) && r2.picks.includes(0), `latest and first kept when they fit: ${r2.picks}`);
      for (let a = 0; a < r.picks.length; a += 1) for (let b = a + 1; b < r.picks.length; b += 1) {
        assert.ok(!hit(boxes[r.picks[a]], boxes[r.picks[b]]), `labels ${r.picks[a]} and ${r.picks[b]} overlap`);
      }
      // Bounds: the 3 o'clock and 9 o'clock labels stick out of a narrow box → strides through them are rejected.
      const wide = ringBoxes(12, 100, 30);
      const narrow = radarRimPicks(wide, { bounds: { x0: -110, x1: 110, y0: -200, y1: 200 } });
      assert.ok(!narrow.picks.includes(3) && !narrow.picks.includes(9), `picks ${narrow.picks}`);
      narrow.picks.forEach((i) => assert.ok(wide[i].x0 >= -110 && wide[i].x1 <= 110));
      // Empty labels are skipped, not counted as collisions.
      const sparse = ringBoxes(4, 200).map((b, i) => (i === 1 ? null : b));
      assert.deepEqual(radarRimPicks(sparse).picks, [0, 2, 3]);
      assert.deepEqual(radarRimPicks([]).picks, []);
      // Nothing fits: report incomplete with whatever fits (here nothing).
      const tooBig = radarRimPicks(ringBoxes(3, 10, 400), { bounds: { x0: -50, x1: 50, y0: -50, y1: 50 } });
      assert.equal(tooBig.complete, false);
      assert.deepEqual(tooBig.picks, []);
    },
  },
];
