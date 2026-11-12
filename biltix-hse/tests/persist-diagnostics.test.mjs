/**
 * Integration / connector diagnostics persistence, bilingual runtime audit + history entries, the English
 * import source label and the 'مفتوح' vendor term.
 *
 *   • lastTest / lastSuccessAt / lastErrorAt survive buildPersistPayload → restoreSnapshot (not re-anchored, never
 *     in the future) and never change a record's status / simulated / real flags or its status.js classification.
 *   • Rule toggles, quarantine decisions, pipeline updates and updateAiRisk notes carry English text (detailEn /
 *     textEn) plus structured fields — also in a process where the lazy English dictionaries were never loaded
 *     (an Arabic session), where no *En field may contain Arabic.
 *   • sources.commitImport stores sourceEn next to the Arabic source label.
 *   • terms['مفتوح'] = 'Open standard' does not change the risk status label 'مفتوح' → 'Open' (enums, not terms).
 */
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { assert, freshStore, store, storeExports, sources, NOW, ARABIC } from './helpers.mjs';

const { buildPersistPayload, buildFreshState, restoreSnapshot } = storeExports;
const here = dirname(fileURLToPath(import.meta.url));
const storeUrl = pathToFileURL(join(here, '..', 'js', 'core', 'store.js')).href;

const AT_OK = '2026-11-10T08:45:12+03:00';
const AT_ERR = '2026-11-10T08:50:00+03:00';

function seedDiagnostics(st) {
  const integ = st.integrations.find((g) => g.id === 'webhooks') || st.integrations[0];
  const conn = st.platform.connectors.find((c) => c.id === 'primavera-p6') || st.platform.connectors[0];
  store.updateIntegration(integ.id, {
    lastTest: { ok: true, opaque: false, at: AT_OK, latencyMs: 182, reason: null, message: 'تم الاتصال', messageEn: 'Reached the endpoint' },
    lastSuccessAt: AT_OK,
  });
  store.updateConnector(conn.id, {
    lastTest: { ok: false, opaque: true, at: AT_ERR, latencyMs: null, reason: 'cors', message: 'حظر CORS', messageEn: 'Blocked by CORS' },
    lastErrorAt: AT_ERR,
  });
  return { integ, conn };
}

/** Every string value under `value` (with its path) that contains Arabic and sits in a key ending in "En". */
function arabicInEnFields(value, path = '', out = []) {
  if (Array.isArray(value)) value.forEach((v, i) => arabicInEnFields(v, `${path}[${i}]`, out));
  else if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) {
      if (typeof v === 'string' && k.length > 2 && k.endsWith('En') && ARABIC.test(v)) out.push(`${path}.${k}=${v}`);
      else arabicInEnFields(v, `${path}.${k}`, out);
    }
  }
  return out;
}

export const tests = [
  {
    name: 'integration/connector diagnostics (lastTest, lastSuccessAt, lastErrorAt) survive buildPersistPayload → restore',
    fn() {
      const st = freshStore(NOW);
      const { integ, conn } = seedDiagnostics(st);
      const payload = JSON.parse(JSON.stringify(buildPersistPayload(store.state, NOW)));
      const ip = payload.data.integrations && payload.data.integrations.p && payload.data.integrations.p[integ.id];
      const cp = payload.platform.connectors && payload.platform.connectors.p && payload.platform.connectors.p[conn.id];
      assert.ok(ip && ip.lastTest && ip.lastSuccessAt === AT_OK, 'integration diagnostics are in the delta');
      assert.ok(cp && cp.lastTest && cp.lastErrorAt === AT_ERR, 'connector diagnostics are in the delta');
      assert.ok(!('status' in ip) && !('status' in cp), 'no status change is persisted with them');

      // Same day a few hours later, and four days later: diagnostics are real instants → restored exactly (no re-anchoring).
      for (const iso of ['2026-11-10T12:30:00+03:00', '2026-11-14T08:00:00+03:00']) {
        const t2 = new Date(iso);
        const restored = restoreSnapshot(buildFreshState(t2), payload, t2);
        const ri = restored.integrations.find((g) => g.id === integ.id);
        const rc = restored.platform.connectors.find((c) => c.id === conn.id);
        assert.deepEqual(ri.lastTest, { ok: true, opaque: false, at: AT_OK, latencyMs: 182, reason: null, message: 'تم الاتصال', messageEn: 'Reached the endpoint' }, iso);
        assert.equal(ri.lastSuccessAt, AT_OK, iso);
        assert.deepEqual(rc.lastTest, { ok: false, opaque: true, at: AT_ERR, latencyMs: null, reason: 'cors', message: 'حظر CORS', messageEn: 'Blocked by CORS' }, iso);
        assert.equal(rc.lastErrorAt, AT_ERR, iso);
      }
    },
  },
  {
    name: 'restored diagnostics are clamped to now on a backwards clock and malformed ones are dropped',
    fn() {
      const st = freshStore(NOW);
      const { integ, conn } = seedDiagnostics(st);
      const payload = JSON.parse(JSON.stringify(buildPersistPayload(store.state, NOW)));
      payload.platform.connectors.p[conn.id].lastTest = { ok: 'yes', at: 'yesterday' };
      payload.platform.connectors.p[conn.id].lastErrorAt = 42;
      const t2 = new Date('2026-11-10T07:00:00+03:00'); // earlier than both test instants
      const restored = restoreSnapshot(buildFreshState(t2), payload, t2);
      const ri = restored.integrations.find((g) => g.id === integ.id);
      const rc = restored.platform.connectors.find((c) => c.id === conn.id);
      assert.ok(Date.parse(ri.lastTest.at) <= t2.getTime(), 'lastTest.at not in the future');
      assert.ok(Date.parse(ri.lastSuccessAt) <= t2.getTime(), 'lastSuccessAt not in the future');
      assert.equal(rc.lastTest, null, 'a lastTest without a valid instant is dropped');
      assert.equal(rc.lastErrorAt, null, 'a non-instant lastErrorAt is dropped');
    },
  },
  {
    name: 'persisted diagnostics never make a connector Live (status / simulated / real unchanged; status.js unchanged)',
    async fn() {
      const { status } = await import('../js/core/status.js');
      const fresh = freshStore(NOW);
      const before = new Map([...fresh.integrations, ...fresh.platform.connectors].map((r) => [r.id, { status: r.status, simulated: r.simulated, real: r.real }]));
      const { integ, conn } = seedDiagnostics(fresh);
      const payload = JSON.parse(JSON.stringify(buildPersistPayload(store.state, NOW)));
      const restored = restoreSnapshot(buildFreshState(NOW), payload, NOW);
      const baseline = buildFreshState(NOW);
      for (const [rec, ref] of [
        [restored.integrations.find((g) => g.id === integ.id), baseline.integrations.find((g) => g.id === integ.id)],
        [restored.platform.connectors.find((c) => c.id === conn.id), baseline.platform.connectors.find((c) => c.id === conn.id)],
      ]) {
        assert.deepEqual({ status: rec.status, simulated: rec.simulated, real: rec.real }, before.get(rec.id), `${rec.id} flags unchanged`);
        // Demo mode (the shipped mode): the record classifies exactly like the same record without diagnostics.
        assert.equal(status.connector(restored, rec, NOW), status.connector(baseline, ref, NOW), `${rec.id} demo-mode status`);
        assert.notEqual(status.connector(restored, rec, NOW), 'live', `${rec.id} is not Live`);
      }
      // A lastTest alone (the Integrations "Test connection" diagnostic) is not live evidence even in live mode.
      const liveState = { settings: { dataSource: { type: 'json', url: 'https://example.test/data.json' } } };
      const onlyTest = { ...baseline.integrations.find((g) => g.id === integ.id), lastTest: { ok: true, at: NOW.toISOString() } };
      assert.notEqual(status.connector(liveState, onlyTest, NOW), 'live');
    },
  },
  {
    name: 'rule toggle, quarantine decision, pipeline update and updateAiRisk notes write English + structured fields',
    fn() {
      const st = freshStore(NOW);
      const v = st.platform.validation;
      const rule = v.rules.find((r) => r.enabled);
      store.updateValidationRule(rule.id, { enabled: false });
      let a = st.platform.auditLog[0];
      assert.equal(a.detailEn, 'Validation rule disabled');
      assert.equal(a.kind, 'rule-toggle'); assert.equal(a.ruleId, rule.id); assert.equal(a.enabled, false);
      assert.ok(a.targetEn && !ARABIC.test(a.targetEn), 'English rule name when the dictionaries are loaded');

      const q = v.quarantine.find((x) => x.status === 'معلّق');
      store.resolveQuarantine(q.id, 'مُصحح');
      a = st.platform.auditLog[0];
      assert.match(a.detailEn, /^Quarantined record corrected — \S/);
      assert.ok(!ARABIC.test(a.detailEn));
      assert.deepEqual([a.kind, a.quarantineId, a.decision, a.from, a.to], ['quarantine', q.id, 'corrected', 'معلّق', 'مُصحح']);

      const pipe = st.platform.pipelines.find((p) => p.status !== 'degraded');
      const pipeFrom = pipe.status;
      store.updatePipeline(pipe.id, { status: 'degraded', version: 'v9.9.9' });
      a = st.platform.auditLog[0];
      assert.match(a.detailEn, /^Engine state changed: from .+ to .+ \(version v9\.9\.9\)$/);
      assert.match(a.detail, /^تغيير حالة المحرك: من \w+ إلى degraded \(الإصدار v9\.9\.9\)$/, 'Arabic worded without an arrow');
      assert.deepEqual([a.kind, a.pipelineId, a.from, a.to, a.version], ['pipeline-status', pipe.id, pipeFrom, 'degraded', 'v9.9.9']);
      assert.ok(a.targetEn && !ARABIC.test(a.targetEn));

      const risk = st.platform.aiRisks.find((r) => r.status === 'مكتشف' || r.status === 'تنبيه');
      const l = risk.likelihood === 5 ? 4 : risk.likelihood + 1;
      store.updateAiRisk(risk.id, { likelihood: l, by: 'مدير المشروع' });
      let h = risk.history[risk.history.length - 1];
      assert.match(h.textEn, /^Severity re-estimated: from \d×\d to \d×\d \(score \d+\)$/);
      assert.match(h.text, /^إعادة تقدير الشدة: من \d×\d إلى \d×\d \(الدرجة \d+\)$/);
      assert.equal(h.kind, 'reassess');
      store.updateAiRisk(risk.id, { owner: 'م. خالد العتيبي', dueDate: '2026-11-20', by: 'مدير المشروع', note: 'إسناد المخاطرة إلى م. خالد العتيبي — الاستحقاق 2026-11-20' });
      h = risk.history[risk.history.length - 1];
      assert.equal(h.textEn, 'Risk assigned to Eng. Khalid Al-Otaibi — due 2026-11-20');
      assert.deepEqual([h.kind, h.owner, h.due], ['assign', 'م. خالد العتيبي', '2026-11-20']);
      store.updateAiRisk(risk.id, { note: 'Checked on site with the supervisor' });
      h = risk.history[risk.history.length - 1];
      assert.equal(h.textEn, 'Checked on site with the supervisor', 'a typed note is copied as typed');
      const prev = risk.status;
      store.updateAiRisk(risk.id, { status: 'قيد المعالجة' });
      h = risk.history[risk.history.length - 1];
      assert.match(h.textEn, /^Status changed from \S.* to \S/);
      assert.deepEqual([h.kind, h.statusFrom, h.statusTo], ['status', prev, 'قيد المعالجة']);
      assert.equal('noteEn' in risk, false, 'noteEn is never patched onto the risk');
      assert.deepEqual(arabicInEnFields(st.platform.auditLog.slice(0, 3)), []);
    },
  },
  {
    name: 'without the lazy English dictionaries (Arabic session) no *En field written by the store contains Arabic',
    fn() {
      const script = `
        const { store } = await import(${JSON.stringify(storeUrl)});
        store.now = () => new Date('2026-11-10T09:00:00+03:00');
        store.reset();
        const st = store.state;
        const v = st.platform.validation;
        const rule = v.rules.find((r) => r.enabled);
        store.updateValidationRule(rule.id, { enabled: false });
        const q = v.quarantine.find((x) => x.status === 'معلّق');
        store.resolveQuarantine(q.id, 'مرفوض');
        const pipe = st.platform.pipelines.find((p) => p.status !== 'degraded');
        store.updatePipeline(pipe.id, { status: 'degraded' });
        const risk = st.platform.aiRisks.find((r) => r.status === 'مكتشف' || r.status === 'تنبيه');
        const from = risk.history.length;
        store.updateAiRisk(risk.id, { owner: 'م. خالد العتيبي', dueDate: '2026-11-20', note: 'إسناد المخاطرة إلى م. خالد العتيبي — الاستحقاق 2026-11-20' });
        store.updateAiRisk(risk.id, { status: 'قيد المعالجة' });
        const closed = st.platform.aiRisks.find((r) => r.status === 'مغلق');
        if (closed) store.reopenAiRisk(closed.id, { reason: 'سبب إعادة الفتح' });
        const vocab = await import(${JSON.stringify(pathToFileURL(join(here, '..', 'js', 'data', 'vocab-en.js')).href)});
        process.stdout.write(JSON.stringify({ loaded: vocab.vocabLoaded(), audit: st.platform.auditLog.slice(0, 4), history: risk.history.slice(from), feed: st.feed.slice(0, 3) }));
      `;
      const out = execFileSync(process.execPath, ['--input-type=module', '-e', script], { env: { ...process.env, TZ: 'Asia/Riyadh' }, encoding: 'utf8' });
      const r = JSON.parse(out);
      assert.equal(r.loaded, false, 'the child process never loaded the English dictionaries');
      assert.deepEqual(arabicInEnFields(r), [], 'no Arabic in any *En field');
      const byKind = (k) => r.audit.find((e) => e.kind === k);
      assert.equal(byKind('rule-toggle').detailEn, 'Validation rule disabled');
      assert.equal(byKind('quarantine').detailEn, 'Quarantined record rejected', 'reason left out when its English is not loaded');
      assert.match(byKind('pipeline-status').detailEn, /^Engine state changed: from [a-z]+ to degraded$/);
      const assign = r.history.find((h) => h.kind === 'assign');
      assert.equal(assign.textEn, 'Risk assigned to a new owner — due 2026-11-20');
      const status = r.history.find((h) => h.kind === 'status');
      assert.equal(status.textEn, 'Status changed');
      assert.ok(status.statusFrom && status.statusTo, 'structured from/to kept for the view');
      for (const e of [...r.audit, ...r.history]) {
        for (const k of ['detailEn', 'textEn']) if (k in e) assert.ok(String(e[k]).trim() && !/\(was \)|: {2}|from {2}| to $|[→←]/.test(e[k]), `${k}: ${e[k]}`);
      }
    },
  },
  {
    name: 'commitImport labels imported risks with an English source next to the Arabic one (and it persists)',
    async fn() {
      const st = freshStore(NOW);
      const csv = 'hazard,site,category,likelihood,severity,due date\nUnguarded edge at level 4,RUH-01,height,4,4,2026-12-01\n';
      const preview = sources.importPreview({ text: csv, fileName: 'site-walk.csv' });
      assert.equal(preview.validCount, 1, JSON.stringify(preview.errors));
      assert.equal(preview.valid[0].sourceEn, 'Import — site-walk.csv');
      const res = await sources.commitImport(preview, { store });
      assert.equal(res.ok, true);
      const risk = st.risks.find((x) => x.id === res.ids[0]);
      assert.equal(risk.source, 'استيراد — site-walk.csv');
      assert.equal(risk.sourceEn, 'Import — site-walk.csv');
      const restored = restoreSnapshot(buildFreshState(NOW), JSON.parse(JSON.stringify(buildPersistPayload(store.state, NOW))), NOW);
      assert.equal(restored.risks.find((x) => x.id === risk.id).sourceEn, 'Import — site-walk.csv');
      assert.equal(sources.importSourceEn('استيراد — Google Sheets CSV'), 'Import — Google Sheets CSV');
      assert.equal(sources.importSourceEn('استيراد — مخاطر.csv'), 'File import');
      assert.equal(sources.importSourceEn('استيراد'), 'Import');
      assert.equal(sources.importSourceEn('تفتيش'), '', 'enum values are labelled by the view, never copied as Arabic');
      const custom = await sources.commitImport(preview, { store, source: 'استيراد — ملف الموقع' });
      assert.equal(st.risks.find((x) => x.id === custom.ids[0]).sourceEn, 'File import');
    },
  },
  {
    name: "terms['مفتوح'] is the vendor 'Open standard'; the risk status 'مفتوح' still reads 'Open' (enums, not terms)",
    async fn() {
      const { i18n } = await import('../js/core/i18n.js');
      const enums = (await import('../js/i18n/enums.js')).default;
      const unwrap = (d) => (d && d.enum ? d.enum : d);
      i18n.register('enum', { ar: unwrap(enums.ar), en: unwrap(enums.en) });
      await i18n.loadData();
      const before = i18n.lang();
      try {
        await i18n.setLang('en');
        assert.equal(i18n.term('مفتوح'), 'Open standard');
        assert.equal(i18n.label('riskStatus', 'مفتوح'), 'Open');
        assert.equal(i18n.label('incidentStatus', 'مفتوح'), 'Open');
        assert.equal(i18n.label('clauseStatus', 'مفتوح'), 'Open');
        const imported = { id: 'R-T1', source: 'استيراد — x.csv', sourceEn: 'Import — x.csv' };
        assert.equal(i18n.L(imported, 'source', 'risks'), 'Import — x.csv', 'i18n.L reads sourceEn in English');
      } finally {
        await i18n.setLang(before);
      }
    },
  },
];
