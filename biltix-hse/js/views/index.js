/**
 * BILTIX Risk AI — view registry (js/views/index.js)
 *
 * Part B (ARCHITECTURE.md §B7) makes the navigation grouped; this registry is STATIC and LAZY:
 *
 *   • `NAV_META`     — the 25 views' navigation metadata (id, code, title, shortTitle, tabTitle,
 *                      icon, group, path). No view module is imported at boot.
 *   • `views`        — the same 25 entries as lazy view objects ({…meta, load(), loaded, module,
 *                      render once loaded}) in rail order; filled synchronously, so importers
 *                      always see the full list (window.biltix.views exposes it).
 *   • `loadView(id)` — imports a view module on demand (cached promise), attaches its render()
 *                      to the entry and resolves to it. The router calls `entry.load()` on first
 *                      navigation; the shell prefetches on hover / focus.
 *   • `loadViews()`  — compatibility helper: loads every module (allSettled, one console.warn
 *                      for the ones that failed) and resolves to `views`.
 *   • `navMeta()`    — rail / tab presentation per view (overrides: overview is listed under
 *                      "مجالات المخاطر" as "مخاطر الموقع والسلامة / DOM-05" while keeping SEC-01
 *                      inside; short rail titles for long names; short tab-bar titles).
 *   • `navGroups`    — the four rail sections, each with its ordered `viewIds`; `label` is a getter
 *                      that returns the group title in the active language (core.nav.groups.<id>).
 *
 * v3: every presentation string (rail title, tab title, group label) comes from the 'core'
 * dictionary (js/i18n/core.js → core.nav.<id>.title / .short) in the active language; the Arabic
 * literals below are only the fallback when the dictionary is not registered (e.g. node tests).
 *
 * Each view module exports `default { id, code, title, icon, render(container, ctx) }`.
 */

import { i18n } from '../core/i18n.js';

/** Dictionary lookup with a literal fallback (never returns the raw key). */
function tr(key, fallback) {
  try { return i18n.has(key) ? i18n.t(key) : fallback; } catch { return fallback; }
}

const GROUP_FALLBACK = {
  cockpit: 'قمرة القيادة',
  domains: 'مجالات المخاطر',
  hse: 'السلامة والصحة المهنية (HSE)',
  platform: 'المنصة',
  other: 'أقسام أخرى',
};

/** Localised rail section title. */
export function groupLabel(groupId) {
  return tr(`core.nav.groups.${groupId}`, GROUP_FALLBACK[groupId] || String(groupId || ''));
}

function group(id, viewIds) {
  return Object.freeze({ id, viewIds: Object.freeze(viewIds), get label() { return groupLabel(id); } });
}

export const navGroups = [
  group('cockpit', ['cockpit', 'airisks', 'tasks', 'alerts']),
  group('domains', ['contracts', 'bom', 'schedule', 'cost', 'overview']),
  group('hse', ['radar', 'spatial', 'risks', 'incidents', 'permits', 'inspections', 'training', 'compliance']),
  group('platform', ['engine', 'dataquality', 'integrations', 'fieldkit', 'reports', 'roadmap', 'golive', 'settings']),
];

/** Flat navigation order (= rail order = command-palette order). */
export const VIEW_ORDER = navGroups.flatMap((g) => g.viewIds);

/**
 * Rail / tab label + code overrides (the view keeps its own title/code inside its page).
 *   title/code  — replace the rail label and code (overview → DOM-05 "مخاطر الموقع والسلامة")
 *   shortTitle  — rail label when the full title is too long for the rail width
 *   tabTitle    — bottom tab-bar label (phones)
 */
export const NAV_OVERRIDES = {
  overview: { title: 'مخاطر الموقع والسلامة', code: 'DOM-05', shortTitle: 'الموقع والسلامة', tabTitle: 'الموقع' },
  cockpit: { tabTitle: 'القمرة' },
  airisks: { tabTitle: 'المخاطر' },
  radar: { tabTitle: 'الرادار' },
  spatial: { shortTitle: 'خريطة الموقع', tabTitle: 'الخريطة' },
  bom: { shortTitle: 'مخاطر المواد' },
  incidents: { shortTitle: 'الحوادث' },
  engine: { shortTitle: 'محرك الذكاء' },
  dataquality: { shortTitle: 'جودة البيانات' },
  roadmap: { shortTitle: 'خارطة الطريق' },
  golive: { shortTitle: 'الجاهزية للتشغيل' },
};

/** Bottom tab bar (first four + "المزيد"). */
export const TAB_IDS = ['cockpit', 'airisks', 'overview', 'radar'];

export const DEFAULT_VIEW = 'cockpit';
export const FALLBACK_VIEW = 'overview';

/** Static navigation metadata for all 25 views (titles/codes/icons mirror each module's own). */
export const NAV_META = Object.freeze([
  { id: 'cockpit', code: 'CPT-00', title: 'قمرة قيادة المخاطر', icon: 'radar', group: 'cockpit', path: './cockpit.js' },
  { id: 'airisks', code: 'AIR-01', title: 'سجل المخاطر الذكي', icon: 'shield-alert', group: 'cockpit', path: './airisks.js' },
  { id: 'tasks', code: 'AIR-02', title: 'مهام المعالجة', icon: 'file-check', group: 'cockpit', path: './tasks.js' },
  { id: 'alerts', code: 'AIR-03', title: 'التنبيهات والتصعيد', icon: 'bell', group: 'cockpit', path: './alerts.js' },
  { id: 'contracts', code: 'DOM-01', title: 'مخاطر العقود', icon: 'file-text', group: 'domains', path: './contracts.js' },
  { id: 'bom', code: 'DOM-02', title: 'مخاطر المواد والتوريد (BoM)', icon: 'list', group: 'domains', path: './bom.js' },
  { id: 'schedule', code: 'DOM-03', title: 'مخاطر الجدول الزمني', icon: 'calendar', group: 'domains', path: './schedule.js' },
  { id: 'cost', code: 'DOM-04', title: 'مخاطر التكلفة', icon: 'chart', group: 'domains', path: './cost.js' },
  { id: 'overview', code: 'SEC-01', title: 'نظرة عامة', icon: 'grid', group: 'domains', path: './overview.js' },
  { id: 'radar', code: 'SEC-02', title: 'الرادار الحي', icon: 'radar', group: 'hse', path: './radar.js' },
  { id: 'spatial', code: 'SEC-12', title: 'الربط المكاني للموقع', icon: 'map-pin', group: 'hse', path: './spatial.js' },
  { id: 'risks', code: 'SEC-03', title: 'سجل المخاطر', icon: 'shield-alert', group: 'hse', path: './risks.js' },
  { id: 'incidents', code: 'SEC-04', title: 'الحوادث والحوادث الوشيكة', icon: 'alert-triangle', group: 'hse', path: './incidents.js' },
  { id: 'permits', code: 'SEC-05', title: 'تصاريح العمل', icon: 'file-check', group: 'hse', path: './permits.js' },
  { id: 'inspections', code: 'SEC-06', title: 'التفتيش والتدقيق', icon: 'clipboard', group: 'hse', path: './inspections.js' },
  { id: 'training', code: 'SEC-07', title: 'التدريب والكفاءات', icon: 'graduation', group: 'hse', path: './training.js' },
  { id: 'compliance', code: 'SEC-08', title: 'الامتثال ISO 45001', icon: 'badge-check', group: 'hse', path: './compliance.js' },
  { id: 'engine', code: 'PLT-01', title: 'محرك الذكاء الاصطناعي والتفسير', icon: 'sliders', group: 'platform', path: './engine.js' },
  { id: 'dataquality', code: 'PLT-02', title: 'جودة البيانات وطبقة التحقق', icon: 'badge-check', group: 'platform', path: './dataquality.js' },
  { id: 'integrations', code: 'SEC-09', title: 'التكاملات والأنظمة', icon: 'plug', group: 'platform', path: './integrations.js' },
  { id: 'fieldkit', code: 'FLD-01', title: 'عُدّة الميدان', icon: 'helmet', group: 'platform', path: './fieldkit.js' },
  { id: 'reports', code: 'SEC-10', title: 'التقارير', icon: 'file-text', group: 'platform', path: './reports.js' },
  { id: 'roadmap', code: 'PLT-03', title: 'خارطة الطريق والمقترح التفصيلي', icon: 'calendar', group: 'platform', path: './roadmap.js' },
  { id: 'golive', code: 'PLT-04', title: 'الجاهزية للتشغيل', icon: 'send', group: 'platform', path: './golive.js' },
  { id: 'settings', code: 'SEC-11', title: 'الإعدادات', icon: 'sliders', group: 'platform', path: './settings.js' },
].map((m) => Object.freeze(m)));

/** Module path per view id — relative to this file, no build step. */
const VIEW_PATHS = Object.fromEntries(NAV_META.map((m) => [m.id, m.path]));

/** Ids whose module failed to load in this session (for diagnostics / the shell). */
export const missingViews = [];

/** @type {Map<string, Promise<object>>} one import promise per view id */
const pending = new Map();

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

/** Lazy view entry: navigation metadata now, module on first navigation. */
function makeEntry(meta) {
  const entry = {
    id: meta.id,
    code: meta.code,
    title: meta.title,
    icon: meta.icon,
    group: meta.group,
    shortTitle: (NAV_OVERRIDES[meta.id] && NAV_OVERRIDES[meta.id].shortTitle) || undefined,
    tabTitle: (NAV_OVERRIDES[meta.id] && NAV_OVERRIDES[meta.id].tabTitle) || undefined,
    loaded: false,
    module: null,
    render: undefined,
    load: () => loadView(meta.id),
  };
  return entry;
}

/** The 25 lazy view entries in rail order (stable array instance). */
export const views = NAV_META.map(makeEntry);

const entryById = new Map(views.map((v) => [v.id, v]));

/**
 * Import one view module (cached). Resolves to the view entry with `render` attached; rejects
 * when the module is missing or does not export a valid view (the id is added to missingViews
 * and reported once with console.warn — never console.error).
 * @param {string} id
 * @returns {Promise<object>}
 */
export function loadView(id) {
  const entry = entryById.get(id);
  if (!entry) return Promise.reject(new Error(`view "${id}" is not registered`));
  if (entry.loaded && typeof entry.render === 'function') return Promise.resolve(entry);
  let p = pending.get(id);
  if (!p) {
    p = import(VIEW_PATHS[id])
      .then((mod) => {
        const impl = pickExport(mod, id);
        if (!impl) throw new Error('the module does not export a valid view {id, render}');
        if (impl.id !== id) console.warn(`[BILTIX Risk AI] ${id} → the module declares id "${impl.id}"; registered as "${id}"`);
        entry.module = impl;
        entry.render = (container, ctx) => impl.render.call(impl, container, ctx);
        entry.loaded = true;
        if (impl.title) entry.title = impl.title;
        if (impl.code) entry.code = impl.code;
        if (impl.icon) entry.icon = impl.icon;
        const at = missingViews.indexOf(id);
        if (at !== -1) missingViews.splice(at, 1);
        return entry;
      })
      .catch((error) => {
        pending.delete(id); // allow a retry
        if (!missingViews.includes(id)) {
          missingViews.push(id);
          console.warn(`[BILTIX Risk AI] view module "${id}" is not available yet and was skipped: ${shortReason(error)}`);
        }
        throw error;
      });
    pending.set(id, p);
  }
  return p;
}

/**
 * Load every view module (compatibility with the eager boot). Missing or broken modules are
 * skipped (one console.warn each). Resolves to the `views` array (entries, loaded or not).
 * @returns {Promise<object[]>}
 */
export function loadViews() {
  return Promise.allSettled(VIEW_ORDER.map((id) => loadView(id))).then(() => views);
}

/**
 * Rail / tab presentation for a view (or a view id), in the active language.
 * @returns {{id, title, code, shortTitle, tabTitle, icon, group}}
 *   title = full rail title (core.nav.<id>.title; wraps to two lines in the rail, never truncated),
 *   shortTitle / tabTitle = core.nav.<id>.short (bottom tab bar, compact contexts).
 *   Fallbacks: the Arabic overrides / module titles above.
 */
export function navMeta(view) {
  const id = typeof view === 'string' ? view : (view && view.id);
  const entry = id ? entryById.get(id) : null;
  const src = (view && typeof view === 'object') ? view : entry;
  if (!src) return { id: id || '', title: '', code: '', shortTitle: '', tabTitle: '', icon: '', group: null };
  const override = NAV_OVERRIDES[src.id] || {};
  const metaTitle = (NAV_META.find((m) => m.id === src.id) || {}).title;
  const fallbackTitle = override.title || metaTitle || src.title || src.id;
  const title = tr(`core.nav.${src.id}.title`, fallbackTitle);
  const fallbackShort = override.tabTitle || override.shortTitle || src.tabTitle || src.shortTitle || fallbackTitle;
  const shortTitle = tr(`core.nav.${src.id}.short`, fallbackShort);
  return {
    id: src.id,
    title,
    code: override.code || src.code || '',
    shortTitle,
    tabTitle: shortTitle,
    icon: src.icon || (entry && entry.icon) || '',
    group: groupOf(src.id),
  };
}

/** Group id for a view id (null when it belongs to no group). */
export function groupOf(viewId) {
  const group = navGroups.find((g) => g.viewIds.includes(viewId));
  return group ? group.id : null;
}

export default views;
