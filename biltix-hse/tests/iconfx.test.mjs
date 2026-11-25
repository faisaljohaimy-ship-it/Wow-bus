/** Icon effect (js/ui/iconfx.js, css "Icon effect"): the module's public face, its limits, and the rules the CSS keeps. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const mod = await import('../js/ui/iconfx.js');
const read = (rel) => readFileSync(new URL(rel, import.meta.url), 'utf8');
const js = read('../js/ui/iconfx.js');
const css = read('../css/components.css');
const app = read('../js/app.js');
const block = css.slice(css.indexOf('Icon effect (js/ui/iconfx.js)'));

export const tests = [
  {
    name: 'icon effect: importing the module in Node is safe and returns the capture API without a document',
    fn() {
      assert.equal(typeof mod.initIconFx, 'function');
      const api = mod.initIconFx();
      for (const key of ['play', 'seek', 'rest', 'delayOf', 'limit']) assert.equal(typeof api[key], 'function', `api.${key}`);
      assert.equal(api.cycle, 2400, 'one icon cycles for 2.4 s');
      assert.ok(api.duration > api.cycle && api.duration <= 3600, `a whole wave lasts ${api.duration} ms, no more than about 3.5 s`);
      assert.equal(mod.iconFx, api);
    },
  },
  {
    name: 'icon effect: the cycle moves with scale / translate / opacity and never with the transform property',
    fn() {
      assert.ok(/scale:\s*'1 1',\s*translate:\s*'0 0'/.test(js), 'keyframes use the individual scale and translate properties');
      assert.ok(!/\btransform\s*:\s*['`]/.test(js), 'no keyframe or inline style writes transform');
      assert.ok(!/\.style\.transform\b/.test(js), 'no style.transform write');
    },
  },
  {
    name: 'icon effect: bounded work — at most 40 icons mid-cycle, a governor that lowers the wave after slow frames',
    fn() {
      assert.ok(/const MAX_ACTIVE = 40;/.test(js));
      assert.ok(/const MIN_WAVE = 10;/.test(js));
      assert.ok(/function govern\(\)/.test(js));
      assert.ok(/running\.size >= MAX_ACTIVE/.test(js), 'a wave never starts more than MAX_ACTIVE cycles');
    },
  },
  {
    name: 'icon effect: starts after the first view has painted, through the bus, not in the boot graph',
    fn() {
      assert.ok(/import\('\.\/ui\/iconfx\.js'\)\.then\(\(m\) => m\.initIconFx\(\{ bus \}\)\)/.test(app), 'dynamic import with the bus');
      assert.ok(/requestAnimationFrame\(\(\) => setTimeout\(startIconFx, 0\)\)/.test(app), 'after a paint');
      assert.ok(!/^import [^;]*iconfx/m.test(app), 'no static import: the home route stays light');
    },
  },
  {
    name: 'icon effect: off under reduced motion (OS or setting), printing, forced colours and data-iconfx="off"',
    fn() {
      assert.ok(/if \(mode\(\) === 'off'\) return false;/.test(js));
      assert.ok(/if \(\(forcedMQ && forcedMQ\.matches\) \|\| \(printMQ && printMQ\.matches\)\) return false;/.test(js));
      assert.ok(/if \(motion === 'reduce' \|\| motion === 'reduced'\) return false;/.test(js));
      assert.ok(/@media screen and \(forced-colors: none\)\s*\{\s*:root\[data-iconfx-glass\] svg\.icon/.test(block), 'glass only where forced colours are off');
      assert.ok(/data-iconfx-glass/.test(js), 'the module switches the glass on once its filters exist');
    },
  },
  {
    name: 'icon effect: the module’s own elements are hidden, aria-hidden and add no interactive node',
    fn() {
      assert.ok(/aria-hidden/.test(js) && /createElementNS/.test(js));
      assert.ok(!/innerHTML/.test(js), 'no innerHTML');
      assert.ok(!/\b(left|right)\s*:/.test(block) && !/(margin|padding|border|inset)-(left|right)/.test(block), 'logical CSS only');
    },
  },
];
