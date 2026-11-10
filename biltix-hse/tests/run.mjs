/**
 * BILTIX Risk AI — node test runner (no dependencies).
 *
 *   node tests/run.mjs            run every tests/*.test.mjs
 *   node tests/run.mjs metrics    run the files whose name contains "metrics"
 *
 * Each test file exports `tests = [{ name, fn }]`; fn may be async and throws (node:assert) on failure.
 * The suite runs in the Riyadh time zone (the product's) so calendar-day logic matches the browser.
 */
process.env.TZ = process.env.TZ || 'Asia/Riyadh';

import { readdirSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const filter = process.argv[2] || '';
const files = readdirSync(here).filter((f) => f.endsWith('.test.mjs') && f.includes(filter)).sort();

let passed = 0;
let failed = 0;
const started = Date.now();
for (const file of files) {
  const mod = await import(pathToFileURL(join(here, file)).href);
  const list = Array.isArray(mod.tests) ? mod.tests : [];
  console.log(`\n${file}`);
  for (const t of list) {
    try {
      await t.fn();
      passed += 1;
      console.log(`  ✓ ${t.name}`);
    } catch (err) {
      failed += 1;
      console.log(`  ✗ ${t.name}\n      ${String(err && err.stack ? err.stack : err).split('\n').slice(0, 4).join('\n      ')}`);
    }
  }
}
console.log(`\n${passed} passed, ${failed} failed (${files.length} files, ${Date.now() - started} ms)`);
process.exit(failed ? 1 : 0);
