/** English is the default interface language; a saved 'ar' applies only when the user chose it (settings.langChosen). */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { assert, freshStore, store, storeExports } from './helpers.mjs';
import { core } from '../js/i18n/core.js';

const { DEFAULT_SETTINGS, sanitizeSettings } = storeExports;
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
/** core.<lang> value of a key, with or without the 'core.' namespace prefix (data-i18n attributes carry it). */
const pick = (dict, key) => key.replace(/^core\./, '').split('.').reduce((node, part) => (node ? node[part] : undefined), dict);

export const tests = [
  {
    name: 'the default language is English and not marked as a user choice',
    fn() {
      assert.equal(DEFAULT_SETTINGS.lang, 'en');
      assert.equal(DEFAULT_SETTINGS.langChosen, false);
      const st = freshStore();
      assert.equal(st.settings.lang, 'en');
      assert.equal(st.settings.theme, 'light', 'English opens with the light theme');
    },
  },
  {
    name: 'settings saved while Arabic was the default (ar, no langChosen) open in English',
    fn() {
      assert.equal(sanitizeSettings({ lang: 'ar' }).lang, 'en');
      assert.equal(sanitizeSettings({ lang: 'ar', langChosen: 'yes' }).lang, 'en');
      assert.equal(sanitizeSettings({ lang: 'fr', langChosen: true }).lang, 'en');
      assert.equal(sanitizeSettings({ lang: 'en' }).lang, 'en');
    },
  },
  {
    name: 'choosing Arabic through setSettings marks the choice, and the choice survives sanitising (reload)',
    fn() {
      const st = freshStore();
      store.setSettings({ lang: 'ar' });
      assert.equal(st.settings.lang, 'ar');
      assert.equal(st.settings.langChosen, true);
      assert.equal(sanitizeSettings(JSON.parse(JSON.stringify(st.settings))).lang, 'ar');
      store.setSettings({ numerals: 'arab' });
      assert.equal(st.settings.lang, 'ar', 'an unrelated settings change keeps the chosen language');
      store.setSettings({ lang: 'en' });
      assert.equal(st.settings.lang, 'en');
      assert.equal(st.settings.langChosen, true);
    },
  },
  {
    name: 'a backup restores the chosen Arabic (v3.7.1+ export carries langChosen); an older backup restores in English',
    fn() {
      freshStore();
      store.setSettings({ lang: 'ar' });
      const exported = JSON.parse(JSON.stringify(store.state)); // what Settings → Export JSON writes
      freshStore();
      assert.equal(store.importState(exported), true);
      assert.equal(store.state.settings.lang, 'ar');
      assert.equal(store.state.settings.langChosen, true);
      const older = JSON.parse(JSON.stringify(exported));
      delete older.settings.langChosen;
      freshStore();
      assert.equal(store.importState(older), true);
      assert.equal(store.state.settings.lang, 'en');
      assert.equal(store.state.settings.langChosen, false);
    },
  },
  {
    name: 'resetting the demo data returns to the defaults (English, not marked as a choice)',
    fn() {
      freshStore();
      store.setSettings({ lang: 'ar' });
      store.reset();
      assert.equal(store.state.settings.lang, 'en');
      assert.equal(store.state.settings.langChosen, false);
    },
  },
  {
    name: 'index.html shell placeholders are the English dictionary values; the Arabic pre-paint labels match core.ar',
    fn() {
      const html = readFileSync(join(root, 'index.html'), 'utf8');
      const tagged = [...html.matchAll(/data-i18n="([\w.]+)">([^<]*)</g)];
      assert.ok(tagged.length >= 3, 'data-i18n placeholders found');
      for (const [, key, text] of tagged) assert.equal(text, pick(core.en, key), `static ${key} is the English value`);
      for (const [, text, key] of html.matchAll(/aria-label="([^"]*)" data-i18n-aria="([\w.]+)"/g)) assert.equal(text, pick(core.en, key), `static aria ${key}`);
      const byId = { brandName: 'app.name', brandTag: 'app.tagline', dataChipLabel: 'data.chipDemo', userAvatar: 'user.initial', userName: 'user.name', userRole: 'user.role', siteLabel: 'filters.project', rangeLabel: 'filters.period', searchLabel: 'filters.searchLabel' };
      for (const [id, key] of Object.entries(byId)) {
        const m = html.match(new RegExp(`id="${id}"[^>]*>([^<]*)<`));
        assert.ok(m, `#${id} in index.html`);
        assert.equal(m[1], pick(core.en, key), `#${id} static text is core.en.${key}`);
        const ar = html.match(new RegExp(`\\b${id}: '([^']*)'`));
        assert.ok(ar, `#${id} has an Arabic pre-paint label`);
        assert.equal(ar[1], pick(core.ar, key), `#${id} Arabic pre-paint label is core.ar.${key}`);
      }
      assert.ok(html.includes(`placeholder="${core.en.filters.searchPlaceholder}"`));
      assert.ok(html.includes(`'${core.ar.filters.searchPlaceholder}'`));
      assert.ok(html.includes(`>${core.en.filters.allProjects}</option>`));
      assert.ok(html.includes(`'${core.ar.filters.allProjects}'`));
      assert.ok(html.includes(`'${core.ar.shell.skip}'`) && html.includes(`'${core.ar.shell.search}'`), 'Arabic skip link and search button labels');
      assert.ok(/<html lang="en" dir="ltr"/.test(html), 'the static document is English / LTR');
    },
  },
];
