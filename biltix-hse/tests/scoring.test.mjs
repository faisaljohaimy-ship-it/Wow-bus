/** Severity = likelihood × impact × 4, heatmap counts, lifecycle and next action. */
import { assert, NOW, freshStore, psel, store, platformSeed, seedExports, storeExports } from './helpers.mjs';

export const tests = [
  {
    name: 'every seed AI risk: likelihood/impact are integers 1–5 and score = L × I × 4 exactly',
    fn() {
      for (const r of platformSeed.aiRisks) {
        assert.ok(Number.isInteger(r.likelihood) && r.likelihood >= 1 && r.likelihood <= 5, r.id);
        assert.ok(Number.isInteger(r.impact) && r.impact >= 1 && r.impact <= 5, r.id);
        assert.equal(r.score, r.likelihood * r.impact * 4, r.id);
      }
    },
  },
  {
    name: 'residual (when assessed) is a valid pair, not above the inherent score; others are null',
    fn() {
      for (const r of platformSeed.aiRisks) {
        if (r.residualLikelihood == null) {
          assert.equal(r.residualImpact, null, r.id);
          continue;
        }
        assert.ok(['قيد المعالجة', 'مغلق'].includes(r.status), `${r.id} residual only in treatment/closed`);
        assert.ok(r.residualLikelihood * r.residualImpact * 4 <= r.score, r.id);
        assert.ok(r.residualAssessment && r.residualAssessment.justification && r.residualAssessment.justificationEn, r.id);
      }
      const closed = platformSeed.aiRisks.filter((r) => r.status === 'مغلق');
      assert.ok(closed.length > 0 && closed.every((r) => r.residualLikelihood != null), 'every closed seed risk carries a residual assessment');
    },
  },
  {
    name: 'data quality is derived from the source system validation (level high|medium|low, bilingual issues)',
    fn() {
      for (const r of platformSeed.aiRisks) {
        assert.ok(['high', 'medium', 'low'].includes(r.dataQuality.level), r.id);
        for (const issue of r.dataQuality.issues) assert.ok(issue.text && issue.textEn, r.id);
      }
      const dq = seedExports.deriveDataQuality(platformSeed.validation, 'Autodesk APS', 'boq');
      assert.equal(dq.sourceId, 'VS8');
      assert.equal(dq.score, Math.round((dq.checks.validityPct + dq.checks.completenessPct + dq.checks.consistencyPct) / 3 - 1.5 * dq.checks.quarantineOpen));
    },
  },
  {
    name: 'the store keeps the invariant: a legacy score-only record gets the closest rating-preserving pair',
    fn() {
      assert.deepEqual(storeExports.liFromScore(88), [5, 5]);
      for (const s of [12, 30, 45, 58, 66, 74, 91]) {
        const [l, i] = storeExports.liFromScore(s);
        const v = l * i * 4;
        const band = (x) => (x >= 70 ? 2 : x >= 40 ? 1 : 0);
        assert.equal(band(v), band(s), `score ${s} → ${l}×${i}`);
      }
      const st = freshStore();
      const r = st.platform.aiRisks[0];
      store.updateAiRisk(r.id, { score: 3 }); // a bare score patch is ignored
      assert.equal(r.score, r.likelihood * r.impact * 4);
      store.updateAiRisk(r.id, { likelihood: 2, impact: 3 });
      assert.equal(r.score, 24);
    },
  },
  {
    name: 'heatmap counts sum to the open risks (inherent); residual view = assessed + not assessed',
    fn() {
      const st = freshStore();
      const f = { siteId: 'all', range: 30 };
      const open = psel.openAiRisks(st, f, NOW);
      const hm = psel.heatmapLI(st, f);
      const sum = hm.flat().reduce((a, b) => a + b, 0);
      assert.equal(sum, open.length);
      assert.equal(hm.total, open.length);
      assert.equal(hm.length, 5);
      assert.ok(hm.every((row) => row.length === 5));
      for (const r of open) assert.ok(hm.ids[r.impact - 1][r.likelihood - 1].includes(r.id));
      const res = psel.heatmapLI(st, f, { residual: true });
      const rsum = res.flat().reduce((a, b) => a + b, 0);
      assert.equal(rsum + res.notAssessed, open.length);
      assert.equal(rsum, open.filter((r) => r.residualLikelihood != null).length);
    },
  },
  {
    name: 'a heatmap cell opens exactly its records through the register filters (l / i)',
    fn() {
      const st = freshStore();
      const hm = psel.heatmapLI(st, { range: 30 });
      for (let i = 0; i < 5; i += 1) {
        for (let l = 0; l < 5; l += 1) {
          const rows = psel.registerRows(st, { range: 30, l: l + 1, i: i + 1 }, { now: NOW }).filter((x) => psel.isOpenRisk(x.risk));
          assert.equal(rows.length, hm[i][l], `cell L${l + 1} I${i + 1}`);
        }
      }
    },
  },
  {
    name: 'lifecycle: 12 stages in contract order; an open risk has exactly one current stage',
    fn() {
      const st = freshStore();
      for (const r of st.platform.aiRisks) {
        const lc = psel.lifecycle(r, st);
        assert.deepEqual(lc.map((s) => s.key), ['source', 'validation', 'identification', 'analysis', 'evaluation', 'recommendation', 'review', 'assignment', 'escalation', 'evidence', 'residual', 'closure']);
        const current = lc.filter((s) => s.state === 'current').length;
        if (psel.isOpenRisk(r)) assert.equal(current, 1, r.id);
        else { assert.equal(current, 0, r.id); assert.equal(lc[11].state, 'done', r.id); }
      }
    },
  },
  {
    name: 'nextAction: review for untreated, close for assessed, none for closed',
    fn() {
      const st = freshStore();
      const untreated = st.platform.aiRisks.find((r) => r.status === 'مكتشف' && r.score < 85 && !r.taskId);
      assert.equal(psel.nextAction(untreated, st, NOW).key, 'review');
      const closed = st.platform.aiRisks.find((r) => r.status === 'مغلق');
      assert.equal(psel.nextAction(closed, st, NOW).key, 'none');
      const assessed = st.platform.aiRisks.find((r) => r.status === 'قيد المعالجة' && r.residualLikelihood && r.treatment.evidence.length);
      assert.equal(psel.nextAction(assessed, st, NOW).key, 'close');
    },
  },
  {
    name: 'inherent vs residual only lists assessed risks and never increases',
    fn() {
      const st = freshStore();
      const items = psel.inherentVsResidual(st, { range: 90 }, NOW);
      assert.ok(items.length > 0);
      for (const it of items) { assert.ok(it.to <= it.from, it.code); assert.equal(it.reduction, it.from - it.to); }
    },
  },
];
