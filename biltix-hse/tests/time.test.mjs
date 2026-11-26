/** No timestamp in the future after re-anchoring (fresh seed and a saved delta restored later). */
import { assert, freshStore, store, storeExports, instants } from './helpers.mjs';

const { buildFreshState, restoreSnapshot, buildPersistPayload } = storeExports;

/** Instants that may legitimately lie ahead: permit expiry, and the start of a not-yet-active permit. */
function allowedFuture(path, st) {
  if (/^state\.permits\[\d+\]\.expiresAt$/.test(path)) return true;
  const m = /^state\.permits\[(\d+)\]\.startsAt$/.exec(path);
  return Boolean(m && !['نشط', 'مغلق'].includes(st.permits[Number(m[1])].status));
}

function futureInstants(st, now) {
  return instants(st).filter((x) => Date.parse(x.value) > now.getTime() && !allowedFuture(x.path, st));
}

export const tests = [
  {
    name: 'fresh seed re-anchored at several clocks: no instant in the future',
    fn() {
      for (const iso of ['2026-11-10T09:00:00+03:00', '2026-11-09T06:00:00+03:00', '2027-03-15T23:30:00+03:00', '2026-01-01T00:05:00+03:00']) {
        const now = new Date(iso);
        const st = buildFreshState(now);
        const bad = futureInstants(st, now);
        assert.deepEqual(bad.slice(0, 3), [], iso);
      }
    },
  },
  {
    name: 'a saved delta restored hours/days later (and with a backwards clock) has no future instant',
    fn() {
      const t1 = new Date('2026-11-10T09:00:00+03:00');
      freshStore(t1);
      const r = store.state.platform.aiRisks.find((x) => x.status === 'قيد المعالجة');
      store.addEvidence(r.id, { kind: 'note', title: 'Saved note', note: 'x' });
      store.assessResidual(r.id, { likelihood: 1, impact: 2, justification: 'checked on site' });
      const payload = JSON.parse(JSON.stringify(buildPersistPayload(store.state, t1)));
      for (const iso of ['2026-11-10T11:30:00+03:00', '2026-11-14T08:00:00+03:00', '2026-11-10T07:00:00+03:00']) {
        const t2 = new Date(iso);
        const base = buildFreshState(t2);
        const st = restoreSnapshot(base, payload, t2);
        const bad = futureInstants(st, t2);
        assert.deepEqual(bad.slice(0, 3), [], iso);
        const restored = st.platform.aiRisks.find((x) => x.id === r.id);
        assert.ok(restored.treatment.evidence.some((e) => e.title === 'Saved note'), 'evidence survives the reload');
      }
    },
  },
  {
    name: 'dataSource timestamps from the future (clock skew / imported file) are clamped to now',
    fn() {
      const now = new Date();
      const s = storeExports.sanitizeSettings({ dataSource: { lastSuccessAt: '2999-01-01T00:00:00+03:00', lastError: { code: 'x', message: 'm', messageEn: 'e' } } });
      assert.ok(Date.parse(s.dataSource.lastSuccessAt) <= now.getTime() + 1000);
      assert.equal(storeExports.sanitizeSettings({ dataSource: { lastErrorAt: 'yesterday' } }).dataSource.lastErrorAt, null);
    },
  },
];
