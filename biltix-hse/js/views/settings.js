/**
 * BILTIX Risk AI — SEC-11 Settings (js/views/settings.js). Owner: B-PLATFORM.
 *
 * Eight sections with anchors (deep links `#/settings?section=<id>`; aliases below):
 *   SET-01 Language & region   (#settings-language)   language AR/EN, numerals latn/arab, calendar, live format preview (Riyadh time)
 *   SET-02 Appearance          (#settings-appearance) theme, background Static/Subtle/Cinematic, density, motion
 *   SET-03 Risk scoring        (#settings-scoring)    weights editor (#settings-weights: 5 domains in %, live sum = 100 %, inline
 *                                                     errors, consolidated-score preview, save / cancel / reset) + thresholds editor
 *                                                     (#settings-thresholds: critical ≥ alert + 5, effect on open risks) + read-only bands
 *   SET-04 Data & connectivity (#settings-data)       status from status.js + six-state legend, data-mode explanation, data source
 *                                                     set-up with a REAL test, import with preview (shared/import-preview.js)
 *   SET-05 Notifications       (#settings-notifications) webhook URL + a real test POST (honest result)
 *   SET-06 Data management     (#settings-management) export / restore JSON (validated preview) / reset with confirmation
 *   SET-07 About               (#settings-about)      version, honest notes, open questions
 *   SET-08 Offline             (#settings-offline)    offline copy (service worker), storage used, persistence, clear cache,
 *                                                     outbox count, iOS notes (shared/offline-panel.js, dictionary 'fieldkit')
 *
 * Every change goes through the store (setSettings / setWeights / setThresholds / recordDataSourceResult). The view
 * listens to settings:change and syncs its controls in place (drafts and focused inputs are kept). Strings: dictionary
 * 'settings' (js/i18n/settings.js). Data reaches the DOM only through textContent / components.h.
 */

import { i18n } from '../core/i18n.js';
import * as storeModule from '../core/store.js';
import dict from '../i18n/settings.js';
import { openImportPreview } from './shared/import-preview.js';
import { offlinePanel } from './shared/offline-panel.js';

i18n.register('settings', dict);

const APP_VERSION = '3.0.0';            // mirrors js/app.js
const SITE_URL = 'https://biltix.sa';
const SITE_LABEL = 'biltix.sa';
const RIYADH_TZ = 'Asia/Riyadh';
const MAX_BACKUP_BYTES = 20 * 1024 * 1024;
const MAX_FILE_BYTES = 5 * 1024 * 1024;
const DOMAINS = ['contract', 'bom', 'schedule', 'site', 'cost'];
const DOMAIN_ICON = { contract: 'file-text', bom: 'package', schedule: 'calendar', site: 'helmet', cost: 'chart' };
const SOURCE_TYPES = ['simulation', 'json', 'sheets', 'supabase'];
const STATUS_KEYS = ['demo', 'live', 'offline', 'stale', 'error', 'not_connected'];
const BACKUP_COLLECTIONS = ['risks', 'incidents', 'permits', 'inspections', 'integrations', 'feed'];
const PLATFORM_COLLECTIONS = ['aiRisks', 'tasks', 'alerts'];
const GAP = Number(storeModule.THRESHOLD_GAP) || 5;
const FALLBACK_PLATFORM = { weights: { contract: 0.2, bom: 0.2, schedule: 0.25, site: 0.2, cost: 0.15 }, alertThreshold: 60, criticalThreshold: 85 };
const DEFAULTS = (storeModule.DEFAULT_SETTINGS && storeModule.DEFAULT_SETTINGS.platform) || FALLBACK_PLATFORM;
/** Accepted import columns (headers: Arabic template header · English alias). */
const IMPORT_COLUMNS = [
  { key: 'code', ar: 'الكود', en: 'code', required: false },
  { key: 'site', ar: 'الموقع', en: 'site', required: true },
  { key: 'category', ar: 'الفئة', en: 'category', required: true },
  { key: 'hazard', ar: 'الخطر', en: 'hazard', required: true },
  { key: 'activity', ar: 'النشاط', en: 'activity', required: false },
  { key: 'likelihood', ar: 'الاحتمالية', en: 'likelihood', required: true },
  { key: 'severity', ar: 'الشدة', en: 'severity', required: true },
  { key: 'owner', ar: 'المالك', en: 'owner', required: false },
  { key: 'dueDate', ar: 'تاريخ الاستحقاق', en: 'due date', required: true },
  { key: 'status', ar: 'الحالة', en: 'status', required: false },
];

const SECTIONS = [
  { id: 'language', anchor: 'settings-language', code: 'SET-01', icon: 'globe' },
  { id: 'appearance', anchor: 'settings-appearance', code: 'SET-02', icon: 'theme' },
  { id: 'scoring', anchor: 'settings-scoring', code: 'SET-03', icon: 'sliders' },
  { id: 'data', anchor: 'settings-data', code: 'SET-04', icon: 'layers' },
  { id: 'offline', anchor: 'settings-offline', code: 'SET-08', icon: 'offline', labelKey: 'fieldkit.settings.nav' },
  { id: 'notifications', anchor: 'settings-notifications', code: 'SET-05', icon: 'bell' },
  { id: 'management', anchor: 'settings-management', code: 'SET-06', icon: 'folder' },
  { id: 'about', anchor: 'settings-about', code: 'SET-07', icon: 'info' },
];
const SECTION_ALIASES = {
  language: 'settings-language', lang: 'settings-language', region: 'settings-language', numerals: 'settings-language',
  appearance: 'settings-appearance', theme: 'settings-appearance', background: 'settings-appearance', motion: 'settings-appearance',
  scoring: 'settings-scoring', weights: 'settings-weights', thresholds: 'settings-thresholds', bands: 'settings-bands',
  data: 'settings-data', connectivity: 'settings-data', datasource: 'settings-source', source: 'settings-source', import: 'settings-import',
  notifications: 'settings-notifications', webhook: 'settings-notifications',
  management: 'settings-management', backup: 'settings-management', reset: 'settings-management',
  about: 'settings-about',
  offline: 'settings-offline', field: 'settings-offline', cache: 'settings-offline',
};

const STYLE_ID = 'view-settings-style';
const STYLE_TEXT = `
.view-settings .set-layout { display: grid; grid-template-columns: minmax(0, 1fr); gap: var(--gap); align-items: start; }
.view-settings .set-sections { display: flex; flex-direction: column; gap: var(--gap); min-inline-size: 0; }
.view-settings .set-nav { min-inline-size: 0; }
.view-settings .set-nav-list { list-style: none; margin: 0; padding: 0; display: flex; gap: 6px; overflow-x: auto; scrollbar-width: thin; padding-block-end: 4px; }
.view-settings .set-nav-item { display: inline-flex; align-items: center; gap: 8px; min-block-size: 40px; padding: 8px 12px; border-radius: var(--radius-md); border: 1px solid var(--line); background: var(--bg-1); color: var(--ink-2); font: inherit; font-size: var(--fs-sm); cursor: pointer; white-space: nowrap; text-align: start; }
.view-settings .set-nav-item:hover { color: var(--ink-1); border-color: var(--line-2); }
.view-settings .set-nav-item[aria-current="true"] { color: var(--ink-1); border-color: color-mix(in srgb, var(--brand) 55%, var(--line)); background: color-mix(in srgb, var(--brand) 12%, var(--bg-1)); }
.view-settings .set-nav-item > svg { flex: none; color: var(--ink-3); }
.view-settings .set-nav-item[aria-current="true"] > svg { color: var(--brand-text); }
.view-settings .set-nav-code { font-family: var(--font-mono); font-size: 11px; color: var(--ink-3); margin-inline-start: auto; display: none; }
@container main (min-width: 1080px) { .view-settings .set-nav-code { display: inline; } }
@container main (min-width: 1080px) {
  .view-settings .set-layout { grid-template-columns: 236px minmax(0, 1fr); }
  .view-settings .set-nav { position: sticky; inset-block-start: var(--space-4); }
  .view-settings .set-nav-list { flex-direction: column; overflow: visible; padding: 0; }
  .view-settings .set-nav-item { inline-size: 100%; white-space: normal; border-color: transparent; background: transparent; }
  .view-settings .set-nav-item[aria-current="true"] { border-color: color-mix(in srgb, var(--brand) 45%, var(--line)); }
}
.view-settings .set-anchor { scroll-margin-block-start: var(--space-4); }
@media (max-width: 959.98px) { .view-settings .set-anchor { scroll-margin-block-start: calc(var(--appbar-h) + var(--space-4)); } }
.view-settings .set-group { display: flex; flex-direction: column; gap: var(--space-3); min-inline-size: 0; }
.view-settings .set-group + .set-group { border-block-start: 1px solid var(--line); padding-block-start: var(--space-5); }
.view-settings .set-grid > .set-group + .set-group { border-block-start: 0; padding-block-start: 0; }
@container card (max-width: 760px) { .view-settings .set-grid > .set-group + .set-group { border-block-start: 1px solid var(--line); padding-block-start: var(--space-5); } }
.view-settings .set-field > .seg, .view-settings .set-field > .set-choices + * { align-self: flex-start; }
.view-settings .set-rating { align-self: flex-start; }
.view-settings .set-th-fields .field-control { max-inline-size: 12rem; }
.view-settings .set-group-head { display: flex; flex-direction: column; gap: 4px; }
.view-settings .set-group-head .t-card { margin: 0; font-size: var(--fs-md); }
.view-settings .set-group-head .t-helper { margin: 0; max-inline-size: 78ch; }
.view-settings .set-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--space-5) var(--space-6); }
@container card (max-width: 760px) { .view-settings .set-grid { grid-template-columns: minmax(0, 1fr); } }
.view-settings .set-field { display: flex; flex-direction: column; gap: 8px; min-inline-size: 0; }
.view-settings .set-field > .t-label { color: var(--ink-1); font-weight: 600; }
.view-settings .set-field .seg, .view-settings .set-wrapseg { max-inline-size: 100%; flex-wrap: wrap; overflow: visible; }
.view-settings .set-wrapseg.is-block .seg-btn { flex: 1 1 auto; }
.view-settings .set-desc { margin: 0; font-size: var(--fs-sm); color: var(--ink-2); line-height: 1.55; }
.view-settings .set-example { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: var(--space-2); margin: 0; }
@container card (max-width: 640px) { .view-settings .set-example { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
.view-settings .set-fact { display: flex; flex-direction: column; gap: 2px; padding: 10px 12px; border-radius: var(--radius-md); background: var(--bg-2); border: 1px solid var(--line); min-inline-size: 0; }
.view-settings .set-fact dt { font-size: var(--fs-xs); color: var(--ink-2); }
.view-settings .set-fact dd { margin: 0; font-size: var(--fs-md); color: var(--ink-1); font-variant-numeric: tabular-nums; overflow-wrap: anywhere; }
.view-settings .set-choices { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: var(--space-2); }
@container card (max-width: 640px) { .view-settings .set-choices { grid-template-columns: minmax(0, 1fr); } }
.view-settings .set-choice { display: grid; grid-template-columns: 44px minmax(0, 1fr); gap: 10px; align-items: start; text-align: start; padding: 12px; border-radius: var(--radius-md); border: 1px solid var(--line-strong); background: var(--bg-1); color: var(--ink-1); font: inherit; cursor: pointer; min-block-size: 44px; }
.view-settings .set-choice:hover { border-color: var(--ink-3); }
.view-settings .set-choice[aria-checked="true"] { border-color: var(--brand); box-shadow: inset 0 0 0 1px var(--brand); background: color-mix(in srgb, var(--brand) 8%, var(--bg-1)); }
.view-settings .set-choice-swatch { inline-size: 44px; block-size: 44px; border-radius: 8px; border: 1px solid var(--line); background: var(--bg-0); position: relative; overflow: hidden; }
.view-settings .set-choice-swatch.is-subtle { background: radial-gradient(circle at 70% 20%, color-mix(in srgb, var(--accent) 22%, transparent), transparent 60%), var(--bg-0); }
.view-settings .set-choice-swatch.is-cinematic { background: radial-gradient(circle at 25% 25%, color-mix(in srgb, var(--brand) 40%, transparent), transparent 55%), radial-gradient(circle at 80% 80%, color-mix(in srgb, var(--accent) 34%, transparent), transparent 55%), var(--bg-0); }
.view-settings .set-choice-swatch::after { content: ""; position: absolute; inset: 0; background-image: linear-gradient(var(--line) 1px, transparent 1px), linear-gradient(90deg, var(--line) 1px, transparent 1px); background-size: 11px 11px; opacity: .35; }
.view-settings .set-choice-swatch.is-static::after { opacity: 0; }
.view-settings .set-choice-text { display: flex; flex-direction: column; gap: 2px; min-inline-size: 0; }
.view-settings .set-choice-title { font-weight: 600; font-size: var(--fs-sm); display: flex; align-items: center; gap: 6px; }
.view-settings .set-choice-title > svg { color: var(--brand-text); }
.view-settings .set-choice-desc { font-size: var(--fs-xs); color: var(--ink-2); line-height: 1.5; }
.view-settings .set-wtable { display: flex; flex-direction: column; }
.view-settings .set-wrow { display: grid; grid-template-columns: minmax(0, 1.5fr) minmax(108px, 128px) minmax(0, 1fr); gap: 8px 16px; align-items: center; padding-block: 10px; border-block-end: 1px solid var(--line); }
.view-settings .set-wrow.is-head { padding-block: 0 6px; font-size: var(--fs-xs); color: var(--ink-3); font-weight: 500; }
.view-settings .set-wdomain { display: flex; align-items: center; gap: 10px; min-inline-size: 0; }
.view-settings .set-wdomain > svg { flex: none; color: var(--ink-3); }
.view-settings .set-wname { display: flex; flex-direction: column; gap: 2px; min-inline-size: 0; }
.view-settings .set-wname strong { font-size: var(--fs-sm); font-weight: 600; color: var(--ink-1); }
.view-settings .set-wscore { display: inline-flex; align-items: center; gap: 6px; font-size: var(--fs-xs); color: var(--ink-2); flex-wrap: wrap; }
.view-settings .set-pct { display: flex; align-items: center; gap: 6px; direction: ltr; }
.view-settings .set-pct .field-control { inline-size: 100%; min-inline-size: 0; text-align: center; font-variant-numeric: tabular-nums; }
.view-settings .set-pct-unit { color: var(--ink-3); font-size: var(--fs-sm); }
.view-settings .set-bar { block-size: 8px; border-radius: var(--radius-pill); background: var(--bg-3); overflow: hidden; }
.view-settings .set-bar-fill { block-size: 100%; border-radius: inherit; background: var(--brand); transition: inline-size var(--dur-micro) var(--ease-out); }
.view-settings .set-werr { grid-column: 1 / -1; margin: 0; }
.view-settings .set-wrow.is-invalid .field-control { border-color: var(--critical); }
@container card (max-width: 560px) {
  .view-settings .set-wrow { grid-template-columns: minmax(0, 1fr) minmax(100px, 116px); }
  .view-settings .set-wrow .set-bar { grid-column: 1 / -1; }
  .view-settings .set-wrow.is-head > :last-child { display: none; }
}
.view-settings .set-total { display: flex; align-items: center; justify-content: space-between; gap: var(--space-3); flex-wrap: wrap; padding-block: 12px 4px; }
.view-settings .set-total-label { font-weight: 600; color: var(--ink-1); display: flex; align-items: baseline; gap: 10px; }
.view-settings .set-total-value { font-size: var(--fs-xl); font-variant-numeric: tabular-nums; unicode-bidi: isolate; }
.view-settings .set-check { display: inline-flex; align-items: center; gap: 6px; font-size: var(--fs-sm); font-weight: 500; }
.view-settings .set-check.is-ok { color: var(--good-text); }
.view-settings .set-check.is-bad { color: var(--critical-text); }
.view-settings .set-preview { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)) minmax(0, 1.2fr); gap: var(--space-2); align-items: stretch; }
@container card (max-width: 620px) { .view-settings .set-preview { grid-template-columns: repeat(2, minmax(0, 1fr)); } .view-settings .set-preview > :last-child { grid-column: 1 / -1; } }
.view-settings .set-score { display: flex; flex-direction: column; gap: 6px; padding: 12px; border-radius: var(--radius-md); background: var(--bg-2); border: 1px solid var(--line); min-inline-size: 0; }
.view-settings .set-score .t-label { font-size: var(--fs-xs); }
.view-settings .set-score-value { display: flex; align-items: baseline; gap: 4px; direction: ltr; justify-content: flex-start; }
:root[dir="rtl"] .view-settings .set-score-value { justify-content: flex-end; }
.view-settings .set-score-value .t-metric { font-size: var(--fs-2xl); }
.view-settings .set-score-scale { color: var(--ink-3); font-size: var(--fs-sm); }
.view-settings .set-actions { display: flex; align-items: center; gap: var(--space-2); flex-wrap: wrap; }
.view-settings .set-actions .set-dirty { margin-inline-start: auto; font-size: var(--fs-xs); color: var(--ink-3); display: inline-flex; align-items: center; gap: 6px; }
.view-settings .set-actions .set-dirty.is-dirty { color: var(--warning-text); }
.view-settings .set-scale { position: relative; padding-block: 4px 34px; }
.view-settings .set-scale-track { display: flex; block-size: 12px; border-radius: var(--radius-pill); overflow: hidden; gap: 2px; }
.view-settings .set-scale-band { block-size: 100%; }
.view-settings .set-scale-band.is-green { background: color-mix(in srgb, var(--good) 55%, var(--bg-3)); }
.view-settings .set-scale-band.is-yellow { background: color-mix(in srgb, var(--warning) 60%, var(--bg-3)); }
.view-settings .set-scale-band.is-red { background: color-mix(in srgb, var(--critical) 60%, var(--bg-3)); }
.view-settings .set-scale-marker { position: absolute; inset-block-start: 0; display: flex; flex-direction: column; align-items: center; }
:root[dir="rtl"] .view-settings .set-scale-marker { transform: translateX(50%); }
:root[dir="ltr"] .view-settings .set-scale-marker { transform: translateX(-50%); }
.view-settings .set-scale-marker::before { content: ""; inline-size: 3px; block-size: 20px; border-radius: 2px; background: var(--ink-1); box-shadow: 0 0 0 2px var(--bg-1); }
.view-settings .set-scale-marker span { margin-block-start: 2px; font-size: 11px; font-weight: 600; color: var(--ink-1); white-space: nowrap; background: var(--bg-1); padding-inline: 4px; border-radius: 4px; }
.view-settings .set-scale-ticks { position: absolute; inset-inline: 0; inset-block-end: 0; block-size: 14px; font-size: 11px; color: var(--ink-3); font-variant-numeric: tabular-nums; }
.view-settings .set-scale-ticks span { position: absolute; }
.view-settings .set-scale-ticks span:first-child { inset-inline-start: 0; }
.view-settings .set-scale-ticks span:last-child { inset-inline-end: 0; }
.view-settings .set-impact { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: var(--space-2); margin: 0; }
@container card (max-width: 520px) { .view-settings .set-impact { grid-template-columns: minmax(0, 1fr); } }
/* "current › next" follows the reading direction: in RTL the row runs right to left and the Bidi-mirrored › draws as ‹. */
.view-settings .set-impact .set-fact dd { display: flex; align-items: baseline; gap: 8px; justify-content: flex-start; }
.view-settings .set-impact .set-fact dt { display: inline-flex; align-items: center; gap: 6px; }
.view-settings .set-arrow { color: var(--ink-3); font-size: var(--fs-sm); }
.view-settings .set-bands { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: var(--space-2); }
@container card (max-width: 640px) { .view-settings .set-bands { grid-template-columns: minmax(0, 1fr); } }
.view-settings .set-band { display: flex; flex-direction: column; gap: 6px; padding: 12px; border-radius: var(--radius-md); background: var(--bg-2); border: 1px solid var(--line); border-inline-start-width: 3px; }
.view-settings .set-band.is-red { border-inline-start-color: var(--critical); }
.view-settings .set-band.is-yellow { border-inline-start-color: var(--warning); }
.view-settings .set-band.is-green { border-inline-start-color: var(--good); }
.view-settings .set-band-range { font-size: var(--fs-sm); color: var(--ink-1); font-weight: 600; font-variant-numeric: tabular-nums; }
.view-settings .set-band-hint { font-size: var(--fs-xs); color: var(--ink-2); }
.view-settings .set-rating { display: inline-flex; align-items: center; gap: 5px; font-size: var(--fs-xs); font-weight: 600; padding: 1px 8px; border-radius: var(--radius-pill); border: 1px solid var(--line-2); background: var(--bg-1); white-space: nowrap; }
.view-settings .set-rating.is-red { color: var(--critical-text); border-color: color-mix(in srgb, var(--critical) 45%, var(--line)); }
.view-settings .set-rating.is-yellow { color: var(--warning-text); border-color: color-mix(in srgb, var(--warning) 45%, var(--line)); }
.view-settings .set-rating.is-green { color: var(--good-text); border-color: color-mix(in srgb, var(--good) 45%, var(--line)); }
.view-settings .set-status { display: flex; align-items: flex-start; gap: var(--space-3); flex-wrap: wrap; }
.view-settings .set-status-desc { flex: 1 1 260px; margin: 0; font-size: var(--fs-sm); color: var(--ink-2); line-height: 1.55; }
.view-settings .set-legend { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px var(--space-4); }
@container card (max-width: 640px) { .view-settings .set-legend { grid-template-columns: minmax(0, 1fr); } }
.view-settings .set-legend li { display: grid; grid-template-columns: 120px minmax(0, 1fr); gap: 10px; align-items: start; font-size: var(--fs-xs); color: var(--ink-2); line-height: 1.5; }
.view-settings .set-legend li.is-current { color: var(--ink-1); }
.view-settings .set-legend .status-badge { justify-self: start; }
.view-settings .set-kv { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 180px), 1fr)); gap: var(--space-2); margin: 0; }
.view-settings .set-result:empty { display: none; }
.view-settings .set-fields { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 240px), 1fr)); gap: var(--space-3) var(--space-4); }
.view-settings .set-fields .field[hidden] { display: none; }
.view-settings .set-fold > summary { cursor: pointer; font-size: var(--fs-sm); font-weight: 600; color: var(--ink-2); min-block-size: 40px; display: flex; align-items: center; gap: 8px; }
.view-settings .set-fold > summary:hover { color: var(--ink-1); }
.view-settings .set-cols td:first-child { white-space: nowrap; }
.view-settings .set-list { margin: 0; padding-inline-start: 1.2em; display: flex; flex-direction: column; gap: 6px; font-size: var(--fs-sm); color: var(--ink-2); line-height: 1.6; }
.view-settings .set-list li::marker { color: var(--ink-3); }
.view-settings .set-danger { display: flex; align-items: center; justify-content: space-between; gap: var(--space-3); flex-wrap: wrap; padding: 12px 14px; border-radius: var(--radius-md); border: 1px solid color-mix(in srgb, var(--critical) 35%, var(--line)); background: color-mix(in srgb, var(--critical) 5%, var(--bg-1)); }
.view-settings .set-danger-text { display: flex; flex-direction: column; gap: 2px; min-inline-size: 0; flex: 1 1 260px; }
.view-settings .set-ltr { direction: ltr; unicode-bidi: isolate; }
.view-settings .num { font-variant-numeric: tabular-nums; }
.view-settings .set-flash { animation: none; }
`;

/* ────────────────────────────── helpers ────────────────────────────── */

const arr = (v) => (Array.isArray(v) ? v : []);
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const safe = (fn, fallback) => { try { const v = fn(); return v === undefined ? fallback : v; } catch { return fallback; } };
const HTTPS_RE = /^https:\/\/[^\s]+$/i;

/** Date + 24 h time in Riyadh time (the product's reference zone), numerals and calendar from fmt.locale(). */
function riyadhDateTime(fmt, iso) {
  const d = iso instanceof Date ? iso : new Date(iso);
  if (!Number.isFinite(d.getTime())) return '—';
  try {
    const loc = fmt.locale();
    const date = new Intl.DateTimeFormat(loc, { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Riyadh' }).format(d);
    const time = new Intl.DateTimeFormat(loc, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: 'Asia/Riyadh' }).format(d);
    return `${date}${/^ar/.test(loc) ? '،' : ','} ${time}`;
  } catch { return fmt.dateTime(d); }
}

function ensureStyle() {
  if (typeof document === 'undefined' || document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = STYLE_TEXT;
  document.head.appendChild(style);
}

function isHttpsUrl(value) {
  const s = String(value || '').trim();
  if (!HTTPS_RE.test(s)) return false;
  try { return new URL(s).protocol === 'https:'; } catch { return false; }
}

function isoDate(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

async function readFileText(file) {
  if (typeof file.text === 'function') return file.text();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error || new Error('read failed'));
    reader.readAsText(file, 'utf-8');
  });
}

function storageAvailable() {
  try { const k = 'biltix-hse:probe'; localStorage.setItem(k, '1'); localStorage.removeItem(k); return true; } catch { return false; }
}

/* ────────────────────────────── the view ────────────────────────────── */

function render(container, ctx) {
  const { store, bus, fmt, components, router, psel } = ctx;
  const sources = ctx.sources || {};
  const status = ctx.status || (typeof window !== 'undefined' && window.biltix && window.biltix.status) || null;
  const motion = ctx.motion || components.motion || null;
  const { h, card, button, segmented, toast, modal, formField, glyph, svgIcon, statusBadge } = components;
  const t = (k, p) => i18n.t(k, p);
  const tn = (k, n, p) => i18n.tn(k, n, p);
  const en = () => i18n.lang() === 'en';
  const msgOf = (r) => String((en() ? (r && (r.messageEn || r.message)) : (r && (r.message || r.messageEn))) || '');
  const settings = () => (store.state && store.state.settings) || {};
  const platformSettings = () => (isObj(settings().platform) ? settings().platform : {});
  const now = () => (typeof store.now === 'function' ? store.now() : new Date());
  const params = ctx.params || {};
  const subs = [];
  const timers = new Set();
  let uidCounter = 0;
  const uid = (p) => `set-${p}-${(++uidCounter).toString(36)}`;
  ensureStyle();

  function later(fn, ms) {
    const id = setTimeout(() => { timers.delete(id); fn(); }, ms);
    timers.add(id);
    return id;
  }
  function save(patch, message, tone = 'good') {
    try {
      store.setSettings(patch);
      if (message) toast(message, { tone, timeout: 2600 });
      return true;
    } catch {
      toast(t('settings.saveFailed'), { tone: 'serious' });
      return false;
    }
  }
  const pct = (n, d = 0) => fmt.pct(n, d);
  const numStr = (n, d = 0) => fmt.num(n, { maximumFractionDigits: d });
  const relSafe = (iso) => { const ms = Date.parse(iso); if (!Number.isFinite(ms)) return '—'; return fmt.relative(new Date(Math.min(ms, now().getTime())), now()); };
  function riyadh(date, opts) {
    try { return new Intl.DateTimeFormat(fmt.locale(), { ...opts, timeZone: RIYADH_TZ }).format(date); } catch { return opts.hour ? fmt.time(date) : fmt.date(date); }
  }
  function ratingOf(score) {
    if (psel && typeof psel.rating === 'function') { try { return psel.rating(score); } catch { /* fall through */ } }
    return score >= 70 ? 'red' : score >= 40 ? 'yellow' : 'green';
  }
  const RATING_TONE = { red: 'critical', yellow: 'warning', green: 'good' };
  function ratingChip(r) {
    return h('span', { class: ['set-rating', `is-${r}`], 'data-rating': r }, glyph(RATING_TONE[r] || 'neutral', 12), h('span', {}, i18n.label('rating', r)));
  }
  /** Number + "/100" in one LTR run. */
  function score100(value) {
    return h('span', { class: 'set-score-value' }, h('span', { class: 't-metric' }, Number.isFinite(value) ? numStr(value) : '—'), h('span', { class: 'set-score-scale' }, `/${numStr(100)}`));
  }
  /** Parse user input in either numeral system ("٢٠٫٥" / "20.5"); NaN when empty or not a number. */
  function parseNum(value) {
    const s = String(value ?? '').trim();
    if (!s) return NaN;
    const n = typeof fmt.parseSigned === 'function' ? fmt.parseSigned(s) : Number(s);
    return Number.isFinite(n) ? n : NaN;
  }
  const sizeText = (bytes) => (bytes >= 1024 * 1024 ? t('settings.manage.mb', { n: fmt.num(bytes / (1024 * 1024), { maximumFractionDigits: 1 }) }) : t('settings.manage.kb', { n: fmt.num(bytes / 1024, { maximumFractionDigits: 0 }) }));
  /** https (http only for a loopback dev server) — same rule as sources.validateUrl. */
  const validUrl = (u) => (typeof sources.validateUrl === 'function' ? Boolean(safe(() => sources.validateUrl(String(u || '').trim()), null)) : isHttpsUrl(u));
  const scrollBehavior = () => (motion && typeof motion.enabled === 'function' && motion.enabled() ? 'smooth' : 'auto');

  function field({ label, hint, control, id = uid('fld') }) {
    const labelId = `${id}-l`;
    const hintId = hint ? `${id}-h` : null;
    const el = control.el || control;
    el.setAttribute('aria-labelledby', labelId);
    if (hintId) el.setAttribute('aria-describedby', hintId);
    return h('div', { class: 'set-field' },
      h('span', { class: 't-label', id: labelId }, label),
      el,
      hint ? h('p', { class: 't-helper', id: hintId, style: { margin: 0 } }, hint) : null);
  }
  function group({ id = null, title, helper = null, children = [] }) {
    return h('div', { class: ['set-group', id ? 'set-anchor' : null], id: id || undefined, tabindex: id ? '-1' : undefined },
      h('div', { class: 'set-group-head' }, h('h3', { class: 't-card' }, title), helper ? h('p', { class: 't-helper' }, helper) : null),
      ...children);
  }
  function note(tone, text, extra = null) {
    return h('div', { class: 'note', role: tone === 'critical' ? 'alert' : 'status', style: { '--tone': `var(--${tone === 'neutral' ? 'line-2' : tone})` } },
      h('span', { class: 'row gap-2', style: { alignItems: 'flex-start' } }, glyph(tone, 14), h('span', {}, text)),
      extra ? h('div', { class: 'text-xs muted', style: { marginBlockStart: '4px' } }, extra) : null);
  }
  /** Busy state without `disabled`, so keyboard focus stays on the button while the request runs. */
  function busy(btn, on, label = null) {
    if (!btn) return;
    if (on) { btn.setAttribute('aria-busy', 'true'); btn.setAttribute('aria-disabled', 'true'); } else { btn.removeAttribute('aria-busy'); btn.removeAttribute('aria-disabled'); }
    const lab = btn.querySelector('.btn-label');
    if (lab && label !== null) lab.textContent = label;
  }

  /* ════════════════ head ════════════════ */

  const storageOk = storageAvailable();
  const head = h('div', { class: 'view-head' },
    h('div', { class: 'view-head-text' },
      h('span', { class: 'code-tag' }, 'SEC-11'),
      h('h1', { tabindex: '-1' }, t('settings.title')),
      h('p', { class: 'view-lead' }, t('settings.lead'))),
    h('div', { class: 'view-actions' },
      components.badge(storageOk ? t('settings.storageOk') : t('settings.storageOff'), storageOk ? 'good' : 'warning', { icon: svgIcon(storageOk ? 'lock' : 'alert-circle', 14) })));

  /* ════════════════ SET-01 Language & region ════════════════ */

  const langSeg = segmented({
    options: [{ value: 'ar', label: t('core.lang.ar') }, { value: 'en', label: t('core.lang.en') }],
    value: i18n.lang(),
    ariaLabel: t('settings.language.label'),
    onChange: (v) => {
      if (v === i18n.lang()) return;
      langSeg.el.setAttribute('aria-busy', 'true');
      const p = typeof i18n.setLang === 'function' ? i18n.setLang(v) : null;
      if (!p) save({ lang: v });
      else p.catch(() => save({ lang: v }));
    },
  });
  // Each language name is written in its own language (the Arabic option keeps lang="ar").
  langSeg.el.querySelectorAll('.seg-btn').forEach((b) => { const v = b.getAttribute('data-value'); b.setAttribute('lang', v); b.setAttribute('dir', v === 'ar' ? 'rtl' : 'ltr'); });
  const numeralsSeg = segmented({
    options: [
      { value: 'latn', label: `${t('settings.language.latn')} 0123` },
      { value: 'arab', label: `${t('settings.language.arab')} ٠١٢٣` },
    ],
    value: settings().numerals === 'arab' ? 'arab' : 'latn',
    ariaLabel: t('settings.language.numerals'),
    onChange: (v) => save({ numerals: v }),
  });
  // The Arabic-Indic sample digits are intentionally Arabic script.
  numeralsSeg.el.querySelectorAll('.seg-btn[data-value="arab"] > span').forEach((s) => { s.textContent = ''; s.append(t('settings.language.arab'), ' ', h('span', { lang: 'ar', dir: 'rtl' }, '٠١٢٣')); });
  numeralsSeg.el.querySelectorAll('.seg-btn[data-value="latn"] > span').forEach((s) => { s.textContent = ''; s.append(t('settings.language.latn'), ' ', h('span', { lang: 'en', dir: 'ltr' }, '0123')); });
  const calSeg = segmented({
    options: [
      { value: 'gregorian', label: t('settings.language.gregorian') },
      { value: 'hijri', label: t('settings.language.hijri') },
      { value: 'both', label: t('settings.language.both') },
    ],
    value: ['gregorian', 'hijri', 'both'].includes(settings().calendar) ? settings().calendar : 'both',
    ariaLabel: t('settings.language.calendar'),
    onChange: (v) => save({ calendar: v }),
  });
  const exampleHost = h('dl', { class: 'set-example', 'aria-live': 'polite' });
  function paintExample() {
    const d = now();
    const cal = ['gregorian', 'hijri', 'both'].includes(settings().calendar) ? settings().calendar : 'both';
    const facts = [
      [t('settings.language.exNumber'), fmt.num(1234567.5, { maximumFractionDigits: 1 })],
      [t('settings.language.exPercent'), fmt.pct(87.5, 1)],
      [t('settings.language.exCurrency'), typeof fmt.currency === 'function' ? fmt.currency(1250000) : fmt.num(1250000)],
    ];
    if (cal !== 'hijri') facts.push([t('settings.language.exDate'), riyadh(d, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })]);
    if (cal !== 'gregorian') facts.push([t('settings.language.exHijri'), fmt.hijri(d)]);
    facts.push([t('settings.language.exTime'), riyadh(d, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })]);
    exampleHost.replaceChildren(...facts.map(([k, v]) => h('div', { class: 'set-fact' }, h('dt', {}, k), h('dd', { class: 'num' }, h('bdi', {}, v)))));
  }
  paintExample();

  const languageCard = card({
    id: 'settings-language', code: 'SET-01', title: t('settings.sections.language'), subtitle: t('settings.sectionSub.language'), className: 'set-anchor',
    body: h('div', { class: 'stack gap-5' },
      h('div', { class: 'set-grid' },
        field({ label: t('settings.language.label'), hint: t('settings.language.hint'), control: langSeg }),
        field({ label: t('settings.language.numerals'), hint: t('settings.language.numeralsHint'), control: numeralsSeg }),
        field({ label: t('settings.language.calendar'), hint: t('settings.language.calendarHint'), control: calSeg })),
      h('div', { class: 'set-group' },
        h('div', { class: 'set-group-head' }, h('h3', { class: 't-card' }, t('settings.language.example')), h('p', { class: 't-helper' }, t('settings.language.tz'))),
        exampleHost)),
  });

  /* ════════════════ SET-02 Appearance ════════════════ */

  const themeSeg = segmented({
    options: [{ value: 'light', label: t('settings.appearance.light'), icon: svgIcon('sun', 14) }, { value: 'dark', label: t('settings.appearance.dark'), icon: svgIcon('moon', 14) }],
    value: settings().theme === 'dark' ? 'dark' : 'light',
    ariaLabel: t('settings.appearance.theme'),
    onChange: (v) => save({ theme: v }, t(`settings.appearance.themeDone.${v}`)),
  });
  const densitySeg = segmented({
    options: [{ value: 'comfortable', label: t('settings.appearance.comfortable') }, { value: 'compact', label: t('settings.appearance.compact') }],
    value: settings().appearance && settings().appearance.density === 'compact' ? 'compact' : 'comfortable',
    ariaLabel: t('settings.appearance.density'),
    onChange: (v) => save({ appearance: { density: v } }),
  });
  const motionOf = (s) => (s && ['auto', 'reduce', 'full'].includes(s.motion) ? s.motion : (s && s.reducedMotion ? 'reduce' : 'auto'));
  const motionDesc = h('p', { class: 'set-desc', 'aria-live': 'polite' }, t(`settings.appearance.motionDesc.${motionOf(settings())}`));
  const motionSeg = segmented({
    options: [{ value: 'auto', label: t('settings.appearance.motionAuto') }, { value: 'reduce', label: t('settings.appearance.motionReduce') }, { value: 'full', label: t('settings.appearance.motionFull') }],
    value: motionOf(settings()),
    ariaLabel: t('settings.appearance.motion'),
    onChange: (v) => { save({ motion: v, reducedMotion: v === 'reduce' }); motionDesc.textContent = t(`settings.appearance.motionDesc.${v}`); },
  });

  // Background: a radio group of three described choices (roving tabindex, arrows follow the reading direction).
  const bgLabelId = uid('bg');
  const bgGroup = h('div', { class: 'set-choices', role: 'radiogroup', 'aria-labelledby': bgLabelId });
  const bgButtons = new Map();
  const bgNow = () => { const b = settings().appearance && settings().appearance.background; return ['static', 'subtle', 'cinematic'].includes(b) ? b : 'subtle'; };
  ['static', 'subtle', 'cinematic'].forEach((mode) => {
    const descId = uid(`bgd-${mode}`);
    const btn = h('button', {
      type: 'button', role: 'radio', class: 'set-choice', 'data-value': mode, 'aria-describedby': descId,
      onClick: () => { if (bgNow() !== mode) save({ appearance: { background: mode } }); paintBg(mode); },
    },
    h('span', { class: ['set-choice-swatch', `is-${mode}`], 'aria-hidden': 'true' }),
    h('span', { class: 'set-choice-text' },
      h('span', { class: 'set-choice-title' }, t(`settings.appearance.bg.${mode}`)),
      h('span', { class: 'set-choice-desc', id: descId }, t(`settings.appearance.bg.${mode}Desc`, { seconds: numStr(60) }))));
    bgButtons.set(mode, btn);
    bgGroup.appendChild(btn);
  });
  function paintBg(mode = bgNow()) {
    for (const [m, b] of bgButtons) {
      const on = m === mode;
      b.setAttribute('aria-checked', on ? 'true' : 'false');
      b.tabIndex = on ? 0 : -1;
      const title = b.querySelector('.set-choice-title');
      const ic = title && title.querySelector('svg');
      if (on && !ic) title.appendChild(svgIcon('check', 14)); else if (!on && ic) ic.remove();
    }
  }
  bgGroup.addEventListener('keydown', (e) => {
    const rtl = i18n.dir() === 'rtl';
    const next = rtl ? 'ArrowLeft' : 'ArrowRight';
    const prev = rtl ? 'ArrowRight' : 'ArrowLeft';
    if (![next, prev, 'ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) return;
    const modes = Array.from(bgButtons.keys());
    let i = modes.indexOf(bgNow());
    if (e.key === next || e.key === 'ArrowDown') i = (i + 1) % modes.length;
    else if (e.key === prev || e.key === 'ArrowUp') i = (i - 1 + modes.length) % modes.length;
    else if (e.key === 'Home') i = 0; else i = modes.length - 1;
    e.preventDefault();
    const mode = modes[i];
    save({ appearance: { background: mode } });
    paintBg(mode);
    bgButtons.get(mode).focus();
  });
  paintBg();

  const legacyHost = h('div');
  function paintLegacyBrand() {
    const b = settings().brand || {};
    legacyHost.hidden = !b.primary && !b.accent;
    if (legacyHost.hidden) { legacyHost.replaceChildren(); return; }
    legacyHost.replaceChildren(h('div', { class: 'note', style: { '--tone': 'var(--warning)' } },
      h('div', { class: 'row between wrap gap-3' },
        h('span', { class: 'row gap-2' }, glyph('warning', 14), h('span', {}, t('settings.appearance.legacyBrand'))),
        button(t('settings.appearance.legacyBrandAction'), { variant: 'outline', size: 'sm', icon: 'refresh', onClick: () => save({ brand: { primary: '', accent: '' } }, t('settings.appearance.legacyBrandDone'), 'neutral') }))));
  }
  paintLegacyBrand();

  const appearanceCard = card({
    id: 'settings-appearance', code: 'SET-02', title: t('settings.sections.appearance'), subtitle: t('settings.sectionSub.appearance'), className: 'set-anchor',
    body: h('div', { class: 'stack gap-5' },
      legacyHost,
      h('div', { class: 'set-grid' },
        field({ label: t('settings.appearance.theme'), hint: t('settings.appearance.themeHint'), control: themeSeg }),
        field({ label: t('settings.appearance.density'), hint: t('settings.appearance.densityHint'), control: densitySeg })),
      h('div', { class: 'set-field' },
        h('span', { class: 't-label', id: bgLabelId }, t('settings.appearance.background')),
        bgGroup,
        h('p', { class: 't-helper', style: { margin: 0 } }, t('settings.appearance.backgroundHint'))),
      h('div', { class: 'set-field' },
        field({ label: t('settings.appearance.motion'), hint: t('settings.appearance.motionHint'), control: motionSeg }),
        motionDesc)),
  });

  /* ════════════════ SET-03 Risk scoring — weights ════════════════ */

  const savedWeights = () => {
    const w = isObj(platformSettings().weights) ? platformSettings().weights : DEFAULTS.weights;
    return Object.fromEntries(DOMAINS.map((k) => [k, Math.round(Number(w[k] || 0) * 1000) / 10]));
  };
  const toInput = (v) => fmt.num(v, { maximumFractionDigits: 1 });
  let wDraft = Object.fromEntries(DOMAINS.map((k) => [k, toInput(savedWeights()[k])]));
  const wRows = new Map();
  const domainLabel = (k) => i18n.label('aiCategory', k);
  const categoryScores = () => {
    const list = safe(() => psel.categoryScores(store.state, store.filters, now()), []);
    return Object.fromEntries(arr(list).map((c) => [c.category, c]));
  };
  let catScores = categoryScores();

  const wTable = h('div', { class: 'set-wtable', role: 'group', 'aria-label': t('settings.weights.title') },
    h('div', { class: 'set-wrow is-head', 'aria-hidden': 'true' }, h('span', {}, t('settings.weights.domain')), h('span', { style: { textAlign: 'center' } }, t('settings.weights.weight')), h('span', {}, t('settings.weights.share'))));
  DOMAINS.forEach((k) => {
    const inputId = uid(`w-${k}`);
    const errId = `${inputId}-err`;
    const input = h('input', { id: inputId, type: 'text', inputmode: 'decimal', class: 'field-control', autocomplete: 'off', spellcheck: 'false', value: wDraft[k], 'aria-label': t('settings.weights.inputLabel', { domain: domainLabel(k) }) });
    const scoreHost = h('span', { class: 'set-wscore' });
    const fill = h('div', { class: 'set-bar-fill' });
    const err = h('p', { class: 'field-error set-werr', id: errId, hidden: true });
    const row = h('div', { class: 'set-wrow' },
      h('div', { class: 'set-wdomain' }, svgIcon(DOMAIN_ICON[k] || 'sliders', 18), h('div', { class: 'set-wname' }, h('strong', {}, domainLabel(k)), scoreHost)),
      h('label', { class: 'set-pct', for: inputId }, input, h('span', { class: 'set-pct-unit', 'aria-hidden': 'true' }, fmt.getNumerals && fmt.getNumerals() === 'arab' ? '٪' : '%')),
      h('div', { class: 'set-bar', 'aria-hidden': 'true' }, fill),
      err);
    input.addEventListener('input', () => { wDraft[k] = input.value; paintWeights(); });
    input.addEventListener('blur', () => { const n = parseNum(input.value); if (Number.isFinite(n) && n >= 0 && n <= 100) { input.value = toInput(n); wDraft[k] = input.value; } });
    wRows.set(k, { row, input, scoreHost, fill, err, errId });
    wTable.appendChild(row);
  });
  function paintDomainScores() {
    for (const [k, ref] of wRows) {
      const c = catScores[k];
      ref.scoreHost.replaceChildren(...(c ? [h('span', {}, `${t('settings.weights.domainScore')}:`), h('bdi', { class: 'num' }, `${numStr(c.score)}/${numStr(100)}`), ratingChip(c.rating || ratingOf(c.score))] : []));
    }
  }
  paintDomainScores();

  const wTotalValue = h('span', { class: 'set-total-value' });
  const wTotalCheck = h('span', { class: 'set-check', 'aria-live': 'polite' });
  const wTotal = h('div', { class: 'set-total' }, h('span', { class: 'set-total-label' }, t('settings.weights.total'), wTotalValue), wTotalCheck);
  const wPreviewHost = h('div', { class: 'set-preview' });
  const wSaveBtn = button(t('settings.common.save'), { variant: 'primary', icon: 'check', onClick: () => saveWeights() });
  const wCancelBtn = button(t('settings.common.cancel'), { variant: 'ghost', onClick: () => { wDraft = Object.fromEntries(DOMAINS.map((k) => [k, toInput(savedWeights()[k])])); syncWeightInputs(true); paintWeights(); wRows.get(DOMAINS[0]).input.focus(); toast(t('settings.weights.cancelDone'), { tone: 'neutral', timeout: 2200 }); } });
  const wResetBtn = button(t('settings.common.reset'), { variant: 'outline', icon: 'refresh', onClick: () => { wDraft = Object.fromEntries(DOMAINS.map((k) => [k, toInput(Math.round(Number(DEFAULTS.weights[k]) * 1000) / 10)])); syncWeightInputs(true); paintWeights(); toast(t('settings.weights.resetDraft'), { tone: 'neutral', timeout: 3000 }); } });
  const wDirty = h('span', { class: 'set-dirty', 'aria-live': 'polite' });
  const wError = h('div', { class: 'set-result' });

  function weightState() {
    const values = {};
    const errors = {};
    let sum = 0;
    let numeric = true;
    for (const k of DOMAINS) {
      const n = parseNum(wDraft[k]);
      if (!Number.isFinite(n)) { errors[k] = t('settings.weights.errNumber', { min: numStr(0), max: numStr(100) }); numeric = false; continue; }
      if (n < 0 || n > 100) { errors[k] = t('settings.weights.errRange', { min: pct(0), max: pct(100) }); numeric = false; }
      values[k] = n;
      sum += n;
    }
    sum = Math.round(sum * 100) / 100;
    const sumOk = numeric && Math.abs(sum - 100) <= 0.1;
    const saved = savedWeights();
    const dirty = DOMAINS.some((k) => !Number.isFinite(values[k]) || Math.abs(values[k] - saved[k]) > 0.001);
    return { values, errors, sum, numeric, sumOk, valid: numeric && sumOk, dirty };
  }
  function previewScore(fractions) {
    const st = store.state;
    const patched = { ...st, settings: { ...st.settings, platform: { ...(st.settings && st.settings.platform), weights: fractions } } };
    return safe(() => psel.consolidatedScore(patched, store.filters, now()), null);
  }
  function paintWeights() {
    const s = weightState();
    for (const [k, ref] of wRows) {
      const e = s.errors[k];
      ref.row.classList.toggle('is-invalid', Boolean(e));
      ref.input.setAttribute('aria-invalid', e ? 'true' : 'false');
      if (e) { ref.err.hidden = false; ref.err.replaceChildren(glyph('critical', 14), h('span', {}, e)); ref.input.setAttribute('aria-describedby', ref.errId); } else { ref.err.hidden = true; ref.err.replaceChildren(); ref.input.removeAttribute('aria-describedby'); }
      const v = Number.isFinite(s.values[k]) ? Math.max(0, Math.min(100, s.values[k])) : 0;
      ref.fill.style.inlineSize = `${v}%`;
    }
    wTotalValue.textContent = s.numeric ? pct(s.sum, 1) : '—';
    const diff = Math.round((s.sum - 100) * 10) / 10;
    wTotalCheck.className = ['set-check', s.sumOk ? 'is-ok' : 'is-bad'].join(' ');
    wTotalCheck.replaceChildren(glyph(s.sumOk ? 'good' : 'critical', 14), h('span', {}, s.sumOk
      ? t('settings.weights.totalOk', { total: pct(100) })
      : (s.numeric ? t('settings.weights.totalBad', { sum: pct(s.sum, 1), total: pct(100), diff: fmt.signedPct ? fmt.signedPct(diff, 1) : pct(diff, 1) }) : t('settings.weights.errNumber', { min: numStr(0), max: numStr(100) }))));
    // preview
    const current = safe(() => psel.consolidatedScore(store.state, store.filters, now()), null);
    const curScore = current ? Number(current.score) : NaN;
    let next = null;
    if (s.valid) next = previewScore(Object.fromEntries(DOMAINS.map((k) => [k, Math.round((s.values[k] / 100) * 1e6) / 1e6])));
    const nextScore = next ? Number(next.score) : NaN;
    const scoreBox = (label, value) => h('div', { class: 'set-score' }, h('span', { class: 't-label' }, label), score100(value), Number.isFinite(value) ? ratingChip(ratingOf(value)) : null);
    wPreviewHost.replaceChildren(
      scoreBox(t('settings.common.current'), curScore),
      s.valid ? scoreBox(t('settings.common.draft'), nextScore) : h('div', { class: 'set-score' }, h('span', { class: 't-label' }, t('settings.common.draft')), h('span', { class: 'set-desc' }, t('settings.weights.previewInvalid', { total: pct(100) }))),
      h('div', { class: 'set-score' },
        h('span', { class: 't-label' }, t('settings.weights.preview')),
        s.valid && Number.isFinite(curScore) && Number.isFinite(nextScore)
          ? h('span', { class: 'set-desc' }, t('settings.weights.previewDelta', { delta: '' }), h('bdi', { class: 'num', dir: 'ltr' }, fmt.signed(nextScore - curScore)))
          : null,
        h('span', { class: 't-helper' }, t('settings.weights.previewHint'))));
    wSaveBtn.disabled = !(s.valid && s.dirty);
    wCancelBtn.disabled = !s.dirty;
    wDirty.classList.toggle('is-dirty', s.dirty);
    wDirty.replaceChildren(glyph(s.dirty ? 'warning' : 'good', 12), h('span', {}, s.dirty ? t('settings.common.unsaved') : t('settings.common.upToDate')));
  }
  function syncWeightInputs(force = false) {
    for (const [k, ref] of wRows) {
      if (!force && document.activeElement === ref.input) continue;
      ref.input.value = wDraft[k];
    }
  }
  function saveWeights() {
    const s = weightState();
    if (!s.valid) { paintWeights(); return; }
    const fractions = Object.fromEntries(DOMAINS.map((k) => [k, Math.round((s.values[k] / 100) * 1e6) / 1e6]));
    // Absorb float noise (33.3 + 33.3 + 33.4) so the stored set sums to 1 exactly.
    const drift = Math.round((1 - DOMAINS.reduce((a, k) => a + fractions[k], 0)) * 1e6) / 1e6;
    if (drift) { const big = DOMAINS.reduce((a, k) => (fractions[k] > fractions[a] ? k : a), DOMAINS[0]); fractions[big] = Math.round((fractions[big] + drift) * 1e6) / 1e6; }
    const r = typeof store.setWeights === 'function' ? store.setWeights(fractions) : (store.setSettings({ platform: { weights: fractions } }), { ok: true });
    if (!r || !r.ok) {
      wError.replaceChildren(note('critical', msgOf(r) || t('settings.saveFailed')));
      return;
    }
    wError.replaceChildren();
    wDraft = Object.fromEntries(DOMAINS.map((k) => [k, toInput(savedWeights()[k])]));
    syncWeightInputs(true);
    catScores = categoryScores();
    paintDomainScores();
    paintWeights();
    toast(t('settings.weights.saveDone'), { tone: 'good' });
    try { weightsGroup.focus({ preventScroll: true }); } catch { /* the disabled Save button cannot keep focus */ }
    if (motion && typeof motion.flash === 'function') motion.flash(weightsGroup);
  }

  const weightsGroup = group({
    id: 'settings-weights', title: t('settings.weights.title'), helper: t('settings.weights.intro', { total: pct(100) }),
    children: [
      wTable, wTotal, wPreviewHost, wError,
      h('div', { class: 'set-actions' }, wSaveBtn, wCancelBtn, wResetBtn, wDirty),
      h('p', { class: 't-helper', style: { margin: 0 } }, t('settings.weights.usedIn'), ' ',
        h('a', { href: router && typeof router.href === 'function' ? router.href('cockpit') : '#/cockpit' }, t('settings.weights.openCockpit'))),
    ],
  });

  /* ════════════════ SET-03 Risk scoring — thresholds ════════════════ */

  const savedThresholds = () => ({
    alert: Math.round(Number(platformSettings().alertThreshold ?? DEFAULTS.alertThreshold)),
    critical: Math.round(Number(platformSettings().criticalThreshold ?? DEFAULTS.criticalThreshold)),
  });
  let thDraft = { alert: numStr(savedThresholds().alert), critical: numStr(savedThresholds().critical) };
  const alertField = formField({ label: t('settings.thresholds.alert'), name: 'alertThreshold', type: 'text', value: thDraft.alert, hint: t('settings.thresholds.alertHint') });
  const criticalField = formField({ label: t('settings.thresholds.critical'), name: 'criticalThreshold', type: 'text', value: thDraft.critical, hint: t('settings.thresholds.criticalHint', { gap: numStr(GAP) }) });
  const alertInput = alertField.querySelector('.field-control');
  const criticalInput = criticalField.querySelector('.field-control');
  [alertInput, criticalInput].forEach((inp) => { inp.setAttribute('inputmode', 'numeric'); inp.setAttribute('dir', 'ltr'); inp.style.fontVariantNumeric = 'tabular-nums'; });
  const scaleHost = h('div', { class: 'set-scale', role: 'img', 'aria-label': t('settings.thresholds.scaleAria', { min: numStr(0), max: numStr(100) }) });
  const impactHost = h('dl', { class: 'set-impact' });
  const thSaveBtn = button(t('settings.common.save'), { variant: 'primary', icon: 'check', onClick: () => saveThresholds() });
  const thCancelBtn = button(t('settings.common.cancel'), { variant: 'ghost', onClick: () => { thDraft = { alert: numStr(savedThresholds().alert), critical: numStr(savedThresholds().critical) }; syncThresholdInputs(true); paintThresholds(); alertInput.focus(); toast(t('settings.thresholds.cancelDone'), { tone: 'neutral', timeout: 2200 }); } });
  const thResetBtn = button(t('settings.common.reset'), { variant: 'outline', icon: 'refresh', onClick: () => { thDraft = { alert: numStr(DEFAULTS.alertThreshold), critical: numStr(DEFAULTS.criticalThreshold) }; syncThresholdInputs(true); paintThresholds(); toast(t('settings.thresholds.resetDraft', { alert: numStr(DEFAULTS.alertThreshold), critical: numStr(DEFAULTS.criticalThreshold) }), { tone: 'neutral', timeout: 3000 }); } });
  const thDirty = h('span', { class: 'set-dirty', 'aria-live': 'polite' });
  const thError = h('div', { class: 'set-result' });
  alertInput.addEventListener('input', () => { thDraft.alert = alertInput.value; paintThresholds(); });
  criticalInput.addEventListener('input', () => { thDraft.critical = criticalInput.value; paintThresholds(); });

  function setFieldError(fieldEl, input, message) {
    fieldEl.classList.toggle('is-invalid', Boolean(message));
    input.setAttribute('aria-invalid', message ? 'true' : 'false');
    let err = fieldEl.querySelector('.field-error');
    if (message) {
      if (!err) { err = h('p', { class: 'field-error', id: `${input.id}-err` }); fieldEl.appendChild(err); }
      err.replaceChildren(glyph('critical', 14), h('span', {}, message));
      const hintId = input.id && fieldEl.querySelector(`#${CSS.escape(`${input.id}-hint`)}`) ? `${input.id}-hint` : '';
      input.setAttribute('aria-describedby', [hintId, err.id].filter(Boolean).join(' '));
    } else if (err) {
      err.remove();
      const hasHint = input.id && fieldEl.querySelector(`#${CSS.escape(`${input.id}-hint`)}`);
      if (hasHint) input.setAttribute('aria-describedby', `${input.id}-hint`); else input.removeAttribute('aria-describedby');
    }
  }
  function thresholdState() {
    const a = parseNum(thDraft.alert);
    const c = parseNum(thDraft.critical);
    const intOk = (n) => Number.isFinite(n) && Number.isInteger(n) && n >= 0 && n <= 100;
    const errNum = t('settings.thresholds.errNumber', { min: numStr(0), max: numStr(100) });
    const errors = { alert: intOk(a) ? null : errNum, critical: intOk(c) ? null : errNum };
    if (!errors.alert && !errors.critical && c < a + GAP) errors.critical = t('settings.thresholds.errGap', { min: numStr(a + GAP), gap: numStr(GAP) });
    const valid = !errors.alert && !errors.critical;
    const saved = savedThresholds();
    const dirty = a !== saved.alert || c !== saved.critical;
    return { a, c, errors, valid, dirty };
  }
  function openRisks() {
    return arr(safe(() => psel.openAiRisks(store.state, store.filters, now()), []));
  }
  function countBy(risks, alertAt, criticalAt) {
    const sev = (r) => Number(safe(() => psel.severityOf(r), r.score)) || 0;
    let immediate = 0; let standard = 0; let below = 0;
    for (const r of risks) { const s = sev(r); if (s >= criticalAt) immediate += 1; else if (s > alertAt) standard += 1; else below += 1; }
    return { immediate, standard, below };
  }
  function paintScale(alertAt, criticalAt) {
    const band = (cls, from, to) => h('span', { class: ['set-scale-band', cls], style: { inlineSize: `${to - from}%` } });
    const marker = (value, text) => h('span', { class: 'set-scale-marker', style: { insetInlineStart: `${Math.max(0, Math.min(100, value))}%` } }, h('span', {}, text));
    const ticks = h('div', { class: 'set-scale-ticks', 'aria-hidden': 'true' },
      h('span', {}, numStr(0)),
      h('span', { style: { insetInlineStart: '40%', transform: i18n.dir() === 'rtl' ? 'translateX(50%)' : 'translateX(-50%)' } }, numStr(40)),
      h('span', { style: { insetInlineStart: '70%', transform: i18n.dir() === 'rtl' ? 'translateX(50%)' : 'translateX(-50%)' } }, numStr(70)),
      h('span', {}, numStr(100)));
    const kids = [h('div', { class: 'set-scale-track', 'aria-hidden': 'true' }, band('is-green', 0, 40), band('is-yellow', 40, 70), band('is-red', 70, 100)), ticks];
    if (Number.isFinite(alertAt)) kids.push(marker(alertAt, t('settings.thresholds.markerAlert', { n: numStr(alertAt) })));
    if (Number.isFinite(criticalAt)) kids.push(marker(criticalAt, t('settings.thresholds.markerCritical', { n: numStr(criticalAt) })));
    scaleHost.replaceChildren(...kids);
  }
  function paintThresholds() {
    const s = thresholdState();
    setFieldError(alertField, alertInput, s.errors.alert);
    setFieldError(criticalField, criticalInput, s.errors.critical);
    const saved = savedThresholds();
    paintScale(s.valid ? s.a : saved.alert, s.valid ? s.c : saved.critical);
    const risks = openRisks();
    const cur = countBy(risks, saved.alert, saved.critical);
    const nxt = s.valid ? countBy(risks, s.a, s.c) : null;
    const fact = (key, tone, label) => h('div', { class: 'set-fact' },
      h('dt', {}, glyph(tone, 14), h('span', {}, label)),
      h('dd', {}, h('span', { class: 't-metric is-sm' }, numStr(cur[key])), nxt && nxt[key] !== cur[key] ? h('span', { class: 'set-arrow' }, '›') : null, nxt && nxt[key] !== cur[key] ? h('span', { class: 't-metric is-sm' }, numStr(nxt[key])) : null));
    impactHost.replaceChildren(
      fact('immediate', 'critical', t('settings.thresholds.immediate')),
      fact('standard', 'warning', t('settings.thresholds.standard')),
      fact('below', 'neutral', t('settings.thresholds.below')));
    thSaveBtn.disabled = !(s.valid && s.dirty);
    thCancelBtn.disabled = !s.dirty;
    thDirty.classList.toggle('is-dirty', s.dirty);
    thDirty.replaceChildren(glyph(s.dirty ? 'warning' : 'good', 12), h('span', {}, s.dirty ? t('settings.common.unsaved') : t('settings.common.upToDate')));
  }
  function syncThresholdInputs(force = false) {
    if (force || document.activeElement !== alertInput) alertInput.value = thDraft.alert;
    if (force || document.activeElement !== criticalInput) criticalInput.value = thDraft.critical;
  }
  function saveThresholds() {
    const s = thresholdState();
    if (!s.valid) { paintThresholds(); return; }
    const r = typeof store.setThresholds === 'function'
      ? store.setThresholds({ alertThreshold: s.a, criticalThreshold: s.c })
      : (store.setSettings({ platform: { alertThreshold: s.a, criticalThreshold: s.c } }), { ok: true, alertThreshold: s.a, criticalThreshold: s.c });
    if (!r || !r.ok) { thError.replaceChildren(note('critical', msgOf(r) || t('settings.saveFailed'))); return; }
    thError.replaceChildren();
    thDraft = { alert: numStr(savedThresholds().alert), critical: numStr(savedThresholds().critical) };
    syncThresholdInputs(true);
    paintThresholds();
    toast(t('settings.thresholds.saveDone', { alert: numStr(savedThresholds().alert), critical: numStr(savedThresholds().critical) }), { tone: 'good' });
    try { thresholdsGroup.focus({ preventScroll: true }); } catch { /* ignore */ }
    if (motion && typeof motion.flash === 'function') motion.flash(thresholdsGroup);
  }

  const thresholdsGroup = group({
    id: 'settings-thresholds', title: t('settings.thresholds.title'), helper: t('settings.thresholds.intro'),
    children: [
      h('div', { class: 'form-grid set-th-fields' }, alertField, criticalField),
      scaleHost,
      h('div', { class: 'stack gap-2' },
        h('span', { class: 't-label' }, t('settings.thresholds.impact')),
        impactHost,
        h('p', { class: 't-helper', style: { margin: 0 } }, t('settings.weights.previewHint'), ' ', t('settings.thresholds.impactHint'))),
      thError,
      h('div', { class: 'set-actions' }, thSaveBtn, thCancelBtn, thResetBtn, thDirty),
    ],
  });

  const bandsGroup = group({
    id: 'settings-bands', title: t('settings.bands.title'), helper: t('settings.bands.intro'),
    children: [h('ul', { class: 'set-bands', 'aria-label': t('settings.bands.ariaBands') },
      h('li', { class: 'set-band is-red' }, ratingChip('red'), h('span', { class: 'set-band-range' }, t('settings.bands.redRange', { min: numStr(70) })), h('span', { class: 'set-band-hint' }, t('settings.bands.redHint'))),
      h('li', { class: 'set-band is-yellow' }, ratingChip('yellow'), h('span', { class: 'set-band-range' }, t('settings.bands.yellowRange', { min: numStr(40), max: numStr(69) })), h('span', { class: 'set-band-hint' }, t('settings.bands.yellowHint'))),
      h('li', { class: 'set-band is-green' }, ratingChip('green'), h('span', { class: 'set-band-range' }, t('settings.bands.greenRange', { max: numStr(40) })), h('span', { class: 'set-band-hint' }, t('settings.bands.greenHint'))))],
  });

  const scoringCard = card({
    id: 'settings-scoring', code: 'SET-03', title: t('settings.sections.scoring'), subtitle: t('settings.sectionSub.scoring'), className: 'set-anchor',
    body: h('div', { class: 'stack gap-5' }, weightsGroup, thresholdsGroup, bandsGroup),
  });
  paintWeights();
  paintThresholds();

  /* ════════════════ SET-04 Data & connectivity ════════════════ */

  const srcOf = () => safe(() => status.source(store.state, now()), { status: 'demo', type: 'simulation' });
  const statusHost = h('div', { class: 'stack gap-3' });
  const legendHost = h('ul', { class: 'set-legend', 'aria-label': t('settings.data.legendAria') });
  function paintStatus() {
    const src = srcOf();
    const st = STATUS_KEYS.includes(src.status) ? src.status : 'not_connected';
    const mode = safe(() => status.mode(store.state), 'demo');
    const online = safe(() => status.online(), true);
    const err = src.lastError;
    const errText = err ? (typeof err === 'string' ? err : (en() ? (err.messageEn || err.message) : (err.message || err.messageEn)) || err.code || '') : '';
    const facts = [
      [t('settings.data.mode'), mode === 'demo' ? t('settings.data.modeDemo') : t('settings.data.modeLive')],
      [t('settings.data.sourceType'), t(`settings.data.types.${SOURCE_TYPES.includes(src.type) ? src.type : 'simulation'}`)],
      [t('settings.data.lastSuccess'), src.lastSuccessAt ? h('span', { title: riyadhDateTime(fmt, src.lastSuccessAt) }, relSafe(src.lastSuccessAt)) : t('settings.data.never')],
      [t('settings.data.network'), h('span', { class: 'row gap-1' }, glyph(online ? 'good' : 'warning', 12), h('span', {}, online ? t('settings.data.online') : t('settings.data.offline')))],
    ];
    if (src.lastErrorAt) facts.push([t('settings.data.lastError'), h('span', { title: riyadhDateTime(fmt, src.lastErrorAt) }, `${relSafe(src.lastErrorAt)}${errText ? ` — ${errText}` : ''}`)]);
    statusHost.replaceChildren(
      h('div', { class: 'set-status' }, statusBadge(st, { size: 'lg' }), h('p', { class: 'set-status-desc' }, safe(() => status.desc(st), ''))),
      h('dl', { class: 'set-kv' }, ...facts.map(([k, v]) => h('div', { class: 'set-fact' }, h('dt', {}, k), h('dd', {}, v)))));
    legendHost.replaceChildren(...STATUS_KEYS.map((s) => h('li', { class: s === st ? 'is-current' : null }, statusBadge(s, { size: 'sm', title: false }), h('span', {}, safe(() => status.desc(s), '')))));
  }
  paintStatus();

  // Data source set-up
  const dsNow = () => ({ type: 'simulation', url: '', apiKey: '', table: '', ...(isObj(settings().dataSource) ? settings().dataSource : {}) });
  let dsType = SOURCE_TYPES.includes(dsNow().type) ? dsNow().type : 'simulation';
  const fUrl = formField({ label: t('settings.data.url'), name: 'url', type: 'url', value: dsNow().url, placeholder: 'https://' });
  const fKey = formField({ label: t('settings.data.apiKey'), name: 'apiKey', type: 'password', value: dsNow().apiKey, hint: t('settings.data.apiKeyHint'), autocomplete: 'off' });
  const fTable = formField({ label: t('settings.data.table'), name: 'table', type: 'text', value: dsNow().table, placeholder: 'risks' });
  const urlInput = fUrl.querySelector('.field-control');
  const keyInput = fKey.querySelector('.field-control');
  const tableInput = fTable.querySelector('.field-control');
  tableInput.setAttribute('dir', 'ltr');
  const typeHint = h('p', { class: 'set-desc' });
  const dsResult = h('div', { class: 'set-result', 'aria-live': 'polite' });
  const dsFields = h('div', { class: 'set-fields' }, fUrl, fKey, fTable);
  const testHelp = h('p', { class: 't-helper', style: { margin: 0 } });
  const current = () => ({ type: dsType, url: String(urlInput.value || '').trim(), apiKey: String(keyInput.value || ''), table: String(tableInput.value || '').trim() });
  const testBtn = button(t('settings.data.test'), { variant: 'outline', icon: 'plug', onClick: () => { runTest(); } });
  const previewBtn = button(t('settings.data.previewSource'), { variant: 'primary', icon: 'import', onClick: () => { runSourcePreview(); } });
  const typeSeg = segmented({
    options: SOURCE_TYPES.map((v) => ({ value: v, label: t(`settings.data.types.${v}`) })),
    value: dsType,
    ariaLabel: t('settings.data.sourceAria'),
    onChange: (v) => { dsType = v; persistSource(); paintSourceFields(); dsResult.replaceChildren(); },
  });
  function paintSourceFields() {
    const ext = dsType !== 'simulation';
    dsFields.hidden = !ext;
    fKey.hidden = !(dsType === 'json' || dsType === 'supabase');
    fTable.hidden = dsType !== 'supabase';
    typeHint.textContent = t(`settings.data.typeHint.${dsType}`);
    urlInput.placeholder = dsType === 'sheets' ? 'https://docs.google.com/spreadsheets/d/…/pub?output=csv' : (dsType === 'supabase' ? 'https://xxxx.supabase.co' : 'https://api.example.com/risks');
    testBtn.disabled = !ext;
    previewBtn.disabled = !ext;
    testHelp.textContent = ext ? t('settings.data.testHint') : t('settings.data.testSim');
  }
  function persistSource() {
    const next = current();
    const prev = dsNow();
    if (prev.type === next.type && prev.url === next.url && prev.apiKey === next.apiKey && prev.table === next.table) return;
    const endpointChanged = prev.type !== next.type || prev.url !== next.url || prev.table !== next.table;
    save({ dataSource: { ...next, ...(endpointChanged ? { lastSuccessAt: null, lastErrorAt: null, lastError: null } : {}) } });
  }
  [urlInput, keyInput, tableInput].forEach((inp) => inp.addEventListener('change', () => {
    if (inp === urlInput) setFieldError(fUrl, urlInput, urlInput.value.trim() && !validUrl(urlInput.value) ? t('settings.data.urlInvalid') : null);
    persistSource();
  }));
  function checkSource(cfg) {
    if (cfg.type === 'simulation') { dsResult.replaceChildren(note('neutral', t('settings.data.testSim'))); return false; }
    if (!validUrl(cfg.url)) { setFieldError(fUrl, urlInput, t('settings.data.urlInvalid')); urlInput.focus(); return false; }
    setFieldError(fUrl, urlInput, null);
    if (cfg.type === 'supabase' && !cfg.table) { setFieldError(fTable, tableInput, t('settings.data.tableMissing')); tableInput.focus(); return false; }
    setFieldError(fTable, tableInput, null);
    return true;
  }
  async function runTest() {
    if (testBtn.getAttribute('aria-busy') === 'true') return;
    const cfg = current();
    if (!checkSource(cfg)) return;
    persistSource();
    if (typeof sources.testConnection !== 'function') { dsResult.replaceChildren(note('warning', t('import.unavailable'))); return; }
    if (!safe(() => status.online(), true)) { dsResult.replaceChildren(note('warning', t('settings.data.offlineTest'))); return; }
    busy(testBtn, true, t('settings.data.testing'));
    dsResult.replaceChildren(note('accent', t('settings.data.testing')));
    let r;
    try { r = await sources.testConnection(cfg); } catch (err) { r = { ok: false, real: true, message: String(err && err.message || err), messageEn: String(err && err.message || err) }; }
    busy(testBtn, false, t('settings.data.test'));
    if (r && r.real && !r.skipped && typeof store.recordDataSourceResult === 'function') { try { store.recordDataSourceResult(r); } catch { /* keep the previous status */ } }
    const latency = r && Number.isFinite(Number(r.latencyMs)) && Number(r.latencyMs) > 0 ? t('import.latency', { ms: t('import.ms', { n: numStr(Number(r.latencyMs)) }) }) : null;
    dsResult.replaceChildren(note(r && r.ok ? 'good' : (r && r.skipped ? 'neutral' : 'critical'), msgOf(r) || t('settings.saveFailed'), latency));
    paintStatus();
  }
  function runSourcePreview() {
    const cfg = current();
    if (!checkSource(cfg)) return;
    persistSource();
    openImportPreview(ctx, { source: cfg, returnFocus: previewBtn, onCommitted: () => paintStats() });
  }
  paintSourceFields();

  // File import (CSV / JSON → preview)
  const riskFileInput = h('input', { type: 'file', accept: '.csv,.json,text/csv,application/json', class: 'sr-only', tabindex: '-1', 'aria-hidden': 'true' });
  const chooseBtn = button(t('settings.data.chooseFile'), { variant: 'outline', icon: 'upload', onClick: () => riskFileInput.click() });
  riskFileInput.addEventListener('change', async () => {
    const file = riskFileInput.files && riskFileInput.files[0];
    riskFileInput.value = '';
    if (!file) return;
    if (file.size > MAX_FILE_BYTES) { toast(t('settings.data.fileTooBig', { size: sizeText(MAX_FILE_BYTES) }), { tone: 'warning' }); return; }
    let text;
    try { text = await readFileText(file); } catch { toast(t('settings.data.fileUnreadable'), { tone: 'serious' }); return; }
    openImportPreview(ctx, { source: { text, fileName: file.name }, returnFocus: chooseBtn, onCommitted: () => paintStats() });
  });
  const templateBtn = button(t('settings.data.template'), { variant: 'ghost', icon: 'csv', onClick: () => {
    try {
      if (typeof sources.downloadTemplateCSV !== 'function') throw new Error('unavailable');
      sources.downloadTemplateCSV();
      toast(t('settings.data.templateDone'), { tone: 'neutral', timeout: 2600 });
    } catch { toast(t('settings.data.templateFailed'), { tone: 'serious' }); }
  } });
  const colsTable = h('table', { class: 'table is-dense set-cols' },
    h('caption', { class: 'sr-only' }, t('settings.data.columnsAria')),
    h('thead', {}, h('tr', {}, h('th', { scope: 'col' }, t('settings.data.columnsHeaders')), h('th', { scope: 'col' }, t('import.table.status')), h('th', { scope: 'col' }, t('import.fields.description')))),
    h('tbody', {}, ...IMPORT_COLUMNS.map((c) => h('tr', {},
      h('td', {}, en() ? h('code', { class: 'mono', dir: 'ltr' }, c.en) : h('span', {}, c.ar, ' · ', h('code', { class: 'mono', dir: 'ltr', lang: 'en' }, c.en))),
      h('td', {}, c.required ? h('span', { class: 'row gap-1' }, glyph('critical', 12), t('settings.data.columnsRequired')) : t('settings.data.columnsOptional')),
      h('td', {}, t(`settings.data.col.${c.key}`, { min: numStr(1), max: numStr(5) }))))));

  const dataCard = card({
    id: 'settings-data', code: 'SET-04', title: t('settings.sections.data'), subtitle: t('settings.sectionSub.data'), className: 'set-anchor',
    body: h('div', { class: 'stack gap-5' },
      group({ title: t('settings.data.statusTitle'), children: [statusHost] }),
      group({ title: t('settings.data.legendTitle'), children: [legendHost] }),
      group({ title: t('settings.data.modeTitle'), children: [h('div', { class: 'note is-demo', style: { '--tone': 'var(--brand)' } },
        h('p', { style: { margin: 0 } }, t('settings.data.modeText')),
        h('p', { style: { margin: '6px 0 0' } }, t('settings.data.modeSim')),
        h('p', { style: { margin: '6px 0 0' } }, t('settings.data.modeSource')))] }),
      group({ id: 'settings-source', title: t('settings.data.sourceTitle'), helper: t('settings.data.autosave'), children: [
        typeSeg.el, typeHint, dsFields,
        h('div', { class: 'set-actions' }, testBtn, previewBtn),
        testHelp,
        dsResult,
      ] }),
      group({ id: 'settings-import', title: t('settings.data.importTitle'), helper: t('settings.data.importText', { size: sizeText(MAX_FILE_BYTES) }), children: [
        h('div', { class: 'set-actions' }, chooseBtn, templateBtn, riskFileInput),
        h('details', { class: 'set-fold' }, h('summary', {}, glyph('chevronDown', 14), t('settings.data.columnsTitle')), h('div', { class: 'table-wrap', tabindex: '0', role: 'region', 'aria-label': t('settings.data.columnsAria') }, colsTable)),
      ] })),
  });
  typeSeg.el.classList.add('is-block', 'set-wrapseg');

  /* ════════════════ SET-05 Notifications ════════════════ */

  const fHook = formField({ label: t('settings.notify.webhook'), name: 'alertWebhook', type: 'url', value: settings().alertWebhook || '', placeholder: 'https://hooks.example.com/…', hint: t('settings.notify.webhookHint') });
  const hookInput = fHook.querySelector('.field-control');
  const hookResult = h('div', { class: 'set-result', 'aria-live': 'polite' });
  const hookBtn = button(t('settings.notify.test'), { variant: 'outline', icon: 'send', onClick: () => { sendTest(); } });
  const payload = () => ({ type: 'test', source: 'BILTIX Risk AI', severity: 'info', title: t('settings.notify.payloadTitle'), detail: t('settings.notify.payloadDetail'), lang: i18n.lang(), sentAt: now().toISOString() });
  const payloadPre = h('pre', { class: 'mono text-xs', dir: 'ltr', style: { margin: 0, padding: '10px 12px', background: 'var(--bg-2)', border: '1px solid var(--line)', borderRadius: 'var(--radius-md)', overflowX: 'auto', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' } });
  function paintPayload() { payloadPre.textContent = JSON.stringify(payload(), null, 2); }
  paintPayload();
  function paintHookButton() { hookBtn.disabled = !validUrl(settings().alertWebhook); }
  hookInput.addEventListener('change', () => {
    const v = hookInput.value.trim();
    if (!v) { setFieldError(fHook, hookInput, null); save({ alertWebhook: '' }, t('settings.notify.cleared'), 'neutral'); paintHookButton(); return; }
    if (!validUrl(v)) { setFieldError(fHook, hookInput, t('settings.notify.invalid')); return; }
    setFieldError(fHook, hookInput, null);
    save({ alertWebhook: v }, t('settings.notify.saved'));
    paintHookButton();
  });
  paintHookButton();
  async function sendTest() {
    if (hookBtn.getAttribute('aria-busy') === 'true') return;
    const url = settings().alertWebhook;
    if (!validUrl(url)) { hookResult.replaceChildren(note('warning', t('settings.notify.needUrl'))); return; }
    if (typeof sources.postWebhook !== 'function') { hookResult.replaceChildren(note('warning', t('import.unavailable'))); return; }
    busy(hookBtn, true, t('settings.notify.testing'));
    paintPayload();
    let r;
    try { r = await sources.postWebhook(url, payload()); } catch (err) { r = { ok: false, message: String(err && err.message || err), messageEn: String(err && err.message || err) }; }
    busy(hookBtn, false, t('settings.notify.test'));
    paintHookButton();
    if (r && r.ok && !r.opaque) hookResult.replaceChildren(note('good', t('settings.notify.accepted'), msgOf(r)));
    else if (r && r.opaque) hookResult.replaceChildren(note('warning', t('settings.notify.opaque'), msgOf(r)));
    else hookResult.replaceChildren(note('critical', t('settings.notify.failed'), msgOf(r)));
  }

  const notificationsCard = card({
    id: 'settings-notifications', code: 'SET-05', title: t('settings.sections.notifications'), subtitle: t('settings.sectionSub.notifications'), className: 'set-anchor',
    body: h('div', { class: 'stack gap-4' },
      h('div', { class: 'note', style: { '--tone': 'var(--warning)' } }, h('span', { class: 'row gap-2', style: { alignItems: 'flex-start' } }, glyph('warning', 14), h('span', {}, t('settings.notify.honest')))),
      fHook,
      h('div', { class: 'set-actions' }, hookBtn),
      hookResult,
      h('details', { class: 'set-fold' }, h('summary', {}, glyph('chevronDown', 14), t('settings.notify.payload')), payloadPre)),
  });

  /* ════════════════ SET-06 Data management ════════════════ */

  const statsHost = h('dl', { class: 'set-kv' });
  function paintStats() {
    const st = store.state || {};
    const plat = isObj(st.platform) ? st.platform : {};
    const len = (v) => (Array.isArray(v) ? v.length : 0);
    let bytes = 0;
    try { bytes = JSON.stringify(st).length; } catch { bytes = 0; }
    const savedAt = st.meta && st.meta.savedAt;
    const facts = [
      ['risks', numStr(len(st.risks))], ['incidents', numStr(len(st.incidents))], ['permits', numStr(len(st.permits))], ['inspections', numStr(len(st.inspections))],
      ['aiRisks', numStr(len(plat.aiRisks))], ['tasks', numStr(len(plat.tasks))], ['alerts', numStr(len(plat.alerts))], ['feed', numStr(len(st.feed))],
      ['savedAt', savedAt ? relSafe(savedAt) : t('settings.manage.never')],
      ['size', t('settings.manage.kb', { n: fmt.num(bytes / 1024, { maximumFractionDigits: 0 }) })],
    ];
    statsHost.replaceChildren(...facts.map(([k, v]) => h('div', { class: 'set-fact' }, h('dt', {}, t(`settings.manage.stats.${k}`)), h('dd', { class: 'num' }, v))));
  }
  paintStats();

  function exportJSON() {
    const filename = `biltix-risk-ai-backup-${isoDate(now())}.json`;
    try {
      if (typeof sources.exportJSON === 'function') sources.exportJSON(store.state, filename);
      else {
        const blob = new Blob([JSON.stringify(store.state, null, 2)], { type: 'application/json;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = h('a', { href: url, download: filename, rel: 'noopener' });
        document.body.appendChild(a); a.click(); a.remove();
        later(() => URL.revokeObjectURL(url), 1500);
      }
      toast(t('settings.manage.exportDone'), { tone: 'neutral' });
    } catch { toast(t('settings.manage.exportFailed'), { tone: 'serious' }); }
  }

  /** Structural check of a backup file → { ok, rows, errors, warnings, format } (nothing is applied here). */
  function inspectBackup(obj) {
    if (!isObj(obj)) return { ok: false, errors: [t('settings.manage.notObject')] };
    const errors = [];
    const rows = [];
    const delta = isObj(obj.meta) && obj.meta.format === 'delta';
    if (isObj(obj.meta) && obj.meta.version !== undefined && Number(obj.meta.version) !== 1) errors.push(t('settings.manage.badVersion', { version: String(obj.meta.version) }));
    const check = (name, list) => {
      const bad = list.filter((x) => !isObj(x)).length;
      if (bad) errors.push(t('settings.manage.badItems', { name: t(`settings.manage.collections.${name}`), count: numStr(bad) }));
    };
    if (delta) {
      const data = isObj(obj.data) ? obj.data : {};
      for (const k of BACKUP_COLLECTIONS) {
        const d = data[k];
        const n = isObj(d) ? Object.values(d).reduce((a, v) => a + (Array.isArray(v) ? v.length : (isObj(v) ? Object.keys(v).length : 0)), 0) : 0;
        if (n) rows.push([t(`settings.manage.collections.${k}`), tn('settings.manage.changesCount', n)]);
      }
      if (Array.isArray(obj.feed) && obj.feed.length) rows.push([t('settings.manage.collections.feed'), tn('settings.manage.itemsCount', obj.feed.length)]);
      if (isObj(obj.platform) && Object.keys(obj.platform).length) rows.push([t('settings.manage.platformLabel'), t('settings.manage.settingsIncluded')]);
    } else {
      for (const k of BACKUP_COLLECTIONS) if (Array.isArray(obj[k])) { check(k, obj[k]); rows.push([t(`settings.manage.collections.${k}`), tn('settings.manage.itemsCount', obj[k].length)]); }
      const plat = isObj(obj.platform) ? obj.platform : null;
      if (plat) for (const k of PLATFORM_COLLECTIONS) if (Array.isArray(plat[k])) { check(k, plat[k]); rows.push([t(`settings.manage.collections.${k}`), tn('settings.manage.itemsCount', plat[k].length)]); }
    }
    const hasSettings = isObj(obj.settings);
    if (hasSettings) rows.push([t('settings.manage.settingsLabel'), t('settings.manage.settingsIncluded')]);
    if (!rows.length) errors.push(t('settings.manage.noData'));
    rows.push([t('settings.manage.format'), delta ? t('settings.manage.formatDelta') : t('settings.manage.formatFull')]);
    if (isObj(obj.meta) && typeof obj.meta.savedAt === 'string' && Number.isFinite(Date.parse(obj.meta.savedAt))) rows.push([t('settings.manage.exportedAt'), riyadhDateTime(fmt, obj.meta.savedAt)]);
    return { ok: !errors.length, rows, errors };
  }

  const backupInput = h('input', { type: 'file', accept: '.json,application/json', class: 'sr-only', tabindex: '-1', 'aria-hidden': 'true' });
  const restoreBtn = button(t('settings.manage.import'), { variant: 'outline', icon: 'upload', onClick: () => backupInput.click() });
  backupInput.addEventListener('change', async () => {
    const file = backupInput.files && backupInput.files[0];
    backupInput.value = '';
    if (!file) return;
    if (file.size > MAX_BACKUP_BYTES) { toast(t('settings.data.fileTooBig', { size: sizeText(MAX_BACKUP_BYTES) }), { tone: 'warning' }); return; }
    let obj;
    try { obj = JSON.parse(await readFileText(file)); } catch { toast(t('settings.manage.notJson'), { tone: 'serious', timeout: 6000 }); return; }
    const check = inspectBackup(obj);
    const body = h('div', { class: 'stack gap-3' },
      h('p', { class: 'text-sm', style: { margin: 0 } }, t('settings.manage.previewLead', { name: file.name })),
      components.kv(check.rows || []),
      check.ok
        ? h('div', { class: 'note', style: { '--tone': 'var(--warning)' } }, t('settings.manage.previewWarn'))
        : h('div', { class: 'form-error-summary', role: 'alert' }, glyph('critical', 18), h('ul', { class: 'set-list', style: { margin: 0 } }, ...check.errors.map((e) => h('li', {}, e)))));
    const confirmBtn = button(t('settings.manage.confirmImport'), { variant: 'primary', icon: 'upload', attrs: { disabled: !check.ok }, onClick: () => {
      let ok = false;
      try { ok = typeof store.importState === 'function' && Boolean(store.importState(obj)); } catch { ok = false; }
      if (!ok) { toast(t('settings.manage.importFailed'), { tone: 'serious' }); return; }
      try { if (typeof store.flush === 'function') store.flush(); } catch { /* ignore */ }
      m.close('done');
      toast(t('settings.manage.importDone'), { tone: 'good' });
      later(() => location.reload(), 900);
    } });
    const m = modal({ title: t('settings.manage.previewTitle'), body, actions: [{ label: t('settings.manage.cancel'), variant: 'ghost' }, confirmBtn], returnFocus: restoreBtn });
    m.open();
  });

  function confirmReset(btn) {
    const confirmBtn = button(t('settings.manage.resetConfirm'), { variant: 'danger', icon: 'trash', onClick: () => {
      try { store.reset(); } catch { toast(t('settings.manage.resetFailed'), { tone: 'serious' }); return; }
      m.close('done');
      toast(t('settings.manage.resetDone'), { tone: 'good' });
      later(() => location.reload(), 800);
    } });
    const m = modal({
      title: t('settings.manage.resetConfirmTitle'),
      body: h('div', { class: 'stack gap-3' }, h('div', { class: 'note', style: { '--tone': 'var(--critical)' } }, t('settings.manage.resetConfirmText'))),
      actions: [{ label: t('settings.manage.resetExportFirst'), variant: 'outline', closes: false, onClick: () => { exportJSON(); return false; } }, { label: t('settings.manage.cancel'), variant: 'ghost' }, confirmBtn],
      returnFocus: btn,
    });
    m.open();
  }
  const resetBtn = button(t('settings.manage.reset'), { variant: 'danger', icon: 'trash', attrs: { class: 'is-soft' }, onClick: () => confirmReset(resetBtn) });

  const managementCard = card({
    id: 'settings-management', code: 'SET-06', title: t('settings.sections.management'), subtitle: t('settings.sectionSub.management'), className: 'set-anchor',
    body: h('div', { class: 'stack gap-5' },
      group({ title: t('settings.manage.statsTitle'), children: [statsHost] }),
      h('div', { class: 'set-grid' },
        group({ title: t('settings.manage.exportTitle'), helper: t('settings.manage.exportText'), children: [h('div', { class: 'set-actions' }, button(t('settings.manage.export'), { variant: 'outline', icon: 'download', onClick: exportJSON }))] }),
        group({ title: t('settings.manage.importTitle'), helper: t('settings.manage.importText', { size: sizeText(MAX_BACKUP_BYTES) }), children: [h('div', { class: 'set-actions' }, restoreBtn, backupInput)] })),
      h('div', { class: 'set-danger' },
        h('div', { class: 'set-danger-text' }, h('strong', { class: 'text-sm' }, t('settings.manage.resetTitle')), h('span', { class: 'text-xs', style: { color: 'var(--ink-2)' } }, t('settings.manage.resetText'))),
        resetBtn)),
  });

  /* ════════════════ SET-07 About ════════════════ */

  const aboutModeHost = h('span');
  function paintAboutMode() { aboutModeHost.replaceChildren(statusBadge(safe(() => status.mode(store.state), 'demo') === 'demo' ? 'demo' : (srcOf().status || 'not_connected'), { size: 'sm' })); }
  paintAboutMode();
  const aboutCard = card({
    id: 'settings-about', code: 'SET-07', title: t('settings.sections.about'), subtitle: t('settings.sectionSub.about'), className: 'set-anchor',
    body: h('div', { class: 'stack gap-5' },
      h('dl', { class: 'set-kv' },
        h('div', { class: 'set-fact' }, h('dt', {}, t('settings.about.product')), h('dd', {}, t('settings.about.productName'), h('span', { class: 't-helper', style: { display: 'block' } }, t('settings.about.pillar')))),
        h('div', { class: 'set-fact' }, h('dt', {}, t('settings.about.version')), h('dd', {}, h('span', { class: 'mono', dir: 'ltr' }, `v${APP_VERSION}`), h('span', { class: 't-helper', style: { display: 'block' } }, t('settings.about.edition')))),
        h('div', { class: 'set-fact' }, h('dt', {}, t('settings.about.dataMode')), h('dd', {}, aboutModeHost)),
        h('div', { class: 'set-fact' }, h('dt', {}, t('settings.about.website')), h('dd', {}, h('a', { href: SITE_URL, target: '_blank', rel: 'noopener noreferrer', class: 'row gap-1 mono', dir: 'ltr', style: { display: 'inline-flex' } }, SITE_LABEL, svgIcon('external', 13))))),
      h('div', { class: 'set-grid' },
        group({ title: t('settings.about.notesTitle'), children: [h('ul', { class: 'set-list' }, ...dictList('notes').map((n) => h('li', {}, n)))] }),
        group({ title: t('settings.about.questionsTitle'), children: [h('ol', { class: 'set-list' }, ...dictList('questions').map((q) => h('li', {}, interpolate(q, { deg: `${numStr(360)}°`, n: numStr(3) }))))] })),
      h('div', { class: 'set-actions' },
        button(t('settings.about.openIntegrations'), { variant: 'outline', size: 'sm', icon: 'plug', onClick: () => (router && typeof router.navigate === 'function' ? router.navigate('integrations') : (location.hash = '#/integrations')) }),
        button(t('settings.about.openDataStatus'), { variant: 'ghost', size: 'sm', icon: 'info', onClick: () => reveal('settings-data') }))),
  });
  /** Lists live in the dictionary as arrays (t() returns strings only). */
  function dictList(key) { return arr(safe(() => (en() ? dict.en : dict.ar).about[key], [])).map(String); }
  function interpolate(s, p) { return String(s).replace(/\{(\w+)\}/g, (w, k) => (p[k] === undefined ? w : String(p[k]))); }

  /* ════════════════ SET-08 Offline (shared/offline-panel.js) ════════════════ */

  const offlineApi = offlinePanel(ctx);
  const offlineCard = card({
    id: 'settings-offline', code: 'SET-08', title: t('fieldkit.settings.title'), subtitle: t('fieldkit.settings.sub'), className: 'set-anchor',
    body: offlineApi.el,
  });

  /* ════════════════ navigation + assembly ════════════════ */

  const navButtons = new Map();
  const nav = h('nav', { class: 'set-nav', 'aria-label': t('settings.navAria') },
    h('ul', { class: 'set-nav-list' }, ...SECTIONS.map((s) => {
      const b = h('button', { type: 'button', class: 'set-nav-item', 'aria-controls': s.anchor, onClick: () => reveal(s.anchor, { focus: true }) },
        svgIcon(s.icon, 16), h('span', {}, t(s.labelKey || `settings.sections.${s.id}`)), h('span', { class: 'set-nav-code', 'aria-hidden': 'true' }, s.code));
      navButtons.set(s.anchor, b);
      return h('li', {}, b);
    })));
  function setCurrent(anchor) {
    for (const [a, b] of navButtons) b.setAttribute('aria-current', a === anchor ? 'true' : 'false');
  }
  setCurrent(SECTIONS[0].anchor);

  const sectionCards = [languageCard, appearanceCard, scoringCard, dataCard, offlineCard, notificationsCard, managementCard, aboutCard];
  const view = h('section', { class: 'view view-settings' },
    head,
    h('div', { class: 'set-layout' }, nav, h('div', { class: 'set-sections' }, ...sectionCards)));
  container.appendChild(view);

  /** Scroll to a section / group, move focus to its heading and highlight it once. */
  function reveal(anchor, { focus = true, flash = true } = {}) {
    const el = view.querySelector(`#${anchor}`);
    if (!el) return;
    try { el.scrollIntoView({ behavior: scrollBehavior(), block: 'start' }); } catch { el.scrollIntoView(); }
    if (focus) {
      const target = el.matches('.set-group') ? el : (el.querySelector('.card-title') || el);
      if (!target.hasAttribute('tabindex')) target.setAttribute('tabindex', '-1');
      try { target.focus({ preventScroll: true }); } catch { /* ignore */ }
    }
    const section = SECTIONS.find((s) => s.anchor === anchor) || SECTIONS.find((s) => { const c = view.querySelector(`#${s.anchor}`); return c && c.contains(el); });
    if (section) { setCurrent(section.anchor); spyLockUntil = Date.now() + 1200; }
    if (flash && motion && typeof motion.flash === 'function') motion.flash(el);
  }

  // Scroll-spy: the nav marks the section nearest the top of the viewport.
  let io = null;
  let spyLockUntil = 0;   // an explicit jump (nav / deep link) wins over the scroll-spy while the page scrolls there
  if (typeof IntersectionObserver === 'function') {
    const visible = new Map();
    io = new IntersectionObserver((entries) => {
      for (const e of entries) visible.set(e.target.id, e.isIntersecting ? e.boundingClientRect.top : null);
      if (Date.now() < spyLockUntil) return;
      const firstVisible = SECTIONS.map((s) => s.anchor).find((a) => visible.get(a) !== null && visible.get(a) !== undefined);
      if (firstVisible) setCurrent(firstVisible);
    }, { rootMargin: '-10% 0px -60% 0px', threshold: 0 });
    sectionCards.forEach((c) => io.observe(c));
  }

  // First appearance only (a re-render on live data never replays it).
  if (motion && typeof motion.enter === 'function') motion.enter([nav, ...sectionCards], { y: 8, stagger: 0.032 });

  // Deep link ?section=… — honoured once per URL (the param is dropped so a re-mount does not jump again).
  const wanted = params.section ? SECTION_ALIASES[String(params.section).toLowerCase()] : null;
  if (wanted && typeof location !== 'undefined' && /[?&]section=/.test(location.hash || '')) {
    requestAnimationFrame(() => {
      reveal(wanted, { focus: true, flash: true });
      try { history.replaceState(history.state, '', router && typeof router.href === 'function' ? router.href('settings') : '#/settings'); } catch { /* ignore */ }
    });
  }

  /* ════════════════ sync from external changes ════════════════ */

  function syncFromState() {
    const s = settings();
    langSeg.set(i18n.lang());
    langSeg.el.removeAttribute('aria-busy');
    numeralsSeg.set(s.numerals === 'arab' ? 'arab' : 'latn');
    calSeg.set(['gregorian', 'hijri', 'both'].includes(s.calendar) ? s.calendar : 'both');
    themeSeg.set(s.theme === 'dark' ? 'dark' : 'light');
    densitySeg.set(s.appearance && s.appearance.density === 'compact' ? 'compact' : 'comfortable');
    motionSeg.set(motionOf(s));
    motionDesc.textContent = t(`settings.appearance.motionDesc.${motionOf(s)}`);
    paintBg();
    paintLegacyBrand();
    paintExample();
    // Drafts follow the stored values only while the reader has not edited them.
    if (!weightState().dirty) { wDraft = Object.fromEntries(DOMAINS.map((k) => [k, toInput(savedWeights()[k])])); syncWeightInputs(); }
    if (!thresholdState().dirty) { thDraft = { alert: numStr(savedThresholds().alert), critical: numStr(savedThresholds().critical) }; syncThresholdInputs(); }
    catScores = categoryScores();
    paintDomainScores();
    paintWeights();
    paintThresholds();
    const d = dsNow();
    if (d.type !== dsType && SOURCE_TYPES.includes(d.type)) { dsType = d.type; typeSeg.set(d.type); paintSourceFields(); }
    [[urlInput, d.url], [keyInput, d.apiKey], [tableInput, d.table]].forEach(([inp, v]) => { if (document.activeElement !== inp && inp.value !== (v || '')) inp.value = v || ''; });
    if (document.activeElement !== hookInput && hookInput.value !== (s.alertWebhook || '')) hookInput.value = s.alertWebhook || '';
    paintHookButton();
    paintStatus();
    paintAboutMode();
  }

  let dataTimer = null;
  subs.push(bus.on('settings:change', () => syncFromState()));
  subs.push(bus.on('store:change', (payload) => {
    const path = String((payload && payload.path) || '*');
    if (path === 'settings') return; // settings:change handles it
    if (dataTimer) clearTimeout(dataTimer);
    dataTimer = setTimeout(() => {
      dataTimer = null;
      paintStats();
      if (/^platform\.aiRisks|^\*/.test(path)) { catScores = categoryScores(); paintDomainScores(); paintWeights(); paintThresholds(); }
    }, 600);
  }));
  subs.push(bus.on('filters:change', () => { catScores = categoryScores(); paintDomainScores(); paintWeights(); paintThresholds(); }));
  const onNet = () => paintStatus();
  window.addEventListener('online', onNet);
  window.addEventListener('offline', onNet);
  // Relative times ("2 minutes ago") and the format preview clock stay fresh while the page is visible.
  const tick = setInterval(() => { if (!document.hidden) { paintExample(); paintStatus(); } }, 30_000);

  return function cleanup() {
    offlineApi.destroy();
    subs.splice(0).forEach((off) => { try { off(); } catch { /* ignore */ } });
    if (dataTimer) { clearTimeout(dataTimer); dataTimer = null; }
    clearInterval(tick);
    window.removeEventListener('online', onNet);
    window.removeEventListener('offline', onNet);
    if (io) io.disconnect();
    for (const id of timers) clearTimeout(id);
    timers.clear();
  };
}

export const settingsView = {
  id: 'settings',
  code: 'SEC-11',
  get title() { return i18n.has('core.nav.settings.title') ? i18n.t('core.nav.settings.title') : 'الإعدادات'; },
  icon: 'sliders',
  render,
};

export default settingsView;
