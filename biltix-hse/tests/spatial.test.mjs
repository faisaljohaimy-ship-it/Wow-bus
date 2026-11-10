/**
 * Spatial view data (js/data/spatial-seed.js): cameras and site plans are consistent with the seed, every
 * position lies inside the plan (and inside its own zone), and the zone links equal the counts the shared
 * selectors give the registers (one definition per metric). PPE boxes only follow PPE feed events of the zone.
 */
import { assert, NOW, freshStore, sel } from './helpers.mjs';
import * as SP from '../js/data/spatial-seed.js';

const CLOSED = 'مغلق';
const filtersFor = (st, siteId) => ({ ...(st.filters || {}), siteId, search: '', range: Number((st.filters || {}).range) > 0 ? Number(st.filters.range) : 30 });
const inZone = (list, siteId, zoneId) => list.filter((r) => r && r.siteId === siteId && r.zoneId === zoneId);

export const tests = [
  {
    name: 'every camera has a unique Latin code, an existing site and zone, and a known scene preset',
    fn() {
      const st = freshStore();
      const ids = new Set();
      for (const cam of SP.CAMERAS) {
        assert.match(cam.id, /^CAM-S\d-\d{2}$/, `${cam.id} is a Latin camera code`);
        assert.ok(!ids.has(cam.id), `${cam.id} is unique`);
        ids.add(cam.id);
        const site = st.sites.find((s) => s.id === cam.siteId);
        assert.ok(site, `${cam.id}: site ${cam.siteId} exists`);
        assert.ok(site.zones.some((z) => z.id === cam.zoneId), `${cam.id}: zone ${cam.zoneId} exists in ${cam.siteId}`);
        assert.ok(cam.id.startsWith(`CAM-${cam.siteId}-`), `${cam.id} is numbered inside its site`);
        assert.ok(SP.SCENES.includes(cam.scene), `${cam.id}: scene ${cam.scene} is a renderer preset`);
        assert.equal(cam.simulated, true, `${cam.id} is a simulated record`);
        assert.equal(cam.connected, false, `${cam.id} is not connected`);
        for (const k of ['heading', 'fov', 'mountHeight']) assert.ok(Number.isFinite(cam[k]), `${cam.id}.${k} is a number`);
        assert.ok(cam.fov >= 40 && cam.fov <= 110 && cam.mountHeight > 0 && cam.mountHeight <= 30, `${cam.id}: plausible optics`);
        assert.ok(cam.purpose && cam.purposeEn && !/[؀-ۿ]/.test(cam.purposeEn), `${cam.id}: Arabic purpose with an English mirror`);
      }
      for (const site of st.sites) assert.ok(SP.camerasFor(site.id).length >= 4, `${site.id} has cameras`);
    },
  },
  {
    name: 'camera positions are inside the plan and inside their own zone; plan features stay inside the site',
    fn() {
      const st = freshStore();
      const { inner, width, height } = SP.PLAN;
      for (const cam of SP.CAMERAS) {
        assert.ok(cam.x >= 0 && cam.x <= 1 && cam.y >= 0 && cam.y <= 1, `${cam.id} normalised position`);
        const p = SP.toPlan(cam.x, cam.y);
        assert.ok(p.x >= inner.x && p.x <= inner.x + inner.w && p.y >= inner.y && p.y <= inner.y + inner.h, `${cam.id} inside the site boundary on the plan`);
        assert.ok(p.x > 0 && p.x < width && p.y > 0 && p.y < height, `${cam.id} inside the drawing`);
        const zone = st.sites.find((s) => s.id === cam.siteId).zones.find((z) => z.id === cam.zoneId);
        assert.ok(SP.inZone(zone, cam.x, cam.y), `${cam.id} sits inside its zone ${cam.zoneId}`);
        assert.ok(cam.heading >= 0 && cam.heading < 360, `${cam.id} heading in [0, 360)`);
      }
      const inUnit = ([x, y]) => x >= 0 && x <= 1 && y >= 0 && y <= 1;
      for (const site of st.sites) {
        const plan = SP.planFor(site.id);
        assert.ok(plan, `${site.id} has a plan`);
        assert.ok(plan.widthM > 0, `${site.id} has a scale`);
        const zoneIds = new Set(site.zones.map((z) => z.id));
        for (const fp of plan.footprints || []) { assert.ok(fp.poly.every(inUnit), `${fp.id} inside the site`); assert.ok(zoneIds.has(fp.zoneId), `${fp.id} zone exists`); assert.ok(fp.labelEn, `${fp.id} English label`); }
        for (const st2 of plan.structures || []) { const [x, y, w, h] = st2.rect; assert.ok(inUnit([x, y]) && inUnit([x + w, y + h]), `${site.id} structure inside the site`); assert.ok(zoneIds.has(st2.zoneId)); if (st2.label) assert.ok(st2.labelEn); }
        for (const c of plan.cranes || []) assert.ok(inUnit([c.x, c.y]), `${site.id} ${c.id} inside the site`);
        for (const g of plan.gates || []) { assert.ok(inUnit([g.x, g.y]), `${site.id} gate on the boundary`); assert.ok(g.labelEn); }
        for (const r of plan.roads || []) assert.ok(r.every(inUnit), `${site.id} road inside the site`);
        // marker placement for sensors stays inside the zone
        for (const s of st.sensors.filter((x) => x.siteId === site.id)) {
          const z = site.zones.find((zz) => zz.id === s.zoneId);
          assert.ok(z, `${s.id} zone exists`);
          const p = SP.markerPoint(z, s.id, 0);
          assert.ok(SP.inZone(z, p.x, p.y), `${s.id} marker inside ${z.id}`);
        }
      }
    },
  },
  {
    name: 'zone link counts equal the shared selector / store counts for every zone (one definition per metric)',
    fn() {
      const st = freshStore();
      let totalRisks = 0;
      for (const site of st.sites) {
        const f = filtersFor(st, site.id);
        const regRisks = sel.filteredRisks(st, f, NOW);
        const regPermits = sel.filteredPermits(st, f, NOW);
        const regIncidents = sel.filteredIncidents(st, f, NOW);
        const regInspections = sel.filteredInspections(st, f, NOW);
        let siteSum = 0;
        for (const z of site.zones) {
          const lk = SP.zoneLinks(st, site.id, z.id, { sel, now: NOW });
          assert.equal(lk.counts.risks, inZone(regRisks, site.id, z.id).length, `${z.id} risks = register rows`);
          assert.equal(lk.counts.openRisks, inZone(st.risks, site.id, z.id).filter((r) => r.status !== CLOSED).length, `${z.id} open risks = store`);
          const todayStart = new Date(NOW.getFullYear(), NOW.getMonth(), NOW.getDate()).getTime();
          assert.equal(lk.counts.overdueRisks, inZone(st.risks, site.id, z.id).filter((r) => sel.isOverdueRisk(r, todayStart)).length, `${z.id} overdue = sel.isOverdueRisk`);
          assert.equal(lk.counts.sensors, inZone(st.sensors, site.id, z.id).length, `${z.id} sensors = store`);
          assert.equal(lk.counts.cameras, SP.CAMERAS.filter((c) => c.siteId === site.id && c.zoneId === z.id).length, `${z.id} cameras`);
          assert.equal(lk.counts.permits, inZone(regPermits, site.id, z.id).filter((p) => p.status !== CLOSED).length, `${z.id} open permits = register`);
          assert.equal(lk.counts.incidents, inZone(regIncidents, site.id, z.id).length, `${z.id} incidents = register (period)`);
          assert.equal(lk.counts.inspections, inZone(regInspections, site.id, z.id).length, `${z.id} inspections = register`);
          siteSum += lk.counts.risks;
        }
        // nothing falls between zones: every register row of the site has a zone of the site
        assert.equal(siteSum, regRisks.length, `${site.id}: zone risks add up to the site register`);
        totalRisks += siteSum;
      }
      assert.ok(totalRisks > 0);
      // every HSE record with a zone points at a zone of its own site
      for (const coll of ['risks', 'incidents', 'permits', 'inspections', 'sensors']) {
        for (const r of st[coll]) {
          if (!r.zoneId) continue;
          const site = st.sites.find((s) => s.id === r.siteId);
          assert.ok(site && site.zones.some((z) => z.id === r.zoneId), `${coll} ${r.id}: zone ${r.zoneId} exists in ${r.siteId}`);
        }
      }
    },
  },
  {
    name: 'illustrative PPE boxes only follow PPE non-compliance feed events of the camera zone',
    fn() {
      const st = freshStore();
      const cam = SP.cameraById('CAM-S1-03');
      const site = st.sites.find((s) => s.id === 'S1');
      const zone = site.zones.find((z) => z.id === cam.zoneId);
      const other = site.zones.find((z) => z.id === 'S1-Z4');
      const ev = (o) => ({ id: `F-${Math.random().toString(36).slice(2)}`, ts: '2026-11-10T08:58:00+03:00', simulated: true, sourceId: 'cctv-ai', siteId: 'S1', ...o });
      st.feed = [
        ev({ type: 'ppe', tone: 'serious', title: `كاميرا ذكية: رصد عامل بدون خوذة — ${zone.name.replace('2', '٢')}` }),      // Arabic-Indic digits in the sentence
        ev({ type: 'ppe', tone: 'good', title: `كاميرا ذكية: التزام كامل بمعدات الوقاية — ${zone.name}` }),                   // compliance: no box
        ev({ type: 'ppe', tone: 'warning', title: `كاميرا ذكية: سترة عاكسة مفقودة قرب طريق المعدات — ${other.name}` }),       // other zone
        ev({ type: 'sensor', tone: 'warning', title: `قراءة سرعة الرياح — ${zone.name}` }),                                   // not PPE
        ev({ type: 'ppe', tone: 'warning', siteId: 'S2', title: `كاميرا ذكية: سترة عاكسة مفقودة — ${zone.name}` }),            // other site
        ev({ type: 'ppe', tone: 'warning', title: 'Smart camera: missing hi-vis vest — Tower crane 2', titleEn: 'Smart camera: missing hi-vis vest — Tower crane 2' }),
      ];
      const got = SP.ppeEventsFor(st, cam, { zoneNameEn: 'Tower crane 2' });
      assert.deepEqual(got.map((g) => g.item), ['helmet', 'vest']);
      assert.ok(got.every((g) => g.simulated === true));
      assert.deepEqual(SP.ppeEventsFor(st, SP.cameraById('CAM-S1-05')).map((g) => g.item), ['vest'], 'the laydown-yard camera only sees its own zone');
      // zone names are unambiguous inside a site (no name contains another), so the text match cannot cross zones
      for (const s of st.sites) for (const a of s.zones) for (const b of s.zones) if (a !== b) assert.ok(!a.name.includes(b.name), `${a.id} / ${b.id}`);
      st.feed = [];
      assert.deepEqual(SP.ppeEventsFor(st, cam), [], 'no feed event → no box');
    },
  },
  {
    name: 'AI-risk site-map target: own zone, then the named HSE register risk, then the site; never a guess',
    fn() {
      const st = freshStore();
      const air = st.platform.aiRisks;
      const ar4 = air.find((r) => r.id === 'AR4');
      assert.ok(ar4, 'AR4 seed risk');
      const t4 = SP.spatialTargetForAiRisk(st, ar4);
      const r1001 = st.risks.find((r) => r.code === 'R-1001');
      assert.deepEqual(t4, { site: r1001.siteId, zone: r1001.zoneId, risk: r1001.id, via: 'R-1001' });
      const cost = air.find((r) => r.category === 'cost');
      assert.equal(SP.spatialTargetForAiRisk(st, cost), null, 'non-site domains get no map link');
      const siteOnly = { id: 'X', projectId: 'S3', category: 'site', title: 'no code here' };
      assert.deepEqual(SP.spatialTargetForAiRisk(st, siteOnly), { site: 'S3' });
      assert.deepEqual(SP.spatialTargetForAiRisk(st, { projectId: 'S2', zoneId: 'S2-Z4', category: 'bom' }), { site: 'S2', zone: 'S2-Z4' });
      assert.equal(SP.spatialTargetForAiRisk(st, { projectId: 'S9', category: 'site' }), null, 'unknown site → no link');
      assert.deepEqual(SP.spatialParams({ site: 'S1', zone: 'S1-Z2', camera: 'CAM-S1-03' }), { site: 'S1', zone: 'S1-Z2', camera: 'CAM-S1-03', risk: null });
    },
  },
];
