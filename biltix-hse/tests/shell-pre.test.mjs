/** index.html pre-view (tools/stamp-shell.mjs): stamped strings match the dictionaries; loader and preloads stay in step. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildPre, inlineJson, stamped } from '../tools/stamp-shell.mjs';
import { views } from '../js/views/index.js';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

export const tests = [
  {
    name: 'pre-view: index.html carries the headers stamped from the current dictionaries (run node tools/stamp-shell.mjs)',
    async fn() {
      const pre = await buildPre();
      assert.equal(stamped(html, pre), html, 'index.html pre-view is out of date');
      assert.deepEqual(pre.ids, views.map((v) => v.id), 'every registered route id is known to the loader');
      for (const id of ['settings', 'airisks', 'tasks', 'overview', 'risks']) assert.ok(pre.routes[id], `${id} has a pre-view`);
      for (const [id, r] of Object.entries(pre.routes)) {
        assert.equal(r.c, views.find((v) => v.id === id).code, `${id} code tag`);
        for (const lang of ['ar', 'en']) {
          assert.equal(r[lang].length, 2);
          r[lang].forEach((s) => assert.ok(typeof s === 'string' && s.trim() && !/[{}]/.test(s), `${id}.${lang}: static text`));
        }
      }
      // parameterised leads and data-dependent titles get no pre-view (a later, different header would move LCP)
      for (const id of ['training', 'compliance', 'engine', 'reports']) assert.equal(pre.routes[id], undefined, id);
    },
  },
  {
    name: 'pre-view: inline JSON cannot close the script element',
    fn() {
      const s = inlineJson({ a: '</script><b>', b: '\u2028\u2029' });
      assert.ok(!s.includes('</'), s);
      assert.ok(!/[\u2028\u2029]/.test(s));
      assert.deepEqual(JSON.parse(s), { a: '</script><b>', b: '\u2028\u2029' });
    },
  },
  {
    name: 'loader: no static module script or modulepreload (scripts start after the first paint); boot list exists',
    fn() {
      assert.ok(!/<script[^>]+type="module"/.test(html), 'app.js is injected by the loader, not a static <script type=module>');
      assert.ok(!/<link rel="modulepreload"/.test(html), 'module preloads are injected after the first paint');
      for (const f of ['js/app.js', 'js/core/router.js', 'js/ui/components.js', 'js/ui/charts.js', 'js/views/index.js']) assert.ok(html.includes(`'${f}'`), f);
      assert.ok(html.includes("cockpit: ['js/views/cockpit.js', 'js/ui/explainer-hero.js', 'js/data/explainer-media.js']"));
    },
  },
];
