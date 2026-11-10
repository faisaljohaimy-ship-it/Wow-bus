/** Live engines: every generated event is bilingual (no Arabic in the English copy) and labelled simulated. */
import { assert, freshStore, store, bus, ARABIC } from './helpers.mjs';

const { live } = await import('../js/data/live.js');
const { platformLive } = await import('../js/data/platform-live.js');

export const tests = [
  {
    name: 'HSE engine: 200 feed events carry titleEn/detailEn without Arabic and simulated: true',
    fn() {
      freshStore();
      live.start({ store, bus });
      live.stop();
      for (let i = 0; i < 250; i += 1) live.tick();
      const feed = store.state.feed.filter((e) => e.simulated);
      assert.ok(feed.length >= 100);
      for (const ev of feed) {
        assert.ok(ev.titleEn, `${ev.type}: ${ev.title}`);
        assert.ok(!ARABIC.test(ev.titleEn) && !ARABIC.test(ev.detailEn || ''), `${ev.titleEn} | ${ev.detailEn}`);
      }
    },
  },
  {
    name: 'platform engine: events bilingual; connector and write-back copy says simulated',
    fn() {
      freshStore();
      platformLive.start({ store, bus });
      platformLive.stop();
      for (let i = 0; i < 120; i += 1) platformLive.tick();
      for (const kind of ['connector', 'writeback', 'validation', 'ai', 'task']) platformLive.tick(kind);
      for (const ev of store.state.feed) {
        assert.ok(ev.titleEn !== undefined, ev.title);
        assert.ok(!ARABIC.test(ev.titleEn || '') && !ARABIC.test(ev.detailEn || ''), `${ev.titleEn} | ${ev.detailEn}`);
        if (ev.type === 'connector' || ev.type === 'writeback') assert.ok(/^Simulated/i.test(ev.titleEn) && /محاكاة/.test(ev.title), ev.titleEn);
        assert.ok(!/succeeded|successfully|connected to/i.test(ev.titleEn), ev.titleEn);
      }
    },
  },
  {
    name: 'engine detections: L × I × 4, bilingual record, owner unassigned (not invented), stated SLA due date',
    fn() {
      freshStore();
      platformLive.start({ store, bus });
      platformLive.stop();
      for (const c of ['contract', 'bom', 'schedule', 'site', 'cost']) {
        const r = platformLive.detectRisk(c);
        assert.ok(r && r.id, c);
        assert.equal(r.score, r.likelihood * r.impact * 4);
        assert.equal(r.owner, null);
        assert.ok(/^\d{4}-\d{2}-\d{2}$/.test(r.dueDate));
        for (const v of [r.titleEn, r.driverExplanationEn, r.recommendation.actionEn, r.recommendation.impactEn, r.evidence.excerptEn]) assert.ok(v && !ARABIC.test(v), `${c}: ${v}`);
        assert.equal(r.origin, 'engine');
      }
    },
  },
  {
    name: 'near-miss records created at runtime carry their English copy (title, description, location, action)',
    fn() {
      freshStore();
      live.start({ store, bus });
      live.stop();
      for (let i = 0; i < 6; i += 1) {
        const inc = live.triggerNearMiss();
        assert.ok(inc && inc.id);
        for (const v of [inc.titleEn, inc.descriptionEn, inc.locationEn, inc.immediateCauseEn, inc.actions[0].textEn]) assert.ok(v && !ARABIC.test(v), v);
        assert.ok(store.state.feed[0].titleEn && !ARABIC.test(store.state.feed[0].titleEn));
      }
    },
  },
];
