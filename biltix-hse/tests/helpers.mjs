/** Shared fixtures for the node tests: the real store/selectors on a frozen clock. */
import assert from 'node:assert/strict';

export { assert };

export const NOW = new Date('2026-11-10T09:00:00+03:00');

const storeMod = await import('../js/core/store.js');
const selMod = await import('../js/core/selectors.js');
const pselMod = await import('../js/core/platform-selectors.js');
const sourcesMod = await import('../js/data/sources.js');
const busMod = await import('../js/core/bus.js');
const seedMod = await import('../js/data/platform-seed.js');
const vocab = await import('../js/data/vocab-en.js');
await vocab.loadVocab(); // the dictionaries are lazy in the app (English sessions only); tests need them up front

export const { store } = storeMod;
export const storeExports = storeMod;
export const { sel } = selMod;
export const { psel } = pselMod;
export const { sources } = sourcesMod;
export const { bus } = busMod;
export const platformSeed = seedMod.default;
export const seedExports = seedMod;

/** Reset the singleton store to a fresh seed anchored at `now` (default NOW) and freeze its clock. */
export function freshStore(now = NOW) {
  store.now = () => new Date(now.getTime());
  store.reset();
  return store.state;
}

/** Every ISO instant (string with a time part) found anywhere in `value`, with its path. */
export function instants(value, path = 'state', out = []) {
  if (typeof value === 'string') {
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(value) && Number.isFinite(Date.parse(value))) out.push({ path, value });
  } else if (Array.isArray(value)) value.forEach((v, i) => instants(v, `${path}[${i}]`, out));
  else if (value && typeof value === 'object') for (const [k, v] of Object.entries(value)) instants(v, `${path}.${k}`, out);
  return out;
}

export const ARABIC = /[؀-ۿ]/;
