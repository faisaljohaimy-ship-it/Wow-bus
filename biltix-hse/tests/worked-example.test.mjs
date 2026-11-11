/**
 * The worked example (v4): submittal MAR-S1-CW-014 → AIR-1069 → options → decision → tasks → closure, the 360° capture
 * point that carries the AIR-1069 marker, and the walkthrough's availability rule. Numbers must equal
 * scratchpad/v4/design/scenario.md at the demo clock (2026-11-10 09:00 Riyadh).
 */
import { assert, freshStore, instants, NOW } from './helpers.mjs';
import * as SP from '../js/data/spatial-seed.js';

const { walkthroughAvailable, WORKED_RISK } = await import('../js/ui/walkthrough.js').catch(() => ({}));
const day = (iso) => String(iso).slice(0, 10);
const risk = (st, id) => st.platform.aiRisks.find((r) => r.id === id);

export const tests = [
  {
    name: 'AIR-1069: 4 × 5 × 4 = 80 red, confidence 81 %, data quality Medium 95 from the DMS feed (VS14 + VQ15)',
    fn() {
      const st = freshStore();
      const r = risk(st, 'AR69');
      assert.equal(r.code, 'AIR-1069');
      assert.equal(r.likelihood * r.impact * 4, 80);
      assert.equal(r.score, 80);
      assert.equal(r.confidence, 0.81);
      assert.equal(r.dataQuality.score, 95);
      assert.equal(r.dataQuality.level, 'medium');
      assert.ok(r.dataQuality.issues.some((i) => i.ref === 'MAR-S1-MEP-021'), 'quarantined record listed');
      assert.equal(r.zoneId, 'S1-Z2');
      const w = r.drivers.reduce((s, d) => s + d.weight, 0);
      assert.ok(Math.abs(w - 1) < 1e-9, `driver weights sum to 100 % (${w})`);
      assert.equal(r.unknowns.length, 4);
      assert.ok(st.platform.alerts.some((a) => a.id === 'AL37' && a.riskId === 'AR69'));
      assert.notEqual(r.responseParams.Legal.disputeLikelihood, null, 'never null (renders 0 %)');
    },
  },
  {
    name: 'AIR-1069 evidence chain: 15 items from seven source systems, every `at` in the past',
    fn() {
      const st = freshStore();
      const r = risk(st, 'AR69');
      assert.equal(r.evidenceChain.length, 15);
      assert.equal(new Set(r.evidenceChain.map((e) => e.sourceSystem)).size, 7);
      for (const e of r.evidenceChain) if (e.at) assert.ok(Date.parse(e.at) <= NOW.getTime(), `${e.id} not in the future`);
      assert.deepEqual(new Set(r.evidenceChain.map((e) => e.role)), new Set(['cause', 'impact', 'context', 'contract', 'safety']));
    },
  },
  {
    name: 'options R1–R3: trade-offs, R3 requires R1, six task templates MT-0229…MT-0234, MT-0234 gates night lifts',
    fn() {
      const st = freshStore();
      const r = risk(st, 'AR69');
      assert.deepEqual(r.recommendationOptions.map((o) => o.id), ['R1', 'R2', 'R3']);
      const [r1, r2, r3] = r.recommendationOptions;
      assert.equal(r1.recoversDays, 12); assert.equal(r1.finishSlipDays, 16);
      assert.equal(r2.recoversDays, 0);
      assert.equal(r3.finishSlipDays, 4); assert.deepEqual(r3.requires, ['R1']);
      const keys = r.recommendationOptions.flatMap((o) => o.tasks.map((x) => x.key));
      assert.deepEqual(keys, ['MT-0229', 'MT-0230', 'MT-0231', 'MT-0232', 'MT-0233', 'MT-0234']);
      const gated = r.recommendationOptions.flatMap((o) => o.tasks).filter((x) => x.gate);
      assert.deepEqual(gated.map((x) => x.key), ['MT-0234']);
      for (const o of r.recommendationOptions) for (const k of ['title', 'action', 'cost', 'introduces', 'dependsOn']) assert.ok(o[k] && o[`${k}En`], `${o.id}.${k} bilingual`);
      const sc = Object.fromEntries(r.exposure.scenarios.map((x) => [x.key, x]));
      assert.equal(sc['no-action'].finishSlipDays, 28); assert.equal(sc['no-action'].sar, 24_900_000);
      assert.equal(sc['slot-lost'].finishSlipDays, 50); assert.equal(sc['r1-r3'].sar, 3_600_000);
      // nothing after the demo clock entered the live register: no MT29+ tasks seeded
      assert.ok(!st.platform.tasks.some((x) => /^MT-02(29|3[0-4])$/.test(x.code)), 'scenario tasks are templates, not records');
    },
  },
  {
    name: 'scenario block is a projection: calendar dates only (no instants), re-anchored with the store',
    fn() {
      const st = freshStore();
      const r = risk(st, 'AR69');
      assert.equal(r.scenario.projected, true);
      assert.equal(instants(r.scenario).length, 0, 'no instants in the projected scenario');
      assert.equal(r.scenario.decisionDate, '2026-11-10');
      assert.equal(r.scenario.decisionTime, '10:05');
      assert.deepEqual(r.scenario.accept, ['R1', 'R3']);
      assert.deepEqual(r.scenario.hedge, ['R2']);
      assert.equal(r.closureCriteria.length, 9);
      assert.ok(r.closureCriteria.every((c) => c.status === 'pending' && c.slot === null), 'evidence slots empty');
      const c = Object.fromEntries(r.closureCriteria.map((x) => [x.id, x]));
      assert.equal(c.C1.plannedAt, '2026-11-12'); assert.equal(c.C5.plannedAt, '2026-11-29');
      assert.equal(c.C6.plannedAt, '2026-12-06'); assert.equal(c.C7.plannedAt, '2027-03-02');
      assert.equal(r.monitors.length, 12);
      assert.equal(r.monitors.find((m) => m.key === 'notice-20-1').byDate, '2026-11-22');
      assert.equal(r.scenario.audit.find((a) => a.action === 'close').date, '2027-03-03');
    },
  },
  {
    name: 'submittal SB1 and the chain records: Rev 0 Code C, Rev 1 day 12 of 14, PO blocked, slot to 24 Nov, A1090 → A1095 → A1100 → M1150',
    fn() {
      const st = freshStore();
      const sb = st.platform.submittals.find((x) => x.id === 'SB1');
      assert.equal(sb.code, 'MAR-S1-CW-014');
      assert.equal(sb.revisions[0].code, 'C');
      assert.equal(day(sb.revisions[0].returnedAt), '2026-10-19');
      assert.equal(sb.revisions[1].code, null);
      assert.equal(day(sb.revisions[1].submittedAt), '2026-10-29');
      assert.equal(sb.revisions[1].dueAt, '2026-11-12');
      const today = Date.UTC(2026, 10, 10); const sub = Date.parse(`${day(sb.revisions[1].submittedAt)}T00:00:00Z`);
      assert.equal(Math.round((today - sub) / 86_400_000), 12, 'day 12 of the 14-day review period');
      const bq = st.platform.boqItems.find((x) => x.id === 'BQ2');
      assert.equal(bq.orderBy, '2026-10-27');
      assert.equal(bq.requiredBy, '2027-02-14');
      assert.equal(bq.procurement.slotHoldUntil, '2026-11-24');
      assert.equal(bq.procurement.blockedBy, 'SB1');
      assert.equal(st.platform.changeOrders.find((x) => x.id === 'CO3').blocksSubmittalId, 'SB1');
      const t = (id) => st.platform.scheduleTasks.find((x) => x.id === id);
      assert.deepEqual(t('T3').predecessors.map((p) => p.id), ['T34']);
      assert.deepEqual(t('T34').predecessors.map((p) => p.id), ['T33']);
      assert.deepEqual(t('T35').predecessors.map((p) => p.id), ['T3']);
      const ap1 = st.platform.approvals.find((x) => x.id === 'AP1');
      assert.equal(ap1.windowFrom, '2027-02-14');
    },
  },
  {
    name: '360° capture P360-S1-01: one real (AI-generated) capture + placeholder dates; AIR-1069 marker; deep-link param',
    fn() {
      const cp = SP.captureById('P360-S1-01');
      assert.ok(cp && cp.siteId === 'S1');
      assert.equal(cp.captures.filter((c) => c.src).length, 1);
      assert.ok(cp.captures.filter((c) => c.placeholder).every((c) => !c.src), 'placeholders carry no picture');
      assert.ok(cp.captures.find((c) => c.src).generated, 'the picture is labelled AI-generated');
      const hs = cp.hotspots.find((x) => x.ref === 'AR69');
      assert.ok(hs && hs.code === 'AIR-1069');
      for (const h of cp.hotspots) assert.ok(h.yaw >= -180 && h.yaw <= 180 && Math.abs(h.pitch) <= 76, `${h.id} inside the picture's coverage`);
      assert.deepEqual(SP.spatialParams({ site: 'S1', zone: 'S1-Z2', pano: 'P360-S1-01' }), { site: 'S1', zone: 'S1-Z2', camera: null, risk: null, pano: 'P360-S1-01' });
      assert.equal(SP.drawingFor('S1').number, 'S1-A-101');
      assert.deepEqual([...SP.PLAN_LAYERS], ['zones', 'cranes', 'cameras', 'qr', 'p360']);
    },
  },
  {
    name: 'walkthrough: available for the worked example only',
    fn() {
      const st = freshStore();
      assert.equal(typeof walkthroughAvailable, 'function');
      assert.equal(WORKED_RISK, 'AR69');
      assert.equal(walkthroughAvailable(st, 'AR69'), true);
      assert.equal(walkthroughAvailable(st, 'AIR-1069'), true);
      assert.equal(walkthroughAvailable(st, 'AR3'), false);
    },
  },
];
