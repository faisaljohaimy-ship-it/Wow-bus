/** English is the default interface language; a saved 'ar' applies only when the user chose it (settings.langChosen). */
import { assert, freshStore, store, storeExports } from './helpers.mjs';

const { DEFAULT_SETTINGS, sanitizeSettings } = storeExports;

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
];
