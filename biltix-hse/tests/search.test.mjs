/** Register search is bilingual: an English query finds the same AI risks as its Arabic equivalent. */
import { assert, freshStore, psel, store, NOW } from './helpers.mjs';

const ids = (rows) => rows.map((r) => r.id).sort();

export const tests = [
  {
    name: 'English and Arabic searches find the same AI risks (titles, owners)',
    fn() {
      freshStore();
      const en = psel.filteredAiRisks(store.state, { search: 'excavation', range: 365 }, NOW);
      const ar = psel.filteredAiRisks(store.state, { search: 'حفر', range: 365 }, NOW);
      assert.ok(en.length > 0, 'English query finds risks');
      assert.deepEqual(ids(en), ids(ar));
      const risk = store.state.platform.aiRisks.find((r) => r && r.owner);
      const owner = psel.filteredAiRisks(store.state, { search: risk.owner, range: 365 }, NOW);
      assert.ok(owner.some((r) => r.id === risk.id), 'Arabic owner name still matches');
    },
  },
];
