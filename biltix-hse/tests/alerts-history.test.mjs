/**
 * Alert honesty, register edit history and arrow-free audit wording (store.js).
 *
 *   • `simulated` is decided at the source: an engine-scenario risk (platform-live) raises simulated: true alerts;
 *     a risk a person registers or escalates raises simulated: false ones, and so does the localStorage-quota
 *     warning (a real browser condition, with English titleEn/detailEn).
 *   • store.updateRisk records a register edit as history kind 'edit' with English textEn; entries saved by older
 *     versions (the Arabic sentence, also as textEn) are upgraded when a saved state is restored.
 *   • Audit / history / feed sentences say "from X to Y" (AR "من X إلى Y") instead of arrows the bundled fonts lack.
 */
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { assert, freshStore, store, storeExports, bus, NOW, ARABIC } from './helpers.mjs';

const { buildPersistPayload, buildFreshState, restoreSnapshot } = storeExports;
const here = dirname(fileURLToPath(import.meta.url));
const url = (...p) => pathToFileURL(join(here, '..', ...p)).href;
const { platformLive } = await import('../js/data/platform-live.js');

const EDIT_AR = 'تحديث بيانات المخاطرة من سجل المخاطر';
const EDIT_EN = 'Risk details updated from the register';
const ARROWS = /[→←]/;

function manualRisk(extra = {}) {
  return store.addAiRisk({ title: 'Crane lift over an occupied area', projectId: 'S1', category: 'site', type: 'Safety', likelihood: 5, impact: 5, owner: 'م. سارة القحطاني', dueDate: '2026-12-01', source: 'Field walk', ...extra });
}

/** Run fn while collecting every bus 'alert' payload. */
function collectAlerts(fn) {
  const seen = [];
  const off = bus.on('alert', (p) => seen.push(p));
  try { fn(); } finally { off(); }
  return seen;
}

export const tests = [
  {
    name: 'a critical risk a person registers raises a simulated:false alert (record, feed event and bus payload)',
    fn() {
      const st = freshStore(NOW);
      let r = null;
      const seen = collectAlerts(() => { r = manualRisk(); });
      assert.equal(r.origin, 'manual');
      const alert = st.platform.alerts.find((a) => a.riskId === r.id);
      assert.ok(alert, 'an alert was recorded');
      assert.equal(alert.severity, 'critical');
      assert.equal(alert.simulated, false);
      assert.equal(seen.length, 1);
      assert.equal(seen[0].simulated, false, 'bus payload says it is not simulated');
      assert.equal(seen[0].alertId, alert.id);
      const ev = st.feed.find((e) => e.type === 'alert' && e.refId === alert.id);
      assert.ok(ev && ev.simulated !== true, 'its feed event is not tagged simulated');
    },
  },
  {
    name: 'an engine-scenario detection (platform-live) raises simulated:true alerts on the record, feed and bus',
    fn() {
      const st = freshStore(NOW);
      platformLive.start({ store, bus });
      platformLive.stop();
      const seen = collectAlerts(() => { for (let i = 0; i < 80; i += 1) platformLive.detectRisk(); });
      const engineIds = new Set(st.platform.aiRisks.filter((r) => r.simulated === true).map((r) => r.id));
      const alerts = st.platform.alerts.filter((a) => engineIds.has(a.riskId));
      assert.ok(alerts.length > 0, 'the scenario raised at least one alert');
      for (const a of alerts) assert.equal(a.simulated, true, a.code);
      const critical = alerts.filter((a) => a.severity === 'critical');
      assert.ok(critical.length > 0, 'at least one critical (bus) alert');
      assert.equal(seen.length, critical.length);
      for (const p of seen) assert.equal(p.simulated, true, p.title);
      for (const a of alerts) assert.equal(st.feed.find((e) => e.type === 'alert' && e.refId === a.id).simulated, true);
    },
  },
  {
    name: 'a manual escalation is simulated:false, also for an engine-detected risk; addAlert needs an explicit true',
    fn() {
      const st = freshStore(NOW);
      const low = manualRisk({ likelihood: 2, impact: 2 });
      assert.equal(low.status, 'مكتشف', 'below the thresholds: no alert yet');
      let alert = null;
      let seen = collectAlerts(() => { alert = store.escalateRisk(low.id, ['email', 'teams'], 'مدير المشروع'); });
      assert.ok(alert);
      assert.equal(alert.simulated, false);
      assert.deepEqual(seen.map((p) => p.simulated), [false]);

      const engine = store.addAiRisk({ title: 'Simulated detection', projectId: 'S1', category: 'site', type: 'Safety', likelihood: 2, impact: 2, simulated: true }, { engine: true });
      assert.equal(engine.origin, 'engine');
      seen = collectAlerts(() => { alert = store.escalateRisk(engine.id, ['email'], 'مدير المشروع'); });
      assert.equal(alert.simulated, false, 'the person escalated it');
      assert.deepEqual(seen.map((p) => p.simulated), [false]);

      for (const flag of [undefined, 'yes', 1, false]) {
        seen = collectAlerts(() => { alert = store.addAlert({ severity: 'critical', title: 'x', simulated: flag }); });
        assert.equal(alert.simulated, false, String(flag));
        assert.equal(seen[0].simulated, false, String(flag));
      }
      seen = collectAlerts(() => { alert = store.addAlert({ severity: 'critical', title: 'x', simulated: true }); });
      assert.equal(alert.simulated, true);
      assert.equal(seen[0].simulated, true);
      assert.ok(st.platform.alerts.length >= 4);
    },
  },
  {
    name: 'a localStorage quota failure emits one real (simulated:false) warning with English title and detail',
    fn() {
      const script = `
        const mem = new Map();
        const full = () => { const e = new Error('quota'); e.name = 'QuotaExceededError'; return e; };
        globalThis.localStorage = {
          getItem: (k) => (mem.has(k) ? mem.get(k) : null),
          setItem: (k, v) => { if (k === 'biltix-hse:v1') throw full(); mem.set(k, String(v)); },
          removeItem: (k) => { mem.delete(k); },
        };
        const { store } = await import(${JSON.stringify(url('js', 'core', 'store.js'))});
        const { bus } = await import(${JSON.stringify(url('js', 'core', 'bus.js'))});
        const seen = [];
        bus.on('alert', (p) => seen.push(p));
        const first = store.flush();
        const second = store.flush();
        process.stdout.write(JSON.stringify({ first, second, seen }));
      `;
      const out = execFileSync(process.execPath, ['--input-type=module', '-e', script], { env: { ...process.env, TZ: 'Asia/Riyadh' }, encoding: 'utf8' });
      const r = JSON.parse(out);
      assert.equal(r.first, false);
      assert.equal(r.second, false);
      assert.equal(r.seen.length, 1, 'reported once');
      const a = r.seen[0];
      assert.equal(a.source, 'storage');
      assert.equal(a.simulated, false);
      assert.equal(a.tone, 'warning');
      assert.ok(a.title && ARABIC.test(a.title) && a.detail && ARABIC.test(a.detail));
      assert.ok(a.titleEn && !ARABIC.test(a.titleEn), a.titleEn);
      assert.ok(a.detailEn && !ARABIC.test(a.detailEn), a.detailEn);
      assert.ok(Number.isFinite(Date.parse(a.ts)));
    },
  },
  {
    name: 'updateRisk records a register edit as kind "edit" with English textEn (no Arabic, no note copied)',
    fn() {
      const st = freshStore(NOW);
      const risk = st.risks[0];
      const n = risk.history.length;
      store.updateRisk(risk.id, { hazard: 'Edited hazard', by: 'مدير السلامة والصحة المهنية', historyKind: 'edit' });
      assert.equal(risk.history.length, n + 1);
      const h = risk.history[risk.history.length - 1];
      assert.deepEqual([h.kind, h.text, h.textEn, h.by], ['edit', EDIT_AR, EDIT_EN, 'مدير السلامة والصحة المهنية']);
      assert.equal('historyKind' in risk, false, 'historyKind is not patched onto the risk');
      assert.equal('noteEn' in risk, false);

      // An older caller passing the Arabic sentence as a note gets the same structured entry.
      store.updateRisk(risk.id, { note: EDIT_AR });
      assert.deepEqual([risk.history.at(-1).kind, risk.history.at(-1).textEn], ['edit', EDIT_EN]);
      // Other notes: as written; English only when given or when the note has no Arabic.
      store.updateRisk(risk.id, { note: 'Checked with the supervisor' });
      assert.equal(risk.history.at(-1).textEn, 'Checked with the supervisor');
      store.updateRisk(risk.id, { note: 'تمت المراجعة مع المشرف' });
      assert.equal('textEn' in risk.history.at(-1), false, 'no Arabic copied into textEn');
      store.updateRisk(risk.id, { note: 'تمت المراجعة مع المشرف', noteEn: 'Reviewed with the supervisor' });
      assert.equal(risk.history.at(-1).textEn, 'Reviewed with the supervisor');
      for (const e of risk.history) if (e.textEn) assert.ok(!ARABIC.test(e.textEn), e.textEn);
    },
  },
  {
    name: 'an edit entry saved by an older version (Arabic textEn) is upgraded to kind "edit" + English on restore',
    fn() {
      const st = freshStore(NOW);
      const risk = st.risks[0];
      risk.history.push({ at: '2026-11-10T08:00:00+03:00', by: 'مدير السلامة والصحة المهنية', text: EDIT_AR, textEn: EDIT_AR });
      const payload = JSON.parse(JSON.stringify(buildPersistPayload(store.state, NOW)));
      const restored = restoreSnapshot(buildFreshState(NOW), payload, NOW);
      const h = restored.risks.find((r) => r.id === risk.id).history.at(-1);
      assert.deepEqual([h.kind, h.text, h.textEn], ['edit', EDIT_AR, EDIT_EN]);
      // A typed note that happens to be Arabic keeps its text and is not touched.
      const other = restored.risks.find((r) => r.id === risk.id).history.slice(0, -1);
      assert.ok(other.every((e) => e.kind !== 'edit'));
    },
  },
  {
    name: 'accept / override / task status / weights / thresholds / reassess / engine state wording has no arrows',
    fn() {
      const st = freshStore(NOW);
      const before = { audit: st.platform.auditLog.length, feed: st.feed.length };
      const a = manualRisk({ likelihood: 3, impact: 3 });
      const b = manualRisk({ likelihood: 3, impact: 2 });
      const task = store.acceptRecommendation(a.id, { owner: 'م. سارة القحطاني', dueDate: '2026-11-20' });
      assert.ok(task && task.id);
      const task2 = store.overrideRecommendation(b.id, { action: 'Fence the area', reason: 'Faster on site', owner: 'م. سارة القحطاني', dueDate: '2026-11-21' });
      assert.ok(task2 && task2.id);
      store.updateTask(task.id, { status: 'قيد التنفيذ' });
      assert.equal(store.setWeights({ contract: 0.3, bom: 0.2, schedule: 0.2, site: 0.2, cost: 0.1 }).ok, true);
      assert.equal(store.setThresholds({ alertThreshold: 55, criticalThreshold: 75 }).ok, true);
      store.updateAiRisk(b.id, { likelihood: 4 });
      const pipe = st.platform.pipelines.find((p) => p.status !== 'degraded');
      store.updatePipeline(pipe.id, { status: 'degraded' });

      const audit = st.platform.auditLog.slice(0, st.platform.auditLog.length - before.audit);
      const feed = st.feed.slice(0, st.feed.length - before.feed);
      const texts = [
        ...audit.flatMap((e) => [e.detail, e.detailEn]),
        ...feed.flatMap((e) => [e.title, e.titleEn, e.detail, e.detailEn]),
        ...[a, b].flatMap((r) => r.history.flatMap((e) => [e.text, e.textEn])),
      ].filter((s) => typeof s === 'string');
      for (const s of texts) assert.ok(!ARROWS.test(s), s);

      const byAction = (act) => audit.find((e) => e.action === act);
      assert.match(byAction('accept').detailEn, /^Recommendation accepted; task MT-\d+ \(/);
      assert.match(byAction('accept').detail, /^قبول التوصية «.+»؛ المهمة MT-\d+ \(/);
      assert.match(byAction('override').detailEn, /^Recommendation overridden; task MT-\d+\. /);
      assert.match(byAction('override').detail, /؛ المهمة MT-\d+$/);
      assert.ok(audit.some((e) => /^Domain weights changed: from .+ to .+$/.test(e.detailEn) && /^تعديل أوزان المجالات: من .+ إلى .+$/.test(e.detail)));
      assert.ok(audit.some((e) => /^Thresholds changed \(alert\/critical\): from \d+\/\d+ to 55\/75$/.test(e.detailEn) && /: من \d+\/\d+ إلى 55\/75$/.test(e.detail)));
      assert.ok(audit.some((e) => /^Engine state changed: from \S+ to /.test(e.detailEn) && /^تغيير حالة المحرك: من \w+ إلى degraded$/.test(e.detail)));
      const taskEv = feed.find((e) => e.type === 'task' && e.statusTo === 'قيد التنفيذ');
      assert.match(taskEv.title, /^المهمة MT-\d+: تغيير الحالة من .+ إلى قيد التنفيذ$/);
      assert.match(taskEv.titleEn, /^Task MT-\d+: status changed( from .+ to .+)?$/);
      assert.ok(feed.some((e) => /^Engine recommendation accepted — AIR-\d+; task MT-\d+$/.test(e.titleEn) && /؛ المهمة MT-\d+$/.test(e.title)));
      assert.ok(feed.some((e) => /^Engine recommendation overridden — AIR-\d+; task MT-\d+$/.test(e.titleEn)));
      const re = b.history.find((e) => e.kind === 'reassess');
      assert.match(re.text, /^إعادة تقدير الشدة: من 3×2 إلى 4×2 \(الدرجة 32\)$/);
      assert.match(re.textEn, /^Severity re-estimated: from 3×2 to 4×2 \(score 32\)$/);
    },
  },
];
