/** Motion pass helpers (js/ui/motion.js): figure parsing for count-ups, FLIP deltas, stagger delays, gates in node. */
import assert from 'node:assert/strict';
import { parseFigure, besideMonth, flipDeltas, staggerDelays, stageTiming, intro, countIn, enabled } from '../js/ui/motion.js';

const renderAt = (text, v) => parseFigure(text).render(v);

export const tests = [
  {
    name: 'parseFigure: Latin integers, grouping, decimals and units keep their notation',
    fn() {
      const a = parseFigure('87');
      assert.equal(a.value, 87);
      assert.equal(a.decimals, 0);
      assert.equal(a.render(0), '0');
      assert.equal(a.render(43.6), '44');
      assert.equal(renderAt('212,148', 106074), '106,074');
      assert.equal(renderAt('212,148', 0), '0');
      const p = parseFigure('97.7%');
      assert.equal(p.value, 97.7);
      assert.equal(p.decimals, 1);
      assert.equal(p.render(0), '0.0%');
      assert.equal(p.render(48.85), '48.9%');
      assert.equal(renderAt('SAR 1,250', 625), 'SAR 625');
      assert.equal(renderAt('1.2M', 0.6), '0.6M');
      assert.equal(renderAt('+5', 3), '+3');
    },
  },
  {
    name: 'parseFigure: Arabic-Indic and Persian digits, Arabic separators and bidi marks survive',
    fn() {
      const a = parseFigure('٤٥٪');
      assert.equal(a.value, 45);
      assert.equal(a.digits, 'arab');
      assert.equal(a.render(12), '١٢٪');
      assert.equal(a.render(45), '٤٥٪');
      assert.equal(renderAt('٣٬٤٥٠', 1725), '١٬٧٢٥');
      assert.equal(renderAt('٩٫٥', 4.75), '٤٫٨');
      assert.equal(parseFigure('۱۲').digits, 'persian');
      assert.equal(renderAt('۱۲', 6), '۶');
      const marked = '‏٤٥‏٪';
      assert.equal(renderAt(marked, 7), '‏٧‏٪');
    },
  },
  {
    name: 'parseFigure: codes, dates, times, ranges, two figures and empty values are not counted',
    fn() {
      for (const s of ['—', '', null, undefined, 'R-12', 'SEC-01', 'v3', '#4', 'x12', '2026-11-10', '3/12', '09:30', '12–15', '12 of 30', 'rated 2 of 5']) {
        assert.equal(parseFigure(s), null, `expected no figure in ${JSON.stringify(s)}`);
      }
      // A zero is a figure, but the count-up skips it (nothing to count).
      assert.equal(parseFigure('0').value, 0);
    },
  },
  {
    name: 'parseFigure: a day of the month (a month name beside the figure) is a date, not a quantity',
    fn() {
      // fmt.date(…, { style: 'short' }) in both languages and digit sets, other date orders, Hijri and Levantine months.
      const dates = [
        '15 Oct', '15 October', 'Oct 15', 'Oct. 15', '1 Sept', '3 May', '\u200e15\u200e Oct', '15\u00a0Dec',
        '15 أكتوبر', '١٥ أكتوبر', '\u200f١٥ اكتوبر\u200f', '9 نوفمبر', '٢ مايو', '7 إبريل', '1 يونيه', '12 آب', '3 تشرين',
        '30 جمادى', '٣٠ جمادى', '12 رمضان', '5 ذو القعدة', '4 ذي الحجة', '30 Jumada', '1 Rabiʻ', '12 Ramadan', '2 Dhuʻl-Hijjah',
        'Tue, 15 Oct', 'الثلاثاء، ١٥ أكتوبر',
      ];
      for (const s of dates) assert.equal(parseFigure(s), null, `expected no figure in ${JSON.stringify(s)}`);
      // Units, currencies and words that only start like a month are still quantities.
      for (const s of ['12 days', '12 Market', '3 Mayors', '5 decisions', 'SAR 7.3bn', '‏7.3 مليار ر.س.‏', '٤ أيام', '12 مارسوا', '٨ أبنية']) {
        assert.ok(parseFigure(s), `expected a figure in ${JSON.stringify(s)}`);
      }
      assert.equal(besideMonth('', ' Oct'), true);
      assert.equal(besideMonth('Oct ', ''), true);
      assert.equal(besideMonth('', ' أكتوبر'), true);
      assert.equal(besideMonth('', '%'), false);
      assert.equal(besideMonth('SAR ', ''), false);
    },
  },
  {
    name: 'parseFigure: the final render equals the source text exactly',
    fn() {
      for (const s of ['58', '23', '1,318', '97.6%', '٤٥٪', '٣٬٤٥٠', '٩٫٥', 'SAR 1,250', '‎12‎ %']) {
        const f = parseFigure(s);
        assert.ok(f, s);
        assert.equal(f.render(f.value), s, s);
      }
    },
  },
  {
    name: 'flipDeltas: old minus new position, only for keys in both, ignoring sub-pixel jitter',
    fn() {
      const before = { a: { left: 0, top: 0 }, b: { left: 10, top: 100 }, c: { left: 5, top: 5 }, gone: { left: 0, top: 0 } };
      const after = new Map([['a', { left: 0, top: 0.6 }], ['b', { left: 10, top: 340.25 }], ['c', { left: 298, top: 5 }], ['new', { left: 1, top: 1 }]]);
      const d = flipDeltas(before, after);
      assert.deepEqual([...d.keys()].sort(), ['b', 'c']);
      assert.deepEqual(d.get('b'), { dx: 0, dy: -240.25 });
      assert.deepEqual(d.get('c'), { dx: -293, dy: 0 });
      assert.equal(flipDeltas(before, after, { min: 300 }).size, 0);
      // x / y aliases (DOMRect-like) work too
      assert.deepEqual(flipDeltas({ k: { x: 4, y: 4 } }, { k: { x: 0, y: 0 } }).get('k'), { dx: 4, dy: 4 });
    },
  },
  {
    name: 'staggerDelays: fixed step, capped, with a start offset',
    fn() {
      assert.deepEqual(staggerDelays(5, 0.05, 3), [0, 0.05, 0.1, 0.15, 0.15]);
      assert.deepEqual(staggerDelays(3, 0.028, Infinity, 0.1), [0.1, 0.128, 0.156]);
      assert.deepEqual(staggerDelays(0, 0.05), []);
      const rows = staggerDelays(stageTiming.rowCap, stageTiming.rowStagger);
      assert.ok(rows[rows.length - 1] + stageTiming.rows <= 0.7, 'twelve rows finish within 0.7 s');
      const reveal = staggerDelays(20, stageTiming.revealStagger, stageTiming.revealCap);
      assert.ok(reveal[19] + stageTiming.reveal <= 0.8, 'a batch of cards finishes within 0.8 s');
    },
  },
  {
    name: 'gates without a browser: no motion, no intro, count-up resolves at once',
    async fn() {
      assert.equal(enabled(), false);
      assert.equal(intro({}, { hold() { throw new Error('must not hold'); } }), null);
      await countIn(null);
    },
  },
];
