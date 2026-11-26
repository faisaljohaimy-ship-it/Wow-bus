/**
 * status.connector(): a record's lastTest / lastSuccessAt / lastErrorAt are persisted diagnostics for display
 * only. They never make a connector 'live' or 'error'. Only explicit flags (simulated === false, real === true)
 * mark a record as real, and a real record in live mode follows the configured data source's evidence
 * (settings.dataSource lastSuccessAt / lastErrorAt, the same evidence status.source() uses).
 */
import { assert, freshStore, NOW } from './helpers.mjs';

const { status } = await import('../js/core/status.js');

const iso = (msAgo) => new Date(NOW.getTime() - msAgo).toISOString();
const MIN = 60 * 1000;

/** settings for live mode (an external JSON source) with the given data-source evidence. */
function liveState(ds = {}) {
  return { settings: { dataSource: { type: 'json', url: 'https://example.test/risks.json', lastSuccessAt: null, lastErrorAt: null, ...ds } } };
}
const DEMO = { settings: { dataSource: { type: 'simulation' } } };

/** A configured, simulated connector that carries fresh diagnostics of its own. */
const simWithDiagnostics = (extra = {}) => ({
  id: 'p6', status: 'connected', simulated: true,
  lastSuccessAt: iso(1 * MIN),
  lastTest: { ok: true, opaque: false, at: iso(1 * MIN), latencyMs: 120, reason: 'ok', message: '', messageEn: '' },
  ...extra,
});

export const tests = [
  {
    name: 'a simulated connector with a recent lastSuccessAt stays demo in live mode (not live)',
    fn() {
      // Even with a healthy live data source, the record's own diagnostics do not make it live.
      for (const st of [liveState(), liveState({ lastSuccessAt: iso(2 * MIN) })]) {
        assert.equal(status.mode(st), 'live');
        assert.equal(status.connector(st, simWithDiagnostics(), NOW), 'demo');
        assert.equal(status.connector(st, simWithDiagnostics({ simulated: undefined }), NOW), 'demo', 'no flag at all is not real either');
      }
      assert.equal(status.connector(DEMO, simWithDiagnostics(), NOW), 'demo');
    },
  },
  {
    name: 'a recent lastErrorAt or a failed lastTest on a simulated connector never classifies it as error',
    fn() {
      const rec = simWithDiagnostics({ lastSuccessAt: null, lastErrorAt: iso(1 * MIN), lastTest: { ok: false, at: iso(1 * MIN), reason: 'network' } });
      assert.equal(status.connector(liveState(), rec, NOW), 'demo');
      assert.equal(status.connector(liveState({ lastSuccessAt: iso(1 * MIN) }), rec, NOW), 'demo');
      assert.equal(status.connector(DEMO, rec, NOW), 'demo');
    },
  },
  {
    name: 'an unconfigured connector with diagnostics stays not_connected in both modes',
    fn() {
      for (const raw of ['configurable', 'not_connected', 'available']) {
        const rec = simWithDiagnostics({ status: raw });
        assert.equal(status.connector(liveState({ lastSuccessAt: iso(1 * MIN) }), rec, NOW), 'not_connected', raw);
        assert.equal(status.connector(DEMO, rec, NOW), 'not_connected', raw);
      }
      assert.equal(status.connector(liveState(), simWithDiagnostics({ configured: false }), NOW), 'not_connected');
    },
  },
  {
    name: 'a record flagged real follows the data-source evidence, not its own diagnostics',
    fn() {
      for (const flag of [{ simulated: false }, { simulated: true, real: true }]) {
        const own = { id: 'x', status: 'connected', ...flag };
        // Data source never tested: not_connected, even when the record carries its own fresh success.
        assert.equal(status.connector(liveState(), { ...own, lastSuccessAt: iso(1 * MIN) }, NOW), 'not_connected');
        // No source URL: not_connected.
        assert.equal(status.connector({ settings: { dataSource: { type: 'json', url: '', lastSuccessAt: iso(1 * MIN) } } }, own, NOW), 'not_connected');
        // Source succeeded a minute ago: live, even with a newer error on the record itself.
        assert.equal(status.connector(liveState({ lastSuccessAt: iso(2 * MIN) }), { ...own, lastErrorAt: iso(1 * MIN) }, NOW), 'live');
        // Source's last attempt failed: error.
        assert.equal(status.connector(liveState({ lastSuccessAt: iso(10 * MIN), lastErrorAt: iso(1 * MIN) }), own, NOW), 'error');
        // Source success older than the stale window (30 min): stale, even with a fresh success on the record.
        assert.equal(status.connector(liveState({ lastSuccessAt: iso(45 * MIN) }), { ...own, lastSuccessAt: iso(1 * MIN) }, NOW), 'stale');
        // The record's own stale window still applies to the source evidence.
        assert.equal(status.connector(liveState({ lastSuccessAt: iso(10 * MIN) }), { ...own, staleAfterMs: 5 * MIN }, NOW), 'stale');
        // Demo mode: demo.
        assert.equal(status.connector(DEMO, own, NOW), 'demo');
      }
    },
  },
  {
    name: 'offline (navigator.onLine === false) applies to real records only',
    fn() {
      const desc = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
      try {
        Object.defineProperty(globalThis, 'navigator', { value: { onLine: false }, configurable: true, writable: true });
        assert.equal(status.online(), false);
        const st = liveState({ lastSuccessAt: iso(1 * MIN) });
        assert.equal(status.connector(st, { id: 'x', status: 'connected', simulated: false }, NOW), 'offline');
        assert.equal(status.connector(st, simWithDiagnostics(), NOW), 'demo');
      } finally {
        if (desc) Object.defineProperty(globalThis, 'navigator', desc); else delete globalThis.navigator;
      }
      assert.equal(status.online(), true);
    },
  },
  {
    name: 'seed integrations and connectors with fresh diagnostics: none is live or error in live mode (summary live 0)',
    fn() {
      const fresh = freshStore(NOW);
      const records = [...fresh.integrations, ...fresh.platform.connectors].map((r) => ({
        ...r,
        lastSuccessAt: iso(1 * MIN),
        lastTest: { ok: true, opaque: false, at: iso(1 * MIN), latencyMs: 90, reason: 'ok', message: '', messageEn: '' },
      }));
      assert.ok(records.length > 0);
      // In the seed only unconfigured records carry simulated: false; every configured one is simulated.
      const flagged = records.filter((r) => r.simulated === false || r.real === true);
      assert.ok(flagged.every((r) => r.status === 'configurable'), `flagged real but configured: ${flagged.filter((r) => r.status !== 'configurable').map((r) => r.id)}`);
      assert.ok(records.some((r) => r.simulated === true && r.status === 'connected'), 'the seed has configured simulated connectors');
      const st = liveState({ lastSuccessAt: iso(1 * MIN) });
      for (const r of records) {
        const s = status.connector(st, r, NOW);
        assert.ok(s === 'demo' || s === 'not_connected', `${r.id} → ${s}`);
      }
      const sum = status.summary(st, records, NOW);
      assert.equal(sum.counts.live, 0);
      assert.equal(sum.counts.error, 0);
      assert.equal(sum.counts.stale, 0);
      assert.equal(sum.counts.demo + sum.counts.not_connected, sum.total);
      // Same records with lastErrorAt instead: still no error.
      const errored = records.map((r) => ({ ...r, lastSuccessAt: null, lastErrorAt: iso(1 * MIN) }));
      assert.equal(status.summary(st, errored, NOW).counts.error, 0);
    },
  },
];
