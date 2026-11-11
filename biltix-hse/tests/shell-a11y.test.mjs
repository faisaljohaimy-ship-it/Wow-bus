/** Final-verification fixes: whole-row clicks (interactiveWithin) and label in name (labelInName, visibleText). */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { interactiveWithin, labelInName, nameContains, nameExtra, visibleText } from '../js/ui/components.js';
import { FONT_STACKS, fontStacksFor } from '../js/ui/charts.js';

/** Tiny tree for visibleText: text(s) and node(cls, ...children) with firstChild / nextSibling links. */
const text = (s) => ({ nodeType: 3, nodeValue: s });
function node(cls, ...children) {
  const n = { nodeType: 1, hidden: false, classList: { contains: (c) => String(cls).split(/\s+/).includes(c) }, firstChild: children[0] || null };
  children.forEach((c, i) => { c.nextSibling = children[i + 1] || null; });
  return n;
}

/** Minimal element stand-in: tag + attributes, `matches` for the selectors interactiveWithin uses. */
function el(tag, attrs = {}, parent = null) {
  const node = {
    nodeType: 1, tagName: tag.toUpperCase(), attrs, parentElement: parent,
    matches(selector) {
      return selector.split(',').some((s) => {
        s = s.trim();
        if (s === tag) return true;
        if (s === `${tag}[href]` || s === 'a[href]') return tag === 'a' && 'href' in attrs;
        const m = /^\[([a-z-]+)(?:="([^"]*)")?\]$/.exec(s);
        if (m) return m[1] in attrs && (m[2] === undefined || attrs[m[1]] === m[2]);
        return false;
      });
    },
  };
  return node;
}

export const tests = [
  {
    name: 'interactiveWithin: a plain cell inside <main tabindex="-1"> is not interactive (the row click runs)',
    fn() {
      const main = el('main', { tabindex: '-1' });
      const table = el('table', {}, main);
      const tr = el('tr', {}, table);
      const td = el('td', {}, tr);
      const span = el('span', {}, td);
      assert.equal(interactiveWithin(span, tr), null);
      assert.equal(interactiveWithin(td, tr), null);
      // a text node target resolves to its parent element
      assert.equal(interactiveWithin({ nodeType: 3, parentElement: span }, tr), null);
    },
  },
  {
    name: 'interactiveWithin: buttons, links, fields and [tabindex] inside the row still handle their own clicks',
    fn() {
      const main = el('main', { tabindex: '-1' });
      const tr = el('tr', {}, main);
      const td = el('td', {}, tr);
      const btn = el('button', { type: 'button' }, td);
      const icon = el('svg', {}, btn);
      assert.equal(interactiveWithin(icon, tr), btn);
      const link = el('a', { href: '#/x' }, td);
      assert.equal(interactiveWithin(link, tr), link);
      const chip = el('span', { tabindex: '0' }, td);
      assert.equal(interactiveWithin(chip, tr), chip);
      const rb = el('div', { role: 'button' }, td);
      assert.equal(interactiveWithin(el('i', {}, rb), tr), rb);
      const input = el('input', {}, td);
      assert.equal(interactiveWithin(input, tr), input);
      // the boundary itself never counts, even when it is focusable
      const focusRow = el('tr', { tabindex: '-1' }, main);
      assert.equal(interactiveWithin(el('td', {}, focusRow), focusRow), null);
      assert.equal(interactiveWithin(null, tr), null);
    },
  },
  {
    name: 'nameContains: whole words in order (axe label-content-name-mismatch); punctuation and case ignored',
    fn() {
      assert.ok(nameContains('Search… Ctrl+K — Open the command palette', 'Search… Ctrl+K'));
      assert.ok(nameContains('EN — English', 'EN'));
      assert.ok(!nameContains('English', 'EN'), 'a word fragment is not the word');
      assert.ok(!nameContains('العربية', 'ع'));
      assert.ok(nameContains('ع — العربية', 'ع'));
      assert.ok(!nameContains('Open the command palette (Ctrl+K)', 'Ctrl+K'), 'parentheticals do not count');
      assert.ok(!nameContains('Export the cost lines in scope as CSV', 'Export CSV'), 'words must be next to each other');
      assert.ok(nameContains('anything', ''));
    },
  },
  {
    name: 'labelInName: keeps a label that already contains the visible text, else puts the visible text first',
    fn() {
      assert.equal(labelInName('EN', 'EN — English'), 'EN — English');
      assert.equal(labelInName('View', 'Open permit PTW-5524'), 'View — Open permit PTW-5524');
      assert.equal(labelInName('', 'Activity'), 'Activity');
      assert.equal(labelInName('3', ''), '3');
      // leading sentences that only repeat visible words are not said twice
      assert.equal(labelInName('Open incidents 9 in scope', 'Open incidents: 9. Filter the log to open incidents'),
        'Open incidents 9 in scope — Filter the log to open incidents');
      assert.equal(labelInName('الحوادث المفتوحة 9', 'الحوادث المفتوحة: 9. تصفية السجل على المفتوحة'),
        'الحوادث المفتوحة: 9. تصفية السجل على المفتوحة', 'already contains the visible words in order');
      assert.equal(labelInName('الحوادث المفتوحة 9 ضمن النطاق', 'الحوادث المفتوحة: 9. تصفية السجل على المفتوحة'),
        'الحوادث المفتوحة 9 ضمن النطاق — تصفية السجل على المفتوحة');
      // a label made only of visible words adds nothing
      assert.equal(labelInName('Open incidents 9 now', 'Open incidents: 9'), 'Open incidents 9 now');
      // nameExtra: what a control's label adds beyond its visible text (appended as screen-reader-only text)
      assert.equal(nameExtra('Overdue risks 7 +7 vs the previous 30 days', 'Overdue risks: 7. Open the register filtered to overdue risks'),
        'Open the register filtered to overdue risks');
      assert.equal(nameExtra('View', 'Open permit PTW-5524'), 'Open permit PTW-5524');
      assert.equal(nameExtra('Open incidents 9', 'Open incidents: 9'), '');
      for (const [v, l] of [['Search… Ctrl+K', 'Open the command palette and search'], ['79 +3 Red', 'Consolidated risk score 79 of 100'], ['ع', 'العربية']]) {
        assert.ok(nameContains(labelInName(v, l), v), `${v} in ${labelInName(v, l)}`);
      }
    },
  },
  {
    name: 'visibleText: on-screen text in order; .sr-only and [hidden] parts left out, aria-hidden text kept',
    fn() {
      const kbd = node('cmdk-kbd', text('Ctrl+K')); // aria-hidden in the markup, but on screen
      const sr = node('sr-only', text('opens a dialog'));
      const hid = node('x', text('never'));
      hid.hidden = true;
      const btn = node('cmdk-btn', node('cmdk-btn-label', text('Search…')), kbd, sr, hid);
      assert.equal(visibleText(btn), 'Search… Ctrl+K');
      assert.equal(visibleText(null), '');
    },
  },
  {
    name: 'charts FONT_STACKS: the same stacks as css/tokens.css (--font-ar, --font-en, --font-mono-mixed)',
    fn() {
      const css = readFileSync(new URL('../css/tokens.css', import.meta.url), 'utf8');
      const token = (name) => new RegExp(`--${name}:\\s*([^;]+);`).exec(css)[1].trim();
      assert.equal(FONT_STACKS.ar, token('font-ar'));
      assert.equal(FONT_STACKS.en, token('font-en'));
      assert.equal(token('font-mono-mixed'), `${FONT_STACKS.monoHead}, var(--font-sans)`);
      assert.equal(fontStacksFor('en').sans, FONT_STACKS.en);
      assert.equal(fontStacksFor('en-GB').sans, FONT_STACKS.en);
      assert.equal(fontStacksFor('ar').sans, FONT_STACKS.ar);
      assert.equal(fontStacksFor('').sans, FONT_STACKS.ar, 'Arabic-first by default, like :root');
      assert.equal(fontStacksFor('ar').mono, `${FONT_STACKS.monoHead}, ${FONT_STACKS.ar}`);
    },
  },
];
