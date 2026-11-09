/**
 * Biltix HSE — view registry (js/views/index.js)
 *
 * Exports the eleven view modules in navigation order. app.js registers them with
 * `router.registerAll(views)` and builds the nav rail / command palette from this list.
 * Each view is `{ id, code, title, icon, render(container, ctx) => cleanupFn|void }`.
 */

import overview from './overview.js';
import radar from './radar.js';
import risks from './risks.js';
import incidents from './incidents.js';
import permits from './permits.js';
import inspections from './inspections.js';
import training from './training.js';
import compliance from './compliance.js';
import integrations from './integrations.js';
import reports from './reports.js';
import settings from './settings.js';

export const views = [
  overview,
  radar,
  risks,
  incidents,
  permits,
  inspections,
  training,
  compliance,
  integrations,
  reports,
  settings,
];

export default views;
