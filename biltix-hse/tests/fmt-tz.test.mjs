/** fmt time-zone policy: instants read in Asia/Riyadh; calendar days never shift, whatever the host zone. */
import { assert } from './helpers.mjs';

const { fmt } = await import('../js/core/fmt.js');

const ZONES = ['UTC', 'Pacific/Kiritimati', 'America/Los_Angeles', 'Asia/Riyadh'];
const INSTANT = '2026-11-10T21:30:00Z'; // Wednesday 11 Nov 2026, 00:30 in Riyadh

/** Expected strings built from UTC calendar fields, so they do not depend on the host zone. */
const expectDay = (y, m, d) => new Intl.DateTimeFormat(fmt.locale(), { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(Date.UTC(y, m, d));
const expectWeekday = (y, m, d) => new Intl.DateTimeFormat(fmt.locale(), { weekday: 'long', timeZone: 'UTC' }).format(Date.UTC(y, m, d));

function inZone(tz, fn) {
  const prev = process.env.TZ;
  process.env.TZ = tz;
  try { return fn(); } finally { if (prev === undefined) delete process.env.TZ; else process.env.TZ = prev; }
}

export const tests = [
  {
    name: 'instants are shown in Riyadh time from any host time zone',
    fn() {
      for (const tz of ZONES) {
        inZone(tz, () => {
          assert.equal(fmt.time(INSTANT), '00:30', tz);
          assert.equal(fmt.date(INSTANT), expectDay(2026, 10, 11), tz);
          assert.ok(fmt.dateTime(INSTANT).startsWith(expectDay(2026, 10, 11)) && fmt.dateTime(INSTANT).endsWith('00:30'), tz);
          assert.equal(fmt.dayName(INSTANT), expectWeekday(2026, 10, 11), tz);
        });
      }
    },
  },
  {
    name: 'calendar days (date-only strings, local-midnight Dates) keep their day in any host time zone',
    fn() {
      for (const tz of ZONES) {
        inZone(tz, () => {
          assert.equal(fmt.date('2026-11-10'), expectDay(2026, 10, 10), tz);
          assert.equal(fmt.date(new Date(2026, 10, 10)), expectDay(2026, 10, 10), tz);
          assert.equal(fmt.dayName('2026-11-10'), expectWeekday(2026, 10, 10), tz);
          assert.equal(fmt.time('7:05'), '07:05', tz);
        });
      }
    },
  },
];
