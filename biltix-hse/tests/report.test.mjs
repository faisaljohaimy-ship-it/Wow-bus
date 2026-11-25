/** One overdue definition across overview, KPIs, urgent actions and the report; describeDelta direction. */
import { assert, NOW, freshStore, sel, sources } from './helpers.mjs';

export const tests = [
  {
    name: 'describeDelta: direction follows the sign, good follows goodWhen',
    fn() {
      assert.deepEqual(sel.describeDelta(3, 'down'), { direction: 'up', good: false, neutral: false });
      assert.deepEqual(sel.describeDelta(-3, 'down'), { direction: 'down', good: true, neutral: false });
      assert.deepEqual(sel.describeDelta(0.88, 'down'), { direction: 'up', good: false, neutral: false });
      assert.deepEqual(sel.describeDelta(2, 'up'), { direction: 'up', good: true, neutral: false });
      assert.deepEqual(sel.describeDelta(-0.5, 'up'), { direction: 'down', good: false, neutral: false });
      assert.equal(sel.describeDelta(0).direction, 'flat');
      assert.equal(sel.describeDelta(NaN).direction, 'flat');
      assert.equal(sel.describeDelta(5, 'none').neutral, true);
    },
  },
  {
    name: 'overdue count is identical in kpis, sel.overdueRisks, urgent actions and every report field (all ranges, all sites)',
    fn() {
      const st = freshStore();
      for (const siteId of ['all', 'S1', 'S2', 'S5']) {
        for (const range of [7, 30, 90]) {
          const k = sel.kpis(st, { siteId, range }, NOW);
          const list = sel.overdueRisks(st, { siteId, range }, NOW);
          const urgent = sel.urgentActions(st, NOW, { siteId }).filter((u) => u.kind === 'risk').length;
          const rep = sources.buildReport(st, { siteId, range, now: NOW });
          const sec = rep.sections.find((s) => s.id === 'risks');
          assert.equal(k.overdueRisks, list.length, `${siteId}/${range} kpis`);
          assert.equal(urgent, list.length, `${siteId}/${range} urgent`);
          assert.equal(sec.overdueCount, list.length, `${siteId}/${range} section`);
          assert.equal(rep.overdueCount, list.length, `${siteId}/${range} report`);
          assert.ok(sec.overdue.length <= 6 && sec.overdue.length === Math.min(6, list.length));
        }
      }
    },
  },
  {
    name: 'the report narrative states the full overdue count (not the top-6 slice)',
    fn() {
      const st = freshStore();
      // make sure there are more than 6 overdue risks
      const past = '2026-10-01';
      st.risks.filter((r) => r.status !== 'مغلق').slice(0, 9).forEach((r) => { r.dueDate = past; });
      const n = sel.overdueRisks(st, {}, NOW).length;
      assert.ok(n > 6);
      const rep = sources.buildReport(st, { range: 30, now: NOW });
      const en = rep.sections.find((s) => s.id === 'risks').narrativeEn.join(' ');
      assert.ok(en.includes(`${n} risks are past the treatment due date`), en);
      const summary = rep.sections.find((s) => s.id === 'summary').narrativeEn.join(' ');
      assert.ok(summary.includes(`${n} risks past the treatment due date`), summary);
    },
  },
  {
    name: 'an increase is never described as a decrease (LTIFR/TRIR sentences, AR and EN)',
    fn() {
      const st = freshStore();
      for (const range of [7, 30, 90]) {
        const rep = sources.buildReport(st, { range, now: NOW });
        const d = rep.kpis.deltas;
        const ar = rep.sections.find((s) => s.id === 'kpis').narrative[0];
        const en = rep.sections.find((s) => s.id === 'kpis').narrativeEn[0];
        const expectAr = d.ltifr > 0 ? 'ارتفع مؤشر LTIFR' : d.ltifr < 0 ? 'انخفض مؤشر LTIFR' : 'استقر مؤشر LTIFR';
        const expectEn = d.ltifr > 0 ? 'LTIFR rose' : d.ltifr < 0 ? 'LTIFR fell' : 'LTIFR held';
        assert.ok(ar.startsWith(expectAr), `${range}: ${ar}`);
        assert.ok(en.startsWith(expectEn), `${range}: ${en}`);
        if (d.ltifr > 0) assert.ok(!/تحسّن مؤشر LTIFR|LTIFR fell/.test(ar + en));
      }
    },
  },
  {
    name: 'KPI items carry the delta direction and a good flag consistent with describeDelta',
    fn() {
      const st = freshStore();
      const rep = sources.buildReport(st, { range: 30, now: NOW });
      for (const item of rep.sections.find((s) => s.id === 'kpis').items) {
        const dd = sel.describeDelta(item.delta, item.id === 'activePermits' ? 'none' : item.deltaGoodWhen);
        assert.equal(item.direction, dd.direction, item.id);
        assert.equal(item.good, dd.good, item.id);
        assert.ok(item.labelEn, item.id);
      }
    },
  },
  {
    name: 'every report section has an English title and narrative',
    fn() {
      const st = freshStore();
      const rep = sources.buildReport(st, { range: 30, now: NOW });
      assert.ok(rep.titleEn && rep.subtitleEn);
      for (const s of rep.sections) {
        assert.ok(s.titleEn, s.id);
        assert.equal(s.narrativeEn.length, s.narrative.length, s.id);
        for (const line of s.narrativeEn) assert.ok(!/[؀-ۿ]/.test(line), `${s.id}: ${line}`);
      }
    },
  },
];
