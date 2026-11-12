/**
 * Go-live readiness (js/data/golive.js): readiness counts, connector catalogue coverage and order, week spans,
 * checklist sanitising / progress, ring geometry, architecture layout; and the 'golive' dictionary has every key
 * the data ids need, in both languages.
 */
import { assert, freshStore } from './helpers.mjs';

const gl = await import('../js/data/golive.js');
const dict = (await import('../js/i18n/golive.js')).default;
const { NAV_META, VIEW_ORDER } = await import('../js/views/index.js');

const get = (obj, path) => path.split('.').reduce((o, k) => (o && typeof o === 'object' ? o[k] : undefined), obj);

export const tests = [
  {
    name: 'readiness: 18 capabilities, counts per class, demoReady = built as demo + ready to connect',
    fn() {
      const r = gl.readiness();
      assert.equal(r.total, 18);
      // v3.8: offline (c11), QR (c12) and the 360° viewer (c14) exist as browser-only demos (field kit, #/spatial),
      // so they are "built as demo", not "planned" (3 + 3 built, 6 − 3 planned).
      assert.deepEqual(r.counts, { built_demo: 6, ready_connect: 4, needs_client: 5, planned: 3 });
      assert.equal(r.demoReady, 10);
      for (const id of ['c11', 'c12', 'c14']) assert.equal(gl.CAPABILITIES.find((c) => c.id === id).status, 'built_demo', id);
      assert.deepEqual(gl.readiness([{ status: 'planned' }, { status: 'bogus' }, null]).counts, { built_demo: 0, ready_connect: 0, needs_client: 0, planned: 1 });
      assert.equal(gl.readiness('x').total, 0);
      const ids = gl.CAPABILITIES.map((c) => c.id);
      assert.equal(new Set(ids).size, ids.length, 'unique ids');
      const routes = new Set(NAV_META.map((m) => m.id));
      gl.CAPABILITIES.forEach((c) => { if (c.route) assert.ok(routes.has(c.route), `${c.id} route ${c.route}`); });
    },
  },
  {
    name: 'connectors: every demo record is described once; the chain comes first in order',
    fn() {
      const state = freshStore();
      const recIds = [...state.integrations.map((r) => r.id), ...state.platform.connectors.map((r) => r.id)];
      for (const id of recIds) assert.ok(gl.connectorFor(id), `no plan entry for ${id}`);
      const all = gl.CONNECTORS.flatMap((c) => c.recIds);
      assert.equal(new Set(all).size, all.length, 'a record belongs to one entry only');
      const ordered = gl.orderedConnectors();
      assert.deepEqual(ordered.slice(0, 5).map((c) => c.key), ['dms', 'erp', 'p6', 'bim', 'pm']);
      assert.equal(gl.chainRank('biltix-dms'), 1);
      assert.equal(gl.chainRank('primavera-p6'), 3);
      assert.equal(gl.chainRank('slack'), 100);
      assert.equal(gl.connectorClass({ missing: true }), 'planned');
      assert.equal(gl.connectorClass(gl.connectorFor('cctv-ai')), 'planned');
      assert.equal(gl.connectorClass(gl.connectorFor('supabase')), 'built_demo');
      assert.equal(gl.connectorClass(gl.connectorFor('oracle-erp')), 'ready_connect');
      assert.equal(gl.connectorFor('nope'), null);
    },
  },
  {
    name: 'weekSpan / spanWeeks: inclusive weeks on a 40-week axis, clamped',
    fn() {
      assert.deepEqual(gl.weekSpan(1, 6, 40), { startPct: 0, widthPct: 15 });
      assert.deepEqual(gl.weekSpan(13, 26, 40), { startPct: 30, widthPct: 35 });
      const over = gl.weekSpan(35, 99, 40);
      assert.equal(over.startPct + over.widthPct, 100);
      assert.equal(gl.spanWeeks(13, 26), 14);
      assert.equal(gl.spanWeeks(5, 4), 0);
      gl.PRIORITIES.forEach((p) => p.steps.forEach((s) => assert.ok(s.start >= p.start && s.end <= p.end, `${p.key}.${s.id} inside ${p.key}`)));
    },
  },
  {
    name: 'checklist: sanitize keeps known ids set to true only; progress and ring geometry',
    fn() {
      const ids = gl.checklistIds();
      assert.equal(ids.length, 20);
      assert.deepEqual(gl.sanitizeChecklist('{"gov1":true,"gov2":"yes","zzz":true,"acc1":false}'), { gov1: true });
      assert.deepEqual(gl.sanitizeChecklist('not json'), {});
      assert.deepEqual(gl.sanitizeChecklist('[1,2]'), {});
      assert.deepEqual(gl.sanitizeChecklist(null), {});
      const p = gl.checklistProgress({ gov1: true, gov2: true, gov3: true, sec1: true });
      assert.equal(p.done, 4); assert.equal(p.total, 20); assert.equal(p.pct, 20);
      assert.deepEqual(p.byGroup.gov, { done: 3, total: 3 });
      assert.equal(gl.checklistProgress({}).pct, 0);
      const r = gl.ringDash(25, 10);
      assert.ok(Math.abs(r.circumference - 2 * Math.PI * 10) < 1e-9);
      assert.ok(Math.abs(r.offset - r.circumference * 0.75) < 1e-9);
      assert.equal(gl.ringDash(150, 10).offset, 0);
      assert.ok(Math.abs(gl.ringDash(-5, 10).offset - gl.ringDash(0, 10).circumference) < 1e-9);
    },
  },
  {
    name: 'archLayout: nine boxes inside the canvas, no overlaps, RTL mirrors x, edge feeds the bus',
    fn() {
      for (const mode of ['wide', 'narrow']) {
        for (const rtl of [false, true]) {
          const L = gl.archLayout(mode, rtl);
          const boxes = Object.entries(L.nodes);
          assert.equal(boxes.length, 9);
          for (const [id, b] of boxes) assert.ok(b.x >= 0 && b.y >= 0 && b.x + b.w <= L.W && b.y + b.h <= L.H, `${mode}/${rtl} ${id} inside`);
          for (let i = 0; i < boxes.length; i += 1) for (let j = i + 1; j < boxes.length; j += 1) {
            const a = boxes[i][1]; const b = boxes[j][1];
            const overlap = a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
            assert.ok(!overlap, `${mode} ${boxes[i][0]} × ${boxes[j][0]}`);
          }
          assert.equal(L.links.length, 8);
          const ev = L.links.find((l) => l.label === 'events');
          assert.deepEqual([ev.from, ev.to], ['edge', 'bus']);
          L.links.forEach((l) => assert.match(l.d, /^M[\d.]+ [\d.]+ /));
        }
        const ltr = gl.archLayout(mode, false); const rtl = gl.archLayout(mode, true);
        assert.equal(rtl.nodes.client.x, ltr.W - ltr.nodes.client.x - ltr.nodes.client.w);
      }
    },
  },
  {
    name: 'golive dictionary: every id has Arabic and English copy; the route is registered',
    fn() {
      const keys = [
        ...gl.GL_STATUSES.flatMap((s) => [`status.${s}`, `statusHint.${s}`]),
        ...gl.CAPABILITIES.flatMap((c) => ['name', 'today', 'needed'].map((f) => `cap.${c.id}.${f}`)),
        ...gl.CONNECTORS.flatMap((c) => ['name', 'purpose', 'protocol', 'freq', ...(c.wave === 1 ? ['entities', 'auth', 'prereq', 'risks', 'systems'] : ['notes'])].map((f) => `conn.${c.key}.${f}`)),
        ...gl.CONNECTORS.map((c) => `dir.${c.dir}`),
        ...gl.PHASES.flatMap((p) => ['name', 'deliverables', 'exit'].map((f) => `phase.${p.id}.${f}`)),
        ...gl.MILESTONES.map((m) => `ms.${m.id}`),
        ...gl.PRIORITIES.flatMap((p) => ['name', 'today', 'target', 'exit', 'ground', ...p.steps.map((s) => `steps.${s.id}`)].map((f) => `prio.${p.key}.${f}`)),
        ...gl.GROUND.flatMap((g) => ['name', 'i1'].map((f) => `ground.${g}.${f}`)),
        ...gl.CHECKLIST.flatMap((g) => [`checklist.groups.${g.id}`, ...g.items.map((i) => `checklist.items.${i}`)]),
        ...gl.ARCH_NODES.flatMap((n) => ['name', 'sub', 'tag'].map((f) => `arch.nodes.${n.id}.${f}`)),
        'strip.label', 'strip.value', 'strip.cta', 'strip.aria', 'strip.seg',
        'roadmap.notBuilt', 'roadmap.demoBuilt', 'roadmap.open', 'roadmap.openDemo',
      ];
      for (const lang of ['ar', 'en']) for (const k of keys) assert.equal(typeof get(dict[lang], k), 'string', `${lang}: ${k}`);
      assert.ok(VIEW_ORDER.includes('golive'));
      assert.equal(NAV_META.find((m) => m.id === 'golive').path, './golive.js');
      // 23 routes of v3.7 + #/golive (PLT-04) + #/fieldkit (FLD-01), each registered and listed in the rail order once.
      assert.equal(NAV_META.length, 25);
      for (const id of ['golive', 'fieldkit']) {
        assert.equal(NAV_META.filter((m) => m.id === id).length, 1, `${id} registered once`);
        assert.equal(VIEW_ORDER.filter((v) => v === id).length, 1, `${id} in the rail once`);
      }
      assert.deepEqual([...VIEW_ORDER].sort(), NAV_META.map((m) => m.id).sort(), 'rail order and registry hold the same ids');
    },
  },
];
