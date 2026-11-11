/** Final-verification fixes: whole-row clicks (components.js interactiveWithin). */
import assert from 'node:assert/strict';
import { interactiveWithin } from '../js/ui/components.js';

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
];
