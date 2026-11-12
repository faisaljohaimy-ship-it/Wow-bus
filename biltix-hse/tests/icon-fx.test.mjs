/** Icon effect (js/ui/icon-fx.js, css "Icon glass"): wave order, the turn-taking cap, and the rules the CSS must keep. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const fx = await import('../js/ui/icon-fx.js');
const css = readFileSync(new URL('../css/components.css', import.meta.url), 'utf8');
const js = readFileSync(new URL('../js/ui/icon-fx.js', import.meta.url), 'utf8');
const app = readFileSync(new URL('../js/app.js', import.meta.url), 'utf8');
const block = css.slice(css.indexOf('Icon glass and the melt'));

export const tests = [
  {
    name: 'icon wave: starts at the reading start (left in English, right in Arabic) and stays inside the spread',
    fn() {
      const { waveDelay, SPREAD_MS } = fx;
      assert.ok(waveDelay(100, 100, 1440, 900, false) < waveDelay(1300, 100, 1440, 900, false), 'LTR: left first');
      assert.ok(waveDelay(1300, 100, 1440, 900, true) < waveDelay(100, 100, 1440, 900, true), 'RTL: right first');
      assert.ok(waveDelay(700, 50, 1440, 900, false) < waveDelay(700, 850, 1440, 900, false), 'higher icons a little earlier');
      for (const [x, y] of [[0, 0], [1440, 900], [-50, 2000], [9999, -5]]) {
        const d = waveDelay(x, y, 1440, 900, false);
        assert.ok(d >= 0 && d <= SPREAD_MS, `delay ${d} inside 0…${SPREAD_MS}`);
      }
      assert.equal(waveDelay(10, 10, 0, 0, false), 0, 'a window without a size gives no delay');
    },
  },
  {
    name: 'icon wave: a dense page takes turns — every icon is started within a few waves, never more than the cap',
    fn() {
      const { thin } = fx;
      const list = Array.from({ length: 100 }, (_, i) => i);
      assert.deepEqual(thin([1, 2, 3], 28, 0), [1, 2, 3], 'short lists are untouched');
      const seen = new Set();
      for (let turn = 0; turn < 4; turn += 1) {
        const part = thin(list, 28, turn);
        assert.ok(part.length <= 28, `turn ${turn}: ${part.length} ≤ 28`);
        part.forEach((v) => seen.add(v));
      }
      assert.equal(seen.size, 100, 'four turns cover all hundred');
      assert.deepEqual(thin(list, 0, 0), list, 'a cap of zero means no cap');
    },
  },
  {
    name: 'icon wave: the slow-frame check uses a median',
    fn() {
      assert.equal(fx.median([]), 0);
      assert.equal(fx.median([16, 17, 200]), 17);
      assert.equal(fx.median([10, 20, 30, 40]), 25);
    },
  },
  {
    name: 'icon cycle: the CSS duration equals the module\'s, and the cycle never writes transform',
    fn() {
      const m = block.match(/svg\.icon\.ifx-run\s*\{[^}]*animation:\s*ifx-move\s+(\d+)ms[^}]*ifx-paint\s+(\d+)ms\s+step-end/);
      assert.ok(m, 'the run rule names ifx-move and a stepped ifx-paint');
      assert.equal(Number(m[1]), fx.CYCLE_MS);
      assert.equal(Number(m[2]), fx.CYCLE_MS);
      const frames = block.slice(block.indexOf('@keyframes ifx-move'), block.indexOf('/* The reader\'s own control'));
      assert.ok(!/[^-]transform\s*:/.test(frames), 'keyframes use translate / scale, so an icon\'s own transform survives');
      assert.ok(/@keyframes ifx-paint-lite/.test(frames), 'small icons have their own paint steps');
      assert.ok(!/url\(#ifx-m/.test(frames.slice(frames.indexOf('@keyframes ifx-paint-lite'))), 'the lite steps use no SVG filter');
      for (let i = 1; i <= 4; i += 1) assert.ok(js.includes('`ifx-m${i + 1}`') && frames.includes(`url(#ifx-m${i})`), `melt filter ${i} is defined and used`);
    },
  },
  {
    name: 'icon cycle: off under reduced motion, forced colours, print and the setting; a hovered or focused control keeps its icon',
    fn() {
      assert.ok(/:root\[data-motion="reduce"\] svg\.icon\.ifx-run[^{]*\{\s*animation:\s*none/.test(block));
      assert.ok(/@media \(prefers-reduced-motion: reduce\)\s*\{\s*:root:not\(\[data-motion="full"\]\) svg\.icon\.ifx-run \{ animation: none; \}/.test(block));
      assert.ok(/@media \(forced-colors: active\)\s*\{[^}]*svg\.icon \{[^}]*filter: none/.test(block));
      assert.ok(/@media print\s*\{[^}]*svg\.icon \{[^}]*filter: none !important/.test(block));
      assert.ok(/:root\[data-iconfx="off"\] svg\.icon\.ifx-run/.test(block));
      assert.ok(/:is\(:hover, :focus-visible, :active\) svg\.icon\.ifx-run \{ animation: none; \}/.test(block));
      assert.ok(/motionEnabled\(\)/.test(js) && /forced-colors: active/.test(js), 'the module checks motion and forced colours before a wave');
    },
  },
  {
    name: 'icon effect: loaded after the first render, not in the boot graph; no physical left / right in its CSS',
    fn() {
      assert.ok(/import\('\.\/ui\/icon-fx\.js'\)\.then\(\(m\) => m\.initIconFx\(\{ bus \}\)\)/.test(app), 'dynamic import next to the edge laser');
      assert.ok(!/^import [^;]*icon-fx/m.test(app), 'no static import: the home route stays light');
      assert.ok(!/\b(left|right)\s*:/.test(block) && !/(margin|padding|border|inset)-(left|right)/.test(block), 'logical CSS only');
    },
  },
];
