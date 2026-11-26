/** psel.metrics — open / critical / overdue mitigations / completion, recomputed independently from raw data. */
import { assert, NOW, freshStore, psel, store } from './helpers.mjs';

const OPEN = (r) => r.status !== 'مغلق' && r.status !== 'مُتجاوز';
const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
const dateMs = (iso) => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || ''); return m ? new Date(+m[1], +m[2] - 1, +m[3]).getTime() : Date.parse(iso); };

export const tests = [
  {
    name: 'open and critical risks match a direct count over the seed (all projects)',
    fn() {
      const st = freshStore();
      const m = psel.metrics(st, { siteId: 'all', range: 30 }, NOW);
      const open = st.platform.aiRisks.filter(OPEN);
      assert.equal(m.openRisks, open.length);
      assert.equal(m.criticalRisks, open.filter((r) => r.likelihood * r.impact * 4 >= 70).length);
      assert.ok(m.openRisks > 0 && m.criticalRisks > 0 && m.criticalRisks < m.openRisks);
    },
  },
  {
    name: 'overdue mitigations = open tasks past their due date (or flagged متأخرة); completion = closed / total',
    fn() {
      const st = freshStore();
      const m = psel.metrics(st, { siteId: 'all', range: 30 }, NOW);
      const tasks = st.platform.tasks;
      const today = startOfDay(NOW);
      const overdue = tasks.filter((t) => t.status !== 'مغلقة' && (t.status === 'متأخرة' || dateMs(t.dueDate) < today));
      const closed = tasks.filter((t) => t.status === 'مغلقة').length;
      assert.equal(m.overdueMitigations, overdue.length);
      assert.equal(m.mitigationCompletion.total, tasks.length);
      assert.equal(m.mitigationCompletion.closed, closed);
      assert.equal(m.mitigationCompletion.pct, Math.round((closed / tasks.length) * 100));
    },
  },
  {
    name: 'project filter narrows every metric consistently with the register rows',
    fn() {
      const st = freshStore();
      for (const siteId of ['S1', 'S3', 'S5']) {
        const f = { siteId, range: 30 };
        const m = psel.metrics(st, f, NOW);
        const rows = psel.registerRows(st, f, { now: NOW }).filter((r) => OPEN(r.risk));
        assert.equal(m.openRisks, rows.length, siteId);
        assert.equal(m.criticalRisks, rows.filter((r) => r.rating === 'red').length, siteId);
        assert.ok(rows.every((r) => r.projectId === siteId));
      }
    },
  },
  {
    name: 'a domain filter changes metrics, heatmap and register together (one filtered list)',
    fn() {
      const st = freshStore();
      const f = { siteId: 'all', range: 30, category: 'contract' };
      const m = psel.metrics(st, f, NOW);
      const hm = psel.heatmapLI(st, f);
      const rows = psel.registerRows(st, f, { now: NOW }).filter((r) => OPEN(r.risk));
      assert.equal(m.openRisks, rows.length);
      assert.equal(hm.total, rows.length);
      assert.ok(rows.every((r) => r.category === 'contract'));
    },
  },
  {
    name: 'deltas are current minus previous and the good direction is declared',
    fn() {
      const st = freshStore();
      const m = psel.metrics(st, { siteId: 'all', range: 30 }, NOW);
      assert.equal(m.deltas.openRisks, m.openRisks - m.previous.openRisks);
      assert.equal(m.deltas.criticalRisks, m.criticalRisks - m.previous.criticalRisks);
      assert.equal(m.deltas.mitigationCompletion, m.mitigationCompletion.pct - m.previous.mitigationCompletion.pct);
      assert.deepEqual(m.goodWhen, { openRisks: 'down', criticalRisks: 'down', overdueMitigations: 'down', mitigationCompletion: 'up' });
    },
  },
  {
    name: 'closing a mitigation task raises completion by one closed task',
    fn() {
      const st = freshStore();
      const before = psel.metrics(st, { range: 30 }, NOW);
      const open = st.platform.tasks.find((t) => t.status === 'قيد التنفيذ');
      assert.ok(store.updateTask(open.id, { status: 'مغلقة', outcome: 'Treatment verified on site' }));
      const after = psel.metrics(st, { range: 30 }, NOW);
      assert.equal(after.mitigationCompletion.closed, before.mitigationCompletion.closed + 1);
      assert.equal(after.mitigationCompletion.total, before.mitigationCompletion.total);
    },
  },
  {
    name: 'trend: 12 weekly points, last point equals the current open count',
    fn() {
      const st = freshStore();
      const tr = psel.trend(st, { range: 30 }, 12, NOW);
      assert.equal(tr.labels.length, 12);
      assert.equal(tr.openRisks.length, 12);
      assert.equal(tr.score.length, 12);
      assert.equal(tr.openRisks[11], psel.metrics(st, { range: 30 }, NOW).openRisks);
      assert.equal(tr.score[11], psel.consolidatedScore(st, { range: 30 }, NOW).score);
    },
  },
];
