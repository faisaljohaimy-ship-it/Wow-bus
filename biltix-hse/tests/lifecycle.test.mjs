/** Audited risk lifecycle CRUD: residual-before-close, validation without silent defaults, evidence, tasks. */
import { assert, freshStore, store, psel } from './helpers.mjs';

function newManualRisk(extra = {}) {
  return store.addAiRisk({ title: 'Unprotected edge on level 4', projectId: 'S1', category: 'site', type: 'Safety', likelihood: 3, impact: 4, owner: 'م. سارة القحطاني', dueDate: '2026-12-01', source: 'Field walk', ...extra });
}

export const tests = [
  {
    name: 'addAiRisk: no silent defaults — missing likelihood, impact, owner or due date is an error and nothing is stored',
    fn() {
      const st = freshStore();
      const n = st.platform.aiRisks.length;
      const res = store.addAiRisk({ title: 'x', projectId: 'S1', category: 'site', type: 'Safety' });
      assert.equal(res.ok, false);
      assert.deepEqual(res.errors.map((e) => e.field).sort(), ['dueDate', 'impact', 'likelihood', 'owner']);
      for (const e of res.errors) assert.ok(e.message && e.messageEn);
      assert.equal(st.platform.aiRisks.length, n);
      assert.equal(store.addAiRisk({ title: 'x', projectId: 'S1', category: 'site', type: 'Safety', likelihood: 7, impact: 2, owner: 'a', dueDate: '2026-12-01' }).errors[0].code, 'range');
      assert.equal(store.addAiRisk({ title: 'x', projectId: 'S9', category: 'site', type: 'Safety', likelihood: 2, impact: 2, owner: 'a', dueDate: '2026-12-01' }).errors[0].field, 'projectId');
    },
  },
  {
    name: 'addAiRisk (manual): derived score, no model confidence, data quality, audit "create", bilingual feed',
    fn() {
      const st = freshStore();
      const r = newManualRisk();
      assert.equal(r.score, 48);
      assert.equal(r.confidence, null);
      assert.equal(r.origin, 'manual');
      assert.ok(r.dataQuality && r.dataQuality.level);
      assert.equal(r.residualLikelihood, null);
      assert.equal(st.platform.auditLog[0].action, 'create');
      assert.ok(st.feed[0].titleEn && !/[؀-ۿ]/.test(st.feed[0].titleEn));
    },
  },
  {
    name: 'closeAiRisk requires a residual assessment, then an outcome; residual requires a treatment',
    fn() {
      freshStore();
      const r = newManualRisk();
      assert.equal(store.closeAiRisk(r.id, { outcome: 'done' }).reason, 'residual-required');
      assert.equal(store.assessResidual(r.id, { likelihood: 1, impact: 4, justification: 'barriers in place' }).reason, 'treatment-required');
      const task = store.acceptRecommendation(r.id, { owner: 'م. سارة القحطاني', dueDate: '2026-11-20' });
      assert.ok(task && task.id);
      assert.equal(r.treatment.taskId, task.id);
      assert.equal(store.assessResidual(r.id, { likelihood: 5, impact: 5, justification: 'worse than before' }).reason, 'residual-above-inherent');
      assert.equal(store.assessResidual(r.id, { likelihood: 1, impact: 4, justification: '' }).reason, 'validation');
      assert.equal(store.assessResidual(r.id, { likelihood: 1, impact: 4, justification: 'Edge barriers installed and inspected' }).ok, true);
      assert.equal(store.closeAiRisk(r.id, { outcome: '' }).reason, 'outcome-required');
      const closed = store.closeAiRisk(r.id, { outcome: 'Barriers verified by the HSE lead' });
      assert.equal(closed.ok, true);
      assert.equal(r.status, 'مغلق');
      assert.ok(r.closedAt);
      assert.equal(store.state.platform.tasks.find((t) => t.id === task.id).status, 'مغلقة', 'linked task closed too');
      assert.equal(psel.lifecycle(r, store.state)[10].state, 'done');
    },
  },
  {
    name: 'closing a task does not close an unassessed risk; it does once the residual is assessed',
    fn() {
      freshStore();
      const r = newManualRisk();
      const task = store.acceptRecommendation(r.id, { owner: 'م. سارة القحطاني', dueDate: '2026-11-20' });
      assert.equal(store.updateTask(task.id, { status: 'مغلقة' }), null, 'closing a task needs an outcome');
      store.updateTask(task.id, { status: 'مغلقة', outcome: 'Done' });
      assert.equal(r.status, 'قيد المعالجة');
      store.updateTask(task.id, { status: 'قيد التنفيذ' });
      store.assessResidual(r.id, { likelihood: 1, impact: 4, justification: 'Edge barriers installed' });
      store.updateTask(task.id, { status: 'مغلقة', outcome: 'Done and verified' });
      assert.equal(r.status, 'مغلق');
    },
  },
  {
    name: 'updateAiRisk cannot close a risk around the residual rule',
    fn() {
      freshStore();
      const r = newManualRisk();
      assert.equal(store.updateAiRisk(r.id, { status: 'مغلق' }), null);
      assert.notEqual(r.status, 'مغلق');
    },
  },
  {
    name: 'reopenAiRisk needs a reason and reopens linked tasks',
    fn() {
      const st = freshStore();
      const closed = st.platform.aiRisks.find((x) => x.status === 'مغلق' && x.taskId);
      assert.equal(store.reopenAiRisk(closed.id, {}).reason, 'reason-required');
      assert.equal(store.reopenAiRisk(closed.id, { reason: 'Recurred on site' }).ok, true);
      assert.equal(closed.status, 'قيد المعالجة');
      assert.equal(st.platform.tasks.find((t) => t.id === closed.taskId).status, 'قيد التنفيذ');
      assert.equal(st.platform.auditLog[0].action, 'reopen');
    },
  },
  {
    name: 'evidence: http(s) links only, stored locally, source-record evidence cannot be removed',
    fn() {
      const st = freshStore();
      const r = st.platform.aiRisks.find((x) => x.status === 'قيد المعالجة');
      assert.equal(store.addEvidence(r.id, { kind: 'link', title: 'x', url: 'javascript:alert(1)' }).reason, 'validation');
      const ok = store.addEvidence(r.id, { kind: 'link', title: 'Inspection photo', url: 'https://example.com/p.jpg' });
      assert.equal(ok.ok, true);
      assert.equal(ok.evidence.local, true);
      assert.equal(st.platform.auditLog[0].action, 'evidence');
      assert.equal(store.removeEvidence(r.id, ok.evidence.id).ok, true);
      const withSource = st.platform.aiRisks.find((x) => x.treatment.evidence.some((e) => e.local === false) && x.status !== 'مغلق');
      assert.equal(store.removeEvidence(withSource.id, withSource.treatment.evidence[0].id).reason, 'source-evidence');
      assert.equal(store.addEvidence(r.id, { kind: 'file', title: 'Big', fileName: 'a.zip', size: 30 * 1024 * 1024 }).reason, 'validation');
    },
  },
  {
    name: 'tasks: editTask validates, assignTask and addTaskAttachment are audited',
    fn() {
      const st = freshStore();
      const t = st.platform.tasks.find((x) => x.status === 'جديدة');
      assert.equal(store.editTask(t.id, { dueDate: 'tomorrow' }).reason, 'validation');
      assert.equal(store.editTask(t.id, { priority: 'urgent' }).reason, 'validation');
      assert.deepEqual(store.editTask(t.id, { priority: 'high', title: 'Revised title' }).changed.sort(), ['priority', 'title']);
      assert.equal(st.platform.auditLog[0].action, 'edit');
      assert.equal(store.assignTask(t.id, '').reason, 'owner-required');
      assert.equal(store.assignTask(t.id, 'م. خالد العتيبي').ok, true);
      assert.equal(st.platform.auditLog[0].action, 'assign');
      const att = store.addTaskAttachment(t.id, { kind: 'note', title: 'Site note', note: 'Barrier ordered' });
      assert.equal(att.ok, true);
      assert.equal(att.attachment.local, true);
      assert.equal(st.platform.auditLog[0].action, 'attachment');
      const closed = st.platform.tasks.find((x) => x.status === 'مغلقة');
      assert.equal(store.editTask(closed.id, { title: 'x' }).reason, 'task-closed');
    },
  },
  {
    name: 'persistence keeps the new fields (delta payload carries residual, treatment and attachments)',
    fn() {
      const st = freshStore();
      const r = st.platform.aiRisks.find((x) => x.status === 'قيد المعالجة');
      store.addEvidence(r.id, { kind: 'note', title: 'Note', note: 'checked' });
      const payload = store.persistPayload();
      const patch = payload.platform.aiRisks.p[r.id];
      assert.ok(patch && patch.treatment && patch.treatment.evidence.some((e) => e.local === true));
      assert.ok(!('sites' in payload), 'reference data is never persisted');
    },
  },
];
