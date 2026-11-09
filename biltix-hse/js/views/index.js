/**
 * Biltix Risk AI — view registry (js/views/index.js)
 *
 * Part B (ARCHITECTURE.md §B7) makes the navigation grouped and the registry resilient:
 *
 *   • `navGroups`   — the four rail sections, each with its ordered `viewIds`.
 *   • `loadViews()` — async; dynamically imports every view module (Part A 11 + Part B 11)
 *                      with try/catch, skips missing/broken modules with ONE console.warn
 *                      (never console.error — views are being written in parallel) and
 *                      resolves to the flat, ordered `views` array.
 *   • `views`       — the same array instance, filled in place by loadViews() so modules that
 *                      imported it synchronously keep a stable reference (empty until loaded).
 *   • `navMeta()`   — rail label/code overrides (overview is listed under "مجالات المخاطر"
 *                      as "مخاطر الموقع والسلامة / DOM-05" while keeping SEC-01 inside).
 *
 * Each view module exports `default { id, code, title, icon, render(container, ctx) }`.
 */

export const navGroups = [
  { id: 'cockpit', label: 'قمرة القيادة', viewIds: ['cockpit', 'airisks', 'tasks', 'alerts'] },
  { id: 'domains', label: 'مجالات المخاطر', viewIds: ['contracts', 'bom', 'schedule', 'cost', 'overview'] },
  { id: 'hse', label: 'السلامة والصحة المهنية (HSE)', viewIds: ['radar', 'risks', 'incidents', 'permits', 'inspections', 'training', 'compliance'] },
  { id: 'platform', label: 'المنصة', viewIds: ['engine', 'dataquality', 'integrations', 'reports', 'roadmap', 'settings'] },
];

/** Flat navigation order (= rail order = command-palette order). */
export const VIEW_ORDER = navGroups.flatMap((g) => g.viewIds);

/** Rail/tab label + code overrides (the view keeps its own title/code inside its page). */
export const NAV_OVERRIDES = {
  overview: { title: 'مخاطر الموقع والسلامة', code: 'DOM-05' },
};

/** Bottom tab bar (first four + "المزيد"). */
export const TAB_IDS = ['cockpit', 'airisks', 'overview', 'radar'];

export const DEFAULT_VIEW = 'cockpit';
export const FALLBACK_VIEW = 'overview';

/** Module path per view id — relative to this file, no build step. */
const VIEW_PATHS = {
  cockpit: './cockpit.js',
  airisks: './airisks.js',
  tasks: './tasks.js',
  alerts: './alerts.js',
  contracts: './contracts.js',
  bom: './bom.js',
  schedule: './schedule.js',
  cost: './cost.js',
  overview: './overview.js',
  radar: './radar.js',
  risks: './risks.js',
  incidents: './incidents.js',
  permits: './permits.js',
  inspections: './inspections.js',
  training: './training.js',
  compliance: './compliance.js',
  engine: './engine.js',
  dataquality: './dataquality.js',
  integrations: './integrations.js',
  reports: './reports.js',
  roadmap: './roadmap.js',
  settings: './settings.js',
};

/** Filled in place by loadViews(); exported so synchronous importers keep a stable reference. */
export const views = [];

/** Ids whose module failed to load in this session (for diagnostics / the shell). */
export const missingViews = [];

let loading = null;

function isView(candidate) {
  return Boolean(candidate) && typeof candidate === 'object'
    && typeof candidate.id === 'string' && candidate.id.length > 0
    && typeof candidate.render === 'function';
}

function pickExport(mod, id) {
  if (!mod || typeof mod !== 'object') return null;
  const candidates = [mod.default, mod.view, mod[id]];
  for (const c of candidates) if (isView(c)) return c;
  return null;
}

function shortReason(error) {
  const msg = error && error.message ? String(error.message) : String(error || '');
  return msg.length > 140 ? `${msg.slice(0, 137)}…` : msg;
}

/**
 * Load every view module in navigation order. Missing or broken modules are skipped and
 * reported once with console.warn. Idempotent: concurrent/later calls share one promise.
 * @returns {Promise<object[]>} the ordered `views` array
 */
export function loadViews() {
  if (loading) return loading;
  loading = (async () => {
    const results = await Promise.allSettled(VIEW_ORDER.map((id) => import(VIEW_PATHS[id])));
    const loaded = [];
    const skipped = [];
    results.forEach((result, index) => {
      const id = VIEW_ORDER[index];
      if (result.status !== 'fulfilled') {
        skipped.push(`${id} (${shortReason(result.reason)})`);
        return;
      }
      const view = pickExport(result.value, id);
      if (!view) {
        skipped.push(`${id} (الوحدة لا تُصدّر عرضاً صالحاً {id, render})`);
        return;
      }
      if (view.id !== id) skipped.push(`${id} → المعرّف داخل الوحدة "${view.id}" مختلف؛ تم تسجيله كما هو`);
      loaded.push(view);
    });
    views.length = 0;
    views.push(...loaded);
    missingViews.length = 0;
    missingViews.push(...VIEW_ORDER.filter((id) => !loaded.some((v) => v.id === id)));
    if (skipped.length) {
      console.warn(`[بلتكس Risk AI] ${skipped.length} من ${VIEW_ORDER.length} وحدة عرض غير متاحة بعد وتم تخطيها:\n  • ${skipped.join('\n  • ')}`);
    }
    return views;
  })();
  return loading;
}

/** Rail/tab presentation for a view (title/code overrides per §B7). */
export function navMeta(view) {
  if (!view) return { title: '', code: '' };
  const override = NAV_OVERRIDES[view.id] || {};
  return { title: override.title || view.title || view.id, code: override.code || view.code || '' };
}

/** Group id for a view id (null when it belongs to no group). */
export function groupOf(viewId) {
  const group = navGroups.find((g) => g.viewIds.includes(viewId));
  return group ? group.id : null;
}

export default views;
