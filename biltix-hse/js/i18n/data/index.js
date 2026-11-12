/**
 * English data dictionaries — merged entry point (A-DATA-EN, CONTRACT.md §4).
 * Usage in the shell: import data from '../i18n/data/index.js';
 *   for (const [ns, map] of Object.entries(data)) if (ns !== 'terms') i18n.registerData(ns, map);
 *   data.terms → the shared terms map used by i18n.term(str).
 */
import d0 from './hse.js';
import d1 from './platform.js';
import d2 from './platform-domains.js';
import d3 from './platform-risks.js';

export const parts = [d0, d1, d2, d3];

const merged = { terms: {} };
for (const part of parts) {
  for (const [ns, map] of Object.entries(part)) {
    if (ns === 'terms') Object.assign(merged.terms, map);
    else merged[ns] = Object.assign(merged[ns] || {}, map);
  }
}

export const terms = merged.terms;
export default merged;
