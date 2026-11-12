/** Ring gauge helpers (js/ui/charts.js): honest ratios, radial bar geometry, trend summary, sweep keyframes. */
import assert from 'node:assert/strict';
import { gaugeRatio, gaugeBars, trendSummary, halfAngles, ringKeyframes, gaugeEase } from '../js/ui/charts.js';

const close = (a, b, eps = 1e-6, msg = '') => assert.ok(Math.abs(a - b) <= eps, `${msg} expected ${b}, got ${a}`);
const deg = (transform) => Number(/rotate\((-?[\d.]+)deg\)/.exec(transform)[1]);

export const tests = [
  {
    name: 'gaugeRatio: part of whole, clamped to 0..1, percentage rounded like psel',
    fn() {
      assert.deepEqual(gaugeRatio(3, 28), { value: 3 / 28, part: 3, whole: 28, pct: 11 });
      assert.equal(gaugeRatio(23, 58).pct, 40);
      assert.equal(gaugeRatio(0, 12).value, 0);
      assert.equal(gaugeRatio(0, 12).pct, 0);
      assert.equal(gaugeRatio(12, 12).value, 1);
      // a part larger than the whole (inconsistent inputs) never draws more than a full ring
      assert.equal(gaugeRatio(15, 12).value, 1);
      assert.equal(gaugeRatio(15, 12).part, 12);
      assert.equal(gaugeRatio(-2, 12).value, 0);
      assert.equal(gaugeRatio('5', '10').value, 0.5, 'numeric strings are accepted');
    },
  },
  {
    name: 'gaugeRatio: zero, negative or unknown totals give the empty state (null), never a fake 0 % or 100 %',
    fn() {
      for (const [p, w] of [[0, 0], [3, 0], [3, -1], [3, null], [3, undefined], [null, 10], [NaN, 10], [3, Infinity], ['', 10], [3, '']]) {
        const r = gaugeRatio(p, w);
        assert.equal(r.value, null, `gaugeRatio(${p}, ${w})`);
        assert.equal(r.pct, null, `gaugeRatio(${p}, ${w}).pct`);
      }
      assert.equal(gaugeRatio(0, 0).whole, 0, 'the known (zero) whole is still reported for the caption');
    },
  },
  {
    name: 'gaugeBars: one slot per week, clockwise from 12 o\'clock, the last one is the current week',
    fn() {
      const { bars, max, empty } = gaugeBars([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
      assert.equal(bars.length, 12);
      assert.equal(empty, false);
      assert.equal(max, 12, 'without a fixed scale the highest week is the full length');
      assert.equal(bars[0].angle, 15);
      assert.equal(bars[11].angle, 345);
      for (let i = 1; i < 12; i += 1) close(bars[i].angle - bars[i - 1].angle, 30, 1e-9, 'even spacing');
      assert.deepEqual(bars.map((b) => b.current), [...Array(11).fill(false), true]);
      close(bars[5].fraction, 6 / 12);
      assert.equal(bars[11].fraction, 1);
    },
  },
  {
    name: 'gaugeBars: lengths are proportional from zero, a fixed scale clamps, unknown weeks keep an empty slot',
    fn() {
      const fixed = gaugeBars([50, 120, -10, 0], { max: 100 });
      assert.equal(fixed.max, 100);
      assert.deepEqual(fixed.bars.map((b) => b.fraction), [0.5, 1, 0, 0]);
      const gaps = gaugeBars([4, null, 'x', 2]);
      assert.equal(gaps.bars[1].value, null);
      assert.equal(gaps.bars[1].fraction, 0);
      assert.equal(gaps.bars[2].value, null);
      assert.equal(gaps.bars[3].fraction, 0.5);
      // a scale of zero (every week zero) draws no bars instead of dividing by zero
      const zeros = gaugeBars([0, 0, 0]);
      assert.equal(zeros.empty, false);
      assert.deepEqual(zeros.bars.map((b) => b.fraction), [0, 0, 0]);
      for (const v of [[], null, undefined, 'abc']) {
        const g = gaugeBars(v);
        assert.equal(g.bars.length, 0);
        assert.equal(g.empty, true);
      }
      assert.equal(gaugeBars([null, null]).empty, true, 'all unknown is empty');
      assert.equal(gaugeBars([3], { max: 0 }).max, 3, 'a non-positive fixed scale falls back to the series max');
    },
  },
  {
    name: 'trendSummary: first and last known week and the direction; null below two known points',
    fn() {
      assert.deepEqual(trendSummary([4, 5, 3]), { first: 4, last: 3, change: -1, direction: 'down', points: 3 });
      assert.equal(trendSummary([null, 2, 9, null]).direction, 'up');
      assert.equal(trendSummary([null, 2, 9, null]).first, 2);
      assert.equal(trendSummary([7, 1, 7]).direction, 'flat');
      assert.equal(trendSummary([5]), null);
      assert.equal(trendSummary([]), null);
      assert.equal(trendSummary(null), null);
    },
  },
  {
    name: 'halfAngles: the first half-ring fills 0-180, the second 180-360, clamped',
    fn() {
      assert.deepEqual(halfAngles(0), { a: 0, b: 0 });
      assert.deepEqual(halfAngles(90), { a: 90, b: 0 });
      assert.deepEqual(halfAngles(180), { a: 180, b: 0 });
      assert.deepEqual(halfAngles(270), { a: 180, b: 90 });
      assert.deepEqual(halfAngles(400), { a: 180, b: 180 });
      assert.deepEqual(halfAngles(-5), { a: 0, b: 0 });
    },
  },
  {
    name: 'gaugeEase is the motion token ease-out: 0 at 0, 1 at 1, monotonic, fast start',
    fn() {
      assert.equal(gaugeEase(0), 0);
      assert.equal(gaugeEase(1), 1);
      let prev = 0;
      for (let i = 1; i <= 100; i += 1) { const v = gaugeEase(i / 100); assert.ok(v >= prev - 1e-9, `monotonic at ${i}`); prev = v; }
      assert.ok(gaugeEase(0.25) > 0.6, 'most of the sweep happens early (ease-out)');
    },
  },
  {
    name: 'ringKeyframes: exact endpoints, ordered offsets, an exact keyframe at the 180 degree seam, halves in step with the cap',
    fn() {
      const kf = ringKeyframes(0, 288);   // 80 %
      const offs = kf.cap.map((k) => k.offset);
      assert.equal(offs[0], 0);
      assert.equal(offs[offs.length - 1], 1);
      for (let i = 1; i < offs.length; i += 1) assert.ok(offs[i] >= offs[i - 1], 'non-decreasing offsets');
      assert.equal(deg(kf.cap[0].transform), 0);
      assert.equal(deg(kf.cap[kf.cap.length - 1].transform), 288);
      assert.equal(deg(kf.a[kf.a.length - 1].transform), 45 + 180);
      assert.equal(deg(kf.b[kf.b.length - 1].transform), 45 + 108);
      const seam = kf.frames.find((f) => f.deg === 180);
      assert.ok(seam, 'a keyframe sits exactly on 180 degrees');
      assert.equal(seam.a, 180);
      assert.equal(seam.b, 0);
      close(gaugeEase(seam.offset), 180 / 288, 1e-6, 'the seam keyframe is where the eased sweep reaches 180');
      // between keyframes the layers interpolate linearly: no segment may straddle the seam
      for (let i = 1; i < kf.frames.length; i += 1) {
        const a = kf.frames[i - 1].deg; const b = kf.frames[i].deg;
        assert.ok(!(a < 180 && b > 180), `segment ${i} straddles 180`);
        assert.equal(kf.frames[i].a + kf.frames[i].b, kf.frames[i].deg, 'halves add up to the cap angle');
      }
    },
  },
  {
    name: 'ringKeyframes: updates downward, no seam when both ends are on one side, inputs clamped',
    fn() {
      const down = ringKeyframes(331, 306);   // 92 % to 85 %: both in the second half
      assert.equal(down.frames.some((f) => f.deg === 180 && f.offset > 0 && f.offset < 1), false);
      assert.equal(deg(down.cap[0].transform), 331);
      assert.equal(deg(down.cap[down.cap.length - 1].transform), 306);
      assert.ok(down.a.every((k) => deg(k.transform) === 225), 'the first half stays full');
      const cross = ringKeyframes(300, 36);   // crossing downward
      assert.ok(cross.frames.some((f) => f.deg === 180 && f.offset > 0 && f.offset < 1));
      const wild = ringKeyframes(-40, 900);
      assert.equal(deg(wild.cap[0].transform), 0);
      assert.equal(deg(wild.cap[wild.cap.length - 1].transform), 360);
      const same = ringKeyframes(90, 90);
      assert.ok(same.cap.every((k) => deg(k.transform) === 90));
    },
  },
];
