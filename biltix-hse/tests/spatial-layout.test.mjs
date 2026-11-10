/**
 * Spatial view, plan furniture and feed linking (js/data/spatial-seed.js, js/data/live.js):
 *   - zone codes, badges and names are placed inside their zone and cover no camera, building outline or plant
 *     (both languages; widths approximated here, measured with the page fonts in the browser);
 *   - camera hit areas meet the touch size and close neighbours split the space instead of stacking;
 *   - live-engine feed events carry the zoneId of the zone their sentence names, and PPE matching uses it first.
 */
import { assert, freshStore, store, bus } from './helpers.mjs';
import * as SP from '../js/data/spatial-seed.js';

const { live } = await import('../js/data/live.js');
const en = (await import('../js/i18n/data/hse.js')).default;

const overlap = (a, b) => Math.max(0, Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0)) * Math.max(0, Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0));
const zoneRect = (z) => { const { inner } = SP.PLAN; return { x0: inner.x + z.x * inner.w, y0: inner.y + z.y * inner.h, x1: inner.x + (z.x + z.w) * inner.w, y1: inner.y + (z.y + z.h) * inner.h }; };
const enZoneNames = (site) => ((en.sites || {})[site.id] || {}).zones || [];

export const tests = [
  {
    name: 'zone labels: codes, badges and names sit inside their zone and never on a camera or a building outline (ar, en)',
    fn() {
      const st = freshStore();
      for (const site of st.sites) {
        for (const lang of ['ar', 'en']) {
          const names = site.zones.map((z, i) => (lang === 'en' ? (enZoneNames(site)[i] || {}).name : null) || z.name);
          const obstacles = SP.planObstacles(site.id, site, { sensors: st.sensors, isEn: lang === 'en' });
          const obstaclesNarrow = SP.planObstacles(site.id, site, { sensors: st.sensors, isEn: lang === 'en', narrow: true });
          const lay = SP.layoutZoneLabels(site, names, { obstacles, obstaclesNarrow });
          const camBodies = SP.camerasFor(site.id).map((c) => { const p = SP.toPlan(c.x, c.y); const r = SP.LABEL.cam.body; return { x0: p.x - r, y0: p.y - r, x1: p.x + r, y1: p.y + r }; });
          const edges = obstacles.filter((o) => o.k === 'edge');
          site.zones.forEach((z, i) => {
            const L = lay.get(z.id);
            const zr = zoneRect(z);
            assert.ok(L && L.name, `${site.id}/${lang} ${z.id} has a label`);
            const nm = L.name.rect;
            assert.ok(nm.x0 >= zr.x0 && nm.x1 <= zr.x1 && nm.y0 >= zr.y0 && nm.y1 <= zr.y1, `${site.id}/${lang} ${z.id}: name inside the zone`);
            for (const c of camBodies) assert.equal(overlap(nm, c), 0, `${site.id}/${lang} ${z.id}: name "${L.name.lines.join(' / ')}" covers a camera`);
            for (const e of edges) assert.equal(overlap(nm, e), 0, `${site.id}/${lang} ${z.id}: name "${L.name.lines.join(' / ')}" crosses a building outline`);
            const code = { x0: L.code.x - 2, y0: L.code.y - SP.LABEL.code.ascent, x1: L.code.x + 18, y1: L.code.y + 3 };
            for (const c of camBodies) assert.equal(overlap(code, c), 0, `${site.id} ${z.id}: zone code under a camera`);
            const b = { x0: L.badge.cx - 13, y0: L.badge.cy - 13, x1: L.badge.cx + 13, y1: L.badge.cy + 13 };
            assert.ok(b.x0 >= zr.x0 && b.x1 <= zr.x1 && b.y0 >= zr.y0 && b.y1 <= zr.y1, `${site.id} ${z.id}: badge inside the zone`);
            for (const c of camBodies) assert.equal(overlap(b, c), 0, `${site.id} ${z.id}: badge under a camera`);
            assert.equal(overlap(b, nm), 0, `${site.id} ${z.id}: badge on the name`);
            // the full name is kept for the accessible name and the table even when the plan shows a short one
            assert.equal(L.name.full, names[i]);
            if (!L.name.shortened) assert.equal(L.name.lines.join(' ').replace(' — ', ' — '), names[i].split(/\s+/).join(' '));
          });
        }
      }
    },
  },
  {
    name: 'camera hit areas: the full radius for lone cameras; close neighbours split along the bisector',
    fn() {
      const r = 40;
      const cams = [{ id: 'a', x: 100, y: 100 }, { id: 'b', x: 133, y: 100 }, { id: 'c', x: 400, y: 300 }];
      const polys = SP.hitPolygons(cams, r);
      const ext = (id, axis, f) => f(...polys.get(id).map((p) => p[axis]));
      assert.ok(Math.abs(ext('c', 0, Math.max) - r) < 0.5 && Math.abs(ext('c', 1, Math.min) + r) < 0.5, 'lone camera keeps its circle');
      assert.ok(ext('a', 0, Math.max) <= 16.5 - 0.9, 'a stops before the midpoint towards b');
      assert.ok(ext('b', 0, Math.min) >= -16.5 + 0.9, 'b stops before the midpoint towards a');
      // a still spans the full height (2r) so a 24 px target fits on the side away from its neighbour
      assert.ok(ext('a', 1, Math.max) - ext('a', 1, Math.min) > 2 * r - 1);
      // seeded cameras closer than 60 plan units in pairs: their split areas do not overlap
      for (const site of ['S1', 'S2', 'S3', 'S4', 'S5', 'S6']) {
        const list = SP.camerasFor(site).map((c) => { const p = SP.toPlan(c.x, c.y); return { id: c.id, x: p.x, y: p.y }; });
        const P = SP.hitPolygons(list, 43);
        for (const A of list) for (const B of list) {
          if (A === B) continue;
          const d = Math.hypot(B.x - A.x, B.y - A.y);
          const ux = (B.x - A.x) / d; const uy = (B.y - A.y) / d;
          for (const p of P.get(A.id)) assert.ok(p[0] * ux + p[1] * uy <= d / 2 + 1e-6, `${A.id} hit area crosses into ${B.id}`);
        }
      }
    },
  },
  {
    name: 'live feed events name their zone structurally (zoneId) and PPE matching prefers it over the sentence',
    fn() {
      freshStore();
      live.start({ store, bus });
      live.stop();
      for (let i = 0; i < 300; i += 1) live.tick();
      const feed = store.state.feed.filter((e) => e.simulated && e.zoneId);
      assert.ok(feed.length >= 20, `events with a zoneId: ${feed.length}`);
      const digits = (s) => String(s).replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660)).replace(/‑/g, '-');
      for (const ev of feed) {
        const site = store.state.sites.find((s) => s.id === ev.siteId);
        assert.ok(site, `${ev.id}: site`);
        const zone = site.zones.find((z) => z.id === ev.zoneId);
        assert.ok(zone, `${ev.id}: zone ${ev.zoneId} belongs to ${ev.siteId}`);
        if (ev.type === 'ppe') assert.ok(digits(ev.title).includes(digits(zone.name)), `${ev.id}: PPE sentence names ${zone.name}: ${ev.title}`);
      }
      // structural first: a zoneId that disagrees with the sentence wins; no zoneId falls back to the sentence
      const st = store.state;
      const cam = SP.cameraById('CAM-S1-03');
      const z2 = st.sites.find((s) => s.id === 'S1').zones.find((z) => z.id === 'S1-Z2');
      const base = { type: 'ppe', tone: 'serious', siteId: 'S1', simulated: true, ts: '2026-11-10T08:59:00+03:00' };
      st.feed = [
        { ...base, id: 'P1', zoneId: 'S1-Z4', title: `كاميرا ذكية: رصد عامل بدون خوذة — ${z2.name}` },
        { ...base, id: 'P2', zoneId: 'S1-Z2', title: 'كاميرا ذكية: عامل على ارتفاع دون حزام أمان مربوط — الموقع' },
        { ...base, id: 'P3', title: `كاميرا ذكية: سترة عاكسة مفقودة — ${z2.name}` },
      ];
      assert.deepEqual(SP.ppeEventsFor(st, cam).map((e) => `${e.id}:${e.item}`), ['P2:harness', 'P3:vest']);
    },
  },
  {
    name: 'camera records carry numeric optics so the view localises digits and units (lens in mm)',
    fn() {
      for (const cam of SP.CAMERAS) {
        assert.ok(Number.isFinite(cam.lensMm) && cam.lensMm > 0 && cam.lensMm < 50, `${cam.id} lensMm`);
        assert.equal(cam.lens, undefined, `${cam.id}: no preformatted "4 mm" string`);
      }
    },
  },
];
