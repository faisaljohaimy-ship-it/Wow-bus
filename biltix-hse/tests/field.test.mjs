/**
 * Field layer (js/ui/qr.js, js/core/offline.js, sw.js, js/views/fieldkit.js registry):
 *   QR encoder against known vectors (reference matrices from an independent encoder, node-qrcode 1.5.4 with the
 *   same mask, each also decoded by jsQR 1.4.0 when generated), format-information BCH check, path output;
 *   payload builder / parser (opaque IDs, no personal data, foreign hosts refused); outbox ordering, idempotency,
 *   failure handling and persistence; the service worker's precache list is in sync with the files on disk.
 */
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { assert, freshStore, store } from './helpers.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const qr = await import('../js/ui/qr.js');
const off = await import('../js/core/offline.js');

/* Known vectors: rows of the module matrix (1 = dark), quiet zone excluded. */
const VECTORS = [
  { text: "BX1:Z:S1-Z2", ecl: 'M', mask: 6, rows: [
    '111111101010101111111',
    '100000101100001000001',
    '101110101000101011101',
    '101110100100101011101',
    '101110101110101011101',
    '100000100101101000001',
    '111111101010101111111',
    '000000000011100000000',
    '100111111010110010111',
    '001011000110100010101',
    '100010110000001101101',
    '101101001111000011010',
    '001010101100011100011',
    '000000001001100100110',
    '111111101100111011011',
    '100000101111110100011',
    '101110101011101010111',
    '101110101101100000100',
    '101110100010001011111',
    '100000100000011111010',
    '111111101011000010010',
  ] },
  { text: "BX1:M:CR-0871-01", ecl: 'Q', mask: 2, rows: [
    '111111101000001111111',
    '100000100101001000001',
    '101110100101101011101',
    '101110100001001011101',
    '101110101010001011101',
    '100000101100001000001',
    '111111101010101111111',
    '000000000000000000000',
    '011111110000000110001',
    '000110001110011110100',
    '101100111010110100100',
    '100010010111111000010',
    '110110111001101001000',
    '000000001110000010101',
    '111111101011010101000',
    '100000101110110010100',
    '101110101111010010101',
    '101110101010101010100',
    '101110101100000110000',
    '100000101110100000001',
    '111111100010100101100',
  ] },
  { text: "HELLO WORLD", ecl: 'Q', mask: 6, rows: [
    '111111100001001111111',
    '100000101100101000001',
    '101110100101101011101',
    '101110101111101011101',
    '101110101101001011101',
    '100000100100101000001',
    '111111101010101111111',
    '000000001101100000000',
    '010111101100111011010',
    '101111010000111101110',
    '001010110001001100000',
    '101101000101100011000',
    '110111111110111011111',
    '000000001000100101000',
    '111111100110011001111',
    '100000101010010010111',
    '101110101101001000111',
    '101110101011100010100',
    '101110100100001000011',
    '100000101110011100110',
    '111111100101000000010',
  ] },
];

/** Format information (ISO/IEC 18004 §7.9): 15 bits around the top-left finder, XOR 101010000010010. */
function formatInfo(m) {
  const bits = [];
  for (let c = 0; c <= 5; c += 1) bits.push(m[8][c]);
  bits.push(m[8][7], m[8][8], m[7][8]);
  for (let r = 5; r >= 0; r -= 1) bits.push(m[r][8]);
  const v = bits.reduce((acc, b) => (acc << 1) | (b ? 1 : 0), 0) ^ 0b101010000010010;
  // BCH(15,5): the 10-bit remainder of the data bits × x^10 must equal the low 10 bits.
  let rem = (v >> 10) << 10;
  for (let i = 14; i >= 10; i -= 1) if (rem & (1 << i)) rem ^= 0b10100110111 << (i - 10);
  return { ecl: ['M', 'L', 'H', 'Q'][v >> 13], mask: (v >> 10) & 7, bchOk: rem === (v & 0x3ff) };
}

export const tests = [
  {
    name: 'QR encoder matches the known vectors module for module',
    fn() {
      for (const v of VECTORS) {
        const m = qr.qrMatrix(v.text, { ecl: v.ecl });
        assert.equal(m.size, v.rows.length, v.text);
        assert.deepEqual(m.modules.map((r) => r.map((b) => (b ? 1 : 0)).join('')), v.rows, v.text);
        const f = formatInfo(m.modules);
        assert.ok(f.bchOk, `format BCH ${v.text}`);
        assert.equal(f.ecl, v.ecl, `ECL ${v.text}`);
        assert.equal(f.mask, v.mask, `mask ${v.text}`);
      }
    },
  },
  {
    name: 'QR encoder: version grows with length; finder patterns; path covers every dark module once',
    fn() {
      const long = qr.qrMatrix('https://biltix.example/#/fieldkit?code=BX1:M:CR-0871-01', { ecl: 'Q' });
      assert.ok(long.version >= 3 && long.size === long.version * 4 + 17);
      const m = qr.qrMatrix('BX1:P:PTW-5529', { ecl: 'Q' }).modules;
      const n = m.length;
      for (const [r0, c0] of [[0, 0], [0, n - 7], [n - 7, 0]]) {
        for (let i = 0; i < 7; i += 1) assert.ok(m[r0][c0 + i] && m[r0 + 6][c0 + i] && m[r0 + i][c0] && m[r0 + i][c0 + 6], 'finder ring');
        assert.ok(m[r0 + 3][c0 + 3], 'finder centre');
      }
      const d = qr.qrPath(m, 4);
      const dark = m.flat().filter(Boolean).length;
      const covered = [...d.matchAll(/h(\d+)v1/g)].reduce((s, x) => s + Number(x[1]), 0);
      assert.equal(covered, dark);
      assert.match(d, /^M\d+ \d+h\d+v1h-\d+z/);
    },
  },
  {
    name: 'payloads: builder and parser round-trip; short manual form, case and spaces accepted',
    fn() {
      assert.equal(qr.makePayload('zone', 's1-z2'), 'BX1:Z:S1-Z2');
      assert.equal(qr.makePayload('P', 'PTW-5529'), 'BX1:P:PTW-5529');
      assert.throws(() => qr.makePayload('X', 'S1'));
      assert.throws(() => qr.makePayload('Z', 'Ahmed Ali'));
      const p = qr.parsePayload('  bx1:m:cr-0871-01 ');
      assert.deepEqual(p, { ok: true, kind: 'M', type: 'material', id: 'CR-0871-01', payload: 'BX1:M:CR-0871-01' });
      assert.equal(qr.parsePayload('Z:S1-Z2').payload, 'BX1:Z:S1-Z2');
      assert.equal(qr.parsePayload('BX1:Z:S1‐Z2').payload, 'BX1:Z:S1-Z2'); // U+2010 hyphen from a phone keyboard
    },
  },
  {
    name: 'payloads: errors are classified; foreign hosts refused; same-origin URLs read ?code=',
    fn() {
      assert.equal(qr.parsePayload('').reason, 'empty');
      assert.equal(qr.parsePayload('BX2:Z:S1-Z2').reason, 'version');
      assert.equal(qr.parsePayload('BX1:Q:S1-Z2').reason, 'kind');
      assert.equal(qr.parsePayload('BX1:Z:').reason, 'format');
      assert.equal(qr.parsePayload('BX1:Z:محمد').reason, 'format');
      assert.equal(qr.parsePayload('BX1:Z:a@b.com').reason, 'format');
      assert.equal(qr.parsePayload('hello world').reason, 'format');
      const origin = 'https://biltix-risk-ai.vercel.app';
      const foreign = qr.parsePayload('https://evil.example/#/fieldkit?code=BX1:Z:S1-Z2', { origin });
      assert.equal(foreign.reason, 'foreign');
      assert.equal(foreign.host, 'evil.example');
      assert.equal(qr.parsePayload(`${origin}/#/fieldkit?code=BX1:Z:S1-Z2`, { origin }).payload, 'BX1:Z:S1-Z2');
      assert.equal(qr.parsePayload(`${origin}/?code=bx1:p:ptw-5529`, { origin }).payload, 'BX1:P:PTW-5529');
    },
  },
  {
    name: 'label registry: every payload is an opaque ID (no personal data) and unique',
    async fn() {
      const state = freshStore();
      const { buildRegistry, CRATES, materialStatus } = await import('../js/views/fieldkit.js');
      const labels = buildRegistry(state);
      assert.ok(labels.length > 40);
      const payloads = labels.map((l) => l.payload);
      assert.equal(new Set(payloads).size, payloads.length, 'unique payloads');
      const people = [...new Set([...state.permits.flatMap((p) => [p.requester, p.approver]), ...state.risks.map((r) => r.owner)].filter(Boolean))];
      for (const p of payloads) {
        assert.match(p, qr.QR_PAYLOAD_RE);
        assert.ok(p.length <= 40, p);
        for (const name of people) assert.ok(!p.includes(name), `${p} contains a name`);
      }
      for (const k of ['Z', 'E', 'M', 'P']) assert.ok(labels.some((l) => l.k === k), `kind ${k}`);
      assert.ok(payloads.includes('BX1:Z:S1-Z2') && payloads.includes('BX1:E:S1-TC-2') && payloads.includes('BX1:M:CR-0871-01') && payloads.includes('BX1:P:PTW-5529'));
      const ms = materialStatus(state, CRATES[0]);
      assert.equal(ms.approved, false, 'no approved submittal → do not install');
      assert.equal(ms.po, 'PO-S1-2026-0871');
    },
  },
  {
    name: 'outbox: FIFO replay, idempotent enqueue and replay, failures kept and retried',
    async fn() {
      let clock = Date.parse('2026-11-10T06:00:00Z');
      const outbox = off.createOutbox({ storage: off.memoryStorage(), now: () => new Date(clock += 1000) });
      const applied = [];
      let failOnce = true;
      const apply = (e) => {
        if (e.kind === 'task.status' && failOnce) { failOnce = false; return { ok: false, reason: 'conflict', message: 'conflict' }; }
        applied.push(e.key);
        return { ok: true };
      };
      const a = await outbox.enqueue('alert.ack', { alertId: 'AL7' }, { key: off.idemKey('alert.ack', 'AL7') });
      await outbox.enqueue('risk.add', { risk: { hazard: 'x' } }, { key: 'risk.add:one' });
      await outbox.enqueue('task.status', { taskId: 'MT3', to: 'قيد التنفيذ' }, { key: off.idemKey('task.status', 'MT3', 'start') });
      await outbox.enqueue('checklist.tick', { inspectionId: 'N15', item: 0 }, { key: off.idemKey('checklist.tick', 'N15', 0) });
      assert.equal(a.duplicate, false);
      assert.equal(a.entry.key, 'alert.ack:AL7');
      const dup = await outbox.enqueue('alert.ack', { alertId: 'AL7' }, { key: 'alert.ack:AL7' });
      assert.equal(dup.duplicate, true);
      assert.equal(outbox.count(), 4);
      assert.deepEqual(outbox.pending().map((e) => e.seq), [1, 2, 3, 4]);
      const r1 = await outbox.replay(apply);
      assert.deepEqual(r1, { applied: 3, skipped: 0, failed: 1 });
      assert.deepEqual(applied, ['alert.ack:AL7', 'risk.add:one', 'checklist.tick:N15:0'], 'applied in queue order, the failure skipped over');
      assert.equal(outbox.failedCount(), 1);
      const failed = outbox.list().find((e) => e.status === 'failed');
      assert.equal(failed.error, 'conflict');
      const r2 = await outbox.replay(apply);
      assert.deepEqual(r2, { applied: 1, skipped: 0, failed: 0 }, 'only the failed entry is retried');
      const r3 = await outbox.replay(apply);
      assert.deepEqual(r3, { applied: 0, skipped: 0, failed: 0 }, 'nothing applies twice');
      assert.equal(applied.length, 4);
      assert.equal((await outbox.enqueue('alert.ack', {}, { key: 'alert.ack:AL7' })).duplicate, true, 'a synced key stays known');
      await outbox.clearSynced();
      assert.equal(outbox.list().length, 0);
      assert.equal((await outbox.enqueue('alert.ack', {}, { key: 'alert.ack:AL7' })).duplicate, true, 'applied keys survive clearing the list');
      await assert.rejects(() => outbox.enqueue('delete.everything', {}));
    },
  },
  {
    name: 'outbox: persisted order and keys survive a reload; concurrent replays apply once',
    async fn() {
      const storage = off.memoryStorage();
      const first = off.createOutbox({ storage });
      await first.enqueue('alert.ack', { alertId: 'AL1' }, { key: 'k1' });
      await first.enqueue('alert.ack', { alertId: 'AL2' }, { key: 'k2' });
      const second = off.createOutbox({ storage });
      await second.ready();
      assert.deepEqual(second.pending().map((e) => e.key), ['k1', 'k2']);
      await second.enqueue('alert.ack', { alertId: 'AL3' }, { key: 'k3' });
      assert.deepEqual(second.list().map((e) => e.seq), [1, 2, 3]);
      let calls = 0;
      const slow = async () => { calls += 1; await new Promise((r) => setTimeout(r, 5)); return { ok: true }; };
      const [x, y] = await Promise.all([second.replay(slow), second.replay(slow)]);
      assert.equal(calls, 3);
      assert.deepEqual(x, y);
      const third = off.createOutbox({ storage });
      await third.ready();
      assert.equal(third.count(), 0);
      assert.ok(third.has('k2'));
    },
  },
  {
    name: 'outbox applied to the store: ack, task start with conflict check, checklist tick, risk add',
    async fn() {
      freshStore();
      const alert = store.state.platform.alerts.find((a) => !a.acknowledged);
      const task = store.state.platform.tasks.find((t) => t.status === 'جديدة');
      const insp = store.state.inspections.find((x) => x.id === 'N15');
      const before = { done: insp.checklistDone, risks: store.state.risks.length };
      // The same apply handler the app uses (js/core/offline.js storeApplier), on a local outbox.
      const outbox = off.createOutbox({ storage: off.memoryStorage() });
      await outbox.enqueue('alert.ack', { alertId: alert.id }, { key: off.idemKey('alert.ack', alert.id) });
      await outbox.enqueue('task.status', { taskId: task.id, from: 'متأخرة', to: 'قيد التنفيذ' }, { key: 'stale' });
      await outbox.enqueue('task.status', { taskId: task.id, from: task.status, to: 'قيد التنفيذ' }, { key: 'fresh' });
      await outbox.enqueue('checklist.tick', { inspectionId: 'N15', item: 0 }, { key: 'tick0' });
      await outbox.enqueue('risk.add', { risk: { siteId: 'S1', zoneId: 'S1-Z2', categoryId: 'lifting', hazard: 'حمولة معلقة فوق ممر', likelihood: 3, severity: 4 } }, { key: 'r1' });
      const apply = off.storeApplier(store);
      const res = await outbox.replay(apply);
      assert.deepEqual(res, { applied: 4, skipped: 0, failed: 1 });
      assert.equal(store.state.platform.alerts.find((a) => a.id === alert.id).acknowledged, true);
      assert.equal(store.state.platform.tasks.find((t) => t.id === task.id).status, 'قيد التنفيذ');
      assert.equal(store.state.inspections.find((x) => x.id === 'N15').checklistDone, before.done + 1);
      assert.equal(store.state.risks.length, before.risks + 1);
      assert.equal(outbox.list().find((e) => e.key === 'stale').status, 'failed', 'a stale transition overwrites nothing');
    },
  },
  {
    name: 'service worker: precache list matches the files on disk, never the MP4s; versioned caches',
    async fn() {
      const { precacheList, renderBlock } = await import('../tools/sw-precache.mjs');
      const sw = readFileSync(`${root}/sw.js`, 'utf8');
      assert.ok(sw.includes(renderBlock(precacheList())), 'sw.js PRECACHE is out of date: run node tools/sw-precache.mjs');
      const list = precacheList();
      for (const f of list) if (f !== './') assert.ok(existsSync(`${root}/${f}`), f);
      assert.ok(!list.some((f) => /\.mp4$/.test(f)));
      for (const must of ['js/app.js', 'js/views/fieldkit.js', 'js/i18n/fieldkit.js', 'css/field.css', 'js/vendor/qrcode-generator.js', 'assets/fonts/plex-arabic-arabic-400.woff2', 'assets/video/explainer-ar-poster.webp']) assert.ok(list.includes(must), must);
      assert.match(sw, /biltix-shell-\$\{VERSION\}/);
      assert.match(sw, /searchParams\.has\('build-check'\)/);
      const html = readFileSync(`${root}/index.html`, 'utf8');
      assert.match(html, /<meta name="biltix-build" content="[^"]+">/);
      const vercel = JSON.parse(readFileSync(`${root}/vercel.json`, 'utf8'));
      const swHeaders = vercel.headers.find((x) => x.source === '/sw.js');
      assert.ok(swHeaders && swHeaders.headers.some((x) => x.key === 'Cache-Control' && /no-cache/.test(x.value)));
    },
  },
  {
    name: 'no service worker in node tests or under automation without an opt-in',
    fn() {
      assert.equal(off.swSkipReason(), 'unsupported');
    },
  },
];
