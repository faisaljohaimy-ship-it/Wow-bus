/** Weights (5 non-negative, sum 1 ± 0.001) and thresholds (critical ≥ alert + 5) validation. */
import { assert, freshStore, store, storeExports, bus } from './helpers.mjs';

const { validateWeights, validateThresholds, DEFAULT_SETTINGS } = storeExports;
const W = { contract: 0.2, bom: 0.2, schedule: 0.25, site: 0.2, cost: 0.15 };

export const tests = [
  {
    name: 'validateWeights accepts a valid set and the ± 0.001 tolerance',
    fn() {
      assert.equal(validateWeights(W).ok, true);
      assert.equal(validateWeights({ ...W, cost: 0.1509 }).ok, true);
      assert.equal(validateWeights({ ...W, cost: '0.15' }).ok, true);
    },
  },
  {
    name: 'validateWeights rejects a wrong sum, negatives, missing and unknown keys with bilingual reasons',
    fn() {
      const cases = [
        [{ ...W, cost: 0.152 }, 'weights-sum'],
        [{ ...W, contract: 0.3 }, 'weights-sum'],
        [{ ...W, contract: -0.05, cost: 0.4 }, 'weights-negative'],
        [{ contract: 0.5, bom: 0.5 }, 'weights-missing'],
        [{ ...W, extra: 0 }, 'weights-unknown'],
        [null, 'weights-shape'],
      ];
      for (const [input, reason] of cases) {
        const r = validateWeights(input);
        assert.equal(r.ok, false, JSON.stringify(input));
        assert.equal(r.reason, reason);
        assert.ok(r.message && r.messageEn);
      }
    },
  },
  {
    name: 'store.setWeights rejects an invalid set and keeps the current weights; a valid set is stored exactly',
    fn() {
      const st = freshStore();
      const bad = store.setWeights({ ...W, contract: 0.5 });
      assert.equal(bad.ok, false);
      assert.deepEqual(st.settings.platform.weights, DEFAULT_SETTINGS.platform.weights);
      const good = store.setWeights({ contract: 0.3, bom: 0.2, schedule: 0.2, site: 0.2, cost: 0.1 });
      assert.equal(good.ok, true);
      assert.deepEqual(st.settings.platform.weights, { contract: 0.3, bom: 0.2, schedule: 0.2, site: 0.2, cost: 0.1 });
      assert.equal(st.platform.auditLog[0].action, 'config');
    },
  },
  {
    name: 'setSettings never reshapes invalid weights: they are dropped and settings:invalid explains why',
    fn() {
      const st = freshStore();
      const seen = [];
      const off = bus.on('settings:invalid', (e) => seen.push(e));
      store.setSettings({ platform: { weights: { contract: 1, bom: 1, schedule: 1, site: 1, cost: 1 } }, theme: 'light' });
      off();
      assert.equal(st.settings.theme, 'light');
      assert.deepEqual(st.settings.platform.weights, DEFAULT_SETTINGS.platform.weights);
      assert.equal(seen.length, 1);
      assert.equal(seen[0].field, 'weights');
      assert.equal(seen[0].reason, 'weights-sum');
    },
  },
  {
    name: 'thresholds: critical must be ≥ alert + 5 (rejected otherwise, current pair kept)',
    fn() {
      assert.equal(validateThresholds({ alertThreshold: 60, criticalThreshold: 65 }).ok, true);
      assert.equal(validateThresholds({ alertThreshold: 60, criticalThreshold: 64 }).reason, 'thresholds-gap');
      assert.equal(validateThresholds({ alertThreshold: -1, criticalThreshold: 50 }).reason, 'thresholds-range');
      const st = freshStore();
      assert.equal(store.setThresholds({ alertThreshold: 80, criticalThreshold: 82 }).ok, false);
      assert.equal(st.settings.platform.alertThreshold, 60);
      assert.equal(st.settings.platform.criticalThreshold, 85);
      assert.equal(store.setThresholds({ alertThreshold: 55, criticalThreshold: 75 }).ok, true);
      assert.equal(st.settings.platform.criticalThreshold, 75);
      store.setSettings({ platform: { alertThreshold: 74 } }); // would break the gap → rejected
      assert.equal(st.settings.platform.alertThreshold, 55);
    },
  },
  {
    name: 'v3 settings defaults and normalisation (lang, appearance, calendar, motion, dataSource.last*)',
    fn() {
      const st = freshStore();
      assert.equal(st.settings.lang, 'ar');
      assert.deepEqual(st.settings.appearance, { background: 'subtle', density: 'comfortable' });
      assert.equal(st.settings.calendar, 'both');
      assert.equal(st.settings.motion, 'auto');
      assert.equal(st.settings.dataSource.lastSuccessAt, null);
      store.setSettings({ lang: 'fr', appearance: { background: 'neon', density: 'compact' }, calendar: 'hijri', motion: 'full' });
      assert.equal(st.settings.lang, 'ar');
      assert.deepEqual(st.settings.appearance, { background: 'subtle', density: 'compact' });
      store.setSettings({ lang: 'en', appearance: { background: 'cinematic' } });
      assert.equal(st.settings.lang, 'en');
      assert.equal(st.settings.appearance.background, 'cinematic');
      assert.equal(st.settings.calendar, 'hijri');
      store.recordDataSourceResult({ ok: false, code: 'timeout', message: 'م', messageEn: 'timed out' });
      assert.ok(st.settings.dataSource.lastErrorAt);
      assert.deepEqual(st.settings.dataSource.lastError, { code: 'timeout', message: 'م', messageEn: 'timed out' });
      const payload = store.persistPayload();
      assert.equal(payload.settings.lang, 'en');
      assert.equal(payload.settings.appearance.background, 'cinematic');
    },
  },
];
