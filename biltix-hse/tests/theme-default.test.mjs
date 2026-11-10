/** Light is the default theme; a saved 'dark' applies only when the user chose it (settings.themeChosen). */
import { assert, freshStore, store, storeExports } from './helpers.mjs';

const { DEFAULT_SETTINGS, sanitizeSettings } = storeExports;

export const tests = [
  {
    name: 'the default theme is light and not marked as a user choice',
    fn() {
      assert.equal(DEFAULT_SETTINGS.theme, 'light');
      assert.equal(DEFAULT_SETTINGS.themeChosen, false);
      const st = freshStore();
      assert.equal(st.settings.theme, 'light');
    },
  },
  {
    name: 'settings saved before light became the default (dark, no themeChosen) open in light',
    fn() {
      assert.equal(sanitizeSettings({ theme: 'dark' }).theme, 'light');
      assert.equal(sanitizeSettings({ theme: 'dark', themeChosen: 'yes' }).theme, 'light');
      assert.equal(sanitizeSettings({ theme: 'nonsense', themeChosen: true }).theme, 'light');
    },
  },
  {
    name: 'choosing dark through setSettings marks the choice, and the choice survives sanitising (reload)',
    fn() {
      const st = freshStore();
      store.setSettings({ theme: 'dark' });
      assert.equal(st.settings.theme, 'dark');
      assert.equal(st.settings.themeChosen, true);
      const reloaded = sanitizeSettings(JSON.parse(JSON.stringify(st.settings)));
      assert.equal(reloaded.theme, 'dark');
      store.setSettings({ numerals: 'arab' });
      assert.equal(st.settings.theme, 'dark', 'an unrelated settings change keeps the chosen theme');
      store.setSettings({ theme: 'light' });
      assert.equal(st.settings.theme, 'light');
      assert.equal(st.settings.themeChosen, true);
    },
  },
];
