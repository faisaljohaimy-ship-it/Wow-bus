/** Import preview with per-row validation errors before commit; honest connection tests. */
import { assert, freshStore, store, sources } from './helpers.mjs';

const CSV = [
  'الكود,الموقع,الفئة,الخطر,الاحتمالية,الشدة,المالك,تاريخ الاستحقاق,الحالة',
  'R-9001,RUH-01,العمل على ارتفاعات,سقوط من حافة,4,5,م. سارة القحطاني,2026-12-01,مفتوح',
  'R-9002,XXX-99,الكهرباء,صعق كهربائي,9,3,,not-a-date,مفتوح',
  'R-9003,JED-02,,,,,,,',
  'R-9001,NEOM-03,الحرارة,إجهاد حراري,3,3,م. لمى العنزي,2026-12-05,قيد المعالجة',
].join('\n');

export const tests = [
  {
    name: 'importPreview flags every invalid row with field-level bilingual errors and stores nothing',
    fn() {
      const st = freshStore();
      const n = st.risks.length;
      const pv = sources.importPreview({ text: CSV, fileName: 'risks.csv' });
      assert.equal(pv.total, 4);
      assert.equal(pv.validCount, 1);
      assert.equal(pv.invalidCount, 3);
      const fields = (row) => pv.errors.filter((e) => e.row === row).map((e) => e.field).sort();
      assert.deepEqual(fields(3), ['dueDate', 'likelihood', 'siteId']);
      assert.ok(fields(4).includes('hazard') && fields(4).includes('likelihood') && fields(4).includes('dueDate'));
      assert.deepEqual(fields(5), ['code']);
      for (const e of pv.errors) assert.ok(e.message && e.messageEn && Number.isInteger(e.row));
      assert.equal(st.risks.length, n);
    },
  },
  {
    name: 'commitImport adds only the valid rows with one summary feed event',
    async fn() {
      const st = freshStore();
      const n = st.risks.length;
      const pv = sources.importPreview({ text: CSV });
      const feedBefore = st.feed.length;
      const res = await sources.commitImport(pv, { store });
      assert.equal(res.ok, true);
      assert.equal(res.count, 1);
      assert.equal(res.skipped, 3);
      assert.equal(st.risks.length, n + 1);
      assert.equal(st.feed.length, feedBefore + 1);
      assert.ok(st.feed[0].titleEn.includes('1 risk imported'));
      assert.ok(res.message && res.messageEn);
    },
  },
  {
    name: 'JSON input and empty input are handled without throwing',
    fn() {
      const pv = sources.importPreview({ text: JSON.stringify({ data: [{ hazard: 'Fall', site: 'RUH-01', category: 'height', likelihood: 3, severity: 4, dueDate: '2026-12-10' }] }), format: 'json' });
      assert.equal(pv.validCount, 1);
      const empty = sources.importPreview({ text: '' });
      assert.equal(empty.ok, false);
      assert.ok(empty.messageEn);
    },
  },
  {
    name: 'testConnection is honest: demo mode and backend-only connectors never report success',
    async fn() {
      const sim = await sources.testConnection({ type: 'simulation' });
      assert.equal(sim.ok, false);
      assert.equal(sim.reason, 'simulation');
      assert.ok(sim.messageEn);
      const p6 = await sources.testConnection({ type: 'primavera' });
      assert.equal(p6.ok, false);
      assert.equal(p6.reason, 'requiresBackend');
      const bad = await sources.testConnection({ type: 'json', url: 'ftp://example.com' });
      assert.equal(bad.ok, false);
      assert.equal(bad.reason, 'invalidUrl');
    },
  },
];
